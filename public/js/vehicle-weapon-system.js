import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import {
    appendLorienVelmoreDoorTraceObstacles,
    applyLorienVelmoreDoorWeaponImpact,
    resolveStoreInteriorAttackDirective,
} from './environment/buildings.js';
import { getCameraViewMode } from './camera.js';
import { getLorienVelmoreRoofLiftLayout } from './environment/lorien-gallery.js';
import {
    arePositionsSeparatedByUndergroundParking,
    UNDERGROUND_PARKING_LAYOUT,
} from './environment/underground-parking.js';

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
const AUTO_LOCK_SCREEN_SCORE_WEIGHT = 2.6;
const AUTO_LOCK_ZOOM_SCREEN_SCORE_WEIGHT = 5.1;
const AUTO_LOCK_FORWARD_SCORE_WEIGHT = 1.8;
const AUTO_LOCK_ZOOM_FORWARD_SCORE_WEIGHT = 1.15;
const AUTO_LOCK_DISTANCE_SCORE_WEIGHT = 0.65;
const AUTO_LOCK_ZOOM_DISTANCE_SCORE_WEIGHT = 0.42;
const AUTO_LOCK_SAMPLE_SCORE_PRIORITY_STEP = 0.00085;
const CHASE_CAMERA_VIEW_MODE = 6;
const SCREEN_SPACE_WEAPON_HUD_ENABLED = false;
const DEFAULT_HUD_PROFILE = Object.freeze({
    aimNdcX: 0,
    aimNdcY: 0,
    hudScale: 1,
    autoLockScreenDistance: AUTO_LOCK_MAX_SCREEN_DISTANCE,
});
const DEFAULT_ZOOM_HUD_PROFILE = Object.freeze({
    aimNdcX: 0,
    aimNdcY: 0,
    hudScale: 0.7,
    autoLockScreenDistance: AUTO_LOCK_MAX_SCREEN_DISTANCE,
});
const CHASE_CAMERA_HUD_PROFILE = Object.freeze({
    aimNdcX: 0,
    aimNdcY: 0.18,
    hudScale: 0.82,
    autoLockScreenDistance: AUTO_LOCK_MAX_SCREEN_DISTANCE,
});
const CHASE_CAMERA_ZOOM_HUD_PROFILE = Object.freeze({
    aimNdcX: 0,
    aimNdcY: 0.18,
    hudScale: 0.62,
    autoLockScreenDistance: AUTO_LOCK_MAX_SCREEN_DISTANCE,
});
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
const MAX_ACTIVE_MUZZLE_FLASHES = 10;
const MAX_ACTIVE_BULLET_MARKS = 32;
const PROJECTILE_SPEED = 182;
const LOCKED_ZOOM_PROJECTILE_SPEED = 960;
const PROJECTILE_LENGTH = 0.72;
const PROJECTILE_MAX_LIFETIME_SEC = 1.4;
const MUZZLE_FLASH_LIFETIME_SEC = 0.085;
const MUZZLE_SMOKE_LIFETIME_SEC = 0.22;
const IMPACT_LIFETIME_SEC = 0.18;
const BULLET_MARK_LIFETIME_SEC = 14;
const BULLET_MARK_MIN_DISTANCE = 0.9;
const BOT_DEBRIS_BUDGET_NEAR = 6;
const BOT_DEBRIS_BUDGET_MID = 3;
const BOT_DEBRIS_BUDGET_FAR = 1;
const BOT_DEBRIS_NEAR_DISTANCE_SQ = 46 * 46;
const BOT_DEBRIS_MID_DISTANCE_SQ = 86 * 86;
const BOT_HUNTER_SIGHT_RANGE = 132;
const BOT_HUNTER_FIRE_RANGE = 34;
const BOT_HUNTER_MIN_FIRE_RANGE = 12;
const BOT_HUNTER_SIGHT_FORWARD_DOT = 0.38;
const BOT_HUNTER_MIN_FORWARD_DOT = 0.58;
const BOT_HUNTER_SIGHT_CONFIRM_SEC = 0.36;
const BOT_HUNTER_EYE_HEIGHT = 1.18;
const BOT_HUNTER_EYE_FORWARD_OFFSET = 0.78;
const BOT_HUNTER_OBSTACLE_IGNORE_RADIUS = 0.06;
const BOT_HUNTER_TARGET_LATERAL_OFFSET = 0.94;
const BOT_HUNTER_TARGET_TOP_Y = 1.08;
const BOT_HUNTER_TARGET_LOW_Y = 0.38;
const BOT_HUNTER_MIN_VISIBLE_SAMPLE_COUNT = 2;
const BOT_HUNTER_PLAYER_HIT_CHANCE = 0.16;
const BOT_HUNTER_PLAYER_HIT_WINDOW_MIN_MS = 2200;
const BOT_HUNTER_PLAYER_HIT_WINDOW_MAX_MS = 3600;
const BOT_HUNTER_PLAYER_MISS_LATERAL_OFFSET = 2.15;
const BOT_HUNTER_PLAYER_MISS_DEPTH_JITTER = 0.72;
const BOT_HUNTER_PLAYER_MISS_VERTICAL_JITTER = 0.34;
const PLAYER_TARGET_CENTER_Y = 0.72;
const WEAPON_LOCK_BODY_CENTER_Y = 0.72;
const WEAPON_LOCK_TARGET_LATERAL_OFFSET = 0.94;
const WEAPON_LOCK_TARGET_TOP_Y = 1.08;
const WEAPON_LOCK_TARGET_LOW_Y = 0.38;
const RETICLE_DEFAULT_COLOR = new THREE.Color(0x6fe6ff);
const RETICLE_HOT_COLOR = new THREE.Color(0xffc88a);
const RETICLE_LOCK_COLOR = new THREE.Color(0xff856f);
const WEAPON_METAL_COLOR = new THREE.Color(0x101923);
const WEAPON_EDGE_COLOR = new THREE.Color(0x7be9ff);
const WEAPON_HOT_COLOR = new THREE.Color(0xff9259);
const hunterReticleColor = new THREE.Color();
const weaponAimScreenPoint = new THREE.Vector3();
const weaponAimOrigin = new THREE.Vector3();
const weaponAimDirection = new THREE.Vector3();
const weaponAimPoint = new THREE.Vector3();
const weaponShotDirection = new THREE.Vector3();
const weaponMuzzleWorldPosition = new THREE.Vector3();
const weaponHudAnchorWorldPosition = new THREE.Vector3();
const weaponHudAnchorProjection = new THREE.Vector3();
const weaponTempVectorA = new THREE.Vector3();
const weaponTempVectorB = new THREE.Vector3();
const weaponTempVectorC = new THREE.Vector3();
const weaponTempVectorD = new THREE.Vector3();
const weaponTempVectorE = new THREE.Vector3();
const weaponZoomCameraPosition = new THREE.Vector3();
const weaponZoomCameraLookTarget = new THREE.Vector3();
const weaponZoomCameraUpVector = new THREE.Vector3();
const weaponPitchPivotQuaternion = new THREE.Quaternion();
const weaponZoomCameraPose = {
    position: weaponZoomCameraPosition,
    lookTarget: weaponZoomCameraLookTarget,
};
const hunterVisionForwardVector = new THREE.Vector3();
const hunterVisionUpVector = new THREE.Vector3();
const hunterTargetRightVector = new THREE.Vector3();
const hunterVisibilityDirectionVector = new THREE.Vector3();
const weaponLockTargetRightVector = new THREE.Vector3();
const weaponLockVisibilityDirectionVector = new THREE.Vector3();
const weaponLockTargetState = {
    point: new THREE.Vector3(),
    screenX: 0,
    screenY: 0,
    screenDistanceSq: Number.POSITIVE_INFINITY,
    visibleCount: 0,
    centerVisible: false,
    forwardDot: -1,
};
const weaponLockTargetSamplePoints = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
];
const hunterVisibleTargetState = {
    point: new THREE.Vector3(),
    visibleCount: 0,
    centerVisible: false,
    distance: Number.POSITIVE_INFINITY,
    visibilityDot: -1,
};
const hunterTargetSamplePoints = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
];
const weaponSceneRaycaster = new THREE.Raycaster();
const weaponSceneIntersections = [];
const weaponSceneRayDirection = new THREE.Vector3();
const weaponSceneImpactNormal = new THREE.Vector3();
const weaponSceneImpactFallbackNormal = new THREE.Vector3();
const weaponSceneImpactNormalMatrix = new THREE.Matrix3();
const weaponTempColor = new THREE.Color();
const weaponHudProjection = new THREE.Vector3();
const weaponLocalOrigin = new THREE.Vector3();
const weaponLocalTargetPoint = new THREE.Vector3();
const weaponLocalAimVector = new THREE.Vector3();
const weaponTraceObstacleBuffer = [];
const lorienDoorTraceObstacleBuffer = [];

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
const muzzleFlashShockwaveGeometry = new THREE.RingGeometry(0.08, 0.28, 28);
const muzzleFlashSmokeGeometry = new THREE.PlaneGeometry(0.78, 1.46);
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

