import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import {
    ACTION_IDS,
    DEFAULT_KEY_BINDINGS,
    actionMatchesEvent,
    normalizeKeyboardKey,
} from './input-bindings.js';

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.3, 600);
camera.position.set(0, 3, 8);

let cameraViewMode = 6;
let manualCinematicMode = false;
let autoCinematicMode = false;
let cinematicAngle = 0;
let cinematicOrbitProgress = 0;
let cinematicLoopProgress = 0;
let cinematicBlend = 0;
let cinematicIdleTime = 0;
let cinematicExitBoostTimer = 0;
let cinematicWasActive = false;
let vehicleWeaponZoomBlend = 0;
const AUTO_CINEMATIC_IDLE_SEC = 5;
const CINEMATIC_LOOP_DURATION_SEC = 18;
const VEHICLE_WEAPON_ZOOM_IN_SPEED = 11.5;
const VEHICLE_WEAPON_ZOOM_OUT_SPEED = 8.5;
const VEHICLE_WEAPON_ZOOM_LOOK_SPEED = 17.5;
const CAMERA_FOV_MIN = 16;
const CAMERA_FOV_MAX = 100;
const DEFAULT_CAMERA_UP = new THREE.Vector3(0, 1, 0);
const TOP_DOWN_CAMERA_UP = new THREE.Vector3(0, 0, -1);
const CHASE_CAMERA_VIEW_MODE = 6;
const CHASE_CAMERA_SETTING_MIN = -1;
const CHASE_CAMERA_SETTING_MAX = 1;
const CHASE_CAMERA_DISTANCE_STEP = 0.14;
const CHASE_CAMERA_HEIGHT_STEP = 0.14;
const CHASE_CAMERA_DISTANCE_ADJUSTMENT = 2.4;
const CHASE_CAMERA_HEIGHT_ADJUSTMENT = 1.08;
const CHASE_CAMERA_LOOKAHEAD_DISTANCE_FACTOR = 2.1;
const CHASE_CAMERA_LOOKAHEAD_HEIGHT_FACTOR = 0.36;
const CHASE_CAMERA_FOV_DISTANCE_FACTOR = 5.6;
const CHASE_CAMERA_FOV_HEIGHT_FACTOR = 1.4;
const CHASE_CAMERA_BACK_DISTANCE_MIN = 5.2;
const CHASE_CAMERA_BACK_DISTANCE_MAX = 7.8;
const CHASE_CAMERA_HEIGHT_MIN = 1.9;
const CHASE_CAMERA_HEIGHT_MAX = 2.7;
const CHASE_CAMERA_LOOKAHEAD_MIN = 5.5;
const CHASE_CAMERA_LOOKAHEAD_MAX = 10.8;
const CHASE_CAMERA_TARGET_FOV_MIN = 76;
const CHASE_CAMERA_TARGET_FOV_MAX = 82;
const CINEMATIC_LOOP_TRACK = Object.freeze([
    { t: 0, radius: 11.8, height: 6.4, fov: 76, lookAhead: 2.6, lookHeight: 1.12 },
    { t: 0.22, radius: 10.1, height: 5.5, fov: 71, lookAhead: 2.2, lookHeight: 1.02 },
    { t: 0.48, radius: 7.3, height: 3.6, fov: 64, lookAhead: 1.9, lookHeight: 0.92 },
    { t: 0.72, radius: 4.9, height: 1.55, fov: 56, lookAhead: 1.45, lookHeight: 0.84 },
    { t: 0.9, radius: 6.4, height: 2.5, fov: 61, lookAhead: 1.7, lookHeight: 0.88 },
    { t: 1, radius: 11.8, height: 6.4, fov: 76, lookAhead: 2.6, lookHeight: 1.12 },
]);
let smoothedHeading = 0;
let smoothedTurnBias = 0;
let hasCameraState = false;
let cameraKeyboardControlsEnabled = true;
let chaseCameraSettings = createDefaultChaseCameraSettings();

