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
    updateGroundMotion,
} from './environment.js';
import { car, updateCarVisuals } from './car.js';
import { camera, updateCamera } from './camera.js';
import {
    updatePlayerPhysics,
    applyInterpolatedPlayerTransform,
    initializePlayerPhysics,
    getVehicleState,
    keys,
} from './carphysics.js';
import { addStars } from './stars.js';
import { createCollectibleSystem } from './collectibles.js';
import { createMiniMapController } from './minimap.js';

const clock = new THREE.Clock();
const physicsStep = 1 / 120;
let physicsAccumulator = 0;
const MAX_PHYSICS_STEPS_PER_FRAME = 6;
const MINIMAP_UPDATE_INTERVAL = 1 / 20;
let minimapAccumulator = 0;
const COLOR_NAMES = {
    [0x7cf9ff]: 'Neo türkiis',
    [0xff85f8]: 'Neoon roosa',
    [0x8dff9a]: 'Heleroheline',
    [0xffd86b]: 'Merevaik',
};
const DEBRIS_GRAVITY = 26;
const DEBRIS_DRAG = 2.2;
const DEBRIS_BOUNCE_DAMPING = 0.32;
const DEBRIS_LIFETIME = 3.5;
const DEBRIS_COUNT = 30;
const STATUS_DEFAULT_TEXT = 'Vale värv = auto plahvatab';
const debrisPieces = [];
const objectiveUi = createObjectiveUiController();
let isCarDestroyed = false;
let explosionLight = null;
let explosionLightLife = 0;

// Stseeni ja renderdamise algne seadistamine
const scene = initializeScene();
const renderer = initializeRenderer();
const starsController = addStars(scene);
const collectibleSystem = createCollectibleSystem(scene, worldBounds, {
    onTargetColorChanged: ({ targetColorHex }) => {
        objectiveUi.setTargetColor(targetColorHex);
    },
    onCorrectPickup: ({ pickupColorHex }) => {
        objectiveUi.flashCorrect(pickupColorHex);
    },
    onWrongPickup: ({ pickupColorHex, targetColorHex, position }) => {
        triggerCarExplosion(position, pickupColorHex, targetColorHex);
    },
});
const miniMapController = createMiniMapController(worldBounds);
initializePlayerPhysics(car);

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

    window.addEventListener('resize', onWindowResize);
}

