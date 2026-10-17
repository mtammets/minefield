const crypto = require('crypto');
const { Client: PostgresClient } = require('pg');
const { createSupabaseServiceClient } = require('./supabase-config');

const GLOBAL_LEADERBOARD_TABLE_NAME = 'global_leaderboard';
const LEADERBOARD_PUBLIC_SELECT_COLUMNS = [
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
    'vehicle_id',
    'car_skin_id',
    'created_at',
].join(',');
const PLAYER_NAME_MAX_LENGTH = 18;
const VEHICLE_ID_MAX_LENGTH = 32;
const CAR_SKIN_ID_MAX_LENGTH = 48;
const WINNER_LABEL_MAX_LENGTH = 72;
const AVATAR_PATH_MAX_LENGTH = 512;

function createLeaderboardStore(config = {}) {
    const supabaseClient = createSupabaseServiceClient(config);
    if (!supabaseClient) {
        return createNoopLeaderboardStore();
    }

    return {
        isConfigured() {
            return true;
        },
        async readTopEntries(limit = 10) {
            const queryLimit = sanitizeLeaderboardLimit(limit, 10);
            const { data, error } = await supabaseClient
                .from(GLOBAL_LEADERBOARD_TABLE_NAME)
                .select(LEADERBOARD_PUBLIC_SELECT_COLUMNS)
                .neq('user_id', '')
                .order('score', { ascending: false })
                .order('collected_count', { ascending: false })
                .order('created_at', { ascending: true })
                .limit(queryLimit);

            if (error) {
                throw error;
            }

            const entries = Array.isArray(data)
                ? data.map((entry) => normalizeLeaderboardEntry(entry))
                : [];
            return enrichLeaderboardEntriesWithProfileImagePaths(entries, supabaseClient);
        },
        async readLeaderboardView(options = {}) {
            const topLimit = sanitizeLeaderboardLimit(options?.topLimit, 5);
            const viewerWindowRadius = sanitizeLeaderboardWindowRadius(
                options?.viewerWindowRadius,
                2
            );
            const viewerUserId = sanitizeLeaderboardUserId(options?.viewerUserId);

            if (config?.databaseEnabled && config?.databaseConnectionString) {
                const leaderboardView = await readLeaderboardViewFromDatabase({
                    connectionString: config.databaseConnectionString,
                    topLimit,
                    viewerWindowRadius,
                    viewerUserId,
                });
                return {
                    ...leaderboardView,
                    entries: await enrichLeaderboardEntriesWithProfileImagePaths(
                        leaderboardView.entries,
                        supabaseClient
                    ),
                };
            }

            const entries = await this.readTopEntries(topLimit);
            return {
                entries: entries.map((entry, index) => ({
                    ...entry,
                    rank: index + 1,
                    segment: 'top',
                    isViewer: Boolean(
                        viewerUserId && entry.userId && entry.userId === viewerUserId
                    ),
                })),
                totalEntries: entries.length,
                viewerRank: 0,
                viewerHasEntry: false,
                viewerStats: createEmptyViewerStats(),
                topLimit,
                viewerWindowRadius,
            };
        },
        async submitRoundResult(rawPayload = {}) {
            const record = buildLeaderboardRecord(rawPayload);
            if (!record) {
                return {
                    ok: false,
                    reason: 'invalid-payload',
                };
            }

            const { data, error } = await supabaseClient
                .from(GLOBAL_LEADERBOARD_TABLE_NAME)
                .insert(record)
                .select(LEADERBOARD_PUBLIC_SELECT_COLUMNS)
                .single();

            if (error) {
                throw error;
            }

            return {
                ok: true,
                entry: normalizeLeaderboardEntry(data),
            };
        },
        async deleteEntriesByUserId(userId) {
            const normalizedUserId = sanitizeLeaderboardUserId(userId);
            if (!normalizedUserId) {
                return {
                    ok: false,
                    deletedCount: 0,
                    reason: 'invalid-user-id',
                };
            }

            const { data, error } = await supabaseClient
                .from(GLOBAL_LEADERBOARD_TABLE_NAME)
                .delete()
                .eq('user_id', normalizedUserId)
                .select('id');

            if (error) {
                throw error;
            }

            return {
                ok: true,
                deletedCount: Array.isArray(data) ? data.length : 0,
            };
        },
    };
}

