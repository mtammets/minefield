export function createFinalScoreboardController({ onRestart } = {}) {
    const rootEl = document.getElementById('finalLeaderboard');
    const summaryEl = document.getElementById('leaderboardSummary');
    const listEl = document.getElementById('leaderboardList');
    const restartBtnEl = document.getElementById('leaderboardRestartBtn');

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

    return {
        show({ summaryText = '', entries = [], topScore = 0 } = {}) {
            summaryEl.textContent = summaryText;
            listEl.innerHTML = entries
                .map((entry, index) => {
                    const isWinner = (entry.collectedCount || 0) === topScore;
                    const rowClass = isWinner ? 'leaderboardRow winner' : 'leaderboardRow';
                    return (
                        `<div class="${rowClass}">` +
                        `<span class="leaderboardRank">#${index + 1}</span>` +
                        `<span class="leaderboardName">${entry.name}</span>` +
                        `<span class="leaderboardScore">${entry.collectedCount || 0}</span>` +
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
