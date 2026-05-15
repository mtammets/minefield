import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { PLAYER_TOP_SPEED_LIMIT_MIN_KPH, PLAYER_TOP_SPEED_LIMIT_MAX_KPH } from './constants.js';
import {
    DEFAULT_PLAYER_CAR_SKIN_ID,
    getCarSkinPresetById,
    resolvePlayerCarSkinId,
} from './car-skins.js';

const ACCENT_LED_COLOR = 0x64f4ff; // Cool neon turquoise
const ACCENT_LED_SECONDARY_COLOR = 0xff4f7f; // Warm neon red-pink
const HEADLIGHT_COLOR = 0xffffff; // White headlight
const TAILLIGHT_COLOR = 0xff0000; // Red taillight
const DEFAULT_BODY_DIMENSIONS = { width: 1.2, height: 0.4, depth: 4 };
const DEFAULT_WHEEL_POSITIONS = [
    { x: -1.28, z: -1.8 },
    { x: 1.28, z: -1.8 },
    { x: -1.28, z: 1.8 },
    { x: 1.28, z: 1.8 },
];
const ROOF_BRAND_NAME = 'Voltline';
const REAR_MODEL_NAME = 'Minefielt Drift';
const SUSPENSION_LINK_Y = 0.5;
const ROOF_MODULE_LIFT = 0.03;
const TAILLIGHT_RUNNING_LIGHT_FACTOR = 0.28;
const TAILLIGHT_BRAKE_LIGHT_FACTOR = 1.65;
const TAILLIGHT_RUNNING_DISTANCE_FACTOR = 0.64;
const TAILLIGHT_BRAKE_DISTANCE_FACTOR = 1.08;
const TAILLIGHT_RUNNING_EMISSIVE = 0.62;
const TAILLIGHT_BRAKE_EMISSIVE = 2.45;
const WIRELESS_CHARGE_GLOW_COLOR = 0x88eeff;
const CAR_SKIN_TEXTURE_CACHE = new Map();
const CAR_SKIN_BODY_TEXTURE_CACHE = new Map();
const CAR_WRAP_TEXTURE_SET_CACHE = new Map();
const CAR_WRAP_IMAGE_PROMISE_CACHE = new Map();
const USER_WRAP_EMISSIVE_COLOR = new THREE.Color(0xffffff);
const USER_WRAP_SURFACE_SCALES = Object.freeze({
    topWidth: 0.92,
    topDepth: 0.94,
    sideDepth: 0.9,
    sideHeight: 0.56,
    frontWidth: 0.82,
    frontHeight: 0.34,
    rearWidth: 0.82,
    rearHeight: 0.3,
});
const USER_WRAP_SOURCE_MAX_EDGE_PX = 2048;
const USER_WRAP_OVERLAY_OPACITY = 0.84;
const USER_WRAP_OVERLAY_BRIGHTNESS = 1.08;
const DEFAULT_SKIN_MATERIAL = 'gloss-paint';
const BODY_FINISH_PROFILES = Object.freeze({
    'gloss-paint': Object.freeze({
        panelMetalness: 1,
        panelRoughness: 0.17,
        panelClearcoat: 1,
        panelClearcoatRoughness: 0.05,
        panelReflectivity: 0.9,
        panelSheen: 0.04,
        panelSheenRoughness: 0.45,
        panelSheenColorSource: 'stripe',
        panelIridescence: 0,
        panelIridescenceIOR: 1.3,
        panelIridescenceThicknessRange: Object.freeze([120, 220]),
        panelEmissiveScale: 0.95,
        decalMetalness: 0.22,
        decalRoughness: 0.22,
        decalOpacity: 0.98,
        topPulseScale: 1,
        sidePulseScale: 1,
        frontPulseScale: 1,
        rearPulseScale: 1,
        railPulseScale: 1,
        railMetalness: 0.78,
        railRoughness: 0.2,
        railColorScalar: 0.42,
    }),
    'neon-lacquer': Object.freeze({
        panelMetalness: 0.98,
        panelRoughness: 0.14,
        panelClearcoat: 1,
        panelClearcoatRoughness: 0.04,
        panelReflectivity: 0.96,
        panelSheen: 0.08,
        panelSheenRoughness: 0.34,
        panelSheenColorSource: 'glow',
        panelIridescence: 0,
        panelIridescenceIOR: 1.3,
        panelIridescenceThicknessRange: Object.freeze([120, 220]),
        panelEmissiveScale: 1.08,
        decalMetalness: 0.18,
        decalRoughness: 0.2,
        decalOpacity: 0.98,
        topPulseScale: 1.12,
        sidePulseScale: 1.08,
        frontPulseScale: 1.02,
        rearPulseScale: 1.06,
        railPulseScale: 1.2,
        railMetalness: 0.82,
        railRoughness: 0.16,
        railColorScalar: 0.46,
    }),
    'satin-stealth': Object.freeze({
        panelMetalness: 0.7,
        panelRoughness: 0.28,
        panelClearcoat: 0.42,
        panelClearcoatRoughness: 0.24,
        panelReflectivity: 0.62,
        panelSheen: 0.05,
        panelSheenRoughness: 0.58,
        panelSheenColorSource: 'accentSecondary',
        panelIridescence: 0,
        panelIridescenceIOR: 1.3,
        panelIridescenceThicknessRange: Object.freeze([120, 220]),
        panelEmissiveScale: 0.84,
        decalMetalness: 0.08,
        decalRoughness: 0.42,
        decalOpacity: 0.86,
        topPulseScale: 0.84,
        sidePulseScale: 0.82,
        frontPulseScale: 0.86,
        rearPulseScale: 0.9,
        railPulseScale: 0.8,
        railMetalness: 0.58,
        railRoughness: 0.34,
        railColorScalar: 0.32,
    }),
    'ceramic-pearl': Object.freeze({
        panelMetalness: 0.8,
        panelRoughness: 0.1,
        panelClearcoat: 1,
        panelClearcoatRoughness: 0.03,
        panelReflectivity: 0.98,
        panelSheen: 0.22,
        panelSheenRoughness: 0.2,
        panelSheenColorSource: 'stripe',
        panelIridescence: 0.12,
        panelIridescenceIOR: 1.34,
        panelIridescenceThicknessRange: Object.freeze([150, 280]),
        panelEmissiveScale: 1,
        decalMetalness: 0.14,
        decalRoughness: 0.18,
        decalOpacity: 0.94,
        topPulseScale: 1.02,
        sidePulseScale: 0.96,
        frontPulseScale: 0.98,
        rearPulseScale: 1,
        railPulseScale: 1.04,
        railMetalness: 0.8,
        railRoughness: 0.14,
        railColorScalar: 0.44,
    }),
    'matte-camo': Object.freeze({
        panelMetalness: 0.42,
        panelRoughness: 0.56,
        panelClearcoat: 0.16,
        panelClearcoatRoughness: 0.44,
        panelReflectivity: 0.32,
        panelSheen: 0,
        panelSheenRoughness: 1,
        panelSheenColorSource: 'accentSecondary',
        panelIridescence: 0,
        panelIridescenceIOR: 1.3,
        panelIridescenceThicknessRange: Object.freeze([120, 220]),
        panelEmissiveScale: 0.62,
        decalMetalness: 0.04,
        decalRoughness: 0.66,
        decalOpacity: 0.84,
        topPulseScale: 0.72,
        sidePulseScale: 0.72,
        frontPulseScale: 0.76,
        rearPulseScale: 0.78,
        railPulseScale: 0.68,
        railMetalness: 0.42,
        railRoughness: 0.48,
        railColorScalar: 0.26,
    }),
    'forged-carbon': Object.freeze({
        panelMetalness: 0.94,
        panelRoughness: 0.32,
        panelClearcoat: 0.88,
        panelClearcoatRoughness: 0.14,
        panelReflectivity: 0.86,
        panelSheen: 0.14,
        panelSheenRoughness: 0.36,
        panelSheenColorSource: 'accentColor',
        panelIridescence: 0,
        panelIridescenceIOR: 1.32,
        panelIridescenceThicknessRange: Object.freeze([140, 240]),
        panelEmissiveScale: 0.88,
        decalMetalness: 0.32,
        decalRoughness: 0.3,
        decalOpacity: 0.9,
        topPulseScale: 0.94,
        sidePulseScale: 0.9,
        frontPulseScale: 0.92,
        rearPulseScale: 0.94,
        railPulseScale: 1.12,
        railMetalness: 0.88,
        railRoughness: 0.24,
        railColorScalar: 0.38,
    }),
    'brushed-metal': Object.freeze({
        panelMetalness: 1,
        panelRoughness: 0.18,
        panelClearcoat: 0.62,
        panelClearcoatRoughness: 0.16,
        panelReflectivity: 1,
        panelSheen: 0.08,
        panelSheenRoughness: 0.28,
        panelSheenColorSource: 'stripe',
        panelIridescence: 0,
        panelIridescenceIOR: 1.32,
        panelIridescenceThicknessRange: Object.freeze([140, 240]),
        panelEmissiveScale: 0.82,
        decalMetalness: 0.36,
        decalRoughness: 0.22,
        decalOpacity: 0.88,
        topPulseScale: 0.9,
        sidePulseScale: 0.88,
        frontPulseScale: 0.9,
        rearPulseScale: 0.92,
        railPulseScale: 0.98,
        railMetalness: 0.9,
        railRoughness: 0.18,
        railColorScalar: 0.4,
    }),
    'anodized-iridescent': Object.freeze({
        panelMetalness: 1,
        panelRoughness: 0.11,
        panelClearcoat: 1,
        panelClearcoatRoughness: 0.04,
        panelReflectivity: 1,
        panelSheen: 0.16,
        panelSheenRoughness: 0.18,
        panelSheenColorSource: 'glow',
        panelIridescence: 0.95,
        panelIridescenceIOR: 1.48,
        panelIridescenceThicknessRange: Object.freeze([180, 420]),
        panelEmissiveScale: 1.04,
        decalMetalness: 0.22,
        decalRoughness: 0.16,
        decalOpacity: 0.94,
        topPulseScale: 1.16,
        sidePulseScale: 1.1,
        frontPulseScale: 1.06,
        rearPulseScale: 1.08,
        railPulseScale: 1.22,
        railMetalness: 0.86,
        railRoughness: 0.14,
        railColorScalar: 0.5,
    }),
    'industrial-coat': Object.freeze({
        panelMetalness: 0.82,
        panelRoughness: 0.24,
        panelClearcoat: 0.46,
        panelClearcoatRoughness: 0.2,
        panelReflectivity: 0.7,
        panelSheen: 0.04,
        panelSheenRoughness: 0.42,
        panelSheenColorSource: 'accentSecondary',
        panelIridescence: 0,
        panelIridescenceIOR: 1.3,
        panelIridescenceThicknessRange: Object.freeze([120, 220]),
        panelEmissiveScale: 0.8,
        decalMetalness: 0.18,
        decalRoughness: 0.28,
        decalOpacity: 0.92,
        topPulseScale: 0.92,
        sidePulseScale: 0.9,
        frontPulseScale: 0.94,
        rearPulseScale: 0.96,
        railPulseScale: 1,
        railMetalness: 0.78,
        railRoughness: 0.22,
        railColorScalar: 0.34,
    }),
});

// Helper for creating tuned physical materials.
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

function createRoundedBoxGeometry(width, height, depth, cornerRadius = 0, cornerSegments = 4) {
    const maxRadius = Math.max(0, Math.min(width, height, depth) * 0.5 - 0.0001);
    const radius = THREE.MathUtils.clamp(cornerRadius, 0, maxRadius);
    if (radius <= 0) {
        return new THREE.BoxGeometry(width, height, depth);
    }

    const segments = Math.max(1, Math.floor(cornerSegments));
    const curveSegments = Math.max(4, segments * 2);
    // Build the 2D profile inset by radius, because bevel expands outward.
    // This keeps final outer width/height equal to requested dimensions.
    const halfWidth = width * 0.5 - radius;
    const halfHeight = height * 0.5 - radius;

    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, -halfHeight - radius);
    shape.lineTo(halfWidth, -halfHeight - radius);
    shape.absarc(halfWidth, -halfHeight, radius, -Math.PI * 0.5, 0, false);
    shape.lineTo(halfWidth + radius, halfHeight);
    shape.absarc(halfWidth, halfHeight, radius, 0, Math.PI * 0.5, false);
    shape.lineTo(-halfWidth, halfHeight + radius);
    shape.absarc(-halfWidth, halfHeight, radius, Math.PI * 0.5, Math.PI, false);
    shape.lineTo(-halfWidth - radius, -halfHeight);
    shape.absarc(-halfWidth, -halfHeight, radius, Math.PI, Math.PI * 1.5, false);

    const coreDepth = Math.max(0.0001, depth - radius * 2);
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: coreDepth,
        steps: 1,
        bevelEnabled: true,
        bevelThickness: radius,
        bevelSize: radius,
        bevelSegments: segments,
        curveSegments,
    });
    geometry.center();
    geometry.computeVertexNormals();
    return geometry;
}

function addLuxuryBody(car, bodyConfig = {}) {
    const {
        bodyColor = 0x2d67a6,
        skinId = DEFAULT_PLAYER_CAR_SKIN_ID,
        wrapUrl = '',
        bodyDimensions = DEFAULT_BODY_DIMENSIONS,
        wheelPositions = DEFAULT_WHEEL_POSITIONS,
        displayName = 'MAREK',
        rearModelName = REAR_MODEL_NAME,
        roofScreenDynamic = true,
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
    const bodyPanelMaterials = [];
    const bodyWrapOverlayMeshes = [];
    const bodyWrapOverlayMaterials = [];
    const createBodyPanel = ({
        id,
        size,
        position,
        side = 'center',
        zone = 'mid',
        cornerRadius = 0,
        cornerSegments = 4,
        emissiveIntensity = 0.3,
        roughness = 0.18,
    }) => {
        const panelMaterial = createMaterial({
            color: bodyColor,
            emissive: 0x10233d,
            emissiveIntensity,
            metalness: 1,
            roughness,
            clearcoat: 1,
            clearcoatRoughness: 0.05,
        });
        const geometry = createRoundedBoxGeometry(
            size[0],
            size[1],
            size[2],
            cornerRadius,
            cornerSegments
        );
        const panel = new THREE.Mesh(geometry, panelMaterial);
        panel.position.set(position[0], position[1], position[2]);
        panel.castShadow = true;
        panel.receiveShadow = true;
        bodyShellGroup.add(panel);

        const wrapOverlayMaterial = createProjectedWrapOverlayMaterial(size);
        const wrapOverlay = new THREE.Mesh(geometry.clone(), wrapOverlayMaterial);
        wrapOverlay.position.copy(panel.position);
        wrapOverlay.scale.setScalar(1.0025);
        wrapOverlay.visible = false;
        wrapOverlay.renderOrder = 6;
        bodyShellGroup.add(wrapOverlay);

        panelMaterial.userData.baseEmissiveIntensity = emissiveIntensity;
        panelMaterial.userData.basePanelRoughness = roughness;
        bodyPanelMaterials.push(panelMaterial);
        bodyWrapOverlayMaterials.push(wrapOverlayMaterial);
        bodyWrapOverlayMeshes.push(wrapOverlay);

        bodyPanels.push({
            id,
            type: 'body_panel',
            side,
            zone,
            source: panel,
            groundOffset: size[1] * 0.5,
            baseLife: 4.4,
            mass: 1.45,
        });
    };

    // Body shell is split into detachable panels for crash effects.
    createBodyPanel({
        id: 'body_center_core',
        size: [1.22, 0.42, 3.94],
        position: [0, 0.56, 0.06],
        side: 'center',
        zone: 'mid',
        cornerRadius: 0.045,
        cornerSegments: 5,
        emissiveIntensity: 0.32,
        roughness: 0.17,
    });
    const skinController = createBodySkinController(bodyShellGroup, bodyDimensions);
    const wirelessChargeMarker = addUnderbodyWirelessChargeMarker(bodyShellGroup, bodyDimensions);
    const roofBrandingController = addVoltlineRoofBranding(
        roofAssemblyGroup,
        bodyDimensions,
        ROOF_BRAND_NAME,
        displayName,
        { roofScreenDynamic }
    );
    let nameplateGroup = null;
    if (rearModelName) {
        nameplateGroup = addPlayerNameDisplay(
            nameplateAssemblyGroup,
            rearModelName,
            bodyDimensions
        );
    }

    const currentAppearance = {
        skinId: resolvePlayerCarSkinId(skinId),
        colorHex: normalizeBodyColorHex(bodyColor, DEFAULT_PLAYER_CAR_SKIN_ID),
        wrapUrl: sanitizeUserWrapTextureUrl(wrapUrl),
    };
    let appearanceRequestId = 0;

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
            nameplateGroup,
        },
        update(vehicleState, dt) {
            roofBrandingController?.update?.(vehicleState, dt);
            wirelessChargeMarker?.update?.(vehicleState, dt);
            skinController?.update?.(vehicleState, dt);
        },
        setBatteryLevel(levelNormalized) {
            roofBrandingController?.setBatteryLevel?.(levelNormalized);
        },
        cycleRoofMenu(step = 1) {
            return roofBrandingController?.cycleMode?.(step) || null;
        },
        setRoofMenuMode(modeKey) {
            return roofBrandingController?.setMode?.(modeKey) || null;
        },
        setRoofMenuModeFromUv(uv) {
            return roofBrandingController?.setModeFromUv?.(uv) || null;
        },
        getRoofMenuMode() {
            return roofBrandingController?.getMode?.() || null;
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
        const finishProfile = getSkinFinishProfile(nextSkinPreset);
        const bodyTexture = getCarSkinBodyTexture(nextSkinPreset);
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
        const nextColor = new THREE.Color(nextColorHex);
        const bodyEmissive = new THREE.Color(nextSkinPreset.accentColorSecondary).multiplyScalar(
            0.14
        );

        currentAppearance.skinId = nextSkinPreset.id;
        currentAppearance.colorHex = nextColorHex;
        currentAppearance.wrapUrl = nextWrapUrl;

        for (let i = 0; i < bodyPanelMaterials.length; i += 1) {
            applySkinFinishToBodyMaterial(
                bodyPanelMaterials[i],
                finishProfile,
                nextSkinPreset,
                nextColor,
                bodyEmissive,
                bodyTexture
            );
        }
        setProjectedWrapOverlay(null);

        skinController?.applySkin?.(nextSkinPreset, nextWrapUrl);
        wirelessChargeMarker?.setTheme?.(nextSkinPreset);
        roofBrandingController?.setTheme?.(nextSkinPreset);

        if (!nextWrapUrl) {
            return;
        }

        void getUserWrapTextureSet(nextWrapUrl, bodyDimensions)
            .then((wrapTextureSet) => {
                if (
                    requestId !== appearanceRequestId ||
                    currentAppearance.skinId !== nextSkinPreset.id ||
                    currentAppearance.wrapUrl !== nextWrapUrl
                ) {
                    return;
                }

                const wrapBodyColor = new THREE.Color(wrapTextureSet.baseColorHex);
                const wrapBodyEmissive = wrapBodyColor.clone().multiplyScalar(0.045);
                for (let i = 0; i < bodyPanelMaterials.length; i += 1) {
                    applySkinFinishToBodyMaterial(
                        bodyPanelMaterials[i],
                        finishProfile,
                        nextSkinPreset,
                        wrapBodyColor,
                        wrapBodyEmissive,
                        null
                    );
                }
                setProjectedWrapOverlay(wrapTextureSet);
            })
            .catch(() => {});
    }

    function setProjectedWrapOverlay(wrapTextureSet = null) {
        const projectedTexture = wrapTextureSet?.projectedTexture || null;
        const imageAspect = Math.max(0.0001, Number(wrapTextureSet?.imageAspect) || 1);
        for (let i = 0; i < bodyWrapOverlayMaterials.length; i += 1) {
            const material = bodyWrapOverlayMaterials[i];
            const mesh = bodyWrapOverlayMeshes[i];
            if (!material || !mesh) {
                continue;
            }
            material.uniforms.wrapMap.value = projectedTexture;
            material.uniforms.wrapAspect.value = imageAspect;
            mesh.visible = Boolean(projectedTexture);
        }
    }
}

