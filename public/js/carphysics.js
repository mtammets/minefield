import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

export const keys = { forward: false, backward: false, left: false, right: false };

const TUNING = {
    maxForwardSpeed: 95,
    maxReverseSpeed: 8,
    engineAcceleration: 62,
    launchAcceleration: 10,
    reverseAcceleration: 14,
    brakeDeceleration: 36,
    rollingResistance: 0.9,
    aerodynamicDrag: 0.01,
    wheelBase: 2.6,
    lowSpeedSteer: 0.3,
    highSpeedSteer: 0.075,
    steerFadeSpeed: 45,
    steerResponse: 2.8,
    steerReturn: 5.2,
    lowSpeedGrip: 60,
    highSpeedGrip: 30,
    minTurningSpeed: 0.35,
    throttleRise: 5.5,
    throttleFall: 6.2,
    brakeRise: 16,
    brakeFall: 12,
    holdRampTime: 2.8,
    holdBoost: 0.8,
    holdDecay: 2.0,
};
const VEHICLE_COLLISION_RADIUS = 1.15;
const OBSTACLE_COLLISION_ITERATIONS = 2;

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
const collisionNormal = new THREE.Vector2();
const physicsPosition = new THREE.Vector3();
const previousPhysicsPosition = new THREE.Vector3();
const interpolatedPosition = new THREE.Vector3();

let physicsRotationY = 0;
let previousPhysicsRotationY = 0;
let isPhysicsInitialized = false;

export function getVehicleState() {
    return vehicleState;
}

export function initializePlayerPhysics(player) {
    physicsPosition.copy(player.position);
    previousPhysicsPosition.copy(player.position);
    physicsRotationY = player.rotation.y;
    previousPhysicsRotationY = player.rotation.y;
    isPhysicsInitialized = true;
}

export function updatePlayerPhysics(player, deltaTime = 1 / 60, worldBounds = null, staticObstacles = null) {
    if (!isPhysicsInitialized) {
        initializePlayerPhysics(player);
    }

    const dt = Math.min(deltaTime, 0.05);

    previousPhysicsPosition.copy(physicsPosition);
    previousPhysicsRotationY = physicsRotationY;

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
    physicsRotationY += yawRate * dt;

    forward.set(-Math.sin(physicsRotationY), -Math.cos(physicsRotationY));
    right.set(-forward.y, forward.x);

    const lateralSpeed = vehicleState.velocity.dot(right);
    const grip = THREE.MathUtils.lerp(TUNING.lowSpeedGrip, TUNING.highSpeedGrip, speedRatio);
    const lowSpeedGripBoost = THREE.MathUtils.clamp(speedAbs / 1.2, 0, 1);
    const lateralDecay = Math.exp(-grip * dt);
    const stabilizedLateralSpeed = lateralSpeed * lateralDecay * lowSpeedGripBoost;

    vehicleState.velocity.copy(forward).multiplyScalar(vehicleState.speed);
    vehicleState.velocity.addScaledVector(right, stabilizedLateralSpeed);

    movement.set(vehicleState.velocity.x, 0, vehicleState.velocity.y).multiplyScalar(dt);
    physicsPosition.add(movement);
    constrainToWorld(physicsPosition, worldBounds);
    constrainToObstacles(physicsPosition, staticObstacles);

    player.position.copy(physicsPosition);
    player.rotation.y = physicsRotationY;

    return vehicleState;
}

