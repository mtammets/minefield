import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { ROAD_WIDTH, SIDEWALK_WIDTH, SPEED_GLOW_MAX } from './config.js';
import { markGroundDebugLayer } from './ground-debug.js';
import {
    centralParkingLot,
    chargingZoneIntersectionKeys,
    roadAxisLineDescriptors,
    worldBounds,
} from './layout.js';
import {
    createIntersectionTexture,
    createPremiumSidewalkTexture,
    createPromenadeTexture,
    createRoadSurfaceTexture,
    createSignatureGrassTexture,
} from './textures.js';
import {
    LORIEN_VELMORE_GALLERY_SURFACE_OFFSET,
    sampleLorienVelmoreGalleryFloorHeightWorld,
} from './lorien-gallery.js';
import {
    UNDERGROUND_PARKING_LAYOUT,
    sampleUndergroundParkingHeightWorld,
    shouldUseUndergroundParkingHeight,
} from './underground-parking.js';
import {
    UPPER_DECK_LAYOUT,
    isInsideUpperDeckRampCorridor,
    sampleUpperDeckHeight,
} from './upper-deck.js';

const WORLD_GROUND_OVERSCAN = 120;
const GROUND_TEXTURE_SIZE = 4096;
const PROMENADE_OVERSCAN = 9.5;
const UNDERGROUND_ENTRANCE_TERRAIN_CUTOUT_FRONT = 0.55;
const UNDERGROUND_ENTRANCE_TERRAIN_CUTOUT_BACK = 0.25;
const UNDERGROUND_ENTRANCE_TERRAIN_CUTOUT_SIDE = 1.1;
const CURB_WIDTH_WORLD = 0.22;
const ROAD_PATTERN_CONFIGS = Object.freeze({
    boulevard: {
        top: '#1d2d3b',
        bottom: '#15212c',
        noiseBase: 52,
        noiseSpread: 28,
        sideLineColor: 'rgba(222, 232, 244, 0.46)',
        sideLineWidth: 4.2,
        sideLinePositions: [0.17, 0.83],
        centerMode: 'double-solid',
        centerColor: 'rgba(255, 194, 104, 0.92)',
        centerSecondaryColor: 'rgba(255, 222, 158, 0.72)',
        repeatV: 20,
        crackCount: 132,
    },
    avenue: {
        top: '#1a2835',
        bottom: '#13202b',
        noiseBase: 50,
        noiseSpread: 24,
        sideLineColor: 'rgba(216, 227, 241, 0.34)',
        sideLineWidth: 3.8,
        sideLinePositions: [0.16, 0.84],
        centerMode: 'dashed',
        centerColor: 'rgba(227, 237, 247, 0.68)',
        repeatV: 18,
        crackCount: 112,
    },
    service: {
        top: '#17222c',
        bottom: '#101922',
        noiseBase: 46,
        noiseSpread: 18,
        sideLineColor: 'rgba(149, 177, 206, 0.14)',
        sideLineWidth: 2.4,
        sideLinePositions: [0.14, 0.86],
        centerMode: 'none',
        centerColor: 'rgba(0, 0, 0, 0)',
        repeatV: 16,
        crackCount: 76,
    },
});

let cachedGroundTexture = null;
let cachedPatternSources = null;

export function getGroundHeightAt(x, z, preferredY = null) {
    const lowerGroundHeight = getLowerGroundHeightAt(x, z, preferredY);
    const upperDeckHeight = sampleUpperDeckHeight(x, z);
    if (!Number.isFinite(upperDeckHeight)) {
        return lowerGroundHeight;
    }
    if (shouldUseUpperDeckHeight(x, z, upperDeckHeight, lowerGroundHeight, preferredY)) {
        return upperDeckHeight;
    }
    return lowerGroundHeight;
}

function getLowerGroundHeightAt(x, z, preferredY = null) {
    const undergroundParkingHeight = sampleUndergroundParkingHeightWorld(x, z);
    if (
        Number.isFinite(undergroundParkingHeight) &&
        shouldUseUndergroundParkingHeight(preferredY, x, z, undergroundParkingHeight)
    ) {
        return undergroundParkingHeight;
    }
    const lorienGalleryHeight = sampleLorienVelmoreGalleryFloorHeightWorld(x, z);
    if (Number.isFinite(lorienGalleryHeight)) {
        return lorienGalleryHeight + LORIEN_VELMORE_GALLERY_SURFACE_OFFSET;
    }
    return 0;
}

function shouldUseUpperDeckHeight(x, z, upperDeckHeight, lowerGroundHeight, preferredY) {
    if (isInsideUpperDeckRampCorridor(x, z, 0.1)) {
        return true;
    }
    if (!Number.isFinite(preferredY)) {
        return false;
    }

    const heightDelta = Math.max(0, upperDeckHeight - lowerGroundHeight);
    const captureMargin = THREE.MathUtils.clamp(heightDelta * 0.45, 0.9, 1.8);
    return preferredY >= upperDeckHeight - captureMargin;
}

