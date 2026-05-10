import { getSupabaseBrowserClient, getSupabaseBrowserConfig } from './supabase-browser.js';

const GLOBAL_LEADERBOARD_TABLE_NAME = 'global_leaderboard';
const LEADERBOARD_SELECT_COLUMNS = [
    'id',
    'user_id',
    'player_name',
    'avatar_path',
    'score',
    'collected_count',
    'total_pickups',
    'total_score',
    'game_mode',
    'finish_reason',
    'winner_label',
    'car_skin_id',
    'created_at',
].join(',');
const LEADERBOARD_READ_ENDPOINT_PATH = '/api/leaderboard/global';
const LEADERBOARD_SUBMIT_ENDPOINT_PATH = '/api/leaderboard/round-result';
const LEADERBOARD_DEFAULT_LIMIT = 5;
const LEADERBOARD_MAX_LIMIT = 20;
const LEADERBOARD_VIEWER_WINDOW_RADIUS = 2;
const MP_NAME_STORAGE_KEY = 'silentdrift-mp-player-name';
const DEFAULT_DRIVER_NAME = 'Driver';
const PLAYER_NAME_MAX_LENGTH = 18;

export function createGlobalLeaderboardController({
    onStateChanged = null,
    getAccessToken = () => '',
    getAuthState = () => null,
} = {}) {
    const listeners = new Set();
    let state = createInitialLeaderboardState();

    return {
        async initialize() {
            const supabaseConfig = await getSupabaseBrowserConfig();
            if (!supabaseConfig.enabled || !supabaseConfig.leaderboardEnabled) {
                updateState({
                    enabled: false,
                    loading: false,
                    source: '',
                    statusText: 'Supabase global leaderboard is disabled.',
                    entries: [],
                });
                return getState();
            }

            updateState({
                enabled: true,
                loading: true,
                source: '',
                statusText: 'Loading global leaderboard...',
                entries: state.entries,
            });
            await refreshLeaderboardEntries(LEADERBOARD_DEFAULT_LIMIT);
            return getState();
        },
        async refresh(limit = LEADERBOARD_DEFAULT_LIMIT) {
            return refreshLeaderboardEntries(limit);
        },
        async submitRoundResult(rawPayload = {}) {
            const supabaseConfig = await getSupabaseBrowserConfig();
            if (!supabaseConfig.enabled || !supabaseConfig.leaderboardEnabled) {
                updateState({
                    enabled: false,
                    loading: false,
                    source: '',
                    statusText: 'Supabase global leaderboard is disabled.',
                    entries: state.entries,
                });
                return {
                    ok: false,
                    reason: 'not-configured',
                };
            }

            const authState = getAuthState();
            const accessToken =
                typeof getAccessToken === 'function' ? sanitizeAccessToken(getAccessToken()) : '';
            if (!authState?.authenticated || !accessToken) {
                updateState({
                    enabled: true,
                    loading: false,
                    source: state.source,
                    statusText: 'Sign in to sync your score to the global player leaderboard.',
                    entries: state.entries,
                });
                return {
                    ok: false,
                    reason: 'auth-required',
                };
            }

            const payload = normalizeSubmittedRoundResult(rawPayload);
            if (!payload) {
                return {
                    ok: false,
                    reason: 'invalid-payload',
                };
            }

            updateState({
                enabled: true,
                loading: true,
                source: state.source,
                statusText: 'Syncing score to Supabase...',
                entries: state.entries,
            });

            try {
                const response = await window.fetch(LEADERBOARD_SUBMIT_ENDPOINT_PATH, {
                    method: 'POST',
                    cache: 'no-store',
                    credentials: 'same-origin',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                });
                const responsePayload = await readJsonResponse(response);
                if (!response.ok || !responsePayload?.ok) {
                    throw new Error(responsePayload?.error || 'Leaderboard submit failed.');
                }
                await refreshLeaderboardEntries(LEADERBOARD_DEFAULT_LIMIT);
                return {
                    ok: true,
                    entry: normalizePublicLeaderboardEntry(responsePayload?.entry, {}, {
                        supabaseConfig,
                        authState,
                    }),
                };
            } catch {
                updateState({
                    enabled: true,
                    loading: false,
                    source: state.source,
                    statusText:
                        'Score sync failed. The global player leaderboard is temporarily unavailable.',
                    entries: state.entries,
                });
                return {
                    ok: false,
                    reason: 'submit-failed',
                };
            }
        },
        getState() {
            return getState();
        },
        subscribe(listener) {
            if (typeof listener !== 'function') {
                return () => {};
            }
            listeners.add(listener);
            listener(getState());
            return () => {
                listeners.delete(listener);
            };
        },
    };

    function getState() {
        return {
            ...state,
            entries: state.entries.map((entry) => ({ ...entry })),
        };
    }

    function updateState(nextState = {}) {
        state = {
            ...state,
            ...nextState,
            entries: Array.isArray(nextState.entries)
                ? nextState.entries.map((entry) => ({ ...entry }))
                : state.entries,
        };
        const snapshot = getState();
        onStateChanged?.(snapshot);
        listeners.forEach((listener) => {
            listener(snapshot);
        });
    }

    async function refreshLeaderboardEntries(limit = LEADERBOARD_DEFAULT_LIMIT) {
        const supabaseConfig = await getSupabaseBrowserConfig();
        if (!supabaseConfig.enabled || !supabaseConfig.leaderboardEnabled) {
            updateState({
                enabled: false,
                loading: false,
                source: '',
                statusText: 'Supabase global leaderboard is disabled.',
                entries: [],
                totalEntries: 0,
                viewerRank: 0,
                viewerHasEntry: false,
            });
            return [];
        }

        const queryLimit = clampInteger(limit, 1, LEADERBOARD_MAX_LIMIT, LEADERBOARD_DEFAULT_LIMIT);
        const accessToken =
            typeof getAccessToken === 'function' ? sanitizeAccessToken(getAccessToken()) : '';
        const authState = getAuthState();
        const serverRead = await readLeaderboardEntriesFromServer(
            queryLimit,
            accessToken,
            supabaseConfig,
            authState
        );
        if (serverRead.ok) {
            updateState({
                enabled: true,
                loading: false,
                source: 'server',
                statusText: buildLeaderboardStatusText(serverRead.entries, 'server'),
                entries: serverRead.entries,
                totalEntries: serverRead.totalEntries,
                viewerRank: serverRead.viewerRank,
                viewerHasEntry: serverRead.viewerHasEntry,
                topLimit: serverRead.topLimit,
                viewerWindowRadius: serverRead.viewerWindowRadius,
            });
            return serverRead.entries;
        }

        const directRead = await readLeaderboardEntriesDirect(queryLimit, supabaseConfig, authState);
        if (directRead.ok) {
            updateState({
                enabled: true,
                loading: false,
                source: 'supabase',
                statusText: buildLeaderboardStatusText(directRead.entries, 'supabase'),
                entries: directRead.entries,
                totalEntries: directRead.totalEntries,
                viewerRank: directRead.viewerRank,
                viewerHasEntry: directRead.viewerHasEntry,
                topLimit: directRead.topLimit,
                viewerWindowRadius: directRead.viewerWindowRadius,
            });
            return directRead.entries;
        }

        updateState({
            enabled: true,
            loading: false,
            source: '',
            statusText: 'Global player leaderboard unavailable right now.',
            entries: [],
            totalEntries: 0,
            viewerRank: 0,
            viewerHasEntry: false,
        });
        return [];
    }
}

