import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

import {
    DEFAULT_PLAYER_WHEEL_PRESET_ID,
    getPlayerWheelPresetById,
    resolvePlayerWheelPresetId,
} from './wheel-presets.js';

const wheelMirrorConfig = {
    frontLeft: false,
    frontRight: true,
    backLeft: false,
    backRight: true,
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

function createWheelMaterials(wheelPreset) {
    return {
        tire: new THREE.MeshPhysicalMaterial({
            color: wheelPreset.tireColor,
            metalness: wheelPreset.tireMetalness,
            roughness: wheelPreset.tireRoughness,
            clearcoat: 0.1,
            clearcoatRoughness: 0.5,
        }),
        tireDetail: new THREE.MeshStandardMaterial({
            color: new THREE.Color(wheelPreset.tireColor).multiplyScalar(1.14),
            metalness: Math.max(0, wheelPreset.tireMetalness - 0.12),
            roughness: Math.min(1, wheelPreset.tireRoughness + 0.08),
        }),
        rimPrimary: new THREE.MeshPhysicalMaterial({
            color: wheelPreset.rimPrimaryColor,
            metalness: 1,
            roughness: 0.1,
            clearcoat: 1,
            clearcoatRoughness: 0.05,
            envMapIntensity: 2.1,
        }),
        rimSecondary: new THREE.MeshPhysicalMaterial({
            color: wheelPreset.rimSecondaryColor,
            metalness: 1,
            roughness: 0.14,
            clearcoat: 1,
            clearcoatRoughness: 0.07,
            envMapIntensity: 2.2,
        }),
        rimBase: new THREE.MeshPhysicalMaterial({
            color: wheelPreset.rimBaseColor,
            metalness: 0.72,
            roughness: 0.28,
            clearcoat: 0.78,
            clearcoatRoughness: 0.18,
        }),
        accent: new THREE.MeshPhysicalMaterial({
            color: wheelPreset.accentColor,
            emissive: wheelPreset.accentEmissiveColor,
            emissiveIntensity: wheelPreset.accentEmissiveIntensity,
            metalness: 0.95,
            roughness: 0.12,
            clearcoat: 1,
            clearcoatRoughness: 0.05,
        }),
        glow: new THREE.MeshPhysicalMaterial({
            color: wheelPreset.accentColor,
            emissive: wheelPreset.accentEmissiveColor,
            emissiveIntensity: wheelPreset.accentEmissiveIntensity * 1.28,
            metalness: 0.82,
            roughness: 0.18,
            transparent: true,
            opacity: 0.92,
        }),
        brakeDisk: new THREE.MeshPhysicalMaterial({
            color: wheelPreset.rotorColor,
            metalness: 0.84,
            roughness: 0.3,
        }),
        brakeHub: new THREE.MeshPhysicalMaterial({
            color: wheelPreset.hubColor,
            metalness: 0.94,
            roughness: 0.14,
            clearcoat: 1,
            clearcoatRoughness: 0.06,
        }),
    };
}

function applyShadowFlags(object) {
    object.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
}

function disposeObject3D(object) {
    object.traverse((child) => {
        if (!child.isMesh) {
            return;
        }
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) {
            for (let i = 0; i < child.material.length; i += 1) {
                child.material[i]?.dispose?.();
            }
            return;
        }
        child.material?.dispose?.();
    });
}

function clearGroupChildren(group) {
    const children = group.children.slice();
    for (let i = 0; i < children.length; i += 1) {
        const child = children[i];
        group.remove(child);
        disposeObject3D(child);
    }
}

function isPhotonTurbinePreset(wheelPreset) {
    return wheelPreset?.layout === 'photon-turbine';
}

function isObsidianHaloPreset(wheelPreset) {
    return wheelPreset?.layout === 'obsidian-halo';
}

