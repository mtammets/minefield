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
    const createBodyPanel = ({
        id,
        size,
        position,
        side = 'center',
        zone = 'mid',
        emissiveIntensity = 0.3,
        roughness = 0.18,
    }) => {
        const panel = new THREE.Mesh(
            new THREE.BoxGeometry(size[0], size[1], size[2]),
            createMaterial({
                color: bodyColor,
                emissive: 0x10233d,
                emissiveIntensity,
                metalness: 1,
                roughness,
                clearcoat: 1,
                clearcoatRoughness: 0.05,
            })
        );
        panel.position.set(position[0], position[1], position[2]);
        panel.castShadow = true;
        panel.receiveShadow = true;
        car.add(panel);

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
    if (displayName) {
        addPlayerNameDisplay(car, displayName, bodyDimensions);
    }

    return {
        bodyDimensions,
        wheelPositions,
        detachablePanels: bodyPanels,
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
