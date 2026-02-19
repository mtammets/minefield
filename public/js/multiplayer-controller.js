import { createCarRig } from './car.js';
import { createSkidMarkController } from './skidmarks.js';
import { createCrashDebrisController } from './crash-debris-system.js';

const MP_NAME_STORAGE_KEY = 'silentdrift-mp-player-name';
const MP_LAST_ROOM_STORAGE_KEY = 'silentdrift-mp-last-room';
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
    } = options;

    if (!scene || !car) {
        return createNoopController();
    }

    const dom = resolveDom();
    if (
        !dom.panel ||
        !dom.status ||
        !dom.nameInput ||
        !dom.roomInput ||
        !dom.createButton ||
        !dom.joinButton ||
        !dom.leaveButton ||
        !dom.roomMeta ||
        !dom.playerList
    ) {
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
    let lastProfileSyncedAt = 0;
    let lastProfileSignature = '';

    return {
        initialize,
        update,
        dispose,
        setPanelVisible,
        isPanelVisible() {
            return isPanelVisible;
        },
        getMiniMapMarkers,
        getCollisionSnapshots,
        reportLocalVehicleContacts,
        reportMinePlaced,
        reportMineDetonated,
        isInRoom,
        getSelfId,
        getLocalPlayerName,
        startOnlineRoomFlow,
    };

    function initialize() {
        if (isInitialized) {
            return;
        }
        isInitialized = true;

        const savedName = readStorage(MP_NAME_STORAGE_KEY);
        dom.nameInput.value = sanitizePlayerName(savedName || DEFAULT_PLAYER_NAME);

        const savedRoom = normalizeRoomCode(readStorage(MP_LAST_ROOM_STORAGE_KEY) || '');
        if (savedRoom) {
            dom.roomInput.value = savedRoom;
        }

        addListener(dom.createButton, 'click', handleCreateRoomClick);
        addListener(dom.joinButton, 'click', handleJoinRoomClick);
        addListener(dom.leaveButton, 'click', handleLeaveRoomClick);
        addListener(dom.roomInput, 'keydown', handleRoomInputKeyDown);
        addListener(dom.nameInput, 'change', handleNameInputChange);
        addListener(dom.nameInput, 'blur', handleNameInputChange);

        setStatus('Online mode available. Create or join a room.', 'info');
        renderPlayerList();
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
    }

    function getMiniMapMarkers() {
        if (!isPanelVisible) {
            return [];
        }
        const markers = [];
        const now = performance.now();
        for (const remote of remotePlayers.values()) {
            if (!remote.car.visible) {
                continue;
            }
            if (now - remote.lastStateAt > REMOTE_STATE_TIMEOUT_MS) {
                continue;
            }
            markers.push({
                x: remote.car.position.x,
                z: remote.car.position.z,
                rotationY: remote.car.rotation.y,
                colorHex: remote.colorHex,
            });
        }
        return markers;
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

    function isInRoom() {
        return Boolean(isPanelVisible && room?.roomCode && socket?.connected);
    }

    function getSelfId() {
        return selfId || socket?.id || '';
    }

    function getLocalPlayerName() {
        return sanitizePlayerName(dom.nameInput.value || DEFAULT_PLAYER_NAME);
    }

    function startOnlineRoomFlow(startContext = null) {
        if (!isPanelVisible || isBusy || room?.roomCode) {
            return false;
        }
        const preferredPlayerName = sanitizePlayerName(
            startContext?.playerName || dom.nameInput.value || DEFAULT_PLAYER_NAME
        );
        dom.nameInput.value = preferredPlayerName;
        writeStorage(MP_NAME_STORAGE_KEY, preferredPlayerName);
        const action = startContext?.roomAction === 'join' ? 'join' : 'create';
        if (action === 'create') {
            const createRoomCode = normalizeOptionalRoomCode(startContext?.roomCode);
            if (createRoomCode == null) {
                setStatus(`Room code must be ${ROOM_CODE_LENGTH} letters or numbers.`, 'error');
                updatePanel();
                return false;
            }
            if (createRoomCode) {
                dom.roomInput.value = createRoomCode;
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
        dom.roomInput.value = roomCode;
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

        const createRoomCode = normalizeOptionalRoomCode(explicitRoomCode || dom.roomInput.value);
        if (createRoomCode == null) {
            setStatus(`Room code must be ${ROOM_CODE_LENGTH} letters or numbers.`, 'error');
            updatePanel();
            return;
        }
        if (createRoomCode) {
            dom.roomInput.value = createRoomCode;
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
                setStatus(`Room ${response.room?.roomCode || ''} created.`, 'success');
                updatePanel();
            }
        );
    }

    function handleJoinRoomClick(explicitRoomCode = '') {
        if (isBusy) {
            return;
        }

        const roomCode = normalizeRoomCode(explicitRoomCode || dom.roomInput.value);
        if (!roomCode) {
            setStatus(`Room code must be ${ROOM_CODE_LENGTH} letters or numbers.`, 'error');
            return;
        }
        dom.roomInput.value = roomCode;

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
            setStatus(`Connected to room ${roomCode}.`, 'success');
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

    function handleRoomInputKeyDown(event) {
        if (event.key !== 'Enter') {
            return;
        }
        event.preventDefault();
        handleJoinRoomClick();
    }

    function handleNameInputChange() {
        const profile = readProfileFromUi();
        dom.nameInput.value = profile.name;
        writeStorage(MP_NAME_STORAGE_KEY, profile.name);
        maybeSyncProfile(true);
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
                setStatus('Connected. Create or join a room.', 'info');
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
                setStatus(`In room ${joinedRoomCode}.`, 'success');
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
        const crashReplicationState = getCrashReplicationState?.() || null;
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
            crashReplication: crashReplicationState,
            collectedCount: Math.max(0, Number(getPlayerCollectedCount()) || 0),
            isDestroyed: Boolean(getIsCarDestroyed()),
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

        room = snapshot;
        selfId = nextSelfId || socket?.id || '';
        if (Array.isArray(snapshot.mines)) {
            onMineSnapshot(snapshot.mines);
        }

        if (snapshot.roomCode) {
            dom.roomInput.value = snapshot.roomCode;
            writeStorage(MP_LAST_ROOM_STORAGE_KEY, snapshot.roomCode);
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
    }

    function clearRoomState() {
        room = null;
        selfId = '';
        lastStateSentAt = 0;
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
        const hasCrashReplicationState =
            state.crashReplication && typeof state.crashReplication === 'object';
        if (hasCrashReplicationState) {
            remote.crashDebrisController?.applyReplicationState?.(state.crashReplication);
        } else if (!wasDestroyed && remote.isDestroyed) {
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
        if (!room) {
            dom.roomMeta.textContent = 'Offline';
            return;
        }

        const roomCode = room.roomCode || '-';
        const playerCount =
            Number(room.playerCount) || (Array.isArray(room.players) ? room.players.length : 0);
        const maxPlayers = Number(room.maxPlayers) || 0;
        dom.roomMeta.textContent = `Room ${roomCode} | Players ${playerCount}/${maxPlayers}`;
    }

    function setStatus(message, tone = 'info') {
        dom.status.textContent = message;
        dom.status.dataset.tone = tone;
    }

    function updatePanel() {
        const hasRoom = Boolean(room?.roomCode);
        const isConnected = Boolean(socket?.connected);

        dom.createButton.disabled = isBusy || hasRoom;
        dom.joinButton.disabled = isBusy || hasRoom;
        dom.leaveButton.disabled = isBusy || !hasRoom;
        dom.nameInput.disabled = isBusy;
        dom.roomInput.disabled = isBusy || hasRoom;
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
        setStatus('Online mode available. Create or join a room.', 'info');
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
        const safeName = sanitizePlayerName(dom.nameInput.value || DEFAULT_PLAYER_NAME);
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
        socket.off('mp:minePlaced');
        socket.off('mp:mineDetonated');
        socket.disconnect();
        socket = null;
    }
}

function resolveDom() {
    return {
        panel: document.getElementById('multiplayerPanel'),
        status: document.getElementById('multiplayerStatus'),
        nameInput: document.getElementById('multiplayerNameInput'),
        roomInput: document.getElementById('multiplayerRoomInput'),
        createButton: document.getElementById('multiplayerCreateBtn'),
        joinButton: document.getElementById('multiplayerJoinBtn'),
        leaveButton: document.getElementById('multiplayerLeaveBtn'),
        roomMeta: document.getElementById('multiplayerRoomMeta'),
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
        getMiniMapMarkers() {
            return [];
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
