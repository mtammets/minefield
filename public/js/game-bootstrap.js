import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

export function initializeScene({
    sceneBackgroundColor,
    sceneFog,
    ambientLight,
    skyLight,
    sunLight,
    car,
    ground,
    cityScenery,
    worldBoundary,
}) {
    const scene = new THREE.Scene();
    scene.background = sceneBackgroundColor;
    scene.fog = sceneFog;
    scene.add(ambientLight, skyLight, sunLight, car, ground, cityScenery, worldBoundary);
    return scene;
}

export function initializeRenderer({ renderSettings }) {
    const renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('gameCanvas'),
        antialias: false,
        powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, renderSettings.maxPixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = renderSettings.shadowsEnabled;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    return renderer;
}
