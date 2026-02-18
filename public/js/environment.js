import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const sceneBackgroundColor = new THREE.Color(0x060d18);
const sceneFog = new THREE.FogExp2(0x13243a, 0.00056);
const renderSettings = {
    maxPixelRatio: 0.75,
    shadowsEnabled: false,
};
const CITY_GRID_SPACING = 42;
const CITY_GRID_RANGE = 6;
const CITY_ROAD_OFFSET = 10;
const ROAD_WIDTH = 20;
const SIDEWALK_WIDTH = 4.4;
const SPEED_GLOW_MAX = 30;
const LAMP_REAL_LIGHT_GRID_RADIUS = 1;
const BUILDING_DISTRICT_RADIUS = 3;
const WORLD_HALF_SIZE = CITY_GRID_SPACING * (CITY_GRID_RANGE + 0.5);
const TERRAIN_SEGMENTS = 120;
const CHARGING_ZONE_RADIUS = 2.45;
const chargingZones = [
    { id: 'charging_zone_0', x: 0, z: -168, radius: CHARGING_ZONE_RADIUS },
    { id: 'charging_zone_1', x: 0, z: -84, radius: CHARGING_ZONE_RADIUS },
    { id: 'charging_zone_2', x: -84, z: -84, radius: CHARGING_ZONE_RADIUS },
    { id: 'charging_zone_3', x: 84, z: -84, radius: CHARGING_ZONE_RADIUS },
    { id: 'charging_zone_4', x: -168, z: 0, radius: CHARGING_ZONE_RADIUS },
    { id: 'charging_zone_5', x: -84, z: 0, radius: CHARGING_ZONE_RADIUS },
    { id: 'charging_zone_6', x: 84, z: 0, radius: CHARGING_ZONE_RADIUS },
    { id: 'charging_zone_7', x: 168, z: 0, radius: CHARGING_ZONE_RADIUS },
    { id: 'charging_zone_8', x: -84, z: 84, radius: CHARGING_ZONE_RADIUS },
    { id: 'charging_zone_9', x: 0, z: 84, radius: CHARGING_ZONE_RADIUS },
    { id: 'charging_zone_10', x: 84, z: 84, radius: CHARGING_ZONE_RADIUS },
    { id: 'charging_zone_11', x: 0, z: 168, radius: CHARGING_ZONE_RADIUS },
    { id: 'charging_zone_12', x: -168, z: -168, radius: CHARGING_ZONE_RADIUS },
    { id: 'charging_zone_13', x: 168, z: 168, radius: CHARGING_ZONE_RADIUS },
];
const worldBounds = {
    minX: -WORLD_HALF_SIZE,
    maxX: WORLD_HALF_SIZE,
    minZ: -WORLD_HALF_SIZE,
    maxZ: WORLD_HALF_SIZE,
    size: WORLD_HALF_SIZE * 2,
};
const cityMapLayout = {
    gridSpacing: CITY_GRID_SPACING,
    gridRange: CITY_GRID_RANGE,
    roadWidth: ROAD_WIDTH,
    sidewalkWidth: SIDEWALK_WIDTH,
};
const staticObstacles = [];

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

function createRoadSurfaceTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const baseGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    baseGradient.addColorStop(0, '#1f2c3a');
    baseGradient.addColorStop(1, '#182431');
    ctx.fillStyle = baseGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 3000; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const value = 62 + Math.random() * 26;
        ctx.fillStyle = `rgba(${value}, ${value + 2}, ${value + 7}, 0.14)`;
        ctx.fillRect(x, y, 1.8, 1.8);
    }

    // Side lane lines.
    ctx.strokeStyle = 'rgba(224, 236, 250, 0.4)';
    ctx.lineWidth = 6;
    [canvas.width * 0.18, canvas.width * 0.82].forEach((lineX) => {
        ctx.beginPath();
        ctx.moveTo(lineX, 0);
        ctx.lineTo(lineX, canvas.height);
        ctx.stroke();
    });

    // Center dashed line.
    ctx.strokeStyle = 'rgba(222, 232, 245, 0.58)';
    ctx.lineWidth = 5;
    const centerX = canvas.width * 0.5;
    const dashHeight = 32;
    const dashGap = 24;
    for (let y = -dashHeight; y < canvas.height + dashHeight; y += dashHeight + dashGap) {
        ctx.beginPath();
        ctx.moveTo(centerX, y);
        ctx.lineTo(centerX, y + dashHeight);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 14);
    texture.anisotropy = 2;
    return texture;
}

function createIntersectionTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#223140';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 2400; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const value = 60 + Math.random() * 30;
        ctx.fillStyle = `rgba(${value}, ${value + 4}, ${value + 8}, 0.12)`;
        ctx.fillRect(x, y, 2, 2);
    }

    ctx.strokeStyle = 'rgba(214, 231, 251, 0.36)';
    ctx.lineWidth = 6;
    ctx.strokeRect(84, 84, canvas.width - 168, canvas.height - 168);

    ctx.strokeStyle = 'rgba(184, 214, 247, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.5, 0);
    ctx.lineTo(canvas.width * 0.5, canvas.height);
    ctx.moveTo(0, canvas.height * 0.5);
    ctx.lineTo(canvas.width, canvas.height * 0.5);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.anisotropy = 2;
    return texture;
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
    const roadY = 0.028;
    const sidewalkY = 0.034;
    const verticalRoadTexture = createRoadSurfaceTexture();
    const horizontalRoadTexture = verticalRoadTexture.clone();
    horizontalRoadTexture.center.set(0.5, 0.5);
    horizontalRoadTexture.rotation = Math.PI * 0.5;
    horizontalRoadTexture.needsUpdate = true;
    const intersectionSurfaceTexture = createIntersectionTexture();
    const sidewalkSurfaceTexture = createSidewalkTexture();

    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: verticalRoadTexture,
        emissive: 0x1a2a3b,
        emissiveMap: verticalRoadTexture,
        emissiveIntensity: 0.24,
        roughness: 0.9,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
    });
    const roadMaterialOverlay = roadMaterial.clone();
    roadMaterialOverlay.map = horizontalRoadTexture;
    roadMaterialOverlay.emissiveMap = horizontalRoadTexture;
    roadMaterialOverlay.polygonOffsetFactor = -3;
    roadMaterialOverlay.polygonOffsetUnits = -3;
    const intersectionMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: intersectionSurfaceTexture,
        emissive: 0x152536,
        emissiveMap: intersectionSurfaceTexture,
        emissiveIntensity: 0.3,
        roughness: 0.88,
        metalness: 0.06,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
    });
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
    const verticalRoadGeometry = new THREE.PlaneGeometry(roadWidth, roadLength);
    const horizontalRoadGeometry = new THREE.PlaneGeometry(roadLength, roadWidth);
    const verticalSidewalkGeometry = new THREE.PlaneGeometry(sidewalkWidth, roadLength);
    const horizontalSidewalkGeometry = new THREE.PlaneGeometry(roadLength, sidewalkWidth);
    const intersectionGeometry = new THREE.PlaneGeometry(roadWidth, roadWidth);

    for (let gridX = -CITY_GRID_RANGE; gridX <= CITY_GRID_RANGE; gridX += 1) {
        if (Math.abs(gridX) % 2 !== 0) {
            continue;
        }

        const lineX = gridX * CITY_GRID_SPACING;
        const road = new THREE.Mesh(verticalRoadGeometry, roadMaterial);
        road.rotation.x = -Math.PI / 2;
        road.position.set(lineX, roadY, 0);
        layer.add(road);

        const sidewalkWest = new THREE.Mesh(verticalSidewalkGeometry, sidewalkMaterial);
        sidewalkWest.rotation.x = -Math.PI / 2;
        sidewalkWest.position.set(lineX - roadWidth * 0.5 - sidewalkWidth * 0.5, sidewalkY, 0);
        layer.add(sidewalkWest);

        const sidewalkEast = new THREE.Mesh(verticalSidewalkGeometry, sidewalkMaterial);
        sidewalkEast.rotation.x = -Math.PI / 2;
        sidewalkEast.position.set(lineX + roadWidth * 0.5 + sidewalkWidth * 0.5, sidewalkY, 0);
        layer.add(sidewalkEast);
    }

    for (let gridZ = -CITY_GRID_RANGE; gridZ <= CITY_GRID_RANGE; gridZ += 1) {
        if (Math.abs(gridZ) % 2 !== 0) {
            continue;
        }

        const lineZ = gridZ * CITY_GRID_SPACING;
        const road = new THREE.Mesh(horizontalRoadGeometry, roadMaterialOverlay);
        road.rotation.x = -Math.PI / 2;
        road.position.set(0, roadY, lineZ);
        layer.add(road);

        const sidewalkNorth = new THREE.Mesh(horizontalSidewalkGeometry, sidewalkMaterial);
        sidewalkNorth.rotation.x = -Math.PI / 2;
        sidewalkNorth.position.set(0, sidewalkY, lineZ - roadWidth * 0.5 - sidewalkWidth * 0.5);
        layer.add(sidewalkNorth);

        const sidewalkSouth = new THREE.Mesh(horizontalSidewalkGeometry, sidewalkMaterial);
        sidewalkSouth.rotation.x = -Math.PI / 2;
        sidewalkSouth.position.set(0, sidewalkY, lineZ + roadWidth * 0.5 + sidewalkWidth * 0.5);
        layer.add(sidewalkSouth);
    }

    for (let gridX = -CITY_GRID_RANGE; gridX <= CITY_GRID_RANGE; gridX += 1) {
        if (Math.abs(gridX) % 2 !== 0) {
            continue;
        }
        for (let gridZ = -CITY_GRID_RANGE; gridZ <= CITY_GRID_RANGE; gridZ += 1) {
            if (Math.abs(gridZ) % 2 !== 0) {
                continue;
            }
            const patch = new THREE.Mesh(intersectionGeometry, intersectionMaterial);
            patch.rotation.x = -Math.PI / 2;
            patch.position.set(gridX * CITY_GRID_SPACING, roadY + 0.004, gridZ * CITY_GRID_SPACING);
            layer.add(patch);
        }
    }

    return layer;
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

