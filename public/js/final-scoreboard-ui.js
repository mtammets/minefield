export function createFinalScoreboardController({
    onRestart,
    onExit,
    onDownloadLog,
    onRefreshGlobalLeaderboard,
} = {}) {
    const rootEl = document.getElementById('finalLeaderboard');
    const titleEl = document.getElementById('leaderboardTitle');
    const summaryEl = document.getElementById('leaderboardSummary');
    const playerRankEl = document.getElementById('leaderboardPlayerRank');
    const playerScoreEl = document.getElementById('leaderboardPlayerScore');
    const topScoreEl = document.getElementById('leaderboardTopScore');
    const collectedTotalEl = document.getElementById('leaderboardCollectedTotal');
    const sectionTitleEl = document.getElementById('leaderboardSectionTitle');
    const sectionMetaEl = document.getElementById('leaderboardSectionMeta');
    const globalPanelEl = document.getElementById('leaderboardGlobalPanel');
    const globalStatusInlineEl = document.getElementById('leaderboardGlobalStatusInline');
    const globalListInlineEl = document.getElementById('leaderboardGlobalListInline');
    const globalRefreshBtnEl = document.getElementById('leaderboardGlobalRefreshBtn');
    const listEl = document.getElementById('leaderboardList');
    const restartBtnEl = document.getElementById('leaderboardRestartBtn');
    const downloadLogBtnEl = document.getElementById('leaderboardDownloadLogBtn');
    const exitBtnEl = document.getElementById('leaderboardExitBtn');
    const numberFormatter = new Intl.NumberFormat('en-US');
    const downloadLogHostAllowed = isDownloadLogHostAllowed();
    const canDownloadLog = downloadLogHostAllowed && typeof onDownloadLog === 'function';
    const globalLeaderboardUi = createFinalGlobalLeaderboardUi({
        rootEl: globalPanelEl,
        statusEl: globalStatusInlineEl,
        listEl: globalListInlineEl,
        refreshBtnEl: globalRefreshBtnEl,
        onRefresh: onRefreshGlobalLeaderboard,
    });
    let lastRoundSnapshot = null;
    let globalLeaderboardState = createInitialGlobalLeaderboardState();

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
    downloadLogBtnEl?.addEventListener('click', () => {
        if (!canDownloadLog) {
            return;
        }
        onDownloadLog?.(lastRoundSnapshot);
    });
    exitBtnEl?.addEventListener('click', () => {
        onExit?.();
    });
    globalRefreshBtnEl?.addEventListener('click', () => {
        onRefreshGlobalLeaderboard?.();
    });

    syncDownloadLogButtonState();

    return {
        show({
            titleText = '',
            summaryText = '',
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
            const roundOpponentCount = normalizedEntries.filter((entry) => !isPlayerEntry(entry)).length;

            const resolvedWinnerLabel = resolveWinnerLabel(
                normalizedEntries,
                resolvedTopScore,
                winnerLabel
            );
            const resolvedTitleText =
                typeof titleText === 'string' && titleText.trim()
                    ? titleText.trim()
                    : playerEntry && resolvedTopScore > 0 && playerScore === resolvedTopScore
                      ? 'VICTORY'
                      : 'ROUND COMPLETE';
            const isCampaignPresentation = /campaign|mission/iu.test(resolvedTitleText);
            titleEl.textContent = resolvedTitleText;
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
            if (sectionTitleEl) {
                sectionTitleEl.textContent = isCampaignPresentation ? 'RUN STANDINGS' : 'ROUND STANDINGS';
            }
            if (sectionMetaEl) {
                sectionMetaEl.textContent = isCampaignPresentation
                    ? 'Campaign totals so far. Rival bots from multiple missions can appear here.'
                    : roundOpponentCount > 0
                      ? 'Current round results. Bots or room opponents can appear here.'
                      : 'Current round results for this run.';
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

            renderGlobalLeaderboard();
            lastRoundSnapshot = {
                title: titleEl.textContent || 'ROUND COMPLETE',
                summaryText: summaryEl.textContent || '',
                finishLabel,
                winnerLabel: resolvedWinnerLabel,
                topScore: resolvedTopScore,
                totalCollected: resolvedTotalCollected,
                totalPickups: resolvedTotalPickups,
                totalScore: resolvedTotalScore,
                bonusPointsAwarded: Math.max(0, Math.round(Number(bonusPointsAwarded) || 0)),
                bonusPickupsAwarded: Math.max(0, Math.round(Number(bonusPickupsAwarded) || 0)),
                entries: normalizedEntries.map((entry) => ({
                    collectorId: typeof entry?.collectorId === 'string' ? entry.collectorId : '',
                    name: resolveEntryName(entry),
                    score: Math.max(0, Math.round(Number(entry?.score) || 0)),
                    collectedCount: Math.max(0, Math.round(Number(entry?.collectedCount) || 0)),
                    stats:
                        entry?.stats && typeof entry.stats === 'object' ? { ...entry.stats } : null,
                })),
            };
            syncDownloadLogButtonState();
            rootEl.hidden = false;
        },
        setGlobalLeaderboard(nextState = {}) {
            globalLeaderboardState = normalizeGlobalLeaderboardState(nextState);
            renderGlobalLeaderboard();
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
            if (sectionTitleEl) {
                sectionTitleEl.textContent = 'ROUND STANDINGS';
            }
            if (sectionMetaEl) {
                sectionMetaEl.textContent = 'Current round results. Bots can appear here.';
            }
            lastRoundSnapshot = null;
            syncDownloadLogButtonState();
            renderGlobalLeaderboard();
        },
        isVisible() {
            return !rootEl.hidden;
        },
    };

    function renderGlobalLeaderboard() {
        globalLeaderboardUi.render(globalLeaderboardState, numberFormatter);
    }

    function syncDownloadLogButtonState() {
        if (!downloadLogBtnEl) {
            return;
        }
        downloadLogBtnEl.hidden = !canDownloadLog;
        downloadLogBtnEl.disabled = !canDownloadLog;
    }
}

function isDownloadLogHostAllowed() {
    if (typeof window === 'undefined') {
        return false;
    }
    return String(window.location?.hostname || '').toLowerCase() === 'localhost';
}

function resolveEntryName(entry) {
    const raw = typeof entry?.name === 'string' ? entry.name.trim() : '';
    return raw || 'Unknown';
}

function isPlayerEntry(entry) {
    if (entry?.isSelf === true) {
        return true;
    }
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
        parts.push(`Pickups ${totalCollected}/${totalPickups}`);
    }
    if (totalScore > 0) {
        parts.push(`Total ${totalScore} pts`);
    }
    if (bonusPointsAwarded > 0 && bonusPickupsAwarded > 0) {
        parts.push(`Auto sweep +${bonusPointsAwarded} pts (${bonusPickupsAwarded} pickups)`);
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

function createFinalGlobalLeaderboardUi({
    rootEl = null,
    statusEl = null,
    listEl = null,
    refreshBtnEl = null,
    onRefresh = null,
} = {}) {
    if (!rootEl || !statusEl || !listEl) {
        return {
            isVisible() {
                return false;
            },
            render() {},
        };
    }

    return {
        isVisible() {
            return !rootEl.hidden;
        },
        render(state, formatter) {
            const normalizedState = normalizeGlobalLeaderboardState(state);
            const shouldShow = Boolean(
                normalizedState.enabled ||
                normalizedState.loading ||
                normalizedState.entries.length > 0 ||
                normalizedState.statusText
            );
            rootEl.hidden = !shouldShow;
            if (!shouldShow) {
                statusEl.textContent = '';
                statusEl.hidden = true;
                listEl.innerHTML = '';
                return;
            }

            if (refreshBtnEl) {
                refreshBtnEl.disabled = Boolean(normalizedState.loading || typeof onRefresh !== 'function');
            }
            const statusText =
                typeof normalizedState.statusText === 'string'
                    ? normalizedState.statusText.trim()
                    : '';
            statusEl.textContent = statusText;
            statusEl.hidden = !statusText;
            statusEl.dataset.tone = resolveGlobalLeaderboardTone(normalizedState);
            listEl.innerHTML = buildGlobalLeaderboardListHtml(normalizedState, formatter);
        },
    };
}

function createInitialGlobalLeaderboardState() {
    return normalizeGlobalLeaderboardState(null);
}

function normalizeGlobalLeaderboardState(state) {
    const source = state && typeof state === 'object' ? state : {};
    const entries = Array.isArray(source.entries)
        ? source.entries.map((entry) => normalizeGlobalLeaderboardEntry(entry)).filter(Boolean)
        : [];

    return {
        enabled: Boolean(source.enabled),
        loading: Boolean(source.loading),
        source: typeof source.source === 'string' ? source.source : '',
        statusText: typeof source.statusText === 'string' ? source.statusText.trim() : '',
        entries,
        totalEntries: Math.max(0, Math.round(Number(source.totalEntries) || 0)),
        viewerRank: Math.max(0, Math.round(Number(source.viewerRank) || 0)),
        viewerHasEntry: Boolean(source.viewerHasEntry),
    };
}

function resolveGlobalLeaderboardTone(state) {
    if (!state || typeof state !== 'object') {
        return 'muted';
    }
    if (state.loading) {
        return 'info';
    }
    if (/unavailable|failed|disabled/iu.test(String(state.statusText || ''))) {
        return 'error';
    }
    if (state.entries?.length > 0) {
        return 'success';
    }
    return 'muted';
}

function normalizeGlobalLeaderboardEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const playerName = resolveGlobalLeaderboardName(entry.playerName || entry.player_name);
    const score = Math.max(0, Math.round(Number(entry.score) || 0));
    if (!playerName || score <= 0) {
        return null;
    }

    return {
        playerName,
        score,
        rank: Math.max(1, Math.round(Number(entry.rank) || 1)),
        segment: normalizeGlobalLeaderboardSegment(entry.segment),
        isViewer: Boolean(entry.isViewer),
        collectedCount: Math.max(
            0,
            Math.round(Number(entry.collectedCount ?? entry.collected_count) || 0)
        ),
        gameMode:
            typeof (entry.gameMode || entry.game_mode) === 'string'
                ? String(entry.gameMode || entry.game_mode)
                : '',
        createdAt: sanitizeGlobalLeaderboardDate(entry.createdAt || entry.created_at),
    };
}

function buildGlobalLeaderboardListHtml(state, formatter) {
    const normalizedState = normalizeGlobalLeaderboardState(state);
    if (!normalizedState.entries.length) {
        return '<div class="leaderboardGlobalEmpty">No global player scores saved yet.</div>';
    }

    const parts = [];
    let previousSegment = '';
    normalizedState.entries.forEach((entry) => {
        if (entry.segment === 'viewer' && previousSegment !== 'viewer') {
            parts.push(
                buildGlobalLeaderboardDividerHtml(
                    normalizedState.viewerRank,
                    normalizedState.totalEntries
                )
            );
        }
        parts.push(buildGlobalLeaderboardRowHtml(entry, formatter));
        previousSegment = entry.segment;
    });
    return parts.join('');
}

function buildGlobalLeaderboardRowHtml(entry, formatter) {
    const collectedCount = Math.max(0, Math.round(Number(entry.collectedCount) || 0));
    const parts = [];
    if (entry.gameMode) {
        parts.push(String(entry.gameMode).toUpperCase());
    }
    if (collectedCount > 0) {
        parts.push(`${formatter.format(collectedCount)} pickups`);
    }
    const createdLabel = formatGlobalLeaderboardDate(entry.createdAt);
    if (createdLabel) {
        parts.push(createdLabel);
    }

    return (
        `<div class="leaderboardGlobalRow${entry.isViewer ? ' is-viewer' : ''}">` +
        '<div class="leaderboardGlobalHead">' +
        `<span class="leaderboardGlobalRank">#${entry.rank}</span>` +
        `<span class="leaderboardGlobalName">${escapeHtml(entry.playerName)}</span>` +
        `<span class="leaderboardGlobalScore">${formatter.format(entry.score)} pts</span>` +
        '</div>' +
        `<div class="leaderboardGlobalMeta">${escapeHtml(parts.join(' | ') || 'Saved in Supabase')}</div>` +
        '</div>'
    );
}

function buildGlobalLeaderboardDividerHtml(viewerRank, totalEntries) {
    const label =
        viewerRank > 0 && totalEntries > 0
            ? `Your position: #${viewerRank} of ${totalEntries}`
            : 'Your position';
    return `<div class="leaderboardGlobalDivider">${escapeHtml(label)}</div>`;
}

function normalizeGlobalLeaderboardSegment(value) {
    if (typeof value !== 'string') {
        return 'top';
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'viewer' ? 'viewer' : 'top';
}

function resolveGlobalLeaderboardName(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || '';
}

function sanitizeGlobalLeaderboardDate(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    if (!normalized) {
        return '';
    }
    const timestamp = Date.parse(normalized);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function formatGlobalLeaderboardDate(value) {
    if (!value) {
        return '';
    }
    try {
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        }).format(new Date(value));
    } catch {
        return '';
    }
}
