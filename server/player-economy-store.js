const crypto = require('crypto');
const { Client: PostgresClient } = require('pg');
const { createSupabaseServiceClient } = require('./supabase-config');

const PLAYER_ECONOMY_WALLETS_TABLE_NAME = 'player_economy_wallets';
const PLAYER_ECONOMY_TRANSACTIONS_TABLE_NAME = 'player_economy_transactions';
const PLAYER_ECONOMY_WALLET_SELECT_COLUMNS = [
    'user_id',
    'credits',
    'unlocked_vehicle_ids',
    'lifetime_earned',
    'lifetime_spent',
    'transaction_count',
    'last_transaction_kind',
    'last_transaction_summary',
    'last_synced_at',
    'created_at',
    'updated_at',
].join(',');
const PLAYER_ECONOMY_TRANSACTION_SELECT_COLUMNS = [
    'id',
    'user_id',
    'kind',
    'credits_delta',
    'balance_after',
    'summary',
    'metadata_json',
    'created_at',
].join(',');
const DEFAULT_PLAYER_VEHICLE_ID = 'voltline-sled';
const DEFAULT_UNLOCKED_VEHICLE_IDS = Object.freeze([DEFAULT_PLAYER_VEHICLE_ID]);
const PLAYER_ECONOMY_MAX_CREDITS = Number.MAX_SAFE_INTEGER;
const PLAYER_ECONOMY_RECENT_TRANSACTION_LIMIT_DEFAULT = 6;
const PLAYER_ECONOMY_RECENT_TRANSACTION_LIMIT_MAX = 12;
const PLAYER_VEHICLE_ID_MAX_LENGTH = 32;
const PLAYER_ECONOMY_TRANSACTION_KIND_MAX_LENGTH = 32;
const PLAYER_ECONOMY_TRANSACTION_SUMMARY_MAX_LENGTH = 160;