export function createGround({ size = null, positionY = 0 } = {}) {
    const resolvedSize = resolveGroundSize(size);
    const texture = getOrCreateWorldGroundTexture(resolvedSize);
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0.04,
        emissive: 0x102133,
        emissiveIntensity: 0.058,
    });
    material.userData.baseEmissive = 0.058;

    const baseSurface = markGroundDebugLayer(new THREE.Group(), 'terrain_base');
    baseSurface.name = 'worldBaseTerrain';
    createBaseTerrainSections(resolvedSize, material).forEach((sectionMesh) => {
        baseSurface.add(sectionMesh);
    });

    const root = new THREE.Group();
    root.name = 'worldGround';
    root.position.y = positionY;
    root.userData.baseSurface = baseSurface;
    root.userData.baseSurfaceMaterial = material;
    root.add(baseSurface);
    root.add(createUpperDeckStructure());
    return root;
}

export function updateGroundMotionRuntime({
    ground,
    cityScenery,
    playerSpeed = 0,
    playerPosition = null,
}) {
    const speedRatio = THREE.MathUtils.clamp(Math.abs(playerSpeed) / SPEED_GLOW_MAX, 0, 1);
    const emissiveMaterial =
        ground?.userData?.baseSurfaceMaterial || ground?.userData?.baseSurface?.material || null;
    if (emissiveMaterial) {
        const baseEmissive = Number(emissiveMaterial.userData?.baseEmissive) || 0.058;
        emissiveMaterial.emissiveIntensity = baseEmissive + speedRatio * 0.12;
    }

    const lampLights = cityScenery?.userData?.lampLights || [];
    if (lampLights.length > 0) {
        const time = performance.now() * 0.0022;
        const lampBoost = 1.12 + speedRatio * 0.26;
        lampLights.forEach((light) => {
            const phase = light.userData.flickerPhase || 0;
            const lampFlicker = 0.988 + Math.sin(time + phase) * 0.012;
            light.intensity = light.userData.baseIntensity * lampBoost * lampFlicker;
        });
    }

    void playerPosition;
}

function resolveGroundSize(size) {
    const fallbackSize = worldBounds.size + WORLD_GROUND_OVERSCAN;
    if (!Array.isArray(size)) {
        return { width: fallbackSize, depth: fallbackSize };
    }
    return {
        width: Number.isFinite(size[0]) ? size[0] : fallbackSize,
        depth: Number.isFinite(size[1]) ? size[1] : fallbackSize,
    };
}

function createBaseTerrainSections(size, material) {
    const groundBounds = {
        minX: -size.width * 0.5,
        maxX: size.width * 0.5,
        minZ: -size.depth * 0.5,
        maxZ: size.depth * 0.5,
        width: size.width,
        depth: size.depth,
    };
    const cutout = getUndergroundParkingEntranceTerrainCutoutBounds(groundBounds);
    const sections = [
        {
            minX: groundBounds.minX,
            maxX: cutout.minX,
            minZ: groundBounds.minZ,
            maxZ: groundBounds.maxZ,
        },
        {
            minX: cutout.maxX,
            maxX: groundBounds.maxX,
            minZ: groundBounds.minZ,
            maxZ: groundBounds.maxZ,
        },
        {
            minX: cutout.minX,
            maxX: cutout.maxX,
            minZ: groundBounds.minZ,
            maxZ: cutout.minZ,
        },
        {
            minX: cutout.minX,
            maxX: cutout.maxX,
            minZ: cutout.maxZ,
            maxZ: groundBounds.maxZ,
        },
    ];

    return sections
        .map((sectionBounds) => createBaseTerrainSectionMesh(sectionBounds, groundBounds, material))
        .filter(Boolean);
}

function createBaseTerrainSectionMesh(sectionBounds, groundBounds, material) {
    const width = sectionBounds.maxX - sectionBounds.minX;
    const depth = sectionBounds.maxZ - sectionBounds.minZ;
    if (width <= 0.05 || depth <= 0.05) {
        return null;
    }

    const centerX = (sectionBounds.minX + sectionBounds.maxX) * 0.5;
    const centerZ = (sectionBounds.minZ + sectionBounds.maxZ) * 0.5;
    const geometry = new THREE.PlaneGeometry(width, depth);
    remapBaseTerrainSectionUvs(geometry, centerX, centerZ, groundBounds);
    geometry.rotateX(-Math.PI / 2);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(centerX, 0, centerZ);
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    return mesh;
}

function remapBaseTerrainSectionUvs(geometry, centerX, centerZ, groundBounds) {
    const positions = geometry.attributes.position;
    const uvs = geometry.attributes.uv;

    for (let index = 0; index < positions.count; index += 1) {
        const worldX = centerX + positions.getX(index);
        const worldZ = centerZ - positions.getY(index);
        const u = (worldX - groundBounds.minX) / groundBounds.width;
        const v = 1 - (worldZ - groundBounds.minZ) / groundBounds.depth;
        uvs.setXY(index, u, v);
    }

    uvs.needsUpdate = true;
}