function addSegmentedHaloRing(
    parent,
    {
        radius = 0.28,
        tube = 0.012,
        segments = 5,
        arc = Math.PI * 0.22,
        spinOffset = 0,
        positionX = 0,
        material,
    } = {}
) {
    for (let i = 0; i < segments; i += 1) {
        const haloSegment = new THREE.Mesh(
            new THREE.TorusGeometry(radius, tube, 10, 22, arc),
            material
        );
        haloSegment.rotation.y = Math.PI / 2;
        haloSegment.rotation.x = (Math.PI * 2 * i) / segments + spinOffset;
        haloSegment.position.x = positionX;
        parent.add(haloSegment);
    }
}

function createTire(materials, wheelPreset) {
    const tireGroup = new THREE.Group();

    const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, TIRE_WIDTH, 44, 1, true),
        materials.tire
    );
    tire.rotation.z = Math.PI / 2;
    tireGroup.add(tire);

    const outerCapGeometry = new THREE.CylinderGeometry(
        WHEEL_RADIUS * 0.985,
        WHEEL_RADIUS * 0.985,
        0.02,
        44
    );

    const leftSidewall = new THREE.Mesh(outerCapGeometry, materials.tire);
    leftSidewall.rotation.z = Math.PI / 2;
    leftSidewall.position.x = -(TIRE_WIDTH * 0.5 - 0.01);
    tireGroup.add(leftSidewall);

    const rightSidewall = leftSidewall.clone();
    rightSidewall.position.x *= -1;
    tireGroup.add(rightSidewall);

    const shoulderGeometry = new THREE.TorusGeometry(0.45, 0.028, 14, 54);
    const leftShoulder = new THREE.Mesh(shoulderGeometry, materials.tireDetail);
    leftShoulder.rotation.y = Math.PI / 2;
    leftShoulder.position.x = -(TIRE_WIDTH * 0.5 - 0.03);
    tireGroup.add(leftShoulder);

    const rightShoulder = leftShoulder.clone();
    rightShoulder.position.x *= -1;
    tireGroup.add(rightShoulder);

    if (isPhotonTurbinePreset(wheelPreset)) {
        const haloGeometry = new THREE.TorusGeometry(0.355, 0.01, 12, 52);
        const leftHalo = new THREE.Mesh(haloGeometry, materials.glow);
        leftHalo.rotation.y = Math.PI / 2;
        leftHalo.position.x = -(TIRE_WIDTH * 0.5 - 0.055);
        tireGroup.add(leftHalo);

        const rightHalo = leftHalo.clone();
        rightHalo.position.x *= -1;
        tireGroup.add(rightHalo);
    } else if (isObsidianHaloPreset(wheelPreset)) {
        addSegmentedHaloRing(tireGroup, {
            radius: 0.378,
            tube: 0.009,
            segments: 5,
            arc: Math.PI * 0.24,
            spinOffset: THREE.MathUtils.degToRad(10),
            positionX: -(TIRE_WIDTH * 0.5 - 0.056),
            material: materials.glow,
        });
        addSegmentedHaloRing(tireGroup, {
            radius: 0.378,
            tube: 0.009,
            segments: 5,
            arc: Math.PI * 0.24,
            spinOffset: THREE.MathUtils.degToRad(10),
            positionX: TIRE_WIDTH * 0.5 - 0.056,
            material: materials.glow,
        });
    }

    applyShadowFlags(tireGroup);
    return tireGroup;
}

