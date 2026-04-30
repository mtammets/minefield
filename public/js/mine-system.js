import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import {
    MINE_DEPLOY_COOLDOWN_MS,
    MINE_ARM_DELAY_MS,
    MINE_TTL_MS,
    MINE_TRIGGER_RADIUS,
    MINE_MAX_PER_OWNER,
    MINE_THROW_SPEED,
    MINE_THROW_VERTICAL_SPEED,
    MINE_THROW_GRAVITY,
    MINE_THROW_AUTO_DETONATE_DELAY_MS,
} from './constants.js';
import { tryConsumeHeavyEventToken } from './frame-heavy-event-budget.js';

const MINE_SURFACE_OFFSET = 0.06;
const MINE_DROP_BACK_OFFSET = 2.8;
const MINE_THROW_FORWARD_OFFSET = 1.6;
const MINE_THROW_UP_OFFSET = 0.8;
const MINE_DETONATION_LIGHT_LIFE = 0.5;
const MINE_DETONATION_RING_LIFE = 0.5;
const RECENT_DETONATION_RETENTION_MS = 5000;
const MAX_POOLED_DETONATION_EFFECTS = 48;
const MAX_ACTIVE_DETONATION_EFFECTS = 28;
const MAX_ACTIVE_DETONATION_LIGHTS = 6;
const DETONATION_EFFECT_POOL_PREWARM_COUNT = MAX_ACTIVE_DETONATION_EFFECTS;
const DETONATION_SPAWN_BUDGET_PER_FRAME = 2;
const DETONATION_SPAWN_BUDGET_UNDER_LOAD = 1;
const DETONATION_SPAWN_BUDGET_SEVERE_LOAD = 0;
const MAX_PENDING_DETONATION_SPAWNS = 72;
const DETONATION_BURST_WINDOW_MS = 240;
const DETONATION_BURST_STAGGER_MS = 18;
const DETONATION_BACKLOG_STAGGER_MS = 6;
const DETONATION_MAX_QUEUE_DELAY_MS = 900;
const DETONATION_MIN_QUEUE_DELAY_MS = 14;
const DETONATION_CULL_DISTANCE = 118;
const DETONATION_CULL_DISTANCE_SQ = DETONATION_CULL_DISTANCE * DETONATION_CULL_DISTANCE;
const MINE_DETONATION_ENABLE_POINT_LIGHTS = false;
const MINE_DETONATION_LIGHT_INTENSITY = 7.2;
const MINE_DETONATION_LIGHT_DISTANCE = 44;
const MINE_DETONATION_LIGHT_NEAR_DISTANCE = 34;
const MINE_DETONATION_LIGHT_NEAR_DISTANCE_SQ =
    MINE_DETONATION_LIGHT_NEAR_DISTANCE * MINE_DETONATION_LIGHT_NEAR_DISTANCE;
const MINE_DETONATION_VISUAL_DISTANCE = 90;
const MINE_DETONATION_VISUAL_DISTANCE_SQ =
    MINE_DETONATION_VISUAL_DISTANCE * MINE_DETONATION_VISUAL_DISTANCE;
const MINE_DETONATION_FULL_DETAIL_DISTANCE = 58;
const MINE_DETONATION_FULL_DETAIL_DISTANCE_SQ =
    MINE_DETONATION_FULL_DETAIL_DISTANCE * MINE_DETONATION_FULL_DETAIL_DISTANCE;
const MINE_DETONATION_SHOCKWAVE_BASE_OPACITY = 0.66;
const MINE_DETONATION_CORE_BASE_OPACITY = 0.96;
const MINE_DETONATION_HALO_BASE_OPACITY = 0.64;
const MINE_DETONATION_CORE_BASE_SCALE = 1.05;
const MINE_DETONATION_HALO_BASE_SCALE = 1.7;
const MINE_DETONATION_SHOCKWAVE_BASE_SCALE = 0.2;
const MINE_DETONATION_HOT_COLOR = new THREE.Color(0xffcf89);
const MINE_DETONATION_WARM_COLOR = new THREE.Color(0xff8d4f);
const MINE_DETONATION_COOL_COLOR = new THREE.Color(0xff4a32);
const MINE_MESH_POOL_MAX = 24;
const MINE_MESH_POOL_PREWARM_COUNT = 10;
const DEFAULT_TARGET_COLLISION_RADIUS = 1.34;
const POSITION_HISTORY_MAX_AGE_MS = 260;
const POSITION_HISTORY_RETENTION_MS = 4000;

const mineForward = new THREE.Vector3();
const mineThrowVelocity = new THREE.Vector3();
const mineGroundPosition = new THREE.Vector3();
const queuedDetonationPosition = new THREE.Vector3();

