import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import {
    DEFAULT_PLAYER_CAR_SKIN_ID,
    getCarSkinPresetById,
    resolvePlayerCarSkinId,
} from './car-skins.js';

const DEFAULT_BODY_DIMENSIONS = Object.freeze({
    width: 1.08,
    height: 0.3,
    depth: 4.7,
});
const DEFAULT_WHEEL_POSITIONS = Object.freeze([
    Object.freeze({ x: -1.28, z: -1.8 }),
    Object.freeze({ x: 1.28, z: -1.8 }),
    Object.freeze({ x: -1.28, z: 1.8 }),
    Object.freeze({ x: 1.28, z: 1.8 }),
]);
const WRAP_TEXTURE_PROMISE_CACHE = new Map();

export function addFormulaBody(car, bodyConfig = {}) {
    const {
        bodyColor = 0x2d67a6,
        skinId = DEFAULT_PLAYER_CAR_SKIN_ID,
        wrapUrl = '',
        bodyDimensions = DEFAULT_BODY_DIMENSIONS,
        wheelPositions = DEFAULT_WHEEL_POSITIONS,
        displayName = 'MAREK',
    } = bodyConfig;

    const bodyShellGroup = new THREE.Group();
    bodyShellGroup.name = 'body_shell_group';
    car.add(bodyShellGroup);

    const roofAssemblyGroup = new THREE.Group();
    roofAssemblyGroup.name = 'roof_assembly_group';
    car.add(roofAssemblyGroup);

    const nameplateAssemblyGroup = new THREE.Group();
    nameplateAssemblyGroup.name = 'nameplate_assembly_group';
    car.add(nameplateAssemblyGroup);

    const bodyPanels = [];
    const primaryMaterials = [];
    const accentMaterials = [];
    const carbonMaterials = [];
    const glowMaterials = [];
    const cockpitGlassMaterials = [];
    let batteryLevelNormalized = 1;
    let appearanceRequestId = 0;

    function registerBodyPanel(mesh, { side = 'center', zone = 'center', mass = 1.2 } = {}) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        bodyPanels.push({
            id: `formula_panel_${bodyPanels.length + 1}`,
            type: 'body_panel',
            side,
            zone,
            source: mesh,
            groundOffset: 0.08,
            baseLife: 4.6,
            mass,
        });
        return mesh;
    }

    function addPrimaryMesh(geometry, position, options = {}) {
        const material = createMaterial({
            color: bodyColor,
            emissive: 0x09121c,
            emissiveIntensity: 0.12,
            metalness: 0.78,
            roughness: 0.28,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        bodyShellGroup.add(mesh);
        primaryMaterials.push(material);
        registerBodyPanel(mesh, options);
        return mesh;
    }

    function addAccentMesh(geometry, position, rotation = null) {
        const material = createMaterial({
            color: 0xe8f6ff,
            emissive: 0x142438,
            emissiveIntensity: 0.2,
            metalness: 0.92,
            roughness: 0.14,
            clearcoat: 1,
            clearcoatRoughness: 0.06,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        if (rotation) {
            mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        bodyShellGroup.add(mesh);
        accentMaterials.push(material);
        return mesh;
    }

    function addCarbonMesh(geometry, position, rotation = null) {
        const material = createMaterial({
            color: 0x0a0d12,
            emissive: 0x04070a,
            emissiveIntensity: 0.06,
            metalness: 0.56,
            roughness: 0.4,
            clearcoat: 0.72,
            clearcoatRoughness: 0.16,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        if (rotation) {
            mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        bodyShellGroup.add(mesh);
        carbonMaterials.push(material);
        return mesh;
    }

    const floor = addCarbonMesh(
        new THREE.BoxGeometry(bodyDimensions.width * 0.7, 0.08, bodyDimensions.depth * 0.92),
        new THREE.Vector3(0, 0.54, 0.08)
    );
    registerBodyPanel(floor, {
        side: 'center',
        zone: 'center',
        mass: 1.9,
    });

    const noseCone = addPrimaryMesh(
        new THREE.BoxGeometry(0.26, 0.16, 1.52),
        new THREE.Vector3(0, 0.63, -1.12),
        {
            side: 'center',
            zone: 'front',
            mass: 0.9,
        }
    );
    noseCone.rotation.x = -0.04;

    const frontWingCenter = addCarbonMesh(
        new THREE.BoxGeometry(0.98, 0.04, 0.3),
        new THREE.Vector3(0, 0.44, -1.9)
    );
    registerBodyPanel(frontWingCenter, {
        side: 'center',
        zone: 'front',
        mass: 0.6,
    });
    const frontWingLeft = addAccentMesh(
        new THREE.BoxGeometry(0.38, 0.04, 0.42),
        new THREE.Vector3(-0.78, 0.44, -1.92)
    );
    registerBodyPanel(frontWingLeft, {
        side: 'left',
        zone: 'front',
        mass: 0.4,
    });
    const frontWingRight = addAccentMesh(
        new THREE.BoxGeometry(0.38, 0.04, 0.42),
        new THREE.Vector3(0.78, 0.44, -1.92)
    );
    registerBodyPanel(frontWingRight, {
        side: 'right',
        zone: 'front',
        mass: 0.4,
    });

    const cockpitCell = addPrimaryMesh(
        new THREE.BoxGeometry(0.66, 0.24, 1.08),
        new THREE.Vector3(0, 0.76, -0.22),
        {
            side: 'center',
            zone: 'center',
            mass: 1.2,
        }
    );

    const sidepodWidth = 0.24;
    const sidepodHeight = 0.22;
    const sidepodDepth = 1.36;
    const sidepodLeft = addPrimaryMesh(
        new THREE.BoxGeometry(sidepodWidth, sidepodHeight, sidepodDepth),
        new THREE.Vector3(-(bodyDimensions.width * 0.5 - 0.14), 0.63, 0.35),
        {
            side: 'left',
            zone: 'center',
            mass: 0.9,
        }
    );
    sidepodLeft.rotation.z = 0.04;
    const sidepodRight = addPrimaryMesh(
        new THREE.BoxGeometry(sidepodWidth, sidepodHeight, sidepodDepth),
        new THREE.Vector3(bodyDimensions.width * 0.5 - 0.14, 0.63, 0.35),
        {
            side: 'right',
            zone: 'center',
            mass: 0.9,
        }
    );
    sidepodRight.rotation.z = -0.04;

    const engineCover = addPrimaryMesh(
        new THREE.BoxGeometry(0.38, 0.28, 1.18),
        new THREE.Vector3(0, 0.8, 0.96),
        {
            side: 'center',
            zone: 'rear',
            mass: 1.1,
        }
    );

    const spineFin = addAccentMesh(
        new THREE.BoxGeometry(0.06, 0.38, 0.78),
        new THREE.Vector3(0, 1.0, 1.06)
    );
    registerBodyPanel(spineFin, {
        side: 'center',
        zone: 'rear',
        mass: 0.3,
    });

    const rearWingMain = addCarbonMesh(
        new THREE.BoxGeometry(1.22, 0.06, 0.34),
        new THREE.Vector3(0, 0.92, 2.02)
    );
    registerBodyPanel(rearWingMain, {
        side: 'center',
        zone: 'rear',
        mass: 0.55,
    });
    const rearWingSupports = new THREE.Group();
    rearWingSupports.name = 'formula_rear_wing_supports';
    rearWingSupports.position.set(0, 0, 0);
    bodyShellGroup.add(rearWingSupports);
    for (const x of [-0.16, 0.16]) {
        const support = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.34, 0.06),
            createMaterial({
                color: 0x151b23,
                emissive: 0x070b11,
                emissiveIntensity: 0.08,
                metalness: 0.7,
                roughness: 0.24,
                clearcoat: 0.72,
                clearcoatRoughness: 0.14,
            })
        );
        support.position.set(x, 0.75, 1.92);
        support.castShadow = true;
        support.receiveShadow = true;
        rearWingSupports.add(support);
        carbonMaterials.push(support.material);
    }

    const haloGroup = new THREE.Group();
    haloGroup.name = 'formula_halo_group';
    roofAssemblyGroup.add(haloGroup);
    const haloMaterial = createMaterial({
        color: 0x0d1117,
        emissive: 0x101826,
        emissiveIntensity: 0.1,
        metalness: 0.85,
        roughness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
    });
    carbonMaterials.push(haloMaterial);
    const haloBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.026, 0.026, 0.78, 14),
        haloMaterial
    );
    haloBar.rotation.z = Math.PI * 0.5;
    haloBar.position.set(0, 0.96, -0.26);
    haloBar.castShadow = true;
    haloBar.receiveShadow = true;
    haloGroup.add(haloBar);
    for (const x of [-0.19, 0.19]) {
        const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.018, 0.018, 0.34, 12),
            haloMaterial
        );
        leg.position.set(x, 0.82, -0.18);
        leg.castShadow = true;
        leg.receiveShadow = true;
        haloGroup.add(leg);
    }
    const centerLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.016, 0.42, 12),
        haloMaterial
    );
    centerLeg.position.set(0, 0.9, -0.56);
    centerLeg.rotation.x = 0.18;
    centerLeg.castShadow = true;
    centerLeg.receiveShadow = true;
    haloGroup.add(centerLeg);

    // Transmission forces an extra full-scene render pass in Three.js and was
    // the main FPS hit unique to the formula chassis.
    const canopyMaterial = new THREE.MeshStandardMaterial({
        color: 0x0b1622,
        emissive: 0x10273b,
        emissiveIntensity: 0.28,
        metalness: 0.22,
        roughness: 0.18,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
    });
    cockpitGlassMaterials.push(canopyMaterial);
    const canopy = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.44, 4, 8), canopyMaterial);
    canopy.position.set(0, 0.82, -0.18);
    canopy.rotation.z = Math.PI * 0.5;
    canopy.rotation.x = 0.08;
    canopy.castShadow = false;
    canopy.receiveShadow = false;
    roofAssemblyGroup.add(canopy);

    const energyStripMaterial = createMaterial({
        color: 0x74ffb2,
        emissive: 0x74ffb2,
        emissiveIntensity: 0.9,
        metalness: 0.2,
        roughness: 0.18,
        clearcoat: 0.8,
        clearcoatRoughness: 0.14,
    });
    glowMaterials.push(energyStripMaterial);
    const energyStrip = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.03, 0.92),
        energyStripMaterial
    );
    energyStrip.position.set(0, 0.96, 0.72);
    roofAssemblyGroup.add(energyStrip);

    const rearNamePlate = createDriverPlate(displayName, 0.6, 0.16);
    rearNamePlate.position.set(0, 0.88, 1.52);
    rearNamePlate.rotation.x = -0.08;
    nameplateAssemblyGroup.add(rearNamePlate);

    const noseBadge = createDriverPlate('APEX', 0.26, 0.12);
    noseBadge.position.set(0, 0.78, -1.72);
    noseBadge.rotation.x = -0.42;
    nameplateAssemblyGroup.add(noseBadge);

    const currentAppearance = {
        skinId: resolvePlayerCarSkinId(skinId),
        colorHex: normalizeBodyColorHex(bodyColor, DEFAULT_PLAYER_CAR_SKIN_ID),
        wrapUrl: sanitizeUserWrapTextureUrl(wrapUrl),
    };

    applyAppearance({
        skinId: currentAppearance.skinId,
        colorHex: currentAppearance.colorHex,
        wrapUrl: currentAppearance.wrapUrl,
    });

    return {
        bodyDimensions,
        wheelPositions,
        detachablePanels: bodyPanels,
        editGroups: {
            bodyShellGroup,
            roofAssemblyGroup,
            nameplateAssemblyGroup,
        },
        update(vehicleState = {}, dt = 1 / 60) {
            const speedAbs = Math.abs(Number(vehicleState?.speed) || 0);
            const batteryLevel = THREE.MathUtils.clamp(
                Number(vehicleState?.batteryLevelNormalized ?? batteryLevelNormalized) || 0,
                0,
                1
            );
            const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.003 + speedAbs * 0.02);
            for (let i = 0; i < glowMaterials.length; i += 1) {
                const material = glowMaterials[i];
                material.emissiveIntensity =
                    0.35 + batteryLevel * 0.72 + pulse * 0.18 + Math.min(speedAbs / 160, 0.2);
            }
            for (let i = 0; i < cockpitGlassMaterials.length; i += 1) {
                cockpitGlassMaterials[i].emissiveIntensity = 0.18 + batteryLevel * 0.28;
            }
        },
        setBatteryLevel(levelNormalized) {
            batteryLevelNormalized = THREE.MathUtils.clamp(levelNormalized, 0, 1);
        },
        setBodyColor(colorHex) {
            applyAppearance({ colorHex });
        },
        setSkin(nextSkinId) {
            applyAppearance({ skinId: nextSkinId });
        },
        setAppearance(appearance = null) {
            applyAppearance(appearance);
        },
    };

    function applyAppearance(appearance = null) {
        appearanceRequestId += 1;
        const requestId = appearanceRequestId;
        const nextSkinPreset = getCarSkinPresetById(appearance?.skinId ?? currentAppearance.skinId);
        const shouldPreserveWrap =
            appearance == null ||
            typeof appearance !== 'object' ||
            !Object.prototype.hasOwnProperty.call(appearance, 'wrapUrl');
        const nextWrapUrl = shouldPreserveWrap
            ? currentAppearance.wrapUrl
            : sanitizeUserWrapTextureUrl(appearance?.wrapUrl || '');
        const shouldUsePresetColor =
            appearance == null ||
            typeof appearance !== 'object' ||
            !Object.prototype.hasOwnProperty.call(appearance, 'colorHex');
        const nextColorHex = shouldUsePresetColor
            ? appearance && typeof appearance === 'object' && 'skinId' in appearance
                ? nextSkinPreset.bodyColor >>> 0
                : currentAppearance.colorHex
            : normalizeBodyColorHex(appearance.colorHex, nextSkinPreset.id);

        currentAppearance.skinId = nextSkinPreset.id;
        currentAppearance.colorHex = nextColorHex;
        currentAppearance.wrapUrl = nextWrapUrl;

        applyBaseFinish(nextSkinPreset, nextColorHex);
        if (!nextWrapUrl) {
            applyWrapTexture(null);
            return;
        }

        void loadUserWrapTexture(nextWrapUrl)
            .then((texture) => {
                if (
                    requestId !== appearanceRequestId ||
                    currentAppearance.wrapUrl !== nextWrapUrl ||
                    currentAppearance.skinId !== nextSkinPreset.id
                ) {
                    return;
                }
                applyWrapTexture(texture);
            })
            .catch(() => {
                if (requestId === appearanceRequestId) {
                    applyWrapTexture(null);
                }
            });
    }

    function applyBaseFinish(skinPreset, colorHex) {
        const bodyColorValue = new THREE.Color(colorHex >>> 0);
        const stripeColorValue = new THREE.Color(skinPreset.stripeColor);
        const accentColorValue = new THREE.Color(skinPreset.accentColor);
        const carbonTintValue = new THREE.Color(skinPreset.accentColorSecondary).lerp(
            new THREE.Color(0x07090d),
            0.78
        );
        const glowColorValue = new THREE.Color(skinPreset.glowColor);
        const finishProfile = resolveFinishProfile(skinPreset.material);

        for (let i = 0; i < primaryMaterials.length; i += 1) {
            const material = primaryMaterials[i];
            material.color.copy(bodyColorValue);
            material.map = null;
            material.emissive.copy(accentColorValue).multiplyScalar(0.12);
            material.emissiveIntensity = 0.2;
            material.metalness = finishProfile.metalness;
            material.roughness = finishProfile.roughness;
            material.clearcoat = finishProfile.clearcoat;
            material.clearcoatRoughness = finishProfile.clearcoatRoughness;
            material.needsUpdate = true;
        }
        for (let i = 0; i < accentMaterials.length; i += 1) {
            const material = accentMaterials[i];
            material.color.copy(stripeColorValue);
            material.emissive.copy(accentColorValue).multiplyScalar(0.26);
            material.emissiveIntensity = 0.34;
            material.needsUpdate = true;
        }
        for (let i = 0; i < carbonMaterials.length; i += 1) {
            const material = carbonMaterials[i];
            material.color.copy(carbonTintValue);
            material.emissive.copy(carbonTintValue).multiplyScalar(0.12);
            material.needsUpdate = true;
        }
        for (let i = 0; i < glowMaterials.length; i += 1) {
            const material = glowMaterials[i];
            material.color.copy(glowColorValue);
            material.emissive.copy(glowColorValue);
            material.needsUpdate = true;
        }
        for (let i = 0; i < cockpitGlassMaterials.length; i += 1) {
            const material = cockpitGlassMaterials[i];
            material.emissive.copy(accentColorValue).multiplyScalar(0.18);
            material.needsUpdate = true;
        }
    }

    function applyWrapTexture(texture) {
        for (let i = 0; i < primaryMaterials.length; i += 1) {
            const material = primaryMaterials[i];
            material.map = texture;
            if (texture) {
                material.color.setHex(0xffffff);
                material.emissive.setHex(0x09121c);
                material.emissiveIntensity = 0.08;
            }
            material.needsUpdate = true;
        }
    }
}