function addUnderbodyWirelessChargeMarker(parent, bodyDimensions) {
    const markerGroup = new THREE.Group();
    markerGroup.name = 'wireless_charge_marker_group';
    const underbodyMarkerDrop = Math.max(0.064, bodyDimensions.height * 0.12);
    markerGroup.position.set(0, 0.56 - bodyDimensions.height * 0.5 - underbodyMarkerDrop, 0.06);
    markerGroup.rotation.x = Math.PI * 0.5;
    parent.add(markerGroup);

    const outerRadius = Math.min(Math.max(bodyDimensions.width * 0.34, 0.36), 0.44);
    const innerRadius = outerRadius * 0.66;
    const coreRadius = innerRadius * 0.55;
    const markerBaseThickness = 0.012;

    const basePlateMaterial = new THREE.MeshStandardMaterial({
        color: 0x0b1624,
        emissive: 0x12324a,
        emissiveIntensity: 0.2,
        metalness: 0.62,
        roughness: 0.38,
    });
    const basePlate = new THREE.Mesh(
        new THREE.CylinderGeometry(outerRadius * 1.02, outerRadius * 1.06, markerBaseThickness, 56),
        basePlateMaterial
    );
    basePlate.rotation.x = Math.PI * 0.5;
    basePlate.position.z = -markerBaseThickness * 0.5;
    markerGroup.add(basePlate);

    const haloMaterial = new THREE.MeshBasicMaterial({
        color: WIRELESS_CHARGE_GLOW_COLOR,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
    });
    const halo = new THREE.Mesh(new THREE.CircleGeometry(outerRadius * 1.16, 64), haloMaterial);
    halo.position.z = 0.001;
    markerGroup.add(halo);

    const ringMaterial = new THREE.MeshBasicMaterial({
        color: WIRELESS_CHARGE_GLOW_COLOR,
        transparent: true,
        opacity: 0.68,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(innerRadius, outerRadius, 72), ringMaterial);
    ring.position.z = 0.0016;
    markerGroup.add(ring);
    const chargeSweepMaterial = new THREE.MeshBasicMaterial({
        color: WIRELESS_CHARGE_GLOW_COLOR,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
    });
    const chargeSweep = new THREE.Mesh(
        new THREE.RingGeometry(innerRadius * 0.9, innerRadius * 1.02, 60),
        chargeSweepMaterial
    );
    chargeSweep.position.z = 0.0026;
    markerGroup.add(chargeSweep);

    const coreDisk = new THREE.Mesh(
        new THREE.CircleGeometry(coreRadius, 48),
        new THREE.MeshStandardMaterial({
            color: 0x0b1624,
            emissive: 0x2bcdf7,
            emissiveIntensity: 0.35,
            metalness: 0.58,
            roughness: 0.28,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false,
        })
    );
    coreDisk.position.z = 0.0021;
    markerGroup.add(coreDisk);

    const symbolTexture = createWirelessChargeSymbolTexture();
    const symbol = new THREE.Mesh(
        new THREE.PlaneGeometry(coreRadius * 1.62, coreRadius * 1.62),
        new THREE.MeshBasicMaterial({
            map: symbolTexture,
            transparent: true,
            opacity: 0.96,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
        })
    );
    symbol.position.z = 0.0032;
    markerGroup.add(symbol);

    const glowState = { phase: Math.random() * Math.PI * 2 };
    let chargingBlend = 0;

    applyTheme();
    applyGlow(0.5, 0);
    return {
        update(vehicleState = {}, deltaTime = 1 / 60) {
            const dt = Math.min(deltaTime || 1 / 60, 0.05);
            glowState.phase += dt * 2.2;
            const chargingTarget = THREE.MathUtils.clamp(
                vehicleState?.chargingLevelNormalized || 0,
                0,
                1
            );
            const chargingBlendRate = chargingTarget > chargingBlend ? 7.8 : 4.6;
            chargingBlend = THREE.MathUtils.lerp(
                chargingBlend,
                chargingTarget,
                1 - Math.exp(-chargingBlendRate * dt)
            );
            const pulse = 0.5 + 0.5 * Math.sin(glowState.phase);
            applyGlow(pulse, chargingBlend);
        },
        setTheme(skinPreset = null) {
            applyTheme(skinPreset);
        },
    };

    function applyTheme(skinPreset = null) {
        const themeColor = new THREE.Color(skinPreset?.glowColor ?? WIRELESS_CHARGE_GLOW_COLOR);
        haloMaterial.color.copy(themeColor);
        ringMaterial.color.copy(themeColor);
        chargeSweepMaterial.color.copy(themeColor);
        basePlateMaterial.emissive.copy(themeColor).multiplyScalar(0.14);
        coreDisk.material.emissive.copy(themeColor);
        symbol.material.color.copy(themeColor);
    }

    function applyGlow(pulse, chargingLevel) {
        const chargedPulse = 0.5 + 0.5 * Math.sin(glowState.phase * (1.7 + chargingLevel * 1.8));
        haloMaterial.opacity = 0.06 + pulse * 0.08 + chargingLevel * 0.16;
        ringMaterial.opacity = 0.5 + pulse * 0.34 + chargingLevel * 0.22;
        chargeSweepMaterial.opacity = 0.08 + chargedPulse * 0.12 + chargingLevel * 0.44;
        chargeSweep.rotation.z = glowState.phase * (0.4 + chargingLevel * 1.8);
        coreDisk.material.emissiveIntensity = 0.24 + pulse * 0.3 + chargingLevel * 0.86;
        symbol.material.opacity = 0.72 + pulse * 0.24 + chargingLevel * 0.2;
        symbol.rotation.z = glowState.phase * 0.06 * (0.22 + chargingLevel * 0.78);
    }
}

function createWirelessChargeSymbolTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width * 0.5;
    const centerY = canvas.height * 0.5;

    const glowGradient = ctx.createRadialGradient(centerX, centerY, 18, centerX, centerY, 182);
    glowGradient.addColorStop(0, 'rgba(178, 244, 255, 0.38)');
    glowGradient.addColorStop(0.62, 'rgba(107, 210, 238, 0.12)');
    glowGradient.addColorStop(1, 'rgba(107, 210, 238, 0)');
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 182, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(171, 243, 255, 0.95)';
    ctx.shadowColor = 'rgba(93, 221, 255, 0.95)';
    ctx.shadowBlur = 16;
    ctx.lineCap = 'round';
    ctx.lineWidth = 16;

    const arcGaps = [
        { radius: 72, start: Math.PI * 1.14, end: Math.PI * 1.86 },
        { radius: 116, start: Math.PI * 1.18, end: Math.PI * 1.82 },
    ];
    for (let i = 0; i < arcGaps.length; i += 1) {
        const arc = arcGaps[i];
        ctx.beginPath();
        ctx.arc(centerX, centerY, arc.radius, arc.start, arc.end);
        ctx.stroke();
    }

    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + 88);
    ctx.lineTo(centerX, centerY + 10);
    ctx.stroke();

    ctx.fillStyle = 'rgba(196, 248, 255, 0.98)';
    ctx.beginPath();
    ctx.arc(centerX, centerY + 114, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function addVoltlineRoofBranding(
    parent,
    bodyDimensions,
    brandName = ROOF_BRAND_NAME,
    playerName = 'MAREK',
    options = {}
) {
    const roofScreenDynamic = options?.roofScreenDynamic !== false;
    const roofScreen = createVoltlineRoofScreenController(brandName, playerName);
    const roofTexture = roofScreen.texture;
    const shimmerTexture = createRoofShimmerTexture();
    const roofCenterY = 0.56 + bodyDimensions.height * 0.5 + ROOF_MODULE_LIFT;
    const roofCenterZ = 0.1;
    const screenAspect =
        roofTexture.image?.width && roofTexture.image?.height
            ? roofTexture.image.width / roofTexture.image.height
            : 2.2;
    const screenWidth = bodyDimensions.width * 0.72;
    const screenDepth = screenWidth / screenAspect;
    const badgePadding = 0.075;
    const badgeWidth = screenWidth + badgePadding * 2;
    const badgeDepth = screenDepth + badgePadding * 2;
    const railMaterial = createMaterial({
        color: 0x2b4a36,
        emissive: 0x96ffbe,
        emissiveIntensity: 0.58,
        metalness: 0.62,
        roughness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
    });
    const railLowBatteryColor = new THREE.Color(0xff6e7a);
    const railMidBatteryColor = new THREE.Color(0xffd77a);
    const railHighBatteryColor = new THREE.Color(0x96ffbe);
    const railBatteryColor = railHighBatteryColor.clone();
    const railBatteryTargetColor = railHighBatteryColor.clone();

    const badgeBase = new THREE.Mesh(
        new THREE.BoxGeometry(badgeWidth, 0.03, badgeDepth),
        createMaterial({
            color: 0x141c29,
            emissive: 0x0b1420,
            emissiveIntensity: 0.24,
            metalness: 0.98,
            roughness: 0.17,
            clearcoat: 1,
            clearcoatRoughness: 0.04,
        })
    );
    badgeBase.position.set(0, roofCenterY + 0.012, roofCenterZ);
    badgeBase.castShadow = true;
    badgeBase.receiveShadow = true;
    parent.add(badgeBase);

    const trim = new THREE.Mesh(
        new THREE.BoxGeometry(badgeWidth + 0.04, 0.012, badgeDepth + 0.04),
        createMaterial({
            color: 0xbac7d9,
            emissive: 0x314258,
            emissiveIntensity: 0.18,
            metalness: 1,
            roughness: 0.11,
            clearcoat: 1,
            clearcoatRoughness: 0.03,
        })
    );
    trim.position.set(0, roofCenterY + 0.034, roofCenterZ);
    trim.castShadow = true;
    trim.receiveShadow = true;
    parent.add(trim);

    const logoPlateMaterial = new THREE.MeshStandardMaterial({
        map: roofTexture,
        transparent: true,
        alphaTest: 0.06,
        emissive: new THREE.Color(0x9ceaff),
        emissiveMap: roofTexture,
        emissiveIntensity: 0.92,
        metalness: 0.14,
        roughness: 0.28,
        depthWrite: false,
    });
    const logoPlate = new THREE.Mesh(
        new THREE.PlaneGeometry(screenWidth, screenDepth),
        logoPlateMaterial
    );
    logoPlate.userData.roofMenuSurface = true;
    logoPlate.rotation.x = -Math.PI / 2;
    logoPlate.position.set(0, roofCenterY + 0.041, roofCenterZ);
    parent.add(logoPlate);

    const gloss = new THREE.Mesh(
        new THREE.PlaneGeometry(screenWidth + 0.018, screenDepth + 0.02),
        new THREE.MeshPhysicalMaterial({
            color: 0xf7fbff,
            transparent: true,
            opacity: 0.12,
            metalness: 0.2,
            roughness: 0.04,
            clearcoat: 1,
            clearcoatRoughness: 0.01,
            depthWrite: false,
        })
    );
    gloss.rotation.x = -Math.PI / 2;
    gloss.position.set(0, roofCenterY + 0.0445, roofCenterZ);
    parent.add(gloss);

    const shimmerMaterial = new THREE.MeshBasicMaterial({
        map: shimmerTexture,
        color: 0xc3f2ff,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
    });
    const shimmer = new THREE.Mesh(
        new THREE.PlaneGeometry(screenWidth * 0.96, screenDepth * 0.9),
        shimmerMaterial
    );
    shimmer.rotation.x = -Math.PI / 2;
    shimmer.position.set(0, roofCenterY + 0.0462, roofCenterZ);
    parent.add(shimmer);

    const railGeometry = new THREE.BoxGeometry(0.022, 0.018, screenDepth + 0.04);
    const railX = screenWidth * 0.5 + 0.028;
    const leftRail = new THREE.Mesh(railGeometry, railMaterial);
    leftRail.position.set(-railX, roofCenterY + 0.04, roofCenterZ);
    parent.add(leftRail);
    const rightRail = new THREE.Mesh(railGeometry, railMaterial);
    rightRail.position.set(railX, roofCenterY + 0.04, roofCenterZ);
    parent.add(rightRail);

    const modeOrder = ['dashboard', 'battery', 'navigation', 'chassis'];
    const brandState = {
        phase: Math.random() * Math.PI * 2,
        modeTimer: 0,
        refreshTimer: 0,
        manualControlEnabled: false,
        activeModeIndex: 0,
        activeMode: modeOrder[0],
        batteryLevel: 1,
        batteryPercent: 100,
        lastVehicleState: {},
    };

    applyTheme();

    function setActiveModeByIndex(nextIndex) {
        const modeCount = modeOrder.length;
        const wrappedIndex = ((nextIndex % modeCount) + modeCount) % modeCount;
        brandState.activeModeIndex = wrappedIndex;
        brandState.activeMode = modeOrder[wrappedIndex];
    }

    function setActiveMode(modeKey) {
        const nextIndex = modeOrder.indexOf(modeKey);
        if (nextIndex === -1) {
            return brandState.activeMode;
        }
        setActiveModeByIndex(nextIndex);
        brandState.modeTimer = 0;
        brandState.refreshTimer = 0;
        brandState.manualControlEnabled = true;
        roofScreen.render(
            brandState.activeMode,
            brandState.batteryLevel,
            brandState.lastVehicleState
        );
        return brandState.activeMode;
    }

    function cycleActiveMode(step = 1) {
        const direction = step >= 0 ? 1 : -1;
        setActiveModeByIndex(brandState.activeModeIndex + direction);
        brandState.modeTimer = 0;
        brandState.refreshTimer = 0;
        brandState.manualControlEnabled = true;
        roofScreen.render(
            brandState.activeMode,
            brandState.batteryLevel,
            brandState.lastVehicleState
        );
        return brandState.activeMode;
    }

    function sampleRailBatteryColor(level, outColor) {
        if (level <= 0.22) {
            return outColor.copy(railLowBatteryColor);
        }
        if (level <= 0.6) {
            const t = (level - 0.22) / (0.6 - 0.22);
            return outColor.copy(railLowBatteryColor).lerp(railMidBatteryColor, t);
        }
        const t = (level - 0.6) / (1 - 0.6);
        return outColor.copy(railMidBatteryColor).lerp(railHighBatteryColor, t);
    }

    return {
        update(vehicleState = {}, dt = 1 / 60) {
            brandState.lastVehicleState = vehicleState;
            const speedRatio = THREE.MathUtils.clamp(Math.abs(vehicleState.speed || 0) / 62, 0, 1);
            const throttleRatio = THREE.MathUtils.clamp(Math.abs(vehicleState.throttle || 0), 0, 1);
            const burnoutRatio = THREE.MathUtils.clamp(
                vehicleState.burnout || vehicleState.launchSlip || 0,
                0,
                1
            );
            const activity = THREE.MathUtils.clamp(
                speedRatio * 0.7 + throttleRatio * 0.22 + burnoutRatio * 0.55,
                0,
                1.8
            );

            brandState.phase += dt * (2.8 + activity * 4.6);
            const pulse = 0.5 + 0.5 * Math.sin(brandState.phase);
            const highPulse = 0.5 + 0.5 * Math.sin(brandState.phase * 1.7 + 0.4);

            const nextBatteryLevel = THREE.MathUtils.clamp(
                vehicleState.batteryLevelNormalized ?? brandState.batteryLevel,
                0,
                1
            );
            const nextBatteryPercent = Math.round(nextBatteryLevel * 100);
            let needsScreenRefresh = false;
            if (Math.abs(nextBatteryLevel - brandState.batteryLevel) > 0.0005) {
                brandState.batteryLevel = nextBatteryLevel;
                if (
                    brandState.activeMode === 'battery' &&
                    nextBatteryPercent !== brandState.batteryPercent
                ) {
                    needsScreenRefresh = true;
                }
                brandState.batteryPercent = nextBatteryPercent;
            }

            brandState.refreshTimer += dt;
            if (brandState.manualControlEnabled) {
                brandState.modeTimer = 0;
            } else {
                brandState.modeTimer += dt;
                const switchInterval =
                    brandState.activeMode === 'dashboard'
                        ? 4.4
                        : brandState.activeMode === 'battery'
                          ? 2.8
                          : 3.4;
                if (brandState.modeTimer >= switchInterval) {
                    brandState.modeTimer = 0;
                    setActiveModeByIndex(brandState.activeModeIndex + 1);
                    needsScreenRefresh = true;
                }
            }
            const refreshInterval = brandState.activeMode === 'battery' ? 0.3 : 0.16;
            if (brandState.refreshTimer >= refreshInterval) {
                brandState.refreshTimer = 0;
                needsScreenRefresh = true;
            }

            if (roofScreenDynamic && needsScreenRefresh) {
                roofScreen.render(brandState.activeMode, brandState.batteryLevel, vehicleState);
            }

            sampleRailBatteryColor(brandState.batteryLevel, railBatteryTargetColor);
            const railColorBlend = 1 - Math.exp(-7.5 * dt);
            railBatteryColor.lerp(railBatteryTargetColor, railColorBlend);
            railMaterial.emissive.copy(railBatteryColor);
            railMaterial.color.copy(railBatteryColor).multiplyScalar(0.34);
            logoPlateMaterial.emissiveIntensity = 0.58 + pulse * 0.26 + activity * 0.32;
            railMaterial.emissiveIntensity = 0.42 + highPulse * 0.3 + activity * 0.34;
            shimmerMaterial.opacity = 0.08 + highPulse * 0.08 + activity * 0.08;
            shimmerTexture.offset.x =
                (shimmerTexture.offset.x + dt * (0.13 + speedRatio * 0.9 + burnoutRatio * 1.1)) % 1;
        },
        setBatteryLevel(levelNormalized) {
            const level = THREE.MathUtils.clamp(levelNormalized, 0, 1);
            brandState.batteryLevel = level;
            brandState.batteryPercent = Math.round(level * 100);
            if (roofScreenDynamic && brandState.activeMode === 'battery') {
                roofScreen.render(brandState.activeMode, level, brandState.lastVehicleState);
            }
        },
        cycleMode(step = 1) {
            return cycleActiveMode(step);
        },
        setMode(modeKey) {
            return setActiveMode(modeKey);
        },
        setModeFromUv(uv) {
            const interaction = roofScreen.resolveInteractionFromUv(uv, brandState.activeMode);
            if (!interaction) {
                return null;
            }
            if (interaction.type === 'mode') {
                return {
                    type: 'mode',
                    modeKey: setActiveMode(interaction.modeKey),
                };
            }
            return interaction;
        },
        getMode() {
            return brandState.activeMode;
        },
        setTheme(skinPreset = null) {
            applyTheme(skinPreset);
        },
    };

    function applyTheme(skinPreset = null) {
        const accentColor = new THREE.Color(skinPreset?.accentColor ?? 0x9ceaff);
        const stripeColor = new THREE.Color(skinPreset?.stripeColor ?? 0xc3f2ff);
        const secondaryColor = new THREE.Color(skinPreset?.accentColorSecondary ?? 0x314258);
        logoPlateMaterial.emissive.copy(accentColor);
        shimmerMaterial.color.copy(stripeColor);
        badgeBase.material.emissive.copy(secondaryColor).multiplyScalar(0.42);
        trim.material.emissive.copy(accentColor).multiplyScalar(0.18);
    }
}

function addPlayerNameDisplay(parent, playerName, bodyDimensions) {
    const plateTexture = createNameplateTexture(playerName);
    const rearZ = bodyDimensions.depth * 0.5 + 0.072;
    const plateY = 0.674;

    const badgeGroup = new THREE.Group();
    badgeGroup.position.set(0, 0, rearZ);
    badgeGroup.rotation.x = -0.035;
    parent.add(badgeGroup);

    const wordmarkWidth = bodyDimensions.width * 0.76;
    const wordmarkHeight = 0.164;
    const plaque = new THREE.Mesh(
        createRoundedBoxGeometry(wordmarkWidth * 1.16, wordmarkHeight * 1.58, 0.03, 0.03, 5),
        new THREE.MeshPhysicalMaterial({
            color: 0x120d08,
            emissive: new THREE.Color(0x23170a),
            emissiveIntensity: 0.18,
            metalness: 0.92,
            roughness: 0.34,
            clearcoat: 1,
            clearcoatRoughness: 0.18,
        })
    );
    plaque.position.set(0, plateY - 0.014, -0.006);
    badgeGroup.add(plaque);

    const logoShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(wordmarkWidth * 1.05, wordmarkHeight * 1.05),
        new THREE.MeshBasicMaterial({
            map: plateTexture,
            color: 0x000000,
            transparent: true,
            opacity: 0.28,
            depthWrite: false,
            toneMapped: false,
        })
    );
    logoShadow.position.set(0, plateY - 0.01, 0.006);
    logoShadow.renderOrder = 7;
    badgeGroup.add(logoShadow);

    const extrusionLayers = [
        {
            z: 0.008,
            y: plateY - 0.006,
            scale: 1.026,
            color: 0x4b3013,
            emissive: 0x1a0d04,
            emissiveIntensity: 0.1,
            metalness: 0.74,
            roughness: 0.56,
        },
        {
            z: 0.0115,
            y: plateY - 0.0045,
            scale: 1.02,
            color: 0x6d461b,
            emissive: 0x2a1405,
            emissiveIntensity: 0.12,
            metalness: 0.8,
            roughness: 0.48,
        },
        {
            z: 0.015,
            y: plateY - 0.003,
            scale: 1.014,
            color: 0x926227,
            emissive: 0x392009,
            emissiveIntensity: 0.14,
            metalness: 0.86,
            roughness: 0.38,
        },
    ];

    for (let i = 0; i < extrusionLayers.length; i += 1) {
        const layer = extrusionLayers[i];
        const layerMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(wordmarkWidth * layer.scale, wordmarkHeight * layer.scale),
            new THREE.MeshPhysicalMaterial({
                map: plateTexture,
                transparent: true,
                alphaTest: 0.08,
                color: layer.color,
                emissive: new THREE.Color(layer.emissive),
                emissiveIntensity: layer.emissiveIntensity,
                metalness: layer.metalness,
                roughness: layer.roughness,
                clearcoat: 0.86,
                clearcoatRoughness: 0.22,
                depthWrite: false,
            })
        );
        layerMesh.position.set(0, layer.y, layer.z);
        layerMesh.renderOrder = 8 + i;
        badgeGroup.add(layerMesh);
    }

    const wordmarkFace = new THREE.Mesh(
        new THREE.PlaneGeometry(wordmarkWidth, wordmarkHeight),
        new THREE.MeshPhysicalMaterial({
            map: plateTexture,
            transparent: true,
            alphaTest: 0.08,
            color: 0xffe9be,
            emissive: new THREE.Color(0xa16a1d),
            emissiveIntensity: 0.28,
            metalness: 0.92,
            roughness: 0.2,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
            depthWrite: false,
        })
    );
    wordmarkFace.position.set(0, plateY, 0.02);
    wordmarkFace.renderOrder = 12;
    badgeGroup.add(wordmarkFace);

    const wordmarkSheen = new THREE.Mesh(
        new THREE.PlaneGeometry(wordmarkWidth * 1.02, wordmarkHeight * 1.02),
        new THREE.MeshBasicMaterial({
            map: plateTexture,
            color: 0xfff8de,
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
            toneMapped: false,
            blending: THREE.AdditiveBlending,
        })
    );
    wordmarkSheen.position.set(0, plateY + 0.002, 0.024);
    wordmarkSheen.renderOrder = 13;
    badgeGroup.add(wordmarkSheen);

    return badgeGroup;
}