function createNoopLeaderboardStore() {
    return {
        isConfigured() {
            return false;
        },
        async readTopEntries() {
            return [];
        },
        async readLeaderboardView(options = {}) {
            return {
                entries: [],
                totalEntries: 0,
                viewerRank: 0,
                viewerHasEntry: false,
                viewerStats: createEmptyViewerStats(),
                topLimit: sanitizeLeaderboardLimit(options?.topLimit, 5),
                viewerWindowRadius: sanitizeLeaderboardWindowRadius(options?.viewerWindowRadius, 2),
            };
        },
        async submitRoundResult() {
            return {
                ok: false,
                reason: 'not-configured',
            };
        },
        async deleteEntriesByUserId() {
            return {
                ok: false,
                deletedCount: 0,
                reason: 'not-configured',
            };
        },
    };
}

async function ensureLeaderboardSchema({ connectionString } = {}) {
    if (!connectionString) {
        return {
            ok: false,
            reason: 'missing-connection-string',
        };
    }

    const client = new PostgresClient(resolvePostgresClientOptions(connectionString));
    await client.connect();

    try {
        await client.query(`
            create table if not exists public.${GLOBAL_LEADERBOARD_TABLE_NAME} (
                id uuid primary key,
                user_id text not null default '',
                player_name text not null,
                score integer not null check (score >= 0),
                collected_count integer not null default 0 check (collected_count >= 0),
                total_pickups integer not null default 0 check (total_pickups >= 0),
                total_score integer not null default 0 check (total_score >= 0),
                avatar_path text not null default '',
                game_mode text not null check (game_mode in ('bots', 'online')),
                finish_reason text not null default '',
                winner_label text not null default '',
                did_win boolean not null default false,
                vehicle_id text not null default '',
                car_skin_id text not null default '',
                created_at timestamptz not null default now()
            );

            alter table public.${GLOBAL_LEADERBOARD_TABLE_NAME}
                add column if not exists user_id text not null default '';

            alter table public.${GLOBAL_LEADERBOARD_TABLE_NAME}
                add column if not exists avatar_path text not null default '';

            alter table public.${GLOBAL_LEADERBOARD_TABLE_NAME}
                add column if not exists did_win boolean not null default false;

            alter table public.${GLOBAL_LEADERBOARD_TABLE_NAME}
                add column if not exists vehicle_id text not null default '';

            create index if not exists global_leaderboard_score_created_idx
                on public.${GLOBAL_LEADERBOARD_TABLE_NAME} (score desc, collected_count desc, created_at asc);

            alter table public.${GLOBAL_LEADERBOARD_TABLE_NAME} enable row level security;
            grant select on table public.${GLOBAL_LEADERBOARD_TABLE_NAME} to anon, authenticated;

            do $$
            begin
                if not exists (
                    select 1
                    from pg_policies
                    where schemaname = 'public'
                        and tablename = '${GLOBAL_LEADERBOARD_TABLE_NAME}'
                        and policyname = 'global_leaderboard_select_public'
                ) then
                    create policy global_leaderboard_select_public
                        on public.${GLOBAL_LEADERBOARD_TABLE_NAME}
                        for select
                        using (true);
                end if;
            end
            $$;
        `);

        return {
            ok: true,
        };
    } finally {
        await client.end();
    }
}

function buildLeaderboardRecord(rawPayload = {}) {
    const payload = sanitizeRoundResultPayload(rawPayload);
    if (!payload) {
        return null;
    }

    return {
        id: crypto.randomUUID(),
        user_id: payload.userId,
        player_name: payload.playerName,
        score: payload.score,
        collected_count: payload.collectedCount,
        total_pickups: payload.totalPickups,
        total_score: payload.totalScore,
        avatar_path: payload.avatarPath,
        game_mode: payload.gameMode,
        finish_reason: payload.finishReason,
        winner_label: payload.winnerLabel,
        did_win: payload.didWin,
        vehicle_id: payload.vehicleId,
        car_skin_id: payload.carSkinId,
    };
}

function sanitizeRoundResultPayload(rawPayload = {}) {
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    const userId = sanitizeLeaderboardUserId(payload.userId || payload.user_id);
    const playerName = sanitizeLeaderboardPlayerName(payload.playerName || payload.name);
    const score = clampInteger(payload.score, 0, 10_000_000, 0);
    const collectedCount = clampInteger(payload.collectedCount, 0, 10_000, 0);
    const totalPickups = clampInteger(payload.totalPickups, collectedCount, 10_000, collectedCount);
    const totalScore = clampInteger(payload.totalScore, score, 50_000_000, score);
    const gameMode = sanitizeLeaderboardGameMode(payload.gameMode);
    const finishReason = sanitizeLeaderboardFinishReason(payload.finishReason);
    const winnerLabel = sanitizeLeaderboardWinnerLabel(payload.winnerLabel);
    const didWin = Boolean(payload.didWin || payload.did_win);
    const vehicleId = sanitizeLeaderboardVehicleId(payload.vehicleId);
    const carSkinId = sanitizeLeaderboardCarSkinId(payload.carSkinId);
    const avatarPath = sanitizeLeaderboardAvatarPath(payload.avatarPath || payload.avatar_path);

    if (!userId || !playerName || !gameMode || score <= 0) {
        return null;
    }

    return {
        userId,
        playerName,
        score,
        collectedCount,
        totalPickups,
        totalScore,
        avatarPath,
        gameMode,
        finishReason,
        winnerLabel,
        didWin,
        vehicleId,
        carSkinId,
    };
}

