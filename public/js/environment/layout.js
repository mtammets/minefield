import {
    CITY_GRID_SPACING,
    CITY_GRID_RANGE,
    ROAD_WIDTH,
    SIDEWALK_WIDTH,
    CHARGING_ZONE_RADIUS,
    CENTRAL_PARKING_LOT_WIDTH,
    CENTRAL_PARKING_LOT_DEPTH,
    ROAD_STYLE_CONFIGS,
} from './config.js';

const WORLD_HALF_SIZE = CITY_GRID_SPACING * (CITY_GRID_RANGE + 0.5);

export const worldBounds = {
    minX: -WORLD_HALF_SIZE,
    maxX: WORLD_HALF_SIZE,
    minZ: -WORLD_HALF_SIZE,
    maxZ: WORLD_HALF_SIZE,
    size: WORLD_HALF_SIZE * 2,
};

export const chargingZones = createChargingZones();
export const chargingZoneIntersectionKeys = createChargingZoneIntersectionKeys(chargingZones);
export const centralParkingLot = createCentralParkingLot();

export const roadAxisLineDescriptors = createRoadAxisLineDescriptors();

export const cityMapLayout = {
    gridSpacing: CITY_GRID_SPACING,
    gridRange: CITY_GRID_RANGE,
    roadWidth: ROAD_WIDTH,
    sidewalkWidth: SIDEWALK_WIDTH,
    roadAxisLinesX: roadAxisLineDescriptors.xLines.map(toCityMapLineDescriptor),
    roadAxisLinesZ: roadAxisLineDescriptors.zLines.map(toCityMapLineDescriptor),
    centralParkingLot: {
        centerX: centralParkingLot.centerX,
        centerZ: centralParkingLot.centerZ,
        width: centralParkingLot.width,
        depth: centralParkingLot.depth,
        minX: centralParkingLot.minX,
        maxX: centralParkingLot.maxX,
        minZ: centralParkingLot.minZ,
        maxZ: centralParkingLot.maxZ,
    },
};

function createChargingZones() {
    const roadStep = CITY_GRID_SPACING * 2;
    const majorStep = roadStep * 2;
    const anchors = [
        [0, -majorStep],
        [0, -roadStep],
        [-roadStep, -roadStep],
        [roadStep, -roadStep],
        [-majorStep, 0],
        [-roadStep, 0],
        [roadStep, 0],
        [majorStep, 0],
        [-roadStep, roadStep],
        [0, roadStep],
        [roadStep, roadStep],
        [0, majorStep],
        [-majorStep, -majorStep],
        [majorStep, majorStep],
    ];

    return anchors.map(([x, z], index) => ({
        id: `charging_zone_${index}`,
        x,
        z,
        radius: CHARGING_ZONE_RADIUS,
    }));
}

function createChargingZoneIntersectionKeys(zones = []) {
    const keys = new Set();
    zones.forEach((zone) => {
        if (!zone || !Number.isFinite(zone.x) || !Number.isFinite(zone.z)) {
            return;
        }
        keys.add(toIntersectionKey(zone.x, zone.z));
    });
    return keys;
}

export function toIntersectionKey(x, z) {
    return `${Math.round(x)}:${Math.round(z)}`;
}

export function isInsideCentralParkingLot(x, z, padding = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
        return false;
    }
    const extraPadding = Math.max(0, Number(padding) || 0);
    return (
        x >= centralParkingLot.minX - extraPadding &&
        x <= centralParkingLot.maxX + extraPadding &&
        z >= centralParkingLot.minZ - extraPadding &&
        z <= centralParkingLot.maxZ + extraPadding
    );
}

export function doesRectOverlapCentralParkingLot(centerX, centerZ, width, depth, padding = 0) {
    if (
        !Number.isFinite(centerX) ||
        !Number.isFinite(centerZ) ||
        !Number.isFinite(width) ||
        !Number.isFinite(depth)
    ) {
        return false;
    }
    const halfWidth = Math.max(0, width * 0.5);
    const halfDepth = Math.max(0, depth * 0.5);
    const minX = centerX - halfWidth;
    const maxX = centerX + halfWidth;
    const minZ = centerZ - halfDepth;
    const maxZ = centerZ + halfDepth;
    const extraPadding = Math.max(0, Number(padding) || 0);

    return !(
        maxX < centralParkingLot.minX - extraPadding ||
        minX > centralParkingLot.maxX + extraPadding ||
        maxZ < centralParkingLot.minZ - extraPadding ||
        minZ > centralParkingLot.maxZ + extraPadding
    );
}

function createRoadAxisLineDescriptors() {
    return {
        xLines: createRoadAxisLines(17),
        zLines: createRoadAxisLines(29),
    };
}

function createCentralParkingLot() {
    const centerX = 0;
    const centerZ = 0;
    const width = CENTRAL_PARKING_LOT_WIDTH;
    const depth = CENTRAL_PARKING_LOT_DEPTH;
    return {
        centerX,
        centerZ,
        width,
        depth,
        minX: centerX - width * 0.5,
        maxX: centerX + width * 0.5,
        minZ: centerZ - depth * 0.5,
        maxZ: centerZ + depth * 0.5,
    };
}

function createRoadAxisLines(axisSalt) {
    const lines = [];
    for (let gridIndex = -CITY_GRID_RANGE; gridIndex <= CITY_GRID_RANGE; gridIndex += 1) {
        if (Math.abs(gridIndex) % 2 !== 0) {
            continue;
        }
        const styleKey = resolveRoadStyleKeyForAxisLine(gridIndex, axisSalt);
        const style = ROAD_STYLE_CONFIGS[styleKey] || ROAD_STYLE_CONFIGS.avenue;

        lines.push({
            gridIndex,
            coordinate: gridIndex * CITY_GRID_SPACING,
            styleKey,
            sidewalkMode: style.sidewalkMode || 'both',
        });
    }
    return lines;
}

function resolveRoadStyleKeyForAxisLine(gridIndex, _axisSalt) {
    const absIndex = Math.abs(gridIndex);
    if (absIndex === 0) {
        return 'boulevard';
    }
    if (absIndex === 2) {
        return 'avenue';
    }
    if (absIndex >= 4) {
        return 'service';
    }

    return 'avenue';
}

function toCityMapLineDescriptor(lineDescriptor) {
    const hasSidewalks = lineDescriptor.sidewalkMode !== 'none';
    return {
        gridIndex: lineDescriptor.gridIndex,
        coord: lineDescriptor.coordinate,
        styleKey: lineDescriptor.styleKey,
        roadWidth: ROAD_WIDTH,
        sidewalkWidth: hasSidewalks ? SIDEWALK_WIDTH : 0,
    };
}