function createRazorTenFace(side, mirror, materials) {
    const rim = new THREE.Group();

    const outerLip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.348, 0.348, 0.022, 54),
        materials.rimPrimary
    );
    outerLip.rotation.z = Math.PI / 2;
    rim.add(outerLip);

    const innerBarrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.315, 0.315, 0.028, 48),
        materials.rimBase
    );
    innerBarrel.rotation.z = Math.PI / 2;
    rim.add(innerBarrel);

    const spokeBackplate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.282, 0.282, 0.015, 40),
        materials.rimBase
    );
    spokeBackplate.rotation.z = Math.PI / 2;
    rim.add(spokeBackplate);

    const accentRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.275, 0.015, 10, 44),
        materials.accent
    );
    accentRing.rotation.y = Math.PI / 2;
    rim.add(accentRing);

    const spokeCount = 10;
    const spokeLength = 0.255;
    const spokeGeometry = new THREE.BoxGeometry(0.028, spokeLength, 0.034);
    spokeGeometry.translate(0, spokeLength * 0.5 - 0.02, 0);
    const spokeInsetGeometry = new THREE.BoxGeometry(0.014, spokeLength * 0.78, 0.04);
    spokeInsetGeometry.translate(0, spokeLength * 0.45 - 0.02, 0);

    for (let i = 0; i < spokeCount; i += 1) {
        const spoke = new THREE.Mesh(
            spokeGeometry,
            i % 2 === 0 ? materials.rimPrimary : materials.rimSecondary
        );
        spoke.rotation.x = (Math.PI * 2 * i) / spokeCount;
        spoke.rotation.z = i % 2 === 0 ? 0.12 : -0.12;
        rim.add(spoke);

        const spokeInset = new THREE.Mesh(spokeInsetGeometry, materials.accent);
        spokeInset.rotation.x = spoke.rotation.x;
        spokeInset.rotation.z = spoke.rotation.z;
        spokeInset.position.z = 0.008;
        rim.add(spokeInset);
    }

    const centerHub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.094, 0.094, 0.09, 28),
        materials.brakeHub
    );
    centerHub.rotation.z = Math.PI / 2;
    rim.add(centerHub);

    const centerCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.03, 24),
        materials.accent
    );
    centerCap.rotation.z = Math.PI / 2;
    centerCap.position.x = 0.005;
    rim.add(centerCap);

    rim.position.x = side * (TIRE_WIDTH * 0.5 + 0.01);
    if (mirror) {
        rim.scale.x *= -1;
    }

    applyShadowFlags(rim);
    return rim;
}

function createPhotonTurbineFace(side, mirror, materials) {
    const rim = new THREE.Group();

    const outerHalo = new THREE.Mesh(new THREE.TorusGeometry(0.292, 0.018, 12, 64), materials.glow);
    outerHalo.rotation.y = Math.PI / 2;
    rim.add(outerHalo);

    const outerLip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.338, 0.338, 0.022, 56),
        materials.rimSecondary
    );
    outerLip.rotation.z = Math.PI / 2;
    rim.add(outerLip);

    const innerBarrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.308, 0.308, 0.03, 52),
        materials.rimBase
    );
    innerBarrel.rotation.z = Math.PI / 2;
    rim.add(innerBarrel);

    const bladeCount = 8;
    const bladeLength = 0.226;
    const bladeGeometry = new THREE.BoxGeometry(0.048, bladeLength, 0.056);
    bladeGeometry.translate(0, bladeLength * 0.5 - 0.018, 0);
    const accentBladeGeometry = new THREE.BoxGeometry(0.02, bladeLength * 0.82, 0.07);
    accentBladeGeometry.translate(0, bladeLength * 0.46 - 0.016, 0);

    for (let i = 0; i < bladeCount; i += 1) {
        const blade = new THREE.Mesh(
            bladeGeometry,
            i % 2 === 0 ? materials.rimPrimary : materials.rimSecondary
        );
        blade.rotation.x = (Math.PI * 2 * i) / bladeCount;
        blade.rotation.z = 0.3;
        blade.position.z = -0.006;
        rim.add(blade);

        const accentBlade = new THREE.Mesh(accentBladeGeometry, materials.accent);
        accentBlade.rotation.x = blade.rotation.x + THREE.MathUtils.degToRad(4);
        accentBlade.rotation.z = 0.18;
        accentBlade.position.z = 0.018;
        rim.add(accentBlade);
    }

    const innerShield = new THREE.Mesh(
        new THREE.CylinderGeometry(0.176, 0.176, 0.018, 36),
        materials.rimBase
    );
    innerShield.rotation.z = Math.PI / 2;
    rim.add(innerShield);

    const centerHub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.102, 0.102, 0.09, 28),
        materials.brakeHub
    );
    centerHub.rotation.z = Math.PI / 2;
    rim.add(centerHub);

    const centerGlow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.058, 0.058, 0.028, 24),
        materials.glow
    );
    centerGlow.rotation.z = Math.PI / 2;
    centerGlow.position.x = 0.004;
    rim.add(centerGlow);

    rim.position.x = side * (TIRE_WIDTH * 0.5 + 0.01);
    if (mirror) {
        rim.scale.x *= -1;
    }

    applyShadowFlags(rim);
    return rim;
}