const targetPosition = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const smoothedLookTarget = new THREE.Vector3();
const baseTargetPosition = new THREE.Vector3();
const baseLookTarget = new THREE.Vector3();
const cinematicTargetPosition = new THREE.Vector3();
const cinematicLookAtTarget = new THREE.Vector3();
const vehicleWeaponZoomDirection = new THREE.Vector3();
const vehicleWeaponZoomTargetPosition = new THREE.Vector3();
const vehicleWeaponZoomAimPoint = new THREE.Vector3();
const desiredCameraUp = new THREE.Vector3().copy(DEFAULT_CAMERA_UP);
const roofCamLocalPosition = new THREE.Vector3(0.24, 1.92, 1.42);
const roofScreenLookLocal = new THREE.Vector3(0, 0.72, 0.14);
const roofCamWorldPosition = new THREE.Vector3();
const roofLookWorldPosition = new THREE.Vector3();
const lastValidCameraPosition = camera.position.clone();
const lastValidLookTarget = new THREE.Vector3(0, 1, 0);
let lastValidCameraFov = camera.fov;
const cameraViewActionOrder = [
    ACTION_IDS.cameraView1,
    ACTION_IDS.cameraView2,
    ACTION_IDS.cameraView3,
    ACTION_IDS.cameraView4,
    ACTION_IDS.cameraView5,
    ACTION_IDS.cameraView6,
    ACTION_IDS.cameraView7,
    ACTION_IDS.cameraView8,
];

document.addEventListener('keydown', (event) => {
    if (!cameraKeyboardControlsEnabled) {
        return;
    }
    if (event.repeat) {
        return;
    }

    const normalizedKey = normalizeKeyboardKey(event?.key || '');
    if (isCameraViewCycleEvent(event, normalizedKey)) {
        event.preventDefault();
        cycleCameraViewMode();
        return;
    }
    if (
        actionMatchesEvent(
            ACTION_IDS.cameraCinematicToggle,
            event,
            DEFAULT_KEY_BINDINGS,
            normalizedKey
        )
    ) {
        event.preventDefault();
        setCinematicMode(!manualCinematicMode);
        return;
    }

    for (let index = 0; index < cameraViewActionOrder.length; index += 1) {
        if (
            !actionMatchesEvent(
                cameraViewActionOrder[index],
                event,
                DEFAULT_KEY_BINDINGS,
                normalizedKey
            )
        ) {
            continue;
        }
        event.preventDefault();
        setCameraViewMode(index + 1);
        return;
    }
});