function createUpperDeckStructure() {
    const group = new THREE.Group();
    group.name = 'upperDeckStructure';

    const deckTexture = createPromenadeTexture();
    deckTexture.repeat.set(1.85, 1.12);

    const deckMaterial = new THREE.MeshStandardMaterial({
        color: 0xc7d6e7,
        map: deckTexture,
        roughness: 0.82,
        metalness: 0.1,
        emissive: 0x11253a,
        emissiveIntensity: 0.15,
        side: THREE.DoubleSide,
    });
    const railMaterial = new THREE.MeshStandardMaterial({
        color: 0xe1edf7,
        roughness: 0.28,
        metalness: 0.58,
        emissive: 0x5db8ff,
        emissiveIntensity: 0.12,
    });
    const trussMaterial = new THREE.MeshStandardMaterial({
        color: 0x4b5e76,
        roughness: 0.7,
        metalness: 0.24,
        emissive: 0x0d1725,
        emissiveIntensity: 0.08,
    });

    const deckSurface = markGroundDebugLayer(
        new THREE.Mesh(createUpperDeckSurfaceGeometry(), deckMaterial),
        'terrain_upper_deck'
    );
    deckSurface.position.set(UPPER_DECK_LAYOUT.centerX, 0.045, UPPER_DECK_LAYOUT.centerZ);
    deckSurface.receiveShadow = false;
    deckSurface.castShadow = false;
    group.add(deckSurface);

    group.add(createUpperDeckStringers(trussMaterial));
    group.add(createUpperDeckRailSystem(railMaterial));
    group.add(createUpperDeckArchRibs(trussMaterial));
    group.add(createUpperDeckAnchorPiers(trussMaterial));

    return group;
}

function createUpperDeckSurfaceGeometry() {
    const geometry = new THREE.PlaneGeometry(
        UPPER_DECK_LAYOUT.halfLength * 2,
        UPPER_DECK_LAYOUT.outerHalfWidth * 2,
        96,
        24
    );
    const positions = geometry.attributes.position;

    for (let i = 0; i < positions.count; i += 1) {
        const localX = positions.getX(i);
        const localDepth = positions.getY(i);
        const height =
            sampleUpperDeckHeight(
                UPPER_DECK_LAYOUT.centerX + localX,
                UPPER_DECK_LAYOUT.centerZ - localDepth
            ) || 0;
        positions.setZ(i, height);
    }

    geometry.rotateX(-Math.PI / 2);
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
}

function createUpperDeckStringers(material) {
    const group = new THREE.Group();
    group.name = 'upperDeckStringers';
    const offsets = [
        -UPPER_DECK_LAYOUT.driveHalfWidth * 0.52,
        0,
        UPPER_DECK_LAYOUT.driveHalfWidth * 0.52,
    ];

    offsets.forEach((zOffset) => {
        const curve = createUpperDeckDeckCurve(zOffset, -0.46, 40);
        const stringer = markGroundDebugLayer(
            new THREE.Mesh(new THREE.TubeGeometry(curve, 88, 0.18, 8, false), material),
            'terrain_upper_deck'
        );
        stringer.castShadow = false;
        stringer.receiveShadow = false;
        group.add(stringer);
    });

    return group;
}

function createUpperDeckRailSystem(material) {
    const group = new THREE.Group();
    group.name = 'upperDeckRailSystem';
    const railEndInset = 3.8;

    const railOffsets = [
        UPPER_DECK_LAYOUT.outerHalfWidth - 0.72,
        -(UPPER_DECK_LAYOUT.outerHalfWidth - 0.72),
    ];

    railOffsets.forEach((zOffset) => {
        const topRail = markGroundDebugLayer(
            new THREE.Mesh(
                new THREE.TubeGeometry(
                    createUpperDeckDeckCurve(zOffset, 1.06, 32, railEndInset, railEndInset),
                    72,
                    0.1,
                    8,
                    false
                ),
                material
            ),
            'terrain_upper_deck'
        );
        topRail.castShadow = false;
        topRail.receiveShadow = false;
        group.add(topRail);

        const midRail = markGroundDebugLayer(
            new THREE.Mesh(
                new THREE.TubeGeometry(
                    createUpperDeckDeckCurve(zOffset, 0.56, 32, railEndInset, railEndInset),
                    72,
                    0.072,
                    8,
                    false
                ),
                material
            ),
            'terrain_upper_deck'
        );
        midRail.castShadow = false;
        midRail.receiveShadow = false;
        group.add(midRail);
    });

    const postGeometry = new THREE.BoxGeometry(0.12, 0.94, 0.12);
    const capGeometry = new THREE.BoxGeometry(0.28, 0.08, 0.28);
    for (
        let localX = -UPPER_DECK_LAYOUT.halfLength + railEndInset + 0.55;
        localX <= UPPER_DECK_LAYOUT.halfLength - railEndInset - 0.55;
        localX += 2.5
    ) {
        const baseY =
            sampleUpperDeckHeight(UPPER_DECK_LAYOUT.centerX + localX, UPPER_DECK_LAYOUT.centerZ) ||
            0;
        railOffsets.forEach((zOffset) => {
            const post = markGroundDebugLayer(
                new THREE.Mesh(postGeometry, material),
                'terrain_upper_deck'
            );
            post.position.set(
                UPPER_DECK_LAYOUT.centerX + localX,
                baseY + 0.46,
                UPPER_DECK_LAYOUT.centerZ + zOffset
            );
            post.castShadow = false;
            post.receiveShadow = false;
            group.add(post);

            const cap = markGroundDebugLayer(
                new THREE.Mesh(capGeometry, material),
                'terrain_upper_deck'
            );
            cap.position.set(
                UPPER_DECK_LAYOUT.centerX + localX,
                baseY + 0.95,
                UPPER_DECK_LAYOUT.centerZ + zOffset
            );
            cap.castShadow = false;
            cap.receiveShadow = false;
            group.add(cap);
        });
    }

    return group;
}

