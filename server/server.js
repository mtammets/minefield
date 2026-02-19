const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: true,
        methods: ['GET', 'POST'],
    },
});

const PORT = process.env.PORT || 3000;
const ROOM_CODE_LENGTH = 6;
const MAX_PLAYERS_PER_ROOM = 8;
const MAX_ACTIVE_ROOMS = 500;
const PLAYER_NAME_MAX_LENGTH = 18;
const STATE_UPDATE_MIN_INTERVAL_MS = 35;
const COLLISION_RELAY_MIN_INTERVAL_MS = 60;
const MAX_DETACHED_PART_IDS = 32;
const MAX_DEBRIS_PIECES = 64;
const MAX_ACTIVE_MINES_PER_ROOM = 220;
const MAX_ACTIVE_MINES_PER_PLAYER = 10;
const MINE_ID_MAX_LENGTH = 72;
const MINE_DEFAULT_TRIGGER_RADIUS = 1.5;
const MINE_DEFAULT_ARM_DELAY_MS = 650;
const MINE_DEFAULT_TTL_MS = 45_000;

const rooms = new Map();

app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/ping', (req, res) => {
    res.json({
        message: 'Server is running!',
        rooms: rooms.size,
    });
});

app.get('/api/room-code/:roomCode/availability', (req, res) => {
    const roomCode = sanitizeRoomCode(req.params?.roomCode);
    if (!roomCode) {
        res.status(400).json({
            ok: false,
            error: `Room code must be ${ROOM_CODE_LENGTH} letters or numbers.`,
        });
        return;
    }

    res.json({
        ok: true,
        roomCode,
        available: !rooms.has(roomCode),
    });
});