function updateCamera(car, speed, deltaTime = 1 / 60, options = {}) {
    if (!isFiniteVector3Like(car?.position) || !Number.isFinite(car?.rotation?.y)) {
        restoreLastValidCameraState();
        resetCameraTrackingState();
        return;
    }

    const resolvedDeltaTime = Number.isFinite(deltaTime) && deltaTime > 0 ? deltaTime : 1 / 60;
    const dt = Math.min(resolvedDeltaTime, 0.05);
    const resolvedSpeed = Number.isFinite(speed) ? speed : 0;
    const speedRatio = THREE.MathUtils.clamp(Math.abs(resolvedSpeed) / 20, 0, 1);
    const followResponsiveness = THREE.MathUtils.lerp(4, 7.5, speedRatio);
    const lookResponsiveness = THREE.MathUtils.lerp(5, 8.5, speedRatio);
    const headingResponsiveness = THREE.MathUtils.lerp(4.5, 8, speedRatio);
    const followLerp = 1 - Math.exp(-followResponsiveness * dt);
    const lookLerp = 1 - Math.exp(-lookResponsiveness * dt);
    const headingLerp = 1 - Math.exp(-headingResponsiveness * dt);

    if (!hasCameraState) {
        smoothedHeading = car.rotation.y;
        smoothedTurnBias = 0;
        smoothedLookTarget.set(car.position.x, car.position.y + 0.5, car.position.z);
        hasCameraState = true;
    }

    const headingError = Math.atan2(
        Math.sin(car.rotation.y - smoothedHeading),
        Math.cos(car.rotation.y - smoothedHeading)
    );
    const turnBiasTarget = THREE.MathUtils.clamp(headingError * 5.5, -1, 1);
    const turnBiasLerp = 1 - Math.exp(-6.5 * dt);
    smoothedTurnBias = THREE.MathUtils.lerp(smoothedTurnBias, turnBiasTarget, turnBiasLerp);
    smoothedHeading = lerpAngle(smoothedHeading, car.rotation.y, headingLerp);
    const vehicleState = options.vehicleState || null;
    const allowAutoCinematic = options.allowAutoCinematic !== false;
    const driveInputActive =
        Math.abs(Number(vehicleState?.throttle) || 0) > 0.06 ||
        Math.abs(Number(vehicleState?.brake) || 0) > 0.05 ||
        Math.abs(Number(vehicleState?.steerInput) || 0) > 0.08 ||
        Boolean(options.handbrakeActive);

    if (!manualCinematicMode && allowAutoCinematic) {
        if (driveInputActive) {
            cinematicIdleTime = 0;
            if (autoCinematicMode) {
                autoCinematicMode = false;
                cinematicExitBoostTimer = 1.1;
            }
        } else {
            cinematicIdleTime += dt;
            if (cinematicIdleTime >= AUTO_CINEMATIC_IDLE_SEC) {
                autoCinematicMode = true;
            }
        }
    } else {
        cinematicIdleTime = 0;
        if (!allowAutoCinematic) {
            autoCinematicMode = false;
        }
    }

    const cinematicMode = manualCinematicMode || autoCinematicMode;
    if (cinematicMode && !cinematicWasActive) {
        syncCinematicEntryToCurrentView(car);
    }
    const cinematicBlendTarget = cinematicMode ? 1 : 0;
    const cinematicBlendRate =
        cinematicBlendTarget > cinematicBlend ? 0.95 : cinematicExitBoostTimer > 0 ? 4.8 : 3.1;
    cinematicBlend = THREE.MathUtils.lerp(
        cinematicBlend,
        cinematicBlendTarget,
        1 - Math.exp(-cinematicBlendRate * dt)
    );
    cinematicExitBoostTimer = Math.max(0, cinematicExitBoostTimer - dt);

    if (cinematicMode || cinematicBlend > 0.001) {
        cinematicOrbitProgress = (cinematicOrbitProgress + dt / CINEMATIC_LOOP_DURATION_SEC) % 1;
        cinematicLoopProgress = (cinematicLoopProgress + dt / CINEMATIC_LOOP_DURATION_SEC) % 1;
        cinematicAngle = cinematicOrbitProgress * Math.PI * 2;
    }
    cinematicWasActive = cinematicMode;

    const vehicleWeaponZoomActive = Boolean(options.vehicleWeaponZoomActive) && !cinematicMode;
    vehicleWeaponZoomBlend = THREE.MathUtils.lerp(
        vehicleWeaponZoomBlend,
        vehicleWeaponZoomActive ? 1 : 0,
        1 -
            Math.exp(
                -(vehicleWeaponZoomActive
                    ? VEHICLE_WEAPON_ZOOM_IN_SPEED
                    : VEHICLE_WEAPON_ZOOM_OUT_SPEED) * dt
            )
    );

    let followBlend = followLerp;
    let lookBlend = lookLerp;
    let targetFov = 75;

    switch (cameraViewMode) {
        case 1:
            baseTargetPosition.set(car.position.x, car.position.y + 2, car.position.z);
            baseLookTarget.set(
                car.position.x - Math.sin(smoothedHeading) * 10,
                car.position.y + 2,
                car.position.z - Math.cos(smoothedHeading) * 10
            );
            break;
        case 2:
            baseTargetPosition.set(car.position.x, car.position.y + 50, car.position.z);
            baseLookTarget.set(car.position.x, car.position.y, car.position.z);
            break;
        case 3:
            baseTargetPosition.set(
                car.position.x + Math.sin(smoothedHeading) * 4,
                car.position.y + 1,
                car.position.z + Math.cos(smoothedHeading) * 4
            );
            baseLookTarget.set(car.position.x, car.position.y, car.position.z);
            break;
        case 4:
            baseTargetPosition.set(
                car.position.x + Math.cos(smoothedHeading) * 5,
                car.position.y + 2,
                car.position.z - Math.sin(smoothedHeading) * 5
            );
            baseLookTarget.set(car.position.x, car.position.y + 1, car.position.z);
            break;
        case 5:
            baseTargetPosition.set(
                car.position.x + Math.sin(smoothedHeading) * 10,
                car.position.y + 8,
                car.position.z + Math.cos(smoothedHeading) * 10
            );
            baseLookTarget.set(car.position.x, car.position.y, car.position.z);
            break;
        case CHASE_CAMERA_VIEW_MODE:
            ({ followBlend, lookBlend, targetFov } = resolveChaseCameraTargets(
                car,
                resolvedSpeed,
                dt
            ));
            break;
        case 7: {
            roofCamWorldPosition.copy(roofCamLocalPosition);
            roofLookWorldPosition.copy(roofScreenLookLocal);
            car.localToWorld(roofCamWorldPosition);
            car.localToWorld(roofLookWorldPosition);

            baseTargetPosition.copy(roofCamWorldPosition);
            baseLookTarget.copy(roofLookWorldPosition);
            followBlend = 1 - Math.exp(-14 * dt);
            lookBlend = 1 - Math.exp(-16 * dt);
            targetFov = 36;
            break;
        }
        case 8:
        default:
            baseTargetPosition.set(
                car.position.x + Math.sin(smoothedHeading) * 6,
                car.position.y + 3,
                car.position.z + Math.cos(smoothedHeading) * 6
            );
            baseLookTarget.set(car.position.x, car.position.y + 0.5, car.position.z);
            break;
    }

    if (!isFiniteVector3Like(baseTargetPosition) || !isFiniteVector3Like(baseLookTarget)) {
        ({ followBlend, lookBlend, targetFov } = resolveChaseCameraTargets(car, resolvedSpeed, dt));
    }

    const cinematicShot = resolveCinematicShot(car, resolvedSpeed, dt);
    targetPosition.copy(baseTargetPosition).lerp(cinematicTargetPosition, cinematicBlend);
    lookTarget.copy(baseLookTarget).lerp(cinematicLookAtTarget, cinematicBlend);
    let finalFollowBlend = THREE.MathUtils.lerp(
        followBlend,
        cinematicShot.followBlend,
        cinematicBlend
    );
    let finalLookBlend = THREE.MathUtils.lerp(lookBlend, cinematicShot.lookBlend, cinematicBlend);
    let finalFov = THREE.MathUtils.lerp(targetFov, cinematicShot.targetFov, cinematicBlend);

    if (vehicleWeaponZoomBlend > 0.001) {
        vehicleWeaponZoomTargetPosition.copy(targetPosition);
        vehicleWeaponZoomDirection.subVectors(lookTarget, targetPosition);
        const zoomDistance = vehicleWeaponZoomDirection.length();
        if (zoomDistance > 0.0001) {
            vehicleWeaponZoomDirection.multiplyScalar(1 / zoomDistance);
            vehicleWeaponZoomTargetPosition.addScaledVector(
                vehicleWeaponZoomDirection,
                resolveVehicleWeaponZoomPullDistance(zoomDistance)
            );
            targetPosition.lerp(vehicleWeaponZoomTargetPosition, vehicleWeaponZoomBlend);
        }
        if (isFiniteVector3Like(options.vehicleWeaponAimPoint)) {
            vehicleWeaponZoomAimPoint.copy(options.vehicleWeaponAimPoint);
            lookTarget.lerp(vehicleWeaponZoomAimPoint, vehicleWeaponZoomBlend);
        }
        finalFov = THREE.MathUtils.lerp(
            finalFov,
            resolveVehicleWeaponZoomFov(finalFov),
            vehicleWeaponZoomBlend
        );
        finalFollowBlend = THREE.MathUtils.lerp(
            finalFollowBlend,
            1 - Math.exp(-VEHICLE_WEAPON_ZOOM_LOOK_SPEED * dt),
            vehicleWeaponZoomBlend
        );
        finalLookBlend = THREE.MathUtils.lerp(
            finalLookBlend,
            1 - Math.exp(-VEHICLE_WEAPON_ZOOM_LOOK_SPEED * dt),
            vehicleWeaponZoomBlend
        );
    }

    if (!isFiniteVector3Like(targetPosition) || !isFiniteVector3Like(lookTarget)) {
        restoreLastValidCameraState();
        resetCameraTrackingState();
        return;
    }

    desiredCameraUp.copy(resolveCameraUpVector(cameraViewMode));
    camera.up.copy(desiredCameraUp);
    camera.position.lerp(targetPosition, finalFollowBlend);
    smoothedLookTarget.lerp(lookTarget, finalLookBlend);
    if (!isFiniteVector3Like(camera.position) || !isFiniteVector3Like(smoothedLookTarget)) {
        restoreLastValidCameraState();
        resetCameraTrackingState();
        return;
    }
    camera.lookAt(smoothedLookTarget);
    updateCameraFov(finalFov, dt);
    captureLastValidCameraState();
}

