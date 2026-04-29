import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { ROAD_WIDTH, SIDEWALK_WIDTH } from './config.js';
import { getBuildingPlacements } from './buildings.js';
import { getGroundHeightAt } from './terrain.js';
import { addObstacleCircle } from './obstacles.js';

const billboardImageCache = new Map();
const billboardTextureCache = new Map();
const billboardVideoSurfaceCache = new Map();

const BILLBOARD_ASSETS = {
    poster: {
        url: '/assets/billboards/planeet-hookus-pookus-poster.jpg',
        glowColor: 0xf56aff,
        accentColor: 0xf5f197,
    },
    portrait: {
        url: '/assets/billboards/planeet-hookus-pookus-portrait.png',
        glowColor: 0x6aa9ff,
        accentColor: 0xff7c4b,
    },
    summer: {
        url: '/assets/billboards/planeet-hookus-pookus-summer.png',
        glowColor: 0xff9e4f,
        accentColor: 0xffe185,
    },
    monumentOrb: {
        url: '/assets/billboards/monument-orb.png',
        glowColor: 0x7de3ff,
        accentColor: 0x9cff69,
    },
    monumentTitle: {
        url: '/assets/billboards/monument-title.png',
        glowColor: 0xff7de8,
        accentColor: 0xd8ff6f,
        focusX: 0.5,
        focusY: 0.48,
    },
    monumentRedPortrait: {
        url: '/assets/billboards/monument-red-portrait.png',
        glowColor: 0xff7a52,
        accentColor: 0xffb56b,
        focusX: 0.5,
        focusY: 0.38,
    },
    monumentWizardPortrait: {
        url: '/assets/billboards/monument-wizard-portrait.png',
        glowColor: 0xff7f3f,
        accentColor: 0xffcf75,
        focusX: 0.56,
        focusY: 0.4,
    },
    monumentDj: {
        url: '/assets/billboards/monument-dj-poster.jpg',
        glowColor: 0xff59d0,
        accentColor: 0x74ddff,
        focusX: 0.5,
        focusY: 0.5,
    },
    lorienVelmore: {
        glowColor: 0xfff1d1,
        accentColor: 0xc9ac84,
        drawTexture: drawLorienVelmoreLightboxTexture,
    },
    animaator: {
        glowColor: 0x00d8ff,
        accentColor: 0x5cefff,
        drawTexture: drawAnimaatorNeonTexture,
    },
};

const WIDE_PLAYLIST = ['poster', 'summer', 'portrait'];
const TALL_PLAYLIST = ['portrait', 'summer', 'poster'];
const TOTEM_PLAYLIST = ['monumentWizardPortrait', 'monumentTitle', 'monumentRedPortrait'];
const SPAWN_VIEW_TARGET = { x: 0, z: -76 };
const LANDSCAPE_SCREEN_TOP_CROP_FOCUS_Y = 0.34;

let glowTexture = null;

export function createBillboardLayer(screenEntries = []) {
    const layer = new THREE.Group();
    layer.name = 'billboardLayer';
    const streetKioskPlacements = [
        { x: -71.2, z: -39.2, rotationY: 0 },
        { x: -71.2, z: 8.8, rotationY: 0 },
        { x: -71.2, z: 40.8, rotationY: 0 },
        { x: 71.2, z: -39.2, rotationY: 0 },
        { x: 71.2, z: 8.8, rotationY: 0 },
        { x: 71.2, z: 40.8, rotationY: 0 },
        { x: -23.2, z: -71.2, rotationY: Math.PI / 2 },
        { x: 24.8, z: -71.2, rotationY: Math.PI / 2 },
        { x: -23.2, z: 71.2, rotationY: Math.PI / 2 },
        { x: 24.8, z: 71.2, rotationY: Math.PI / 2 },
    ];

    const buildingPlacements = new Map(
        getBuildingPlacements().map((placement) => [
            `${placement.gridX}:${placement.gridZ}`,
            placement,
        ])
    );

    addWallMountedBillboard(layer, screenEntries, buildingPlacements.get('-1:-3'), {
        face: 'north',
        playlistKeys: WIDE_PLAYLIST,
        width: 13.6,
        height: 7.65,
        verticalRatio: 0.52,
        surfaceOffset: 0.24,
        mountArmLength: 0,
        displayYawOffset: 0,
        flushToWall: true,
        cycleIntervalMs: 5200,
        phaseOffsetMs: 900,
    });
    addWallMountedBillboard(layer, screenEntries, buildingPlacements.get('1:3'), {
        face: 'south',
        playlistKeys: TALL_PLAYLIST,
        width: 5.4,
        height: 8.9,
        verticalRatio: 0.3,
        surfaceOffset: 0.26,
        mountArmLength: 0,
        displayYawOffset: 0,
        flushToWall: true,
        cycleIntervalMs: 4600,
        phaseOffsetMs: 2300,
    });
    addWallMountedVideoBillboard(layer, screenEntries, buildingPlacements.get('1:-3'), {
        face: 'north',
        width: 6.4,
        height: 20.8,
        verticalRatio: 0.34,
        surfaceOffset: 0.26,
        mountArmLength: 0,
        displayYawOffset: 0,
        flushToWall: true,
        lateralOffset: 3.2,
        videoUrls: [
            '/assets/billboards/lisett-kulmats-wall-led.mp4',
            '/assets/billboards/model.mp4',
            '/assets/billboards/model2.mp4',
        ],
        videoCropFocusX: 0.5,
        videoCropFocusY: 0.34,
        videoTargetFps: 18,
        accentAssetKey: 'monumentRedPortrait',
    });
    addWallMountedLightbox(layer, buildingPlacements.get('-1:3'), {
        face: 'south',
        assetKey: 'lorienVelmore',
        clickUrl: 'https://lorienvelmore.com/',
        width: 10.8,
        height: 2.45,
        verticalRatio: 0.28,
        surfaceOffset: 0.2,
        mountArmLength: 0,
        displayYawOffset: 0,
        flushToWall: true,
        styleConfig: {
            depth: 0.18,
            framePadding: 0.14,
            shellColor: 0xe7decf,
            shellRoughness: 0.52,
            shellMetalness: 0.18,
            shellEmissiveIntensity: 0.08,
            trimTopScale: 0.985,
            trimBottomScale: 0.985,
            trimTopThickness: 0.04,
            trimBottomThickness: 0.04,
            trimTopOffset: 0.028,
            trimBottomOffset: 0.028,
            frontGlowScale: 1.04,
            backGlowScale: 1.01,
            frontGlowOpacity: 0.16,
            backGlowOpacity: 0.04,
        },
    });
    addWallNeonSign(layer, buildingPlacements.get('-3:-1'), {
        face: 'east',
        assetKey: 'animaator',
        width: 10.8,
        height: 2.35,
        verticalRatio: 0.3,
        surfaceOffset: 0.1,
        lateralOffset: 2.4,
    });
    streetKioskPlacements.forEach((placement, index) => {
        addStreetKiosk(layer, screenEntries, {
            x: placement.x,
            z: placement.z,
            rotationY: placement.rotationY,
            width: 3.7,
            height: 6.9,
            screenCenterY: 3.75,
            playlistKeys: TOTEM_PLAYLIST,
            cycleIntervalMs: 4300 + (index % 3) * 260,
            phaseOffsetMs: 2600 + index * 420,
            obstacleRadius: 0.95,
        });
    });

    addPoleMountedBillboard(layer, screenEntries, {
        x: roadSideX(0, 'east', 4.2),
        z: -82,
        playlistKeys: WIDE_PLAYLIST,
        width: 9.6,
        height: 5.4,
        screenCenterY: 10.6,
        rotationY: resolveScreenAngleToward(roadSideX(0, 'east', 4.2), -82),
        poleCount: 2,
        poleSpacing: 4.8,
        obstacleRadius: 2.1,
        cycleIntervalMs: 5000,
        phaseOffsetMs: 0,
    });
    addPoleMountedBillboard(layer, screenEntries, {
        x: roadSideX(32, 'west', 0),
        z: -10,
        playlistKeys: TALL_PLAYLIST,
        width: 5,
        height: 7.6,
        screenCenterY: 5.8,
        rotationY: resolveScreenAngleToward(roadSideX(32, 'west', 0), -10),
        poleCount: 1,
        poleSpacing: 0,
        obstacleRadius: 0.9,
        cycleIntervalMs: 4300,
        phaseOffsetMs: 1600,
    });
    addPoleMountedBillboard(layer, screenEntries, {
        x: roadSideX(-32, 'east', 0),
        z: 14,
        playlistKeys: TALL_PLAYLIST,
        width: 5,
        height: 7.6,
        screenCenterY: 5.8,
        rotationY: resolveScreenAngleToward(roadSideX(-32, 'east', 0), 14),
        poleCount: 1,
        poleSpacing: 0,
        obstacleRadius: 0.9,
        cycleIntervalMs: 4800,
        phaseOffsetMs: 3200,
    });

    return layer;
}

