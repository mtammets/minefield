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
    jumpRampChargeZones,
} from './environment.js';
import {
    car,
    createCarRig,
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
import { camera, updateCamera, setCameraKeyboardControlsEnabled, resetCameraTrackingState } from './camera.js';
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

const clock = new THREE.Clock();
const physicsStep = 1 / 120;
let physicsAccumulator = 0;
const MAX_PHYSICS_STEPS_PER_FRAME = 6;
const MINIMAP_UPDATE_INTERVAL = 1 / 12;
let minimapAccumulator = 0;
const COLOR_NAMES = {
    [0x7cf9ff]: 'Neo Turquoise',
    [0xff85f8]: 'Neon Pink',
    [0x8dff9a]: 'Light Green',
    [0xffd86b]: 'Amber',
};
const CAR_COLOR_STORAGE_KEY = 'silentdrift-player-car-color-hex';
const PLAYER_TOP_SPEED_STORAGE_KEY = 'silentdrift-player-top-speed-kph';
const CAR_COLOR_PRESETS = [
    { hex: 0x2d67a6, name: 'Cobalt Blue' },
    { hex: 0xd34545, name: 'Racing Red' },
    { hex: 0xff9f3f, name: 'Sunset Orange' },
    { hex: 0x3ca86f, name: 'Neon Green' },
    { hex: 0x8c9bb0, name: 'Titanium Gray' },
    { hex: 0xe4edf6, name: 'Arctic White' },
];
const DEFAULT_PLAYER_CAR_COLOR_HEX = CAR_COLOR_PRESETS[0].hex;
const DEBRIS_GRAVITY = 26;
const DEBRIS_DRAG = 2.2;
const DEBRIS_BOUNCE_DAMPING = 0.32;
const DEBRIS_GROUND_CLEARANCE = 0.028;
const PLAYER_RIDE_HEIGHT = 0.088;
const DEBRIS_BASE_VERTICAL_BOOST = 2.2;
const DEBRIS_SETTLE_VERTICAL_SPEED = 0.45;
const DEBRIS_SETTLE_HORIZONTAL_SPEED = 0.5;
const DEBRIS_SETTLE_ANGULAR_SPEED = 0.85;
const PART_BASE_LATERAL_BOOST = 2.6;
const PART_BASE_BLAST_BOOST = 4.1;
const PART_BASE_FORWARD_CARRY_BOOST = 8.4;
const PART_BASE_IMPACT_INERTIA_SCALE = 0.16;
const PART_BASE_ANGULAR_BOOST = 8.6;
const WHEEL_ROLL_RANDOM_BOOST = 4.4;
const WHEEL_ROLL_DRIVE_MIN = 4.2;
const WHEEL_ROLL_DRIVE_MAX = 9.8;
const WHEEL_ORIENTATION_ALIGN_RATE = 14;
const BODY_PANEL_ORIENTATION_ALIGN_RATE = 9.5;
const OBSTACLE_CRASH_MIN_SPEED = 38;
const OBSTACLE_CRASH_MAX_SPEED = 84;
const VEHICLE_DAMAGE_COLLISION_MIN = 8;
const VEHICLE_DAMAGE_COLLISION_MED = 14;
const VEHICLE_DAMAGE_COLLISION_HIGH = 22;
const VEHICLE_WHEEL_DETACH_SPEED = 28;
const VEHICLE_SECOND_WHEEL_DETACH_SPEED = 36;
const VEHICLE_DENT_MAX = 1.7;
const STATUS_DEFAULT_TEXT = 'Rear-wheel drive and powerful: controllable both forward and reverse. Collect energy spheres.';
const ROOF_MENU_MODE_LABELS = {
    dashboard: 'Dashboard',
    battery: 'Energy',
    navigation: 'Nav',
    chassis: 'Chassis',
};
const SHARED_PICKUP_COLOR_INDEX = 0;
const SHARED_PICKUP_COLOR_HEX = 0x7cf9ff;
const BATTERY_MAX = 100;
const BATTERY_PICKUP_GAIN = 24;
const BATTERY_IDLE_DRAIN_PER_SEC = 0;
const BATTERY_SPEED_DRAIN_PER_SPEED = 0.055;
const BATTERY_LOW_HUD_SHOW_THRESHOLD = 0.25;
const BATTERY_LOW_HUD_HIDE_THRESHOLD = 0.3;
const BATTERY_CRITICAL_HUD_SHOW_THRESHOLD = 0.1;
const BATTERY_CRITICAL_HUD_HIDE_THRESHOLD = 0.12;
const BATTERY_DEPLETED_TRIGGER_LEVEL = 0.001;
const BATTERY_DEPLETED_RECOVER_LEVEL = 0.06;
const CHARGING_ZONE_ACTIVATION_DELAY_SEC = 2;
const CHARGING_BATTERY_GAIN_PER_SEC = 16;
const ROUND_TOTAL_PICKUPS = 30;
const PLAYER_CAR_POOL_SIZE = 3;
const PLAYER_RESPAWN_DELAY_MS = 850;
const REPLAY_EVENT_PICKUP = 'pickup';
const REPLAY_EVENT_CRASH = 'crash';
const WELCOME_CAR_SPIN_SPEED = 0.62;
const WELCOME_PREVIEW_STATE_SPEED = 17;
const WELCOME_PREVIEW_REAR_LIGHT_Z = 2.045;
const RACE_INTRO_DURATION_SEC = 4.2;
const SKID_MARK_REAR_WHEEL_OFFSET_X = 1.28;
const SKID_MARK_REAR_WHEEL_OFFSET_Z = 1.8;
const SKID_MARK_MAX_SEGMENTS = 1900;
const SKID_MARK_BASE_WIDTH = 0.34;
const SKID_MARK_MIN_SEGMENT_LENGTH = 0.05;
const SKID_MARK_MAX_SEGMENT_LENGTH = 0.68;
const SKID_MARK_SURFACE_BASE_HEIGHT = 0.028;
const SKID_MARK_SURFACE_OFFSET = 0.0046;
const SKID_MARK_BASE_OPACITY = 0.4;
const SKID_MARK_SMOKE_BLEND_STRENGTH = 0.62;
const DRIFT_SMOKE_MAX_PARTICLES = 260;
const DRIFT_SMOKE_SPAWN_RATE = 78;
const DRIFT_SMOKE_LIFE_MIN = 0.7;
const DRIFT_SMOKE_LIFE_MAX = 1.45;
const debrisPieces = [];
const replayEffects = [];
const crashParts = getPlayerCarCrashParts();
const detachedCrashPartIds = new Set();
const playerDamageState = createEmptyDamageState();
const bodyDamageVisual = { left: 0, right: 0, front: 0, rear: 0 };
const bodyPartBaselines = new Map();
const debrisBottomProbeBox = new THREE.Box3();
let selectedCarColorHex = resolvePlayerCarColorHex(readPersistedPlayerCarColorHex());
setPlayerCarBodyColor(selectedCarColorHex);
setPlayerTopSpeedLimitKph(readPersistedPlayerTopSpeedKph());
const objectiveUi = createObjectiveUiController();
const botStatusUi = createBotStatusController();
const finalScoreboardUi = createFinalScoreboardController();
const pauseMenuUi = createPauseMenuController({
    onExit() {
        returnToWelcomeFromPauseMenu();
    },
    onResume() {
        setPauseState(false);
    },
});
const welcomeModalUi = createWelcomeModalController({
    initialColorHex: selectedCarColorHex,
    onColorChange(colorHex) {
        setSelectedPlayerCarColor(colorHex);
    },
    onStart() {
        dismissWelcomeModal();
    },
});
car.position.y = getGroundHeightAt(car.position.x, car.position.z) + PLAYER_RIDE_HEIGHT;
const playerSpawnState = {
    position: car.position.clone(),
    rotationY: car.rotation.y,
};
let isCarDestroyed = false;
let explosionLight = null;
let explosionLightLife = 0;
let botTrafficSystem = null;
let playerBattery = BATTERY_MAX;
let isBatteryDepleted = false;
let playerCollectedCount = 0;
let totalCollectedCount = 0;
let playerCarsRemaining = PLAYER_CAR_POOL_SIZE;
let pendingRespawnTimeout = null;
let pickupRoundFinished = false;
let vehicleImpactStatusCooldown = 0;
let isGamePaused = false;
let isWelcomeModalVisible = false;
const ESC_FULLSCREEN_FALLBACK_WINDOW_MS = 460;
let lastEscapeKeyDownAtMs = -10_000;
const roofMenuRaycaster = new THREE.Raycaster();
const roofMenuPointerNdc = new THREE.Vector2();

initializeBodyPartBaselines();

// Stseeni ja renderdamise algne seadistamine
const scene = initializeScene();
const renderer = initializeRenderer();
const chargingZoneController = createChargingZoneController(scene, jumpRampChargeZones, {
    activationDelaySec: CHARGING_ZONE_ACTIVATION_DELAY_SEC,
});
const chargingProgressHudController = createChargingProgressHudController(scene, camera, {
    vehicle: car,
    getBatteryPercent() {
        return playerBattery;
    },
    getBatteryNormalized() {
        return playerBattery / BATTERY_MAX;
    },
});
const skidMarkController = createSkidMarkController(scene, {
    sampleGroundHeight: getGroundHeightAt,
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
        clearDriveKeys();
        if (isActive) {
            setPauseState(false);
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
        botTrafficSystem?.setSharedTargetColor(targetColorHex);
    },
    onCorrectPickup: ({ pickupColorHex, collectorId, position }) => {
        totalCollectedCount += 1;
        replayController.recordEvent(REPLAY_EVENT_PICKUP, {
            x: position.x,
            y: position.y,
            z: position.z,
            colorHex: pickupColorHex,
            wrong: false,
        });

        if (collectorId === 'player') {
            playerCollectedCount += 1;
            addBattery(BATTERY_PICKUP_GAIN);
            objectiveUi.flashCorrect(pickupColorHex, Math.round(playerBattery));
            return;
        }
        botTrafficSystem?.registerCollected(collectorId);
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
        triggerCarExplosion(position, pickupColorHex, targetColorHex);
    },
    onExhausted: ({ totalPickups, collectedPickups }) => {
        finalizePickupRound(totalPickups, collectedPickups);
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
botTrafficSystem = createBotTrafficSystem(scene, worldBounds, staticObstacles, {
    botCount: 3,
    sharedTargetColorHex: SHARED_PICKUP_COLOR_HEX,
    getGroundHeightAt,
});
const miniMapController = createMiniMapController(worldBounds);
const replayController = createReplayController(car, camera);
botStatusUi.render(botTrafficSystem.getHudState());
initializePlayerPhysics(car);
resetPlayerDamageState();
setPlayerBatteryLevel(1);
setBatteryDepletedState(false, { showStatus: false });
if (welcomeModalUi.isAvailable()) {
    showWelcomeModal();
}

// Klaviatuurikontrollide ja akna suuruse muutuste kuulamine
initializeControls();

// Start animation
animate();

/** Funktsioonid **/

// Stseeni initsialiseerimine ja objektide lisamine
function initializeScene() {
    const scene = new THREE.Scene();
    scene.background = sceneBackgroundColor;
    scene.fog = sceneFog;
    scene.add(ambientLight, skyLight, sunLight, car, ground, cityScenery, worldBoundary);
    return scene;
}

// Rendereri seadistamine
function initializeRenderer() {
    const renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('gameCanvas'),
        antialias: false,
        powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, renderSettings.maxPixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = renderSettings.shadowsEnabled;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    return renderer;
}

// Klaviatuuriklahvide ja akna suuruse muutuste kuulamine
function initializeControls() {
    document.addEventListener('keydown', (e) => handleKey(e, true));
    document.addEventListener('keyup', (e) => handleKey(e, false));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('pointerdown', handleGameCanvasPointerDown);
}

// Handle key presses
function handleKey(event, isKeyDown) {
    const rawKey = event.key.toLowerCase();
    const key = rawKey === ' ' || rawKey === 'spacebar' ? 'space' : rawKey;
    if (isKeyDown && event.repeat && (
        key === 'k'
        || key === 'v'
        || key === 'f'
        || key === 'e'
        || key === 'q'
        || key === 'enter'
        || key === 'escape'
        || key === 'tab'
        || key === 'm'
        || key === '1'
        || key === '2'
        || key === '3'
        || key === '4'
    )) {
        return;
    }

    const canEnterEditMode = !isWelcomeModalVisible
        && !isGamePaused
        && !raceIntroController.isActive()
        && !isCarDestroyed
        && !finalScoreboardUi.isVisible();
    const shouldRouteToEditMode = carEditModeController.isActive() || canEnterEditMode;
    if (shouldRouteToEditMode && carEditModeController.handleKey(event, isKeyDown)) {
        return;
    }

    if (isWelcomeModalVisible) {
        if (isKeyDown && (key === 'arrowleft' || key === 'a')) {
            event.preventDefault();
            welcomeModalUi.selectNeighborColor(-1);
        }
        if (isKeyDown && (key === 'arrowright' || key === 'd')) {
            event.preventDefault();
            welcomeModalUi.selectNeighborColor(1);
        }
        if (key === 'enter' && isKeyDown) {
            event.preventDefault();
            dismissWelcomeModal();
        }
        return;
    }

    const isRaceIntroActive = raceIntroController.isActive();
    const isRaceIntroDriveLocked = isRaceIntroActive && !raceIntroController.isDrivingUnlocked();

    if (key === 'escape') {
        event.preventDefault();
        if (isRaceIntroActive) {
            return;
        }
        if (isKeyDown) {
            lastEscapeKeyDownAtMs = performance.now();
        }
        if (isKeyDown && !finalScoreboardUi.isVisible()) {
            setPauseState(!isGamePaused);
            void lockEscapeKeyInFullscreen();
        }
        return;
    }

    if (isGamePaused) {
        return;
    }

    if (key === 'space') {
        event.preventDefault();
    }

    const isDriveKey = key === 'arrowup'
        || key === 'arrowdown'
        || key === 'arrowleft'
        || key === 'arrowright'
        || key === 'w'
        || key === 'a'
        || key === 's'
        || key === 'd'
        || key === 'space';
    if (isDriveKey && replayController.isPlaybackActive()) {
        return;
    }
    const setDriveInput = (driveKey) => {
        keys[driveKey] = isKeyDown;
    };

    const actions = {
        arrowup: () => setDriveInput('forward'),
        arrowdown: () => setDriveInput('backward'),
        arrowleft: () => setDriveInput('left'),
        arrowright: () => setDriveInput('right'),
        w: () => setDriveInput('forward'),
        s: () => setDriveInput('backward'),
        a: () => setDriveInput('left'),
        d: () => setDriveInput('right'),
        space: () => setDriveInput('handbrake'),
        f: () => isKeyDown && toggleFullscreen(),
        q: () => {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }
            restartGameWithCountdown();
        },
        enter: () => {
            if (!isKeyDown || !finalScoreboardUi.isVisible() || isRaceIntroDriveLocked) {
                return;
            }
            restartGameWithCountdown();
        },
        k: () => {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }

            if (replayController.isPlaybackActive()) {
                replayController.stopPlayback();
                clearPendingRespawn();
                clearReplayEffects();
                clearDebris();
                initializePlayerPhysics(car);
                resetPlayerDamageState();
                physicsAccumulator = 0;
                objectiveUi.showInfo('Playback stopped.');
            }

            if (isCarDestroyed) {
                objectiveUi.showInfo(
                    playerCarsRemaining > 0
                        ? 'A crash is in progress. Wait for the next car to spawn.'
                        : 'No cars left. Press Q to restart.'
                );
                return;
            }

            if (replayController.isRecording()) {
                replayController.stopRecording();
                const duration = replayController.getDuration();
                if (duration > 0.2) {
                    objectiveUi.showInfo(`Recording saved (${duration.toFixed(1)}s). Press V to play it back.`);
                } else {
                    objectiveUi.showInfo('Recording too short. Drive longer and try again.');
                }
                return;
            }

            replayController.startRecording(getVehicleState());
            objectiveUi.showInfo('Recording in progress. Press K to stop.');
        },
        v: () => {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }

            if (replayController.isRecording()) {
                replayController.stopRecording();
            }

            if (replayController.isPlaybackActive()) {
                replayController.stopPlayback();
                clearPendingRespawn();
                clearReplayEffects();
                clearDebris();
                initializePlayerPhysics(car);
                resetPlayerDamageState();
                physicsAccumulator = 0;
                objectiveUi.showInfo('Playback stopped.');
                return;
            }

            if (!replayController.hasReplay()) {
                objectiveUi.showInfo('No replay available. Press K to record a drive.');
                return;
            }

            resetRunStateForReplay();
            clearDriveKeys();
            if (replayController.startPlayback()) {
                clearReplayEffects();
                objectiveUi.showInfo('TV replay started. V stops it, K starts a new recording.');
            }
        },
        tab: () => {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }
            event.preventDefault();
            const step = event.shiftKey ? -1 : 1;
            const modeKey = cyclePlayerRoofMenu(step);
            showRoofMenuStatus(modeKey);
        },
        m: () => {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }
            const modeKey = cyclePlayerRoofMenu(1);
            showRoofMenuStatus(modeKey);
        },
        1: () => {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }
            const modeKey = setPlayerRoofMenuMode('dashboard');
            showRoofMenuStatus(modeKey);
        },
        2: () => {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }
            const modeKey = setPlayerRoofMenuMode('battery');
            showRoofMenuStatus(modeKey);
        },
        3: () => {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }
            const modeKey = setPlayerRoofMenuMode('navigation');
            showRoofMenuStatus(modeKey);
        },
        4: () => {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }
            const modeKey = setPlayerRoofMenuMode('chassis');
            showRoofMenuStatus(modeKey);
        },
    };
    if (actions[key]) actions[key]();
}

function showRoofMenuStatus(modeKey = getPlayerRoofMenuMode()) {
    if (!modeKey) {
        return;
    }
    const modeLabel = ROOF_MENU_MODE_LABELS[modeKey] || String(modeKey);
    const chassisHint = modeKey === 'chassis'
        ? ' In Chassis view you can adjust suspension and top speed with +/- buttons.'
        : '';
    objectiveUi.showInfo(`Roof menu: ${modeLabel}. Tab next, Shift+Tab previous, 1-4 direct.${chassisHint}`);
}

