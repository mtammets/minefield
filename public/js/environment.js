import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const sceneBackgroundColor = new THREE.Color(0x060d18);
const sceneFog = new THREE.FogExp2(0x13243a, 0.00056);
const renderSettings = {
    maxPixelRatio: 0.75,
    shadowsEnabled: false,
};
const CITY_GRID_SPACING = 16;
const CITY_GRID_RANGE = 6;
const CITY_ROAD_OFFSET = 4;
const ROAD_WIDTH = 8;
const SIDEWALK_WIDTH = 2.6;
const SPEED_GLOW_MAX = 30;
const BUILDING_DISTRICT_RADIUS = 3;
const WORLD_HALF_SIZE = CITY_GRID_SPACING * (CITY_GRID_RANGE + 0.5);
const TERRAIN_SEGMENTS = 120;
const CHARGING_ZONE_RADIUS = 2.45;
const chargingZones = createChargingZones();
const chargingZoneIntersectionKeys = createChargingZoneIntersectionKeys(chargingZones);
const worldBounds = {
    minX: -WORLD_HALF_SIZE,
    maxX: WORLD_HALF_SIZE,
    minZ: -WORLD_HALF_SIZE,
    maxZ: WORLD_HALF_SIZE,
    size: WORLD_HALF_SIZE * 2,
};
const ROAD_SIDE_LINE_POSITIONS = [0.18, 0.82];
const ROAD_STYLE_CONFIGS = {
    boulevard: {
        key: 'boulevard',
        sidewalkMode: 'both',
        minimapRoadColor: 'rgba(53, 76, 102, 0.98)',
        minimapEdgeColor: 'rgba(95, 124, 154, 0.9)',
        texture: {
            top: '#24374a',
            bottom: '#1b2a39',
            noiseBase: 66,
            noiseSpread: 32,
            sideLineColor: 'rgba(236, 242, 250, 0.48)',
            sideLineWidth: 6.5,
            sideLinePositions: ROAD_SIDE_LINE_POSITIONS,
            centerMode: 'double-solid',
            centerColor: 'rgba(255, 198, 112, 0.72)',
            centerSecondaryColor: 'rgba(255, 225, 168, 0.52)',
            repeatV: 18,
            crackCount: 120,
        },
    },
    avenue: {
        key: 'avenue',
        sidewalkMode: 'both',
        minimapRoadColor: 'rgba(47, 65, 88, 0.96)',
        minimapEdgeColor: 'rgba(84, 113, 145, 0.88)',
        texture: {
            top: '#1f2c3a',
            bottom: '#182431',
            noiseBase: 64,
            noiseSpread: 28,
            sideLineColor: 'rgba(224, 236, 250, 0.4)',
            sideLineWidth: 6,
            sideLinePositions: ROAD_SIDE_LINE_POSITIONS,
            centerMode: 'dashed',
            centerColor: 'rgba(232, 240, 250, 0.66)',
            repeatV: 14,
            crackCount: 94,
        },
    },
    service: {
        key: 'service',
        sidewalkMode: 'none',
        minimapRoadColor: 'rgba(39, 56, 77, 0.94)',
        minimapEdgeColor: 'rgba(75, 104, 132, 0.82)',
        texture: {
            top: '#1a2531',
            bottom: '#15202b',
            noiseBase: 58,
            noiseSpread: 24,
            sideLineColor: 'rgba(193, 214, 238, 0.23)',
            sideLineWidth: 4.5,
            sideLinePositions: ROAD_SIDE_LINE_POSITIONS,
            centerMode: 'none',
            centerColor: 'rgba(197, 221, 247, 0.26)',
            repeatV: 11,
            crackCount: 70,
        },
    },
};
const roadAxisLineDescriptors = createRoadAxisLineDescriptors();
const cityMapLayout = {
    gridSpacing: CITY_GRID_SPACING,
    gridRange: CITY_GRID_RANGE,
    roadWidth: ROAD_WIDTH,
    sidewalkWidth: SIDEWALK_WIDTH,
    roadAxisLinesX: roadAxisLineDescriptors.xLines.map(toCityMapLineDescriptor),
    roadAxisLinesZ: roadAxisLineDescriptors.zLines.map(toCityMapLineDescriptor),
};
const staticObstacles = [];

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

function toIntersectionKey(x, z) {
    return `${Math.round(x)}:${Math.round(z)}`;
}

