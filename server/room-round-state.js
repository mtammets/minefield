const ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT = 30;
const SCORE_BASE_POINTS = 100;
const SCORE_COMBO_WINDOW_MS = 4000;
const SCORE_COMBO_STEP = 0.12;
const SCORE_COMBO_MAX_MULTIPLIER = 2.2;
const SCORE_RISK_MIN_SPEED_KPH = 35;
const SCORE_RISK_MAX_SPEED_KPH = 120;
const SCORE_RISK_MAX_BONUS = 0.35;
const SCORE_ENDGAME_START_PROGRESS = 0.8;
const SCORE_ENDGAME_MAX_BONUS = 0.5;
const SCORE_MAX_TOTAL = Number.MAX_SAFE_INTEGER;
const MINE_KILL_BASE_POINTS = 220;
const MINE_KILL_CHAIN_WINDOW_MS = 5000;
const MINE_KILL_CHAIN_STEP = 0.2;
const MINE_KILL_CHAIN_MAX_MULTIPLIER = 1.8;
const MINE_KILL_ENDGAME_BONUS = 0.25;
const MINE_KILL_REPEAT_WINDOW_MS = 15_000;
const MINE_KILL_REPEAT_PENALTY_MULTIPLIER = 0.55;

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

function resolvePickupScore({ comboCount = 1, speedKph = 0, roundProgress = 0 } = {}) {
    const normalizedComboCount = Math.max(1, Math.round(Number(comboCount) || 1));
    const comboIndex = Math.max(0, normalizedComboCount - 1);
    const comboMultiplier = Math.min(SCORE_COMBO_MAX_MULTIPLIER, 1 + comboIndex * SCORE_COMBO_STEP);

    const normalizedSpeed = clampNumber(
        (Math.abs(Number(speedKph) || 0) - SCORE_RISK_MIN_SPEED_KPH) /
            Math.max(1, SCORE_RISK_MAX_SPEED_KPH - SCORE_RISK_MIN_SPEED_KPH),
        0,
        1,
        0
    );
    const riskBonus = normalizedSpeed * SCORE_RISK_MAX_BONUS;

    const normalizedProgress = clampNumber(roundProgress, 0, 1, 0);
    const endgameNormalized = clampNumber(
        (normalizedProgress - SCORE_ENDGAME_START_PROGRESS) /
            Math.max(1e-6, 1 - SCORE_ENDGAME_START_PROGRESS),
        0,
        1,
        0
    );
    const endgameBonus = endgameNormalized * SCORE_ENDGAME_MAX_BONUS;

    const scoreMultiplier = comboMultiplier * (1 + riskBonus + endgameBonus);
    const pointsAwarded = Math.max(1, Math.round(SCORE_BASE_POINTS * scoreMultiplier));

    return {
        pointsAwarded,
        comboCount: normalizedComboCount,
        comboMultiplier,
        riskBonus,
        endgameBonus,
        speedKph: clampNumber(Math.abs(Number(speedKph) || 0), 0, 400, 0),
        roundProgress: normalizedProgress,
    };
}

function resolveMineKillScore({ chainCount = 1, roundProgress = 0, repeatedTarget = false } = {}) {
    const normalizedChainCount = Math.max(1, Math.round(Number(chainCount) || 1));
    const chainIndex = Math.max(0, normalizedChainCount - 1);
    const chainMultiplier = Math.min(
        MINE_KILL_CHAIN_MAX_MULTIPLIER,
        1 + chainIndex * MINE_KILL_CHAIN_STEP
    );

    const normalizedProgress = clampNumber(roundProgress, 0, 1, 0);
    const endgameBonus =
        normalizedProgress >= SCORE_ENDGAME_START_PROGRESS ? MINE_KILL_ENDGAME_BONUS : 0;
    const antiFarmMultiplier = repeatedTarget ? MINE_KILL_REPEAT_PENALTY_MULTIPLIER : 1;
    const pointsAwarded = Math.max(
        1,
        Math.round(
            MINE_KILL_BASE_POINTS * chainMultiplier * (1 + endgameBonus) * antiFarmMultiplier
        )
    );

    return {
        pointsAwarded,
        chainCount: normalizedChainCount,
        chainMultiplier,
        endgameBonus,
        antiFarmMultiplier,
        repeatedTarget: Boolean(repeatedTarget),
        roundProgress: normalizedProgress,
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

    const lastScoredPickupAt = Number.isFinite(player.lastScoredPickupAt)
        ? player.lastScoredPickupAt
        : 0;
    const previousComboCount = Math.max(0, Math.round(Number(player.scoreComboCount) || 0));
    const withinComboWindow = now - lastScoredPickupAt <= SCORE_COMBO_WINDOW_MS;
    const nextComboCount = withinComboWindow ? Math.min(64, previousComboCount + 1) : 1;
    const nextRoundCollected = Math.min(
        Math.max(1, roundState.totalPickups || ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT),
        Math.max(0, Math.round(Number(roundState.totalCollected) || 0) + 1)
    );
    const speedKph = clampNumber(Math.abs(Number(player?.lastState?.speed) || 0), 0, 400, 0);
    const scoring = resolvePickupScore({
        comboCount: nextComboCount,
        speedKph,
        roundProgress: nextRoundCollected / Math.max(1, roundState.totalPickups || 1),
    });
    player.score = clampScore(clampScore(player.score) + scoring.pointsAwarded);
    player.scoreComboCount = scoring.comboCount;
    player.lastScoredPickupAt = now;
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
    nowMs = Date.now(),
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

    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const lastMineKillAt = Number.isFinite(ownerPlayer.lastMineKillAt)
        ? ownerPlayer.lastMineKillAt
        : 0;
    const previousChainCount = Math.max(0, Math.round(Number(ownerPlayer.mineKillChainCount) || 0));
    const withinChainWindow = now - lastMineKillAt <= MINE_KILL_CHAIN_WINDOW_MS;
    const nextChainCount = withinChainWindow ? Math.min(64, previousChainCount + 1) : 1;
    const lastMineKillByTarget =
        ownerPlayer.mineKillByTarget && typeof ownerPlayer.mineKillByTarget === 'object'
            ? ownerPlayer.mineKillByTarget
            : (ownerPlayer.mineKillByTarget = Object.create(null));
    const previousKillAtAgainstTarget = Number(lastMineKillByTarget[targetPlayerId]) || 0;
    const repeatedTarget =
        previousKillAtAgainstTarget > 0 &&
        now - previousKillAtAgainstTarget <= MINE_KILL_REPEAT_WINDOW_MS;
    const roundProgress = clampNumber(
        (Math.max(0, Math.round(Number(roundState.totalCollected) || 0)) + 0.0001) /
            Math.max(1, roundState.totalPickups || ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT),
        0,
        1,
        0
    );
    const scoring = resolveMineKillScore({
        chainCount: nextChainCount,
        roundProgress,
        repeatedTarget,
    });

    ownerPlayer.score = clampScore(clampScore(ownerPlayer.score) + scoring.pointsAwarded);
    ownerPlayer.mineKillChainCount = scoring.chainCount;
    ownerPlayer.lastMineKillAt = now;
    ownerPlayer.lastMineKillPoints = scoring.pointsAwarded;
    lastMineKillByTarget[targetPlayerId] = now;

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
    createRoomRoundState,
    applyPlayerPickupScore,
    applyPlayerMineKillScore,
    recalculateRoomRoundStateFromPlayers,
    serializeRoomRoundState,
    clampRoundTotal,
    resolvePickupScore,
    resolveMineKillScore,
};
