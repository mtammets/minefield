import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { worldBounds } from './layout.js';
import { createBoundaryTexture } from './textures.js';

export function createWorldBoundary() {
    const boundary = new THREE.Group();
    boundary.name = 'worldBoundary';

    const wallHeight = 4.2;
    const wallThickness = 5;
    const boundaryTexture = createBoundaryTexture();
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0xb6c4d4,
        map: boundaryTexture,
        emissive: 0x172433,
        emissiveMap: boundaryTexture,
        emissiveIntensity: 0.26,
        roughness: 0.84,
        metalness: 0.2,
    });
    const horizontalLength = worldBounds.size + wallThickness * 2;
    const verticalLength = worldBounds.size + wallThickness * 2;

    const northSouthGeometry = new THREE.BoxGeometry(horizontalLength, wallHeight, wallThickness);
    const eastWestGeometry = new THREE.BoxGeometry(wallThickness, wallHeight, verticalLength);

    const northWall = new THREE.Mesh(northSouthGeometry, wallMaterial);
    northWall.position.set(0, wallHeight * 0.5, worldBounds.minZ - wallThickness * 0.5);
    boundary.add(northWall);

    const southWall = new THREE.Mesh(northSouthGeometry, wallMaterial);
    southWall.position.set(0, wallHeight * 0.5, worldBounds.maxZ + wallThickness * 0.5);
    boundary.add(southWall);

    const westWall = new THREE.Mesh(eastWestGeometry, wallMaterial);
    westWall.position.set(worldBounds.minX - wallThickness * 0.5, wallHeight * 0.5, 0);
    boundary.add(westWall);

    const eastWall = new THREE.Mesh(eastWestGeometry, wallMaterial);
    eastWall.position.set(worldBounds.maxX + wallThickness * 0.5, wallHeight * 0.5, 0);
    boundary.add(eastWall);

    return boundary;
}
