const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const {
    createAudioPrefsStore,
    createDefaultAudioPrefs,
    sanitizeAudioPrefs,
} = require('../server/audio-prefs-store');

test('sanitizeAudioPrefs clamps values and falls back safely', () => {
    const sanitized = sanitizeAudioPrefs({
        masterVolume: 2,
        vehiclesVolume: -1,
        effectsVolume: '0.45',
        ambienceVolume: null,
        musicVolume: 0.2,
        uiVolume: undefined,
        muted: 1,
    });

    assert.deepEqual(sanitized, {
        masterVolume: 1,
        vehiclesVolume: 0,
        effectsVolume: 0.45,
        ambienceVolume: 0,
        musicVolume: 0.2,
        uiVolume: 0.9,
        muted: true,
    });
});

test('audio prefs store returns defaults when config file is missing', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-prefs-store-'));
    const prefsFilePath = path.join(tempRoot, 'data', 'audio-prefs.json');
    const store = createAudioPrefsStore({ prefsFilePath });

    const config = await store.readConfig();

    assert.deepEqual(config.prefs, createDefaultAudioPrefs());
    assert.equal(config.updatedAt, '');
});

test('audio prefs store persists sanitized defaults for deploys', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-prefs-store-'));
    const prefsFilePath = path.join(tempRoot, 'data', 'audio-prefs.json');
    const store = createAudioPrefsStore({ prefsFilePath });

    const savedConfig = await store.writePrefs({
        masterVolume: 0.61,
        vehiclesVolume: 0.92,
        effectsVolume: 0.88,
        ambienceVolume: 0.73,
        musicVolume: 0.14,
        uiVolume: 0.81,
        muted: false,
    });

    assert.equal(savedConfig.prefs.masterVolume, 0.61);
    assert.match(savedConfig.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

    const rawFile = JSON.parse(await fs.readFile(prefsFilePath, 'utf8'));
    assert.equal(rawFile.prefs.musicVolume, 0.14);

    const readBack = await store.readConfig();
    assert.deepEqual(readBack.prefs, savedConfig.prefs);
});
