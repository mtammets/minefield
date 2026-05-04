import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { ROAD_STYLE_CONFIGS } from './config.js';
import { centralParkingLot, worldBounds } from './layout.js';
import { addObstacleAabb, addObstacleCircle } from './obstacles.js';
import { createRoadSurfaceTexture } from './textures.js';

const SURFACE_Y = 0;
const FLOOR_Y = -6.8;
const CEILING_BOTTOM_Y = -2.35;
const HEIGHT_CAPTURE_Y = -2.95;
const WALL_THICKNESS = 0.58;
const UNDERGROUND_WORLD_MARGIN = 9.5;
const ENTRANCE_TOP_Z = -56;
const ENTRANCE_BOTTOM_Z = -22;
const ENTRANCE_LANDING_END_Z = -16.8;
const ENTRANCE_CUTOUT_END_Z = -19.6;
const ENTRANCE_APPROACH_MIN_Z = ENTRANCE_TOP_Z - 5.2;
const ENTRANCE_SLOPE_START_Z = ENTRANCE_APPROACH_MIN_Z;
const ENTRANCE_DRIVE_HALF_WIDTH = 4.7;
const ENTRANCE_SURFACE_HALF_WIDTH = 5.35;
const ENTRANCE_WALL_HALF_WIDTH = 6.18;
const ENTRANCE_CUTOUT_HALF_WIDTH = 6.84;
const ENTRANCE_APRON_HALF_WIDTH = 8.45;
const ENTRANCE_FLARE_LENGTH = 10.8;
let portalSignTexture = null;
let parkingRoundelTexture = null;
const undergroundParkingRuntime = {
    barrierSystems: [],
};

export const UNDERGROUND_PARKING_LAYOUT = createUndergroundParkingLayout();

export function createUndergroundParkingLayer() {
    const layout = UNDERGROUND_PARKING_LAYOUT;
    const layer = new THREE.Group();
    layer.name = 'undergroundParkingLayer';
    undergroundParkingRuntime.barrierSystems.length = 0;

    const concreteMaterial = new THREE.MeshStandardMaterial({
        color: 0x1c2733,
        roughness: 0.9,
        metalness: 0.08,
        emissive: 0x07101a,
        emissiveIntensity: 0.14,
    });
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x2e4153,
        roughness: 0.82,
        metalness: 0.06,
        emissive: 0x091625,
        emissiveIntensity: 0.14,
    });
    const entranceRoadTexture = createRoadSurfaceTexture(ROAD_STYLE_CONFIGS.boulevard.texture);
    entranceRoadTexture.repeat.set(1, 8.6);
    entranceRoadTexture.anisotropy = 4;
    const entranceRoadMaterial = new THREE.MeshStandardMaterial({
        map: entranceRoadTexture,
        color: 0xffffff,
        roughness: 0.86,
        metalness: 0.04,
        emissive: 0x0b1520,
        emissiveIntensity: 0.1,
    });
    const glassWallMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xbfe7ff,
        roughness: 0.1,
        metalness: 0.02,
        transparent: true,
        opacity: 0.28,
        transmission: 0.58,
        thickness: 0.24,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        emissive: 0x143448,
        emissiveIntensity: 0.08,
        side: THREE.DoubleSide,
    });
    const glassRoofMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xd7efff,
        roughness: 0.06,
        metalness: 0.04,
        transparent: true,
        opacity: 0.44,
        transmission: 0.32,
        thickness: 0.36,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        emissive: 0x1b4a6a,
        emissiveIntensity: 0.18,
        side: THREE.DoubleSide,
    });
    const trimMaterial = new THREE.MeshStandardMaterial({
        color: 0xa7c3dd,
        roughness: 0.42,
        metalness: 0.34,
        emissive: 0x326896,
        emissiveIntensity: 0.18,
    });
    const portalAccentMaterial = new THREE.MeshStandardMaterial({
        color: 0x183149,
        roughness: 0.36,
        metalness: 0.26,
        emissive: 0x204f76,
        emissiveIntensity: 0.18,
    });
    const barrierPostMaterial = new THREE.MeshStandardMaterial({
        color: 0x1f3141,
        roughness: 0.48,
        metalness: 0.24,
        emissive: 0x112031,
        emissiveIntensity: 0.12,
    });
    const barrierArmMaterial = new THREE.MeshStandardMaterial({
        color: 0xf0f7ff,
        roughness: 0.28,
        metalness: 0.18,
        emissive: 0x142538,
        emissiveIntensity: 0.08,
    });
    const lightMaterial = new THREE.MeshBasicMaterial({
        color: 0xc9ebff,
        toneMapped: false,
    });
    const lineMaterial = new THREE.MeshBasicMaterial({
        color: 0xd9e8f6,
        transparent: true,
        opacity: 0.88,
        toneMapped: false,
    });
    const amberLineMaterial = new THREE.MeshBasicMaterial({
        color: 0xffcf82,
        transparent: true,
        opacity: 0.94,
        toneMapped: false,
    });
    layer.add(createParkingFloor(layout, floorMaterial));
    layer.add(createParkingCeiling(layout, concreteMaterial, trimMaterial, lightMaterial));
    layer.add(createPerimeterWalls(layout, concreteMaterial));
    layer.add(createSupportCore(layout, concreteMaterial, trimMaterial));
    layer.add(createSupportColumns(layout, concreteMaterial, trimMaterial));
    layer.add(createLightingLayer(layout, lightMaterial, trimMaterial));
    layer.add(createFloorMarkings(layout, lineMaterial));
    layer.add(
        createEntranceLayer(
            layout,
            entranceRoadMaterial,
            concreteMaterial,
            glassWallMaterial,
            glassRoofMaterial,
            trimMaterial,
            portalAccentMaterial,
            barrierPostMaterial,
            barrierArmMaterial,
            lightMaterial,
            lineMaterial,
            amberLineMaterial
        )
    );
    registerUndergroundParkingObstacles(layout);

    return layer;
}

export function updateUndergroundParkingRuntime(playerPosition, deltaTime = 1 / 60) {
    if (!undergroundParkingRuntime.barrierSystems.length) {
        return;
    }

    const dt = Math.min(Math.max(Number(deltaTime) || 0, 0), 0.1);
    const entrance = UNDERGROUND_PARKING_LAYOUT.entrance;
    const playerX = Number(playerPosition?.x);
    const playerZ = Number(playerPosition?.z);
    const hasPlayer = Number.isFinite(playerX) && Number.isFinite(playerZ);

    undergroundParkingRuntime.barrierSystems.forEach((system) => {
        const withinDriveBand =
            hasPlayer &&
            Math.abs(playerX - entrance.centerX) <= entrance.driveHalfWidth + 0.95 &&
            playerZ >= entrance.slopeStartZ - 10.5 &&
            playerZ <= entrance.landingEndZ + 7.5;
        const shouldOpen =
            withinDriveBand && Math.abs(playerZ - system.triggerZ) <= system.triggerRadius;
        const targetOpen = shouldOpen ? 1 : 0;
        const blend = dt > 0 ? 1 - Math.exp(-system.response * dt) : 1;
        system.openAmount += (targetOpen - system.openAmount) * blend;
        system.leftPivot.rotation.z = system.maxAngle * system.openAmount;
        system.rightPivot.rotation.z = -system.maxAngle * system.openAmount;

        if (system.openIndicator && system.closedIndicator) {
            system.openIndicator.visible = system.openAmount >= 0.55;
            system.closedIndicator.visible = system.openAmount < 0.55;
        }
    });
}

export function sampleUndergroundParkingHeightWorld(x, z) {
    const layout = UNDERGROUND_PARKING_LAYOUT;
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
        return null;
    }

    const entranceHeight = sampleUndergroundParkingEntranceHeightWorld(x, z);
    if (Number.isFinite(entranceHeight)) {
        return entranceHeight;
    }

    if (
        x >= layout.floorMinX &&
        x <= layout.floorMaxX &&
        z >= layout.floorMinZ &&
        z <= layout.floorMaxZ
    ) {
        return layout.floorY;
    }

    return null;
}

