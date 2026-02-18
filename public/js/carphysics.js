import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { OBSTACLE_CRASH_MIN_SPEED } from './constants.js';

export const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    handbrake: false,
};

const TUNING = {
    maxForwardSpeed: 65,
    maxReverseSpeed: 26,
    engineAcceleration: 90,
    launchBoost: 34,
    reverseAcceleration: 56,
    brakeDeceleration: 98,
    brakeLowSpeedEffectiveness: 1.08,
    brakeHighSpeedEffectiveness: 0.62,
    brakeEffectivenessCurve: 1.25,
    coastBrake: 0,
    rollingResistance: 1.25,
    aerodynamicDrag: 0.012,
    coastRollingResistance: 0.24,
    coastAerodynamicScale: 0.85,
    throttleRise: 8.6,
    throttleFall: 7.4,
    lowSpeedThrottleRiseFadeSpeed: 9.5,
    lowSpeedThrottleRiseScale: 0.58,
    brakeRise: 24,
    brakeFall: 12.5,
    holdRampTime: 1.1,
    holdBoost: 0.11,
    holdDecay: 2.5,

    wheelBase: 2.62,
    frontAxleDistance: 1.24,
    rearAxleDistance: 1.38,
    yawInertia: 2.8,
    yawDamping: 3.45,
    yawStability: 1.95,
    lowSpeedYawAssist: 5.4,
    lowSpeedYawAssistFadeSpeed: 8.2,
    stationaryYawReturn: 18,
    maxYawRateLowSpeed: 5.4,
    maxYawRateHighSpeed: 5.2,
    minTurningSpeed: 0.06,

    lowSpeedSteer: THREE.MathUtils.degToRad(42),
    highSpeedSteer: THREE.MathUtils.degToRad(15.5),
    steerFadeSpeed: 52,
    steerResponse: 10.8,
    steerReturn: 13.2,
    lowSpeedSteerWeightFadeSpeed: 10,
    lowSpeedSteerInputScale: 0.72,
    lowSpeedSteerResponseScale: 0.62,
    steerResistanceStartSpeed: 26,
    steerResistanceFullSpeed: 82,
    highSpeedSteerInputScale: 0.9,
    highSpeedSteerResponseScale: 0.94,
    steerSlipReduction: 0.3,
    minSteerSlipScale: 0.78,
    steerForceBuildSpeed: 2.4,

    cornerStiffnessFront: 28,
    cornerStiffnessRear: 27,
    frontGripBase: 24,
    rearGripBase: 23,
    throttleRearGripLoss: 0.34,
    brakeRearGripLoss: 0.24,
    lowSpeedGripScale: 1.2,
    lateralDampingLowSpeed: 7.2,
    lateralDampingHighSpeed: 3.0,
    slipSpeedFloor: 1.15,
    brakeSlideMinSpeed: 2.2,
    brakeSlideSpeedRange: 6.5,
    brakeSlideBrakeMin: 0.12,
    brakeSlideSteerMin: 0.035,
    brakeSlideRearGripLoss: 0.9,
    brakeSlideFrontGripBoost: 0.24,
    brakeSlideYawAssist: 10.5,
    brakeSlideStabilityReduction: 0.88,
    brakeSlideLateralDampingReduction: 0.9,
    brakeSlideLateralKick: 22,
    handbrakeSpeedMin: 0.8,
    handbrakeSpeedRange: 4.5,
    handbrakeRearGripLoss: 0.78,
    handbrakeYawAssist: 7.6,
    handbrakeLateralKick: 15.2,
    handbrakeBrakeRise: 46,

    launchSlipFadeSpeed: 15,
    lowSpeedLaunchFadeSpeed: 12,
    lowSpeedLaunchThrottleCurve: 1.45,
    lowSpeedLaunchBoostScale: 0.7,
    launchSlipRise: 3.1,
    launchSlipFall: 9.6,
    launchAccelNorm: 52,
    launchWobbleSpeedLow: 7.4,
    launchWobbleSpeedHigh: 12.8,
    burnoutMaxSpeed: 8,
    burnoutThrottleMin: 0.62,
    burnoutSteerMin: 0.28,
    burnoutYawTorque: 26,
    burnoutYawRateCap: 7.8,
    burnoutForwardClamp: 5.2,
    burnoutForwardDamping: 6.4,
    burnoutLateralDamping: 7.2,
    burnoutRearGripLoss: 0.52,
    burnoutFrontGripBoost: 0.18,
    burnoutSlipTarget: 0.95,
    burnoutSlipRise: 8.5,

    worldImpactSpeedDamping: 0.42,
    obstacleImpactSpeedDamping: 0.74,
    vehicleImpactSpeedDamping: 0.9,
    vehicleImpactYawDamping: 0.86,
    vehicleImpactResponse: 0.74,
    crashSpeedThreshold: OBSTACLE_CRASH_MIN_SPEED,
};
const TOP_SPEED_LIMIT_TUNING = {
    stepKph: 5,
    minKph: 50,
    maxKph: 220,
};
const AUTOMATIC_TRANSMISSION = {
    enabled: true,
    gearTopSpeedsKph: [34, 62, 94, 128, 164, 200],
    gearForceScales: [1.18, 1.04, 0.92, 0.84, 0.78, 0.72],
    upshiftWindowRatio: 0.9,
    upshiftBaseDelaySec: 0.34,
    downshiftHysteresisKph: 9,
    capRiseRateKphPerSec: 210,
    capFallRateKphPerSec: 320,
};

const VEHICLE_COLLISION_RADIUS = 1.34;
const VEHICLE_COLLISION_HALF_WIDTH = 1.45;
const VEHICLE_COLLISION_HALF_LENGTH = 2.3;
const OBSTACLE_COLLISION_ITERATIONS = 4;
const HORIZONTAL_COLLISION_STEP_FACTOR = 0.42;
const MAX_HORIZONTAL_COLLISION_SUBSTEPS = 7;
const VEHICLE_COLLISION_MASS = 1.35;
const VEHICLE_COLLISION_PENETRATION_SHARE = 0.94;
// Roads/intersections are rendered slightly above the base terrain (around y=0.028),
// so add extra ride height to prevent visual tire clipping into road meshes.
const VEHICLE_RIDE_HEIGHT = 0.088;
// Wheel centers are around +/-1.28 in local X, so terrain sampling must match that width.
const TERRAIN_TRACK_HALF_WIDTH = 1.26;
// Small visual safety gap to avoid tire-ground clipping from camera angle/terrain interpolation.
const TERRAIN_WHEEL_CLEARANCE = 0.014;
const TERRAIN_TILT_RESPONSE = 8.6;
const TERRAIN_SUPPORT_HEIGHT_RESPONSE = 9.2;
const TERRAIN_MAX_PITCH = THREE.MathUtils.degToRad(12);
const TERRAIN_MAX_ROLL = THREE.MathUtils.degToRad(14);
const TERRAIN_SUSPENSION_STIFFNESS = 122;
const TERRAIN_SUSPENSION_COMPRESSION_DAMPING = 18;
const TERRAIN_SUSPENSION_REBOUND_DAMPING = 14;
const TERRAIN_GRAVITY = 34;
const TERRAIN_MAX_COMPRESSION = 0.042;
const TERRAIN_MAX_AIR_CLEARANCE = 1.8;
const TERRAIN_LANDING_IMPACT_SPEED = 2.4;
const TERRAIN_LANDING_BOUNCE = 0.16;
const TERRAIN_HARD_FLOOR_MARGIN = 0.004;