function normalizeLeaderboardEntry(entry = {}) {
    return {
        id: typeof entry?.id === 'string' ? entry.id : '',
        userId: sanitizeLeaderboardUserId(entry?.user_id || entry?.userId),
        playerName: sanitizeLeaderboardPlayerName(entry?.player_name || entry?.playerName),
        avatarPath: sanitizeLeaderboardAvatarPath(entry?.avatar_path || entry?.avatarPath),
        score: clampInteger(entry?.score, 0, 10_000_000, 0),
        collectedCount: clampInteger(entry?.collected_count ?? entry?.collectedCount, 0, 10_000, 0),
        totalPickups: clampInteger(entry?.total_pickups ?? entry?.totalPickups, 0, 10_000, 0),
        totalScore: clampInteger(entry?.total_score ?? entry?.totalScore, 0, 50_000_000, 0),
        gameMode: sanitizeLeaderboardGameMode(entry?.game_mode || entry?.gameMode) || 'bots',
        finishReason:
            sanitizeLeaderboardFinishReason(entry?.finish_reason || entry?.finishReason) ||
            'pickups-exhausted',
        winnerLabel:
            sanitizeLeaderboardWinnerLabel(entry?.winner_label || entry?.winnerLabel) || 'Driver',
        vehicleId: sanitizeLeaderboardVehicleId(entry?.vehicle_id || entry?.vehicleId),
        carSkinId: sanitizeLeaderboardCarSkinId(entry?.car_skin_id || entry?.carSkinId),
        createdAt: sanitizeIsoTimestamp(entry?.created_at || entry?.createdAt),
    };
}

function createEmptyViewerStats() {
    return {
        totalRounds: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        bestScore: 0,
        averageScore: 0,
    };
}

async function enrichLeaderboardEntriesWithProfileImagePaths(entries = [], supabaseClient = null) {
    const normalizedEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
    if (!supabaseClient || normalizedEntries.length === 0) {
        return normalizedEntries;
    }

    const uniqueUserIds = Array.from(
        new Set(
            normalizedEntries
                .map((entry) => sanitizeLeaderboardUserId(entry?.userId))
                .filter(Boolean)
        )
    );
    if (uniqueUserIds.length === 0) {
        return normalizedEntries;
    }

    const avatarPathByUserId = new Map();
    await Promise.all(
        uniqueUserIds.map(async (userId) => {
            const currentAvatarPath = await readLeaderboardProfileImagePathForUser(
                supabaseClient,
                userId
            );
            if (currentAvatarPath) {
                avatarPathByUserId.set(userId, currentAvatarPath);
            }
        })
    );

    return normalizedEntries.map((entry) => {
        const userId = sanitizeLeaderboardUserId(entry?.userId);
        const avatarPath =
            (userId ? avatarPathByUserId.get(userId) : '') ||
            sanitizeLeaderboardAvatarPath(entry?.avatarPath);
        if (avatarPath === entry?.avatarPath) {
            return entry;
        }
        return {
            ...entry,
            avatarPath,
        };
    });
}

async function readLeaderboardProfileImagePathForUser(supabaseClient, userId) {
    const safeUserId = sanitizeLeaderboardUserId(userId);
    if (!supabaseClient?.auth?.admin?.getUserById || !safeUserId) {
        return '';
    }

    try {
        const { data, error } = await supabaseClient.auth.admin.getUserById(safeUserId);
        if (error || !data?.user) {
            return '';
        }
        return sanitizeLeaderboardAvatarPath(data.user.user_metadata?.avatar_path || '');
    } catch {
        return '';
    }
}

