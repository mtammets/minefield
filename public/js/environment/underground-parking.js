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
const UNDERGROUND_INTERIOR_Y_MARGIN = 1.16;
const UNDERGROUND_ISOLATION_DEPTH_OFFSET = 0.34;
const UNDERGROUND_ISOLATION_LANDING_MARGIN = 0.35;
const UNDERGROUND_HEIGHT_SUPPORT_PADDING = 3.4;
let entranceHeaderTexture = null;
let parkingRoundelTexture = null;
let parkingGuidanceSignTexture = null;
const venueSignTextureCache = new Map();
const undergroundParkingRuntime = {
    barrierSystems: [],
    slidingDoorSystems: [],
};

export const UNDERGROUND_PARKING_LAYOUT = createUndergroundParkingLayout();

export function createUndergroundParkingLayer() {
    const layout = UNDERGROUND_PARKING_LAYOUT;
    const layer = new THREE.Group();
    layer.name = 'undergroundParkingLayer';
    undergroundParkingRuntime.barrierSystems.length = 0;
    undergroundParkingRuntime.slidingDoorSystems.length = 0;

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
    const glassWallMaterial = new THREE.MeshStandardMaterial({
        color: 0xbfe7ff,
        roughness: 0.18,
        metalness: 0.08,
        transparent: true,
        opacity: 0.22,
        emissive: 0x143448,
        emissiveIntensity: 0.14,
        side: THREE.DoubleSide,
    });
    glassWallMaterial.depthWrite = false;
    const glassRoofMaterial = new THREE.MeshBasicMaterial({
        color: 0xd2ecff,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        toneMapped: false,
    });
    glassRoofMaterial.depthWrite = false;
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
    const warmLightMaterial = new THREE.MeshBasicMaterial({
        color: 0xffd09a,
        toneMapped: false,
    });
    const coralLightMaterial = new THREE.MeshBasicMaterial({
        color: 0xff8f76,
        toneMapped: false,
    });
    const mintLightMaterial = new THREE.MeshBasicMaterial({
        color: 0x92ffd4,
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
    const floorAccentMaterial = new THREE.MeshBasicMaterial({
        color: 0x16304a,
        transparent: true,
        opacity: 0.26,
        toneMapped: false,
    });
    const warmFloorAccentMaterial = new THREE.MeshBasicMaterial({
        color: 0x8a4f1d,
        transparent: true,
        opacity: 0.18,
        toneMapped: false,
    });
    const interiorLayer = new THREE.Group();
    interiorLayer.name = 'undergroundParkingInterior';
    interiorLayer.add(createParkingFloor(layout, floorMaterial));
    interiorLayer.add(
        createFloorAtmosphereLayer(
            layout,
            floorAccentMaterial,
            warmFloorAccentMaterial,
            amberLineMaterial
        )
    );
    interiorLayer.add(
        createSupportCore(
            layout,
            concreteMaterial,
            trimMaterial,
            lightMaterial,
            warmLightMaterial
        )
    );
    interiorLayer.add(
        createDriveIslandLayer(
            layout,
            concreteMaterial,
            trimMaterial,
            lightMaterial,
            warmLightMaterial
        )
    );
    interiorLayer.add(
        createParkingHousePartitionLayer(
            layout,
            concreteMaterial,
            trimMaterial,
            glassWallMaterial,
            lightMaterial,
            warmLightMaterial
        )
    );
    interiorLayer.add(
        createRetailPromenadeLayer(
            layout,
            trimMaterial,
            lightMaterial,
            warmLightMaterial,
            coralLightMaterial,
            mintLightMaterial
        )
    );
    interiorLayer.add(
        createExperienceRouteLayer(
            layout,
            trimMaterial,
            lightMaterial,
            warmLightMaterial,
            coralLightMaterial,
            mintLightMaterial
        )
    );
    interiorLayer.add(createSupportColumns(layout, concreteMaterial, trimMaterial));
    interiorLayer.add(
        createCeilingUtilityLayer(layout, trimMaterial, lightMaterial, warmLightMaterial)
    );
    interiorLayer.add(createParkingCeiling(layout, concreteMaterial, trimMaterial, lightMaterial));
    interiorLayer.add(createPerimeterWalls(layout, concreteMaterial));
    interiorLayer.add(createLightingLayer(layout, lightMaterial, trimMaterial));
    interiorLayer.add(createFloorMarkings(layout, lineMaterial, amberLineMaterial));

    const entranceLayer = createEntranceLayer(
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
    );

    layer.userData.interiorLayer = interiorLayer;
    layer.userData.entranceLayer = entranceLayer;
    layer.add(interiorLayer, entranceLayer);
    registerUndergroundParkingObstacles(layout);

    return layer;
}

export function updateUndergroundParkingRuntime(playerPosition, deltaTime = 1 / 60) {
    if (
        !undergroundParkingRuntime.barrierSystems.length &&
        !undergroundParkingRuntime.slidingDoorSystems.length
    ) {
        return;
    }

    const dt = Math.min(Math.max(Number(deltaTime) || 0, 0), 0.1);
    const entrance = UNDERGROUND_PARKING_LAYOUT.entrance;
    const playerX = Number(playerPosition?.x);
    const playerY = Number(playerPosition?.y);
    const playerZ = Number(playerPosition?.z);
    const hasPlayer =
        Number.isFinite(playerX) &&
        Number.isFinite(playerY) &&
        Number.isFinite(playerZ);

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

    undergroundParkingRuntime.slidingDoorSystems.forEach((system) => {
        const withinTrigger =
            hasPlayer &&
            playerY >= system.minTriggerY &&
            playerY <= system.maxTriggerY &&
            Math.abs(playerX - system.triggerCenterX) <= system.triggerHalfWidth &&
            Math.abs(playerZ - system.triggerZ) <= system.triggerDepth;
        const targetOpen = system.locked ? 0 : withinTrigger ? 1 : 0;
        const blend = dt > 0 ? 1 - Math.exp(-system.response * dt) : 1;
        system.openAmount += (targetOpen - system.openAmount) * blend;

        const travel = system.maxTravel * system.openAmount;
        system.leftGroup.position.x = system.leftClosedX - travel;
        system.rightGroup.position.x = system.rightClosedX + travel;
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
        x >= layout.floorMinX - UNDERGROUND_HEIGHT_SUPPORT_PADDING &&
        x <= layout.floorMaxX + UNDERGROUND_HEIGHT_SUPPORT_PADDING &&
        z >= layout.floorMinZ - UNDERGROUND_HEIGHT_SUPPORT_PADDING &&
        z <= layout.floorMaxZ + UNDERGROUND_HEIGHT_SUPPORT_PADDING
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

export function isInsideUndergroundParkingInteriorWorld(x, y, z, padding = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return false;
    }
    const layout = UNDERGROUND_PARKING_LAYOUT;
    const extraPadding = Math.max(0, Number(padding) || 0);
    return (
        y <= layout.ceilingBottomY + UNDERGROUND_INTERIOR_Y_MARGIN + extraPadding &&
        y >= layout.floorY - 0.9 - extraPadding &&
        x >= layout.floorMinX - extraPadding &&
        x <= layout.floorMaxX + extraPadding &&
        z >= layout.floorMinZ - extraPadding &&
        z <= layout.floorMaxZ + extraPadding
    );
}

export function isInsideUndergroundParkingIsolatedZoneWorld(x, y, z, padding = 0) {
    if (!isInsideUndergroundParkingInteriorWorld(x, y, z, padding)) {
        return false;
    }
    const layout = UNDERGROUND_PARKING_LAYOUT;
    const extraPadding = Math.max(0, Number(padding) || 0);
    return (
        y <= layout.ceilingBottomY - UNDERGROUND_ISOLATION_DEPTH_OFFSET + extraPadding &&
        z >= layout.entrance.landingEndZ - UNDERGROUND_ISOLATION_LANDING_MARGIN - extraPadding
    );
}

export function isUndergroundParkingSpaceIsolatedPosition(position, padding = 0) {
    return isInsideUndergroundParkingIsolatedZoneWorld(
        Number(position?.x),
        Number(position?.y),
        Number(position?.z),
        padding
    );
}

export function arePositionsSeparatedByUndergroundParking(
    positionA,
    positionB,
    padding = 0
) {
    return (
        isUndergroundParkingSpaceIsolatedPosition(positionA, padding) !==
        isUndergroundParkingSpaceIsolatedPosition(positionB, padding)
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

    const layout = UNDERGROUND_PARKING_LAYOUT;
    const interiorConstraint = applyUndergroundParkingInteriorDriveConstraint(
        position,
        previousPosition,
        layout
    );
    if (interiorConstraint) {
        return interiorConstraint;
    }

    if (!isInsideUndergroundParkingCanopyFootprint(position.x, position.z, 0.08)) {
        return null;
    }

    // Let the car settle onto the descending ramp before applying the anti-clipping canopy guard.
    if (isInsideUndergroundParkingEntranceRampCorridor(position.x, position.z, 0.22)) {
        return null;
    }

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

function applyUndergroundParkingInteriorDriveConstraint(position, previousPosition, layout) {
    if (!isInsideUndergroundParkingInteriorWorld(position.x, position.y, position.z, 0.42)) {
        return null;
    }

    let constrained = false;
    const minDriveX = layout.floorMinX;
    const maxDriveX = layout.floorMaxX;
    const minDriveZ = layout.floorMinZ;
    const maxDriveZ = layout.floorMaxZ;

    if (position.x < minDriveX) {
        position.x = minDriveX;
        constrained = true;
    } else if (position.x > maxDriveX) {
        position.x = maxDriveX;
        constrained = true;
    }

    if (position.z < minDriveZ) {
        position.z = minDriveZ;
        constrained = true;
    } else if (position.z > maxDriveZ) {
        position.z = maxDriveZ;
        constrained = true;
    }

    const parkingHouseDoorConstraint = applyParkingHouseSlidingDoorConstraint(
        position,
        previousPosition
    );
    if (parkingHouseDoorConstraint) {
        return parkingHouseDoorConstraint;
    }

    return constrained ? { mode: 'interior_guard' } : null;
}

function applyParkingHouseSlidingDoorConstraint(position, previousPosition = null) {
    if (!undergroundParkingRuntime.slidingDoorSystems.length) {
        return null;
    }

    for (const system of undergroundParkingRuntime.slidingDoorSystems) {
        if ((Number(system.openAmount) || 0) >= system.openThreshold) {
            continue;
        }

        const previousX = Number(previousPosition?.x);
        const previousZ = Number(previousPosition?.z);
        const hasPrevious = Number.isFinite(previousX) && Number.isFinite(previousZ);
        const withinDoorWidthNow = Math.abs(position.x - system.triggerCenterX) <= system.blockHalfWidth;
        const withinDoorWidthBefore =
            hasPrevious && Math.abs(previousX - system.triggerCenterX) <= system.blockHalfWidth;

        if (!withinDoorWidthNow && !withinDoorWidthBefore) {
            continue;
        }

        const crossedPlane = hasPrevious
            ? (previousZ - system.triggerZ) * (position.z - system.triggerZ) <= 0
            : Math.abs(position.z - system.triggerZ) <= 0.78;
        const nearDoorPlane =
            crossedPlane ||
            Math.abs(position.z - system.triggerZ) <= system.blockDepth ||
            (hasPrevious && Math.abs(previousZ - system.triggerZ) <= system.blockDepth);

        if (!nearDoorPlane) {
            continue;
        }

        if (hasPrevious) {
            position.x = previousX;
            position.z = previousZ;
        } else {
            position.z = system.triggerZ + (position.z >= system.triggerZ ? 0.9 : -0.9);
        }

        return { mode: 'illegal_entry' };
    }

    return null;
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

function createSupportCore(layout, shellMaterial, trimMaterial, lightMaterial, warmLightMaterial) {
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

    const innerBand = new THREE.Mesh(
        new THREE.TorusGeometry(layout.coreRadius - 1.08, 0.08, 10, 32),
        warmLightMaterial
    );
    innerBand.rotation.x = Math.PI * 0.5;
    innerBand.position.set(layout.coreCenterX, layout.floorY + 1.24, layout.coreCenterZ);
    group.add(innerBand);

    const bladeCount = 8;
    for (let index = 0; index < bladeCount; index += 1) {
        const angle = (index / bladeCount) * Math.PI * 2;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, coreHeight - 0.82, 0.2), trimMaterial);
        blade.position.set(
            layout.coreCenterX + Math.cos(angle) * (layout.coreRadius - 0.34),
            layout.floorY + coreHeight * 0.5 - 0.06,
            layout.coreCenterZ + Math.sin(angle) * (layout.coreRadius - 0.34)
        );
        blade.rotation.y = angle;
        group.add(blade);

        const bladeGlow = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, coreHeight - 1.64, 0.06),
            index % 2 === 0 ? lightMaterial : warmLightMaterial
        );
        bladeGlow.position.set(
            layout.coreCenterX + Math.cos(angle) * (layout.coreRadius - 0.58),
            layout.floorY + coreHeight * 0.5 - 0.04,
            layout.coreCenterZ + Math.sin(angle) * (layout.coreRadius - 0.58)
        );
        bladeGlow.rotation.y = angle;
        group.add(bladeGlow);
    }

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

function createFloorAtmosphereLayer(layout, coolMaterial, warmMaterial, accentMaterial) {
    const group = new THREE.Group();
    group.name = 'undergroundParkingFloorAtmosphere';

    const centralWash = new THREE.Mesh(
        new THREE.PlaneGeometry(layout.floorWidth * 0.44, 26),
        coolMaterial
    );
    centralWash.rotation.x = -Math.PI * 0.5;
    centralWash.position.set(layout.centerX, layout.floorY + 0.03, -34);
    group.add(centralWash);

    const northPromenade = new THREE.Mesh(
        new THREE.PlaneGeometry(layout.floorWidth * 0.72, 14),
        warmMaterial
    );
    northPromenade.rotation.x = -Math.PI * 0.5;
    northPromenade.position.set(layout.centerX, layout.floorY + 0.028, layout.floorMaxZ - 11.8);
    group.add(northPromenade);

    const eastWetStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(18, layout.floorDepth * 0.46),
        coolMaterial
    );
    eastWetStrip.rotation.x = -Math.PI * 0.5;
    eastWetStrip.position.set(layout.floorMaxX - 24, layout.floorY + 0.026, 18);
    group.add(eastWetStrip);

    const westWarmStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(16, layout.floorDepth * 0.38),
        warmMaterial
    );
    westWarmStrip.rotation.x = -Math.PI * 0.5;
    westWarmStrip.position.set(layout.floorMinX + 22, layout.floorY + 0.026, -8);
    group.add(westWarmStrip);

    const coreGlow = new THREE.Mesh(
        new THREE.RingGeometry(layout.coreRadius + 8.6, layout.coreRadius + 14.6, 48),
        accentMaterial
    );
    coreGlow.rotation.x = -Math.PI * 0.5;
    coreGlow.position.set(layout.coreCenterX, layout.floorY + 0.032, layout.coreCenterZ);
    group.add(coreGlow);

    return group;
}

function createDriveIslandLayer(
    layout,
    shellMaterial,
    trimMaterial,
    lightMaterial,
    warmLightMaterial
) {
    const group = new THREE.Group();
    group.name = 'undergroundParkingDriveIslands';
    const curbHeight = 0.46;

    getDriveIslandDescriptors(layout).forEach((descriptor) => {
        const island = new THREE.Mesh(
            new THREE.BoxGeometry(descriptor.width, curbHeight, descriptor.depth),
            shellMaterial
        );
        island.position.set(
            descriptor.x,
            layout.floorY + curbHeight * 0.5,
            descriptor.z
        );
        group.add(island);

        const cap = new THREE.Mesh(
            new THREE.BoxGeometry(descriptor.width + 0.22, 0.08, descriptor.depth + 0.22),
            trimMaterial
        );
        cap.position.set(descriptor.x, layout.floorY + curbHeight + 0.04, descriptor.z);
        group.add(cap);

        const inset = new THREE.Mesh(
            new THREE.BoxGeometry(
                Math.max(1.8, descriptor.width - 1),
                0.12,
                Math.max(1.8, descriptor.depth - 1)
            ),
            descriptor.warmAccent ? warmLightMaterial : lightMaterial
        );
        inset.position.set(descriptor.x, layout.floorY + curbHeight + 0.08, descriptor.z);
        group.add(inset);

        const beaconMaterial = descriptor.warmAccent ? warmLightMaterial : lightMaterial;
        const beaconPositions = descriptor.width >= descriptor.depth
            ? [
                  [-descriptor.width * 0.5 + 1, 0],
                  [descriptor.width * 0.5 - 1, 0],
              ]
            : [
                  [0, -descriptor.depth * 0.5 + 1],
                  [0, descriptor.depth * 0.5 - 1],
              ];

        beaconPositions.forEach(([offsetX, offsetZ]) => {
            const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.04, 0.18), beaconMaterial);
            beacon.position.set(
                descriptor.x + offsetX,
                layout.floorY + curbHeight + 0.52,
                descriptor.z + offsetZ
            );
            group.add(beacon);
        });
    });

    return group;
}