function createMaterial({
    color,
    emissive = 0x000000,
    emissiveIntensity = 0,
    metalness = 0,
    roughness = 1,
    clearcoat = 0,
    clearcoatRoughness = 0,
}) {
    return new THREE.MeshPhysicalMaterial({
        color,
        emissive,
        emissiveIntensity,
        metalness,
        roughness,
        clearcoat,
        clearcoatRoughness,
    });
}

function normalizeBodyColorHex(colorHex, fallbackSkinId = DEFAULT_PLAYER_CAR_SKIN_ID) {
    if (typeof colorHex === 'number' && Number.isFinite(colorHex)) {
        return colorHex >>> 0;
    }
    const fallbackPreset = getCarSkinPresetById(fallbackSkinId);
    return fallbackPreset.bodyColor >>> 0;
}

function resolveFinishProfile(materialKey = '') {
    switch (
        String(materialKey || '')
            .trim()
            .toLowerCase()
    ) {
        case 'forged-carbon':
            return {
                metalness: 0.84,
                roughness: 0.26,
                clearcoat: 0.92,
                clearcoatRoughness: 0.1,
            };
        case 'brushed-metal':
            return {
                metalness: 0.96,
                roughness: 0.22,
                clearcoat: 0.74,
                clearcoatRoughness: 0.18,
            };
        case 'matte-camo':
            return {
                metalness: 0.46,
                roughness: 0.58,
                clearcoat: 0.22,
                clearcoatRoughness: 0.3,
            };
        case 'ceramic-pearl':
            return {
                metalness: 0.7,
                roughness: 0.18,
                clearcoat: 1,
                clearcoatRoughness: 0.06,
            };
        case 'anodized-iridescent':
            return {
                metalness: 0.9,
                roughness: 0.16,
                clearcoat: 1,
                clearcoatRoughness: 0.08,
            };
        default:
            return {
                metalness: 0.78,
                roughness: 0.24,
                clearcoat: 1,
                clearcoatRoughness: 0.08,
            };
    }
}