function resolveUserWrapSurfaceLayout(bodyDimensions = DEFAULT_BODY_DIMENSIONS) {
    const topWidth = bodyDimensions.width * USER_WRAP_SURFACE_SCALES.topWidth;
    const topDepth = bodyDimensions.depth * USER_WRAP_SURFACE_SCALES.topDepth;
    const sideDepth = bodyDimensions.depth * USER_WRAP_SURFACE_SCALES.sideDepth;
    const sideHeight = bodyDimensions.height * USER_WRAP_SURFACE_SCALES.sideHeight;
    const frontWidth = bodyDimensions.width * USER_WRAP_SURFACE_SCALES.frontWidth;
    const frontHeight = bodyDimensions.height * USER_WRAP_SURFACE_SCALES.frontHeight;
    const rearWidth = bodyDimensions.width * USER_WRAP_SURFACE_SCALES.rearWidth;
    const rearHeight = bodyDimensions.height * USER_WRAP_SURFACE_SCALES.rearHeight;

    return {
        top: {
            width: topWidth,
            height: topDepth,
        },
        side: {
            width: sideDepth,
            height: sideHeight,
        },
        front: {
            width: frontWidth,
            height: frontHeight,
        },
        rear: {
            width: rearWidth,
            height: rearHeight,
        },
    };
}

function createBodySkinController(parent, bodyDimensions) {
    const overlayGroup = new THREE.Group();
    overlayGroup.name = 'body_skin_overlay_group';
    parent.add(overlayGroup);
    const wrapSurfaceLayout = resolveUserWrapSurfaceLayout(bodyDimensions);

    const topMaterial = createSkinDecalMaterial();
    const sideLeftMaterial = createSkinDecalMaterial();
    const sideRightMaterial = createSkinDecalMaterial();
    const frontMaterial = createSkinDecalMaterial();
    const rearMaterial = createSkinDecalMaterial();
    const railLeftMaterial = createMaterial({
        color: 0x2a465c,
        emissive: 0x63d8ff,
        emissiveIntensity: 0.48,
        metalness: 0.78,
        roughness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
    });
    const railRightMaterial = railLeftMaterial.clone();

    const bodyCenterY = 0.56;
    const bodyCenterZ = 0.06;
    const topY = bodyCenterY + bodyDimensions.height * 0.5 + 0.009;
    const sideY = bodyCenterY + 0.02;
    const sideX = bodyDimensions.width * 0.5 + 0.008;
    const noseZ = bodyCenterZ + bodyDimensions.depth * 0.5 + 0.006;
    const tailZ = bodyCenterZ - bodyDimensions.depth * 0.5 - 0.006;

    const topDecal = new THREE.Mesh(
        new THREE.PlaneGeometry(wrapSurfaceLayout.top.width, wrapSurfaceLayout.top.height),
        topMaterial
    );
    topDecal.rotation.x = -Math.PI * 0.5;
    topDecal.position.set(0, topY, bodyCenterZ);
    overlayGroup.add(topDecal);

    const sideGeometry = new THREE.PlaneGeometry(
        wrapSurfaceLayout.side.width,
        wrapSurfaceLayout.side.height
    );
    const leftSideDecal = new THREE.Mesh(sideGeometry, sideLeftMaterial);
    leftSideDecal.rotation.y = Math.PI * 0.5;
    leftSideDecal.position.set(-sideX, sideY, bodyCenterZ);
    overlayGroup.add(leftSideDecal);

    const rightSideDecal = new THREE.Mesh(sideGeometry.clone(), sideRightMaterial);
    rightSideDecal.rotation.y = -Math.PI * 0.5;
    rightSideDecal.position.set(sideX, sideY, bodyCenterZ);
    overlayGroup.add(rightSideDecal);

    const frontDecal = new THREE.Mesh(
        new THREE.PlaneGeometry(wrapSurfaceLayout.front.width, wrapSurfaceLayout.front.height),
        frontMaterial
    );
    frontDecal.position.set(0, bodyCenterY + 0.01, noseZ);
    overlayGroup.add(frontDecal);

    const rearDecal = new THREE.Mesh(
        new THREE.PlaneGeometry(wrapSurfaceLayout.rear.width, wrapSurfaceLayout.rear.height),
        rearMaterial
    );
    rearDecal.rotation.y = Math.PI;
    rearDecal.position.set(0, bodyCenterY + 0.02, tailZ);
    overlayGroup.add(rearDecal);

    const railGeometry = new THREE.BoxGeometry(0.03, 0.018, bodyDimensions.depth * 0.82);
    const leftRail = new THREE.Mesh(railGeometry, railLeftMaterial);
    leftRail.position.set(-(bodyDimensions.width * 0.5 + 0.022), topY - 0.028, bodyCenterZ);
    overlayGroup.add(leftRail);

    const rightRail = new THREE.Mesh(railGeometry.clone(), railRightMaterial);
    rightRail.position.set(bodyDimensions.width * 0.5 + 0.022, topY - 0.028, bodyCenterZ);
    overlayGroup.add(rightRail);

    const skinState = {
        phase: Math.random() * Math.PI * 2,
        skinId: DEFAULT_PLAYER_CAR_SKIN_ID,
        finishProfile: getSkinFinishProfile(getCarSkinPresetById(DEFAULT_PLAYER_CAR_SKIN_ID)),
        wrapUrl: '',
        hasUserWrap: false,
        wrapRequestId: 0,
    };

    applySkin(getCarSkinPresetById(DEFAULT_PLAYER_CAR_SKIN_ID), '');

    return {
        applySkin,
        update(vehicleState = {}, deltaTime = 1 / 60) {
            const dt = Math.min(deltaTime || 1 / 60, 0.05);
            const speedRatio = THREE.MathUtils.clamp(Math.abs(vehicleState.speed || 0) / 58, 0, 1);
            const throttleRatio = THREE.MathUtils.clamp(Math.abs(vehicleState.throttle || 0), 0, 1);
            const steerRatio = THREE.MathUtils.clamp(Math.abs(vehicleState.steerInput || 0), 0, 1);
            const activity = THREE.MathUtils.clamp(
                speedRatio * 0.58 + throttleRatio * 0.28 + steerRatio * 0.22,
                0,
                1.3
            );
            skinState.phase += dt * (2.6 + activity * 3.8);
            const pulse = 0.5 + 0.5 * Math.sin(skinState.phase);
            const secondaryPulse = 0.5 + 0.5 * Math.sin(skinState.phase * 1.6 + 0.55);
            const finishProfile = skinState.finishProfile;

            if (skinState.hasUserWrap) {
                topMaterial.emissiveIntensity = 0.12;
                sideLeftMaterial.emissiveIntensity = 0.1;
                sideRightMaterial.emissiveIntensity = 0.1;
                frontMaterial.emissiveIntensity = 0.1;
                rearMaterial.emissiveIntensity = 0.1;
            } else {
                topMaterial.emissiveIntensity =
                    (0.52 + pulse * 0.26 + activity * 0.2) * finishProfile.topPulseScale;
                sideLeftMaterial.emissiveIntensity =
                    (0.34 + secondaryPulse * 0.18 + activity * 0.22) * finishProfile.sidePulseScale;
                sideRightMaterial.emissiveIntensity = sideLeftMaterial.emissiveIntensity;
                frontMaterial.emissiveIntensity =
                    (0.46 + secondaryPulse * 0.18 + activity * 0.16) *
                    finishProfile.frontPulseScale;
                rearMaterial.emissiveIntensity =
                    (0.5 + pulse * 0.22 + activity * 0.18) * finishProfile.rearPulseScale;
            }
            railLeftMaterial.emissiveIntensity =
                (0.42 + pulse * 0.24 + activity * 0.3) * finishProfile.railPulseScale;
            railRightMaterial.emissiveIntensity = railLeftMaterial.emissiveIntensity;
        },
    };

    function applySkin(skinPreset = null, wrapUrl = '') {
        const preset =
            skinPreset && typeof skinPreset === 'object'
                ? skinPreset
                : getCarSkinPresetById(DEFAULT_PLAYER_CAR_SKIN_ID);
        const finishProfile = getSkinFinishProfile(preset);
        const topTexture = getCarSkinTexture(preset, 'top');
        const sideTexture = getCarSkinTexture(preset, 'side');
        const frontTexture = getCarSkinTexture(preset, 'front');
        const rearTexture = getCarSkinTexture(preset, 'rear');
        const accentColor = new THREE.Color(preset.accentColor);
        const stripeColor = new THREE.Color(preset.stripeColor);
        const glowColor = new THREE.Color(preset.glowColor);
        const safeWrapUrl = sanitizeUserWrapTextureUrl(wrapUrl);
        const wrapRequestId = skinState.wrapRequestId + 1;

        skinState.skinId = preset.id;
        skinState.finishProfile = finishProfile;
        skinState.wrapUrl = safeWrapUrl;
        skinState.hasUserWrap = Boolean(safeWrapUrl);
        skinState.wrapRequestId = wrapRequestId;

        applySkinTexture(topMaterial, topTexture, accentColor, finishProfile, 'top');
        applySkinTexture(sideLeftMaterial, sideTexture, accentColor, finishProfile, 'side');
        applySkinTexture(sideRightMaterial, sideTexture, accentColor, finishProfile, 'side');
        applySkinTexture(frontMaterial, frontTexture, stripeColor, finishProfile, 'front');
        applySkinTexture(rearMaterial, rearTexture, stripeColor, finishProfile, 'rear');
        railLeftMaterial.color.copy(glowColor).multiplyScalar(finishProfile.railColorScalar);
        railLeftMaterial.emissive.copy(glowColor);
        railLeftMaterial.metalness = finishProfile.railMetalness;
        railLeftMaterial.roughness = finishProfile.railRoughness;
        railRightMaterial.color.copy(glowColor).multiplyScalar(finishProfile.railColorScalar);
        railRightMaterial.emissive.copy(glowColor);
        railRightMaterial.metalness = finishProfile.railMetalness;
        railRightMaterial.roughness = finishProfile.railRoughness;

        if (!safeWrapUrl) {
            return;
        }

        if (skinState.wrapRequestId !== wrapRequestId || skinState.wrapUrl !== safeWrapUrl) {
            return;
        }

        clearSkinTexture(topMaterial, finishProfile);
        clearSkinTexture(sideLeftMaterial, finishProfile);
        clearSkinTexture(sideRightMaterial, finishProfile);
        clearSkinTexture(frontMaterial, finishProfile);
        clearSkinTexture(rearMaterial, finishProfile);
    }
}

function createSkinDecalMaterial() {
    return new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        alphaTest: 0.08,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.45,
        metalness: 0.16,
        roughness: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
}

function createProjectedWrapOverlayMaterial(panelSize) {
    return new THREE.ShaderMaterial({
        uniforms: {
            wrapMap: { value: null },
            wrapAspect: { value: 1 },
            wrapOpacity: { value: USER_WRAP_OVERLAY_OPACITY },
            wrapBrightness: { value: USER_WRAP_OVERLAY_BRIGHTNESS },
            panelSize: {
                value: new THREE.Vector3(
                    Math.max(0.0001, Number(panelSize?.[0]) || DEFAULT_BODY_DIMENSIONS.width),
                    Math.max(0.0001, Number(panelSize?.[1]) || DEFAULT_BODY_DIMENSIONS.height),
                    Math.max(0.0001, Number(panelSize?.[2]) || DEFAULT_BODY_DIMENSIONS.depth)
                ),
            },
        },
        vertexShader: `
            varying vec3 vLocalPosition;
            varying vec3 vLocalNormal;
            varying vec3 vWorldPosition;
            varying vec3 vWorldNormal;

            void main() {
                vLocalPosition = position;
                vLocalNormal = normalize(normal);
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                vWorldNormal = normalize(mat3(modelMatrix) * normal);
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `,
        fragmentShader: `
            uniform sampler2D wrapMap;
            uniform vec3 panelSize;
            uniform float wrapAspect;
            uniform float wrapOpacity;
            uniform float wrapBrightness;

            varying vec3 vLocalPosition;
            varying vec3 vLocalNormal;
            varying vec3 vWorldPosition;
            varying vec3 vWorldNormal;

            vec2 coverUv(vec2 uv, float targetAspect, float sourceAspect) {
                float safeTargetAspect = max(targetAspect, 0.0001);
                float safeSourceAspect = max(sourceAspect, 0.0001);
                vec2 fittedUv = uv;

                if (safeSourceAspect > safeTargetAspect) {
                    float scale = safeTargetAspect / safeSourceAspect;
                    fittedUv.x = (uv.x - 0.5) * scale + 0.5;
                } else {
                    float scale = safeSourceAspect / safeTargetAspect;
                    fittedUv.y = (uv.y - 0.5) * scale + 0.5;
                }

                return clamp(fittedUv, 0.0, 1.0);
            }

            void main() {
                vec3 normalWeights = abs(normalize(vLocalNormal));
                normalWeights = pow(normalWeights, vec3(5.5));
                normalWeights /= max(normalWeights.x + normalWeights.y + normalWeights.z, 0.0001);

                vec2 sideUv = coverUv(
                    vec2(
                        (vLocalPosition.z / panelSize.z) + 0.5,
                        1.0 - ((vLocalPosition.y / panelSize.y) + 0.5)
                    ),
                    panelSize.z / panelSize.y,
                    wrapAspect
                );
                vec2 topUv = coverUv(
                    vec2(
                        (vLocalPosition.x / panelSize.x) + 0.5,
                        1.0 - ((vLocalPosition.z / panelSize.z) + 0.5)
                    ),
                    panelSize.x / panelSize.z,
                    wrapAspect
                );
                vec2 frontUv = coverUv(
                    vec2(
                        (vLocalPosition.x / panelSize.x) + 0.5,
                        1.0 - ((vLocalPosition.y / panelSize.y) + 0.5)
                    ),
                    panelSize.x / panelSize.y,
                    wrapAspect
                );

                vec3 projectedColor =
                    texture2D(wrapMap, sideUv).rgb * normalWeights.x +
                    texture2D(wrapMap, topUv).rgb * normalWeights.y +
                    texture2D(wrapMap, frontUv).rgb * normalWeights.z;

                vec3 worldNormal = normalize(vWorldNormal);
                vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
                vec3 keyLightDirection = normalize(vec3(0.32, 0.88, 0.24));
                vec3 reflectedLight = reflect(-keyLightDirection, worldNormal);
                float specular = pow(max(dot(reflectedLight, viewDirection), 0.0), 34.0);
                float fresnel = pow(1.0 - max(dot(worldNormal, viewDirection), 0.0), 3.4);
                vec3 gloss = vec3(specular * 0.24 + fresnel * 0.08);
                vec3 finalColor = min(projectedColor * wrapBrightness + gloss, vec3(1.0));

                gl_FragColor = vec4(finalColor, wrapOpacity);
            }
        `,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        side: THREE.FrontSide,
        toneMapped: false,
    });
}

