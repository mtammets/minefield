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
import { getCarSkinPresetByColorHex } from './car-skins.js';
import { readPersistedAutoFullscreenOnStart } from './player-persistence.js';

const ELIMINATION_AUTOCOLLECT_POINTS_PER_PICKUP = 100;
const ROUND_FINALIZE_UI_DEFER_FRAMES_DEFAULT = 2;
const ROUND_FINALIZE_UI_DEFER_FRAMES_ELIMINATION = 3;
const VEHICLE_RECOVER_MAX_SPEED_KPH = 18;
const VEHICLE_RECOVER_COOLDOWN_MS = 3500;
const DEFAULT_START_CAMERA_VIEW_MODE = 6;
const CHASE_CAMERA_VIEW_MODE = 6;
const CHASE_CAMERA_TUNE_PROFILE_SAVE_DEBOUNCE_MS = 420;
const SCORE_MODEL_TEXT =
    'Pickup: 100 pts. Mine kill: 300 pts. Auto-collected remaining pickups: 100 pts each.';

export function createGameSessionController({
    keys,
    car,
    playerSpawnState,
    resolvePlayerSpawnState = null,
    getGroundHeightAt,
    setCameraKeyboardControlsEnabled,
    setCameraViewMode = () => DEFAULT_START_CAMERA_VIEW_MODE,
    getCameraViewMode = () => DEFAULT_START_CAMERA_VIEW_MODE,
    resetCameraTrackingState,
    getChaseCameraSettings = () => createDefaultChaseCameraSettings(),
    setChaseCameraSettings = () => createDefaultChaseCameraSettings(),
    adjustChaseCameraSettings = () => createDefaultChaseCameraSettings(),
    resetChaseCameraSettings = () => createDefaultChaseCameraSettings(),
    getChaseCameraTuneSnapshot = () => null,
    initializePlayerPhysics,
    getVehicleState = () => ({ speed: 0 }),
    setPlayerBatteryLevel,
    setPlayerBatteryDepleted,
    setPlayerCarBodyColor,
    setPlayerCarAppearance,
    resolvePlayerCarColorHex,
    resolvePlayerCarSkinId,
    resolvePlayerCarVehicleId = (vehicleId) => vehicleId || '',
    getCarSkinPresetById = () => null,
    persistPlayerCarColorHex,
    persistPlayerCarSkinId,
    persistPlayerCarVehicleId = () => {},
    objectiveUi,
    controlsHelpUi = null,
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
    vehicleWeaponSystem = null,
    getBotTrafficSystem,
    getCollectorScore = () => 0,
    getCollectorRoundStats = () => null,
    crashDebrisController,
    mineController,
    setPhysicsAccumulator,
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
    getAuthState = () => null,
    readGuestChaseCameraSettings = () => createDefaultChaseCameraSettings(),
    persistGuestChaseCameraSettings = () => {},
    persistAccountChaseCameraSettings = null,
    getSelectedCarColorHex,
    setSelectedCarColorHex,
    getSelectedCarSkinId = () => '',
    setSelectedCarSkinId = () => {},
    getSelectedCarVehicleId = () => '',
    setSelectedCarVehicleId = () => {},
    getGameMode = () => 'bots',
    setGameMode = () => {},
    setMultiplayerPanelVisible = () => {},
    startOnlineRoomFlow = () => {},
    prepareBotsSession = null,
    clearScorePopups = () => {},
    onAutoCollectBonusAwarded = () => {},
    onRoundFinalized = () => {},
    onPlayerRespawned = () => {},
    onPlayerExplosion = () => {},
    audioController = null,
} = {}) {
    const getBotSystem =
        typeof getBotTrafficSystem === 'function' ? getBotTrafficSystem : () => null;
    let pendingRoundPresentationRafHandle = null;
    let pendingRoundPresentationToken = 0;
    let lastVehicleRecoverAt = -Number.POSITIVE_INFINITY;
    let chaseCameraTuneModeActive = false;
    let chaseCameraTunePauseOwned = false;
    let chaseCameraTunePreviousViewMode = DEFAULT_START_CAMERA_VIEW_MODE;
    let chaseCameraTuneSaveTimeout = null;
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
        collectibleSystem.primeForCollectors(collectors);
    }
    return {
        clearDriveKeys,
        enforceDriveLockMode,
        setPauseState,
        toggleChaseCameraTuneMode,
        isChaseCameraTuneModeActive,
        adjustChaseCameraTune,
        resetChaseCameraTuneToDefault,
        getCameraTuneUiSnapshot,
        refreshPauseMenuCameraTuneStatus,
        handleAuthStateChanged,
        requestGameplayFullscreen,
        dismissWelcomeModal,
        showWelcomeModal,
        startRaceIntroSequence,
        restartGameWithCountdown,
        clearPendingRespawn,
        snapCarToGround,
        recoverPlayerCar,
        respawnPlayerCar,
        setBatteryDepletedState,
        updateBattery,
        addBattery,
        maybeFinalizeOnBotElimination,
        finalizePickupRound,
        triggerCarExplosion,
        triggerObstacleCrash,
        startNewGame,
        setSelectedPlayerCarVehicle,
        setSelectedPlayerCarColor,
        setSelectedPlayerCarSkin,
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
        if (!shouldPause && chaseCameraTuneModeActive) {
            deactivateChaseCameraTuneMode({
                resumeGameplay: false,
                flushSave: true,
            });
        }
        if (getIsGamePaused() === shouldPause) {
            if (shouldPause && showPauseMenu) {
                pauseMenuUi.refreshCameraTuneStatus?.();
            }
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
            pauseMenuUi.refreshCameraTuneStatus?.();
            return;
        }
        pauseMenuUi.hide();
    }

    function dismissWelcomeModal(nextMode = getGameMode(), startContext = null) {
        if (!getIsWelcomeModalVisible()) {
            return;
        }
        clearPendingRoundPresentation();
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
        objectiveUi.setGameplayVisible?.(true);
        controlsHelpUi?.setGameplayVisible?.(true);
        audioController?.onWelcomeVisibilityChanged?.(false);
        restartGameWithCountdown();
    }

    function showWelcomeModal() {
        clearPendingRoundPresentation();
        deactivateChaseCameraTuneMode({
            resumeGameplay: false,
            flushSave: true,
        });
        carEditModeController.setActive(false);
        raceIntroController.stop();
        setIsWelcomeModalVisible(true);
        setIsGamePaused(true);
        clearDriveKeys();
        objectiveUi.setGameplayVisible?.(false);
        controlsHelpUi?.setGameplayVisible?.(false);
        pauseMenuUi.hide();
        setCameraKeyboardControlsEnabled(true);
        welcomeModalUi.show();
        if (getAuthState()?.authenticated) {
            welcomeModalUi.focusAuthPanel?.('sign-in', {
                preserveStatus: true,
            });
        }
        audioController?.onWelcomeVisibilityChanged?.(true);
    }

    function toggleChaseCameraTuneMode() {
        if (chaseCameraTuneModeActive) {
            return deactivateChaseCameraTuneMode({
                resumeGameplay: true,
                flushSave: true,
            });
        }

        chaseCameraTunePauseOwned = !getIsGamePaused();
        chaseCameraTunePreviousViewMode = getCameraViewMode();
        chaseCameraTuneModeActive = true;
        if (chaseCameraTunePreviousViewMode !== CHASE_CAMERA_VIEW_MODE) {
            setCameraViewMode(CHASE_CAMERA_VIEW_MODE);
        }
        setCameraKeyboardControlsEnabled(false);
        if (chaseCameraTunePauseOwned) {
            setPauseState(true, {
                showPauseMenu: true,
            });
        } else {
            pauseMenuUi.show();
        }
        refreshPauseMenuCameraTuneStatus();
        objectiveUi.showInfo('Camera tune: arrows adjust, R reset, C close.', 1800);
        return getCameraTuneUiSnapshot();
    }

    function isChaseCameraTuneModeActive() {
        return chaseCameraTuneModeActive;
    }

    function adjustChaseCameraTune({ distanceStep = 0, heightStep = 0 } = {}) {
        const nextSettings = adjustChaseCameraSettings({
            distanceStep,
            heightStep,
        });
        return handleAppliedChaseCameraSettings(nextSettings);
    }

    function resetChaseCameraTuneToDefault() {
        const nextSettings = resetChaseCameraSettings();
        return handleAppliedChaseCameraSettings(nextSettings);
    }

    function getCameraTuneUiSnapshot() {
        const cameraSnapshot = getChaseCameraTuneSnapshot?.();
        if (!cameraSnapshot || typeof cameraSnapshot !== 'object') {
            return {
                visible: false,
            };
        }
        return {
            visible: true,
            active: chaseCameraTuneModeActive,
            scopeLabel: getAuthState()?.authenticated ? 'PROFILE' : 'LOCAL',
            distancePercent: cameraSnapshot.distancePercent,
            heightPercent: cameraSnapshot.heightPercent,
            distanceTone: cameraSnapshot.distanceTone,
            heightTone: cameraSnapshot.heightTone,
            resetDisabled: false,
        };
    }

    function refreshPauseMenuCameraTuneStatus() {
        pauseMenuUi.refreshCameraTuneStatus?.();
        return getCameraTuneUiSnapshot();
    }

    function handleAuthStateChanged(authState = null) {
        clearPendingChaseCameraProfileSave();
        const authenticated = Boolean(authState?.authenticated);
        const nextSettings = authenticated
            ? normalizeChaseCameraSettings(authState?.chaseCameraSettings)
            : normalizeChaseCameraSettings(readGuestChaseCameraSettings());
        setChaseCameraSettings(nextSettings);
        refreshPauseMenuCameraTuneStatus();
        return nextSettings;
    }

    function startRaceIntroSequence() {
        if (getIsGamePaused() || getIsWelcomeModalVisible()) {
            return;
        }
        clearDriveKeys();
        resetCameraTrackingState();
        setCameraKeyboardControlsEnabled(false);
        controlsHelpUi?.notifyGameplayRoundStart?.();
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

    function clearPendingRoundPresentation() {
        if (pendingRoundPresentationRafHandle != null) {
            window.cancelAnimationFrame(pendingRoundPresentationRafHandle);
        }
        pendingRoundPresentationRafHandle = null;
        pendingRoundPresentationToken += 1;
    }

    function handleAppliedChaseCameraSettings(nextSettings) {
        const safeSettings = normalizeChaseCameraSettings(nextSettings);
        if (getAuthState()?.authenticated) {
            scheduleChaseCameraProfileSave(safeSettings);
        } else {
            persistGuestChaseCameraSettings(safeSettings);
        }
        refreshPauseMenuCameraTuneStatus();
        return getCameraTuneUiSnapshot();
    }

    function scheduleChaseCameraProfileSave(nextSettings) {
        clearPendingChaseCameraProfileSave();
        if (typeof persistAccountChaseCameraSettings !== 'function') {
            return;
        }
        const safeSettings = normalizeChaseCameraSettings(nextSettings);
        chaseCameraTuneSaveTimeout = window.setTimeout(() => {
            chaseCameraTuneSaveTimeout = null;
            void Promise.resolve(persistAccountChaseCameraSettings(safeSettings)).catch(() => {});
        }, CHASE_CAMERA_TUNE_PROFILE_SAVE_DEBOUNCE_MS);
    }

    function clearPendingChaseCameraProfileSave() {
        if (chaseCameraTuneSaveTimeout == null) {
            return;
        }
        window.clearTimeout(chaseCameraTuneSaveTimeout);
        chaseCameraTuneSaveTimeout = null;
    }

    function flushChaseCameraProfileSave() {
        if (chaseCameraTuneSaveTimeout == null) {
            return;
        }
        clearPendingChaseCameraProfileSave();
        if (typeof persistAccountChaseCameraSettings !== 'function') {
            return;
        }
        void Promise.resolve(
            persistAccountChaseCameraSettings(
                normalizeChaseCameraSettings(getChaseCameraSettings())
            )
        ).catch(() => {});
    }

    function deactivateChaseCameraTuneMode({
        resumeGameplay = false,
        flushSave = false,
        restorePreviousView = true,
    } = {}) {
        if (!chaseCameraTuneModeActive) {
            if (flushSave) {
                flushChaseCameraProfileSave();
            }
            return getCameraTuneUiSnapshot();
        }

        const previousViewMode = chaseCameraTunePreviousViewMode;
        const shouldResumeGameplay = resumeGameplay && chaseCameraTunePauseOwned;
        chaseCameraTuneModeActive = false;
        chaseCameraTunePauseOwned = false;
        chaseCameraTunePreviousViewMode = DEFAULT_START_CAMERA_VIEW_MODE;
        if (restorePreviousView && previousViewMode !== CHASE_CAMERA_VIEW_MODE) {
            setCameraViewMode(previousViewMode);
        }
        setCameraKeyboardControlsEnabled(!carEditModeController.isActive());
        if (flushSave) {
            flushChaseCameraProfileSave();
        }
        refreshPauseMenuCameraTuneStatus();
        if (shouldResumeGameplay) {
            setPauseState(false);
        }
        return getCameraTuneUiSnapshot();
    }

    function refreshPlayerSpawnState() {
        if (typeof resolvePlayerSpawnState !== 'function') {
            return playerSpawnState;
        }
        const nextSpawnState = resolvePlayerSpawnState();
        if (!nextSpawnState?.position) {
            return playerSpawnState;
        }
        const nextX = Number(nextSpawnState.position.x);
        const nextY = Number(nextSpawnState.position.y);
        const nextZ = Number(nextSpawnState.position.z);
        if (![nextX, nextY, nextZ].every(Number.isFinite)) {
            return playerSpawnState;
        }
        playerSpawnState.position.set(nextX, nextY, nextZ);
        if (Number.isFinite(nextSpawnState.rotationY)) {
            playerSpawnState.rotationY = nextSpawnState.rotationY;
        }
        return playerSpawnState;
    }

    function snapCarToGround() {
        car.position.y = getGroundHeightAt(car.position.x, car.position.z) + PLAYER_RIDE_HEIGHT;
    }

    function recoverPlayerCar() {
        if (getIsCarDestroyed()) {
            return {
                ok: false,
                message:
                    getPlayerCarsRemaining() > 0
                        ? 'Car destroyed. Wait for respawn.'
                        : 'No cars left. Press Q to restart.',
                timeoutMs: 1800,
            };
        }

        const speedMps = Math.abs(Number(getVehicleState()?.speed) || 0);
        const speedKph = speedMps * 3.6;
        if (speedKph > VEHICLE_RECOVER_MAX_SPEED_KPH) {
            return {
                ok: false,
                message: `Slow below ${VEHICLE_RECOVER_MAX_SPEED_KPH} km/h to recover.`,
                timeoutMs: 1500,
            };
        }

        const now = Date.now();
        const cooldownRemainingMs =
            VEHICLE_RECOVER_COOLDOWN_MS - Math.max(0, now - lastVehicleRecoverAt);
        if (cooldownRemainingMs > 0) {
            return {
                ok: false,
                message: `Recover cooling down (${(cooldownRemainingMs / 1000).toFixed(1)}s).`,
                timeoutMs: 1400,
            };
        }

        const fallbackX = Number.isFinite(playerSpawnState?.position?.x)
            ? playerSpawnState.position.x
            : 0;
        const fallbackZ = Number.isFinite(playerSpawnState?.position?.z)
            ? playerSpawnState.position.z
            : 0;
        const targetX = Number.isFinite(car.position?.x) ? car.position.x : fallbackX;
        const targetZ = Number.isFinite(car.position?.z) ? car.position.z : fallbackZ;
        const targetHeading = Number.isFinite(car.rotation?.y)
            ? car.rotation.y
            : Number.isFinite(playerSpawnState?.rotationY)
              ? playerSpawnState.rotationY
              : 0;

        clearDriveKeys();
        car.visible = true;
        car.position.set(targetX, 0, targetZ);
        snapCarToGround();
        car.position.y += 0.08;
        car.rotation.set(0, targetHeading, 0);
        resetCameraTrackingState();
        initializePlayerPhysics(car);
        setPhysicsAccumulator(0);
        skidMarkController.reset?.();
        lastVehicleRecoverAt = now;

        return {
            ok: true,
            message: 'Vehicle recovered.',
            timeoutMs: 1300,
        };
    }

    function respawnPlayerCar() {
        if (getPlayerCarsRemaining() <= 0) {
            return;
        }

        refreshPlayerSpawnState();
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
        vehicleWeaponSystem?.setTriggerHeld?.(false);
        vehicleWeaponSystem?.grantWeapon?.();
        setPlayerBattery(BATTERY_MAX);
        setPlayerBatteryLevel(getPlayerBattery() / BATTERY_MAX);
        setBatteryDepletedState(false, { showStatus: false });
        initializePlayerPhysics(car);
        setPhysicsAccumulator(0);
        lastVehicleRecoverAt = -Number.POSITIVE_INFINITY;

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
            deferUiFrames: ROUND_FINALIZE_UI_DEFER_FRAMES_ELIMINATION,
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
        const requestedFinishReason =
            typeof options?.finishReason === 'string' ? options.finishReason.trim() : '';
        const finishReason = requestedFinishReason || 'pickups-exhausted';
        const finishLabel =
            typeof options?.finishLabel === 'string' && options.finishLabel.trim()
                ? options.finishLabel.trim()
                : finishReason === 'opponents-eliminated'
                  ? 'Opponents eliminated'
                  : 'No pickups left';
        const bonusPointsAwarded = Math.max(
            0,
            Math.round(Number(options?.bonusPointsAwarded) || 0)
        );
        const bonusPickupsAwarded = Math.max(
            0,
            Math.round(Number(options?.bonusPickupsAwarded) || 0)
        );
        const defaultSummaryText =
            `Pickups ${resolvedCollected}/${resolvedTotal}. Total score: ${resolvedTotalScore} pts.` +
            (bonusPointsAwarded > 0 && bonusPickupsAwarded > 0
                ? ` Auto sweep: +${bonusPointsAwarded} pts from ${bonusPickupsAwarded} remaining pickups.`
                : '');
        const summaryText =
            typeof options?.summaryText === 'string' && options.summaryText.trim()
                ? options.summaryText.trim()
                : defaultSummaryText;
        const tiePrefix = winners.length > 1 ? 'Tie' : 'Winner';
        const winnerSummary = `${tiePrefix}: ${winnerLabel}`;
        const presentationPayload = {
            resultText:
                typeof options?.resultText === 'string' && options.resultText.trim()
                    ? options.resultText.trim()
                    : `${finishLabel} (${resolvedCollected}/${resolvedTotal}). ${tiePrefix}: ${winnerLabel} (${topScore} pts).`,
            summaryText,
            scoreboard,
            topScore,
            winnerSummary,
            finishLabel,
            finishReason,
            titleText:
                typeof options?.titleText === 'string' && options.titleText.trim()
                    ? options.titleText.trim()
                    : '',
            tiePrefix,
            winnerLabel,
            winnersCount: winners.length,
            totalPickups: resolvedTotal,
            totalCollected: resolvedCollected,
            totalScore: resolvedTotalScore,
            bonusPointsAwarded,
            bonusPickupsAwarded,
            scoreboardEntries: scoreboard.length,
        };
        const defaultDeferFrames =
            finishReason === 'opponents-eliminated'
                ? ROUND_FINALIZE_UI_DEFER_FRAMES_ELIMINATION
                : ROUND_FINALIZE_UI_DEFER_FRAMES_DEFAULT;
        const deferUiFrames = THREE.MathUtils.clamp(
            Math.round(Number(options?.deferUiFrames) || defaultDeferFrames),
            0,
            6
        );
        scheduleRoundPresentation(presentationPayload, deferUiFrames);
    }

    function scheduleRoundPresentation(
        payload,
        deferFrames = ROUND_FINALIZE_UI_DEFER_FRAMES_DEFAULT
    ) {
        if (!payload || typeof payload !== 'object') {
            return;
        }
        clearPendingRoundPresentation();
        const token = pendingRoundPresentationToken;
        let remainingFrames = Math.max(0, Math.round(Number(deferFrames) || 0));
        if (remainingFrames <= 0) {
            presentRoundPresentation(payload);
            return;
        }
        const tick = () => {
            if (token !== pendingRoundPresentationToken) {
                return;
            }
            remainingFrames -= 1;
            if (remainingFrames <= 0) {
                pendingRoundPresentationRafHandle = null;
                presentRoundPresentation(payload);
                return;
            }
            pendingRoundPresentationRafHandle = window.requestAnimationFrame(tick);
        };
        pendingRoundPresentationRafHandle = window.requestAnimationFrame(tick);
    }

    function presentRoundPresentation(payload) {
        objectiveUi.showResult(payload.resultText);
        finalScoreboardUi.show({
            titleText: payload.titleText,
            summaryText: payload.summaryText,
            entries: payload.scoreboard,
            topScore: payload.topScore,
            scoringModelText: SCORE_MODEL_TEXT,
            winnerLabel: payload.winnerSummary,
            finishLabel: payload.finishLabel,
            totalCollected: payload.totalCollected,
            totalPickups: payload.totalPickups,
            totalScore: payload.totalScore,
            bonusPointsAwarded: payload.bonusPointsAwarded,
            bonusPickupsAwarded: payload.bonusPickupsAwarded,
        });
        onRoundFinalized({
            finishReason: payload.finishReason,
            finishLabel: payload.finishLabel,
            tiePrefix: payload.tiePrefix,
            winnerLabel: payload.winnerLabel,
            winnersCount: payload.winnersCount,
            topScore: payload.topScore,
            totalPickups: payload.totalPickups,
            totalCollected: payload.totalCollected,
            totalScore: payload.totalScore,
            bonusPointsAwarded: payload.bonusPointsAwarded,
            bonusPickupsAwarded: payload.bonusPickupsAwarded,
            scoreboardEntries: payload.scoreboardEntries,
            scoreboard: Array.isArray(payload.scoreboard)
                ? payload.scoreboard.map((entry) => ({ ...entry }))
                : [],
        });
        audioController?.onRoundFinished?.({
            scoreboardEntries: payload.scoreboard,
            topScore: payload.topScore,
            totalPickups: payload.totalPickups,
            totalCollected: payload.totalCollected,
            totalScore: payload.totalScore,
        });
    }

    function triggerCarExplosion(hitPosition, pickupColorHex, targetColorHex, options = {}) {
        if (getIsCarDestroyed() || getPickupRoundFinished()) {
            return;
        }
        clearPendingRespawn();
        setIsCarDestroyed(true);
        setBatteryDepletedState(false, { showStatus: false });
        chargingZoneController.reset();
        chargingProgressHudController.reset();
        collectibleSystem.setEnabled(false);
        vehicleWeaponSystem?.onPlayerDestroyed?.();
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

    function startNewGame() {
        raceIntroController.stop();
        carEditModeController.setActive(false);
        setCameraKeyboardControlsEnabled(true);
        setCameraViewMode(DEFAULT_START_CAMERA_VIEW_MODE);
        setPauseState(false);
        controlsHelpUi?.refreshContext?.();
        clearPendingRoundPresentation();

        clearPendingRespawn();
        clearScorePopups();
        crashDebrisController.clearDebris();
        mineController?.resetRoundInventory?.();
        if (normalizeGameMode(getGameMode()) !== 'online') {
            mineController?.clearAll?.();
        }
        controlsHelpUi?.refreshMineInventory?.();

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
        vehicleWeaponSystem?.resetRound?.();

        refreshPlayerSpawnState();
        car.visible = true;
        car.position.copy(playerSpawnState.position);
        snapCarToGround();
        car.rotation.set(0, playerSpawnState.rotationY, 0);

        const botsEnabled = normalizeGameMode(getGameMode()) === 'bots';
        setMultiplayerPanelVisible(!botsEnabled);

        if (botsEnabled && typeof prepareBotsSession === 'function') {
            getBotSystem()?.setEnabled?.(true);
            prepareBotsSession();
        } else if (botsEnabled) {
            collectibleSystem.reset?.({
                seedOffset: Math.floor(Math.random() * 0x7fffffff),
            });
            collectibleSystem.setEnabled(true);
            getBotSystem()?.setEnabled?.(true);
            getBotSystem()?.reset?.({ sharedTargetColorHex: SHARED_PICKUP_COLOR_HEX });
            primeCollectiblesForCurrentCollectors({ botsEnabled: true });
            botStatusUi.render(getBotHudStateWithScores(), createPlayerHudState());
        } else {
            collectibleSystem.reset?.({ seedOffset: 0 });
            collectibleSystem.setEnabled(true);
            getBotSystem()?.setEnabled?.(false);
            primeCollectiblesForCurrentCollectors({ botsEnabled: false });
            botStatusUi.render(getBotHudStateWithScores(), createPlayerHudState());
        }

        crashDebrisController.resetPlayerDamageState();
        clearDriveKeys();
        initializePlayerPhysics(car);
        setPhysicsAccumulator(0);
        lastVehicleRecoverAt = -Number.POSITIVE_INFINITY;
        vehicleWeaponSystem?.grantWeapon?.();
    }

    function setSelectedPlayerCarVehicle(vehicleId, options = {}) {
        const { persist = true } = options;
        const normalizedVehicleId = resolvePlayerCarVehicleId(vehicleId);
        if (!normalizedVehicleId) {
            return;
        }

        setSelectedCarVehicleId(normalizedVehicleId);
        const currentSkinId = resolvePlayerCarSkinId(getSelectedCarSkinId());
        const currentColorHex = resolvePlayerCarColorHex(getSelectedCarColorHex());

        if (typeof setPlayerCarAppearance === 'function') {
            setPlayerCarAppearance({
                vehicleId: normalizedVehicleId,
                skinId: currentSkinId,
                colorHex: currentColorHex,
            });
        }

        crashDebrisController?.initializeBodyPartBaselines?.();
        crashDebrisController?.resetPlayerDamageState?.();

        if (persist) {
            persistPlayerCarVehicleId?.(normalizedVehicleId);
        }
    }

    function setSelectedPlayerCarColor(colorHex, options = {}) {
        const { persist = true } = options;
        const normalized = resolvePlayerCarColorHex(colorHex);
        const preset = getCarSkinPresetByColorHex(normalized);
        const normalizedSkinId = resolvePlayerCarSkinId(preset?.id);
        const normalizedVehicleId = resolvePlayerCarVehicleId(getSelectedCarVehicleId());
        setSelectedCarSkinId(normalizedSkinId);
        setSelectedCarColorHex(normalized);
        if (typeof setPlayerCarAppearance === 'function') {
            setPlayerCarAppearance({
                vehicleId: normalizedVehicleId,
                skinId: normalizedSkinId,
                colorHex: normalized,
            });
        } else {
            setPlayerCarBodyColor(normalized);
        }
        if (persist) {
            persistPlayerCarSkinId?.(normalizedSkinId);
            persistPlayerCarColorHex(normalized);
        }
    }

    function setSelectedPlayerCarSkin(skinId, options = {}) {
        const { persist = true } = options;
        const normalizedSkinId = resolvePlayerCarSkinId(skinId);
        const preset = getCarSkinPresetById(normalizedSkinId);
        if (!preset || typeof preset !== 'object') {
            return;
        }
        const normalizedColorHex = resolvePlayerCarColorHex(preset.bodyColor);
        const normalizedVehicleId = resolvePlayerCarVehicleId(getSelectedCarVehicleId());
        setSelectedCarSkinId(normalizedSkinId);
        setSelectedCarColorHex(normalizedColorHex);
        if (typeof setPlayerCarAppearance === 'function') {
            setPlayerCarAppearance({
                vehicleId: normalizedVehicleId,
                skinId: normalizedSkinId,
                colorHex: normalizedColorHex,
            });
        } else {
            setPlayerCarBodyColor(normalizedColorHex);
        }
        if (persist) {
            persistPlayerCarSkinId?.(normalizedSkinId);
            persistPlayerCarColorHex(normalizedColorHex);
        }
    }

    function requestGameplayFullscreen(options = {}) {
        if (!options.force && !readPersistedAutoFullscreenOnStart(true)) {
            return;
        }
        if (document.fullscreenElement) {
            return;
        }
        const fullscreenRoot = document.documentElement;
        if (!fullscreenRoot || typeof fullscreenRoot.requestFullscreen !== 'function') {
            return;
        }
        let requestPromise = null;
        try {
            requestPromise = fullscreenRoot.requestFullscreen({
                navigationUI: 'hide',
            });
        } catch {
            requestPromise = null;
        }
        if (requestPromise && typeof requestPromise.catch === 'function') {
            void requestPromise.catch(() => {
                void fullscreenRoot.requestFullscreen().catch(() => {
                    // Ignore browser/user-denied fullscreen attempts.
                });
            });
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

function createDefaultChaseCameraSettings() {
    return {
        distanceBias: 0,
        heightBias: 0,
    };
}

function normalizeChaseCameraSettings(settings = null) {
    const source = settings && typeof settings === 'object' ? settings : {};
    return {
        distanceBias: clampChaseCameraSettingValue(source.distanceBias, 0),
        heightBias: clampChaseCameraSettingValue(source.heightBias, 0),
    };
}

function clampChaseCameraSettingValue(value, fallback = 0) {
    const numeric = Number.isFinite(value) ? Number(value) : Number(fallback) || 0;
    return THREE.MathUtils.clamp(numeric, -1, 1);
}
