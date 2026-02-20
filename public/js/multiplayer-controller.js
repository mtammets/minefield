import { createCarRig } from './car.js';
import { createSkidMarkController } from './skidmarks.js';
import { createCrashDebrisController } from './crash-debris-system.js';

const MP_NAME_STORAGE_KEY = 'silentdrift-mp-player-name';
const DEFAULT_PLAYER_NAME = 'Driver';
const PLAYER_NAME_MAX_LENGTH = 18;
const ROOM_CODE_LENGTH = 6;
const STATE_SEND_INTERVAL_MS = 50;
const PROFILE_SYNC_INTERVAL_MS = 500;
const REMOTE_STATE_TIMEOUT_MS = 10_000;
const REMOTE_LERP_SPEED = 11;
const MP_COLLISION_RADIUS = 1.34;
const MP_COLLISION_HALF_WIDTH = 1.45;
const MP_COLLISION_HALF_LENGTH = 2.3;
const MP_COLLISION_MASS = 1.6;
const COLLISION_RELAY_INTERVAL_MS = 90;
const CRASH_REPLICATION_SEND_INTERVAL_MS = 190;
const VEHICLE_STATUS_SEND_INTERVAL_MS = 140;

export function createMultiplayerController(options = {}) {
    const {
        scene,
        car,
        getVehicleState = () => ({}),
        getInputState = () => ({}),
        getCrashReplicationState = () => null,
        getGroundHeightAt = () => 0,
        applyNetworkCollisionImpulse = () => false,
        getSelectedCarColorHex = () => 0x2d67a6,
        getPlayerCollectedCount = () => 0,
        getIsCarDestroyed = () => false,
        objectiveUi = null,
        onMineSnapshot = () => {},
        onMinePlaced = () => {},
        onMineDetonated = () => {},
        onAuthoritativeRoundState = () => {},
    } = options;

    if (!scene || !car) {
        return createNoopController();
    }

    const dom = resolveDom();
    if (!dom.panel || !dom.leaveButton || !dom.roomMeta || !dom.playerList) {
        return createNoopController();
    }

    const listeners = [];
    const remotePlayers = new Map();
    const lastCollisionRelaySentAtByTarget = new Map();

    let socket = null;
    let room = null;
    let selfId = '';
    let isBusy = false;
    let isInitialized = false;
    let isPanelVisible = true;
    let lastStateSentAt = 0;
    let lastCrashReplicationSentAt = 0;
    let lastVehicleStatusSentAt = 0;
    let lastVehicleStatusValue = null;
    let lastProfileSyncedAt = 0;
    let lastProfileSignature = '';
    let localPlayerName = DEFAULT_PLAYER_NAME;

    return {
        initialize,
        update,
        dispose,
        setPanelVisible,
        isPanelVisible() {
            return isPanelVisible;
        },
        getCollisionSnapshots,
        reportLocalVehicleContacts,
        reportMinePlaced,
        reportMineDetonated,
        reportPickupCollected,
        isInRoom,
        getSelfId,
        getLocalPlayerName,
        startOnlineRoomFlow,
        getRoundStateSnapshot,
        getScoreboardEntries,
    };

    function initialize() {
        if (isInitialized) {
            return;
        }
        isInitialized = true;

        const savedName = readStorage(MP_NAME_STORAGE_KEY);
        localPlayerName = sanitizePlayerName(savedName || DEFAULT_PLAYER_NAME);
        writeStorage(MP_NAME_STORAGE_KEY, localPlayerName);
        addListener(dom.leaveButton, 'click', handleLeaveRoomClick);

        setStatus('Not in room. Open Welcome to create or join.', 'info');
        renderPlayerList();
        updateRoomMeta();
        updatePanel();
    }

    function dispose() {
        while (listeners.length > 0) {
            const entry = listeners.pop();
            entry.target.removeEventListener(entry.event, entry.handler);
        }

        if (socket) {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('connect_error');
            socket.off('mp:roomState');
            socket.off('mp:playerState');
            socket.off('mp:collision');
            socket.off('mp:crashReplication');
            socket.off('mp:minePlaced');
            socket.off('mp:mineDetonated');
            socket.disconnect();
            socket = null;
        }

        clearRoomState();
        for (const remote of remotePlayers.values()) {
            removeRemotePlayer(remote);
        }
        remotePlayers.clear();
        updatePanel();
    }

    function update(deltaTime = 1 / 60) {
        if (!isPanelVisible) {
            return;
        }
        const dt = Math.min(Math.max(deltaTime, 0), 0.05);
        updateRemoteCars(dt);

        if (!room || !socket?.connected) {
            return;
        }

        maybeSyncProfile();
        maybeSendPlayerState();
        maybeSendCrashReplication();
        maybeSendVehicleStatus();
    }

    function getCollisionSnapshots() {
        if (!isPanelVisible) {
            return [];
        }
        const snapshots = [];
        const now = performance.now();
        for (const remote of remotePlayers.values()) {
            if (!remote.hasState || remote.isDestroyed) {
                continue;
            }
            if (now - remote.lastStateAt > REMOTE_STATE_TIMEOUT_MS) {
                continue;
            }
            snapshots.push({
                id: `player:${remote.id}`,
                playerId: remote.id,
                sourceType: 'player',
                x: remote.car.position.x,
                z: remote.car.position.z,
                heading: normalizeAngle(remote.car.rotation.y),
                halfWidth: MP_COLLISION_HALF_WIDTH,
                halfLength: MP_COLLISION_HALF_LENGTH,
                radius: MP_COLLISION_RADIUS,
                collisionRadius: MP_COLLISION_RADIUS,
                mass: MP_COLLISION_MASS,
                velocityX: clampNumber(remote.visualState?.velocity?.x, -400, 400, 0),
                velocityZ: clampNumber(remote.visualState?.velocity?.y, -400, 400, 0),
            });
        }
        return snapshots;
    }

    function reportLocalVehicleContacts(contacts = [], vehicleStateSnapshot = null) {
        if (!isPanelVisible) {
            return;
        }
        if (!room || !socket?.connected || !Array.isArray(contacts) || contacts.length === 0) {
            return;
        }

        const strongestByTarget = new Map();
        for (let i = 0; i < contacts.length; i += 1) {
            const contact = contacts[i];
            const targetPlayerId = resolveTargetPlayerId(contact);
            if (!targetPlayerId || targetPlayerId === selfId) {
                continue;
            }
            const previous = strongestByTarget.get(targetPlayerId);
            if (!previous || (contact.impactSpeed || 0) > (previous.impactSpeed || 0)) {
                strongestByTarget.set(targetPlayerId, contact);
            }
        }
        if (strongestByTarget.size === 0) {
            return;
        }

        const now = performance.now();
        const localVelocityX = clampNumber(vehicleStateSnapshot?.velocity?.x, -400, 400, 0);
        const localVelocityZ = clampNumber(vehicleStateSnapshot?.velocity?.y, -400, 400, 0);
        for (const [targetPlayerId, contact] of strongestByTarget.entries()) {
            const lastSentAt = lastCollisionRelaySentAtByTarget.get(targetPlayerId) || 0;
            if (now - lastSentAt < COLLISION_RELAY_INTERVAL_MS) {
                continue;
            }
            lastCollisionRelaySentAtByTarget.set(targetPlayerId, now);
            socket.emit('mp:collision', {
                targetId: targetPlayerId,
                normalX: -clampNumber(contact.normalX, -1, 1, 0),
                normalZ: -clampNumber(contact.normalZ, -1, 1, 0),
                penetration: clampNumber(contact.penetration, 0, 1.8, 0.04),
                impactSpeed: clampNumber(contact.impactSpeed, 0, 90, 0),
                otherVelocityX: localVelocityX,
                otherVelocityZ: localVelocityZ,
                mass: MP_COLLISION_MASS,
            });
        }
    }

    function reportMinePlaced(mineSnapshot = null) {
        if (!isPanelVisible || !socket?.connected || !room) {
            return false;
        }
        if (!mineSnapshot || typeof mineSnapshot !== 'object') {
            return false;
        }
        socket.emit('mp:minePlaced', mineSnapshot);
        return true;
    }

    function reportMineDetonated(detonationSnapshot = null) {
        if (!isPanelVisible || !socket?.connected || !room) {
            return false;
        }
        if (!detonationSnapshot || typeof detonationSnapshot !== 'object') {
            return false;
        }
        socket.emit('mp:mineDetonated', detonationSnapshot);
        return true;
    }

    function reportPickupCollected(payload = null, ack = null) {
        if (!isPanelVisible || !socket?.connected || !room) {
            if (typeof ack === 'function') {
                ack({
                    ok: false,
                    error: 'Offline',
                });
            }
            return false;
        }
        const message = payload && typeof payload === 'object' ? payload : {};
        socket.emit('mp:pickupCollected', message, (response) => {
            if (response?.ok && room && Array.isArray(room.players)) {
                const selfPlayer = room.players.find((entry) => entry?.id === selfId);
                if (selfPlayer && Number.isFinite(response.playerCollectedCount)) {
                    selfPlayer.collectedCount = Math.max(
                        0,
                        Math.round(Number(response.playerCollectedCount) || 0)
                    );
                }
                if (response.roundState && typeof response.roundState === 'object') {
                    room.roundState = response.roundState;
                }
                emitAuthoritativeRoundState(room);
                renderPlayerList(room.players, selfId);
                updateRoomMeta();
            }
            if (typeof ack === 'function') {
                ack(response);
            }
        });
        return true;
    }

    function isInRoom() {
        return Boolean(isPanelVisible && room?.roomCode && socket?.connected);
    }

    function getSelfId() {
        return selfId || socket?.id || '';
    }

    function getLocalPlayerName() {
        return sanitizePlayerName(localPlayerName || DEFAULT_PLAYER_NAME);
    }

    function startOnlineRoomFlow(startContext = null) {
        if (!isPanelVisible || isBusy || room?.roomCode) {
            return false;
        }
        const preferredPlayerName = sanitizePlayerName(
            startContext?.playerName || localPlayerName || DEFAULT_PLAYER_NAME
        );
        localPlayerName = preferredPlayerName;
        writeStorage(MP_NAME_STORAGE_KEY, preferredPlayerName);
        const action = startContext?.roomAction === 'join' ? 'join' : 'create';
        if (action === 'create') {
            const createRoomCode = normalizeOptionalRoomCode(startContext?.roomCode);
            if (createRoomCode == null) {
                setStatus(`Room code must be ${ROOM_CODE_LENGTH} letters or numbers.`, 'error');
                updatePanel();
                return false;
            }
            handleCreateRoomClick(createRoomCode);
            return true;
        }
        const roomCode = normalizeRoomCode(startContext?.roomCode || '');
        if (!roomCode) {
            setStatus(`Room code must be ${ROOM_CODE_LENGTH} letters or numbers.`, 'error');
            updatePanel();
            return false;
        }
        handleJoinRoomClick(roomCode);
        return true;
    }

    function resolveTargetPlayerId(contact = null) {
        if (typeof contact?.playerId === 'string' && contact.playerId.trim()) {
            return contact.playerId.trim();
        }
        if (typeof contact?.vehicleId === 'string') {
            const match = contact.vehicleId.trim().match(/^player:(.+)$/);
            if (match?.[1]) {
                return match[1];
            }
        }
        return '';
    }

    function handleCreateRoomClick(explicitRoomCode = '') {
        if (isBusy) {
            return;
        }

        const createRoomCode = normalizeOptionalRoomCode(explicitRoomCode);
        if (createRoomCode == null) {
            setStatus(`Room code must be ${ROOM_CODE_LENGTH} letters or numbers.`, 'error');
            updatePanel();
            return;
        }

        const activeSocket = ensureSocket();
        if (!activeSocket) {
            return;
        }

        const profile = readProfileFromUi();
        writeStorage(MP_NAME_STORAGE_KEY, profile.name);
        isBusy = true;
        setStatus('Creating room...', 'pending');
        updatePanel();

        activeSocket.emit(
            'mp:createRoom',
            {
                profile,
                roomCode: createRoomCode || undefined,
            },
            (response) => {
                isBusy = false;
                if (!response?.ok) {
                    setStatus(response?.error || 'Failed to create room.', 'error');
                    updatePanel();
                    return;
                }

                objectiveUi?.showInfo?.(
                    `Online room ${response.room?.roomCode || ''} created. G drops, T throws mines.`,
                    2200
                );
                applyRoomSnapshot(response.room, response.selfId);
                setStatus('In room.', 'success');
                updatePanel();
            }
        );
    }

    function handleJoinRoomClick(explicitRoomCode = '') {
        if (isBusy) {
            return;
        }

        const roomCode = normalizeRoomCode(explicitRoomCode);
        if (!roomCode) {
            setStatus(`Room code must be ${ROOM_CODE_LENGTH} letters or numbers.`, 'error');
            return;
        }

        const activeSocket = ensureSocket();
        if (!activeSocket) {
            return;
        }

        const profile = readProfileFromUi();
        writeStorage(MP_NAME_STORAGE_KEY, profile.name);
        isBusy = true;
        setStatus(`Joining ${roomCode}...`, 'pending');
        updatePanel();

        activeSocket.emit('mp:joinRoom', { roomCode, profile }, (response) => {
            isBusy = false;
            if (!response?.ok) {
                setStatus(response?.error || 'Failed to join room.', 'error');
                updatePanel();
                return;
            }

            objectiveUi?.showInfo?.(
                `Connected to room ${roomCode}. G drops, T throws mines.`,
                2200
            );
            applyRoomSnapshot(response.room, response.selfId);
            setStatus('In room.', 'success');
            updatePanel();
        });
    }

    function handleLeaveRoomClick() {
        if (!room || isBusy) {
            return;
        }

        isBusy = true;
        setStatus('Leaving room...', 'pending');
        updatePanel();

        socket.emit('mp:leaveRoom', {}, () => {
            isBusy = false;
            objectiveUi?.showInfo?.('Left online room.', 1600);
            clearRoomState();
            setStatus('Room left. You are offline.', 'info');
            updatePanel();
        });
    }

    function ensureSocket() {
        if (socket) {
            return socket;
        }

        if (typeof window.io !== 'function') {
            setStatus('Realtime client failed to load. Reload the page.', 'error');
            return null;
        }

        socket = window.io({
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 400,
            reconnectionDelayMax: 2000,
        });

        socket.on('connect', () => {
            if (!room) {
                setStatus('Connected. Open Welcome to create or join.', 'info');
            }
            updatePanel();
        });

        socket.on('disconnect', (reason) => {
            isBusy = false;
            clearRoomState();
            setStatus(`Connection lost (${reason}). Reconnect to continue.`, 'error');
            objectiveUi?.showInfo?.('Online session disconnected.', 2200);
            updatePanel();
        });

        socket.on('connect_error', () => {
            isBusy = false;
            setStatus('Server connection failed. Check if the server is running.', 'error');
            updatePanel();
        });

        socket.on('mp:roomState', (snapshot) => {
            applyRoomSnapshot(snapshot, socket.id);
            const joinedRoomCode = snapshot?.roomCode || '';
            if (joinedRoomCode) {
                setStatus('In room.', 'success');
            }
            updatePanel();
        });

        socket.on('mp:playerState', (payload) => {
            const playerId = payload?.id;
            if (!playerId || playerId === selfId) {
                return;
            }
            const remote = getOrCreateRemotePlayer(playerId);
            if (!remote) {
                return;
            }
            applyRemoteState(remote, payload.state, false);
        });
        socket.on('mp:collision', (payload) => {
            applyNetworkCollisionImpulse(payload);
        });
        socket.on('mp:crashReplication', (payload) => {
            const playerId = payload?.id;
            if (!playerId || playerId === selfId) {
                return;
            }
            const remote = getOrCreateRemotePlayer(playerId);
            if (!remote) {
                return;
            }
            applyRemoteCrashReplication(remote, payload.crashReplication);
        });
        socket.on('mp:minePlaced', (payload) => {
            onMinePlaced(payload);
        });
        socket.on('mp:mineDetonated', (payload) => {
            onMineDetonated(payload);
        });

        return socket;
    }

    function maybeSyncProfile(force = false) {
        if (!room || !socket?.connected) {
            return;
        }

        const now = performance.now();
        if (!force && now - lastProfileSyncedAt < PROFILE_SYNC_INTERVAL_MS) {
            return;
        }

        const profile = readProfileFromUi();
        const signature = `${profile.name}|${profile.colorHex}`;
        if (!force && signature === lastProfileSignature) {
            return;
        }

        lastProfileSyncedAt = now;
        lastProfileSignature = signature;
        socket.emit('mp:updateProfile', profile);
    }

    function maybeSendPlayerState() {
        const now = performance.now();
        if (now - lastStateSentAt < STATE_SEND_INTERVAL_MS) {
            return;
        }
        lastStateSentAt = now;

        const vehicleState = getVehicleState() || {};
        const inputState = getInputState() || {};
        socket.emit('mp:state', {
            x: car.position.x,
            y: car.position.y,
            z: car.position.z,
            rotationY: normalizeAngle(car.rotation.y),
            speed: Number.isFinite(vehicleState.speed) ? vehicleState.speed : 0,
            steerInput: clampNumber(vehicleState.steerInput, -1, 1, 0),
            throttle: clampNumber(vehicleState.throttle, 0, 1, 0),
            brake: clampNumber(vehicleState.brake, 0, 1, 0),
            burnout: clampNumber(vehicleState.burnout, 0, 1, 0),
            yawRate: clampNumber(vehicleState.yawRate, -24, 24, 0),
            velocityX: clampNumber(vehicleState?.velocity?.x, -400, 400, 0),
            velocityZ: clampNumber(vehicleState?.velocity?.y, -400, 400, 0),
            inputForward: Boolean(inputState.forward),
            inputBackward: Boolean(inputState.backward),
            inputLeft: Boolean(inputState.left),
            inputRight: Boolean(inputState.right),
            inputHandbrake: Boolean(inputState.handbrake),
        });
    }

    function maybeSendCrashReplication() {
        if (!room || !socket?.connected) {
            return;
        }
        const now = performance.now();
        if (now - lastCrashReplicationSentAt < CRASH_REPLICATION_SEND_INTERVAL_MS) {
            return;
        }
        lastCrashReplicationSentAt = now;

        const crashReplicationState = getCrashReplicationState?.() || null;
        if (!crashReplicationState || typeof crashReplicationState !== 'object') {
            return;
        }
        const hasCrashState =
            (Array.isArray(crashReplicationState.detachedPartIds) &&
                crashReplicationState.detachedPartIds.length > 0) ||
            (Array.isArray(crashReplicationState.debrisPieces) &&
                crashReplicationState.debrisPieces.length > 0) ||
            Boolean(crashReplicationState.explosion);
        if (!hasCrashState && !Boolean(getIsCarDestroyed())) {
            return;
        }
        socket.emit('mp:crashReplication', crashReplicationState);
    }

    function maybeSendVehicleStatus() {
        if (!room || !socket?.connected) {
            return;
        }
        const nextDestroyed = Boolean(getIsCarDestroyed());
        if (nextDestroyed === lastVehicleStatusValue) {
            return;
        }

        const now = performance.now();
        if (now - lastVehicleStatusSentAt < VEHICLE_STATUS_SEND_INTERVAL_MS) {
            return;
        }

        lastVehicleStatusSentAt = now;
        lastVehicleStatusValue = nextDestroyed;
        socket.emit('mp:vehicleStatus', {
            isDestroyed: nextDestroyed,
        });
    }

    function updateRemoteCars(dt) {
        const now = performance.now();
        for (const remote of remotePlayers.values()) {
            if (now - remote.lastStateAt > REMOTE_STATE_TIMEOUT_MS) {
                remote.car.visible = false;
                remote.skidMarkController?.update?.(dt, { enabled: false });
                remote.crashDebrisController?.updateDebris?.(dt);
                continue;
            }

            remote.car.visible = !remote.isDestroyed;
            if (!remote.hasState) {
                remote.skidMarkController?.update?.(dt, { enabled: false });
                remote.crashDebrisController?.updateDebris?.(dt);
                continue;
            }

            const blend = 1 - Math.exp(-REMOTE_LERP_SPEED * dt);
            remote.car.position.lerp(remote.targetPosition, blend);
            remote.car.rotation.y = lerpAngle(remote.car.rotation.y, remote.targetRotationY, blend);

            const speed = Number.isFinite(remote.visualState.speed) ? remote.visualState.speed : 0;
            remote.visualState.speed = speed;
            remote.visualState.acceleration =
                (speed - remote.visualState.lastSpeed) / Math.max(dt, 1e-3);
            remote.visualState.lastSpeed = speed;
            remote.visualState.batteryDepleted = remote.isDestroyed;
            remote.updateVisuals(remote.visualState, dt);
            remote.skidMarkController?.update?.(dt, {
                enabled: !remote.isDestroyed,
                vehicle: remote.car,
                vehicleState: remote.visualState,
                inputState: remote.inputState,
            });
            remote.crashDebrisController?.updateDebris?.(dt);
        }
    }

    function applyRoomSnapshot(snapshot, nextSelfId) {
        if (!snapshot || !Array.isArray(snapshot.players)) {
            return;
        }

        const previousRoomCode = room?.roomCode || '';
        const previousSelfId = selfId;
        room = snapshot;
        selfId = nextSelfId || socket?.id || '';
        if (snapshot.roomCode !== previousRoomCode || selfId !== previousSelfId) {
            lastVehicleStatusValue = null;
            lastVehicleStatusSentAt = 0;
            lastCrashReplicationSentAt = 0;
        }
        if (Array.isArray(snapshot.mines)) {
            onMineSnapshot(snapshot.mines);
        }

        const selfPlayer = snapshot.players.find((player) => player?.id === selfId);
        if (selfPlayer?.name) {
            localPlayerName = sanitizePlayerName(selfPlayer.name);
            writeStorage(MP_NAME_STORAGE_KEY, localPlayerName);
        }

        const presentRemoteIds = new Set();

        for (let i = 0; i < snapshot.players.length; i += 1) {
            const player = snapshot.players[i];
            if (!player?.id || player.id === selfId) {
                continue;
            }

            presentRemoteIds.add(player.id);
            const remote = getOrCreateRemotePlayer(player.id, player);
            if (!remote) {
                continue;
            }

            applyRemoteMeta(remote, player);
            if (player.state) {
                applyRemoteState(remote, player.state, true);
            }
        }

        for (const [playerId, remote] of remotePlayers.entries()) {
            if (!presentRemoteIds.has(playerId)) {
                removeRemotePlayer(remote);
                remotePlayers.delete(playerId);
            }
        }

        renderPlayerList(snapshot.players, selfId);
        updateRoomMeta();
        emitAuthoritativeRoundState(snapshot);
    }

    function clearRoomState() {
        room = null;
        selfId = '';
        lastStateSentAt = 0;
        lastCrashReplicationSentAt = 0;
        lastVehicleStatusSentAt = 0;
        lastVehicleStatusValue = null;
        lastProfileSyncedAt = 0;
        lastProfileSignature = '';
        lastCollisionRelaySentAtByTarget.clear();
        onMineSnapshot([]);

        for (const remote of remotePlayers.values()) {
            removeRemotePlayer(remote);
        }
        remotePlayers.clear();

        renderPlayerList();
        updateRoomMeta();
        emitAuthoritativeRoundState(null);
    }

    function getOrCreateRemotePlayer(playerId, playerSnapshot = null) {
        if (!playerId || playerId === selfId) {
            return null;
        }

        if (remotePlayers.has(playerId)) {
            const remote = remotePlayers.get(playerId);
            if (playerSnapshot) {
                applyRemoteMeta(remote, playerSnapshot);
            }
            return remote;
        }

        const carRig = createCarRig({
            bodyColor: playerSnapshot?.colorHex ?? 0x6cb3ff,
            displayName: playerSnapshot?.name || 'Online',
            addLights: false,
            addWheelWellLights: false,
            showBatteryIndicator: false,
        });

        carRig.car.position.copy(car.position);
        carRig.car.visible = false;
        scene.add(carRig.car);

        const remote = {
            id: playerId,
            name: playerSnapshot?.name || 'Online',
            colorHex: (playerSnapshot?.colorHex ?? 0x6cb3ff) >>> 0,
            car: carRig.car,
            updateVisuals: carRig.updateVisuals,
            setBodyColor: carRig.setBodyColor,
            skidMarkController: null,
            crashDebrisController: null,
            targetPosition: carRig.car.position.clone(),
            targetRotationY: carRig.car.rotation.y,
            hasState: false,
            isDestroyed: false,
            wasDestroyed: false,
            lastStateAt: 0,
            lastRotationSampleY: carRig.car.rotation.y,
            lastRotationSampleAt: performance.now(),
            inputState: {
                forward: false,
                backward: false,
                left: false,
                right: false,
                handbrake: false,
            },
            visualState: {
                speed: 0,
                acceleration: 0,
                steerInput: 0,
                throttle: 0,
                brake: 0,
                burnout: 0,
                yawRate: 0,
                velocity: {
                    x: 0,
                    y: 0,
                },
                lastSpeed: 0,
                batteryDepleted: false,
            },
        };
        const crashParts = carRig.getCrashParts?.() || [];
        remote.skidMarkController = createSkidMarkController(scene, {
            sampleGroundHeight: getGroundHeightAt,
            keys: {},
        });
        remote.crashDebrisController = createCrashDebrisController({
            scene,
            car: carRig.car,
            crashParts,
            getGroundHeightAt,
            getVehicleState: () => remote.visualState,
            setVehicleDamageState: () => {},
            objectiveUi: null,
            getBotTrafficSystem: () => null,
            isCarDestroyed: () => remote.isDestroyed,
        });
        remote.crashDebrisController.initializeBodyPartBaselines();

        remotePlayers.set(playerId, remote);
        return remote;
    }

    function applyRemoteMeta(remote, playerSnapshot = {}) {
        const snapshotColorNumeric = Number(playerSnapshot.colorHex);
        const nextColor = Number.isFinite(snapshotColorNumeric)
            ? Math.max(0, Math.min(0xffffff, Math.round(snapshotColorNumeric))) >>> 0
            : remote.colorHex || 0x6cb3ff;
        if (nextColor !== remote.colorHex) {
            remote.colorHex = nextColor;
            remote.setBodyColor?.(nextColor);
        }
        if (typeof playerSnapshot.name === 'string' && playerSnapshot.name.trim()) {
            remote.name = playerSnapshot.name.trim();
        }
    }

    function applyRemoteState(remote, state, hardSnap) {
        if (!state) {
            return;
        }

        remote.targetPosition.set(
            clampNumber(state.x, -5000, 5000, remote.car.position.x),
            clampNumber(state.y, -200, 1200, remote.car.position.y),
            clampNumber(state.z, -5000, 5000, remote.car.position.z)
        );
        const rotationRaw = clampNumber(
            state.rotationY,
            -Math.PI * 64,
            Math.PI * 64,
            remote.targetRotationY
        );
        remote.targetRotationY = normalizeAngle(rotationRaw);
        const nextSpeed = clampNumber(state.speed, -320, 320, 0);
        const now = performance.now();
        const sampleDt = Math.max(1e-3, (now - (remote.lastRotationSampleAt || now)) / 1000);
        const sampledYawRate =
            (((((remote.targetRotationY -
                (remote.lastRotationSampleY ?? remote.targetRotationY) +
                Math.PI) %
                (Math.PI * 2)) +
                Math.PI * 2) %
                (Math.PI * 2)) -
                Math.PI) /
            sampleDt;
        const hasExtendedVehicleState =
            state.steerInput != null ||
            state.throttle != null ||
            state.brake != null ||
            state.burnout != null ||
            state.yawRate != null ||
            state.velocityX != null ||
            state.velocityZ != null;
        remote.visualState.speed = nextSpeed;
        remote.visualState.steerInput = clampNumber(
            state.steerInput,
            -1,
            1,
            hasExtendedVehicleState
                ? remote.visualState.steerInput
                : Math.max(-1, Math.min(1, sampledYawRate * 0.18))
        );
        remote.visualState.throttle = clampNumber(
            state.throttle,
            0,
            1,
            hasExtendedVehicleState
                ? remote.visualState.throttle
                : Math.max(0, Math.min(1, Math.abs(nextSpeed) / 70))
        );
        remote.visualState.brake = clampNumber(
            state.brake,
            0,
            1,
            hasExtendedVehicleState
                ? remote.visualState.brake
                : Math.max(0, Math.min(1, -nextSpeed / 30))
        );
        remote.visualState.burnout = clampNumber(
            state.burnout,
            0,
            1,
            hasExtendedVehicleState
                ? remote.visualState.burnout
                : Math.max(
                      0,
                      Math.min(
                          1,
                          Math.abs(sampledYawRate) * 0.16 +
                              Math.abs(remote.visualState.steerInput) * 0.48
                      )
                  )
        );
        remote.visualState.yawRate = clampNumber(
            state.yawRate,
            -24,
            24,
            hasExtendedVehicleState ? remote.visualState.yawRate : sampledYawRate
        );
        remote.visualState.velocity.x = clampNumber(
            state.velocityX,
            -400,
            400,
            hasExtendedVehicleState
                ? remote.visualState.velocity.x
                : Math.sin(remote.targetRotationY) * nextSpeed
        );
        remote.visualState.velocity.y = clampNumber(
            state.velocityZ,
            -400,
            400,
            hasExtendedVehicleState
                ? remote.visualState.velocity.y
                : Math.cos(remote.targetRotationY) * nextSpeed
        );
        remote.inputState.forward =
            state.inputForward != null
                ? Boolean(state.inputForward)
                : remote.visualState.throttle > 0.12;
        remote.inputState.backward =
            state.inputBackward != null
                ? Boolean(state.inputBackward)
                : remote.visualState.brake > 0.15 && nextSpeed < -0.5;
        remote.inputState.left =
            state.inputLeft != null
                ? Boolean(state.inputLeft)
                : remote.visualState.steerInput < -0.12;
        remote.inputState.right =
            state.inputRight != null
                ? Boolean(state.inputRight)
                : remote.visualState.steerInput > 0.12;
        remote.inputState.handbrake =
            state.inputHandbrake != null
                ? Boolean(state.inputHandbrake)
                : remote.visualState.burnout > 0.24 ||
                  (Math.abs(remote.visualState.yawRate) > 0.85 && Math.abs(nextSpeed) > 1.6);
        const wasDestroyed = Boolean(remote.isDestroyed);
        remote.isDestroyed = Boolean(state.isDestroyed);
        if (!wasDestroyed && remote.isDestroyed) {
            remote.crashDebrisController?.clearDebris?.();
            remote.crashDebrisController?.resetPlayerDamageState?.();
            remote.crashDebrisController?.spawnCarDebris?.(remote.targetPosition.clone(), null);
        } else if (wasDestroyed && !remote.isDestroyed) {
            remote.crashDebrisController?.clearDebris?.();
            remote.crashDebrisController?.resetPlayerDamageState?.();
        }
        remote.lastRotationSampleY = remote.targetRotationY;
        remote.lastRotationSampleAt = now;
        remote.wasDestroyed = remote.isDestroyed;
        remote.lastStateAt = now;
        remote.hasState = true;

        if (hardSnap) {
            remote.car.position.copy(remote.targetPosition);
            remote.car.rotation.y = remote.targetRotationY;
        }
    }

    function applyRemoteCrashReplication(remote, crashReplicationState) {
        if (!remote || !crashReplicationState || typeof crashReplicationState !== 'object') {
            return;
        }
        remote.crashDebrisController?.applyReplicationState?.(crashReplicationState);
    }

    function emitAuthoritativeRoundState(snapshot = room) {
        if (typeof onAuthoritativeRoundState !== 'function') {
            return;
        }
        if (!snapshot || !Array.isArray(snapshot.players)) {
            onAuthoritativeRoundState({
                inRoom: false,
                roomCode: '',
                roundState: null,
                playerCollectedCount: 0,
                totalCollectedCount: 0,
                scoreboard: [],
                selfId: selfId || '',
            });
            return;
        }

        const scoreboard = buildScoreboardEntries(snapshot.players, selfId);
        const roundState = sanitizeRoundStateSnapshot(snapshot.roundState, scoreboard);
        const totalCollectedFromPlayers = scoreboard.reduce(
            (sum, entry) => sum + (entry.collectedCount || 0),
            0
        );
        const resolvedTotalCollected = roundState
            ? roundState.totalCollected
            : Math.max(0, totalCollectedFromPlayers);
        const selfEntry = scoreboard.find((entry) => entry.id === selfId);

        onAuthoritativeRoundState({
            inRoom: true,
            roomCode: String(snapshot.roomCode || ''),
            roundState,
            playerCollectedCount: selfEntry?.collectedCount || 0,
            totalCollectedCount: resolvedTotalCollected,
            scoreboard,
            selfId: selfId || '',
        });
    }

    function getRoundStateSnapshot() {
        if (!room || !Array.isArray(room.players)) {
            return null;
        }
        const scoreboard = buildScoreboardEntries(room.players, selfId);
        return sanitizeRoundStateSnapshot(room.roundState, scoreboard);
    }

    function getScoreboardEntries() {
        if (!room || !Array.isArray(room.players)) {
            return [];
        }
        return buildScoreboardEntries(room.players, selfId);
    }

    function renderPlayerList(players = [], localPlayerId = selfId) {
        if (!players.length) {
            dom.playerList.innerHTML = '<div class="mpPlayerEmpty">No online players yet.</div>';
            return;
        }

        const rows = players
            .map((player) => {
                const isSelf = player.id === localPlayerId;
                const role = player.isHost ? 'HOST' : 'PLAYER';
                return `<div class="mpPlayerRow">
                    <span class="mpPlayerName">${escapeHtml(player.name || 'Player')}${isSelf ? ' (You)' : ''}</span>
                    <span class="mpPlayerRole">${role}</span>
                </div>`;
            })
            .join('');

        dom.playerList.innerHTML = rows;
    }

    function updateRoomMeta() {
        const roomCodeValueEl = dom.roomCodeValue || null;
        const playerCountValueEl = dom.playerCountValue || null;
        if (!room) {
            dom.roomMeta.dataset.state = 'offline';
            if (roomCodeValueEl) {
                roomCodeValueEl.textContent = '------';
            }
            if (playerCountValueEl) {
                playerCountValueEl.textContent = '0/0 PLAYERS';
            }
            return;
        }

        dom.roomMeta.dataset.state = 'active';
        const roomCode = room.roomCode || '-';
        const playerCount =
            Number(room.playerCount) || (Array.isArray(room.players) ? room.players.length : 0);
        const maxPlayers = Number(room.maxPlayers) || 0;
        if (roomCodeValueEl) {
            roomCodeValueEl.textContent = roomCode;
        }
        if (playerCountValueEl) {
            playerCountValueEl.textContent = `${playerCount}/${maxPlayers} PLAYERS`;
        }
    }

    function setStatus(message, tone = 'info') {
        if (!dom.status) {
            return;
        }
        dom.status.textContent = message;
        dom.status.dataset.tone = tone;
    }

    function updatePanel() {
        const hasRoom = Boolean(room?.roomCode);
        const isConnected = Boolean(socket?.connected);

        dom.leaveButton.disabled = isBusy || !hasRoom;
        dom.panel.dataset.connected = isConnected ? 'true' : 'false';
    }

    function setPanelVisible(nextVisible = true) {
        const visible = Boolean(nextVisible);
        if (visible === isPanelVisible) {
            return;
        }
        isPanelVisible = visible;
        dom.panel.hidden = !isPanelVisible;
        if (!isPanelVisible) {
            isBusy = false;
            clearRoomState();
            teardownSocketConnection();
            updatePanel();
            return;
        }
        setStatus('Not in room. Open Welcome to create or join.', 'info');
        updatePanel();
    }

    function removeRemotePlayer(remote) {
        if (!remote) {
            return;
        }
        remote.skidMarkController?.reset?.();
        remote.crashDebrisController?.clearDebris?.();
        scene.remove(remote.car);
    }

    function addListener(target, event, handler) {
        target.addEventListener(event, handler);
        listeners.push({ target, event, handler });
    }

    function readProfileFromUi() {
        const safeName = sanitizePlayerName(localPlayerName || DEFAULT_PLAYER_NAME);
        localPlayerName = safeName;
        const safeColorHex = clampColorHex(getSelectedCarColorHex());
        return {
            name: safeName,
            colorHex: safeColorHex,
        };
    }

    function teardownSocketConnection() {
        if (!socket) {
            return;
        }
        socket.off('connect');
        socket.off('disconnect');
        socket.off('connect_error');
        socket.off('mp:roomState');
        socket.off('mp:playerState');
        socket.off('mp:collision');
        socket.off('mp:crashReplication');
        socket.off('mp:minePlaced');
        socket.off('mp:mineDetonated');
        socket.disconnect();
        socket = null;
    }
}

