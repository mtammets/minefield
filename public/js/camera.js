import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import {
    ACTION_IDS,
    DEFAULT_KEY_BINDINGS,
    actionMatchesEvent,
    normalizeKeyboardKey,
} from './input-bindings.js';

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.3, 600);
camera.position.set(0, 3, 8);

let cameraViewMode = 1;
let manualCinematicMode = false;
let autoCinematicMode = false;
let cinematicAngle = 0;
let cinematicOrbitProgress = 0;
let cinematicLoopProgress = 0;
let cinematicBlend = 0;
let cinematicIdleTime = 0;
let cinematicExitBoostTimer = 0;
let cinematicWasActive = false;
let roofWeaponZoomBlend = 0;
const AUTO_CINEMATIC_IDLE_SEC = 5;
const CINEMATIC_LOOP_DURATION_SEC = 18;
const ROOF_WEAPON_ZOOM_IN_SPEED = 11.5;
const ROOF_WEAPON_ZOOM_OUT_SPEED = 8.5;
const ROOF_WEAPON_ZOOM_LOOK_SPEED = 17.5;
const CHASE_ROOF_WEAPON_ZOOM_CAMERA_LIFT = 0.9;
const CHASE_ROOF_WEAPON_ZOOM_LOOK_LIFT = 0.52;
const CHASE_ROOF_WEAPON_ZOOM_LOOK_AHEAD = 1.4;
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

const targetPosition = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const smoothedLookTarget = new THREE.Vector3();
const baseTargetPosition = new THREE.Vector3();
const baseLookTarget = new THREE.Vector3();
const cinematicTargetPosition = new THREE.Vector3();
const cinematicLookAtTarget = new THREE.Vector3();
const roofWeaponZoomDirection = new THREE.Vector3();
const roofWeaponZoomTargetPosition = new THREE.Vector3();
const roofCamLocalPosition = new THREE.Vector3(0.24, 1.92, 1.42);
const roofScreenLookLocal = new THREE.Vector3(0, 0.72, 0.14);
const roofCamWorldPosition = new THREE.Vector3();
const roofLookWorldPosition = new THREE.Vector3();
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

    const normalizedKey = normalizeKeyboardKey(event?.key || '');
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
        cameraViewMode = index + 1;
        autoCinematicMode = false;
        setCinematicMode(false);
        return;
    }
});

