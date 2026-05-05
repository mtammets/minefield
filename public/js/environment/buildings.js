import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { BUILDING_DISTRICT_RADIUS, CITY_GRID_RANGE, CITY_GRID_SPACING } from './config.js';
import { worldBounds, doesRectOverlapCentralParkingLot } from './layout.js';
import { randomFromGrid } from './grid-noise.js';
import { addObstacleAabb } from './obstacles.js';
import {
    createBuildingWindowTexture,
    createLuxuryGlassWindowTexture,
    createLuxuryMarbleTexture,
} from './textures.js';
import {
    getLorienVelmoreGalleryLayout as resolveLorienVelmoreGalleryLayout,
    getLorienVelmoreRoofLiftLayout,
    isInsideLorienVelmoreGalleryRoomWorld,
    resetLorienVelmoreRoofLiftState,
    sampleLorienVelmoreGalleryFloorHeightLocal as resolveLorienVelmoreGalleryFloorHeightLocal,
    setLorienVelmoreGalleryDoorOpenAmount,
    updateLorienVelmoreRoofLiftState,
} from './lorien-gallery.js';

const SPECIAL_BUILDING_VARIANTS = new Map([
    [
        '-1:-3',
        {
            type: 'driveThrough',
            passageAxis: 'z',
            passageWidth: 6.4,
            passageHeight: 6.7,
            obstaclePadding: 0.08,
            decorStyle: 'ufoDiskoRetail',
            storeName: 'UFO DISKO',
        },
    ],
    [
        '-3:-1',
        {
            type: 'driveThrough',
            passageAxis: 'x',
            passageWidth: 6.6,
            passageHeight: 6.8,
            obstaclePadding: 0.08,
        },
    ],
    [
        '-1:3',
        {
            type: 'driveThrough',
            passageAxis: 'z',
            passageWidth: 5.8,
            passageHeight: 6.8,
            obstaclePadding: 0.08,
            decorStyle: 'lorienVelmoreLuxury',
            groundLayout: 'galleryHall',
        },
    ],
]);
const UFO_DISKO_STORE_VARIANT_KEY = '-1:-3';
const LORIEN_VELMORE_GALLERY_VARIANT_KEY = '-1:3';
const UFO_DISKO_MERCH_TEXTURE_SOURCES = Object.freeze([
    {
        url: '/assets/Ufodisko/MERCH-5-scaled-e1742462042479-1689x2048.jpg',
        removeWhiteBackground: true,
    },
    { url: '/assets/Ufodisko/Robotid-Kollane-back.jpg', removeWhiteBackground: true },
    { url: '/assets/Ufodisko/Shirt-back-HP.jpg', removeWhiteBackground: true },
    { url: '/assets/Ufodisko/Sissetulnukas-Pusa-back.jpg', removeWhiteBackground: true },
    { url: '/assets/Ufodisko/UFOudufront.jpg', removeWhiteBackground: true },
    { url: '/assets/Ufodisko/back-004-HP.png', removeWhiteBackground: true },
]);

const LORIEN_VELMORE_DOOR_OPEN_SPEED = 2.8;
const LORIEN_VELMORE_DOOR_CLOSE_SPEED = 1.9;
const LORIEN_VELMORE_GALLERY_ARTWORK_URLS = [
    '/assets/Lorienvelmore/1.png',
    '/assets/Lorienvelmore/2.png',
    '/assets/Lorienvelmore/3.png',
    '/assets/Lorienvelmore/4.png',
    '/assets/Lorienvelmore/5.png',
    '/assets/Lorienvelmore/6.png',
];
const LORIEN_VELMORE_GALLERY_ARTWORK_ASPECT_RATIOS = Object.freeze({
    '/assets/Lorienvelmore/1.png': 864 / 1130,
    '/assets/Lorienvelmore/2.png': 732 / 960,
    '/assets/Lorienvelmore/3.png': 778 / 1016,
    '/assets/Lorienvelmore/4.png': 978 / 1270,
    '/assets/Lorienvelmore/5.png': 790 / 1028,
    '/assets/Lorienvelmore/6.png': 752 / 978,
});
const LORIEN_VELMORE_GALLERY_VIDEO_URL = '/assets/Lorienvelmore/lorien_video.mp4';
const LORIEN_VELMORE_GALLERY_VIDEO_PLAYBACK_DELAY_MS = 2000;
const LORIEN_DOOR_GLASS_BREAK_DISTANCE = 2.25;
const LORIEN_DOOR_GLASS_BREAK_DISTANCE_SQ =
    LORIEN_DOOR_GLASS_BREAK_DISTANCE * LORIEN_DOOR_GLASS_BREAK_DISTANCE;
const LORIEN_DOOR_PANEL_DEPTH = 0.08;
const LORIEN_DOOR_SCORCH_MARK_LIMIT = 10;
const LORIEN_DOOR_SHATTER_VARIANT_COUNT = 4;
const LORIEN_DOOR_CRACK_MARK_LIMIT = 8;
const lorienGalleryArtworkTextureLoader = new THREE.TextureLoader();
const ufoDiskoTextureLoader = new THREE.TextureLoader();
const lorienGalleryArtworkTextureCache = new Map();
let lorienVelmoreGalleryVideoDisplayState = null;
let lorienManifestoWallTexture = null;
let lorienDoorShatterTextures = null;
let lorienScorchTexture = null;
let ufoDiskoStoreSignTexture = null;
const ufoDiskoTeeTextureCache = new Map();
let ufoDiskoStoreFootprint = null;
let lorienVelmoreGalleryBuilding = null;
let ufoDiskoDoorOpenAmount = 0;

export function getLorienVelmoreGalleryVideoDisplayState() {
    return lorienVelmoreGalleryVideoDisplayState;
}

export function createBuildingLayer() {
    const layer = new THREE.Group();
    layer.userData.lorienVelmoreDoorSystems = [];
    layer.userData.lorienVelmoreAccentMaterials = [];
    layer.userData.lorienVelmoreVideoDisplays = [];
    layer.userData.lorienVelmoreRoofLiftSystems = [];
    lorienVelmoreGalleryVideoDisplayState = null;
    ufoDiskoDoorOpenAmount = 0;
    resetLorienVelmoreRoofLiftState();
    const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
    const buildingWindowTexture = createBuildingWindowTexture();
    const buildingMaterial = new THREE.MeshStandardMaterial({
        color: 0x2e3e53,
        map: buildingWindowTexture,
        emissive: 0xa6b7d0,
        emissiveMap: buildingWindowTexture,
        emissiveIntensity: 0.42,
        roughness: 0.86,
        metalness: 0.07,
        vertexColors: true,
    });

    const placements = getBuildingPlacements();

    if (placements.length === 0) {
        return layer;
    }

    const regularPlacements = [];
    placements.forEach((building) => {
        const specialVariant = resolveSpecialBuildingVariant(building);
        if (!specialVariant) {
            regularPlacements.push(building);
            return;
        }

        if (specialVariant.type === 'driveThrough') {
            const driveThroughMesh = createDriveThroughBuildingMesh(
                buildingGeometry,
                buildingMaterial,
                building
            );
            const lorienDoorSystems = Array.isArray(
                driveThroughMesh.userData?.lorienVelmoreDoorSystems
            )
                ? driveThroughMesh.userData.lorienVelmoreDoorSystems
                : driveThroughMesh.userData?.lorienVelmoreDoorSystem
                  ? [driveThroughMesh.userData.lorienVelmoreDoorSystem]
                  : null;
            const lorienAccentMaterials =
                driveThroughMesh.userData?.lorienVelmoreAccentMaterials || null;
            const lorienVideoDisplays =
                driveThroughMesh.userData?.lorienVelmoreVideoDisplays || null;
            const lorienRoofLiftSystems =
                driveThroughMesh.userData?.lorienVelmoreRoofLiftSystems || null;
            if (Array.isArray(lorienDoorSystems) && lorienDoorSystems.length > 0) {
                layer.userData.lorienVelmoreDoorSystems.push(...lorienDoorSystems);
            }
            if (Array.isArray(lorienAccentMaterials) && lorienAccentMaterials.length > 0) {
                layer.userData.lorienVelmoreAccentMaterials.push(...lorienAccentMaterials);
            }
            if (Array.isArray(lorienVideoDisplays) && lorienVideoDisplays.length > 0) {
                layer.userData.lorienVelmoreVideoDisplays.push(...lorienVideoDisplays);
            }
            if (Array.isArray(lorienRoofLiftSystems) && lorienRoofLiftSystems.length > 0) {
                layer.userData.lorienVelmoreRoofLiftSystems.push(...lorienRoofLiftSystems);
            }
            layer.add(driveThroughMesh);
            addDriveThroughBuildingObstacles(building, specialVariant);
            return;
        }

        regularPlacements.push(building);
    });

    if (regularPlacements.length > 0) {
        const buildings = new THREE.InstancedMesh(
            buildingGeometry,
            buildingMaterial,
            regularPlacements.length
        );
        buildings.castShadow = false;
        buildings.receiveShadow = false;

        const dummy = new THREE.Object3D();
        const color = new THREE.Color();
        regularPlacements.forEach((building, index) => {
            dummy.position.set(building.x, building.height * 0.5, building.z);
            dummy.scale.set(building.width, building.height, building.depth);
            dummy.updateMatrix();
            buildings.setMatrixAt(index, dummy.matrix);

            color.copy(resolveBuildingTintColor(building.tint));
            buildings.setColorAt(index, color);
            addObstacleAabb(
                building.x,
                building.z,
                building.width,
                building.depth,
                0.2,
                'building'
            );
        });
        buildings.instanceMatrix.needsUpdate = true;
        buildings.instanceColor.needsUpdate = true;

        layer.add(buildings);
    }
    return layer;
}

export function updateBuildingRuntime(buildingLayer, playerPosition, frameDelta = 1 / 60) {
    const doorSystems = buildingLayer?.userData?.lorienVelmoreDoorSystems;
    const accentMaterials = buildingLayer?.userData?.lorienVelmoreAccentMaterials;
    const videoDisplays = buildingLayer?.userData?.lorienVelmoreVideoDisplays;
    const roofLiftSystems = buildingLayer?.userData?.lorienVelmoreRoofLiftSystems;
    if (Array.isArray(accentMaterials) && accentMaterials.length > 0) {
        updateLorienVelmoreAccentMaterials(accentMaterials);
    }
    if (Array.isArray(videoDisplays) && videoDisplays.length > 0) {
        updateLorienVelmoreGalleryVideoDisplays(videoDisplays, playerPosition);
    }
    const resolvedDelta = Math.max(1 / 240, Number(frameDelta) || 1 / 60);
    if (Array.isArray(roofLiftSystems) && roofLiftSystems.length > 0) {
        updateLorienVelmoreRoofLiftSystems(roofLiftSystems, playerPosition, resolvedDelta);
    }

    if (!Array.isArray(doorSystems) || doorSystems.length === 0) {
        setLorienVelmoreGalleryDoorOpenAmount(0);
        ufoDiskoDoorOpenAmount = 0;
        return;
    }

    let maxOpenAmount = 0;
    let maxUfoDiskoOpenAmount = 0;
    doorSystems.forEach((doorSystem) => {
        updateLorienVelmoreDoorSystem(doorSystem, playerPosition, resolvedDelta);
        if (doorSystem?.affectsLorienGallerySilence !== false) {
            maxOpenAmount = Math.max(maxOpenAmount, doorSystem.openAmount || 0);
        }
        if (doorSystem?.environmentAudioZone === 'ufoDiskoStore') {
            maxUfoDiskoOpenAmount = Math.max(maxUfoDiskoOpenAmount, doorSystem.openAmount || 0);
        }
    });
    setLorienVelmoreGalleryDoorOpenAmount(maxOpenAmount);
    ufoDiskoDoorOpenAmount = clamp01(maxUfoDiskoOpenAmount);
}

export function resolveLorienVelmoreMineBarrierImpact(
    buildingLayer,
    { startX = 0, startY = 0, startZ = 0, endX = 0, endY = 0, endZ = 0, collisionRadius = 0 } = {}
) {
    const doorSystems = buildingLayer?.userData?.lorienVelmoreDoorSystems;
    if (!Array.isArray(doorSystems) || doorSystems.length === 0) {
        return null;
    }

    let bestImpact = null;
    for (let index = 0; index < doorSystems.length; index += 1) {
        const doorSystem = doorSystems[index];
        const panels = doorSystem?.panels;
        if (!Array.isArray(panels) || panels.length === 0) {
            continue;
        }

        const panelBaseY = Number(doorSystem.doorBaseY) || 0;
        const panelHeight = Math.max(0, Number(doorSystem.doorHeight) || 0);
        const panelTopY = panelBaseY + panelHeight;
        const panelDepth = Math.max(0.02, Number(doorSystem.panelDepth) || LORIEN_DOOR_PANEL_DEPTH);

        for (let panelIndex = 0; panelIndex < panels.length; panelIndex += 1) {
            const panelState = panels[panelIndex];
            if (!panelState) {
                continue;
            }

            const panelGroup = panelState.group;
            const panelWidth = Math.max(0.2, Number(panelState.width) || 0);
            const panelHalfWidth = panelWidth * 0.5;
            const panelHalfDepth = panelDepth * 0.5;
            const panelCenterX = (Number(doorSystem.centerX) || 0) + (panelGroup?.position?.x || 0);
            const panelCenterZ = (Number(doorSystem.centerZ) || 0) + (panelGroup?.position?.z || 0);
            const impact = segmentImpactExpandedAabbXZ({
                startX,
                startZ,
                endX,
                endZ,
                minX: panelCenterX - panelHalfWidth - collisionRadius,
                maxX: panelCenterX + panelHalfWidth + collisionRadius,
                minZ: panelCenterZ - panelHalfDepth - collisionRadius,
                maxZ: panelCenterZ + panelHalfDepth + collisionRadius,
            });
            if (!impact) {
                continue;
            }

            const impactY = THREE.MathUtils.lerp(startY, endY, impact.t);
            if (impactY < panelBaseY - collisionRadius || impactY > panelTopY + collisionRadius) {
                continue;
            }

            if (!bestImpact || impact.t < bestImpact.t) {
                bestImpact = {
                    ...impact,
                    y: impactY,
                };
            }
        }
    }

    return bestImpact;
}

export function applyLorienVelmoreMineDetonation(buildingLayer, detonationPosition) {
    if (!detonationPosition || typeof detonationPosition !== 'object') {
        return false;
    }

    const doorSystems = buildingLayer?.userData?.lorienVelmoreDoorSystems;
    if (!Array.isArray(doorSystems) || doorSystems.length === 0) {
        return false;
    }

    let affectedAnyDoor = false;
    for (let index = 0; index < doorSystems.length; index += 1) {
        const doorSystem = doorSystems[index];
        const panels = doorSystem?.panels;
        if (!Array.isArray(panels) || panels.length === 0) {
            continue;
        }
        const detonationVariants = new Set();

        for (let panelIndex = 0; panelIndex < panels.length; panelIndex += 1) {
            const panelState = panels[panelIndex];
            if (!panelState?.group) {
                continue;
            }
            if (
                distanceSqToLorienDoorPanel(detonationPosition, doorSystem, panelState) >
                LORIEN_DOOR_GLASS_BREAK_DISTANCE_SQ
            ) {
                continue;
            }

            setLorienVelmoreDoorPanelBroken(doorSystem, panelState, true);
            addLorienDoorCrackMark(doorSystem, panelState, detonationPosition, detonationVariants);
            addLorienDoorScorchMark(doorSystem, panelState, detonationPosition);
            affectedAnyDoor = true;
        }
    }

    return affectedAnyDoor;
}

export function appendLorienVelmoreDoorCollisionObstacles(buildingLayer, outputBuffer = []) {
    const result = Array.isArray(outputBuffer) ? outputBuffer : [];
    result.length = 0;

    const doorSystems = buildingLayer?.userData?.lorienVelmoreDoorSystems;
    if (!Array.isArray(doorSystems) || doorSystems.length === 0) {
        return result;
    }

    for (let index = 0; index < doorSystems.length; index += 1) {
        const doorSystem = doorSystems[index];
        const panels = doorSystem?.panels;
        if (!Array.isArray(panels) || panels.length === 0) {
            continue;
        }

        const panelDepth = Math.max(
            0.12,
            (Number(doorSystem.panelDepth) || LORIEN_DOOR_PANEL_DEPTH) * 0.5 + 0.05
        );
        for (let panelIndex = 0; panelIndex < panels.length; panelIndex += 1) {
            const panelState = panels[panelIndex];
            const panelGroup = panelState?.group;
            const panelWidth = Math.max(0.2, Number(panelState?.width) || 0);
            if (!panelGroup || !Number.isFinite(panelWidth)) {
                continue;
            }

            const panelCenterX = (Number(doorSystem.centerX) || 0) + (panelGroup.position.x || 0);
            const panelCenterZ = (Number(doorSystem.centerZ) || 0) + (panelGroup.position.z || 0);
            result.push({
                type: 'aabb',
                minX: panelCenterX - panelWidth * 0.5,
                maxX: panelCenterX + panelWidth * 0.5,
                minZ: panelCenterZ - panelDepth,
                maxZ: panelCenterZ + panelDepth,
                category: 'building',
            });
        }
    }

    return result;
}

export function getBuildingPlacements() {
    const placements = [];
    for (let gridX = -CITY_GRID_RANGE; gridX <= CITY_GRID_RANGE; gridX += 1) {
        for (let gridZ = -CITY_GRID_RANGE; gridZ <= CITY_GRID_RANGE; gridZ += 1) {
            if (Math.abs(gridX) % 2 === 0 || Math.abs(gridZ) % 2 === 0) {
                continue;
            }
            if (!isInsideBuildingDistrict(gridX, gridZ)) {
                continue;
            }

            const width = 12 + randomFromGrid(gridX, gridZ, 11) * 11;
            const depth = 12 + randomFromGrid(gridX, gridZ, 12) * 11;
            const height = 14 + randomFromGrid(gridX, gridZ, 13) * 58;
            const tint = randomFromGrid(gridX, gridZ, 16);
            const centerX = gridX * CITY_GRID_SPACING;
            const centerZ = gridZ * CITY_GRID_SPACING;

            if (doesRectOverlapCentralParkingLot(centerX, centerZ, width, depth, 2)) {
                continue;
            }

            placements.push({
                gridX,
                gridZ,
                x: centerX,
                z: centerZ,
                width,
                depth,
                height,
                tint,
            });
        }
    }
    return placements;
}

export function createHorizonBackdropLayer() {
    const layer = new THREE.Group();
    layer.name = 'horizonBackdropLayer';

    const blockCount = 32;
    const radiusBase = worldBounds.size * 0.62;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const windowTexture = createBuildingWindowTexture();
    const material = new THREE.MeshStandardMaterial({
        color: 0x25354b,
        map: windowTexture,
        emissive: 0x6a88af,
        emissiveMap: windowTexture,
        emissiveIntensity: 0.32,
        roughness: 0.88,
        metalness: 0.08,
        vertexColors: true,
    });
    const skylineMesh = new THREE.InstancedMesh(geometry, material, blockCount);
    skylineMesh.castShadow = false;
    skylineMesh.receiveShadow = false;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < blockCount; i += 1) {
        const angle = (i / blockCount) * Math.PI * 2;
        const radius = radiusBase + 46 + randomFromGrid(i, blockCount, 329) * 46;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const width = 15 + randomFromGrid(i, blockCount, 330) * 20;
        const depth = 14 + randomFromGrid(i, blockCount, 331) * 20;
        const height = 28 + Math.pow(randomFromGrid(i, blockCount, 332), 1.45) * 88;

        dummy.position.set(x, height * 0.5, z);
        dummy.scale.set(width, height, depth);
        dummy.rotation.y = angle + Math.PI * 0.5;
        dummy.updateMatrix();
        skylineMesh.setMatrixAt(i, dummy.matrix);

        color.setHSL(
            0.58 + randomFromGrid(i, blockCount, 333) * 0.04,
            0.18,
            0.17 + randomFromGrid(i, blockCount, 334) * 0.08
        );
        skylineMesh.setColorAt(i, color);
    }

    skylineMesh.instanceMatrix.needsUpdate = true;
    skylineMesh.instanceColor.needsUpdate = true;
    layer.add(skylineMesh);
    return layer;
}

function isInsideBuildingDistrict(gridX, gridZ) {
    return (
        Math.abs(gridX) <= BUILDING_DISTRICT_RADIUS && Math.abs(gridZ) <= BUILDING_DISTRICT_RADIUS
    );
}

function resolveSpecialBuildingVariant(building) {
    if (!building) {
        return null;
    }
    return SPECIAL_BUILDING_VARIANTS.get(`${building.gridX}:${building.gridZ}`) || null;
}

function getUfoDiskoStoreFootprint() {
    if (ufoDiskoStoreFootprint) {
        return ufoDiskoStoreFootprint;
    }

    const building = getBuildingPlacements().find(
        (entry) => `${entry?.gridX}:${entry?.gridZ}` === UFO_DISKO_STORE_VARIANT_KEY
    );
    const variant = SPECIAL_BUILDING_VARIANTS.get(UFO_DISKO_STORE_VARIANT_KEY) || null;
    if (!building || !variant) {
        return null;
    }

    const axis = variant.passageAxis === 'x' ? 'x' : 'z';
    const transverseSpan = axis === 'x' ? building.depth : building.width;
    const passageWidth = THREE.MathUtils.clamp(variant.passageWidth, 4.8, transverseSpan - 3.6);
    const passageHeight = THREE.MathUtils.clamp(variant.passageHeight, 4.4, building.height - 4.8);
    const halfPassageWidth = passageWidth * 0.5;
    const halfTravelSpan = (axis === 'x' ? building.width : building.depth) * 0.5;

    ufoDiskoStoreFootprint = {
        axis,
        centerX: building.x,
        centerZ: building.z,
        minX: axis === 'x' ? building.x - halfTravelSpan : building.x - halfPassageWidth,
        maxX: axis === 'x' ? building.x + halfTravelSpan : building.x + halfPassageWidth,
        minZ: axis === 'x' ? building.z - halfPassageWidth : building.z - halfTravelSpan,
        maxZ: axis === 'x' ? building.z + halfPassageWidth : building.z + halfTravelSpan,
        minY: -0.6,
        maxY: passageHeight + 1.2,
    };

    return ufoDiskoStoreFootprint;
}

function getLorienVelmoreGalleryBuilding() {
    if (lorienVelmoreGalleryBuilding) {
        return lorienVelmoreGalleryBuilding;
    }

    lorienVelmoreGalleryBuilding =
        getBuildingPlacements().find(
            (entry) => `${entry?.gridX}:${entry?.gridZ}` === LORIEN_VELMORE_GALLERY_VARIANT_KEY
        ) || null;
    return lorienVelmoreGalleryBuilding;
}

export function isInsideUfoDiskoStoreWorld(x, y, z, margin = 0) {
    const footprint = getUfoDiskoStoreFootprint();
    if (!footprint) {
        return false;
    }

    const extraMargin = Math.max(0, Number(margin) || 0);
    const resolvedX = Number(x);
    const resolvedY = Number(y);
    const resolvedZ = Number(z);
    if (!Number.isFinite(resolvedX) || !Number.isFinite(resolvedY) || !Number.isFinite(resolvedZ)) {
        return false;
    }

    return (
        resolvedX >= footprint.minX - extraMargin &&
        resolvedX <= footprint.maxX + extraMargin &&
        resolvedZ >= footprint.minZ - extraMargin &&
        resolvedZ <= footprint.maxZ + extraMargin &&
        resolvedY >= footprint.minY - extraMargin &&
        resolvedY <= footprint.maxY + extraMargin
    );
}

export function isInsideLorienVelmoreGalleryWorld(x, y, z, margin = 0) {
    const building = getLorienVelmoreGalleryBuilding();
    if (!building) {
        return false;
    }

    const resolvedX = Number(x);
    const resolvedY = Number(y);
    const resolvedZ = Number(z);
    if (!Number.isFinite(resolvedX) || !Number.isFinite(resolvedY) || !Number.isFinite(resolvedZ)) {
        return false;
    }

    return isInsideLorienVelmoreGalleryRoomWorld(
        resolvedX,
        resolvedY,
        resolvedZ,
        building,
        Math.max(0, Number(margin) || 0)
    );
}

export function getUfoDiskoStoreSilenceFactorWorld(x, y, z) {
    const footprint = getUfoDiskoStoreFootprint();
    if (!footprint) {
        return 0;
    }

    const resolvedX = Number(x);
    const resolvedY = Number(y);
    const resolvedZ = Number(z);
    if (!Number.isFinite(resolvedX) || !Number.isFinite(resolvedY) || !Number.isFinite(resolvedZ)) {
        return 0;
    }
    if (!isInsideUfoDiskoStoreWorld(resolvedX, resolvedY, resolvedZ, 0.18)) {
        return 0;
    }

    const localX = resolvedX - footprint.centerX;
    const localZ = resolvedZ - footprint.centerZ;
    const halfWidth = Math.max(0.1, (footprint.maxX - footprint.minX) * 0.5);
    const halfDepth = Math.max(0.1, (footprint.maxZ - footprint.minZ) * 0.5);
    const lateralDistance = footprint.axis === 'x' ? Math.abs(localZ) : Math.abs(localX);
    const lateralHalfSpan = footprint.axis === 'x' ? halfDepth : halfWidth;
    const lateralFactor =
        1 - normalizedRange(lateralDistance, lateralHalfSpan - 0.18, lateralHalfSpan + 0.02);
    const roofFactor = 1 - normalizedRange(resolvedY, footprint.maxY - 1.54, footprint.maxY + 0.12);
    const enclosureFactor = clamp01(Math.min(lateralFactor, roofFactor));
    if (enclosureFactor <= 0) {
        return 0;
    }

    const doorClosedFactor = smoothstep01(1 - ufoDiskoDoorOpenAmount);
    return clamp01(enclosureFactor * lerp(0.22, 1, doorClosedFactor));
}

export function getUfoDiskoStoreAudioState() {
    const footprint = getUfoDiskoStoreFootprint();
    if (!footprint) {
        return null;
    }

    const ceilingY = footprint.maxY - 1.2;
    return {
        worldX: footprint.centerX,
        worldY: ceilingY - 0.24,
        worldZ: footprint.centerZ,
        ceilingY,
        doorOpenAmount: clamp01(ufoDiskoDoorOpenAmount),
    };
}

