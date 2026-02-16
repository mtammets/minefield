import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const PICKUP_RADIUS = 3.2;
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS;
const CELL_SIZE = 34;
const CELL_MARGIN = 4;
const CELL_PICKUP_CHANCE = 0.18;
const ACTIVE_CELL_RADIUS = 6;
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

export function createCollectibleSystem(scene, worldBounds = null, options = {}) {
    const {
        onTargetColorChanged = () => {},
        onCorrectPickup = () => {},
        onWrongPickup = () => {},
        initialTargetColorIndex = Math.floor(Math.random() * shapeColors.length),
    } = options;

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
    const visiblePickupCache = [];
    const worldCellBounds = worldBounds ? getWorldCellBounds(worldBounds) : null;
    let targetColorIndex = normalizeColorIndex(initialTargetColorIndex);
    let enabled = true;
    let lastSyncedCellX = Number.NaN;
    let lastSyncedCellZ = Number.NaN;

    emitTargetColorChanged();

    return {
        update(carPosition, deltaTime = 1 / 60) {
            const dt = Math.min(deltaTime, 0.05);
            if (!enabled) {
                updateEffects(effects, effectGroup, dt);
                return;
            }

            const carCellX = Math.floor(carPosition.x / CELL_SIZE);
            const carCellZ = Math.floor(carPosition.z / CELL_SIZE);
            if (carCellX !== lastSyncedCellX || carCellZ !== lastSyncedCellZ) {
                syncPickupsAroundCar(
                    pickups,
                    pickupGroup,
                    consumedPickups,
                    carCellX,
                    carCellZ,
                    activePickupIds,
                    worldBounds,
                    worldCellBounds
                );
                lastSyncedCellX = carCellX;
                lastSyncedCellZ = carCellZ;
            }

            for (const [pickupId, pickup] of pickups) {
                const distanceSq = pickup.mesh.position.distanceToSquared(carPosition);
                if (distanceSq <= PICKUP_RADIUS_SQ) {
                    pickupGroup.remove(pickup.mesh);
                    const pickupPosition = pickup.mesh.position.clone();
                    const isCorrectPickup = pickup.shapeIndex === targetColorIndex;
                    const effectColor = isCorrectPickup ? pickup.color : 0xff4b4b;
                    createCollectEffect(effectGroup, effects, pickupPosition, effectColor);
                    disposePickup(pickup);
                    pickups.delete(pickupId);
                    consumedPickups.add(pickupId);

                    if (isCorrectPickup) {
                        onCorrectPickup({
                            pickupId,
                            pickupColorIndex: pickup.shapeIndex,
                            pickupColorHex: pickup.color,
                            position: pickupPosition,
                        });

                        targetColorIndex = getNextTargetColorIndex(targetColorIndex);
                        emitTargetColorChanged();
                    } else {
                        enabled = false;
                        onWrongPickup({
                            pickupId,
                            pickupColorIndex: pickup.shapeIndex,
                            pickupColorHex: pickup.color,
                            targetColorIndex,
                            targetColorHex: shapeColors[targetColorIndex],
                            position: pickupPosition,
                        });
                        clearPickups();
                        break;
                    }
                }
            }

            updateEffects(effects, effectGroup, dt);
        },
        setEnabled(nextEnabled) {
            enabled = Boolean(nextEnabled);
            if (!enabled) {
                clearPickups();
            }
        },
        getVisiblePickups() {
            visiblePickupCache.length = 0;
            if (!enabled) {
                return visiblePickupCache;
            }

            for (const pickup of pickups.values()) {
                visiblePickupCache.push({
                    x: pickup.mesh.position.x,
                    z: pickup.mesh.position.z,
                    colorHex: pickup.color,
                    isTarget: pickup.shapeIndex === targetColorIndex,
                });
            }

            return visiblePickupCache;
        },
    };

    function clearPickups() {
        for (const [pickupId, pickup] of pickups) {
            pickupGroup.remove(pickup.mesh);
            disposePickup(pickup);
            pickups.delete(pickupId);
        }
    }

    function emitTargetColorChanged() {
        onTargetColorChanged({
            targetColorIndex,
            targetColorHex: shapeColors[targetColorIndex],
        });
    }
}

