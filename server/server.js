require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const http = require('http');
const os = require('os');
const path = require('path');
const Stripe = require('stripe');
const { Server } = require('socket.io');
const { consumeRateLimit } = require('./rate-limit');
const { validateCollisionRelay } = require('./collision-guard');
const { resolveAuthoritativeMineDetonation } = require('./mine-guard');
const {
    validatePickupCollection,
    markPickupCollected,
    pruneCollectedPickupHistory,
} = require('./pickup-guard');
const {
    ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT,
    createRoomRoundState,
    applyPlayerPickupScore,
    applyPlayerMineKillScore,
    recalculateRoomRoundStateFromPlayers,
    serializeRoomRoundState,
} = require('./room-round-state');

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
const MINE_SERVER_PLACE_COOLDOWN_MS = 450;
const CRASH_REPLICATION_MIN_INTERVAL_MS = 180;
const VEHICLE_STATUS_MIN_INTERVAL_MS = 140;
const PICKUP_STATE_MAX_DISTANCE = 4.6;
const PLAYER_STATE_MAX_HORIZONTAL_SPEED_UNITS_PER_SEC = 82;
const PLAYER_STATE_MAX_VERTICAL_SPEED_UNITS_PER_SEC = 145;
const PLAYER_STATE_HORIZONTAL_LEEWAY = 2.4;
const PLAYER_STATE_VERTICAL_LEEWAY = 3.5;
const PLAYER_STATE_MAX_INTERVAL_MS = 1400;
const PLAYER_RESPAWN_SNAP_MIN_DESTROYED_MS = 1300;
const PLAYER_RESPAWN_SNAP_WINDOW_MS = 1800;
const PLAYER_RESPAWN_MAX_SNAP_DISTANCE = 320;
const MINE_ID_RANDOM_BYTES = 4;

const GLOBAL_RATE_WINDOW_MS = 1000;
const GLOBAL_RATE_MAX_EVENTS = 150;
const IP_RATE_WINDOW_MS = 1000;
const IP_RATE_MAX_EVENTS = 300;
const IP_RATE_RULE_MULTIPLIER = 1.7;
const IP_RATE_STORE_TTL_MS = 10 * 60 * 1000;
const IP_RATE_STORE_PRUNE_INTERVAL_MS = 30_000;
const DONATE_MIN_AMOUNT_CENTS = 100;
const DONATE_MAX_AMOUNT_CENTS = 100_000;
const DONATE_AMOUNT_STEP_CENTS = 100;
const DONATE_CURRENCY = sanitizeCurrencyCode(process.env.STRIPE_DONATE_CURRENCY || 'eur', 'eur');
const DONATE_PRODUCT_NAME = sanitizeCheckoutText(
    process.env.STRIPE_DONATE_PRODUCT_NAME || 'Support Minefield Drift'
);
const DONATE_PUBLIC_BASE_URL = sanitizeHttpOrigin(process.env.STRIPE_DONATE_BASE_URL || '');
const STRIPE_SECRET_KEY = sanitizeStripeSecretKey(process.env.STRIPE_SECRET_KEY || '');
const stripeClient = createStripeClient(STRIPE_SECRET_KEY);

const SOCKET_ALLOWED_ORIGINS = parseAllowedOriginList(
    process.env.SOCKET_ALLOWED_ORIGINS || process.env.CORS_ALLOWED_ORIGINS || ''
);
const HTTP_CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
].join('; ');
const HTTP_PERMISSIONS_POLICY = [
    'accelerometer=()',
    'camera=()',
    'geolocation=()',
    'gyroscope=()',
    'magnetometer=()',
    'microphone=()',
    'payment=()',
    'usb=()',
].join(', ');
const HTTP_STRICT_TRANSPORT_SECURITY = 'max-age=31536000; includeSubDomains';

const EVENT_RATE_LIMITS = {
    'mp:createRoom': { windowMs: 10_000, max: 8 },
    'mp:joinRoom': { windowMs: 10_000, max: 10 },
    'mp:leaveRoom': { windowMs: 5_000, max: 10 },
    'mp:updateProfile': { windowMs: 10_000, max: 25 },
    'mp:state': { windowMs: 1000, max: 40 },
    'mp:collision': { windowMs: 1000, max: 18 },
    'mp:minePlaced': { windowMs: 1000, max: 8 },
    'mp:mineDetonated': { windowMs: 1000, max: 12 },
    'mp:pickupCollected': { windowMs: 1000, max: 10 },
    'mp:crashReplication': { windowMs: 1000, max: 8 },
    'mp:vehicleStatus': { windowMs: 1000, max: 12 },
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: resolveSocketCorsOrigin,
        methods: ['GET', 'POST'],
    },
});

