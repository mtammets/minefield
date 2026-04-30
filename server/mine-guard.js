function clampFinite(value, min, max, fallback = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
}

const TARGET_COLLISION_RADIUS_DEFAULT = 1.34;
const DETONATION_VALIDATION_TOLERANCE = 0.3;
const SEGMENT_STATE_MAX_AGE_MS = 480;
const TIMED_THROW_DETONATION_TYPE = 'timed_throw';
const TIMED_THROW_AUTO_DETONATE_DELAY_MS = 1000;
const TIMED_THROW_MIN_FLIGHT_MS = 700;
const TIMED_THROW_POSITION_TOLERANCE = 1.25;

function resolveAuthoritativeMineDetonation({
    room,
    mine,
    reportingPlayerId,
    detonation,
    nowMs = Date.now(),
}) {
    if (!room || !mine || !room.players?.has?.(reportingPlayerId)) {
        return { ok: false, reason: 'invalid-context' };
    }

    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    if (mine.expiresAt <= now) {
        return { ok: false, reason: 'mine-expired' };
    }

    if (detonation?.detonationType === TIMED_THROW_DETONATION_TYPE) {
        return resolveTimedThrowDetonation({
            room,
            mine,
            reportingPlayerId,
            detonation,
            now,
        });
    }

    const triggerPlayerId = sanitizeRoomPlayerId(
        detonation?.triggerPlayerId,
        room,
        reportingPlayerId
    );
    const targetPlayerId = sanitizeRoomPlayerId(
        detonation?.targetPlayerId,
        room,
        reportingPlayerId
    );
    if (!targetPlayerId || targetPlayerId !== reportingPlayerId) {
        return { ok: false, reason: 'target-mismatch' };
    }

    const targetPlayer = room.players.get(targetPlayerId);
    const targetState = targetPlayer?.lastState || null;
    if (!targetState) {
        return { ok: false, reason: 'missing-target-state' };
    }

    const targetPosition = sanitizeStatePosition(targetState);
    if (!targetPosition) {
        return { ok: false, reason: 'missing-target-state' };
    }
    const previousTargetPosition = sanitizeStatePosition(targetPlayer?.previousState || null);
    const targetCollisionRadius = Math.max(
        0.6,
        clampFinite(targetState?.collisionRadius, 0.6, 4, TARGET_COLLISION_RADIUS_DEFAULT)
    );
    const triggerRadius = Math.max(0.8, clampFinite(mine.triggerRadius, 0.8, 4, 1.5));
    const allowedRadius = triggerRadius + targetCollisionRadius + DETONATION_VALIDATION_TOLERANCE;
    const allowedDistanceSq = allowedRadius * allowedRadius;
    let minDistanceSq = distanceSq(targetPosition.x - mine.x, targetPosition.z - mine.z);

    const targetStateAt = Number(targetPlayer?.lastStateAt);
    const previousStateAt = Number(targetPlayer?.previousStateAt);
    const canUseSegmentDistance =
        previousTargetPosition &&
        Number.isFinite(targetStateAt) &&
        Number.isFinite(previousStateAt) &&
        targetStateAt >= previousStateAt &&
        now - targetStateAt <= SEGMENT_STATE_MAX_AGE_MS &&
        now - previousStateAt <= SEGMENT_STATE_MAX_AGE_MS * 2;
    if (canUseSegmentDistance) {
        minDistanceSq = Math.min(
            minDistanceSq,
            distancePointToSegmentSq(
                mine.x,
                mine.z,
                previousTargetPosition.x,
                previousTargetPosition.z,
                targetPosition.x,
                targetPosition.z
            )
        );
    }

    if (minDistanceSq > allowedDistanceSq) {
        return { ok: false, reason: 'target-too-far' };
    }

    const isOwnerTriggered = mine.ownerId === triggerPlayerId;
    if (now < mine.armedAt && !isOwnerTriggered) {
        return { ok: false, reason: 'mine-not-armed' };
    }

    return {
        ok: true,
        detonation: {
            mineId: mine.id,
            ownerId: mine.ownerId,
            ownerName: mine.ownerName,
            x: mine.x,
            y: mine.y,
            z: mine.z,
            triggerPlayerId,
            targetPlayerId,
        },
    };
}

