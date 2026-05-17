const test = require('node:test');
const assert = require('node:assert/strict');

const {
    applySupabaseStorageAvailability,
    buildSupabasePublicConfig,
    listSupabasePublicAuthConfigGaps,
    resolveSupabaseRuntimeConfig,
    sanitizePostgresConnectionString,
    sanitizeSupabaseProjectRef,
    sanitizeSupabaseStorageBucketName,
    sanitizeSupabaseUrl,
} = require('../server/supabase-config');

test('sanitizeSupabaseUrl keeps only http origins', () => {
    assert.equal(
        sanitizeSupabaseUrl('https://example-project.supabase.co/rest/v1'),
        'https://example-project.supabase.co'
    );
    assert.equal(sanitizeSupabaseUrl('javascript:alert(1)'), '');
    assert.equal(sanitizeSupabaseUrl(''), '');
});

test('sanitizeSupabaseProjectRef normalizes simple refs', () => {
    assert.equal(sanitizeSupabaseProjectRef('UFFLDLRJJVXZBJFTGYXG'), 'uffldlrjjvxzbjftgyxg');
    assert.equal(sanitizeSupabaseProjectRef('bad ref!'), '');
});

test('sanitizeSupabaseStorageBucketName keeps browser-safe bucket ids only', () => {
    assert.equal(sanitizeSupabaseStorageBucketName('Profile-Images'), 'profile-images');
    assert.equal(sanitizeSupabaseStorageBucketName('bad bucket!'), '');
});

test('sanitizePostgresConnectionString accepts postgres URLs only', () => {
    assert.equal(
        sanitizePostgresConnectionString(
            'postgresql://postgres:pass@example.supabase.co:5432/postgres'
        ),
        'postgresql://postgres:pass@example.supabase.co:5432/postgres'
    );
    assert.equal(sanitizePostgresConnectionString('https://example.com'), '');
});

test('resolveSupabaseRuntimeConfig reports public and service readiness', () => {
    const config = resolveSupabaseRuntimeConfig({
        SUPABASE_PROJECT_REF: 'uffldlrjjvxzbjftgyxg',
        SUPABASE_URL: 'https://uffldlrjjvxzbjftgyxg.supabase.co',
        SUPABASE_ANON_KEY:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.public.public.public.public.public',
        SUPABASE_SERVICE_ROLE_KEY:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service.service.service.service',
        SUPABASE_DB_URL:
            'postgresql://postgres:pass@db.uffldlrjjvxzbjftgyxg.supabase.co:5432/postgres',
    });

    assert.equal(config.publicEnabled, true);
    assert.equal(config.serviceEnabled, true);
    assert.equal(config.databaseEnabled, true);
    assert.equal(config.projectRef, 'uffldlrjjvxzbjftgyxg');
    assert.equal(config.profileImagesBucket, 'profile-images');
    assert.equal(config.carWrapsBucket, 'car-wraps');
    assert.equal(config.billboardMediaBucket, 'billboard-media');
});

test('resolveSupabaseRuntimeConfig prefers the pooler connection for live database reads', () => {
    const config = resolveSupabaseRuntimeConfig({
        SUPABASE_DB_URL:
            'postgresql://postgres:pass@db.uffldlrjjvxzbjftgyxg.supabase.co:5432/postgres',
        SUPABASE_DB_POOLER_URL:
            'postgresql://postgres:pass@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
    });

    assert.equal(
        config.databaseConnectionString,
        'postgresql://postgres:pass@aws-0-eu-west-1.pooler.supabase.com:6543/postgres'
    );
});

test('buildSupabasePublicConfig only exposes browser-safe fields', () => {
    const publicConfig = buildSupabasePublicConfig(
        {
            projectRef: 'uffldlrjjvxzbjftgyxg',
            url: 'https://uffldlrjjvxzbjftgyxg.supabase.co',
            anonKey: 'public-key-value-public-key-value-public-key-value',
            publicEnabled: true,
        },
        {
            leaderboardEnabled: true,
        }
    );

    assert.deepEqual(publicConfig, {
        enabled: true,
        url: 'https://uffldlrjjvxzbjftgyxg.supabase.co',
        anonKey: 'public-key-value-public-key-value-public-key-value',
        projectRef: 'uffldlrjjvxzbjftgyxg',
        profileImagesBucket: '',
        profileImagesEnabled: false,
        carWrapsBucket: '',
        carWrapsEnabled: false,
        billboardMediaBucket: '',
        billboardMediaEnabled: false,
        leaderboardEnabled: true,
    });
});