io.on('connection', (socket) => {
    socket.data.profile = createDefaultProfile(socket.id);
    socket.data.roomCode = null;
    socket.data.lastCollisionRelays = new Map();

    socket.on('mp:createRoom', (payload, ack) => {
        try {
            const profile = resolveProfile(payload?.profile, socket.data.profile, socket.id);
            socket.data.profile = profile;
            leaveCurrentRoom(socket);

            if (rooms.size >= MAX_ACTIVE_ROOMS) {
                safeAck(ack, {
                    ok: false,
                    error: 'Server room limit reached. Try again shortly.',
                });
                return;
            }

            const payloadRoomCodeRaw =
                typeof payload?.roomCode === 'string' ? payload.roomCode : undefined;
            const requestedRoomCode =
                payloadRoomCodeRaw == null ? '' : sanitizeRoomCode(payloadRoomCodeRaw);
            if (payloadRoomCodeRaw != null && !requestedRoomCode) {
                safeAck(ack, {
                    ok: false,
                    error: `Room code must be ${ROOM_CODE_LENGTH} letters or numbers.`,
                });
                return;
            }
            if (requestedRoomCode && rooms.has(requestedRoomCode)) {
                safeAck(ack, {
                    ok: false,
                    error: `Room ${requestedRoomCode} already exists.`,
                });
                return;
            }

            const roomCode = requestedRoomCode || generateRoomCode();
            if (!roomCode) {
                safeAck(ack, {
                    ok: false,
                    error: 'Could not allocate a room code. Try again.',
                });
                return;
            }

            const room = {
                code: roomCode,
                hostId: socket.id,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                players: new Map(),
                mines: new Map(),
            };
            room.players.set(socket.id, createRoomPlayer(socket.id, profile));
            rooms.set(roomCode, room);

            socket.join(roomCode);
            socket.data.roomCode = roomCode;

            emitRoomState(room);
            safeAck(ack, {
                ok: true,
                room: serializeRoom(room),
                selfId: socket.id,
            });
        } catch {
            safeAck(ack, {
                ok: false,
                error: 'Room creation failed due to a server error.',
            });
        }
    });

    socket.on('mp:joinRoom', (payload, ack) => {
        try {
            const roomCode = sanitizeRoomCode(payload?.roomCode);
            if (!roomCode) {
                safeAck(ack, {
                    ok: false,
                    error: 'Enter a valid room code.',
                });
                return;
            }

            const room = rooms.get(roomCode);
            if (!room) {
                safeAck(ack, {
                    ok: false,
                    error: `Room ${roomCode} does not exist.`,
                });
                return;
            }

            if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
                safeAck(ack, {
                    ok: false,
                    error: `Room ${roomCode} is full.`,
                });
                return;
            }

            const profile = resolveProfile(payload?.profile, socket.data.profile, socket.id);
            socket.data.profile = profile;
            leaveCurrentRoom(socket);

            room.players.set(socket.id, createRoomPlayer(socket.id, profile));
            room.updatedAt = Date.now();
            socket.join(roomCode);
            socket.data.roomCode = roomCode;

            emitRoomState(room);
            safeAck(ack, {
                ok: true,
                room: serializeRoom(room),
                selfId: socket.id,
            });
        } catch {
            safeAck(ack, {
                ok: false,
                error: 'Joining room failed due to a server error.',
            });
        }
    });

    socket.on('mp:leaveRoom', (payload, ack) => {
        const roomCode = socket.data.roomCode;
        leaveCurrentRoom(socket);
        safeAck(ack, {
            ok: true,
            roomCode,
        });
    });

    socket.on('mp:updateProfile', (payload) => {
        const profile = resolveProfile(payload, socket.data.profile, socket.id);
        socket.data.profile = profile;

        const roomCode = socket.data.roomCode;
        if (!roomCode) {
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.data.roomCode = null;
            return;
        }

        const player = room.players.get(socket.id);
        if (!player) {
            return;
        }

        player.name = profile.name;
        player.colorHex = profile.colorHex;
        room.updatedAt = Date.now();
        emitRoomState(room);
    });

    socket.on('mp:state', (payload) => {
        const roomCode = socket.data.roomCode;
        if (!roomCode) {
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.data.roomCode = null;
            return;
        }

        const player = room.players.get(socket.id);
        if (!player) {
            return;
        }

        const now = Date.now();
        pruneExpiredMines(room, now);
        if (now - player.lastInboundStateAt < STATE_UPDATE_MIN_INTERVAL_MS) {
            return;
        }

        const sanitizedState = sanitizePlayerState(payload, player.lastState);
        if (!sanitizedState) {
            return;
        }

        player.lastState = sanitizedState;
        player.lastStateAt = now;
        player.lastInboundStateAt = now;
        room.updatedAt = now;

        socket.to(roomCode).emit('mp:playerState', {
            id: socket.id,
            state: sanitizedState,
            serverTime: now,
        });
    });

    socket.on('mp:collision', (payload) => {
        const roomCode = socket.data.roomCode;
        if (!roomCode) {
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.data.roomCode = null;
            return;
        }

        const sourcePlayer = room.players.get(socket.id);
        if (!sourcePlayer) {
            return;
        }

        const relay = sanitizeCollisionRelay(payload);
        if (!relay) {
            return;
        }
        if (relay.targetId === socket.id || !room.players.has(relay.targetId)) {
            return;
        }

        const now = Date.now();
        const key = relay.targetId;
        const lastByTarget = socket.data.lastCollisionRelays;
        const lastAt = lastByTarget.get(key) || 0;
        if (now - lastAt < COLLISION_RELAY_MIN_INTERVAL_MS) {
            return;
        }
        lastByTarget.set(key, now);

        io.to(relay.targetId).emit('mp:collision', {
            sourcePlayerId: socket.id,
            normalX: relay.normalX,
            normalZ: relay.normalZ,
            penetration: relay.penetration,
            impactSpeed: relay.impactSpeed,
            otherVelocityX: relay.otherVelocityX,
            otherVelocityZ: relay.otherVelocityZ,
            mass: relay.mass,
            serverTime: now,
        });
    });

    socket.on('mp:minePlaced', (payload) => {
        const roomCode = socket.data.roomCode;
        if (!roomCode) {
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.data.roomCode = null;
            return;
        }

        const player = room.players.get(socket.id);
        if (!player) {
            return;
        }

        const now = Date.now();
        pruneExpiredMines(room, now);
        const mine = sanitizeMinePlacement(payload, {
            ownerId: socket.id,
            ownerName: player.name,
            now,
        });
        if (!mine) {
            return;
        }

        enforceMineLimits(room, mine.ownerId);
        room.mines.set(mine.id, mine);
        room.updatedAt = now;
        io.to(roomCode).emit('mp:minePlaced', {
            ...serializeMine(mine),
            serverTime: now,
        });
    });

    socket.on('mp:mineDetonated', (payload) => {
        const roomCode = socket.data.roomCode;
        if (!roomCode) {
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.data.roomCode = null;
            return;
        }

        const player = room.players.get(socket.id);
        if (!player) {
            return;
        }

        const now = Date.now();
        pruneExpiredMines(room, now);
        const detonation = sanitizeMineDetonation(payload, now);
        if (!detonation) {
            return;
        }

        const mine = room.mines.get(detonation.mineId);
        if (!mine) {
            return;
        }

        room.mines.delete(mine.id);
        room.updatedAt = now;
        io.to(roomCode).emit('mp:mineDetonated', {
            mineId: mine.id,
            ownerId: mine.ownerId,
            ownerName: mine.ownerName,
            x: roundTo(clampFinite(detonation.x, -5000, 5000, mine.x), 4),
            y: roundTo(clampFinite(detonation.y, -500, 2500, mine.y), 4),
            z: roundTo(clampFinite(detonation.z, -5000, 5000, mine.z), 4),
            triggerPlayerId: sanitizeOptionalRoomPlayerId(
                detonation.triggerPlayerId,
                room,
                socket.id
            ),
            targetPlayerId: sanitizeOptionalRoomPlayerId(detonation.targetPlayerId, room, ''),
            serverTime: now,
        });
    });

    socket.on('disconnect', () => {
        leaveCurrentRoom(socket);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

function safeAck(ack, payload) {
    if (typeof ack === 'function') {
        ack(payload);
    }
}

function createRoomPlayer(id, profile) {
    return {
        id,
        name: profile.name,
        colorHex: profile.colorHex,
        joinedAt: Date.now(),
        lastState: null,
        lastStateAt: 0,
        lastInboundStateAt: 0,
    };
}

function serializeRoom(room) {
    pruneExpiredMines(room, Date.now());
    const mineMap = room?.mines instanceof Map ? room.mines : new Map();
    const players = Array.from(room.players.values())
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((player) => ({
            id: player.id,
            name: player.name,
            colorHex: player.colorHex,
            isHost: player.id === room.hostId,
            state: player.lastState,
            stateUpdatedAt: player.lastStateAt,
        }));

    return {
        roomCode: room.code,
        hostId: room.hostId,
        playerCount: players.length,
        maxPlayers: MAX_PLAYERS_PER_ROOM,
        players,
        mines: Array.from(mineMap.values())
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((mine) => serializeMine(mine))
            .filter(Boolean),
    };
}

function emitRoomState(room) {
    io.to(room.code).emit('mp:roomState', serializeRoom(room));
}

function leaveCurrentRoom(socket) {
    const roomCode = socket.data.roomCode;
    if (!roomCode) {
        return;
    }

    socket.data.roomCode = null;
    socket.leave(roomCode);

    const room = rooms.get(roomCode);
    if (!room) {
        return;
    }

    room.players.delete(socket.id);
    if (room.mines?.size) {
        for (const [mineId, mine] of room.mines.entries()) {
            if (mine?.ownerId === socket.id) {
                room.mines.delete(mineId);
            }
        }
    }
    room.updatedAt = Date.now();

    if (room.players.size === 0) {
        rooms.delete(roomCode);
        return;
    }

    if (room.hostId === socket.id) {
        room.hostId = room.players.keys().next().value;
    }

    emitRoomState(room);
}

function generateRoomCode() {
    for (let i = 0; i < 64; i += 1) {
        const value = Math.floor(Math.random() * 36 ** ROOM_CODE_LENGTH)
            .toString(36)
            .toUpperCase()
            .padStart(ROOM_CODE_LENGTH, '0');
        if (!rooms.has(value)) {
            return value;
        }
    }
    return null;
}

function createDefaultProfile(socketId) {
    const shortId = String(socketId || '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(-4)
        .toUpperCase()
        .padStart(4, '0');

    return {
        name: `Player-${shortId}`,
        colorHex: 0x2d67a6,
    };
}

function resolveProfile(input, fallback, socketId) {
    const defaultProfile = fallback || createDefaultProfile(socketId);
    return {
        name: sanitizePlayerName(input?.name, defaultProfile.name),
        colorHex: sanitizeColorHex(input?.colorHex, defaultProfile.colorHex),
    };
}

function sanitizePlayerName(value, fallbackName) {
    if (typeof value !== 'string') {
        return fallbackName;
    }

    const normalized = value
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
        .slice(0, PLAYER_NAME_MAX_LENGTH);

    return normalized || fallbackName;
}

function sanitizeColorHex(value, fallbackColor) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallbackColor >>> 0;
    }

    return Math.max(0, Math.min(0xffffff, Math.round(numeric))) >>> 0;
}

function sanitizeRoomCode(value) {
    if (typeof value !== 'string') {
        return '';
    }

    const normalized = value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
    if (normalized.length !== ROOM_CODE_LENGTH) {
        return '';
    }
    return normalized;
}

function sanitizePlayerState(payload, fallback) {
    const x = clampFinite(payload?.x, -5000, 5000, fallback?.x ?? 0);
    const y = clampFinite(payload?.y, -200, 1200, fallback?.y ?? 0);
    const z = clampFinite(payload?.z, -5000, 5000, fallback?.z ?? 0);
    const fallbackRotationY = Number.isFinite(fallback?.rotationY) ? fallback.rotationY : 0;
    const rotationY = normalizeAngle(
        clampFinite(payload?.rotationY, -Math.PI * 64, Math.PI * 64, fallbackRotationY)
    );
    const speed = clampFinite(payload?.speed, -320, 320, 0);
    const steerInput = clampFinite(payload?.steerInput, -1, 1, fallback?.steerInput ?? 0);
    const throttle = clampFinite(payload?.throttle, 0, 1, fallback?.throttle ?? 0);
    const brake = clampFinite(payload?.brake, 0, 1, fallback?.brake ?? 0);
    const burnout = clampFinite(payload?.burnout, 0, 1, fallback?.burnout ?? 0);
    const yawRate = clampFinite(payload?.yawRate, -24, 24, fallback?.yawRate ?? 0);
    const velocityX = clampFinite(payload?.velocityX, -400, 400, fallback?.velocityX ?? 0);
    const velocityZ = clampFinite(payload?.velocityZ, -400, 400, fallback?.velocityZ ?? 0);
    const collectedCount = clampFinite(payload?.collectedCount, 0, 9999, 0);
    const isDestroyed = Boolean(payload?.isDestroyed);
    const inputForward = Boolean(payload?.inputForward);
    const inputBackward = Boolean(payload?.inputBackward);
    const inputLeft = Boolean(payload?.inputLeft);
    const inputRight = Boolean(payload?.inputRight);
    const inputHandbrake = Boolean(payload?.inputHandbrake);
    const crashReplication = sanitizeCrashReplication(
        payload?.crashReplication,
        fallback?.crashReplication
    );

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return null;
    }

    return {
        x: roundTo(x, 4),
        y: roundTo(y, 4),
        z: roundTo(z, 4),
        rotationY: roundTo(rotationY, 4),
        speed: roundTo(speed, 3),
        steerInput: roundTo(steerInput, 4),
        throttle: roundTo(throttle, 4),
        brake: roundTo(brake, 4),
        burnout: roundTo(burnout, 4),
        yawRate: roundTo(yawRate, 4),
        velocityX: roundTo(velocityX, 4),
        velocityZ: roundTo(velocityZ, 4),
        inputForward,
        inputBackward,
        inputLeft,
        inputRight,
        inputHandbrake,
        crashReplication,
        collectedCount: Math.round(collectedCount),
        isDestroyed,
    };
}

function sanitizeCollisionRelay(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const targetId =
        typeof payload.targetId === 'string'
            ? payload.targetId
                  .trim()
                  .replace(/[^\w\-]/g, '')
                  .slice(0, 128)
            : '';
    if (!targetId) {
        return null;
    }

    let normalX = Number(payload.normalX);
    let normalZ = Number(payload.normalZ);
    if (!Number.isFinite(normalX) || !Number.isFinite(normalZ)) {
        return null;
    }
    const normalLength = Math.hypot(normalX, normalZ);
    if (normalLength < 0.0001) {
        return null;
    }
    normalX /= normalLength;
    normalZ /= normalLength;

    const impactSpeed = clampFinite(payload.impactSpeed, 0, 90, 0);
    if (impactSpeed <= 0.01) {
        return null;
    }

    return {
        targetId,
        normalX: roundTo(normalX, 5),
        normalZ: roundTo(normalZ, 5),
        penetration: roundTo(clampFinite(payload.penetration, 0, 1.8, 0.04), 4),
        impactSpeed: roundTo(impactSpeed, 4),
        otherVelocityX: roundTo(clampFinite(payload.otherVelocityX, -400, 400, 0), 4),
        otherVelocityZ: roundTo(clampFinite(payload.otherVelocityZ, -400, 400, 0), 4),
        mass: roundTo(clampFinite(payload.mass, 0.4, 4, 1.6), 4),
    };
}

function sanitizeMinePlacement(payload, context) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const ownerId = sanitizeSocketLikeId(context?.ownerId);
    if (!ownerId) {
        return null;
    }

    const now = clampFinite(context?.now, 0, Number.MAX_SAFE_INTEGER, Date.now());
    const mineId =
        sanitizeMineId(payload.mineId) ||
        `${ownerId}-${now.toString(36)}-${Math.floor(Math.random() * 1296)
            .toString(36)
            .padStart(2, '0')}`;
    const triggerRadius = clampFinite(payload.triggerRadius, 0.8, 4, MINE_DEFAULT_TRIGGER_RADIUS);
    const armDelayMs = Math.round(
        clampFinite(payload.armDelayMs, 0, 4000, MINE_DEFAULT_ARM_DELAY_MS)
    );
    const ttlMs = Math.round(clampFinite(payload.ttlMs, 4000, 120000, MINE_DEFAULT_TTL_MS));

    return {
        id: mineId,
        ownerId,
        ownerName: sanitizePlayerName(context?.ownerName, 'Driver'),
        x: roundTo(clampFinite(payload.x, -5000, 5000, 0), 4),
        y: roundTo(clampFinite(payload.y, -500, 2500, 0), 4),
        z: roundTo(clampFinite(payload.z, -5000, 5000, 0), 4),
        velocityX: roundTo(clampFinite(payload.velocityX, -140, 140, 0), 4),
        velocityY: roundTo(clampFinite(payload.velocityY, -140, 140, 0), 4),
        velocityZ: roundTo(clampFinite(payload.velocityZ, -140, 140, 0), 4),
        triggerRadius: roundTo(triggerRadius, 4),
        armDelayMs,
        ttlMs,
        thrown: Boolean(payload.thrown),
        createdAt: now,
        armedAt: now + armDelayMs,
        expiresAt: now + ttlMs,
    };
}

