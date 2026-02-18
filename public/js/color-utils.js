import { COLOR_NAMES } from './constants.js';

export function toCssHex(colorHex) {
    return `#${(colorHex >>> 0).toString(16).padStart(6, '0')}`;
}

export function colorNameFromHex(colorHex, colorNames = COLOR_NAMES) {
    const normalized = colorHex >>> 0;
    return colorNames[normalized] || toCssHex(normalized).toUpperCase();
}