function resolveBuildingTintColor(tint = 0) {
    return new THREE.Color().setHSL(0.58 + tint * 0.04, 0.2, 0.28 + tint * 0.08);
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

function updateLorienVelmoreDoorSystem(doorSystem, playerPosition, frameDelta) {
    if (!doorSystem) {
        return;
    }

    const localX = (Number(playerPosition?.x) || 0) - doorSystem.centerX;
    const localY = Number(playerPosition?.y) || 0;
    const localZ = (Number(playerPosition?.z) || 0) - doorSystem.centerZ;
    const approachAxis = doorSystem.approachAxis === 'x' ? 'x' : 'z';
    const localCross = approachAxis === 'x' ? localZ : localX;
    const localApproach = approachAxis === 'x' ? localX : localZ;
    const doorPlaneCoord = Number.isFinite(doorSystem.doorPlaneCoord)
        ? doorSystem.doorPlaneCoord
        : Number(doorSystem.doorPlaneZ) || 0;
    const roomEndCoord = Number.isFinite(doorSystem.roomEndCoord)
        ? doorSystem.roomEndCoord
        : Number(doorSystem.roomEndZ) || doorPlaneCoord;
    const insideDirection = Number(doorSystem.insideDirection) < 0 ? -1 : 1;
    const relativeDepth = (localApproach - doorPlaneCoord) * insideDirection;
    const relativeRoomEnd = (roomEndCoord - doorPlaneCoord) * insideDirection;
    const alignedWithOpening = Math.abs(localCross) <= doorSystem.sensorHalfWidth;
    const withinHeight = localY <= doorSystem.sensorMaxY;
    const outsideApproach = relativeDepth >= -doorSystem.outsideSensorDepth && relativeDepth <= 0.8;
    const insideApproach = relativeDepth >= -0.12 && relativeDepth <= doorSystem.insideSensorDepth;
    const deeperInside =
        relativeDepth >= doorSystem.autoCloseDepth && relativeDepth <= relativeRoomEnd + 1.2;

    doorSystem.targetOpen =
        alignedWithOpening && withinHeight && (outsideApproach || insideApproach) && !deeperInside
            ? 1
            : 0;

    const transitionSpeed =
        doorSystem.targetOpen > doorSystem.openAmount
            ? doorSystem.openSpeed
            : doorSystem.closeSpeed;
    doorSystem.openAmount = moveTowards(
        doorSystem.openAmount,
        doorSystem.targetOpen,
        transitionSpeed * frameDelta
    );

    const slideDistance = doorSystem.travelDistance * doorSystem.openAmount;
    const panelSlideAxis = doorSystem.panelSlideAxis === 'z' ? 'z' : 'x';
    const leftClosedCoord = Number.isFinite(doorSystem.leftClosedCoord)
        ? doorSystem.leftClosedCoord
        : Number(doorSystem.leftClosedX) || 0;
    const rightClosedCoord = Number.isFinite(doorSystem.rightClosedCoord)
        ? doorSystem.rightClosedCoord
        : Number(doorSystem.rightClosedX) || 0;
    doorSystem.leftPanel.position[panelSlideAxis] = leftClosedCoord - slideDistance;
    doorSystem.rightPanel.position[panelSlideAxis] = rightClosedCoord + slideDistance;

    const panels = doorSystem.panels;
    if (Array.isArray(panels) && panels.length > 0) {
        panels.forEach((panelState) => {
            syncLorienVelmoreDoorPanelVisualState(panelState, doorSystem.openAmount);
        });
    } else if (doorSystem.glowMaterial) {
        doorSystem.glowMaterial.opacity = 0.22 + doorSystem.openAmount * 0.14;
    }
}

function syncLorienVelmoreDoorPanelVisualState(panelState, openAmount = 0) {
    if (!panelState) {
        return;
    }

    const broken = Boolean(panelState.broken);
    if (panelState.glassMaterial) {
        panelState.glassMaterial.opacity = broken ? 0.34 : 0.24;
        panelState.glassMaterial.emissiveIntensity = broken ? 0.04 : 0.06;
        panelState.glassMaterial.roughness = broken ? 0.18 : 0.08;
        panelState.glassMaterial.metalness = broken ? 0.04 : 0.1;
        panelState.glassMaterial.color.setHex(broken ? 0xecf4fb : 0xf8fbff);
    }
    if (panelState.glowMaterial) {
        panelState.glowMaterial.opacity = broken
            ? 0.14 + openAmount * 0.05
            : 0.22 + openAmount * 0.14;
    }
    if (Array.isArray(panelState.crackMarks)) {
        for (let index = 0; index < panelState.crackMarks.length; index += 1) {
            const crackEntry = panelState.crackMarks[index];
            if (!crackEntry) {
                continue;
            }
            if (crackEntry.material) {
                crackEntry.material.opacity = broken ? crackEntry.baseOpacity || 0.92 : 0;
            }
            if (Array.isArray(crackEntry.meshes)) {
                crackEntry.meshes.forEach((mesh) => {
                    if (mesh) {
                        mesh.visible = broken;
                    }
                });
            }
        }
    }
}

function setLorienVelmoreDoorPanelBroken(doorSystem, panelState, broken = true) {
    if (!panelState) {
        return;
    }
    panelState.broken = Boolean(broken);
    syncLorienVelmoreDoorPanelVisualState(panelState, Number(doorSystem?.openAmount) || 0);
    if (doorSystem) {
        doorSystem.glassBroken = Array.isArray(doorSystem.panels)
            ? doorSystem.panels.some((entry) => Boolean(entry?.broken))
            : panelState.broken;
    }
}

function distanceSqToLorienDoorPanel(position, doorSystem, panelState) {
    const panelCenterX = (Number(doorSystem?.centerX) || 0) + (panelState?.group?.position?.x || 0);
    const panelCenterZ = (Number(doorSystem?.centerZ) || 0) + (panelState?.group?.position?.z || 0);
    const panelHalfWidth = Math.max(0.12, (Number(panelState?.width) || 0) * 0.5);
    const panelHalfDepth = Math.max(
        0.02,
        (Number(doorSystem?.panelDepth) || LORIEN_DOOR_PANEL_DEPTH) * 0.5
    );
    const panelBaseY = Number(doorSystem?.doorBaseY) || 0;
    const panelTopY = panelBaseY + Math.max(0.2, Number(doorSystem?.doorHeight) || 0);
    const nearestX = THREE.MathUtils.clamp(
        position.x,
        panelCenterX - panelHalfWidth,
        panelCenterX + panelHalfWidth
    );
    const nearestY = THREE.MathUtils.clamp(position.y, panelBaseY, panelTopY);
    const nearestZ = THREE.MathUtils.clamp(
        position.z,
        panelCenterZ - panelHalfDepth,
        panelCenterZ + panelHalfDepth
    );
    const deltaX = position.x - nearestX;
    const deltaY = position.y - nearestY;
    const deltaZ = position.z - nearestZ;
    return deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
}

function addLorienDoorScorchMark(doorSystem, panelState, detonationPosition) {
    if (!doorSystem?.scorchMarks || !panelState?.group) {
        return;
    }

    const halfWidth = Math.max(0.32, (Number(panelState.width) || 0) * 0.5 - 0.24);
    const localCenterX = panelState.group.position.x || 0;
    const localImpactX = (Number(detonationPosition.x) || 0) - (Number(doorSystem.centerX) || 0);
    const localImpactY = (Number(detonationPosition.y) || 0) - (Number(doorSystem.doorBaseY) || 0);
    const localImpactZ =
        (Number(detonationPosition.z) || 0) -
        ((Number(doorSystem.centerZ) || 0) + (panelState.group.position.z || 0));
    const scorchMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
            map: getLorienScorchTexture(),
            transparent: true,
            opacity: 0.54,
            alphaTest: 0.02,
            color: 0x1b1512,
            toneMapped: false,
            side: THREE.DoubleSide,
            depthWrite: false,
        })
    );
    scorchMesh.position.set(
        THREE.MathUtils.clamp(localImpactX - localCenterX, -halfWidth, halfWidth),
        THREE.MathUtils.clamp(
            localImpactY,
            0.42,
            Math.max(0.7, (Number(panelState.height) || 0) - 0.32)
        ),
        localImpactZ < 0 ? -0.022 : 0.022
    );
    const scorchSize = lerp(0.78, 1.26, Math.random());
    scorchMesh.scale.set(scorchSize, scorchSize * lerp(0.9, 1.18, Math.random()), 1);
    scorchMesh.rotation.z = (Math.random() - 0.5) * 1.1;
    scorchMesh.renderOrder = 6;
    scorchMesh.castShadow = false;
    scorchMesh.receiveShadow = false;
    panelState.group.add(scorchMesh);

    const scorchEntry = {
        panelState,
        mesh: scorchMesh,
    };
    doorSystem.scorchMarks.push(scorchEntry);
    if (Array.isArray(panelState.scorchMarks)) {
        panelState.scorchMarks.push(scorchEntry);
    }

    while (doorSystem.scorchMarks.length > LORIEN_DOOR_SCORCH_MARK_LIMIT) {
        const oldest = doorSystem.scorchMarks.shift();
        removeLorienDoorScorchEntry(oldest);
    }
}

function addLorienDoorCrackMark(
    doorSystem,
    panelState,
    detonationPosition,
    usedVariantIndexes = null
) {
    if (!panelState?.group) {
        return;
    }

    if (!Array.isArray(panelState.crackMarks)) {
        panelState.crackMarks = [];
    }

    const glassWidth = Math.max(
        0.5,
        Number(panelState.glassWidth) || Number(panelState.width) || 1
    );
    const glassHeight = Math.max(
        0.5,
        Number(panelState.glassHeight) || Number(panelState.height) || 1
    );
    const glassHalfWidth = Math.max(0.2, glassWidth * 0.5 - 0.04);
    const glassHalfHeight = Math.max(0.2, glassHeight * 0.5 - 0.06);
    const localCenterX = panelState.group.position.x || 0;
    const localImpactX = (Number(detonationPosition.x) || 0) - (Number(doorSystem?.centerX) || 0);
    const localImpactY =
        (Number(detonationPosition.y) || 0) -
        ((Number(doorSystem?.doorBaseY) || 0) + (Number(panelState.height) || 0) * 0.5);
    const localImpactZ =
        (Number(detonationPosition.z) || 0) -
        ((Number(doorSystem?.centerZ) || 0) + (panelState.group.position.z || 0));
    const crackVariantIndex = resolveLorienDoorCrackVariantIndex(panelState, usedVariantIndexes);
    const variantConfig = getLorienDoorCrackVariantConfig(crackVariantIndex);
    const crackMaterial = new THREE.MeshBasicMaterial({
        map: getLorienDoorShatterTexture(crackVariantIndex),
        transparent: true,
        opacity: panelState.broken ? 0.92 : 0,
        alphaTest: 0.02,
        color: 0xf2f7ff,
        toneMapped: false,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const crackScale = lerp(0.86, 1.18, Math.random());
    const crackWidth = variantConfig.fullGlass
        ? glassWidth * variantConfig.widthScale
        : Math.max(
              0.72,
              Math.min(glassWidth * 0.82, crackScale * glassWidth * variantConfig.widthScale)
          );
    const crackHeight = variantConfig.fullGlass
        ? glassHeight * variantConfig.heightScale
        : Math.max(
              0.72,
              Math.min(glassHeight * 0.82, crackScale * glassHeight * variantConfig.heightScale)
          );
    const frontMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(crackWidth, crackHeight),
        crackMaterial
    );
    const backMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(crackWidth, crackHeight),
        crackMaterial
    );
    const crackLocalX = variantConfig.fullGlass
        ? glassHalfWidth * variantConfig.centerX
        : THREE.MathUtils.clamp(
              (localImpactX - localCenterX) * variantConfig.positionInfluence,
              -glassHalfWidth,
              glassHalfWidth
          );
    const crackLocalY = variantConfig.fullGlass
        ? glassHalfHeight * variantConfig.centerY
        : THREE.MathUtils.clamp(
              localImpactY * variantConfig.positionInfluence,
              -glassHalfHeight * 0.78,
              glassHalfHeight * 0.82
          );
    const crackRotation = variantConfig.fullGlass
        ? variantConfig.baseRotation + (Math.random() - 0.5) * variantConfig.rotationJitter
        : (Math.random() - 0.5) * Math.PI * variantConfig.rotationJitter;

    frontMesh.position.set(crackLocalX, panelState.height * 0.5 + crackLocalY, 0.018);
    frontMesh.rotation.z = crackRotation;
    frontMesh.renderOrder = 6 + panelState.crackMarks.length;
    frontMesh.visible = Boolean(panelState.broken);
    frontMesh.castShadow = false;
    frontMesh.receiveShadow = false;
    panelState.group.add(frontMesh);

    backMesh.position.set(crackLocalX, panelState.height * 0.5 + crackLocalY, -0.018);
    backMesh.rotation.y = Math.PI;
    backMesh.rotation.z = -crackRotation;
    backMesh.renderOrder = frontMesh.renderOrder;
    backMesh.visible = Boolean(panelState.broken);
    backMesh.castShadow = false;
    backMesh.receiveShadow = false;
    panelState.group.add(backMesh);

    const crackEntry = {
        material: crackMaterial,
        meshes: [frontMesh, backMesh],
        baseOpacity: 0.92,
        variantIndex: crackVariantIndex,
    };
    panelState.crackMarks.push(crackEntry);
    if (usedVariantIndexes instanceof Set) {
        usedVariantIndexes.add(crackVariantIndex);
    }

    while (panelState.crackMarks.length > LORIEN_DOOR_CRACK_MARK_LIMIT) {
        const oldest = panelState.crackMarks.shift();
        removeLorienDoorCrackEntry(oldest);
    }
}

function resolveLorienDoorCrackVariantIndex(panelState, usedVariantIndexes = null) {
    const allVariantIndexes = [];
    for (
        let variantIndex = 0;
        variantIndex < LORIEN_DOOR_SHATTER_VARIANT_COUNT;
        variantIndex += 1
    ) {
        allVariantIndexes.push(variantIndex);
    }

    const availableForDoor =
        usedVariantIndexes instanceof Set && usedVariantIndexes.size > 0
            ? allVariantIndexes.filter((variantIndex) => !usedVariantIndexes.has(variantIndex))
            : allVariantIndexes;
    const panelRecentVariantIndexes = Array.isArray(panelState?.crackMarks)
        ? panelState.crackMarks
              .map((entry) => Number(entry?.variantIndex))
              .filter(Number.isInteger)
              .slice(-2)
        : [];
    const preferredPool = availableForDoor.filter(
        (variantIndex) => !panelRecentVariantIndexes.includes(variantIndex)
    );
    const selectionPool =
        preferredPool.length > 0
            ? preferredPool
            : availableForDoor.length > 0
              ? availableForDoor
              : allVariantIndexes;
    return selectionPool[Math.floor(Math.random() * selectionPool.length)] || 0;
}

function getLorienDoorCrackVariantConfig(variantIndex) {
    switch (variantIndex) {
        case 1:
            return {
                fullGlass: true,
                widthScale: 0.96,
                heightScale: 0.96,
                centerX: 0,
                centerY: -0.02,
                baseRotation: -0.03,
                rotationJitter: 0.12,
                positionInfluence: 0,
            };
        case 2:
            return {
                fullGlass: true,
                widthScale: 0.92,
                heightScale: 0.9,
                centerX: 0.03,
                centerY: 0.02,
                baseRotation: 0.02,
                rotationJitter: 0.16,
                positionInfluence: 0,
            };
        case 3:
            return {
                fullGlass: false,
                widthScale: 0.72,
                heightScale: 0.68,
                centerX: 0,
                centerY: 0,
                baseRotation: 0,
                rotationJitter: 0.7,
                positionInfluence: 0.34,
            };
        default:
            return {
                fullGlass: false,
                widthScale: 0.6,
                heightScale: 0.58,
                centerX: 0,
                centerY: 0,
                baseRotation: 0,
                rotationJitter: 0.9,
                positionInfluence: 0.42,
            };
    }
}

function removeLorienDoorScorchEntry(entry) {
    if (!entry?.mesh) {
        return;
    }
    if (entry.mesh.parent) {
        entry.mesh.parent.remove(entry.mesh);
    }
    entry.mesh.geometry?.dispose?.();
    entry.mesh.material?.dispose?.();
    if (Array.isArray(entry.panelState?.scorchMarks)) {
        const index = entry.panelState.scorchMarks.indexOf(entry);
        if (index >= 0) {
            entry.panelState.scorchMarks.splice(index, 1);
        }
    }
}

function removeLorienDoorCrackEntry(entry) {
    if (!entry) {
        return;
    }
    if (Array.isArray(entry.meshes)) {
        entry.meshes.forEach((mesh) => {
            if (!mesh) {
                return;
            }
            if (mesh.parent) {
                mesh.parent.remove(mesh);
            }
            mesh.geometry?.dispose?.();
        });
    }
    entry.material?.dispose?.();
}

function updateLorienVelmoreAccentMaterials(accentMaterials) {
    const now = performance.now();
    accentMaterials.forEach((material) => {
        if (!material || !material.userData) {
            return;
        }
        const baseOpacity = Number(material.userData.baseOpacity);
        if (!Number.isFinite(baseOpacity)) {
            return;
        }
        const animationMode = material.userData.animationMode || 'pulse';
        if (animationMode === 'ribbonSweep') {
            const ribbonPosition = clamp01(Number(material.userData.ribbonPosition) || 0);
            const sweepSpeed = Number(material.userData.sweepSpeed) || 0.00042;
            const sweepPhase = Number(material.userData.sweepPhase) || 0;
            const sweepBand = THREE.MathUtils.clamp(
                Number(material.userData.sweepBand) || 0.2,
                0.04,
                0.5
            );
            const sweepSharpness = Math.max(0.8, Number(material.userData.sweepSharpness) || 2.2);
            const sweepMinOpacity = clamp01(Number(material.userData.sweepMinOpacity) || 0.12);
            const sweepMaxOpacity = THREE.MathUtils.clamp(
                Number(material.userData.sweepMaxOpacity) || 1,
                sweepMinOpacity,
                1.35
            );
            const flickerAmplitude = THREE.MathUtils.clamp(
                Number(material.userData.flickerAmplitude) || 0,
                0,
                0.2
            );
            const flickerSpeed = Number(material.userData.flickerSpeed) || 0.003;
            const flickerPhase = Number(material.userData.flickerPhase) || 0;
            const reverse = Boolean(material.userData.reverseSweep);
            const sweepPosition = positiveModulo(now * sweepSpeed + sweepPhase, 1);
            const resolvedSweepPosition = reverse ? 1 - sweepPosition : sweepPosition;
            const wrappedDistance = Math.min(
                Math.abs(resolvedSweepPosition - ribbonPosition),
                1 - Math.abs(resolvedSweepPosition - ribbonPosition)
            );
            const sweepIntensity = Math.pow(
                clamp01(1 - wrappedDistance / Math.max(0.001, sweepBand)),
                sweepSharpness
            );
            const flicker = 1 + Math.sin(now * flickerSpeed + flickerPhase) * flickerAmplitude;
            material.opacity = clamp01(
                baseOpacity * lerp(sweepMinOpacity, sweepMaxOpacity, sweepIntensity) * flicker
            );
            return;
        }

        const pulseAmplitude = THREE.MathUtils.clamp(
            Number(material.userData.pulseAmplitude) || 0,
            0,
            0.45
        );
        const pulseSpeed = Number(material.userData.pulseSpeed) || 0.0016;
        const pulsePhase = Number(material.userData.pulsePhase) || 0;
        const pulse = Math.sin(now * pulseSpeed + pulsePhase);
        material.opacity = clamp01(baseOpacity * (1 + pulse * pulseAmplitude));
    });
}

function updateLorienVelmoreRoofLiftSystems(roofLiftSystems, playerPosition, frameDelta = 1 / 60) {
    if (!Array.isArray(roofLiftSystems) || roofLiftSystems.length === 0) {
        return;
    }

    const state = updateLorienVelmoreRoofLiftState(playerPosition, frameDelta);
    const normalizedTravel = clamp01(state?.normalizedTravel || 0);
    const movingPulse = state?.isMoving ? 0.72 + Math.sin(performance.now() * 0.012) * 0.2 : 0;

    roofLiftSystems.forEach((system) => {
        if (!system) {
            return;
        }

        if (system.platformGroup) {
            system.platformGroup.position.y = Number(state?.currentSurfaceY) || 0;
        }
        if (system.statusLightMaterial) {
            const color = state?.isMoving
                ? new THREE.Color(0xffd6a0)
                : normalizedTravel >= 0.98
                  ? new THREE.Color(0xc8f2ff)
                  : new THREE.Color(0xffefcf);
            system.statusLightMaterial.color.copy(color);
            system.statusLightMaterial.opacity = state?.isMoving ? 0.7 + movingPulse * 0.22 : 0.56;
        }
        if (system.roofViewLightMaterial) {
            system.roofViewLightMaterial.opacity = 0.54 + normalizedTravel * 0.22;
        }
    });
}

function createDriveThroughBuildingMesh(baseGeometry, baseMaterial, building) {
    const variant = resolveSpecialBuildingVariant(building);
    if (!variant) {
        return new THREE.Group();
    }

    const axis = variant.passageAxis === 'z' ? 'z' : 'x';
    const isLuxuryLorien = variant.decorStyle === 'lorienVelmoreLuxury';
    const isUfoDiskoRetail = variant.decorStyle === 'ufoDiskoRetail';
    const isGalleryHall = variant.groundLayout === 'galleryHall';
    const transverseSpan = axis === 'x' ? building.depth : building.width;
    const passageWidth = THREE.MathUtils.clamp(variant.passageWidth, 4.8, transverseSpan - 3.6);
    const passageHeight = THREE.MathUtils.clamp(variant.passageHeight, 4.4, building.height - 4.8);
    const sideWingSpan = Math.max(1.4, (transverseSpan - passageWidth) * 0.5);
    const bridgeHeight = Math.max(2.4, building.height - passageHeight);
    const wingOffset = passageWidth * 0.5 + sideWingSpan * 0.5;
    const tintColor = resolveBuildingTintColor(building.tint);
    const ufoInteriorWallTexture = isUfoDiskoRetail ? createLuxuryMarbleTexture() : null;
    if (ufoInteriorWallTexture) {
        ufoInteriorWallTexture.repeat.set(
            Math.max(1, Math.round((axis === 'x' ? building.width : building.depth) / 4.8)),
            Math.max(1, Math.round(passageHeight / 3.2))
        );
    }
    const ufoInteriorCeilingTexture = isUfoDiskoRetail ? createLuxuryMarbleTexture() : null;
    if (ufoInteriorCeilingTexture) {
        ufoInteriorCeilingTexture.repeat.set(
            Math.max(1, Math.round((axis === 'x' ? passageWidth : building.depth) / 4.6)),
            Math.max(1, Math.round((axis === 'x' ? building.width : passageWidth) / 4.6))
        );
    }
    const shellMaterial =
        isLuxuryLorien && isGalleryHall
            ? new THREE.MeshStandardMaterial({
                  color: 0x161c24,
                  emissive: 0x0c1016,
                  emissiveIntensity: 0.12,
                  roughness: 0.74,
                  metalness: 0.18,
              })
            : isUfoDiskoRetail
              ? new THREE.MeshStandardMaterial({
                    color: 0x0d1523,
                    emissive: 0x08111d,
                    emissiveIntensity: 0.18,
                    roughness: 0.72,
                    metalness: 0.28,
                })
              : baseMaterial.clone();
    if ('vertexColors' in shellMaterial) {
        shellMaterial.vertexColors = false;
    }
    if (!isLuxuryLorien || !isGalleryHall) {
        shellMaterial.color.copy(tintColor);
        shellMaterial.emissive.copy(new THREE.Color(0xa6b7d0).lerp(tintColor, 0.18));
        if (isUfoDiskoRetail) {
            shellMaterial.color.lerp(new THREE.Color(0x070f1b), 0.7);
            shellMaterial.emissive.lerp(new THREE.Color(0x071830), 0.55);
        }
    }
    const towerCoreMaterial =
        isLuxuryLorien && isGalleryHall
            ? new THREE.MeshStandardMaterial({
                  color: 0x1d2733,
                  emissive: 0x0d131b,
                  emissiveIntensity: 0.1,
                  roughness: 0.26,
                  metalness: 0.58,
              })
            : shellMaterial;

    const passageSurfaceMaterial = new THREE.MeshStandardMaterial({
        color:
            isLuxuryLorien && isGalleryHall
                ? 0xe9e3d8
                : isUfoDiskoRetail
                  ? 0x0f1724
                  : isLuxuryLorien
                    ? 0x261e18
                    : 0x121c28,
        emissive:
            isLuxuryLorien && isGalleryHall
                ? 0x1b1713
                : isUfoDiskoRetail
                  ? 0x05070c
                  : isLuxuryLorien
                    ? 0x18110c
                    : 0x0b121a,
        emissiveIntensity:
            isLuxuryLorien && isGalleryHall
                ? 0.05
                : isUfoDiskoRetail
                  ? 0.12
                  : isLuxuryLorien
                    ? 0.22
                    : 0.16,
        roughness:
            isLuxuryLorien && isGalleryHall
                ? 0.22
                : isUfoDiskoRetail
                  ? 0.2
                  : isLuxuryLorien
                    ? 0.62
                    : 0.94,
        metalness:
            isLuxuryLorien && isGalleryHall
                ? 0.04
                : isUfoDiskoRetail
                  ? 0.46
                  : isLuxuryLorien
                    ? 0.08
                    : 0.04,
        side: THREE.DoubleSide,
        map: isUfoDiskoRetail ? ufoInteriorCeilingTexture : null,
    });
    const innerWallMaterial = new THREE.MeshStandardMaterial({
        color: isUfoDiskoRetail ? 0x0b1119 : isLuxuryLorien ? 0x1c1816 : 0x172333,
        emissive: isUfoDiskoRetail ? 0x050912 : isLuxuryLorien ? 0x14100d : 0x111a24,
        emissiveIntensity: isUfoDiskoRetail ? 0.1 : isLuxuryLorien ? 0.16 : 0.12,
        roughness: isUfoDiskoRetail ? 0.24 : isLuxuryLorien ? 0.58 : 0.92,
        metalness: isUfoDiskoRetail ? 0.42 : isLuxuryLorien ? 0.1 : 0.03,
        map: isUfoDiskoRetail ? ufoInteriorWallTexture : null,
    });
    const lorienTrimMaterial = new THREE.MeshStandardMaterial({
        color: isUfoDiskoRetail ? 0x67f1ff : 0xc9ac84,
        emissive: isUfoDiskoRetail ? 0x134455 : 0x43301d,
        emissiveIntensity: isUfoDiskoRetail ? 0.22 : 0.16,
        roughness: isUfoDiskoRetail ? 0.2 : 0.28,
        metalness: isUfoDiskoRetail ? 0.82 : 0.86,
    });
    const lorienLightMaterial = new THREE.MeshBasicMaterial({
        color: isUfoDiskoRetail ? 0xff66eb : 0xffefcb,
        transparent: true,
        opacity: isUfoDiskoRetail ? 0.92 : 0.88,
        toneMapped: false,
    });

    const group = new THREE.Group();
    group.name = `building_drive_through_${building.gridX}_${building.gridZ}`;
    group.position.set(building.x, 0, building.z);

    const pieces = isGalleryHall
        ? [
              {
                  x: 0,
                  y: passageHeight + bridgeHeight * 0.5,
                  z: 0,
                  width: building.width,
                  height: bridgeHeight,
                  depth: building.depth,
                  material: towerCoreMaterial,
              },
          ]
        : [
              {
                  x: axis === 'z' ? -wingOffset : 0,
                  y: building.height * 0.5,
                  z: axis === 'x' ? -wingOffset : 0,
                  width: axis === 'x' ? building.width : sideWingSpan,
                  height: building.height,
                  depth: axis === 'x' ? sideWingSpan : building.depth,
                  material: shellMaterial,
              },
              {
                  x: axis === 'z' ? wingOffset : 0,
                  y: building.height * 0.5,
                  z: axis === 'x' ? wingOffset : 0,
                  width: axis === 'x' ? building.width : sideWingSpan,
                  height: building.height,
                  depth: axis === 'x' ? sideWingSpan : building.depth,
                  material: shellMaterial,
              },
              {
                  x: 0,
                  y: passageHeight + bridgeHeight * 0.5,
                  z: 0,
                  width: axis === 'x' ? building.width : passageWidth,
                  height: bridgeHeight,
                  depth: axis === 'x' ? passageWidth : building.depth,
                  material: shellMaterial,
              },
          ];

    pieces.forEach((piece) => {
        const mesh = new THREE.Mesh(baseGeometry, piece.material);
        mesh.position.set(piece.x, piece.y, piece.z);
        mesh.scale.set(piece.width, piece.height, piece.depth);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        group.add(mesh);
    });

    if (isUfoDiskoRetail && !isGalleryHall) {
        addUfoDiskoMixedUseFacade(group, baseGeometry, {
            axis,
            building,
            passageWidth,
            passageHeight,
            trimMaterial: lorienTrimMaterial,
            lightMaterial: lorienLightMaterial,
        });
    }

    if (isGalleryHall) {
        addLorienVelmoreTowerFacade(group, baseGeometry, {
            building,
            towerBaseY: passageHeight,
            towerHeight: bridgeHeight,
            trimMaterial: lorienTrimMaterial,
            lightMaterial: lorienLightMaterial,
        });
    }

    const passageCeiling = new THREE.Mesh(
        new THREE.PlaneGeometry(
            isGalleryHall
                ? building.width - 0.5
                : axis === 'x'
                  ? building.width - 0.5
                  : passageWidth - 0.45,
            isGalleryHall
                ? building.depth - 0.5
                : axis === 'x'
                  ? passageWidth - 0.45
                  : building.depth - 0.5
        ),
        passageSurfaceMaterial
    );
    passageCeiling.rotation.x = Math.PI / 2;
    passageCeiling.position.y = passageHeight + 0.02;
    group.add(passageCeiling);

    if (!isGalleryHall) {
        const innerWallGeometry = new THREE.PlaneGeometry(
            axis === 'x' ? building.width - 0.44 : building.depth - 0.44,
            passageHeight - 0.2
        );
        const innerWalls =
            axis === 'x'
                ? [
                      { x: 0, z: -passageWidth * 0.5 - 0.01, rotationY: 0 },
                      { x: 0, z: passageWidth * 0.5 + 0.01, rotationY: Math.PI },
                  ]
                : [
                      { x: -passageWidth * 0.5 - 0.01, z: 0, rotationY: Math.PI / 2 },
                      { x: passageWidth * 0.5 + 0.01, z: 0, rotationY: -Math.PI / 2 },
                  ];
        innerWalls.forEach((wall) => {
            const mesh = new THREE.Mesh(innerWallGeometry, innerWallMaterial);
            mesh.position.set(wall.x, passageHeight * 0.5, wall.z);
            mesh.rotation.y = wall.rotationY;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            group.add(mesh);
        });
    }

    let lorienDoorSystem = null;
    let lorienDoorSystems = [];
    if (isLuxuryLorien && !isGalleryHall) {
        addLorienVelmoreLuxuryPassageDecor(group, baseGeometry, {
            axis,
            building,
            passageWidth,
            passageHeight,
            isGalleryHall,
        });
    } else if (isUfoDiskoRetail && !isGalleryHall) {
        lorienDoorSystems = addUfoDiskoRetailPassageDecor(group, baseGeometry, {
            axis,
            building,
            passageWidth,
            passageHeight,
            trimMaterial: lorienTrimMaterial,
            lightMaterial: lorienLightMaterial,
            storeName: variant.storeName,
        });
    }

    if (isGalleryHall) {
        lorienDoorSystem = addLorienVelmoreSubterraneanHall(group, baseGeometry, {
            building,
            passageWidth,
            passageHeight,
            shellMaterial,
            trimMaterial: lorienTrimMaterial,
            lightMaterial: lorienLightMaterial,
        });
        addLorienVelmoreGallerySupports(group, baseGeometry, {
            axis,
            building,
            passageHeight,
            shellMaterial,
            trimMaterial: lorienTrimMaterial,
            lightMaterial: lorienLightMaterial,
        });
        addLorienVelmoreGalleryDisplays(group, {
            axis,
            building,
            passageHeight,
            shellMaterial,
            trimMaterial: lorienTrimMaterial,
        });
        addLorienVelmoreRoofCarLift(group, baseGeometry, {
            building,
            shellMaterial,
            trimMaterial: lorienTrimMaterial,
            lightMaterial: lorienLightMaterial,
        });
    }

    if (lorienDoorSystem) {
        lorienDoorSystems.push(lorienDoorSystem);
        group.userData.lorienVelmoreDoorSystem = lorienDoorSystem;
    }
    if (lorienDoorSystems.length > 0) {
        group.userData.lorienVelmoreDoorSystems = lorienDoorSystems;
    }
    if (Array.isArray(group.userData.lorienVelmoreRoofLiftSystems)) {
        group.userData.lorienVelmoreRoofLiftSystems =
            group.userData.lorienVelmoreRoofLiftSystems.filter(Boolean);
    }

    return group;
}