const rooms = new Map();
const ipRateLimitStore = new Map();
let lastIpRateStorePruneAt = 0;

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', HTTP_PERMISSIONS_POLICY);
    res.setHeader('Strict-Transport-Security', HTTP_STRICT_TRANSPORT_SECURITY);
    res.setHeader('Content-Security-Policy', HTTP_CONTENT_SECURITY_POLICY);
    next();
});
app.use(express.json({ limit: '16kb' }));
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

app.post('/api/donate/checkout-session', async (req, res) => {
    if (!stripeClient) {
        res.status(503).json({
            ok: false,
            error: 'Donations are not configured on this server.',
        });
        return;
    }

    const amountCents = sanitizeDonationAmountCents(req.body?.amountCents);
    if (!Number.isFinite(amountCents)) {
        res.status(400).json({
            ok: false,
            error: `Amount must be between ${DONATE_MIN_AMOUNT_CENTS / 100} and ${DONATE_MAX_AMOUNT_CENTS / 100}.`,
        });
        return;
    }

    const checkoutBaseUrl = resolveDonateBaseUrl(req);
    const successUrl = createDonateReturnUrl(checkoutBaseUrl, 'success');
    const cancelUrl = createDonateReturnUrl(checkoutBaseUrl, 'cancel');
    if (!successUrl || !cancelUrl) {
        res.status(500).json({
            ok: false,
            error: 'Could not determine checkout return URL.',
        });
        return;
    }

    try {
        const checkoutSession = await stripeClient.checkout.sessions.create({
            mode: 'payment',
            submit_type: 'donate',
            locale: 'en',
            payment_method_types: ['card'],
            line_items: [
                {
                    quantity: 1,
                    price_data: {
                        currency: DONATE_CURRENCY,
                        unit_amount: amountCents,
                        product_data: {
                            name: DONATE_PRODUCT_NAME,
                        },
                    },
                },
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
        });
        if (typeof checkoutSession?.url !== 'string' || !checkoutSession.url) {
            throw new Error('Stripe did not return a checkout URL.');
        }

        res.status(201).json({
            ok: true,
            checkoutUrl: checkoutSession.url,
        });
    } catch (error) {
        console.error('Stripe checkout session creation failed:', error);
        res.status(502).json({
            ok: false,
            error: 'Could not start secure checkout. Try again.',
        });
    }
});

io.on('connection', (socket) => {
    socket.data.profile = createDefaultProfile(socket.id);
    socket.data.roomCode = null;
    socket.data.lastCollisionRelays = new Map();
    socket.data.rateLimitStore = new Map();

    socket.on('mp:createRoom', (payload, ack) => {
        if (!consumeInboundEventQuota(socket, 'mp:createRoom')) {
            safeAck(ack, {
                ok: false,
                error: 'Too many requests. Slow down and try again.',
            });
            return;
        }
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
                collectedPickupIds: new Map(),
                roundState: createRoomRoundState(ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT),
            };
            room.players.set(socket.id, createRoomPlayer(socket.id, profile));
            recalculateRoomRoundStateFromPlayers(room.roundState, room.players);
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
        if (!consumeInboundEventQuota(socket, 'mp:joinRoom')) {
            safeAck(ack, {
                ok: false,
                error: 'Too many requests. Slow down and try again.',
            });
            return;
        }
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
            room.roundState =
                room.roundState && typeof room.roundState === 'object'
                    ? room.roundState
                    : createRoomRoundState(ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT);
            recalculateRoomRoundStateFromPlayers(room.roundState, room.players);
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
        if (!consumeInboundEventQuota(socket, 'mp:leaveRoom')) {
            safeAck(ack, {
                ok: false,
                error: 'Too many requests. Slow down and try again.',
            });
            return;
        }
        const roomCode = socket.data.roomCode;
        leaveCurrentRoom(socket);
        safeAck(ack, {
            ok: true,
            roomCode,
        });
    });

    socket.on('mp:updateProfile', (payload) => {
        if (!consumeInboundEventQuota(socket, 'mp:updateProfile')) {
            return;
        }
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
        if (!consumeInboundEventQuota(socket, 'mp:state')) {
            return;
        }
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
        const transitionValidation = validateStateTransition({
            previousState: player.lastState,
            previousStateAt: player.lastStateAt,
            nextState: sanitizedState,
            nowMs: now,
            allowSnapUntil: player.allowStateSnapUntil,
        });
        if (!transitionValidation.ok) {
            return;
        }
        if (transitionValidation.usedSnap) {
            player.allowStateSnapUntil = 0;
        }
        sanitizedState.collectedCount = Math.max(0, Math.round(Number(player.collectedCount) || 0));
        sanitizedState.score = Math.max(0, Math.round(Number(player.score) || 0));
        sanitizedState.isDestroyed = Boolean(player.isDestroyed);

        player.previousState = player.lastState;
        player.previousStateAt = player.lastStateAt;
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
        if (!consumeInboundEventQuota(socket, 'mp:collision')) {
            return;
        }
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
        if (relay.targetId === socket.id) {
            return;
        }
        const targetPlayer = room.players.get(relay.targetId);
        if (!targetPlayer) {
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

        const validatedRelay = validateCollisionRelay({
            relay,
            sourceState: sourcePlayer.lastState,
            sourceStateAt: sourcePlayer.lastStateAt,
            targetState: targetPlayer.lastState,
            targetStateAt: targetPlayer.lastStateAt,
            nowMs: now,
        });
        if (!validatedRelay.ok) {
            return;
        }

        io.to(relay.targetId).emit('mp:collision', {
            sourcePlayerId: socket.id,
            normalX: validatedRelay.relay.normalX,
            normalZ: validatedRelay.relay.normalZ,
            penetration: validatedRelay.relay.penetration,
            impactSpeed: validatedRelay.relay.impactSpeed,
            otherVelocityX: validatedRelay.relay.otherVelocityX,
            otherVelocityZ: validatedRelay.relay.otherVelocityZ,
            mass: validatedRelay.relay.mass,
            serverTime: now,
        });
    });

    socket.on('mp:minePlaced', (payload) => {
        if (!consumeInboundEventQuota(socket, 'mp:minePlaced')) {
            return;
        }
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
        if (now - (player.lastMinePlacedAt || 0) < MINE_SERVER_PLACE_COOLDOWN_MS) {
            return;
        }
        pruneExpiredMines(room, now);
        const mine = sanitizeMinePlacement(payload, {
            room,
            ownerId: socket.id,
            ownerName: player.name,
            now,
        });
        if (!mine) {
            return;
        }
        if (room.mines.has(mine.id)) {
            mine.id = generateServerMineId(mine.ownerId, now);
        }

        enforceMineLimits(room, mine.ownerId);
        room.mines.set(mine.id, mine);
        player.lastMinePlacedAt = now;
        room.updatedAt = now;
        io.to(roomCode).emit('mp:minePlaced', {
            ...serializeMine(mine),
            serverTime: now,
        });
    });

    socket.on('mp:mineDetonated', (payload) => {
        if (!consumeInboundEventQuota(socket, 'mp:mineDetonated')) {
            return;
        }
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

        const resolvedDetonation = resolveAuthoritativeMineDetonation({
            room,
            mine,
            reportingPlayerId: socket.id,
            detonation,
            nowMs: now,
        });
        if (!resolvedDetonation.ok) {
            return;
        }

        const detonationOwnerId = sanitizeSocketLikeId(resolvedDetonation.detonation.ownerId);
        const detonationTargetPlayerId = sanitizeSocketLikeId(
            resolvedDetonation.detonation.targetPlayerId
        );
        const mineScoreApplied =
            detonationOwnerId &&
            detonationTargetPlayerId &&
            detonationOwnerId !== detonationTargetPlayerId
                ? applyPlayerMineKillScore({
                      room,
                      ownerPlayerId: detonationOwnerId,
                      targetPlayerId: detonationTargetPlayerId,
                      nowMs: now,
                  })
                : null;

        room.mines.delete(mine.id);
        room.updatedAt = now;
        io.to(roomCode).emit('mp:mineDetonated', {
            mineId: resolvedDetonation.detonation.mineId,
            ownerId: resolvedDetonation.detonation.ownerId,
            ownerName: resolvedDetonation.detonation.ownerName,
            x: roundTo(clampFinite(resolvedDetonation.detonation.x, -5000, 5000, mine.x), 4),
            y: roundTo(clampFinite(resolvedDetonation.detonation.y, -500, 2500, mine.y), 4),
            z: roundTo(clampFinite(resolvedDetonation.detonation.z, -5000, 5000, mine.z), 4),
            triggerPlayerId: resolvedDetonation.detonation.triggerPlayerId,
            targetPlayerId: resolvedDetonation.detonation.targetPlayerId,
            ownerPointsAwarded: mineScoreApplied?.ok
                ? Math.max(0, Math.round(Number(mineScoreApplied.pointsAwarded) || 0))
                : 0,
            ownerScore: mineScoreApplied?.ok
                ? Math.max(0, Math.round(Number(mineScoreApplied.ownerScore) || 0))
                : Math.max(0, Math.round(Number(room.players.get(detonationOwnerId)?.score) || 0)),
            ownerScoring:
                mineScoreApplied?.ok && mineScoreApplied.scoring
                    ? {
                          chainCount: Math.max(
                              1,
                              Math.round(Number(mineScoreApplied.scoring.chainCount) || 1)
                          ),
                          chainMultiplier: clampFinite(
                              mineScoreApplied.scoring.chainMultiplier,
                              1,
                              5,
                              1
                          ),
                          endgameBonus: clampFinite(mineScoreApplied.scoring.endgameBonus, 0, 1, 0),
                          antiFarmMultiplier: clampFinite(
                              mineScoreApplied.scoring.antiFarmMultiplier,
                              0,
                              1,
                              1
                          ),
                          repeatedTarget: Boolean(mineScoreApplied.scoring.repeatedTarget),
                          roundProgress: clampFinite(
                              mineScoreApplied.scoring.roundProgress,
                              0,
                              1,
                              0
                          ),
                      }
                    : null,
            serverTime: now,
        });
        if (mineScoreApplied?.ok) {
            emitRoomState(room);
        }
    });

    socket.on('mp:pickupCollected', (payload, ack) => {
        if (!consumeInboundEventQuota(socket, 'mp:pickupCollected')) {
            safeAck(ack, {
                ok: false,
                error: 'Rate limited',
            });
            return;
        }

        const roomCode = socket.data.roomCode;
        if (!roomCode) {
            safeAck(ack, {
                ok: false,
                error: 'Not in room',
            });
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.data.roomCode = null;
            safeAck(ack, {
                ok: false,
                error: 'Room missing',
            });
            return;
        }

        const player = room.players.get(socket.id);
        if (!player) {
            safeAck(ack, {
                ok: false,
                error: 'Player missing',
            });
            return;
        }

        const now = Date.now();
        pruneCollectedPickupHistory(room, now);
        const pickupValidation = validatePickupCollection({
            room,
            playerId: socket.id,
            payload,
            nowMs: now,
            maxPlayerDistance: PICKUP_STATE_MAX_DISTANCE,
        });
        if (!pickupValidation.ok) {
            safeAck(ack, {
                ok: false,
                error: pickupValidation.reason,
                roundState: serializeRoomRoundState(room.roundState),
                playerCollectedCount: Math.max(0, Math.round(Number(player.collectedCount) || 0)),
                playerScore: Math.max(0, Math.round(Number(player.score) || 0)),
            });
            return;
        }
        const scoreApplied = applyPlayerPickupScore({
            room,
            playerId: socket.id,
            nowMs: now,
        });
        if (!scoreApplied.ok) {
            safeAck(ack, {
                ok: false,
                error: scoreApplied.reason,
                roundState: serializeRoomRoundState(room.roundState),
                playerCollectedCount: Math.max(0, Math.round(Number(player.collectedCount) || 0)),
                playerScore: Math.max(0, Math.round(Number(player.score) || 0)),
            });
            return;
        }

        markPickupCollected(room, pickupValidation.pickupId, now);
        room.updatedAt = now;
        emitRoomState(room);
        safeAck(ack, {
            ok: true,
            playerCollectedCount: Math.max(0, Math.round(Number(player.collectedCount) || 0)),
            playerScore: Math.max(0, Math.round(Number(player.score) || 0)),
            pointsAwarded: Math.max(0, Math.round(Number(scoreApplied.pointsAwarded) || 0)),
            scoring:
                scoreApplied.scoring && typeof scoreApplied.scoring === 'object'
                    ? {
                          comboCount: Math.max(
                              1,
                              Math.round(Number(scoreApplied.scoring.comboCount) || 1)
                          ),
                          comboMultiplier: clampFinite(
                              scoreApplied.scoring.comboMultiplier,
                              1,
                              4,
                              1
                          ),
                          riskBonus: clampFinite(scoreApplied.scoring.riskBonus, 0, 1, 0),
                          endgameBonus: clampFinite(scoreApplied.scoring.endgameBonus, 0, 1, 0),
                          speedKph: clampFinite(scoreApplied.scoring.speedKph, 0, 400, 0),
                          roundProgress: clampFinite(scoreApplied.scoring.roundProgress, 0, 1, 0),
                      }
                    : null,
            roundState: serializeRoomRoundState(room.roundState),
        });
    });

    socket.on('mp:crashReplication', (payload) => {
        if (!consumeInboundEventQuota(socket, 'mp:crashReplication')) {
            return;
        }

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
        if (now - (player.lastCrashReplicationAt || 0) < CRASH_REPLICATION_MIN_INTERVAL_MS) {
            return;
        }

        const snapshot = sanitizeCrashReplication(payload, player.lastCrashReplication);
        player.lastCrashReplication = snapshot;
        player.lastCrashReplicationAt = now;
        room.updatedAt = now;
        socket.to(roomCode).emit('mp:crashReplication', {
            id: socket.id,
            crashReplication: snapshot,
            serverTime: now,
        });
    });

    socket.on('mp:vehicleStatus', (payload) => {
        if (!consumeInboundEventQuota(socket, 'mp:vehicleStatus')) {
            return;
        }

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
        if (now - (player.lastVehicleStatusAt || 0) < VEHICLE_STATUS_MIN_INTERVAL_MS) {
            return;
        }
        player.lastVehicleStatusAt = now;

        const nextDestroyed = Boolean(payload?.isDestroyed);
        if (nextDestroyed === Boolean(player.isDestroyed)) {
            return;
        }
        if (nextDestroyed) {
            player.scoreComboCount = 0;
            player.lastScoredPickupAt = 0;
            player.lastPickupPoints = 0;
            player.mineKillChainCount = 0;
            player.lastMineKillAt = 0;
            player.lastMineKillPoints = 0;
            player.destroyedAt = now;
            player.allowStateSnapUntil = 0;
        } else {
            const destroyedAt = Number(player.destroyedAt) || 0;
            if (destroyedAt > 0 && now - destroyedAt >= PLAYER_RESPAWN_SNAP_MIN_DESTROYED_MS) {
                player.allowStateSnapUntil = now + PLAYER_RESPAWN_SNAP_WINDOW_MS;
            } else {
                player.allowStateSnapUntil = 0;
            }
            player.destroyedAt = 0;
        }
        player.isDestroyed = nextDestroyed;
        if (player.lastState && typeof player.lastState === 'object') {
            player.lastState.isDestroyed = nextDestroyed;
        }
        room.updatedAt = now;
        emitRoomState(room);
    });

    socket.on('disconnect', () => {
        leaveCurrentRoom(socket);
    });
});

server.listen(PORT, () => {
    const accessUrls = resolveServerAccessUrls(PORT);
    console.log('Server is running on:');
    accessUrls.forEach((url) => {
        console.log(`- ${url}`);
    });
});

function resolveServerAccessUrls(port) {
    const portText = String(port);
    const urls = [`http://localhost:${portText}`];
    const interfaces = os.networkInterfaces();
    const lanAddresses = new Set();

    Object.values(interfaces).forEach((entries) => {
        if (!Array.isArray(entries)) {
            return;
        }
        entries.forEach((entry) => {
            if (!entry || entry.internal || !isIpv4Family(entry.family)) {
                return;
            }
            const address = typeof entry.address === 'string' ? entry.address.trim() : '';
            if (!address || address.startsWith('169.254.')) {
                return;
            }
            lanAddresses.add(address);
        });
    });

    lanAddresses.forEach((address) => {
        urls.push(`http://${address}:${portText}`);
    });

    return urls;
}

function isIpv4Family(family) {
    return family === 'IPv4' || family === 4;
}

function parseAllowedOriginList(rawValue) {
    if (typeof rawValue !== 'string') {
        return [];
    }
    return rawValue
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function sanitizeDonationAmountCents(value) {
    const numeric = Math.round(Number(value) || 0);
    if (!Number.isFinite(numeric)) {
        return null;
    }
    if (numeric < DONATE_MIN_AMOUNT_CENTS || numeric > DONATE_MAX_AMOUNT_CENTS) {
        return null;
    }
    if (numeric % DONATE_AMOUNT_STEP_CENTS !== 0) {
        return null;
    }
    return numeric;
}

function createStripeClient(secretKey) {
    if (!secretKey) {
        return null;
    }
    try {
        return new Stripe(secretKey);
    } catch (error) {
        console.error('Stripe client initialization failed:', error);
        return null;
    }
}

function sanitizeStripeSecretKey(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    if (!normalized || !normalized.startsWith('sk_')) {
        return '';
    }
    return normalized;
}

function sanitizeCurrencyCode(value, fallback = 'eur') {
    if (typeof value !== 'string') {
        return fallback;
    }
    const normalized = value.trim().toLowerCase();
    return /^[a-z]{3}$/.test(normalized) ? normalized : fallback;
}

function sanitizeCheckoutText(value, fallback = 'Support Minefield Drift') {
    if (typeof value !== 'string') {
        return fallback;
    }
    const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 80);
    return normalized || fallback;
}

function sanitizeHttpOrigin(rawValue) {
    if (typeof rawValue !== 'string') {
        return '';
    }
    const normalized = rawValue.trim();
    if (!normalized) {
        return '';
    }
    try {
        const parsed = new URL(normalized);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return '';
        }
        return parsed.origin;
    } catch {
        return '';
    }
}

