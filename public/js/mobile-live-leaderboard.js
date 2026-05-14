import { createGlobalLeaderboardController } from './global-leaderboard.js';

const EXPERIENCE_MODE = 'mobile-leaderboard';
const ROOT_ID = 'mobileLiveLeaderboardRoot';
const LIVE_LIMIT = 10;
const BROADCAST_REFRESH_DELAY_MS = 220;

const numberFormatter = new Intl.NumberFormat('en-US');
const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
});

export function startMobileLiveLeaderboardExperience() {
    document.documentElement.dataset.experience = EXPERIENCE_MODE;
    if (document.body) {
        document.body.dataset.experience = EXPERIENCE_MODE;
    }
    document.title = 'Minefield Drift Leaderboard';

    const rootEl = ensureRoot();
    const elements = createLayout(rootEl);
    const controller = createGlobalLeaderboardController({
        onStateChanged(state) {
            currentState = state;
            render();
        },
    });

    let currentState = createFallbackState();
    let socketConnected = false;
    let refreshPromise = null;
    let broadcastRefreshTimeoutId = 0;
    let lastRefreshAt = 0;
    let lastBroadcastAt = 0;
    let initialLoadSettled = false;
    let bootProgress = 12;
    let bootProgressIntervalId = 0;

    render();
    document.body.dataset.experienceReady = 'true';
    startBootProgress();

    void refreshLeaderboard();
    connectSocket();

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            void refreshLeaderboard();
        }
        render();
    });

    window.addEventListener('online', () => {
        void refreshLeaderboard();
    });

    function createFallbackState() {
        return {
            enabled: false,
            loading: true,
            statusText: '',
            entries: [],
            totalEntries: 0,
            viewerRank: 0,
            viewerHasEntry: false,
        };
    }

    function ensureRoot() {
        const existingRoot = document.getElementById(ROOT_ID);
        if (existingRoot) {
            return existingRoot;
        }
        const nextRoot = document.createElement('div');
        nextRoot.id = ROOT_ID;
        document.body.appendChild(nextRoot);
        return nextRoot;
    }

    function createLayout(root) {
        root.innerHTML = `
            <div class="welcomeNebula" aria-hidden="true"></div>
            <div class="welcomeScanlines" aria-hidden="true"></div>
            <main class="mobileDesktopShell" aria-label="Minefield Drift leaderboard">
                <section class="welcomeShowroomBay mobileDesktopShowroom">
                    <div class="welcomePreviewSweep" aria-hidden="true"></div>
                    <div class="welcomeBayRings" aria-hidden="true"></div>
                    <div
                        id="mobileDesktopBoot"
                        class="welcomePreviewLoading mobileDesktopBoot"
                        role="status"
                        aria-live="polite"
                    >
                        <div class="mobileDesktopBootTitle">Minefield Drift</div>
                        <div class="mobileDesktopBootBrand">Leaderboard</div>
                        <div
                            id="mobileDesktopBootStatus"
                            class="welcomePreviewLoadingStatus mobileDesktopBootStatus"
                        >
                            Leaderboard loading...
                        </div>
                        <div
                            class="welcomePreviewLoadingProgress mobileDesktopBootProgress"
                            aria-hidden="true"
                        >
                            <div
                                id="mobileDesktopBootFill"
                                class="welcomePreviewLoadingFill mobileDesktopBootFill"
                            ></div>
                        </div>
                        <div
                            id="mobileDesktopBootPercent"
                            class="welcomePreviewLoadingPercent mobileDesktopBootPercent"
                        >
                            12%
                        </div>
                    </div>
                    <section
                        class="welcomePreviewLeaderboardCard mobileDesktopLeaderboardCard"
                        aria-labelledby="mobileDesktopLeaderboardTitle"
                    >
                        <div class="mobileDesktopLeaderboardTop">
                            <div class="welcomePreviewLeaderboardHeading">
                                <div class="welcomePreviewLeaderboardEyebrow">
                                    Global player leaderboard
                                </div>
                                <div
                                    id="mobileDesktopLeaderboardTitle"
                                    class="welcomePreviewLeaderboardTitle"
                                >
                                    Top Drivers
                                </div>
                            </div>
                            <div class="mobileDesktopLeaderboardStats" aria-label="Leaderboard status">
                                <div
                                    id="mobileDesktopLeaderboardStatusStat"
                                    class="mobileDesktopLeaderboardStat"
                                    data-tone="ready"
                                >
                                    <span class="mobileDesktopLeaderboardStatLabel">Status</span>
                                    <strong class="mobileDesktopLeaderboardStatValue">Ready</strong>
                                </div>
                                <div class="mobileDesktopLeaderboardStat" data-tone="default">
                                    <span class="mobileDesktopLeaderboardStatLabel">Ranked</span>
                                    <strong
                                        id="mobileDesktopLeaderboardCount"
                                        class="mobileDesktopLeaderboardStatValue"
                                    >
                                        --
                                    </strong>
                                </div>
                                <div class="mobileDesktopLeaderboardStat" data-tone="default">
                                    <span class="mobileDesktopLeaderboardStatLabel">Sync</span>
                                    <strong
                                        id="mobileDesktopLeaderboardSync"
                                        class="mobileDesktopLeaderboardStatValue"
                                    >
                                        --
                                    </strong>
                                </div>
                            </div>
                        </div>
                        <div
                            id="mobileDesktopLeaderboardStatusText"
                            class="welcomePreviewLeaderboardStatus"
                            data-tone="muted"
                        >
                            Loading global player leaderboard...
                        </div>
                        <div
                            id="mobileDesktopLeaderboardList"
                            class="welcomePreviewLeaderboardList"
                            aria-live="polite"
                        ></div>
                    </section>
                </section>
            </main>
        `;
        return {
            listEl: root.querySelector('#mobileDesktopLeaderboardList'),
            rankedCountEl: root.querySelector('#mobileDesktopLeaderboardCount'),
            syncEl: root.querySelector('#mobileDesktopLeaderboardSync'),
            statusTextEl: root.querySelector('#mobileDesktopLeaderboardStatusText'),
            statusStatEl: root.querySelector('#mobileDesktopLeaderboardStatusStat'),
            bootEl: root.querySelector('#mobileDesktopBoot'),
            bootFillEl: root.querySelector('#mobileDesktopBootFill'),
            bootPercentEl: root.querySelector('#mobileDesktopBootPercent'),
            bootStatusEl: root.querySelector('#mobileDesktopBootStatus'),
        };
    }

    function connectSocket() {
        if (typeof window.io !== 'function') {
            render();
            return;
        }
        const liveSocket = window.io({
            transports: ['websocket', 'polling'],
        });
        liveSocket.on('connect', () => {
            socketConnected = true;
            render();
            void refreshLeaderboard();
        });
        liveSocket.on('disconnect', () => {
            socketConnected = false;
            render();
        });
        liveSocket.on('connect_error', () => {
            socketConnected = false;
            render();
        });
        liveSocket.on('leaderboard:update', () => {
            lastBroadcastAt = Date.now();
            render();
            window.clearTimeout(broadcastRefreshTimeoutId);
            broadcastRefreshTimeoutId = window.setTimeout(() => {
                void refreshLeaderboard();
            }, BROADCAST_REFRESH_DELAY_MS);
        });
    }

    async function refreshLeaderboard() {
        if (refreshPromise) {
            return refreshPromise;
        }
        refreshPromise = Promise.resolve(controller.refresh?.(LIVE_LIMIT))
            .catch(() => {})
            .finally(() => {
                lastRefreshAt = Date.now();
                refreshPromise = null;
                if (!initialLoadSettled) {
                    initialLoadSettled = true;
                    completeBootProgress();
                }
                render();
            });
        render();
        return refreshPromise;
    }

    function render() {
        renderBoot();
        renderStats();
        renderStatusText();
        renderList();
    }

    function renderBoot() {
        if (!elements.bootEl || !elements.bootFillEl || !elements.bootPercentEl) {
            return;
        }
        const bootVisible = !initialLoadSettled;
        elements.bootEl.hidden = !bootVisible;
        if (!bootVisible) {
            return;
        }
        const state = normalizeLeaderboardState(currentState);
        const statusText =
            typeof state.statusText === 'string' && state.statusText.trim()
                ? state.statusText.trim()
                : 'Leaderboard loading...';
        if (elements.bootStatusEl) {
            elements.bootStatusEl.textContent = statusText;
        }
        elements.bootFillEl.style.width = `${Math.max(0, Math.min(100, bootProgress))}%`;
        elements.bootPercentEl.textContent = `${Math.round(bootProgress)}%`;
    }

    function startBootProgress() {
        window.clearInterval(bootProgressIntervalId);
        bootProgressIntervalId = window.setInterval(() => {
            if (initialLoadSettled) {
                window.clearInterval(bootProgressIntervalId);
                bootProgressIntervalId = 0;
                return;
            }
            const target = 78;
            const remaining = target - bootProgress;
            if (remaining <= 0) {
                return;
            }
            bootProgress += Math.max(1.25, remaining * 0.08);
            renderBoot();
        }, 120);
    }

    function completeBootProgress() {
        window.clearInterval(bootProgressIntervalId);
        bootProgressIntervalId = 0;
        bootProgress = 100;
        renderBoot();
        if (!elements.bootEl) {
            return;
        }
        elements.bootEl.classList.add('is-hiding');
        window.setTimeout(() => {
            elements.bootEl.hidden = true;
            elements.bootEl.classList.remove('is-hiding');
        }, 240);
    }

    function renderStats() {
        const state = normalizeLeaderboardState(currentState);
        if (elements.rankedCountEl) {
            const rankedCount =
                state.totalEntries > 0
                    ? numberFormatter.format(state.totalEntries)
                    : state.entries.length > 0
                      ? numberFormatter.format(state.entries.length)
                      : '--';
            elements.rankedCountEl.textContent = rankedCount;
        }
        if (elements.syncEl) {
            const syncReference = Math.max(lastRefreshAt, lastBroadcastAt);
            elements.syncEl.textContent = state.loading
                ? 'Now'
                : formatRelativeStamp(syncReference);
        }
        if (elements.statusStatEl) {
            const statusState = resolveStatusState(state, socketConnected);
            elements.statusStatEl.dataset.tone = statusState.tone;
            const valueEl = elements.statusStatEl.querySelector(
                '.mobileDesktopLeaderboardStatValue'
            );
            if (valueEl) {
                valueEl.textContent = statusState.label;
            }
        }
    }

    function renderStatusText() {
        if (!elements.statusTextEl) {
            return;
        }
        const state = normalizeLeaderboardState(currentState);
        const syncReference = Math.max(lastRefreshAt, lastBroadcastAt);
        const entryCount =
            state.totalEntries > 0
                ? numberFormatter.format(state.totalEntries)
                : numberFormatter.format(state.entries.length);
        let text = '';
        if (state.loading && state.entries.length === 0) {
            text = 'Refreshing global player leaderboard...';
        } else if (state.entries.length > 0) {
            text = `${entryCount} ranked drivers${syncReference > 0 ? ` • updated ${formatRelativeStamp(syncReference)}` : ''}`;
        } else if (state.statusText) {
            text = state.statusText;
        } else {
            text = 'No saved player scores yet.';
        }
        elements.statusTextEl.textContent = text;
        elements.statusTextEl.dataset.tone = resolveStatusTone(state);
    }

    function renderList() {
        if (!elements.listEl) {
            return;
        }
        const state = normalizeLeaderboardState(currentState);
        if (state.loading && state.entries.length === 0) {
            elements.listEl.innerHTML =
                '<div class="welcomePreviewLeaderboardEmpty">Refreshing global player leaderboard...</div>';
            return;
        }
        if (state.entries.length === 0) {
            elements.listEl.innerHTML =
                '<div class="welcomePreviewLeaderboardEmpty">No saved player scores yet.</div>';
            return;
        }

        const parts = [];
        let previousSegment = '';
        state.entries.forEach((entry) => {
            if (entry.segment === 'viewer' && previousSegment !== 'viewer') {
                parts.push(buildDividerHtml(state.viewerRank, state.totalEntries));
            }
            parts.push(buildRowHtml(entry));
            previousSegment = entry.segment;
        });
        elements.listEl.innerHTML = parts.join('');
    }
}