function addUfoDiskoMixedUseFacade(
    group,
    baseGeometry,
    { axis, building, passageWidth, passageHeight, trimMaterial, lightMaterial }
) {
    const travelSpan = axis === 'x' ? building.width : building.depth;
    const crossSpan = axis === 'x' ? building.depth : building.width;
    const wingSpan = Math.max(1.4, (crossSpan - passageWidth) * 0.5);
    const facadeDepth = 0.18;
    const podiumHeight = THREE.MathUtils.clamp(
        Math.max(passageHeight + 0.72, building.height * 0.28),
        passageHeight + 0.52,
        building.height - 5.2
    );
    const upperHeight = Math.max(5.2, building.height - podiumHeight);
    const roofCapHeight = THREE.MathUtils.clamp(upperHeight * 0.045, 0.86, 1.28);
    const residentialFacadeHeight = Math.max(4.2, upperHeight - roofCapHeight);
    const residentialFacadeCenterY = podiumHeight + residentialFacadeHeight * 0.5;
    const podiumFrontTexture = createLuxuryMarbleTexture();
    podiumFrontTexture.repeat.set(
        Math.max(1, Math.round(crossSpan / 3.8)),
        Math.max(2, Math.round(podiumHeight / 3.2))
    );
    const podiumSideTexture = createLuxuryMarbleTexture();
    podiumSideTexture.repeat.set(
        Math.max(2, Math.round(travelSpan / 4.2)),
        Math.max(2, Math.round(podiumHeight / 3.2))
    );
    const residentialFrontTexture = createLuxuryMarbleTexture();
    residentialFrontTexture.repeat.set(
        Math.max(1, Math.round(crossSpan / 5.2)),
        Math.max(2, Math.round(residentialFacadeHeight / 3.1))
    );
    const residentialSideTexture = createLuxuryMarbleTexture();
    residentialSideTexture.repeat.set(
        Math.max(2, Math.round(travelSpan / 5.2)),
        Math.max(2, Math.round(residentialFacadeHeight / 3.1))
    );

    const podiumFrontMaterial = new THREE.MeshStandardMaterial({
        color: 0x172231,
        map: podiumFrontTexture,
        emissive: 0x08111d,
        emissiveIntensity: 0.12,
        roughness: 0.22,
        metalness: 0.22,
    });
    const podiumSideMaterial = new THREE.MeshStandardMaterial({
        color: 0x13202d,
        map: podiumSideTexture,
        emissive: 0x08111b,
        emissiveIntensity: 0.12,
        roughness: 0.24,
        metalness: 0.2,
    });
    const podiumRibMaterial = trimMaterial.clone();
    podiumRibMaterial.color.setHex(0x2f7082);
    podiumRibMaterial.emissive.setHex(0x0d2231);
    podiumRibMaterial.emissiveIntensity = 0.16;
    podiumRibMaterial.roughness = 0.28;
    podiumRibMaterial.metalness = 0.84;
    const podiumPlinthMaterial = new THREE.MeshStandardMaterial({
        color: 0x0b1018,
        emissive: 0x050a11,
        emissiveIntensity: 0.06,
        roughness: 0.34,
        metalness: 0.32,
    });
    const residentialFrontMaterial = new THREE.MeshStandardMaterial({
        color: 0x5b6474,
        map: residentialFrontTexture,
        emissive: 0x141922,
        emissiveIntensity: 0.05,
        roughness: 0.62,
        metalness: 0.1,
    });
    const residentialSideMaterial = new THREE.MeshStandardMaterial({
        color: 0x56606f,
        map: residentialSideTexture,
        emissive: 0x141922,
        emissiveIntensity: 0.05,
        roughness: 0.64,
        metalness: 0.09,
    });
    const residentialBandMaterial = new THREE.MeshStandardMaterial({
        color: 0x2b3341,
        emissive: 0x0f141d,
        emissiveIntensity: 0.08,
        roughness: 0.42,
        metalness: 0.28,
    });
    const residentialRevealMaterial = new THREE.MeshStandardMaterial({
        color: 0x202935,
        emissive: 0x0e141d,
        emissiveIntensity: 0.08,
        roughness: 0.3,
        metalness: 0.14,
    });
    const residentialFrameMaterial = new THREE.MeshStandardMaterial({
        color: 0xaeb8c4,
        emissive: 0x1a2634,
        emissiveIntensity: 0.08,
        roughness: 0.2,
        metalness: 0.78,
    });
    const residentialGlassTexture = createLuxuryGlassWindowTexture();
    residentialGlassTexture.repeat.set(1, Math.max(1, Math.round(residentialFacadeHeight / 2.6)));
    const residentialGlassMaterial = createLorienTowerGlassMaterial(residentialGlassTexture);
    residentialGlassMaterial.color.setHex(0xaec2d4);
    residentialGlassMaterial.emissive.setHex(0x31404d);
    residentialGlassMaterial.emissiveIntensity = 0.12;
    residentialGlassMaterial.opacity = 0.84;
    const residentialGlowMaterial = new THREE.MeshBasicMaterial({
        color: 0xfff1dc,
        transparent: true,
        opacity: 0.22,
        toneMapped: false,
    });
    const residentialCoolGlowMaterial = new THREE.MeshBasicMaterial({
        color: 0xa7f4ff,
        transparent: true,
        opacity: 0.18,
        toneMapped: false,
    });
    const crownLightMaterial = lightMaterial.clone();
    crownLightMaterial.color.setHex(0x8df5ff);
    crownLightMaterial.opacity = 0.18;

    const addFacadeFace = (faceAxis, faceCoordinate, y, span, height, material, along = 0) => {
        if (faceAxis === 'z') {
            addDecorBox(group, baseGeometry, material, {
                x: along,
                y,
                z: faceCoordinate,
                width: span,
                height,
                depth: facadeDepth,
            });
        } else {
            addDecorBox(group, baseGeometry, material, {
                x: faceCoordinate,
                y,
                z: along,
                width: facadeDepth,
                height,
                depth: span,
            });
        }
    };

    const addFacadeRibbon = (faceAxis, faceCoordinate, y, span, material, along = 0) => {
        if (faceAxis === 'z') {
            addDecorBox(group, baseGeometry, material, {
                x: along,
                y,
                z: faceCoordinate,
                width: span,
                height: 0.05,
                depth: 0.03,
            });
        } else {
            addDecorBox(group, baseGeometry, material, {
                x: faceCoordinate,
                y,
                z: along,
                width: 0.03,
                height: 0.05,
                depth: span,
            });
        }
    };

    const addVerticalPilasters = ({
        faceAxis,
        faceCoordinate,
        span,
        y,
        height,
        count,
        material,
        edgeInset = 0.72,
    }) => {
        const resolvedCount = Math.max(1, Math.round(count));
        if (resolvedCount === 1) {
            addFacadeFace(faceAxis, faceCoordinate, y, 0.12, height, material);
            return;
        }
        const usableSpan = Math.max(0.24, span - edgeInset * 2);
        for (let index = 0; index < resolvedCount; index += 1) {
            const t = resolvedCount === 1 ? 0.5 : index / (resolvedCount - 1);
            const along = -usableSpan * 0.5 + usableSpan * t;
            addFacadeFace(faceAxis, faceCoordinate, y, 0.12, height, material, along);
        }
    };

    const rowCount = Math.max(3, Math.min(10, Math.floor((residentialFacadeHeight - 1.2) / 3.02)));
    const rowSpacing = residentialFacadeHeight / rowCount;
    const windowHeight = THREE.MathUtils.clamp(rowSpacing - 0.9, 1.56, 2.12);
    const residentialWindowFloat = facadeDepth * 0.38;
    const addResidentialWindows = ({ faceAxis, faceCoordinate, span, edgeInset = 1.34 }) => {
        const faceDirection = Math.sign(faceCoordinate) || 1;
        const floatedFaceCoordinate = faceCoordinate + faceDirection * residentialWindowFloat;
        const usableSpan = span - edgeInset * 2;
        if (usableSpan <= 3.2) {
            return;
        }
        const columnCount = Math.max(2, Math.min(7, Math.floor(usableSpan / 2.85)));
        const columnSpacing = usableSpan / columnCount;
        const windowWidth = THREE.MathUtils.clamp(columnSpacing - 0.68, 1.24, 1.92);

        for (let row = 0; row < rowCount; row += 1) {
            const windowY = podiumHeight + rowSpacing * (row + 0.5);
            if (row < rowCount - 1) {
                addFacadeFace(
                    faceAxis,
                    faceCoordinate,
                    podiumHeight + rowSpacing * (row + 1) - 0.1,
                    span - 0.72,
                    0.08,
                    residentialBandMaterial
                );
            }
            for (let column = 0; column < columnCount; column += 1) {
                const along =
                    -usableSpan * 0.5 +
                    columnSpacing * (column + 0.5) +
                    (row % 2 === 0 ? -0.08 : 0.08);
                const glowMaterial =
                    (row + column) % 3 === 0
                        ? residentialCoolGlowMaterial
                        : residentialGlowMaterial;
                addLorienLuxuryWindow(group, baseGeometry, {
                    axis: faceAxis,
                    faceCoordinate: floatedFaceCoordinate,
                    along,
                    y: windowY,
                    width: windowWidth,
                    height: windowHeight,
                    frameMaterial: residentialFrameMaterial,
                    glassMaterial: residentialGlassMaterial,
                    revealMaterial: residentialRevealMaterial,
                    trimMaterial: residentialBandMaterial,
                    glowMaterial,
                    paneCount: windowWidth > 1.6 ? 2 : 1,
                });
            }
        }
    };

    const entryFaceAxis = axis === 'x' ? 'x' : 'z';
    const sideFaceAxis = axis === 'x' ? 'z' : 'x';
    const entryFaceCoord = travelSpan * 0.5 + facadeDepth * 0.5;
    const sideFaceCoord = crossSpan * 0.5 + facadeDepth * 0.5;
    const entrySidePanelWidth = Math.max(1.02, wingSpan - 0.28);
    const entrySidePanelCenter = passageWidth * 0.5 + entrySidePanelWidth * 0.5 + 0.14;
    const entrySpandrelHeight = Math.max(0.92, podiumHeight - passageHeight);
    const entryPlinthHeight = 0.14;

    [-1, 1].forEach((direction) => {
        const faceCoordinate = direction * entryFaceCoord;
        addFacadeFace(
            entryFaceAxis,
            faceCoordinate,
            podiumHeight * 0.5,
            entrySidePanelWidth,
            podiumHeight,
            podiumFrontMaterial,
            -entrySidePanelCenter
        );
        addFacadeFace(
            entryFaceAxis,
            faceCoordinate,
            podiumHeight * 0.5,
            entrySidePanelWidth,
            podiumHeight,
            podiumFrontMaterial,
            entrySidePanelCenter
        );
        addFacadeFace(
            entryFaceAxis,
            faceCoordinate,
            passageHeight + entrySpandrelHeight * 0.5,
            passageWidth + 1.34,
            entrySpandrelHeight,
            podiumFrontMaterial
        );
        addFacadeFace(
            entryFaceAxis,
            faceCoordinate,
            entryPlinthHeight * 0.5,
            entrySidePanelWidth,
            entryPlinthHeight,
            podiumPlinthMaterial,
            -entrySidePanelCenter
        );
        addFacadeFace(
            entryFaceAxis,
            faceCoordinate,
            entryPlinthHeight * 0.5,
            entrySidePanelWidth,
            entryPlinthHeight,
            podiumPlinthMaterial,
            entrySidePanelCenter
        );
        addFacadeFace(
            entryFaceAxis,
            faceCoordinate,
            residentialFacadeCenterY,
            crossSpan - 0.42,
            residentialFacadeHeight,
            residentialFrontMaterial
        );
        addFacadeFace(
            entryFaceAxis,
            faceCoordinate,
            building.height - roofCapHeight * 0.5,
            crossSpan - 0.18,
            roofCapHeight,
            residentialBandMaterial
        );
        addFacadeRibbon(
            entryFaceAxis,
            faceCoordinate - direction * 0.1,
            podiumHeight - 0.34,
            crossSpan - 0.82,
            crownLightMaterial
        );
        addVerticalPilasters({
            faceAxis: entryFaceAxis,
            faceCoordinate: faceCoordinate - direction * 0.01,
            span: crossSpan - 0.9,
            y: residentialFacadeCenterY,
            height: residentialFacadeHeight,
            count: Math.max(3, Math.round(crossSpan / 3.6)),
            material: residentialBandMaterial,
            edgeInset: 1.18,
        });
        [-1, 1].forEach((sideDirection) => {
            addFacadeFace(
                entryFaceAxis,
                faceCoordinate - direction * 0.02,
                podiumHeight * 0.5,
                0.18,
                podiumHeight,
                podiumRibMaterial,
                sideDirection * (passageWidth * 0.5 + 0.36)
            );
            addFacadeFace(
                entryFaceAxis,
                faceCoordinate - direction * 0.02,
                podiumHeight * 0.5,
                0.12,
                podiumHeight,
                podiumRibMaterial,
                sideDirection * (crossSpan * 0.5 - 0.36)
            );
        });
        addResidentialWindows({
            faceAxis: entryFaceAxis,
            faceCoordinate: faceCoordinate - direction * 0.02,
            span: crossSpan - 2.2,
            edgeInset: 1.32,
        });
    });

    [-1, 1].forEach((direction) => {
        const faceCoordinate = direction * sideFaceCoord;
        addFacadeFace(
            sideFaceAxis,
            faceCoordinate,
            podiumHeight * 0.5,
            travelSpan - 0.38,
            podiumHeight,
            podiumSideMaterial
        );
        addFacadeFace(
            sideFaceAxis,
            faceCoordinate,
            0.22,
            travelSpan - 0.46,
            0.44,
            podiumPlinthMaterial
        );
        addFacadeFace(
            sideFaceAxis,
            faceCoordinate,
            residentialFacadeCenterY,
            travelSpan - 0.34,
            residentialFacadeHeight,
            residentialSideMaterial
        );
        addFacadeFace(
            sideFaceAxis,
            faceCoordinate,
            building.height - roofCapHeight * 0.5,
            travelSpan - 0.14,
            roofCapHeight,
            residentialBandMaterial
        );
        addFacadeRibbon(
            sideFaceAxis,
            faceCoordinate - direction * 0.1,
            podiumHeight - 0.34,
            travelSpan - 0.72,
            crownLightMaterial
        );
        addVerticalPilasters({
            faceAxis: sideFaceAxis,
            faceCoordinate: faceCoordinate - direction * 0.01,
            span: travelSpan - 0.72,
            y: podiumHeight * 0.5,
            height: podiumHeight,
            count: Math.max(4, Math.round(travelSpan / 4.1)),
            material: podiumRibMaterial,
            edgeInset: 0.88,
        });
        addVerticalPilasters({
            faceAxis: sideFaceAxis,
            faceCoordinate: faceCoordinate - direction * 0.01,
            span: travelSpan - 0.86,
            y: residentialFacadeCenterY,
            height: residentialFacadeHeight,
            count: Math.max(4, Math.round(travelSpan / 3.8)),
            material: residentialBandMaterial,
            edgeInset: 1.18,
        });
        addResidentialWindows({
            faceAxis: sideFaceAxis,
            faceCoordinate: faceCoordinate - direction * 0.02,
            span: travelSpan - 2.1,
            edgeInset: 1.44,
        });
    });
}

function addDriveThroughBuildingObstacles(building, variant) {
    const axis = variant.passageAxis === 'z' ? 'z' : 'x';
    if (variant.groundLayout === 'galleryHall') {
        addGalleryHallObstacles(building, variant, axis);
        addLorienVelmoreRoofLiftObstacles(building);
        return;
    }
    const transverseSpan = axis === 'x' ? building.depth : building.width;
    const passageWidth = THREE.MathUtils.clamp(variant.passageWidth, 4.8, transverseSpan - 3.6);
    const sideWingSpan = Math.max(1.4, (transverseSpan - passageWidth) * 0.5);
    const wingOffset = passageWidth * 0.5 + sideWingSpan * 0.5;
    const collisionPadding = Math.max(0, Number(variant.obstaclePadding) || 0);

    addObstacleAabb(
        axis === 'x' ? building.x : building.x - wingOffset,
        axis === 'x' ? building.z - wingOffset : building.z,
        axis === 'x' ? building.width : sideWingSpan,
        axis === 'x' ? sideWingSpan : building.depth,
        collisionPadding,
        'building'
    );
    addObstacleAabb(
        axis === 'x' ? building.x : building.x + wingOffset,
        axis === 'x' ? building.z + wingOffset : building.z,
        axis === 'x' ? building.width : sideWingSpan,
        axis === 'x' ? sideWingSpan : building.depth,
        collisionPadding,
        'building'
    );
}

function addLorienVelmoreLuxuryPassageDecor(
    group,
    baseGeometry,
    { axis, building, passageWidth, passageHeight, isGalleryHall = false }
) {
    const travelSpan = axis === 'x' ? building.width : building.depth;
    const crossSpan = axis === 'x' ? building.depth : building.width;
    const portalDepth = 0.26;
    const frameThickness = 0.22;
    const lintelHeight = 0.3;
    const portalInset = 0.12;
    const runnerWidth = passageWidth * 0.56;
    const runnerLength = Math.max(3.8, travelSpan - 1.6);
    const ceilingPanelCount = Math.max(4, Math.round(travelSpan / 3.2));
    const ceilingPanelLength = Math.max(1.3, Math.min(2.45, runnerLength / ceilingPanelCount));
    const ceilingPanelWidth = Math.max(1.8, passageWidth - 1.1);

    const shellMaterial = new THREE.MeshStandardMaterial({
        color: 0xe7decf,
        emissive: 0x3a3228,
        emissiveIntensity: 0.1,
        roughness: 0.34,
        metalness: 0.14,
    });
    const trimMaterial = new THREE.MeshStandardMaterial({
        color: 0xc9ac84,
        emissive: 0x43301d,
        emissiveIntensity: 0.16,
        roughness: 0.28,
        metalness: 0.86,
    });
    const runnerMaterial = new THREE.MeshStandardMaterial({
        color: 0x5f4735,
        emissive: 0x23170e,
        emissiveIntensity: 0.08,
        roughness: 0.7,
        metalness: 0.05,
    });
    const lightMaterial = new THREE.MeshBasicMaterial({
        color: 0xffefcb,
        transparent: true,
        opacity: 0.88,
        toneMapped: false,
    });

    if (!isGalleryHall) {
        const skirtingOffset = passageWidth * 0.5 - 0.05;
        addDecorBox(group, baseGeometry, trimMaterial, {
            x: axis === 'x' ? 0 : -skirtingOffset,
            y: 0.16,
            z: axis === 'x' ? -skirtingOffset : 0,
            width: axis === 'x' ? travelSpan - 0.9 : 0.08,
            height: 0.18,
            depth: axis === 'x' ? 0.08 : travelSpan - 0.9,
        });
        addDecorBox(group, baseGeometry, trimMaterial, {
            x: axis === 'x' ? 0 : skirtingOffset,
            y: 0.16,
            z: axis === 'x' ? skirtingOffset : 0,
            width: axis === 'x' ? travelSpan - 0.9 : 0.08,
            height: 0.18,
            depth: axis === 'x' ? 0.08 : travelSpan - 0.9,
        });
    }

    for (let i = 0; i < ceilingPanelCount; i += 1) {
        const travelOffset = -runnerLength * 0.5 + (i + 0.5) * (runnerLength / ceilingPanelCount);
        addDecorBox(group, baseGeometry, shellMaterial, {
            x: axis === 'x' ? travelOffset : 0,
            y: passageHeight - 0.16,
            z: axis === 'x' ? 0 : travelOffset,
            width: axis === 'x' ? ceilingPanelLength : ceilingPanelWidth,
            height: 0.06,
            depth: axis === 'x' ? ceilingPanelWidth : ceilingPanelLength,
        });
        addDecorBox(group, baseGeometry, lightMaterial, {
            x: axis === 'x' ? travelOffset : 0,
            y: passageHeight - 0.2,
            z: axis === 'x' ? 0 : travelOffset,
            width: axis === 'x' ? ceilingPanelLength - 0.16 : ceilingPanelWidth - 0.22,
            height: 0.018,
            depth: axis === 'x' ? ceilingPanelWidth - 0.22 : ceilingPanelLength - 0.16,
        });
    }

    const portalDirections = isGalleryHall ? [-1] : [-1, 1];
    portalDirections.forEach((direction) => {
        const portalX = axis === 'x' ? direction * (travelSpan * 0.5 - portalInset) : 0;
        const portalZ = axis === 'x' ? 0 : direction * (travelSpan * 0.5 - portalInset);

        addDecorBox(group, baseGeometry, shellMaterial, {
            x: axis === 'x' ? portalX : -passageWidth * 0.5 - frameThickness * 0.5,
            y: passageHeight * 0.5,
            z: axis === 'x' ? -passageWidth * 0.5 - frameThickness * 0.5 : portalZ,
            width: axis === 'x' ? portalDepth : frameThickness,
            height: passageHeight,
            depth: axis === 'x' ? frameThickness : portalDepth,
        });
        addDecorBox(group, baseGeometry, shellMaterial, {
            x: axis === 'x' ? portalX : passageWidth * 0.5 + frameThickness * 0.5,
            y: passageHeight * 0.5,
            z: axis === 'x' ? passageWidth * 0.5 + frameThickness * 0.5 : portalZ,
            width: axis === 'x' ? portalDepth : frameThickness,
            height: passageHeight,
            depth: axis === 'x' ? frameThickness : portalDepth,
        });
        addDecorBox(group, baseGeometry, shellMaterial, {
            x: portalX,
            y: passageHeight + lintelHeight * 0.5,
            z: portalZ,
            width: axis === 'x' ? portalDepth : passageWidth + frameThickness * 2,
            height: lintelHeight,
            depth: axis === 'x' ? passageWidth + frameThickness * 2 : portalDepth,
        });

        addDecorBox(group, baseGeometry, trimMaterial, {
            x: axis === 'x' ? portalX : -passageWidth * 0.5 - 0.03,
            y: passageHeight * 0.5,
            z: axis === 'x' ? -passageWidth * 0.5 - 0.03 : portalZ,
            width: axis === 'x' ? 0.05 : 0.08,
            height: passageHeight - 0.28,
            depth: axis === 'x' ? 0.08 : 0.05,
        });
        addDecorBox(group, baseGeometry, trimMaterial, {
            x: axis === 'x' ? portalX : passageWidth * 0.5 + 0.03,
            y: passageHeight * 0.5,
            z: axis === 'x' ? passageWidth * 0.5 + 0.03 : portalZ,
            width: axis === 'x' ? 0.05 : 0.08,
            height: passageHeight - 0.28,
            depth: axis === 'x' ? 0.08 : 0.05,
        });
        addDecorBox(group, baseGeometry, trimMaterial, {
            x: portalX,
            y: passageHeight - 0.14,
            z: portalZ,
            width: axis === 'x' ? 0.05 : passageWidth - 0.18,
            height: 0.08,
            depth: axis === 'x' ? passageWidth - 0.18 : 0.05,
        });
        addDecorBox(group, baseGeometry, lightMaterial, {
            x: portalX,
            y: passageHeight - 0.24,
            z: portalZ,
            width: axis === 'x' ? 0.024 : passageWidth - 0.52,
            height: 0.018,
            depth: axis === 'x' ? passageWidth - 0.52 : 0.024,
        });
    });
}

function addUfoDiskoRetailPassageDecor(
    group,
    baseGeometry,
    {
        axis,
        building,
        passageWidth,
        passageHeight,
        trimMaterial,
        lightMaterial,
        storeName = 'UFO DISKO',
    }
) {
    const travelSpan = axis === 'x' ? building.width : building.depth;
    const passageLength = Math.max(4.8, travelSpan - 1.2);
    const laneWidth = THREE.MathUtils.clamp(passageWidth * 0.48, 2.8, passageWidth - 1.9);
    const floorWidth = Math.max(laneWidth + 0.8, passageWidth - 0.48);
    const edgeBandOffset = laneWidth * 0.5 + 0.28;
    const displayOffsets = [-passageLength * 0.26, 0, passageLength * 0.26];
    const platformWidth = Math.max(0.94, (passageWidth - laneWidth) * 0.5 - 0.28);
    const doorSystems = [];

    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x09111d,
        emissive: 0x050c17,
        emissiveIntensity: 0.14,
        roughness: 0.34,
        metalness: 0.3,
    });
    const laneMaterial = new THREE.MeshStandardMaterial({
        color: 0x111a28,
        emissive: 0x091325,
        emissiveIntensity: 0.2,
        roughness: 0.24,
        metalness: 0.44,
    });
    const merchPlinthMaterial = new THREE.MeshStandardMaterial({
        color: 0x1b2432,
        emissive: 0x0d1520,
        emissiveIntensity: 0.16,
        roughness: 0.28,
        metalness: 0.42,
    });
    const haloMaterial = new THREE.MeshBasicMaterial({
        color: 0x78efff,
        transparent: true,
        opacity: 0.16,
        toneMapped: false,
        depthWrite: false,
    });
    const magentaHaloMaterial = new THREE.MeshBasicMaterial({
        color: 0xff62da,
        transparent: true,
        opacity: 0.15,
        toneMapped: false,
        depthWrite: false,
    });
    const wallPanelTexture = createLuxuryMarbleTexture();
    wallPanelTexture.repeat.set(
        Math.max(1, Math.round(passageLength / 4.4)),
        Math.max(1, Math.round(passageHeight / 3.1))
    );
    const wallInsetTexture = createLuxuryMarbleTexture();
    wallInsetTexture.repeat.set(
        Math.max(1, Math.round(passageLength / 4.8)),
        Math.max(1, Math.round(passageHeight / 3.6))
    );
    const wallCoveTexture = createLuxuryMarbleTexture();
    wallCoveTexture.repeat.set(Math.max(1, Math.round(passageLength / 5.2)), 1);
    const wallPanelMaterial = new THREE.MeshStandardMaterial({
        color: 0x0d131b,
        emissive: 0x060b12,
        emissiveIntensity: 0.09,
        roughness: 0.18,
        metalness: 0.54,
        map: wallPanelTexture,
    });
    const wallInsetMaterial = new THREE.MeshStandardMaterial({
        color: 0x05080f,
        emissive: 0x03060c,
        emissiveIntensity: 0.05,
        roughness: 0.16,
        metalness: 0.42,
        map: wallInsetTexture,
    });
    const wallCoveMaterial = new THREE.MeshStandardMaterial({
        color: 0x101722,
        emissive: 0x08111b,
        emissiveIntensity: 0.08,
        roughness: 0.16,
        metalness: 0.5,
        map: wallCoveTexture,
    });

    addUfoDiskoWallTreatments(group, baseGeometry, {
        axis,
        passageWidth,
        passageLength,
        passageHeight,
        laneWidth,
        displayOffsets,
        trimMaterial,
        wallPanelMaterial,
        wallInsetMaterial,
        wallCoveMaterial,
    });

    addDecorBox(group, baseGeometry, floorMaterial, {
        x: 0,
        y: 0.024,
        z: 0,
        width: axis === 'x' ? passageLength : floorWidth,
        height: 0.02,
        depth: axis === 'x' ? floorWidth : passageLength,
    });
    addDecorBox(group, baseGeometry, laneMaterial, {
        x: 0,
        y: 0.038,
        z: 0,
        width: axis === 'x' ? passageLength - 0.26 : laneWidth,
        height: 0.022,
        depth: axis === 'x' ? laneWidth : passageLength - 0.26,
    });
    [-1, 1].forEach((direction) => {
        addDecorBox(group, baseGeometry, merchPlinthMaterial, {
            x: axis === 'x' ? 0 : direction * (laneWidth * 0.5 + platformWidth * 0.5 + 0.18),
            y: 0.052,
            z: axis === 'x' ? direction * (laneWidth * 0.5 + platformWidth * 0.5 + 0.18) : 0,
            width: axis === 'x' ? passageLength - 0.52 : platformWidth,
            height: 0.05,
            depth: axis === 'x' ? platformWidth : passageLength - 0.52,
        });
    });

    addLorienLedRibbon(group, baseGeometry, {
        x: axis === 'x' ? 0 : -edgeBandOffset,
        y: 0.08,
        z: axis === 'x' ? -edgeBandOffset : 0,
        width: axis === 'x' ? passageLength - 0.76 : 0.05,
        height: 0.03,
        depth: axis === 'x' ? 0.05 : passageLength - 0.76,
        axis,
        segmentCount: Math.max(8, Math.round(passageLength / 1.8)),
        segmentGap: 0.08,
        haloColor: 0x62f0ff,
        coreColor: 0xb9feff,
        haloOpacity: 0.22,
        coreOpacity: 0.72,
        sweepSpeed: 0.0012,
        sweepPhase: 0.08,
        sweepBand: 0.18,
    });
    addLorienLedRibbon(group, baseGeometry, {
        x: axis === 'x' ? 0 : edgeBandOffset,
        y: 0.08,
        z: axis === 'x' ? edgeBandOffset : 0,
        width: axis === 'x' ? passageLength - 0.76 : 0.05,
        height: 0.03,
        depth: axis === 'x' ? 0.05 : passageLength - 0.76,
        axis,
        segmentCount: Math.max(8, Math.round(passageLength / 1.8)),
        segmentGap: 0.08,
        haloColor: 0xff62da,
        coreColor: 0xffb6ef,
        haloOpacity: 0.22,
        coreOpacity: 0.72,
        sweepSpeed: 0.0012,
        sweepPhase: 0.54,
        sweepBand: 0.18,
        reverseSweep: true,
    });
    addLorienLedRibbon(group, baseGeometry, {
        x: 0,
        y: passageHeight - 0.18,
        z: 0,
        width: axis === 'x' ? passageLength - 0.92 : 0.08,
        height: 0.04,
        depth: axis === 'x' ? 0.08 : passageLength - 0.92,
        axis,
        segmentCount: Math.max(9, Math.round(passageLength / 1.6)),
        segmentGap: 0.08,
        haloColor: 0x65f6ff,
        coreColor: 0xffffff,
        haloOpacity: 0.18,
        coreOpacity: 0.54,
        sweepSpeed: 0.0009,
        sweepPhase: 0.24,
        sweepBand: 0.16,
    });

    displayOffsets.forEach((travelOffset, index) => {
        addUfoDiskoMerchDisplay(group, baseGeometry, {
            axis,
            side: -1,
            passageWidth,
            travelOffset,
            textureIndex: index,
            trimMaterial,
            plinthMaterial: merchPlinthMaterial,
            haloMaterial,
        });
        addUfoDiskoMerchDisplay(group, baseGeometry, {
            axis,
            side: 1,
            passageWidth,
            travelOffset,
            textureIndex: index + 3,
            trimMaterial,
            plinthMaterial: merchPlinthMaterial,
            haloMaterial: magentaHaloMaterial,
        });
    });

    [-1, 1].forEach((direction) => {
        doorSystems.push(
            createUfoDiskoAutomaticDoorSystem(group, baseGeometry, {
                axis,
                building,
                passageWidth,
                passageHeight,
                portalDirection: direction,
                trimMaterial,
            })
        );
        addUfoDiskoPortalSign(group, {
            axis,
            passageWidth,
            travelSpan,
            direction,
            y: passageHeight - 0.92,
            storeName,
            lightMaterial,
        });
    });

    const discoBallMaterial = new THREE.MeshStandardMaterial({
        color: 0xb7f7ff,
        emissive: 0x1d5672,
        emissiveIntensity: 0.24,
        roughness: 0.16,
        metalness: 0.92,
    });
    const discoBall = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), discoBallMaterial);
    discoBall.position.set(0, passageHeight - 1.05, 0);
    discoBall.castShadow = false;
    discoBall.receiveShadow = false;
    group.add(discoBall);

    const discoRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.82, 0.05, 12, 40),
        new THREE.MeshBasicMaterial({
            color: 0x75f0ff,
            transparent: true,
            opacity: 0.28,
            toneMapped: false,
            depthWrite: false,
        })
    );
    discoRing.rotation.x = Math.PI * 0.5;
    discoRing.position.copy(discoBall.position);
    discoRing.position.y -= 0.24;
    group.add(discoRing);

    addDecorBox(group, baseGeometry, trimMaterial, {
        x: 0,
        y: passageHeight - 0.48,
        z: 0,
        width: 0.06,
        height: 0.88,
        depth: 0.06,
    });
    addDecorBox(group, baseGeometry, haloMaterial, {
        x: 0,
        y: passageHeight - 1.05,
        z: 0,
        width: 1.42,
        height: 0.08,
        depth: 1.42,
    });

    return doorSystems.filter(Boolean);
}

