import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

export const keys = { forward: false, backward: false, left: false, right: false };

const TUNING = {
    maxForwardSpeed: 95,
    maxReverseSpeed: 8,
    engineAcceleration: 80,
    launchAcceleration: 30,
    reverseAcceleration: 14,
    brakeDeceleration: 36,
    rollingResistance: 0.9,
    aerodynamicDrag: 0.01,
    wheelBase: 2.6,
    lowSpeedSteer: 0.38,
    highSpeedSteer: 0.09,
    steerFadeSpeed: 45,
    steerResponse: 3.8,
    steerReturn: 6.5,
    lowSpeedGrip: 60,
    highSpeedGrip: 30,
    minTurningSpeed: 0.2,
    throttleRise: 9,
    throttleFall: 7,
    brakeRise: 16,
    brakeFall: 12,
    holdRampTime: 2.0,
    holdBoost: 1.6,
    holdDecay: 2.4,
};

const vehicleState = {
    speed: 0,
    acceleration: 0,
    steerInput: 0,
    steerAngle: 0,
    throttle: 0,
    brake: 0,
    throttleHoldTime: 0,
    powerBoost: 1,
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
    vehicleState.acceleration = acceleration;
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

    let targetThrottle = 0;
    let targetBrake = 0;

    if (keys.forward && !keys.backward) {
        if (vehicleState.speed < -0.5) {
            targetBrake = 1;
        } else {
            targetThrottle = 1;
        }
    } else if (keys.backward && !keys.forward) {
        if (vehicleState.speed > 0.5) {
            targetBrake = 1;
        } else {
            targetThrottle = -1;
        }
    }

    const throttleRate = targetThrottle === 0 ? TUNING.throttleFall : TUNING.throttleRise;
    const brakeRate = targetBrake === 0 ? TUNING.brakeFall : TUNING.brakeRise;
    vehicleState.throttle = moveToward(vehicleState.throttle, targetThrottle, throttleRate * dt);
    vehicleState.brake = moveToward(vehicleState.brake, targetBrake, brakeRate * dt);

    if (vehicleState.throttle > 0.1 && vehicleState.brake < 0.1) {
        vehicleState.throttleHoldTime = Math.min(
            vehicleState.throttleHoldTime + dt,
            TUNING.holdRampTime
        );
    } else {
        vehicleState.throttleHoldTime = Math.max(
            0,
            vehicleState.throttleHoldTime - dt * TUNING.holdDecay
        );
    }

    const holdRatio = THREE.MathUtils.clamp(vehicleState.throttleHoldTime / TUNING.holdRampTime, 0, 1);
    vehicleState.powerBoost = 1 + holdRatio * TUNING.holdBoost;
}

function calculateLongitudinalAcceleration() {
    let acceleration = 0;
    const speedAbs = Math.abs(vehicleState.speed);

    if (vehicleState.throttle > 0) {
        const speedNorm = THREE.MathUtils.clamp(vehicleState.speed / TUNING.maxForwardSpeed, 0, 1);
        const powerFade = 1 - speedNorm;
        const launchBoost = Math.exp(-speedAbs / 6) * TUNING.launchAcceleration;
        const boostedEngine = TUNING.engineAcceleration * (0.32 + powerFade * 0.68) * vehicleState.powerBoost;
        acceleration += (boostedEngine + launchBoost) * vehicleState.throttle;
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