export function updateBillboardRuntime(cityScenery) {
    const billboardScreens = cityScenery?.userData?.billboardScreens || [];
    if (billboardScreens.length === 0) {
        return;
    }

    const now = performance.now();
    billboardScreens.forEach((screenEntry) => {
        if (typeof screenEntry.customUpdate === 'function') {
            screenEntry.customUpdate(now);
        } else {
            const playlistLength = screenEntry.playlistKeys.length;
            if (playlistLength === 0) {
                return;
            }

            const nextIndex =
                Math.floor((now + screenEntry.phaseOffsetMs) / screenEntry.cycleIntervalMs) %
                playlistLength;
            if (nextIndex !== screenEntry.currentIndex) {
                applyScreenAsset(screenEntry, nextIndex);
            }
        }

        const pulse = 0.94 + Math.sin(now * screenEntry.pulseSpeed + screenEntry.pulsePhase) * 0.06;
        screenEntry.screenMaterials.forEach((material) => {
            material.color.setScalar(pulse + 0.12);
        });
        screenEntry.glowMaterials.forEach((material) => {
            material.opacity = material.userData.baseOpacity * (0.94 + pulse * 0.24);
        });
        screenEntry.trimMaterials.forEach((material) => {
            material.opacity = material.userData.baseOpacity * (0.9 + pulse * 0.16);
        });
    });
}

function addWallMountedBillboard(layer, screenEntries, placement, options) {
    if (!placement) {
        return;
    }

    const mount = resolveBuildingFaceMount(placement, options.face, options.surfaceOffset);
    if (!mount) {
        return;
    }

    const width = Math.min(options.width, mount.faceSpan - 1.6);
    const height = options.height;
    const centerY = resolveWallBillboardCenterY({
        buildingHeight: placement.height,
        height,
        verticalRatio: options.verticalRatio,
    });

    const billboard = createWallMountedBillboardMesh({
        width,
        height,
        mountArmLength: options.mountArmLength,
        displayYawOffset: options.displayYawOffset,
        flushToWall: options.flushToWall,
        playlistKeys: options.playlistKeys,
        screenEntries,
        cycleIntervalMs: options.cycleIntervalMs,
        phaseOffsetMs: options.phaseOffsetMs,
    });
    const anchor = resolveWallBillboardAnchor(mount, options.face, width, options.lateralOffset);
    billboard.position.set(anchor.x, centerY, anchor.z);
    billboard.rotation.y = mount.rotationY;
    layer.add(billboard);
}

function addWallMountedVideoBillboard(layer, screenEntries, placement, options) {
    if (!placement) {
        return;
    }

    const mount = resolveBuildingFaceMount(placement, options.face, options.surfaceOffset);
    if (!mount) {
        return;
    }

    const width = Math.min(options.width, mount.faceSpan - 1.6);
    const height = options.height;
    const centerY = resolveWallBillboardCenterY({
        buildingHeight: placement.height,
        height,
        verticalRatio: options.verticalRatio,
    });

    const billboard = createWallMountedVideoBillboardMesh({
        width,
        height,
        mountArmLength: options.mountArmLength,
        displayYawOffset: options.displayYawOffset,
        flushToWall: options.flushToWall,
        videoUrl: options.videoUrl,
        videoUrls: options.videoUrls,
        videoCropFocusX: options.videoCropFocusX,
        videoCropFocusY: options.videoCropFocusY,
        videoTargetFps: options.videoTargetFps,
        accentAssetKey: options.accentAssetKey,
        screenEntries,
    });
    const anchor = resolveWallBillboardAnchor(mount, options.face, width, options.lateralOffset);
    billboard.position.set(anchor.x, centerY, anchor.z);
    billboard.rotation.y = mount.rotationY;
    layer.add(billboard);
}

