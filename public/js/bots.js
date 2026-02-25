import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { createCarRig } from './car.js';

const DEFAULT_BOT_COUNT = 3;
const BOT_RADIUS = 1.12;
const BOT_VEHICLE_COLLISION_RADIUS = 1.34;
const PLAYER_VEHICLE_COLLISION_RADIUS = 1.34;
const BOT_COLLISION_HALF_WIDTH = 1.45;
const BOT_COLLISION_HALF_LENGTH = 2.3;
const BOT_WHEEL_BASE = 2.6;
const BOT_MAX_STEER = THREE.MathUtils.degToRad(24);
const BOT_STEER_RESPONSE = 3.4;
const BOT_MAX_SPEED = 30;
const BOT_MIN_SPEED = 9;
const BOT_ACCELERATION = 19;
const BOT_BRAKE_DECELERATION = 24;
const BOT_DRAG = 0.1;
const BOT_MASS = 1.25;
const BOT_COLLISION_POSITION_SHARE = 0.66;
const BOT_COLLISION_SPEED_DAMPING = 0.82;
const BOT_DAMAGE_COLLISION_MIN = 8;
const BOT_DAMAGE_COLLISION_HIGH = 21;
const BOT_WHEEL_DETACH_SPEED = 28;
const BOT_SECOND_WHEEL_DETACH_SPEED = 36;
const BOT_DAMAGE_OBSTACLE_CATEGORIES = new Set(['lamp_post']);
const BOT_DENT_MAX = 1.6;
const BOT_TOTAL_BREAK_SCORE = 5.6;
const BOT_TARGET_HEADING_FULL_STEER = THREE.MathUtils.degToRad(44);
const BOT_WANDER_REACH_RADIUS = 16;
const BOT_AVOIDANCE_RADIUS = 8;
const BOT_SPAWN_CLEARANCE = 12;
const OBSTACLE_PASSES = 2;
const BOT_INDICATOR_HEIGHT = 1.52;
const BOT_INDICATOR_BOB_AMPLITUDE = 0.1;
const BOT_INDICATOR_BOB_SPEED = 1.9;
const BOT_INDICATOR_PULSE_SPEED = 4.2;
const BOT_RIDE_HEIGHT = 0.06;
const BOT_DRIFT_MIN_SPEED = 12.5;
const BOT_DRIFT_ENTRY_HEADING = THREE.MathUtils.degToRad(18);
const BOT_DRIFT_EXIT_HEADING = THREE.MathUtils.degToRad(10);
const BOT_DRIFT_CHANCE_PER_SECOND = 0.34;
const BOT_DRIFT_DURATION_MIN = 0.65;
const BOT_DRIFT_DURATION_MAX = 1.35;
const BOT_DRIFT_COOLDOWN_MIN = 2.4;
const BOT_DRIFT_COOLDOWN_MAX = 5.2;
const BOT_DRIFT_STEER_BIAS = 0.42;
const BOT_DRIFT_YAW_BOOST = 1.45;
const BOT_DRIFT_LATERAL_SLIP = 5.2;
const BOT_DRIFT_SPEED_SCALE = 0.8;
const BOT_BUILDING_AVOID_RADIUS = 9.5;
const BOT_BUILDING_AVOID_FORCE = 2.4;
const BOT_LOS_BUILDING_PADDING = 1.2;
const BOT_ROAD_ON_MARGIN = 1.4;
const BOT_ROAD_TARGET_MARGIN = 2.4;
const BOT_ROAD_TARGET_REACH = 6;
const BOT_DETOUR_CLEARANCE = BOT_RADIUS + 3.2;
const BOT_DETOUR_REACH_RADIUS = 6;
const BOT_AVOIDANCE_BLEND = 1.08;
const BOT_REACTIVE_NAVIGATION_ONLY = true;
const BOT_NAV_CELL_SIZE = 4;
const BOT_OBSTACLE_QUERY_RADIUS = BOT_BUILDING_AVOID_RADIUS + 6;
const BOT_OBSTACLE_GRID_CELL_SIZE = 12;
const BOT_NAV_OBSTACLE_PADDING = BOT_RADIUS + 0.96;
const BOT_NAV_MAX_EXPANSIONS = 2600;
const BOT_PATH_REPLAN_COOLDOWN = 0.55;
const BOT_NAV_PATH_CACHE_LIMIT = 320;
const BOT_NAV_MAX_BUILDS_PER_FRAME = 1;
const BOT_SIM_NEAR_DISTANCE = 38;
const BOT_SIM_MID_DISTANCE = 82;
const BOT_SIM_NEAR_STEP = 1 / 60;
const BOT_SIM_MID_STEP = 1 / 30;
const BOT_SIM_FAR_STEP = 1 / 18;
const BOT_SIM_MAX_STEPS_PER_FRAME = 3;
const BOT_STUCK_MIN_SPEED = 1.1;
const BOT_STUCK_PROGRESS_EPSILON = 2.2;
const BOT_STUCK_REPLAN_TIME = 1.25;
const BOT_STUCK_RECOVERY_TIME = 0.45;
const BOT_STUCK_RECOVERY_STEER = 0.68;
const BOT_DEBRIS_GRAVITY = 24;
const BOT_DEBRIS_DRAG = 1.7;
const BOT_DEBRIS_BOUNCE = 0.3;
const BOT_DEBRIS_GROUND_OFFSET = 0.04;
const BOT_DEBRIS_MAX_PIECES = 240;
const BOT_DEBRIS_DESPAWN_DISTANCE = 120;
const BOT_DEBRIS_DESPAWN_DISTANCE_SQ = BOT_DEBRIS_DESPAWN_DISTANCE * BOT_DEBRIS_DESPAWN_DISTANCE;
const BOT_DEBRIS_POOL_PER_PART = 4;
const BOT_DEBRIS_RENDER_DISTANCE = 90;
const BOT_DEBRIS_RENDER_DISTANCE_SQ = BOT_DEBRIS_RENDER_DISTANCE * BOT_DEBRIS_RENDER_DISTANCE;
const BOT_DEBRIS_ALWAYS_VISIBLE_DISTANCE = 28;
const BOT_DEBRIS_ALWAYS_VISIBLE_DISTANCE_SQ =
    BOT_DEBRIS_ALWAYS_VISIBLE_DISTANCE * BOT_DEBRIS_ALWAYS_VISIBLE_DISTANCE;
const BOT_DEBRIS_MAX_VISIBLE = 6;
const BOT_DEBRIS_MAX_VISIBLE_UNDER_LOAD = 4;
const BOT_DEBRIS_MAX_VISIBLE_SEVERE_LOAD = 3;
const BOT_DEBRIS_TARGET_ACTIVE_COUNT = 10;
const BOT_DEBRIS_BURST_BUDGET_ACTIVE_HIGH = 4;
const BOT_DEBRIS_BURST_BUDGET_ACTIVE_SEVERE = 2;
const BOT_DEBRIS_MAX_LIFETIME_SEC = 17;
const BOT_DEBRIS_MAX_LIFETIME_JITTER_SEC = 6;
const BOT_MINE_EXPLOSION_DEBRIS_BUDGET = 6;
const BOT_MINE_DEBRIS_SPAWN_PER_FRAME = 3;
const BOT_MINE_DEBRIS_SPAWN_PER_FRAME_UNDER_LOAD = 1;
const BOT_MINE_DEBRIS_SPAWN_PER_FRAME_SEVERE_LOAD = 0;
const BOT_MAX_PENDING_MINE_DEBRIS_PARTS = 64;
const BOT_PENDING_MINE_DEBRIS_MAX_AGE_MS = 850;
const BOT_PENDING_MINE_DEBRIS_CULL_DISTANCE = 92;
const BOT_PENDING_MINE_DEBRIS_CULL_DISTANCE_SQ =
    BOT_PENDING_MINE_DEBRIS_CULL_DISTANCE * BOT_PENDING_MINE_DEBRIS_CULL_DISTANCE;
const BOT_LIVES_PER_ROUND = 2;
const BOT_RESPAWN_DELAY_MIN_MS = 3000;
const BOT_RESPAWN_DELAY_MAX_MS = 4000;
const BOT_RESPAWN_PROTECTION_MS = 1000;

const BOT_BODY_COLORS = [0x6cb3ff, 0xff8f7d, 0x9cf89c, 0xe9a3ff, 0xffd86b];
const BOT_NAMES = ['NOVA-1', 'AXIS-2', 'RIFT-3', 'PULSE-4', 'ORBIT-5'];

const forward2 = new THREE.Vector2();
const right2 = new THREE.Vector2();
const targetDir2 = new THREE.Vector2();
const avoidance2 = new THREE.Vector2();
const scratch2 = new THREE.Vector2();
const botDebrisForwardScratch = new THREE.Vector3();
const botDebrisRightScratch = new THREE.Vector3();
const botDebrisTravelScratch = new THREE.Vector3();
const botDebrisVelocityScratch = new THREE.Vector3();
const navSqrt2 = Math.sqrt(2);
const NAV_NEIGHBOR_OFFSETS = [
    { x: -1, z: 0, cost: 1 },
    { x: 1, z: 0, cost: 1 },
    { x: 0, z: -1, cost: 1 },
    { x: 0, z: 1, cost: 1 },
    { x: -1, z: -1, cost: navSqrt2 },
    { x: -1, z: 1, cost: navSqrt2 },
    { x: 1, z: -1, cost: navSqrt2 },
    { x: 1, z: 1, cost: navSqrt2 },
];
const EMPTY_ARRAY = Object.freeze([]);

