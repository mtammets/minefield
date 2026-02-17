import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { createCarRig } from './car.js';

const DEFAULT_BOT_COUNT = 3;
const BOT_RADIUS = 1.12;
const BOT_VEHICLE_COLLISION_RADIUS = 1.34;
const PLAYER_VEHICLE_COLLISION_RADIUS = 1.34;
const BOT_WHEEL_BASE = 2.6;
const BOT_MAX_STEER = THREE.MathUtils.degToRad(24);
const BOT_STEER_RESPONSE = 3.4;
const BOT_MAX_SPEED = 30;
const BOT_MIN_SPEED = 9;
const BOT_ACCELERATION = 19;
const BOT_BRAKE_DECELERATION = 24;
const BOT_DRAG = 0.1;
const BOT_MASS = 1.25;
const BOT_COLLISION_POSITION_SHARE = 0.66;
const BOT_COLLISION_SPEED_DAMPING = 0.82;
const BOT_DAMAGE_COLLISION_MIN = 8;
const BOT_DAMAGE_COLLISION_HIGH = 21;
const BOT_WHEEL_DETACH_SPEED = 28;
const BOT_SECOND_WHEEL_DETACH_SPEED = 36;
const BOT_DAMAGE_OBSTACLE_CATEGORIES = new Set(['lamp_post']);
const BOT_DENT_MAX = 1.6;
const BOT_TOTAL_BREAK_SCORE = 5.6;
const BOT_TARGET_HEADING_FULL_STEER = THREE.MathUtils.degToRad(44);
const BOT_WANDER_REACH_RADIUS = 16;
const BOT_AVOIDANCE_RADIUS = 8;
const BOT_SPAWN_CLEARANCE = 12;
const OBSTACLE_PASSES = 2;
const BOT_INDICATOR_HEIGHT = 1.52;
const BOT_INDICATOR_BOB_AMPLITUDE = 0.1;
const BOT_INDICATOR_BOB_SPEED = 1.9;
const BOT_INDICATOR_PULSE_SPEED = 4.2;
const BOT_RIDE_HEIGHT = 0.06;
const BOT_DRIFT_MIN_SPEED = 12.5;
const BOT_DRIFT_ENTRY_HEADING = THREE.MathUtils.degToRad(18);
const BOT_DRIFT_EXIT_HEADING = THREE.MathUtils.degToRad(10);
const BOT_DRIFT_CHANCE_PER_SECOND = 0.34;
const BOT_DRIFT_DURATION_MIN = 0.65;
const BOT_DRIFT_DURATION_MAX = 1.35;
const BOT_DRIFT_COOLDOWN_MIN = 2.4;
const BOT_DRIFT_COOLDOWN_MAX = 5.2;
const BOT_DRIFT_STEER_BIAS = 0.42;
const BOT_DRIFT_YAW_BOOST = 1.45;
const BOT_DRIFT_LATERAL_SLIP = 5.2;
const BOT_DRIFT_SPEED_SCALE = 0.8;

const BOT_BODY_COLORS = [0x6cb3ff, 0xff8f7d, 0x9cf89c, 0xe9a3ff, 0xffd86b];
const BOT_NAMES = ['NOVA-1', 'AXIS-2', 'RIFT-3', 'PULSE-4', 'ORBIT-5'];

const forward2 = new THREE.Vector2();
const right2 = new THREE.Vector2();
const targetDir2 = new THREE.Vector2();
const avoidance2 = new THREE.Vector2();
const scratch2 = new THREE.Vector2();

export function createBotTrafficSystem(scene, worldBounds, staticObstacles = [], options = {}) {
    const {
        botCount = DEFAULT_BOT_COUNT,
        sharedTargetColorHex = 0x7cf9ff,
        getGroundHeightAt = null,
        onPartDetached = null,
    } = options;
    const handlePartDetached = typeof onPartDetached === 'function'
        ? onPartDetached
        : null;
    let resolvedSharedTargetColorHex = sharedTargetColorHex;

    const bots = [];
    const botsByCollectorId = new Map();
    for (let i = 0; i < Math.max(0, botCount); i += 1) {
        const bot = createBot(
            scene,
            worldBounds,
            staticObstacles,
            bots,
            i,
            resolvedSharedTargetColorHex,
            getGroundHeightAt,
            handlePartDetached
        );
        bots.push(bot);
        botsByCollectorId.set(bot.collectorId, bot);
    }

    return {
        update(playerPosition, visiblePickups = [], deltaTime = 1 / 60) {
            const dt = Math.min(deltaTime, 0.05);
            for (let i = 0; i < bots.length; i += 1) {
                if (bots[i].destroyed) {
                    continue;
                }
                updateBot(
                    bots[i],
                    bots,
                    playerPosition,
                    visiblePickups,
                    dt,
                    worldBounds,
                    staticObstacles,
                    getGroundHeightAt
                );
            }
        },
        getCollisionSnapshots() {
            return bots
                .filter((bot) => !bot.destroyed)
                .map((bot) => ({
                id: bot.collectorId,
                x: bot.car.position.x,
                z: bot.car.position.z,
                radius: BOT_VEHICLE_COLLISION_RADIUS,
                collisionRadius: BOT_VEHICLE_COLLISION_RADIUS,
                mass: BOT_MASS,
                velocityX: bot.state.velocity.x,
                velocityZ: bot.state.velocity.y,
                }));
        },
        applyCollisionImpulses(contacts = []) {
            if (!contacts || contacts.length === 0) {
                return;
            }
            for (let i = 0; i < contacts.length; i += 1) {
                const contact = contacts[i];
                const bot = botsByCollectorId.get(contact.botId);
                if (!bot || bot.destroyed) {
                    continue;
                }
                applyCollisionImpulseToBot(bot, contact);
            }
        },
        getCollectorDescriptors() {
            return bots
                .filter((bot) => !bot.destroyed)
                .map((bot) => ({
                id: bot.collectorId,
                position: bot.car.position,
                }));
        },
        registerCollected(collectorId) {
            const bot = botsByCollectorId.get(collectorId);
            if (bot && !bot.destroyed) {
                bot.collectedCount += 1;
            }
        },
        setSharedTargetColor(targetColorHex) {
            resolvedSharedTargetColorHex = targetColorHex;
            bots.forEach((bot) => {
                bot.targetColorHex = targetColorHex;
            });
        },
        reset({ sharedTargetColorHex: nextTargetColorHex = resolvedSharedTargetColorHex } = {}) {
            resolvedSharedTargetColorHex = nextTargetColorHex;
            const placedBots = [];
            for (let i = 0; i < bots.length; i += 1) {
                const bot = bots[i];
                resetBot(
                    bot,
                    i,
                    worldBounds,
                    staticObstacles,
                    placedBots,
                    resolvedSharedTargetColorHex,
                    getGroundHeightAt
                );
                placedBots.push(bot);
            }
        },
        getMiniMapMarkers() {
            return bots
                .filter((bot) => !bot.destroyed)
                .map((bot) => ({
                x: bot.car.position.x,
                z: bot.car.position.z,
                rotationY: bot.car.rotation.y,
                colorHex: bot.bodyColor,
                }));
        },
        getHudState() {
            return bots.map((bot) => ({
                name: bot.name,
                collectedCount: bot.collectedCount,
                targetColorHex: bot.targetColorHex,
            }));
        },
    };
}