export function shouldUseUndergroundParkingHeight(
    preferredY = null,
    x = 0,
    z = 0,
    undergroundHeight = null
) {
    if (isInsideUndergroundParkingEntranceRampCorridor(x, z, 0.18)) {
        return Number.isFinite(preferredY);
    }
    if (!Number.isFinite(preferredY)) {
        return false;
    }

    const sampledHeight = Number.isFinite(undergroundHeight)
        ? undergroundHeight
        : sampleUndergroundParkingHeightWorld(x, z);
    if (!Number.isFinite(sampledHeight)) {
        return false;
    }

    return preferredY <= HEIGHT_CAPTURE_Y;
}

export function getUndergroundParkingSilenceFactorWorld(x, y, z) {
    const layout = UNDERGROUND_PARKING_LAYOUT;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return 0;
    }
    if (
        y > -0.35 ||
        y < layout.floorY - 0.9 ||
        x < layout.floorMinX ||
        x > layout.floorMaxX ||
        z < layout.floorMinZ ||
        z > layout.floorMaxZ
    ) {
        return 0;
    }

    const roofFactor =
        1 - normalizedRange(y, layout.ceilingBottomY - 0.28, layout.ceilingBottomY + 1.12);
    const depthBelowSurfaceFactor = normalizedRange(-y, 1.1, Math.abs(layout.floorY) - 0.6);
    if (roofFactor <= 0 || depthBelowSurfaceFactor <= 0) {
        return 0;
    }

    const sideClearance = Math.min(x - layout.floorMinX, layout.floorMaxX - x);
    const endClearance = Math.min(z - layout.floorMinZ, layout.floorMaxZ - z);
    const lateralFactor = normalizedRange(sideClearance, 0.8, 5.2);
    const longitudinalFactor = normalizedRange(endClearance, 0.8, 5.2);

    return smoothstep01(
        clamp01(Math.min(lateralFactor, longitudinalFactor, roofFactor) * depthBelowSurfaceFactor)
    );
}

export function isInsideUndergroundParkingEntranceRampCorridor(x, z, padding = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
        return false;
    }
    const entrance = UNDERGROUND_PARKING_LAYOUT.entrance;
    const extraPadding = Math.max(0, Number(padding) || 0);
    if (z < entrance.slopeStartZ || z > entrance.landingEndZ + extraPadding) {
        return false;
    }

    return (
        Math.abs(x - entrance.centerX) <=
        getEntranceHalfWidthAtZ(entrance, z, 'surface') + extraPadding
    );
}

export function isInsideUndergroundParkingEntranceFootprint(x, z, padding = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
        return false;
    }
    const entrance = UNDERGROUND_PARKING_LAYOUT.entrance;
    const extraPadding = Math.max(0, Number(padding) || 0);
    if (z < entrance.approachMinZ - extraPadding || z > entrance.landingEndZ + extraPadding) {
        return false;
    }

    return (
        Math.abs(x - entrance.centerX) <=
        getEntranceHalfWidthAtZ(entrance, z, 'apron') + extraPadding
    );
}

export function constrainPositionToUndergroundParkingDriveBounds(
    position,
    previousPosition = null
) {
    if (
        !position ||
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y) ||
        !Number.isFinite(position.z)
    ) {
        return null;
    }

    if (!isInsideUndergroundParkingCanopyFootprint(position.x, position.z, 0.08)) {
        return null;
    }

    const layout = UNDERGROUND_PARKING_LAYOUT;
    const rampHeight = resolveUndergroundEntranceHeightByZ(layout, position.z);
    if (position.y <= rampHeight + 0.72) {
        return null;
    }

    if (
        previousPosition &&
        Number.isFinite(previousPosition.x) &&
        Number.isFinite(previousPosition.z)
    ) {
        position.x = previousPosition.x;
        position.z = previousPosition.z;
    } else {
        position.x = layout.entrance.centerX;
        position.z = layout.entrance.canopyStartZ - 0.6;
    }

    return { mode: 'illegal_entry' };
}

function createUndergroundParkingLayout() {
    const floorMinX = worldBounds.minX + UNDERGROUND_WORLD_MARGIN;
    const floorMaxX = worldBounds.maxX - UNDERGROUND_WORLD_MARGIN;
    const floorMinZ = worldBounds.minZ + UNDERGROUND_WORLD_MARGIN;
    const floorMaxZ = worldBounds.maxZ - UNDERGROUND_WORLD_MARGIN;
    const coreRadius = 7.2;

    return {
        centerX: centralParkingLot.centerX,
        centerZ: centralParkingLot.centerZ,
        surfaceY: SURFACE_Y,
        floorY: FLOOR_Y,
        ceilingBottomY: CEILING_BOTTOM_Y,
        floorMinX,
        floorMaxX,
        floorMinZ,
        floorMaxZ,
        floorWidth: floorMaxX - floorMinX,
        floorDepth: floorMaxZ - floorMinZ,
        coreCenterX: centralParkingLot.centerX,
        coreCenterZ: centralParkingLot.centerZ,
        coreRadius,
        entrance: {
            centerX: centralParkingLot.centerX,
            topZ: ENTRANCE_TOP_Z,
            bottomZ: ENTRANCE_BOTTOM_Z,
            landingEndZ: ENTRANCE_LANDING_END_Z,
            cutoutEndZ: ENTRANCE_CUTOUT_END_Z,
            approachMinZ: ENTRANCE_APPROACH_MIN_Z,
            slopeStartZ: ENTRANCE_SLOPE_START_Z,
            driveHalfWidth: ENTRANCE_DRIVE_HALF_WIDTH,
            surfaceHalfWidth: ENTRANCE_SURFACE_HALF_WIDTH,
            wallHalfWidth: ENTRANCE_WALL_HALF_WIDTH,
            cutoutHalfWidth: ENTRANCE_CUTOUT_HALF_WIDTH,
            apronHalfWidth: ENTRANCE_APRON_HALF_WIDTH,
            flareLength: ENTRANCE_FLARE_LENGTH,
            driveTopFlareExtra: 0.34,
            surfaceTopFlareExtra: 0.62,
            wallTopFlareExtra: 0.84,
            cutoutTopFlareExtra: 1.12,
            apronTopFlareExtra: 1.8,
            portalClearHeight: 5.35,
            portalZ: ENTRANCE_APPROACH_MIN_Z + 2.6,
            portalWingDepth: 4.2,
            portalWingThickness: 0.76,
            canopyStartZ: ENTRANCE_SLOPE_START_Z + 1.1,
            canopyEndZ: ENTRANCE_BOTTOM_Z + 3.2,
            canopyHalfWidth: ENTRANCE_WALL_HALF_WIDTH - 0.2,
            canopyBaseY: 3.9,
            canopyArchRise: 1.1,
            tunnelLightStartZ: ENTRANCE_BOTTOM_Z + 0.8,
            tunnelLightSpacing: 1.9,
            tunnelLightCount: 3,
            renderOffsetY: 0.024,
        },
    };
}

function createParkingFloor(layout, material) {
    const floorThickness = 0.28;
    const slab = new THREE.Mesh(
        new THREE.BoxGeometry(layout.floorWidth, floorThickness, layout.floorDepth),
        material
    );
    slab.position.set(
        (layout.floorMinX + layout.floorMaxX) * 0.5,
        layout.floorY - floorThickness * 0.5,
        (layout.floorMinZ + layout.floorMaxZ) * 0.5
    );
    return slab;
}

