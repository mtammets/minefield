import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import {
    CAR_COLOR_STORAGE_KEY,
    PLAYER_CAR_SKIN_STORAGE_KEY,
    PLAYER_CAR_VEHICLE_STORAGE_KEY,
    PLAYER_TOP_SPEED_STORAGE_KEY,
    GRAPHICS_QUALITY_MODE_STORAGE_KEY,
    AUTO_FULLSCREEN_ON_START_STORAGE_KEY,
    CHASE_CAMERA_SETTINGS_STORAGE_KEY,
    CAR_COLOR_PRESETS,
    DEFAULT_PLAYER_CAR_COLOR_HEX,
} from './constants.js';
import {
    CAR_SKIN_PRESETS,
    DEFAULT_PLAYER_CAR_SKIN_ID,
    getCarSkinPresetByColorHex,
    getCarSkinPresetById,
    getCarSkinPresetIndex,
    resolvePlayerCarSkinId,
} from './car-skins.js';
import { DEFAULT_PLAYER_VEHICLE_ID, resolvePlayerVehicleId } from './car-vehicles.js';

export {
    CAR_SKIN_PRESETS,
    DEFAULT_PLAYER_CAR_SKIN_ID,
    getCarSkinPresetByColorHex,
    getCarSkinPresetById,
    getCarSkinPresetIndex,
    resolvePlayerCarSkinId,
} from './car-skins.js';
export { DEFAULT_PLAYER_VEHICLE_ID, resolvePlayerVehicleId } from './car-vehicles.js';

const GRAPHICS_QUALITY_MODES = new Set(['auto', 'quality', 'balanced', 'performance']);
const CHASE_CAMERA_SETTING_MIN = -1;
const CHASE_CAMERA_SETTING_MAX = 1;

export function readPersistedPlayerTopSpeedKph({
    getPlayerTopSpeedLimit,
    getPlayerTopSpeedLimitBounds,
}) {
    const fallback = getPlayerTopSpeedLimit().topSpeedKph;
    try {
        const storedValue = window.localStorage.getItem(PLAYER_TOP_SPEED_STORAGE_KEY);
        if (!storedValue) {
            return fallback;
        }
        const parsed = Number.parseInt(storedValue, 10);
        return clampPlayerTopSpeedKph(parsed, fallback, getPlayerTopSpeedLimitBounds);
    } catch {
        return fallback;
    }
}

export function persistPlayerTopSpeedKph(
    speedKph,
    { getPlayerTopSpeedLimit, getPlayerTopSpeedLimitBounds }
) {
    const clamped = clampPlayerTopSpeedKph(
        speedKph,
        getPlayerTopSpeedLimit().topSpeedKph,
        getPlayerTopSpeedLimitBounds
    );
    try {
        window.localStorage.setItem(PLAYER_TOP_SPEED_STORAGE_KEY, String(clamped));
    } catch {
        // localStorage can fail in restricted browsing modes.
    }
}

export function readPersistedGraphicsQualityMode(fallback = 'auto') {
    const fallbackMode = resolveGraphicsQualityMode(fallback, 'auto');
    try {
        const storedValue = window.localStorage.getItem(GRAPHICS_QUALITY_MODE_STORAGE_KEY);
        return resolveGraphicsQualityMode(storedValue, fallbackMode);
    } catch {
        return fallbackMode;
    }
}

export function persistGraphicsQualityMode(mode) {
    const normalizedMode = resolveGraphicsQualityMode(mode, '');
    if (!normalizedMode) {
        return;
    }
    try {
        window.localStorage.setItem(GRAPHICS_QUALITY_MODE_STORAGE_KEY, normalizedMode);
    } catch {
        // localStorage can fail in restricted browsing modes.
    }
}

export function readPersistedAutoFullscreenOnStart(fallback = true) {
    const fallbackValue = fallback !== false;
    try {
        const storedValue = window.localStorage.getItem(AUTO_FULLSCREEN_ON_START_STORAGE_KEY);
        return resolveAutoFullscreenOnStart(storedValue, fallbackValue);
    } catch {
        return fallbackValue;
    }
}

