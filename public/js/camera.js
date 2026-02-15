import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 3, 8);

let cameraViewMode = 0;
let cinematicMode = false;
let cinematicAngle = 0;

const targetPosition = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

document.addEventListener('keydown', (event) => {
    if (event.key >= '1' && event.key <= '5') {
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
    const followResponsiveness = THREE.MathUtils.lerp(5, 9, speedRatio);
    const followLerp = 1 - Math.exp(-followResponsiveness * dt);

    if (cinematicMode) {
        cinematicAngle += dt * 0.8;
        const cinematicRadius = 10;
        const cinematicHeight = 5 + Math.sin(cinematicAngle * 2) * 1.8;

        targetPosition.set(
            car.position.x + Math.cos(cinematicAngle) * cinematicRadius,
            car.position.y + cinematicHeight,
            car.position.z + Math.sin(cinematicAngle) * cinematicRadius
        );

        camera.position.lerp(targetPosition, 1 - Math.exp(-4.5 * dt));
        lookTarget.set(car.position.x, car.position.y + 1, car.position.z);
        camera.lookAt(lookTarget);
        return;
    }

    switch (cameraViewMode) {
        case 1:
            targetPosition.set(car.position.x, car.position.y + 2, car.position.z);
            lookTarget.set(
                car.position.x - Math.sin(car.rotation.y) * 10,
                car.position.y + 2,
                car.position.z - Math.cos(car.rotation.y) * 10
            );
            break;
        case 2:
            targetPosition.set(car.position.x, car.position.y + 50, car.position.z);
            lookTarget.set(car.position.x, car.position.y, car.position.z);
            break;
        case 3:
            targetPosition.set(
                car.position.x + Math.sin(car.rotation.y) * 4,
                car.position.y + 1,
                car.position.z + Math.cos(car.rotation.y) * 4
            );
            lookTarget.set(car.position.x, car.position.y, car.position.z);
            break;
        case 4:
            targetPosition.set(
                car.position.x + Math.cos(car.rotation.y) * 5,
                car.position.y + 2,
                car.position.z - Math.sin(car.rotation.y) * 5
            );
            lookTarget.set(car.position.x, car.position.y + 1, car.position.z);
            break;
        case 5:
            targetPosition.set(
                car.position.x + Math.sin(car.rotation.y) * 10,
                car.position.y + 8,
                car.position.z + Math.cos(car.rotation.y) * 10
            );
            lookTarget.set(car.position.x, car.position.y, car.position.z);
            break;
        default:
            targetPosition.set(
                car.position.x + Math.sin(car.rotation.y) * 6,
                car.position.y + 3,
                car.position.z + Math.cos(car.rotation.y) * 6
            );
            lookTarget.set(car.position.x, car.position.y + 0.5, car.position.z);
            break;
    }

    camera.position.lerp(targetPosition, followLerp);
    camera.lookAt(lookTarget);
}

export { camera, updateCamera };
