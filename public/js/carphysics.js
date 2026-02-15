import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

export const keys = { forward: false, backward: false, left: false, right: false };

const TUNING = {
    maxForwardSpeed: 22,
    maxReverseSpeed: 8,
    engineAcceleration: 26,
    reverseAcceleration: 14,
    brakeDeceleration: 36,
    rollingResistance: 2.2,
    aerodynamicDrag: 0.028,
    wheelBase: 2.6,
    lowSpeedSteer: 0.58,
    highSpeedSteer: 0.20,
    steerFadeSpeed: 20,
    steerResponse: 6.5,
    steerReturn: 10,
    lowSpeedGrip: 60,
    highSpeedGrip: 30,
    minTurningSpeed: 0.2,
};

const vehicleState = {
    speed: 0,
    steerInput: 0,
    steerAngle: 0,
    throttle: 0,
    brake: 0,
    velocity: new THREE.Vector2(0, 0),
};

const forward = new THREE.Vector2();
const right = new THREE.Vector2();
const movement = new THREE.Vector3();

export function getVehicleState() {
    return vehicleState;
}

export function updatePlayerPhysics(player, deltaTime = 1 / 60) {
    const dt = Math.min(deltaTime, 0.05);

    const speedAbs = Math.abs(vehicleState.speed);
    const speedRatio = THREE.MathUtils.clamp(speedAbs / TUNING.steerFadeSpeed, 0, 1);

    updateDriverInputs(dt);

    const steerLimit = THREE.MathUtils.lerp(TUNING.lowSpeedSteer, TUNING.highSpeedSteer, speedRatio);
    vehicleState.steerAngle = vehicleState.steerInput * steerLimit;

    const acceleration = calculateLongitudinalAcceleration();
    vehicleState.speed += acceleration * dt;
    vehicleState.speed = THREE.MathUtils.clamp(vehicleState.speed, -TUNING.maxReverseSpeed, TUNING.maxForwardSpeed);

    if (!vehicleState.throttle && !vehicleState.brake && Math.abs(vehicleState.speed) < 0.05) {
        vehicleState.speed = 0;
    }

    const yawRate = calculateYawRate(vehicleState.speed, vehicleState.steerAngle);
    player.rotation.y += yawRate * dt;

    forward.set(-Math.sin(player.rotation.y), -Math.cos(player.rotation.y));
    right.set(-forward.y, forward.x);

    const lateralSpeed = vehicleState.velocity.dot(right);
    const grip = THREE.MathUtils.lerp(TUNING.lowSpeedGrip, TUNING.highSpeedGrip, speedRatio);
    const lowSpeedGripBoost = THREE.MathUtils.clamp(speedAbs / 1.2, 0, 1);
    const lateralDecay = Math.exp(-grip * dt);
    const stabilizedLateralSpeed = lateralSpeed * lateralDecay * lowSpeedGripBoost;

    vehicleState.velocity.copy(forward).multiplyScalar(vehicleState.speed);
    vehicleState.velocity.addScaledVector(right, stabilizedLateralSpeed);

    movement.set(vehicleState.velocity.x, 0, vehicleState.velocity.y).multiplyScalar(dt);
    player.position.add(movement);

    return vehicleState;
}

function updateDriverInputs(dt) {
    const steerTarget = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    const steerRate = steerTarget === 0 ? TUNING.steerReturn : TUNING.steerResponse;
    vehicleState.steerInput = moveToward(vehicleState.steerInput, steerTarget, steerRate * dt);

    vehicleState.throttle = 0;
    vehicleState.brake = 0;

    if (keys.forward && !keys.backward) {
        if (vehicleState.speed < -0.5) {
            vehicleState.brake = 1;
        } else {
            vehicleState.throttle = 1;
        }
    } else if (keys.backward && !keys.forward) {
        if (vehicleState.speed > 0.5) {
            vehicleState.brake = 1;
        } else {
            vehicleState.throttle = -1;
        }
    }
}

function calculateLongitudinalAcceleration() {
    let acceleration = 0;
    const speedAbs = Math.abs(vehicleState.speed);

    if (vehicleState.throttle > 0) {
        const powerFade = 1 - THREE.MathUtils.clamp(vehicleState.speed / TUNING.maxForwardSpeed, 0, 1);
        acceleration += TUNING.engineAcceleration * (0.35 + powerFade * 0.65);
    } else if (vehicleState.throttle < 0) {
        const reverseFade = 1 - THREE.MathUtils.clamp(speedAbs / TUNING.maxReverseSpeed, 0, 1);
        acceleration -= TUNING.reverseAcceleration * (0.4 + reverseFade * 0.6);
    }

    if (vehicleState.brake > 0 && speedAbs > 0) {
        acceleration -= Math.sign(vehicleState.speed) * TUNING.brakeDeceleration * vehicleState.brake;
    }

    const drag = vehicleState.speed * speedAbs * TUNING.aerodynamicDrag;
    const rolling = vehicleState.speed * TUNING.rollingResistance;
    acceleration -= drag + rolling;

    return acceleration;
}

function calculateYawRate(speed, steerAngle) {
    const speedAbs = Math.abs(speed);
    if (speedAbs < TUNING.minTurningSpeed) {
        return 0;
    }

    const baseYawRate = (speed / TUNING.wheelBase) * Math.tan(steerAngle);
    const lowSpeedAssist = THREE.MathUtils.clamp(speedAbs / 7, 0.15, 1);
    return baseYawRate * lowSpeedAssist;
}

function moveToward(current, target, maxDelta) {
    if (current < target) {
        return Math.min(current + maxDelta, target);
    }
    return Math.max(current - maxDelta, target);
}