function resolveDonateBaseUrl(req) {
    if (DONATE_PUBLIC_BASE_URL) {
        return DONATE_PUBLIC_BASE_URL;
    }

    const host = sanitizeHttpHostHeader(req?.headers?.host);
    if (!host) {
        return '';
    }
    const protocol = resolveRequestProtocol(req);
    return `${protocol}://${host}`;
}

function createDonateReturnUrl(baseUrl, state) {
    if (!baseUrl) {
        return '';
    }
    try {
        const target = new URL('/', baseUrl);
        target.searchParams.set('donate', state);
        return target.toString();
    } catch {
        return '';
    }
}

function resolveRequestProtocol(req) {
    const forwardedProto = req?.headers?.['x-forwarded-proto'];
    if (typeof forwardedProto === 'string') {
        const normalized = forwardedProto.split(',')[0].trim().toLowerCase();
        if (normalized === 'http' || normalized === 'https') {
            return normalized;
        }
    }
    const protocol = typeof req?.protocol === 'string' ? req.protocol.toLowerCase() : '';
    return protocol === 'https' ? 'https' : 'http';
}

function sanitizeHttpHostHeader(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized.includes('/') || normalized.includes('\\')) {
        return '';
    }
    const isHostname = /^[a-z0-9.-]+(?::\d{1,5})?$/.test(normalized);
    const isIpv6 = /^\[[a-f0-9:]+\](?::\d{1,5})?$/.test(normalized);
    return isHostname || isIpv6 ? normalized : '';
}

