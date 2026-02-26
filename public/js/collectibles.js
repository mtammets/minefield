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
const whiteColor = new THREE.Color(0xffffff);
const pickupGlowTexture = createPickupGlowTexture();
const pickupHaloTexture = createPickupHaloTexture();

const pickupMaterials = shapeColors.map((color) => {
    const tint = new THREE.Color(color);
    return new THREE.MeshStandardMaterial({
        color: tint.clone().lerp(whiteColor, 0.15),
        emissive: tint,
        emissiveIntensity: 0.78,
        metalness: 0.12,
        roughness: 0.2,
    });
});

const pickupShellGeometry = new THREE.IcosahedronGeometry(1.36, 2);
const shellMaterials = shapeColors.map((color) => {
    const tint = new THREE.Color(color);
    return new THREE.MeshStandardMaterial({
        color: tint.clone().lerp(whiteColor, 0.24),
        emissive: tint,
        emissiveIntensity: 0.2,
        roughness: 0.22,
        metalness: 0.1,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
});

const accentMaterials = shapeColors.map((color) => {
    const accentColor = new THREE.Color(color).lerp(whiteColor, 0.46);
    return new THREE.SpriteMaterial({
        map: pickupGlowTexture,
        color: accentColor,
        transparent: true,
        opacity: 0.66,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
    });
});

const orbitGeometry = new THREE.TorusGeometry(1.14, 0.07, 12, 56);
const orbitMaterials = shapeColors.map(
    (color) =>
        new THREE.MeshBasicMaterial({
            color: new THREE.Color(color).lerp(whiteColor, 0.22),
            transparent: true,
            opacity: 0.31,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        })
);

const haloGeometry = new THREE.RingGeometry(1.78, 2.52, 40);
const haloMaterials = shapeColors.map(
    (color) =>
        new THREE.MeshBasicMaterial({
            color: new THREE.Color(color).lerp(whiteColor, 0.18),
            map: pickupHaloTexture,
            alphaMap: pickupHaloTexture,
            transparent: true,
            opacity: 0.56,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        })
);

const effectBurstGeometry = new THREE.IcosahedronGeometry(0.7, 1);
const effectRingGeometry = new THREE.TorusGeometry(1.2, 0.12, 12, 40);
const COLLECT_EFFECT_LIFETIME_SEC = 0.6;
const COLLECT_EFFECT_POOL_PREWARM_COUNT = 10;
const MAX_COLLECT_EFFECT_POOL_SIZE = 28;
const COLLECT_EFFECT_SPAWN_PER_FRAME = 3;
const COLLECT_EFFECT_SPAWN_PER_FRAME_UNDER_LOAD = 1;
const COLLECT_EFFECT_SPAWN_PER_FRAME_SEVERE_LOAD = 0;
const MAX_PENDING_COLLECT_EFFECTS = 36;
const COLLECT_EFFECT_MAX_QUEUE_DELAY_SEC = 0.45;
const COLLECT_EFFECT_MIN_QUEUE_DELAY_SEC = 1 / 72;
const COLLECT_EFFECT_ENABLE_POINT_LIGHT = false;
const COLLECT_EFFECT_REMOTE_ALWAYS_DISTANCE = 30;
const COLLECT_EFFECT_REMOTE_ALWAYS_DISTANCE_SQ =
    COLLECT_EFFECT_REMOTE_ALWAYS_DISTANCE * COLLECT_EFFECT_REMOTE_ALWAYS_DISTANCE;
const COLLECT_EFFECT_REMOTE_THROTTLE_DISTANCE = 44;
const COLLECT_EFFECT_REMOTE_THROTTLE_DISTANCE_SQ =
    COLLECT_EFFECT_REMOTE_THROTTLE_DISTANCE * COLLECT_EFFECT_REMOTE_THROTTLE_DISTANCE;
const COLLECT_EFFECT_REMOTE_MAX_DISTANCE = 62;
const COLLECT_EFFECT_REMOTE_MAX_DISTANCE_SQ =
    COLLECT_EFFECT_REMOTE_MAX_DISTANCE * COLLECT_EFFECT_REMOTE_MAX_DISTANCE;
const COLLECT_EFFECT_REMOTE_MAX_ACTIVE = 6;
const COLLECT_EFFECT_REMOTE_MAX_PENDING = 5;
const queuedCollectEffectPosition = new THREE.Vector3();

export function createCollectibleSystem(scene, worldBounds = null, options = {}) {
    const {
        onTargetColorChanged = () => {},
        onCorrectPickup = () => {},
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
    let runtimeSeedOffset = Number.isFinite(seedOffset) ? Math.floor(seedOffset) : 0;
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
    const collectEffectPool = [];
    const pendingCollectEffects = [];
    let pendingCollectEffectReadIndex = 0;
    let droppedQueuedCollectEffects = 0;
    let skippedRemoteCollectEffects = 0;
    const activePickupIds = new Set();
    const visiblePickupCache = [];
    const worldCellBounds = worldBounds ? getWorldCellBounds(worldBounds) : null;
    let finiteQueueTemplate = [];
    const finiteSpawnQueue = [];
    let finiteSpawnQueueReadIndex = 0;
    const finiteRoundState = {
        total: 0,
        spawned: 0,
        collected: 0,
        exhausted: false,
    };
    const finiteSpawnedSerials = finiteMode ? new Set() : null;

    let targetColorIndex = initialResolvedTargetColorIndex;
    let enabled = true;
    let elapsedTime = 0;
    let lastSyncSignature = '';

    if (finiteMode) {
        rebuildFiniteQueueTemplate();
    }

    if (resolvedEnableEffects) {
        prewarmCollectEffects(collectEffectPool, COLLECT_EFFECT_POOL_PREWARM_COUNT);
    }

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
            const localCollector = resolveLocalCollector(collectors);
            const localCollectorId =
                typeof localCollector?.id === 'string' && localCollector.id.trim()
                    ? localCollector.id.trim()
                    : 'player';
            const localCollectorPosition = localCollector?.position || null;

            if (!enabled || collectors.length === 0) {
                if (resolvedEnableEffects) {
                    processPendingCollectEffects(dt);
                    updateEffects(effects, effectGroup, collectEffectPool, dt);
                }
                return;
            }

            primePickupsForCollectors(collectors);

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

                const pickupPosition = pickup.mesh.position;

                if (resolvedEnableEffects) {
                    if (
                        shouldQueueCollectEffectForCollector(
                            collector,
                            pickupPosition,
                            localCollectorId,
                            localCollectorPosition
                        )
                    ) {
                        queueCollectEffect(pickupPosition, pickup.color);
                    } else {
                        skippedRemoteCollectEffects += 1;
                    }
                }

                removePickup(pickupId, pickup, true);

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
            }

            if (finiteMode) {
                spawnFinitePickupsIntoActiveSlots();
                if (
                    !finiteRoundState.exhausted &&
                    pickups.size === 0 &&
                    getRemainingFiniteSpawnCount() === 0
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
                processPendingCollectEffects(dt);
                updateEffects(effects, effectGroup, collectEffectPool, dt);
            }
        },
        setEnabled(nextEnabled) {
            enabled = Boolean(nextEnabled);
            lastSyncSignature = '';
            if (!enabled && !finiteMode) {
                clearPickups(false);
            }
        },
        reset(resetOptions = null) {
            clearPickups(false);
            clearEffectsNow();
            pickupCooldownUntil.clear();
            activePickupIds.clear();
            visiblePickupCache.length = 0;

            if (resetOptions && typeof resetOptions === 'object') {
                const nextSeedOffset = Number(resetOptions.seedOffset);
                if (Number.isFinite(nextSeedOffset)) {
                    runtimeSeedOffset = Math.floor(nextSeedOffset);
                }
            }

            elapsedTime = 0;
            lastSyncSignature = '';
            enabled = true;

            if (finiteMode) {
                rebuildFiniteQueueTemplate();
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
                remainingQueue: getRemainingFiniteSpawnCount(),
                active: pickups.size,
                exhausted: finiteRoundState.exhausted,
            };
        },
        getPerformanceSnapshot() {
            return {
                pendingCollectEffects: Math.max(
                    0,
                    pendingCollectEffects.length - pendingCollectEffectReadIndex
                ),
                activeCollectEffects: effects.length,
                droppedCollectEffects: droppedQueuedCollectEffects,
                skippedRemoteCollectEffects,
            };
        },
        primeForCollectors(collectorEntries) {
            return primePickupsForCollectors(collectorEntries);
        },
        prewarmEffects(targetCount = COLLECT_EFFECT_POOL_PREWARM_COUNT) {
            if (!resolvedEnableEffects) {
                return 0;
            }
            prewarmCollectEffects(collectEffectPool, targetCount);
            return collectEffectPool.length;
        },
        warmupGraphics(renderer, camera = null) {
            return warmupCollectibleGraphics(renderer, camera);
        },
    };

    function clearPickups(applyCooldown) {
        for (const [pickupId, pickup] of pickups) {
            removePickup(pickupId, pickup, applyCooldown);
        }
    }

    function clearEffectsNow() {
        pendingCollectEffects.length = 0;
        pendingCollectEffectReadIndex = 0;
        droppedQueuedCollectEffects = 0;
        skippedRemoteCollectEffects = 0;
        if (!resolvedEnableEffects || effects.length === 0) {
            return;
        }
        while (effects.length > 0) {
            const effect = effects.pop();
            recycleCollectEffect(effectGroup, collectEffectPool, effect);
        }
    }

    function rebuildFiniteQueueTemplate() {
        if (!finiteMode) {
            return;
        }

        finiteQueueTemplate = buildFinitePickupQueue(
            worldBounds,
            resolvedFiniteTotalPickups,
            runtimeSeedOffset
        );
        finiteSpawnQueue.length = 0;
        finiteSpawnQueue.push(...cloneFiniteQueueItems(finiteQueueTemplate));
        finiteSpawnQueueReadIndex = 0;
        finiteRoundState.total = finiteQueueTemplate.length;
        finiteRoundState.spawned = 0;
        finiteRoundState.collected = 0;
        finiteRoundState.exhausted = false;
        finiteSpawnedSerials?.clear();
    }

    function queueCollectEffect(position, colorHex) {
        if (!position) {
            return;
        }
        const activePendingCount = pendingCollectEffects.length - pendingCollectEffectReadIndex;
        if (activePendingCount >= MAX_PENDING_COLLECT_EFFECTS) {
            droppedQueuedCollectEffects += 1;
            return;
        }
        pendingCollectEffects.push({
            x: position.x,
            y: position.y,
            z: position.z,
            colorHex: colorHex >>> 0,
            queuedAtSec: elapsedTime,
            dueAtSec: elapsedTime + COLLECT_EFFECT_MIN_QUEUE_DELAY_SEC,
        });
    }

    function processPendingCollectEffects(dt) {
        if (pendingCollectEffects.length - pendingCollectEffectReadIndex <= 0) {
            return;
        }
        let budget = resolveCollectEffectSpawnBudget(dt, effects.length);
        while (budget > 0 && pendingCollectEffectReadIndex < pendingCollectEffects.length) {
            const entry = pendingCollectEffects[pendingCollectEffectReadIndex];
            if (Number.isFinite(entry?.dueAtSec) && elapsedTime < entry.dueAtSec) {
                break;
            }
            pendingCollectEffectReadIndex += 1;
            if (!entry) {
                continue;
            }
            const queuedAtSec = Number(entry.queuedAtSec);
            if (
                Number.isFinite(queuedAtSec) &&
                elapsedTime - queuedAtSec > COLLECT_EFFECT_MAX_QUEUE_DELAY_SEC
            ) {
                droppedQueuedCollectEffects += 1;
                continue;
            }
            queuedCollectEffectPosition.set(entry.x, entry.y, entry.z);
            createCollectEffect(
                effectGroup,
                effects,
                collectEffectPool,
                queuedCollectEffectPosition,
                entry.colorHex
            );
            budget -= 1;
        }
        if (pendingCollectEffectReadIndex >= pendingCollectEffects.length) {
            pendingCollectEffects.length = 0;
            pendingCollectEffectReadIndex = 0;
            return;
        }
        if (pendingCollectEffectReadIndex >= 16) {
            pendingCollectEffects.splice(0, pendingCollectEffectReadIndex);
            pendingCollectEffectReadIndex = 0;
        }
    }

    function resolveCollectEffectSpawnBudget(dt, activeEffectCount = 0) {
        if (dt > 1 / 32 || activeEffectCount >= Math.floor(MAX_COLLECT_EFFECT_POOL_SIZE * 0.9)) {
            return COLLECT_EFFECT_SPAWN_PER_FRAME_SEVERE_LOAD;
        }
        if (
            dt > 1 / 42 ||
            activeEffectCount >= Math.floor(MAX_COLLECT_EFFECT_POOL_SIZE * 0.75)
        ) {
            return COLLECT_EFFECT_SPAWN_PER_FRAME_UNDER_LOAD;
        }
        return COLLECT_EFFECT_SPAWN_PER_FRAME;
    }

    function shouldQueueCollectEffectForCollector(
        collector,
        pickupPosition,
        localCollectorId,
        localCollectorPosition
    ) {
        if (!collector || !pickupPosition) {
            return false;
        }
        if (
            !localCollectorPosition ||
            !Number.isFinite(localCollectorPosition.x) ||
            !Number.isFinite(localCollectorPosition.z)
        ) {
            return true;
        }

        const collectorId =
            typeof collector.id === 'string' && collector.id.trim() ? collector.id.trim() : '';
        if (collectorId === localCollectorId || collectorId === 'player') {
            return true;
        }

        const deltaX = pickupPosition.x - localCollectorPosition.x;
        const deltaZ = pickupPosition.z - localCollectorPosition.z;
        const distanceSq = deltaX * deltaX + deltaZ * deltaZ;
        if (!Number.isFinite(distanceSq)) {
            return true;
        }
        if (distanceSq <= COLLECT_EFFECT_REMOTE_ALWAYS_DISTANCE_SQ) {
            return true;
        }
        if (distanceSq > COLLECT_EFFECT_REMOTE_MAX_DISTANCE_SQ) {
            return false;
        }

        const pendingEffectCount = Math.max(
            0,
            pendingCollectEffects.length - pendingCollectEffectReadIndex
        );
        if (
            distanceSq > COLLECT_EFFECT_REMOTE_THROTTLE_DISTANCE_SQ &&
            (effects.length >= COLLECT_EFFECT_REMOTE_MAX_ACTIVE ||
                pendingEffectCount >= COLLECT_EFFECT_REMOTE_MAX_PENDING)
        ) {
            return false;
        }
        return true;
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
                    runtimeSeedOffset + Math.floor(elapsedTime * 100)
                ) *
                    resolvedPickupRespawnJitterSec;
            pickupCooldownUntil.set(pickupId, elapsedTime + cooldown);
        }
    }

    function spawnFinitePickupsIntoActiveSlots() {
        if (!enabled || !finiteMode) {
            return;
        }

        while (pickups.size < resolvedMaxActivePickups && getRemainingFiniteSpawnCount() > 0) {
            const queueItem = finiteSpawnQueue[finiteSpawnQueueReadIndex];
            finiteSpawnQueueReadIndex += 1;
            if (!queueItem) {
                continue;
            }
            const pickup = createPickupForCell(
                queueItem.cellX,
                queueItem.cellZ,
                worldBounds,
                runtimeSeedOffset + queueItem.seedOffset,
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
                    runtimeSeedOffset + queueItem.seedOffset
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

        compactFiniteSpawnQueue();
    }

    function getRemainingFiniteSpawnCount() {
        return Math.max(0, finiteSpawnQueue.length - finiteSpawnQueueReadIndex);
    }

    function compactFiniteSpawnQueue() {
        if (finiteSpawnQueueReadIndex >= finiteSpawnQueue.length) {
            finiteSpawnQueue.length = 0;
            finiteSpawnQueueReadIndex = 0;
            return;
        }
        if (finiteSpawnQueueReadIndex >= 16) {
            finiteSpawnQueue.splice(0, finiteSpawnQueueReadIndex);
            finiteSpawnQueueReadIndex = 0;
        }
    }

    function primePickupsForCollectors(collectorEntries) {
        const collectors = normalizeCollectors(collectorEntries);
        if (!enabled || collectors.length === 0) {
            return pickups.size;
        }
        if (finiteMode) {
            spawnFinitePickupsIntoActiveSlots();
            return pickups.size;
        }

        const syncTick = Math.floor(elapsedTime * 2);
        const syncSignature = `${buildCollectorCellSignature(collectors)}|${syncTick}`;
        if (syncSignature === lastSyncSignature) {
            return pickups.size;
        }

        syncPickupsAroundCollectors({
            pickups,
            pickupGroup,
            pickupCooldownUntil,
            collectors,
            activePickupIds,
            worldBounds,
            worldCellBounds,
            idPrefix: resolvedIdPrefix,
            seedOffset: runtimeSeedOffset,
            activeCellRadius: resolvedActiveCellRadius,
            singleType: resolvedSingleType,
            singleShapeIndex: resolvedSingleShapeIndex,
            elapsedTime,
            maxActivePickups: resolvedMaxActivePickups,
            getGroundHeightAt,
        });
        lastSyncSignature = syncSignature;
        return pickups.size;
    }

    function warmupCollectibleGraphics(renderer, camera = null) {
        if (!renderer || typeof renderer.compile !== 'function') {
            return false;
        }

        const warmupShapeIndex = resolvedSingleType ? resolvedSingleShapeIndex : targetColorIndex;
        const warmupPosition = new THREE.Vector3(0, PICKUP_HEIGHT_ABOVE_GROUND, 0);
        const warmupForward = new THREE.Vector3(0, 0, -1);
        if (camera?.isCamera) {
            warmupPosition.copy(camera.position);
            if (typeof camera.getWorldDirection === 'function') {
                camera.getWorldDirection(warmupForward);
            } else if (camera.quaternion) {
                warmupForward.applyQuaternion(camera.quaternion).normalize();
            }
            if (warmupForward.lengthSq() < 0.0001) {
                warmupForward.set(0, 0, -1);
            }
            warmupPosition.addScaledVector(warmupForward.normalize(), 6.2);
            warmupPosition.y = Math.max(warmupPosition.y, PICKUP_HEIGHT_ABOVE_GROUND + 0.65);
        }

        const warmupPickup = createPickup(
            warmupPosition.x,
            warmupPosition.y,
            warmupPosition.z,
            warmupShapeIndex,
            0.19
        );
        pickupGroup.add(warmupPickup.mesh);

        let warmupEffect = null;
        if (resolvedEnableEffects) {
            prewarmCollectEffects(collectEffectPool, 1);
            warmupEffect = acquireCollectEffect(collectEffectPool);
            activateCollectEffect(
                effectGroup,
                warmupEffect,
                warmupPickup.mesh.position,
                warmupPickup.color
            );
            warmupEffect.elapsed = warmupEffect.lifetime * 0.35;
            applyCollectEffectFrame(warmupEffect, warmupEffect.elapsed / warmupEffect.lifetime, 0);
        }

        const warmupCamera = camera?.isCamera
            ? camera
            : new THREE.PerspectiveCamera(55, 1, 0.1, 100);
        if (!camera?.isCamera) {
            warmupCamera.position.set(
                warmupPosition.x + 4.8,
                warmupPosition.y + 2.1,
                warmupPosition.z + 6.2
            );
            warmupCamera.lookAt(warmupPosition.x, warmupPosition.y + 0.15, warmupPosition.z);
            warmupCamera.aspect = 1;
            warmupCamera.updateProjectionMatrix();
        }
        warmupCamera.updateMatrixWorld(true);
        scene.updateMatrixWorld(true);

        let warmedUp = false;
        try {
            renderer.compile(scene, warmupCamera);
            warmedUp = true;
        } catch {
            warmedUp = false;
        }

        if (warmupEffect) {
            recycleCollectEffect(effectGroup, collectEffectPool, warmupEffect);
        }
        pickupGroup.remove(warmupPickup.mesh);
        disposePickup(warmupPickup);

        return warmedUp;
    }

    function resolveLocalCollector(collectors) {
        if (!Array.isArray(collectors) || collectors.length === 0) {
            return null;
        }
        for (let i = 0; i < collectors.length; i += 1) {
            const collector = collectors[i];
            if (!collector || collector.id !== 'player') {
                continue;
            }
            return collector;
        }
        return collectors[0] || null;
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
            randomFromCell(cellX, cellZ, 171, runtimeSeedOffset + Math.floor(elapsedTime * 60)) *
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
    const allCells = [];

    for (let x = bounds.minCellX; x <= bounds.maxCellX; x += 1) {
        for (let z = bounds.minCellZ; z <= bounds.maxCellZ; z += 1) {
            allCells.push({
                cellX: x,
                cellZ: z,
            });
        }
    }

    if (allCells.length === 0) {
        return queue;
    }

    const normalizedSeedOffset = Number.isFinite(seedOffset) ? Math.floor(seedOffset) : 0;
    let cycle = 0;
    while (queue.length < totalPickups) {
        const cycleSeedOffset = normalizedSeedOffset + cycle * 971;
        const orderedCells = buildBalancedCellCycle(allCells, cycleSeedOffset);
        for (let i = 0; i < orderedCells.length && queue.length < totalPickups; i += 1) {
            const candidate = orderedCells[i];
            queue.push({
                cellX: candidate.cellX,
                cellZ: candidate.cellZ,
                serial: queue.length,
                seedOffset: cycle * 971,
            });
        }
        cycle += 1;
    }

    return queue;
}

function buildBalancedCellCycle(cells, seedOffset = 0) {
    if (!Array.isArray(cells) || cells.length <= 1) {
        return Array.isArray(cells) ? cells.slice() : [];
    }

    let minCellX = Number.POSITIVE_INFINITY;
    let maxCellX = Number.NEGATIVE_INFINITY;
    let minCellZ = Number.POSITIVE_INFINITY;
    let maxCellZ = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < cells.length; i += 1) {
        const cell = cells[i];
        if (cell.cellX < minCellX) {
            minCellX = cell.cellX;
        }
        if (cell.cellX > maxCellX) {
            maxCellX = cell.cellX;
        }
        if (cell.cellZ < minCellZ) {
            minCellZ = cell.cellZ;
        }
        if (cell.cellZ > maxCellZ) {
            maxCellZ = cell.cellZ;
        }
    }

    const centerCellX = (minCellX + maxCellX) * 0.5;
    const centerCellZ = (minCellZ + maxCellZ) * 0.5;
    const ranked = cells
        .map((cell) => {
            const dx = cell.cellX - centerCellX;
            const dz = cell.cellZ - centerCellZ;
            return {
                cell,
                distanceSq: dx * dx + dz * dz,
            };
        })
        .sort((a, b) => a.distanceSq - b.distanceSq);

    const totalCells = ranked.length;
    const innerCount = THREE.MathUtils.clamp(Math.round(totalCells * 0.25), 1, totalCells);
    const middleCount = THREE.MathUtils.clamp(
        Math.round(totalCells * 0.35),
        1,
        Math.max(1, totalCells - innerCount)
    );
    const innerEnd = innerCount;
    const middleEnd = Math.min(totalCells, innerEnd + middleCount);
    const innerCells = ranked.slice(0, innerEnd).map((entry) => entry.cell);
    const middleCells = ranked.slice(innerEnd, middleEnd).map((entry) => entry.cell);
    const outerCells = ranked.slice(middleEnd).map((entry) => entry.cell);

    const shuffledOuter = sortCellsBySeed(outerCells, 457, seedOffset);
    const shuffledInner = sortCellsBySeed(innerCells, 521, seedOffset);
    const shuffledMiddle = sortCellsBySeed(middleCells, 613, seedOffset);
    const ordered = [];
    const groups = [shuffledOuter, shuffledInner, shuffledMiddle];
    let groupIndex = 1;

    while (ordered.length < totalCells) {
        const group = groups[groupIndex % groups.length];
        if (group.length > 0) {
            ordered.push(group.shift());
        }
        groupIndex += 1;
    }

    return ordered;
}

function sortCellsBySeed(cells, salt, seedOffset = 0) {
    return cells.slice().sort(
        (a, b) =>
            hashCell(a.cellX, a.cellZ, salt, seedOffset) -
            hashCell(b.cellX, b.cellZ, salt, seedOffset)
    );
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

    if (Array.isArray(collectorEntries)) {
        if (collectorEntries.length === 0) {
            return collectorEntries;
        }
        let alreadyNormalized = true;
        for (let i = 0; i < collectorEntries.length; i += 1) {
            const entry = collectorEntries[i];
            if (!entry || !entry.position?.isVector3 || typeof entry.id !== 'string' || !entry.id) {
                alreadyNormalized = false;
                break;
            }
        }
        if (alreadyNormalized) {
            return collectorEntries;
        }
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
            if (typeof entry.id === 'string' && entry.id) {
                collectors.push(entry);
                continue;
            }
            const collectorId =
                entry.id == null ? `collector-${i}` : String(entry.id).trim() || `collector-${i}`;
            collectors.push({
                id: collectorId,
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
    let bestCollector = null;
    let bestDistanceSq = Infinity;

    for (let i = 0; i < collectors.length; i += 1) {
        const collector = collectors[i];
        const distanceSq = pickupPosition.distanceToSquared(collector.position);
        if (distanceSq <= PICKUP_RADIUS_SQ && distanceSq < bestDistanceSq) {
            bestDistanceSq = distanceSq;
            bestCollector = collector;
        }
    }

    return bestCollector;
}

function updatePickupVisual(pickup, timeLeft, elapsedTime, blinkWindowSec) {
    const liftWave = Math.sin(elapsedTime * 1.9 + pickup.floatOffset);
    const microLift = Math.sin(elapsedTime * 4.6 + pickup.floatOffset * 1.6);
    pickup.mesh.position.y = pickup.baseY + liftWave * 0.2 + microLift * 0.04;

    pickup.mesh.rotation.y = pickup.baseRotationY + elapsedTime * pickup.spinSpeed;
    pickup.mesh.rotation.x =
        Math.sin(elapsedTime * pickup.meshTiltSpeedX + pickup.floatOffset * 0.8) * 0.055;
    pickup.mesh.rotation.z =
        Math.sin(elapsedTime * pickup.meshTiltSpeedZ + pickup.floatOffset * 1.2) * 0.045;
    pickup.core.rotation.x = elapsedTime * pickup.coreSpinX + pickup.floatOffset * 0.4;
    pickup.core.rotation.z = elapsedTime * pickup.coreSpinZ;
    pickup.shell.rotation.x = elapsedTime * pickup.shellSpinX + pickup.floatOffset * 0.35;
    pickup.shell.rotation.y = elapsedTime * pickup.shellSpinY;
    pickup.orbit.rotation.y = elapsedTime * pickup.orbitSpinY + pickup.floatOffset;
    pickup.orbit.rotation.x =
        Math.PI * 0.5 +
        Math.sin(elapsedTime * pickup.orbitTiltSpeed + pickup.floatOffset * 1.2) * 0.28;
    pickup.halo.rotation.z = elapsedTime * pickup.haloSpinSpeed + pickup.floatOffset * 0.24;

    const idlePulse = 0.95 + (0.5 + Math.sin(elapsedTime * 2.8 + pickup.pulseOffset) * 0.5) * 0.1;
    let blinkScale = 1;

    if (timeLeft < blinkWindowSec) {
        const urgency = 1 - THREE.MathUtils.clamp(timeLeft / blinkWindowSec, 0, 1);
        const blink = 0.5 + Math.sin(elapsedTime * (8 + urgency * 14) + pickup.pulseOffset) * 0.5;
        blinkScale = 0.88 + blink * 0.26 + urgency * 0.11;
    }

    const coreScale = idlePulse * blinkScale;
    pickup.core.scale.setScalar(coreScale);
    pickup.shell.scale.setScalar(0.98 + coreScale * 0.08);
    pickup.halo.scale.setScalar(0.92 + coreScale * 0.17);
    pickup.orbit.scale.setScalar(0.95 + coreScale * 0.1);

    const glowScale = 1.35 + coreScale * 0.58;
    pickup.accent.scale.set(glowScale, glowScale, 1);
    pickup.accent.position.y =
        0.06 + Math.sin(elapsedTime * pickup.glowDriftSpeed + pickup.floatOffset * 1.8) * 0.05;
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

    const accent = new THREE.Sprite(accentMaterials[shapeIndex]);
    accent.scale.set(1.78, 1.78, 1);
    accent.position.y = 0.06;
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
        meshTiltSpeedX: 0.58 + speedVarianceA * 0.72,
        meshTiltSpeedZ: 0.64 + speedVarianceB * 0.68,
        haloSpinSpeed: 0.22 + speedVarianceA * 0.3,
        glowDriftSpeed: 1.28 + speedVarianceB * 1.08,
        pulseOffset: phase * 0.7,
    };
}

function disposePickup(pickup) {
    pickup.mesh.clear();
}

function createCollectEffect(effectGroup, effects, effectPool, position, colorHex) {
    const effect = acquireCollectEffect(effectPool);
    activateCollectEffect(effectGroup, effect, position, colorHex);
    effects.push(effect);
}

function updateEffects(effects, effectGroup, effectPool, dt) {
    for (let i = effects.length - 1; i >= 0; i -= 1) {
        const effect = effects[i];
        effect.elapsed += dt;
        const t = THREE.MathUtils.clamp(effect.elapsed / effect.lifetime, 0, 1);
        applyCollectEffectFrame(effect, t, dt);

        if (t >= 1) {
            recycleCollectEffect(effectGroup, effectPool, effect);
            const lastIndex = effects.length - 1;
            if (i !== lastIndex) {
                effects[i] = effects[lastIndex];
            }
            effects.pop();
        }
    }
}

function prewarmCollectEffects(effectPool, targetCount = COLLECT_EFFECT_POOL_PREWARM_COUNT) {
    if (!Array.isArray(effectPool)) {
        return;
    }
    const normalizedTarget = THREE.MathUtils.clamp(
        Math.floor(normalizePositiveNumber(targetCount, COLLECT_EFFECT_POOL_PREWARM_COUNT)),
        0,
        MAX_COLLECT_EFFECT_POOL_SIZE
    );
    for (let i = effectPool.length; i < normalizedTarget; i += 1) {
        effectPool.push(createCollectEffectBundle());
    }
}

function acquireCollectEffect(effectPool) {
    if (Array.isArray(effectPool) && effectPool.length > 0) {
        return effectPool.pop();
    }
    return createCollectEffectBundle();
}

function recycleCollectEffect(effectGroup, effectPool, effect) {
    if (!effect) {
        return;
    }
    resetCollectEffectBundle(effect);

    if (!Array.isArray(effectPool)) {
        detachCollectEffectObjects(effect);
        disposeCollectEffectBundle(effect);
        return;
    }
    if (effectPool.length < MAX_COLLECT_EFFECT_POOL_SIZE) {
        effectPool.push(effect);
        return;
    }
    detachCollectEffectObjects(effect);
    disposeCollectEffectBundle(effect);
}

function createCollectEffectBundle() {
    const burstMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
    });
    const burst = new THREE.Mesh(effectBurstGeometry, burstMaterial);
    burst.visible = false;
    burst.castShadow = false;
    burst.receiveShadow = false;

    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
    });
    const ring = new THREE.Mesh(effectRingGeometry, ringMaterial);
    ring.visible = false;
    ring.castShadow = false;
    ring.receiveShadow = false;

    const light = COLLECT_EFFECT_ENABLE_POINT_LIGHT
        ? new THREE.PointLight(0xffffff, 2.8, 18, 2)
        : null;
    if (light) {
        light.visible = false;
    }

    const effect = {
        burst,
        ring,
        light,
        lifetime: COLLECT_EFFECT_LIFETIME_SEC,
        elapsed: 0,
    };
    resetCollectEffectBundle(effect);
    return effect;
}

