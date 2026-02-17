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
} from './environment.js';
import {
    car,
    createCarRig,
    updateCarVisuals,
    setPlayerBatteryLevel,
    getPlayerCarCrashParts,
    setPlayerCarBodyColor,
} from './car.js';
import { camera, updateCamera } from './camera.js';
import {
    updatePlayerPhysics,
    applyInterpolatedPlayerTransform,
    initializePlayerPhysics,
    getVehicleState,
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
    [0x7cf9ff]: 'Neo türkiis',
    [0xff85f8]: 'Neoon roosa',
    [0x8dff9a]: 'Heleroheline',
    [0xffd86b]: 'Merevaik',
};
const CAR_COLOR_STORAGE_KEY = 'silentdrift-player-car-color-hex';
const CAR_COLOR_PRESETS = [
    { hex: 0x2d67a6, name: 'Kobalt sinine' },
    { hex: 0xd34545, name: 'Võidusõidu punane' },
    { hex: 0xff9f3f, name: 'Päikese oranž' },
    { hex: 0x3ca86f, name: 'Neoon roheline' },
    { hex: 0x8c9bb0, name: 'Titaan hall' },
    { hex: 0xe4edf6, name: 'Arktiline valge' },
];
const DEFAULT_PLAYER_CAR_COLOR_HEX = CAR_COLOR_PRESETS[0].hex;
const DEBRIS_GRAVITY = 26;
const DEBRIS_DRAG = 2.2;
const DEBRIS_BOUNCE_DAMPING = 0.32;
const DEBRIS_GROUND_CLEARANCE = 0.028;
const PLAYER_RIDE_HEIGHT = 0.06;
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
const STATUS_DEFAULT_TEXT = 'Tagaveoline ja võimas: juhitav nii edasi kui tagurdades. Kogu energiasfääre.';
const SHARED_PICKUP_COLOR_INDEX = 0;
const SHARED_PICKUP_COLOR_HEX = 0x7cf9ff;
const BATTERY_MAX = 100;
const BATTERY_PICKUP_GAIN = 24;
const BATTERY_IDLE_DRAIN_PER_SEC = 0;
const BATTERY_SPEED_DRAIN_PER_SPEED = 0.055;
const ROUND_TOTAL_PICKUPS = 10;
const PLAYER_CAR_POOL_SIZE = 3;
const PLAYER_RESPAWN_DELAY_MS = 850;
const REPLAY_EVENT_PICKUP = 'pickup';
const REPLAY_EVENT_CRASH = 'crash';
const WELCOME_CAR_SPIN_SPEED = 0.62;
const WELCOME_PREVIEW_STATE_SPEED = 17;
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

initializeBodyPartBaselines();

// Stseeni ja renderdamise algne seadistamine
const scene = initializeScene();
const renderer = initializeRenderer();
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
if (welcomeModalUi.isAvailable()) {
    showWelcomeModal();
}

// Klaviatuurikontrollide ja akna suuruse muutuste kuulamine
initializeControls();

// Animatsiooni käivitamine
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
    renderer.toneMappingExposure = 1.22;
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
}

