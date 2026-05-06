import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { getLorienVelmoreRoofLiftLayout } from './environment/lorien-gallery.js';

const PICKUP_RADIUS = 3.25;
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS;
const PICKUP_HEIGHT_TOLERANCE = 2.8;
const PICKUP_RESPAWN_DELAY_SEC = 0.9;
const SHOT_INTERVAL_SEC = 0.082;
const SHOT_RANGE = 190;
const CAMERA_AIM_RANGE = 220;
const AUTO_LOCK_RANGE = 190;
const AUTO_LOCK_MIN_FORWARD_DOT = 0.6;
const AUTO_LOCK_MAX_SCREEN_DISTANCE = 0.48;
const WEAPON_MOUNT_BASE_Y = 0.96;
const WEAPON_MOUNT_BASE_Z = -1.72;
const WEAPON_MAX_TRAVERSE_YAW = THREE.MathUtils.degToRad(18);
const WEAPON_MAX_TRAVERSE_PITCH_UP = THREE.MathUtils.degToRad(10);
const WEAPON_MAX_TRAVERSE_PITCH_DOWN = THREE.MathUtils.degToRad(6);
const WEAPON_IDLE_SWAY_SPEED = 2.8;
const WEAPON_SPEED_SWAY_SPEED = 5.6;
const WEAPON_RECOIL_RISE = 22;
const WEAPON_RECOIL_FALL = 10.5;
const WEAPON_HEAT_RISE = 0.16;
const WEAPON_HEAT_FALL = 0.46;
const HUD_TRACKING_SNAP_SPEED = 15.5;
const MAX_ACTIVE_PROJECTILES = 18;
const MAX_ACTIVE_IMPACTS = 18;
const MAX_ACTIVE_MUZZLE_FLASHES = 6;
const MAX_ACTIVE_BULLET_MARKS = 32;
const PROJECTILE_SPEED = 182;
const PROJECTILE_LENGTH = 0.72;
const PROJECTILE_MAX_LIFETIME_SEC = 1.4;
const MUZZLE_FLASH_LIFETIME_SEC = 0.085;
const IMPACT_LIFETIME_SEC = 0.18;
const BULLET_MARK_LIFETIME_SEC = 14;
const BULLET_MARK_MIN_DISTANCE = 0.9;
const BOT_DEBRIS_BUDGET_NEAR = 6;
const BOT_DEBRIS_BUDGET_MID = 3;
const BOT_DEBRIS_BUDGET_FAR = 1;
const BOT_DEBRIS_NEAR_DISTANCE_SQ = 46 * 46;
const BOT_DEBRIS_MID_DISTANCE_SQ = 86 * 86;
const RETICLE_DEFAULT_COLOR = new THREE.Color(0x6fe6ff);
const RETICLE_HOT_COLOR = new THREE.Color(0xffc88a);
const RETICLE_LOCK_COLOR = new THREE.Color(0xff856f);
const WEAPON_METAL_COLOR = new THREE.Color(0x101923);
const WEAPON_EDGE_COLOR = new THREE.Color(0x7be9ff);
const WEAPON_HOT_COLOR = new THREE.Color(0xff9259);
const weaponAimOrigin = new THREE.Vector3();
const weaponAimDirection = new THREE.Vector3();
const weaponAimPoint = new THREE.Vector3();
const weaponShotDirection = new THREE.Vector3();
const weaponMuzzleWorldPosition = new THREE.Vector3();
const weaponTempVectorA = new THREE.Vector3();
const weaponTempVectorB = new THREE.Vector3();
const weaponTempVectorC = new THREE.Vector3();
const weaponTempColor = new THREE.Color();
const weaponHudProjection = new THREE.Vector3();
const weaponLocalOrigin = new THREE.Vector3();
const weaponLocalTargetPoint = new THREE.Vector3();
const weaponLocalAimVector = new THREE.Vector3();

const projectileCoreGeometry = new THREE.CylinderGeometry(0.022, 0.03, PROJECTILE_LENGTH, 12, 1);
const projectileGlowGeometry = new THREE.CylinderGeometry(
    0.052,
    0.068,
    PROJECTILE_LENGTH * 1.36,
    14,
    1,
    true
);
const projectileTipGeometry = new THREE.SphereGeometry(0.075, 12, 12);
const impactRingGeometry = new THREE.RingGeometry(0.18, 0.44, 40);
const impactGlowGeometry = new THREE.PlaneGeometry(0.9, 0.9);
const muzzleFlashCoreGeometry = new THREE.PlaneGeometry(0.34, 0.84);
const muzzleFlashGlowGeometry = new THREE.PlaneGeometry(0.64, 1.18);
const bulletMarkGeometry = new THREE.PlaneGeometry(0.34, 0.34);
const pickupHaloGeometry = new THREE.RingGeometry(0.85, 1.42, 56);
const pickupPulseGeometry = new THREE.CylinderGeometry(0.7, 0.7, 0.06, 44, 1, true);
const pickupBeamGeometry = new THREE.CylinderGeometry(0.13, 0.35, 4.9, 18, 1, true);
const pickupCoreGeometry = new THREE.OctahedronGeometry(0.32, 1);
const pickupShellGeometry = new THREE.IcosahedronGeometry(0.54, 1);
const pickupStandGeometry = new THREE.CylinderGeometry(0.5, 0.62, 0.36, 36, 1, false);
const pickupRingGeometry = new THREE.TorusGeometry(0.86, 0.048, 14, 64);
const weaponBodyGeometry = new THREE.BoxGeometry(0.46, 0.18, 0.84);
const weaponUpperGeometry = new THREE.BoxGeometry(0.22, 0.12, 0.5);
const weaponBarrelGeometry = new THREE.CylinderGeometry(0.038, 0.042, 0.92, 18, 1, false);
const weaponMuzzleRingGeometry = new THREE.TorusGeometry(0.078, 0.012, 10, 24);
const weaponRailGeometry = new THREE.BoxGeometry(0.06, 0.05, 0.7);
const weaponCoilGeometry = new THREE.TorusGeometry(0.13, 0.028, 10, 32);
const weaponSightFrameGeometry = new THREE.BoxGeometry(0.12, 0.18, 0.04);
const pickupGlowTexture = createSoftGlowTexture();
const reticleTexture = createReticleTexture();
const pickupWordmarkTexture = createPickupWordmarkTexture();
const bulletMarkTexture = createBulletMarkTexture();