function activateCollectEffect(effectGroup, effect, position, colorHex) {
    if (!effect || !position) {
        return;
    }
    resetCollectEffectBundle(effect);
    effect.burst.material.color.setHex(colorHex >>> 0);
    effect.ring.material.color.setHex(colorHex >>> 0);
    if (effect.light) {
        effect.light.color.setHex(colorHex >>> 0);
    }
    effect.burst.position.copy(position);
    effect.ring.position.copy(position);
    if (effect.light) {
        effect.light.position.copy(position);
    }
    if (effectGroup && effect.burst.parent !== effectGroup) {
        effectGroup.add(effect.burst);
    }
    if (effectGroup && effect.ring.parent !== effectGroup) {
        effectGroup.add(effect.ring);
    }
    if (effect.light) {
        if (effectGroup && effect.light.parent !== effectGroup) {
            effectGroup.add(effect.light);
        }
        effect.light.visible = true;
    }
    effect.burst.visible = true;
    effect.ring.visible = true;
}

function resetCollectEffectBundle(effect) {
    if (!effect) {
        return;
    }
    effect.elapsed = 0;
    effect.lifetime = COLLECT_EFFECT_LIFETIME_SEC;
    effect.burst.visible = false;
    effect.burst.position.set(0, 0, 0);
    effect.burst.rotation.set(0, 0, 0);
    effect.burst.scale.setScalar(1);
    effect.burst.material.opacity = 0;
    effect.ring.visible = false;
    effect.ring.position.set(0, 0, 0);
    effect.ring.rotation.set(Math.PI / 2, 0, 0);
    effect.ring.scale.setScalar(1);
    effect.ring.material.opacity = 0;
    if (effect.light) {
        effect.light.visible = false;
        effect.light.position.set(0, 0, 0);
        effect.light.intensity = 0;
        effect.light.distance = 0;
    }
}

