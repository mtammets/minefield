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
const WHEEL_CENTER_X = 1.28;
const FRONT_WHEEL_Z = -1.8;
const REAR_WHEEL_Z = 1.8;
const STEER_RESPONSE = 14;
const VISUAL_MAX_STEER = THREE.MathUtils.degToRad(26);
const REAR_DRIVE_VISUAL_SLIP = 5.8;
const REAR_DRIVE_VISUAL_SLIP_FADE_SPEED = 22;
const REAR_DRIVE_LAUNCH_SPIN = 10.5;

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

function createWheelWellLight(x, z, parent) {
    const light = new THREE.PointLight(0xffffff, 1.1, 8);
    light.position.set(x, 1.5, z);
    parent.add(light);
    return light;
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

function createSteerableWheel(x, z, parent, mirror = false) {
    const steeringPivot = new THREE.Group();
    steeringPivot.position.set(x, 0, z);
    parent.add(steeringPivot);

    const wheel = createWheel(0, 0, steeringPivot, mirror);
    return { steeringPivot, wheel };
}

function initializeWheels(car, options = {}) {
    const {
        addWheelWellLights = true,
    } = options;
    const frontAxleGroup = new THREE.Group();
    frontAxleGroup.name = 'front_axle_group';
    car.add(frontAxleGroup);

    const rearAxleGroup = new THREE.Group();
    rearAxleGroup.name = 'rear_axle_group';
    car.add(rearAxleGroup);

    const wheelLightGroup = new THREE.Group();
    wheelLightGroup.name = 'wheel_well_light_group';
    car.add(wheelLightGroup);

    const frontLeft = createSteerableWheel(-WHEEL_CENTER_X, FRONT_WHEEL_Z, frontAxleGroup, wheelMirrorConfig.frontLeft);
    const frontRight = createSteerableWheel(WHEEL_CENTER_X, FRONT_WHEEL_Z, frontAxleGroup, wheelMirrorConfig.frontRight);
    const backLeft = createWheel(-WHEEL_CENTER_X, REAR_WHEEL_Z, rearAxleGroup, wheelMirrorConfig.backLeft);
    const backRight = createWheel(WHEEL_CENTER_X, REAR_WHEEL_Z, rearAxleGroup, wheelMirrorConfig.backRight);
    frontLeft.steeringPivot.name = 'steering_pivot_front_left';
    frontRight.steeringPivot.name = 'steering_pivot_front_right';
    frontLeft.wheel.name = 'wheel_front_left';
    frontRight.wheel.name = 'wheel_front_right';
    backLeft.name = 'wheel_rear_left';
    backRight.name = 'wheel_rear_right';

    if (addWheelWellLights) {
        createWheelWellLight(-WHEEL_CENTER_X, FRONT_WHEEL_Z, wheelLightGroup);
        createWheelWellLight(WHEEL_CENTER_X, FRONT_WHEEL_Z, wheelLightGroup);
        createWheelWellLight(-WHEEL_CENTER_X, REAR_WHEEL_Z, wheelLightGroup);
        createWheelWellLight(WHEEL_CENTER_X, REAR_WHEEL_Z, wheelLightGroup);
    }

    const frontWheelMeshes = [frontLeft.wheel, frontRight.wheel];
    const rearWheelMeshes = [backLeft, backRight];
    const steerPivots = [frontLeft.steeringPivot, frontRight.steeringPivot];
    const detachableWheels = [
        {
            id: 'wheel_front_left',
            type: 'wheel',
            side: 'left',
            zone: 'front',
            source: frontLeft.wheel,
            groundOffset: WHEEL_RADIUS,
            baseLife: 5.8,
            mass: 1.05,
        },
        {
            id: 'wheel_front_right',
            type: 'wheel',
            side: 'right',
            zone: 'front',
            source: frontRight.wheel,
            groundOffset: WHEEL_RADIUS,
            baseLife: 5.8,
            mass: 1.05,
        },
        {
            id: 'wheel_rear_left',
            type: 'wheel',
            side: 'left',
            zone: 'rear',
            source: backLeft,
            groundOffset: WHEEL_RADIUS,
            baseLife: 5.8,
            mass: 1.1,
        },
        {
            id: 'wheel_rear_right',
            type: 'wheel',
            side: 'right',
            zone: 'rear',
            source: backRight,
            groundOffset: WHEEL_RADIUS,
            baseLife: 5.8,
            mass: 1.1,
        },
    ];

    return {
        update(vehicleState = {}, deltaTime = 1 / 60) {
            const dt = Math.min(deltaTime, 0.05);
            const targetSteer = getVisualSteerAngle(vehicleState);
            const steerLerp = 1 - Math.exp(-STEER_RESPONSE * dt);

            steerPivots.forEach((pivot) => {
                pivot.rotation.y = THREE.MathUtils.lerp(pivot.rotation.y, targetSteer, steerLerp);
            });

            const velocityLength = typeof vehicleState.velocity?.length === 'function'
                ? vehicleState.velocity.length()
                : Math.abs(vehicleState.speed || 0);
            const longitudinalSpeed = velocityLength < 0.01
                ? 0
                : (vehicleState.speed || 0);
            const baseRollAmount = (longitudinalSpeed / WHEEL_RADIUS) * dt;
            const speedAbs = Math.abs(vehicleState.speed || 0);
            const throttle = vehicleState.throttle || 0;
            const throttleAbs = Math.abs(throttle);
            const launchSlip = THREE.MathUtils.clamp(vehicleState.launchSlip || 0, 0, 1);
            const slipFade = 1 - THREE.MathUtils.clamp(speedAbs / REAR_DRIVE_VISUAL_SLIP_FADE_SPEED, 0, 1);
            const wheelSpinDirection = Math.sign(throttle) || Math.sign(longitudinalSpeed) || 1;
            const rearDriveSlipRoll = throttleAbs * slipFade * REAR_DRIVE_VISUAL_SLIP * dt * wheelSpinDirection;
            const launchSlipRoll = launchSlip * REAR_DRIVE_LAUNCH_SPIN * dt * wheelSpinDirection;

            frontWheelMeshes.forEach((wheel) => {
                wheel.rotation.x -= baseRollAmount;
            });
            rearWheelMeshes.forEach((wheel) => {
                wheel.rotation.x -= (baseRollAmount + rearDriveSlipRoll + launchSlipRoll);
            });
        },
        getDetachableWheels() {
            return detachableWheels;
        },
        getEditGroups() {
            return {
                frontAxleGroup,
                rearAxleGroup,
                wheelLightGroup,
                frontSteeringPivots: steerPivots,
            };
        },
    };
}

function getVisualSteerAngle(vehicleState = {}) {
    const physicalSteer = vehicleState.steerAngle || 0;
    return THREE.MathUtils.clamp(physicalSteer, -VISUAL_MAX_STEER, VISUAL_MAX_STEER);
}

export { initializeWheels };
