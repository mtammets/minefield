import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const sceneBackgroundColor = new THREE.Color(0x0c1524);
const sceneFog = new THREE.FogExp2(0x142238, 0.00062);
const renderSettings = {
    maxPixelRatio: 1,
    shadowsEnabled: false,
};
const CITY_GRID_SPACING = 42;
const CITY_GRID_RANGE = 6;
const CITY_ROAD_OFFSET = 10;
const SPEED_GLOW_MAX = 30;
const LAMP_REAL_LIGHT_GRID_RADIUS = 3;
const BUILDING_DISTRICT_RADIUS = 3;
const WORLD_HALF_SIZE = CITY_GRID_SPACING * (CITY_GRID_RANGE + 0.5);
const worldBounds = {
    minX: -WORLD_HALF_SIZE,
    maxX: WORLD_HALF_SIZE,
    minZ: -WORLD_HALF_SIZE,
    maxZ: WORLD_HALF_SIZE,
    size: WORLD_HALF_SIZE * 2,
};
const staticObstacles = [];

const ambientLight = new THREE.AmbientLight(0x3d4f72, 0.48);
const skyLight = new THREE.HemisphereLight(0x9ec2ff, 0x24354b, 0.54);
const sunLight = createLight('directional', {
    color: 0xe7eeff,
    intensity: 1.08,
    position: [110, 165, 82],
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
    staticObstacles,
    ambientLight,
    skyLight,
    sunLight,
    ground,
    cityScenery,
    worldBoundary,
    updateGroundMotion,
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
        roughness: 0.94,
        metalness: 0.03,
    });
    material.userData.baseEmissive = 0.052;
    material.emissive = new THREE.Color(0x233852);
    material.emissiveIntensity = material.userData.baseEmissive;

    const geometry = new THREE.PlaneGeometry(...size);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = positionY;
    mesh.receiveShadow = false;
    return mesh;
}

function updateGroundMotion(_playerPosition, playerSpeed = 0) {
    const speedRatio = THREE.MathUtils.clamp(Math.abs(playerSpeed) / SPEED_GLOW_MAX, 0, 1);
    const intensityBoost = speedRatio * 0.12;
    ground.material.emissiveIntensity = ground.material.userData.baseEmissive + intensityBoost;

    if (cityScenery.userData.lampLights.length > 0) {
        const lampBoost = 1.12 + speedRatio * 0.26;
        const lampFlicker = 0.992 + Math.sin(Date.now() * 0.002) * 0.008;
        cityScenery.userData.lampLights.forEach((light) => {
            light.intensity = light.userData.baseIntensity * lampBoost * lampFlicker;
        });
    }
}

function createWorldBoundary() {
    const boundary = new THREE.Group();
    boundary.name = 'worldBoundary';

    const wallHeight = 4.2;
    const wallThickness = 5;
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x2c3a50,
        emissive: 0x1b2235,
        emissiveIntensity: 0.38,
        roughness: 0.86,
        metalness: 0.12,
    });
    const topStripMaterial = new THREE.MeshBasicMaterial({
        color: 0x80b6ff,
        transparent: true,
        opacity: 0.65,
    });

    const horizontalLength = worldBounds.size + wallThickness * 2;
    const verticalLength = worldBounds.size + wallThickness * 2;

    const northSouthGeometry = new THREE.BoxGeometry(horizontalLength, wallHeight, wallThickness);
    const eastWestGeometry = new THREE.BoxGeometry(wallThickness, wallHeight, verticalLength);
    const stripHorizontalGeometry = new THREE.BoxGeometry(horizontalLength, 0.22, 0.4);
    const stripVerticalGeometry = new THREE.BoxGeometry(0.4, 0.22, verticalLength);

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

    const northStrip = new THREE.Mesh(stripHorizontalGeometry, topStripMaterial);
    northStrip.position.set(0, wallHeight + 0.05, worldBounds.minZ - wallThickness * 0.5);
    boundary.add(northStrip);

    const southStrip = new THREE.Mesh(stripHorizontalGeometry, topStripMaterial);
    southStrip.position.set(0, wallHeight + 0.05, worldBounds.maxZ + wallThickness * 0.5);
    boundary.add(southStrip);

    const westStrip = new THREE.Mesh(stripVerticalGeometry, topStripMaterial);
    westStrip.position.set(worldBounds.minX - wallThickness * 0.5, wallHeight + 0.05, 0);
    boundary.add(westStrip);

    const eastStrip = new THREE.Mesh(stripVerticalGeometry, topStripMaterial);
    eastStrip.position.set(worldBounds.maxX + wallThickness * 0.5, wallHeight + 0.05, 0);
    boundary.add(eastStrip);

    return boundary;
}

function createGroundTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#24354a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Neutral base noise so roads come from geometry, not random texture bands.
    for (let i = 0; i < 4800; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const value = 48 + Math.random() * 34;
        ctx.fillStyle = `rgba(${value}, ${value + 6}, ${value + 14}, 0.11)`;
        ctx.fillRect(x, y, 2.2, 2.2);
    }

    // Soft large-area variation to avoid a flat look.
    for (let i = 0; i < 18; i += 1) {
        const radius = 90 + Math.random() * 180;
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, 'rgba(210, 226, 255, 0.055)');
        gradient.addColorStop(1, 'rgba(210, 226, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 10);
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

function createRoadLayer() {
    const layer = new THREE.Group();
    layer.name = 'roadLayer';

    const roadWidth = 20;
    const sidewalkWidth = 4.4;
    const roadLength = worldBounds.size + CITY_GRID_SPACING * 2;
    const roadY = 0.028;
    const sidewalkY = 0.034;
    const markingY = 0.05;

    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x1b2736,
        emissive: 0x101722,
        emissiveIntensity: 0.42,
        roughness: 0.9,
        metalness: 0.04,
    });
    const intersectionMaterial = new THREE.MeshStandardMaterial({
        color: 0x202e3f,
        emissive: 0x141c2a,
        emissiveIntensity: 0.5,
        roughness: 0.86,
        metalness: 0.06,
    });
    const sidewalkMaterial = new THREE.MeshStandardMaterial({
        color: 0x42556e,
        emissive: 0x243449,
        emissiveIntensity: 0.3,
        roughness: 0.9,
        metalness: 0.08,
    });
    const centerLineMaterial = new THREE.MeshBasicMaterial({
        color: 0xffdf8f,
    });
    const verticalRoadGeometry = new THREE.PlaneGeometry(roadWidth, roadLength);
    const horizontalRoadGeometry = new THREE.PlaneGeometry(roadLength, roadWidth);
    const verticalSidewalkGeometry = new THREE.PlaneGeometry(sidewalkWidth, roadLength);
    const horizontalSidewalkGeometry = new THREE.PlaneGeometry(roadLength, sidewalkWidth);
    const verticalCenterLineGeometry = new THREE.PlaneGeometry(0.6, roadLength);
    const horizontalCenterLineGeometry = new THREE.PlaneGeometry(roadLength, 0.6);
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

        const centerLine = new THREE.Mesh(verticalCenterLineGeometry, centerLineMaterial);
        centerLine.rotation.x = -Math.PI / 2;
        centerLine.position.set(lineX, markingY, 0);
        layer.add(centerLine);
    }

    for (let gridZ = -CITY_GRID_RANGE; gridZ <= CITY_GRID_RANGE; gridZ += 1) {
        if (Math.abs(gridZ) % 2 !== 0) {
            continue;
        }

        const lineZ = gridZ * CITY_GRID_SPACING;
        const road = new THREE.Mesh(horizontalRoadGeometry, roadMaterial);
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

        const centerLine = new THREE.Mesh(horizontalCenterLineGeometry, centerLineMaterial);
        centerLine.rotation.x = -Math.PI / 2;
        centerLine.position.set(0, markingY, lineZ);
        layer.add(centerLine);
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
            patch.position.set(
                gridX * CITY_GRID_SPACING,
                roadY + 0.004,
                gridZ * CITY_GRID_SPACING
            );
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

    const buildings = new THREE.InstancedMesh(buildingGeometry, buildingMaterial, placements.length);
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
        addObstacleAabb(building.x, building.z, building.width, building.depth, -0.5);
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

    ctx.fillStyle = '#1a2537';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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

            ctx.fillStyle = lit ? 'rgba(255, 216, 150, 0.94)' : 'rgba(74, 103, 148, 0.2)';
            ctx.fillRect(px, py, cellW, cellH);
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
        dummy.position.set(tree.x, 1.25 * tree.scale, tree.z);
        dummy.scale.set(tree.scale, tree.scale, tree.scale);
        dummy.rotation.set(0, randomFromGrid(index, trees.length, 120) * Math.PI * 2, 0);
        dummy.updateMatrix();
        trunks.setMatrixAt(index, dummy.matrix);

        dummy.position.set(tree.x, 3.2 * tree.scale, tree.z);
        dummy.scale.set(tree.scale, tree.scale, tree.scale);
        dummy.updateMatrix();
        canopies.setMatrixAt(index, dummy.matrix);

        canopyColor.setHSL(0.33 + randomFromGrid(index, trees.length, 121) * 0.03, 0.42, 0.28);
        canopies.setColorAt(index, canopyColor);
        addObstacleCircle(tree.x, tree.z, 0.62 * tree.scale);
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
        color: 0x2a3240,
        roughness: 0.78,
        metalness: 0.25,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffd793,
        transparent: true,
        opacity: 0.92,
    });
    const poolMaterial = new THREE.MeshBasicMaterial({
        color: 0xffcf8f,
        transparent: true,
        opacity: 0.2,
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

            const positionX = gridX * CITY_GRID_SPACING + (Math.abs(gridX) % 2 === 0 ? CITY_ROAD_OFFSET : 0);
            const positionZ = gridZ * CITY_GRID_SPACING + (Math.abs(gridZ) % 2 === 0 ? CITY_ROAD_OFFSET : 0);

            const pole = new THREE.Mesh(poleGeometry, poleMaterial);
            pole.position.set(positionX, 4.3, positionZ);
            pole.castShadow = false;
            pole.receiveShadow = false;
            layer.add(pole);
            addObstacleCircle(positionX, positionZ, 0.58);

            const lampHead = new THREE.Mesh(headGeometry, glowMaterial);
            lampHead.position.set(positionX, 8.6, positionZ);
            layer.add(lampHead);

            const pool = new THREE.Mesh(poolGeometry, poolMaterial);
            pool.position.set(positionX, 0.07, positionZ);
            pool.rotation.x = -Math.PI / 2;
            pool.scale.setScalar(0.9 + randomFromGrid(gridX, gridZ, 38) * 0.45);
            layer.add(pool);

            const canHaveLight =
                Math.abs(gridX) <= LAMP_REAL_LIGHT_GRID_RADIUS &&
                Math.abs(gridZ) <= LAMP_REAL_LIGHT_GRID_RADIUS;
            const isAlternatingSlot = Math.abs(gridX + gridZ) % 4 === 1;
            if (canHaveLight && isAlternatingSlot) {
                const light = new THREE.PointLight(0xffcf8d, 1.35, 42, 2);
                light.position.set(positionX, 8.2, positionZ);
                light.userData.baseIntensity = 1.08 + randomFromGrid(gridX, gridZ, 21) * 0.34;
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
        Math.abs(gridX) <= BUILDING_DISTRICT_RADIUS &&
        Math.abs(gridZ) <= BUILDING_DISTRICT_RADIUS
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

function addObstacleCircle(x, z, radius) {
    staticObstacles.push({
        type: 'circle',
        x,
        z,
        radius,
    });
}

function addObstacleAabb(x, z, width, depth, padding = 0) {
    const halfWidth = Math.max(0.25, width * 0.5 + padding);
    const halfDepth = Math.max(0.25, depth * 0.5 + padding);
    staticObstacles.push({
        type: 'aabb',
        minX: x - halfWidth,
        maxX: x + halfWidth,
        minZ: z - halfDepth,
        maxZ: z + halfDepth,
    });
}