function createParkingHousePartitionLayer(
    layout,
    shellMaterial,
    trimMaterial,
    glassMaterial,
    lightMaterial,
    warmLightMaterial
) {
    const zone = getParkingHouseZoneLayout(layout);
    const group = new THREE.Group();
    group.name = 'undergroundParkingHousePartition';

    const parkingConcreteMaterial = shellMaterial.clone();
    parkingConcreteMaterial.color.setHex(0x808892);
    parkingConcreteMaterial.emissive.setHex(0x0b1015);
    parkingConcreteMaterial.emissiveIntensity = 0.08;
    parkingConcreteMaterial.roughness = 0.94;
    parkingConcreteMaterial.metalness = 0.04;

    const aluminumMaterial = trimMaterial.clone();
    aluminumMaterial.color.setHex(0xc5ccd3);
    aluminumMaterial.emissive.setHex(0x1b2730);
    aluminumMaterial.emissiveIntensity = 0.1;
    aluminumMaterial.roughness = 0.28;
    aluminumMaterial.metalness = 0.78;

    const anodizedMetalMaterial = trimMaterial.clone();
    anodizedMetalMaterial.color.setHex(0x5f6972);
    anodizedMetalMaterial.emissive.setHex(0x101820);
    anodizedMetalMaterial.emissiveIntensity = 0.08;
    anodizedMetalMaterial.roughness = 0.34;
    anodizedMetalMaterial.metalness = 0.82;

    const darkPanelMaterial = shellMaterial.clone();
    darkPanelMaterial.color.setHex(0x28313a);
    darkPanelMaterial.emissive.setHex(0x111820);
    darkPanelMaterial.emissiveIntensity = 0.1;
    darkPanelMaterial.roughness = 0.5;
    darkPanelMaterial.metalness = 0.16;

    const upperWallMaterial = shellMaterial.clone();
    upperWallMaterial.color.setHex(0x68717a);
    upperWallMaterial.emissive.setHex(0x10161c);
    upperWallMaterial.emissiveIntensity = 0.06;
    upperWallMaterial.roughness = 0.82;
    upperWallMaterial.metalness = 0.08;

    const sealedFloorMaterial = new THREE.MeshBasicMaterial({
        color: 0x9ca4ad,
        transparent: true,
        opacity: 0.12,
        toneMapped: false,
    });

    const safetyMaterial = new THREE.MeshBasicMaterial({
        color: 0xe7bf58,
        transparent: true,
        opacity: 0.9,
        toneMapped: false,
    });

    const wallThickness = 0.34;
    const wallHeight = layout.ceilingBottomY - layout.floorY - 0.22;
    const wallY = layout.floorY + wallHeight * 0.5;
    const sideWallDepth = zone.maxZ - zone.minZ;
    const sideWallGeometry = new THREE.BoxGeometry(wallThickness, wallHeight, sideWallDepth);

    const westWall = new THREE.Mesh(sideWallGeometry, parkingConcreteMaterial);
    westWall.position.set(zone.minX, wallY, zone.centerZ);
    group.add(westWall);

    const eastWall = westWall.clone();
    eastWall.position.x = zone.maxX;
    group.add(eastWall);

    const sideCrashRailGeometry = new THREE.BoxGeometry(0.1, 0.18, sideWallDepth - 1.2);
    const westCrashRail = new THREE.Mesh(sideCrashRailGeometry, safetyMaterial);
    westCrashRail.position.set(zone.minX + 0.24, layout.floorY + 0.62, zone.centerZ);
    group.add(westCrashRail);

    const eastCrashRail = westCrashRail.clone();
    eastCrashRail.position.x = zone.maxX - 0.24;
    group.add(eastCrashRail);

    const northWallLeftWidth = Math.max(0.5, zone.doorMinX - zone.minX);
    const northWallRightWidth = Math.max(0.5, zone.maxX - zone.doorMaxX);
    const southWallLeftWidth = Math.max(0.5, zone.southOpeningMinX - zone.minX);
    const southWallRightWidth = Math.max(0.5, zone.maxX - zone.southOpeningMaxX);
    const kneeWallHeight = 1.16;
    const upperGlassHeight = Math.max(1.2, wallHeight - kneeWallHeight - 0.16);
    const upperGlassY = layout.floorY + kneeWallHeight + upperGlassHeight * 0.5;
    const kneeWallY = layout.floorY + kneeWallHeight * 0.5;

    const northWallLeft = new THREE.Mesh(
        new THREE.BoxGeometry(northWallLeftWidth, kneeWallHeight, wallThickness),
        parkingConcreteMaterial
    );
    northWallLeft.position.set(
        zone.minX + northWallLeftWidth * 0.5,
        kneeWallY,
        zone.maxZ
    );
    group.add(northWallLeft);

    const northWallRight = new THREE.Mesh(
        new THREE.BoxGeometry(northWallRightWidth, kneeWallHeight, wallThickness),
        parkingConcreteMaterial
    );
    northWallRight.position.set(
        zone.doorMaxX + northWallRightWidth * 0.5,
        kneeWallY,
        zone.maxZ
    );
    group.add(northWallRight);

    const northUpperLeft = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.48, northWallLeftWidth - 0.08), upperGlassHeight, wallThickness),
        upperWallMaterial
    );
    northUpperLeft.position.set(
        zone.minX + northWallLeftWidth * 0.5,
        upperGlassY,
        zone.maxZ
    );
    group.add(northUpperLeft);

    const northUpperRight = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.48, northWallRightWidth - 0.08), upperGlassHeight, wallThickness),
        upperWallMaterial
    );
    northUpperRight.position.set(
        zone.doorMaxX + northWallRightWidth * 0.5,
        upperGlassY,
        zone.maxZ
    );
    group.add(northUpperRight);

    const southWallLeft = new THREE.Mesh(
        new THREE.BoxGeometry(southWallLeftWidth, wallHeight, wallThickness),
        parkingConcreteMaterial
    );
    southWallLeft.position.set(
        zone.minX + southWallLeftWidth * 0.5,
        wallY,
        zone.minZ
    );
    group.add(southWallLeft);

    const southWallRight = new THREE.Mesh(
        new THREE.BoxGeometry(southWallRightWidth, wallHeight, wallThickness),
        parkingConcreteMaterial
    );
    southWallRight.position.set(
        zone.southOpeningMaxX + southWallRightWidth * 0.5,
        wallY,
        zone.minZ
    );
    group.add(southWallRight);

    const southOpeningPostGeometry = new THREE.BoxGeometry(0.26, wallHeight, wallThickness + 0.08);
    const southPostLeft = new THREE.Mesh(southOpeningPostGeometry, aluminumMaterial);
    southPostLeft.position.set(zone.southOpeningMinX, wallY, zone.minZ);
    group.add(southPostLeft);

    const southPostRight = southPostLeft.clone();
    southPostRight.position.x = zone.southOpeningMaxX;
    group.add(southPostRight);

    const headerHeight = 0.54;
    const header = new THREE.Mesh(
        new THREE.BoxGeometry(zone.doorWidth + 0.36, headerHeight, wallThickness + 0.1),
        anodizedMetalMaterial
    );
    header.position.set(
        zone.doorCenterX,
        zone.doorBottomY + zone.doorHeight + headerHeight * 0.5 + 0.06,
        zone.maxZ
    );
    group.add(header);

    const doorTrack = new THREE.Mesh(
        new THREE.BoxGeometry(zone.doorWidth + 0.18, 0.2, 0.28),
        darkPanelMaterial
    );
    doorTrack.position.set(
        zone.doorCenterX,
        zone.doorBottomY + zone.doorHeight - 0.14,
        zone.maxZ + 0.02
    );
    group.add(doorTrack);

    const doorGlassMaterial = glassMaterial.clone();
    doorGlassMaterial.color.setHex(0xf6fbff);
    doorGlassMaterial.opacity = 0.22;
    doorGlassMaterial.roughness = 0.05;
    doorGlassMaterial.metalness = 0.08;
    doorGlassMaterial.emissive.set(0x1b2630);
    doorGlassMaterial.emissiveIntensity = 0.05;
    doorGlassMaterial.depthWrite = false;

    const fixedPanelWidth = zone.fixedPanelWidth;
    const slidingLeafWidth = Math.max(1.32, zone.slidingOpeningWidth * 0.5);
    const glazedOpeningHeight = zone.doorHeight - 0.18;
    const doorFrameDepth = 0.12;
    const mullionWidth = 0.08;
    const leafStileWidth = 0.08;
    const leafRailHeight = 0.08;
    const leftDoorClosedX = zone.doorCenterX - slidingLeafWidth * 0.5;
    const rightDoorClosedX = zone.doorCenterX + slidingLeafWidth * 0.5;

    const doorSidelightLeft = new THREE.Mesh(
        new THREE.BoxGeometry(fixedPanelWidth, glazedOpeningHeight, 0.06),
        doorGlassMaterial
    );
    doorSidelightLeft.position.set(
        zone.doorMinX + fixedPanelWidth * 0.5,
        zone.doorBottomY + glazedOpeningHeight * 0.5,
        zone.maxZ + 0.01
    );
    group.add(doorSidelightLeft);

    const doorSidelightRight = doorSidelightLeft.clone();
    doorSidelightRight.position.x = zone.doorMaxX - fixedPanelWidth * 0.5;
    group.add(doorSidelightRight);

    const leftDoorGroup = new THREE.Group();
    leftDoorGroup.position.x = leftDoorClosedX;
    group.add(leftDoorGroup);

    const leftDoor = new THREE.Mesh(
        new THREE.BoxGeometry(slidingLeafWidth - 0.14, glazedOpeningHeight - 0.08, 0.06),
        doorGlassMaterial
    );
    leftDoor.position.set(
        0,
        zone.doorBottomY + glazedOpeningHeight * 0.5,
        zone.maxZ - 0.01
    );
    leftDoorGroup.add(leftDoor);

    const leftLeafFrameLeft = new THREE.Mesh(
        new THREE.BoxGeometry(leafStileWidth, glazedOpeningHeight, doorFrameDepth),
        aluminumMaterial
    );
    leftLeafFrameLeft.position.set(
        -slidingLeafWidth * 0.5 + leafStileWidth * 0.5,
        zone.doorBottomY + glazedOpeningHeight * 0.5,
        zone.maxZ
    );
    leftDoorGroup.add(leftLeafFrameLeft);

    const leftLeafFrameRight = leftLeafFrameLeft.clone();
    leftLeafFrameRight.position.x = slidingLeafWidth * 0.5 - leafStileWidth * 0.5;
    leftDoorGroup.add(leftLeafFrameRight);

    const leftLeafTopRail = new THREE.Mesh(
        new THREE.BoxGeometry(slidingLeafWidth, leafRailHeight, doorFrameDepth),
        aluminumMaterial
    );
    leftLeafTopRail.position.set(
        0,
        zone.doorBottomY + glazedOpeningHeight - leafRailHeight * 0.5,
        zone.maxZ
    );
    leftDoorGroup.add(leftLeafTopRail);

    const leftLeafBottomRail = leftLeafTopRail.clone();
    leftLeafBottomRail.position.y = zone.doorBottomY + leafRailHeight * 0.5;
    leftDoorGroup.add(leftLeafBottomRail);

    const leftDoorSafetyBand = new THREE.Mesh(
        new THREE.BoxGeometry(slidingLeafWidth - 0.18, 0.1, 0.014),
        safetyMaterial
    );
    leftDoorSafetyBand.position.set(0, zone.doorBottomY + 1.08, zone.maxZ + 0.042);
    leftDoorGroup.add(leftDoorSafetyBand);

    const rightDoorGroup = new THREE.Group();
    rightDoorGroup.position.x = rightDoorClosedX;
    group.add(rightDoorGroup);

    const rightDoor = leftDoor.clone();
    rightDoorGroup.add(rightDoor);

    const rightLeafFrameLeft = leftLeafFrameLeft.clone();
    rightDoorGroup.add(rightLeafFrameLeft);

    const rightLeafFrameRight = leftLeafFrameRight.clone();
    rightDoorGroup.add(rightLeafFrameRight);

    const rightLeafTopRail = leftLeafTopRail.clone();
    rightDoorGroup.add(rightLeafTopRail);

    const rightLeafBottomRail = leftLeafBottomRail.clone();
    rightDoorGroup.add(rightLeafBottomRail);

    const rightDoorSafetyBand = leftDoorSafetyBand.clone();
    rightDoorGroup.add(rightDoorSafetyBand);

    const transom = new THREE.Mesh(
        new THREE.BoxGeometry(zone.doorWidth - 0.16, 0.42, 0.06),
        doorGlassMaterial
    );
    transom.position.set(
        zone.doorCenterX,
        zone.doorBottomY + zone.doorHeight + 0.04,
        zone.maxZ + 0.01
    );
    group.add(transom);

    const frameVerticalOffsets = [
        zone.doorMinX,
        zone.doorMinX + fixedPanelWidth,
        zone.doorMaxX - fixedPanelWidth,
        zone.doorMaxX,
    ];
    frameVerticalOffsets.forEach((x) => {
        const mullion = new THREE.Mesh(
            new THREE.BoxGeometry(mullionWidth, zone.doorHeight + 0.6, doorFrameDepth),
            aluminumMaterial
        );
        mullion.position.set(x, zone.doorBottomY + zone.doorHeight * 0.5 + 0.12, zone.maxZ);
        group.add(mullion);
    });

    const sideBaseRailGeometry = new THREE.BoxGeometry(fixedPanelWidth + 0.08, 0.1, 0.14);
    const leftBaseRail = new THREE.Mesh(sideBaseRailGeometry, anodizedMetalMaterial);
    leftBaseRail.position.set(
        zone.doorMinX + fixedPanelWidth * 0.5,
        zone.doorBottomY + 0.05,
        zone.maxZ
    );
    group.add(leftBaseRail);

    const rightBaseRail = leftBaseRail.clone();
    rightBaseRail.position.x = zone.doorMaxX - fixedPanelWidth * 0.5;
    group.add(rightBaseRail);

    const doorSensor = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.1, 0.08),
        darkPanelMaterial
    );
    doorSensor.position.set(zone.doorCenterX, zone.doorBottomY + zone.doorHeight - 0.36, zone.maxZ + 0.12);
    group.add(doorSensor);

    const parkingWash = new THREE.Mesh(
        new THREE.PlaneGeometry(zone.maxX - zone.minX - 1.2, zone.maxZ - zone.minZ - 1.4),
        sealedFloorMaterial
    );
    parkingWash.rotation.x = -Math.PI * 0.5;
    parkingWash.position.set(
        zone.centerX,
        layout.floorY + 0.028,
        zone.centerZ
    );
    group.add(parkingWash);

    const entranceMat = new THREE.Mesh(
        new THREE.PlaneGeometry(zone.doorWidth + 0.4, 1.6),
        new THREE.MeshBasicMaterial({
            color: 0x454b52,
            transparent: true,
            opacity: 0.45,
            toneMapped: false,
        })
    );
    entranceMat.rotation.x = -Math.PI * 0.5;
    entranceMat.position.set(zone.doorCenterX, layout.floorY + 0.03, zone.maxZ - 0.86);
    group.add(entranceMat);

    const signPlate = new THREE.Mesh(
        new THREE.PlaneGeometry(3.3, 0.9),
        new THREE.MeshBasicMaterial({
            map: getParkingGuidanceSignTexture(),
            transparent: true,
            toneMapped: false,
            side: THREE.DoubleSide,
            alphaTest: 0.04,
        })
    );
    signPlate.position.set(zone.doorCenterX, layout.floorY + 3.42, zone.maxZ + 0.22);
    signPlate.renderOrder = 4;
    group.add(signPlate);

    const parkingSign = new THREE.Mesh(
        new THREE.PlaneGeometry(2.05, 0.58),
        new THREE.MeshBasicMaterial({
            map: getParkingGuidanceSignTexture(),
            transparent: true,
            toneMapped: false,
            side: THREE.DoubleSide,
            alphaTest: 0.04,
        })
    );
    parkingSign.position.set(zone.minX + 0.24, layout.floorY + 2.98, zone.centerZ - 6.4);
    parkingSign.rotation.y = Math.PI * 0.5;
    parkingSign.renderOrder = 4;
    group.add(parkingSign);

    [
        zone.doorCenterX - 2.1,
        zone.doorCenterX + 2.1,
    ].forEach((x) => {
        const bollard = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.16, 0.96, 16),
            anodizedMetalMaterial
        );
        bollard.position.set(x, layout.floorY + 0.48, zone.maxZ - 1.5);
        group.add(bollard);

        const bollardCap = new THREE.Mesh(
            new THREE.CylinderGeometry(0.13, 0.13, 0.08, 16),
            safetyMaterial
        );
        bollardCap.position.set(x, layout.floorY + 0.92, zone.maxZ - 1.5);
        group.add(bollardCap);
    });

    const payStation = new THREE.Group();
    payStation.position.set(zone.doorMinX - 1.34, layout.floorY, zone.maxZ - 1.28);

    const payStationBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 1.42, 0.46),
        darkPanelMaterial
    );
    payStationBody.position.set(0, 0.71, 0);
    payStation.add(payStationBody);

    const payStationHead = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.22, 0.24),
        anodizedMetalMaterial
    );
    payStationHead.position.set(0, 1.5, 0.06);
    payStation.add(payStationHead);

    const payScreen = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.28, 0.02),
        lightMaterial
    );
    payScreen.position.set(0, 1.03, 0.24);
    payStation.add(payScreen);

    const cardSlot = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.03, 0.02),
        aluminumMaterial
    );
    cardSlot.position.set(0, 0.8, 0.24);
    payStation.add(cardSlot);

    const statusLamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.02),
        warmLightMaterial
    );
    statusLamp.position.set(0.16, 1.2, 0.24);
    payStation.add(statusLamp);
    group.add(payStation);

    const serviceCabinet = new THREE.Mesh(
        new THREE.BoxGeometry(0.74, 1.86, 0.4),
        darkPanelMaterial
    );
    serviceCabinet.position.set(zone.maxX - 1.2, layout.floorY + 0.93, zone.maxZ - 2.1);
    group.add(serviceCabinet);

    for (let z = zone.minZ + 4.8; z <= zone.maxZ - 5; z += 8.2) {
        const stripLight = new THREE.Mesh(
            new THREE.BoxGeometry(zone.maxX - zone.minX - 3.2, 0.05, 0.12),
            lightMaterial
        );
        stripLight.position.set(zone.centerX, layout.ceilingBottomY - 0.22, z);
        group.add(stripLight);
    }

    getParkingBayGroupDescriptors(layout).forEach((descriptor) => {
        for (let index = 0; index < descriptor.count; index += 1) {
            const wheelStop = new THREE.Mesh(
                new THREE.BoxGeometry(1.72, 0.16, 0.34),
                parkingConcreteMaterial
            );
            wheelStop.position.set(
                descriptor.anchorX + descriptor.direction * 2.42,
                layout.floorY + 0.08,
                descriptor.startZ + index * 4.5 + 1.74
            );
            group.add(wheelStop);
        }
    });

    undergroundParkingRuntime.slidingDoorSystems.push({
        leftGroup: leftDoorGroup,
        rightGroup: rightDoorGroup,
        openAmount: 0,
        response: 6.8,
        leftClosedX: leftDoorClosedX,
        rightClosedX: rightDoorClosedX,
        maxTravel: Math.max(1.24, slidingLeafWidth - 0.18),
        triggerCenterX: zone.doorCenterX,
        triggerZ: zone.maxZ,
        triggerHalfWidth: zone.doorWidth * 0.5 + 1.6,
        triggerDepth: 6.6,
        blockHalfWidth: zone.slidingOpeningWidth * 0.5 - 0.18,
        blockDepth: 0.88,
        openThreshold: 0.72,
        minTriggerY: layout.floorY - 0.8,
        maxTriggerY: layout.ceilingBottomY + 1.6,
        locked: true,
    });

    return group;
}