const ambientLight = new THREE.AmbientLight(0x3d5378, 0.5);
const skyLight = new THREE.HemisphereLight(0xa8cfff, 0x1f3146, 0.58);
const sunLight = createLight('directional', {
    color: 0xf0f5ff,
    intensity: 1.14,
    position: [126, 176, 88],
    shadow: {
        mapSize: 1024,
        cameraBounds: [-260, 260],
    },
});

const groundTexture = createGroundTexture();
const ground = createGround({
    texture: groundTexture,
    size: [worldBounds.size + 120, worldBounds.size + 120],
    positionY: 0,
});
const cityScenery = createCityScenery();
const worldBoundary = createWorldBoundary();

export {
    sceneBackgroundColor,
    sceneFog,
    renderSettings,
    worldBounds,
    cityMapLayout,
    staticObstacles,
    ambientLight,
    skyLight,
    sunLight,
    ground,
    cityScenery,
    worldBoundary,
    getGroundHeightAt,
    updateGroundMotion,
    chargingZones,
};

function createLight(type, { color, intensity, position, shadow }) {
    let light;
    if (type === 'directional') {
        light = new THREE.DirectionalLight(color, intensity);
        if (shadow) {
            light.castShadow = renderSettings.shadowsEnabled;
            if (renderSettings.shadowsEnabled) {
                light.shadow.mapSize.set(shadow.mapSize, shadow.mapSize);
                light.shadow.camera.left = shadow.cameraBounds[0];
                light.shadow.camera.right = shadow.cameraBounds[1];
                light.shadow.camera.top = shadow.cameraBounds[1];
                light.shadow.camera.bottom = shadow.cameraBounds[0];
            }
        }
    }
    light.position.set(...position);
    return light;
}

function createGround({ texture, size, positionY }) {
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0.04,
    });
    material.userData.baseEmissive = 0.058;
    material.emissive = new THREE.Color(0x1f3752);
    material.emissiveIntensity = material.userData.baseEmissive;

    const geometry = new THREE.PlaneGeometry(size[0], size[1], TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        positions.setY(i, getGroundHeightAt(x, z));
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = positionY;
    mesh.receiveShadow = false;
    return mesh;
}

function getGroundHeightAt(_x, _z) {
    return 0;
}

function updateGroundMotion(_playerPosition, playerSpeed = 0) {
    const speedRatio = THREE.MathUtils.clamp(Math.abs(playerSpeed) / SPEED_GLOW_MAX, 0, 1);
    const intensityBoost = speedRatio * 0.12;
    ground.material.emissiveIntensity = ground.material.userData.baseEmissive + intensityBoost;

    if (cityScenery.userData.lampLights.length > 0) {
        const time = performance.now() * 0.0022;
        const lampBoost = 1.12 + speedRatio * 0.26;
        cityScenery.userData.lampLights.forEach((light) => {
            const phase = light.userData.flickerPhase || 0;
            const lampFlicker = 0.988 + Math.sin(time + phase) * 0.012;
            light.intensity = light.userData.baseIntensity * lampBoost * lampFlicker;
        });
    }
}

function createWorldBoundary() {
    const boundary = new THREE.Group();
    boundary.name = 'worldBoundary';

    const wallHeight = 4.2;
    const wallThickness = 5;
    const boundaryTexture = createBoundaryTexture();
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0xb6c4d4,
        map: boundaryTexture,
        emissive: 0x172433,
        emissiveMap: boundaryTexture,
        emissiveIntensity: 0.26,
        roughness: 0.84,
        metalness: 0.2,
    });
    const horizontalLength = worldBounds.size + wallThickness * 2;
    const verticalLength = worldBounds.size + wallThickness * 2;

    const northSouthGeometry = new THREE.BoxGeometry(horizontalLength, wallHeight, wallThickness);
    const eastWestGeometry = new THREE.BoxGeometry(wallThickness, wallHeight, verticalLength);

    const northWall = new THREE.Mesh(northSouthGeometry, wallMaterial);
    northWall.position.set(0, wallHeight * 0.5, worldBounds.minZ - wallThickness * 0.5);
    boundary.add(northWall);

    const southWall = new THREE.Mesh(northSouthGeometry, wallMaterial);
    southWall.position.set(0, wallHeight * 0.5, worldBounds.maxZ + wallThickness * 0.5);
    boundary.add(southWall);

    const westWall = new THREE.Mesh(eastWestGeometry, wallMaterial);
    westWall.position.set(worldBounds.minX - wallThickness * 0.5, wallHeight * 0.5, 0);
    boundary.add(westWall);

    const eastWall = new THREE.Mesh(eastWestGeometry, wallMaterial);
    eastWall.position.set(worldBounds.maxX + wallThickness * 0.5, wallHeight * 0.5, 0);
    boundary.add(eastWall);

    return boundary;
}

function createGroundTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    const verticalGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    verticalGradient.addColorStop(0, '#2a3f58');
    verticalGradient.addColorStop(0.45, '#24384e');
    verticalGradient.addColorStop(1, '#1f3248');
    ctx.fillStyle = verticalGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 6200; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const value = 46 + Math.random() * 40;
        ctx.fillStyle = `rgba(${value}, ${value + 8}, ${value + 18}, 0.1)`;
        ctx.fillRect(x, y, 2.3, 2.3);
    }

    for (let i = 0; i < 24; i += 1) {
        const radius = 86 + Math.random() * 184;
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, 'rgba(186, 215, 255, 0.07)');
        gradient.addColorStop(1, 'rgba(186, 215, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Large faded tracks break up flat patches and improve speed perception.
    ctx.strokeStyle = 'rgba(12, 20, 30, 0.08)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 120; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const length = 34 + Math.random() * 140;
        const heading = Math.random() * Math.PI * 2;
        ctx.lineWidth = 0.9 + Math.random() * 1.3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(heading) * length, y + Math.sin(heading) * length);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 10);
    texture.anisotropy = 2;
    return texture;
}

function createRoadSurfaceTexture(styleTextureConfig = ROAD_STYLE_CONFIGS.avenue.texture) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const baseGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    baseGradient.addColorStop(0, styleTextureConfig.top);
    baseGradient.addColorStop(1, styleTextureConfig.bottom);
    ctx.fillStyle = baseGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 3000; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const value = styleTextureConfig.noiseBase + Math.random() * styleTextureConfig.noiseSpread;
        ctx.fillStyle = `rgba(${value}, ${value + 2}, ${value + 7}, 0.14)`;
        ctx.fillRect(x, y, 1.8, 1.8);
    }

    ctx.strokeStyle = styleTextureConfig.sideLineColor;
    ctx.lineWidth = styleTextureConfig.sideLineWidth;
    styleTextureConfig.sideLinePositions.forEach((positionRatio) => {
        const lineX = canvas.width * positionRatio;
        ctx.beginPath();
        ctx.moveTo(lineX, 0);
        ctx.lineTo(lineX, canvas.height);
        ctx.stroke();
    });

    const centerX = canvas.width * 0.5;
    if (styleTextureConfig.centerMode === 'dashed') {
        drawDashedVerticalLine(ctx, centerX, styleTextureConfig.centerColor, 5, 32, 24, canvas.height);
    } else if (styleTextureConfig.centerMode === 'double-solid') {
        drawSolidVerticalLine(
            ctx,
            centerX - 6,
            styleTextureConfig.centerColor,
            4,
            canvas.height
        );
        drawSolidVerticalLine(
            ctx,
            centerX + 6,
            styleTextureConfig.centerSecondaryColor || styleTextureConfig.centerColor,
            4,
            canvas.height
        );
    }

    ctx.strokeStyle = 'rgba(17, 28, 39, 0.22)';
    ctx.lineCap = 'round';
    for (let i = 0; i < styleTextureConfig.crackCount; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const length = 9 + Math.random() * 28;
        const heading = (Math.random() - 0.5) * Math.PI * 0.45;
        ctx.lineWidth = 0.8 + Math.random() * 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.sin(heading) * length, y + Math.cos(heading) * length);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, styleTextureConfig.repeatV);
    texture.anisotropy = 2;
    return texture;
}