export function persistAutoFullscreenOnStart(enabled) {
    try {
        window.localStorage.setItem(
            AUTO_FULLSCREEN_ON_START_STORAGE_KEY,
            enabled ? 'true' : 'false'
        );
    } catch {
        // localStorage can fail in restricted browsing modes.
    }
}

export function readPersistedChaseCameraSettings(
    fallback = {
        distanceBias: 0,
        heightBias: 0,
    }
) {
    const fallbackSettings = sanitizeChaseCameraSettings(fallback);
    try {
        const storedValue = window.localStorage.getItem(CHASE_CAMERA_SETTINGS_STORAGE_KEY);
        if (!storedValue) {
            return fallbackSettings;
        }
        const parsed = JSON.parse(storedValue);
        return sanitizeChaseCameraSettings(parsed, fallbackSettings);
    } catch {
        return fallbackSettings;
    }
}

export function persistChaseCameraSettings(settings) {
    const safeSettings = sanitizeChaseCameraSettings(settings);
    try {
        window.localStorage.setItem(
            CHASE_CAMERA_SETTINGS_STORAGE_KEY,
            JSON.stringify(safeSettings)
        );
    } catch {
        // localStorage can fail in restricted browsing modes.
    }
}

export function clampPlayerTopSpeedKph(speedKph, fallbackKph, getPlayerTopSpeedLimitBounds) {
    const bounds = getPlayerTopSpeedLimitBounds();
    const fallback = Number.isFinite(fallbackKph) ? fallbackKph : bounds.maxKph;
    const numeric = Number.isFinite(speedKph) ? speedKph : fallback;
    return THREE.MathUtils.clamp(Math.round(numeric), bounds.minKph, bounds.maxKph);
}

export function resolvePlayerCarColorHex(colorHex) {
    if (!CAR_COLOR_PRESETS.length) {
        return DEFAULT_PLAYER_CAR_COLOR_HEX >>> 0;
    }

    const parsedColor = parseColorHexInput(colorHex);
    const presetIndex = getCarColorPresetIndex(parsedColor);
    return CAR_COLOR_PRESETS[presetIndex].hex;
}

export function getCarColorPresetIndex(colorHex) {
    const normalized = parseColorHexInput(colorHex);
    for (let i = 0; i < CAR_COLOR_PRESETS.length; i += 1) {
        if (CAR_COLOR_PRESETS[i].hex >>> 0 === normalized) {
            return i;
        }
    }
    return 0;
}

export function readPersistedPlayerCarVehicleId(fallbackVehicleId = DEFAULT_PLAYER_VEHICLE_ID) {
    const fallback = resolvePlayerVehicleId(fallbackVehicleId || DEFAULT_PLAYER_VEHICLE_ID);
    try {
        const storedValue = window.localStorage.getItem(PLAYER_CAR_VEHICLE_STORAGE_KEY);
        if (storedValue) {
            return resolvePlayerVehicleId(storedValue);
        }
    } catch {
        // localStorage can fail in restricted browsing modes.
    }
    return fallback;
}

export function persistPlayerCarVehicleId(vehicleId) {
    const resolvedVehicleId = resolvePlayerVehicleId(vehicleId || DEFAULT_PLAYER_VEHICLE_ID);
    try {
        window.localStorage.setItem(PLAYER_CAR_VEHICLE_STORAGE_KEY, resolvedVehicleId);
    } catch {
        // localStorage can fail in restricted browsing modes.
    }
}

export function readPersistedPlayerCarSkinId(fallbackSkinId = DEFAULT_PLAYER_CAR_SKIN_ID) {
    try {
        const storedValue = window.localStorage.getItem(PLAYER_CAR_SKIN_STORAGE_KEY);
        if (storedValue) {
            return resolvePlayerCarSkinId(storedValue);
        }
    } catch {
        // localStorage can fail in restricted browsing modes.
    }
    const resolvedFallbackSkinId = resolvePlayerCarSkinId(
        fallbackSkinId || DEFAULT_PLAYER_CAR_SKIN_ID
    );
    const legacyFallbackSkinId = getCarSkinPresetByColorHex(
        readPersistedPlayerCarColorHexLegacy()
    ).id;
    return resolvedFallbackSkinId || legacyFallbackSkinId;
}

