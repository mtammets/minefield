import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import {
    sceneBackgroundColor,
    sceneFog,
    renderSettings,
    worldBounds,
    cityMapLayout,
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
    applyNetworkVehicleCollisionImpulse,
    setVehicleDamageState,
    keys,
} from './carphysics.js';
import { addStars } from './stars.js';
import { createCollectibleSystem } from './collectibles.js';
import { createBotTrafficSystem } from './bots.js';
import { createReplayController } from './replay.js';
import {
    MAX_PHYSICS_STEPS_PER_FRAME,
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
import { createMineSystemController } from './mine-system.js';
import { createMapUiController } from './map-ui.js';
import {
    INPUT_CONTEXTS,
    WORLD_MAP_DRIVE_LOCK_MODES,
    resolveGameplayInputContext,
    resolveWorldMapDriveLockMode,
} from './input-context.js';

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
let mapUiController = null;

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
        replayController.recordEvent(REPLAY_EVENT_PICKUP, {
            x: position.x,
            y: position.y,
            z: position.z,
            colorHex: pickupColorHex,
            wrong: false,
        });

        if (collectorId === 'player') {
            const onlineAuthoritativeRoundActive =
                runtimeState.gameMode === 'online' &&
                runtimeState.multiplayerController?.isInRoom?.();
            if (onlineAuthoritativeRoundActive) {
                runtimeState.multiplayerController?.reportPickupCollected?.(
                    {
                        x: position.x,
                        y: position.y,
                        z: position.z,
                        pickupColorHex,
                    },
                    (response) => {
                        if (!response?.ok) {
                            return;
                        }
                        runtimeState.gameSessionController.addBattery(BATTERY_PICKUP_GAIN);
                        objectiveUi.flashCorrect(
                            pickupColorHex,
                            Math.round(runtimeState.playerBattery)
                        );
                    }
                );
                return;
            }

            runtimeState.playerCollectedCount += 1;
            runtimeState.totalCollectedCount += 1;
            runtimeState.gameSessionController.addBattery(BATTERY_PICKUP_GAIN);
            objectiveUi.flashCorrect(pickupColorHex, Math.round(runtimeState.playerBattery));
            return;
        }
        if (runtimeState.gameMode === 'bots') {
            runtimeState.totalCollectedCount += 1;
            runtimeState.botTrafficSystem?.registerCollected(collectorId);
        }
    },
    onExhausted: ({ totalPickups, collectedPickups }) => {
        if (
            runtimeState.gameMode === 'online' &&
            runtimeState.multiplayerController?.isInRoom?.()
        ) {
            return;
        }
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
    staticObstacles,
});
runtimeState.botTrafficSystem = createBotTrafficSystem(scene, worldBounds, staticObstacles, {
    botCount: 3,
    sharedTargetColorHex: SHARED_PICKUP_COLOR_HEX,
    getGroundHeightAt,
    cityMapLayout,
});
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
runtimeState.mineController = createMineSystemController({
    scene,
    car,
    getGroundHeightAt,
    getVehicleState,
    getOtherVehicleTargets: () => {
        if (runtimeState.gameMode !== 'bots') {
            return [];
        }
        const descriptors = runtimeState.botTrafficSystem?.getCollectorDescriptors?.() || [];
        return descriptors.map((entry) => ({
            id: entry.id,
            ownerId: entry.id,
            type: 'bot',
            label: entry.id,
            position: entry.position,
        }));
    },
    getLocalPlayerId: () =>
        runtimeState.gameMode === 'bots'
            ? 'local-player'
            : runtimeState.multiplayerController?.getSelfId?.() || '',
    getLocalPlayerName: () =>
        runtimeState.gameMode === 'bots'
            ? 'You'
            : runtimeState.multiplayerController?.getLocalPlayerName?.() || 'Driver',
    canUseMines: () =>
        (runtimeState.gameMode === 'bots' ||
            (runtimeState.gameMode === 'online' &&
                runtimeState.multiplayerController?.isInRoom?.())) &&
        !runtimeState.isCarDestroyed &&
        !runtimeState.pickupRoundFinished,
    emitMinePlaced(snapshot) {
        runtimeState.multiplayerController?.reportMinePlaced?.(snapshot);
    },
    emitMineDetonated(snapshot) {
        runtimeState.multiplayerController?.reportMineDetonated?.(snapshot);
    },
    onLocalMineHit({ position, ownerName }) {
        if (runtimeState.isCarDestroyed || runtimeState.pickupRoundFinished) {
            return;
        }
        const ownerLabel = ownerName ? `${ownerName}'s` : "an opponent's";
        const vehicleState = getVehicleState();
        const impactNormal = new THREE.Vector3().subVectors(car.position, position).setY(0);
        if (impactNormal.lengthSq() < 0.0001) {
            impactNormal.set(-Math.sin(car.rotation.y), 0, -Math.cos(car.rotation.y));
        }
        impactNormal.normalize();
        runtimeState.gameSessionController?.triggerCarExplosion(position, 0xff8d66, 0xff4f4f, {
            statusText: `You hit ${ownerLabel} landmine.`,
            collision: {
                obstacleCategory: 'landmine',
                impactSpeed: Math.max(32, Math.min(84, Math.abs(vehicleState?.speed || 0) + 16)),
                impactNormal,
            },
        });
    },
    onOtherVehicleMineHit({ target }) {
        if (target?.type !== 'bot' || runtimeState.gameMode !== 'bots') {
            return;
        }
        const destroyed = runtimeState.botTrafficSystem?.triggerMineHit?.(target.id);
        if (destroyed) {
            objectiveUi.showInfo(`Mine hit ${target.label || target.id}.`, 1400);
        }
    },
});
runtimeState.multiplayerController = createMultiplayerController({
    scene,
    car,
    getVehicleState,
    getInputState: () => keys,
    getCrashReplicationState: () => runtimeState.crashDebrisController?.getReplicationState?.(),
    getGroundHeightAt,
    applyNetworkCollisionImpulse: applyNetworkVehicleCollisionImpulse,
    getSelectedCarColorHex: () => runtimeState.selectedCarColorHex,
    getPlayerCollectedCount: () => runtimeState.playerCollectedCount,
    getIsCarDestroyed: () => runtimeState.isCarDestroyed,
    objectiveUi,
    onMineSnapshot(mineSnapshots) {
        runtimeState.mineController?.applyRoomMineSnapshot?.(mineSnapshots);
    },
    onMinePlaced(snapshot) {
        runtimeState.mineController?.handleRemoteMinePlaced?.(snapshot);
    },
    onMineDetonated(snapshot) {
        runtimeState.mineController?.handleRemoteMineDetonated?.(snapshot);
    },
    onAuthoritativeRoundState(authoritativeState) {
        if (!authoritativeState?.inRoom) {
            if (runtimeState.gameMode === 'online') {
                runtimeState.playerCollectedCount = 0;
                runtimeState.totalCollectedCount = 0;
            }
            return;
        }

        runtimeState.playerCollectedCount = Math.max(
            0,
            Math.round(Number(authoritativeState.playerCollectedCount) || 0)
        );
        runtimeState.totalCollectedCount = Math.max(
            0,
            Math.round(Number(authoritativeState.totalCollectedCount) || 0)
        );

        const roundState = authoritativeState.roundState;
        if (
            runtimeState.gameMode === 'online' &&
            roundState?.finished &&
            Number.isFinite(roundState.totalPickups)
        ) {
            runtimeState.gameSessionController?.finalizePickupRound(
                roundState.totalPickups,
                roundState.totalCollected,
                {
                    scoreboardEntries: Array.isArray(authoritativeState.scoreboard)
                        ? authoritativeState.scoreboard
                        : [],
                }
            );
        }
    },
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
    mineController: runtimeState.mineController,
    replayEffectsController: runtimeState.replayEffectsController,
    setPhysicsAccumulator(value) {
        runtimeState.physicsAccumulator = value;
    },
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
    getGameMode: () => runtimeState.gameMode,
    setGameMode(mode) {
        runtimeState.gameMode = mode === 'online' ? 'online' : 'bots';
    },
    setMultiplayerPanelVisible(visible) {
        runtimeState.multiplayerController?.setPanelVisible?.(visible);
    },
    startOnlineRoomFlow(startContext) {
        runtimeState.multiplayerController?.startOnlineRoomFlow?.(startContext);
    },
});