function createRetailPromenadeLayer(
    layout,
    trimMaterial,
    lightMaterial,
    warmLightMaterial,
    coralLightMaterial,
    mintLightMaterial
) {
    const group = new THREE.Group();
    group.name = 'undergroundParkingRetailPromenade';

    getRetailVenueDescriptors(layout).forEach((descriptor) => {
        group.add(
            createRetailVenue(
                descriptor,
                layout.floorY,
                trimMaterial,
                lightMaterial,
                warmLightMaterial,
                coralLightMaterial,
                mintLightMaterial
            )
        );
    });

    getFreestandingKioskDescriptors(layout).forEach((descriptor) => {
        group.add(
            createFreestandingKiosk(
                descriptor,
                layout.floorY,
                trimMaterial,
                lightMaterial,
                warmLightMaterial
            )
        );
    });

    return group;
}

function createExperienceRouteLayer(
    layout,
    trimMaterial,
    lightMaterial,
    warmLightMaterial,
    coralLightMaterial,
    mintLightMaterial
) {
    const group = new THREE.Group();
    group.name = 'undergroundParkingExperienceRoute';
    const frameMaterials = [lightMaterial, warmLightMaterial, coralLightMaterial, mintLightMaterial];
    const parkingHouseZone = getParkingHouseZoneLayout(layout);

    addDriveThroughFrameRun(group, {
        centerX: layout.centerX,
        width: 13.4,
        height: 3.6,
        zPositions: [parkingHouseZone.maxZ + 10, parkingHouseZone.maxZ + 24],
        baseY: layout.floorY,
        trimMaterial,
        lightMaterials: frameMaterials,
    });
    addDriveThroughFrameRun(group, {
        centerX: layout.floorMaxX - 25.5,
        width: 9.4,
        height: 3.2,
        zPositions: [-10, 6, 22],
        baseY: layout.floorY,
        trimMaterial,
        lightMaterials: [mintLightMaterial, lightMaterial, warmLightMaterial],
    });

    const directionalTotems = [
        {
            x: layout.floorMinX + 19,
            z: -18,
            label: 'KOHVIK',
            subtitle: 'quiet corner',
            accentColor: 0xffc986,
        },
        {
            x: layout.floorMaxX - 18,
            z: 18,
            label: 'TUNE',
            subtitle: 'service lane',
            accentColor: 0x8deaff,
        },
        {
            x: layout.centerX,
            z: layout.floorMaxZ - 24,
            label: 'ARKAAD',
            subtitle: 'late arcade',
            accentColor: 0xff8fbe,
        },
    ];

    directionalTotems.forEach((descriptor) => {
        group.add(createWayfindingTotem(descriptor, layout.floorY, trimMaterial));
    });

    return group;
}