export function createMineSystemController(options = {}) {
    const {
        scene,
        car,
        getGroundHeightAt = () => 0,
        getVehicleState = () => ({}),
        getOtherVehicleTargets = () => [],
        getLocalPlayerId = () => '',
        getLocalPlayerName = () => 'Driver',
        canUseMines = () => false,
        emitMinePlaced = () => {},
        emitMineDetonated = () => {},
        onLocalMineHit = () => {},
        onOtherVehicleMineHit = () => {},
        onMineDeployed = () => {},
        onMineDetonated = () => {},
    } = options;

    if (!scene || !car) {
        return createNoopMineSystemController();
    }

    const minesById = new Map();
    const detonationEffects = [];
    const detonationEffectPool = [];
    const detonationShockwaveGeometry = new THREE.PlaneGeometry(1, 1);
    const detonationShockwaveTexture = createDetonationShockwaveTexture();
    const detonationCoreTexture = createDetonationCoreTexture();
    const detonationHaloTexture = createDetonationHaloTexture();
    const recentDetonations = new Map();
    const ownerLastDeployAtMs = new Map();
    const previousPositionByEntityKey = new Map();
    const mineMeshPool = [];
    const mineMarkerBuffer = [];
    const pendingDetonationSpawns = [];
    let mineSequence = 0;
    let collisionWasEnabledLastFrame = false;
    let activeDetonationLightCount = 0;
    let pendingDetonationSpawnReadIndex = 0;
    let detonationBurstCount = 0;
    let lastDetonationQueuedAtMs = -100_000;
    let droppedQueuedDetonations = 0;
    const activeEntityKeysScratch = new Set();
    const otherMovementTargetsScratch = [];
    const localMineSweepMovement = {
        entityKey: '',
        fromX: 0,
        fromZ: 0,
        toX: 0,
        toZ: 0,
        collisionRadius: DEFAULT_TARGET_COLLISION_RADIUS,
    };

    prewarmDetonationEffects();
    prewarmMineMeshes();

    return {
        deployMine,
        deployMineForOwner,
        update,
        getMineMarkers,
        applyRoomMineSnapshot,
        handleRemoteMinePlaced,
        handleRemoteMineDetonated,
        getPerformanceSnapshot,
        clearAll,
        warmupGraphics,
    };

    function deployMine(mode = 'drop') {
        const localPlayerId = sanitizePlayerId(getLocalPlayerId());
        const localPlayerName = sanitizeOwnerName(getLocalPlayerName());
        const vehicleState = getVehicleState() || {};
        return deployMineForOwner({
            ownerId: localPlayerId,
            ownerName: localPlayerName,
            sourcePosition: car.position,
            sourceHeading: car.rotation.y,
            sourceVelocityX: Number(vehicleState?.velocity?.x) || 0,
            sourceVelocityZ: Number(vehicleState?.velocity?.y) || 0,
            mode,
            requireCanUseMines: true,
            emitPlacedEvent: true,
            notifyMineDeployed: true,
            includePlayerMessages: true,
        });
    }

    function deployMineForOwner(options = {}) {
        const {
            ownerId: rawOwnerId = '',
            ownerName: rawOwnerName = 'Driver',
            sourcePosition = null,
            sourceHeading = 0,
            sourceVelocityX = 0,
            sourceVelocityZ = 0,
            mode = 'drop',
            requireCanUseMines = false,
            emitPlacedEvent = false,
            notifyMineDeployed = true,
            includePlayerMessages = false,
        } = options;

        const useThrowMode = mode === 'throw';
        const ownerId = sanitizePlayerId(rawOwnerId);
        const ownerName = sanitizeOwnerName(rawOwnerName);

        if (requireCanUseMines && !canUseMines()) {
            return {
                ok: false,
                message: includePlayerMessages
                    ? 'Landmines are unavailable right now.'
                    : 'Mine deployment is currently disabled.',
            };
        }
        if (!ownerId) {
            return {
                ok: false,
                message: includePlayerMessages
                    ? 'Landmine unavailable while online identity is syncing.'
                    : 'Mine deployment owner is invalid.',
            };
        }

        const now = Date.now();
        const lastDeployAtMs = ownerLastDeployAtMs.get(ownerId) ?? -100_000;
        const cooldownRemainingMs = lastDeployAtMs + MINE_DEPLOY_COOLDOWN_MS - now;
        if (cooldownRemainingMs > 0) {
            return {
                ok: false,
                message: includePlayerMessages
                    ? `Landmine reloading (${(cooldownRemainingMs / 1000).toFixed(1)}s).`
                    : 'Mine deployment cooldown active.',
            };
        }

        const ownerMineCount = countOwnerMines(ownerId);
        if (ownerMineCount >= MINE_MAX_PER_OWNER) {
            return {
                ok: false,
                message: `Mine limit reached (${MINE_MAX_PER_OWNER}). Wait for detonation/expiry.`,
            };
        }

        const spawnData = resolveMineSpawnData({
            useThrowMode,
            sourcePosition,
            sourceHeading,
            sourceVelocityX,
            sourceVelocityZ,
        });
        if (!spawnData) {
            return {
                ok: false,
                message: 'Unable to deploy landmine at the moment.',
            };
        }

        mineSequence += 1;
        const mineId = `${ownerId}-${now.toString(36)}-${mineSequence.toString(36)}`;
        const snapshot = sanitizeMineSnapshot(
            {
                mineId,
                ownerId,
                ownerName,
                x: spawnData.position.x,
                y: spawnData.position.y,
                z: spawnData.position.z,
                velocityX: spawnData.velocity.x,
                velocityY: spawnData.velocity.y,
                velocityZ: spawnData.velocity.z,
                triggerRadius: MINE_TRIGGER_RADIUS,
                armDelayMs: MINE_ARM_DELAY_MS,
                ttlMs: MINE_TTL_MS,
                thrown: useThrowMode,
                createdAt: now,
                armedAt: now + MINE_ARM_DELAY_MS,
                expiresAt: now + MINE_TTL_MS,
            },
            {
                ownerIdFallback: ownerId,
                ownerNameFallback: ownerName,
                timeFallback: now,
            }
        );
        if (!snapshot) {
            return {
                ok: false,
                message: 'Landmine deployment payload was invalid.',
            };
        }

        upsertMine(snapshot, { preferIncomingPosition: true });
        ownerLastDeployAtMs.set(ownerId, now);
        if (emitPlacedEvent) {
            emitMinePlaced(snapshot);
        }
        if (notifyMineDeployed) {
            onMineDeployed({
                mineSnapshot: snapshot,
                mode: useThrowMode ? 'throw' : 'drop',
            });
        }

        return {
            ok: true,
            mineSnapshot: snapshot,
            mode: useThrowMode ? 'throw' : 'drop',
            message: includePlayerMessages
                ? useThrowMode
                    ? 'Mine thrown ahead. It arms shortly after landing.'
                    : 'Mine dropped behind your car.'
                : '',
        };
    }

    function resolveMineSpawnData({
        useThrowMode = false,
        sourcePosition = null,
        sourceHeading = 0,
        sourceVelocityX = 0,
        sourceVelocityZ = 0,
    } = {}) {
        if (!sourcePosition || typeof sourcePosition !== 'object') {
            return null;
        }

        const sourceX = Number(sourcePosition.x);
        const sourceY = Number(sourcePosition.y);
        const sourceZ = Number(sourcePosition.z);
        if (!Number.isFinite(sourceX) || !Number.isFinite(sourceZ)) {
            return null;
        }

        const fallbackGroundY = getGroundHeightAt(sourceX, sourceZ);
        const resolvedSourceY = Number.isFinite(sourceY) ? sourceY : fallbackGroundY;
        const heading = Number.isFinite(sourceHeading) ? sourceHeading : 0;

        mineForward.set(-Math.sin(heading), 0, -Math.cos(heading)).normalize();
        if (mineForward.lengthSq() < 0.0001) {
            mineForward.set(0, 0, -1);
        }

        const spawnOffset = useThrowMode ? MINE_THROW_FORWARD_OFFSET : -MINE_DROP_BACK_OFFSET;
        mineGroundPosition
            .set(sourceX, resolvedSourceY, sourceZ)
            .addScaledVector(mineForward, spawnOffset);
        const groundHeight = getGroundHeightAt(mineGroundPosition.x, mineGroundPosition.z);
        const spawnY = useThrowMode
            ? resolvedSourceY + MINE_THROW_UP_OFFSET
            : groundHeight + MINE_SURFACE_OFFSET;
        mineGroundPosition.y = spawnY;

        const carryX = Number(sourceVelocityX) || 0;
        const carryZ = Number(sourceVelocityZ) || 0;
        mineThrowVelocity.set(0, 0, 0);
        if (useThrowMode) {
            mineThrowVelocity.copy(mineForward).multiplyScalar(MINE_THROW_SPEED);
            mineThrowVelocity.x += carryX * 0.28;
            mineThrowVelocity.z += carryZ * 0.28;
            mineThrowVelocity.y = MINE_THROW_VERTICAL_SPEED;
        }

        return {
            position: mineGroundPosition.clone(),
            velocity: mineThrowVelocity.clone(),
        };
    }

    function update(deltaTime = 1 / 60, context = {}) {
        const dt = Math.min(Math.max(deltaTime, 0), 0.05);
        if (dt <= 0) {
            return;
        }

        const now = Date.now();
        if (now - lastDetonationQueuedAtMs > DETONATION_BURST_WINDOW_MS) {
            detonationBurstCount = 0;
        }
        const localPlayerId = sanitizePlayerId(context.localPlayerId || getLocalPlayerId());
        const localCarPosition = context.localCarPosition || car.position;
        const enableLocalCollision = Boolean(context.enableLocalCollision);
        const otherVehicleTargets = Array.isArray(context.otherVehicleTargets)
            ? context.otherVehicleTargets
            : getOtherVehicleTargets();
        const localCollisionRadius = resolveCollisionRadius(
            context.localCollisionRadius,
            DEFAULT_TARGET_COLLISION_RADIUS
        );
        const activeEntityKeys = activeEntityKeysScratch;
        activeEntityKeys.clear();
        const allowSweep = enableLocalCollision && collisionWasEnabledLastFrame;
        let localMovement = null;
        if (localPlayerId) {
            const localEntityKey = `local:${localPlayerId}`;
            localMovement = createMovementSnapshot({
                position: localCarPosition,
                entityKey: localEntityKey,
                now,
                allowSweep,
                collisionRadius: localCollisionRadius,
                previousPositionByEntityKey,
            });
            if (localMovement) {
                activeEntityKeys.add(localEntityKey);
            }
        }

        const otherMovementTargets = otherMovementTargetsScratch;
        otherMovementTargets.length = 0;
        for (let targetIndex = 0; targetIndex < otherVehicleTargets.length; targetIndex += 1) {
            const target = otherVehicleTargets[targetIndex];
            if (!target?.position || typeof target.position !== 'object') {
                continue;
            }
            const targetPlayerId = sanitizePlayerId(target.playerId || target.id);
            if (!targetPlayerId) {
                continue;
            }
            const targetOwnerId = sanitizePlayerId(target.ownerId || target.id);
            const targetEntityKey = `target:${targetPlayerId}`;
            const movement = createMovementSnapshot({
                position: target.position,
                entityKey: targetEntityKey,
                now,
                allowSweep,
                collisionRadius: resolveCollisionRadius(
                    target.collisionRadius || target.radius,
                    DEFAULT_TARGET_COLLISION_RADIUS
                ),
                previousPositionByEntityKey,
            });
            if (!movement) {
                continue;
            }

            activeEntityKeys.add(targetEntityKey);
            otherMovementTargets.push({
                id: String(target.id || ''),
                type: String(target.type || ''),
                label: String(target.label || ''),
                playerId: targetPlayerId,
                ownerId: targetOwnerId,
                mineImmune: Boolean(target.mineImmune),
                movement,
            });
        }

        for (const [mineId, mine] of minesById.entries()) {
            if (mine.expiresAt <= now) {
                removeMine(mineId);
                continue;
            }

            if (mine.thrown && !mine.landed) {
                mine.velocity.y -= MINE_THROW_GRAVITY * dt;
                mine.mesh.position.addScaledVector(mine.velocity, dt);

                const groundY =
                    getGroundHeightAt(mine.mesh.position.x, mine.mesh.position.z) +
                    MINE_SURFACE_OFFSET;
                if (mine.mesh.position.y <= groundY) {
                    mine.mesh.position.y = groundY;
                    mine.velocity.set(0, 0, 0);
                    mine.landed = true;
                    mine.landedAt = now;
                }
            } else {
                const groundY =
                    getGroundHeightAt(mine.mesh.position.x, mine.mesh.position.z) +
                    MINE_SURFACE_OFFSET;
                mine.mesh.position.y = groundY;
            }

            const localOwnThrownMine =
                Boolean(localPlayerId) && mine.ownerId && mine.ownerId === localPlayerId;
            if (
                mine.thrown &&
                mine.landed &&
                localOwnThrownMine &&
                now >= mine.landedAt + MINE_THROW_AUTO_DETONATE_DELAY_MS
            ) {
                detonateMine(mineId, {
                    emitNetworkEvent: true,
                    triggerPlayerId: localPlayerId,
                    targetPlayerId: '',
                    localHit: false,
                    detonationType: 'timed_throw',
                    landedAt: mine.landedAt,
                });
                continue;
            }

            const armed = now >= mine.armedAt && mine.landed;
            mine.pulsePhase += dt * (armed ? 13 : 4.6);
            const blink = 0.5 + 0.5 * Math.sin(mine.pulsePhase);
            mine.ledMaterial.emissiveIntensity = armed ? 0.95 + blink * 1.85 : 0.22 + blink * 0.26;
            mine.ledMaterial.color.setHex(armed ? 0xff7a72 : 0x8fa7c8);
            mine.mesh.rotation.y += dt * (mine.thrown ? 1.1 : 0.5);

            if (!enableLocalCollision) {
                continue;
            }

            const ownerLocalTriggerEnabled =
                localPlayerId && mine.ownerId && mine.ownerId === localPlayerId;
            const localTriggerActive = mine.landed && (armed || ownerLocalTriggerEnabled);

            let detonatedThisFrame = false;
            if (localMovement && localTriggerActive) {
                const ownMineCollision = Boolean(ownerLocalTriggerEnabled);
                let localMovementForMine = localMovement;
                if (ownMineCollision) {
                    localMineSweepMovement.entityKey = localMovement.entityKey;
                    localMineSweepMovement.fromX = localMovement.toX;
                    localMineSweepMovement.fromZ = localMovement.toZ;
                    localMineSweepMovement.toX = localMovement.toX;
                    localMineSweepMovement.toZ = localMovement.toZ;
                    localMineSweepMovement.collisionRadius = localMovement.collisionRadius;
                    localMovementForMine = localMineSweepMovement;
                }
                if (
                    movementIntersectsMineRadius({
                        movement: localMovementForMine,
                        minePosition: mine.mesh.position,
                        triggerRadius: mine.triggerRadius,
                        targetCollisionRadius: ownMineCollision ? 0 : localMovement.collisionRadius,
                    })
                ) {
                    detonateMine(mineId, {
                        emitNetworkEvent: true,
                        triggerPlayerId: localPlayerId,
                        targetPlayerId: localPlayerId,
                        localHit: true,
                    });
                    detonatedThisFrame = true;
                }
            }
            if (detonatedThisFrame) {
                continue;
            }

            for (let targetIndex = 0; targetIndex < otherMovementTargets.length; targetIndex += 1) {
                const target = otherMovementTargets[targetIndex];
                if (target.mineImmune) {
                    continue;
                }
                if (!armed) {
                    continue;
                }
                if (target.ownerId && target.ownerId === mine.ownerId) {
                    continue;
                }
                if (
                    !movementIntersectsMineRadius({
                        movement: target.movement,
                        minePosition: mine.mesh.position,
                        triggerRadius: mine.triggerRadius,
                    })
                ) {
                    continue;
                }

                detonateMine(mineId, {
                    emitNetworkEvent: false,
                    triggerPlayerId: target.playerId,
                    targetPlayerId: target.playerId,
                    localHit: false,
                    otherTarget: {
                        id: target.id,
                        type: target.type,
                        label: target.label,
                        ownerId: target.ownerId,
                    },
                });
                detonatedThisFrame = true;
                break;
            }
        }

        processPendingDetonationSpawns(dt, now);
        updateDetonationEffects(dt);
        pruneRecentDetonations(now);
        if (localMovement) {
            storeMovementSnapshot(previousPositionByEntityKey, localMovement, now);
        }
        for (let index = 0; index < otherMovementTargets.length; index += 1) {
            storeMovementSnapshot(
                previousPositionByEntityKey,
                otherMovementTargets[index].movement,
                now
            );
        }
        pruneMovementHistory(previousPositionByEntityKey, activeEntityKeys, now);
        collisionWasEnabledLastFrame = enableLocalCollision;
    }

    function applyRoomMineSnapshot(mineSnapshots = []) {
        if (!Array.isArray(mineSnapshots)) {
            return;
        }

        const incomingIds = new Set();
        const now = Date.now();
        for (let index = 0; index < mineSnapshots.length; index += 1) {
            const snapshot = sanitizeMineSnapshot(mineSnapshots[index], {
                ownerIdFallback: '',
                ownerNameFallback: 'Driver',
                timeFallback: now,
            });
            if (!snapshot) {
                continue;
            }
            if (recentDetonations.has(snapshot.mineId)) {
                continue;
            }
            incomingIds.add(snapshot.mineId);
            upsertMine(snapshot);
        }

        for (const existingMineId of minesById.keys()) {
            if (!incomingIds.has(existingMineId)) {
                removeMine(existingMineId);
            }
        }
    }

    function handleRemoteMinePlaced(snapshot) {
        const sanitized = sanitizeMineSnapshot(snapshot, {
            ownerIdFallback: '',
            ownerNameFallback: 'Driver',
            timeFallback: Date.now(),
        });
        if (!sanitized || recentDetonations.has(sanitized.mineId)) {
            return;
        }
        upsertMine(sanitized);
    }

    function handleRemoteMineDetonated(snapshot) {
        const mineId = sanitizeMineId(snapshot?.mineId);
        if (!mineId) {
            return;
        }
        const fallbackPosition = {
            x: clampFinite(snapshot?.x, -5000, 5000, 0),
            y: clampFinite(snapshot?.y, -400, 2500, 0),
            z: clampFinite(snapshot?.z, -5000, 5000, 0),
        };
        detonateMine(mineId, {
            emitNetworkEvent: false,
            triggerPlayerId: sanitizePlayerId(snapshot?.triggerPlayerId),
            targetPlayerId: sanitizePlayerId(snapshot?.targetPlayerId),
            ownerId: sanitizePlayerId(snapshot?.ownerId),
            ownerName: sanitizeOwnerName(snapshot?.ownerName),
            ownerPointsAwarded: clampFinite(snapshot?.ownerPointsAwarded, 0, 10_000, 0),
            ownerScore: clampFinite(snapshot?.ownerScore, 0, Number.MAX_SAFE_INTEGER, 0),
            ownerScoring:
                snapshot?.ownerScoring && typeof snapshot.ownerScoring === 'object'
                    ? {
                          chainCount: clampFinite(snapshot.ownerScoring.chainCount, 1, 64, 1),
                          chainMultiplier: clampFinite(
                              snapshot.ownerScoring.chainMultiplier,
                              1,
                              5,
                              1
                          ),
                          endgameBonus: clampFinite(snapshot.ownerScoring.endgameBonus, 0, 1, 0),
                          antiFarmMultiplier: clampFinite(
                              snapshot.ownerScoring.antiFarmMultiplier,
                              0,
                              1,
                              1
                          ),
                          repeatedTarget: Boolean(snapshot.ownerScoring.repeatedTarget),
                          roundProgress: clampFinite(snapshot.ownerScoring.roundProgress, 0, 1, 0),
                      }
                    : null,
            fallbackPosition,
            localHit: false,
        });
    }

    function detonateMine(mineId, context = {}) {
        const now = Date.now();
        if (recentDetonations.has(mineId)) {
            return;
        }

        const mine = minesById.get(mineId);
        const fallbackPosition = context.fallbackPosition || null;
        const detonationPosition = mine
            ? mine.mesh.position.clone()
            : new THREE.Vector3(
                  clampFinite(fallbackPosition?.x, -5000, 5000, car.position.x),
                  clampFinite(fallbackPosition?.y, -400, 2500, car.position.y),
                  clampFinite(fallbackPosition?.z, -5000, 5000, car.position.z)
              );
        const resolvedOwnerId = mine?.ownerId || context.ownerId || '';
        const resolvedOwnerName = mine?.ownerName || context.ownerName || 'Driver';

        if (mine) {
            removeMine(mineId);
        }

        recentDetonations.set(mineId, now);
        queueDetonationEffectSpawn(detonationPosition, {
            preferLight: Boolean(context.localHit),
        }, now);
        onMineDetonated({
            mineId,
            position: detonationPosition,
            localHit: Boolean(context.localHit),
            ownerId: resolvedOwnerId,
            ownerName: resolvedOwnerName,
            triggerPlayerId: sanitizePlayerId(context.triggerPlayerId),
            targetPlayerId: sanitizePlayerId(context.targetPlayerId),
            ownerPointsAwarded: clampFinite(context.ownerPointsAwarded, 0, 10_000, 0),
            ownerScore: clampFinite(context.ownerScore, 0, Number.MAX_SAFE_INTEGER, 0),
            ownerScoring:
                context.ownerScoring && typeof context.ownerScoring === 'object'
                    ? context.ownerScoring
                    : null,
        });

        if (context.emitNetworkEvent) {
            emitMineDetonated({
                mineId,
                x: detonationPosition.x,
                y: detonationPosition.y,
                z: detonationPosition.z,
                triggerPlayerId: sanitizePlayerId(context.triggerPlayerId),
                targetPlayerId: sanitizePlayerId(context.targetPlayerId),
                detonationType:
                    context.detonationType === 'timed_throw' ? 'timed_throw' : undefined,
                landedAt:
                    context.detonationType === 'timed_throw'
                        ? clampFinite(
                              context.landedAt,
                              0,
                              Number.MAX_SAFE_INTEGER,
                              now
                          )
                        : undefined,
            });
        }

        if (context.localHit) {
            onLocalMineHit({
                mineId,
                ownerId: resolvedOwnerId,
                ownerName: resolvedOwnerName,
                position: detonationPosition,
            });
        }
        if (context.otherTarget) {
            onOtherVehicleMineHit({
                mineId,
                ownerId: resolvedOwnerId,
                ownerName: resolvedOwnerName,
                position: detonationPosition,
                target: context.otherTarget,
            });
        }
    }

    function getPerformanceSnapshot() {
        return {
            pendingDetonationSpawns: Math.max(
                0,
                pendingDetonationSpawns.length - pendingDetonationSpawnReadIndex
            ),
            activeDetonationEffects: detonationEffects.length,
            activeDetonationLights: activeDetonationLightCount,
            detonationBurstCount: detonationBurstCount,
            droppedDetonationEffects: droppedQueuedDetonations,
        };
    }

    function upsertMine(snapshot, options = {}) {
        const { preferIncomingPosition = false } = options;
        const existingMine = minesById.get(snapshot.mineId);
        if (!existingMine) {
            const mine = createMineRuntime(snapshot);
            minesById.set(snapshot.mineId, mine);
            scene.add(mine.mesh);
            return mine;
        }

        existingMine.ownerId = snapshot.ownerId;
        existingMine.ownerName = snapshot.ownerName;
        existingMine.triggerRadius = snapshot.triggerRadius;
        existingMine.armDelayMs = snapshot.armDelayMs;
        existingMine.ttlMs = snapshot.ttlMs;
        existingMine.createdAt = snapshot.createdAt;
        existingMine.armedAt = snapshot.armedAt;
        existingMine.expiresAt = snapshot.expiresAt;
        existingMine.thrown = snapshot.thrown;
        existingMine.velocity.set(snapshot.velocityX, snapshot.velocityY, snapshot.velocityZ);
        existingMine.landed = existingMine.landed || !snapshot.thrown;
        existingMine.landedAt =
            existingMine.landedAt ??
            (existingMine.landed ? existingMine.createdAt : Number.POSITIVE_INFINITY);
        if (preferIncomingPosition || !existingMine.landed) {
            existingMine.mesh.position.set(snapshot.x, snapshot.y, snapshot.z);
        }
        return existingMine;
    }

    function createMineRuntime(snapshot) {
        const meshBundle = acquireMineMeshBundle();
        meshBundle.group.position.set(snapshot.x, snapshot.y, snapshot.z);
        return {
            id: snapshot.mineId,
            ownerId: snapshot.ownerId,
            ownerName: snapshot.ownerName,
            triggerRadius: snapshot.triggerRadius,
            armDelayMs: snapshot.armDelayMs,
            ttlMs: snapshot.ttlMs,
            createdAt: snapshot.createdAt,
            armedAt: snapshot.armedAt,
            expiresAt: snapshot.expiresAt,
            thrown: snapshot.thrown,
            landed: !snapshot.thrown,
            landedAt: snapshot.thrown ? Number.POSITIVE_INFINITY : snapshot.createdAt,
            velocity: new THREE.Vector3(snapshot.velocityX, snapshot.velocityY, snapshot.velocityZ),
            mesh: meshBundle.group,
            meshBundle,
            ledMaterial: meshBundle.ledMaterial,
            pulsePhase: Math.random() * Math.PI * 2,
        };
    }

    function removeMine(mineId) {
        const mine = minesById.get(mineId);
        if (!mine) {
            return;
        }
        scene.remove(mine.mesh);
        recycleMineMeshBundle(mine.meshBundle);
        minesById.delete(mineId);
    }

    function clearAll() {
        for (const mineId of Array.from(minesById.keys())) {
            removeMine(mineId);
        }
        pendingDetonationSpawns.length = 0;
        pendingDetonationSpawnReadIndex = 0;
        detonationBurstCount = 0;
        droppedQueuedDetonations = 0;
        lastDetonationQueuedAtMs = -100_000;
        while (detonationEffects.length > 0) {
            removeActiveDetonationEffectAt(detonationEffects.length - 1);
        }
        activeDetonationLightCount = 0;
        recentDetonations.clear();
        ownerLastDeployAtMs.clear();
        previousPositionByEntityKey.clear();
        collisionWasEnabledLastFrame = false;
    }

    function warmupGraphics(renderer, camera = null) {
        if (!renderer || typeof renderer.render !== 'function') {
            return false;
        }

        const warmupPosition = new THREE.Vector3(car.position.x, car.position.y, car.position.z);
        const groundY = getGroundHeightAt(warmupPosition.x, warmupPosition.z);
        warmupPosition.y =
            (Number.isFinite(groundY) ? groundY : warmupPosition.y) + MINE_SURFACE_OFFSET;

        const mineBundle = acquireMineMeshBundle();
        mineBundle.group.position.copy(warmupPosition);
        mineBundle.group.position.x += 2.2;
        mineBundle.group.position.z -= 2.2;
        scene.add(mineBundle.group);

        spawnDetonationEffect(warmupPosition, { preferLight: true });

        const compileCamera = camera?.isCamera
            ? camera
            : new THREE.PerspectiveCamera(55, 1, 0.1, 200);
        if (!camera?.isCamera) {
            compileCamera.position.set(
                warmupPosition.x + 5.4,
                warmupPosition.y + 3.4,
                warmupPosition.z + 6.2
            );
            compileCamera.lookAt(warmupPosition.x, warmupPosition.y + 0.2, warmupPosition.z);
            compileCamera.updateProjectionMatrix();
        }

        let warmedUp = false;
        try {
            scene.updateMatrixWorld(true);
            compileCamera.updateMatrixWorld(true);
            if (typeof renderer.compile === 'function') {
                renderer.compile(scene, compileCamera);
            }
            renderer.render(scene, compileCamera);
            warmedUp = true;
        } catch {
            warmedUp = false;
        } finally {
            scene.remove(mineBundle.group);
            recycleMineMeshBundle(mineBundle);
            if (detonationEffects.length > 0) {
                removeActiveDetonationEffectAt(detonationEffects.length - 1);
            }
        }

        return warmedUp;
    }

    function getMineMarkers() {
        const now = Date.now();
        let markerCount = 0;
        for (const mine of minesById.values()) {
            if (!mine || mine.expiresAt <= now) {
                continue;
            }
            let marker = mineMarkerBuffer[markerCount];
            if (!marker) {
                marker = {};
                mineMarkerBuffer[markerCount] = marker;
            }
            marker.id = mine.id;
            marker.x = mine.mesh.position.x;
            marker.z = mine.mesh.position.z;
            marker.armed = now >= mine.armedAt && mine.landed;
            marker.ownerId = mine.ownerId;
            markerCount += 1;
        }
        mineMarkerBuffer.length = markerCount;
        return mineMarkerBuffer;
    }

    function countOwnerMines(ownerId) {
        let count = 0;
        for (const mine of minesById.values()) {
            if (mine.ownerId === ownerId) {
                count += 1;
            }
        }
        return count;
    }

    function prewarmMineMeshes() {
        for (let i = 0; i < MINE_MESH_POOL_PREWARM_COUNT; i += 1) {
            mineMeshPool.push(createMineMeshBundle());
        }
    }

    function acquireMineMeshBundle() {
        if (mineMeshPool.length > 0) {
            const bundle = mineMeshPool.pop();
            resetMineMeshBundle(bundle);
            return bundle;
        }
        return createMineMeshBundle();
    }

    function recycleMineMeshBundle(bundle) {
        if (!bundle?.group) {
            return;
        }
        resetMineMeshBundle(bundle);
        if (mineMeshPool.length < MINE_MESH_POOL_MAX) {
            mineMeshPool.push(bundle);
            return;
        }
        disposeMineMeshBundle(bundle);
    }

    function queueDetonationEffectSpawn(position, options = {}, now = Date.now()) {
        if (!position) {
            return;
        }
        const preferLight = Boolean(options?.preferLight);
        const distanceSq = getDistanceSqToCar(position);
        if (!preferLight && distanceSq > MINE_DETONATION_VISUAL_DISTANCE_SQ) {
            return;
        }

        if (now - lastDetonationQueuedAtMs <= DETONATION_BURST_WINDOW_MS) {
            detonationBurstCount = Math.min(16, detonationBurstCount + 1);
        } else {
            detonationBurstCount = 0;
        }
        lastDetonationQueuedAtMs = now;

        const activePendingCount =
            pendingDetonationSpawns.length - pendingDetonationSpawnReadIndex;
        if (activePendingCount >= MAX_PENDING_DETONATION_SPAWNS) {
            const dropped = dropQueuedDetonationEntry({ preferLight, distanceSq });
            if (!dropped) {
                droppedQueuedDetonations += 1;
                return;
            }
        }

        const spawnDelayMs =
            DETONATION_MIN_QUEUE_DELAY_MS +
            (preferLight
                ? 0
                : Math.min(
                      140,
                      detonationBurstCount * DETONATION_BURST_STAGGER_MS +
                          activePendingCount * DETONATION_BACKLOG_STAGGER_MS
                  ));
        pendingDetonationSpawns.push({
            x: position.x,
            y: position.y,
            z: position.z,
            distanceSq,
            preferLight,
            burstIndex: detonationBurstCount,
            queuedAtMs: now,
            dueAtMs: now + spawnDelayMs,
        });
    }

    function dropQueuedDetonationEntry({ preferLight = false, distanceSq = Infinity } = {}) {
        for (
            let index = pendingDetonationSpawnReadIndex;
            index < pendingDetonationSpawns.length;
            index += 1
        ) {
            const entry = pendingDetonationSpawns[index];
            if (!entry || entry.preferLight) {
                continue;
            }
            if (!preferLight && Number(entry.distanceSq) < Number(distanceSq)) {
                continue;
            }
            pendingDetonationSpawns.splice(index, 1);
            return true;
        }
        return false;
    }

    function processPendingDetonationSpawns(dt, now = Date.now()) {
        if (pendingDetonationSpawns.length - pendingDetonationSpawnReadIndex <= 0) {
            return;
        }

        let budget = resolvePendingDetonationSpawnBudget(dt);
        while (pendingDetonationSpawnReadIndex < pendingDetonationSpawns.length) {
            const entry = pendingDetonationSpawns[pendingDetonationSpawnReadIndex];
            if (!entry) {
                pendingDetonationSpawnReadIndex += 1;
                continue;
            }

            const queueDelayMs = Math.max(0, now - entry.queuedAtMs);
            const localPriority = entry.preferLight && queueDelayMs >= 80;
            if (!localPriority && now < entry.dueAtMs) {
                break;
            }
            if (!localPriority && budget <= 0) {
                break;
            }

            if (
                !entry.preferLight &&
                queueDelayMs > DETONATION_MAX_QUEUE_DELAY_MS &&
                Number(entry.distanceSq) > DETONATION_CULL_DISTANCE_SQ
            ) {
                pendingDetonationSpawnReadIndex += 1;
                droppedQueuedDetonations += 1;
                continue;
            }
            const heavyTokenCost = entry.preferLight ? 2 : 1;
            if (!tryConsumeHeavyEventToken(heavyTokenCost)) {
                entry.dueAtMs = Math.max(
                    Number(entry.dueAtMs) || now,
                    now + Math.max(DETONATION_BACKLOG_STAGGER_MS, DETONATION_MIN_QUEUE_DELAY_MS)
                );
                break;
            }
            pendingDetonationSpawnReadIndex += 1;

            queuedDetonationPosition.set(entry.x, entry.y, entry.z);
            spawnDetonationEffect(queuedDetonationPosition, {
                preferLight: entry.preferLight,
                burstIndex: entry.burstIndex,
                queueDelayMs,
            });
            if (!localPriority) {
                budget -= 1;
            }
        }

        if (pendingDetonationSpawnReadIndex >= pendingDetonationSpawns.length) {
            pendingDetonationSpawns.length = 0;
            pendingDetonationSpawnReadIndex = 0;
            return;
        }
        if (pendingDetonationSpawnReadIndex >= 16) {
            pendingDetonationSpawns.splice(0, pendingDetonationSpawnReadIndex);
            pendingDetonationSpawnReadIndex = 0;
        }
    }

    function resolvePendingDetonationSpawnBudget(dt) {
        if (dt > 1 / 32 || detonationEffects.length >= Math.floor(MAX_ACTIVE_DETONATION_EFFECTS * 0.9)) {
            return DETONATION_SPAWN_BUDGET_SEVERE_LOAD;
        }
        if (dt > 1 / 44 || detonationEffects.length >= Math.floor(MAX_ACTIVE_DETONATION_EFFECTS * 0.72)) {
            return DETONATION_SPAWN_BUDGET_UNDER_LOAD;
        }
        return DETONATION_SPAWN_BUDGET_PER_FRAME;
    }

    function resetMineMeshBundle(bundle) {
        bundle.group.visible = true;
        bundle.group.position.set(0, -1000, 0);
        bundle.group.rotation.set(0, 0, 0);
        bundle.group.scale.set(1, 1, 1);
        if (bundle.ledMaterial) {
            bundle.ledMaterial.color.setHex(0x8fa7c8);
            bundle.ledMaterial.emissiveIntensity = 0.42;
        }
    }

    function disposeMineMeshBundle(bundle) {
        if (!bundle?.group) {
            return;
        }
        disposeObject3d(bundle.group);
    }

    function spawnDetonationEffect(position, { preferLight = false, burstIndex = 0, queueDelayMs = 0 } = {}) {
        const deltaX = position.x - car.position.x;
        const deltaZ = position.z - car.position.z;
        const distanceSq = deltaX * deltaX + deltaZ * deltaZ;
        if (!preferLight && distanceSq > MINE_DETONATION_VISUAL_DISTANCE_SQ) {
            return;
        }
        const burstLevel = Math.max(0, Math.floor(Number(burstIndex) || 0));
        const detailSuppressed = burstLevel >= 2 && !preferLight;
        const fullDetail =
            (Boolean(preferLight) || distanceSq <= MINE_DETONATION_FULL_DETAIL_DISTANCE_SQ) &&
            !detailSuppressed;
        const lifeScale = burstLevel >= 4 ? 0.72 : burstLevel >= 2 ? 0.84 : 1;
        const opacityScale = queueDelayMs >= 240 ? 0.86 : 1;

        if (detonationEffects.length >= MAX_ACTIVE_DETONATION_EFFECTS) {
            removeActiveDetonationEffectAt(0);
        }
        const effect = acquireDetonationEffect();
        if (!effect) {
            return;
        }
        ensureDetonationEffectVisualsAttached(effect);
        const maxLightSlots =
            burstLevel >= 4
                ? Math.max(1, MAX_ACTIVE_DETONATION_LIGHTS - 3)
                : burstLevel >= 2
                  ? Math.max(2, MAX_ACTIVE_DETONATION_LIGHTS - 2)
                  : MAX_ACTIVE_DETONATION_LIGHTS;
        const allowBurstLight = preferLight || burstLevel <= 1;
        const shouldSpawnLight =
            MINE_DETONATION_ENABLE_POINT_LIGHTS &&
            allowBurstLight &&
            (Boolean(preferLight) || distanceSq <= MINE_DETONATION_LIGHT_NEAR_DISTANCE_SQ) &&
            activeDetonationLightCount < maxLightSlots;
        const lightLife = MINE_DETONATION_LIGHT_LIFE * (burstLevel >= 3 ? 0.76 : 1);
        const ringLife = MINE_DETONATION_RING_LIFE * lifeScale;

        effect.light.position.copy(position);
        effect.light.position.y += 0.42;
        effect.light.userData.maxLife = lightLife;
        effect.light.userData.life = shouldSpawnLight ? lightLife : 0;
        effect.light.intensity = shouldSpawnLight ? MINE_DETONATION_LIGHT_INTENSITY : 0;
        effect.light.distance = shouldSpawnLight ? MINE_DETONATION_LIGHT_DISTANCE : 0;
        effect.light.userData.active = shouldSpawnLight;
        effect.light.visible = shouldSpawnLight;
        if (shouldSpawnLight) {
            scene.add(effect.light);
            activeDetonationLightCount += 1;
        }

        effect.shockwave.position.copy(position);
        effect.shockwave.position.y += 0.05;
        effect.shockwave.rotation.z = Math.random() * Math.PI * 2;
        effect.shockwave.scale.setScalar(MINE_DETONATION_SHOCKWAVE_BASE_SCALE);
        effect.shockwave.userData.life = ringLife;
        effect.shockwave.userData.maxLife = ringLife;
        effect.shockwave.material.opacity = MINE_DETONATION_SHOCKWAVE_BASE_OPACITY * opacityScale;
        effect.shockwave.material.color.copy(MINE_DETONATION_HOT_COLOR);
        effect.shockwave.visible = true;

        effect.coreSprite.position.copy(position);
        effect.coreSprite.position.y += 0.28;
        effect.coreSprite.scale.setScalar(MINE_DETONATION_CORE_BASE_SCALE);
        effect.coreSprite.material.rotation = Math.random() * Math.PI * 2;
        effect.coreSprite.userData.life = fullDetail ? ringLife : 0;
        effect.coreSprite.userData.maxLife = ringLife;
        effect.coreSprite.material.opacity = fullDetail
            ? MINE_DETONATION_CORE_BASE_OPACITY * opacityScale
            : 0;
        effect.coreSprite.material.color.copy(MINE_DETONATION_HOT_COLOR);
        effect.coreSprite.visible = fullDetail;

        effect.haloSprite.position.copy(position);
        effect.haloSprite.position.y += 0.16;
        effect.haloSprite.scale.setScalar(MINE_DETONATION_HALO_BASE_SCALE);
        effect.haloSprite.material.rotation = Math.random() * Math.PI * 2;
        effect.haloSprite.userData.life = fullDetail ? ringLife : 0;
        effect.haloSprite.userData.maxLife = ringLife;
        effect.haloSprite.material.opacity = fullDetail
            ? MINE_DETONATION_HALO_BASE_OPACITY * opacityScale
            : 0;
        effect.haloSprite.material.color.copy(MINE_DETONATION_WARM_COLOR);
        effect.haloSprite.visible = fullDetail;

        detonationEffects.push(effect);
    }

    function updateDetonationEffects(dt) {
        for (let index = detonationEffects.length - 1; index >= 0; index -= 1) {
            const effect = detonationEffects[index];

            effect.light.userData.life -= dt;
            effect.shockwave.userData.life -= dt;
            effect.coreSprite.userData.life -= dt;
            effect.haloSprite.userData.life -= dt;

            const lightLifeNorm = THREE.MathUtils.clamp(
                effect.light.userData.life / effect.light.userData.maxLife,
                0,
                1
            );
            const shockwaveLifeNorm = THREE.MathUtils.clamp(
                effect.shockwave.userData.life / effect.shockwave.userData.maxLife,
                0,
                1
            );
            const coreLifeNorm = THREE.MathUtils.clamp(
                effect.coreSprite.userData.life / effect.coreSprite.userData.maxLife,
                0,
                1
            );
            const haloLifeNorm = THREE.MathUtils.clamp(
                effect.haloSprite.userData.life / effect.haloSprite.userData.maxLife,
                0,
                1
            );
            const progress = 1 - shockwaveLifeNorm;
            const easeOutQuad = 1 - Math.pow(1 - progress, 2);
            const easeOutCubic = 1 - Math.pow(1 - progress, 3);
            const flashPulse = Math.exp(-progress * 5.4);
            const emberTail = Math.pow(Math.max(0, 1 - progress), 1.3);

            effect.light.intensity =
                MINE_DETONATION_LIGHT_INTENSITY *
                (0.2 + flashPulse * 0.8) *
                Math.pow(lightLifeNorm, 1.22);
            effect.light.distance = MINE_DETONATION_LIGHT_DISTANCE * (0.52 + flashPulse * 0.48);

            effect.shockwave.material.opacity =
                MINE_DETONATION_SHOCKWAVE_BASE_OPACITY * Math.pow(shockwaveLifeNorm, 1.34);
            effect.shockwave.material.color
                .copy(MINE_DETONATION_COOL_COLOR)
                .lerp(MINE_DETONATION_HOT_COLOR, shockwaveLifeNorm);
            effect.shockwave.scale.setScalar(
                MINE_DETONATION_SHOCKWAVE_BASE_SCALE + easeOutCubic * 8.8
            );

            effect.coreSprite.material.opacity =
                MINE_DETONATION_CORE_BASE_OPACITY * Math.pow(coreLifeNorm, 1.18) * flashPulse;
            effect.coreSprite.material.color
                .copy(MINE_DETONATION_WARM_COLOR)
                .lerp(MINE_DETONATION_HOT_COLOR, coreLifeNorm);
            effect.coreSprite.scale.setScalar(MINE_DETONATION_CORE_BASE_SCALE + easeOutQuad * 4.6);
            effect.coreSprite.material.rotation += dt * 2.8;

            effect.haloSprite.material.opacity =
                MINE_DETONATION_HALO_BASE_OPACITY *
                Math.pow(haloLifeNorm, 1.85) *
                (0.35 + emberTail * 0.65);
            effect.haloSprite.material.color
                .copy(MINE_DETONATION_COOL_COLOR)
                .lerp(MINE_DETONATION_WARM_COLOR, Math.pow(haloLifeNorm, 0.72));
            effect.haloSprite.scale.setScalar(
                MINE_DETONATION_HALO_BASE_SCALE + easeOutCubic * 10.4
            );
            effect.haloSprite.material.rotation -= dt * 0.9;

            if (
                effect.light.userData.life > 0 ||
                effect.shockwave.userData.life > 0 ||
                effect.coreSprite.userData.life > 0 ||
                effect.haloSprite.userData.life > 0
            ) {
                continue;
            }

            removeActiveDetonationEffectAt(index);
        }
    }

    function prewarmDetonationEffects() {
        const targetCount = THREE.MathUtils.clamp(
            DETONATION_EFFECT_POOL_PREWARM_COUNT,
            0,
            MAX_POOLED_DETONATION_EFFECTS
        );
        for (let i = detonationEffectPool.length; i < targetCount; i += 1) {
            const effect = createDetonationEffectBundle();
            ensureDetonationEffectVisualsAttached(effect);
            detonationEffectPool.push(effect);
        }
    }

    function removeActiveDetonationEffectAt(index) {
        const effect = detonationEffects[index];
        if (!effect) {
            return;
        }

        if (effect.light.userData.active) {
            scene.remove(effect.light);
            effect.light.userData.active = false;
            activeDetonationLightCount = Math.max(0, activeDetonationLightCount - 1);
        }
        recycleDetonationEffect(effect);

        const lastIndex = detonationEffects.length - 1;
        if (index !== lastIndex) {
            detonationEffects[index] = detonationEffects[lastIndex];
        }
        detonationEffects.pop();
    }

    function acquireDetonationEffect() {
        if (detonationEffectPool.length > 0) {
            return detonationEffectPool.pop();
        }
        return null;
    }

    function createDetonationEffectBundle() {
        const light = new THREE.PointLight(0xffab6c, MINE_DETONATION_LIGHT_INTENSITY, 48, 2);
        light.visible = false;
        light.userData.active = false;
        const shockwaveMaterial = new THREE.MeshBasicMaterial({
            color: 0xff9560,
            map: detonationShockwaveTexture,
            transparent: true,
            opacity: MINE_DETONATION_SHOCKWAVE_BASE_OPACITY,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const shockwave = new THREE.Mesh(detonationShockwaveGeometry, shockwaveMaterial);
        shockwave.rotation.x = -Math.PI / 2;
        shockwave.visible = false;
        const coreMaterial = new THREE.SpriteMaterial({
            map: detonationCoreTexture,
            color: MINE_DETONATION_HOT_COLOR,
            transparent: true,
            opacity: MINE_DETONATION_CORE_BASE_OPACITY,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
            depthWrite: false,
        });
        const coreSprite = new THREE.Sprite(coreMaterial);
        coreSprite.visible = false;
        const haloMaterial = new THREE.SpriteMaterial({
            map: detonationHaloTexture,
            color: MINE_DETONATION_WARM_COLOR,
            transparent: true,
            opacity: MINE_DETONATION_HALO_BASE_OPACITY,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
            depthWrite: false,
        });
        const haloSprite = new THREE.Sprite(haloMaterial);
        haloSprite.visible = false;
        return { light, shockwave, coreSprite, haloSprite, visualsAttached: false };
    }

    function recycleDetonationEffect(effect) {
        if (!effect) {
            return;
        }
        if (effect.light.parent) {
            effect.light.parent.remove(effect.light);
        }
        effect.light.userData.life = 0;
        effect.light.userData.maxLife = MINE_DETONATION_LIGHT_LIFE;
        effect.light.userData.active = false;
        effect.light.visible = false;
        effect.light.intensity = 0;
        effect.light.position.set(0, -1000, 0);
        effect.light.distance = 0;
        effect.shockwave.userData.life = 0;
        effect.shockwave.userData.maxLife = MINE_DETONATION_RING_LIFE;
        effect.shockwave.visible = false;
        effect.shockwave.material.opacity = 0;
        effect.shockwave.scale.setScalar(0.0001);
        effect.shockwave.position.set(0, -1000, 0);
        effect.coreSprite.userData.life = 0;
        effect.coreSprite.userData.maxLife = MINE_DETONATION_RING_LIFE;
        effect.coreSprite.visible = false;
        effect.coreSprite.material.opacity = 0;
        effect.coreSprite.scale.setScalar(0.0001);
        effect.coreSprite.position.set(0, -1000, 0);
        effect.haloSprite.userData.life = 0;
        effect.haloSprite.userData.maxLife = MINE_DETONATION_RING_LIFE;
        effect.haloSprite.visible = false;
        effect.haloSprite.material.opacity = 0;
        effect.haloSprite.scale.setScalar(0.0001);
        effect.haloSprite.position.set(0, -1000, 0);

        if (detonationEffectPool.length < MAX_POOLED_DETONATION_EFFECTS) {
            detonationEffectPool.push(effect);
        } else {
            detachDetonationEffectVisuals(effect);
            effect.shockwave.material.dispose();
            effect.coreSprite.material.dispose();
            effect.haloSprite.material.dispose();
        }
    }

    function ensureDetonationEffectVisualsAttached(effect) {
        if (!effect || effect.visualsAttached) {
            return;
        }
        scene.add(effect.shockwave);
        scene.add(effect.coreSprite);
        scene.add(effect.haloSprite);
        effect.visualsAttached = true;
    }

    function detachDetonationEffectVisuals(effect) {
        if (!effect) {
            return;
        }
        if (effect.light?.parent) {
            effect.light.parent.remove(effect.light);
        }
        if (effect.shockwave?.parent) {
            effect.shockwave.parent.remove(effect.shockwave);
        }
        if (effect.coreSprite?.parent) {
            effect.coreSprite.parent.remove(effect.coreSprite);
        }
        if (effect.haloSprite?.parent) {
            effect.haloSprite.parent.remove(effect.haloSprite);
        }
        effect.visualsAttached = false;
    }

    function pruneRecentDetonations(now) {
        for (const [mineId, detonatedAt] of recentDetonations.entries()) {
            if (now - detonatedAt > RECENT_DETONATION_RETENTION_MS) {
                recentDetonations.delete(mineId);
            }
        }
    }

    function getDistanceSqToCar(position) {
        const dx = Number(position?.x) - car.position.x;
        const dz = Number(position?.z) - car.position.z;
        if (!Number.isFinite(dx) || !Number.isFinite(dz)) {
            return Number.POSITIVE_INFINITY;
        }
        return dx * dx + dz * dz;
    }
}

function createDetonationCoreTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const center = canvas.width * 0.5;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const coreGradient = ctx.createRadialGradient(center, center, 0, center, center, 120);
    coreGradient.addColorStop(0, 'rgba(255, 250, 220, 1)');
    coreGradient.addColorStop(0.22, 'rgba(255, 218, 148, 0.95)');
    coreGradient.addColorStop(0.52, 'rgba(255, 142, 79, 0.62)');
    coreGradient.addColorStop(1, 'rgba(255, 92, 52, 0)');
    ctx.fillStyle = coreGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(center, center);
    for (let i = 0; i < 12; i += 1) {
        ctx.rotate((Math.PI * 2) / 12);
        const beam = ctx.createLinearGradient(0, -5, 92, 5);
        beam.addColorStop(0, 'rgba(255, 255, 230, 0.42)');
        beam.addColorStop(0.7, 'rgba(255, 176, 108, 0.12)');
        beam.addColorStop(1, 'rgba(255, 176, 108, 0)');
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(96, -2);
        ctx.lineTo(96, 2);
        ctx.lineTo(0, 5);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

function createDetonationShockwaveTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const center = canvas.width * 0.5;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const ringGradient = ctx.createRadialGradient(center, center, 0, center, center, 126);
    ringGradient.addColorStop(0, 'rgba(255, 220, 170, 0)');
    ringGradient.addColorStop(0.34, 'rgba(255, 220, 170, 0)');
    ringGradient.addColorStop(0.48, 'rgba(255, 194, 140, 0.34)');
    ringGradient.addColorStop(0.56, 'rgba(255, 176, 118, 0.72)');
    ringGradient.addColorStop(0.66, 'rgba(255, 148, 96, 0.28)');
    ringGradient.addColorStop(0.78, 'rgba(255, 124, 84, 0.08)');
    ringGradient.addColorStop(1, 'rgba(255, 100, 72, 0)');
    ctx.fillStyle = ringGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const haloGradient = ctx.createRadialGradient(center, center, 42, center, center, 126);
    haloGradient.addColorStop(0, 'rgba(255, 150, 95, 0)');
    haloGradient.addColorStop(0.58, 'rgba(255, 150, 95, 0.08)');
    haloGradient.addColorStop(1, 'rgba(255, 150, 95, 0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = haloGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

function createDetonationHaloTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const center = canvas.width * 0.5;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const haloGradient = ctx.createRadialGradient(center, center, 38, center, center, 126);
    haloGradient.addColorStop(0, 'rgba(255, 170, 112, 0)');
    haloGradient.addColorStop(0.34, 'rgba(255, 170, 112, 0.26)');
    haloGradient.addColorStop(0.68, 'rgba(255, 102, 66, 0.18)');
    haloGradient.addColorStop(1, 'rgba(255, 72, 50, 0)');
    ctx.fillStyle = haloGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i += 1) {
        const angle = (i / 18) * Math.PI * 2;
        const px = center + Math.cos(angle) * 88;
        const py = center + Math.sin(angle) * 88;
        const dot = ctx.createRadialGradient(px, py, 0, px, py, 18);
        dot.addColorStop(0, 'rgba(255, 196, 138, 0.22)');
        dot.addColorStop(1, 'rgba(255, 196, 138, 0)');
        ctx.fillStyle = dot;
        ctx.beginPath();
        ctx.arc(px, py, 18, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

function createMineMeshBundle() {
    const group = new THREE.Group();
    group.name = 'landmine';

    const baseMaterial = new THREE.MeshStandardMaterial({
        color: 0x263242,
        roughness: 0.86,
        metalness: 0.22,
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.48, 0.11, 20), baseMaterial);
    group.add(base);

    const topMaterial = new THREE.MeshStandardMaterial({
        color: 0x3f5068,
        roughness: 0.64,
        metalness: 0.34,
    });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.065, 16), topMaterial);
    top.position.y = 0.082;
    group.add(top);

    const ledMaterial = new THREE.MeshStandardMaterial({
        color: 0x8fa7c8,
        emissive: 0xff7a72,
        emissiveIntensity: 0.42,
        roughness: 0.3,
        metalness: 0.1,
    });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), ledMaterial);
    led.position.y = 0.13;
    group.add(led);

    for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2;
        const pin = new THREE.Mesh(
            new THREE.CylinderGeometry(0.018, 0.018, 0.08, 6),
            new THREE.MeshStandardMaterial({
                color: 0x5f7188,
                roughness: 0.54,
                metalness: 0.58,
            })
        );
        pin.position.set(Math.cos(angle) * 0.3, 0.12, Math.sin(angle) * 0.3);
        group.add(pin);
    }

    return {
        group,
        ledMaterial,
    };
}

