import { CITY_GRID_SPACING } from './config.js';
import { randomFromGrid } from './grid-noise.js';

const LORIEN_GALLERY_GRID_X = -1;
const LORIEN_GALLERY_GRID_Z = 3;
export const LORIEN_VELMORE_GALLERY_SURFACE_OFFSET = 0;
let lorienVelmoreDoorOpenAmount = 0;

function getDefaultLorienGalleryBuilding() {
    const width = 12 + randomFromGrid(LORIEN_GALLERY_GRID_X, LORIEN_GALLERY_GRID_Z, 11) * 11;
    const depth = 12 + randomFromGrid(LORIEN_GALLERY_GRID_X, LORIEN_GALLERY_GRID_Z, 12) * 11;
    const height = 14 + randomFromGrid(LORIEN_GALLERY_GRID_X, LORIEN_GALLERY_GRID_Z, 13) * 58;

    return {
        gridX: LORIEN_GALLERY_GRID_X,
        gridZ: LORIEN_GALLERY_GRID_Z,
        x: LORIEN_GALLERY_GRID_X * CITY_GRID_SPACING,
        z: LORIEN_GALLERY_GRID_Z * CITY_GRID_SPACING,
        width,
        depth,
        height,
    };
}

function resolveGalleryBuilding(building) {
    if (building) {
        return building;
    }
    return getDefaultLorienGalleryBuilding();
}

export function getLorienVelmoreGalleryLayout(building) {
    const source = resolveGalleryBuilding(building);
    const safeWidth = Math.max(0, source.width * 0.5 - 0.48);
    const safeDepth = Math.max(0, source.depth * 0.5 - 0.62);
    const chamberDepth = 0;
    const lowerLevelCeilingY = 5.2;
    const hallHalfWidth = Math.max(4.4, Math.min(safeWidth - 0.3, safeWidth * 0.96));
    const rampHalfWidth = hallHalfWidth;
    const hallStartZ = -safeDepth + 0.18;
    const rampStartZ = hallStartZ;
    const hallEndZ = safeDepth - 0.34;
    const elevatorWidth = 0;
    const elevatorDepth = 0;
    const elevatorCenterX = 0;

    return {
        ...source,
        centerX: source.x,
        centerZ: source.z,
        safeWidth,
        safeDepth,
        chamberDepth,
        lowerLevelCeilingY,
        rampHalfWidth,
        hallHalfWidth,
        hallHalfDepth: Math.max(2.8, (hallEndZ - hallStartZ) * 0.5),
        rampStartZ,
        hallStartZ,
        hallEndZ,
        elevatorCenterX,
        elevatorCenterZ: 0,
        elevatorWidth,
        elevatorDepth,
        lowerLevelWallHeight: lowerLevelCeilingY - chamberDepth,
    };
}

export function sampleLorienVelmoreGalleryFloorHeightLocal(building, localX, localZ) {
    const layout = getLorienVelmoreGalleryLayout(building);
    if (Math.abs(localX) > layout.safeWidth || Math.abs(localZ) > layout.safeDepth) {
        return null;
    }
    if (localZ < layout.hallStartZ || localZ > layout.hallEndZ) {
        return null;
    }
    if (Math.abs(localX) > layout.hallHalfWidth) {
        return null;
    }
    return 0;
}

export function sampleLorienVelmoreGalleryFloorHeightWorld(x, z, building) {
    const layout = getLorienVelmoreGalleryLayout(building);
    const localX = x - layout.centerX;
    const localZ = z - layout.centerZ;
    if (Math.abs(localX) > layout.safeWidth || Math.abs(localZ) > layout.safeDepth) {
        return null;
    }
    return sampleLorienVelmoreGalleryFloorHeightLocal(layout, localX, localZ);
}

export function isInsideLorienVelmoreGalleryRoomWorld(x, y, z, building, margin = 0) {
    const layout = getLorienVelmoreGalleryLayout(building);
    const localX = x - layout.centerX;
    const localZ = z - layout.centerZ;
    const safeMargin = Number(margin) || 0;
    if (Math.abs(localX) > layout.hallHalfWidth - safeMargin) {
        return false;
    }
    if (localZ < layout.hallStartZ + safeMargin || localZ > layout.hallEndZ - safeMargin) {
        return false;
    }
    if (typeof y === 'number' && (y < -1 || y > layout.lowerLevelCeilingY + 1.2)) {
        return false;
    }
    return true;
}

export function setLorienVelmoreGalleryDoorOpenAmount(openAmount) {
    lorienVelmoreDoorOpenAmount = clamp01(openAmount);
}

export function getLorienVelmoreGallerySilenceFactorWorld(x, y, z, building) {
    const layout = getLorienVelmoreGalleryLayout(building);
    const localX = x - layout.centerX;
    const localZ = z - layout.centerZ;

    if (Math.abs(localX) > layout.hallHalfWidth + 0.24) {
        return 0;
    }
    if (localZ < layout.hallStartZ - 0.24 || localZ > layout.hallEndZ + 0.24) {
        return 0;
    }
    if (y < -1 || y > layout.lowerLevelCeilingY + 0.9) {
        return 0;
    }

    const lateralFactor =
        1 - normalizedRange(Math.abs(localX), layout.hallHalfWidth - 0.9, layout.hallHalfWidth);
    const depthFactor = normalizedRange(localZ, layout.hallStartZ + 0.65, layout.hallStartZ + 4.4);
    const roofFactor =
        1 - normalizedRange(y, layout.lowerLevelCeilingY - 0.22, layout.lowerLevelCeilingY + 0.72);
    const enclosureFactor = clamp01(Math.min(lateralFactor, depthFactor, roofFactor));
    if (enclosureFactor <= 0) {
        return 0;
    }

    const doorClosedFactor = smoothstep01(1 - lorienVelmoreDoorOpenAmount);
    return clamp01(enclosureFactor * lerp(0.48, 1, doorClosedFactor));
}

function smoothstep01(value) {
    const t = clamp01(value);
    return t * t * (3 - 2 * t);
}

function normalizedRange(value, start, end) {
    if (value <= start) {
        return 0;
    }
    if (value >= end) {
        return 1;
    }
    return (value - start) / Math.max(0.001, end - start);
}

function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}

function lerp(start, end, t) {
    return start + (end - start) * t;
}
