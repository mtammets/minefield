import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { BUILDING_DISTRICT_RADIUS, CITY_GRID_RANGE, CITY_GRID_SPACING } from './config.js';
import { worldBounds, doesRectOverlapCentralParkingLot } from './layout.js';
import { randomFromGrid } from './grid-noise.js';
import { addObstacleAabb } from './obstacles.js';
import { createBuildingWindowTexture } from './textures.js';

export function createBuildingLayer() {
    const layer = new THREE.Group();
    const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
    const buildingWindowTexture = createBuildingWindowTexture();
    const buildingMaterial = new THREE.MeshStandardMaterial({
        color: 0x2e3e53,
        map: buildingWindowTexture,
        emissive: 0xa6b7d0,
        emissiveMap: buildingWindowTexture,
        emissiveIntensity: 0.42,
        roughness: 0.86,
        metalness: 0.07,
        vertexColors: true,
    });

    const placements = [];
    for (let gridX = -CITY_GRID_RANGE; gridX <= CITY_GRID_RANGE; gridX += 1) {
        for (let gridZ = -CITY_GRID_RANGE; gridZ <= CITY_GRID_RANGE; gridZ += 1) {
            if (Math.abs(gridX) % 2 === 0 || Math.abs(gridZ) % 2 === 0) {
                continue;
            }
            if (!isInsideBuildingDistrict(gridX, gridZ)) {
                continue;
            }

            const width = 12 + randomFromGrid(gridX, gridZ, 11) * 11;
            const depth = 12 + randomFromGrid(gridX, gridZ, 12) * 11;
            const height = 14 + randomFromGrid(gridX, gridZ, 13) * 58;
            const tint = randomFromGrid(gridX, gridZ, 16);
            const centerX = gridX * CITY_GRID_SPACING;
            const centerZ = gridZ * CITY_GRID_SPACING;

            if (doesRectOverlapCentralParkingLot(centerX, centerZ, width, depth, 2)) {
                continue;
            }

            placements.push({
                x: centerX,
                z: centerZ,
                width,
                depth,
                height,
                tint,
            });
        }
    }

    if (placements.length === 0) {
        return layer;
    }

    const buildings = new THREE.InstancedMesh(
        buildingGeometry,
        buildingMaterial,
        placements.length
    );
    buildings.castShadow = false;
    buildings.receiveShadow = false;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    placements.forEach((building, index) => {
        dummy.position.set(building.x, building.height * 0.5, building.z);
        dummy.scale.set(building.width, building.height, building.depth);
        dummy.updateMatrix();
        buildings.setMatrixAt(index, dummy.matrix);

        color.setHSL(0.58 + building.tint * 0.04, 0.2, 0.28 + building.tint * 0.08);
        buildings.setColorAt(index, color);
        addObstacleAabb(building.x, building.z, building.width, building.depth, 0.2, 'building');
    });
    buildings.instanceMatrix.needsUpdate = true;
    buildings.instanceColor.needsUpdate = true;

    layer.add(buildings);
    return layer;
}

export function createHorizonBackdropLayer() {
    const layer = new THREE.Group();
    layer.name = 'horizonBackdropLayer';

    const blockCount = 32;
    const radiusBase = worldBounds.size * 0.62;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const windowTexture = createBuildingWindowTexture();
    const material = new THREE.MeshStandardMaterial({
        color: 0x25354b,
        map: windowTexture,
        emissive: 0x6a88af,
        emissiveMap: windowTexture,
        emissiveIntensity: 0.32,
        roughness: 0.88,
        metalness: 0.08,
        vertexColors: true,
    });
    const skylineMesh = new THREE.InstancedMesh(geometry, material, blockCount);
    skylineMesh.castShadow = false;
    skylineMesh.receiveShadow = false;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < blockCount; i += 1) {
        const angle = (i / blockCount) * Math.PI * 2;
        const radius = radiusBase + 46 + randomFromGrid(i, blockCount, 329) * 46;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const width = 15 + randomFromGrid(i, blockCount, 330) * 20;
        const depth = 14 + randomFromGrid(i, blockCount, 331) * 20;
        const height = 28 + Math.pow(randomFromGrid(i, blockCount, 332), 1.45) * 88;

        dummy.position.set(x, height * 0.5, z);
        dummy.scale.set(width, height, depth);
        dummy.rotation.y = angle + Math.PI * 0.5;
        dummy.updateMatrix();
        skylineMesh.setMatrixAt(i, dummy.matrix);

        color.setHSL(
            0.58 + randomFromGrid(i, blockCount, 333) * 0.04,
            0.18,
            0.17 + randomFromGrid(i, blockCount, 334) * 0.08
        );
        skylineMesh.setColorAt(i, color);
    }

    skylineMesh.instanceMatrix.needsUpdate = true;
    skylineMesh.instanceColor.needsUpdate = true;
    layer.add(skylineMesh);
    return layer;
}

function isInsideBuildingDistrict(gridX, gridZ) {
    return (
        Math.abs(gridX) <= BUILDING_DISTRICT_RADIUS && Math.abs(gridZ) <= BUILDING_DISTRICT_RADIUS
    );
}
