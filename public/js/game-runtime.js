import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import {
    sceneBackgroundColor,
    sceneFog,
    renderSettings,
    worldBounds,
    staticObstacles,
    ambientLight,
    skyLight,
    sunLight,
    ground,
    cityScenery,
    worldBoundary,
    getGroundHeightAt,
    updateGroundMotion,
    chargingZones,
} from './environment.js';
import {
    car,
    updateCarVisuals,
    setPlayerBatteryLevel,
    setPlayerBatteryDepleted,
    getPlayerCarCrashParts,
    adjustPlayerSuspensionHeight,
    adjustPlayerSuspensionStiffness,
    getPlayerSuspensionTune,
    cyclePlayerRoofMenu,
    setPlayerRoofMenuMode,
    setPlayerRoofMenuModeFromUv,
    getPlayerRoofMenuMode,
    setPlayerCarBodyColor,
    getPlayerCarEditableParts,
    setPlayerCarPartVisibility,
    setAllPlayerCarPartsVisibility,
    capturePlayerCarPartVisibility,
    restorePlayerCarPartVisibility,
} from './car.js';
import {
    camera,
    updateCamera,
    setCameraKeyboardControlsEnabled,
    resetCameraTrackingState,
} from './camera.js';
import { createCarEditModeController } from './editmode.js';
import {
    updatePlayerPhysics,
    applyInterpolatedPlayerTransform,
    initializePlayerPhysics,
    getVehicleState,
    adjustPlayerTopSpeedLimit,
    getPlayerTopSpeedLimit,
    getPlayerTopSpeedLimitBounds,
    setPlayerTopSpeedLimitKph,
    consumeCrashCollision,
    consumeVehicleCollisionContacts,
    setVehicleDamageState,
    keys,
} from './carphysics.js';
import { addStars } from './stars.js';
import { createCollectibleSystem } from './collectibles.js';
import { createMiniMapController } from './minimap.js';
import { createBotTrafficSystem } from './bots.js';
import { createReplayController } from './replay.js';
import {
    MAX_PHYSICS_STEPS_PER_FRAME,
    MINIMAP_UPDATE_INTERVAL,
    PLAYER_RIDE_HEIGHT,
    OBSTACLE_CRASH_MAX_SPEED,
    STATUS_DEFAULT_TEXT,
    ROOF_MENU_MODE_LABELS,
    SHARED_PICKUP_COLOR_INDEX,
    SHARED_PICKUP_COLOR_HEX,
    BATTERY_MAX,
    BATTERY_PICKUP_GAIN,
    CHARGING_ZONE_ACTIVATION_DELAY_SEC,
    CHARGING_BATTERY_GAIN_PER_SEC,
    ROUND_TOTAL_PICKUPS,
    PLAYER_CAR_POOL_SIZE,
    REPLAY_EVENT_PICKUP,
    REPLAY_EVENT_CRASH,
    RACE_INTRO_DURATION_SEC,
} from './constants.js';
import { toCssHex, colorNameFromHex } from './color-utils.js';
import {
    readPersistedPlayerTopSpeedKph,
    persistPlayerTopSpeedKph,
    resolvePlayerCarColorHex,
    getCarColorPresetIndex,
    readPersistedPlayerCarColorHex,
    persistPlayerCarColorHex,
} from './player-persistence.js';
import { createRaceIntroController } from './race-intro.js';
import {
    createChargingProgressHudController,
    createChargingZoneController,
} from './charging-system.js';
import { createSkidMarkController } from './skidmarks.js';
import { createCrashDebrisController } from './crash-debris-system.js';
import { createReplayEffectsController } from './replay-effects-system.js';
import { createGameSessionController } from './game-session-flow.js';
import { createInputController } from './input-controller.js';
import { createGameLoopController } from './game-loop-controller.js';
import { createGameRuntimeState } from './game-runtime-state.js';
import { initializeScene, initializeRenderer } from './game-bootstrap.js';
import { createRuntimeUiControllers } from './game-runtime-ui.js';
import { createMultiplayerController } from './multiplayer-controller.js';