async function readLeaderboardViewFromDatabase({
    connectionString,
    topLimit = 5,
    viewerWindowRadius = 2,
    viewerUserId = '',
} = {}) {
    const client = new PostgresClient(resolvePostgresClientOptions(connectionString));
    await client.connect();

    try {
        const result = await client.query(
            `
                with best_scores as (
                    select *
                    from (
                        select
                            id,
                            user_id,
                            player_name,
                            avatar_path,
                            score,
                            collected_count,
                            total_pickups,
                            total_score,
                            game_mode,
                            finish_reason,
                            winner_label,
                            vehicle_id,
                            car_skin_id,
                            created_at,
                            row_number() over (
                                partition by user_id
                                order by score desc, collected_count desc, created_at asc
                            ) as user_best_rank
                        from public.${GLOBAL_LEADERBOARD_TABLE_NAME}
                        where user_id <> ''
                    ) ranked_user_scores
                    where user_best_rank = 1
                ),
                ranked as (
                    select
                        id,
                        user_id,
                        player_name,
                        avatar_path,
                        score,
                        collected_count,
                        total_pickups,
                        total_score,
                        game_mode,
                        finish_reason,
                        winner_label,
                        vehicle_id,
                        car_skin_id,
                        created_at,
                        row_number() over (
                            order by score desc, collected_count desc, created_at asc
                        ) as leaderboard_rank
                    from best_scores
                ),
                viewer as (
                    select leaderboard_rank
                    from ranked
                    where user_id = $1
                ),
                selected_rows as (
                    select
                        ranked.*,
                        case
                            when ranked.leaderboard_rank <= $2 then 'top'
                            when $1 <> ''
                                and exists (select 1 from viewer)
                                and ranked.leaderboard_rank between greatest(
                                    1,
                                    (select leaderboard_rank from viewer) - $3
                                ) and (
                                    (select leaderboard_rank from viewer) + $3
                                ) then 'viewer'
                            else null
                        end as leaderboard_segment,
                        exists(select 1 from viewer) as viewer_has_entry,
                        coalesce((select leaderboard_rank from viewer), 0) as viewer_rank,
                        (select count(*) from ranked) as total_entries
                    from ranked
                )
                select
                    id,
                    user_id,
                    player_name,
                    avatar_path,
                    score,
                    collected_count,
                    total_pickups,
                    total_score,
                    game_mode,
                    finish_reason,
                    winner_label,
                    vehicle_id,
                    car_skin_id,
                    created_at,
                    leaderboard_rank,
                    leaderboard_segment,
                    viewer_has_entry,
                    viewer_rank,
                    total_entries
                from selected_rows
                where leaderboard_segment is not null
                order by
                    case leaderboard_segment when 'top' then 0 else 1 end,
                    leaderboard_rank asc
            `,
            [viewerUserId, topLimit, viewerWindowRadius]
        );

        const rows = Array.isArray(result?.rows) ? result.rows : [];
        const entries = rows.map((row) => ({
            ...normalizeLeaderboardEntry(row),
            rank: clampInteger(row?.leaderboard_rank, 1, 1_000_000, 1),
            segment: sanitizeLeaderboardSegment(row?.leaderboard_segment),
            isViewer:
                Boolean(viewerUserId) &&
                sanitizeLeaderboardUserId(row?.user_id || row?.userId) === viewerUserId,
        }));
        const firstRow = rows[0] || null;
        const viewerStats = await readViewerStatsFromDatabase(client, viewerUserId);

        return {
            entries,
            totalEntries: clampInteger(firstRow?.total_entries, 0, 1_000_000, entries.length),
            viewerRank: clampInteger(firstRow?.viewer_rank, 0, 1_000_000, 0),
            viewerHasEntry: Boolean(firstRow?.viewer_has_entry),
            viewerStats,
            topLimit,
            viewerWindowRadius,
        };
    } finally {
        await client.end();
    }
}

async function readViewerStatsFromDatabase(client, viewerUserId = '') {
    const normalizedViewerUserId = sanitizeLeaderboardUserId(viewerUserId);
    if (!normalizedViewerUserId) {
        return createEmptyViewerStats();
    }

    const statsResult = await client.query(
        `
            select
                count(*)::int as total_rounds,
                coalesce(sum(case when did_win then 1 else 0 end), 0)::int as wins,
                coalesce(greatest(count(*) - sum(case when did_win then 1 else 0 end), 0), 0)::int as losses,
                coalesce(max(score), 0)::int as best_score,
                coalesce(round(avg(score))::int, 0) as average_score
            from public.${GLOBAL_LEADERBOARD_TABLE_NAME}
            where user_id = $1
        `,
        [normalizedViewerUserId]
    );

    const row = Array.isArray(statsResult?.rows) ? statsResult.rows[0] : null;
    if (!row) {
        return createEmptyViewerStats();
    }

    const totalRounds = clampInteger(row?.total_rounds, 0, 1_000_000, 0);
    const wins = clampInteger(row?.wins, 0, totalRounds || 1_000_000, 0);
    const losses = clampInteger(
        row?.losses,
        0,
        totalRounds || 1_000_000,
        Math.max(0, totalRounds - wins)
    );
    const bestScore = clampInteger(row?.best_score, 0, 10_000_000, 0);
    const averageScore = clampInteger(row?.average_score, 0, 10_000_000, 0);
    const winRate =
        totalRounds > 0 ? clampInteger(Math.round((wins / totalRounds) * 100), 0, 100, 0) : 0;

    return {
        totalRounds,
        wins,
        losses,
        winRate,
        bestScore,
        averageScore,
    };
}

