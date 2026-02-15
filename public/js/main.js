import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { ambientLight, skyLight, sunLight, ground, updateGroundMotion } from './environment.js';
import { car, updateCarVisuals } from './car.js';
import { camera, updateCamera } from './camera.js';
import { updatePlayerPhysics, getVehicleState, keys } from './carphysics.js';
import { addStars } from './stars.js';
import { createCollectibleSystem } from './collectibles.js';

const clock = new THREE.Clock();
const physicsStep = 1 / 120;
let physicsAccumulator = 0;
const MAX_PHYSICS_STEPS_PER_FRAME = 6;

// Stseeni ja renderdamise algne seadistamine
const scene = initializeScene();
const renderer = initializeRenderer();
const starsController = addStars(scene);
const collectibleSystem = createCollectibleSystem(scene);

// Klaviatuurikontrollide ja akna suuruse muutuste kuulamine
initializeControls();

// Animatsiooni käivitamine
animate();

/** Funktsioonid **/

// Stseeni initsialiseerimine ja objektide lisamine
function initializeScene() {
    const scene = new THREE.Scene();
    scene.add(ambientLight, skyLight, sunLight, car, ground);
    return scene;
}

// Rendereri seadistamine
function initializeRenderer() {
    const renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('gameCanvas'),
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
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
    physicsAccumulator += frameDelta;

    let physicsSteps = 0;
    while (physicsAccumulator >= physicsStep && physicsSteps < MAX_PHYSICS_STEPS_PER_FRAME) {
        updatePlayerPhysics(car, physicsStep);
        physicsAccumulator -= physicsStep;
        physicsSteps += 1;
    }

    // Avoid a catch-up spiral when rendering falls behind.
    if (physicsSteps === MAX_PHYSICS_STEPS_PER_FRAME && physicsAccumulator > physicsStep) {
        physicsAccumulator = physicsStep;
    }

    const vehicleState = getVehicleState();
    updateCarVisuals(vehicleState, frameDelta);
    updateCamera(car, vehicleState.speed, frameDelta);
    updateGroundMotion(car.position, vehicleState.speed);
    starsController.update(frameDelta);
    collectibleSystem.update(car.position, frameDelta);

    updateSunLightPosition();
    renderer.render(scene, camera);
}

// Päikese valguse positsiooni uuendamine auto suhtes
function updateSunLightPosition() {
    sunLight.position.set(car.position.x + 50, 150, car.position.z + 50);
    sunLight.target.position.set(car.position.x, car.position.y, car.position.z);
    sunLight.target.updateMatrixWorld();
}