test('buildSupabasePublicConfig exposes profile image storage settings', () => {
    const publicConfig = buildSupabasePublicConfig(
        {
            projectRef: 'uffldlrjjvxzbjftgyxg',
            url: 'https://uffldlrjjvxzbjftgyxg.supabase.co',
            anonKey: 'public-key-value-public-key-value-public-key-value',
            publicEnabled: true,
            profileImagesBucket: 'profile-images',
        },
        {
            leaderboardEnabled: false,
        }
    );

    assert.deepEqual(publicConfig, {
        enabled: true,
        url: 'https://uffldlrjjvxzbjftgyxg.supabase.co',
        anonKey: 'public-key-value-public-key-value-public-key-value',
        projectRef: 'uffldlrjjvxzbjftgyxg',
        profileImagesBucket: 'profile-images',
        profileImagesEnabled: true,
        carWrapsBucket: '',
        carWrapsEnabled: false,
        billboardMediaBucket: '',
        billboardMediaEnabled: false,
        leaderboardEnabled: false,
    });
});

test('buildSupabasePublicConfig exposes car wrap storage settings', () => {
    const publicConfig = buildSupabasePublicConfig(
        {
            projectRef: 'uffldlrjjvxzbjftgyxg',
            url: 'https://uffldlrjjvxzbjftgyxg.supabase.co',
            anonKey: 'public-key-value-public-key-value-public-key-value',
            publicEnabled: true,
            carWrapsBucket: 'car-wraps',
        },
        {
            leaderboardEnabled: false,
        }
    );

    assert.deepEqual(publicConfig, {
        enabled: true,
        url: 'https://uffldlrjjvxzbjftgyxg.supabase.co',
        anonKey: 'public-key-value-public-key-value-public-key-value',
        projectRef: 'uffldlrjjvxzbjftgyxg',
        profileImagesBucket: '',
        profileImagesEnabled: false,
        carWrapsBucket: 'car-wraps',
        carWrapsEnabled: true,
        billboardMediaBucket: '',
        billboardMediaEnabled: false,
        leaderboardEnabled: false,
    });
});

test('listSupabasePublicAuthConfigGaps reports missing browser auth env vars', () => {
    assert.deepEqual(
        listSupabasePublicAuthConfigGaps({
            url: '',
            anonKey: '',
        }),
        ['SUPABASE_URL', 'SUPABASE_ANON_KEY']
    );
    assert.deepEqual(
        listSupabasePublicAuthConfigGaps({
            url: 'https://uffldlrjjvxzbjftgyxg.supabase.co',
            anonKey: 'public-key-value-public-key-value-public-key-value',
        }),
        []
    );
});

test('applySupabaseStorageAvailability disables missing buckets without exposing them', () => {
    const publicConfig = applySupabaseStorageAvailability(
        {
            enabled: true,
            url: 'https://uffldlrjjvxzbjftgyxg.supabase.co',
            anonKey: 'public-key-value-public-key-value-public-key-value',
            projectRef: 'uffldlrjjvxzbjftgyxg',
            profileImagesBucket: 'profile-images',
            profileImagesEnabled: true,
            carWrapsBucket: 'car-wraps',
            carWrapsEnabled: true,
            billboardMediaBucket: '',
            billboardMediaEnabled: false,
            leaderboardEnabled: true,
        },
        {
            profileImagesBucketAvailable: true,
            carWrapsBucketAvailable: false,
        }
    );

    assert.deepEqual(publicConfig, {
        enabled: true,
        url: 'https://uffldlrjjvxzbjftgyxg.supabase.co',
        anonKey: 'public-key-value-public-key-value-public-key-value',
        projectRef: 'uffldlrjjvxzbjftgyxg',
        profileImagesBucket: 'profile-images',
        profileImagesEnabled: true,
        carWrapsBucket: '',
        carWrapsEnabled: false,
        billboardMediaBucket: '',
        billboardMediaEnabled: false,
        leaderboardEnabled: true,
    });
});