function handleGameCanvasPointerDown(event) {
    if (event.button !== 0) {
        return;
    }
    if (
        isWelcomeModalVisible
        || isGamePaused
        || raceIntroController.isActive()
        || isCarDestroyed
        || carEditModeController.isActive()
    ) {
        return;
    }

    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return;
    }

    roofMenuPointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    roofMenuPointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    roofMenuRaycaster.setFromCamera(roofMenuPointerNdc, camera);

    const intersections = roofMenuRaycaster.intersectObject(car, true);
    for (let i = 0; i < intersections.length; i += 1) {
        const hit = intersections[i];
        if (!hit?.uv || !hit.object?.userData?.roofMenuSurface) {
            continue;
        }
        const interaction = setPlayerRoofMenuModeFromUv(hit.uv);
        if (interaction?.type === 'mode' && interaction.modeKey) {
            showRoofMenuStatus(interaction.modeKey);
            event.preventDefault();
        } else if (interaction?.type === 'suspension_height') {
            const tune = adjustPlayerSuspensionHeight(interaction.delta);
            showSuspensionTuneStatus(tune);
            event.preventDefault();
        } else if (interaction?.type === 'suspension_stiffness') {
            const tune = adjustPlayerSuspensionStiffness(interaction.delta);
            showSuspensionTuneStatus(tune);
            event.preventDefault();
        } else if (interaction?.type === 'top_speed_limit') {
            const topSpeedTune = adjustPlayerTopSpeedLimit(interaction.delta);
            persistPlayerTopSpeedKph(topSpeedTune.topSpeedKph);
            showTopSpeedTuneStatus(topSpeedTune);
            event.preventDefault();
        }
        return;
    }
}

function showSuspensionTuneStatus(tune = getPlayerSuspensionTune()) {
    if (!tune) {
        return;
    }
    const heightMm = Math.round(tune.suspensionHeightMm || 0);
    const stiffnessPct = Math.round(tune.suspensionStiffnessPercent || 0);
    objectiveUi.showInfo(`Suspension: height ${heightMm >= 0 ? '+' : ''}${heightMm} mm, stiffness ${stiffnessPct}%.`);
}

function showTopSpeedTuneStatus(tune = getPlayerTopSpeedLimit()) {
    if (!tune) {
        return;
    }
    const speedKph = Math.round(tune.topSpeedKph || 0);
    objectiveUi.showInfo(`Top speed: ${speedKph} km/h.`);
}

// Akna suuruse muutmisel rendereri ja kaamera uuendamine
function onWindowResize() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, renderSettings.maxPixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    miniMapController.resize();
    welcomeModalUi.resize();
}

// Toggle fullscreen mode
function toggleFullscreen() {
    const fullscreenRoot = document.documentElement;
    if (!document.fullscreenElement) {
        fullscreenRoot
            .requestFullscreen()
            .then(() => lockEscapeKeyInFullscreen())
            .catch(console.error);
    } else {
        unlockKeyboardLock();
        document.exitFullscreen().catch(console.error);
    }
}

function returnToWelcomeFromPauseMenu() {
    startNewGame();
    showWelcomeModal();

    if (!document.fullscreenElement) {
        return;
    }

    unlockKeyboardLock();
    document.exitFullscreen().catch(() => {
        // Welcome view is already visible even if fullscreen exit fails.
    });
}

function onFullscreenChange() {
    if (document.fullscreenElement) {
        void lockEscapeKeyInFullscreen();
        return;
    }

    unlockKeyboardLock();
    const escapedRecently = (performance.now() - lastEscapeKeyDownAtMs) <= ESC_FULLSCREEN_FALLBACK_WINDOW_MS;
    if (escapedRecently && !isGamePaused && !finalScoreboardUi.isVisible()) {
        setPauseState(true);
    }
}

async function lockEscapeKeyInFullscreen() {
    if (!document.fullscreenElement) {
        return;
    }

    const keyboardApi = navigator.keyboard;
    if (!keyboardApi || typeof keyboardApi.lock !== 'function') {
        return;
    }

    try {
        await keyboardApi.lock(['Escape']);
    } catch {
        // Ignore unsupported/browser-denied keyboard lock requests.
    }
}

function unlockKeyboardLock() {
    const keyboardApi = navigator.keyboard;
    if (!keyboardApi || typeof keyboardApi.unlock !== 'function') {
        return;
    }

    try {
        keyboardApi.unlock();
    } catch {
        // Ignore unsupported/browser-denied keyboard unlock requests.
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    const frameDelta = Math.min(clock.getDelta(), 0.05);
    const isEditModeActive = carEditModeController.isActive();
    let chargingHudEnabled = false;
    let chargingHudActive = false;
    let chargingHudLevel = 0;
    let skidMarksEnabled = false;
    let skidMarkVehicleState = null;
    welcomeModalUi.update(frameDelta);
    if (!isGamePaused && !isEditModeActive) {
        if (raceIntroController.isActive()) {
            physicsAccumulator = 0;
            chargingZoneController.update(car.position, frameDelta, { enabled: false });
            const vehicleState = getVehicleState();
            vehicleState.chargingLevelNormalized = 0;
            vehicleState.batteryDepleted = isBatteryDepleted;
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
            vehicleImpactStatusCooldown = Math.max(0, vehicleImpactStatusCooldown - frameDelta);

            const vehicleState = getVehicleState();
            const replayActive = replayController.isPlaybackActive();
            const chargingContextEnabled = !replayActive && !isCarDestroyed && !pickupRoundFinished;
            const chargingSnapshot = chargingZoneController.update(car.position, frameDelta, {
                enabled: chargingContextEnabled,
            });
            chargingHudEnabled = chargingContextEnabled;
            chargingHudActive = chargingSnapshot.isChargingActive && chargingContextEnabled;
            chargingHudLevel = chargingSnapshot.visualLevel;
            vehicleState.chargingLevelNormalized = chargingSnapshot.visualLevel;
            if (chargingSnapshot.startedThisFrame) {
                objectiveUi.showInfo('Charging started. Battery fills while you stay inside the ring.', 2200);
            }
            if (chargingSnapshot.isChargingActive && chargingContextEnabled) {
                addBattery(CHARGING_BATTERY_GAIN_PER_SEC * frameDelta);
            }
            let visualState = vehicleState;

            if (replayActive) {
                physicsAccumulator = 0;
                const replayFrame = replayController.updatePlayback(frameDelta);
                if (replayFrame?.vehicleState) {
                    visualState = replayFrame.vehicleState;
                }
                const topSpeedTune = getPlayerTopSpeedLimit();
                visualState.topSpeedLimitKph = topSpeedTune.topSpeedKph;
                visualState.topSpeedLimitPercent = topSpeedTune.topSpeedPercent;
                visualState.chargingLevelNormalized = chargingSnapshot.visualLevel;
                visualState.batteryDepleted = false;
                updateCarVisuals(visualState, frameDelta);
                processReplayEvents(replayFrame?.events);

                if (!replayController.isPlaybackActive()) {
                    clearReplayEffects();
                    clearPendingRespawn();
                    initializePlayerPhysics(car);
                    resetPlayerDamageState();
                    physicsAccumulator = 0;
                    objectiveUi.showInfo('TV replay ended.');
                }
            } else if (!isCarDestroyed && !pickupRoundFinished) {
                physicsAccumulator += frameDelta;
                const vehicleCollisionSnapshots = botTrafficSystem?.getCollisionSnapshots?.() || [];
                if (isBatteryDepleted) {
                    clearDriveKeys();
                }

                let physicsSteps = 0;
                while (physicsAccumulator >= physicsStep && physicsSteps < MAX_PHYSICS_STEPS_PER_FRAME) {
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

                // Avoid a catch-up spiral when rendering falls behind.
                if (physicsSteps === MAX_PHYSICS_STEPS_PER_FRAME && physicsAccumulator > physicsStep) {
                    physicsAccumulator = physicsStep;
                }

                const vehicleContacts = consumeVehicleCollisionContacts();
                if (vehicleContacts.length > 0) {
                    processVehicleCollisionContacts(vehicleContacts);
                }

                const crashCollision = consumeCrashCollision();
                if (crashCollision && !isCarDestroyed) {
                    triggerObstacleCrash(crashCollision);
                }

                if (!isCarDestroyed) {
                    const interpolationAlpha = physicsAccumulator / physicsStep;
                    applyInterpolatedPlayerTransform(car, interpolationAlpha);
                    vehicleState.chargingLevelNormalized = chargingSnapshot.visualLevel;
                    vehicleState.batteryDepleted = isBatteryDepleted;
                    updateCarVisuals(vehicleState, frameDelta);
                    updateBattery(vehicleState, frameDelta);
                    replayController.updateRecording(frameDelta, vehicleState);
                    skidMarksEnabled = true;
                    skidMarkVehicleState = vehicleState;
                } else {
                    physicsAccumulator = 0;
                    updateDebris(frameDelta);
                }
            } else {
                physicsAccumulator = 0;
                updateDebris(frameDelta);
            }

            const cameraSpeed = isCarDestroyed ? 0 : (visualState?.speed || 0);
            if (!replayActive) {
                updateCamera(car, cameraSpeed, frameDelta);
            }
            updateGroundMotion(car.position, cameraSpeed);
            starsController.update(frameDelta);
            if (!replayActive && !pickupRoundFinished) {
                const visiblePickupsForBots = collectibleSystem.getVisiblePickups();
                botTrafficSystem.update(car.position, visiblePickupsForBots, frameDelta);
                collectibleSystem.updateForCollectors([
                    { id: 'player', position: car.position },
                    ...botTrafficSystem.getCollectorDescriptors(),
                ], frameDelta);
                if (!pickupRoundFinished && totalCollectedCount >= ROUND_TOTAL_PICKUPS) {
                    finalizePickupRound(ROUND_TOTAL_PICKUPS, totalCollectedCount);
                }
                minimapAccumulator += frameDelta;
                if (minimapAccumulator >= MINIMAP_UPDATE_INTERVAL) {
                    const visiblePickups = collectibleSystem.getVisiblePickups();
                    const botMarkers = botTrafficSystem.getMiniMapMarkers();
                    miniMapController.update(
                        car.position,
                        car.rotation.y,
                        visiblePickups,
                        botMarkers,
                        { hidePlayer: isCarDestroyed }
                    );
                    botStatusUi.render(botTrafficSystem.getHudState());
                    minimapAccumulator = 0;
                }
            }

            updateReplayEffects(frameDelta);
            if ((replayActive || !isCarDestroyed) && (debrisPieces.length > 0 || explosionLight)) {
                updateDebris(frameDelta);
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
        batteryDepleted: isBatteryDepleted,
    });
    skidMarkController.update(frameDelta, {
        enabled: skidMarksEnabled,
        vehicle: car,
        vehicleState: skidMarkVehicleState,
    });

    updateSunLightPosition();
    renderer.render(scene, camera);
}

// Update sunlight position relative to the car
function updateSunLightPosition() {
    sunLight.position.set(car.position.x + 95, 180, car.position.z + 78);
    sunLight.target.position.set(car.position.x, car.position.y, car.position.z);
    sunLight.target.updateMatrixWorld();
}

function createChargingProgressHudController(scene, camera, options = {}) {
    const vehicle = options.vehicle || null;
    const getBatteryPercent = typeof options.getBatteryPercent === 'function'
        ? options.getBatteryPercent
        : (() => 0);
    const getBatteryNormalized = typeof options.getBatteryNormalized === 'function'
        ? options.getBatteryNormalized
        : (() => 0);
    const lowBatteryShowThreshold = THREE.MathUtils.clamp(
        Number(options.lowBatteryShowThreshold) || BATTERY_LOW_HUD_SHOW_THRESHOLD,
        0.02,
        0.95
    );
    const lowBatteryHideThreshold = THREE.MathUtils.clamp(
        Math.max(
            lowBatteryShowThreshold,
            Number(options.lowBatteryHideThreshold) || BATTERY_LOW_HUD_HIDE_THRESHOLD
        ),
        lowBatteryShowThreshold,
        0.98
    );
    const criticalBatteryShowThreshold = THREE.MathUtils.clamp(
        Number(options.criticalBatteryShowThreshold) || BATTERY_CRITICAL_HUD_SHOW_THRESHOLD,
        0.01,
        lowBatteryHideThreshold
    );
    const criticalBatteryHideThreshold = THREE.MathUtils.clamp(
        Math.max(
            criticalBatteryShowThreshold,
            Number(options.criticalBatteryHideThreshold) || BATTERY_CRITICAL_HUD_HIDE_THRESHOLD
        ),
        criticalBatteryShowThreshold,
        lowBatteryHideThreshold
    );
    const fallback = {
        update() {},
        reset() {},
    };
    if (!scene || !camera || !vehicle) {
        return fallback;
    }

    const root = new THREE.Group();
    root.name = 'charging_progress_hud';
    root.visible = false;
    scene.add(root);

    const haloMaterial = new THREE.MeshBasicMaterial({
        map: createChargingProgressHaloTexture(),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
    });
    const haloMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.95, 2.95), haloMaterial);
    root.add(haloMesh);

    const panelCanvas = document.createElement('canvas');
    panelCanvas.width = 1024;
    panelCanvas.height = 512;
    const panelCtx = panelCanvas.getContext('2d');
    const panelTexture = new THREE.CanvasTexture(panelCanvas);
    panelTexture.colorSpace = THREE.SRGBColorSpace;
    panelTexture.anisotropy = 2;
    const panelMaterial = new THREE.MeshBasicMaterial({
        map: panelTexture,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
    });
    const panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.56, 1.28), panelMaterial);
    panelMesh.position.z = 0.01;
    root.add(panelMesh);

    const state = {
        visibleBlend: 0,
        displayPercent: THREE.MathUtils.clamp(getBatteryPercent(), 0, 100),
        time: Math.random() * 11.7,
        scanPhase: Math.random() * Math.PI * 2,
        lowBatteryReminderActive: false,
        criticalBatteryAlertActive: false,
    };

    drawPanel(state.displayPercent, 0, 0, false, false, false);
    return {
        update(deltaTime = 1 / 60, {
            enabled = true,
            isCharging = false,
            chargingLevel = 0,
            batteryDepleted = false,
        } = {}) {
            const dt = Math.min(Math.max(deltaTime || 0, 0), 0.05);
            const charging = THREE.MathUtils.clamp(chargingLevel || 0, 0, 1);
            if (batteryDepleted) {
                state.visibleBlend = 0;
                root.visible = false;
                return;
            }
            const batteryNormalized = THREE.MathUtils.clamp(getBatteryNormalized(), 0, 1);
            if (state.lowBatteryReminderActive) {
                state.lowBatteryReminderActive = batteryNormalized <= lowBatteryHideThreshold;
            } else if (batteryNormalized <= lowBatteryShowThreshold) {
                state.lowBatteryReminderActive = true;
            }
            if (state.criticalBatteryAlertActive) {
                state.criticalBatteryAlertActive = batteryNormalized <= criticalBatteryHideThreshold;
            } else if (batteryNormalized <= criticalBatteryShowThreshold) {
                state.criticalBatteryAlertActive = true;
            }
            const showLowBatteryReminder = enabled && !isCharging && state.lowBatteryReminderActive;
            const targetVisible = enabled && !batteryDepleted && (isCharging || showLowBatteryReminder) ? 1 : 0;
            const visibleRate = targetVisible > state.visibleBlend ? 8.8 : 7.2;
            state.visibleBlend = THREE.MathUtils.lerp(
                state.visibleBlend,
                targetVisible,
                1 - Math.exp(-visibleRate * dt)
            );

            if (state.visibleBlend <= 0.002 && targetVisible <= 0) {
                root.visible = false;
                return;
            }

            root.visible = true;
            const targetPercent = THREE.MathUtils.clamp(getBatteryPercent(), 0, 100);
            const numberRate = isCharging ? (5.6 + charging * 9.2) : 4.2;
            state.displayPercent = THREE.MathUtils.lerp(
                state.displayPercent,
                targetPercent,
                1 - Math.exp(-numberRate * dt)
            );
            state.time += dt * (1.2 + charging * 2.6);
            state.scanPhase += dt * (1.6 + charging * 4.2);

            const hoverPulse = 0.5 + 0.5 * Math.sin(state.scanPhase * 1.7);
            const hudHeight = 1.56 + hoverPulse * (0.04 + charging * 0.08);
            root.position.set(vehicle.position.x, vehicle.position.y + hudHeight, vehicle.position.z);
            root.quaternion.copy(camera.quaternion);

            const scalePulse = 1 + (0.012 + charging * 0.035) * Math.sin(state.scanPhase * 2.9);
            const baseScale = 0.96 + state.visibleBlend * 0.2;
            root.scale.setScalar(baseScale * scalePulse);

            const haloPulse = 0.5 + 0.5 * Math.sin(state.scanPhase * 2.2);
            const isCriticalBattery = state.criticalBatteryAlertActive;
            haloMaterial.opacity = state.visibleBlend * (0.12 + charging * (0.28 + haloPulse * 0.24) + (isCriticalBattery ? 0.14 : 0));
            haloMaterial.color.setHex(isCriticalBattery ? 0xff4f5e : 0xffffff);
            haloMesh.rotation.z += dt * (0.08 + charging * 0.42);
            panelMaterial.opacity = state.visibleBlend * (0.52 + charging * 0.36);

            drawPanel(state.displayPercent, charging, state.time, isCharging, showLowBatteryReminder, isCriticalBattery);
            panelTexture.needsUpdate = true;
        },
        reset() {
            state.visibleBlend = 0;
            state.lowBatteryReminderActive = false;
            state.criticalBatteryAlertActive = false;
            root.visible = false;
        },
    };

    function drawPanel(displayPercent, charging, time, isCharging, showLowBatteryReminder, isCriticalBattery) {
        const ctx = panelCtx;
        const w = panelCanvas.width;
        const h = panelCanvas.height;
        ctx.clearRect(0, 0, w, h);

        const px = 96;
        const py = 58;
        const pw = w - px * 2;
        const ph = h - py * 2;
        const accentStroke = isCriticalBattery ? 'rgba(255, 126, 138, 0.6)' : 'rgba(152, 230, 255, 0.45)';
        const scanMidColor = isCriticalBattery
            ? `rgba(255, 116, 130, ${0.16 + charging * 0.2})`
            : `rgba(146, 239, 255, ${0.08 + charging * 0.16})`;
        const bigTextColor = isCriticalBattery ? 'rgba(255, 219, 223, 0.99)' : 'rgba(224, 252, 255, 0.98)';
        const smallTextColor = isCriticalBattery ? 'rgba(255, 176, 186, 0.97)' : 'rgba(173, 239, 255, 0.95)';
        const textShadow = isCriticalBattery ? 'rgba(255, 92, 112, 0.88)' : 'rgba(132, 231, 255, 0.85)';
        const barBgColor = isCriticalBattery ? 'rgba(58, 10, 20, 0.94)' : 'rgba(8, 32, 58, 0.92)';
        const barStrokeColor = isCriticalBattery ? 'rgba(255, 136, 148, 0.76)' : 'rgba(155, 233, 255, 0.7)';
        const tickerTextColor = isCriticalBattery ? 'rgba(255, 182, 190, 0.94)' : 'rgba(172, 240, 255, 0.9)';
        drawRoundedRect(ctx, px, py, pw, ph, 42);

        const panelGradient = ctx.createLinearGradient(px, py, px + pw, py + ph);
        if (isCriticalBattery) {
            panelGradient.addColorStop(0, 'rgba(56, 10, 20, 0.86)');
            panelGradient.addColorStop(0.52, 'rgba(42, 8, 16, 0.8)');
            panelGradient.addColorStop(1, 'rgba(31, 6, 13, 0.86)');
        } else {
            panelGradient.addColorStop(0, 'rgba(7, 24, 46, 0.84)');
            panelGradient.addColorStop(0.52, 'rgba(4, 18, 36, 0.78)');
            panelGradient.addColorStop(1, 'rgba(3, 16, 30, 0.84)');
        }
        ctx.fillStyle = panelGradient;
        ctx.fill();

        ctx.lineWidth = 3;
        ctx.strokeStyle = accentStroke;
        ctx.stroke();

        const scanY = py + ((time * 120) % ph);
        const scanGradient = ctx.createLinearGradient(px, scanY - 24, px, scanY + 24);
        if (isCriticalBattery) {
            scanGradient.addColorStop(0, 'rgba(255, 121, 135, 0)');
            scanGradient.addColorStop(0.5, scanMidColor);
            scanGradient.addColorStop(1, 'rgba(255, 121, 135, 0)');
        } else {
            scanGradient.addColorStop(0, 'rgba(126, 231, 255, 0)');
            scanGradient.addColorStop(0.5, scanMidColor);
            scanGradient.addColorStop(1, 'rgba(126, 231, 255, 0)');
        }
        ctx.fillStyle = scanGradient;
        ctx.fillRect(px + 10, scanY - 24, pw - 20, 48);

        const batteryLevel = THREE.MathUtils.clamp(getBatteryNormalized(), 0, 1);
        const bigPercentText = `${Math.round(displayPercent)}%`;
        const subText = isCharging
            ? `LAADIMINE +${CHARGING_BATTERY_GAIN_PER_SEC.toFixed(1)}%/s`
            : (isCriticalBattery ? 'CRITICAL BATTERY - CHARGE NOW' : (showLowBatteryReminder ? 'LOW BATTERY - DRIVE TO CHARGER' : 'LAADIMISE OOTEL'));

        ctx.textAlign = 'center';
        ctx.shadowColor = textShadow;
        ctx.shadowBlur = 28 + charging * 16 + (isCriticalBattery ? 10 : 0);
        ctx.fillStyle = bigTextColor;
        ctx.font = '800 122px "Orbitron", "Trebuchet MS", sans-serif';
        ctx.fillText(bigPercentText, w * 0.5, py + 168);

        ctx.shadowBlur = 10;
        ctx.fillStyle = smallTextColor;
        ctx.font = '700 32px "Orbitron", "Trebuchet MS", sans-serif';
        ctx.fillText(subText, w * 0.5, py + 216);

        const barX = px + 92;
        const barY = py + 250;
        const barW = pw - 184;
        const barH = 36;
        drawRoundedRect(ctx, barX, barY, barW, barH, 18);
        ctx.fillStyle = barBgColor;
        ctx.fill();

        const fillW = Math.max(0, Math.min(barW, barW * batteryLevel));
        if (fillW > 0) {
            drawRoundedRect(ctx, barX, barY, fillW, barH, 18);
            const fillGradient = ctx.createLinearGradient(barX, barY, barX + fillW, barY + barH);
            if (isCriticalBattery) {
                fillGradient.addColorStop(0, 'rgba(255, 94, 111, 0.86)');
                fillGradient.addColorStop(0.5, 'rgba(255, 170, 180, 0.98)');
                fillGradient.addColorStop(1, 'rgba(255, 106, 122, 0.9)');
            } else {
                fillGradient.addColorStop(0, 'rgba(112, 228, 255, 0.82)');
                fillGradient.addColorStop(0.5, 'rgba(186, 250, 255, 0.98)');
                fillGradient.addColorStop(1, 'rgba(120, 232, 255, 0.88)');
            }
            ctx.fillStyle = fillGradient;
            ctx.fill();
        }

        ctx.lineWidth = 2;
        ctx.strokeStyle = barStrokeColor;
        ctx.stroke();
        ctx.shadowBlur = 0;

        const tickerValues = [];
        for (let i = 0; i < 8; i += 1) {
            const v = THREE.MathUtils.clamp(
                displayPercent + (i - 3.5) * 0.9 + Math.sin(time * 2.6 + i * 0.86) * 1.35,
                0,
                100
            );
            tickerValues.push(`${v.toFixed(1)}%`);
        }
        const tickerText = tickerValues.join('    ');
        ctx.save();
        const tickerX = px + 92;
        const tickerY = py + 332;
        const tickerW = pw - 184;
        const tickerH = 44;
        drawRoundedRect(ctx, tickerX, tickerY - 30, tickerW, tickerH, 14);
        ctx.clip();
        ctx.font = '700 24px "Orbitron", "Trebuchet MS", sans-serif';
        ctx.fillStyle = tickerTextColor;
        const textW = ctx.measureText(tickerText).width + 80;
        const offset = (time * (130 + charging * 150)) % textW;
        const startX = tickerX + 14 - offset;
        ctx.fillText(tickerText, startX, tickerY);
        ctx.fillText(tickerText, startX + textW, tickerY);
        ctx.restore();
    }

    function drawRoundedRect(ctx, x, y, width, height, radius) {
        const r = Math.min(radius, width * 0.5, height * 0.5);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r);
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y, x + width, y, r);
        ctx.closePath();
    }
}

function createChargingProgressHaloTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const outer = ctx.createRadialGradient(cx, cy, 0, cx, cy, 340);
    outer.addColorStop(0, 'rgba(178, 244, 255, 0.36)');
    outer.addColorStop(0.56, 'rgba(118, 225, 255, 0.12)');
    outer.addColorStop(1, 'rgba(118, 225, 255, 0)');
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.arc(cx, cy, 340, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(200, 251, 255, 0.88)';
    ctx.shadowColor = 'rgba(103, 220, 255, 0.9)';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.arc(cx, cy, 248, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    return texture;
}

function createChargingZoneController(scene, chargingZones = [], options = {}) {
    const activationDelaySec = Math.max(0.2, Number(options.activationDelaySec) || 2);
    const fxVisibilityRangeSq = 92 * 92;
    const fallbackState = {
        startedThisFrame: false,
        isChargingActive: false,
        visualLevel: 0,
    };

    if (!scene || !Array.isArray(chargingZones) || chargingZones.length === 0) {
        return {
            update() {
                return fallbackState;
            },
            reset() {},
            getVisualLevel() {
                return 0;
            },
        };
    }

    const layer = new THREE.Group();
    layer.name = 'charging_zone_fx_layer';
    scene.add(layer);

    const padTexture = createChargingPadTexture();
    const sweepTexture = createChargingSweepTexture();
    const pulseTexture = createChargingPulseTexture();
    const sparkTexture = createChargingSparkTexture();
    const symbolTexture = createChargingZoneSymbolTexture();
    const zoneVisuals = chargingZones.map((zone, index) => {
        const radius = Math.max(1.2, Number(zone.radius) || 2.45);
        const coreRadius = radius * 0.86;
        const anchorY = Number.isFinite(zone.y)
            ? zone.y + 0.022
            : (getGroundHeightAt(zone.x, zone.z) + 0.08);

        const zoneGroup = new THREE.Group();
        zoneGroup.position.set(zone.x, anchorY, zone.z);
        layer.add(zoneGroup);

        const padMaterial = new THREE.MeshBasicMaterial({
            map: padTexture,
            transparent: true,
            opacity: 0.05,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
        });
        const pad = new THREE.Mesh(
            new THREE.PlaneGeometry(radius * 2.74, radius * 2.74),
            padMaterial
        );
        pad.rotation.x = -Math.PI / 2;
        zoneGroup.add(pad);

        const innerMaterial = new THREE.MeshBasicMaterial({
            map: pulseTexture,
            transparent: true,
            opacity: 0.06,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
        });
        const inner = new THREE.Mesh(
            new THREE.PlaneGeometry(coreRadius * 2.12, coreRadius * 2.12),
            innerMaterial
        );
        inner.rotation.x = -Math.PI / 2;
        inner.position.y = 0.0035;
        zoneGroup.add(inner);

        const sweepMaterial = new THREE.MeshBasicMaterial({
            map: sweepTexture,
            transparent: true,
            opacity: 0.08,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
        });
        const sweep = new THREE.Mesh(
            new THREE.PlaneGeometry(radius * 2.7, radius * 2.7),
            sweepMaterial
        );
        sweep.rotation.x = -Math.PI / 2;
        sweep.position.y = 0.0062;
        zoneGroup.add(sweep);

        const counterSweepMaterial = new THREE.MeshBasicMaterial({
            map: sweepTexture,
            transparent: true,
            opacity: 0.04,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
        });
        const counterSweep = new THREE.Mesh(
            new THREE.PlaneGeometry(radius * 2.45, radius * 2.45),
            counterSweepMaterial
        );
        counterSweep.rotation.x = -Math.PI / 2;
        counterSweep.position.y = 0.0067;
        counterSweep.scale.set(0.98, 0.98, 1);
        zoneGroup.add(counterSweep);

        const pulseMaterial = new THREE.MeshBasicMaterial({
            map: pulseTexture,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
        });
        const pulse = new THREE.Mesh(
            new THREE.PlaneGeometry(coreRadius * 1.7, coreRadius * 1.7),
            pulseMaterial
        );
        pulse.rotation.x = -Math.PI / 2;
        pulse.position.y = 0.007;
        zoneGroup.add(pulse);

        const sparkMaterial = new THREE.MeshBasicMaterial({
            map: sparkTexture,
            transparent: true,
            opacity: 0.02,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
        });
        const spark = new THREE.Mesh(
            new THREE.PlaneGeometry(radius * 2.46, radius * 2.46),
            sparkMaterial
        );
        spark.rotation.x = -Math.PI / 2;
        spark.position.y = 0.0076;
        zoneGroup.add(spark);

        const symbolMaterial = new THREE.MeshBasicMaterial({
            map: symbolTexture,
            transparent: true,
            opacity: 0.12,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
        });
        const symbol = new THREE.Mesh(
            new THREE.PlaneGeometry(coreRadius * 1.26, coreRadius * 1.26),
            symbolMaterial
        );
        symbol.rotation.x = -Math.PI / 2;
        symbol.position.y = 0.008;
        zoneGroup.add(symbol);

        return {
            index,
            x: zone.x,
            z: zone.z,
            radius,
            pad,
            inner,
            sweep,
            counterSweep,
            pulse,
            spark,
            zoneGroup,
            symbol,
            symbolYaw: Math.random() * Math.PI * 2,
            sweepYaw: Math.random() * Math.PI * 2,
            counterSweepYaw: Math.random() * Math.PI * 2,
            sparkYaw: Math.random() * Math.PI * 2,
        };
    });

    const state = {
        insideZoneIndex: -1,
        insideTimer: 0,
        isCharging: false,
        visualLevel: 0,
        pulsePhase: Math.random() * Math.PI * 2,
    };
    const snapshot = {
        startedThisFrame: false,
        isChargingActive: false,
        visualLevel: 0,
    };

    applyVisuals(0, 0, -1, 0);

    return {
        update(playerPosition, deltaTime = 1 / 60, { enabled = true } = {}) {
            const dt = Math.min(Math.max(deltaTime || 0, 0), 0.05);
            snapshot.startedThisFrame = false;

            if (!enabled || !playerPosition) {
                state.insideZoneIndex = -1;
                state.insideTimer = 0;
                state.isCharging = false;
                for (let i = 0; i < zoneVisuals.length; i += 1) {
                    zoneVisuals[i].zoneGroup.visible = false;
                }
            } else {
                const insideZoneIndex = findInsideZoneIndex(playerPosition.x, playerPosition.z);
                for (let i = 0; i < zoneVisuals.length; i += 1) {
                    const zone = zoneVisuals[i];
                    const dx = playerPosition.x - zone.x;
                    const dz = playerPosition.z - zone.z;
                    zone.zoneGroup.visible = (dx * dx + dz * dz) <= fxVisibilityRangeSq || i === insideZoneIndex;
                }
                if (insideZoneIndex >= 0) {
                    if (insideZoneIndex !== state.insideZoneIndex) {
                        state.insideZoneIndex = insideZoneIndex;
                        state.insideTimer = 0;
                        state.isCharging = false;
                    } else {
                        state.insideTimer += dt;
                    }
                    if (!state.isCharging && state.insideTimer >= activationDelaySec) {
                        state.isCharging = true;
                        snapshot.startedThisFrame = true;
                    }
                } else {
                    state.insideZoneIndex = -1;
                    state.insideTimer = 0;
                    state.isCharging = false;
                }
            }

            const targetVisual = state.isCharging ? 1 : 0;
            const visualRate = targetVisual > state.visualLevel ? 8.2 : 4.6;
            state.visualLevel = THREE.MathUtils.lerp(
                state.visualLevel,
                targetVisual,
                1 - Math.exp(-visualRate * dt)
            );
            state.pulsePhase += dt * (2 + state.visualLevel * 4.8);

            const activationProgress = state.insideZoneIndex >= 0
                ? THREE.MathUtils.clamp(state.insideTimer / activationDelaySec, 0, 1)
                : 0;
            applyVisuals(state.visualLevel, activationProgress, state.insideZoneIndex, dt);

            snapshot.isChargingActive = state.isCharging && state.insideZoneIndex >= 0;
            snapshot.visualLevel = state.visualLevel;
            return snapshot;
        },
        reset() {
            state.insideZoneIndex = -1;
            state.insideTimer = 0;
            state.isCharging = false;
            state.visualLevel = 0;
            applyVisuals(0, 0, -1, 0);
            snapshot.startedThisFrame = false;
            snapshot.isChargingActive = false;
            snapshot.visualLevel = 0;
        },
        getVisualLevel() {
            return state.visualLevel;
        },
    };

    function findInsideZoneIndex(x, z) {
        let insideIndex = -1;
        let nearestDistanceSq = Number.POSITIVE_INFINITY;
        for (let i = 0; i < zoneVisuals.length; i += 1) {
            const zone = zoneVisuals[i];
            const dx = x - zone.x;
            const dz = z - zone.z;
            const distanceSq = dx * dx + dz * dz;
            if (distanceSq > zone.radius * zone.radius) {
                continue;
            }
            if (distanceSq < nearestDistanceSq) {
                nearestDistanceSq = distanceSq;
                insideIndex = i;
            }
        }
        return insideIndex;
    }

    function applyVisuals(activeLevel, activationProgress, insideZoneIndex, dt) {
        for (let i = 0; i < zoneVisuals.length; i += 1) {
            const zone = zoneVisuals[i];
            if (!zone.zoneGroup.visible) {
                continue;
            }
            const isInside = i === insideZoneIndex;
            const prep = isInside ? activationProgress : 0;
            const pulse = 0.5 + 0.5 * Math.sin(state.pulsePhase + zone.index * 0.82);
            const fastPulse = 0.5 + 0.5 * Math.sin(state.pulsePhase * 1.72 + zone.index * 1.37);
            const prepEase = prep * prep * (3 - 2 * prep);
            const zoneActiveLevel = isInside ? activeLevel : 0;

            zone.pad.material.opacity = 0.02 + prepEase * 0.14 + zoneActiveLevel * (0.18 + pulse * 0.24);
            zone.pad.scale.setScalar(1 + zoneActiveLevel * (0.02 + fastPulse * 0.04));

            zone.inner.material.opacity = 0.03 + prepEase * 0.2 + zoneActiveLevel * (0.2 + pulse * 0.3);
            zone.inner.scale.setScalar(1 + zoneActiveLevel * (0.04 + fastPulse * 0.07));

            zone.sweep.material.opacity = 0.03 + prepEase * 0.17 + zoneActiveLevel * (0.16 + pulse * 0.26);
            zone.counterSweep.material.opacity = 0.01 + prepEase * 0.09 + zoneActiveLevel * (0.1 + fastPulse * 0.2);
            zone.spark.material.opacity = prepEase * 0.06 + zoneActiveLevel * (0.08 + fastPulse * 0.3);

            const rippleTravel = (state.pulsePhase * (0.11 + zoneActiveLevel * 0.16) + zone.index * 0.07) % 1;
            zone.pulse.material.opacity = zoneActiveLevel * (0.16 + (1 - rippleTravel) * 0.38 + pulse * 0.12);
            zone.pulse.scale.setScalar(0.84 + rippleTravel * (0.64 + zoneActiveLevel * 0.82));

            zone.symbolYaw += (0.12 + zoneActiveLevel * 1.55) * dt;
            zone.sweepYaw += (0.26 + zoneActiveLevel * 2.5) * dt;
            zone.counterSweepYaw -= (0.14 + zoneActiveLevel * 1.6) * dt;
            zone.sparkYaw -= (0.22 + zoneActiveLevel * 3.2) * dt;
            zone.sweep.rotation.z = zone.sweepYaw;
            zone.counterSweep.rotation.z = zone.counterSweepYaw;
            zone.spark.rotation.z = zone.sparkYaw;
            zone.symbol.material.opacity = 0.1 + prepEase * 0.26 + zoneActiveLevel * (0.26 + pulse * 0.26);
            zone.symbol.rotation.z = zone.symbolYaw;
        }
    }
}

function createChargingZoneSymbolTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    const haloGradient = ctx.createRadialGradient(cx, cy, 12, cx, cy, 190);
    haloGradient.addColorStop(0, 'rgba(201, 248, 255, 0.3)');
    haloGradient.addColorStop(0.6, 'rgba(133, 224, 250, 0.1)');
    haloGradient.addColorStop(1, 'rgba(133, 224, 250, 0)');
    ctx.fillStyle = haloGradient;
    ctx.beginPath();
    ctx.arc(cx, cy, 190, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(180, 246, 255, 0.95)';
    ctx.shadowColor = 'rgba(90, 220, 255, 0.9)';
    ctx.shadowBlur = 18;
    ctx.lineCap = 'round';
    ctx.lineWidth = 14;

    const arcs = [
        { radius: 74, start: Math.PI * 1.14, end: Math.PI * 1.86 },
        { radius: 116, start: Math.PI * 1.2, end: Math.PI * 1.8 },
    ];
    for (let i = 0; i < arcs.length; i += 1) {
        const arc = arcs[i];
        ctx.beginPath();
        ctx.arc(cx, cy, arc.radius, arc.start, arc.end);
        ctx.stroke();
    }

    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 88);
    ctx.lineTo(cx, cy + 6);
    ctx.stroke();

    ctx.fillStyle = 'rgba(217, 253, 255, 0.98)';
    ctx.beginPath();
    ctx.arc(cx, cy + 114, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function createChargingPadTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const softHalo = ctx.createRadialGradient(cx, cy, 0, cx, cy, 492);
    softHalo.addColorStop(0, 'rgba(188, 248, 255, 0.36)');
    softHalo.addColorStop(0.45, 'rgba(126, 226, 255, 0.15)');
    softHalo.addColorStop(0.78, 'rgba(126, 226, 255, 0.06)');
    softHalo.addColorStop(1, 'rgba(126, 226, 255, 0)');
    ctx.fillStyle = softHalo;
    ctx.beginPath();
    ctx.arc(cx, cy, 492, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(199, 251, 255, 0.9)';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(109, 228, 255, 0.9)';
    ctx.shadowBlur = 30;
    ctx.lineWidth = 28;
    ctx.beginPath();
    ctx.arc(cx, cy, 334, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(166, 236, 255, 0.78)';
    ctx.beginPath();
    ctx.arc(cx, cy, 252, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0;
    for (let i = 0; i < 52; i += 1) {
        const angle = (i / 52) * Math.PI * 2;
        const radius = 392;
        const dotX = cx + Math.cos(angle) * radius;
        const dotY = cy + Math.sin(angle) * radius;
        const alpha = 0.05 + (i % 4 === 0 ? 0.1 : 0.02);
        ctx.fillStyle = `rgba(173, 236, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(dotX, dotY, i % 4 === 0 ? 2.4 : 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    for (let i = 0; i < 34; i += 1) {
        const angle = (i / 34) * Math.PI * 2;
        const innerRadius = 280;
        const outerRadius = 310;
        const x1 = cx + Math.cos(angle) * innerRadius;
        const y1 = cy + Math.sin(angle) * innerRadius;
        const x2 = cx + Math.cos(angle) * outerRadius;
        const y2 = cy + Math.sin(angle) * outerRadius;
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(195, 250, 255, 0.12)' : 'rgba(168, 237, 255, 0.06)';
        ctx.lineWidth = i % 2 === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function createChargingSweepTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(194, 250, 255, 0.98)';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(111, 225, 255, 0.96)';
    ctx.shadowBlur = 24;
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.arc(cx, cy, 326, THREE.MathUtils.degToRad(-34), THREE.MathUtils.degToRad(38));
    ctx.stroke();

    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(160, 238, 255, 0.88)';
    ctx.beginPath();
    ctx.arc(cx, cy, 262, THREE.MathUtils.degToRad(-46), THREE.MathUtils.degToRad(52));
    ctx.stroke();

    ctx.shadowBlur = 0;
    const beamGradient = ctx.createLinearGradient(cx - 250, cy - 34, cx + 250, cy + 34);
    beamGradient.addColorStop(0, 'rgba(175, 246, 255, 0)');
    beamGradient.addColorStop(0.3, 'rgba(175, 246, 255, 0.24)');
    beamGradient.addColorStop(0.5, 'rgba(213, 253, 255, 0.88)');
    beamGradient.addColorStop(0.7, 'rgba(175, 246, 255, 0.24)');
    beamGradient.addColorStop(1, 'rgba(175, 246, 255, 0)');
    ctx.fillStyle = beamGradient;
    ctx.fillRect(cx - 250, cy - 28, 500, 56);

    for (let i = 0; i < 8; i += 1) {
        const t = i / 7;
        const angle = THREE.MathUtils.degToRad(-24 + t * 46);
        const x1 = cx + Math.cos(angle) * 242;
        const y1 = cy + Math.sin(angle) * 242;
        const x2 = cx + Math.cos(angle) * 350;
        const y2 = cy + Math.sin(angle) * 350;
        ctx.strokeStyle = `rgba(196, 251, 255, ${0.2 + (1 - Math.abs(t - 0.5) * 2) * 0.16})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function createChargingPulseTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const ringGlow = ctx.createRadialGradient(cx, cy, 96, cx, cy, 312);
    ringGlow.addColorStop(0, 'rgba(154, 234, 255, 0)');
    ringGlow.addColorStop(0.48, 'rgba(178, 245, 255, 0.28)');
    ringGlow.addColorStop(0.65, 'rgba(208, 252, 255, 0.58)');
    ringGlow.addColorStop(0.78, 'rgba(154, 234, 255, 0.2)');
    ringGlow.addColorStop(1, 'rgba(154, 234, 255, 0)');
    ctx.fillStyle = ringGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, 312, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function createChargingSparkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 74; i += 1) {
        const angle = (i / 74) * Math.PI * 2;
        const radius = 238 + ((i * 53) % 104);
        const sparkRadius = i % 6 === 0 ? 4.6 : 2.2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        const alpha = i % 6 === 0 ? 0.32 : 0.16;
        ctx.fillStyle = `rgba(201, 251, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, sparkRadius, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.strokeStyle = 'rgba(195, 250, 255, 0.34)';
    ctx.shadowColor = 'rgba(110, 229, 255, 0.6)';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 292, THREE.MathUtils.degToRad(-22), THREE.MathUtils.degToRad(36));
    ctx.stroke();
    ctx.shadowBlur = 0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function createSkidMarkAlphaTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const edgeGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    edgeGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    edgeGradient.addColorStop(0.28, 'rgba(255, 255, 255, 0.76)');
    edgeGradient.addColorStop(0.72, 'rgba(255, 255, 255, 0.76)');
    edgeGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = edgeGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'destination-in';
    const lengthFade = ctx.createLinearGradient(0, 0, 0, canvas.height);
    lengthFade.addColorStop(0, 'rgba(255, 255, 255, 0)');
    lengthFade.addColorStop(0.22, 'rgba(255, 255, 255, 0.8)');
    lengthFade.addColorStop(0.78, 'rgba(255, 255, 255, 0.8)');
    lengthFade.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = lengthFade;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    for (let i = 0; i < 26; i += 1) {
        const x = 10 + Math.random() * (canvas.width - 20);
        const width = 1 + Math.random() * 2;
        const alpha = 0.02 + Math.random() * 0.05;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fillRect(x, 0, width, canvas.height);
    }

    const texture = new THREE.CanvasTexture(canvas);
    if (THREE.NoColorSpace) {
        texture.colorSpace = THREE.NoColorSpace;
    }
    texture.anisotropy = 2;
    return texture;
}

function createDriftSmokeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const center = canvas.width * 0.5;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const coreGradient = ctx.createRadialGradient(center, center, 10, center, center, center);
    coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.88)');
    coreGradient.addColorStop(0.44, 'rgba(255, 255, 255, 0.52)');
    coreGradient.addColorStop(0.78, 'rgba(255, 255, 255, 0.12)');
    coreGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(center, center, center, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 28; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 24 + Math.random() * 92;
        const x = center + Math.cos(angle) * radius;
        const y = center + Math.sin(angle) * radius;
        const size = 8 + Math.random() * 22;
        const alpha = 0.02 + Math.random() * 0.07;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    if (THREE.NoColorSpace) {
        texture.colorSpace = THREE.NoColorSpace;
    }
    texture.anisotropy = 2;
    return texture;
}

function createSkidMarkController(scene, options = {}) {
    const sampleGroundHeight = typeof options.sampleGroundHeight === 'function'
        ? options.sampleGroundHeight
        : (() => 0);
    if (!scene) {
        return {
            update() {},
            reset() {},
        };
    }

    const layer = new THREE.Group();
    layer.name = 'skid_mark_layer';
    scene.add(layer);

    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        alphaMap: createSkidMarkAlphaTexture(),
        transparent: true,
        opacity: SKID_MARK_BASE_OPACITY,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexColors: true,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        toneMapped: false,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, SKID_MARK_MAX_SEGMENTS);
    mesh.name = 'skid_mark_instances';
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    layer.add(mesh);
    const smokeTexture = createDriftSmokeTexture();

    const state = {
        nextIndex: 0,
        activeCount: 0,
        hasPreviousWheelSample: false,
        smokeSpawnCarry: 0,
        previousLeftWheel: new THREE.Vector3(),
        previousRightWheel: new THREE.Vector3(),
    };
    const smokeParticles = [];
    const localRearLeft = new THREE.Vector3(-SKID_MARK_REAR_WHEEL_OFFSET_X, 0, SKID_MARK_REAR_WHEEL_OFFSET_Z);
    const localRearRight = new THREE.Vector3(SKID_MARK_REAR_WHEEL_OFFSET_X, 0, SKID_MARK_REAR_WHEEL_OFFSET_Z);
    const worldRearLeft = new THREE.Vector3();
    const worldRearRight = new THREE.Vector3();
    const segmentStart = new THREE.Vector3();
    const segmentEnd = new THREE.Vector3();
    const segmentMidpoint = new THREE.Vector3();
    const segmentDirection = new THREE.Vector3();
    const wheelDelta = new THREE.Vector3();
    const instanceColor = new THREE.Color();
    const instanceDummy = new THREE.Object3D();
    const smokeSpawnPosition = new THREE.Vector3();

    return {
        update(deltaTime = 1 / 60, {
            enabled = true,
            vehicle = null,
            vehicleState = null,
        } = {}) {
            const dt = Math.min(Math.max(deltaTime || 0, 0), 0.05);
            updateSmokeParticles(dt);
            if (!enabled || !vehicle || !vehicleState) {
                resetWheelSamples();
                return;
            }

            const speedAbs = Math.abs(vehicleState.speed || 0);
            const steerAbs = Math.abs(vehicleState.steerInput || 0);
            const throttle = THREE.MathUtils.clamp(vehicleState.throttle || 0, 0, 1);
            const brake = THREE.MathUtils.clamp(vehicleState.brake || 0, 0, 1);
            const burnout = THREE.MathUtils.clamp(vehicleState.burnout || 0, 0, 1);
            const yawRateAbs = Math.abs(vehicleState.yawRate || 0);
            const lateralAbs = Math.abs(getLateralSpeed(vehicleState, vehicle.rotation.y));

            const burnoutSmokeActive = keys.handbrake && keys.forward && throttle > 0.12;
            if (!burnoutSmokeActive) {
                resetWheelSamples();
                return;
            }
            const steeringActive = (keys.left || keys.right) && steerAbs > 0.14;
            const handbrakeDrift = steeringActive && speedAbs >= 2.1;
            const burnoutSmokeSignal = THREE.MathUtils.clamp(
                throttle * 0.44
                + brake * 0.22
                + burnout * 0.42
                + THREE.MathUtils.clamp(1 - speedAbs / 16, 0, 1) * 0.24
                + THREE.MathUtils.clamp((yawRateAbs - 0.2) / 3.5, 0, 1) * 0.18,
                0,
                1.9
            );
            let smokeIntensity = THREE.MathUtils.clamp(0.32 + burnoutSmokeSignal * 0.52, 0, 1);
            const driftSignal = THREE.MathUtils.clamp(
                (lateralAbs - 1.2) / 5.6
                + Math.max(0, yawRateAbs - 0.3) * 0.18
                + Math.max(0, steerAbs - 0.08) * 0.6
                + brake * 0.28
                + burnout * 0.4
                + throttle * 0.16,
                0,
                1.8
            );
            const driftIntensity = handbrakeDrift
                ? THREE.MathUtils.clamp(0.56 + driftSignal * 0.38, 0, 1)
                : 0;
            smokeIntensity = Math.max(smokeIntensity, driftIntensity);
            const burnoutMarkIntensity = THREE.MathUtils.clamp(
                0.24 + burnoutSmokeSignal * 0.46 + THREE.MathUtils.clamp(speedAbs / 14, 0, 1) * 0.22,
                0,
                1
            );
            const markIntensity = handbrakeDrift
                ? Math.max(driftIntensity, burnoutMarkIntensity * 0.88)
                : burnoutMarkIntensity * 0.82;

            vehicle.updateMatrixWorld(true);
            worldRearLeft.copy(localRearLeft);
            worldRearRight.copy(localRearRight);
            vehicle.localToWorld(worldRearLeft);
            vehicle.localToWorld(worldRearRight);
            worldRearLeft.y = sampleSurfaceY(worldRearLeft.x, worldRearLeft.z);
            worldRearRight.y = sampleSurfaceY(worldRearRight.x, worldRearRight.z);
            spawnDriftSmoke(worldRearLeft, worldRearRight, smokeIntensity, speedAbs, vehicleState, dt);

            if (markIntensity <= 0.08 || speedAbs < 0.45) {
                resetWheelSamples();
                return;
            }

            if (!state.hasPreviousWheelSample) {
                state.previousLeftWheel.copy(worldRearLeft);
                state.previousRightWheel.copy(worldRearRight);
                state.hasPreviousWheelSample = true;
                return;
            }

            const smokeDensity = THREE.MathUtils.clamp(smokeParticles.length / DRIFT_SMOKE_MAX_PARTICLES, 0, 1);
            const wroteLeft = addWheelTrail(state.previousLeftWheel, worldRearLeft, markIntensity, smokeDensity);
            const wroteRight = addWheelTrail(state.previousRightWheel, worldRearRight, markIntensity, smokeDensity);
            if (wroteLeft || wroteRight) {
                mesh.instanceMatrix.needsUpdate = true;
                if (mesh.instanceColor) {
                    mesh.instanceColor.needsUpdate = true;
                }
            }

            state.previousLeftWheel.copy(worldRearLeft);
            state.previousRightWheel.copy(worldRearRight);
        },
        reset() {
            resetWheelSamples();
            state.nextIndex = 0;
            state.activeCount = 0;
            state.smokeSpawnCarry = 0;
            mesh.count = 0;
            clearSmokeParticles();
        },
    };

    function resetWheelSamples() {
        state.hasPreviousWheelSample = false;
    }

    function sampleSurfaceY(x, z) {
        const height = sampleGroundHeight(x, z);
        const resolvedHeight = Number.isFinite(height) ? height : 0;
        return Math.max(resolvedHeight, SKID_MARK_SURFACE_BASE_HEIGHT) + SKID_MARK_SURFACE_OFFSET;
    }

    function clearSmokeParticles() {
        for (let i = smokeParticles.length - 1; i >= 0; i -= 1) {
            const particle = smokeParticles[i];
            if (particle?.mesh?.parent) {
                particle.mesh.parent.remove(particle.mesh);
            }
            particle?.mesh?.material?.dispose?.();
        }
        smokeParticles.length = 0;
    }

    function spawnDriftSmoke(leftWheelPosition, rightWheelPosition, intensity, speedAbs, vehicleStateSnapshot, dt) {
        if (dt <= 0) {
            return;
        }

        const speedFactor = THREE.MathUtils.clamp(speedAbs / 16, 0.35, 1);
        const targetSpawnRate = DRIFT_SMOKE_SPAWN_RATE * (0.48 + intensity * 1.02) * speedFactor;
        state.smokeSpawnCarry += targetSpawnRate * dt;
        const particleBudget = Math.floor(state.smokeSpawnCarry);
        if (particleBudget <= 0) {
            return;
        }
        state.smokeSpawnCarry -= particleBudget;

        const velocityX = Number.isFinite(vehicleStateSnapshot?.velocity?.x)
            ? vehicleStateSnapshot.velocity.x
            : 0;
        const velocityZ = Number.isFinite(vehicleStateSnapshot?.velocity?.y)
            ? vehicleStateSnapshot.velocity.y
            : 0;
        const emissionCount = Math.min(12, particleBudget);
        for (let i = 0; i < emissionCount; i += 1) {
            const spawnFromLeftWheel = Math.random() < 0.5;
            smokeSpawnPosition.copy(spawnFromLeftWheel ? leftWheelPosition : rightWheelPosition);
            smokeSpawnPosition.y += 0.03 + Math.random() * 0.04;
            spawnSmokeParticle(smokeSpawnPosition, intensity, velocityX, velocityZ);
        }
    }

    function spawnSmokeParticle(position, intensity, velocityX, velocityZ) {
        if (smokeParticles.length >= DRIFT_SMOKE_MAX_PARTICLES) {
            removeSmokeParticle(0);
        }

        const material = new THREE.SpriteMaterial({
            map: smokeTexture,
            color: new THREE.Color().setScalar(THREE.MathUtils.lerp(0.28, 0.16, intensity)),
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: true,
            toneMapped: false,
        });
        const sprite = new THREE.Sprite(material);
        const startScale = THREE.MathUtils.lerp(0.42, 0.82, intensity) * (0.86 + Math.random() * 0.7);
        sprite.position.copy(position);
        sprite.scale.setScalar(startScale);
        layer.add(sprite);

        smokeParticles.push({
            mesh: sprite,
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 1.05 + velocityX * 0.03,
                0.65 + Math.random() * 0.92 + intensity * 0.4,
                (Math.random() - 0.5) * 1.05 + velocityZ * 0.03
            ),
            life: THREE.MathUtils.lerp(DRIFT_SMOKE_LIFE_MIN, DRIFT_SMOKE_LIFE_MAX, Math.random())
                * (0.9 + intensity * 0.48),
            maxLife: 1,
            growthRate: 0.74 + Math.random() * 0.76 + intensity * 0.4,
            baseOpacity: THREE.MathUtils.lerp(0.38, 0.82, intensity),
        });
        const particle = smokeParticles[smokeParticles.length - 1];
        particle.maxLife = particle.life;
    }

    function updateSmokeParticles(dt) {
        if (smokeParticles.length === 0 || dt <= 0) {
            return;
        }

        const drag = Math.exp(-1.7 * dt);
        for (let i = smokeParticles.length - 1; i >= 0; i -= 1) {
            const particle = smokeParticles[i];
            particle.life -= dt;
            if (particle.life <= 0) {
                removeSmokeParticle(i);
                continue;
            }

            particle.velocity.x *= drag;
            particle.velocity.z *= drag;
            particle.velocity.y += 0.45 * dt;
            particle.mesh.position.addScaledVector(particle.velocity, dt);
            const lifeRatio = THREE.MathUtils.clamp(particle.life / particle.maxLife, 0, 1);
            const fadeIn = THREE.MathUtils.clamp((1 - lifeRatio) * 9.2, 0, 1);
            particle.mesh.material.opacity = particle.baseOpacity * fadeIn * Math.pow(lifeRatio, 0.54);
            const scaleGrowth = 1 + particle.growthRate * dt;
            particle.mesh.scale.multiplyScalar(scaleGrowth);
        }
    }

    function removeSmokeParticle(index) {
        const particle = smokeParticles[index];
        if (!particle) {
            return;
        }
        if (particle.mesh?.parent) {
            particle.mesh.parent.remove(particle.mesh);
        }
        particle.mesh?.material?.dispose?.();
        smokeParticles.splice(index, 1);
    }

    function getLateralSpeed(vehicleStateSnapshot, headingYaw) {
        const velocity = vehicleStateSnapshot?.velocity;
        if (!velocity || !Number.isFinite(velocity.x) || !Number.isFinite(velocity.y)) {
            return 0;
        }
        const rightX = Math.cos(headingYaw);
        const rightZ = -Math.sin(headingYaw);
        return velocity.x * rightX + velocity.y * rightZ;
    }

    function addWheelTrail(from, to, intensity, smokeDensity = 0) {
        wheelDelta.subVectors(to, from);
        const distance = wheelDelta.length();
        if (distance < SKID_MARK_MIN_SEGMENT_LENGTH) {
            return false;
        }

        const splitCount = Math.max(1, Math.ceil(distance / SKID_MARK_MAX_SEGMENT_LENGTH));
        let wroteAny = false;
        for (let i = 0; i < splitCount; i += 1) {
            const t0 = i / splitCount;
            const t1 = (i + 1) / splitCount;
            segmentStart.lerpVectors(from, to, t0);
            segmentEnd.lerpVectors(from, to, t1);
            if (writeSegment(segmentStart, segmentEnd, intensity, smokeDensity)) {
                wroteAny = true;
            }
        }
        return wroteAny;
    }

    function writeSegment(from, to, intensity, smokeDensity = 0) {
        segmentDirection.subVectors(to, from);
        const length = segmentDirection.length();
        if (length < 0.0001) {
            return false;
        }

        segmentDirection.multiplyScalar(1 / length);
        segmentMidpoint.copy(from).add(to).multiplyScalar(0.5);

        const width = SKID_MARK_BASE_WIDTH * THREE.MathUtils.lerp(0.84, 1.26, intensity);
        const stretchedLength = THREE.MathUtils.clamp(
            length * (1.02 + intensity * 0.1),
            SKID_MARK_MIN_SEGMENT_LENGTH,
            SKID_MARK_MAX_SEGMENT_LENGTH * 1.2
        );
        const baseGray = THREE.MathUtils.lerp(0.32, 0.16, intensity);
        const smokeSoftenedGray = THREE.MathUtils.lerp(baseGray, 0.42, smokeDensity * SKID_MARK_SMOKE_BLEND_STRENGTH);
        const grayscale = THREE.MathUtils.clamp(smokeSoftenedGray, 0, 1);
        instanceColor.setScalar(grayscale);

        instanceDummy.position.copy(segmentMidpoint);
        instanceDummy.position.y += 0.0008;
        instanceDummy.rotation.set(0, Math.atan2(segmentDirection.x, segmentDirection.z), 0);
        instanceDummy.scale.set(width, stretchedLength, 1);
        instanceDummy.updateMatrix();

        mesh.setMatrixAt(state.nextIndex, instanceDummy.matrix);
        mesh.setColorAt(state.nextIndex, instanceColor);
        state.nextIndex = (state.nextIndex + 1) % SKID_MARK_MAX_SEGMENTS;
        state.activeCount = Math.min(SKID_MARK_MAX_SEGMENTS, state.activeCount + 1);
        mesh.count = state.activeCount;
        return true;
    }
}

function triggerCarExplosion(hitPosition, pickupColorHex, targetColorHex, options = {}) {
    if (isCarDestroyed || pickupRoundFinished) {
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

    replayController.recordEvent(REPLAY_EVENT_CRASH, {
        x: hitPosition.x,
        y: hitPosition.y,
        z: hitPosition.z,
        pickupColorHex,
        targetColorHex,
        collision: replayCollision,
    });
    replayController.stopRecording();
    replayController.stopPlayback();
    isCarDestroyed = true;
    setBatteryDepletedState(false, { showStatus: false });
    chargingZoneController.reset();
    chargingProgressHudController.reset();
    collectibleSystem.setEnabled(false);
    car.visible = false;
    clearDriveKeys();

    playerCarsRemaining = Math.max(0, playerCarsRemaining - 1);

    const crashReason = options.statusText
        || `Wrong (${colorNameFromHex(pickupColorHex)})! Correct was ${colorNameFromHex(targetColorHex)}.`;
    spawnCarDebris(hitPosition, options.collision || null);

    if (playerCarsRemaining > 0) {
        objectiveUi.showCrash(
            `${crashReason} New car arrives in ${Math.round(PLAYER_RESPAWN_DELAY_MS / 100) / 10}s. `
            + `Cars left: ${playerCarsRemaining}/${PLAYER_CAR_POOL_SIZE}.`
        );
        pendingRespawnTimeout = window.setTimeout(() => {
            pendingRespawnTimeout = null;
            respawnPlayerCar();
        }, PLAYER_RESPAWN_DELAY_MS);
        return;
    }

    objectiveUi.showCrash(`${crashReason} No cars left. Press Q to restart.`);
}

function triggerObstacleCrash(collision) {
    const obstacleLabel = collision.obstacleCategory === 'building'
        ? 'a building'
        : (collision.obstacleCategory === 'tree' ? 'a tree' : 'a lamp post');
    const speedLabel = Math.round(collision.impactSpeed);
    triggerCarExplosion(collision.position, 0xffa66b, 0xff4b4b, {
        statusText: `You hit ${obstacleLabel} at high speed (${speedLabel}).`,
        collision,
    });
}

function setBatteryDepletedState(nextDepleted, options = {}) {
    const depleted = Boolean(nextDepleted);
    if (depleted === isBatteryDepleted) {
        setPlayerBatteryDepleted(isBatteryDepleted);
        return isBatteryDepleted;
    }
    isBatteryDepleted = depleted;
    setPlayerBatteryDepleted(isBatteryDepleted);
    if (isBatteryDepleted) {
        clearDriveKeys();
        if (options.showStatus !== false) {
            objectiveUi.showInfo('Battery empty. Suspension collapsed. Charge to recover.', 2600);
        }
    } else if (options.showStatus !== false) {
        objectiveUi.showInfo('Battery restored. Drive systems online.', 1600);
    }
    return isBatteryDepleted;
}

function updateBattery(vehicleState, dt) {
    if (isCarDestroyed || pickupRoundFinished) {
        return;
    }

    const speedAbs = Math.abs(vehicleState.speed || 0);
    const drain = (BATTERY_IDLE_DRAIN_PER_SEC + speedAbs * BATTERY_SPEED_DRAIN_PER_SPEED) * dt;
    if (drain <= 0) {
        return;
    }

    playerBattery = Math.max(0, playerBattery - drain);
    setPlayerBatteryLevel(playerBattery / BATTERY_MAX);
    if (!isBatteryDepleted && playerBattery <= BATTERY_DEPLETED_TRIGGER_LEVEL) {
        playerBattery = 0;
        setPlayerBatteryLevel(0);
        setBatteryDepletedState(true);
    }
}

function addBattery(amount) {
    playerBattery = Math.min(BATTERY_MAX, playerBattery + Math.max(0, amount));
    setPlayerBatteryLevel(playerBattery / BATTERY_MAX);
    if (isBatteryDepleted && playerBattery >= BATTERY_DEPLETED_RECOVER_LEVEL) {
        setBatteryDepletedState(false);
    }
}

function finalizePickupRound(totalPickups, collectedPickups) {
    if (pickupRoundFinished) {
        return;
    }

    pickupRoundFinished = true;
    clearPendingRespawn();
    collectibleSystem.setEnabled(false);
    clearDriveKeys();
    botStatusUi.render(botTrafficSystem?.getHudState?.() || []);

    const scoreboard = [
        { name: 'You', collectedCount: playerCollectedCount },
        ...(botTrafficSystem?.getHudState?.() || []).map((bot) => ({
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
    const resolvedCollectedRaw = Number.isFinite(collectedPickups) ? collectedPickups : totalCollectedCount;
    const resolvedCollected = THREE.MathUtils.clamp(Math.round(resolvedCollectedRaw), 0, resolvedTotal);
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

function processVehicleCollisionContacts(contacts) {
    if (!contacts || contacts.length === 0 || isCarDestroyed) {
        return;
    }

    const strongestByBot = new Map();
    for (let i = 0; i < contacts.length; i += 1) {
        const contact = contacts[i];
        if (!contact?.botId) {
            continue;
        }
        const previous = strongestByBot.get(contact.botId);
        if (!previous || (contact.impactSpeed || 0) > (previous.impactSpeed || 0)) {
            strongestByBot.set(contact.botId, contact);
        }
    }
    const condensedContacts = Array.from(strongestByBot.values());
    if (condensedContacts.length === 0) {
        return;
    }

    botTrafficSystem?.applyCollisionImpulses?.(condensedContacts);

    let strongestImpact = 0;
    for (let i = 0; i < condensedContacts.length; i += 1) {
        const contact = condensedContacts[i];
        const impactSpeed = contact.impactSpeed || 0;
        if (impactSpeed > strongestImpact) {
            strongestImpact = impactSpeed;
        }
        applyLocalizedVehicleDamage(contact);
    }

    if (strongestImpact >= VEHICLE_DAMAGE_COLLISION_MIN && vehicleImpactStatusCooldown <= 0) {
        objectiveUi.showInfo(
            strongestImpact >= VEHICLE_WHEEL_DETACH_SPEED
                ? `Heavy collision (${Math.round(strongestImpact)}): possible wheel damage.`
                : `Contact with another car (${Math.round(strongestImpact)}).`,
            strongestImpact >= VEHICLE_DAMAGE_COLLISION_HIGH ? 1400 : 900
        );
        vehicleImpactStatusCooldown = 0.85;
    }
}

function applyLocalizedVehicleDamage(contact) {
    const impactSpeed = contact?.impactSpeed || 0;
    if (impactSpeed < VEHICLE_DAMAGE_COLLISION_MIN) {
        return;
    }

    const collision = {
        obstacleCategory: 'vehicle',
        impactSpeed,
        impactNormal: new THREE.Vector3(contact.normalX || 0, 0, contact.normalZ || 0),
    };
    const crashContext = buildCrashContext(contact.position || car.position.clone(), collision);
    const hitSide = crashContext.hitSide;
    const hitZone = crashContext.hitZone;
    const oppositeZone = hitZone === 'front' ? 'rear' : 'front';

    applyPersistentHandlingDamage(crashContext, impactSpeed);
    addBodyDentFromImpact(crashContext, impactSpeed);

    if (impactSpeed >= VEHICLE_WHEEL_DETACH_SPEED) {
        tryDetachCrashPart((part) => (
            part.type === 'wheel'
            && part.side === hitSide
            && part.zone === hitZone
        ), crashContext);
    }

    if (impactSpeed >= VEHICLE_SECOND_WHEEL_DETACH_SPEED) {
        tryDetachCrashPart((part) => (
            part.type === 'wheel'
            && part.side === hitSide
            && part.zone === oppositeZone
        ), crashContext);
    }
}

function applyPersistentHandlingDamage(crashContext, impactSpeed) {
    const damageNorm = THREE.MathUtils.clamp(
        (impactSpeed - VEHICLE_DAMAGE_COLLISION_MIN)
        / (VEHICLE_WHEEL_DETACH_SPEED - VEHICLE_DAMAGE_COLLISION_MIN),
        0,
        1.25
    );
    if (damageNorm <= 0.02) {
        return;
    }

    const localGain = damageNorm * 0.32;
    const zoneGain = damageNorm * 0.26;
    const suspensionGain = damageNorm * 0.22;

    if (crashContext.hitSide === 'left') {
        playerDamageState.leftLoss += localGain;
    } else if (crashContext.hitSide === 'right') {
        playerDamageState.rightLoss += localGain;
    }

    if (crashContext.hitZone === 'front') {
        playerDamageState.frontLoss += zoneGain;
    } else if (crashContext.hitZone === 'rear') {
        playerDamageState.rearLoss += zoneGain;
    }

    playerDamageState.suspensionLoss += suspensionGain;
    setVehicleDamageState(playerDamageState);
}

function addBodyDentFromImpact(crashContext, impactSpeed) {
    const dentNorm = THREE.MathUtils.clamp(
        (impactSpeed - VEHICLE_DAMAGE_COLLISION_MIN)
        / (VEHICLE_DAMAGE_COLLISION_HIGH - VEHICLE_DAMAGE_COLLISION_MIN),
        0,
        1.2
    );
    if (dentNorm <= 0.03) {
        return;
    }

    const dentGain = dentNorm * 0.28;
    if (crashContext.hitSide === 'left') {
        bodyDamageVisual.left = THREE.MathUtils.clamp(bodyDamageVisual.left + dentGain, 0, VEHICLE_DENT_MAX);
    } else if (crashContext.hitSide === 'right') {
        bodyDamageVisual.right = THREE.MathUtils.clamp(bodyDamageVisual.right + dentGain, 0, VEHICLE_DENT_MAX);
    }

    if (crashContext.hitZone === 'front') {
        bodyDamageVisual.front = THREE.MathUtils.clamp(bodyDamageVisual.front + dentGain * 0.94, 0, VEHICLE_DENT_MAX);
    } else if (crashContext.hitZone === 'rear') {
        bodyDamageVisual.rear = THREE.MathUtils.clamp(bodyDamageVisual.rear + dentGain * 0.94, 0, VEHICLE_DENT_MAX);
    }

    applyBodyDentVisuals();
}

function tryDetachCrashPart(predicate, crashContext) {
    const part = crashParts.find((candidate) => (
        candidate?.source
        && !detachedCrashPartIds.has(candidate.id)
        && predicate(candidate)
    ));
    if (!part) {
        return false;
    }
    detachCrashPart(part, crashContext);
    return true;
}

function detachCrashPart(part, crashContext) {
    if (!part?.source || detachedCrashPartIds.has(part.id)) {
        return false;
    }

    detachedCrashPartIds.add(part.id);
    part.source.visible = false;
    spawnCrashPartDebris(part, crashContext);
    registerDetachedPartDamage(part);
    return true;
}

function registerDetachedPartDamage(part) {
    if (part.type === 'wheel') {
        playerDamageState.wheelLossCount += 1;
    } else if (part.type === 'suspension_link') {
        playerDamageState.suspensionLoss += 1;
    }

    if (part.side === 'left') {
        playerDamageState.leftLoss += 1;
    } else if (part.side === 'right') {
        playerDamageState.rightLoss += 1;
    }

    if (part.zone === 'front') {
        playerDamageState.frontLoss += 1;
    } else if (part.zone === 'rear') {
        playerDamageState.rearLoss += 1;
    }

    setVehicleDamageState(playerDamageState);
}

function spawnCarDebris(hitPosition, collision = null) {
    if (!crashParts || crashParts.length === 0) {
        return;
    }

    const crashContext = buildCrashContext(hitPosition, collision);
    const visibleParts = crashParts.filter((part) => part?.source?.visible);
    const selectedParts = visibleParts.length > 0
        ? visibleParts
        : selectCrashPartsForImpact(crashContext, true);
    selectedParts.forEach((part) => {
        spawnCrashPartDebris(part, crashContext);
    });

    explosionLight = new THREE.PointLight(0xff7a4f, 4.8, 50, 2);
    explosionLight.position.copy(crashContext.origin);
    explosionLight.position.y += 1.2;
    explosionLightLife = 0.7;
    scene.add(explosionLight);
}

function buildCrashContext(hitPosition, collision) {
    const origin = car.position.clone();
    const hitDirection = new THREE.Vector3().subVectors(hitPosition, origin);
    hitDirection.y = 0;
    if (hitDirection.lengthSq() < 0.0001) {
        hitDirection.set(0, 0, -1);
    }
    hitDirection.normalize();

    const carForward = new THREE.Vector3(0, 0, -1).applyQuaternion(car.quaternion).setY(0).normalize();
    const carRight = new THREE.Vector3(1, 0, 0).applyQuaternion(car.quaternion).setY(0).normalize();
    const impactNormal = collision?.impactNormal
        ? collision.impactNormal.clone()
        : hitDirection.clone().multiplyScalar(-1);
    impactNormal.y = 0;
    if (impactNormal.lengthSq() < 0.0001) {
        impactNormal.copy(carForward).multiplyScalar(-1);
    }
    impactNormal.normalize();

    const impactSpeed = collision?.impactSpeed || OBSTACLE_CRASH_MAX_SPEED;
    const impactNorm = THREE.MathUtils.clamp(
        (impactSpeed - OBSTACLE_CRASH_MIN_SPEED) / (OBSTACLE_CRASH_MAX_SPEED - OBSTACLE_CRASH_MIN_SPEED),
        0,
        1
    );
    const crashIntensity = collision ? (0.35 + impactNorm * 0.65) : 1;
    const frontalImpact = THREE.MathUtils.clamp(-impactNormal.dot(carForward), 0, 1);
    const physicsState = getVehicleState();
    const impactVelocity = physicsState?.velocity
        ? new THREE.Vector3(physicsState.velocity.x || 0, 0, physicsState.velocity.y || 0)
        : new THREE.Vector3();
    if (impactVelocity.lengthSq() < 0.04) {
        impactVelocity.copy(carForward).multiplyScalar(impactSpeed * 0.62);
    }
    const impactTravelDirection = impactVelocity.lengthSq() > 0.0001
        ? impactVelocity.clone().normalize()
        : carForward.clone();
    const impactTravelSpeed = Math.max(impactVelocity.length(), impactSpeed * 0.58);

    const localHit = hitPosition.clone();
    car.worldToLocal(localHit);
    const hitSide = Math.abs(localHit.x) > 0.12
        ? (localHit.x < 0 ? 'left' : 'right')
        : (impactNormal.dot(carRight) >= 0 ? 'left' : 'right');
    const hitZone = localHit.z < 0 ? 'front' : 'rear';

    return {
        origin,
        hitDirection,
        impactNormal,
        carForward,
        carRight,
        hitSide,
        hitZone,
        crashIntensity,
        frontalImpact,
        impactSpeed,
        impactTravelDirection,
        impactTravelSpeed,
        obstacleCategory: collision?.obstacleCategory || 'generic',
        isObstacleCollision: Boolean(collision),
    };
}

function selectCrashPartsForImpact(crashContext, excludeDetached = false) {
    if (!crashContext.isObstacleCollision) {
        return excludeDetached
            ? crashParts.filter((part) => !detachedCrashPartIds.has(part.id))
            : crashParts;
    }

    const selected = [];
    const selectedIds = new Set();
    const sideDominant = Math.abs(crashContext.impactNormal.dot(crashContext.carRight)) > 0.58;

    crashParts.forEach((part) => {
        if (excludeDetached && detachedCrashPartIds.has(part.id)) {
            return;
        }
        const sideMatch = part.side === crashContext.hitSide;
        const zoneMatch = part.zone === crashContext.hitZone;
        const centered = part.side === 'center';
        let detach = false;

        if (part.type === 'wheel') {
            if (sideDominant) {
                detach = sideMatch;
            } else {
                detach = zoneMatch;
            }
            if (crashContext.crashIntensity > 0.88 && sideMatch && zoneMatch) {
                detach = true;
            }
        } else if (part.type === 'suspension_link') {
            detach = sideDominant
                ? sideMatch
                : (zoneMatch || (sideMatch && crashContext.crashIntensity > 0.72));
            detach = detach && crashContext.crashIntensity > 0.26;
        } else {
            detach = sideDominant
                ? (sideMatch || (centered && zoneMatch))
                : (zoneMatch || (sideMatch && crashContext.crashIntensity > 0.66));
            if (centered && crashContext.crashIntensity > 0.75) {
                detach = true;
            }
        }

        if (detach) {
            selected.push(part);
            selectedIds.add(part.id);
        }
    });

    if (!selected.some((part) => part.type === 'wheel')) {
        const fallbackWheel = crashParts.find((part) => (
            part.type === 'wheel'
            && part.side === crashContext.hitSide
            && part.zone === crashContext.hitZone
            && (!excludeDetached || !detachedCrashPartIds.has(part.id))
        ));
        if (fallbackWheel && !selectedIds.has(fallbackWheel.id)) {
            selected.push(fallbackWheel);
            selectedIds.add(fallbackWheel.id);
        }
    }

    if (!selected.some((part) => part.type === 'body_panel')) {
        const fallbackPanel = crashParts.find((part) => (
            part.type === 'body_panel'
            && (part.side === crashContext.hitSide || part.zone === crashContext.hitZone)
            && (!excludeDetached || !detachedCrashPartIds.has(part.id))
        )) || crashParts.find((part) => (
            part.type === 'body_panel'
            && (!excludeDetached || !detachedCrashPartIds.has(part.id))
        ));
        if (fallbackPanel && !selectedIds.has(fallbackPanel.id)) {
            selected.push(fallbackPanel);
            selectedIds.add(fallbackPanel.id);
        }
    }

    return selected;
}

function spawnCrashPartDebris(part, crashContext) {
    if (!part?.source) {
        return;
    }

    const source = part.source;
    source.updateWorldMatrix(true, true);
    const debrisMesh = cloneCrashPartSource(source);
    source.matrixWorld.decompose(debrisMesh.position, debrisMesh.quaternion, debrisMesh.scale);
    scene.add(debrisMesh);

    const relative = debrisMesh.position.clone().sub(crashContext.origin);
    relative.y = 0;

    const partSideSign = part.side === 'left' ? -1 : (part.side === 'right' ? 1 : 0);
    const partZoneSign = part.zone === 'front' ? 1 : (part.zone === 'rear' ? -1 : 0);
    const radialDirection = relative.lengthSq() > 0.0001
        ? relative.normalize()
        : crashContext.hitDirection.clone();
    const frontalImpact = crashContext.frontalImpact || 0;
    const lampPostFrontBoost = (
        crashContext.obstacleCategory === 'lamp_post'
        && crashContext.hitZone === 'front'
    )
        ? (1.18 + crashContext.crashIntensity * 0.34)
        : 1;
    const blastScale = 0.58 + crashContext.crashIntensity * 0.72 + Math.random() * 0.35;
    const reducedBlastScale = blastScale * (1 - frontalImpact * 0.72);
    const forwardCarryScale = (0.4 + frontalImpact * 2.4 + (crashContext.hitZone === 'front' ? 1.05 : 0.12))
        * lampPostFrontBoost
        * (0.86 + Math.random() * 0.34);
    const inertiaCarryScale = (0.72 + frontalImpact * 1.2 + crashContext.crashIntensity * 0.46)
        * lampPostFrontBoost
        * (0.8 + Math.random() * 0.45);
    const inertiaCarryBoost = crashContext.impactTravelSpeed * PART_BASE_IMPACT_INERTIA_SCALE * inertiaCarryScale;

    const velocity = new THREE.Vector3()
        .addScaledVector(
            crashContext.impactNormal,
            PART_BASE_BLAST_BOOST * reducedBlastScale
        )
        .addScaledVector(
            crashContext.carForward,
            PART_BASE_FORWARD_CARRY_BOOST * forwardCarryScale
        )
        .addScaledVector(
            crashContext.impactTravelDirection,
            inertiaCarryBoost
        )
        .addScaledVector(
            radialDirection,
            PART_BASE_LATERAL_BOOST * (0.55 + Math.random() * 0.8)
        )
        .addScaledVector(
            crashContext.carRight,
            (partSideSign || (crashContext.hitSide === 'left' ? -1 : 1)) * (1 + Math.random() * 1.4)
        )
        .addScaledVector(
            crashContext.carForward,
            (partZoneSign || (crashContext.hitZone === 'front' ? 1 : -1)) * (0.8 + Math.random() * 1.3)
        );

    velocity.y = DEBRIS_BASE_VERTICAL_BOOST
        + Math.random() * 2.1
        + crashContext.crashIntensity * 1.9
        + (part.type === 'wheel' ? 1.35 : 0);

    const angularBase = PART_BASE_ANGULAR_BOOST / Math.max(part.mass || 1, 0.25);
    const angularBoost = part.type === 'wheel' ? angularBase * 1.5 : angularBase;
    const angularVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * angularBoost,
        (Math.random() - 0.5) * angularBoost * 1.1,
        (Math.random() - 0.5) * angularBoost
    );
    let wheelRoll = null;
    if (part.type === 'wheel') {
        const randomHeading = Math.random() * Math.PI * 2;
        const randomBoost = 1.6 + Math.random() * WHEEL_ROLL_RANDOM_BOOST;
        velocity.x += Math.cos(randomHeading) * randomBoost;
        velocity.z += Math.sin(randomHeading) * randomBoost;
        wheelRoll = {
            heading: Math.atan2(velocity.z, velocity.x) + (Math.random() - 0.5) * 0.9,
            drive: THREE.MathUtils.lerp(
                WHEEL_ROLL_DRIVE_MIN,
                WHEEL_ROLL_DRIVE_MAX,
                THREE.MathUtils.clamp(crashContext.crashIntensity, 0, 1)
            ) * (0.75 + Math.random() * 0.55),
            decel: 1.4 + Math.random() * 1.1,
            turnRate: 0.8 + Math.random() * 1.3,
            wobblePhase: Math.random() * Math.PI * 2,
            wobbleRate: 3.2 + Math.random() * 3.1,
            spin: 10 + Math.random() * 12,
            restPose: 'flat',
            restYaw: Math.random() * Math.PI * 2,
        };
    }
    let bodyRest = null;
    if (part.type !== 'wheel') {
        const travelYaw = Math.atan2(-velocity.x, -velocity.z);
        bodyRest = {
            yaw: travelYaw + (Math.random() - 0.5) * 0.55,
        };
    }

    addDebrisPiece({
        mesh: debrisMesh,
        velocity,
        angularVelocity,
        groundOffset: part.groundOffset || estimateDebrisGroundOffset(debrisMesh),
        drag: DEBRIS_DRAG * (0.92 + (part.mass || 1) * 0.08),
        bounce: Math.max(0.16, DEBRIS_BOUNCE_DAMPING - (part.mass || 1) * 0.04),
        wheelRoll,
        bodyRest,
    });
}

function cloneCrashPartSource(source) {
    const clone = source.clone(true);
    clone.traverse((node) => {
        if (node.isMesh) {
            if (node.geometry) {
                node.geometry = node.geometry.clone();
            }
            if (Array.isArray(node.material)) {
                node.material = node.material.map((material) => material?.clone?.() || material);
            } else if (node.material?.clone) {
                node.material = node.material.clone();
            }
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });
    return clone;
}

function estimateDebrisGroundOffset(object3D) {
    const box = new THREE.Box3().setFromObject(object3D);
    if (!Number.isFinite(box.min.y) || !Number.isFinite(box.max.y)) {
        return 0.14;
    }
    return Math.max((box.max.y - box.min.y) * 0.5, 0.08);
}

function getDebrisBottomY(piece) {
    piece.mesh.updateWorldMatrix(true, true);
    debrisBottomProbeBox.setFromObject(piece.mesh);
    if (Number.isFinite(debrisBottomProbeBox.min.y)) {
        return debrisBottomProbeBox.min.y;
    }
    return piece.mesh.position.y - (piece.groundOffset ?? 0.14);
}

function getDebrisGroundHeightAt(x, z) {
    return getGroundHeightAt(x, z) + DEBRIS_GROUND_CLEARANCE;
}

function dampAngle(current, target, rate, dt) {
    const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    const blend = 1 - Math.exp(-Math.max(rate, 0.001) * dt);
    return current + delta * blend;
}

function alignWheelDebrisPose(piece, dt) {
    const wheelRoll = piece.wheelRoll;
    if (!wheelRoll) {
        return;
    }

    const rolling = wheelRoll.drive > 0.26;
    const targetPose = rolling ? 'upright' : (wheelRoll.restPose || 'upright');
    const alignRate = WHEEL_ORIENTATION_ALIGN_RATE * (rolling ? 1.5 : 1);

    if (targetPose === 'flat') {
        piece.mesh.rotation.x = dampAngle(piece.mesh.rotation.x, 0, alignRate * 0.78, dt);
        piece.mesh.rotation.z = dampAngle(piece.mesh.rotation.z, Math.PI * 0.5, alignRate, dt);
        piece.mesh.rotation.y = dampAngle(piece.mesh.rotation.y, wheelRoll.restYaw || 0, alignRate * 0.62, dt);
        return;
    }

    const targetYaw = wheelRoll.heading + Math.PI * 0.5;
    piece.mesh.rotation.y = dampAngle(piece.mesh.rotation.y, targetYaw, alignRate, dt);
    piece.mesh.rotation.z = dampAngle(piece.mesh.rotation.z, 0, alignRate, dt);
}

function snapWheelDebrisPose(piece) {
    const wheelRoll = piece.wheelRoll;
    if (!wheelRoll) {
        return;
    }

    if ((wheelRoll.restPose || 'upright') === 'flat') {
        piece.mesh.rotation.x = 0;
        piece.mesh.rotation.z = Math.PI * 0.5;
        piece.mesh.rotation.y = wheelRoll.restYaw || piece.mesh.rotation.y;
        return;
    }

    piece.mesh.rotation.z = 0;
    piece.mesh.rotation.y = wheelRoll.heading + Math.PI * 0.5;
}

function alignBodyPanelDebrisPose(piece, dt) {
    const bodyRest = piece.bodyRest;
    if (!bodyRest) {
        return;
    }

    const alignRate = BODY_PANEL_ORIENTATION_ALIGN_RATE;
    piece.mesh.rotation.x = dampAngle(piece.mesh.rotation.x, 0, alignRate, dt);
    piece.mesh.rotation.z = dampAngle(piece.mesh.rotation.z, 0, alignRate, dt);
    piece.mesh.rotation.y = dampAngle(piece.mesh.rotation.y, bodyRest.yaw || 0, alignRate * 0.58, dt);
}

function snapBodyPanelDebrisPose(piece) {
    const bodyRest = piece.bodyRest;
    if (!bodyRest) {
        return;
    }

    piece.mesh.rotation.x = 0;
    piece.mesh.rotation.z = 0;
    piece.mesh.rotation.y = bodyRest.yaw || piece.mesh.rotation.y;
}

function addDebrisPiece({
    mesh,
    velocity,
    angularVelocity,
    life,
    groundOffset = 0.14,
    drag = DEBRIS_DRAG,
    bounce = DEBRIS_BOUNCE_DAMPING,
    wheelRoll = null,
    bodyRest = null,
}) {
    debrisPieces.push({
        mesh,
        velocity,
        angularVelocity,
        life: Number.isFinite(life) ? life : Number.POSITIVE_INFINITY,
        groundOffset,
        drag,
        bounce,
        settled: false,
        wheelRoll,
        bodyRest,
    });
}

function updateDebris(dt) {
    for (let i = debrisPieces.length - 1; i >= 0; i -= 1) {
        const piece = debrisPieces[i];
        if (Number.isFinite(piece.life)) {
            piece.life -= dt;
            if (piece.life <= 0) {
                scene.remove(piece.mesh);
                disposeDebrisObject(piece.mesh);
                debrisPieces.splice(i, 1);
                continue;
            }
        }
        if (piece.settled) {
            continue;
        }

        piece.velocity.y -= DEBRIS_GRAVITY * dt;
        piece.velocity.multiplyScalar(Math.exp(-(piece.drag || DEBRIS_DRAG) * dt));
        piece.mesh.position.addScaledVector(piece.velocity, dt);
        piece.mesh.rotation.x += piece.angularVelocity.x * dt;
        piece.mesh.rotation.y += piece.angularVelocity.y * dt;
        piece.mesh.rotation.z += piece.angularVelocity.z * dt;

        const bottomY = getDebrisBottomY(piece);
        const groundY = getDebrisGroundHeightAt(piece.mesh.position.x, piece.mesh.position.z);
        const groundPenetration = groundY - bottomY;
        const nearGroundContact = groundPenetration >= -0.0025;
        if (groundPenetration > 0) {
            piece.mesh.position.y += groundPenetration;
        }
        if (nearGroundContact) {
            if (piece.velocity.y < 0) {
                piece.velocity.y = -piece.velocity.y * (piece.bounce || DEBRIS_BOUNCE_DAMPING);
            }
            piece.velocity.x *= 0.88;
            piece.velocity.z *= 0.88;
            piece.angularVelocity.multiplyScalar(0.96);

            const wheelRoll = piece.wheelRoll;
            if (wheelRoll && wheelRoll.drive > 0.02) {
                wheelRoll.wobblePhase += dt * wheelRoll.wobbleRate;
                wheelRoll.heading += Math.sin(wheelRoll.wobblePhase) * wheelRoll.turnRate * dt;
                piece.velocity.x += Math.cos(wheelRoll.heading) * wheelRoll.drive * dt;
                piece.velocity.z += Math.sin(wheelRoll.heading) * wheelRoll.drive * dt;
                wheelRoll.drive = Math.max(0, wheelRoll.drive - wheelRoll.decel * dt);
                wheelRoll.spin = Math.max(0, wheelRoll.spin - (3.2 + wheelRoll.decel * 0.7) * dt);
                piece.mesh.rotation.x += wheelRoll.spin * dt;
            }
            if (wheelRoll) {
                alignWheelDebrisPose(piece, dt);
            }
            if (piece.bodyRest) {
                alignBodyPanelDebrisPose(piece, dt);
            }

            const horizontalSpeed = Math.hypot(piece.velocity.x, piece.velocity.z);
            const angularSpeed = piece.angularVelocity.length();
            const settleHorizontalThreshold = piece.wheelRoll
                ? DEBRIS_SETTLE_HORIZONTAL_SPEED * 1.6
                : DEBRIS_SETTLE_HORIZONTAL_SPEED;
            const settleAngularThreshold = piece.wheelRoll
                ? DEBRIS_SETTLE_ANGULAR_SPEED * 1.8
                : DEBRIS_SETTLE_ANGULAR_SPEED;
            const wheelStillRolling = Boolean(piece.wheelRoll && piece.wheelRoll.drive > 0.08);
            if (
                !wheelStillRolling
                && Math.abs(piece.velocity.y) <= DEBRIS_SETTLE_VERTICAL_SPEED
                && horizontalSpeed <= settleHorizontalThreshold
                && angularSpeed <= settleAngularThreshold
            ) {
                piece.velocity.set(0, 0, 0);
                piece.angularVelocity.set(0, 0, 0);
                if (piece.wheelRoll) {
                    piece.wheelRoll.drive = 0;
                    piece.wheelRoll.spin = 0;
                    snapWheelDebrisPose(piece);
                }
                if (piece.bodyRest) {
                    snapBodyPanelDebrisPose(piece);
                }
                piece.settled = true;
            }
        }

    }

    if (explosionLight) {
        explosionLightLife -= dt;
        const lifeRatio = Math.max(explosionLightLife / 0.7, 0);
        explosionLight.intensity = 4.8 * lifeRatio;
        explosionLight.distance = 28 + lifeRatio * 22;
        if (explosionLightLife <= 0) {
            scene.remove(explosionLight);
            explosionLight = null;
        }
    }
}

function disposeDebrisObject(object3D) {
    object3D.traverse((node) => {
        if (!node.isMesh) {
            return;
        }
        if (node.geometry) {
            node.geometry.dispose();
        }
        if (Array.isArray(node.material)) {
            node.material.forEach((material) => material?.dispose?.());
            return;
        }
        node.material?.dispose?.();
    });
}

function createRaceIntroController({ camera, vehicle, durationSec = 4.2 } = {}) {
    const rootEl = document.getElementById('raceIntroOverlay');
    const countEl = document.getElementById('raceIntroCount');
    const captionEl = document.getElementById('raceIntroCaption');
    if (!camera || !vehicle || !rootEl || !countEl || !captionEl) {
        return {
            start() {},
            stop() {},
            update() {
                return false;
            },
            isActive() {
                return false;
            },
            isDrivingUnlocked() {
                return false;
            },
        };
    }

    const timedSteps = [
        { at: 0, label: '3', caption: 'Prepare for launch', mode: 'pulse' },
        { at: 1, label: '2', caption: 'Aim for the ideal line', mode: 'pulse' },
        { at: 2, label: '1', caption: 'Full throttle now', mode: 'pulse' },
        { at: 3, label: 'GO!', caption: 'Let it rip!', mode: 'go' },
    ];
    const orbitTarget = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();
    const followTarget = new THREE.Vector3();
    const followLookTarget = new THREE.Vector3();
    const blendedTarget = new THREE.Vector3();
    const blendedLookTarget = new THREE.Vector3();
    const smoothedLookTarget = new THREE.Vector3();
    const state = {
        active: false,
        elapsed: 0,
        duration: Math.max(3.8, Number(durationSec) || 4.2),
        stepIndex: -1,
        startAngle: 0,
        cameraInitialized: false,
        drivingUnlocked: false,
    };
    let overlayHideTimer = null;

    hideOverlay();
    return {
        start,
        stop,
        update,
        isActive() {
            return state.active;
        },
        isDrivingUnlocked() {
            return state.drivingUnlocked;
        },
    };

    function start() {
        clearOverlayHideTimer();
        state.active = true;
        state.elapsed = 0;
        state.stepIndex = -1;
        state.startAngle = vehicle.rotation.y + Math.PI * 0.65;
        state.cameraInitialized = false;
        state.drivingUnlocked = false;
        rootEl.hidden = false;
        rootEl.classList.add('active');
        document.body.classList.add('race-intro-active');
        applyStep(0);
    }

    function stop() {
        if (!state.active && rootEl.hidden) {
            return;
        }
        state.active = false;
        state.elapsed = 0;
        state.stepIndex = -1;
        state.drivingUnlocked = false;
        hideOverlay();
    }

    function update(deltaTime = 1 / 60) {
        if (!state.active) {
            return false;
        }

        const dt = Math.min(Math.max(deltaTime || 0, 0), 0.05);
        state.elapsed += dt;
        const progress = THREE.MathUtils.clamp(state.elapsed / state.duration, 0, 1);
        updateCameraPath(progress, dt);

        const nextStepIndex = resolveStepIndex(state.elapsed);
        if (nextStepIndex !== state.stepIndex) {
            applyStep(nextStepIndex);
            if (nextStepIndex === timedSteps.length - 1) {
                finishAtGo();
                return true;
            }
        }

        if (progress >= 1) {
            snapToStartView();
            state.active = false;
            state.elapsed = 0;
            state.stepIndex = -1;
            hideOverlay();
            return true;
        }
        return false;
    }

    function resolveStepIndex(elapsedSec) {
        for (let i = timedSteps.length - 1; i >= 0; i -= 1) {
            if (elapsedSec >= timedSteps[i].at) {
                return i;
            }
        }
        return -1;
    }

    function applyStep(stepIndex) {
        state.stepIndex = stepIndex;
        if (stepIndex < 0 || stepIndex >= timedSteps.length) {
            return;
        }

        const step = timedSteps[stepIndex];
        countEl.textContent = step.label;
        captionEl.textContent = step.caption;
        rootEl.classList.remove('pulse', 'go');
        void rootEl.offsetWidth;
        rootEl.classList.add(step.mode === 'go' ? 'go' : 'pulse');
    }

    function hideOverlay() {
        clearOverlayHideTimer();
        rootEl.classList.remove('active', 'pulse', 'go');
        rootEl.hidden = true;
        countEl.textContent = '3';
        captionEl.textContent = 'Prepare for launch';
        document.body.classList.remove('race-intro-active');
    }

    function updateCameraPath(progress, dt) {
        const eased = 1 - Math.pow(1 - progress, 2.15);
        const cameraAngle = state.startAngle
            + eased * Math.PI * 1.74
            + Math.sin(state.elapsed * 2.2) * 0.15;
        const orbitRadius = THREE.MathUtils.lerp(11.7, 6.4, eased);
        const orbitHeight = THREE.MathUtils.lerp(3.9, 2.35, eased)
            + Math.sin(state.elapsed * 3.25) * 0.3;

        orbitTarget.set(
            vehicle.position.x + Math.cos(cameraAngle) * orbitRadius,
            vehicle.position.y + orbitHeight,
            vehicle.position.z + Math.sin(cameraAngle) * orbitRadius
        );
        lookTarget.set(
            vehicle.position.x,
            vehicle.position.y + THREE.MathUtils.lerp(1.15, 0.92, eased),
            vehicle.position.z
        );
        computeStartViewPose();
        const handoffBlend = THREE.MathUtils.smoothstep(progress, 0.72, 1);
        blendedTarget.lerpVectors(orbitTarget, followTarget, handoffBlend);
        blendedLookTarget.lerpVectors(lookTarget, followLookTarget, handoffBlend);

        if (!state.cameraInitialized) {
            camera.position.copy(blendedTarget);
            smoothedLookTarget.copy(blendedLookTarget);
            state.cameraInitialized = true;
        }

        const positionBlend = 1 - Math.exp(-6.2 * dt);
        const lookBlend = 1 - Math.exp(-10.4 * dt);
        camera.position.lerp(blendedTarget, positionBlend);
        smoothedLookTarget.lerp(blendedLookTarget, lookBlend);
        camera.lookAt(smoothedLookTarget);

        const orbitFov = THREE.MathUtils.lerp(64, 78, eased) + Math.sin(state.elapsed * 4.4) * 0.45;
        const targetFov = THREE.MathUtils.lerp(orbitFov, 75, handoffBlend);
        const fovBlend = 1 - Math.exp(-6.6 * dt);
        const nextFov = THREE.MathUtils.lerp(camera.fov, targetFov, fovBlend);
        if (Math.abs(nextFov - camera.fov) <= 0.01) {
            return;
        }
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
    }

    function computeStartViewPose() {
        const heading = vehicle.rotation.y;
        followTarget.set(
            vehicle.position.x + Math.sin(heading) * 6,
            vehicle.position.y + 3,
            vehicle.position.z + Math.cos(heading) * 6
        );
        followLookTarget.set(
            vehicle.position.x,
            vehicle.position.y + 0.5,
            vehicle.position.z
        );
    }

    function snapToStartView() {
        computeStartViewPose();
        camera.position.copy(followTarget);
        smoothedLookTarget.copy(followLookTarget);
        camera.lookAt(smoothedLookTarget);
        if (Math.abs(camera.fov - 75) > 0.01) {
            camera.fov = 75;
            camera.updateProjectionMatrix();
        }
    }

    function finishAtGo() {
        snapToStartView();
        state.active = false;
        state.elapsed = 0;
        state.stepIndex = -1;
        state.drivingUnlocked = true;
        scheduleOverlayHide(520);
    }

    function scheduleOverlayHide(delayMs) {
        clearOverlayHideTimer();
        overlayHideTimer = window.setTimeout(() => {
            overlayHideTimer = null;
            hideOverlay();
        }, Math.max(0, Number(delayMs) || 0));
    }

    function clearOverlayHideTimer() {
        if (overlayHideTimer == null) {
            return;
        }
        clearTimeout(overlayHideTimer);
        overlayHideTimer = null;
    }
}

function createObjectiveUiController() {
    const swatchEl = document.getElementById('targetColorSwatch');
    const colorNameEl = document.getElementById('targetColorName');
    const statusEl = document.getElementById('objectiveStatus');
    let statusTimer = null;
    let statusLocked = false;

    if (!swatchEl || !colorNameEl || !statusEl) {
        return {
            setTargetColor() {},
            flashCorrect() {},
            showFailure() {},
            showCrash() {},
            showInfo() {},
            showResult() {},
            resetStatus() {},
        };
    }

    return {
        setTargetColor(colorHex) {
            swatchEl.style.background = toCssHex(colorHex);
            colorNameEl.textContent = colorNameFromHex(colorHex);
        },
        flashCorrect(colorHex, batteryPercent = null) {
            const batteryLabel = Number.isFinite(batteryPercent)
                ? ` | Battery ${Math.round(batteryPercent)}%`
                : '';
            setStatus(`Correct: ${colorNameFromHex(colorHex)}${batteryLabel}`, '#8dff9a');
        },
        showFailure(wrongColorHex, targetColorHex) {
            const wrongName = colorNameFromHex(wrongColorHex);
            const targetName = colorNameFromHex(targetColorHex);
            setStatus(
                `Wrong (${wrongName})! Correct was ${targetName}. Press Q to restart.`,
                '#ff8e8e',
                5000
            );
        },
        showCrash(messageText) {
            setStatus(messageText, '#ff9c7f', 5000);
        },
        showInfo(messageText, timeoutMs = 2000) {
            setStatus(messageText, '#a7d5ff', timeoutMs);
        },
        showResult(messageText) {
            statusLocked = true;
            setStatus(messageText, '#ffe08f', 0, true);
        },
        resetStatus() {
            statusLocked = false;
            setStatus(STATUS_DEFAULT_TEXT, 'rgba(195, 228, 255, 0.9)', 0, true);
        },
    };

    function setStatus(text, color, timeoutMs = 1400, force = false) {
        if (statusLocked && !force) {
            return;
        }

        statusEl.textContent = text;
        statusEl.style.color = color;
        if (statusTimer) {
            clearTimeout(statusTimer);
            statusTimer = null;
        }

        if (!isCarDestroyed && timeoutMs > 0) {
            statusTimer = setTimeout(() => {
                statusEl.textContent = STATUS_DEFAULT_TEXT;
                statusEl.style.color = 'rgba(195, 228, 255, 0.9)';
            }, timeoutMs);
        }
    }
}

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
    if (isGamePaused === shouldPause) {
        return;
    }

    isGamePaused = shouldPause;
    if (isGamePaused) {
        clearDriveKeys();
        if (isWelcomeModalVisible) {
            pauseMenuUi.hide();
            return;
        }
        pauseMenuUi.show();
        return;
    }
    pauseMenuUi.hide();
}

function dismissWelcomeModal() {
    if (!isWelcomeModalVisible) {
        return;
    }
    isWelcomeModalVisible = false;
    carEditModeController.setActive(false);
    welcomeModalUi.hide();
    restartGameWithCountdown();
}

function showWelcomeModal() {
    carEditModeController.setActive(false);
    raceIntroController.stop();
    isWelcomeModalVisible = true;
    isGamePaused = true;
    clearDriveKeys();
    pauseMenuUi.hide();
    setCameraKeyboardControlsEnabled(true);
    welcomeModalUi.show();
}

function startRaceIntroSequence() {
    if (isGamePaused || isWelcomeModalVisible) {
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
    if (pendingRespawnTimeout == null) {
        return;
    }
    clearTimeout(pendingRespawnTimeout);
    pendingRespawnTimeout = null;
}

function snapCarToGround() {
    car.position.y = getGroundHeightAt(car.position.x, car.position.z) + PLAYER_RIDE_HEIGHT;
}

function respawnPlayerCar() {
    if (playerCarsRemaining <= 0) {
        return;
    }

    isCarDestroyed = false;
    car.visible = true;
    car.position.copy(playerSpawnState.position);
    snapCarToGround();
    car.rotation.set(0, playerSpawnState.rotationY, 0);
    collectibleSystem.setEnabled(true);
    clearDriveKeys();
    chargingZoneController.reset();
    chargingProgressHudController.reset();
    resetPlayerDamageState();
    playerBattery = BATTERY_MAX;
    setPlayerBatteryLevel(playerBattery / BATTERY_MAX);
    setBatteryDepletedState(false, { showStatus: false });
    initializePlayerPhysics(car);
    physicsAccumulator = 0;

    objectiveUi.showInfo(
        `New car on track. Cars left: ${playerCarsRemaining}/${PLAYER_CAR_POOL_SIZE}.`,
        2300
    );
}

function createEmptyDamageState() {
    return {
        wheelLossCount: 0,
        leftLoss: 0,
        rightLoss: 0,
        frontLoss: 0,
        rearLoss: 0,
        suspensionLoss: 0,
    };
}

function initializeBodyPartBaselines() {
    bodyPartBaselines.clear();
    for (let i = 0; i < crashParts.length; i += 1) {
        const part = crashParts[i];
        if (part?.type !== 'body_panel' || !part.source) {
            continue;
        }
        bodyPartBaselines.set(part.id, {
            position: part.source.position.clone(),
            rotation: part.source.rotation.clone(),
            scale: part.source.scale.clone(),
        });
    }
}

function applyBodyDentVisuals() {
    const sideMagnitude = THREE.MathUtils.clamp((bodyDamageVisual.left + bodyDamageVisual.right) * 0.28, 0, 0.34);
    const sideBias = THREE.MathUtils.clamp(bodyDamageVisual.right - bodyDamageVisual.left, -1.5, 1.5);
    const zoneMagnitude = THREE.MathUtils.clamp((bodyDamageVisual.front + bodyDamageVisual.rear) * 0.24, 0, 0.31);
    const zoneBias = THREE.MathUtils.clamp(bodyDamageVisual.rear - bodyDamageVisual.front, -1.5, 1.5);

    for (let i = 0; i < crashParts.length; i += 1) {
        const part = crashParts[i];
        if (part?.type !== 'body_panel' || !part.source) {
            continue;
        }
        const base = bodyPartBaselines.get(part.id);
        if (!base) {
            continue;
        }

        part.source.scale.set(
            base.scale.x * (1 - sideMagnitude * 0.2),
            base.scale.y * (1 - (sideMagnitude + zoneMagnitude) * 0.08),
            base.scale.z * (1 - zoneMagnitude * 0.26)
        );
        part.source.rotation.set(
            base.rotation.x + zoneBias * 0.05,
            base.rotation.y,
            base.rotation.z + sideBias * 0.07
        );
        part.source.position.set(
            base.position.x - sideBias * 0.045,
            base.position.y - (sideMagnitude + zoneMagnitude) * 0.03,
            base.position.z + zoneBias * 0.04
        );
    }
}

function resetPlayerDamageState() {
    detachedCrashPartIds.clear();
    vehicleImpactStatusCooldown = 0;
    const freshState = createEmptyDamageState();
    playerDamageState.wheelLossCount = freshState.wheelLossCount;
    playerDamageState.leftLoss = freshState.leftLoss;
    playerDamageState.rightLoss = freshState.rightLoss;
    playerDamageState.frontLoss = freshState.frontLoss;
    playerDamageState.rearLoss = freshState.rearLoss;
    playerDamageState.suspensionLoss = freshState.suspensionLoss;
    bodyDamageVisual.left = 0;
    bodyDamageVisual.right = 0;
    bodyDamageVisual.front = 0;
    bodyDamageVisual.rear = 0;

    for (let i = 0; i < crashParts.length; i += 1) {
        const part = crashParts[i];
        if (part?.source) {
            part.source.visible = true;
            const base = bodyPartBaselines.get(part.id);
            if (base) {
                part.source.position.copy(base.position);
                part.source.rotation.copy(base.rotation);
                part.source.scale.copy(base.scale);
            }
        }
    }
    setVehicleDamageState(playerDamageState);
}

function resetRunStateForReplay() {
    raceIntroController.stop();
    setCameraKeyboardControlsEnabled(true);
    clearPendingRespawn();
    objectiveUi.resetStatus();
    finalScoreboardUi.hide();
    pickupRoundFinished = false;
    playerCollectedCount = 0;
    totalCollectedCount = 0;
    isCarDestroyed = false;
    car.visible = true;
    car.position.copy(playerSpawnState.position);
    snapCarToGround();
    car.rotation.set(0, playerSpawnState.rotationY, 0);
    collectibleSystem.setEnabled(true);
    playerCarsRemaining = PLAYER_CAR_POOL_SIZE;
    playerBattery = BATTERY_MAX;
    setPlayerBatteryLevel(playerBattery / BATTERY_MAX);
    setBatteryDepletedState(false, { showStatus: false });
    chargingZoneController.reset();
    chargingProgressHudController.reset();
    skidMarkController.reset();
    resetPlayerDamageState();
    clearDriveKeys();
    clearReplayEffects();
    clearDebris();
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
    clearReplayEffects();
    clearDebris();

    objectiveUi.resetStatus();
    finalScoreboardUi.hide();
    pickupRoundFinished = false;
    playerCollectedCount = 0;
    totalCollectedCount = 0;
    isCarDestroyed = false;
    playerCarsRemaining = PLAYER_CAR_POOL_SIZE;
    playerBattery = BATTERY_MAX;
    setPlayerBatteryLevel(playerBattery / BATTERY_MAX);
    setBatteryDepletedState(false, { showStatus: false });
    chargingZoneController.reset();
    chargingProgressHudController.reset();
    skidMarkController.reset();

    car.visible = true;
    car.position.copy(playerSpawnState.position);
    snapCarToGround();
    car.rotation.set(0, playerSpawnState.rotationY, 0);

    collectibleSystem.reset?.();
    collectibleSystem.setEnabled(true);
    botTrafficSystem?.reset?.({ sharedTargetColorHex: SHARED_PICKUP_COLOR_HEX });
    botStatusUi.render(botTrafficSystem?.getHudState?.() || []);

    resetPlayerDamageState();
    clearDriveKeys();
    initializePlayerPhysics(car);
    physicsAccumulator = 0;
    minimapAccumulator = MINIMAP_UPDATE_INTERVAL;
}

function clearDebris() {
    for (let i = debrisPieces.length - 1; i >= 0; i -= 1) {
        scene.remove(debrisPieces[i].mesh);
        disposeDebrisObject(debrisPieces[i].mesh);
    }
    debrisPieces.length = 0;

    if (explosionLight) {
        scene.remove(explosionLight);
        explosionLight = null;
        explosionLightLife = 0;
    }
}

function processReplayEvents(events = []) {
    if (!events || events.length === 0) {
        return;
    }

    for (let i = 0; i < events.length; i += 1) {
        const event = events[i];
        if (!event) {
            continue;
        }

        if (event.type === REPLAY_EVENT_PICKUP) {
            const position = new THREE.Vector3(
                event.payload?.x || 0,
                event.payload?.y || 1.2,
                event.payload?.z || 0
            );
            spawnReplayPickupEffect(
                position,
                event.payload?.wrong ? 0xff556a : (event.payload?.colorHex || 0x7cf9ff)
            );
            continue;
        }

        if (event.type === REPLAY_EVENT_CRASH) {
            const hitPosition = new THREE.Vector3(
                event.payload?.x || car.position.x,
                event.payload?.y || car.position.y,
                event.payload?.z || car.position.z
            );
            const collisionPayload = event.payload?.collision || null;
            const replayCollision = collisionPayload
                ? {
                    obstacleCategory: collisionPayload.obstacleCategory || 'building',
                    impactSpeed: collisionPayload.impactSpeed || OBSTACLE_CRASH_MAX_SPEED,
                    impactNormal: new THREE.Vector3(
                        collisionPayload.impactNormalX || 0,
                        0,
                        collisionPayload.impactNormalZ || 0
                    ),
                }
                : null;
            spawnCarDebris(
                hitPosition,
                replayCollision
            );
        }
    }
}

function spawnReplayPickupEffect(position, colorHex) {
    const burstGroup = new THREE.Group();
    burstGroup.position.copy(position);
    burstGroup.position.y += 0.22;

    const coreMaterial = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), coreMaterial);
    burstGroup.add(core);

    const ringMaterial = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.68,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 30), ringMaterial);
    ring.rotation.x = -Math.PI * 0.5;
    burstGroup.add(ring);

    const light = new THREE.PointLight(colorHex, 1.8, 11, 2.1);
    light.position.set(0, 0.2, 0);
    burstGroup.add(light);

    scene.add(burstGroup);
    replayEffects.push({
        mesh: burstGroup,
        coreMaterial,
        ringMaterial,
        light,
        life: 0.54,
        maxLife: 0.54,
    });
}

function updateReplayEffects(dt) {
    for (let i = replayEffects.length - 1; i >= 0; i -= 1) {
        const effect = replayEffects[i];
        effect.life -= dt;

        const t = THREE.MathUtils.clamp(effect.life / effect.maxLife, 0, 1);
        const eased = 1 - t;
        const baseScale = 1 + eased * 2.6;

        effect.mesh.scale.setScalar(baseScale);
        effect.mesh.position.y += dt * (0.5 + eased * 1.7);
        effect.mesh.rotation.y += dt * 2.4;
        effect.coreMaterial.opacity = 0.18 + t * 0.72;
        effect.ringMaterial.opacity = 0.1 + t * 0.58;
        effect.light.intensity = 0.2 + t * 1.8;
        effect.light.distance = 5 + t * 8;

        if (effect.life <= 0) {
            scene.remove(effect.mesh);
            effect.mesh.traverse((node) => {
                if (node.isMesh) {
                    node.geometry?.dispose?.();
                    node.material?.dispose?.();
                }
            });
            replayEffects.splice(i, 1);
        }
    }
}

function clearReplayEffects() {
    for (let i = replayEffects.length - 1; i >= 0; i -= 1) {
        const effect = replayEffects[i];
        scene.remove(effect.mesh);
        effect.mesh.traverse((node) => {
            if (node.isMesh) {
                node.geometry?.dispose?.();
                node.material?.dispose?.();
            }
        });
    }
    replayEffects.length = 0;
}

function createWelcomeModalController({ onStart, onColorChange, initialColorHex } = {}) {
    const rootEl = document.getElementById('welcomeModal');
    const startBtnEl = document.getElementById('welcomeStartBtn');
    const previewCanvasEl = document.getElementById('welcomeCarCanvas');
    const selectedColorNameEl = document.getElementById('welcomeSelectedColorName');
    const colorOptionsEl = document.getElementById('welcomeColorOptions');
    if (!rootEl || !startBtnEl || !previewCanvasEl) {
        const fallbackColorHex = resolvePlayerCarColorHex(initialColorHex);
        return {
            show() {},
            hide() {},
            resize() {},
            update() {},
            isVisible() {
                return false;
            },
            isAvailable() {
                return false;
            },
            getSelectedColorHex() {
                return fallbackColorHex;
            },
            setSelectedColorHex() {},
            selectNeighborColor() {},
        };
    }

    const previewScene = new THREE.Scene();
    const previewCamera = new THREE.PerspectiveCamera(31, 16 / 9, 0.1, 100);
    const previewRenderer = new THREE.WebGLRenderer({
        canvas: previewCanvasEl,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
    });
    previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
    previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    previewRenderer.toneMappingExposure = 1.18;

    const skyFillLight = new THREE.HemisphereLight(0xaed8ff, 0x0f1b2d, 1.04);
    previewScene.add(skyFillLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.92);
    keyLight.position.set(4.4, 5.8, 6.1);
    previewScene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x9cc5ff, 0.7);
    rimLight.position.set(-5.4, 3.2, -4.7);
    previewScene.add(rimLight);

    const underGlow = new THREE.Mesh(
        new THREE.CircleGeometry(2.45, 48),
        new THREE.MeshBasicMaterial({
            color: 0x7fc0ff,
            transparent: true,
            opacity: 0.16,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        })
    );
    underGlow.rotation.x = -Math.PI * 0.5;
    underGlow.position.y = 0.02;
    previewScene.add(underGlow);

    const previewRig = createCarRig({
        bodyColor: 0x2d67a6,
        displayName: 'MAREK',
        addLights: true,
        addWheelWellLights: false,
        lightConfig: {
            enablePrimaryHeadlightProjectors: false,
            enableNearFillProjectors: false,
            enableFacadeFillProjectors: false,
            taillightIntensity: 1.3,
            taillightDistance: 8.2,
            taillightDecay: 3,
            taillightPositions: [
                { position: [-0.52, 0.54, WELCOME_PREVIEW_REAR_LIGHT_Z] },
                { position: [0.52, 0.54, WELCOME_PREVIEW_REAR_LIGHT_Z] },
            ],
        },
    });
    const previewCar = previewRig.car;
    previewCar.rotation.y = Math.PI * 0.32;
    previewScene.add(previewCar);
    const previewState = {
        speed: WELCOME_PREVIEW_STATE_SPEED,
        acceleration: 0,
        steerInput: 0,
        throttle: 0.62,
        brake: 0.18,
        burnout: 0,
        launchSlip: 0.14,
        yawRate: 0.06,
        velocity: new THREE.Vector2(0, -WELCOME_PREVIEW_STATE_SPEED),
        terrainCompression: 0,
        terrainGrounded: 1,
        verticalSpeed: 0,
    };
    let previewPulseTime = Math.random() * Math.PI * 2;
    const colorButtons = [];
    let selectedColorIndex = getCarColorPresetIndex(initialColorHex);

    const previewBounds = new THREE.Box3().setFromObject(previewCar);
    const previewSize = previewBounds.getSize(new THREE.Vector3());
    const previewRadius = Math.max(previewSize.x, previewSize.y, previewSize.z);
    const previewLookAt = new THREE.Vector3(0, previewSize.y * 0.28, 0);
    previewCamera.position.set(previewRadius * 1.48, previewRadius * 0.76, previewRadius * 1.85);
    previewCamera.lookAt(previewLookAt);
    buildColorOptions();
    setSelectedColorByIndex(selectedColorIndex, false);

    startBtnEl.addEventListener('click', () => {
        onStart?.();
    });

    return {
        show() {
            rootEl.hidden = false;
            setSelectedColorByIndex(getCarColorPresetIndex(selectedCarColorHex), false);
            syncPreviewSize();
            updatePreviewVisualState(1 / 60);
            renderPreview();
        },
        hide() {
            rootEl.hidden = true;
        },
        resize() {
            syncPreviewSize();
            if (!rootEl.hidden) {
                renderPreview();
            }
        },
        update(dt) {
            if (rootEl.hidden) {
                return;
            }
            previewCar.rotation.y += dt * WELCOME_CAR_SPIN_SPEED;
            updatePreviewVisualState(dt);
            renderPreview();
        },
        isVisible() {
            return !rootEl.hidden;
        },
        isAvailable() {
            return true;
        },
        getSelectedColorHex() {
            return CAR_COLOR_PRESETS[selectedColorIndex]?.hex ?? DEFAULT_PLAYER_CAR_COLOR_HEX;
        },
        setSelectedColorHex(colorHex, options = {}) {
            const { emitChange = true } = options;
            const colorIndex = getCarColorPresetIndex(colorHex);
            setSelectedColorByIndex(colorIndex, emitChange);
        },
        selectNeighborColor(step = 1) {
            setSelectedColorByIndex(selectedColorIndex + Math.sign(step || 1), true);
        },
    };

    function syncPreviewSize() {
        const width = Math.max(1, Math.round(previewCanvasEl.clientWidth || previewCanvasEl.width || 560));
        const height = Math.max(1, Math.round(previewCanvasEl.clientHeight || previewCanvasEl.height || 300));
        previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        previewRenderer.setSize(width, height, false);
        previewCamera.aspect = width / height;
        previewCamera.updateProjectionMatrix();
    }

    function renderPreview() {
        previewRenderer.render(previewScene, previewCamera);
    }

    function updatePreviewVisualState(dt) {
        previewPulseTime += Math.min(Math.max(dt || 0, 0), 0.05);
        const throttleWave = 0.5 + 0.5 * Math.sin(previewPulseTime * 1.2);
        const brakeWave = 0.5 + 0.5 * Math.sin(previewPulseTime * 2.6 + 0.4);
        const steerWave = Math.sin(previewPulseTime * 0.92);
        const launchWave = 0.5 + 0.5 * Math.sin(previewPulseTime * 1.8 + 0.9);
        const batteryWave = 0.5 + 0.5 * Math.sin(previewPulseTime * 0.22 + 0.7);

        previewState.throttle = 0.46 + throttleWave * 0.46;
        previewState.brake = 0.14 + brakeWave * 0.56;
        previewState.steerInput = steerWave * 0.38;
        previewState.launchSlip = 0.12 + launchWave * 0.26;
        previewState.burnout = launchWave * 0.12;
        previewState.speed = WELCOME_PREVIEW_STATE_SPEED + throttleWave * 6;
        previewState.velocity.set(0, -previewState.speed);
        previewState.acceleration = 3.4 * Math.sin(previewPulseTime * 1.42 + 0.15);
        previewState.yawRate = steerWave * 0.22;

        previewRig.setBatteryLevel(0.34 + batteryWave * 0.62);
        previewRig.updateVisuals(previewState, dt || 1 / 60);
    }

    function buildColorOptions() {
        if (!colorOptionsEl) {
            return;
        }

        colorOptionsEl.innerHTML = '';
        for (let i = 0; i < CAR_COLOR_PRESETS.length; i += 1) {
            const preset = CAR_COLOR_PRESETS[i];
            const buttonEl = document.createElement('button');
            buttonEl.type = 'button';
            buttonEl.className = 'welcomeColorBtn';
            buttonEl.setAttribute('role', 'radio');
            buttonEl.setAttribute('aria-checked', 'false');
            buttonEl.setAttribute('aria-label', `${preset.name} (${toCssHex(preset.hex).toUpperCase()})`);

            const swatchEl = document.createElement('span');
            swatchEl.className = 'welcomeColorSwatch';
            swatchEl.style.background = toCssHex(preset.hex);

            const nameEl = document.createElement('span');
            nameEl.className = 'welcomeColorName';
            nameEl.textContent = preset.name;

            buttonEl.append(swatchEl, nameEl);
            buttonEl.addEventListener('click', () => {
                setSelectedColorByIndex(i, true);
            });

            colorOptionsEl.appendChild(buttonEl);
            colorButtons.push(buttonEl);
        }
    }

    function setSelectedColorByIndex(nextIndex, emitChange = true) {
        if (!CAR_COLOR_PRESETS.length) {
            return;
        }

        const colorCount = CAR_COLOR_PRESETS.length;
        const normalizedIndex = Number.isFinite(nextIndex) ? Math.round(nextIndex) : 0;
        selectedColorIndex = ((normalizedIndex % colorCount) + colorCount) % colorCount;

        const selectedPreset = CAR_COLOR_PRESETS[selectedColorIndex];
        previewRig.setBodyColor(selectedPreset.hex);
        if (selectedColorNameEl) {
            selectedColorNameEl.textContent = selectedPreset.name;
        }
        syncColorOptionUi();
        if (emitChange) {
            onColorChange?.(selectedPreset.hex, selectedPreset);
        }
    }

    function syncColorOptionUi() {
        if (!colorButtons.length) {
            return;
        }

        for (let i = 0; i < colorButtons.length; i += 1) {
            const buttonEl = colorButtons[i];
            const isActive = i === selectedColorIndex;
            buttonEl.classList.toggle('active', isActive);
            buttonEl.setAttribute('aria-checked', isActive ? 'true' : 'false');
        }
    }
}

function createBotStatusController() {
    const listEl = document.getElementById('botList');
    if (!listEl) {
        return {
            render() {},
        };
    }

    return {
        render(botStateList = []) {
            if (!botStateList.length) {
                listEl.textContent = 'No bots available';
                return;
            }

            listEl.innerHTML = botStateList
                .map((bot) => {
                    const targetHex = bot.targetColorHex ?? 0x6b84a5;
                    const targetName = bot.targetColorHex == null
                        ? '-'
                        : colorNameFromHex(targetHex);
                    return (
                        `<div class="botRow">`
                        + `<span class="botName">${bot.name}</span>`
                        + `<span class="botTarget">`
                        + `<span class="botSwatch" style="background:${toCssHex(targetHex)}"></span>`
                        + `${targetName}`
                        + `</span>`
                        + `<span class="botScore">${bot.collectedCount}</span>`
                        + `</div>`
                    );
                })
                .join('');
        },
    };
}

function createFinalScoreboardController() {
    const rootEl = document.getElementById('finalLeaderboard');
    const summaryEl = document.getElementById('leaderboardSummary');
    const listEl = document.getElementById('leaderboardList');
    const restartBtnEl = document.getElementById('leaderboardRestartBtn');

    if (!rootEl || !summaryEl || !listEl) {
        return {
            show() {},
            hide() {},
            isVisible() {
                return false;
            },
        };
    }
    restartBtnEl?.addEventListener('click', () => {
        restartGameWithCountdown();
    });

    return {
        show({ summaryText = '', entries = [], topScore = 0 } = {}) {
            summaryEl.textContent = summaryText;
            listEl.innerHTML = entries
                .map((entry, index) => {
                    const isWinner = (entry.collectedCount || 0) === topScore;
                    const rowClass = isWinner ? 'leaderboardRow winner' : 'leaderboardRow';
                    return (
                        `<div class="${rowClass}">`
                        + `<span class="leaderboardRank">#${index + 1}</span>`
                        + `<span class="leaderboardName">${entry.name}</span>`
                        + `<span class="leaderboardScore">${entry.collectedCount || 0}</span>`
                        + `</div>`
                    );
                })
                .join('');
            rootEl.hidden = false;
        },
        hide() {
            rootEl.hidden = true;
            listEl.innerHTML = '';
            summaryEl.textContent = '';
        },
        isVisible() {
            return !rootEl.hidden;
        },
    };
}

