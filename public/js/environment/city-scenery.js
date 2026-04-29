import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { clearStaticObstacles } from './obstacles.js';
import { createRoadLayer } from './roads.js';
import { createParkingLotLayer } from './parking-lot.js';
import { createMonumentLayer } from './monument.js';
import { createSpawnMarkerLayer } from './spawn-marker.js';
import { createParkLayer } from './parks.js';
import { createBuildingLayer } from './buildings.js';
import { createBillboardLayer } from './billboards.js';
import { createStreetLampLayer } from './street-lamps.js';

export function createCityScenery() {
    const group = new THREE.Group();
    group.name = 'cityScenery';
    group.userData.lampLights = [];
    group.userData.billboardScreens = [];

    clearStaticObstacles();

    const monumentLayer = createMonumentLayer(group.userData.billboardScreens);

    group.add(createRoadLayer());
    group.add(createParkingLotLayer());
    group.add(monumentLayer);
    group.add(createSpawnMarkerLayer());
    group.add(createParkLayer());
    group.add(createBuildingLayer());
    group.add(createBillboardLayer(group.userData.billboardScreens));
    group.add(createStreetLampLayer(group.userData.lampLights));

    return group;
}