function resolveTimedThrowDetonation({
    room,
    mine,
    reportingPlayerId,
    detonation,
    now,
}) {
    if (!mine?.thrown) {
        return { ok: false, reason: 'timed-throw-not-thrown' };
    }
    if (reportingPlayerId !== mine.ownerId) {
        return { ok: false, reason: 'timed-throw-owner-mismatch' };
    }

    const landedAt = clampFinite(
        detonation?.landedAt,
        0,
        Number.MAX_SAFE_INTEGER,
        Number.NaN
    );
    if (!Number.isFinite(landedAt)) {
        return { ok: false, reason: 'timed-throw-missing-landed-at' };
    }

    if (landedAt < mine.createdAt + TIMED_THROW_MIN_FLIGHT_MS) {
        return { ok: false, reason: 'timed-throw-landed-too-soon' };
    }
    if (now < landedAt + TIMED_THROW_AUTO_DETONATE_DELAY_MS) {
        return { ok: false, reason: 'timed-throw-too-early' };
    }

    const detonationX = clampFinite(detonation?.x, -5000, 5000, Number.NaN);
    const detonationY = clampFinite(detonation?.y, -500, 2500, mine.y);
    const detonationZ = clampFinite(detonation?.z, -5000, 5000, Number.NaN);
    if (!Number.isFinite(detonationX) || !Number.isFinite(detonationZ)) {
        return { ok: false, reason: 'timed-throw-missing-position' };
    }

    const flightDurationSec = Math.max(0, (landedAt - mine.createdAt) / 1000);
    const horizontalSpeed = Math.hypot(
        clampFinite(mine.velocityX, -140, 140, 0),
        clampFinite(mine.velocityZ, -140, 140, 0)
    );
    const maxTravelDistance =
        horizontalSpeed * flightDurationSec + mine.triggerRadius + TIMED_THROW_POSITION_TOLERANCE;
    const travelDistance = Math.hypot(detonationX - mine.x, detonationZ - mine.z);
    if (travelDistance > maxTravelDistance) {
        return { ok: false, reason: 'timed-throw-position-too-far' };
    }

    return {
        ok: true,
        detonation: {
            mineId: mine.id,
            ownerId: mine.ownerId,
            ownerName: mine.ownerName,
            x: detonationX,
            y: detonationY,
            z: detonationZ,
            triggerPlayerId: mine.ownerId,
            targetPlayerId: '',
        },
    };
}

function sanitizeStatePosition(state) {
    if (!state || typeof state !== 'object') {
        return null;
    }
    const x = clampFinite(state.x, -5000, 5000, Number.NaN);
    const z = clampFinite(state.z, -5000, 5000, Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
        return null;
    }
    return { x, z };
}

function distanceSq(x, z) {
    return x * x + z * z;
}

function distancePointToSegmentSq(pointX, pointZ, startX, startZ, endX, endZ) {
    const segX = endX - startX;
    const segZ = endZ - startZ;
    const segLenSq = segX * segX + segZ * segZ;
    if (segLenSq <= 1e-8) {
        return distanceSq(pointX - startX, pointZ - startZ);
    }

    const toPointX = pointX - startX;
    const toPointZ = pointZ - startZ;
    const projection = (toPointX * segX + toPointZ * segZ) / segLenSq;
    const clampedT = Math.max(0, Math.min(1, projection));
    const closestX = startX + segX * clampedT;
    const closestZ = startZ + segZ * clampedT;
    return distanceSq(pointX - closestX, pointZ - closestZ);
}

function sanitizeRoomPlayerId(value, room, fallback = '') {
    const resolved = sanitizeSocketLikeId(value);
    if (resolved && room?.players?.has?.(resolved)) {
        return resolved;
    }
    const fallbackSanitized = sanitizeSocketLikeId(fallback);
    if (fallbackSanitized && room?.players?.has?.(fallbackSanitized)) {
        return fallbackSanitized;
    }
    return '';
}

function sanitizeSocketLikeId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .trim()
        .replace(/[^\w\-]/g, '')
        .slice(0, 128);
}

module.exports = {
    resolveAuthoritativeMineDetonation,
    sanitizeRoomPlayerId,
};
