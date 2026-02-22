import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { PLAYER_TOP_SPEED_LIMIT_MIN_KPH, PLAYER_TOP_SPEED_LIMIT_MAX_KPH } from './constants.js';

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
const REAR_MODEL_NAME = 'Minefield Drift';
const SUSPENSION_LINK_Y = 0.5;
const ROOF_MODULE_LIFT = 0.03;
const TAILLIGHT_RUNNING_LIGHT_FACTOR = 0.28;
const TAILLIGHT_BRAKE_LIGHT_FACTOR = 1.65;
const TAILLIGHT_RUNNING_DISTANCE_FACTOR = 0.64;
const TAILLIGHT_BRAKE_DISTANCE_FACTOR = 1.08;
const TAILLIGHT_RUNNING_EMISSIVE = 0.62;
const TAILLIGHT_BRAKE_EMISSIVE = 2.45;
const WIRELESS_CHARGE_GLOW_COLOR = 0x88eeff;

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

function createAccentChargeFlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerY = canvas.height * 0.5;
    const coreGradient = ctx.createLinearGradient(0, centerY, canvas.width, centerY);
    coreGradient.addColorStop(0, 'rgba(191, 245, 255, 0)');
    coreGradient.addColorStop(0.2, 'rgba(191, 245, 255, 0.22)');
    coreGradient.addColorStop(0.5, 'rgba(230, 254, 255, 0.95)');
    coreGradient.addColorStop(0.8, 'rgba(191, 245, 255, 0.22)');
    coreGradient.addColorStop(1, 'rgba(191, 245, 255, 0)');
    ctx.fillStyle = coreGradient;
    ctx.fillRect(0, centerY - 16, canvas.width, 32);

    const haloGradient = ctx.createLinearGradient(0, centerY, canvas.width, centerY);
    haloGradient.addColorStop(0, 'rgba(115, 224, 255, 0)');
    haloGradient.addColorStop(0.3, 'rgba(115, 224, 255, 0.15)');
    haloGradient.addColorStop(0.5, 'rgba(171, 247, 255, 0.44)');
    haloGradient.addColorStop(0.7, 'rgba(115, 224, 255, 0.15)');
    haloGradient.addColorStop(1, 'rgba(115, 224, 255, 0)');
    ctx.fillStyle = haloGradient;
    ctx.fillRect(0, centerY - 28, canvas.width, 56);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    return texture;
}

function createTaillightSweepTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 88;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width * 0.5;
    const centerY = canvas.height * 0.5;

    const coreGradient = ctx.createLinearGradient(0, centerY, canvas.width, centerY);
    coreGradient.addColorStop(0, 'rgba(255, 95, 122, 0)');
    coreGradient.addColorStop(0.18, 'rgba(255, 111, 136, 0.24)');
    coreGradient.addColorStop(0.5, 'rgba(255, 194, 208, 0.96)');
    coreGradient.addColorStop(0.82, 'rgba(255, 111, 136, 0.24)');
    coreGradient.addColorStop(1, 'rgba(255, 95, 122, 0)');
    ctx.fillStyle = coreGradient;
    ctx.fillRect(0, centerY - 18, canvas.width, 36);

    const haloGradient = ctx.createRadialGradient(centerX, centerY, 12, centerX, centerY, 140);
    haloGradient.addColorStop(0, 'rgba(255, 196, 208, 0.82)');
    haloGradient.addColorStop(0.4, 'rgba(255, 120, 145, 0.3)');
    haloGradient.addColorStop(1, 'rgba(255, 95, 122, 0)');
    ctx.fillStyle = haloGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const verticalFade = ctx.createLinearGradient(0, 0, 0, canvas.height);
    verticalFade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    verticalFade.addColorStop(0.28, 'rgba(0, 0, 0, 1)');
    verticalFade.addColorStop(0.72, 'rgba(0, 0, 0, 1)');
    verticalFade.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = verticalFade;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    return texture;
}

function createHeadlightSignatureTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 76;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerY = canvas.height * 0.5;
    const coreGradient = ctx.createLinearGradient(0, centerY, canvas.width, centerY);
    coreGradient.addColorStop(0, 'rgba(214, 236, 255, 0)');
    coreGradient.addColorStop(0.2, 'rgba(214, 236, 255, 0.24)');
    coreGradient.addColorStop(0.5, 'rgba(246, 252, 255, 0.96)');
    coreGradient.addColorStop(0.8, 'rgba(214, 236, 255, 0.24)');
    coreGradient.addColorStop(1, 'rgba(214, 236, 255, 0)');
    ctx.fillStyle = coreGradient;
    ctx.fillRect(0, centerY - 12, canvas.width, 24);

    const haloGradient = ctx.createRadialGradient(
        canvas.width * 0.5,
        centerY,
        10,
        canvas.width * 0.5,
        centerY,
        148
    );
    haloGradient.addColorStop(0, 'rgba(238, 248, 255, 0.72)');
    haloGradient.addColorStop(0.42, 'rgba(188, 220, 255, 0.3)');
    haloGradient.addColorStop(1, 'rgba(170, 210, 255, 0)');
    ctx.fillStyle = haloGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const verticalFade = ctx.createLinearGradient(0, 0, 0, canvas.height);
    verticalFade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    verticalFade.addColorStop(0.24, 'rgba(0, 0, 0, 1)');
    verticalFade.addColorStop(0.76, 'rgba(0, 0, 0, 1)');
    verticalFade.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = verticalFade;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    return texture;
}

