import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { CITY_GRID_SPACING, ROAD_WIDTH, SIDEWALK_WIDTH, ROAD_STYLE_CONFIGS } from './config.js';
import {
    worldBounds,
    roadAxisLineDescriptors,
    chargingZoneIntersectionKeys,
    toIntersectionKey,
} from './layout.js';
import {
    createRoadSurfaceTexture,
    createIntersectionTexture,
    createSidewalkTexture,
} from './textures.js';
import { hashGrid } from './grid-noise.js';

export function createRoadLayer() {
    const layer = new THREE.Group();
    layer.name = 'roadLayer';

    const roadWidth = ROAD_WIDTH;
    const sidewalkWidth = SIDEWALK_WIDTH;
    const roadLength = worldBounds.size + CITY_GRID_SPACING * 2;
    const roadExtentMin = -roadLength * 0.5;
    const roadExtentMax = roadLength * 0.5;
    const roadY = 0.028;
    const sidewalkY = 0.034;
    const medianY = roadY + 0.006;

    const xLineDescriptors = roadAxisLineDescriptors.xLines;
    const zLineDescriptors = roadAxisLineDescriptors.zLines;
    const xLineCoordinates = xLineDescriptors.map((line) => line.coordinate);
    const zLineCoordinates = zLineDescriptors.map((line) => line.coordinate);
    const intersectionGapHalfWidth = roadWidth * 0.5;
    const verticalSidewalkIntervals = buildSidewalkIntervals(
        zLineCoordinates,
        roadExtentMin,
        roadExtentMax,
        intersectionGapHalfWidth
    );
    const horizontalSidewalkIntervals = buildSidewalkIntervals(
        xLineCoordinates,
        roadExtentMin,
        roadExtentMax,
        intersectionGapHalfWidth
    );
    const roadMaterialSet = createRoadMaterialSet();
    const intersectionMaterialSet = createIntersectionMaterialSet();
    const sidewalkSurfaceTexture = createSidewalkTexture();

    const sidewalkMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: sidewalkSurfaceTexture,
        emissive: 0x2a3b52,
        emissiveMap: sidewalkSurfaceTexture,
        emissiveIntensity: 0.18,
        roughness: 0.9,
        metalness: 0.08,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
    });
    const medianMaterial = new THREE.MeshBasicMaterial({
        color: 0xe6c98c,
        transparent: true,
        opacity: 0.58,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const verticalRoadGeometry = new THREE.PlaneGeometry(roadWidth, roadLength);
    const horizontalRoadGeometry = new THREE.PlaneGeometry(roadLength, roadWidth);
    const intersectionGeometry = new THREE.PlaneGeometry(roadWidth + 0.08, roadWidth + 0.08);

    addAxisRoadMeshes({
        layer,
        lineDescriptors: xLineDescriptors,
        axis: 'vertical',
        roadGeometry: verticalRoadGeometry,
        roadY,
        roadWidth,
        sidewalkWidth,
        sidewalkY,
        sidewalkIntervals: verticalSidewalkIntervals,
        roadMaterialSet,
        sidewalkMaterial,
    });
    addAxisRoadMeshes({
        layer,
        lineDescriptors: zLineDescriptors,
        axis: 'horizontal',
        roadGeometry: horizontalRoadGeometry,
        roadY,
        roadWidth,
        sidewalkWidth,
        sidewalkY,
        sidewalkIntervals: horizontalSidewalkIntervals,
        roadMaterialSet,
        sidewalkMaterial,
    });

    addBoulevardMedians(
        layer,
        xLineDescriptors,
        verticalSidewalkIntervals,
        'vertical',
        medianY,
        medianMaterial
    );
    addBoulevardMedians(
        layer,
        zLineDescriptors,
        horizontalSidewalkIntervals,
        'horizontal',
        medianY,
        medianMaterial
    );

    addIntersectionPatches({
        layer,
        xLineDescriptors,
        zLineDescriptors,
        intersectionGeometry,
        intersectionMaterialSet,
        y: roadY + 0.004,
    });

    return layer;
}

function addAxisRoadMeshes({
    layer,
    lineDescriptors,
    axis = 'vertical',
    roadGeometry,
    roadY,
    roadWidth,
    sidewalkWidth,
    sidewalkY,
    sidewalkIntervals,
    roadMaterialSet,
    sidewalkMaterial,
}) {
    lineDescriptors.forEach((lineDescriptor) => {
        const styleSet = roadMaterialSet[lineDescriptor.styleKey] || roadMaterialSet.avenue;
        const roadMaterial = axis === 'vertical' ? styleSet.vertical : styleSet.horizontal;
        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.rotation.x = -Math.PI / 2;
        if (axis === 'vertical') {
            road.position.set(lineDescriptor.coordinate, roadY, 0);
        } else {
            road.position.set(0, roadY, lineDescriptor.coordinate);
        }
        layer.add(road);

        if (lineDescriptor.sidewalkMode === 'none') {
            return;
        }

        sidewalkIntervals.forEach(([segmentStart, segmentEnd]) => {
            const segmentLength = segmentEnd - segmentStart;
            if (segmentLength <= 0.04) {
                return;
            }
            const segmentCenter = (segmentStart + segmentEnd) * 0.5;
            if (axis === 'vertical') {
                addVerticalSidewalkPair({
                    layer,
                    lineCoordinate: lineDescriptor.coordinate,
                    segmentCenter,
                    segmentLength,
                    roadWidth,
                    sidewalkWidth,
                    sidewalkY,
                    sidewalkMaterial,
                });
                return;
            }
            addHorizontalSidewalkPair({
                layer,
                lineCoordinate: lineDescriptor.coordinate,
                segmentCenter,
                segmentLength,
                roadWidth,
                sidewalkWidth,
                sidewalkY,
                sidewalkMaterial,
            });
        });
    });
}

function addVerticalSidewalkPair({
    layer,
    lineCoordinate,
    segmentCenter,
    segmentLength,
    roadWidth,
    sidewalkWidth,
    sidewalkY,
    sidewalkMaterial,
}) {
    const west = new THREE.Mesh(
        new THREE.PlaneGeometry(sidewalkWidth, segmentLength),
        sidewalkMaterial
    );
    west.rotation.x = -Math.PI / 2;
    west.position.set(
        lineCoordinate - roadWidth * 0.5 - sidewalkWidth * 0.5,
        sidewalkY,
        segmentCenter
    );
    layer.add(west);

    const east = new THREE.Mesh(
        new THREE.PlaneGeometry(sidewalkWidth, segmentLength),
        sidewalkMaterial
    );
    east.rotation.x = -Math.PI / 2;
    east.position.set(
        lineCoordinate + roadWidth * 0.5 + sidewalkWidth * 0.5,
        sidewalkY,
        segmentCenter
    );
    layer.add(east);
}

function addHorizontalSidewalkPair({
    layer,
    lineCoordinate,
    segmentCenter,
    segmentLength,
    roadWidth,
    sidewalkWidth,
    sidewalkY,
    sidewalkMaterial,
}) {
    const north = new THREE.Mesh(
        new THREE.PlaneGeometry(segmentLength, sidewalkWidth),
        sidewalkMaterial
    );
    north.rotation.x = -Math.PI / 2;
    north.position.set(
        segmentCenter,
        sidewalkY,
        lineCoordinate - roadWidth * 0.5 - sidewalkWidth * 0.5
    );
    layer.add(north);

    const south = new THREE.Mesh(
        new THREE.PlaneGeometry(segmentLength, sidewalkWidth),
        sidewalkMaterial
    );
    south.rotation.x = -Math.PI / 2;
    south.position.set(
        segmentCenter,
        sidewalkY,
        lineCoordinate + roadWidth * 0.5 + sidewalkWidth * 0.5
    );
    layer.add(south);
}

function addIntersectionPatches({
    layer,
    xLineDescriptors,
    zLineDescriptors,
    intersectionGeometry,
    intersectionMaterialSet,
    y,
}) {
    xLineDescriptors.forEach((xLineDescriptor) => {
        zLineDescriptors.forEach((zLineDescriptor) => {
            const intersectionVariant = resolveIntersectionVariant(
                xLineDescriptor,
                zLineDescriptor
            );
            const patch = new THREE.Mesh(
                intersectionGeometry,
                intersectionMaterialSet[intersectionVariant]
            );
            patch.rotation.x = -Math.PI / 2;
            patch.position.set(xLineDescriptor.coordinate, y, zLineDescriptor.coordinate);
            layer.add(patch);
        });
    });
}

function createRoadMaterialSet() {
    const roadMaterialSet = {};
    const styleEntries = Object.entries(ROAD_STYLE_CONFIGS);

    styleEntries.forEach(([styleKey, style]) => {
        const verticalRoadTexture = createRoadSurfaceTexture(style.texture);
        const horizontalRoadTexture = verticalRoadTexture.clone();
        horizontalRoadTexture.center.set(0.5, 0.5);
        horizontalRoadTexture.rotation = Math.PI * 0.5;
        horizontalRoadTexture.needsUpdate = true;

        const emissiveColor =
            styleKey === 'boulevard' ? 0x1d3046 : styleKey === 'service' ? 0x142537 : 0x1a2a3b;
        const emissiveIntensity =
            styleKey === 'boulevard' ? 0.29 : styleKey === 'service' ? 0.2 : 0.24;

        const verticalMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: verticalRoadTexture,
            emissive: emissiveColor,
            emissiveMap: verticalRoadTexture,
            emissiveIntensity,
            roughness: 0.9,
            metalness: 0.05,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
        });
        const horizontalMaterial = verticalMaterial.clone();
        horizontalMaterial.map = horizontalRoadTexture;
        horizontalMaterial.emissiveMap = horizontalRoadTexture;
        horizontalMaterial.polygonOffsetFactor = -3;
        horizontalMaterial.polygonOffsetUnits = -3;

        roadMaterialSet[styleKey] = {
            vertical: verticalMaterial,
            horizontal: horizontalMaterial,
        };
    });

    return roadMaterialSet;
}