export { camera, updateCamera };

export function setCameraKeyboardControlsEnabled(nextEnabled) {
    cameraKeyboardControlsEnabled = Boolean(nextEnabled);
}

export function getChaseCameraSettings() {
    return {
        ...chaseCameraSettings,
    };
}

export function setChaseCameraSettings(nextSettings = {}) {
    chaseCameraSettings = normalizeChaseCameraSettings(nextSettings, chaseCameraSettings);
    return getChaseCameraSettings();
}

export function adjustChaseCameraSettings({ distanceStep = 0, heightStep = 0 } = {}) {
    return setChaseCameraSettings({
        distanceBias:
            chaseCameraSettings.distanceBias +
            resolveFiniteNumber(distanceStep, 0) * CHASE_CAMERA_DISTANCE_STEP,
        heightBias:
            chaseCameraSettings.heightBias +
            resolveFiniteNumber(heightStep, 0) * CHASE_CAMERA_HEIGHT_STEP,
    });
}

export function resetChaseCameraSettings() {
    chaseCameraSettings = createDefaultChaseCameraSettings();
    return getChaseCameraSettings();
}

export function getChaseCameraTuneSnapshot() {
    const settings = getChaseCameraSettings();
    return {
        ...settings,
        distancePercent: normalizeChaseCameraSettingPercent(settings.distanceBias),
        heightPercent: normalizeChaseCameraSettingPercent(settings.heightBias),
        distanceTone: resolveChaseCameraDistanceTone(settings.distanceBias),
        heightTone: resolveChaseCameraHeightTone(settings.heightBias),
    };
}