// Add headlights and taillights.
function addLightsToCar(car, lightConfig = {}) {
    const {
        headlightColor = HEADLIGHT_COLOR,
        headlightIntensity = 54,
        headlightDistance = 240,
        headlightAngle = THREE.MathUtils.degToRad(15),
        headlightPenumbra = 0.36,
        headlightDecay = 1.5,
        nearFillIntensity = 9,
        nearFillDistance = 84,
        nearFillAngle = THREE.MathUtils.degToRad(28),
        nearFillPenumbra = 0.56,
        facadeFillIntensity = 10,
        facadeFillDistance = 122,
        facadeFillAngle = THREE.MathUtils.degToRad(24),
        facadeFillPenumbra = 0.66,
        facadeFillForwardAim = 68,
        facadeFillLateralAim = 10.5,
        facadeFillVerticalAim = 3.4,
        headlightPositions = [
            { position: [-0.31, 0.53, -1.87], target: [-0.95, 0.22, -95] },
            { position: [0.31, 0.53, -1.87], target: [0.95, 0.22, -95] },
        ],
        taillightColor = TAILLIGHT_COLOR,
        taillightIntensity = 1.8,
        taillightDistance = 16,
        taillightDecay = 2.1,
        taillightPositions = [{ position: [-0.3, 0.4, 2] }, { position: [0.3, 0.4, 2] }],
        taillightSegmentCount = 4,
        taillightHaloOpacity = 0.085,
        taillightSweepTravel = 0.44,
        reverseLightIntensity = 1.45,
        reverseLightDistance = 12,
        reverseLightDecay = 2.2,
        enableHeadlightProjectors = true,
        enablePrimaryHeadlightProjectors = true,
        enableNearFillProjectors = true,
        enableFacadeFillProjectors = true,
        enableTaillightPointLights = true,
        enableLegacyTaillightPods = false,
        enableTaillightSignature = true,
        enableTaillightHalo = true,
        enableReverseLights = true,
        accentLedColor = ACCENT_LED_COLOR,
        accentLedSecondaryColor = ACCENT_LED_SECONDARY_COLOR,
        accentBaseEmissive = 0.95,
        accentSpeedBoost = 1.25,
        accentPulseSpeed = 4.2,
        accentPulseDepth = 0.12,
        accentGlowOpacity = 0.1,
    } = lightConfig;
    const normalizedTaillightPositions =
        Array.isArray(taillightPositions) && taillightPositions.length > 0
            ? taillightPositions.map((entry, index) => {
                  const fallbackX = index === 0 ? -0.52 : 0.52;
                  const source = Array.isArray(entry?.position) ? entry.position : [];
                  return {
                      position: [
                          Number.isFinite(source[0]) ? source[0] : fallbackX,
                          Number.isFinite(source[1]) ? source[1] : 0.52,
                          Number.isFinite(source[2]) ? source[2] : 2.04,
                      ],
                  };
              })
            : [{ position: [-0.52, 0.52, 2.04] }, { position: [0.52, 0.52, 2.04] }];
    const headlightProjectorLights = [];
    const headlightLensMeshes = [];
    const headlightDrlEntries = [];
    const headlightStripHaloEntries = [];
    const headlightHaloEntries = [];
    const headlightGlassMaterials = [];
    const taillightPointLights = [];
    const taillightMeshes = [];
    const taillightCoreMaterials = [];
    const taillightSignatureSegments = [];
    const taillightHaloMaterials = [];
    const taillightPulseMaterials = [];
    const taillightSweepEntries = [];
    const reversePointLights = [];
    const reverseLensMaterials = [];
    const lightEditableParts = [];
    const lightState = {
        brakeLevel: 0,
        powerBlend: 1,
        regenLevel: 0,
        reverseBlend: 0,
        tailPhase: Math.random() * Math.PI * 2,
        tailSweepPhase: Math.random() * Math.PI * 2,
        headPhase: Math.random() * Math.PI * 2,
        headSweepPhase: Math.random() * Math.PI * 2,
    };
    const accentStripMaterials = [];
    const accentStripBaseColors = [];
    const accentGlowMaterials = [];
    const accentGlowBaseColors = [];
    const accentPulseOffsets = [];
    const accentChargeFlowMeshes = [];
    const accentChargeFlowMaterials = [];
    const accentChargeFlowOffsets = [];
    const accentState = { phase: Math.random() * Math.PI * 2 };
    const accentChargeColor = new THREE.Color(0x92f3ff);
    const accentChargeHotColor = new THREE.Color(0xe8feff);
    const accentChargeFlowTexture = createAccentChargeFlowTexture();
    const headlightSignatureTexture = createHeadlightSignatureTexture();
    const taillightFlowTexture = createTaillightSweepTexture();
    const headlightDrlColor = new THREE.Color(headlightColor).lerp(new THREE.Color(0xd6ecff), 0.34);
    const headlightHotColor = new THREE.Color(0xf5fbff);
    const taillightBaseColor = new THREE.Color(taillightColor);
    const taillightChargeColor = new THREE.Color(accentLedSecondaryColor).lerp(
        new THREE.Color(0xff90aa),
        0.42
    );
    const taillightHotColor = new THREE.Color(0xffb4c6);
    const headlightVisualGroupsBySide = {
        left: new THREE.Group(),
        right: new THREE.Group(),
    };
    const headlightBeamGroupsBySide = {
        left: new THREE.Group(),
        right: new THREE.Group(),
    };
    const headlightBeamRoleGroupsBySide = {
        left: {
            near: new THREE.Group(),
            facade: new THREE.Group(),
        },
        right: {
            near: new THREE.Group(),
            facade: new THREE.Group(),
        },
    };
    const headlightVisualPartsBySide = {
        left: null,
        right: null,
    };
    const taillightGroupsBySide = {
        left: new THREE.Group(),
        right: new THREE.Group(),
    };
    const taillightSignatureGroup = new THREE.Group();
    const reverseLightsGroup = new THREE.Group();
    const accentGroupsBySide = {
        left: new THREE.Group(),
        right: new THREE.Group(),
    };

    headlightVisualGroupsBySide.left.name = 'headlight_visual_left_group';
    headlightVisualGroupsBySide.right.name = 'headlight_visual_right_group';
    headlightBeamGroupsBySide.left.name = 'headlight_beam_left_group';
    headlightBeamGroupsBySide.right.name = 'headlight_beam_right_group';
    headlightBeamRoleGroupsBySide.left.near.name = 'headlight_beam_left_near_group';
    headlightBeamRoleGroupsBySide.left.facade.name = 'headlight_beam_left_facade_group';
    headlightBeamRoleGroupsBySide.right.near.name = 'headlight_beam_right_near_group';
    headlightBeamRoleGroupsBySide.right.facade.name = 'headlight_beam_right_facade_group';
    taillightGroupsBySide.left.name = 'taillight_left_group';
    taillightGroupsBySide.right.name = 'taillight_right_group';
    taillightSignatureGroup.name = 'taillight_signature_group';
    reverseLightsGroup.name = 'reverse_lights_group';
    accentGroupsBySide.left.name = 'accent_left_group';
    accentGroupsBySide.right.name = 'accent_right_group';
    car.add(
        headlightVisualGroupsBySide.left,
        headlightVisualGroupsBySide.right,
        headlightBeamGroupsBySide.left,
        headlightBeamGroupsBySide.right,
        taillightGroupsBySide.left,
        taillightGroupsBySide.right,
        taillightSignatureGroup,
        reverseLightsGroup,
        accentGroupsBySide.left,
        accentGroupsBySide.right
    );
    headlightBeamGroupsBySide.left.add(
        headlightBeamRoleGroupsBySide.left.near,
        headlightBeamRoleGroupsBySide.left.facade
    );
    headlightBeamGroupsBySide.right.add(
        headlightBeamRoleGroupsBySide.right.near,
        headlightBeamRoleGroupsBySide.right.facade
    );

    const resolveSideKey = (sideSign = 1) => (sideSign < 0 ? 'left' : 'right');
    const registerLightEditablePart = ({ id, label, sources, category = 'Lights' }) => {
        if (!id || !label) {
            return;
        }
        const resolvedSources = (Array.isArray(sources) ? sources : [sources]).filter(
            (source) => source && source.children && source.children.length > 0
        );
        if (resolvedSources.length === 0) {
            return;
        }
        lightEditableParts.push({
            id,
            label,
            category,
            sources: resolvedSources,
        });
    };

    const createSpot = ({
        color,
        intensity,
        distance,
        angle,
        penumbra,
        decay,
        position,
        target,
        sideSign = 1,
        role = 'primary',
        parent = car,
    }) => {
        const light = new THREE.SpotLight(color, intensity, distance, angle, penumbra, decay);
        light.position.set(...position);
        light.target.position.set(...target);
        light.castShadow = false;
        light.shadow.mapSize.set(512, 512);
        light.shadow.camera.near = 0.2;
        light.shadow.camera.far = Math.max(distance, 30);
        light.shadow.focus = 0.5;
        parent.add(light.target);
        parent.add(light);
        light.userData.baseIntensity = intensity;
        light.userData.baseDistance = distance;
        light.userData.sideSign = sideSign;
        light.userData.role = role;
        headlightProjectorLights.push(light);
        return light;
    };

    const createPoint = ({ color, intensity, distance, decay, position, parent = car }) => {
        const light = new THREE.PointLight(color, intensity, distance, decay);
        light.position.set(...position);
        light.castShadow = false;
        parent.add(light);
        return light;
    };

    const createLightMesh = (
        geometry,
        color,
        emissive,
        emissiveIntensity,
        position,
        rotation = null,
        parent = car
    ) => {
        const material = createMaterial({ color, emissive, emissiveIntensity });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...position);
        if (rotation) {
            mesh.rotation.set(...rotation);
        }
        parent.add(mesh);
        return mesh;
    };

    const createPremiumHeadlightAssembly = (position, sideSign, parent = car) => {
        const headlightGroup = new THREE.Group();
        headlightGroup.position.set(position[0], position[1], position[2] - 0.065);
        headlightGroup.rotation.y = sideSign * THREE.MathUtils.degToRad(4.8);
        parent.add(headlightGroup);

        const housingShellGroup = new THREE.Group();
        const lensCoverGroup = new THREE.Group();
        const signatureStripGroup = new THREE.Group();
        const haloGroup = new THREE.Group();
        headlightGroup.add(housingShellGroup, lensCoverGroup, signatureStripGroup, haloGroup);

        const housingMesh = new THREE.Mesh(
            createRoundedBoxGeometry(0.34, 0.116, 0.11, 0.03, 5),
            new THREE.MeshStandardMaterial({
                color: 0x070b10,
                emissive: 0x172230,
                emissiveIntensity: 0.24,
                metalness: 0.62,
                roughness: 0.2,
            })
        );
        housingMesh.position.set(0, 0, -0.004);
        housingShellGroup.add(housingMesh);

        const lensCoverMaterial = createMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 8.4,
            metalness: 0,
            roughness: 0.02,
            clearcoat: 0,
            clearcoatRoughness: 0,
        });
        lensCoverMaterial.transparent = true;
        lensCoverMaterial.opacity = 0.42;
        lensCoverMaterial.blending = THREE.AdditiveBlending;
        lensCoverMaterial.depthWrite = false;
        lensCoverMaterial.toneMapped = false;
        lensCoverMaterial.userData.baseOpacity = 0.42;
        lensCoverMaterial.userData.baseEmissiveIntensity = 8.4;
        const lensCover = new THREE.Mesh(
            createRoundedBoxGeometry(0.336, 0.112, 0.034, 0.02, 4),
            lensCoverMaterial
        );
        lensCover.position.set(0, 0.002, -0.058);
        lensCoverGroup.add(lensCover);
        headlightGlassMaterials.push(lensCoverMaterial);

        const signatureMaterial = new THREE.MeshStandardMaterial({
            color: 0x0e171f,
            emissive: headlightColor,
            emissiveIntensity: 6.8,
            metalness: 0.2,
            roughness: 0.22,
        });
        signatureMaterial.userData.baseEmissiveIntensity = 6.8;
        const signatureMesh = new THREE.Mesh(
            createRoundedBoxGeometry(0.168, 0.016, 0.009, 0.004, 3),
            signatureMaterial
        );
        signatureMesh.position.set(0, 0.004, -0.082);
        signatureStripGroup.add(signatureMesh);
        headlightLensMeshes.push(signatureMesh);
        headlightDrlEntries.push({
            material: signatureMaterial,
            sideSign,
            phaseOffset: sideSign < 0 ? 0.38 : 1.3,
        });

        const stripHaloMaterial = new THREE.MeshBasicMaterial({
            map: headlightSignatureTexture,
            color: 0xffffff,
            transparent: true,
            opacity: 0.92,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
            side: THREE.DoubleSide,
        });
        stripHaloMaterial.userData.baseOpacity = 0.92;
        const stripHaloMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.38, 0.13),
            stripHaloMaterial
        );
        stripHaloMesh.position.set(0, 0.0045, -0.087);
        stripHaloMesh.rotation.y = Math.PI;
        signatureStripGroup.add(stripHaloMesh);
        headlightStripHaloEntries.push({
            material: stripHaloMaterial,
            sideSign,
            phaseOffset: sideSign < 0 ? 0.56 : 1.52,
            intensity: 1,
        });

        const outerStripHaloMaterial = new THREE.MeshBasicMaterial({
            map: headlightSignatureTexture,
            color: 0xf8fcff,
            transparent: true,
            opacity: 0.62,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
            side: THREE.DoubleSide,
        });
        outerStripHaloMaterial.userData.baseOpacity = 0.62;
        const outerStripHaloMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.56, 0.21),
            outerStripHaloMaterial
        );
        outerStripHaloMesh.position.set(0, 0.0048, -0.091);
        outerStripHaloMesh.rotation.y = Math.PI;
        signatureStripGroup.add(outerStripHaloMesh);
        headlightStripHaloEntries.push({
            material: outerStripHaloMaterial,
            sideSign,
            phaseOffset: sideSign < 0 ? 1.04 : 2.06,
            intensity: 0.84,
        });

        const haloMaterial = new THREE.MeshBasicMaterial({
            map: headlightSignatureTexture,
            color: 0xdaeeff,
            transparent: true,
            opacity: 0.16,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
            side: THREE.DoubleSide,
        });
        const haloMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.128), haloMaterial);
        haloMesh.position.set(0, 0.011, -0.084);
        haloMesh.rotation.y = Math.PI;
        haloGroup.add(haloMesh);
        headlightHaloEntries.push({
            material: haloMaterial,
            baseOpacity: 0.16,
            phaseOffset: sideSign < 0 ? 0.18 : 1.12,
        });

        return {
            group: headlightGroup,
            housingShellGroup,
            lensCoverGroup,
            signatureStripGroup,
            haloGroup,
        };
    };

    // Headlights.
    headlightPositions.forEach(({ position, target }) => {
        const side = Math.sign(position[0]) || 1;
        const sideKey = resolveSideKey(side);
        const beamRoleGroups = headlightBeamRoleGroupsBySide[sideKey];

        if (enableHeadlightProjectors && enablePrimaryHeadlightProjectors) {
            if (enableNearFillProjectors) {
                createSpot({
                    color: headlightColor,
                    intensity: nearFillIntensity,
                    distance: nearFillDistance,
                    angle: nearFillAngle,
                    penumbra: nearFillPenumbra,
                    decay: headlightDecay,
                    position: [position[0], position[1] - 0.02, position[2]],
                    target: [target[0] * 0.7, 0.14, target[2] * 0.48],
                    sideSign: side,
                    role: 'near',
                    parent: beamRoleGroups.near,
                });
            }
            if (enableFacadeFillProjectors) {
                createSpot({
                    color: headlightColor,
                    intensity: facadeFillIntensity,
                    distance: facadeFillDistance,
                    angle: facadeFillAngle,
                    penumbra: facadeFillPenumbra,
                    decay: headlightDecay,
                    position: [position[0], position[1] + 0.02, position[2] + 0.06],
                    target: [
                        side * facadeFillLateralAim,
                        facadeFillVerticalAim,
                        -facadeFillForwardAim,
                    ],
                    sideSign: side,
                    role: 'facade',
                    parent: beamRoleGroups.facade,
                });
            }
        }
        headlightVisualPartsBySide[sideKey] = createPremiumHeadlightAssembly(
            position,
            side,
            headlightVisualGroupsBySide[sideKey]
        );
    });

    // Taillights.
    normalizedTaillightPositions.forEach(({ position }, taillightIndex) => {
        const sideSign =
            Math.sign(position[0]) ||
            (taillightIndex % 2 === 0 ? -1 : 1) ||
            (taillightIndex === 0 ? -1 : 1);
        const sideKey = resolveSideKey(sideSign);
        if (enableTaillightPointLights) {
            const taillight = createPoint({
                color: taillightColor,
                intensity: taillightIntensity,
                distance: taillightDistance,
                decay: taillightDecay,
                position,
                parent: taillightGroupsBySide[sideKey],
            });
            taillightPointLights.push(taillight);
        }
        if (enableLegacyTaillightPods) {
            const taillightLens = createLightMesh(
                createRoundedBoxGeometry(0.2, 0.095, 0.07, 0.014, 4),
                0x16070a,
                taillightColor,
                TAILLIGHT_RUNNING_EMISSIVE * 0.72,
                [position[0], position[1], position[2] + 0.006],
                null,
                taillightGroupsBySide[sideKey]
            );
            taillightLens.material.userData.sideSign = sideSign;
            taillightMeshes.push(taillightLens);
        }
    });
    createRearTaillightSignature();

    createAccentLighting();
    const registerHeadlightEditablePartsForSide = (sideKey) => {
        const sideLabel = sideKey === 'left' ? 'left' : 'right';
        const visualParts = headlightVisualPartsBySide[sideKey];
        const beamRoles = headlightBeamRoleGroupsBySide[sideKey];
        if (!visualParts || !beamRoles) {
            return;
        }

        registerLightEditablePart({
            id: `light_headlight_${sideLabel}_housing_shell`,
            label: `Headlight: ${sideLabel} housing shell`,
            sources: visualParts.housingShellGroup,
        });
        registerLightEditablePart({
            id: `light_headlight_${sideLabel}_lens_cover`,
            label: `Headlight: ${sideLabel} lens cover`,
            sources: visualParts.lensCoverGroup,
        });
        registerLightEditablePart({
            id: `light_headlight_${sideLabel}_led_strip`,
            label: `Headlight: ${sideLabel} LED strip`,
            sources: visualParts.signatureStripGroup,
        });
        registerLightEditablePart({
            id: `light_headlight_${sideLabel}_halo`,
            label: `Headlight: ${sideLabel} halo`,
            sources: visualParts.haloGroup,
        });
        registerLightEditablePart({
            id: `light_headlight_${sideLabel}_beam_near`,
            label: `Headlight: ${sideLabel} beam cast near-fill`,
            sources: beamRoles.near,
        });
        registerLightEditablePart({
            id: `light_headlight_${sideLabel}_beam_facade`,
            label: `Headlight: ${sideLabel} beam cast facade-fill`,
            sources: beamRoles.facade,
        });
    };
    registerHeadlightEditablePartsForSide('left');
    registerHeadlightEditablePartsForSide('right');
    registerLightEditablePart({
        id: 'light_taillight_left',
        label: 'Taillight: left',
        sources: taillightGroupsBySide.left,
    });
    registerLightEditablePart({
        id: 'light_taillight_right',
        label: 'Taillight: right',
        sources: taillightGroupsBySide.right,
    });
    registerLightEditablePart({
        id: 'light_taillight_signature',
        label: 'Taillight signature',
        sources: taillightSignatureGroup,
    });
    registerLightEditablePart({
        id: 'light_reverse',
        label: 'Reverse lights',
        sources: reverseLightsGroup,
    });
    registerLightEditablePart({
        id: 'light_accent_left',
        label: 'Accent lights: left',
        sources: accentGroupsBySide.left,
    });
    registerLightEditablePart({
        id: 'light_accent_right',
        label: 'Accent lights: right',
        sources: accentGroupsBySide.right,
    });
    applyBrakeLightLevel(0, 1, {}, 0, 0, 0);
    applyAccentLighting({}, 0);

    return {
        editableParts: lightEditableParts,
        update(vehicleState, deltaTime = 1 / 60) {
            const dt = Math.min(deltaTime, 0.05);
            const targetPower = vehicleState?.batteryDepleted ? 0 : 1;
            const powerResponse = targetPower > lightState.powerBlend ? 14 : 20;
            const powerBlend = 1 - Math.exp(-powerResponse * dt);
            lightState.powerBlend = THREE.MathUtils.lerp(
                lightState.powerBlend,
                targetPower,
                powerBlend
            );
            const brakeInput = THREE.MathUtils.clamp(vehicleState?.brake || 0, 0, 1);
            const targetBrakeLevel = brakeInput * lightState.powerBlend;
            const response = targetBrakeLevel > lightState.brakeLevel ? 18 : 10;
            const blend = 1 - Math.exp(-response * dt);
            lightState.brakeLevel = THREE.MathUtils.lerp(
                lightState.brakeLevel,
                targetBrakeLevel,
                blend
            );

            const speedAbs = Math.abs(vehicleState?.speed || 0);
            const throttleInput = vehicleState?.throttle || 0;
            const decelRatio = THREE.MathUtils.clamp(-(vehicleState?.acceleration || 0) / 24, 0, 1);
            const coastRatio = THREE.MathUtils.clamp((speedAbs - 1.5) / 30, 0, 1);
            const regenIntent = THREE.MathUtils.clamp((0.12 - throttleInput) / 0.62, 0, 1);
            const targetRegen =
                decelRatio *
                coastRatio *
                regenIntent *
                (1 - brakeInput * 0.95) *
                lightState.powerBlend;
            const regenResponse = targetRegen > lightState.regenLevel ? 14 : 8;
            const regenBlend = 1 - Math.exp(-regenResponse * dt);
            lightState.regenLevel = THREE.MathUtils.lerp(
                lightState.regenLevel,
                targetRegen,
                regenBlend
            );

            const reverseMotionRatio = THREE.MathUtils.clamp(
                (-(vehicleState?.speed || 0) - 0.2) / 1.6,
                0,
                1
            );
            const reverseThrottleRatio = THREE.MathUtils.clamp(
                (-(vehicleState?.throttle || 0) - 0.04) / 0.52,
                0,
                1
            );
            const reverseTarget =
                Math.max(reverseMotionRatio, reverseThrottleRatio) *
                (1 - brakeInput * 0.9) *
                lightState.powerBlend;
            const reverseResponse = reverseTarget > lightState.reverseBlend ? 12 : 16;
            const reverseBlend = 1 - Math.exp(-reverseResponse * dt);
            lightState.reverseBlend = THREE.MathUtils.lerp(
                lightState.reverseBlend,
                reverseTarget,
                reverseBlend
            );

            applyHeadlightPower(lightState.powerBlend, vehicleState, dt);
            applyBrakeLightLevel(
                lightState.brakeLevel,
                lightState.powerBlend,
                vehicleState,
                dt,
                lightState.regenLevel,
                lightState.reverseBlend
            );
            applyAccentLighting(vehicleState, dt, lightState.powerBlend);
        },
    };

    function applyHeadlightPower(powerBlend = 1, vehicleState = {}, dt = 1 / 60) {
        const clampedPower = THREE.MathUtils.clamp(powerBlend, 0, 1);
        const speedRatio = THREE.MathUtils.clamp(Math.abs(vehicleState?.speed || 0) / 62, 0, 1);
        const throttleRatio = THREE.MathUtils.clamp(Math.abs(vehicleState?.throttle || 0), 0, 1);
        const steerInput = THREE.MathUtils.clamp(vehicleState?.steerInput || 0, -1, 1);
        const steerAbs = Math.abs(steerInput);

        lightState.headPhase += dt * (2.9 + speedRatio * 2.4 + throttleRatio * 1.4);
        lightState.headSweepPhase += dt * (1.8 + speedRatio * 2.7 + steerAbs * 2.1);

        headlightProjectorLights.forEach((light) => {
            const baseIntensity = Number(light?.userData?.baseIntensity) || 0;
            const baseDistance = Number(light?.userData?.baseDistance) || light.distance || 0;
            const sideSign = Number(light?.userData?.sideSign) || 1;
            const role = light?.userData?.role || 'primary';
            const cornerMatch = sideSign * steerInput;
            let roleBoost = 1;
            if (role === 'near') {
                roleBoost =
                    0.82 + Math.max(0, cornerMatch) * 0.46 - Math.max(0, -cornerMatch) * 0.12;
            } else if (role === 'facade') {
                roleBoost =
                    0.76 + Math.max(0, cornerMatch) * 0.62 - Math.max(0, -cornerMatch) * 0.24;
            } else {
                roleBoost = 0.94 + speedRatio * 0.12;
            }
            roleBoost = THREE.MathUtils.clamp(roleBoost, 0.45, 1.85);
            const shimmer = 0.96 + 0.04 * Math.sin(lightState.headPhase + sideSign * 0.7);
            const distanceBoost = THREE.MathUtils.clamp(
                0.86 + speedRatio * 0.2 + (role === 'facade' ? steerAbs * 0.08 : 0),
                0.64,
                1.2
            );
            light.intensity = baseIntensity * clampedPower * roleBoost * shimmer;
            light.distance = baseDistance * clampedPower * distanceBoost;
        });
        headlightLensMeshes.forEach((mesh) => {
            const baseEmissive = Number(mesh?.material?.userData?.baseEmissiveIntensity) || 0;
            mesh.material.emissiveIntensity = baseEmissive * clampedPower;
        });

        headlightDrlEntries.forEach((entry) => {
            const wave =
                0.5 +
                0.5 *
                    Math.sin(
                        lightState.headSweepPhase * 2.25 +
                            entry.phaseOffset +
                            steerInput * entry.sideSign
                    );
            const activity = 0.82 + speedRatio * 0.28 + steerAbs * 0.18 + wave * 0.26;
            entry.material.emissiveIntensity =
                (Number(entry.material.userData.baseEmissiveIntensity) || 0) *
                activity *
                clampedPower;
            entry.material.emissive.copy(headlightDrlColor).lerp(headlightHotColor, wave * 0.42);
        });

        headlightStripHaloEntries.forEach((entry) => {
            const wave =
                0.5 +
                0.5 *
                    Math.sin(
                        lightState.headSweepPhase * 2.4 +
                            entry.phaseOffset +
                            steerInput * entry.sideSign * 0.85
                    );
            const baseOpacity = Number(entry.material?.userData?.baseOpacity) || 0.58;
            const intensity = Number.isFinite(entry.intensity) ? entry.intensity : 1;
            entry.material.opacity = THREE.MathUtils.clamp(
                baseOpacity *
                    (1.24 + wave * 1.38) *
                    (1.08 + clampedPower * 1.18 + speedRatio * 0.74) *
                    intensity,
                0,
                1
            );
            entry.material.color.copy(headlightHotColor);
        });

        headlightHaloEntries.forEach((entry) => {
            const wave = 0.5 + 0.5 * Math.sin(lightState.headPhase * 1.15 + entry.phaseOffset);
            entry.material.opacity =
                entry.baseOpacity * (0.7 + speedRatio * 0.34 + wave * 0.42) * clampedPower;
        });

        headlightGlassMaterials.forEach((material) => {
            const baseOpacity = Number(material?.userData?.baseOpacity) || 0;
            const baseEmissive = Number(material?.userData?.baseEmissiveIntensity) || 8.4;
            material.opacity = baseOpacity * (0.46 + clampedPower * 0.54 + speedRatio * 0.12);
            material.emissiveIntensity =
                baseEmissive * (0.92 + clampedPower * 1.1 + speedRatio * 0.34);
        });
    }

    function applyBrakeLightLevel(
        level,
        powerBlend = 1,
        vehicleState = {},
        dt = 1 / 60,
        regenLevel = 0,
        reverseBlend = 0
    ) {
        const brakeLevel = THREE.MathUtils.clamp(level, 0, 1);
        const clampedPower = THREE.MathUtils.clamp(powerBlend, 0, 1);
        const regenRatio = THREE.MathUtils.clamp(regenLevel, 0, 1);
        const reverseRatio = THREE.MathUtils.clamp(reverseBlend, 0, 1);
        const chargingRatio = THREE.MathUtils.clamp(
            vehicleState?.chargingLevelNormalized || 0,
            0,
            1
        );
        const speedRatio = THREE.MathUtils.clamp(Math.abs(vehicleState?.speed || 0) / 62, 0, 1);
        const effectiveBrakeLevel = THREE.MathUtils.clamp(
            Math.max(brakeLevel, regenRatio * 0.64),
            0,
            1
        );

        lightState.tailPhase += dt * (2.6 + effectiveBrakeLevel * 6.5 + regenRatio * 2.2);
        lightState.tailSweepPhase +=
            dt * (1.5 + chargingRatio * 3.8 + regenRatio * 2.6 + speedRatio);

        const pointIntensity =
            taillightIntensity *
            THREE.MathUtils.lerp(
                TAILLIGHT_RUNNING_LIGHT_FACTOR,
                TAILLIGHT_BRAKE_LIGHT_FACTOR,
                effectiveBrakeLevel
            ) *
            (1 + regenRatio * 0.22) *
            clampedPower;
        const pointDistance =
            taillightDistance *
            THREE.MathUtils.lerp(
                TAILLIGHT_RUNNING_DISTANCE_FACTOR,
                TAILLIGHT_BRAKE_DISTANCE_FACTOR,
                effectiveBrakeLevel
            ) *
            (1 + regenRatio * 0.06) *
            clampedPower;
        const lensEmissive =
            THREE.MathUtils.lerp(
                TAILLIGHT_RUNNING_EMISSIVE,
                TAILLIGHT_BRAKE_EMISSIVE,
                effectiveBrakeLevel
            ) * clampedPower;

        taillightPointLights.forEach((light) => {
            light.intensity = pointIntensity;
            light.distance = pointDistance;
        });
        taillightMeshes.forEach((mesh, index) => {
            const sideSign = Number(mesh?.material?.userData?.sideSign) || (index === 0 ? -1 : 1);
            const wave =
                0.5 + 0.5 * Math.sin(lightState.tailPhase * 1.4 + sideSign * 0.9 + index * 0.5);
            const heat = chargingRatio * (0.18 + wave * 0.24) + regenRatio * 0.2;
            mesh.material.emissiveIntensity =
                lensEmissive +
                (effectiveBrakeLevel * 0.18 + regenRatio * 0.24 + chargingRatio * 0.16) *
                    wave *
                    clampedPower;
            mesh.material.emissive.copy(taillightBaseColor).lerp(taillightHotColor, heat);
        });

        taillightCoreMaterials.forEach((material, index) => {
            const wave =
                0.5 +
                0.5 * Math.sin(lightState.tailPhase * 1.1 + index * 0.62 + chargingRatio * 0.4);
            const chargeWave = 0.5 + 0.5 * Math.sin(lightState.tailSweepPhase * 1.7 + index * 1.1);
            material.emissiveIntensity =
                (0.38 +
                    effectiveBrakeLevel * 1.72 +
                    regenRatio * (0.24 + wave * 0.48) +
                    speedRatio * 0.14 +
                    chargingRatio * (0.25 + chargeWave * 0.92)) *
                clampedPower;
            material.emissive
                .copy(taillightBaseColor)
                .lerp(
                    taillightChargeColor,
                    chargingRatio * (0.44 + chargeWave * 0.34) + regenRatio * 0.18
                );
        });

        taillightSignatureSegments.forEach((entry) => {
            const segmentNorm =
                entry.segmentCount <= 1
                    ? 0
                    : THREE.MathUtils.clamp(entry.segmentIndex / (entry.segmentCount - 1), 0, 1);
            const innerBoost = 1 - segmentNorm * 0.5;
            const sweepWave =
                0.5 +
                0.5 *
                    Math.sin(
                        lightState.tailPhase * (1.45 + effectiveBrakeLevel * 0.48) +
                            entry.phaseOffset
                    );
            const chargeWave =
                0.5 +
                0.5 *
                    Math.sin(
                        lightState.tailSweepPhase * 2.2 +
                            entry.phaseOffset * 1.8 +
                            entry.sideSign * 0.75
                    );
            entry.material.emissiveIntensity =
                (0.34 +
                    effectiveBrakeLevel * (1.45 + innerBoost * 0.72) +
                    regenRatio * (0.34 + sweepWave * 0.82) +
                    speedRatio * 0.1 +
                    chargingRatio * (0.26 + chargeWave * 1.18)) *
                clampedPower;
            entry.material.emissive
                .copy(taillightBaseColor)
                .lerp(
                    taillightChargeColor,
                    chargingRatio * (0.36 + chargeWave * 0.44) + regenRatio * 0.2
                );
        });

        taillightHaloMaterials.forEach((material, index) => {
            const wave =
                0.5 +
                0.5 * Math.sin(lightState.tailPhase * 0.9 + index * 1.6 + chargingRatio * 0.7);
            material.opacity =
                (0.018 +
                    effectiveBrakeLevel * 0.14 +
                    regenRatio * 0.09 +
                    chargingRatio * (0.05 + wave * 0.18)) *
                clampedPower;
            material.color
                .copy(taillightBaseColor)
                .lerp(taillightChargeColor, chargingRatio * 0.52 + regenRatio * 0.2);
        });

        taillightPulseMaterials.forEach((entry, index) => {
            const wave =
                0.5 +
                0.5 *
                    Math.sin(
                        lightState.tailSweepPhase * (1.75 + chargingRatio * 0.52) +
                            entry.phaseOffset +
                            index * 0.6
                    );
            entry.material.opacity =
                (effectiveBrakeLevel * 0.2 +
                    regenRatio * (0.1 + wave * 0.14) +
                    chargingRatio * (0.06 + wave * 0.24)) *
                entry.weight *
                clampedPower;
            entry.material.color
                .copy(taillightHotColor)
                .lerp(taillightChargeColor, chargingRatio * (0.56 + wave * 0.24));
        });

        const sweepActivation = Math.max(chargingRatio, regenRatio * 0.52);
        taillightSweepEntries.forEach((entry, index) => {
            const chargingDominant = chargingRatio >= regenRatio;
            const phase =
                lightState.tailSweepPhase * (chargingDominant ? 1 : 1.45) +
                entry.phaseOffset +
                index * 0.35;
            const sweep = Math.sin(phase);
            const flowPulse = 0.5 + 0.5 * Math.sin(phase * 1.73);
            entry.mesh.visible = sweepActivation > 0.03 && clampedPower > 0.01;
            entry.mesh.position.x =
                entry.centerX + sweep * entry.travelHalfRange * (chargingDominant ? 1 : -1);
            entry.mesh.scale.x = 0.72 + sweepActivation * (0.22 + flowPulse * 0.56);
            entry.mesh.scale.y = 0.9 + sweepActivation * (0.2 + flowPulse * 0.24);
            entry.material.opacity = sweepActivation * (0.08 + flowPulse * 0.44) * clampedPower;
            entry.material.color
                .copy(chargingDominant ? taillightChargeColor : taillightHotColor)
                .lerp(taillightHotColor, flowPulse * 0.55);
        });

        const reversePulse = 0.5 + 0.5 * Math.sin(lightState.tailPhase * 2.4 + 0.42);
        reverseLensMaterials.forEach((material, index) => {
            const sidePulse = 0.5 + 0.5 * Math.sin(lightState.tailPhase * 2.1 + index * 1.4);
            material.emissiveIntensity =
                reverseRatio * (1.18 + reversePulse * 0.52 + sidePulse * 0.28) * clampedPower;
        });
        reversePointLights.forEach((light, index) => {
            const sidePulse = 0.5 + 0.5 * Math.sin(lightState.tailPhase * 2.2 + index * 1.1);
            light.intensity =
                reverseLightIntensity * reverseRatio * (0.78 + sidePulse * 0.42) * clampedPower;
            light.distance = reverseLightDistance * (0.7 + reverseRatio * 0.42);
        });
    }

    function createRearTaillightSignature() {
        if (!enableTaillightSignature || normalizedTaillightPositions.length === 0) {
            return;
        }

        let leftEdge = Number.POSITIVE_INFINITY;
        let rightEdge = Number.NEGATIVE_INFINITY;
        let centerYSum = 0;
        let centerZSum = 0;
        normalizedTaillightPositions.forEach(({ position }) => {
            leftEdge = Math.min(leftEdge, position[0]);
            rightEdge = Math.max(rightEdge, position[0]);
            centerYSum += position[1];
            centerZSum += position[2];
        });
        const count = normalizedTaillightPositions.length;
        const centerX = (leftEdge + rightEdge) * 0.5;
        const spanX = Math.max(0.2, rightEdge - leftEdge);
        const centerY = centerYSum / count + 0.004;
        const centerZ = centerZSum / count + 0.01;
        const barWidth = THREE.MathUtils.clamp(spanX + 0.16, 0.86, 1.22);
        const barMaterial = new THREE.MeshStandardMaterial({
            color: 0x14070b,
            emissive: taillightColor,
            emissiveIntensity: TAILLIGHT_RUNNING_EMISSIVE * 0.75,
            metalness: 0.5,
            roughness: 0.16,
        });
        const barMesh = new THREE.Mesh(
            createRoundedBoxGeometry(barWidth, 0.044, 0.048, 0.016, 4),
            barMaterial
        );
        barMesh.position.set(centerX, centerY, centerZ);
        taillightSignatureGroup.add(barMesh);
        taillightCoreMaterials.push(barMaterial);

        const divider = new THREE.Mesh(
            createRoundedBoxGeometry(0.014, 0.038, 0.018, 0.006, 3),
            new THREE.MeshStandardMaterial({
                color: 0x11090d,
                emissive: 0x2a1218,
                emissiveIntensity: 0.22,
                metalness: 0.42,
                roughness: 0.28,
            })
        );
        divider.position.set(centerX, centerY, centerZ + 0.024);
        taillightSignatureGroup.add(divider);

        const segmentCount = Math.max(3, Math.floor(taillightSegmentCount));
        const halfWidth = barWidth * 0.5;
        const edgePadding = Math.max(0.06, Math.min(0.12, halfWidth * 0.18));
        const segmentRegion = Math.max(0.18, halfWidth - edgePadding);
        const segmentStep = segmentRegion / segmentCount;
        const centerOffset = 0.045;
        for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
            const sideSign = sideIndex === 0 ? -1 : 1;
            for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
                const segmentWidth = Math.max(0.045, Math.min(0.105, segmentStep * 0.62));
                const segmentHeight = 0.021 + (segmentCount - segmentIndex) * 0.0015;
                const segmentDepth = 0.024;
                const segmentMaterial = new THREE.MeshStandardMaterial({
                    color: 0x12080c,
                    emissive: taillightColor,
                    emissiveIntensity: TAILLIGHT_RUNNING_EMISSIVE * 0.58,
                    metalness: 0.36,
                    roughness: 0.22,
                });
                const segmentMesh = new THREE.Mesh(
                    createRoundedBoxGeometry(segmentWidth, segmentHeight, segmentDepth, 0.012, 4),
                    segmentMaterial
                );
                const segmentX =
                    centerX + sideSign * (centerOffset + segmentStep * (segmentIndex + 0.5));
                segmentMesh.position.set(
                    segmentX,
                    centerY + 0.002 + segmentIndex * 0.0008,
                    centerZ + 0.033
                );
                segmentMesh.rotation.y =
                    sideSign * THREE.MathUtils.degToRad(2.1 + segmentIndex * 0.9);
                taillightSignatureGroup.add(segmentMesh);

                taillightSignatureSegments.push({
                    material: segmentMaterial,
                    sideSign,
                    segmentIndex,
                    segmentCount,
                    phaseOffset: segmentIndex * 0.34 + (sideSign < 0 ? 0.25 : 1.16),
                });
            }
        }

        if (enableTaillightHalo) {
            const haloMaterial = new THREE.MeshBasicMaterial({
                color: taillightColor,
                transparent: true,
                opacity: taillightHaloOpacity,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                toneMapped: false,
            });
            const haloMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(barWidth * 1.02, 0.12),
                haloMaterial
            );
            haloMesh.position.set(centerX, centerY + 0.0015, centerZ + 0.056);
            taillightSignatureGroup.add(haloMesh);
            taillightHaloMaterials.push(haloMaterial);
        }

        const pulseLayouts = [
            { width: barWidth * 0.22, height: 0.019, weight: 1, phaseOffset: 0.8 },
            { width: barWidth * 0.38, height: 0.015, weight: 0.72, phaseOffset: 1.6 },
        ];
        pulseLayouts.forEach(({ width, height, weight, phaseOffset }, pulseIndex) => {
            const pulseMaterial = new THREE.MeshBasicMaterial({
                color: taillightColor,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                toneMapped: false,
            });
            const pulseMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), pulseMaterial);
            pulseMesh.position.set(centerX, centerY + 0.001, centerZ + 0.057 + pulseIndex * 0.0008);
            taillightSignatureGroup.add(pulseMesh);
            taillightPulseMaterials.push({ material: pulseMaterial, weight, phaseOffset });
        });

        const sweepMaterial = new THREE.MeshBasicMaterial({
            map: taillightFlowTexture,
            color: 0xff6f85,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
            side: THREE.DoubleSide,
        });
        const sweepMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(barWidth * 0.2, 0.078),
            sweepMaterial
        );
        sweepMesh.position.set(centerX, centerY + 0.001, centerZ + 0.058);
        sweepMesh.visible = false;
        taillightSignatureGroup.add(sweepMesh);
        taillightSweepEntries.push({
            mesh: sweepMesh,
            material: sweepMaterial,
            centerX,
            travelHalfRange:
                barWidth * 0.5 * THREE.MathUtils.clamp(taillightSweepTravel, 0.18, 0.65),
            phaseOffset: 0.4,
        });

        if (!enableReverseLights) {
            return;
        }
        const reverseXOffset = Math.max(
            0.24,
            Math.min(0.48, Math.abs(rightEdge - leftEdge) * 0.38 + 0.11)
        );
        for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
            const sideSign = sideIndex === 0 ? -1 : 1;
            const reverseMaterial = createMaterial({
                color: 0x161c25,
                emissive: 0xf7fbff,
                emissiveIntensity: 0,
                metalness: 0.2,
                roughness: 0.18,
                clearcoat: 1,
                clearcoatRoughness: 0.07,
            });
            const reverseMesh = new THREE.Mesh(
                createRoundedBoxGeometry(0.11, 0.024, 0.024, 0.008, 4),
                reverseMaterial
            );
            reverseMesh.position.set(
                centerX + sideSign * reverseXOffset,
                centerY - 0.009,
                centerZ + 0.035
            );
            reverseMesh.rotation.y = sideSign * THREE.MathUtils.degToRad(2.8);
            reverseLightsGroup.add(reverseMesh);
            reverseLensMaterials.push(reverseMaterial);

            const reversePoint = createPoint({
                color: 0xf4f9ff,
                intensity: 0,
                distance: reverseLightDistance,
                decay: reverseLightDecay,
                position: [centerX + sideSign * reverseXOffset, centerY - 0.012, centerZ + 0.01],
                parent: reverseLightsGroup,
            });
            reversePointLights.push(reversePoint);
        }
    }

    function createAccentLighting() {
        const bodyCoreHalfWidth = 1.22 * 0.5;
        const sideStripThickness = 0.016;
        const sideStripOutset = 0.04;
        const sideStripX = bodyCoreHalfWidth + sideStripThickness * 0.5 + sideStripOutset;
        const stripLayouts = [
            {
                size: [sideStripThickness, 0.022, 2.88],
                position: [-sideStripX, 0.43, 0.03],
                color: accentLedColor,
                pulseOffset: 0.2,
                glowAxis: 'z',
            },
            {
                size: [sideStripThickness, 0.022, 2.88],
                position: [sideStripX, 0.43, 0.03],
                color: accentLedColor,
                pulseOffset: 1.4,
                glowAxis: 'z',
            },
        ];

        stripLayouts.forEach(({ size, position, color, pulseOffset, glowAxis }) => {
            const parentGroup =
                position[0] < -0.001
                    ? accentGroupsBySide.left
                    : position[0] > 0.001
                      ? accentGroupsBySide.right
                      : car;
            const stripMaterial = new THREE.MeshStandardMaterial({
                color: 0x0b121a,
                emissive: color,
                emissiveIntensity: accentBaseEmissive,
                metalness: 0.25,
                roughness: 0.28,
            });
            const stripMesh = new THREE.Mesh(
                new THREE.BoxGeometry(size[0], size[1], size[2]),
                stripMaterial
            );
            stripMesh.position.set(...position);
            stripMesh.castShadow = false;
            stripMesh.receiveShadow = false;
            parentGroup.add(stripMesh);

            const glowMaterial = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: accentGlowOpacity,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                toneMapped: false,
            });
            if (glowAxis !== 'z') {
                const glowGeometry = new THREE.PlaneGeometry(size[0] * 1.12, size[1] * 5.4);
                const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
                glowMesh.position.copy(stripMesh.position);
                glowMesh.position.z += Math.sign(position[2]) * 0.007;
                parentGroup.add(glowMesh);
            }

            if (glowAxis === 'z') {
                const flowMaterial = new THREE.MeshBasicMaterial({
                    map: accentChargeFlowTexture,
                    color: 0xbdf8ff,
                    transparent: true,
                    opacity: 0,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    toneMapped: false,
                    side: THREE.DoubleSide,
                });
                const flowMesh = new THREE.Mesh(
                    new THREE.PlaneGeometry(size[2] * 0.34, size[1] * 6.2),
                    flowMaterial
                );
                flowMesh.position.copy(stripMesh.position);
                flowMesh.position.x += Math.sign(position[0]) * 0.015;
                flowMesh.position.z = stripMesh.position.z - size[2] * 0.42;
                flowMesh.rotation.y = Math.PI / 2;
                flowMesh.visible = false;
                parentGroup.add(flowMesh);

                accentChargeFlowMeshes.push({
                    mesh: flowMesh,
                    baseZ: stripMesh.position.z,
                    travelHalfRange: size[2] * 0.44,
                    sideSign: Math.sign(position[0]) || 1,
                });
                accentChargeFlowMaterials.push(flowMaterial);
                accentChargeFlowOffsets.push(pulseOffset * 1.38);
            }

            accentStripMaterials.push(stripMaterial);
            accentStripBaseColors.push(new THREE.Color(color));
            accentGlowMaterials.push(glowMaterial);
            accentGlowBaseColors.push(new THREE.Color(color));
            accentPulseOffsets.push(pulseOffset);
        });
    }

    function applyAccentLighting(vehicleState, dt, powerBlend = 1) {
        const clampedPower = THREE.MathUtils.clamp(powerBlend, 0, 1);
        const speedRatio = THREE.MathUtils.clamp(Math.abs(vehicleState?.speed || 0) / 58, 0, 1);
        const throttleRatio = THREE.MathUtils.clamp(Math.abs(vehicleState?.throttle || 0), 0, 1);
        const steerRatio = THREE.MathUtils.clamp(Math.abs(vehicleState?.steerInput || 0), 0, 1);
        const burnoutRatio = THREE.MathUtils.clamp(
            vehicleState?.burnout || vehicleState?.launchSlip || 0,
            0,
            1
        );
        const chargingRatio = THREE.MathUtils.clamp(
            vehicleState?.chargingLevelNormalized || 0,
            0,
            1
        );
        const chargingBoost = chargingRatio * chargingRatio;
        const activity = THREE.MathUtils.clamp(
            speedRatio * 0.72 + throttleRatio * 0.24 + steerRatio * 0.12 + burnoutRatio * 0.35,
            0,
            1.5
        );

        accentState.phase += dt * accentPulseSpeed * (1 + activity * 0.28 + chargingBoost * 0.86);

        accentStripMaterials.forEach((material, index) => {
            const wave = 0.5 + 0.5 * Math.sin(accentState.phase + accentPulseOffsets[index]);
            const pulse = 1 + (wave - 0.5) * 2 * accentPulseDepth;
            const chargeWave =
                0.5 + 0.5 * Math.sin(accentState.phase * 2.22 + accentPulseOffsets[index] * 1.64);
            material.emissiveIntensity =
                (accentBaseEmissive * pulse +
                    activity * accentSpeedBoost +
                    chargingBoost * (0.6 + chargeWave * 1.1)) *
                clampedPower;
            material.emissive
                .copy(accentStripBaseColors[index])
                .lerp(accentChargeHotColor, chargingBoost * (0.34 + chargeWave * 0.56));
        });

        accentGlowMaterials.forEach((material, index) => {
            const wave = 0.5 + 0.5 * Math.sin(accentState.phase + accentPulseOffsets[index] + 0.3);
            const chargeWave =
                0.5 + 0.5 * Math.sin(accentState.phase * 2.7 + accentPulseOffsets[index] * 1.9);
            material.opacity =
                accentGlowOpacity *
                (0.84 + wave * 0.42) *
                (1 + activity * 0.38 + chargingBoost * (0.84 + chargeWave * 0.84)) *
                clampedPower;
            material.color
                .copy(accentGlowBaseColors[index])
                .lerp(accentChargeColor, chargingBoost * (0.52 + chargeWave * 0.36));
        });

        accentChargeFlowMeshes.forEach((entry, index) => {
            const material = accentChargeFlowMaterials[index];
            const flowPhase =
                accentState.phase * (1.62 + chargingBoost * 2.1) + accentChargeFlowOffsets[index];
            const flowTravel = Math.sin(flowPhase) * entry.travelHalfRange * -entry.sideSign;
            const flowPulse = 0.5 + 0.5 * Math.sin(flowPhase * 1.82);

            entry.mesh.visible = chargingBoost > 0.01 && clampedPower > 0.01;
            entry.mesh.position.z = entry.baseZ + flowTravel;
            entry.mesh.scale.x = 0.72 + chargingBoost * (0.24 + flowPulse * 0.52);
            entry.mesh.scale.y = 0.9 + chargingBoost * (0.22 + flowPulse * 0.26);
            material.opacity = chargingBoost * (0.12 + flowPulse * 0.5) * clampedPower;
            material.color
                .copy(accentChargeColor)
                .lerp(accentChargeHotColor, 0.38 + flowPulse * 0.62);
        });
    }
}

export { addLightsToCar };