function addUfoDiskoWallTreatments(
    group,
    baseGeometry,
    {
        axis,
        passageWidth,
        passageLength,
        passageHeight,
        laneWidth,
        displayOffsets,
        trimMaterial,
        wallPanelMaterial,
        wallInsetMaterial,
        wallCoveMaterial,
    }
) {
    const wallThickness = 0.16;
    const insetThickness = 0.08;
    const cassetteHeight = 4.18;
    const cassetteDepth = 3.08;
    const cassetteY = 2.44;
    const sideWallCoord = passageWidth * 0.5 - wallThickness * 0.5 - 0.02;
    const sideRibbonCoord = passageWidth * 0.5 - 0.18;
    const topCoveY = passageHeight - 0.9;
    const lowerBandY = 0.72;
    const ceilingRunLength = Math.max(4.6, passageLength - 1.26);
    const lowerBandLength = Math.max(4.2, passageLength - 1.08);
    const cyanGlow = 0x72f3ff;
    const magentaGlow = 0xff69df;

    const addWallBox = (
        material,
        { sideDirection = 1, along = 0, y = 0, width = 0.12, height = 1, depth = 1 }
    ) => {
        if (axis === 'z') {
            addDecorBox(group, baseGeometry, material, {
                x: sideDirection * sideWallCoord,
                y,
                z: along,
                width,
                height,
                depth,
            });
            return;
        }
        addDecorBox(group, baseGeometry, material, {
            x: along,
            y,
            z: sideDirection * sideWallCoord,
            width: depth,
            height,
            depth: width,
        });
    };

    [-1, 1].forEach((sideDirection) => {
        const sideGlow = sideDirection < 0 ? cyanGlow : magentaGlow;
        const coreGlow = sideDirection < 0 ? 0xe2fdff : 0xffd4f6;

        addWallBox(wallCoveMaterial, {
            sideDirection,
            along: 0,
            y: topCoveY,
            width: wallThickness,
            height: 0.48,
            depth: ceilingRunLength,
        });
        addWallBox(wallPanelMaterial, {
            sideDirection,
            along: 0,
            y: lowerBandY,
            width: wallThickness,
            height: 1.22,
            depth: lowerBandLength,
        });

        addLorienLedRibbon(group, baseGeometry, {
            x: axis === 'x' ? 0 : sideDirection * sideRibbonCoord,
            y: passageHeight - 1.02,
            z: axis === 'x' ? sideDirection * sideRibbonCoord : 0,
            width: axis === 'x' ? ceilingRunLength : 0.03,
            height: 0.05,
            depth: axis === 'x' ? 0.03 : ceilingRunLength,
            axis,
            segmentCount: Math.max(8, Math.round(ceilingRunLength / 1.45)),
            segmentGap: 0.06,
            haloColor: sideGlow,
            coreColor: coreGlow,
            haloOpacity: 0.18,
            coreOpacity: 0.56,
            sweepSpeed: 0.001,
            sweepPhase: sideDirection < 0 ? 0.12 : 0.56,
            sweepBand: 0.18,
            reverseSweep: sideDirection > 0,
        });

        displayOffsets.forEach((travelOffset, index) => {
            addWallBox(wallPanelMaterial, {
                sideDirection,
                along: travelOffset,
                y: cassetteY,
                width: wallThickness,
                height: cassetteHeight,
                depth: cassetteDepth,
            });
            addWallBox(wallInsetMaterial, {
                sideDirection,
                along: travelOffset,
                y: cassetteY,
                width: insetThickness,
                height: cassetteHeight - 0.42,
                depth: cassetteDepth - 0.34,
            });
            addWallBox(trimMaterial, {
                sideDirection,
                along: travelOffset,
                y: cassetteY + cassetteHeight * 0.5 - 0.14,
                width: 0.06,
                height: 0.1,
                depth: cassetteDepth - 0.22,
            });

            const edgeOffsets = [-cassetteDepth * 0.34, cassetteDepth * 0.34];
            edgeOffsets.forEach((edgeOffset, edgeIndex) => {
                addLorienLedRibbon(group, baseGeometry, {
                    x:
                        axis === 'z'
                            ? sideDirection * (sideRibbonCoord - 0.02)
                            : travelOffset + edgeOffset,
                    y: 2.76,
                    z:
                        axis === 'z'
                            ? travelOffset + edgeOffset
                            : sideDirection * (sideRibbonCoord - 0.02),
                    width: 0.03,
                    height: 1.86,
                    depth: 0.03,
                    axis: 'y',
                    segmentCount: 5,
                    segmentGap: 0.06,
                    haloColor: sideGlow,
                    coreColor: coreGlow,
                    haloOpacity: 0.2,
                    coreOpacity: 0.62,
                    sweepSpeed: 0.00105,
                    sweepPhase: (sideDirection < 0 ? 0.08 : 0.44) + index * 0.14 + edgeIndex * 0.09,
                    sweepBand: 0.22,
                    reverseSweep: (index + edgeIndex) % 2 === 1,
                });
            });

            addLorienLedRibbon(group, baseGeometry, {
                x: axis === 'x' ? travelOffset : sideDirection * (sideRibbonCoord - 0.01),
                y: 4.08,
                z: axis === 'x' ? sideDirection * (sideRibbonCoord - 0.01) : travelOffset,
                width: axis === 'x' ? 1.34 : 0.028,
                height: 0.04,
                depth: axis === 'x' ? 0.028 : 1.34,
                axis,
                segmentCount: 4,
                segmentGap: 0.05,
                haloColor: sideGlow,
                coreColor: coreGlow,
                haloOpacity: 0.16,
                coreOpacity: 0.48,
                sweepSpeed: 0.00092,
                sweepPhase: 0.24 + index * 0.16 + (sideDirection > 0 ? 0.4 : 0),
                sweepBand: 0.24,
                reverseSweep: sideDirection > 0,
            });

            addWallBox(wallInsetMaterial, {
                sideDirection,
                along: travelOffset,
                y: 4.48,
                width: 0.06,
                height: 0.36,
                depth: 1.18,
            });
        });

        const midOffsets = [-passageLength * 0.13, passageLength * 0.13];
        midOffsets.forEach((travelOffset, index) => {
            addWallBox(trimMaterial, {
                sideDirection,
                along: travelOffset,
                y: 4.78,
                width: 0.05,
                height: 0.08,
                depth: 0.86,
            });
            addLorienLedRibbon(group, baseGeometry, {
                x: axis === 'x' ? travelOffset : sideDirection * (sideRibbonCoord - 0.015),
                y: 4.92,
                z: axis === 'x' ? sideDirection * (sideRibbonCoord - 0.015) : travelOffset,
                width: axis === 'x' ? 0.72 : 0.022,
                height: 0.03,
                depth: axis === 'x' ? 0.022 : 0.72,
                axis,
                segmentCount: 3,
                segmentGap: 0.04,
                haloColor: sideGlow,
                coreColor: coreGlow,
                haloOpacity: 0.15,
                coreOpacity: 0.42,
                sweepSpeed: 0.00084,
                sweepPhase: 0.18 + index * 0.32,
                sweepBand: 0.28,
                reverseSweep: sideDirection < 0,
            });
        });
    });
}

function addUfoDiskoMerchDisplay(
    group,
    baseGeometry,
    {
        axis,
        side = 1,
        passageWidth,
        travelOffset = 0,
        textureIndex = 0,
        trimMaterial,
        plinthMaterial,
        haloMaterial,
    }
) {
    const sideDirection = side < 0 ? -1 : 1;
    const displayWidth = 1.62;
    const displayHeight = 2.24;
    const shelfHeight = 0.84;
    const hangerHeight = 2.92;
    const panelThickness = 0.06;
    const sideInset = passageWidth * 0.5 - 0.34;
    const shelfDepth = 0.62;
    const frameMaterial = trimMaterial.clone();
    frameMaterial.color.lerp(new THREE.Color(0xffffff), 0.1);

    const panelMaterial = new THREE.MeshBasicMaterial({
        map: getUfoDiskoTeeTexture(textureIndex),
        transparent: true,
        toneMapped: false,
        side: THREE.DoubleSide,
    });
    const glowMaterial = haloMaterial.clone();
    glowMaterial.opacity =
        (Number(haloMaterial.opacity) || 0.16) * (textureIndex % 2 === 0 ? 1 : 0.9);

    if (axis === 'z') {
        addDecorBox(group, baseGeometry, plinthMaterial, {
            x: sideDirection * (sideInset - shelfDepth * 0.5 - 0.08),
            y: shelfHeight * 0.5,
            z: travelOffset,
            width: shelfDepth,
            height: shelfHeight,
            depth: 1.8,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: sideDirection * (sideInset - panelThickness * 0.5),
            y: 2.08,
            z: travelOffset,
            width: panelThickness,
            height: displayHeight + 0.16,
            depth: displayWidth + 0.16,
        });
    } else {
        addDecorBox(group, baseGeometry, plinthMaterial, {
            x: travelOffset,
            y: shelfHeight * 0.5,
            z: sideDirection * (sideInset - shelfDepth * 0.5 - 0.08),
            width: 1.8,
            height: shelfHeight,
            depth: shelfDepth,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: travelOffset,
            y: 2.08,
            z: sideDirection * (sideInset - panelThickness * 0.5),
            width: displayWidth + 0.16,
            height: displayHeight + 0.16,
            depth: panelThickness,
        });
    }

    addUfoDiskoDisplayPlane(group, {
        axis,
        sideDirection,
        sideInset,
        travelOffset,
        width: displayWidth,
        height: displayHeight,
        y: 2.08,
        surfaceOffset: 0.05,
        material: glowMaterial,
        glowScale: 1.08,
    });
    addUfoDiskoDisplayPlane(group, {
        axis,
        sideDirection,
        sideInset,
        travelOffset,
        width: displayWidth,
        height: displayHeight,
        y: 2.08,
        surfaceOffset: 0.08,
        material: panelMaterial,
    });

    if (axis === 'z') {
        addDecorBox(group, baseGeometry, trimMaterial, {
            x: sideDirection * (sideInset - 0.18),
            y: hangerHeight,
            z: travelOffset,
            width: 0.08,
            height: 0.08,
            depth: 1.34,
        });
    } else {
        addDecorBox(group, baseGeometry, trimMaterial, {
            x: travelOffset,
            y: hangerHeight,
            z: sideDirection * (sideInset - 0.18),
            width: 1.34,
            height: 0.08,
            depth: 0.08,
        });
    }
}

function addUfoDiskoDisplayPlane(
    group,
    {
        axis,
        sideDirection,
        sideInset,
        travelOffset,
        width,
        height,
        y,
        surfaceOffset = 0.06,
        material,
        glowScale = 1,
    }
) {
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(width * glowScale, height * glowScale),
        material
    );
    plane.castShadow = false;
    plane.receiveShadow = false;
    if (axis === 'z') {
        plane.position.set(sideDirection * (sideInset - surfaceOffset), y, travelOffset);
        plane.rotation.y = sideDirection < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    } else {
        plane.position.set(travelOffset, y, sideDirection * (sideInset - surfaceOffset));
        plane.rotation.y = sideDirection < 0 ? 0 : Math.PI;
    }
    group.add(plane);
}

function addUfoDiskoPortalSign(
    group,
    {
        axis,
        passageWidth,
        travelSpan,
        direction = -1,
        y = 5.6,
        storeName = 'UFO DISKO',
        lightMaterial,
    }
) {
    const plateWidth =
        direction < 0 ? Math.min(4.9, passageWidth + 0.88) : Math.min(3.8, passageWidth + 0.24);
    const plateHeight = direction < 0 ? 1.22 : 0.92;
    const signSize = direction < 0 ? 1.38 : 1.02;
    const glowMaterial = lightMaterial.clone();
    glowMaterial.opacity = direction < 0 ? 0.34 : 0.24;
    glowMaterial.side = THREE.DoubleSide;
    const plateMaterial = new THREE.MeshBasicMaterial({
        color: 0x080c16,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        toneMapped: false,
    });
    const signMaterial = new THREE.MeshBasicMaterial({
        map: getUfoDiskoStoreSignTexture(storeName),
        transparent: true,
        alphaTest: 0.08,
        toneMapped: false,
        side: THREE.FrontSide,
    });
    const halo = new THREE.Mesh(
        new THREE.PlaneGeometry(plateWidth * 1.1, plateHeight * 1.28),
        glowMaterial
    );
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(plateWidth, plateHeight), plateMaterial);
    const portalOffset = direction * (travelSpan * 0.5 - 0.2);
    let signRotationY = 0;
    let approachOffset = 0;
    let signPositionX = 0;
    let signPositionZ = 0;

    if (axis === 'z') {
        signRotationY = direction < 0 ? Math.PI : 0;
        approachOffset = direction;
        signPositionZ = portalOffset + direction * 0.16;
        halo.position.set(0, y, portalOffset + direction * 0.12);
    } else {
        signRotationY = direction < 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
        approachOffset = direction;
        signPositionX = portalOffset + direction * 0.16;
        halo.position.set(portalOffset + direction * 0.12, y, 0);
    }
    halo.rotation.y = signRotationY;
    plate.rotation.y = signRotationY;

    halo.renderOrder = 3;
    halo.castShadow = false;
    halo.receiveShadow = false;
    plate.renderOrder = 4;
    plate.castShadow = false;
    plate.receiveShadow = false;
    group.add(halo);
    plate.position.copy(halo.position);
    if (axis === 'z') {
        plate.position.z += direction * 0.01;
    } else {
        plate.position.x += direction * 0.01;
    }
    group.add(plate);

    const signOffsets = [0.012, -0.012];
    signOffsets.forEach((offset, index) => {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(signSize, signSize), signMaterial);
        sign.position.set(
            signPositionX + (axis === 'x' ? approachOffset * offset : 0),
            y,
            signPositionZ + (axis === 'z' ? approachOffset * offset : 0)
        );
        sign.rotation.y = signRotationY + (index === 0 ? 0 : Math.PI);
        sign.renderOrder = 5;
        sign.castShadow = false;
        sign.receiveShadow = false;
        group.add(sign);
    });
}

function createUfoDiskoAutomaticDoorSystem(
    group,
    baseGeometry,
    { axis, building, passageWidth, passageHeight, portalDirection = -1, trimMaterial }
) {
    const portalSide = portalDirection < 0 ? -1 : 1;
    const insideDirection = -portalSide;
    const travelSpan = axis === 'x' ? building.width : building.depth;
    const doorHeight = THREE.MathUtils.clamp(passageHeight - 0.26, 5.18, passageHeight - 0.12);
    const frameHeight = Math.min(passageHeight - 0.04, doorHeight + 0.12);
    const doorBaseY = 0.05;
    const openingHalfWidth = Math.max(2.25, Math.min(passageWidth * 0.5 - 0.24, 2.72));
    const doorPanelWidth = openingHalfWidth + 0.14;
    const doorClosedOffset = openingHalfWidth - doorPanelWidth * 0.5;
    const doorTravelDistance = Math.max(1.12, openingHalfWidth - 0.58);
    const portalCoord = portalSide * (travelSpan * 0.5 - 0.26);
    const doorPlaneCoord = portalCoord + insideDirection * 0.2;
    const roomEndCoord = portalCoord + insideDirection * (travelSpan - 0.86);
    const transomHeight = Math.max(0.14, passageHeight - (doorBaseY + doorHeight) - 0.06);
    const transomCenterY = doorBaseY + doorHeight + transomHeight * 0.5 + 0.02;
    const frameMaterial = trimMaterial.clone();
    frameMaterial.color.lerp(new THREE.Color(0xffffff), 0.08);
    frameMaterial.emissive.lerp(new THREE.Color(0x1c3f5d), 0.22);
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0xeefcff,
        emissive: 0x3a1642,
        emissiveIntensity: 0.1,
        transparent: true,
        opacity: 0.24,
        roughness: 0.08,
        metalness: 0.14,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: portalSide < 0 ? 0x68f2ff : 0xff7ae3,
        transparent: true,
        opacity: 0.28,
        toneMapped: false,
    });
    const jambThickness = 0.18;
    const lintelThickness = 0.14;
    const stopThickness = 0.06;
    const frameDepth = 0.18;
    const sideSealWidth = Math.max(0.12, passageWidth * 0.5 - openingHalfWidth);
    const revealDepth = Math.max(frameDepth, Math.abs(doorPlaneCoord - portalCoord) + frameDepth);
    const sealCenterCoord = (portalCoord + doorPlaneCoord) * 0.5;
    const transomGlassMaterial = glassMaterial.clone();
    transomGlassMaterial.opacity = 0.3;

    if (axis === 'z') {
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: -openingHalfWidth - sideSealWidth * 0.5,
            y: passageHeight * 0.5,
            z: sealCenterCoord,
            width: sideSealWidth,
            height: passageHeight - 0.02,
            depth: revealDepth,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: openingHalfWidth + sideSealWidth * 0.5,
            y: passageHeight * 0.5,
            z: sealCenterCoord,
            width: sideSealWidth,
            height: passageHeight - 0.02,
            depth: revealDepth,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: -openingHalfWidth - jambThickness * 0.5,
            y: frameHeight * 0.5,
            z: doorPlaneCoord,
            width: jambThickness,
            height: frameHeight,
            depth: 0.18,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: openingHalfWidth + jambThickness * 0.5,
            y: frameHeight * 0.5,
            z: doorPlaneCoord,
            width: jambThickness,
            height: frameHeight,
            depth: 0.18,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: 0,
            y: doorHeight + 0.26,
            z: doorPlaneCoord,
            width: openingHalfWidth * 2 + 0.44,
            height: lintelThickness,
            depth: 0.18,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: 0,
            y: transomCenterY,
            z: doorPlaneCoord,
            width: openingHalfWidth * 2 + 0.04,
            height: transomHeight,
            depth: frameDepth,
        });
        addDecorBox(group, baseGeometry, transomGlassMaterial, {
            x: 0,
            y: transomCenterY,
            z: doorPlaneCoord + 0.01,
            width: openingHalfWidth * 2 - 0.22,
            height: Math.max(0.12, transomHeight - 0.12),
            depth: 0.03,
        });
        addDecorBox(group, baseGeometry, glowMaterial, {
            x: 0,
            y: transomCenterY,
            z: doorPlaneCoord - 0.018,
            width: openingHalfWidth * 2 - 0.38,
            height: Math.max(0.1, transomHeight - 0.22),
            depth: 0.012,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: -openingHalfWidth + stopThickness * 0.5,
            y: doorBaseY + doorHeight * 0.5,
            z: doorPlaneCoord - 0.01,
            width: stopThickness,
            height: doorHeight + 0.02,
            depth: frameDepth,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: openingHalfWidth - stopThickness * 0.5,
            y: doorBaseY + doorHeight * 0.5,
            z: doorPlaneCoord - 0.01,
            width: stopThickness,
            height: doorHeight + 0.02,
            depth: frameDepth,
        });
    } else {
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: sealCenterCoord,
            y: passageHeight * 0.5,
            z: -openingHalfWidth - sideSealWidth * 0.5,
            width: revealDepth,
            height: passageHeight - 0.02,
            depth: sideSealWidth,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: sealCenterCoord,
            y: passageHeight * 0.5,
            z: openingHalfWidth + sideSealWidth * 0.5,
            width: revealDepth,
            height: passageHeight - 0.02,
            depth: sideSealWidth,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: doorPlaneCoord,
            y: frameHeight * 0.5,
            z: -openingHalfWidth - jambThickness * 0.5,
            width: 0.18,
            height: frameHeight,
            depth: jambThickness,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: doorPlaneCoord,
            y: frameHeight * 0.5,
            z: openingHalfWidth + jambThickness * 0.5,
            width: 0.18,
            height: frameHeight,
            depth: jambThickness,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: doorPlaneCoord,
            y: doorHeight + 0.26,
            z: 0,
            width: 0.18,
            height: lintelThickness,
            depth: openingHalfWidth * 2 + 0.44,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: doorPlaneCoord,
            y: transomCenterY,
            z: 0,
            width: frameDepth,
            height: transomHeight,
            depth: openingHalfWidth * 2 + 0.04,
        });
        addDecorBox(group, baseGeometry, transomGlassMaterial, {
            x: doorPlaneCoord + 0.01,
            y: transomCenterY,
            z: 0,
            width: 0.03,
            height: Math.max(0.12, transomHeight - 0.12),
            depth: openingHalfWidth * 2 - 0.22,
        });
        addDecorBox(group, baseGeometry, glowMaterial, {
            x: doorPlaneCoord - 0.018,
            y: transomCenterY,
            z: 0,
            width: 0.012,
            height: Math.max(0.1, transomHeight - 0.22),
            depth: openingHalfWidth * 2 - 0.38,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: doorPlaneCoord - 0.01,
            y: doorBaseY + doorHeight * 0.5,
            z: -openingHalfWidth + stopThickness * 0.5,
            width: frameDepth,
            height: doorHeight + 0.02,
            depth: stopThickness,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: doorPlaneCoord - 0.01,
            y: doorBaseY + doorHeight * 0.5,
            z: openingHalfWidth - stopThickness * 0.5,
            width: frameDepth,
            height: doorHeight + 0.02,
            depth: stopThickness,
        });
    }

    addLorienLedRibbon(group, baseGeometry, {
        x: axis === 'z' ? 0 : doorPlaneCoord - portalSide * 0.08,
        y: doorHeight + 0.12,
        z: axis === 'z' ? doorPlaneCoord - portalSide * 0.08 : 0,
        width: axis === 'z' ? openingHalfWidth * 2 + 0.26 : 0.03,
        height: 0.03,
        depth: axis === 'z' ? 0.03 : openingHalfWidth * 2 + 0.26,
        axis: axis === 'z' ? 'x' : 'z',
        segmentCount: 9,
        segmentGap: 0.04,
        haloColor: portalSide < 0 ? 0x68f2ff : 0xff74e0,
        coreColor: 0xffffff,
        haloOpacity: 0.18,
        coreOpacity: 0.66,
        sweepSpeed: 0.00105,
        sweepPhase: portalSide < 0 ? 0.1 : 0.58,
        sweepBand: 0.2,
    });

    const leftDoorPanel = createLorienVelmoreDoorLeaf(baseGeometry, {
        width: doorPanelWidth,
        height: doorHeight,
        frameMaterial,
        glassMaterial,
        glowMaterial,
    });
    const rightDoorPanel = createLorienVelmoreDoorLeaf(baseGeometry, {
        width: doorPanelWidth,
        height: doorHeight,
        frameMaterial,
        glassMaterial,
        glowMaterial,
    });
    if (axis === 'z') {
        leftDoorPanel.position.set(-doorClosedOffset, doorBaseY, doorPlaneCoord);
        rightDoorPanel.position.set(doorClosedOffset, doorBaseY, doorPlaneCoord);
        addDecorBox(leftDoorPanel, baseGeometry, frameMaterial, {
            x: doorPanelWidth * 0.5 - 0.026,
            y: doorHeight * 0.5,
            z: -0.014,
            width: 0.052,
            height: doorHeight - 0.08,
            depth: 0.024,
        });
        addDecorBox(rightDoorPanel, baseGeometry, frameMaterial, {
            x: -doorPanelWidth * 0.5 + 0.026,
            y: doorHeight * 0.5,
            z: 0.014,
            width: 0.052,
            height: doorHeight - 0.08,
            depth: 0.024,
        });
    } else {
        leftDoorPanel.position.set(doorPlaneCoord, doorBaseY, -doorClosedOffset);
        rightDoorPanel.position.set(doorPlaneCoord, doorBaseY, doorClosedOffset);
        addDecorBox(leftDoorPanel, baseGeometry, frameMaterial, {
            x: -0.014,
            y: doorHeight * 0.5,
            z: doorPanelWidth * 0.5 - 0.026,
            width: 0.024,
            height: doorHeight - 0.08,
            depth: 0.052,
        });
        addDecorBox(rightDoorPanel, baseGeometry, frameMaterial, {
            x: 0.014,
            y: doorHeight * 0.5,
            z: -doorPanelWidth * 0.5 + 0.026,
            width: 0.024,
            height: doorHeight - 0.08,
            depth: 0.052,
        });
    }
    group.add(leftDoorPanel);
    group.add(rightDoorPanel);

    const leftDoorPanelState = leftDoorPanel.userData?.lorienDoorPanelState || null;
    const rightDoorPanelState = rightDoorPanel.userData?.lorienDoorPanelState || null;

    return {
        rootGroup: group,
        centerX: building.x,
        centerZ: building.z,
        roomEndCoord,
        doorPlaneCoord,
        roomEndZ: axis === 'z' ? roomEndCoord : 0,
        doorPlaneZ: axis === 'z' ? doorPlaneCoord : 0,
        doorBaseY,
        doorHeight,
        panelDepth: LORIEN_DOOR_PANEL_DEPTH,
        leftPanel: leftDoorPanel,
        rightPanel: rightDoorPanel,
        panels: [leftDoorPanelState, rightDoorPanelState].filter(Boolean),
        leftClosedCoord: -doorClosedOffset,
        rightClosedCoord: doorClosedOffset,
        leftClosedX: axis === 'z' ? -doorClosedOffset : doorPlaneCoord,
        rightClosedX: axis === 'z' ? doorClosedOffset : doorPlaneCoord,
        travelDistance: doorTravelDistance,
        openAmount: 0,
        targetOpen: 0,
        openSpeed: LORIEN_VELMORE_DOOR_OPEN_SPEED,
        closeSpeed: LORIEN_VELMORE_DOOR_CLOSE_SPEED,
        sensorHalfWidth: openingHalfWidth + 0.84,
        sensorMaxY: frameHeight + 0.72,
        outsideSensorDepth: 7.8,
        insideSensorDepth: 2.8,
        autoCloseDepth: 4.6,
        glowMaterial: leftDoorPanelState?.glowMaterial || null,
        scorchMarks: [],
        glassBroken: false,
        affectsLorienGallerySilence: false,
        environmentAudioZone: 'ufoDiskoStore',
        approachAxis: axis,
        insideDirection,
        panelSlideAxis: axis === 'z' ? 'x' : 'z',
    };
}

function addDecorBox(group, baseGeometry, material, { x, y, z, width, height, depth }) {
    const mesh = new THREE.Mesh(baseGeometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, depth);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    return mesh;
}

function registerLorienVelmoreAccentMaterial(group, material) {
    if (!group?.userData) {
        return material;
    }
    if (!Array.isArray(group.userData.lorienVelmoreAccentMaterials)) {
        group.userData.lorienVelmoreAccentMaterials = [];
    }
    group.userData.lorienVelmoreAccentMaterials.push(material);
    return material;
}

function createAnimatedLorienLedMaterial(
    group,
    {
        color = 0xfff0d6,
        opacity = 0.7,
        pulseAmplitude = 0.14,
        pulseSpeed = 0.0016,
        pulsePhase = 0,
        animationMode = 'pulse',
        ribbonPosition = 0,
        sweepSpeed = 0.00042,
        sweepPhase = 0,
        sweepBand = 0.2,
        sweepSharpness = 2.2,
        sweepMinOpacity = 0.12,
        sweepMaxOpacity = 1,
        flickerAmplitude = 0,
        flickerSpeed = 0.003,
        flickerPhase = 0,
        reverseSweep = false,
    }
) {
    const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        toneMapped: false,
    });
    material.userData.baseOpacity = opacity;
    material.userData.pulseAmplitude = pulseAmplitude;
    material.userData.pulseSpeed = pulseSpeed;
    material.userData.pulsePhase = pulsePhase;
    material.userData.animationMode = animationMode;
    material.userData.ribbonPosition = ribbonPosition;
    material.userData.sweepSpeed = sweepSpeed;
    material.userData.sweepPhase = sweepPhase;
    material.userData.sweepBand = sweepBand;
    material.userData.sweepSharpness = sweepSharpness;
    material.userData.sweepMinOpacity = sweepMinOpacity;
    material.userData.sweepMaxOpacity = sweepMaxOpacity;
    material.userData.flickerAmplitude = flickerAmplitude;
    material.userData.flickerSpeed = flickerSpeed;
    material.userData.flickerPhase = flickerPhase;
    material.userData.reverseSweep = reverseSweep;
    registerLorienVelmoreAccentMaterial(group, material);
    return material;
}

function addLorienLedRibbon(
    group,
    baseGeometry,
    {
        x,
        y,
        z,
        width,
        height,
        depth,
        axis = 'y',
        segmentCount = 8,
        segmentGap = 0.08,
        haloColor = 0xffe2b8,
        coreColor = 0xfff4e0,
        haloOpacity = 0.24,
        coreOpacity = 0.88,
        haloScale = 2.6,
        coreScale = 1,
        sweepSpeed = 0.00042,
        sweepPhase = 0,
        sweepBand = 0.16,
        reverseSweep = false,
    }
) {
    const safeSegmentCount = Math.max(1, Math.round(segmentCount));
    const totalLength = axis === 'x' ? width : axis === 'z' ? depth : height;
    const resolvedGap = Math.max(0, segmentGap);
    const segmentLength = Math.max(
        0.02,
        (totalLength - resolvedGap * Math.max(0, safeSegmentCount - 1)) / safeSegmentCount
    );

    for (let i = 0; i < safeSegmentCount; i += 1) {
        const ribbonPosition = safeSegmentCount <= 1 ? 0.5 : (i + 0.5) / safeSegmentCount;
        const offset = -totalLength * 0.5 + segmentLength * 0.5 + i * (segmentLength + resolvedGap);
        const segmentCenter = { x, y, z };
        if (axis === 'x') {
            segmentCenter.x += offset;
        } else if (axis === 'z') {
            segmentCenter.z += offset;
        } else {
            segmentCenter.y += offset;
        }

        const haloMaterial = createAnimatedLorienLedMaterial(group, {
            color: haloColor,
            opacity: haloOpacity,
            animationMode: 'ribbonSweep',
            ribbonPosition,
            sweepSpeed,
            sweepPhase,
            sweepBand: sweepBand * 1.85,
            sweepSharpness: 1.2,
            sweepMinOpacity: 0.18,
            sweepMaxOpacity: 1.08,
            flickerAmplitude: 0.08,
            flickerSpeed: 0.0026,
            flickerPhase: sweepPhase + ribbonPosition * Math.PI,
            reverseSweep,
        });
        const coreMaterial = createAnimatedLorienLedMaterial(group, {
            color: coreColor,
            opacity: coreOpacity,
            animationMode: 'ribbonSweep',
            ribbonPosition,
            sweepSpeed,
            sweepPhase,
            sweepBand,
            sweepSharpness: 2.8,
            sweepMinOpacity: 0.06,
            sweepMaxOpacity: 1.16,
            flickerAmplitude: 0.04,
            flickerSpeed: 0.0032,
            flickerPhase: sweepPhase + ribbonPosition * Math.PI * 1.6,
            reverseSweep,
        });

        const haloSize = { width, height, depth };
        const coreSize = { width, height, depth };
        if (axis === 'x') {
            haloSize.width = segmentLength;
            haloSize.height = height * haloScale;
            haloSize.depth = depth * haloScale;
            coreSize.width = segmentLength;
            coreSize.height = height * coreScale;
            coreSize.depth = depth * coreScale;
        } else if (axis === 'z') {
            haloSize.width = width * haloScale;
            haloSize.height = height * haloScale;
            haloSize.depth = segmentLength;
            coreSize.width = width * coreScale;
            coreSize.height = height * coreScale;
            coreSize.depth = segmentLength;
        } else {
            haloSize.width = width * haloScale;
            haloSize.height = segmentLength;
            haloSize.depth = depth * haloScale;
            coreSize.width = width * coreScale;
            coreSize.height = segmentLength;
            coreSize.depth = depth * coreScale;
        }

        addDecorBox(group, baseGeometry, haloMaterial, {
            x: segmentCenter.x,
            y: segmentCenter.y,
            z: segmentCenter.z,
            width: haloSize.width,
            height: haloSize.height,
            depth: haloSize.depth,
        });
        addDecorBox(group, baseGeometry, coreMaterial, {
            x: segmentCenter.x,
            y: segmentCenter.y,
            z: segmentCenter.z,
            width: coreSize.width,
            height: coreSize.height,
            depth: coreSize.depth,
        });
    }
}

