const { Client: PostgresClient } = require('pg');
const { createSupabaseServiceClient } = require('./supabase-config');

const AUDIO_PREFS_VERSION = 2;
const AUDIO_PREFS_TABLE_NAME = 'audio_prefs_defaults';
const AUDIO_PREFS_ROW_KEY = 'runtime';
const AUDIO_PREFS_SELECT_COLUMNS = 'prefs,updated_at';
const DEFAULT_AUDIO_PREFS = Object.freeze({
    masterVolume: 1,
    vehiclesVolume: 0.18,
    botVehiclesVolume: 0.44,
    effectsVolume: 0.07,
    ambienceVolume: 0.22,
    menuMusicVolume: 0.44,
    gameMusicVolume: 0.02,
    uiVolume: 0.27,
    muted: false,
});
const AUDIO_PREF_KEYS = Object.freeze([
    'masterVolume',
    'vehiclesVolume',
    'botVehiclesVolume',
    'effectsVolume',
    'ambienceVolume',
    'menuMusicVolume',
    'gameMusicVolume',
    'uiVolume',
]);

function createAudioPrefsStore(config = {}) {
    const hasSupabaseClientOverride = Object.prototype.hasOwnProperty.call(
        config,
        'supabaseClient'
    );
    const supabaseClient = hasSupabaseClientOverride
        ? config.supabaseClient
        : createSupabaseServiceClient(config);
    if (!supabaseClient) {
        return createNoopAudioPrefsStore();
    }

    return {
        isConfigured() {
            return true;
        },
        async readConfig() {
            return readAudioPrefsConfigFromSupabase(supabaseClient);
        },
        async writePrefs(prefs = {}) {
            return writeAudioPrefsConfigToSupabase(supabaseClient, prefs);
        },
    };
}

function createNoopAudioPrefsStore() {
    return {
        isConfigured() {
            return false;
        },
        async readConfig() {
            return createDefaultAudioPrefsConfig({
                canPersist: false,
            });
        },
        async writePrefs() {
            const error = new Error('Audio prefs store is not configured.');
            error.code = 'AUDIO_PREFS_STORE_NOT_CONFIGURED';
            throw error;
        },
    };
}

function createDefaultAudioPrefs() {
    return {
        ...DEFAULT_AUDIO_PREFS,
    };
}

function sanitizeAudioPrefs(input = {}, fallback = null) {
    const defaults = createDefaultAudioPrefs();
    const base = fallback && typeof fallback === 'object' ? fallback : defaults;
    const legacyFallbackMusicVolume = clampNumber(
        base?.musicVolume,
        0,
        1,
        defaults.gameMusicVolume
    );
    const resolvedBase = {
        ...defaults,
        ...base,
        menuMusicVolume: clampNumber(base?.menuMusicVolume, 0, 1, legacyFallbackMusicVolume),
        gameMusicVolume: clampNumber(base?.gameMusicVolume, 0, 1, legacyFallbackMusicVolume),
    };
    const source = input && typeof input === 'object' ? input : {};
    const legacySourceMusicVolume = Object.prototype.hasOwnProperty.call(source, 'musicVolume')
        ? source.musicVolume
        : undefined;
    const resolved = {
        muted: Boolean('muted' in source ? source.muted : resolvedBase.muted),
    };

    for (let index = 0; index < AUDIO_PREF_KEYS.length; index += 1) {
        const key = AUDIO_PREF_KEYS[index];
        const fallbackValue = Number.isFinite(resolvedBase[key])
            ? resolvedBase[key]
            : defaults[key];
        const rawValue =
            key in source
                ? source[key]
                : (key === 'menuMusicVolume' || key === 'gameMusicVolume') &&
                    legacySourceMusicVolume !== undefined
                  ? legacySourceMusicVolume
                  : fallbackValue;
        resolved[key] = clampNumber(rawValue, 0, 1, fallbackValue);
    }

    return resolved;
}