function createUpperDeckArchRibs(material) {
    const group = new THREE.Group();
    group.name = 'upperDeckArchRibs';
    const archOffsets = [-12, 12];

    archOffsets.forEach((xOffset) => {
        const archCurve = createUpperDeckArchCurve(xOffset);
        const arch = markGroundDebugLayer(
            new THREE.Mesh(new THREE.TubeGeometry(archCurve, 48, 0.2, 10, false), material),
            'terrain_upper_deck'
        );
        arch.castShadow = false;
        arch.receiveShadow = false;
        group.add(arch);
    });

    return group;
}

function createUpperDeckAnchorPiers(material) {
    const group = new THREE.Group();
    group.name = 'upperDeckAnchorPiers';
    const pierGeometry = new THREE.BoxGeometry(1.8, 1.15, 2.5);
    const capGeometry = new THREE.BoxGeometry(2.3, 0.28, 2.9);
    const endOffsets = [-UPPER_DECK_LAYOUT.halfLength + 1.6, UPPER_DECK_LAYOUT.halfLength - 1.6];
    const pierZOffsets = [
        UPPER_DECK_LAYOUT.outerHalfWidth - 1.3,
        -(UPPER_DECK_LAYOUT.outerHalfWidth - 1.3),
    ];

    endOffsets.forEach((xOffset) => {
        const deckHeight =
            sampleUpperDeckHeight(UPPER_DECK_LAYOUT.centerX + xOffset, UPPER_DECK_LAYOUT.centerZ) ||
            0;
        pierZOffsets.forEach((zOffset) => {
            const pier = markGroundDebugLayer(
                new THREE.Mesh(pierGeometry, material),
                'terrain_upper_deck'
            );
            pier.position.set(
                UPPER_DECK_LAYOUT.centerX + xOffset,
                Math.max(0.58, deckHeight * 0.32),
                UPPER_DECK_LAYOUT.centerZ + zOffset
            );
            pier.castShadow = false;
            pier.receiveShadow = false;
            group.add(pier);

            const cap = markGroundDebugLayer(
                new THREE.Mesh(capGeometry, material),
                'terrain_upper_deck'
            );
            cap.position.set(
                UPPER_DECK_LAYOUT.centerX + xOffset,
                Math.max(1.1, deckHeight * 0.32 + 0.56),
                UPPER_DECK_LAYOUT.centerZ + zOffset
            );
            cap.castShadow = false;
            cap.receiveShadow = false;
            group.add(cap);
        });
    });

    return group;
}

function createUpperDeckDeckCurve(
    zOffset = 0,
    heightOffset = 0,
    pointCount = 24,
    startInset = 0,
    endInset = 0
) {
    const points = [];
    const localMinX = -UPPER_DECK_LAYOUT.halfLength + Math.max(0, startInset);
    const localMaxX = UPPER_DECK_LAYOUT.halfLength - Math.max(0, endInset);
    for (let index = 0; index <= pointCount; index += 1) {
        const t = index / pointCount;
        const localX = THREE.MathUtils.lerp(localMinX, localMaxX, t);
        const baseY =
            sampleUpperDeckHeight(UPPER_DECK_LAYOUT.centerX + localX, UPPER_DECK_LAYOUT.centerZ) ||
            0;
        points.push(
            new THREE.Vector3(
                UPPER_DECK_LAYOUT.centerX + localX,
                baseY + heightOffset,
                UPPER_DECK_LAYOUT.centerZ + zOffset
            )
        );
    }
    return new THREE.CatmullRomCurve3(points);
}

function createUpperDeckArchCurve(xOffset = 0) {
    const span = UPPER_DECK_LAYOUT.outerHalfWidth - 0.9;
    const archPeak = UPPER_DECK_LAYOUT.deckBaseHeight + UPPER_DECK_LAYOUT.deckCrownRise * 0.44;
    const centerX = UPPER_DECK_LAYOUT.centerX + xOffset;
    const centerZ = UPPER_DECK_LAYOUT.centerZ;

    return new THREE.CatmullRomCurve3([
        new THREE.Vector3(centerX, 0.16, centerZ - span),
        new THREE.Vector3(centerX, archPeak * 0.38, centerZ - span * 0.56),
        new THREE.Vector3(centerX, archPeak, centerZ),
        new THREE.Vector3(centerX, archPeak * 0.38, centerZ + span * 0.56),
        new THREE.Vector3(centerX, 0.16, centerZ + span),
    ]);
}