function createParkingCeiling(layout, material, trimMaterial, lightMaterial) {
    const group = new THREE.Group();
    group.name = 'undergroundParkingCeiling';

    const slabThickness = 0.3;
    const entrance = layout.entrance;
    const cutoutHalfWidth = getEntranceHalfWidthAtZ(entrance, entrance.slopeStartZ, 'wall') + 0.85;
    const cutoutMinX = entrance.centerX - cutoutHalfWidth;
    const cutoutMaxX = entrance.centerX + cutoutHalfWidth;
    const cutoutMinZ = entrance.slopeStartZ - 0.55;
    const cutoutMaxZ = entrance.cutoutEndZ + 0.42;

    addCeilingSection(
        group,
        material,
        layout.floorMinX,
        cutoutMinX,
        layout.floorMinZ,
        layout.floorMaxZ,
        slabThickness,
        layout.ceilingBottomY
    );
    addCeilingSection(
        group,
        material,
        cutoutMaxX,
        layout.floorMaxX,
        layout.floorMinZ,
        layout.floorMaxZ,
        slabThickness,
        layout.ceilingBottomY
    );
    addCeilingSection(
        group,
        material,
        cutoutMinX,
        cutoutMaxX,
        layout.floorMinZ,
        cutoutMinZ,
        slabThickness,
        layout.ceilingBottomY
    );
    addCeilingSection(
        group,
        material,
        cutoutMinX,
        cutoutMaxX,
        cutoutMaxZ,
        layout.floorMaxZ,
        slabThickness,
        layout.ceilingBottomY
    );

    const trimThickness = 0.16;
    const trimHeight = 0.08;
    const trimY = layout.ceilingBottomY + trimHeight * 0.5;
    const cutoutDepth = cutoutMaxZ - cutoutMinZ;
    const cutoutWidth = cutoutMaxX - cutoutMinX;

    const westTrim = new THREE.Mesh(
        new THREE.BoxGeometry(trimThickness, trimHeight, cutoutDepth + 0.12),
        trimMaterial
    );
    westTrim.position.set(cutoutMinX - trimThickness * 0.5, trimY, (cutoutMinZ + cutoutMaxZ) * 0.5);
    group.add(westTrim);

    const eastTrim = westTrim.clone();
    eastTrim.position.x = cutoutMaxX + trimThickness * 0.5;
    group.add(eastTrim);

    const southTrim = new THREE.Mesh(
        new THREE.BoxGeometry(cutoutWidth, trimHeight, trimThickness),
        trimMaterial
    );
    southTrim.position.set(
        (cutoutMinX + cutoutMaxX) * 0.5,
        trimY,
        cutoutMinZ - trimThickness * 0.5
    );
    group.add(southTrim);

    const northTrim = southTrim.clone();
    northTrim.position.z = cutoutMaxZ + trimThickness * 0.5;
    group.add(northTrim);

    const edgeGlow = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.04, cutoutDepth * 0.8),
        lightMaterial
    );
    edgeGlow.position.set(
        cutoutMaxX - 0.2,
        layout.ceilingBottomY + 0.08,
        (cutoutMinZ + cutoutMaxZ) * 0.5
    );
    group.add(edgeGlow);

    const mirroredGlow = edgeGlow.clone();
    mirroredGlow.position.x = cutoutMinX + 0.2;
    group.add(mirroredGlow);

    return group;
}

function addCeilingSection(group, material, minX, maxX, minZ, maxZ, slabThickness, ceilingBottomY) {
    const width = maxX - minX;
    const depth = maxZ - minZ;
    if (width <= 0.2 || depth <= 0.2) {
        return;
    }

    const slab = new THREE.Mesh(new THREE.BoxGeometry(width, slabThickness, depth), material);
    slab.position.set(
        (minX + maxX) * 0.5,
        ceilingBottomY + slabThickness * 0.5,
        (minZ + maxZ) * 0.5
    );
    group.add(slab);
}

function createPerimeterWalls(layout, material) {
    const group = new THREE.Group();
    group.name = 'undergroundParkingWalls';
    const wallHeight = layout.ceilingBottomY - layout.floorY + 0.34;
    const wallY = layout.floorY + wallHeight * 0.5 - 0.04;

    const westWall = new THREE.Mesh(
        new THREE.BoxGeometry(WALL_THICKNESS, wallHeight, layout.floorDepth + WALL_THICKNESS * 2),
        material
    );
    westWall.position.set(
        layout.floorMinX - WALL_THICKNESS * 0.5,
        wallY,
        (layout.floorMinZ + layout.floorMaxZ) * 0.5
    );
    group.add(westWall);

    const eastWall = westWall.clone();
    eastWall.position.x = layout.floorMaxX + WALL_THICKNESS * 0.5;
    group.add(eastWall);

    const southWall = new THREE.Mesh(
        new THREE.BoxGeometry(layout.floorWidth + WALL_THICKNESS * 2, wallHeight, WALL_THICKNESS),
        material
    );
    southWall.position.set(
        (layout.floorMinX + layout.floorMaxX) * 0.5,
        wallY,
        layout.floorMinZ - WALL_THICKNESS * 0.5
    );
    group.add(southWall);

    const northWall = southWall.clone();
    northWall.position.z = layout.floorMaxZ + WALL_THICKNESS * 0.5;
    group.add(northWall);

    return group;
}

function createSupportCore(layout, shellMaterial, trimMaterial) {
    const group = new THREE.Group();
    group.name = 'undergroundParkingCore';
    const coreHeight = layout.ceilingBottomY - layout.floorY + 0.3;
    const core = new THREE.Mesh(
        new THREE.CylinderGeometry(layout.coreRadius, layout.coreRadius + 0.24, coreHeight, 24),
        shellMaterial
    );
    core.position.set(
        layout.coreCenterX,
        layout.floorY + coreHeight * 0.5 - 0.04,
        layout.coreCenterZ
    );
    group.add(core);

    const halo = new THREE.Mesh(
        new THREE.TorusGeometry(layout.coreRadius + 0.36, 0.12, 10, 32),
        trimMaterial
    );
    halo.rotation.x = Math.PI * 0.5;
    halo.position.set(layout.coreCenterX, layout.ceilingBottomY - 0.24, layout.coreCenterZ);
    group.add(halo);

    return group;
}

function createSupportColumns(layout, shellMaterial, trimMaterial) {
    const group = new THREE.Group();
    group.name = 'undergroundParkingColumns';
    const columnHeight = layout.ceilingBottomY - layout.floorY - 0.18;
    const columnY = layout.floorY + columnHeight * 0.5;
    const shaftGeometry = new THREE.CylinderGeometry(0.5, 0.56, columnHeight, 12);
    const capGeometry = new THREE.CylinderGeometry(0.68, 0.68, 0.12, 12);

    getColumnPositions(layout).forEach(([x, z]) => {
        const shaft = new THREE.Mesh(shaftGeometry, shellMaterial);
        shaft.position.set(x, columnY, z);
        group.add(shaft);

        const cap = new THREE.Mesh(capGeometry, trimMaterial);
        cap.position.set(x, layout.ceilingBottomY - 0.06, z);
        group.add(cap);
    });

    return group;
}

function createLightingLayer(layout, lightMaterial, trimMaterial) {
    const group = new THREE.Group();
    group.name = 'undergroundParkingLights';
    const lightBarGeometry = new THREE.BoxGeometry(0.34, 0.08, 7.2);
    const xPositions = [layout.floorMinX + 18, layout.centerX, layout.floorMaxX - 18];
    const zPositions = [layout.floorMinZ + 18, layout.centerZ, layout.floorMaxZ - 18];

    xPositions.forEach((x) => {
        zPositions.forEach((z) => {
            const lightBar = new THREE.Mesh(lightBarGeometry, lightMaterial);
            lightBar.position.set(x, layout.ceilingBottomY - 0.14, z);
            group.add(lightBar);
        });
    });

    const sideGlow = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, layout.floorDepth * 0.62),
        trimMaterial
    );
    sideGlow.position.set(
        layout.floorMaxX - 1.05,
        layout.floorY + 0.72,
        (layout.floorMinZ + layout.floorMaxZ) * 0.5
    );
    group.add(sideGlow);

    const mirroredGlow = sideGlow.clone();
    mirroredGlow.position.x = layout.floorMinX + 1.05;
    group.add(mirroredGlow);

    return group;
}

function createFloorMarkings(layout, material) {
    const group = new THREE.Group();
    group.name = 'undergroundParkingMarkings';
    const lineY = layout.floorY + 0.02;

    const northSouthLane = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.02, layout.floorDepth * 0.74),
        material
    );
    northSouthLane.position.set(layout.centerX, lineY, (layout.floorMinZ + layout.floorMaxZ) * 0.5);
    group.add(northSouthLane);

    const eastWestLane = new THREE.Mesh(
        new THREE.BoxGeometry(layout.floorWidth * 0.74, 0.02, 0.18),
        material
    );
    eastWestLane.position.set(layout.centerX, lineY, layout.centerZ);
    group.add(eastWestLane);

    addParkingBayGroup(group, layout.floorMinX + 5.2, layout.floorMinZ + 8.4, 8, 1, material);
    addParkingBayGroup(group, layout.floorMaxX - 5.2, layout.floorMinZ + 8.4, 8, -1, material);
    addParkingBayGroup(group, layout.floorMinX + 5.2, layout.floorMaxZ - 40.2, 8, 1, material);
    addParkingBayGroup(group, layout.floorMaxX - 5.2, layout.floorMaxZ - 40.2, 8, -1, material);

    return group;
}

