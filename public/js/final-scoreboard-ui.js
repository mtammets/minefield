export function createFinalScoreboardController({
    onRestart,
    onExit,
    onDownloadLog,
    onRefreshGlobalLeaderboard,
    getAuthState = () => null,
} = {}) {
    const rootEl = document.getElementById('finalLeaderboard');
    const titleEl = document.getElementById('leaderboardTitle');
    const playerAvatarEl = document.getElementById('leaderboardPlayerAvatar');
    const playerNameEl = document.getElementById('leaderboardPlayerName');
    const playerScoreEl = document.getElementById('leaderboardPlayerScore');
    const collectedMetaEl = document.getElementById('leaderboardCollectedMeta');
    const economyMetaEl = document.getElementById('leaderboardEconomyMeta');
    const economyBreakdownEl = document.getElementById('leaderboardEconomyBreakdown');
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

    if (!rootEl || !listEl || !titleEl) {
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
            const roundOpponentCount = normalizedEntries.filter(
                (entry) => !isPlayerEntry(entry)
            ).length;
            const authState = getAuthState?.() || null;
            const playerDisplayName =
                resolveGlobalLeaderboardName(authState?.displayName || '') ||
                (playerEntry ? resolveEntryName(playerEntry) : '') ||
                'YOU';
            const playerAvatarUrl = sanitizeLeaderboardImageUrl(
                playerEntry?.avatarUrl || authState?.avatarUrl || ''
            );

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
            if (playerAvatarEl) {
                playerAvatarEl.innerHTML = buildLeaderboardAvatarHtml({
                    avatarUrl: playerAvatarUrl,
                    name: playerDisplayName,
                });
            }
            if (playerNameEl) {
                playerNameEl.textContent = playerDisplayName;
            }

            if (playerScoreEl) {
                playerScoreEl.textContent = `${numberFormatter.format(playerScore)} pts`;
            }
            if (collectedMetaEl) {
                collectedMetaEl.textContent =
                    resolvedTotalPickups > 0
                        ? `Collected ${numberFormatter.format(resolvedTotalCollected)}/${numberFormatter.format(resolvedTotalPickups)}`
                        : 'Collected --';
            }
            if (sectionTitleEl) {
                sectionTitleEl.textContent = isCampaignPresentation
                    ? 'RUN STANDINGS'
                    : 'ROUND STANDINGS';
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
                    const avatarHtml = buildLeaderboardAvatarHtml({
                        avatarUrl: sanitizeLeaderboardImageUrl(
                            entry?.avatarUrl || (isPlayer ? playerAvatarUrl : '')
                        ),
                        name: resolveEntryName(entry),
                    });
                    return (
                        `<div class="${rowClass}">` +
                        `<span class="leaderboardRank">#${index + 1}</span>` +
                        '<span class="leaderboardNameCell">' +
                        avatarHtml +
                        `<span class="leaderboardName">${displayName}${nameTag}</span>` +
                        '</span>' +
                        `<span class="leaderboardScore">${numberFormatter.format(score)} pts</span>` +
                        `<span class="leaderboardCollected">${numberFormatter.format(collectedCount)}x</span>` +
                        `</div>`
                    );
                })
                .join('');

            renderGlobalLeaderboard();
            lastRoundSnapshot = {
                title: titleEl.textContent || 'ROUND COMPLETE',
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
            renderEconomyReward(null);
        },
        setEconomyReward(reward = null) {
            renderEconomyReward(reward);
        },
        setGlobalLeaderboard(nextState = {}) {
            globalLeaderboardState = normalizeGlobalLeaderboardState(nextState);
            renderGlobalLeaderboard();
        },
        hide() {
            rootEl.hidden = true;
            listEl.innerHTML = '';
            titleEl.textContent = 'ROUND COMPLETE';
            if (playerAvatarEl) {
                playerAvatarEl.innerHTML =
                    '<span class="leaderboardAvatar leaderboardAvatarFallback" aria-hidden="true">Y</span>';
            }
            if (playerNameEl) {
                playerNameEl.textContent = 'YOU';
            }
            if (playerScoreEl) {
                playerScoreEl.textContent = '0 pts';
            }
            if (collectedMetaEl) {
                collectedMetaEl.textContent = 'Collected 0/0';
            }
            renderEconomyReward(null);
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

    function renderEconomyReward(reward = null) {
        if (!economyMetaEl) {
            return;
        }
        const creditsEarned = Math.max(0, Math.round(Number(reward?.creditsEarned) || 0));
        const balanceAfter = Math.max(0, Math.round(Number(reward?.balanceAfter) || 0));
        if (creditsEarned <= 0 && balanceAfter <= 0) {
            economyMetaEl.hidden = true;
            economyMetaEl.textContent = '';
            if (economyBreakdownEl) {
                economyBreakdownEl.hidden = true;
                economyBreakdownEl.innerHTML = '';
            }
            return;
        }
        economyMetaEl.hidden = false;
        economyMetaEl.textContent =
            creditsEarned > 0
                ? `Wallet +${numberFormatter.format(creditsEarned)} CR • balance ${numberFormatter.format(balanceAfter)} CR`
                : `Wallet ${numberFormatter.format(balanceAfter)} CR`;
        renderEconomyBreakdown(reward?.breakdown);
    }

    function renderEconomyBreakdown(lines = null) {
        if (!economyBreakdownEl) {
            return;
        }
        const breakdown = Array.isArray(lines)
            ? lines
                  .map((entry) => normalizeEconomyBreakdownEntry(entry))
                  .filter((entry) => entry.credits > 0)
            : [];
        if (breakdown.length <= 0) {
            economyBreakdownEl.hidden = true;
            economyBreakdownEl.innerHTML = '';
            return;
        }
        economyBreakdownEl.hidden = false;
        economyBreakdownEl.innerHTML = breakdown
            .map(
                (entry) =>
                    `<div class="leaderboardEconomyBreakdownRow">` +
                    `<span class="leaderboardEconomyBreakdownLabel">${escapeHtml(entry.label)}</span>` +
                    `<span class="leaderboardEconomyBreakdownValue">+${numberFormatter.format(entry.credits)} CR</span>` +
                    `</div>`
            )
            .join('');
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

function normalizeEconomyBreakdownEntry(entry = null) {
    const source = entry && typeof entry === 'object' ? entry : {};
    return {
        label:
            typeof source.label === 'string' && source.label.trim()
                ? source.label.trim()
                : 'Reward',
        credits: Math.max(0, Math.round(Number(source.credits) || 0)),
    };
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
                refreshBtnEl.disabled = Boolean(
                    normalizedState.loading || typeof onRefresh !== 'function'
                );
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
        avatarUrl: sanitizeLeaderboardImageUrl(entry.avatarUrl || entry.avatar_url),
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
    const avatarHtml = buildLeaderboardAvatarHtml({
        avatarUrl: entry.avatarUrl,
        name: entry.playerName,
    });

    return (
        `<div class="leaderboardGlobalRow${entry.isViewer ? ' is-viewer' : ''}">` +
        '<div class="leaderboardGlobalHead">' +
        `<span class="leaderboardGlobalRank">#${entry.rank}</span>` +
        '<span class="leaderboardGlobalIdentity">' +
        avatarHtml +
        `<span class="leaderboardGlobalName">${escapeHtml(entry.playerName)}</span>` +
        '</span>' +
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

function sanitizeLeaderboardImageUrl(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    return /^(https?:)?\/\//iu.test(normalized) ? normalized : '';
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

function buildLeaderboardAvatarHtml({ avatarUrl = '', name = '' } = {}) {
    const safeAvatarUrl = sanitizeLeaderboardImageUrl(avatarUrl);
    const safeName = resolveGlobalLeaderboardName(name) || resolveEntryName({ name });
    const fallbackLabel = escapeHtml(resolveLeaderboardAvatarFallback(safeName));
    const altText = escapeHtml(safeName ? `${safeName} profile photo` : 'Profile photo');
    if (safeAvatarUrl) {
        return (
            '<span class="leaderboardAvatar">' +
            `<img class="leaderboardAvatarImage" src="${escapeHtml(safeAvatarUrl)}" alt="${altText}" loading="lazy" decoding="async" />` +
            '</span>'
        );
    }
    return `<span class="leaderboardAvatar leaderboardAvatarFallback" aria-hidden="true">${fallbackLabel}</span>`;
}

function resolveLeaderboardAvatarFallback(name) {
    const normalized = typeof name === 'string' ? name.trim() : '';
    if (!normalized) {
        return '?';
    }
    const parts = normalized.split(/\s+/u).filter(Boolean);
    const letters = parts.slice(0, 2).map((part) => Array.from(part)[0] || '');
    const fallback = letters.join('').toUpperCase();
    return fallback || Array.from(normalized)[0]?.toUpperCase?.() || '?';
}
