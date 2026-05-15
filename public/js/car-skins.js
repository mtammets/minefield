const BUILT_IN_CAR_SKIN_PRESETS = Object.freeze([
    Object.freeze({
        id: 'midnight-comet',
        name: 'Midnight Comet',
        description: 'Ice-white endurance stripes with cool cyan rails and a deep cobalt shell.',
        bodyColor: 0x2d67a6,
        stripeColor: 0xe8f6ff,
        accentColor: 0x7fdbff,
        accentColorSecondary: 0x0d1f36,
        glowColor: 0x63d8ff,
        material: 'gloss-paint',
        pattern: 'twin-stripe',
    }),
    Object.freeze({
        id: 'heatwave-gt',
        name: 'Heatwave GT',
        description: 'Aggressive hot-lap chevrons, ember highlights and a full redline stance.',
        bodyColor: 0xd34545,
        stripeColor: 0xffe5cf,
        accentColor: 0xffb076,
        accentColorSecondary: 0x3a0f14,
        glowColor: 0xff8a64,
        material: 'gloss-paint',
        pattern: 'chevron-burst',
    }),
    Object.freeze({
        id: 'solar-drift',
        name: 'Solar Drift',
        description: 'Sunset-orange bodywork with luminous sweep graphics and warm gold flashes.',
        bodyColor: 0xff9f3f,
        stripeColor: 0xfff0ae,
        accentColor: 0xffc86a,
        accentColorSecondary: 0x4a2408,
        glowColor: 0xffc15c,
        material: 'ceramic-pearl',
        pattern: 'solar-sweep',
    }),
    Object.freeze({
        id: 'voltage-runner',
        name: 'Voltage Runner',
        description: 'Circuit-laced green skin with pulse nodes and a high-voltage neon edge.',
        bodyColor: 0x3ca86f,
        stripeColor: 0xe4ffe8,
        accentColor: 0x9effc1,
        accentColorSecondary: 0x092819,
        glowColor: 0x74ffb2,
        material: 'neon-lacquer',
        pattern: 'circuit-bloom',
    }),
    Object.freeze({
        id: 'ghost-signal',
        name: 'Ghost Signal',
        description: 'Stealth-gray armor with broken telemetry lines and a cold surveillance glow.',
        bodyColor: 0x8c9bb0,
        stripeColor: 0xdbe7f7,
        accentColor: 0xb8d7ff,
        accentColorSecondary: 0x161d28,
        glowColor: 0xaad5ff,
        material: 'satin-stealth',
        pattern: 'stealth-grid',
    }),
    Object.freeze({
        id: 'prism-frost',
        name: 'Prism Frost',
        description: 'Arctic white shell wrapped in prism ribbons, cyan bloom and pink highlights.',
        bodyColor: 0xe4edf6,
        stripeColor: 0xffffff,
        accentColor: 0x9edcff,
        accentColorSecondary: 0x8e5fd1,
        glowColor: 0xff91d6,
        material: 'ceramic-pearl',
        pattern: 'prism-veil',
    }),
    Object.freeze({
        id: 'tundra-camo',
        name: 'Tundra Camo',
        description: 'Matte tactical camouflage with broken desert blocks and muted moss flashes.',
        bodyColor: 0x626952,
        stripeColor: 0xd6c8a3,
        accentColor: 0x96a873,
        accentColorSecondary: 0x202519,
        glowColor: 0x8dc58c,
        material: 'matte-camo',
        pattern: 'digital-camo',
    }),
    Object.freeze({
        id: 'obsidian-forged',
        name: 'Obsidian Forged',
        description: 'Forged carbon shell with woven graphite reflections and violet charge rails.',
        bodyColor: 0x171b21,
        stripeColor: 0xd7dde9,
        accentColor: 0x8aa8ff,
        accentColorSecondary: 0x090b10,
        glowColor: 0xc28fff,
        material: 'forged-carbon',
        pattern: 'carbon-weave',
    }),
    Object.freeze({
        id: 'liquid-titanium',
        name: 'Liquid Titanium',
        description:
            'Brushed silver metalwork with fluid chrome streaks and clean blue reflections.',
        bodyColor: 0xb4bec8,
        stripeColor: 0xf6fbff,
        accentColor: 0xd3e3f6,
        accentColorSecondary: 0x384552,
        glowColor: 0x8ecbff,
        material: 'brushed-metal',
        pattern: 'brushed-stream',
    }),
    Object.freeze({
        id: 'aurora-forge',
        name: 'Aurora Forge',
        description:
            'Anodized alloy skin that shifts through cyan, pink and gold under the lights.',
        bodyColor: 0x5569c2,
        stripeColor: 0xf5f9ff,
        accentColor: 0x8efae7,
        accentColorSecondary: 0x241744,
        glowColor: 0xff89d7,
        material: 'anodized-iridescent',
        pattern: 'anodized-flow',
    }),
    Object.freeze({
        id: 'hazard-sector',
        name: 'Hazard Sector',
        description:
            'Industrial warning livery with armored yellow panels and sharp blackout cuts.',
        bodyColor: 0xc9a52f,
        stripeColor: 0x121416,
        accentColor: 0xffdf72,
        accentColorSecondary: 0x332607,
        glowColor: 0xffb857,
        material: 'industrial-coat',
        pattern: 'hazard-strike',
    }),
]);