function createEntranceLayer(
    layout,
    roadMaterial,
    concreteMaterial,
    glassWallMaterial,
    glassRoofMaterial,
    trimMaterial,
    portalAccentMaterial,
    barrierPostMaterial,
    barrierArmMaterial,
    lightMaterial,
    lineMaterial,
    amberLineMaterial
) {
    const group = new THREE.Group();
    group.name = 'undergroundParkingEntrance';

    group.add(createEntranceRampSurface(layout, roadMaterial));
    group.add(createEntranceRetainingWalls(layout, concreteMaterial, trimMaterial, lightMaterial));
    group.add(createEntranceFrontShoulderGuards(layout, concreteMaterial, trimMaterial));
    group.add(
        createEntrancePortalFrame(layout, portalAccentMaterial, trimMaterial, amberLineMaterial)
    );
    group.add(
        createEntranceGlassCanopy(
            layout,
            glassRoofMaterial,
            glassWallMaterial,
            trimMaterial,
            lightMaterial
        )
    );
    group.add(createEntranceAutoBarriers(layout, barrierPostMaterial, barrierArmMaterial));
    group.add(createEntranceSignage(layout));
    group.add(createEntranceLighting(layout, lightMaterial, trimMaterial));
    group.add(createEntranceMarkings(layout, lineMaterial, amberLineMaterial));

    return group;
}

function createEntranceRampSurface(layout, material) {
    const entrance = layout.entrance;
    const geometry = createEntranceSurfaceGeometry(layout, {
        width: entrance.wallHalfWidth * 2 - WALL_THICKNESS * 0.28,
        minZ: entrance.slopeStartZ,
        maxZ: entrance.landingEndZ,
        xSegments: 12,
        zSegments: 84,
        heightOffset: entrance.renderOffsetY,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    return mesh;
}

function createEntranceRetainingWalls(layout, concreteMaterial, trimMaterial, lightMaterial) {
    const entrance = layout.entrance;
    const group = new THREE.Group();
    group.name = 'undergroundParkingEntranceWalls';

    const wallStartZ = entrance.slopeStartZ - 0.18;
    const segmentCount = 20;
    const wallDepth = (entrance.landingEndZ - wallStartZ) / segmentCount;
    const topY = 1.08;
    const wallGeometry = new THREE.BoxGeometry(WALL_THICKNESS, 1, wallDepth + 0.14);
    const capGeometry = new THREE.BoxGeometry(0.88, 0.12, wallDepth);
    const stripGeometry = new THREE.BoxGeometry(0.08, 0.05, Math.max(1.2, wallDepth - 0.34));

    for (let side = -1; side <= 1; side += 2) {
        for (let index = 0; index < segmentCount; index += 1) {
            const startZ = wallStartZ + index * wallDepth;
            const centerZ = startZ + wallDepth * 0.5;
            const rampHeight = resolveUndergroundEntranceHeightByZ(layout, centerZ);
            const wallHeight = Math.max(1.38, topY - rampHeight + 0.22);
            const wall = new THREE.Mesh(wallGeometry.clone(), concreteMaterial);
            wall.scale.y = wallHeight;
            wall.position.set(
                entrance.centerX +
                    side *
                        (getEntranceHalfWidthAtZ(entrance, centerZ, 'wall') - WALL_THICKNESS * 0.5),
                rampHeight + wallHeight * 0.5 - 0.04,
                centerZ
            );
            group.add(wall);

            const cap = new THREE.Mesh(capGeometry, trimMaterial);
            cap.position.set(
                entrance.centerX + side * getEntranceHalfWidthAtZ(entrance, centerZ, 'wall'),
                topY + 0.02,
                centerZ
            );
            group.add(cap);

            const strip = new THREE.Mesh(stripGeometry, lightMaterial);
            strip.position.set(
                entrance.centerX +
                    side * (getEntranceHalfWidthAtZ(entrance, centerZ, 'surface') + 0.18),
                Math.min(topY - 0.26, rampHeight + Math.max(0.86, wallHeight * 0.72)),
                centerZ
            );
            group.add(strip);
        }
    }

    return group;
}

function createEntranceFrontShoulderGuards(layout, concreteMaterial, trimMaterial) {
    const entrance = layout.entrance;
    const group = new THREE.Group();
    group.name = 'undergroundParkingEntranceShoulderGuards';

    const shoulderWidth = Math.max(1.4, entrance.wallHalfWidth - entrance.driveHalfWidth - 0.22);
    const guardStartZ = entrance.slopeStartZ + 0.75;
    const guardEndZ = entrance.topZ + 1.35;
    const guardDepth = Math.max(1.6, guardEndZ - guardStartZ);
    const guardCenterZ = (guardStartZ + guardEndZ) * 0.5;
    const guardHeight = 0.86;
    const guardGeometry = new THREE.BoxGeometry(shoulderWidth, guardHeight, guardDepth);
    const capGeometry = new THREE.BoxGeometry(shoulderWidth + 0.18, 0.08, guardDepth + 0.12);

    for (let side = -1; side <= 1; side += 2) {
        const guard = new THREE.Mesh(guardGeometry, concreteMaterial);
        guard.position.set(
            entrance.centerX +
                side * (entrance.driveHalfWidth + shoulderWidth * 0.5 + WALL_THICKNESS * 0.45),
            guardHeight * 0.5 - 0.04,
            guardCenterZ
        );
        group.add(guard);

        const cap = new THREE.Mesh(capGeometry, trimMaterial);
        cap.position.set(guard.position.x, guardHeight + 0.04, guardCenterZ);
        group.add(cap);
    }

    return group;
}

function createEntranceGlassCanopy(
    layout,
    roofGlassMaterial,
    wallGlassMaterial,
    trimMaterial,
    lightMaterial
) {
    const entrance = layout.entrance;
    const group = new THREE.Group();
    group.name = 'undergroundParkingEntranceGlassCanopy';

    const canopyShell = new THREE.Mesh(
        createEntranceCanopyGeometry(layout, {
            width: entrance.canopyHalfWidth * 2,
            minZ: entrance.canopyStartZ,
            maxZ: entrance.canopyEndZ,
            xSegments: 24,
            zSegments: 28,
            baseY: entrance.canopyBaseY,
            archRise: entrance.canopyArchRise,
        }),
        roofGlassMaterial
    );
    group.add(canopyShell);

    const innerCanopyShell = new THREE.Mesh(
        createEntranceCanopyGeometry(layout, {
            width: entrance.canopyHalfWidth * 2 - 0.18,
            minZ: entrance.canopyStartZ + 0.12,
            maxZ: entrance.canopyEndZ - 0.12,
            xSegments: 24,
            zSegments: 28,
            baseY: entrance.canopyBaseY - 0.08,
            archRise: Math.max(0.24, entrance.canopyArchRise - 0.1),
        }),
        roofGlassMaterial
    );
    group.add(innerCanopyShell);

    for (let z = entrance.canopyStartZ + 0.8; z < entrance.canopyEndZ - 0.4; z += 3.4) {
        const rib = new THREE.Mesh(
            createEntranceCanopyGeometry(layout, {
                width: entrance.canopyHalfWidth * 2 + 0.16,
                minZ: z - 0.09,
                maxZ: z + 0.09,
                xSegments: 20,
                zSegments: 1,
                baseY: entrance.canopyBaseY + 0.02,
                archRise: entrance.canopyArchRise + 0.04,
            }),
            trimMaterial
        );
        group.add(rib);

        const interiorRib = new THREE.Mesh(
            createEntranceCanopyGeometry(layout, {
                width: entrance.canopyHalfWidth * 2 - 0.18,
                minZ: z - 0.08,
                maxZ: z + 0.08,
                xSegments: 20,
                zSegments: 1,
                baseY: entrance.canopyBaseY - 0.14,
                archRise: Math.max(0.18, entrance.canopyArchRise - 0.12),
            }),
            trimMaterial
        );
        group.add(interiorRib);
    }

    const edgeOffset = entrance.canopyHalfWidth - 0.16;
    for (let side = -1; side <= 1; side += 2) {
        const edgeBeam = new THREE.Mesh(
            createEntranceCanopyGeometry(layout, {
                width: 0.16,
                minZ: entrance.canopyStartZ + 0.2,
                maxZ: entrance.canopyEndZ - 0.18,
                centerXOffset: side * edgeOffset,
                xSegments: 1,
                zSegments: 20,
                baseY: entrance.canopyBaseY + 0.04,
                archRise: 0.14,
            }),
            trimMaterial
        );
        group.add(edgeBeam);

        const edgeGlow = new THREE.Mesh(
            createEntranceCanopyGeometry(layout, {
                width: 0.06,
                minZ: entrance.canopyStartZ + 0.45,
                maxZ: entrance.canopyEndZ - 0.34,
                centerXOffset: side * edgeOffset,
                xSegments: 1,
                zSegments: 18,
                baseY: entrance.canopyBaseY + 0.08,
                archRise: 0.08,
            }),
            lightMaterial
        );
        group.add(edgeGlow);
    }

    [-entrance.canopyHalfWidth * 0.34, 0, entrance.canopyHalfWidth * 0.34].forEach(
        (centerXOffset, index) => {
            const roofSpine = new THREE.Mesh(
                createEntranceCanopyGeometry(layout, {
                    width: index === 1 ? 0.14 : 0.1,
                    minZ: entrance.canopyStartZ + 0.32,
                    maxZ: entrance.canopyEndZ - 0.28,
                    centerXOffset,
                    xSegments: 1,
                    zSegments: 20,
                    baseY: entrance.canopyBaseY - 0.12,
                    archRise: Math.max(0.16, entrance.canopyArchRise - 0.14),
                }),
                index === 1 ? lightMaterial : trimMaterial
            );
            group.add(roofSpine);
        }
    );

    const endFrameDepth = 0.18;
    [entrance.canopyStartZ + 0.18, entrance.canopyEndZ - 0.18].forEach((z) => {
        const endFrame = new THREE.Mesh(
            createEntranceCanopyGeometry(layout, {
                width: entrance.canopyHalfWidth * 2 + 0.22,
                minZ: z - endFrameDepth * 0.5,
                maxZ: z + endFrameDepth * 0.5,
                xSegments: 22,
                zSegments: 1,
                baseY: entrance.canopyBaseY + 0.02,
                archRise: entrance.canopyArchRise + 0.06,
            }),
            trimMaterial
        );
        group.add(endFrame);
    });

    group.add(
        createEntranceGlassAtriumWalls(layout, wallGlassMaterial, trimMaterial, lightMaterial)
    );

    return group;
}

function createEntranceGlassAtriumWalls(layout, glassMaterial, trimMaterial, lightMaterial) {
    const entrance = layout.entrance;
    const group = new THREE.Group();
    group.name = 'undergroundParkingEntranceGlassAtriumWalls';

    const wallBaseY = 1.12;
    const wallTopY = entrance.canopyBaseY - 0.04;
    const wallHeight = Math.max(1.8, wallTopY - wallBaseY);
    const wallDepth = Math.max(4, entrance.canopyEndZ - entrance.canopyStartZ - 0.28);
    const wallCenterZ = (entrance.canopyStartZ + entrance.canopyEndZ) * 0.5;
    const wallThickness = 0.08;
    const sideX = entrance.centerX + entrance.canopyHalfWidth - wallThickness * 0.5;

    for (let side = -1; side <= 1; side += 2) {
        const glassWall = new THREE.Mesh(
            new THREE.BoxGeometry(wallThickness, wallHeight, wallDepth),
            glassMaterial
        );
        glassWall.position.set(sideX * side, wallBaseY + wallHeight * 0.5, wallCenterZ);
        group.add(glassWall);

        const topRail = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.12, wallDepth + 0.12),
            trimMaterial
        );
        topRail.position.set(sideX * side, wallTopY + 0.02, wallCenterZ);
        group.add(topRail);

        const bottomRail = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.08, wallDepth + 0.12),
            trimMaterial
        );
        bottomRail.position.set(sideX * side, wallBaseY - 0.02, wallCenterZ);
        group.add(bottomRail);

        for (let z = entrance.canopyStartZ + 1.2; z < entrance.canopyEndZ - 0.6; z += 3.2) {
            const mullion = new THREE.Mesh(
                new THREE.BoxGeometry(0.14, wallHeight + 0.08, 0.08),
                trimMaterial
            );
            mullion.position.set(sideX * side, wallBaseY + wallHeight * 0.5, z);
            group.add(mullion);
        }

        const sideGlow = new THREE.Mesh(
            new THREE.BoxGeometry(0.03, wallHeight - 0.18, 0.04),
            lightMaterial
        );
        sideGlow.position.set(
            sideX * side,
            wallBaseY + wallHeight * 0.5,
            entrance.canopyStartZ + 1
        );
        group.add(sideGlow);
    }

    const portalHeight = wallHeight + 0.2;
    const portalWidth = entrance.canopyHalfWidth * 2 - 0.3;
    const endFrameDepth = 0.08;
    const rearGlass = new THREE.Mesh(
        new THREE.BoxGeometry(portalWidth, portalHeight, endFrameDepth),
        glassMaterial
    );
    rearGlass.position.set(
        entrance.centerX,
        wallBaseY + portalHeight * 0.5 - 0.02,
        entrance.canopyEndZ - 0.02
    );
    group.add(rearGlass);

    const rearHead = new THREE.Mesh(
        new THREE.BoxGeometry(portalWidth + 0.2, 0.12, 0.12),
        trimMaterial
    );
    rearHead.position.set(entrance.centerX, wallTopY + 0.02, entrance.canopyEndZ);
    group.add(rearHead);

    const rearGlow = new THREE.Mesh(
        new THREE.BoxGeometry(portalWidth - 0.42, 0.03, 0.03),
        lightMaterial
    );
    rearGlow.position.set(entrance.centerX, wallTopY - 0.14, entrance.canopyEndZ - 0.03);
    group.add(rearGlow);

    const frontShoulderWidth = Math.max(
        1.24,
        entrance.canopyHalfWidth - entrance.driveHalfWidth - 0.12
    );
    const frontShoulderX = entrance.driveHalfWidth + frontShoulderWidth * 0.5 - wallThickness * 0.2;
    const frontClosureZ = entrance.canopyStartZ + endFrameDepth * 0.5;
    for (let side = -1; side <= 1; side += 2) {
        const frontGlass = new THREE.Mesh(
            new THREE.BoxGeometry(frontShoulderWidth, portalHeight, endFrameDepth),
            glassMaterial
        );
        frontGlass.position.set(
            entrance.centerX + side * frontShoulderX,
            wallBaseY + portalHeight * 0.5 - 0.02,
            frontClosureZ
        );
        group.add(frontGlass);

        const frontHead = new THREE.Mesh(
            new THREE.BoxGeometry(frontShoulderWidth + 0.16, 0.12, 0.12),
            trimMaterial
        );
        frontHead.position.set(
            entrance.centerX + side * frontShoulderX,
            wallTopY + 0.02,
            entrance.canopyStartZ
        );
        group.add(frontHead);
    }

    return group;
}