function getOrCreateWorldGroundTexture(size) {
    const cacheKey = `${size.width}:${size.depth}`;
    if (cachedGroundTexture?.key === cacheKey) {
        return cachedGroundTexture.texture;
    }
    const texture = createWorldGroundTexture(size);
    cachedGroundTexture = { key: cacheKey, texture };
    return texture;
}

function createWorldGroundTexture(size) {
    const canvas = document.createElement('canvas');
    canvas.width = GROUND_TEXTURE_SIZE;
    canvas.height = GROUND_TEXTURE_SIZE;
    const ctx = canvas.getContext('2d');
    const bounds = {
        minX: -size.width * 0.5,
        maxX: size.width * 0.5,
        minZ: -size.depth * 0.5,
        maxZ: size.depth * 0.5,
    };
    const patterns = getGroundPatternSources();

    drawTiledPattern(
        ctx,
        patterns.grass,
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        {
            tileWidth: worldUnitsToPixels(bounds, 10),
            tileHeight: worldUnitsToPixels(bounds, 10),
        }
    );
    overlayGrassAtmosphere(ctx, bounds);
    drawAllSidewalkBands(ctx, bounds, patterns);
    drawAllRoadBands(ctx, bounds, patterns);
    drawAllIntersectionTiles(ctx, bounds, patterns);
    drawCentralPromenade(ctx, bounds, patterns);
    drawWorldEdgeVignette(ctx);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 8;
    texture.generateMipmaps = true;
    return texture;
}

function getGroundPatternSources() {
    if (cachedPatternSources) {
        return cachedPatternSources;
    }

    const grass = textureImage(createSignatureGrassTexture());
    const sidewalkVertical = textureImage(createPremiumSidewalkTexture());
    const sidewalkHorizontal = rotateCanvas90(sidewalkVertical);
    const promenade = textureImage(createPromenadeTexture());

    const roadVertical = {
        boulevard: textureImage(createRoadSurfaceTexture(ROAD_PATTERN_CONFIGS.boulevard)),
        avenue: textureImage(createRoadSurfaceTexture(ROAD_PATTERN_CONFIGS.avenue)),
        service: textureImage(createRoadSurfaceTexture(ROAD_PATTERN_CONFIGS.service)),
    };
    const roadHorizontal = {
        boulevard: rotateCanvas90(roadVertical.boulevard),
        avenue: rotateCanvas90(roadVertical.avenue),
        service: rotateCanvas90(roadVertical.service),
    };

    const intersections = {
        boulevard: textureImage(createIntersectionTexture({ variant: 'boulevard' })),
        standard: textureImage(createIntersectionTexture({ variant: 'standard' })),
        service: textureImage(createIntersectionTexture({ variant: 'service' })),
        charging: textureImage(createIntersectionTexture({ variant: 'charging' })),
    };

    cachedPatternSources = {
        grass,
        sidewalkVertical,
        sidewalkHorizontal,
        promenade,
        roadVertical,
        roadHorizontal,
        intersections,
    };
    return cachedPatternSources;
}

function textureImage(texture) {
    const image = texture?.image;
    texture?.dispose?.();
    return image;
}

function rotateCanvas90(sourceCanvas) {
    const rotated = document.createElement('canvas');
    rotated.width = sourceCanvas.height;
    rotated.height = sourceCanvas.width;
    const ctx = rotated.getContext('2d');
    ctx.translate(rotated.width * 0.5, rotated.height * 0.5);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(sourceCanvas, -sourceCanvas.width * 0.5, -sourceCanvas.height * 0.5);
    return rotated;
}

function overlayGrassAtmosphere(ctx, bounds) {
    const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    gradient.addColorStop(0, 'rgba(8, 14, 22, 0.24)');
    gradient.addColorStop(0.5, 'rgba(5, 9, 14, 0.08)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.26)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    const districtFrame = worldToCanvasRect(
        bounds,
        0,
        0,
        worldBounds.size + 8,
        worldBounds.size + 8
    );
    ctx.strokeStyle = 'rgba(154, 213, 180, 0.05)';
    ctx.lineWidth = 8;
    ctx.strokeRect(districtFrame.x, districtFrame.y, districtFrame.width, districtFrame.height);
}

function drawAllSidewalkBands(ctx, bounds, patterns) {
    roadAxisLineDescriptors.xLines.forEach((line) => {
        drawSidewalkBandsForLine(ctx, bounds, patterns, line, 'x');
    });
    roadAxisLineDescriptors.zLines.forEach((line) => {
        drawSidewalkBandsForLine(ctx, bounds, patterns, line, 'z');
    });
}