function resolveBotGroundHeight(x, z, getGroundHeightAt) {
    if (typeof getGroundHeightAt !== 'function') {
        return BOT_RIDE_HEIGHT;
    }
    return getGroundHeightAt(x, z) + BOT_RIDE_HEIGHT;
}

function resetBot(
    bot,
    index,
    worldBounds,
    staticObstacles,
    placedBots,
    sharedTargetColorHex,
    getGroundHeightAt
) {
    const spawnPosition = findSpawnPoint(index, worldBounds, staticObstacles, placedBots);
    bot.car.position.x = spawnPosition.x;
    bot.car.position.z = spawnPosition.z;
    bot.car.position.y = resolveBotGroundHeight(spawnPosition.x, spawnPosition.z, getGroundHeightAt);
    bot.car.rotation.y = spawnPosition.rotationY;
    bot.car.visible = true;

    if (bot.indicator?.root) {
        bot.indicator.root.visible = true;
    }

    bot.destroyed = false;
    bot.state.speed = 0;
    bot.state.acceleration = 0;
    bot.state.steerInput = 0;
    bot.state.steerAngle = 0;
    bot.state.throttle = 0;
    bot.state.brake = 0;
    bot.state.yawRate = 0;
    bot.state.burnout = 0;
    bot.state.velocity.set(0, 0);
    bot.drift.active = false;
    bot.drift.timer = 0;
    bot.drift.direction = 0;
    bot.drift.intensity = 0;
    bot.drift.cooldown = randomRange(BOT_DRIFT_COOLDOWN_MIN * 0.5, BOT_DRIFT_COOLDOWN_MAX * 0.9);
    bot.wanderTarget = pickWanderTarget(worldBounds);
    bot.collectedCount = 0;
    bot.targetColorHex = sharedTargetColorHex;
    bot.lastDamageAtMs = 0;
    bot.detachedPartIds.clear();

    const freshDamageState = createEmptyBotDamageState();
    bot.damageState.wheelLossCount = freshDamageState.wheelLossCount;
    bot.damageState.leftLoss = freshDamageState.leftLoss;
    bot.damageState.rightLoss = freshDamageState.rightLoss;
    bot.damageState.frontLoss = freshDamageState.frontLoss;
    bot.damageState.rearLoss = freshDamageState.rearLoss;
    bot.damageState.suspensionLoss = freshDamageState.suspensionLoss;

    bot.bodyDamageVisual.left = 0;
    bot.bodyDamageVisual.right = 0;
    bot.bodyDamageVisual.front = 0;
    bot.bodyDamageVisual.rear = 0;

    for (let i = 0; i < bot.crashParts.length; i += 1) {
        const part = bot.crashParts[i];
        if (!part?.source) {
            continue;
        }
        part.source.visible = true;
        const base = bot.bodyPartBaselines.get(part.id);
        if (base) {
            part.source.position.copy(base.position);
            part.source.rotation.copy(base.rotation);
            part.source.scale.copy(base.scale);
        }
    }

    bot.updateVisuals(bot.state, 1 / 60);
}

function createBot(
    scene,
    worldBounds,
    staticObstacles,
    existingBots,
    index,
    sharedTargetColorHex,
    getGroundHeightAt,
    onPartDetached
) {
    const name = BOT_NAMES[index] || `BOT-${index + 1}`;
    const bodyColor = BOT_BODY_COLORS[index % BOT_BODY_COLORS.length];
    const collectorId = `bot-${index + 1}`;

    const carRig = createCarRig({
        bodyColor,
        displayName: name,
        addLights: true,
        addWheelWellLights: false,
        lightConfig: {
            enableHeadlightProjectors: false,
            enableTaillightPointLights: false,
            enableAccentPointLights: false,
        },
    });

    const spawnPosition = findSpawnPoint(index, worldBounds, staticObstacles, existingBots);
    carRig.car.position.x = spawnPosition.x;
    carRig.car.position.z = spawnPosition.z;
    carRig.car.position.y = resolveBotGroundHeight(spawnPosition.x, spawnPosition.z, getGroundHeightAt);
    carRig.car.rotation.y = spawnPosition.rotationY;
    scene.add(carRig.car);
    const indicator = createBotIndicator(name, bodyColor);
    carRig.car.add(indicator.root);

    const state = {
        speed: 0,
        acceleration: 0,
        steerInput: 0,
        steerAngle: 0,
        throttle: 0,
        brake: 0,
        yawRate: 0,
        burnout: 0,
        velocity: new THREE.Vector2(0, 0),
    };
    const bot = {
        collectorId,
        name,
        bodyColor,
        car: carRig.car,
        indicator,
        updateVisuals: carRig.updateVisuals,
        crashParts: carRig.getCrashParts ? carRig.getCrashParts() : [],
        detachedPartIds: new Set(),
        damageState: createEmptyBotDamageState(),
        bodyDamageVisual: { left: 0, right: 0, front: 0, rear: 0 },
        bodyPartBaselines: new Map(),
        onPartDetached,
        lastDamageAtMs: 0,
        destroyed: false,
        state,
        drift: {
            active: false,
            timer: 0,
            direction: 0,
            intensity: 0,
            cooldown: randomRange(BOT_DRIFT_COOLDOWN_MIN * 0.5, BOT_DRIFT_COOLDOWN_MAX),
        },
        wanderTarget: pickWanderTarget(worldBounds),
        collectedCount: 0,
        targetColorHex: sharedTargetColorHex,
    };

    initializeBotPartBaselines(bot);
    return bot;
}

