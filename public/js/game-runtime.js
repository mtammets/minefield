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
    ensureWorldBuilt,
    getGroundHeightAt,
    updateGroundMotion,
    getEnvironmentSyncState,
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
    setPlayerCarAppearance,
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
    setCameraViewMode,
    getCameraViewMode,
    resetCameraTrackingState,
    getChaseCameraSettings,
    setChaseCameraSettings,
    adjustChaseCameraSettings,
    resetChaseCameraSettings,
    getChaseCameraTuneSnapshot,
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
import {
    MAX_PHYSICS_STEPS_PER_FRAME,
    PLAYER_RIDE_HEIGHT,
    STATUS_DEFAULT_TEXT,
    ROOF_MENU_MODE_LABELS,
    SHARED_PICKUP_COLOR_INDEX,
    SHARED_PICKUP_COLOR_HEX,
    BATTERY_MAX,
    CHARGING_ZONE_ACTIVATION_DELAY_SEC,
    CHARGING_BATTERY_GAIN_PER_SEC,
    ROUND_TOTAL_PICKUPS,
    PLAYER_CAR_POOL_SIZE,
    RACE_INTRO_DURATION_SEC,
} from './constants.js';
import { toCssHex, colorNameFromHex } from './color-utils.js';
import {
    readPersistedPlayerTopSpeedKph,
    persistPlayerTopSpeedKph,
    readPersistedGraphicsQualityMode,
    persistGraphicsQualityMode,
    readPersistedChaseCameraSettings,
    persistChaseCameraSettings,
    resolvePlayerCarColorHex,
    resolvePlayerCarSkinId,
    getCarSkinPresetIndex,
    getCarSkinPresetById,
    readPersistedPlayerCarSkinId,
    persistPlayerCarSkinId,
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
import { createGameSessionController } from './game-session-flow.js';
import { createInputController } from './input-controller.js';
import { createGameLoopController } from './game-loop-controller.js';
import { createGameRuntimeState } from './game-runtime-state.js';
import { initializeScene, initializeRenderer, applyRendererSettings } from './game-bootstrap.js';
import { createRuntimeUiControllers } from './game-runtime-ui.js';
import { createMultiplayerController } from './multiplayer-controller.js';
import { createMineSystemController } from './mine-system.js';
import { createMapUiController } from './map-ui.js';
import { createAudioSystem } from './audio-system.js';
import { createAuthController } from './auth-controller.js';
import { createGlobalLeaderboardController } from './global-leaderboard.js';
import { createPickupScoringSystem } from './scoring-system.js';
import { createBotsMissionDirector, getBotsMissionMaxBotCount } from './bots-mission-director.js';
import { createScorePopupController } from './score-popup-ui.js';
import { createGroundLayerDebugController } from './ground-layer-debug-ui.js';
import { createVehicleWeaponSystem } from './vehicle-weapon-system.js';
import {
    createGraphicsQualityController,
    GRAPHICS_QUALITY_MODES,
} from './graphics-quality-controller.js';
import { preloadBillboardMedia } from './environment/billboards.js';
import {
    getBillboardContentExtraImageUrls,
    getBillboardContentExtraVideoUrls,
    getBillboardContentGroups,
    initializeBillboardContentManager,
    resetBillboardGroupContent,
    setBillboardGroupPlaybackEnabled,
    uploadBillboardGroupFiles,
} from './environment/billboard-content-manager.js';
import {
    applyLorienVelmoreMineDetonation,
    appendLorienVelmoreDoorCollisionObstacles,
    resolveLorienVelmoreMineBarrierImpact,
} from './environment/buildings.js';
import { MONUMENT_SCREEN_VIDEO_URLS } from './environment/monument.js';
import {
    INPUT_CONTEXTS,
    WORLD_MAP_DRIVE_LOCK_MODES,
    resolveGameplayInputContext,
    resolveWorldMapDriveLockMode,
} from './input-context.js';
import { DEFAULT_KEY_BINDINGS } from './input-bindings.js';

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
const BOT_MINE_DEBRIS_NEAR_DISTANCE_SQ =
    BOT_MINE_DEBRIS_NEAR_DISTANCE * BOT_MINE_DEBRIS_NEAR_DISTANCE;
const BOT_MINE_DEBRIS_MID_DISTANCE_SQ = BOT_MINE_DEBRIS_MID_DISTANCE * BOT_MINE_DEBRIS_MID_DISTANCE;
const STARTUP_SECTOR_PREWARM_RADII = Object.freeze([38, 72, 96]);
const STARTUP_SECTOR_PREWARM_HEIGHT = 18;
const STARTUP_SECTOR_PREWARM_LOOKAT_HEIGHT = 1.8;
const STARTUP_SECTOR_PREWARM_DIRECTIONS = Object.freeze([0, 45, 90, 135, 180, 225, 270, 315]);
const RUNTIME_GRAPHICS_RECOVERY_REQUEST_COOLDOWN_MS = 900;
const RUNTIME_GRAPHICS_RECOVERY_STATUS_COOLDOWN_MS = 2400;
const RUNTIME_SCENE_REPAIR_STATUS_COOLDOWN_MS = 2400;
const PLAYER_SPAWN_CLEARANCE = 3.4;
const PLAYER_SPAWN_BOT_CLEARANCE = 14;
const PLAYER_SPAWN_CARDINAL_ROTATIONS = Object.freeze([0, Math.PI * 0.5, Math.PI, -Math.PI * 0.5]);
const crashParts = getPlayerCarCrashParts();
const selectedCarSkinId = resolvePlayerCarSkinId(readPersistedPlayerCarSkinId());
const selectedCarSkinPreset = getCarSkinPresetById(selectedCarSkinId);
const selectedCarColorHex = resolvePlayerCarColorHex(selectedCarSkinPreset.bodyColor);
const persistedGraphicsQualityMode = readPersistedGraphicsQualityMode(
    GRAPHICS_QUALITY_MODES.balanced
);
const initialGraphicsQualityMode = GRAPHICS_PRESET_MODE_ORDER.includes(persistedGraphicsQualityMode)
    ? persistedGraphicsQualityMode
    : GRAPHICS_QUALITY_MODES.balanced;
const runtimeState = createGameRuntimeState({
    selectedCarColorHex,
    selectedCarSkinId,
    batteryMax: BATTERY_MAX,
    playerCarPoolSize: PLAYER_CAR_POOL_SIZE,
});
let runtimeGraphicsWarmupReady = false;
let runtimeGraphicsRecoveryPromise = null;
let runtimeGraphicsLastRecoveryRequestAtMs = -Number.POSITIVE_INFINITY;
let runtimeGraphicsLastStatusAtMs = -Number.POSITIVE_INFINITY;
let runtimeSceneRepairLastStatusAtMs = -Number.POSITIVE_INFINITY;
let runtimeGraphicsContextLossCount = 0;
runtimeState.scoringSystem = createPickupScoringSystem();
runtimeState.scorePopupController = createScorePopupController();
const performanceDiagnosticsController = createNoopPerformanceDiagnosticsController();

setPlayerCarAppearance({
    skinId: runtimeState.selectedCarSkinId,
    colorHex: runtimeState.selectedCarColorHex,
});
setPlayerTopSpeedLimitKph(
    readPersistedPlayerTopSpeedKph({
        getPlayerTopSpeedLimit,
        getPlayerTopSpeedLimitBounds,
    })
);
setChaseCameraSettings(readPersistedChaseCameraSettings());

const {
    objectiveUi,
    controlsHelpUi,
    botStatusUi,
    finalScoreboardUi,
    pauseMenuUi,
    welcomeModalUi,
    speedometerUi,
    toastUi,
} = createRuntimeUiControllers({
    toCssHex,
    colorNameFromHex,
    statusDefaultText: STATUS_DEFAULT_TEXT,
    resolvePlayerCarSkinId,
    getCarSkinPresetIndex,
    getIsCarDestroyed: () => runtimeState.isCarDestroyed,
    getSelectedCarColorHex: () => runtimeState.selectedCarColorHex,
    getSelectedCarSkinId: () => runtimeState.selectedCarSkinId,
    getGameSessionController: () => runtimeState.gameSessionController,
    getInputController: () => runtimeState.inputController,
    getGameMode: () => runtimeState.gameMode,
    getIsInOnlineRoom: () => Boolean(runtimeState.multiplayerController?.isInRoom?.()),
    getMineInventorySnapshot: () =>
        runtimeState.mineController?.getLocalInventorySnapshot?.() || null,
    getCombatLoadoutSnapshot: () => runtimeState.weaponSystem?.getCombatLoadoutSnapshot?.() || null,
    onPrepareStart: prepareRuntimeForSessionStart,
    onAuthSubmit(mode, credentials) {
        if (mode === 'sign-up') {
            return runtimeState.authController?.signUp?.(credentials);
        }
        return runtimeState.authController?.signIn?.(credentials);
    },
    onAuthSignOut() {
        return runtimeState.authController?.signOut?.();
    },
    onAuthUpdateProfileImage(file) {
        return runtimeState.authController?.updateProfileImage?.(file);
    },
    onAuthRemoveProfileImage() {
        return runtimeState.authController?.removeProfileImage?.();
    },
    onAuthUpdateCarWrap(file) {
        return runtimeState.authController?.updateCarWrap?.(file);
    },
    onAuthRemoveCarWrap() {
        return runtimeState.authController?.removeCarWrap?.();
    },
    onAuthChangePassword(credentials) {
        return runtimeState.authController?.changePassword?.(credentials);
    },
    onAuthDeleteAccount() {
        return runtimeState.authController?.deleteAccount?.();
    },
    onRefreshGlobalLeaderboard() {
        return runtimeState.globalLeaderboardController?.refresh?.();
    },
    getAuthState: () => runtimeState.authController?.getState?.() || null,
    onDownloadPerformanceLog: downloadPerformanceDiagnosticsLog,
});
runtimeState.authController = createAuthController({
    onToast(toast) {
        if (!toast?.message) {
            return;
        }
        toastUi?.show?.(toast.message, {
            tone: toast.tone,
            durationMs: toast.durationMs,
        });
    },
    onStateChanged(state) {
        welcomeModalUi.setAuthState?.(state);
        setPlayerCarAppearance({
            wrapUrl: state?.authenticated ? state?.carWrapUrl || '' : '',
        });
        runtimeState.multiplayerController?.handleAuthenticationStateChanged?.(state);
        runtimeState.gameSessionController?.handleAuthStateChanged?.(state);
    },
});
welcomeModalUi.setAuthState?.(runtimeState.authController.getState?.());
runtimeState.globalLeaderboardController = createGlobalLeaderboardController({
    onStateChanged(state) {
        finalScoreboardUi.setGlobalLeaderboard?.(state);
        welcomeModalUi.setGlobalLeaderboard?.(state);
    },
    getAccessToken: () => runtimeState.authController?.getAccessToken?.() || '',
    getAuthState: () => runtimeState.authController?.getState?.() || null,
});
welcomeModalUi.setGlobalLeaderboard?.(runtimeState.globalLeaderboardController.getState?.());
void runtimeState.authController.initialize().catch(() => {});
void runtimeState.globalLeaderboardController.initialize();

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
        const completeNoFailures =
            Boolean(snapshot.completeNoFailures) ||
            (filesTotal > 0 && filesReady >= filesTotal && filesFailed === 0);

        reportProgress({
            stage: 'audio',
            progress: Math.min(1, Math.max(0, progress)),
            filesTotal,
            filesReady,
            filesFailed,
            filesDone,
            complete: completeNoFailures,
        });
    };
    const reportMediaProgress = (preloadState = null) => {
        const snapshot = preloadState && typeof preloadState === 'object' ? preloadState : null;
        if (!snapshot) {
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
        const completeNoFailures =
            Boolean(snapshot.completeNoFailures) ||
            (filesTotal > 0 && filesReady >= filesTotal && filesFailed === 0);

        reportProgress({
            stage: 'media',
            progress: Math.min(1, Math.max(0, progress)),
            filesTotal,
            filesReady,
            filesFailed,
            filesDone,
            complete: completeNoFailures,
        });
    };

    const normalizedMode = mode === 'online' ? 'online' : 'bots';
    const canPrepareOnlineRoomFlow = Boolean(startContext && typeof startContext === 'object');
    clearDeferredMineKillUiTasks({ resetCounters: true });
    reportProgress({
        stage: 'prepare',
        progress: 0,
    });
    reportAudioProgress();
    reportMediaProgress({
        filesTotal: 0,
        filesReady: 0,
        filesFailed: 0,
        filesDone: 0,
        progress: 0,
        completeNoFailures: false,
    });
    const billboardContentReadyPromise = initializeBillboardContentManager();
    const preparationTasks = [waitForAnimationFrames(2)];

    preparationTasks.push(
        (async () => {
            reportProgress({
                stage: 'world',
                progress: 0,
            });
            await waitForAnimationFrames(1);
            await billboardContentReadyPromise;
            ensureWorldBuilt();
            groundLayerDebugController?.refresh?.();
            await waitForAnimationFrames(1);
            reportProgress({
                stage: 'world',
                progress: 1,
                complete: true,
            });
            return {
                task: 'world',
                ready: true,
                message: '',
            };
        })()
    );

    preparationTasks.push(
        (async () => {
            reportProgress({
                stage: 'media',
                progress: 0,
            });
            await billboardContentReadyPromise;
            const preloadState = await preloadBillboardMedia({
                extraImageUrls: getBillboardContentExtraImageUrls(),
                extraVideoUrls: [
                    ...MONUMENT_SCREEN_VIDEO_URLS,
                    ...getBillboardContentExtraVideoUrls(),
                ],
                onProgress(preloadSnapshot) {
                    reportMediaProgress(preloadSnapshot);
                },
            });
            const ready = preloadState.filesTotal <= 0 || Boolean(preloadState.completeNoFailures);
            return {
                task: 'media',
                ready,
                message: ready ? '' : 'Billboard media could not be prepared.',
            };
        })()
    );

    preparationTasks.push(
        (async () => {
            const ready = await prepareGraphicsForSessionStart(normalizedMode, {
                reportProgress,
            });
            return {
                task: 'graphics',
                ready: Boolean(ready),
                message: 'Graphics warmup failed. Please reload and try again.',
            };
        })()
    );

    if (typeof runtimeState.audioController?.prepareForGameplay === 'function') {
        preparationTasks.push(
            (async () => {
                const audioReady = await runtimeState.audioController.prepareForGameplay({
                    requireAllFiles: false,
                    lazyPreloadRemaining: true,
                    onProgress(preloadState) {
                        reportAudioProgress(preloadState);
                    },
                });
                const preloadState = runtimeState.audioController?.getPreloadState?.() || null;
                const filesTotal = Math.max(0, Math.round(Number(preloadState?.filesTotal) || 0));
                const filesReady = Math.max(0, Math.round(Number(preloadState?.filesReady) || 0));
                const filesFailed = Math.max(0, Math.round(Number(preloadState?.filesFailed) || 0));
                const ready = Boolean(audioReady);
                return {
                    task: 'audio',
                    ready,
                    message: !ready
                        ? 'Core gameplay audio could not be prepared.'
                        : filesTotal > 0 && filesFailed > 0
                          ? `Some optional audio files failed to load (${filesFailed}/${filesTotal}).`
                          : '',
                };
            })()
        );
    } else if (typeof runtimeState.audioController?.unlock === 'function') {
        preparationTasks.push(
            (async () => {
                const unlocked = await runtimeState.audioController.unlock({
                    waitForPreload: true,
                });
                reportAudioProgress();
                const preloadState = runtimeState.audioController?.getPreloadState?.() || null;
                const filesTotal = Math.max(0, Math.round(Number(preloadState?.filesTotal) || 0));
                const filesReady = Math.max(0, Math.round(Number(preloadState?.filesReady) || 0));
                const filesFailed = Math.max(0, Math.round(Number(preloadState?.filesFailed) || 0));
                const ready =
                    filesTotal <= 0 ||
                    (Boolean(unlocked) && filesReady >= filesTotal && filesFailed === 0);
                return {
                    task: 'audio',
                    ready,
                    message: 'Gameplay audio could not be fully prepared.',
                };
            })()
        );
    }

    if (normalizedMode === 'online' && canPrepareOnlineRoomFlow) {
        runtimeState.multiplayerController?.setPanelVisible?.(true);
        if (typeof runtimeState.multiplayerController?.prepareOnlineRoomFlow === 'function') {
            preparationTasks.push(
                (async () => {
                    const ready =
                        await runtimeState.multiplayerController.prepareOnlineRoomFlow(
                            startContext
                        );
                    return {
                        task: 'online',
                        ready: Boolean(ready),
                        message: 'Online room is not ready yet. Please try again.',
                    };
                })()
            );
        }
    }

    try {
        const results = await Promise.all(preparationTasks);
        const failedTask = results.find((entry) => entry && entry.ready === false);
        if (failedTask) {
            const failureMessage =
                typeof failedTask.message === 'string' && failedTask.message.trim()
                    ? failedTask.message.trim()
                    : 'Session preparation failed.';
            reportAudioProgress();
            reportProgress({
                stage: 'error',
                progress: 0.98,
                message: failureMessage,
            });
            throw new Error(failureMessage);
        }
    } catch (error) {
        const failureMessage =
            typeof error?.message === 'string' && error.message.trim()
                ? error.message.trim()
                : 'Session preparation failed.';
        reportAudioProgress();
        reportProgress({
            stage: 'error',
            progress: 0.98,
            message: failureMessage,
        });
        throw error;
    }

    reportAudioProgress();
    reportProgress({
        stage: 'complete',
        progress: 1,
    });
    return {
        ok: true,
    };
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

async function prewarmSceneSectors(renderer, camera, origin, options = {}) {
    if (!renderer || typeof renderer.render !== 'function' || !camera?.isCamera || !origin) {
        return false;
    }
    const reportProgress =
        typeof options?.reportProgress === 'function' ? options.reportProgress : () => {};
    const directions = STARTUP_SECTOR_PREWARM_DIRECTIONS;
    if (!Array.isArray(directions) || directions.length === 0) {
        return false;
    }
    const worldHalfSize = Math.max(0, Number(worldBounds?.size) * 0.5 || 0);
    const maxAllowedRadius = worldHalfSize > 8 ? worldHalfSize - 6 : Number.POSITIVE_INFINITY;
    const radii = STARTUP_SECTOR_PREWARM_RADII.filter(
        (radius) =>
            Number.isFinite(radius) &&
            radius > 0 &&
            (Number.isFinite(maxAllowedRadius) ? radius <= maxAllowedRadius : true)
    );
    if (!Array.isArray(radii) || radii.length === 0) {
        return false;
    }
    const prewarmOrigins = buildStartupPrewarmOrigins(origin);
    if (!Array.isArray(prewarmOrigins) || prewarmOrigins.length === 0) {
        return false;
    }

    const warmupCamera = camera.clone?.() || new THREE.PerspectiveCamera(55, 1, 0.1, 260);
    warmupCamera.near = camera.near;
    warmupCamera.far = camera.far;
    warmupCamera.fov = camera.fov;
    warmupCamera.aspect = camera.aspect;
    warmupCamera.updateProjectionMatrix();

    const totalPasses = Math.max(1, prewarmOrigins.length * radii.length * directions.length);
    let warmedPasses = 0;
    let passIndex = 0;
    for (let originIndex = 0; originIndex < prewarmOrigins.length; originIndex += 1) {
        const prewarmOrigin = prewarmOrigins[originIndex];
        for (let radiusIndex = 0; radiusIndex < radii.length; radiusIndex += 1) {
            const radius = radii[radiusIndex];
            for (let directionIndex = 0; directionIndex < directions.length; directionIndex += 1) {
                const angleRad = THREE.MathUtils.degToRad(directions[directionIndex]);
                const targetX = prewarmOrigin.x + Math.cos(angleRad) * radius;
                const targetZ = prewarmOrigin.z + Math.sin(angleRad) * radius;
                warmupCamera.position.set(
                    targetX,
                    prewarmOrigin.y + STARTUP_SECTOR_PREWARM_HEIGHT,
                    targetZ
                );
                warmupCamera.lookAt(
                    prewarmOrigin.x,
                    prewarmOrigin.y + STARTUP_SECTOR_PREWARM_LOOKAT_HEIGHT,
                    prewarmOrigin.z
                );
                warmupCamera.updateMatrixWorld(true);
                scene.updateMatrixWorld(true);

                try {
                    renderer.render(scene, warmupCamera);
                    warmedPasses += 1;
                } catch {
                    // Ignore individual sector render failures and continue.
                }
                passIndex += 1;
                reportProgress({
                    stage: 'graphics',
                    progress: 0.92 + (passIndex / totalPasses) * 0.04,
                });
                await waitForAnimationFrames(1);
            }
        }
    }

    return warmedPasses > 0;
}

function buildStartupPrewarmOrigins(origin = null) {
    const originX = Number(origin?.x);
    const originY = Number(origin?.y);
    const originZ = Number(origin?.z);
    if (!Number.isFinite(originX) || !Number.isFinite(originY) || !Number.isFinite(originZ)) {
        return [];
    }

    const boundsMinX = Number(worldBounds?.minX);
    const boundsMaxX = Number(worldBounds?.maxX);
    const boundsMinZ = Number(worldBounds?.minZ);
    const boundsMaxZ = Number(worldBounds?.maxZ);
    const hasBounds =
        Number.isFinite(boundsMinX) &&
        Number.isFinite(boundsMaxX) &&
        Number.isFinite(boundsMinZ) &&
        Number.isFinite(boundsMaxZ) &&
        boundsMinX < boundsMaxX &&
        boundsMinZ < boundsMaxZ;
    const margin = 6;
    const clampX = (value) =>
        hasBounds ? THREE.MathUtils.clamp(value, boundsMinX + margin, boundsMaxX - margin) : value;
    const clampZ = (value) =>
        hasBounds ? THREE.MathUtils.clamp(value, boundsMinZ + margin, boundsMaxZ - margin) : value;
    const centerX = hasBounds ? (boundsMinX + boundsMaxX) * 0.5 : 0;
    const centerZ = hasBounds ? (boundsMinZ + boundsMaxZ) * 0.5 : 0;
    const mirroredX = hasBounds ? centerX * 2 - originX : originX;
    const mirroredZ = hasBounds ? centerZ * 2 - originZ : originZ;
    const minDistanceSq = 14 * 14;
    const result = [];
    const addUniqueOrigin = (x, z) => {
        if (!Number.isFinite(x) || !Number.isFinite(z)) {
            return;
        }
        const nextX = clampX(x);
        const nextZ = clampZ(z);
        for (let i = 0; i < result.length; i += 1) {
            const entry = result[i];
            const dx = entry.x - nextX;
            const dz = entry.z - nextZ;
            if (dx * dx + dz * dz < minDistanceSq) {
                return;
            }
        }
        result.push({
            x: nextX,
            y: originY,
            z: nextZ,
        });
    };

    addUniqueOrigin(originX, originZ);
    addUniqueOrigin(centerX, centerZ);
    addUniqueOrigin(mirroredX, mirroredZ);
    return result;
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
        const warmedMineKillUiFlow = prewarmMineKillUiFlow();

        runtimeState.collectibleSystem?.primeForCollectors?.([
            { id: 'player', position: car.position },
        ]);
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
            progress: 0.72,
        });

        await waitForAnimationFrames(1);
        const warmedBotDebrisShaders =
            mode === 'bots'
                ? runtimeState.botTrafficSystem?.warmupGraphics?.(renderer, camera)
                : true;
        reportProgress({
            stage: 'graphics',
            progress: 0.84,
        });

        await waitForAnimationFrames(1);
        const warmedSkidShaders = skidMarkController?.warmupGraphics?.(renderer, camera);
        reportProgress({
            stage: 'graphics',
            progress: 0.92,
        });

        await waitForAnimationFrames(1);
        const warmedSceneSectors = await prewarmSceneSectors(renderer, camera, car.position, {
            reportProgress,
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
            warmedBotDebrisShaders,
            warmedSkidShaders,
            warmedSceneSectors,
            warmedMineKillUiFlow,
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
let groundLayerDebugController = null;
const builtWorld = ensureWorldBuilt();
const playerSpawnCandidates = buildPlayerSpawnCandidates();
let lastPlayerSpawnCandidateIndex = -1;
const initialPlayerSpawn = resolveRandomPlayerSpawnState({ allowRepeat: true });
car.position.copy(initialPlayerSpawn.position);
car.rotation.set(0, initialPlayerSpawn.rotationY, 0);
const playerSpawnState = {
    position: initialPlayerSpawn.position.clone(),
    rotationY: initialPlayerSpawn.rotationY,
};

function buildPlayerSpawnCandidates() {
    const candidates = [];
    const xLines = Array.isArray(cityMapLayout?.roadAxisLinesX) ? cityMapLayout.roadAxisLinesX : [];
    const zLines = Array.isArray(cityMapLayout?.roadAxisLinesZ) ? cityMapLayout.roadAxisLinesZ : [];
    const centralParkingLot = cityMapLayout?.centralParkingLot || null;

    for (let xIndex = 0; xIndex < xLines.length; xIndex += 1) {
        const x = Number(xLines[xIndex]?.coord);
        if (!Number.isFinite(x)) {
            continue;
        }
        for (let zIndex = 0; zIndex < zLines.length; zIndex += 1) {
            const z = Number(zLines[zIndex]?.coord);
            if (!Number.isFinite(z)) {
                continue;
            }
            if (isInsideCentralParkingLotCandidate(x, z, centralParkingLot, 10)) {
                continue;
            }
            if (isInsidePlayerSpawnObstacle(x, z, staticObstacles, PLAYER_SPAWN_CLEARANCE)) {
                continue;
            }
            candidates.push({
                x,
                z,
                rotations: PLAYER_SPAWN_CARDINAL_ROTATIONS,
            });
        }
    }

    if (candidates.length > 0) {
        return candidates;
    }

    return [
        {
            x: Number.isFinite(playerSpawnPoint?.x) ? playerSpawnPoint.x : car.position.x,
            z: Number.isFinite(playerSpawnPoint?.z) ? playerSpawnPoint.z : car.position.z,
            rotations: [
                Number.isFinite(playerSpawnPoint?.rotationY)
                    ? playerSpawnPoint.rotationY
                    : car.rotation.y,
            ],
        },
    ];
}

function isInsideCentralParkingLotCandidate(x, z, centralParkingLot = null, padding = 0) {
    if (!centralParkingLot) {
        return false;
    }
    const extraPadding = Math.max(0, Number(padding) || 0);
    return (
        x >= Number(centralParkingLot.minX) - extraPadding &&
        x <= Number(centralParkingLot.maxX) + extraPadding &&
        z >= Number(centralParkingLot.minZ) - extraPadding &&
        z <= Number(centralParkingLot.maxZ) + extraPadding
    );
}

function isInsidePlayerSpawnObstacle(x, z, obstacles = [], padding = 0) {
    for (let index = 0; index < obstacles.length; index += 1) {
        const obstacle = obstacles[index];
        if (obstacle?.type === 'circle') {
            const radius = Math.max(0, Number(obstacle.radius) || 0) + padding;
            const dx = x - Number(obstacle.x);
            const dz = z - Number(obstacle.z);
            if (dx * dx + dz * dz <= radius * radius) {
                return true;
            }
            continue;
        }
        if (obstacle?.type !== 'aabb') {
            continue;
        }
        if (
            x >= Number(obstacle.minX) - padding &&
            x <= Number(obstacle.maxX) + padding &&
            z >= Number(obstacle.minZ) - padding &&
            z <= Number(obstacle.maxZ) + padding
        ) {
            return true;
        }
    }
    return false;
}

function isPlayerSpawnClearOfBots(candidate, clearance = PLAYER_SPAWN_BOT_CLEARANCE) {
    const descriptors = runtimeState.botTrafficSystem?.getCollectorDescriptors?.() || [];
    const clearanceSq = clearance * clearance;
    for (let index = 0; index < descriptors.length; index += 1) {
        const descriptor = descriptors[index];
        const position = descriptor?.position;
        if (!position) {
            continue;
        }
        const dx = candidate.x - Number(position.x);
        const dz = candidate.z - Number(position.z);
        if (dx * dx + dz * dz < clearanceSq) {
            return false;
        }
    }
    return true;
}

function resolveRandomPlayerSpawnState({ allowRepeat = false } = {}) {
    const indexedCandidates = [];
    for (let index = 0; index < playerSpawnCandidates.length; index += 1) {
        const candidate = playerSpawnCandidates[index];
        if (!candidate) {
            continue;
        }
        if (!isPlayerSpawnClearOfBots(candidate)) {
            continue;
        }
        indexedCandidates.push({ candidate, index });
    }

    const availableCandidates =
        indexedCandidates.length > 0
            ? indexedCandidates
            : playerSpawnCandidates.map((candidate, index) => ({ candidate, index }));
    let selectedEntry =
        availableCandidates[Math.floor(Math.random() * Math.max(1, availableCandidates.length))] ||
        null;

    if (
        !allowRepeat &&
        availableCandidates.length > 1 &&
        selectedEntry?.index === lastPlayerSpawnCandidateIndex
    ) {
        const alternativeCandidates = availableCandidates.filter(
            (entry) => entry.index !== lastPlayerSpawnCandidateIndex
        );
        selectedEntry =
            alternativeCandidates[
                Math.floor(Math.random() * Math.max(1, alternativeCandidates.length))
            ] || selectedEntry;
    }

    const resolvedCandidate = selectedEntry?.candidate ||
        playerSpawnCandidates[0] || {
            x: Number.isFinite(playerSpawnPoint?.x) ? playerSpawnPoint.x : car.position.x,
            z: Number.isFinite(playerSpawnPoint?.z) ? playerSpawnPoint.z : car.position.z,
            rotations: [
                Number.isFinite(playerSpawnPoint?.rotationY)
                    ? playerSpawnPoint.rotationY
                    : car.rotation.y,
            ],
        };
    lastPlayerSpawnCandidateIndex = Number.isInteger(selectedEntry?.index)
        ? selectedEntry.index
        : lastPlayerSpawnCandidateIndex;

    const rotations =
        Array.isArray(resolvedCandidate.rotations) && resolvedCandidate.rotations.length > 0
            ? resolvedCandidate.rotations
            : PLAYER_SPAWN_CARDINAL_ROTATIONS;
    const rotationY =
        rotations[Math.floor(Math.random() * rotations.length)] ||
        (Number.isFinite(playerSpawnPoint?.rotationY)
            ? playerSpawnPoint.rotationY
            : car.rotation.y);
    const groundY =
        getGroundHeightAt(resolvedCandidate.x, resolvedCandidate.z) + PLAYER_RIDE_HEIGHT;
    return {
        position: new THREE.Vector3(resolvedCandidate.x, groundY, resolvedCandidate.z),
        rotationY,
    };
}

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
runtimeState.audioController.initialize({
    preloadOnInitialize: false,
});

const chargingZoneController = createChargingZoneController(scene, chargingZones, {
    activationDelaySec: CHARGING_ZONE_ACTIVATION_DELAY_SEC,
    sampleGroundHeight: getGroundHeightAt,
});
groundLayerDebugController = createGroundLayerDebugController({ scene });
groundLayerDebugController.refresh();
groundLayerDebugController.setEditModeActive(false);
const chargingProgressHudController = createChargingProgressHudController(scene, camera, {
    vehicle: car,
    showWorldHud: false,
    getChargingAnchor(target) {
        return chargingZoneController.getHudAnchor?.(target) || null;
    },
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
const sceneEditModePartDescriptors = collectSceneEditModePartDescriptors(builtWorld.cityScenery);
const carEditModeController = createCarEditModeController({
    camera,
    car,
    canvas: renderer.domElement,
    getEditableParts: getRuntimeEditableParts,
    prepareEditablePartsForEditMode() {
        setAllPlayerCarPartsVisibility?.(true);
    },
    setEditablePartVisibility: setRuntimeEditablePartVisibility,
    setAllEditablePartsVisibility: setAllRuntimeEditablePartsVisibility,
    captureEditablePartVisibility: captureRuntimeEditablePartVisibility,
    restoreEditablePartVisibility: restoreRuntimeEditablePartVisibility,
    onEditModeChanged(isActive) {
        setCameraKeyboardControlsEnabled(!isActive);
        runtimeState.gameSessionController?.clearDriveKeys();
        groundLayerDebugController?.setEditModeActive?.(isActive);
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
    getBillboardContentGroups,
    onUploadBillboardGroupMedia: uploadBillboardGroupFiles,
    onResetBillboardGroupMedia: resetBillboardGroupContent,
    onSetBillboardGroupPlaybackEnabled(groupId, enabled) {
        return setBillboardGroupPlaybackEnabled(groupId, enabled);
    },
});

function getRuntimeEditableParts() {
    const carParts = Array.isArray(getPlayerCarEditableParts?.())
        ? getPlayerCarEditableParts()
        : [];
    const sceneParts = Array.from(sceneEditModePartDescriptors.values()).map((descriptor) => ({
        id: descriptor.id,
        label: descriptor.label,
        category: descriptor.category,
        visible: isSceneEditModePartVisible(descriptor),
    }));
    return [...carParts, ...sceneParts];
}

function setRuntimeEditablePartVisibility(partId, isVisible) {
    if (setPlayerCarPartVisibility?.(partId, isVisible)) {
        return true;
    }
    const descriptor = sceneEditModePartDescriptors.get(partId);
    if (!descriptor) {
        return false;
    }
    setSceneEditModePartVisibility(descriptor, isVisible);
    return true;
}

function setAllRuntimeEditablePartsVisibility(isVisible) {
    setAllPlayerCarPartsVisibility?.(isVisible);
    sceneEditModePartDescriptors.forEach((descriptor) => {
        setSceneEditModePartVisibility(descriptor, isVisible);
    });
}

function captureRuntimeEditablePartVisibility() {
    return {
        ...(capturePlayerCarPartVisibility?.() || {}),
    };
}

function restoreRuntimeEditablePartVisibility(snapshot = null) {
    restorePlayerCarPartVisibility?.(snapshot);
}

function collectSceneEditModePartDescriptors(root) {
    const descriptors = new Map();
    root?.traverse?.((object) => {
        const partId = String(object?.userData?.editModePartId || '').trim();
        if (!partId) {
            return;
        }
        const label = String(object.userData.editModePartLabel || partId).trim() || partId;
        const category = String(object.userData.editModePartCategory || 'Scene').trim() || 'Scene';
        const existing = descriptors.get(partId);
        if (existing) {
            existing.sources.push(object);
            return;
        }
        descriptors.set(partId, {
            id: partId,
            label,
            category,
            sources: [object],
        });
    });
    return descriptors;
}

function isSceneEditModePartVisible(descriptor) {
    return Array.isArray(descriptor?.sources)
        ? descriptor.sources.some((source) => source?.visible !== false)
        : false;
}

function setSceneEditModePartVisibility(descriptor, isVisible) {
    const nextVisible = Boolean(isVisible);
    if (!Array.isArray(descriptor?.sources)) {
        return;
    }
    descriptor.sources.forEach((source) => {
        if (source) {
            source.visible = nextVisible;
        }
    });
}
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
const starsController = addStars(scene, camera);
const SHOW_ONLY_LOCAL_SCORE_POPUPS = true;
const FAR_MINE_KILL_UI_DEFER_DISTANCE_SQ = BOT_MINE_DEBRIS_MID_DISTANCE_SQ;
const DEFERRED_MINE_KILL_UI_QUEUE_MAX = 24;
const DEFERRED_MINE_KILL_UI_TASKS_PER_FRAME = 1;
const DEFERRED_MINE_KILL_UI_BASE_DELAY_FRAMES = 1;
const DEFERRED_MINE_KILL_UI_POPUP_DELAY_FRAMES = 1;
const DEFERRED_MINE_KILL_UI_INFO_DELAY_FRAMES = 2;
const DEFERRED_MINE_KILL_UI_TASK_MAX_AGE_MS = 1800;
const deferredMineKillUiTasks = [];
let deferredMineKillUiRafHandle = null;
let deferredMineKillUiFrameTick = 0;
let deferredMineKillUiDroppedCount = 0;
let deferredMineKillUiExecutedCount = 0;
let mineKillUiFlowPrewarmed = false;

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

function spawnScorePopup({ collectorId = 'player', pointsAwarded = 0, sourceLabel = '' } = {}) {
    const awarded = Math.max(0, Math.round(Number(pointsAwarded) || 0));
    if (awarded <= 0) {
        return;
    }
    if (SHOW_ONLY_LOCAL_SCORE_POPUPS && !isLocalCollectorId(collectorId)) {
        return;
    }
    if (runtimeState.gameMode === 'bots' && isLocalCollectorId(collectorId)) {
        return;
    }
    runtimeState.scorePopupController?.prewarm?.();
    runtimeState.scorePopupController?.spawn?.({
        collectorId,
        pointsAwarded: awarded,
        sourceLabel,
        resolveWorldPosition: () => resolveCollectorWorldPosition(collectorId),
        worldPosition: resolveCollectorWorldPosition(collectorId),
    });
}

function prewarmMineKillUiFlow() {
    if (mineKillUiFlowPrewarmed) {
        return true;
    }
    const popupPrewarmed = runtimeState.scorePopupController?.prewarm?.() !== false;
    mineKillUiFlowPrewarmed = Boolean(popupPrewarmed);
    return mineKillUiFlowPrewarmed;
}

function queueDeferredMineKillUiTask(taskHandler = null, options = {}) {
    if (typeof taskHandler !== 'function') {
        return false;
    }
    const delayFrames = THREE.MathUtils.clamp(
        Math.round(Number(options?.delayFrames) || DEFERRED_MINE_KILL_UI_BASE_DELAY_FRAMES),
        0,
        8
    );
    const label =
        typeof options?.label === 'string' && options.label.trim()
            ? options.label.trim()
            : 'mine_kill_ui_task';
    if (deferredMineKillUiTasks.length >= DEFERRED_MINE_KILL_UI_QUEUE_MAX) {
        deferredMineKillUiTasks.shift();
        deferredMineKillUiDroppedCount += 1;
    }
    deferredMineKillUiTasks.push({
        taskHandler,
        dueFrame: deferredMineKillUiFrameTick + delayFrames,
        queuedAtMs: performance.now(),
        label,
    });
    ensureDeferredMineKillUiTaskPump();
    return true;
}

function ensureDeferredMineKillUiTaskPump() {
    if (deferredMineKillUiRafHandle != null) {
        return;
    }
    deferredMineKillUiRafHandle = window.requestAnimationFrame(processDeferredMineKillUiTasksFrame);
}

function processDeferredMineKillUiTasksFrame() {
    deferredMineKillUiRafHandle = null;
    deferredMineKillUiFrameTick += 1;
    const nowMs = performance.now();
    let processed = 0;
    let index = 0;
    while (
        index < deferredMineKillUiTasks.length &&
        processed < DEFERRED_MINE_KILL_UI_TASKS_PER_FRAME
    ) {
        const task = deferredMineKillUiTasks[index];
        if (!task || typeof task.taskHandler !== 'function') {
            deferredMineKillUiTasks.splice(index, 1);
            deferredMineKillUiDroppedCount += 1;
            continue;
        }
        if ((Number(task.dueFrame) || 0) > deferredMineKillUiFrameTick) {
            index += 1;
            continue;
        }
        const ageMs = Math.max(0, nowMs - (Number(task.queuedAtMs) || nowMs));
        if (
            ageMs > DEFERRED_MINE_KILL_UI_TASK_MAX_AGE_MS ||
            runtimeState.pickupRoundFinished ||
            runtimeState.isWelcomeModalVisible
        ) {
            deferredMineKillUiTasks.splice(index, 1);
            deferredMineKillUiDroppedCount += 1;
            continue;
        }
        try {
            task.taskHandler();
            deferredMineKillUiExecutedCount += 1;
        } catch (error) {
            console.error('Deferred mine kill UI task failed:', error);
            deferredMineKillUiDroppedCount += 1;
        }
        deferredMineKillUiTasks.splice(index, 1);
        processed += 1;
    }
    if (deferredMineKillUiTasks.length > 0) {
        ensureDeferredMineKillUiTaskPump();
    }
}

function clearDeferredMineKillUiTasks({ resetCounters = false } = {}) {
    if (deferredMineKillUiRafHandle != null) {
        window.cancelAnimationFrame(deferredMineKillUiRafHandle);
    }
    deferredMineKillUiRafHandle = null;
    deferredMineKillUiTasks.length = 0;
    deferredMineKillUiFrameTick = 0;
    if (resetCounters) {
        deferredMineKillUiDroppedCount = 0;
        deferredMineKillUiExecutedCount = 0;
    }
}

function isLocalCollectorId(collectorId) {
    if (collectorId === 'player') {
        return true;
    }
    const selfOnlineId = runtimeState.multiplayerController?.getSelfId?.() || '';
    return Boolean(selfOnlineId && collectorId === selfOnlineId);
}

function recordPerformanceDiagnosticEvent(type = '', payload = null, options = null) {
    if (typeof performanceDiagnosticsController?.recordEvent !== 'function') {
        return null;
    }
    return performanceDiagnosticsController.recordEvent(type, payload, options);
}

function serializeEventPosition(position = null) {
    const x = Number(position?.x);
    const y = Number(position?.y);
    const z = Number(position?.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return null;
    }
    return {
        x: Number(x.toFixed(3)),
        y: Number(y.toFixed(3)),
        z: Number(z.toFixed(3)),
    };
}

function buildPickupStatusContext(pointsAwarded, scoring) {
    return {
        batteryPercent: Math.round(runtimeState.playerBattery),
        pointsAwarded: Math.max(0, Math.round(Number(pointsAwarded) || 0)),
        sourceLabel:
            typeof scoring?.label === 'string' && scoring.label.trim()
                ? scoring.label.trim()
                : 'Pickup',
    };
}

function getObjectiveRoundProgress(options = null) {
    if (runtimeState.gameMode === 'bots') {
        const missionProgress = runtimeState.botsMissionDirector?.getScoreProgress?.(options);
        if (Number.isFinite(missionProgress)) {
            return THREE.MathUtils.clamp(Number(missionProgress) || 0, 0, 1);
        }
    }
    return THREE.MathUtils.clamp(
        runtimeState.totalCollectedCount / Math.max(1, ROUND_TOTAL_PICKUPS),
        0,
        1
    );
}

function buildCurrentPlayerHudState() {
    if (runtimeState.gameMode !== 'bots') {
        return null;
    }
    return {
        name: 'YOU',
        targetLabel: 'PLAYER',
        showSwatch: false,
        score: Math.max(0, Math.round(Number(runtimeState.playerScore) || 0)),
        collectedCount: Math.max(0, Math.round(Number(runtimeState.playerCollectedCount) || 0)),
        livesRemaining: Math.max(0, Math.round(Number(runtimeState.playerCarsRemaining) || 0)),
        maxLives: PLAYER_CAR_POOL_SIZE,
        respawning: Boolean(runtimeState.isCarDestroyed && runtimeState.playerCarsRemaining > 0),
        respawnMsRemaining: 0,
        isPlayer: true,
    };
}

function renderBotsHud() {
    botStatusUi.render(EMPTY_ARRAY, buildCurrentPlayerHudState());
}

function primeCollectiblesForMissionCollectors() {
    runtimeState.collectibleSystem?.primeForCollectors?.([
        { id: 'player', position: car.position },
    ]);
}

function resetMissionCollectorChains() {
    runtimeState.scoringSystem?.resetCollectorCombo?.('player');
    runtimeState.scoringSystem?.resetCollectorMineChain?.('player');
    const botEntries = runtimeState.botTrafficSystem?.getHudState?.() || EMPTY_ARRAY;
    for (let i = 0; i < botEntries.length; i += 1) {
        const collectorId =
            typeof botEntries[i]?.collectorId === 'string' ? botEntries[i].collectorId : '';
        if (!collectorId) {
            continue;
        }
        runtimeState.scoringSystem?.resetCollectorCombo?.(collectorId);
        runtimeState.scoringSystem?.resetCollectorMineChain?.(collectorId);
    }
}

function prepareBotsMissionEnvironment(mission = null) {
    if (!mission || typeof mission !== 'object') {
        return;
    }

    clearDeferredMineKillUiTasks();
    runtimeState.gameSessionController?.clearPendingRespawn?.();
    runtimeState.gameSessionController?.clearDriveKeys?.();
    runtimeState.scorePopupController?.clear?.();
    runtimeState.crashDebrisController?.clearDebris?.();
    runtimeState.crashDebrisController?.resetPlayerDamageState?.();
    runtimeState.mineController?.resetRoundInventory?.();
    runtimeState.mineController?.clearAll?.();
    runtimeState.weaponSystem?.setTriggerHeld?.(false);
    runtimeState.weaponSystem?.resetRound?.();

    const nextSpawnState = resolveRandomPlayerSpawnState();
    if (nextSpawnState?.position) {
        playerSpawnState.position.copy(nextSpawnState.position);
        if (Number.isFinite(nextSpawnState.rotationY)) {
            playerSpawnState.rotationY = nextSpawnState.rotationY;
        }
    }

    runtimeState.isCarDestroyed = false;
    car.visible = true;
    car.position.copy(playerSpawnState.position);
    car.position.y = getGroundHeightAt(car.position.x, car.position.z) + PLAYER_RIDE_HEIGHT;
    car.rotation.set(0, playerSpawnState.rotationY, 0);
    chargingZoneController.reset();
    chargingProgressHudController.reset();
    skidMarkController.reset?.();
    runtimeState.playerBattery = BATTERY_MAX;
    setPlayerBatteryLevel(1);
    setPlayerBatteryDepleted(false);
    runtimeState.isBatteryDepleted = false;
    runtimeState.gameSessionController?.setBatteryDepletedState?.(false, { showStatus: false });
    initializePlayerPhysics(car);
    runtimeState.physicsAccumulator = 0;
    runtimeState.collectibleSystem?.reset?.({
        seedOffset: Math.floor(Math.random() * 0x7fffffff),
        finiteTotalPickups: mission.pickupPool,
        maxActivePickups: mission.maxActivePickups,
    });
    runtimeState.collectibleSystem?.setEnabled?.(true);
    runtimeState.botTrafficSystem?.setEnabled?.(true);
    runtimeState.botTrafficSystem?.reset?.({
        sharedTargetColorHex: SHARED_PICKUP_COLOR_HEX,
        activeBotCount: Math.min(
            Math.max(0, Math.round(Number(mission.botCount) || 0)),
            Math.max(0, Math.round(Number(mission.eliminationTarget) || 0))
        ),
        resetCollectedCount: false,
        resetLives: true,
        respawnProtectionMs: 0,
    });
    runtimeState.pickupRoundFinished = false;
    primeCollectiblesForMissionCollectors();
    resetMissionCollectorChains();
    renderBotsHud();
    runtimeState.weaponSystem?.grantWeapon?.();
}

function setBotsMissionTransitionLocked(nextLocked = true) {
    const locked = Boolean(nextLocked);
    runtimeState.gameSessionController?.clearDriveKeys?.();
    runtimeState.collectibleSystem?.setEnabled?.(!locked);
    runtimeState.botTrafficSystem?.setEnabled?.(!locked && runtimeState.gameMode === 'bots');
    runtimeState.weaponSystem?.setTriggerHeld?.(false);
}

function finalizeBotsCampaign(result = {}) {
    runtimeState.gameSessionController?.clearDriveKeys?.();
    runtimeState.weaponSystem?.setTriggerHeld?.(false);
    runtimeState.botTrafficSystem?.setEnabled?.(runtimeState.gameMode === 'bots');
    renderBotsHud();
    runtimeState.gameSessionController?.finalizePickupRound?.(
        Math.max(0, Math.round(Number(result?.totalPickups) || 0)),
        Math.max(0, Math.round(Number(result?.totalCollected) || 0)),
        {
            titleText: result?.titleText || '',
            summaryText: result?.summaryText || '',
            finishLabel: result?.finishLabel || '',
            finishReason: result?.finishReason || '',
            totalScore: Math.max(0, Math.round(Number(result?.totalScore) || 0)),
            deferUiFrames: 2,
        }
    );
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
    };
}

function isFiniteVector3Like(value = null) {
    return Number.isFinite(value?.x) && Number.isFinite(value?.y) && Number.isFinite(value?.z);
}

function isFiniteEulerLike(value = null) {
    return Number.isFinite(value?.x) && Number.isFinite(value?.y) && Number.isFinite(value?.z);
}

function isMainCameraStateRenderable() {
    return (
        Boolean(camera?.isCamera) &&
        isFiniteVector3Like(camera.position) &&
        Number.isFinite(camera.aspect) &&
        camera.aspect > 0 &&
        Number.isFinite(camera.fov) &&
        camera.fov > 0 &&
        Number.isFinite(camera.near) &&
        Number.isFinite(camera.far) &&
        camera.far > camera.near
    );
}

function isRendererContextLost() {
    try {
        const context = renderer?.getContext?.();
        return Boolean(
            context && typeof context.isContextLost === 'function' && context.isContextLost()
        );
    } catch {
        return false;
    }
}

function resolveSafePlayerPose() {
    const fallbackX = Number.isFinite(playerSpawnState?.position?.x)
        ? playerSpawnState.position.x
        : 0;
    const fallbackZ = Number.isFinite(playerSpawnState?.position?.z)
        ? playerSpawnState.position.z
        : 0;
    const safeX = Number.isFinite(car.position?.x) ? car.position.x : fallbackX;
    const safeZ = Number.isFinite(car.position?.z) ? car.position.z : fallbackZ;
    const safeGroundY = getGroundHeightAt(safeX, safeZ) + PLAYER_RIDE_HEIGHT;
    return {
        x: safeX,
        y: safeGroundY,
        z: safeZ,
        rotationY: Number.isFinite(car.rotation?.y)
            ? car.rotation.y
            : Number.isFinite(playerSpawnState?.rotationY)
              ? playerSpawnState.rotationY
              : 0,
    };
}

function restoreMainCameraToSafePose(targetPose = resolveSafePlayerPose()) {
    const pose =
        targetPose && typeof targetPose === 'object' ? targetPose : resolveSafePlayerPose();
    camera.position.set(pose.x, pose.y + 3.2, pose.z + 8.4);
    camera.up.set(0, 1, 0);
    camera.lookAt(pose.x, pose.y + 1.1, pose.z);
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    resetCameraTrackingState();
}

function repairRuntimeSceneState(reason = 'unknown') {
    let repairedPlayerPose = false;
    let repairedCamera = false;

    if (!isFiniteVector3Like(car.position) || !isFiniteEulerLike(car.rotation)) {
        car.position.copy(playerSpawnState.position);
        car.position.y = getGroundHeightAt(car.position.x, car.position.z) + PLAYER_RIDE_HEIGHT;
        car.rotation.set(0, playerSpawnState.rotationY, 0);
        initializePlayerPhysics(car);
        runtimeState.physicsAccumulator = 0;
        repairedPlayerPose = true;
    }

    if (!isMainCameraStateRenderable()) {
        restoreMainCameraToSafePose(resolveSafePlayerPose());
        repairedCamera = true;
    }

    if (!repairedPlayerPose && !repairedCamera) {
        return false;
    }

    const nowMs = performance.now();
    if (nowMs - runtimeSceneRepairLastStatusAtMs >= RUNTIME_SCENE_REPAIR_STATUS_COOLDOWN_MS) {
        objectiveUi.showInfo('Scene state recovered after a graphics fault.', 2200);
        runtimeSceneRepairLastStatusAtMs = nowMs;
    }

    recordPerformanceDiagnosticEvent('runtime_scene_state_repaired', {
        reason,
        repairedPlayerPose,
        repairedCamera,
        isCarDestroyed: Boolean(runtimeState.isCarDestroyed),
        gameMode: runtimeState.gameMode,
    });
    return true;
}

async function requestRuntimeGraphicsRecovery(reason = 'render-failure', options = {}) {
    const force = Boolean(options?.force);
    const nowMs = performance.now();
    if (
        !force &&
        runtimeGraphicsRecoveryPromise == null &&
        nowMs - runtimeGraphicsLastRecoveryRequestAtMs <
            RUNTIME_GRAPHICS_RECOVERY_REQUEST_COOLDOWN_MS
    ) {
        return false;
    }

    if (runtimeGraphicsRecoveryPromise) {
        return runtimeGraphicsRecoveryPromise;
    }

    runtimeGraphicsLastRecoveryRequestAtMs = nowMs;
    if (nowMs - runtimeGraphicsLastStatusAtMs >= RUNTIME_GRAPHICS_RECOVERY_STATUS_COOLDOWN_MS) {
        objectiveUi.showInfo('Graphics fault detected. Attempting recovery...', 2200);
        runtimeGraphicsLastStatusAtMs = nowMs;
    }

    runtimeGraphicsRecoveryPromise = (async () => {
        try {
            if (isRendererContextLost()) {
                return false;
            }

            runtimeGraphicsWarmupReady = false;
            repairRuntimeSceneState(`${reason}:preflight`);
            ensureWorldBuilt();
            applyRendererSettings(renderer, { renderSettings });
            await waitForAnimationFrames(2);
            const recovered = await prepareGraphicsForSessionStart(runtimeState.gameMode, {
                reportProgress() {},
            });
            if (recovered !== false) {
                objectiveUi.showInfo('Graphics recovered.', 1600);
            } else {
                objectiveUi.showInfo(
                    'Graphics recovery is incomplete. Reload if the scene stays blank.',
                    2600
                );
            }
            recordPerformanceDiagnosticEvent('runtime_graphics_recovered', {
                reason,
                contextLossCount: runtimeGraphicsContextLossCount,
                gameMode: runtimeState.gameMode,
                recovered: recovered !== false,
            });
            return recovered !== false;
        } catch (error) {
            const message =
                typeof error?.message === 'string' && error.message.trim()
                    ? error.message.trim()
                    : 'Unknown graphics recovery failure';
            objectiveUi.showInfo(
                'Graphics recovery failed. Reload if the scene stays blank.',
                2800
            );
            recordPerformanceDiagnosticEvent('runtime_graphics_recovery_failed', {
                reason,
                message,
                contextLossCount: runtimeGraphicsContextLossCount,
                gameMode: runtimeState.gameMode,
            });
            console.error('Graphics recovery failed:', error);
            return false;
        } finally {
            runtimeGraphicsRecoveryPromise = null;
        }
    })();

    return runtimeGraphicsRecoveryPromise;
}

function handleRuntimeRenderFailure(reason = 'render-failure', error = null) {
    const contextLost = isRendererContextLost();
    repairRuntimeSceneState(`${reason}:repair`);

    const message =
        typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : '';
    recordPerformanceDiagnosticEvent('runtime_render_failure', {
        reason,
        message,
        contextLost,
        contextLossCount: runtimeGraphicsContextLossCount,
        gameMode: runtimeState.gameMode,
    });

    if (contextLost) {
        return false;
    }

    void requestRuntimeGraphicsRecovery(reason);
    return false;
}

function installRuntimeGraphicsRecoveryGuards() {
    const canvas = renderer?.domElement;
    if (!canvas || canvas.dataset.runtimeGraphicsGuardInstalled === 'true') {
        return;
    }

    canvas.dataset.runtimeGraphicsGuardInstalled = 'true';

    const originalRender = renderer.render.bind(renderer);
    renderer.render = (sceneArg, cameraArg) => {
        if (isRendererContextLost()) {
            handleRuntimeRenderFailure('context-lost-render-skip');
            return;
        }

        repairRuntimeSceneState('pre-render');

        try {
            originalRender(sceneArg, cameraArg);
        } catch (error) {
            handleRuntimeRenderFailure('renderer.render', error);
        }
    };

    canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        runtimeGraphicsContextLossCount += 1;
        recordPerformanceDiagnosticEvent('webgl_context_lost', {
            contextLossCount: runtimeGraphicsContextLossCount,
            gameMode: runtimeState.gameMode,
        });
        if (
            performance.now() - runtimeGraphicsLastStatusAtMs >=
            RUNTIME_GRAPHICS_RECOVERY_STATUS_COOLDOWN_MS
        ) {
            objectiveUi.showInfo('Graphics context lost. Waiting for browser restore...', 2600);
            runtimeGraphicsLastStatusAtMs = performance.now();
        }
    });

    canvas.addEventListener('webglcontextrestored', () => {
        recordPerformanceDiagnosticEvent('webgl_context_restored', {
            contextLossCount: runtimeGraphicsContextLossCount,
            gameMode: runtimeState.gameMode,
        });
        void requestRuntimeGraphicsRecovery('webgl-context-restored', {
            force: true,
        });
    });

    canvas.addEventListener('webglcontextcreationerror', (event) => {
        const message =
            typeof event?.statusMessage === 'string' && event.statusMessage.trim()
                ? event.statusMessage.trim()
                : 'WebGL context creation failed';
        objectiveUi.showInfo('Graphics startup failed. Reload the page.', 3200);
        recordPerformanceDiagnosticEvent('webgl_context_creation_error', {
            message,
            gameMode: runtimeState.gameMode,
        });
        console.error('WebGL context creation failed:', message);
    });
}

function awardLocalMineKillScore({ ownerCollectorId = '', targetCollectorId = '' } = {}) {
    const collectorId = resolveMineOwnerCollectorId(ownerCollectorId);
    if (!collectorId) {
        return null;
    }
    const targetId = typeof targetCollectorId === 'string' ? targetCollectorId.trim() : '';
    const roundProgress = getObjectiveRoundProgress();
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

function handleVehicleWeaponBotDestroyed({
    targetCollectorId = '',
    targetName = '',
    position = null,
} = {}) {
    if (runtimeState.gameMode !== 'bots') {
        return;
    }

    const mineScoreEvent = awardLocalMineKillScore({
        ownerCollectorId: 'player',
        targetCollectorId,
    });
    const pointsAwarded = Math.max(0, Math.round(Number(mineScoreEvent?.pointsAwarded) || 0));
    const resolvedTargetName =
        typeof targetName === 'string' && targetName.trim() ? targetName.trim() : 'Target';

    recordPerformanceDiagnosticEvent('bot_weapon_destroyed', {
        targetCollectorId: typeof targetCollectorId === 'string' ? targetCollectorId.trim() : '',
        targetName: resolvedTargetName,
        pointsAwarded,
        position: serializeEventPosition(position),
        totalScore: runtimeState.totalScore,
    });

    if (pointsAwarded > 0) {
        spawnScorePopup({
            collectorId: 'player',
            pointsAwarded,
            sourceLabel: 'BOT KO',
        });
        objectiveUi.showInfo(`${resolvedTargetName} out: +${pointsAwarded} pts.`, 1450);
        return;
    }

    objectiveUi.showInfo(`${resolvedTargetName} neutralized.`, 1200);
}

const collectibleSystem = createCollectibleSystem(scene, worldBounds, {
    onTargetColorChanged: ({ targetColorHex }) => {
        objectiveUi.setTargetColor(targetColorHex);
        runtimeState.botTrafficSystem?.setSharedTargetColor(targetColorHex);
    },
    onCorrectPickup: ({
        pickupId,
        pickupColorHex,
        collectorId,
        position,
        confirmCollection,
        restoreCollection,
    }) => {
        recordPerformanceDiagnosticEvent('pickup_collected', {
            gameMode: runtimeState.gameMode,
            collectorId,
            localCollector: isLocalCollectorId(collectorId),
            pickupId: typeof pickupId === 'string' ? pickupId : '',
            pickupColorHex,
            position: serializeEventPosition(position),
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
                            restoreCollection?.();
                            return;
                        }
                        confirmCollection?.();
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
                        recordPerformanceDiagnosticEvent('pickup_scored_online', {
                            collectorId: 'player',
                            pointsAwarded: Math.max(
                                0,
                                Math.round(Number(response?.pointsAwarded) || 0)
                            ),
                            totalScore: runtimeState.totalScore,
                        });
                        spawnScorePopup({
                            collectorId: 'player',
                            pointsAwarded: response.pointsAwarded,
                            sourceLabel: 'PICKUP',
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
                return {
                    deferred: true,
                };
            }

            confirmCollection?.();
            const nextTotalCollected = runtimeState.totalCollectedCount + 1;
            const roundProgress = getObjectiveRoundProgress({
                additionalPlayerPickups: 1,
            });
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
            recordPerformanceDiagnosticEvent('pickup_scored_local', {
                collectorId: 'player',
                pointsAwarded: Math.max(0, Math.round(Number(scoreEvent?.pointsAwarded) || 0)),
                totalScore: runtimeState.totalScore,
                playerScore: runtimeState.playerScore,
                totalCollectedCount: runtimeState.totalCollectedCount,
            });
            spawnScorePopup({
                collectorId: 'player',
                pointsAwarded: scoreEvent?.pointsAwarded || 0,
                sourceLabel: 'PICKUP',
            });
            objectiveUi.flashCorrect(
                pickupColorHex,
                buildPickupStatusContext(scoreEvent?.pointsAwarded || 0, scoreEvent?.scoring)
            );
            runtimeState.botsMissionDirector?.handlePickupCollected?.({
                collectorId: 'player',
            });
            if (runtimeState.gameMode === 'bots') {
                renderBotsHud();
            }
            return;
        }
        if (runtimeState.gameMode === 'bots') {
            restoreCollection?.();
            recordPerformanceDiagnosticEvent('pickup_rejected_non_player_bots_mode', {
                collectorId,
                pickupId: typeof pickupId === 'string' ? pickupId : '',
                pickupColorHex,
                position: serializeEventPosition(position),
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
        recordPerformanceDiagnosticEvent('round_pickups_exhausted', {
            totalPickups: Math.max(0, Math.round(Number(totalPickups) || 0)),
            collectedPickups: Math.max(0, Math.round(Number(collectedPickups) || 0)),
            totalScore: runtimeState.totalScore,
            gameMode: runtimeState.gameMode,
        });
        if (runtimeState.gameMode === 'bots') {
            runtimeState.botsMissionDirector?.handlePickupsExhausted?.({
                totalPickups,
                collectedPickups,
            });
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
    botCount: getBotsMissionMaxBotCount(),
    sharedTargetColorHex: SHARED_PICKUP_COLOR_HEX,
    getGroundHeightAt,
    cityMapLayout,
    onBotDestroyed(botEvent = null) {
        recordPerformanceDiagnosticEvent('bot_destroyed', {
            collectorId: typeof botEvent?.collectorId === 'string' ? botEvent.collectorId : '',
            name: typeof botEvent?.name === 'string' ? botEvent.name : '',
            position: serializeEventPosition(botEvent?.position),
        });
        runtimeState.botsMissionDirector?.handleBotDestroyed?.(botEvent);
        renderBotsHud();
    },
});
runtimeState.weaponSystem = createVehicleWeaponSystem({
    scene,
    camera,
    car,
    getGroundHeightAt,
    getBotTrafficSystem: () => runtimeState.botTrafficSystem,
    getGameMode: () => runtimeState.gameMode,
    getIsMultiplayerActive: () =>
        runtimeState.gameMode === 'online' &&
        Boolean(runtimeState.multiplayerController?.isInRoom?.()),
    getVehicleState,
    getStaticObstacles: () => staticObstacles,
    getAudioController: () => runtimeState.audioController,
    reportWeaponPickupCollected(payload = null, ack = null) {
        return runtimeState.multiplayerController?.reportWeaponPickupCollected?.(payload, ack);
    },
    onStatus(messageText, timeoutMs = 2000) {
        objectiveUi.showInfo(messageText, timeoutMs);
    },
    onCombatLoadoutChanged() {
        controlsHelpUi?.refreshCombatLoadout?.();
    },
    onShotFired(shotEvent = null) {
        runtimeState.multiplayerController?.reportWeaponShot?.(shotEvent);
    },
    onBotDestroyed(event = null) {
        handleVehicleWeaponBotDestroyed(event || null);
    },
    onPlayerHit(event = null) {
        if (runtimeState.gameMode !== 'bots') {
            return { destroyed: false };
        }
        const shooterName =
            typeof event?.shooterName === 'string' && event.shooterName.trim()
                ? event.shooterName.trim()
                : 'VX-9 hunter';
        const shotDirection = event?.shotDirection || null;
        const impactNormal =
            shotDirection && Number.isFinite(shotDirection.x) && Number.isFinite(shotDirection.z)
                ? new THREE.Vector3(-shotDirection.x, 0, -shotDirection.z).normalize()
                : null;
        runtimeState.gameSessionController?.triggerCarExplosion?.(
            event?.position || car.position,
            0xff8d66,
            0xff4f4f,
            {
                statusText: `${shooterName} destroyed you with VX-9 fire.`,
                collision: {
                    obstacleCategory: 'vx9_hunter',
                    impactSpeed: 52,
                    impactNormal,
                },
            }
        );
        return {
            destroyed: Boolean(runtimeState.isCarDestroyed),
        };
    },
});
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
const mineOtherVehicleTargetsBuffer = [];
const lorienDoorCollisionObstacleBuffer = [];
runtimeState.mineController = createMineSystemController({
    scene,
    car,
    getGroundHeightAt,
    staticObstacles,
    resolveThrownMineSpecialImpact(trace) {
        const buildingLayer = ensureWorldBuilt().cityScenery.userData?.buildingLayer || null;
        return resolveLorienVelmoreMineBarrierImpact(buildingLayer, trace);
    },
    getVehicleState,
    getOtherVehicleTargets: () => {
        if (runtimeState.gameMode !== 'bots') {
            mineOtherVehicleTargetsBuffer.length = 0;
            return mineOtherVehicleTargetsBuffer;
        }
        const descriptors =
            runtimeState.botTrafficSystem?.getCollectorDescriptors?.() || EMPTY_ARRAY;
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
        recordPerformanceDiagnosticEvent('mine_deployed', {
            gameMode: runtimeState.gameMode,
            ownerCollectorId,
            mineId: typeof mineSnapshot?.mineId === 'string' ? mineSnapshot.mineId : '',
            thrown: mode === 'throw' || Boolean(mineSnapshot?.thrown),
            mode: typeof mode === 'string' ? mode : '',
            position: serializeEventPosition(mineSnapshot?.position),
        });
        runtimeState.audioController?.onMineDeployed?.({
            thrown: mode === 'throw' || Boolean(mineSnapshot?.thrown),
        });
        controlsHelpUi?.refreshMineInventory?.();
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
        const buildingLayer = ensureWorldBuilt().cityScenery.userData?.buildingLayer || null;
        applyLorienVelmoreMineDetonation(buildingLayer, position);
        const distanceMeters = position?.distanceTo?.(car.position) || 0;
        runtimeState.audioController?.onMineDetonated?.({
            localHit: Boolean(localHit),
            distanceMeters,
            position,
        });
        const ownerCollectorId = resolveMineOwnerCollectorId(ownerId);
        const targetCollectorId = normalizeOptionalScoreAuditCollectorId(targetPlayerId);
        recordPerformanceDiagnosticEvent('mine_detonated', {
            gameMode: runtimeState.gameMode,
            mineId: typeof mineId === 'string' ? mineId : '',
            ownerCollectorId,
            targetCollectorId,
            localHit: Boolean(localHit),
            distanceMeters: Number.isFinite(distanceMeters) ? Number(distanceMeters.toFixed(2)) : 0,
            position: serializeEventPosition(position),
            ownerPointsAwarded: Math.max(0, Math.round(Number(ownerPointsAwarded) || 0)),
        });
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
            sourceLabel: 'MINE KILL',
        });
        objectiveUi.showInfo(`Mine kill +${pointsAwarded} pts.`, 1400);
    },
    onLocalMineHit({ position, ownerName }) {
        if (runtimeState.isCarDestroyed || runtimeState.pickupRoundFinished) {
            return;
        }
        const ownerLabel = ownerName ? `${ownerName}'s` : "an opponent's";
        recordPerformanceDiagnosticEvent('player_mine_hit', {
            ownerName: typeof ownerName === 'string' ? ownerName : '',
            gameMode: runtimeState.gameMode,
            position: serializeEventPosition(position),
        });
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
        recordPerformanceDiagnosticEvent('bot_mine_hit', {
            targetCollectorId: typeof target?.id === 'string' ? target.id : '',
            targetLabel: typeof target?.label === 'string' ? target.label : '',
            ownerCollectorId: resolveMineOwnerCollectorId(ownerId),
            gameMode: runtimeState.gameMode,
            destroyed: Boolean(destroyed),
            position: serializeEventPosition(position),
            playerDistanceSq: hasDistance ? Number(distanceSq.toFixed(2)) : null,
            debrisSpawnBudget,
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
            const shouldDeferMineKillUi =
                ownerCollectorId === 'player' &&
                hasDistance &&
                distanceSq > FAR_MINE_KILL_UI_DEFER_DISTANCE_SQ;
            if (shouldDeferMineKillUi) {
                prewarmMineKillUiFlow();
            }
            if (pointsAwarded > 0) {
                const popupPayload = {
                    collectorId: ownerCollectorId,
                    pointsAwarded,
                    sourceLabel: 'MINE KILL',
                };
                if (shouldDeferMineKillUi) {
                    queueDeferredMineKillUiTask(
                        () => {
                            spawnScorePopup(popupPayload);
                        },
                        {
                            delayFrames: DEFERRED_MINE_KILL_UI_POPUP_DELAY_FRAMES,
                            label: 'mine_kill_popup',
                        }
                    );
                } else {
                    spawnScorePopup(popupPayload);
                }
            }
            if (ownerCollectorId === 'player' && pointsAwarded > 0) {
                const statusMessage = `${target.label || target.id} out: +${pointsAwarded} pts.`;
                if (shouldDeferMineKillUi) {
                    queueDeferredMineKillUiTask(
                        () => {
                            objectiveUi.showInfo(statusMessage, 1500);
                        },
                        {
                            delayFrames: DEFERRED_MINE_KILL_UI_INFO_DELAY_FRAMES,
                            label: 'mine_kill_status',
                        }
                    );
                    recordPerformanceDiagnosticEvent('mine_kill_ui_deferred', {
                        gameMode: runtimeState.gameMode,
                        ownerCollectorId,
                        targetCollectorId,
                        pointsAwarded,
                        playerDistanceSq: Number(distanceSq.toFixed(2)),
                        pendingTasks: deferredMineKillUiTasks.length,
                    });
                } else {
                    objectiveUi.showInfo(statusMessage, 1500);
                }
            } else if (!hasDistance || distanceSq <= BOT_MINE_DEBRIS_MID_DISTANCE_SQ) {
                objectiveUi.showInfo(`Mine hit ${target.label || target.id}.`, 1400);
            }
            recordPerformanceDiagnosticEvent('bot_destroyed_by_mine', {
                targetCollectorId,
                ownerCollectorId,
                pointsAwarded,
                gameMode: runtimeState.gameMode,
                position: serializeEventPosition(position),
                uiDeferred: shouldDeferMineKillUi,
                playerDistanceSq: hasDistance ? Number(distanceSq.toFixed(2)) : null,
            });
        }
    },
});
runtimeState.multiplayerController = createMultiplayerController({
    scene,
    car,
    getVehicleState,
    getInputState: () => keys,
    getCrashReplicationState: () => runtimeState.crashDebrisController?.getReplicationState?.(),
    getWeaponReplicationState: () => runtimeState.weaponSystem?.getReplicationState?.(),
    getGroundHeightAt,
    applyNetworkCollisionImpulse: applyNetworkVehicleCollisionImpulse,
    getSelectedCarColorHex: () => runtimeState.selectedCarColorHex,
    getSelectedCarSkinId: () => runtimeState.selectedCarSkinId,
    getPlayerCollectedCount: () => runtimeState.playerCollectedCount,
    getIsCarDestroyed: () => runtimeState.isCarDestroyed,
    getAuthAccessToken: () => runtimeState.authController?.getAccessToken?.() || '',
    getAuthState: () => runtimeState.authController?.getState?.() || null,
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
        recordPerformanceDiagnosticEvent('mine_placed_remote', {
            ownerCollectorId,
            mineId: typeof snapshot?.mineId === 'string' ? snapshot.mineId : '',
            position: serializeEventPosition(snapshot?.position),
        });
        runtimeState.mineController?.handleRemoteMinePlaced?.(snapshot);
    },
    onMineDetonated(snapshot) {
        recordPerformanceDiagnosticEvent('mine_detonated_remote', {
            mineId: typeof snapshot?.mineId === 'string' ? snapshot.mineId : '',
            ownerCollectorId: resolveMineOwnerCollectorId(snapshot?.ownerId),
            targetCollectorId: normalizeOptionalScoreAuditCollectorId(snapshot?.targetPlayerId),
            position: serializeEventPosition(snapshot?.position),
        });
        runtimeState.mineController?.handleRemoteMineDetonated?.(snapshot);
    },
    onCollectedPickupSnapshot(collectedPickupIds) {
        runtimeState.collectibleSystem?.applyCollectedPickupStateSnapshot?.(collectedPickupIds);
    },
    onWeaponPickupSnapshot(pickupSnapshots) {
        runtimeState.weaponSystem?.applyPickupStateSnapshot?.(pickupSnapshots);
    },
    onEnvironmentStateSnapshot(environmentState) {
        runtimeState.authoritativeEnvironmentState =
            environmentState && typeof environmentState === 'object' ? environmentState : null;
    },
    onAuthoritativeRoundState(authoritativeState) {
        if (!authoritativeState?.inRoom) {
            runtimeState.authoritativeScoreByPlayerId.clear();
            runtimeState.authoritativeEnvironmentState = null;
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
            recordPerformanceDiagnosticEvent('round_finished_authoritative', {
                totalPickups: Math.max(0, Math.round(Number(roundState?.totalPickups) || 0)),
                totalCollected: Math.max(0, Math.round(Number(roundState?.totalCollected) || 0)),
                totalScore: Math.max(0, Math.round(Number(roundState?.totalScore) || 0)),
                scoreboardEntries: scoreboardEntries.length,
            });
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
    onLeaveRoom() {
        runtimeState.inputController?.returnToWelcome?.();
    },
});

runtimeState.gameSessionController = createGameSessionController({
    keys,
    car,
    playerSpawnState,
    resolvePlayerSpawnState: () => resolveRandomPlayerSpawnState(),
    getGroundHeightAt,
    setCameraKeyboardControlsEnabled,
    setCameraViewMode,
    getCameraViewMode,
    resetCameraTrackingState,
    getChaseCameraSettings,
    setChaseCameraSettings,
    adjustChaseCameraSettings,
    resetChaseCameraSettings,
    getChaseCameraTuneSnapshot,
    initializePlayerPhysics,
    getVehicleState,
    setPlayerBatteryLevel,
    setPlayerBatteryDepleted,
    setPlayerCarBodyColor,
    setPlayerCarAppearance,
    resolvePlayerCarColorHex,
    resolvePlayerCarSkinId,
    getCarSkinPresetById,
    persistPlayerCarColorHex,
    persistPlayerCarSkinId,
    objectiveUi,
    controlsHelpUi,
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
    vehicleWeaponSystem: runtimeState.weaponSystem,
    getBotTrafficSystem: () => runtimeState.botTrafficSystem,
    getCollectorScore(collectorId) {
        return runtimeState.scoringSystem?.getCollectorScore?.(collectorId) || 0;
    },
    getCollectorRoundStats(collectorId) {
        return getCollectorScoreAuditSnapshot(collectorId);
    },
    crashDebrisController: runtimeState.crashDebrisController,
    mineController: runtimeState.mineController,
    setPhysicsAccumulator(value) {
        runtimeState.physicsAccumulator = value;
    },
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
        clearDeferredMineKillUiTasks();
    },
    onAutoCollectBonusAwarded({ collectorId = 'player', pointsAwarded = 0, pickupCount = 0 } = {}) {
        recordAutoCollectScoreAudit({
            collectorId,
            pointsAwarded,
            pickupCount,
        });
        recordPerformanceDiagnosticEvent('autocollect_bonus_awarded', {
            collectorId,
            pointsAwarded: Math.max(0, Math.round(Number(pointsAwarded) || 0)),
            pickupCount: Math.max(0, Math.round(Number(pickupCount) || 0)),
            totalScore: runtimeState.totalScore,
        });
    },
    onRoundFinalized(event = null) {
        clearDeferredMineKillUiTasks();
        runtimeState.botsMissionDirector?.clear?.();
        objectiveUi.clearMissionState?.();
        recordPerformanceDiagnosticEvent('round_finalized', {
            gameMode: runtimeState.gameMode,
            finishReason: typeof event?.finishReason === 'string' ? event.finishReason : '',
            finishLabel: typeof event?.finishLabel === 'string' ? event.finishLabel : '',
            winnerLabel: typeof event?.winnerLabel === 'string' ? event.winnerLabel : '',
            topScore: Math.max(0, Math.round(Number(event?.topScore) || 0)),
            totalPickups: Math.max(0, Math.round(Number(event?.totalPickups) || 0)),
            totalCollected: Math.max(0, Math.round(Number(event?.totalCollected) || 0)),
            totalScore: Math.max(0, Math.round(Number(event?.totalScore) || 0)),
            bonusPointsAwarded: Math.max(0, Math.round(Number(event?.bonusPointsAwarded) || 0)),
            bonusPickupsAwarded: Math.max(0, Math.round(Number(event?.bonusPickupsAwarded) || 0)),
            scoreboardEntries: Math.max(0, Math.round(Number(event?.scoreboardEntries) || 0)),
        });
        const leaderboardSubmission = resolveLocalLeaderboardSubmission({
            event,
            selectedCarSkinId: runtimeState.selectedCarSkinId,
            gameMode: runtimeState.gameMode,
            fallbackScore: runtimeState.playerScore,
            fallbackCollectedCount: runtimeState.playerCollectedCount,
        });
        if (leaderboardSubmission) {
            void runtimeState.globalLeaderboardController?.submitRoundResult?.(
                leaderboardSubmission
            );
        }
    },
    onPlayerRespawned(event = null) {
        recordPerformanceDiagnosticEvent('player_respawned', {
            carsRemaining: Math.max(0, Math.round(Number(event?.carsRemaining) || 0)),
            maxCars: Math.max(0, Math.round(Number(event?.maxCars) || 0)),
            position: serializeEventPosition(event?.position),
        });
    },
    onPlayerExplosion(event = null) {
        recordPerformanceDiagnosticEvent('player_exploded', {
            statusText: typeof event?.statusText === 'string' ? event.statusText : '',
            obstacleCategory:
                typeof event?.obstacleCategory === 'string' ? event.obstacleCategory : '',
            impactSpeed: Number.isFinite(event?.impactSpeed)
                ? Number(event.impactSpeed.toFixed(2))
                : 0,
            carsRemaining: Math.max(0, Math.round(Number(event?.carsRemaining) || 0)),
            maxCars: Math.max(0, Math.round(Number(event?.maxCars) || 0)),
            position: serializeEventPosition(event?.position),
            collision: sanitizeSerializable(event?.collision, null),
        });
        if (
            runtimeState.gameMode === 'bots' &&
            Math.max(0, Math.round(Number(event?.carsRemaining) || 0)) <= 0
        ) {
            runtimeState.botsMissionDirector?.handlePlayerOutOfCars?.(event);
        }
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
    getAuthState: () => runtimeState.authController?.getState?.() || null,
    readGuestChaseCameraSettings() {
        return readPersistedChaseCameraSettings();
    },
    persistGuestChaseCameraSettings(settings) {
        persistChaseCameraSettings(settings);
    },
    persistAccountChaseCameraSettings(settings) {
        return runtimeState.authController?.updateChaseCameraSettings?.(settings);
    },
    getSelectedCarColorHex: () => runtimeState.selectedCarColorHex,
    setSelectedCarColorHex(value) {
        runtimeState.selectedCarColorHex = value >>> 0;
    },
    getSelectedCarSkinId: () => runtimeState.selectedCarSkinId,
    setSelectedCarSkinId(value) {
        runtimeState.selectedCarSkinId = resolvePlayerCarSkinId(value);
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
    prepareBotsSession() {
        runtimeState.botsMissionDirector?.startCampaign?.({
            shouldStartCountdown: false,
        });
    },
    clearScorePopups() {
        runtimeState.scorePopupController?.clear?.();
    },
    audioController: runtimeState.audioController,
});
runtimeState.gameSessionController.handleAuthStateChanged?.(
    runtimeState.authController?.getState?.() || null
);

runtimeState.botsMissionDirector = createBotsMissionDirector({
    objectiveUi,
    getGameMode: () => runtimeState.gameMode,
    prepareMission(mission, context = null) {
        prepareBotsMissionEnvironment({
            ...mission,
            missionNumber: Math.max(1, Math.round(Number(context?.missionNumber) || 1)),
        });
    },
    setMissionTransitionLocked(nextLocked) {
        setBotsMissionTransitionLocked(nextLocked);
    },
    scheduleMissionReinforcement({ collectorId = '', delayMs = 0 } = {}) {
        return (
            runtimeState.botTrafficSystem?.scheduleReinforcement?.(collectorId, {
                delayMs,
            }) || false
        );
    },
    startMissionCountdown() {
        runtimeState.gameSessionController?.startRaceIntroSequence?.();
    },
    finalizeCampaign(result) {
        finalizeBotsCampaign(result);
    },
    getPlayerCollectedCount: () => runtimeState.playerCollectedCount,
    getPlayerScore: () => runtimeState.playerScore,
    getTotalScore: () => runtimeState.totalScore,
});

installRuntimeGraphicsRecoveryGuards();

function syncRuntimeInputContext() {
    runtimeState.inputContext = resolveGameplayInputContext({
        welcomeVisible: runtimeState.isWelcomeModalVisible,
        mapOpen: runtimeState.isWorldMapOpen,
        paused: runtimeState.isGamePaused,
        editModeActive: carEditModeController.isActive(),
        raceIntroDriveLocked:
            raceIntroController.isActive() && !raceIntroController.isDrivingUnlocked(),
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
        runtimeState.isWorldMapPauseOwned = false;
    } else {
        runtimeState.worldMapDriveLockMode = WORLD_MAP_DRIVE_LOCK_MODES.none;
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
                : '';
        return {
            ...result,
            driveLockMode: runtimeState.worldMapDriveLockMode,
            message:
                result.message && modeMessage
                    ? `${result.message} ${modeMessage}`
                    : result.message || modeMessage,
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

function createNoopPerformanceDiagnosticsController() {
    return {
        update() {},
        clear() {},
        setVisible() {},
        getSnapshot() {
            return null;
        },
        recordEvent() {
            return null;
        },
        downloadLog(payload = null, options = null) {
            const fallbackFilename = createDiagnosticsLogFilename();
            const filename = sanitizeDiagnosticsFilename(options?.filename, fallbackFilename);
            const result = downloadDiagnosticsJson(payload || {}, filename);
            if (result.ok) {
                return {
                    ok: true,
                    filename,
                    bytes: result.bytes,
                    spikes: 0,
                };
            }
            return {
                ok: false,
                filename,
                error: result.error || 'Download failed.',
            };
        },
    };
}

function downloadPerformanceDiagnosticsLog(roundSnapshot = null) {
    const diagnosticsPayload = {
        trigger: 'round_complete',
        generatedAtIso: new Date().toISOString(),
        gameMode: runtimeState.gameMode === 'online' ? 'online' : 'bots',
        roundSnapshot: sanitizeSerializable(roundSnapshot),
        runtimeSnapshot: createRuntimeDiagnosticsSnapshot(),
        scoreAudit: createScoreAuditSnapshot(),
    };

    const fallbackFilename = createDiagnosticsLogFilename();
    const result =
        typeof performanceDiagnosticsController?.downloadLog === 'function'
            ? performanceDiagnosticsController.downloadLog(diagnosticsPayload, {
                  filename: fallbackFilename,
              })
            : null;

    if (result?.ok) {
        objectiveUi.showInfo(`Diagnostics log downloaded (${result.filename}).`, 2200);
        return result;
    }

    objectiveUi.showInfo('Diagnostics log download failed.', 2200);
    return {
        ok: false,
        filename: result?.filename || fallbackFilename,
        error: result?.error || 'Download failed.',
    };
}

function sanitizeDiagnosticsFilename(filename, fallbackFilename) {
    const fallback =
        typeof fallbackFilename === 'string' && fallbackFilename.trim()
            ? fallbackFilename.trim()
            : 'auto-diagnostics.json';
    const raw = typeof filename === 'string' ? filename.trim() : '';
    const withExtension = raw
        ? raw.toLowerCase().endsWith('.json')
            ? raw
            : `${raw}.json`
        : fallback;
    const cleaned = withExtension
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return cleaned || fallback;
}

function downloadDiagnosticsJson(payload, filename) {
    try {
        const serialized = JSON.stringify(payload, null, 2);
        const blob = new Blob([serialized], {
            type: 'application/json;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        try {
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename;
            anchor.rel = 'noopener';
            anchor.style.display = 'none';
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
        } finally {
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 0);
        }
        return {
            ok: true,
            bytes: blob.size,
        };
    } catch (error) {
        return {
            ok: false,
            error:
                typeof error?.message === 'string' && error.message.trim()
                    ? error.message.trim()
                    : 'Unable to create diagnostics file.',
        };
    }
}

function createRuntimeDiagnosticsSnapshot() {
    const multiplayerSelfId =
        typeof runtimeState.multiplayerController?.getSelfId === 'function'
            ? runtimeState.multiplayerController.getSelfId() || ''
            : '';

    return {
        gameMode: runtimeState.gameMode === 'online' ? 'online' : 'bots',
        player: {
            collectedCount: Math.max(0, Math.round(Number(runtimeState.playerCollectedCount) || 0)),
            score: Math.max(0, Math.round(Number(runtimeState.playerScore) || 0)),
            batteryPercent: Math.max(0, Math.round(Number(runtimeState.playerBattery) || 0)),
            batteryDepleted: Boolean(runtimeState.isBatteryDepleted),
            carsRemaining: Math.max(0, Math.round(Number(runtimeState.playerCarsRemaining) || 0)),
            isCarDestroyed: Boolean(runtimeState.isCarDestroyed),
        },
        round: {
            pickupRoundFinished: Boolean(runtimeState.pickupRoundFinished),
            totalCollectedCount: Math.max(
                0,
                Math.round(Number(runtimeState.totalCollectedCount) || 0)
            ),
            totalScore: Math.max(0, Math.round(Number(runtimeState.totalScore) || 0)),
            totalPickupsConfigured: ROUND_TOTAL_PICKUPS,
        },
        ui: {
            welcomeVisible: Boolean(runtimeState.isWelcomeModalVisible),
            paused: Boolean(runtimeState.isGamePaused),
            worldMapOpen: Boolean(runtimeState.isWorldMapOpen),
            worldMapDriveLockMode:
                typeof runtimeState.worldMapDriveLockMode === 'string'
                    ? runtimeState.worldMapDriveLockMode
                    : 'none',
        },
        systems: {
            graphics: sanitizeSerializable(graphicsQualityController?.getSnapshot?.() || null),
            audio: {
                preload: sanitizeSerializable(
                    runtimeState.audioController?.getPreloadState?.() || null
                ),
                gameplayReady: Boolean(runtimeState.audioController?.isGameplayReady?.()),
                unlocked: Boolean(runtimeState.audioController?.isUnlocked?.()),
            },
            deferredUi: {
                pendingMineKillTasks: deferredMineKillUiTasks.length,
                droppedMineKillTasks: deferredMineKillUiDroppedCount,
                executedMineKillTasks: deferredMineKillUiExecutedCount,
                mineKillUiFlowPrewarmed: mineKillUiFlowPrewarmed,
            },
            multiplayer: {
                inRoom: Boolean(runtimeState.multiplayerController?.isInRoom?.()),
                selfId: typeof multiplayerSelfId === 'string' ? multiplayerSelfId : '',
            },
        },
    };
}

function createScoreAuditSnapshot() {
    const collectorEntries = [];
    for (const collectorId of runtimeState.scoreAuditByCollectorId.keys()) {
        const entry = getCollectorScoreAuditSnapshot(collectorId);
        if (entry) {
            collectorEntries.push(entry);
        }
    }
    collectorEntries.sort((left, right) => {
        if (left.collectorId === 'player' && right.collectorId !== 'player') {
            return -1;
        }
        if (right.collectorId === 'player' && left.collectorId !== 'player') {
            return 1;
        }
        return (
            right.pickupPoints + right.mineKillPoints - (left.pickupPoints + left.mineKillPoints)
        );
    });
    return {
        collectors: collectorEntries,
        collectorCount: collectorEntries.length,
        scoredMineDeployIdsCount: runtimeState.scoredMineDeployIds.size,
        scoredMineDetonationIdsCount: runtimeState.scoredMineDetonationIds.size,
        authoritativeScoreEntries: runtimeState.authoritativeScoreByPlayerId.size,
    };
}

function createDiagnosticsLogFilename() {
    return `auto-performance-log-${runtimeState.gameMode === 'online' ? 'online' : 'bots'}-${formatDiagnosticsTimestamp(new Date())}.json`;
}

function formatDiagnosticsTimestamp(date) {
    const iso = date instanceof Date ? date.toISOString() : new Date().toISOString();
    return iso
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z')
        .replace('T', '-');
}

function sanitizeSerializable(value, fallback = null) {
    if (value === undefined) {
        return fallback;
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return fallback;
    }
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
pauseMenuUi.configureCameraTuneControls({
    getSnapshot() {
        return runtimeState.gameSessionController?.getCameraTuneUiSnapshot?.() || null;
    },
    onReset() {
        return runtimeState.gameSessionController?.resetChaseCameraTuneToDefault?.() || null;
    },
});
syncRuntimeInputContext();

runtimeState.inputController = createInputController({
    renderer,
    camera,
    car,
    sceneClickRoot: cityScenery,
    keys,
    renderSettings,
    welcomeModalUi,
    finalScoreboardUi,
    carEditModeController,
    raceIntroController,
    getIsWelcomeModalVisible: () => runtimeState.isWelcomeModalVisible,
    getIsGamePaused: () => runtimeState.isGamePaused,
    getIsCarDestroyed: () => runtimeState.isCarDestroyed,
    onSetPauseState(nextPaused) {
        runtimeState.gameSessionController?.setPauseState(nextPaused);
    },
    getIsCameraTuneModeActive() {
        return Boolean(runtimeState.gameSessionController?.isChaseCameraTuneModeActive?.());
    },
    onToggleChaseCameraTuneMode() {
        return runtimeState.gameSessionController?.toggleChaseCameraTuneMode?.() || null;
    },
    onAdjustChaseCameraTune(adjustment) {
        return runtimeState.gameSessionController?.adjustChaseCameraTune?.(adjustment) || null;
    },
    onResetChaseCameraTune() {
        return runtimeState.gameSessionController?.resetChaseCameraTuneToDefault?.() || null;
    },
    onDismissWelcomeModal(mode, startContext = null) {
        runtimeState.gameSessionController?.dismissWelcomeModal(mode, startContext);
    },
    onRestartGameWithCountdown() {
        runtimeState.gameSessionController?.restartGameWithCountdown();
    },
    onRecoverVehicle() {
        return runtimeState.gameSessionController?.recoverPlayerCar?.() || null;
    },
    onClearDriveKeys() {
        runtimeState.gameSessionController?.clearDriveKeys();
    },
    onShowObjectiveInfo(messageText, timeoutMs = 2000) {
        objectiveUi.showInfo(messageText, timeoutMs);
    },
    onRegisterControlAction(actionId = '') {
        objectiveUi.registerControlAction?.(actionId);
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
    onGrantVehicleWeapon() {
        return runtimeState.weaponSystem?.grantWeapon?.() || false;
    },
    getHasVehicleWeapon() {
        return Boolean(runtimeState.weaponSystem?.hasWeapon?.());
    },
    getVehicleCombatMode() {
        return runtimeState.weaponSystem?.getCombatMode?.() || 'mine';
    },
    onToggleVehicleCombatMode() {
        return runtimeState.weaponSystem?.toggleCombatMode?.() || null;
    },
    onSetVehicleWeaponTrigger(nextHeld) {
        runtimeState.weaponSystem?.setTriggerHeld?.(nextHeld);
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
    keyBindings: DEFAULT_KEY_BINDINGS,
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
    speedometerUi,
    starsController,
    objectiveUi,
    botStatusUi,
    collectibleSystem,
    vehicleWeaponSystem: runtimeState.weaponSystem,
    multiplayerController: runtimeState.multiplayerController,
    mineSystemController: runtimeState.mineController,
    scorePopupController: runtimeState.scorePopupController,
    getMultiplayerCollisionSnapshots() {
        return runtimeState.multiplayerController?.getCollisionSnapshots?.() || EMPTY_ARRAY;
    },
    crashDebrisController: runtimeState.crashDebrisController,
    audioController: runtimeState.audioController,
    mapUiController,
    graphicsQualityController,
    performanceDiagnosticsController,
    gameSessionController: runtimeState.gameSessionController,
    getBotTrafficSystem: () => runtimeState.botTrafficSystem,
    getVehicleState,
    getGroundHeightAt,
    updateGroundMotion,
    getEnvironmentSyncState,
    getAuthoritativeEnvironmentState: () => runtimeState.authoritativeEnvironmentState,
    reportEnvironmentState(environmentState) {
        return (
            runtimeState.multiplayerController?.reportEnvironmentState?.(environmentState) || false
        );
    },
    isEnvironmentStateAuthority() {
        return runtimeState.multiplayerController?.isRoomHost?.() === true;
    },
    updateCarVisuals,
    updateCamera,
    resetCameraTrackingState,
    setCameraKeyboardControlsEnabled,
    updatePlayerPhysics,
    applyInterpolatedPlayerTransform,
    consumeVehicleCollisionContacts,
    consumeCrashCollision,
    worldBounds,
    staticObstacles,
    getDynamicObstacleCandidates() {
        const buildingLayer = ensureWorldBuilt().cityScenery.userData?.buildingLayer || null;
        return appendLorienVelmoreDoorCollisionObstacles(
            buildingLayer,
            lorienDoorCollisionObstacleBuffer
        );
    },
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
    getPlayerBattery: () => runtimeState.playerBattery,
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
    getIsVehicleWeaponZoomActive: () =>
        Boolean(runtimeState.inputController?.isVehicleWeaponZoomHeld?.()),
    getWorldMapDriveLockMode: () => runtimeState.worldMapDriveLockMode,
    getIsWorldMapOpen: () => runtimeState.isWorldMapOpen,
});

runtimeState.botTrafficSystem.setActiveBotCount?.(0);
runtimeState.botTrafficSystem.setEnabled?.(false);
objectiveUi.clearMissionState?.();
renderBotsHud();
initializePlayerPhysics(car);
runtimeState.crashDebrisController.resetPlayerDamageState();
setPlayerBatteryLevel(1);
runtimeState.gameSessionController.setBatteryDepletedState(false, { showStatus: false });
if (welcomeModalUi.isAvailable()) {
    runtimeState.gameSessionController.showWelcomeModal();
}

runtimeState.multiplayerController.initialize();
runtimeState.multiplayerController.handleAuthenticationStateChanged?.(
    runtimeState.authController?.getState?.() || null
);
runtimeState.inputController.initialize();
runtimeState.gameLoopController.start();

function resolveLocalLeaderboardSubmission({
    event = null,
    selectedCarSkinId = '',
    gameMode = 'bots',
    fallbackScore = 0,
    fallbackCollectedCount = 0,
} = {}) {
    const scoreboard = Array.isArray(event?.scoreboard) ? event.scoreboard : [];
    const selfEntry =
        scoreboard.find((entry) => entry?.isSelf === true) ||
        scoreboard.find((entry) => {
            const collectorId =
                typeof entry?.collectorId === 'string'
                    ? entry.collectorId.trim().toLowerCase()
                    : '';
            return collectorId === 'player';
        }) ||
        scoreboard.find((entry) => {
            const name = typeof entry?.name === 'string' ? entry.name.trim().toLowerCase() : '';
            return name === 'you';
        }) ||
        null;

    return {
        playerName: typeof selfEntry?.name === 'string' ? selfEntry.name : '',
        score: Math.max(0, Math.round(Number(selfEntry?.score) || Number(fallbackScore) || 0)),
        collectedCount: Math.max(
            0,
            Math.round(Number(selfEntry?.collectedCount) || Number(fallbackCollectedCount) || 0)
        ),
        totalPickups: Math.max(0, Math.round(Number(event?.totalPickups) || 0)),
        totalScore: Math.max(0, Math.round(Number(event?.totalScore) || 0)),
        finishReason: typeof event?.finishReason === 'string' ? event.finishReason : '',
        winnerLabel: typeof event?.winnerLabel === 'string' ? event.winnerLabel : '',
        carSkinId: typeof selectedCarSkinId === 'string' ? selectedCarSkinId : '',
        gameMode: typeof gameMode === 'string' ? gameMode : 'bots',
    };
}
