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

export function createPickupScoringSystem() {
    const collectors = new Map();

    return {
        awardPickup({
            collectorId = 'player',
            nowMs = Date.now(),
            speedKph = 0,
            roundProgress = 0,
        } = {}) {
            const collectorKey = resolveCollectorKey(collectorId);
            const collector = getOrCreateCollectorState(collectorKey);
            const now = Number.isFinite(nowMs) ? nowMs : Date.now();
            const withinComboWindow = now - collector.lastScoredPickupAt <= SCORE_COMBO_WINDOW_MS;
            const nextComboCount = withinComboWindow ? Math.min(64, collector.comboCount + 1) : 1;
            const scoring = resolvePickupScore({
                comboCount: nextComboCount,
                speedKph,
                roundProgress,
            });

            collector.score = clampScore(collector.score + scoring.pointsAwarded);
            collector.comboCount = scoring.comboCount;
            collector.lastScoredPickupAt = now;
            collector.lastPickupPoints = scoring.pointsAwarded;

            return {
                collectorId: collectorKey,
                score: collector.score,
                pointsAwarded: scoring.pointsAwarded,
                scoring,
            };
        },
        awardMineKill({
            collectorId = 'player',
            targetId = '',
            nowMs = Date.now(),
            roundProgress = 0,
            isSelfKill = false,
        } = {}) {
            const collectorKey = resolveCollectorKey(collectorId);
            const collector = getOrCreateCollectorState(collectorKey);
            if (isSelfKill) {
                return {
                    collectorId: collectorKey,
                    score: collector.score,
                    pointsAwarded: 0,
                    scoring: null,
                    ignoredReason: 'self-kill',
                };
            }

            const now = Number.isFinite(nowMs) ? nowMs : Date.now();
            const lastMineKillAt = Number.isFinite(collector.lastMineKillAt)
                ? collector.lastMineKillAt
                : 0;
            const withinChainWindow = now - lastMineKillAt <= MINE_KILL_CHAIN_WINDOW_MS;
            const nextChainCount = withinChainWindow
                ? Math.min(64, Math.max(0, collector.mineKillChainCount) + 1)
                : 1;
            const targetKey = resolveCollectorKey(targetId || '__target__');
            const previousKillAtAgainstTarget =
                Number(collector.lastMineKillByTarget[targetKey]) || 0;
            const repeatedTarget =
                previousKillAtAgainstTarget > 0 &&
                now - previousKillAtAgainstTarget <= MINE_KILL_REPEAT_WINDOW_MS;
            const scoring = resolveMineKillScore({
                chainCount: nextChainCount,
                roundProgress,
                repeatedTarget,
            });

            collector.score = clampScore(collector.score + scoring.pointsAwarded);
            collector.mineKillChainCount = scoring.chainCount;
            collector.lastMineKillAt = now;
            collector.lastMineKillPoints = scoring.pointsAwarded;
            collector.lastMineKillByTarget[targetKey] = now;

            return {
                collectorId: collectorKey,
                score: collector.score,
                pointsAwarded: scoring.pointsAwarded,
                scoring,
            };
        },
        resetCollectorCombo(collectorId = 'player') {
            const collector = getOrCreateCollectorState(resolveCollectorKey(collectorId));
            collector.comboCount = 0;
            collector.lastScoredPickupAt = 0;
            collector.lastPickupPoints = 0;
            return {
                comboCount: collector.comboCount,
            };
        },
        resetCollectorMineChain(collectorId = 'player') {
            const collector = getOrCreateCollectorState(resolveCollectorKey(collectorId));
            collector.mineKillChainCount = 0;
            collector.lastMineKillAt = 0;
            collector.lastMineKillPoints = 0;
            return {
                mineKillChainCount: collector.mineKillChainCount,
            };
        },
        setCollectorScore(collectorId = 'player', score = 0) {
            const collector = getOrCreateCollectorState(resolveCollectorKey(collectorId));
            collector.score = clampScore(score);
            return collector.score;
        },
        getCollectorScore(collectorId = 'player') {
            const collector = collectors.get(resolveCollectorKey(collectorId));
            return collector ? clampScore(collector.score) : 0;
        },
        getCollectorComboCount(collectorId = 'player') {
            const collector = collectors.get(resolveCollectorKey(collectorId));
            return collector ? Math.max(0, Math.round(Number(collector.comboCount) || 0)) : 0;
        },
        getTotalScore() {
            let total = 0;
            for (const collector of collectors.values()) {
                total += clampScore(collector.score);
            }
            return clampScore(total);
        },
        clear() {
            collectors.clear();
        },
    };

    function getOrCreateCollectorState(collectorId) {
        if (collectors.has(collectorId)) {
            return collectors.get(collectorId);
        }
        const state = {
            score: 0,
            comboCount: 0,
            lastScoredPickupAt: 0,
            lastPickupPoints: 0,
            mineKillChainCount: 0,
            lastMineKillAt: 0,
            lastMineKillPoints: 0,
            lastMineKillByTarget: Object.create(null),
        };
        collectors.set(collectorId, state);
        return state;
    }
}

function resolveCollectorKey(collectorId) {
    if (typeof collectorId === 'string' && collectorId.trim()) {
        return collectorId.trim();
    }
    return 'player';
}

export { resolvePickupScore, resolveMineKillScore };
