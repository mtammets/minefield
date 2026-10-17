const ACCOUNT_LOCAL_STORAGE_KEYS = Object.freeze([
    'silentdrift-mp-player-name',
    'silentdrift-garage-wrap-preset-id',
    'silentdrift-player-economy-v1',
    'silentdrift-player-car-color-hex',
    'silentdrift-player-car-skin-id',
    'silentdrift-player-car-vehicle-id',
    'silentdrift-player-car-wheel-preset-id',
    'silentdrift-player-top-speed-kph',
    'silentdrift-graphics-quality-mode',
    'silentdrift-auto-fullscreen-on-start',
    'silentdrift-hide-gameplay-panels',
    'silentdrift-profile-screensaver-enabled',
    'silentdrift-chase-camera-settings-v1',
    'silentdrift-audio-prefs-v1',
    'silentdrift-crash-damage-tuning-v2',
]);

export function clearAccountLocalData({ projectRef = '', storage = undefined } = {}) {
    const resolvedStorage =
        storage && typeof storage.removeItem === 'function'
            ? storage
            : typeof window === 'object' && window?.localStorage
              ? window.localStorage
              : null;
    if (!resolvedStorage) {
        return [];
    }

    const removedKeys = [];
    const keys = resolveAccountLocalStorageKeys(projectRef);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        try {
            resolvedStorage.removeItem(key);
            removedKeys.push(key);
        } catch {
            // localStorage may be unavailable or partially restricted.
        }
    }
    return removedKeys;
}

export function resolveAccountLocalStorageKeys(projectRef = '') {
    const keys = [...ACCOUNT_LOCAL_STORAGE_KEYS];
    const authStorageKey = resolveSupabaseAuthStorageKey(projectRef);
    if (authStorageKey) {
        keys.push(authStorageKey);
    }
    return keys;
}

export function resolveSupabaseAuthStorageKey(projectRef = '') {
    const normalizedProjectRef = sanitizeSupabaseProjectRef(projectRef);
    return normalizedProjectRef
        ? `minefield-drift-auth-${normalizedProjectRef}`
        : 'minefield-drift-auth';
}

function sanitizeSupabaseProjectRef(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase();
    return /^[a-z0-9]{6,32}$/u.test(normalized) ? normalized : '';
}