function updateBot(
    bot,
    allBots,
    playerPosition,
    visiblePickups,
    dt,
    worldBounds,
    staticObstacles,
    getGroundHeightAt
) {
    const damageDynamics = getBotDamageDynamics(bot.damageState);
    const targetPickup = findNearestPickup(bot.car.position, visiblePickups);

    if (!targetPickup) {
        const wanderDistanceSq = distanceSqXZ(bot.car.position, bot.wanderTarget);
        if (wanderDistanceSq <= BOT_WANDER_REACH_RADIUS * BOT_WANDER_REACH_RADIUS) {
            bot.wanderTarget = pickWanderTarget(worldBounds);
        }
    }

    const targetX = targetPickup ? targetPickup.x : bot.wanderTarget.x;
    const targetZ = targetPickup ? targetPickup.z : bot.wanderTarget.z;

    targetDir2.set(targetX - bot.car.position.x, targetZ - bot.car.position.z);
    if (targetDir2.lengthSq() < 0.001) {
        targetDir2.set(-Math.sin(bot.car.rotation.y), -Math.cos(bot.car.rotation.y));
    }

    avoidance2.set(0, 0);
    addBoundaryAvoidance(avoidance2, bot.car.position, worldBounds);
    addObstacleAvoidance(avoidance2, bot.car.position, staticObstacles);
    addEntityAvoidance(avoidance2, bot.car.position, playerPosition, 10.5, 1.35);

    for (let i = 0; i < allBots.length; i += 1) {
        const other = allBots[i];
        if (other === bot || other.destroyed) {
            continue;
        }
        addEntityAvoidance(avoidance2, bot.car.position, other.car.position, BOT_AVOIDANCE_RADIUS, 1.1);
    }

    targetDir2.addScaledVector(avoidance2, 0.82);
    if (targetDir2.lengthSq() < 0.001) {
        targetDir2.set(-Math.sin(bot.car.rotation.y), -Math.cos(bot.car.rotation.y));
    }
    targetDir2.normalize();

    const desiredYaw = Math.atan2(-targetDir2.x, -targetDir2.y);
    const headingError = shortestAngle(bot.car.rotation.y, desiredYaw);
    const headingAbs = Math.abs(headingError);
    const driftState = bot.drift;
    if (driftState.cooldown > 0) {
        driftState.cooldown = Math.max(0, driftState.cooldown - dt);
    }
    if (driftState.active) {
        driftState.timer -= dt;
        const headingContinue = headingAbs > BOT_DRIFT_EXIT_HEADING;
        if ((driftState.timer <= 0 && !headingContinue) || driftState.timer <= -0.35) {
            driftState.active = false;
            driftState.timer = 0;
            driftState.direction = 0;
            driftState.intensity = 0;
            driftState.cooldown = randomRange(BOT_DRIFT_COOLDOWN_MIN, BOT_DRIFT_COOLDOWN_MAX);
        } else {
            const headingIntensity = THREE.MathUtils.clamp(headingAbs / BOT_TARGET_HEADING_FULL_STEER, 0.35, 1);
            driftState.intensity = THREE.MathUtils.lerp(
                driftState.intensity,
                headingIntensity,
                1 - Math.exp(-4.4 * dt)
            );
        }
    } else if (
        driftState.cooldown <= 0
        && bot.state.speed > BOT_DRIFT_MIN_SPEED
        && headingAbs > BOT_DRIFT_ENTRY_HEADING
    ) {
        const headingFactor = THREE.MathUtils.clamp(
            (headingAbs - BOT_DRIFT_ENTRY_HEADING)
            / Math.max(0.001, BOT_TARGET_HEADING_FULL_STEER - BOT_DRIFT_ENTRY_HEADING),
            0,
            1
        );
        const speedFactor = THREE.MathUtils.clamp(
            (bot.state.speed - BOT_DRIFT_MIN_SPEED)
            / Math.max(0.001, BOT_MAX_SPEED - BOT_DRIFT_MIN_SPEED),
            0,
            1
        );
        const driftChance = BOT_DRIFT_CHANCE_PER_SECOND
            * dt
            * (0.35 + headingFactor * 0.95)
            * (0.45 + speedFactor * 0.75);
        if (Math.random() < driftChance) {
            driftState.active = true;
            driftState.timer = randomRange(BOT_DRIFT_DURATION_MIN, BOT_DRIFT_DURATION_MAX);
            driftState.direction = Math.sign(headingError) || (Math.random() < 0.5 ? -1 : 1);
            driftState.intensity = THREE.MathUtils.clamp(0.42 + headingFactor * 0.5, 0.35, 1);
        }
    }

    let steerTarget = THREE.MathUtils.clamp(
        headingError / BOT_TARGET_HEADING_FULL_STEER,
        -1,
        1
    );
    if (driftState.active) {
        steerTarget = THREE.MathUtils.clamp(
            steerTarget + driftState.direction * BOT_DRIFT_STEER_BIAS * driftState.intensity,
            -1,
            1
        );
    }
    bot.state.steerInput = moveToward(
        bot.state.steerInput,
        steerTarget,
        BOT_STEER_RESPONSE * damageDynamics.steerAuthority * dt
    );
    bot.state.steerAngle = bot.state.steerInput * BOT_MAX_STEER * damageDynamics.steerRange;

    let desiredSpeed = BOT_MAX_SPEED * (1 - Math.min(Math.abs(headingError) / Math.PI, 0.55));
    desiredSpeed = Math.max(BOT_MIN_SPEED, desiredSpeed);
    desiredSpeed *= damageDynamics.speedScale;
    if (driftState.active) {
        const driftSpeedScale = THREE.MathUtils.lerp(1, BOT_DRIFT_SPEED_SCALE, driftState.intensity);
        desiredSpeed *= driftSpeedScale;
    }
    if (targetPickup) {
        const targetDistance = Math.sqrt(distanceSqXZ(bot.car.position, targetPickup));
        if (targetDistance < 16) {
            desiredSpeed = Math.min(desiredSpeed, BOT_MIN_SPEED * damageDynamics.speedScale + targetDistance * 1.45);
        }
    }

    const speedError = desiredSpeed - bot.state.speed;
    const maxSpeedDelta = speedError >= 0 ? BOT_ACCELERATION * dt : BOT_BRAKE_DECELERATION * dt;
    const previousSpeed = bot.state.speed;
    bot.state.speed = moveToward(bot.state.speed, desiredSpeed, maxSpeedDelta);
    bot.state.speed *= Math.exp(-(BOT_DRAG + damageDynamics.dragPenalty) * dt);
    bot.state.acceleration = (bot.state.speed - previousSpeed) / Math.max(dt, 0.0001);
    bot.state.throttle = speedError > 0
        ? THREE.MathUtils.clamp(speedError / (BOT_MAX_SPEED * 0.36), 0, 1)
        : 0;
    bot.state.brake = speedError < 0
        ? THREE.MathUtils.clamp(-speedError / (BOT_MAX_SPEED * 0.24), 0, 1)
        : 0;
    const burnoutTarget = driftState.active
        ? THREE.MathUtils.clamp(0.46 + driftState.intensity * 0.42, 0, 1)
        : 0;
    bot.state.burnout = moveToward(bot.state.burnout || 0, burnoutTarget, (driftState.active ? 2.8 : 3.6) * dt);

    let yawRate = calculateYawRate(bot.state.speed, bot.state.steerAngle);
    if (driftState.active) {
        yawRate += driftState.direction * BOT_DRIFT_YAW_BOOST * driftState.intensity;
    }
    const yawBias = damageDynamics.yawBias * THREE.MathUtils.clamp(Math.abs(bot.state.speed) / 9, 0, 1);
    const totalYawRate = yawRate + yawBias;
    bot.state.yawRate = totalYawRate;
    bot.car.rotation.y += totalYawRate * dt;

    forward2.set(-Math.sin(bot.car.rotation.y), -Math.cos(bot.car.rotation.y));
    bot.state.velocity.copy(forward2).multiplyScalar(bot.state.speed);
    if (driftState.active) {
        right2.set(Math.cos(bot.car.rotation.y), -Math.sin(bot.car.rotation.y));
        const driftSlip = BOT_DRIFT_LATERAL_SLIP * driftState.intensity * Math.sign(bot.state.speed || 1);
        bot.state.velocity.addScaledVector(right2, driftSlip);
    }

    bot.car.position.x += bot.state.velocity.x * dt;
    bot.car.position.z += bot.state.velocity.y * dt;

    constrainToWorld(bot.car.position, bot.state, worldBounds);
    constrainToObstacles(bot, bot.car.position, bot.state, staticObstacles);
    constrainToPlayerVehicle(bot, playerPosition);
    bot.car.position.y = resolveBotGroundHeight(
        bot.car.position.x,
        bot.car.position.z,
        getGroundHeightAt
    );

    bot.updateVisuals(bot.state, dt);
    updateBotIndicator(bot, dt);
}

