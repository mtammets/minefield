import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { initializeWheels } from './wheels.js';
import { addLightsToCar, addLuxuryBody, createSuspensionLinkage } from './carbody.js';

const car = new THREE.Group();
const bodyRig = new THREE.Group();
const wheelRig = new THREE.Group();
car.add(wheelRig, bodyRig);

const bodyMeta = addLuxuryBody(bodyRig);
const wheelController = initializeWheels(wheelRig);
addLightsToCar(bodyRig);
const suspensionLinkage = createSuspensionLinkage(car, bodyRig, wheelRig, bodyMeta);

const SUSPENSION = {
    maxPitch: THREE.MathUtils.degToRad(4.8),
    maxRoll: THREE.MathUtils.degToRad(5.7),
    pitchAccelNorm: 42,
    bodySpring: 36,
    bodyDamping: 8.4,
    heaveSpring: 28,
    heaveDamping: 7.2,
    rollFromSteer: 0.92,
    roadBaseAmplitude: 0.004,
    roadSpeedAmplitude: 0.014,
};

const suspensionState = {
    pitch: 0,
    pitchVelocity: 0,
    roll: 0,
    rollVelocity: 0,
    heave: 0,
    heaveVelocity: 0,
    roadPhase: Math.random() * Math.PI * 2,
};

function updateCarVisuals(vehicleState, deltaTime) {
    const dt = Math.min(deltaTime || 1 / 60, 0.05);
    wheelController.update(vehicleState, dt);
    updateBodySuspension(vehicleState, dt);
    suspensionLinkage.update();
}

function updateBodySuspension(vehicleState, dt) {
    const speedAbs = Math.abs(vehicleState.speed || 0);
    const speedRatio = THREE.MathUtils.clamp(speedAbs / 75, 0, 1);

    const accelNorm = THREE.MathUtils.clamp(
        (vehicleState.acceleration || 0) / SUSPENSION.pitchAccelNorm,
        -1,
        1
    );
    const targetPitch = accelNorm * SUSPENSION.maxPitch;

    const steerInput = THREE.MathUtils.clamp(vehicleState.steerInput || 0, -1, 1);
    const targetRoll = -steerInput * speedRatio * SUSPENSION.maxRoll * SUSPENSION.rollFromSteer;

    suspensionState.roadPhase += dt * (1.8 + speedRatio * 9.5);
    const roadShake = Math.sin(suspensionState.roadPhase) * 0.65
        + Math.sin(suspensionState.roadPhase * 1.9 + 0.7) * 0.35;
    const roadAmplitude = SUSPENSION.roadBaseAmplitude + speedRatio * SUSPENSION.roadSpeedAmplitude;
    const dynamicSink = -Math.abs(targetRoll) * 0.15 - Math.abs(targetPitch) * 0.12;
    const targetHeave = roadShake * roadAmplitude + dynamicSink;

    springToTarget(
        suspensionState,
        'pitch',
        'pitchVelocity',
        targetPitch,
        SUSPENSION.bodySpring,
        SUSPENSION.bodyDamping,
        dt
    );
    springToTarget(
        suspensionState,
        'roll',
        'rollVelocity',
        targetRoll,
        SUSPENSION.bodySpring,
        SUSPENSION.bodyDamping,
        dt
    );
    springToTarget(
        suspensionState,
        'heave',
        'heaveVelocity',
        targetHeave,
        SUSPENSION.heaveSpring,
        SUSPENSION.heaveDamping,
        dt
    );

    bodyRig.rotation.x = suspensionState.pitch;
    bodyRig.rotation.z = suspensionState.roll;
    bodyRig.position.y = suspensionState.heave;
}

function springToTarget(state, valueKey, velocityKey, target, spring, damping, dt) {
    const value = state[valueKey];
    const velocity = state[velocityKey] + (target - value) * spring * dt;
    state[velocityKey] = velocity * Math.exp(-damping * dt);
    state[valueKey] = value + state[velocityKey] * dt;
}

export { car, updateCarVisuals };
