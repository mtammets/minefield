import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const tireMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x222222,
    metalness: 0.7,
    roughness: 0.4
});

const rimMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffd700, // Kullavärv
    metalness: 1.0,
    roughness: 0.2
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
const STEER_RESPONSE = 14;

function createTire() {
    return new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.3, 32),
        tireMaterial
    );
}

function createRim(mirror = false) {
    const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.1, 0.3, 3, 100),
        rimMaterial
    );

    rim.position.set(0, 0, 0);
    rim.rotation.set(0, Math.PI / 2, 0);

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
    const light = new THREE.PointLight(0xffffff, 0.5, 5);
    light.position.set(x, 1.5, z);
    car.add(light);
}

function createWheel(x, z, parent, mirror = false) {
    const wheel = new THREE.Group();

    const tire = createTire();
    tire.rotation.z = Math.PI / 2;
    wheel.add(tire);

    const rim = createRim(mirror);
    wheel.add(rim);

    const brakeDisk = createBrakeDisk();
    brakeDisk.rotation.z = Math.PI / 2;
    brakeDisk.position.set(0, 0, 0.1);
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
            const targetSteer = vehicleState.steerAngle;
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

export { initializeWheels };