function drawSidewalkBandsForLine(ctx, bounds, patterns, line, axis) {
    const sidewalkWidth = resolveSidewalkWidth(line.styleKey);
    const offset = ROAD_WIDTH * 0.5 + sidewalkWidth * 0.5;
    const pattern = axis === 'x' ? patterns.sidewalkVertical : patterns.sidewalkHorizontal;
    const tileSize = worldUnitsToPixels(bounds, 3.4);

    const negativeRect =
        axis === 'x'
            ? worldToCanvasRect(
                  bounds,
                  line.coordinate - offset,
                  0,
                  sidewalkWidth,
                  bounds.maxZ - bounds.minZ
              )
            : worldToCanvasRect(
                  bounds,
                  0,
                  line.coordinate - offset,
                  bounds.maxX - bounds.minX,
                  sidewalkWidth
              );
    const positiveRect =
        axis === 'x'
            ? worldToCanvasRect(
                  bounds,
                  line.coordinate + offset,
                  0,
                  sidewalkWidth,
                  bounds.maxZ - bounds.minZ
              )
            : worldToCanvasRect(
                  bounds,
                  0,
                  line.coordinate + offset,
                  bounds.maxX - bounds.minX,
                  sidewalkWidth
              );

    drawSidewalkBand(ctx, negativeRect, pattern, tileSize, axis, 'negative');
    drawSidewalkBand(ctx, positiveRect, pattern, tileSize, axis, 'positive');
}

function drawSidewalkBand(ctx, rect, patternCanvas, tileSize, axis, side) {
    drawTiledPattern(ctx, patternCanvas, rect, {
        tileWidth: tileSize,
        tileHeight: tileSize,
    });

    ctx.fillStyle = 'rgba(10, 17, 28, 0.18)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    const curbThickness = Math.max(2, Math.round(tileSize * 0.08));
    const shadowThickness = Math.max(2, Math.round(tileSize * 0.05));

    if (axis === 'x') {
        const curbX = side === 'negative' ? rect.x + rect.width - curbThickness : rect.x;
        const shadowX = side === 'negative' ? curbX - shadowThickness : curbX + curbThickness;
        ctx.fillStyle = 'rgba(214, 226, 238, 0.18)';
        ctx.fillRect(curbX, rect.y, curbThickness, rect.height);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
        ctx.fillRect(shadowX, rect.y, shadowThickness, rect.height);
        return;
    }

    const curbY = side === 'negative' ? rect.y : rect.y + rect.height - curbThickness;
    const shadowY = side === 'negative' ? curbY + curbThickness : curbY - shadowThickness;
    ctx.fillStyle = 'rgba(214, 226, 238, 0.18)';
    ctx.fillRect(rect.x, curbY, rect.width, curbThickness);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(rect.x, shadowY, rect.width, shadowThickness);
}

function drawAllRoadBands(ctx, bounds, patterns) {
    roadAxisLineDescriptors.xLines.forEach((line) => {
        drawRoadBandForLine(ctx, bounds, patterns, line, 'x');
    });
    roadAxisLineDescriptors.zLines.forEach((line) => {
        drawRoadBandForLine(ctx, bounds, patterns, line, 'z');
    });
}

function drawRoadBandForLine(ctx, bounds, patterns, line, axis) {
    const rect =
        axis === 'x'
            ? worldToCanvasRect(bounds, line.coordinate, 0, ROAD_WIDTH, bounds.maxZ - bounds.minZ)
            : worldToCanvasRect(bounds, 0, line.coordinate, bounds.maxX - bounds.minX, ROAD_WIDTH);
    const source =
        axis === 'x'
            ? patterns.roadVertical[line.styleKey] || patterns.roadVertical.avenue
            : patterns.roadHorizontal[line.styleKey] || patterns.roadHorizontal.avenue;
    const tileSize = worldUnitsToPixels(bounds, ROAD_WIDTH);

    drawTiledPattern(ctx, source, rect, {
        tileWidth: tileSize,
        tileHeight: tileSize,
    });
    overlayRoadDepth(ctx, rect, axis);
}

function drawAllIntersectionTiles(ctx, bounds, patterns) {
    roadAxisLineDescriptors.xLines.forEach((xLine) => {
        roadAxisLineDescriptors.zLines.forEach((zLine) => {
            const variant = resolveIntersectionVariant(xLine, zLine);
            const rect = worldToCanvasRect(
                bounds,
                xLine.coordinate,
                zLine.coordinate,
                ROAD_WIDTH,
                ROAD_WIDTH
            );
            const source = patterns.intersections[variant] || patterns.intersections.standard;
            ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
            overlayIntersectionBlend(ctx, rect, variant);
        });
    });
}

function drawCentralPromenade(ctx, bounds, patterns) {
    const rect = worldToCanvasRect(
        bounds,
        centralParkingLot.centerX,
        centralParkingLot.centerZ,
        centralParkingLot.width + PROMENADE_OVERSCAN,
        centralParkingLot.depth + PROMENADE_OVERSCAN
    );
    ctx.drawImage(patterns.promenade, rect.x, rect.y, rect.width, rect.height);

    const grassPatternTile = worldUnitsToPixels(bounds, 8);
    [
        [0.26, 0.26],
        [0.74, 0.26],
        [0.26, 0.74],
        [0.74, 0.74],
    ].forEach(([u, v]) => {
        const centerX = rect.x + rect.width * u;
        const centerY = rect.y + rect.height * v;
        const lawnRadiusX = rect.width * 0.12;
        const lawnRadiusY = rect.height * 0.085;
        drawPatternEllipse(ctx, patterns.grass, centerX, centerY, lawnRadiusX, lawnRadiusY, {
            tileWidth: grassPatternTile,
            tileHeight: grassPatternTile,
        });
        ctx.fillStyle = 'rgba(8, 18, 14, 0.18)';
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, lawnRadiusX, lawnRadiusY, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(210, 226, 240, 0.24)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, lawnRadiusX * 1.05, lawnRadiusY * 1.07, 0, 0, Math.PI * 2);
        ctx.stroke();
    });
}