function syncPickupsAroundCar(
    pickups,
    pickupGroup,
    consumedPickups,
    carCellX,
    carCellZ,
    activePickupIds,
    worldBounds,
    worldCellBounds
) {
    activePickupIds.clear();
    let startCellX = carCellX - ACTIVE_CELL_RADIUS;
    let endCellX = carCellX + ACTIVE_CELL_RADIUS;
    let startCellZ = carCellZ - ACTIVE_CELL_RADIUS;
    let endCellZ = carCellZ + ACTIVE_CELL_RADIUS;

    if (worldCellBounds) {
        startCellX = Math.max(startCellX, worldCellBounds.minCellX);
        endCellX = Math.min(endCellX, worldCellBounds.maxCellX);
        startCellZ = Math.max(startCellZ, worldCellBounds.minCellZ);
        endCellZ = Math.min(endCellZ, worldCellBounds.maxCellZ);
    }

    for (let x = startCellX; x <= endCellX; x += 1) {
        for (let z = startCellZ; z <= endCellZ; z += 1) {
            const pickupId = `${x}:${z}`;
            if (consumedPickups.has(pickupId) || !cellShouldHavePickup(x, z)) {
                continue;
            }

            activePickupIds.add(pickupId);
            if (!pickups.has(pickupId)) {
                const pickup = createPickupForCell(x, z, worldBounds);
                if (pickup) {
                    pickups.set(pickupId, pickup);
                    pickupGroup.add(pickup.mesh);
                }
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

function createPickupForCell(cellX, cellZ, worldBounds) {
    const span = CELL_SIZE - CELL_MARGIN * 2;
    const x = cellX * CELL_SIZE + CELL_MARGIN + randomFromCell(cellX, cellZ, 11) * span;
    const z = cellZ * CELL_SIZE + CELL_MARGIN + randomFromCell(cellX, cellZ, 12) * span;
    if (worldBounds && !isInsideWorldBounds(x, z, worldBounds)) {
        return null;
    }
    const y = PICKUP_GROUND_HEIGHT;
    const shapeIndex = Math.floor(
        randomFromCell(cellX, cellZ, 14) * shapeGeometries.length
    ) % shapeGeometries.length;

    return createPickup(x, y, z, shapeIndex, randomFromCell(cellX, cellZ, 22));
}

function getWorldCellBounds(worldBounds) {
    return {
        minCellX: Math.ceil((worldBounds.minX - CELL_SIZE + CELL_MARGIN) / CELL_SIZE),
        maxCellX: Math.floor((worldBounds.maxX - CELL_MARGIN) / CELL_SIZE),
        minCellZ: Math.ceil((worldBounds.minZ - CELL_SIZE + CELL_MARGIN) / CELL_SIZE),
        maxCellZ: Math.floor((worldBounds.maxZ - CELL_MARGIN) / CELL_SIZE),
    };
}

function isInsideWorldBounds(x, z, worldBounds) {
    return (
        x >= worldBounds.minX &&
        x <= worldBounds.maxX &&
        z >= worldBounds.minZ &&
        z <= worldBounds.maxZ
    );
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
        shapeIndex,
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

function normalizeColorIndex(index) {
    const safe = Number.isFinite(index) ? Math.floor(index) : 0;
    return ((safe % shapeColors.length) + shapeColors.length) % shapeColors.length;
}

function getNextTargetColorIndex(currentIndex) {
    if (shapeColors.length <= 1) {
        return currentIndex;
    }

    let nextIndex = currentIndex;
    while (nextIndex === currentIndex) {
        nextIndex = Math.floor(Math.random() * shapeColors.length);
    }
    return nextIndex;
}
