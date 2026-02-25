import { WORLD_MAP_DRIVE_LOCK_MODES } from './input-context.js';
import {
    beginHeavyEventFrame,
    getHeavyEventBudgetSnapshot,
} from './frame-heavy-event-budget.js';

const BOT_MINE_DEPLOY_MIN_SPEED = 8;
const BOT_MINE_DEPLOY_MAX_DISTANCE = 24;
const BOT_MINE_THROW_MAX_DISTANCE = 13.5;
const BOT_MINE_DROP_DOT_THRESHOLD = -0.2;
const BOT_MINE_THROW_DOT_THRESHOLD = 0.45;
const BOT_MINE_DECISION_MIN_INTERVAL_MS = 900;
const BOT_MINE_DECISION_MAX_INTERVAL_MS = 1700;
const BOT_MINE_POST_DEPLOY_MIN_INTERVAL_MS = 2400;
const BOT_MINE_POST_DEPLOY_MAX_INTERVAL_MS = 3800;
const VEHICLE_COLLISION_CULL_DISTANCE = 52;
const VEHICLE_COLLISION_CULL_DISTANCE_SQ =
    VEHICLE_COLLISION_CULL_DISTANCE * VEHICLE_COLLISION_CULL_DISTANCE;
const BOT_STATUS_UPDATE_INTERVAL_SEC = 1 / 12;
const RENDER_STALL_GUARD_EVENT_COOLDOWN_MS = 900;
const PRE_RENDER_LOAD_SHED_EVENT_COOLDOWN_MS = 900;
const PRE_RENDER_LOAD_SHED_SCORE_THRESHOLD = 4.6;
const HEAVY_EVENT_TOKENS_PER_FRAME = 2;
const HEAVY_EVENT_TOKENS_PER_FRAME_UNDER_LOAD = 1;
const EMPTY_ARRAY = Object.freeze([]);