function addWallMountedLightbox(layer, placement, options) {
    if (!placement) {
        return;
    }

    const mount = resolveBuildingFaceMount(placement, options.face, options.surfaceOffset);
    if (!mount) {
        return;
    }

    const assetKey = BILLBOARD_ASSETS[options.assetKey] ? options.assetKey : 'lorienVelmore';
    const width = Math.min(options.width, mount.faceSpan - 1.2);
    const height = options.height;
    const centerY = resolveWallBillboardCenterY({
        buildingHeight: placement.height,
        height,
        verticalRatio: options.verticalRatio,
    });
    const texture = getBillboardTextureInternal(assetKey, width / height);
    const panel = createDisplayPanel({
        width,
        height,
        playlistKeys: [assetKey],
        doubleSided: !options.flushToWall,
        screenEntries: null,
        registerRuntimeEntry: false,
        initialTexture: texture,
        initialAssetKey: assetKey,
        styleConfig: options.styleConfig || {},
    });
    const lightbox = createWallMountedDisplayAssembly({
        width,
        height,
        mountArmLength: options.mountArmLength,
        displayYawOffset: options.displayYawOffset,
        flushToWall: options.flushToWall,
        panel,
    });
    const anchor = resolveWallBillboardAnchor(mount, options.face, width, options.lateralOffset);
    lightbox.position.set(anchor.x, centerY, anchor.z);
    lightbox.rotation.y = mount.rotationY;
    if (typeof options.clickUrl === 'string' && options.clickUrl) {
        lightbox.userData.clickUrl = options.clickUrl;
    }
    layer.add(lightbox);
}

function addWallNeonSign(layer, placement, options) {
    if (!placement) {
        return;
    }

    const mount = resolveBuildingFaceMount(placement, options.face, options.surfaceOffset);
    if (!mount) {
        return;
    }

    const assetKey = BILLBOARD_ASSETS[options.assetKey] ? options.assetKey : 'animaator';
    const width = Math.min(options.width, mount.faceSpan - 1);
    const height = options.height;
    const centerY = resolveWallBillboardCenterY({
        buildingHeight: placement.height,
        height,
        verticalRatio: options.verticalRatio,
    });
    const sign = createWallNeonSignMesh({
        width,
        height,
        assetKey,
    });
    const anchor = resolveWallBillboardAnchor(mount, options.face, width, options.lateralOffset);
    sign.position.set(anchor.x, centerY, anchor.z);
    sign.rotation.y = mount.rotationY;
    layer.add(sign);
}

function addPoleMountedBillboard(layer, screenEntries, options) {
    const baseY = getGroundHeightAt(options.x, options.z);
    const billboard = createPoleMountedBillboardMesh({
        width: options.width,
        height: options.height,
        screenCenterY: options.screenCenterY,
        poleCount: options.poleCount,
        poleSpacing: options.poleSpacing,
        playlistKeys: options.playlistKeys,
        screenEntries,
        cycleIntervalMs: options.cycleIntervalMs,
        phaseOffsetMs: options.phaseOffsetMs,
    });
    billboard.position.set(options.x, baseY, options.z);
    billboard.rotation.y = options.rotationY || 0;
    layer.add(billboard);

    addObstacleCircle(options.x, options.z, options.obstacleRadius || 0.85, 'billboard_support');
}

function addStreetKiosk(layer, screenEntries, options) {
    const baseY = getGroundHeightAt(options.x, options.z);
    const kiosk = createStreetKioskMesh({
        width: options.width,
        height: options.height,
        screenCenterY: options.screenCenterY,
        playlistKeys: options.playlistKeys,
        screenEntries,
        cycleIntervalMs: options.cycleIntervalMs,
        phaseOffsetMs: options.phaseOffsetMs,
    });
    kiosk.position.set(options.x, baseY, options.z);
    kiosk.rotation.y = options.rotationY || 0;
    layer.add(kiosk);

    addObstacleCircle(options.x, options.z, options.obstacleRadius || 0.9, 'billboard_kiosk');
}

function createWallMountedBillboardMesh({
    width,
    height,
    mountArmLength = 0.52,
    displayYawOffset = 0,
    flushToWall = false,
    playlistKeys,
    screenEntries,
    cycleIntervalMs,
    phaseOffsetMs,
}) {
    const panel = createDisplayPanel({
        width,
        height,
        playlistKeys,
        doubleSided: !flushToWall,
        screenEntries,
        cycleIntervalMs,
        phaseOffsetMs,
    });
    return createWallMountedDisplayAssembly({
        width,
        height,
        mountArmLength,
        displayYawOffset,
        flushToWall,
        panel,
    });
}

function createWallMountedVideoBillboardMesh({
    width,
    height,
    mountArmLength = 0.52,
    displayYawOffset = 0,
    flushToWall = false,
    videoUrl,
    videoUrls,
    videoCropFocusX = 0.5,
    videoCropFocusY = 0.5,
    videoTargetFps = 24,
    accentAssetKey = 'portrait',
    screenEntries,
}) {
    const panel = createVideoDisplayPanel({
        width,
        height,
        doubleSided: !flushToWall,
        screenEntries,
        videoUrl,
        videoUrls,
        videoCropFocusX,
        videoCropFocusY,
        videoTargetFps,
        accentAssetKey,
    });
    return createWallMountedDisplayAssembly({
        width,
        height,
        mountArmLength,
        displayYawOffset,
        flushToWall,
        panel,
    });
}

function createWallMountedDisplayAssembly({
    width,
    height,
    mountArmLength = 0.52,
    displayYawOffset = 0,
    flushToWall = false,
    panel,
}) {
    const group = new THREE.Group();
    const safeMountArmLength = flushToWall ? 0 : Math.max(0, mountArmLength);
    if (!flushToWall) {
        const braceMaterial = createMountMaterial();
        const braceLength = safeMountArmLength + panel.depth * 0.42;
        const braceGeometry = new THREE.BoxGeometry(0.22, 0.22, braceLength);

        [-width * 0.3, width * 0.3].forEach((braceX) => {
            const brace = new THREE.Mesh(braceGeometry, braceMaterial);
            brace.position.set(braceX, 0, braceLength * 0.5);
            group.add(brace);
        });

        const rail = new THREE.Mesh(
            new THREE.BoxGeometry(Math.max(2.2, width * 0.68), 0.14, 0.14),
            braceMaterial
        );
        rail.position.set(0, -height * 0.18, 0.12);
        group.add(rail);
    }

    panel.group.position.z = safeMountArmLength + panel.depth * 0.5;
    panel.group.rotation.y = flushToWall ? 0 : displayYawOffset;
    group.add(panel.group);
    return group;
}

