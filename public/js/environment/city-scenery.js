import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { clearStaticObstacles } from './obstacles.js';
import { createRoadLayer } from './roads.js';
import { createParkLayer } from './parks.js';
import { createBuildingLayer } from './buildings.js';
import { createStreetLampLayer } from './street-lamps.js';

export function createCityScenery() {
    const group = new THREE.Group();
    group.name = 'cityScenery';
    group.userData.lampLights = [];

    clearStaticObstacles();

    group.add(createRoadLayer());
    group.add(createParkLayer());
    group.add(createBuildingLayer());
    group.add(createStreetLampLayer(group.userData.lampLights));

    return group;
}