function sanitizeMineSnapshot(snapshot, options = {}) {
    if (!snapshot || typeof snapshot !== 'object') {
        return null;
    }

    const fallbackTime = Number.isFinite(options.timeFallback) ? options.timeFallback : Date.now();
    const mineId = sanitizeMineId(snapshot.mineId);
    const ownerId = sanitizePlayerId(snapshot.ownerId || options.ownerIdFallback);
    if (!mineId || !ownerId) {
        return null;
    }

    const createdAt = clampFinite(snapshot.createdAt, 0, Number.MAX_SAFE_INTEGER, fallbackTime);
    const armDelayMs = clampFinite(snapshot.armDelayMs, 0, 4000, MINE_ARM_DELAY_MS);
    const ttlMs = clampFinite(snapshot.ttlMs, 4000, 120000, MINE_TTL_MS);
    const armedAt = clampFinite(
        snapshot.armedAt,
        0,
        Number.MAX_SAFE_INTEGER,
        createdAt + armDelayMs
    );
    const expiresAt = clampFinite(
        snapshot.expiresAt,
        0,
        Number.MAX_SAFE_INTEGER,
        createdAt + ttlMs
    );

    return {
        mineId,
        ownerId,
        ownerName: sanitizeOwnerName(snapshot.ownerName || options.ownerNameFallback),
        x: clampFinite(snapshot.x, -5000, 5000, 0),
        y: clampFinite(snapshot.y, -400, 2500, 0),
        z: clampFinite(snapshot.z, -5000, 5000, 0),
        velocityX: clampFinite(snapshot.velocityX, -140, 140, 0),
        velocityY: clampFinite(snapshot.velocityY, -140, 140, 0),
        velocityZ: clampFinite(snapshot.velocityZ, -140, 140, 0),
        triggerRadius: clampFinite(snapshot.triggerRadius, 0.8, 4, MINE_TRIGGER_RADIUS),
        armDelayMs,
        ttlMs,
        thrown: Boolean(snapshot.thrown),
        createdAt,
        armedAt,
        expiresAt,
    };
}