function createIntersectionTexture({ variant = 'standard' } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const baseGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    baseGradient.addColorStop(0, '#24374a');
    baseGradient.addColorStop(1, '#1b2a39');
    ctx.fillStyle = baseGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 2400; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const value = 60 + Math.random() * 30;
        ctx.fillStyle = `rgba(${value}, ${value + 4}, ${value + 8}, 0.12)`;
        ctx.fillRect(x, y, 2, 2);
    }

    const center = canvas.width * 0.5;
    const laneInset = canvas.width * ROAD_SIDE_LINE_POSITIONS[0];
    const laneOuter = canvas.width * ROAD_SIDE_LINE_POSITIONS[1];

    // Keep lane edge continuation continuous so markings connect across seams.
    ctx.strokeStyle = 'rgba(226, 238, 251, 0.52)';
    ctx.lineWidth = 6;
    drawSolidVerticalLine(ctx, laneInset, 'rgba(226, 238, 251, 0.52)', 6, canvas.height);
    drawSolidVerticalLine(ctx, laneOuter, 'rgba(226, 238, 251, 0.52)', 6, canvas.height);
    drawSolidHorizontalLine(ctx, laneInset, 'rgba(226, 238, 251, 0.52)', 6, canvas.width);
    drawSolidHorizontalLine(ctx, laneOuter, 'rgba(226, 238, 251, 0.52)', 6, canvas.width);

    // Center guidance stays simple and deterministic.
    if (variant === 'boulevard') {
        drawSolidVerticalLine(ctx, center - 6, 'rgba(255, 198, 112, 0.74)', 3.5, canvas.height);
        drawSolidVerticalLine(ctx, center + 6, 'rgba(255, 225, 168, 0.58)', 3.5, canvas.height);
        ctx.strokeStyle = 'rgba(255, 198, 112, 0.58)';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(0, center - 6);
        ctx.lineTo(canvas.width, center - 6);
        ctx.moveTo(0, center + 6);
        ctx.lineTo(canvas.width, center + 6);
        ctx.stroke();
    } else if (variant === 'charging') {
        drawDashedVerticalLine(ctx, center, 'rgba(179, 236, 255, 0.46)', 3, 24, 20, canvas.height);
        drawDashedHorizontalLine(ctx, center, 'rgba(179, 236, 255, 0.46)', 3, 24, 20, canvas.width);
        drawChargingIntersectionMarkings(ctx, canvas.width, center);
    } else if (variant === 'standard') {
        drawDashedVerticalLine(ctx, center, 'rgba(230, 241, 252, 0.52)', 3.2, 26, 20, canvas.height);
        drawDashedHorizontalLine(ctx, center, 'rgba(230, 241, 252, 0.52)', 3.2, 26, 20, canvas.width);
    } else {
        drawDashedVerticalLine(ctx, center, 'rgba(207, 223, 241, 0.38)', 2.6, 20, 24, canvas.height);
        drawDashedHorizontalLine(ctx, center, 'rgba(207, 223, 241, 0.38)', 2.6, 20, 24, canvas.width);
    }

    const shouldDrawCrosswalks = variant === 'boulevard' || variant === 'standard';
    const shouldDrawStopBars = shouldDrawCrosswalks;
    const crosswalkInset = 8;
    const crosswalkDepth = 34;
    const stopBarGap = 10;
    if (shouldDrawCrosswalks) {
        drawIntersectionCrosswalks(
            ctx,
            canvas.width,
            laneInset,
            laneOuter,
            crosswalkInset,
            crosswalkDepth,
            8,
            6
        );
    }
    if (shouldDrawStopBars) {
        drawIntersectionStopBars(
            ctx,
            canvas.width,
            laneInset,
            laneOuter,
            crosswalkInset + crosswalkDepth + stopBarGap
        );
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.anisotropy = 2;
    return texture;
}

function drawSolidVerticalLine(ctx, x, color, lineWidth, height) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
}

function drawSolidHorizontalLine(ctx, y, color, lineWidth, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
}

function drawDashedVerticalLine(ctx, x, color, lineWidth, dashHeight, dashGap, height) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    for (let y = -dashHeight; y < height + dashHeight; y += dashHeight + dashGap) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + dashHeight);
        ctx.stroke();
    }
}

function drawDashedHorizontalLine(ctx, y, color, lineWidth, dashWidth, dashGap, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    for (let x = -dashWidth; x < width + dashWidth; x += dashWidth + dashGap) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dashWidth, y);
        ctx.stroke();
    }
}

function drawIntersectionCrosswalks(
    ctx,
    size,
    laneInset,
    laneOuter,
    inset,
    stripeLength,
    stripeWidth,
    stripeGap
) {
    ctx.fillStyle = 'rgba(235, 245, 255, 0.62)';
    const stripeStart = laneInset + 4;
    const stripeEnd = laneOuter - 4;

    for (let axisOffset = stripeStart; axisOffset <= stripeEnd; axisOffset += stripeWidth + stripeGap) {
        ctx.fillRect(axisOffset, inset, stripeWidth, stripeLength);
        ctx.fillRect(axisOffset, size - inset - stripeLength, stripeWidth, stripeLength);
        ctx.fillRect(inset, axisOffset, stripeLength, stripeWidth);
        ctx.fillRect(size - inset - stripeLength, axisOffset, stripeLength, stripeWidth);
    }
}