function createIntersectionMaterialSet() {
    const variants = ['boulevard', 'standard', 'minor', 'charging'];
    const materialSet = {};

    variants.forEach((variant) => {
        const texture = createIntersectionTexture({ variant });
        const emissiveColor =
            variant === 'charging' ? 0x1a4858 : variant === 'boulevard' ? 0x203249 : 0x152536;
        const emissiveIntensity = variant === 'charging' ? 0.36 : variant === 'minor' ? 0.24 : 0.31;
        materialSet[variant] = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: texture,
            emissive: emissiveColor,
            emissiveMap: texture,
            emissiveIntensity,
            roughness: 0.88,
            metalness: 0.06,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
        });
    });

    return materialSet;
}

function addBoulevardMedians(layer, lineDescriptors, intervals, orientation, y, medianMaterial) {
    lineDescriptors.forEach((lineDescriptor) => {
        if (lineDescriptor.styleKey !== 'boulevard') {
            return;
        }
        intervals.forEach(([segmentStart, segmentEnd]) => {
            const segmentLength = segmentEnd - segmentStart;
            if (segmentLength <= 8) {
                return;
            }
            const segmentCenter = (segmentStart + segmentEnd) * 0.5;
            if (orientation === 'vertical') {
                const median = new THREE.Mesh(
                    new THREE.PlaneGeometry(0.46, segmentLength * 0.72),
                    medianMaterial
                );
                median.rotation.x = -Math.PI / 2;
                median.position.set(lineDescriptor.coordinate, y, segmentCenter);
                layer.add(median);
                return;
            }

            const median = new THREE.Mesh(
                new THREE.PlaneGeometry(segmentLength * 0.72, 0.46),
                medianMaterial
            );
            median.rotation.x = -Math.PI / 2;
            median.position.set(segmentCenter, y, lineDescriptor.coordinate);
            layer.add(median);
        });
    });
}