function syncRuntimeInputContext() {
    runtimeState.inputContext = resolveGameplayInputContext({
        welcomeVisible: runtimeState.isWelcomeModalVisible,
        mapOpen: runtimeState.isWorldMapOpen,
        paused: runtimeState.isGamePaused,
        editModeActive: carEditModeController.isActive(),
        raceIntroDriveLocked:
            raceIntroController.isActive() && !raceIntroController.isDrivingUnlocked(),
        replayPlaybackActive: replayController.isPlaybackActive(),
    });
    return runtimeState.inputContext;
}

function resolveCurrentWorldMapDriveLockMode() {
    return resolveWorldMapDriveLockMode({
        gameMode: runtimeState.gameMode,
        inOnlineRoom: Boolean(runtimeState.multiplayerController?.isInRoom?.()),
    });
}

function applyWorldMapVisibilityPolicy(expanded) {
    const nextOpen = Boolean(expanded);
    if (runtimeState.isWorldMapOpen === nextOpen) {
        syncRuntimeInputContext();
        return;
    }

    runtimeState.isWorldMapOpen = nextOpen;

    if (nextOpen) {
        runtimeState.worldMapDriveLockMode = resolveCurrentWorldMapDriveLockMode();
        runtimeState.gameSessionController?.clearDriveKeys();

        if (runtimeState.worldMapDriveLockMode === WORLD_MAP_DRIVE_LOCK_MODES.pause) {
            const wasPausedBeforeOpen = runtimeState.isGamePaused;
            runtimeState.gameSessionController?.setPauseState(true, {
                showPauseMenu: false,
            });
            runtimeState.isWorldMapPauseOwned = !wasPausedBeforeOpen && runtimeState.isGamePaused;
        } else {
            runtimeState.isWorldMapPauseOwned = false;
        }
    } else {
        runtimeState.worldMapDriveLockMode = WORLD_MAP_DRIVE_LOCK_MODES.none;
        runtimeState.gameSessionController?.clearDriveKeys();
        if (runtimeState.isWorldMapPauseOwned) {
            runtimeState.gameSessionController?.setPauseState(false);
        }
        runtimeState.isWorldMapPauseOwned = false;
    }

    syncRuntimeInputContext();
}