function createPoleMountedBillboardMesh({
    width,
    height,
    screenCenterY = 5,
    poleCount = 1,
    poleSpacing = 0,
    playlistKeys,
    screenEntries,
    cycleIntervalMs,
    phaseOffsetMs,
}) {
    const group = new THREE.Group();
    const poleMaterial = createMountMaterial();
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: 0x202a38,
        roughness: 0.82,
        metalness: 0.38,
    });
    const panel = createDisplayPanel({
        width,
        height,
        playlistKeys,
        doubleSided: true,
        screenEntries,
        cycleIntervalMs,
        phaseOffsetMs,
    });

    const supportHeight = Math.max(1.8, screenCenterY - height * 0.5 - 0.4);
    const poleHeight = screenCenterY + height * 0.15;
    const poleGeometry = new THREE.CylinderGeometry(0.18, 0.22, poleHeight, 10);
    const poleOffsets = resolvePoleOffsets(poleCount, poleSpacing);
    poleOffsets.forEach((poleX) => {
        const pole = new THREE.Mesh(poleGeometry, poleMaterial);
        pole.position.set(poleX, poleHeight * 0.5, 0);
        group.add(pole);

        const footing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.32, 0.9), baseMaterial);
        footing.position.set(poleX, 0.16, 0);
        group.add(footing);
    });

    const crossBeam = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(1.6, Math.abs(poleSpacing) + width * 0.28), 0.16, 0.16),
        poleMaterial
    );
    crossBeam.position.set(0, supportHeight, 0);
    group.add(crossBeam);

    if (poleCount === 1) {
        const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 1.2), baseMaterial);
        pedestal.position.set(0, 0.225, 0);
        group.add(pedestal);
    }

    panel.group.position.set(0, screenCenterY, 0);
    group.add(panel.group);
    return group;
}

function createStreetKioskMesh({
    width,
    height,
    screenCenterY = 3.6,
    playlistKeys,
    screenEntries,
    cycleIntervalMs,
    phaseOffsetMs,
}) {
    const group = new THREE.Group();
    const kioskBodyMaterial = new THREE.MeshStandardMaterial({
        color: 0x10161f,
        roughness: 0.46,
        metalness: 0.52,
        emissive: 0x05090f,
        emissiveIntensity: 0.18,
    });
    const base = new THREE.Mesh(new THREE.BoxGeometry(width * 0.64, 0.28, 0.92), kioskBodyMaterial);
    base.position.y = 0.14;
    group.add(base);

    const cabinet = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.34, height + 0.4, 0.92),
        kioskBodyMaterial
    );
    cabinet.position.y = screenCenterY;
    group.add(cabinet);

    const panel = createDisplayPanel({
        width,
        height,
        playlistKeys,
        doubleSided: true,
        screenEntries,
        cycleIntervalMs,
        phaseOffsetMs,
        styleConfig: {
            depth: 0.92,
            framePadding: 0.14,
            shellColor: 0x131a23,
            shellRoughness: 0.34,
            shellMetalness: 0.66,
            shellEmissiveIntensity: 0.24,
            trimTopScale: 0.95,
            trimBottomScale: 0.9,
            trimTopThickness: 0.05,
            trimBottomThickness: 0.05,
            trimTopOffset: 0.03,
            trimBottomOffset: 0.03,
            frontGlowScale: 1.06,
            backGlowScale: 1.04,
            frontGlowOpacity: 0.18,
            backGlowOpacity: 0.14,
        },
    });
    panel.group.position.set(0, screenCenterY, 0);
    group.add(panel.group);

    const roofLip = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.42, 0.08, 0.96),
        kioskBodyMaterial
    );
    roofLip.position.y = screenCenterY + height * 0.5 + 0.24;
    group.add(roofLip);

    return group;
}

function createWallNeonSignMesh({ width, height, assetKey = 'animaator' }) {
    const group = new THREE.Group();
    const texture = getBillboardTextureInternal(assetKey, width / height);
    const braceMaterial = new THREE.MeshStandardMaterial({
        color: 0x17314a,
        roughness: 0.42,
        metalness: 0.62,
        emissive: 0x081725,
        emissiveIntensity: 0.2,
    });

    const textMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.004,
        depthWrite: false,
        toneMapped: false,
    });

    [-width * 0.34, width * 0.34].forEach((strutX) => {
        const strut = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, height * 0.72, 0.08),
            braceMaterial
        );
        strut.position.set(strutX, 0, -0.012);
        group.add(strut);
    });

    const topBrace = new THREE.Mesh(new THREE.BoxGeometry(width * 0.82, 0.08, 0.06), braceMaterial);
    topBrace.position.set(0, height * 0.24, -0.02);
    group.add(topBrace);

    const bottomBrace = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.76, 0.06, 0.06),
        braceMaterial
    );
    bottomBrace.position.set(0, -height * 0.24, -0.02);
    group.add(bottomBrace);

    const textPlane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), textMaterial);
    textPlane.position.z = 0.038;
    group.add(textPlane);

    return group;
}

export function createLedDisplayPanel(options) {
    return createDisplayPanel(options);
}

export function createVideoDisplayPanel({
    width,
    height,
    doubleSided = true,
    screenEntries,
    videoUrl,
    videoUrls,
    videoCropFocusX = 0.5,
    videoCropFocusY = 0.5,
    videoTargetFps = 24,
    accentAssetKey = 'portrait',
    styleConfig = {},
}) {
    const safeAccentAssetKey = BILLBOARD_ASSETS[accentAssetKey] ? accentAssetKey : 'portrait';
    const resolvedVideoUrls = resolveVideoUrlList(videoUrls, videoUrl);
    const videoSurface = getBillboardVideoSurface({
        videoUrls: resolvedVideoUrls,
        targetAspect: width / height,
        focusX: videoCropFocusX,
        focusY: videoCropFocusY,
        targetFps: videoTargetFps,
        accentAssetKey: safeAccentAssetKey,
    });
    const panel = createDisplayPanel({
        width,
        height,
        playlistKeys: [safeAccentAssetKey],
        doubleSided,
        screenEntries: null,
        styleConfig,
        registerRuntimeEntry: false,
        initialTexture: videoSurface.texture,
        initialAssetKey: safeAccentAssetKey,
    });

    if (screenEntries) {
        screenEntries.push({
            playlistKeys: [safeAccentAssetKey],
            currentIndex: 0,
            cycleIntervalMs: Number.POSITIVE_INFINITY,
            phaseOffsetMs: 0,
            pulseSpeed: 0.002 + Math.random() * 0.0008,
            pulsePhase: Math.random() * Math.PI * 2,
            screenMaterials: panel.screenMaterials,
            glowMaterials: panel.glowMaterials,
            trimMaterials: panel.trimMaterials,
            aspect: width / height,
            customUpdate(now) {
                videoSurface.update(now);
            },
        });
    }

    return panel;
}

export function getBillboardAssetConfig(assetKey) {
    return BILLBOARD_ASSETS[assetKey] || null;
}

export function getBillboardTexture(assetKey, targetAspect) {
    return getBillboardTextureInternal(assetKey, targetAspect);
}