function applySkinTexture(material, texture, emissiveColor, finishProfile, surface = 'side') {
    const isUserWrapTexture = Boolean(texture?.userData?.isUserWrapTexture);
    material.map = texture;
    material.emissiveMap = texture;
    material.emissive.copy(isUserWrapTexture ? USER_WRAP_EMISSIVE_COLOR : emissiveColor);
    material.metalness = isUserWrapTexture
        ? Math.min(finishProfile.decalMetalness, 0.08)
        : finishProfile.decalMetalness;
    material.roughness = isUserWrapTexture
        ? Math.max(finishProfile.decalRoughness, 0.34)
        : finishProfile.decalRoughness;
    material.opacity = isUserWrapTexture
        ? 1
        : surface === 'front' || surface === 'rear'
          ? Math.min(1, finishProfile.decalOpacity + 0.04)
          : finishProfile.decalOpacity;
    material.needsUpdate = true;
}

function clearSkinTexture(material, finishProfile) {
    material.map = null;
    material.emissiveMap = null;
    material.emissive.setHex(0x000000);
    material.metalness = finishProfile.decalMetalness;
    material.roughness = finishProfile.decalRoughness;
    material.opacity = 0;
    material.needsUpdate = true;
}

function getCarSkinTexture(skinPreset, surface = 'top') {
    const cacheKey = `${skinPreset.id}:${surface}`;
    if (CAR_SKIN_TEXTURE_CACHE.has(cacheKey)) {
        return CAR_SKIN_TEXTURE_CACHE.get(cacheKey);
    }

    const texture = createCarSkinTexture(skinPreset, surface);
    CAR_SKIN_TEXTURE_CACHE.set(cacheKey, texture);
    return texture;
}

function getCarSkinBodyTexture(skinPreset) {
    const cacheKey = `${skinPreset.id}:body`;
    if (CAR_SKIN_BODY_TEXTURE_CACHE.has(cacheKey)) {
        return CAR_SKIN_BODY_TEXTURE_CACHE.get(cacheKey);
    }

    const texture = createCarSkinBodyTexture(skinPreset);
    CAR_SKIN_BODY_TEXTURE_CACHE.set(cacheKey, texture);
    return texture;
}

function createCarSkinBodyTexture(skinPreset) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawSkinMaterialBase(ctx, canvas.width, canvas.height, skinPreset, 'body');
    drawBodyTextureOverlay(ctx, canvas.width, canvas.height, skinPreset);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.35, 1.1);
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
}

function createCarSkinTexture(skinPreset, surface = 'top') {
    const dimensionsBySurface = {
        top: { width: 1024, height: 1024 },
        side: { width: 1024, height: 480 },
        front: { width: 640, height: 320 },
        rear: { width: 640, height: 320 },
    };
    const dimensions = dimensionsBySurface[surface] || dimensionsBySurface.top;
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawSkinMaterialBase(ctx, canvas.width, canvas.height, skinPreset, surface);
    drawUniversalSkinHighlights(ctx, canvas.width, canvas.height, skinPreset, surface);

    switch (skinPreset.pattern) {
        case 'chevron-burst':
            drawChevronBurstSkin(ctx, canvas.width, canvas.height, skinPreset, surface);
            break;
        case 'solar-sweep':
            drawSolarSweepSkin(ctx, canvas.width, canvas.height, skinPreset, surface);
            break;
        case 'circuit-bloom':
            drawCircuitBloomSkin(ctx, canvas.width, canvas.height, skinPreset, surface);
            break;
        case 'stealth-grid':
            drawStealthGridSkin(ctx, canvas.width, canvas.height, skinPreset, surface);
            break;
        case 'prism-veil':
            drawPrismVeilSkin(ctx, canvas.width, canvas.height, skinPreset, surface);
            break;
        case 'digital-camo':
            drawDigitalCamoSkin(ctx, canvas.width, canvas.height, skinPreset, surface);
            break;
        case 'carbon-weave':
            drawCarbonWeaveSkin(ctx, canvas.width, canvas.height, skinPreset, surface);
            break;
        case 'brushed-stream':
            drawBrushedStreamSkin(ctx, canvas.width, canvas.height, skinPreset, surface);
            break;
        case 'anodized-flow':
            drawAnodizedFlowSkin(ctx, canvas.width, canvas.height, skinPreset, surface);
            break;
        case 'hazard-strike':
            drawHazardStrikeSkin(ctx, canvas.width, canvas.height, skinPreset, surface);
            break;
        case 'twin-stripe':
        default:
            drawTwinStripeSkin(ctx, canvas.width, canvas.height, skinPreset, surface);
            break;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
}

function getUserWrapTextureSet(wrapUrl, bodyDimensions = DEFAULT_BODY_DIMENSIONS) {
    const safeWrapUrl = sanitizeUserWrapTextureUrl(wrapUrl);
    if (!safeWrapUrl) {
        return Promise.reject(new Error('Wrap URL is missing.'));
    }

    const layoutKey = [
        bodyDimensions.width.toFixed(3),
        bodyDimensions.height.toFixed(3),
        bodyDimensions.depth.toFixed(3),
    ].join('x');
    const cacheKey = `${safeWrapUrl}:${layoutKey}`;
    if (CAR_WRAP_TEXTURE_SET_CACHE.has(cacheKey)) {
        return CAR_WRAP_TEXTURE_SET_CACHE.get(cacheKey);
    }

    const textureSetPromise = loadUserWrapImage(safeWrapUrl).then((image) =>
        createUserWrapTextureSetFromImage(image, bodyDimensions)
    );

    CAR_WRAP_TEXTURE_SET_CACHE.set(cacheKey, textureSetPromise);
    return textureSetPromise.catch((error) => {
        CAR_WRAP_TEXTURE_SET_CACHE.delete(cacheKey);
        throw error;
    });
}

function createUserWrapTextureSetFromImage(image) {
    const sourceCanvas = renderUserWrapSourceCanvas(image);
    const baseColorHex = sampleAverageCanvasColor(sourceCanvas);

    return {
        baseColorHex,
        imageAspect: sourceCanvas.width / Math.max(1, sourceCanvas.height),
        projectedTexture: finalizeUserWrapTexture(sourceCanvas, 'projection'),
    };
}

function renderUserWrapSourceCanvas(image) {
    const canvas = document.createElement('canvas');
    const imageWidth = Math.max(1, image?.naturalWidth || image?.width || 1);
    const imageHeight = Math.max(1, image?.naturalHeight || image?.height || 1);
    const scale = Math.min(1, USER_WRAP_SOURCE_MAX_EDGE_PX / Math.max(imageWidth, imageHeight));
    canvas.width = Math.max(1, Math.round(imageWidth * scale));
    canvas.height = Math.max(1, Math.round(imageHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return canvas;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function finalizeUserWrapTexture(canvas, surface) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 8;
    texture.userData.isUserWrapTexture = true;
    texture.userData.isUserWrapBodyTexture = false;
    texture.userData.wrapSurface = surface;
    texture.needsUpdate = true;
    return texture;
}

function sampleAverageCanvasColor(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
        return 0x1f2937;
    }
    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height);
    const step = Math.max(4, Math.round(Math.sqrt((width * height) / 4096)));
    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    let totalWeight = 0;

    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            const index = (y * width + x) * 4;
            const alpha = imageData.data[index + 3] / 255;
            if (alpha <= 0) {
                continue;
            }
            totalR += imageData.data[index] * alpha;
            totalG += imageData.data[index + 1] * alpha;
            totalB += imageData.data[index + 2] * alpha;
            totalWeight += alpha;
        }
    }

    if (totalWeight <= 0) {
        return 0x1f2937;
    }
    const r = Math.max(0, Math.min(255, Math.round(totalR / totalWeight)));
    const g = Math.max(0, Math.min(255, Math.round(totalG / totalWeight)));
    const b = Math.max(0, Math.min(255, Math.round(totalB / totalWeight)));
    return (r << 16) | (g << 8) | b;
}

function drawImageFitRegion(
    ctx,
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    targetX,
    targetY,
    targetWidth,
    targetHeight,
    fitMode = 'cover'
) {
    const safeSourceWidth = Math.max(1, sourceWidth);
    const safeSourceHeight = Math.max(1, sourceHeight);
    const safeTargetWidth = Math.max(1, targetWidth);
    const safeTargetHeight = Math.max(1, targetHeight);
    if (fitMode === 'contain') {
        const drawScale = Math.min(
            safeTargetWidth / safeSourceWidth,
            safeTargetHeight / safeSourceHeight
        );
        const drawWidth = Math.max(1, safeSourceWidth * drawScale);
        const drawHeight = Math.max(1, safeSourceHeight * drawScale);
        const drawX = targetX + (safeTargetWidth - drawWidth) * 0.5;
        const drawY = targetY + (safeTargetHeight - drawHeight) * 0.5;
        ctx.drawImage(
            image,
            sourceX,
            sourceY,
            safeSourceWidth,
            safeSourceHeight,
            drawX,
            drawY,
            drawWidth,
            drawHeight
        );
        return;
    }

    const sourceAspectRatio = safeSourceWidth / safeSourceHeight;
    const targetAspectRatio = safeTargetWidth / safeTargetHeight;
    let cropWidth = safeSourceWidth;
    let cropHeight = safeSourceHeight;
    let cropX = sourceX;
    let cropY = sourceY;

    if (sourceAspectRatio > targetAspectRatio) {
        cropWidth = safeSourceHeight * targetAspectRatio;
        cropX = sourceX + (safeSourceWidth - cropWidth) * 0.5;
    } else {
        cropHeight = safeSourceWidth / targetAspectRatio;
        cropY = sourceY + (safeSourceHeight - cropHeight) * 0.5;
    }

    ctx.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        targetX,
        targetY,
        safeTargetWidth,
        safeTargetHeight
    );
}

function loadUserWrapImage(url) {
    const safeUrl = sanitizeUserWrapTextureUrl(url);
    if (!safeUrl) {
        return Promise.reject(new Error('Wrap URL is invalid.'));
    }
    if (CAR_WRAP_IMAGE_PROMISE_CACHE.has(safeUrl)) {
        return CAR_WRAP_IMAGE_PROMISE_CACHE.get(safeUrl);
    }

    const imagePromise = new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            resolve(image);
        };
        image.onerror = () => {
            reject(new Error('Could not load car wrap image.'));
        };
        image.src = safeUrl;
    });

    CAR_WRAP_IMAGE_PROMISE_CACHE.set(safeUrl, imagePromise);
    return imagePromise.catch((error) => {
        CAR_WRAP_IMAGE_PROMISE_CACHE.delete(safeUrl);
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
            parsed.protocol !== 'https:' &&
            parsed.protocol !== 'http:' &&
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

function drawSkinMaterialBase(ctx, width, height, skinPreset, surface) {
    const materialKey =
        skinPreset && typeof skinPreset.material === 'string'
            ? skinPreset.material
            : DEFAULT_SKIN_MATERIAL;
    ctx.save();

    if (materialKey === 'forged-carbon') {
        const baseGradient = ctx.createLinearGradient(0, 0, width, height);
        baseGradient.addColorStop(0, rgbaFromHex(skinPreset.accentColorSecondary, 0.88));
        baseGradient.addColorStop(0.45, rgbaFromHex(skinPreset.bodyColor, 0.92));
        baseGradient.addColorStop(1, rgbaFromHex(0x05070b, 0.96));
        ctx.fillStyle = baseGradient;
        ctx.fillRect(0, 0, width, height);

        const tile = surface === 'top' ? 54 : 36;
        for (let y = -tile; y <= height + tile; y += tile) {
            for (let x = -tile; x <= width + tile; x += tile) {
                const alpha = ((x + y) / tile) % 2 === 0 ? 0.16 : 0.08;
                fillSkinPolygon(
                    ctx,
                    [
                        [x, y + tile * 0.18],
                        [x + tile * 0.62, y],
                        [x + tile, y + tile * 0.32],
                        [x + tile * 0.38, y + tile * 0.5],
                    ],
                    rgbaFromHex(skinPreset.stripeColor, alpha)
                );
                fillSkinPolygon(
                    ctx,
                    [
                        [x + tile * 0.16, y + tile * 0.54],
                        [x + tile * 0.78, y + tile * 0.34],
                        [x + tile * 1.06, y + tile * 0.84],
                        [x + tile * 0.42, y + tile],
                    ],
                    rgbaFromHex(skinPreset.accentColor, alpha * 0.78)
                );
            }
        }
        ctx.restore();
        return;
    }

    if (materialKey === 'brushed-metal') {
        const baseGradient = ctx.createLinearGradient(0, 0, width, height);
        baseGradient.addColorStop(0, rgbaFromHex(skinPreset.stripeColor, 0.88));
        baseGradient.addColorStop(0.28, rgbaFromHex(skinPreset.bodyColor, 0.94));
        baseGradient.addColorStop(0.72, rgbaFromHex(skinPreset.accentColorSecondary, 0.8));
        baseGradient.addColorStop(1, rgbaFromHex(skinPreset.bodyColor, 0.92));
        ctx.fillStyle = baseGradient;
        ctx.fillRect(0, 0, width, height);

        const brushRandom = createSeededRandom(hashString(`${skinPreset.id}:${surface}:brush`));
        const streakCount = surface === 'top' ? 180 : 110;
        for (let i = 0; i < streakCount; i += 1) {
            const y = brushRandom() * height;
            const lineAlpha = 0.028 + brushRandom() * 0.042;
            const lineWidth = 1 + brushRandom() * 2.4;
            ctx.fillStyle = rgbaFromHex(
                brushRandom() > 0.42 ? skinPreset.stripeColor : skinPreset.accentColor,
                lineAlpha
            );
            ctx.fillRect(-width * 0.08, y, width * 1.16, lineWidth);
        }
        ctx.restore();
        return;
    }

    if (materialKey === 'anodized-iridescent') {
        const baseGradient = ctx.createLinearGradient(0, 0, width, height);
        baseGradient.addColorStop(0, rgbaFromHex(0x2b1344, 0.94));
        baseGradient.addColorStop(0.22, rgbaFromHex(skinPreset.bodyColor, 0.88));
        baseGradient.addColorStop(0.46, rgbaFromHex(0x1bc7e8, 0.42));
        baseGradient.addColorStop(0.7, rgbaFromHex(0xff8ad7, 0.38));
        baseGradient.addColorStop(1, rgbaFromHex(0xf5bf63, 0.34));
        ctx.fillStyle = baseGradient;
        ctx.fillRect(0, 0, width, height);

        const bloomGradient = ctx.createRadialGradient(
            width * 0.26,
            height * 0.24,
            0,
            width * 0.26,
            height * 0.24,
            width * 0.7
        );
        bloomGradient.addColorStop(0, rgbaFromHex(0xffffff, 0.2));
        bloomGradient.addColorStop(0.36, rgbaFromHex(skinPreset.glowColor, 0.14));
        bloomGradient.addColorStop(1, rgbaFromHex(skinPreset.accentColorSecondary, 0));
        ctx.fillStyle = bloomGradient;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
        return;
    }

    if (materialKey === 'matte-camo') {
        const baseGradient = ctx.createLinearGradient(0, 0, width, height);
        baseGradient.addColorStop(0, rgbaFromHex(skinPreset.bodyColor, 0.9));
        baseGradient.addColorStop(0.54, rgbaFromHex(skinPreset.accentColorSecondary, 0.82));
        baseGradient.addColorStop(1, rgbaFromHex(skinPreset.bodyColor, 0.94));
        ctx.fillStyle = baseGradient;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
        return;
    }

    if (materialKey === 'industrial-coat') {
        const baseGradient = ctx.createLinearGradient(0, 0, width, height);
        baseGradient.addColorStop(0, rgbaFromHex(skinPreset.bodyColor, 0.9));
        baseGradient.addColorStop(0.54, rgbaFromHex(skinPreset.accentColorSecondary, 0.88));
        baseGradient.addColorStop(1, rgbaFromHex(skinPreset.bodyColor, 0.94));
        ctx.fillStyle = baseGradient;
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = rgbaFromHex(skinPreset.stripeColor, 0.08);
        ctx.lineWidth = 2;
        for (let x = width * 0.12; x < width; x += width * 0.14) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x - width * 0.06, height);
            ctx.stroke();
        }
        ctx.restore();
        return;
    }

    const defaultGradient = ctx.createLinearGradient(0, 0, width, height);
    defaultGradient.addColorStop(0, rgbaFromHex(skinPreset.bodyColor, 0.9));
    defaultGradient.addColorStop(0.5, rgbaFromHex(skinPreset.accentColorSecondary, 0.52));
    defaultGradient.addColorStop(1, rgbaFromHex(skinPreset.bodyColor, 0.94));
    ctx.fillStyle = defaultGradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
}

function drawBodyTextureOverlay(ctx, width, height, skinPreset) {
    switch (skinPreset.pattern) {
        case 'digital-camo':
            drawBodyDigitalCamoOverlay(ctx, width, height, skinPreset);
            break;
        case 'carbon-weave':
            drawBodyCarbonWeaveOverlay(ctx, width, height, skinPreset);
            break;
        case 'brushed-stream':
            drawBodyBrushedMetalOverlay(ctx, width, height, skinPreset);
            break;
        case 'anodized-flow':
            drawBodyAnodizedOverlay(ctx, width, height, skinPreset);
            break;
        case 'hazard-strike':
            drawBodyHazardOverlay(ctx, width, height, skinPreset);
            break;
        case 'circuit-bloom':
            drawBodyCircuitOverlay(ctx, width, height, skinPreset);
            break;
        case 'stealth-grid':
            drawBodyStealthOverlay(ctx, width, height, skinPreset);
            break;
        case 'prism-veil':
            drawBodyPrismOverlay(ctx, width, height, skinPreset);
            break;
        case 'solar-sweep':
            drawBodySolarOverlay(ctx, width, height, skinPreset);
            break;
        case 'chevron-burst':
            drawBodyChevronOverlay(ctx, width, height, skinPreset);
            break;
        case 'twin-stripe':
        default:
            drawBodyStripeOverlay(ctx, width, height, skinPreset);
            break;
    }
}

