import { CITY_GRID_SPACING } from './config.js';
import { randomFromGrid } from './grid-noise.js';

const LORIEN_GALLERY_GRID_X = -1;
const LORIEN_GALLERY_GRID_Z = 3;
const LORIEN_CONNECTED_TERRACE_GRID_X = -3;
const LORIEN_CONNECTED_TERRACE_GRID_Z = 3;
export const LORIEN_VELMORE_GALLERY_SURFACE_OFFSET = 0;
const LORIEN_ROOF_LIFT_BOTTOM_SURFACE_Y = 0.16;
const LORIEN_ROOF_LIFT_MOVE_SPEED = 6.8;
const LORIEN_ROOF_LIFT_ROOF_CAPTURE_MARGIN = 1.9;
const LORIEN_ROOF_LIFT_PLATFORM_CAPTURE_MARGIN = 1.15;
const LORIEN_ROOF_LIFT_BOARDING_HOLD_TIME = 0.42;
const LORIEN_ROOF_LIFT_AUTO_RETURN_DELAY = 0.6;
const LORIEN_ROOF_DECK_DRIVE_SIDE_MARGIN = 1.72;
const LORIEN_ROOF_DECK_DRIVE_FRONT_MARGIN = 1.54;
const LORIEN_ROOF_DECK_DRIVE_REAR_MARGIN = 1.72;
const LORIEN_ROOF_BRIDGE_DRIVE_SIDE_MARGIN = 1.42;
const LORIEN_ROOF_SIDE_BRIDGE_DRIVE_SIDE_MARGIN = 0.54;
const LORIEN_ROOF_CONNECTED_TERRACE_DRIVE_WEST_MARGIN = 1.18;
const LORIEN_ROOF_CONNECTED_TERRACE_DRIVE_EAST_MARGIN = 0.04;
const LORIEN_ROOF_CONNECTED_TERRACE_DRIVE_DEPTH_MARGIN = 1.18;
const LORIEN_ROOF_PLATFORM_DRIVE_SIDE_MARGIN = 1.34;
const LORIEN_ROOF_PLATFORM_DRIVE_FRONT_MARGIN = 0.16;
const LORIEN_ROOF_PLATFORM_DRIVE_REAR_MARGIN = 0.38;
const LORIEN_ROOF_DECK_SILENCE_FACTOR = 0.58;
const LORIEN_CONNECTED_TERRACE_SILENCE_FACTOR = 0.64;
const LORIEN_ROOF_LIFT_BOTTOM_SILENCE_FACTOR = 0.2;
const LORIEN_ROOF_LIFT_TOP_SILENCE_FACTOR = 0.72;
let lorienVelmoreDoorOpenAmount = 0;
const lorienRoofLiftRuntime = {
    initialized: false,
    currentSurfaceY: LORIEN_ROOF_LIFT_BOTTOM_SURFACE_Y,
    targetSurfaceY: LORIEN_ROOF_LIFT_BOTTOM_SURFACE_Y,
    wasPlayerOnPlatform: false,
    isMoving: false,
    platformHoldTime: 0,
    awaitingPlatformExit: false,
    upperLevelVacancyTime: 0,
};

function getDefaultLorienGalleryBuilding() {
    return getDefaultLorienBuildingForGrid(LORIEN_GALLERY_GRID_X, LORIEN_GALLERY_GRID_Z);
}

function getDefaultLorienConnectedTerraceBuilding() {
    return getDefaultLorienBuildingForGrid(
        LORIEN_CONNECTED_TERRACE_GRID_X,
        LORIEN_CONNECTED_TERRACE_GRID_Z
    );
}