function createPauseMenuController({ onExit, onResume } = {}) {
    const rootEl = document.getElementById('pauseModal');
    const exitBtnEl = document.getElementById('pauseExitBtn');
    const resumeBtnEl = document.getElementById('pauseResumeBtn');
    if (!rootEl || !exitBtnEl || !resumeBtnEl) {
        return {
            show() {},
            hide() {},
            isVisible() {
                return false;
            },
        };
    }

    exitBtnEl.addEventListener('click', () => {
        onExit?.();
    });
    resumeBtnEl.addEventListener('click', () => {
        onResume?.();
    });

    return {
        show() {
            rootEl.hidden = false;
        },
        hide() {
            rootEl.hidden = true;
        },
        isVisible() {
            return !rootEl.hidden;
        },
    };
}

function setSelectedPlayerCarColor(colorHex, options = {}) {
    const { persist = true } = options;
    const normalized = resolvePlayerCarColorHex(colorHex);
    selectedCarColorHex = normalized;
    setPlayerCarBodyColor(normalized);
    if (persist) {
        persistPlayerCarColorHex(normalized);
    }
}

function readPersistedPlayerTopSpeedKph() {
    const fallback = getPlayerTopSpeedLimit().topSpeedKph;
    try {
        const storedValue = window.localStorage.getItem(PLAYER_TOP_SPEED_STORAGE_KEY);
        if (!storedValue) {
            return fallback;
        }
        const parsed = Number.parseInt(storedValue, 10);
        return clampPlayerTopSpeedKph(parsed, fallback);
    } catch {
        return fallback;
    }
}