function createInitialLeaderboardState() {
    return {
        enabled: false,
        loading: false,
        source: '',
        statusText: '',
        entries: [],
        totalEntries: 0,
        viewerRank: 0,
        viewerHasEntry: false,
        topLimit: LEADERBOARD_DEFAULT_LIMIT,
        viewerWindowRadius: LEADERBOARD_VIEWER_WINDOW_RADIUS,
    };
}

async function readLeaderboardEntriesDirect(limit, supabaseConfig = null, authState = null) {
    try {
        const supabaseClient = await getSupabaseBrowserClient();
        if (!supabaseClient) {
            return {
                ok: false,
                entries: [],
            };
        }

        const fetchLimit = clampInteger(limit * 4, limit, LEADERBOARD_MAX_LIMIT * 4, limit);
        const { data, error } = await supabaseClient
            .from(GLOBAL_LEADERBOARD_TABLE_NAME)
            .select(LEADERBOARD_SELECT_COLUMNS)
            .neq('user_id', '')
            .order('score', { ascending: false })
            .order('collected_count', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(fetchLimit);

        if (error) {
            return {
                ok: false,
                entries: [],
            };
        }

        const normalizedEntries = Array.isArray(data)
            ? data
                  .map((entry) =>
                      normalizePublicLeaderboardEntry(entry, {}, { supabaseConfig, authState })
                  )
                  .filter(Boolean)
            : [];
        const uniqueEntries = buildBestUniqueLeaderboardEntries(normalizedEntries, limit);

        return {
            ok: true,
            entries: uniqueEntries,
            totalEntries: uniqueEntries.length,
            viewerRank: 0,
            viewerHasEntry: false,
            topLimit: limit,
            viewerWindowRadius: LEADERBOARD_VIEWER_WINDOW_RADIUS,
        };
    } catch {
        return {
            ok: false,
            entries: [],
        };
    }
}

async function readLeaderboardEntriesFromServer(
    limit,
    accessToken = '',
    supabaseConfig = null,
    authState = null
) {
    try {
        const response = await window.fetch(
            `${LEADERBOARD_READ_ENDPOINT_PATH}?limit=${encodeURIComponent(String(limit))}&window=${encodeURIComponent(String(LEADERBOARD_VIEWER_WINDOW_RADIUS))}`,
            {
                method: 'GET',
                cache: 'no-store',
                credentials: 'same-origin',
                headers: accessToken
                    ? {
                          Authorization: `Bearer ${accessToken}`,
                      }
                    : {},
            }
        );
        const payload = await readJsonResponse(response);
        if (!response.ok || !payload?.ok) {
            return {
                ok: false,
                entries: [],
            };
        }
        const rawEntries = Array.isArray(payload.entries) ? payload.entries : [];
        const hasRankMetadata =
            rawEntries.length === 0 ||
            rawEntries.every((entry) => Number.isFinite(Number(entry?.rank)));
        if (!hasRankMetadata) {
            return {
                ok: false,
                entries: [],
            };
        }

        return {
            ok: true,
            entries: rawEntries
                .map((entry) =>
                    normalizePublicLeaderboardEntry(entry, {}, { supabaseConfig, authState })
                )
                .filter(Boolean),
            totalEntries: clampInteger(payload.totalEntries, 0, 1_000_000, 0),
            viewerRank: clampInteger(payload.viewerRank, 0, 1_000_000, 0),
            viewerHasEntry: Boolean(payload.viewerHasEntry),
            topLimit: clampInteger(payload.topLimit, 1, LEADERBOARD_MAX_LIMIT, limit),
            viewerWindowRadius: clampInteger(
                payload.viewerWindowRadius,
                1,
                4,
                LEADERBOARD_VIEWER_WINDOW_RADIUS
            ),
        };
    } catch {
        return {
            ok: false,
            entries: [],
        };
    }
}

async function readJsonResponse(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

function normalizeSubmittedRoundResult(rawPayload = {}) {
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    const directName = sanitizePlayerName(payload.playerName || payload.name);
    const storedName = readStoredPlayerName();
    const resolvedName =
        directName && directName.toLowerCase() !== 'you'
            ? directName
            : storedName || DEFAULT_DRIVER_NAME;
    const score = clampInteger(payload.score, 0, 10_000_000, 0);
    const collectedCount = clampInteger(payload.collectedCount, 0, 10_000, 0);
    const totalPickups = clampInteger(payload.totalPickups, collectedCount, 10_000, collectedCount);
    const totalScore = clampInteger(payload.totalScore, score, 50_000_000, score);
    const gameMode = sanitizeGameMode(payload.gameMode);
    const finishReason = sanitizeFinishReason(payload.finishReason);
    const winnerLabel = sanitizeWinnerLabel(payload.winnerLabel);
    const carSkinId = sanitizeCarSkinId(payload.carSkinId);

    if (!resolvedName || !gameMode || score <= 0) {
        return null;
    }

    return {
        playerName: resolvedName,
        score,
        collectedCount,
        totalPickups,
        totalScore,
        gameMode,
        finishReason,
        winnerLabel,
        carSkinId,
    };
}

function normalizePublicLeaderboardEntry(entry = null, fallbackMeta = {}, options = {}) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const playerName = sanitizePlayerName(entry.playerName || entry.player_name);
    const score = clampInteger(entry.score, 0, 10_000_000, 0);
    if (!playerName || score <= 0) {
        return null;
    }

    const authState = options?.authState && typeof options.authState === 'object' ? options.authState : null;
    const supabaseConfig =
        options?.supabaseConfig && typeof options.supabaseConfig === 'object'
            ? options.supabaseConfig
            : null;
    const userId = sanitizeLeaderboardUserId(entry.userId || entry.user_id);
    const avatarPath = sanitizeProfileImagePath(entry.avatarPath || entry.avatar_path);
    const viewerUserId = sanitizeLeaderboardUserId(authState?.userId || '');
    const viewerAvatarUrl =
        authState?.authenticated && viewerUserId && viewerUserId === userId
            ? sanitizeProfileImageUrl(authState?.avatarUrl || '')
            : '';
    const avatarUrl =
        viewerAvatarUrl ||
        sanitizeProfileImageUrl(entry.avatarUrl || entry.avatar_url) ||
        resolveProfileImagePublicUrl(
            supabaseConfig?.url || '',
            supabaseConfig?.profileImagesBucket || '',
            avatarPath
        );

    return {
        id: typeof entry.id === 'string' ? entry.id : '',
        userId,
        playerName,
        avatarPath,
        avatarUrl,
        score,
        collectedCount: clampInteger(entry.collectedCount ?? entry.collected_count, 0, 10_000, 0),
        totalPickups: clampInteger(entry.totalPickups ?? entry.total_pickups, 0, 10_000, 0),
        totalScore: clampInteger(entry.totalScore ?? entry.total_score, 0, 50_000_000, 0),
        gameMode: sanitizeGameMode(entry.gameMode || entry.game_mode) || 'bots',
        finishReason: sanitizeFinishReason(entry.finishReason || entry.finish_reason) || '',
        winnerLabel: sanitizeWinnerLabel(entry.winnerLabel || entry.winner_label),
        carSkinId: sanitizeCarSkinId(entry.carSkinId || entry.car_skin_id),
        createdAt: sanitizeIsoTimestamp(entry.createdAt || entry.created_at),
        rank: clampInteger(entry.rank, 1, 1_000_000, clampInteger(fallbackMeta.rank, 1, 1_000_000, 1)),
        segment: sanitizeLeaderboardSegment(entry.segment || fallbackMeta.segment),
        isViewer: Boolean(entry.isViewer ?? fallbackMeta.isViewer),
    };
}

function buildLeaderboardStatusText(entries, source) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return 'No global player scores saved yet. Finish a round to seed the leaderboard.';
    }
    return '';
}

