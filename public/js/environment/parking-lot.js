import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { centralParkingLot } from './layout.js';
import { getGroundHeightAt } from './terrain.js';
import { createParkingLotTexture } from './textures.js';

export function createParkingLotLayer() {
    const layer = new THREE.Group();
    layer.name = 'parkingLotLayer';

    const lotTexture = createParkingLotTexture();
    const lotMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: lotTexture,
        emissive: 0x1a2e42,
        emissiveMap: lotTexture,
        emissiveIntensity: 0.28,
        roughness: 0.9,
        metalness: 0.06,
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -6,
    });

    const surface = new THREE.Mesh(
        new THREE.PlaneGeometry(centralParkingLot.width, centralParkingLot.depth),
        lotMaterial
    );
    surface.rotation.x = -Math.PI / 2;
    surface.position.set(
        centralParkingLot.centerX,
        getGroundHeightAt(centralParkingLot.centerX, centralParkingLot.centerZ) + 0.04,
        centralParkingLot.centerZ
    );
    surface.receiveShadow = false;
    surface.castShadow = false;
    layer.add(surface);

    return layer;
}