function applyCollisionImpulseToBot(bot, contact) {
    const normalX = contact?.normalX || 0;
    const normalZ = contact?.normalZ || 0;
    const impactSpeed = Math.max(0, contact?.impactSpeed || 0);
    const penetration = Math.max(0, contact?.penetration || 0);
    if (impactSpeed <= 0.001 && penetration <= 0.001) {
        return;
    }

    bot.car.position.x -= normalX * penetration * BOT_COLLISION_POSITION_SHARE;
    bot.car.position.z -= normalZ * penetration * BOT_COLLISION_POSITION_SHARE;

    // Vehicle normal points from bot to player. Bot must be pushed opposite to it.
    bot.state.velocity.x -= normalX * impactSpeed * 0.56;
    bot.state.velocity.y -= normalZ * impactSpeed * 0.56;
    bot.state.velocity.multiplyScalar(BOT_COLLISION_SPEED_DAMPING);

    const velocityMag = bot.state.velocity.length();
    bot.state.speed = Math.min(BOT_MAX_SPEED * 1.05, velocityMag);

    const forwardX = -Math.sin(bot.car.rotation.y);
    const forwardZ = -Math.cos(bot.car.rotation.y);
    const sideFactor = forwardX * normalZ - forwardZ * normalX;
    const yawKick = THREE.MathUtils.clamp(impactSpeed / 28, 0, 1) * 0.34;
    bot.car.rotation.y -= sideFactor * yawKick;
    bot.state.acceleration = -impactSpeed * 4.2;
    applyBotCollisionDamage(bot, contact);
}

function createEmptyBotDamageState() {
    return {
        wheelLossCount: 0,
        leftLoss: 0,
        rightLoss: 0,
        frontLoss: 0,
        rearLoss: 0,
        suspensionLoss: 0,
    };
}

function initializeBotPartBaselines(bot) {
    bot.bodyPartBaselines.clear();
    for (let i = 0; i < bot.crashParts.length; i += 1) {
        const part = bot.crashParts[i];
        if (part?.type !== 'body_panel' || !part.source) {
            continue;
        }
        bot.bodyPartBaselines.set(part.id, {
            position: part.source.position.clone(),
            rotation: part.source.rotation.clone(),
            scale: part.source.scale.clone(),
        });
    }
}

function getBotDamageDynamics(damageState) {
    const sideImbalance = damageState.rightLoss - damageState.leftLoss;
    const axleImbalance = damageState.frontLoss - damageState.rearLoss;
    return {
        speedScale: THREE.MathUtils.clamp(
            1 - damageState.wheelLossCount * 0.14 - damageState.suspensionLoss * 0.08,
            0.42,
            1
        ),
        steerAuthority: THREE.MathUtils.clamp(
            1 - damageState.wheelLossCount * 0.16 - damageState.suspensionLoss * 0.08,
            0.5,
            1
        ),
        steerRange: THREE.MathUtils.clamp(
            1 - damageState.wheelLossCount * 0.17 - damageState.suspensionLoss * 0.09,
            0.52,
            1
        ),
        yawBias: THREE.MathUtils.clamp(
            sideImbalance * 0.82 + axleImbalance * 0.18,
            -2.6,
            2.6
        ),
        dragPenalty: damageState.wheelLossCount * 0.28 + damageState.suspensionLoss * 0.1,
    };
}

function applyBotCollisionDamage(bot, contact) {
    const impactSpeed = Math.max(0, contact?.impactSpeed || 0);
    if (impactSpeed < BOT_DAMAGE_COLLISION_MIN) {
        return;
    }
    const nowMs = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
    if (impactSpeed < BOT_WHEEL_DETACH_SPEED && nowMs - bot.lastDamageAtMs < 180) {
        return;
    }
    bot.lastDamageAtMs = nowMs;

    const hitInfo = resolveBotHitInfo(bot, contact);
    const crashContext = buildBotCrashContext(bot, contact, hitInfo);
    applyBotPersistentHandlingDamage(bot, hitInfo, impactSpeed);
    addBotDentFromImpact(bot, hitInfo, impactSpeed);

    if (impactSpeed >= BOT_WHEEL_DETACH_SPEED) {
        tryDetachBotPart(bot, (part) => (
            part.type === 'wheel'
            && part.side === hitInfo.hitSide
            && part.zone === hitInfo.hitZone
        ), crashContext);
        tryDetachBotPart(bot, (part) => (
            part.type === 'suspension_link'
            && part.side === hitInfo.hitSide
            && part.zone === hitInfo.hitZone
        ), crashContext);
    }

    if (impactSpeed >= BOT_SECOND_WHEEL_DETACH_SPEED) {
        const oppositeZone = hitInfo.hitZone === 'front' ? 'rear' : 'front';
        tryDetachBotPart(bot, (part) => (
            part.type === 'wheel'
            && part.side === hitInfo.hitSide
            && part.zone === oppositeZone
        ), crashContext);
    }

    if (isBotTotaled(bot)) {
        destroyBot(bot);
    }
}

