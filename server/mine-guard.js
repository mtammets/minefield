function clampFinite(value, min, max, fallback = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
}

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

    const dx = clampFinite(targetState.x, -5000, 5000, 0) - mine.x;
    const dz = clampFinite(targetState.z, -5000, 5000, 0) - mine.z;
    const distanceSq = dx * dx + dz * dz;
    const triggerRadius = Math.max(0.8, clampFinite(mine.triggerRadius, 0.8, 4, 1.5));
    const allowedRadius = triggerRadius + 1.05;
    if (distanceSq > allowedRadius * allowedRadius) {
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