export function createBotTrafficSystem(scene, worldBounds, staticObstacles = [], options = {}) {
    const {
        botCount = DEFAULT_BOT_COUNT,
        sharedTargetColorHex = 0x7cf9ff,
        getGroundHeightAt = null,
        cityMapLayout = null,
        onPartDetached = null,
        onBotRespawn = null,
        onBotDestroyed = null,
    } = options;
    const handlePartDetached = typeof onPartDetached === 'function' ? onPartDetached : null;
    const handleBotRespawn = typeof onBotRespawn === 'function' ? onBotRespawn : null;
    const handleBotDestroyed = typeof onBotDestroyed === 'function' ? onBotDestroyed : null;
    const navigationPlanner = BOT_REACTIVE_NAVIGATION_ONLY
        ? null
        : createNavigationPlanner(worldBounds, staticObstacles);
    const obstacleQueryGrid = buildObstacleGrid(
        staticObstacles,
        BOT_OBSTACLE_GRID_CELL_SIZE,
        BOT_OBSTACLE_QUERY_RADIUS
    );
    const buildingObstacles =
        navigationPlanner?.buildingObstacles ||
        staticObstacles.filter(
            (obstacle) => obstacle?.type === 'aabb' && obstacle.category === 'building'
        );
    let resolvedSharedTargetColorHex = sharedTargetColorHex;
    let enabled = true;
    const detachedDebrisPieces = [];
    const detachedDebrisVisibilityCandidates = [];
    const detachedDebrisMeshPoolByPartKey = new Map();
    const pendingMineDebrisParts = [];
    let pendingMineDebrisReadIndex = 0;
    let droppedPendingMineDebris = 0;
    let visibleDetachedDebrisCount = 0;

    const bots = [];
    const botsByCollectorId = new Map();
    const collisionSnapshotBuffer = [];
    const collectorDescriptorBuffer = [];
    const hudStateBuffer = [];
    for (let i = 0; i < Math.max(0, botCount); i += 1) {
        const bot = createBot(
            scene,
            worldBounds,
            staticObstacles,
            bots,
            i,
            resolvedSharedTargetColorHex,
            getGroundHeightAt,
            cityMapLayout,
            ({ bot, part, crashContext }) => {
                const handledExternally =
                    handlePartDetached?.({ bot, part, crashContext }) === true;
                if (!handledExternally) {
                    spawnDetachedBotDebris(bot, part, crashContext);
                }
                return true;
            },
            handleBotDestroyed
        );
        bots.push(bot);
        botsByCollectorId.set(bot.collectorId, bot);
    }
    prewarmDetachedDebrisMeshes();

    return {
        update(playerPosition, visiblePickups = [], deltaTime = 1 / 60) {
            const dt = Math.min(deltaTime, 0.05);
            const nowMs = Date.now();
            processPendingMineDebrisSpawns(dt, playerPosition);
            updateDetachedDebris(dt, playerPosition);
            applyDetachedDebrisVisibilityBudget(dt, playerPosition);
            navigationPlanner?.beginFrame?.();
            if (!enabled) {
                return;
            }
            for (let i = 0; i < bots.length; i += 1) {
                const bot = bots[i];
                if (bot.destroyed) {
                    tryRespawnBot(bot, nowMs);
                    continue;
                }
                updateBotAdaptiveTick(
                    bot,
                    bots,
                    playerPosition,
                    visiblePickups,
                    dt,
                    worldBounds,
                    staticObstacles,
                    obstacleQueryGrid,
                    buildingObstacles,
                    getGroundHeightAt,
                    cityMapLayout,
                    navigationPlanner
                );
            }
        },
        getCollisionSnapshots() {
            if (!enabled) {
                collisionSnapshotBuffer.length = 0;
                return EMPTY_ARRAY;
            }
            const nowMs = Date.now();
            let snapshotCount = 0;
            for (let i = 0; i < bots.length; i += 1) {
                const bot = bots[i];
                if (bot.destroyed || isBotSpawnProtected(bot, nowMs)) {
                    continue;
                }
                let snapshot = collisionSnapshotBuffer[snapshotCount];
                if (!snapshot) {
                    snapshot = {};
                    collisionSnapshotBuffer[snapshotCount] = snapshot;
                }
                snapshot.id = bot.collectorId;
                snapshot.sourceType = 'bot';
                snapshot.x = bot.car.position.x;
                snapshot.z = bot.car.position.z;
                snapshot.heading = bot.car.rotation.y;
                snapshot.halfWidth = BOT_COLLISION_HALF_WIDTH;
                snapshot.halfLength = BOT_COLLISION_HALF_LENGTH;
                snapshot.radius = BOT_VEHICLE_COLLISION_RADIUS;
                snapshot.collisionRadius = BOT_VEHICLE_COLLISION_RADIUS;
                snapshot.mass = BOT_MASS;
                snapshot.velocityX = bot.state.velocity.x;
                snapshot.velocityZ = bot.state.velocity.y;
                snapshotCount += 1;
            }
            collisionSnapshotBuffer.length = snapshotCount;
            return collisionSnapshotBuffer;
        },
        applyCollisionImpulses(contacts = []) {
            if (!enabled) {
                return;
            }
            if (!contacts || contacts.length === 0) {
                return;
            }
            for (let i = 0; i < contacts.length; i += 1) {
                const contact = contacts[i];
                const bot = botsByCollectorId.get(contact.botId);
                if (!bot || bot.destroyed) {
                    continue;
                }
                applyCollisionImpulseToBot(bot, contact);
            }
        },
        getCollectorDescriptors() {
            if (!enabled) {
                collectorDescriptorBuffer.length = 0;
                return EMPTY_ARRAY;
            }
            const nowMs = Date.now();
            let descriptorCount = 0;
            for (let i = 0; i < bots.length; i += 1) {
                const bot = bots[i];
                if (bot.destroyed) {
                    continue;
                }
                let descriptor = collectorDescriptorBuffer[descriptorCount];
                if (!descriptor) {
                    descriptor = {};
                    collectorDescriptorBuffer[descriptorCount] = descriptor;
                }
                descriptor.id = bot.collectorId;
                descriptor.position = bot.car.position;
                descriptor.heading = bot.car.rotation.y;
                descriptor.colorHex = bot.bodyColor;
                descriptor.speedKph = Math.abs(bot.state.speed || 0);
                descriptor.radius = BOT_VEHICLE_COLLISION_RADIUS;
                descriptor.collisionRadius = BOT_VEHICLE_COLLISION_RADIUS;
                descriptor.mineImmune = isBotSpawnProtected(bot, nowMs);
                descriptorCount += 1;
            }
            collectorDescriptorBuffer.length = descriptorCount;
            return collectorDescriptorBuffer;
        },
        getCollectorSpeed(collectorId) {
            if (!enabled) {
                return 0;
            }
            const bot = botsByCollectorId.get(collectorId);
            if (!bot || bot.destroyed) {
                return 0;
            }
            return Math.abs(bot.state.speed || 0);
        },
        registerCollected(collectorId) {
            if (!enabled) {
                return;
            }
            const bot = botsByCollectorId.get(collectorId);
            if (bot && !bot.destroyed) {
                bot.collectedCount += 1;
            }
        },
        setSharedTargetColor(targetColorHex) {
            resolvedSharedTargetColorHex = targetColorHex;
            bots.forEach((bot) => {
                bot.targetColorHex = targetColorHex;
            });
        },
        reset({ sharedTargetColorHex: nextTargetColorHex = resolvedSharedTargetColorHex } = {}) {
            resolvedSharedTargetColorHex = nextTargetColorHex;
            clearDetachedDebris();
            const nowMs = Date.now();
            const placedBots = [];
            for (let i = 0; i < bots.length; i += 1) {
                const bot = bots[i];
                resetBot(
                    bot,
                    i,
                    worldBounds,
                    staticObstacles,
                    placedBots,
                    resolvedSharedTargetColorHex,
                    getGroundHeightAt,
                    {
                        resetCollectedCount: true,
                        resetLives: true,
                        nowMs,
                        respawnProtectionMs: 0,
                    }
                );
                placedBots.push(bot);
            }
            applyEnabledVisibility();
        },
        getHudState() {
            if (!enabled) {
                hudStateBuffer.length = 0;
                return EMPTY_ARRAY;
            }
            const nowMs = Date.now();
            let hudCount = 0;
            for (let i = 0; i < bots.length; i += 1) {
                const bot = bots[i];
                let hudEntry = hudStateBuffer[hudCount];
                if (!hudEntry) {
                    hudEntry = {};
                    hudStateBuffer[hudCount] = hudEntry;
                }
                const respawning = bot.destroyed && bot.livesRemaining > 0;
                hudEntry.collectorId = bot.collectorId;
                hudEntry.name = bot.name;
                hudEntry.collectedCount = bot.collectedCount;
                hudEntry.targetColorHex = bot.targetColorHex;
                hudEntry.livesRemaining = bot.livesRemaining;
                hudEntry.maxLives = BOT_LIVES_PER_ROUND;
                hudEntry.respawning = respawning;
                hudEntry.respawnMsRemaining = respawning
                    ? Math.max(0, (Number(bot.respawnAtMs) || 0) - nowMs)
                    : 0;
                hudCount += 1;
            }
            hudStateBuffer.length = hudCount;
            return hudStateBuffer;
        },
        setEnabled(nextEnabled = true) {
            enabled = Boolean(nextEnabled);
            if (!enabled) {
                clearDetachedDebris();
            }
            applyEnabledVisibility();
        },
        isEnabled() {
            return enabled;
        },
        getPerformanceSnapshot() {
            return {
                pendingMineDebris: Math.max(
                    0,
                    pendingMineDebrisParts.length - pendingMineDebrisReadIndex
                ),
                activeDetachedDebris: detachedDebrisPieces.length,
                visibleDetachedDebris: visibleDetachedDebrisCount,
                droppedPendingMineDebris,
            };
        },
        warmupGraphics(renderer, camera = null) {
            return warmupDetachedDebrisGraphics(renderer, camera);
        },
        triggerMineHit(collectorId, context = {}) {
            if (!enabled) {
                return false;
            }
            const bot = botsByCollectorId.get(collectorId);
            if (!bot || bot.destroyed || isBotSpawnProtected(bot)) {
                return false;
            }
            const mineCrashContext = createMineCrashContext(context?.crashContext);
            queueBotMineDebris(bot, mineCrashContext);
            destroyBot(bot);
            return true;
        },
    };

    function tryRespawnBot(bot, nowMs) {
        if (!bot || !bot.destroyed || bot.livesRemaining <= 0) {
            return;
        }
        if (!Number.isFinite(bot.respawnAtMs) || bot.respawnAtMs <= 0 || nowMs < bot.respawnAtMs) {
            return;
        }

        const placedBots = [];
        for (let i = 0; i < bots.length; i += 1) {
            const candidate = bots[i];
            if (!candidate || candidate === bot || candidate.destroyed) {
                continue;
            }
            placedBots.push(candidate);
        }

        resetBot(
            bot,
            bot.botIndex,
            worldBounds,
            staticObstacles,
            placedBots,
            resolvedSharedTargetColorHex,
            getGroundHeightAt,
            {
                resetCollectedCount: false,
                resetLives: false,
                nowMs,
                respawnProtectionMs: BOT_RESPAWN_PROTECTION_MS,
            }
        );
        if (handleBotRespawn) {
            try {
                handleBotRespawn({
                    collectorId: bot.collectorId,
                    name: bot.name,
                    livesRemaining: bot.livesRemaining,
                    spawnProtectionMsRemaining: Math.max(0, bot.spawnProtectionEndsAtMs - nowMs),
                    position: bot.car.position,
                });
            } catch (error) {
                console.error('Bot respawn callback failed:', error);
            }
        }
    }

    function applyEnabledVisibility() {
        for (let i = 0; i < bots.length; i += 1) {
            const bot = bots[i];
            const botVisible = enabled && !bot.destroyed;
            bot.car.visible = botVisible;
            if (bot.indicator?.root) {
                bot.indicator.root.visible = botVisible;
            }
        }
    }

    function queueBotMineDebris(bot, crashContext = null) {
        if (!bot?.crashParts || bot.crashParts.length === 0) {
            return;
        }
        const configuredBudget = Number.isFinite(crashContext?.debrisSpawnBudget)
            ? Math.max(0, Math.floor(crashContext.debrisSpawnBudget))
            : BOT_MINE_EXPLOSION_DEBRIS_BUDGET;
        const adaptiveBurstBudget = resolveAdaptiveMineDebrisBurstBudget();
        const budget = Math.min(configuredBudget, adaptiveBurstBudget);
        if (budget <= 0) {
            return;
        }
        const queuedAtMs = Date.now();
        const originX = bot.car.position.x;
        const originZ = bot.car.position.z;

        let queuedCount = 0;
        for (let i = 0; i < bot.crashParts.length && queuedCount < budget; i += 1) {
            const part = bot.crashParts[i];
            if (!part?.source?.visible || bot.detachedPartIds.has(part.id)) {
                continue;
            }
            const activePendingCount = pendingMineDebrisParts.length - pendingMineDebrisReadIndex;
            if (activePendingCount >= BOT_MAX_PENDING_MINE_DEBRIS_PARTS) {
                break;
            }

            bot.detachedPartIds.add(part.id);
            part.source.visible = false;
            pendingMineDebrisParts.push({
                bot,
                part,
                crashContext,
                queuedAtMs,
                originX,
                originZ,
            });
            queuedCount += 1;
        }
    }

    function processPendingMineDebrisSpawns(dt, playerPosition = null) {
        if (pendingMineDebrisParts.length - pendingMineDebrisReadIndex <= 0) {
            return;
        }

        let budget = resolvePendingMineDebrisSpawnBudget(dt);
        const nowMs = Date.now();

        while (budget > 0 && pendingMineDebrisReadIndex < pendingMineDebrisParts.length) {
            const entry = pendingMineDebrisParts[pendingMineDebrisReadIndex];
            pendingMineDebrisReadIndex += 1;
            if (shouldDropPendingMineDebrisEntry(entry, playerPosition, nowMs)) {
                droppedPendingMineDebris += 1;
                continue;
            }
            if (entry?.bot && entry?.part) {
                spawnDetachedBotDebris(entry.bot, entry.part, entry.crashContext);
            }
            budget -= 1;
        }

        if (pendingMineDebrisReadIndex >= pendingMineDebrisParts.length) {
            pendingMineDebrisParts.length = 0;
            pendingMineDebrisReadIndex = 0;
            return;
        }
        if (pendingMineDebrisReadIndex >= 16) {
            pendingMineDebrisParts.splice(0, pendingMineDebrisReadIndex);
            pendingMineDebrisReadIndex = 0;
        }
    }

    function resolvePendingMineDebrisSpawnBudget(dt) {
        if (
            dt > 1 / 32 ||
            detachedDebrisPieces.length >= Math.floor(BOT_DEBRIS_MAX_PIECES * 0.9)
        ) {
            return BOT_MINE_DEBRIS_SPAWN_PER_FRAME_SEVERE_LOAD;
        }
        if (
            dt > 1 / 40 ||
            detachedDebrisPieces.length >= Math.floor(BOT_DEBRIS_MAX_PIECES * 0.8)
        ) {
            return BOT_MINE_DEBRIS_SPAWN_PER_FRAME_UNDER_LOAD;
        }
        return BOT_MINE_DEBRIS_SPAWN_PER_FRAME;
    }

    function shouldDropPendingMineDebrisEntry(entry, playerPosition, nowMs) {
        if (!entry || !playerPosition || !Number.isFinite(nowMs)) {
            return false;
        }
        const queuedAtMs = Number(entry.queuedAtMs);
        if (!Number.isFinite(queuedAtMs) || nowMs - queuedAtMs <= BOT_PENDING_MINE_DEBRIS_MAX_AGE_MS) {
            return false;
        }
        const playerX = Number(playerPosition?.x);
        const playerZ = Number(playerPosition?.z);
        const originX = Number(entry.originX);
        const originZ = Number(entry.originZ);
        if (
            !Number.isFinite(playerX) ||
            !Number.isFinite(playerZ) ||
            !Number.isFinite(originX) ||
            !Number.isFinite(originZ)
        ) {
            return false;
        }
        const dx = originX - playerX;
        const dz = originZ - playerZ;
        return dx * dx + dz * dz > BOT_PENDING_MINE_DEBRIS_CULL_DISTANCE_SQ;
    }

    function resolveAdaptiveMineDebrisBurstBudget() {
        const activeCount = detachedDebrisPieces.length;
        if (activeCount >= BOT_DEBRIS_TARGET_ACTIVE_COUNT + 6) {
            return BOT_DEBRIS_BURST_BUDGET_ACTIVE_SEVERE;
        }
        if (activeCount >= BOT_DEBRIS_TARGET_ACTIVE_COUNT) {
            return BOT_DEBRIS_BURST_BUDGET_ACTIVE_HIGH;
        }
        return BOT_MINE_EXPLOSION_DEBRIS_BUDGET;
    }

    function spawnDetachedBotDebris(bot, part, crashContext = null) {
        if (!part?.source) {
            return;
        }
        if (!consumeCrashContextDebrisBudget(crashContext)) {
            return;
        }

        const source = part.source;
        const partKey = resolveBotDebrisPartKey(bot, part);
        source.updateWorldMatrix(true, false);
        const debrisMesh = acquireDetachedBotDebrisMesh(partKey, source);
        source.matrixWorld.decompose(debrisMesh.position, debrisMesh.quaternion, debrisMesh.scale);
        scene.add(debrisMesh);

        const forward = botDebrisForwardScratch
            .set(0, 0, -1)
            .applyQuaternion(bot.car.quaternion)
            .setY(0);
        if (forward.lengthSq() < 0.0001) {
            forward.set(0, 0, -1);
        }
        forward.normalize();
        const right = botDebrisRightScratch
            .set(1, 0, 0)
            .applyQuaternion(bot.car.quaternion)
            .setY(0);
        if (right.lengthSq() < 0.0001) {
            right.set(1, 0, 0);
        }
        right.normalize();
        const travelDirection = botDebrisTravelScratch;
        if (crashContext?.impactTravelDirection?.isVector3) {
            travelDirection.copy(crashContext.impactTravelDirection).setY(0);
        } else {
            travelDirection.copy(forward);
        }
        if (travelDirection.lengthSq() < 0.0001) {
            travelDirection.copy(forward);
        }
        travelDirection.normalize();

        const sideFactor =
            part.side === 'left' ? -1 : part.side === 'right' ? 1 : Math.random() < 0.5 ? -1 : 1;
        const impactSpeed = Math.max(8, Math.min(36, Number(crashContext?.impactSpeed) || 14));
        const velocity = new THREE.Vector3().copy(
            botDebrisVelocityScratch
                .copy(travelDirection)
                .multiplyScalar(impactSpeed * 0.26)
                .addScaledVector(right, sideFactor * (1.4 + Math.random() * 1.9))
        );
        velocity.y = 2.2 + Math.random() * 2.6 + (part.type === 'wheel' ? 0.8 : 0.2);

        const angularVelocity = new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10
        );

        detachedDebrisPieces.push({
            partKey,
            partType: part.type || '',
            mesh: debrisMesh,
            velocity,
            angularVelocity,
            settled: false,
            lifeSec: BOT_DEBRIS_MAX_LIFETIME_SEC + Math.random() * BOT_DEBRIS_MAX_LIFETIME_JITTER_SEC,
        });
        trimDetachedDebrisLimit();
    }

    function updateDetachedDebris(dt, playerPosition = null) {
        if (detachedDebrisPieces.length === 0) {
            return;
        }

        for (let i = detachedDebrisPieces.length - 1; i >= 0; i -= 1) {
            const piece = detachedDebrisPieces[i];
            if (!piece) {
                continue;
            }
            if (Number.isFinite(piece.lifeSec)) {
                piece.lifeSec -= dt;
                if (piece.lifeSec <= 0) {
                    removeDetachedDebrisPieceAt(i);
                    continue;
                }
            }
            if (
                playerPosition &&
                Number.isFinite(playerPosition.x) &&
                Number.isFinite(playerPosition.z)
            ) {
                const deltaX = piece.mesh.position.x - playerPosition.x;
                const deltaZ = piece.mesh.position.z - playerPosition.z;
                if (deltaX * deltaX + deltaZ * deltaZ > BOT_DEBRIS_DESPAWN_DISTANCE_SQ) {
                    removeDetachedDebrisPieceAt(i);
                    continue;
                }
            }
            if (piece.settled) {
                continue;
            }

            piece.velocity.y -= BOT_DEBRIS_GRAVITY * dt;
            piece.velocity.multiplyScalar(Math.exp(-BOT_DEBRIS_DRAG * dt));
            piece.mesh.position.addScaledVector(piece.velocity, dt);

            piece.mesh.rotation.x += piece.angularVelocity.x * dt;
            piece.mesh.rotation.y += piece.angularVelocity.y * dt;
            piece.mesh.rotation.z += piece.angularVelocity.z * dt;

            const groundY =
                resolveBotGroundHeight(
                    piece.mesh.position.x,
                    piece.mesh.position.z,
                    getGroundHeightAt
                ) + BOT_DEBRIS_GROUND_OFFSET;
            if (piece.mesh.position.y > groundY) {
                continue;
            }

            piece.mesh.position.y = groundY;
            if (Math.abs(piece.velocity.y) > 0.65) {
                piece.velocity.y = -piece.velocity.y * BOT_DEBRIS_BOUNCE;
            } else {
                piece.velocity.y = 0;
            }
            piece.velocity.x *= 0.7;
            piece.velocity.z *= 0.7;
            piece.angularVelocity.multiplyScalar(0.72);

            const velocitySq =
                piece.velocity.x * piece.velocity.x +
                piece.velocity.y * piece.velocity.y +
                piece.velocity.z * piece.velocity.z;
            const angularVelocitySq =
                piece.angularVelocity.x * piece.angularVelocity.x +
                piece.angularVelocity.y * piece.angularVelocity.y +
                piece.angularVelocity.z * piece.angularVelocity.z;
            if (velocitySq < 0.1764 && angularVelocitySq < 0.49) {
                piece.settled = true;
                piece.velocity.set(0, 0, 0);
                piece.angularVelocity.set(0, 0, 0);
            }
        }
    }

    function applyDetachedDebrisVisibilityBudget(dt, playerPosition = null) {
        if (detachedDebrisPieces.length === 0) {
            visibleDetachedDebrisCount = 0;
            return;
        }
        const playerX = Number(playerPosition?.x);
        const playerZ = Number(playerPosition?.z);
        const hasPlayerPosition = Number.isFinite(playerX) && Number.isFinite(playerZ);
        const visibleBudget = resolveDetachedDebrisVisibleBudget(dt, detachedDebrisPieces.length);
        const candidates = detachedDebrisVisibilityCandidates;
        candidates.length = 0;

        for (let i = 0; i < detachedDebrisPieces.length; i += 1) {
            const piece = detachedDebrisPieces[i];
            if (!piece?.mesh) {
                continue;
            }
            let distanceSq = 0;
            if (hasPlayerPosition) {
                const deltaX = piece.mesh.position.x - playerX;
                const deltaZ = piece.mesh.position.z - playerZ;
                distanceSq = deltaX * deltaX + deltaZ * deltaZ;
                if (distanceSq > BOT_DEBRIS_RENDER_DISTANCE_SQ) {
                    piece.mesh.visible = false;
                    continue;
                }
            }

            let score = piece.settled ? 0 : 1000;
            if (piece.partType === 'wheel') {
                score += 80;
            } else if (piece.partType === 'suspension_link') {
                score += 52;
            } else {
                score += 34;
            }
            if (hasPlayerPosition) {
                if (distanceSq <= BOT_DEBRIS_ALWAYS_VISIBLE_DISTANCE_SQ) {
                    score += 540;
                }
                score += Math.max(0, 320 - distanceSq * 0.08);
            }
            candidates.push({
                piece,
                score,
            });
        }

        if (candidates.length === 0) {
            visibleDetachedDebrisCount = 0;
            return;
        }

        candidates.sort((left, right) => right.score - left.score);
        let visibleCount = 0;
        for (let i = 0; i < candidates.length; i += 1) {
            const shouldRender = visibleCount < visibleBudget;
            candidates[i].piece.mesh.visible = shouldRender;
            if (shouldRender) {
                visibleCount += 1;
            }
        }
        visibleDetachedDebrisCount = visibleCount;
    }

    function resolveDetachedDebrisVisibleBudget(dt, activeCount = 0) {
        if (dt > 1 / 32 || activeCount >= BOT_DEBRIS_TARGET_ACTIVE_COUNT + 4) {
            return BOT_DEBRIS_MAX_VISIBLE_SEVERE_LOAD;
        }
        if (dt > 1 / 42 || activeCount >= BOT_DEBRIS_TARGET_ACTIVE_COUNT) {
            return BOT_DEBRIS_MAX_VISIBLE_UNDER_LOAD;
        }
        return BOT_DEBRIS_MAX_VISIBLE;
    }

    function trimDetachedDebrisLimit() {
        while (detachedDebrisPieces.length > BOT_DEBRIS_MAX_PIECES) {
            let removalIndex = -1;
            for (let i = 0; i < detachedDebrisPieces.length; i += 1) {
                if (detachedDebrisPieces[i]?.settled) {
                    removalIndex = i;
                    break;
                }
            }
            if (removalIndex < 0) {
                removalIndex = 0;
            }
            removeDetachedDebrisPieceAt(removalIndex);
        }
    }

    function removeDetachedDebrisPieceAt(index) {
        if (index < 0 || index >= detachedDebrisPieces.length) {
            return;
        }
        const piece = detachedDebrisPieces[index];
        if (piece?.mesh) {
            scene.remove(piece.mesh);
            recycleDetachedBotDebrisMesh(piece.partKey, piece.mesh);
        }
        const lastIndex = detachedDebrisPieces.length - 1;
        if (index !== lastIndex) {
            detachedDebrisPieces[index] = detachedDebrisPieces[lastIndex];
        }
        detachedDebrisPieces.pop();
    }

    function clearDetachedDebris() {
        pendingMineDebrisParts.length = 0;
        pendingMineDebrisReadIndex = 0;
        droppedPendingMineDebris = 0;
        visibleDetachedDebrisCount = 0;
        detachedDebrisVisibilityCandidates.length = 0;
        while (detachedDebrisPieces.length > 0) {
            const piece = detachedDebrisPieces.pop();
            if (!piece?.mesh) {
                continue;
            }
            scene.remove(piece.mesh);
            recycleDetachedBotDebrisMesh(piece.partKey, piece.mesh);
        }
    }

    function createMineCrashContext(value) {
        const source = value && typeof value === 'object' ? value : null;
        const crashContext = source ? { ...source } : {};
        const configuredBudget = Number(crashContext.debrisSpawnBudget);
        crashContext.debrisSpawnBudget = Number.isFinite(configuredBudget)
            ? Math.max(0, Math.floor(configuredBudget))
            : BOT_MINE_EXPLOSION_DEBRIS_BUDGET;
        return crashContext;
    }

    function consumeCrashContextDebrisBudget(crashContext) {
        if (!crashContext || typeof crashContext !== 'object') {
            return true;
        }
        if (!Number.isFinite(crashContext.debrisSpawnBudget)) {
            return true;
        }
        if (crashContext.debrisSpawnBudget <= 0) {
            return false;
        }
        crashContext.debrisSpawnBudget -= 1;
        return true;
    }

    function resolveBotDebrisPartKey(bot, part) {
        const botId =
            typeof bot?.collectorId === 'string' && bot.collectorId
                ? bot.collectorId
                : 'unknown-bot';
        const partId =
            typeof part?.id === 'string' && part.id
                ? part.id
                : typeof part?.source?.uuid === 'string' && part.source.uuid
                  ? part.source.uuid
                  : 'unknown-part';
        return `${botId}:${partId}`;
    }

    function prewarmDetachedDebrisMeshes() {
        for (let i = 0; i < bots.length; i += 1) {
            const bot = bots[i];
            if (!bot?.crashParts) {
                continue;
            }
            for (let partIndex = 0; partIndex < bot.crashParts.length; partIndex += 1) {
                const part = bot.crashParts[partIndex];
                if (!part?.source) {
                    continue;
                }
                const partKey = resolveBotDebrisPartKey(bot, part);
                const pool = detachedDebrisMeshPoolByPartKey.get(partKey) || [];
                if (!detachedDebrisMeshPoolByPartKey.has(partKey)) {
                    detachedDebrisMeshPoolByPartKey.set(partKey, pool);
                }
                if (pool.length > 0) {
                    continue;
                }
                pool.push(cloneBotPartMesh(part.source));
            }
        }
    }

    function warmupDetachedDebrisGraphics(renderer, camera = null) {
        if (!renderer || typeof renderer.compile !== 'function') {
            return false;
        }
        if (!Array.isArray(bots) || bots.length === 0) {
            return false;
        }

        const compileCamera = camera?.isCamera
            ? camera
            : new THREE.PerspectiveCamera(55, 1, 0.1, 220);
        const warmupOrigin = new THREE.Vector3();
        if (camera?.isCamera) {
            const forward = new THREE.Vector3(0, 0, -1);
            if (typeof camera.getWorldDirection === 'function') {
                camera.getWorldDirection(forward);
            } else if (camera.quaternion) {
                forward.applyQuaternion(camera.quaternion).normalize();
            }
            if (forward.lengthSq() < 0.0001) {
                forward.set(0, 0, -1);
            }
            warmupOrigin.copy(camera.position).addScaledVector(forward.normalize(), 6.4);
            warmupOrigin.y = Math.max(warmupOrigin.y, BOT_RIDE_HEIGHT + 1.2);
        } else {
            warmupOrigin.copy(bots[0].car.position);
            warmupOrigin.y += 1.1;
            compileCamera.position.set(
                warmupOrigin.x + 5.2,
                warmupOrigin.y + 3.4,
                warmupOrigin.z + 6.6
            );
            compileCamera.lookAt(warmupOrigin.x, warmupOrigin.y + 0.8, warmupOrigin.z - 2.6);
            compileCamera.updateProjectionMatrix();
        }

        const warmedMeshes = [];
        const maxWarmupParts = 8;
        let spawnedCount = 0;
        for (let botIndex = 0; botIndex < bots.length && spawnedCount < maxWarmupParts; botIndex += 1) {
            const bot = bots[botIndex];
            if (!Array.isArray(bot?.crashParts) || bot.crashParts.length === 0) {
                continue;
            }
            for (
                let partIndex = 0;
                partIndex < bot.crashParts.length && spawnedCount < maxWarmupParts;
                partIndex += 1
            ) {
                const part = bot.crashParts[partIndex];
                if (!part?.source) {
                    continue;
                }
                const partKey = resolveBotDebrisPartKey(bot, part);
                const mesh = acquireDetachedBotDebrisMesh(partKey, part.source);
                const offsetX = (spawnedCount - (maxWarmupParts - 1) * 0.5) * 0.92;
                const offsetZ = -2.1 - spawnedCount * 0.38;
                mesh.position.set(
                    warmupOrigin.x + offsetX,
                    warmupOrigin.y + 0.62 + spawnedCount * 0.04,
                    warmupOrigin.z + offsetZ
                );
                mesh.rotation.set(0.15 * spawnedCount, 0.2 * spawnedCount, 0.08 * spawnedCount);
                scene.add(mesh);
                warmedMeshes.push({ partKey, mesh });
                spawnedCount += 1;
            }
        }

        let warmedUp = false;
        try {
            scene.updateMatrixWorld(true);
            compileCamera.updateMatrixWorld(true);
            renderer.compile(scene, compileCamera);
            warmedUp = true;
        } catch {
            warmedUp = false;
        } finally {
            for (let i = 0; i < warmedMeshes.length; i += 1) {
                const entry = warmedMeshes[i];
                scene.remove(entry.mesh);
                recycleDetachedBotDebrisMesh(entry.partKey, entry.mesh);
            }
        }

        return warmedUp;
    }

    function acquireDetachedBotDebrisMesh(partKey, source) {
        const key = typeof partKey === 'string' ? partKey : '';
        const pool = detachedDebrisMeshPoolByPartKey.get(key);
        if (pool && pool.length > 0) {
            const mesh = pool.pop();
            mesh.visible = true;
            return mesh;
        }
        return cloneBotPartMesh(source);
    }

    function recycleDetachedBotDebrisMesh(partKey, mesh) {
        if (!mesh) {
            return;
        }
        const key = typeof partKey === 'string' ? partKey : '';
        const pool = detachedDebrisMeshPoolByPartKey.get(key) || [];
        if (!detachedDebrisMeshPoolByPartKey.has(key)) {
            detachedDebrisMeshPoolByPartKey.set(key, pool);
        }
        mesh.visible = false;
        mesh.position.set(0, -1000, 0);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(1, 1, 1);
        if (pool.length < BOT_DEBRIS_POOL_PER_PART) {
            pool.push(mesh);
            return;
        }
        disposeObject3d(mesh);
    }

    function cloneBotPartMesh(source) {
        const clone = source.clone(true);
        clone.traverse((node) => {
            if (!node?.isMesh) {
                return;
            }
            if (Array.isArray(node.material)) {
                node.material = node.material.map((material) =>
                    material?.clone ? material.clone() : material
                );
            } else if (node.material?.clone) {
                node.material = node.material.clone();
            }
            node.castShadow = false;
            node.receiveShadow = false;
            if (typeof node.updateMorphTargets === 'function') {
                node.updateMorphTargets();
            }
        });
        return clone;
    }
}