function createEntranceAutoBarriers(layout, postMaterial, armMaterial) {
    const entrance = layout.entrance;
    const group = new THREE.Group();
    group.name = 'undergroundParkingEntranceBarriers';

    const barrierZ = entrance.portalZ + 0.7;
    const pedestalGeometry = new THREE.BoxGeometry(0.48, 1.02, 0.78);
    const pedestalCapGeometry = new THREE.BoxGeometry(0.56, 0.08, 0.88);
    const armLength = entrance.driveHalfWidth - 0.52;
    const armGeometry = new THREE.BoxGeometry(armLength, 0.12, 0.16);
    const stripeMaterial = new THREE.MeshBasicMaterial({
        color: 0xff7368,
        toneMapped: false,
    });
    const greenLightMaterial = new THREE.MeshBasicMaterial({
        color: 0x8cf7be,
        toneMapped: false,
    });
    const redLightMaterial = new THREE.MeshBasicMaterial({
        color: 0xff7368,
        toneMapped: false,
    });

    const leftBaseX = entrance.centerX - entrance.driveHalfWidth + 0.34;
    const rightBaseX = entrance.centerX + entrance.driveHalfWidth - 0.34;
    const pedestalY = 0.48;
    const pivotY = 1;
    const leftPedestal = new THREE.Mesh(pedestalGeometry, postMaterial);
    leftPedestal.position.set(leftBaseX, pedestalY, barrierZ);
    group.add(leftPedestal);

    const leftCap = new THREE.Mesh(pedestalCapGeometry, postMaterial);
    leftCap.position.set(leftBaseX, 1.02, barrierZ);
    group.add(leftCap);

    const rightPedestal = leftPedestal.clone();
    rightPedestal.position.x = rightBaseX;
    group.add(rightPedestal);

    const rightCap = leftCap.clone();
    rightCap.position.x = rightBaseX;
    group.add(rightCap);

    const leftPivot = new THREE.Group();
    leftPivot.position.set(leftBaseX + 0.08, pivotY, barrierZ);
    group.add(leftPivot);
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(armLength * 0.5, 0, 0);
    leftPivot.add(leftArm);
    const leftStripe = new THREE.Mesh(
        new THREE.BoxGeometry(armLength - 0.28, 0.03, 0.04),
        stripeMaterial
    );
    leftStripe.position.set(armLength * 0.5 + 0.02, 0.05, 0);
    leftPivot.add(leftStripe);

    const rightPivot = new THREE.Group();
    rightPivot.position.set(rightBaseX - 0.08, pivotY, barrierZ);
    group.add(rightPivot);
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(-armLength * 0.5, 0, 0);
    rightPivot.add(rightArm);
    const rightStripe = new THREE.Mesh(
        new THREE.BoxGeometry(armLength - 0.28, 0.03, 0.04),
        stripeMaterial
    );
    rightStripe.position.set(-armLength * 0.5 - 0.02, 0.05, 0);
    rightPivot.add(rightStripe);

    const indicatorGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const openIndicator = new THREE.Mesh(indicatorGeometry, greenLightMaterial);
    openIndicator.position.set(entrance.centerX - 0.52, 1.24, barrierZ - 0.24);
    openIndicator.visible = false;
    group.add(openIndicator);

    const closedIndicator = new THREE.Mesh(indicatorGeometry, redLightMaterial);
    closedIndicator.position.set(entrance.centerX + 0.52, 1.24, barrierZ - 0.24);
    group.add(closedIndicator);

    undergroundParkingRuntime.barrierSystems.push({
        leftPivot,
        rightPivot,
        openAmount: 0,
        maxAngle: Math.PI * 0.52,
        response: 8.4,
        triggerZ: barrierZ,
        triggerRadius: 14.5,
        openIndicator,
        closedIndicator,
    });

    return group;
}