export function createRoofWeaponSystem({
    scene,
    camera,
    car,
    getGroundHeightAt = () => 0,
    getBotTrafficSystem = () => null,
    getGameMode = () => 'bots',
    getVehicleState = () => ({}),
    getStaticObstacles = () => [],
    getAudioController = () => null,
    onStatus = () => {},
    onBotDestroyed = () => {},
} = {}) {
    if (!scene || !camera || !car) {
        return createNoopWeaponSystem();
    }

    const layout = getLorienVelmoreRoofLiftLayout();
    const pickupAnchor = new THREE.Vector3(
        layout.centerX,
        layout.roofSurfaceY + 0.92,
        layout.centerZ + layout.roofDeckMinZ + (layout.roofDeckMaxZ - layout.roofDeckMinZ) * 0.32
    );
    const effectRoot = new THREE.Group();
    effectRoot.name = 'lorienRoofWeaponEffects';
    scene.add(effectRoot);

    const pickup = createRoofPickup(pickupAnchor);
    scene.add(pickup.root);

    const mountParent = car.getObjectByName('body_shell_group') || car;
    const mount = createWeaponMount();
    mount.root.visible = false;
    mountParent.add(mount.root);

    const hud = ensureWeaponHud();
    const reticleColor = new THREE.Color().copy(RETICLE_DEFAULT_COLOR);
    const targetReticleColor = new THREE.Color().copy(RETICLE_DEFAULT_COLOR);
    const activeProjectiles = [];
    const activeImpacts = [];
    const activeMuzzleFlashes = [];
    const activeBulletMarks = [];

    const state = {
        hasWeapon: false,
        pickupAvailable: true,
        pickupRespawnTimer: 0,
        triggerHeld: false,
        recoil: 0,
        heat: 0,
        fireCooldown: 0,
        hoverPhase: Math.random() * Math.PI * 2,
        lockPulse: Math.random() * Math.PI * 2,
        shotSequence: 0,
        currentLock: null,
        hudX: window.innerWidth * 0.5,
        hudY: window.innerHeight * 0.5,
    };

    return {
        update,
        setTriggerHeld(nextHeld) {
            state.triggerHeld = Boolean(nextHeld) && state.hasWeapon;
        },
        resetRound() {
            state.triggerHeld = false;
            state.recoil = 0;
            state.heat = 0;
            state.fireCooldown = 0;
            state.currentLock = null;
            state.hudX = window.innerWidth * 0.5;
            state.hudY = window.innerHeight * 0.5;
            despawnPickup(false);
            activatePickup();
            hideWeapon();
            clearEffects();
            syncHud({
                visible: false,
                hasWeapon: false,
                triggerHeld: false,
                locked: false,
                heat: 0,
                screenX: state.hudX,
                screenY: state.hudY,
            });
        },
        onPlayerDestroyed() {
            state.triggerHeld = false;
            state.recoil = 0;
            state.heat = 0;
            state.fireCooldown = 0;
            state.currentLock = null;
            state.hudX = window.innerWidth * 0.5;
            state.hudY = window.innerHeight * 0.5;
            if (state.hasWeapon) {
                hideWeapon();
                despawnPickup(false);
                state.pickupRespawnTimer = PICKUP_RESPAWN_DELAY_SEC;
            }
            syncHud({
                visible: false,
                hasWeapon: false,
                triggerHeld: false,
                locked: false,
                heat: 0,
                screenX: state.hudX,
                screenY: state.hudY,
            });
        },
        hasWeapon() {
            return state.hasWeapon;
        },
    };

    function update(deltaTime = 1 / 60, frameState = {}) {
        const dt = Math.min(Math.max(Number(deltaTime) || 0, 0), 0.05);
        state.hoverPhase += dt * 2.2;
        state.lockPulse += dt * 6.8;

        const controlsEnabled = frameState.controlsEnabled !== false;
        const vehicleState =
            frameState.vehicleState && typeof frameState.vehicleState === 'object'
                ? frameState.vehicleState
                : getVehicleState();
        const gameMode = frameState.gameMode === 'online' ? 'online' : getGameMode();
        const roofWeaponActive =
            state.hasWeapon &&
            controlsEnabled &&
            !frameState.welcomeVisible &&
            !frameState.paused &&
            !frameState.editModeActive &&
            !frameState.raceIntroActive &&
            !frameState.carDestroyed &&
            !frameState.pickupRoundFinished &&
            !frameState.worldMapOpen;

        if (!roofWeaponActive) {
            state.triggerHeld = false;
        }

        if (state.pickupRespawnTimer > 0) {
            state.pickupRespawnTimer = Math.max(0, state.pickupRespawnTimer - dt);
            if (state.pickupRespawnTimer <= 0 && !state.pickupAvailable && !state.hasWeapon) {
                activatePickup();
            }
        }

        updatePickup(dt);
        maybeCollectPickup(frameState);

        const weaponMotionState = resolveWeaponMotionState(vehicleState);
        applyWeaponBasePose(weaponMotionState);
        const aimState = resolveAimState(gameMode, weaponMotionState);
        state.currentLock = aimState.lockedTarget;
        updateHudTracking(dt, aimState, roofWeaponActive);

        updateWeaponMount(dt, weaponMotionState, aimState, roofWeaponActive);

        if (roofWeaponActive && state.triggerHeld) {
            state.fireCooldown -= dt;
            let firedThisFrame = 0;
            while (state.fireCooldown <= 0 && firedThisFrame < 3) {
                fireShot(gameMode, aimState);
                state.fireCooldown += SHOT_INTERVAL_SEC;
                firedThisFrame += 1;
            }
        } else {
            state.fireCooldown = Math.max(0, state.fireCooldown - dt * 0.6);
        }

        const targetHeat = roofWeaponActive && state.triggerHeld ? 1 : 0;
        const heatRate =
            targetHeat > state.heat ? WEAPON_HEAT_RISE * 60 * dt : WEAPON_HEAT_FALL * dt;
        state.heat = THREE.MathUtils.lerp(
            state.heat,
            targetHeat,
            THREE.MathUtils.clamp(heatRate, 0, 1)
        );
        state.recoil = THREE.MathUtils.lerp(
            state.recoil,
            0,
            1 - Math.exp(-(state.triggerHeld ? WEAPON_RECOIL_RISE : WEAPON_RECOIL_FALL) * dt)
        );

        updateEffects(dt);
        syncHud({
            visible: roofWeaponActive,
            hasWeapon: state.hasWeapon,
            triggerHeld: state.triggerHeld,
            locked: Boolean(aimState.lockedTarget),
            heat: state.heat,
            screenX: state.hudX,
            screenY: state.hudY,
        });
    }

    function updatePickup(dt) {
        pickup.root.visible = state.pickupAvailable && !state.hasWeapon;
        if (!pickup.root.visible) {
            return;
        }

        const pulse = 0.5 + 0.5 * Math.sin(state.hoverPhase * 1.4);
        const pulseFast = 0.5 + 0.5 * Math.sin(state.hoverPhase * 3.1 + 0.5);
        pickup.root.position.y = pickupAnchor.y + Math.sin(state.hoverPhase * 1.2) * 0.09;
        pickup.core.rotation.y += dt * 2.4;
        pickup.shell.rotation.y -= dt * 1.4;
        pickup.ringA.rotation.z += dt * 0.9;
        pickup.ringB.rotation.x += dt * 1.05;
        pickup.ringC.rotation.y -= dt * 1.32;
        pickup.halo.rotation.z += dt * 0.22;
        pickup.wordmark.rotation.y = Math.sin(state.hoverPhase * 0.22) * 0.08;
        pickup.beam.material.opacity = 0.14 + pulse * 0.2;
        pickup.pulse.material.opacity = 0.14 + pulseFast * 0.24;
        pickup.pulse.scale.setScalar(0.84 + pulseFast * 0.22);
        pickup.core.material.emissiveIntensity = 0.95 + pulse * 0.95;
        pickup.shell.material.opacity = 0.18 + pulse * 0.12;
        pickup.halo.material.opacity = 0.32 + pulse * 0.24;
        pickup.wordmark.material.opacity = 0.72 + pulse * 0.18;
    }

    function maybeCollectPickup(frameState) {
        if (!state.pickupAvailable || state.hasWeapon) {
            return;
        }
        if (frameState.carDestroyed || frameState.pickupRoundFinished) {
            return;
        }

        const deltaX = car.position.x - pickupAnchor.x;
        const deltaZ = car.position.z - pickupAnchor.z;
        const distanceSq = deltaX * deltaX + deltaZ * deltaZ;
        if (distanceSq > PICKUP_RADIUS_SQ) {
            return;
        }

        const heightDelta = Math.abs((car.position.y || 0) - layout.roofSurfaceY);
        if (heightDelta > PICKUP_HEIGHT_TOLERANCE) {
            return;
        }

        state.pickupAvailable = false;
        state.hasWeapon = true;
        state.triggerHeld = false;
        state.fireCooldown = 0;
        mount.root.visible = true;
        pickup.root.visible = false;
        state.hudX = window.innerWidth * 0.5;
        state.hudY = window.innerHeight * 0.5;
        onStatus('Lorien roof weapon online. Auto-lock engaged. Hold T to fire.', 2600);
        getAudioController()?.onRoofWeaponPickup?.();
    }

    function resolveWeaponMotionState(vehicleState) {
        const speedRatio = THREE.MathUtils.clamp(Math.abs(vehicleState?.speed || 0) / 42, 0, 1.25);
        const throttleRatio = THREE.MathUtils.clamp(Math.abs(vehicleState?.throttle || 0), 0, 1);
        const idleSway = Math.sin(state.hoverPhase * WEAPON_IDLE_SWAY_SPEED) * 0.01;
        const speedSway =
            Math.sin(state.hoverPhase * (WEAPON_SPEED_SWAY_SPEED + speedRatio * 2.2)) *
            0.012 *
            speedRatio;
        return {
            throttleRatio,
            idleSway,
            speedSway,
            recoilShift: state.recoil * 0.16,
        };
    }

    function applyWeaponBasePose(motionState) {
        if (!state.hasWeapon) {
            return;
        }
        mount.root.position.set(
            0,
            WEAPON_MOUNT_BASE_Y + motionState.idleSway * 0.3,
            WEAPON_MOUNT_BASE_Z + motionState.recoilShift
        );
        mount.weaponGroup.position.set(0, motionState.speedSway * 0.5, motionState.recoilShift);
        mount.weaponGroup.rotation.z = motionState.speedSway * 1.2;
        mount.weaponGroup.rotation.x =
            motionState.idleSway * 0.9 + motionState.throttleRatio * 0.02;
    }

    function resolveWeaponLocalOrigin(motionState, out) {
        return out.set(
            0,
            WEAPON_MOUNT_BASE_Y + motionState.idleSway * 0.3 + 0.04,
            WEAPON_MOUNT_BASE_Z + motionState.recoilShift - 1.04
        );
    }

    function isTargetWithinWeaponTraverse(targetPoint, localOrigin) {
        weaponLocalTargetPoint.copy(targetPoint);
        mountParent.worldToLocal(weaponLocalTargetPoint);
        weaponLocalAimVector.subVectors(weaponLocalTargetPoint, localOrigin);
        const aimLengthSq = weaponLocalAimVector.lengthSq();
        if (!Number.isFinite(aimLengthSq) || aimLengthSq <= 0.0001) {
            return false;
        }

        weaponLocalAimVector.multiplyScalar(1 / Math.sqrt(aimLengthSq));
        const yaw = Math.atan2(weaponLocalAimVector.x, -weaponLocalAimVector.z);
        const pitch = Math.asin(THREE.MathUtils.clamp(weaponLocalAimVector.y, -1, 1));
        return (
            Math.abs(yaw) <= WEAPON_MAX_TRAVERSE_YAW &&
            pitch <= WEAPON_MAX_TRAVERSE_PITCH_UP &&
            pitch >= -WEAPON_MAX_TRAVERSE_PITCH_DOWN
        );
    }

    function clampWeaponTargetPoint(targetPoint, motionState, out = weaponAimPoint) {
        mountParent.updateWorldMatrix(true, false);
        resolveWeaponLocalOrigin(motionState, weaponLocalOrigin);
        weaponLocalTargetPoint.copy(targetPoint);
        mountParent.worldToLocal(weaponLocalTargetPoint);
        weaponLocalAimVector.subVectors(weaponLocalTargetPoint, weaponLocalOrigin);

        const distance = weaponLocalAimVector.length();
        if (!Number.isFinite(distance) || distance <= 0.0001) {
            return out.copy(targetPoint);
        }

        weaponLocalAimVector.multiplyScalar(1 / distance);
        const yaw = Math.atan2(weaponLocalAimVector.x, -weaponLocalAimVector.z);
        const pitch = Math.asin(THREE.MathUtils.clamp(weaponLocalAimVector.y, -1, 1));
        const clampedYaw = THREE.MathUtils.clamp(
            yaw,
            -WEAPON_MAX_TRAVERSE_YAW,
            WEAPON_MAX_TRAVERSE_YAW
        );
        const clampedPitch = THREE.MathUtils.clamp(
            pitch,
            -WEAPON_MAX_TRAVERSE_PITCH_DOWN,
            WEAPON_MAX_TRAVERSE_PITCH_UP
        );

        weaponLocalAimVector.set(
            Math.sin(clampedYaw) * Math.cos(clampedPitch),
            Math.sin(clampedPitch),
            -Math.cos(clampedYaw) * Math.cos(clampedPitch)
        );

        out.copy(weaponLocalOrigin).addScaledVector(weaponLocalAimVector, distance);
        mountParent.localToWorld(out);
        return out;
    }

    function resolveAimState(gameMode = 'bots', motionState) {
        camera.getWorldPosition(weaponAimOrigin);
        camera.getWorldDirection(weaponAimDirection).normalize();
        weaponAimPoint.copy(weaponAimOrigin).addScaledVector(weaponAimDirection, CAMERA_AIM_RANGE);

        const botTrafficSystem = gameMode === 'bots' ? getBotTrafficSystem() : null;
        const lockedTarget = state.hasWeapon
            ? resolveAutoLockTarget(botTrafficSystem, motionState)
            : null;
        if (lockedTarget?.point) {
            weaponAimPoint.copy(lockedTarget.point);
        }

        if (!lockedTarget && weaponAimDirection.y < -0.05) {
            const estimatedPoint = weaponTempVectorA
                .copy(weaponAimOrigin)
                .addScaledVector(weaponAimDirection, 74);
            const groundY = getGroundHeightAt(estimatedPoint.x, estimatedPoint.z, estimatedPoint.y);
            if (Number.isFinite(groundY)) {
                const targetY = groundY + 0.38;
                const groundHitDistance = (targetY - weaponAimOrigin.y) / weaponAimDirection.y;
                if (
                    Number.isFinite(groundHitDistance) &&
                    groundHitDistance > 10 &&
                    groundHitDistance < CAMERA_AIM_RANGE
                ) {
                    weaponAimPoint
                        .copy(weaponAimOrigin)
                        .addScaledVector(weaponAimDirection, groundHitDistance);
                }
            }
        }

        if (state.hasWeapon) {
            clampWeaponTargetPoint(weaponAimPoint, motionState, weaponAimPoint);
        }

        return {
            lockedTarget,
            targetPoint: weaponAimPoint,
            aimOrigin: weaponAimOrigin,
            aimDirection: weaponAimDirection,
        };
    }

    function resolveAutoLockTarget(botTrafficSystem, motionState) {
        const staticObstacles = getStaticObstacles();
        const descriptors = botTrafficSystem?.getCollectorDescriptors?.();
        if (!Array.isArray(descriptors) || descriptors.length <= 0) {
            return null;
        }

        mountParent.updateWorldMatrix(true, false);
        resolveWeaponLocalOrigin(motionState, weaponLocalOrigin);
        const weaponLockOrigin = weaponMuzzleWorldPosition.copy(weaponLocalOrigin);
        mountParent.localToWorld(weaponLockOrigin);

        const previousLockId =
            typeof state.currentLock?.collectorId === 'string' ? state.currentLock.collectorId : '';
        const maxScreenDistanceSq = AUTO_LOCK_MAX_SCREEN_DISTANCE * AUTO_LOCK_MAX_SCREEN_DISTANCE;
        let bestTarget = null;
        let bestScore = Number.POSITIVE_INFINITY;

        for (let index = 0; index < descriptors.length; index += 1) {
            const descriptor = descriptors[index];
            if (!descriptor || descriptor.mineImmune || !descriptor.position) {
                continue;
            }

            const radius = THREE.MathUtils.clamp(
                Number(descriptor.collisionRadius || descriptor.radius) || 1.6,
                0.9,
                4.2
            );
            const targetPoint = weaponTempVectorA.copy(descriptor.position);
            targetPoint.y += Math.max(0.88, radius * 0.58 + 0.28);
            if (!isTargetWithinWeaponTraverse(targetPoint, weaponLocalOrigin)) {
                continue;
            }

            const toTarget = weaponTempVectorB.subVectors(targetPoint, weaponAimOrigin);
            const distance = toTarget.length();
            if (!Number.isFinite(distance) || distance < 4 || distance > AUTO_LOCK_RANGE) {
                continue;
            }

            toTarget.multiplyScalar(1 / Math.max(distance, 0.0001));
            const forwardDot = toTarget.dot(weaponAimDirection);
            if (forwardDot < AUTO_LOCK_MIN_FORWARD_DOT) {
                continue;
            }

            weaponHudProjection.copy(targetPoint).project(camera);
            if (
                !Number.isFinite(weaponHudProjection.x) ||
                !Number.isFinite(weaponHudProjection.y) ||
                !Number.isFinite(weaponHudProjection.z)
            ) {
                continue;
            }
            if (weaponHudProjection.z < -1 || weaponHudProjection.z > 1.08) {
                continue;
            }

            const screenDistanceSq =
                weaponHudProjection.x * weaponHudProjection.x +
                weaponHudProjection.y * weaponHudProjection.y;
            if (screenDistanceSq > maxScreenDistanceSq) {
                continue;
            }

            const traceDirection = weaponTempVectorC.copy(targetPoint).sub(weaponLockOrigin);
            const weaponDistance = traceDirection.length();
            if (!Number.isFinite(weaponDistance) || weaponDistance < 4) {
                continue;
            }
            traceDirection.multiplyScalar(1 / Math.max(weaponDistance, 0.0001));
            const traceTarget =
                botTrafficSystem?.traceWeaponTarget?.(
                    weaponLockOrigin,
                    traceDirection,
                    weaponDistance + radius + 8
                ) || null;
            if (
                traceTarget?.collectorId &&
                descriptor.id &&
                traceTarget.collectorId !== descriptor.id
            ) {
                continue;
            }
            const obstacleImpact = traceStaticObstacleImpact({
                start: weaponAimOrigin,
                end: targetPoint,
                obstacles: staticObstacles,
                ignoreOriginRadius: BULLET_MARK_MIN_DISTANCE,
            });
            if (obstacleImpact) {
                continue;
            }
            const muzzleObstacleImpact = traceStaticObstacleImpact({
                start: weaponLockOrigin,
                end: targetPoint,
                obstacles: staticObstacles,
                ignoreOriginRadius: BULLET_MARK_MIN_DISTANCE,
            });
            if (muzzleObstacleImpact) {
                continue;
            }

            let score =
                screenDistanceSq * 2.6 +
                (1 - forwardDot) * 1.8 +
                (distance / AUTO_LOCK_RANGE) * 0.65;
            if (descriptor.id && descriptor.id === previousLockId) {
                score -= 0.26;
            }
            if (score >= bestScore) {
                continue;
            }

            bestScore = score;
            bestTarget = {
                collectorId: typeof descriptor.id === 'string' ? descriptor.id : '',
                name: typeof descriptor.name === 'string' ? descriptor.name : 'Target',
                point: targetPoint.clone(),
                screenX: (weaponHudProjection.x * 0.5 + 0.5) * window.innerWidth,
                screenY: (-weaponHudProjection.y * 0.5 + 0.5) * window.innerHeight,
            };
        }

        return bestTarget;
    }

    function updateHudTracking(dt, aimState, isActive) {
        const centerX = window.innerWidth * 0.5;
        const centerY = window.innerHeight * 0.5;
        const targetX = isActive ? (aimState.lockedTarget?.screenX ?? centerX) : centerX;
        const targetY = isActive ? (aimState.lockedTarget?.screenY ?? centerY) : centerY;
        const alpha = 1 - Math.exp(-HUD_TRACKING_SNAP_SPEED * dt);
        state.hudX = THREE.MathUtils.lerp(state.hudX, targetX, alpha);
        state.hudY = THREE.MathUtils.lerp(state.hudY, targetY, alpha);
    }

    function updateWeaponMount(dt, motionState, aimState, isActive) {
        mount.root.visible = state.hasWeapon;
        if (!state.hasWeapon) {
            return;
        }

        applyWeaponBasePose(motionState);
        mount.pitchPivot.lookAt(aimState.targetPoint);

        targetReticleColor.copy(RETICLE_DEFAULT_COLOR);
        if (aimState.lockedTarget) {
            targetReticleColor.copy(state.triggerHeld ? RETICLE_LOCK_COLOR : RETICLE_HOT_COLOR);
        } else if (state.triggerHeld) {
            targetReticleColor.copy(RETICLE_HOT_COLOR);
        }
        reticleColor.lerp(targetReticleColor, 1 - Math.exp(-12 * dt));

        const pulse = 0.5 + 0.5 * Math.sin(state.lockPulse);
        const lockPulse = 0.5 + 0.5 * Math.sin(state.lockPulse * 1.6 + 0.7);
        const emissiveIntensity =
            0.65 +
            state.heat * 1.2 +
            pulse * 0.22 +
            (aimState.lockedTarget ? 0.35 + lockPulse * 0.28 : 0);

        for (let i = 0; i < mount.glowMaterials.length; i += 1) {
            const material = mount.glowMaterials[i];
            material.color.copy(reticleColor);
            if (material.emissive?.isColor) {
                material.emissive.copy(reticleColor);
            }
            if ('emissiveIntensity' in material) {
                material.emissiveIntensity = emissiveIntensity;
            }
        }
        for (let i = 0; i < mount.holoMaterials.length; i += 1) {
            const material = mount.holoMaterials[i];
            material.color.copy(reticleColor);
            material.opacity =
                0.28 +
                pulse * 0.12 +
                (aimState.lockedTarget ? 0.2 + lockPulse * 0.16 : 0) +
                state.heat * 0.08;
        }
        const hotBlend = THREE.MathUtils.clamp(state.heat * 0.8, 0, 1);
        for (let i = 0; i < mount.metalMaterials.length; i += 1) {
            const material = mount.metalMaterials[i];
            weaponTempColor.copy(WEAPON_METAL_COLOR).lerp(WEAPON_HOT_COLOR, hotBlend * 0.24);
            material.color.copy(weaponTempColor);
            material.emissive.copy(WEAPON_EDGE_COLOR).lerp(WEAPON_HOT_COLOR, hotBlend * 0.72);
            material.emissiveIntensity = 0.14 + state.heat * 0.4;
        }

        const sightScale = isActive ? 1 : 0.9;
        const lockScale = aimState.lockedTarget ? 1 + lockPulse * 0.12 : 1;
        mount.holoReticle.scale.setScalar(sightScale * lockScale);
        mount.holoHalo.scale.setScalar(0.92 + pulse * 0.14 + state.heat * 0.08);
    }

    function fireShot(gameMode, aimState) {
        if (!state.hasWeapon) {
            return;
        }

        state.shotSequence += 1;
        state.recoil = 1;
        mount.muzzleAnchor.getWorldPosition(weaponMuzzleWorldPosition);

        weaponShotDirection.subVectors(aimState.targetPoint, weaponMuzzleWorldPosition).normalize();
        if (weaponShotDirection.lengthSq() < 0.0001) {
            weaponShotDirection.set(0, 0, -1).applyQuaternion(car.quaternion).normalize();
        }

        const botTrafficSystem = gameMode === 'bots' ? getBotTrafficSystem() : null;
        const hitTarget =
            botTrafficSystem?.traceWeaponTarget?.(
                weaponMuzzleWorldPosition,
                weaponShotDirection,
                SHOT_RANGE
            ) || null;
        const shotEndPoint = weaponTempVectorA
            .copy(weaponMuzzleWorldPosition)
            .addScaledVector(weaponShotDirection, SHOT_RANGE);
        if (hitTarget?.point) {
            shotEndPoint.copy(hitTarget.point);
        }

        const obstacleImpact = traceStaticObstacleImpact({
            start: weaponMuzzleWorldPosition,
            end: shotEndPoint,
            obstacles: getStaticObstacles(),
            ignoreOriginRadius: BULLET_MARK_MIN_DISTANCE,
        });
        let resolvedHitTarget = hitTarget;
        let obstacleNormal = null;
        if (obstacleImpact) {
            shotEndPoint.copy(obstacleImpact.point);
            resolvedHitTarget = null;
            obstacleNormal = obstacleImpact.normal.clone();
        }

        spawnMuzzleFlash(weaponMuzzleWorldPosition, weaponShotDirection);
        spawnProjectile({
            start: weaponMuzzleWorldPosition,
            end: shotEndPoint,
            direction: weaponShotDirection,
            hitTarget: resolvedHitTarget,
            obstacleNormal,
            gameMode,
        });
        getAudioController()?.onRoofWeaponShot?.({
            locked: Boolean(aimState.lockedTarget),
            heat: state.heat,
        });
    }

    function spawnProjectile({
        start,
        end,
        direction,
        hitTarget = null,
        obstacleNormal = null,
        gameMode = 'bots',
    } = {}) {
        while (activeProjectiles.length >= MAX_ACTIVE_PROJECTILES) {
            const entry = activeProjectiles.shift();
            disposeProjectile(entry);
        }

        const group = new THREE.Group();
        const coreMaterial = new THREE.MeshBasicMaterial({
            color: hitTarget ? 0xfff0c3 : 0xd8fbff,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        });
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: hitTarget ? 0xff9463 : 0x67dbff,
            transparent: true,
            opacity: 0.42,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
            side: THREE.DoubleSide,
        });
        const tipMaterial = new THREE.MeshBasicMaterial({
            color: hitTarget ? 0xfff6dd : 0xf7ffff,
            transparent: true,
            opacity: 0.96,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        });
        const core = new THREE.Mesh(projectileCoreGeometry, coreMaterial);
        const glow = new THREE.Mesh(projectileGlowGeometry, glowMaterial);
        const tip = new THREE.Mesh(projectileTipGeometry, tipMaterial);
        tip.position.y = PROJECTILE_LENGTH * 0.44;
        group.add(glow, core, tip);
        group.position.copy(start);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        effectRoot.add(group);
        activeProjectiles.push({
            group,
            coreMaterial,
            glowMaterial,
            tipMaterial,
            life: PROJECTILE_MAX_LIFETIME_SEC,
            direction: direction.clone(),
            impactPoint: end.clone(),
            remainingDistance: Math.max(0.1, start.distanceTo(end)),
            speed: PROJECTILE_SPEED,
            targetCollectorId:
                typeof hitTarget?.collectorId === 'string' ? hitTarget.collectorId : '',
            targetName: typeof hitTarget?.name === 'string' ? hitTarget.name : 'Target',
            obstacleNormal: obstacleNormal?.clone?.() || null,
            gameMode,
        });
    }

    function spawnImpact(position, direction, isHit) {
        while (activeImpacts.length >= MAX_ACTIVE_IMPACTS) {
            const entry = activeImpacts.shift();
            disposeImpact(entry);
        }

        const group = new THREE.Group();
        group.position.copy(position);
        group.lookAt(weaponTempVectorB.copy(position).add(direction));

        const ringMaterial = new THREE.MeshBasicMaterial({
            color: isHit ? 0xffb48c : 0x8ee7ff,
            transparent: true,
            opacity: 0.92,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        });
        const ring = new THREE.Mesh(impactRingGeometry, ringMaterial);
        group.add(ring);

        const glowMaterial = new THREE.MeshBasicMaterial({
            map: pickupGlowTexture,
            color: isHit ? 0xff8262 : 0x61d7ff,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        });
        const glow = new THREE.Mesh(impactGlowGeometry, glowMaterial);
        group.add(glow);
        effectRoot.add(group);

        activeImpacts.push({
            group,
            ring,
            glow,
            ringMaterial,
            glowMaterial,
            life: IMPACT_LIFETIME_SEC,
            ttl: IMPACT_LIFETIME_SEC,
        });
    }

    function spawnBulletMark(position, normal, isHit = false) {
        if (!position || !normal) {
            return;
        }
        while (activeBulletMarks.length >= MAX_ACTIVE_BULLET_MARKS) {
            const entry = activeBulletMarks.shift();
            disposeBulletMark(entry);
        }

        const impactNormal = weaponTempVectorB.copy(normal).normalize();
        if (impactNormal.lengthSq() <= 0.0001) {
            return;
        }

        const material = new THREE.MeshBasicMaterial({
            map: bulletMarkTexture,
            color: isHit ? 0x6b5a52 : 0x4b4340,
            transparent: true,
            opacity: isHit ? 0.82 : 0.74,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
            side: THREE.DoubleSide,
            toneMapped: false,
        });
        const mesh = new THREE.Mesh(bulletMarkGeometry, material);
        mesh.position.copy(position).addScaledVector(impactNormal, 0.028);
        mesh.lookAt(weaponTempVectorC.copy(mesh.position).add(impactNormal));
        mesh.rotation.z = Math.random() * Math.PI * 2;
        const size = isHit ? 1.08 : 1;
        mesh.scale.setScalar(size);
        effectRoot.add(mesh);

        activeBulletMarks.push({
            mesh,
            material,
            life: BULLET_MARK_LIFETIME_SEC,
            ttl: BULLET_MARK_LIFETIME_SEC,
        });
    }

    function spawnMuzzleFlash(position, direction) {
        while (activeMuzzleFlashes.length >= MAX_ACTIVE_MUZZLE_FLASHES) {
            const entry = activeMuzzleFlashes.shift();
            disposeMuzzleFlash(entry);
        }

        const group = new THREE.Group();
        group.position.copy(position);
        group.lookAt(weaponTempVectorC.copy(position).add(direction));

        const glowMaterial = new THREE.MeshBasicMaterial({
            map: pickupGlowTexture,
            color: 0xffa468,
            transparent: true,
            opacity: 0.84,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        });
        const coreMaterial = new THREE.MeshBasicMaterial({
            color: 0xfff2d6,
            transparent: true,
            opacity: 0.92,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        });
        const glow = new THREE.Mesh(muzzleFlashGlowGeometry, glowMaterial);
        const core = new THREE.Mesh(muzzleFlashCoreGeometry, coreMaterial);
        core.rotation.z = Math.PI * 0.25;
        group.add(glow, core);
        effectRoot.add(group);

        activeMuzzleFlashes.push({
            group,
            glow,
            core,
            glowMaterial,
            coreMaterial,
            life: MUZZLE_FLASH_LIFETIME_SEC,
            ttl: MUZZLE_FLASH_LIFETIME_SEC,
        });
    }

    function updateEffects(dt) {
        for (let i = activeProjectiles.length - 1; i >= 0; i -= 1) {
            const projectile = activeProjectiles[i];
            projectile.life -= dt;
            const travelDistance = Math.min(
                projectile.remainingDistance,
                Math.max(0, projectile.speed * dt)
            );
            projectile.group.position.addScaledVector(projectile.direction, travelDistance);
            projectile.remainingDistance -= travelDistance;

            const pulse =
                0.86 + Math.sin((state.shotSequence + i) * 0.9 + projectile.life * 34) * 0.08;
            projectile.group.scale.setScalar(pulse);
            projectile.coreMaterial.opacity = 0.92;
            projectile.glowMaterial.opacity =
                0.42 + Math.max(0, 1 - projectile.life / PROJECTILE_MAX_LIFETIME_SEC) * 0.12;
            projectile.tipMaterial.opacity = 0.95;

            if (projectile.remainingDistance > 0.025 && projectile.life > 0) {
                continue;
            }
            resolveProjectileImpact(projectile);
            disposeProjectile(projectile);
            activeProjectiles.splice(i, 1);
        }

        for (let i = activeImpacts.length - 1; i >= 0; i -= 1) {
            const impact = activeImpacts[i];
            impact.life -= dt;
            if (impact.life <= 0) {
                disposeImpact(impact);
                activeImpacts.splice(i, 1);
                continue;
            }
            const normalizedLife = impact.life / impact.ttl;
            const inverse = 1 - normalizedLife;
            impact.ring.scale.setScalar(0.8 + inverse * 2.1);
            impact.glow.scale.setScalar(0.7 + inverse * 1.35);
            impact.ringMaterial.opacity = normalizedLife * 0.95;
            impact.glowMaterial.opacity = normalizedLife * 0.72;
        }

        for (let i = activeMuzzleFlashes.length - 1; i >= 0; i -= 1) {
            const flash = activeMuzzleFlashes[i];
            flash.life -= dt;
            if (flash.life <= 0) {
                disposeMuzzleFlash(flash);
                activeMuzzleFlashes.splice(i, 1);
                continue;
            }
            const normalizedLife = flash.life / flash.ttl;
            flash.group.scale.setScalar(0.82 + (1 - normalizedLife) * 0.46);
            flash.glowMaterial.opacity = normalizedLife * 0.88;
            flash.coreMaterial.opacity = normalizedLife;
            flash.group.rotation.z += dt * 12;
        }

        for (let i = activeBulletMarks.length - 1; i >= 0; i -= 1) {
            const mark = activeBulletMarks[i];
            mark.life -= dt;
            if (mark.life <= 0) {
                disposeBulletMark(mark);
                activeBulletMarks.splice(i, 1);
                continue;
            }
            const normalizedLife = mark.life / mark.ttl;
            mark.material.opacity = Math.min(0.82, normalizedLife * 0.78 + 0.04);
        }
    }

    function resolveProjectileImpact(projectile) {
        if (!projectile) {
            return;
        }

        spawnImpact(
            projectile.impactPoint,
            projectile.direction,
            Boolean(projectile.targetCollectorId)
        );
        if (projectile.obstacleNormal) {
            spawnBulletMark(
                projectile.impactPoint,
                projectile.obstacleNormal,
                Boolean(projectile.targetCollectorId)
            );
        }
        const impactDistanceMeters = Number(projectile.impactPoint.distanceTo?.(car.position)) || 0;

        if (projectile.gameMode !== 'bots' || !projectile.targetCollectorId) {
            getAudioController()?.onRoofWeaponImpact?.({
                hit: Boolean(projectile.targetCollectorId),
                destroyed: false,
                position: projectile.impactPoint,
                distanceMeters: impactDistanceMeters,
            });
            return;
        }

        const botTrafficSystem = getBotTrafficSystem();
        if (!botTrafficSystem?.triggerWeaponHit) {
            getAudioController()?.onRoofWeaponImpact?.({
                hit: Boolean(projectile.targetCollectorId),
                destroyed: false,
                position: projectile.impactPoint,
                distanceMeters: impactDistanceMeters,
            });
            return;
        }

        const deltaX = projectile.impactPoint.x - car.position.x;
        const deltaZ = projectile.impactPoint.z - car.position.z;
        const distanceSq = deltaX * deltaX + deltaZ * deltaZ;
        const debrisSpawnBudget =
            distanceSq > BOT_DEBRIS_MID_DISTANCE_SQ
                ? BOT_DEBRIS_BUDGET_FAR
                : distanceSq > BOT_DEBRIS_NEAR_DISTANCE_SQ
                  ? BOT_DEBRIS_BUDGET_MID
                  : BOT_DEBRIS_BUDGET_NEAR;
        const hitResult = botTrafficSystem.triggerWeaponHit(projectile.targetCollectorId, {
            crashContext: {
                debrisSpawnBudget,
                impactSpeed: 48,
            },
            hitPoint: projectile.impactPoint,
            shotDirection: projectile.direction,
        });
        getAudioController()?.onRoofWeaponImpact?.({
            hit: Boolean(projectile.targetCollectorId),
            destroyed: Boolean(hitResult?.destroyed),
            position: projectile.impactPoint,
            distanceMeters: impactDistanceMeters,
        });
        if (!hitResult?.destroyed) {
            return;
        }

        onBotDestroyed({
            targetCollectorId: projectile.targetCollectorId,
            targetName: projectile.targetName,
            position: projectile.impactPoint.clone(),
        });
    }

    function syncHud({ visible, hasWeapon, triggerHeld, locked, heat, screenX, screenY }) {
        if (!hud.root) {
            return;
        }
        hud.root.hidden = !visible || !hasWeapon;
        hud.root.dataset.armed = visible && hasWeapon ? 'true' : 'false';
        hud.root.dataset.firing = triggerHeld ? 'true' : 'false';
        hud.root.dataset.locked = locked ? 'true' : 'false';
        hud.root.style.left = `${Math.round(Number(screenX) || window.innerWidth * 0.5)}px`;
        hud.root.style.top = `${Math.round(Number(screenY) || window.innerHeight * 0.5)}px`;
        hud.root.style.setProperty('--weapon-heat', THREE.MathUtils.clamp(heat, 0, 1).toFixed(3));
        if (hud.hint) {
            hud.hint.textContent = locked
                ? triggerHeld
                    ? 'LOCKED / HOLD T'
                    : 'AUTO LOCK / HOLD T'
                : 'SEEKING / HOLD T';
        }
    }

    function activatePickup() {
        state.pickupAvailable = true;
        pickup.root.visible = true;
    }

    function hideWeapon() {
        state.hasWeapon = false;
        mount.root.visible = false;
    }

    function despawnPickup(respawn = true) {
        state.pickupAvailable = false;
        pickup.root.visible = false;
        if (respawn) {
            state.pickupRespawnTimer = PICKUP_RESPAWN_DELAY_SEC;
        }
    }

    function clearEffects() {
        while (activeProjectiles.length > 0) {
            disposeProjectile(activeProjectiles.pop());
        }
        while (activeImpacts.length > 0) {
            disposeImpact(activeImpacts.pop());
        }
        while (activeMuzzleFlashes.length > 0) {
            disposeMuzzleFlash(activeMuzzleFlashes.pop());
        }
        while (activeBulletMarks.length > 0) {
            disposeBulletMark(activeBulletMarks.pop());
        }
    }
}

