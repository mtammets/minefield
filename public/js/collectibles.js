import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const PICKUP_RADIUS = 3.2;
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS;
const CELL_SIZE = 34;
const CELL_MARGIN = 4;
const CELL_PICKUP_CHANCE = 0.34;
const ACTIVE_CELL_RADIUS = 8;
const PICKUP_GROUND_HEIGHT = 1.35;

const shapeGeometries = [
    new THREE.IcosahedronGeometry(1.35, 0),
    new THREE.OctahedronGeometry(1.25, 0),
    new THREE.TetrahedronGeometry(1.35, 0),
    new THREE.DodecahedronGeometry(1.2, 0),
];

const shapeColors = [0x7cf9ff, 0xff85f8, 0x8dff9a, 0xffd86b];

const pickupMaterials = shapeColors.map((color) => (
    new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.85,
        metalness: 0.28,
        roughness: 0.22,
    })
));

const haloGeometry = new THREE.RingGeometry(1.7, 2.3, 28);
const haloMaterials = shapeColors.map((color) => (
    new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    })
));

const effectBurstGeometry = new THREE.IcosahedronGeometry(0.7, 1);
const effectRingGeometry = new THREE.TorusGeometry(1.2, 0.12, 12, 40);

export function createCollectibleSystem(scene) {
    const pickupGroup = new THREE.Group();
    pickupGroup.name = 'magicPickups';
    scene.add(pickupGroup);

    const effectGroup = new THREE.Group();
    effectGroup.name = 'magicPickupEffects';
    scene.add(effectGroup);

    const pickups = new Map();
    const consumedPickups = new Set();
    const effects = [];
    const activePickupIds = new Set();
    let lastSyncedCellX = Number.NaN;
    let lastSyncedCellZ = Number.NaN;

    return {
        update(carPosition, deltaTime = 1 / 60) {
            const dt = Math.min(deltaTime, 0.05);
            const carCellX = Math.floor(carPosition.x / CELL_SIZE);
            const carCellZ = Math.floor(carPosition.z / CELL_SIZE);
            if (carCellX !== lastSyncedCellX || carCellZ !== lastSyncedCellZ) {
                syncPickupsAroundCar(
                    pickups,
                    pickupGroup,
                    consumedPickups,
                    carCellX,
                    carCellZ,
                    activePickupIds
                );
                lastSyncedCellX = carCellX;
                lastSyncedCellZ = carCellZ;
            }

            for (const [pickupId, pickup] of pickups) {
                const distanceSq = pickup.mesh.position.distanceToSquared(carPosition);
                if (distanceSq <= PICKUP_RADIUS_SQ) {
                    pickupGroup.remove(pickup.mesh);
                    createCollectEffect(effectGroup, effects, pickup.mesh.position, pickup.color);
                    disposePickup(pickup);
                    pickups.delete(pickupId);
                    consumedPickups.add(pickupId);
                }
            }

            updateEffects(effects, effectGroup, dt);
        },
    };
}

function syncPickupsAroundCar(pickups, pickupGroup, consumedPickups, carCellX, carCellZ, activePickupIds) {
    activePickupIds.clear();
    for (let x = carCellX - ACTIVE_CELL_RADIUS; x <= carCellX + ACTIVE_CELL_RADIUS; x += 1) {
        for (let z = carCellZ - ACTIVE_CELL_RADIUS; z <= carCellZ + ACTIVE_CELL_RADIUS; z += 1) {
            const pickupId = `${x}:${z}`;
            if (consumedPickups.has(pickupId) || !cellShouldHavePickup(x, z)) {
                continue;
            }

            activePickupIds.add(pickupId);
            if (!pickups.has(pickupId)) {
                const pickup = createPickupForCell(x, z);
                pickups.set(pickupId, pickup);
                pickupGroup.add(pickup.mesh);
            }
        }
    }

    for (const [pickupId, pickup] of pickups) {
        if (!activePickupIds.has(pickupId)) {
            pickupGroup.remove(pickup.mesh);
            disposePickup(pickup);
            pickups.delete(pickupId);
        }
    }
}

