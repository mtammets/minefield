import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import {
    sceneBackgroundColor,
    sceneFog,
    renderSettings,
    worldBounds,
    cityMapLayout,
    playerSpawnPoint,
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
    getCrashDamageTuning,
    setCrashDamageTuning,
    resetCrashDamageTuning,
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
    readPersistedGraphicsQualityMode,
    persistGraphicsQualityMode,
    resolvePlayerCarColorHex,
    getCarColorPresetIndex,
    readPersistedPlayerCarColorHex,
    persistPlayerCarColorHex,
} from './player-persistence.js';
import { readPersistedCrashDamageTuning, persistCrashDamageTuning } from './crash-damage-tuning.js';
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
import { createAudioSystem } from './audio-system.js';
import { createPickupScoringSystem } from './scoring-system.js';
import { createScorePopupController } from './score-popup-ui.js';
import {
    createGraphicsQualityController,
    GRAPHICS_QUALITY_MODES,
} from './graphics-quality-controller.js';
import {
    INPUT_CONTEXTS,
    WORLD_MAP_DRIVE_LOCK_MODES,
    resolveGameplayInputContext,
    resolveWorldMapDriveLockMode,
} from './input-context.js';

const clock = new THREE.Clock();
const physicsStep = 1 / 120;
const GRAPHICS_PRESET_MODE_ORDER = [
    GRAPHICS_QUALITY_MODES.performance,
    GRAPHICS_QUALITY_MODES.balanced,
    GRAPHICS_QUALITY_MODES.quality,
    GRAPHICS_QUALITY_MODES.auto,
];
const EMPTY_ARRAY = Object.freeze([]);
const BOT_MINE_DEBRIS_BUDGET_NEAR = 6;
const BOT_MINE_DEBRIS_BUDGET_MID = 2;
const BOT_MINE_DEBRIS_BUDGET_FAR = 0;
const BOT_MINE_DEBRIS_NEAR_DISTANCE = 52;
const BOT_MINE_DEBRIS_MID_DISTANCE = 84;
const BOT_MINE_DEBRIS_NEAR_DISTANCE_SQ = BOT_MINE_DEBRIS_NEAR_DISTANCE * BOT_MINE_DEBRIS_NEAR_DISTANCE;
const BOT_MINE_DEBRIS_MID_DISTANCE_SQ = BOT_MINE_DEBRIS_MID_DISTANCE * BOT_MINE_DEBRIS_MID_DISTANCE;
const crashParts = getPlayerCarCrashParts();
const selectedCarColorHex = resolvePlayerCarColorHex(readPersistedPlayerCarColorHex());
const persistedGraphicsQualityMode = readPersistedGraphicsQualityMode(GRAPHICS_QUALITY_MODES.balanced);
const initialGraphicsQualityMode = GRAPHICS_PRESET_MODE_ORDER.includes(persistedGraphicsQualityMode)
    ? persistedGraphicsQualityMode
    : GRAPHICS_QUALITY_MODES.balanced;
const runtimeState = createGameRuntimeState({
    selectedCarColorHex,
    batteryMax: BATTERY_MAX,
    playerCarPoolSize: PLAYER_CAR_POOL_SIZE,
});
let runtimeGraphicsWarmupReady = false;
runtimeState.scoringSystem = createPickupScoringSystem();
runtimeState.scorePopupController = createScorePopupController();

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
        onPrepareStart: prepareRuntimeForSessionStart,
    });

async function prepareRuntimeForSessionStart(mode = 'bots', startContext = null, options = null) {
    const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
    const reportProgress = (payload = null) => {
        if (!onProgress || !payload || typeof payload !== 'object') {
            return;
        }
        try {
            onProgress(payload);
        } catch {
            // External progress handlers must not interrupt startup.
        }
    };
    const reportAudioProgress = (preloadState = null) => {
        const snapshot =
            preloadState && typeof preloadState === 'object'
                ? preloadState
                : runtimeState.audioController?.getPreloadState?.() || null;
        if (!snapshot || typeof snapshot !== 'object') {
            return;
        }

        const filesTotal = Math.max(0, Math.round(Number(snapshot.filesTotal) || 0));
        const filesReady = Math.max(0, Math.round(Number(snapshot.filesReady) || 0));
        const filesFailed = Math.max(0, Math.round(Number(snapshot.filesFailed) || 0));
        const fallbackDone = filesReady + filesFailed;
        const filesDone = Math.min(
            filesTotal,
            Math.max(0, Math.round(Number(snapshot.filesDone) || fallbackDone))
        );
        const progress = filesTotal > 0 ? filesDone / filesTotal : 1;

        reportProgress({
            stage: 'audio',
            progress: Math.min(1, Math.max(0, progress)),
            filesTotal,
            filesReady,
            filesFailed,
            filesDone,
            complete: filesDone >= filesTotal,
        });
    };

    const normalizedMode = mode === 'online' ? 'online' : 'bots';
    const canPrepareOnlineRoomFlow = Boolean(startContext && typeof startContext === 'object');
    const preparationTasks = [waitForAnimationFrames(2)];
    reportProgress({
        stage: 'prepare',
        progress: 0,
    });
    reportAudioProgress();
    preparationTasks.push(
        prepareGraphicsForSessionStart(normalizedMode, {
            reportProgress,
        })
    );

    if (typeof runtimeState.audioController?.prepareForGameplay === 'function') {
        preparationTasks.push(
            runtimeState.audioController.prepareForGameplay({
                onProgress(preloadState) {
                    reportAudioProgress(preloadState);
                },
            })
        );
    } else if (typeof runtimeState.audioController?.unlock === 'function') {
        preparationTasks.push(
            runtimeState.audioController
                .unlock({ waitForPreload: true })
                .finally(() => reportAudioProgress())
        );
    }
    if (normalizedMode === 'online' && canPrepareOnlineRoomFlow) {
        runtimeState.multiplayerController?.setPanelVisible?.(true);
        if (typeof runtimeState.multiplayerController?.prepareOnlineRoomFlow === 'function') {
            preparationTasks.push(
                runtimeState.multiplayerController.prepareOnlineRoomFlow(startContext)
            );
        }
    }
    await Promise.allSettled(preparationTasks);
    reportAudioProgress();
    reportProgress({
        stage: 'complete',
        progress: 1,
    });
}

