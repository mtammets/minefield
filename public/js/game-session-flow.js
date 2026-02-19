import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import {
    PLAYER_RIDE_HEIGHT,
    BATTERY_MAX,
    BATTERY_IDLE_DRAIN_PER_SEC,
    BATTERY_SPEED_DRAIN_PER_SPEED,
    BATTERY_DEPLETED_TRIGGER_LEVEL,
    BATTERY_DEPLETED_RECOVER_LEVEL,
    PLAYER_CAR_POOL_SIZE,
    PLAYER_RESPAWN_DELAY_MS,
    ROUND_TOTAL_PICKUPS,
    SHARED_PICKUP_COLOR_HEX,
} from './constants.js';

export function createGameSessionController({
    keys,
    car,
    playerSpawnState,
    getGroundHeightAt,
    setCameraKeyboardControlsEnabled,
    resetCameraTrackingState,
    initializePlayerPhysics,
    setPlayerBatteryLevel,
    setPlayerBatteryDepleted,
    setPlayerCarBodyColor,
    resolvePlayerCarColorHex,
    persistPlayerCarColorHex,
    objectiveUi,
    botStatusUi,
    finalScoreboardUi,
    pauseMenuUi,
    welcomeModalUi,
    raceIntroController,
    carEditModeController,
    cityBuilderController,
    chargingZoneController,
    chargingProgressHudController,
    skidMarkController,
    collectibleSystem,
    replayController,
    getBotTrafficSystem,
    crashDebrisController,
    mineController,
    replayEffectsController,
    setPhysicsAccumulator,
    setMinimapAccumulator,
    minimapUpdateInterval,
    replayEventCrash,
    colorNameFromHex,
    getIsCarDestroyed,
    setIsCarDestroyed,
    getIsBatteryDepleted,
    setIsBatteryDepleted,
    getPlayerBattery,
    setPlayerBattery,
    getPlayerCollectedCount,
    setPlayerCollectedCount,
    getTotalCollectedCount,
    setTotalCollectedCount,
    getPlayerCarsRemaining,
    setPlayerCarsRemaining,
    getPendingRespawnTimeout,
    setPendingRespawnTimeout,
    getPickupRoundFinished,
    setPickupRoundFinished,
    getIsGamePaused,
    setIsGamePaused,
    getIsWelcomeModalVisible,
    setIsWelcomeModalVisible,
    getSelectedCarColorHex,
    setSelectedCarColorHex,
    getGameMode = () => 'bots',
    setGameMode = () => {},
    setMultiplayerPanelVisible = () => {},
    startOnlineRoomFlow = () => {},
} = {}) {
    const getBotSystem =
        typeof getBotTrafficSystem === 'function' ? getBotTrafficSystem : () => null;
    return {
        clearDriveKeys,
        setPauseState,
        dismissWelcomeModal,
        showWelcomeModal,
        startRaceIntroSequence,
        restartGameWithCountdown,
        clearPendingRespawn,
        snapCarToGround,
        respawnPlayerCar,
        setBatteryDepletedState,
        updateBattery,
        addBattery,
        finalizePickupRound,
        triggerCarExplosion,
        triggerObstacleCrash,
        resetRunStateForReplay,
        startNewGame,
        setSelectedPlayerCarColor,
    };

    function clearDriveKeys() {
        keys.forward = false;
        keys.backward = false;
        keys.left = false;
        keys.right = false;
        keys.handbrake = false;
    }

    function setPauseState(nextPaused) {
        const shouldPause = Boolean(nextPaused);
        if (shouldPause && raceIntroController.isActive()) {
            return;
        }
        if (getIsGamePaused() === shouldPause) {
            return;
        }

        setIsGamePaused(shouldPause);
        if (getIsGamePaused()) {
            clearDriveKeys();
            if (getIsWelcomeModalVisible()) {
                pauseMenuUi.hide();
                return;
            }
            pauseMenuUi.show();
            return;
        }
        pauseMenuUi.hide();
    }

    function dismissWelcomeModal(nextMode = getGameMode(), startContext = null) {
        if (!getIsWelcomeModalVisible()) {
            return;
        }
        const mode = normalizeGameMode(nextMode);
        setGameMode(mode);
        getBotSystem()?.setEnabled?.(mode === 'bots');
        setMultiplayerPanelVisible(mode === 'online');
        if (mode === 'online') {
            const normalizedOnlineStartContext = normalizeOnlineStartContext(startContext);
            if (normalizedOnlineStartContext) {
                startOnlineRoomFlow(normalizedOnlineStartContext);
            }
        }
        setIsWelcomeModalVisible(false);
        carEditModeController.setActive(false);
        cityBuilderController?.setActive?.(false);
        welcomeModalUi.hide();
        restartGameWithCountdown();
    }

    function showWelcomeModal() {
        carEditModeController.setActive(false);
        cityBuilderController?.setActive?.(false);
        raceIntroController.stop();
        setIsWelcomeModalVisible(true);
        setIsGamePaused(true);
        clearDriveKeys();
        pauseMenuUi.hide();
        setCameraKeyboardControlsEnabled(true);
        welcomeModalUi.show();
    }

    function startRaceIntroSequence() {
        if (getIsGamePaused() || getIsWelcomeModalVisible()) {
            return;
        }
        clearDriveKeys();
        resetCameraTrackingState();
        setCameraKeyboardControlsEnabled(false);
        raceIntroController.start();
        objectiveUi.showInfo('Starting countdown...', 1100);
    }

    function restartGameWithCountdown() {
        startNewGame();
        startRaceIntroSequence();
    }

    function clearPendingRespawn() {
        const timeout = getPendingRespawnTimeout();
        if (timeout == null) {
            return;
        }
        clearTimeout(timeout);
        setPendingRespawnTimeout(null);
    }

    function snapCarToGround() {
        car.position.y = getGroundHeightAt(car.position.x, car.position.z) + PLAYER_RIDE_HEIGHT;
    }

    function respawnPlayerCar() {
        if (getPlayerCarsRemaining() <= 0) {
            return;
        }

        setIsCarDestroyed(false);
        car.visible = true;
        car.position.copy(playerSpawnState.position);
        snapCarToGround();
        car.rotation.set(0, playerSpawnState.rotationY, 0);
        collectibleSystem.setEnabled(true);
        clearDriveKeys();
        chargingZoneController.reset();
        chargingProgressHudController.reset();
        crashDebrisController.resetPlayerDamageState();
        setPlayerBattery(BATTERY_MAX);
        setPlayerBatteryLevel(getPlayerBattery() / BATTERY_MAX);
        setBatteryDepletedState(false, { showStatus: false });
        initializePlayerPhysics(car);
        setPhysicsAccumulator(0);

        objectiveUi.showInfo(
            `New car on track. Cars left: ${getPlayerCarsRemaining()}/${PLAYER_CAR_POOL_SIZE}.`,
            2300
        );
    }

    function setBatteryDepletedState(nextDepleted, options = {}) {
        const depleted = Boolean(nextDepleted);
        if (depleted === getIsBatteryDepleted()) {
            setPlayerBatteryDepleted(getIsBatteryDepleted());
            return getIsBatteryDepleted();
        }
        setIsBatteryDepleted(depleted);
        setPlayerBatteryDepleted(getIsBatteryDepleted());
        if (getIsBatteryDepleted()) {
            clearDriveKeys();
            if (options.showStatus !== false) {
                objectiveUi.showInfo(
                    'Battery empty. Suspension collapsed. Charge to recover.',
                    2600
                );
            }
        } else if (options.showStatus !== false) {
            objectiveUi.showInfo('Battery restored. Drive systems online.', 1600);
        }
        return getIsBatteryDepleted();
    }

    function updateBattery(vehicleState, dt) {
        if (getIsCarDestroyed() || getPickupRoundFinished()) {
            return;
        }

        const speedAbs = Math.abs(vehicleState.speed || 0);
        const drain = (BATTERY_IDLE_DRAIN_PER_SEC + speedAbs * BATTERY_SPEED_DRAIN_PER_SPEED) * dt;
        if (drain <= 0) {
            return;
        }

        setPlayerBattery(Math.max(0, getPlayerBattery() - drain));
        setPlayerBatteryLevel(getPlayerBattery() / BATTERY_MAX);
        if (!getIsBatteryDepleted() && getPlayerBattery() <= BATTERY_DEPLETED_TRIGGER_LEVEL) {
            setPlayerBattery(0);
            setPlayerBatteryLevel(0);
            setBatteryDepletedState(true);
        }
    }

    function addBattery(amount) {
        setPlayerBattery(Math.min(BATTERY_MAX, getPlayerBattery() + Math.max(0, amount)));
        setPlayerBatteryLevel(getPlayerBattery() / BATTERY_MAX);
        if (getIsBatteryDepleted() && getPlayerBattery() >= BATTERY_DEPLETED_RECOVER_LEVEL) {
            setBatteryDepletedState(false);
        }
    }

    function finalizePickupRound(totalPickups, collectedPickups) {
        if (getPickupRoundFinished()) {
            return;
        }

        setPickupRoundFinished(true);
        clearPendingRespawn();
        collectibleSystem.setEnabled(false);
        clearDriveKeys();
        botStatusUi.render(getBotSystem()?.getHudState?.() || []);

        const scoreboard = [
            { name: 'You', collectedCount: getPlayerCollectedCount() },
            ...(getBotSystem()?.getHudState?.() || []).map((bot) => ({
                name: bot.name,
                collectedCount: bot.collectedCount || 0,
            })),
        ];
        scoreboard.sort((a, b) => (b.collectedCount || 0) - (a.collectedCount || 0));

        let topScore = 0;
        for (let i = 0; i < scoreboard.length; i += 1) {
            topScore = Math.max(topScore, scoreboard[i].collectedCount || 0);
        }
        const winners = scoreboard.filter((entry) => (entry.collectedCount || 0) === topScore);
        const winnerLabel = winners.map((entry) => entry.name).join(', ');
        const resolvedTotal = Number.isFinite(totalPickups) ? totalPickups : ROUND_TOTAL_PICKUPS;
        const resolvedCollectedRaw = Number.isFinite(collectedPickups)
            ? collectedPickups
            : getTotalCollectedCount();
        const resolvedCollected = THREE.MathUtils.clamp(
            Math.round(resolvedCollectedRaw),
            0,
            resolvedTotal
        );
        const tiePrefix = winners.length > 1 ? 'Tie' : 'Winner';

        objectiveUi.showResult(
            `No objects left (${resolvedCollected}/${resolvedTotal}). ${tiePrefix}: ${winnerLabel} (${topScore}).`
        );
        finalScoreboardUi.show({
            summaryText: `Collected ${resolvedCollected}/${resolvedTotal} objects.`,
            entries: scoreboard,
            topScore,
        });
    }

    function triggerCarExplosion(hitPosition, pickupColorHex, targetColorHex, options = {}) {
        if (getIsCarDestroyed() || getPickupRoundFinished()) {
            return;
        }
        clearPendingRespawn();

        const replayCollision = options.collision
            ? {
                  obstacleCategory: options.collision.obstacleCategory,
                  impactSpeed: options.collision.impactSpeed,
                  impactNormalX: options.collision.impactNormal?.x || 0,
                  impactNormalZ: options.collision.impactNormal?.z || 0,
              }
            : null;

        replayController.recordEvent(replayEventCrash, {
            x: hitPosition.x,
            y: hitPosition.y,
            z: hitPosition.z,
            pickupColorHex,
            targetColorHex,
            collision: replayCollision,
        });
        replayController.stopRecording();
        replayController.stopPlayback();
        setIsCarDestroyed(true);
        setBatteryDepletedState(false, { showStatus: false });
        chargingZoneController.reset();
        chargingProgressHudController.reset();
        collectibleSystem.setEnabled(false);
        car.visible = false;
        clearDriveKeys();

        setPlayerCarsRemaining(Math.max(0, getPlayerCarsRemaining() - 1));

        const crashReason =
            options.statusText ||
            `Wrong (${colorNameFromHex(pickupColorHex)})! Correct was ${colorNameFromHex(targetColorHex)}.`;
        crashDebrisController.spawnCarDebris(hitPosition, options.collision || null);

        if (getPlayerCarsRemaining() > 0) {
            objectiveUi.showCrash(
                `${crashReason} New car arrives in ${Math.round(PLAYER_RESPAWN_DELAY_MS / 100) / 10}s. ` +
                    `Cars left: ${getPlayerCarsRemaining()}/${PLAYER_CAR_POOL_SIZE}.`
            );
            setPendingRespawnTimeout(
                window.setTimeout(() => {
                    setPendingRespawnTimeout(null);
                    respawnPlayerCar();
                }, PLAYER_RESPAWN_DELAY_MS)
            );
            return;
        }

        objectiveUi.showCrash(`${crashReason} No cars left. Press Q to restart.`);
    }

    function triggerObstacleCrash(collision) {
        const obstacleLabel =
            collision.obstacleCategory === 'building'
                ? 'a building'
                : collision.obstacleCategory === 'tree'
                  ? 'a tree'
                  : collision.obstacleCategory === 'lamp_post'
                    ? 'a lamp post'
                    : 'an obstacle';
        const speedLabel = Math.round(collision.impactSpeed);
        triggerCarExplosion(collision.position, 0xffa66b, 0xff4b4b, {
            statusText: `You hit ${obstacleLabel} at high speed (${speedLabel}).`,
            collision,
        });
    }

    function resetRunStateForReplay() {
        cityBuilderController?.setActive?.(false);
        raceIntroController.stop();
        setCameraKeyboardControlsEnabled(true);
        clearPendingRespawn();
        objectiveUi.resetStatus();
        finalScoreboardUi.hide();
        setPickupRoundFinished(false);
        setPlayerCollectedCount(0);
        setTotalCollectedCount(0);
        setIsCarDestroyed(false);
        car.visible = true;
        car.position.copy(playerSpawnState.position);
        snapCarToGround();
        car.rotation.set(0, playerSpawnState.rotationY, 0);
        collectibleSystem.setEnabled(true);
        setPlayerCarsRemaining(PLAYER_CAR_POOL_SIZE);
        setPlayerBattery(BATTERY_MAX);
        setPlayerBatteryLevel(getPlayerBattery() / BATTERY_MAX);
        setBatteryDepletedState(false, { showStatus: false });
        chargingZoneController.reset();
        chargingProgressHudController.reset();
        skidMarkController.reset();
        crashDebrisController.resetPlayerDamageState();
        if (normalizeGameMode(getGameMode()) !== 'online') {
            mineController?.clearAll?.();
        }
        clearDriveKeys();
        replayEffectsController.clearReplayEffects();
        crashDebrisController.clearDebris();
    }

    function startNewGame() {
        raceIntroController.stop();
        carEditModeController.setActive(false);
        cityBuilderController?.setActive?.(false);
        setCameraKeyboardControlsEnabled(true);
        setPauseState(false);
        replayController.stopRecording();
        replayController.stopPlayback();
        replayController.clear();

        clearPendingRespawn();
        replayEffectsController.clearReplayEffects();
        crashDebrisController.clearDebris();
        if (normalizeGameMode(getGameMode()) !== 'online') {
            mineController?.clearAll?.();
        }

        objectiveUi.resetStatus();
        finalScoreboardUi.hide();
        setPickupRoundFinished(false);
        setPlayerCollectedCount(0);
        setTotalCollectedCount(0);
        setIsCarDestroyed(false);
        setPlayerCarsRemaining(PLAYER_CAR_POOL_SIZE);
        setPlayerBattery(BATTERY_MAX);
        setPlayerBatteryLevel(getPlayerBattery() / BATTERY_MAX);
        setBatteryDepletedState(false, { showStatus: false });
        chargingZoneController.reset();
        chargingProgressHudController.reset();
        skidMarkController.reset();

        car.visible = true;
        car.position.copy(playerSpawnState.position);
        snapCarToGround();
        car.rotation.set(0, playerSpawnState.rotationY, 0);

        const botsEnabled = normalizeGameMode(getGameMode()) === 'bots';
        setMultiplayerPanelVisible(!botsEnabled);

        collectibleSystem.reset?.();
        collectibleSystem.setEnabled(true);
        getBotSystem()?.setEnabled?.(botsEnabled);
        if (botsEnabled) {
            getBotSystem()?.reset?.({ sharedTargetColorHex: SHARED_PICKUP_COLOR_HEX });
        }
        botStatusUi.render(getBotSystem()?.getHudState?.() || []);

        crashDebrisController.resetPlayerDamageState();
        clearDriveKeys();
        initializePlayerPhysics(car);
        setPhysicsAccumulator(0);
        setMinimapAccumulator(minimapUpdateInterval);
    }

    function setSelectedPlayerCarColor(colorHex, options = {}) {
        const { persist = true } = options;
        const normalized = resolvePlayerCarColorHex(colorHex);
        setSelectedCarColorHex(normalized);
        setPlayerCarBodyColor(normalized);
        if (persist) {
            persistPlayerCarColorHex(normalized);
        }
    }

    function normalizeGameMode(mode) {
        return mode === 'online' ? 'online' : 'bots';
    }

    function normalizeOnlineStartContext(startContext) {
        if (!startContext || typeof startContext !== 'object') {
            return null;
        }
        const roomAction = startContext.roomAction === 'join' ? 'join' : 'create';
        const playerName = sanitizeOnlinePlayerName(startContext.playerName);
        const roomCode =
            typeof startContext.roomCode === 'string'
                ? startContext.roomCode
                      .trim()
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 6)
                : '';
        if (roomAction === 'join' && roomCode.length !== 6) {
            return null;
        }
        if (roomAction === 'create' && roomCode.length > 0 && roomCode.length !== 6) {
            return null;
        }
        return {
            roomAction,
            roomCode: roomCode,
            playerName,
        };
    }

    function sanitizeOnlinePlayerName(value) {
        if (typeof value !== 'string') {
            return 'Driver';
        }
        const normalized = value
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
            .slice(0, 18);
        return normalized || 'Driver';
    }
}
