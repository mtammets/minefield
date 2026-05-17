const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const DEFAULT_SUPABASE_PROFILE_IMAGES_BUCKET = 'profile-images';
const DEFAULT_SUPABASE_CAR_WRAPS_BUCKET = 'car-wraps';
const DEFAULT_SUPABASE_BILLBOARD_MEDIA_BUCKET = 'billboard-media';

function sanitizeSupabaseProjectRef(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase();
    return /^[a-z0-9]{6,32}$/u.test(normalized) ? normalized : '';
}

function sanitizeSupabaseUrl(value) {
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

function sanitizeSupabaseKey(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    return normalized.length >= 32 ? normalized.slice(0, 4096) : '';
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

function sanitizePostgresConnectionString(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    if (!normalized) {
        return '';
    }

    try {
        const parsed = new URL(normalized);
        if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
            return '';
        }
        return normalized;
    } catch {
        return '';
    }
}

function resolveSupabaseRuntimeConfig(env = process.env) {
    const projectRef = sanitizeSupabaseProjectRef(env?.SUPABASE_PROJECT_REF || '');
    const url = sanitizeSupabaseUrl(env?.SUPABASE_URL || '');
    const anonKey = sanitizeSupabaseKey(env?.SUPABASE_ANON_KEY || '');
    const serviceRoleKey = sanitizeSupabaseKey(env?.SUPABASE_SERVICE_ROLE_KEY || '');
    const profileImagesBucket = sanitizeSupabaseStorageBucketName(
        env?.SUPABASE_PROFILE_IMAGES_BUCKET || DEFAULT_SUPABASE_PROFILE_IMAGES_BUCKET
    );
    const carWrapsBucket = sanitizeSupabaseStorageBucketName(
        env?.SUPABASE_CAR_WRAPS_BUCKET || DEFAULT_SUPABASE_CAR_WRAPS_BUCKET
    );
    const billboardMediaBucket = sanitizeSupabaseStorageBucketName(
        env?.SUPABASE_BILLBOARD_MEDIA_BUCKET || DEFAULT_SUPABASE_BILLBOARD_MEDIA_BUCKET
    );
    const dbUrl = sanitizePostgresConnectionString(env?.SUPABASE_DB_URL || '');
    const dbPoolerUrl = sanitizePostgresConnectionString(env?.SUPABASE_DB_POOLER_URL || '');
    const databaseConnectionString = dbPoolerUrl || dbUrl;

    return {
        projectRef,
        url,
        anonKey,
        serviceRoleKey,
        profileImagesBucket,
        carWrapsBucket,
        billboardMediaBucket,
        dbUrl,
        dbPoolerUrl,
        databaseConnectionString,
        publicEnabled: Boolean(url && anonKey),
        serviceEnabled: Boolean(url && serviceRoleKey),
        databaseEnabled: Boolean(databaseConnectionString),
    };
}

function buildSupabasePublicConfig(config = {}, options = {}) {
    const runtimeConfig =
        config && typeof config === 'object' ? config : resolveSupabaseRuntimeConfig();
    const leaderboardEnabled = Boolean(options?.leaderboardEnabled);
    const profileImagesBucket = sanitizeSupabaseStorageBucketName(
        runtimeConfig.profileImagesBucket || ''
    );
    const carWrapsBucket = sanitizeSupabaseStorageBucketName(runtimeConfig.carWrapsBucket || '');
    const billboardMediaBucket = sanitizeSupabaseStorageBucketName(
        runtimeConfig.billboardMediaBucket || ''
    );

    return {
        enabled: Boolean(runtimeConfig.publicEnabled),
        url: runtimeConfig.publicEnabled ? runtimeConfig.url : '',
        anonKey: runtimeConfig.publicEnabled ? runtimeConfig.anonKey : '',
        projectRef: runtimeConfig.publicEnabled ? runtimeConfig.projectRef : '',
        profileImagesBucket: runtimeConfig.publicEnabled ? profileImagesBucket : '',
        profileImagesEnabled: Boolean(runtimeConfig.publicEnabled && profileImagesBucket),
        carWrapsBucket: runtimeConfig.publicEnabled ? carWrapsBucket : '',
        carWrapsEnabled: Boolean(runtimeConfig.publicEnabled && carWrapsBucket),
        billboardMediaBucket: runtimeConfig.publicEnabled ? billboardMediaBucket : '',
        billboardMediaEnabled: Boolean(runtimeConfig.publicEnabled && billboardMediaBucket),
        leaderboardEnabled,
    };
}

function listSupabasePublicAuthConfigGaps(config = {}) {
    const runtimeConfig = config && typeof config === 'object' ? config : {};
    const gaps = [];
    if (!sanitizeSupabaseUrl(runtimeConfig.url || '')) {
        gaps.push('SUPABASE_URL');
    }
    if (!sanitizeSupabaseKey(runtimeConfig.anonKey || '')) {
        gaps.push('SUPABASE_ANON_KEY');
    }
    return gaps;
}

function applySupabaseStorageAvailability(publicConfig = {}, availability = {}) {
    const source = publicConfig && typeof publicConfig === 'object' ? publicConfig : {};
    const enabled = Boolean(source.enabled);
    const url = enabled ? sanitizeSupabaseUrl(source.url || '') : '';
    const anonKey = enabled ? sanitizeSupabaseKey(source.anonKey || '') : '';
    const projectRef = enabled ? sanitizeSupabaseProjectRef(source.projectRef || '') : '';
    const profileImagesBucket = enabled
        ? sanitizeSupabaseStorageBucketName(source.profileImagesBucket || '')
        : '';
    const carWrapsBucket = enabled
        ? sanitizeSupabaseStorageBucketName(source.carWrapsBucket || '')
        : '';
    const billboardMediaBucket = enabled
        ? sanitizeSupabaseStorageBucketName(source.billboardMediaBucket || '')
        : '';
    const profileImagesEnabled = Boolean(source.profileImagesEnabled && profileImagesBucket);
    const carWrapsEnabled = Boolean(source.carWrapsEnabled && carWrapsBucket);
    const billboardMediaEnabled = Boolean(source.billboardMediaEnabled && billboardMediaBucket);
    const adjustedAvailability =
        availability && typeof availability === 'object' ? availability : {};

    return {
        enabled: Boolean(enabled && url && anonKey),
        url,
        anonKey,
        projectRef,
        profileImagesBucket:
            adjustedAvailability.profileImagesBucketAvailable === false ? '' : profileImagesBucket,
        profileImagesEnabled:
            adjustedAvailability.profileImagesBucketAvailable === false
                ? false
                : profileImagesEnabled,
        carWrapsBucket:
            adjustedAvailability.carWrapsBucketAvailable === false ? '' : carWrapsBucket,
        carWrapsEnabled:
            adjustedAvailability.carWrapsBucketAvailable === false ? false : carWrapsEnabled,
        billboardMediaBucket:
            adjustedAvailability.billboardMediaBucketAvailable === false
                ? ''
                : billboardMediaBucket,
        billboardMediaEnabled:
            adjustedAvailability.billboardMediaBucketAvailable === false
                ? false
                : billboardMediaEnabled,
        leaderboardEnabled: Boolean(source.leaderboardEnabled),
    };
}

function resolveSupabaseConnectOrigin(value) {
    return sanitizeSupabaseUrl(value);
}

function createSupabaseServiceClient(config = {}) {
    const runtimeConfig =
        config && typeof config === 'object' ? config : resolveSupabaseRuntimeConfig();
    if (!runtimeConfig.serviceEnabled || !runtimeConfig.url || !runtimeConfig.serviceRoleKey) {
        return null;
    }

    return createClient(runtimeConfig.url, runtimeConfig.serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
        global: {
            headers: {
                'X-Client-Info': 'minefield-drift/server',
            },
        },
        realtime: {
            transport: WebSocket,
        },
    });
}

module.exports = {
    applySupabaseStorageAvailability,
    buildSupabasePublicConfig,
    createSupabaseServiceClient,
    listSupabasePublicAuthConfigGaps,
    resolveSupabaseConnectOrigin,
    resolveSupabaseRuntimeConfig,
    sanitizePostgresConnectionString,
    sanitizeSupabaseKey,
    sanitizeSupabaseProjectRef,
    sanitizeSupabaseStorageBucketName,
    sanitizeSupabaseUrl,
};