function overlayRoadDepth(ctx, rect, axis) {
    const fade =
        axis === 'x'
            ? ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y)
            : ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
    fade.addColorStop(0, 'rgba(0, 0, 0, 0.18)');
    fade.addColorStop(0.16, 'rgba(0, 0, 0, 0.06)');
    fade.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    fade.addColorStop(0.84, 'rgba(0, 0, 0, 0.06)');
    fade.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
    ctx.fillStyle = fade;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
}

function overlayIntersectionBlend(ctx, rect, variant) {
    ctx.fillStyle = variant === 'charging' ? 'rgba(8, 18, 26, 0.1)' : 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
}

function drawWorldEdgeVignette(ctx) {
    const gradient = ctx.createRadialGradient(
        ctx.canvas.width * 0.5,
        ctx.canvas.height * 0.5,
        ctx.canvas.width * 0.22,
        ctx.canvas.width * 0.5,
        ctx.canvas.height * 0.5,
        ctx.canvas.width * 0.74
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.68, 'rgba(0, 0, 0, 0.05)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.26)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function getUndergroundParkingEntranceTerrainCutoutBounds(groundBounds = null) {
    const entrance = UNDERGROUND_PARKING_LAYOUT.entrance;
    const halfWidth =
        getUndergroundParkingEntranceHalfWidthAtZ(entrance, entrance.approachMinZ, 'wall') +
        UNDERGROUND_ENTRANCE_TERRAIN_CUTOUT_SIDE;
    const bounds = {
        minX: entrance.centerX - halfWidth,
        maxX: entrance.centerX + halfWidth,
        minZ: entrance.approachMinZ - UNDERGROUND_ENTRANCE_TERRAIN_CUTOUT_FRONT,
        maxZ: entrance.cutoutEndZ + UNDERGROUND_ENTRANCE_TERRAIN_CUTOUT_BACK,
    };
    if (!groundBounds) {
        return bounds;
    }

    return {
        minX: Math.max(groundBounds.minX, bounds.minX),
        maxX: Math.min(groundBounds.maxX, bounds.maxX),
        minZ: Math.max(groundBounds.minZ, bounds.minZ),
        maxZ: Math.min(groundBounds.maxZ, bounds.maxZ),
    };
}

function drawUndergroundParkingEntranceSurface(ctx, bounds) {
    const entrance = UNDERGROUND_PARKING_LAYOUT.entrance;
    const cutout = getUndergroundParkingEntranceTerrainCutoutBounds();

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    traceUndergroundParkingEntranceCutoutRect(
        ctx,
        bounds,
        entrance.centerX,
        cutout.minZ,
        cutout.maxZ,
        (cutout.maxX - cutout.minX) * 0.5
    );
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.58)';
    ctx.lineWidth = 10;
    traceUndergroundParkingEntranceCutoutRect(
        ctx,
        bounds,
        entrance.centerX,
        cutout.minZ,
        cutout.maxZ,
        (cutout.maxX - cutout.minX) * 0.5
    );
    ctx.stroke();

    ctx.strokeStyle = 'rgba(191, 232, 255, 0.12)';
    ctx.lineWidth = 2;
    traceUndergroundParkingEntranceCutoutRect(
        ctx,
        bounds,
        entrance.centerX,
        cutout.minZ,
        cutout.maxZ,
        (cutout.maxX - cutout.minX) * 0.5
    );
    ctx.stroke();
    ctx.restore();
}

function traceUndergroundParkingEntrancePath(ctx, bounds, minZ, maxZ, profile = 'cutout') {
    const entrance = UNDERGROUND_PARKING_LAYOUT.entrance;
    const stepCount = 18;
    const leftPoints = [];
    const rightPoints = [];

    for (let index = 0; index <= stepCount; index += 1) {
        const t = index / stepCount;
        const z = THREE.MathUtils.lerp(minZ, maxZ, t);
        const halfWidth = getUndergroundParkingEntranceHalfWidthAtZ(entrance, z, profile);
        leftPoints.push(worldToCanvasPoint(bounds, entrance.centerX - halfWidth, z));
        rightPoints.push(worldToCanvasPoint(bounds, entrance.centerX + halfWidth, z));
    }

    if (leftPoints.length === 0 || rightPoints.length === 0) {
        return;
    }

    ctx.beginPath();
    ctx.moveTo(leftPoints[0].x, leftPoints[0].y);
    for (let index = 1; index < leftPoints.length; index += 1) {
        ctx.lineTo(leftPoints[index].x, leftPoints[index].y);
    }
    for (let index = rightPoints.length - 1; index >= 0; index -= 1) {
        ctx.lineTo(rightPoints[index].x, rightPoints[index].y);
    }
    ctx.closePath();
}