function resolveSocketCorsOrigin(origin, callback) {
    const allowed = isSocketOriginAllowed(origin);
    if (allowed) {
        callback(null, true);
        return;
    }
    callback(new Error('Origin is not allowed by CORS'));
}

function isSocketOriginAllowed(origin) {
    if (!origin) {
        return true;
    }
    if (SOCKET_ALLOWED_ORIGINS.length > 0) {
        return SOCKET_ALLOWED_ORIGINS.includes(origin);
    }

    try {
        const parsed = new URL(origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return false;
        }
        const hostname = (parsed.hostname || '').toLowerCase();
        if (!hostname) {
            return false;
        }
        if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '::1' ||
            hostname.endsWith('.local')
        ) {
            return true;
        }
        return isPrivateIpv4Address(hostname);
    } catch {
        return false;
    }
}

function isPrivateIpv4Address(hostname) {
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
        return false;
    }
    const parts = hostname.split('.').map((part) => Number(part));
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return false;
    }
    const [a, b] = parts;
    if (a === 10 || a === 127) {
        return true;
    }
    if (a === 192 && b === 168) {
        return true;
    }
    return a === 172 && b >= 16 && b <= 31;
}

function safeAck(ack, payload) {
    if (typeof ack === 'function') {
        ack(payload);
    }
}