function resolveBotHitInfo(bot, contact) {
    const normalX = contact?.normalX || 0;
    const normalZ = contact?.normalZ || 0;
    const hitPosition = new THREE.Vector3(
        bot.car.position.x + normalX * BOT_RADIUS * 0.88,
        bot.car.position.y,
        bot.car.position.z + normalZ * BOT_RADIUS * 0.88
    );
    const localHit = hitPosition.clone();
    bot.car.worldToLocal(localHit);

    const rightX = Math.cos(bot.car.rotation.y);
    const rightZ = -Math.sin(bot.car.rotation.y);
    const forwardX = -Math.sin(bot.car.rotation.y);
    const forwardZ = -Math.cos(bot.car.rotation.y);
    const sideFallback = (normalX * rightX + normalZ * rightZ) >= 0 ? 'right' : 'left';
    const zoneFallback = (normalX * forwardX + normalZ * forwardZ) >= 0 ? 'front' : 'rear';

    const hitSide = Math.abs(localHit.x) > 0.08
        ? (localHit.x < 0 ? 'left' : 'right')
        : sideFallback;
    const hitZone = Math.abs(localHit.z) > 0.12
        ? (localHit.z < 0 ? 'front' : 'rear')
        : zoneFallback;

    return { hitSide, hitZone };
}

function buildBotCrashContext(bot, contact, hitInfo) {
    const carForward = new THREE.Vector3(0, 0, -1).applyQuaternion(bot.car.quaternion).setY(0).normalize();
    const carRight = new THREE.Vector3(1, 0, 0).applyQuaternion(bot.car.quaternion).setY(0).normalize();
    const hitDirection = new THREE.Vector3(contact?.normalX || 0, 0, contact?.normalZ || 0);
    if (hitDirection.lengthSq() < 0.0001) {
        hitDirection.copy(carForward);
    } else {
        hitDirection.normalize();
    }
    const impactNormal = hitDirection.clone().multiplyScalar(-1);

    const impactSpeed = Math.max(0, contact?.impactSpeed || 0);
    const impactNorm = THREE.MathUtils.clamp(
        (impactSpeed - BOT_DAMAGE_COLLISION_MIN) / (BOT_DAMAGE_COLLISION_HIGH - BOT_DAMAGE_COLLISION_MIN),
        0,
        1
    );
    const frontalImpact = THREE.MathUtils.clamp(-impactNormal.dot(carForward), 0, 1);

    const impactVelocity = new THREE.Vector3(bot.state.velocity.x || 0, 0, bot.state.velocity.y || 0);
    if (impactVelocity.lengthSq() < 0.04) {
        impactVelocity.copy(carForward).multiplyScalar(impactSpeed * 0.62);
    }
    const impactTravelDirection = impactVelocity.lengthSq() > 0.0001
        ? impactVelocity.clone().normalize()
        : carForward.clone();
    const impactTravelSpeed = Math.max(impactVelocity.length(), impactSpeed * 0.58);

    return {
        origin: bot.car.position.clone(),
        hitDirection,
        impactNormal,
        carForward,
        carRight,
        hitSide: hitInfo.hitSide,
        hitZone: hitInfo.hitZone,
        crashIntensity: 0.35 + impactNorm * 0.65,
        frontalImpact,
        impactSpeed,
        impactTravelDirection,
        impactTravelSpeed,
        obstacleCategory: contact?.obstacleCategory || 'vehicle',
        isObstacleCollision: true,
    };
}

function applyBotPersistentHandlingDamage(bot, hitInfo, impactSpeed) {
    const damageNorm = THREE.MathUtils.clamp(
        (impactSpeed - BOT_DAMAGE_COLLISION_MIN)
        / (BOT_WHEEL_DETACH_SPEED - BOT_DAMAGE_COLLISION_MIN),
        0,
        1.25
    );
    if (damageNorm <= 0.02) {
        return;
    }

    const localGain = damageNorm * 0.3;
    const zoneGain = damageNorm * 0.24;
    const suspensionGain = damageNorm * 0.19;

    if (hitInfo.hitSide === 'left') {
        bot.damageState.leftLoss += localGain;
    } else {
        bot.damageState.rightLoss += localGain;
    }

    if (hitInfo.hitZone === 'front') {
        bot.damageState.frontLoss += zoneGain;
    } else {
        bot.damageState.rearLoss += zoneGain;
    }

    bot.damageState.suspensionLoss += suspensionGain;
    clampBotDamageState(bot.damageState);
}

function addBotDentFromImpact(bot, hitInfo, impactSpeed) {
    const dentNorm = THREE.MathUtils.clamp(
        (impactSpeed - BOT_DAMAGE_COLLISION_MIN)
        / (BOT_DAMAGE_COLLISION_HIGH - BOT_DAMAGE_COLLISION_MIN),
        0,
        1.2
    );
    if (dentNorm <= 0.03) {
        return;
    }

    const dentGain = dentNorm * 0.26;
    if (hitInfo.hitSide === 'left') {
        bot.bodyDamageVisual.left = THREE.MathUtils.clamp(bot.bodyDamageVisual.left + dentGain, 0, BOT_DENT_MAX);
    } else {
        bot.bodyDamageVisual.right = THREE.MathUtils.clamp(bot.bodyDamageVisual.right + dentGain, 0, BOT_DENT_MAX);
    }

    if (hitInfo.hitZone === 'front') {
        bot.bodyDamageVisual.front = THREE.MathUtils.clamp(bot.bodyDamageVisual.front + dentGain * 0.9, 0, BOT_DENT_MAX);
    } else {
        bot.bodyDamageVisual.rear = THREE.MathUtils.clamp(bot.bodyDamageVisual.rear + dentGain * 0.9, 0, BOT_DENT_MAX);
    }

    applyBotDentVisuals(bot);
}