function normalizeLeaderboardState(state = null) {
    const source = state && typeof state === 'object' ? state : {};
    const entries = Array.isArray(source.entries)
        ? source.entries.map((entry) => normalizeEntry(entry)).filter(Boolean)
        : [];
    return {
        enabled: Boolean(source.enabled),
        loading: Boolean(source.loading),
        statusText: typeof source.statusText === 'string' ? source.statusText.trim() : '',
        totalEntries: clampInteger(source.totalEntries, 0, 1_000_000, 0),
        viewerRank: clampInteger(source.viewerRank, 0, 1_000_000, 0),
        viewerHasEntry: Boolean(source.viewerHasEntry),
        entries,
    };
}

function normalizeEntry(entry = null) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const playerName = sanitizeName(entry.playerName || '');
    const score = clampInteger(entry.score, 0, 10_000_000, 0);
    if (!playerName || score <= 0) {
        return null;
    }
    return {
        playerName,
        avatarUrl: sanitizeImageUrl(entry.avatarUrl || ''),
        score,
        rank: clampInteger(entry.rank, 1, 1_000_000, 1),
        segment: sanitizeSegment(entry.segment),
        isViewer: Boolean(entry.isViewer),
        collectedCount: clampInteger(entry.collectedCount, 0, 10_000, 0),
        gameMode: sanitizeGameMode(entry.gameMode),
        createdAt: sanitizeDate(entry.createdAt),
    };
}

