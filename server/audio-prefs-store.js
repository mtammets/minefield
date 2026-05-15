const fs = require('fs/promises');
const path = require('path');

const AUDIO_PREFS_VERSION = 2;
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

function createAudioPrefsStore({ prefsFilePath } = {}) {
    if (!prefsFilePath) {
        throw new Error('Audio prefs store requires a prefs file path.');
    }

    return {
        async readConfig() {
            return readAudioPrefsConfig(prefsFilePath);
        },
        async writePrefs(prefs = {}) {
            return writeAudioPrefsConfig(prefsFilePath, prefs);
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

async function readAudioPrefsConfig(prefsFilePath) {
    try {
        const raw = await fs.readFile(prefsFilePath, 'utf8');
        return normalizeAudioPrefsConfig(JSON.parse(raw));
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return createDefaultAudioPrefsConfig();
        }
        throw error;
    }
}

async function writeAudioPrefsConfig(prefsFilePath, prefs = {}) {
    const normalizedConfig = normalizeAudioPrefsConfig({
        updatedAt: new Date().toISOString(),
        prefs,
    });
    await fs.mkdir(path.dirname(prefsFilePath), { recursive: true });
    await fs.writeFile(prefsFilePath, `${JSON.stringify(normalizedConfig, null, 2)}\n`, 'utf8');
    return normalizedConfig;
}

function createDefaultAudioPrefsConfig() {
    return {
        version: AUDIO_PREFS_VERSION,
        updatedAt: '',
        prefs: createDefaultAudioPrefs(),
    };
}

function normalizeAudioPrefsConfig(config = {}) {
    const source = config && typeof config === 'object' ? config : {};
    return {
        version: AUDIO_PREFS_VERSION,
        updatedAt: sanitizeTimestamp(source.updatedAt),
        prefs: sanitizeAudioPrefs(source.prefs, DEFAULT_AUDIO_PREFS),
    };
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

module.exports = {
    AUDIO_PREF_KEYS,
    DEFAULT_AUDIO_PREFS,
    createAudioPrefsStore,
    createDefaultAudioPrefs,
    normalizeAudioPrefsConfig,
    sanitizeAudioPrefs,
};