function resolveBotGroundHeight(x, z, getGroundHeightAt) {
    if (typeof getGroundHeightAt !== 'function') {
        return BOT_RIDE_HEIGHT;
    }
    return getGroundHeightAt(x, z) + BOT_RIDE_HEIGHT;
}

function resetBot(
    bot,
    index,
    worldBounds,
    staticObstacles,
    placedBots,
    sharedTargetColorHex,
    getGroundHeightAt,
    options = {}
) {
    const {
        resetCollectedCount = true,
        resetLives = true,
        nowMs = Date.now(),
        respawnProtectionMs = 0,
    } = options;
    const spawnPosition = findSpawnPoint(index, worldBounds, staticObstacles, placedBots);
    bot.car.position.x = spawnPosition.x;
    bot.car.position.z = spawnPosition.z;
    bot.car.position.y = resolveBotGroundHeight(
        spawnPosition.x,
        spawnPosition.z,
        getGroundHeightAt
    );
    bot.car.rotation.y = spawnPosition.rotationY;
    bot.car.visible = true;

    if (bot.indicator?.root) {
        bot.indicator.root.visible = true;
    }

    bot.destroyed = false;
    bot.respawnAtMs = 0;
    bot.spawnProtectionEndsAtMs =
        respawnProtectionMs > 0 ? nowMs + Math.max(0, respawnProtectionMs) : 0;
    if (resetLives) {
        bot.livesRemaining = BOT_LIVES_PER_ROUND;
    }
    bot.state.speed = 0;
    bot.state.acceleration = 0;
    bot.state.steerInput = 0;
    bot.state.steerAngle = 0;
    bot.state.throttle = 0;
    bot.state.brake = 0;
    bot.state.yawRate = 0;
    bot.state.burnout = 0;
    bot.state.velocity.set(0, 0);
    bot.drift.active = false;
    bot.drift.timer = 0;
    bot.drift.direction = 0;
    bot.drift.intensity = 0;
    bot.drift.cooldown = randomRange(BOT_DRIFT_COOLDOWN_MIN * 0.5, BOT_DRIFT_COOLDOWN_MAX * 0.9);
    bot.wanderTarget = pickWanderTarget(worldBounds);
    if (resetCollectedCount) {
        bot.collectedCount = 0;
    }
    bot.targetColorHex = sharedTargetColorHex;
    bot.lastDamageAtMs = 0;
    bot.detachedPartIds.clear();
    bot.detourTarget = null;
    bot.roadTarget = null;
    bot.roadPath = null;
    bot.roadPathIndex = 0;
    bot.roadPathKey = null;
    bot.roadPathBuildCooldown = 0;
    bot.forcePathReplan = false;
    bot.bestTargetDistanceSq = Infinity;
    bot.stuckTimer = 0;
    bot.stuckTargetKey = null;
    bot.recoveryTimer = 0;
    bot.recoverySteerSign = 0;
    bot.simulationAccumulator = 0;
    bot.simulationStep = BOT_SIM_NEAR_STEP;

    const freshDamageState = createEmptyBotDamageState();
    bot.damageState.wheelLossCount = freshDamageState.wheelLossCount;
    bot.damageState.leftLoss = freshDamageState.leftLoss;
    bot.damageState.rightLoss = freshDamageState.rightLoss;
    bot.damageState.frontLoss = freshDamageState.frontLoss;
    bot.damageState.rearLoss = freshDamageState.rearLoss;
    bot.damageState.suspensionLoss = freshDamageState.suspensionLoss;

    bot.bodyDamageVisual.left = 0;
    bot.bodyDamageVisual.right = 0;
    bot.bodyDamageVisual.front = 0;
    bot.bodyDamageVisual.rear = 0;

    for (let i = 0; i < bot.crashParts.length; i += 1) {
        const part = bot.crashParts[i];
        if (!part?.source) {
            continue;
        }
        part.source.visible = true;
        const base = bot.bodyPartBaselines.get(part.id);
        if (base) {
            part.source.position.copy(base.position);
            part.source.rotation.copy(base.rotation);
            part.source.scale.copy(base.scale);
        }
    }

    bot.updateVisuals(bot.state, 1 / 60);
}

function createBot(
    scene,
    worldBounds,
    staticObstacles,
    existingBots,
    index,
    sharedTargetColorHex,
    getGroundHeightAt,
    cityMapLayout,
    onPartDetached,
    onDestroyed = null
) {
    const name = BOT_NAMES[index] || `BOT-${index + 1}`;
    const bodyColor = BOT_BODY_COLORS[index % BOT_BODY_COLORS.length];
    const collectorId = `bot-${index + 1}`;

    const carRig = createCarRig({
        bodyColor,
        displayName: name,
        addLights: true,
        addWheelWellLights: false,
        roofScreenDynamic: false,
        lightConfig: {
            enableHeadlightProjectors: false,
            enableTaillightPointLights: false,
            enableAccentPointLights: false,
        },
    });

    const spawnPosition = findSpawnPoint(index, worldBounds, staticObstacles, existingBots);
    carRig.car.position.x = spawnPosition.x;
    carRig.car.position.z = spawnPosition.z;
    carRig.car.position.y = resolveBotGroundHeight(
        spawnPosition.x,
        spawnPosition.z,
        getGroundHeightAt
    );
    carRig.car.rotation.y = spawnPosition.rotationY;
    scene.add(carRig.car);
    const indicator = createBotIndicator(name, bodyColor);
    carRig.car.add(indicator.root);

    const state = {
        speed: 0,
        acceleration: 0,
        steerInput: 0,
        steerAngle: 0,
        throttle: 0,
        brake: 0,
        yawRate: 0,
        burnout: 0,
        velocity: new THREE.Vector2(0, 0),
    };
    const bot = {
        botIndex: index,
        collectorId,
        name,
        bodyColor,
        car: carRig.car,
        indicator,
        updateVisuals: carRig.updateVisuals,
        crashParts: carRig.getCrashParts ? carRig.getCrashParts() : [],
        detachedPartIds: new Set(),
        damageState: createEmptyBotDamageState(),
        bodyDamageVisual: { left: 0, right: 0, front: 0, rear: 0 },
        bodyPartBaselines: new Map(),
        onPartDetached,
        onDestroyed,
        lastDamageAtMs: 0,
        destroyed: false,
        livesRemaining: BOT_LIVES_PER_ROUND,
        respawnAtMs: 0,
        spawnProtectionEndsAtMs: 0,
        state,
        drift: {
            active: false,
            timer: 0,
            direction: 0,
            intensity: 0,
            cooldown: randomRange(BOT_DRIFT_COOLDOWN_MIN * 0.5, BOT_DRIFT_COOLDOWN_MAX),
        },
        wanderTarget: pickWanderTarget(worldBounds, cityMapLayout),
        collectedCount: 0,
        targetColorHex: sharedTargetColorHex,
        detourTarget: null,
        roadTarget: null,
        roadPath: null,
        roadPathIndex: 0,
        roadPathKey: null,
        roadPathBuildCooldown: 0,
        forcePathReplan: false,
        bestTargetDistanceSq: Infinity,
        stuckTimer: 0,
        stuckTargetKey: null,
        recoveryTimer: 0,
        recoverySteerSign: 0,
        simulationAccumulator: 0,
        simulationStep: BOT_SIM_NEAR_STEP,
    };

    initializeBotPartBaselines(bot);
    return bot;
}

