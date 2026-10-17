import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { clearStaticObstacles } from './obstacles.js';
import { createMonumentLayer } from './monument.js';
import { createParkLayer } from './parks.js';
import { createBuildingLayer } from './buildings.js';
import { createBillboardLayer } from './billboards.js';
import { createStreetLampLayer } from './street-lamps.js';
import { createUndergroundParkingLayer } from './underground-parking.js';

export function createCityScenery() {
    const group = new THREE.Group();
    group.name = 'cityScenery';
    group.userData.lampLights = [];
    group.userData.billboardScreens = [];
    group.userData.monumentEffects = [];

    clearStaticObstacles();

    const monumentLayer = createMonumentLayer(
        group.userData.billboardScreens,
        group.userData.monumentEffects
    );
    const undergroundParkingLayer = createUndergroundParkingLayer();
    const parkLayer = createParkLayer();
    const buildingLayer = createBuildingLayer();
    const billboardLayer = createBillboardLayer(group.userData.billboardScreens);
    const streetLampLayer = createStreetLampLayer(group.userData.lampLights);

    group.userData.monumentLayer = monumentLayer;
    group.userData.undergroundParkingLayer = undergroundParkingLayer;
    group.userData.parkLayer = parkLayer;
    group.userData.buildingLayer = buildingLayer;
    group.userData.billboardLayer = billboardLayer;
    group.userData.streetLampLayer = streetLampLayer;
    group.userData.surfaceDetailLayers = [
        monumentLayer,
        parkLayer,
        buildingLayer,
        billboardLayer,
        streetLampLayer,
    ];

    group.add(monumentLayer);
    group.add(undergroundParkingLayer);
    group.add(parkLayer);
    group.add(buildingLayer);
    group.add(billboardLayer);
    group.add(streetLampLayer);

    return group;
}