// Klahvide vajutamise töötlemine
function handleKey(event, isKeyDown) {
    const rawKey = event.key.toLowerCase();
    const key = rawKey === ' ' || rawKey === 'spacebar' ? 'space' : rawKey;
    if (isKeyDown && event.repeat && (
        key === 'k'
        || key === 'v'
        || key === 'f'
        || key === 'q'
        || key === 'enter'
        || key === 'escape'
    )) {
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

    if (key === 'escape') {
        event.preventDefault();
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

    const actions = {
        arrowup: () => (keys.forward = isKeyDown),
        arrowdown: () => (keys.backward = isKeyDown),
        arrowleft: () => (keys.left = isKeyDown),
        arrowright: () => (keys.right = isKeyDown),
        w: () => (keys.forward = isKeyDown),
        s: () => (keys.backward = isKeyDown),
        a: () => (keys.left = isKeyDown),
        d: () => (keys.right = isKeyDown),
        space: () => (keys.handbrake = isKeyDown),
        f: () => isKeyDown && toggleFullscreen(),
        q: () => isKeyDown && startNewGame(),
        enter: () => {
            if (!isKeyDown || !finalScoreboardUi.isVisible()) {
                return;
            }
            startNewGame();
        },
        k: () => {
            if (!isKeyDown) {
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
                objectiveUi.showInfo('Taasesitus peatatud.');
            }

            if (isCarDestroyed) {
                objectiveUi.showInfo(
                    playerCarsRemaining > 0
                        ? 'Avarii pooleli. Oota uue auto ilmumist.'
                        : 'Kõik autod on otsas. Vajuta Q restart.'
                );
                return;
            }

            if (replayController.isRecording()) {
                replayController.stopRecording();
                const duration = replayController.getDuration();
                if (duration > 0.2) {
                    objectiveUi.showInfo(`Salvestus valmis (${duration.toFixed(1)}s). Vajuta V taasesituseks.`);
                } else {
                    objectiveUi.showInfo('Salvestus liiga lühike. Tee pikem sõit ja proovi uuesti.');
                }
                return;
            }

            replayController.startRecording(getVehicleState());
            objectiveUi.showInfo('Salvestus käib. Vajuta K lõpetamiseks.');
        },
        v: () => {
            if (!isKeyDown) {
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
                objectiveUi.showInfo('Taasesitus peatatud.');
                return;
            }

            if (!replayController.hasReplay()) {
                objectiveUi.showInfo('Replay puudub. Vajuta K ja salvesta sõit.');
                return;
            }

            resetRunStateForReplay();
            clearDriveKeys();
            if (replayController.startPlayback()) {
                clearReplayEffects();
                objectiveUi.showInfo('Tele-replay käivitus. V peatab, K alustab uut salvestust.');
            }
        },
    };
    if (actions[key]) actions[key]();
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

// Täisekraani režiimi lülitamine
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

// Animatsioonitsükkel
function animate() {
    requestAnimationFrame(animate);

    const frameDelta = Math.min(clock.getDelta(), 0.05);
    welcomeModalUi.update(frameDelta);
    if (!isGamePaused) {
        vehicleImpactStatusCooldown = Math.max(0, vehicleImpactStatusCooldown - frameDelta);

        const vehicleState = getVehicleState();
        const replayActive = replayController.isPlaybackActive();
        let visualState = vehicleState;

        if (replayActive) {
            physicsAccumulator = 0;
            const replayFrame = replayController.updatePlayback(frameDelta);
            if (replayFrame?.vehicleState) {
                visualState = replayFrame.vehicleState;
            }
            updateCarVisuals(visualState, frameDelta);
            processReplayEvents(replayFrame?.events);

            if (!replayController.isPlaybackActive()) {
                clearReplayEffects();
                clearPendingRespawn();
                initializePlayerPhysics(car);
                resetPlayerDamageState();
                physicsAccumulator = 0;
                objectiveUi.showInfo('Tele-replay lõppes.');
            }
        } else if (!isCarDestroyed && !pickupRoundFinished) {
            physicsAccumulator += frameDelta;
            const vehicleCollisionSnapshots = botTrafficSystem?.getCollisionSnapshots?.() || [];

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
                updateCarVisuals(vehicleState, frameDelta);
                updateBattery(vehicleState, frameDelta);
                replayController.updateRecording(frameDelta, vehicleState);
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

    updateSunLightPosition();
    renderer.render(scene, camera);
}

// Päikese valguse positsiooni uuendamine auto suhtes
function updateSunLightPosition() {
    sunLight.position.set(car.position.x + 95, 180, car.position.z + 78);
    sunLight.target.position.set(car.position.x, car.position.y, car.position.z);
    sunLight.target.updateMatrixWorld();
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
    collectibleSystem.setEnabled(false);
    car.visible = false;
    clearDriveKeys();

    playerCarsRemaining = Math.max(0, playerCarsRemaining - 1);

    const crashReason = options.statusText
        || `Vale (${colorNameFromHex(pickupColorHex)})! Õige oli ${colorNameFromHex(targetColorHex)}.`;
    spawnCarDebris(hitPosition, options.collision || null);

    if (playerCarsRemaining > 0) {
        objectiveUi.showCrash(
            `${crashReason} Uus auto saabub ${Math.round(PLAYER_RESPAWN_DELAY_MS / 100) / 10}s pärast. `
            + `Autosid järel: ${playerCarsRemaining}/${PLAYER_CAR_POOL_SIZE}.`
        );
        pendingRespawnTimeout = window.setTimeout(() => {
            pendingRespawnTimeout = null;
            respawnPlayerCar();
        }, PLAYER_RESPAWN_DELAY_MS);
        return;
    }

    objectiveUi.showCrash(`${crashReason} Kõik autod on otsas. Vajuta Q restart.`);
}

function triggerObstacleCrash(collision) {
    const obstacleLabel = collision.obstacleCategory === 'building'
        ? 'majja'
        : (collision.obstacleCategory === 'tree' ? 'puusse' : 'lambiposti');
    const speedLabel = Math.round(collision.impactSpeed);
    triggerCarExplosion(collision.position, 0xffa66b, 0xff4b4b, {
        statusText: `Sõitsid suure hooga ${obstacleLabel} (${speedLabel}).`,
        collision,
    });
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

    if (playerBattery <= 0.001) {
        triggerCarExplosion(car.position.clone(), 0xffb07d, 0xff4b4b, {
            statusText: 'Aku sai tühjaks.',
        });
    }
}

function addBattery(amount) {
    playerBattery = Math.min(BATTERY_MAX, playerBattery + Math.max(0, amount));
    setPlayerBatteryLevel(playerBattery / BATTERY_MAX);
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
        { name: 'Sina', collectedCount: playerCollectedCount },
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
    const tiePrefix = winners.length > 1 ? 'Viik' : 'Võitja';

    objectiveUi.showResult(
        `Objektid otsas (${resolvedCollected}/${resolvedTotal}). ${tiePrefix}: ${winnerLabel} (${topScore}).`
    );
    finalScoreboardUi.show({
        summaryText: `Korjatud ${resolvedCollected}/${resolvedTotal} objekti.`,
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
                ? `Tugev kokkupõrge (${Math.round(strongestImpact)}): võimalik rattakahjustus.`
                : `Kontakt teise autoga (${Math.round(strongestImpact)}).`,
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
                ? ` | Aku ${Math.round(batteryPercent)}%`
                : '';
            setStatus(`Õige: ${colorNameFromHex(colorHex)}${batteryLabel}`, '#8dff9a');
        },
        showFailure(wrongColorHex, targetColorHex) {
            const wrongName = colorNameFromHex(wrongColorHex);
            const targetName = colorNameFromHex(targetColorHex);
            setStatus(
                `Vale (${wrongName})! Õige oli ${targetName}. Vajuta Q restart.`,
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
    welcomeModalUi.hide();
    startNewGame();
}

function showWelcomeModal() {
    isWelcomeModalVisible = true;
    isGamePaused = true;
    clearDriveKeys();
    pauseMenuUi.hide();
    welcomeModalUi.show();
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
    resetPlayerDamageState();
    playerBattery = BATTERY_MAX;
    setPlayerBatteryLevel(playerBattery / BATTERY_MAX);
    initializePlayerPhysics(car);
    physicsAccumulator = 0;

    objectiveUi.showInfo(
        `Uus auto rajal. Autosid järel: ${playerCarsRemaining}/${PLAYER_CAR_POOL_SIZE}.`,
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
    resetPlayerDamageState();
    clearDriveKeys();
    clearReplayEffects();
    clearDebris();
}

function startNewGame() {
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
                { position: [-0.52, 0.54, 2.14] },
                { position: [0.52, 0.54, 2.14] },
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
                listEl.textContent = 'Botid puuduvad';
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
        startNewGame();
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