function buildRowHtml(entry) {
    const metaParts = [];
    if (entry.gameMode) {
        metaParts.push(entry.gameMode.toUpperCase());
    }
    if (entry.collectedCount > 0) {
        metaParts.push(`${numberFormatter.format(entry.collectedCount)} pickups`);
    }
    const createdLabel = formatEntryDate(entry.createdAt);
    if (createdLabel) {
        metaParts.push(createdLabel);
    }
    return (
        `<div class="welcomePreviewLeaderboardRow${entry.rank === 1 ? ' is-first' : ''}${entry.isViewer ? ' is-viewer' : ''}">` +
        '<div class="welcomePreviewLeaderboardHead">' +
        `<span class="welcomePreviewLeaderboardRank">#${entry.rank}</span>` +
        '<span class="welcomePreviewLeaderboardIdentity">' +
        buildAvatarHtml(entry) +
        `<span class="welcomePreviewLeaderboardName">${escapeHtml(entry.playerName)}</span>` +
        '</span>' +
        `<span class="welcomePreviewLeaderboardScore">${numberFormatter.format(entry.score)} pts</span>` +
        '</div>' +
        `<div class="welcomePreviewLeaderboardMeta">${escapeHtml(metaParts.join(' | '))}</div>` +
        '</div>'
    );
}