export function createVehicleWeaponSystem({
    scene,
    camera,
    car,
    getGroundHeightAt = () => 0,
    getBotTrafficSystem = () => null,
    getGameMode = () => 'bots',
    getIsMultiplayerActive = () => false,
    getVehicleState = () => ({}),
    getStaticObstacles = () => [],
    getAudioController = () => null,
    reportWeaponPickupCollected = () => false,
    onStatus = () => {},
    onBotDestroyed = () => {},
    onPlayerHit = () => ({ destroyed: false }),
    onShotFired = () => {},
} = {}) {
    if (!scene || !camera || !car) {
        return createNoopWeaponSystem();
    }

    const roofLayout = getLorienVelmoreRoofLiftLayout();
    const parkingLayout = UNDERGROUND_PARKING_LAYOUT;
    const effectRoot = new THREE.Group();
    effectRoot.name = 'lorienVehicleWeaponEffects';
    scene.add(effectRoot);

    const pickupEntries = [
        createPickupEntry({
            id: 'roof',
            surfaceY: roofLayout.roofSurfaceY,
            rootName: 'lorien_vehicle_weapon_pickup',
            anchor: new THREE.Vector3(
                roofLayout.centerX,
                roofLayout.roofSurfaceY + 0.92,
                roofLayout.centerZ +
                    roofLayout.roofDeckMinZ +
                    (roofLayout.roofDeckMaxZ - roofLayout.roofDeckMinZ) * 0.32
            ),
        }),
        createPickupEntry({
            id: 'parking',
            surfaceY: parkingLayout.floorY,
            rootName: 'underground_parking_vx9_pickup',
            anchor: new THREE.Vector3(
                parkingLayout.centerX,
                parkingLayout.floorY + 0.92,
                parkingLayout.floorMinZ + 18
            ),
        }),
    ];
    pickupEntries.forEach((entry) => {
        scene.add(entry.pickup.root);
    });

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
    const hunterState = {
        collectorId: '',
        name: 'Hunter',
        mount: null,
        mountParent: null,
        fireCooldown: 0,
        recoil: 0,
        heat: 0,
        triggerHeld: false,
        motionPhase: Math.random() * Math.PI * 2,
        missSideSign: Math.random() < 0.5 ? 1 : -1,
        nextPlayerHitWindowAtMs:
            Date.now() +
            BOT_HUNTER_PLAYER_HIT_WINDOW_MIN_MS +
            Math.random() *
                Math.max(
                    0,
                    BOT_HUNTER_PLAYER_HIT_WINDOW_MAX_MS - BOT_HUNTER_PLAYER_HIT_WINDOW_MIN_MS
                ),
        sightHoldSec: 0,
    };

    const state = {
        hasWeapon: false,
        triggerHeld: false,
        recoil: 0,
        heat: 0,
        fireCooldown: 0,
        hoverPhase: Math.random() * Math.PI * 2,
        lockPulse: Math.random() * Math.PI * 2,
        shotSequence: 0,
        currentLock: null,
        zoomActive: false,
        hudX: window.innerWidth * 0.5,
        hudY: window.innerHeight * 0.5,
        replicationTargetPoint: new THREE.Vector3(),
        hasReplicationTarget: false,
        replicationLocked: false,
        pendingPickupId: '',
    };

    function resetHudPosition(hudProfile = resolveHudProfile()) {
        const anchor = resolveWeaponHudAnchorScreenPosition(hudProfile);
        state.hudX = anchor.screenX;
        state.hudY = anchor.screenY;
    }

    function getWeaponTraceObstacles() {
        const baseObstacles = getStaticObstacles?.();
        const staticObstacles = Array.isArray(baseObstacles) ? baseObstacles : [];
        const buildingLayer = getBuildingLayer();
        const dynamicBarriers = appendLorienVelmoreDoorTraceObstacles(
            buildingLayer,
            lorienDoorTraceObstacleBuffer
        );
        if (!Array.isArray(dynamicBarriers) || dynamicBarriers.length === 0) {
            return staticObstacles;
        }

        weaponTraceObstacleBuffer.length = 0;
        if (staticObstacles.length > 0) {
            weaponTraceObstacleBuffer.push(...staticObstacles);
        }
        weaponTraceObstacleBuffer.push(...dynamicBarriers);
        return weaponTraceObstacleBuffer;
    }

    function getBuildingLayer() {
        const cityScenery = scene?.getObjectByName?.('cityScenery') || null;
        return cityScenery?.userData?.buildingLayer || null;
    }

    function shouldIgnoreSceneRaycastHit(hitObject) {
        if (!hitObject) {
            return true;
        }
        if (hitObject.visible === false || hitObject.isSprite) {
            return true;
        }
        if (hitObject.userData?.weaponRaycastDisabled === true) {
            return true;
        }
        if (
            hitObject.userData?.lorienDoorRaycastRole === 'glass' &&
            hitObject.userData?.lorienDoorPanelState?.broken
        ) {
            return true;
        }
        return false;
    }

    function shouldIgnoreWeaponSoftOccluderObstacle(obstacle) {
        return obstacle?.category === 'lamp_post';
    }

    function shouldIgnoreWeaponSoftOccluderSceneRaycastHit(hitObject) {
        return hitObject?.userData?.weaponLockSoftOccluder === true;
    }

    function traceSceneGeometryImpact({
        start = null,
        end = null,
        ignoreOriginRadius = 0,
        shouldIgnoreHitObject = null,
    } = {}) {
        const cityScenery = scene?.getObjectByName?.('cityScenery') || null;
        if (!cityScenery || !start || !end) {
            return null;
        }

        weaponSceneRayDirection.subVectors(end, start);
        const rayDistance = weaponSceneRayDirection.length();
        if (!Number.isFinite(rayDistance) || rayDistance <= 0.0001) {
            return null;
        }

        weaponSceneRayDirection.multiplyScalar(1 / rayDistance);
        cityScenery.updateWorldMatrix(true, true);
        weaponSceneRaycaster.camera = camera || null;
        weaponSceneRaycaster.near = Math.max(0, Number(ignoreOriginRadius) || 0);
        weaponSceneRaycaster.far = rayDistance;
        weaponSceneRaycaster.set(start, weaponSceneRayDirection);
        weaponSceneIntersections.length = 0;
        weaponSceneRaycaster.intersectObject(cityScenery, true, weaponSceneIntersections);

        for (let index = 0; index < weaponSceneIntersections.length; index += 1) {
            const intersection = weaponSceneIntersections[index];
            const hitObject = intersection?.object;
            if (
                shouldIgnoreSceneRaycastHit(hitObject) ||
                (typeof shouldIgnoreHitObject === 'function' &&
                    shouldIgnoreHitObject(hitObject, intersection))
            ) {
                continue;
            }

            if (intersection.face?.normal) {
                weaponSceneImpactNormalMatrix.getNormalMatrix(hitObject.matrixWorld);
                weaponSceneImpactNormal
                    .copy(intersection.face.normal)
                    .applyMatrix3(weaponSceneImpactNormalMatrix)
                    .normalize();
            } else {
                weaponSceneImpactNormal
                    .copy(
                        weaponSceneImpactFallbackNormal
                            .copy(weaponSceneRayDirection)
                            .multiplyScalar(-1)
                    )
                    .normalize();
            }

            return {
                t: intersection.distance / rayDistance,
                point: intersection.point.clone(),
                normal: weaponSceneImpactNormal.clone(),
                object: hitObject,
                distance: intersection.distance,
            };
        }

        return null;
    }

    function traceWeaponEnvironmentImpact({
        start = null,
        end = null,
        obstacles = [],
        ignoreOriginRadius = 0,
        shouldIgnoreObstacle = null,
        shouldIgnoreHitObject = null,
    } = {}) {
        const obstacleImpact = traceStaticObstacleImpact({
            start,
            end,
            obstacles,
            ignoreOriginRadius,
            shouldIgnoreObstacle,
        });
        const sceneImpact = traceSceneGeometryImpact({
            start,
            end,
            ignoreOriginRadius,
            shouldIgnoreHitObject,
        });
        if (!obstacleImpact) {
            return sceneImpact;
        }
        if (!sceneImpact) {
            return obstacleImpact;
        }

        const obstacleDistance =
            Number(obstacleImpact.distance) ||
            Number(start?.distanceTo?.(obstacleImpact.point)) ||
            Number.POSITIVE_INFINITY;
        const sceneDistance = Number(sceneImpact.distance) || Number.POSITIVE_INFINITY;
        return sceneDistance < obstacleDistance ? sceneImpact : obstacleImpact;
    }

    return {
        update,
        setTriggerHeld(nextHeld) {
            state.triggerHeld = Boolean(nextHeld) && state.hasWeapon;
        },
        grantWeapon() {
            if (state.hasWeapon) {
                onStatus('VX-9 already online.', 1400);
                return false;
            }
            activateWeapon();
            return true;
        },
        resetRound() {
            state.triggerHeld = false;
            state.recoil = 0;
            state.heat = 0;
            state.fireCooldown = 0;
            state.currentLock = null;
            state.pendingPickupId = '';
            resetHudPosition();
            resetPickupEntries();
            hideWeapon();
            resetHunterWeaponState();
            clearEffects();
            syncHud({
                visible: false,
                hasWeapon: false,
                triggerHeld: false,
                locked: false,
                zoomed: false,
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
            state.pendingPickupId = '';
            resetHudPosition();
            if (state.hasWeapon) {
                hideWeapon();
            }
            resetHunterWeaponState();
            syncHud({
                visible: false,
                hasWeapon: false,
                triggerHeld: false,
                locked: false,
                zoomed: false,
                heat: 0,
                screenX: state.hudX,
                screenY: state.hudY,
            });
        },
        hasWeapon() {
            return state.hasWeapon;
        },
        getZoomCameraPose() {
            if (!state.hasWeapon) {
                return null;
            }

            const sightLine = resolveWeaponSightLine(
                weaponTempVectorA,
                weaponTempVectorB,
                weaponTempVectorC
            );
            weaponZoomCameraUpVector
                .set(0, 1, 0)
                .applyQuaternion(weaponPitchPivotQuaternion)
                .normalize();
            weaponZoomCameraPosition
                .copy(sightLine.origin)
                .lerp(sightLine.muzzlePosition, 0.18)
                .addScaledVector(weaponZoomCameraUpVector, 0.05);
            if (state.currentLock?.point) {
                weaponZoomCameraLookTarget.copy(state.currentLock.point);
            } else {
                weaponZoomCameraLookTarget
                    .copy(sightLine.origin)
                    .addScaledVector(sightLine.direction, CAMERA_AIM_RANGE);
            }
            return weaponZoomCameraPose;
        },
        getCurrentLockPoint() {
            return state.currentLock?.point || null;
        },
        applyPickupStateSnapshot(pickupSnapshots = []) {
            applyPickupStateSnapshot(pickupSnapshots);
        },
        getReplicationState() {
            return {
                hasWeapon: state.hasWeapon,
                triggerHeld: state.hasWeapon && state.triggerHeld,
                heat: state.heat,
                locked: state.replicationLocked,
                hasTarget: state.hasWeapon && state.hasReplicationTarget,
                targetX: state.replicationTargetPoint.x,
                targetY: state.replicationTargetPoint.y,
                targetZ: state.replicationTargetPoint.z,
            };
        },
    };

    function update(deltaTime = 1 / 60, frameState = {}) {
        const dt = Math.min(Math.max(Number(deltaTime) || 0, 0), 0.05);
        state.hoverPhase += dt * 2.2;
        state.lockPulse += dt * 6.8;
        hunterState.motionPhase += dt * 2.4;

        const controlsEnabled = frameState.controlsEnabled !== false;
        const vehicleState =
            frameState.vehicleState && typeof frameState.vehicleState === 'object'
                ? frameState.vehicleState
                : getVehicleState();
        const gameMode = frameState.gameMode === 'online' ? 'online' : getGameMode();
        const multiplayerPickupSyncActive =
            gameMode === 'online' && Boolean(getIsMultiplayerActive?.());
        const vehicleWeaponActive =
            state.hasWeapon &&
            controlsEnabled &&
            !frameState.welcomeVisible &&
            !frameState.paused &&
            !frameState.editModeActive &&
            !frameState.raceIntroActive &&
            !frameState.carDestroyed &&
            !frameState.pickupRoundFinished;

        if (!vehicleWeaponActive) {
            state.triggerHeld = false;
        }
        state.zoomActive = Boolean(frameState.vehicleWeaponZoomActive) && vehicleWeaponActive;

        updatePickupRespawns(dt);
        updatePickups(dt);
        maybeCollectPickup(frameState, multiplayerPickupSyncActive);

        const weaponMotionState = resolveWeaponMotionState(vehicleState);
        applyWeaponBasePoseToMount(mount, weaponMotionState);
        const aimState = resolveAimState(gameMode, weaponMotionState);
        state.currentLock = aimState.lockedTarget;
        if (
            aimState?.targetPoint &&
            Number.isFinite(aimState.targetPoint.x) &&
            Number.isFinite(aimState.targetPoint.y) &&
            Number.isFinite(aimState.targetPoint.z)
        ) {
            state.replicationTargetPoint.copy(aimState.targetPoint);
            state.hasReplicationTarget = true;
        } else {
            state.hasReplicationTarget = false;
        }
        state.replicationLocked = Boolean(aimState?.lockedTarget);
        updateWeaponMount(dt, weaponMotionState, aimState, vehicleWeaponActive);
        updateHudTracking(dt, aimState, vehicleWeaponActive);

        if (vehicleWeaponActive && state.triggerHeld) {
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

        const targetHeat = vehicleWeaponActive && state.triggerHeld ? 1 : 0;
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

        updateHunterWeapon(dt, frameState);
        updateEffects(dt);
        syncHud({
            visible: vehicleWeaponActive,
            hasWeapon: state.hasWeapon,
            triggerHeld: state.triggerHeld,
            locked: Boolean(aimState.lockedTarget),
            zoomed: state.zoomActive,
            heat: state.heat,
            screenX: state.hudX,
            screenY: state.hudY,
        });
    }

    function createPickupEntry({ id = 'pickup', anchor, surfaceY = 0, rootName = 'vx9_pickup' }) {
        return {
            id,
            anchor,
            surfaceY,
            available: true,
            respawnTimer: 0,
            phaseOffset: Math.random() * Math.PI * 2,
            pickup: createWeaponPickup(anchor, rootName),
        };
    }

    function resetPickupEntries() {
        for (let index = 0; index < pickupEntries.length; index += 1) {
            const entry = pickupEntries[index];
            entry.available = true;
            entry.respawnTimer = 0;
            entry.pickup.root.visible = true;
            entry.pickup.root.position.copy(entry.anchor);
        }
    }

    function applyPickupStateSnapshot(pickupSnapshots = []) {
        if (!Array.isArray(pickupSnapshots) || pickupSnapshots.length === 0) {
            return;
        }
        const nowMs = Date.now();
        for (let index = 0; index < pickupSnapshots.length; index += 1) {
            const snapshot = pickupSnapshots[index];
            const pickupId = typeof snapshot?.id === 'string' ? snapshot.id.trim() : '';
            if (!pickupId) {
                continue;
            }
            const entry = pickupEntries.find((candidate) => candidate.id === pickupId);
            if (!entry) {
                continue;
            }
            const available = Boolean(snapshot?.available);
            const respawnAt = Math.max(0, Math.round(Number(snapshot?.respawnAt) || 0));
            entry.available = available;
            entry.respawnTimer = available ? 0 : Math.max(0, (respawnAt - nowMs) / 1000);
            if (state.pendingPickupId === entry.id && available) {
                state.pendingPickupId = '';
            }
        }
    }

    function updatePickupRespawns(dt) {
        for (let index = 0; index < pickupEntries.length; index += 1) {
            const entry = pickupEntries[index];
            if (entry.respawnTimer <= 0) {
                continue;
            }
            entry.respawnTimer = Math.max(0, entry.respawnTimer - dt);
            if (entry.respawnTimer <= 0) {
                entry.available = true;
            }
        }
    }

    function updatePickups(dt) {
        for (let index = 0; index < pickupEntries.length; index += 1) {
            const entry = pickupEntries[index];
            const pickup = entry.pickup;
            pickup.root.visible = entry.available && !state.hasWeapon;
            if (!pickup.root.visible) {
                continue;
            }

            const hoverPhase = state.hoverPhase + entry.phaseOffset;
            const pulse = 0.5 + 0.5 * Math.sin(hoverPhase * 1.4);
            const pulseFast = 0.5 + 0.5 * Math.sin(hoverPhase * 3.1 + 0.5);
            pickup.root.position.y = entry.anchor.y + Math.sin(hoverPhase * 1.2) * 0.09;
            pickup.core.rotation.y += dt * 2.4;
            pickup.shell.rotation.y -= dt * 1.4;
            pickup.ringA.rotation.z += dt * 0.9;
            pickup.ringB.rotation.x += dt * 1.05;
            pickup.ringC.rotation.y -= dt * 1.32;
            pickup.halo.rotation.z += dt * 0.22;
            pickup.wordmark.rotation.y = Math.sin(hoverPhase * 0.22) * 0.08;
            pickup.beam.material.opacity = 0.14 + pulse * 0.2;
            pickup.pulse.material.opacity = 0.14 + pulseFast * 0.24;
            pickup.pulse.scale.setScalar(0.84 + pulseFast * 0.22);
            pickup.core.material.emissiveIntensity = 0.95 + pulse * 0.95;
            pickup.shell.material.opacity = 0.18 + pulse * 0.12;
            pickup.halo.material.opacity = 0.32 + pulse * 0.24;
            pickup.wordmark.material.opacity = 0.72 + pulse * 0.18;
        }
    }

    function maybeCollectPickup(frameState, multiplayerPickupSyncActive = false) {
        if (state.hasWeapon) {
            return;
        }
        if (frameState.carDestroyed || frameState.pickupRoundFinished) {
            return;
        }
        if (multiplayerPickupSyncActive && state.pendingPickupId) {
            return;
        }

        for (let index = 0; index < pickupEntries.length; index += 1) {
            const entry = pickupEntries[index];
            if (!entry.available) {
                continue;
            }
            const deltaX = car.position.x - entry.anchor.x;
            const deltaZ = car.position.z - entry.anchor.z;
            const distanceSq = deltaX * deltaX + deltaZ * deltaZ;
            if (distanceSq > PICKUP_RADIUS_SQ) {
                continue;
            }

            const heightDelta = Math.abs((car.position.y || 0) - entry.surfaceY);
            if (heightDelta > PICKUP_HEIGHT_TOLERANCE) {
                continue;
            }

            collectPickup(entry, multiplayerPickupSyncActive);
            return;
        }
    }

    function collectPickup(entry, multiplayerPickupSyncActive = false) {
        entry.available = false;
        entry.pickup.root.visible = false;
        if (!multiplayerPickupSyncActive) {
            entry.respawnTimer = PICKUP_RESPAWN_DELAY_SEC;
            activateWeapon();
            return;
        }

        entry.respawnTimer = 0;
        state.pendingPickupId = entry.id;
        const requestAccepted = reportWeaponPickupCollected?.(
            {
                pickupId: entry.id,
            },
            (response) => {
                handlePickupCollectionResponse(entry.id, response);
            }
        );
        if (requestAccepted === false) {
            state.pendingPickupId = '';
            entry.available = true;
            entry.respawnTimer = 0;
            entry.pickup.root.visible = true;
        }
    }

    function handlePickupCollectionResponse(entryId, response) {
        const entry = pickupEntries.find((candidate) => candidate.id === entryId);
        state.pendingPickupId = state.pendingPickupId === entryId ? '' : state.pendingPickupId;
        if (response?.pickup) {
            applyPickupStateSnapshot([response.pickup]);
        }
        if (response?.ok) {
            activateWeapon();
            return;
        }
        if (entry) {
            if (response?.pickup) {
                entry.available = Boolean(response.pickup.available);
            } else {
                entry.available = true;
            }
            entry.respawnTimer = entry.available ? 0 : entry.respawnTimer;
            entry.pickup.root.visible = entry.available;
        }
    }

    function activateWeapon() {
        state.hasWeapon = true;
        state.triggerHeld = false;
        state.fireCooldown = 0;
        state.pendingPickupId = '';
        mount.root.visible = true;
        resetHudPosition();
        onStatus('VX-9 online. Auto-lock engaged. Hold T to fire.', 2600);
        getAudioController()?.onVehicleWeaponPickup?.();
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

    function applyWeaponBasePoseToMount(targetMount, motionState) {
        if (!targetMount || !motionState) {
            return;
        }
        targetMount.root.position.set(
            0,
            WEAPON_MOUNT_BASE_Y + motionState.idleSway * 0.3,
            WEAPON_MOUNT_BASE_Z + motionState.recoilShift
        );
        targetMount.weaponGroup.position.set(
            0,
            motionState.speedSway * 0.5,
            motionState.recoilShift
        );
        targetMount.weaponGroup.rotation.z = motionState.speedSway * 1.2;
        targetMount.weaponGroup.rotation.x =
            motionState.idleSway * 0.9 + motionState.throttleRatio * 0.02;
    }

    function resolveWeaponLocalOrigin(motionState, out) {
        return out.set(
            0,
            WEAPON_MOUNT_BASE_Y + motionState.idleSway * 0.3 + 0.04,
            WEAPON_MOUNT_BASE_Z + motionState.recoilShift - 1.04
        );
    }

    function resolveHudProfile() {
        const isChaseView = getCameraViewMode() === CHASE_CAMERA_VIEW_MODE;
        if (state.zoomActive) {
            return isChaseView ? CHASE_CAMERA_ZOOM_HUD_PROFILE : DEFAULT_ZOOM_HUD_PROFILE;
        }
        return isChaseView ? CHASE_CAMERA_HUD_PROFILE : DEFAULT_HUD_PROFILE;
    }

    function resolveWeaponLockBodyCenterPoint(descriptor, radius, out = weaponTempVectorB) {
        const baseX = Number(descriptor?.position?.x) || 0;
        const baseY = Number(descriptor?.position?.y) || 0;
        const baseZ = Number(descriptor?.position?.z) || 0;
        const centerY = baseY + Math.max(WEAPON_LOCK_BODY_CENTER_Y, radius * 0.42 + 0.1);
        return out.set(baseX, centerY, baseZ);
    }

    function populateWeaponLockTargetSamplePoints(descriptor, radius) {
        const baseX = Number(descriptor?.position?.x) || 0;
        const baseY = Number(descriptor?.position?.y) || 0;
        const baseZ = Number(descriptor?.position?.z) || 0;
        const heading = Number(descriptor?.heading) || 0;
        const lateralOffset = Math.max(
            0.54,
            Math.min(WEAPON_LOCK_TARGET_LATERAL_OFFSET, radius * 0.55 + 0.12)
        );
        const upperLateralOffset = lateralOffset * 0.72;
        const centerY = baseY + Math.max(0.88, radius * 0.58 + 0.28);
        const topY = baseY + Math.max(WEAPON_LOCK_TARGET_TOP_Y, radius * 0.76 + 0.18);
        const lowY = baseY + Math.max(WEAPON_LOCK_TARGET_LOW_Y, radius * 0.24 + 0.08);

        weaponLockTargetRightVector.set(Math.cos(heading), 0, -Math.sin(heading)).normalize();

        weaponLockTargetSamplePoints[0].set(baseX, centerY, baseZ);
        weaponLockTargetSamplePoints[1]
            .copy(weaponLockTargetSamplePoints[0])
            .addScaledVector(weaponLockTargetRightVector, lateralOffset);
        weaponLockTargetSamplePoints[2]
            .copy(weaponLockTargetSamplePoints[0])
            .addScaledVector(weaponLockTargetRightVector, -lateralOffset);
        weaponLockTargetSamplePoints[3].set(baseX, topY, baseZ);
        weaponLockTargetSamplePoints[4]
            .copy(weaponLockTargetSamplePoints[3])
            .addScaledVector(weaponLockTargetRightVector, upperLateralOffset);
        weaponLockTargetSamplePoints[5]
            .copy(weaponLockTargetSamplePoints[3])
            .addScaledVector(weaponLockTargetRightVector, -upperLateralOffset);
        weaponLockTargetSamplePoints[6].set(baseX, lowY, baseZ);
        return weaponLockTargetSamplePoints;
    }

    function resolveVisibleWeaponLockTargetState({
        descriptor,
        radius,
        hudAimNdcX = 0,
        hudAimNdcY = 0,
        maxScreenDistanceSq = AUTO_LOCK_MAX_SCREEN_DISTANCE * AUTO_LOCK_MAX_SCREEN_DISTANCE,
        staticObstacles = [],
        weaponLockOrigin,
        botTrafficSystem,
    }) {
        if (!descriptor?.position || !weaponLockOrigin) {
            return null;
        }

        const result = weaponLockTargetState;
        result.visibleCount = 0;
        result.centerVisible = false;
        result.screenDistanceSq = Number.POSITIVE_INFINITY;
        result.forwardDot = -1;

        const samplePoints = populateWeaponLockTargetSamplePoints(descriptor, radius);
        let bestSampleScore = Number.POSITIVE_INFINITY;

        for (let index = 0; index < samplePoints.length; index += 1) {
            const samplePoint = samplePoints[index];
            const toSample = weaponLockVisibilityDirectionVector.subVectors(
                samplePoint,
                weaponAimOrigin
            );
            const distance = toSample.length();
            if (!Number.isFinite(distance) || distance < 4 || distance > AUTO_LOCK_RANGE) {
                continue;
            }

            toSample.multiplyScalar(1 / Math.max(distance, 0.0001));
            const forwardDot = toSample.dot(weaponAimDirection);
            if (forwardDot < AUTO_LOCK_MIN_FORWARD_DOT) {
                continue;
            }

            weaponHudProjection.copy(samplePoint).project(camera);
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

            const projectedOffsetX = weaponHudProjection.x - hudAimNdcX;
            const projectedOffsetY = weaponHudProjection.y - hudAimNdcY;
            const screenDistanceSq =
                projectedOffsetX * projectedOffsetX + projectedOffsetY * projectedOffsetY;
            if (screenDistanceSq > maxScreenDistanceSq) {
                continue;
            }

            const traceDirection = weaponTempVectorC.copy(samplePoint).sub(weaponLockOrigin);
            const weaponDistance = traceDirection.length();
            if (!Number.isFinite(weaponDistance) || weaponDistance < 4) {
                continue;
            }
            if (arePositionsSeparatedByUndergroundParking(weaponLockOrigin, samplePoint, 0.18)) {
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

            const obstacleImpact = traceWeaponEnvironmentImpact({
                start: weaponAimOrigin,
                end: samplePoint,
                obstacles: staticObstacles,
                ignoreOriginRadius: BULLET_MARK_MIN_DISTANCE,
                shouldIgnoreObstacle: shouldIgnoreWeaponSoftOccluderObstacle,
                shouldIgnoreHitObject: shouldIgnoreWeaponSoftOccluderSceneRaycastHit,
            });
            if (obstacleImpact) {
                continue;
            }
            const muzzleObstacleImpact = traceWeaponEnvironmentImpact({
                start: weaponLockOrigin,
                end: samplePoint,
                obstacles: staticObstacles,
                ignoreOriginRadius: BULLET_MARK_MIN_DISTANCE,
                shouldIgnoreObstacle: shouldIgnoreWeaponSoftOccluderObstacle,
                shouldIgnoreHitObject: shouldIgnoreWeaponSoftOccluderSceneRaycastHit,
            });
            if (muzzleObstacleImpact) {
                continue;
            }

            result.visibleCount += 1;
            if (index === 0) {
                result.centerVisible = true;
            }

            const sampleScore = screenDistanceSq + index * AUTO_LOCK_SAMPLE_SCORE_PRIORITY_STEP;
            if (sampleScore >= bestSampleScore) {
                continue;
            }

            bestSampleScore = sampleScore;
            result.point.copy(samplePoint);
            result.screenDistanceSq = screenDistanceSq;
            result.forwardDot = forwardDot;
            result.screenX = (weaponHudProjection.x * 0.5 + 0.5) * window.innerWidth;
            result.screenY = (-weaponHudProjection.y * 0.5 + 0.5) * window.innerHeight;
        }

        return result.visibleCount > 0 ? result : null;
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

    function resolveWeaponSightLine(
        outOrigin = weaponAimOrigin,
        outDirection = weaponAimDirection,
        outMuzzlePosition = weaponTempVectorE
    ) {
        if (!state.hasWeapon || !mount?.holoReticle || !mount?.muzzleAnchor) {
            camera.updateWorldMatrix(true, false);
            camera.getWorldPosition(outOrigin);
            camera.getWorldDirection(outDirection).normalize();
            outMuzzlePosition.copy(outOrigin);
            return {
                origin: outOrigin,
                direction: outDirection,
                muzzlePosition: outMuzzlePosition,
            };
        }

        mount.root.updateWorldMatrix(true, true);
        mount.holoReticle.getWorldPosition(outOrigin);
        mount.muzzleAnchor.getWorldPosition(outMuzzlePosition);
        mount.pitchPivot.getWorldQuaternion(weaponPitchPivotQuaternion);
        outDirection.set(0, 0, -1).applyQuaternion(weaponPitchPivotQuaternion);
        if (outDirection.lengthSq() <= 0.0001) {
            outDirection.subVectors(outMuzzlePosition, outOrigin);
        }
        if (outDirection.lengthSq() <= 0.0001) {
            camera.getWorldDirection(outDirection).normalize();
        } else {
            outDirection.normalize();
        }
        return {
            origin: outOrigin,
            direction: outDirection,
            muzzlePosition: outMuzzlePosition,
        };
    }

    function resolveAimState(gameMode = 'bots', motionState) {
        const hudProfile = resolveHudProfile();
        const aimNdcX = SCREEN_SPACE_WEAPON_HUD_ENABLED ? Number(hudProfile?.aimNdcX) || 0 : 0;
        const aimNdcY = SCREEN_SPACE_WEAPON_HUD_ENABLED ? Number(hudProfile?.aimNdcY) || 0 : 0;
        camera.updateWorldMatrix(true, false);
        camera.getWorldPosition(weaponAimOrigin);
        if (Math.abs(aimNdcX) > 0.0001 || Math.abs(aimNdcY) > 0.0001) {
            weaponAimScreenPoint.set(aimNdcX, aimNdcY, 0.5).unproject(camera);
            weaponAimDirection.subVectors(weaponAimScreenPoint, weaponAimOrigin);
            if (weaponAimDirection.lengthSq() > 0.0001) {
                weaponAimDirection.normalize();
            } else {
                camera.getWorldDirection(weaponAimDirection).normalize();
            }
        } else {
            camera.getWorldDirection(weaponAimDirection).normalize();
        }
        weaponAimPoint.copy(weaponAimOrigin).addScaledVector(weaponAimDirection, CAMERA_AIM_RANGE);

        const botTrafficSystem = gameMode === 'bots' ? getBotTrafficSystem() : null;
        const lockedTarget = state.hasWeapon
            ? resolveAutoLockTarget(botTrafficSystem, motionState, hudProfile)
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
            hudProfile,
        };
    }

    function resolveAutoLockTarget(
        botTrafficSystem,
        motionState,
        hudProfile = DEFAULT_HUD_PROFILE
    ) {
        const staticObstacles = getWeaponTraceObstacles();
        const descriptors = botTrafficSystem?.getCollectorDescriptors?.();
        if (!Array.isArray(descriptors) || descriptors.length <= 0) {
            return null;
        }

        mountParent.updateWorldMatrix(true, false);
        resolveWeaponLocalOrigin(motionState, weaponLocalOrigin);
        const weaponLockOrigin = weaponMuzzleWorldPosition.copy(weaponLocalOrigin);
        mountParent.localToWorld(weaponLockOrigin);
        const hudAimNdcX = SCREEN_SPACE_WEAPON_HUD_ENABLED
            ? Number(hudProfile?.aimNdcX) || 0
            : 0;
        const hudAimNdcY = SCREEN_SPACE_WEAPON_HUD_ENABLED
            ? Number(hudProfile?.aimNdcY) || 0
            : 0;

        const previousLockId =
            typeof state.currentLock?.collectorId === 'string' ? state.currentLock.collectorId : '';
        const maxScreenDistance = THREE.MathUtils.clamp(
            Number(hudProfile?.autoLockScreenDistance) || AUTO_LOCK_MAX_SCREEN_DISTANCE,
            0.08,
            AUTO_LOCK_MAX_SCREEN_DISTANCE
        );
        const maxScreenDistanceSq = maxScreenDistance * maxScreenDistance;
        const screenDistanceWeight = state.zoomActive
            ? AUTO_LOCK_ZOOM_SCREEN_SCORE_WEIGHT
            : AUTO_LOCK_SCREEN_SCORE_WEIGHT;
        const forwardScoreWeight = state.zoomActive
            ? AUTO_LOCK_ZOOM_FORWARD_SCORE_WEIGHT
            : AUTO_LOCK_FORWARD_SCORE_WEIGHT;
        const distanceScoreWeight = state.zoomActive
            ? AUTO_LOCK_ZOOM_DISTANCE_SCORE_WEIGHT
            : AUTO_LOCK_DISTANCE_SCORE_WEIGHT;
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
            const targetPoint = state.zoomActive
                ? resolveWeaponLockBodyCenterPoint(descriptor, radius, weaponTempVectorA)
                : weaponTempVectorA.set(
                      Number(descriptor.position.x) || 0,
                      (Number(descriptor.position.y) || 0) + Math.max(0.88, radius * 0.58 + 0.28),
                      Number(descriptor.position.z) || 0
                  );
            if (!isTargetWithinWeaponTraverse(targetPoint, weaponLocalOrigin)) {
                continue;
            }

            const visibleTargetState = resolveVisibleWeaponLockTargetState({
                descriptor,
                radius,
                hudAimNdcX,
                hudAimNdcY,
                maxScreenDistanceSq,
                staticObstacles,
                weaponLockOrigin,
                botTrafficSystem,
            });
            if (!visibleTargetState) {
                continue;
            }

            let score =
                visibleTargetState.screenDistanceSq * screenDistanceWeight +
                (1 - visibleTargetState.forwardDot) * forwardScoreWeight +
                (weaponLockOrigin.distanceTo(visibleTargetState.point) / AUTO_LOCK_RANGE) *
                    distanceScoreWeight;
            if (visibleTargetState.centerVisible) {
                score -= state.zoomActive ? 0.08 : 0.03;
            }
            if (visibleTargetState.visibleCount >= 2) {
                score -= Math.min(0.06, visibleTargetState.visibleCount * 0.015);
            }
            if (descriptor.id && descriptor.id === previousLockId) {
                score -= state.zoomActive ? 0.34 : 0.26;
            }
            if (score >= bestScore) {
                continue;
            }

            const lockedPoint = state.zoomActive
                ? resolveWeaponLockBodyCenterPoint(descriptor, radius, weaponTempVectorC)
                : visibleTargetState.point;
            let lockedScreenX = visibleTargetState.screenX;
            let lockedScreenY = visibleTargetState.screenY;
            if (state.zoomActive) {
                weaponHudProjection.copy(lockedPoint).project(camera);
                if (
                    Number.isFinite(weaponHudProjection.x) &&
                    Number.isFinite(weaponHudProjection.y) &&
                    Number.isFinite(weaponHudProjection.z) &&
                    weaponHudProjection.z >= -1 &&
                    weaponHudProjection.z <= 1.08
                ) {
                    lockedScreenX = (weaponHudProjection.x * 0.5 + 0.5) * window.innerWidth;
                    lockedScreenY = (-weaponHudProjection.y * 0.5 + 0.5) * window.innerHeight;
                }
            }

            bestScore = score;
            bestTarget = {
                collectorId: typeof descriptor.id === 'string' ? descriptor.id : '',
                name: typeof descriptor.name === 'string' ? descriptor.name : 'Target',
                point: lockedPoint.clone(),
                screenX: lockedScreenX,
                screenY: lockedScreenY,
            };
        }

        return bestTarget;
    }

    function updateHudTracking(dt, aimState, isActive) {
        const hudProfile = aimState?.hudProfile || DEFAULT_HUD_PROFILE;
        const anchor = resolveWeaponHudAnchorScreenPosition(hudProfile);
        const targetX = anchor.screenX;
        const targetY = anchor.screenY;
        const trackingSpeed = state.zoomActive
            ? HUD_TRACKING_SNAP_SPEED * 3.2
            : HUD_TRACKING_SNAP_SPEED;
        const alpha = 1 - Math.exp(-trackingSpeed * dt);
        if (!isActive) {
            state.hudX = targetX;
            state.hudY = targetY;
            return;
        }
        state.hudX = THREE.MathUtils.lerp(state.hudX, targetX, alpha);
        state.hudY = THREE.MathUtils.lerp(state.hudY, targetY, alpha);
    }

    function resolveWeaponHudAnchorScreenPosition(hudProfile = DEFAULT_HUD_PROFILE) {
        const fallbackX = window.innerWidth * (0.5 + (Number(hudProfile?.aimNdcX) || 0) * 0.5);
        const fallbackY = window.innerHeight * (0.5 - (Number(hudProfile?.aimNdcY) || 0) * 0.5);
        if (!state.hasWeapon || !camera?.isCamera || !mount?.holoReticle) {
            return {
                screenX: fallbackX,
                screenY: fallbackY,
            };
        }

        mount.root.updateWorldMatrix(true, true);
        mount.holoReticle.getWorldPosition(weaponHudAnchorWorldPosition);
        weaponHudAnchorProjection.copy(weaponHudAnchorWorldPosition).project(camera);
        if (
            !Number.isFinite(weaponHudAnchorProjection.x) ||
            !Number.isFinite(weaponHudAnchorProjection.y) ||
            !Number.isFinite(weaponHudAnchorProjection.z) ||
            weaponHudAnchorProjection.z < -1 ||
            weaponHudAnchorProjection.z > 1.08
        ) {
            return {
                screenX: fallbackX,
                screenY: fallbackY,
            };
        }

        return {
            screenX: (weaponHudAnchorProjection.x * 0.5 + 0.5) * window.innerWidth,
            screenY: (-weaponHudAnchorProjection.y * 0.5 + 0.5) * window.innerHeight,
        };
    }

    function updateWeaponMount(dt, motionState, aimState, isActive) {
        mount.root.visible = state.hasWeapon;
        if (!state.hasWeapon) {
            return;
        }

        applyWeaponBasePoseToMount(mount, motionState);
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

        mount.holoReticle.scale.setScalar(1);
        mount.holoHalo.scale.setScalar(1);
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
        const rawHitTarget =
            botTrafficSystem?.traceWeaponTarget?.(
                weaponMuzzleWorldPosition,
                weaponShotDirection,
                SHOT_RANGE
            ) || null;
        const hitTarget =
            rawHitTarget?.point &&
            arePositionsSeparatedByUndergroundParking(
                weaponMuzzleWorldPosition,
                rawHitTarget.point,
                0.18
            )
                ? null
                : rawHitTarget;
        const shotEndPoint = weaponTempVectorA
            .copy(weaponMuzzleWorldPosition)
            .addScaledVector(weaponShotDirection, SHOT_RANGE);
        if (hitTarget?.point) {
            shotEndPoint.copy(hitTarget.point);
        }

        const obstacleImpact = traceWeaponEnvironmentImpact({
            start: weaponMuzzleWorldPosition,
            end: shotEndPoint,
            obstacles: getWeaponTraceObstacles(),
            ignoreOriginRadius: BULLET_MARK_MIN_DISTANCE,
            shouldIgnoreObstacle: shouldIgnoreWeaponSoftOccluderObstacle,
            shouldIgnoreHitObject: shouldIgnoreWeaponSoftOccluderSceneRaycastHit,
        });
        let resolvedHitTarget = hitTarget;
        let obstacleNormal = null;
        if (obstacleImpact) {
            shotEndPoint.copy(obstacleImpact.point);
            resolvedHitTarget = null;
            obstacleNormal = obstacleImpact.normal.clone();
        }

        const projectileSpeed =
            state.zoomActive && aimState.lockedTarget
                ? LOCKED_ZOOM_PROJECTILE_SPEED
                : PROJECTILE_SPEED;

        spawnMuzzleFlash(weaponMuzzleWorldPosition, weaponShotDirection);
        spawnProjectile({
            start: weaponMuzzleWorldPosition,
            end: shotEndPoint,
            direction: weaponShotDirection,
            hitTarget: resolvedHitTarget,
            obstacleNormal,
            gameMode,
            speed: projectileSpeed,
        });
        getAudioController()?.onVehicleWeaponShot?.({
            locked: Boolean(aimState.lockedTarget),
            heat: state.heat,
            position: weaponMuzzleWorldPosition.clone(),
            direction: weaponShotDirection.clone(),
            hostile: false,
        });
        onShotFired({
            start: weaponMuzzleWorldPosition.clone(),
            end: shotEndPoint.clone(),
            direction: weaponShotDirection.clone(),
            locked: Boolean(aimState.lockedTarget),
            heat: state.heat,
            speed: projectileSpeed,
        });
    }

    function updateHunterWeapon(dt, frameState = {}) {
        const botTrafficSystem = getBotTrafficSystem();
        const hunterBot = botTrafficSystem?.getVehicleWeaponHunter?.() || null;
        if (!hunterBot?.car) {
            if (hunterState.mount?.root) {
                hunterState.mount.root.visible = false;
            }
            resetHunterWeaponState();
            return;
        }

        const hunterMount = ensureHunterMount(hunterBot);
        if (!hunterMount) {
            return;
        }

        hunterState.name =
            typeof hunterBot.name === 'string' && hunterBot.name.trim()
                ? hunterBot.name.trim()
                : 'Hunter';
        hunterMount.root.visible = !hunterBot.destroyed;

        const hunterActive =
            frameState.gameMode === 'bots' &&
            frameState.controlsEnabled !== false &&
            !frameState.welcomeVisible &&
            !frameState.paused &&
            !frameState.editModeActive &&
            !frameState.raceIntroActive &&
            !frameState.carDestroyed &&
            !frameState.pickupRoundFinished &&
            !hunterBot.destroyed;

        const motionState = resolveHunterMotionState(hunterBot);
        applyWeaponBasePoseToMount(hunterMount, motionState);

        if (!hunterActive) {
            hunterState.triggerHeld = false;
            updateHunterMountVisuals(hunterMount, null);
            updateHunterWeaponThermals(dt);
            return;
        }

        const aimState = resolveHunterAimState(hunterBot, hunterMount, dt);
        hunterMount.pitchPivot.lookAt(aimState.targetPoint);
        updateHunterMountVisuals(hunterMount, aimState);

        if (aimState.canFire) {
            hunterState.fireCooldown -= dt;
            hunterState.triggerHeld = true;
            let firedThisFrame = 0;
            while (hunterState.fireCooldown <= 0 && firedThisFrame < 2) {
                fireHunterShot(aimState);
                hunterState.fireCooldown += SHOT_INTERVAL_SEC;
                firedThisFrame += 1;
            }
        } else {
            hunterState.triggerHeld = false;
            hunterState.fireCooldown = Math.max(0, hunterState.fireCooldown - dt * 0.6);
        }

        updateHunterWeaponThermals(dt);
    }

    function ensureHunterMount(hunterBot) {
        if (!hunterBot?.car) {
            return null;
        }
        if (hunterState.mount && hunterState.collectorId === hunterBot.collectorId) {
            return hunterState.mount;
        }

        if (hunterState.mount?.root?.parent) {
            hunterState.mount.root.parent.remove(hunterState.mount.root);
        }

        const nextMountParent = hunterBot.car.getObjectByName('body_shell_group') || hunterBot.car;
        const nextMount = createWeaponMount();
        nextMount.root.visible = !hunterBot.destroyed;
        nextMountParent.add(nextMount.root);
        hunterState.mount = nextMount;
        hunterState.mountParent = nextMountParent;
        hunterState.collectorId = hunterBot.collectorId || '';
        return nextMount;
    }

    function resolveHunterMotionState(hunterBot) {
        const speedRatio = THREE.MathUtils.clamp(
            Math.abs(hunterBot?.state?.speed || 0) / 42,
            0,
            1.25
        );
        const throttleRatio = THREE.MathUtils.clamp(
            Math.abs(hunterBot?.state?.throttle || 0),
            0,
            1
        );
        const idleSway = Math.sin(hunterState.motionPhase * WEAPON_IDLE_SWAY_SPEED) * 0.01;
        const speedSway =
            Math.sin(hunterState.motionPhase * (WEAPON_SPEED_SWAY_SPEED + speedRatio * 2.2)) *
            0.012 *
            speedRatio;
        return {
            throttleRatio,
            idleSway,
            speedSway,
            recoilShift: hunterState.recoil * 0.16,
        };
    }

    function resolveHunterVisionOrigin(hunterBot, out) {
        const hunterForward = hunterVisionForwardVector
            .set(0, 0, -1)
            .applyQuaternion(hunterBot.car.quaternion)
            .normalize();
        const hunterUp = hunterVisionUpVector
            .set(0, 1, 0)
            .applyQuaternion(hunterBot.car.quaternion)
            .normalize();
        return out
            .copy(hunterBot.car.position)
            .addScaledVector(hunterUp, BOT_HUNTER_EYE_HEIGHT)
            .addScaledVector(hunterForward, BOT_HUNTER_EYE_FORWARD_OFFSET);
    }

    function resolveHunterIdleTargetPoint(hunterBot, hunterForward, out) {
        return out
            .copy(hunterBot.car.position)
            .addScaledVector(hunterForward, 24)
            .setY((Number(hunterBot.car.position?.y) || 0) + PLAYER_TARGET_CENTER_Y);
    }

    function populateHunterTargetSamplePoints() {
        const baseX = Number(car.position?.x) || 0;
        const baseY = Number(car.position?.y) || 0;
        const baseZ = Number(car.position?.z) || 0;
        hunterTargetRightVector.set(1, 0, 0).applyQuaternion(car.quaternion).normalize();

        hunterTargetSamplePoints[0].set(baseX, baseY + PLAYER_TARGET_CENTER_Y, baseZ);
        hunterTargetSamplePoints[1]
            .copy(hunterTargetSamplePoints[0])
            .addScaledVector(hunterTargetRightVector, BOT_HUNTER_TARGET_LATERAL_OFFSET);
        hunterTargetSamplePoints[2]
            .copy(hunterTargetSamplePoints[0])
            .addScaledVector(hunterTargetRightVector, -BOT_HUNTER_TARGET_LATERAL_OFFSET);
        hunterTargetSamplePoints[3].set(baseX, baseY + BOT_HUNTER_TARGET_TOP_Y, baseZ);
        hunterTargetSamplePoints[4].set(baseX, baseY + BOT_HUNTER_TARGET_LOW_Y, baseZ);
        return hunterTargetSamplePoints;
    }

    function resolveHunterVisibleTargetPoint(visionOrigin, hunterForward, obstacles) {
        const result = hunterVisibleTargetState;
        result.visibleCount = 0;
        result.centerVisible = false;
        result.distance = Number.POSITIVE_INFINITY;
        result.visibilityDot = -1;

        const samplePoints = populateHunterTargetSamplePoints();
        let bestPriority = Number.POSITIVE_INFINITY;
        for (let index = 0; index < samplePoints.length; index += 1) {
            const samplePoint = samplePoints[index];
            const sightDirection = hunterVisibilityDirectionVector.subVectors(
                samplePoint,
                visionOrigin
            );
            const sightDistance = sightDirection.length();
            if (!Number.isFinite(sightDistance) || sightDistance <= 0.0001) {
                continue;
            }

            sightDirection.multiplyScalar(1 / sightDistance);
            const visibilityDot = sightDirection.dot(hunterForward);
            if (
                sightDistance > BOT_HUNTER_SIGHT_RANGE ||
                visibilityDot < BOT_HUNTER_SIGHT_FORWARD_DOT
            ) {
                continue;
            }

            const obstacleImpact = traceWeaponEnvironmentImpact({
                start: visionOrigin,
                end: samplePoint,
                obstacles,
                ignoreOriginRadius: BOT_HUNTER_OBSTACLE_IGNORE_RADIUS,
                shouldIgnoreObstacle: shouldIgnoreWeaponSoftOccluderObstacle,
                shouldIgnoreHitObject: shouldIgnoreWeaponSoftOccluderSceneRaycastHit,
            });
            if (obstacleImpact) {
                continue;
            }

            result.visibleCount += 1;
            if (index === 0) {
                result.centerVisible = true;
            }

            const priority = index === 0 ? 0 : index === 3 ? 1 : index === 4 ? 3 : 2;
            if (
                priority < bestPriority ||
                (priority === bestPriority && sightDistance < result.distance)
            ) {
                bestPriority = priority;
                result.point.copy(samplePoint);
                result.distance = sightDistance;
                result.visibilityDot = visibilityDot;
            }
        }

        return result;
    }

    function resolveHunterAimState(hunterBot, hunterMount, dt = 0) {
        hunterMount.muzzleAnchor.getWorldPosition(weaponMuzzleWorldPosition);
        const traceObstacles = getWeaponTraceObstacles();
        const visionOrigin = resolveHunterVisionOrigin(hunterBot, weaponTempVectorD);
        const hunterForward = weaponTempVectorC
            .set(0, 0, -1)
            .applyQuaternion(hunterBot.car.quaternion)
            .normalize();
        if (
            arePositionsSeparatedByUndergroundParking(hunterBot?.car?.position, car.position, 0.18)
        ) {
            hunterState.sightHoldSec = Math.max(
                0,
                hunterState.sightHoldSec - Math.max(0, Number(dt) || 0) * 3
            );
            return {
                targetPoint: resolveHunterIdleTargetPoint(
                    hunterBot,
                    hunterForward,
                    weaponTempVectorD
                ).clone(),
                canFire: false,
                locked: false,
            };
        }
        const storeAttackDirective = resolveStoreInteriorAttackDirective(
            getBuildingLayer(),
            car.position,
            hunterBot?.car?.position,
            {
                standoffDistance: BOT_HUNTER_FIRE_RANGE * 0.6,
            }
        );
        const visibleTarget = resolveHunterVisibleTargetPoint(
            visionOrigin,
            hunterForward,
            traceObstacles
        );
        const hasDirectSight =
            visibleTarget.centerVisible ||
            visibleTarget.visibleCount >= BOT_HUNTER_MIN_VISIBLE_SAMPLE_COUNT;
        if (hasDirectSight) {
            hunterState.sightHoldSec = Math.min(
                BOT_HUNTER_SIGHT_CONFIRM_SEC + 1,
                hunterState.sightHoldSec + Math.max(0, Number(dt) || 0)
            );
        } else {
            hunterState.sightHoldSec = Math.max(
                0,
                hunterState.sightHoldSec - Math.max(0, Number(dt) || 0) * 2.4
            );
        }
        const sightConfirmed = hunterState.sightHoldSec >= BOT_HUNTER_SIGHT_CONFIRM_SEC;
        const useStoreDoorAttack =
            !hasDirectSight &&
            Boolean(storeAttackDirective?.hasBreakableGlass) &&
            storeAttackDirective?.aimPoint;
        const chosenTargetPoint = useStoreDoorAttack
            ? weaponTempVectorE.set(
                  Number(storeAttackDirective.aimPoint.x) || 0,
                  Number(storeAttackDirective.aimPoint.y) || 0,
                  Number(storeAttackDirective.aimPoint.z) || 0
              )
            : hasDirectSight
              ? visibleTarget.point
              : resolveHunterIdleTargetPoint(hunterBot, hunterForward, weaponTempVectorD);

        const shotDirection = weaponTempVectorB.subVectors(
            chosenTargetPoint,
            weaponMuzzleWorldPosition
        );
        const distance = shotDirection.length();
        if (!Number.isFinite(distance) || distance <= 0.0001) {
            return {
                targetPoint: resolveHunterIdleTargetPoint(
                    hunterBot,
                    hunterForward,
                    weaponTempVectorD
                ).clone(),
                canFire: false,
                locked: false,
            };
        }

        shotDirection.multiplyScalar(1 / distance);
        const forwardDot = shotDirection.dot(hunterForward);
        const shotObstacleImpact =
            hasDirectSight && sightConfirmed && !useStoreDoorAttack
                ? traceWeaponEnvironmentImpact({
                      start: weaponMuzzleWorldPosition,
                      end: chosenTargetPoint,
                      obstacles: traceObstacles,
                      ignoreOriginRadius: BOT_HUNTER_OBSTACLE_IGNORE_RADIUS,
                      shouldIgnoreObstacle: shouldIgnoreWeaponSoftOccluderObstacle,
                      shouldIgnoreHitObject: shouldIgnoreWeaponSoftOccluderSceneRaycastHit,
                  })
                : null;
        const withinFireEnvelope =
            distance >= BOT_HUNTER_MIN_FIRE_RANGE &&
            distance <= BOT_HUNTER_FIRE_RANGE &&
            forwardDot >= BOT_HUNTER_MIN_FORWARD_DOT;
        const canFire = useStoreDoorAttack
            ? withinFireEnvelope
            : hasDirectSight && sightConfirmed && withinFireEnvelope && !shotObstacleImpact;

        return {
            targetPoint: chosenTargetPoint.clone(),
            locked: useStoreDoorAttack || (hasDirectSight && sightConfirmed),
            canFire,
            muzzlePosition: weaponMuzzleWorldPosition.clone(),
            shotDirection: shotDirection.clone(),
        };
    }

    function updateHunterMountVisuals(hunterMount, aimState) {
        if (!hunterMount) {
            return;
        }

        const locked = Boolean(aimState?.locked);
        if (locked) {
            hunterReticleColor.copy(
                hunterState.triggerHeld ? RETICLE_LOCK_COLOR : RETICLE_HOT_COLOR
            );
        } else if (hunterState.triggerHeld) {
            hunterReticleColor.copy(RETICLE_HOT_COLOR);
        } else {
            hunterReticleColor.copy(RETICLE_DEFAULT_COLOR);
        }

        const pulse = 0.5 + 0.5 * Math.sin(state.lockPulse + hunterState.motionPhase * 0.7);
        const hotBlend = THREE.MathUtils.clamp(hunterState.heat * 0.8, 0, 1);
        for (let i = 0; i < hunterMount.glowMaterials.length; i += 1) {
            const material = hunterMount.glowMaterials[i];
            material.color.copy(hunterReticleColor);
            if (material.emissive?.isColor) {
                material.emissive.copy(hunterReticleColor);
            }
            if ('emissiveIntensity' in material) {
                material.emissiveIntensity = 0.62 + hunterState.heat * 0.48 + pulse * 0.22;
            }
        }
        for (let i = 0; i < hunterMount.holoMaterials.length; i += 1) {
            const material = hunterMount.holoMaterials[i];
            material.color.copy(hunterReticleColor);
            material.opacity = 0.28 + pulse * 0.16 + hunterState.heat * 0.1 + (locked ? 0.12 : 0);
        }
        for (let i = 0; i < hunterMount.metalMaterials.length; i += 1) {
            const material = hunterMount.metalMaterials[i];
            weaponTempColor.copy(WEAPON_METAL_COLOR).lerp(WEAPON_HOT_COLOR, hotBlend * 0.24);
            material.color.copy(weaponTempColor);
            material.emissive.copy(WEAPON_EDGE_COLOR).lerp(WEAPON_HOT_COLOR, hotBlend * 0.72);
            material.emissiveIntensity = 0.14 + hunterState.heat * 0.4;
        }

        hunterMount.holoReticle.scale.setScalar(1);
        hunterMount.holoHalo.scale.setScalar(1);
    }

    function resolveHunterMissShotState(aimState) {
        if (!aimState?.muzzlePosition || !aimState?.targetPoint || !aimState?.shotDirection) {
            return null;
        }

        const missTargetPoint = weaponTempVectorD.copy(aimState.targetPoint);
        const horizontalLateral = weaponTempVectorE.set(
            aimState.shotDirection.z,
            0,
            -aimState.shotDirection.x
        );
        if (horizontalLateral.lengthSq() <= 0.0001) {
            horizontalLateral.set(1, 0, 0);
        } else {
            horizontalLateral.normalize();
        }

        const sideSign = hunterState.missSideSign >= 0 ? 1 : -1;
        hunterState.missSideSign = -sideSign;
        const depthJitter =
            Math.sin(state.shotSequence * 0.73 + hunterState.motionPhase * 0.85) *
            BOT_HUNTER_PLAYER_MISS_DEPTH_JITTER;
        const verticalJitter =
            Math.cos(state.shotSequence * 0.57 + hunterState.motionPhase * 0.48) *
            BOT_HUNTER_PLAYER_MISS_VERTICAL_JITTER;
        missTargetPoint.addScaledVector(
            horizontalLateral,
            BOT_HUNTER_PLAYER_MISS_LATERAL_OFFSET * sideSign
        );
        missTargetPoint.addScaledVector(aimState.shotDirection, depthJitter);
        missTargetPoint.y += verticalJitter;

        const missShotDirection = weaponTempVectorB.subVectors(
            missTargetPoint,
            aimState.muzzlePosition
        );
        const missDistance = missShotDirection.length();
        if (!Number.isFinite(missDistance) || missDistance <= 0.0001) {
            return null;
        }
        missShotDirection.multiplyScalar(1 / missDistance);

        return {
            targetPoint: missTargetPoint.clone(),
            shotDirection: missShotDirection.clone(),
            distance: missDistance,
        };
    }

    function shouldHunterShotHitPlayer(aimState) {
        if (!aimState?.targetPoint || !aimState?.shotDirection) {
            return false;
        }
        return true;
    }

    function updateHunterWeaponThermals(dt) {
        const targetHeat = hunterState.triggerHeld ? 1 : 0;
        const heatRate =
            targetHeat > hunterState.heat ? WEAPON_HEAT_RISE * 60 * dt : WEAPON_HEAT_FALL * dt;
        hunterState.heat = THREE.MathUtils.lerp(
            hunterState.heat,
            targetHeat,
            THREE.MathUtils.clamp(heatRate, 0, 1)
        );
        hunterState.recoil = THREE.MathUtils.lerp(
            hunterState.recoil,
            0,
            1 - Math.exp(-(hunterState.triggerHeld ? WEAPON_RECOIL_RISE : WEAPON_RECOIL_FALL) * dt)
        );
    }

    function fireHunterShot(aimState) {
        if (!aimState?.muzzlePosition || !aimState?.shotDirection) {
            return;
        }

        state.shotSequence += 1;
        hunterState.recoil = 1;
        const hitPlayer = shouldHunterShotHitPlayer(aimState);
        const missShotState = hitPlayer ? null : resolveHunterMissShotState(aimState);
        const resolvedShotDirection = hitPlayer
            ? aimState.shotDirection
            : missShotState?.shotDirection || aimState.shotDirection;
        const resolvedTargetPoint = hitPlayer
            ? aimState.targetPoint || car.position
            : missShotState?.targetPoint || aimState.targetPoint || car.position;
        const resolvedShotDistance = hitPlayer
            ? Number(aimState.muzzlePosition.distanceTo?.(resolvedTargetPoint)) ||
              BOT_HUNTER_FIRE_RANGE
            : Number.isFinite(missShotState?.distance)
              ? missShotState.distance
              : Math.min(SHOT_RANGE, BOT_HUNTER_FIRE_RANGE);
        const shotEndPoint = weaponTempVectorA
            .copy(aimState.muzzlePosition)
            .addScaledVector(
                resolvedShotDirection,
                Math.min(SHOT_RANGE, BOT_HUNTER_FIRE_RANGE, resolvedShotDistance)
            );
        if (shotEndPoint.distanceToSquared(resolvedTargetPoint) > 0) {
            shotEndPoint.copy(resolvedTargetPoint);
        }

        const obstacleImpact = traceWeaponEnvironmentImpact({
            start: aimState.muzzlePosition,
            end: shotEndPoint,
            obstacles: getWeaponTraceObstacles(),
            ignoreOriginRadius: BOT_HUNTER_OBSTACLE_IGNORE_RADIUS,
            shouldIgnoreObstacle: shouldIgnoreWeaponSoftOccluderObstacle,
            shouldIgnoreHitObject: shouldIgnoreWeaponSoftOccluderSceneRaycastHit,
        });

        let resolvedHitTarget = null;
        let obstacleNormal = null;
        if (obstacleImpact) {
            shotEndPoint.copy(obstacleImpact.point);
            obstacleNormal = obstacleImpact.normal.clone();
        } else if (hitPlayer) {
            resolvedHitTarget = {
                targetKind: 'player',
                collectorId: 'player',
                name: 'Driver',
            };
        }

        spawnMuzzleFlash(aimState.muzzlePosition, resolvedShotDirection);
        spawnProjectile({
            start: aimState.muzzlePosition,
            end: shotEndPoint,
            direction: resolvedShotDirection,
            hitTarget: resolvedHitTarget,
            obstacleNormal,
            gameMode: 'bots',
        });
        getAudioController()?.onVehicleWeaponShot?.({
            locked: Boolean(aimState.locked),
            heat: hunterState.heat,
            position: aimState.muzzlePosition.clone(),
            direction: resolvedShotDirection.clone(),
            hostile: true,
        });
    }

    function resetHunterWeaponState() {
        hunterState.fireCooldown = 0;
        hunterState.recoil = 0;
        hunterState.heat = 0;
        hunterState.triggerHeld = false;
        hunterState.sightHoldSec = 0;
        hunterState.nextPlayerHitWindowAtMs =
            Date.now() +
            BOT_HUNTER_PLAYER_HIT_WINDOW_MIN_MS +
            Math.random() *
                Math.max(
                    0,
                    BOT_HUNTER_PLAYER_HIT_WINDOW_MAX_MS - BOT_HUNTER_PLAYER_HIT_WINDOW_MIN_MS
                );
    }

    function spawnProjectile({
        start,
        end,
        direction,
        hitTarget = null,
        obstacleNormal = null,
        gameMode = 'bots',
        speed = PROJECTILE_SPEED,
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
            speed: Math.max(1, Number(speed) || PROJECTILE_SPEED),
            targetCollectorId:
                typeof hitTarget?.collectorId === 'string' ? hitTarget.collectorId : '',
            targetKind:
                hitTarget?.targetKind === 'player'
                    ? 'player'
                    : typeof hitTarget?.collectorId === 'string' && hitTarget.collectorId
                      ? 'bot'
                      : '',
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
        const shockwaveMaterial = new THREE.MeshBasicMaterial({
            color: 0xffc18f,
            transparent: true,
            opacity: 0.74,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        });
        const smokeMaterial = new THREE.MeshBasicMaterial({
            map: pickupGlowTexture,
            color: 0x9fd8ff,
            transparent: true,
            opacity: 0.24,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        });
        const glow = new THREE.Mesh(muzzleFlashGlowGeometry, glowMaterial);
        const core = new THREE.Mesh(muzzleFlashCoreGeometry, coreMaterial);
        const shockwave = new THREE.Mesh(muzzleFlashShockwaveGeometry, shockwaveMaterial);
        const smoke = new THREE.Mesh(muzzleFlashSmokeGeometry, smokeMaterial);
        core.rotation.z = Math.PI * 0.25;
        shockwave.position.z = -0.04;
        smoke.position.y = 0.14;
        smoke.position.z = -0.12;
        smoke.rotation.z = Math.PI * 0.12;
        smoke.scale.set(0.82, 1.08, 1);
        group.add(smoke, shockwave, glow, core);
        effectRoot.add(group);

        activeMuzzleFlashes.push({
            group,
            glow,
            core,
            shockwave,
            smoke,
            glowMaterial,
            coreMaterial,
            shockwaveMaterial,
            smokeMaterial,
            flashLife: MUZZLE_FLASH_LIFETIME_SEC,
            flashTtl: MUZZLE_FLASH_LIFETIME_SEC,
            smokeLife: MUZZLE_SMOKE_LIFETIME_SEC,
            smokeTtl: MUZZLE_SMOKE_LIFETIME_SEC,
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
            flash.flashLife -= dt;
            flash.smokeLife -= dt;
            if (flash.smokeLife <= 0) {
                disposeMuzzleFlash(flash);
                activeMuzzleFlashes.splice(i, 1);
                continue;
            }
            const flashLifeNormalized = THREE.MathUtils.clamp(
                flash.flashLife / Math.max(0.0001, flash.flashTtl),
                0,
                1
            );
            const flashInverse = 1 - flashLifeNormalized;
            const smokeLifeNormalized = THREE.MathUtils.clamp(
                flash.smokeLife / Math.max(0.0001, flash.smokeTtl),
                0,
                1
            );
            const smokeInverse = 1 - smokeLifeNormalized;

            flash.group.scale.setScalar(0.84 + flashInverse * 0.54);
            flash.glowMaterial.opacity = flashLifeNormalized * 0.88;
            flash.coreMaterial.opacity = flashLifeNormalized;
            flash.shockwaveMaterial.opacity = flashLifeNormalized * 0.72;
            flash.shockwave.scale.setScalar(0.9 + flashInverse * 2.4);
            flash.smokeMaterial.opacity = smokeLifeNormalized * 0.22;
            flash.smoke.position.y = 0.14 + smokeInverse * 0.34;
            flash.smoke.scale.set(0.82 + smokeInverse * 0.58, 1.08 + smokeInverse * 1.7, 1);
            flash.group.rotation.z += dt * 12;
            flash.smoke.rotation.z += dt * 1.9;
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

        spawnImpact(projectile.impactPoint, projectile.direction, Boolean(projectile.targetKind));
        if (projectile.obstacleNormal) {
            spawnBulletMark(
                projectile.impactPoint,
                projectile.obstacleNormal,
                Boolean(projectile.targetKind)
            );
        }
        applyLorienVelmoreDoorWeaponImpact(getBuildingLayer(), projectile.impactPoint);
        const impactDistanceMeters = Number(projectile.impactPoint.distanceTo?.(car.position)) || 0;

        if (projectile.targetKind === 'player') {
            if (
                arePositionsSeparatedByUndergroundParking(
                    projectile.impactPoint,
                    car.position,
                    0.18
                )
            ) {
                getAudioController()?.onVehicleWeaponImpact?.({
                    hit: false,
                    destroyed: false,
                    position: projectile.impactPoint,
                    distanceMeters: impactDistanceMeters,
                    shotDirection: projectile.direction.clone(),
                });
                return;
            }
            const hitResult = onPlayerHit({
                shooterCollectorId: hunterState.collectorId,
                shooterName: hunterState.name,
                position: projectile.impactPoint.clone(),
                shotDirection: projectile.direction.clone(),
            });
            getAudioController()?.onVehicleWeaponImpact?.({
                hit: true,
                destroyed: Boolean(hitResult?.destroyed),
                position: projectile.impactPoint,
                distanceMeters: impactDistanceMeters,
                playerHit: true,
                shotDirection: projectile.direction.clone(),
            });
            return;
        }

        if (
            projectile.gameMode !== 'bots' ||
            projectile.targetKind !== 'bot' ||
            !projectile.targetCollectorId
        ) {
            getAudioController()?.onVehicleWeaponImpact?.({
                hit: Boolean(projectile.targetKind),
                destroyed: false,
                position: projectile.impactPoint,
                distanceMeters: impactDistanceMeters,
                shotDirection: projectile.direction.clone(),
            });
            return;
        }

        const botTrafficSystem = getBotTrafficSystem();
        if (!botTrafficSystem?.triggerWeaponHit) {
            getAudioController()?.onVehicleWeaponImpact?.({
                hit: Boolean(projectile.targetCollectorId),
                destroyed: false,
                position: projectile.impactPoint,
                distanceMeters: impactDistanceMeters,
                shotDirection: projectile.direction.clone(),
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
        getAudioController()?.onVehicleWeaponImpact?.({
            hit: Boolean(projectile.targetCollectorId),
            destroyed: Boolean(hitResult?.destroyed),
            position: projectile.impactPoint,
            distanceMeters: impactDistanceMeters,
            shotDirection: projectile.direction.clone(),
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

    function syncHud({ visible, hasWeapon, triggerHeld, locked, zoomed, heat, screenX, screenY }) {
        if (!hud.root || !hud.scope) {
            return;
        }
        const showScope = Boolean(visible && hasWeapon && zoomed);
        hud.scope.hidden = !showScope;
        hud.scope.dataset.armed = showScope ? 'true' : 'false';
        hud.scope.dataset.firing = triggerHeld ? 'true' : 'false';
        hud.scope.dataset.locked = locked ? 'true' : 'false';
        hud.scope.style.setProperty('--weapon-heat', THREE.MathUtils.clamp(heat, 0, 1).toFixed(3));
        if (!SCREEN_SPACE_WEAPON_HUD_ENABLED) {
            hud.root.hidden = true;
            return;
        }
        const hudProfile = resolveHudProfile();
        hud.root.hidden = !visible || !hasWeapon;
        hud.root.dataset.armed = visible && hasWeapon ? 'true' : 'false';
        hud.root.dataset.firing = triggerHeld ? 'true' : 'false';
        hud.root.dataset.locked = locked ? 'true' : 'false';
        hud.root.style.left = `${Math.round(Number(screenX) || window.innerWidth * 0.5)}px`;
        hud.root.style.top = `${Math.round(Number(screenY) || window.innerHeight * 0.5)}px`;
        hud.root.style.setProperty('--weapon-heat', THREE.MathUtils.clamp(heat, 0, 1).toFixed(3));
        hud.root.style.setProperty(
            '--weapon-hud-scale',
            THREE.MathUtils.clamp(Number(hudProfile?.hudScale) || 1, 0.65, 1.1).toFixed(3)
        );
    }

    function activatePickup() {
        resetPickupEntries();
    }

    function hideWeapon() {
        state.hasWeapon = false;
        mount.root.visible = false;
    }

    function despawnPickup(respawn = true) {
        for (let index = 0; index < pickupEntries.length; index += 1) {
            const entry = pickupEntries[index];
            entry.available = false;
            entry.pickup.root.visible = false;
            if (respawn) {
                entry.respawnTimer = PICKUP_RESPAWN_DELAY_SEC;
            }
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

function createWeaponPickup(anchor, rootName = 'vx9_pickup') {
    const root = new THREE.Group();
    root.name = rootName;
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
    root.name = 'lorien_vehicle_weapon_mount';

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
    sightBase.scale.set(0.82, 0.56, 1);
    sightBase.position.set(0, 0.22, 0.24);
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
    const holoReticle = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), holoMaterial);
    holoReticle.position.set(0, 0.42, 0.36);
    holoReticle.rotation.y = Math.PI;
    weaponGroup.add(holoReticle);

    const holoHaloMaterial = new THREE.MeshBasicMaterial({
        map: pickupGlowTexture,
        color: 0x61d5ff,
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
    });
    holoMaterials.push(holoHaloMaterial);
    const holoHalo = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.14), holoHaloMaterial);
    holoHalo.position.set(0, 0.42, 0.34);
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
    shouldIgnoreObstacle = null,
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
        if (typeof shouldIgnoreObstacle === 'function' && shouldIgnoreObstacle(obstacle)) {
            continue;
        }
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
    let root = document.getElementById('vehicleWeaponHud');
    let scope = document.getElementById('vehicleWeaponScopeOverlay');
    if (!root) {
        root = document.createElement('div');
        root.id = 'vehicleWeaponHud';
        root.hidden = true;
        root.setAttribute('aria-hidden', 'true');
        root.innerHTML = `
            <div class="vehicleWeaponHudReticle">
                <div class="vehicleWeaponHudCore"></div>
                <div class="vehicleWeaponHudRing"></div>
                <div class="vehicleWeaponHudArc vehicleWeaponHudArc--a"></div>
                <div class="vehicleWeaponHudArc vehicleWeaponHudArc--b"></div>
                <div class="vehicleWeaponHudCross vehicleWeaponHudCross--h"></div>
                <div class="vehicleWeaponHudCross vehicleWeaponHudCross--v"></div>
            </div>
        `;
        document.body.append(root);
    }
    if (!scope) {
        scope = document.createElement('div');
        scope.id = 'vehicleWeaponScopeOverlay';
        scope.hidden = true;
        scope.setAttribute('aria-hidden', 'true');
        scope.innerHTML = `
            <div class="vehicleWeaponScopeViewport">
                <div class="vehicleWeaponScopeRing"></div>
                <div class="vehicleWeaponScopeCross vehicleWeaponScopeCross--h"></div>
                <div class="vehicleWeaponScopeCross vehicleWeaponScopeCross--v"></div>
                <div class="vehicleWeaponScopeTick vehicleWeaponScopeTick--n"></div>
                <div class="vehicleWeaponScopeTick vehicleWeaponScopeTick--e"></div>
                <div class="vehicleWeaponScopeTick vehicleWeaponScopeTick--s"></div>
                <div class="vehicleWeaponScopeTick vehicleWeaponScopeTick--w"></div>
                <div class="vehicleWeaponScopeDot"></div>
            </div>
        `;
        document.body.append(scope);
    }
    return {
        root,
        scope,
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
    ctx.fillText('VX-9', canvas.width * 0.5, canvas.height * 0.42);

    ctx.shadowBlur = 0;
    ctx.font = "700 30px 'Sora', 'Segoe UI', sans-serif";
    ctx.fillStyle = 'rgba(213, 241, 255, 0.92)';
    ctx.fillText('AUTOMATIC PRECISION PLATFORM', canvas.width * 0.5, canvas.height * 0.76);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

export function createReplicatedVehicleWeaponVisualController({ scene, car } = {}) {
    if (!scene || !car) {
        return createNoopReplicatedVehicleWeaponVisualController();
    }

    const effectRoot = new THREE.Group();
    effectRoot.name = 'replicatedVehicleWeaponEffects';
    scene.add(effectRoot);

    const mountParent = car.getObjectByName('body_shell_group') || car;
    const mount = createWeaponMount();
    mount.root.visible = false;
    mountParent.add(mount.root);

    const reticleColor = new THREE.Color().copy(RETICLE_DEFAULT_COLOR);
    const targetReticleColor = new THREE.Color().copy(RETICLE_DEFAULT_COLOR);
    const aimTargetPoint = new THREE.Vector3();
    const muzzlePosition = new THREE.Vector3();
    const fallbackLookDirection = new THREE.Vector3();
    const fallbackLookPoint = new THREE.Vector3();
    const impactLookPoint = new THREE.Vector3();
    const flashLookPoint = new THREE.Vector3();
    const projectileUpVector = new THREE.Vector3(0, 1, 0);
    const projectileState = {
        hasWeapon: false,
        triggerHeld: false,
        heat: 0,
        locked: false,
        hasTarget: false,
        hoverPhase: Math.random() * Math.PI * 2,
        lockPulse: Math.random() * Math.PI * 2,
        recoil: 0,
        shotSequence: 0,
    };
    const activeProjectiles = [];
    const activeImpacts = [];
    const activeMuzzleFlashes = [];
    let disposed = false;

    return {
        applyReplicationState(snapshot = null) {
            if (disposed) {
                return;
            }
            projectileState.hasWeapon = Boolean(snapshot?.hasWeapon);
            projectileState.triggerHeld =
                projectileState.hasWeapon && Boolean(snapshot?.triggerHeld);
            projectileState.heat = THREE.MathUtils.clamp(Number(snapshot?.heat) || 0, 0, 1);
            projectileState.locked = projectileState.hasWeapon && Boolean(snapshot?.locked);

            const hasTarget = Boolean(snapshot?.hasTarget);
            const targetX = Number(snapshot?.targetX);
            const targetY = Number(snapshot?.targetY);
            const targetZ = Number(snapshot?.targetZ);
            if (
                hasTarget &&
                Number.isFinite(targetX) &&
                Number.isFinite(targetY) &&
                Number.isFinite(targetZ)
            ) {
                aimTargetPoint.set(targetX, targetY, targetZ);
                projectileState.hasTarget = true;
            } else {
                projectileState.hasTarget = false;
            }
        },
        playShot(snapshot = null) {
            if (disposed || !snapshot || typeof snapshot !== 'object') {
                return false;
            }

            const startX = Number(snapshot.startX);
            const startY = Number(snapshot.startY);
            const startZ = Number(snapshot.startZ);
            const endX = Number(snapshot.endX);
            const endY = Number(snapshot.endY);
            const endZ = Number(snapshot.endZ);
            const directionX = Number(snapshot.directionX);
            const directionY = Number(snapshot.directionY);
            const directionZ = Number(snapshot.directionZ);
            if (
                ![
                    startX,
                    startY,
                    startZ,
                    endX,
                    endY,
                    endZ,
                    directionX,
                    directionY,
                    directionZ,
                ].every(Number.isFinite)
            ) {
                return false;
            }

            const start = new THREE.Vector3(startX, startY, startZ);
            const end = new THREE.Vector3(endX, endY, endZ);
            const direction = new THREE.Vector3(directionX, directionY, directionZ);
            if (direction.lengthSq() <= 0.0001) {
                direction.subVectors(end, start);
            }
            if (direction.lengthSq() <= 0.0001) {
                return false;
            }
            direction.normalize();

            projectileState.shotSequence += 1;
            projectileState.recoil = 1;
            projectileState.triggerHeld = projectileState.hasWeapon;

            spawnReplicatedMuzzleFlash(start, direction);
            spawnReplicatedProjectile({
                start,
                end,
                direction,
                speed: THREE.MathUtils.clamp(Number(snapshot.speed) || PROJECTILE_SPEED, 1, 1200),
            });
            return true;
        },
        update(deltaTime = 1 / 60, vehicleState = {}, options = {}) {
            if (disposed) {
                return;
            }

            const dt = Math.min(Math.max(Number(deltaTime) || 0, 0), 0.05);
            if (dt <= 0) {
                updateReplicatedEffects(0);
                return;
            }

            projectileState.hoverPhase += dt * 2.2;
            projectileState.lockPulse += dt * 6.8;
            projectileState.recoil = THREE.MathUtils.lerp(
                projectileState.recoil,
                0,
                1 -
                    Math.exp(
                        -(projectileState.triggerHeld ? WEAPON_RECOIL_RISE : WEAPON_RECOIL_FALL) *
                            dt
                    )
            );

            const showMount =
                options.showMount !== false &&
                projectileState.hasWeapon &&
                options.isDestroyed !== true;
            mount.root.visible = showMount;
            if (showMount) {
                updateReplicatedMount(dt, vehicleState);
            }

            updateReplicatedEffects(dt);
        },
        dispose() {
            if (disposed) {
                return;
            }
            disposed = true;
            clearReplicatedEffects();
            mount.root.parent?.remove?.(mount.root);
            scene.remove(effectRoot);
        },
    };

    function updateReplicatedMount(dt, vehicleState = {}) {
        const speedRatio = THREE.MathUtils.clamp(Math.abs(vehicleState?.speed || 0) / 42, 0, 1.25);
        const throttleRatio = THREE.MathUtils.clamp(Math.abs(vehicleState?.throttle || 0), 0, 1);
        const idleSway = Math.sin(projectileState.hoverPhase * WEAPON_IDLE_SWAY_SPEED) * 0.01;
        const speedSway =
            Math.sin(projectileState.hoverPhase * (WEAPON_SPEED_SWAY_SPEED + speedRatio * 2.2)) *
            0.012 *
            speedRatio;
        const recoilShift = projectileState.recoil * 0.16;

        mount.root.position.set(
            0,
            WEAPON_MOUNT_BASE_Y + idleSway * 0.3,
            WEAPON_MOUNT_BASE_Z + recoilShift
        );
        mount.weaponGroup.position.set(0, speedSway * 0.5, recoilShift);
        mount.weaponGroup.rotation.z = speedSway * 1.2;
        mount.weaponGroup.rotation.x = idleSway * 0.9 + throttleRatio * 0.02;

        mountParent.updateWorldMatrix(true, false);
        mount.root.updateWorldMatrix(true, false);
        if (projectileState.hasTarget) {
            mount.pitchPivot.lookAt(aimTargetPoint);
        } else {
            mount.muzzleAnchor.getWorldPosition(muzzlePosition);
            fallbackLookDirection.set(0, 0, -1).applyQuaternion(car.quaternion).normalize();
            fallbackLookPoint
                .copy(muzzlePosition)
                .addScaledVector(fallbackLookDirection, CAMERA_AIM_RANGE);
            mount.pitchPivot.lookAt(fallbackLookPoint);
        }

        targetReticleColor.copy(RETICLE_DEFAULT_COLOR);
        if (projectileState.locked) {
            targetReticleColor.copy(
                projectileState.triggerHeld ? RETICLE_LOCK_COLOR : RETICLE_HOT_COLOR
            );
        } else if (projectileState.triggerHeld) {
            targetReticleColor.copy(RETICLE_HOT_COLOR);
        }
        reticleColor.lerp(targetReticleColor, 1 - Math.exp(-12 * dt));

        const pulse = 0.5 + 0.5 * Math.sin(projectileState.lockPulse);
        const lockPulse = 0.5 + 0.5 * Math.sin(projectileState.lockPulse * 1.6 + 0.7);
        const emissiveIntensity =
            0.65 +
            projectileState.heat * 1.2 +
            pulse * 0.22 +
            (projectileState.locked ? 0.35 + lockPulse * 0.28 : 0);

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
                projectileState.heat * 0.1 +
                (projectileState.locked ? 0.12 : 0);
        }
        const hotBlend = THREE.MathUtils.clamp(projectileState.heat * 0.8, 0, 1);
        for (let i = 0; i < mount.metalMaterials.length; i += 1) {
            const material = mount.metalMaterials[i];
            weaponTempColor.copy(WEAPON_METAL_COLOR).lerp(WEAPON_HOT_COLOR, hotBlend * 0.24);
            material.color.copy(weaponTempColor);
            material.emissive.copy(WEAPON_EDGE_COLOR).lerp(WEAPON_HOT_COLOR, hotBlend * 0.72);
            material.emissiveIntensity = 0.14 + projectileState.heat * 0.4;
        }

        mount.holoReticle.scale.setScalar(1);
        mount.holoHalo.scale.setScalar(1);
    }

    function spawnReplicatedProjectile({
        start = null,
        end = null,
        direction = null,
        speed = PROJECTILE_SPEED,
    } = {}) {
        if (!start || !end || !direction) {
            return;
        }
        while (activeProjectiles.length >= MAX_ACTIVE_PROJECTILES) {
            const entry = activeProjectiles.shift();
            disposeProjectile(entry);
        }

        const group = new THREE.Group();
        const coreMaterial = new THREE.MeshBasicMaterial({
            color: 0xd8fbff,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        });
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x67dbff,
            transparent: true,
            opacity: 0.42,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
            side: THREE.DoubleSide,
        });
        const tipMaterial = new THREE.MeshBasicMaterial({
            color: 0xf7ffff,
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
        group.quaternion.setFromUnitVectors(projectileUpVector, direction);
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
            speed: Math.max(1, Number(speed) || PROJECTILE_SPEED),
        });
    }

    function spawnReplicatedImpact(position, direction) {
        while (activeImpacts.length >= MAX_ACTIVE_IMPACTS) {
            const entry = activeImpacts.shift();
            disposeImpact(entry);
        }

        const group = new THREE.Group();
        group.position.copy(position);
        impactLookPoint.copy(position).add(direction);
        group.lookAt(impactLookPoint);

        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x8ee7ff,
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
            color: 0x61d7ff,
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

    function spawnReplicatedMuzzleFlash(position, direction) {
        while (activeMuzzleFlashes.length >= MAX_ACTIVE_MUZZLE_FLASHES) {
            const entry = activeMuzzleFlashes.shift();
            disposeMuzzleFlash(entry);
        }

        const group = new THREE.Group();
        group.position.copy(position);
        flashLookPoint.copy(position).add(direction);
        group.lookAt(flashLookPoint);

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
        const shockwaveMaterial = new THREE.MeshBasicMaterial({
            color: 0xffc18f,
            transparent: true,
            opacity: 0.74,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        });
        const smokeMaterial = new THREE.MeshBasicMaterial({
            map: pickupGlowTexture,
            color: 0x9fd8ff,
            transparent: true,
            opacity: 0.24,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        });
        const glow = new THREE.Mesh(muzzleFlashGlowGeometry, glowMaterial);
        const core = new THREE.Mesh(muzzleFlashCoreGeometry, coreMaterial);
        const shockwave = new THREE.Mesh(muzzleFlashShockwaveGeometry, shockwaveMaterial);
        const smoke = new THREE.Mesh(muzzleFlashSmokeGeometry, smokeMaterial);
        core.rotation.z = Math.PI * 0.25;
        shockwave.position.z = -0.04;
        smoke.position.y = 0.14;
        smoke.position.z = -0.12;
        smoke.rotation.z = Math.PI * 0.12;
        smoke.scale.set(0.82, 1.08, 1);
        group.add(smoke, shockwave, glow, core);
        effectRoot.add(group);

        activeMuzzleFlashes.push({
            group,
            glow,
            core,
            shockwave,
            smoke,
            glowMaterial,
            coreMaterial,
            shockwaveMaterial,
            smokeMaterial,
            flashLife: MUZZLE_FLASH_LIFETIME_SEC,
            flashTtl: MUZZLE_FLASH_LIFETIME_SEC,
            smokeLife: MUZZLE_SMOKE_LIFETIME_SEC,
            smokeTtl: MUZZLE_SMOKE_LIFETIME_SEC,
        });
    }

    function updateReplicatedEffects(dt) {
        for (let i = activeProjectiles.length - 1; i >= 0; i -= 1) {
            const projectile = activeProjectiles[i];
            projectile.life -= dt;
            const travelDistance =
                dt > 0
                    ? Math.min(projectile.remainingDistance, Math.max(0, projectile.speed * dt))
                    : 0;
            if (travelDistance > 0) {
                projectile.group.position.addScaledVector(projectile.direction, travelDistance);
                projectile.remainingDistance -= travelDistance;
            }

            const pulse =
                0.86 +
                Math.sin((projectileState.shotSequence + i) * 0.9 + projectile.life * 34) * 0.08;
            projectile.group.scale.setScalar(pulse);
            projectile.coreMaterial.opacity = 0.92;
            projectile.glowMaterial.opacity =
                0.42 + Math.max(0, 1 - projectile.life / PROJECTILE_MAX_LIFETIME_SEC) * 0.12;
            projectile.tipMaterial.opacity = 0.95;

            if (projectile.remainingDistance > 0.025 && projectile.life > 0) {
                continue;
            }
            spawnReplicatedImpact(projectile.impactPoint, projectile.direction);
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
            flash.flashLife -= dt;
            flash.smokeLife -= dt;
            if (flash.smokeLife <= 0) {
                disposeMuzzleFlash(flash);
                activeMuzzleFlashes.splice(i, 1);
                continue;
            }
            const flashLifeNormalized = THREE.MathUtils.clamp(
                flash.flashLife / Math.max(0.0001, flash.flashTtl),
                0,
                1
            );
            const flashInverse = 1 - flashLifeNormalized;
            const smokeLifeNormalized = THREE.MathUtils.clamp(
                flash.smokeLife / Math.max(0.0001, flash.smokeTtl),
                0,
                1
            );
            const smokeInverse = 1 - smokeLifeNormalized;

            flash.group.scale.setScalar(0.84 + flashInverse * 0.54);
            flash.glowMaterial.opacity = flashLifeNormalized * 0.88;
            flash.coreMaterial.opacity = flashLifeNormalized;
            flash.shockwaveMaterial.opacity = flashLifeNormalized * 0.72;
            flash.shockwave.scale.setScalar(0.9 + flashInverse * 2.4);
            flash.smokeMaterial.opacity = smokeLifeNormalized * 0.22;
            flash.smoke.position.y = 0.14 + smokeInverse * 0.34;
            flash.smoke.scale.set(0.82 + smokeInverse * 0.58, 1.08 + smokeInverse * 1.7, 1);
            flash.group.rotation.z += dt * 12;
            flash.smoke.rotation.z += dt * 1.9;
        }
    }

    function clearReplicatedEffects() {
        while (activeProjectiles.length > 0) {
            disposeProjectile(activeProjectiles.pop());
        }
        while (activeImpacts.length > 0) {
            disposeImpact(activeImpacts.pop());
        }
        while (activeMuzzleFlashes.length > 0) {
            disposeMuzzleFlash(activeMuzzleFlashes.pop());
        }
    }
}

function createNoopWeaponSystem() {
    return {
        update() {},
        setTriggerHeld() {},
        resetRound() {},
        onPlayerDestroyed() {},
        applyPickupStateSnapshot() {},
        hasWeapon() {
            return false;
        },
        getReplicationState() {
            return {
                hasWeapon: false,
                triggerHeld: false,
                heat: 0,
                locked: false,
                hasTarget: false,
                targetX: 0,
                targetY: 0,
                targetZ: 0,
            };
        },
    };
}

function createNoopReplicatedVehicleWeaponVisualController() {
    return {
        applyReplicationState() {},
        playShot() {
            return false;
        },
        update() {},
        dispose() {},
    };
}