function updateBotAdaptiveTick(
    bot,
    allBots,
    playerPosition,
    visiblePickups,
    frameDelta,
    worldBounds,
    staticObstacles,
    obstacleQueryGrid,
    buildingObstacles,
    getGroundHeightAt,
    cityMapLayout,
    navigationPlanner
) {
    const simulationStep = resolveBotSimulationStep(bot.car.position, playerPosition);
    bot.simulationStep = simulationStep;
    bot.simulationAccumulator = Math.min(
        Math.max(0, Number(bot.simulationAccumulator) || 0) + frameDelta,
        simulationStep * (BOT_SIM_MAX_STEPS_PER_FRAME + 1)
    );

    let simulationSteps = 0;
    while (
        bot.simulationAccumulator >= simulationStep &&
        simulationSteps < BOT_SIM_MAX_STEPS_PER_FRAME
    ) {
        updateBot(
            bot,
            allBots,
            playerPosition,
            visiblePickups,
            simulationStep,
            worldBounds,
            staticObstacles,
            obstacleQueryGrid,
            buildingObstacles,
            getGroundHeightAt,
            cityMapLayout,
            navigationPlanner
        );
        bot.simulationAccumulator -= simulationStep;
        simulationSteps += 1;
    }

    if (
        simulationSteps === BOT_SIM_MAX_STEPS_PER_FRAME &&
        bot.simulationAccumulator > simulationStep
    ) {
        bot.simulationAccumulator = simulationStep * 0.75;
    }

    updateBotIndicator(bot, frameDelta);
}

function updateBot(
    bot,
    allBots,
    playerPosition,
    visiblePickups,
    dt,
    worldBounds,
    staticObstacles,
    obstacleQueryGrid,
    buildingObstacles,
    getGroundHeightAt,
    cityMapLayout,
    navigationPlanner
) {
    const damageDynamics = getBotDamageDynamics(bot.damageState);
    const targetPickup = findNearestPickup(bot.car.position, visiblePickups, buildingObstacles);
    const nearbyObstacles = resolveNearbyBotObstacles(
        bot.car.position,
        staticObstacles,
        navigationPlanner,
        obstacleQueryGrid
    );

    if (!targetPickup) {
        const wanderDistanceSq = distanceSqXZ(bot.car.position, bot.wanderTarget);
        if (wanderDistanceSq <= BOT_WANDER_REACH_RADIUS * BOT_WANDER_REACH_RADIUS) {
            bot.wanderTarget = pickWanderTarget(worldBounds, cityMapLayout);
        }
    }

    const targetX = targetPickup ? targetPickup.x : bot.wanderTarget.x;
    const targetZ = targetPickup ? targetPickup.z : bot.wanderTarget.z;
    const baseTarget = { x: targetX, z: targetZ };
    updateStuckState(bot, baseTarget, dt);
    const roadTarget = BOT_REACTIVE_NAVIGATION_ONLY
        ? null
        : resolveRoadTarget(
              bot,
              baseTarget,
              worldBounds,
              cityMapLayout,
              staticObstacles,
              navigationPlanner,
              dt
          );
    const navTarget = roadTarget || baseTarget;
    const detourTarget = resolveDetourTarget(bot, navTarget, worldBounds, buildingObstacles);
    const resolvedTarget = detourTarget || navTarget;

    targetDir2.set(resolvedTarget.x - bot.car.position.x, resolvedTarget.z - bot.car.position.z);
    if (targetDir2.lengthSq() < 0.001) {
        targetDir2.set(-Math.sin(bot.car.rotation.y), -Math.cos(bot.car.rotation.y));
    }
    targetDir2.normalize();

    avoidance2.set(0, 0);
    addBoundaryAvoidance(avoidance2, bot.car.position, worldBounds);
    addObstacleAvoidance(avoidance2, bot.car.position, nearbyObstacles);
    addEntityAvoidance(avoidance2, bot.car.position, playerPosition, 10.5, 1.35);

    for (let i = 0; i < allBots.length; i += 1) {
        const other = allBots[i];
        if (other === bot || other.destroyed) {
            continue;
        }
        addEntityAvoidance(
            avoidance2,
            bot.car.position,
            other.car.position,
            BOT_AVOIDANCE_RADIUS,
            1.1
        );
    }

    targetDir2.addScaledVector(avoidance2, BOT_AVOIDANCE_BLEND);
    if (targetDir2.lengthSq() < 0.001) {
        targetDir2.set(-Math.sin(bot.car.rotation.y), -Math.cos(bot.car.rotation.y));
    }
    targetDir2.normalize();

    const desiredYaw = Math.atan2(-targetDir2.x, -targetDir2.y);
    const headingError = shortestAngle(bot.car.rotation.y, desiredYaw);
    const headingAbs = Math.abs(headingError);
    const driftState = bot.drift;
    const recovering = bot.recoveryTimer > 0;
    if (recovering) {
        driftState.active = false;
        driftState.timer = 0;
        driftState.direction = 0;
        driftState.intensity = 0;
    }
    if (driftState.cooldown > 0) {
        driftState.cooldown = Math.max(0, driftState.cooldown - dt);
    }
    if (driftState.active) {
        driftState.timer -= dt;
        const headingContinue = headingAbs > BOT_DRIFT_EXIT_HEADING;
        if ((driftState.timer <= 0 && !headingContinue) || driftState.timer <= -0.35) {
            driftState.active = false;
            driftState.timer = 0;
            driftState.direction = 0;
            driftState.intensity = 0;
            driftState.cooldown = randomRange(BOT_DRIFT_COOLDOWN_MIN, BOT_DRIFT_COOLDOWN_MAX);
        } else {
            const headingIntensity = THREE.MathUtils.clamp(
                headingAbs / BOT_TARGET_HEADING_FULL_STEER,
                0.35,
                1
            );
            driftState.intensity = THREE.MathUtils.lerp(
                driftState.intensity,
                headingIntensity,
                1 - Math.exp(-4.4 * dt)
            );
        }
    } else if (
        driftState.cooldown <= 0 &&
        bot.state.speed > BOT_DRIFT_MIN_SPEED &&
        headingAbs > BOT_DRIFT_ENTRY_HEADING
    ) {
        const headingFactor = THREE.MathUtils.clamp(
            (headingAbs - BOT_DRIFT_ENTRY_HEADING) /
                Math.max(0.001, BOT_TARGET_HEADING_FULL_STEER - BOT_DRIFT_ENTRY_HEADING),
            0,
            1
        );
        const speedFactor = THREE.MathUtils.clamp(
            (bot.state.speed - BOT_DRIFT_MIN_SPEED) /
                Math.max(0.001, BOT_MAX_SPEED - BOT_DRIFT_MIN_SPEED),
            0,
            1
        );
        const driftChance =
            BOT_DRIFT_CHANCE_PER_SECOND *
            dt *
            (0.35 + headingFactor * 0.95) *
            (0.45 + speedFactor * 0.75);
        if (Math.random() < driftChance) {
            driftState.active = true;
            driftState.timer = randomRange(BOT_DRIFT_DURATION_MIN, BOT_DRIFT_DURATION_MAX);
            driftState.direction = Math.sign(headingError) || (Math.random() < 0.5 ? -1 : 1);
            driftState.intensity = THREE.MathUtils.clamp(0.42 + headingFactor * 0.5, 0.35, 1);
        }
    }

    let steerTarget = THREE.MathUtils.clamp(headingError / BOT_TARGET_HEADING_FULL_STEER, -1, 1);
    if (driftState.active) {
        steerTarget = THREE.MathUtils.clamp(
            steerTarget + driftState.direction * BOT_DRIFT_STEER_BIAS * driftState.intensity,
            -1,
            1
        );
    }
    if (recovering) {
        steerTarget = bot.recoverySteerSign * BOT_STUCK_RECOVERY_STEER;
    }
    bot.state.steerInput = moveToward(
        bot.state.steerInput,
        steerTarget,
        BOT_STEER_RESPONSE * damageDynamics.steerAuthority * dt
    );
    bot.state.steerAngle = bot.state.steerInput * BOT_MAX_STEER * damageDynamics.steerRange;

    let desiredSpeed = BOT_MAX_SPEED * (1 - Math.min(Math.abs(headingError) / Math.PI, 0.55));
    desiredSpeed = Math.max(BOT_MIN_SPEED, desiredSpeed);
    desiredSpeed *= damageDynamics.speedScale;
    if (driftState.active) {
        const driftSpeedScale = THREE.MathUtils.lerp(
            1,
            BOT_DRIFT_SPEED_SCALE,
            driftState.intensity
        );
        desiredSpeed *= driftSpeedScale;
    }
    if (targetPickup) {
        const targetDistance = Math.sqrt(distanceSqXZ(bot.car.position, targetPickup));
        if (targetDistance < 16) {
            desiredSpeed = Math.min(
                desiredSpeed,
                BOT_MIN_SPEED * damageDynamics.speedScale + targetDistance * 1.45
            );
        }
    }
    if (recovering) {
        desiredSpeed = -BOT_MIN_SPEED * 0.72 * damageDynamics.speedScale;
    }

    const speedError = desiredSpeed - bot.state.speed;
    const maxSpeedDelta = speedError >= 0 ? BOT_ACCELERATION * dt : BOT_BRAKE_DECELERATION * dt;
    const previousSpeed = bot.state.speed;
    bot.state.speed = moveToward(bot.state.speed, desiredSpeed, maxSpeedDelta);
    bot.state.speed *= Math.exp(-(BOT_DRAG + damageDynamics.dragPenalty) * dt);
    bot.state.acceleration = (bot.state.speed - previousSpeed) / Math.max(dt, 0.0001);
    bot.state.throttle =
        speedError > 0 ? THREE.MathUtils.clamp(speedError / (BOT_MAX_SPEED * 0.36), 0, 1) : 0;
    bot.state.brake =
        speedError < 0 ? THREE.MathUtils.clamp(-speedError / (BOT_MAX_SPEED * 0.24), 0, 1) : 0;
    const burnoutTarget = driftState.active
        ? THREE.MathUtils.clamp(0.46 + driftState.intensity * 0.42, 0, 1)
        : 0;
    bot.state.burnout = moveToward(
        bot.state.burnout || 0,
        burnoutTarget,
        (driftState.active ? 2.8 : 3.6) * dt
    );

    let yawRate = calculateYawRate(bot.state.speed, bot.state.steerAngle);
    if (driftState.active) {
        yawRate += driftState.direction * BOT_DRIFT_YAW_BOOST * driftState.intensity;
    }
    const yawBias =
        damageDynamics.yawBias * THREE.MathUtils.clamp(Math.abs(bot.state.speed) / 9, 0, 1);
    const totalYawRate = yawRate + yawBias;
    bot.state.yawRate = totalYawRate;
    bot.car.rotation.y += totalYawRate * dt;

    forward2.set(-Math.sin(bot.car.rotation.y), -Math.cos(bot.car.rotation.y));
    bot.state.velocity.copy(forward2).multiplyScalar(bot.state.speed);
    if (driftState.active) {
        right2.set(Math.cos(bot.car.rotation.y), -Math.sin(bot.car.rotation.y));
        const driftSlip =
            BOT_DRIFT_LATERAL_SLIP * driftState.intensity * Math.sign(bot.state.speed || 1);
        bot.state.velocity.addScaledVector(right2, driftSlip);
    }

    bot.car.position.x += bot.state.velocity.x * dt;
    bot.car.position.z += bot.state.velocity.y * dt;

    constrainToWorld(bot.car.position, bot.state, worldBounds);
    constrainToObstacles(bot, bot.car.position, bot.state, nearbyObstacles);
    constrainToPlayerVehicle(bot, playerPosition);
    bot.car.position.y = resolveBotGroundHeight(
        bot.car.position.x,
        bot.car.position.z,
        getGroundHeightAt
    );

    bot.updateVisuals(bot.state, dt);
}

function resolveNearbyBotObstacles(
    position,
    staticObstacles,
    navigationPlanner,
    obstacleQueryGrid
) {
    const x = Number(position?.x);
    const z = Number(position?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
        return staticObstacles;
    }

    let nearbyObstacles = navigationPlanner?.queryNearbyObstacles?.(
        x,
        z,
        BOT_OBSTACLE_QUERY_RADIUS
    );
    if (!Array.isArray(nearbyObstacles) || nearbyObstacles.length === 0) {
        nearbyObstacles = queryObstacleGrid(obstacleQueryGrid, x, z, BOT_OBSTACLE_QUERY_RADIUS);
    }
    if (!Array.isArray(nearbyObstacles) || nearbyObstacles.length === 0) {
        return staticObstacles;
    }
    return nearbyObstacles;
}

function resolveBotSimulationStep(botPosition, playerPosition) {
    const botX = Number(botPosition?.x);
    const botZ = Number(botPosition?.z);
    const playerX = Number(playerPosition?.x);
    const playerZ = Number(playerPosition?.z);
    if (!Number.isFinite(botX) || !Number.isFinite(botZ)) {
        return BOT_SIM_MID_STEP;
    }
    if (!Number.isFinite(playerX) || !Number.isFinite(playerZ)) {
        return BOT_SIM_MID_STEP;
    }

    const deltaX = playerX - botX;
    const deltaZ = playerZ - botZ;
    const distanceSq = deltaX * deltaX + deltaZ * deltaZ;
    if (!Number.isFinite(distanceSq)) {
        return BOT_SIM_MID_STEP;
    }
    if (distanceSq <= BOT_SIM_NEAR_DISTANCE * BOT_SIM_NEAR_DISTANCE) {
        return BOT_SIM_NEAR_STEP;
    }
    if (distanceSq <= BOT_SIM_MID_DISTANCE * BOT_SIM_MID_DISTANCE) {
        return BOT_SIM_MID_STEP;
    }
    return BOT_SIM_FAR_STEP;
}

function applyCollisionImpulseToBot(bot, contact) {
    const normalX = contact?.normalX || 0;
    const normalZ = contact?.normalZ || 0;
    const impactSpeed = Math.max(0, contact?.impactSpeed || 0);
    const penetration = Math.max(0, contact?.penetration || 0);
    if (impactSpeed <= 0.001 && penetration <= 0.001) {
        return;
    }

    bot.car.position.x -= normalX * penetration * BOT_COLLISION_POSITION_SHARE;
    bot.car.position.z -= normalZ * penetration * BOT_COLLISION_POSITION_SHARE;

    // Vehicle normal points from bot to player. Bot must be pushed opposite to it.
    bot.state.velocity.x -= normalX * impactSpeed * 0.56;
    bot.state.velocity.y -= normalZ * impactSpeed * 0.56;
    bot.state.velocity.multiplyScalar(BOT_COLLISION_SPEED_DAMPING);

    const velocityMag = bot.state.velocity.length();
    bot.state.speed = Math.min(BOT_MAX_SPEED * 1.05, velocityMag);

    const forwardX = -Math.sin(bot.car.rotation.y);
    const forwardZ = -Math.cos(bot.car.rotation.y);
    const sideFactor = forwardX * normalZ - forwardZ * normalX;
    const yawKick = THREE.MathUtils.clamp(impactSpeed / 28, 0, 1) * 0.34;
    bot.car.rotation.y -= sideFactor * yawKick;
    bot.state.acceleration = -impactSpeed * 4.2;
    applyBotCollisionDamage(bot, contact);
}

function createEmptyBotDamageState() {
    return {
        wheelLossCount: 0,
        leftLoss: 0,
        rightLoss: 0,
        frontLoss: 0,
        rearLoss: 0,
        suspensionLoss: 0,
    };
}

