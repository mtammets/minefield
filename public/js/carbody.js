import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const ACCENT_LED_COLOR = 0x64f4ff; // Külm neo türkiis
const ACCENT_LED_SECONDARY_COLOR = 0xff4f7f; // Soe neo punakas-roosa
const HEADLIGHT_COLOR = 0xffffff; // Valge esituli
const TAILLIGHT_COLOR = 0xff0000; // Punane tagatuli
const DEFAULT_BODY_DIMENSIONS = { width: 1.2, height: 0.4, depth: 4 };
const DEFAULT_WHEEL_POSITIONS = [
    { x: -1.2, z: -1.8 },
    { x: 1.2, z: -1.8 },
    { x: -1.2, z: 1.8 },
    { x: 1.2, z: 1.8 },
];
const ROOF_BRAND_NAME = 'Voltline';
const SUSPENSION_LINK_Y = 0.5;
const TAILLIGHT_RUNNING_LIGHT_FACTOR = 0.28;
const TAILLIGHT_BRAKE_LIGHT_FACTOR = 1.65;
const TAILLIGHT_RUNNING_DISTANCE_FACTOR = 0.64;
const TAILLIGHT_BRAKE_DISTANCE_FACTOR = 1.08;
const TAILLIGHT_RUNNING_EMISSIVE = 0.62;
const TAILLIGHT_BRAKE_EMISSIVE = 2.45;