function applyBotDentVisuals(bot) {
    const sideMagnitude = THREE.MathUtils.clamp(
        (bot.bodyDamageVisual.left + bot.bodyDamageVisual.right) * 0.26,
        0,
        0.32
    );
    const sideBias = THREE.MathUtils.clamp(bot.bodyDamageVisual.right - bot.bodyDamageVisual.left, -1.4, 1.4);
    const zoneMagnitude = THREE.MathUtils.clamp(
        (bot.bodyDamageVisual.front + bot.bodyDamageVisual.rear) * 0.23,
        0,
        0.3
    );
    const zoneBias = THREE.MathUtils.clamp(bot.bodyDamageVisual.rear - bot.bodyDamageVisual.front, -1.4, 1.4);

    for (let i = 0; i < bot.crashParts.length; i += 1) {
        const part = bot.crashParts[i];
        if (part?.type !== 'body_panel' || !part.source) {
            continue;
        }
        const base = bot.bodyPartBaselines.get(part.id);
        if (!base) {
            continue;
        }

        part.source.scale.set(
            base.scale.x * (1 - sideMagnitude * 0.2),
            base.scale.y * (1 - (sideMagnitude + zoneMagnitude) * 0.08),
            base.scale.z * (1 - zoneMagnitude * 0.24)
        );
        part.source.rotation.set(
            base.rotation.x + zoneBias * 0.045,
            base.rotation.y,
            base.rotation.z + sideBias * 0.065
        );
        part.source.position.set(
            base.position.x - sideBias * 0.04,
            base.position.y - (sideMagnitude + zoneMagnitude) * 0.028,
            base.position.z + zoneBias * 0.036
        );
    }
}

function tryDetachBotPart(bot, predicate, crashContext = null) {
    const part = bot.crashParts.find((candidate) => (
        candidate?.source
        && !bot.detachedPartIds.has(candidate.id)
        && predicate(candidate)
    ));
    if (!part) {
        return false;
    }
    detachBotPart(bot, part, crashContext);
    return true;
}

function detachBotPart(bot, part, crashContext = null) {
    if (!part?.source || bot.detachedPartIds.has(part.id)) {
        return false;
    }
    bot.detachedPartIds.add(part.id);
    if (bot.onPartDetached) {
        try {
            bot.onPartDetached({ bot, part, crashContext });
        } catch (error) {
            // Keep bot damage flow alive even if optional visual callback fails.
            console.error('Bot part detached callback failed:', error);
        }
    }
    part.source.visible = false;
    registerDetachedBotPartDamage(bot, part);
    return true;
}

function registerDetachedBotPartDamage(bot, part) {
    if (part.type === 'wheel') {
        bot.damageState.wheelLossCount += 1;
    } else if (part.type === 'suspension_link') {
        bot.damageState.suspensionLoss += 1;
    }

    if (part.side === 'left') {
        bot.damageState.leftLoss += 1;
    } else if (part.side === 'right') {
        bot.damageState.rightLoss += 1;
    }

    if (part.zone === 'front') {
        bot.damageState.frontLoss += 1;
    } else if (part.zone === 'rear') {
        bot.damageState.rearLoss += 1;
    }

    clampBotDamageState(bot.damageState);
}

function clampBotDamageState(damageState) {
    damageState.wheelLossCount = THREE.MathUtils.clamp(damageState.wheelLossCount, 0, 4);
    damageState.leftLoss = THREE.MathUtils.clamp(damageState.leftLoss, 0, 6);
    damageState.rightLoss = THREE.MathUtils.clamp(damageState.rightLoss, 0, 6);
    damageState.frontLoss = THREE.MathUtils.clamp(damageState.frontLoss, 0, 6);
    damageState.rearLoss = THREE.MathUtils.clamp(damageState.rearLoss, 0, 6);
    damageState.suspensionLoss = THREE.MathUtils.clamp(damageState.suspensionLoss, 0, 4);
}

function isBotTotaled(bot) {
    if (bot.damageState.wheelLossCount >= 3) {
        return true;
    }
    const damageScore = (
        bot.damageState.wheelLossCount * 1.55
        + bot.damageState.suspensionLoss * 1.1
        + Math.max(bot.damageState.leftLoss, bot.damageState.rightLoss) * 0.35
        + Math.max(bot.damageState.frontLoss, bot.damageState.rearLoss) * 0.25
    );
    return damageScore >= BOT_TOTAL_BREAK_SCORE;
}

function destroyBot(bot) {
    if (bot.destroyed) {
        return;
    }
    bot.destroyed = true;
    bot.state.speed = 0;
    bot.state.acceleration = 0;
    bot.state.throttle = 0;
    bot.state.brake = 0;
    bot.state.yawRate = 0;
    bot.state.burnout = 0;
    bot.state.velocity.set(0, 0);
    bot.drift.active = false;
    bot.drift.timer = 0;
    bot.drift.direction = 0;
    bot.drift.intensity = 0;
    bot.car.visible = false;
    if (bot.indicator?.root) {
        bot.indicator.root.visible = false;
    }
}

function createBotIndicator(name, colorHex) {
    const root = new THREE.Group();
    root.position.y = BOT_INDICATOR_HEIGHT;

    const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.12, 1.9, 14, 1, true),
        new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.22,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        })
    );
    beam.position.y = 0.94;
    root.add(beam);

    const marker = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: createBotMarkerTexture(colorHex),
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
        })
    );
    marker.position.y = 1.92;
    marker.scale.set(0.78, 0.78, 1);
    root.add(marker);

    const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: createBotLabelTexture(name, colorHex),
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
            toneMapped: false,
        })
    );
    label.position.y = 2.34;
    label.scale.set(1.62, 0.42, 1);
    root.add(label);

    return {
        root,
        beam,
        marker,
        label,
        phase: Math.random() * Math.PI * 2,
    };
}

function updateBotIndicator(bot, dt) {
    const indicator = bot.indicator;
    if (!indicator?.root || !indicator.root.visible) {
        return;
    }

    indicator.phase += dt * BOT_INDICATOR_PULSE_SPEED;
    const pulse = 0.5 + 0.5 * Math.sin(indicator.phase);
    const bob = Math.sin(indicator.phase * BOT_INDICATOR_BOB_SPEED) * BOT_INDICATOR_BOB_AMPLITUDE;

    indicator.root.position.y = BOT_INDICATOR_HEIGHT + bob;
    indicator.beam.material.opacity = 0.12 + pulse * 0.2;
    indicator.marker.material.opacity = 0.72 + pulse * 0.28;
    indicator.label.material.opacity = 0.72 + pulse * 0.22;

    const markerScale = 0.66 + pulse * 0.26;
    indicator.marker.scale.set(markerScale, markerScale, 1);
}