function buildDividerHtml(viewerRank, totalEntries) {
    const label =
        viewerRank > 0 && totalEntries > 0
            ? `Your position: #${viewerRank} of ${totalEntries}`
            : 'Your position';
    return `<div class="welcomePreviewLeaderboardDivider">${escapeHtml(label)}</div>`;
}

function buildAvatarHtml(entry) {
    const fallbackLabel = escapeHtml(resolveAvatarFallback(entry.playerName));
    const altText = escapeHtml(
        entry.playerName ? `${entry.playerName} profile photo` : 'Profile photo'
    );
    if (entry.avatarUrl) {
        return (
            '<span class="welcomePreviewLeaderboardAvatar">' +
            `<img class="welcomePreviewLeaderboardAvatarImage" src="${escapeHtml(entry.avatarUrl)}" alt="${altText}" loading="lazy" decoding="async" />` +
            '</span>'
        );
    }
    return `<span class="welcomePreviewLeaderboardAvatar welcomePreviewLeaderboardAvatarFallback" aria-hidden="true">${fallbackLabel}</span>`;
}

function resolveStatusState(state, socketConnected) {
    const unavailable = /unavailable|disabled|failed|could not/iu.test(state.statusText);
    if (state.loading) {
        return {
            label: 'Syncing',
            tone: 'sync',
        };
    }
    if (unavailable) {
        return {
            label: 'Offline',
            tone: 'offline',
        };
    }
    if (socketConnected && (state.enabled || state.entries.length > 0)) {
        return {
            label: 'Online',
            tone: 'online',
        };
    }
    if (state.enabled || state.entries.length > 0) {
        return {
            label: 'Ready',
            tone: 'ready',
        };
    }
    return {
        label: 'Offline',
        tone: 'offline',
    };
}

function resolveStatusTone(state) {
    if (!state.enabled && !state.loading) {
        return 'error';
    }
    if (state.loading) {
        return 'info';
    }
    if (state.entries.length > 0) {
        return 'success';
    }
    return 'muted';
}

function formatRelativeStamp(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '--';
    }
    const deltaMs = Math.max(0, Date.now() - timestamp);
    if (deltaMs < 5_000) {
        return 'Now';
    }
    const seconds = Math.round(deltaMs / 1000);
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.round(minutes / 60);
    return `${hours}h`;
}

function formatEntryDate(value) {
    if (!value) {
        return '';
    }
    try {
        return dateFormatter.format(new Date(value));
    } catch {
        return '';
    }
}

function sanitizeName(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().replace(/\s+/g, ' ').slice(0, 18) || '';
}

function sanitizeImageUrl(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    return /^(https?:)?\/\//iu.test(normalized) ? normalized : '';
}

function sanitizeGameMode(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'bots' || normalized === 'online' ? normalized : '';
}

function sanitizeSegment(value) {
    if (typeof value !== 'string') {
        return 'top';
    }
    return value.trim().toLowerCase() === 'viewer' ? 'viewer' : 'top';
}

function sanitizeDate(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const timestamp = Date.parse(value.trim());
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function resolveAvatarFallback(playerName = '') {
    const normalizedName = sanitizeName(playerName);
    if (!normalizedName) {
        return 'D';
    }
    return normalizedName.slice(0, 1).toUpperCase();
}

function clampInteger(value, min, max, fallback) {
    const minimum = Math.round(Number(min) || 0);
    const maximum = Math.max(minimum, Math.round(Number(max) || minimum));
    const fallbackValue = Math.min(maximum, Math.max(minimum, Math.round(Number(fallback) || 0)));
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallbackValue;
    }
    return Math.min(maximum, Math.max(minimum, Math.round(numeric)));
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
