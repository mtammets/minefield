import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { BUILDING_DISTRICT_RADIUS, CITY_GRID_RANGE, CITY_GRID_SPACING } from './config.js';
import { randomFromGrid } from './grid-noise.js';
import { addObstacleCircle } from './obstacles.js';
import { getGroundHeightAt } from './terrain.js';

export function createParkLayer() {
    const layer = new THREE.Group();
    layer.name = 'parkLayer';

    const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.26, 2.5, 6);
    const canopyGeometry = new THREE.ConeGeometry(1.3, 3.6, 7);
    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x544130,
        roughness: 0.95,
        metalness: 0.02,
    });
    const canopyMaterial = new THREE.MeshStandardMaterial({
        color: 0x2e7f53,
        emissive: 0x173f2a,
        emissiveIntensity: 0.18,
        roughness: 0.9,
        metalness: 0.01,
        vertexColors: true,
    });

    const trees = [];
    const blockSpread = CITY_GRID_SPACING * 0.34;

    for (let gridX = -CITY_GRID_RANGE; gridX <= CITY_GRID_RANGE; gridX += 1) {
        for (let gridZ = -CITY_GRID_RANGE; gridZ <= CITY_GRID_RANGE; gridZ += 1) {
            if (Math.abs(gridX) % 2 === 0 || Math.abs(gridZ) % 2 === 0) {
                continue;
            }
            if (isInsideBuildingDistrict(gridX, gridZ)) {
                continue;
            }

            const centerX = gridX * CITY_GRID_SPACING;
            const centerZ = gridZ * CITY_GRID_SPACING;
            const treeCount = 2 + Math.floor(randomFromGrid(gridX, gridZ, 90) * 2);

            for (let i = 0; i < treeCount; i += 1) {
                const x = centerX + (randomFromGrid(gridX, gridZ, 91 + i) - 0.5) * blockSpread * 2;
                const z = centerZ + (randomFromGrid(gridX, gridZ, 95 + i) - 0.5) * blockSpread * 2;
                const scale = 0.82 + randomFromGrid(gridX, gridZ, 99 + i) * 0.48;
                trees.push({ x, z, scale });
            }
        }
    }

    if (trees.length === 0) {
        return layer;
    }

    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
    const canopies = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, trees.length);
    trunks.castShadow = false;
    trunks.receiveShadow = false;
    canopies.castShadow = false;
    canopies.receiveShadow = false;

    const dummy = new THREE.Object3D();
    const canopyColor = new THREE.Color();

    trees.forEach((tree, index) => {
        const baseY = getGroundHeightAt(tree.x, tree.z);
        dummy.position.set(tree.x, baseY + 1.25 * tree.scale, tree.z);
        dummy.scale.set(tree.scale, tree.scale, tree.scale);
        dummy.rotation.set(0, randomFromGrid(index, trees.length, 120) * Math.PI * 2, 0);
        dummy.updateMatrix();
        trunks.setMatrixAt(index, dummy.matrix);

        dummy.position.set(tree.x, baseY + 3.2 * tree.scale, tree.z);
        dummy.scale.set(tree.scale, tree.scale, tree.scale);
        dummy.updateMatrix();
        canopies.setMatrixAt(index, dummy.matrix);

        canopyColor.setHSL(0.33 + randomFromGrid(index, trees.length, 121) * 0.03, 0.42, 0.28);
        canopies.setColorAt(index, canopyColor);
        addObstacleCircle(tree.x, tree.z, 0.62 * tree.scale, 'tree');
    });

    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    canopies.instanceColor.needsUpdate = true;

    layer.add(trunks);
    layer.add(canopies);
    return layer;
}

function isInsideBuildingDistrict(gridX, gridZ) {
    return (
        Math.abs(gridX) <= BUILDING_DISTRICT_RADIUS && Math.abs(gridZ) <= BUILDING_DISTRICT_RADIUS
    );
}