function createRoofPickup(anchor) {
    const root = new THREE.Group();
    root.name = 'lorien_roof_weapon_pickup';
    root.position.copy(anchor);

    const standMaterial = new THREE.MeshStandardMaterial({
        color: 0x101923,
        emissive: 0x16314a,
        emissiveIntensity: 0.22,
        metalness: 0.78,
        roughness: 0.28,
    });
    const stand = new THREE.Mesh(pickupStandGeometry, standMaterial);
    stand.position.y = -0.82;
    root.add(stand);

    const beamMaterial = new THREE.MeshBasicMaterial({
        color: 0x57deff,
        transparent: true,
        opacity: 0.26,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
    });
    const beam = new THREE.Mesh(pickupBeamGeometry, beamMaterial);
    beam.position.y = 1.02;
    root.add(beam);

    const pulseMaterial = new THREE.MeshBasicMaterial({
        color: 0x72ecff,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
    });
    const pulse = new THREE.Mesh(pickupPulseGeometry, pulseMaterial);
    pulse.position.y = -0.61;
    root.add(pulse);

    const haloMaterial = new THREE.MeshBasicMaterial({
        color: 0x80e7ff,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
    });
    const halo = new THREE.Mesh(pickupHaloGeometry, haloMaterial);
    halo.rotation.x = -Math.PI * 0.5;
    halo.position.y = -0.58;
    root.add(halo);

    const ringMaterialA = new THREE.MeshBasicMaterial({
        color: 0x7ee7ff,
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
    });
    const ringMaterialB = ringMaterialA.clone();
    const ringMaterialC = ringMaterialA.clone();
    const ringA = new THREE.Mesh(pickupRingGeometry, ringMaterialA);
    ringA.rotation.y = Math.PI * 0.5;
    root.add(ringA);
    const ringB = new THREE.Mesh(pickupRingGeometry, ringMaterialB);
    ringB.rotation.x = Math.PI * 0.5;
    root.add(ringB);
    const ringC = new THREE.Mesh(pickupRingGeometry, ringMaterialC);
    ringC.rotation.z = Math.PI * 0.5;
    root.add(ringC);

    const coreMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x103748,
        emissive: 0x70e6ff,
        emissiveIntensity: 1.2,
        metalness: 0.4,
        roughness: 0.1,
        transmission: 0.12,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
    });
    const core = new THREE.Mesh(pickupCoreGeometry, coreMaterial);
    root.add(core);

    const shellMaterial = new THREE.MeshStandardMaterial({
        color: 0xa4f2ff,
        emissive: 0x64dfff,
        emissiveIntensity: 0.24,
        metalness: 0.12,
        roughness: 0.22,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const shell = new THREE.Mesh(pickupShellGeometry, shellMaterial);
    root.add(shell);

    const wordmarkMaterial = new THREE.MeshBasicMaterial({
        map: pickupWordmarkTexture,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
    });
    const wordmark = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.44), wordmarkMaterial);
    wordmark.position.set(0, 1.4, 0);
    root.add(wordmark);

    return {
        root,
        core,
        shell,
        beam,
        pulse,
        halo,
        ringA,
        ringB,
        ringC,
        wordmark,
    };
}