function constrainToObstacles(position, staticObstacles) {
    if (!staticObstacles || staticObstacles.length === 0) {
        return;
    }

    let collided = false;
    collisionNormal.set(0, 0);

    for (let iteration = 0; iteration < OBSTACLE_COLLISION_ITERATIONS; iteration += 1) {
        let collidedThisPass = false;

        for (let i = 0; i < staticObstacles.length; i += 1) {
            const obstacle = staticObstacles[i];
            if (obstacle.type === 'circle') {
                const nx = position.x - obstacle.x;
                const nz = position.z - obstacle.z;
                const combinedRadius = obstacle.radius + VEHICLE_COLLISION_RADIUS;
                const distanceSq = nx * nx + nz * nz;
                if (distanceSq >= combinedRadius * combinedRadius) {
                    continue;
                }

                let normalX = nx;
                let normalZ = nz;
                let distance = Math.sqrt(distanceSq);

                if (distance < 0.0001) {
                    normalX = -Math.sin(physicsRotationY);
                    normalZ = -Math.cos(physicsRotationY);
                    distance = 1;
                } else {
                    normalX /= distance;
                    normalZ /= distance;
                }

                const penetration = combinedRadius - distance;
                position.x += normalX * penetration;
                position.z += normalZ * penetration;
                collisionNormal.x += normalX;
                collisionNormal.y += normalZ;
                collided = true;
                collidedThisPass = true;
                continue;
            }

            if (obstacle.type !== 'aabb') {
                continue;
            }

            const closestX = THREE.MathUtils.clamp(position.x, obstacle.minX, obstacle.maxX);
            const closestZ = THREE.MathUtils.clamp(position.z, obstacle.minZ, obstacle.maxZ);
            let dx = position.x - closestX;
            let dz = position.z - closestZ;
            let distanceSq = dx * dx + dz * dz;
            if (distanceSq >= VEHICLE_COLLISION_RADIUS * VEHICLE_COLLISION_RADIUS) {
                continue;
            }

            let normalX = dx;
            let normalZ = dz;
            let distance = Math.sqrt(distanceSq);

            if (distance < 0.0001) {
                const toLeft = Math.abs(position.x - obstacle.minX);
                const toRight = Math.abs(obstacle.maxX - position.x);
                const toBottom = Math.abs(position.z - obstacle.minZ);
                const toTop = Math.abs(obstacle.maxZ - position.z);
                const minDistance = Math.min(toLeft, toRight, toBottom, toTop);

                if (minDistance === toLeft) {
                    normalX = -1;
                    normalZ = 0;
                } else if (minDistance === toRight) {
                    normalX = 1;
                    normalZ = 0;
                } else if (minDistance === toBottom) {
                    normalX = 0;
                    normalZ = -1;
                } else {
                    normalX = 0;
                    normalZ = 1;
                }
                distance = 0;
            } else {
                normalX /= distance;
                normalZ /= distance;
            }

            const penetration = VEHICLE_COLLISION_RADIUS - distance;
            position.x += normalX * penetration;
            position.z += normalZ * penetration;
            collisionNormal.x += normalX;
            collisionNormal.y += normalZ;
            collided = true;
            collidedThisPass = true;
        }

        if (!collidedThisPass) {
            break;
        }
    }

    if (!collided) {
        return;
    }

    if (collisionNormal.lengthSq() > 0.0001) {
        collisionNormal.normalize();
        const inwardSpeed = vehicleState.velocity.dot(collisionNormal);
        if (inwardSpeed < 0) {
            vehicleState.velocity.addScaledVector(collisionNormal, -inwardSpeed);
        }
    }

    vehicleState.velocity.multiplyScalar(0.82);
    vehicleState.speed = THREE.MathUtils.clamp(
        vehicleState.velocity.dot(forward),
        -TUNING.maxReverseSpeed,
        TUNING.maxForwardSpeed
    );
    if (Math.abs(vehicleState.speed) < 0.1) {
        vehicleState.speed = 0;
    }
}

export function applyInterpolatedPlayerTransform(player, alpha) {
    if (!isPhysicsInitialized) {
        return;
    }

    const blend = THREE.MathUtils.clamp(alpha, 0, 1);
    interpolatedPosition.lerpVectors(previousPhysicsPosition, physicsPosition, blend);
    player.position.copy(interpolatedPosition);
    player.rotation.y = lerpAngle(previousPhysicsRotationY, physicsRotationY, blend);
}

function constrainToWorld(position, worldBounds) {
    if (!worldBounds) {
        return;
    }

    let hitX = false;
    let hitZ = false;

    if (position.x < worldBounds.minX) {
        position.x = worldBounds.minX;
        hitX = true;
    } else if (position.x > worldBounds.maxX) {
        position.x = worldBounds.maxX;
        hitX = true;
    }

    if (position.z < worldBounds.minZ) {
        position.z = worldBounds.minZ;
        hitZ = true;
    } else if (position.z > worldBounds.maxZ) {
        position.z = worldBounds.maxZ;
        hitZ = true;
    }

    if (!hitX && !hitZ) {
        return;
    }

    if (hitX) {
        vehicleState.velocity.x = 0;
    }
    if (hitZ) {
        vehicleState.velocity.y = 0;
    }

    vehicleState.speed *= 0.35;
    if (Math.abs(vehicleState.speed) < 0.2) {
        vehicleState.speed = 0;
    }
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
        const speedCurve = 1 - Math.pow(speedNorm, 1.15);
        const throttleCurve = Math.pow(THREE.MathUtils.clamp(vehicleState.throttle, 0, 1), 1.35);
        const standingStartLimiter = THREE.MathUtils.lerp(
            0.5,
            1,
            THREE.MathUtils.clamp(speedAbs / 10, 0, 1)
        );
        const launchBoost = Math.exp(-speedAbs / 5.2) * TUNING.launchAcceleration;
        const boostedEngine = TUNING.engineAcceleration * (0.22 + speedCurve * 0.78) * vehicleState.powerBoost;
        acceleration += (boostedEngine + launchBoost) * throttleCurve * standingStartLimiter;
    } else if (vehicleState.throttle < 0) {
        const reverseFade = 1 - THREE.MathUtils.clamp(speedAbs / TUNING.maxReverseSpeed, 0, 1);
        acceleration += TUNING.reverseAcceleration * (0.4 + reverseFade * 0.6) * vehicleState.throttle;
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
    const lowSpeedAssist = THREE.MathUtils.clamp(speedAbs / 9.5, 0.08, 1);
    return baseYawRate * lowSpeedAssist;
}

function moveToward(current, target, maxDelta) {
    if (current < target) {
        return Math.min(current + maxDelta, target);
    }
    return Math.max(current - maxDelta, target);
}

function lerpAngle(a, b, t) {
    const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + delta * t;
}