export function setCameraViewMode(nextMode) {
    const numericMode = Math.round(Number(nextMode) || 0);
    if (numericMode < 1 || numericMode > cameraViewActionOrder.length) {
        return cameraViewMode;
    }
    cameraViewMode = numericMode;
    autoCinematicMode = false;
    setCinematicMode(false);
    return cameraViewMode;
}

export function getCameraViewMode() {
    return cameraViewMode;
}

export function resetCameraTrackingState() {
    hasCameraState = false;
    smoothedTurnBias = 0;
    vehicleWeaponZoomBlend = 0;
    cinematicOrbitProgress = 0;
    cinematicLoopProgress = 0;
    cinematicBlend = 0;
    cinematicIdleTime = 0;
    cinematicExitBoostTimer = 0;
    cinematicWasActive = false;
}

function setCinematicMode(nextEnabled) {
    const enabled = Boolean(nextEnabled);
    if (manualCinematicMode === enabled) {
        return;
    }
    manualCinematicMode = enabled;
    if (enabled) {
        autoCinematicMode = false;
    }
    cinematicIdleTime = 0;
    if (!enabled) {
        cinematicWasActive = false;
    }
}

function cycleCameraViewMode() {
    const nextIndex = cameraViewMode % cameraViewActionOrder.length;
    setCameraViewMode(nextIndex + 1);
}