function sanitizeLeaderboardPlayerName(value) {
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
    const normalized = value.trim().slice(0, 128);
    return /^[a-zA-Z0-9-]{6,128}$/u.test(normalized) ? normalized : '';
}

function sanitizeLeaderboardWinnerLabel(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\p{L}\p{N} _,.\-]/gu, '')
        .slice(0, WINNER_LABEL_MAX_LENGTH);
    return normalized || '';
}

function sanitizeLeaderboardVehicleId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, VEHICLE_ID_MAX_LENGTH);
    return normalized || '';
}

function sanitizeLeaderboardCarSkinId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, CAR_SKIN_ID_MAX_LENGTH);
    return normalized || '';
}

function sanitizeLeaderboardAvatarPath(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().replace(/^\/+|\/+$/g, '');
    if (!normalized || normalized.length > AVATAR_PATH_MAX_LENGTH || normalized.includes('..')) {
        return '';
    }
    const segments = normalized.split('/');
    if (segments.some((segment) => !/^[a-zA-Z0-9._-]{1,120}$/u.test(segment))) {
        return '';
    }
    return normalized;
}

function sanitizeLeaderboardGameMode(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'bots' || normalized === 'online' ? normalized : '';
}

function sanitizeLeaderboardFinishReason(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'pickups-exhausted' || normalized === 'opponents-eliminated'
        ? normalized
        : '';
}

function sanitizeLeaderboardLimit(value, fallback = 10) {
    const safeFallback = clampInteger(fallback, 1, 20, 10);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return safeFallback;
    }
    const rounded = Math.round(numeric);
    if (rounded < 1) {
        return safeFallback;
    }
    if (rounded > 20) {
        return 20;
    }
    return rounded;
}

function sanitizeLeaderboardWindowRadius(value, fallback = 2) {
    const safeFallback = clampInteger(fallback, 1, 4, 2);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return safeFallback;
    }
    const rounded = Math.round(numeric);
    if (rounded < 1) {
        return safeFallback;
    }
    if (rounded > 4) {
        return 4;
    }
    return rounded;
}

function sanitizeLeaderboardSegment(value) {
    if (typeof value !== 'string') {
        return 'top';
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'viewer' ? 'viewer' : 'top';
}

function sanitizeIsoTimestamp(value) {
    if (value instanceof Date) {
        const timestamp = value.getTime();
        return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
    }
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

function resolvePostgresClientOptions(connectionString) {
    const options = {
        connectionString,
        statement_timeout: 10_000,
    };

    try {
        const parsed = new URL(connectionString);
        const hostname = String(parsed.hostname || '')
            .trim()
            .toLowerCase();
        const isLocalHost =
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '::1' ||
            hostname.endsWith('.local');
        if (!isLocalHost) {
            options.ssl = {
                rejectUnauthorized: false,
            };
        }
    } catch {
        options.ssl = {
            rejectUnauthorized: false,
        };
    }

    return options;
}

module.exports = {
    GLOBAL_LEADERBOARD_TABLE_NAME,
    buildLeaderboardRecord,
    createLeaderboardStore,
    ensureLeaderboardSchema,
    normalizeLeaderboardEntry,
    sanitizeLeaderboardAvatarPath,
    sanitizeLeaderboardCarSkinId,
    sanitizeLeaderboardFinishReason,
    sanitizeLeaderboardGameMode,
    sanitizeLeaderboardLimit,
    sanitizeLeaderboardPlayerName,
    sanitizeLeaderboardSegment,
    sanitizeLeaderboardUserId,
    sanitizeLeaderboardVehicleId,
    sanitizeLeaderboardWindowRadius,
    sanitizeLeaderboardWinnerLabel,
    sanitizeRoundResultPayload,
};
