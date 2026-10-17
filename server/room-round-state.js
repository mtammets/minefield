const ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT = 30;
const SCORE_BASE_POINTS = 100;
const MINE_KILL_BASE_POINTS = 300;
const SCORE_MAX_TOTAL = Number.MAX_SAFE_INTEGER;

function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
}

function clampScore(value) {
    return Math.max(0, Math.min(SCORE_MAX_TOTAL, Math.round(Number(value) || 0)));
}

function clampRoundTotal(totalPickups) {
    const value = clampNumber(totalPickups, 1, 5000, ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT);
    return Math.max(1, Math.min(5000, Math.round(value)));
}

function createRoomRoundState(totalPickups = ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT) {
    return {
        totalPickups: clampRoundTotal(totalPickups),
        totalCollected: 0,
        totalScore: 0,
        finished: false,
        finishedAt: 0,
    };
}

function recalculateRoomRoundStateFromPlayers(roundState, players) {
    const state =
        roundState && typeof roundState === 'object' ? roundState : createRoomRoundState();
    const playerMap = players instanceof Map ? players : new Map();
    let totalCollected = 0;
    let totalScore = 0;
    for (const player of playerMap.values()) {
        totalCollected += Math.max(0, Math.round(Number(player?.collectedCount) || 0));
        totalScore += clampScore(player?.score);
    }
    state.totalCollected = totalCollected;
    state.totalScore = clampScore(totalScore);
    if (state.totalCollected >= state.totalPickups) {
        if (!state.finished) {
            state.finishedAt = Date.now();
        }
        state.finished = true;
        state.totalCollected = state.totalPickups;
    } else {
        state.finished = false;
        state.finishedAt = 0;
    }
    return state;
}

function resolvePickupScore() {
    return {
        rule: 'pickup',
        label: 'Pickup',
        basePoints: SCORE_BASE_POINTS,
        pointsAwarded: SCORE_BASE_POINTS,
    };
}

function resolveMineKillScore() {
    return {
        rule: 'mine-kill',
        label: 'Mine kill',
        basePoints: MINE_KILL_BASE_POINTS,
        pointsAwarded: MINE_KILL_BASE_POINTS,
    };
}

function applyPlayerPickupScore({
    room,
    playerId,
    nowMs = Date.now(),
    pickupCooldownMs = 180,
    maxPerSecond = 6,
}) {
    if (!room || typeof room !== 'object' || !(room.players instanceof Map)) {
        return { ok: false, reason: 'invalid-room' };
    }
    if (typeof playerId !== 'string' || !playerId) {
        return { ok: false, reason: 'invalid-player-id' };
    }

    const player = room.players.get(playerId);
    if (!player) {
        return { ok: false, reason: 'missing-player' };
    }

    const roundState =
        room.roundState && typeof room.roundState === 'object'
            ? room.roundState
            : (room.roundState = createRoomRoundState());
    if (roundState.finished) {
        return { ok: false, reason: 'round-finished', roundState };
    }

    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const cooldown = Math.max(60, Math.round(Number(pickupCooldownMs) || 180));
    const perSecondCap = Math.max(1, Math.round(Number(maxPerSecond) || 6));

    const lastPickupAt = Number.isFinite(player.lastPickupAt) ? player.lastPickupAt : 0;
    if (now - lastPickupAt < cooldown) {
        return { ok: false, reason: 'pickup-cooldown', roundState };
    }

    const capWindowMs = 1000;
    const capWindowStartedAt = Number.isFinite(player.pickupWindowStartedAt)
        ? player.pickupWindowStartedAt
        : now;
    if (now - capWindowStartedAt >= capWindowMs) {
        player.pickupWindowStartedAt = now;
        player.pickupWindowCount = 0;
    }
    const pickupWindowCount = Math.max(0, Math.round(Number(player.pickupWindowCount) || 0));
    if (pickupWindowCount >= perSecondCap) {
        return { ok: false, reason: 'pickup-rate-limit', roundState };
    }

    player.pickupWindowCount = pickupWindowCount + 1;
    player.lastPickupAt = now;
    player.collectedCount = Math.max(0, Math.round(Number(player.collectedCount) || 0)) + 1;

    const scoring = resolvePickupScore();
    player.score = clampScore(clampScore(player.score) + scoring.pointsAwarded);
    player.lastPickupPoints = scoring.pointsAwarded;

    recalculateRoomRoundStateFromPlayers(roundState, room.players);
    return {
        ok: true,
        playerCollectedCount: player.collectedCount,
        playerScore: player.score,
        pointsAwarded: scoring.pointsAwarded,
        scoring,
        roundState,
    };
}

function applyPlayerMineKillScore({
    room,
    ownerPlayerId,
    targetPlayerId,
} = {}) {
    if (!room || typeof room !== 'object' || !(room.players instanceof Map)) {
        return { ok: false, reason: 'invalid-room' };
    }
    if (typeof ownerPlayerId !== 'string' || !ownerPlayerId) {
        return { ok: false, reason: 'invalid-owner-id' };
    }
    if (typeof targetPlayerId !== 'string' || !targetPlayerId) {
        return { ok: false, reason: 'invalid-target-id' };
    }
    if (ownerPlayerId === targetPlayerId) {
        return { ok: false, reason: 'self-kill' };
    }

    const ownerPlayer = room.players.get(ownerPlayerId);
    if (!ownerPlayer) {
        return { ok: false, reason: 'missing-owner' };
    }
    const targetPlayer = room.players.get(targetPlayerId);
    if (!targetPlayer) {
        return { ok: false, reason: 'missing-target' };
    }

    const roundState =
        room.roundState && typeof room.roundState === 'object'
            ? room.roundState
            : (room.roundState = createRoomRoundState());
    if (roundState.finished) {
        return { ok: false, reason: 'round-finished', roundState };
    }

    const scoring = resolveMineKillScore();
    ownerPlayer.score = clampScore(clampScore(ownerPlayer.score) + scoring.pointsAwarded);
    ownerPlayer.lastMineKillPoints = scoring.pointsAwarded;

    recalculateRoomRoundStateFromPlayers(roundState, room.players);
    return {
        ok: true,
        ownerPlayerId,
        targetPlayerId,
        ownerScore: ownerPlayer.score,
        pointsAwarded: scoring.pointsAwarded,
        scoring,
        roundState,
    };
}

function serializeRoomRoundState(roundState) {
    const state =
        roundState && typeof roundState === 'object' ? roundState : createRoomRoundState();
    return {
        totalPickups: clampRoundTotal(state.totalPickups),
        totalCollected: Math.max(0, Math.round(Number(state.totalCollected) || 0)),
        totalScore: clampScore(state.totalScore),
        finished: Boolean(state.finished),
        finishedAt: Math.max(0, Math.round(Number(state.finishedAt) || 0)),
    };
}

module.exports = {
    ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT,
    SCORE_BASE_POINTS,
    MINE_KILL_BASE_POINTS,
    createRoomRoundState,
    applyPlayerPickupScore,
    applyPlayerMineKillScore,
    recalculateRoomRoundStateFromPlayers,
    serializeRoomRoundState,
    clampRoundTotal,
    resolvePickupScore,
    resolveMineKillScore,
};