function createEntrancePortalFrame(layout, accentMaterial, trimMaterial, warningMaterial) {
    const entrance = layout.entrance;
    const group = new THREE.Group();
    group.name = 'undergroundParkingEntrancePortal';

    const finHeight = entrance.portalClearHeight + 0.7;
    const finY = finHeight * 0.5 - 0.04;
    const finHalfWidth = getEntranceHalfWidthAtZ(entrance, entrance.portalZ, 'apron') - 0.62;

    const portalFin = new THREE.Mesh(
        new THREE.BoxGeometry(entrance.portalWingThickness, finHeight, entrance.portalWingDepth),
        accentMaterial
    );
    portalFin.position.set(entrance.centerX - finHalfWidth, finY, entrance.portalZ);
    group.add(portalFin);

    const mirroredPortalFin = portalFin.clone();
    mirroredPortalFin.position.x = entrance.centerX + finHalfWidth;
    group.add(mirroredPortalFin);

    const topBeam = new THREE.Mesh(
        new THREE.BoxGeometry(finHalfWidth * 2 - 0.24, 0.54, 1.26),
        trimMaterial
    );
    topBeam.position.set(
        entrance.centerX,
        entrance.portalClearHeight + 0.3,
        entrance.portalZ - 0.36
    );
    group.add(topBeam);

    const warningBand = new THREE.Mesh(
        new THREE.BoxGeometry(finHalfWidth * 2 - 0.6, 0.16, 0.28),
        warningMaterial
    );
    warningBand.position.set(
        entrance.centerX,
        entrance.portalClearHeight + 0.06,
        entrance.portalZ + 0.92
    );
    group.add(warningBand);

    const crownBar = new THREE.Mesh(
        new THREE.BoxGeometry(finHalfWidth * 2 - 1.24, 0.12, 0.18),
        warningMaterial
    );
    crownBar.position.set(
        entrance.centerX,
        entrance.portalClearHeight + 0.56,
        entrance.portalZ - 0.94
    );
    group.add(crownBar);

    return group;
}

function createEntranceSignage(layout) {
    const entrance = layout.entrance;
    const group = new THREE.Group();
    group.name = 'undergroundParkingEntranceSignage';

    const portalSign = new THREE.Mesh(
        new THREE.PlaneGeometry(7.2, 1.44),
        new THREE.MeshBasicMaterial({
            map: getPortalSignTexture(),
            transparent: true,
            toneMapped: false,
        })
    );
    portalSign.position.set(
        entrance.centerX,
        entrance.portalClearHeight + 0.3,
        entrance.portalZ + 0.55
    );
    portalSign.rotation.y = Math.PI;
    group.add(portalSign);

    const roundelMaterial = new THREE.MeshBasicMaterial({
        map: getParkingRoundelTexture(),
        transparent: true,
        toneMapped: false,
    });
    const roundelGeometry = new THREE.PlaneGeometry(1.46, 1.46);
    const leftRoundel = new THREE.Mesh(roundelGeometry, roundelMaterial);
    leftRoundel.position.set(
        entrance.centerX - getEntranceHalfWidthAtZ(entrance, entrance.portalZ, 'apron') + 0.86,
        2.46,
        entrance.portalZ - 1.26
    );
    leftRoundel.rotation.y = -Math.PI * 0.5;
    group.add(leftRoundel);

    const rightRoundel = leftRoundel.clone();
    rightRoundel.position.x =
        entrance.centerX + getEntranceHalfWidthAtZ(entrance, entrance.portalZ, 'apron') - 0.86;
    rightRoundel.rotation.y = Math.PI * 0.5;
    group.add(rightRoundel);

    return group;
}

function createEntranceLighting(layout, lightMaterial, trimMaterial) {
    const entrance = layout.entrance;
    const group = new THREE.Group();
    group.name = 'undergroundParkingEntranceLights';

    const beaconGeometry = new THREE.BoxGeometry(0.24, 0.24, 0.24);
    const finHalfWidth = getEntranceHalfWidthAtZ(entrance, entrance.portalZ, 'apron') - 0.4;
    const beaconHeights = [1.26, 4.72];

    beaconHeights.forEach((y) => {
        const leftBeacon = new THREE.Mesh(beaconGeometry, lightMaterial);
        leftBeacon.position.set(entrance.centerX - finHalfWidth, y, entrance.portalZ - 1.02);
        group.add(leftBeacon);

        const rightBeacon = leftBeacon.clone();
        rightBeacon.position.x = entrance.centerX + finHalfWidth;
        group.add(rightBeacon);
    });

    const tunnelLightGeometry = new THREE.BoxGeometry(7.4, 0.08, 0.28);
    for (let index = 0; index < entrance.tunnelLightCount; index += 1) {
        const z = entrance.tunnelLightStartZ + index * entrance.tunnelLightSpacing;
        const lightBar = new THREE.Mesh(tunnelLightGeometry, lightMaterial);
        lightBar.position.set(entrance.centerX, layout.ceilingBottomY - 0.14, z);
        group.add(lightBar);
    }

    const lipGlow = new THREE.Mesh(
        new THREE.BoxGeometry(
            getEntranceHalfWidthAtZ(entrance, entrance.topZ, 'surface') * 2 - 0.4,
            0.08,
            0.16
        ),
        trimMaterial
    );
    lipGlow.position.set(entrance.centerX, 0.16, entrance.topZ + 0.18);
    group.add(lipGlow);

    return group;
}