function drawUniversalSkinHighlights(ctx, width, height, skinPreset, surface) {
    ctx.save();
    const sweepGradient = ctx.createLinearGradient(0, 0, width, height);
    sweepGradient.addColorStop(0, rgbaFromHex(skinPreset.accentColorSecondary, 0.06));
    sweepGradient.addColorStop(0.48, 'rgba(255,255,255,0)');
    sweepGradient.addColorStop(
        1,
        rgbaFromHex(skinPreset.accentColor, surface === 'top' ? 0.1 : 0.06)
    );
    ctx.fillStyle = sweepGradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = rgbaFromHex(skinPreset.stripeColor, 0.08);
    ctx.lineWidth = surface === 'top' ? 4 : 3;
    for (let i = 0; i < 4; i += 1) {
        const offset = (i + 1) * (surface === 'top' ? height * 0.14 : width * 0.18);
        ctx.beginPath();
        if (surface === 'top') {
            ctx.moveTo(width * 0.08, offset);
            ctx.lineTo(width * 0.92, offset - height * 0.05);
        } else {
            ctx.moveTo(offset, height * 0.12);
            ctx.lineTo(offset - width * 0.08, height * 0.88);
        }
        ctx.stroke();
    }
    ctx.restore();
}

function drawTwinStripeSkin(ctx, width, height, skinPreset, surface) {
    if (surface === 'top') {
        fillSkinRoundedRect(
            ctx,
            width * 0.3,
            height * 0.08,
            width * 0.12,
            height * 0.82,
            width * 0.06,
            rgbaFromHex(skinPreset.stripeColor, 0.92)
        );
        fillSkinRoundedRect(
            ctx,
            width * 0.58,
            height * 0.08,
            width * 0.12,
            height * 0.82,
            width * 0.06,
            rgbaFromHex(skinPreset.stripeColor, 0.92)
        );
        fillSkinRoundedRect(
            ctx,
            width * 0.465,
            height * 0.12,
            width * 0.07,
            height * 0.74,
            width * 0.035,
            rgbaFromHex(skinPreset.accentColor, 0.78)
        );
        fillSkinTriangle(
            ctx,
            [
                [width * 0.42, height * 0.12],
                [width * 0.58, height * 0.12],
                [width * 0.5, height * 0.02],
            ],
            rgbaFromHex(skinPreset.accentColor, 0.9)
        );
        return;
    }
    if (surface === 'side') {
        fillSkinPolygon(
            ctx,
            [
                [width * 0.08, height * 0.7],
                [width * 0.36, height * 0.34],
                [width * 0.82, height * 0.34],
                [width * 0.92, height * 0.46],
                [width * 0.42, height * 0.58],
                [width * 0.16, height * 0.82],
            ],
            rgbaFromHex(skinPreset.stripeColor, 0.9)
        );
        fillSkinRoundedRect(
            ctx,
            width * 0.18,
            height * 0.54,
            width * 0.52,
            height * 0.08,
            height * 0.04,
            rgbaFromHex(skinPreset.accentColor, 0.72)
        );
        return;
    }
    if (surface === 'front') {
        fillSkinTriangle(
            ctx,
            [
                [width * 0.28, height * 0.86],
                [width * 0.5, height * 0.16],
                [width * 0.72, height * 0.86],
            ],
            rgbaFromHex(skinPreset.accentColor, 0.9)
        );
        fillSkinRoundedRect(
            ctx,
            width * 0.12,
            height * 0.68,
            width * 0.76,
            height * 0.08,
            height * 0.04,
            rgbaFromHex(skinPreset.stripeColor, 0.78)
        );
        return;
    }
    fillSkinRoundedRect(
        ctx,
        width * 0.14,
        height * 0.26,
        width * 0.2,
        height * 0.48,
        height * 0.18,
        rgbaFromHex(skinPreset.stripeColor, 0.84)
    );
    fillSkinRoundedRect(
        ctx,
        width * 0.66,
        height * 0.26,
        width * 0.2,
        height * 0.48,
        height * 0.18,
        rgbaFromHex(skinPreset.stripeColor, 0.84)
    );
    fillSkinRoundedRect(
        ctx,
        width * 0.4,
        height * 0.38,
        width * 0.2,
        height * 0.24,
        height * 0.12,
        rgbaFromHex(skinPreset.accentColor, 0.72)
    );
}

function drawChevronBurstSkin(ctx, width, height, skinPreset, surface) {
    if (surface === 'top') {
        fillSkinPolygon(
            ctx,
            [
                [width * 0.18, height * 0.88],
                [width * 0.42, height * 0.14],
                [width * 0.5, height * 0.24],
                [width * 0.58, height * 0.14],
                [width * 0.82, height * 0.88],
                [width * 0.66, height * 0.88],
                [width * 0.5, height * 0.38],
                [width * 0.34, height * 0.88],
            ],
            rgbaFromHex(skinPreset.stripeColor, 0.9)
        );
        fillSkinTriangle(
            ctx,
            [
                [width * 0.44, height * 0.02],
                [width * 0.56, height * 0.02],
                [width * 0.5, height * 0.18],
            ],
            rgbaFromHex(skinPreset.accentColor, 0.92)
        );
        return;
    }
    if (surface === 'side') {
        fillSkinPolygon(
            ctx,
            [
                [width * 0.14, height * 0.74],
                [width * 0.42, height * 0.22],
                [width * 0.68, height * 0.3],
                [width * 0.88, height * 0.22],
                [width * 0.56, height * 0.82],
                [width * 0.32, height * 0.82],
            ],
            rgbaFromHex(skinPreset.accentColor, 0.88)
        );
        fillSkinRoundedRect(
            ctx,
            width * 0.18,
            height * 0.58,
            width * 0.56,
            height * 0.08,
            height * 0.04,
            rgbaFromHex(skinPreset.stripeColor, 0.82)
        );
        return;
    }
    fillSkinTriangle(
        ctx,
        [
            [width * 0.16, height * 0.78],
            [width * 0.5, height * 0.12],
            [width * 0.84, height * 0.78],
        ],
        rgbaFromHex(skinPreset.stripeColor, 0.88)
    );
    fillSkinTriangle(
        ctx,
        [
            [width * 0.32, height * 0.82],
            [width * 0.5, height * 0.28],
            [width * 0.68, height * 0.82],
        ],
        rgbaFromHex(skinPreset.accentColor, 0.76)
    );
}

function drawSolarSweepSkin(ctx, width, height, skinPreset, surface) {
    const bandGradient = ctx.createLinearGradient(0, height * 0.2, width, height * 0.8);
    bandGradient.addColorStop(0, rgbaFromHex(skinPreset.stripeColor, 0.86));
    bandGradient.addColorStop(0.42, rgbaFromHex(skinPreset.accentColor, 0.9));
    bandGradient.addColorStop(1, rgbaFromHex(skinPreset.glowColor, 0.12));
    ctx.fillStyle = bandGradient;
    if (surface === 'top') {
        ctx.beginPath();
        ctx.moveTo(width * 0.12, height * 0.76);
        ctx.bezierCurveTo(
            width * 0.26,
            height * 0.38,
            width * 0.5,
            height * 0.22,
            width * 0.84,
            height * 0.06
        );
        ctx.lineTo(width * 0.9, height * 0.2);
        ctx.bezierCurveTo(
            width * 0.6,
            height * 0.36,
            width * 0.36,
            height * 0.52,
            width * 0.2,
            height * 0.88
        );
        ctx.closePath();
        ctx.fill();
        fillSkinRoundedRect(
            ctx,
            width * 0.18,
            height * 0.8,
            width * 0.64,
            height * 0.06,
            height * 0.03,
            rgbaFromHex(skinPreset.stripeColor, 0.72)
        );
        return;
    }
    if (surface === 'side') {
        ctx.beginPath();
        ctx.moveTo(width * 0.06, height * 0.74);
        ctx.quadraticCurveTo(width * 0.42, height * 0.18, width * 0.94, height * 0.32);
        ctx.lineTo(width * 0.88, height * 0.52);
        ctx.quadraticCurveTo(width * 0.48, height * 0.42, width * 0.18, height * 0.86);
        ctx.closePath();
        ctx.fill();
        return;
    }
    fillSkinRoundedRect(
        ctx,
        width * 0.14,
        height * 0.52,
        width * 0.72,
        height * 0.1,
        height * 0.05,
        rgbaFromHex(skinPreset.stripeColor, 0.78)
    );
    fillSkinTriangle(
        ctx,
        [
            [width * 0.42, height * 0.18],
            [width * 0.58, height * 0.18],
            [width * 0.5, height * 0.04],
        ],
        rgbaFromHex(skinPreset.accentColor, 0.9)
    );
}

function drawCircuitBloomSkin(ctx, width, height, skinPreset, surface) {
    ctx.strokeStyle = rgbaFromHex(skinPreset.stripeColor, 0.86);
    ctx.fillStyle = rgbaFromHex(skinPreset.accentColor, 0.82);
    ctx.lineWidth = surface === 'top' ? 18 : 14;
    ctx.lineCap = 'round';
    const segments =
        surface === 'top'
            ? [
                  [width * 0.5, height * 0.08, width * 0.5, height * 0.92],
                  [width * 0.5, height * 0.24, width * 0.26, height * 0.24],
                  [width * 0.5, height * 0.48, width * 0.74, height * 0.48],
                  [width * 0.5, height * 0.72, width * 0.32, height * 0.72],
              ]
            : [
                  [width * 0.12, height * 0.68, width * 0.86, height * 0.68],
                  [width * 0.36, height * 0.68, width * 0.36, height * 0.26],
                  [width * 0.62, height * 0.68, width * 0.62, height * 0.4],
              ];
    for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        ctx.beginPath();
        ctx.moveTo(segment[0], segment[1]);
        ctx.lineTo(segment[2], segment[3]);
        ctx.stroke();
    }
    const nodes =
        surface === 'top'
            ? [
                  [width * 0.5, height * 0.08],
                  [width * 0.26, height * 0.24],
                  [width * 0.74, height * 0.48],
                  [width * 0.32, height * 0.72],
                  [width * 0.5, height * 0.92],
              ]
            : [
                  [width * 0.12, height * 0.68],
                  [width * 0.36, height * 0.26],
                  [width * 0.62, height * 0.4],
                  [width * 0.86, height * 0.68],
              ];
    for (let i = 0; i < nodes.length; i += 1) {
        fillSkinCircle(
            ctx,
            nodes[i][0],
            nodes[i][1],
            surface === 'top' ? 22 : 18,
            rgbaFromHex(skinPreset.accentColor, 0.88)
        );
    }
}

function drawStealthGridSkin(ctx, width, height, skinPreset, surface) {
    ctx.fillStyle = rgbaFromHex(skinPreset.stripeColor, 0.18);
    const cellWidth = surface === 'top' ? width * 0.16 : width * 0.14;
    const cellHeight = surface === 'top' ? height * 0.12 : height * 0.18;
    for (let y = 0.08; y <= 0.78; y += 0.16) {
        for (let x = 0.08; x <= 0.74; x += 0.18) {
            fillSkinRoundedRect(
                ctx,
                width * x,
                height * y,
                cellWidth,
                cellHeight,
                Math.min(cellWidth, cellHeight) * 0.18,
                rgbaFromHex(skinPreset.stripeColor, x > 0.42 ? 0.18 : 0.1)
            );
        }
    }
    fillSkinPolygon(
        ctx,
        [
            [width * 0.08, height * 0.82],
            [width * 0.42, height * 0.18],
            [width * 0.78, height * 0.18],
            [width * 0.5, height * 0.82],
        ],
        rgbaFromHex(skinPreset.accentColor, 0.7)
    );
}

function drawPrismVeilSkin(ctx, width, height, skinPreset, surface) {
    const prismGradient = ctx.createLinearGradient(0, 0, width, height);
    prismGradient.addColorStop(0, rgbaFromHex(skinPreset.accentColor, 0.86));
    prismGradient.addColorStop(0.44, rgbaFromHex(skinPreset.stripeColor, 0.94));
    prismGradient.addColorStop(1, rgbaFromHex(skinPreset.glowColor, 0.86));
    ctx.fillStyle = prismGradient;
    if (surface === 'top') {
        fillSkinPolygon(
            ctx,
            [
                [width * 0.14, height * 0.9],
                [width * 0.34, height * 0.14],
                [width * 0.62, height * 0.06],
                [width * 0.88, height * 0.78],
                [width * 0.66, height * 0.94],
                [width * 0.4, height * 0.82],
            ],
            prismGradient
        );
        fillSkinTriangle(
            ctx,
            [
                [width * 0.62, height * 0.12],
                [width * 0.82, height * 0.32],
                [width * 0.72, height * 0.52],
            ],
            rgbaFromHex(0xffa8df, 0.76)
        );
        return;
    }
    fillSkinPolygon(
        ctx,
        [
            [width * 0.08, height * 0.76],
            [width * 0.32, height * 0.22],
            [width * 0.56, height * 0.38],
            [width * 0.84, height * 0.14],
            [width * 0.94, height * 0.34],
            [width * 0.42, height * 0.88],
        ],
        prismGradient
    );
    fillSkinRoundedRect(
        ctx,
        width * 0.18,
        height * 0.62,
        width * 0.52,
        height * 0.08,
        height * 0.04,
        rgbaFromHex(0xffa8df, 0.56)
    );
}

function drawDigitalCamoSkin(ctx, width, height, skinPreset, surface) {
    const random = createSeededRandom(hashString(`${skinPreset.id}:${surface}:camo`));
    const patchCount = surface === 'top' ? 34 : 24;
    const palette = [
        rgbaFromHex(skinPreset.bodyColor, 0.38),
        rgbaFromHex(skinPreset.accentColorSecondary, 0.72),
        rgbaFromHex(skinPreset.accentColor, 0.34),
        rgbaFromHex(skinPreset.stripeColor, 0.28),
    ];
    for (let i = 0; i < patchCount; i += 1) {
        const centerX = random() * width;
        const centerY = random() * height;
        const radiusX = width * (0.08 + random() * 0.18);
        const radiusY = height * (0.08 + random() * 0.18);
        const points = [];
        const corners = 5 + Math.floor(random() * 4);
        for (let step = 0; step < corners; step += 1) {
            const angle = (step / corners) * Math.PI * 2;
            const scale = 0.72 + random() * 0.52;
            points.push([
                centerX + Math.cos(angle) * radiusX * scale,
                centerY + Math.sin(angle) * radiusY * scale,
            ]);
        }
        fillSkinPolygon(ctx, points, palette[i % palette.length]);
    }
    fillSkinRoundedRect(
        ctx,
        width * 0.12,
        height * 0.66,
        width * 0.76,
        height * 0.09,
        height * 0.045,
        rgbaFromHex(skinPreset.stripeColor, 0.48)
    );
}

function drawCarbonWeaveSkin(ctx, width, height, skinPreset, surface) {
    const bandWidth = surface === 'top' ? width * 0.12 : width * 0.14;
    for (let offset = -height; offset < width + height; offset += bandWidth * 0.72) {
        fillSkinPolygon(
            ctx,
            [
                [offset, 0],
                [offset + bandWidth, 0],
                [offset + bandWidth - height * 0.12, height],
                [offset - height * 0.12, height],
            ],
            rgbaFromHex(skinPreset.stripeColor, 0.06)
        );
        fillSkinPolygon(
            ctx,
            [
                [offset - bandWidth * 0.3, 0],
                [offset + bandWidth * 0.24, 0],
                [offset + bandWidth * 0.54 - height * 0.12, height],
                [offset - bandWidth * 0.04 - height * 0.12, height],
            ],
            rgbaFromHex(skinPreset.accentColor, 0.05)
        );
    }
    fillSkinRoundedRect(
        ctx,
        width * 0.18,
        height * 0.18,
        width * 0.64,
        height * 0.08,
        height * 0.04,
        rgbaFromHex(skinPreset.glowColor, 0.18)
    );
    fillSkinRoundedRect(
        ctx,
        width * 0.14,
        height * 0.72,
        width * 0.72,
        height * 0.06,
        height * 0.03,
        rgbaFromHex(skinPreset.stripeColor, 0.24)
    );
}

function drawBrushedStreamSkin(ctx, width, height, skinPreset, surface) {
    const ribbonGradient = ctx.createLinearGradient(width * 0.12, 0, width * 0.86, height);
    ribbonGradient.addColorStop(0, rgbaFromHex(skinPreset.stripeColor, 0.9));
    ribbonGradient.addColorStop(0.4, rgbaFromHex(0xffffff, 0.88));
    ribbonGradient.addColorStop(0.7, rgbaFromHex(skinPreset.accentColor, 0.7));
    ribbonGradient.addColorStop(1, rgbaFromHex(skinPreset.glowColor, 0.16));
    fillSkinPolygon(
        ctx,
        [
            [width * 0.08, height * 0.84],
            [width * 0.26, height * 0.18],
            [width * 0.62, height * 0.08],
            [width * 0.9, height * 0.34],
            [width * 0.62, height * 0.72],
            [width * 0.24, height * 0.88],
        ],
        ribbonGradient
    );
    fillSkinRoundedRect(
        ctx,
        width * 0.16,
        height * 0.52,
        width * 0.68,
        height * 0.06,
        height * 0.03,
        rgbaFromHex(skinPreset.accentColorSecondary, 0.36)
    );
}

function drawAnodizedFlowSkin(ctx, width, height, skinPreset, surface) {
    const ribbonA = ctx.createLinearGradient(0, height * 0.2, width, height * 0.7);
    ribbonA.addColorStop(0, rgbaFromHex(0x7c5cff, 0.7));
    ribbonA.addColorStop(0.32, rgbaFromHex(0x67f6ff, 0.76));
    ribbonA.addColorStop(0.7, rgbaFromHex(0xff8bd7, 0.7));
    ribbonA.addColorStop(1, rgbaFromHex(0xffcb69, 0.5));
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.beginPath();
    ctx.moveTo(width * 0.1, height * 0.88);
    ctx.bezierCurveTo(
        width * 0.24,
        height * 0.34,
        width * 0.54,
        height * 0.12,
        width * 0.9,
        height * 0.3
    );
    ctx.lineTo(width * 0.9, height * 0.46);
    ctx.bezierCurveTo(
        width * 0.58,
        height * 0.28,
        width * 0.3,
        height * 0.44,
        width * 0.16,
        height * 0.92
    );
    ctx.closePath();
    ctx.fillStyle = ribbonA;
    ctx.fill();

    fillSkinCircle(
        ctx,
        width * 0.72,
        height * 0.24,
        Math.min(width, height) * 0.12,
        rgbaFromHex(0xffffff, 0.14)
    );
    fillSkinCircle(
        ctx,
        width * 0.28,
        height * 0.68,
        Math.min(width, height) * 0.1,
        rgbaFromHex(skinPreset.glowColor, 0.12)
    );
    ctx.restore();
}