function createDriverPlate(text, width = 0.5, height = 0.14) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#07111b');
        gradient.addColorStop(1, '#13283a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(174, 226, 255, 0.7)';
        ctx.lineWidth = 6;
        ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
        ctx.font = '700 42px Sora, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#eef7ff';
        ctx.shadowColor = 'rgba(120, 210, 255, 0.42)';
        ctx.shadowBlur = 18;
        ctx.fillText(
            String(text || 'APEX')
                .trim()
                .slice(0, 18)
                .toUpperCase(),
            canvas.width / 2,
            66
        );
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
}

function loadUserWrapTexture(url) {
    const safeUrl = sanitizeUserWrapTextureUrl(url);
    if (!safeUrl) {
        return Promise.reject(new Error('Wrap URL is invalid.'));
    }
    if (WRAP_TEXTURE_PROMISE_CACHE.has(safeUrl)) {
        return WRAP_TEXTURE_PROMISE_CACHE.get(safeUrl);
    }

    const promise = new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.load(
            safeUrl,
            (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.wrapS = THREE.ClampToEdgeWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;
                texture.anisotropy = 8;
                texture.needsUpdate = true;
                resolve(texture);
            },
            undefined,
            () => reject(new Error('Could not load car wrap image.'))
        );
    });

    WRAP_TEXTURE_PROMISE_CACHE.set(safeUrl, promise);
    return promise.catch((error) => {
        WRAP_TEXTURE_PROMISE_CACHE.delete(safeUrl);
        throw error;
    });
}

function sanitizeUserWrapTextureUrl(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    if (!normalized) {
        return '';
    }
    try {
        const parsed = new URL(
            normalized,
            typeof window?.location?.origin === 'string' ? window.location.origin : undefined
        );
        if (
            parsed.protocol !== 'http:' &&
            parsed.protocol !== 'https:' &&
            parsed.protocol !== 'blob:' &&
            parsed.protocol !== 'data:'
        ) {
            return '';
        }
        return parsed.toString();
    } catch {
        return '';
    }
}