function getDefaultLorienBuildingForGrid(gridX, gridZ) {
    const width = 12 + randomFromGrid(gridX, gridZ, 11) * 11;
    const depth = 12 + randomFromGrid(gridX, gridZ, 12) * 11;
    const height = 14 + randomFromGrid(gridX, gridZ, 13) * 58;

    return {
        gridX,
        gridZ,
        x: gridX * CITY_GRID_SPACING,
        z: gridZ * CITY_GRID_SPACING,
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

export function getLorienVelmoreRoofLiftLayout(building) {
    const galleryLayout = getLorienVelmoreGalleryLayout(building);
    const connectedTerraceBuilding = getDefaultLorienConnectedTerraceBuilding();
    const roofSurfaceY = galleryLayout.height + 0.26;
    const liftPlatformWidth = clamp(galleryLayout.width * 0.36, 4.8, 5.4);
    const liftPlatformDepth = clamp(galleryLayout.depth * 0.28, 6.4, 7.4);
    const liftPlatformHalfWidth = liftPlatformWidth * 0.5;
    const liftPlatformHalfDepth = liftPlatformDepth * 0.5;
    const roofDeckMinX = -galleryLayout.safeWidth + 0.36;
    const roofDeckMaxX = galleryLayout.safeWidth - 0.36;
    const roofDeckMinZ = -galleryLayout.safeDepth + 0.42;
    const roofDeckMaxZ = galleryLayout.safeDepth - 0.38;
    const bridgeMinZ = roofDeckMaxZ - 0.34;
    const desiredBridgeHalfWidth = clamp(
        Math.max(3.1, liftPlatformHalfWidth + 0.82),
        liftPlatformHalfWidth + 0.42,
        galleryLayout.safeWidth - 0.54
    );
    const shaftWidth = Math.max(liftPlatformWidth + 1.18, desiredBridgeHalfWidth * 2 + 0.72);
    const shaftDepth = liftPlatformDepth + 0.92;
    const shaftHalfWidth = shaftWidth * 0.5;
    const shaftHalfDepth = shaftDepth * 0.5;
    const shaftCenterX = 0;
    const shaftCenterZ = galleryLayout.safeDepth + liftPlatformHalfDepth + 2.36;
    const bridgeMaxZ = shaftCenterZ - liftPlatformHalfDepth + 0.72;
    const bridgeHalfWidth = Math.min(desiredBridgeHalfWidth, shaftHalfWidth - 0.28);
    const serviceLaneHalfWidth = Math.max(bridgeHalfWidth - 0.18, liftPlatformHalfWidth + 0.58);
    const serviceLaneMinZ = galleryLayout.safeDepth + 0.36;
    const serviceLaneMaxZ = shaftCenterZ + liftPlatformHalfDepth + 3.6;
    const connectedTerraceBuildingCenterX = connectedTerraceBuilding.x - galleryLayout.centerX;
    const connectedTerraceBuildingCenterZ = connectedTerraceBuilding.z - galleryLayout.centerZ;
    const connectedTerraceBuildingHalfWidth = connectedTerraceBuilding.width * 0.5;
    const connectedTerraceBuildingHalfDepth = connectedTerraceBuilding.depth * 0.5;
    const connectedTerraceBuildingMinX =
        connectedTerraceBuildingCenterX - connectedTerraceBuildingHalfWidth;
    const connectedTerraceBuildingMaxX =
        connectedTerraceBuildingCenterX + connectedTerraceBuildingHalfWidth;
    const connectedTerraceBuildingMinZ =
        connectedTerraceBuildingCenterZ - connectedTerraceBuildingHalfDepth;
    const connectedTerraceBuildingMaxZ =
        connectedTerraceBuildingCenterZ + connectedTerraceBuildingHalfDepth;
    const connectedTerraceSurfaceY = connectedTerraceBuilding.height + 0.26;
    const connectedTerraceWestOverhang = clamp(connectedTerraceBuilding.width * 0.06, 0.72, 0.98);
    const connectedTerraceEastOverhang = clamp(connectedTerraceBuilding.width * 0.15, 2.1, 2.8);
    const connectedTerraceDepthOverhang = clamp(connectedTerraceBuilding.depth * 0.08, 0.92, 1.38);
    const connectedTerraceMinX = connectedTerraceBuildingMinX - connectedTerraceWestOverhang;
    const connectedTerraceMaxX = connectedTerraceBuildingMaxX + connectedTerraceEastOverhang;
    const connectedTerraceMinZ = connectedTerraceBuildingMinZ - connectedTerraceDepthOverhang;
    const connectedTerraceMaxZ = connectedTerraceBuildingMaxZ + connectedTerraceDepthOverhang;
    const connectedTerraceHalfWidth = (connectedTerraceMaxX - connectedTerraceMinX) * 0.5;
    const connectedTerraceHalfDepth = (connectedTerraceMaxZ - connectedTerraceMinZ) * 0.5;
    const connectedTerraceCenterX = (connectedTerraceMinX + connectedTerraceMaxX) * 0.5;
    const connectedTerraceCenterZ = (connectedTerraceMinZ + connectedTerraceMaxZ) * 0.5;
    const connectedBridgeCenterZ = connectedTerraceCenterZ;
    const connectedBridgeHalfDepth = clamp(
        Math.min(galleryLayout.safeDepth * 0.32, connectedTerraceHalfDepth - 0.48),
        1.9,
        2.4
    );
    const connectedBridgeTerraceEdgeX = connectedTerraceCenterX + connectedTerraceHalfWidth - 0.28;
    const connectedBridgeRoofEdgeX = roofDeckMinX + 0.28;
    const connectedBridgeMinX = Math.min(connectedBridgeTerraceEdgeX, connectedBridgeRoofEdgeX);
    const connectedBridgeMaxX = Math.max(connectedBridgeTerraceEdgeX, connectedBridgeRoofEdgeX);
    const connectedBridgeMinSurfaceY = connectedTerraceSurfaceY;
    const connectedBridgeMaxSurfaceY = roofSurfaceY;
    const connectedBridgeOpeningHalfDepth = connectedBridgeHalfDepth + 0.24;
    return {
        ...galleryLayout,
        roofSurfaceY,
        bottomSurfaceY: LORIEN_ROOF_LIFT_BOTTOM_SURFACE_Y,
        moveSpeed: LORIEN_ROOF_LIFT_MOVE_SPEED,
        roofCaptureMargin: LORIEN_ROOF_LIFT_ROOF_CAPTURE_MARGIN,
        platformCaptureMargin: LORIEN_ROOF_LIFT_PLATFORM_CAPTURE_MARGIN,
        boardingHoldTime: LORIEN_ROOF_LIFT_BOARDING_HOLD_TIME,
        shaftCenterX,
        shaftCenterZ,
        shaftWidth,
        shaftDepth,
        shaftHalfWidth,
        shaftHalfDepth,
        liftPlatformWidth,
        liftPlatformDepth,
        liftPlatformHalfWidth,
        liftPlatformHalfDepth,
        roofDeckMinX,
        roofDeckMaxX,
        roofDeckMinZ,
        roofDeckMaxZ,
        bridgeMinZ,
        bridgeMaxZ,
        bridgeHalfWidth,
        serviceLaneHalfWidth,
        serviceLaneMinZ,
        serviceLaneMaxZ,
        connectedTerraceSurfaceY,
        connectedTerraceCenterX,
        connectedTerraceCenterZ,
        connectedTerraceHalfWidth,
        connectedTerraceHalfDepth,
        connectedTerraceMinX,
        connectedTerraceMaxX,
        connectedTerraceMinZ,
        connectedTerraceMaxZ,
        connectedTerraceBuildingMinX,
        connectedTerraceBuildingMaxX,
        connectedTerraceBuildingMinZ,
        connectedTerraceBuildingMaxZ,
        connectedBridgeCenterZ,
        connectedBridgeHalfDepth,
        connectedBridgeMinX,
        connectedBridgeMaxX,
        connectedBridgeMinSurfaceY,
        connectedBridgeMaxSurfaceY,
        connectedBridgeOpeningMinZ: connectedBridgeCenterZ - connectedBridgeOpeningHalfDepth,
        connectedBridgeOpeningMaxZ: connectedBridgeCenterZ + connectedBridgeOpeningHalfDepth,
    };
}

export function resetLorienVelmoreRoofLiftState(building) {
    const layout = getLorienVelmoreRoofLiftLayout(building);
    lorienRoofLiftRuntime.initialized = true;
    lorienRoofLiftRuntime.currentSurfaceY = layout.bottomSurfaceY;
    lorienRoofLiftRuntime.targetSurfaceY = layout.bottomSurfaceY;
    lorienRoofLiftRuntime.wasPlayerOnPlatform = false;
    lorienRoofLiftRuntime.isMoving = false;
    lorienRoofLiftRuntime.platformHoldTime = 0;
    lorienRoofLiftRuntime.awaitingPlatformExit = false;
    lorienRoofLiftRuntime.upperLevelVacancyTime = 0;
    return getLorienVelmoreRoofLiftState(building);
}

export function getLorienVelmoreRoofLiftState(building) {
    const layout = getLorienVelmoreRoofLiftLayout(building);
    ensureRoofLiftRuntimeInitialized(layout);
    return {
        currentSurfaceY: lorienRoofLiftRuntime.currentSurfaceY,
        targetSurfaceY: lorienRoofLiftRuntime.targetSurfaceY,
        isMoving: lorienRoofLiftRuntime.isMoving,
        normalizedTravel: normalizedRange(
            lorienRoofLiftRuntime.currentSurfaceY,
            layout.bottomSurfaceY,
            layout.roofSurfaceY
        ),
    };
}

export function applyLorienVelmoreRoofLiftStateSnapshot(snapshot, building) {
    const layout = getLorienVelmoreRoofLiftLayout(building);
    ensureRoofLiftRuntimeInitialized(layout);
    const maxSurfaceY = Math.max(layout.roofSurfaceY, layout.connectedTerraceSurfaceY) + 2.5;
    const currentSurfaceY = Number(snapshot?.currentSurfaceY);
    const targetSurfaceY = Number(snapshot?.targetSurfaceY);
    lorienRoofLiftRuntime.currentSurfaceY = clamp(
        Number.isFinite(currentSurfaceY) ? currentSurfaceY : lorienRoofLiftRuntime.currentSurfaceY,
        layout.bottomSurfaceY,
        maxSurfaceY
    );
    lorienRoofLiftRuntime.targetSurfaceY = clamp(
        Number.isFinite(targetSurfaceY) ? targetSurfaceY : lorienRoofLiftRuntime.targetSurfaceY,
        layout.bottomSurfaceY,
        maxSurfaceY
    );
    lorienRoofLiftRuntime.isMoving =
        Boolean(snapshot?.isMoving) &&
        Math.abs(lorienRoofLiftRuntime.currentSurfaceY - lorienRoofLiftRuntime.targetSurfaceY) >
            0.01;
    lorienRoofLiftRuntime.wasPlayerOnPlatform = false;
    lorienRoofLiftRuntime.platformHoldTime = 0;
    lorienRoofLiftRuntime.awaitingPlatformExit = false;
    lorienRoofLiftRuntime.upperLevelVacancyTime = 0;
    return getLorienVelmoreRoofLiftState(building);
}

export function updateLorienVelmoreRoofLiftState(
    playerPosition,
    deltaTime = 1 / 60,
    building,
    options = {}
) {
    const layout = getLorienVelmoreRoofLiftLayout(building);
    ensureRoofLiftRuntimeInitialized(layout);
    if (options?.authoritativeState && typeof options.authoritativeState === 'object') {
        return applyLorienVelmoreRoofLiftStateSnapshot(options.authoritativeState, building);
    }
    const playerActive = options?.playerActive !== false;
    const activePlayerPosition = playerActive ? playerPosition : null;
    const otherOccupantPositions = Array.isArray(options?.roofLiftOccupantPositions)
        ? options.roofLiftOccupantPositions
        : null;

    const resolvedDelta = Math.min(Math.max(Number(deltaTime) || 0, 0), 0.1);
    const step = layout.moveSpeed * resolvedDelta;
    lorienRoofLiftRuntime.currentSurfaceY = moveTowards(
        lorienRoofLiftRuntime.currentSurfaceY,
        lorienRoofLiftRuntime.targetSurfaceY,
        step
    );
    lorienRoofLiftRuntime.isMoving =
        Math.abs(lorienRoofLiftRuntime.currentSurfaceY - lorienRoofLiftRuntime.targetSurfaceY) >
        0.001;

    const playerOnPlatform = isPlayerOnRoofLiftPlatform(activePlayerPosition, layout);
    const playerOccupiesUpperLevel = isPlayerOccupyingRoofLiftUpperLevel(
        activePlayerPosition,
        layout
    );
    const anyOccupantOnUpperLevel =
        playerOccupiesUpperLevel ||
        doesAnyPositionOccupyRoofLiftUpperLevel(otherOccupantPositions, layout);
    if (!playerOnPlatform) {
        lorienRoofLiftRuntime.awaitingPlatformExit = false;
    }
    if (
        !lorienRoofLiftRuntime.isMoving &&
        playerOnPlatform &&
        !lorienRoofLiftRuntime.awaitingPlatformExit
    ) {
        lorienRoofLiftRuntime.platformHoldTime = Math.min(
            layout.boardingHoldTime,
            lorienRoofLiftRuntime.platformHoldTime + resolvedDelta
        );
    } else {
        lorienRoofLiftRuntime.platformHoldTime = 0;
    }
    if (
        playerOnPlatform &&
        !lorienRoofLiftRuntime.isMoving &&
        !lorienRoofLiftRuntime.awaitingPlatformExit &&
        lorienRoofLiftRuntime.platformHoldTime >= layout.boardingHoldTime
    ) {
        const playerY = Number(playerPosition?.y);
        const boardFromBottom =
            !Number.isFinite(playerY) ||
            Math.abs(playerY - layout.bottomSurfaceY) <= Math.abs(playerY - layout.roofSurfaceY);
        lorienRoofLiftRuntime.targetSurfaceY = boardFromBottom
            ? layout.roofSurfaceY
            : layout.bottomSurfaceY;
        lorienRoofLiftRuntime.isMoving = true;
        lorienRoofLiftRuntime.platformHoldTime = 0;
        lorienRoofLiftRuntime.awaitingPlatformExit = true;
    }

    if (anyOccupantOnUpperLevel) {
        lorienRoofLiftRuntime.upperLevelVacancyTime = 0;
    } else if (
        !lorienRoofLiftRuntime.isMoving &&
        lorienRoofLiftRuntime.currentSurfaceY > layout.bottomSurfaceY + 0.05 &&
        lorienRoofLiftRuntime.targetSurfaceY > layout.bottomSurfaceY + 0.05
    ) {
        lorienRoofLiftRuntime.upperLevelVacancyTime = Math.min(
            LORIEN_ROOF_LIFT_AUTO_RETURN_DELAY,
            lorienRoofLiftRuntime.upperLevelVacancyTime + resolvedDelta
        );
        if (lorienRoofLiftRuntime.upperLevelVacancyTime >= LORIEN_ROOF_LIFT_AUTO_RETURN_DELAY) {
            lorienRoofLiftRuntime.targetSurfaceY = layout.bottomSurfaceY;
            lorienRoofLiftRuntime.isMoving = true;
            lorienRoofLiftRuntime.platformHoldTime = 0;
            lorienRoofLiftRuntime.awaitingPlatformExit = false;
            lorienRoofLiftRuntime.upperLevelVacancyTime = 0;
        }
    } else {
        lorienRoofLiftRuntime.upperLevelVacancyTime = 0;
    }

    lorienRoofLiftRuntime.wasPlayerOnPlatform = playerOnPlatform;

    return getLorienVelmoreRoofLiftState(building);
}

export function sampleLorienVelmoreRoofLiftHeightWorld(x, z, building) {
    const layout = getLorienVelmoreRoofLiftLayout(building);
    ensureRoofLiftRuntimeInitialized(layout);

    const localX = x - layout.centerX;
    const localZ = z - layout.centerZ;
    if (
        isInsideLocalRect(
            localX,
            localZ,
            layout.shaftCenterX,
            layout.shaftCenterZ,
            layout.liftPlatformHalfWidth,
            layout.liftPlatformHalfDepth
        )
    ) {
        return lorienRoofLiftRuntime.currentSurfaceY;
    }
    const connectedBridgeHeight = sampleConnectedRoofBridgeHeight(localX, localZ, layout);
    if (Number.isFinite(connectedBridgeHeight)) {
        return connectedBridgeHeight;
    }
    if (
        isInsideRoofDeckDriveArea(localX, localZ, layout) ||
        isInsideRoofBridgeArea(localX, localZ, layout) ||
        isInsideConnectedTerraceArea(localX, localZ, layout)
    ) {
        return isInsideConnectedTerraceArea(localX, localZ, layout)
            ? layout.connectedTerraceSurfaceY
            : layout.roofSurfaceY;
    }
    return null;
}

export function shouldUseLorienVelmoreRoofLiftHeight(
    preferredY = null,
    x = 0,
    z = 0,
    roofLiftHeight = null,
    building
) {
    if (!Number.isFinite(roofLiftHeight)) {
        return false;
    }

    const layout = getLorienVelmoreRoofLiftLayout(building);
    const localX = x - layout.centerX;
    const localZ = z - layout.centerZ;
    if (isInsideRoofLiftShaft(localX, localZ, layout)) {
        if (!Number.isFinite(preferredY)) {
            return roofLiftHeight <= layout.bottomSurfaceY + layout.platformCaptureMargin;
        }
        return Math.abs(preferredY - roofLiftHeight) <= layout.platformCaptureMargin;
    }
    if (!Number.isFinite(preferredY)) {
        return false;
    }
    return preferredY >= roofLiftHeight - layout.roofCaptureMargin;
}

export function constrainPositionToLorienVelmoreRoofLiftDriveBounds(
    position,
    previousPosition = null,
    building
) {
    if (
        !position ||
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y) ||
        !Number.isFinite(position.z)
    ) {
        return null;
    }

    const layout = getLorienVelmoreRoofLiftLayout(building);
    ensureRoofLiftRuntimeInitialized(layout);

    const localX = position.x - layout.centerX;
    const localZ = position.z - layout.centerZ;
    const currentSurfaceY = lorienRoofLiftRuntime.currentSurfaceY;
    const roofDriveHeight = layout.roofSurfaceY;
    const nearMovingLift =
        lorienRoofLiftRuntime.isMoving &&
        Math.abs(position.y - currentSurfaceY) <= layout.platformCaptureMargin + 1.2 &&
        isInsideLocalRect(
            localX,
            localZ,
            layout.shaftCenterX,
            layout.shaftCenterZ,
            layout.shaftHalfWidth + 0.12,
            layout.shaftHalfDepth + 0.12
        );

    if (nearMovingLift) {
        position.x =
            layout.centerX +
            clamp(
                localX,
                layout.shaftCenterX - layout.liftPlatformHalfWidth + 0.34,
                layout.shaftCenterX + layout.liftPlatformHalfWidth - 0.34
            );
        position.z =
            layout.centerZ +
            clamp(
                localZ,
                layout.shaftCenterZ - layout.liftPlatformHalfDepth + 0.44,
                layout.shaftCenterZ + layout.liftPlatformHalfDepth - 0.44
            );
        return { mode: 'lorien_roof_lift_platform' };
    }

    const nearRoofSurface = position.y >= roofDriveHeight - layout.roofCaptureMargin;
    if (!nearRoofSurface) {
        return null;
    }

    const roofDriveCorridors = getLorienRoofLiftDriveCorridors(
        layout,
        currentSurfaceY >= roofDriveHeight - layout.platformCaptureMargin
    );
    const insideRoofDriveCorridor = roofDriveCorridors.some((corridor) =>
        isInsideDriveCorridor(localX, localZ, corridor)
    );
    if (insideRoofDriveCorridor) {
        return null;
    }

    const allowedRoofArea =
        isInsideRoofDeckDriveArea(localX, localZ, layout) ||
        isInsideRoofBridgeArea(localX, localZ, layout) ||
        isInsideConnectedRoofBridgeArea(localX, localZ, layout) ||
        isInsideConnectedTerraceArea(localX, localZ, layout) ||
        isInsideLocalRect(
            localX,
            localZ,
            layout.shaftCenterX,
            layout.shaftCenterZ,
            layout.liftPlatformHalfWidth + 0.18,
            layout.liftPlatformHalfDepth + 0.18
        );
    if (allowedRoofArea) {
        const constrainedPoint = constrainPointToDriveCorridors(localX, localZ, roofDriveCorridors);
        if (constrainedPoint) {
            position.x = layout.centerX + constrainedPoint.x;
            position.z = layout.centerZ + constrainedPoint.z;
        } else if (
            previousPosition &&
            Number.isFinite(previousPosition.x) &&
            Number.isFinite(previousPosition.z)
        ) {
            position.x = previousPosition.x;
            position.z = previousPosition.z;
        }
        return { mode: 'lorien_roof_lift_block' };
    }

    if (
        previousPosition &&
        Number.isFinite(previousPosition.x) &&
        Number.isFinite(previousPosition.z)
    ) {
        position.x = previousPosition.x;
        position.z = previousPosition.z;
    }
    return { mode: 'lorien_roof_lift_block' };
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

    let hallSilence = 0;
    if (
        Math.abs(localX) <= layout.hallHalfWidth + 0.24 &&
        localZ >= layout.hallStartZ - 0.24 &&
        localZ <= layout.hallEndZ + 0.24 &&
        y >= -1 &&
        y <= layout.lowerLevelCeilingY + 0.9
    ) {
        const lateralFactor =
            1 - normalizedRange(Math.abs(localX), layout.hallHalfWidth - 0.9, layout.hallHalfWidth);
        const depthFactor = normalizedRange(
            localZ,
            layout.hallStartZ + 0.65,
            layout.hallStartZ + 4.4
        );
        const roofFactor =
            1 -
            normalizedRange(y, layout.lowerLevelCeilingY - 0.22, layout.lowerLevelCeilingY + 0.72);
        const enclosureFactor = clamp01(Math.min(lateralFactor, depthFactor, roofFactor));
        if (enclosureFactor > 0) {
            const doorClosedFactor = smoothstep01(1 - lorienVelmoreDoorOpenAmount);
            hallSilence = clamp01(enclosureFactor * lerp(0.48, 1, doorClosedFactor));
        }
    }

    const roofLayout = getLorienVelmoreRoofLiftLayout(building);
    ensureRoofLiftRuntimeInitialized(roofLayout);
    let roofSilence = 0;
    const roofSurfaceCeiling = Math.max(
        roofLayout.roofSurfaceY,
        roofLayout.connectedTerraceSurfaceY
    );
    const nearRoofDeckSurface = y >= roofLayout.roofSurfaceY - 1 && y <= roofSurfaceCeiling + 3.6;
    if (
        nearRoofDeckSurface &&
        (isInsideRoofDeckDriveArea(localX, localZ, roofLayout) ||
            isInsideRoofBridgeArea(localX, localZ, roofLayout) ||
            isInsideConnectedRoofBridgeArea(localX, localZ, roofLayout) ||
            isInsideConnectedTerraceArea(localX, localZ, roofLayout))
    ) {
        const connectedBridgeHeight = sampleConnectedRoofBridgeHeight(localX, localZ, roofLayout);
        const roofSurfaceHeight = Number.isFinite(connectedBridgeHeight)
            ? connectedBridgeHeight
            : isInsideConnectedTerraceArea(localX, localZ, roofLayout)
              ? roofLayout.connectedTerraceSurfaceY
              : roofLayout.roofSurfaceY;
        const roofHeightFactor = 1 - normalizedRange(Math.abs(y - roofSurfaceHeight), 0.9, 2.8);
        const roofBase =
            isInsideRoofBridgeArea(localX, localZ, roofLayout) ||
            isInsideConnectedRoofBridgeArea(localX, localZ, roofLayout)
                ? LORIEN_ROOF_DECK_SILENCE_FACTOR + 0.08
                : isInsideConnectedTerraceArea(localX, localZ, roofLayout)
                  ? LORIEN_CONNECTED_TERRACE_SILENCE_FACTOR
                  : LORIEN_ROOF_DECK_SILENCE_FACTOR;
        roofSilence = clamp01(roofBase * lerp(0.76, 1, roofHeightFactor));
    }
    if (
        isInsideLocalRect(
            localX,
            localZ,
            roofLayout.shaftCenterX,
            roofLayout.shaftCenterZ,
            roofLayout.liftPlatformHalfWidth + 0.24,
            roofLayout.liftPlatformHalfDepth + 0.24
        ) &&
        y >= lorienRoofLiftRuntime.currentSurfaceY - 0.9 &&
        y <= lorienRoofLiftRuntime.currentSurfaceY + 2.8
    ) {
        const roofTravelMix = normalizedRange(
            lorienRoofLiftRuntime.currentSurfaceY,
            roofLayout.bottomSurfaceY,
            roofLayout.roofSurfaceY
        );
        roofSilence = Math.max(
            roofSilence,
            lerp(
                LORIEN_ROOF_LIFT_BOTTOM_SILENCE_FACTOR,
                LORIEN_ROOF_LIFT_TOP_SILENCE_FACTOR,
                roofTravelMix
            )
        );
    }

    return Math.max(hallSilence, roofSilence);
}

function smoothstep01(value) {
    const t = clamp01(value);
    return t * t * (3 - 2 * t);
}

function ensureRoofLiftRuntimeInitialized(layout) {
    if (lorienRoofLiftRuntime.initialized) {
        return;
    }
    lorienRoofLiftRuntime.initialized = true;
    lorienRoofLiftRuntime.currentSurfaceY = layout.bottomSurfaceY;
    lorienRoofLiftRuntime.targetSurfaceY = layout.bottomSurfaceY;
    lorienRoofLiftRuntime.wasPlayerOnPlatform = false;
    lorienRoofLiftRuntime.isMoving = false;
    lorienRoofLiftRuntime.platformHoldTime = 0;
    lorienRoofLiftRuntime.awaitingPlatformExit = false;
    lorienRoofLiftRuntime.upperLevelVacancyTime = 0;
}

function isPlayerOnRoofLiftPlatform(playerPosition, layout) {
    const playerX = Number(playerPosition?.x);
    const playerY = Number(playerPosition?.y);
    const playerZ = Number(playerPosition?.z);
    if (!Number.isFinite(playerX) || !Number.isFinite(playerY) || !Number.isFinite(playerZ)) {
        return false;
    }

    const localX = playerX - layout.centerX;
    const localZ = playerZ - layout.centerZ;
    const currentSurfaceY = lorienRoofLiftRuntime.currentSurfaceY;
    const triggerHalfWidth = Math.min(
        layout.liftPlatformHalfWidth - 0.28,
        Math.max(0.82, layout.liftPlatformHalfWidth * 0.4)
    );
    const triggerHalfDepth = Math.min(
        layout.liftPlatformHalfDepth - 0.44,
        Math.max(0.84, layout.liftPlatformHalfDepth * 0.28)
    );
    return (
        isInsideLocalRect(
            localX,
            localZ,
            layout.shaftCenterX,
            layout.shaftCenterZ,
            triggerHalfWidth,
            triggerHalfDepth
        ) &&
        playerY >= currentSurfaceY - 0.8 &&
        playerY <= currentSurfaceY + 2.4
    );
}

function isPlayerOccupyingRoofLiftUpperLevel(playerPosition, layout) {
    const playerX = Number(playerPosition?.x);
    const playerY = Number(playerPosition?.y);
    const playerZ = Number(playerPosition?.z);
    if (!Number.isFinite(playerX) || !Number.isFinite(playerY) || !Number.isFinite(playerZ)) {
        return false;
    }

    const localX = playerX - layout.centerX;
    const localZ = playerZ - layout.centerZ;
    const roofSurfaceCeiling = Math.max(layout.roofSurfaceY, layout.connectedTerraceSurfaceY);
    const nearRoofHeight =
        playerY >= layout.roofSurfaceY - layout.roofCaptureMargin &&
        playerY <= roofSurfaceCeiling + 3.6;
    if (!nearRoofHeight) {
        return false;
    }

    return (
        isInsideRoofDeckDriveArea(localX, localZ, layout) ||
        isInsideRoofBridgeArea(localX, localZ, layout) ||
        isInsideConnectedRoofBridgeArea(localX, localZ, layout) ||
        isInsideConnectedTerraceArea(localX, localZ, layout) ||
        isInsideRoofLiftShaft(localX, localZ, layout)
    );
}

function doesAnyPositionOccupyRoofLiftUpperLevel(positions, layout) {
    if (!Array.isArray(positions) || positions.length === 0) {
        return false;
    }
    for (let i = 0; i < positions.length; i += 1) {
        if (isPlayerOccupyingRoofLiftUpperLevel(positions[i], layout)) {
            return true;
        }
    }
    return false;
}

function isInsideRoofLiftShaft(localX, localZ, layout) {
    return isInsideLocalRect(
        localX,
        localZ,
        layout.shaftCenterX,
        layout.shaftCenterZ,
        layout.liftPlatformHalfWidth,
        layout.liftPlatformHalfDepth
    );
}

function isInsideRoofDeckDriveArea(localX, localZ, layout) {
    return (
        localX >= layout.roofDeckMinX &&
        localX <= layout.roofDeckMaxX &&
        localZ >= layout.roofDeckMinZ &&
        localZ <= layout.roofDeckMaxZ
    );
}

function isInsideRoofBridgeArea(localX, localZ, layout) {
    return (
        localX >= -layout.bridgeHalfWidth &&
        localX <= layout.bridgeHalfWidth &&
        localZ >= layout.bridgeMinZ &&
        localZ <= layout.bridgeMaxZ
    );
}

function isInsideConnectedRoofBridgeArea(localX, localZ, layout) {
    return (
        localX >= layout.connectedBridgeMinX &&
        localX <= layout.connectedBridgeMaxX &&
        localZ >= layout.connectedBridgeCenterZ - layout.connectedBridgeHalfDepth &&
        localZ <= layout.connectedBridgeCenterZ + layout.connectedBridgeHalfDepth
    );
}

function isInsideConnectedTerraceArea(localX, localZ, layout) {
    return (
        localX >= layout.connectedTerraceCenterX - layout.connectedTerraceHalfWidth &&
        localX <= layout.connectedTerraceCenterX + layout.connectedTerraceHalfWidth &&
        localZ >= layout.connectedTerraceCenterZ - layout.connectedTerraceHalfDepth &&
        localZ <= layout.connectedTerraceCenterZ + layout.connectedTerraceHalfDepth
    );
}

function sampleConnectedRoofBridgeHeight(localX, localZ, layout) {
    if (!isInsideConnectedRoofBridgeArea(localX, localZ, layout)) {
        return null;
    }

    const t = normalizedRange(localX, layout.connectedBridgeMinX, layout.connectedBridgeMaxX);
    return lerp(layout.connectedBridgeMinSurfaceY, layout.connectedBridgeMaxSurfaceY, t);
}

function getLorienRoofLiftDriveCorridors(layout, includePlatform = false) {
    const deckRearLimit = layout.roofDeckMaxZ - LORIEN_ROOF_DECK_DRIVE_REAR_MARGIN;
    const bridgeEntryMinZ = Math.min(deckRearLimit - 0.22, layout.bridgeMinZ - 0.12);
    const bridgeCorridor = {
        minX: -layout.bridgeHalfWidth + LORIEN_ROOF_BRIDGE_DRIVE_SIDE_MARGIN,
        maxX: layout.bridgeHalfWidth - LORIEN_ROOF_BRIDGE_DRIVE_SIDE_MARGIN,
        minZ: bridgeEntryMinZ,
        maxZ: layout.bridgeMaxZ + 0.08,
    };
    const corridors = [
        {
            minX: layout.roofDeckMinX + LORIEN_ROOF_DECK_DRIVE_SIDE_MARGIN,
            maxX: layout.roofDeckMaxX - LORIEN_ROOF_DECK_DRIVE_SIDE_MARGIN,
            minZ: layout.roofDeckMinZ + LORIEN_ROOF_DECK_DRIVE_FRONT_MARGIN,
            maxZ: deckRearLimit,
        },
        {
            minX: layout.roofDeckMinX,
            maxX: layout.roofDeckMinX + 3.6,
            minZ: layout.connectedBridgeCenterZ - layout.connectedBridgeHalfDepth + 0.18,
            maxZ: layout.connectedBridgeCenterZ + layout.connectedBridgeHalfDepth - 0.18,
        },
        {
            minX: layout.connectedBridgeMinX,
            maxX: layout.connectedBridgeMaxX,
            minZ:
                layout.connectedBridgeCenterZ -
                layout.connectedBridgeHalfDepth +
                LORIEN_ROOF_SIDE_BRIDGE_DRIVE_SIDE_MARGIN,
            maxZ:
                layout.connectedBridgeCenterZ +
                layout.connectedBridgeHalfDepth -
                LORIEN_ROOF_SIDE_BRIDGE_DRIVE_SIDE_MARGIN,
        },
        {
            minX:
                layout.connectedTerraceCenterX -
                layout.connectedTerraceHalfWidth +
                LORIEN_ROOF_CONNECTED_TERRACE_DRIVE_WEST_MARGIN,
            maxX:
                layout.connectedTerraceCenterX +
                layout.connectedTerraceHalfWidth -
                LORIEN_ROOF_CONNECTED_TERRACE_DRIVE_EAST_MARGIN,
            minZ:
                layout.connectedTerraceCenterZ -
                layout.connectedTerraceHalfDepth +
                LORIEN_ROOF_CONNECTED_TERRACE_DRIVE_DEPTH_MARGIN,
            maxZ:
                layout.connectedTerraceCenterZ +
                layout.connectedTerraceHalfDepth -
                LORIEN_ROOF_CONNECTED_TERRACE_DRIVE_DEPTH_MARGIN,
        },
        bridgeCorridor,
    ];

    if (includePlatform) {
        corridors.push({
            minX:
                layout.shaftCenterX -
                layout.liftPlatformHalfWidth +
                LORIEN_ROOF_PLATFORM_DRIVE_SIDE_MARGIN,
            maxX:
                layout.shaftCenterX +
                layout.liftPlatformHalfWidth -
                LORIEN_ROOF_PLATFORM_DRIVE_SIDE_MARGIN,
            minZ:
                layout.shaftCenterZ -
                layout.liftPlatformHalfDepth +
                LORIEN_ROOF_PLATFORM_DRIVE_FRONT_MARGIN,
            maxZ:
                layout.shaftCenterZ +
                layout.liftPlatformHalfDepth -
                LORIEN_ROOF_PLATFORM_DRIVE_REAR_MARGIN,
        });
    }

    return corridors.filter(
        (corridor) =>
            corridor &&
            Number.isFinite(corridor.minX) &&
            Number.isFinite(corridor.maxX) &&
            Number.isFinite(corridor.minZ) &&
            Number.isFinite(corridor.maxZ) &&
            corridor.minX < corridor.maxX &&
            corridor.minZ < corridor.maxZ
    );
}

function isInsideDriveCorridor(localX, localZ, corridor) {
    return (
        localX >= corridor.minX &&
        localX <= corridor.maxX &&
        localZ >= corridor.minZ &&
        localZ <= corridor.maxZ
    );
}

function constrainPointToDriveCorridors(localX, localZ, corridors) {
    if (!Array.isArray(corridors) || corridors.length === 0) {
        return null;
    }

    let bestPoint = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    corridors.forEach((corridor) => {
        const constrainedX = clamp(localX, corridor.minX, corridor.maxX);
        const constrainedZ = clamp(localZ, corridor.minZ, corridor.maxZ);
        const distanceSq =
            (constrainedX - localX) * (constrainedX - localX) +
            (constrainedZ - localZ) * (constrainedZ - localZ);
        if (distanceSq < bestDistanceSq) {
            bestDistanceSq = distanceSq;
            bestPoint = {
                x: constrainedX,
                z: constrainedZ,
            };
        }
    });

    return bestPoint;
}

function isInsideLocalRect(localX, localZ, centerX, centerZ, halfWidth, halfDepth, margin = 0) {
    const safeMargin = Math.max(0, Number(margin) || 0);
    return (
        localX >= centerX - halfWidth - safeMargin &&
        localX <= centerX + halfWidth + safeMargin &&
        localZ >= centerZ - halfDepth - safeMargin &&
        localZ <= centerZ + halfDepth + safeMargin
    );
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

function moveTowards(current, target, maxStep) {
    if (current === target) {
        return current;
    }
    if (current < target) {
        return Math.min(target, current + maxStep);
    }
    return Math.max(target, current - maxStep);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
