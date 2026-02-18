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
        miniMapController,
        welcomeModalUi,
        starsController,
        objectiveUi,
        botStatusUi,
        collectibleSystem,
        replayController,
        multiplayerController,
        getPlayerTopSpeedLimit,
        crashDebrisController,
        replayEffectsController,
        gameSessionController,
        getBotTrafficSystem,
        getMultiplayerMiniMapMarkers,
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
        minimapUpdateInterval = 1 / 12,
        roundTotalPickups = 30,
        chargingBatteryGainPerSec = 16,
        getPhysicsAccumulator,
        setPhysicsAccumulator,
        getMinimapAccumulator,
        setMinimapAccumulator,
        getIsGamePaused,
        getIsCarDestroyed,
        getIsBatteryDepleted,
        getPickupRoundFinished,
        getTotalCollectedCount,
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
    const readMinimapAccumulator =
        typeof getMinimapAccumulator === 'function' ? getMinimapAccumulator : () => 0;
    const writeMinimapAccumulator =
        typeof setMinimapAccumulator === 'function' ? setMinimapAccumulator : () => {};
    const readGamePaused = typeof getIsGamePaused === 'function' ? getIsGamePaused : () => false;
    const readCarDestroyed =
        typeof getIsCarDestroyed === 'function' ? getIsCarDestroyed : () => false;
    const readBatteryDepleted =
        typeof getIsBatteryDepleted === 'function' ? getIsBatteryDepleted : () => false;
    const readPickupRoundFinished =
        typeof getPickupRoundFinished === 'function' ? getPickupRoundFinished : () => false;
    const readTotalCollectedCount =
        typeof getTotalCollectedCount === 'function' ? getTotalCollectedCount : () => 0;

    let running = false;
    let animationFrameId = null;

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
        let chargingHudEnabled = false;
        let chargingHudActive = false;
        let chargingHudLevel = 0;
        let skidMarksEnabled = false;
        let skidMarkVehicleState = null;

        welcomeModalUi.update(frameDelta);
        multiplayerController?.update?.(frameDelta);

        if (!readGamePaused() && !isEditModeActive) {
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
                    const vehicleCollisionSnapshots =
                        getBotTrafficSystem()?.getCollisionSnapshots?.() || [];
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
                            vehicleCollisionSnapshots,
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

                    const vehicleContacts = consumeVehicleCollisionContacts();
                    if (vehicleContacts.length > 0) {
                        crashDebrisController.processVehicleCollisionContacts(vehicleContacts);
                    }

                    const crashCollision = consumeCrashCollision();
                    if (crashCollision && !readCarDestroyed()) {
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
                    const visiblePickupsForBots = collectibleSystem.getVisiblePickups();
                    botTrafficSystem?.update?.(car.position, visiblePickupsForBots, frameDelta);
                    collectibleSystem.updateForCollectors(
                        [
                            { id: 'player', position: car.position },
                            ...(botTrafficSystem?.getCollectorDescriptors?.() || []),
                        ],
                        frameDelta
                    );
                    if (
                        !readPickupRoundFinished() &&
                        readTotalCollectedCount() >= roundTotalPickups
                    ) {
                        gameSessionController.finalizePickupRound(
                            roundTotalPickups,
                            readTotalCollectedCount()
                        );
                    }
                    let minimapAccumulator = readMinimapAccumulator() + frameDelta;
                    if (minimapAccumulator >= minimapUpdateInterval) {
                        const visiblePickups = collectibleSystem.getVisiblePickups();
                        const botMarkers = botTrafficSystem?.getMiniMapMarkers?.() || [];
                        const multiplayerMarkers =
                            typeof getMultiplayerMiniMapMarkers === 'function'
                                ? getMultiplayerMiniMapMarkers()
                                : [];
                        miniMapController.update(
                            car.position,
                            car.rotation.y,
                            visiblePickups,
                            botMarkers.concat(multiplayerMarkers),
                            { hidePlayer: readCarDestroyed() }
                        );
                        botStatusUi.render(botTrafficSystem?.getHudState?.() || []);
                        minimapAccumulator = 0;
                    }
                    writeMinimapAccumulator(minimapAccumulator);
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
            carEditModeController.update(frameDelta);
            starsController.update(frameDelta);
            updateGroundMotion(car.position, 0);
        } else {
            chargingZoneController.update(car.position, frameDelta, { enabled: false });
        }

        chargingProgressHudController.update(frameDelta, {
            enabled: chargingHudEnabled,
            isCharging: chargingHudActive,
            chargingLevel: chargingHudLevel,
            batteryDepleted: readBatteryDepleted(),
        });
        skidMarkController.update(frameDelta, {
            enabled: skidMarksEnabled,
            vehicle: car,
            vehicleState: skidMarkVehicleState,
        });

        updateSunLightPosition();
        renderer.render(scene, camera);
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