const vehicleState = {
    speed: 0,
    acceleration: 0,
    steerInput: 0,
    steerAngle: 0,
    steerPressTimer: 0,
    steerReleaseTimer: 0,
    throttle: 0,
    brake: 0,
    throttleHoldTime: 0,
    powerBoost: 1,
    launchSlip: 0,
    launchWobble: 0,
    launchPhase: Math.random() * Math.PI * 2,
    previousForwardThrottle: 0,
    burnout: 0,
    yawRate: 0,
    velocity: new THREE.Vector2(0, 0),
    verticalSpeed: 0,
    terrainCompression: 0,
    terrainGrounded: 1,
    topSpeedLimitKph: TOP_SPEED_LIMIT_TUNING.maxKph,
    topSpeedLimitPercent: 100,
    autoGearIndex: 0,
    autoShiftTimerSec: 0,
    autoTransmissionSpeedCapKph: AUTOMATIC_TRANSMISSION.gearTopSpeedsKph[0],
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
let physicsPitch = 0;
let previousPhysicsPitch = 0;
let physicsRoll = 0;
let previousPhysicsRoll = 0;
let physicsVerticalVelocity = 0;
let smoothedSupportedGroundHeight = 0;
let smoothedCenterGroundHeight = 0;
let terrainSupportFilterInitialized = false;
let isPhysicsInitialized = false;
let pendingCrashCollision = null;
const pendingVehicleCollisionContacts = [];
const vehicleDamageState = {
    wheelLossCount: 0,
    leftLoss: 0,
    rightLoss: 0,
    frontLoss: 0,
    rearLoss: 0,
    suspensionLoss: 0,
};

export function getVehicleState() {
    return vehicleState;
}

export function getPlayerTopSpeedLimit() {
    return createTopSpeedLimitSnapshot();
}

export function getPlayerTopSpeedLimitBounds() {
    return {
        minKph: TOP_SPEED_LIMIT_TUNING.minKph,
        maxKph: TOP_SPEED_LIMIT_TUNING.maxKph,
        stepKph: TOP_SPEED_LIMIT_TUNING.stepKph,
    };
}

export function setPlayerTopSpeedLimitKph(speedKph) {
    const nextTopSpeed = clampTopSpeedLimitKph(speedKph);
    vehicleState.topSpeedLimitKph = nextTopSpeed;
    vehicleState.topSpeedLimitPercent = getTopSpeedLimitPercent(nextTopSpeed);
    return createTopSpeedLimitSnapshot();
}

export function adjustPlayerTopSpeedLimit(direction = 0) {
    const delta = Number.isFinite(direction)
        ? Math.sign(direction) * TOP_SPEED_LIMIT_TUNING.stepKph
        : 0;
    if (delta === 0) {
        return createTopSpeedLimitSnapshot();
    }
    return setPlayerTopSpeedLimitKph(vehicleState.topSpeedLimitKph + delta);
}

export function consumeCrashCollision() {
    const collision = pendingCrashCollision;
    pendingCrashCollision = null;
    return collision;
}

export function consumeVehicleCollisionContacts() {
    if (pendingVehicleCollisionContacts.length === 0) {
        return [];
    }
    const contacts = pendingVehicleCollisionContacts.slice();
    pendingVehicleCollisionContacts.length = 0;
    return contacts;
}

export function applyNetworkVehicleCollisionImpulse(payload = {}) {
    if (!isPhysicsInitialized) {
        return false;
    }

    let normalX = Number(payload.normalX);
    let normalZ = Number(payload.normalZ);
    if (!Number.isFinite(normalX) || !Number.isFinite(normalZ)) {
        return false;
    }

    const normalLength = Math.hypot(normalX, normalZ);
    if (normalLength < 0.0001) {
        return false;
    }
    normalX /= normalLength;
    normalZ /= normalLength;

    const impactSpeed = THREE.MathUtils.clamp(Number(payload.impactSpeed) || 0, 0, 90);
    if (impactSpeed <= 0.01) {
        return false;
    }

    const penetration = THREE.MathUtils.clamp(Number(payload.penetration) || 0.04, 0, 1.8);
    const otherMass = THREE.MathUtils.clamp(Number(payload.mass) || VEHICLE_COLLISION_MASS, 0.4, 4);
    const otherVelocityX = THREE.MathUtils.clamp(Number(payload.otherVelocityX) || 0, -400, 400);
    const otherVelocityZ = THREE.MathUtils.clamp(Number(payload.otherVelocityZ) || 0, -400, 400);

    previousPhysicsPosition.copy(physicsPosition);
    const penetrationCorrection =
        penetration * VEHICLE_COLLISION_PENETRATION_SHARE * (0.65 + otherMass * 0.24);
    physicsPosition.x += normalX * penetrationCorrection;
    physicsPosition.z += normalZ * penetrationCorrection;

    const relativeAlongNormal =
        (vehicleState.velocity.x - otherVelocityX) * normalX +
        (vehicleState.velocity.y - otherVelocityZ) * normalZ;
    const resolvedImpactSpeed = Math.max(impactSpeed, -relativeAlongNormal);
    const normalResponse = resolvedImpactSpeed * TUNING.vehicleImpactResponse;
    vehicleState.velocity.x += normalX * normalResponse;
    vehicleState.velocity.y += normalZ * normalResponse;

    const forwardX = -Math.sin(physicsRotationY);
    const forwardZ = -Math.cos(physicsRotationY);
    const sideFactor = forwardX * normalZ - forwardZ * normalX;
    const yawKick = THREE.MathUtils.clamp(resolvedImpactSpeed / 20, 0, 1);
    vehicleState.yawRate += sideFactor * yawKick * (1.3 + otherMass * 0.22);

    vehicleState.velocity.multiplyScalar(TUNING.vehicleImpactSpeedDamping);
    vehicleState.yawRate *= TUNING.vehicleImpactYawDamping;
    forward.set(-Math.sin(physicsRotationY), -Math.cos(physicsRotationY));
    vehicleState.speed = vehicleState.velocity.dot(forward);

    const contactPosition = new THREE.Vector3(
        physicsPosition.x - normalX * VEHICLE_COLLISION_RADIUS * 0.35,
        physicsPosition.y,
        physicsPosition.z - normalZ * VEHICLE_COLLISION_RADIUS * 0.35
    );
    const sourcePlayerId =
        typeof payload.sourcePlayerId === 'string' && payload.sourcePlayerId.trim()
            ? payload.sourcePlayerId.trim()
            : '';
    pendingVehicleCollisionContacts.push({
        vehicleId: sourcePlayerId ? `player:${sourcePlayerId}` : 'player:network',
        sourceType: 'player',
        playerId: sourcePlayerId || 'network',
        normalX,
        normalZ,
        penetration,
        impactSpeed: resolvedImpactSpeed,
        position: contactPosition,
    });

    return true;
}

export function setVehicleDamageState(nextDamageState = {}) {
    vehicleDamageState.wheelLossCount = clampDamageCounter(nextDamageState.wheelLossCount, 4);
    vehicleDamageState.leftLoss = clampDamageCounter(nextDamageState.leftLoss, 6);
    vehicleDamageState.rightLoss = clampDamageCounter(nextDamageState.rightLoss, 6);
    vehicleDamageState.frontLoss = clampDamageCounter(nextDamageState.frontLoss, 6);
    vehicleDamageState.rearLoss = clampDamageCounter(nextDamageState.rearLoss, 6);
    vehicleDamageState.suspensionLoss = clampDamageCounter(nextDamageState.suspensionLoss, 4);
}

export function initializePlayerPhysics(player) {
    vehicleState.speed = 0;
    vehicleState.acceleration = 0;
    vehicleState.steerInput = 0;
    vehicleState.steerAngle = 0;
    vehicleState.steerPressTimer = 0;
    vehicleState.steerReleaseTimer = 0;
    vehicleState.throttle = 0;
    vehicleState.brake = 0;
    vehicleState.throttleHoldTime = 0;
    vehicleState.powerBoost = 1;
    vehicleState.launchSlip = 0;
    vehicleState.launchWobble = 0;
    vehicleState.launchPhase = Math.random() * Math.PI * 2;
    vehicleState.previousForwardThrottle = 0;
    vehicleState.burnout = 0;
    vehicleState.yawRate = 0;
    vehicleState.velocity.set(0, 0);
    vehicleState.verticalSpeed = 0;
    vehicleState.terrainCompression = 0;
    vehicleState.terrainGrounded = 1;
    vehicleState.topSpeedLimitKph = clampTopSpeedLimitKph(vehicleState.topSpeedLimitKph);
    vehicleState.topSpeedLimitPercent = getTopSpeedLimitPercent(vehicleState.topSpeedLimitKph);
    vehicleState.autoGearIndex = 0;
    vehicleState.autoShiftTimerSec = 0;
    vehicleState.autoTransmissionSpeedCapKph = AUTOMATIC_TRANSMISSION.gearTopSpeedsKph[0];

    physicsPosition.copy(player.position);
    previousPhysicsPosition.copy(player.position);
    physicsRotationY = player.rotation.y;
    previousPhysicsRotationY = player.rotation.y;
    physicsPitch = player.rotation.x;
    previousPhysicsPitch = player.rotation.x;
    physicsRoll = player.rotation.z;
    previousPhysicsRoll = player.rotation.z;
    physicsVerticalVelocity = 0;
    smoothedSupportedGroundHeight = player.position.y - VEHICLE_RIDE_HEIGHT;
    smoothedCenterGroundHeight = smoothedSupportedGroundHeight;
    terrainSupportFilterInitialized = false;
    isPhysicsInitialized = true;
    pendingCrashCollision = null;
    pendingVehicleCollisionContacts.length = 0;
}

export function updatePlayerPhysics(
    player,
    deltaTime = 1 / 60,
    worldBounds = null,
    staticObstacles = null,
    dynamicVehicles = null,
    sampleGroundHeight = null
) {
    if (!isPhysicsInitialized) {
        initializePlayerPhysics(player);
    }

    const dt = Math.min(deltaTime, 0.05);
    vehicleState.topSpeedLimitKph = clampTopSpeedLimitKph(vehicleState.topSpeedLimitKph);
    vehicleState.topSpeedLimitPercent = getTopSpeedLimitPercent(vehicleState.topSpeedLimitKph);

    previousPhysicsPosition.copy(physicsPosition);
    previousPhysicsRotationY = physicsRotationY;
    previousPhysicsPitch = physicsPitch;
    previousPhysicsRoll = physicsRoll;

    updateDriverInputs(dt);

    forward.set(-Math.sin(physicsRotationY), -Math.cos(physicsRotationY));
    right.set(-forward.y, forward.x);

    let longitudinalSpeed = vehicleState.velocity.dot(forward);
    let lateralSpeed = vehicleState.velocity.dot(right);
    const totalSpeed = vehicleState.velocity.length();
    const speedRatio = THREE.MathUtils.clamp(totalSpeed / TUNING.steerFadeSpeed, 0, 1);
    const burnoutFactor = getBurnoutFactor(totalSpeed);
    const brakeSlideFactor = getBrakeSlideFactor(longitudinalSpeed, lateralSpeed);
    const damageDynamics = getDamageDynamics();
    vehicleState.burnout = burnoutFactor;
    const bodySlip = Math.atan2(lateralSpeed, Math.abs(longitudinalSpeed) + TUNING.slipSpeedFloor);

    const steerLimit = THREE.MathUtils.lerp(
        TUNING.lowSpeedSteer,
        TUNING.highSpeedSteer,
        speedRatio
    );
    const steerLoadScale = THREE.MathUtils.clamp(
        1 - Math.abs(bodySlip) * TUNING.steerSlipReduction,
        TUNING.minSteerSlipScale,
        1
    );
    vehicleState.steerAngle = vehicleState.steerInput * steerLimit * steerLoadScale;

    const longitudinalForce = calculateLongitudinalForce(longitudinalSpeed, damageDynamics);
    const tireForces = calculateTireForces(
        longitudinalSpeed,
        lateralSpeed,
        vehicleState.yawRate,
        vehicleState.steerAngle,
        speedRatio,
        burnoutFactor,
        brakeSlideFactor,
        damageDynamics
    );

    let longitudinalAccel = longitudinalForce + lateralSpeed * vehicleState.yawRate;
    let lateralAccel = tireForces.lateral - longitudinalSpeed * vehicleState.yawRate;
    let yawAccel =
        tireForces.yaw / TUNING.yawInertia -
        vehicleState.yawRate * TUNING.yawDamping -
        bodySlip *
            TUNING.yawStability *
            (1 - brakeSlideFactor * TUNING.brakeSlideStabilityReduction);

    const lateralDamping = THREE.MathUtils.lerp(
        TUNING.lateralDampingLowSpeed,
        TUNING.lateralDampingHighSpeed,
        speedRatio
    );
    lateralAccel -=
        lateralSpeed *
        lateralDamping *
        (1 - brakeSlideFactor * TUNING.brakeSlideLateralDampingReduction);

    if (brakeSlideFactor > 0) {
        const slideDirection = Math.sign(vehicleState.steerInput) || Math.sign(bodySlip) || 1;
        yawAccel += slideDirection * brakeSlideFactor * TUNING.brakeSlideYawAssist;
        lateralAccel += slideDirection * brakeSlideFactor * TUNING.brakeSlideLateralKick;
    }
    if (keys.handbrake) {
        const handbrakeSpeedFactor = THREE.MathUtils.clamp(
            (totalSpeed - TUNING.handbrakeSpeedMin) / TUNING.handbrakeSpeedRange,
            0,
            1
        );
        if (handbrakeSpeedFactor > 0) {
            const handbrakeDirection =
                Math.sign(vehicleState.steerInput) || Math.sign(bodySlip) || 1;
            yawAccel += handbrakeDirection * handbrakeSpeedFactor * TUNING.handbrakeYawAssist;
            lateralAccel += handbrakeDirection * handbrakeSpeedFactor * TUNING.handbrakeLateralKick;
        }
    }

    const lowSpeedYawAssist = THREE.MathUtils.clamp(
        1 - totalSpeed / TUNING.lowSpeedYawAssistFadeSpeed,
        0,
        1
    );
    yawAccel +=
        vehicleState.steerAngle *
        vehicleState.throttle *
        TUNING.lowSpeedYawAssist *
        lowSpeedYawAssist;
    yawAccel +=
        damageDynamics.yawBiasTorque * THREE.MathUtils.clamp(Math.abs(longitudinalSpeed) / 8, 0, 1);
    longitudinalAccel -= longitudinalSpeed * damageDynamics.dragPenalty;

    if (burnoutFactor > 0) {
        const spinDirection = Math.sign(vehicleState.steerInput) || 1;
        yawAccel += spinDirection * TUNING.burnoutYawTorque * burnoutFactor;
        longitudinalAccel -= longitudinalSpeed * TUNING.burnoutForwardDamping * burnoutFactor;
        lateralAccel -= lateralSpeed * TUNING.burnoutLateralDamping * burnoutFactor;
    }

    longitudinalSpeed += longitudinalAccel * dt;
    lateralSpeed += lateralAccel * dt;
    vehicleState.yawRate += yawAccel * dt;

    const maxForwardSpeed = getEffectiveForwardSpeedLimit(damageDynamics.maxSpeedScale);
    const maxReverseSpeed = TUNING.maxReverseSpeed * damageDynamics.maxReverseScale;
    longitudinalSpeed = THREE.MathUtils.clamp(longitudinalSpeed, -maxReverseSpeed, maxForwardSpeed);
    if (burnoutFactor > 0) {
        longitudinalSpeed = THREE.MathUtils.clamp(
            longitudinalSpeed,
            -1.2,
            TUNING.burnoutForwardClamp
        );
    }

    if (!vehicleState.throttle && !vehicleState.brake) {
        if (Math.abs(longitudinalSpeed) < 0.05) {
            longitudinalSpeed = 0;
        }
        if (Math.abs(lateralSpeed) < 0.02) {
            lateralSpeed = 0;
        }
    }

    const yawRateCap = THREE.MathUtils.lerp(
        TUNING.maxYawRateLowSpeed,
        TUNING.maxYawRateHighSpeed,
        speedRatio
    );
    const dynamicYawCap = THREE.MathUtils.lerp(yawRateCap, TUNING.burnoutYawRateCap, burnoutFactor);
    vehicleState.yawRate = THREE.MathUtils.clamp(
        vehicleState.yawRate,
        -dynamicYawCap,
        dynamicYawCap
    );

    if (
        Math.abs(longitudinalSpeed) < TUNING.minTurningSpeed &&
        Math.abs(vehicleState.throttle) < 0.02
    ) {
        vehicleState.yawRate = moveToward(vehicleState.yawRate, 0, TUNING.stationaryYawReturn * dt);
    }

    physicsRotationY += vehicleState.yawRate * dt;

    forward.set(-Math.sin(physicsRotationY), -Math.cos(physicsRotationY));
    right.set(-forward.y, forward.x);

    vehicleState.velocity.copy(forward).multiplyScalar(longitudinalSpeed);
    vehicleState.velocity.addScaledVector(right, lateralSpeed);
    vehicleState.speed = longitudinalSpeed;
    vehicleState.acceleration = longitudinalAccel;

    updateLaunchTractionState(dt, burnoutFactor);

    movement.set(vehicleState.velocity.x, 0, vehicleState.velocity.y).multiplyScalar(dt);
    integrateHorizontalMovement(
        physicsPosition,
        movement,
        worldBounds,
        staticObstacles,
        dynamicVehicles,
        vehicleState.velocity.length()
    );
    if (typeof sampleGroundHeight === 'function') {
        applyTerrainSupport(sampleGroundHeight, dt);
    } else {
        physicsPitch = moveToward(physicsPitch, 0, TERRAIN_TILT_RESPONSE * 0.5 * dt);
        physicsRoll = moveToward(physicsRoll, 0, TERRAIN_TILT_RESPONSE * 0.5 * dt);
        vehicleState.verticalSpeed = moveToward(vehicleState.verticalSpeed, 0, 8 * dt);
        vehicleState.terrainCompression = moveToward(vehicleState.terrainCompression, 0, 6 * dt);
        vehicleState.terrainGrounded = 0;
    }

    player.position.copy(physicsPosition);
    player.rotation.set(physicsPitch, physicsRotationY, physicsRoll);

    return vehicleState;
}

function integrateHorizontalMovement(
    position,
    movementDelta,
    worldBounds,
    staticObstacles,
    dynamicVehicles,
    impactSpeed = 0
) {
    const moveX = movementDelta.x;
    const moveZ = movementDelta.z;
    const distance = Math.hypot(moveX, moveZ);
    const maxStepDistance = Math.max(
        0.01,
        VEHICLE_COLLISION_RADIUS * HORIZONTAL_COLLISION_STEP_FACTOR
    );
    const stepCount = THREE.MathUtils.clamp(
        Math.ceil(distance / maxStepDistance),
        1,
        MAX_HORIZONTAL_COLLISION_SUBSTEPS
    );
    const stepScale = 1 / stepCount;

    for (let step = 0; step < stepCount; step += 1) {
        position.x += moveX * stepScale;
        position.z += moveZ * stepScale;
        constrainToWorld(position, worldBounds);
        constrainToObstacles(position, staticObstacles, impactSpeed);
        constrainToVehicles(position, dynamicVehicles);
    }
}

function constrainToObstacles(position, staticObstacles, impactSpeed = 0) {
    if (!staticObstacles || staticObstacles.length === 0) {
        return;
    }

    let collided = false;
    let collidedWithBuilding = false;
    let collidedWithLampPost = false;
    let collidedWithTree = false;
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

                if (obstacle.category === 'lamp_post') {
                    collidedWithLampPost = true;
                } else if (obstacle.category === 'tree') {
                    collidedWithTree = true;
                }
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

            if (obstacle.category === 'building') {
                collidedWithBuilding = true;
            }
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

    vehicleState.velocity.multiplyScalar(TUNING.obstacleImpactSpeedDamping);
    vehicleState.yawRate *= 0.58;

    const maxForwardSpeed = getEffectiveForwardSpeedLimit(1);
    vehicleState.speed = THREE.MathUtils.clamp(
        vehicleState.velocity.dot(forward),
        -TUNING.maxReverseSpeed,
        maxForwardSpeed
    );

    if (Math.abs(vehicleState.speed) < 0.1) {
        vehicleState.speed = 0;
    }

    if (impactSpeed >= TUNING.crashSpeedThreshold) {
        const obstacleCategory = collidedWithBuilding
            ? 'building'
            : collidedWithLampPost
              ? 'lamp_post'
              : collidedWithTree
                ? 'tree'
                : 'generic';
        if (!pendingCrashCollision || impactSpeed > pendingCrashCollision.impactSpeed) {
            pendingCrashCollision = {
                obstacleCategory,
                impactSpeed,
                position: position.clone(),
                impactNormal: new THREE.Vector3(collisionNormal.x, 0, collisionNormal.y),
            };
        }
    }
}

function constrainToVehicles(position, dynamicVehicles = null) {
    if (!dynamicVehicles || dynamicVehicles.length === 0) {
        return;
    }

    let collisionCount = 0;
    const forwardX = -Math.sin(physicsRotationY);
    const forwardZ = -Math.cos(physicsRotationY);
    const closestPoints = { ax: 0, az: 0, bx: 0, bz: 0 };

    for (let i = 0; i < dynamicVehicles.length; i += 1) {
        const vehicle = dynamicVehicles[i];
        if (!vehicle) {
            continue;
        }
        const vehicleX = Number(vehicle.x);
        const vehicleZ = Number(vehicle.z);
        if (!Number.isFinite(vehicleX) || !Number.isFinite(vehicleZ)) {
            continue;
        }

        const useCapsule =
            Number.isFinite(vehicle.halfWidth) &&
            Number.isFinite(vehicle.halfLength) &&
            Math.abs(vehicle.halfWidth) > 0.001 &&
            Math.abs(vehicle.halfLength) > 0.001;
        let normalX = 0;
        let normalZ = 0;
        let penetration = 0;
        let selfContactRadius = VEHICLE_COLLISION_RADIUS;

        if (useCapsule) {
            const otherHeading = resolveDynamicVehicleHeading(vehicle);
            const selfCapsule = buildCapsule2D(
                position.x,
                position.z,
                physicsRotationY,
                VEHICLE_COLLISION_HALF_WIDTH,
                VEHICLE_COLLISION_HALF_LENGTH
            );
            const otherCapsule = buildCapsule2D(
                vehicleX,
                vehicleZ,
                otherHeading,
                vehicle.halfWidth,
                vehicle.halfLength
            );
            selfContactRadius = selfCapsule.radius;
            const distanceSq = segmentSegmentDistanceSq2D(
                selfCapsule.ax,
                selfCapsule.az,
                selfCapsule.bx,
                selfCapsule.bz,
                otherCapsule.ax,
                otherCapsule.az,
                otherCapsule.bx,
                otherCapsule.bz,
                closestPoints
            );
            const combinedRadius = selfCapsule.radius + otherCapsule.radius;
            if (distanceSq >= combinedRadius * combinedRadius) {
                continue;
            }

            const distance = Math.sqrt(Math.max(0, distanceSq));
            if (distance < 0.0001) {
                const centerDx = position.x - vehicleX;
                const centerDz = position.z - vehicleZ;
                const centerLen = Math.hypot(centerDx, centerDz);
                if (centerLen < 0.0001) {
                    normalX = forwardX;
                    normalZ = forwardZ;
                } else {
                    normalX = centerDx / centerLen;
                    normalZ = centerDz / centerLen;
                }
                penetration = combinedRadius;
            } else {
                normalX = (closestPoints.ax - closestPoints.bx) / distance;
                normalZ = (closestPoints.az - closestPoints.bz) / distance;
                penetration = combinedRadius - distance;
            }
        } else {
            const otherRadius = Math.max(
                0.5,
                vehicle.collisionRadius || vehicle.radius || VEHICLE_COLLISION_RADIUS
            );
            const nx = position.x - vehicleX;
            const nz = position.z - vehicleZ;
            const combinedRadius = otherRadius + VEHICLE_COLLISION_RADIUS;
            const distanceSq = nx * nx + nz * nz;
            if (distanceSq >= combinedRadius * combinedRadius) {
                continue;
            }

            const distance = Math.sqrt(distanceSq);
            if (distance < 0.0001) {
                normalX = forwardX;
                normalZ = forwardZ;
                penetration = combinedRadius;
            } else {
                normalX = nx / distance;
                normalZ = nz / distance;
                penetration = combinedRadius - distance;
            }
        }

        collisionCount += 1;
        const otherMass = Math.max(0.4, vehicle.mass || VEHICLE_COLLISION_MASS);
        const penetrationCorrection =
            penetration * VEHICLE_COLLISION_PENETRATION_SHARE * (0.7 + otherMass * 0.22);
        position.x += normalX * penetrationCorrection;
        position.z += normalZ * penetrationCorrection;

        const otherVelocityX = vehicle.velocityX || 0;
        const otherVelocityZ = vehicle.velocityZ || 0;
        const relativeAlongNormal =
            (vehicleState.velocity.x - otherVelocityX) * normalX +
            (vehicleState.velocity.y - otherVelocityZ) * normalZ;
        const impactSpeed = Math.max(0, -relativeAlongNormal);
        if (impactSpeed < 0.05) {
            continue;
        }

        const normalResponse = impactSpeed * TUNING.vehicleImpactResponse;
        vehicleState.velocity.x += normalX * normalResponse;
        vehicleState.velocity.y += normalZ * normalResponse;

        const sideFactor = forwardX * normalZ - forwardZ * normalX;
        const yawKick = THREE.MathUtils.clamp(impactSpeed / 20, 0, 1);
        vehicleState.yawRate += sideFactor * yawKick * (1.4 + otherMass * 0.2);

        const contactPosition = new THREE.Vector3(
            position.x - normalX * selfContactRadius * 0.35,
            position.y,
            position.z - normalZ * selfContactRadius * 0.35
        );
        const contact = {
            vehicleId:
                typeof vehicle.id === 'string' && vehicle.id.trim()
                    ? vehicle.id
                    : `vehicle-${i + 1}`,
            sourceType:
                vehicle.sourceType === 'bot'
                    ? 'bot'
                    : vehicle.sourceType === 'player'
                      ? 'player'
                      : 'vehicle',
            normalX,
            normalZ,
            penetration,
            impactSpeed,
            position: contactPosition,
        };
        if (typeof vehicle.botId === 'string' && vehicle.botId.trim()) {
            contact.botId = vehicle.botId;
        } else if (contact.sourceType === 'bot') {
            contact.botId = contact.vehicleId;
        }
        if (typeof vehicle.playerId === 'string' && vehicle.playerId.trim()) {
            contact.playerId = vehicle.playerId;
        } else if (contact.sourceType === 'player') {
            contact.playerId = contact.vehicleId;
        }
        pendingVehicleCollisionContacts.push(contact);
    }

    if (collisionCount > 0) {
        const damping = Math.pow(TUNING.vehicleImpactSpeedDamping, collisionCount);
        vehicleState.velocity.multiplyScalar(damping);
        vehicleState.yawRate *= Math.pow(TUNING.vehicleImpactYawDamping, collisionCount);
        vehicleState.speed = vehicleState.velocity.dot(forward);
    }
}

function resolveDynamicVehicleHeading(vehicle = null) {
    if (!vehicle) {
        return physicsRotationY;
    }

    if (Number.isFinite(vehicle.heading)) {
        return normalizeSignedAngle(vehicle.heading);
    }
    if (Number.isFinite(vehicle.rotationY)) {
        return normalizeSignedAngle(vehicle.rotationY);
    }

    const velocityX = Number(vehicle.velocityX);
    const velocityZ = Number(vehicle.velocityZ);
    if (Number.isFinite(velocityX) && Number.isFinite(velocityZ)) {
        const speedSq = velocityX * velocityX + velocityZ * velocityZ;
        if (speedSq > 0.05 * 0.05) {
            return Math.atan2(-velocityX, -velocityZ);
        }
    }

    return physicsRotationY;
}

function normalizeSignedAngle(angle) {
    const numeric = Number(angle);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    const fullTurn = Math.PI * 2;
    return ((((numeric + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
}

function buildCapsule2D(x, z, heading, halfWidth, halfLength) {
    const radius = THREE.MathUtils.clamp(
        Math.abs(Number(halfWidth) || VEHICLE_COLLISION_HALF_WIDTH),
        0.25,
        4
    );
    const resolvedHalfLength = THREE.MathUtils.clamp(
        Math.max(radius, Math.abs(Number(halfLength) || VEHICLE_COLLISION_HALF_LENGTH)),
        radius,
        8
    );
    const spineHalfLength = Math.max(0, resolvedHalfLength - radius);
    const forwardX = -Math.sin(heading);
    const forwardZ = -Math.cos(heading);

    return {
        ax: x - forwardX * spineHalfLength,
        az: z - forwardZ * spineHalfLength,
        bx: x + forwardX * spineHalfLength,
        bz: z + forwardZ * spineHalfLength,
        radius,
    };
}

function segmentSegmentDistanceSq2D(ax, az, bx, bz, cx, cz, dx, dz, outClosestPoints = null) {
    const EPSILON = 1e-8;

    const ux = bx - ax;
    const uz = bz - az;
    const vx = dx - cx;
    const vz = dz - cz;
    const wx = ax - cx;
    const wz = az - cz;

    const a = ux * ux + uz * uz;
    const b = ux * vx + uz * vz;
    const c = vx * vx + vz * vz;
    const d = ux * wx + uz * wz;
    const e = vx * wx + vz * wz;
    const denominator = a * c - b * b;

    let sN;
    let sD = denominator;
    let tN;
    let tD = denominator;

    if (a <= EPSILON && c <= EPSILON) {
        sN = 0;
        sD = 1;
        tN = 0;
        tD = 1;
    } else if (a <= EPSILON) {
        sN = 0;
        sD = 1;
        tN = e;
        tD = c;
    } else if (c <= EPSILON) {
        tN = 0;
        tD = 1;
        sN = -d;
        sD = a;
    } else {
        sN = b * e - c * d;
        tN = a * e - b * d;
        if (denominator < EPSILON) {
            sN = 0;
            sD = 1;
            tN = e;
            tD = c;
        } else {
            if (sN < 0) {
                sN = 0;
                tN = e;
                tD = c;
            } else if (sN > sD) {
                sN = sD;
                tN = e + b;
                tD = c;
            }
        }
    }

    if (tN < 0) {
        tN = 0;
        if (-d < 0) {
            sN = 0;
            sD = 1;
        } else if (-d > a) {
            sN = sD;
        } else {
            sN = -d;
            sD = a;
        }
    } else if (tN > tD) {
        tN = tD;
        if (-d + b < 0) {
            sN = 0;
            sD = 1;
        } else if (-d + b > a) {
            sN = sD;
        } else {
            sN = -d + b;
            sD = a;
        }
    }

    const sc = Math.abs(sN) <= EPSILON || Math.abs(sD) <= EPSILON ? 0 : sN / sD;
    const tc = Math.abs(tN) <= EPSILON || Math.abs(tD) <= EPSILON ? 0 : tN / tD;

    const closestAx = ax + sc * ux;
    const closestAz = az + sc * uz;
    const closestBx = cx + tc * vx;
    const closestBz = cz + tc * vz;

    if (outClosestPoints) {
        outClosestPoints.ax = closestAx;
        outClosestPoints.az = closestAz;
        outClosestPoints.bx = closestBx;
        outClosestPoints.bz = closestBz;
    }

    const deltaX = closestAx - closestBx;
    const deltaZ = closestAz - closestBz;
    return deltaX * deltaX + deltaZ * deltaZ;
}

export function applyInterpolatedPlayerTransform(player, alpha) {
    if (!isPhysicsInitialized) {
        return;
    }

    const blend = THREE.MathUtils.clamp(alpha, 0, 1);
    interpolatedPosition.lerpVectors(previousPhysicsPosition, physicsPosition, blend);
    player.position.copy(interpolatedPosition);
    player.rotation.x = THREE.MathUtils.lerp(previousPhysicsPitch, physicsPitch, blend);
    player.rotation.y = lerpAngle(previousPhysicsRotationY, physicsRotationY, blend);
    player.rotation.z = THREE.MathUtils.lerp(previousPhysicsRoll, physicsRoll, blend);
}

function constrainToWorld(position, worldBounds) {
    if (!worldBounds) {
        return;
    }

    let hitX = false;
    let hitZ = false;
    const preImpactSpeed = vehicleState.velocity.length();
    let worldNormalX = 0;
    let worldNormalZ = 0;

    if (position.x < worldBounds.minX) {
        position.x = worldBounds.minX;
        hitX = true;
        worldNormalX = 1;
    } else if (position.x > worldBounds.maxX) {
        position.x = worldBounds.maxX;
        hitX = true;
        worldNormalX = -1;
    }

    if (position.z < worldBounds.minZ) {
        position.z = worldBounds.minZ;
        hitZ = true;
        worldNormalZ = 1;
    } else if (position.z > worldBounds.maxZ) {
        position.z = worldBounds.maxZ;
        hitZ = true;
        worldNormalZ = -1;
    }

    if (!hitX && !hitZ) {
        return;
    }

    if (hitX) {
        vehicleState.velocity.x *= -0.08;
    }
    if (hitZ) {
        vehicleState.velocity.y *= -0.08;
    }

    vehicleState.velocity.multiplyScalar(TUNING.worldImpactSpeedDamping);
    vehicleState.yawRate *= 0.62;
    vehicleState.speed = vehicleState.velocity.dot(forward);

    if (Math.abs(vehicleState.speed) < 0.2) {
        vehicleState.speed = 0;
    }

    if (preImpactSpeed < TUNING.crashSpeedThreshold) {
        return;
    }

    if (worldNormalX === 0 && worldNormalZ === 0) {
        return;
    }

    const normalLength = Math.hypot(worldNormalX, worldNormalZ);
    const normalX = worldNormalX / normalLength;
    const normalZ = worldNormalZ / normalLength;
    if (!pendingCrashCollision || preImpactSpeed > pendingCrashCollision.impactSpeed) {
        pendingCrashCollision = {
            obstacleCategory: 'building',
            impactSpeed: preImpactSpeed,
            position: position.clone(),
            impactNormal: new THREE.Vector3(normalX, 0, normalZ),
        };
    }
}

function updateDriverInputs(dt) {
    const steerDirection = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    const speedAbs = vehicleState.velocity.length();
    const lowSpeedSteerWeight = 1 -
        THREE.MathUtils.clamp(speedAbs / TUNING.lowSpeedSteerWeightFadeSpeed, 0, 1);
    const lowSpeedInputScale = THREE.MathUtils.lerp(
        1,
        TUNING.lowSpeedSteerInputScale,
        lowSpeedSteerWeight
    );
    const lowSpeedResponseScale = THREE.MathUtils.lerp(
        1,
        TUNING.lowSpeedSteerResponseScale,
        lowSpeedSteerWeight
    );
    const highSpeedSteerResistance = THREE.MathUtils.clamp(
        (speedAbs - TUNING.steerResistanceStartSpeed) /
            (TUNING.steerResistanceFullSpeed - TUNING.steerResistanceStartSpeed),
        0,
        1
    );

    const steerTarget =
        steerDirection *
        lowSpeedInputScale *
        THREE.MathUtils.lerp(1, TUNING.highSpeedSteerInputScale, highSpeedSteerResistance);

    if (steerTarget === 0) {
        vehicleState.steerPressTimer = 0;
        vehicleState.steerReleaseTimer = Math.min(vehicleState.steerReleaseTimer + dt, 0.4);
    } else {
        const changedDirection = Math.sign(steerTarget) !== Math.sign(vehicleState.steerInput);
        vehicleState.steerPressTimer = changedDirection
            ? 0
            : Math.min(vehicleState.steerPressTimer + dt, 0.3);
        vehicleState.steerReleaseTimer = 0;
    }

    const steerRate =
        steerTarget === 0
            ? TUNING.steerReturn
            : TUNING.steerResponse *
              lowSpeedResponseScale *
              THREE.MathUtils.lerp(1, TUNING.highSpeedSteerResponseScale, highSpeedSteerResistance);
    const directionSnapBoost =
        Math.sign(steerTarget) !== Math.sign(vehicleState.steerInput) ? 1.35 : 1;
    vehicleState.steerInput = moveToward(
        vehicleState.steerInput,
        steerTarget,
        steerRate * directionSnapBoost * dt
    );

    let targetThrottle = 0;
    let targetBrake = 0;

    if (keys.backward && !keys.handbrake) {
        if (vehicleState.speed > 0.25 || keys.forward) {
            targetBrake = 1;
        } else {
            targetThrottle = -1;
        }
    } else if (keys.forward) {
        if (vehicleState.speed < -0.45) {
            targetBrake = 1;
        } else {
            targetThrottle = 1;
        }
    }
    if (keys.handbrake) {
        targetBrake = 1;
    }

    const lowSpeedThrottleWeight =
        1 - THREE.MathUtils.clamp(speedAbs / TUNING.lowSpeedThrottleRiseFadeSpeed, 0, 1);
    const forwardThrottleRiseScale = THREE.MathUtils.lerp(
        1,
        TUNING.lowSpeedThrottleRiseScale,
        lowSpeedThrottleWeight
    );
    const throttleRate =
        targetThrottle === 0
            ? TUNING.throttleFall
            : targetThrottle > 0
              ? TUNING.throttleRise * forwardThrottleRiseScale
              : TUNING.throttleRise;
    const brakeRate =
        targetBrake === 0
            ? TUNING.brakeFall
            : keys.handbrake
              ? TUNING.handbrakeBrakeRise
              : TUNING.brakeRise;
    vehicleState.throttle = moveToward(vehicleState.throttle, targetThrottle, throttleRate * dt);
    vehicleState.brake = moveToward(vehicleState.brake, targetBrake, brakeRate * dt);

    if (vehicleState.throttle > 0.15 && vehicleState.brake < 0.1) {
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
    const holdRatio = THREE.MathUtils.clamp(
        vehicleState.throttleHoldTime / TUNING.holdRampTime,
        0,
        1
    );
    vehicleState.powerBoost = 1 + holdRatio * TUNING.holdBoost;
    updateAutomaticTransmission(dt);
}

function calculateLongitudinalForce(longitudinalSpeed, damageDynamics) {
    let force = 0;
    const isCoasting = Math.abs(vehicleState.throttle) < 0.02 && vehicleState.brake < 0.02;
    const maxForwardSpeed = getEffectiveForwardSpeedLimit(damageDynamics.maxSpeedScale);
    const maxReverseSpeed = TUNING.maxReverseSpeed * damageDynamics.maxReverseScale;
    const powerScale = damageDynamics.powerScale;

    if (vehicleState.throttle > 0) {
        const forwardDriveScale = getAutomaticForwardDriveScale();
        const throttleForward = THREE.MathUtils.clamp(vehicleState.throttle, 0, 1);
        const lowSpeedLaunchWeight =
            1 - THREE.MathUtils.clamp(Math.abs(longitudinalSpeed) / TUNING.lowSpeedLaunchFadeSpeed, 0, 1);
        const easedThrottleForward = Math.pow(
            throttleForward,
            TUNING.lowSpeedLaunchThrottleCurve
        );
        const effectiveThrottleForward = THREE.MathUtils.lerp(
            throttleForward,
            easedThrottleForward,
            lowSpeedLaunchWeight
        );
        const speedNorm = THREE.MathUtils.clamp(longitudinalSpeed / maxForwardSpeed, 0, 1);
        const thrustCurve = 1 - Math.pow(speedNorm, 1.35);
        const launchBoostScale = THREE.MathUtils.lerp(
            1,
            TUNING.lowSpeedLaunchBoostScale,
            lowSpeedLaunchWeight
        );
        const launchBoost =
            Math.exp(-Math.abs(longitudinalSpeed) / 6.2) * TUNING.launchBoost * launchBoostScale;
        force +=
            (TUNING.engineAcceleration * (0.42 + thrustCurve * 0.58) + launchBoost) *
            effectiveThrottleForward *
            vehicleState.powerBoost *
            powerScale *
            forwardDriveScale;
    } else if (vehicleState.throttle < 0) {
        const reverseNorm = THREE.MathUtils.clamp(-longitudinalSpeed / maxReverseSpeed, 0, 1);
        const reverseCurve = 1 - Math.pow(reverseNorm, 1.15);
        force -=
            TUNING.reverseAcceleration *
            (0.35 + reverseCurve * 0.65) *
            Math.abs(vehicleState.throttle) *
            vehicleState.powerBoost *
            powerScale;
    }

    if (vehicleState.brake > 0 && Math.abs(longitudinalSpeed) > 0.01) {
        const speedAbs = Math.abs(longitudinalSpeed);
        const maxDirectionalSpeed = longitudinalSpeed >= 0 ? maxForwardSpeed : maxReverseSpeed;
        const speedNorm = THREE.MathUtils.clamp(speedAbs / Math.max(1, maxDirectionalSpeed), 0, 1);
        const brakeSpeedFactor = THREE.MathUtils.lerp(
            TUNING.brakeLowSpeedEffectiveness,
            TUNING.brakeHighSpeedEffectiveness,
            Math.pow(speedNorm, TUNING.brakeEffectivenessCurve)
        );
        force -=
            Math.sign(longitudinalSpeed) *
            TUNING.brakeDeceleration *
            vehicleState.brake *
            brakeSpeedFactor;
    } else if (isCoasting && Math.abs(longitudinalSpeed) > 0.02) {
        force -= Math.sign(longitudinalSpeed) * TUNING.coastBrake;
    }

    const aerodynamicDrag = isCoasting
        ? TUNING.aerodynamicDrag * TUNING.coastAerodynamicScale
        : TUNING.aerodynamicDrag;
    const rollingResistance = isCoasting ? TUNING.coastRollingResistance : TUNING.rollingResistance;
    force -= longitudinalSpeed * Math.abs(longitudinalSpeed) * aerodynamicDrag;
    force -= longitudinalSpeed * rollingResistance;
    return force;
}

function calculateTireForces(
    longitudinalSpeed,
    lateralSpeed,
    yawRate,
    steerAngle,
    speedRatio,
    burnoutFactor = 0,
    brakeSlideFactor = 0,
    damageDynamics
) {
    const driveDirection = Math.sign(longitudinalSpeed) || (vehicleState.throttle < 0 ? -1 : 1);
    const steerForceScale = THREE.MathUtils.clamp(
        (Math.abs(longitudinalSpeed) + Math.abs(lateralSpeed)) / TUNING.steerForceBuildSpeed,
        0,
        1
    );
    const forwardForSlip = Math.max(Math.abs(longitudinalSpeed), TUNING.slipSpeedFloor);
    const frontSlip =
        Math.atan2(lateralSpeed + TUNING.frontAxleDistance * yawRate, forwardForSlip) -
        steerAngle * driveDirection * steerForceScale;
    const rearSlip = Math.atan2(lateralSpeed - TUNING.rearAxleDistance * yawRate, forwardForSlip);

    const rearGripLoss =
        Math.abs(vehicleState.throttle) * TUNING.throttleRearGripLoss +
        vehicleState.brake * TUNING.brakeRearGripLoss +
        brakeSlideFactor * TUNING.brakeSlideRearGripLoss +
        (keys.handbrake ? TUNING.handbrakeRearGripLoss : 0);
    const gripScale = THREE.MathUtils.lerp(TUNING.lowSpeedGripScale, 1, speedRatio);
    const frontGrip =
        TUNING.frontGripBase *
        gripScale *
        damageDynamics.gripScale *
        (1 +
            burnoutFactor * TUNING.burnoutFrontGripBoost +
            brakeSlideFactor * TUNING.brakeSlideFrontGripBoost);
    const rearGripLossCap = THREE.MathUtils.lerp(0.86, 0.94, brakeSlideFactor);
    const rearGrip =
        TUNING.rearGripBase *
        gripScale *
        (1 -
            THREE.MathUtils.clamp(
                rearGripLoss + burnoutFactor * TUNING.burnoutRearGripLoss,
                0,
                rearGripLossCap
            )) *
        damageDynamics.gripScale;

    const frontForce = THREE.MathUtils.clamp(
        -TUNING.cornerStiffnessFront * frontSlip,
        -frontGrip,
        frontGrip
    );
    const rearForce = THREE.MathUtils.clamp(
        -TUNING.cornerStiffnessRear * rearSlip,
        -rearGrip,
        rearGrip
    );

    const steerCos = Math.cos(steerAngle);
    const lateralForce = frontForce * steerCos + rearForce;
    const yawMoment =
        TUNING.frontAxleDistance * frontForce * steerCos - TUNING.rearAxleDistance * rearForce;

    return { lateral: lateralForce, yaw: yawMoment };
}

function updateLaunchTractionState(dt, burnoutFactor = 0) {
    const speedAbs = Math.abs(vehicleState.speed);
    const forwardThrottle = THREE.MathUtils.clamp(vehicleState.throttle, 0, 1);
    const lowSpeedFactor = THREE.MathUtils.clamp(1 - speedAbs / TUNING.launchSlipFadeSpeed, 0, 1);
    const accelFactor = THREE.MathUtils.clamp(
        vehicleState.acceleration / TUNING.launchAccelNorm,
        0,
        1
    );
    let launchTarget = forwardThrottle * lowSpeedFactor * accelFactor;
    if (burnoutFactor > 0) {
        launchTarget = Math.max(launchTarget, TUNING.burnoutSlipTarget * burnoutFactor);
    }
    const riseRate = Math.max(
        TUNING.launchSlipRise * (0.62 + forwardThrottle * 0.38),
        TUNING.burnoutSlipRise * burnoutFactor
    );
    const responseRate = launchTarget > vehicleState.launchSlip ? riseRate : TUNING.launchSlipFall;
    vehicleState.launchSlip = moveToward(vehicleState.launchSlip, launchTarget, responseRate * dt);

    const launchPress = forwardThrottle > 0.24 && vehicleState.previousForwardThrottle <= 0.24;
    if (launchPress && lowSpeedFactor > 0.2) {
        vehicleState.launchPhase = Math.random() * Math.PI * 2;
    }
    vehicleState.previousForwardThrottle = forwardThrottle;

    if (vehicleState.launchSlip < 0.002) {
        vehicleState.launchWobble = 0;
        return;
    }

    const phaseSpeed = THREE.MathUtils.lerp(
        TUNING.launchWobbleSpeedLow,
        TUNING.launchWobbleSpeedHigh,
        vehicleState.launchSlip
    );
    vehicleState.launchPhase += dt * phaseSpeed;
    const wobbleEnvelope =
        vehicleState.launchSlip * lowSpeedFactor * THREE.MathUtils.clamp(speedAbs / 1.25, 0.35, 1);
    vehicleState.launchWobble = Math.sin(vehicleState.launchPhase) * wobbleEnvelope;
}

function getDamageDynamics() {
    const wheelLoss = vehicleDamageState.wheelLossCount;
    const suspensionLoss = vehicleDamageState.suspensionLoss;
    const sideImbalance = vehicleDamageState.rightLoss - vehicleDamageState.leftLoss;
    const axleImbalance = vehicleDamageState.frontLoss - vehicleDamageState.rearLoss;

    return {
        powerScale: THREE.MathUtils.clamp(1 - wheelLoss * 0.16 - suspensionLoss * 0.08, 0.34, 1),
        gripScale: THREE.MathUtils.clamp(1 - wheelLoss * 0.2 - suspensionLoss * 0.08, 0.28, 1),
        maxSpeedScale: THREE.MathUtils.clamp(1 - wheelLoss * 0.13 - suspensionLoss * 0.06, 0.42, 1),
        maxReverseScale: THREE.MathUtils.clamp(
            1 - wheelLoss * 0.11 - suspensionLoss * 0.05,
            0.45,
            1
        ),
        yawBiasTorque: THREE.MathUtils.clamp(
            sideImbalance * 0.95 + axleImbalance * 0.22,
            -2.8,
            2.8
        ),
        dragPenalty: wheelLoss * 0.32 + suspensionLoss * 0.14,
    };
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

function applyTerrainSupport(sampleGroundHeight, dt) {
    const previousY = physicsPosition.y;
    const forwardX = -Math.sin(physicsRotationY);
    const forwardZ = -Math.cos(physicsRotationY);
    const rightX = Math.cos(physicsRotationY);
    const rightZ = -Math.sin(physicsRotationY);

    const frontOffset = TUNING.frontAxleDistance;
    const rearOffset = TUNING.rearAxleDistance;
    const trackOffset = TERRAIN_TRACK_HALF_WIDTH;

    const fallbackGroundHeight = previousY - VEHICLE_RIDE_HEIGHT;

    const frontLeftHeight = finiteNumberOr(
        sampleGroundHeight(
            physicsPosition.x + forwardX * frontOffset + rightX * trackOffset,
            physicsPosition.z + forwardZ * frontOffset + rightZ * trackOffset
        ),
        fallbackGroundHeight
    );
    const frontRightHeight = finiteNumberOr(
        sampleGroundHeight(
            physicsPosition.x + forwardX * frontOffset - rightX * trackOffset,
            physicsPosition.z + forwardZ * frontOffset - rightZ * trackOffset
        ),
        fallbackGroundHeight
    );
    const rearLeftHeight = finiteNumberOr(
        sampleGroundHeight(
            physicsPosition.x - forwardX * rearOffset + rightX * trackOffset,
            physicsPosition.z - forwardZ * rearOffset + rightZ * trackOffset
        ),
        fallbackGroundHeight
    );
    const rearRightHeight = finiteNumberOr(
        sampleGroundHeight(
            physicsPosition.x - forwardX * rearOffset - rightX * trackOffset,
            physicsPosition.z - forwardZ * rearOffset - rightZ * trackOffset
        ),
        fallbackGroundHeight
    );

    const frontAverage = (frontLeftHeight + frontRightHeight) * 0.5;
    const rearAverage = (rearLeftHeight + rearRightHeight) * 0.5;
    const leftAverage = (frontLeftHeight + rearLeftHeight) * 0.5;
    const rightAverage = (frontRightHeight + rearRightHeight) * 0.5;

    const wheelBase = Math.max(0.01, TUNING.frontAxleDistance + TUNING.rearAxleDistance);
    const trackWidth = Math.max(0.01, TERRAIN_TRACK_HALF_WIDTH * 2);

    const targetPitch = THREE.MathUtils.clamp(
        Math.atan2(frontAverage - rearAverage, wheelBase),
        -TERRAIN_MAX_PITCH,
        TERRAIN_MAX_PITCH
    );
    const targetRoll = THREE.MathUtils.clamp(
        Math.atan2(leftAverage - rightAverage, trackWidth),
        -TERRAIN_MAX_ROLL,
        TERRAIN_MAX_ROLL
    );

    const tiltBlend = 1 - Math.exp(-TERRAIN_TILT_RESPONSE * dt);
    physicsPitch = THREE.MathUtils.lerp(physicsPitch, targetPitch, tiltBlend);
    physicsRoll = THREE.MathUtils.lerp(physicsRoll, targetRoll, tiltBlend);

    const centerHeight = finiteNumberOr(
        sampleGroundHeight(physicsPosition.x, physicsPosition.z),
        (frontAverage + rearAverage) * 0.5
    );
    const averageHeight = (frontAverage + rearAverage) * 0.5;
    const maxWheelHeight = Math.max(
        frontLeftHeight,
        frontRightHeight,
        rearLeftHeight,
        rearRightHeight
    );
    const supportedGroundHeight = Math.max(centerHeight, averageHeight);
    if (!terrainSupportFilterInitialized) {
        smoothedSupportedGroundHeight = supportedGroundHeight;
        smoothedCenterGroundHeight = centerHeight;
        terrainSupportFilterInitialized = true;
    }
    const supportBlend = 1 - Math.exp(-TERRAIN_SUPPORT_HEIGHT_RESPONSE * dt);
    smoothedSupportedGroundHeight = THREE.MathUtils.lerp(
        smoothedSupportedGroundHeight,
        supportedGroundHeight,
        supportBlend
    );
    smoothedCenterGroundHeight = THREE.MathUtils.lerp(
        smoothedCenterGroundHeight,
        centerHeight,
        supportBlend
    );
    const targetRideHeight = smoothedSupportedGroundHeight + VEHICLE_RIDE_HEIGHT;
    const minRideOffset = Math.max(
        0.01 + TERRAIN_WHEEL_CLEARANCE,
        VEHICLE_RIDE_HEIGHT - TERRAIN_MAX_COMPRESSION + TERRAIN_WHEEL_CLEARANCE
    );
    const compressionFloor = maxWheelHeight + minRideOffset;

    const springDamping =
        physicsVerticalVelocity < 0
            ? TERRAIN_SUSPENSION_COMPRESSION_DAMPING
            : TERRAIN_SUSPENSION_REBOUND_DAMPING;
    const springAcceleration =
        (targetRideHeight - physicsPosition.y) * TERRAIN_SUSPENSION_STIFFNESS;
    const dampingAcceleration = -physicsVerticalVelocity * springDamping;
    physicsVerticalVelocity += (springAcceleration + dampingAcceleration - TERRAIN_GRAVITY) * dt;
    physicsPosition.y += physicsVerticalVelocity * dt;

    if (!Number.isFinite(physicsPosition.y) || !Number.isFinite(physicsVerticalVelocity)) {
        physicsPosition.y = targetRideHeight;
        physicsVerticalVelocity = 0;
    }

    if (physicsPosition.y < compressionFloor) {
        if (physicsVerticalVelocity < -TERRAIN_LANDING_IMPACT_SPEED) {
            physicsVerticalVelocity = -physicsVerticalVelocity * TERRAIN_LANDING_BOUNCE;
        } else if (physicsVerticalVelocity < 0) {
            physicsVerticalVelocity = 0;
        }
        physicsPosition.y = compressionFloor;
    }

    const centerHardFloor =
        Math.max(centerHeight, smoothedCenterGroundHeight) +
        minRideOffset +
        TERRAIN_HARD_FLOOR_MARGIN;
    if (physicsPosition.y < centerHardFloor) {
        physicsPosition.y = centerHardFloor;
        if (physicsVerticalVelocity < 0) {
            physicsVerticalVelocity = 0;
        }
    }

    const maxRideHeight = targetRideHeight + TERRAIN_MAX_AIR_CLEARANCE;
    if (physicsPosition.y > maxRideHeight) {
        physicsPosition.y = maxRideHeight;
        if (physicsVerticalVelocity > 0) {
            physicsVerticalVelocity = 0;
        }
    }

    vehicleState.verticalSpeed = (physicsPosition.y - previousY) / Math.max(0.0001, dt);
    const normalizedCompression =
        (targetRideHeight - physicsPosition.y) / Math.max(0.001, TERRAIN_MAX_COMPRESSION);
    vehicleState.terrainCompression = THREE.MathUtils.clamp(normalizedCompression, -1.2, 1.2);
    const groundedFloor = Math.max(compressionFloor, centerHardFloor);
    vehicleState.terrainGrounded = physicsPosition.y <= groundedFloor + 0.006 ? 1 : 0;
}

function getBurnoutFactor(totalSpeed) {
    if (!keys.forward || keys.backward || keys.handbrake) {
        return 0;
    }

    const speedFactor = THREE.MathUtils.clamp(1 - totalSpeed / TUNING.burnoutMaxSpeed, 0, 1);
    if (speedFactor <= 0) {
        return 0;
    }

    const throttleFactor = THREE.MathUtils.clamp(
        (vehicleState.throttle - TUNING.burnoutThrottleMin) / (1 - TUNING.burnoutThrottleMin),
        0,
        1
    );
    const steerFactor = THREE.MathUtils.clamp(
        (Math.abs(vehicleState.steerInput) - TUNING.burnoutSteerMin) / (1 - TUNING.burnoutSteerMin),
        0,
        1
    );

    return speedFactor * throttleFactor * steerFactor;
}

function getBrakeSlideFactor(longitudinalSpeed, lateralSpeed) {
    const speedAbs = Math.hypot(longitudinalSpeed, lateralSpeed);
    const steerFactor = THREE.MathUtils.clamp(
        (Math.abs(vehicleState.steerInput) - TUNING.brakeSlideSteerMin) /
            (1 - TUNING.brakeSlideSteerMin),
        0,
        1
    );
    if (steerFactor <= 0) {
        return 0;
    }

    const speedFactor = THREE.MathUtils.clamp(
        (speedAbs - TUNING.brakeSlideMinSpeed) / TUNING.brakeSlideSpeedRange,
        0,
        1
    );
    const brakeFactor = THREE.MathUtils.clamp(
        (vehicleState.brake - TUNING.brakeSlideBrakeMin) / (1 - TUNING.brakeSlideBrakeMin),
        0,
        1
    );
    const brakeSlideFactor = speedFactor * brakeFactor * steerFactor;
    if (!keys.handbrake) {
        return brakeSlideFactor;
    }

    const handbrakeSpeedFactor = THREE.MathUtils.clamp(
        (speedAbs - TUNING.handbrakeSpeedMin) / TUNING.handbrakeSpeedRange,
        0,
        1
    );
    const handbrakeFactor = handbrakeSpeedFactor * steerFactor;
    return Math.max(brakeSlideFactor, handbrakeFactor);
}

function getEffectiveForwardSpeedLimit(maxSpeedScale = 1) {
    const tuningLimit = TOP_SPEED_LIMIT_TUNING.maxKph / 3.6;
    const playerLimit = clampTopSpeedLimitKph(vehicleState.topSpeedLimitKph) / 3.6;
    const automaticLimit = getAutomaticForwardSpeedLimitMps();
    const cappedForwardLimit = Math.min(tuningLimit, playerLimit, automaticLimit);
    return Math.max(1, cappedForwardLimit * Math.max(0, maxSpeedScale));
}

function updateAutomaticTransmission(dt) {
    if (!AUTOMATIC_TRANSMISSION.enabled) {
        return;
    }

    const gearTopSpeeds = AUTOMATIC_TRANSMISSION.gearTopSpeedsKph;
    const maxGearIndex = gearTopSpeeds.length - 1;
    let gearIndex = THREE.MathUtils.clamp(Math.floor(vehicleState.autoGearIndex || 0), 0, maxGearIndex);
    const speedKph = Math.abs(vehicleState.speed || 0) * 3.6;
    const forwardThrottle = THREE.MathUtils.clamp(vehicleState.throttle || 0, 0, 1);
    const isForwardDriveIntent =
        keys.forward && !keys.backward && !keys.handbrake && forwardThrottle > 0.08;

    while (
        gearIndex > 0 &&
        speedKph < gearTopSpeeds[gearIndex - 1] - AUTOMATIC_TRANSMISSION.downshiftHysteresisKph
    ) {
        gearIndex -= 1;
    }

    if (isForwardDriveIntent && gearIndex < maxGearIndex) {
        const gearTopKph = gearTopSpeeds[gearIndex];
        const shiftWindowStartKph = gearTopKph * AUTOMATIC_TRANSMISSION.upshiftWindowRatio;
        if (speedKph >= shiftWindowStartKph) {
            const shiftDelay = THREE.MathUtils.lerp(
                AUTOMATIC_TRANSMISSION.upshiftBaseDelaySec * 1.25,
                AUTOMATIC_TRANSMISSION.upshiftBaseDelaySec * 0.7,
                forwardThrottle
            );
            vehicleState.autoShiftTimerSec += dt;
            if (vehicleState.autoShiftTimerSec >= shiftDelay) {
                gearIndex = Math.min(maxGearIndex, gearIndex + 1);
                vehicleState.autoShiftTimerSec = 0;
            }
        } else {
            vehicleState.autoShiftTimerSec = Math.max(0, vehicleState.autoShiftTimerSec - dt * 2.5);
        }
    } else {
        vehicleState.autoShiftTimerSec = 0;
    }

    vehicleState.autoGearIndex = gearIndex;
    const targetCapKph = gearTopSpeeds[gearIndex];
    const currentCapKph = Number.isFinite(vehicleState.autoTransmissionSpeedCapKph)
        ? vehicleState.autoTransmissionSpeedCapKph
        : gearTopSpeeds[0];
    const capRate =
        targetCapKph > currentCapKph
            ? AUTOMATIC_TRANSMISSION.capRiseRateKphPerSec
            : AUTOMATIC_TRANSMISSION.capFallRateKphPerSec;
    vehicleState.autoTransmissionSpeedCapKph = moveToward(
        currentCapKph,
        targetCapKph,
        capRate * dt
    );
}

function getAutomaticForwardSpeedLimitMps() {
    if (!AUTOMATIC_TRANSMISSION.enabled) {
        return Number.POSITIVE_INFINITY;
    }
    const maxAutomaticKph =
        AUTOMATIC_TRANSMISSION.gearTopSpeedsKph[AUTOMATIC_TRANSMISSION.gearTopSpeedsKph.length - 1];
    const capKph = Number.isFinite(vehicleState.autoTransmissionSpeedCapKph)
        ? vehicleState.autoTransmissionSpeedCapKph
        : maxAutomaticKph;
    return Math.max(1, THREE.MathUtils.clamp(capKph, 1, maxAutomaticKph) / 3.6);
}

function getAutomaticForwardDriveScale() {
    if (!AUTOMATIC_TRANSMISSION.enabled) {
        return 1;
    }
    const scales = AUTOMATIC_TRANSMISSION.gearForceScales;
    const maxGearIndex = scales.length - 1;
    const gearIndex = THREE.MathUtils.clamp(Math.floor(vehicleState.autoGearIndex || 0), 0, maxGearIndex);
    return scales[gearIndex] ?? 1;
}

function clampTopSpeedLimitKph(speedKph) {
    const fallback = TOP_SPEED_LIMIT_TUNING.maxKph;
    const numeric = Number.isFinite(speedKph) ? speedKph : fallback;
    return THREE.MathUtils.clamp(
        Math.round(numeric),
        TOP_SPEED_LIMIT_TUNING.minKph,
        TOP_SPEED_LIMIT_TUNING.maxKph
    );
}

function getTopSpeedLimitPercent(speedKph) {
    const min = TOP_SPEED_LIMIT_TUNING.minKph;
    const max = TOP_SPEED_LIMIT_TUNING.maxKph;
    if (max <= min) {
        return 100;
    }
    return Math.round(THREE.MathUtils.clamp((speedKph - min) / (max - min), 0, 1) * 100);
}

function createTopSpeedLimitSnapshot() {
    const topSpeedKph = clampTopSpeedLimitKph(vehicleState.topSpeedLimitKph);
    return {
        topSpeedKph,
        topSpeedMps: topSpeedKph / 3.6,
        topSpeedPercent: getTopSpeedLimitPercent(topSpeedKph),
    };
}

function clampDamageCounter(value, max) {
    const numeric = Number.isFinite(value) ? value : 0;
    return THREE.MathUtils.clamp(numeric, 0, max);
}

function finiteNumberOr(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}