function createCeilingUtilityLayer(layout, trimMaterial, lightMaterial, warmLightMaterial) {
    const group = new THREE.Group();
    group.name = 'undergroundParkingCeilingUtilities';
    const conduitY = layout.ceilingBottomY - 0.42;
    const conduitDescriptors = [
        {
            width: 0.26,
            depth: layout.floorDepth * 0.76,
            x: layout.floorMinX + 15.5,
            z: layout.centerZ - 4,
            glow: lightMaterial,
        },
        {
            width: 0.26,
            depth: layout.floorDepth * 0.64,
            x: layout.floorMaxX - 15.5,
            z: layout.centerZ + 10,
            glow: warmLightMaterial,
        },
        {
            width: layout.floorWidth * 0.42,
            depth: 0.26,
            x: layout.centerX + 10,
            z: layout.floorMaxZ - 18.5,
            glow: lightMaterial,
        },
    ];

    conduitDescriptors.forEach((descriptor) => {
        const conduit = new THREE.Mesh(
            new THREE.BoxGeometry(descriptor.width, 0.2, descriptor.depth),
            trimMaterial
        );
        conduit.position.set(descriptor.x, conduitY, descriptor.z);
        group.add(conduit);

        const glow =
            descriptor.width > descriptor.depth
                ? new THREE.Mesh(
                      new THREE.BoxGeometry(descriptor.width - 0.6, 0.05, 0.05),
                      descriptor.glow
                  )
                : new THREE.Mesh(
                      new THREE.BoxGeometry(0.05, 0.05, descriptor.depth - 0.6),
                      descriptor.glow
                  );
        glow.position.set(descriptor.x, conduitY - 0.11, descriptor.z);
        group.add(glow);
    });

    return group;
}

function createFloorMarkings(layout, material, accentMaterial) {
    const group = new THREE.Group();
    group.name = 'undergroundParkingMarkings';
    const lineY = layout.floorY + 0.02;
    const parkingHouseZone = getParkingHouseZoneLayout(layout);

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

    const roundaboutOuter = new THREE.Mesh(
        new THREE.RingGeometry(layout.coreRadius + 11.8, layout.coreRadius + 12.24, 64),
        material
    );
    roundaboutOuter.rotation.x = -Math.PI * 0.5;
    roundaboutOuter.position.set(layout.coreCenterX, lineY + 0.004, layout.coreCenterZ);
    group.add(roundaboutOuter);

    const roundaboutInner = new THREE.Mesh(
        new THREE.RingGeometry(layout.coreRadius + 6.2, layout.coreRadius + 6.58, 64),
        accentMaterial
    );
    roundaboutInner.rotation.x = -Math.PI * 0.5;
    roundaboutInner.position.set(layout.coreCenterX, lineY + 0.004, layout.coreCenterZ);
    group.add(roundaboutInner);

    const eastLane = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.02, layout.floorDepth * 0.56),
        accentMaterial
    );
    eastLane.position.set(layout.floorMaxX - 24.5, lineY, 18);
    group.add(eastLane);

    const westLane = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.02, layout.floorDepth * 0.46),
        accentMaterial
    );
    westLane.position.set(layout.floorMinX + 24.5, lineY, -10);
    group.add(westLane);

    getParkingBayGroupDescriptors(layout).forEach((descriptor) => {
        addParkingBayGroup(
            group,
            descriptor.anchorX,
            descriptor.startZ,
            descriptor.count,
            descriptor.direction,
            material
        );

        const medallion = new THREE.Mesh(
            new THREE.PlaneGeometry(2.6, 2.6),
            new THREE.MeshBasicMaterial({
                map: getParkingRoundelTexture(),
                transparent: true,
                toneMapped: false,
            })
        );
        medallion.rotation.x = -Math.PI * 0.5;
        medallion.position.set(descriptor.medallionX, lineY + 0.01, descriptor.medallionZ);
        group.add(medallion);
    });

    getRetailVenueDescriptors(layout).forEach((descriptor) => {
        addRetailFrontageMarkings(group, descriptor, lineY, material, accentMaterial);
    });

    const parkingHouseWestLine = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.02, parkingHouseZone.maxZ - parkingHouseZone.minZ - 0.88),
        accentMaterial
    );
    parkingHouseWestLine.position.set(
        parkingHouseZone.minX + 0.58,
        lineY,
        parkingHouseZone.centerZ
    );
    group.add(parkingHouseWestLine);

    const parkingHouseEastLine = parkingHouseWestLine.clone();
    parkingHouseEastLine.position.x = parkingHouseZone.maxX - 0.58;
    group.add(parkingHouseEastLine);

    const northLineLeftWidth = Math.max(0.8, parkingHouseZone.doorMinX - parkingHouseZone.minX - 0.5);
    const northLineRightWidth = Math.max(0.8, parkingHouseZone.maxX - parkingHouseZone.doorMaxX - 0.5);

    const parkingHouseNorthLineLeft = new THREE.Mesh(
        new THREE.BoxGeometry(northLineLeftWidth, 0.02, 0.12),
        accentMaterial
    );
    parkingHouseNorthLineLeft.position.set(
        parkingHouseZone.minX + 0.25 + northLineLeftWidth * 0.5,
        lineY,
        parkingHouseZone.maxZ - 0.58
    );
    group.add(parkingHouseNorthLineLeft);

    const parkingHouseNorthLineRight = new THREE.Mesh(
        new THREE.BoxGeometry(northLineRightWidth, 0.02, 0.12),
        accentMaterial
    );
    parkingHouseNorthLineRight.position.set(
        parkingHouseZone.doorMaxX + 0.25 + northLineRightWidth * 0.5,
        lineY,
        parkingHouseZone.maxZ - 0.58
    );
    group.add(parkingHouseNorthLineRight);

    const parkingHouseWalk = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 0.02, 8.2),
        material
    );
    parkingHouseWalk.position.set(
        parkingHouseZone.doorCenterX,
        lineY,
        parkingHouseZone.maxZ - 4.1
    );
    group.add(parkingHouseWalk);

    for (let index = -2; index <= 2; index += 1) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 1.6), material);
        stripe.position.set(
            parkingHouseZone.doorCenterX + index * 0.78,
            lineY,
            parkingHouseZone.maxZ - 1.7
        );
        group.add(stripe);
    }

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
        createEntrancePortalFrame(
            layout,
            portalAccentMaterial,
            trimMaterial,
            amberLineMaterial,
            lightMaterial
        )
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

    const guardReferenceZ = entrance.slopeStartZ + 0.9;
    const guardDriveHalfWidth = getEntranceHalfWidthAtZ(entrance, guardReferenceZ, 'drive');
    const guardWallHalfWidth = getEntranceHalfWidthAtZ(entrance, guardReferenceZ, 'wall');
    const shoulderWidth = Math.max(1.16, guardWallHalfWidth - guardDriveHalfWidth - 0.34);
    const guardStartZ = entrance.slopeStartZ + 0.75;
    const guardEndZ = entrance.topZ + 1.35;
    const guardDepth = Math.max(1.6, guardEndZ - guardStartZ);
    const guardCenterZ = (guardStartZ + guardEndZ) * 0.5;
    const guardHeight = 0.86;
    const guardGeometry = new THREE.BoxGeometry(shoulderWidth, guardHeight, guardDepth);
    const capGeometry = new THREE.BoxGeometry(shoulderWidth + 0.18, 0.08, guardDepth + 0.12);
    const shoulderCenterX = guardDriveHalfWidth + shoulderWidth * 0.5 + 0.2;

    for (let side = -1; side <= 1; side += 2) {
        const guard = new THREE.Mesh(guardGeometry, concreteMaterial);
        guard.position.set(
            entrance.centerX + side * shoulderCenterX,
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
    const rearFrameZ = entrance.canopyEndZ - 0.18;
    const endFrame = new THREE.Mesh(
        createEntranceCanopyGeometry(layout, {
            width: entrance.canopyHalfWidth * 2 + 0.22,
            minZ: rearFrameZ - endFrameDepth * 0.5,
            maxZ: rearFrameZ + endFrameDepth * 0.5,
            xSegments: 22,
            zSegments: 1,
            baseY: entrance.canopyBaseY + 0.02,
            archRise: entrance.canopyArchRise + 0.06,
        }),
        trimMaterial
    );
    group.add(endFrame);

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
    const rearBackdropMaterial = glassMaterial.clone();
    rearBackdropMaterial.color.set(0x203246);
    rearBackdropMaterial.opacity = 0.64;
    rearBackdropMaterial.emissive.set(0x12283a);
    rearBackdropMaterial.emissiveIntensity = 0.18;
    rearBackdropMaterial.depthWrite = false;

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
    const endFrameDepth = 0.08;
    const portalWidth = entrance.canopyHalfWidth * 2 - 0.3;

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

    const rearBackdropBottomY = wallBaseY + 0.26;
    const rearBackdropTopY = entrance.canopyBaseY + entrance.canopyArchRise * 0.64;
    const rearBackdropHeight = Math.max(2.4, rearBackdropTopY - rearBackdropBottomY);
    const rearBackdropZ = entrance.canopyEndZ - 0.22;
    const rearBackdrop = new THREE.Mesh(
        new THREE.BoxGeometry(portalWidth - 0.28, rearBackdropHeight, 0.12),
        rearBackdropMaterial
    );
    rearBackdrop.position.set(
        entrance.centerX,
        rearBackdropBottomY + rearBackdropHeight * 0.5,
        rearBackdropZ
    );
    group.add(rearBackdrop);

    const rearBackdropInnerGlow = new THREE.Mesh(
        new THREE.BoxGeometry(portalWidth - 1.18, 0.04, 0.04),
        lightMaterial
    );
    rearBackdropInnerGlow.position.set(
        entrance.centerX,
        rearBackdropBottomY + rearBackdropHeight * 0.52,
        rearBackdropZ - 0.05
    );
    group.add(rearBackdropInnerGlow);

    const rearFinCount = 7;
    const rearFinSpan = portalWidth - 1.16;
    for (let index = 0; index < rearFinCount; index += 1) {
        const finRatio = rearFinCount === 1 ? 0.5 : index / (rearFinCount - 1);
        const finX = entrance.centerX - rearFinSpan * 0.5 + rearFinSpan * finRatio;
        const finHeight = rearBackdropHeight - (index % 2 === 0 ? 0.08 : 0.34);
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, finHeight, 0.2), trimMaterial);
        fin.position.set(
            finX,
            rearBackdropBottomY + finHeight * 0.5 + 0.04,
            rearBackdropZ + 0.03
        );
        group.add(fin);
    }

    const canopyFrontDriveHalfWidth = getEntranceHalfWidthAtZ(
        entrance,
        entrance.canopyStartZ,
        'drive'
    );
    const frontShoulderWidth = Math.max(
        0.64,
        entrance.canopyHalfWidth - canopyFrontDriveHalfWidth - 0.18
    );
    const frontShoulderX =
        canopyFrontDriveHalfWidth + frontShoulderWidth * 0.5 + wallThickness * 1.75;
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

    const indicatorGeometry = new THREE.BoxGeometry(0.18, 0.18, 0.14);
    const openIndicator = new THREE.Group();
    const closedIndicator = new THREE.Group();
    [leftBaseX, rightBaseX].forEach((x) => {
        const greenIndicator = new THREE.Mesh(indicatorGeometry, greenLightMaterial);
        greenIndicator.position.set(x, 1.22, barrierZ + 0.18);
        openIndicator.add(greenIndicator);

        const redIndicator = new THREE.Mesh(indicatorGeometry, redLightMaterial);
        redIndicator.position.set(x, 1.22, barrierZ + 0.18);
        closedIndicator.add(redIndicator);
    });

    openIndicator.visible = false;
    group.add(closedIndicator);
    group.add(openIndicator);

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