function getUfoDiskoStoreSignTexture(storeName = 'UFO DISKO') {
    if (ufoDiskoStoreSignTexture) {
        return ufoDiskoStoreSignTexture;
    }

    ufoDiskoStoreSignTexture = ufoDiskoTextureLoader.load('/assets/Ufodisko/UD-logo-text.png');
    ufoDiskoStoreSignTexture.colorSpace = THREE.SRGBColorSpace;
    ufoDiskoStoreSignTexture.needsUpdate = true;

    return ufoDiskoStoreSignTexture;
}

function getUfoDiskoTeeTexture(variantIndex = 0) {
    const resolvedIndex = Math.abs(Math.round(variantIndex)) % 6;
    if (ufoDiskoTeeTextureCache.has(resolvedIndex)) {
        return ufoDiskoTeeTextureCache.get(resolvedIndex);
    }
    const merchSource = UFO_DISKO_MERCH_TEXTURE_SOURCES[resolvedIndex];
    const texture = createCanvasTexture(768, 1024, (ctx, canvas) => {
        drawUfoDiskoMerchCard(ctx, canvas, null);
    });
    texture.anisotropy = 4;

    if (merchSource?.url) {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
            drawUfoDiskoMerchCard(ctxFromTextureCanvas(texture), texture.image, image, merchSource);
            texture.needsUpdate = true;
        };
        image.src = merchSource.url;
    }

    ufoDiskoTeeTextureCache.set(resolvedIndex, texture);
    return texture;
}

function ctxFromTextureCanvas(texture) {
    return texture?.image?.getContext?.('2d') || null;
}

function drawUfoDiskoMerchCard(ctx, canvas, image = null, merchSource = null) {
    if (!ctx || !canvas) {
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRoundedRect(ctx, 42, 42, canvas.width - 84, canvas.height - 84, 48);
    const cardGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    cardGradient.addColorStop(0, '#070b12');
    cardGradient.addColorStop(0.48, '#101725');
    cardGradient.addColorStop(1, '#05070c');
    ctx.fillStyle = cardGradient;
    ctx.fill();

    ctx.strokeStyle = 'rgba(116, 239, 255, 0.18)';
    ctx.lineWidth = 8;
    ctx.stroke();

    const halo = ctx.createRadialGradient(
        canvas.width * 0.5,
        canvas.height * 0.4,
        10,
        canvas.width * 0.5,
        canvas.height * 0.4,
        canvas.width * 0.32
    );
    halo.addColorStop(0, 'rgba(127, 242, 255, 0.24)');
    halo.addColorStop(0.42, 'rgba(255, 98, 218, 0.09)');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!image) {
        return;
    }

    const merchCanvas = createProcessedUfoDiskoMerchCanvas(image, {
        removeWhiteBackground: merchSource?.removeWhiteBackground !== false,
    });
    const bounds = getCanvasOpaqueBounds(merchCanvas);
    const sourceX = bounds?.minX ?? 0;
    const sourceY = bounds?.minY ?? 0;
    const sourceWidth = bounds ? bounds.maxX - bounds.minX + 1 : merchCanvas.width;
    const sourceHeight = bounds ? bounds.maxY - bounds.minY + 1 : merchCanvas.height;
    const targetWidth = canvas.width - 164;
    const targetHeight = canvas.height - 168;
    const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const targetX = canvas.width * 0.5 - drawWidth * 0.5;
    const targetY = canvas.height * 0.5 - drawHeight * 0.5;

    ctx.save();
    ctx.shadowColor = 'rgba(110, 244, 255, 0.14)';
    ctx.shadowBlur = 20;
    ctx.drawImage(
        merchCanvas,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        targetX,
        targetY,
        drawWidth,
        drawHeight
    );
    ctx.restore();
}

function createProcessedUfoDiskoMerchCanvas(image, { removeWhiteBackground = true } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width || 1;
    canvas.height = image.naturalHeight || image.height || 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return canvas;
    }

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (removeWhiteBackground) {
        eraseConnectedLightBackground(ctx, canvas);
    }
    return canvas;
}

function eraseConnectedLightBackground(ctx, canvas) {
    const width = canvas.width;
    const height = canvas.height;
    if (width <= 0 || height <= 0) {
        return;
    }

    const imageData = ctx.getImageData(0, 0, width, height);
    const { data } = imageData;
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 0;

    const enqueue = (x, y) => {
        if (x < 0 || x >= width || y < 0 || y >= height) {
            return;
        }
        const index = y * width + x;
        if (visited[index]) {
            return;
        }
        const pixelOffset = index * 4;
        const r = data[pixelOffset];
        const g = data[pixelOffset + 1];
        const b = data[pixelOffset + 2];
        const a = data[pixelOffset + 3];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const isLightBackground =
            a < 24 || (max >= 236 && max - min <= 26) || (max >= 248 && max - min <= 48);
        if (!isLightBackground) {
            return;
        }
        visited[index] = 1;
        queue[tail] = index;
        tail += 1;
    };

    for (let x = 0; x < width; x += 1) {
        enqueue(x, 0);
        enqueue(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
        enqueue(0, y);
        enqueue(width - 1, y);
    }

    while (head < tail) {
        const index = queue[head];
        head += 1;
        const pixelOffset = index * 4;
        data[pixelOffset + 3] = 0;

        const x = index % width;
        const y = (index - x) / width;
        enqueue(x - 1, y);
        enqueue(x + 1, y);
        enqueue(x, y - 1);
        enqueue(x, y + 1);
    }

    ctx.putImageData(imageData, 0, 0);
}

function getCanvasOpaqueBounds(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return null;
    }
    const { width, height } = canvas;
    const { data } = ctx.getImageData(0, 0, width, height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha <= 14) {
                continue;
            }
            if (x < minX) {
                minX = x;
            }
            if (y < minY) {
                minY = y;
            }
            if (x > maxX) {
                maxX = x;
            }
            if (y > maxY) {
                maxY = y;
            }
        }
    }

    if (maxX < minX || maxY < minY) {
        return null;
    }
    return { minX, minY, maxX, maxY };
}

function createCanvasTexture(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        draw(ctx, canvas);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    const resolvedRadius = Math.min(radius, width * 0.5, height * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + resolvedRadius, y);
    ctx.lineTo(x + width - resolvedRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + resolvedRadius);
    ctx.lineTo(x + width, y + height - resolvedRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - resolvedRadius, y + height);
    ctx.lineTo(x + resolvedRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - resolvedRadius);
    ctx.lineTo(x, y + resolvedRadius);
    ctx.quadraticCurveTo(x, y, x + resolvedRadius, y);
    ctx.closePath();
}