function resolveCinematicShot(car, speed, dt) {
    const speedRatio = THREE.MathUtils.clamp(Math.abs(speed) / 28, 0, 1);
    const followBlend = 1 - Math.exp(-THREE.MathUtils.lerp(3.8, 5.6, speedRatio) * dt);
    const lookBlend = 1 - Math.exp(-THREE.MathUtils.lerp(4.6, 6.6, speedRatio) * dt);
    const sinHeading = Math.sin(smoothedHeading);
    const cosHeading = Math.cos(smoothedHeading);
    const forwardX = -sinHeading;
    const forwardZ = -cosHeading;
    const loopSample = sampleCinematicLoopTrack(cinematicLoopProgress);
    const cinematicRadius = loopSample.radius + speedRatio * 0.8;
    const cinematicHeight = loopSample.height + speedRatio * 0.45;

    cinematicTargetPosition.set(
        car.position.x + Math.cos(cinematicAngle) * cinematicRadius,
        car.position.y + cinematicHeight,
        car.position.z + Math.sin(cinematicAngle) * cinematicRadius
    );
    cinematicLookAtTarget.set(
        car.position.x + forwardX * (loopSample.lookAhead + speedRatio * 1.1),
        car.position.y + loopSample.lookHeight,
        car.position.z + forwardZ * (loopSample.lookAhead + speedRatio * 1.1)
    );

    const targetFov = loopSample.fov;

    return {
        followBlend,
        lookBlend,
        targetFov,
    };
}

function sampleCinematicLoopTrack(progress) {
    const normalized = THREE.MathUtils.euclideanModulo(progress, 1);
    for (let index = 0; index < CINEMATIC_LOOP_TRACK.length - 1; index += 1) {
        const from = CINEMATIC_LOOP_TRACK[index];
        const to = CINEMATIC_LOOP_TRACK[index + 1];
        if (normalized > to.t) {
            continue;
        }
        const span = Math.max(0.0001, to.t - from.t);
        const alpha = smoothstep01((normalized - from.t) / span);
        return {
            radius: THREE.MathUtils.lerp(from.radius, to.radius, alpha),
            height: THREE.MathUtils.lerp(from.height, to.height, alpha),
            fov: THREE.MathUtils.lerp(from.fov, to.fov, alpha),
            lookAhead: THREE.MathUtils.lerp(from.lookAhead, to.lookAhead, alpha),
            lookHeight: THREE.MathUtils.lerp(from.lookHeight, to.lookHeight, alpha),
        };
    }

    const fallback = CINEMATIC_LOOP_TRACK[CINEMATIC_LOOP_TRACK.length - 1];
    return {
        radius: fallback.radius,
        height: fallback.height,
        fov: fallback.fov,
        lookAhead: fallback.lookAhead,
        lookHeight: fallback.lookHeight,
    };
}

function syncCinematicEntryToCurrentView(car) {
    const offsetX = camera.position.x - car.position.x;
    const offsetZ = camera.position.z - car.position.z;
    const radius = Math.hypot(offsetX, offsetZ);
    const height = camera.position.y - car.position.y;
    const orbitAngle = radius > 0.001 ? Math.atan2(offsetZ, offsetX) : 0;

    cinematicAngle = orbitAngle;
    cinematicOrbitProgress =
        THREE.MathUtils.euclideanModulo(orbitAngle, Math.PI * 2) / (Math.PI * 2);
    cinematicLoopProgress = findClosestCinematicTrackProgress(radius, height);
}

function findClosestCinematicTrackProgress(radius, height) {
    let closestProgress = CINEMATIC_LOOP_TRACK[0].t;
    let closestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < CINEMATIC_LOOP_TRACK.length - 1; index += 1) {
        const sample = CINEMATIC_LOOP_TRACK[index];
        const radiusError = sample.radius - radius;
        const heightError = sample.height - height;
        const score = radiusError * radiusError + heightError * heightError * 2.6;
        if (score >= closestScore) {
            continue;
        }
        closestScore = score;
        closestProgress = sample.t;
    }
    return closestProgress;
}