export function createGameLoopController(options = {}) {
    const {
        clock,
        renderer,
        scene,
        camera,
        car,
        sunLight,
        carEditModeController,
        raceIntroController,
        chargingZoneController,
        chargingProgressHudController,
        skidMarkController,
        welcomeModalUi,
        starsController,
        objectiveUi,
        botStatusUi,
        collectibleSystem,
        replayController,
        multiplayerController,
        mineSystemController,
        mapUiController,
        graphicsQualityController,
        performanceDiagnosticsController = null,
        getPlayerTopSpeedLimit,
        crashDebrisController,
        replayEffectsController,
        audioController,
        scorePopupController,
        gameSessionController,
        getBotTrafficSystem,
        getMultiplayerCollisionSnapshots,
        getVehicleState,
        getGroundHeightAt,
        updateGroundMotion,
        updateCarVisuals,
        updateCamera,
        resetCameraTrackingState,
        setCameraKeyboardControlsEnabled,
        updatePlayerPhysics,
        applyInterpolatedPlayerTransform,
        initializePlayerPhysics,
        consumeVehicleCollisionContacts,
        consumeCrashCollision,
        worldBounds,
        staticObstacles,
        physicsStep = 1 / 120,
        maxPhysicsStepsPerFrame = 6,
        roundTotalPickups = 30,
        chargingBatteryGainPerSec = 16,
        playerCarPoolSize = 3,
        getPhysicsAccumulator,
        setPhysicsAccumulator,
        getIsGamePaused,
        getIsCarDestroyed,
        getIsBatteryDepleted,
        getPlayerCollectedCount,
        getPlayerScore,
        getPlayerCarsRemaining,
        getPickupRoundFinished,
        getTotalCollectedCount,
        getTotalScore,
        getCollectorScore = () => 0,
        getBotsEnabled,
        getGameMode,
        getIsWelcomeModalVisible,
        getLocalPlayerId,
        getWorldMapDriveLockMode,
        getIsWorldMapOpen,
    } = options;

    if (!clock || !renderer || !scene || !camera || !car) {
        return {
            start() {},
            stop() {},
            isRunning() {
                return false;
            },
        };
    }

    const readPhysicsAccumulator =
        typeof getPhysicsAccumulator === 'function' ? getPhysicsAccumulator : () => 0;
    const writePhysicsAccumulator =
        typeof setPhysicsAccumulator === 'function' ? setPhysicsAccumulator : () => {};
    const readGamePaused = typeof getIsGamePaused === 'function' ? getIsGamePaused : () => false;
    const readCarDestroyed =
        typeof getIsCarDestroyed === 'function' ? getIsCarDestroyed : () => false;
    const readBatteryDepleted =
        typeof getIsBatteryDepleted === 'function' ? getIsBatteryDepleted : () => false;
    const readPlayerCollectedCount =
        typeof getPlayerCollectedCount === 'function' ? getPlayerCollectedCount : () => 0;
    const readPlayerScore = typeof getPlayerScore === 'function' ? getPlayerScore : () => 0;
    const readPlayerCarsRemaining =
        typeof getPlayerCarsRemaining === 'function' ? getPlayerCarsRemaining : () => 0;
    const readPickupRoundFinished =
        typeof getPickupRoundFinished === 'function' ? getPickupRoundFinished : () => false;
    const readTotalCollectedCount =
        typeof getTotalCollectedCount === 'function' ? getTotalCollectedCount : () => 0;
    const readTotalScore = typeof getTotalScore === 'function' ? getTotalScore : () => 0;
    const readBotsEnabled = typeof getBotsEnabled === 'function' ? getBotsEnabled : () => true;
    const readGameMode = typeof getGameMode === 'function' ? getGameMode : () => 'bots';
    const readWelcomeModalVisible =
        typeof getIsWelcomeModalVisible === 'function' ? getIsWelcomeModalVisible : () => false;
    const readLocalPlayerId = typeof getLocalPlayerId === 'function' ? getLocalPlayerId : () => '';
    const readWorldMapDriveLockMode =
        typeof getWorldMapDriveLockMode === 'function'
            ? getWorldMapDriveLockMode
            : () => WORLD_MAP_DRIVE_LOCK_MODES.none;
    const readWorldMapOpen =
        typeof getIsWorldMapOpen === 'function' ? getIsWorldMapOpen : () => false;

    let running = false;
    let animationFrameId = null;
    const botMineDecisionById = new Map();
    const vehicleCollisionSnapshotBuffer = [];
    const vehicleContactsBuffer = [];
    const botCollisionSnapshotBuffer = [];
    const multiplayerCollisionSnapshotBuffer = [];
    const latestMultiplayerCollisionSnapshots = [];
    const collectorBuffer = [{ id: 'player', position: car.position }];
    const botHudEntriesBuffer = [];
    const botHudEntryByCollectorId = new Map();
    const mapFrameCache = {
        pickups: EMPTY_ARRAY,
        botDescriptors: EMPTY_ARRAY,
        remotePlayers: EMPTY_ARRAY,
        mines: EMPTY_ARRAY,
    };
    const mapFrameState = {
        playerPosition: car.position,
        playerHeading: 0,
        playerSpeedKph: 0,
        getPickups() {
            return mapFrameCache.pickups;
        },
        getBotDescriptors() {
            return mapFrameCache.botDescriptors;
        },
        getRemotePlayers() {
            return mapFrameCache.remotePlayers;
        },
        getMines() {
            return mapFrameCache.mines;
        },
        gameMode: 'bots',
        welcomeVisible: false,
        raceIntroActive: false,
        editModeActive: false,
    };
    const audioFrameState = {
        vehicleState: getVehicleState(),
        isPaused: false,
        welcomeVisible: false,
        editModeActive: false,
        raceIntroActive: false,
        replayActive: false,
        isCarDestroyed: false,
        pickupRoundFinished: false,
        isBatteryDepleted: false,
        isChargingActive: false,
        chargingLevel: 0,
        worldMapVisible: false,
        gameMode: 'bots',
    };
    const chargingHudFrameState = {
        enabled: false,
        isCharging: false,
        chargingLevel: 0,
        batteryDepleted: false,
    };
    const skidMarkFrameState = {
        enabled: false,
        vehicle: car,
        vehicleState: null,
    };
    const mineFrameState = {
        localCarPosition: car.position,
        localPlayerId: '',
        enableLocalCollision: false,
    };
    let botHudUpdateTimer = BOT_STATUS_UPDATE_INTERVAL_SEC;
    let botMineDecisionStamp = 0;
    let botHudEntryStamp = 0;
    let lastRenderStallGuardEventAtMs = -Number.POSITIVE_INFINITY;
    let lastPreRenderLoadShedEventAtMs = -Number.POSITIVE_INFINITY;
    let frameSequence = 0;

    return {
        start() {
            if (running) {
                return;
            }
            running = true;
            frame();
        },
        stop() {
            running = false;
            if (animationFrameId != null) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        },
        isRunning() {
            return running;
        },
    };

    function collectRuntimePerfHints() {
        const hints = {};
        const crashPerf = crashDebrisController?.getPerformanceSnapshot?.() || null;
        const minePerf = mineSystemController?.getPerformanceSnapshot?.() || null;
        const botPerf = getBotTrafficSystem?.()?.getPerformanceSnapshot?.() || null;
        const collectiblePerf = collectibleSystem?.getPerformanceSnapshot?.() || null;
        const graphicsPerf = graphicsQualityController?.getSnapshot?.() || null;
        const heavyEventBudget = getHeavyEventBudgetSnapshot();

        assignPerfHint(hints, 'pendingCrashDebrisSpawns', crashPerf?.pendingDebrisSpawns);
        assignPerfHint(
            hints,
            'pendingCrashExplosionDetaches',
            crashPerf?.pendingExplosionDetaches
        );
        assignPerfHint(hints, 'activeCrashDebrisPieces', crashPerf?.activeDebrisPieces);
        assignPerfHint(hints, 'visibleCrashDebrisPieces', crashPerf?.visibleDebrisPieces);
        assignPerfHint(hints, 'droppedCrashDebrisSpawns', crashPerf?.droppedPendingDebrisSpawns);
        assignPerfHint(
            hints,
            'droppedCrashExplosionDetaches',
            crashPerf?.droppedPendingExplosionDetaches
        );
        assignPerfHint(hints, 'droppedCrashDebrisPoolMisses', crashPerf?.droppedDebrisPoolMisses);

        assignPerfHint(hints, 'pendingMineDetonationSpawns', minePerf?.pendingDetonationSpawns);
        assignPerfHint(hints, 'activeMineDetonationEffects', minePerf?.activeDetonationEffects);
        assignPerfHint(hints, 'activeMineDetonationLights', minePerf?.activeDetonationLights);
        assignPerfHint(hints, 'mineDetonationBurstCount', minePerf?.detonationBurstCount);
        assignPerfHint(hints, 'droppedMineDetonationEffects', minePerf?.droppedDetonationEffects);

        assignPerfHint(hints, 'pendingBotMineDebris', botPerf?.pendingMineDebris);
        assignPerfHint(hints, 'activeBotDetachedDebris', botPerf?.activeDetachedDebris);
        assignPerfHint(hints, 'visibleBotDetachedDebris', botPerf?.visibleDetachedDebris);
        assignPerfHint(hints, 'droppedBotMineDebris', botPerf?.droppedPendingMineDebris);
        assignPerfHint(
            hints,
            'droppedBotDebrisPoolMisses',
            botPerf?.droppedDetachedDebrisPoolMisses
        );

        assignPerfHint(hints, 'pendingCollectEffects', collectiblePerf?.pendingCollectEffects);
        assignPerfHint(hints, 'activeCollectEffects', collectiblePerf?.activeCollectEffects);
        assignPerfHint(hints, 'droppedCollectEffects', collectiblePerf?.droppedCollectEffects);
        assignPerfHint(
            hints,
            'skippedRemoteCollectEffects',
            collectiblePerf?.skippedRemoteCollectEffects
        );
        assignPerfHint(hints, 'graphicsRenderScalePercent', graphicsPerf?.renderScalePercent);
        assignPerfHint(
            hints,
            'graphicsStallGuardScalePercent',
            graphicsPerf?.stallGuardScalePercent
        );
        assignPerfHint(
            hints,
            'graphicsStallGuardTriggerCount',
            graphicsPerf?.stallGuardTriggerCount
        );
        assignPerfHint(
            hints,
            'graphicsPreRenderGuardTriggerCount',
            graphicsPerf?.preRenderGuardTriggerCount
        );
        assignPerfHint(
            hints,
            'graphicsStallGuardActive',
            graphicsPerf?.stallGuardActive ? 1 : 0
        );
        assignPerfHint(hints, 'heavyEventTokensPerFrame', heavyEventBudget?.tokensPerFrame);
        assignPerfHint(hints, 'heavyEventTokensRemaining', heavyEventBudget?.tokensRemaining);
        assignPerfHint(hints, 'heavyEventTokensConsumed', heavyEventBudget?.consumedThisFrame);
        assignPerfHint(hints, 'heavyEventTokensDenied', heavyEventBudget?.deniedThisFrame);
        return hints;
    }

    function assignPerfHint(target, key, value) {
        if (!target || typeof target !== 'object' || typeof key !== 'string' || !key) {
            return;
        }
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return;
        }
        target[key] = Math.max(0, Math.round(numeric));
    }

    function reportFrameDiagnostics(frameStartMs, frameDelta, stageDurations = {}, context = {}) {
        if (typeof performanceDiagnosticsController?.update !== 'function') {
            return;
        }
        const frameMs = Math.max(0, performance.now() - frameStartMs);
        const renderInfo = renderer?.info?.render || null;
        const runtimePerfHints = collectRuntimePerfHints();
        performanceDiagnosticsController.update({
            frameMs,
            frameDeltaSec: Math.max(0, Number(frameDelta) || 0),
            stageDurations,
            context: {
                ...context,
                ...runtimePerfHints,
                maxPhysicsSteps: maxPhysicsStepsPerFrame,
                drawCalls: Math.max(0, Math.round(Number(renderInfo?.calls) || 0)),
                triangles: Math.max(0, Math.round(Number(renderInfo?.triangles) || 0)),
                points: Math.max(0, Math.round(Number(renderInfo?.points) || 0)),
            },
        });
    }

    function frame() {
        if (!running) {
            return;
        }
        animationFrameId = requestAnimationFrame(frame);

        const frameStartMs = performance.now();
        const stageDurations = Object.create(null);
        const addStageDuration = (stageKey, durationMs) => {
            const resolvedKey = typeof stageKey === 'string' ? stageKey : '';
            const resolvedDuration = Number(durationMs);
            if (!resolvedKey || !Number.isFinite(resolvedDuration) || resolvedDuration <= 0) {
                return;
            }
            stageDurations[resolvedKey] = (stageDurations[resolvedKey] || 0) + resolvedDuration;
        };
        const measureStage = (stageKey, callback = null) => {
            const startMs = performance.now();
            try {
                if (typeof callback === 'function') {
                    return callback();
                }
                return undefined;
            } finally {
                addStageDuration(stageKey, performance.now() - startMs);
            }
        };

        const frameDelta = Math.min(clock.getDelta(), 0.05);
        frameSequence = frameSequence >= 0x3fffffff ? 1 : frameSequence + 1;
        const heavyEventTokenBudget =
            frameDelta > 1 / 38
                ? HEAVY_EVENT_TOKENS_PER_FRAME_UNDER_LOAD
                : HEAVY_EVENT_TOKENS_PER_FRAME;
        beginHeavyEventFrame(frameSequence, heavyEventTokenBudget);
        const isEditModeActive = carEditModeController.isActive();
        const isWelcomeVisible = readWelcomeModalVisible();
        const worldMapDriveLockMode = readWorldMapDriveLockMode();
        const gamePaused = readGamePaused();
        let chargingHudEnabled = false;
        let chargingHudActive = false;
        let chargingHudLevel = 0;
        let skidMarksEnabled = false;
        let skidMarkVehicleState = null;
        let mineCollisionEnabled = false;
        let visiblePickups = null;
        let botCollectorDescriptors = EMPTY_ARRAY;
        let botHudState = EMPTY_ARRAY;
        let multiplayerSnapshotsCaptured = false;
        let frameReplayActive = false;
        let framePhysicsSteps = 0;
        let frameVehicleContactsCount = 0;
        let frameCrashCollisionTriggered = false;
        let frameBotCollectorCount = 0;

        welcomeModalUi.update(frameDelta);
        if (isWelcomeVisible && !isEditModeActive) {
            const welcomeStageStartMs = performance.now();
            chargingZoneController.update(car.position, frameDelta, { enabled: false });

            chargingHudFrameState.enabled = false;
            chargingHudFrameState.isCharging = false;
            chargingHudFrameState.chargingLevel = 0;
            chargingHudFrameState.batteryDepleted = readBatteryDepleted();
            chargingProgressHudController.update(frameDelta, chargingHudFrameState);

            skidMarkFrameState.enabled = false;
            skidMarkFrameState.vehicleState = null;
            skidMarkController.update(frameDelta, skidMarkFrameState);

            mineFrameState.localPlayerId = readLocalPlayerId();
            mineFrameState.enableLocalCollision = false;
            mineSystemController?.update?.(frameDelta, mineFrameState);

            mapFrameCache.pickups = EMPTY_ARRAY;
            mapFrameCache.botDescriptors = EMPTY_ARRAY;
            mapFrameCache.remotePlayers = EMPTY_ARRAY;
            mapFrameCache.mines = mineSystemController?.getMineMarkers?.() || EMPTY_ARRAY;
            mapFrameState.playerHeading = car.rotation.y;
            mapFrameState.playerSpeedKph = 0;
            mapFrameState.gameMode = readGameMode();
            mapFrameState.welcomeVisible = true;
            mapFrameState.raceIntroActive = raceIntroController.isActive();
            mapFrameState.editModeActive = false;
            mapUiController?.update?.(frameDelta, mapFrameState);

            audioFrameState.vehicleState = getVehicleState();
            audioFrameState.isPaused = true;
            audioFrameState.welcomeVisible = true;
            audioFrameState.editModeActive = false;
            audioFrameState.raceIntroActive = raceIntroController.isActive();
            audioFrameState.replayActive = replayController.isPlaybackActive();
            audioFrameState.isCarDestroyed = readCarDestroyed();
            audioFrameState.pickupRoundFinished = readPickupRoundFinished();
            audioFrameState.isBatteryDepleted = readBatteryDepleted();
            audioFrameState.isChargingActive = false;
            audioFrameState.chargingLevel = 0;
            audioFrameState.worldMapVisible = readWorldMapOpen();
            audioFrameState.gameMode = readGameMode();
            audioController?.update?.(frameDelta, audioFrameState);
            scorePopupController?.update?.(camera, frameDelta);

            if (typeof renderer.clear === 'function') {
                measureStage('render', () => {
                    renderer.clear();
                });
            }
            addStageDuration('welcome', performance.now() - welcomeStageStartMs);
            reportFrameDiagnostics(frameStartMs, frameDelta, stageDurations, {
                welcomeVisible: true,
                gameMode: readGameMode(),
                worldMapOpen: readWorldMapOpen(),
                paused: true,
                editModeActive: false,
                replayActive: replayController.isPlaybackActive(),
                physicsSteps: 0,
                vehicleContactsCount: 0,
                crashCollisionTriggered: false,
                botCollectorCount: 0,
                mineCollisionEnabled: false,
            });
            return;
        }

        measureStage('multiplayer', () => {
            multiplayerController?.update?.(frameDelta);
        });

        const simulationStageStartMs = performance.now();
        if (!gamePaused && !isEditModeActive) {
            if (worldMapDriveLockMode === WORLD_MAP_DRIVE_LOCK_MODES.autobrake) {
                gameSessionController?.enforceDriveLockMode?.(WORLD_MAP_DRIVE_LOCK_MODES.autobrake);
            }
            if (raceIntroController.isActive()) {
                writePhysicsAccumulator(0);
                chargingZoneController.update(car.position, frameDelta, { enabled: false });
                const vehicleState = getVehicleState();
                vehicleState.chargingLevelNormalized = 0;
                vehicleState.batteryDepleted = readBatteryDepleted();
                updateCarVisuals(vehicleState, frameDelta);
                const introFinished = raceIntroController.update(frameDelta);
                updateGroundMotion(car.position, 0);
                starsController.update(frameDelta);
                if (introFinished) {
                    resetCameraTrackingState();
                    setCameraKeyboardControlsEnabled(!carEditModeController.isActive());
                    objectiveUi.showInfo('GO! Hit the track!', 950);
                }
            } else {
                crashDebrisController.tickImpactStatusCooldown(frameDelta);

                const vehicleState = getVehicleState();
                const replayActive = replayController.isPlaybackActive();
                frameReplayActive = replayActive;
                const isCarDestroyed = readCarDestroyed();
                const pickupRoundFinished = readPickupRoundFinished();
                const isBatteryDepleted = readBatteryDepleted();
                const chargingContextEnabled =
                    !replayActive && !isCarDestroyed && !pickupRoundFinished;
                mineCollisionEnabled = chargingContextEnabled;
                const chargingSnapshot = chargingZoneController.update(car.position, frameDelta, {
                    enabled: chargingContextEnabled,
                });
                chargingHudEnabled = chargingContextEnabled;
                chargingHudActive = chargingSnapshot.isChargingActive && chargingContextEnabled;
                chargingHudLevel = chargingSnapshot.visualLevel;
                vehicleState.chargingLevelNormalized = chargingSnapshot.visualLevel;
                if (chargingSnapshot.startedThisFrame) {
                    objectiveUi.showInfo(
                        'Charging started. Battery fills while you stay inside the ring.',
                        2200
                    );
                }
                if (chargingSnapshot.isChargingActive && chargingContextEnabled) {
                    gameSessionController.addBattery(chargingBatteryGainPerSec * frameDelta);
                }
                let visualState = vehicleState;

                if (replayActive) {
                    writePhysicsAccumulator(0);
                    const replayFrame = measureStage('replay', () =>
                        replayController.updatePlayback(frameDelta)
                    );
                    if (replayFrame?.vehicleState) {
                        visualState = replayFrame.vehicleState;
                    }
                    const topSpeedTune =
                        typeof getPlayerTopSpeedLimit === 'function'
                            ? getPlayerTopSpeedLimit()
                            : { topSpeedKph: 0, topSpeedPercent: 0 };
                    visualState.topSpeedLimitKph = topSpeedTune.topSpeedKph;
                    visualState.topSpeedLimitPercent = topSpeedTune.topSpeedPercent;
                    visualState.chargingLevelNormalized = chargingSnapshot.visualLevel;
                    visualState.batteryDepleted = false;
                    updateCarVisuals(visualState, frameDelta);
                    replayEffectsController.processReplayEvents(replayFrame?.events);

                    if (!replayController.isPlaybackActive()) {
                        replayEffectsController.clearReplayEffects();
                        gameSessionController.clearPendingRespawn();
                        initializePlayerPhysics(car);
                        crashDebrisController.resetPlayerDamageState();
                        writePhysicsAccumulator(0);
                        objectiveUi.showInfo('TV replay ended.');
                    }
                } else if (!isCarDestroyed && !pickupRoundFinished) {
                    let physicsAccumulator = readPhysicsAccumulator() + frameDelta;
                    const botTrafficSystem = getBotTrafficSystem();
                    const botsEnabled = readBotsEnabled();
                    const rawBotCollisionSnapshots = botsEnabled
                        ? botTrafficSystem?.getCollisionSnapshots?.() || EMPTY_ARRAY
                        : EMPTY_ARRAY;
                    const rawMultiplayerCollisionSnapshots =
                        typeof getMultiplayerCollisionSnapshots === 'function'
                            ? getMultiplayerCollisionSnapshots() || EMPTY_ARRAY
                            : multiplayerController?.getCollisionSnapshots?.() || EMPTY_ARRAY;
                    multiplayerSnapshotsCaptured = true;
                    latestMultiplayerCollisionSnapshots.length = 0;
                    appendCollisionSnapshots(
                        latestMultiplayerCollisionSnapshots,
                        rawMultiplayerCollisionSnapshots
                    );

                    filterCollisionSnapshotsByDistance(
                        rawBotCollisionSnapshots,
                        car.position,
                        VEHICLE_COLLISION_CULL_DISTANCE_SQ,
                        botCollisionSnapshotBuffer
                    );
                    filterCollisionSnapshotsByDistance(
                        rawMultiplayerCollisionSnapshots,
                        car.position,
                        VEHICLE_COLLISION_CULL_DISTANCE_SQ,
                        multiplayerCollisionSnapshotBuffer
                    );
                    vehicleCollisionSnapshotBuffer.length = 0;
                    appendCollisionSnapshots(
                        vehicleCollisionSnapshotBuffer,
                        botCollisionSnapshotBuffer
                    );
                    appendCollisionSnapshots(
                        vehicleCollisionSnapshotBuffer,
                        multiplayerCollisionSnapshotBuffer
                    );
                    if (isBatteryDepleted) {
                        gameSessionController.clearDriveKeys();
                    }

                    let physicsSteps = 0;
                    const physicsStageStartMs = performance.now();
                    while (
                        physicsAccumulator >= physicsStep &&
                        physicsSteps < maxPhysicsStepsPerFrame
                    ) {
                        updatePlayerPhysics(
                            car,
                            physicsStep,
                            worldBounds,
                            staticObstacles,
                            vehicleCollisionSnapshotBuffer,
                            getGroundHeightAt
                        );
                        physicsAccumulator -= physicsStep;
                        physicsSteps += 1;
                    }
                    addStageDuration('physics', performance.now() - physicsStageStartMs);
                    framePhysicsSteps = physicsSteps;

                    if (
                        physicsSteps === maxPhysicsStepsPerFrame &&
                        physicsAccumulator > physicsStep
                    ) {
                        physicsAccumulator = physicsStep;
                    }
                    writePhysicsAccumulator(physicsAccumulator);

                    const vehicleContacts = consumeVehicleCollisionContacts(vehicleContactsBuffer);
                    frameVehicleContactsCount = vehicleContacts.length;
                    if (vehicleContacts.length > 0) {
                        crashDebrisController.processVehicleCollisionContacts(vehicleContacts);
                        audioController?.onVehicleCollisionContacts?.(vehicleContacts);
                        multiplayerController?.reportLocalVehicleContacts?.(
                            vehicleContacts,
                            vehicleState
                        );
                    }

                    const crashCollision = consumeCrashCollision();
                    if (crashCollision && !readCarDestroyed()) {
                        frameCrashCollisionTriggered = true;
                        audioController?.onObstacleCrash?.(crashCollision);
                        gameSessionController.triggerObstacleCrash(crashCollision);
                    }

                    if (!readCarDestroyed()) {
                        const interpolationAlpha = readPhysicsAccumulator() / physicsStep;
                        applyInterpolatedPlayerTransform(car, interpolationAlpha);
                        vehicleState.chargingLevelNormalized = chargingSnapshot.visualLevel;
                        vehicleState.batteryDepleted = readBatteryDepleted();
                        updateCarVisuals(vehicleState, frameDelta);
                        gameSessionController.updateBattery(vehicleState, frameDelta);
                        replayController.updateRecording(frameDelta, vehicleState);
                        skidMarksEnabled = true;
                        skidMarkVehicleState = vehicleState;
                    } else {
                        writePhysicsAccumulator(0);
                        measureStage('crashDebris', () => {
                            crashDebrisController.updateDebris(frameDelta);
                        });
                    }
                } else {
                    writePhysicsAccumulator(0);
                    measureStage('crashDebris', () => {
                        crashDebrisController.updateDebris(frameDelta);
                    });
                }

                const cameraSpeed = readCarDestroyed() ? 0 : visualState?.speed || 0;
                if (!replayActive) {
                    updateCamera(car, cameraSpeed, frameDelta);
                }
                updateGroundMotion(car.position, cameraSpeed);
                starsController.update(frameDelta);
                if (!replayActive && !readPickupRoundFinished()) {
                    const botTrafficSystem = getBotTrafficSystem();
                    const botsEnabled = readBotsEnabled();
                    visiblePickups = collectibleSystem.getVisiblePickups();
                    if (botsEnabled) {
                        const botTrafficStageStartMs = performance.now();
                        botTrafficSystem?.update?.(car.position, visiblePickups, frameDelta);
                        updateBotMineDeployment(
                            botTrafficSystem?.getCollisionSnapshots?.() || EMPTY_ARRAY,
                            frameDelta
                        );
                        addStageDuration('botTraffic', performance.now() - botTrafficStageStartMs);
                        botCollectorDescriptors =
                            botTrafficSystem?.getCollectorDescriptors?.() || EMPTY_ARRAY;
                        frameBotCollectorCount = botCollectorDescriptors.length;
                        botHudState = botTrafficSystem?.getHudState?.() || EMPTY_ARRAY;
                    } else {
                        botMineDecisionById.clear();
                    }

                    collectorBuffer.length = 1;
                    if (botsEnabled) {
                        appendCollisionSnapshots(collectorBuffer, botCollectorDescriptors);
                    }
                    measureStage('collectibles', () => {
                        collectibleSystem.updateForCollectors(collectorBuffer, frameDelta);
                    });
                    if (botsEnabled) {
                        gameSessionController?.maybeFinalizeOnBotElimination?.({
                            totalPickups: roundTotalPickups,
                            botHudState,
                        });
                    }
                    const totalCollectedCount = readTotalCollectedCount();
                    if (botsEnabled && totalCollectedCount >= roundTotalPickups) {
                        gameSessionController.finalizePickupRound(
                            roundTotalPickups,
                            totalCollectedCount,
                            {
                                totalScore: readTotalScore(),
                                deferUiFrames: 2,
                            }
                        );
                    }
                    botHudUpdateTimer += frameDelta;
                    if (botHudUpdateTimer >= BOT_STATUS_UPDATE_INTERVAL_SEC) {
                        botHudUpdateTimer = 0;
                        botStatusUi.render(
                            botsEnabled ? buildBotHudEntries(botHudState) : EMPTY_ARRAY,
                            createPlayerHudState()
                        );
                    }
                }

                replayEffectsController.updateReplayEffects(frameDelta);
                if (
                    (replayActive || !readCarDestroyed()) &&
                    crashDebrisController.hasActiveDebrisOrExplosion()
                ) {
                    measureStage('crashDebris', () => {
                        crashDebrisController.updateDebris(frameDelta);
                    });
                }
            }
        } else if (isEditModeActive) {
            chargingZoneController.update(car.position, frameDelta, { enabled: false });
            const inspectionVehicleState = getVehicleState();
            inspectionVehicleState.chargingLevelNormalized = 0;
            inspectionVehicleState.batteryDepleted = false;
            updateCarVisuals(inspectionVehicleState, frameDelta);
            if (isEditModeActive) {
                carEditModeController.update(frameDelta);
            }
            starsController.update(frameDelta);
            updateGroundMotion(car.position, 0);
        } else {
            chargingZoneController.update(car.position, frameDelta, { enabled: false });
        }
        addStageDuration('simulation', performance.now() - simulationStageStartMs);

        chargingHudFrameState.enabled = chargingHudEnabled;
        chargingHudFrameState.isCharging = chargingHudActive;
        chargingHudFrameState.chargingLevel = chargingHudLevel;
        chargingHudFrameState.batteryDepleted = readBatteryDepleted();
        chargingProgressHudController.update(frameDelta, chargingHudFrameState);

        skidMarkFrameState.enabled = skidMarksEnabled;
        skidMarkFrameState.vehicleState = skidMarkVehicleState;
        skidMarkController.update(frameDelta, skidMarkFrameState);

        mineFrameState.localPlayerId = readLocalPlayerId();
        mineFrameState.enableLocalCollision = mineCollisionEnabled;
        measureStage('mineSystem', () => {
            mineSystemController?.update?.(frameDelta, mineFrameState);
        });

        if (!multiplayerSnapshotsCaptured) {
            latestMultiplayerCollisionSnapshots.length = 0;
            const multiplayerSnapshots =
                typeof getMultiplayerCollisionSnapshots === 'function'
                    ? getMultiplayerCollisionSnapshots() || EMPTY_ARRAY
                    : multiplayerController?.getCollisionSnapshots?.() || EMPTY_ARRAY;
            appendCollisionSnapshots(latestMultiplayerCollisionSnapshots, multiplayerSnapshots);
        }
        if (botCollectorDescriptors === EMPTY_ARRAY && readBotsEnabled()) {
            botCollectorDescriptors =
                getBotTrafficSystem()?.getCollectorDescriptors?.() || EMPTY_ARRAY;
        }

        mapFrameCache.pickups = visiblePickups || collectibleSystem.getVisiblePickups();
        mapFrameCache.botDescriptors = readBotsEnabled() ? botCollectorDescriptors : EMPTY_ARRAY;
        mapFrameCache.remotePlayers = latestMultiplayerCollisionSnapshots;
        mapFrameCache.mines = mineSystemController?.getMineMarkers?.() || EMPTY_ARRAY;
        mapFrameState.playerHeading = car.rotation.y;
        mapFrameState.playerSpeedKph = Math.abs(getVehicleState()?.speed || 0);
        mapFrameState.gameMode = readGameMode();
        mapFrameState.welcomeVisible = readWelcomeModalVisible();
        mapFrameState.raceIntroActive = raceIntroController.isActive();
        mapFrameState.editModeActive = isEditModeActive;
        measureStage('mapUi', () => {
            mapUiController?.update?.(frameDelta, mapFrameState);
        });

        audioFrameState.vehicleState = getVehicleState();
        audioFrameState.isPaused = gamePaused;
        audioFrameState.welcomeVisible = readWelcomeModalVisible();
        audioFrameState.editModeActive = isEditModeActive;
        audioFrameState.raceIntroActive = raceIntroController.isActive();
        audioFrameState.replayActive = replayController.isPlaybackActive();
        audioFrameState.isCarDestroyed = readCarDestroyed();
        audioFrameState.pickupRoundFinished = readPickupRoundFinished();
        audioFrameState.isBatteryDepleted = readBatteryDepleted();
        audioFrameState.isChargingActive = chargingHudActive;
        audioFrameState.chargingLevel = chargingHudLevel;
        audioFrameState.worldMapVisible = readWorldMapOpen();
        audioFrameState.gameMode = readGameMode();
        measureStage('audio', () => {
            audioController?.update?.(frameDelta, audioFrameState);
        });
        measureStage('scorePopup', () => {
            scorePopupController?.update?.(camera, frameDelta);
        });

        const worldMapOpen = readWorldMapOpen();
        const qualityAdaptiveAllowed =
            !gamePaused &&
            !isEditModeActive &&
            !readWelcomeModalVisible() &&
            !worldMapOpen;
        maybeApplyPreRenderLoadShed({
            adaptiveAllowed: qualityAdaptiveAllowed,
            gameMode: readGameMode(),
            worldMapOpen,
            crashCollisionTriggered: frameCrashCollisionTriggered,
            vehicleContactsCount: frameVehicleContactsCount,
        });
        updateSunLightPosition();
        measureStage('render', () => {
            renderer.render(scene, camera);
        });
        maybeApplyRenderStallGuard({
            frameStartMs,
            renderStageMs: stageDurations.render,
            adaptiveAllowed: qualityAdaptiveAllowed,
            gameMode: readGameMode(),
            worldMapOpen,
        });
        measureStage('quality', () => {
            graphicsQualityController?.sampleFrame?.(frameDelta, {
                allowAdaptive: qualityAdaptiveAllowed,
            });
        });

        reportFrameDiagnostics(frameStartMs, frameDelta, stageDurations, {
            welcomeVisible: isWelcomeVisible,
            gameMode: readGameMode(),
            worldMapOpen,
            paused: gamePaused,
            editModeActive: isEditModeActive,
            replayActive: frameReplayActive || replayController.isPlaybackActive(),
            physicsSteps: framePhysicsSteps,
            vehicleContactsCount: frameVehicleContactsCount,
            crashCollisionTriggered: frameCrashCollisionTriggered,
            botCollectorCount: frameBotCollectorCount,
            mineCollisionEnabled,
            chargingActive: chargingHudActive,
        });
    }

    function maybeApplyPreRenderLoadShed({
        adaptiveAllowed = false,
        gameMode = 'bots',
        worldMapOpen = false,
        crashCollisionTriggered = false,
        vehicleContactsCount = 0,
    } = {}) {
        if (!adaptiveAllowed) {
            return;
        }
        const pressureState = collectPreRenderPressureState();
        const pressureScore = computePreRenderPressureScore(pressureState, {
            crashCollisionTriggered,
            vehicleContactsCount,
        });
        if (pressureScore <= 0) {
            return;
        }

        const loadShedResult = graphicsQualityController?.reportPreRenderPressure?.({
            pressureScore,
        });
        if (!loadShedResult?.triggered) {
            return;
        }

        const nowMs = performance.now();
        if (nowMs - lastPreRenderLoadShedEventAtMs < PRE_RENDER_LOAD_SHED_EVENT_COOLDOWN_MS) {
            return;
        }
        lastPreRenderLoadShedEventAtMs = nowMs;

        performanceDiagnosticsController?.recordEvent?.(
            'graphics_preemptive_load_shed',
            {
                pressureScore: Number(pressureScore.toFixed(2)),
                pendingMineDetonationSpawns: pressureState.pendingMineDetonationSpawns,
                activeMineDetonationEffects: pressureState.activeMineDetonationEffects,
                pendingBotMineDebris: pressureState.pendingBotMineDebris,
                activeBotDetachedDebris: pressureState.activeBotDetachedDebris,
                pendingCrashDebrisSpawns: pressureState.pendingCrashDebrisSpawns,
                pendingCrashExplosionDetaches: pressureState.pendingCrashExplosionDetaches,
                activeCrashDebrisPieces: pressureState.activeCrashDebrisPieces,
                pendingCollectEffects: pressureState.pendingCollectEffects,
                activeCollectEffects: pressureState.activeCollectEffects,
                heavyEventTokensRemaining: pressureState.heavyEventTokensRemaining,
                heavyEventTokensDenied: pressureState.heavyEventTokensDenied,
                crashCollisionTriggered: Boolean(crashCollisionTriggered),
                vehicleContactsCount: Math.max(
                    0,
                    Math.round(Number(vehicleContactsCount) || 0)
                ),
                pixelRatioCap: Number((Number(loadShedResult.pixelRatioCap) || 0).toFixed(3)),
                stallGuardScalePercent: Math.max(
                    10,
                    Math.round((Number(loadShedResult.stallGuardScale) || 1) * 100)
                ),
                gameMode: typeof gameMode === 'string' ? gameMode : 'bots',
                worldMapOpen: Boolean(worldMapOpen),
            },
            {
                label: 'graphics preemptive guard',
                severity: 'info',
            }
        );
    }

    function maybeApplyRenderStallGuard({
        frameStartMs = 0,
        renderStageMs = 0,
        adaptiveAllowed = false,
        gameMode = 'bots',
        worldMapOpen = false,
    } = {}) {
        if (!adaptiveAllowed) {
            return;
        }
        const resolvedRenderStageMs = Math.max(0, Number(renderStageMs) || 0);
        if (resolvedRenderStageMs <= 0) {
            return;
        }
        const frameMs = Math.max(0, performance.now() - Math.max(0, Number(frameStartMs) || 0));
        const stallGuardResult = graphicsQualityController?.reportRenderStall?.({
            frameMs,
            renderMs: resolvedRenderStageMs,
        });
        if (!stallGuardResult?.triggered) {
            return;
        }

        const nowMs = performance.now();
        if (nowMs - lastRenderStallGuardEventAtMs < RENDER_STALL_GUARD_EVENT_COOLDOWN_MS) {
            return;
        }
        lastRenderStallGuardEventAtMs = nowMs;
        const renderInfo = renderer?.info?.render || null;
        performanceDiagnosticsController?.recordEvent?.(
            'graphics_stall_guard_triggered',
            {
                frameMs: Number(frameMs.toFixed(2)),
                renderMs: Number(resolvedRenderStageMs.toFixed(2)),
                drawCalls: Math.max(0, Math.round(Number(renderInfo?.calls) || 0)),
                triangles: Math.max(0, Math.round(Number(renderInfo?.triangles) || 0)),
                pixelRatioCap: Number((Number(stallGuardResult.pixelRatioCap) || 0).toFixed(3)),
                stallGuardScalePercent: Math.max(
                    10,
                    Math.round((Number(stallGuardResult.stallGuardScale) || 1) * 100)
                ),
                gameMode: typeof gameMode === 'string' ? gameMode : 'bots',
                worldMapOpen: Boolean(worldMapOpen),
            },
            {
                label: 'graphics stall guard',
                severity: 'warning',
            }
        );
    }

    function collectPreRenderPressureState() {
        const crashPerf = crashDebrisController?.getPerformanceSnapshot?.() || null;
        const minePerf = mineSystemController?.getPerformanceSnapshot?.() || null;
        const botPerf = getBotTrafficSystem?.()?.getPerformanceSnapshot?.() || null;
        const collectiblePerf = collectibleSystem?.getPerformanceSnapshot?.() || null;
        const heavyEventBudget = getHeavyEventBudgetSnapshot() || null;
        return {
            pendingCrashDebrisSpawns: toPerfCount(crashPerf?.pendingDebrisSpawns),
            pendingCrashExplosionDetaches: toPerfCount(crashPerf?.pendingExplosionDetaches),
            activeCrashDebrisPieces: toPerfCount(crashPerf?.activeDebrisPieces),
            pendingMineDetonationSpawns: toPerfCount(minePerf?.pendingDetonationSpawns),
            activeMineDetonationEffects: toPerfCount(minePerf?.activeDetonationEffects),
            pendingBotMineDebris: toPerfCount(botPerf?.pendingMineDebris),
            activeBotDetachedDebris: toPerfCount(botPerf?.activeDetachedDebris),
            pendingCollectEffects: toPerfCount(collectiblePerf?.pendingCollectEffects),
            activeCollectEffects: toPerfCount(collectiblePerf?.activeCollectEffects),
            heavyEventTokensPerFrame: toPerfCount(heavyEventBudget?.tokensPerFrame),
            heavyEventTokensRemaining: toPerfCount(heavyEventBudget?.tokensRemaining),
            heavyEventTokensConsumed: toPerfCount(heavyEventBudget?.consumedThisFrame),
            heavyEventTokensDenied: toPerfCount(heavyEventBudget?.deniedThisFrame),
        };
    }

    function computePreRenderPressureScore(pressureState, transientFrameState = {}) {
        if (!pressureState || typeof pressureState !== 'object') {
            return 0;
        }
        let score = 0;
        score += Math.min(3, pressureState.pendingMineDetonationSpawns) * 1.8;
        score += Math.min(6, pressureState.pendingBotMineDebris) * 0.8;
        score += Math.min(8, pressureState.pendingCrashDebrisSpawns) * 0.75;
        score += Math.min(8, pressureState.pendingCrashExplosionDetaches) * 0.45;
        score += Math.min(8, pressureState.pendingCollectEffects) * 0.45;

        score += Math.min(20, pressureState.activeMineDetonationEffects) * 0.08;
        score += Math.min(12, pressureState.activeBotDetachedDebris) * 0.05;
        score += Math.min(20, pressureState.activeCrashDebrisPieces) * 0.08;
        score += Math.min(12, pressureState.activeCollectEffects) * 0.05;

        const heavyBudgetFull =
            pressureState.heavyEventTokensPerFrame > 0 &&
            pressureState.heavyEventTokensConsumed >= pressureState.heavyEventTokensPerFrame;
        if (pressureState.heavyEventTokensRemaining <= 0 && heavyBudgetFull) {
            score += 1.4;
        }
        if (pressureState.heavyEventTokensDenied > 0) {
            score += Math.min(2.2, pressureState.heavyEventTokensDenied * 1.1);
        }

        if (transientFrameState?.crashCollisionTriggered) {
            score += 2.2;
        }
        const contactsCount = Math.max(
            0,
            Math.round(Number(transientFrameState?.vehicleContactsCount) || 0)
        );
        if (contactsCount > 0) {
            score += Math.min(2.6, contactsCount * 0.45);
        }

        if (score < PRE_RENDER_LOAD_SHED_SCORE_THRESHOLD) {
            return 0;
        }
        return score;
    }

    function toPerfCount(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return 0;
        }
        return Math.max(0, Math.round(numeric));
    }

    function updateBotMineDeployment(snapshots = [], frameDelta) {
        if (
            readGameMode() !== 'bots' ||
            readCarDestroyed() ||
            readPickupRoundFinished() ||
            frameDelta <= 0
        ) {
            botMineDecisionById.clear();
            return;
        }

        if (!Array.isArray(snapshots) || snapshots.length === 0) {
            botMineDecisionById.clear();
            return;
        }

        const now = Date.now();
        botMineDecisionStamp = botMineDecisionStamp >= 0x3fffffff ? 1 : botMineDecisionStamp + 1;
        const activeStamp = botMineDecisionStamp;

        for (let i = 0; i < snapshots.length; i += 1) {
            const snapshot = snapshots[i];
            const ownerId = typeof snapshot?.id === 'string' ? snapshot.id : '';
            if (!ownerId) {
                continue;
            }

            let decisionState = botMineDecisionById.get(ownerId);
            if (!decisionState) {
                decisionState = {
                    nextAttemptAtMs: now + randomRangeMs(320, 1200),
                    activeStamp,
                };
                botMineDecisionById.set(ownerId, decisionState);
            } else {
                decisionState.activeStamp = activeStamp;
            }
            if (now < decisionState.nextAttemptAtMs) {
                continue;
            }
            decisionState.nextAttemptAtMs =
                now +
                randomRangeMs(BOT_MINE_DECISION_MIN_INTERVAL_MS, BOT_MINE_DECISION_MAX_INTERVAL_MS);

            const botX = Number(snapshot?.x);
            const botZ = Number(snapshot?.z);
            const botHeading = Number(snapshot?.heading);
            if (!Number.isFinite(botX) || !Number.isFinite(botZ) || !Number.isFinite(botHeading)) {
                continue;
            }

            const dx = car.position.x - botX;
            const dz = car.position.z - botZ;
            const distanceSq = dx * dx + dz * dz;
            if (!Number.isFinite(distanceSq) || distanceSq < 0.0001) {
                continue;
            }
            const distance = Math.sqrt(distanceSq);
            if (distance > BOT_MINE_DEPLOY_MAX_DISTANCE) {
                continue;
            }

            const velocityX = Number(snapshot?.velocityX) || 0;
            const velocityZ = Number(snapshot?.velocityZ) || 0;
            const botSpeed = Math.hypot(velocityX, velocityZ);
            if (botSpeed < BOT_MINE_DEPLOY_MIN_SPEED) {
                continue;
            }

            const toPlayerX = dx / distance;
            const toPlayerZ = dz / distance;
            const forwardX = -Math.sin(botHeading);
            const forwardZ = -Math.cos(botHeading);
            const forwardDot = forwardX * toPlayerX + forwardZ * toPlayerZ;

            let deployMode = '';
            if (forwardDot <= BOT_MINE_DROP_DOT_THRESHOLD) {
                deployMode = 'drop';
            } else if (
                forwardDot >= BOT_MINE_THROW_DOT_THRESHOLD &&
                distance <= BOT_MINE_THROW_MAX_DISTANCE
            ) {
                deployMode = 'throw';
            }
            if (!deployMode) {
                continue;
            }

            const sourceY = Number(getGroundHeightAt(botX, botZ));
            const deployResult = mineSystemController?.deployMineForOwner?.({
                ownerId,
                ownerName: ownerId,
                sourcePosition: {
                    x: botX,
                    y: Number.isFinite(sourceY) ? sourceY : car.position.y,
                    z: botZ,
                },
                sourceHeading: botHeading,
                sourceVelocityX: velocityX,
                sourceVelocityZ: velocityZ,
                mode: deployMode,
                requireCanUseMines: true,
                emitPlacedEvent: false,
                notifyMineDeployed: false,
                includePlayerMessages: false,
            });

            if (deployResult?.ok) {
                decisionState.nextAttemptAtMs =
                    now +
                    randomRangeMs(
                        BOT_MINE_POST_DEPLOY_MIN_INTERVAL_MS,
                        BOT_MINE_POST_DEPLOY_MAX_INTERVAL_MS
                    );
            }
        }

        for (const [botId, decisionState] of botMineDecisionById.entries()) {
            if (decisionState?.activeStamp !== activeStamp) {
                botMineDecisionById.delete(botId);
            }
        }
    }

    function randomRangeMs(min, max) {
        return min + Math.random() * (max - min);
    }

    function filterCollisionSnapshotsByDistance(
        snapshots = [],
        origin = null,
        maxDistanceSq = VEHICLE_COLLISION_CULL_DISTANCE_SQ,
        outputBuffer = null
    ) {
        const useOutputBuffer = Array.isArray(outputBuffer);
        if (useOutputBuffer) {
            outputBuffer.length = 0;
        }
        if (!Array.isArray(snapshots) || snapshots.length === 0) {
            return useOutputBuffer ? outputBuffer : [];
        }
        const originX = Number(origin?.x);
        const originZ = Number(origin?.z);
        if (!Number.isFinite(originX) || !Number.isFinite(originZ)) {
            if (useOutputBuffer) {
                appendCollisionSnapshots(outputBuffer, snapshots);
                return outputBuffer;
            }
            return snapshots;
        }

        if (useOutputBuffer) {
            for (let i = 0; i < snapshots.length; i += 1) {
                const snapshot = snapshots[i];
                const x = Number(snapshot?.x);
                const z = Number(snapshot?.z);
                if (!Number.isFinite(x) || !Number.isFinite(z)) {
                    continue;
                }
                const deltaX = x - originX;
                const deltaZ = z - originZ;
                const distanceSq = deltaX * deltaX + deltaZ * deltaZ;
                if (distanceSq <= maxDistanceSq) {
                    outputBuffer.push(snapshot);
                }
            }
            return outputBuffer;
        }

        let filtered = null;
        for (let i = 0; i < snapshots.length; i += 1) {
            const snapshot = snapshots[i];
            const x = Number(snapshot?.x);
            const z = Number(snapshot?.z);
            if (!Number.isFinite(x) || !Number.isFinite(z)) {
                if (!filtered) {
                    filtered = snapshots.slice(0, i);
                }
                continue;
            }
            const deltaX = x - originX;
            const deltaZ = z - originZ;
            const distanceSq = deltaX * deltaX + deltaZ * deltaZ;
            if (distanceSq > maxDistanceSq) {
                if (!filtered) {
                    filtered = snapshots.slice(0, i);
                }
                continue;
            }
            if (filtered) {
                filtered.push(snapshot);
            }
        }
        return filtered || snapshots;
    }

    function buildBotHudEntries(botHudState = []) {
        botHudEntriesBuffer.length = 0;
        if (!Array.isArray(botHudState) || botHudState.length === 0) {
            botHudEntryByCollectorId.clear();
            return botHudEntriesBuffer;
        }

        botHudEntryStamp = botHudEntryStamp >= 0x3fffffff ? 1 : botHudEntryStamp + 1;
        const activeStamp = botHudEntryStamp;
        for (let i = 0; i < botHudState.length; i += 1) {
            const entry = botHudState[i];
            const collectorId =
                typeof entry?.collectorId === 'string' && entry.collectorId
                    ? entry.collectorId
                    : `bot:${i}`;
            let botHudEntry = botHudEntryByCollectorId.get(collectorId);
            if (!botHudEntry) {
                botHudEntry = {};
                botHudEntryByCollectorId.set(collectorId, botHudEntry);
            }
            botHudEntry.activeStamp = activeStamp;
            botHudEntry.collectorId = collectorId;
            botHudEntry.name = entry?.name || 'BOT';
            botHudEntry.collectedCount = entry?.collectedCount || 0;
            botHudEntry.targetColorHex = entry?.targetColorHex;
            botHudEntry.livesRemaining = entry?.livesRemaining || 0;
            botHudEntry.maxLives = entry?.maxLives || 1;
            botHudEntry.respawning = Boolean(entry?.respawning);
            botHudEntry.respawnMsRemaining = entry?.respawnMsRemaining || 0;
            botHudEntry.score = Math.max(
                0,
                Math.round(Number(getCollectorScore(collectorId || '__unknown__')) || 0)
            );
            botHudEntriesBuffer.push(botHudEntry);
        }

        for (const [collectorId, botHudEntry] of botHudEntryByCollectorId.entries()) {
            if (botHudEntry.activeStamp !== activeStamp) {
                botHudEntryByCollectorId.delete(collectorId);
            }
        }
        return botHudEntriesBuffer;
    }

    function appendCollisionSnapshots(buffer, snapshots = []) {
        if (!Array.isArray(buffer) || !Array.isArray(snapshots) || snapshots.length === 0) {
            return;
        }
        for (let i = 0; i < snapshots.length; i += 1) {
            buffer.push(snapshots[i]);
        }
    }

    function createPlayerHudState() {
        if (readGameMode() !== 'bots') {
            return null;
        }
        const collectedCount = Math.max(0, Math.floor(Number(readPlayerCollectedCount()) || 0));
        const score = Math.max(0, Math.floor(Number(readPlayerScore()) || 0));
        const livesRemaining = Math.max(0, Math.floor(Number(readPlayerCarsRemaining()) || 0));
        const maxLives = Math.max(1, Math.floor(Number(playerCarPoolSize) || 3));
        return {
            name: 'YOU',
            targetLabel: 'PLAYER',
            showSwatch: false,
            score,
            collectedCount,
            livesRemaining,
            maxLives,
            respawning: readCarDestroyed() && livesRemaining > 0,
            respawnMsRemaining: 0,
            isPlayer: true,
        };
    }

    function updateSunLightPosition() {
        if (!sunLight) {
            return;
        }
        sunLight.position.set(car.position.x + 95, 180, car.position.z + 78);
        sunLight.target.position.set(car.position.x, car.position.y, car.position.z);
        sunLight.target.updateMatrixWorld();
    }
}