function persistPlayerTopSpeedKph(speedKph) {
    const clamped = clampPlayerTopSpeedKph(speedKph, getPlayerTopSpeedLimit().topSpeedKph);
    try {
        window.localStorage.setItem(PLAYER_TOP_SPEED_STORAGE_KEY, String(clamped));
    } catch {
        // localStorage can fail in restricted browsing modes.
    }
}

function clampPlayerTopSpeedKph(speedKph, fallbackKph) {
    const bounds = getPlayerTopSpeedLimitBounds();
    const fallback = Number.isFinite(fallbackKph) ? fallbackKph : bounds.maxKph;
    const numeric = Number.isFinite(speedKph) ? speedKph : fallback;
    return THREE.MathUtils.clamp(Math.round(numeric), bounds.minKph, bounds.maxKph);
}

function resolvePlayerCarColorHex(colorHex) {
    if (!CAR_COLOR_PRESETS.length) {
        return DEFAULT_PLAYER_CAR_COLOR_HEX >>> 0;
    }

    const parsedColor = parseColorHexInput(colorHex);
    const presetIndex = getCarColorPresetIndex(parsedColor);
    return CAR_COLOR_PRESETS[presetIndex].hex;
}

function getCarColorPresetIndex(colorHex) {
    const normalized = parseColorHexInput(colorHex);
    for (let i = 0; i < CAR_COLOR_PRESETS.length; i += 1) {
        if ((CAR_COLOR_PRESETS[i].hex >>> 0) === normalized) {
            return i;
        }
    }
    return 0;
}

