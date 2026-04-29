import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import {
    sceneBackgroundColor,
    sceneFog,
    renderSettings,
    ambientLight,
    skyLight,
    sunLight,
} from './config.js';
import { worldBounds, cityMapLayout, chargingZones, playerSpawnPoint } from './layout.js';
import { staticObstacles } from './obstacles.js';
import { createGroundTexture } from './textures.js';
import { getGroundHeightAt, createGround, updateGroundMotionRuntime } from './terrain.js';
import { updateBillboardRuntime } from './billboards.js';
import { updateMonumentRuntime } from './monument.js';
import { createCityScenery } from './city-scenery.js';
import { createWorldBoundary } from './boundary.js';

const ground = new THREE.Group();
const cityScenery = new THREE.Group();
const worldBoundary = new THREE.Group();
ground.name = 'world_ground_root';
cityScenery.name = 'world_city_scenery_root';
worldBoundary.name = 'world_boundary_root';

let environmentBuilt = false;
let runtimeGround = ground;
let runtimeCityScenery = cityScenery;
let runtimeWorldBoundary = worldBoundary;

function ensureWorldBuilt() {
    if (environmentBuilt) {
        return {
            ground: runtimeGround,
            cityScenery: runtimeCityScenery,
            worldBoundary: runtimeWorldBoundary,
        };
    }

    const groundTexture = createGroundTexture();
    const builtGround = createGround({
        texture: groundTexture,
        size: [worldBounds.size + 120, worldBounds.size + 120],
        positionY: 0,
    });
    const builtCityScenery = createCityScenery();
    const builtWorldBoundary = createWorldBoundary();

    ground.clear();
    cityScenery.clear();
    worldBoundary.clear();
    ground.add(builtGround);
    cityScenery.add(builtCityScenery);
    worldBoundary.add(builtWorldBoundary);

    runtimeGround = builtGround;
    runtimeCityScenery = builtCityScenery;
    runtimeWorldBoundary = builtWorldBoundary;
    environmentBuilt = true;

    return {
        ground: runtimeGround,
        cityScenery: runtimeCityScenery,
        worldBoundary: runtimeWorldBoundary,
    };
}

function updateGroundMotion(playerPosition, playerSpeed = 0, monumentRhythmState = null) {
    if (!environmentBuilt) {
        return;
    }
    updateGroundMotionRuntime({
        ground: runtimeGround,
        cityScenery: runtimeCityScenery,
        playerSpeed,
        playerPosition,
    });
    updateBillboardRuntime(runtimeCityScenery);
    updateMonumentRuntime(runtimeCityScenery, monumentRhythmState);
}

export {
    sceneBackgroundColor,
    sceneFog,
    renderSettings,
    worldBounds,
    cityMapLayout,
    playerSpawnPoint,
    staticObstacles,
    ambientLight,
    skyLight,
    sunLight,
    ground,
    cityScenery,
    worldBoundary,
    ensureWorldBuilt,
    getGroundHeightAt,
    updateGroundMotion,
    chargingZones,
};
