const BRIDGE_CENTER_X = 64;
const BRIDGE_CENTER_Z = 64;
const BRIDGE_HALF_LENGTH = 30;
const BRIDGE_OUTER_HALF_WIDTH = 8.4;
const BRIDGE_DRIVE_HALF_WIDTH = 4.9;
const BRIDGE_APPROACH_LENGTH = 12;
const BRIDGE_DECK_BASE_HEIGHT = 3.5;
const BRIDGE_DECK_CROWN_RISE = 1.7;
const BRIDGE_RAIL_ACTIVE_MIN_Y = 0.55;
const BRIDGE_RAMP_CAPTURE_HALF_WIDTH = BRIDGE_DRIVE_HALF_WIDTH + 0.65;
const BRIDGE_UNDERPASS_HALF_WIDTH = 4.35;
const BRIDGE_UNDERPASS_MIN_CLEARANCE = 2.3;
const BRIDGE_UPPER_SURFACE_CAPTURE_MARGIN = 0.9;

const BRIDGE_DECK_START = BRIDGE_HALF_LENGTH - BRIDGE_APPROACH_LENGTH;

export const UPPER_DECK_LAYOUT = Object.freeze({
    centerX: BRIDGE_CENTER_X,
    centerZ: BRIDGE_CENTER_Z,
    halfLength: BRIDGE_HALF_LENGTH,
    outerHalfWidth: BRIDGE_OUTER_HALF_WIDTH,
    driveHalfWidth: BRIDGE_DRIVE_HALF_WIDTH,
    approachLength: BRIDGE_APPROACH_LENGTH,
    deckBaseHeight: BRIDGE_DECK_BASE_HEIGHT,
    deckCrownRise: BRIDGE_DECK_CROWN_RISE,
    railActiveMinY: BRIDGE_RAIL_ACTIVE_MIN_Y,
    rampCaptureHalfWidth: BRIDGE_RAMP_CAPTURE_HALF_WIDTH,
    underpassHalfWidth: BRIDGE_UNDERPASS_HALF_WIDTH,
    underpassMinClearance: BRIDGE_UNDERPASS_MIN_CLEARANCE,
    upperSurfaceCaptureMargin: BRIDGE_UPPER_SURFACE_CAPTURE_MARGIN,
});

export function isInsideUpperDeckFootprint(x, z, margin = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
        return false;
    }
    const safeMargin = Math.max(0, Number(margin) || 0);
    const localX = Math.abs(x - BRIDGE_CENTER_X);
    const localZ = Math.abs(z - BRIDGE_CENTER_Z);
    return (
        localX <= BRIDGE_HALF_LENGTH + safeMargin && localZ <= BRIDGE_OUTER_HALF_WIDTH + safeMargin
    );
}

export function sampleUpperDeckHeight(x, z) {
    if (!isInsideUpperDeckFootprint(x, z)) {
        return null;
    }
    const localX = Math.abs(x - BRIDGE_CENTER_X);
    return resolveBridgeDeckHeight(localX);
}

export function isInsideUpperDeckRampCorridor(x, z, margin = 0) {
    if (!isInsideUpperDeckFootprint(x, z, margin)) {
        return false;
    }
    const safeMargin = Math.max(0, Number(margin) || 0);
    const localAbsX = Math.abs(x - BRIDGE_CENTER_X);
    const localAbsZ = Math.abs(z - BRIDGE_CENTER_Z);
    return (
        localAbsX >= BRIDGE_DECK_START - safeMargin &&
        localAbsZ <= BRIDGE_RAMP_CAPTURE_HALF_WIDTH + safeMargin
    );
}

export function isInsideUpperDeckUnderpassCorridor(x, z, margin = 0) {
    if (!isInsideUpperDeckFootprint(x, z, margin)) {
        return false;
    }
    const safeMargin = Math.max(0, Number(margin) || 0);
    const localAbsX = Math.abs(x - BRIDGE_CENTER_X);
    const localAbsZ = Math.abs(z - BRIDGE_CENTER_Z);
    return (
        resolveBridgeDeckHeight(localAbsX) >= BRIDGE_UNDERPASS_MIN_CLEARANCE &&
        localAbsZ <= BRIDGE_UNDERPASS_HALF_WIDTH + safeMargin
    );
}

export function constrainPositionToUpperDeckDriveBounds(position, previousPosition = null) {
    if (
        !position ||
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.z) ||
        !Number.isFinite(position.y)
    ) {
        return null;
    }
    const upperDeckHeight = sampleUpperDeckHeight(position.x, position.z);
    if (!Number.isFinite(upperDeckHeight)) {
        return null;
    }
    const nearUpperSurface =
        position.y >=
        Math.max(BRIDGE_RAIL_ACTIVE_MIN_Y, upperDeckHeight - BRIDGE_UPPER_SURFACE_CAPTURE_MARGIN);
    if (nearUpperSurface) {
        if (!isInsideUpperDeckFootprint(position.x, position.z, 3.4)) {
            return null;
        }

        const localX = position.x - BRIDGE_CENTER_X;
        const localZ = position.z - BRIDGE_CENTER_Z;
        if (Math.abs(localX) <= BRIDGE_HALF_LENGTH && Math.abs(localZ) <= BRIDGE_DRIVE_HALF_WIDTH) {
            return null;
        }

        position.x = BRIDGE_CENTER_X + clamp(localX, -BRIDGE_HALF_LENGTH, BRIDGE_HALF_LENGTH);
        position.z =
            BRIDGE_CENTER_Z + clamp(localZ, -BRIDGE_DRIVE_HALF_WIDTH, BRIDGE_DRIVE_HALF_WIDTH);
        return { mode: 'upper_clamp' };
    }

    if (!isInsideUpperDeckFootprint(position.x, position.z, 0.8)) {
        return null;
    }
    if (isInsideUpperDeckRampCorridor(position.x, position.z, 0.2)) {
        return null;
    }
    if (isInsideUpperDeckUnderpassCorridor(position.x, position.z, 0.15)) {
        return null;
    }

    if (
        previousPosition &&
        Number.isFinite(previousPosition.x) &&
        Number.isFinite(previousPosition.z)
    ) {
        position.x = previousPosition.x;
        position.z = previousPosition.z;
    }
    return { mode: 'lower_block' };
}

function resolveBridgeDeckHeight(localAbsX) {
    if (localAbsX >= BRIDGE_HALF_LENGTH) {
        return 0;
    }

    if (localAbsX >= BRIDGE_DECK_START) {
        const approachT = (BRIDGE_HALF_LENGTH - localAbsX) / Math.max(0.001, BRIDGE_APPROACH_LENGTH);
        return smoothstep01(approachT) * BRIDGE_DECK_BASE_HEIGHT;
    }

    const crownT = 1 - localAbsX / Math.max(0.001, BRIDGE_DECK_START);
    return BRIDGE_DECK_BASE_HEIGHT + Math.sin(crownT * Math.PI * 0.5) * BRIDGE_DECK_CROWN_RISE;
}

function smoothstep01(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