function createWeaponMount() {
    const root = new THREE.Group();
    root.name = 'lorien_roof_weapon_mount';

    const pitchPivot = new THREE.Group();
    root.add(pitchPivot);

    const weaponGroup = new THREE.Group();
    pitchPivot.add(weaponGroup);

    const metalMaterials = [];
    const glowMaterials = [];
    const holoMaterials = [];

    const baseMaterial = new THREE.MeshStandardMaterial({
        color: WEAPON_METAL_COLOR,
        emissive: 0x20384f,
        emissiveIntensity: 0.14,
        metalness: 0.88,
        roughness: 0.18,
    });
    metalMaterials.push(baseMaterial);

    const base = new THREE.Mesh(weaponBodyGeometry, baseMaterial);
    base.position.set(0, 0.02, -0.12);
    weaponGroup.add(base);

    const upperMaterial = baseMaterial.clone();
    metalMaterials.push(upperMaterial);
    const upper = new THREE.Mesh(weaponUpperGeometry, upperMaterial);
    upper.position.set(0, 0.12, -0.08);
    weaponGroup.add(upper);

    const mountMaterial = baseMaterial.clone();
    metalMaterials.push(mountMaterial);
    const mountBlock = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.22), mountMaterial);
    mountBlock.position.set(0, -0.02, 0.26);
    weaponGroup.add(mountBlock);

    const barrelMaterial = baseMaterial.clone();
    metalMaterials.push(barrelMaterial);
    [-0.11, 0.11].forEach((offsetX) => {
        const barrel = new THREE.Mesh(weaponBarrelGeometry, barrelMaterial);
        barrel.rotation.x = Math.PI * 0.5;
        barrel.position.set(offsetX, 0.04, -0.58);
        weaponGroup.add(barrel);

        const muzzleRingMaterial = new THREE.MeshBasicMaterial({
            color: 0x82eaff,
            transparent: true,
            opacity: 0.56,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        });
        glowMaterials.push(muzzleRingMaterial);
        const muzzleRing = new THREE.Mesh(weaponMuzzleRingGeometry, muzzleRingMaterial);
        muzzleRing.position.set(offsetX, 0.04, -1.04);
        muzzleRing.rotation.x = Math.PI * 0.5;
        weaponGroup.add(muzzleRing);
    });

    [-1, 1].forEach((direction) => {
        const railMaterial = new THREE.MeshStandardMaterial({
            color: 0x213344,
            emissive: 0x7ce6ff,
            emissiveIntensity: 0.44,
            metalness: 0.62,
            roughness: 0.16,
        });
        metalMaterials.push(railMaterial);
        glowMaterials.push(railMaterial);
        const rail = new THREE.Mesh(weaponRailGeometry, railMaterial);
        rail.position.set(direction * 0.2, 0.06, -0.28);
        weaponGroup.add(rail);

        const coilMaterial = new THREE.MeshBasicMaterial({
            color: 0x78e4ff,
            transparent: true,
            opacity: 0.68,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        });
        glowMaterials.push(coilMaterial);
        const coil = new THREE.Mesh(weaponCoilGeometry, coilMaterial);
        coil.position.set(direction * 0.22, 0.02, -0.42);
        coil.rotation.y = Math.PI * 0.5;
        weaponGroup.add(coil);
    });

    const sightBaseMaterial = baseMaterial.clone();
    metalMaterials.push(sightBaseMaterial);
    const sightBase = new THREE.Mesh(weaponSightFrameGeometry, sightBaseMaterial);
    sightBase.position.set(0, 0.19, -0.36);
    weaponGroup.add(sightBase);

    const holoMaterial = new THREE.MeshBasicMaterial({
        map: reticleTexture,
        color: 0x78e5ff,
        transparent: true,
        opacity: 0.52,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
    });
    holoMaterials.push(holoMaterial);
    const holoReticle = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), holoMaterial);
    holoReticle.position.set(0, 0.19, -0.84);
    holoReticle.rotation.y = Math.PI;
    weaponGroup.add(holoReticle);

    const holoHaloMaterial = new THREE.MeshBasicMaterial({
        map: pickupGlowTexture,
        color: 0x61d5ff,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
    });
    holoMaterials.push(holoHaloMaterial);
    const holoHalo = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), holoHaloMaterial);
    holoHalo.position.set(0, 0.19, -0.86);
    holoHalo.rotation.y = Math.PI;
    weaponGroup.add(holoHalo);

    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 0.04, -1.04);
    pitchPivot.add(muzzleAnchor);

    return {
        root,
        pitchPivot,
        weaponGroup,
        muzzleAnchor,
        holoReticle,
        holoHalo,
        metalMaterials,
        glowMaterials,
        holoMaterials,
    };
}

