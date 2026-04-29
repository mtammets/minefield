import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { BUILDING_DISTRICT_RADIUS, CITY_GRID_RANGE, CITY_GRID_SPACING } from './config.js';
import { worldBounds, doesRectOverlapCentralParkingLot } from './layout.js';
import { randomFromGrid } from './grid-noise.js';
import { addObstacleAabb } from './obstacles.js';
import { createBuildingWindowTexture } from './textures.js';

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

export function createBuildingLayer() {
    const layer = new THREE.Group();
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
            layer.add(createDriveThroughBuildingMesh(buildingGeometry, buildingMaterial, building));
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
    const shellMaterial = baseMaterial.clone();
    shellMaterial.vertexColors = false;
    shellMaterial.color.copy(tintColor);
    shellMaterial.emissive.copy(new THREE.Color(0xa6b7d0).lerp(tintColor, 0.18));

    const passageSurfaceMaterial = new THREE.MeshStandardMaterial({
        color: isLuxuryLorien ? 0x261e18 : 0x121c28,
        emissive: isLuxuryLorien ? 0x18110c : 0x0b121a,
        emissiveIntensity: isLuxuryLorien ? 0.22 : 0.16,
        roughness: isLuxuryLorien ? 0.62 : 0.94,
        metalness: isLuxuryLorien ? 0.08 : 0.04,
        side: THREE.DoubleSide,
    });
    const innerWallMaterial = new THREE.MeshStandardMaterial({
        color: isLuxuryLorien ? 0x1c1816 : 0x172333,
        emissive: isLuxuryLorien ? 0x14100d : 0x111a24,
        emissiveIntensity: isLuxuryLorien ? 0.16 : 0.12,
        roughness: isLuxuryLorien ? 0.58 : 0.92,
        metalness: isLuxuryLorien ? 0.1 : 0.03,
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
                  material: shellMaterial,
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

    if (isLuxuryLorien) {
        addLorienVelmoreLuxuryPassageDecor(group, baseGeometry, {
            axis,
            building,
            passageWidth,
            passageHeight,
            isGalleryHall,
        });
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

    [-1, 1].forEach((direction) => {
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

    if (isGalleryHall) {
        addLorienVelmoreGallerySupports(group, baseGeometry, {
            axis,
            building,
            passageHeight,
            shellMaterial,
            trimMaterial,
            lightMaterial,
        });
        addLorienVelmoreGalleryDisplays(group, {
            axis,
            building,
            passageWidth,
            passageHeight,
            shellMaterial,
            trimMaterial,
        });
    }
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

function addGalleryHallObstacles(building, variant, axis) {
    const transverseSpan = axis === 'x' ? building.depth : building.width;
    const passageWidth = THREE.MathUtils.clamp(variant.passageWidth, 4.8, transverseSpan - 3.6);
    const columnSize = 0.9;
    const columnInsetMain = 1.15;
    const columnInsetTravel = 1.5;
    const halfWidth = building.width * 0.5;
    const halfDepth = building.depth * 0.5;
    const columnPositions = [
        { x: -halfWidth + columnInsetMain, z: -halfDepth + columnInsetTravel },
        { x: halfWidth - columnInsetMain, z: -halfDepth + columnInsetTravel },
        { x: -halfWidth + columnInsetMain, z: halfDepth - columnInsetTravel },
        { x: halfWidth - columnInsetMain, z: halfDepth - columnInsetTravel },
        { x: -halfWidth + columnInsetMain, z: 0 },
        { x: halfWidth - columnInsetMain, z: 0 },
    ];
    columnPositions.forEach((column) => {
        addObstacleAabb(
            building.x + column.x,
            building.z + column.z,
            columnSize,
            columnSize,
            0.02,
            'building'
        );
    });

    const entranceTravel = axis === 'x' ? building.width : building.depth;
    const jambWidth = Math.max(0.95, (transverseSpan - passageWidth) * 0.42);
    const jambDepth = 0.82;
    const jambOffset = passageWidth * 0.5 + jambWidth * 0.5 + 0.06;
    [-1, 1].forEach((direction) => {
        const travelOffset = direction * (entranceTravel * 0.5 - jambDepth * 0.6);
        addObstacleAabb(
            building.x + (axis === 'x' ? travelOffset : -jambOffset),
            building.z + (axis === 'x' ? -jambOffset : travelOffset),
            axis === 'x' ? jambDepth : jambWidth,
            axis === 'x' ? jambWidth : jambDepth,
            0.02,
            'building'
        );
        addObstacleAabb(
            building.x + (axis === 'x' ? travelOffset : jambOffset),
            building.z + (axis === 'x' ? jambOffset : travelOffset),
            axis === 'x' ? jambDepth : jambWidth,
            axis === 'x' ? jambWidth : jambDepth,
            0.02,
            'building'
        );
    });
}

function addLorienVelmoreGallerySupports(
    group,
    baseGeometry,
    { axis, building, passageHeight, shellMaterial, trimMaterial, lightMaterial }
) {
    const halfWidth = building.width * 0.5;
    const halfDepth = building.depth * 0.5;
    const columnInsetMain = 1.15;
    const columnInsetTravel = 1.5;
    const columnWidth = 0.82;
    const columnCoreMaterial = shellMaterial.clone();
    columnCoreMaterial.emissiveIntensity = 0.14;

    const columnPositions = [
        { x: -halfWidth + columnInsetMain, z: -halfDepth + columnInsetTravel },
        { x: halfWidth - columnInsetMain, z: -halfDepth + columnInsetTravel },
        { x: -halfWidth + columnInsetMain, z: halfDepth - columnInsetTravel },
        { x: halfWidth - columnInsetMain, z: halfDepth - columnInsetTravel },
        { x: -halfWidth + columnInsetMain, z: 0 },
        { x: halfWidth - columnInsetMain, z: 0 },
    ];

    columnPositions.forEach((column) => {
        const floorY = sampleLorienGalleryFloorHeightLocal(building, column.x, column.z);
        const columnBaseY = floorY + 0.04;
        const columnTopY = passageHeight;
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
        addDecorBox(group, baseGeometry, trimMaterial, {
            x: column.x,
            y: passageHeight - 0.12,
            z: column.z,
            width: columnWidth + 0.14,
            height: 0.08,
            depth: columnWidth + 0.14,
        });
        addDecorBox(group, baseGeometry, lightMaterial, {
            x: column.x,
            y: columnCenterY,
            z: column.z,
            width: axis === 'x' ? 0.028 : columnWidth - 0.18,
            height: Math.max(1.6, columnHeight - 1.2),
            depth: axis === 'x' ? columnWidth - 0.18 : 0.028,
        });
    });
}

function addLorienVelmoreGalleryDisplays(
    group,
    { axis, building, passageWidth, passageHeight, shellMaterial, trimMaterial }
) {
    const frameMaterial = shellMaterial.clone();
    frameMaterial.color.setHex(0xe9e0d0);
    frameMaterial.emissive.setHex(0x2f261e);
    frameMaterial.emissiveIntensity = 0.12;
    const pedestalMaterial = trimMaterial.clone();
    pedestalMaterial.roughness = 0.46;
    pedestalMaterial.metalness = 0.52;
    const sculptureMaterial = new THREE.MeshStandardMaterial({
        color: 0xd8c2a0,
        emissive: 0x463221,
        emissiveIntensity: 0.08,
        roughness: 0.22,
        metalness: 0.8,
    });
    const displayPositions =
        axis === 'z'
            ? [
                  { x: -4.25, z: -5.2, facing: 0 },
                  { x: 4.25, z: -5.2, facing: Math.PI },
                  { x: -4.25, z: 5.2, facing: 0 },
                  { x: 4.25, z: 5.2, facing: Math.PI },
              ]
            : [
                  { x: -5.2, z: -4.25, facing: -Math.PI / 2 },
                  { x: -5.2, z: 4.25, facing: Math.PI / 2 },
                  { x: 5.2, z: -4.25, facing: -Math.PI / 2 },
                  { x: 5.2, z: 4.25, facing: Math.PI / 2 },
              ];
    const artPalettes = [
        ['#f7ebd7', '#d6b07a', '#7c5a46'],
        ['#efe2cf', '#b48e74', '#3f2b2b'],
        ['#f4e8dc', '#d6c1a1', '#6f7268'],
        ['#f5dfd2', '#cdb59a', '#5a3f34'],
    ];

    const sculptureGeometry = new THREE.IcosahedronGeometry(0.42, 0);
    const pedestalGeometry = new THREE.CylinderGeometry(0.34, 0.38, 0.9, 18);

    displayPositions.forEach((display, index) => {
        const artGroup = new THREE.Group();
        artGroup.position.set(
            display.x,
            sampleLorienGalleryFloorHeightLocal(building, display.x, display.z),
            display.z
        );
        artGroup.rotation.y = display.facing;

        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 1.8), frameMaterial);
        panel.position.y = 1.44;
        artGroup.add(panel);

        const artMaterial = new THREE.MeshBasicMaterial({
            map: createLorienGalleryArtworkTexture(artPalettes[index % artPalettes.length]),
            toneMapped: false,
        });
        const artFront = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 2.1), artMaterial);
        artFront.position.set(0.07, 1.44, 0);
        artFront.rotation.y = Math.PI / 2;
        artGroup.add(artFront);

        const glow = new THREE.Mesh(
            new THREE.PlaneGeometry(1.58, 2.26),
            new THREE.MeshBasicMaterial({
                color: 0xffe5be,
                transparent: true,
                opacity: 0.16,
                toneMapped: false,
            })
        );
        glow.position.set(0.075, 1.44, 0);
        glow.rotation.y = Math.PI / 2;
        artGroup.add(glow);

        const pedestal = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
        pedestal.position.set(0.78, 0.45, 0);
        artGroup.add(pedestal);

        const sculpture = new THREE.Mesh(sculptureGeometry, sculptureMaterial);
        sculpture.position.set(0.78, 1.18, 0);
        sculpture.rotation.set(0.4, index * 0.8, 0.2);
        artGroup.add(sculpture);

        group.add(artGroup);
    });

    const centerMarking = addDecorBox(
        group,
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({
            color: 0xfff1cc,
            transparent: true,
            opacity: 0.18,
            toneMapped: false,
        }),
        {
            x: 0,
            y: sampleLorienGalleryFloorHeightLocal(building, 0, 0) + 0.026,
            z: 0,
            width: axis === 'x' ? building.width - 3.6 : passageWidth - 1.05,
            height: 0.01,
            depth: axis === 'x' ? passageWidth - 1.05 : 5.4,
        }
    );
    centerMarking.renderOrder = 2;
}

function createGalleryHallFloorMesh(building, material) {
    const width = building.width - 0.5;
    const depth = building.depth - 0.5;
    const geometry = new THREE.PlaneGeometry(width, depth, 16, 28);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
        const localX = positions.getX(i);
        const localZ = positions.getZ(i);
        positions.setY(i, sampleLorienGalleryFloorHeightLocal(building, localX, localZ) + 0.028);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
}

function sampleLorienGalleryFloorHeightLocal(building, localX, localZ) {
    if (!building) {
        return 0;
    }
    const safeWidth = Math.max(0, building.width * 0.5 - 0.48);
    const safeDepth = Math.max(0, building.depth * 0.5 - 0.62);
    if (Math.abs(localX) > safeWidth || Math.abs(localZ) > safeDepth) {
        return 0;
    }

    const chamberDepth = -1.95;
    const roomHalfDepth = Math.min(2.7, Math.max(1.8, safeDepth * 0.28));
    const rampStartDepth = Math.min(safeDepth - 0.85, roomHalfDepth + 4.6);
    const distance = Math.abs(localZ);
    if (distance <= roomHalfDepth) {
        return chamberDepth;
    }
    if (distance >= rampStartDepth) {
        return 0;
    }

    const t = (distance - roomHalfDepth) / Math.max(0.001, rampStartDepth - roomHalfDepth);
    const eased = smoothstep01(t);
    return THREE.MathUtils.lerp(chamberDepth, 0, eased);
}

function smoothstep01(value) {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
}

function createLorienGalleryArtworkTexture(palette) {
    const [baseColor = '#f2e8d9', accentColor = '#c8a77f', lineColor = '#5f4837'] = palette || [];
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, baseColor);
    gradient.addColorStop(0.55, accentColor);
    gradient.addColorStop(1, '#1a1412');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(canvas.width * 0.34, canvas.height * 0.3, 92, 128, Math.PI * 0.24, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.4;
    ctx.fillStyle = 'rgba(255, 235, 204, 0.18)';
    ctx.fillRect(38, 44, canvas.width - 76, canvas.height - 88);

    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(76, canvas.height - 112);
    ctx.bezierCurveTo(
        canvas.width * 0.34,
        canvas.height * 0.58,
        canvas.width * 0.62,
        canvas.height * 0.36,
        canvas.width - 68,
        84
    );
    ctx.stroke();

    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(88, 128);
    ctx.lineTo(canvas.width - 92, canvas.height - 132);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}