function createBotMarkerTexture(colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    const baseRadius = canvas.width * 0.36;

    const hex = `#${(colorHex >>> 0).toString(16).padStart(6, '0')}`;
    const gradient = ctx.createRadialGradient(cx, cy, baseRadius * 0.05, cx, cy, baseRadius * 1.15);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.28, 'rgba(230,245,255,0.96)');
    gradient.addColorStop(0.62, hexToRgba(colorHex, 0.87));
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 1.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(240, 252, 255, 0.92)';
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 0.62, 0, Math.PI * 2);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function createBotLabelTexture(name, colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');

    const hex = `#${(colorHex >>> 0).toString(16).padStart(6, '0')}`;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(7, 14, 25, 0.72)';
    ctx.fillRect(56, 42, canvas.width - 112, 96);

    ctx.strokeStyle = hexToRgba(colorHex, 0.87);
    ctx.lineWidth = 4;
    ctx.strokeRect(56, 42, canvas.width - 112, 96);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "900 74px 'Trebuchet MS', 'Arial Black', sans-serif";
    ctx.fillStyle = '#ecf9ff';
    ctx.shadowColor = hex;
    ctx.shadowBlur = 18;
    ctx.fillText(name, canvas.width * 0.5, canvas.height * 0.52);
    ctx.shadowBlur = 0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function hexToRgba(colorHex, alpha = 1) {
    const r = (colorHex >> 16) & 255;
    const g = (colorHex >> 8) & 255;
    const b = colorHex & 255;
    return `rgba(${r}, ${g}, ${b}, ${THREE.MathUtils.clamp(alpha, 0, 1)})`;
}

function findNearestPickup(position, pickups) {
    let nearest = null;
    let nearestDistanceSq = Infinity;

    for (let i = 0; i < pickups.length; i += 1) {
        const pickup = pickups[i];
        const dx = pickup.x - position.x;
        const dz = pickup.z - position.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq < nearestDistanceSq) {
            nearestDistanceSq = distanceSq;
            nearest = pickup;
        }
    }

    return nearest;
}

function findSpawnPoint(botIndex, worldBounds, staticObstacles, existingBots) {
    const areaX = worldBounds.maxX - worldBounds.minX;
    const areaZ = worldBounds.maxZ - worldBounds.minZ;

    for (let attempt = 0; attempt < 120; attempt += 1) {
        const seed = botIndex * 311 + attempt * 37 + 1;
        const x = worldBounds.minX + randomUnit(seed) * areaX;
        const z = worldBounds.minZ + randomUnit(seed + 97) * areaZ;
        if (isInsideObstacle(x, z, staticObstacles, 2.4)) {
            continue;
        }

        let tooClose = false;
        for (let i = 0; i < existingBots.length; i += 1) {
            const other = existingBots[i];
            const distanceSq = distanceSqXY(x, z, other.car.position.x, other.car.position.z);
            if (distanceSq < BOT_SPAWN_CLEARANCE * BOT_SPAWN_CLEARANCE) {
                tooClose = true;
                break;
            }
        }
        if (tooClose) {
            continue;
        }

        return {
            x,
            z,
            rotationY: randomUnit(seed + 211) * Math.PI * 2,
        };
    }

    return {
        x: worldBounds.minX + (botIndex + 1) * 8,
        z: worldBounds.minZ + (botIndex + 1) * 8,
        rotationY: (botIndex / Math.max(1, BOT_NAMES.length)) * Math.PI * 2,
    };
}

function pickWanderTarget(worldBounds) {
    const margin = 12;
    return {
        x: THREE.MathUtils.lerp(worldBounds.minX + margin, worldBounds.maxX - margin, Math.random()),
        z: THREE.MathUtils.lerp(worldBounds.minZ + margin, worldBounds.maxZ - margin, Math.random()),
    };
}

function addBoundaryAvoidance(outVec, position, worldBounds) {
    const margin = 24;

    if (position.x < worldBounds.minX + margin) {
        outVec.x += ((worldBounds.minX + margin) - position.x) / margin;
    } else if (position.x > worldBounds.maxX - margin) {
        outVec.x -= (position.x - (worldBounds.maxX - margin)) / margin;
    }

    if (position.z < worldBounds.minZ + margin) {
        outVec.y += ((worldBounds.minZ + margin) - position.z) / margin;
    } else if (position.z > worldBounds.maxZ - margin) {
        outVec.y -= (position.z - (worldBounds.maxZ - margin)) / margin;
    }
}

function addObstacleAvoidance(outVec, position, staticObstacles) {
    for (let i = 0; i < staticObstacles.length; i += 1) {
        const obstacle = staticObstacles[i];

        if (obstacle.type === 'circle') {
            scratch2.set(position.x - obstacle.x, position.z - obstacle.z);
            const safeRadius = obstacle.radius + 5;
            const distanceSq = scratch2.lengthSq();
            if (distanceSq > safeRadius * safeRadius || distanceSq < 0.0001) {
                continue;
            }
            const distance = Math.sqrt(distanceSq);
            const force = (safeRadius - distance) / safeRadius;
            outVec.addScaledVector(scratch2.multiplyScalar(1 / distance), force * 1.8);
            continue;
        }

        if (obstacle.type !== 'aabb') {
            continue;
        }

        const closestX = THREE.MathUtils.clamp(position.x, obstacle.minX, obstacle.maxX);
        const closestZ = THREE.MathUtils.clamp(position.z, obstacle.minZ, obstacle.maxZ);
        scratch2.set(position.x - closestX, position.z - closestZ);
        const distanceSq = scratch2.lengthSq();
        const safeRadius = 4.8;
        if (distanceSq > safeRadius * safeRadius || distanceSq < 0.0001) {
            continue;
        }

        const distance = Math.sqrt(distanceSq);
        const force = (safeRadius - distance) / safeRadius;
        outVec.addScaledVector(scratch2.multiplyScalar(1 / distance), force * 1.6);
    }
}

function addEntityAvoidance(outVec, position, entityPosition, radius, strength) {
    const dx = position.x - entityPosition.x;
    const dz = position.z - entityPosition.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > radius * radius || distanceSq < 0.0001) {
        return;
    }

    const distance = Math.sqrt(distanceSq);
    const force = (radius - distance) / radius;
    outVec.x += (dx / distance) * force * strength;
    outVec.y += (dz / distance) * force * strength;
}