function getUndergroundParkingEntranceHalfWidthAtZ(entrance, z, profile = 'cutout') {
    const flare = 1 - clamp01((z - entrance.topZ) / Math.max(0.001, entrance.flareLength));

    if (profile === 'apron') {
        return entrance.apronHalfWidth + flare * entrance.apronTopFlareExtra;
    }
    if (profile === 'surface') {
        return entrance.surfaceHalfWidth + flare * entrance.surfaceTopFlareExtra;
    }
    if (profile === 'wall') {
        return entrance.wallHalfWidth + flare * entrance.wallTopFlareExtra;
    }
    return entrance.cutoutHalfWidth + flare * entrance.cutoutTopFlareExtra;
}

function traceUndergroundParkingEntranceCutoutRect(ctx, bounds, centerX, minZ, maxZ, halfWidth) {
    const rect = worldToCanvasRect(
        bounds,
        centerX,
        (minZ + maxZ) * 0.5,
        halfWidth * 2,
        maxZ - minZ
    );
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
}

function drawUndergroundParkingGuideLine(ctx, bounds, x, startZ, endZ) {
    const start = worldToCanvasPoint(bounds, x, startZ);
    const end = worldToCanvasPoint(bounds, x, endZ);
    ctx.save();
    ctx.strokeStyle = 'rgba(219, 235, 250, 0.84)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
}

function drawUndergroundParkingCenterArrow(ctx, bounds, centerX, centerZ) {
    const tip = worldToCanvasPoint(bounds, centerX, centerZ + 1.2);
    const base = worldToCanvasPoint(bounds, centerX, centerZ - 0.9);
    const wingLeft = worldToCanvasPoint(bounds, centerX - 1.15, centerZ + 0.05);
    const wingRight = worldToCanvasPoint(bounds, centerX + 1.15, centerZ + 0.05);

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 211, 141, 0.9)';
    ctx.fillStyle = 'rgba(255, 211, 141, 0.42)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(wingLeft.x, wingLeft.y);
    ctx.lineTo(wingRight.x, wingRight.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

function drawTiledPattern(ctx, sourceCanvas, rect, options = {}) {
    const tileWidth = Math.max(8, Number(options.tileWidth) || rect.width);
    const tileHeight = Math.max(8, Number(options.tileHeight) || tileWidth);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    for (let x = rect.x; x < rect.x + rect.width + tileWidth; x += tileWidth) {
        for (let y = rect.y; y < rect.y + rect.height + tileHeight; y += tileHeight) {
            ctx.drawImage(sourceCanvas, x, y, tileWidth, tileHeight);
        }
    }
    ctx.restore();
}

function drawPatternEllipse(ctx, sourceCanvas, centerX, centerY, radiusX, radiusY, options = {}) {
    const tileWidth = Math.max(8, Number(options.tileWidth) || radiusX * 0.9);
    const tileHeight = Math.max(8, Number(options.tileHeight) || tileWidth);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.clip();
    for (let x = centerX - radiusX - tileWidth; x < centerX + radiusX + tileWidth; x += tileWidth) {
        for (
            let y = centerY - radiusY - tileHeight;
            y < centerY + radiusY + tileHeight;
            y += tileHeight
        ) {
            ctx.drawImage(sourceCanvas, x, y, tileWidth, tileHeight);
        }
    }
    ctx.restore();
}

function resolveIntersectionVariant(xLine, zLine) {
    if (
        chargingZoneIntersectionKeys.has(
            `${Math.round(xLine.coordinate)}:${Math.round(zLine.coordinate)}`
        )
    ) {
        return 'charging';
    }
    if (xLine.styleKey === 'boulevard' || zLine.styleKey === 'boulevard') {
        return 'boulevard';
    }
    if (xLine.styleKey === 'service' && zLine.styleKey === 'service') {
        return 'service';
    }
    return 'standard';
}

function resolveSidewalkWidth(styleKey = '') {
    if (styleKey === 'boulevard') {
        return SIDEWALK_WIDTH + 0.9;
    }
    if (styleKey === 'service') {
        return Math.max(1.9, SIDEWALK_WIDTH - 0.3);
    }
    return SIDEWALK_WIDTH + 0.35;
}

function worldUnitsToPixels(bounds, units) {
    return (units / Math.max(0.001, bounds.maxX - bounds.minX)) * GROUND_TEXTURE_SIZE;
}

function worldToCanvasRect(bounds, centerX, centerZ, width, depth) {
    const halfWidth = width * 0.5;
    const halfDepth = depth * 0.5;
    const topLeft = worldToCanvasPoint(bounds, centerX - halfWidth, centerZ - halfDepth);
    const bottomRight = worldToCanvasPoint(bounds, centerX + halfWidth, centerZ + halfDepth);
    return {
        x: topLeft.x,
        y: bottomRight.y,
        width: bottomRight.x - topLeft.x,
        height: topLeft.y - bottomRight.y,
    };
}

function worldToCanvasPoint(bounds, x, z) {
    const u = (x - bounds.minX) / Math.max(0.001, bounds.maxX - bounds.minX);
    const v = (z - bounds.minZ) / Math.max(0.001, bounds.maxZ - bounds.minZ);
    return {
        x: u * GROUND_TEXTURE_SIZE,
        y: (1 - v) * GROUND_TEXTURE_SIZE,
    };
}

function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}