function createEntrancePortalFrame(
    layout,
    accentMaterial,
    trimMaterial,
    warningMaterial,
    lightMaterial
) {
    const entrance = layout.entrance;
    const group = new THREE.Group();
    group.name = 'undergroundParkingEntrancePortal';

    const finHeight = entrance.portalClearHeight + 0.92;
    const finY = finHeight * 0.5 - 0.04;
    const finHalfWidth = getEntranceHalfWidthAtZ(entrance, entrance.portalZ, 'apron') - 0.66;

    for (let side = -1; side <= 1; side += 2) {
        const fin = new THREE.Mesh(
            new THREE.BoxGeometry(
                entrance.portalWingThickness,
                finHeight,
                entrance.portalWingDepth
            ),
            accentMaterial
        );
        fin.position.set(entrance.centerX + side * finHalfWidth, finY, entrance.portalZ);
        group.add(fin);

        const finCap = new THREE.Mesh(
            new THREE.BoxGeometry(
                entrance.portalWingThickness + 0.28,
                0.12,
                entrance.portalWingDepth + 0.16
            ),
            trimMaterial
        );
        finCap.position.set(fin.position.x, finHeight + 0.02, entrance.portalZ);
        group.add(finCap);

        const innerBlade = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, finHeight - 0.9, entrance.portalWingDepth - 0.8),
            trimMaterial
        );
        innerBlade.position.set(fin.position.x - side * 0.18, finY, entrance.portalZ - 0.06);
        group.add(innerBlade);

        const sideGlow = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, finHeight - 1.26, entrance.portalWingDepth - 1.02),
            lightMaterial
        );
        sideGlow.position.set(fin.position.x - side * 0.28, finY - 0.08, entrance.portalZ - 0.02);
        group.add(sideGlow);

        const finMarker = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.12, 0.18), warningMaterial);
        finMarker.position.set(fin.position.x + side * 0.14, 1.22, entrance.portalZ + 1.02);
        group.add(finMarker);
    }

    const topBeamWidth = finHalfWidth * 2 - 0.22;
    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(topBeamWidth, 0.62, 1.34), trimMaterial);
    topBeam.position.set(
        entrance.centerX,
        entrance.portalClearHeight + 0.3,
        entrance.portalZ - 0.18
    );
    group.add(topBeam);

    const headerBackplate = new THREE.Mesh(
        new THREE.BoxGeometry(topBeamWidth - 1.18, 0.9, 0.18),
        accentMaterial
    );
    headerBackplate.position.set(
        entrance.centerX,
        entrance.portalClearHeight + 0.28,
        entrance.portalZ + 0.54
    );
    group.add(headerBackplate);

    const warningBand = new THREE.Mesh(
        new THREE.BoxGeometry(topBeamWidth - 0.76, 0.16, 0.28),
        warningMaterial
    );
    warningBand.position.set(
        entrance.centerX,
        entrance.portalClearHeight + 0.06,
        entrance.portalZ + 0.9
    );
    group.add(warningBand);

    return group;
}

function createEntranceSignage(layout) {
    const entrance = layout.entrance;
    const group = new THREE.Group();
    group.name = 'undergroundParkingEntranceSignage';

    const portalSign = new THREE.Mesh(
        new THREE.PlaneGeometry(7.4, 1.6),
        new THREE.MeshBasicMaterial({
            map: getEntranceHeaderTexture(),
            transparent: true,
            toneMapped: false,
            side: THREE.FrontSide,
            alphaTest: 0.04,
        })
    );
    portalSign.position.set(
        entrance.centerX,
        entrance.portalClearHeight + 0.34,
        entrance.portalZ - 0.88
    );
    portalSign.rotation.y = Math.PI;
    portalSign.renderOrder = 4;
    group.add(portalSign);

    const roundelMaterial = new THREE.MeshBasicMaterial({
        map: getParkingRoundelTexture(),
        transparent: true,
        toneMapped: false,
        side: THREE.DoubleSide,
    });
    const roundelGeometry = new THREE.PlaneGeometry(1.5, 1.5);
    const leftRoundel = new THREE.Mesh(roundelGeometry, roundelMaterial);
    leftRoundel.position.set(
        entrance.centerX - getEntranceHalfWidthAtZ(entrance, entrance.portalZ, 'apron') + 0.92,
        2.48,
        entrance.portalZ - 1.18
    );
    leftRoundel.rotation.y = -Math.PI * 0.5;
    group.add(leftRoundel);

    const rightRoundel = leftRoundel.clone();
    rightRoundel.position.x =
        entrance.centerX + getEntranceHalfWidthAtZ(entrance, entrance.portalZ, 'apron') - 0.92;
    rightRoundel.rotation.y = Math.PI * 0.5;
    group.add(rightRoundel);

    return group;
}

function createEntranceLighting(layout, lightMaterial, trimMaterial) {
    const entrance = layout.entrance;
    const group = new THREE.Group();
    group.name = 'undergroundParkingEntranceLights';

    const beaconGeometry = new THREE.BoxGeometry(0.24, 0.24, 0.24);
    const finHalfWidth = getEntranceHalfWidthAtZ(entrance, entrance.portalZ, 'apron') - 0.48;
    [1.28, entrance.portalClearHeight + 0.54].forEach((y) => {
        const leftBeacon = new THREE.Mesh(beaconGeometry, lightMaterial);
        leftBeacon.position.set(entrance.centerX - finHalfWidth, y, entrance.portalZ - 1.02);
        group.add(leftBeacon);

        const rightBeacon = leftBeacon.clone();
        rightBeacon.position.x = entrance.centerX + finHalfWidth;
        group.add(rightBeacon);
    });

    const approachPylonX = getEntranceHalfWidthAtZ(entrance, entrance.slopeStartZ, 'apron') - 0.82;
    const approachPylonZ = entrance.slopeStartZ - 1.48;
    for (let side = -1; side <= 1; side += 2) {
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.86, 0.44), trimMaterial);
        pylon.position.set(entrance.centerX + side * approachPylonX, 0.93, approachPylonZ);
        group.add(pylon);

        const pylonGlow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.16, 0.08), lightMaterial);
        pylonGlow.position.set(
            entrance.centerX + side * (approachPylonX - 0.14),
            0.96,
            approachPylonZ + 0.18
        );
        group.add(pylonGlow);
    }

    const tunnelLightGeometry = new THREE.BoxGeometry(7.4, 0.08, 0.28);
    for (let index = 0; index < entrance.tunnelLightCount; index += 1) {
        const z = entrance.tunnelLightStartZ + index * entrance.tunnelLightSpacing;
        const lightBar = new THREE.Mesh(tunnelLightGeometry, lightMaterial);
        lightBar.position.set(entrance.centerX, layout.ceilingBottomY - 0.14, z);
        group.add(lightBar);
    }

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

    const accentPadPositions = [1.1, 2.85, 4.6];
    accentPadPositions.forEach((zOffset) => {
        for (let side = -1; side <= 1; side += 2) {
            const accentPad = new THREE.Mesh(
                createEntranceSurfaceGeometry(layout, {
                    width: 0.8,
                    minZ: entrance.slopeStartZ + zOffset,
                    maxZ: entrance.slopeStartZ + zOffset + 0.16,
                    centerXOffset: side * (entrance.driveHalfWidth - 0.8),
                    xSegments: 1,
                    zSegments: 1,
                    heightOffset: entrance.renderOffsetY + 0.02,
                }),
                amberLineMaterial
            );
            group.add(accentPad);
        }
    });

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

