export const PLAYER_WHEEL_PRESETS = Object.freeze([
    Object.freeze({
        id: 'scarlet-switchblade',
        name: 'Scarlet Switchblade',
        family: 'Street Cut',
        description:
            'Angular ten-spoke alloy with red-hot detail cuts and a sharp midnight sidewall.',
        tag: 'Precision',
        layout: 'razor-ten',
        defaultUnlocked: true,
        unlockPriceCredits: 0,
        tireColor: 0x1f232a,
        tireRoughness: 0.54,
        tireMetalness: 0.28,
        rimPrimaryColor: 0xf3f6fb,
        rimSecondaryColor: 0xa0afc3,
        rimBaseColor: 0x0d141d,
        accentColor: 0xff5b5b,
        accentEmissiveColor: 0x8a181c,
        accentEmissiveIntensity: 0.42,
        rotorColor: 0x858f9f,
        hubColor: 0xf3f6fb,
        uiAccentColor: '#ff6d6d',
        uiGlowColor: 'rgba(255, 93, 93, 0.34)',
    }),
    Object.freeze({
        id: 'photon-turbine',
        name: 'Photon Turbine',
        family: 'Showroom Elite',
        description:
            'Layered turbine wheel with luminous aero ring, titanium blades and a hypercar-grade glow.',
        tag: 'Signature',
        layout: 'photon-turbine',
        defaultUnlocked: true,
        unlockPriceCredits: 0,
        tireColor: 0x0b1016,
        tireRoughness: 0.46,
        tireMetalness: 0.34,
        rimPrimaryColor: 0xeaf6ff,
        rimSecondaryColor: 0x79cfff,
        rimBaseColor: 0x06111d,
        accentColor: 0x93ffcf,
        accentEmissiveColor: 0x4ef5ff,
        accentEmissiveIntensity: 0.72,
        rotorColor: 0x8fa6c0,
        hubColor: 0xf7fcff,
        uiAccentColor: '#82f4ff',
        uiGlowColor: 'rgba(91, 233, 255, 0.38)',
    }),
    Object.freeze({
        id: 'obsidian-halo',
        name: 'Obsidian Halo',
        family: 'Mine Core',
        description:
            'Deep-dish blackout wheel with interrupted amber halo arcs, armored spokes and a volatile mine-heart hub.',
        tag: 'Mythic',
        layout: 'obsidian-halo',
        defaultUnlocked: true,
        unlockPriceCredits: 0,
        tireColor: 0x05070a,
        tireRoughness: 0.5,
        tireMetalness: 0.24,
        rimPrimaryColor: 0x848b98,
        rimSecondaryColor: 0x2f3742,
        rimBaseColor: 0x090d12,
        accentColor: 0xffb347,
        accentEmissiveColor: 0xff6a00,
        accentEmissiveIntensity: 0.64,
        rotorColor: 0x636c79,
        hubColor: 0xd7dce4,
        uiAccentColor: '#ffb547',
        uiGlowColor: 'rgba(255, 154, 46, 0.38)',
    }),
    Object.freeze({
        id: 'leviathan-rift',
        name: 'Leviathan Rift',
        family: 'Titan Forge',
        description:
            'Towering monster wheel with eclipse treads, abyss blades and a suspended singularity core burning through the hub.',
        tag: 'Colossus',
        layout: 'leviathan-rift',
        defaultUnlocked: false,
        unlockPriceCredits: 140,
        scale: 1.48,
        widthScale: 1.28,
        bodyLift: 0.22,
        massScale: 1.34,
        durabilityScale: 1.16,
        previewScale: 0.62,
        tireColor: 0x03060c,
        tireRoughness: 0.58,
        tireMetalness: 0.3,
        rimPrimaryColor: 0xd4dde9,
        rimSecondaryColor: 0x46607b,
        rimBaseColor: 0x050a12,
        accentColor: 0xffcb67,
        accentEmissiveColor: 0xff6a17,
        accentEmissiveIntensity: 0.9,
        rotorColor: 0x7f8da3,
        hubColor: 0xf5fbff,
        uiAccentColor: '#ffcb67',
        uiGlowColor: 'rgba(255, 153, 61, 0.46)',
    }),
]);

export const DEFAULT_PLAYER_WHEEL_PRESET_ID = PLAYER_WHEEL_PRESETS[0].id;

export function sanitizePlayerWheelPresetId(value) {
    return typeof value === 'string'
        ? value
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, '')
              .slice(0, 32)
        : '';
}

export function getPlayerWheelPresetById(wheelPresetId = DEFAULT_PLAYER_WHEEL_PRESET_ID) {
    const normalizedId = sanitizePlayerWheelPresetId(wheelPresetId);
    for (let i = 0; i < PLAYER_WHEEL_PRESETS.length; i += 1) {
        if (PLAYER_WHEEL_PRESETS[i].id === normalizedId) {
            return PLAYER_WHEEL_PRESETS[i];
        }
    }
    return PLAYER_WHEEL_PRESETS[0];
}

export function resolvePlayerWheelPresetId(wheelPresetId = DEFAULT_PLAYER_WHEEL_PRESET_ID) {
    return getPlayerWheelPresetById(wheelPresetId).id;
}

export function getPlayerWheelPresetIndex(wheelPresetId = DEFAULT_PLAYER_WHEEL_PRESET_ID) {
    const normalizedId = resolvePlayerWheelPresetId(wheelPresetId);
    for (let i = 0; i < PLAYER_WHEEL_PRESETS.length; i += 1) {
        if (PLAYER_WHEEL_PRESETS[i].id === normalizedId) {
            return i;
        }
    }
    return 0;
}