function createPickupForCell(cellX, cellZ) {
    const span = CELL_SIZE - CELL_MARGIN * 2;
    const x = cellX * CELL_SIZE + CELL_MARGIN + randomFromCell(cellX, cellZ, 11) * span;
    const z = cellZ * CELL_SIZE + CELL_MARGIN + randomFromCell(cellX, cellZ, 12) * span;
    const y = PICKUP_GROUND_HEIGHT;
    const shapeIndex = Math.floor(
        randomFromCell(cellX, cellZ, 14) * shapeGeometries.length
    ) % shapeGeometries.length;

    return createPickup(x, y, z, shapeIndex, randomFromCell(cellX, cellZ, 22));
}

function cellShouldHavePickup(cellX, cellZ) {
    return randomFromCell(cellX, cellZ, 7) < CELL_PICKUP_CHANCE;
}

function randomFromCell(cellX, cellZ, salt) {
    return hashToUnit(hashCell(cellX, cellZ, salt));
}

function hashToUnit(value) {
    return value / 4294967295;
}

function hashCell(cellX, cellZ, salt) {
    let h = (cellX * 374761393 + cellZ * 668265263 + salt * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return h >>> 0;
}

function createPickup(x, y, z, shapeIndex, rotYFactor = 0) {
    const color = shapeColors[shapeIndex];
    const mesh = new THREE.Mesh(shapeGeometries[shapeIndex], pickupMaterials[shapeIndex]);
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.rotation.set(0, rotYFactor * Math.PI * 2, 0);

    const halo = new THREE.Mesh(haloGeometry, haloMaterials[shapeIndex]);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -1.2;
    mesh.add(halo);

    return {
        mesh,
        halo,
        color,
    };
}

function disposePickup(pickup) {
    pickup.mesh.clear();
}

function createCollectEffect(effectGroup, effects, position, colorHex) {
    const burstMaterial = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    const burst = new THREE.Mesh(
        effectBurstGeometry,
        burstMaterial
    );
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const ring = new THREE.Mesh(
        effectRingGeometry,
        ringMaterial
    );
    burst.position.copy(position);
    effectGroup.add(burst);

    ring.position.copy(position);
    ring.rotation.x = Math.PI / 2;
    effectGroup.add(ring);

    const light = new THREE.PointLight(colorHex, 2.6, 42, 2);
    light.position.copy(position);
    effectGroup.add(light);

    effects.push({
        burst,
        ring,
        light,
        lifetime: 0.6,
        elapsed: 0,
    });
}

function updateEffects(effects, effectGroup, dt) {
    for (let i = effects.length - 1; i >= 0; i -= 1) {
        const effect = effects[i];
        effect.elapsed += dt;
        const t = THREE.MathUtils.clamp(effect.elapsed / effect.lifetime, 0, 1);
        const fade = 1 - t;

        const burstScale = 1 + t * 4.2;
        effect.burst.scale.setScalar(burstScale);
        effect.burst.material.opacity = 0.95 * fade;
        effect.burst.rotation.x += dt * 3.5;
        effect.burst.rotation.y += dt * 4.1;

        const ringScale = 1 + t * 5.5;
        effect.ring.scale.setScalar(ringScale);
        effect.ring.material.opacity = 0.7 * fade;
        effect.ring.rotation.z += dt * 2.5;

        effect.light.intensity = 2.8 * fade;
        effect.light.distance = 18 + t * 36;

        if (t >= 1) {
            effectGroup.remove(effect.burst);
            effectGroup.remove(effect.ring);
            effectGroup.remove(effect.light);
            effect.burst.material.dispose();
            effect.ring.material.dispose();
            effects.splice(i, 1);
        }
    }
}
