import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const DEFAULT_LED_COLOR = 0xffcc00; // Kuldne LED
const HEADLIGHT_COLOR = 0xffffff; // Valge esituli
const TAILLIGHT_COLOR = 0xff0000; // Punane tagatuli

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
        headlightIntensity = 3,
        headlightDistance = 50,
        headlightAngle = Math.PI / 6,
        headlightPenumbra = 0.4,
        headlightPositions = [
            { position: [-0.3, 0.5, -1.85], target: [-0.7, 0.2, -10] },
            { position: [0.3, 0.5, -1.85], target: [0.7, 0.2, -10] },
        ],
        taillightColor = TAILLIGHT_COLOR,
        taillightIntensity = 1,
        taillightDistance = 10,
        taillightPositions = [
            { position: [-0.3, 0.4, 2] },
            { position: [0.3, 0.4, 2] },
        ],
    } = lightConfig;

    const createLight = (LightType, color, intensity, distance, position, target = null, angle = null, penumbra = null) => {
        const light = new LightType(color, intensity, distance, angle, penumbra);
        light.position.set(...position);
        if (target) {
            light.target.position.set(...target);
            car.add(light.target);
        }
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
        createLight(THREE.SpotLight, headlightColor, headlightIntensity, headlightDistance, position, target, headlightAngle, headlightPenumbra);
        createLightMesh(THREE.CylinderGeometry.bind(null, 0.1, 0.1, 0.2, 16), headlightColor, headlightColor, 2, [position[0], position[1], position[2] - 0.1], [Math.PI / 2, 0, 0]);
    });

    // Tagatuled
    taillightPositions.forEach(({ position }) => {
        createLight(THREE.PointLight, taillightColor, taillightIntensity, taillightDistance, position);
        createLightMesh(THREE.BoxGeometry.bind(null, 0.2, 0.1, 0.1), taillightColor, taillightColor, 1, position);
    });
}

// Luksusliku kere lisamine
function addLuxuryBody(car, bodyConfig = {}) {
    const {
        bodyColor = 0x101010,
        bodyDimensions = { width: 1.2, height: 0.4, depth: 4 },
        wheelPositions = [
            { x: -1.2, z: -1.8 },
            { x: 1.2, z: -1.8 },
            { x: -1.2, z: 1.8 },
            { x: 1.2, z: 1.8 },
        ],
    } = bodyConfig;

    // Põhikere
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(bodyDimensions.width, bodyDimensions.height, bodyDimensions.depth),
        createMaterial({
            color: bodyColor,
            metalness: 1,
            roughness: 0.1,
            clearcoat: 1,
            clearcoatRoughness: 0.05,
        })
    );
    body.position.set(0, 0.5, 0);
    car.add(body);

    // Lisa kere ja rataste vahele läikivad ühendusvardad
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

    const bodyHalfWidth = bodyDimensions.width / 2;
    const rodRadius = 0.04;
    const jointRadius = 0.06;
    const rodY = 0.5;

    wheelPositions.forEach(({ x, z }) => {
        const direction = Math.sign(x) || 1;
        const bodyEdgeX = direction * bodyHalfWidth;
        const gap = Math.max(0, Math.abs(x) - bodyHalfWidth);
        const centerX = bodyEdgeX + direction * (gap / 2);

        const rod = new THREE.Mesh(
            new THREE.CylinderGeometry(rodRadius, rodRadius, gap, 24),
            rodMaterial
        );
        rod.rotation.z = Math.PI / 2;
        rod.position.set(centerX, rodY, z);
        car.add(rod);

        const innerJoint = new THREE.Mesh(
            new THREE.SphereGeometry(jointRadius, 16, 16),
            jointMaterial
        );
        innerJoint.position.set(bodyEdgeX, rodY, z);
        car.add(innerJoint);

        const outerJoint = new THREE.Mesh(
            new THREE.SphereGeometry(jointRadius, 16, 16),
            jointMaterial
        );
        outerJoint.position.set(x, rodY, z);
        car.add(outerJoint);
    });
}

export { addLightsToCar, addLuxuryBody };