function createPlayerEconomyStore(config = {}) {
    const supabaseClient = createSupabaseServiceClient(config);
    if (!supabaseClient) {
        return createNoopPlayerEconomyStore();
    }

    return {
        isConfigured() {
            return true;
        },
        async readProfileByUserId(userId, options = {}) {
            const normalizedUserId = sanitizeSupabaseUserId(userId);
            if (!normalizedUserId) {
                return createDefaultPlayerEconomyProfile({
                    exists: false,
                });
            }
            const recentLimit = sanitizeRecentTransactionLimit(options?.recentLimit);
            const wallet = await readWalletRecord(supabaseClient, normalizedUserId);
            const recentTransactions = await readRecentTransactions(
                supabaseClient,
                normalizedUserId,
                recentLimit
            );
            return normalizePlayerEconomyProfile({
                ...wallet,
                userId: normalizedUserId,
                recentTransactions,
                exists: Boolean(wallet.exists),
            });
        },
        async syncProfileByUserId(userId, rawPayload = {}) {
            const normalizedUserId = sanitizeSupabaseUserId(userId);
            if (!normalizedUserId) {
                return createDefaultPlayerEconomyProfile({
                    exists: false,
                });
            }

            const currentProfile = await this.readProfileByUserId(normalizedUserId, {
                recentLimit: sanitizeRecentTransactionLimit(rawPayload?.recentLimit),
            });
            const currentEconomy = normalizePlayerEconomyStatePayload(currentProfile);
            const nextEconomy = normalizePlayerEconomyStatePayload(rawPayload);
            const nextUnlockedVehicleIds = mergeUnlockedVehicleIds(
                currentEconomy.unlockedVehicleIds,
                nextEconomy.unlockedVehicleIds
            );
            const transaction = normalizePlayerEconomyTransaction(
                rawPayload?.transaction,
                currentEconomy.credits,
                nextEconomy.credits
            );

            let nextLifetimeEarned = currentProfile.lifetimeEarned;
            let nextLifetimeSpent = currentProfile.lifetimeSpent;
            let nextTransactionCount = currentProfile.transactionCount;
            let nextLastTransactionKind = currentProfile.lastTransactionKind;
            let nextLastTransactionSummary = currentProfile.lastTransactionSummary;

            if (transaction) {
                if (transaction.creditsDelta > 0) {
                    nextLifetimeEarned = clampCredits(
                        currentProfile.lifetimeEarned + transaction.creditsDelta
                    );
                } else if (transaction.creditsDelta < 0) {
                    nextLifetimeSpent = clampCredits(
                        currentProfile.lifetimeSpent + Math.abs(transaction.creditsDelta)
                    );
                }
                nextTransactionCount = clampCredits(currentProfile.transactionCount + 1);
                nextLastTransactionKind = transaction.kind;
                nextLastTransactionSummary = transaction.summary;
            }

            const nowIso = new Date().toISOString();
            const walletRecord = {
                user_id: normalizedUserId,
                credits: nextEconomy.credits,
                unlocked_vehicle_ids: nextUnlockedVehicleIds,
                lifetime_earned: nextLifetimeEarned,
                lifetime_spent: nextLifetimeSpent,
                transaction_count: nextTransactionCount,
                last_transaction_kind: nextLastTransactionKind,
                last_transaction_summary: nextLastTransactionSummary,
                last_synced_at: nowIso,
                updated_at: nowIso,
            };

            const { data, error } = await supabaseClient
                .from(PLAYER_ECONOMY_WALLETS_TABLE_NAME)
                .upsert(walletRecord, {
                    onConflict: 'user_id',
                })
                .select(PLAYER_ECONOMY_WALLET_SELECT_COLUMNS)
                .single();
            if (error) {
                throw error;
            }

            if (transaction) {
                const { error: transactionError } = await supabaseClient
                    .from(PLAYER_ECONOMY_TRANSACTIONS_TABLE_NAME)
                    .insert({
                        id: crypto.randomUUID(),
                        user_id: normalizedUserId,
                        kind: transaction.kind,
                        credits_delta: transaction.creditsDelta,
                        balance_after: nextEconomy.credits,
                        summary: transaction.summary,
                        metadata_json: transaction.metadata,
                    });
                if (transactionError) {
                    throw transactionError;
                }
            }

            const recentTransactions = await readRecentTransactions(
                supabaseClient,
                normalizedUserId,
                sanitizeRecentTransactionLimit(rawPayload?.recentLimit)
            );
            return normalizePlayerEconomyProfile({
                ...normalizeWalletRecord(data),
                userId: normalizedUserId,
                recentTransactions,
                exists: true,
            });
        },
        async deleteProfileByUserId(userId) {
            const normalizedUserId = sanitizeSupabaseUserId(userId);
            if (!normalizedUserId) {
                return {
                    ok: false,
                    deletedWallets: 0,
                    deletedTransactions: 0,
                    reason: 'invalid-user-id',
                };
            }

            const { data: deletedTransactions, error: transactionError } = await supabaseClient
                .from(PLAYER_ECONOMY_TRANSACTIONS_TABLE_NAME)
                .delete()
                .eq('user_id', normalizedUserId)
                .select('id');
            if (transactionError) {
                throw transactionError;
            }

            const { data: deletedWallets, error: walletError } = await supabaseClient
                .from(PLAYER_ECONOMY_WALLETS_TABLE_NAME)
                .delete()
                .eq('user_id', normalizedUserId)
                .select('user_id');
            if (walletError) {
                throw walletError;
            }

            return {
                ok: true,
                deletedWallets: Array.isArray(deletedWallets) ? deletedWallets.length : 0,
                deletedTransactions: Array.isArray(deletedTransactions)
                    ? deletedTransactions.length
                    : 0,
            };
        },
    };
}

function createNoopPlayerEconomyStore() {
    return {
        isConfigured() {
            return false;
        },
        async readProfileByUserId() {
            return createDefaultPlayerEconomyProfile({
                exists: false,
            });
        },
        async syncProfileByUserId(_userId, rawPayload = {}) {
            return normalizePlayerEconomyProfile({
                ...createDefaultPlayerEconomyProfile({
                    exists: false,
                }),
                credits: clampCredits(rawPayload?.credits),
                unlockedVehicleIds: normalizeUnlockedVehicleIds(rawPayload?.unlockedVehicleIds),
            });
        },
        async deleteProfileByUserId() {
            return {
                ok: false,
                deletedWallets: 0,
                deletedTransactions: 0,
                reason: 'not-configured',
            };
        },
    };
}

