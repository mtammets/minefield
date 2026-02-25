import { WORLD_MAP_DRIVE_LOCK_MODES } from './input-context.js';

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

    function frame() {
        if (!running) {
            return;
        }
        animationFrameId = requestAnimationFrame(frame);

        const frameDelta = Math.min(clock.getDelta(), 0.05);
        const isEditModeActive = carEditModeController.isActive();
        const worldMapDriveLockMode = readWorldMapDriveLockMode();
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

        welcomeModalUi.update(frameDelta);
        multiplayerController?.update?.(frameDelta);

        if (!readGamePaused() && !isEditModeActive) {
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
                    const replayFrame = replayController.updatePlayback(frameDelta);
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

                    if (
                        physicsSteps === maxPhysicsStepsPerFrame &&
                        physicsAccumulator > physicsStep
                    ) {
                        physicsAccumulator = physicsStep;
                    }
                    writePhysicsAccumulator(physicsAccumulator);

                    const vehicleContacts = consumeVehicleCollisionContacts(vehicleContactsBuffer);
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
                        crashDebrisController.updateDebris(frameDelta);
                    }
                } else {
                    writePhysicsAccumulator(0);
                    crashDebrisController.updateDebris(frameDelta);
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
                        botTrafficSystem?.update?.(car.position, visiblePickups, frameDelta);
                        updateBotMineDeployment(
                            botTrafficSystem?.getCollisionSnapshots?.() || EMPTY_ARRAY,
                            frameDelta
                        );
                        botCollectorDescriptors =
                            botTrafficSystem?.getCollectorDescriptors?.() || EMPTY_ARRAY;
                        botHudState = botTrafficSystem?.getHudState?.() || EMPTY_ARRAY;
                    } else {
                        botMineDecisionById.clear();
                    }

                    collectorBuffer.length = 1;
                    if (botsEnabled) {
                        appendCollisionSnapshots(collectorBuffer, botCollectorDescriptors);
                    }
                    collectibleSystem.updateForCollectors(collectorBuffer, frameDelta);
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
                    crashDebrisController.updateDebris(frameDelta);
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
        mineSystemController?.update?.(frameDelta, mineFrameState);

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
        mapUiController?.update?.(frameDelta, mapFrameState);

        audioFrameState.vehicleState = getVehicleState();
        audioFrameState.isPaused = readGamePaused();
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
        audioController?.update?.(frameDelta, audioFrameState);
        scorePopupController?.update?.(camera, frameDelta);

        updateSunLightPosition();
        renderer.render(scene, camera);
        graphicsQualityController?.sampleFrame?.(frameDelta, {
            allowAdaptive:
                !readGamePaused() &&
                !isEditModeActive &&
                !readWelcomeModalVisible() &&
                !readWorldMapOpen(),
        });
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
