export function createFinalScoreboardController({ onRestart, onExit } = {}) {
    const rootEl = document.getElementById('finalLeaderboard');
    const summaryEl = document.getElementById('leaderboardSummary');
    const scoringModelEl = document.getElementById('leaderboardScoringModel');
    const listEl = document.getElementById('leaderboardList');
    const restartBtnEl = document.getElementById('leaderboardRestartBtn');
    const exitBtnEl = document.getElementById('leaderboardExitBtn');

    if (!rootEl || !summaryEl || !listEl) {
        return {
            show() {},
            hide() {},
            isVisible() {
                return false;
            },
        };
    }
    restartBtnEl?.addEventListener('click', () => {
        onRestart?.();
    });
    exitBtnEl?.addEventListener('click', () => {
        onExit?.();
    });

    return {
        show({ summaryText = '', scoringModelText = '', entries = [], topScore = 0 } = {}) {
            summaryEl.textContent = summaryText;
            if (scoringModelEl) {
                const modelText = typeof scoringModelText === 'string' ? scoringModelText.trim() : '';
                scoringModelEl.textContent = modelText;
                scoringModelEl.hidden = !modelText;
            }
            listEl.innerHTML = entries
                .map((entry, index) => {
                    const score = Math.max(0, Math.round(Number(entry?.score) || 0));
                    const collectedCount = Math.max(
                        0,
                        Math.round(Number(entry?.collectedCount) || 0)
                    );
                    const isWinner = score === topScore;
                    const rowClass = isWinner ? 'leaderboardRow winner' : 'leaderboardRow';
                    const detailText = buildEntryDetailText(entry?.stats);
                    return (
                        `<div class="${rowClass}">` +
                        `<span class="leaderboardRank">#${index + 1}</span>` +
                        `<span class="leaderboardName">${entry.name}</span>` +
                        `<span class="leaderboardScore">${score} pts</span>` +
                        `<span class="leaderboardCollected">${collectedCount}x</span>` +
                        (detailText ? `<span class="leaderboardDetail">${detailText}</span>` : '') +
                        `</div>`
                    );
                })
                .join('');
            rootEl.hidden = false;
        },
        hide() {
            rootEl.hidden = true;
            listEl.innerHTML = '';
            summaryEl.textContent = '';
            if (scoringModelEl) {
                scoringModelEl.textContent = '';
                scoringModelEl.hidden = true;
            }
        },
        isVisible() {
            return !rootEl.hidden;
        },
    };
}

function buildEntryDetailText(stats) {
    if (!stats || typeof stats !== 'object') {
        return '';
    }
    const parts = [];
    const pickupCount = Math.max(0, Math.round(Number(stats.pickupCount) || 0));
    const pickupPoints = Math.max(0, Math.round(Number(stats.pickupPoints) || 0));
    const mineKillCount = Math.max(0, Math.round(Number(stats.mineKillCount) || 0));
    const mineKillPoints = Math.max(0, Math.round(Number(stats.mineKillPoints) || 0));
    const autoCollectedCount = Math.max(0, Math.round(Number(stats.autoCollectedCount) || 0));
    const autoCollectedPoints = Math.max(0, Math.round(Number(stats.autoCollectedPoints) || 0));
    const bestPickupCombo = Math.max(0, Math.round(Number(stats.bestPickupCombo) || 0));
    const bestMineChain = Math.max(0, Math.round(Number(stats.bestMineChain) || 0));
    const riskPickupCount = Math.max(0, Math.round(Number(stats.riskPickupCount) || 0));
    const endgamePickupCount = Math.max(0, Math.round(Number(stats.endgamePickupCount) || 0));
    const endgameMineKillCount = Math.max(0, Math.round(Number(stats.endgameMineKillCount) || 0));
    const antiFarmMineKillCount = Math.max(0, Math.round(Number(stats.antiFarmMineKillCount) || 0));

    if (pickupCount > 0 || pickupPoints > 0) {
        parts.push(`Pickups ${pickupCount} (${pickupPoints} pts)`);
    }
    if (mineKillCount > 0 || mineKillPoints > 0) {
        parts.push(`Mine kills ${mineKillCount} (${mineKillPoints} pts)`);
    }
    if (autoCollectedCount > 0 || autoCollectedPoints > 0) {
        parts.push(`Auto ${autoCollectedCount} (${autoCollectedPoints} pts)`);
    }
    if (bestPickupCombo > 1) {
        parts.push(`Best combo x${bestPickupCombo}`);
    }
    if (bestMineChain > 1) {
        parts.push(`Best chain x${bestMineChain}`);
    }
    if (riskPickupCount > 0) {
        parts.push(`Risk pickups ${riskPickupCount}`);
    }
    if (endgamePickupCount > 0 || endgameMineKillCount > 0) {
        parts.push(`Endgame events ${endgamePickupCount + endgameMineKillCount}`);
    }
    if (antiFarmMineKillCount > 0) {
        parts.push(`Anti-farm hits ${antiFarmMineKillCount}`);
    }
    return parts.join(' | ');
}
