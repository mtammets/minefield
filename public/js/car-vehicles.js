import { DEFAULT_PLAYER_CAR_SKIN_ID } from './car-skins.js';

export const PLAYER_VEHICLE_PRESETS = Object.freeze([
    Object.freeze({
        id: 'voltline-sled',
        name: 'Voltline Sled',
        category: 'Street Tank',
        description:
            'Low-slung armored drift sled with integrated roof systems and a planted urban stance.',
        bodyStyle: 'luxury',
        defaultSkinId: DEFAULT_PLAYER_CAR_SKIN_ID,
        previewLabel: 'Street Tank',
    }),
    Object.freeze({
        id: 'apex-formula',
        name: 'Apex Formula',
        category: 'Open Wheel',
        description:
            'Exposed-wheel attack chassis with a narrow cockpit, aero wings, and a razor-fast silhouette.',
        bodyStyle: 'formula',
        defaultSkinId: 'heatwave-gt',
        previewLabel: 'Open Wheel',
    }),
]);

export const DEFAULT_PLAYER_VEHICLE_ID = PLAYER_VEHICLE_PRESETS[0].id;

export function sanitizePlayerVehicleId(value) {
    return typeof value === 'string'
        ? value
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, '')
              .slice(0, 32)
        : '';
}

export function getPlayerVehiclePresetById(vehicleId = DEFAULT_PLAYER_VEHICLE_ID) {
    const normalizedId = sanitizePlayerVehicleId(vehicleId);
    for (let i = 0; i < PLAYER_VEHICLE_PRESETS.length; i += 1) {
        if (PLAYER_VEHICLE_PRESETS[i].id === normalizedId) {
            return PLAYER_VEHICLE_PRESETS[i];
        }
    }
    return PLAYER_VEHICLE_PRESETS[0];
}

export function resolvePlayerVehicleId(vehicleId = DEFAULT_PLAYER_VEHICLE_ID) {
    return getPlayerVehiclePresetById(vehicleId).id;
}

export function getPlayerVehiclePresetIndex(vehicleId = DEFAULT_PLAYER_VEHICLE_ID) {
    const normalizedId = resolvePlayerVehicleId(vehicleId);
    for (let i = 0; i < PLAYER_VEHICLE_PRESETS.length; i += 1) {
        if (PLAYER_VEHICLE_PRESETS[i].id === normalizedId) {
            return i;
        }
    }
    return 0;
}
