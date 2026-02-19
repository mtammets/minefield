import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

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
    const taillightPointLights = [];
    const taillightMeshes = [];
    const taillightCoreMaterials = [];
    const taillightSignatureSegments = [];
    const taillightHaloMaterials = [];
    const taillightPulseMaterials = [];
    const taillightSweepEntries = [];
    const reversePointLights = [];
    const reverseLensMaterials = [];
    const lightState = {
        brakeLevel: 0,
        powerBlend: 1,
        regenLevel: 0,
        reverseBlend: 0,
        tailPhase: Math.random() * Math.PI * 2,
        tailSweepPhase: Math.random() * Math.PI * 2,
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
    const taillightFlowTexture = createTaillightSweepTexture();
    const taillightBaseColor = new THREE.Color(taillightColor);
    const taillightChargeColor = new THREE.Color(accentLedSecondaryColor).lerp(
        new THREE.Color(0xff90aa),
        0.42
    );
    const taillightHotColor = new THREE.Color(0xffb4c6);

    const createSpot = ({
        color,
        intensity,
        distance,
        angle,
        penumbra,
        decay,
        position,
        target,
    }) => {
        const light = new THREE.SpotLight(color, intensity, distance, angle, penumbra, decay);
        light.position.set(...position);
        light.target.position.set(...target);
        light.castShadow = false;
        light.shadow.mapSize.set(512, 512);
        light.shadow.camera.near = 0.2;
        light.shadow.camera.far = Math.max(distance, 30);
        light.shadow.focus = 0.5;
        car.add(light.target);
        car.add(light);
        light.userData.baseIntensity = intensity;
        light.userData.baseDistance = distance;
        headlightProjectorLights.push(light);
        return light;
    };

    const createPoint = ({ color, intensity, distance, decay, position }) => {
        const light = new THREE.PointLight(color, intensity, distance, decay);
        light.position.set(...position);
        light.castShadow = false;
        car.add(light);
        return light;
    };

    const createLightMesh = (
        geometry,
        color,
        emissive,
        emissiveIntensity,
        position,
        rotation = null
    ) => {
        const material = createMaterial({ color, emissive, emissiveIntensity });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...position);
        if (rotation) {
            mesh.rotation.set(...rotation);
        }
        car.add(mesh);
        return mesh;
    };

    // Headlights.
    headlightPositions.forEach(({ position, target }) => {
        const side = Math.sign(position[0]) || 1;

        if (enableHeadlightProjectors && enablePrimaryHeadlightProjectors) {
            createSpot({
                color: headlightColor,
                intensity: headlightIntensity,
                distance: headlightDistance,
                angle: headlightAngle,
                penumbra: headlightPenumbra,
                decay: headlightDecay,
                position,
                target,
            });
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
                });
            }
        }
        const headlightLens = createLightMesh(
            new THREE.BoxGeometry(0.22, 0.1, 0.08),
            headlightColor,
            headlightColor,
            3.1,
            [position[0], position[1], position[2] - 0.05]
        );
        headlightLens.material.userData.baseEmissiveIntensity = 3.1;
        headlightLensMeshes.push(headlightLens);
    });

    // Taillights.
    normalizedTaillightPositions.forEach(({ position }, taillightIndex) => {
        const sideSign =
            Math.sign(position[0]) ||
            (taillightIndex % 2 === 0 ? -1 : 1) ||
            (taillightIndex === 0 ? -1 : 1);
        if (enableTaillightPointLights) {
            const taillight = createPoint({
                color: taillightColor,
                intensity: taillightIntensity,
                distance: taillightDistance,
                decay: taillightDecay,
                position,
            });
            taillightPointLights.push(taillight);
        }
        if (enableLegacyTaillightPods) {
            const taillightLens = createLightMesh(
                createRoundedBoxGeometry(0.2, 0.095, 0.07, 0.014, 4),
                0x16070a,
                taillightColor,
                TAILLIGHT_RUNNING_EMISSIVE * 0.72,
                [position[0], position[1], position[2] + 0.006]
            );
            taillightLens.material.userData.sideSign = sideSign;
            taillightMeshes.push(taillightLens);
        }
    });
    createRearTaillightSignature();

    createAccentLighting();
    applyBrakeLightLevel(0, 1, {}, 0, 0, 0);
    applyAccentLighting({}, 0);

    return {
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

            applyHeadlightPower(lightState.powerBlend);
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

    function applyHeadlightPower(powerBlend = 1) {
        const clampedPower = THREE.MathUtils.clamp(powerBlend, 0, 1);
        headlightProjectorLights.forEach((light) => {
            const baseIntensity = Number(light?.userData?.baseIntensity) || 0;
            const baseDistance = Number(light?.userData?.baseDistance) || light.distance || 0;
            light.intensity = baseIntensity * clampedPower;
            light.distance = baseDistance * clampedPower;
        });
        headlightLensMeshes.forEach((mesh) => {
            const baseEmissive = Number(mesh?.material?.userData?.baseEmissiveIntensity) || 0;
            mesh.material.emissiveIntensity = baseEmissive * clampedPower;
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
        car.add(barMesh);
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
        car.add(divider);

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
                car.add(segmentMesh);

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
            car.add(haloMesh);
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
            car.add(pulseMesh);
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
        car.add(sweepMesh);
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
            car.add(reverseMesh);
            reverseLensMaterials.push(reverseMaterial);

            const reversePoint = createPoint({
                color: 0xf4f9ff,
                intensity: 0,
                distance: reverseLightDistance,
                decay: reverseLightDecay,
                position: [centerX + sideSign * reverseXOffset, centerY - 0.012, centerZ + 0.01],
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
            {
                size: [0.64, 0.018, 0.016],
                position: [0, 0.54, -1.94],
                color: accentLedColor,
                pulseOffset: 2.2,
                glowAxis: 'x',
            },
        ];

        stripLayouts.forEach(({ size, position, color, pulseOffset, glowAxis }) => {
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
            car.add(stripMesh);

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
                car.add(glowMesh);
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
                car.add(flowMesh);

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

// Build the main luxury body shell and editable assemblies.
function addLuxuryBody(car, bodyConfig = {}) {
    const {
        bodyColor = 0x2d67a6,
        bodyDimensions = DEFAULT_BODY_DIMENSIONS,
        wheelPositions = DEFAULT_WHEEL_POSITIONS,
        displayName = 'MAREK',
        rearModelName = REAR_MODEL_NAME,
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
        bodyPanelMaterials.push(panelMaterial);

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
    const wirelessChargeMarker = addUnderbodyWirelessChargeMarker(bodyShellGroup, bodyDimensions);
    const roofBrandingController = addVoltlineRoofBranding(
        roofAssemblyGroup,
        bodyDimensions,
        ROOF_BRAND_NAME,
        displayName
    );
    let nameplateGroup = null;
    if (rearModelName) {
        nameplateGroup = addPlayerNameDisplay(
            nameplateAssemblyGroup,
            rearModelName,
            bodyDimensions
        );
    }

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
            const color = new THREE.Color(colorHex);
            for (let i = 0; i < bodyPanelMaterials.length; i += 1) {
                bodyPanelMaterials[i].color.copy(color);
            }
        },
    };
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

    const basePlate = new THREE.Mesh(
        new THREE.CylinderGeometry(outerRadius * 1.02, outerRadius * 1.06, markerBaseThickness, 56),
        new THREE.MeshStandardMaterial({
            color: 0x0b1624,
            emissive: 0x12324a,
            emissiveIntensity: 0.2,
            metalness: 0.62,
            roughness: 0.38,
        })
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
    };

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
    playerName = 'MAREK'
) {
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

            if (needsScreenRefresh) {
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
            if (brandState.activeMode === 'battery') {
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
    };
}

function createSuspensionLinkage(carRoot, bodyRig, wheelRig, config = {}) {
    const bodyDimensions = config.bodyDimensions || DEFAULT_BODY_DIMENSIONS;
    const wheelPositions = config.wheelPositions || DEFAULT_WHEEL_POSITIONS;
    const linkY = config.linkY ?? SUSPENSION_LINK_Y;
    const DRAG_MIN_SPEED = 4.5;
    const DRAG_MAX_TRAIL = 0.62;
    const DRAG_GROUND_CLEARANCE = 0.022;
    const SCRAPE_MIN_SPEED = 7.2;
    const SCRAPE_MIN_STEER = 0.15;

    const rodMaterial = createMaterial({
        color: 0xbfc7d1,
        metalness: 1,
        roughness: 0.08,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
    });
    const jointMaterial = createMaterial({
        color: 0xd5dde8,
        metalness: 1,
        roughness: 0.12,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
    });

    const JOINT_RADIUS = 0.06;
    const BODY_SIDE_OUTBOARD_OFFSET = 0.08;
    const WHEEL_SIDE_ROD_INSET = 0.21;
    const MAX_WHEEL_SIDE_INSET_RATIO = 0.54;
    const rodGeometry = new THREE.CylinderGeometry(0.04, 0.04, 1, 24);
    const jointGeometry = new THREE.SphereGeometry(JOINT_RADIUS, 16, 16);
    const yAxis = new THREE.Vector3(0, 1, 0);
    const bodyHalfWidth = bodyDimensions.width / 2;
    const links = [];
    const scrapeContacts = [];
    const scratchWorld = new THREE.Vector3();
    const rodEndLocal = new THREE.Vector3();

    wheelPositions.forEach(({ x, z }) => {
        const direction = Math.sign(x) || 1;
        const bodyEdgeX = direction * (bodyHalfWidth + BODY_SIDE_OUTBOARD_OFFSET);
        const side = direction < 0 ? 'left' : 'right';
        const zone = z < 0 ? 'front' : 'rear';
        const assembly = new THREE.Group();
        carRoot.add(assembly);

        const rod = new THREE.Mesh(rodGeometry, rodMaterial);
        rod.castShadow = true;
        rod.receiveShadow = true;
        assembly.add(rod);

        const innerJoint = new THREE.Mesh(jointGeometry, jointMaterial);
        innerJoint.castShadow = true;
        innerJoint.receiveShadow = true;
        assembly.add(innerJoint);

        const outerJoint = new THREE.Mesh(jointGeometry, jointMaterial);
        outerJoint.castShadow = true;
        outerJoint.receiveShadow = true;
        assembly.add(outerJoint);

        links.push({
            id: `suspension_${zone}_${side}`,
            type: 'suspension_link',
            side,
            zone,
            source: assembly,
            groundOffset: 0.06,
            baseLife: 4.9,
            mass: 0.8,
            bodyAnchorLocal: new THREE.Vector3(bodyEdgeX, linkY, z),
            wheelAnchorLocal: new THREE.Vector3(x, linkY, z),
            assembly,
            rod,
            innerJoint,
            outerJoint,
            bodyWorld: new THREE.Vector3(),
            wheelWorld: new THREE.Vector3(),
            startLocal: new THREE.Vector3(),
            endLocal: new THREE.Vector3(),
            dragEndLocal: new THREE.Vector3(x, linkY, z),
            dragTargetLocal: new THREE.Vector3(x, linkY, z),
            direction: new THREE.Vector3(),
            center: new THREE.Vector3(),
            quaternion: new THREE.Quaternion(),
            wheelKey: `${zone}_${side}`,
            scrapeCooldown: Math.random() * 0.12,
        });
    });

    function update(missingWheels = null, vehicleState = null, deltaTime = 1 / 60) {
        scrapeContacts.length = 0;
        const dt = Math.min(deltaTime || 1 / 60, 0.05);
        const speed = vehicleState?.speed || 0;
        const speedAbs = Math.abs(speed);
        const steerAbs = Math.abs(vehicleState?.steerInput || 0);
        const yawRateAbs = Math.abs(vehicleState?.yawRate || 0);
        const speedSign = speed >= 0 ? 1 : -1;
        const groundLocalY = -carRoot.position.y + DRAG_GROUND_CLEARANCE;
        const speedNorm = THREE.MathUtils.clamp((speedAbs - DRAG_MIN_SPEED) / 28, 0, 1);

        links.forEach((link) => {
            if (!link.source?.visible) {
                return;
            }

            link.bodyWorld.copy(link.bodyAnchorLocal);
            bodyRig.localToWorld(link.bodyWorld);

            link.startLocal.copy(link.bodyWorld);
            carRoot.worldToLocal(link.startLocal);

            const wheelMissing = Boolean(missingWheels?.[link.wheelKey]);
            if (!wheelMissing) {
                link.wheelWorld.copy(link.wheelAnchorLocal);
                wheelRig.localToWorld(link.wheelWorld);
                link.endLocal.copy(link.wheelWorld);
                carRoot.worldToLocal(link.endLocal);
                link.dragEndLocal.copy(link.endLocal);
                link.dragTargetLocal.copy(link.endLocal);
                link.scrapeCooldown = Math.max(0, link.scrapeCooldown - dt);
            } else {
                const sideSign = link.side === 'left' ? -1 : 1;
                const zoneSign = link.zone === 'front' ? -1 : 1;
                const trail = (0.08 + speedNorm * DRAG_MAX_TRAIL) * speedSign;
                const steerSweep =
                    (vehicleState?.steerInput || 0) * sideSign * 0.24 * (0.36 + speedNorm * 0.64);
                const zoneBias = zoneSign * (0.04 + speedNorm * 0.05);
                const dragDrop = THREE.MathUtils.clamp(
                    speedNorm * 0.02 + steerAbs * 0.016,
                    0,
                    0.045
                );

                link.dragTargetLocal.set(
                    link.wheelAnchorLocal.x * 0.92,
                    groundLocalY + 0.01 - dragDrop,
                    link.wheelAnchorLocal.z + trail + steerSweep + zoneBias
                );
                const dragBlend = 1 - Math.exp(-11.5 * dt);
                link.dragEndLocal.lerp(link.dragTargetLocal, dragBlend);
                link.endLocal.copy(link.dragEndLocal);

                link.scrapeCooldown = Math.max(0, link.scrapeCooldown - dt);
                const scrapeActive =
                    speedAbs >= SCRAPE_MIN_SPEED &&
                    (steerAbs >= SCRAPE_MIN_STEER || yawRateAbs >= 0.34);
                if (scrapeActive && link.scrapeCooldown <= 0) {
                    scratchWorld.copy(link.endLocal);
                    carRoot.localToWorld(scratchWorld);
                    scrapeContacts.push({
                        position: scratchWorld.clone(),
                        intensity: THREE.MathUtils.clamp(
                            0.28 + speedNorm * 0.55 + steerAbs * 0.35,
                            0,
                            1
                        ),
                    });
                    link.scrapeCooldown =
                        THREE.MathUtils.lerp(0.12, 0.045, speedNorm) * (0.72 + Math.random() * 0.6);
                }
            }

            link.direction.subVectors(link.endLocal, link.startLocal);
            const fullLength = Math.max(link.direction.length(), 0.0001);
            const wheelSideInset = Math.min(
                WHEEL_SIDE_ROD_INSET,
                fullLength * MAX_WHEEL_SIDE_INSET_RATIO
            );
            const rodLength = Math.max(fullLength - wheelSideInset, 0.0001);
            link.direction.multiplyScalar(1 / fullLength);

            // Shorten only the wheel-side end so the outer joint stays visible beyond the rod.
            rodEndLocal.copy(link.endLocal).addScaledVector(link.direction, -wheelSideInset);
            link.center.copy(link.startLocal).add(rodEndLocal).multiplyScalar(0.5);
            link.rod.position.copy(link.center);
            link.rod.scale.set(1, rodLength, 1);
            link.quaternion.setFromUnitVectors(yAxis, link.direction);
            link.rod.quaternion.copy(link.quaternion);

            link.innerJoint.position.copy(link.startLocal);
            link.outerJoint.position.copy(rodEndLocal);
        });
    }

    update();
    return {
        update,
        consumeScrapeContacts() {
            if (scrapeContacts.length === 0) {
                return [];
            }
            const contacts = scrapeContacts.slice();
            scrapeContacts.length = 0;
            return contacts;
        },
        detachableLinks: links.map((link) => ({
            id: link.id,
            type: link.type,
            side: link.side,
            zone: link.zone,
            source: link.source,
            groundOffset: link.groundOffset,
            baseLife: link.baseLife,
            mass: link.mass,
        })),
    };
}

function addPlayerNameDisplay(parent, playerName, bodyDimensions) {
    const plateTexture = createNameplateTexture(playerName);
    const rearZ = bodyDimensions.depth * 0.5 + 0.05;
    const plateY = 0.666;

    const badgeGroup = new THREE.Group();
    badgeGroup.position.set(0, 0, rearZ);
    parent.add(badgeGroup);

    const wordmarkWidth = bodyDimensions.width * 0.7;
    const wordmarkHeight = 0.148;
    const logoShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(wordmarkWidth * 1.01, wordmarkHeight * 1.01),
        new THREE.MeshBasicMaterial({
            map: plateTexture,
            color: 0x000000,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
            toneMapped: false,
        })
    );
    logoShadow.position.set(0, plateY - 0.0025, 0.0055);
    badgeGroup.add(logoShadow);

    const wordmark = new THREE.Mesh(
        new THREE.PlaneGeometry(wordmarkWidth, wordmarkHeight),
        new THREE.MeshPhysicalMaterial({
            map: plateTexture,
            transparent: true,
            alphaTest: 0.08,
            color: 0xfff7e8,
            emissive: new THREE.Color(0x7f6346),
            emissiveIntensity: 0.34,
            metalness: 0.3,
            roughness: 0.48,
            clearcoat: 0.95,
            clearcoatRoughness: 0.22,
            depthWrite: false,
        })
    );
    wordmark.position.set(0, plateY, 0.009);
    badgeGroup.add(wordmark);

    return badgeGroup;
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
                THREE.MathUtils.clamp(vehicleState.topSpeedLimitKph ?? 220, 50, 220)
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

export { addLightsToCar, addLuxuryBody, createSuspensionLinkage };
