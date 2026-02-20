const ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT = 30;

function clampRoundTotal(totalPickups) {
    const numeric = Number(totalPickups);
    if (!Number.isFinite(numeric)) {
        return ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT;
    }
    return Math.max(1, Math.min(5000, Math.round(numeric)));
}

function createRoomRoundState(totalPickups = ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT) {
    return {
        totalPickups: clampRoundTotal(totalPickups),
        totalCollected: 0,
        finished: false,
        finishedAt: 0,
    };
}

function recalculateRoomRoundStateFromPlayers(roundState, players) {
    const state =
        roundState && typeof roundState === 'object' ? roundState : createRoomRoundState();
    const playerMap = players instanceof Map ? players : new Map();
    let totalCollected = 0;
    for (const player of playerMap.values()) {
        totalCollected += Math.max(0, Math.round(Number(player?.collectedCount) || 0));
    }
    state.totalCollected = totalCollected;
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

    recalculateRoomRoundStateFromPlayers(roundState, room.players);
    return {
        ok: true,
        playerCollectedCount: player.collectedCount,
        roundState,
    };
}

function serializeRoomRoundState(roundState) {
    const state =
        roundState && typeof roundState === 'object' ? roundState : createRoomRoundState();
    return {
        totalPickups: clampRoundTotal(state.totalPickups),
        totalCollected: Math.max(0, Math.round(Number(state.totalCollected) || 0)),
        finished: Boolean(state.finished),
        finishedAt: Math.max(0, Math.round(Number(state.finishedAt) || 0)),
    };
}

module.exports = {
    ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT,
    createRoomRoundState,
    applyPlayerPickupScore,
    recalculateRoomRoundStateFromPlayers,
    serializeRoomRoundState,
    clampRoundTotal,
};
