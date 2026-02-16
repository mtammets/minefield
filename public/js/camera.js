import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.3, 600);
camera.position.set(0, 3, 8);

let cameraViewMode = 0;
let cinematicMode = false;
let cinematicAngle = 0;
const CINEMATIC_ORBIT_SPEED = 0.42;
let smoothedHeading = 0;
let smoothedTurnBias = 0;
let hasCameraState = false;

const targetPosition = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const smoothedLookTarget = new THREE.Vector3();

document.addEventListener('keydown', (event) => {
    if (event.key >= '1' && event.key <= '6') {
        cameraViewMode = parseInt(event.key, 10);
        cinematicMode = false;
    }

    if (event.key.toLowerCase() === 'c') {
        cinematicMode = !cinematicMode;
    }
});

function updateCamera(car, speed, deltaTime = 1 / 60) {
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

    if (cinematicMode) {
        cinematicAngle += dt * CINEMATIC_ORBIT_SPEED;
        const cinematicRadius = 10;
        const cinematicHeight = 5 + Math.sin(cinematicAngle * 2) * 1.8;

        targetPosition.set(
            car.position.x + Math.cos(cinematicAngle) * cinematicRadius,
            car.position.y + cinematicHeight,
            car.position.z + Math.sin(cinematicAngle) * cinematicRadius
        );

        camera.position.lerp(targetPosition, 1 - Math.exp(-3.8 * dt));
        lookTarget.set(car.position.x, car.position.y + 1, car.position.z);
        smoothedLookTarget.lerp(lookTarget, lookLerp);
        camera.lookAt(smoothedLookTarget);
        updateCameraFov(75, dt);
        return;
    }

    let followBlend = followLerp;
    let lookBlend = lookLerp;
    let targetFov = 75;

    switch (cameraViewMode) {
        case 1:
            targetPosition.set(car.position.x, car.position.y + 2, car.position.z);
            lookTarget.set(
                car.position.x - Math.sin(smoothedHeading) * 10,
                car.position.y + 2,
                car.position.z - Math.cos(smoothedHeading) * 10
            );
            break;
        case 2:
            targetPosition.set(car.position.x, car.position.y + 50, car.position.z);
            lookTarget.set(car.position.x, car.position.y, car.position.z);
            break;
        case 3:
            targetPosition.set(
                car.position.x + Math.sin(smoothedHeading) * 4,
                car.position.y + 1,
                car.position.z + Math.cos(smoothedHeading) * 4
            );
            lookTarget.set(car.position.x, car.position.y, car.position.z);
            break;
        case 4:
            targetPosition.set(
                car.position.x + Math.cos(smoothedHeading) * 5,
                car.position.y + 2,
                car.position.z - Math.sin(smoothedHeading) * 5
            );
            lookTarget.set(car.position.x, car.position.y + 1, car.position.z);
            break;
        case 5:
            targetPosition.set(
                car.position.x + Math.sin(smoothedHeading) * 10,
                car.position.y + 8,
                car.position.z + Math.cos(smoothedHeading) * 10
            );
            lookTarget.set(car.position.x, car.position.y, car.position.z);
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

            targetPosition.set(
                car.position.x - forwardX * backDistance + rightX * sideOffset,
                car.position.y + chaseHeight + turnLift,
                car.position.z - forwardZ * backDistance + rightZ * sideOffset
            );
            lookTarget.set(
                car.position.x + forwardX * lookAhead + rightX * lookSide,
                car.position.y + THREE.MathUtils.lerp(0.75, 1.45, dynamicSpeedRatio),
                car.position.z + forwardZ * lookAhead + rightZ * lookSide
            );

            followBlend = 1 - Math.exp(-THREE.MathUtils.lerp(5.8, 10.6, dynamicSpeedRatio) * dt);
            lookBlend = 1 - Math.exp(-THREE.MathUtils.lerp(6.2, 11.2, dynamicSpeedRatio) * dt);
            targetFov = THREE.MathUtils.lerp(76, 88, dynamicSpeedRatio);
            break;
        }
        default:
            targetPosition.set(
                car.position.x + Math.sin(smoothedHeading) * 6,
                car.position.y + 3,
                car.position.z + Math.cos(smoothedHeading) * 6
            );
            lookTarget.set(car.position.x, car.position.y + 0.5, car.position.z);
            break;
    }

    camera.position.lerp(targetPosition, followBlend);
    smoothedLookTarget.lerp(lookTarget, lookBlend);
    camera.lookAt(smoothedLookTarget);
    updateCameraFov(targetFov, dt);
}

export { camera, updateCamera };

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