// Abifunktsioon materjalide loomiseks
function createMaterial({ color, emissive = 0x000000, emissiveIntensity = 0, metalness = 0, roughness = 1, clearcoat = 0, clearcoatRoughness = 0 }) {
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

// Esitulede ja tagatulede lisamine
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
        taillightPositions = [
            { position: [-0.3, 0.4, 2] },
            { position: [0.3, 0.4, 2] },
        ],
        enableHeadlightProjectors = true,
        enablePrimaryHeadlightProjectors = true,
        enableNearFillProjectors = true,
        enableFacadeFillProjectors = true,
        enableTaillightPointLights = true,
        enableAccentPointLights = true,
        accentLedColor = ACCENT_LED_COLOR,
        accentLedSecondaryColor = ACCENT_LED_SECONDARY_COLOR,
        accentBaseEmissive = 0.95,
        accentSpeedBoost = 1.25,
        accentPulseSpeed = 4.2,
        accentPulseDepth = 0.12,
        accentGlowOpacity = 0.1,
        accentPointIntensity = 0.58,
        accentPointDistance = 8,
        accentPointDecay = 2.2,
    } = lightConfig;
    const taillightPointLights = [];
    const taillightMeshes = [];
    const lightState = { brakeLevel: 0 };
    const accentStripMaterials = [];
    const accentGlowMaterials = [];
    const accentPointLights = [];
    const accentPulseOffsets = [];
    const accentState = { phase: Math.random() * Math.PI * 2 };

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
        return light;
    };

    const createPoint = ({ color, intensity, distance, decay, position }) => {
        const light = new THREE.PointLight(color, intensity, distance, decay);
        light.position.set(...position);
        light.castShadow = false;
        car.add(light);
        return light;
    };

    const createLightMesh = (GeometryType, color, emissive, emissiveIntensity, position, rotation = null) => {
        const geometry = new GeometryType();
        const material = createMaterial({ color, emissive, emissiveIntensity });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...position);
        if (rotation) {
            mesh.rotation.set(...rotation);
        }
        car.add(mesh);
        return mesh;
    };

    // Esituled
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
        createLightMesh(
            THREE.BoxGeometry.bind(null, 0.22, 0.1, 0.08),
            headlightColor,
            headlightColor,
            3.1,
            [position[0], position[1], position[2] - 0.05]
        );
    });

    // Tagatuled
    taillightPositions.forEach(({ position }) => {
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
        const taillightLens = createLightMesh(
            THREE.BoxGeometry.bind(null, 0.2, 0.1, 0.1),
            taillightColor,
            taillightColor,
            TAILLIGHT_RUNNING_EMISSIVE,
            position
        );
        taillightMeshes.push(taillightLens);
    });

    createAccentLighting();
    applyBrakeLightLevel(0);
    applyAccentLighting({}, 0);

    return {
        update(vehicleState, deltaTime = 1 / 60) {
            const dt = Math.min(deltaTime, 0.05);
            const brakeInput = THREE.MathUtils.clamp(vehicleState?.brake || 0, 0, 1);
            const targetBrakeLevel = brakeInput;
            const response = targetBrakeLevel > lightState.brakeLevel ? 18 : 10;
            const blend = 1 - Math.exp(-response * dt);
            lightState.brakeLevel = THREE.MathUtils.lerp(lightState.brakeLevel, targetBrakeLevel, blend);
            applyBrakeLightLevel(lightState.brakeLevel);
            applyAccentLighting(vehicleState, dt);
        },
    };

    function applyBrakeLightLevel(level) {
        const brakeLevel = THREE.MathUtils.clamp(level, 0, 1);
        const pointIntensity = taillightIntensity * THREE.MathUtils.lerp(
            TAILLIGHT_RUNNING_LIGHT_FACTOR,
            TAILLIGHT_BRAKE_LIGHT_FACTOR,
            brakeLevel
        );
        const pointDistance = taillightDistance * THREE.MathUtils.lerp(
            TAILLIGHT_RUNNING_DISTANCE_FACTOR,
            TAILLIGHT_BRAKE_DISTANCE_FACTOR,
            brakeLevel
        );
        const lensEmissive = THREE.MathUtils.lerp(
            TAILLIGHT_RUNNING_EMISSIVE,
            TAILLIGHT_BRAKE_EMISSIVE,
            brakeLevel
        );

        taillightPointLights.forEach((light) => {
            light.intensity = pointIntensity;
            light.distance = pointDistance;
        });
        taillightMeshes.forEach((mesh) => {
            mesh.material.emissiveIntensity = lensEmissive;
        });
    }

    function createAccentLighting() {
        const stripLayouts = [
            { size: [0.016, 0.022, 2.88], position: [-0.632, 0.43, 0.03], color: accentLedColor, pulseOffset: 0.2, glowAxis: 'z' },
            { size: [0.016, 0.022, 2.88], position: [0.632, 0.43, 0.03], color: accentLedColor, pulseOffset: 1.4, glowAxis: 'z' },
            { size: [0.64, 0.018, 0.016], position: [0, 0.54, -1.94], color: accentLedColor, pulseOffset: 2.2, glowAxis: 'x' },
        ];

        stripLayouts.forEach(({ size, position, color, pulseOffset, glowAxis }) => {
            const stripMaterial = new THREE.MeshStandardMaterial({
                color: 0x0b121a,
                emissive: color,
                emissiveIntensity: accentBaseEmissive,
                metalness: 0.25,
                roughness: 0.28,
            });
            const stripMesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), stripMaterial);
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
            const glowGeometry = glowAxis === 'z'
                ? new THREE.PlaneGeometry(size[2] * 1.05, size[1] * 5.2)
                : new THREE.PlaneGeometry(size[0] * 1.12, size[1] * 5.4);
            const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
            glowMesh.position.copy(stripMesh.position);
            if (glowAxis === 'z') {
                glowMesh.rotation.y = Math.PI / 2;
                glowMesh.position.x += Math.sign(position[0]) * 0.011;
            } else {
                glowMesh.position.z += Math.sign(position[2]) * 0.007;
            }
            car.add(glowMesh);

            accentStripMaterials.push(stripMaterial);
            accentGlowMaterials.push(glowMaterial);
            accentPulseOffsets.push(pulseOffset);
        });

        if (enableAccentPointLights) {
            [
                { position: [-0.53, 0.28, 0.08], color: accentLedColor },
                { position: [0.53, 0.28, 0.08], color: accentLedColor },
            ].forEach(({ position, color }) => {
                const light = createPoint({
                    color,
                    intensity: accentPointIntensity,
                    distance: accentPointDistance,
                    decay: accentPointDecay,
                    position,
                });
                accentPointLights.push(light);
            });
        }
    }

    function applyAccentLighting(vehicleState, dt) {
        const speedRatio = THREE.MathUtils.clamp(Math.abs(vehicleState?.speed || 0) / 58, 0, 1);
        const throttleRatio = THREE.MathUtils.clamp(Math.abs(vehicleState?.throttle || 0), 0, 1);
        const steerRatio = THREE.MathUtils.clamp(Math.abs(vehicleState?.steerInput || 0), 0, 1);
        const burnoutRatio = THREE.MathUtils.clamp(vehicleState?.burnout || vehicleState?.launchSlip || 0, 0, 1);
        const activity = THREE.MathUtils.clamp(
            speedRatio * 0.72 + throttleRatio * 0.24 + steerRatio * 0.12 + burnoutRatio * 0.35,
            0,
            1.5
        );

        accentState.phase += dt * accentPulseSpeed * (1 + activity * 0.28);

        accentStripMaterials.forEach((material, index) => {
            const wave = 0.5 + 0.5 * Math.sin(accentState.phase + accentPulseOffsets[index]);
            const pulse = 1 + (wave - 0.5) * 2 * accentPulseDepth;
            material.emissiveIntensity = accentBaseEmissive * pulse + activity * accentSpeedBoost;
        });

        accentGlowMaterials.forEach((material, index) => {
            const wave = 0.5 + 0.5 * Math.sin(accentState.phase + accentPulseOffsets[index] + 0.3);
            material.opacity = accentGlowOpacity * (0.84 + wave * 0.42) * (1 + activity * 0.38);
        });

        accentPointLights.forEach((light, index) => {
            const wave = 0.86 + 0.14 * Math.sin(accentState.phase * 1.14 + index * 1.8);
            light.intensity = accentPointIntensity * wave * (0.82 + activity * 0.44);
            light.distance = accentPointDistance * (0.92 + speedRatio * 0.12);
        });
    }
}

