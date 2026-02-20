import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const PICKUP_RADIUS = 3.2;
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS;
const CELL_SIZE = 34;
const CELL_MARGIN = 4;
const CELL_PICKUP_CHANCE = 0.18;
const ACTIVE_CELL_RADIUS = 6;
const PICKUP_HEIGHT_ABOVE_GROUND = 1.35;
const PICKUP_SPAWN_ATTEMPTS = 4;

const shapeGeometries = [
    new THREE.IcosahedronGeometry(0.92, 1),
    new THREE.OctahedronGeometry(0.98, 1),
    new THREE.DodecahedronGeometry(0.9, 1),
    new THREE.TorusKnotGeometry(0.58, 0.19, 72, 10, 2, 3),
];

const shapeColors = [0x7cf9ff, 0xff85f8, 0x8dff9a, 0xffd86b];

const pickupMaterials = shapeColors.map(
    (color) =>
        new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.95,
            metalness: 0.16,
            roughness: 0.18,
        })
);

const pickupShellGeometry = new THREE.IcosahedronGeometry(1.36, 2);
const shellMaterials = shapeColors.map(
    (color) =>
        new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.22,
            roughness: 0.24,
            metalness: 0.14,
            transparent: true,
            opacity: 0.23,
            depthWrite: false,
        })
);

const pickupAccentGeometry = new THREE.OctahedronGeometry(0.34, 0);
const accentMaterials = shapeColors.map((color) => {
    const accentColor = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.42);
    return new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
});

const orbitGeometry = new THREE.TorusGeometry(1.14, 0.07, 12, 56);
const orbitMaterials = shapeColors.map(
    (color) =>
        new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.34,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        })
);

const haloGeometry = new THREE.RingGeometry(1.78, 2.52, 40);
const haloMaterials = shapeColors.map(
    (color) =>
        new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        })
);

const effectBurstGeometry = new THREE.IcosahedronGeometry(0.7, 1);
const effectRingGeometry = new THREE.TorusGeometry(1.2, 0.12, 12, 40);