function updateCamera(car, speed, deltaTime = 1 / 60, options = {}) {
    const dt = Math.min(deltaTime, 0.05);
    const speedRatio = THREE.MathUtils.clamp(Math.abs(speed) / 20, 0, 1);
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

    const roofWeaponZoomActive = Boolean(options.roofWeaponZoomActive) && !cinematicMode;
    roofWeaponZoomBlend = THREE.MathUtils.lerp(
        roofWeaponZoomBlend,
        roofWeaponZoomActive ? 1 : 0,
        1 -
            Math.exp(
                -(roofWeaponZoomActive ? ROOF_WEAPON_ZOOM_IN_SPEED : ROOF_WEAPON_ZOOM_OUT_SPEED) *
                    dt
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
        case 6: {
            const dynamicSpeedRatio = THREE.MathUtils.clamp(Math.abs(speed) / 38, 0, 1);
            const backDistance = THREE.MathUtils.lerp(5.2, 9.6, dynamicSpeedRatio);
            const chaseHeight = THREE.MathUtils.lerp(1.9, 3.2, dynamicSpeedRatio);
            const lookAhead = THREE.MathUtils.lerp(5.5, 14, dynamicSpeedRatio);
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
                car.position.y + THREE.MathUtils.lerp(0.75, 1.45, dynamicSpeedRatio),
                car.position.z + forwardZ * lookAhead + rightZ * lookSide
            );

            followBlend = 1 - Math.exp(-THREE.MathUtils.lerp(5.8, 10.6, dynamicSpeedRatio) * dt);
            lookBlend = 1 - Math.exp(-THREE.MathUtils.lerp(6.2, 11.2, dynamicSpeedRatio) * dt);
            targetFov = THREE.MathUtils.lerp(76, 88, dynamicSpeedRatio);
            break;
        }
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

    const cinematicShot = resolveCinematicShot(car, speed, dt);
    targetPosition.copy(baseTargetPosition).lerp(cinematicTargetPosition, cinematicBlend);
    lookTarget.copy(baseLookTarget).lerp(cinematicLookAtTarget, cinematicBlend);
    const finalFollowBlend = THREE.MathUtils.lerp(
        followBlend,
        cinematicShot.followBlend,
        cinematicBlend
    );
    let finalLookBlend = THREE.MathUtils.lerp(lookBlend, cinematicShot.lookBlend, cinematicBlend);
    let finalFov = THREE.MathUtils.lerp(targetFov, cinematicShot.targetFov, cinematicBlend);

    if (roofWeaponZoomBlend > 0.001) {
        roofWeaponZoomTargetPosition.copy(targetPosition);
        roofWeaponZoomDirection.subVectors(lookTarget, targetPosition);
        const zoomDistance = roofWeaponZoomDirection.length();
        if (zoomDistance > 0.0001) {
            roofWeaponZoomDirection.multiplyScalar(1 / zoomDistance);
            roofWeaponZoomTargetPosition.addScaledVector(
                roofWeaponZoomDirection,
                resolveRoofWeaponZoomPullDistance(zoomDistance)
            );
            targetPosition.lerp(roofWeaponZoomTargetPosition, roofWeaponZoomBlend);
        }
        if (cameraViewMode === 6) {
            const chaseZoomForwardX = -Math.sin(smoothedHeading);
            const chaseZoomForwardZ = -Math.cos(smoothedHeading);
            targetPosition.y += CHASE_ROOF_WEAPON_ZOOM_CAMERA_LIFT * roofWeaponZoomBlend;
            lookTarget.x += chaseZoomForwardX * CHASE_ROOF_WEAPON_ZOOM_LOOK_AHEAD * roofWeaponZoomBlend;
            lookTarget.y += CHASE_ROOF_WEAPON_ZOOM_LOOK_LIFT * roofWeaponZoomBlend;
            lookTarget.z += chaseZoomForwardZ * CHASE_ROOF_WEAPON_ZOOM_LOOK_AHEAD * roofWeaponZoomBlend;
        }
        finalFov = THREE.MathUtils.lerp(
            finalFov,
            resolveRoofWeaponZoomFov(finalFov),
            roofWeaponZoomBlend
        );
        finalLookBlend = THREE.MathUtils.lerp(
            finalLookBlend,
            1 - Math.exp(-ROOF_WEAPON_ZOOM_LOOK_SPEED * dt),
            roofWeaponZoomBlend
        );
    }

    camera.position.lerp(targetPosition, finalFollowBlend);
    smoothedLookTarget.lerp(lookTarget, finalLookBlend);
    camera.lookAt(smoothedLookTarget);
    updateCameraFov(finalFov, dt);
}

export { camera, updateCamera };

export function setCameraKeyboardControlsEnabled(nextEnabled) {
    cameraKeyboardControlsEnabled = Boolean(nextEnabled);
}

export function setCameraViewMode(nextMode) {
    const numericMode = Math.round(Number(nextMode) || 0);
    if (numericMode < 1 || numericMode > 8) {
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
    roofWeaponZoomBlend = 0;
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

function resolveRoofWeaponZoomFov(baseFov) {
    switch (cameraViewMode) {
        case 6:
            return 20;
        case 7:
            return 16.5;
        case 2:
            return 24;
        default:
            return Math.max(18, Math.min(24, baseFov - 34));
    }
}

function resolveRoofWeaponZoomPullDistance(zoomDistance) {
    switch (cameraViewMode) {
        case 6:
            return Math.min(zoomDistance * 0.44, 3.9);
        case 7:
            return Math.min(zoomDistance * 0.24, 0.96);
        case 2:
            return Math.min(zoomDistance * 0.24, 1.8);
        default:
            return Math.min(zoomDistance * 0.38, 3.2);
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
    const fovLerp = 1 - Math.exp(-5.2 * dt);
    const nextFov = THREE.MathUtils.lerp(camera.fov, targetFov, fovLerp);
    if (Math.abs(nextFov - camera.fov) < 0.01) {
        return;
    }

    camera.fov = nextFov;
    camera.updateProjectionMatrix();
}
