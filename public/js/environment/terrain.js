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

const WORLD_GROUND_OVERSCAN = 120;
const GROUND_TEXTURE_SIZE = 4096;
const PROMENADE_OVERSCAN = 9.5;
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

export function getGroundHeightAt(x, z) {
    const lorienGalleryHeight = sampleLorienVelmoreGalleryFloorHeightWorld(x, z);
    if (Number.isFinite(lorienGalleryHeight)) {
        return lorienGalleryHeight + LORIEN_VELMORE_GALLERY_SURFACE_OFFSET;
    }
    return 0;
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

    const mesh = markGroundDebugLayer(
        new THREE.Mesh(new THREE.PlaneGeometry(resolvedSize.width, resolvedSize.depth), material),
        'terrain_base'
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = positionY;
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    return mesh;
}

export function updateGroundMotionRuntime({
    ground,
    cityScenery,
    playerSpeed = 0,
    playerPosition = null,
}) {
    const speedRatio = THREE.MathUtils.clamp(Math.abs(playerSpeed) / SPEED_GLOW_MAX, 0, 1);
    if (ground?.material) {
        const baseEmissive = Number(ground.material.userData?.baseEmissive) || 0.058;
        ground.material.emissiveIntensity = baseEmissive + speedRatio * 0.12;
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

    const districtFrame = worldToCanvasRect(bounds, 0, 0, worldBounds.size + 8, worldBounds.size + 8);
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
            const rect = worldToCanvasRect(bounds, xLine.coordinate, zLine.coordinate, ROAD_WIDTH, ROAD_WIDTH);
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
    if (chargingZoneIntersectionKeys.has(`${Math.round(xLine.coordinate)}:${Math.round(zLine.coordinate)}`)) {
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