function sanitizeMineId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .trim()
        .replace(/[^\w\-]/g, '')
        .slice(0, 72);
}

function sanitizePlayerId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .trim()
        .replace(/[^\w\-]/g, '')
        .slice(0, 128);
}

function sanitizeOwnerName(value) {
    if (typeof value !== 'string') {
        return 'Driver';
    }
    const normalized = value
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
        .slice(0, 28);
    return normalized || 'Driver';
}

function resolveCollisionRadius(value, fallback = DEFAULT_TARGET_COLLISION_RADIUS) {
    return clampFinite(value, 0.2, 4, fallback);
}

function createMovementSnapshot({
    position,
    entityKey,
    now,
    allowSweep = true,
    collisionRadius = DEFAULT_TARGET_COLLISION_RADIUS,
    previousPositionByEntityKey = new Map(),
} = {}) {
    if (!entityKey || !position || typeof position !== 'object') {
        return null;
    }

    const toX = Number(position.x);
    const toZ = Number(position.z);
    if (!Number.isFinite(toX) || !Number.isFinite(toZ)) {
        return null;
    }

    let fromX = toX;
    let fromZ = toZ;
    if (allowSweep) {
        const previous = previousPositionByEntityKey.get(entityKey);
        if (
            previous &&
            Number.isFinite(previous.x) &&
            Number.isFinite(previous.z) &&
            Number.isFinite(previous.updatedAt) &&
            now - previous.updatedAt <= POSITION_HISTORY_MAX_AGE_MS
        ) {
            fromX = previous.x;
            fromZ = previous.z;
        }
    }

    return {
        entityKey,
        fromX,
        fromZ,
        toX,
        toZ,
        collisionRadius: resolveCollisionRadius(collisionRadius),
    };
}