function initializeBotPartBaselines(bot) {
    bot.bodyPartBaselines.clear();
    for (let i = 0; i < bot.crashParts.length; i += 1) {
        const part = bot.crashParts[i];
        if (part?.type !== 'body_panel' || !part.source) {
            continue;
        }
        bot.bodyPartBaselines.set(part.id, {
            position: part.source.position.clone(),
            rotation: part.source.rotation.clone(),
            scale: part.source.scale.clone(),
        });
    }
}

function getBotDamageDynamics(damageState) {
    const sideImbalance = damageState.rightLoss - damageState.leftLoss;
    const axleImbalance = damageState.frontLoss - damageState.rearLoss;
    return {
        speedScale: THREE.MathUtils.clamp(
            1 - damageState.wheelLossCount * 0.14 - damageState.suspensionLoss * 0.08,
            0.42,
            1
        ),
        steerAuthority: THREE.MathUtils.clamp(
            1 - damageState.wheelLossCount * 0.16 - damageState.suspensionLoss * 0.08,
            0.5,
            1
        ),
        steerRange: THREE.MathUtils.clamp(
            1 - damageState.wheelLossCount * 0.17 - damageState.suspensionLoss * 0.09,
            0.52,
            1
        ),
        yawBias: THREE.MathUtils.clamp(sideImbalance * 0.82 + axleImbalance * 0.18, -2.6, 2.6),
        dragPenalty: damageState.wheelLossCount * 0.28 + damageState.suspensionLoss * 0.1,
    };
}

function applyBotCollisionDamage(bot, contact) {
    if (isBotSpawnProtected(bot)) {
        return;
    }
    const impactSpeed = Math.max(0, contact?.impactSpeed || 0);
    if (impactSpeed < BOT_DAMAGE_COLLISION_MIN) {
        return;
    }
    const nowMs =
        typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    if (impactSpeed < BOT_WHEEL_DETACH_SPEED && nowMs - bot.lastDamageAtMs < 180) {
        return;
    }
    bot.lastDamageAtMs = nowMs;

    const hitInfo = resolveBotHitInfo(bot, contact);
    const crashContext = buildBotCrashContext(bot, contact, hitInfo);
    applyBotPersistentHandlingDamage(bot, hitInfo, impactSpeed);
    addBotDentFromImpact(bot, hitInfo, impactSpeed);

    if (impactSpeed >= BOT_WHEEL_DETACH_SPEED) {
        tryDetachBotPart(
            bot,
            (part) =>
                part.type === 'wheel' &&
                part.side === hitInfo.hitSide &&
                part.zone === hitInfo.hitZone,
            crashContext
        );
        tryDetachBotPart(
            bot,
            (part) =>
                part.type === 'suspension_link' &&
                part.side === hitInfo.hitSide &&
                part.zone === hitInfo.hitZone,
            crashContext
        );
    }

    if (impactSpeed >= BOT_SECOND_WHEEL_DETACH_SPEED) {
        const oppositeZone = hitInfo.hitZone === 'front' ? 'rear' : 'front';
        tryDetachBotPart(
            bot,
            (part) =>
                part.type === 'wheel' &&
                part.side === hitInfo.hitSide &&
                part.zone === oppositeZone,
            crashContext
        );
    }

    if (isBotTotaled(bot)) {
        destroyBot(bot);
    }
}

function resolveBotHitInfo(bot, contact) {
    const normalX = contact?.normalX || 0;
    const normalZ = contact?.normalZ || 0;
    const hitPosition = new THREE.Vector3(
        bot.car.position.x + normalX * BOT_RADIUS * 0.88,
        bot.car.position.y,
        bot.car.position.z + normalZ * BOT_RADIUS * 0.88
    );
    const localHit = hitPosition.clone();
    bot.car.worldToLocal(localHit);

    const rightX = Math.cos(bot.car.rotation.y);
    const rightZ = -Math.sin(bot.car.rotation.y);
    const forwardX = -Math.sin(bot.car.rotation.y);
    const forwardZ = -Math.cos(bot.car.rotation.y);
    const sideFallback = normalX * rightX + normalZ * rightZ >= 0 ? 'right' : 'left';
    const zoneFallback = normalX * forwardX + normalZ * forwardZ >= 0 ? 'front' : 'rear';

    const hitSide =
        Math.abs(localHit.x) > 0.08 ? (localHit.x < 0 ? 'left' : 'right') : sideFallback;
    const hitZone =
        Math.abs(localHit.z) > 0.12 ? (localHit.z < 0 ? 'front' : 'rear') : zoneFallback;

    return { hitSide, hitZone };
}

function buildBotCrashContext(bot, contact, hitInfo) {
    const carForward = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(bot.car.quaternion)
        .setY(0)
        .normalize();
    const carRight = new THREE.Vector3(1, 0, 0)
        .applyQuaternion(bot.car.quaternion)
        .setY(0)
        .normalize();
    const hitDirection = new THREE.Vector3(contact?.normalX || 0, 0, contact?.normalZ || 0);
    if (hitDirection.lengthSq() < 0.0001) {
        hitDirection.copy(carForward);
    } else {
        hitDirection.normalize();
    }
    const impactNormal = hitDirection.clone().multiplyScalar(-1);

    const impactSpeed = Math.max(0, contact?.impactSpeed || 0);
    const impactNorm = THREE.MathUtils.clamp(
        (impactSpeed - BOT_DAMAGE_COLLISION_MIN) /
            (BOT_DAMAGE_COLLISION_HIGH - BOT_DAMAGE_COLLISION_MIN),
        0,
        1
    );
    const frontalImpact = THREE.MathUtils.clamp(-impactNormal.dot(carForward), 0, 1);

    const impactVelocity = new THREE.Vector3(
        bot.state.velocity.x || 0,
        0,
        bot.state.velocity.y || 0
    );
    if (impactVelocity.lengthSq() < 0.04) {
        impactVelocity.copy(carForward).multiplyScalar(impactSpeed * 0.62);
    }
    const impactTravelDirection =
        impactVelocity.lengthSq() > 0.0001
            ? impactVelocity.clone().normalize()
            : carForward.clone();
    const impactTravelSpeed = Math.max(impactVelocity.length(), impactSpeed * 0.58);

    return {
        origin: bot.car.position.clone(),
        hitDirection,
        impactNormal,
        carForward,
        carRight,
        hitSide: hitInfo.hitSide,
        hitZone: hitInfo.hitZone,
        crashIntensity: 0.35 + impactNorm * 0.65,
        frontalImpact,
        impactSpeed,
        impactTravelDirection,
        impactTravelSpeed,
        obstacleCategory: contact?.obstacleCategory || 'vehicle',
        isObstacleCollision: true,
    };
}

function applyBotPersistentHandlingDamage(bot, hitInfo, impactSpeed) {
    const damageNorm = THREE.MathUtils.clamp(
        (impactSpeed - BOT_DAMAGE_COLLISION_MIN) /
            (BOT_WHEEL_DETACH_SPEED - BOT_DAMAGE_COLLISION_MIN),
        0,
        1.25
    );
    if (damageNorm <= 0.02) {
        return;
    }

    const localGain = damageNorm * 0.3;
    const zoneGain = damageNorm * 0.24;
    const suspensionGain = damageNorm * 0.19;

    if (hitInfo.hitSide === 'left') {
        bot.damageState.leftLoss += localGain;
    } else {
        bot.damageState.rightLoss += localGain;
    }

    if (hitInfo.hitZone === 'front') {
        bot.damageState.frontLoss += zoneGain;
    } else {
        bot.damageState.rearLoss += zoneGain;
    }

    bot.damageState.suspensionLoss += suspensionGain;
    clampBotDamageState(bot.damageState);
}

function addBotDentFromImpact(bot, hitInfo, impactSpeed) {
    const dentNorm = THREE.MathUtils.clamp(
        (impactSpeed - BOT_DAMAGE_COLLISION_MIN) /
            (BOT_DAMAGE_COLLISION_HIGH - BOT_DAMAGE_COLLISION_MIN),
        0,
        1.2
    );
    if (dentNorm <= 0.03) {
        return;
    }

    const dentGain = dentNorm * 0.26;
    if (hitInfo.hitSide === 'left') {
        bot.bodyDamageVisual.left = THREE.MathUtils.clamp(
            bot.bodyDamageVisual.left + dentGain,
            0,
            BOT_DENT_MAX
        );
    } else {
        bot.bodyDamageVisual.right = THREE.MathUtils.clamp(
            bot.bodyDamageVisual.right + dentGain,
            0,
            BOT_DENT_MAX
        );
    }

    if (hitInfo.hitZone === 'front') {
        bot.bodyDamageVisual.front = THREE.MathUtils.clamp(
            bot.bodyDamageVisual.front + dentGain * 0.9,
            0,
            BOT_DENT_MAX
        );
    } else {
        bot.bodyDamageVisual.rear = THREE.MathUtils.clamp(
            bot.bodyDamageVisual.rear + dentGain * 0.9,
            0,
            BOT_DENT_MAX
        );
    }

    applyBotDentVisuals(bot);
}

function applyBotDentVisuals(bot) {
    const sideMagnitude = THREE.MathUtils.clamp(
        (bot.bodyDamageVisual.left + bot.bodyDamageVisual.right) * 0.26,
        0,
        0.32
    );
    const sideBias = THREE.MathUtils.clamp(
        bot.bodyDamageVisual.right - bot.bodyDamageVisual.left,
        -1.4,
        1.4
    );
    const zoneMagnitude = THREE.MathUtils.clamp(
        (bot.bodyDamageVisual.front + bot.bodyDamageVisual.rear) * 0.23,
        0,
        0.3
    );
    const zoneBias = THREE.MathUtils.clamp(
        bot.bodyDamageVisual.rear - bot.bodyDamageVisual.front,
        -1.4,
        1.4
    );

    for (let i = 0; i < bot.crashParts.length; i += 1) {
        const part = bot.crashParts[i];
        if (part?.type !== 'body_panel' || !part.source) {
            continue;
        }
        const base = bot.bodyPartBaselines.get(part.id);
        if (!base) {
            continue;
        }

        part.source.scale.set(
            base.scale.x * (1 - sideMagnitude * 0.2),
            base.scale.y * (1 - (sideMagnitude + zoneMagnitude) * 0.08),
            base.scale.z * (1 - zoneMagnitude * 0.24)
        );
        part.source.rotation.set(
            base.rotation.x + zoneBias * 0.045,
            base.rotation.y,
            base.rotation.z + sideBias * 0.065
        );
        part.source.position.set(
            base.position.x - sideBias * 0.04,
            base.position.y - (sideMagnitude + zoneMagnitude) * 0.028,
            base.position.z + zoneBias * 0.036
        );
    }
}

function tryDetachBotPart(bot, predicate, crashContext = null) {
    const part = bot.crashParts.find(
        (candidate) =>
            candidate?.source && !bot.detachedPartIds.has(candidate.id) && predicate(candidate)
    );
    if (!part) {
        return false;
    }
    detachBotPart(bot, part, crashContext);
    return true;
}

function detachBotPart(bot, part, crashContext = null) {
    if (!part?.source || bot.detachedPartIds.has(part.id)) {
        return false;
    }
    bot.detachedPartIds.add(part.id);
    if (bot.onPartDetached) {
        try {
            bot.onPartDetached({ bot, part, crashContext });
        } catch (error) {
            // Keep bot damage flow alive even if optional visual callback fails.
            console.error('Bot part detached callback failed:', error);
        }
    }
    part.source.visible = false;
    registerDetachedBotPartDamage(bot, part);
    return true;
}

function registerDetachedBotPartDamage(bot, part) {
    if (part.type === 'wheel') {
        bot.damageState.wheelLossCount += 1;
    } else if (part.type === 'suspension_link') {
        bot.damageState.suspensionLoss += 1;
    }

    if (part.side === 'left') {
        bot.damageState.leftLoss += 1;
    } else if (part.side === 'right') {
        bot.damageState.rightLoss += 1;
    }

    if (part.zone === 'front') {
        bot.damageState.frontLoss += 1;
    } else if (part.zone === 'rear') {
        bot.damageState.rearLoss += 1;
    }

    clampBotDamageState(bot.damageState);
}

function clampBotDamageState(damageState) {
    damageState.wheelLossCount = THREE.MathUtils.clamp(damageState.wheelLossCount, 0, 4);
    damageState.leftLoss = THREE.MathUtils.clamp(damageState.leftLoss, 0, 6);
    damageState.rightLoss = THREE.MathUtils.clamp(damageState.rightLoss, 0, 6);
    damageState.frontLoss = THREE.MathUtils.clamp(damageState.frontLoss, 0, 6);
    damageState.rearLoss = THREE.MathUtils.clamp(damageState.rearLoss, 0, 6);
    damageState.suspensionLoss = THREE.MathUtils.clamp(damageState.suspensionLoss, 0, 4);
}

function isBotTotaled(bot) {
    if (bot.damageState.wheelLossCount >= 3) {
        return true;
    }
    const damageScore =
        bot.damageState.wheelLossCount * 1.55 +
        bot.damageState.suspensionLoss * 1.1 +
        Math.max(bot.damageState.leftLoss, bot.damageState.rightLoss) * 0.35 +
        Math.max(bot.damageState.frontLoss, bot.damageState.rearLoss) * 0.25;
    return damageScore >= BOT_TOTAL_BREAK_SCORE;
}

function destroyBot(bot) {
    if (bot.destroyed) {
        return;
    }
    const nowMs = Date.now();
    bot.destroyed = true;
    bot.livesRemaining = Math.max(0, (Number(bot.livesRemaining) || 0) - 1);
    bot.respawnAtMs =
        bot.livesRemaining > 0
            ? nowMs + randomRange(BOT_RESPAWN_DELAY_MIN_MS, BOT_RESPAWN_DELAY_MAX_MS)
            : 0;
    bot.spawnProtectionEndsAtMs = 0;
    bot.state.speed = 0;
    bot.state.acceleration = 0;
    bot.state.throttle = 0;
    bot.state.brake = 0;
    bot.state.yawRate = 0;
    bot.state.burnout = 0;
    bot.state.velocity.set(0, 0);
    bot.drift.active = false;
    bot.drift.timer = 0;
    bot.drift.direction = 0;
    bot.drift.intensity = 0;
    bot.car.visible = false;
    if (bot.indicator?.root) {
        bot.indicator.root.visible = false;
    }
    if (typeof bot.onDestroyed === 'function') {
        try {
            bot.onDestroyed({
                collectorId: bot.collectorId,
                name: bot.name,
                livesRemaining: bot.livesRemaining,
                respawnAtMs: bot.respawnAtMs,
                position: bot.car.position,
                occurredAtMs: nowMs,
            });
        } catch (error) {
            console.error('Bot destroyed callback failed:', error);
        }
    }
}

function isBotSpawnProtected(bot, nowMs = Date.now()) {
    if (!bot || bot.destroyed) {
        return false;
    }
    return Number(bot.spawnProtectionEndsAtMs) > nowMs;
}

function createBotIndicator(name, colorHex) {
    const root = new THREE.Group();
    root.position.y = BOT_INDICATOR_HEIGHT;

    const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.12, 1.9, 14, 1, true),
        new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.22,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        })
    );
    beam.position.y = 0.94;
    root.add(beam);

    const marker = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: createBotMarkerTexture(colorHex),
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
        })
    );
    marker.position.y = 1.92;
    marker.scale.set(0.78, 0.78, 1);
    root.add(marker);

    const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: createBotLabelTexture(name, colorHex),
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
            toneMapped: false,
        })
    );
    label.position.y = 2.34;
    label.scale.set(1.62, 0.42, 1);
    root.add(label);

    return {
        root,
        beam,
        marker,
        label,
        phase: Math.random() * Math.PI * 2,
    };
}

function updateBotIndicator(bot, dt) {
    const indicator = bot.indicator;
    if (!indicator?.root || !indicator.root.visible) {
        return;
    }

    indicator.phase += dt * BOT_INDICATOR_PULSE_SPEED;
    const pulse = 0.5 + 0.5 * Math.sin(indicator.phase);
    const bob = Math.sin(indicator.phase * BOT_INDICATOR_BOB_SPEED) * BOT_INDICATOR_BOB_AMPLITUDE;

    indicator.root.position.y = BOT_INDICATOR_HEIGHT + bob;
    indicator.beam.material.opacity = 0.12 + pulse * 0.2;
    indicator.marker.material.opacity = 0.72 + pulse * 0.28;
    indicator.label.material.opacity = 0.72 + pulse * 0.22;

    const markerScale = 0.66 + pulse * 0.26;
    indicator.marker.scale.set(markerScale, markerScale, 1);
}