function disposeProjectile(entry) {
    if (!entry?.group) {
        return;
    }
    entry.group.parent?.remove(entry.group);
}

function disposeImpact(entry) {
    if (!entry?.group) {
        return;
    }
    entry.group.parent?.remove(entry.group);
}

function disposeMuzzleFlash(entry) {
    if (!entry?.group) {
        return;
    }
    entry.group.parent?.remove(entry.group);
}

function disposeBulletMark(entry) {
    if (!entry?.mesh) {
        return;
    }
    entry.mesh.parent?.remove(entry.mesh);
}

function traceStaticObstacleImpact({
    start = null,
    end = null,
    obstacles = [],
    ignoreOriginRadius = 0,
} = {}) {
    if (!start || !end || !Array.isArray(obstacles) || obstacles.length <= 0) {
        return null;
    }

    const startX = Number(start.x);
    const startY = Number(start.y);
    const startZ = Number(start.z);
    const endX = Number(end.x);
    const endY = Number(end.y);
    const endZ = Number(end.z);
    if (![startX, startY, startZ, endX, endY, endZ].every(Number.isFinite)) {
        return null;
    }

    let bestImpact = null;
    for (let index = 0; index < obstacles.length; index += 1) {
        const obstacle = obstacles[index];
        if (!isObstacleActiveAtHeight(obstacle, startY, endY)) {
            continue;
        }

        let impact = null;
        if (obstacle?.type === 'circle') {
            impact = segmentImpactCircleXZ({
                startX,
                startZ,
                endX,
                endZ,
                centerX: Number(obstacle.x),
                centerZ: Number(obstacle.z),
                radius: Math.max(0, Number(obstacle.radius) || 0),
            });
        } else if (obstacle?.type === 'aabb') {
            impact = segmentImpactAabbXZ({
                startX,
                startZ,
                endX,
                endZ,
                minX: Number(obstacle.minX),
                maxX: Number(obstacle.maxX),
                minZ: Number(obstacle.minZ),
                maxZ: Number(obstacle.maxZ),
            });
        }

        if (!impact) {
            continue;
        }

        const distance = Math.hypot(impact.x - startX, impact.z - startZ);
        if (distance <= Math.max(0, Number(ignoreOriginRadius) || 0)) {
            continue;
        }

        const impactY = THREE.MathUtils.lerp(startY, endY, impact.t);
        const minY = Number.isFinite(obstacle?.minY)
            ? Number(obstacle.minY)
            : Number.NEGATIVE_INFINITY;
        const maxY = Number.isFinite(obstacle?.maxY)
            ? Number(obstacle.maxY)
            : Number.POSITIVE_INFINITY;
        if (impactY < minY || impactY > maxY) {
            continue;
        }

        if (!bestImpact || impact.t < bestImpact.t) {
            bestImpact = {
                t: impact.t,
                point: new THREE.Vector3(impact.x, impactY, impact.z),
                normal: new THREE.Vector3(impact.normalX, 0, impact.normalZ).normalize(),
                obstacle,
            };
        }
    }

    return bestImpact;
}