function sanitizeMineDetonation(payload, now = Date.now()) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const mineId = sanitizeMineId(payload.mineId);
    if (!mineId) {
        return null;
    }

    return {
        mineId,
        x: clampFinite(payload.x, -5000, 5000, 0),
        y: clampFinite(payload.y, -500, 2500, 0),
        z: clampFinite(payload.z, -5000, 5000, 0),
        triggerPlayerId: sanitizeSocketLikeId(payload.triggerPlayerId),
        targetPlayerId: sanitizeSocketLikeId(payload.targetPlayerId),
        serverTime: now,
    };
}

function sanitizeMineId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .trim()
        .replace(/[^\w\-]/g, '')
        .slice(0, MINE_ID_MAX_LENGTH);
}

function sanitizeSocketLikeId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .trim()
        .replace(/[^\w\-]/g, '')
        .slice(0, 128);
}

function sanitizeOptionalRoomPlayerId(value, room, fallback) {
    const sanitized = sanitizeSocketLikeId(value);
    if (!sanitized) {
        return fallback || '';
    }
    if (!room?.players?.has?.(sanitized)) {
        return fallback || '';
    }
    return sanitized;
}

function serializeMine(mine) {
    if (!mine || typeof mine !== 'object') {
        return null;
    }
    return {
        mineId: mine.id,
        ownerId: mine.ownerId,
        ownerName: mine.ownerName,
        x: mine.x,
        y: mine.y,
        z: mine.z,
        velocityX: mine.velocityX,
        velocityY: mine.velocityY,
        velocityZ: mine.velocityZ,
        triggerRadius: mine.triggerRadius,
        armDelayMs: mine.armDelayMs,
        ttlMs: mine.ttlMs,
        thrown: Boolean(mine.thrown),
        createdAt: mine.createdAt,
        armedAt: mine.armedAt,
        expiresAt: mine.expiresAt,
    };
}