function consumeInboundEventQuota(socket, eventName) {
    const store = socket?.data?.rateLimitStore;
    if (!(store instanceof Map)) {
        return false;
    }

    const now = Date.now();
    const globalAllowed = consumeRateLimit(
        store,
        '__global__',
        now,
        GLOBAL_RATE_WINDOW_MS,
        GLOBAL_RATE_MAX_EVENTS
    );
    if (!globalAllowed) {
        return false;
    }

    const eventRule = EVENT_RATE_LIMITS[eventName] || { windowMs: 1000, max: 20 };
    const eventAllowed = consumeRateLimit(
        store,
        `event:${eventName}`,
        now,
        eventRule.windowMs,
        eventRule.max
    );
    if (!eventAllowed) {
        return false;
    }

    pruneIpRateLimitStore(now);
    const addressKey = resolveSocketAddressKey(socket);
    if (!addressKey) {
        return true;
    }

    const ipGlobalAllowed = consumeRateLimit(
        ipRateLimitStore,
        `ip:${addressKey}:__global__`,
        now,
        IP_RATE_WINDOW_MS,
        IP_RATE_MAX_EVENTS
    );
    if (!ipGlobalAllowed) {
        return false;
    }

    const ipEventMax = Math.max(10, Math.round(eventRule.max * IP_RATE_RULE_MULTIPLIER));
    return consumeRateLimit(
        ipRateLimitStore,
        `ip:${addressKey}:event:${eventName}`,
        now,
        eventRule.windowMs,
        ipEventMax
    );
}