function createStreetLampLayer(lampLights) {
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
    const poolMaterial = new THREE.MeshBasicMaterial({
        color: 0xffd39a,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });

    const poleGeometry = new THREE.CylinderGeometry(0.22, 0.24, 8.6, 10);
    const headGeometry = new THREE.SphereGeometry(0.46, 10, 10);
    const poolGeometry = new THREE.CircleGeometry(6.2, 20);

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

            const pool = new THREE.Mesh(poolGeometry, poolMaterial);
            pool.position.set(positionX, baseY + 0.07, positionZ);
            pool.rotation.x = -Math.PI / 2;
            pool.scale.setScalar(0.9 + randomFromGrid(gridX, gridZ, 38) * 0.45);
            layer.add(pool);

            const canHaveLight =
                Math.abs(gridX) <= LAMP_REAL_LIGHT_GRID_RADIUS &&
                Math.abs(gridZ) <= LAMP_REAL_LIGHT_GRID_RADIUS;
            const isAlternatingSlot = Math.abs(gridX + gridZ) % 6 === 1;
            if (canHaveLight && isAlternatingSlot) {
                const light = new THREE.PointLight(0xffd6a1, 1.12, 34, 2);
                light.position.set(positionX, baseY + 8.2, positionZ);
                light.userData.baseIntensity = 1.08 + randomFromGrid(gridX, gridZ, 21) * 0.34;
                light.userData.flickerPhase = randomFromGrid(gridX, gridZ, 211) * Math.PI * 2;
                light.castShadow = false;
                lampLights.push(light);
                layer.add(light);
            }
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
