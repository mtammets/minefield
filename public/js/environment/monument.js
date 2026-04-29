import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { centralParkingLot } from './layout.js';
import { getGroundHeightAt } from './terrain.js';
import { addObstacleCircle } from './obstacles.js';
import {
    createLedDisplayPanel,
    getBillboardAssetConfig,
    getBillboardTexture,
    resolveBillboardCanvasSize,
} from './billboards.js';

const MONUMENT_CAROUSEL_ASSET_KEYS = [
    'monumentTitle',
    'monumentRedPortrait',
    'monumentWizardPortrait',
    'monumentOrb',
];
const MONUMENT_CAROUSEL_CONFIG = Object.freeze({
    holdDurationMs: 4200,
    slideDurationMs: 1050,
});

export function createMonumentLayer(screenEntries = []) {
    const layer = new THREE.Group();
    layer.name = 'monumentLayer';

    const centerX = centralParkingLot.centerX;
    const centerZ = centralParkingLot.centerZ;
    const baseY = getGroundHeightAt(centerX, centerZ);
    const lotMinDimension = Math.min(centralParkingLot.width, centralParkingLot.depth);

    const forecourtRadius = Math.max(11.2, lotMinDimension * 0.32);
    const basinOuterRadius = forecourtRadius * 0.76;
    const basinInnerRadius = basinOuterRadius - 1.5;
    const pedestalRadius = basinInnerRadius * 0.24;

    const stoneMaterial = new THREE.MeshLambertMaterial({
        color: 0x2a3f57,
    });
    const trimMaterial = new THREE.MeshLambertMaterial({
        color: 0x9bb2ca,
    });
    const waterMaterial = new THREE.MeshBasicMaterial({
        color: 0x4f86b5,
    });
    const accentMaterial = new THREE.MeshBasicMaterial({
        color: 0xa9c4e2,
    });
    const monolithShellMaterial = new THREE.MeshStandardMaterial({
        color: 0x0d141d,
        roughness: 0.34,
        metalness: 0.78,
        emissive: 0x03070d,
        emissiveIntensity: 0.26,
    });

    const forecourt = new THREE.Mesh(
        new THREE.CylinderGeometry(forecourtRadius, forecourtRadius, 0.14, 12),
        stoneMaterial
    );
    forecourt.position.set(centerX, baseY + 0.07, centerZ);
    layer.add(forecourt);

    const basinWall = new THREE.Mesh(
        new THREE.CylinderGeometry(basinOuterRadius, basinOuterRadius, 0.82, 12),
        stoneMaterial
    );
    basinWall.position.set(centerX, baseY + 0.41, centerZ);
    layer.add(basinWall);

    const basinLip = new THREE.Mesh(
        new THREE.TorusGeometry(basinOuterRadius - 0.18, 0.22, 6, 14),
        trimMaterial
    );
    basinLip.rotation.x = Math.PI / 2;
    basinLip.position.set(centerX, baseY + 0.88, centerZ);
    layer.add(basinLip);

    const waterSurface = new THREE.Mesh(
        new THREE.CircleGeometry(basinInnerRadius - 0.5, 10),
        waterMaterial
    );
    waterSurface.rotation.x = -Math.PI / 2;
    waterSurface.position.set(centerX, baseY + 0.2, centerZ);
    layer.add(waterSurface);

    const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(pedestalRadius * 1.18, pedestalRadius * 1.3, 2.2, 8),
        stoneMaterial
    );
    pedestal.position.set(centerX, baseY + 1.56, centerZ);
    layer.add(pedestal);

    const monolithWidth = 4.2;
    const monolithHeight = 9.2;
    const monolithDepth = 4.2;
    const monolith = new THREE.Mesh(
        new THREE.BoxGeometry(monolithWidth, monolithHeight, monolithDepth),
        monolithShellMaterial
    );
    monolith.position.set(centerX, baseY + 7.12, centerZ);
    layer.add(monolith);

    const ledFaceWidth = monolithWidth - 0.52;
    const ledFaceHeight = monolithHeight - 0.56;
    const ledFaceOffset = monolithWidth * 0.5 + 0.09;
    const ledStyleConfig = {
        depth: 0.24,
        framePadding: 0.1,
        shellColor: 0x0e151e,
        shellRoughness: 0.28,
        shellMetalness: 0.82,
        shellEmissiveIntensity: 0.28,
        trimTopScale: 0.985,
        trimBottomScale: 0.97,
        trimTopThickness: 0.045,
        trimBottomThickness: 0.04,
        trimTopOffset: 0.03,
        trimBottomOffset: 0.03,
        frontGlowScale: 1.08,
        backGlowScale: 1.02,
        frontGlowOpacity: 0.24,
        backGlowOpacity: 0.08,
    };
    const monumentScreens = [
        { x: centerX, z: centerZ + ledFaceOffset, rotationY: 0 },
        { x: centerX + ledFaceOffset, z: centerZ, rotationY: Math.PI / 2 },
        { x: centerX, z: centerZ - ledFaceOffset, rotationY: Math.PI },
        { x: centerX - ledFaceOffset, z: centerZ, rotationY: -Math.PI / 2 },
    ];
    const carouselPanels = [];
    monumentScreens.forEach((screenMount, index) => {
        const faceTexture = createDynamicScreenTexture(ledFaceWidth / ledFaceHeight);
        const initialAssetKey =
            MONUMENT_CAROUSEL_ASSET_KEYS[index % MONUMENT_CAROUSEL_ASSET_KEYS.length];
        const panel = createLedDisplayPanel({
            width: ledFaceWidth,
            height: ledFaceHeight,
            playlistKeys: [initialAssetKey],
            doubleSided: false,
            screenEntries,
            registerRuntimeEntry: false,
            initialTexture: faceTexture.texture,
            initialAssetKey,
            styleConfig: ledStyleConfig,
        });
        panel.group.position.set(screenMount.x, monolith.position.y, screenMount.z);
        panel.group.rotation.y = screenMount.rotationY;
        layer.add(panel.group);
        carouselPanels.push({
            ...faceTexture,
            aspect: panel.aspect,
            screenMaterials: panel.screenMaterials,
            glowMaterials: panel.glowMaterials,
            trimMaterials: panel.trimMaterials,
        });
    });
    const monumentCarouselEntry = createMonumentCarouselEntry(carouselPanels);
    monumentCarouselEntry.customUpdate(0);
    screenEntries.push(monumentCarouselEntry);

    const crown = new THREE.Mesh(
        new THREE.TorusGeometry(pedestalRadius * 2.46, 0.22, 6, 14),
        accentMaterial
    );
    crown.rotation.x = Math.PI / 2;
    crown.position.set(centerX, baseY + 11.9, centerZ);
    layer.add(crown);

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.66, 6, 5), accentMaterial);
    beacon.position.set(centerX, baseY + 11.9, centerZ);
    layer.add(beacon);

    const fountainCollisionRadius = basinOuterRadius + 0.24;
    addObstacleCircle(centerX, centerZ, fountainCollisionRadius, 'building');

    freezeStaticHierarchy(layer);

    return layer;
}

