import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import {
    CAR_COLOR_STORAGE_KEY,
    PLAYER_TOP_SPEED_STORAGE_KEY,
    GRAPHICS_QUALITY_MODE_STORAGE_KEY,
    CAR_COLOR_PRESETS,
    DEFAULT_PLAYER_CAR_COLOR_HEX,
} from './constants.js';

const GRAPHICS_QUALITY_MODES = new Set(['auto', 'quality', 'balanced', 'performance']);

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

export function readPersistedPlayerCarColorHex() {
    try {
        const storedValue = window.localStorage.getItem(CAR_COLOR_STORAGE_KEY);
        if (!storedValue) {
            return DEFAULT_PLAYER_CAR_COLOR_HEX;
        }
        return parseColorHexInput(storedValue);
    } catch {
        return DEFAULT_PLAYER_CAR_COLOR_HEX;
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

function resolveGraphicsQualityMode(value, fallback = 'auto') {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (GRAPHICS_QUALITY_MODES.has(normalized)) {
        return normalized;
    }
    return fallback;
}