// Luksusliku kere lisamine
function addLuxuryBody(car, bodyConfig = {}) {
    const {
        bodyColor = 0x2d67a6,
        bodyDimensions = DEFAULT_BODY_DIMENSIONS,
        wheelPositions = DEFAULT_WHEEL_POSITIONS,
        displayName = 'MAREK',
    } = bodyConfig;

    const bodyPanels = [];
    const bodyPanelMaterials = [];
    const createBodyPanel = ({
        id,
        size,
        position,
        side = 'center',
        zone = 'mid',
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
        const panel = new THREE.Mesh(
            new THREE.BoxGeometry(size[0], size[1], size[2]),
            panelMaterial
        );
        panel.position.set(position[0], position[1], position[2]);
        panel.castShadow = true;
        panel.receiveShadow = true;
        car.add(panel);
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

    // Kere on nüüd samadest paneelidest, mida saab avariis eraldi lahti rebida.
    createBodyPanel({
        id: 'body_center_core',
        size: [1.22, 0.42, 3.94],
        position: [0, 0.56, 0.06],
        side: 'center',
        zone: 'mid',
        emissiveIntensity: 0.32,
        roughness: 0.17,
    });
    const roofBrandingController = addVoltlineRoofBranding(
        car,
        bodyDimensions,
        ROOF_BRAND_NAME,
        displayName
    );
    if (displayName) {
        addPlayerNameDisplay(car, displayName, bodyDimensions);
    }

    return {
        bodyDimensions,
        wheelPositions,
        detachablePanels: bodyPanels,
        update(vehicleState, dt) {
            roofBrandingController?.update?.(vehicleState, dt);
        },
        setBatteryLevel(levelNormalized) {
            roofBrandingController?.setBatteryLevel?.(levelNormalized);
        },
        setBodyColor(colorHex) {
            const color = new THREE.Color(colorHex);
            for (let i = 0; i < bodyPanelMaterials.length; i += 1) {
                bodyPanelMaterials[i].color.copy(color);
            }
        },
    };
}

function addVoltlineRoofBranding(
    car,
    bodyDimensions,
    brandName = ROOF_BRAND_NAME,
    playerName = 'MAREK'
) {
    const roofScreen = createVoltlineRoofScreenController(brandName, playerName);
    const roofTexture = roofScreen.texture;
    const shimmerTexture = createRoofShimmerTexture();
    const roofCenterY = 0.56 + bodyDimensions.height * 0.5;
    const roofCenterZ = 0.1;
    const screenAspect = roofTexture.image?.width && roofTexture.image?.height
        ? roofTexture.image.width / roofTexture.image.height
        : 2.2;
    const screenWidth = bodyDimensions.width * 0.72;
    const screenDepth = screenWidth / screenAspect;
    const badgePadding = 0.075;
    const badgeWidth = screenWidth + badgePadding * 2;
    const badgeDepth = screenDepth + badgePadding * 2;
    const railMaterial = createMaterial({
        color: 0x0b1722,
        emissive: 0x58dcff,
        emissiveIntensity: 0.58,
        metalness: 0.62,
        roughness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
    });

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
    car.add(badgeBase);

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
    car.add(trim);

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
    logoPlate.rotation.x = -Math.PI / 2;
    logoPlate.position.set(0, roofCenterY + 0.041, roofCenterZ);
    car.add(logoPlate);

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
    car.add(gloss);

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
    car.add(shimmer);

    const railGeometry = new THREE.BoxGeometry(0.022, 0.018, screenDepth + 0.04);
    const railX = screenWidth * 0.5 + 0.028;
    const leftRail = new THREE.Mesh(railGeometry, railMaterial);
    leftRail.position.set(-railX, roofCenterY + 0.04, roofCenterZ);
    car.add(leftRail);
    const rightRail = new THREE.Mesh(railGeometry, railMaterial);
    rightRail.position.set(railX, roofCenterY + 0.04, roofCenterZ);
    car.add(rightRail);

    const modeOrder = ['dashboard', 'battery', 'navigation'];
    const brandState = {
        phase: Math.random() * Math.PI * 2,
        modeTimer: 0,
        refreshTimer: 0,
        activeModeIndex: 0,
        activeMode: modeOrder[0],
        batteryLevel: 1,
        batteryPercent: 100,
    };

    return {
        update(vehicleState = {}, dt = 1 / 60) {
            const speedRatio = THREE.MathUtils.clamp(Math.abs(vehicleState.speed || 0) / 62, 0, 1);
            const throttleRatio = THREE.MathUtils.clamp(Math.abs(vehicleState.throttle || 0), 0, 1);
            const burnoutRatio = THREE.MathUtils.clamp(vehicleState.burnout || vehicleState.launchSlip || 0, 0, 1);
            const activity = THREE.MathUtils.clamp(
                speedRatio * 0.7 + throttleRatio * 0.22 + burnoutRatio * 0.55,
                0,
                1.8
            );

            brandState.phase += dt * (2.8 + activity * 4.6);
            const pulse = 0.5 + 0.5 * Math.sin(brandState.phase);
            const highPulse = 0.5 + 0.5 * Math.sin(brandState.phase * 1.7 + 0.4);

            const nextBatteryLevel = THREE.MathUtils.clamp(vehicleState.batteryLevelNormalized ?? brandState.batteryLevel, 0, 1);
            const nextBatteryPercent = Math.round(nextBatteryLevel * 100);
            let needsScreenRefresh = false;
            if (Math.abs(nextBatteryLevel - brandState.batteryLevel) > 0.0005) {
                brandState.batteryLevel = nextBatteryLevel;
                if (brandState.activeMode === 'battery' && nextBatteryPercent !== brandState.batteryPercent) {
                    needsScreenRefresh = true;
                }
                brandState.batteryPercent = nextBatteryPercent;
            }

            brandState.modeTimer += dt;
            brandState.refreshTimer += dt;
            const switchInterval = brandState.activeMode === 'dashboard'
                ? 4.4
                : brandState.activeMode === 'battery'
                    ? 2.8
                    : 3.4;
            if (brandState.modeTimer >= switchInterval) {
                brandState.modeTimer = 0;
                brandState.activeModeIndex = (brandState.activeModeIndex + 1) % modeOrder.length;
                brandState.activeMode = modeOrder[brandState.activeModeIndex];
                needsScreenRefresh = true;
            }
            const refreshInterval = brandState.activeMode === 'battery' ? 0.3 : 0.16;
            if (brandState.refreshTimer >= refreshInterval) {
                brandState.refreshTimer = 0;
                needsScreenRefresh = true;
            }

            if (needsScreenRefresh) {
                roofScreen.render(brandState.activeMode, brandState.batteryLevel, vehicleState);
            }

            logoPlateMaterial.emissiveIntensity = 0.58 + pulse * 0.26 + activity * 0.32;
            railMaterial.emissiveIntensity = 0.42 + highPulse * 0.3 + activity * 0.34;
            shimmerMaterial.opacity = 0.08 + highPulse * 0.08 + activity * 0.08;
            shimmerTexture.offset.x = (shimmerTexture.offset.x + dt * (0.13 + speedRatio * 0.9 + burnoutRatio * 1.1)) % 1;
        },
        setBatteryLevel(levelNormalized) {
            const level = THREE.MathUtils.clamp(levelNormalized, 0, 1);
            brandState.batteryLevel = level;
            brandState.batteryPercent = Math.round(level * 100);
            if (brandState.activeMode === 'battery') {
                roofScreen.render(brandState.activeMode, level, {});
            }
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

    const rodGeometry = new THREE.CylinderGeometry(0.04, 0.04, 1, 24);
    const jointGeometry = new THREE.SphereGeometry(0.06, 16, 16);
    const yAxis = new THREE.Vector3(0, 1, 0);
    const bodyHalfWidth = bodyDimensions.width / 2;
    const links = [];
    const scrapeContacts = [];
    const scratchWorld = new THREE.Vector3();

    wheelPositions.forEach(({ x, z }) => {
        const direction = Math.sign(x) || 1;
        const bodyEdgeX = direction * bodyHalfWidth;
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
                const steerSweep = (vehicleState?.steerInput || 0) * sideSign * 0.24 * (0.36 + speedNorm * 0.64);
                const zoneBias = zoneSign * (0.04 + speedNorm * 0.05);
                const dragDrop = THREE.MathUtils.clamp(speedNorm * 0.02 + steerAbs * 0.016, 0, 0.045);

                link.dragTargetLocal.set(
                    link.wheelAnchorLocal.x * 0.92,
                    groundLocalY + 0.01 - dragDrop,
                    link.wheelAnchorLocal.z + trail + steerSweep + zoneBias
                );
                const dragBlend = 1 - Math.exp(-11.5 * dt);
                link.dragEndLocal.lerp(link.dragTargetLocal, dragBlend);
                link.endLocal.copy(link.dragEndLocal);

                link.scrapeCooldown = Math.max(0, link.scrapeCooldown - dt);
                const scrapeActive = speedAbs >= SCRAPE_MIN_SPEED
                    && (steerAbs >= SCRAPE_MIN_STEER || yawRateAbs >= 0.34);
                if (scrapeActive && link.scrapeCooldown <= 0) {
                    scratchWorld.copy(link.endLocal);
                    carRoot.localToWorld(scratchWorld);
                    scrapeContacts.push({
                        position: scratchWorld.clone(),
                        intensity: THREE.MathUtils.clamp(0.28 + speedNorm * 0.55 + steerAbs * 0.35, 0, 1),
                    });
                    link.scrapeCooldown = THREE.MathUtils.lerp(0.12, 0.045, speedNorm) * (0.72 + Math.random() * 0.6);
                }
            }

            link.direction.subVectors(link.endLocal, link.startLocal);
            const length = Math.max(link.direction.length(), 0.0001);

            link.center.copy(link.startLocal).add(link.endLocal).multiplyScalar(0.5);
            link.rod.position.copy(link.center);
            link.rod.scale.set(1, length, 1);
            link.quaternion.setFromUnitVectors(yAxis, link.direction.multiplyScalar(1 / length));
            link.rod.quaternion.copy(link.quaternion);

            link.innerJoint.position.copy(link.startLocal);
            link.outerJoint.position.copy(link.endLocal);
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

function addPlayerNameDisplay(car, playerName, bodyDimensions) {
    const plateTexture = createNameplateTexture(playerName);
    const rearZ = bodyDimensions.depth * 0.5 + 0.16;
    const plateY = 0.62;

    const badgeGroup = new THREE.Group();
    badgeGroup.position.set(0, 0, rearZ);
    car.add(badgeGroup);

    const holder = new THREE.Mesh(
        new THREE.BoxGeometry(bodyDimensions.width * 0.78, 0.24, 0.05),
        createMaterial({
            color: 0x1e2931,
            metalness: 0.85,
            roughness: 0.22,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
        })
    );
    holder.position.set(0, plateY, -0.02);
    badgeGroup.add(holder);

    const holderInner = new THREE.Mesh(
        new THREE.BoxGeometry(bodyDimensions.width * 0.72, 0.18, 0.051),
        createMaterial({
            color: 0x071419,
            metalness: 0.4,
            roughness: 0.45,
            clearcoat: 0.7,
            clearcoatRoughness: 0.16,
        })
    );
    holderInner.position.set(0, plateY, -0.016);
    badgeGroup.add(holderInner);

    const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(bodyDimensions.width * 0.66, 0.14),
        new THREE.MeshStandardMaterial({
            map: plateTexture,
            transparent: true,
            alphaTest: 0.05,
            emissive: new THREE.Color(0x53ffe5),
            emissiveMap: plateTexture,
            emissiveIntensity: 1.35,
            metalness: 0.05,
            roughness: 0.5,
            depthWrite: false,
        })
    );
    plate.position.set(0, plateY, 0.012);
    badgeGroup.add(plate);

    const glowPanel = new THREE.Mesh(
        new THREE.PlaneGeometry(bodyDimensions.width * 0.74, 0.2),
        new THREE.MeshBasicMaterial({
            color: 0x2bf3d9,
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        })
    );
    glowPanel.position.set(0, plateY, 0.008);
    badgeGroup.add(glowPanel);

    const sideAccentMaterial = new THREE.MeshBasicMaterial({
        color: 0x53ffe5,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    const sideAccentLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.12), sideAccentMaterial);
    sideAccentLeft.position.set(-bodyDimensions.width * 0.29, plateY, 0.013);
    badgeGroup.add(sideAccentLeft);

    const sideAccentRight = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.12), sideAccentMaterial);
    sideAccentRight.position.set(bodyDimensions.width * 0.29, plateY, 0.013);
    badgeGroup.add(sideAccentRight);
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
    };

    function render(mode = 'dashboard', batteryLevel = 1, vehicleState = {}) {
        const width = canvas.width;
        const height = canvas.height;
        const clampedBattery = THREE.MathUtils.clamp(batteryLevel, 0, 1);
        const telemetry = {
            speedKph: Math.round(Math.abs((vehicleState.speed || 0) * 3.6)),
            throttle: THREE.MathUtils.clamp(Math.abs(vehicleState.throttle || 0), 0, 1),
            steer: THREE.MathUtils.clamp(vehicleState.steerInput || 0, -1, 1),
            yawRate: THREE.MathUtils.clamp(Math.abs(vehicleState.yawRate || 0), 0, 2),
            batteryPercent: Math.round(clampedBattery * 100),
            rangeKm: Math.round(520 * clampedBattery),
        };
        ctx.clearRect(0, 0, width, height);

        const shellX = 38;
        const shellY = 40;
        const shellW = width - 76;
        const shellH = height - 80;
        const shellRadius = 62;
        const shellGradient = ctx.createLinearGradient(shellX, shellY, shellX + shellW, shellY + shellH);
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
        const panelGradient = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
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

        const speedGradient = ctx.createLinearGradient(speedCardX, speedCardY, speedCardX + leftW, speedCardY + speedCardH);
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

        const activity = THREE.MathUtils.clamp(telemetry.throttle * 0.74 + telemetry.yawRate * 0.26, 0, 1);
        const driveLabel = activity >= 0.7 ? 'SPORT' : activity >= 0.38 ? 'DYNAMIC' : 'ECO';
        ctx.font = "600 20px 'Sora', 'Segoe UI', sans-serif";
        ctx.fillStyle = 'rgba(165, 193, 218, 0.86)';
        ctx.fillText('DRIVE MODE', rightX + 24, modeCardY + 34);
        ctx.font = "800 56px 'Orbitron', 'Segoe UI', sans-serif";
        ctx.fillStyle = activity >= 0.7 ? '#a4f4ff' : '#d5e9fb';
        ctx.fillText(driveLabel, rightX + 22, modeCardY + 94);

        const steerStability = 1 - THREE.MathUtils.clamp(Math.abs(telemetry.steer) * 0.6 + telemetry.yawRate * 0.3, 0, 1);
        drawMetricBar(rightX + 24, modeCardY + 120, rightW - 48, 12, 'TRACTION', steerStability, '#8fe8ff');
        drawMetricBar(rightX + 24, modeCardY + 162, rightW - 48, 12, 'TORQUE', telemetry.throttle, '#b3f8d0');

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
        drawMetricBar(rightX + 24, energyCardY + 60, rightW - 48, 14, 'BATTERY', batteryLevel, getRoofBatteryColor(batteryLevel));
        drawMetricBar(rightX + 24, energyCardY + 104, rightW - 48, 14, 'REGEN', 1 - telemetry.throttle * 0.72, '#8dd9ff');
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
        drawRoundedRect(ctx, x + 2, y + 2, fillW, height - 4, Math.max(4, Math.floor((height - 4) * 0.5)));
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
    canvas.width = 1024;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "900 138px 'Trebuchet MS', 'Arial Black', sans-serif";
    ctx.shadowColor = 'rgba(52, 255, 226, 0.95)';
    ctx.shadowBlur = 28;
    ctx.fillStyle = '#dcfff8';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

    // Adds a digital scanline texture without drawing a full dull plate background.
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.17;
    for (let y = 18; y < canvas.height; y += 6) {
        ctx.fillStyle = '#34ffe2';
        ctx.fillRect(0, y, canvas.width, 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(71, 255, 225, 0.95)';
    ctx.lineWidth = 4;
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2 + 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
}

export { addLightsToCar, addLuxuryBody, createSuspensionLinkage };