function createRetailVenue(
    descriptor,
    baseY,
    trimMaterial,
    lightMaterial,
    warmLightMaterial,
    coralLightMaterial,
    mintLightMaterial
) {
    const group = new THREE.Group();
    group.name = `undergroundVenue_${descriptor.id}`;
    const isSideFacing = descriptor.facing === 'east' || descriptor.facing === 'west';
    const orientation = getFacingOrientation(descriptor.facing);
    const shellMaterial = new THREE.MeshStandardMaterial({
        color: descriptor.shellColor,
        roughness: 0.76,
        metalness: 0.14,
        emissive: descriptor.shellEmissive || 0x09131d,
        emissiveIntensity: 0.18,
    });
    const accentGlowMaterial = selectAccentLightMaterial(
        descriptor.accentFamily,
        lightMaterial,
        warmLightMaterial,
        coralLightMaterial,
        mintLightMaterial
    );
    const backlitGlassMaterial = new THREE.MeshStandardMaterial({
        color: descriptor.windowTint || 0xcfe7fb,
        roughness: 0.14,
        metalness: 0.08,
        transparent: true,
        opacity: descriptor.warmWindow ? 0.28 : 0.22,
        emissive: descriptor.warmWindow ? 0x9e5920 : 0x17334d,
        emissiveIntensity: descriptor.warmWindow ? 0.34 : 0.22,
        side: THREE.DoubleSide,
    });
    backlitGlassMaterial.depthWrite = false;

    const shell = new THREE.Mesh(
        new THREE.BoxGeometry(
            isSideFacing ? descriptor.depth : descriptor.width,
            descriptor.height,
            isSideFacing ? descriptor.width : descriptor.depth
        ),
        shellMaterial
    );
    shell.position.set(descriptor.x, baseY + descriptor.height * 0.5, descriptor.z);
    group.add(shell);

    const roofCap = new THREE.Mesh(
        new THREE.BoxGeometry(
            (isSideFacing ? descriptor.depth : descriptor.width) + 0.24,
            0.12,
            (isSideFacing ? descriptor.width : descriptor.depth) + 0.24
        ),
        trimMaterial
    );
    roofCap.position.set(descriptor.x, baseY + descriptor.height + 0.06, descriptor.z);
    group.add(roofCap);

    const frontSpan = Math.max(4.2, descriptor.width - 1.4);
    const frontOffset = descriptor.depth * 0.5 + 0.05;
    const frontCenterX = descriptor.x + orientation.normalX * frontOffset;
    const frontCenterZ = descriptor.z + orientation.normalZ * frontOffset;

    const signBackplate = createFacadeBox(
        descriptor.facing,
        Math.max(3.8, descriptor.width - 1),
        1.04,
        0.16,
        new THREE.MeshStandardMaterial({
            color: descriptor.signBackplate || 0x121f2a,
            roughness: 0.38,
            metalness: 0.18,
            emissive: 0x14283b,
            emissiveIntensity: 0.16,
        })
    );
    signBackplate.position.set(
        descriptor.x + orientation.normalX * (frontOffset + 0.04),
        baseY + descriptor.height - 0.82,
        descriptor.z + orientation.normalZ * (frontOffset + 0.04)
    );
    group.add(signBackplate);

    const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.max(3.4, descriptor.width - 1.4), 0.9),
        new THREE.MeshBasicMaterial({
            map: getVenueSignTexture(
                descriptor.label,
                descriptor.accentColor,
                descriptor.signBackplate || 0x121f2a,
                descriptor.subtitle
            ),
            transparent: true,
            toneMapped: false,
            side: THREE.DoubleSide,
            alphaTest: 0.04,
        })
    );
    sign.rotation.y = getFacingPlaneRotationY(descriptor.facing);
    sign.position.set(
        descriptor.x + orientation.normalX * (frontOffset + 0.13),
        baseY + descriptor.height - 0.82,
        descriptor.z + orientation.normalZ * (frontOffset + 0.13)
    );
    sign.renderOrder = 4;
    group.add(sign);

    const awning = createFacadeBox(
        descriptor.facing,
        frontSpan + 0.16,
        0.16,
        descriptor.frontStyle === 'garage' ? 0.72 : 0.94,
        new THREE.MeshStandardMaterial({
            color: descriptor.awningColor || descriptor.accentColor,
            roughness: 0.52,
            metalness: 0.12,
            emissive: descriptor.awningColor || descriptor.accentColor,
            emissiveIntensity: 0.1,
        })
    );
    awning.position.set(
        descriptor.x + orientation.normalX * (frontOffset + 0.34),
        baseY + descriptor.height - 1.55,
        descriptor.z + orientation.normalZ * (frontOffset + 0.34)
    );
    group.add(awning);

    if (descriptor.frontStyle === 'garage') {
        const shutter = createFacadeBox(
            descriptor.facing,
            frontSpan,
            descriptor.height - 1.9,
            0.12,
            new THREE.MeshStandardMaterial({
                color: 0x55697c,
                roughness: 0.48,
                metalness: 0.28,
                emissive: 0x101e2b,
                emissiveIntensity: 0.12,
            })
        );
        shutter.position.set(frontCenterX, baseY + (descriptor.height - 1.9) * 0.5 + 0.54, frontCenterZ);
        group.add(shutter);

        for (
            let y = baseY + 0.98;
            y < baseY + descriptor.height - 0.96;
            y += 0.42
        ) {
            const slat = createFacadeBox(
                descriptor.facing,
                frontSpan - 0.22,
                0.04,
                0.03,
                accentGlowMaterial
            );
            slat.position.set(
                descriptor.x + orientation.normalX * (frontOffset + 0.08),
                y,
                descriptor.z + orientation.normalZ * (frontOffset + 0.08)
            );
            group.add(slat);
        }
    } else {
        const windowHeight = Math.max(1.8, descriptor.height - 2.1);
        const window = createFacadeBox(
            descriptor.facing,
            frontSpan,
            windowHeight,
            0.08,
            backlitGlassMaterial
        );
        window.position.set(frontCenterX, baseY + windowHeight * 0.5 + 0.6, frontCenterZ);
        group.add(window);

        const interiorGlow = createFacadeBox(
            descriptor.facing,
            frontSpan - 0.5,
            0.08,
            Math.max(0.36, descriptor.depth - 1),
            accentGlowMaterial
        );
        interiorGlow.position.set(
            descriptor.x - orientation.normalX * Math.max(0.2, descriptor.depth * 0.12),
            baseY + 1.24,
            descriptor.z - orientation.normalZ * Math.max(0.2, descriptor.depth * 0.12)
        );
        group.add(interiorGlow);

        const mullionOffsets = [-0.3, 0, 0.3];
        mullionOffsets.forEach((ratio) => {
            const offset = ratio * frontSpan;
            const mullion = createFacadeBox(
                descriptor.facing,
                0.12,
                windowHeight + 0.04,
                0.1,
                trimMaterial
            );
            mullion.position.set(
                frontCenterX + orientation.tangentX * offset,
                baseY + windowHeight * 0.5 + 0.62,
                frontCenterZ + orientation.tangentZ * offset
            );
            group.add(mullion);
        });
    }

    const sideGlowOffsets = [-frontSpan * 0.5 + 0.3, frontSpan * 0.5 - 0.3];
    sideGlowOffsets.forEach((offset) => {
        const sideGlow = createFacadeBox(
            descriptor.facing,
            0.08,
            descriptor.height - 1.3,
            0.05,
            accentGlowMaterial
        );
        sideGlow.position.set(
            descriptor.x + orientation.tangentX * offset + orientation.normalX * (frontOffset + 0.08),
            baseY + descriptor.height * 0.5 - 0.16,
            descriptor.z + orientation.tangentZ * offset + orientation.normalZ * (frontOffset + 0.08)
        );
        group.add(sideGlow);
    });

    const apron = createFacadeFloorPad(descriptor, baseY, descriptor.accentColor);
    group.add(apron);

    return group;
}

function createFreestandingKiosk(
    descriptor,
    baseY,
    trimMaterial,
    lightMaterial,
    warmLightMaterial
) {
    const group = new THREE.Group();
    group.name = `undergroundKiosk_${descriptor.id}`;
    const shellMaterial = new THREE.MeshStandardMaterial({
        color: descriptor.shellColor || 0x1c2733,
        roughness: 0.7,
        metalness: 0.16,
        emissive: 0x0e1822,
        emissiveIntensity: 0.14,
    });
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0xd9edf7,
        roughness: 0.16,
        metalness: 0.06,
        transparent: true,
        opacity: 0.22,
        emissive: 0x7a4218,
        emissiveIntensity: 0.24,
        side: THREE.DoubleSide,
    });
    glassMaterial.depthWrite = false;
    const accentMaterial = descriptor.warmAccent ? warmLightMaterial : lightMaterial;

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(descriptor.size, descriptor.height, descriptor.size),
        shellMaterial
    );
    body.position.set(descriptor.x, baseY + descriptor.height * 0.5, descriptor.z);
    group.add(body);

    const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(descriptor.size + 0.4, 0.18, descriptor.size + 0.4),
        trimMaterial
    );
    canopy.position.set(descriptor.x, baseY + descriptor.height + 0.12, descriptor.z);
    group.add(canopy);

    const windowSpan = descriptor.size - 1.2;
    [
        { x: descriptor.x + descriptor.size * 0.5 + 0.04, z: descriptor.z, facing: 'east' },
        { x: descriptor.x - descriptor.size * 0.5 - 0.04, z: descriptor.z, facing: 'west' },
        { x: descriptor.x, z: descriptor.z + descriptor.size * 0.5 + 0.04, facing: 'south' },
        { x: descriptor.x, z: descriptor.z - descriptor.size * 0.5 - 0.04, facing: 'north' },
    ].forEach((panel) => {
        const glass = createFacadeBox(panel.facing, windowSpan, descriptor.height - 1.3, 0.06, glassMaterial);
        glass.position.set(panel.x, baseY + descriptor.height * 0.5 - 0.12, panel.z);
        group.add(glass);
    });

    const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(descriptor.size + 0.5, 0.84),
        new THREE.MeshBasicMaterial({
            map: getVenueSignTexture(
                descriptor.label,
                descriptor.accentColor,
                descriptor.signBackplate || 0x111c27,
                descriptor.subtitle
            ),
            transparent: true,
            toneMapped: false,
            side: THREE.DoubleSide,
            alphaTest: 0.04,
        })
    );
    sign.position.set(descriptor.x, baseY + descriptor.height + 0.02, descriptor.z + descriptor.size * 0.5 + 0.18);
    group.add(sign);

    const totem = new THREE.Mesh(new THREE.BoxGeometry(0.44, 3.4, 0.44), trimMaterial);
    totem.position.set(descriptor.x + descriptor.size * 0.72, baseY + 1.7, descriptor.z - descriptor.size * 0.68);
    group.add(totem);

    const totemGlow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.72, 0.08), accentMaterial);
    totemGlow.position.set(totem.position.x, baseY + 2.02, totem.position.z + 0.12);
    group.add(totemGlow);

    const baseGlow = new THREE.Mesh(
        new THREE.BoxGeometry(descriptor.size - 1.2, 0.08, descriptor.size - 1.2),
        accentMaterial
    );
    baseGlow.position.set(descriptor.x, baseY + 0.64, descriptor.z);
    group.add(baseGlow);

    return group;
}

function addDriveThroughFrameRun(
    group,
    { centerX = 0, width = 8, height = 3.2, zPositions = [], baseY = FLOOR_Y, trimMaterial, lightMaterials = [] }
) {
    zPositions.forEach((z, index) => {
        const lightMaterial = lightMaterials[index % lightMaterials.length] || lightMaterials[0];
        const postOffsetX = width * 0.5;

        const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.24, height, 0.24), trimMaterial);
        leftPost.position.set(centerX - postOffsetX, baseY + height * 0.5, z);
        group.add(leftPost);

        const rightPost = leftPost.clone();
        rightPost.position.x = centerX + postOffsetX;
        group.add(rightPost);

        const topBeam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.48, 0.22, 0.28), trimMaterial);
        topBeam.position.set(centerX, baseY + height + 0.08, z);
        group.add(topBeam);

        if (lightMaterial) {
            const innerGlow = new THREE.Mesh(new THREE.BoxGeometry(width - 0.72, 0.06, 0.08), lightMaterial);
            innerGlow.position.set(centerX, baseY + height - 0.18, z);
            group.add(innerGlow);

            const sideLeftGlow = new THREE.Mesh(new THREE.BoxGeometry(0.06, height - 0.8, 0.06), lightMaterial);
            sideLeftGlow.position.set(centerX - postOffsetX + 0.12, baseY + height * 0.5 - 0.04, z + 0.12);
            group.add(sideLeftGlow);

            const sideRightGlow = sideLeftGlow.clone();
            sideRightGlow.position.x = centerX + postOffsetX - 0.12;
            group.add(sideRightGlow);
        }
    });
}

function createWayfindingTotem(descriptor, baseY, trimMaterial) {
    const group = new THREE.Group();
    group.name = `undergroundWayfinding_${descriptor.label}`;

    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.54, 3.8, 0.54), trimMaterial);
    mast.position.set(descriptor.x, baseY + 1.9, descriptor.z);
    group.add(mast);

    const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 0.84),
        new THREE.MeshBasicMaterial({
            map: getVenueSignTexture(
                descriptor.label,
                descriptor.accentColor,
                0x101923,
                descriptor.subtitle
            ),
            transparent: true,
            toneMapped: false,
            side: THREE.DoubleSide,
            alphaTest: 0.04,
        })
    );
    panel.position.set(descriptor.x, baseY + 2.72, descriptor.z + 0.34);
    group.add(panel);

    return group;
}

function addRetailFrontageMarkings(group, descriptor, lineY, material, accentMaterial) {
    const orientation = getFacingOrientation(descriptor.facing);
    const frontSpan = Math.max(3.6, descriptor.width - 2.2);
    const stopLineDistance = descriptor.depth * 0.5 + 1.64;
    const stopLine = createFacadeBox(descriptor.facing, frontSpan, 0.02, 0.12, accentMaterial);
    stopLine.position.set(
        descriptor.x + orientation.normalX * stopLineDistance,
        lineY,
        descriptor.z + orientation.normalZ * stopLineDistance
    );
    group.add(stopLine);

    const stripeCount = 5;
    for (let index = 0; index < stripeCount; index += 1) {
        const stripeOffset = descriptor.depth * 0.5 + 0.72 + index * 0.34;
        const stripe = createFacadeBox(
            descriptor.facing,
            Math.min(frontSpan * 0.68, 5.4),
            0.02,
            0.16,
            material
        );
        stripe.position.set(
            descriptor.x + orientation.normalX * stripeOffset,
            lineY,
            descriptor.z + orientation.normalZ * stripeOffset
        );
        group.add(stripe);
    }
}

