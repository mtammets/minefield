export function createFinalScoreboardController({ onRestart, onExit } = {}) {
    const rootEl = document.getElementById('finalLeaderboard');
    const titleEl = document.getElementById('leaderboardTitle');
    const summaryEl = document.getElementById('leaderboardSummary');
    const playerRankEl = document.getElementById('leaderboardPlayerRank');
    const playerScoreEl = document.getElementById('leaderboardPlayerScore');
    const topScoreEl = document.getElementById('leaderboardTopScore');
    const collectedTotalEl = document.getElementById('leaderboardCollectedTotal');
    const detailsToggleEl = document.getElementById('leaderboardDetailsToggle');
    const detailsPanelEl = document.getElementById('leaderboardDetailsPanel');
    const scoringModelEl = document.getElementById('leaderboardScoringModel');
    const breakdownListEl = document.getElementById('leaderboardBreakdownList');
    const listEl = document.getElementById('leaderboardList');
    const restartBtnEl = document.getElementById('leaderboardRestartBtn');
    const exitBtnEl = document.getElementById('leaderboardExitBtn');
    const numberFormatter = new Intl.NumberFormat('en-US');
    let detailsVisible = false;
    let detailsAvailable = false;

    if (!rootEl || !summaryEl || !listEl || !titleEl) {
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
    detailsToggleEl?.addEventListener('click', () => {
        detailsVisible = !detailsVisible;
        syncDetailsVisibility();
    });

    syncDetailsVisibility();

    return {
        show({
            summaryText = '',
            scoringModelText = '',
            entries = [],
            topScore = 0,
            winnerLabel = '',
            finishLabel = '',
            totalCollected = 0,
            totalPickups = 0,
            totalScore = 0,
            bonusPointsAwarded = 0,
            bonusPickupsAwarded = 0,
        } = {}) {
            const normalizedEntries = Array.isArray(entries) ? entries : [];
            const resolvedTopScore = Math.max(0, Math.round(Number(topScore) || 0));
            const resolvedTotalCollected = Math.max(0, Math.round(Number(totalCollected) || 0));
            const resolvedTotalPickups = Math.max(0, Math.round(Number(totalPickups) || 0));
            const resolvedTotalScore = Math.max(0, Math.round(Number(totalScore) || 0));
            const playerIndex = normalizedEntries.findIndex((entry) => isPlayerEntry(entry));
            const playerEntry = playerIndex >= 0 ? normalizedEntries[playerIndex] : null;
            const playerScore = Math.max(0, Math.round(Number(playerEntry?.score) || 0));

            const resolvedWinnerLabel = resolveWinnerLabel(
                normalizedEntries,
                resolvedTopScore,
                winnerLabel
            );
            titleEl.textContent =
                playerEntry && resolvedTopScore > 0 && playerScore === resolvedTopScore
                    ? 'VICTORY'
                    : 'ROUND COMPLETE';
            summaryEl.textContent =
                buildSummaryText({
                    finishLabel,
                    winnerLabel: resolvedWinnerLabel,
                    totalCollected: resolvedTotalCollected,
                    totalPickups: resolvedTotalPickups,
                    totalScore: resolvedTotalScore,
                    bonusPointsAwarded,
                    bonusPickupsAwarded,
                }) || summaryText;

            if (playerRankEl) {
                playerRankEl.textContent = playerIndex >= 0 ? `#${playerIndex + 1}` : '--';
            }
            if (playerScoreEl) {
                playerScoreEl.textContent = `${numberFormatter.format(playerScore)} pts`;
            }
            if (topScoreEl) {
                topScoreEl.textContent = `${numberFormatter.format(resolvedTopScore)} pts`;
            }
            if (collectedTotalEl) {
                collectedTotalEl.textContent =
                    resolvedTotalPickups > 0
                        ? `${numberFormatter.format(resolvedTotalCollected)}/${numberFormatter.format(resolvedTotalPickups)}`
                        : '--';
            }

            listEl.innerHTML = normalizedEntries
                .map((entry, index) => {
                    const score = Math.max(0, Math.round(Number(entry?.score) || 0));
                    const collectedCount = Math.max(
                        0,
                        Math.round(Number(entry?.collectedCount) || 0)
                    );
                    const isWinner = score === resolvedTopScore && resolvedTopScore > 0;
                    const isPlayer = isPlayerEntry(entry);
                    const rowClass = [
                        'leaderboardRow',
                        isWinner ? 'winner' : '',
                        isPlayer ? 'is-player' : '',
                    ]
                        .filter(Boolean)
                        .join(' ');
                    const displayName = escapeHtml(resolveEntryName(entry));
                    const nameTag = isWinner
                        ? '<span class="leaderboardNameTag winner">WINNER</span>'
                        : isPlayer
                          ? '<span class="leaderboardNameTag">YOU</span>'
                          : '';
                    return (
                        `<div class="${rowClass}">` +
                        `<span class="leaderboardRank">#${index + 1}</span>` +
                        `<span class="leaderboardName">${displayName}${nameTag}</span>` +
                        `<span class="leaderboardScore">${numberFormatter.format(score)} pts</span>` +
                        `<span class="leaderboardCollected">${numberFormatter.format(collectedCount)}x</span>` +
                        `</div>`
                    );
                })
                .join('');

            if (scoringModelEl) {
                const modelText =
                    typeof scoringModelText === 'string' ? scoringModelText.trim() : '';
                scoringModelEl.textContent = modelText;
                scoringModelEl.hidden = !modelText;
            }
            if (breakdownListEl) {
                breakdownListEl.innerHTML = normalizedEntries
                    .map((entry, index) => buildBreakdownRowHtml(entry, index, numberFormatter))
                    .join('');
            }

            detailsVisible = false;
            detailsAvailable = Boolean(scoringModelEl?.textContent || normalizedEntries.length > 0);
            syncDetailsVisibility();
            rootEl.hidden = false;
        },
        hide() {
            rootEl.hidden = true;
            listEl.innerHTML = '';
            summaryEl.textContent = '';
            titleEl.textContent = 'ROUND COMPLETE';
            if (playerRankEl) {
                playerRankEl.textContent = '#-';
            }
            if (playerScoreEl) {
                playerScoreEl.textContent = '0 pts';
            }
            if (topScoreEl) {
                topScoreEl.textContent = '0 pts';
            }
            if (collectedTotalEl) {
                collectedTotalEl.textContent = '0/0';
            }
            if (scoringModelEl) {
                scoringModelEl.textContent = '';
                scoringModelEl.hidden = true;
            }
            if (breakdownListEl) {
                breakdownListEl.innerHTML = '';
            }
            detailsVisible = false;
            detailsAvailable = false;
            syncDetailsVisibility();
        },
        isVisible() {
            return !rootEl.hidden;
        },
    };

    function syncDetailsVisibility() {
        const showToggle = Boolean(detailsAvailable && detailsToggleEl && detailsPanelEl);
        if (detailsToggleEl) {
            detailsToggleEl.hidden = !showToggle;
            detailsToggleEl.textContent = detailsVisible ? 'HIDE DETAILS' : 'SHOW DETAILS';
            detailsToggleEl.setAttribute('aria-expanded', detailsVisible ? 'true' : 'false');
        }
        if (detailsPanelEl) {
            detailsPanelEl.hidden = !showToggle || !detailsVisible;
        }
    }
}

function resolveEntryName(entry) {
    const raw = typeof entry?.name === 'string' ? entry.name.trim() : '';
    return raw || 'Unknown';
}

function isPlayerEntry(entry) {
    const collectorId =
        typeof entry?.collectorId === 'string' ? entry.collectorId.toLowerCase() : '';
    if (collectorId === 'player') {
        return true;
    }
    const normalizedName = resolveEntryName(entry).toLowerCase();
    return normalizedName === 'you';
}

function resolveWinnerLabel(entries, topScore, providedWinnerLabel) {
    if (typeof providedWinnerLabel === 'string' && providedWinnerLabel.trim()) {
        return providedWinnerLabel.trim();
    }
    const winners = entries
        .filter((entry) => Math.max(0, Math.round(Number(entry?.score) || 0)) === topScore)
        .map((entry) => resolveEntryName(entry));
    if (winners.length === 0) {
        return '';
    }
    if (winners.length > 1) {
        return `Tie: ${winners.join(', ')}`;
    }
    return `Winner: ${winners[0]}`;
}

function buildSummaryText({
    finishLabel = '',
    winnerLabel = '',
    totalCollected = 0,
    totalPickups = 0,
    totalScore = 0,
    bonusPointsAwarded = 0,
    bonusPickupsAwarded = 0,
} = {}) {
    const parts = [];
    const finishText = typeof finishLabel === 'string' ? finishLabel.trim() : '';
    if (finishText) {
        parts.push(finishText);
    }
    const winnerText = typeof winnerLabel === 'string' ? winnerLabel.trim() : '';
    if (winnerText) {
        parts.push(winnerText);
    }
    if (totalPickups > 0) {
        parts.push(`Collected ${totalCollected}/${totalPickups}`);
    }
    if (totalScore > 0) {
        parts.push(`Total ${totalScore} pts`);
    }
    if (bonusPointsAwarded > 0 && bonusPickupsAwarded > 0) {
        parts.push(`Bonus +${bonusPointsAwarded} pts (${bonusPickupsAwarded} auto)`);
    }
    return parts.join(' | ');
}

function buildBreakdownRowHtml(entry, index, formatter) {
    const score = Math.max(0, Math.round(Number(entry?.score) || 0));
    const details = buildEntryDetailText(entry?.stats);
    return (
        '<div class="leaderboardBreakdownRow">' +
        `<div class="leaderboardBreakdownHead"><span class="leaderboardBreakdownName">#${index + 1} ${escapeHtml(resolveEntryName(entry))}</span><span class="leaderboardBreakdownScore">${formatter.format(score)} pts</span></div>` +
        `<div class="leaderboardBreakdownMeta">${escapeHtml(details || 'No extended events recorded in this round.')}</div>` +
        '</div>'
    );
}

function buildEntryDetailText(stats) {
    if (!stats || typeof stats !== 'object') {
        return '';
    }
    const parts = [];
    const pickupCount = Math.max(0, Math.round(Number(stats.pickupCount) || 0));
    const pickupPoints = Math.max(0, Math.round(Number(stats.pickupPoints) || 0));
    const mineDeployedCount = Math.max(0, Math.round(Number(stats.mineDeployedCount) || 0));
    const mineDetonatedCount = Math.max(0, Math.round(Number(stats.mineDetonatedCount) || 0));
    const mineHitCount = Math.max(0, Math.round(Number(stats.mineHitCount) || 0));
    const mineHitTakenCount = Math.max(0, Math.round(Number(stats.mineHitTakenCount) || 0));
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
    if (mineDeployedCount > 0) {
        parts.push(`Mines used ${mineDeployedCount}`);
    }
    if (mineDetonatedCount > 0) {
        parts.push(`Mines detonated ${mineDetonatedCount}`);
    }
    if (mineHitCount > 0) {
        parts.push(`Mine hits ${mineHitCount}`);
    }
    if (mineHitTakenCount > 0) {
        parts.push(`Hit by mines ${mineHitTakenCount}`);
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

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
