import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { initializeWheels } from './wheels.js';
import { addLightsToCar, addLuxuryBody } from './carbody.js';

const car = new THREE.Group();
addLuxuryBody(car);
const wheelController = initializeWheels(car);
addLightsToCar(car);

function updateCarVisuals(vehicleState, deltaTime) {
    wheelController.update(vehicleState, deltaTime);
}

export { car, updateCarVisuals };