const clock = new THREE.Clock();
const physicsStep = 1 / 120;
const crashParts = getPlayerCarCrashParts();
const selectedCarColorHex = resolvePlayerCarColorHex(readPersistedPlayerCarColorHex());
const runtimeState = createGameRuntimeState({
    selectedCarColorHex,
    batteryMax: BATTERY_MAX,
    playerCarPoolSize: PLAYER_CAR_POOL_SIZE,
});

setPlayerCarBodyColor(runtimeState.selectedCarColorHex);
setPlayerTopSpeedLimitKph(
    readPersistedPlayerTopSpeedKph({
        getPlayerTopSpeedLimit,
        getPlayerTopSpeedLimitBounds,
    })
);

const { objectiveUi, botStatusUi, finalScoreboardUi, pauseMenuUi, welcomeModalUi } =
    createRuntimeUiControllers({
        toCssHex,
        colorNameFromHex,
        statusDefaultText: STATUS_DEFAULT_TEXT,
        resolvePlayerCarColorHex,
        getCarColorPresetIndex,
        getIsCarDestroyed: () => runtimeState.isCarDestroyed,
        getSelectedCarColorHex: () => runtimeState.selectedCarColorHex,
        getGameSessionController: () => runtimeState.gameSessionController,
        getInputController: () => runtimeState.inputController,
    });

car.position.y = getGroundHeightAt(car.position.x, car.position.z) + PLAYER_RIDE_HEIGHT;
const playerSpawnState = {
    position: car.position.clone(),
    rotationY: car.rotation.y,
};

const scene = initializeScene({
    sceneBackgroundColor,
    sceneFog,
    ambientLight,
    skyLight,
    sunLight,
    car,
    ground,
    cityScenery,
    worldBoundary,
});
const renderer = initializeRenderer({ renderSettings });