function createObsidianHaloFace(side, mirror, materials) {
    const rim = new THREE.Group();

    const outerLip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 0.026, 56),
        materials.rimBase
    );
    outerLip.rotation.z = Math.PI / 2;
    rim.add(outerLip);

    const lipTrim = new THREE.Mesh(
        new THREE.TorusGeometry(0.322, 0.014, 10, 52),
        materials.rimSecondary
    );
    lipTrim.rotation.y = Math.PI / 2;
    rim.add(lipTrim);

    const innerBarrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.304, 0.304, 0.054, 48),
        materials.rimBase
    );
    innerBarrel.rotation.z = Math.PI / 2;
    innerBarrel.position.x = -side * 0.016;
    rim.add(innerBarrel);

    const armorPlate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.238, 0.238, 0.032, 34),
        materials.rimPrimary
    );
    armorPlate.rotation.z = Math.PI / 2;
    armorPlate.position.x = -side * 0.028;
    rim.add(armorPlate);

    addSegmentedHaloRing(rim, {
        radius: 0.278,
        tube: 0.012,
        segments: 5,
        arc: Math.PI * 0.2,
        spinOffset: THREE.MathUtils.degToRad(14),
        material: materials.glow,
    });

    const spokeCount = 5;
    const spokeLength = 0.21;
    const spokeGeometry = new THREE.BoxGeometry(0.074, spokeLength, 0.064);
    spokeGeometry.translate(0, spokeLength * 0.5 - 0.022, 0);
    const spokeInsetGeometry = new THREE.BoxGeometry(0.018, spokeLength * 0.74, 0.078);
    spokeInsetGeometry.translate(0, spokeLength * 0.44 - 0.02, 0);

    for (let i = 0; i < spokeCount; i += 1) {
        const spoke = new THREE.Mesh(
            spokeGeometry,
            i % 2 === 0 ? materials.rimSecondary : materials.rimBase
        );
        spoke.rotation.x = (Math.PI * 2 * i) / spokeCount;
        spoke.rotation.z = i % 2 === 0 ? 0.22 : 0.08;
        spoke.position.x = -side * 0.014;
        rim.add(spoke);

        const spokeInset = new THREE.Mesh(spokeInsetGeometry, materials.accent);
        spokeInset.rotation.x = spoke.rotation.x + THREE.MathUtils.degToRad(3);
        spokeInset.rotation.z = spoke.rotation.z - 0.08;
        spokeInset.position.x = -side * 0.003;
        spokeInset.position.z = 0.016;
        rim.add(spokeInset);
    }

    const coreRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.126, 0.016, 10, 32),
        materials.rimSecondary
    );
    coreRing.rotation.y = Math.PI / 2;
    coreRing.position.x = -side * 0.018;
    rim.add(coreRing);

    const coreFinGeometry = new THREE.BoxGeometry(0.024, 0.064, 0.03);
    coreFinGeometry.translate(0, 0.085, 0);
    for (let i = 0; i < 6; i += 1) {
        const coreFin = new THREE.Mesh(
            coreFinGeometry,
            i % 2 === 0 ? materials.accent : materials.rimSecondary
        );
        coreFin.rotation.x = (Math.PI * 2 * i) / 6;
        coreFin.position.x = -side * 0.01;
        rim.add(coreFin);
    }

    const centerHub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.098, 0.098, 0.094, 28),
        materials.brakeHub
    );
    centerHub.rotation.z = Math.PI / 2;
    centerHub.position.x = -side * 0.008;
    rim.add(centerHub);

    const centerCore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.034, 24),
        materials.glow
    );
    centerCore.rotation.z = Math.PI / 2;
    centerCore.position.x = 0.008 - side * 0.01;
    rim.add(centerCore);

    rim.position.x = side * (TIRE_WIDTH * 0.5 + 0.01);
    if (mirror) {
        rim.scale.x *= -1;
    }

    applyShadowFlags(rim);
    return rim;
}

