const PICKUP_POINTS = 100;
const MINE_KILL_POINTS = 300;
const SCORE_MAX_TOTAL = Number.MAX_SAFE_INTEGER;

function clampScore(value) {
    return Math.max(0, Math.min(SCORE_MAX_TOTAL, Math.round(Number(value) || 0)));
}

function resolvePickupScore() {
    return {
        rule: 'pickup',
        label: 'Pickup',
        basePoints: PICKUP_POINTS,
        pointsAwarded: PICKUP_POINTS,
    };
}

function resolveMineKillScore() {
    return {
        rule: 'mine-kill',
        label: 'Mine kill',
        basePoints: MINE_KILL_POINTS,
        pointsAwarded: MINE_KILL_POINTS,
    };
}

export function createPickupScoringSystem() {
    const collectors = new Map();

    return {
        awardPickup({ collectorId = 'player' } = {}) {
            const collectorKey = resolveCollectorKey(collectorId);
            const collector = getOrCreateCollectorState(collectorKey);
            const scoring = resolvePickupScore();

            collector.score = clampScore(collector.score + scoring.pointsAwarded);
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

            const scoring = resolveMineKillScore();
            collector.score = clampScore(collector.score + scoring.pointsAwarded);
            collector.lastMineKillPoints = scoring.pointsAwarded;

            return {
                collectorId: collectorKey,
                score: collector.score,
                pointsAwarded: scoring.pointsAwarded,
                scoring,
            };
        },
        resetCollectorCombo(collectorId = 'player') {
            const collector = getOrCreateCollectorState(resolveCollectorKey(collectorId));
            collector.lastPickupPoints = 0;
            return {
                comboCount: 0,
            };
        },
        resetCollectorMineChain(collectorId = 'player') {
            const collector = getOrCreateCollectorState(resolveCollectorKey(collectorId));
            collector.lastMineKillPoints = 0;
            return {
                mineKillChainCount: 0,
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
        getCollectorComboCount() {
            return 0;
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
            lastPickupPoints: 0,
            lastMineKillPoints: 0,
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

export { PICKUP_POINTS, MINE_KILL_POINTS, resolvePickupScore, resolveMineKillScore };