function drawHazardStrikeSkin(ctx, width, height, skinPreset, surface) {
    const stripeWidth = surface === 'top' ? width * 0.16 : width * 0.12;
    for (let offset = -height; offset < width + height; offset += stripeWidth * 1.35) {
        fillSkinPolygon(
            ctx,
            [
                [offset, 0],
                [offset + stripeWidth, 0],
                [offset + stripeWidth - height * 0.18, height],
                [offset - height * 0.18, height],
            ],
            rgbaFromHex(skinPreset.stripeColor, 0.86)
        );
    }

    fillSkinRoundedRect(
        ctx,
        width * 0.08,
        height * 0.68,
        width * 0.84,
        height * 0.12,
        height * 0.04,
        rgbaFromHex(skinPreset.accentColor, 0.74)
    );
    fillSkinTriangle(
        ctx,
        [
            [width * 0.42, height * 0.16],
            [width * 0.58, height * 0.16],
            [width * 0.5, height * 0.02],
        ],
        rgbaFromHex(skinPreset.accentColor, 0.88)
    );
}

function drawBodyStripeOverlay(ctx, width, height, skinPreset) {
    fillSkinRoundedRect(
        ctx,
        width * 0.28,
        0,
        width * 0.08,
        height,
        width * 0.02,
        rgbaFromHex(skinPreset.stripeColor, 0.42)
    );
    fillSkinRoundedRect(
        ctx,
        width * 0.64,
        0,
        width * 0.08,
        height,
        width * 0.02,
        rgbaFromHex(skinPreset.stripeColor, 0.42)
    );
    fillSkinRoundedRect(
        ctx,
        width * 0.46,
        0,
        width * 0.035,
        height,
        width * 0.012,
        rgbaFromHex(skinPreset.accentColor, 0.28)
    );
}

function drawBodyChevronOverlay(ctx, width, height, skinPreset) {
    const stripeWidth = width * 0.14;
    for (let offset = -height; offset < width + height; offset += stripeWidth * 1.4) {
        fillSkinPolygon(
            ctx,
            [
                [offset, 0],
                [offset + stripeWidth, 0],
                [offset + stripeWidth - height * 0.24, height],
                [offset - height * 0.24, height],
            ],
            rgbaFromHex(skinPreset.stripeColor, 0.2)
        );
    }
    fillSkinPolygon(
        ctx,
        [
            [width * 0.16, height * 0.88],
            [width * 0.4, height * 0.12],
            [width * 0.5, height * 0.26],
            [width * 0.6, height * 0.12],
            [width * 0.84, height * 0.88],
            [width * 0.7, height * 0.88],
            [width * 0.5, height * 0.42],
            [width * 0.3, height * 0.88],
        ],
        rgbaFromHex(skinPreset.accentColor, 0.36)
    );
}

function drawBodySolarOverlay(ctx, width, height, skinPreset) {
    const ribbonGradient = ctx.createLinearGradient(0, height * 0.18, width, height * 0.74);
    ribbonGradient.addColorStop(0, rgbaFromHex(skinPreset.stripeColor, 0.3));
    ribbonGradient.addColorStop(0.45, rgbaFromHex(skinPreset.accentColor, 0.46));
    ribbonGradient.addColorStop(1, rgbaFromHex(skinPreset.glowColor, 0.12));
    fillSkinPolygon(
        ctx,
        [
            [width * 0.06, height * 0.9],
            [width * 0.22, height * 0.4],
            [width * 0.48, height * 0.18],
            [width * 0.86, height * 0.02],
            [width * 0.92, height * 0.16],
            [width * 0.58, height * 0.36],
            [width * 0.34, height * 0.6],
            [width * 0.16, height * 0.96],
        ],
        ribbonGradient
    );
}

function drawBodyCircuitOverlay(ctx, width, height, skinPreset) {
    ctx.save();
    ctx.strokeStyle = rgbaFromHex(skinPreset.stripeColor, 0.26);
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    const segments = [
        [width * 0.2, height * 0.18, width * 0.2, height * 0.78],
        [width * 0.2, height * 0.32, width * 0.54, height * 0.32],
        [width * 0.54, height * 0.32, width * 0.54, height * 0.6],
        [width * 0.54, height * 0.6, width * 0.82, height * 0.6],
    ];
    for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        ctx.beginPath();
        ctx.moveTo(segment[0], segment[1]);
        ctx.lineTo(segment[2], segment[3]);
        ctx.stroke();
    }
    ctx.restore();
    fillSkinCircle(
        ctx,
        width * 0.2,
        height * 0.18,
        width * 0.026,
        rgbaFromHex(skinPreset.accentColor, 0.4)
    );
    fillSkinCircle(
        ctx,
        width * 0.54,
        height * 0.32,
        width * 0.022,
        rgbaFromHex(skinPreset.accentColor, 0.38)
    );
    fillSkinCircle(
        ctx,
        width * 0.82,
        height * 0.6,
        width * 0.028,
        rgbaFromHex(skinPreset.glowColor, 0.36)
    );
}

function drawBodyStealthOverlay(ctx, width, height, skinPreset) {
    const cellWidth = width * 0.12;
    const cellHeight = height * 0.16;
    for (let y = 0.08; y <= 0.82; y += 0.18) {
        for (let x = 0.06; x <= 0.82; x += 0.14) {
            fillSkinRoundedRect(
                ctx,
                width * x,
                height * y,
                cellWidth,
                cellHeight,
                Math.min(cellWidth, cellHeight) * 0.14,
                rgbaFromHex(skinPreset.stripeColor, x > 0.46 ? 0.08 : 0.14)
            );
        }
    }
    fillSkinPolygon(
        ctx,
        [
            [width * 0.12, height * 0.82],
            [width * 0.42, height * 0.18],
            [width * 0.78, height * 0.18],
            [width * 0.56, height * 0.82],
        ],
        rgbaFromHex(skinPreset.accentColor, 0.24)
    );
}

function drawBodyPrismOverlay(ctx, width, height, skinPreset) {
    const prismGradient = ctx.createLinearGradient(0, 0, width, height);
    prismGradient.addColorStop(0, rgbaFromHex(skinPreset.accentColor, 0.3));
    prismGradient.addColorStop(0.45, rgbaFromHex(skinPreset.stripeColor, 0.24));
    prismGradient.addColorStop(1, rgbaFromHex(skinPreset.glowColor, 0.28));
    fillSkinPolygon(
        ctx,
        [
            [width * 0.08, height * 0.88],
            [width * 0.3, height * 0.14],
            [width * 0.58, height * 0.08],
            [width * 0.9, height * 0.76],
            [width * 0.7, height * 0.94],
            [width * 0.38, height * 0.82],
        ],
        prismGradient
    );
    fillSkinTriangle(
        ctx,
        [
            [width * 0.62, height * 0.16],
            [width * 0.82, height * 0.3],
            [width * 0.72, height * 0.54],
        ],
        rgbaFromHex(0xffa8df, 0.26)
    );
}

function drawBodyDigitalCamoOverlay(ctx, width, height, skinPreset) {
    const random = createSeededRandom(hashString(`${skinPreset.id}:body:camo`));
    const patchCount = 40;
    const palette = [
        rgbaFromHex(skinPreset.bodyColor, 0.28),
        rgbaFromHex(skinPreset.accentColorSecondary, 0.56),
        rgbaFromHex(skinPreset.accentColor, 0.22),
        rgbaFromHex(skinPreset.stripeColor, 0.18),
    ];
    for (let i = 0; i < patchCount; i += 1) {
        const centerX = random() * width;
        const centerY = random() * height;
        const sizeX = width * (0.06 + random() * 0.12);
        const sizeY = height * (0.06 + random() * 0.18);
        fillSkinPolygon(
            ctx,
            [
                [centerX - sizeX * 0.6, centerY - sizeY * 0.4],
                [centerX + sizeX * 0.2, centerY - sizeY * 0.72],
                [centerX + sizeX * 0.74, centerY - sizeY * 0.1],
                [centerX + sizeX * 0.4, centerY + sizeY * 0.46],
                [centerX - sizeX * 0.4, centerY + sizeY * 0.7],
                [centerX - sizeX * 0.76, centerY + sizeY * 0.1],
            ],
            palette[i % palette.length]
        );
    }
}

function drawBodyCarbonWeaveOverlay(ctx, width, height, skinPreset) {
    const bandWidth = width * 0.08;
    for (let offset = -height; offset < width + height; offset += bandWidth * 0.68) {
        fillSkinPolygon(
            ctx,
            [
                [offset, 0],
                [offset + bandWidth, 0],
                [offset + bandWidth - height * 0.16, height],
                [offset - height * 0.16, height],
            ],
            rgbaFromHex(skinPreset.stripeColor, 0.05)
        );
        fillSkinPolygon(
            ctx,
            [
                [offset - bandWidth * 0.42, 0],
                [offset + bandWidth * 0.2, 0],
                [offset + bandWidth * 0.54 - height * 0.16, height],
                [offset - bandWidth * 0.08 - height * 0.16, height],
            ],
            rgbaFromHex(skinPreset.accentColor, 0.04)
        );
    }
    fillSkinRoundedRect(
        ctx,
        width * 0.18,
        height * 0.14,
        width * 0.64,
        height * 0.04,
        height * 0.02,
        rgbaFromHex(skinPreset.glowColor, 0.14)
    );
}

function drawBodyBrushedMetalOverlay(ctx, width, height, skinPreset) {
    const random = createSeededRandom(hashString(`${skinPreset.id}:body:brush`));
    for (let i = 0; i < 220; i += 1) {
        const y = random() * height;
        const lineAlpha = 0.018 + random() * 0.028;
        const lineWidth = 1 + random() * 2.2;
        ctx.fillStyle = rgbaFromHex(
            random() > 0.54 ? skinPreset.stripeColor : skinPreset.accentColor,
            lineAlpha
        );
        ctx.fillRect(-width * 0.04, y, width * 1.08, lineWidth);
    }
    fillSkinPolygon(
        ctx,
        [
            [width * 0.12, height * 0.86],
            [width * 0.28, height * 0.22],
            [width * 0.72, height * 0.1],
            [width * 0.9, height * 0.4],
            [width * 0.58, height * 0.76],
            [width * 0.2, height * 0.9],
        ],
        rgbaFromHex(0xffffff, 0.12)
    );
}

function drawBodyAnodizedOverlay(ctx, width, height, skinPreset) {
    const ribbonA = ctx.createLinearGradient(0, height * 0.16, width, height * 0.74);
    ribbonA.addColorStop(0, rgbaFromHex(0x7a5eff, 0.28));
    ribbonA.addColorStop(0.34, rgbaFromHex(0x67f6ff, 0.34));
    ribbonA.addColorStop(0.7, rgbaFromHex(0xff8bd7, 0.28));
    ribbonA.addColorStop(1, rgbaFromHex(0xffcb69, 0.22));
    fillSkinPolygon(
        ctx,
        [
            [width * 0.08, height * 0.9],
            [width * 0.24, height * 0.32],
            [width * 0.5, height * 0.12],
            [width * 0.86, height * 0.24],
            [width * 0.92, height * 0.42],
            [width * 0.68, height * 0.62],
            [width * 0.34, height * 0.82],
            [width * 0.14, height * 0.96],
        ],
        ribbonA
    );
    fillSkinCircle(ctx, width * 0.76, height * 0.24, width * 0.06, rgbaFromHex(0xffffff, 0.1));
    fillSkinCircle(
        ctx,
        width * 0.24,
        height * 0.72,
        width * 0.08,
        rgbaFromHex(skinPreset.glowColor, 0.08)
    );
}

function drawBodyHazardOverlay(ctx, width, height, skinPreset) {
    const stripeWidth = width * 0.1;
    for (let offset = -height; offset < width + height; offset += stripeWidth * 1.22) {
        fillSkinPolygon(
            ctx,
            [
                [offset, 0],
                [offset + stripeWidth, 0],
                [offset + stripeWidth - height * 0.18, height],
                [offset - height * 0.18, height],
            ],
            rgbaFromHex(skinPreset.stripeColor, 0.26)
        );
    }
    fillSkinRoundedRect(
        ctx,
        width * 0.12,
        height * 0.12,
        width * 0.76,
        height * 0.08,
        height * 0.04,
        rgbaFromHex(skinPreset.accentColor, 0.24)
    );
    fillSkinRoundedRect(
        ctx,
        width * 0.12,
        height * 0.74,
        width * 0.76,
        height * 0.08,
        height * 0.04,
        rgbaFromHex(skinPreset.accentColor, 0.24)
    );
}

function fillSkinRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
    ctx.save();
    ctx.fillStyle = fillStyle;
    drawSkinRoundedRectPath(ctx, x, y, width, height, radius);
    ctx.fill();
    ctx.restore();
}

function fillSkinTriangle(ctx, points, fillStyle) {
    fillSkinPolygon(ctx, points, fillStyle);
}