function createBotMarkerTexture(colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    const baseRadius = canvas.width * 0.36;

    const hex = `#${(colorHex >>> 0).toString(16).padStart(6, '0')}`;
    const gradient = ctx.createRadialGradient(cx, cy, baseRadius * 0.05, cx, cy, baseRadius * 1.15);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.28, 'rgba(230,245,255,0.96)');
    gradient.addColorStop(0.62, hexToRgba(colorHex, 0.87));
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 1.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(240, 252, 255, 0.92)';
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 0.62, 0, Math.PI * 2);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function createBotLabelTexture(name, colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');

    const hex = `#${(colorHex >>> 0).toString(16).padStart(6, '0')}`;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(7, 14, 25, 0.72)';
    ctx.fillRect(56, 42, canvas.width - 112, 96);

    ctx.strokeStyle = hexToRgba(colorHex, 0.87);
    ctx.lineWidth = 4;
    ctx.strokeRect(56, 42, canvas.width - 112, 96);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "900 74px 'Trebuchet MS', 'Arial Black', sans-serif";
    ctx.fillStyle = '#ecf9ff';
    ctx.shadowColor = hex;
    ctx.shadowBlur = 18;
    ctx.fillText(name, canvas.width * 0.5, canvas.height * 0.52);
    ctx.shadowBlur = 0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function hexToRgba(colorHex, alpha = 1) {
    const r = (colorHex >> 16) & 255;
    const g = (colorHex >> 8) & 255;
    const b = colorHex & 255;
    return `rgba(${r}, ${g}, ${b}, ${THREE.MathUtils.clamp(alpha, 0, 1)})`;
}

function findNearestPickup(position, pickups, buildingObstacles = null) {
    let nearest = null;
    let nearestDistanceSq = Infinity;
    let blockedNearest = null;
    let blockedDistanceSq = Infinity;

    for (let i = 0; i < pickups.length; i += 1) {
        const pickup = pickups[i];
        const dx = pickup.x - position.x;
        const dz = pickup.z - position.z;
        const distanceSq = dx * dx + dz * dz;
        if (
            Array.isArray(buildingObstacles) &&
            buildingObstacles.length > 0 &&
            isLineBlockedByBuildings(
                position.x,
                position.z,
                pickup.x,
                pickup.z,
                buildingObstacles,
                BOT_LOS_BUILDING_PADDING
            )
        ) {
            if (distanceSq < blockedDistanceSq) {
                blockedDistanceSq = distanceSq;
                blockedNearest = pickup;
            }
            continue;
        }
        if (distanceSq < nearestDistanceSq) {
            nearestDistanceSq = distanceSq;
            nearest = pickup;
        }
    }

    return nearest || blockedNearest;
}

function isLineBlockedByBuildings(ax, az, bx, bz, buildingObstacles, padding = 0) {
    for (let i = 0; i < buildingObstacles.length; i += 1) {
        const obstacle = buildingObstacles[i];
        const hit = segmentIntersectsAabb2D(
            ax,
            az,
            bx,
            bz,
            obstacle.minX - padding,
            obstacle.maxX + padding,
            obstacle.minZ - padding,
            obstacle.maxZ + padding
        );
        if (hit) {
            return true;
        }
    }

    return false;
}

function findSpawnPoint(botIndex, worldBounds, staticObstacles, existingBots) {
    const areaX = worldBounds.maxX - worldBounds.minX;
    const areaZ = worldBounds.maxZ - worldBounds.minZ;

    for (let attempt = 0; attempt < 120; attempt += 1) {
        const seed = botIndex * 311 + attempt * 37 + 1;
        const x = worldBounds.minX + randomUnit(seed) * areaX;
        const z = worldBounds.minZ + randomUnit(seed + 97) * areaZ;
        if (isInsideObstacle(x, z, staticObstacles, 2.4)) {
            continue;
        }

        let tooClose = false;
        for (let i = 0; i < existingBots.length; i += 1) {
            const other = existingBots[i];
            const distanceSq = distanceSqXY(x, z, other.car.position.x, other.car.position.z);
            if (distanceSq < BOT_SPAWN_CLEARANCE * BOT_SPAWN_CLEARANCE) {
                tooClose = true;
                break;
            }
        }
        if (tooClose) {
            continue;
        }

        return {
            x,
            z,
            rotationY: randomUnit(seed + 211) * Math.PI * 2,
        };
    }

    return {
        x: worldBounds.minX + (botIndex + 1) * 8,
        z: worldBounds.minZ + (botIndex + 1) * 8,
        rotationY: (botIndex / Math.max(1, BOT_NAMES.length)) * Math.PI * 2,
    };
}

function pickWanderTarget(worldBounds, cityMapLayout) {
    const xLines = Array.isArray(cityMapLayout?.roadAxisLinesX) ? cityMapLayout.roadAxisLinesX : [];
    const zLines = Array.isArray(cityMapLayout?.roadAxisLinesZ) ? cityMapLayout.roadAxisLinesZ : [];

    if (xLines.length > 0 && zLines.length > 0) {
        const xLine = xLines[Math.floor(Math.random() * xLines.length)];
        const zLine = zLines[Math.floor(Math.random() * zLines.length)];
        const baseX = Number.isFinite(xLine?.coord) ? xLine.coord : 0;
        const baseZ = Number.isFinite(zLine?.coord) ? zLine.coord : 0;
        const roadWidthX = Math.max(0, Number(xLine?.roadWidth) || 0);
        const roadWidthZ = Math.max(0, Number(zLine?.roadWidth) || 0);
        const jitterX = (Math.random() - 0.5) * Math.min(roadWidthX * 0.6, 6);
        const jitterZ = (Math.random() - 0.5) * Math.min(roadWidthZ * 0.6, 6);
        return clampPointToWorld({ x: baseX + jitterX, z: baseZ + jitterZ }, worldBounds);
    }

    const margin = 12;
    return {
        x: THREE.MathUtils.lerp(
            worldBounds.minX + margin,
            worldBounds.maxX - margin,
            Math.random()
        ),
        z: THREE.MathUtils.lerp(
            worldBounds.minZ + margin,
            worldBounds.maxZ - margin,
            Math.random()
        ),
    };
}

function addBoundaryAvoidance(outVec, position, worldBounds) {
    const margin = 24;

    if (position.x < worldBounds.minX + margin) {
        outVec.x += (worldBounds.minX + margin - position.x) / margin;
    } else if (position.x > worldBounds.maxX - margin) {
        outVec.x -= (position.x - (worldBounds.maxX - margin)) / margin;
    }

    if (position.z < worldBounds.minZ + margin) {
        outVec.y += (worldBounds.minZ + margin - position.z) / margin;
    } else if (position.z > worldBounds.maxZ - margin) {
        outVec.y -= (position.z - (worldBounds.maxZ - margin)) / margin;
    }
}

function addObstacleAvoidance(outVec, position, staticObstacles) {
    for (let i = 0; i < staticObstacles.length; i += 1) {
        const obstacle = staticObstacles[i];

        if (obstacle.type === 'circle') {
            scratch2.set(position.x - obstacle.x, position.z - obstacle.z);
            const safeRadius = obstacle.radius + 5;
            const distanceSq = scratch2.lengthSq();
            if (distanceSq > safeRadius * safeRadius || distanceSq < 0.0001) {
                continue;
            }
            const distance = Math.sqrt(distanceSq);
            const force = (safeRadius - distance) / safeRadius;
            outVec.addScaledVector(scratch2.multiplyScalar(1 / distance), force * 1.8);
            continue;
        }

        if (obstacle.type !== 'aabb') {
            continue;
        }

        const closestX = THREE.MathUtils.clamp(position.x, obstacle.minX, obstacle.maxX);
        const closestZ = THREE.MathUtils.clamp(position.z, obstacle.minZ, obstacle.maxZ);
        scratch2.set(position.x - closestX, position.z - closestZ);
        const distanceSq = scratch2.lengthSq();
        const isBuilding = obstacle.category === 'building';
        const safeRadius = isBuilding ? BOT_BUILDING_AVOID_RADIUS : 4.8;
        if (distanceSq > safeRadius * safeRadius || distanceSq < 0.0001) {
            continue;
        }

        const distance = Math.sqrt(distanceSq);
        const force = (safeRadius - distance) / safeRadius;
        const strength = isBuilding ? BOT_BUILDING_AVOID_FORCE : 1.6;
        outVec.addScaledVector(scratch2.multiplyScalar(1 / distance), force * strength);
    }
}

function addEntityAvoidance(outVec, position, entityPosition, radius, strength) {
    const dx = position.x - entityPosition.x;
    const dz = position.z - entityPosition.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > radius * radius || distanceSq < 0.0001) {
        return;
    }

    const distance = Math.sqrt(distanceSq);
    const force = (radius - distance) / radius;
    outVec.x += (dx / distance) * force * strength;
    outVec.y += (dz / distance) * force * strength;
}

function updateStuckState(bot, target, dt) {
    if (!bot || !target || dt <= 0) {
        return;
    }

    if (bot.recoveryTimer > 0) {
        bot.recoveryTimer = Math.max(0, bot.recoveryTimer - dt);
    }

    const distSq = distanceSqXY(bot.car.position.x, bot.car.position.z, target.x, target.z);
    const targetKey = buildTargetKey(target);
    if (bot.stuckTargetKey !== targetKey) {
        bot.stuckTargetKey = targetKey;
        bot.bestTargetDistanceSq = distSq;
        bot.stuckTimer = 0;
        return;
    }
    const progressSq = BOT_STUCK_PROGRESS_EPSILON * BOT_STUCK_PROGRESS_EPSILON;
    if (
        !Number.isFinite(bot.bestTargetDistanceSq) ||
        distSq + progressSq < bot.bestTargetDistanceSq
    ) {
        bot.bestTargetDistanceSq = distSq;
        bot.stuckTimer = Math.max(0, bot.stuckTimer - dt * 1.8);
    }

    if (distSq <= BOT_ROAD_TARGET_REACH * BOT_ROAD_TARGET_REACH) {
        bot.bestTargetDistanceSq = distSq;
        bot.stuckTimer = 0;
        return;
    }

    const lowSpeed = Math.abs(bot.state.speed) <= BOT_STUCK_MIN_SPEED;
    if (lowSpeed) {
        bot.stuckTimer += dt;
    } else {
        bot.stuckTimer = Math.max(0, bot.stuckTimer - dt * 0.72);
    }
    if (bot.stuckTimer < BOT_STUCK_REPLAN_TIME) {
        return;
    }

    bot.stuckTimer = 0;
    bot.forcePathReplan = true;
    bot.roadPath = null;
    bot.roadTarget = null;
    bot.roadPathIndex = 0;
    bot.roadPathKey = null;
    bot.detourTarget = null;
    bot.bestTargetDistanceSq = distSq;
    bot.recoveryTimer = BOT_STUCK_RECOVERY_TIME;
    bot.recoverySteerSign = Math.random() < 0.5 ? -1 : 1;
}

function resolveRoadTarget(
    bot,
    target,
    worldBounds,
    cityMapLayout,
    staticObstacles,
    navigationPlanner,
    dt = 0
) {
    if (BOT_REACTIVE_NAVIGATION_ONLY) {
        if (bot) {
            bot.roadTarget = null;
            bot.roadPath = null;
            bot.roadPathIndex = 0;
            bot.roadPathKey = null;
            bot.roadPathBuildCooldown = 0;
            bot.forcePathReplan = false;
        }
        return null;
    }

    if (!bot || !target) {
        if (bot) {
            bot.roadTarget = null;
            bot.roadPath = null;
            bot.roadPathIndex = 0;
            bot.roadPathKey = null;
            bot.roadPathBuildCooldown = 0;
            bot.forcePathReplan = false;
        }
        return null;
    }

    bot.roadPathBuildCooldown = Math.max(0, (bot.roadPathBuildCooldown || 0) - dt);
    const targetKey = buildTargetKey(target);
    const targetChanged = bot.roadPathKey !== targetKey;
    const pathMissing = !Array.isArray(bot.roadPath) || bot.roadPath.length === 0;
    const canBuildPath = bot.roadPathBuildCooldown <= 0 || targetChanged;
    if ((targetChanged || bot.forcePathReplan || pathMissing) && canBuildPath) {
        const mayBuildPath = navigationPlanner?.tryConsumePathBuildToken?.() ?? true;
        if (!mayBuildPath) {
            bot.roadPathBuildCooldown = Math.max(
                bot.roadPathBuildCooldown,
                BOT_PATH_REPLAN_COOLDOWN * 0.22
            );
        } else {
            bot.roadPath = buildRoadPath(
                bot.car.position,
                target,
                worldBounds,
                cityMapLayout,
                staticObstacles,
                navigationPlanner
            );
            bot.roadPathIndex = 0;
            bot.roadPathKey = targetKey;
            bot.roadPathBuildCooldown = BOT_PATH_REPLAN_COOLDOWN;
            bot.forcePathReplan = false;
        }
    }

    if (!bot.roadPath || bot.roadPath.length === 0) {
        bot.roadTarget = null;
        return null;
    }

    while (bot.roadPathIndex < bot.roadPath.length) {
        const waypoint = bot.roadPath[bot.roadPathIndex];
        const distSq = distanceSqXY(bot.car.position.x, bot.car.position.z, waypoint.x, waypoint.z);
        if (distSq > BOT_ROAD_TARGET_REACH * BOT_ROAD_TARGET_REACH) {
            bot.roadTarget = waypoint;
            return waypoint;
        }
        bot.roadPathIndex += 1;
    }

    bot.roadTarget = null;
    bot.roadPath = null;
    bot.roadPathIndex = 0;
    bot.roadPathKey = null;
    return null;
}

function buildRoadPath(
    position,
    target,
    worldBounds,
    cityMapLayout,
    staticObstacles,
    navigationPlanner
) {
    const obstacleAwarePath = buildObstacleAwarePath(
        position,
        target,
        worldBounds,
        staticObstacles,
        navigationPlanner
    );
    if (obstacleAwarePath && obstacleAwarePath.length > 0) {
        return obstacleAwarePath;
    }
    return buildAxisRoadPath(position, target, worldBounds, cityMapLayout);
}

function buildObstacleAwarePath(position, target, worldBounds, staticObstacles, navigationPlanner) {
    const planner =
        navigationPlanner && navigationPlanner.worldBounds === worldBounds
            ? navigationPlanner
            : createNavigationPlanner(worldBounds, staticObstacles);
    if (!planner) {
        return null;
    }

    const cellPath = planner.findCellPath(position, target);
    if (!cellPath || cellPath.length === 0) {
        return null;
    }

    const smoothed = smoothWaypointPath(
        [{ x: position.x, z: position.z }, ...cellPath, { x: target.x, z: target.z }],
        planner.obstaclesForSmoothing,
        BOT_NAV_OBSTACLE_PADDING
    );
    if (smoothed.length <= 1) {
        return null;
    }

    const waypoints = smoothed.slice(1).map((point) => clampPointToWorld(point, worldBounds));
    const finalTarget = clampPointToWorld(target, worldBounds);
    if (
        waypoints.length === 0 ||
        distanceSqXY(
            waypoints[waypoints.length - 1].x,
            waypoints[waypoints.length - 1].z,
            finalTarget.x,
            finalTarget.z
        ) > 0.16
    ) {
        waypoints.push(finalTarget);
    } else {
        waypoints[waypoints.length - 1] = finalTarget;
    }

    return dedupeWaypoints(waypoints);
}