function pruneExpiredMines(room, now = Date.now()) {
    if (!room?.mines?.size) {
        return;
    }
    for (const [mineId, mine] of room.mines.entries()) {
        if (!mine || mine.expiresAt <= now) {
            room.mines.delete(mineId);
        }
    }
}

function enforceMineLimits(room, ownerId) {
    if (!room?.mines) {
        return;
    }

    pruneExpiredMines(room, Date.now());

    const ownerMines = Array.from(room.mines.values())
        .filter((mine) => mine.ownerId === ownerId)
        .sort((a, b) => a.createdAt - b.createdAt);
    while (ownerMines.length >= MAX_ACTIVE_MINES_PER_PLAYER) {
        const oldest = ownerMines.shift();
        if (!oldest) {
            break;
        }
        room.mines.delete(oldest.id);
    }

    const allMines = Array.from(room.mines.values()).sort((a, b) => a.createdAt - b.createdAt);
    while (allMines.length >= MAX_ACTIVE_MINES_PER_ROOM) {
        const oldest = allMines.shift();
        if (!oldest) {
            break;
        }
        room.mines.delete(oldest.id);
    }
}

function sanitizeCrashReplication(value, fallback) {
    const source = value && typeof value === 'object' ? value : fallback;
    if (!source || typeof source !== 'object') {
        return {
            detachedPartIds: [],
            debrisPieces: [],
            explosion: null,
        };
    }

    const detachedRaw = Array.isArray(source.detachedPartIds) ? source.detachedPartIds : [];
    const detachedPartIds = detachedRaw
        .slice(0, MAX_DETACHED_PART_IDS)
        .map((partId) =>
            String(partId || '')
                .trim()
                .slice(0, 64)
        )
        .filter(Boolean);

    const debrisRaw = Array.isArray(source.debrisPieces) ? source.debrisPieces : [];
    const debrisPieces = [];
    for (let i = 0; i < debrisRaw.length && debrisPieces.length < MAX_DEBRIS_PIECES; i += 1) {
        const piece = sanitizeDebrisPiece(debrisRaw[i]);
        if (piece) {
            debrisPieces.push(piece);
        }
    }

    return {
        detachedPartIds,
        debrisPieces,
        explosion: sanitizeExplosionState(source.explosion),
    };
}