function applyCollectEffectFrame(effect, t, dt) {
    const clampedT = THREE.MathUtils.clamp(t, 0, 1);
    const fade = 1 - clampedT;

    const burstScale = 1 + clampedT * 4.2;
    effect.burst.scale.setScalar(burstScale);
    effect.burst.material.opacity = 0.95 * fade;
    if (dt > 0) {
        effect.burst.rotation.x += dt * 3.5;
        effect.burst.rotation.y += dt * 4.1;
    }

    const ringScale = 1 + clampedT * 5.5;
    effect.ring.scale.setScalar(ringScale);
    effect.ring.material.opacity = 0.7 * fade;
    if (dt > 0) {
        effect.ring.rotation.z += dt * 2.5;
    }

    if (effect.light) {
        effect.light.intensity = 2.8 * fade;
        effect.light.distance = 18 + clampedT * 36;
    }
}

function disposeCollectEffectBundle(effect) {
    if (!effect) {
        return;
    }
    detachCollectEffectObjects(effect);
    effect.burst.material.dispose();
    effect.ring.material.dispose();
}

function detachCollectEffectObjects(effect) {
    effect?.burst?.parent?.remove?.(effect.burst);
    effect?.ring?.parent?.remove?.(effect.ring);
    if (effect?.light) {
        effect.light.parent?.remove?.(effect.light);
    }
}

function createPickupGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) {
        return null;
    }

    const center = canvas.width * 0.5;
    const radius = canvas.width * 0.5;
    const glowGradient = context.createRadialGradient(
        center,
        center,
        canvas.width * 0.05,
        center,
        center,
        radius
    );
    glowGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    glowGradient.addColorStop(0.28, 'rgba(227, 244, 255, 0.95)');
    glowGradient.addColorStop(0.56, 'rgba(152, 210, 255, 0.34)');
    glowGradient.addColorStop(1, 'rgba(152, 210, 255, 0)');
    context.fillStyle = glowGradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    return texture;
}

function createPickupHaloTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) {
        return null;
    }

    const center = canvas.width * 0.5;
    const outerRadius = canvas.width * 0.5;
    const ringGradient = context.createRadialGradient(
        center,
        center,
        canvas.width * 0.24,
        center,
        center,
        outerRadius
    );
    ringGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    ringGradient.addColorStop(0.58, 'rgba(255, 255, 255, 0)');
    ringGradient.addColorStop(0.74, 'rgba(255, 255, 255, 0.82)');
    ringGradient.addColorStop(0.9, 'rgba(255, 255, 255, 0.14)');
    ringGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = ringGradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = 'rgba(255, 255, 255, 0.34)';
    context.lineWidth = 2.3;
    context.setLineDash([11, 16]);
    context.beginPath();
    context.arc(center, center, canvas.width * 0.33, 0, Math.PI * 2);
    context.stroke();

    context.strokeStyle = 'rgba(255, 255, 255, 0.21)';
    context.lineWidth = 1.8;
    context.setLineDash([3, 15]);
    context.beginPath();
    context.arc(center, center, canvas.width * 0.385, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    return texture;
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