function fillSkinPolygon(ctx, points, fillStyle) {
    if (!Array.isArray(points) || points.length < 3) {
        return;
    }
    ctx.save();
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function fillSkinCircle(ctx, x, y, radius, fillStyle) {
    ctx.save();
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawSkinRoundedRectPath(ctx, x, y, width, height, radius) {
    const clampedRadius = Math.max(0, Math.min(radius, Math.min(width, height) * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + clampedRadius, y);
    ctx.lineTo(x + width - clampedRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
    ctx.lineTo(x + width, y + height - clampedRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height);
    ctx.lineTo(x + clampedRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
    ctx.lineTo(x, y + clampedRadius);
    ctx.quadraticCurveTo(x, y, x + clampedRadius, y);
    ctx.closePath();
}

function getSkinFinishProfile(skinPreset = null) {
    const materialKey =
        skinPreset && typeof skinPreset.material === 'string'
            ? skinPreset.material
            : DEFAULT_SKIN_MATERIAL;
    return BODY_FINISH_PROFILES[materialKey] || BODY_FINISH_PROFILES[DEFAULT_SKIN_MATERIAL];
}

function applySkinFinishToBodyMaterial(
    material,
    finishProfile,
    skinPreset,
    bodyColor,
    bodyEmissive,
    bodyTexture = null
) {
    const isUserWrapTexture = Boolean(bodyTexture?.userData?.isUserWrapTexture);
    const baseEmissiveIntensity = Number(material?.userData?.baseEmissiveIntensity) || 0.3;
    material.color.setHex(bodyTexture ? 0xffffff : bodyColor.getHex());
    material.map = bodyTexture;
    material.emissive.copy(isUserWrapTexture ? USER_WRAP_EMISSIVE_COLOR : bodyEmissive);
    material.emissiveMap = isUserWrapTexture ? bodyTexture : null;
    material.emissiveIntensity = isUserWrapTexture
        ? baseEmissiveIntensity * (finishProfile.panelEmissiveScale + 0.16)
        : baseEmissiveIntensity * finishProfile.panelEmissiveScale;
    material.metalness = isUserWrapTexture
        ? Math.min(finishProfile.panelMetalness, 0.68)
        : finishProfile.panelMetalness;
    material.roughness = isUserWrapTexture
        ? Math.max(finishProfile.panelRoughness, 0.22)
        : finishProfile.panelRoughness;
    material.clearcoat = finishProfile.panelClearcoat;
    material.clearcoatRoughness = finishProfile.panelClearcoatRoughness;
    material.reflectivity = finishProfile.panelReflectivity;
    material.sheen = finishProfile.panelSheen;
    material.sheenRoughness = finishProfile.panelSheenRoughness;
    material.sheenColor.copy(
        resolveSkinFinishColor(finishProfile.panelSheenColorSource, skinPreset)
    );
    material.iridescence = finishProfile.panelIridescence;
    material.iridescenceIOR = finishProfile.panelIridescenceIOR;
    material.iridescenceThicknessRange = [...finishProfile.panelIridescenceThicknessRange];
    material.needsUpdate = true;
}

function resolveSkinFinishColor(source, skinPreset) {
    switch (source) {
        case 'glow':
            return new THREE.Color(skinPreset.glowColor);
        case 'accentSecondary':
            return new THREE.Color(skinPreset.accentColorSecondary);
        case 'accentColor':
            return new THREE.Color(skinPreset.accentColor);
        case 'stripe':
        default:
            return new THREE.Color(skinPreset.stripeColor);
    }
}

function hashString(value = '') {
    let hash = 2166136261;
    const input = String(value);
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function createSeededRandom(seed = 1) {
    let state = (Math.floor(seed) || 1) >>> 0;
    return function nextRandom() {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function rgbaFromHex(colorHex, alpha = 1) {
    const r = (colorHex >>> 16) & 255;
    const g = (colorHex >>> 8) & 255;
    const b = colorHex & 255;
    const clampedAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
    return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
}

function normalizeBodyColorHex(colorHex, fallbackSkinId = DEFAULT_PLAYER_CAR_SKIN_ID) {
    const fallbackColorHex = getCarSkinPresetById(fallbackSkinId).bodyColor >>> 0;
    const numeric = Number(colorHex);
    if (!Number.isFinite(numeric)) {
        return fallbackColorHex;
    }
    return Math.max(0, Math.min(0xffffff, Math.round(numeric))) >>> 0;
}

function createRoofShimmerTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const baseGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    baseGradient.addColorStop(0, 'rgba(255,255,255,0)');
    baseGradient.addColorStop(0.45, 'rgba(210,245,255,0.16)');
    baseGradient.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    baseGradient.addColorStop(0.55, 'rgba(210,245,255,0.16)');
    baseGradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = baseGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 5; i += 1) {
        const y = 18 + i * 22;
        ctx.fillStyle = `rgba(176, 236, 255, ${0.08 + i * 0.012})`;
        ctx.fillRect(0, y, canvas.width, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1.2, 1);
    texture.anisotropy = 4;
    return texture;
}

function createVoltlineRoofScreenController(brandName, playerName = 'MAREK') {
    const canvas = document.createElement('canvas');
    canvas.width = 1400;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;

    render('dashboard', 1, {});

    return {
        texture,
        render,
        resolveInteractionFromUv,
    };

    function render(mode = 'dashboard', batteryLevel = 1, vehicleState = {}) {
        const width = canvas.width;
        const height = canvas.height;
        const clampedBattery = THREE.MathUtils.clamp(batteryLevel, 0, 1);
        const isBatteryDepleted = Boolean(vehicleState?.batteryDepleted);
        const batteryDepletedBlink = THREE.MathUtils.clamp(
            vehicleState?.batteryDepletedBlink ?? 0.5,
            0,
            1
        );
        const telemetry = {
            speedKph: Math.round(Math.abs((vehicleState.speed || 0) * 3.6)),
            throttle: THREE.MathUtils.clamp(Math.abs(vehicleState.throttle || 0), 0, 1),
            steer: THREE.MathUtils.clamp(vehicleState.steerInput || 0, -1, 1),
            yawRate: THREE.MathUtils.clamp(Math.abs(vehicleState.yawRate || 0), 0, 2),
            batteryPercent: Math.round(clampedBattery * 100),
            rangeKm: Math.round(520 * clampedBattery),
            suspensionHeightLevel: THREE.MathUtils.clamp(
                vehicleState.suspensionHeightLevel ?? 0,
                -1,
                1
            ),
            suspensionStiffnessLevel: THREE.MathUtils.clamp(
                vehicleState.suspensionStiffnessLevel ?? 0,
                -1,
                1
            ),
            suspensionHeightPercent: THREE.MathUtils.clamp(
                vehicleState.suspensionHeightPercent ?? 50,
                0,
                100
            ),
            suspensionStiffnessPercent: THREE.MathUtils.clamp(
                vehicleState.suspensionStiffnessPercent ?? 50,
                0,
                100
            ),
            suspensionHeightMm: Math.round(vehicleState.suspensionHeightMm ?? 0),
            suspensionStiffnessScale: vehicleState.suspensionStiffnessScale ?? 1,
            topSpeedLimitKph: Math.round(
                THREE.MathUtils.clamp(
                    vehicleState.topSpeedLimitKph ?? PLAYER_TOP_SPEED_LIMIT_MAX_KPH,
                    PLAYER_TOP_SPEED_LIMIT_MIN_KPH,
                    PLAYER_TOP_SPEED_LIMIT_MAX_KPH
                )
            ),
            topSpeedLimitPercent: THREE.MathUtils.clamp(
                vehicleState.topSpeedLimitPercent ?? 100,
                0,
                100
            ),
        };
        ctx.clearRect(0, 0, width, height);
        if (isBatteryDepleted) {
            drawBatteryDepletedScreen(
                width,
                height,
                telemetry.batteryPercent,
                batteryDepletedBlink
            );
            texture.needsUpdate = true;
            return;
        }

        const shellX = 38;
        const shellY = 40;
        const shellW = width - 76;
        const shellH = height - 80;
        const shellRadius = 62;
        const shellGradient = ctx.createLinearGradient(
            shellX,
            shellY,
            shellX + shellW,
            shellY + shellH
        );
        shellGradient.addColorStop(0, '#060b12');
        shellGradient.addColorStop(0.52, '#0a1220');
        shellGradient.addColorStop(1, '#060b12');
        ctx.fillStyle = shellGradient;
        drawRoundedRect(ctx, shellX, shellY, shellW, shellH, shellRadius);
        ctx.fill();

        const shellStroke = ctx.createLinearGradient(shellX, shellY, shellX + shellW, shellY);
        shellStroke.addColorStop(0, 'rgba(116, 210, 238, 0.38)');
        shellStroke.addColorStop(1, 'rgba(210, 238, 255, 0.2)');
        ctx.lineWidth = 2;
        ctx.strokeStyle = shellStroke;
        drawRoundedRect(ctx, shellX, shellY, shellW, shellH, shellRadius);
        ctx.stroke();

        const panelX = shellX + 18;
        const panelY = shellY + 18;
        const panelW = shellW - 36;
        const panelH = shellH - 36;
        const panelRadius = shellRadius - 14;
        const panelGradient = ctx.createLinearGradient(
            panelX,
            panelY,
            panelX + panelW,
            panelY + panelH
        );
        panelGradient.addColorStop(0, '#08111d');
        panelGradient.addColorStop(0.5, '#0d1928');
        panelGradient.addColorStop(1, '#09121c');
        ctx.fillStyle = panelGradient;
        drawRoundedRect(ctx, panelX, panelY, panelW, panelH, panelRadius);
        ctx.fill();

        ctx.save();
        drawRoundedRect(ctx, panelX + 2, panelY + 2, panelW - 4, panelH - 4, panelRadius - 2);
        ctx.clip();
        ctx.fillStyle = 'rgba(148, 214, 244, 0.045)';
        for (let x = panelX - 220; x <= panelX + panelW + 220; x += 44) {
            ctx.fillRect(x, panelY + 92, 1, panelH - 142);
        }
        for (let y = panelY + 104; y <= panelY + panelH - 62; y += 34) {
            ctx.fillRect(panelX + 38, y, panelW - 76, 1);
        }
        ctx.restore();

        drawTopBar(mode, panelX, panelY, panelW, telemetry, clampedBattery);

        const contentX = panelX + 36;
        const contentY = panelY + 110;
        const contentW = panelW - 72;
        const contentH = panelH - 178;
        if (mode === 'battery') {
            drawBatteryMode(clampedBattery, contentX, contentY, contentW, contentH, telemetry);
        } else if (mode === 'navigation') {
            drawNavigationMode(contentX, contentY, contentW, contentH, telemetry);
        } else if (mode === 'chassis') {
            drawChassisMode(contentX, contentY, contentW, contentH, telemetry);
        } else {
            drawDashboardMode(contentX, contentY, contentW, contentH, telemetry, clampedBattery);
        }
        drawFooter(panelX, panelY, panelW, panelH, telemetry);

        texture.needsUpdate = true;
    }

    function drawTopBar(mode, panelX, panelY, panelW, telemetry, batteryLevel) {
        const tabs = [
            { key: 'dashboard', label: 'DASH' },
            { key: 'battery', label: 'ENERGY' },
            { key: 'navigation', label: 'NAV' },
            { key: 'chassis', label: 'CHASSIS' },
        ];
        const barY = panelY + 18;
        const tabW = 152;
        const tabH = 54;
        const tabGap = 14;
        const tabStartX = panelX + 38;
        tabs.forEach((tab, index) => {
            const x = tabStartX + index * (tabW + tabGap);
            const isActive = tab.key === mode;
            if (isActive) {
                const activeGradient = ctx.createLinearGradient(x, barY, x + tabW, barY);
                activeGradient.addColorStop(0, 'rgba(72, 201, 242, 0.34)');
                activeGradient.addColorStop(1, 'rgba(118, 243, 255, 0.22)');
                ctx.fillStyle = activeGradient;
                drawRoundedRect(ctx, x, barY, tabW, tabH, 18);
                ctx.fill();
            }
            ctx.strokeStyle = isActive ? 'rgba(142, 229, 255, 0.82)' : 'rgba(112, 148, 176, 0.45)';
            ctx.lineWidth = isActive ? 2 : 1;
            drawRoundedRect(ctx, x, barY, tabW, tabH, 18);
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = "700 26px 'Orbitron', 'Segoe UI', sans-serif";
            ctx.fillStyle = isActive ? 'rgba(230, 248, 255, 0.98)' : 'rgba(168, 196, 218, 0.84)';
            ctx.fillText(tab.label, x + tabW * 0.5, barY + tabH * 0.54);
        });

        const chipX = panelX + panelW - 274;
        const chipY = barY;
        const chipW = 236;
        const chipH = tabH;
        const levelColor = getRoofBatteryColor(batteryLevel);
        ctx.fillStyle = 'rgba(8, 17, 28, 0.95)';
        drawRoundedRect(ctx, chipX, chipY, chipW, chipH, 18);
        ctx.fill();
        ctx.strokeStyle = 'rgba(142, 178, 208, 0.46)';
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, chipX, chipY, chipW, chipH, 18);
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = "600 20px 'Sora', 'Segoe UI', sans-serif";
        ctx.fillStyle = 'rgba(170, 194, 214, 0.95)';
        ctx.fillText('BAT', chipX + 18, chipY + chipH * 0.52);
        ctx.font = "700 26px 'Orbitron', 'Segoe UI', sans-serif";
        ctx.fillStyle = levelColor;
        ctx.fillText(`${telemetry.batteryPercent}%`, chipX + 74, chipY + chipH * 0.52);
        ctx.font = "600 18px 'Sora', 'Segoe UI', sans-serif";
        ctx.fillStyle = 'rgba(168, 196, 219, 0.9)';
        ctx.fillText(`${telemetry.rangeKm} KM`, chipX + 148, chipY + chipH * 0.52);
    }

    function drawDashboardMode(contentX, contentY, contentW, contentH, telemetry, batteryLevel) {
        const cardRadius = 24;
        const leftW = Math.round(contentW * 0.53);
        const rightW = contentW - leftW - 16;
        const speedCardX = contentX;
        const speedCardY = contentY;
        const speedCardH = contentH;
        const rightX = contentX + leftW + 16;

        const speedGradient = ctx.createLinearGradient(
            speedCardX,
            speedCardY,
            speedCardX + leftW,
            speedCardY + speedCardH
        );
        speedGradient.addColorStop(0, 'rgba(18, 36, 58, 0.86)');
        speedGradient.addColorStop(1, 'rgba(14, 24, 40, 0.86)');
        ctx.fillStyle = speedGradient;
        drawRoundedRect(ctx, speedCardX, speedCardY, leftW, speedCardH, cardRadius);
        ctx.fill();
        ctx.strokeStyle = 'rgba(122, 177, 212, 0.32)';
        ctx.lineWidth = 1.5;
        drawRoundedRect(ctx, speedCardX, speedCardY, leftW, speedCardH, cardRadius);
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = "600 22px 'Sora', 'Segoe UI', sans-serif";
        ctx.fillStyle = 'rgba(173, 201, 224, 0.84)';
        ctx.fillText('CURRENT SPEED', speedCardX + 30, speedCardY + 38);

        ctx.font = "800 158px 'Orbitron', 'Segoe UI', sans-serif";
        ctx.fillStyle = '#ecf7ff';
        ctx.fillText(`${telemetry.speedKph}`, speedCardX + 26, speedCardY + speedCardH * 0.58);

        ctx.font = "700 28px 'Orbitron', 'Segoe UI', sans-serif";
        ctx.fillStyle = 'rgba(168, 203, 232, 0.9)';
        ctx.fillText('KM/H', speedCardX + 38, speedCardY + speedCardH - 38);

        const modeCardY = contentY;
        const modeCardH = Math.floor(contentH * 0.48);
        ctx.fillStyle = 'rgba(12, 24, 39, 0.92)';
        drawRoundedRect(ctx, rightX, modeCardY, rightW, modeCardH, cardRadius);
        ctx.fill();
        ctx.strokeStyle = 'rgba(124, 179, 212, 0.3)';
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, rightX, modeCardY, rightW, modeCardH, cardRadius);
        ctx.stroke();

        const activity = THREE.MathUtils.clamp(
            telemetry.throttle * 0.74 + telemetry.yawRate * 0.26,
            0,
            1
        );
        const driveLabel = activity >= 0.7 ? 'SPORT' : activity >= 0.38 ? 'DYNAMIC' : 'ECO';
        ctx.font = "600 20px 'Sora', 'Segoe UI', sans-serif";
        ctx.fillStyle = 'rgba(165, 193, 218, 0.86)';
        ctx.fillText('DRIVE MODE', rightX + 24, modeCardY + 34);
        ctx.font = "800 56px 'Orbitron', 'Segoe UI', sans-serif";
        ctx.fillStyle = activity >= 0.7 ? '#a4f4ff' : '#d5e9fb';
        ctx.fillText(driveLabel, rightX + 22, modeCardY + 94);

        const steerStability =
            1 -
            THREE.MathUtils.clamp(Math.abs(telemetry.steer) * 0.6 + telemetry.yawRate * 0.3, 0, 1);
        drawMetricBar(
            rightX + 24,
            modeCardY + 120,
            rightW - 48,
            12,
            'TRACTION',
            steerStability,
            '#8fe8ff'
        );
        drawMetricBar(
            rightX + 24,
            modeCardY + 162,
            rightW - 48,
            12,
            'TORQUE',
            telemetry.throttle,
            '#b3f8d0'
        );

        const energyCardY = modeCardY + modeCardH + 14;
        const energyCardH = contentH - modeCardH - 14;
        ctx.fillStyle = 'rgba(12, 24, 39, 0.92)';
        drawRoundedRect(ctx, rightX, energyCardY, rightW, energyCardH, cardRadius);
        ctx.fill();
        ctx.strokeStyle = 'rgba(124, 179, 212, 0.3)';
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, rightX, energyCardY, rightW, energyCardH, cardRadius);
        ctx.stroke();
        ctx.font = "600 20px 'Sora', 'Segoe UI', sans-serif";
        ctx.fillStyle = 'rgba(165, 193, 218, 0.86)';
        ctx.fillText('ENERGY FLOW', rightX + 24, energyCardY + 30);
        drawMetricBar(
            rightX + 24,
            energyCardY + 60,
            rightW - 48,
            14,
            'BATTERY',
            batteryLevel,
            getRoofBatteryColor(batteryLevel)
        );
        drawMetricBar(
            rightX + 24,
            energyCardY + 104,
            rightW - 48,
            14,
            'REGEN',
            1 - telemetry.throttle * 0.72,
            '#8dd9ff'
        );
    }

    function drawBatteryMode(batteryLevel, contentX, contentY, contentW, contentH, telemetry) {
        const levelColor = getRoofBatteryColor(batteryLevel);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = "600 24px 'Sora', 'Segoe UI', sans-serif";
        ctx.fillStyle = 'rgba(172, 200, 224, 0.88)';
        ctx.fillText('BATTERY SYSTEM', contentX + 10, contentY + 20);

        ctx.font = "800 184px 'Orbitron', 'Segoe UI', sans-serif";
        ctx.fillStyle = '#f2f8ff';
        ctx.fillText(`${telemetry.batteryPercent}%`, contentX + 2, contentY + contentH * 0.56);

        ctx.font = "600 30px 'Sora', 'Segoe UI', sans-serif";
        ctx.fillStyle = 'rgba(178, 201, 223, 0.9)';
        ctx.fillText(`EST RANGE ${telemetry.rangeKm} KM`, contentX + 12, contentY + contentH - 40);

        const barX = contentX + 6;
        const barY = contentY + contentH - 106;
        const barW = contentW - 300;
        const barH = 54;
        ctx.fillStyle = 'rgba(15, 27, 42, 0.94)';
        drawRoundedRect(ctx, barX, barY, barW, barH, 24);
        ctx.fill();
        ctx.strokeStyle = 'rgba(115, 170, 205, 0.44)';
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, barX, barY, barW, barH, 24);
        ctx.stroke();

        const chargeWidth = Math.max(20, Math.round((barW - 8) * batteryLevel));
        const chargeGradient = ctx.createLinearGradient(barX, barY, barX + barW, barY);
        chargeGradient.addColorStop(0, levelColor);
        chargeGradient.addColorStop(1, '#dff8ff');
        ctx.fillStyle = chargeGradient;
        drawRoundedRect(ctx, barX + 4, barY + 4, chargeWidth, barH - 8, 20);
        ctx.fill();

        const statX = barX + barW + 28;
        const statW = 258;
        const statH = 76;
        const statRows = [
            ['TEMP', `${Math.round(22 + telemetry.throttle * 16)}C`],
            ['POWER', `${Math.round(60 + telemetry.throttle * 220)} kW`],
            ['CELLS', 'OPTIMAL'],
        ];
        statRows.forEach((row, index) => {
            const y = contentY + index * (statH + 12);
            ctx.fillStyle = 'rgba(12, 24, 39, 0.92)';
            drawRoundedRect(ctx, statX, y, statW, statH, 18);
            ctx.fill();
            ctx.strokeStyle = 'rgba(124, 179, 212, 0.32)';
            ctx.lineWidth = 1;
            drawRoundedRect(ctx, statX, y, statW, statH, 18);
            ctx.stroke();
            ctx.font = "600 18px 'Sora', 'Segoe UI', sans-serif";
            ctx.fillStyle = 'rgba(163, 190, 212, 0.9)';
            ctx.fillText(row[0], statX + 18, y + 26);
            ctx.font = "700 26px 'Orbitron', 'Segoe UI', sans-serif";
            ctx.fillStyle = row[0] === 'CELLS' ? '#9af4c7' : '#e8f4ff';
            ctx.fillText(row[1], statX + 18, y + 56);
        });
    }

    function drawBatteryDepletedScreen(width, height, batteryPercent = 0, blinkLevel = 0.5) {
        const pulse = THREE.MathUtils.clamp(blinkLevel, 0, 1);
        const centerX = width * 0.5;
        const centerY = height * 0.46;
        const cardW = Math.min(width * 0.74, 960);
        const cardH = Math.min(height * 0.68, 500);
        const cardX = centerX - cardW * 0.5;
        const cardY = centerY - cardH * 0.5;
        const batteryW = Math.min(cardW * 0.46, 320);
        const batteryH = Math.max(86, cardH * 0.22);
        const batteryX = centerX - batteryW * 0.5;
        const batteryY = centerY - batteryH * 0.5;

        ctx.save();
        const bgGradient = ctx.createLinearGradient(0, 0, width, height);
        bgGradient.addColorStop(0, '#14080d');
        bgGradient.addColorStop(0.5, '#190a11');
        bgGradient.addColorStop(1, '#0d070a');
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, width, height);

        const haloGradient = ctx.createRadialGradient(
            centerX,
            centerY,
            32,
            centerX,
            centerY,
            cardW * 0.56
        );
        haloGradient.addColorStop(0, `rgba(255, 106, 126, ${0.22 + pulse * 0.16})`);
        haloGradient.addColorStop(1, 'rgba(255, 106, 126, 0)');
        ctx.fillStyle = haloGradient;
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = 'rgba(20, 8, 14, 0.9)';
        drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 34);
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 126, 138, ${0.42 + pulse * 0.36})`;
        ctx.lineWidth = 2;
        drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 34);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 126, 138, ${0.44 + pulse * 0.52})`;
        ctx.lineWidth = 8;
        ctx.shadowColor = `rgba(255, 86, 108, ${0.36 + pulse * 0.46})`;
        ctx.shadowBlur = 18 + pulse * 26;
        drawRoundedRect(ctx, batteryX, batteryY, batteryW, batteryH, 20);
        ctx.stroke();

        const terminalW = Math.max(16, batteryW * 0.08);
        const terminalH = batteryH * 0.3;
        ctx.fillStyle = `rgba(255, 118, 132, ${0.4 + pulse * 0.42})`;
        drawRoundedRect(
            ctx,
            batteryX + batteryW + 8,
            batteryY + batteryH * 0.5 - terminalH * 0.5,
            terminalW,
            terminalH,
            8
        );
        ctx.fill();

        const innerPad = 10;
        const cellX = batteryX + innerPad;
        const cellY = batteryY + innerPad;
        const cellW = batteryW - innerPad * 2;
        const cellH = batteryH - innerPad * 2;
        ctx.fillStyle = 'rgba(40, 12, 18, 0.76)';
        drawRoundedRect(ctx, cellX, cellY, cellW, cellH, 13);
        ctx.fill();

        const fillRatio = THREE.MathUtils.clamp(batteryPercent / 100, 0, 1);
        const fillW = Math.max(10, (cellW - 6) * Math.max(0.02, fillRatio));
        const fillGradient = ctx.createLinearGradient(cellX, cellY, cellX + fillW, cellY);
        fillGradient.addColorStop(0, `rgba(255, 82, 104, ${0.66 + pulse * 0.3})`);
        fillGradient.addColorStop(1, `rgba(255, 158, 170, ${0.74 + pulse * 0.22})`);
        ctx.fillStyle = fillGradient;
        drawRoundedRect(ctx, cellX + 3, cellY + 3, fillW, cellH - 6, 10);
        ctx.fill();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 26 + pulse * 20;
        ctx.shadowColor = `rgba(255, 88, 111, ${0.56 + pulse * 0.34})`;
        ctx.font = "800 58px 'Orbitron', 'Segoe UI', sans-serif";
        ctx.fillStyle = `rgba(255, 212, 217, ${0.82 + pulse * 0.16})`;
        ctx.fillText('LOW BATTERY', centerX, batteryY + batteryH + 82);

        ctx.shadowBlur = 12 + pulse * 12;
        ctx.font = "700 30px 'Orbitron', 'Segoe UI', sans-serif";
        ctx.fillStyle = `rgba(255, 156, 168, ${0.72 + pulse * 0.24})`;
        ctx.fillText('CHARGE REQUIRED', centerX, batteryY + batteryH + 128);
        ctx.font = "800 68px 'Orbitron', 'Segoe UI', sans-serif";
        ctx.fillStyle = `rgba(255, 227, 231, ${0.88 + pulse * 0.1})`;
        ctx.fillText(`${Math.round(fillRatio * 100)}%`, centerX, batteryY - 42);
        ctx.restore();
    }

    function drawNavigationMode(contentX, contentY, contentW, contentH, telemetry) {
        const mapW = Math.round(contentW * 0.58);
        const mapH = contentH;
        const mapX = contentX;
        const mapY = contentY;
        const sideX = mapX + mapW + 16;
        const sideW = contentW - mapW - 16;

        ctx.fillStyle = 'rgba(12, 24, 39, 0.92)';
        drawRoundedRect(ctx, mapX, mapY, mapW, mapH, 24);
        ctx.fill();
        ctx.strokeStyle = 'rgba(124, 179, 212, 0.32)';
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, mapX, mapY, mapW, mapH, 24);
        ctx.stroke();

        ctx.save();
        drawRoundedRect(ctx, mapX + 2, mapY + 2, mapW - 4, mapH - 4, 22);
        ctx.clip();
        ctx.fillStyle = 'rgba(137, 194, 228, 0.08)';
        for (let x = mapX + 26; x < mapX + mapW; x += 38) {
            ctx.fillRect(x, mapY + 14, 1, mapH - 24);
        }
        for (let y = mapY + 20; y < mapY + mapH; y += 36) {
            ctx.fillRect(mapX + 14, y, mapW - 24, 1);
        }
        const routeStartX = mapX + 60;
        const routeStartY = mapY + mapH - 64;
        const routeMidX = mapX + mapW * 0.42;
        const routeMidY = mapY + mapH * 0.55;
        const routeEndX = mapX + mapW * 0.78;
        const routeEndY = mapY + 66;
        ctx.strokeStyle = 'rgba(141, 238, 255, 0.95)';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(routeStartX, routeStartY);
        ctx.lineTo(routeMidX, routeMidY);
        ctx.lineTo(routeEndX, routeEndY);
        ctx.stroke();
        ctx.fillStyle = '#edfbff';
        ctx.beginPath();
        ctx.arc(routeMidX, routeMidY, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        const cardH = (contentH - 24) / 3;
        const navRows = [
            ['NEXT', 'LEFT IN 180 M'],
            ['ETA', `${Math.max(4, Math.round(telemetry.speedKph / 9 + 6))} MIN`],
            ['TARGET', `${Math.max(12, Math.round(telemetry.speedKph * 0.75 + 24))} KM/H`],
        ];
        navRows.forEach((row, index) => {
            const y = contentY + index * (cardH + 12);
            ctx.fillStyle = 'rgba(12, 24, 39, 0.92)';
            drawRoundedRect(ctx, sideX, y, sideW, cardH, 22);
            ctx.fill();
            ctx.strokeStyle = 'rgba(124, 179, 212, 0.32)';
            ctx.lineWidth = 1;
            drawRoundedRect(ctx, sideX, y, sideW, cardH, 22);
            ctx.stroke();
            ctx.font = "600 18px 'Sora', 'Segoe UI', sans-serif";
            ctx.fillStyle = 'rgba(163, 190, 212, 0.9)';
            ctx.fillText(row[0], sideX + 18, y + 28);
            ctx.font = "700 30px 'Orbitron', 'Segoe UI', sans-serif";
            ctx.fillStyle = '#ecf8ff';
            ctx.fillText(row[1], sideX + 18, y + cardH - 24);
        });
    }

    function drawChassisMode(contentX, contentY, contentW, contentH, telemetry) {
        const layout = getChassisLayout(contentX, contentY, contentW, contentH);
        const cards = [
            {
                key: 'height',
                title: 'RIDE HEIGHT',
                value: `${telemetry.suspensionHeightMm >= 0 ? '+' : ''}${telemetry.suspensionHeightMm} MM`,
                detail: `LEVEL ${Math.round(telemetry.suspensionHeightLevel * 10) / 10}`,
                percent: telemetry.suspensionHeightPercent / 100,
                color: '#95eeff',
                frame: layout.heightCard,
                valueFont: "800 44px 'Orbitron', 'Segoe UI', sans-serif",
            },
            {
                key: 'stiffness',
                title: 'SPRING STIFFNESS',
                value: `${telemetry.suspensionStiffnessPercent}%`,
                detail: `SCALE ${telemetry.suspensionStiffnessScale.toFixed(2)}x`,
                percent: telemetry.suspensionStiffnessPercent / 100,
                color: '#ffe39a',
                frame: layout.stiffnessCard,
                valueFont: "800 44px 'Orbitron', 'Segoe UI', sans-serif",
            },
            {
                key: 'top_speed',
                title: 'TOP SPEED',
                value: `${telemetry.topSpeedLimitKph} KM/H`,
                detail: `LIMIT ${Math.round(telemetry.topSpeedLimitPercent)}%`,
                percent: telemetry.topSpeedLimitPercent / 100,
                color: '#ffbf9a',
                frame: layout.topSpeedCard,
                valueFont: "800 42px 'Orbitron', 'Segoe UI', sans-serif",
            },
        ];

        cards.forEach((card) => {
            ctx.fillStyle = 'rgba(12, 24, 39, 0.94)';
            drawRoundedRect(ctx, card.frame.x, card.frame.y, card.frame.w, card.frame.h, 24);
            ctx.fill();
            ctx.strokeStyle = 'rgba(124, 179, 212, 0.34)';
            ctx.lineWidth = 1;
            drawRoundedRect(ctx, card.frame.x, card.frame.y, card.frame.w, card.frame.h, 24);
            ctx.stroke();

            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = "600 20px 'Sora', 'Segoe UI', sans-serif";
            ctx.fillStyle = 'rgba(168, 194, 214, 0.9)';
            ctx.fillText(card.title, card.frame.x + 22, card.frame.y + 28);
            ctx.font = card.valueFont || "800 44px 'Orbitron', 'Segoe UI', sans-serif";
            ctx.fillStyle = '#edf7ff';
            ctx.fillText(card.value, card.frame.x + 22, card.frame.y + 88);
            ctx.font = "600 18px 'Sora', 'Segoe UI', sans-serif";
            ctx.fillStyle = 'rgba(155, 186, 208, 0.88)';
            ctx.fillText(card.detail, card.frame.x + 22, card.frame.y + 124);

            drawMetricBar(
                card.frame.x + 22,
                card.frame.y + 156,
                card.frame.w - 44,
                14,
                'ADJUSTMENT',
                card.percent,
                card.color
            );

            const buttons = getChassisButtonRects(card.frame);
            drawChassisAdjustButton(buttons.minus, '-', card.color);
            drawChassisAdjustButton(buttons.plus, '+', card.color);
        });
    }

    function drawChassisAdjustButton(buttonRect, label, color) {
        const gradient = ctx.createLinearGradient(
            buttonRect.x,
            buttonRect.y,
            buttonRect.x + buttonRect.w,
            buttonRect.y
        );
        gradient.addColorStop(0, 'rgba(32, 57, 80, 0.96)');
        gradient.addColorStop(1, 'rgba(20, 40, 60, 0.96)');
        ctx.fillStyle = gradient;
        drawRoundedRect(ctx, buttonRect.x, buttonRect.y, buttonRect.w, buttonRect.h, 16);
        ctx.fill();
        ctx.strokeStyle = 'rgba(138, 188, 218, 0.48)';
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, buttonRect.x, buttonRect.y, buttonRect.w, buttonRect.h, 16);
        ctx.stroke();
        ctx.font = "800 34px 'Orbitron', 'Segoe UI', sans-serif";
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, buttonRect.x + buttonRect.w * 0.5, buttonRect.y + buttonRect.h * 0.54);
    }

    function drawMetricBar(x, y, width, height, label, value, color) {
        const clamped = THREE.MathUtils.clamp(value, 0, 1);
        ctx.font = "600 16px 'Sora', 'Segoe UI', sans-serif";
        ctx.fillStyle = 'rgba(166, 191, 210, 0.86)';
        ctx.fillText(label, x, y - 10);
        ctx.fillStyle = 'rgba(26, 40, 58, 0.98)';
        drawRoundedRect(ctx, x, y, width, height, Math.max(6, Math.floor(height * 0.5)));
        ctx.fill();
        const fillW = Math.max(8, Math.round((width - 4) * clamped));
        const gradient = ctx.createLinearGradient(x, y, x + width, y);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, '#e9f9ff');
        ctx.fillStyle = gradient;
        drawRoundedRect(
            ctx,
            x + 2,
            y + 2,
            fillW,
            height - 4,
            Math.max(4, Math.floor((height - 4) * 0.5))
        );
        ctx.fill();
    }

    function drawFooter(panelX, panelY, panelW, panelH, telemetry) {
        const footerY = panelY + panelH - 42;
        const labels = [
            `PILOT ${String(playerName || 'DRIVER').toUpperCase()}`,
            `UNIT ${String(brandName || 'VOLTLINE').toUpperCase()}`,
            `YAW ${telemetry.yawRate.toFixed(2)}`,
        ];
        const chipW = 220;
        labels.forEach((label, index) => {
            const x = panelX + 36 + index * (chipW + 12);
            ctx.fillStyle = 'rgba(9, 18, 30, 0.92)';
            drawRoundedRect(ctx, x, footerY, chipW, 28, 12);
            ctx.fill();
            ctx.strokeStyle = 'rgba(107, 150, 183, 0.32)';
            ctx.lineWidth = 1;
            drawRoundedRect(ctx, x, footerY, chipW, 28, 12);
            ctx.stroke();
            ctx.font = "600 14px 'Sora', 'Segoe UI', sans-serif";
            ctx.fillStyle = 'rgba(164, 193, 215, 0.9)';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x + 12, footerY + 15);
        });

        const timeX = panelX + panelW - 180;
        const minutes = Math.floor((telemetry.speedKph * 1.3 + 18) % 60);
        const seconds = Math.floor((telemetry.speedKph * 2.6 + 12) % 60);
        const clock = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        ctx.font = "700 16px 'Orbitron', 'Segoe UI', sans-serif";
        ctx.fillStyle = 'rgba(164, 205, 232, 0.94)';
        ctx.fillText(clock, timeX, footerY + 16);
    }

    function getUiShellLayout() {
        const shellX = 38;
        const shellY = 40;
        const shellW = canvas.width - 76;
        const shellH = canvas.height - 80;
        const panelX = shellX + 18;
        const panelY = shellY + 18;
        const panelW = shellW - 36;
        const panelH = shellH - 36;
        return {
            panelX,
            panelY,
            panelW,
            panelH,
            contentX: panelX + 36,
            contentY: panelY + 110,
            contentW: panelW - 72,
            contentH: panelH - 178,
        };
    }

    function getChassisLayout(contentX, contentY, contentW, contentH) {
        const gap = 16;
        const cardW = (contentW - gap * 2) / 3;
        return {
            heightCard: {
                x: contentX,
                y: contentY,
                w: cardW,
                h: contentH,
            },
            stiffnessCard: {
                x: contentX + cardW + gap,
                y: contentY,
                w: cardW,
                h: contentH,
            },
            topSpeedCard: {
                x: contentX + (cardW + gap) * 2,
                y: contentY,
                w: cardW,
                h: contentH,
            },
        };
    }

    function getChassisButtonRects(cardFrame) {
        const buttonW = 76;
        const buttonH = 56;
        const buttonY = cardFrame.y + cardFrame.h - 84;
        return {
            minus: {
                x: cardFrame.x + 22,
                y: buttonY,
                w: buttonW,
                h: buttonH,
            },
            plus: {
                x: cardFrame.x + cardFrame.w - 22 - buttonW,
                y: buttonY,
                w: buttonW,
                h: buttonH,
            },
        };
    }

    function isPointInsideRect(x, y, rect) {
        return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    }

    function resolveInteractionFromUv(uv, activeMode = 'dashboard') {
        if (!uv || !Number.isFinite(uv.x) || !Number.isFinite(uv.y)) {
            return null;
        }

        const ui = getUiShellLayout();
        const barY = ui.panelY + 18;
        const tabW = 152;
        const tabH = 54;
        const tabGap = 14;
        const tabStartX = ui.panelX + 38;
        const pointerX = THREE.MathUtils.clamp(uv.x, 0, 1) * canvas.width;
        const pointerY = (1 - THREE.MathUtils.clamp(uv.y, 0, 1)) * canvas.height;

        if (
            pointerX < ui.panelX ||
            pointerX > ui.panelX + ui.panelW ||
            pointerY < ui.panelY ||
            pointerY > ui.panelY + ui.panelH
        ) {
            return null;
        }

        const modeOrder = ['dashboard', 'battery', 'navigation', 'chassis'];
        for (let i = 0; i < modeOrder.length; i += 1) {
            const x = tabStartX + i * (tabW + tabGap);
            if (
                pointerX >= x &&
                pointerX <= x + tabW &&
                pointerY >= barY &&
                pointerY <= barY + tabH
            ) {
                return { type: 'mode', modeKey: modeOrder[i] };
            }
        }

        if (activeMode !== 'chassis') {
            return null;
        }

        const chassisLayout = getChassisLayout(ui.contentX, ui.contentY, ui.contentW, ui.contentH);
        const heightButtons = getChassisButtonRects(chassisLayout.heightCard);
        const stiffnessButtons = getChassisButtonRects(chassisLayout.stiffnessCard);
        const topSpeedButtons = getChassisButtonRects(chassisLayout.topSpeedCard);
        if (isPointInsideRect(pointerX, pointerY, heightButtons.minus)) {
            return { type: 'suspension_height', delta: -1 };
        }
        if (isPointInsideRect(pointerX, pointerY, heightButtons.plus)) {
            return { type: 'suspension_height', delta: 1 };
        }
        if (isPointInsideRect(pointerX, pointerY, stiffnessButtons.minus)) {
            return { type: 'suspension_stiffness', delta: -1 };
        }
        if (isPointInsideRect(pointerX, pointerY, stiffnessButtons.plus)) {
            return { type: 'suspension_stiffness', delta: 1 };
        }
        if (isPointInsideRect(pointerX, pointerY, topSpeedButtons.minus)) {
            return { type: 'top_speed_limit', delta: -1 };
        }
        if (isPointInsideRect(pointerX, pointerY, topSpeedButtons.plus)) {
            return { type: 'top_speed_limit', delta: 1 };
        }
        return null;
    }
}

