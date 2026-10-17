import { fetchPublicConfig } from './public-config.js';

const SUPABASE_BROWSER_MODULE_URL =
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.105.4/+esm';

let supabaseConfigPromise = null;
let supabaseModulePromise = null;
let supabaseClientPromise = null;

export async function getSupabaseBrowserConfig(options = {}) {
    const force = Boolean(options?.force);
    if (!supabaseConfigPromise || force) {
        supabaseConfigPromise = Promise.resolve(fetchPublicConfig({ force })).then((publicConfig) =>
            normalizeSupabaseBrowserConfig(publicConfig?.supabase, {
                publicConfigLoaded: Boolean(publicConfig && typeof publicConfig === 'object'),
                pageProtocol:
                    typeof window === 'object' && window?.location
                        ? String(window.location.protocol || '')
                        : '',
            })
        );
    }
    const config = await supabaseConfigPromise;
    if (!config?.enabled && config?.unavailableReason === 'config-unreachable') {
        supabaseConfigPromise = null;
    }
    return config;
}

export async function getSupabaseBrowserClient() {
    const config = await getSupabaseBrowserConfig();
    if (!config.enabled) {
        return null;
    }
    if (!supabaseClientPromise) {
        supabaseClientPromise = loadSupabaseBrowserModule().then(({ createClient }) =>
            createClient(config.url, config.anonKey, {
                auth: {
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                    persistSession: true,
                    storageKey: resolveSupabaseBrowserStorageKey(config.projectRef),
                },
                global: {
                    headers: {
                        'X-Client-Info': 'minefield-drift/browser',
                    },
                },
            })
        );
    }

    try {
        return await supabaseClientPromise;
    } catch (error) {
        supabaseClientPromise = null;
        throw error;
    }
}

async function loadSupabaseBrowserModule() {
    if (!supabaseModulePromise) {
        supabaseModulePromise = import(SUPABASE_BROWSER_MODULE_URL);
    }

    try {
        return await supabaseModulePromise;
    } catch (error) {
        supabaseModulePromise = null;
        throw error;
    }
}

function normalizeSupabaseBrowserConfig(config, diagnostics = {}) {
    const source = config && typeof config === 'object' ? config : {};
    const url = sanitizeSupabasePublicUrl(source.url);
    const anonKey = sanitizeSupabasePublicKey(source.anonKey);
    const projectRef = sanitizeSupabaseProjectRef(source.projectRef);
    const profileImagesBucket = sanitizeSupabaseStorageBucketName(source.profileImagesBucket);
    const carWrapsBucket = sanitizeSupabaseStorageBucketName(source.carWrapsBucket);
    const enabled = Boolean(source.enabled && url && anonKey);
    const unavailableReason = resolveSupabaseBrowserUnavailableReason({
        enabled,
        publicConfigLoaded: Boolean(diagnostics?.publicConfigLoaded),
        pageProtocol: diagnostics?.pageProtocol,
    });

    return {
        enabled,
        url,
        anonKey,
        projectRef,
        profileImagesBucket,
        profileImagesEnabled: Boolean(
            enabled && source.profileImagesEnabled && profileImagesBucket
        ),
        carWrapsBucket,
        carWrapsEnabled: Boolean(enabled && source.carWrapsEnabled && carWrapsBucket),
        leaderboardEnabled: Boolean(source.leaderboardEnabled),
        unavailableReason,
        unavailableStatusText: resolveSupabaseBrowserUnavailableStatusText(unavailableReason),
    };
}

function resolveSupabaseBrowserUnavailableReason({
    enabled = false,
    publicConfigLoaded = false,
    pageProtocol = '',
} = {}) {
    if (enabled) {
        return '';
    }
    if (!publicConfigLoaded && String(pageProtocol || '').toLowerCase() === 'file:') {
        return 'file-preview';
    }
    if (!publicConfigLoaded) {
        return 'config-unreachable';
    }
    return 'server-disabled';
}

function resolveSupabaseBrowserUnavailableStatusText(reason) {
    switch (reason) {
        case 'file-preview':
            return 'Player account needs the app server. Open the game through the local server.';
        case 'config-unreachable':
            return 'Player account is temporarily unavailable because the app server did not respond.';
        case 'server-disabled':
            return 'Player account is unavailable on this server.';
        default:
            return 'Player account is unavailable right now.';
    }
}

function sanitizeSupabasePublicUrl(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    if (!normalized) {
        return '';
    }
    try {
        const parsed = new URL(normalized);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return '';
        }
        return parsed.origin;
    } catch {
        return '';
    }
}

function sanitizeSupabasePublicKey(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    return normalized.length >= 32 ? normalized.slice(0, 4096) : '';
}

function sanitizeSupabaseProjectRef(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase();
    return /^[a-z0-9]{6,32}$/u.test(normalized) ? normalized : '';
}

function sanitizeSupabaseStorageBucketName(value) {
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

function resolveSupabaseBrowserStorageKey(projectRef) {
    const ref = sanitizeSupabaseProjectRef(projectRef);
    return ref ? `minefield-drift-auth-${ref}` : 'minefield-drift-auth';
}