function sanitizeDebrisPiece(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const id = Math.max(1, Math.round(clampFinite(value.id, 1, 10_000_000, 0)));
    const partId = String(value.partId || '')
        .trim()
        .slice(0, 64);
    if (!id || !partId) {
        return null;
    }

    return {
        id,
        partId,
        x: roundTo(clampFinite(value.x, -5000, 5000, 0), 4),
        y: roundTo(clampFinite(value.y, -500, 2500, 0), 4),
        z: roundTo(clampFinite(value.z, -5000, 5000, 0), 4),
        rotationX: roundTo(clampFinite(value.rotationX, -Math.PI * 8, Math.PI * 8, 0), 4),
        rotationY: roundTo(clampFinite(value.rotationY, -Math.PI * 8, Math.PI * 8, 0), 4),
        rotationZ: roundTo(clampFinite(value.rotationZ, -Math.PI * 8, Math.PI * 8, 0), 4),
        velocityX: roundTo(clampFinite(value.velocityX, -600, 600, 0), 4),
        velocityY: roundTo(clampFinite(value.velocityY, -600, 600, 0), 4),
        velocityZ: roundTo(clampFinite(value.velocityZ, -600, 600, 0), 4),
        angularVelocityX: roundTo(clampFinite(value.angularVelocityX, -80, 80, 0), 4),
        angularVelocityY: roundTo(clampFinite(value.angularVelocityY, -80, 80, 0), 4),
        angularVelocityZ: roundTo(clampFinite(value.angularVelocityZ, -80, 80, 0), 4),
        groundOffset: roundTo(clampFinite(value.groundOffset, 0.01, 4, 0.1), 4),
        drag: roundTo(clampFinite(value.drag, 0, 50, 0), 4),
        bounce: roundTo(clampFinite(value.bounce, 0, 4, 0.3), 4),
        settled: Boolean(value.settled),
        life: Number.isFinite(value.life) ? roundTo(clampFinite(value.life, 0, 120, 0), 4) : null,
        wheelRoll: sanitizeWheelRollState(value.wheelRoll),
        bodyRest: sanitizeBodyRestState(value.bodyRest),
    };
}