function resolveSocketAddressKey(socket) {
    const rawAddress = String(
        socket?.handshake?.address ||
            socket?.conn?.remoteAddress ||
            socket?.request?.socket?.remoteAddress ||
            ''
    ).trim();
    if (!rawAddress) {
        return '';
    }
    return rawAddress
        .replace(/^::ffff:/, '')
        .replace(/[^\w\-.:]/g, '')
        .slice(0, 96);
}

function pruneIpRateLimitStore(nowMs = Date.now()) {
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    if (now - lastIpRateStorePruneAt < IP_RATE_STORE_PRUNE_INTERVAL_MS) {
        return;
    }
    lastIpRateStorePruneAt = now;
    for (const [key, bucket] of ipRateLimitStore.entries()) {
        const windowStartAt = Number(bucket?.windowStartAt);
        if (!Number.isFinite(windowStartAt) || now - windowStartAt > IP_RATE_STORE_TTL_MS) {
            ipRateLimitStore.delete(key);
        }
    }
}

function validateStateTransition({
    previousState,
    previousStateAt,
    nextState,
    nowMs = Date.now(),
    allowSnapUntil = 0,
} = {}) {
    if (!nextState || typeof nextState !== 'object') {
        return { ok: false, reason: 'invalid-next-state' };
    }
    if (!previousState || typeof previousState !== 'object') {
        return { ok: true, usedSnap: false };
    }

    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const previousAt = Number(previousStateAt);
    if (!Number.isFinite(previousAt) || previousAt <= 0 || now <= previousAt) {
        return { ok: true, usedSnap: false };
    }

    const dtSec = Math.max(0.001, Math.min(PLAYER_STATE_MAX_INTERVAL_MS, now - previousAt) / 1000);
    const dx = (Number(nextState.x) || 0) - (Number(previousState.x) || 0);
    const dy = (Number(nextState.y) || 0) - (Number(previousState.y) || 0);
    const dz = (Number(nextState.z) || 0) - (Number(previousState.z) || 0);
    const horizontalDistance = Math.hypot(dx, dz);
    const verticalDistance = Math.abs(dy);

    const snapAllowed = now <= Math.max(0, Number(allowSnapUntil) || 0);
    if (snapAllowed && horizontalDistance <= PLAYER_RESPAWN_MAX_SNAP_DISTANCE) {
        return { ok: true, usedSnap: true };
    }

    const allowedHorizontalDistance =
        PLAYER_STATE_HORIZONTAL_LEEWAY + dtSec * PLAYER_STATE_MAX_HORIZONTAL_SPEED_UNITS_PER_SEC;
    if (horizontalDistance > allowedHorizontalDistance) {
        return { ok: false, reason: 'implausible-horizontal-movement' };
    }

    const allowedVerticalDistance =
        PLAYER_STATE_VERTICAL_LEEWAY + dtSec * PLAYER_STATE_MAX_VERTICAL_SPEED_UNITS_PER_SEC;
    if (verticalDistance > allowedVerticalDistance) {
        return { ok: false, reason: 'implausible-vertical-movement' };
    }

    return { ok: true, usedSnap: false };
}