function getRoofBatteryColor(level) {
    if (level <= 0.22) {
        return '#ff6e7a';
    }
    if (level <= 0.6) {
        return '#ffd77a';
    }
    return '#96ffbe';
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width * 0.5, height * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function createNameplateTexture(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const label =
        String(text || REAR_MODEL_NAME)
            .trim()
            .replace(/\s+/g, ' ') || REAR_MODEL_NAME;
    const fontFamily =
        "'Brush Script MT', 'Snell Roundhand', 'Apple Chancery', 'Segoe Script', cursive";
    let fontSize = 248;

    function measureTextWidth(content) {
        return ctx.measureText(content).width;
    }

    while (fontSize > 130) {
        ctx.font = `700 ${fontSize}px ${fontFamily}`;
        if (measureTextWidth(label) <= canvas.width * 0.9) {
            break;
        }
        fontSize -= 4;
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${fontSize}px ${fontFamily}`;
    const centerY = canvas.height * 0.56;
    const textWidth = measureTextWidth(label);
    const startX = (canvas.width - textWidth) * 0.5;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
    ctx.shadowBlur = Math.max(1, fontSize * 0.018);
    ctx.shadowOffsetY = Math.max(0.4, fontSize * 0.002);
    ctx.strokeStyle = 'rgba(20, 24, 30, 0.55)';
    ctx.lineWidth = Math.max(1, fontSize * 0.015);
    ctx.strokeText(label, startX, centerY);

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    const metallicGradient = ctx.createLinearGradient(0, centerY - fontSize * 0.72, 0, centerY);
    metallicGradient.addColorStop(0, '#fffdf8');
    metallicGradient.addColorStop(0.3, '#f8f1df');
    metallicGradient.addColorStop(0.62, '#e2cfaa');
    metallicGradient.addColorStop(1, '#b89a69');
    ctx.fillStyle = metallicGradient;
    ctx.fillText(label, startX, centerY);

    // Keep all post effects clipped to glyphs so no rectangular background appears.
    ctx.globalCompositeOperation = 'source-atop';
    const topGloss = ctx.createLinearGradient(0, centerY - fontSize * 0.62, 0, centerY);
    topGloss.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
    topGloss.addColorStop(0.44, 'rgba(255, 255, 255, 0.18)');
    topGloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = topGloss;
    ctx.fillRect(startX - 2, centerY - fontSize * 0.7, textWidth + 4, fontSize * 0.55);

    const lowerShade = ctx.createLinearGradient(
        0,
        centerY - fontSize * 0.08,
        0,
        centerY + fontSize * 0.66
    );
    lowerShade.addColorStop(0, 'rgba(29, 40, 54, 0)');
    lowerShade.addColorStop(1, 'rgba(29, 40, 54, 0.24)');
    ctx.fillStyle = lowerShade;
    ctx.fillRect(startX - 2, centerY - fontSize * 0.08, textWidth + 4, fontSize * 0.74);

    const pearlStep = 12;
    for (let x = startX; x <= startX + textWidth; x += pearlStep) {
        ctx.fillStyle =
            x % (pearlStep * 2) === 0 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(70, 58, 42, 0.04)';
        ctx.fillRect(x, centerY - fontSize * 0.6, 1, fontSize * 1.1);
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255, 247, 232, 0.42)';
    ctx.lineWidth = Math.max(0.9, fontSize * 0.014);
    ctx.strokeText(label, startX, centerY);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.premultiplyAlpha = true;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 8;
    return texture;
}

export { addLuxuryBody };