export function resolveBillboardCanvasSize(targetAspect) {
    const safeAspect = Math.max(0.05, Number(targetAspect) || 1);
    if (safeAspect >= 1) {
        let width = 1024;
        let height = Math.max(1, Math.round(width / safeAspect));
        if (height < 256) {
            height = 256;
            width = Math.max(256, Math.round(height * safeAspect));
        }
        return { width, height };
    }

    let height = 896;
    let width = Math.max(1, Math.round(height * safeAspect));
    if (width < 256) {
        width = 256;
        height = Math.max(256, Math.round(width / safeAspect));
    }
    return { width, height };
}

function getBillboardVideoSurface({
    videoUrl,
    videoUrls,
    targetAspect,
    focusX = 0.5,
    focusY = 0.5,
    targetFps = 24,
    accentAssetKey = 'portrait',
}) {
    const resolvedVideoUrls = resolveVideoUrlList(videoUrls, videoUrl);
    const cacheKey = [
        resolvedVideoUrls.join('|'),
        targetAspect.toFixed(3),
        focusX.toFixed(3),
        focusY.toFixed(3),
        Math.max(12, Math.round(targetFps)),
        accentAssetKey,
    ].join(':');
    const cached = billboardVideoSurfaceCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const asset = BILLBOARD_ASSETS[accentAssetKey] || BILLBOARD_ASSETS.portrait;
    const canvas = document.createElement('canvas');
    const canvasSize = resolveBillboardCanvasSize(targetAspect);
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    const ctx = canvas.getContext('2d');
    drawBillboardFallback(ctx, canvas, asset);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.crossOrigin = 'anonymous';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    const surface = {
        texture,
        update,
    };

    let currentVideoIndex = 0;
    let currentVideoUrl = null;
    let lastDrawTime = -Infinity;
    let lastVideoTime = -1;
    let lastPlayAttemptTime = -Infinity;
    const frameIntervalMs = 1000 / Math.max(12, targetFps);

    function tryPlay(now = performance.now()) {
        if (now - lastPlayAttemptTime < 1200) {
            return;
        }

        lastPlayAttemptTime = now;
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
        }
    }

    function redrawFrame() {
        if (
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
            !video.videoWidth ||
            !video.videoHeight
        ) {
            return false;
        }

        drawLedVideoCreative(ctx, canvas, video, {
            ...asset,
            focusX,
            focusY,
        });
        texture.needsUpdate = true;
        lastVideoTime = video.currentTime;
        return true;
    }

    function loadVideoAtIndex(index, shouldAutoplay = true) {
        if (resolvedVideoUrls.length === 0) {
            return;
        }

        currentVideoIndex =
            ((index % resolvedVideoUrls.length) + resolvedVideoUrls.length) %
            resolvedVideoUrls.length;
        const nextVideoUrl = resolvedVideoUrls[currentVideoIndex];
        const shouldLoop = resolvedVideoUrls.length === 1;
        if (currentVideoUrl === nextVideoUrl && video.loop === shouldLoop) {
            if (shouldAutoplay) {
                tryPlay();
            }
            return;
        }

        currentVideoUrl = nextVideoUrl;
        lastDrawTime = -Infinity;
        lastVideoTime = -1;
        video.pause();
        video.loop = shouldLoop;
        video.removeAttribute('src');
        video.src = nextVideoUrl;
        video.load();
        if (shouldAutoplay) {
            tryPlay();
        }
    }

    function advancePlaylist() {
        if (resolvedVideoUrls.length <= 1) {
            return;
        }
        loadVideoAtIndex(currentVideoIndex + 1);
    }

    function update(now) {
        if (resolvedVideoUrls.length > 1 && video.ended) {
            advancePlaylist();
            return;
        }

        if (
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            (video.paused || video.ended)
        ) {
            tryPlay(now);
        }

        if (
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
            !video.videoWidth ||
            !video.videoHeight
        ) {
            return;
        }

        const hasNewFrame = video.currentTime !== lastVideoTime;
        const elapsed = now - lastDrawTime;
        if (lastDrawTime > 0 && (!hasNewFrame || elapsed < frameIntervalMs * 0.8)) {
            return;
        }

        if (redrawFrame()) {
            lastDrawTime = now;
        }
    }

    video.addEventListener('loadeddata', () => {
        redrawFrame();
        tryPlay();
    });
    video.addEventListener('canplay', () => {
        tryPlay();
    });
    video.addEventListener('ended', () => {
        advancePlaylist();
    });
    loadVideoAtIndex(0);

    billboardVideoSurfaceCache.set(cacheKey, surface);
    return surface;
}

function resolveVideoUrlList(videoUrls, videoUrl) {
    if (Array.isArray(videoUrls)) {
        const filteredUrls = videoUrls.filter(
            (entry) => typeof entry === 'string' && entry.length > 0
        );
        if (filteredUrls.length > 0) {
            return filteredUrls;
        }
    }

    if (typeof videoUrl === 'string' && videoUrl.length > 0) {
        return [videoUrl];
    }

    return [];
}

