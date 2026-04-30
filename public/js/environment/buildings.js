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
    LORIEN_VELMORE_GALLERY_SURFACE_OFFSET,
    getLorienVelmoreGalleryLayout as resolveLorienVelmoreGalleryLayout,
    isInsideLorienVelmoreGalleryRoomWorld,
    sampleLorienVelmoreGalleryFloorHeightLocal as resolveLorienVelmoreGalleryFloorHeightLocal,
    setLorienVelmoreGalleryDoorOpenAmount,
} from './lorien-gallery.js';

const SPECIAL_BUILDING_VARIANTS = new Map([
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
const LORIEN_VELMORE_GALLERY_VIDEO_URL = '/assets/Lorienvelmore/lorien_video.mp4';
const LORIEN_VELMORE_GALLERY_VIDEO_PLAYBACK_DELAY_MS = 2000;
const lorienGalleryArtworkTextureLoader = new THREE.TextureLoader();
const lorienGalleryArtworkTextureCache = new Map();
let lorienVelmoreGalleryVideoDisplayState = null;

export function getLorienVelmoreGalleryVideoDisplayState() {
    return lorienVelmoreGalleryVideoDisplayState;
}

export function createBuildingLayer() {
    const layer = new THREE.Group();
    layer.userData.lorienVelmoreDoorSystems = [];
    layer.userData.lorienVelmoreAccentMaterials = [];
    layer.userData.lorienVelmoreVideoDisplays = [];
    lorienVelmoreGalleryVideoDisplayState = null;
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
            const lorienDoorSystem = driveThroughMesh.userData?.lorienVelmoreDoorSystem || null;
            const lorienAccentMaterials =
                driveThroughMesh.userData?.lorienVelmoreAccentMaterials || null;
            const lorienVideoDisplays =
                driveThroughMesh.userData?.lorienVelmoreVideoDisplays || null;
            if (lorienDoorSystem) {
                layer.userData.lorienVelmoreDoorSystems.push(lorienDoorSystem);
            }
            if (Array.isArray(lorienAccentMaterials) && lorienAccentMaterials.length > 0) {
                layer.userData.lorienVelmoreAccentMaterials.push(...lorienAccentMaterials);
            }
            if (Array.isArray(lorienVideoDisplays) && lorienVideoDisplays.length > 0) {
                layer.userData.lorienVelmoreVideoDisplays.push(...lorienVideoDisplays);
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
    if (Array.isArray(accentMaterials) && accentMaterials.length > 0) {
        updateLorienVelmoreAccentMaterials(accentMaterials);
    }
    if (Array.isArray(videoDisplays) && videoDisplays.length > 0) {
        updateLorienVelmoreGalleryVideoDisplays(videoDisplays, playerPosition);
    }

    if (!Array.isArray(doorSystems) || doorSystems.length === 0) {
        setLorienVelmoreGalleryDoorOpenAmount(0);
        return;
    }

    const resolvedDelta = Math.max(1 / 240, Number(frameDelta) || 1 / 60);
    let maxOpenAmount = 0;
    doorSystems.forEach((doorSystem) => {
        updateLorienVelmoreDoorSystem(doorSystem, playerPosition, resolvedDelta);
        maxOpenAmount = Math.max(maxOpenAmount, doorSystem.openAmount || 0);
    });
    setLorienVelmoreGalleryDoorOpenAmount(maxOpenAmount);
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
    const alignedWithOpening = Math.abs(localX) <= doorSystem.sensorHalfWidth;
    const withinHeight = localY <= doorSystem.sensorMaxY;
    const outsideApproach =
        localZ >= doorSystem.doorPlaneZ - doorSystem.outsideSensorDepth &&
        localZ <= doorSystem.doorPlaneZ + 0.8;
    const insideApproach =
        localZ >= doorSystem.doorPlaneZ - 0.12 &&
        localZ <= doorSystem.doorPlaneZ + doorSystem.insideSensorDepth;
    const deeperInside =
        localZ >= doorSystem.doorPlaneZ + doorSystem.autoCloseDepth &&
        localZ <= doorSystem.roomEndZ + 1.2;

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
    doorSystem.leftPanel.position.x = doorSystem.leftClosedX - slideDistance;
    doorSystem.rightPanel.position.x = doorSystem.rightClosedX + slideDistance;

    if (doorSystem.glowMaterial) {
        doorSystem.glowMaterial.opacity = 0.22 + doorSystem.openAmount * 0.14;
    }
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

function createDriveThroughBuildingMesh(baseGeometry, baseMaterial, building) {
    const variant = resolveSpecialBuildingVariant(building);
    if (!variant) {
        return new THREE.Group();
    }

    const axis = variant.passageAxis === 'z' ? 'z' : 'x';
    const isLuxuryLorien = variant.decorStyle === 'lorienVelmoreLuxury';
    const isGalleryHall = variant.groundLayout === 'galleryHall';
    const transverseSpan = axis === 'x' ? building.depth : building.width;
    const passageWidth = THREE.MathUtils.clamp(variant.passageWidth, 4.8, transverseSpan - 3.6);
    const passageHeight = THREE.MathUtils.clamp(variant.passageHeight, 4.4, building.height - 4.8);
    const sideWingSpan = Math.max(1.4, (transverseSpan - passageWidth) * 0.5);
    const bridgeHeight = Math.max(2.4, building.height - passageHeight);
    const wingOffset = passageWidth * 0.5 + sideWingSpan * 0.5;
    const tintColor = resolveBuildingTintColor(building.tint);
    const shellMaterial =
        isLuxuryLorien && isGalleryHall
            ? new THREE.MeshStandardMaterial({
                  color: 0x161c24,
                  emissive: 0x0c1016,
                  emissiveIntensity: 0.12,
                  roughness: 0.74,
                  metalness: 0.18,
              })
            : baseMaterial.clone();
    if ('vertexColors' in shellMaterial) {
        shellMaterial.vertexColors = false;
    }
    if (!isLuxuryLorien || !isGalleryHall) {
        shellMaterial.color.copy(tintColor);
        shellMaterial.emissive.copy(new THREE.Color(0xa6b7d0).lerp(tintColor, 0.18));
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
        color: isLuxuryLorien && isGalleryHall ? 0xe9e3d8 : isLuxuryLorien ? 0x261e18 : 0x121c28,
        emissive: isLuxuryLorien && isGalleryHall ? 0x1b1713 : isLuxuryLorien ? 0x18110c : 0x0b121a,
        emissiveIntensity: isLuxuryLorien && isGalleryHall ? 0.05 : isLuxuryLorien ? 0.22 : 0.16,
        roughness: isLuxuryLorien && isGalleryHall ? 0.22 : isLuxuryLorien ? 0.62 : 0.94,
        metalness: isLuxuryLorien && isGalleryHall ? 0.04 : isLuxuryLorien ? 0.08 : 0.04,
        side: THREE.DoubleSide,
    });
    const innerWallMaterial = new THREE.MeshStandardMaterial({
        color: isLuxuryLorien ? 0x1c1816 : 0x172333,
        emissive: isLuxuryLorien ? 0x14100d : 0x111a24,
        emissiveIntensity: isLuxuryLorien ? 0.16 : 0.12,
        roughness: isLuxuryLorien ? 0.58 : 0.92,
        metalness: isLuxuryLorien ? 0.1 : 0.03,
    });
    const lorienTrimMaterial = new THREE.MeshStandardMaterial({
        color: 0xc9ac84,
        emissive: 0x43301d,
        emissiveIntensity: 0.16,
        roughness: 0.28,
        metalness: 0.86,
    });
    const lorienLightMaterial = new THREE.MeshBasicMaterial({
        color: 0xffefcb,
        transparent: true,
        opacity: 0.88,
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

    if (isGalleryHall) {
        addLorienVelmoreTowerFacade(group, baseGeometry, {
            building,
            towerBaseY: passageHeight,
            towerHeight: bridgeHeight,
            trimMaterial: lorienTrimMaterial,
            lightMaterial: lorienLightMaterial,
        });
    }

    const passageFloor = isGalleryHall
        ? createGalleryHallFloorMesh(building, passageSurfaceMaterial)
        : new THREE.Mesh(
              new THREE.PlaneGeometry(
                  axis === 'x' ? building.width - 0.5 : passageWidth - 0.55,
                  axis === 'x' ? passageWidth - 0.55 : building.depth - 0.5
              ),
              passageSurfaceMaterial
          );
    if (!isGalleryHall) {
        passageFloor.rotation.x = -Math.PI / 2;
        passageFloor.position.y = 0.028;
    }
    group.add(passageFloor);

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
    if (isLuxuryLorien && !isGalleryHall) {
        addLorienVelmoreLuxuryPassageDecor(group, baseGeometry, {
            axis,
            building,
            passageWidth,
            passageHeight,
            isGalleryHall,
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
    }

    if (lorienDoorSystem) {
        group.userData.lorienVelmoreDoorSystem = lorienDoorSystem;
    }

    return group;
}

function addDriveThroughBuildingObstacles(building, variant) {
    const axis = variant.passageAxis === 'z' ? 'z' : 'x';
    if (variant.groundLayout === 'galleryHall') {
        addGalleryHallObstacles(building, variant, axis);
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
        addDecorBox(group, baseGeometry, trimMaterial, {
            x: 0,
            y: 0.032,
            z: 0,
            width: axis === 'x' ? runnerLength + 0.18 : runnerWidth + 0.18,
            height: 0.014,
            depth: axis === 'x' ? runnerWidth + 0.18 : runnerLength + 0.18,
        });
        addDecorBox(group, baseGeometry, runnerMaterial, {
            x: 0,
            y: 0.042,
            z: 0,
            width: axis === 'x' ? runnerLength : runnerWidth,
            height: 0.012,
            depth: axis === 'x' ? runnerWidth : runnerLength,
        });

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
        const offset =
            -totalLength * 0.5 + segmentLength * 0.5 + i * (segmentLength + resolvedGap);
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

function clamp01(value) {
    return THREE.MathUtils.clamp(value, 0, 1);
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

    addDecorBox(leaf, baseGeometry, frameMaterial, {
        x: -width * 0.5 + stileWidth * 0.5,
        y: height * 0.5,
        z: 0,
        width: stileWidth,
        height,
        depth: 0.08,
    });
    addDecorBox(leaf, baseGeometry, frameMaterial, {
        x: width * 0.5 - stileWidth * 0.5,
        y: height * 0.5,
        z: 0,
        width: stileWidth,
        height,
        depth: 0.08,
    });
    addDecorBox(leaf, baseGeometry, frameMaterial, {
        x: 0,
        y: height - railHeight * 0.5,
        z: 0,
        width: width,
        height: railHeight,
        depth: 0.08,
    });
    addDecorBox(leaf, baseGeometry, frameMaterial, {
        x: 0,
        y: railHeight * 0.5,
        z: 0,
        width: width,
        height: railHeight,
        depth: 0.08,
    });
    addDecorBox(leaf, baseGeometry, glassMaterial, {
        x: 0,
        y: height * 0.5,
        z: 0,
        width: width - 0.16,
        height: height - 0.22,
        depth: 0.02,
    });
    addDecorBox(leaf, baseGeometry, glowMaterial, {
        x: 0,
        y: height * 0.5,
        z: -0.01,
        width: width - 0.3,
        height: height - 0.36,
        depth: 0.01,
    });

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

    const columnSize = 0.62;
    const columnPositions = getLorienVelmoreGalleryColumnPositions(layout);
    columnPositions.forEach((column) => {
        addObstacleAabb(
            building.x + column.x,
            building.z + column.z,
            columnSize,
            columnSize,
            0.12,
            'building'
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
            'building'
        );
    });

    addObstacleAabb(
        building.x,
        building.z + layout.hallEndZ + collisionBandThickness * 0.5 - collisionInset,
        layout.hallHalfWidth * 2 + collisionBandThickness * 2 - collisionInset * 2,
        collisionBandThickness,
        0.04,
        'building'
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
                'building'
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
            'building'
        );
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
    addDecorBox(group, baseGeometry, bronzeMaterial, {
        x: 0,
        y: 0.024,
        z: exteriorApronZ,
        width: frontOpeningHalfWidth * 2 + 1.08,
        height: 0.016,
        depth: exteriorApronDepth,
    });
    addDecorBox(group, baseGeometry, floorFieldMaterial, {
        x: 0,
        y: 0.036,
        z: exteriorApronZ,
        width: frontOpeningHalfWidth * 2 + 0.84,
        height: 0.018,
        depth: exteriorApronDepth - 0.16,
    });
    addDecorBox(group, baseGeometry, bronzeMaterial, {
        x: 0,
        y: 0.034,
        z: layout.hallStartZ + 0.18,
        width: frontOpeningHalfWidth * 2 + 0.32,
        height: 0.016,
        depth: 0.32,
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
    leftDoorPanel.position.set(-doorClosedOffsetX, 0.05, doorPlaneZ);
    group.add(leftDoorPanel);

    const rightDoorPanel = createLorienVelmoreDoorLeaf(baseGeometry, {
        width: doorPanelWidth,
        height: doorHeight,
        frameMaterial: doorFrameMaterial,
        glassMaterial: doorGlassMaterial,
        glowMaterial: doorGlowMaterial,
    });
    rightDoorPanel.position.set(doorClosedOffsetX, 0.05, doorPlaneZ);
    group.add(rightDoorPanel);

    addDecorBox(group, baseGeometry, doorFrameMaterial, {
        x: 0,
        y: entryFrameHeight - 0.28,
        z: doorPlaneZ + 0.03,
        width: frontOpeningHalfWidth * 2 + 0.46,
        height: 0.06,
        depth: 0.14,
    });

    return {
        centerX: layout.centerX,
        centerZ: layout.centerZ,
        roomEndZ: layout.hallEndZ,
        doorPlaneZ,
        leftPanel: leftDoorPanel,
        rightPanel: rightDoorPanel,
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
        glowMaterial: doorGlowMaterial,
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

    bedConfigs.push({
        x: 0,
        z: backBedZ,
        width: building.width - 1.76,
        depth: backBedDepth,
    });

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
    const artworkAspectRatio = 0.755;
    const wallArtworkHeight = 2.12;
    const wallArtworkWidth = wallArtworkHeight * artworkAspectRatio;
    const wallArtworkGlowHeight = wallArtworkHeight + 0.18;
    const wallArtworkGlowWidth = wallArtworkWidth + 0.18;

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
        const artworkGroup = new THREE.Group();
        artworkGroup.position.set(display.x, 1.94, display.z);
        artworkGroup.rotation.y = display.facing;

        const artMaterial = new THREE.MeshBasicMaterial({
            map: getLorienGalleryArtworkTexture(display.artworkUrl),
            toneMapped: false,
        });
        const artFront = new THREE.Mesh(
            new THREE.PlaneGeometry(wallArtworkWidth, wallArtworkHeight),
            artMaterial
        );
        artFront.position.z = 0.026;
        artworkGroup.add(artFront);

        const glow = new THREE.Mesh(
            new THREE.PlaneGeometry(wallArtworkGlowWidth, wallArtworkGlowHeight),
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
                    pendingStartAtMs =
                        now + LORIEN_VELMORE_GALLERY_VIDEO_PLAYBACK_DELAY_MS;
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

function createGalleryHallFloorMesh(building, material) {
    const layout = getLorienVelmoreGalleryLayout(building);
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(building.width - 0.5, building.depth - 0.5),
        material
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = LORIEN_VELMORE_GALLERY_SURFACE_OFFSET;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
}

function sampleLorienGalleryFloorHeightLocal(building, localX, localZ) {
    return resolveLorienVelmoreGalleryFloorHeightLocal(building, localX, localZ);
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