function createNavigationPlanner(worldBounds, staticObstacles) {
    if (!worldBounds || !Array.isArray(staticObstacles) || staticObstacles.length === 0) {
        return null;
    }

    const cellSize = BOT_NAV_CELL_SIZE;
    const minCellX = Math.ceil((worldBounds.minX + 2) / cellSize);
    const maxCellX = Math.floor((worldBounds.maxX - 2) / cellSize);
    const minCellZ = Math.ceil((worldBounds.minZ + 2) / cellSize);
    const maxCellZ = Math.floor((worldBounds.maxZ - 2) / cellSize);
    if (minCellX > maxCellX || minCellZ > maxCellZ) {
        return null;
    }

    const width = maxCellX - minCellX + 1;
    const height = maxCellZ - minCellZ + 1;
    const cellCount = width * height;
    if (cellCount <= 0) {
        return null;
    }

    const walkable = new Uint8Array(cellCount);
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
            const index = (cellZ - minCellZ) * width + (cellX - minCellX);
            const worldX = cellX * cellSize;
            const worldZ = cellZ * cellSize;
            walkable[index] = isInsideObstacle(
                worldX,
                worldZ,
                staticObstacles,
                BOT_NAV_OBSTACLE_PADDING
            )
                ? 0
                : 1;
        }
    }

    const buildingObstacles = [];
    for (let i = 0; i < staticObstacles.length; i += 1) {
        const obstacle = staticObstacles[i];
        if (obstacle?.type === 'aabb' && obstacle.category === 'building') {
            buildingObstacles.push(obstacle);
        }
    }

    const pathCache = new Map();
    let cacheSequence = 0;
    const obstacleGrid = buildObstacleGrid(
        staticObstacles,
        BOT_OBSTACLE_GRID_CELL_SIZE,
        BOT_OBSTACLE_QUERY_RADIUS
    );
    let remainingBuildTokens = BOT_NAV_MAX_BUILDS_PER_FRAME;

    function toIndex(cellX, cellZ) {
        return (cellZ - minCellZ) * width + (cellX - minCellX);
    }

    function inBounds(cellX, cellZ) {
        return cellX >= minCellX && cellX <= maxCellX && cellZ >= minCellZ && cellZ <= maxCellZ;
    }

    function isWalkableCell(cellX, cellZ) {
        if (!inBounds(cellX, cellZ)) {
            return false;
        }
        return walkable[toIndex(cellX, cellZ)] === 1;
    }

    function findCellPath(position, target) {
        const startCell = findNearestWalkableCell(
            Math.round(position.x / cellSize),
            Math.round(position.z / cellSize),
            {
                minCellX,
                maxCellX,
                minCellZ,
                maxCellZ,
                isWalkableCell,
            }
        );
        const targetCell = findNearestWalkableCell(
            Math.round(target.x / cellSize),
            Math.round(target.z / cellSize),
            {
                minCellX,
                maxCellX,
                minCellZ,
                maxCellZ,
                isWalkableCell,
            }
        );
        if (!startCell || !targetCell) {
            return null;
        }
        if (startCell.x === targetCell.x && startCell.z === targetCell.z) {
            return [clampPointToWorld(target, worldBounds)];
        }

        const cacheKey = `${startCell.x}:${startCell.z}->${targetCell.x}:${targetCell.z}`;
        const cached = pathCache.get(cacheKey);
        if (cached) {
            cached.usedAt = ++cacheSequence;
            return cached.points.map((point) => ({ x: point.x, z: point.z }));
        }

        const startIndex = toIndex(startCell.x, startCell.z);
        const targetIndex = toIndex(targetCell.x, targetCell.z);
        const openHeap = [];
        const openByIndex = new Map();
        const closed = new Uint8Array(cellCount);

        const startNode = {
            index: startIndex,
            cellX: startCell.x,
            cellZ: startCell.z,
            g: 0,
            f: Math.hypot(targetCell.x - startCell.x, targetCell.z - startCell.z),
            parent: null,
        };
        openByIndex.set(startIndex, startNode);
        heapPushByF(openHeap, startNode);

        let goalNode = null;
        let expansions = 0;

        while (openHeap.length > 0 && expansions < BOT_NAV_MAX_EXPANSIONS) {
            const current = heapPopByF(openHeap);
            if (!current) {
                break;
            }
            if (openByIndex.get(current.index) !== current) {
                continue;
            }

            openByIndex.delete(current.index);
            if (current.index === targetIndex) {
                goalNode = current;
                break;
            }

            closed[current.index] = 1;
            expansions += 1;

            for (let i = 0; i < NAV_NEIGHBOR_OFFSETS.length; i += 1) {
                const offset = NAV_NEIGHBOR_OFFSETS[i];
                const nextCellX = current.cellX + offset.x;
                const nextCellZ = current.cellZ + offset.z;
                if (!isWalkableCell(nextCellX, nextCellZ)) {
                    continue;
                }

                if (offset.x !== 0 && offset.z !== 0) {
                    if (
                        !isWalkableCell(current.cellX + offset.x, current.cellZ) ||
                        !isWalkableCell(current.cellX, current.cellZ + offset.z)
                    ) {
                        continue;
                    }
                }

                const neighborIndex = toIndex(nextCellX, nextCellZ);
                if (closed[neighborIndex]) {
                    continue;
                }

                const tentativeG = current.g + offset.cost;
                const existing = openByIndex.get(neighborIndex);
                if (existing && tentativeG >= existing.g) {
                    continue;
                }

                const heuristic = Math.hypot(targetCell.x - nextCellX, targetCell.z - nextCellZ);
                const node = {
                    index: neighborIndex,
                    cellX: nextCellX,
                    cellZ: nextCellZ,
                    g: tentativeG,
                    f: tentativeG + heuristic,
                    parent: current,
                };
                openByIndex.set(neighborIndex, node);
                heapPushByF(openHeap, node);
            }
        }

        if (!goalNode) {
            return null;
        }

        const points = [];
        let cursor = goalNode;
        while (cursor) {
            points.push({
                x: cursor.cellX * cellSize,
                z: cursor.cellZ * cellSize,
            });
            cursor = cursor.parent;
        }
        points.reverse();
        if (points.length === 0) {
            return null;
        }

        pathCache.set(cacheKey, {
            points,
            usedAt: ++cacheSequence,
        });
        if (pathCache.size > BOT_NAV_PATH_CACHE_LIMIT) {
            evictOldestCachedPath(pathCache);
        }

        return points.map((point) => ({ x: point.x, z: point.z }));
    }

    function beginFrame() {
        remainingBuildTokens = BOT_NAV_MAX_BUILDS_PER_FRAME;
    }

    function tryConsumePathBuildToken() {
        if (remainingBuildTokens <= 0) {
            return false;
        }
        remainingBuildTokens -= 1;
        return true;
    }

    function queryNearbyObstacles(x, z, radius) {
        return queryObstacleGrid(obstacleGrid, x, z, radius);
    }

    return {
        worldBounds,
        obstaclesForSmoothing: staticObstacles,
        buildingObstacles,
        beginFrame,
        tryConsumePathBuildToken,
        queryNearbyObstacles,
        findCellPath,
    };
}

function buildObstacleGrid(obstacles, cellSize, maxRadius) {
    const cells = new Map();
    const querySeen = new Set();
    const queryResult = [];

    for (let i = 0; i < obstacles.length; i += 1) {
        const obstacle = obstacles[i];
        if (!obstacle || typeof obstacle !== 'object') {
            continue;
        }

        let minX;
        let maxX;
        let minZ;
        let maxZ;
        if (obstacle.type === 'circle') {
            const x = Number(obstacle.x);
            const z = Number(obstacle.z);
            const radius = Math.max(0, Number(obstacle.radius) || 0) + maxRadius;
            if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius)) {
                continue;
            }
            minX = x - radius;
            maxX = x + radius;
            minZ = z - radius;
            maxZ = z + radius;
        } else if (obstacle.type === 'aabb') {
            const obstacleMinX = Number(obstacle.minX);
            const obstacleMaxX = Number(obstacle.maxX);
            const obstacleMinZ = Number(obstacle.minZ);
            const obstacleMaxZ = Number(obstacle.maxZ);
            if (![obstacleMinX, obstacleMaxX, obstacleMinZ, obstacleMaxZ].every(Number.isFinite)) {
                continue;
            }
            minX = obstacleMinX - maxRadius;
            maxX = obstacleMaxX + maxRadius;
            minZ = obstacleMinZ - maxRadius;
            maxZ = obstacleMaxZ + maxRadius;
        } else {
            continue;
        }

        const minCellX = Math.floor(minX / cellSize);
        const maxCellX = Math.floor(maxX / cellSize);
        const minCellZ = Math.floor(minZ / cellSize);
        const maxCellZ = Math.floor(maxZ / cellSize);

        for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
            for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
                const key = `${cellX}:${cellZ}`;
                let bucket = cells.get(key);
                if (!bucket) {
                    bucket = [];
                    cells.set(key, bucket);
                }
                bucket.push(obstacle);
            }
        }
    }

    return {
        cellSize,
        cells,
        querySeen,
        queryResult,
        fallback: obstacles,
    };
}

function queryObstacleGrid(grid, x, z, radius) {
    if (!grid || !Number.isFinite(x) || !Number.isFinite(z)) {
        return [];
    }

    const effectiveRadius = Math.max(BOT_RADIUS + 1.2, Number(radius) || 0);
    const minCellX = Math.floor((x - effectiveRadius) / grid.cellSize);
    const maxCellX = Math.floor((x + effectiveRadius) / grid.cellSize);
    const minCellZ = Math.floor((z - effectiveRadius) / grid.cellSize);
    const maxCellZ = Math.floor((z + effectiveRadius) / grid.cellSize);

    const result = grid.queryResult;
    const seen = grid.querySeen;
    result.length = 0;
    seen.clear();

    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
            const bucket = grid.cells.get(`${cellX}:${cellZ}`);
            if (!bucket || bucket.length === 0) {
                continue;
            }
            for (let i = 0; i < bucket.length; i += 1) {
                const obstacle = bucket[i];
                if (seen.has(obstacle)) {
                    continue;
                }
                seen.add(obstacle);
                result.push(obstacle);
            }
        }
    }
    if (result.length === 0) {
        return grid.fallback;
    }
    return result;
}

function findNearestWalkableCell(seedX, seedZ, planner) {
    const clampedSeedX = THREE.MathUtils.clamp(seedX, planner.minCellX, planner.maxCellX);
    const clampedSeedZ = THREE.MathUtils.clamp(seedZ, planner.minCellZ, planner.maxCellZ);
    const maxRadius = Math.max(
        planner.maxCellX - planner.minCellX,
        planner.maxCellZ - planner.minCellZ
    );

    for (let radius = 0; radius <= maxRadius; radius += 1) {
        const startX = Math.max(planner.minCellX, clampedSeedX - radius);
        const endX = Math.min(planner.maxCellX, clampedSeedX + radius);
        const startZ = Math.max(planner.minCellZ, clampedSeedZ - radius);
        const endZ = Math.min(planner.maxCellZ, clampedSeedZ + radius);

        for (let x = startX; x <= endX; x += 1) {
            for (let z = startZ; z <= endZ; z += 1) {
                if (radius > 0 && x > startX && x < endX && z > startZ && z < endZ) {
                    continue;
                }
                if (planner.isWalkableCell(x, z)) {
                    return { x, z };
                }
            }
        }
    }

    return null;
}

function heapPushByF(heap, value) {
    heap.push(value);
    let index = heap.length - 1;
    while (index > 0) {
        const parentIndex = (index - 1) >> 1;
        if (heap[parentIndex].f <= heap[index].f) {
            break;
        }
        const tmp = heap[parentIndex];
        heap[parentIndex] = heap[index];
        heap[index] = tmp;
        index = parentIndex;
    }
}

function heapPopByF(heap) {
    if (heap.length === 0) {
        return null;
    }
    const first = heap[0];
    const tail = heap.pop();
    if (heap.length > 0 && tail) {
        heap[0] = tail;
        let index = 0;
        for (;;) {
            const left = index * 2 + 1;
            const right = left + 1;
            let smallest = index;

            if (left < heap.length && heap[left].f < heap[smallest].f) {
                smallest = left;
            }
            if (right < heap.length && heap[right].f < heap[smallest].f) {
                smallest = right;
            }
            if (smallest === index) {
                break;
            }

            const tmp = heap[index];
            heap[index] = heap[smallest];
            heap[smallest] = tmp;
            index = smallest;
        }
    }
    return first;
}

function evictOldestCachedPath(pathCache) {
    let oldestKey = null;
    let oldestUsedAt = Infinity;
    for (const [key, entry] of pathCache.entries()) {
        if (!entry || entry.usedAt >= oldestUsedAt) {
            continue;
        }
        oldestUsedAt = entry.usedAt;
        oldestKey = key;
    }
    if (oldestKey != null) {
        pathCache.delete(oldestKey);
    }
}

function smoothWaypointPath(points, staticObstacles, obstaclePadding = 0) {
    if (!Array.isArray(points) || points.length <= 2) {
        return Array.isArray(points) ? points.slice() : [];
    }

    const result = [points[0]];
    let anchorIndex = 0;
    let segmentChecks = 0;
    const maxSegmentChecks = 260;
    while (anchorIndex < points.length - 1) {
        let nextIndex = points.length - 1;
        while (nextIndex > anchorIndex + 1) {
            if (segmentChecks >= maxSegmentChecks) {
                nextIndex = anchorIndex + 1;
                break;
            }
            const from = points[anchorIndex];
            const to = points[nextIndex];
            const blocked = isSegmentBlockedByObstacles(
                from.x,
                from.z,
                to.x,
                to.z,
                staticObstacles,
                obstaclePadding
            );
            segmentChecks += 1;
            if (!blocked) {
                break;
            }
            nextIndex -= 1;
        }
        if (nextIndex <= anchorIndex) {
            nextIndex = anchorIndex + 1;
        }
        result.push(points[nextIndex]);
        anchorIndex = nextIndex;
    }

    return result;
}

function isSegmentBlockedByObstacles(ax, az, bx, bz, staticObstacles, padding = 0) {
    if (!Array.isArray(staticObstacles) || staticObstacles.length === 0) {
        return false;
    }

    for (let i = 0; i < staticObstacles.length; i += 1) {
        const obstacle = staticObstacles[i];
        if (!obstacle) {
            continue;
        }

        if (obstacle.type === 'aabb') {
            const hit = segmentIntersectsAabb2D(
                ax,
                az,
                bx,
                bz,
                obstacle.minX - padding,
                obstacle.maxX + padding,
                obstacle.minZ - padding,
                obstacle.maxZ + padding
            );
            if (hit) {
                return true;
            }
            continue;
        }

        if (obstacle.type === 'circle') {
            const radius = Math.max(0, Number(obstacle.radius) || 0) + padding;
            if (
                distanceSqPointToSegment(
                    Number(obstacle.x) || 0,
                    Number(obstacle.z) || 0,
                    ax,
                    az,
                    bx,
                    bz
                ) <=
                radius * radius
            ) {
                return true;
            }
        }
    }

    return false;
}

function distanceSqPointToSegment(px, pz, ax, az, bx, bz) {
    const abx = bx - ax;
    const abz = bz - az;
    const abLenSq = abx * abx + abz * abz;
    if (abLenSq <= 0.0000001) {
        return distanceSqXY(px, pz, ax, az);
    }

    let t = ((px - ax) * abx + (pz - az) * abz) / abLenSq;
    t = THREE.MathUtils.clamp(t, 0, 1);
    const nearestX = ax + abx * t;
    const nearestZ = az + abz * t;
    return distanceSqXY(px, pz, nearestX, nearestZ);
}