function readPersistedPlayerCarColorHex() {
    try {
        const storedValue = window.localStorage.getItem(CAR_COLOR_STORAGE_KEY);
        if (!storedValue) {
            return DEFAULT_PLAYER_CAR_COLOR_HEX;
        }
        return parseColorHexInput(storedValue);
    } catch {
        return DEFAULT_PLAYER_CAR_COLOR_HEX;
    }
}

function persistPlayerCarColorHex(colorHex) {
    try {
        window.localStorage.setItem(CAR_COLOR_STORAGE_KEY, String(resolvePlayerCarColorHex(colorHex)));
    } catch {
        // localStorage can fail in restricted browsing modes.
    }
}

function parseColorHexInput(input) {
    if (typeof input === 'number' && Number.isFinite(input)) {
        return input >>> 0;
    }

    if (typeof input !== 'string') {
        return DEFAULT_PLAYER_CAR_COLOR_HEX >>> 0;
    }

    const value = input.trim();
    if (!value) {
        return DEFAULT_PLAYER_CAR_COLOR_HEX >>> 0;
    }

    if (value.startsWith('#')) {
        const parsedHex = Number.parseInt(value.slice(1), 16);
        return Number.isFinite(parsedHex) ? (parsedHex >>> 0) : (DEFAULT_PLAYER_CAR_COLOR_HEX >>> 0);
    }

    if (/^\d+$/u.test(value)) {
        const decimal = Number.parseInt(value, 10);
        return decimal >>> 0;
    }

    const normalizedHex = value.startsWith('0x') || value.startsWith('0X')
        ? value.slice(2)
        : value;
    if (!/^[\da-fA-F]+$/u.test(normalizedHex)) {
        return DEFAULT_PLAYER_CAR_COLOR_HEX >>> 0;
    }

    const parsedHex = Number.parseInt(normalizedHex, 16);
    return Number.isFinite(parsedHex) ? (parsedHex >>> 0) : (DEFAULT_PLAYER_CAR_COLOR_HEX >>> 0);
}

function toCssHex(colorHex) {
    return `#${(colorHex >>> 0).toString(16).padStart(6, '0')}`;
}

function colorNameFromHex(colorHex) {
    const normalized = colorHex >>> 0;
    return COLOR_NAMES[normalized] || toCssHex(normalized).toUpperCase();
}
