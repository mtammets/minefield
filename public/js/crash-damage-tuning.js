import {
    OBSTACLE_CRASH_MIN_SPEED,
    OBSTACLE_CRASH_MAX_SPEED,
    VEHICLE_DAMAGE_COLLISION_MIN,
    VEHICLE_DAMAGE_COLLISION_HIGH,
    VEHICLE_WHEEL_DETACH_SPEED,
    VEHICLE_SECOND_WHEEL_DETACH_SPEED,
    VEHICLE_DENT_MAX,
    DEBRIS_GRAVITY,
    DEBRIS_DRAG,
    DEBRIS_BOUNCE_DAMPING,
    DEBRIS_BASE_VERTICAL_BOOST,
    PART_BASE_LATERAL_BOOST,
    PART_BASE_BLAST_BOOST,
    PART_BASE_FORWARD_CARRY_BOOST,
    PART_BASE_IMPACT_INERTIA_SCALE,
} from './constants.js';

export const CRASH_DAMAGE_TUNING_STORAGE_KEY = 'silentdrift-crash-damage-tuning-v1';

export const CRASH_DAMAGE_TUNING_FIELDS = [
    {
        key: 'obstacleCrashMinSpeed',
        label: 'Obstacle crash threshold',
        group: 'Explosion',
        min: 8,
        max: 90,
        step: 1,
        decimals: 0,
    },
    {
        key: 'obstacleCrashMaxSpeed',
        label: 'Crash max intensity speed',
        group: 'Explosion',
        min: 16,
        max: 140,
        step: 1,
        decimals: 0,
    },
    {
        key: 'debrisGravity',
        label: 'Debris gravity',
        group: 'Explosion',
        min: 4,
        max: 80,
        step: 0.5,
        decimals: 1,
    },
    {
        key: 'debrisDrag',
        label: 'Debris drag',
        group: 'Explosion',
        min: 0,
        max: 8,
        step: 0.05,
        decimals: 2,
    },
    {
        key: 'debrisBounceDamping',
        label: 'Debris bounce',
        group: 'Explosion',
        min: 0,
        max: 1,
        step: 0.01,
        decimals: 2,
    },
    {
        key: 'debrisVerticalBoost',
        label: 'Debris vertical boost',
        group: 'Explosion',
        min: 0,
        max: 12,
        step: 0.1,
        decimals: 1,
    },
    {
        key: 'debrisLateralBoost',
        label: 'Debris lateral boost',
        group: 'Explosion',
        min: 0,
        max: 12,
        step: 0.1,
        decimals: 1,
    },
    {
        key: 'debrisBlastBoost',
        label: 'Debris blast boost',
        group: 'Explosion',
        min: 0,
        max: 16,
        step: 0.1,
        decimals: 1,
    },
    {
        key: 'debrisForwardCarryBoost',
        label: 'Debris forward carry',
        group: 'Explosion',
        min: 0,
        max: 20,
        step: 0.1,
        decimals: 1,
    },
    {
        key: 'debrisImpactInertiaScale',
        label: 'Impact inertia carry',
        group: 'Explosion',
        min: 0,
        max: 1.2,
        step: 0.01,
        decimals: 2,
    },
    {
        key: 'vehicleDamageCollisionMin',
        label: 'Damage min collision speed',
        group: 'Damage',
        min: 1,
        max: 60,
        step: 1,
        decimals: 0,
    },
    {
        key: 'vehicleDamageCollisionHigh',
        label: 'Damage high collision speed',
        group: 'Damage',
        min: 2,
        max: 90,
        step: 1,
        decimals: 0,
    },
    {
        key: 'vehicleWheelDetachSpeed',
        label: 'Wheel detach speed',
        group: 'Damage',
        min: 4,
        max: 100,
        step: 1,
        decimals: 0,
    },
    {
        key: 'vehicleSecondWheelDetachSpeed',
        label: 'Second wheel detach speed',
        group: 'Damage',
        min: 6,
        max: 120,
        step: 1,
        decimals: 0,
    },
    {
        key: 'vehicleDentMax',
        label: 'Max dent amount',
        group: 'Damage',
        min: 0.2,
        max: 6,
        step: 0.05,
        decimals: 2,
    },
];

const FIELD_BY_KEY = new Map(CRASH_DAMAGE_TUNING_FIELDS.map((field) => [field.key, field]));

export function getCrashDamageTuningField(key) {
    return FIELD_BY_KEY.get(String(key || '')) || null;
}

export function createDefaultCrashDamageTuning() {
    return {
        obstacleCrashMinSpeed: OBSTACLE_CRASH_MIN_SPEED,
        obstacleCrashMaxSpeed: OBSTACLE_CRASH_MAX_SPEED,
        debrisGravity: DEBRIS_GRAVITY,
        debrisDrag: DEBRIS_DRAG,
        debrisBounceDamping: DEBRIS_BOUNCE_DAMPING,
        debrisVerticalBoost: DEBRIS_BASE_VERTICAL_BOOST,
        debrisLateralBoost: PART_BASE_LATERAL_BOOST,
        debrisBlastBoost: PART_BASE_BLAST_BOOST,
        debrisForwardCarryBoost: PART_BASE_FORWARD_CARRY_BOOST,
        debrisImpactInertiaScale: PART_BASE_IMPACT_INERTIA_SCALE,
        vehicleDamageCollisionMin: VEHICLE_DAMAGE_COLLISION_MIN,
        vehicleDamageCollisionHigh: VEHICLE_DAMAGE_COLLISION_HIGH,
        vehicleWheelDetachSpeed: VEHICLE_WHEEL_DETACH_SPEED,
        vehicleSecondWheelDetachSpeed: VEHICLE_SECOND_WHEEL_DETACH_SPEED,
        vehicleDentMax: VEHICLE_DENT_MAX,
    };
}