const chargingZoneController = createChargingZoneController(scene, chargingZones, {
    activationDelaySec: CHARGING_ZONE_ACTIVATION_DELAY_SEC,
    sampleGroundHeight: getGroundHeightAt,
});
const chargingProgressHudController = createChargingProgressHudController(scene, camera, {
    vehicle: car,
    getBatteryPercent() {
        return runtimeState.playerBattery;
    },
    getBatteryNormalized() {
        return runtimeState.playerBattery / BATTERY_MAX;
    },
});
const skidMarkController = createSkidMarkController(scene, {
    sampleGroundHeight: getGroundHeightAt,
    keys,
});
const carEditModeController = createCarEditModeController({
    camera,
    car,
    canvas: renderer.domElement,
    getEditableParts: getPlayerCarEditableParts,
    setEditablePartVisibility: setPlayerCarPartVisibility,
    setAllEditablePartsVisibility: setAllPlayerCarPartsVisibility,
    captureEditablePartVisibility: capturePlayerCarPartVisibility,
    restoreEditablePartVisibility: restorePlayerCarPartVisibility,
    onEditModeChanged(isActive) {
        setCameraKeyboardControlsEnabled(!isActive);
        runtimeState.gameSessionController?.clearDriveKeys();
        if (isActive) {
            runtimeState.gameSessionController?.setPauseState(false);
        }
    },
    onStatus(messageText) {
        objectiveUi.showInfo(messageText, 1800);
    },
});
const raceIntroController = createRaceIntroController({
    camera,
    vehicle: car,
    durationSec: RACE_INTRO_DURATION_SEC,
});
const starsController = addStars(scene);
const collectibleSystem = createCollectibleSystem(scene, worldBounds, {
    onTargetColorChanged: ({ targetColorHex }) => {
        objectiveUi.setTargetColor(targetColorHex);
        runtimeState.botTrafficSystem?.setSharedTargetColor(targetColorHex);
    },
    onCorrectPickup: ({ pickupColorHex, collectorId, position }) => {
        runtimeState.totalCollectedCount += 1;
        replayController.recordEvent(REPLAY_EVENT_PICKUP, {
            x: position.x,
            y: position.y,
            z: position.z,
            colorHex: pickupColorHex,
            wrong: false,
        });

        if (collectorId === 'player') {
            runtimeState.playerCollectedCount += 1;
            runtimeState.gameSessionController.addBattery(BATTERY_PICKUP_GAIN);
            objectiveUi.flashCorrect(pickupColorHex, Math.round(runtimeState.playerBattery));
            return;
        }
        runtimeState.botTrafficSystem?.registerCollected(collectorId);
    },
    onWrongPickup: ({ pickupColorHex, targetColorHex, position, collectorId }) => {
        if (collectorId !== 'player') {
            return;
        }
        replayController.recordEvent(REPLAY_EVENT_PICKUP, {
            x: position.x,
            y: position.y,
            z: position.z,
            colorHex: pickupColorHex,
            wrong: true,
        });
        runtimeState.gameSessionController.triggerCarExplosion(
            position,
            pickupColorHex,
            targetColorHex
        );
    },
    onExhausted: ({ totalPickups, collectedPickups }) => {
        runtimeState.gameSessionController.finalizePickupRound(totalPickups, collectedPickups);
    },
    singleType: true,
    singleShapeIndex: SHARED_PICKUP_COLOR_INDEX,
    finiteTotalPickups: ROUND_TOTAL_PICKUPS,
    activeCellRadius: 5,
    maxActivePickups: 6,
    pickupLifetimeSec: 7,
    pickupLifetimeJitterSec: 2,
    pickupRespawnDelaySec: 1.2,
    pickupRespawnJitterSec: 1.4,
    pickupBlinkWindowSec: 2,
    getGroundHeightAt,
});
runtimeState.botTrafficSystem = createBotTrafficSystem(scene, worldBounds, staticObstacles, {
    botCount: 3,
    sharedTargetColorHex: SHARED_PICKUP_COLOR_HEX,
    getGroundHeightAt,
});
const miniMapController = createMiniMapController(worldBounds);
const replayController = createReplayController(car, camera);
runtimeState.crashDebrisController = createCrashDebrisController({
    scene,
    car,
    crashParts,
    getGroundHeightAt,
    getVehicleState,
    setVehicleDamageState,
    objectiveUi,
    getBotTrafficSystem: () => runtimeState.botTrafficSystem,
    isCarDestroyed: () => runtimeState.isCarDestroyed,
});
runtimeState.crashDebrisController.initializeBodyPartBaselines();
runtimeState.replayEffectsController = createReplayEffectsController({
    scene,
    car,
    spawnCarDebris: (...args) => runtimeState.crashDebrisController.spawnCarDebris(...args),
    replayEventPickup: REPLAY_EVENT_PICKUP,
    replayEventCrash: REPLAY_EVENT_CRASH,
    obstacleCrashMaxSpeed: OBSTACLE_CRASH_MAX_SPEED,
});
runtimeState.multiplayerController = createMultiplayerController({
    scene,
    car,
    getVehicleState,
    getInputState: () => keys,
    getCrashReplicationState: () => runtimeState.crashDebrisController?.getReplicationState?.(),
    getGroundHeightAt,
    getSelectedCarColorHex: () => runtimeState.selectedCarColorHex,
    getPlayerCollectedCount: () => runtimeState.playerCollectedCount,
    getIsCarDestroyed: () => runtimeState.isCarDestroyed,
    objectiveUi,
});