function storeMovementSnapshot(previousPositionByEntityKey, movementSnapshot, now) {
    if (!(previousPositionByEntityKey instanceof Map) || !movementSnapshot?.entityKey) {
        return;
    }
    previousPositionByEntityKey.set(movementSnapshot.entityKey, {
        x: movementSnapshot.toX,
        z: movementSnapshot.toZ,
        updatedAt: now,
    });
}

function pruneMovementHistory(previousPositionByEntityKey, activeEntityKeys, now) {
    if (!(previousPositionByEntityKey instanceof Map)) {
        return;
    }
    for (const [entityKey, snapshot] of previousPositionByEntityKey.entries()) {
        const isActive = activeEntityKeys instanceof Set && activeEntityKeys.has(entityKey);
        if (isActive) {
            continue;
        }
        const updatedAt = Number(snapshot?.updatedAt);
        if (!Number.isFinite(updatedAt) || now - updatedAt > POSITION_HISTORY_RETENTION_MS) {
            previousPositionByEntityKey.delete(entityKey);
        }
    }
}

function movementIntersectsMineRadius({
    movement,
    minePosition,
    triggerRadius = MINE_TRIGGER_RADIUS,
    targetCollisionRadius = null,
} = {}) {
    if (!movement || !minePosition || typeof minePosition !== 'object') {
        return false;
    }
    const centerX = Number(minePosition.x);
    const centerZ = Number(minePosition.z);
    if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) {
        return false;
    }

    const resolvedTargetCollisionRadius = resolveCollisionRadius(
        targetCollisionRadius,
        movement.collisionRadius
    );
    const combinedRadius = Math.max(
        0.1,
        clampFinite(triggerRadius, 0.1, 10, MINE_TRIGGER_RADIUS) + resolvedTargetCollisionRadius
    );
    return segmentIntersectsCircleXZ({
        startX: movement.fromX,
        startZ: movement.fromZ,
        endX: movement.toX,
        endZ: movement.toZ,
        centerX,
        centerZ,
        radius: combinedRadius,
    });
}