export function readPersistedPlayerCarColorHex() {
    const fallbackPreset = getCarSkinPresetById(readPersistedPlayerCarSkinId());
    const fallbackColorHex = fallbackPreset.bodyColor >>> 0;
    try {
        return readPersistedPlayerCarColorHexLegacy(fallbackColorHex);
    } catch {
        return fallbackColorHex;
    }
}

export function persistPlayerCarSkinId(skinId) {
    const resolvedSkinId = resolvePlayerCarSkinId(skinId || DEFAULT_PLAYER_CAR_SKIN_ID);
    try {
        window.localStorage.setItem(PLAYER_CAR_SKIN_STORAGE_KEY, resolvedSkinId);
    } catch {
        // localStorage can fail in restricted browsing modes.
    }
}

export function persistPlayerCarColorHex(colorHex) {
    try {
        window.localStorage.setItem(
            CAR_COLOR_STORAGE_KEY,
            String(resolvePlayerCarColorHex(colorHex))
        );
    } catch {
        // localStorage can fail in restricted browsing modes.
    }
}

function parseColorHexInput(input) {
    if (typeof input === 'number' && Number.isFinite(input)) {
        return input >>> 0;
    }

    if (typeof input !== 'string') {
        return DEFAULT_PLAYER_CAR_COLOR_HEX >>> 0;
    }

    const value = input.trim();
    if (!value) {
        return DEFAULT_PLAYER_CAR_COLOR_HEX >>> 0;
    }

    if (value.startsWith('#')) {
        const parsedHex = Number.parseInt(value.slice(1), 16);
        return Number.isFinite(parsedHex) ? parsedHex >>> 0 : DEFAULT_PLAYER_CAR_COLOR_HEX >>> 0;
    }

    if (/^\d+$/u.test(value)) {
        const decimal = Number.parseInt(value, 10);
        return decimal >>> 0;
    }

    const normalizedHex = value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value;
    if (!/^[\da-fA-F]+$/u.test(normalizedHex)) {
        return DEFAULT_PLAYER_CAR_COLOR_HEX >>> 0;
    }

    const parsedHex = Number.parseInt(normalizedHex, 16);
    return Number.isFinite(parsedHex) ? parsedHex >>> 0 : DEFAULT_PLAYER_CAR_COLOR_HEX >>> 0;
}

function readPersistedPlayerCarColorHexLegacy(fallbackColorHex = DEFAULT_PLAYER_CAR_COLOR_HEX) {
    const storedValue = window.localStorage.getItem(CAR_COLOR_STORAGE_KEY);
    if (!storedValue) {
        return fallbackColorHex >>> 0;
    }
    return parseColorHexInput(storedValue);
}

function resolveGraphicsQualityMode(value, fallback = 'auto') {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (GRAPHICS_QUALITY_MODES.has(normalized)) {
        return normalized;
    }
    return fallback;
}

function resolveAutoFullscreenOnStart(value, fallback = true) {
    if (typeof value === 'boolean') {
        return value;
    }
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (
        normalized === 'true' ||
        normalized === '1' ||
        normalized === 'yes' ||
        normalized === 'on'
    ) {
        return true;
    }
    if (
        normalized === 'false' ||
        normalized === '0' ||
        normalized === 'no' ||
        normalized === 'off'
    ) {
        return false;
    }
    return fallback !== false;
}

export function sanitizeChaseCameraSettings(
    value,
    fallback = {
        distanceBias: 0,
        heightBias: 0,
    }
) {
    const source = value && typeof value === 'object' ? value : {};
    const fallbackSource = fallback && typeof fallback === 'object' ? fallback : {};
    const fallbackDistanceBias = clampChaseCameraSettingValue(fallbackSource.distanceBias, 0);
    const fallbackHeightBias = clampChaseCameraSettingValue(fallbackSource.heightBias, 0);
    return {
        distanceBias: clampChaseCameraSettingValue(source.distanceBias, fallbackDistanceBias),
        heightBias: clampChaseCameraSettingValue(source.heightBias, fallbackHeightBias),
    };
}

function clampChaseCameraSettingValue(value, fallback = 0) {
    const numeric = Number.isFinite(value) ? value : Number(fallback) || 0;
    return THREE.MathUtils.clamp(numeric, CHASE_CAMERA_SETTING_MIN, CHASE_CAMERA_SETTING_MAX);
}