function createRimFace(wheelPreset, materials, side, mirror) {
    if (isPhotonTurbinePreset(wheelPreset)) {
        return createPhotonTurbineFace(side, mirror, materials);
    }
    if (isObsidianHaloPreset(wheelPreset)) {
        return createObsidianHaloFace(side, mirror, materials);
    }
    return createRazorTenFace(side, mirror, materials);
}

function createBrakeDisk(materials, wheelPreset) {
    const brakeGroup = new THREE.Group();

    const rotor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.398, 0.398, 0.042, 36),
        materials.brakeDisk
    );
    rotor.rotation.z = Math.PI / 2;
    brakeGroup.add(rotor);

    const carrier = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.05, 28),
        materials.rimBase
    );
    carrier.rotation.z = Math.PI / 2;
    brakeGroup.add(carrier);

    const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.075, 0.08, 20),
        materials.brakeHub
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.x = 0.008;
    brakeGroup.add(hub);

    if (isPhotonTurbinePreset(wheelPreset)) {
        const glowDisc = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 0.01, 20),
            materials.glow
        );
        glowDisc.rotation.z = Math.PI / 2;
        glowDisc.position.x = 0.03;
        brakeGroup.add(glowDisc);
    } else if (isObsidianHaloPreset(wheelPreset)) {
        const coreRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.148, 0.009, 10, 28),
            materials.glow
        );
        coreRing.rotation.y = Math.PI / 2;
        coreRing.position.x = 0.022;
        brakeGroup.add(coreRing);

        const boltGeometry = new THREE.BoxGeometry(0.018, 0.046, 0.016);
        boltGeometry.translate(0, 0.126, 0);
        for (let i = 0; i < 6; i += 1) {
            const bolt = new THREE.Mesh(
                boltGeometry,
                i % 2 === 0 ? materials.accent : materials.rimSecondary
            );
            bolt.rotation.x = (Math.PI * 2 * i) / 6;
            bolt.position.x = 0.018;
            brakeGroup.add(bolt);
        }
    }

    brakeGroup.position.set(0, 0, 0.1);
    applyShadowFlags(brakeGroup);
    return brakeGroup;
}

function createWheelAssembly(wheelPreset, mirror = false) {
    const materials = createWheelMaterials(wheelPreset);
    const wheel = new THREE.Group();

    wheel.add(createTire(materials, wheelPreset));
    wheel.add(createRimFace(wheelPreset, materials, 1, mirror));
    wheel.add(createRimFace(wheelPreset, materials, -1, mirror));
    wheel.add(createBrakeDisk(materials, wheelPreset));

    applyShadowFlags(wheel);
    return wheel;
}

function createWheelPreviewMesh(wheelPresetId = DEFAULT_PLAYER_WHEEL_PRESET_ID, options = {}) {
    const { mirror = false } = options;
    const resolvedPreset = getPlayerWheelPresetById(resolvePlayerWheelPresetId(wheelPresetId));
    const wheel = createWheelAssembly(resolvedPreset, mirror);
    wheel.name = `wheel_preview_${resolvedPreset.id}`;
    return wheel;
}

function createWheel(x, z, parent, wheelPreset, mirror = false) {
    const wheel = createWheelAssembly(wheelPreset, mirror);
    wheel.position.set(x, 0.5, z);
    parent.add(wheel);
    return wheel;
}

function createSteerableWheel(x, z, parent, wheelPreset, mirror = false) {
    const steeringPivot = new THREE.Group();
    steeringPivot.position.set(x, 0, z);
    parent.add(steeringPivot);

    const wheel = createWheel(0, 0, steeringPivot, wheelPreset, mirror);
    return { steeringPivot, wheel };
}

