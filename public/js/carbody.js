import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const DEFAULT_LED_COLOR = 0xffcc00; // Kuldne LED
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
    } = lightConfig;

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
    };

    // Esituled
    headlightPositions.forEach(({ position, target }) => {
        const side = Math.sign(position[0]) || 1;

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
        createLightMesh(
            THREE.CylinderGeometry.bind(null, 0.1, 0.1, 0.2, 16),
            headlightColor,
            headlightColor,
            3.2,
            [position[0], position[1], position[2] - 0.1],
            [Math.PI / 2, 0, 0]
        );
    });

    // Tagatuled
    taillightPositions.forEach(({ position }) => {
        createPoint({
            color: taillightColor,
            intensity: taillightIntensity,
            distance: taillightDistance,
            decay: taillightDecay,
            position,
        });
        createLightMesh(
            THREE.BoxGeometry.bind(null, 0.2, 0.1, 0.1),
            taillightColor,
            taillightColor,
            1.3,
            position
        );
    });
}

// Luksusliku kere lisamine
function addLuxuryBody(car, bodyConfig = {}) {
    const {
        bodyColor = 0x2d67a6,
        bodyDimensions = DEFAULT_BODY_DIMENSIONS,
        wheelPositions = DEFAULT_WHEEL_POSITIONS,
    } = bodyConfig;

    // Põhikere
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(bodyDimensions.width, bodyDimensions.height, bodyDimensions.depth),
        createMaterial({
            color: bodyColor,
            emissive: 0x10233d,
            emissiveIntensity: 0.3,
            metalness: 1,
            roughness: 0.18,
            clearcoat: 1,
            clearcoatRoughness: 0.05,
        })
    );
    body.position.set(0, 0.5, 0);
    car.add(body);
    addPlayerNameDisplay(car, 'MAREK', bodyDimensions);

    return { bodyDimensions, wheelPositions };
}

function createSuspensionLinkage(carRoot, bodyRig, wheelRig, config = {}) {
    const bodyDimensions = config.bodyDimensions || DEFAULT_BODY_DIMENSIONS;
    const wheelPositions = config.wheelPositions || DEFAULT_WHEEL_POSITIONS;
    const linkY = config.linkY ?? SUSPENSION_LINK_Y;

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

    wheelPositions.forEach(({ x, z }) => {
        const direction = Math.sign(x) || 1;
        const bodyEdgeX = direction * bodyHalfWidth;

        const rod = new THREE.Mesh(rodGeometry, rodMaterial);
        rod.castShadow = true;
        rod.receiveShadow = true;
        carRoot.add(rod);

        const innerJoint = new THREE.Mesh(jointGeometry, jointMaterial);
        innerJoint.castShadow = true;
        innerJoint.receiveShadow = true;
        carRoot.add(innerJoint);

        const outerJoint = new THREE.Mesh(jointGeometry, jointMaterial);
        outerJoint.castShadow = true;
        outerJoint.receiveShadow = true;
        carRoot.add(outerJoint);

        links.push({
            bodyAnchorLocal: new THREE.Vector3(bodyEdgeX, linkY, z),
            wheelAnchorLocal: new THREE.Vector3(x, linkY, z),
            rod,
            innerJoint,
            outerJoint,
            bodyWorld: new THREE.Vector3(),
            wheelWorld: new THREE.Vector3(),
            startLocal: new THREE.Vector3(),
            endLocal: new THREE.Vector3(),
            direction: new THREE.Vector3(),
            center: new THREE.Vector3(),
            quaternion: new THREE.Quaternion(),
        });
    });

    function update() {
        links.forEach((link) => {
            link.bodyWorld.copy(link.bodyAnchorLocal);
            bodyRig.localToWorld(link.bodyWorld);
            link.wheelWorld.copy(link.wheelAnchorLocal);
            wheelRig.localToWorld(link.wheelWorld);

            link.startLocal.copy(link.bodyWorld);
            carRoot.worldToLocal(link.startLocal);
            link.endLocal.copy(link.wheelWorld);
            carRoot.worldToLocal(link.endLocal);

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
    return { update };
}

function addPlayerNameDisplay(car, playerName, bodyDimensions) {
    const plateTexture = createNameplateTexture(playerName);
    const rearZ = bodyDimensions.depth * 0.5 + 0.01;
    const plateY = 0.53;

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