export function createCollectibleSystem(scene, worldBounds = null, options = {}) {
    const {
        onTargetColorChanged = () => {},
        onCorrectPickup = () => {},
        onWrongPickup = () => {},
        onExhausted = () => {},
        initialTargetColorIndex = Math.floor(Math.random() * shapeColors.length),
        idPrefix = 'pickup',
        seedOffset = 0,
        activeCellRadius = ACTIVE_CELL_RADIUS,
        enableEffects = true,
        singleType = false,
        singleShapeIndex = 0,
        maxActivePickups = 7,
        finiteTotalPickups = 0,
        pickupLifetimeSec = 8,
        pickupLifetimeJitterSec = 3,
        pickupRespawnDelaySec = 1.8,
        pickupRespawnJitterSec = 1.8,
        pickupBlinkWindowSec = 2.2,
        getGroundHeightAt = null,
        staticObstacles = null,
        avoidObstacleCategories = ['building'],
        obstaclePadding = 0,
        spawnAttempts = PICKUP_SPAWN_ATTEMPTS,
    } = options;

    const resolvedIdPrefix = typeof idPrefix === 'string' && idPrefix ? idPrefix : 'pickup';
    const resolvedSeedOffset = Number.isFinite(seedOffset) ? Math.floor(seedOffset) : 0;
    const resolvedActiveCellRadius = Number.isFinite(activeCellRadius)
        ? THREE.MathUtils.clamp(Math.floor(activeCellRadius), 1, 12)
        : ACTIVE_CELL_RADIUS;
    const resolvedEnableEffects = Boolean(enableEffects);
    const resolvedSingleType = Boolean(singleType);
    const resolvedSingleShapeIndex = normalizeColorIndex(singleShapeIndex);
    const resolvedMaxActivePickups = THREE.MathUtils.clamp(
        Math.floor(normalizePositiveNumber(maxActivePickups, 7)),
        1,
        64
    );
    const resolvedFiniteTotalPickups = Number.isFinite(finiteTotalPickups)
        ? THREE.MathUtils.clamp(Math.floor(finiteTotalPickups), 0, 400)
        : 0;
    const finiteMode = resolvedFiniteTotalPickups > 0;
    const resolvedPickupLifetimeSec = THREE.MathUtils.clamp(
        normalizePositiveNumber(pickupLifetimeSec, 8),
        1,
        120
    );
    const resolvedPickupLifetimeJitterSec = THREE.MathUtils.clamp(
        normalizePositiveNumber(pickupLifetimeJitterSec, 3),
        0,
        60
    );
    const resolvedPickupRespawnDelaySec = THREE.MathUtils.clamp(
        normalizePositiveNumber(pickupRespawnDelaySec, 1.8),
        0,
        30
    );
    const resolvedPickupRespawnJitterSec = THREE.MathUtils.clamp(
        normalizePositiveNumber(pickupRespawnJitterSec, 1.8),
        0,
        30
    );
    const resolvedPickupBlinkWindowSec = THREE.MathUtils.clamp(
        normalizePositiveNumber(pickupBlinkWindowSec, 2.2),
        0.3,
        10
    );
    const resolvedStaticObstacles = Array.isArray(staticObstacles) ? staticObstacles : null;
    const resolvedAvoidObstacleCategories = normalizeObstacleCategories(avoidObstacleCategories);
    const resolvedObstaclePadding = Math.max(0, normalizePositiveNumber(obstaclePadding, 0));
    const resolvedSpawnAttempts = THREE.MathUtils.clamp(
        Math.floor(normalizePositiveNumber(spawnAttempts, PICKUP_SPAWN_ATTEMPTS)),
        1,
        12
    );
    const initialResolvedTargetColorIndex = resolvedSingleType
        ? resolvedSingleShapeIndex
        : normalizeColorIndex(initialTargetColorIndex);

    const pickupGroup = new THREE.Group();
    pickupGroup.name = 'magicPickups';
    scene.add(pickupGroup);

    const effectGroup = new THREE.Group();
    effectGroup.name = 'magicPickupEffects';
    scene.add(effectGroup);

    const pickups = new Map();
    const pickupCooldownUntil = new Map();
    const effects = [];
    const activePickupIds = new Set();
    const visiblePickupCache = [];
    const worldCellBounds = worldBounds ? getWorldCellBounds(worldBounds) : null;
    const finiteQueueTemplate = finiteMode
        ? buildFinitePickupQueue(worldBounds, resolvedFiniteTotalPickups, resolvedSeedOffset)
        : [];
    const finiteSpawnQueue = finiteMode ? cloneFiniteQueueItems(finiteQueueTemplate) : [];
    const finiteRoundState = {
        total: finiteQueueTemplate.length,
        spawned: 0,
        collected: 0,
        exhausted: false,
    };
    const finiteSpawnedSerials = finiteMode ? new Set() : null;

    let targetColorIndex = initialResolvedTargetColorIndex;
    let enabled = true;
    let elapsedTime = 0;
    let lastSyncSignature = '';

    emitTargetColorChanged();

    return {
        update(carPosition, deltaTime = 1 / 60) {
            return this.updateForCollectors(
                [
                    {
                        id: 'player',
                        position: carPosition,
                    },
                ],
                deltaTime
            );
        },
        updateForCollectors(collectorEntries, deltaTime = 1 / 60) {
            const dt = Math.min(deltaTime, 0.05);
            elapsedTime += dt;
            const collectors = normalizeCollectors(collectorEntries);

            if (!enabled || collectors.length === 0) {
                if (resolvedEnableEffects) {
                    updateEffects(effects, effectGroup, dt);
                }
                return;
            }

            if (finiteMode) {
                spawnFinitePickupsIntoActiveSlots();
            } else {
                const syncTick = Math.floor(elapsedTime * 2);
                const syncSignature = `${buildCollectorCellSignature(collectors)}|${syncTick}`;
                if (syncSignature !== lastSyncSignature) {
                    syncPickupsAroundCollectors({
                        pickups,
                        pickupGroup,
                        pickupCooldownUntil,
                        collectors,
                        activePickupIds,
                        worldBounds,
                        worldCellBounds,
                        idPrefix: resolvedIdPrefix,
                        seedOffset: resolvedSeedOffset,
                        activeCellRadius: resolvedActiveCellRadius,
                        singleType: resolvedSingleType,
                        singleShapeIndex: resolvedSingleShapeIndex,
                        elapsedTime,
                        maxActivePickups: resolvedMaxActivePickups,
                        getGroundHeightAt,
                    });
                    lastSyncSignature = syncSignature;
                }
            }

            for (const [pickupId, pickup] of pickups) {
                const expireAt = Number.isFinite(pickup.expireAt)
                    ? pickup.expireAt
                    : Number.POSITIVE_INFINITY;
                const timeLeft = expireAt - elapsedTime;
                if (timeLeft <= 0) {
                    const queueItem = finiteMode ? pickup.finiteQueueItem : null;
                    removePickup(pickupId, pickup, !finiteMode);
                    if (finiteMode && queueItem) {
                        finiteSpawnQueue.push({
                            cellX: queueItem.cellX,
                            cellZ: queueItem.cellZ,
                            serial: queueItem.serial,
                            seedOffset: (queueItem.seedOffset || 0) + 971,
                        });
                    }
                    continue;
                }

                if (Number.isFinite(expireAt)) {
                    updatePickupVisual(pickup, timeLeft, elapsedTime, resolvedPickupBlinkWindowSec);
                }
            }

            for (const [pickupId, pickup] of pickups) {
                const collector = findCollectorInRange(pickup.mesh.position, collectors);
                if (!collector) {
                    continue;
                }

                const pickupPosition = pickup.mesh.position.clone();
                const isCorrectPickup =
                    resolvedSingleType || pickup.shapeIndex === targetColorIndex;
                const effectColor = isCorrectPickup ? pickup.color : 0xff4b4b;

                if (resolvedEnableEffects) {
                    createCollectEffect(effectGroup, effects, pickupPosition, effectColor);
                }

                removePickup(pickupId, pickup, true);

                if (isCorrectPickup) {
                    onCorrectPickup({
                        pickupId,
                        pickupColorIndex: pickup.shapeIndex,
                        pickupColorHex: pickup.color,
                        position: pickupPosition,
                        collectorId: collector.id,
                    });
                    if (finiteMode) {
                        finiteRoundState.collected += 1;
                    }

                    if (!resolvedSingleType) {
                        targetColorIndex = getNextTargetColorIndex(targetColorIndex);
                        emitTargetColorChanged();
                    }
                    continue;
                }

                enabled = false;
                onWrongPickup({
                    pickupId,
                    pickupColorIndex: pickup.shapeIndex,
                    pickupColorHex: pickup.color,
                    targetColorIndex,
                    targetColorHex: shapeColors[targetColorIndex],
                    position: pickupPosition,
                    collectorId: collector.id,
                });
                clearPickups(false);
                break;
            }

            if (finiteMode) {
                spawnFinitePickupsIntoActiveSlots();
                if (
                    !finiteRoundState.exhausted &&
                    pickups.size === 0 &&
                    finiteSpawnQueue.length === 0
                ) {
                    finiteRoundState.exhausted = true;
                    enabled = false;
                    onExhausted({
                        totalPickups: finiteRoundState.total,
                        spawnedPickups: finiteRoundState.spawned,
                        collectedPickups: finiteRoundState.collected,
                    });
                }
            }

            if (resolvedEnableEffects) {
                updateEffects(effects, effectGroup, dt);
            }
        },
        setEnabled(nextEnabled) {
            enabled = Boolean(nextEnabled);
            lastSyncSignature = '';
            if (!enabled && !finiteMode) {
                clearPickups(false);
            }
        },
        reset() {
            clearPickups(false);
            clearEffectsNow();
            pickupCooldownUntil.clear();
            activePickupIds.clear();
            visiblePickupCache.length = 0;

            elapsedTime = 0;
            lastSyncSignature = '';
            enabled = true;

            if (finiteMode) {
                finiteSpawnQueue.length = 0;
                finiteSpawnQueue.push(...cloneFiniteQueueItems(finiteQueueTemplate));
                finiteRoundState.total = finiteQueueTemplate.length;
                finiteRoundState.spawned = 0;
                finiteRoundState.collected = 0;
                finiteRoundState.exhausted = false;
                finiteSpawnedSerials.clear();
            }

            targetColorIndex = initialResolvedTargetColorIndex;
            emitTargetColorChanged();
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
                    isTarget: !resolvedSingleType && pickup.shapeIndex === targetColorIndex,
                });
            }

            return visiblePickupCache;
        },
        getSpawnProgress() {
            if (!finiteMode) {
                return null;
            }
            return {
                total: finiteRoundState.total,
                spawned: finiteRoundState.spawned,
                collected: finiteRoundState.collected,
                remainingQueue: finiteSpawnQueue.length,
                active: pickups.size,
                exhausted: finiteRoundState.exhausted,
            };
        },
    };

    function clearPickups(applyCooldown) {
        for (const [pickupId, pickup] of pickups) {
            removePickup(pickupId, pickup, applyCooldown);
        }
    }

    function clearEffectsNow() {
        if (!resolvedEnableEffects || effects.length === 0) {
            return;
        }
        for (let i = effects.length - 1; i >= 0; i -= 1) {
            const effect = effects[i];
            effectGroup.remove(effect.burst);
            effectGroup.remove(effect.ring);
            effectGroup.remove(effect.light);
            effect.burst.material.dispose();
            effect.ring.material.dispose();
            effects.splice(i, 1);
        }
    }

    function removePickup(pickupId, pickup, applyCooldown) {
        pickupGroup.remove(pickup.mesh);
        disposePickup(pickup);
        pickups.delete(pickupId);
        if (applyCooldown && !finiteMode) {
            const cooldown =
                resolvedPickupRespawnDelaySec +
                randomFromCell(
                    pickup.cellX,
                    pickup.cellZ,
                    131,
                    resolvedSeedOffset + Math.floor(elapsedTime * 100)
                ) *
                    resolvedPickupRespawnJitterSec;
            pickupCooldownUntil.set(pickupId, elapsedTime + cooldown);
        }
    }

    function spawnFinitePickupsIntoActiveSlots() {
        if (!enabled || !finiteMode) {
            return;
        }

        while (pickups.size < resolvedMaxActivePickups && finiteSpawnQueue.length > 0) {
            const queueItem = finiteSpawnQueue.shift();
            const pickup = createPickupForCell(
                queueItem.cellX,
                queueItem.cellZ,
                worldBounds,
                resolvedSeedOffset + queueItem.seedOffset,
                resolvedSingleType,
                resolvedSingleShapeIndex,
                getGroundHeightAt,
                resolvedStaticObstacles,
                resolvedAvoidObstacleCategories,
                resolvedObstaclePadding,
                resolvedSpawnAttempts
            );
            if (!pickup) {
                const retryCount = (queueItem.retryCount || 0) + 1;
                if (retryCount <= resolvedSpawnAttempts) {
                    queueItem.retryCount = retryCount;
                    queueItem.seedOffset = (queueItem.seedOffset || 0) + 271;
                    finiteSpawnQueue.push(queueItem);
                }
                continue;
            }

            const pickupId = `${resolvedIdPrefix}:fixed:${queueItem.serial}`;
            pickup.cellX = queueItem.cellX;
            pickup.cellZ = queueItem.cellZ;
            pickup.expireAt = makePickupExpireAt(queueItem.cellX, queueItem.cellZ);
            pickup.finiteQueueItem = queueItem;
            pickup.pulseOffset =
                randomFromCell(
                    queueItem.cellX,
                    queueItem.cellZ,
                    199,
                    resolvedSeedOffset + queueItem.seedOffset
                ) *
                Math.PI *
                2;

            pickups.set(pickupId, pickup);
            pickupGroup.add(pickup.mesh);
            if (!finiteSpawnedSerials.has(queueItem.serial)) {
                finiteSpawnedSerials.add(queueItem.serial);
                finiteRoundState.spawned += 1;
            }
        }
    }

    function emitTargetColorChanged() {
        onTargetColorChanged({
            targetColorIndex,
            targetColorHex: shapeColors[targetColorIndex],
        });
    }

    function makePickupExpireAt(cellX, cellZ) {
        const lifetime =
            resolvedPickupLifetimeSec +
            randomFromCell(cellX, cellZ, 171, resolvedSeedOffset + Math.floor(elapsedTime * 60)) *
                resolvedPickupLifetimeJitterSec;
        return elapsedTime + lifetime;
    }

    function syncPickupsAroundCollectors(context) {
        const {
            pickups,
            pickupGroup,
            pickupCooldownUntil,
            collectors,
            activePickupIds,
            worldBounds,
            worldCellBounds,
            idPrefix,
            seedOffset,
            activeCellRadius,
            singleType,
            singleShapeIndex,
            elapsedTime,
            maxActivePickups,
            getGroundHeightAt,
        } = context;

        activePickupIds.clear();

        for (let i = 0; i < collectors.length; i += 1) {
            const collector = collectors[i];
            const collectorCellX = Math.floor(collector.position.x / CELL_SIZE);
            const collectorCellZ = Math.floor(collector.position.z / CELL_SIZE);

            let startCellX = collectorCellX - activeCellRadius;
            let endCellX = collectorCellX + activeCellRadius;
            let startCellZ = collectorCellZ - activeCellRadius;
            let endCellZ = collectorCellZ + activeCellRadius;

            if (worldCellBounds) {
                startCellX = Math.max(startCellX, worldCellBounds.minCellX);
                endCellX = Math.min(endCellX, worldCellBounds.maxCellX);
                startCellZ = Math.max(startCellZ, worldCellBounds.minCellZ);
                endCellZ = Math.min(endCellZ, worldCellBounds.maxCellZ);
            }

            for (let x = startCellX; x <= endCellX; x += 1) {
                for (let z = startCellZ; z <= endCellZ; z += 1) {
                    const pickupId = `${idPrefix}:${x}:${z}`;
                    if (!cellShouldHavePickup(x, z, seedOffset)) {
                        continue;
                    }

                    activePickupIds.add(pickupId);
                    if (pickups.has(pickupId)) {
                        continue;
                    }
                    if (pickups.size >= maxActivePickups) {
                        continue;
                    }

                    const cooldownUntil = pickupCooldownUntil.get(pickupId) || 0;
                    if (cooldownUntil > elapsedTime) {
                        continue;
                    }

                    const pickup = createPickupForCell(
                        x,
                        z,
                        worldBounds,
                        seedOffset,
                        singleType,
                        singleShapeIndex,
                        getGroundHeightAt,
                        resolvedStaticObstacles,
                        resolvedAvoidObstacleCategories,
                        resolvedObstaclePadding,
                        resolvedSpawnAttempts
                    );
                    if (!pickup) {
                        continue;
                    }

                    pickup.cellX = x;
                    pickup.cellZ = z;
                    pickup.expireAt = makePickupExpireAt(x, z);
                    pickup.pulseOffset = randomFromCell(x, z, 199, seedOffset) * Math.PI * 2;

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
}

function buildFinitePickupQueue(worldBounds, totalPickups, seedOffset = 0) {
    if (!Number.isFinite(totalPickups) || totalPickups <= 0) {
        return [];
    }

    const queue = [];
    const bounds = worldBounds
        ? getWorldCellBounds(worldBounds)
        : {
              minCellX: -10,
              maxCellX: 10,
              minCellZ: -10,
              maxCellZ: 10,
          };
    const candidates = [];

    for (let x = bounds.minCellX; x <= bounds.maxCellX; x += 1) {
        for (let z = bounds.minCellZ; z <= bounds.maxCellZ; z += 1) {
            if (!cellShouldHavePickup(x, z, seedOffset)) {
                continue;
            }
            candidates.push({
                cellX: x,
                cellZ: z,
            });
        }
    }

    if (candidates.length === 0) {
        for (let x = bounds.minCellX; x <= bounds.maxCellX; x += 1) {
            for (let z = bounds.minCellZ; z <= bounds.maxCellZ; z += 1) {
                candidates.push({
                    cellX: x,
                    cellZ: z,
                });
            }
        }
    }

    candidates.sort(
        (a, b) =>
            hashCell(a.cellX, a.cellZ, 457, seedOffset) -
            hashCell(b.cellX, b.cellZ, 457, seedOffset)
    );

    let cursor = 0;
    while (queue.length < totalPickups && candidates.length > 0) {
        const candidate = candidates[cursor % candidates.length];
        queue.push({
            cellX: candidate.cellX,
            cellZ: candidate.cellZ,
            serial: queue.length,
            seedOffset: Math.floor(cursor / candidates.length) * 971,
        });
        cursor += 1;
    }

    return queue;
}

function cloneFiniteQueueItems(queueItems = []) {
    return queueItems.map((item) => ({
        cellX: item.cellX,
        cellZ: item.cellZ,
        serial: item.serial,
        seedOffset: item.seedOffset,
    }));
}

function normalizeCollectors(collectorEntries) {
    if (!collectorEntries) {
        return [];
    }

    const entries = Array.isArray(collectorEntries) ? collectorEntries : [collectorEntries];
    const collectors = [];

    for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        if (!entry) {
            continue;
        }

        if (entry.isVector3) {
            collectors.push({
                id: `collector-${i}`,
                position: entry,
            });
            continue;
        }

        if (entry.position?.isVector3) {
            collectors.push({
                id: entry.id || `collector-${i}`,
                position: entry.position,
            });
        }
    }

    return collectors;
}

function buildCollectorCellSignature(collectors) {
    const keys = [];
    for (let i = 0; i < collectors.length; i += 1) {
        const collector = collectors[i];
        const cellX = Math.floor(collector.position.x / CELL_SIZE);
        const cellZ = Math.floor(collector.position.z / CELL_SIZE);
        keys.push(`${cellX}:${cellZ}`);
    }

    keys.sort();
    return keys.join('|');
}

function findCollectorInRange(pickupPosition, collectors) {
    for (let i = 0; i < collectors.length; i += 1) {
        const collector = collectors[i];
        const distanceSq = pickupPosition.distanceToSquared(collector.position);
        if (distanceSq <= PICKUP_RADIUS_SQ) {
            return collector;
        }
    }

    return null;
}

function updatePickupVisual(pickup, timeLeft, elapsedTime, blinkWindowSec) {
    const liftWave = Math.sin(elapsedTime * 1.9 + pickup.floatOffset);
    const microLift = Math.sin(elapsedTime * 4.6 + pickup.floatOffset * 1.6);
    pickup.mesh.position.y = pickup.baseY + liftWave * 0.2 + microLift * 0.04;

    pickup.mesh.rotation.y = pickup.baseRotationY + elapsedTime * pickup.spinSpeed;
    pickup.core.rotation.x = elapsedTime * pickup.coreSpinX + pickup.floatOffset * 0.4;
    pickup.core.rotation.z = elapsedTime * pickup.coreSpinZ;
    pickup.shell.rotation.x = elapsedTime * pickup.shellSpinX + pickup.floatOffset * 0.35;
    pickup.shell.rotation.y = elapsedTime * pickup.shellSpinY;
    pickup.orbit.rotation.y = elapsedTime * pickup.orbitSpinY + pickup.floatOffset;
    pickup.orbit.rotation.x =
        Math.PI * 0.5 +
        Math.sin(elapsedTime * pickup.orbitTiltSpeed + pickup.floatOffset * 1.2) * 0.28;

    const idlePulse = 0.96 + (0.5 + Math.sin(elapsedTime * 2.8 + pickup.pulseOffset) * 0.5) * 0.09;
    let blinkScale = 1;

    if (timeLeft < blinkWindowSec) {
        const urgency = 1 - THREE.MathUtils.clamp(timeLeft / blinkWindowSec, 0, 1);
        const blink = 0.5 + Math.sin(elapsedTime * (8 + urgency * 14) + pickup.pulseOffset) * 0.5;
        blinkScale = 0.88 + blink * 0.26 + urgency * 0.11;
    }

    const coreScale = idlePulse * blinkScale;
    pickup.core.scale.setScalar(coreScale);
    pickup.accent.scale.setScalar(0.9 + coreScale * 0.25);
    pickup.halo.scale.setScalar(0.95 + coreScale * 0.12);
    pickup.orbit.scale.setScalar(0.96 + coreScale * 0.08);
}

function createPickupForCell(
    cellX,
    cellZ,
    worldBounds,
    seedOffset = 0,
    singleType = false,
    singleShapeIndex = 0,
    getGroundHeightAt = null,
    staticObstacles = null,
    avoidObstacleCategories = null,
    obstaclePadding = 0,
    spawnAttempts = 1
) {
    const span = CELL_SIZE - CELL_MARGIN * 2;
    const shapeIndex = singleType
        ? normalizeColorIndex(singleShapeIndex)
        : Math.floor(randomFromCell(cellX, cellZ, 14, seedOffset) * shapeGeometries.length) %
          shapeGeometries.length;
    const rotYFactor = randomFromCell(cellX, cellZ, 22, seedOffset);
    const attempts = Math.max(1, Math.floor(normalizePositiveNumber(spawnAttempts, 1)));

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const attemptSeedOffset = seedOffset + attempt * 131;
        const x =
            cellX * CELL_SIZE +
            CELL_MARGIN +
            randomFromCell(cellX, cellZ, 11, attemptSeedOffset) * span;
        const z =
            cellZ * CELL_SIZE +
            CELL_MARGIN +
            randomFromCell(cellX, cellZ, 12, attemptSeedOffset) * span;

        if (worldBounds && !isInsideWorldBounds(x, z, worldBounds)) {
            continue;
        }
        if (
            staticObstacles &&
            avoidObstacleCategories &&
            avoidObstacleCategories.size > 0 &&
            isBlockedByObstacles(x, z, staticObstacles, avoidObstacleCategories, obstaclePadding)
        ) {
            continue;
        }

        const groundHeight = typeof getGroundHeightAt === 'function' ? getGroundHeightAt(x, z) : 0;
        const y = groundHeight + PICKUP_HEIGHT_ABOVE_GROUND;
        return createPickup(x, y, z, shapeIndex, rotYFactor);
    }

    return null;
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

function isBlockedByObstacles(x, z, staticObstacles, avoidObstacleCategories, padding = 0) {
    for (let i = 0; i < staticObstacles.length; i += 1) {
        const obstacle = staticObstacles[i];
        if (!obstacle || !avoidObstacleCategories.has(obstacle.category)) {
            continue;
        }

        if (obstacle.type === 'circle') {
            const radius = (Number(obstacle.radius) || 0) + padding;
            const dx = x - (Number(obstacle.x) || 0);
            const dz = z - (Number(obstacle.z) || 0);
            if (dx * dx + dz * dz <= radius * radius) {
                return true;
            }
            continue;
        }

        if (obstacle.type === 'aabb') {
            if (
                x >= (Number(obstacle.minX) || 0) - padding &&
                x <= (Number(obstacle.maxX) || 0) + padding &&
                z >= (Number(obstacle.minZ) || 0) - padding &&
                z <= (Number(obstacle.maxZ) || 0) + padding
            ) {
                return true;
            }
        }
    }

    return false;
}

function cellShouldHavePickup(cellX, cellZ, seedOffset = 0) {
    return randomFromCell(cellX, cellZ, 7, seedOffset) < CELL_PICKUP_CHANCE;
}

function randomFromCell(cellX, cellZ, salt, seedOffset = 0) {
    return hashToUnit(hashCell(cellX, cellZ, salt, seedOffset));
}

function hashToUnit(value) {
    return value / 4294967295;
}

function hashCell(cellX, cellZ, salt, seedOffset = 0) {
    let h =
        (cellX * 374761393 + cellZ * 668265263 + salt * 1442695041 + seedOffset * 1013904223) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return h >>> 0;
}

function createPickup(x, y, z, shapeIndex, rotYFactor = 0) {
    const color = shapeColors[shapeIndex];
    const mesh = new THREE.Group();
    mesh.position.set(x, y, z);
    mesh.rotation.set(0, rotYFactor * Math.PI * 2, 0);

    const shell = new THREE.Mesh(pickupShellGeometry, shellMaterials[shapeIndex]);
    shell.castShadow = false;
    shell.receiveShadow = false;
    mesh.add(shell);

    const core = new THREE.Mesh(shapeGeometries[shapeIndex], pickupMaterials[shapeIndex]);
    core.castShadow = false;
    core.receiveShadow = false;
    mesh.add(core);

    const accent = new THREE.Mesh(pickupAccentGeometry, accentMaterials[shapeIndex]);
    accent.castShadow = false;
    accent.receiveShadow = false;
    mesh.add(accent);

    const orbit = new THREE.Mesh(orbitGeometry, orbitMaterials[shapeIndex]);
    orbit.castShadow = false;
    orbit.receiveShadow = false;
    orbit.rotation.x = Math.PI * 0.5;
    mesh.add(orbit);

    const halo = new THREE.Mesh(haloGeometry, haloMaterials[shapeIndex]);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -1.06;
    mesh.add(halo);

    const phase = rotYFactor * Math.PI * 2;
    const speedVarianceA = (Math.sin(phase * 1.77) + 1) * 0.5;
    const speedVarianceB = (Math.cos(phase * 2.31) + 1) * 0.5;

    return {
        mesh,
        core,
        shell,
        accent,
        orbit,
        halo,
        color,
        shapeIndex,
        baseY: y,
        baseRotationY: phase,
        floatOffset: phase,
        spinSpeed: 0.7 + speedVarianceA * 0.75,
        coreSpinX: 1 + speedVarianceB * 0.8,
        coreSpinZ: 0.75 + speedVarianceA * 0.7,
        shellSpinX: 0.32 + speedVarianceB * 0.24,
        shellSpinY: -0.26 - speedVarianceA * 0.22,
        orbitSpinY: 1.5 + speedVarianceB * 1.25,
        orbitTiltSpeed: 1.85 + speedVarianceA * 0.9,
        pulseOffset: phase * 0.7,
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

    const burst = new THREE.Mesh(effectBurstGeometry, burstMaterial);
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const ring = new THREE.Mesh(effectRingGeometry, ringMaterial);
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

function normalizePositiveNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

function normalizeObstacleCategories(value) {
    if (!value) {
        return new Set();
    }
    const entries = Array.isArray(value) ? value : [value];
    const result = new Set();
    for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        if (typeof entry === 'string' && entry.trim()) {
            result.add(entry.trim());
        }
    }
    return result;
}