function isObstacleActiveAtHeight(obstacle, startY = 0, endY = 0) {
    if (!obstacle) {
        return false;
    }
    const segmentMinY = Math.min(startY, endY);
    const segmentMaxY = Math.max(startY, endY);
    const minY = Number.isFinite(obstacle.minY) ? Number(obstacle.minY) : Number.NEGATIVE_INFINITY;
    const maxY = Number.isFinite(obstacle.maxY) ? Number(obstacle.maxY) : Number.POSITIVE_INFINITY;
    return segmentMaxY >= minY && segmentMinY <= maxY;
}

function segmentImpactCircleXZ({
    startX = 0,
    startZ = 0,
    endX = 0,
    endZ = 0,
    centerX = 0,
    centerZ = 0,
    radius = 0,
} = {}) {
    if (
        ![startX, startZ, endX, endZ, centerX, centerZ, radius].every(Number.isFinite) ||
        radius <= 0
    ) {
        return null;
    }

    const dirX = endX - startX;
    const dirZ = endZ - startZ;
    const originX = startX - centerX;
    const originZ = startZ - centerZ;
    const a = dirX * dirX + dirZ * dirZ;
    if (a <= 1e-8) {
        return null;
    }
    const b = 2 * (originX * dirX + originZ * dirZ);
    const c = originX * originX + originZ * originZ - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
        return null;
    }

    const root = Math.sqrt(discriminant);
    const tNear = (-b - root) / (2 * a);
    const tFar = (-b + root) / (2 * a);
    const t = tNear >= 0 && tNear <= 1 ? tNear : tFar >= 0 && tFar <= 1 ? tFar : null;
    if (t === null) {
        return null;
    }

    const x = startX + dirX * t;
    const z = startZ + dirZ * t;
    const normalX = x - centerX;
    const normalZ = z - centerZ;
    const normalLength = Math.hypot(normalX, normalZ) || 1;
    return {
        t,
        x,
        z,
        normalX: normalX / normalLength,
        normalZ: normalZ / normalLength,
    };
}