function resolveDom() {
    return {
        panel: document.getElementById('multiplayerPanel'),
        leaveButton: document.getElementById('multiplayerLeaveBtn'),
        roomMeta: document.getElementById('multiplayerRoomMeta'),
        roomCodeValue: document.getElementById('multiplayerRoomCodeValue'),
        playerCountValue: document.getElementById('multiplayerPlayerCountValue'),
        playerList: document.getElementById('multiplayerPlayerList'),
    };
}

function createNoopController() {
    return {
        initialize() {},
        update() {},
        dispose() {},
        setPanelVisible() {},
        isPanelVisible() {
            return false;
        },
        getCollisionSnapshots() {
            return [];
        },
        reportLocalVehicleContacts() {},
        reportMinePlaced() {
            return false;
        },
        reportMineDetonated() {
            return false;
        },
        reportPickupCollected(payload = null, ack = null) {
            if (typeof ack === 'function') {
                ack({
                    ok: false,
                    error: 'Offline',
                });
            }
            return false;
        },
        isInRoom() {
            return false;
        },
        getSelfId() {
            return '';
        },
        getLocalPlayerName() {
            return DEFAULT_PLAYER_NAME;
        },
        startOnlineRoomFlow() {
            return false;
        },
        getRoundStateSnapshot() {
            return null;
        },
        getScoreboardEntries() {
            return [];
        },
    };
}