function createFacadeFloorPad(descriptor, baseY, accentColor) {
    const orientation = getFacingOrientation(descriptor.facing);
    const padMaterial = new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.14,
        toneMapped: false,
    });
    const pad = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.max(3.2, descriptor.width - 1.1), 1.8),
        padMaterial
    );
    pad.rotation.x = -Math.PI * 0.5;
    pad.position.set(
        descriptor.x + orientation.normalX * (descriptor.depth * 0.5 + 0.98),
        baseY + 0.03,
        descriptor.z + orientation.normalZ * (descriptor.depth * 0.5 + 0.98)
    );
    return pad;
}

function createFacadeBox(facing, span, height, thickness, material) {
    return new THREE.Mesh(
        facing === 'east' || facing === 'west'
            ? new THREE.BoxGeometry(Math.max(0.05, thickness), Math.max(0.04, height), Math.max(0.05, span))
            : new THREE.BoxGeometry(Math.max(0.05, span), Math.max(0.04, height), Math.max(0.05, thickness)),
        material
    );
}

function getFacingOrientation(facing = 'north') {
    if (facing === 'east') {
        return { normalX: 1, normalZ: 0, tangentX: 0, tangentZ: 1 };
    }
    if (facing === 'west') {
        return { normalX: -1, normalZ: 0, tangentX: 0, tangentZ: 1 };
    }
    if (facing === 'south') {
        return { normalX: 0, normalZ: 1, tangentX: 1, tangentZ: 0 };
    }
    return { normalX: 0, normalZ: -1, tangentX: 1, tangentZ: 0 };
}

function getFacingPlaneRotationY(facing = 'north') {
    if (facing === 'east') {
        return -Math.PI * 0.5;
    }
    if (facing === 'west') {
        return Math.PI * 0.5;
    }
    if (facing === 'south') {
        return Math.PI;
    }
    return 0;
}

function selectAccentLightMaterial(
    accentFamily,
    lightMaterial,
    warmLightMaterial,
    coralLightMaterial,
    mintLightMaterial
) {
    if (accentFamily === 'warm') {
        return warmLightMaterial;
    }
    if (accentFamily === 'coral') {
        return coralLightMaterial;
    }
    if (accentFamily === 'mint') {
        return mintLightMaterial;
    }
    return lightMaterial;
}

function getDriveIslandDescriptors(layout) {
    return [
        { x: layout.centerX - 18, z: -41, width: 8.4, depth: 8, warmAccent: true },
        { x: layout.centerX + 18, z: -41, width: 8.4, depth: 8, warmAccent: false },
        { x: layout.centerX - 29, z: 8, width: 10, depth: 26, warmAccent: false },
        { x: layout.centerX + 31, z: 28, width: 10, depth: 24, warmAccent: true },
        { x: layout.centerX, z: layout.floorMaxZ - 21, width: 24, depth: 8, warmAccent: false },
    ];
}

function getParkingHouseZoneLayout(layout) {
    const minX = layout.coreCenterX - 22.8;
    const maxX = layout.coreCenterX + 22.8;
    const minZ = layout.entrance.landingEndZ - 1.8;
    const maxZ = layout.coreCenterZ + 19.6;
    const doorWidth = 10.8;
    const fixedPanelWidth = 1.52;
    const southOpeningWidth = Math.max(10.8, layout.entrance.driveHalfWidth * 2 + 1.4);

    return {
        minX,
        maxX,
        minZ,
        maxZ,
        centerX: (minX + maxX) * 0.5,
        centerZ: (minZ + maxZ) * 0.5,
        doorCenterX: layout.coreCenterX,
        doorMinX: layout.coreCenterX - doorWidth * 0.5,
        doorMaxX: layout.coreCenterX + doorWidth * 0.5,
        southOpeningMinX: layout.entrance.centerX - southOpeningWidth * 0.5,
        southOpeningMaxX: layout.entrance.centerX + southOpeningWidth * 0.5,
        doorWidth,
        fixedPanelWidth,
        slidingOpeningWidth: doorWidth - fixedPanelWidth * 2,
        doorHeight: 3.4,
        doorBottomY: layout.floorY + 0.24,
    };
}

function getParkingBayGroupDescriptors(layout) {
    const zone = getParkingHouseZoneLayout(layout);

    return [
        {
            anchorX: zone.minX + 3.2,
            startZ: zone.minZ + 4.2,
            count: 2,
            direction: 1,
            medallionX: zone.minX + 6.2,
            medallionZ: zone.minZ + 10.8,
        },
        {
            anchorX: zone.maxX - 3.2,
            startZ: zone.minZ + 4.2,
            count: 2,
            direction: -1,
            medallionX: zone.maxX - 6.2,
            medallionZ: zone.minZ + 10.8,
        },
        {
            anchorX: zone.minX + 3.2,
            startZ: zone.maxZ - 11.4,
            count: 2,
            direction: 1,
            medallionX: zone.minX + 6.2,
            medallionZ: zone.maxZ - 5.4,
        },
        {
            anchorX: zone.maxX - 3.2,
            startZ: zone.maxZ - 11.4,
            count: 2,
            direction: -1,
            medallionX: zone.maxX - 6.2,
            medallionZ: zone.maxZ - 5.4,
        },
    ];
}

function getFreestandingKioskDescriptors(layout) {
    return [
        {
            id: 'kiosk_mid',
            x: layout.centerX - 18,
            z: 42,
            size: 5.4,
            height: 3.3,
            label: 'KIOSK',
            subtitle: 'quick stop',
            accentColor: 0xffb489,
            signBackplate: 0x2c1712,
            warmAccent: true,
        },
        {
            id: 'info_hub',
            x: layout.centerX + 20,
            z: -2,
            size: 4.8,
            height: 3.1,
            label: 'INFO',
            subtitle: 'route hub',
            accentColor: 0x8deaff,
            signBackplate: 0x101f2f,
            warmAccent: false,
        },
    ];
}

function getRetailVenueDescriptors(layout) {
    const westX = layout.floorMinX + 4.2;
    const eastX = layout.floorMaxX - 4.6;
    const northZ = layout.floorMaxZ - 4.6;
    const southZ = layout.floorMinZ + 4.4;

    return [
        {
            id: 'kohvik',
            label: 'KOHVIK',
            subtitle: 'slow brew // glass lounge',
            x: westX,
            z: -52,
            width: 24,
            depth: 7.6,
            height: 4.2,
            facing: 'east',
            accentFamily: 'warm',
            accentColor: 0xffcf83,
            shellColor: 0x231c18,
            shellEmissive: 0x150e08,
            signBackplate: 0x2b1910,
            awningColor: 0x7f451d,
            frontStyle: 'glass',
            warmWindow: true,
            windowTint: 0xffe2c0,
        },
        {
            id: 'kiosk_wall',
            label: 'KIOSK',
            subtitle: 'zines // snacks',
            x: westX - 0.4,
            z: -16,
            width: 13.4,
            depth: 5.6,
            height: 3.4,
            facing: 'east',
            accentFamily: 'coral',
            accentColor: 0xff9b86,
            shellColor: 0x2a1d22,
            signBackplate: 0x2e1820,
            awningColor: 0x6a2434,
            frontStyle: 'glass',
            warmWindow: true,
            windowTint: 0xffdcc6,
        },
        {
            id: 'ateljee',
            label: 'ATELJEE',
            subtitle: 'capsule shop',
            x: westX,
            z: 28,
            width: 18.4,
            depth: 6.6,
            height: 3.8,
            facing: 'east',
            accentFamily: 'cool',
            accentColor: 0x8deaff,
            shellColor: 0x172230,
            signBackplate: 0x132331,
            awningColor: 0x244766,
            frontStyle: 'glass',
            warmWindow: false,
            windowTint: 0xc9efff,
        },
        {
            id: 'tune_lane',
            label: 'TUNE',
            subtitle: 'midnight garage',
            x: eastX,
            z: -46,
            width: 24,
            depth: 8.4,
            height: 4.4,
            facing: 'west',
            accentFamily: 'cool',
            accentColor: 0x8deaff,
            shellColor: 0x16212c,
            signBackplate: 0x122231,
            awningColor: 0x254d73,
            frontStyle: 'garage',
            warmWindow: false,
        },
        {
            id: 'pesula',
            label: 'PESULA',
            subtitle: 'mist tunnel',
            x: eastX - 0.2,
            z: 6,
            width: 18.6,
            depth: 7.2,
            height: 3.8,
            facing: 'west',
            accentFamily: 'mint',
            accentColor: 0x92ffd4,
            shellColor: 0x15261f,
            signBackplate: 0x13251e,
            awningColor: 0x27584a,
            frontStyle: 'garage',
            warmWindow: false,
        },
        {
            id: 'mini_market',
            label: 'MARKET',
            subtitle: '24h mini mart',
            x: eastX - 0.1,
            z: 50,
            width: 22,
            depth: 6.8,
            height: 3.8,
            facing: 'west',
            accentFamily: 'warm',
            accentColor: 0xffcf83,
            shellColor: 0x241e18,
            signBackplate: 0x2d1e13,
            awningColor: 0x7a4b20,
            frontStyle: 'glass',
            warmWindow: true,
            windowTint: 0xffdfb9,
        },
        {
            id: 'arkaad',
            label: 'ARKAAD',
            subtitle: 'late play',
            x: -28,
            z: northZ,
            width: 22,
            depth: 7.2,
            height: 3.9,
            facing: 'south',
            accentFamily: 'coral',
            accentColor: 0xff8fc0,
            shellColor: 0x261c2b,
            signBackplate: 0x241628,
            awningColor: 0x6e2757,
            frontStyle: 'glass',
            warmWindow: false,
            windowTint: 0xe6d4ff,
        },
        {
            id: 'snack_bar',
            label: 'SNACK',
            subtitle: 'bites // espresso',
            x: 28,
            z: northZ,
            width: 24,
            depth: 7.4,
            height: 3.9,
            facing: 'south',
            accentFamily: 'mint',
            accentColor: 0x92ffd4,
            shellColor: 0x18241f,
            signBackplate: 0x13211b,
            awningColor: 0x275949,
            frontStyle: 'glass',
            warmWindow: true,
            windowTint: 0xffdfc4,
        },
        {
            id: 'pagar',
            label: 'PAGAR',
            subtitle: 'hidden corner',
            x: -24,
            z: southZ,
            width: 18,
            depth: 6.8,
            height: 3.8,
            facing: 'north',
            accentFamily: 'warm',
            accentColor: 0xffcf83,
            shellColor: 0x2a2018,
            signBackplate: 0x2a1b11,
            awningColor: 0x784521,
            frontStyle: 'glass',
            warmWindow: true,
            windowTint: 0xffe3c3,
        },
    ];
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

    registerUndergroundParkingInteriorObstacles(layout, undergroundRange);
    registerUndergroundParkingEntranceObstacles(layout);
}