function waitForAnimationFrames(frameCount = 1) {
    const totalFrames = Math.max(1, Math.round(Number(frameCount) || 1));
    return new Promise((resolve) => {
        let remaining = totalFrames;
        const tick = () => {
            remaining -= 1;
            if (remaining <= 0) {
                resolve();
                return;
            }
            window.requestAnimationFrame(tick);
        };
        window.requestAnimationFrame(tick);
    });
}

async function prepareGraphicsForSessionStart(mode = 'bots', options = {}) {
    const reportProgress =
        typeof options?.reportProgress === 'function' ? options.reportProgress : () => {};
    if (runtimeGraphicsWarmupReady) {
        reportProgress({
            stage: 'graphics',
            progress: 1,
            complete: true,
        });
        return true;
    }

    reportProgress({
        stage: 'graphics',
        progress: 0,
    });

    try {
        runtimeState.collectibleSystem?.prewarmEffects?.();
        skidMarkController?.prewarmParticles?.();

        const collectors = [{ id: 'player', position: car.position }];
        if (mode === 'bots') {
            collectors.push(...(runtimeState.botTrafficSystem?.getCollectorDescriptors?.() || []));
        }
        runtimeState.collectibleSystem?.primeForCollectors?.(collectors);
        reportProgress({
            stage: 'graphics',
            progress: 0.18,
        });

        await waitForAnimationFrames(1);
        const warmedCollectibleShaders = runtimeState.collectibleSystem?.warmupGraphics?.(
            renderer,
            camera
        );
        reportProgress({
            stage: 'graphics',
            progress: 0.38,
        });

        await waitForAnimationFrames(1);
        const warmedMineShaders = runtimeState.mineController?.warmupGraphics?.(renderer, camera);
        reportProgress({
            stage: 'graphics',
            progress: 0.56,
        });

        await waitForAnimationFrames(1);
        const warmedCrashShaders = runtimeState.crashDebrisController?.warmupGraphics?.(
            renderer,
            camera
        );
        reportProgress({
            stage: 'graphics',
            progress: 0.74,
        });

        await waitForAnimationFrames(1);
        const warmedSkidShaders = skidMarkController?.warmupGraphics?.(renderer, camera);
        reportProgress({
            stage: 'graphics',
            progress: 0.88,
        });

        await waitForAnimationFrames(1);
        if (typeof renderer?.compile === 'function') {
            renderer.compile(scene, camera);
        }
        await waitForAnimationFrames(1);

        const warmupResults = [
            warmedCollectibleShaders,
            warmedMineShaders,
            warmedCrashShaders,
            warmedSkidShaders,
        ];
        runtimeGraphicsWarmupReady = warmupResults.every(
            (value) => value === undefined || Boolean(value)
        );
        reportProgress({
            stage: 'graphics',
            progress: 1,
            complete: runtimeGraphicsWarmupReady,
        });
        return runtimeGraphicsWarmupReady;
    } catch {
        reportProgress({
            stage: 'graphics',
            progress: 0.9,
            complete: false,
        });
        return false;
    }
}

let mapUiController = null;

const initialSpawnX = Number.isFinite(playerSpawnPoint?.x) ? playerSpawnPoint.x : car.position.x;
const initialSpawnZ = Number.isFinite(playerSpawnPoint?.z) ? playerSpawnPoint.z : car.position.z;
const initialSpawnRotationY = Number.isFinite(playerSpawnPoint?.rotationY)
    ? playerSpawnPoint.rotationY
    : car.rotation.y;