function segmentImpactAabbXZ({
    startX = 0,
    startZ = 0,
    endX = 0,
    endZ = 0,
    minX = 0,
    maxX = 0,
    minZ = 0,
    maxZ = 0,
} = {}) {
    if (
        ![startX, startZ, endX, endZ, minX, maxX, minZ, maxZ].every(Number.isFinite) ||
        minX > maxX ||
        minZ > maxZ
    ) {
        return null;
    }

    const dirX = endX - startX;
    const dirZ = endZ - startZ;
    let tMin = 0;
    let tMax = 1;
    let hitNormalX = 0;
    let hitNormalZ = 0;

    if (Math.abs(dirX) <= 1e-8) {
        if (startX < minX || startX > maxX) {
            return null;
        }
    } else {
        const invX = 1 / dirX;
        let tx1 = (minX - startX) * invX;
        let tx2 = (maxX - startX) * invX;
        let nearNormalX = -1;
        if (tx1 > tx2) {
            [tx1, tx2] = [tx2, tx1];
            nearNormalX = 1;
        }
        if (tx1 > tMin) {
            tMin = tx1;
            hitNormalX = nearNormalX;
            hitNormalZ = 0;
        }
        tMax = Math.min(tMax, tx2);
        if (tMin > tMax) {
            return null;
        }
    }

    if (Math.abs(dirZ) <= 1e-8) {
        if (startZ < minZ || startZ > maxZ) {
            return null;
        }
    } else {
        const invZ = 1 / dirZ;
        let tz1 = (minZ - startZ) * invZ;
        let tz2 = (maxZ - startZ) * invZ;
        let nearNormalZ = -1;
        if (tz1 > tz2) {
            [tz1, tz2] = [tz2, tz1];
            nearNormalZ = 1;
        }
        if (tz1 > tMin) {
            tMin = tz1;
            hitNormalX = 0;
            hitNormalZ = nearNormalZ;
        }
        tMax = Math.min(tMax, tz2);
        if (tMin > tMax) {
            return null;
        }
    }

    if (tMin < 0 || tMin > 1) {
        return null;
    }

    return {
        t: tMin,
        x: startX + dirX * tMin,
        z: startZ + dirZ * tMin,
        normalX: hitNormalX,
        normalZ: hitNormalZ,
    };
}