function buildScoreboardEntries(players = [], selfId = '') {
    return players
        .filter((player) => player && typeof player === 'object')
        .map((player) => ({
            id: String(player.id || ''),
            name:
                typeof player.name === 'string' && player.name.trim()
                    ? player.name.trim()
                    : 'Player',
            collectedCount: Math.max(0, Math.round(Number(player.collectedCount) || 0)),
            isSelf: Boolean(player.id && player.id === selfId),
        }))
        .sort((a, b) => {
            const delta = (b.collectedCount || 0) - (a.collectedCount || 0);
            if (delta !== 0) {
                return delta;
            }
            return a.name.localeCompare(b.name);
        });
}

function sanitizeRoundStateSnapshot(roundState, scoreboard = []) {
    if (!roundState || typeof roundState !== 'object') {
        return null;
    }
    const totalPickups = clampNumber(roundState.totalPickups, 1, 5000, 30);
    const totalCollectedByPlayers = scoreboard.reduce(
        (sum, entry) => sum + Math.max(0, Number(entry?.collectedCount) || 0),
        0
    );
    const totalCollected = clampNumber(
        roundState.totalCollected,
        0,
        totalPickups,
        Math.min(totalPickups, totalCollectedByPlayers)
    );
    const finished = Boolean(roundState.finished) || totalCollected >= totalPickups;
    return {
        totalPickups,
        totalCollected,
        finished,
        finishedAt: clampNumber(roundState.finishedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    };
}

function readStorage(key) {
    try {
        return window.localStorage.getItem(key) || '';
    } catch {
        return '';
    }
}

function writeStorage(key, value) {
    try {
        window.localStorage.setItem(key, String(value ?? ''));
    } catch {
        // localStorage is optional.
    }
}

function sanitizePlayerName(value) {
    if (typeof value !== 'string') {
        return DEFAULT_PLAYER_NAME;
    }

    const normalized = value
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
        .slice(0, PLAYER_NAME_MAX_LENGTH);

    return normalized || DEFAULT_PLAYER_NAME;
}

function normalizeRoomCode(value) {
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

function normalizeOptionalRoomCode(value) {
    if (typeof value !== 'string') {
        return '';
    }

    const normalized = value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
    if (!normalized) {
        return '';
    }
    if (normalized.length !== ROOM_CODE_LENGTH) {
        return null;
    }
    return normalized;
}

function clampColorHex(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0x2d67a6;
    }
    return Math.max(0, Math.min(0xffffff, Math.round(numeric))) >>> 0;
}

function clampNumber(value, min, max, fallback = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
}

function lerpAngle(start, end, alpha) {
    const fullTurn = Math.PI * 2;
    let delta = end - start;
    delta = ((((delta + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
    return start + delta * alpha;
}

function normalizeAngle(value) {
    const fullTurn = Math.PI * 2;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return ((((numeric + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