function buildBestUniqueLeaderboardEntries(entries, limit) {
    const normalizedEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
    const bestByUserId = new Map();
    const passthroughEntries = [];

    normalizedEntries.forEach((entry) => {
        if (!entry?.userId) {
            passthroughEntries.push(entry);
            return;
        }
        const existingEntry = bestByUserId.get(entry.userId);
        if (!existingEntry || compareLeaderboardEntries(entry, existingEntry) < 0) {
            bestByUserId.set(entry.userId, entry);
        }
    });

    return [...bestByUserId.values(), ...passthroughEntries]
        .sort(compareLeaderboardEntries)
        .slice(0, limit)
        .map((entry, index) => ({
            ...entry,
            rank: index + 1,
            segment: 'top',
            isViewer: false,
        }));
}

function compareLeaderboardEntries(leftEntry, rightEntry) {
    const scoreDelta =
        clampInteger(rightEntry?.score, 0, 10_000_000, 0) -
        clampInteger(leftEntry?.score, 0, 10_000_000, 0);
    if (scoreDelta !== 0) {
        return scoreDelta;
    }

    const collectedDelta =
        clampInteger(rightEntry?.collectedCount, 0, 10_000, 0) -
        clampInteger(leftEntry?.collectedCount, 0, 10_000, 0);
    if (collectedDelta !== 0) {
        return collectedDelta;
    }

    return (
        resolveLeaderboardTimestamp(leftEntry?.createdAt) -
        resolveLeaderboardTimestamp(rightEntry?.createdAt)
    );
}

