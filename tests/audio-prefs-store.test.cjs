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

test('audio prefs store returns defaults when config file is missing', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-prefs-store-'));
    const prefsFilePath = path.join(tempRoot, 'data', 'audio-prefs.json');
    const store = createAudioPrefsStore({ prefsFilePath });

    const config = await store.readConfig();

    assert.deepEqual(config.prefs, createDefaultAudioPrefs());
    assert.equal(config.updatedAt, '');
});

test('audio prefs store migrates legacy musicVolume defaults on read', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-prefs-store-'));
    const prefsFilePath = path.join(tempRoot, 'data', 'audio-prefs.json');
    await fs.mkdir(path.dirname(prefsFilePath), { recursive: true });
    await fs.writeFile(
        prefsFilePath,
        `${JSON.stringify({
            version: 1,
            updatedAt: '2026-05-14T21:03:07.188Z',
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
        })}\n`,
        'utf8'
    );

    const store = createAudioPrefsStore({ prefsFilePath });
    const config = await store.readConfig();

    assert.equal(config.prefs.menuMusicVolume, 0.14);
    assert.equal(config.prefs.gameMusicVolume, 0.14);
});

test('audio prefs store persists sanitized defaults for deploys', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-prefs-store-'));
    const prefsFilePath = path.join(tempRoot, 'data', 'audio-prefs.json');
    const store = createAudioPrefsStore({ prefsFilePath });

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
    assert.equal(savedConfig.prefs.botVehiclesVolume, 0.44);
    assert.equal(savedConfig.prefs.menuMusicVolume, 0.14);
    assert.equal(savedConfig.prefs.gameMusicVolume, 0.27);
    assert.match(savedConfig.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

    const rawFile = JSON.parse(await fs.readFile(prefsFilePath, 'utf8'));
    assert.equal(rawFile.prefs.menuMusicVolume, 0.14);
    assert.equal(rawFile.prefs.gameMusicVolume, 0.27);

    const readBack = await store.readConfig();
    assert.deepEqual(readBack.prefs, savedConfig.prefs);
});