export const CAR_SKIN_PRESETS = Object.freeze(BUILT_IN_CAR_SKIN_PRESETS.slice());
export const DEFAULT_PLAYER_CAR_SKIN_ID = CAR_SKIN_PRESETS[0].id;
export const DEFAULT_PLAYER_CAR_COLOR_HEX = CAR_SKIN_PRESETS[0].bodyColor >>> 0;

export function sanitizeCarSkinId(value) {
    return typeof value === 'string'
        ? value
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, '')
              .slice(0, 48)
        : '';
}

export function getCarSkinPresetById(skinId = DEFAULT_PLAYER_CAR_SKIN_ID) {
    const normalizedId = sanitizeCarSkinId(skinId);
    for (let i = 0; i < CAR_SKIN_PRESETS.length; i += 1) {
        if (CAR_SKIN_PRESETS[i].id === normalizedId) {
            return CAR_SKIN_PRESETS[i];
        }
    }
    return CAR_SKIN_PRESETS[0];
}

export function resolvePlayerCarSkinId(skinId = DEFAULT_PLAYER_CAR_SKIN_ID) {
    return getCarSkinPresetById(skinId).id;
}

export function getCarSkinPresetIndex(skinId = DEFAULT_PLAYER_CAR_SKIN_ID) {
    const normalizedId = resolvePlayerCarSkinId(skinId);
    for (let i = 0; i < CAR_SKIN_PRESETS.length; i += 1) {
        if (CAR_SKIN_PRESETS[i].id === normalizedId) {
            return i;
        }
    }
    return 0;
}

export function getCarSkinPresetByColorHex(colorHex = DEFAULT_PLAYER_CAR_COLOR_HEX) {
    const normalizedColorHex = normalizeColorHex(colorHex, DEFAULT_PLAYER_CAR_COLOR_HEX);
    for (let i = 0; i < CAR_SKIN_PRESETS.length; i += 1) {
        if (CAR_SKIN_PRESETS[i].bodyColor >>> 0 === normalizedColorHex) {
            return CAR_SKIN_PRESETS[i];
        }
    }
    return CAR_SKIN_PRESETS[0];
}

function normalizeColorHex(colorHex, fallback) {
    if (typeof colorHex === 'number' && Number.isFinite(colorHex)) {
        return colorHex >>> 0;
    }

    if (typeof colorHex !== 'string') {
        return fallback >>> 0;
    }

    const value = colorHex.trim();
    if (!value) {
        return fallback >>> 0;
    }

    if (value.startsWith('#')) {
        const parsedHex = Number.parseInt(value.slice(1), 16);
        return Number.isFinite(parsedHex) ? parsedHex >>> 0 : fallback >>> 0;
    }

    if (/^\d+$/u.test(value)) {
        const decimal = Number.parseInt(value, 10);
        return Number.isFinite(decimal) ? decimal >>> 0 : fallback >>> 0;
    }

    const normalizedHex = value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value;
    if (!/^[\da-fA-F]+$/u.test(normalizedHex)) {
        return fallback >>> 0;
    }

    const parsedHex = Number.parseInt(normalizedHex, 16);
    return Number.isFinite(parsedHex) ? parsedHex >>> 0 : fallback >>> 0;
}