function resolveIntersectionVariant(xLineDescriptor, zLineDescriptor) {
    const xStyle = xLineDescriptor.styleKey;
    const zStyle = zLineDescriptor.styleKey;
    const intersectionKey = toIntersectionKey(
        xLineDescriptor.coordinate,
        zLineDescriptor.coordinate
    );

    if (chargingZoneIntersectionKeys.has(intersectionKey)) {
        return 'charging';
    }
    if (xStyle === 'boulevard' || zStyle === 'boulevard') {
        return 'boulevard';
    }
    if (xStyle === 'service' || zStyle === 'service') {
        return 'minor';
    }

    const selector = hashGrid(xLineDescriptor.gridIndex, zLineDescriptor.gridIndex, 907) % 4;
    if (selector === 0) {
        return 'minor';
    }
    return 'standard';
}

function buildSidewalkIntervals(lineCoordinates, minCoordinate, maxCoordinate, gapHalfWidth) {
    const intervals = [];
    const gapPadding = 0.06;
    let cursor = minCoordinate;
    const sortedCoordinates = [...lineCoordinates].sort((a, b) => a - b);

    sortedCoordinates.forEach((lineCoordinate) => {
        const gapStart = Math.max(minCoordinate, lineCoordinate - gapHalfWidth - gapPadding);
        const gapEnd = Math.min(maxCoordinate, lineCoordinate + gapHalfWidth + gapPadding);
        if (gapStart - cursor > 0.04) {
            intervals.push([cursor, gapStart]);
        }
        cursor = Math.max(cursor, gapEnd);
    });

    if (maxCoordinate - cursor > 0.04) {
        intervals.push([cursor, maxCoordinate]);
    }

    return intervals;
}