function resolveChaseCameraTargets(car, speed, dt) {
    const dynamicSpeedRatio = THREE.MathUtils.clamp(Math.abs(speed) / 38, 0, 1);
    const distanceBias = chaseCameraSettings.distanceBias;
    const heightBias = chaseCameraSettings.heightBias;
    const backDistance = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(
            CHASE_CAMERA_BACK_DISTANCE_MIN,
            CHASE_CAMERA_BACK_DISTANCE_MAX,
            dynamicSpeedRatio
        ) +
            distanceBias * CHASE_CAMERA_DISTANCE_ADJUSTMENT,
        3.2,
        12.8
    );
    const chaseHeight = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(
            CHASE_CAMERA_HEIGHT_MIN,
            CHASE_CAMERA_HEIGHT_MAX,
            dynamicSpeedRatio
        ) +
            heightBias * CHASE_CAMERA_HEIGHT_ADJUSTMENT,
        1,
        5.2
    );
    const lookAhead = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(
            CHASE_CAMERA_LOOKAHEAD_MIN,
            CHASE_CAMERA_LOOKAHEAD_MAX,
            dynamicSpeedRatio
        ) +
            distanceBias * CHASE_CAMERA_LOOKAHEAD_DISTANCE_FACTOR +
            heightBias * CHASE_CAMERA_LOOKAHEAD_HEIGHT_FACTOR,
        4.4,
        17.5
    );
    const sideOffset = THREE.MathUtils.clamp(
        -smoothedTurnBias * (1.3 + dynamicSpeedRatio * 2.4),
        -2.6,
        2.6
    );
    const lookSide = sideOffset * -0.28;
    const turnLift = Math.abs(smoothedTurnBias) * 0.45;

    const sinHeading = Math.sin(smoothedHeading);
    const cosHeading = Math.cos(smoothedHeading);
    const forwardX = -sinHeading;
    const forwardZ = -cosHeading;
    const rightX = cosHeading;
    const rightZ = -sinHeading;

    baseTargetPosition.set(
        car.position.x - forwardX * backDistance + rightX * sideOffset,
        car.position.y + chaseHeight + turnLift,
        car.position.z - forwardZ * backDistance + rightZ * sideOffset
    );
    baseLookTarget.set(
        car.position.x + forwardX * lookAhead + rightX * lookSide,
        car.position.y +
            THREE.MathUtils.clamp(
                THREE.MathUtils.lerp(0.75, 1.45, dynamicSpeedRatio) + heightBias * 0.22,
                0.55,
                1.95
            ),
        car.position.z + forwardZ * lookAhead + rightZ * lookSide
    );

    return {
        followBlend: 1 - Math.exp(-THREE.MathUtils.lerp(5.8, 10.6, dynamicSpeedRatio) * dt),
        lookBlend: 1 - Math.exp(-THREE.MathUtils.lerp(6.2, 11.2, dynamicSpeedRatio) * dt),
        targetFov: clampFiniteNumber(
            THREE.MathUtils.lerp(
                CHASE_CAMERA_TARGET_FOV_MIN,
                CHASE_CAMERA_TARGET_FOV_MAX,
                dynamicSpeedRatio
            ) +
                distanceBias * CHASE_CAMERA_FOV_DISTANCE_FACTOR +
                heightBias * CHASE_CAMERA_FOV_HEIGHT_FACTOR,
            CAMERA_FOV_MIN,
            CAMERA_FOV_MAX,
            75
        ),
    };
}

function resolveVehicleWeaponZoomFov(baseFov) {
    switch (cameraViewMode) {
        case 7:
            return 16.5;
        case 2:
            return 24;
        default:
            return Math.max(18, Math.min(24, baseFov - 34));
    }
}

function resolveVehicleWeaponZoomPullDistance(zoomDistance) {
    switch (cameraViewMode) {
        case 7:
            return Math.min(zoomDistance * 0.24, 0.96);
        case 2:
            return Math.min(zoomDistance * 0.24, 1.8);
        default:
            return Math.min(zoomDistance * 0.38, 3.2);
    }
}

function resolveCameraUpVector(viewMode) {
    switch (viewMode) {
        case 2:
            return TOP_DOWN_CAMERA_UP;
        default:
            return DEFAULT_CAMERA_UP;
    }
}

