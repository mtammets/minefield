const test = require('node:test');
const assert = require('node:assert/strict');

const {
    AUDIO_PREFS_ROW_KEY,
    AUDIO_PREFS_TABLE_NAME,
    createAudioPrefsStore,
    createDefaultAudioPrefs,
    sanitizeAudioPrefs,
} = require('../server/audio-prefs-store');

test('sanitizeAudioPrefs clamps values and falls back safely', () => {
    const sanitized = sanitizeAudioPrefs({
        masterVolume: 2,
        vehiclesVolume: -1,
        botVehiclesVolume: '0.63',
        effectsVolume: '0.45',
        ambienceVolume: null,
        musicVolume: 0.2,
        uiVolume: undefined,
        muted: 1,
    });

    assert.deepEqual(sanitized, {
        masterVolume: 1,
        vehiclesVolume: 0,
        botVehiclesVolume: 0.63,
        effectsVolume: 0.45,
        ambienceVolume: 0,
        menuMusicVolume: 0.2,
        gameMusicVolume: 0.2,
        uiVolume: 0.27,
        muted: true,
    });
});

test('audio prefs store returns defaults when Supabase persistence is not configured', async () => {
    const store = createAudioPrefsStore({
        supabaseClient: null,
    });

    const config = await store.readConfig();

    assert.equal(store.isConfigured(), false);
    assert.equal(config.canPersist, false);
    assert.deepEqual(config.prefs, createDefaultAudioPrefs());
    assert.equal(config.updatedAt, '');
});

test('audio prefs store falls back to defaults when the Supabase table is missing', async () => {
    const supabaseClient = createSupabaseClientStub({
        selectError: {
            code: 'PGRST205',
            message: `Could not find the table 'public.${AUDIO_PREFS_TABLE_NAME}' in the schema cache`,
        },
    });
    const store = createAudioPrefsStore({
        supabaseClient,
    });

    const config = await store.readConfig();

    assert.equal(config.canPersist, false);
    assert.deepEqual(config.prefs, createDefaultAudioPrefs());
    assert.equal(config.updatedAt, '');
});

test('audio prefs store migrates legacy musicVolume defaults on read', async () => {
    const supabaseClient = createSupabaseClientStub({
        selectData: {
            updated_at: '2026-05-14T21:03:07.188Z',
            prefs: {
                masterVolume: 0.61,
                vehiclesVolume: 0.92,
                botVehiclesVolume: 0.44,
                effectsVolume: 0.88,
                ambienceVolume: 0.73,
                musicVolume: 0.14,
                uiVolume: 0.81,
                muted: false,
            },
        },
    });
    const store = createAudioPrefsStore({
        supabaseClient,
    });

    const config = await store.readConfig();

    assert.equal(config.canPersist, true);
    assert.equal(config.prefs.menuMusicVolume, 0.14);
    assert.equal(config.prefs.gameMusicVolume, 0.14);
    assert.equal(supabaseClient.calls.readTableName, AUDIO_PREFS_TABLE_NAME);
    assert.deepEqual(supabaseClient.calls.readFilter, {
        column: 'settings_key',
        value: AUDIO_PREFS_ROW_KEY,
    });
});

test('audio prefs store persists sanitized defaults in Supabase', async () => {
    const supabaseClient = createSupabaseClientStub({
        upsertData: {
            updated_at: '2026-05-16T08:41:00.000Z',
            prefs: {
                masterVolume: 0.61,
                vehiclesVolume: 0.92,
                botVehiclesVolume: 0.44,
                effectsVolume: 0.88,
                ambienceVolume: 0.73,
                menuMusicVolume: 0.14,
                gameMusicVolume: 0.27,
                uiVolume: 0.81,
                muted: false,
            },
        },
    });
    const store = createAudioPrefsStore({
        supabaseClient,
    });

    const savedConfig = await store.writePrefs({
        masterVolume: 0.61,
        vehiclesVolume: 0.92,
        botVehiclesVolume: 0.44,
        effectsVolume: 0.88,
        ambienceVolume: 0.73,
        menuMusicVolume: 0.14,
        gameMusicVolume: 0.27,
        uiVolume: 0.81,
        muted: false,
    });

    assert.equal(savedConfig.prefs.masterVolume, 0.61);
    assert.equal(savedConfig.canPersist, true);
    assert.equal(savedConfig.prefs.botVehiclesVolume, 0.44);
    assert.equal(savedConfig.prefs.menuMusicVolume, 0.14);
    assert.equal(savedConfig.prefs.gameMusicVolume, 0.27);
    assert.equal(savedConfig.prefs.muted, false);
    assert.equal(supabaseClient.calls.writeTableName, AUDIO_PREFS_TABLE_NAME);
    assert.equal(
        supabaseClient.calls.upsertPayload.settings_key,
        AUDIO_PREFS_ROW_KEY
    );
    assert.equal(supabaseClient.calls.upsertPayload.prefs.menuMusicVolume, 0.14);
    assert.equal(supabaseClient.calls.upsertPayload.prefs.gameMusicVolume, 0.27);
    assert.equal(supabaseClient.calls.upsertPayload.prefs.muted, false);
    assert.deepEqual(supabaseClient.calls.upsertOptions, {
        onConflict: 'settings_key',
    });
});

function createSupabaseClientStub({
    selectData = null,
    selectError = null,
    upsertData = null,
    upsertError = null,
} = {}) {
    const calls = {
        readColumns: '',
        readFilter: null,
        readTableName: '',
        upsertOptions: null,
        upsertPayload: null,
        writeColumns: '',
        writeTableName: '',
    };

    return {
        calls,
        from(tableName) {
            return {
                select(columns) {
                    calls.readTableName = tableName;
                    calls.readColumns = columns;
                    return {
                        eq(column, value) {
                            calls.readFilter = {
                                column,
                                value,
                            };
                            return {
                                async maybeSingle() {
                                    return {
                                        data: selectData,
                                        error: selectError,
                                    };
                                },
                            };
                        },
                    };
                },
                upsert(payload, options) {
                    calls.writeTableName = tableName;
                    calls.upsertPayload = payload;
                    calls.upsertOptions = options;
                    return {
                        select(columns) {
                            calls.writeColumns = columns;
                            return {
                                async single() {
                                    return {
                                        data: upsertData,
                                        error: upsertError,
                                    };
                                },
                            };
                        },
                    };
                },
            };
        },
    };
}