runtimeState.gameSessionController = createGameSessionController({
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
    getBotTrafficSystem: () => runtimeState.botTrafficSystem,
    crashDebrisController: runtimeState.crashDebrisController,
    replayEffectsController: runtimeState.replayEffectsController,
    setPhysicsAccumulator(value) {
        runtimeState.physicsAccumulator = value;
    },
    setMinimapAccumulator(value) {
        runtimeState.minimapAccumulator = value;
    },
    minimapUpdateInterval: MINIMAP_UPDATE_INTERVAL,
    replayEventCrash: REPLAY_EVENT_CRASH,
    colorNameFromHex,
    getIsCarDestroyed: () => runtimeState.isCarDestroyed,
    setIsCarDestroyed(value) {
        runtimeState.isCarDestroyed = Boolean(value);
    },
    getIsBatteryDepleted: () => runtimeState.isBatteryDepleted,
    setIsBatteryDepleted(value) {
        runtimeState.isBatteryDepleted = Boolean(value);
    },
    getPlayerBattery: () => runtimeState.playerBattery,
    setPlayerBattery(value) {
        runtimeState.playerBattery = Number.isFinite(value) ? value : runtimeState.playerBattery;
    },
    getPlayerCollectedCount: () => runtimeState.playerCollectedCount,
    setPlayerCollectedCount(value) {
        runtimeState.playerCollectedCount = Number.isFinite(value)
            ? value
            : runtimeState.playerCollectedCount;
    },
    getTotalCollectedCount: () => runtimeState.totalCollectedCount,
    setTotalCollectedCount(value) {
        runtimeState.totalCollectedCount = Number.isFinite(value)
            ? value
            : runtimeState.totalCollectedCount;
    },
    getPlayerCarsRemaining: () => runtimeState.playerCarsRemaining,
    setPlayerCarsRemaining(value) {
        runtimeState.playerCarsRemaining = Number.isFinite(value)
            ? value
            : runtimeState.playerCarsRemaining;
    },
    getPendingRespawnTimeout: () => runtimeState.pendingRespawnTimeout,
    setPendingRespawnTimeout(value) {
        runtimeState.pendingRespawnTimeout = value ?? null;
    },
    getPickupRoundFinished: () => runtimeState.pickupRoundFinished,
    setPickupRoundFinished(value) {
        runtimeState.pickupRoundFinished = Boolean(value);
    },
    getIsGamePaused: () => runtimeState.isGamePaused,
    setIsGamePaused(value) {
        runtimeState.isGamePaused = Boolean(value);
    },
    getIsWelcomeModalVisible: () => runtimeState.isWelcomeModalVisible,
    setIsWelcomeModalVisible(value) {
        runtimeState.isWelcomeModalVisible = Boolean(value);
    },
    getSelectedCarColorHex: () => runtimeState.selectedCarColorHex,
    setSelectedCarColorHex(value) {
        runtimeState.selectedCarColorHex = value >>> 0;
    },
});