function resolveLeaderboardTimestamp(value) {
    if (typeof value !== 'string' || !value.trim()) {
        return Number.MAX_SAFE_INTEGER;
    }
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function sanitizeLeaderboardSegment(value) {
    if (typeof value !== 'string') {
        return 'top';
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'viewer' ? 'viewer' : 'top';
}

function readStoredPlayerName() {
    try {
        const value = window.localStorage.getItem(MP_NAME_STORAGE_KEY);
        return sanitizePlayerName(value || '') || DEFAULT_DRIVER_NAME;
    } catch {
        return DEFAULT_DRIVER_NAME;
    }
}

function sanitizePlayerName(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\p{L}\p{N} _.\-]/gu, '')
        .slice(0, PLAYER_NAME_MAX_LENGTH);
    return normalized || '';
}

function sanitizeLeaderboardUserId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().replace(/[^a-z0-9-]/giu, '').slice(0, 128);
    return normalized || '';
}

function sanitizeGameMode(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'bots' || normalized === 'online' ? normalized : '';
}

function sanitizeFinishReason(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'pickups-exhausted' || normalized === 'opponents-eliminated'
        ? normalized
        : '';
}

function sanitizeWinnerLabel(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\p{L}\p{N} _,.\-]/gu, '')
        .slice(0, 72);
    return normalized || '';
}