export function sanitizeCrashDamageTuning(input = {}, fallback = null) {
    const defaults = createDefaultCrashDamageTuning();
    const base = fallback && typeof fallback === 'object' ? fallback : defaults;
    const resolved = {};

    for (let i = 0; i < CRASH_DAMAGE_TUNING_FIELDS.length; i += 1) {
        const field = CRASH_DAMAGE_TUNING_FIELDS[i];
        const fallbackValue = Number.isFinite(base[field.key])
            ? base[field.key]
            : defaults[field.key];
        const rawValue =
            input && typeof input === 'object' && field.key in input
                ? input[field.key]
                : fallbackValue;
        resolved[field.key] = clampTuningValue(rawValue, field, fallbackValue);
    }

    resolved.obstacleCrashMinSpeed = clampTuningValue(
        resolved.obstacleCrashMinSpeed,
        FIELD_BY_KEY.get('obstacleCrashMinSpeed'),
        defaults.obstacleCrashMinSpeed
    );
    resolved.obstacleCrashMaxSpeed = clampTuningValue(
        Math.max(resolved.obstacleCrashMaxSpeed, resolved.obstacleCrashMinSpeed + 2),
        FIELD_BY_KEY.get('obstacleCrashMaxSpeed'),
        defaults.obstacleCrashMaxSpeed
    );

    resolved.vehicleDamageCollisionMin = clampTuningValue(
        resolved.vehicleDamageCollisionMin,
        FIELD_BY_KEY.get('vehicleDamageCollisionMin'),
        defaults.vehicleDamageCollisionMin
    );
    resolved.vehicleDamageCollisionHigh = clampTuningValue(
        Math.max(resolved.vehicleDamageCollisionHigh, resolved.vehicleDamageCollisionMin + 1),
        FIELD_BY_KEY.get('vehicleDamageCollisionHigh'),
        defaults.vehicleDamageCollisionHigh
    );
    resolved.vehicleWheelDetachSpeed = clampTuningValue(
        Math.max(resolved.vehicleWheelDetachSpeed, resolved.vehicleDamageCollisionMin + 1),
        FIELD_BY_KEY.get('vehicleWheelDetachSpeed'),
        defaults.vehicleWheelDetachSpeed
    );
    resolved.vehicleSecondWheelDetachSpeed = clampTuningValue(
        Math.max(resolved.vehicleSecondWheelDetachSpeed, resolved.vehicleWheelDetachSpeed + 1),
        FIELD_BY_KEY.get('vehicleSecondWheelDetachSpeed'),
        defaults.vehicleSecondWheelDetachSpeed
    );
    resolved.vehicleDentMax = clampTuningValue(
        resolved.vehicleDentMax,
        FIELD_BY_KEY.get('vehicleDentMax'),
        defaults.vehicleDentMax
    );

    return resolved;
}

export function mergeCrashDamageTuning(current = {}, partial = {}) {
    return sanitizeCrashDamageTuning(
        {
            ...(current && typeof current === 'object' ? current : {}),
            ...(partial && typeof partial === 'object' ? partial : {}),
        },
        current
    );
}

export function formatCrashDamageTuningValue(key, value) {
    const field = getCrashDamageTuningField(key);
    const decimals = field ? Math.max(0, field.decimals || 0) : 2;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return '--';
    }
    return numeric.toFixed(decimals);
}

export function readPersistedCrashDamageTuning(fallback = null) {
    const safeFallback = sanitizeCrashDamageTuning({}, fallback);
    if (typeof window === 'undefined') {
        return safeFallback;
    }
    try {
        const raw = window.localStorage.getItem(CRASH_DAMAGE_TUNING_STORAGE_KEY);
        if (!raw) {
            return safeFallback;
        }
        const parsed = JSON.parse(raw);
        return sanitizeCrashDamageTuning(parsed, safeFallback);
    } catch {
        return safeFallback;
    }
}

export function persistCrashDamageTuning(tuning) {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        const serialized = sanitizeCrashDamageTuning(tuning);
        window.localStorage.setItem(CRASH_DAMAGE_TUNING_STORAGE_KEY, JSON.stringify(serialized));
    } catch {
        // localStorage can fail in private/restricted browsing contexts.
    }
}

function clampTuningValue(value, field, fallback) {
    const safeField =
        field && typeof field === 'object' ? field : { min: -Infinity, max: Infinity, step: 0 };
    const min = Number.isFinite(safeField.min) ? safeField.min : -Infinity;
    const max = Number.isFinite(safeField.max) ? safeField.max : Infinity;
    const step = Number.isFinite(safeField.step) && safeField.step > 0 ? safeField.step : 0;
    const raw = Number(value);
    const safeFallback = Number.isFinite(fallback) ? fallback : min;
    let clamped = Number.isFinite(raw) ? raw : safeFallback;
    clamped = Math.max(min, Math.min(max, clamped));
    if (step <= 0) {
        return clamped;
    }

    const stepIndex = Math.round((clamped - min) / step);
    const snapped = min + stepIndex * step;
    const decimals = countStepDecimals(step);
    const rounded = Number(snapped.toFixed(decimals));
    return Math.max(min, Math.min(max, rounded));
}

function countStepDecimals(step) {
    const asString = String(step);
    const dotIndex = asString.indexOf('.');
    if (dotIndex === -1) {
        return 0;
    }
    return asString.length - dotIndex - 1;
}