function toggleWorldMapWithPolicy(forceOpen) {
    const result = mapUiController?.toggleExpanded(forceOpen);
    if (!result || typeof result !== 'object') {
        return {
            open: false,
            message: 'Map UI unavailable.',
            driveLockMode: WORLD_MAP_DRIVE_LOCK_MODES.none,
        };
    }

    if (result.open) {
        const modeMessage =
            runtimeState.worldMapDriveLockMode === WORLD_MAP_DRIVE_LOCK_MODES.autobrake
                ? 'Autobrake engaged.'
                : 'Time paused.';
        return {
            ...result,
            driveLockMode: runtimeState.worldMapDriveLockMode,
            message: result.message ? `${result.message} ${modeMessage}` : modeMessage,
        };
    }

    return {
        ...result,
        driveLockMode: runtimeState.worldMapDriveLockMode,
    };
}

mapUiController = createMapUiController({
    worldBounds,
    cityMapLayout,
    staticObstacles,
    chargingZones,
    onStatus(messageText, timeoutMs = 1800) {
        objectiveUi.showInfo(messageText, timeoutMs);
    },
    onExpandedChanged(expanded) {
        applyWorldMapVisibilityPolicy(expanded);
    },
});
syncRuntimeInputContext();

runtimeState.inputController = createInputController({
    renderer,
    camera,
    car,
    keys,
    renderSettings,
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
    onDismissWelcomeModal(mode, startContext = null) {
        runtimeState.gameSessionController?.dismissWelcomeModal(mode, startContext);
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
    onDeployMine(mode) {
        return runtimeState.mineController?.deployMine?.(mode);
    },
    toggleWorldMap(forceOpen) {
        return toggleWorldMapWithPolicy(forceOpen);
    },
    isWorldMapVisible() {
        return mapUiController.isExpanded();
    },
    getInputContext() {
        return syncRuntimeInputContext() || INPUT_CONTEXTS.gameplay;
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
    welcomeModalUi,
    starsController,
    objectiveUi,
    botStatusUi,
    collectibleSystem,
    replayController,
    multiplayerController: runtimeState.multiplayerController,
    mineSystemController: runtimeState.mineController,
    getMultiplayerCollisionSnapshots() {
        return runtimeState.multiplayerController?.getCollisionSnapshots?.() || [];
    },
    crashDebrisController: runtimeState.crashDebrisController,
    replayEffectsController: runtimeState.replayEffectsController,
    mapUiController,
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
    roundTotalPickups: ROUND_TOTAL_PICKUPS,
    chargingBatteryGainPerSec: CHARGING_BATTERY_GAIN_PER_SEC,
    getPhysicsAccumulator: () => runtimeState.physicsAccumulator,
    setPhysicsAccumulator(value) {
        runtimeState.physicsAccumulator = value;
    },
    getIsGamePaused: () => runtimeState.isGamePaused,
    getIsCarDestroyed: () => runtimeState.isCarDestroyed,
    getIsBatteryDepleted: () => runtimeState.isBatteryDepleted,
    getPickupRoundFinished: () => runtimeState.pickupRoundFinished,
    getTotalCollectedCount: () => runtimeState.totalCollectedCount,
    getBotsEnabled: () => runtimeState.gameMode !== 'online',
    getGameMode: () => runtimeState.gameMode,
    getIsWelcomeModalVisible: () => runtimeState.isWelcomeModalVisible,
    getLocalPlayerId: () => runtimeState.multiplayerController?.getSelfId?.() || '',
    getWorldMapDriveLockMode: () => runtimeState.worldMapDriveLockMode,
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