function drawIntersectionStopBars(ctx, size, laneInset, laneOuter, offset) {
    ctx.strokeStyle = 'rgba(230, 242, 255, 0.66)';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(laneInset, offset);
    ctx.lineTo(laneOuter, offset);
    ctx.moveTo(laneInset, size - offset);
    ctx.lineTo(laneOuter, size - offset);
    ctx.moveTo(offset, laneInset);
    ctx.lineTo(offset, laneOuter);
    ctx.moveTo(size - offset, laneInset);
    ctx.lineTo(size - offset, laneOuter);
    ctx.stroke();
}

function drawChargingIntersectionMarkings(ctx, size, center) {
    ctx.strokeStyle = 'rgba(160, 232, 255, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(center, center, size * 0.16, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(140, 222, 255, 0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center, center, size * 0.24, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(186, 240, 255, 0.8)';
    ctx.beginPath();
    ctx.moveTo(center - 12, center - 22);
    ctx.lineTo(center + 4, center - 22);
    ctx.lineTo(center - 5, center - 2);
    ctx.lineTo(center + 12, center - 2);
    ctx.lineTo(center - 6, center + 22);
    ctx.lineTo(center - 1, center + 4);
    ctx.lineTo(center - 15, center + 4);
    ctx.closePath();
    ctx.fill();
}

function createSidewalkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#4a5f78');
    gradient.addColorStop(1, '#41556d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tile = 32;
    ctx.strokeStyle = 'rgba(198, 220, 246, 0.2)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += tile) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += tile) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(canvas.width, y + 0.5);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 12);
    texture.anisotropy = 1;
    return texture;
}

function createBoundaryTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#314256');
    gradient.addColorStop(1, '#253448');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255, 201, 94, 0.28)';
    const chevronWidth = 52;
    for (let x = -chevronWidth; x < canvas.width + chevronWidth; x += chevronWidth * 2) {
        ctx.beginPath();
        ctx.moveTo(x, canvas.height);
        ctx.lineTo(x + chevronWidth * 0.5, canvas.height * 0.56);
        ctx.lineTo(x + chevronWidth, canvas.height);
        ctx.closePath();
        ctx.fill();
    }

    ctx.strokeStyle = 'rgba(222, 239, 255, 0.23)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height * 0.18);
    ctx.lineTo(canvas.width, canvas.height * 0.18);
    ctx.moveTo(0, canvas.height * 0.82);
    ctx.lineTo(canvas.width, canvas.height * 0.82);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 1);
    texture.anisotropy = 1;
    return texture;
}

function createSkyDome() {
    const texture = createSkyDomeTexture();
    const geometry = new THREE.SphereGeometry(worldBounds.size * 3.1, 32, 18);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
        fog: false,
        toneMapped: false,
        depthWrite: false,
    });
    const dome = new THREE.Mesh(geometry, material);
    dome.position.y = worldBounds.size * 0.45;
    dome.frustumCulled = false;
    return dome;
}

function createSkyDomeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#3567a6');
    gradient.addColorStop(0.34, '#1c3554');
    gradient.addColorStop(0.7, '#0b1524');
    gradient.addColorStop(1, '#060c17');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const horizonGlow = ctx.createRadialGradient(
        canvas.width * 0.5,
        canvas.height * 0.62,
        18,
        canvas.width * 0.5,
        canvas.height * 0.62,
        canvas.width * 0.68
    );
    horizonGlow.addColorStop(0, 'rgba(120, 186, 255, 0.25)');
    horizonGlow.addColorStop(1, 'rgba(120, 186, 255, 0)');
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 170; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * (canvas.height * 0.48);
        const size = 0.7 + Math.random() * 1.6;
        const alpha = 0.18 + Math.random() * 0.35;
        ctx.fillStyle = `rgba(198, 225, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    return texture;
}

function createCityScenery() {
    const group = new THREE.Group();
    group.name = 'cityScenery';
    group.userData.lampLights = [];
    staticObstacles.length = 0;

    group.add(createRoadLayer());
    group.add(createParkLayer());
    group.add(createBuildingLayer());
    group.add(createStreetLampLayer(group.userData.lampLights));

    return group;
}

function createHorizonBackdropLayer() {
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

function createRoadLayer() {
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

    xLineDescriptors.forEach((lineDescriptor) => {
        const road = new THREE.Mesh(
            verticalRoadGeometry,
            roadMaterialSet[lineDescriptor.styleKey].vertical
        );
        road.rotation.x = -Math.PI / 2;
        road.position.set(lineDescriptor.coordinate, roadY, 0);
        layer.add(road);

        if (lineDescriptor.sidewalkMode === 'none') {
            return;
        }

        verticalSidewalkIntervals.forEach(([segmentStart, segmentEnd]) => {
            const segmentLength = segmentEnd - segmentStart;
            if (segmentLength <= 0.04) {
                return;
            }
            const segmentCenter = (segmentStart + segmentEnd) * 0.5;

            const sidewalkWest = new THREE.Mesh(
                new THREE.PlaneGeometry(sidewalkWidth, segmentLength),
                sidewalkMaterial
            );
            sidewalkWest.rotation.x = -Math.PI / 2;
            sidewalkWest.position.set(
                lineDescriptor.coordinate - roadWidth * 0.5 - sidewalkWidth * 0.5,
                sidewalkY,
                segmentCenter
            );
            layer.add(sidewalkWest);

            const sidewalkEast = new THREE.Mesh(
                new THREE.PlaneGeometry(sidewalkWidth, segmentLength),
                sidewalkMaterial
            );
            sidewalkEast.rotation.x = -Math.PI / 2;
            sidewalkEast.position.set(
                lineDescriptor.coordinate + roadWidth * 0.5 + sidewalkWidth * 0.5,
                sidewalkY,
                segmentCenter
            );
            layer.add(sidewalkEast);
        });
    });

    zLineDescriptors.forEach((lineDescriptor) => {
        const road = new THREE.Mesh(
            horizontalRoadGeometry,
            roadMaterialSet[lineDescriptor.styleKey].horizontal
        );
        road.rotation.x = -Math.PI / 2;
        road.position.set(0, roadY, lineDescriptor.coordinate);
        layer.add(road);

        if (lineDescriptor.sidewalkMode === 'none') {
            return;
        }

        horizontalSidewalkIntervals.forEach(([segmentStart, segmentEnd]) => {
            const segmentLength = segmentEnd - segmentStart;
            if (segmentLength <= 0.04) {
                return;
            }
            const segmentCenter = (segmentStart + segmentEnd) * 0.5;

            const sidewalkNorth = new THREE.Mesh(
                new THREE.PlaneGeometry(segmentLength, sidewalkWidth),
                sidewalkMaterial
            );
            sidewalkNorth.rotation.x = -Math.PI / 2;
            sidewalkNorth.position.set(
                segmentCenter,
                sidewalkY,
                lineDescriptor.coordinate - roadWidth * 0.5 - sidewalkWidth * 0.5
            );
            layer.add(sidewalkNorth);

            const sidewalkSouth = new THREE.Mesh(
                new THREE.PlaneGeometry(segmentLength, sidewalkWidth),
                sidewalkMaterial
            );
            sidewalkSouth.rotation.x = -Math.PI / 2;
            sidewalkSouth.position.set(
                segmentCenter,
                sidewalkY,
                lineDescriptor.coordinate + roadWidth * 0.5 + sidewalkWidth * 0.5
            );
            layer.add(sidewalkSouth);
        });
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

    xLineDescriptors.forEach((xLineDescriptor) => {
        zLineDescriptors.forEach((zLineDescriptor) => {
            const intersectionVariant = resolveIntersectionVariant(xLineDescriptor, zLineDescriptor);
            const patch = new THREE.Mesh(
                intersectionGeometry,
                intersectionMaterialSet[intersectionVariant]
            );
            patch.rotation.x = -Math.PI / 2;
            patch.position.set(xLineDescriptor.coordinate, roadY + 0.004, zLineDescriptor.coordinate);
            layer.add(patch);
        });
    });

    return layer;
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
    const style = ROAD_STYLE_CONFIGS[lineDescriptor.styleKey] || ROAD_STYLE_CONFIGS.avenue;
    const hasSidewalks = lineDescriptor.sidewalkMode !== 'none';
    return {
        gridIndex: lineDescriptor.gridIndex,
        coord: lineDescriptor.coordinate,
        styleKey: lineDescriptor.styleKey,
        roadWidth: ROAD_WIDTH,
        sidewalkWidth: hasSidewalks ? SIDEWALK_WIDTH : 0,
        minimapRoadColor: style.minimapRoadColor,
        minimapEdgeColor: style.minimapEdgeColor,
    };
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
        const emissiveIntensity =
            variant === 'charging' ? 0.36 : variant === 'minor' ? 0.24 : 0.31;
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
    const intersectionKey = toIntersectionKey(xLineDescriptor.coordinate, zLineDescriptor.coordinate);

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

function createBuildingLayer() {
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

            placements.push({
                x: gridX * CITY_GRID_SPACING,
                z: gridZ * CITY_GRID_SPACING,
                width,
                depth,
                height,
                tint,
            });
        }
    }

    if (placements.length === 0) {
        return layer;
    }

    const buildings = new THREE.InstancedMesh(
        buildingGeometry,
        buildingMaterial,
        placements.length
    );
    buildings.castShadow = false;
    buildings.receiveShadow = false;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    placements.forEach((building, index) => {
        dummy.position.set(building.x, building.height * 0.5, building.z);
        dummy.scale.set(building.width, building.height, building.depth);
        dummy.updateMatrix();
        buildings.setMatrixAt(index, dummy.matrix);

        color.setHSL(0.58 + building.tint * 0.04, 0.2, 0.28 + building.tint * 0.08);
        buildings.setColorAt(index, color);
        // Keep the collision shell slightly larger than the rendered facade
        // so the player car cannot visually clip into buildings.
        addObstacleAabb(building.x, building.z, building.width, building.depth, 0.2, 'building');
    });
    buildings.instanceMatrix.needsUpdate = true;
    buildings.instanceColor.needsUpdate = true;

    layer.add(buildings);
    return layer;
}

function createBuildingWindowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');

    const facadeGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    facadeGradient.addColorStop(0, '#233046');
    facadeGradient.addColorStop(1, '#172235');
    ctx.fillStyle = facadeGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(122, 162, 210, 0.16)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= canvas.width; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, canvas.height);
        ctx.stroke();
    }

    const cols = 6;
    const rows = 12;
    const marginX = 14;
    const marginY = 12;
    const gapX = 8;
    const gapY = 10;
    const cellW = (canvas.width - marginX * 2 - gapX * (cols - 1)) / cols;
    const cellH = (canvas.height - marginY * 2 - gapY * (rows - 1)) / rows;

    for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
            const px = marginX + x * (cellW + gapX);
            const py = marginY + y * (cellH + gapY);
            const lit = Math.random() < 0.62;

            ctx.fillStyle = lit ? 'rgba(255, 222, 157, 0.92)' : 'rgba(83, 113, 162, 0.21)';
            ctx.fillRect(px, py, cellW, cellH);

            if (lit && Math.random() < 0.2) {
                ctx.fillStyle = 'rgba(176, 226, 255, 0.42)';
                ctx.fillRect(px + 1, py + 1, cellW - 2, Math.max(1, cellH * 0.22));
            }
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.anisotropy = 2;
    return texture;
}

function createParkLayer() {
    const layer = new THREE.Group();
    layer.name = 'parkLayer';

    const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.26, 2.5, 6);
    const canopyGeometry = new THREE.ConeGeometry(1.3, 3.6, 7);
    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x544130,
        roughness: 0.95,
        metalness: 0.02,
    });
    const canopyMaterial = new THREE.MeshStandardMaterial({
        color: 0x2e7f53,
        emissive: 0x173f2a,
        emissiveIntensity: 0.18,
        roughness: 0.9,
        metalness: 0.01,
        vertexColors: true,
    });

    const trees = [];
    const blockSpread = CITY_GRID_SPACING * 0.34;

    for (let gridX = -CITY_GRID_RANGE; gridX <= CITY_GRID_RANGE; gridX += 1) {
        for (let gridZ = -CITY_GRID_RANGE; gridZ <= CITY_GRID_RANGE; gridZ += 1) {
            if (Math.abs(gridX) % 2 === 0 || Math.abs(gridZ) % 2 === 0) {
                continue;
            }
            if (isInsideBuildingDistrict(gridX, gridZ)) {
                continue;
            }

            const centerX = gridX * CITY_GRID_SPACING;
            const centerZ = gridZ * CITY_GRID_SPACING;
            const treeCount = 2 + Math.floor(randomFromGrid(gridX, gridZ, 90) * 2);

            for (let i = 0; i < treeCount; i += 1) {
                const x = centerX + (randomFromGrid(gridX, gridZ, 91 + i) - 0.5) * blockSpread * 2;
                const z = centerZ + (randomFromGrid(gridX, gridZ, 95 + i) - 0.5) * blockSpread * 2;
                const scale = 0.82 + randomFromGrid(gridX, gridZ, 99 + i) * 0.48;
                trees.push({ x, z, scale });
            }
        }
    }

    if (trees.length === 0) {
        return layer;
    }

    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
    const canopies = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, trees.length);
    trunks.castShadow = false;
    trunks.receiveShadow = false;
    canopies.castShadow = false;
    canopies.receiveShadow = false;

    const dummy = new THREE.Object3D();
    const canopyColor = new THREE.Color();

    trees.forEach((tree, index) => {
        const baseY = getGroundHeightAt(tree.x, tree.z);
        dummy.position.set(tree.x, baseY + 1.25 * tree.scale, tree.z);
        dummy.scale.set(tree.scale, tree.scale, tree.scale);
        dummy.rotation.set(0, randomFromGrid(index, trees.length, 120) * Math.PI * 2, 0);
        dummy.updateMatrix();
        trunks.setMatrixAt(index, dummy.matrix);

        dummy.position.set(tree.x, baseY + 3.2 * tree.scale, tree.z);
        dummy.scale.set(tree.scale, tree.scale, tree.scale);
        dummy.updateMatrix();
        canopies.setMatrixAt(index, dummy.matrix);

        canopyColor.setHSL(0.33 + randomFromGrid(index, trees.length, 121) * 0.03, 0.42, 0.28);
        canopies.setColorAt(index, canopyColor);
        addObstacleCircle(tree.x, tree.z, 0.62 * tree.scale, 'tree');
    });

    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    canopies.instanceColor.needsUpdate = true;

    layer.add(trunks);
    layer.add(canopies);
    return layer;
}

function createStreetLampLayer(_lampLights) {
    const layer = new THREE.Group();
    const poleMaterial = new THREE.MeshStandardMaterial({
        color: 0x2f3948,
        roughness: 0.78,
        metalness: 0.28,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffda9c,
        transparent: true,
        opacity: 0.9,
    });
    const poleGeometry = new THREE.CylinderGeometry(0.22, 0.24, 8.6, 10);
    const headGeometry = new THREE.SphereGeometry(0.46, 10, 10);

    for (let gridX = -CITY_GRID_RANGE; gridX <= CITY_GRID_RANGE; gridX += 1) {
        for (let gridZ = -CITY_GRID_RANGE; gridZ <= CITY_GRID_RANGE; gridZ += 1) {
            if (Math.abs(gridX) % 2 !== 0 && Math.abs(gridZ) % 2 !== 0) {
                continue;
            }
            if (Math.abs(gridX) % 2 === 0 && Math.abs(gridZ) % 2 === 0) {
                continue;
            }

            const positionX =
                gridX * CITY_GRID_SPACING + (Math.abs(gridX) % 2 === 0 ? CITY_ROAD_OFFSET : 0);
            const positionZ =
                gridZ * CITY_GRID_SPACING + (Math.abs(gridZ) % 2 === 0 ? CITY_ROAD_OFFSET : 0);
            const baseY = getGroundHeightAt(positionX, positionZ);

            const pole = new THREE.Mesh(poleGeometry, poleMaterial);
            pole.position.set(positionX, baseY + 4.3, positionZ);
            pole.castShadow = false;
            pole.receiveShadow = false;
            layer.add(pole);
            addObstacleCircle(positionX, positionZ, 0.58, 'lamp_post');

            const lampHead = new THREE.Mesh(headGeometry, glowMaterial);
            lampHead.position.set(positionX, baseY + 8.6, positionZ);
            layer.add(lampHead);

            // Street lamps keep only emissive lamp heads; no ground pool/point light spill.
        }
    }

    return layer;
}

function isInsideBuildingDistrict(gridX, gridZ) {
    return (
        Math.abs(gridX) <= BUILDING_DISTRICT_RADIUS && Math.abs(gridZ) <= BUILDING_DISTRICT_RADIUS
    );
}

function randomFromGrid(gridX, gridZ, salt) {
    return hashToUnit(hashGrid(gridX, gridZ, salt));
}

function hashToUnit(value) {
    return value / 4294967295;
}

function hashGrid(gridX, gridZ, salt) {
    let hash = (gridX * 374761393 + gridZ * 668265263 + salt * 1442695041) | 0;
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    hash ^= hash >>> 16;
    return hash >>> 0;
}

function addObstacleCircle(x, z, radius, category = 'generic') {
    staticObstacles.push({
        type: 'circle',
        x,
        z,
        radius,
        category,
    });
}

function addObstacleAabb(x, z, width, depth, padding = 0, category = 'generic') {
    const halfWidth = Math.max(0.25, width * 0.5 + padding);
    const halfDepth = Math.max(0.25, depth * 0.5 + padding);
    staticObstacles.push({
        type: 'aabb',
        minX: x - halfWidth,
        maxX: x + halfWidth,
        minZ: z - halfDepth,
        maxZ: z + halfDepth,
        category,
    });
}