function freezeStaticHierarchy(root) {
    root.traverse((node) => {
        if (!node || !node.isObject3D) {
            return;
        }
        node.matrixAutoUpdate = false;
        node.updateMatrix();
    });
}

function createDynamicScreenTexture(targetAspect) {
    const canvas = document.createElement('canvas');
    const canvasSize = resolveBillboardCanvasSize(targetAspect);
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return { canvas, ctx, texture };
}

function createMonumentCarouselEntry(facePanels) {
    const screenMaterials = facePanels.flatMap((panel) => panel.screenMaterials);
    const glowMaterials = facePanels.flatMap((panel) => panel.glowMaterials);
    const trimMaterials = facePanels.flatMap((panel) => panel.trimMaterials);
    const glowColorA = new THREE.Color();
    const glowColorB = new THREE.Color();
    const trimColorA = new THREE.Color();
    const trimColorB = new THREE.Color();
    const cycleDurationMs =
        MONUMENT_CAROUSEL_CONFIG.holdDurationMs + MONUMENT_CAROUSEL_CONFIG.slideDurationMs;

    return {
        playlistKeys: MONUMENT_CAROUSEL_ASSET_KEYS,
        currentIndex: 0,
        cycleIntervalMs: cycleDurationMs,
        phaseOffsetMs: 0,
        pulseSpeed: 0.0018 + Math.random() * 0.0004,
        pulsePhase: Math.random() * Math.PI * 2,
        screenMaterials,
        glowMaterials,
        trimMaterials,
        customUpdate(now) {
            const safeNow = Math.max(0, Number(now) || 0);
            const cycleStep = Math.floor(safeNow / cycleDurationMs);
            const cycleTime = safeNow - cycleStep * cycleDurationMs;
            const inSlide = cycleTime > MONUMENT_CAROUSEL_CONFIG.holdDurationMs;
            const slideProgress = inSlide
                ? THREE.MathUtils.clamp(
                      (cycleTime - MONUMENT_CAROUSEL_CONFIG.holdDurationMs) /
                          MONUMENT_CAROUSEL_CONFIG.slideDurationMs,
                      0,
                      1
                  )
                : 0;
            const easedProgress = easeInOutCubic(slideProgress);

            facePanels.forEach((facePanel, faceIndex) => {
                const currentAssetKey =
                    MONUMENT_CAROUSEL_ASSET_KEYS[
                        (faceIndex + cycleStep) % MONUMENT_CAROUSEL_ASSET_KEYS.length
                    ];
                const nextAssetKey =
                    MONUMENT_CAROUSEL_ASSET_KEYS[
                        (faceIndex + cycleStep + 1) % MONUMENT_CAROUSEL_ASSET_KEYS.length
                    ];

                drawMonumentCarouselFrame(facePanel, currentAssetKey, nextAssetKey, easedProgress);
                blendPanelAccentColors(
                    facePanel,
                    currentAssetKey,
                    nextAssetKey,
                    easedProgress,
                    glowColorA,
                    glowColorB,
                    trimColorA,
                    trimColorB
                );
            });

            this.currentIndex = cycleStep % MONUMENT_CAROUSEL_ASSET_KEYS.length;
        },
    };
}

