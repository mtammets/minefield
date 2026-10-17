const PICKUP_ID_MAX_LENGTH = 96;
const PICKUP_MAX_PLAYER_DISTANCE = 4.6;
const PICKUP_MAX_STATE_AGE_MS = 1000;
const PICKUP_CELL_SIZE = 34;
const PICKUP_CELL_MARGIN = 4;
const PICKUP_CELL_COORD_ABS_LIMIT = 512;
const PICKUP_CELL_POSITION_TOLERANCE = 1.8;
const PICKUP_HISTORY_MAX_ENTRIES = 2048;
const PICKUP_HISTORY_TTL_MS = 8 * 60 * 1000;
const PICKUP_FIXED_SERIAL_ABS_LIMIT = 5000;

function clampFinite(value, min, max, fallback = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
}

function sanitizePickupId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .trim()
        .replace(/[^\w:\-]/g, '')
        .slice(0, PICKUP_ID_MAX_LENGTH);
}

function sanitizePickupCollectionPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const pickupId = sanitizePickupId(payload.pickupId);
    if (!pickupId) {
        return null;
    }

    const x = clampFinite(payload.x, -5000, 5000, Number.NaN);
    const y = clampFinite(payload.y, -500, 2500, Number.NaN);
    const z = clampFinite(payload.z, -5000, 5000, Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return null;
    }

    return {
        pickupId,
        x,
        y,
        z,
    };
}

function parsePickupId(pickupId, totalPickups = 0) {
    const normalizedPickupId = sanitizePickupId(pickupId);
    if (!normalizedPickupId) {
        return {
            ok: false,
            reason: 'pickup-id-missing',
        };
    }

    const fixedMatch = /^pickup:fixed:(\d{1,6})$/.exec(normalizedPickupId);
    if (fixedMatch) {
        const serial = Number(fixedMatch[1]);
        if (!Number.isFinite(serial) || serial < 0 || serial > PICKUP_FIXED_SERIAL_ABS_LIMIT) {
            return {
                ok: false,
                reason: 'pickup-id-out-of-range',
            };
        }

        const normalizedTotalPickups = Math.max(0, Math.round(Number(totalPickups) || 0));
        if (normalizedTotalPickups > 0 && serial >= normalizedTotalPickups) {
            return {
                ok: false,
                reason: 'pickup-id-out-of-range',
            };
        }

        return {
            ok: true,
            type: 'fixed',
            serial,
        };
    }

    const cellMatch = /^pickup:(-?\d{1,4}):(-?\d{1,4})$/.exec(normalizedPickupId);
    if (cellMatch) {
        const cellX = Number(cellMatch[1]);
        const cellZ = Number(cellMatch[2]);
        if (
            !Number.isFinite(cellX) ||
            !Number.isFinite(cellZ) ||
            Math.abs(cellX) > PICKUP_CELL_COORD_ABS_LIMIT ||
            Math.abs(cellZ) > PICKUP_CELL_COORD_ABS_LIMIT
        ) {
            return {
                ok: false,
                reason: 'pickup-id-out-of-range',
            };
        }

        return {
            ok: true,
            type: 'cell',
            cellX: Math.trunc(cellX),
            cellZ: Math.trunc(cellZ),
        };
    }

    return {
        ok: false,
        reason: 'pickup-id-format',
    };
}