// Klahvide vajutamise töötlemine
function handleKey(event, isKeyDown) {
    const key = event.key.toLowerCase();
    const actions = {
        arrowup: () => (keys.forward = isKeyDown),
        arrowdown: () => (keys.backward = isKeyDown),
        arrowleft: () => (keys.left = isKeyDown),
        arrowright: () => (keys.right = isKeyDown),
        f: () => isKeyDown && toggleFullscreen(),
        q: () => isKeyDown && location.reload(),
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
}

// Täisekraani režiimi lülitamine
function toggleFullscreen() {
    const canvas = document.getElementById('gameCanvas');
    if (!document.fullscreenElement) {
        canvas.requestFullscreen().catch(console.error);
    } else {
        document.exitFullscreen().catch(console.error);
    }
}

// Animatsioonitsükkel
function animate() {
    requestAnimationFrame(animate);

    const frameDelta = Math.min(clock.getDelta(), 0.05);

    const vehicleState = getVehicleState();
    if (!isCarDestroyed) {
        physicsAccumulator += frameDelta;

        let physicsSteps = 0;
        while (physicsAccumulator >= physicsStep && physicsSteps < MAX_PHYSICS_STEPS_PER_FRAME) {
            updatePlayerPhysics(car, physicsStep, worldBounds, staticObstacles);
            physicsAccumulator -= physicsStep;
            physicsSteps += 1;
        }

        // Avoid a catch-up spiral when rendering falls behind.
        if (physicsSteps === MAX_PHYSICS_STEPS_PER_FRAME && physicsAccumulator > physicsStep) {
            physicsAccumulator = physicsStep;
        }

        const interpolationAlpha = physicsAccumulator / physicsStep;
        applyInterpolatedPlayerTransform(car, interpolationAlpha);
        updateCarVisuals(vehicleState, frameDelta);
    } else {
        physicsAccumulator = 0;
        updateDebris(frameDelta);
    }

    const cameraSpeed = isCarDestroyed ? 0 : vehicleState.speed;
    updateCamera(car, cameraSpeed, frameDelta);
    updateGroundMotion(car.position, cameraSpeed);
    starsController.update(frameDelta);
    collectibleSystem.update(car.position, frameDelta);
    minimapAccumulator += frameDelta;
    if (minimapAccumulator >= MINIMAP_UPDATE_INTERVAL) {
        miniMapController.update(
            car.position,
            car.rotation.y,
            collectibleSystem.getVisiblePickups()
        );
        minimapAccumulator = 0;
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

function triggerCarExplosion(hitPosition, pickupColorHex, targetColorHex) {
    if (isCarDestroyed) {
        return;
    }

    isCarDestroyed = true;
    collectibleSystem.setEnabled(false);
    car.visible = false;
    keys.forward = false;
    keys.backward = false;
    keys.left = false;
    keys.right = false;

    objectiveUi.showFailure(pickupColorHex, targetColorHex);
    spawnCarDebris(hitPosition, pickupColorHex, targetColorHex);
}

function spawnCarDebris(hitPosition, pickupColorHex, targetColorHex) {
    const origin = car.position.clone();
    const hitDirection = new THREE.Vector3().subVectors(hitPosition, origin);
    hitDirection.y = 0;
    if (hitDirection.lengthSq() < 0.0001) {
        hitDirection.set(0, 0, -1);
    }
    hitDirection.normalize();

    const palette = [0x2d67a6, 0x8da6c9, 0x1f2733, pickupColorHex, targetColorHex];

    for (let i = 0; i < DEBRIS_COUNT; i += 1) {
        const sizeX = 0.12 + Math.random() * 0.34;
        const sizeY = 0.09 + Math.random() * 0.26;
        const sizeZ = 0.11 + Math.random() * 0.32;
        const geometry = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
        const colorHex = palette[Math.floor(Math.random() * palette.length)];
        const material = new THREE.MeshStandardMaterial({
            color: colorHex,
            emissive: colorHex,
            emissiveIntensity: 0.14,
            roughness: 0.46,
            metalness: 0.62,
        });
        const piece = new THREE.Mesh(geometry, material);

        piece.position.copy(origin);
        piece.position.x += (Math.random() - 0.5) * 1.6;
        piece.position.y += 0.45 + Math.random() * 1.1;
        piece.position.z += (Math.random() - 0.5) * 1.9;
        piece.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        scene.add(piece);

        const outward = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            0.38 + Math.random() * 1.15,
            (Math.random() - 0.5) * 2
        ).normalize();
        outward.addScaledVector(hitDirection, 0.62).normalize();

        debrisPieces.push({
            mesh: piece,
            velocity: outward.multiplyScalar(8 + Math.random() * 10),
            angularVelocity: new THREE.Vector3(
                (Math.random() - 0.5) * 11,
                (Math.random() - 0.5) * 11,
                (Math.random() - 0.5) * 11
            ),
            life: DEBRIS_LIFETIME + Math.random() * 1.1,
        });
    }

    explosionLight = new THREE.PointLight(0xff7a4f, 4.8, 50, 2);
    explosionLight.position.copy(origin);
    explosionLight.position.y += 1.2;
    explosionLightLife = 0.7;
    scene.add(explosionLight);
}

function updateDebris(dt) {
    for (let i = debrisPieces.length - 1; i >= 0; i -= 1) {
        const piece = debrisPieces[i];
        piece.life -= dt;

        piece.velocity.y -= DEBRIS_GRAVITY * dt;
        piece.velocity.multiplyScalar(Math.exp(-DEBRIS_DRAG * dt));
        piece.mesh.position.addScaledVector(piece.velocity, dt);
        piece.mesh.rotation.x += piece.angularVelocity.x * dt;
        piece.mesh.rotation.y += piece.angularVelocity.y * dt;
        piece.mesh.rotation.z += piece.angularVelocity.z * dt;

        if (piece.mesh.position.y < 0.14) {
            piece.mesh.position.y = 0.14;
            if (piece.velocity.y < 0) {
                piece.velocity.y = -piece.velocity.y * DEBRIS_BOUNCE_DAMPING;
            }
            piece.velocity.x *= 0.88;
            piece.velocity.z *= 0.88;
            piece.angularVelocity.multiplyScalar(0.96);
        }

        if (piece.life <= 0) {
            scene.remove(piece.mesh);
            piece.mesh.geometry.dispose();
            piece.mesh.material.dispose();
            debrisPieces.splice(i, 1);
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

function createObjectiveUiController() {
    const swatchEl = document.getElementById('targetColorSwatch');
    const colorNameEl = document.getElementById('targetColorName');
    const statusEl = document.getElementById('objectiveStatus');
    let statusTimer = null;

    if (!swatchEl || !colorNameEl || !statusEl) {
        return {
            setTargetColor() {},
            flashCorrect() {},
            showFailure() {},
        };
    }

    return {
        setTargetColor(colorHex) {
            swatchEl.style.background = toCssHex(colorHex);
            colorNameEl.textContent = colorNameFromHex(colorHex);
        },
        flashCorrect(colorHex) {
            setStatus(`Õige: ${colorNameFromHex(colorHex)}`, '#8dff9a');
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
    };

    function setStatus(text, color, timeoutMs = 1400) {
        statusEl.textContent = text;
        statusEl.style.color = color;
        if (statusTimer) {
            clearTimeout(statusTimer);
            statusTimer = null;
        }

        if (!isCarDestroyed) {
            statusTimer = setTimeout(() => {
                statusEl.textContent = STATUS_DEFAULT_TEXT;
                statusEl.style.color = 'rgba(195, 228, 255, 0.9)';
            }, timeoutMs);
        }
    }
}

function toCssHex(colorHex) {
    return `#${(colorHex >>> 0).toString(16).padStart(6, '0')}`;
}

function colorNameFromHex(colorHex) {
    const normalized = colorHex >>> 0;
    return COLOR_NAMES[normalized] || toCssHex(normalized).toUpperCase();
}