function ensureWeaponHud() {
    let root = document.getElementById('roofWeaponHud');
    if (!root) {
        root = document.createElement('div');
        root.id = 'roofWeaponHud';
        root.hidden = true;
        root.setAttribute('aria-hidden', 'true');
        root.innerHTML = `
            <div class="roofWeaponHudReticle">
                <div class="roofWeaponHudCore"></div>
                <div class="roofWeaponHudRing"></div>
                <div class="roofWeaponHudArc roofWeaponHudArc--a"></div>
                <div class="roofWeaponHudArc roofWeaponHudArc--b"></div>
                <div class="roofWeaponHudCross roofWeaponHudCross--h"></div>
                <div class="roofWeaponHudCross roofWeaponHudCross--v"></div>
            </div>
            <div class="roofWeaponHudMeta">
                <div class="roofWeaponHudLabel">LORIEN VX-9</div>
                <div class="roofWeaponHudHint">AUTO LOCK / HOLD T</div>
            </div>
        `;
        document.body.append(root);
    }
    return {
        root,
        hint: root.querySelector('.roofWeaponHudHint'),
    };
}

function createSoftGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.22, 'rgba(194,245,255,0.92)');
    gradient.addColorStop(0.52, 'rgba(94,208,255,0.28)');
    gradient.addColorStop(1, 'rgba(94,208,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function createReticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width * 0.5;
    const centerY = canvas.height * 0.5;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(173, 246, 255, 0.96)';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 148, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(centerX - 30, centerY);
    ctx.lineTo(centerX + 30, centerY);
    ctx.moveTo(centerX, centerY - 30);
    ctx.lineTo(centerX, centerY + 30);
    ctx.stroke();

    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(centerX - 104, centerY);
    ctx.lineTo(centerX - 56, centerY);
    ctx.moveTo(centerX + 56, centerY);
    ctx.lineTo(centerX + 104, centerY);
    ctx.moveTo(centerX, centerY - 104);
    ctx.lineTo(centerX, centerY - 56);
    ctx.moveTo(centerX, centerY + 56);
    ctx.lineTo(centerX, centerY + 104);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function createBulletMarkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const outer = ctx.createRadialGradient(128, 128, 10, 128, 128, 108);
    outer.addColorStop(0, 'rgba(0,0,0,0.9)');
    outer.addColorStop(0.18, 'rgba(18,16,15,0.9)');
    outer.addColorStop(0.45, 'rgba(58,46,41,0.48)');
    outer.addColorStop(0.82, 'rgba(22,18,16,0.12)');
    outer.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = outer;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = 'rgba(196, 142, 98, 0.42)';
    ctx.lineWidth = 4;
    for (let index = 0; index < 6; index += 1) {
        const angle = (Math.PI * 2 * index) / 6 + 0.18;
        ctx.beginPath();
        ctx.moveTo(128, 128);
        ctx.lineTo(128 + Math.cos(angle) * 48, 128 + Math.sin(angle) * 48);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function createPickupWordmarkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 220;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#7bedff');
    gradient.addColorStop(0.55, '#f8fdff');
    gradient.addColorStop(1, '#96fbff');
    ctx.font = "900 96px 'Orbitron', 'Segoe UI', sans-serif";
    ctx.shadowColor = 'rgba(91, 224, 255, 0.9)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = gradient;
    ctx.fillText('LORIEN VX-9', canvas.width * 0.5, canvas.height * 0.42);

    ctx.shadowBlur = 0;
    ctx.font = "700 30px 'Sora', 'Segoe UI', sans-serif";
    ctx.fillStyle = 'rgba(213, 241, 255, 0.92)';
    ctx.fillText('AUTOMATIC PRECISION PLATFORM', canvas.width * 0.5, canvas.height * 0.76);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function createNoopWeaponSystem() {
    return {
        update() {},
        setTriggerHeld() {},
        resetRound() {},
        onPlayerDestroyed() {},
        hasWeapon() {
            return false;
        },
    };
}