function constrainToWorld(position, state, worldBounds) {
    let hit = false;

    if (position.x < worldBounds.minX) {
        position.x = worldBounds.minX;
        hit = true;
    } else if (position.x > worldBounds.maxX) {
        position.x = worldBounds.maxX;
        hit = true;
    }

    if (position.z < worldBounds.minZ) {
        position.z = worldBounds.minZ;
        hit = true;
    } else if (position.z > worldBounds.maxZ) {
        position.z = worldBounds.maxZ;
        hit = true;
    }

    if (hit) {
        state.speed *= 0.45;
        state.velocity.multiplyScalar(0.45);
    }
}

function constrainToObstacles(bot, position, state, staticObstacles) {
    if (!staticObstacles || staticObstacles.length === 0) {
        return;
    }

    let collided = false;
    let strongestDamageContact = null;
    for (let pass = 0; pass < OBSTACLE_PASSES; pass += 1) {
        let moved = false;

        for (let i = 0; i < staticObstacles.length; i += 1) {
            const obstacle = staticObstacles[i];
            if (obstacle.type === 'circle') {
                const dx = position.x - obstacle.x;
                const dz = position.z - obstacle.z;
                const combinedRadius = obstacle.radius + BOT_RADIUS;
                const distanceSq = dx * dx + dz * dz;
                if (distanceSq >= combinedRadius * combinedRadius) {
                    continue;
                }

                let normalX = dx;
                let normalZ = dz;
                let distance = Math.sqrt(distanceSq);

                if (distance < 0.0001) {
                    normalX = 1;
                    normalZ = 0;
                    distance = 1;
                } else {
                    normalX /= distance;
                    normalZ /= distance;
                }

                const push = combinedRadius - distance;
                position.x += normalX * push;
                position.z += normalZ * push;
                moved = true;
                collided = true;
                if (
                    bot
                    && BOT_DAMAGE_OBSTACLE_CATEGORIES.has(obstacle.category)
                ) {
                    const impactSpeed = getObstacleImpactSpeed(state, normalX, normalZ);
                    if (!strongestDamageContact || impactSpeed > strongestDamageContact.impactSpeed) {
                        strongestDamageContact = {
                            normalX: -normalX,
                            normalZ: -normalZ,
                            impactSpeed,
                            penetration: push,
                            obstacleCategory: obstacle.category || 'obstacle',
                        };
                    }
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
            if (distanceSq >= BOT_RADIUS * BOT_RADIUS) {
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

            const push = BOT_RADIUS - distance;
            position.x += normalX * push;
            position.z += normalZ * push;
            moved = true;
            collided = true;
            if (
                bot
                && BOT_DAMAGE_OBSTACLE_CATEGORIES.has(obstacle.category)
            ) {
                const impactSpeed = getObstacleImpactSpeed(state, normalX, normalZ);
                if (!strongestDamageContact || impactSpeed > strongestDamageContact.impactSpeed) {
                    strongestDamageContact = {
                        normalX: -normalX,
                        normalZ: -normalZ,
                        impactSpeed,
                        penetration: push,
                        obstacleCategory: obstacle.category || 'obstacle',
                    };
                }
            }
        }

        if (!moved) {
            break;
        }
    }

    if (collided) {
        state.speed *= 0.9;
        state.velocity.multiplyScalar(0.9);
        if (strongestDamageContact) {
            applyBotCollisionDamage(bot, strongestDamageContact);
        }
    }
}

function constrainToPlayerVehicle(bot, playerPosition) {
    if (!bot || !playerPosition) {
        return;
    }

    const dx = bot.car.position.x - playerPosition.x;
    const dz = bot.car.position.z - playerPosition.z;
    const combinedRadius = BOT_VEHICLE_COLLISION_RADIUS + PLAYER_VEHICLE_COLLISION_RADIUS;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq >= combinedRadius * combinedRadius) {
        return;
    }

    let normalX = dx;
    let normalZ = dz;
    let distance = Math.sqrt(distanceSq);
    if (distance < 0.0001) {
        normalX = -Math.sin(bot.car.rotation.y);
        normalZ = -Math.cos(bot.car.rotation.y);
        distance = 1;
    } else {
        normalX /= distance;
        normalZ /= distance;
    }

    const penetration = combinedRadius - distance;
    bot.car.position.x += normalX * (penetration + 0.002);
    bot.car.position.z += normalZ * (penetration + 0.002);

    const inwardSpeed = bot.state.velocity.x * normalX + bot.state.velocity.y * normalZ;
    if (inwardSpeed < 0) {
        bot.state.velocity.x -= normalX * inwardSpeed;
        bot.state.velocity.y -= normalZ * inwardSpeed;
    }
    bot.state.velocity.multiplyScalar(0.92);
    bot.state.speed = Math.min(bot.state.speed, bot.state.velocity.length());
}

function getObstacleImpactSpeed(state, normalX, normalZ) {
    // Obstacle normal points from obstacle to bot, so inbound impact is the opposite sign.
    return Math.max(0, -(state.velocity.x * normalX + state.velocity.y * normalZ));
}

function isInsideObstacle(x, z, staticObstacles, padding) {
    for (let i = 0; i < staticObstacles.length; i += 1) {
        const obstacle = staticObstacles[i];
        if (obstacle.type === 'circle') {
            const radius = obstacle.radius + padding;
            if (distanceSqXY(x, z, obstacle.x, obstacle.z) <= radius * radius) {
                return true;
            }
            continue;
        }

        if (obstacle.type === 'aabb') {
            if (
                x >= obstacle.minX - padding
                && x <= obstacle.maxX + padding
                && z >= obstacle.minZ - padding
                && z <= obstacle.maxZ + padding
            ) {
                return true;
            }
        }
    }

    return false;
}

function calculateYawRate(speed, steerAngle) {
    const speedAbs = Math.abs(speed);
    if (speedAbs < 0.25) {
        return 0;
    }

    const base = (speed / BOT_WHEEL_BASE) * Math.tan(steerAngle);
    const lowSpeedAssist = THREE.MathUtils.clamp(speedAbs / 8.5, 0.08, 1);
    return base * lowSpeedAssist;
}

function moveToward(current, target, maxDelta) {
    if (current < target) {
        return Math.min(current + maxDelta, target);
    }
    return Math.max(current - maxDelta, target);
}

function shortestAngle(from, to) {
    return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function randomRange(min, max) {
    return min + Math.random() * Math.max(0, max - min);
}

function randomUnit(seed) {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
    return value - Math.floor(value);
}

function distanceSqXZ(a, b) {
    return distanceSqXY(a.x, a.z, b.x, b.z);
}

function distanceSqXY(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
}