async function ensurePlayerEconomySchema({ connectionString } = {}) {
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
            create table if not exists public.${PLAYER_ECONOMY_WALLETS_TABLE_NAME} (
                user_id text primary key,
                credits integer not null default 0 check (credits >= 0),
                unlocked_vehicle_ids jsonb not null default '[]'::jsonb,
                lifetime_earned integer not null default 0 check (lifetime_earned >= 0),
                lifetime_spent integer not null default 0 check (lifetime_spent >= 0),
                transaction_count integer not null default 0 check (transaction_count >= 0),
                last_transaction_kind text not null default '',
                last_transaction_summary text not null default '',
                last_synced_at timestamptz not null default now(),
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now()
            );

            create table if not exists public.${PLAYER_ECONOMY_TRANSACTIONS_TABLE_NAME} (
                id uuid primary key,
                user_id text not null,
                kind text not null,
                credits_delta integer not null,
                balance_after integer not null check (balance_after >= 0),
                summary text not null default '',
                metadata_json jsonb not null default '{}'::jsonb,
                created_at timestamptz not null default now()
            );

            create index if not exists player_economy_wallets_last_synced_idx
                on public.${PLAYER_ECONOMY_WALLETS_TABLE_NAME} (last_synced_at desc);

            create index if not exists player_economy_transactions_user_created_idx
                on public.${PLAYER_ECONOMY_TRANSACTIONS_TABLE_NAME} (user_id, created_at desc);
        `);
        return {
            ok: true,
        };
    } finally {
        await client.end();
    }
}

async function readWalletRecord(supabaseClient, userId) {
    const { data, error } = await supabaseClient
        .from(PLAYER_ECONOMY_WALLETS_TABLE_NAME)
        .select(PLAYER_ECONOMY_WALLET_SELECT_COLUMNS)
        .eq('user_id', userId)
        .maybeSingle();
    if (error) {
        throw error;
    }
    if (!data) {
        return createDefaultPlayerEconomyProfile({
            userId,
            exists: false,
        });
    }
    return {
        ...normalizeWalletRecord(data),
        exists: true,
    };
}

async function readRecentTransactions(supabaseClient, userId, recentLimit) {
    const { data, error } = await supabaseClient
        .from(PLAYER_ECONOMY_TRANSACTIONS_TABLE_NAME)
        .select(PLAYER_ECONOMY_TRANSACTION_SELECT_COLUMNS)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(recentLimit);
    if (error) {
        throw error;
    }
    return Array.isArray(data)
        ? data.map((entry) => normalizeTransactionRecord(entry)).filter(Boolean)
        : [];
}

function createDefaultPlayerEconomyProfile(overrides = {}) {
    return normalizePlayerEconomyProfile({
        userId: overrides?.userId || '',
        exists: Boolean(overrides?.exists),
        credits: 0,
        unlockedVehicleIds: [...DEFAULT_UNLOCKED_VEHICLE_IDS],
        lifetimeEarned: 0,
        lifetimeSpent: 0,
        transactionCount: 0,
        lastTransactionKind: '',
        lastTransactionSummary: '',
        lastSyncedAt: '',
        createdAt: '',
        updatedAt: '',
        recentTransactions: [],
    });
}

function normalizePlayerEconomyProfile(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const unlockedVehicleIds = normalizeUnlockedVehicleIds(source.unlockedVehicleIds);
    const credits = clampCredits(source.credits);
    const lifetimeEarned = clampCredits(source.lifetimeEarned);
    const lifetimeSpent = clampCredits(source.lifetimeSpent);
    return {
        userId: sanitizeSupabaseUserId(source.userId),
        exists: Boolean(source.exists),
        credits,
        unlockedVehicleIds,
        lifetimeEarned,
        lifetimeSpent,
        transactionCount: clampCredits(source.transactionCount),
        lastTransactionKind: sanitizeTransactionKind(source.lastTransactionKind),
        lastTransactionSummary: sanitizeTransactionSummary(source.lastTransactionSummary),
        lastSyncedAt: sanitizeIsoDate(source.lastSyncedAt),
        createdAt: sanitizeIsoDate(source.createdAt),
        updatedAt: sanitizeIsoDate(source.updatedAt),
        ownedVehicleCount: unlockedVehicleIds.length,
        recentTransactions: Array.isArray(source.recentTransactions)
            ? source.recentTransactions
                  .map((entry) => normalizeTransactionRecord(entry))
                  .filter(Boolean)
            : [],
    };
}

function normalizeWalletRecord(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        userId: sanitizeSupabaseUserId(source.userId || source.user_id),
        credits: clampCredits(source.credits),
        unlockedVehicleIds: normalizeUnlockedVehicleIds(
            source.unlockedVehicleIds || source.unlocked_vehicle_ids
        ),
        lifetimeEarned: clampCredits(source.lifetimeEarned || source.lifetime_earned),
        lifetimeSpent: clampCredits(source.lifetimeSpent || source.lifetime_spent),
        transactionCount: clampCredits(source.transactionCount || source.transaction_count),
        lastTransactionKind: sanitizeTransactionKind(
            source.lastTransactionKind || source.last_transaction_kind
        ),
        lastTransactionSummary: sanitizeTransactionSummary(
            source.lastTransactionSummary || source.last_transaction_summary
        ),
        lastSyncedAt: sanitizeIsoDate(source.lastSyncedAt || source.last_synced_at),
        createdAt: sanitizeIsoDate(source.createdAt || source.created_at),
        updatedAt: sanitizeIsoDate(source.updatedAt || source.updated_at),
    };
}

function normalizeTransactionRecord(value = null) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return {
        id: sanitizeUuid(value.id),
        userId: sanitizeSupabaseUserId(value.userId || value.user_id),
        kind: sanitizeTransactionKind(value.kind),
        creditsDelta: clampSignedCredits(value.creditsDelta || value.credits_delta),
        balanceAfter: clampCredits(value.balanceAfter || value.balance_after),
        summary: sanitizeTransactionSummary(value.summary),
        metadata: sanitizeTransactionMetadata(value.metadata || value.metadata_json),
        createdAt: sanitizeIsoDate(value.createdAt || value.created_at),
    };
}

function normalizePlayerEconomyStatePayload(value = null) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        credits: clampCredits(source.credits),
        unlockedVehicleIds: normalizeUnlockedVehicleIds(source.unlockedVehicleIds),
    };
}

function normalizePlayerEconomyTransaction(value = null, currentCredits = 0, nextCredits = 0) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const kind = sanitizeTransactionKind(value.kind);
    const fallbackDelta = clampSignedCredits(
        clampCredits(nextCredits) - clampCredits(currentCredits)
    );
    const creditsDelta = clampSignedCredits(
        Number.isFinite(Number(value.creditsDelta)) ? value.creditsDelta : fallbackDelta
    );
    const summary = sanitizeTransactionSummary(value.summary || value.label || value.description);
    if (!kind && creditsDelta === 0 && !summary) {
        return null;
    }
    return {
        kind: kind || (creditsDelta < 0 ? 'spend' : 'earn'),
        creditsDelta,
        summary:
            summary ||
            (creditsDelta < 0
                ? `Spent ${Math.abs(creditsDelta)} CR`
                : `Earned ${Math.abs(creditsDelta)} CR`),
        metadata: sanitizeTransactionMetadata(value.metadata),
    };
}

function sanitizeRecentTransactionLimit(value) {
    const numeric = Math.round(Number(value) || 0);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return PLAYER_ECONOMY_RECENT_TRANSACTION_LIMIT_DEFAULT;
    }
    return Math.max(1, Math.min(PLAYER_ECONOMY_RECENT_TRANSACTION_LIMIT_MAX, numeric));
}

function mergeUnlockedVehicleIds(...lists) {
    const merged = new Set(DEFAULT_UNLOCKED_VEHICLE_IDS);
    for (let index = 0; index < lists.length; index += 1) {
        const entries = normalizeUnlockedVehicleIds(lists[index]);
        for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
            merged.add(entries[entryIndex]);
        }
    }
    return [...merged];
}

function normalizeUnlockedVehicleIds(value) {
    const normalizedIds = new Set(DEFAULT_UNLOCKED_VEHICLE_IDS);
    const entries = Array.isArray(value) ? value : [];
    for (let index = 0; index < entries.length; index += 1) {
        const vehicleId = sanitizeVehicleId(entries[index]);
        if (vehicleId) {
            normalizedIds.add(vehicleId);
        }
    }
    return [...normalizedIds];
}

function sanitizeTransactionMetadata(value = null) {
    const source = value && typeof value === 'object' ? value : {};
    const metadata = {};

    if (typeof source.vehicleId === 'string') {
        const vehicleId = sanitizeVehicleId(source.vehicleId);
        if (vehicleId) {
            metadata.vehicleId = vehicleId;
        }
    }
    if (typeof source.vehicleName === 'string') {
        const vehicleName = sanitizeLabel(source.vehicleName, 72);
        if (vehicleName) {
            metadata.vehicleName = vehicleName;
        }
    }
    if (typeof source.gameMode === 'string') {
        const gameMode = sanitizeLabel(source.gameMode, 16);
        if (gameMode) {
            metadata.gameMode = gameMode;
        }
    }
    if (typeof source.finishReason === 'string') {
        const finishReason = sanitizeLabel(source.finishReason, 40);
        if (finishReason) {
            metadata.finishReason = finishReason;
        }
    }
    if (Array.isArray(source.breakdown)) {
        const breakdown = source.breakdown
            .map((entry) => sanitizeBreakdownEntry(entry))
            .filter(Boolean);
        if (breakdown.length > 0) {
            metadata.breakdown = breakdown;
        }
    }

    return metadata;
}

function sanitizeBreakdownEntry(value = null) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const label = sanitizeLabel(value.label, 48);
    const credits = clampCredits(value.credits);
    if (!label && credits <= 0) {
        return null;
    }
    const id = sanitizeLabel(value.id, 32);
    return {
        id,
        label: label || id || 'Reward',
        credits,
    };
}

function sanitizeSupabaseUserId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .trim()
        .replace(/[^\w-]/g, '')
        .slice(0, 128);
}

function sanitizeVehicleId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, PLAYER_VEHICLE_ID_MAX_LENGTH);
}

function sanitizeTransactionKind(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, PLAYER_ECONOMY_TRANSACTION_KIND_MAX_LENGTH);
}

function sanitizeTransactionSummary(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, PLAYER_ECONOMY_TRANSACTION_SUMMARY_MAX_LENGTH);
}

function sanitizeLabel(value, maxLength = 64) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function sanitizeIsoDate(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    return normalized && !Number.isNaN(Date.parse(normalized)) ? normalized : '';
}

function sanitizeUuid(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
        normalized
    )
        ? normalized
        : '';
}

function clampCredits(value) {
    return Math.max(0, Math.min(PLAYER_ECONOMY_MAX_CREDITS, Math.round(Number(value) || 0)));
}

function clampSignedCredits(value) {
    const numeric = Math.round(Number(value) || 0);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(-PLAYER_ECONOMY_MAX_CREDITS, Math.min(PLAYER_ECONOMY_MAX_CREDITS, numeric));
}

function resolvePostgresClientOptions(connectionString) {
    const sslEnabled = /sslmode=require/iu.test(connectionString);
    if (!sslEnabled) {
        return {
            connectionString,
        };
    }
    return {
        connectionString,
        ssl: {
            rejectUnauthorized: false,
        },
    };
}

module.exports = {
    PLAYER_ECONOMY_WALLETS_TABLE_NAME,
    PLAYER_ECONOMY_TRANSACTIONS_TABLE_NAME,
    createPlayerEconomyStore,
    ensurePlayerEconomySchema,
};