function createRoomPlayer(id, profile) {
    return {
        id,
        name: profile.name,
        colorHex: profile.colorHex,
        collectedCount: 0,
        score: 0,
        scoreComboCount: 0,
        lastScoredPickupAt: 0,
        lastPickupPoints: 0,
        mineKillChainCount: 0,
        lastMineKillAt: 0,
        lastMineKillPoints: 0,
        mineKillByTarget: Object.create(null),
        isDestroyed: false,
        joinedAt: Date.now(),
        previousState: null,
        previousStateAt: 0,
        lastState: null,
        lastStateAt: 0,
        lastInboundStateAt: 0,
        lastMinePlacedAt: 0,
        lastPickupAt: 0,
        pickupWindowStartedAt: 0,
        pickupWindowCount: 0,
        lastCrashReplication: {
            detachedPartIds: [],
            debrisPieces: [],
            explosion: null,
        },
        lastCrashReplicationAt: 0,
        lastVehicleStatusAt: 0,
        destroyedAt: 0,
        allowStateSnapUntil: 0,
    };
}

function serializeRoom(room) {
    pruneExpiredMines(room, Date.now());
    room.roundState =
        room.roundState && typeof room.roundState === 'object'
            ? room.roundState
            : createRoomRoundState(ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT);
    recalculateRoomRoundStateFromPlayers(room.roundState, room.players);
    const mineMap = room?.mines instanceof Map ? room.mines : new Map();
    const players = Array.from(room.players.values())
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((player) => {
            const collectedCount = Math.max(0, Math.round(Number(player.collectedCount) || 0));
            const score = Math.max(0, Math.round(Number(player.score) || 0));
            const isDestroyed = Boolean(player.isDestroyed);
            const baseState =
                player.lastState && typeof player.lastState === 'object'
                    ? {
                          ...player.lastState,
                          collectedCount,
                          score,
                          isDestroyed,
                      }
                    : null;
            if (baseState && player.lastCrashReplication) {
                baseState.crashReplication = player.lastCrashReplication;
            }

            return {
                id: player.id,
                name: player.name,
                colorHex: player.colorHex,
                collectedCount,
                score,
                isDestroyed,
                isHost: player.id === room.hostId,
                state: baseState,
                stateUpdatedAt: player.lastStateAt,
            };
        });

    return {
        roomCode: room.code,
        hostId: room.hostId,
        playerCount: players.length,
        maxPlayers: MAX_PLAYERS_PER_ROOM,
        roundState: serializeRoomRoundState(room.roundState),
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
    room.roundState =
        room.roundState && typeof room.roundState === 'object'
            ? room.roundState
            : createRoomRoundState(ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT);
    recalculateRoomRoundStateFromPlayers(room.roundState, room.players);

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
    const maxValue = 36 ** ROOM_CODE_LENGTH;
    for (let i = 0; i < 64; i += 1) {
        const value = crypto
            .randomInt(0, maxValue)
            .toString(36)
            .toUpperCase()
            .padStart(ROOM_CODE_LENGTH, '0');
        if (!rooms.has(value)) {
            return value;
        }
    }
    return null;
}

function generateServerMineId(ownerId, nowMs = Date.now()) {
    const owner = sanitizeSocketLikeId(ownerId) || 'player';
    const now = Math.max(0, Math.round(Number(nowMs) || Date.now()));
    const nonce = crypto.randomBytes(MINE_ID_RANDOM_BYTES).toString('hex');
    return `${owner}-${now.toString(36)}-${nonce}`;
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
    const inputForward = Boolean(payload?.inputForward);
    const inputBackward = Boolean(payload?.inputBackward);
    const inputLeft = Boolean(payload?.inputLeft);
    const inputRight = Boolean(payload?.inputRight);
    const inputHandbrake = Boolean(payload?.inputHandbrake);

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
    const room = context?.room;
    const candidateMineId = sanitizeMineId(payload.mineId);
    const ownerScopedCandidateMineId =
        candidateMineId && candidateMineId.startsWith(`${ownerId}-`) ? candidateMineId : '';
    const hasCollisionWithExistingMineId =
        ownerScopedCandidateMineId && room?.mines?.has?.(ownerScopedCandidateMineId);
    const mineId =
        ownerScopedCandidateMineId && !hasCollisionWithExistingMineId
            ? ownerScopedCandidateMineId
            : generateServerMineId(ownerId, now);
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