function createDisplayPanel({
    width,
    height,
    playlistKeys = [],
    doubleSided = true,
    screenEntries,
    cycleIntervalMs = 5000,
    phaseOffsetMs = 0,
    styleConfig = {},
    registerRuntimeEntry = true,
    initialTexture = null,
    initialAssetKey = null,
}) {
    const group = new THREE.Group();
    const depth = styleConfig.depth ?? 0.52;
    const framePadding = styleConfig.framePadding ?? 0.34;
    const frontGlowScale = styleConfig.frontGlowScale ?? 1.18;
    const backGlowScale = styleConfig.backGlowScale ?? 1.14;
    const frontGlowOpacity = styleConfig.frontGlowOpacity ?? 0.28;
    const backGlowOpacity = styleConfig.backGlowOpacity ?? 0.22;
    const shellMaterial = new THREE.MeshStandardMaterial({
        color: styleConfig.shellColor ?? 0x111923,
        roughness: styleConfig.shellRoughness ?? 0.38,
        metalness: styleConfig.shellMetalness ?? 0.68,
        emissive: 0x070d14,
        emissiveIntensity: styleConfig.shellEmissiveIntensity ?? 0.44,
    });
    const shell = new THREE.Mesh(
        new THREE.BoxGeometry(width + framePadding * 2, height + framePadding * 2, depth),
        shellMaterial
    );
    group.add(shell);

    const resolvedInitialAssetKey = initialAssetKey || playlistKeys[0];
    const texture =
        initialTexture || getBillboardTextureInternal(resolvedInitialAssetKey, width / height);
    const screenMaterial = createLedScreenMaterial(texture);
    const trimMaterial = createTrimMaterial(
        BILLBOARD_ASSETS[resolvedInitialAssetKey]?.accentColor || 0xffffff
    );

    addScreenTrim(group, width, height, depth, trimMaterial, styleConfig);

    const screenGeometry = new THREE.PlaneGeometry(width, height);
    const frontScreen = new THREE.Mesh(screenGeometry, screenMaterial);
    frontScreen.position.z = depth * 0.5 + 0.018;
    group.add(frontScreen);

    const frontGlowMaterial = createGlowMaterial(
        BILLBOARD_ASSETS[resolvedInitialAssetKey]?.glowColor || 0xffffff,
        frontGlowOpacity
    );
    const frontGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(width * frontGlowScale, height * frontGlowScale),
        frontGlowMaterial
    );
    frontGlow.position.z = depth * 0.5 + 0.01;
    group.add(frontGlow);

    const screenMaterials = [screenMaterial];
    const glowMaterials = [frontGlowMaterial];
    const trimMaterials = [trimMaterial];

    if (doubleSided) {
        const backScreenMaterial = createLedScreenMaterial(texture);
        const backScreen = new THREE.Mesh(screenGeometry, backScreenMaterial);
        backScreen.position.z = -(depth * 0.5 + 0.018);
        backScreen.rotation.y = Math.PI;
        group.add(backScreen);
        screenMaterials.push(backScreenMaterial);

        const backGlowMaterial = createGlowMaterial(
            BILLBOARD_ASSETS[resolvedInitialAssetKey]?.glowColor || 0xffffff,
            backGlowOpacity
        );
        const backGlow = new THREE.Mesh(
            new THREE.PlaneGeometry(width * backGlowScale, height * backGlowScale),
            backGlowMaterial
        );
        backGlow.position.z = -(depth * 0.5 + 0.01);
        backGlow.rotation.y = Math.PI;
        group.add(backGlow);
        glowMaterials.push(backGlowMaterial);
    }

    const screenEntry = {
        playlistKeys,
        currentIndex: -1,
        cycleIntervalMs: Math.max(2800, cycleIntervalMs),
        phaseOffsetMs,
        pulseSpeed: 0.002 + Math.random() * 0.0008,
        pulsePhase: Math.random() * Math.PI * 2,
        screenMaterials,
        glowMaterials,
        trimMaterials,
        aspect: width / height,
    };
    if (registerRuntimeEntry && screenEntries) {
        screenEntries.push(screenEntry);
        applyScreenAsset(screenEntry, 0);
    } else {
        screenEntry.currentIndex = 0;
    }

    return { group, depth, screenMaterials, glowMaterials, trimMaterials, aspect: width / height };
}

function addScreenTrim(group, width, height, depth, trimMaterial, styleConfig = {}) {
    const topTrimScale = styleConfig.trimTopScale ?? 0.92;
    const bottomTrimScale = styleConfig.trimBottomScale ?? 0.84;
    const topTrimThickness = styleConfig.trimTopThickness ?? 0.1;
    const bottomTrimThickness = styleConfig.trimBottomThickness ?? 0.08;
    const topTrimOffset = styleConfig.trimTopOffset ?? 0.08;
    const bottomTrimOffset = styleConfig.trimBottomOffset ?? 0.07;

    const topTrim = new THREE.Mesh(
        new THREE.BoxGeometry(width * topTrimScale, topTrimThickness, 0.04),
        trimMaterial
    );
    topTrim.position.set(0, height * 0.5 + topTrimOffset, depth * 0.5 + 0.012);
    group.add(topTrim);

    const bottomTrim = new THREE.Mesh(
        new THREE.BoxGeometry(width * bottomTrimScale, bottomTrimThickness, 0.04),
        trimMaterial
    );
    bottomTrim.position.set(0, -(height * 0.5 + bottomTrimOffset), depth * 0.5 + 0.012);
    group.add(bottomTrim);
}

function applyScreenAsset(screenEntry, assetIndex) {
    const assetKey = screenEntry.playlistKeys[assetIndex];
    const asset = BILLBOARD_ASSETS[assetKey];
    if (!asset) {
        return;
    }

    const texture = getBillboardTexture(assetKey, screenEntry.aspect);
    screenEntry.screenMaterials.forEach((material) => {
        material.map = texture;
        material.needsUpdate = true;
    });
    screenEntry.glowMaterials.forEach((material) => {
        material.color.setHex(asset.glowColor);
    });
    screenEntry.trimMaterials.forEach((material) => {
        material.color.setHex(asset.accentColor);
    });
    screenEntry.currentIndex = assetIndex;
}

function createLedScreenMaterial(texture) {
    return new THREE.MeshBasicMaterial({
        map: texture,
        color: new THREE.Color(1.08, 1.08, 1.08),
        toneMapped: false,
    });
}

function createTrimMaterial(color) {
    const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.88,
        toneMapped: false,
    });
    material.userData.baseOpacity = material.opacity;
    return material;
}

function createGlowMaterial(color, opacity) {
    const material = new THREE.MeshBasicMaterial({
        map: getGlowTexture(),
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        toneMapped: false,
    });
    material.userData.baseOpacity = opacity;
    return material;
}

function createMountMaterial() {
    return new THREE.MeshStandardMaterial({
        color: 0x2d3746,
        roughness: 0.72,
        metalness: 0.44,
    });
}

function resolveBuildingFaceMount(placement, face, surfaceOffset = 0.18) {
    const halfWidth = placement.width * 0.5;
    const halfDepth = placement.depth * 0.5;
    switch (face) {
        case 'north':
            return {
                x: placement.x,
                z: placement.z + halfDepth + surfaceOffset,
                rotationY: 0,
                faceSpan: placement.width,
            };
        case 'south':
            return {
                x: placement.x,
                z: placement.z - halfDepth - surfaceOffset,
                rotationY: Math.PI,
                faceSpan: placement.width,
            };
        case 'east':
            return {
                x: placement.x + halfWidth + surfaceOffset,
                z: placement.z,
                rotationY: Math.PI / 2,
                faceSpan: placement.depth,
            };
        case 'west':
            return {
                x: placement.x - halfWidth - surfaceOffset,
                z: placement.z,
                rotationY: -Math.PI / 2,
                faceSpan: placement.depth,
            };
        default:
            return null;
    }
}

function resolveWallBillboardCenterY({ buildingHeight, height, verticalRatio = 0.56 }) {
    const minCenter = height * 0.5 + 3;
    const maxCenter = buildingHeight - height * 0.5 - 2.6;
    return THREE.MathUtils.clamp(buildingHeight * verticalRatio, minCenter, maxCenter);
}

