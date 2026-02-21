import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import {
    DEBRIS_GROUND_CLEARANCE,
    DEBRIS_SETTLE_VERTICAL_SPEED,
    DEBRIS_SETTLE_HORIZONTAL_SPEED,
    DEBRIS_SETTLE_ANGULAR_SPEED,
    PART_BASE_ANGULAR_BOOST,
    WHEEL_ROLL_RANDOM_BOOST,
    WHEEL_ROLL_DRIVE_MIN,
    WHEEL_ROLL_DRIVE_MAX,
    WHEEL_ORIENTATION_ALIGN_RATE,
    BODY_PANEL_ORIENTATION_ALIGN_RATE,
} from './constants.js';
import { createDefaultCrashDamageTuning, mergeCrashDamageTuning } from './crash-damage-tuning.js';

const EXPLOSION_LIGHT_MAX_LIFE = 0.7;
const MAX_DEBRIS_MESH_POOL_PER_PART = 18;

export function createCrashDebrisController({
    scene,
    car,
    crashParts = [],
    getGroundHeightAt,
    getVehicleState,
    setVehicleDamageState,
    objectiveUi,
    getBotTrafficSystem,
    isCarDestroyed,
} = {}) {
    const sampleGroundHeight =
        typeof getGroundHeightAt === 'function' ? getGroundHeightAt : () => 0;
    const readVehicleState = typeof getVehicleState === 'function' ? getVehicleState : () => ({});
    const applyVehicleDamageState =
        typeof setVehicleDamageState === 'function' ? setVehicleDamageState : () => {};
    const getBotSystem =
        typeof getBotTrafficSystem === 'function' ? getBotTrafficSystem : () => null;
    const getDestroyed = typeof isCarDestroyed === 'function' ? isCarDestroyed : () => false;

    const debrisPieces = [];
    const debrisPieceById = new Map();
    const debrisMeshPoolByPartId = new Map();
    const detachedCrashPartIds = new Set();
    const crashPartById = new Map();
    const playerDamageState = createEmptyDamageState();
    const bodyDamageVisual = { left: 0, right: 0, front: 0, rear: 0 };
    const bodyPartBaselines = new Map();
    const crashDamageTuning = createDefaultCrashDamageTuning();
    const debrisBottomProbeBox = new THREE.Box3();
    let nextDebrisPieceId = 1;

    let explosionLight = null;
    let explosionLightLife = 0;
    let explosionLightAttached = false;
    let vehicleImpactStatusCooldown = 0;

    return {
        initializeBodyPartBaselines,
        resetPlayerDamageState,
        tickImpactStatusCooldown(dt) {
            vehicleImpactStatusCooldown = Math.max(
                0,
                vehicleImpactStatusCooldown - Math.max(0, dt || 0)
            );
        },
        processVehicleCollisionContacts,
        spawnCarDebris,
        getCrashDamageTuning() {
            return { ...crashDamageTuning };
        },
        setCrashDamageTuning(nextTuning = {}) {
            const merged = mergeCrashDamageTuning(crashDamageTuning, nextTuning);
            Object.assign(crashDamageTuning, merged);
            return { ...crashDamageTuning };
        },
        resetCrashDamageTuning() {
            Object.assign(crashDamageTuning, createDefaultCrashDamageTuning());
            return { ...crashDamageTuning };
        },
        getReplicationState,
        applyReplicationState,
        updateDebris,
        clearDebris,
        hasActiveDebrisOrExplosion() {
            return debrisPieces.length > 0 || (explosionLightAttached && explosionLightLife > 0);
        },
    };

    function createEmptyDamageState() {
        return {
            wheelLossCount: 0,
            leftLoss: 0,
            rightLoss: 0,
            frontLoss: 0,
            rearLoss: 0,
            suspensionLoss: 0,
        };
    }

    function initializeBodyPartBaselines() {
        bodyPartBaselines.clear();
        crashPartById.clear();
        for (let i = 0; i < crashParts.length; i += 1) {
            const part = crashParts[i];
            if (part?.id) {
                crashPartById.set(part.id, part);
            }
            if (part?.type !== 'body_panel' || !part.source) {
                continue;
            }
            bodyPartBaselines.set(part.id, {
                position: part.source.position.clone(),
                rotation: part.source.rotation.clone(),
                scale: part.source.scale.clone(),
            });
        }
    }

    function applyBodyDentVisuals() {
        const sideMagnitude = THREE.MathUtils.clamp(
            (bodyDamageVisual.left + bodyDamageVisual.right) * 0.28,
            0,
            0.34
        );
        const sideBias = THREE.MathUtils.clamp(
            bodyDamageVisual.right - bodyDamageVisual.left,
            -1.5,
            1.5
        );
        const zoneMagnitude = THREE.MathUtils.clamp(
            (bodyDamageVisual.front + bodyDamageVisual.rear) * 0.24,
            0,
            0.31
        );
        const zoneBias = THREE.MathUtils.clamp(
            bodyDamageVisual.rear - bodyDamageVisual.front,
            -1.5,
            1.5
        );

        for (let i = 0; i < crashParts.length; i += 1) {
            const part = crashParts[i];
            if (part?.type !== 'body_panel' || !part.source) {
                continue;
            }
            const base = bodyPartBaselines.get(part.id);
            if (!base) {
                continue;
            }

            part.source.scale.set(
                base.scale.x * (1 - sideMagnitude * 0.2),
                base.scale.y * (1 - (sideMagnitude + zoneMagnitude) * 0.08),
                base.scale.z
            );
            part.source.rotation.set(
                base.rotation.x + zoneBias * 0.05,
                base.rotation.y,
                base.rotation.z + sideBias * 0.07
            );
            part.source.position.set(
                base.position.x - sideBias * 0.045,
                base.position.y - (sideMagnitude + zoneMagnitude) * 0.03,
                base.position.z + zoneBias * 0.04
            );
        }
    }

    function resetPlayerDamageState() {
        detachedCrashPartIds.clear();
        vehicleImpactStatusCooldown = 0;
        const freshState = createEmptyDamageState();
        playerDamageState.wheelLossCount = freshState.wheelLossCount;
        playerDamageState.leftLoss = freshState.leftLoss;
        playerDamageState.rightLoss = freshState.rightLoss;
        playerDamageState.frontLoss = freshState.frontLoss;
        playerDamageState.rearLoss = freshState.rearLoss;
        playerDamageState.suspensionLoss = freshState.suspensionLoss;
        bodyDamageVisual.left = 0;
        bodyDamageVisual.right = 0;
        bodyDamageVisual.front = 0;
        bodyDamageVisual.rear = 0;

        for (let i = 0; i < crashParts.length; i += 1) {
            const part = crashParts[i];
            if (part?.source) {
                part.source.visible = true;
                const base = bodyPartBaselines.get(part.id);
                if (base) {
                    part.source.position.copy(base.position);
                    part.source.rotation.copy(base.rotation);
                    part.source.scale.copy(base.scale);
                }
            }
        }
        applyDetachedPartVisibility();
        applyVehicleDamageState(playerDamageState);
    }

    function applyDetachedPartVisibility() {
        for (let i = 0; i < crashParts.length; i += 1) {
            const part = crashParts[i];
            if (!part?.source || !part?.id) {
                continue;
            }
            part.source.visible = !detachedCrashPartIds.has(part.id);
        }
    }

    function setDetachedPartIds(partIds = []) {
        detachedCrashPartIds.clear();
        for (let i = 0; i < partIds.length; i += 1) {
            const partId = partIds[i];
            if (typeof partId !== 'string' || !crashPartById.has(partId)) {
                continue;
            }
            detachedCrashPartIds.add(partId);
        }
        applyDetachedPartVisibility();
    }

    function processVehicleCollisionContacts(contacts) {
        if (!contacts || contacts.length === 0 || getDestroyed()) {
            return;
        }

        const strongestByVehicle = new Map();
        const botImpulseContacts = [];
        for (let i = 0; i < contacts.length; i += 1) {
            const contact = contacts[i];
            if (!contact) {
                continue;
            }

            const contactVehicleId = resolveVehicleContactId(contact, i);
            const previous = strongestByVehicle.get(contactVehicleId);
            if (!previous || (contact.impactSpeed || 0) > (previous.impactSpeed || 0)) {
                strongestByVehicle.set(contactVehicleId, contact);
            }

            if (contact.botId) {
                botImpulseContacts.push(contact);
            }
        }

        const condensedContacts = Array.from(strongestByVehicle.values());
        if (condensedContacts.length === 0) {
            return;
        }

        if (botImpulseContacts.length > 0) {
            getBotSystem()?.applyCollisionImpulses?.(botImpulseContacts);
        }

        let strongestImpact = 0;
        for (let i = 0; i < condensedContacts.length; i += 1) {
            const contact = condensedContacts[i];
            const impactSpeed = contact.impactSpeed || 0;
            if (impactSpeed > strongestImpact) {
                strongestImpact = impactSpeed;
            }
            applyLocalizedVehicleDamage(contact);
        }

        if (
            strongestImpact >= crashDamageTuning.vehicleDamageCollisionMin &&
            vehicleImpactStatusCooldown <= 0
        ) {
            objectiveUi?.showInfo?.(
                strongestImpact >= crashDamageTuning.vehicleWheelDetachSpeed
                    ? `Heavy collision (${Math.round(strongestImpact)}): possible wheel damage.`
                    : `Contact with another car (${Math.round(strongestImpact)}).`,
                strongestImpact >= crashDamageTuning.vehicleDamageCollisionHigh ? 1400 : 900
            );
            vehicleImpactStatusCooldown = 0.85;
        }
    }

    function resolveVehicleContactId(contact, index = 0) {
        if (typeof contact?.vehicleId === 'string' && contact.vehicleId.trim()) {
            return contact.vehicleId.trim();
        }
        if (typeof contact?.botId === 'string' && contact.botId.trim()) {
            return `bot:${contact.botId.trim()}`;
        }
        if (typeof contact?.playerId === 'string' && contact.playerId.trim()) {
            return `player:${contact.playerId.trim()}`;
        }
        return `vehicle-contact-${index + 1}`;
    }

    function applyLocalizedVehicleDamage(contact) {
        const impactSpeed = contact?.impactSpeed || 0;
        if (impactSpeed < crashDamageTuning.vehicleDamageCollisionMin) {
            return;
        }

        const collision = {
            obstacleCategory: 'vehicle',
            impactSpeed,
            impactNormal: new THREE.Vector3(contact.normalX || 0, 0, contact.normalZ || 0),
        };
        const crashContext = buildCrashContext(contact.position || car.position.clone(), collision);
        const hitSide = crashContext.hitSide;
        const hitZone = crashContext.hitZone;
        const oppositeZone = hitZone === 'front' ? 'rear' : 'front';

        applyPersistentHandlingDamage(crashContext, impactSpeed);
        addBodyDentFromImpact(crashContext, impactSpeed);

        if (impactSpeed >= crashDamageTuning.vehicleWheelDetachSpeed) {
            tryDetachCrashPart(
                (part) => part.type === 'wheel' && part.side === hitSide && part.zone === hitZone,
                crashContext
            );
        }

        if (impactSpeed >= crashDamageTuning.vehicleSecondWheelDetachSpeed) {
            tryDetachCrashPart(
                (part) =>
                    part.type === 'wheel' && part.side === hitSide && part.zone === oppositeZone,
                crashContext
            );
        }
    }

    function applyPersistentHandlingDamage(crashContext, impactSpeed) {
        const damageNorm = THREE.MathUtils.clamp(
            (impactSpeed - crashDamageTuning.vehicleDamageCollisionMin) /
                (crashDamageTuning.vehicleWheelDetachSpeed -
                    crashDamageTuning.vehicleDamageCollisionMin),
            0,
            1.25
        );
        if (damageNorm <= 0.02) {
            return;
        }

        const localGain = damageNorm * 0.32;
        const zoneGain = damageNorm * 0.26;
        const suspensionGain = damageNorm * 0.22;

        if (crashContext.hitSide === 'left') {
            playerDamageState.leftLoss += localGain;
        } else if (crashContext.hitSide === 'right') {
            playerDamageState.rightLoss += localGain;
        }

        if (crashContext.hitZone === 'front') {
            playerDamageState.frontLoss += zoneGain;
        } else if (crashContext.hitZone === 'rear') {
            playerDamageState.rearLoss += zoneGain;
        }

        playerDamageState.suspensionLoss += suspensionGain;
        applyVehicleDamageState(playerDamageState);
    }

    function addBodyDentFromImpact(crashContext, impactSpeed) {
        const dentNorm = THREE.MathUtils.clamp(
            (impactSpeed - crashDamageTuning.vehicleDamageCollisionMin) /
                (crashDamageTuning.vehicleDamageCollisionHigh -
                    crashDamageTuning.vehicleDamageCollisionMin),
            0,
            1.2
        );
        if (dentNorm <= 0.03) {
            return;
        }

        const dentGain = dentNorm * 0.28;
        if (crashContext.hitSide === 'left') {
            bodyDamageVisual.left = THREE.MathUtils.clamp(
                bodyDamageVisual.left + dentGain,
                0,
                crashDamageTuning.vehicleDentMax
            );
        } else if (crashContext.hitSide === 'right') {
            bodyDamageVisual.right = THREE.MathUtils.clamp(
                bodyDamageVisual.right + dentGain,
                0,
                crashDamageTuning.vehicleDentMax
            );
        }

        if (crashContext.hitZone === 'front') {
            bodyDamageVisual.front = THREE.MathUtils.clamp(
                bodyDamageVisual.front + dentGain * 0.94,
                0,
                crashDamageTuning.vehicleDentMax
            );
        } else if (crashContext.hitZone === 'rear') {
            bodyDamageVisual.rear = THREE.MathUtils.clamp(
                bodyDamageVisual.rear + dentGain * 0.94,
                0,
                crashDamageTuning.vehicleDentMax
            );
        }

        applyBodyDentVisuals();
    }

    function tryDetachCrashPart(predicate, crashContext) {
        const part = crashParts.find(
            (candidate) =>
                candidate?.source && !detachedCrashPartIds.has(candidate.id) && predicate(candidate)
        );
        if (!part) {
            return false;
        }
        detachCrashPart(part, crashContext);
        return true;
    }

    function detachCrashPart(part, crashContext) {
        if (!part?.source || detachedCrashPartIds.has(part.id)) {
            return false;
        }

        detachedCrashPartIds.add(part.id);
        part.source.visible = false;
        spawnCrashPartDebris(part, crashContext);
        registerDetachedPartDamage(part);
        return true;
    }

    function registerDetachedPartDamage(part) {
        if (part.type === 'wheel') {
            playerDamageState.wheelLossCount += 1;
        } else if (part.type === 'suspension_link') {
            playerDamageState.suspensionLoss += 1;
        }

        if (part.side === 'left') {
            playerDamageState.leftLoss += 1;
        } else if (part.side === 'right') {
            playerDamageState.rightLoss += 1;
        }

        if (part.zone === 'front') {
            playerDamageState.frontLoss += 1;
        } else if (part.zone === 'rear') {
            playerDamageState.rearLoss += 1;
        }

        applyVehicleDamageState(playerDamageState);
    }

    function spawnCarDebris(hitPosition, collision = null) {
        if (!crashParts || crashParts.length === 0) {
            return;
        }

        const crashContext = buildCrashContext(hitPosition, collision);
        const visibleParts = crashParts.filter((part) => part?.source?.visible);
        const selectedParts =
            visibleParts.length > 0 ? visibleParts : selectCrashPartsForImpact(crashContext, true);
        selectedParts.forEach((part) => {
            if (part?.id) {
                detachedCrashPartIds.add(part.id);
            }
            if (part?.source) {
                part.source.visible = false;
            }
            spawnCrashPartDebris(part, crashContext);
        });
        applyDetachedPartVisibility();

        const activeExplosionLight = ensureExplosionLightAttached();
        activeExplosionLight.position.copy(crashContext.origin);
        activeExplosionLight.position.y += 1.2;
        explosionLightLife = EXPLOSION_LIGHT_MAX_LIFE;
    }

    function getReplicationState() {
        const detachedPartIds = Array.from(detachedCrashPartIds.values());
        const debrisPiecesSnapshot = debrisPieces.map((piece) => ({
            id: piece.id,
            partId: piece.partId || '',
            x: piece.mesh.position.x,
            y: piece.mesh.position.y,
            z: piece.mesh.position.z,
            rotationX: piece.mesh.rotation.x,
            rotationY: piece.mesh.rotation.y,
            rotationZ: piece.mesh.rotation.z,
            velocityX: piece.velocity.x,
            velocityY: piece.velocity.y,
            velocityZ: piece.velocity.z,
            angularVelocityX: piece.angularVelocity.x,
            angularVelocityY: piece.angularVelocity.y,
            angularVelocityZ: piece.angularVelocity.z,
            groundOffset: piece.groundOffset,
            drag: piece.drag,
            bounce: piece.bounce,
            settled: Boolean(piece.settled),
            life: Number.isFinite(piece.life) ? piece.life : null,
            wheelRoll: piece.wheelRoll ? { ...piece.wheelRoll } : null,
            bodyRest: piece.bodyRest ? { ...piece.bodyRest } : null,
        }));

        return {
            detachedPartIds,
            debrisPieces: debrisPiecesSnapshot,
            explosion:
                explosionLightAttached && explosionLight
                    ? {
                          x: explosionLight.position.x,
                          y: explosionLight.position.y,
                          z: explosionLight.position.z,
                          life: explosionLightLife,
                      }
                    : null,
        };
    }

    function applyReplicationState(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') {
            return;
        }

        ensureCrashPartIndex();
        setDetachedPartIds(Array.isArray(snapshot.detachedPartIds) ? snapshot.detachedPartIds : []);

        const incomingPieces = Array.isArray(snapshot.debrisPieces) ? snapshot.debrisPieces : [];
        for (let i = 0; i < incomingPieces.length; i += 1) {
            const serializedPiece = incomingPieces[i];
            if (!serializedPiece || typeof serializedPiece !== 'object') {
                continue;
            }

            const id = Math.max(1, Math.round(Number(serializedPiece.id) || 0));
            const partId = typeof serializedPiece.partId === 'string' ? serializedPiece.partId : '';
            const part = crashPartById.get(partId);
            if (!part?.source) {
                continue;
            }

            let piece = debrisPieceById.get(id);
            if (!piece) {
                const source = part.source;
                source.updateWorldMatrix(true, true);
                const debrisMesh = acquireDebrisMesh(partId, source);
                source.matrixWorld.decompose(
                    debrisMesh.position,
                    debrisMesh.quaternion,
                    debrisMesh.scale
                );
                scene.add(debrisMesh);
                piece = addDebrisPiece({
                    id,
                    partId,
                    mesh: debrisMesh,
                    velocity: new THREE.Vector3(),
                    angularVelocity: new THREE.Vector3(),
                    life: Number.POSITIVE_INFINITY,
                    groundOffset: 0.12,
                });
            }

            piece.partId = partId;
            piece.mesh.position.set(
                coerceFinite(serializedPiece.x, piece.mesh.position.x),
                coerceFinite(serializedPiece.y, piece.mesh.position.y),
                coerceFinite(serializedPiece.z, piece.mesh.position.z)
            );
            piece.mesh.rotation.set(
                coerceFinite(serializedPiece.rotationX, piece.mesh.rotation.x),
                coerceFinite(serializedPiece.rotationY, piece.mesh.rotation.y),
                coerceFinite(serializedPiece.rotationZ, piece.mesh.rotation.z)
            );
            piece.velocity.set(
                coerceFinite(serializedPiece.velocityX, piece.velocity.x),
                coerceFinite(serializedPiece.velocityY, piece.velocity.y),
                coerceFinite(serializedPiece.velocityZ, piece.velocity.z)
            );
            piece.angularVelocity.set(
                coerceFinite(serializedPiece.angularVelocityX, piece.angularVelocity.x),
                coerceFinite(serializedPiece.angularVelocityY, piece.angularVelocity.y),
                coerceFinite(serializedPiece.angularVelocityZ, piece.angularVelocity.z)
            );
            piece.groundOffset = Math.max(
                0.03,
                coerceFinite(serializedPiece.groundOffset, piece.groundOffset)
            );
            piece.drag = Math.max(0, coerceFinite(serializedPiece.drag, piece.drag));
            piece.bounce = Math.max(0, coerceFinite(serializedPiece.bounce, piece.bounce));
            piece.life = Number.isFinite(serializedPiece.life)
                ? serializedPiece.life
                : Number.POSITIVE_INFINITY;
            piece.settled = Boolean(serializedPiece.settled);
            piece.wheelRoll = deserializeWheelRollState(serializedPiece.wheelRoll);
            piece.bodyRest = deserializeBodyRestState(serializedPiece.bodyRest);
        }

        applyExplosionSnapshot(snapshot.explosion);
    }

    function buildCrashContext(hitPosition, collision) {
        const origin = car.position.clone();
        const hitDirection = new THREE.Vector3().subVectors(hitPosition, origin);
        hitDirection.y = 0;
        if (hitDirection.lengthSq() < 0.0001) {
            hitDirection.set(0, 0, -1);
        }
        hitDirection.normalize();

        const carForward = new THREE.Vector3(0, 0, -1)
            .applyQuaternion(car.quaternion)
            .setY(0)
            .normalize();
        const carRight = new THREE.Vector3(1, 0, 0)
            .applyQuaternion(car.quaternion)
            .setY(0)
            .normalize();
        const impactNormal = collision?.impactNormal
            ? collision.impactNormal.clone()
            : hitDirection.clone().multiplyScalar(-1);
        impactNormal.y = 0;
        if (impactNormal.lengthSq() < 0.0001) {
            impactNormal.copy(carForward).multiplyScalar(-1);
        }
        impactNormal.normalize();

        const impactSpeed = collision?.impactSpeed || crashDamageTuning.obstacleCrashMaxSpeed;
        const impactNorm = THREE.MathUtils.clamp(
            (impactSpeed - crashDamageTuning.obstacleCrashMinSpeed) /
                (crashDamageTuning.obstacleCrashMaxSpeed - crashDamageTuning.obstacleCrashMinSpeed),
            0,
            1
        );
        const crashIntensity = collision ? 0.35 + impactNorm * 0.65 : 1;
        const frontalImpact = THREE.MathUtils.clamp(-impactNormal.dot(carForward), 0, 1);
        const physicsState = readVehicleState();
        const impactVelocity = physicsState?.velocity
            ? new THREE.Vector3(physicsState.velocity.x || 0, 0, physicsState.velocity.y || 0)
            : new THREE.Vector3();
        if (impactVelocity.lengthSq() < 0.04) {
            impactVelocity.copy(carForward).multiplyScalar(impactSpeed * 0.62);
        }
        const impactTravelDirection =
            impactVelocity.lengthSq() > 0.0001
                ? impactVelocity.clone().normalize()
                : carForward.clone();
        const impactTravelSpeed = Math.max(impactVelocity.length(), impactSpeed * 0.58);

        const localHit = hitPosition.clone();
        car.worldToLocal(localHit);
        const hitSide =
            Math.abs(localHit.x) > 0.12
                ? localHit.x < 0
                    ? 'left'
                    : 'right'
                : impactNormal.dot(carRight) >= 0
                  ? 'left'
                  : 'right';
        const hitZone = localHit.z < 0 ? 'front' : 'rear';

        return {
            origin,
            hitDirection,
            impactNormal,
            carForward,
            carRight,
            hitSide,
            hitZone,
            crashIntensity,
            frontalImpact,
            impactSpeed,
            impactTravelDirection,
            impactTravelSpeed,
            obstacleCategory: collision?.obstacleCategory || 'generic',
            isObstacleCollision: Boolean(collision),
        };
    }

    function selectCrashPartsForImpact(crashContext, excludeDetached = false) {
        if (!crashContext.isObstacleCollision) {
            return excludeDetached
                ? crashParts.filter((part) => !detachedCrashPartIds.has(part.id))
                : crashParts;
        }

        const selected = [];
        const selectedIds = new Set();
        const sideDominant = Math.abs(crashContext.impactNormal.dot(crashContext.carRight)) > 0.58;

        crashParts.forEach((part) => {
            if (excludeDetached && detachedCrashPartIds.has(part.id)) {
                return;
            }
            const sideMatch = part.side === crashContext.hitSide;
            const zoneMatch = part.zone === crashContext.hitZone;
            const centered = part.side === 'center';
            let detach = false;

            if (part.type === 'wheel') {
                if (sideDominant) {
                    detach = sideMatch;
                } else {
                    detach = zoneMatch;
                }
                if (crashContext.crashIntensity > 0.88 && sideMatch && zoneMatch) {
                    detach = true;
                }
            } else if (part.type === 'suspension_link') {
                detach = sideDominant
                    ? sideMatch
                    : zoneMatch || (sideMatch && crashContext.crashIntensity > 0.72);
                detach = detach && crashContext.crashIntensity > 0.26;
            } else {
                detach = sideDominant
                    ? sideMatch || (centered && zoneMatch)
                    : zoneMatch || (sideMatch && crashContext.crashIntensity > 0.66);
                if (centered && crashContext.crashIntensity > 0.75) {
                    detach = true;
                }
            }

            if (detach) {
                selected.push(part);
                selectedIds.add(part.id);
            }
        });

        if (!selected.some((part) => part.type === 'wheel')) {
            const fallbackWheel = crashParts.find(
                (part) =>
                    part.type === 'wheel' &&
                    part.side === crashContext.hitSide &&
                    part.zone === crashContext.hitZone &&
                    (!excludeDetached || !detachedCrashPartIds.has(part.id))
            );
            if (fallbackWheel && !selectedIds.has(fallbackWheel.id)) {
                selected.push(fallbackWheel);
                selectedIds.add(fallbackWheel.id);
            }
        }

        if (!selected.some((part) => part.type === 'body_panel')) {
            const fallbackPanel =
                crashParts.find(
                    (part) =>
                        part.type === 'body_panel' &&
                        (part.side === crashContext.hitSide ||
                            part.zone === crashContext.hitZone) &&
                        (!excludeDetached || !detachedCrashPartIds.has(part.id))
                ) ||
                crashParts.find(
                    (part) =>
                        part.type === 'body_panel' &&
                        (!excludeDetached || !detachedCrashPartIds.has(part.id))
                );
            if (fallbackPanel && !selectedIds.has(fallbackPanel.id)) {
                selected.push(fallbackPanel);
                selectedIds.add(fallbackPanel.id);
            }
        }

        return selected;
    }

    function spawnCrashPartDebris(part, crashContext) {
        if (!part?.source) {
            return;
        }

        const source = part.source;
        source.updateWorldMatrix(true, true);
        const partId = part.id || '';
        const debrisMesh = acquireDebrisMesh(partId, source);
        source.matrixWorld.decompose(debrisMesh.position, debrisMesh.quaternion, debrisMesh.scale);
        scene.add(debrisMesh);

        const relative = debrisMesh.position.clone().sub(crashContext.origin);
        relative.y = 0;

        const partSideSign = part.side === 'left' ? -1 : part.side === 'right' ? 1 : 0;
        const partZoneSign = part.zone === 'front' ? 1 : part.zone === 'rear' ? -1 : 0;
        const radialDirection =
            relative.lengthSq() > 0.0001 ? relative.normalize() : crashContext.hitDirection.clone();
        const frontalImpact = crashContext.frontalImpact || 0;
        const lampPostFrontBoost =
            crashContext.obstacleCategory === 'lamp_post' && crashContext.hitZone === 'front'
                ? 1.18 + crashContext.crashIntensity * 0.34
                : 1;
        const blastScale = 0.58 + crashContext.crashIntensity * 0.72 + Math.random() * 0.35;
        const reducedBlastScale = blastScale * (1 - frontalImpact * 0.72);
        const forwardCarryScale =
            (0.4 + frontalImpact * 2.4 + (crashContext.hitZone === 'front' ? 1.05 : 0.12)) *
            lampPostFrontBoost *
            (0.86 + Math.random() * 0.34);
        const inertiaCarryScale =
            (0.72 + frontalImpact * 1.2 + crashContext.crashIntensity * 0.46) *
            lampPostFrontBoost *
            (0.8 + Math.random() * 0.45);
        const inertiaCarryBoost =
            crashContext.impactTravelSpeed *
            crashDamageTuning.debrisImpactInertiaScale *
            inertiaCarryScale;

        const velocity = new THREE.Vector3()
            .addScaledVector(
                radialDirection,
                crashDamageTuning.debrisLateralBoost * reducedBlastScale
            )
            .addScaledVector(
                crashContext.impactNormal,
                crashDamageTuning.debrisBlastBoost * reducedBlastScale
            )
            .addScaledVector(
                crashContext.carForward,
                crashDamageTuning.debrisForwardCarryBoost * forwardCarryScale
            )
            .addScaledVector(crashContext.impactTravelDirection, inertiaCarryBoost)
            .addScaledVector(crashContext.carRight, partSideSign * (0.6 + Math.random() * 1.24));

        if (part.type === 'wheel') {
            velocity.addScaledVector(
                crashContext.carForward,
                (crashContext.hitZone === 'front' ? 3.1 : 1.65) * forwardCarryScale
            );
            velocity.y +=
                crashDamageTuning.debrisVerticalBoost *
                (0.6 + Math.random() * 0.66 + frontalImpact * 0.55);
        } else if (part.type === 'suspension_link') {
            velocity.addScaledVector(
                crashContext.carForward,
                (crashContext.hitZone === 'front' ? 2.1 : 1.32) * forwardCarryScale
            );
            velocity.y +=
                crashDamageTuning.debrisVerticalBoost *
                (0.46 + Math.random() * 0.48 + frontalImpact * 0.3);
        } else {
            velocity.addScaledVector(
                crashContext.carForward,
                partZoneSign * (0.2 + Math.random() * 0.62)
            );
            velocity.y +=
                crashDamageTuning.debrisVerticalBoost *
                (0.52 + Math.random() * 0.62 + frontalImpact * 0.36);
        }

        const angularVelocity = new THREE.Vector3(
            (Math.random() - 0.5) * PART_BASE_ANGULAR_BOOST,
            (Math.random() - 0.5) * PART_BASE_ANGULAR_BOOST,
            (Math.random() - 0.5) * PART_BASE_ANGULAR_BOOST
        );

        const wheelRoll =
            part.type === 'wheel'
                ? {
                      drive:
                          THREE.MathUtils.clamp(
                              WHEEL_ROLL_DRIVE_MIN +
                                  Math.random() * (WHEEL_ROLL_DRIVE_MAX - WHEEL_ROLL_DRIVE_MIN),
                              WHEEL_ROLL_DRIVE_MIN,
                              WHEEL_ROLL_DRIVE_MAX
                          ) *
                          (0.7 + crashContext.crashIntensity * 0.72),
                      heading: Math.atan2(velocity.z, velocity.x),
                      turnRate: (Math.random() - 0.5) * 2.6,
                      wobblePhase: Math.random() * Math.PI * 2,
                      wobbleRate: 8 + Math.random() * 5,
                      decel: 2.2 + Math.random() * 1.8,
                      spin: 6 + Math.random() * WHEEL_ROLL_RANDOM_BOOST,
                      restPose: Math.random() < 0.24 ? 'flat' : 'upright',
                      restYaw: Math.random() * Math.PI * 2,
                  }
                : null;

        const bodyRest =
            part.type === 'body_panel'
                ? {
                      yaw: Math.random() * Math.PI * 2,
                  }
                : null;

        const debrisGroundOffset = estimateDebrisGroundOffset(debrisMesh);
        addDebrisPiece({
            partId,
            mesh: debrisMesh,
            velocity,
            angularVelocity,
            life: Number.POSITIVE_INFINITY,
            groundOffset: debrisGroundOffset,
            drag:
                part.type === 'wheel'
                    ? crashDamageTuning.debrisDrag * 0.78
                    : crashDamageTuning.debrisDrag,
            bounce:
                part.type === 'wheel'
                    ? crashDamageTuning.debrisBounceDamping * 0.78
                    : crashDamageTuning.debrisBounceDamping,
            wheelRoll,
            bodyRest,
        });
    }

    function acquireDebrisMesh(partId, source) {
        const key = typeof partId === 'string' ? partId : '';
        const pool = debrisMeshPoolByPartId.get(key);
        if (pool && pool.length > 0) {
            const mesh = pool.pop();
            mesh.visible = true;
            return mesh;
        }
        return cloneCrashPartSource(source);
    }

    function cloneCrashPartSource(source) {
        const clone = source.clone(true);
        clone.visible = true;
        clone.traverse((node) => {
            node.visible = true;
            if (!node.isMesh) {
                return;
            }
            if (node.material) {
                node.material = Array.isArray(node.material)
                    ? node.material.map((material) => material.clone())
                    : node.material.clone();
            }
            node.castShadow = false;
            node.receiveShadow = false;
            node.matrixAutoUpdate = true;
        });
        return clone;
    }

    function recycleDebrisMesh(partId, mesh) {
        if (!mesh) {
            return;
        }
        const key = typeof partId === 'string' ? partId : '';
        const pool = debrisMeshPoolByPartId.get(key) || [];
        if (!debrisMeshPoolByPartId.has(key)) {
            debrisMeshPoolByPartId.set(key, pool);
        }

        mesh.visible = false;
        mesh.position.set(0, -1000, 0);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(1, 1, 1);
        if (pool.length < MAX_DEBRIS_MESH_POOL_PER_PART) {
            pool.push(mesh);
            return;
        }
        disposeDebrisObject(mesh);
    }

    function estimateDebrisGroundOffset(object3D) {
        debrisBottomProbeBox.setFromObject(object3D);
        if (
            !Number.isFinite(debrisBottomProbeBox.min.y) ||
            !Number.isFinite(debrisBottomProbeBox.max.y)
        ) {
            return 0.12;
        }
        return Math.max(0.04, object3D.position.y - debrisBottomProbeBox.min.y);
    }

    function getDebrisBottomY(piece) {
        const halfY = piece.groundOffset;
        return piece.mesh.position.y - halfY;
    }

    function getDebrisGroundHeightAt(x, z) {
        return sampleGroundHeight(x, z) + DEBRIS_GROUND_CLEARANCE;
    }

    function dampAngle(current, target, rate, dt) {
        const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
        return current + delta * Math.min(1, rate * dt);
    }

    function alignWheelDebrisPose(piece, dt) {
        const wheelRoll = piece.wheelRoll;
        if (!wheelRoll) {
            return;
        }

        const rolling = wheelRoll.drive > 0.26;
        const targetPose = rolling ? 'upright' : wheelRoll.restPose || 'upright';
        const alignRate = WHEEL_ORIENTATION_ALIGN_RATE * (rolling ? 1.5 : 1);

        if (targetPose === 'flat') {
            piece.mesh.rotation.x = dampAngle(piece.mesh.rotation.x, 0, alignRate * 0.78, dt);
            piece.mesh.rotation.z = dampAngle(piece.mesh.rotation.z, Math.PI * 0.5, alignRate, dt);
            piece.mesh.rotation.y = dampAngle(
                piece.mesh.rotation.y,
                wheelRoll.restYaw || 0,
                alignRate * 0.62,
                dt
            );
            return;
        }

        const targetYaw = wheelRoll.heading + Math.PI * 0.5;
        piece.mesh.rotation.y = dampAngle(piece.mesh.rotation.y, targetYaw, alignRate, dt);
        piece.mesh.rotation.z = dampAngle(piece.mesh.rotation.z, 0, alignRate, dt);
    }

    function snapWheelDebrisPose(piece) {
        const wheelRoll = piece.wheelRoll;
        if (!wheelRoll) {
            return;
        }

        if ((wheelRoll.restPose || 'upright') === 'flat') {
            piece.mesh.rotation.x = 0;
            piece.mesh.rotation.z = Math.PI * 0.5;
            piece.mesh.rotation.y = wheelRoll.restYaw || piece.mesh.rotation.y;
            return;
        }

        piece.mesh.rotation.z = 0;
        piece.mesh.rotation.y = wheelRoll.heading + Math.PI * 0.5;
    }

    function alignBodyPanelDebrisPose(piece, dt) {
        const bodyRest = piece.bodyRest;
        if (!bodyRest) {
            return;
        }

        const alignRate = BODY_PANEL_ORIENTATION_ALIGN_RATE;
        piece.mesh.rotation.x = dampAngle(piece.mesh.rotation.x, 0, alignRate, dt);
        piece.mesh.rotation.z = dampAngle(piece.mesh.rotation.z, 0, alignRate, dt);
        piece.mesh.rotation.y = dampAngle(
            piece.mesh.rotation.y,
            bodyRest.yaw || 0,
            alignRate * 0.58,
            dt
        );
    }

    function snapBodyPanelDebrisPose(piece) {
        const bodyRest = piece.bodyRest;
        if (!bodyRest) {
            return;
        }

        piece.mesh.rotation.x = 0;
        piece.mesh.rotation.z = 0;
        piece.mesh.rotation.y = bodyRest.yaw || piece.mesh.rotation.y;
    }

    function addDebrisPiece({
        id = null,
        partId = '',
        mesh,
        velocity,
        angularVelocity,
        life,
        groundOffset = 0.14,
        drag = crashDamageTuning.debrisDrag,
        bounce = crashDamageTuning.debrisBounceDamping,
        wheelRoll = null,
        bodyRest = null,
    }) {
        const nextId = Number.isFinite(id) ? Math.max(1, Math.round(id)) : nextDebrisPieceId++;
        if (nextId >= nextDebrisPieceId) {
            nextDebrisPieceId = nextId + 1;
        }
        const piece = {
            id: nextId,
            partId: typeof partId === 'string' ? partId : '',
            mesh,
            velocity,
            angularVelocity,
            life: Number.isFinite(life) ? life : Number.POSITIVE_INFINITY,
            groundOffset,
            drag,
            bounce,
            settled: false,
            wheelRoll,
            bodyRest,
            networkMissCount: 0,
            networkSeenThisSync: false,
        };
        debrisPieces.push(piece);
        debrisPieceById.set(piece.id, piece);
        return piece;
    }

    function updateDebris(dt) {
        for (let i = debrisPieces.length - 1; i >= 0; i -= 1) {
            const piece = debrisPieces[i];
            if (Number.isFinite(piece.life)) {
                piece.life -= dt;
                if (piece.life <= 0) {
                    removeDebrisPieceAtIndex(i);
                    continue;
                }
            }
            if (piece.settled) {
                continue;
            }

            piece.velocity.y -= crashDamageTuning.debrisGravity * dt;
            const pieceDrag = Number.isFinite(piece.drag)
                ? piece.drag
                : crashDamageTuning.debrisDrag;
            piece.velocity.multiplyScalar(Math.exp(-pieceDrag * dt));
            piece.mesh.position.addScaledVector(piece.velocity, dt);
            piece.mesh.rotation.x += piece.angularVelocity.x * dt;
            piece.mesh.rotation.y += piece.angularVelocity.y * dt;
            piece.mesh.rotation.z += piece.angularVelocity.z * dt;

            const bottomY = getDebrisBottomY(piece);
            const groundY = getDebrisGroundHeightAt(piece.mesh.position.x, piece.mesh.position.z);
            const groundPenetration = groundY - bottomY;
            const nearGroundContact = groundPenetration >= -0.0025;
            if (groundPenetration > 0) {
                piece.mesh.position.y += groundPenetration;
            }
            if (nearGroundContact) {
                if (piece.velocity.y < 0) {
                    const pieceBounce = Number.isFinite(piece.bounce)
                        ? piece.bounce
                        : crashDamageTuning.debrisBounceDamping;
                    piece.velocity.y = -piece.velocity.y * pieceBounce;
                }
                piece.velocity.x *= 0.88;
                piece.velocity.z *= 0.88;
                piece.angularVelocity.multiplyScalar(0.96);

                const wheelRoll = piece.wheelRoll;
                if (wheelRoll && wheelRoll.drive > 0.02) {
                    wheelRoll.wobblePhase += dt * wheelRoll.wobbleRate;
                    wheelRoll.heading += Math.sin(wheelRoll.wobblePhase) * wheelRoll.turnRate * dt;
                    piece.velocity.x += Math.cos(wheelRoll.heading) * wheelRoll.drive * dt;
                    piece.velocity.z += Math.sin(wheelRoll.heading) * wheelRoll.drive * dt;
                    wheelRoll.drive = Math.max(0, wheelRoll.drive - wheelRoll.decel * dt);
                    wheelRoll.spin = Math.max(
                        0,
                        wheelRoll.spin - (3.2 + wheelRoll.decel * 0.7) * dt
                    );
                    piece.mesh.rotation.x += wheelRoll.spin * dt;
                }
                if (wheelRoll) {
                    alignWheelDebrisPose(piece, dt);
                }
                if (piece.bodyRest) {
                    alignBodyPanelDebrisPose(piece, dt);
                }

                const horizontalSpeed = Math.hypot(piece.velocity.x, piece.velocity.z);
                const angularSpeed = piece.angularVelocity.length();
                const settleHorizontalThreshold = piece.wheelRoll
                    ? DEBRIS_SETTLE_HORIZONTAL_SPEED * 1.6
                    : DEBRIS_SETTLE_HORIZONTAL_SPEED;
                const settleAngularThreshold = piece.wheelRoll
                    ? DEBRIS_SETTLE_ANGULAR_SPEED * 1.8
                    : DEBRIS_SETTLE_ANGULAR_SPEED;
                const wheelStillRolling = Boolean(piece.wheelRoll && piece.wheelRoll.drive > 0.08);
                if (
                    !wheelStillRolling &&
                    Math.abs(piece.velocity.y) <= DEBRIS_SETTLE_VERTICAL_SPEED &&
                    horizontalSpeed <= settleHorizontalThreshold &&
                    angularSpeed <= settleAngularThreshold
                ) {
                    piece.velocity.set(0, 0, 0);
                    piece.angularVelocity.set(0, 0, 0);
                    if (piece.wheelRoll) {
                        piece.wheelRoll.drive = 0;
                        piece.wheelRoll.spin = 0;
                        snapWheelDebrisPose(piece);
                    }
                    if (piece.bodyRest) {
                        snapBodyPanelDebrisPose(piece);
                    }
                    piece.settled = true;
                }
            }
        }

        if (explosionLightAttached && explosionLight) {
            explosionLightLife -= dt;
            const lifeRatio = Math.max(explosionLightLife / EXPLOSION_LIGHT_MAX_LIFE, 0);
            explosionLight.intensity = 4.8 * lifeRatio;
            explosionLight.distance = 28 + lifeRatio * 22;
            if (explosionLightLife <= 0) {
                detachExplosionLight();
            }
        }
    }

    function clearDebris() {
        for (let i = debrisPieces.length - 1; i >= 0; i -= 1) {
            removeDebrisPieceAtIndex(i);
        }
        debrisPieces.length = 0;
        debrisPieceById.clear();

        detachExplosionLight();
    }

    function removeDebrisPieceAtIndex(index) {
        const piece = debrisPieces[index];
        if (!piece) {
            return;
        }
        scene.remove(piece.mesh);
        recycleDebrisMesh(piece.partId, piece.mesh);
        debrisPieceById.delete(piece.id);
        debrisPieces.splice(index, 1);
    }

    function ensureExplosionLightAttached() {
        if (!explosionLight) {
            explosionLight = new THREE.PointLight(0xff7a4f, 4.8, 50, 2);
        }
        if (!explosionLightAttached) {
            scene.add(explosionLight);
            explosionLightAttached = true;
        }
        return explosionLight;
    }

    function detachExplosionLight() {
        if (explosionLightAttached && explosionLight) {
            scene.remove(explosionLight);
        }
        explosionLightAttached = false;
        explosionLightLife = 0;
    }

    function applyExplosionSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') {
            detachExplosionLight();
            return;
        }

        const activeExplosionLight = ensureExplosionLightAttached();

        activeExplosionLight.position.set(
            coerceFinite(snapshot.x, activeExplosionLight.position.x),
            coerceFinite(snapshot.y, activeExplosionLight.position.y),
            coerceFinite(snapshot.z, activeExplosionLight.position.z)
        );
        explosionLightLife = THREE.MathUtils.clamp(
            coerceFinite(snapshot.life, EXPLOSION_LIGHT_MAX_LIFE),
            0,
            EXPLOSION_LIGHT_MAX_LIFE
        );
        if (explosionLightLife <= 0) {
            detachExplosionLight();
            return;
        }
        activeExplosionLight.intensity = 4.8;
        activeExplosionLight.distance = 50;
    }

    function ensureCrashPartIndex() {
        if (crashPartById.size > 0) {
            return;
        }
        crashPartById.clear();
        for (let i = 0; i < crashParts.length; i += 1) {
            const part = crashParts[i];
            if (part?.id) {
                crashPartById.set(part.id, part);
            }
        }
    }

    function deserializeWheelRollState(value) {
        if (!value || typeof value !== 'object') {
            return null;
        }
        return {
            drive: coerceFinite(value.drive, 0),
            heading: coerceFinite(value.heading, 0),
            turnRate: coerceFinite(value.turnRate, 0),
            wobblePhase: coerceFinite(value.wobblePhase, 0),
            wobbleRate: coerceFinite(value.wobbleRate, 0),
            decel: coerceFinite(value.decel, 0),
            spin: coerceFinite(value.spin, 0),
            restPose: value.restPose === 'flat' ? 'flat' : 'upright',
            restYaw: coerceFinite(value.restYaw, 0),
        };
    }

    function deserializeBodyRestState(value) {
        if (!value || typeof value !== 'object') {
            return null;
        }
        return {
            yaw: coerceFinite(value.yaw, 0),
        };
    }

    function coerceFinite(value, fallback = 0) {
        return Number.isFinite(value) ? value : fallback;
    }

    function disposeDebrisObject(object3D) {
        object3D.traverse((node) => {
            if (!node.isMesh) {
                return;
            }
            if (node.geometry) {
                node.geometry.dispose();
            }
            if (Array.isArray(node.material)) {
                node.material.forEach((material) => material?.dispose?.());
                return;
            }
            node.material?.dispose?.();
        });
    }
}