function sanitizeCarSkinId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 48);
    return normalized || '';
}

function sanitizeProfileImageBucketName(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase();
    if (normalized.length < 3 || normalized.length > 63) {
        return '';
    }
    if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u.test(normalized)) {
        return '';
    }
    return normalized;
}

function sanitizeProfileImagePath(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().replace(/^\/+|\/+$/g, '');
    if (!normalized || normalized.length > 512 || normalized.includes('..')) {
        return '';
    }
    const segments = normalized.split('/');
    if (segments.some((segment) => !/^[a-zA-Z0-9._-]{1,120}$/u.test(segment))) {
        return '';
    }
    return normalized;
}

function sanitizeProfileImageUrl(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    return /^(https?:)?\/\//iu.test(normalized) ? normalized : '';
}

function resolveProfileImagePublicUrl(baseUrl, bucketName, profileImagePath) {
    const safeBaseUrl =
        typeof baseUrl === 'string' && /^(https?:)?\/\//iu.test(baseUrl.trim())
            ? baseUrl.trim().replace(/\/+$/u, '')
            : '';
    const safeBucketName = sanitizeProfileImageBucketName(bucketName);
    const safeProfileImagePath = sanitizeProfileImagePath(profileImagePath);
    if (!safeBaseUrl || !safeBucketName || !safeProfileImagePath) {
        return '';
    }
    const encodedPath = safeProfileImagePath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
    return `${safeBaseUrl}/storage/v1/object/public/${encodeURIComponent(safeBucketName)}/${encodedPath}`;
}

function sanitizeIsoTimestamp(value) {
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

function clampInteger(value, min, max, fallback) {
    const minimum = Math.round(Number(min) || 0);
    const maximum = Math.max(minimum, Math.round(Number(max) || minimum));
    const fallbackValue = Math.min(maximum, Math.max(minimum, Math.round(Number(fallback) || 0)));
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallbackValue;
    }
    const rounded = Math.round(numeric);
    return Math.min(maximum, Math.max(minimum, rounded));
}

function sanitizeAccessToken(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    return normalized.length >= 32 ? normalized.slice(0, 8192) : '';
}