function resolveWallBillboardAnchor(mount, face, width, lateralOffset = 0) {
    const safeOffset = Number(lateralOffset) || 0;
    const maxOffset = Math.max(0, mount.faceSpan * 0.5 - width * 0.5 - 0.2);
    const clampedOffset = THREE.MathUtils.clamp(safeOffset, -maxOffset, maxOffset);

    switch (face) {
        case 'north':
        case 'south':
            return {
                x: mount.x + clampedOffset,
                z: mount.z,
            };
        case 'east':
        case 'west':
            return {
                x: mount.x,
                z: mount.z + clampedOffset,
            };
        default:
            return { x: mount.x, z: mount.z };
    }
}

function resolvePoleOffsets(poleCount, poleSpacing) {
    if (poleCount <= 1) {
        return [0];
    }
    const spacing = Math.max(1.8, poleSpacing);
    return [-spacing * 0.5, spacing * 0.5];
}

function roadSideX(roadCenterX, side, extraOffset = 0) {
    const direction = side === 'west' ? -1 : 1;
    return roadCenterX + direction * (ROAD_WIDTH * 0.5 + SIDEWALK_WIDTH * 0.5 + extraOffset);
}

function resolveScreenAngleToward(x, z, target = SPAWN_VIEW_TARGET) {
    const rawAngle = Math.atan2(target.x - x, target.z - z);
    return normalizePlaneRotation(rawAngle);
}

function normalizePlaneRotation(angle) {
    let normalized = angle;
    while (normalized > Math.PI * 0.5) {
        normalized -= Math.PI;
    }
    while (normalized < -Math.PI * 0.5) {
        normalized += Math.PI;
    }
    return normalized;
}

function getBillboardTextureInternal(assetKey, targetAspect) {
    const asset = BILLBOARD_ASSETS[assetKey];
    if (!asset) {
        return null;
    }

    const cacheKey = `${assetKey}:${targetAspect.toFixed(3)}`;
    const cached = billboardTextureCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const canvas = document.createElement('canvas');
    const canvasSize = resolveBillboardCanvasSize(targetAspect);
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    const ctx = canvas.getContext('2d');
    drawBillboardFallback(ctx, canvas, asset);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    billboardTextureCache.set(cacheKey, texture);

    if (typeof asset.drawTexture === 'function') {
        asset.drawTexture(ctx, canvas, asset);
        texture.needsUpdate = true;
        return texture;
    }

    loadBillboardImage(asset.url)
        .then((image) => {
            drawLedCreative(ctx, canvas, image, asset);
            texture.needsUpdate = true;
        })
        .catch(() => {});

    return texture;
}

function loadBillboardImage(url) {
    const cached = billboardImageCache.get(url);
    if (cached) {
        return cached;
    }

    const promise = new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
    });
    billboardImageCache.set(url, promise);
    return promise;
}

function drawLedCreative(ctx, canvas, image, asset) {
    const { width, height } = canvas;
    const cornerRadius = Math.min(18, width * 0.018);

    drawBillboardFallback(ctx, canvas, asset);

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.filter = 'blur(26px) saturate(1.2)';
    drawImageCover(ctx, image, 0, 0, width, height, asset);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    roundedRectPath(ctx, 0, 0, width, height, cornerRadius);
    ctx.clip();
    drawImageCover(ctx, image, 0, 0, width, height, asset);
    ctx.restore();

    const accentGradient = ctx.createLinearGradient(0, 0, width, height);
    accentGradient.addColorStop(0, hexToRgba(asset.glowColor, 0.92));
    accentGradient.addColorStop(1, hexToRgba(asset.accentColor, 0.9));
    ctx.fillStyle = accentGradient;
    ctx.fillRect(0, 0, width, 5);
    ctx.fillRect(0, height - 4, width, 4);

    drawScanlines(ctx, width, height);
    drawVignette(ctx, width, height);
}

function drawLedVideoCreative(ctx, canvas, video, asset) {
    const { width, height } = canvas;
    const cornerRadius = Math.min(18, width * 0.018);

    drawBillboardFallback(ctx, canvas, asset);

    ctx.save();
    ctx.beginPath();
    roundedRectPath(ctx, 0, 0, width, height, cornerRadius);
    ctx.clip();
    drawVideoCoverFrame(ctx, video, 0, 0, width, height, asset);
    ctx.restore();

    const accentGradient = ctx.createLinearGradient(0, 0, width, height);
    accentGradient.addColorStop(0, hexToRgba(asset.glowColor, 0.92));
    accentGradient.addColorStop(1, hexToRgba(asset.accentColor, 0.9));
    ctx.fillStyle = accentGradient;
    ctx.fillRect(0, 0, width, 5);
    ctx.fillRect(0, height - 4, width, 4);

    drawScanlines(ctx, width, height);
    drawVignette(ctx, width, height);
}

function drawLorienVelmoreLightboxTexture(ctx, canvas, asset) {
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, '#fffef8');
    bgGradient.addColorStop(0.48, '#f8f2e6');
    bgGradient.addColorStop(1, '#ece1cf');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    const halo = ctx.createRadialGradient(
        width * 0.5,
        height * 0.48,
        width * 0.06,
        width * 0.5,
        height * 0.48,
        width * 0.72
    );
    halo.addColorStop(0, 'rgba(255,255,255,0.9)');
    halo.addColorStop(0.42, 'rgba(255,249,238,0.54)');
    halo.addColorStop(1, 'rgba(255,249,238,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(193, 164, 123, 0.72)';
    ctx.lineWidth = Math.max(2, height * 0.032);
    ctx.strokeRect(
        ctx.lineWidth * 0.5,
        ctx.lineWidth * 0.5,
        width - ctx.lineWidth,
        height - ctx.lineWidth
    );

    const innerShadow = ctx.createLinearGradient(0, 0, width, 0);
    innerShadow.addColorStop(0, 'rgba(120, 93, 57, 0.08)');
    innerShadow.addColorStop(0.12, 'rgba(255,255,255,0)');
    innerShadow.addColorStop(0.88, 'rgba(255,255,255,0)');
    innerShadow.addColorStop(1, 'rgba(120, 93, 57, 0.08)');
    ctx.fillStyle = innerShadow;
    ctx.fillRect(0, 0, width, height);

    const text = 'LORIEN VELMORE';
    let fontSize = height * 0.54;
    let tracking = fontSize * 0.058;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    while (fontSize > height * 0.34) {
        ctx.font = `600 ${fontSize}px "Didot", "Bodoni MT", "Times New Roman", serif`;
        tracking = fontSize * 0.058;
        if (measureTrackedText(ctx, text, tracking) <= width * 0.88) {
            break;
        }
        fontSize -= 4;
    }

    ctx.fillStyle = '#060606';
    ctx.shadowColor = 'rgba(255,255,255,0.18)';
    ctx.shadowBlur = Math.max(6, height * 0.09);
    drawTrackedText(ctx, text, width * 0.5, height * 0.5, tracking);
    ctx.shadowBlur = 0;

    const sheen = ctx.createLinearGradient(0, 0, 0, height);
    sheen.addColorStop(0, 'rgba(255,255,255,0.34)');
    sheen.addColorStop(0.18, 'rgba(255,255,255,0.08)');
    sheen.addColorStop(0.4, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, width, height);

    const accentGradient = ctx.createLinearGradient(0, 0, width, 0);
    accentGradient.addColorStop(0, hexToRgba(asset.glowColor, 0.2));
    accentGradient.addColorStop(0.5, 'rgba(255,255,255,0)');
    accentGradient.addColorStop(1, hexToRgba(asset.accentColor, 0.18));
    ctx.fillStyle = accentGradient;
    ctx.fillRect(0, 0, width, height);
}