function createWheelWellLight(x, z, parent) {
    const light = new THREE.PointLight(0xffffff, 1.1, 8);
    light.position.set(x, 1.5, z);
    parent.add(light);
    return light;
}

function initializeWheels(car, options = {}) {
    const { addWheelWellLights = true, wheelPresetId = DEFAULT_PLAYER_WHEEL_PRESET_ID } = options;
    const frontAxleGroup = new THREE.Group();
    frontAxleGroup.name = 'front_axle_group';
    car.add(frontAxleGroup);

    const rearAxleGroup = new THREE.Group();
    rearAxleGroup.name = 'rear_axle_group';
    car.add(rearAxleGroup);

    const wheelLightGroup = new THREE.Group();
    wheelLightGroup.name = 'wheel_well_light_group';
    car.add(wheelLightGroup);

    if (addWheelWellLights) {
        createWheelWellLight(-WHEEL_CENTER_X, FRONT_WHEEL_Z, wheelLightGroup);
        createWheelWellLight(WHEEL_CENTER_X, FRONT_WHEEL_Z, wheelLightGroup);
        createWheelWellLight(-WHEEL_CENTER_X, REAR_WHEEL_Z, wheelLightGroup);
        createWheelWellLight(WHEEL_CENTER_X, REAR_WHEEL_Z, wheelLightGroup);
    }

    const frontWheelMeshes = [];
    const rearWheelMeshes = [];
    const steerPivots = [];
    const detachableWheels = [
        {
            id: 'wheel_front_left',
            type: 'wheel',
            side: 'left',
            zone: 'front',
            source: null,
            groundOffset: WHEEL_RADIUS,
            baseLife: 5.8,
            mass: 1.05,
        },
        {
            id: 'wheel_front_right',
            type: 'wheel',
            side: 'right',
            zone: 'front',
            source: null,
            groundOffset: WHEEL_RADIUS,
            baseLife: 5.8,
            mass: 1.05,
        },
        {
            id: 'wheel_rear_left',
            type: 'wheel',
            side: 'left',
            zone: 'rear',
            source: null,
            groundOffset: WHEEL_RADIUS,
            baseLife: 5.8,
            mass: 1.1,
        },
        {
            id: 'wheel_rear_right',
            type: 'wheel',
            side: 'right',
            zone: 'rear',
            source: null,
            groundOffset: WHEEL_RADIUS,
            baseLife: 5.8,
            mass: 1.1,
        },
    ];

    let currentWheelPresetId = resolvePlayerWheelPresetId(wheelPresetId);

    rebuildWheelMeshes();

    return {
        update(vehicleState = {}, deltaTime = 1 / 60) {
            const dt = Math.min(deltaTime, 0.05);
            const targetSteer = getVisualSteerAngle(vehicleState);
            const steerLerp = 1 - Math.exp(-STEER_RESPONSE * dt);

            for (let i = 0; i < steerPivots.length; i += 1) {
                const pivot = steerPivots[i];
                pivot.rotation.y = THREE.MathUtils.lerp(pivot.rotation.y, targetSteer, steerLerp);
            }

            const velocityLength =
                typeof vehicleState.velocity?.length === 'function'
                    ? vehicleState.velocity.length()
                    : Math.abs(vehicleState.speed || 0);
            const longitudinalSpeed = velocityLength < 0.01 ? 0 : vehicleState.speed || 0;
            const baseRollAmount = (longitudinalSpeed / WHEEL_RADIUS) * dt;
            const speedAbs = Math.abs(vehicleState.speed || 0);
            const throttle = vehicleState.throttle || 0;
            const throttleAbs = Math.abs(throttle);
            const launchSlip = THREE.MathUtils.clamp(vehicleState.launchSlip || 0, 0, 1);
            const slipFade =
                1 - THREE.MathUtils.clamp(speedAbs / REAR_DRIVE_VISUAL_SLIP_FADE_SPEED, 0, 1);
            const wheelSpinDirection = Math.sign(throttle) || Math.sign(longitudinalSpeed) || 1;
            const rearDriveSlipRoll =
                throttleAbs * slipFade * REAR_DRIVE_VISUAL_SLIP * dt * wheelSpinDirection;
            const launchSlipRoll = launchSlip * REAR_DRIVE_LAUNCH_SPIN * dt * wheelSpinDirection;

            for (let i = 0; i < frontWheelMeshes.length; i += 1) {
                frontWheelMeshes[i].rotation.x -= baseRollAmount;
            }
            for (let i = 0; i < rearWheelMeshes.length; i += 1) {
                rearWheelMeshes[i].rotation.x -=
                    baseRollAmount + rearDriveSlipRoll + launchSlipRoll;
            }
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
        getWheelPresetId() {
            return currentWheelPresetId;
        },
        setWheelPreset(nextWheelPresetId) {
            const resolvedWheelPresetId = resolvePlayerWheelPresetId(nextWheelPresetId);
            if (resolvedWheelPresetId === currentWheelPresetId) {
                return currentWheelPresetId;
            }

            const visibilitySnapshot = detachableWheels.map((wheelPart) =>
                wheelPart.source ? wheelPart.source.visible !== false : true
            );
            currentWheelPresetId = resolvedWheelPresetId;
            rebuildWheelMeshes();
            for (let i = 0; i < detachableWheels.length; i += 1) {
                if (!detachableWheels[i].source) {
                    continue;
                }
                detachableWheels[i].source.visible = visibilitySnapshot[i] !== false;
            }
            return currentWheelPresetId;
        },
    };

    function rebuildWheelMeshes() {
        const activePreset = getPlayerWheelPresetById(currentWheelPresetId);
        clearGroupChildren(frontAxleGroup);
        clearGroupChildren(rearAxleGroup);
        frontWheelMeshes.length = 0;
        rearWheelMeshes.length = 0;
        steerPivots.length = 0;

        const frontLeft = createSteerableWheel(
            -WHEEL_CENTER_X,
            FRONT_WHEEL_Z,
            frontAxleGroup,
            activePreset,
            wheelMirrorConfig.frontLeft
        );
        const frontRight = createSteerableWheel(
            WHEEL_CENTER_X,
            FRONT_WHEEL_Z,
            frontAxleGroup,
            activePreset,
            wheelMirrorConfig.frontRight
        );
        const backLeft = createWheel(
            -WHEEL_CENTER_X,
            REAR_WHEEL_Z,
            rearAxleGroup,
            activePreset,
            wheelMirrorConfig.backLeft
        );
        const backRight = createWheel(
            WHEEL_CENTER_X,
            REAR_WHEEL_Z,
            rearAxleGroup,
            activePreset,
            wheelMirrorConfig.backRight
        );

        frontLeft.steeringPivot.name = 'steering_pivot_front_left';
        frontRight.steeringPivot.name = 'steering_pivot_front_right';
        frontLeft.wheel.name = 'wheel_front_left';
        frontRight.wheel.name = 'wheel_front_right';
        backLeft.name = 'wheel_rear_left';
        backRight.name = 'wheel_rear_right';

        frontWheelMeshes.push(frontLeft.wheel, frontRight.wheel);
        rearWheelMeshes.push(backLeft, backRight);
        steerPivots.push(frontLeft.steeringPivot, frontRight.steeringPivot);
        detachableWheels[0].source = frontLeft.wheel;
        detachableWheels[1].source = frontRight.wheel;
        detachableWheels[2].source = backLeft;
        detachableWheels[3].source = backRight;
    }
}

function getVisualSteerAngle(vehicleState = {}) {
    const physicalSteer = vehicleState.steerAngle || 0;
    return THREE.MathUtils.clamp(physicalSteer, -VISUAL_MAX_STEER, VISUAL_MAX_STEER);
}

export { createWheelPreviewMesh, initializeWheels };