function createEntranceMarkings(layout, lineMaterial, amberLineMaterial) {
    const entrance = layout.entrance;
    const group = new THREE.Group();
    group.name = 'undergroundParkingEntranceMarkings';

    const edgeLineWidth = 0.18;
    const markingMinZ = entrance.slopeStartZ + 0.55;
    const markingMaxZ = entrance.landingEndZ - 0.32;

    const leftEdge = new THREE.Mesh(
        createEntranceSurfaceGeometry(layout, {
            width: edgeLineWidth,
            minZ: markingMinZ,
            maxZ: markingMaxZ,
            centerXOffset: -(entrance.driveHalfWidth - 0.22),
            xSegments: 1,
            zSegments: 40,
            heightOffset: entrance.renderOffsetY + 0.018,
        }),
        lineMaterial
    );
    group.add(leftEdge);

    const rightEdge = new THREE.Mesh(
        createEntranceSurfaceGeometry(layout, {
            width: edgeLineWidth,
            minZ: markingMinZ,
            maxZ: markingMaxZ,
            centerXOffset: entrance.driveHalfWidth - 0.22,
            xSegments: 1,
            zSegments: 40,
            heightOffset: entrance.renderOffsetY + 0.018,
        }),
        lineMaterial
    );
    group.add(rightEdge);

    const centerLeft = new THREE.Mesh(
        createEntranceSurfaceGeometry(layout, {
            width: 0.12,
            minZ: markingMinZ,
            maxZ: markingMaxZ - 0.28,
            centerXOffset: -0.16,
            xSegments: 1,
            zSegments: 40,
            heightOffset: entrance.renderOffsetY + 0.018,
        }),
        amberLineMaterial
    );
    group.add(centerLeft);

    const centerRight = new THREE.Mesh(
        createEntranceSurfaceGeometry(layout, {
            width: 0.12,
            minZ: markingMinZ,
            maxZ: markingMaxZ - 0.28,
            centerXOffset: 0.16,
            xSegments: 1,
            zSegments: 40,
            heightOffset: entrance.renderOffsetY + 0.018,
        }),
        amberLineMaterial
    );
    group.add(centerRight);

    const thresholdBar = new THREE.Mesh(
        createEntranceSurfaceGeometry(layout, {
            width: entrance.driveHalfWidth * 2 - 0.5,
            minZ: entrance.slopeStartZ + 0.18,
            maxZ: entrance.slopeStartZ + 0.42,
            xSegments: 10,
            zSegments: 1,
            heightOffset: entrance.renderOffsetY + 0.02,
        }),
        lineMaterial
    );
    group.add(thresholdBar);

    return group;
}

function createEntranceSurfaceGeometry(
    layout,
    {
        width = 1,
        minZ = 0,
        maxZ = 0,
        centerXOffset = 0,
        xSegments = 8,
        zSegments = 24,
        heightOffset = 0,
    } = {}
) {
    const centerX = layout.entrance.centerX + centerXOffset;
    const centerZ = (minZ + maxZ) * 0.5;
    const geometry = new THREE.PlaneGeometry(
        Math.max(0.12, width),
        Math.max(0.12, maxZ - minZ),
        Math.max(1, xSegments),
        Math.max(1, zSegments)
    );
    const positions = geometry.attributes.position;

    for (let index = 0; index < positions.count; index += 1) {
        const localX = positions.getX(index);
        const localDepth = positions.getY(index);
        const worldZ = centerZ - localDepth;
        const sampledHeight = resolveUndergroundEntranceHeightByZ(layout, worldZ);
        positions.setZ(index, sampledHeight + heightOffset);
    }

    geometry.rotateX(-Math.PI / 2);
    geometry.translate(centerX, 0, centerZ);
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
}

function createEntranceCanopyGeometry(
    layout,
    {
        width = 1,
        minZ = 0,
        maxZ = 0,
        centerXOffset = 0,
        xSegments = 16,
        zSegments = 20,
        baseY = 3,
        archRise = 1,
    } = {}
) {
    const centerX = layout.entrance.centerX + centerXOffset;
    const centerZ = (minZ + maxZ) * 0.5;
    const geometry = new THREE.PlaneGeometry(
        Math.max(0.12, width),
        Math.max(0.12, maxZ - minZ),
        Math.max(1, xSegments),
        Math.max(1, zSegments)
    );
    const positions = geometry.attributes.position;
    const halfWidth = Math.max(0.06, width * 0.5);

    for (let index = 0; index < positions.count; index += 1) {
        const localX = positions.getX(index);
        const archRatio = 1 - Math.pow(clamp01(Math.abs(localX) / halfWidth), 1.38);
        const canopyHeight =
            baseY + archRatio * archRise + Math.cos((localX / halfWidth) * Math.PI) * 0.03;
        positions.setZ(index, canopyHeight);
    }

    geometry.rotateX(-Math.PI / 2);
    geometry.translate(centerX, 0, centerZ);
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
}

function addParkingBayGroup(group, anchorX, startZ, count, direction, material) {
    const bayDepth = 4.1;
    const bayWidth = 3;
    for (let index = 0; index < count; index += 1) {
        const z = startZ + index * 4.5;
        const sideLine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, bayDepth), material);
        sideLine.position.set(anchorX, FLOOR_Y + 0.02, z);
        group.add(sideLine);

        const backLine = new THREE.Mesh(new THREE.BoxGeometry(bayWidth, 0.02, 0.1), material);
        backLine.position.set(anchorX + direction * 1.5, FLOOR_Y + 0.02, z + bayDepth * 0.5 - 0.05);
        group.add(backLine);
    }
}

function registerUndergroundParkingObstacles(layout) {
    const undergroundRange = {
        minY: layout.floorY - 0.8,
        maxY: layout.ceilingBottomY + 0.18,
    };

    addObstacleAabb(
        layout.floorMinX - WALL_THICKNESS * 0.5,
        (layout.floorMinZ + layout.floorMaxZ) * 0.5,
        WALL_THICKNESS,
        layout.floorDepth + WALL_THICKNESS * 2,
        0,
        'building',
        undergroundRange
    );
    addObstacleAabb(
        layout.floorMaxX + WALL_THICKNESS * 0.5,
        (layout.floorMinZ + layout.floorMaxZ) * 0.5,
        WALL_THICKNESS,
        layout.floorDepth + WALL_THICKNESS * 2,
        0,
        'building',
        undergroundRange
    );
    addObstacleAabb(
        (layout.floorMinX + layout.floorMaxX) * 0.5,
        layout.floorMinZ - WALL_THICKNESS * 0.5,
        layout.floorWidth + WALL_THICKNESS * 2,
        WALL_THICKNESS,
        0,
        'building',
        undergroundRange
    );
    addObstacleAabb(
        (layout.floorMinX + layout.floorMaxX) * 0.5,
        layout.floorMaxZ + WALL_THICKNESS * 0.5,
        layout.floorWidth + WALL_THICKNESS * 2,
        WALL_THICKNESS,
        0,
        'building',
        undergroundRange
    );

    addObstacleCircle(
        layout.coreCenterX,
        layout.coreCenterZ,
        layout.coreRadius + 0.42,
        'building',
        undergroundRange
    );

    getColumnPositions(layout).forEach(([x, z]) => {
        addObstacleCircle(x, z, 0.74, 'building', undergroundRange);
    });

    registerUndergroundParkingEntranceObstacles(layout);
}

