import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { SPEED_GLOW_MAX, TERRAIN_SEGMENTS } from './config.js';

export function getGroundHeightAt(_x, _z) {
    return 0;
}

export function createGround({ texture, size, positionY }) {
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0.04,
    });
    material.userData.baseEmissive = 0.058;
    material.emissive = new THREE.Color(0x1f3752);
    material.emissiveIntensity = material.userData.baseEmissive;

    const geometry = new THREE.PlaneGeometry(size[0], size[1], TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        positions.setY(i, getGroundHeightAt(x, z));
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = positionY;
    mesh.receiveShadow = false;
    return mesh;
}

export function updateGroundMotionRuntime({ ground, cityScenery, playerSpeed = 0 }) {
    const speedRatio = THREE.MathUtils.clamp(Math.abs(playerSpeed) / SPEED_GLOW_MAX, 0, 1);
    const intensityBoost = speedRatio * 0.12;
    ground.material.emissiveIntensity = ground.material.userData.baseEmissive + intensityBoost;

    const lampLights = cityScenery?.userData?.lampLights || [];
    if (lampLights.length > 0) {
        const time = performance.now() * 0.0022;
        const lampBoost = 1.12 + speedRatio * 0.26;
        lampLights.forEach((light) => {
            const phase = light.userData.flickerPhase || 0;
            const lampFlicker = 0.988 + Math.sin(time + phase) * 0.012;
            light.intensity = light.userData.baseIntensity * lampBoost * lampFlicker;
        });
    }
}