function drawUfoDiskoSaucer(
    ctx,
    {
        scale = 1,
        hullColor = '#c8f8ff',
        domeColor = '#ff8ee7',
        beamColor = 'rgba(121, 244, 255, 0.26)',
    } = {}
) {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.fillStyle = beamColor;
    ctx.beginPath();
    ctx.moveTo(-70, 28);
    ctx.lineTo(70, 28);
    ctx.lineTo(24, 148);
    ctx.lineTo(-24, 148);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = hullColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 120, 36, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = domeColor;
    ctx.beginPath();
    ctx.ellipse(0, -22, 52, 34, 0, Math.PI, 0, true);
    ctx.fill();

    ctx.fillStyle = '#102030';
    for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.arc(i * 38, 2, 8, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function clamp01(value) {
    return THREE.MathUtils.clamp(value, 0, 1);
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

function lerp(start, end, t) {
    return start + (end - start) * t;
}

function positiveModulo(value, modulo) {
    if (!Number.isFinite(modulo) || modulo === 0) {
        return 0;
    }
    const remainder = value % modulo;
    return remainder < 0 ? remainder + modulo : remainder;
}

function createLorienTowerGlassMaterial(texture) {
    return new THREE.MeshStandardMaterial({
        color: 0xa8b1b8,
        map: texture,
        emissive: 0x4e5962,
        emissiveMap: texture,
        emissiveIntensity: 0.18,
        roughness: 0.14,
        metalness: 0.76,
        transparent: true,
        opacity: 0.88,
    });
}

function addLorienLuxuryWindow(
    group,
    baseGeometry,
    {
        axis,
        faceCoordinate,
        along,
        y,
        width,
        height,
        frameMaterial,
        glassMaterial,
        revealMaterial,
        trimMaterial,
        glowMaterial,
        paneCount = 2,
    }
) {
    const direction = Math.sign(faceCoordinate) || 1;
    const revealDepth = 0.46;
    const frameDepth = 0.16;
    const glassDepth = 0.06;
    const frameThickness = THREE.MathUtils.clamp(width * 0.05, 0.12, 0.24);
    const railThickness = THREE.MathUtils.clamp(height * 0.075, 0.14, 0.26);
    const glassWidth = Math.max(0.32, width - frameThickness * 2 - 0.12);
    const glassHeight = Math.max(0.32, height - railThickness * 2 - 0.12);
    const mullionThickness = Math.max(0.08, frameThickness * 0.72);
    const resolvedPaneCount = Math.max(1, Math.round(paneCount));

    if (axis === 'z') {
        addDecorBox(group, baseGeometry, revealMaterial, {
            x: along,
            y,
            z: faceCoordinate - direction * (revealDepth * 0.5 + 0.04),
            width: width + 0.88,
            height: height + 0.76,
            depth: revealDepth,
        });
        addDecorBox(group, baseGeometry, trimMaterial, {
            x: along,
            y: y + height * 0.5 + 0.22,
            z: faceCoordinate + direction * 0.02,
            width: width + 0.46,
            height: 0.08,
            depth: 0.12,
        });
        addDecorBox(group, baseGeometry, trimMaterial, {
            x: along,
            y: y - height * 0.5 - 0.22,
            z: faceCoordinate + direction * 0.02,
            width: width + 0.36,
            height: 0.07,
            depth: 0.1,
        });

        addDecorBox(group, baseGeometry, frameMaterial, {
            x: along - width * 0.5 + frameThickness * 0.5,
            y,
            z: faceCoordinate + direction * 0.03,
            width: frameThickness,
            height: height,
            depth: frameDepth,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: along + width * 0.5 - frameThickness * 0.5,
            y,
            z: faceCoordinate + direction * 0.03,
            width: frameThickness,
            height: height,
            depth: frameDepth,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: along,
            y: y + height * 0.5 - railThickness * 0.5,
            z: faceCoordinate + direction * 0.03,
            width: width,
            height: railThickness,
            depth: frameDepth,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: along,
            y: y - height * 0.5 + railThickness * 0.5,
            z: faceCoordinate + direction * 0.03,
            width: width,
            height: railThickness,
            depth: frameDepth,
        });

        for (let i = 1; i < resolvedPaneCount; i += 1) {
            const mullionX = along - glassWidth * 0.5 + (glassWidth * i) / resolvedPaneCount;
            addDecorBox(group, baseGeometry, frameMaterial, {
                x: mullionX,
                y,
                z: faceCoordinate + direction * 0.034,
                width: mullionThickness,
                height: glassHeight + 0.08,
                depth: 0.08,
            });
        }

        addDecorBox(group, baseGeometry, glassMaterial, {
            x: along,
            y,
            z: faceCoordinate + direction * 0.07,
            width: glassWidth,
            height: glassHeight,
            depth: glassDepth,
        });
        addDecorBox(group, baseGeometry, glowMaterial, {
            x: along,
            y,
            z: faceCoordinate + direction * 0.1,
            width: Math.max(0.24, glassWidth - 0.26),
            height: Math.max(0.24, glassHeight - 0.24),
            depth: 0.02,
        });
    } else {
        addDecorBox(group, baseGeometry, revealMaterial, {
            x: faceCoordinate - direction * (revealDepth * 0.5 + 0.04),
            y,
            z: along,
            width: revealDepth,
            height: height + 0.76,
            depth: width + 0.88,
        });
        addDecorBox(group, baseGeometry, trimMaterial, {
            x: faceCoordinate + direction * 0.02,
            y: y + height * 0.5 + 0.22,
            z: along,
            width: 0.12,
            height: 0.08,
            depth: width + 0.46,
        });
        addDecorBox(group, baseGeometry, trimMaterial, {
            x: faceCoordinate + direction * 0.02,
            y: y - height * 0.5 - 0.22,
            z: along,
            width: 0.1,
            height: 0.07,
            depth: width + 0.36,
        });

        addDecorBox(group, baseGeometry, frameMaterial, {
            x: faceCoordinate + direction * 0.03,
            y,
            z: along - width * 0.5 + frameThickness * 0.5,
            width: frameDepth,
            height: height,
            depth: frameThickness,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: faceCoordinate + direction * 0.03,
            y,
            z: along + width * 0.5 - frameThickness * 0.5,
            width: frameDepth,
            height: height,
            depth: frameThickness,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: faceCoordinate + direction * 0.03,
            y: y + height * 0.5 - railThickness * 0.5,
            z: along,
            width: frameDepth,
            height: railThickness,
            depth: width,
        });
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: faceCoordinate + direction * 0.03,
            y: y - height * 0.5 + railThickness * 0.5,
            z: along,
            width: frameDepth,
            height: railThickness,
            depth: width,
        });

        for (let i = 1; i < resolvedPaneCount; i += 1) {
            const mullionZ = along - glassWidth * 0.5 + (glassWidth * i) / resolvedPaneCount;
            addDecorBox(group, baseGeometry, frameMaterial, {
                x: faceCoordinate + direction * 0.034,
                y,
                z: mullionZ,
                width: 0.08,
                height: glassHeight + 0.08,
                depth: mullionThickness,
            });
        }

        addDecorBox(group, baseGeometry, glassMaterial, {
            x: faceCoordinate + direction * 0.07,
            y,
            z: along,
            width: glassDepth,
            height: glassHeight,
            depth: glassWidth,
        });
        addDecorBox(group, baseGeometry, glowMaterial, {
            x: faceCoordinate + direction * 0.1,
            y,
            z: along,
            width: 0.02,
            height: Math.max(0.24, glassHeight - 0.24),
            depth: Math.max(0.24, glassWidth - 0.26),
        });
    }
}

function addLorienVelmoreTowerFacade(
    group,
    baseGeometry,
    { building, towerBaseY, towerHeight, trimMaterial, lightMaterial }
) {
    const layout = getLorienVelmoreGalleryLayout(building);
    const facadeInset = 0.44;
    const facadeThickness = 0.18;
    const towerTopY = towerBaseY + towerHeight;
    const podiumBandHeight = Math.min(1.18, Math.max(0.9, towerHeight * 0.07));
    const crownAllowance = 0.92;
    const facadeHeight = Math.max(6.6, towerHeight - podiumBandHeight - crownAllowance);
    const facadeCenterY = towerBaseY + podiumBandHeight + facadeHeight * 0.5;
    const frontFacadeWidth = Math.max(5.4, building.width - facadeInset * 2);
    const sideFacadeWidth = Math.max(5.4, building.depth - facadeInset * 2);
    const marbleFrontTexture = createLuxuryMarbleTexture();
    marbleFrontTexture.repeat.set(
        Math.max(1, Math.round(frontFacadeWidth / 6.8)),
        Math.max(1, Math.round(facadeHeight / 9.5))
    );
    const marbleSideTexture = createLuxuryMarbleTexture();
    marbleSideTexture.repeat.set(
        Math.max(1, Math.round(sideFacadeWidth / 6.4)),
        Math.max(1, Math.round(facadeHeight / 9.5))
    );
    const frontMarbleMaterial = new THREE.MeshStandardMaterial({
        color: 0xf4e9d8,
        map: marbleFrontTexture,
        emissive: 0x2b2118,
        emissiveIntensity: 0.05,
        roughness: 0.18,
        metalness: 0.08,
    });
    const sideMarbleMaterial = new THREE.MeshStandardMaterial({
        color: 0xf1e4d1,
        map: marbleSideTexture,
        emissive: 0x291f18,
        emissiveIntensity: 0.05,
        roughness: 0.2,
        metalness: 0.08,
    });
    const bronzeMaterial = trimMaterial.clone();
    bronzeMaterial.color.setHex(0xcfb08a);
    bronzeMaterial.emissive.setHex(0x493522);
    bronzeMaterial.emissiveIntensity = 0.11;
    bronzeMaterial.roughness = 0.16;
    bronzeMaterial.metalness = 0.86;
    const stoneRibMaterial = new THREE.MeshStandardMaterial({
        color: 0xe9dac4,
        emissive: 0x261d15,
        emissiveIntensity: 0.04,
        roughness: 0.16,
        metalness: 0.12,
    });
    const windowRevealMaterial = new THREE.MeshStandardMaterial({
        color: 0x182231,
        emissive: 0x0e141d,
        emissiveIntensity: 0.08,
        roughness: 0.26,
        metalness: 0.18,
    });
    const luxuryGlassTexture = createLuxuryGlassWindowTexture();
    const windowGlassMaterial = createLorienTowerGlassMaterial(luxuryGlassTexture);
    const windowGlowMaterial = new THREE.MeshBasicMaterial({
        color: 0xfff1d8,
        transparent: true,
        opacity: 0.28,
        toneMapped: false,
    });
    const soffitMaterial = new THREE.MeshStandardMaterial({
        color: 0xf4f0e8,
        emissive: 0x25201a,
        emissiveIntensity: 0.04,
        roughness: 0.3,
        metalness: 0.03,
    });
    const soffitInsetMaterial = new THREE.MeshStandardMaterial({
        color: 0xe6dfd2,
        emissive: 0x201a15,
        emissiveIntensity: 0.03,
        roughness: 0.38,
        metalness: 0.02,
    });
    const supportMaterial = new THREE.MeshStandardMaterial({
        color: 0xf1ece4,
        emissive: 0x241d17,
        emissiveIntensity: 0.04,
        roughness: 0.34,
        metalness: 0.04,
    });
    const supportAccentMaterial = trimMaterial.clone();
    supportAccentMaterial.color.setHex(0xcbb089);
    supportAccentMaterial.emissive.setHex(0x453221);
    supportAccentMaterial.emissiveIntensity = 0.1;
    supportAccentMaterial.roughness = 0.22;
    supportAccentMaterial.metalness = 0.8;
    const shadowJointMaterial = new THREE.MeshStandardMaterial({
        color: 0x121922,
        emissive: 0x090d12,
        emissiveIntensity: 0.08,
        roughness: 0.42,
        metalness: 0.16,
    });
    const lanternFrameMaterial = bronzeMaterial.clone();
    lanternFrameMaterial.color.setHex(0xd8bd96);
    lanternFrameMaterial.emissive.setHex(0x4d3924);
    lanternFrameMaterial.emissiveIntensity = 0.14;
    lanternFrameMaterial.roughness = 0.14;
    lanternFrameMaterial.metalness = 0.9;
    const lanternGlowMaterial = new THREE.MeshBasicMaterial({
        color: 0xfff0d8,
        transparent: true,
        opacity: 0.18,
        toneMapped: false,
    });
    [
        {
            x: 0,
            y: towerBaseY + podiumBandHeight * 0.5,
            z: -building.depth * 0.5 - 0.06,
            width: building.width + 0.16,
            height: podiumBandHeight,
            depth: 0.2,
            material: frontMarbleMaterial,
        },
        {
            x: 0,
            y: towerBaseY + podiumBandHeight * 0.5,
            z: building.depth * 0.5 + 0.06,
            width: building.width + 0.16,
            height: podiumBandHeight,
            depth: 0.2,
            material: frontMarbleMaterial,
        },
        {
            x: -building.width * 0.5 - 0.06,
            y: towerBaseY + podiumBandHeight * 0.5,
            z: 0,
            width: 0.2,
            height: podiumBandHeight,
            depth: building.depth + 0.16,
            material: sideMarbleMaterial,
        },
        {
            x: building.width * 0.5 + 0.06,
            y: towerBaseY + podiumBandHeight * 0.5,
            z: 0,
            width: 0.2,
            height: podiumBandHeight,
            depth: building.depth + 0.16,
            material: sideMarbleMaterial,
        },
    ].forEach((band) => {
        addDecorBox(group, baseGeometry, band.material, band);
    });

    [
        {
            x: 0,
            z: -building.depth * 0.5 - facadeThickness * 0.5 - 0.02,
            width: frontFacadeWidth,
            depth: facadeThickness,
            material: frontMarbleMaterial,
        },
        {
            x: 0,
            z: building.depth * 0.5 + facadeThickness * 0.5 + 0.02,
            width: frontFacadeWidth,
            depth: facadeThickness,
            material: frontMarbleMaterial,
        },
        {
            x: -building.width * 0.5 - facadeThickness * 0.5 - 0.02,
            z: 0,
            width: facadeThickness,
            depth: sideFacadeWidth,
            material: sideMarbleMaterial,
        },
        {
            x: building.width * 0.5 + facadeThickness * 0.5 + 0.02,
            z: 0,
            width: facadeThickness,
            depth: sideFacadeWidth,
            material: sideMarbleMaterial,
        },
    ].forEach((face) => {
        addDecorBox(group, baseGeometry, face.material, {
            x: face.x,
            y: facadeCenterY,
            z: face.z,
            width: face.width,
            height: facadeHeight,
            depth: face.depth,
        });
    });

    addDecorBox(group, baseGeometry, bronzeMaterial, {
        x: 0,
        y: towerBaseY + podiumBandHeight + 0.08,
        z: -building.depth * 0.5 - 0.06,
        width: building.width - 0.56,
        height: 0.08,
        depth: 0.12,
    });
    addDecorBox(group, baseGeometry, bronzeMaterial, {
        x: 0,
        y: towerBaseY + podiumBandHeight + 0.08,
        z: building.depth * 0.5 + 0.06,
        width: building.width - 0.56,
        height: 0.08,
        depth: 0.12,
    });
    addDecorBox(group, baseGeometry, bronzeMaterial, {
        x: -building.width * 0.5 - 0.06,
        y: towerBaseY + podiumBandHeight + 0.08,
        z: 0,
        width: 0.12,
        height: 0.08,
        depth: building.depth - 0.56,
    });
    addDecorBox(group, baseGeometry, bronzeMaterial, {
        x: building.width * 0.5 + 0.06,
        y: towerBaseY + podiumBandHeight + 0.08,
        z: 0,
        width: 0.12,
        height: 0.08,
        depth: building.depth - 0.56,
    });

    const frontLanternWidth = THREE.MathUtils.clamp(frontFacadeWidth * 0.22, 2.35, 3.15);
    const frontLanternHeight = THREE.MathUtils.clamp(facadeHeight * 0.58, 10.6, 15.4);
    const frontLanternY = towerBaseY + podiumBandHeight + frontLanternHeight * 0.5 + 1.48;
    const frontRecessWidth = frontLanternWidth + 1.72;
    const frontRecessHeight = frontLanternHeight + 3.18;
    const frontFinOffset = THREE.MathUtils.clamp(frontFacadeWidth * 0.25, 2.8, 3.85);
    const frontBandY = towerBaseY + podiumBandHeight + 2.08;
    const frontOuterLedOffset = frontFacadeWidth * 0.5 - 0.74;
    const frontInnerLedOffset = frontLanternWidth * 0.5 + 0.92;
    const frontOuterLedHeight = facadeHeight - 1.94;
    const frontInnerLedHeight = frontLanternHeight + 2.24;
    [-1, 1].forEach((direction) => {
        const faceCoordinate = direction * (building.depth * 0.5 + facadeThickness * 0.5 + 0.03);
        addDecorBox(group, baseGeometry, shadowJointMaterial, {
            x: 0,
            y: frontLanternY,
            z: faceCoordinate - direction * 0.12,
            width: frontRecessWidth,
            height: frontRecessHeight,
            depth: 0.3,
        });
        addDecorBox(group, baseGeometry, stoneRibMaterial, {
            x: 0,
            y: frontLanternY,
            z: faceCoordinate - direction * 0.045,
            width: frontLanternWidth + 0.86,
            height: frontLanternHeight + 1.26,
            depth: 0.08,
        });
        addDecorBox(group, baseGeometry, lanternFrameMaterial, {
            x: 0,
            y: frontLanternY + frontLanternHeight * 0.5 + 0.28,
            z: faceCoordinate + direction * 0.036,
            width: frontLanternWidth + 0.62,
            height: 0.08,
            depth: 0.08,
        });
        addDecorBox(group, baseGeometry, lanternFrameMaterial, {
            x: 0,
            y: frontLanternY - frontLanternHeight * 0.5 - 0.28,
            z: faceCoordinate + direction * 0.036,
            width: frontLanternWidth + 0.62,
            height: 0.08,
            depth: 0.08,
        });
        addDecorBox(group, baseGeometry, lanternFrameMaterial, {
            x: -frontLanternWidth * 0.5 - 0.16,
            y: frontLanternY,
            z: faceCoordinate + direction * 0.036,
            width: 0.1,
            height: frontLanternHeight + 0.72,
            depth: 0.08,
        });
        addDecorBox(group, baseGeometry, lanternFrameMaterial, {
            x: frontLanternWidth * 0.5 + 0.16,
            y: frontLanternY,
            z: faceCoordinate + direction * 0.036,
            width: 0.1,
            height: frontLanternHeight + 0.72,
            depth: 0.08,
        });
        addDecorBox(group, baseGeometry, windowRevealMaterial, {
            x: 0,
            y: frontLanternY,
            z: faceCoordinate - direction * 0.02,
            width: frontLanternWidth + 0.22,
            height: frontLanternHeight + 0.36,
            depth: 0.12,
        });
        addDecorBox(group, baseGeometry, windowGlassMaterial, {
            x: 0,
            y: frontLanternY,
            z: faceCoordinate + direction * 0.055,
            width: frontLanternWidth,
            height: frontLanternHeight,
            depth: 0.045,
        });
        addDecorBox(group, baseGeometry, lanternGlowMaterial, {
            x: 0,
            y: frontLanternY,
            z: faceCoordinate + direction * 0.082,
            width: frontLanternWidth - 0.34,
            height: frontLanternHeight - 0.42,
            depth: 0.018,
        });
        addDecorBox(group, baseGeometry, lanternFrameMaterial, {
            x: 0,
            y: frontBandY,
            z: faceCoordinate + direction * 0.03,
            width: frontFacadeWidth - 2.24,
            height: 0.05,
            depth: 0.06,
        });
        [frontOuterLedOffset, frontInnerLedOffset].forEach((ledOffset, index) => {
            const ledHeight = index === 0 ? frontOuterLedHeight : frontInnerLedHeight;
            const ledY = index === 0 ? facadeCenterY : frontLanternY;
            [-1, 1].forEach((xDirection) => {
                const ledX = xDirection * ledOffset;
                addLorienLedRibbon(group, baseGeometry, {
                    x: ledX,
                    y: ledY,
                    z: faceCoordinate + direction * 0.11,
                    width: index === 0 ? 0.12 : 0.1,
                    height: ledHeight,
                    depth: 0.028,
                    axis: 'y',
                    segmentCount: Math.max(8, Math.round(ledHeight / 1.34)),
                    segmentGap: 0.08,
                    haloColor: 0xffd8ac,
                    coreColor: 0xfff3df,
                    haloOpacity: 0.26,
                    coreOpacity: 0.96,
                    haloScale: 2.9,
                    coreScale: 1,
                    sweepSpeed: index === 0 ? 0.00034 : 0.00052,
                    sweepPhase: direction * 0.12 + xDirection * 0.18 + index * 0.11,
                    sweepBand: index === 0 ? 0.18 : 0.14,
                    reverseSweep: xDirection < 0,
                });
            });
        });
        addLorienLedRibbon(group, baseGeometry, {
            x: 0,
            y: frontBandY + 0.14,
            z: faceCoordinate + direction * 0.095,
            width: frontLanternWidth + 1.64,
            height: 0.038,
            depth: 0.02,
            axis: 'x',
            segmentCount: 9,
            segmentGap: 0.08,
            haloColor: 0xffd5a6,
            coreColor: 0xfff0d7,
            haloOpacity: 0.2,
            coreOpacity: 0.68,
            haloScale: 1.85,
            coreScale: 1,
            sweepSpeed: 0.0007,
            sweepPhase: direction > 0 ? 0.32 : 0.82,
            sweepBand: 0.2,
            reverseSweep: direction < 0,
        });
        [-frontFinOffset, frontFinOffset].forEach((ribX) => {
            addDecorBox(group, baseGeometry, stoneRibMaterial, {
                x: ribX,
                y: facadeCenterY,
                z: faceCoordinate,
                width: 0.2,
                height: facadeHeight - 1.18,
                depth: 0.12,
            });
        });
    });

    const sideLanternWidth = THREE.MathUtils.clamp(sideFacadeWidth * 0.14, 1.18, 1.58);
    const sideLanternHeight = THREE.MathUtils.clamp(facadeHeight * 0.44, 8.2, 11.6);
    const sideLanternY = towerBaseY + podiumBandHeight + sideLanternHeight * 0.5 + 2.28;
    const sideFinOffset = THREE.MathUtils.clamp(sideFacadeWidth * 0.27, 3.1, 4.95);
    const sideOuterLedOffset = sideFacadeWidth * 0.5 - 0.68;
    [-1, 1].forEach((direction) => {
        const faceCoordinate = direction * (building.width * 0.5 + facadeThickness * 0.5 + 0.03);
        addDecorBox(group, baseGeometry, shadowJointMaterial, {
            x: faceCoordinate - direction * 0.12,
            y: sideLanternY,
            z: 0,
            width: 0.3,
            height: sideLanternHeight + 2.46,
            depth: sideLanternWidth + 0.76,
        });
        addDecorBox(group, baseGeometry, lanternFrameMaterial, {
            x: faceCoordinate + direction * 0.034,
            y: sideLanternY + sideLanternHeight * 0.5 + 0.24,
            z: 0,
            width: 0.08,
            height: 0.08,
            depth: sideLanternWidth + 0.56,
        });
        addDecorBox(group, baseGeometry, lanternFrameMaterial, {
            x: faceCoordinate + direction * 0.034,
            y: sideLanternY - sideLanternHeight * 0.5 - 0.24,
            z: 0,
            width: 0.08,
            height: 0.08,
            depth: sideLanternWidth + 0.56,
        });
        addDecorBox(group, baseGeometry, lanternFrameMaterial, {
            x: faceCoordinate + direction * 0.034,
            y: sideLanternY,
            z: -sideLanternWidth * 0.5 - 0.14,
            width: 0.08,
            height: sideLanternHeight + 0.62,
            depth: 0.08,
        });
        addDecorBox(group, baseGeometry, lanternFrameMaterial, {
            x: faceCoordinate + direction * 0.034,
            y: sideLanternY,
            z: sideLanternWidth * 0.5 + 0.14,
            width: 0.08,
            height: sideLanternHeight + 0.62,
            depth: 0.08,
        });
        addDecorBox(group, baseGeometry, windowRevealMaterial, {
            x: faceCoordinate - direction * 0.02,
            y: sideLanternY,
            z: 0,
            width: 0.12,
            height: sideLanternHeight + 0.32,
            depth: sideLanternWidth + 0.18,
        });
        addDecorBox(group, baseGeometry, windowGlassMaterial, {
            x: faceCoordinate + direction * 0.056,
            y: sideLanternY,
            z: 0,
            width: 0.045,
            height: sideLanternHeight,
            depth: sideLanternWidth,
        });
        addDecorBox(group, baseGeometry, lanternGlowMaterial, {
            x: faceCoordinate + direction * 0.082,
            y: sideLanternY,
            z: 0,
            width: 0.018,
            height: sideLanternHeight - 0.38,
            depth: sideLanternWidth - 0.22,
        });
        [-sideOuterLedOffset, sideOuterLedOffset].forEach((ledZ) => {
            addLorienLedRibbon(group, baseGeometry, {
                x: faceCoordinate + direction * 0.11,
                y: facadeCenterY,
                z: ledZ,
                width: 0.026,
                height: facadeHeight - 2.22,
                depth: 0.11,
                axis: 'y',
                segmentCount: Math.max(7, Math.round((facadeHeight - 2.22) / 1.5)),
                segmentGap: 0.08,
                haloColor: 0xffd5a6,
                coreColor: 0xfff2de,
                haloOpacity: 0.24,
                coreOpacity: 0.88,
                haloScale: 2.9,
                coreScale: 1,
                sweepSpeed: 0.00046,
                sweepPhase: direction * 0.22 + ledZ * 0.03,
                sweepBand: 0.16,
                reverseSweep: ledZ < 0,
            });
        });
        [-sideFinOffset, sideFinOffset].forEach((zOffset) => {
            addDecorBox(group, baseGeometry, stoneRibMaterial, {
                x: faceCoordinate,
                y: facadeCenterY,
                z: zOffset,
                width: 0.12,
                height: facadeHeight - 1.52,
                depth: 0.22,
            });
        });
    });

    const soffitCenterY = towerBaseY - 0.14;
    addDecorBox(group, baseGeometry, soffitMaterial, {
        x: 0,
        y: soffitCenterY,
        z: 0,
        width: building.width + 0.22,
        height: 0.14,
        depth: building.depth + 0.22,
    });
    addDecorBox(group, baseGeometry, soffitInsetMaterial, {
        x: 0,
        y: soffitCenterY + 0.035,
        z: 0,
        width: building.width - 0.84,
        height: 0.05,
        depth: building.depth - 0.84,
    });
    [
        { x: -building.width * 0.28, width: 0.14, depth: building.depth - 1.12 },
        { x: 0, width: 0.22, depth: building.depth - 1.2 },
        { x: building.width * 0.28, width: 0.14, depth: building.depth - 1.12 },
    ].forEach((lightStrip) => {
        addDecorBox(group, baseGeometry, lightMaterial, {
            x: lightStrip.x,
            y: soffitCenterY - 0.055,
            z: 0,
            width: lightStrip.width,
            height: 0.02,
            depth: lightStrip.depth,
        });
    });
    addDecorBox(group, baseGeometry, lightMaterial, {
        x: 0,
        y: soffitCenterY - 0.052,
        z: -building.depth * 0.5 + 0.56,
        width: building.width - 1.48,
        height: 0.018,
        depth: 0.08,
    });

    addDecorBox(group, baseGeometry, bronzeMaterial, {
        x: 0,
        y: towerBaseY + 0.26,
        z: 0,
        width: building.width + 0.12,
        height: 0.16,
        depth: building.depth + 0.12,
    });
    addDecorBox(group, baseGeometry, bronzeMaterial, {
        x: 0,
        y: towerTopY - 0.22,
        z: 0,
        width: building.width + 0.28,
        height: 0.22,
        depth: building.depth + 0.28,
    });
    addDecorBox(group, baseGeometry, lightMaterial, {
        x: 0,
        y: towerTopY - 0.08,
        z: 0,
        width: building.width - 0.92,
        height: 0.024,
        depth: building.depth - 0.92,
    });

    if (layout) {
        const supportHeight = towerBaseY - 0.22;
        const supportCenterY = supportHeight * 0.5;
        const supportHalfX = Math.min(building.width * 0.5 - 0.72, layout.hallHalfWidth + 0.26);
        const supportZPositions = [layout.hallStartZ + 1.2, layout.hallEndZ - 1.2];
        supportZPositions.forEach((supportZ) => {
            [-1, 1].forEach((direction) => {
                const x = direction * supportHalfX;
                addDecorBox(group, baseGeometry, supportMaterial, {
                    x,
                    y: supportCenterY,
                    z: supportZ,
                    width: 0.28,
                    height: supportHeight,
                    depth: 0.28,
                });
                addDecorBox(group, baseGeometry, supportAccentMaterial, {
                    x,
                    y: 0.14,
                    z: supportZ,
                    width: 0.4,
                    height: 0.08,
                    depth: 0.4,
                });
                addDecorBox(group, baseGeometry, supportAccentMaterial, {
                    x,
                    y: towerBaseY - 0.26,
                    z: supportZ,
                    width: 0.4,
                    height: 0.08,
                    depth: 0.4,
                });
                addDecorBox(group, baseGeometry, lightMaterial, {
                    x,
                    y: supportCenterY,
                    z: supportZ,
                    width: 0.024,
                    height: Math.max(2.2, supportHeight - 1.04),
                    depth: 0.12,
                });
            });
        });
    }

    const verticalFinHeight = facadeHeight + 0.36;
    [
        { x: -building.width * 0.5 - 0.03, z: -building.depth * 0.5 - 0.03 },
        { x: building.width * 0.5 + 0.03, z: -building.depth * 0.5 - 0.03 },
        { x: -building.width * 0.5 - 0.03, z: building.depth * 0.5 + 0.03 },
        { x: building.width * 0.5 + 0.03, z: building.depth * 0.5 + 0.03 },
    ].forEach((corner) => {
        addDecorBox(group, baseGeometry, bronzeMaterial, {
            x: corner.x,
            y: facadeCenterY,
            z: corner.z,
            width: 0.16,
            height: verticalFinHeight,
            depth: 0.16,
        });
    });
}

function createLorienVelmoreDoorLeaf(
    baseGeometry,
    { width, height, frameMaterial, glassMaterial, glowMaterial }
) {
    const leaf = new THREE.Group();
    const stileWidth = 0.08;
    const railHeight = 0.08;
    const leafGlassMaterial = glassMaterial.clone();
    const leafGlowMaterial = glowMaterial.clone();

    addDecorBox(leaf, baseGeometry, frameMaterial, {
        x: -width * 0.5 + stileWidth * 0.5,
        y: height * 0.5,
        z: 0,
        width: stileWidth,
        height,
        depth: LORIEN_DOOR_PANEL_DEPTH,
    });
    addDecorBox(leaf, baseGeometry, frameMaterial, {
        x: width * 0.5 - stileWidth * 0.5,
        y: height * 0.5,
        z: 0,
        width: stileWidth,
        height,
        depth: LORIEN_DOOR_PANEL_DEPTH,
    });
    addDecorBox(leaf, baseGeometry, frameMaterial, {
        x: 0,
        y: height - railHeight * 0.5,
        z: 0,
        width: width,
        height: railHeight,
        depth: LORIEN_DOOR_PANEL_DEPTH,
    });
    addDecorBox(leaf, baseGeometry, frameMaterial, {
        x: 0,
        y: railHeight * 0.5,
        z: 0,
        width: width,
        height: railHeight,
        depth: LORIEN_DOOR_PANEL_DEPTH,
    });
    const glassMesh = addDecorBox(leaf, baseGeometry, leafGlassMaterial, {
        x: 0,
        y: height * 0.5,
        z: 0,
        width: width - 0.16,
        height: height - 0.22,
        depth: 0.02,
    });
    const glowMesh = addDecorBox(leaf, baseGeometry, leafGlowMaterial, {
        x: 0,
        y: height * 0.5,
        z: -0.01,
        width: width - 0.3,
        height: height - 0.36,
        depth: 0.01,
    });

    leaf.userData.lorienDoorPanelState = {
        group: leaf,
        width,
        height,
        glassWidth: width - 0.16,
        glassHeight: height - 0.22,
        glassMesh,
        glassMaterial: leafGlassMaterial,
        glowMesh,
        glowMaterial: leafGlowMaterial,
        crackMarks: [],
        broken: false,
        scorchMarks: [],
    };
    syncLorienVelmoreDoorPanelVisualState(leaf.userData.lorienDoorPanelState, 0);

    return leaf;
}

function getLorienVelmoreGalleryLayout(building) {
    return resolveLorienVelmoreGalleryLayout(building);
}

function getLorienVelmoreGalleryColumnPositions(layout) {
    if (!layout) {
        return [];
    }

    const columnInsetX = Math.min(1.05, layout.hallHalfWidth - 0.94);
    const frontHallZ = layout.hallStartZ + 1.8;
    const rearHallZ = layout.hallEndZ - 1.5;
    return [
        { x: -layout.hallHalfWidth + columnInsetX, z: frontHallZ },
        { x: layout.hallHalfWidth - columnInsetX, z: frontHallZ },
        { x: -layout.hallHalfWidth + columnInsetX, z: rearHallZ },
        { x: layout.hallHalfWidth - columnInsetX, z: rearHallZ },
    ];
}

function addGalleryHallObstacles(building, variant, axis) {
    void axis;

    const layout = getLorienVelmoreGalleryLayout(building);
    if (!layout) {
        return;
    }
    const transverseSpan = building.width;
    const passageWidth = THREE.MathUtils.clamp(variant.passageWidth, 4.8, transverseSpan - 3.6);
    const passageHeight = THREE.MathUtils.clamp(variant.passageHeight, 4.4, building.height - 4.8);
    const hallVerticalRange = {
        minY: -0.3,
        maxY: passageHeight + 0.4,
    };

    const columnSize = 0.62;
    const columnPositions = getLorienVelmoreGalleryColumnPositions(layout);
    columnPositions.forEach((column) => {
        addObstacleAabb(
            building.x + column.x,
            building.z + column.z,
            columnSize,
            columnSize,
            0.12,
            'building',
            hallVerticalRange
        );
    });

    const wallThickness = 0.24;
    const collisionBandThickness = 0.92;
    const collisionInset = 0.22;
    const hallMidZ = (layout.hallStartZ + layout.hallEndZ) * 0.5;
    const hallDepth = layout.hallEndZ - layout.hallStartZ;

    [-1, 1].forEach((direction) => {
        addObstacleAabb(
            building.x +
                direction * (layout.hallHalfWidth + collisionBandThickness * 0.5 - collisionInset),
            building.z + hallMidZ,
            collisionBandThickness,
            hallDepth + wallThickness + collisionInset * 2,
            0.04,
            'building',
            hallVerticalRange
        );
    });

    addObstacleAabb(
        building.x,
        building.z + layout.hallEndZ + collisionBandThickness * 0.5 - collisionInset,
        layout.hallHalfWidth * 2 + collisionBandThickness * 2 - collisionInset * 2,
        collisionBandThickness,
        0.04,
        'building',
        hallVerticalRange
    );

    const frontOpeningHalfWidth = passageWidth * 0.5;
    const frontSegmentWidth = Math.max(0.5, layout.hallHalfWidth - frontOpeningHalfWidth);
    if (frontSegmentWidth > 0.12) {
        [-1, 1].forEach((direction) => {
            addObstacleAabb(
                building.x + direction * (frontOpeningHalfWidth + frontSegmentWidth * 0.5),
                building.z +
                    layout.hallStartZ +
                    collisionBandThickness * 0.5 -
                    Math.min(0.08, collisionInset),
                frontSegmentWidth,
                collisionBandThickness,
                0.04,
                'building',
                hallVerticalRange
            );
        });
    }

    const jambDepth = 1.18;
    const jambWidth = 0.38;
    [-1, 1].forEach((direction) => {
        addObstacleAabb(
            building.x + direction * (frontOpeningHalfWidth + jambWidth * 0.5 - 0.04),
            building.z + layout.hallStartZ + jambDepth * 0.5 + 0.06,
            jambWidth,
            jambDepth,
            0.04,
            'building',
            hallVerticalRange
        );
    });
}

function addLorienVelmoreRoofLiftObstacles(building) {
    const layout = getLorienVelmoreRoofLiftLayout(building);
    const shaftRange = {
        minY: layout.bottomSurfaceY - 0.3,
        maxY: layout.roofSurfaceY + 2.6,
    };
    const roofRange = {
        minY: layout.roofSurfaceY - 0.4,
        maxY: layout.roofSurfaceY + 2.2,
    };
    const roofDeckWidth = layout.roofDeckMaxX - layout.roofDeckMinX;
    const roofDeckDepth = layout.roofDeckMaxZ - layout.roofDeckMinZ;
    const bridgeDepth = Math.max(0.24, layout.bridgeMaxZ - layout.bridgeMinZ);
    const bridgeRailInset = 0.82;
    const bridgeRailDepth = Math.max(0.18, bridgeDepth - bridgeRailInset * 2);

    addObstacleAabb(
        layout.centerX - layout.shaftHalfWidth - 0.12,
        layout.centerZ + layout.shaftCenterZ,
        0.24,
        layout.shaftDepth + 0.14,
        0.02,
        'building',
        shaftRange
    );
    addObstacleAabb(
        layout.centerX + layout.shaftHalfWidth + 0.12,
        layout.centerZ + layout.shaftCenterZ,
        0.24,
        layout.shaftDepth + 0.14,
        0.02,
        'building',
        shaftRange
    );
    addObstacleAabb(
        layout.centerX,
        layout.centerZ + layout.shaftCenterZ + layout.liftPlatformHalfDepth + 0.14,
        layout.liftPlatformWidth - 0.34,
        0.18,
        0.02,
        'building',
        roofRange
    );
    addObstacleAabb(
        layout.centerX,
        layout.centerZ + layout.shaftCenterZ - layout.liftPlatformHalfDepth - 0.16,
        layout.liftPlatformWidth - 0.18,
        0.22,
        0.02,
        'building',
        {
            minY: -0.3,
            maxY: 2.4,
        }
    );

    addObstacleAabb(
        layout.centerX + layout.roofDeckMinX - 0.12,
        layout.centerZ + (layout.roofDeckMinZ + layout.roofDeckMaxZ) * 0.5,
        0.24,
        roofDeckDepth,
        0.02,
        'building',
        roofRange
    );
    addObstacleAabb(
        layout.centerX + layout.roofDeckMaxX + 0.12,
        layout.centerZ + (layout.roofDeckMinZ + layout.roofDeckMaxZ) * 0.5,
        0.24,
        roofDeckDepth,
        0.02,
        'building',
        roofRange
    );
    addObstacleAabb(
        layout.centerX,
        layout.centerZ + layout.roofDeckMinZ - 0.12,
        roofDeckWidth,
        0.24,
        0.02,
        'building',
        roofRange
    );

    const rearGapHalfWidth = layout.bridgeHalfWidth + 0.22;
    const rearBarrierWidth = Math.max(0.54, (roofDeckWidth - rearGapHalfWidth * 2) * 0.5);
    if (rearBarrierWidth > 0.28) {
        [-1, 1].forEach((direction) => {
            addObstacleAabb(
                layout.centerX + direction * (rearGapHalfWidth + rearBarrierWidth * 0.5),
                layout.centerZ + layout.roofDeckMaxZ + 0.12,
                rearBarrierWidth,
                0.24,
                0.02,
                'building',
                roofRange
            );
        });
    }

    if (bridgeRailDepth > 0.18) {
        [-1, 1].forEach((direction) => {
            addObstacleAabb(
                layout.centerX + direction * (layout.bridgeHalfWidth + 0.12),
                layout.centerZ + (layout.bridgeMinZ + layout.bridgeMaxZ) * 0.5,
                0.24,
                bridgeRailDepth,
                0.02,
                'building',
                roofRange
            );
        });
    }
}

function addLorienVelmoreRoofCarLift(
    group,
    baseGeometry,
    { building, shellMaterial, trimMaterial, lightMaterial }
) {
    const layout = getLorienVelmoreRoofLiftLayout(building);
    const deckMaterial = shellMaterial.clone();
    deckMaterial.color.setHex(0xefe7da);
    deckMaterial.emissive.setHex(0x1f1a16);
    deckMaterial.emissiveIntensity = 0.04;
    deckMaterial.roughness = 0.36;
    deckMaterial.metalness = 0.08;

    const liftFrameMaterial = trimMaterial.clone();
    liftFrameMaterial.color.setHex(0xd7bb91);
    liftFrameMaterial.emissive.setHex(0x46321f);
    liftFrameMaterial.emissiveIntensity = 0.14;
    liftFrameMaterial.roughness = 0.24;
    liftFrameMaterial.metalness = 0.84;

    const liftCoreMaterial = shellMaterial.clone();
    liftCoreMaterial.color.setHex(0x243242);
    liftCoreMaterial.emissive.setHex(0x0d1721);
    liftCoreMaterial.emissiveIntensity = 0.18;
    liftCoreMaterial.roughness = 0.48;
    liftCoreMaterial.metalness = 0.34;

    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0xe8f6ff,
        emissive: 0x264558,
        emissiveIntensity: 0.16,
        transparent: true,
        opacity: 0.2,
        roughness: 0.12,
        metalness: 0.08,
    });
    glassMaterial.depthWrite = false;

    const guideLightMaterial = new THREE.MeshBasicMaterial({
        color: 0xfff1d3,
        transparent: true,
        opacity: 0.88,
        toneMapped: false,
    });
    const statusLightMaterial = new THREE.MeshBasicMaterial({
        color: 0xffd99e,
        transparent: true,
        opacity: 0.72,
        toneMapped: false,
    });

    const roofDeckWidth = layout.roofDeckMaxX - layout.roofDeckMinX;
    const roofDeckDepth = layout.roofDeckMaxZ - layout.roofDeckMinZ;
    const bridgeDepth = Math.max(0.18, layout.bridgeMaxZ - layout.bridgeMinZ);
    const bridgeRailInset = 1.02;
    const bridgeRailDepth = Math.max(0.18, bridgeDepth - bridgeRailInset * 2);
    const shaftHeight = layout.roofSurfaceY + 1.3;
    const shaftCenterY = shaftHeight * 0.5;
    const postSize = 0.22;
    const slabThickness = 0.22;
    const parapetThickness = 0.16;
    const parapetHeight = 0.86;
    const walkwayY = layout.roofSurfaceY - slabThickness * 0.5;
    const shaftSideGlassDepth = Math.max(1.2, layout.shaftDepth * 0.42);
    const shaftSideGlassCenterZ =
        layout.shaftCenterZ + layout.shaftHalfDepth - shaftSideGlassDepth * 0.5 - 0.18;
    addDecorBox(group, baseGeometry, deckMaterial, {
        x: 0,
        y: walkwayY,
        z: (layout.roofDeckMinZ + layout.roofDeckMaxZ) * 0.5,
        width: roofDeckWidth,
        height: slabThickness,
        depth: roofDeckDepth,
    });
    addDecorBox(group, baseGeometry, liftFrameMaterial, {
        x: 0,
        y: layout.roofSurfaceY + 0.022,
        z: (layout.roofDeckMinZ + layout.roofDeckMaxZ) * 0.5,
        width: roofDeckWidth - 0.22,
        height: 0.025,
        depth: roofDeckDepth - 0.22,
    });

    if (bridgeDepth > 0.22) {
        addDecorBox(group, baseGeometry, deckMaterial, {
            x: 0,
            y: walkwayY,
            z: (layout.bridgeMinZ + layout.bridgeMaxZ) * 0.5,
            width: layout.bridgeHalfWidth * 2,
            height: slabThickness,
            depth: bridgeDepth,
        });
        addDecorBox(group, baseGeometry, liftFrameMaterial, {
            x: 0,
            y: layout.roofSurfaceY + 0.02,
            z: (layout.bridgeMinZ + layout.bridgeMaxZ) * 0.5,
            width: layout.bridgeHalfWidth * 2 - 0.16,
            height: 0.024,
            depth: Math.max(0.18, bridgeDepth - 0.16),
        });
    }

    [
        {
            x: layout.roofDeckMinX - 0.08,
            z: (layout.roofDeckMinZ + layout.roofDeckMaxZ) * 0.5,
            width: parapetThickness,
            depth: roofDeckDepth,
        },
        {
            x: layout.roofDeckMaxX + 0.08,
            z: (layout.roofDeckMinZ + layout.roofDeckMaxZ) * 0.5,
            width: parapetThickness,
            depth: roofDeckDepth,
        },
        { x: 0, z: layout.roofDeckMinZ - 0.08, width: roofDeckWidth, depth: parapetThickness },
    ].forEach((rail) => {
        addDecorBox(group, baseGeometry, glassMaterial, {
            x: rail.x,
            y: layout.roofSurfaceY + parapetHeight * 0.5,
            z: rail.z,
            width: rail.width,
            height: parapetHeight,
            depth: rail.depth,
        });
    });

    const backGapHalfWidth = layout.bridgeHalfWidth + 0.22;
    const rearParapetWidth = Math.max(0.54, (roofDeckWidth - backGapHalfWidth * 2) * 0.5);
    if (rearParapetWidth > 0.34) {
        [-1, 1].forEach((direction) => {
            addDecorBox(group, baseGeometry, glassMaterial, {
                x: direction * (backGapHalfWidth + rearParapetWidth * 0.5),
                y: layout.roofSurfaceY + parapetHeight * 0.5,
                z: layout.roofDeckMaxZ + 0.08,
                width: rearParapetWidth,
                height: parapetHeight,
                depth: parapetThickness,
            });
        });
    }

    if (bridgeDepth > 0.22) {
        [-1, 1].forEach((direction) => {
            addDecorBox(group, baseGeometry, glassMaterial, {
                x: direction * (layout.bridgeHalfWidth + 0.08),
                y: layout.roofSurfaceY + parapetHeight * 0.5,
                z: (layout.bridgeMinZ + layout.bridgeMaxZ) * 0.5,
                width: parapetThickness,
                height: parapetHeight,
                depth: bridgeRailDepth,
            });
        });
    }

    [
        { x: -layout.shaftHalfWidth, z: -layout.shaftHalfDepth },
        { x: layout.shaftHalfWidth, z: -layout.shaftHalfDepth },
        { x: -layout.shaftHalfWidth, z: layout.shaftHalfDepth },
        { x: layout.shaftHalfWidth, z: layout.shaftHalfDepth },
    ].forEach((corner) => {
        addDecorBox(group, baseGeometry, liftFrameMaterial, {
            x: layout.shaftCenterX + corner.x,
            y: shaftCenterY,
            z: layout.shaftCenterZ + corner.z,
            width: postSize,
            height: shaftHeight,
            depth: postSize,
        });
    });

    [-1, 1].forEach((direction) => {
        addDecorBox(group, baseGeometry, glassMaterial, {
            x: layout.shaftCenterX + direction * layout.shaftHalfWidth,
            y: shaftCenterY,
            z: shaftSideGlassCenterZ,
            width: 0.08,
            height: shaftHeight - 0.26,
            depth: shaftSideGlassDepth,
        });
    });

    addDecorBox(group, baseGeometry, deckMaterial, {
        x: 0,
        y: 0.07,
        z: (layout.serviceLaneMinZ + layout.serviceLaneMaxZ) * 0.5,
        width: layout.serviceLaneHalfWidth * 2,
        height: 0.08,
        depth: layout.serviceLaneMaxZ - layout.serviceLaneMinZ,
    });
    addDecorBox(group, baseGeometry, liftFrameMaterial, {
        x: 0,
        y: 0.115,
        z: (layout.serviceLaneMinZ + layout.serviceLaneMaxZ) * 0.5,
        width: layout.serviceLaneHalfWidth * 2 - 0.28,
        height: 0.012,
        depth: layout.serviceLaneMaxZ - layout.serviceLaneMinZ - 0.24,
    });

    const platformGroup = new THREE.Group();
    platformGroup.position.set(layout.shaftCenterX, layout.bottomSurfaceY, layout.shaftCenterZ);

    addDecorBox(platformGroup, baseGeometry, liftCoreMaterial, {
        x: 0,
        y: -0.2,
        z: 0,
        width: layout.liftPlatformWidth,
        height: 0.26,
        depth: layout.liftPlatformDepth,
    });
    addDecorBox(platformGroup, baseGeometry, deckMaterial, {
        x: 0,
        y: -0.045,
        z: 0,
        width: layout.liftPlatformWidth - 0.18,
        height: 0.05,
        depth: layout.liftPlatformDepth - 0.18,
    });
    addDecorBox(platformGroup, baseGeometry, guideLightMaterial, {
        x: 0,
        y: 0.01,
        z: -layout.liftPlatformHalfDepth + 0.18,
        width: layout.liftPlatformWidth - 0.74,
        height: 0.012,
        depth: 0.08,
    });
    [-1, 1].forEach((direction) => {
        addDecorBox(platformGroup, baseGeometry, guideLightMaterial, {
            x: direction * (layout.liftPlatformHalfWidth - 0.14),
            y: 0.01,
            z: 0,
            width: 0.04,
            height: 0.012,
            depth: layout.liftPlatformDepth - 0.7,
        });
    });
    group.add(platformGroup);

    const indicatorGroup = new THREE.Group();
    indicatorGroup.position.set(
        layout.shaftCenterX,
        1.2,
        layout.shaftCenterZ - layout.shaftHalfDepth - 0.18
    );
    addDecorBox(indicatorGroup, baseGeometry, liftFrameMaterial, {
        x: 0,
        y: 0,
        z: 0,
        width: 0.16,
        height: 0.42,
        depth: 0.28,
    });
    const statusLight = addDecorBox(indicatorGroup, baseGeometry, statusLightMaterial, {
        x: 0,
        y: 0,
        z: -0.08,
        width: 0.04,
        height: 0.18,
        depth: 0.08,
    });
    group.add(indicatorGroup);

    const roofViewLight = addDecorBox(group, baseGeometry, guideLightMaterial, {
        x: 0,
        y: layout.roofSurfaceY + 0.04,
        z: layout.roofDeckMinZ + 0.72,
        width: Math.min(4.8, roofDeckWidth * 0.42),
        height: 0.014,
        depth: 0.08,
    });

    if (!Array.isArray(group.userData.lorienVelmoreRoofLiftSystems)) {
        group.userData.lorienVelmoreRoofLiftSystems = [];
    }
    group.userData.lorienVelmoreRoofLiftSystems.push({
        platformGroup,
        statusLightMaterial,
        roofViewLightMaterial: roofViewLight.material,
    });
}

