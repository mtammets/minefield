import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const tireMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x222222,
    metalness: 0.7,
    roughness: 0.4
});

const rimMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf1f5fb,
    metalness: 1.0,
    roughness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.8
});

const rimAccentMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xff5252,
    emissive: 0x6b0f12,
    emissiveIntensity: 0.35,
    metalness: 0.9,
    roughness: 0.16,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
});

const rimBaseMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0f1418,
    metalness: 0.65,
    roughness: 0.3,
    clearcoat: 0.7,
    clearcoatRoughness: 0.18,
});

const brakeDiskMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x888888,
    metalness: 0.8,
    roughness: 0.3
});

const wheelMirrorConfig = {
    frontLeft: false,
    frontRight: true,
    backLeft: false,
    backRight: true
};

const WHEEL_RADIUS = 0.5;
const TIRE_WIDTH = 0.3;
const STEER_RESPONSE = 14;
const VISUAL_STEER_GAIN = 1.35;
const VISUAL_MIN_STEER = THREE.MathUtils.degToRad(8);
const VISUAL_MAX_STEER = THREE.MathUtils.degToRad(26);

function createTire() {
    return new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, TIRE_WIDTH, 32),
        tireMaterial
    );
}

function createRim(side = 1, mirror = false) {
    const rim = new THREE.Group();

    const spokeBackplate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.305, 0.305, 0.014, 40),
        rimBaseMaterial
    );
    spokeBackplate.rotation.z = Math.PI / 2;
    rim.add(spokeBackplate);

    const spokeCount = 10;
    const spokeLength = 0.255;
    const spokeGeometry = new THREE.BoxGeometry(0.028, spokeLength, 0.032);
    spokeGeometry.translate(0, spokeLength * 0.5 - 0.02, 0);
    for (let i = 0; i < spokeCount; i += 1) {
        const spokeMaterial = i % 2 === 0 ? rimMaterial : rimAccentMaterial;
        const spoke = new THREE.Mesh(spokeGeometry, spokeMaterial);
        spoke.rotation.x = (Math.PI * 2 * i) / spokeCount;
        rim.add(spoke);
    }

    const centerHub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.08, 24),
        rimMaterial
    );
    centerHub.rotation.z = Math.PI / 2;
    rim.add(centerHub);

    rim.position.x = side * (TIRE_WIDTH * 0.5 + 0.01);

    if (mirror) {
        rim.scale.x *= -1;
    }

    return rim;
}

function createBrakeDisk() {
    return new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.05, 32),
        brakeDiskMaterial
    );
}

function createWheelWellLight(x, z, car) {
    const light = new THREE.PointLight(0xffffff, 1.1, 8);
    light.position.set(x, 1.5, z);
    car.add(light);
}

function createWheel(x, z, parent, mirror = false) {
    const wheel = new THREE.Group();

    const tire = createTire();
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    tire.receiveShadow = true;
    wheel.add(tire);

    const outerRim = createRim(1, mirror);
    outerRim.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    wheel.add(outerRim);

    const innerRim = createRim(-1, mirror);
    innerRim.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    wheel.add(innerRim);

    const brakeDisk = createBrakeDisk();
    brakeDisk.rotation.z = Math.PI / 2;
    brakeDisk.position.set(0, 0, 0.1);
    brakeDisk.castShadow = true;
    brakeDisk.receiveShadow = true;
    wheel.add(brakeDisk);

    wheel.position.set(x, 0.5, z);
    parent.add(wheel);
    return wheel;
}

function createSteerableWheel(x, z, car, mirror = false) {
    const steeringPivot = new THREE.Group();
    steeringPivot.position.set(x, 0, z);
    car.add(steeringPivot);

    const wheel = createWheel(0, 0, steeringPivot, mirror);
    return { steeringPivot, wheel };
}

function initializeWheels(car) {
    const frontLeft = createSteerableWheel(-1.2, -1.8, car, wheelMirrorConfig.frontLeft);
    const frontRight = createSteerableWheel(1.2, -1.8, car, wheelMirrorConfig.frontRight);
    const backLeft = createWheel(-1.2, 1.8, car, wheelMirrorConfig.backLeft);
    const backRight = createWheel(1.2, 1.8, car, wheelMirrorConfig.backRight);

    createWheelWellLight(-1.2, -1.8, car);
    createWheelWellLight(1.2, -1.8, car);
    createWheelWellLight(-1.2, 1.8, car);
    createWheelWellLight(1.2, 1.8, car);

    const wheelMeshes = [frontLeft.wheel, frontRight.wheel, backLeft, backRight];
    const steerPivots = [frontLeft.steeringPivot, frontRight.steeringPivot];

    return {
        update(vehicleState, deltaTime = 1 / 60) {
            const dt = Math.min(deltaTime, 0.05);
            const targetSteer = getVisualSteerAngle(vehicleState);
            const steerLerp = 1 - Math.exp(-STEER_RESPONSE * dt);

            steerPivots.forEach((pivot) => {
                pivot.rotation.y = THREE.MathUtils.lerp(pivot.rotation.y, targetSteer, steerLerp);
            });

            const longitudinalSpeed = vehicleState.velocity.length() < 0.01
                ? 0
                : vehicleState.speed;
            const rollAmount = (longitudinalSpeed / WHEEL_RADIUS) * dt;
            wheelMeshes.forEach((wheel) => {
                wheel.rotation.x -= rollAmount;
            });
        },
    };
}

function getVisualSteerAngle(vehicleState) {
    const input = vehicleState.steerInput || 0;
    if (Math.abs(input) < 0.001) {
        return 0;
    }

    const physicalSteer = vehicleState.steerAngle || 0;
    const boostedSteer = physicalSteer * VISUAL_STEER_GAIN;
    const minVisibleSteer = input * VISUAL_MIN_STEER;
    const targetSteer = Math.sign(input) * Math.max(Math.abs(boostedSteer), Math.abs(minVisibleSteer));
    return THREE.MathUtils.clamp(targetSteer, -VISUAL_MAX_STEER, VISUAL_MAX_STEER);
}

export { initializeWheels };