async function readAudioPrefsConfigFromSupabase(supabaseClient) {
    const { data, error } = await supabaseClient
        .from(AUDIO_PREFS_TABLE_NAME)
        .select(AUDIO_PREFS_SELECT_COLUMNS)
        .eq('settings_key', AUDIO_PREFS_ROW_KEY)
        .maybeSingle();

    if (error) {
        if (isAudioPrefsSchemaMissingError(error)) {
            return createDefaultAudioPrefsConfig({
                canPersist: false,
            });
        }
        throw error;
    }
    if (!data || typeof data !== 'object') {
        return createDefaultAudioPrefsConfig({
            canPersist: true,
        });
    }

    return normalizeAudioPrefsConfig({
        canPersist: true,
        updatedAt: data.updated_at,
        prefs: data.prefs,
    });
}

async function writeAudioPrefsConfigToSupabase(supabaseClient, prefs = {}) {
    const normalizedConfig = normalizeAudioPrefsConfig({
        updatedAt: new Date().toISOString(),
        prefs,
    });
    const { data, error } = await supabaseClient
        .from(AUDIO_PREFS_TABLE_NAME)
        .upsert(
            {
                settings_key: AUDIO_PREFS_ROW_KEY,
                prefs: normalizedConfig.prefs,
                updated_at: normalizedConfig.updatedAt,
            },
            {
                onConflict: 'settings_key',
            }
        )
        .select(AUDIO_PREFS_SELECT_COLUMNS)
        .single();

    if (error) {
        throw error;
    }
    if (!data || typeof data !== 'object') {
        return normalizedConfig;
    }

    return normalizeAudioPrefsConfig({
        canPersist: true,
        updatedAt: data.updated_at,
        prefs: data.prefs,
    });
}

async function ensureAudioPrefsSchema({ connectionString } = {}) {
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
            create table if not exists public.${AUDIO_PREFS_TABLE_NAME} (
                settings_key text primary key,
                prefs jsonb not null default '{}'::jsonb,
                updated_at timestamptz not null default now(),
                constraint audio_prefs_defaults_settings_key_check check (settings_key <> '')
            );

            alter table public.${AUDIO_PREFS_TABLE_NAME}
                add column if not exists prefs jsonb not null default '{}'::jsonb;

            alter table public.${AUDIO_PREFS_TABLE_NAME}
                add column if not exists updated_at timestamptz not null default now();

            alter table public.${AUDIO_PREFS_TABLE_NAME} enable row level security;
        `);

        return {
            ok: true,
        };
    } finally {
        await client.end();
    }
}

function createDefaultAudioPrefsConfig(options = {}) {
    return {
        canPersist: Boolean(options?.canPersist),
        version: AUDIO_PREFS_VERSION,
        updatedAt: '',
        prefs: createDefaultAudioPrefs(),
    };
}

function normalizeAudioPrefsConfig(config = {}) {
    const source = config && typeof config === 'object' ? config : {};
    return {
        canPersist: source.canPersist !== false,
        version: AUDIO_PREFS_VERSION,
        updatedAt: sanitizeTimestamp(source.updatedAt),
        prefs: sanitizeAudioPrefs(source.prefs, DEFAULT_AUDIO_PREFS),
    };
}

function isAudioPrefsSchemaMissingError(error) {
    const code = typeof error?.code === 'string' ? error.code.trim() : '';
    const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
    const details = typeof error?.details === 'string' ? error.details.toLowerCase() : '';
    if (code === '42P01' || code === 'PGRST205') {
        return true;
    }
    return (
        (message.includes(AUDIO_PREFS_TABLE_NAME) || details.includes(AUDIO_PREFS_TABLE_NAME)) &&
        (message.includes('schema cache') ||
            message.includes('table') ||
            message.includes('relation') ||
            details.includes('table') ||
            details.includes('relation'))
    );
}

function sanitizeTimestamp(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }
    const timestamp = Date.parse(trimmed);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function clampNumber(value, min, max, fallback = 0) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return fallback;
    }
    if (numericValue < min) {
        return min;
    }
    if (numericValue > max) {
        return max;
    }
    return numericValue;
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
    AUDIO_PREF_KEYS,
    AUDIO_PREFS_ROW_KEY,
    AUDIO_PREFS_TABLE_NAME,
    DEFAULT_AUDIO_PREFS,
    createAudioPrefsStore,
    createDefaultAudioPrefs,
    ensureAudioPrefsSchema,
    isAudioPrefsSchemaMissingError,
    normalizeAudioPrefsConfig,
    sanitizeAudioPrefs,
};
