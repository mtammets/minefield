export function createFinalScoreboardController({ onRestart, onExit } = {}) {
    const rootEl = document.getElementById('finalLeaderboard');
    const summaryEl = document.getElementById('leaderboardSummary');
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
        show({ summaryText = '', entries = [], topScore = 0 } = {}) {
            summaryEl.textContent = summaryText;
            listEl.innerHTML = entries
                .map((entry, index) => {
                    const score = Math.max(0, Math.round(Number(entry?.score) || 0));
                    const collectedCount = Math.max(
                        0,
                        Math.round(Number(entry?.collectedCount) || 0)
                    );
                    const isWinner = score === topScore;
                    const rowClass = isWinner ? 'leaderboardRow winner' : 'leaderboardRow';
                    return (
                        `<div class="${rowClass}">` +
                        `<span class="leaderboardRank">#${index + 1}</span>` +
                        `<span class="leaderboardName">${entry.name}</span>` +
                        `<span class="leaderboardScore">${score} pts</span>` +
                        `<span class="leaderboardCollected">${collectedCount}x</span>` +
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
        },
        isVisible() {
            return !rootEl.hidden;
        },
    };
}