function addLorienVelmoreSubterraneanHall(
    group,
    baseGeometry,
    { building, passageWidth, passageHeight, shellMaterial, trimMaterial, lightMaterial }
) {
    const layout = getLorienVelmoreGalleryLayout(building);
    if (!layout) {
        return;
    }

    const wallThickness = 0.26;
    const roofThickness = 0.18;
    const ceilingY = Math.min(layout.lowerLevelCeilingY, passageHeight - 0.32);
    const hallDepth = layout.hallEndZ - layout.hallStartZ;
    const hallMidZ = layout.hallStartZ + hallDepth * 0.5;
    const wallCenterY = ceilingY * 0.5;
    const frontOpeningHalfWidth = Math.max(
        2.45,
        Math.min(layout.hallHalfWidth - 0.9, passageWidth * 0.5)
    );
    const frontWallSegmentWidth = Math.max(0.52, layout.hallHalfWidth - frontOpeningHalfWidth);
    const entryFrameHeight = Math.min(4.58, ceilingY - 0.3);
    const doorHeight = entryFrameHeight - 0.38;
    const doorPanelWidth = frontOpeningHalfWidth + 0.06;
    const doorPlaneZ = layout.hallStartZ + wallThickness * 0.8;
    const doorClosedOffsetX = frontOpeningHalfWidth - doorPanelWidth * 0.5;
    const doorTravelDistance = Math.max(1.18, frontOpeningHalfWidth - 0.94);
    const exteriorApronDepth = 2.3;
    const exteriorApronZ = layout.hallStartZ - exteriorApronDepth * 0.5 + 0.08;
    const frontFacadeZ = layout.hallStartZ + wallThickness * 0.5;
    const doorBaseY = 0.05;

    const interiorWallMaterial = new THREE.MeshStandardMaterial({
        color: 0xf7f4ee,
        emissive: 0x26211b,
        emissiveIntensity: 0.05,
        roughness: 0.72,
        metalness: 0.02,
    });
    const ceilingMaterial = new THREE.MeshStandardMaterial({
        color: 0xfbfbf7,
        emissive: 0x221d18,
        emissiveIntensity: 0.03,
        roughness: 0.42,
        metalness: 0.02,
    });
    const cofferMaterial = new THREE.MeshStandardMaterial({
        color: 0xe8e1d4,
        emissive: 0x1c1814,
        emissiveIntensity: 0.04,
        roughness: 0.54,
        metalness: 0.02,
    });
    const exteriorFacadeMaterial = new THREE.MeshStandardMaterial({
        color: 0xf4efe5,
        emissive: 0x241d18,
        emissiveIntensity: 0.05,
        roughness: 0.34,
        metalness: 0.04,
    });
    const exteriorBandMaterial = new THREE.MeshStandardMaterial({
        color: 0x232a34,
        emissive: 0x10141a,
        emissiveIntensity: 0.08,
        roughness: 0.68,
        metalness: 0.24,
    });
    const bronzeMaterial = trimMaterial.clone();
    bronzeMaterial.color.setHex(0xc8ad82);
    bronzeMaterial.emissive.setHex(0x463321);
    bronzeMaterial.emissiveIntensity = 0.12;
    bronzeMaterial.roughness = 0.24;
    bronzeMaterial.metalness = 0.82;
    const doorFrameMaterial = new THREE.MeshStandardMaterial({
        color: 0x65523f,
        emissive: 0x1f1813,
        emissiveIntensity: 0.07,
        roughness: 0.36,
        metalness: 0.7,
    });
    const doorGlassMaterial = new THREE.MeshStandardMaterial({
        color: 0xf8fbff,
        emissive: 0x5a4a40,
        emissiveIntensity: 0.06,
        transparent: true,
        opacity: 0.24,
        roughness: 0.08,
        metalness: 0.1,
    });
    const floorBorderMaterial = new THREE.MeshStandardMaterial({
        color: 0xd6c7ae,
        emissive: 0x211a15,
        emissiveIntensity: 0.04,
        roughness: 0.24,
        metalness: 0.08,
    });
    const floorFieldMaterial = new THREE.MeshStandardMaterial({
        color: 0xf1ede4,
        emissive: 0x181411,
        emissiveIntensity: 0.03,
        roughness: 0.18,
        metalness: 0.04,
    });
    const revealMaterial = new THREE.MeshStandardMaterial({
        color: 0xe3d8c7,
        emissive: 0x1b1511,
        emissiveIntensity: 0.04,
        roughness: 0.2,
        metalness: 0.06,
    });
    const artBayMaterial = new THREE.MeshStandardMaterial({
        color: 0xf3efe8,
        emissive: 0x211c17,
        emissiveIntensity: 0.03,
        roughness: 0.58,
        metalness: 0.02,
    });
    const ceilingLightMaterial = new THREE.MeshBasicMaterial({
        color: 0xfff5de,
        transparent: true,
        opacity: 0.82,
        toneMapped: false,
    });
    const wallWashMaterial = new THREE.MeshBasicMaterial({
        color: 0xfff0d8,
        transparent: true,
        opacity: 0.18,
        toneMapped: false,
    });
    const doorGlowMaterial = new THREE.MeshBasicMaterial({
        color: 0xfff3dc,
        transparent: true,
        opacity: 0.24,
        toneMapped: false,
    });
    const sconceGlowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffedd2,
        transparent: true,
        opacity: 0.3,
        toneMapped: false,
    });
    addDecorBox(group, baseGeometry, interiorWallMaterial, {
        x: -layout.hallHalfWidth - wallThickness * 0.5,
        y: wallCenterY,
        z: hallMidZ,
        width: wallThickness,
        height: ceilingY,
        depth: hallDepth + wallThickness * 2,
    });
    addDecorBox(group, baseGeometry, interiorWallMaterial, {
        x: layout.hallHalfWidth + wallThickness * 0.5,
        y: wallCenterY,
        z: hallMidZ,
        width: wallThickness,
        height: ceilingY,
        depth: hallDepth + wallThickness * 2,
    });
    addDecorBox(group, baseGeometry, interiorWallMaterial, {
        x: 0,
        y: wallCenterY,
        z: layout.hallEndZ + wallThickness * 0.5,
        width: layout.hallHalfWidth * 2 + wallThickness * 2,
        height: ceilingY,
        depth: wallThickness,
    });

    [-1, 1].forEach((direction) => {
        addDecorBox(group, baseGeometry, exteriorFacadeMaterial, {
            x: direction * (frontOpeningHalfWidth + frontWallSegmentWidth * 0.5),
            y: wallCenterY,
            z: frontFacadeZ,
            width: frontWallSegmentWidth,
            height: ceilingY,
            depth: wallThickness,
        });
        addDecorBox(group, baseGeometry, exteriorBandMaterial, {
            x: direction * (layout.hallHalfWidth + 0.14),
            y: wallCenterY,
            z: layout.hallStartZ + 1.2,
            width: 0.2,
            height: ceilingY,
            depth: 2.5,
        });
        addDecorBox(group, baseGeometry, bronzeMaterial, {
            x: direction * (frontOpeningHalfWidth + frontWallSegmentWidth * 0.5),
            y: 1.92,
            z: layout.hallStartZ + 0.1,
            width: 0.12,
            height: 2.3,
            depth: 0.06,
        });
    });

    addDecorBox(group, baseGeometry, exteriorBandMaterial, {
        x: 0,
        y: entryFrameHeight + 0.34,
        z: layout.hallStartZ - 0.04,
        width: frontOpeningHalfWidth * 2 + 1.22,
        height: 0.28,
        depth: 0.62,
    });
    addDecorBox(group, baseGeometry, exteriorFacadeMaterial, {
        x: 0,
        y: entryFrameHeight + 0.12,
        z: layout.hallStartZ,
        width: frontOpeningHalfWidth * 2 + 0.84,
        height: 0.16,
        depth: 0.34,
    });
    addDecorBox(group, baseGeometry, doorFrameMaterial, {
        x: -frontOpeningHalfWidth - 0.12,
        y: entryFrameHeight * 0.5,
        z: layout.hallStartZ + 0.04,
        width: 0.18,
        height: entryFrameHeight,
        depth: 0.24,
    });
    addDecorBox(group, baseGeometry, doorFrameMaterial, {
        x: frontOpeningHalfWidth + 0.12,
        y: entryFrameHeight * 0.5,
        z: layout.hallStartZ + 0.04,
        width: 0.18,
        height: entryFrameHeight,
        depth: 0.24,
    });
    addDecorBox(group, baseGeometry, doorFrameMaterial, {
        x: 0,
        y: entryFrameHeight - 0.06,
        z: layout.hallStartZ + 0.04,
        width: frontOpeningHalfWidth * 2 + 0.42,
        height: 0.1,
        depth: 0.24,
    });
    addDecorBox(group, baseGeometry, bronzeMaterial, {
        x: 0,
        y: entryFrameHeight - 0.18,
        z: layout.hallStartZ + 0.04,
        width: frontOpeningHalfWidth * 2 + 0.16,
        height: 0.07,
        depth: 0.16,
    });
    addDecorBox(group, baseGeometry, lightMaterial, {
        x: 0,
        y: entryFrameHeight - 0.19,
        z: layout.hallStartZ - 0.03,
        width: frontOpeningHalfWidth * 2 - 0.28,
        height: 0.022,
        depth: 0.03,
    });
    [-1, 1].forEach((direction) => {
        const ledX = direction * (frontOpeningHalfWidth + 0.24);
        addLorienLedRibbon(group, baseGeometry, {
            x: ledX,
            y: entryFrameHeight * 0.5,
            z: layout.hallStartZ - 0.07,
            width: 0.08,
            height: entryFrameHeight - 0.24,
            depth: 0.024,
            axis: 'y',
            segmentCount: Math.max(6, Math.round(entryFrameHeight / 0.7)),
            segmentGap: 0.05,
            haloColor: 0xffddb0,
            coreColor: 0xfff3e1,
            haloOpacity: 0.26,
            coreOpacity: 0.98,
            haloScale: 2.9,
            coreScale: 1,
            sweepSpeed: 0.00092,
            sweepPhase: direction < 0 ? 0.12 : 0.58,
            sweepBand: 0.22,
            reverseSweep: direction < 0,
        });
    });
    addLorienLedRibbon(group, baseGeometry, {
        x: 0,
        y: entryFrameHeight - 0.17,
        z: layout.hallStartZ - 0.06,
        width: frontOpeningHalfWidth * 2 + 0.2,
        height: 0.06,
        depth: 0.02,
        axis: 'x',
        segmentCount: 10,
        segmentGap: 0.05,
        haloColor: 0xffddb0,
        coreColor: 0xfff3e1,
        haloOpacity: 0.24,
        coreOpacity: 0.84,
        haloScale: 2.6,
        coreScale: 1,
        sweepSpeed: 0.0011,
        sweepPhase: 0.18,
        sweepBand: 0.22,
    });
    addLorienLedRibbon(group, baseGeometry, {
        x: 0,
        y: 0.08,
        z: exteriorApronZ + exteriorApronDepth * 0.5 - 0.28,
        width: frontOpeningHalfWidth * 2 + 1.16,
        height: 0.03,
        depth: 0.018,
        axis: 'x',
        segmentCount: 12,
        segmentGap: 0.06,
        haloColor: 0xf4c989,
        coreColor: 0xffebc9,
        haloOpacity: 0.18,
        coreOpacity: 0.56,
        haloScale: 1.9,
        coreScale: 1,
        sweepSpeed: 0.00135,
        sweepPhase: 0.42,
        sweepBand: 0.18,
    });

    [-1, 1].forEach((direction) => {
        const sconceX = direction * (frontOpeningHalfWidth + frontWallSegmentWidth * 0.54);
        addDecorBox(group, baseGeometry, bronzeMaterial, {
            x: sconceX,
            y: 2.54,
            z: layout.hallStartZ - 0.02,
            width: 0.18,
            height: 0.74,
            depth: 0.1,
        });
        addDecorBox(group, baseGeometry, sconceGlowMaterial, {
            x: sconceX,
            y: 2.54,
            z: layout.hallStartZ - 0.1,
            width: 0.4,
            height: 1.42,
            depth: 0.02,
        });
    });

    addLorienVelmoreExteriorManifesto(group, {
        hallHalfWidth: layout.hallHalfWidth,
        hallMidZ,
        hallDepth,
        wallThickness,
        wallHeight: ceilingY,
    });

    addLorienVelmoreEntrancePlanters(group, baseGeometry, {
        frontOpeningHalfWidth,
        frontWallSegmentWidth,
        frontFacadeZ,
        exteriorApronZ,
        trimMaterial: bronzeMaterial,
    });
    addLorienVelmoreGroundLandscape(group, baseGeometry, {
        building,
        frontOpeningHalfWidth,
        frontFacadeZ,
        exteriorApronZ,
        trimMaterial: bronzeMaterial,
    });

    addDecorBox(group, baseGeometry, ceilingMaterial, {
        x: 0,
        y: ceilingY + roofThickness * 0.5,
        z: hallMidZ,
        width: layout.hallHalfWidth * 2 + wallThickness * 2,
        height: roofThickness,
        depth: hallDepth + wallThickness * 2,
    });

    addDecorBox(group, baseGeometry, floorBorderMaterial, {
        x: 0,
        y: 0.026,
        z: hallMidZ,
        width: layout.hallHalfWidth * 2 - 0.26,
        height: 0.02,
        depth: hallDepth - 0.3,
    });
    addDecorBox(group, baseGeometry, floorFieldMaterial, {
        x: 0,
        y: 0.04,
        z: hallMidZ,
        width: layout.hallHalfWidth * 2 - 1.26,
        height: 0.016,
        depth: hallDepth - 1.12,
    });
    [-1, 1].forEach((direction) => {
        addDecorBox(group, baseGeometry, bronzeMaterial, {
            x: direction * (layout.hallHalfWidth * 0.36),
            y: 0.046,
            z: hallMidZ,
            width: 0.08,
            height: 0.006,
            depth: hallDepth - 1.42,
        });
        addDecorBox(group, baseGeometry, revealMaterial, {
            x: direction * layout.hallHalfWidth,
            y: 0.14,
            z: hallMidZ,
            width: 0.12,
            height: 0.12,
            depth: hallDepth - 0.82,
        });
    });
    addDecorBox(group, baseGeometry, revealMaterial, {
        x: 0,
        y: 0.14,
        z: layout.hallEndZ,
        width: layout.hallHalfWidth * 2 - 0.72,
        height: 0.12,
        depth: 0.12,
    });

    const bayOffsets = [-3.15, 0, 3.15];
    [-1, 1].forEach((direction) => {
        bayOffsets.forEach((zOffset) => {
            const panelCenterZ = THREE.MathUtils.clamp(
                hallMidZ + zOffset,
                layout.hallStartZ + 1.7,
                layout.hallEndZ - 1.7
            );
            addDecorBox(group, baseGeometry, artBayMaterial, {
                x: direction * (layout.hallHalfWidth - 0.08),
                y: 1.96,
                z: panelCenterZ,
                width: 0.06,
                height: 2.52,
                depth: 1.72,
            });
            addDecorBox(group, baseGeometry, wallWashMaterial, {
                x: direction * (layout.hallHalfWidth - 0.035),
                y: 1.96,
                z: panelCenterZ,
                width: 0.02,
                height: 2.12,
                depth: 1.44,
            });
        });
    });
    addDecorBox(group, baseGeometry, artBayMaterial, {
        x: 0,
        y: 2.04,
        z: layout.hallEndZ - 0.08,
        width: layout.hallHalfWidth * 1.46,
        height: 2.78,
        depth: 0.08,
    });
    addDecorBox(group, baseGeometry, wallWashMaterial, {
        x: 0,
        y: 2.06,
        z: layout.hallEndZ - 0.03,
        width: layout.hallHalfWidth * 1.18,
        height: 2.26,
        depth: 0.02,
    });

    const cofferCount = 5;
    const cofferDepth = hallDepth - 1.08;
    const cofferY = ceilingY - 0.12;
    for (let i = 0; i < cofferCount; i += 1) {
        const z =
            hallMidZ - cofferDepth * 0.5 + ((i + 0.5) * cofferDepth) / Math.max(1, cofferCount);
        addDecorBox(group, baseGeometry, cofferMaterial, {
            x: 0,
            y: cofferY,
            z,
            width: layout.hallHalfWidth * 2 - 0.88,
            height: 0.08,
            depth: 0.24,
        });
    }

    [
        { x: -layout.hallHalfWidth * 0.42, width: 0.16, depth: hallDepth - 1.08 },
        { x: 0, width: 0.26, depth: hallDepth - 1.2 },
        { x: layout.hallHalfWidth * 0.42, width: 0.16, depth: hallDepth - 1.08 },
    ].forEach((lightStrip) => {
        addDecorBox(group, baseGeometry, ceilingLightMaterial, {
            x: lightStrip.x,
            y: ceilingY - 0.09,
            z: hallMidZ,
            width: lightStrip.width,
            height: 0.028,
            depth: lightStrip.depth,
        });
    });
    [-1, 1].forEach((direction) => {
        addDecorBox(group, baseGeometry, ceilingLightMaterial, {
            x: direction * (layout.hallHalfWidth - 0.46),
            y: ceilingY - 0.11,
            z: hallMidZ,
            width: 0.06,
            height: 0.02,
            depth: hallDepth - 0.92,
        });
    });

    const leftDoorPanel = createLorienVelmoreDoorLeaf(baseGeometry, {
        width: doorPanelWidth,
        height: doorHeight,
        frameMaterial: doorFrameMaterial,
        glassMaterial: doorGlassMaterial,
        glowMaterial: doorGlowMaterial,
    });
    leftDoorPanel.position.set(-doorClosedOffsetX, doorBaseY, doorPlaneZ);
    group.add(leftDoorPanel);
    const leftDoorPanelState = leftDoorPanel.userData?.lorienDoorPanelState || null;

    const rightDoorPanel = createLorienVelmoreDoorLeaf(baseGeometry, {
        width: doorPanelWidth,
        height: doorHeight,
        frameMaterial: doorFrameMaterial,
        glassMaterial: doorGlassMaterial,
        glowMaterial: doorGlowMaterial,
    });
    rightDoorPanel.position.set(doorClosedOffsetX, doorBaseY, doorPlaneZ);
    group.add(rightDoorPanel);
    const rightDoorPanelState = rightDoorPanel.userData?.lorienDoorPanelState || null;

    addDecorBox(group, baseGeometry, doorFrameMaterial, {
        x: 0,
        y: entryFrameHeight - 0.28,
        z: doorPlaneZ + 0.03,
        width: frontOpeningHalfWidth * 2 + 0.46,
        height: 0.06,
        depth: 0.14,
    });

    return {
        rootGroup: group,
        centerX: layout.centerX,
        centerZ: layout.centerZ,
        roomEndZ: layout.hallEndZ,
        doorPlaneZ,
        doorBaseY,
        doorHeight,
        panelDepth: LORIEN_DOOR_PANEL_DEPTH,
        leftPanel: leftDoorPanel,
        rightPanel: rightDoorPanel,
        panels: [leftDoorPanelState, rightDoorPanelState].filter(Boolean),
        leftClosedX: -doorClosedOffsetX,
        rightClosedX: doorClosedOffsetX,
        travelDistance: doorTravelDistance,
        openAmount: 0,
        targetOpen: 0,
        openSpeed: LORIEN_VELMORE_DOOR_OPEN_SPEED,
        closeSpeed: LORIEN_VELMORE_DOOR_CLOSE_SPEED,
        sensorHalfWidth: frontOpeningHalfWidth + 1.15,
        sensorMaxY: ceilingY + 0.8,
        outsideSensorDepth: 8.8,
        insideSensorDepth: 2.6,
        autoCloseDepth: 3.8,
        glowMaterial: leftDoorPanelState?.glowMaterial || null,
        scorchMarks: [],
        glassBroken: false,
    };
}

function addLorienVelmoreEntrancePlanters(
    group,
    baseGeometry,
    { frontOpeningHalfWidth, frontWallSegmentWidth, frontFacadeZ, exteriorApronZ, trimMaterial }
) {
    const planterShellMaterial = new THREE.MeshStandardMaterial({
        color: 0xf1e6d7,
        emissive: 0x241d17,
        emissiveIntensity: 0.04,
        roughness: 0.24,
        metalness: 0.08,
    });
    const planterTopMaterial = new THREE.MeshStandardMaterial({
        color: 0xcfb08a,
        emissive: 0x463221,
        emissiveIntensity: 0.1,
        roughness: 0.16,
        metalness: 0.82,
    });
    const soilMaterial = new THREE.MeshStandardMaterial({
        color: 0x5b4738,
        emissive: 0x16100c,
        emissiveIntensity: 0.03,
        roughness: 0.92,
        metalness: 0.02,
    });
    const leafMaterial = new THREE.MeshStandardMaterial({
        color: 0x3d5d3f,
        emissive: 0x162416,
        emissiveIntensity: 0.06,
        roughness: 0.74,
        metalness: 0.04,
    });
    const leafAccentMaterial = new THREE.MeshStandardMaterial({
        color: 0x6f8a62,
        emissive: 0x1b2818,
        emissiveIntensity: 0.08,
        roughness: 0.68,
        metalness: 0.03,
    });
    const stemMaterial = new THREE.MeshStandardMaterial({
        color: 0x58724a,
        emissive: 0x192316,
        emissiveIntensity: 0.05,
        roughness: 0.74,
        metalness: 0.02,
    });
    const flowerMaterials = [0xf5efe4, 0xe9dcc7, 0xf1e7d7, 0xd9c7ab].map(
        (hex) =>
            new THREE.MeshStandardMaterial({
                color: hex,
                emissive: 0x2d241a,
                emissiveIntensity: 0.06,
                roughness: 0.46,
                metalness: 0.08,
            })
    );
    const shrubGeometry = new THREE.SphereGeometry(0.42, 18, 14);
    const bloomGeometry = new THREE.SphereGeometry(0.11, 12, 10);
    const planterX =
        frontOpeningHalfWidth +
        Math.min(Math.max(frontWallSegmentWidth * 0.48, 0.92), frontWallSegmentWidth * 0.5 + 0.18);
    const planterZ = (frontFacadeZ + exteriorApronZ) * 0.5 + 0.18;

    [-1, 1].forEach((direction) => {
        const centerX = direction * planterX;
        addDecorBox(group, baseGeometry, planterShellMaterial, {
            x: centerX,
            y: 0.3,
            z: planterZ,
            width: 1.16,
            height: 0.56,
            depth: 0.98,
        });
        addDecorBox(group, baseGeometry, trimMaterial, {
            x: centerX,
            y: 0.53,
            z: planterZ,
            width: 1.24,
            height: 0.08,
            depth: 1.06,
        });
        addDecorBox(group, baseGeometry, planterTopMaterial, {
            x: centerX,
            y: 0.06,
            z: planterZ,
            width: 1.02,
            height: 0.05,
            depth: 0.84,
        });
        addDecorBox(group, baseGeometry, soilMaterial, {
            x: centerX,
            y: 0.58,
            z: planterZ,
            width: 0.96,
            height: 0.07,
            depth: 0.78,
        });

        [
            { x: centerX - 0.12, y: 1.06, z: planterZ + 0.02, s: 0.86, material: leafMaterial },
            {
                x: centerX + 0.18,
                y: 1.16,
                z: planterZ - 0.06,
                s: 0.74,
                material: leafAccentMaterial,
            },
            {
                x: centerX + 0.02,
                y: 1.36,
                z: planterZ + 0.02,
                s: 0.68,
                material: leafAccentMaterial,
            },
        ].forEach((shrub) => {
            const mesh = new THREE.Mesh(shrubGeometry, shrub.material);
            mesh.position.set(shrub.x, shrub.y, shrub.z);
            mesh.scale.setScalar(shrub.s);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            group.add(mesh);
        });

        [
            { x: centerX - 0.24, z: planterZ - 0.18, h: 0.84, material: flowerMaterials[0] },
            { x: centerX - 0.04, z: planterZ - 0.24, h: 0.96, material: flowerMaterials[1] },
            { x: centerX + 0.18, z: planterZ - 0.16, h: 0.88, material: flowerMaterials[2] },
            { x: centerX + 0.08, z: planterZ + 0.2, h: 0.82, material: flowerMaterials[3] },
        ].forEach((flower, index) => {
            addDecorBox(group, baseGeometry, stemMaterial, {
                x: flower.x,
                y: 0.58 + flower.h * 0.5,
                z: flower.z,
                width: 0.04,
                height: flower.h,
                depth: 0.04,
            });
            const bloom = new THREE.Mesh(bloomGeometry, flower.material);
            bloom.position.set(flower.x, 0.58 + flower.h + 0.08, flower.z);
            const scale = index % 2 === 0 ? 1.05 : 0.9;
            bloom.scale.setScalar(scale);
            bloom.castShadow = false;
            bloom.receiveShadow = false;
            group.add(bloom);
        });
    });
}

function addLorienVelmoreGroundLandscape(
    group,
    baseGeometry,
    { building, frontOpeningHalfWidth, frontFacadeZ, exteriorApronZ, trimMaterial }
) {
    const roofLiftLayout = getLorienVelmoreRoofLiftLayout(building);
    const curbMaterial = new THREE.MeshStandardMaterial({
        color: 0xe7ded1,
        emissive: 0x241d17,
        emissiveIntensity: 0.03,
        roughness: 0.58,
        metalness: 0.04,
    });
    const grassMaterial = new THREE.MeshStandardMaterial({
        color: 0x35563d,
        emissive: 0x152117,
        emissiveIntensity: 0.08,
        roughness: 0.94,
        metalness: 0.01,
    });
    const mossAccentMaterial = new THREE.MeshStandardMaterial({
        color: 0x547053,
        emissive: 0x1a281a,
        emissiveIntensity: 0.06,
        roughness: 0.88,
        metalness: 0.02,
    });
    const bedConfigs = [];
    const frontBedDepth = 2.46;
    const frontBedZ = -building.depth * 0.5 - frontBedDepth * 0.5 + 0.44;
    const backBedDepth = 1.86;
    const backBedZ = building.depth * 0.5 + backBedDepth * 0.5 - 0.3;
    const entryClearWidth = Math.min(building.width - 1.8, frontOpeningHalfWidth * 2 + 2.5);
    const frontSideBedWidth = Math.max(0.7, (building.width - entryClearWidth) * 0.5 - 0.34);

    if (frontSideBedWidth > 0.62) {
        [-1, 1].forEach((direction) => {
            bedConfigs.push({
                x: direction * (entryClearWidth * 0.5 + frontSideBedWidth * 0.5 + 0.16),
                z: frontBedZ,
                width: frontSideBedWidth,
                depth: frontBedDepth,
            });
        });
    }

    const sideBedWidth = 1.06;
    const sideBedDepth = Math.max(4.6, building.depth - 5.4);
    const sideBedX = building.width * 0.5 + sideBedWidth * 0.5 - 0.18;
    [-1, 1].forEach((direction) => {
        bedConfigs.push({
            x: direction * sideBedX,
            z: 0.12,
            width: sideBedWidth,
            depth: sideBedDepth,
        });
    });

    const rearLandscapeWidth = building.width - 1.76;
    const rearLiftClearWidth = roofLiftLayout.serviceLaneHalfWidth * 2 + 0.92;
    const rearBedSideWidth = Math.max(0, (rearLandscapeWidth - rearLiftClearWidth) * 0.5 - 0.14);
    if (rearBedSideWidth > 0.52) {
        [-1, 1].forEach((direction) => {
            bedConfigs.push({
                x: direction * (rearLiftClearWidth * 0.5 + rearBedSideWidth * 0.5 + 0.14),
                z: backBedZ,
                width: rearBedSideWidth,
                depth: backBedDepth,
            });
        });
    } else {
        bedConfigs.push({
            x: 0,
            z: backBedZ,
            width: rearLandscapeWidth,
            depth: backBedDepth,
        });
    }

    bedConfigs.forEach((bed, index) => {
        addDecorBox(group, baseGeometry, curbMaterial, {
            x: bed.x,
            y: 0.05,
            z: bed.z,
            width: bed.width + 0.18,
            height: 0.1,
            depth: bed.depth + 0.18,
        });
        addDecorBox(group, baseGeometry, grassMaterial, {
            x: bed.x,
            y: 0.085,
            z: bed.z,
            width: bed.width,
            height: 0.05,
            depth: bed.depth,
        });
        addDecorBox(group, baseGeometry, trimMaterial, {
            x: bed.x,
            y: 0.102,
            z: bed.z,
            width: bed.width + 0.04,
            height: 0.012,
            depth: bed.depth + 0.04,
        });

        const tuftCount = bed.width > 2.6 ? 3 : 2;
        for (let i = 0; i < tuftCount; i += 1) {
            const along = ((i + 0.5) / tuftCount - 0.5) * Math.max(0.4, bed.width - 0.62);
            const tuftDepthOffset = (index + i) % 2 === 0 ? -0.18 : 0.16;
            addDecorBox(group, baseGeometry, mossAccentMaterial, {
                x: bed.x + along,
                y: 0.112,
                z: bed.z + tuftDepthOffset,
                width: Math.max(0.28, Math.min(0.62, bed.width * 0.18)),
                height: 0.028,
                depth: Math.max(0.26, Math.min(0.7, bed.depth * 0.18)),
            });
        }
    });

    addDecorBox(group, baseGeometry, curbMaterial, {
        x: 0,
        y: 0.05,
        z: (frontFacadeZ + exteriorApronZ) * 0.5 + 0.22,
        width: Math.min(building.width - 2.4, frontOpeningHalfWidth * 2 + 1.9),
        height: 0.1,
        depth: 0.56,
    });
}

function addLorienVelmoreExteriorManifesto(
    group,
    { hallHalfWidth, hallMidZ, hallDepth, wallThickness, wallHeight }
) {
    const panelWidth = Math.max(8.8, hallDepth - 1.3);
    const panelHeight = THREE.MathUtils.clamp(wallHeight - 0.88, 3.9, 4.6);
    const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(panelWidth, panelHeight),
        new THREE.MeshBasicMaterial({
            map: getLorienManifestoWallTexture(),
            transparent: true,
            toneMapped: false,
            side: THREE.DoubleSide,
            alphaTest: 0.035,
        })
    );
    panel.position.set(
        hallHalfWidth + wallThickness + 0.035,
        panelHeight * 0.5 + 0.38,
        hallMidZ + 0.08
    );
    panel.rotation.y = Math.PI * 0.5;
    panel.renderOrder = 3;
    group.add(panel);
}