function drawAnimaatorNeonTexture(ctx, canvas, asset) {
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const text = 'ANIMAATOR';
    let fontSize = height * 0.74;
    while (fontSize > height * 0.36) {
        ctx.font = `900 ${fontSize}px "Arial Black", "Helvetica Neue", sans-serif`;
        if (ctx.measureText(text).width <= width * 0.9) {
            break;
        }
        fontSize -= 4;
    }

    const centerX = width * 0.5;
    const centerY = height * 0.52;

    ctx.save();
    ctx.strokeStyle = 'rgba(3, 18, 30, 0.92)';
    ctx.lineWidth = Math.max(4, fontSize * 0.11);
    ctx.strokeText(text, centerX, centerY);
    ctx.fillStyle = '#00d8ff';
    ctx.fillText(text, centerX, centerY);
    ctx.restore();
}

function drawBillboardFallback(ctx, canvas, asset) {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#05080d');
    gradient.addColorStop(0.55, '#0a1018');
    gradient.addColorStop(1, '#04070d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const colorBurst = ctx.createRadialGradient(
        canvas.width * 0.5,
        canvas.height * 0.5,
        canvas.width * 0.05,
        canvas.width * 0.5,
        canvas.height * 0.5,
        canvas.width * 0.72
    );
    colorBurst.addColorStop(0, hexToRgba(asset.glowColor, 0.34));
    colorBurst.addColorStop(0.58, hexToRgba(asset.accentColor, 0.1));
    colorBurst.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = colorBurst;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawScanlines(ctx, width, height) {
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#ffffff';
    for (let y = 1; y < height; y += 5) {
        ctx.fillRect(0, y, width, 1);
    }
    ctx.restore();
}

function drawVignette(ctx, width, height) {
    const vignette = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        width * 0.15,
        width * 0.5,
        height * 0.5,
        width * 0.78
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
}

function measureTrackedText(ctx, text, tracking = 0) {
    const glyphs = Array.from(text);
    let totalWidth = 0;
    glyphs.forEach((glyph, index) => {
        totalWidth += ctx.measureText(glyph).width;
        if (index < glyphs.length - 1) {
            totalWidth += glyph === ' ' ? tracking * 1.2 : tracking;
        }
    });
    return totalWidth;
}

function drawTrackedText(ctx, text, centerX, centerY, tracking = 0) {
    const glyphs = Array.from(text);
    const totalWidth = measureTrackedText(ctx, text, tracking);
    let x = centerX - totalWidth * 0.5;
    glyphs.forEach((glyph, index) => {
        ctx.fillText(glyph, x, centerY);
        x += ctx.measureText(glyph).width;
        if (index < glyphs.length - 1) {
            x += glyph === ' ' ? tracking * 1.2 : tracking;
        }
    });
}

function drawImageContain(ctx, image, x, y, width, height) {
    const imageAspect = image.width / image.height;
    const rectAspect = width / height;

    let drawWidth = width;
    let drawHeight = height;
    if (imageAspect > rectAspect) {
        drawHeight = width / imageAspect;
    } else {
        drawWidth = height * imageAspect;
    }

    const drawX = x + (width - drawWidth) * 0.5;
    const drawY = y + (height - drawHeight) * 0.5;
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawImageCover(ctx, image, x, y, width, height, options = {}) {
    const imageAspect = image.width / image.height;
    const rectAspect = width / height;
    const focusX = THREE.MathUtils.clamp(options.focusX ?? 0.5, 0, 1);

    let drawWidth = width;
    let drawHeight = height;
    if (imageAspect > rectAspect) {
        drawWidth = height * imageAspect;
    } else {
        drawHeight = width / imageAspect;
    }

    const overflowX = Math.max(0, drawWidth - width);
    const overflowY = Math.max(0, drawHeight - height);
    const focusY = resolveCoverFocusY(options.focusY, rectAspect, overflowY);
    const drawX = x - overflowX * focusX;
    const drawY = y - overflowY * focusY;
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawVideoCoverFrame(ctx, video, x, y, width, height, options = {}) {
    const videoAspect = video.videoWidth / video.videoHeight;
    const rectAspect = width / height;
    const focusX = THREE.MathUtils.clamp(options.focusX ?? 0.5, 0, 1);

    let drawWidth = width;
    let drawHeight = height;
    if (videoAspect > rectAspect) {
        drawWidth = height * videoAspect;
    } else {
        drawHeight = width / videoAspect;
    }

    const overflowX = Math.max(0, drawWidth - width);
    const overflowY = Math.max(0, drawHeight - height);
    const focusY = resolveCoverFocusY(options.focusY, rectAspect, overflowY);
    const drawX = x - overflowX * focusX;
    const drawY = y - overflowY * focusY;
    ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);
}

function resolveCoverFocusY(explicitFocusY, rectAspect, overflowY) {
    if (explicitFocusY != null) {
        return THREE.MathUtils.clamp(explicitFocusY, 0, 1);
    }

    if (rectAspect > 1 && overflowY > 0) {
        return LANDSCAPE_SCREEN_TOP_CROP_FOCUS_Y;
    }

    return 0.5;
}

function fillRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    roundedRectPath(ctx, x, y, width, height, radius);
    ctx.fill();
}

function roundedRectPath(ctx, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width * 0.5, height * 0.5);
    ctx.moveTo(x + safeRadius, y);
    ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
    ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
    ctx.arcTo(x, y + height, x, y, safeRadius);
    ctx.arcTo(x, y, x + width, y, safeRadius);
    ctx.closePath();
}

function hexToRgba(hex, alpha) {
    const color = new THREE.Color(hex);
    return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(
        color.b * 255
    )}, ${alpha})`;
}

function getGlowTexture() {
    if (glowTexture) {
        return glowTexture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
    gradient.addColorStop(0.38, 'rgba(255, 255, 255, 0.44)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    glowTexture = new THREE.CanvasTexture(canvas);
    glowTexture.colorSpace = THREE.SRGBColorSpace;
    return glowTexture;
}