runtimeState.inputController = createInputController({
    renderer,
    camera,
    car,
    keys,
    renderSettings,
    miniMapController,
    welcomeModalUi,
    finalScoreboardUi,
    carEditModeController,
    raceIntroController,
    replayController,
    getVehicleState,
    initializePlayerPhysics,
    setPhysicsAccumulator(value) {
        runtimeState.physicsAccumulator = value;
    },
    getIsWelcomeModalVisible: () => runtimeState.isWelcomeModalVisible,
    getIsGamePaused: () => runtimeState.isGamePaused,
    getIsCarDestroyed: () => runtimeState.isCarDestroyed,
    getPlayerCarsRemaining: () => runtimeState.playerCarsRemaining,
    onSetPauseState(nextPaused) {
        runtimeState.gameSessionController?.setPauseState(nextPaused);
    },
    onDismissWelcomeModal() {
        runtimeState.gameSessionController?.dismissWelcomeModal();
    },
    onRestartGameWithCountdown() {
        runtimeState.gameSessionController?.restartGameWithCountdown();
    },
    onClearPendingRespawn() {
        runtimeState.gameSessionController?.clearPendingRespawn();
    },
    onClearReplayEffects() {
        runtimeState.replayEffectsController?.clearReplayEffects();
    },
    onClearDebris() {
        runtimeState.crashDebrisController?.clearDebris();
    },
    onResetPlayerDamageState() {
        runtimeState.crashDebrisController?.resetPlayerDamageState();
    },
    onResetRunStateForReplay() {
        runtimeState.gameSessionController?.resetRunStateForReplay();
    },
    onClearDriveKeys() {
        runtimeState.gameSessionController?.clearDriveKeys();
    },
    onShowObjectiveInfo(messageText, timeoutMs = 2000) {
        objectiveUi.showInfo(messageText, timeoutMs);
    },
    onStartNewGame() {
        runtimeState.gameSessionController?.startNewGame();
    },
    onShowWelcomeModal() {
        runtimeState.gameSessionController?.showWelcomeModal();
    },
    cyclePlayerRoofMenu,
    setPlayerRoofMenuMode,
    setPlayerRoofMenuModeFromUv,
    getPlayerRoofMenuMode,
    roofMenuModeLabels: ROOF_MENU_MODE_LABELS,
    adjustPlayerSuspensionHeight,
    adjustPlayerSuspensionStiffness,
    getPlayerSuspensionTune,
    adjustPlayerTopSpeedLimit,
    getPlayerTopSpeedLimit,
    persistPlayerTopSpeedKph(speedKph) {
        persistPlayerTopSpeedKph(speedKph, {
            getPlayerTopSpeedLimit,
            getPlayerTopSpeedLimitBounds,
        });
    },
});

runtimeState.gameLoopController = createGameLoopController({
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
    multiplayerController: runtimeState.multiplayerController,
    getMultiplayerMiniMapMarkers() {
        return runtimeState.multiplayerController?.getMiniMapMarkers?.() || [];
    },
    crashDebrisController: runtimeState.crashDebrisController,
    replayEffectsController: runtimeState.replayEffectsController,
    gameSessionController: runtimeState.gameSessionController,
    getBotTrafficSystem: () => runtimeState.botTrafficSystem,
    getVehicleState,
    getPlayerTopSpeedLimit,
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
    physicsStep,
    maxPhysicsStepsPerFrame: MAX_PHYSICS_STEPS_PER_FRAME,
    minimapUpdateInterval: MINIMAP_UPDATE_INTERVAL,
    roundTotalPickups: ROUND_TOTAL_PICKUPS,
    chargingBatteryGainPerSec: CHARGING_BATTERY_GAIN_PER_SEC,
    getPhysicsAccumulator: () => runtimeState.physicsAccumulator,
    setPhysicsAccumulator(value) {
        runtimeState.physicsAccumulator = value;
    },
    getMinimapAccumulator: () => runtimeState.minimapAccumulator,
    setMinimapAccumulator(value) {
        runtimeState.minimapAccumulator = value;
    },
    getIsGamePaused: () => runtimeState.isGamePaused,
    getIsCarDestroyed: () => runtimeState.isCarDestroyed,
    getIsBatteryDepleted: () => runtimeState.isBatteryDepleted,
    getPickupRoundFinished: () => runtimeState.pickupRoundFinished,
    getTotalCollectedCount: () => runtimeState.totalCollectedCount,
});

botStatusUi.render(runtimeState.botTrafficSystem.getHudState());
initializePlayerPhysics(car);
runtimeState.crashDebrisController.resetPlayerDamageState();
setPlayerBatteryLevel(1);
runtimeState.gameSessionController.setBatteryDepletedState(false, { showStatus: false });
if (welcomeModalUi.isAvailable()) {
    runtimeState.gameSessionController.showWelcomeModal();
}

runtimeState.multiplayerController.initialize();
runtimeState.inputController.initialize();
runtimeState.gameLoopController.start();