function registerUndergroundParkingEntranceObstacles(layout) {
    const entrance = layout.entrance;
    const segmentDepth = 3.2;
    const verticalRange = {
        minY: layout.floorY - 0.8,
        maxY: layout.surfaceY + 6.4,
    };

    for (let z = entrance.slopeStartZ - 0.2; z < entrance.landingEndZ; z += segmentDepth) {
        const centerZ = Math.min(entrance.landingEndZ - 0.16, z + segmentDepth * 0.5);
        const halfWidth = getEntranceHalfWidthAtZ(entrance, centerZ, 'wall');
        addObstacleAabb(
            entrance.centerX - halfWidth,
            centerZ,
            WALL_THICKNESS + 0.08,
            segmentDepth + 0.2,
            0,
            'building',
            verticalRange
        );
        addObstacleAabb(
            entrance.centerX + halfWidth,
            centerZ,
            WALL_THICKNESS + 0.08,
            segmentDepth + 0.2,
            0,
            'building',
            verticalRange
        );
    }

    const shoulderWidth = Math.max(1.4, entrance.wallHalfWidth - entrance.driveHalfWidth - 0.22);
    const shoulderStartZ = entrance.slopeStartZ + 0.75;
    const shoulderEndZ = entrance.topZ + 1.35;
    const shoulderDepth = Math.max(1.6, shoulderEndZ - shoulderStartZ);
    const shoulderCenterZ = (shoulderStartZ + shoulderEndZ) * 0.5;
    const shoulderRange = {
        minY: layout.surfaceY - 0.2,
        maxY: layout.surfaceY + 2.2,
    };

    addObstacleAabb(
        entrance.centerX - (entrance.driveHalfWidth + shoulderWidth * 0.5 + WALL_THICKNESS * 0.45),
        shoulderCenterZ,
        shoulderWidth + 0.1,
        shoulderDepth,
        0,
        'building',
        shoulderRange
    );
    addObstacleAabb(
        entrance.centerX + (entrance.driveHalfWidth + shoulderWidth * 0.5 + WALL_THICKNESS * 0.45),
        shoulderCenterZ,
        shoulderWidth + 0.1,
        shoulderDepth,
        0,
        'building',
        shoulderRange
    );

    const atriumVerticalRange = {
        minY: layout.surfaceY + 0.2,
        maxY: layout.entrance.canopyBaseY + layout.entrance.canopyArchRise + 1.2,
    };
    const atriumWallDepth = Math.max(4, entrance.canopyEndZ - entrance.canopyStartZ - 0.28);
    const atriumWallCenterZ = (entrance.canopyStartZ + entrance.canopyEndZ) * 0.5;
    const atriumSideX = entrance.centerX + entrance.canopyHalfWidth - 0.04;
    addObstacleAabb(
        atriumSideX,
        atriumWallCenterZ,
        0.32,
        atriumWallDepth + 0.08,
        0,
        'building',
        atriumVerticalRange
    );
    addObstacleAabb(
        entrance.centerX - (entrance.canopyHalfWidth - 0.04),
        atriumWallCenterZ,
        0.32,
        atriumWallDepth + 0.08,
        0,
        'building',
        atriumVerticalRange
    );

    const rearWallWidth = entrance.canopyHalfWidth * 2 - 0.22;
    addObstacleAabb(
        entrance.centerX,
        entrance.canopyEndZ - 0.02,
        rearWallWidth,
        0.28,
        0,
        'building',
        atriumVerticalRange
    );

    const frontShoulderWidth = Math.max(
        1.24,
        entrance.canopyHalfWidth - entrance.driveHalfWidth - 0.12
    );
    const frontShoulderCenterX = entrance.driveHalfWidth + frontShoulderWidth * 0.5 - 0.02;
    const frontClosureZ = entrance.canopyStartZ + 0.04;
    addObstacleAabb(
        entrance.centerX - frontShoulderCenterX,
        frontClosureZ,
        frontShoulderWidth + 0.08,
        0.28,
        0,
        'building',
        atriumVerticalRange
    );
    addObstacleAabb(
        entrance.centerX + frontShoulderCenterX,
        frontClosureZ,
        frontShoulderWidth + 0.08,
        0.28,
        0,
        'building',
        atriumVerticalRange
    );
}

function isInsideUndergroundParkingCanopyFootprint(x, z, padding = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
        return false;
    }
    const entrance = UNDERGROUND_PARKING_LAYOUT.entrance;
    const extraPadding = Math.max(0, Number(padding) || 0);
    return (
        z >= entrance.canopyStartZ - extraPadding &&
        z <= entrance.canopyEndZ + extraPadding &&
        Math.abs(x - entrance.centerX) <= entrance.canopyHalfWidth + extraPadding
    );
}

function sampleUndergroundParkingEntranceHeightWorld(x, z) {
    const entrance = UNDERGROUND_PARKING_LAYOUT.entrance;
    if (z < entrance.slopeStartZ || z > entrance.landingEndZ) {
        return null;
    }
    if (Math.abs(x - entrance.centerX) > getEntranceHalfWidthAtZ(entrance, z, 'surface')) {
        return null;
    }
    return resolveUndergroundEntranceHeightByZ(UNDERGROUND_PARKING_LAYOUT, z);
}

function resolveUndergroundEntranceHeightByZ(layout, z) {
    const entrance = layout.entrance;
    if (z <= entrance.slopeStartZ) {
        return layout.surfaceY;
    }
    if (z >= entrance.bottomZ) {
        return layout.floorY;
    }
    const progress = normalizedRange(z, entrance.slopeStartZ, entrance.bottomZ);
    const rampProfile = Math.pow(progress, 0.76);
    return THREE.MathUtils.lerp(layout.surfaceY, layout.floorY, rampProfile);
}

function getEntranceHalfWidthAtZ(entrance, z, profile = 'drive') {
    const progress = 1 - clamp01((z - entrance.topZ) / Math.max(0.001, entrance.flareLength));

    if (profile === 'surface') {
        return entrance.surfaceHalfWidth + progress * entrance.surfaceTopFlareExtra;
    }
    if (profile === 'wall') {
        return entrance.wallHalfWidth + progress * entrance.wallTopFlareExtra;
    }
    if (profile === 'cutout') {
        return entrance.cutoutHalfWidth + progress * entrance.cutoutTopFlareExtra;
    }
    if (profile === 'apron') {
        return entrance.apronHalfWidth + progress * entrance.apronTopFlareExtra;
    }
    return entrance.driveHalfWidth + progress * entrance.driveTopFlareExtra;
}

function getColumnPositions(layout) {
    const insetX = Math.min(28, layout.floorWidth * 0.22);
    const insetZ = Math.min(28, layout.floorDepth * 0.22);

    return [
        [layout.floorMinX + insetX, layout.floorMinZ + insetZ],
        [layout.floorMinX + insetX, layout.floorMaxZ - insetZ],
        [layout.floorMaxX - insetX, layout.floorMinZ + insetZ],
        [layout.floorMaxX - insetX, layout.floorMaxZ - insetZ],
        [layout.coreCenterX - 10.2, layout.coreCenterZ - 9.4],
        [layout.coreCenterX + 10.2, layout.coreCenterZ - 9.4],
        [layout.coreCenterX - 10.2, layout.coreCenterZ + 9.4],
        [layout.coreCenterX + 10.2, layout.coreCenterZ + 9.4],
    ];
}

function getPortalSignTexture() {
    if (portalSignTexture) {
        return portalSignTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 220;
    const ctx = canvas.getContext('2d');

    drawRoundedRectPath(ctx, 10, 10, canvas.width - 20, canvas.height - 20, 36);
    const bgGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    bgGradient.addColorStop(0, '#102334');
    bgGradient.addColorStop(0.52, '#1f3f58');
    bgGradient.addColorStop(1, '#13283a');
    ctx.fillStyle = bgGradient;
    ctx.fill();

    ctx.strokeStyle = 'rgba(203, 237, 255, 0.7)';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 209, 128, 0.96)';
    drawRoundedRectPath(ctx, 42, 42, 126, 136, 26);
    ctx.fill();

    ctx.fillStyle = '#0e1b26';
    ctx.font = '900 104px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', 105, 111);

    ctx.fillStyle = '#f6fbff';
    ctx.font = '700 74px Arial';
    ctx.fillText('PARKIMISMAJA', 482, 111);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(770, 74);
    ctx.lineTo(920, 74);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(860, 54);
    ctx.lineTo(920, 74);
    ctx.lineTo(860, 94);
    ctx.stroke();

    portalSignTexture = new THREE.CanvasTexture(canvas);
    portalSignTexture.colorSpace = THREE.SRGBColorSpace;
    return portalSignTexture;
}

function getParkingRoundelTexture() {
    if (parkingRoundelTexture) {
        return parkingRoundelTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const center = canvas.width * 0.5;

    const halo = ctx.createRadialGradient(center, center, 42, center, center, center);
    halo.addColorStop(0, 'rgba(130, 214, 255, 0.34)');
    halo.addColorStop(0.58, 'rgba(130, 214, 255, 0.08)');
    halo.addColorStop(1, 'rgba(130, 214, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(center, center, center, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#17354c';
    ctx.beginPath();
    ctx.arc(center, center, 176, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#bfe9ff';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.arc(center, center, 176, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#ffcf83';
    ctx.beginPath();
    ctx.arc(center, center, 126, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#102030';
    ctx.font = '900 220px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', center, center + 8);

    parkingRoundelTexture = new THREE.CanvasTexture(canvas);
    parkingRoundelTexture.colorSpace = THREE.SRGBColorSpace;
    return parkingRoundelTexture;
}

function drawRoundedRectPath(ctx, x, y, width, height, radius) {
    const safeRadius = Math.max(0, Math.min(radius, width * 0.5, height * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    ctx.lineTo(x + safeRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.quadraticCurveTo(x, y, x + safeRadius, y);
    ctx.closePath();
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
