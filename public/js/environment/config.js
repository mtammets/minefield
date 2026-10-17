import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

export const sceneBackgroundColor = new THREE.Color(0x060d18);
export const sceneFog = new THREE.FogExp2(0x13243a, 0.00056);

export const renderSettings = {
    maxPixelRatio: 0.75,
    shadowsEnabled: false,
};

export const CITY_GRID_SPACING = 16;
export const CITY_GRID_RANGE = 6;
export const CITY_ROAD_OFFSET = 4;
export const ROAD_WIDTH = 8;
export const SIDEWALK_WIDTH = 2.6;
export const CENTRAL_PARKING_LOT_WIDTH = CITY_GRID_SPACING * 3;
export const CENTRAL_PARKING_LOT_DEPTH = CITY_GRID_SPACING * 3;
export const SPEED_GLOW_MAX = 30;
export const BUILDING_DISTRICT_RADIUS = 3;
export const TERRAIN_SEGMENTS = 120;
export const CHARGING_ZONE_RADIUS = 2.45;

export const ROAD_SIDE_LINE_POSITIONS = [0.18, 0.82];

export const ROAD_STYLE_CONFIGS = {
    boulevard: {
        key: 'boulevard',
        sidewalkMode: 'both',
        texture: {
            top: '#24374a',
            bottom: '#1b2a39',
            noiseBase: 66,
            noiseSpread: 32,
            sideLineColor: 'rgba(236, 242, 250, 0.48)',
            sideLineWidth: 6.5,
            sideLinePositions: ROAD_SIDE_LINE_POSITIONS,
            centerMode: 'double-solid',
            centerColor: 'rgba(255, 198, 112, 0.72)',
            centerSecondaryColor: 'rgba(255, 225, 168, 0.52)',
            repeatV: 18,
            crackCount: 120,
        },
    },
    avenue: {
        key: 'avenue',
        sidewalkMode: 'both',
        texture: {
            top: '#1f2c3a',
            bottom: '#182431',
            noiseBase: 64,
            noiseSpread: 28,
            sideLineColor: 'rgba(224, 236, 250, 0.4)',
            sideLineWidth: 6,
            sideLinePositions: ROAD_SIDE_LINE_POSITIONS,
            centerMode: 'dashed',
            centerColor: 'rgba(232, 240, 250, 0.66)',
            repeatV: 14,
            crackCount: 94,
        },
    },
    service: {
        key: 'service',
        sidewalkMode: 'none',
        texture: {
            top: '#1a2531',
            bottom: '#15202b',
            noiseBase: 58,
            noiseSpread: 24,
            sideLineColor: 'rgba(193, 214, 238, 0.23)',
            sideLineWidth: 4.5,
            sideLinePositions: ROAD_SIDE_LINE_POSITIONS,
            centerMode: 'none',
            centerColor: 'rgba(197, 221, 247, 0.26)',
            repeatV: 11,
            crackCount: 70,
        },
    },
};

function createLight(type, { color, intensity, position, shadow }) {
    let light;
    if (type === 'directional') {
        light = new THREE.DirectionalLight(color, intensity);
        if (shadow) {
            light.castShadow = renderSettings.shadowsEnabled;
            if (renderSettings.shadowsEnabled) {
                light.shadow.mapSize.set(shadow.mapSize, shadow.mapSize);
                light.shadow.camera.left = shadow.cameraBounds[0];
                light.shadow.camera.right = shadow.cameraBounds[1];
                light.shadow.camera.top = shadow.cameraBounds[1];
                light.shadow.camera.bottom = shadow.cameraBounds[0];
            }
        }
    }
    light.position.set(...position);
    return light;
}

export const ambientLight = new THREE.AmbientLight(0x3d5378, 0.5);
export const skyLight = new THREE.HemisphereLight(0xa8cfff, 0x1f3146, 0.58);
export const sunLight = createLight('directional', {
    color: 0xf0f5ff,
    intensity: 1.14,
    position: [126, 176, 88],
    shadow: {
        mapSize: 1024,
        cameraBounds: [-260, 260],
    },
});