function sanitizeWheelRollState(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return {
        drive: roundTo(clampFinite(value.drive, 0, 20, 0), 4),
        heading: roundTo(clampFinite(value.heading, -Math.PI * 16, Math.PI * 16, 0), 4),
        turnRate: roundTo(clampFinite(value.turnRate, -40, 40, 0), 4),
        wobblePhase: roundTo(clampFinite(value.wobblePhase, -Math.PI * 16, Math.PI * 16, 0), 4),
        wobbleRate: roundTo(clampFinite(value.wobbleRate, 0, 80, 0), 4),
        decel: roundTo(clampFinite(value.decel, 0, 40, 0), 4),
        spin: roundTo(clampFinite(value.spin, 0, 120, 0), 4),
        restPose: value.restPose === 'flat' ? 'flat' : 'upright',
        restYaw: roundTo(clampFinite(value.restYaw, -Math.PI * 16, Math.PI * 16, 0), 4),
    };
}

function sanitizeBodyRestState(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return {
        yaw: roundTo(clampFinite(value.yaw, -Math.PI * 16, Math.PI * 16, 0), 4),
    };
}

function sanitizeExplosionState(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return {
        x: roundTo(clampFinite(value.x, -5000, 5000, 0), 4),
        y: roundTo(clampFinite(value.y, -500, 2500, 0), 4),
        z: roundTo(clampFinite(value.z, -5000, 5000, 0), 4),
        life: roundTo(clampFinite(value.life, 0, 2, 0), 4),
    };
}

function clampFinite(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, numeric));
}

function roundTo(value, decimals) {
    const power = 10 ** decimals;
    return Math.round(value * power) / power;
}

function normalizeAngle(value) {
    const fullTurn = Math.PI * 2;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return ((((numeric + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
}