function segmentIntersectsCircleXZ({
    startX = 0,
    startZ = 0,
    endX = 0,
    endZ = 0,
    centerX = 0,
    centerZ = 0,
    radius = 0,
} = {}) {
    if (!Number.isFinite(radius) || radius <= 0) {
        return false;
    }
    if (
        !Number.isFinite(startX) ||
        !Number.isFinite(startZ) ||
        !Number.isFinite(endX) ||
        !Number.isFinite(endZ) ||
        !Number.isFinite(centerX) ||
        !Number.isFinite(centerZ)
    ) {
        return false;
    }

    const radiusSq = radius * radius;
    const endDx = endX - centerX;
    const endDz = endZ - centerZ;
    if (endDx * endDx + endDz * endDz <= radiusSq) {
        return true;
    }

    const startDx = startX - centerX;
    const startDz = startZ - centerZ;
    if (startDx * startDx + startDz * startDz <= radiusSq) {
        return true;
    }

    const segX = endX - startX;
    const segZ = endZ - startZ;
    const segLenSq = segX * segX + segZ * segZ;
    if (segLenSq <= 1e-8) {
        return false;
    }

    const toCenterX = centerX - startX;
    const toCenterZ = centerZ - startZ;
    const projection = (toCenterX * segX + toCenterZ * segZ) / segLenSq;
    const clampedT = Math.max(0, Math.min(1, projection));
    const closestX = startX + segX * clampedT;
    const closestZ = startZ + segZ * clampedT;
    const closestDx = closestX - centerX;
    const closestDz = closestZ - centerZ;
    return closestDx * closestDx + closestDz * closestDz <= radiusSq;
}

function clampFinite(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
}

function disposeObject3d(object) {
    object.traverse((node) => {
        if (node.geometry && typeof node.geometry.dispose === 'function') {
            node.geometry.dispose();
        }
        if (node.material) {
            if (Array.isArray(node.material)) {
                node.material.forEach((entry) => entry?.dispose?.());
            } else if (typeof node.material.dispose === 'function') {
                node.material.dispose();
            }
        }
    });
}

function createNoopMineSystemController() {
    return {
        deployMine() {
            return {
                ok: false,
                message: 'Landmines are unavailable in this context.',
            };
        },
        deployMineForOwner() {
            return {
                ok: false,
                message: 'Landmines are unavailable in this context.',
            };
        },
        update() {},
        getMineMarkers() {
            return [];
        },
        applyRoomMineSnapshot() {},
        handleRemoteMinePlaced() {},
        handleRemoteMineDetonated() {},
        getPerformanceSnapshot() {
            return {
                pendingDetonationSpawns: 0,
                activeDetonationEffects: 0,
                activeDetonationLights: 0,
                detonationBurstCount: 0,
                droppedDetonationEffects: 0,
            };
        },
        clearAll() {},
        warmupGraphics() {
            return false;
        },
    };
}
