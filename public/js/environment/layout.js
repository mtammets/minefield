import {
    CITY_GRID_SPACING,
    CITY_GRID_RANGE,
    ROAD_WIDTH,
    SIDEWALK_WIDTH,
    CHARGING_ZONE_RADIUS,
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

export const roadAxisLineDescriptors = createRoadAxisLineDescriptors();

export const cityMapLayout = {
    gridSpacing: CITY_GRID_SPACING,
    gridRange: CITY_GRID_RANGE,
    roadWidth: ROAD_WIDTH,
    sidewalkWidth: SIDEWALK_WIDTH,
    roadAxisLinesX: roadAxisLineDescriptors.xLines.map(toCityMapLineDescriptor),
    roadAxisLinesZ: roadAxisLineDescriptors.zLines.map(toCityMapLineDescriptor),
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

function createRoadAxisLineDescriptors() {
    return {
        xLines: createRoadAxisLines(17),
        zLines: createRoadAxisLines(29),
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