function smoothstep01(value) {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
}

function lerpAngle(a, b, t) {
    const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + delta * t;
}

function updateCameraFov(targetFov, dt) {
    const safeTargetFov = clampFiniteNumber(targetFov, CAMERA_FOV_MIN, CAMERA_FOV_MAX, 75);
    const fovLerp = 1 - Math.exp(-5.2 * dt);
    const nextFov = THREE.MathUtils.lerp(
        clampFiniteNumber(camera.fov, CAMERA_FOV_MIN, CAMERA_FOV_MAX, lastValidCameraFov),
        safeTargetFov,
        fovLerp
    );
    if (Math.abs(nextFov - camera.fov) < 0.01) {
        return;
    }

    camera.fov = nextFov;
    camera.updateProjectionMatrix();
}

function captureLastValidCameraState() {
    if (!isFiniteVector3Like(camera.position) || !isFiniteVector3Like(smoothedLookTarget)) {
        return;
    }
    lastValidCameraPosition.copy(camera.position);
    lastValidLookTarget.copy(smoothedLookTarget);
    lastValidCameraFov = clampFiniteNumber(camera.fov, CAMERA_FOV_MIN, CAMERA_FOV_MAX, 75);
}

function restoreLastValidCameraState() {
    if (
        !isFiniteVector3Like(lastValidCameraPosition) ||
        !isFiniteVector3Like(lastValidLookTarget)
    ) {
        return;
    }
    camera.position.copy(lastValidCameraPosition);
    smoothedLookTarget.copy(lastValidLookTarget);
    camera.fov = clampFiniteNumber(lastValidCameraFov, CAMERA_FOV_MIN, CAMERA_FOV_MAX, 75);
    camera.lookAt(smoothedLookTarget);
    camera.updateProjectionMatrix();
}

function isFiniteVector3Like(value) {
    return Number.isFinite(value?.x) && Number.isFinite(value?.y) && Number.isFinite(value?.z);
}

function clampFiniteNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return THREE.MathUtils.clamp(numeric, min, max);
}

function createDefaultChaseCameraSettings() {
    return {
        distanceBias: 0,
        heightBias: 0,
    };
}

function normalizeChaseCameraSettings(value = {}, fallback = createDefaultChaseCameraSettings()) {
    const source = value && typeof value === 'object' ? value : {};
    const base = fallback && typeof fallback === 'object' ? fallback : createDefaultChaseCameraSettings();
    return {
        distanceBias: clampChaseCameraSettingValue(source.distanceBias, base.distanceBias),
        heightBias: clampChaseCameraSettingValue(source.heightBias, base.heightBias),
    };
}

function clampChaseCameraSettingValue(value, fallback = 0) {
    const numeric = resolveFiniteNumber(value, fallback);
    return THREE.MathUtils.clamp(numeric, CHASE_CAMERA_SETTING_MIN, CHASE_CAMERA_SETTING_MAX);
}

function resolveFiniteNumber(value, fallback = 0) {
    return Number.isFinite(value) ? Number(value) : Number(fallback) || 0;
}

function normalizeChaseCameraSettingPercent(value) {
    const normalized = clampChaseCameraSettingValue(value, 0);
    return ((normalized - CHASE_CAMERA_SETTING_MIN) /
        (CHASE_CAMERA_SETTING_MAX - CHASE_CAMERA_SETTING_MIN)) *
        100;
}

function resolveChaseCameraDistanceTone(value) {
    if (value <= -0.42) {
        return 'TIGHT';
    }
    if (value >= 0.42) {
        return 'WIDE';
    }
    return 'BALANCED';
}

function resolveChaseCameraHeightTone(value) {
    if (value <= -0.42) {
        return 'LOW';
    }
    if (value >= 0.42) {
        return 'HIGH';
    }
    return 'NEUTRAL';
}

function isCameraViewCycleEvent(event, normalizedKey = '') {
    if (event?.ctrlKey || event?.altKey || event?.metaKey) {
        return false;
    }
    return normalizedKey === '+' || event?.code === 'NumpadAdd';
}