function validatePickupCollection({
    room,
    playerId,
    payload,
    nowMs = Date.now(),
    maxPlayerDistance = PICKUP_MAX_PLAYER_DISTANCE,
    maxStateAgeMs = PICKUP_MAX_STATE_AGE_MS,
} = {}) {
    if (!room || !(room.players instanceof Map) || typeof playerId !== 'string' || !playerId) {
        return { ok: false, reason: 'invalid-context' };
    }

    const player = room.players.get(playerId);
    if (!player) {
        return { ok: false, reason: 'player-missing' };
    }

    const sanitizedPayload = sanitizePickupCollectionPayload(payload);
    if (!sanitizedPayload) {
        return { ok: false, reason: 'invalid-payload' };
    }

    const roundTotalPickups = Math.max(0, Math.round(Number(room?.roundState?.totalPickups) || 0));
    const pickupIdMeta = parsePickupId(sanitizedPayload.pickupId, roundTotalPickups);
    if (!pickupIdMeta.ok) {
        return { ok: false, reason: pickupIdMeta.reason };
    }

    const seenPickups = ensurePickupHistoryMap(room);
    if (seenPickups.has(sanitizedPayload.pickupId)) {
        return { ok: false, reason: 'pickup-duplicate' };
    }

    const playerState = player.lastState;
    if (!playerState || typeof playerState !== 'object') {
        return { ok: false, reason: 'missing-player-state' };
    }

    const playerStateAt = Number(player.lastStateAt);
    if (!Number.isFinite(playerStateAt) || playerStateAt <= 0) {
        return { ok: false, reason: 'missing-player-state' };
    }

    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    if (
        now - playerStateAt >
        Math.max(100, Math.round(Number(maxStateAgeMs) || PICKUP_MAX_STATE_AGE_MS))
    ) {
        return { ok: false, reason: 'stale-player-state' };
    }

    const playerX = clampFinite(playerState.x, -5000, 5000, Number.NaN);
    const playerZ = clampFinite(playerState.z, -5000, 5000, Number.NaN);
    const playerY = clampFinite(playerState.y, -500, 2500, Number.NaN);
    if (!Number.isFinite(playerX) || !Number.isFinite(playerZ) || !Number.isFinite(playerY)) {
        return { ok: false, reason: 'missing-player-state' };
    }

    const dx = sanitizedPayload.x - playerX;
    const dz = sanitizedPayload.z - playerZ;
    const horizontalDistance = Math.hypot(dx, dz);
    if (
        horizontalDistance > Math.max(0.8, Number(maxPlayerDistance) || PICKUP_MAX_PLAYER_DISTANCE)
    ) {
        return { ok: false, reason: 'pickup-too-far' };
    }

    const verticalDistance = Math.abs(sanitizedPayload.y - playerY);
    if (verticalDistance > 9.5) {
        return { ok: false, reason: 'pickup-height-mismatch' };
    }

    if (pickupIdMeta.type === 'cell') {
        const minX =
            pickupIdMeta.cellX * PICKUP_CELL_SIZE +
            PICKUP_CELL_MARGIN -
            PICKUP_CELL_POSITION_TOLERANCE;
        const maxX =
            (pickupIdMeta.cellX + 1) * PICKUP_CELL_SIZE -
            PICKUP_CELL_MARGIN +
            PICKUP_CELL_POSITION_TOLERANCE;
        const minZ =
            pickupIdMeta.cellZ * PICKUP_CELL_SIZE +
            PICKUP_CELL_MARGIN -
            PICKUP_CELL_POSITION_TOLERANCE;
        const maxZ =
            (pickupIdMeta.cellZ + 1) * PICKUP_CELL_SIZE -
            PICKUP_CELL_MARGIN +
            PICKUP_CELL_POSITION_TOLERANCE;
        if (
            sanitizedPayload.x < minX ||
            sanitizedPayload.x > maxX ||
            sanitizedPayload.z < minZ ||
            sanitizedPayload.z > maxZ
        ) {
            return { ok: false, reason: 'pickup-id-mismatch' };
        }
    }

    return {
        ok: true,
        pickupId: sanitizedPayload.pickupId,
        pickup: sanitizedPayload,
        pickupIdMeta,
    };
}

function ensurePickupHistoryMap(room) {
    if (room.collectedPickupIds instanceof Map) {
        return room.collectedPickupIds;
    }

    const upgraded = new Map();
    room.collectedPickupIds = upgraded;
    return upgraded;
}

function markPickupCollected(room, pickupId, nowMs = Date.now()) {
    if (!room || typeof room !== 'object') {
        return false;
    }

    const normalizedPickupId = sanitizePickupId(pickupId);
    if (!normalizedPickupId) {
        return false;
    }

    const history = ensurePickupHistoryMap(room);
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    history.set(normalizedPickupId, now);
    pruneCollectedPickupHistory(room, now);
    return true;
}

function pruneCollectedPickupHistory(
    room,
    nowMs = Date.now(),
    maxEntries = PICKUP_HISTORY_MAX_ENTRIES,
    ttlMs = PICKUP_HISTORY_TTL_MS
) {
    if (!room || !(room.collectedPickupIds instanceof Map) || room.collectedPickupIds.size === 0) {
        return;
    }

    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const entryTtlMs = Math.max(20_000, Math.round(Number(ttlMs) || PICKUP_HISTORY_TTL_MS));
    for (const [pickupId, collectedAt] of room.collectedPickupIds.entries()) {
        const collectedAtMs = Number(collectedAt);
        if (!Number.isFinite(collectedAtMs) || now - collectedAtMs >= entryTtlMs) {
            room.collectedPickupIds.delete(pickupId);
        }
    }

    const cap = Math.max(64, Math.round(Number(maxEntries) || PICKUP_HISTORY_MAX_ENTRIES));
    while (room.collectedPickupIds.size > cap) {
        const oldestEntry = room.collectedPickupIds.keys().next();
        if (oldestEntry.done) {
            break;
        }
        room.collectedPickupIds.delete(oldestEntry.value);
    }
}

module.exports = {
    PICKUP_MAX_PLAYER_DISTANCE,
    PICKUP_MAX_STATE_AGE_MS,
    sanitizePickupCollectionPayload,
    parsePickupId,
    validatePickupCollection,
    markPickupCollected,
    pruneCollectedPickupHistory,
};