function getLorienManifestoWallTexture() {
    if (lorienManifestoWallTexture) {
        return lorienManifestoWallTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 4096;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        lorienManifestoWallTexture = new THREE.CanvasTexture(canvas);
        return lorienManifestoWallTexture;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#211c18';
    ctx.strokeStyle = 'rgba(244, 235, 221, 0.28)';
    ctx.shadowBlur = 0;

    ctx.font =
        '600 188px "Didot", "Bodoni 72", "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif';
    ctx.lineWidth = 10;
    ctx.strokeText('THE ARCHITECT OF', canvas.width * 0.5, 364);
    ctx.fillText('THE ARCHITECT OF', canvas.width * 0.5, 364);

    ctx.font =
        '500 448px "Didot", "Bodoni 72", "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif';
    ctx.lineWidth = 14;
    ctx.strokeText('ABSTRACT', canvas.width * 0.5, 980);
    ctx.fillText('ABSTRACT', canvas.width * 0.5, 980);
    ctx.strokeText('ELEGANCE', canvas.width * 0.5, 1460);
    ctx.fillText('ELEGANCE', canvas.width * 0.5, 1460);

    lorienManifestoWallTexture = new THREE.CanvasTexture(canvas);
    lorienManifestoWallTexture.colorSpace = THREE.SRGBColorSpace;
    lorienManifestoWallTexture.minFilter = THREE.LinearFilter;
    lorienManifestoWallTexture.magFilter = THREE.LinearFilter;
    lorienManifestoWallTexture.generateMipmaps = false;
    lorienManifestoWallTexture.needsUpdate = true;
    return lorienManifestoWallTexture;
}

function addLorienVelmoreGalleryElevator(
    group,
    baseGeometry,
    { layout, trimMaterial, shellMaterial, lightMaterial }
) {
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0xf4f9fc,
        emissive: 0x364049,
        emissiveIntensity: 0.1,
        transparent: true,
        opacity: 0.14,
        roughness: 0.06,
        metalness: 0.12,
    });
    const frameMaterial = trimMaterial.clone();
    frameMaterial.color.setHex(0xdfcfb6);
    frameMaterial.emissive.setHex(0x55402c);
    frameMaterial.emissiveIntensity = 0.14;
    const railMaterial = shellMaterial.clone();
    railMaterial.color.setHex(0x503b2b);
    railMaterial.emissive.setHex(0x20150d);
    railMaterial.emissiveIntensity = 0.18;

    const shaftHeight = layout.lowerLevelCeilingY - layout.chamberDepth + 4.1;
    const shaftCenterY = layout.chamberDepth + shaftHeight * 0.5;
    const wallThickness = 0.08;
    const postSize = 0.12;
    const halfWidth = layout.elevatorWidth * 0.5;
    const halfDepth = layout.elevatorDepth * 0.5;

    [
        { x: -halfWidth, z: -halfDepth },
        { x: halfWidth, z: -halfDepth },
        { x: -halfWidth, z: halfDepth },
        { x: halfWidth, z: halfDepth },
    ].forEach((corner) => {
        addDecorBox(group, baseGeometry, frameMaterial, {
            x: layout.elevatorCenterX + corner.x,
            y: shaftCenterY,
            z: layout.elevatorCenterZ + corner.z,
            width: postSize,
            height: shaftHeight,
            depth: postSize,
        });
    });

    addDecorBox(group, baseGeometry, glassMaterial, {
        x: layout.elevatorCenterX,
        y: shaftCenterY,
        z: layout.elevatorCenterZ - halfDepth,
        width: layout.elevatorWidth - postSize,
        height: shaftHeight,
        depth: wallThickness,
    });
    addDecorBox(group, baseGeometry, glassMaterial, {
        x: layout.elevatorCenterX,
        y: shaftCenterY,
        z: layout.elevatorCenterZ + halfDepth,
        width: layout.elevatorWidth - postSize,
        height: shaftHeight,
        depth: wallThickness,
    });
    addDecorBox(group, baseGeometry, glassMaterial, {
        x: layout.elevatorCenterX - halfWidth,
        y: shaftCenterY,
        z: layout.elevatorCenterZ,
        width: wallThickness,
        height: shaftHeight,
        depth: layout.elevatorDepth - postSize,
    });
    addDecorBox(group, baseGeometry, glassMaterial, {
        x: layout.elevatorCenterX + halfWidth,
        y: shaftCenterY,
        z: layout.elevatorCenterZ,
        width: wallThickness,
        height: shaftHeight,
        depth: layout.elevatorDepth - postSize,
    });

    addDecorBox(group, baseGeometry, frameMaterial, {
        x: layout.elevatorCenterX,
        y: layout.lowerLevelCeilingY + 0.14,
        z: layout.elevatorCenterZ,
        width: layout.elevatorWidth + 0.36,
        height: 0.1,
        depth: layout.elevatorDepth + 0.36,
    });
    addDecorBox(group, baseGeometry, frameMaterial, {
        x: layout.elevatorCenterX,
        y: layout.chamberDepth + 0.12,
        z: layout.elevatorCenterZ,
        width: layout.elevatorWidth + 0.2,
        height: 0.1,
        depth: layout.elevatorDepth + 0.2,
    });

    [-0.34, 0.34].forEach((offsetX) => {
        addDecorBox(group, baseGeometry, railMaterial, {
            x: layout.elevatorCenterX + offsetX,
            y: shaftCenterY,
            z: layout.elevatorCenterZ,
            width: 0.08,
            height: shaftHeight - 0.44,
            depth: 0.08,
        });
    });

    const cabinHeight = 2.34;
    const cabinY = layout.chamberDepth + cabinHeight * 0.5 + 0.24;
    addDecorBox(group, baseGeometry, railMaterial, {
        x: layout.elevatorCenterX,
        y: cabinY,
        z: layout.elevatorCenterZ,
        width: layout.elevatorWidth - 0.32,
        height: cabinHeight,
        depth: layout.elevatorDepth - 0.32,
    });
    addDecorBox(group, baseGeometry, lightMaterial, {
        x: layout.elevatorCenterX,
        y: cabinY,
        z: layout.elevatorCenterZ,
        width: layout.elevatorWidth - 0.72,
        height: cabinHeight - 0.46,
        depth: layout.elevatorDepth - 0.72,
    });
    addDecorBox(group, baseGeometry, frameMaterial, {
        x: layout.elevatorCenterX - halfWidth - 0.26,
        y: 1.06,
        z: layout.elevatorCenterZ,
        width: 0.12,
        height: 0.42,
        depth: 0.26,
    });
    addDecorBox(group, baseGeometry, lightMaterial, {
        x: layout.elevatorCenterX - halfWidth - 0.22,
        y: 1.06,
        z: layout.elevatorCenterZ,
        width: 0.02,
        height: 0.22,
        depth: 0.12,
    });
}

function addLorienVelmoreGallerySupports(
    group,
    baseGeometry,
    { axis, building, passageHeight, shellMaterial, trimMaterial, lightMaterial }
) {
    void axis;
    void passageHeight;

    const layout = getLorienVelmoreGalleryLayout(building);
    if (!layout) {
        return;
    }

    const columnPositions = getLorienVelmoreGalleryColumnPositions(layout);
    const columnWidth = 0.58;
    const columnCoreMaterial = shellMaterial.clone();
    columnCoreMaterial.color.setHex(0xf2ede5);
    columnCoreMaterial.emissive.setHex(0x221b15);
    columnCoreMaterial.emissiveIntensity = 0.05;
    columnCoreMaterial.roughness = 0.42;
    columnCoreMaterial.metalness = 0.06;
    const accentMaterial = trimMaterial.clone();
    accentMaterial.color.setHex(0xc6aa82);
    accentMaterial.emissive.setHex(0x3f2d1d);
    accentMaterial.emissiveIntensity = 0.1;
    accentMaterial.roughness = 0.22;
    accentMaterial.metalness = 0.8;

    columnPositions.forEach((column) => {
        const floorY = sampleLorienGalleryFloorHeightLocal(building, column.x, column.z);
        const columnBaseY = floorY + 0.04;
        const columnTopY = layout.lowerLevelCeilingY;
        const columnHeight = columnTopY - columnBaseY;
        const columnCenterY = columnBaseY + columnHeight * 0.5;
        addDecorBox(group, baseGeometry, columnCoreMaterial, {
            x: column.x,
            y: columnCenterY,
            z: column.z,
            width: columnWidth,
            height: columnHeight,
            depth: columnWidth,
        });
        addDecorBox(group, baseGeometry, trimMaterial, {
            x: column.x,
            y: floorY + 0.12,
            z: column.z,
            width: columnWidth + 0.14,
            height: 0.08,
            depth: columnWidth + 0.14,
        });
        addDecorBox(group, baseGeometry, accentMaterial, {
            x: column.x,
            y: layout.lowerLevelCeilingY - 0.12,
            z: column.z,
            width: columnWidth + 0.14,
            height: 0.08,
            depth: columnWidth + 0.14,
        });
        addDecorBox(group, baseGeometry, accentMaterial, {
            x: column.x,
            y: columnCenterY,
            z: column.z,
            width: columnWidth - 0.12,
            height: columnHeight - 0.76,
            depth: 0.06,
        });
        addDecorBox(group, baseGeometry, lightMaterial, {
            x: column.x,
            y: columnCenterY,
            z: column.z,
            width: 0.028,
            height: Math.max(1.8, columnHeight - 1.24),
            depth: columnWidth - 0.24,
        });
    });
}

function addLorienVelmoreGalleryDisplays(
    group,
    { axis, building, passageWidth, passageHeight, shellMaterial, trimMaterial }
) {
    const layout = getLorienVelmoreGalleryLayout(building);
    if (!layout) {
        return;
    }

    void axis;
    void passageWidth;
    void passageHeight;
    void shellMaterial;
    void trimMaterial;

    const artGlowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffecd1,
        transparent: true,
        opacity: 0.11,
        toneMapped: false,
    });
    const wallArtworkHeight = 2.12;

    const wallDisplayX = layout.hallHalfWidth - 0.12;
    const wallDisplayOffsets = [-3.15, 0, 3.15].map((offset) =>
        THREE.MathUtils.clamp(
            layout.hallStartZ + layout.hallHalfDepth + offset,
            layout.hallStartZ + 1.8,
            layout.hallEndZ - 1.8
        )
    );
    const displayPositions = [];
    wallDisplayOffsets.forEach((zOffset, index) => {
        displayPositions.push({
            x: -wallDisplayX,
            z: zOffset,
            facing: Math.PI / 2,
            artworkUrl: LORIEN_VELMORE_GALLERY_ARTWORK_URLS[index],
        });
        displayPositions.push({
            x: wallDisplayX,
            z: zOffset,
            facing: -Math.PI / 2,
            artworkUrl: LORIEN_VELMORE_GALLERY_ARTWORK_URLS[index + 3],
        });
    });

    displayPositions.forEach((display) => {
        const artworkDimensions = getLorienGalleryArtworkDisplayDimensions(
            display.artworkUrl,
            wallArtworkHeight
        );
        const artworkGroup = new THREE.Group();
        artworkGroup.position.set(display.x, 1.94, display.z);
        artworkGroup.rotation.y = display.facing;

        const artMaterial = new THREE.MeshBasicMaterial({
            map: getLorienGalleryArtworkTexture(display.artworkUrl),
            toneMapped: false,
        });
        const artFront = new THREE.Mesh(
            new THREE.PlaneGeometry(artworkDimensions.width, artworkDimensions.height),
            artMaterial
        );
        artFront.position.z = 0.026;
        artworkGroup.add(artFront);

        const glow = new THREE.Mesh(
            new THREE.PlaneGeometry(
                artworkDimensions.width + 0.18,
                artworkDimensions.height + 0.18
            ),
            artGlowMaterial
        );
        glow.position.z = 0.02;
        artworkGroup.add(glow);

        group.add(artworkGroup);
    });

    const rearVideoDisplay = createLorienVelmoreGalleryRearVideoDisplay(building, layout);
    group.add(rearVideoDisplay.group);
    if (!Array.isArray(group.userData.lorienVelmoreVideoDisplays)) {
        group.userData.lorienVelmoreVideoDisplays = [];
    }
    group.userData.lorienVelmoreVideoDisplays.push(rearVideoDisplay.controller);
}

function createLorienVelmoreGalleryRearVideoDisplay(building, layout) {
    const frameWidth = THREE.MathUtils.clamp(layout.hallHalfWidth * 1.38, 5.4, 6.6);
    const screenWidth = Math.min(frameWidth, layout.hallHalfWidth * 2 - 1.4);
    const screenHeight = screenWidth / (16 / 9);
    const shellDepth = 0.18;
    const framePadding = 0.18;
    const screenCenterY = THREE.MathUtils.clamp(
        layout.lowerLevelCeilingY * 0.57,
        screenHeight * 0.5 + 0.72,
        layout.lowerLevelCeilingY - screenHeight * 0.5 - 0.38
    );
    const screenWorldX = Number(building?.x) || 0;
    const screenWorldY = screenCenterY;
    const screenWorldZ = (Number(building?.z) || 0) + layout.hallEndZ - 0.08;

    const group = new THREE.Group();
    group.position.set(0, screenCenterY, layout.hallEndZ - 0.08);
    group.rotation.y = Math.PI;

    const shellMaterial = new THREE.MeshStandardMaterial({
        color: 0x12161d,
        emissive: 0x090c11,
        emissiveIntensity: 0.18,
        roughness: 0.34,
        metalness: 0.72,
    });
    const shell = new THREE.Mesh(
        new THREE.BoxGeometry(
            screenWidth + framePadding * 2,
            screenHeight + framePadding * 2,
            shellDepth
        ),
        shellMaterial
    );
    shell.position.z = shellDepth * 0.5;
    group.add(shell);

    const trimMaterial = new THREE.MeshBasicMaterial({
        color: 0xc9ac84,
        transparent: true,
        opacity: 0.9,
        toneMapped: false,
    });
    const topTrim = new THREE.Mesh(
        new THREE.BoxGeometry(screenWidth * 0.92, 0.06, 0.04),
        trimMaterial
    );
    topTrim.position.set(0, screenHeight * 0.5 + 0.12, shellDepth + 0.01);
    group.add(topTrim);

    const bottomTrim = new THREE.Mesh(
        new THREE.BoxGeometry(screenWidth * 0.86, 0.05, 0.04),
        trimMaterial
    );
    bottomTrim.position.set(0, -(screenHeight * 0.5 + 0.1), shellDepth + 0.01);
    group.add(bottomTrim);

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.loop = true;
    video.crossOrigin = 'anonymous';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.src = LORIEN_VELMORE_GALLERY_VIDEO_URL;
    video.load();

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    const screenMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xf6f0e3,
        transparent: true,
        opacity: 0.06,
        toneMapped: false,
    });
    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(screenWidth, screenHeight),
        screenMaterial
    );
    screen.position.z = shellDepth + 0.018;
    group.add(screen);

    const overlayMaterial = new THREE.MeshBasicMaterial({
        color: 0x04070a,
        transparent: true,
        opacity: 0.72,
        toneMapped: false,
    });
    const overlay = new THREE.Mesh(
        new THREE.PlaneGeometry(screenWidth + 0.02, screenHeight + 0.02),
        overlayMaterial
    );
    overlay.position.z = shellDepth + 0.024;
    group.add(overlay);

    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffebc9,
        transparent: true,
        opacity: 0.03,
        depthWrite: false,
        toneMapped: false,
    });
    const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(screenWidth * 1.06, screenHeight * 1.08),
        glowMaterial
    );
    glow.position.z = shellDepth + 0.008;
    group.add(glow);

    const displayState = {
        videoElement: video,
        worldX: screenWorldX,
        worldY: screenWorldY,
        worldZ: screenWorldZ,
        playbackDelayMs: LORIEN_VELMORE_GALLERY_VIDEO_PLAYBACK_DELAY_MS,
        isPlayerInside: false,
        isPlaybackPending: false,
        isPlaybackActive: false,
    };
    lorienVelmoreGalleryVideoDisplayState = displayState;

    let pendingStartAtMs = -Infinity;
    let lastPlayAttemptTime = -Infinity;

    const syncVisualState = () => {
        screenMaterial.opacity = displayState.isPlaybackActive
            ? 1
            : displayState.isPlaybackPending
              ? 0.14
              : 0.06;
        overlayMaterial.opacity = displayState.isPlaybackActive
            ? 0.02
            : displayState.isPlaybackPending
              ? 0.54
              : 0.72;
        glowMaterial.opacity = displayState.isPlaybackActive
            ? 0.22
            : displayState.isPlaybackPending
              ? 0.07
              : 0.03;
    };

    const tryPlay = () => {
        const now = performance.now();
        if (now - lastPlayAttemptTime < 900) {
            return;
        }
        lastPlayAttemptTime = now;
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
        }
    };

    const resetVideo = () => {
        if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
            return;
        }
        try {
            video.currentTime = 0;
        } catch {
            // Ignore seek failures while metadata is still settling.
        }
    };

    const setPlaybackActive = (nextActive) => {
        const resolvedActive = Boolean(nextActive);
        if (resolvedActive === displayState.isPlaybackActive) {
            if (displayState.isPlaybackActive && video.paused) {
                tryPlay();
            }
            syncVisualState();
            return;
        }

        displayState.isPlaybackActive = resolvedActive;
        if (displayState.isPlaybackActive) {
            displayState.isPlaybackPending = false;
            resetVideo();
            tryPlay();
        } else {
            video.pause();
            resetVideo();
        }
        syncVisualState();
    };

    video.addEventListener('loadeddata', () => {
        if (displayState.isPlaybackActive) {
            resetVideo();
            tryPlay();
        }
    });
    video.addEventListener('canplay', () => {
        if (displayState.isPlaybackActive && video.paused) {
            tryPlay();
        }
    });

    syncVisualState();

    return {
        group,
        controller: {
            building,
            updatePresence(nextInside, now = performance.now()) {
                const resolvedInside = Boolean(nextInside);
                displayState.isPlayerInside = resolvedInside;

                if (!resolvedInside) {
                    pendingStartAtMs = -Infinity;
                    displayState.isPlaybackPending = false;
                    setPlaybackActive(false);
                    return;
                }

                if (displayState.isPlaybackActive) {
                    if (video.paused) {
                        tryPlay();
                    }
                    syncVisualState();
                    return;
                }

                if (!displayState.isPlaybackPending) {
                    displayState.isPlaybackPending = true;
                    pendingStartAtMs = now + LORIEN_VELMORE_GALLERY_VIDEO_PLAYBACK_DELAY_MS;
                    syncVisualState();
                    return;
                }

                if (now >= pendingStartAtMs) {
                    setPlaybackActive(true);
                    return;
                }

                syncVisualState();
            },
        },
    };
}

function sampleLorienGalleryFloorHeightLocal(building, localX, localZ) {
    return resolveLorienVelmoreGalleryFloorHeightLocal(building, localX, localZ);
}

function getLorienGalleryArtworkDisplayDimensions(artworkUrl, targetHeight = 2.12) {
    const safeHeight = Math.max(0.2, Number(targetHeight) || 2.12);
    const aspectRatio = LORIEN_VELMORE_GALLERY_ARTWORK_ASPECT_RATIOS[artworkUrl] || 864 / 1130;
    return {
        width: safeHeight * aspectRatio,
        height: safeHeight,
    };
}

function updateLorienVelmoreGalleryVideoDisplays(videoDisplays, playerPosition) {
    const playerX = Number(playerPosition?.x) || 0;
    const playerY = Number(playerPosition?.y) || 0;
    const playerZ = Number(playerPosition?.z) || 0;
    const now = performance.now();

    videoDisplays.forEach((displayController) => {
        if (!displayController || typeof displayController.updatePresence !== 'function') {
            return;
        }
        displayController.updatePresence(
            isInsideLorienVelmoreGalleryRoomWorld(
                playerX,
                playerY,
                playerZ,
                displayController.building,
                0.18
            ),
            now
        );
    });
}

function getLorienGalleryArtworkTexture(artworkUrl) {
    const resolvedArtworkUrl = String(artworkUrl || '').trim();
    if (!resolvedArtworkUrl) {
        return null;
    }

    const cachedTexture = lorienGalleryArtworkTextureCache.get(resolvedArtworkUrl);
    if (cachedTexture) {
        return cachedTexture;
    }

    const texture = lorienGalleryArtworkTextureLoader.load(resolvedArtworkUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    lorienGalleryArtworkTextureCache.set(resolvedArtworkUrl, texture);
    return texture;
}

function getLorienDoorShatterTexture(variantIndex = 0) {
    const resolvedVariantIndex = THREE.MathUtils.euclideanModulo(
        Math.round(Number(variantIndex) || 0),
        LORIEN_DOOR_SHATTER_VARIANT_COUNT
    );
    if (!Array.isArray(lorienDoorShatterTextures)) {
        lorienDoorShatterTextures = new Array(LORIEN_DOOR_SHATTER_VARIANT_COUNT).fill(null);
    }
    if (lorienDoorShatterTextures[resolvedVariantIndex]) {
        return lorienDoorShatterTextures[resolvedVariantIndex];
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        const fallbackTexture = new THREE.CanvasTexture(canvas);
        lorienDoorShatterTextures[resolvedVariantIndex] = fallbackTexture;
        return fallbackTexture;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawLorienDoorShatterVariant(ctx, canvas, resolvedVariantIndex);

    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 22; i += 1) {
        const shardX =
            seededLorienDoorVariantValue(resolvedVariantIndex, 200 + i * 3) * canvas.width;
        const shardY =
            seededLorienDoorVariantValue(resolvedVariantIndex, 201 + i * 3) * canvas.height;
        const shardRadius =
            10 + seededLorienDoorVariantValue(resolvedVariantIndex, 202 + i * 3) * 26;
        const gradient = ctx.createRadialGradient(shardX, shardY, 0, shardX, shardY, shardRadius);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.92)');
        gradient.addColorStop(0.72, 'rgba(0, 0, 0, 0.36)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(shardX, shardY, shardRadius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    texture.needsUpdate = true;
    lorienDoorShatterTextures[resolvedVariantIndex] = texture;
    return texture;
}

function drawLorienDoorShatterVariant(ctx, canvas, variantIndex) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    switch (variantIndex) {
        case 1:
            drawLorienDoorDiagonalShearCrack(ctx, canvas, variantIndex);
            break;
        case 2:
            drawLorienDoorTwinImpactCrack(ctx, canvas, variantIndex);
            break;
        case 3:
            drawLorienDoorEdgeFanCrack(ctx, canvas, variantIndex);
            break;
        default:
            drawLorienDoorStarburstCrack(ctx, canvas, variantIndex);
            break;
    }
}

function drawLorienDoorStarburstCrack(ctx, canvas, variantIndex) {
    const centerX = canvas.width * 0.28;
    const centerY = canvas.height * 0.3;
    const ringRadius = canvas.width * 0.16;
    ctx.strokeStyle = 'rgba(215, 232, 248, 0.9)';

    for (let rayIndex = 0; rayIndex < 17; rayIndex += 1) {
        const angleBase = (Math.PI * 2 * rayIndex) / 17;
        const angleJitter = (seededLorienDoorVariantValue(variantIndex, rayIndex + 1) - 0.5) * 0.42;
        const startRadius =
            ringRadius * (0.28 + seededLorienDoorVariantValue(variantIndex, 30 + rayIndex) * 0.46);
        const startX = centerX + Math.cos(angleBase + angleJitter) * startRadius;
        const startY = centerY + Math.sin(angleBase + angleJitter) * startRadius;
        ctx.lineWidth = 2.2 + seededLorienDoorVariantValue(variantIndex, 60 + rayIndex) * 2.5;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        let currentX = startX;
        let currentY = startY;
        for (let segmentIndex = 0; segmentIndex < 3; segmentIndex += 1) {
            const branchAngle =
                angleBase +
                angleJitter +
                (seededLorienDoorVariantValue(variantIndex, 90 + rayIndex * 4 + segmentIndex) -
                    0.5) *
                    0.7;
            const branchLength =
                38 +
                seededLorienDoorVariantValue(variantIndex, 120 + rayIndex * 4 + segmentIndex) * 62;
            currentX += Math.cos(branchAngle) * branchLength;
            currentY += Math.sin(branchAngle) * branchLength;
            ctx.lineTo(currentX, currentY);
        }
        ctx.stroke();
    }

    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(230, 240, 248, 0.46)';
    for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
        ctx.beginPath();
        ctx.arc(
            centerX,
            centerY,
            ringRadius * (0.88 + ringIndex * 0.2),
            Math.PI * (0.18 + ringIndex * 0.14),
            Math.PI * (1.22 + ringIndex * 0.18)
        );
        ctx.stroke();
    }
}

function drawLorienDoorDiagonalShearCrack(ctx, canvas, variantIndex) {
    const startX = canvas.width * 0.1;
    const startY = canvas.height * 0.18;
    const endX = canvas.width * 0.88;
    const endY = canvas.height * 0.82;
    ctx.strokeStyle = 'rgba(228, 238, 248, 0.92)';
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(canvas.width * 0.34, canvas.height * 0.32);
    ctx.lineTo(canvas.width * 0.56, canvas.height * 0.46);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    for (let branchIndex = 0; branchIndex < 13; branchIndex += 1) {
        const t = 0.08 + (branchIndex / 12) * 0.84;
        const pivotX = THREE.MathUtils.lerp(startX, endX, t);
        const pivotY = THREE.MathUtils.lerp(startY, endY, t);
        const direction = branchIndex % 2 === 0 ? -1 : 1;
        const angle =
            Math.PI * 0.5 * direction +
            (seededLorienDoorVariantValue(variantIndex, 200 + branchIndex) - 0.5) * 0.48;
        const length = 32 + seededLorienDoorVariantValue(variantIndex, 220 + branchIndex) * 86;
        ctx.lineWidth = 1.8 + seededLorienDoorVariantValue(variantIndex, 240 + branchIndex) * 2;
        ctx.beginPath();
        ctx.moveTo(pivotX, pivotY);
        ctx.lineTo(pivotX + Math.cos(angle) * length, pivotY + Math.sin(angle) * length);
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(216, 229, 242, 0.38)';
    ctx.lineWidth = 1.2;
    for (let seamIndex = 0; seamIndex < 5; seamIndex += 1) {
        const seamX = canvas.width * (0.22 + seamIndex * 0.12);
        ctx.beginPath();
        ctx.moveTo(seamX, canvas.height * 0.08);
        ctx.lineTo(seamX + canvas.width * 0.06, canvas.height * 0.2);
        ctx.stroke();
    }
}

function drawLorienDoorTwinImpactCrack(ctx, canvas, variantIndex) {
    const impacts = [
        { x: canvas.width * 0.28, y: canvas.height * 0.58, radius: canvas.width * 0.1 },
        { x: canvas.width * 0.72, y: canvas.height * 0.42, radius: canvas.width * 0.09 },
    ];
    ctx.strokeStyle = 'rgba(224, 236, 247, 0.9)';
    impacts.forEach((impact, impactIndex) => {
        for (let rayIndex = 0; rayIndex < 9; rayIndex += 1) {
            const angle =
                (Math.PI * 2 * rayIndex) / 9 +
                seededLorienDoorVariantValue(variantIndex, 300 + impactIndex * 20 + rayIndex) *
                    0.34;
            const startX = impact.x + Math.cos(angle) * impact.radius * 0.34;
            const startY = impact.y + Math.sin(angle) * impact.radius * 0.34;
            const length =
                28 +
                seededLorienDoorVariantValue(variantIndex, 330 + impactIndex * 20 + rayIndex) * 58;
            ctx.lineWidth = 1.8 + seededLorienDoorVariantValue(variantIndex, 360 + rayIndex) * 2;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(startX + Math.cos(angle) * length, startY + Math.sin(angle) * length);
            ctx.stroke();
        }
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = 'rgba(240, 246, 250, 0.4)';
        ctx.beginPath();
        ctx.arc(impact.x, impact.y, impact.radius, Math.PI * 0.1, Math.PI * 1.8);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(224, 236, 247, 0.9)';
    });

    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(impacts[0].x + 12, impacts[0].y - 18);
    ctx.lineTo(canvas.width * 0.46, canvas.height * 0.5);
    ctx.lineTo(impacts[1].x - 10, impacts[1].y + 12);
    ctx.stroke();
}

function drawLorienDoorEdgeFanCrack(ctx, canvas, variantIndex) {
    const originX = canvas.width * 0.48;
    const originY = canvas.height * 0.86;
    ctx.strokeStyle = 'rgba(220, 234, 246, 0.9)';

    for (let fanIndex = 0; fanIndex < 14; fanIndex += 1) {
        const angle =
            -Math.PI * 0.78 +
            (fanIndex / 13) * Math.PI * 0.62 +
            (seededLorienDoorVariantValue(variantIndex, 400 + fanIndex) - 0.5) * 0.14;
        const length = 54 + seededLorienDoorVariantValue(variantIndex, 430 + fanIndex) * 114;
        ctx.lineWidth = 2 + seededLorienDoorVariantValue(variantIndex, 460 + fanIndex) * 2.2;
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(originX + Math.cos(angle) * length, originY + Math.sin(angle) * length);
        ctx.stroke();
    }

    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.18, canvas.height * 0.92);
    ctx.lineTo(canvas.width * 0.42, canvas.height * 0.8);
    ctx.lineTo(canvas.width * 0.8, canvas.height * 0.88);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(238, 245, 250, 0.34)';
    ctx.lineWidth = 1.2;
    for (let arcIndex = 0; arcIndex < 4; arcIndex += 1) {
        ctx.beginPath();
        ctx.arc(
            originX,
            originY,
            canvas.width * (0.16 + arcIndex * 0.08),
            -Math.PI * 0.9,
            -Math.PI * 0.24
        );
        ctx.stroke();
    }
}

function seededLorienDoorVariantValue(variantIndex, seed) {
    const value = Math.sin((variantIndex + 1) * 91.173 + seed * 17.371) * 43758.5453123;
    return value - Math.floor(value);
}

function getLorienScorchTexture() {
    if (lorienScorchTexture) {
        return lorienScorchTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        lorienScorchTexture = new THREE.CanvasTexture(canvas);
        return lorienScorchTexture;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const centerX = canvas.width * 0.5;
    const centerY = canvas.height * 0.5;
    const outerGradient = ctx.createRadialGradient(centerX, centerY, 18, centerX, centerY, 176);
    outerGradient.addColorStop(0, 'rgba(10, 8, 8, 0.88)');
    outerGradient.addColorStop(0.24, 'rgba(18, 14, 12, 0.78)');
    outerGradient.addColorStop(0.56, 'rgba(24, 18, 16, 0.42)');
    outerGradient.addColorStop(1, 'rgba(24, 18, 16, 0)');
    ctx.fillStyle = outerGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 176, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 14; i += 1) {
        const smudgeX = centerX + (Math.random() - 0.5) * 130;
        const smudgeY = centerY + (Math.random() - 0.5) * 130;
        const smudgeRadius = 16 + Math.random() * 36;
        const fade = ctx.createRadialGradient(smudgeX, smudgeY, 0, smudgeX, smudgeY, smudgeRadius);
        fade.addColorStop(0, 'rgba(0, 0, 0, 0.34)');
        fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = fade;
        ctx.beginPath();
        ctx.arc(smudgeX, smudgeY, smudgeRadius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    lorienScorchTexture = new THREE.CanvasTexture(canvas);
    lorienScorchTexture.colorSpace = THREE.SRGBColorSpace;
    lorienScorchTexture.anisotropy = 2;
    lorienScorchTexture.needsUpdate = true;
    return lorienScorchTexture;
}

function segmentImpactExpandedAabbXZ({
    startX = 0,
    startZ = 0,
    endX = 0,
    endZ = 0,
    minX = 0,
    maxX = 0,
    minZ = 0,
    maxZ = 0,
} = {}) {
    if (
        ![startX, startZ, endX, endZ, minX, maxX, minZ, maxZ].every(Number.isFinite) ||
        minX > maxX ||
        minZ > maxZ
    ) {
        return null;
    }

    const dirX = endX - startX;
    const dirZ = endZ - startZ;
    let tMin = 0;
    let tMax = 1;
    let hitNormalX = 0;
    let hitNormalZ = 0;

    if (Math.abs(dirX) <= 1e-8) {
        if (startX < minX || startX > maxX) {
            return null;
        }
    } else {
        const invX = 1 / dirX;
        let tx1 = (minX - startX) * invX;
        let tx2 = (maxX - startX) * invX;
        let nearNormalX = -1;
        if (tx1 > tx2) {
            [tx1, tx2] = [tx2, tx1];
            nearNormalX = 1;
        }
        if (tx1 > tMin) {
            tMin = tx1;
            hitNormalX = nearNormalX;
            hitNormalZ = 0;
        }
        tMax = Math.min(tMax, tx2);
        if (tMin > tMax) {
            return null;
        }
    }

    if (Math.abs(dirZ) <= 1e-8) {
        if (startZ < minZ || startZ > maxZ) {
            return null;
        }
    } else {
        const invZ = 1 / dirZ;
        let tz1 = (minZ - startZ) * invZ;
        let tz2 = (maxZ - startZ) * invZ;
        let nearNormalZ = -1;
        if (tz1 > tz2) {
            [tz1, tz2] = [tz2, tz1];
            nearNormalZ = 1;
        }
        if (tz1 > tMin) {
            tMin = tz1;
            hitNormalX = 0;
            hitNormalZ = nearNormalZ;
        }
        tMax = Math.min(tMax, tz2);
        if (tMin > tMax) {
            return null;
        }
    }

    if (tMin < 0 || tMin > 1) {
        return null;
    }

    return {
        t: tMin,
        x: startX + dirX * tMin,
        z: startZ + dirZ * tMin,
        normalX: hitNormalX,
        normalZ: hitNormalZ,
    };
}
