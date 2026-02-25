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
import { WORLD_MAP_DRIVE_LOCK_MODES } from './input-context.js';

const ELIMINATION_AUTOCOLLECT_POINTS_PER_PICKUP = 100;
const SCORE_MODEL_TEXT =
    'Pickup: 100 base x combo x (1 + risk + endgame). Mine kill: 220 base x chain x endgame x anti-farm.';

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
    chargingZoneController,
    chargingProgressHudController,
    skidMarkController,
    collectibleSystem,
    replayController,
    getBotTrafficSystem,
    getCollectorScore = () => 0,
    getCollectorRoundStats = () => null,
    crashDebrisController,
    mineController,
    replayEffectsController,
    setPhysicsAccumulator,
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
    getPlayerScore = () => 0,
    setPlayerScore = () => {},
    getTotalCollectedCount,
    setTotalCollectedCount,
    getTotalScore = () => 0,
    setTotalScore = () => {},
    resetPlayerPickupCombo = () => {},
    resetPickupScoring = () => {},
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
    clearScorePopups = () => {},
    onAutoCollectBonusAwarded = () => {},
    onRoundFinalized = () => {},
    onPlayerRespawned = () => {},
    onPlayerExplosion = () => {},
    audioController = null,
} = {}) {
    const getBotSystem =
        typeof getBotTrafficSystem === 'function' ? getBotTrafficSystem : () => null;
    function getBotHudStateWithScores() {
        const botEntries = getBotSystem()?.getHudState?.() || [];
        return botEntries.map((bot) => ({
            ...bot,
            score: Math.max(
                0,
                Math.round(
                    Number(bot?.score) ||
                        Number(getCollectorScore(bot?.collectorId || '__unknown__')) ||
                        0
                )
            ),
        }));
    }
    function createPlayerHudState() {
        if (normalizeGameMode(getGameMode()) !== 'bots') {
            return null;
        }
        const score = Math.max(0, Math.floor(Number(getPlayerScore()) || 0));
        const collectedCount = Math.max(0, Math.floor(Number(getPlayerCollectedCount()) || 0));
        const livesRemaining = Math.max(0, Math.floor(Number(getPlayerCarsRemaining()) || 0));
        return {
            name: 'YOU',
            targetLabel: 'PLAYER',
            showSwatch: false,
            score,
            collectedCount,
            livesRemaining,
            maxLives: PLAYER_CAR_POOL_SIZE,
            respawning: getIsCarDestroyed() && livesRemaining > 0,
            respawnMsRemaining: 0,
            isPlayer: true,
        };
    }

    function primeCollectiblesForCurrentCollectors({ botsEnabled = false } = {}) {
        if (typeof collectibleSystem?.primeForCollectors !== 'function') {
            return;
        }
        const collectors = [{ id: 'player', position: car.position }];
        if (botsEnabled) {
            collectors.push(...(getBotSystem()?.getCollectorDescriptors?.() || []));
        }
        collectibleSystem.primeForCollectors(collectors);
    }
    return {
        clearDriveKeys,
        enforceDriveLockMode,
        setPauseState,
        requestGameplayFullscreen,
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
        maybeFinalizeOnBotElimination,
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

    function enforceDriveLockMode(mode = WORLD_MAP_DRIVE_LOCK_MODES.none) {
        if (mode === WORLD_MAP_DRIVE_LOCK_MODES.none) {
            return;
        }
        if (mode === WORLD_MAP_DRIVE_LOCK_MODES.autobrake) {
            keys.forward = false;
            keys.backward = false;
            keys.left = false;
            keys.right = false;
            keys.handbrake = true;
            return;
        }
        clearDriveKeys();
    }

    function setPauseState(nextPaused, options = {}) {
        const shouldPause = Boolean(nextPaused);
        const showPauseMenu = options.showPauseMenu !== false;
        if (shouldPause && raceIntroController.isActive()) {
            return;
        }
        if (getIsGamePaused() === shouldPause) {
            return;
        }

        setIsGamePaused(shouldPause);
        audioController?.onPauseChanged?.(getIsGamePaused());
        if (getIsGamePaused()) {
            clearDriveKeys();
            if (getIsWelcomeModalVisible() || !showPauseMenu) {
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
        requestGameplayFullscreen();
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
        welcomeModalUi.hide();
        audioController?.onWelcomeVisibilityChanged?.(false);
        restartGameWithCountdown();
    }

    function showWelcomeModal() {
        carEditModeController.setActive(false);
        raceIntroController.stop();
        setIsWelcomeModalVisible(true);
        setIsGamePaused(true);
        clearDriveKeys();
        pauseMenuUi.hide();
        setCameraKeyboardControlsEnabled(true);
        welcomeModalUi.show();
        audioController?.onWelcomeVisibilityChanged?.(true);
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
        audioController?.onPlayerRespawn?.();
        onPlayerRespawned({
            carsRemaining: getPlayerCarsRemaining(),
            maxCars: PLAYER_CAR_POOL_SIZE,
            position: {
                x: car.position.x,
                y: car.position.y,
                z: car.position.z,
            },
        });
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
            audioController?.onBatteryDepleted?.();
            clearDriveKeys();
            if (options.showStatus !== false) {
                objectiveUi.showInfo(
                    'Battery empty. Suspension collapsed. Charge to recover.',
                    2600
                );
            }
        } else if (options.showStatus !== false) {
            audioController?.onBatteryRestored?.();
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

    function maybeFinalizeOnBotElimination({
        totalPickups = ROUND_TOTAL_PICKUPS,
        botHudState,
    } = {}) {
        if (getPickupRoundFinished()) {
            return { ok: false, reason: 'round-finished' };
        }
        if (normalizeGameMode(getGameMode()) !== 'bots') {
            return { ok: false, reason: 'not-bots-mode' };
        }

        const botEntries = Array.isArray(botHudState)
            ? botHudState
            : getBotSystem()?.getHudState?.() || [];
        if (botEntries.length === 0) {
            return { ok: false, reason: 'no-bots' };
        }

        const allOpponentsEliminated = botEntries.every((entry) => {
            const livesRemaining = Math.max(0, Math.round(Number(entry?.livesRemaining) || 0));
            return livesRemaining <= 0;
        });
        if (!allOpponentsEliminated) {
            return { ok: false, reason: 'opponents-still-active' };
        }

        const resolvedTotal = THREE.MathUtils.clamp(
            Math.round(Number(totalPickups) || ROUND_TOTAL_PICKUPS),
            1,
            5000
        );
        const currentCollected = THREE.MathUtils.clamp(
            Math.round(Number(getTotalCollectedCount()) || 0),
            0,
            resolvedTotal
        );
        const remainingPickups = Math.max(0, resolvedTotal - currentCollected);
        const bonusPointsAwarded = Math.max(
            0,
            Math.round(remainingPickups * ELIMINATION_AUTOCOLLECT_POINTS_PER_PICKUP)
        );

        if (remainingPickups > 0) {
            const nextPlayerCollectedCount = Math.max(
                0,
                Math.round(Number(getPlayerCollectedCount()) || 0) + remainingPickups
            );
            setPlayerCollectedCount(nextPlayerCollectedCount);
            setTotalCollectedCount(resolvedTotal);
        }

        if (bonusPointsAwarded > 0) {
            const nextPlayerScore = Math.max(
                0,
                Math.round(Number(getPlayerScore()) || 0) + bonusPointsAwarded
            );
            const nextTotalScore = Math.max(
                0,
                Math.round(Number(getTotalScore()) || 0) + bonusPointsAwarded
            );
            setPlayerScore(nextPlayerScore);
            setTotalScore(nextTotalScore);
        }
        onAutoCollectBonusAwarded?.({
            collectorId: 'player',
            pointsAwarded: bonusPointsAwarded,
            pickupCount: remainingPickups,
        });

        finalizePickupRound(resolvedTotal, resolvedTotal, {
            totalScore: getTotalScore(),
            finishReason: 'opponents-eliminated',
            bonusPointsAwarded,
            bonusPickupsAwarded: remainingPickups,
        });
        return {
            ok: true,
            remainingPickups,
            bonusPointsAwarded,
        };
    }

    function finalizePickupRound(totalPickups, collectedPickups, options = {}) {
        if (getPickupRoundFinished()) {
            return;
        }

        setPickupRoundFinished(true);
        clearPendingRespawn();
        collectibleSystem.setEnabled(false);
        clearDriveKeys();
        const botHudState = getBotHudStateWithScores();
        botStatusUi.render(botHudState, createPlayerHudState());

        const providedScoreboard = normalizeScoreboardEntries(options?.scoreboardEntries);
        const scoreboardRaw =
            providedScoreboard.length > 0
                ? providedScoreboard
                : [
                      {
                          collectorId: 'player',
                          name: 'You',
                          score: getPlayerScore(),
                          collectedCount: getPlayerCollectedCount(),
                      },
                      ...botHudState.map((bot) => ({
                          collectorId: bot.collectorId || '',
                          name: bot.name,
                          score: bot.score || 0,
                          collectedCount: bot.collectedCount || 0,
                      })),
                  ];
        if (scoreboardRaw.length === 0) {
            scoreboardRaw.push({
                collectorId: 'player',
                name: 'You',
                score: 0,
                collectedCount: 0,
            });
        }
        const scoreboard = scoreboardRaw.map((entry) => {
            const collectorId = resolveScoreboardCollectorId(entry);
            const entryStats = sanitizeCollectorRoundStats(entry?.stats);
            const collectorStats = sanitizeCollectorRoundStats(
                collectorId ? getCollectorRoundStats(collectorId) : null
            );
            return {
                ...entry,
                collectorId,
                stats: entryStats || collectorStats || null,
            };
        });
        scoreboard.sort((a, b) => {
            const scoreDelta = (b.score || 0) - (a.score || 0);
            if (scoreDelta !== 0) {
                return scoreDelta;
            }
            const collectedDelta = (b.collectedCount || 0) - (a.collectedCount || 0);
            if (collectedDelta !== 0) {
                return collectedDelta;
            }
            return a.name.localeCompare(b.name);
        });

        let topScore = 0;
        for (let i = 0; i < scoreboard.length; i += 1) {
            topScore = Math.max(topScore, scoreboard[i].score || 0);
        }
        const winners = scoreboard.filter((entry) => (entry.score || 0) === topScore);
        const winnerLabel = winners.map((entry) => entry.name).join(', ') || 'Nobody';
        const resolvedTotal = Number.isFinite(totalPickups) ? totalPickups : ROUND_TOTAL_PICKUPS;
        const resolvedCollectedRaw = Number.isFinite(collectedPickups)
            ? collectedPickups
            : getTotalCollectedCount();
        const resolvedCollected = THREE.MathUtils.clamp(
            Math.round(resolvedCollectedRaw),
            0,
            resolvedTotal
        );
        const resolvedTotalScoreRaw = Number.isFinite(options?.totalScore)
            ? options.totalScore
            : Number.isFinite(getTotalScore())
              ? getTotalScore()
              : scoreboard.reduce((sum, entry) => sum + (entry.score || 0), 0);
        const resolvedTotalScore = Math.max(0, Math.round(Number(resolvedTotalScoreRaw) || 0));
        const finishReason =
            options?.finishReason === 'opponents-eliminated'
                ? 'opponents-eliminated'
                : 'pickups-exhausted';
        const finishLabel =
            finishReason === 'opponents-eliminated' ? 'Opponents eliminated' : 'No objects left';
        const bonusPointsAwarded = Math.max(
            0,
            Math.round(Number(options?.bonusPointsAwarded) || 0)
        );
        const bonusPickupsAwarded = Math.max(
            0,
            Math.round(Number(options?.bonusPickupsAwarded) || 0)
        );
        const summaryText =
            `Collected ${resolvedCollected}/${resolvedTotal} objects. Total score: ${resolvedTotalScore} pts.` +
            (bonusPointsAwarded > 0 && bonusPickupsAwarded > 0
                ? ` Bonus: +${bonusPointsAwarded} pts from ${bonusPickupsAwarded} auto-collected objects.`
                : '');
        const tiePrefix = winners.length > 1 ? 'Tie' : 'Winner';
        const winnerSummary = `${tiePrefix}: ${winnerLabel}`;

        objectiveUi.showResult(
            `${finishLabel} (${resolvedCollected}/${resolvedTotal}). ${tiePrefix}: ${winnerLabel} (${topScore} pts).`
        );
        finalScoreboardUi.show({
            summaryText,
            entries: scoreboard,
            topScore,
            scoringModelText: SCORE_MODEL_TEXT,
            winnerLabel: winnerSummary,
            finishLabel,
            totalCollected: resolvedCollected,
            totalPickups: resolvedTotal,
            totalScore: resolvedTotalScore,
            bonusPointsAwarded,
            bonusPickupsAwarded,
        });
        onRoundFinalized({
            finishReason,
            finishLabel,
            tiePrefix,
            winnerLabel,
            winnersCount: winners.length,
            topScore,
            totalPickups: resolvedTotal,
            totalCollected: resolvedCollected,
            totalScore: resolvedTotalScore,
            bonusPointsAwarded,
            bonusPickupsAwarded,
            scoreboardEntries: scoreboard.length,
        });
        audioController?.onRoundFinished?.({
            scoreboardEntries: scoreboard,
            topScore,
            totalPickups: resolvedTotal,
            totalCollected: resolvedCollected,
            totalScore: resolvedTotalScore,
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

        const crashReason =
            options.statusText ||
            `Wrong (${colorNameFromHex(pickupColorHex)})! Correct was ${colorNameFromHex(targetColorHex)}.`;
        setPlayerCarsRemaining(Math.max(0, getPlayerCarsRemaining() - 1));
        resetPlayerPickupCombo();
        onPlayerExplosion({
            statusText: crashReason,
            obstacleCategory: options?.collision?.obstacleCategory || 'generic',
            impactSpeed: Number(options?.collision?.impactSpeed) || 0,
            carsRemaining: getPlayerCarsRemaining(),
            maxCars: PLAYER_CAR_POOL_SIZE,
            position: {
                x: hitPosition?.x || 0,
                y: hitPosition?.y || 0,
                z: hitPosition?.z || 0,
            },
            collision: options?.collision
                ? {
                      obstacleCategory: options.collision.obstacleCategory,
                      impactSpeed: Number(options.collision.impactSpeed) || 0,
                      impactNormalX: Number(options.collision?.impactNormal?.x) || 0,
                      impactNormalZ: Number(options.collision?.impactNormal?.z) || 0,
                  }
                : null,
        });
        crashDebrisController.spawnCarDebris(hitPosition, options.collision || null);
        audioController?.onPlayerExplosion?.({
            impactSpeed: Number(options?.collision?.impactSpeed) || 0,
            obstacleCategory: options?.collision?.obstacleCategory || 'generic',
            position: hitPosition?.clone?.() || hitPosition,
        });

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
        raceIntroController.stop();
        setCameraKeyboardControlsEnabled(true);
        clearPendingRespawn();
        clearScorePopups();
        objectiveUi.resetStatus();
        finalScoreboardUi.hide();
        setPickupRoundFinished(false);
        resetPickupScoring();
        setPlayerCollectedCount(0);
        setPlayerScore(0);
        setTotalCollectedCount(0);
        setTotalScore(0);
        setIsCarDestroyed(false);
        car.visible = true;
        car.position.copy(playerSpawnState.position);
        snapCarToGround();
        car.rotation.set(0, playerSpawnState.rotationY, 0);
        collectibleSystem.setEnabled(true);
        primeCollectiblesForCurrentCollectors({
            botsEnabled: normalizeGameMode(getGameMode()) === 'bots',
        });
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
        setCameraKeyboardControlsEnabled(true);
        setPauseState(false);
        replayController.stopRecording();
        replayController.stopPlayback();
        replayController.clear();

        clearPendingRespawn();
        clearScorePopups();
        replayEffectsController.clearReplayEffects();
        crashDebrisController.clearDebris();
        if (normalizeGameMode(getGameMode()) !== 'online') {
            mineController?.clearAll?.();
        }

        objectiveUi.resetStatus();
        finalScoreboardUi.hide();
        setPickupRoundFinished(false);
        resetPickupScoring();
        setPlayerCollectedCount(0);
        setPlayerScore(0);
        setTotalCollectedCount(0);
        setTotalScore(0);
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
        primeCollectiblesForCurrentCollectors({ botsEnabled });
        botStatusUi.render(getBotHudStateWithScores(), createPlayerHudState());

        crashDebrisController.resetPlayerDamageState();
        clearDriveKeys();
        initializePlayerPhysics(car);
        setPhysicsAccumulator(0);
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

    function requestGameplayFullscreen() {
        if (document.fullscreenElement) {
            return;
        }
        const fullscreenRoot = document.documentElement;
        if (!fullscreenRoot || typeof fullscreenRoot.requestFullscreen !== 'function') {
            return;
        }
        void fullscreenRoot.requestFullscreen().catch(() => {
            // Ignore browser/user-denied fullscreen attempts.
        });
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

    function normalizeScoreboardEntries(entries) {
        if (!Array.isArray(entries)) {
            return [];
        }
        return entries
            .map((entry) => ({
                collectorId: resolveScoreboardCollectorId(entry),
                name:
                    typeof entry?.name === 'string' && entry.name.trim()
                        ? entry.name.trim()
                        : 'Player',
                score: Math.max(0, Math.round(Number(entry?.score) || 0)),
                collectedCount: Math.max(0, Math.round(Number(entry?.collectedCount) || 0)),
                stats: sanitizeCollectorRoundStats(entry?.stats),
            }))
            .filter((entry) => entry.name);
    }

    function resolveScoreboardCollectorId(entry) {
        if (!entry || typeof entry !== 'object') {
            return '';
        }
        if (typeof entry.collectorId === 'string' && entry.collectorId.trim()) {
            return entry.collectorId.trim();
        }
        if (typeof entry.id === 'string' && entry.id.trim()) {
            return entry.id.trim();
        }
        if (entry.isSelf) {
            return 'player';
        }
        return '';
    }

    function sanitizeCollectorRoundStats(stats) {
        if (!stats || typeof stats !== 'object') {
            return null;
        }
        return {
            pickupCount: Math.max(0, Math.round(Number(stats.pickupCount) || 0)),
            pickupPoints: Math.max(0, Math.round(Number(stats.pickupPoints) || 0)),
            mineDeployedCount: Math.max(0, Math.round(Number(stats.mineDeployedCount) || 0)),
            mineDetonatedCount: Math.max(0, Math.round(Number(stats.mineDetonatedCount) || 0)),
            mineHitCount: Math.max(0, Math.round(Number(stats.mineHitCount) || 0)),
            mineHitTakenCount: Math.max(0, Math.round(Number(stats.mineHitTakenCount) || 0)),
            mineKillCount: Math.max(0, Math.round(Number(stats.mineKillCount) || 0)),
            mineKillPoints: Math.max(0, Math.round(Number(stats.mineKillPoints) || 0)),
            autoCollectedCount: Math.max(0, Math.round(Number(stats.autoCollectedCount) || 0)),
            autoCollectedPoints: Math.max(0, Math.round(Number(stats.autoCollectedPoints) || 0)),
            bestPickupCombo: Math.max(0, Math.round(Number(stats.bestPickupCombo) || 0)),
            bestMineChain: Math.max(0, Math.round(Number(stats.bestMineChain) || 0)),
            riskPickupCount: Math.max(0, Math.round(Number(stats.riskPickupCount) || 0)),
            endgamePickupCount: Math.max(0, Math.round(Number(stats.endgamePickupCount) || 0)),
            endgameMineKillCount: Math.max(0, Math.round(Number(stats.endgameMineKillCount) || 0)),
            antiFarmMineKillCount: Math.max(
                0,
                Math.round(Number(stats.antiFarmMineKillCount) || 0)
            ),
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