car.position.set(
    initialSpawnX,
    getGroundHeightAt(initialSpawnX, initialSpawnZ) + PLAYER_RIDE_HEIGHT,
    initialSpawnZ
);
car.rotation.set(0, initialSpawnRotationY, 0);
const playerSpawnState = {
    position: new THREE.Vector3(initialSpawnX, car.position.y, initialSpawnZ),
    rotationY: initialSpawnRotationY,
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
runtimeState.audioController = createAudioSystem({ camera });
runtimeState.audioController.initialize();

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
const graphicsQualityController = createGraphicsQualityController({
    renderer,
    renderSettings,
    initialMode: initialGraphicsQualityMode,
    skidMarkController,
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
    getCrashDamageTuning() {
        const physicsTuning = getCrashDamageTuning();
        const debrisTuning =
            runtimeState.crashDebrisController?.getCrashDamageTuning?.() || physicsTuning;
        return {
            ...physicsTuning,
            ...debrisTuning,
        };
    },
    onSetCrashDamageTuningValue(fieldKey, value) {
        if (!fieldKey) {
            return getCrashDamageTuning();
        }
        const patch = {
            [fieldKey]: value,
        };
        const physicsTuning = setCrashDamageTuning(patch);
        const nextTuning =
            runtimeState.crashDebrisController?.setCrashDamageTuning?.(patch) || physicsTuning;
        persistCrashDamageTuning(nextTuning);
        return nextTuning;
    },
    onResetCrashDamageTuning() {
        const physicsDefaults = resetCrashDamageTuning();
        const defaults =
            runtimeState.crashDebrisController?.resetCrashDamageTuning?.() || physicsDefaults;
        persistCrashDamageTuning(defaults);
        objectiveUi.showInfo('Crash tuning reset to defaults.', 1400);
        return defaults;
    },
});
const raceIntroController = createRaceIntroController({
    camera,
    vehicle: car,
    durationSec: RACE_INTRO_DURATION_SEC,
    onStepChanged(step) {
        runtimeState.audioController?.onRaceIntroStep?.(step);
    },
    onGoTriggered() {
        runtimeState.audioController?.onRaceIntroGo?.();
    },
});
const starsController = addStars(scene);
const SHOW_ONLY_LOCAL_SCORE_POPUPS = true;
const SCORE_AUDIT_PEAK_COMBO_MIN = 1;
const SCORE_AUDIT_PEAK_CHAIN_MIN = 1;

function resolveCollectorWorldPosition(collectorId = 'player') {
    if (collectorId === 'player') {
        return car.position;
    }
    const selfOnlineId = runtimeState.multiplayerController?.getSelfId?.() || '';
    if (selfOnlineId && collectorId === selfOnlineId) {
        return car.position;
    }
    if (runtimeState.gameMode === 'bots') {
        const collectors = runtimeState.botTrafficSystem?.getCollectorDescriptors?.() || [];
        const collector = collectors.find((entry) => entry?.id === collectorId);
        return collector?.position || null;
    }
    return runtimeState.multiplayerController?.getPlayerWorldPosition?.(collectorId) || null;
}

function spawnScorePopup({
    collectorId = 'player',
    pointsAwarded = 0,
    scoring = null,
    sourceLabel = '',
} = {}) {
    const awarded = Math.max(0, Math.round(Number(pointsAwarded) || 0));
    if (awarded <= 0) {
        return;
    }
    if (SHOW_ONLY_LOCAL_SCORE_POPUPS && !isLocalCollectorId(collectorId)) {
        return;
    }
    runtimeState.scorePopupController?.spawn?.({
        collectorId,
        pointsAwarded: awarded,
        comboCount: Math.max(0, Math.round(Number(scoring?.comboCount) || 0)),
        comboMultiplier: Math.max(1, Number(scoring?.comboMultiplier) || 1),
        riskBonus: Math.max(0, Number(scoring?.riskBonus) || 0),
        endgameBonus: Math.max(0, Number(scoring?.endgameBonus) || 0),
        sourceLabel,
        resolveWorldPosition: () => resolveCollectorWorldPosition(collectorId),
        worldPosition: resolveCollectorWorldPosition(collectorId),
    });
}

function isLocalCollectorId(collectorId) {
    if (collectorId === 'player') {
        return true;
    }
    const selfOnlineId = runtimeState.multiplayerController?.getSelfId?.() || '';
    return Boolean(selfOnlineId && collectorId === selfOnlineId);
}

function buildPickupStatusContext(pointsAwarded, scoring) {
    return {
        batteryPercent: Math.round(runtimeState.playerBattery),
        pointsAwarded: Math.max(0, Math.round(Number(pointsAwarded) || 0)),
        comboCount: Math.max(0, Math.round(Number(scoring?.comboCount) || 0)),
        comboMultiplier: Math.max(1, Number(scoring?.comboMultiplier) || 1),
        riskBonus: Math.max(0, Number(scoring?.riskBonus) || 0),
        endgameBonus: Math.max(0, Number(scoring?.endgameBonus) || 0),
    };
}

function buildMinePopupScoring(scoring = null) {
    if (!scoring || typeof scoring !== 'object') {
        return null;
    }
    return {
        comboCount: Math.max(0, Math.round(Number(scoring.comboCount ?? scoring.chainCount) || 0)),
        comboMultiplier: Math.max(
            1,
            Number(scoring.comboMultiplier ?? scoring.chainMultiplier) || 1
        ),
        riskBonus: Math.max(0, Number(scoring.riskBonus) || 0),
        endgameBonus: Math.max(0, Number(scoring.endgameBonus) || 0),
    };
}

function resolveMineOwnerCollectorId(ownerId = '') {
    const normalizedOwnerId = typeof ownerId === 'string' ? ownerId.trim() : '';
    if (!normalizedOwnerId) {
        return '';
    }
    const selfOnlineId = runtimeState.multiplayerController?.getSelfId?.() || '';
    if (
        normalizedOwnerId === 'player' ||
        normalizedOwnerId === 'local-player' ||
        (selfOnlineId && normalizedOwnerId === selfOnlineId)
    ) {
        return 'player';
    }
    return normalizedOwnerId;
}

function normalizeScoreAuditCollectorId(collectorId = 'player') {
    const normalized = typeof collectorId === 'string' ? collectorId.trim() : '';
    if (!normalized) {
        return 'player';
    }
    const selfOnlineId = runtimeState.multiplayerController?.getSelfId?.() || '';
    if (
        normalized === 'player' ||
        normalized === 'local-player' ||
        (selfOnlineId && normalized === selfOnlineId)
    ) {
        return 'player';
    }
    return normalized;
}

function normalizeOptionalScoreAuditCollectorId(collectorId = '') {
    const normalized = typeof collectorId === 'string' ? collectorId.trim() : '';
    if (!normalized) {
        return '';
    }
    return normalizeScoreAuditCollectorId(normalized);
}

function ensureCollectorScoreAudit(collectorId = 'player') {
    const collectorKey = normalizeScoreAuditCollectorId(collectorId);
    if (runtimeState.scoreAuditByCollectorId.has(collectorKey)) {
        return runtimeState.scoreAuditByCollectorId.get(collectorKey);
    }
    const entry = {
        collectorId: collectorKey,
        pickupCount: 0,
        pickupPoints: 0,
        mineDeployedCount: 0,
        mineDetonatedCount: 0,
        mineHitCount: 0,
        mineHitTakenCount: 0,
        mineKillCount: 0,
        mineKillPoints: 0,
        autoCollectedCount: 0,
        autoCollectedPoints: 0,
        bestPickupCombo: 0,
        bestMineChain: 0,
        riskPickupCount: 0,
        endgamePickupCount: 0,
        endgameMineKillCount: 0,
        antiFarmMineKillCount: 0,
    };
    runtimeState.scoreAuditByCollectorId.set(collectorKey, entry);
    return entry;
}

function recordPickupScoreAudit({
    collectorId = 'player',
    pointsAwarded = 0,
    scoring = null,
} = {}) {
    const points = Math.max(0, Math.round(Number(pointsAwarded) || 0));
    if (points <= 0) {
        return;
    }
    const entry = ensureCollectorScoreAudit(collectorId);
    entry.pickupCount += 1;
    entry.pickupPoints += points;
    entry.bestPickupCombo = Math.max(
        Math.max(0, Math.round(Number(entry.bestPickupCombo) || 0)),
        Math.max(SCORE_AUDIT_PEAK_COMBO_MIN, Math.round(Number(scoring?.comboCount) || 0))
    );
    if (Number(scoring?.riskBonus) > 0.08) {
        entry.riskPickupCount += 1;
    }
    if (Number(scoring?.endgameBonus) > 0.05) {
        entry.endgamePickupCount += 1;
    }
}

function recordMineKillScoreAudit({
    collectorId = 'player',
    pointsAwarded = 0,
    scoring = null,
} = {}) {
    const points = Math.max(0, Math.round(Number(pointsAwarded) || 0));
    if (points <= 0) {
        return;
    }
    const entry = ensureCollectorScoreAudit(collectorId);
    entry.mineKillCount += 1;
    entry.mineKillPoints += points;
    entry.bestMineChain = Math.max(
        Math.max(0, Math.round(Number(entry.bestMineChain) || 0)),
        Math.max(
            SCORE_AUDIT_PEAK_CHAIN_MIN,
            Math.round(Number(scoring?.chainCount ?? scoring?.comboCount) || 0)
        )
    );
    if (Number(scoring?.endgameBonus) > 0.01) {
        entry.endgameMineKillCount += 1;
    }
    if (Number(scoring?.antiFarmMultiplier) > 0 && Number(scoring?.antiFarmMultiplier) < 0.999) {
        entry.antiFarmMineKillCount += 1;
    }
}

function recordMineDeploymentAudit({ collectorId = 'player', mineId = '' } = {}) {
    const normalizedMineId = typeof mineId === 'string' ? mineId.trim() : '';
    if (normalizedMineId && runtimeState.scoredMineDeployIds.has(normalizedMineId)) {
        return;
    }
    const resolvedCollectorId = normalizeOptionalScoreAuditCollectorId(collectorId);
    if (!resolvedCollectorId) {
        return;
    }
    if (normalizedMineId) {
        runtimeState.scoredMineDeployIds.add(normalizedMineId);
    }
    const entry = ensureCollectorScoreAudit(resolvedCollectorId);
    entry.mineDeployedCount += 1;
}

function recordMineDetonationAudit({
    mineId = '',
    ownerCollectorId = '',
    targetCollectorId = '',
} = {}) {
    const normalizedMineId = typeof mineId === 'string' ? mineId.trim() : '';
    if (!normalizedMineId || runtimeState.scoredMineDetonationIds.has(normalizedMineId)) {
        return;
    }
    runtimeState.scoredMineDetonationIds.add(normalizedMineId);

    const ownerId = normalizeOptionalScoreAuditCollectorId(ownerCollectorId);
    const targetId = normalizeOptionalScoreAuditCollectorId(targetCollectorId);
    if (ownerId) {
        const ownerEntry = ensureCollectorScoreAudit(ownerId);
        ownerEntry.mineDetonatedCount += 1;
        if (targetId && targetId !== ownerId) {
            ownerEntry.mineHitCount += 1;
        }
    }

    if (targetId) {
        const targetEntry = ensureCollectorScoreAudit(targetId);
        targetEntry.mineHitTakenCount += 1;
    }
}

function recordAutoCollectScoreAudit({
    collectorId = 'player',
    pointsAwarded = 0,
    pickupCount = 0,
} = {}) {
    const points = Math.max(0, Math.round(Number(pointsAwarded) || 0));
    const count = Math.max(0, Math.round(Number(pickupCount) || 0));
    if (points <= 0 && count <= 0) {
        return;
    }
    const entry = ensureCollectorScoreAudit(collectorId);
    entry.autoCollectedCount += count;
    entry.autoCollectedPoints += points;
}

function getCollectorScoreAuditSnapshot(collectorId = 'player') {
    const collectorKey = normalizeScoreAuditCollectorId(collectorId);
    const entry = runtimeState.scoreAuditByCollectorId.get(collectorKey);
    if (!entry) {
        return null;
    }
    return {
        collectorId: collectorKey,
        pickupCount: Math.max(0, Math.round(Number(entry.pickupCount) || 0)),
        pickupPoints: Math.max(0, Math.round(Number(entry.pickupPoints) || 0)),
        mineDeployedCount: Math.max(0, Math.round(Number(entry.mineDeployedCount) || 0)),
        mineDetonatedCount: Math.max(0, Math.round(Number(entry.mineDetonatedCount) || 0)),
        mineHitCount: Math.max(0, Math.round(Number(entry.mineHitCount) || 0)),
        mineHitTakenCount: Math.max(0, Math.round(Number(entry.mineHitTakenCount) || 0)),
        mineKillCount: Math.max(0, Math.round(Number(entry.mineKillCount) || 0)),
        mineKillPoints: Math.max(0, Math.round(Number(entry.mineKillPoints) || 0)),
        autoCollectedCount: Math.max(0, Math.round(Number(entry.autoCollectedCount) || 0)),
        autoCollectedPoints: Math.max(0, Math.round(Number(entry.autoCollectedPoints) || 0)),
        bestPickupCombo: Math.max(0, Math.round(Number(entry.bestPickupCombo) || 0)),
        bestMineChain: Math.max(0, Math.round(Number(entry.bestMineChain) || 0)),
        riskPickupCount: Math.max(0, Math.round(Number(entry.riskPickupCount) || 0)),
        endgamePickupCount: Math.max(0, Math.round(Number(entry.endgamePickupCount) || 0)),
        endgameMineKillCount: Math.max(0, Math.round(Number(entry.endgameMineKillCount) || 0)),
        antiFarmMineKillCount: Math.max(0, Math.round(Number(entry.antiFarmMineKillCount) || 0)),
    };
}

function awardLocalMineKillScore({ ownerCollectorId = '', targetCollectorId = '' } = {}) {
    const collectorId = resolveMineOwnerCollectorId(ownerCollectorId);
    if (!collectorId) {
        return null;
    }
    const targetId = typeof targetCollectorId === 'string' ? targetCollectorId.trim() : '';
    const roundProgress = THREE.MathUtils.clamp(
        runtimeState.totalCollectedCount / Math.max(1, ROUND_TOTAL_PICKUPS),
        0,
        1
    );
    const mineScoreEvent = runtimeState.scoringSystem?.awardMineKill?.({
        collectorId,
        targetId: targetId || '__target__',
        nowMs: Date.now(),
        roundProgress,
        isSelfKill: Boolean(targetId && collectorId === targetId),
    });
    runtimeState.totalScore = Math.max(
        0,
        Math.round(Number(runtimeState.scoringSystem?.getTotalScore?.() || runtimeState.totalScore))
    );
    if (collectorId === 'player' && mineScoreEvent) {
        runtimeState.playerScore = Math.max(
            0,
            Math.round(Number(mineScoreEvent.score) || runtimeState.playerScore)
        );
    }
    if (mineScoreEvent?.pointsAwarded > 0) {
        recordMineKillScoreAudit({
            collectorId,
            pointsAwarded: mineScoreEvent.pointsAwarded,
            scoring: mineScoreEvent.scoring,
        });
    }
    return mineScoreEvent;
}

function awardLocalPickupScore({ collectorId = 'player', speedKph = 0, roundProgress = 0 } = {}) {
    const scoreEvent = runtimeState.scoringSystem?.awardPickup?.({
        collectorId,
        nowMs: Date.now(),
        speedKph,
        roundProgress,
    });
    if (!scoreEvent) {
        return null;
    }
    if (collectorId === 'player') {
        runtimeState.playerScore = Math.max(0, Math.round(Number(scoreEvent.score) || 0));
    }
    runtimeState.totalScore = Math.max(
        0,
        Math.round(Number(runtimeState.scoringSystem?.getTotalScore?.() || 0))
    );
    if (scoreEvent?.pointsAwarded > 0) {
        recordPickupScoreAudit({
            collectorId,
            pointsAwarded: scoreEvent.pointsAwarded,
            scoring: scoreEvent.scoring,
        });
    }
    return scoreEvent;
}

const collectibleSystem = createCollectibleSystem(scene, worldBounds, {
    onTargetColorChanged: ({ targetColorHex }) => {
        objectiveUi.setTargetColor(targetColorHex);
        runtimeState.botTrafficSystem?.setSharedTargetColor(targetColorHex);
    },
    onCorrectPickup: ({ pickupId, pickupColorHex, collectorId, position }) => {
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
                        pickupId,
                        x: position.x,
                        y: position.y,
                        z: position.z,
                        pickupColorHex,
                    },
                    (response) => {
                        if (!response?.ok) {
                            return;
                        }
                        runtimeState.playerScore = Math.max(
                            0,
                            Math.round(Number(response.playerScore) || 0)
                        );
                        runtimeState.totalScore = Math.max(
                            0,
                            Math.round(
                                Number(
                                    Number.isFinite(response?.roundState?.totalScore)
                                        ? response.roundState.totalScore
                                        : runtimeState.totalScore
                                ) || 0
                            )
                        );
                        if (Number.isFinite(response.playerScore)) {
                            runtimeState.scoringSystem?.setCollectorScore?.(
                                runtimeState.multiplayerController?.getSelfId?.() || 'player',
                                response.playerScore
                            );
                        }
                        recordPickupScoreAudit({
                            collectorId: 'player',
                            pointsAwarded: response.pointsAwarded,
                            scoring: response.scoring,
                        });
                        spawnScorePopup({
                            collectorId: 'player',
                            pointsAwarded: response.pointsAwarded,
                            scoring: response.scoring,
                            sourceLabel: 'online',
                        });
                        runtimeState.audioController?.onPickupCollected?.({
                            collectorId: 'player',
                            onlineAuthoritative: true,
                        });
                        objectiveUi.flashCorrect(
                            pickupColorHex,
                            buildPickupStatusContext(response.pointsAwarded, response.scoring)
                        );
                    }
                );
                return;
            }

            const nextTotalCollected = runtimeState.totalCollectedCount + 1;
            const roundProgress = THREE.MathUtils.clamp(
                nextTotalCollected / Math.max(1, ROUND_TOTAL_PICKUPS),
                0,
                1
            );
            const scoreEvent = awardLocalPickupScore({
                collectorId: 'player',
                speedKph: Math.abs(getVehicleState()?.speed || 0),
                roundProgress,
            });
            runtimeState.playerCollectedCount += 1;
            runtimeState.totalCollectedCount = nextTotalCollected;
            runtimeState.audioController?.onPickupCollected?.({
                collectorId: 'player',
                onlineAuthoritative: false,
            });
            spawnScorePopup({
                collectorId: 'player',
                pointsAwarded: scoreEvent?.pointsAwarded || 0,
                scoring: scoreEvent?.scoring || null,
            });
            objectiveUi.flashCorrect(
                pickupColorHex,
                buildPickupStatusContext(scoreEvent?.pointsAwarded || 0, scoreEvent?.scoring)
            );
            return;
        }
        if (runtimeState.gameMode === 'bots') {
            const nextTotalCollected = runtimeState.totalCollectedCount + 1;
            const roundProgress = THREE.MathUtils.clamp(
                nextTotalCollected / Math.max(1, ROUND_TOTAL_PICKUPS),
                0,
                1
            );
            const scoreEvent = awardLocalPickupScore({
                collectorId,
                speedKph: Math.abs(
                    runtimeState.botTrafficSystem?.getCollectorSpeed?.(collectorId) || 0
                ),
                roundProgress,
            });
            runtimeState.totalCollectedCount = nextTotalCollected;
            runtimeState.botTrafficSystem?.registerCollected(collectorId);
            spawnScorePopup({
                collectorId,
                pointsAwarded: scoreEvent?.pointsAwarded || 0,
                scoring: scoreEvent?.scoring || null,
            });
        }
    },
    onExhausted: ({ totalPickups, collectedPickups }) => {
        if (
            runtimeState.gameMode === 'online' &&
            runtimeState.multiplayerController?.isInRoom?.()
        ) {
            return;
        }
        runtimeState.gameSessionController.finalizePickupRound(totalPickups, collectedPickups, {
            totalScore: runtimeState.totalScore,
        });
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
runtimeState.collectibleSystem = collectibleSystem;
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
const persistedCrashDamageTuning = readPersistedCrashDamageTuning(getCrashDamageTuning());
const physicsCrashDamageTuning = setCrashDamageTuning(persistedCrashDamageTuning);
const appliedCrashDamageTuning =
    runtimeState.crashDebrisController.setCrashDamageTuning(persistedCrashDamageTuning) ||
    physicsCrashDamageTuning;
persistCrashDamageTuning(appliedCrashDamageTuning);
runtimeState.replayEffectsController = createReplayEffectsController({
    scene,
    car,
    spawnCarDebris: (...args) => runtimeState.crashDebrisController.spawnCarDebris(...args),
    replayEventPickup: REPLAY_EVENT_PICKUP,
    replayEventCrash: REPLAY_EVENT_CRASH,
    obstacleCrashMaxSpeed: OBSTACLE_CRASH_MAX_SPEED,
});
const mineOtherVehicleTargetsBuffer = [];
runtimeState.mineController = createMineSystemController({
    scene,
    car,
    getGroundHeightAt,
    getVehicleState,
    getOtherVehicleTargets: () => {
        if (runtimeState.gameMode !== 'bots') {
            mineOtherVehicleTargetsBuffer.length = 0;
            return mineOtherVehicleTargetsBuffer;
        }
        const descriptors = runtimeState.botTrafficSystem?.getCollectorDescriptors?.() || EMPTY_ARRAY;
        let targetCount = 0;
        for (let i = 0; i < descriptors.length; i += 1) {
            const entry = descriptors[i];
            if (!entry || !entry.position) {
                continue;
            }
            let target = mineOtherVehicleTargetsBuffer[targetCount];
            if (!target) {
                target = {};
                mineOtherVehicleTargetsBuffer[targetCount] = target;
            }
            target.id = entry.id;
            target.ownerId = entry.id;
            target.type = 'bot';
            target.label = entry.id;
            target.position = entry.position;
            target.mineImmune = Boolean(entry.mineImmune);
            targetCount += 1;
        }
        mineOtherVehicleTargetsBuffer.length = targetCount;
        return mineOtherVehicleTargetsBuffer;
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
    onMineDeployed({ mineSnapshot, mode }) {
        const ownerCollectorId = resolveMineOwnerCollectorId(mineSnapshot?.ownerId);
        if (ownerCollectorId) {
            recordMineDeploymentAudit({
                collectorId: ownerCollectorId,
                mineId: mineSnapshot?.mineId,
            });
        }
        runtimeState.audioController?.onMineDeployed?.({
            thrown: mode === 'throw' || Boolean(mineSnapshot?.thrown),
        });
    },
    onMineDetonated({
        mineId = '',
        localHit,
        position,
        ownerId = '',
        targetPlayerId = '',
        ownerPointsAwarded = 0,
        ownerScore = 0,
        ownerScoring = null,
    }) {
        const distanceMeters = position?.distanceTo?.(car.position) || 0;
        runtimeState.audioController?.onMineDetonated?.({
            localHit: Boolean(localHit),
            distanceMeters,
        });
        const ownerCollectorId = resolveMineOwnerCollectorId(ownerId);
        const targetCollectorId = normalizeOptionalScoreAuditCollectorId(targetPlayerId);
        recordMineDetonationAudit({
            mineId,
            ownerCollectorId,
            targetCollectorId,
        });
        if (runtimeState.gameMode !== 'online') {
            return;
        }
        const pointsAwarded = Math.max(0, Math.round(Number(ownerPointsAwarded) || 0));
        if (ownerCollectorId !== 'player' || pointsAwarded <= 0) {
            return;
        }
        runtimeState.playerScore = Math.max(
            runtimeState.playerScore,
            Math.round(Number(ownerScore) || runtimeState.playerScore)
        );
        runtimeState.totalScore = Math.max(runtimeState.totalScore, runtimeState.playerScore);
        runtimeState.scoringSystem?.setCollectorScore?.(
            runtimeState.multiplayerController?.getSelfId?.() || 'player',
            runtimeState.playerScore
        );
        recordMineKillScoreAudit({
            collectorId: 'player',
            pointsAwarded,
            scoring: ownerScoring,
        });
        spawnScorePopup({
            collectorId: 'player',
            pointsAwarded,
            scoring: buildMinePopupScoring(ownerScoring),
            sourceLabel: 'mine kill',
        });
        objectiveUi.showInfo(`Mine kill: +${pointsAwarded} pts.`, 1400);
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
    onOtherVehicleMineHit({ target, ownerId = '', position = null }) {
        if (target?.type !== 'bot' || runtimeState.gameMode !== 'bots') {
            return;
        }

        let hasDistance = false;
        let distanceSq = 0;
        let debrisSpawnBudget = BOT_MINE_DEBRIS_BUDGET_NEAR;
        const positionX = Number(position?.x);
        const positionZ = Number(position?.z);
        if (Number.isFinite(positionX) && Number.isFinite(positionZ)) {
            const deltaX = positionX - car.position.x;
            const deltaZ = positionZ - car.position.z;
            distanceSq = deltaX * deltaX + deltaZ * deltaZ;
            hasDistance = true;
            if (distanceSq > BOT_MINE_DEBRIS_MID_DISTANCE_SQ) {
                debrisSpawnBudget = BOT_MINE_DEBRIS_BUDGET_FAR;
            } else if (distanceSq > BOT_MINE_DEBRIS_NEAR_DISTANCE_SQ) {
                debrisSpawnBudget = BOT_MINE_DEBRIS_BUDGET_MID;
            }
        }

        const destroyed = runtimeState.botTrafficSystem?.triggerMineHit?.(target.id, {
            crashContext: {
                debrisSpawnBudget,
            },
        });
        if (destroyed) {
            const targetCollectorId = typeof target?.id === 'string' ? target.id : '';
            const ownerCollectorId = resolveMineOwnerCollectorId(ownerId);
            const mineScoreEvent = awardLocalMineKillScore({
                ownerCollectorId,
                targetCollectorId,
            });
            const pointsAwarded = Math.max(
                0,
                Math.round(Number(mineScoreEvent?.pointsAwarded) || 0)
            );
            if (pointsAwarded > 0) {
                spawnScorePopup({
                    collectorId: ownerCollectorId,
                    pointsAwarded,
                    scoring: buildMinePopupScoring(mineScoreEvent?.scoring || null),
                    sourceLabel: 'mine kill',
                });
            }
            if (ownerCollectorId === 'player' && pointsAwarded > 0) {
                objectiveUi.showInfo(
                    `Mine kill on ${target.label || target.id}: +${pointsAwarded} pts.`,
                    1500
                );
            } else if (!hasDistance || distanceSq <= BOT_MINE_DEBRIS_MID_DISTANCE_SQ) {
                objectiveUi.showInfo(`Mine hit ${target.label || target.id}.`, 1400);
            }
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
        const ownerCollectorId = resolveMineOwnerCollectorId(snapshot?.ownerId);
        if (ownerCollectorId) {
            recordMineDeploymentAudit({
                collectorId: ownerCollectorId,
                mineId: snapshot?.mineId,
            });
        }
        runtimeState.mineController?.handleRemoteMinePlaced?.(snapshot);
    },
    onMineDetonated(snapshot) {
        runtimeState.mineController?.handleRemoteMineDetonated?.(snapshot);
    },
    onAuthoritativeRoundState(authoritativeState) {
        if (!authoritativeState?.inRoom) {
            runtimeState.authoritativeScoreByPlayerId.clear();
            runtimeState.scorePopupController?.clear?.();
            if (runtimeState.gameMode === 'online') {
                runtimeState.playerCollectedCount = 0;
                runtimeState.playerScore = 0;
                runtimeState.totalCollectedCount = 0;
                runtimeState.totalScore = 0;
            }
            return;
        }

        const scoreboardEntries = Array.isArray(authoritativeState.scoreboard)
            ? authoritativeState.scoreboard
            : [];
        runtimeState.playerCollectedCount = Math.max(
            0,
            Math.round(Number(authoritativeState.playerCollectedCount) || 0)
        );
        runtimeState.playerScore = Math.max(
            0,
            Math.round(Number(authoritativeState.playerScore) || 0)
        );
        runtimeState.totalCollectedCount = Math.max(
            0,
            Math.round(Number(authoritativeState.totalCollectedCount) || 0)
        );
        runtimeState.totalScore = Math.max(
            0,
            Math.round(Number(authoritativeState.totalScore) || 0)
        );

        const previousScoresById = runtimeState.authoritativeScoreByPlayerId;
        const hasPreviousSnapshot = previousScoresById.size > 0;
        const nextScoresById = new Map();
        const selfOnlineId =
            authoritativeState.selfId || runtimeState.multiplayerController?.getSelfId?.() || '';
        for (let i = 0; i < scoreboardEntries.length; i += 1) {
            const entry = scoreboardEntries[i];
            const entryId = typeof entry?.id === 'string' ? entry.id.trim() : '';
            if (!entryId) {
                continue;
            }
            const score = Math.max(0, Math.round(Number(entry.score) || 0));
            nextScoresById.set(entryId, score);
            if (!hasPreviousSnapshot || entryId === selfOnlineId || Boolean(entry?.isSelf)) {
                continue;
            }
            const previousScore = previousScoresById.get(entryId);
            if (!Number.isFinite(previousScore)) {
                continue;
            }
            const delta = score - previousScore;
            if (delta > 0) {
                spawnScorePopup({
                    collectorId: entryId,
                    pointsAwarded: delta,
                    sourceLabel: 'online',
                });
            }
        }
        runtimeState.authoritativeScoreByPlayerId = nextScoresById;
        runtimeState.scoringSystem?.setCollectorScore?.(
            selfOnlineId || 'player',
            runtimeState.playerScore
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
                    scoreboardEntries: scoreboardEntries,
                    totalScore: roundState.totalScore,
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
    getCollectorScore(collectorId) {
        return runtimeState.scoringSystem?.getCollectorScore?.(collectorId) || 0;
    },
    getCollectorRoundStats(collectorId) {
        return getCollectorScoreAuditSnapshot(collectorId);
    },
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
    getPlayerScore: () => runtimeState.playerScore,
    setPlayerScore(value) {
        runtimeState.playerScore = Number.isFinite(value) ? value : runtimeState.playerScore;
    },
    getTotalCollectedCount: () => runtimeState.totalCollectedCount,
    setTotalCollectedCount(value) {
        runtimeState.totalCollectedCount = Number.isFinite(value)
            ? value
            : runtimeState.totalCollectedCount;
    },
    getTotalScore: () => runtimeState.totalScore,
    setTotalScore(value) {
        runtimeState.totalScore = Number.isFinite(value) ? value : runtimeState.totalScore;
    },
    resetPlayerPickupCombo() {
        runtimeState.scoringSystem?.resetCollectorCombo?.('player');
        runtimeState.scoringSystem?.resetCollectorMineChain?.('player');
    },
    resetPickupScoring() {
        runtimeState.scoringSystem?.clear?.();
        runtimeState.scoreAuditByCollectorId.clear();
        runtimeState.scoredMineDeployIds.clear();
        runtimeState.scoredMineDetonationIds.clear();
        runtimeState.authoritativeScoreByPlayerId.clear();
    },
    onAutoCollectBonusAwarded({ collectorId = 'player', pointsAwarded = 0, pickupCount = 0 } = {}) {
        recordAutoCollectScoreAudit({
            collectorId,
            pointsAwarded,
            pickupCount,
        });
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
    clearScorePopups() {
        runtimeState.scorePopupController?.clear?.();
    },
    audioController: runtimeState.audioController,
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
    runtimeState.audioController?.onWorldMapVisibilityChanged?.(nextOpen);

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

function finalizeGraphicsQualitySnapshot(snapshot, { showStatus = true, persist = true } = {}) {
    if (!snapshot) {
        return null;
    }
    if (persist) {
        persistGraphicsQualityMode(snapshot.mode);
    }
    pauseMenuUi.refreshGraphicsStatus?.();
    const statusMessage = snapshot.compactStatusMessage || snapshot.statusMessage || '';
    if (showStatus && statusMessage) {
        objectiveUi.showInfo(statusMessage, 1300);
    }
    return snapshot;
}

function cycleGraphicsQualityMode(step = 1, options = {}) {
    const direction = step < 0 ? -1 : 1;
    const currentMode = graphicsQualityController.getMode?.() || GRAPHICS_QUALITY_MODES.balanced;
    const currentIndex = GRAPHICS_PRESET_MODE_ORDER.includes(currentMode)
        ? GRAPHICS_PRESET_MODE_ORDER.indexOf(currentMode)
        : GRAPHICS_PRESET_MODE_ORDER.indexOf(GRAPHICS_QUALITY_MODES.balanced);
    const nextIndex =
        (currentIndex + direction + GRAPHICS_PRESET_MODE_ORDER.length) %
        GRAPHICS_PRESET_MODE_ORDER.length;
    const nextMode = GRAPHICS_PRESET_MODE_ORDER[nextIndex];
    const snapshot = graphicsQualityController.setMode(nextMode);
    return finalizeGraphicsQualitySnapshot(snapshot, options);
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
graphicsQualityController.attachMapUiController(mapUiController);
pauseMenuUi.configureGraphicsControls({
    getSnapshot() {
        return graphicsQualityController.getSnapshot();
    },
    onCycleMode(step = 1) {
        return cycleGraphicsQualityMode(step, { showStatus: false, persist: true });
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
    getMaxPixelRatio() {
        return graphicsQualityController.getMaxPixelRatioCap();
    },
    onCycleGraphicsQualityMode(step = 1) {
        return cycleGraphicsQualityMode(step, { showStatus: true, persist: true });
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
    scorePopupController: runtimeState.scorePopupController,
    getMultiplayerCollisionSnapshots() {
        return runtimeState.multiplayerController?.getCollisionSnapshots?.() || EMPTY_ARRAY;
    },
    crashDebrisController: runtimeState.crashDebrisController,
    replayEffectsController: runtimeState.replayEffectsController,
    audioController: runtimeState.audioController,
    mapUiController,
    graphicsQualityController,
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
    playerCarPoolSize: PLAYER_CAR_POOL_SIZE,
    getPhysicsAccumulator: () => runtimeState.physicsAccumulator,
    setPhysicsAccumulator(value) {
        runtimeState.physicsAccumulator = value;
    },
    getIsGamePaused: () => runtimeState.isGamePaused,
    getIsCarDestroyed: () => runtimeState.isCarDestroyed,
    getIsBatteryDepleted: () => runtimeState.isBatteryDepleted,
    getPlayerCollectedCount: () => runtimeState.playerCollectedCount,
    getPlayerScore: () => runtimeState.playerScore,
    getPlayerCarsRemaining: () => runtimeState.playerCarsRemaining,
    getPickupRoundFinished: () => runtimeState.pickupRoundFinished,
    getTotalCollectedCount: () => runtimeState.totalCollectedCount,
    getTotalScore: () => runtimeState.totalScore,
    getCollectorScore(collectorId) {
        return runtimeState.scoringSystem?.getCollectorScore?.(collectorId) || 0;
    },
    getBotsEnabled: () => runtimeState.gameMode !== 'online',
    getGameMode: () => runtimeState.gameMode,
    getIsWelcomeModalVisible: () => runtimeState.isWelcomeModalVisible,
    getLocalPlayerId: () => runtimeState.multiplayerController?.getSelfId?.() || '',
    getWorldMapDriveLockMode: () => runtimeState.worldMapDriveLockMode,
    getIsWorldMapOpen: () => runtimeState.isWorldMapOpen,
});

const initialPlayerHudState =
    runtimeState.gameMode === 'bots'
        ? {
              name: 'YOU',
              targetLabel: 'PLAYER',
              showSwatch: false,
              score: runtimeState.playerScore,
              collectedCount: runtimeState.playerCollectedCount,
              livesRemaining: runtimeState.playerCarsRemaining,
              maxLives: PLAYER_CAR_POOL_SIZE,
              respawning: false,
              respawnMsRemaining: 0,
              isPlayer: true,
          }
        : null;
botStatusUi.render(runtimeState.botTrafficSystem.getHudState(), initialPlayerHudState);
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