function drawMonumentCarouselFrame(facePanel, currentAssetKey, nextAssetKey, slideProgress) {
    const currentTexture = getBillboardTexture(currentAssetKey, facePanel.aspect);
    const nextTexture = getBillboardTexture(nextAssetKey, facePanel.aspect);
    const currentImage = currentTexture?.image;
    const nextImage = nextTexture?.image;
    if (!currentImage) {
        return;
    }

    const { ctx, canvas, texture } = facePanel;
    const width = canvas.width;
    const height = canvas.height;
    const progress = THREE.MathUtils.clamp(slideProgress, 0, 1);

    ctx.clearRect(0, 0, width, height);
    if (progress <= 0.001 || !nextImage) {
        ctx.drawImage(currentImage, 0, 0, width, height);
        texture.needsUpdate = true;
        return;
    }

    const currentX = -progress * width;
    const nextX = width - progress * width;
    ctx.drawImage(currentImage, currentX, 0, width, height);
    ctx.drawImage(nextImage, nextX, 0, width, height);
    texture.needsUpdate = true;
}

function blendPanelAccentColors(
    facePanel,
    currentAssetKey,
    nextAssetKey,
    slideProgress,
    glowColorA,
    glowColorB,
    trimColorA,
    trimColorB
) {
    const currentAsset = getBillboardAssetConfig(currentAssetKey);
    const nextAsset = getBillboardAssetConfig(nextAssetKey) || currentAsset;
    const progress = THREE.MathUtils.clamp(slideProgress, 0, 1);

    glowColorA.setHex(currentAsset?.glowColor || 0xffffff);
    glowColorB.setHex(nextAsset?.glowColor || currentAsset?.glowColor || 0xffffff);
    trimColorA.setHex(currentAsset?.accentColor || 0xffffff);
    trimColorB.setHex(nextAsset?.accentColor || currentAsset?.accentColor || 0xffffff);

    glowColorA.lerp(glowColorB, progress);
    trimColorA.lerp(trimColorB, progress);

    facePanel.glowMaterials.forEach((material) => {
        material.color.copy(glowColorA);
    });
    facePanel.trimMaterials.forEach((material) => {
        material.color.copy(trimColorA);
    });
}

function easeInOutCubic(value) {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    if (t < 0.5) {
        return 4 * t * t * t;
    }
    return 1 - Math.pow(-2 * t + 2, 3) * 0.5;
}