function buildAxisRoadPath(position, target, worldBounds, cityMapLayout) {
    const xLines = Array.isArray(cityMapLayout?.roadAxisLinesX) ? cityMapLayout.roadAxisLinesX : [];
    const zLines = Array.isArray(cityMapLayout?.roadAxisLinesZ) ? cityMapLayout.roadAxisLinesZ : [];
    if (xLines.length === 0 || zLines.length === 0) {
        return null;
    }

    const botXLine = findNearestRoadLine(position.x, xLines);
    const botZLine = findNearestRoadLine(position.z, zLines);
    const targetXLine = findNearestRoadLine(target.x, xLines);
    const targetZLine = findNearestRoadLine(target.z, zLines);

    if (!botXLine || !botZLine || !targetXLine || !targetZLine) {
        return null;
    }

    const botOnVertical = isOnRoad(position.x, botXLine, BOT_ROAD_ON_MARGIN);
    const botOnHorizontal = isOnRoad(position.z, botZLine, BOT_ROAD_ON_MARGIN);
    const targetOnVertical = isOnRoad(target.x, targetXLine, BOT_ROAD_TARGET_MARGIN);
    const targetOnHorizontal = isOnRoad(target.z, targetZLine, BOT_ROAD_TARGET_MARGIN);

    const startCandidates = [];
    if (botOnVertical) {
        startCandidates.push({
            orientation: 'vertical',
            coord: botXLine.coord,
            point: { x: botXLine.coord, z: position.z },
            entryDistance: 0,
        });
    }
    if (botOnHorizontal) {
        startCandidates.push({
            orientation: 'horizontal',
            coord: botZLine.coord,
            point: { x: position.x, z: botZLine.coord },
            entryDistance: 0,
        });
    }
    if (startCandidates.length === 0) {
        const preferVertical = botXLine.distance <= botZLine.distance;
        startCandidates.push({
            orientation: preferVertical ? 'vertical' : 'horizontal',
            coord: preferVertical ? botXLine.coord : botZLine.coord,
            point: preferVertical
                ? { x: botXLine.coord, z: position.z }
                : { x: position.x, z: botZLine.coord },
            entryDistance: preferVertical ? botXLine.distance : botZLine.distance,
        });
    }

    const endCandidates = [];
    if (targetOnVertical) {
        endCandidates.push({
            orientation: 'vertical',
            coord: targetXLine.coord,
            point: { x: target.x, z: target.z },
            exitDistance: 0,
        });
    }
    if (targetOnHorizontal) {
        endCandidates.push({
            orientation: 'horizontal',
            coord: targetZLine.coord,
            point: { x: target.x, z: target.z },
            exitDistance: 0,
        });
    }
    if (endCandidates.length === 0) {
        const preferVertical = targetXLine.distance <= targetZLine.distance;
        endCandidates.push({
            orientation: preferVertical ? 'vertical' : 'horizontal',
            coord: preferVertical ? targetXLine.coord : targetZLine.coord,
            point: preferVertical
                ? { x: targetXLine.coord, z: target.z }
                : { x: target.x, z: targetZLine.coord },
            exitDistance: preferVertical ? targetXLine.distance : targetZLine.distance,
        });
    }

    let bestPath = null;
    let bestScore = Infinity;

    for (let i = 0; i < startCandidates.length; i += 1) {
        const start = startCandidates[i];
        for (let j = 0; j < endCandidates.length; j += 1) {
            const end = endCandidates[j];
            const points = [];
            if (start.entryDistance > 0.001) {
                points.push(start.point);
            }

            if (start.orientation !== end.orientation) {
                const intersection =
                    start.orientation === 'vertical'
                        ? { x: start.coord, z: end.coord }
                        : { x: end.coord, z: start.coord };
                points.push(intersection);
            }

            points.push(end.point);

            const cleaned = dedupeWaypoints(points);
            const cost = pathCost(position, cleaned);
            if (cost < bestScore) {
                bestScore = cost;
                bestPath = cleaned;
            }
        }
    }

    if (!bestPath || bestPath.length === 0) {
        return null;
    }

    return bestPath.map((point) => clampPointToWorld(point, worldBounds));
}

function dedupeWaypoints(points) {
    const result = [];
    let last = null;
    for (let i = 0; i < points.length; i += 1) {
        const point = points[i];
        if (!last || distanceSqXY(point.x, point.z, last.x, last.z) > 0.04) {
            result.push(point);
            last = point;
        }
    }
    return result;
}

function pathCost(origin, points) {
    let cost = 0;
    let prev = origin;
    for (let i = 0; i < points.length; i += 1) {
        const point = points[i];
        cost += Math.hypot(point.x - prev.x, point.z - prev.z);
        prev = point;
    }
    return cost;
}

function buildTargetKey(target) {
    const x = Number.isFinite(target?.x) ? Math.round(target.x / BOT_NAV_CELL_SIZE) : 0;
    const z = Number.isFinite(target?.z) ? Math.round(target.z / BOT_NAV_CELL_SIZE) : 0;
    return `${x}:${z}`;
}

function findNearestRoadLine(value, lines) {
    let best = null;
    let bestDist = Infinity;

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const coord = Number(line?.coord);
        if (!Number.isFinite(coord)) {
            continue;
        }
        const dist = Math.abs(value - coord);
        if (dist < bestDist) {
            bestDist = dist;
            best = line;
        }
    }

    if (!best) {
        return null;
    }

    return {
        coord: Number(best.coord) || 0,
        roadWidth: Number(best.roadWidth) || 0,
        distance: bestDist,
    };
}

function isOnRoad(value, roadLine, margin = 0) {
    if (!roadLine) {
        return false;
    }
    const halfWidth = Math.max(0, (roadLine.roadWidth || 0) * 0.5 + margin);
    return Math.abs(value - roadLine.coord) <= halfWidth;
}

function clampPointToWorld(point, worldBounds) {
    if (!worldBounds) {
        return { x: point.x, z: point.z };
    }
    return {
        x: THREE.MathUtils.clamp(point.x, worldBounds.minX + 2, worldBounds.maxX - 2),
        z: THREE.MathUtils.clamp(point.z, worldBounds.minZ + 2, worldBounds.maxZ - 2),
    };
}

function resolveDetourTarget(bot, target, worldBounds, buildingObstacles) {
    if (!bot || !target || !Array.isArray(buildingObstacles) || buildingObstacles.length === 0) {
        bot.detourTarget = null;
        return null;
    }

    const blocking = findBlockingBuilding(
        bot.car.position,
        target,
        buildingObstacles,
        BOT_DETOUR_CLEARANCE
    );
    if (!blocking) {
        bot.detourTarget = null;
        return null;
    }

    if (bot.detourTarget) {
        const detourDistanceSq = distanceSqXY(
            bot.car.position.x,
            bot.car.position.z,
            bot.detourTarget.x,
            bot.detourTarget.z
        );
        if (detourDistanceSq <= BOT_DETOUR_REACH_RADIUS * BOT_DETOUR_REACH_RADIUS) {
            bot.detourTarget = null;
        } else if (bot.detourTarget.obstacle === blocking.obstacle) {
            return bot.detourTarget;
        }
    }

    const detourPoint = computeDetourPoint(bot.car.position, target, blocking.bounds, worldBounds);
    if (!detourPoint) {
        bot.detourTarget = null;
        return null;
    }

    bot.detourTarget = {
        x: detourPoint.x,
        z: detourPoint.z,
        obstacle: blocking.obstacle,
    };
    return bot.detourTarget;
}

function findBlockingBuilding(position, target, buildingObstacles, padding) {
    let best = null;
    let bestT = Infinity;

    for (let i = 0; i < buildingObstacles.length; i += 1) {
        const obstacle = buildingObstacles[i];
        const bounds = {
            minX: obstacle.minX - padding,
            maxX: obstacle.maxX + padding,
            minZ: obstacle.minZ - padding,
            maxZ: obstacle.maxZ + padding,
        };

        const hit = segmentIntersectsAabb2D(
            position.x,
            position.z,
            target.x,
            target.z,
            bounds.minX,
            bounds.maxX,
            bounds.minZ,
            bounds.maxZ
        );
        if (!hit) {
            continue;
        }

        if (hit.tEnter < bestT) {
            bestT = hit.tEnter;
            best = {
                obstacle,
                bounds,
            };
        }
    }

    return best;
}

function computeDetourPoint(position, target, bounds, worldBounds) {
    const clampedZ = THREE.MathUtils.clamp(target.z, bounds.minZ, bounds.maxZ);
    const clampedX = THREE.MathUtils.clamp(target.x, bounds.minX, bounds.maxX);
    const candidates = [
        { x: bounds.minX, z: clampedZ },
        { x: bounds.maxX, z: clampedZ },
        { x: clampedX, z: bounds.minZ },
        { x: clampedX, z: bounds.maxZ },
    ];

    let best = null;
    let bestScore = Infinity;

    for (let i = 0; i < candidates.length; i += 1) {
        const candidate = candidates[i];
        let x = candidate.x;
        let z = candidate.z;
        if (worldBounds) {
            x = THREE.MathUtils.clamp(x, worldBounds.minX + 2, worldBounds.maxX - 2);
            z = THREE.MathUtils.clamp(z, worldBounds.minZ + 2, worldBounds.maxZ - 2);
        }

        const toCandidate = Math.hypot(position.x - x, position.z - z);
        const toTarget = Math.hypot(target.x - x, target.z - z);
        const score = toCandidate + toTarget;
        if (score < bestScore) {
            bestScore = score;
            best = { x, z };
        }
    }

    return best;
}

function segmentIntersectsAabb2D(ax, az, bx, bz, minX, maxX, minZ, maxZ) {
    const dx = bx - ax;
    const dz = bz - az;
    let tmin = 0;
    let tmax = 1;

    if (Math.abs(dx) < 0.000001) {
        if (ax < minX || ax > maxX) {
            return null;
        }
    } else {
        const inv = 1 / dx;
        let t1 = (minX - ax) * inv;
        let t2 = (maxX - ax) * inv;
        if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
        }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) {
            return null;
        }
    }

    if (Math.abs(dz) < 0.000001) {
        if (az < minZ || az > maxZ) {
            return null;
        }
    } else {
        const inv = 1 / dz;
        let t1 = (minZ - az) * inv;
        let t2 = (maxZ - az) * inv;
        if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
        }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) {
            return null;
        }
    }

    return { tEnter: tmin, tExit: tmax };
}

function constrainToWorld(position, state, worldBounds) {
    let hit = false;

    if (position.x < worldBounds.minX) {
        position.x = worldBounds.minX;
        hit = true;
    } else if (position.x > worldBounds.maxX) {
        position.x = worldBounds.maxX;
        hit = true;
    }

    if (position.z < worldBounds.minZ) {
        position.z = worldBounds.minZ;
        hit = true;
    } else if (position.z > worldBounds.maxZ) {
        position.z = worldBounds.maxZ;
        hit = true;
    }

    if (hit) {
        state.speed *= 0.45;
        state.velocity.multiplyScalar(0.45);
    }
}

function constrainToObstacles(bot, position, state, staticObstacles) {
    if (!staticObstacles || staticObstacles.length === 0) {
        return;
    }

    let collided = false;
    let strongestDamageContact = null;
    for (let pass = 0; pass < OBSTACLE_PASSES; pass += 1) {
        let moved = false;

        for (let i = 0; i < staticObstacles.length; i += 1) {
            const obstacle = staticObstacles[i];
            if (obstacle.type === 'circle') {
                const dx = position.x - obstacle.x;
                const dz = position.z - obstacle.z;
                const combinedRadius = obstacle.radius + BOT_RADIUS;
                const distanceSq = dx * dx + dz * dz;
                if (distanceSq >= combinedRadius * combinedRadius) {
                    continue;
                }

                let normalX = dx;
                let normalZ = dz;
                let distance = Math.sqrt(distanceSq);

                if (distance < 0.0001) {
                    normalX = 1;
                    normalZ = 0;
                    distance = 1;
                } else {
                    normalX /= distance;
                    normalZ /= distance;
                }

                const push = combinedRadius - distance;
                position.x += normalX * push;
                position.z += normalZ * push;
                moved = true;
                collided = true;
                if (bot && BOT_DAMAGE_OBSTACLE_CATEGORIES.has(obstacle.category)) {
                    const impactSpeed = getObstacleImpactSpeed(state, normalX, normalZ);
                    if (
                        !strongestDamageContact ||
                        impactSpeed > strongestDamageContact.impactSpeed
                    ) {
                        strongestDamageContact = {
                            normalX: -normalX,
                            normalZ: -normalZ,
                            impactSpeed,
                            penetration: push,
                            obstacleCategory: obstacle.category || 'obstacle',
                        };
                    }
                }
                continue;
            }

            if (obstacle.type !== 'aabb') {
                continue;
            }

            const closestX = THREE.MathUtils.clamp(position.x, obstacle.minX, obstacle.maxX);
            const closestZ = THREE.MathUtils.clamp(position.z, obstacle.minZ, obstacle.maxZ);
            let dx = position.x - closestX;
            let dz = position.z - closestZ;
            let distanceSq = dx * dx + dz * dz;
            if (distanceSq >= BOT_RADIUS * BOT_RADIUS) {
                continue;
            }

            let normalX = dx;
            let normalZ = dz;
            let distance = Math.sqrt(distanceSq);

            if (distance < 0.0001) {
                const toLeft = Math.abs(position.x - obstacle.minX);
                const toRight = Math.abs(obstacle.maxX - position.x);
                const toBottom = Math.abs(position.z - obstacle.minZ);
                const toTop = Math.abs(obstacle.maxZ - position.z);
                const minDistance = Math.min(toLeft, toRight, toBottom, toTop);

                if (minDistance === toLeft) {
                    normalX = -1;
                    normalZ = 0;
                } else if (minDistance === toRight) {
                    normalX = 1;
                    normalZ = 0;
                } else if (minDistance === toBottom) {
                    normalX = 0;
                    normalZ = -1;
                } else {
                    normalX = 0;
                    normalZ = 1;
                }
                distance = 0;
            } else {
                normalX /= distance;
                normalZ /= distance;
            }

            const push = BOT_RADIUS - distance;
            position.x += normalX * push;
            position.z += normalZ * push;
            moved = true;
            collided = true;
            if (bot && BOT_DAMAGE_OBSTACLE_CATEGORIES.has(obstacle.category)) {
                const impactSpeed = getObstacleImpactSpeed(state, normalX, normalZ);
                if (!strongestDamageContact || impactSpeed > strongestDamageContact.impactSpeed) {
                    strongestDamageContact = {
                        normalX: -normalX,
                        normalZ: -normalZ,
                        impactSpeed,
                        penetration: push,
                        obstacleCategory: obstacle.category || 'obstacle',
                    };
                }
            }
        }

        if (!moved) {
            break;
        }
    }

    if (collided) {
        state.speed *= 0.9;
        state.velocity.multiplyScalar(0.9);
        if (strongestDamageContact) {
            applyBotCollisionDamage(bot, strongestDamageContact);
        }
    }
}

function constrainToPlayerVehicle(bot, playerPosition) {
    if (!bot || !playerPosition) {
        return;
    }

    const dx = bot.car.position.x - playerPosition.x;
    const dz = bot.car.position.z - playerPosition.z;
    const combinedRadius = BOT_VEHICLE_COLLISION_RADIUS + PLAYER_VEHICLE_COLLISION_RADIUS;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq >= combinedRadius * combinedRadius) {
        return;
    }

    let normalX = dx;
    let normalZ = dz;
    let distance = Math.sqrt(distanceSq);
    if (distance < 0.0001) {
        normalX = -Math.sin(bot.car.rotation.y);
        normalZ = -Math.cos(bot.car.rotation.y);
        distance = 1;
    } else {
        normalX /= distance;
        normalZ /= distance;
    }

    const penetration = combinedRadius - distance;
    bot.car.position.x += normalX * (penetration + 0.002);
    bot.car.position.z += normalZ * (penetration + 0.002);

    const inwardSpeed = bot.state.velocity.x * normalX + bot.state.velocity.y * normalZ;
    if (inwardSpeed < 0) {
        bot.state.velocity.x -= normalX * inwardSpeed;
        bot.state.velocity.y -= normalZ * inwardSpeed;
    }
    bot.state.velocity.multiplyScalar(0.92);
    bot.state.speed = Math.min(bot.state.speed, bot.state.velocity.length());
}

function getObstacleImpactSpeed(state, normalX, normalZ) {
    // Obstacle normal points from obstacle to bot, so inbound impact is the opposite sign.
    return Math.max(0, -(state.velocity.x * normalX + state.velocity.y * normalZ));
}

function isInsideObstacle(x, z, staticObstacles, padding) {
    for (let i = 0; i < staticObstacles.length; i += 1) {
        const obstacle = staticObstacles[i];
        if (obstacle.type === 'circle') {
            const radius = obstacle.radius + padding;
            if (distanceSqXY(x, z, obstacle.x, obstacle.z) <= radius * radius) {
                return true;
            }
            continue;
        }

        if (obstacle.type === 'aabb') {
            if (
                x >= obstacle.minX - padding &&
                x <= obstacle.maxX + padding &&
                z >= obstacle.minZ - padding &&
                z <= obstacle.maxZ + padding
            ) {
                return true;
            }
        }
    }

    return false;
}

function calculateYawRate(speed, steerAngle) {
    const speedAbs = Math.abs(speed);
    if (speedAbs < 0.25) {
        return 0;
    }

    const base = (speed / BOT_WHEEL_BASE) * Math.tan(steerAngle);
    const lowSpeedAssist = THREE.MathUtils.clamp(speedAbs / 8.5, 0.08, 1);
    return base * lowSpeedAssist;
}

function moveToward(current, target, maxDelta) {
    if (current < target) {
        return Math.min(current + maxDelta, target);
    }
    return Math.max(current - maxDelta, target);
}

function shortestAngle(from, to) {
    return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function randomRange(min, max) {
    return min + Math.random() * Math.max(0, max - min);
}

function randomUnit(seed) {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
    return value - Math.floor(value);
}

function distanceSqXZ(a, b) {
    return distanceSqXY(a.x, a.z, b.x, b.z);
}

function distanceSqXY(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
}

function disposeObject3d(object) {
    object.traverse((node) => {
        if (node.geometry?.dispose) {
            node.geometry.dispose();
        }
        if (!node.material) {
            return;
        }
        if (Array.isArray(node.material)) {
            node.material.forEach((material) => material?.dispose?.());
            return;
        }
        node.material.dispose?.();
    });
}
