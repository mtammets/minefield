import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { CITY_GRID_RANGE, CITY_GRID_SPACING, CITY_ROAD_OFFSET } from './config.js';
import { getGroundHeightAt } from './terrain.js';
import { addObstacleCircle } from './obstacles.js';

export function createStreetLampLayer(_lampLights) {
    const layer = new THREE.Group();
    const poleMaterial = new THREE.MeshStandardMaterial({
        color: 0x2f3948,
        roughness: 0.78,
        metalness: 0.28,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffda9c,
        transparent: true,
        opacity: 0.9,
    });
    const poleGeometry = new THREE.CylinderGeometry(0.22, 0.24, 8.6, 10);
    const headGeometry = new THREE.SphereGeometry(0.46, 10, 10);

    for (let gridX = -CITY_GRID_RANGE; gridX <= CITY_GRID_RANGE; gridX += 1) {
        for (let gridZ = -CITY_GRID_RANGE; gridZ <= CITY_GRID_RANGE; gridZ += 1) {
            if (Math.abs(gridX) % 2 !== 0 && Math.abs(gridZ) % 2 !== 0) {
                continue;
            }
            if (Math.abs(gridX) % 2 === 0 && Math.abs(gridZ) % 2 === 0) {
                continue;
            }

            const positionX =
                gridX * CITY_GRID_SPACING + (Math.abs(gridX) % 2 === 0 ? CITY_ROAD_OFFSET : 0);
            const positionZ =
                gridZ * CITY_GRID_SPACING + (Math.abs(gridZ) % 2 === 0 ? CITY_ROAD_OFFSET : 0);
            const baseY = getGroundHeightAt(positionX, positionZ);

            const pole = new THREE.Mesh(poleGeometry, poleMaterial);
            pole.position.set(positionX, baseY + 4.3, positionZ);
            pole.castShadow = false;
            pole.receiveShadow = false;
            layer.add(pole);
            addObstacleCircle(positionX, positionZ, 0.58, 'lamp_post');

            const lampHead = new THREE.Mesh(headGeometry, glowMaterial);
            lampHead.position.set(positionX, baseY + 8.6, positionZ);
            layer.add(lampHead);
        }
    }

    return layer;
}
