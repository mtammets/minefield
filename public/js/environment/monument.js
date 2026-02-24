import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { centralParkingLot } from './layout.js';
import { getGroundHeightAt } from './terrain.js';
import { addObstacleCircle } from './obstacles.js';

export function createMonumentLayer() {
    const layer = new THREE.Group();
    layer.name = 'monumentLayer';

    const centerX = centralParkingLot.centerX;
    const centerZ = centralParkingLot.centerZ;
    const baseY = getGroundHeightAt(centerX, centerZ);
    const lotMinDimension = Math.min(centralParkingLot.width, centralParkingLot.depth);

    const forecourtRadius = Math.max(11.2, lotMinDimension * 0.32);
    const basinOuterRadius = forecourtRadius * 0.76;
    const basinInnerRadius = basinOuterRadius - 1.5;
    const pedestalRadius = basinInnerRadius * 0.24;

    const stoneMaterial = new THREE.MeshLambertMaterial({
        color: 0x2a3f57,
    });
    const trimMaterial = new THREE.MeshLambertMaterial({
        color: 0x9bb2ca,
    });
    const waterMaterial = new THREE.MeshBasicMaterial({
        color: 0x4f86b5,
    });
    const accentMaterial = new THREE.MeshBasicMaterial({
        color: 0xa9c4e2,
    });

    const forecourt = new THREE.Mesh(
        new THREE.CylinderGeometry(forecourtRadius, forecourtRadius, 0.14, 12),
        stoneMaterial
    );
    forecourt.position.set(centerX, baseY + 0.07, centerZ);
    layer.add(forecourt);

    const basinWall = new THREE.Mesh(
        new THREE.CylinderGeometry(basinOuterRadius, basinOuterRadius, 0.82, 12),
        stoneMaterial
    );
    basinWall.position.set(centerX, baseY + 0.41, centerZ);
    layer.add(basinWall);

    const basinLip = new THREE.Mesh(
        new THREE.TorusGeometry(basinOuterRadius - 0.18, 0.22, 6, 14),
        trimMaterial
    );
    basinLip.rotation.x = Math.PI / 2;
    basinLip.position.set(centerX, baseY + 0.88, centerZ);
    layer.add(basinLip);

    const waterSurface = new THREE.Mesh(
        new THREE.CircleGeometry(basinInnerRadius - 0.5, 10),
        waterMaterial
    );
    waterSurface.rotation.x = -Math.PI / 2;
    waterSurface.position.set(centerX, baseY + 0.2, centerZ);
    layer.add(waterSurface);

    const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(pedestalRadius * 1.18, pedestalRadius * 1.3, 2.2, 8),
        stoneMaterial
    );
    pedestal.position.set(centerX, baseY + 1.56, centerZ);
    layer.add(pedestal);

    const monolith = new THREE.Mesh(new THREE.BoxGeometry(4.2, 9.2, 4.2), trimMaterial);
    monolith.position.set(centerX, baseY + 7.12, centerZ);
    layer.add(monolith);

    const crown = new THREE.Mesh(
        new THREE.TorusGeometry(pedestalRadius * 2.46, 0.22, 6, 14),
        accentMaterial
    );
    crown.rotation.x = Math.PI / 2;
    crown.position.set(centerX, baseY + 11.9, centerZ);
    layer.add(crown);

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.66, 6, 5), accentMaterial);
    beacon.position.set(centerX, baseY + 11.9, centerZ);
    layer.add(beacon);

    const fountainCollisionRadius = basinOuterRadius + 0.24;
    addObstacleCircle(centerX, centerZ, fountainCollisionRadius, 'building');

    freezeStaticHierarchy(layer);

    return layer;
}

function freezeStaticHierarchy(root) {
    root.traverse((node) => {
        if (!node || !node.isObject3D) {
            return;
        }
        node.matrixAutoUpdate = false;
        node.updateMatrix();
    });
}
