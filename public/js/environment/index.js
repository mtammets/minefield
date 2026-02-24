import {
    sceneBackgroundColor,
    sceneFog,
    renderSettings,
    ambientLight,
    skyLight,
    sunLight,
} from './config.js';
import { worldBounds, cityMapLayout, chargingZones } from './layout.js';
import { staticObstacles } from './obstacles.js';
import { createGroundTexture } from './textures.js';
import { getGroundHeightAt, createGround, updateGroundMotionRuntime } from './terrain.js';
import { createCityScenery } from './city-scenery.js';
import { createWorldBoundary } from './boundary.js';

const groundTexture = createGroundTexture();
const ground = createGround({
    texture: groundTexture,
    size: [worldBounds.size + 120, worldBounds.size + 120],
    positionY: 0,
});
const cityScenery = createCityScenery();
const worldBoundary = createWorldBoundary();

function updateGroundMotion(_playerPosition, playerSpeed = 0) {
    updateGroundMotionRuntime({
        ground,
        cityScenery,
        playerSpeed,
    });
}

export {
    sceneBackgroundColor,
    sceneFog,
    renderSettings,
    worldBounds,
    cityMapLayout,
    staticObstacles,
    ambientLight,
    skyLight,
    sunLight,
    ground,
    cityScenery,
    worldBoundary,
    getGroundHeightAt,
    updateGroundMotion,
    chargingZones,
};