function registerUndergroundParkingInteriorObstacles(layout, verticalRange) {
    const parkingHouseZone = getParkingHouseZoneLayout(layout);

    addObstacleCircle(
        layout.coreCenterX,
        layout.coreCenterZ,
        layout.coreRadius + 0.78,
        'building',
        verticalRange
    );

    getColumnPositions(layout).forEach(([x, z]) => {
        addObstacleCircle(x, z, 0.78, 'building', verticalRange);
    });

    getDriveIslandDescriptors(layout).forEach((descriptor) => {
        addObstacleAabb(
            descriptor.x,
            descriptor.z,
            descriptor.width,
            descriptor.depth,
            0.12,
            'building',
            verticalRange
        );
    });

    getRetailVenueDescriptors(layout).forEach((descriptor) => {
        const footprint = getVenueObstacleFootprint(descriptor);
        addObstacleAabb(
            descriptor.x,
            descriptor.z,
            footprint.width,
            footprint.depth,
            0.12,
            'building',
            verticalRange
        );
    });

    getFreestandingKioskDescriptors(layout).forEach((descriptor) => {
        addObstacleAabb(
            descriptor.x,
            descriptor.z,
            descriptor.size,
            descriptor.size,
            0.08,
            'building',
            verticalRange
        );
    });

    addObstacleAabb(
        parkingHouseZone.minX,
        parkingHouseZone.centerZ,
        0.42,
        parkingHouseZone.maxZ - parkingHouseZone.minZ,
        0.02,
        'building',
        verticalRange
    );
    addObstacleAabb(
        parkingHouseZone.maxX,
        parkingHouseZone.centerZ,
        0.42,
        parkingHouseZone.maxZ - parkingHouseZone.minZ,
        0.02,
        'building',
        verticalRange
    );

    const northWallLeftWidth = Math.max(0.5, parkingHouseZone.doorMinX - parkingHouseZone.minX);
    const northWallRightWidth = Math.max(0.5, parkingHouseZone.maxX - parkingHouseZone.doorMaxX);
    const southWallLeftWidth = Math.max(0.5, parkingHouseZone.southOpeningMinX - parkingHouseZone.minX);
    const southWallRightWidth = Math.max(0.5, parkingHouseZone.maxX - parkingHouseZone.southOpeningMaxX);

    addObstacleAabb(
        parkingHouseZone.minX + northWallLeftWidth * 0.5,
        parkingHouseZone.maxZ,
        northWallLeftWidth,
        0.42,
        0.02,
        'building',
        verticalRange
    );
    addObstacleAabb(
        parkingHouseZone.doorMaxX + northWallRightWidth * 0.5,
        parkingHouseZone.maxZ,
        northWallRightWidth,
        0.42,
        0.02,
        'building',
        verticalRange
    );
    addObstacleAabb(
        parkingHouseZone.doorMinX + parkingHouseZone.fixedPanelWidth * 0.5,
        parkingHouseZone.maxZ,
        parkingHouseZone.fixedPanelWidth,
        0.42,
        0.02,
        'building',
        verticalRange
    );
    addObstacleAabb(
        parkingHouseZone.doorMaxX - parkingHouseZone.fixedPanelWidth * 0.5,
        parkingHouseZone.maxZ,
        parkingHouseZone.fixedPanelWidth,
        0.42,
        0.02,
        'building',
        verticalRange
    );
    addObstacleAabb(
        parkingHouseZone.minX + southWallLeftWidth * 0.5,
        parkingHouseZone.minZ,
        southWallLeftWidth,
        0.42,
        0.02,
        'building',
        verticalRange
    );
    addObstacleAabb(
        parkingHouseZone.southOpeningMaxX + southWallRightWidth * 0.5,
        parkingHouseZone.minZ,
        southWallRightWidth,
        0.42,
        0.02,
        'building',
        verticalRange
    );
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

    const guardReferenceZ = entrance.slopeStartZ + 0.9;
    const guardDriveHalfWidth = getEntranceHalfWidthAtZ(entrance, guardReferenceZ, 'drive');
    const guardWallHalfWidth = getEntranceHalfWidthAtZ(entrance, guardReferenceZ, 'wall');
    const shoulderWidth = Math.max(1.16, guardWallHalfWidth - guardDriveHalfWidth - 0.34);
    const shoulderStartZ = entrance.slopeStartZ + 0.75;
    const shoulderEndZ = entrance.topZ + 1.35;
    const shoulderDepth = Math.max(1.6, shoulderEndZ - shoulderStartZ);
    const shoulderCenterZ = (shoulderStartZ + shoulderEndZ) * 0.5;
    const shoulderRange = {
        minY: layout.surfaceY - 0.2,
        maxY: layout.surfaceY + 2.2,
    };
    const shoulderCenterX = guardDriveHalfWidth + shoulderWidth * 0.5 + 0.2;

    addObstacleAabb(
        entrance.centerX - shoulderCenterX,
        shoulderCenterZ,
        shoulderWidth + 0.1,
        shoulderDepth,
        0,
        'building',
        shoulderRange
    );
    addObstacleAabb(
        entrance.centerX + shoulderCenterX,
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

    const canopyFrontDriveHalfWidth = getEntranceHalfWidthAtZ(
        entrance,
        entrance.canopyStartZ,
        'drive'
    );
    const frontShoulderWidth = Math.max(
        0.64,
        entrance.canopyHalfWidth - canopyFrontDriveHalfWidth - 0.18
    );
    const frontShoulderCenterX =
        canopyFrontDriveHalfWidth + frontShoulderWidth * 0.5 + 0.14;
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

function getVenueObstacleFootprint(descriptor) {
    if (descriptor.facing === 'east' || descriptor.facing === 'west') {
        return {
            width: descriptor.depth,
            depth: descriptor.width,
        };
    }

    return {
        width: descriptor.width,
        depth: descriptor.depth,
    };
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

function getEntranceHeaderTexture() {
    if (entranceHeaderTexture) {
        return entranceHeaderTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        entranceHeaderTexture = new THREE.CanvasTexture(canvas);
        entranceHeaderTexture.colorSpace = THREE.SRGBColorSpace;
        return entranceHeaderTexture;
    }

    drawRoundedRectPath(ctx, 10, 18, canvas.width - 20, canvas.height - 36, 38);
    const bgGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    bgGradient.addColorStop(0, 'rgba(10, 25, 38, 0.98)');
    bgGradient.addColorStop(0.52, 'rgba(30, 63, 89, 0.98)');
    bgGradient.addColorStop(1, 'rgba(13, 30, 45, 0.98)');
    ctx.fillStyle = bgGradient;
    ctx.fill();

    ctx.strokeStyle = 'rgba(201, 233, 255, 0.78)';
    ctx.lineWidth = 6;
    ctx.stroke();

    for (let y = 40; y < canvas.height - 24; y += 18) {
        ctx.fillStyle = y % 36 === 0 ? 'rgba(255, 255, 255, 0.035)' : 'rgba(255, 255, 255, 0.02)';
        ctx.fillRect(24, y, canvas.width - 48, 5);
    }

    drawRoundedRectPath(ctx, 42, 54, 132, 132, 28);
    const iconGradient = ctx.createLinearGradient(42, 54, 174, 186);
    iconGradient.addColorStop(0, '#ffdca8');
    iconGradient.addColorStop(1, '#ffb65c');
    ctx.fillStyle = iconGradient;
    ctx.fill();

    ctx.fillStyle = '#0d1722';
    ctx.font = '900 102px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', 108, 120);

    drawRoundedRectPath(ctx, 808, 52, 168, 50, 18);
    ctx.fillStyle = 'rgba(11, 19, 28, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 207, 131, 0.78)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffcf83';
    ctx.font = '700 28px Arial';
    ctx.fillText('24H ENTRY', 892, 77);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#f6fbff';
    ctx.font = '700 80px Arial';
    ctx.fillText('PARKIMISMAJA', 216, 114);

    ctx.fillStyle = 'rgba(193, 231, 255, 0.95)';
    ctx.font = '600 34px Arial';
    ctx.fillText('SISSEPÄÄS', 218, 164);

    ctx.fillStyle = 'rgba(160, 210, 240, 0.92)';
    ctx.font = '600 24px Arial';
    ctx.fillText('AUTOMAATVÄRAV // TASE P1', 218, 208);

    entranceHeaderTexture = new THREE.CanvasTexture(canvas);
    entranceHeaderTexture.colorSpace = THREE.SRGBColorSpace;
    return entranceHeaderTexture;
}

function getParkingRoundelTexture() {
    if (parkingRoundelTexture) {
        return parkingRoundelTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        parkingRoundelTexture = new THREE.CanvasTexture(canvas);
        parkingRoundelTexture.colorSpace = THREE.SRGBColorSpace;
        return parkingRoundelTexture;
    }

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
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(center, center, 176, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 207, 131, 0.92)';
    ctx.lineWidth = 12;
    ctx.setLineDash([16, 18]);
    ctx.beginPath();
    ctx.arc(center, center, 144, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ffcf83';
    ctx.beginPath();
    ctx.arc(center, center, 118, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#102030';
    ctx.font = '900 214px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', center, center + 8);

    parkingRoundelTexture = new THREE.CanvasTexture(canvas);
    parkingRoundelTexture.colorSpace = THREE.SRGBColorSpace;
    return parkingRoundelTexture;
}

function getParkingGuidanceSignTexture() {
    if (parkingGuidanceSignTexture) {
        return parkingGuidanceSignTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 220;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        parkingGuidanceSignTexture = new THREE.CanvasTexture(canvas);
        parkingGuidanceSignTexture.colorSpace = THREE.SRGBColorSpace;
        return parkingGuidanceSignTexture;
    }

    ctx.fillStyle = '#144c96';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#f4f8fb';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    ctx.fillStyle = '#f4f8fb';
    ctx.fillRect(38, 34, 128, 152);

    ctx.fillStyle = '#144c96';
    ctx.font = '700 116px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', 102, 112);

    ctx.fillStyle = '#f4f8fb';
    ctx.font = '700 76px Arial';
    ctx.fillText('P1', 302, 90);

    ctx.font = '600 34px Arial';
    ctx.fillText('PARKLA', 452, 92);

    ctx.fillStyle = 'rgba(244, 248, 251, 0.86)';
    ctx.font = '600 24px Arial';
    ctx.fillText('AINULT PARKIMINE', 398, 154);

    parkingGuidanceSignTexture = new THREE.CanvasTexture(canvas);
    parkingGuidanceSignTexture.colorSpace = THREE.SRGBColorSpace;
    return parkingGuidanceSignTexture;
}

function getVenueSignTexture(label, accentColor = 0xffcf83, backplateColor = 0x12202d, subtitle = '') {
    const key = `${label}|${accentColor}|${backplateColor}|${subtitle}`;
    const cached = venueSignTextureCache.get(key);
    if (cached) {
        return cached;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 220;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        const fallbackTexture = new THREE.CanvasTexture(canvas);
        fallbackTexture.colorSpace = THREE.SRGBColorSpace;
        venueSignTextureCache.set(key, fallbackTexture);
        return fallbackTexture;
    }

    const bgCss = toCssColor(backplateColor);
    const accentCss = toCssColor(accentColor);

    drawRoundedRectPath(ctx, 12, 16, canvas.width - 24, canvas.height - 32, 34);
    const bgGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    bgGradient.addColorStop(0, bgCss);
    bgGradient.addColorStop(0.5, mixCssColor(bgCss, accentCss, 0.18));
    bgGradient.addColorStop(1, bgCss);
    ctx.fillStyle = bgGradient;
    ctx.fill();

    ctx.strokeStyle = mixCssColor(accentCss, '#f7fbff', 0.32);
    ctx.lineWidth = 4;
    ctx.stroke();

    for (let x = 38; x < canvas.width - 26; x += 34) {
        ctx.fillStyle = x % 68 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.025)';
        ctx.fillRect(x, 34, 10, canvas.height - 68);
    }

    ctx.fillStyle = accentCss;
    ctx.fillRect(32, canvas.height - 42, canvas.width - 64, 8);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f7fbff';
    ctx.font = '700 76px Arial';
    ctx.fillText(label, canvas.width * 0.5, 94);

    if (subtitle) {
        ctx.fillStyle = mixCssColor('#dce8f4', accentCss, 0.36);
        ctx.font = '600 22px Arial';
        ctx.fillText(subtitle.toUpperCase(), canvas.width * 0.5, 156);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    venueSignTextureCache.set(key, texture);
    return texture;
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

function toCssColor(colorValue) {
    const numeric = Number(colorValue);
    if (!Number.isFinite(numeric)) {
        return '#ffffff';
    }
    return `#${Math.max(0, Math.min(0xffffff, numeric))
        .toString(16)
        .padStart(6, '0')}`;
}

function mixCssColor(colorA, colorB, amount = 0.5) {
    const mix = clamp01(amount);
    const a = parseCssHexColor(colorA);
    const b = parseCssHexColor(colorB);
    const r = Math.round(THREE.MathUtils.lerp(a.r, b.r, mix));
    const g = Math.round(THREE.MathUtils.lerp(a.g, b.g, mix));
    const bl = Math.round(THREE.MathUtils.lerp(a.b, b.b, mix));
    return `rgb(${r}, ${g}, ${bl})`;
}

function parseCssHexColor(color) {
    const normalized = typeof color === 'string' ? color.replace('#', '') : 'ffffff';
    const safe =
        normalized.length === 3
            ? normalized
                  .split('')
                  .map((character) => character + character)
                  .join('')
            : normalized.padStart(6, '0').slice(0, 6);

    return {
        r: Number.parseInt(safe.slice(0, 2), 16) || 255,
        g: Number.parseInt(safe.slice(2, 4), 16) || 255,
        b: Number.parseInt(safe.slice(4, 6), 16) || 255,
    };
}

function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}
