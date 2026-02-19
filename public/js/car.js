import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { initializeWheels } from './wheels.js';
import { addLightsToCar, addLuxuryBody, createSuspensionLinkage } from './carbody.js';

const DEFAULT_CAR_BASE_RIDE_HEIGHT = 0.088;
const PLAYER_REAR_LIGHT_Z = 2.045;

const SUSPENSION = {
    maxPitch: THREE.MathUtils.degToRad(4.8),
    maxRoll: THREE.MathUtils.degToRad(5.7),
    pitchAccelNorm: 42,
    brakeStoppiePitch: THREE.MathUtils.degToRad(5.8),
    brakeStoppieBrakeThreshold: 0.58,
    brakeStoppieDecelNorm: 70,
    brakeStoppieSpeedNorm: 38,
    brakeRearLiftHeave: 0.052,
    bodySpring: 36,
    bodyDamping: 8.4,
    heaveSpring: 22,
    heaveDamping: 5.8,
    rollFromSteer: 0.92,
    roadBaseAmplitude: 0.004,
    roadSpeedAmplitude: 0.014,
    terrainCompressionHeave: 0.086,
    terrainReboundHeave: 0.058,
    terrainVerticalSpeedHeave: 0.0085,
    damageRollPerWheel: THREE.MathUtils.degToRad(4.6),
    damagePitchPerWheel: THREE.MathUtils.degToRad(2.8),
    damageTurnRollGain: THREE.MathUtils.degToRad(1.8),
    damageHeaveSinkPerWheel: 0.028,
    damageLateralShiftPerWheel: 0.05,
    maxDamageExtraRoll: THREE.MathUtils.degToRad(8),
    maxDamageExtraPitch: THREE.MathUtils.degToRad(5.5),
};
const SUSPENSION_TUNING = {
    heightStep: 0.2,
    stiffnessStep: 0.2,
    minLevel: -1,
    maxLevel: 1,
    maxHeightOffset: 0.048,
    minStiffnessScale: 0.72,
    maxStiffnessScale: 1.48,
    minMotionScale: 0.08,
    maxMotionScale: 1.48,
};
const DAMAGE_SCRAPE = {
    sparkMaxCount: 72,
    sparkGravity: 19,
    sparkDrag: 5.8,
    sparkLifeMin: 0.11,
    sparkLifeMax: 0.24,
};
const BATTERY_COLOR_LOW = new THREE.Color(0xff4b4b);
const BATTERY_COLOR_MID = new THREE.Color(0xffd86b);
const BATTERY_COLOR_HIGH = new THREE.Color(0x8dff9a);
const BATTERY_CRITICAL_LEVEL = 0.22;
const BATTERY_WARNING_LEVEL = 0.6;
const POWER_DOWN = {
    collapseSink: -0.34,
    collapsePitch: 0,
    collapseWobble: 0.006,
    collapseRise: 9.5,
    collapseFall: 5.6,
    impactDrop: 0.058,
    impactDecay: 7.8,
};

export function createCarRig(options = {}) {
    const {
        bodyColor = 0x2d67a6,
        displayName = 'MAREK',
        addLights = true,
        addWheelWellLights = true,
        showBatteryIndicator = false,
        lightConfig = {},
        carBaseRideHeight = DEFAULT_CAR_BASE_RIDE_HEIGHT,
    } = options;

    const car = new THREE.Group();
    const bodyRig = new THREE.Group();
    const wheelRig = new THREE.Group();
    const lightRig = new THREE.Group();
    lightRig.name = 'light_rig';
    bodyRig.add(lightRig);
    car.add(wheelRig, bodyRig);

    // Keep tire contact visually aligned with the raised road surface planes.
    car.position.y = carBaseRideHeight;

    const bodyMeta = addLuxuryBody(bodyRig, { bodyColor, displayName });
    const wheelController = initializeWheels(wheelRig, { addWheelWellLights });
    const lightController = addLights ? addLightsToCar(lightRig, lightConfig) : null;
    const suspensionLinkage = createSuspensionLinkage(car, bodyRig, wheelRig, bodyMeta);
    const batteryIndicator = showBatteryIndicator
        ? createBatteryIndicator(bodyRig, bodyMeta)
        : null;
    let batteryLevelNormalized = 1;
    const detachableWheels = wheelController?.getDetachableWheels?.() || [];
    const detachableParts = [
        ...(bodyMeta?.detachablePanels || []),
        ...detachableWheels,
        ...(suspensionLinkage?.detachableLinks || []),
    ];
    const missingWheelState = createMissingWheelState();
    const scrapeSparkSystem = createScrapeSparkSystem(car);
    const wheelEditGroups = wheelController?.getEditGroups?.() || {};
    const editablePartDescriptors = buildEditablePartDescriptors({
        detachableParts,
        bodyMeta,
        wheelEditGroups,
        suspensionLinkage,
        lightRig,
        batteryIndicator,
    });
    const editablePartIndex = new Map(
        editablePartDescriptors.map((descriptor) => [descriptor.id, descriptor])
    );

    const suspensionState = {
        pitch: 0,
        pitchVelocity: 0,
        roll: 0,
        rollVelocity: 0,
        heave: 0,
        heaveVelocity: 0,
        lateralOffset: 0,
        lateralVelocity: 0,
        roadPhase: Math.random() * Math.PI * 2,
    };
    const suspensionTune = {
        heightLevel: 0,
        stiffnessLevel: 0,
    };
    let isBatteryDepleted = false;
    const powerDownState = {
        collapseBlend: 0,
        impactBlend: 0,
        blinkPhase: Math.random() * Math.PI * 2,
    };

    function clampSuspensionTuneLevel(level) {
        return THREE.MathUtils.clamp(level, SUSPENSION_TUNING.minLevel, SUSPENSION_TUNING.maxLevel);
    }

    function getSuspensionStiffnessScale() {
        const normalized =
            (suspensionTune.stiffnessLevel - SUSPENSION_TUNING.minLevel) /
            (SUSPENSION_TUNING.maxLevel - SUSPENSION_TUNING.minLevel);
        return THREE.MathUtils.lerp(
            SUSPENSION_TUNING.minStiffnessScale,
            SUSPENSION_TUNING.maxStiffnessScale,
            THREE.MathUtils.clamp(normalized, 0, 1)
        );
    }

    function getSuspensionHeightOffset() {
        return suspensionTune.heightLevel * SUSPENSION_TUNING.maxHeightOffset;
    }

    function getSuspensionMotionScale() {
        const normalized =
            (suspensionTune.stiffnessLevel - SUSPENSION_TUNING.minLevel) /
            (SUSPENSION_TUNING.maxLevel - SUSPENSION_TUNING.minLevel);
        return THREE.MathUtils.lerp(
            SUSPENSION_TUNING.maxMotionScale,
            SUSPENSION_TUNING.minMotionScale,
            THREE.MathUtils.clamp(normalized, 0, 1)
        );
    }

    function getSuspensionTuneSnapshot() {
        const heightNormalized =
            (suspensionTune.heightLevel - SUSPENSION_TUNING.minLevel) /
            (SUSPENSION_TUNING.maxLevel - SUSPENSION_TUNING.minLevel);
        const stiffnessNormalized =
            (suspensionTune.stiffnessLevel - SUSPENSION_TUNING.minLevel) /
            (SUSPENSION_TUNING.maxLevel - SUSPENSION_TUNING.minLevel);
        return {
            suspensionHeightLevel: suspensionTune.heightLevel,
            suspensionStiffnessLevel: suspensionTune.stiffnessLevel,
            suspensionHeightPercent: Math.round(
                THREE.MathUtils.clamp(heightNormalized, 0, 1) * 100
            ),
            suspensionStiffnessPercent: Math.round(
                THREE.MathUtils.clamp(stiffnessNormalized, 0, 1) * 100
            ),
            suspensionHeightMm: Math.round(getSuspensionHeightOffset() * 1000),
            suspensionStiffnessScale: getSuspensionStiffnessScale(),
        };
    }

    function updateVisuals(vehicleState, deltaTime) {
        const dt = Math.min(deltaTime || 1 / 60, 0.05);
        const rawVehicleState = vehicleState || {};
        const depletedVisual = isBatteryDepleted || Boolean(rawVehicleState.batteryDepleted);
        const collapseTarget = depletedVisual ? 1 : 0;
        const collapseRate = depletedVisual ? POWER_DOWN.collapseRise : POWER_DOWN.collapseFall;
        powerDownState.collapseBlend = THREE.MathUtils.lerp(
            powerDownState.collapseBlend,
            collapseTarget,
            1 - Math.exp(-collapseRate * dt)
        );
        powerDownState.impactBlend = Math.max(
            0,
            powerDownState.impactBlend - POWER_DOWN.impactDecay * dt
        );
        powerDownState.blinkPhase += dt * (depletedVisual ? 8.4 : 1.5);

        lightRig.visible = true;

        const suspensionSnapshot = getSuspensionTuneSnapshot();
        const vehicleVisualState = {
            ...rawVehicleState,
            batteryLevelNormalized,
            ...suspensionSnapshot,
            batteryDepleted: depletedVisual,
            batteryDepletedBlink: 0.5 + 0.5 * Math.sin(powerDownState.blinkPhase),
        };
        bodyMeta?.update?.(vehicleVisualState, dt);
        wheelController.update(vehicleVisualState, dt);
        lightController?.update(vehicleVisualState, dt);
        setWheelWellLightPower(depletedVisual ? 0 : 1);
        collectMissingWheelState(detachableWheels, missingWheelState);
        updateBodySuspension(vehicleVisualState, missingWheelState, dt, powerDownState);
        suspensionLinkage.update(missingWheelState, vehicleVisualState, dt);
        const scrapeContacts = suspensionLinkage.consumeScrapeContacts?.() || [];
        scrapeSparkSystem.update(vehicleVisualState, scrapeContacts, dt);
    }

    function setWheelWellLightPower(powerFactor = 1) {
        const lightGroup = wheelEditGroups?.wheelLightGroup;
        if (!lightGroup) {
            return;
        }
        const clampedPower = THREE.MathUtils.clamp(powerFactor, 0, 1);
        for (let i = 0; i < lightGroup.children.length; i += 1) {
            const child = lightGroup.children[i];
            if (!child?.isLight) {
                continue;
            }
            if (!Number.isFinite(child.userData.baseIntensity)) {
                child.userData.baseIntensity = child.intensity || 0;
            }
            if (!Number.isFinite(child.userData.baseDistance)) {
                child.userData.baseDistance = child.distance || 0;
            }
            child.intensity = child.userData.baseIntensity * clampedPower;
            child.distance = child.userData.baseDistance * clampedPower;
        }
    }

    function updateBodySuspension(vehicleState, missingWheels, dt, powerState = null) {
        const speedAbs = Math.abs(vehicleState.speed || 0);
        const speedRatio = THREE.MathUtils.clamp(speedAbs / 75, 0, 1);
        const stiffnessScale = getSuspensionStiffnessScale();
        const dampingScale = Math.sqrt(stiffnessScale);
        const motionScale = getSuspensionMotionScale();

        const accelNorm = THREE.MathUtils.clamp(
            (vehicleState.acceleration || 0) / SUSPENSION.pitchAccelNorm,
            -1,
            1
        );
        const brakeInput = THREE.MathUtils.clamp(vehicleState.brake || 0, 0, 1);
        const brakePressure = THREE.MathUtils.clamp(
            (brakeInput - SUSPENSION.brakeStoppieBrakeThreshold) /
                (1 - SUSPENSION.brakeStoppieBrakeThreshold),
            0,
            1
        );
        const brakeDecel = THREE.MathUtils.clamp(
            -(vehicleState.acceleration || 0) / SUSPENSION.brakeStoppieDecelNorm,
            0,
            1
        );
        const brakeSpeed = THREE.MathUtils.clamp(speedAbs / SUSPENSION.brakeStoppieSpeedNorm, 0, 1);
        const brakeStoppie = brakePressure * brakeDecel * brakeSpeed;
        const targetPitch =
            accelNorm * SUSPENSION.maxPitch - brakeStoppie * SUSPENSION.brakeStoppiePitch;

        const steerInput = THREE.MathUtils.clamp(vehicleState.steerInput || 0, -1, 1);
        const steerRoll = -steerInput * speedRatio * SUSPENSION.maxRoll * SUSPENSION.rollFromSteer;

        const sideWheelDelta = missingWheels.left - missingWheels.right;
        const axleWheelDelta = missingWheels.front - missingWheels.rear;
        const wheelDamageRoll = sideWheelDelta * SUSPENSION.damageRollPerWheel;
        const wheelDamagePitch = -axleWheelDelta * SUSPENSION.damagePitchPerWheel;
        const damageTurnGain = Math.min(1.25, 0.35 + speedRatio * 0.9 + missingWheels.total * 0.2);
        const wheelTurnRoll =
            steerInput * missingWheels.total * SUSPENSION.damageTurnRollGain * damageTurnGain;

        const maxRoll = SUSPENSION.maxRoll + SUSPENSION.maxDamageExtraRoll;
        const maxPitch = SUSPENSION.maxPitch + SUSPENSION.maxDamageExtraPitch;
        let targetRoll = THREE.MathUtils.clamp(
            (steerRoll + wheelDamageRoll + wheelTurnRoll) * motionScale,
            -maxRoll,
            maxRoll
        );
        let targetPitchWithDamage = THREE.MathUtils.clamp(
            (targetPitch + wheelDamagePitch) * motionScale,
            -maxPitch,
            maxPitch
        );

        suspensionState.roadPhase += dt * (1.8 + speedRatio * 9.5);
        const roadShake =
            Math.sin(suspensionState.roadPhase) * 0.65 +
            Math.sin(suspensionState.roadPhase * 1.9 + 0.7) * 0.35;
        const roadAmplitude =
            SUSPENSION.roadBaseAmplitude + speedRatio * SUSPENSION.roadSpeedAmplitude;
        const terrainCompression = THREE.MathUtils.clamp(
            vehicleState.terrainCompression || 0,
            -1.2,
            1.2
        );
        const terrainGrounded = THREE.MathUtils.clamp(vehicleState.terrainGrounded ?? 1, 0, 1);
        const terrainVerticalSpeed = THREE.MathUtils.clamp(vehicleState.verticalSpeed || 0, -8, 8);
        const terrainCompressionHeave =
            -Math.max(0, terrainCompression) * SUSPENSION.terrainCompressionHeave;
        const terrainReboundHeave =
            Math.max(0, -terrainCompression) * SUSPENSION.terrainReboundHeave;
        const terrainSpeedHeave = -terrainVerticalSpeed * SUSPENSION.terrainVerticalSpeedHeave;
        const terrainHeave = THREE.MathUtils.clamp(
            (terrainCompressionHeave + terrainReboundHeave + terrainSpeedHeave) *
                (0.5 + terrainGrounded * 0.5),
            -0.15,
            0.12
        );
        const dynamicSink = -Math.abs(targetRoll) * 0.15 - Math.abs(targetPitchWithDamage) * 0.12;
        const wheelLossSink = -missingWheels.total * SUSPENSION.damageHeaveSinkPerWheel;
        const brakeRearLiftHeave = brakeStoppie * SUSPENSION.brakeRearLiftHeave;
        let targetHeave =
            (roadShake * roadAmplitude +
                dynamicSink +
                wheelLossSink +
                terrainHeave +
                brakeRearLiftHeave) *
            motionScale;
        let targetLateralOffset =
            -sideWheelDelta * SUSPENSION.damageLateralShiftPerWheel * motionScale;
        const collapseBlend = THREE.MathUtils.clamp(powerState?.collapseBlend || 0, 0, 1);
        if (collapseBlend > 0) {
            const blinkPulse = 0.5 + 0.5 * Math.sin((powerState?.blinkPhase || 0) * 1.3);
            const collapseWobble = (blinkPulse - 0.5) * POWER_DOWN.collapseWobble * collapseBlend;
            const impactDrop = (powerState?.impactBlend || 0) * POWER_DOWN.impactDrop;
            targetPitchWithDamage = THREE.MathUtils.lerp(
                targetPitchWithDamage,
                POWER_DOWN.collapsePitch,
                collapseBlend
            );
            targetRoll = THREE.MathUtils.lerp(targetRoll, 0, collapseBlend);
            targetLateralOffset = THREE.MathUtils.lerp(targetLateralOffset, 0, collapseBlend);
            targetHeave = THREE.MathUtils.lerp(
                targetHeave,
                POWER_DOWN.collapseSink - impactDrop + collapseWobble,
                collapseBlend
            );
        }

        springToTarget(
            suspensionState,
            'pitch',
            'pitchVelocity',
            targetPitchWithDamage,
            SUSPENSION.bodySpring * stiffnessScale,
            SUSPENSION.bodyDamping * dampingScale,
            dt
        );
        springToTarget(
            suspensionState,
            'roll',
            'rollVelocity',
            targetRoll,
            SUSPENSION.bodySpring * stiffnessScale,
            SUSPENSION.bodyDamping * dampingScale,
            dt
        );
        springToTarget(
            suspensionState,
            'heave',
            'heaveVelocity',
            targetHeave,
            SUSPENSION.heaveSpring * stiffnessScale,
            SUSPENSION.heaveDamping * dampingScale,
            dt
        );
        springToTarget(
            suspensionState,
            'lateralOffset',
            'lateralVelocity',
            targetLateralOffset,
            SUSPENSION.heaveSpring * 0.86 * stiffnessScale,
            SUSPENSION.heaveDamping * dampingScale,
            dt
        );

        bodyRig.rotation.x = suspensionState.pitch;
        bodyRig.rotation.z = suspensionState.roll;
        bodyRig.position.x = suspensionState.lateralOffset;
        bodyRig.position.y =
            suspensionState.heave + getSuspensionHeightOffset() * (1 - collapseBlend);
    }

    return {
        car,
        updateVisuals,
        getCrashParts() {
            return detachableParts;
        },
        setBatteryLevel(levelNormalized) {
            batteryLevelNormalized = THREE.MathUtils.clamp(levelNormalized, 0, 1);
            batteryIndicator?.setLevel(batteryLevelNormalized);
            bodyMeta?.setBatteryLevel?.(batteryLevelNormalized);
        },
        setBatteryDepleted(isDepleted = false) {
            const nextDepleted = Boolean(isDepleted);
            if (nextDepleted === isBatteryDepleted) {
                return isBatteryDepleted;
            }
            isBatteryDepleted = nextDepleted;
            if (isBatteryDepleted) {
                powerDownState.impactBlend = 1;
            } else {
                powerDownState.impactBlend = 0;
                powerDownState.collapseBlend = 0;
            }
            return isBatteryDepleted;
        },
        adjustSuspensionHeight(direction = 0) {
            const delta = Number.isFinite(direction)
                ? Math.sign(direction) * SUSPENSION_TUNING.heightStep
                : 0;
            if (delta === 0) {
                return getSuspensionTuneSnapshot();
            }
            suspensionTune.heightLevel = clampSuspensionTuneLevel(
                suspensionTune.heightLevel + delta
            );
            return getSuspensionTuneSnapshot();
        },
        adjustSuspensionStiffness(direction = 0) {
            const delta = Number.isFinite(direction)
                ? Math.sign(direction) * SUSPENSION_TUNING.stiffnessStep
                : 0;
            if (delta === 0) {
                return getSuspensionTuneSnapshot();
            }
            suspensionTune.stiffnessLevel = clampSuspensionTuneLevel(
                suspensionTune.stiffnessLevel + delta
            );
            return getSuspensionTuneSnapshot();
        },
        getSuspensionTune() {
            return getSuspensionTuneSnapshot();
        },
        cycleRoofMenu(step = 1) {
            return bodyMeta?.cycleRoofMenu?.(step) || null;
        },
        setRoofMenuMode(modeKey) {
            return bodyMeta?.setRoofMenuMode?.(modeKey) || null;
        },
        setRoofMenuModeFromUv(uv) {
            return bodyMeta?.setRoofMenuModeFromUv?.(uv) || null;
        },
        getRoofMenuMode() {
            return bodyMeta?.getRoofMenuMode?.() || null;
        },
        setBodyColor(colorHex) {
            bodyMeta?.setBodyColor?.(colorHex);
        },
        getEditableParts() {
            return editablePartDescriptors.map((descriptor) => ({
                id: descriptor.id,
                label: descriptor.label,
                category: descriptor.category,
                visible: isEditablePartVisible(descriptor),
            }));
        },
        setEditablePartVisibility(partId, isVisible) {
            const descriptor = editablePartIndex.get(partId);
            if (!descriptor) {
                return false;
            }
            setEditablePartVisibility(descriptor, isVisible);
            return true;
        },
        setAllEditablePartsVisibility(isVisible) {
            for (let i = 0; i < editablePartDescriptors.length; i += 1) {
                setEditablePartVisibility(editablePartDescriptors[i], isVisible);
            }
        },
        captureEditablePartVisibility() {
            const snapshot = {};
            for (let i = 0; i < editablePartDescriptors.length; i += 1) {
                const descriptor = editablePartDescriptors[i];
                snapshot[descriptor.id] = isEditablePartVisible(descriptor);
            }
            return snapshot;
        },
        restoreEditablePartVisibility(snapshot = null) {
            if (!snapshot || typeof snapshot !== 'object') {
                return;
            }
            for (let i = 0; i < editablePartDescriptors.length; i += 1) {
                const descriptor = editablePartDescriptors[i];
                if (!(descriptor.id in snapshot)) {
                    continue;
                }
                setEditablePartVisibility(descriptor, snapshot[descriptor.id]);
            }
        },
    };

    function isEditablePartVisible(descriptor) {
        return descriptor.sources.some((source) => source?.visible !== false);
    }

    function setEditablePartVisibility(descriptor, isVisible) {
        const visible = Boolean(isVisible);
        for (let i = 0; i < descriptor.sources.length; i += 1) {
            const source = descriptor.sources[i];
            if (source) {
                source.visible = visible;
            }
        }
    }
}

function buildEditablePartDescriptors({
    detachableParts = [],
    bodyMeta = null,
    wheelEditGroups = null,
    suspensionLinkage = null,
    lightRig = null,
    batteryIndicator = null,
} = {}) {
    const descriptors = [];
    const descriptorIds = new Set();

    const register = ({ id, label, category, sources }) => {
        if (!id || descriptorIds.has(id)) {
            return;
        }
        const resolvedSources = (Array.isArray(sources) ? sources : [sources]).filter(Boolean);
        if (resolvedSources.length === 0) {
            return;
        }
        descriptorIds.add(id);
        descriptors.push({
            id,
            label,
            category,
            sources: resolvedSources,
        });
    };

    register({
        id: 'module_body_shell',
        label: 'Body shell',
        category: 'Modules',
        sources: bodyMeta?.editGroups?.bodyShellGroup,
    });
    register({
        id: 'module_roof',
        label: 'Roof module',
        category: 'Modules',
        sources: bodyMeta?.editGroups?.roofAssemblyGroup,
    });
    register({
        id: 'module_nameplate',
        label: 'Nameplate',
        category: 'Modules',
        sources: bodyMeta?.editGroups?.nameplateAssemblyGroup,
    });
    register({
        id: 'module_front_axle',
        label: 'Front axle',
        category: 'Modules',
        sources: wheelEditGroups?.frontAxleGroup,
    });
    register({
        id: 'module_rear_axle',
        label: 'Rear axle',
        category: 'Modules',
        sources: wheelEditGroups?.rearAxleGroup,
    });
    register({
        id: 'module_suspension',
        label: 'Suspension',
        category: 'Modules',
        sources: (suspensionLinkage?.detachableLinks || []).map((link) => link?.source),
    });
    register({
        id: 'module_lights',
        label: 'Lights',
        category: 'Modules',
        sources: lightRig,
    });
    register({
        id: 'module_wheel_well_lights',
        label: 'Wheel well lights',
        category: 'Modules',
        sources: wheelEditGroups?.wheelLightGroup,
    });
    register({
        id: 'module_battery',
        label: 'Battery indicator',
        category: 'Modules',
        sources: batteryIndicator?.group,
    });

    for (let i = 0; i < detachableParts.length; i += 1) {
        const part = detachableParts[i];
        if (!part?.id || !part?.source) {
            continue;
        }
        register({
            id: part.id,
            label: getEditablePartLabel(part),
            category: getEditablePartCategory(part),
            sources: part.source,
        });
    }

    return descriptors;
}

function getEditablePartCategory(part) {
    if (part?.type === 'wheel') {
        return 'Wheels';
    }
    if (part?.type === 'suspension_link') {
        return 'Suspension';
    }
    if (part?.type === 'body_panel') {
        return 'Body';
    }
    return 'Details';
}

function getEditablePartLabel(part) {
    const sideLabel = part?.side === 'left' ? 'left' : part?.side === 'right' ? 'right' : 'center';
    const zoneLabel = part?.zone === 'front' ? 'front' : part?.zone === 'rear' ? 'rear' : 'center';

    if (part?.type === 'wheel') {
        return `Wheel: ${zoneLabel} ${sideLabel}`;
    }
    if (part?.type === 'suspension_link') {
        return `Suspension: ${zoneLabel} ${sideLabel}`;
    }
    if (part?.type === 'body_panel') {
        return 'Body panel';
    }
    return part?.id || 'Part';
}

function springToTarget(state, valueKey, velocityKey, target, spring, damping, dt) {
    const value = state[valueKey];
    const velocity = state[velocityKey] + (target - value) * spring * dt;
    state[velocityKey] = velocity * Math.exp(-damping * dt);
    state[valueKey] = value + state[velocityKey] * dt;
}

function createMissingWheelState() {
    return {
        total: 0,
        left: 0,
        right: 0,
        front: 0,
        rear: 0,
        front_left: false,
        front_right: false,
        rear_left: false,
        rear_right: false,
    };
}

function collectMissingWheelState(wheelParts, outState) {
    outState.total = 0;
    outState.left = 0;
    outState.right = 0;
    outState.front = 0;
    outState.rear = 0;
    outState.front_left = false;
    outState.front_right = false;
    outState.rear_left = false;
    outState.rear_right = false;

    for (let i = 0; i < wheelParts.length; i += 1) {
        const part = wheelParts[i];
        if (part?.type !== 'wheel' || !part.source || part.source.visible) {
            continue;
        }

        outState.total += 1;
        if (part.side === 'left') {
            outState.left += 1;
        } else if (part.side === 'right') {
            outState.right += 1;
        }
        if (part.zone === 'front') {
            outState.front += 1;
        } else if (part.zone === 'rear') {
            outState.rear += 1;
        }

        const key = getWheelKey(part.side, part.zone);
        if (key && key in outState) {
            outState[key] = true;
        }
    }
}

function getWheelKey(side, zone) {
    if (!side || !zone) {
        return '';
    }
    return `${zone}_${side}`;
}

function createScrapeSparkSystem(car) {
    const sparkGeometry = new THREE.SphereGeometry(0.03, 6, 6);
    const sparks = [];
    const localPos = new THREE.Vector3();

    return {
        update(vehicleState, scrapeContacts = [], dt = 1 / 60) {
            updateSparkParticles(dt);
            if (!scrapeContacts || scrapeContacts.length === 0) {
                return;
            }

            const speedAbs = Math.abs(vehicleState?.speed || 0);
            for (let i = 0; i < scrapeContacts.length; i += 1) {
                const contact = scrapeContacts[i];
                if (!contact?.position) {
                    continue;
                }
                const intensity = THREE.MathUtils.clamp(contact.intensity || 0.4, 0, 1);
                emitSparkBurst(contact.position, intensity, speedAbs);
            }
        },
    };

    function emitSparkBurst(worldPosition, intensity, speedAbs) {
        localPos.copy(worldPosition);
        car.worldToLocal(localPos);

        const particleCount = 1 + Math.floor(Math.random() * (1 + intensity * 3));
        for (let i = 0; i < particleCount; i += 1) {
            if (sparks.length >= DAMAGE_SCRAPE.sparkMaxCount) {
                removeSpark(0);
            }

            const sparkMaterial = new THREE.MeshBasicMaterial({
                color: 0xffd28a,
                transparent: true,
                opacity: 0.95,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                toneMapped: false,
            });
            const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
            const scale = 0.62 + Math.random() * 0.86;
            spark.scale.setScalar(scale);
            spark.position.copy(localPos);
            spark.position.x += (Math.random() - 0.5) * 0.055;
            spark.position.y += (Math.random() - 0.5) * 0.03;
            spark.position.z += (Math.random() - 0.5) * 0.055;
            car.add(spark);

            const rearKick = THREE.MathUtils.lerp(1.2, 6.4, intensity) + speedAbs * 0.1;
            const lateralKick = (Math.random() - 0.5) * THREE.MathUtils.lerp(1.8, 6.1, intensity);
            const upwardKick = 1.5 + Math.random() * 2.3 + intensity * 2.15;
            const velocity = new THREE.Vector3(lateralKick, upwardKick, rearKick);

            const life =
                THREE.MathUtils.lerp(
                    DAMAGE_SCRAPE.sparkLifeMin,
                    DAMAGE_SCRAPE.sparkLifeMax,
                    Math.random()
                ) *
                (0.86 + intensity * 0.48);
            sparks.push({
                mesh: spark,
                velocity,
                life,
                maxLife: life,
            });
        }
    }

    function updateSparkParticles(dt) {
        for (let i = sparks.length - 1; i >= 0; i -= 1) {
            const spark = sparks[i];
            spark.life -= dt;
            if (spark.life <= 0) {
                removeSpark(i);
                continue;
            }

            spark.velocity.y -= DAMAGE_SCRAPE.sparkGravity * dt;
            spark.velocity.multiplyScalar(Math.exp(-DAMAGE_SCRAPE.sparkDrag * dt));
            spark.mesh.position.addScaledVector(spark.velocity, dt);

            const lifeNorm = spark.life / spark.maxLife;
            spark.mesh.material.opacity = lifeNorm * 0.95;
            spark.mesh.scale.multiplyScalar(0.965);
        }
    }

    function removeSpark(index) {
        const spark = sparks[index];
        if (!spark) {
            return;
        }
        const parent = spark.mesh.parent;
        if (parent) {
            parent.remove(spark.mesh);
        }
        spark.mesh.material?.dispose?.();
        sparks.splice(index, 1);
    }
}

function createBatteryIndicator(bodyRig, bodyMeta) {
    const bodyDimensions = bodyMeta?.bodyDimensions || { width: 1.2, height: 0.4, depth: 4 };
    const group = new THREE.Group();
    group.scale.setScalar(0.66);
    group.position.set(0, bodyDimensions.height * 0.62 + 0.52, -bodyDimensions.depth * 0.12);
    group.rotation.set(-0.08, 0, 0);
    bodyRig.add(group);

    const frame = new THREE.Mesh(
        new THREE.BoxGeometry(1.06, 0.38, 0.05),
        new THREE.MeshPhysicalMaterial({
            color: 0x0f1823,
            emissive: 0x2a3a4f,
            emissiveIntensity: 0.35,
            roughness: 0.22,
            metalness: 0.9,
            clearcoat: 1,
            clearcoatRoughness: 0.1,
        })
    );
    group.add(frame);

    const inner = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.24, 0.03),
        new THREE.MeshBasicMaterial({
            color: 0x050a12,
            transparent: true,
            opacity: 0.84,
        })
    );
    inner.position.z = 0.012;
    group.add(inner);

    const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.16, 0.04),
        new THREE.MeshStandardMaterial({
            color: 0x3f5168,
            emissive: 0x1f2f43,
            emissiveIntensity: 0.35,
            roughness: 0.34,
            metalness: 0.8,
        })
    );
    cap.position.set(0.58, 0, 0.004);
    group.add(cap);

    const fillPivot = new THREE.Group();
    fillPivot.position.set(-0.44, 0, 0.0155);
    group.add(fillPivot);

    const fill = new THREE.Mesh(
        new THREE.BoxGeometry(0.88, 0.22, 0.022),
        new THREE.MeshStandardMaterial({
            color: 0x8dff9a,
            emissive: 0x8dff9a,
            emissiveIntensity: 0.75,
            roughness: 0.25,
            metalness: 0.1,
        })
    );
    fill.position.x = 0.44;
    fillPivot.add(fill);

    const lineMaterial = new THREE.MeshBasicMaterial({
        color: 0x0b1727,
        transparent: true,
        opacity: 0.42,
    });
    for (let i = 1; i < 4; i += 1) {
        const divider = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.2, 0.024), lineMaterial);
        divider.position.set(-0.44 + i * 0.22, 0, 0.016);
        group.add(divider);
    }

    const glowBar = new THREE.Mesh(
        new THREE.PlaneGeometry(0.96, 0.3),
        new THREE.MeshBasicMaterial({
            color: 0x8dff9a,
            transparent: true,
            opacity: 0.08,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        })
    );
    glowBar.position.set(0, 0, 0.03);
    group.add(glowBar);

    const labelTexture = createBatteryLabelTexture();
    const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.2),
        new THREE.MeshBasicMaterial({
            map: labelTexture,
            transparent: true,
            depthWrite: false,
            toneMapped: false,
        })
    );
    label.position.set(0, 0, 0.031);
    group.add(label);

    const workColor = new THREE.Color();
    let lastLabelPercent = -1;

    setLevel(1);

    return { setLevel, group };

    function setLevel(levelNormalized) {
        const level = THREE.MathUtils.clamp(levelNormalized, 0, 1);
        fillPivot.scale.x = Math.max(level, 0.02);
        const batteryColor = getBatteryColor(level, workColor);
        fill.material.color.copy(batteryColor);
        fill.material.emissive.copy(batteryColor);
        fill.material.emissiveIntensity = 0.45 + level * 0.6;
        glowBar.material.color.copy(batteryColor);
        glowBar.material.opacity = 0.06 + level * 0.1;

        const percent = Math.round(level * 100);
        if (percent !== lastLabelPercent) {
            updateBatteryLabelTexture(labelTexture, percent, batteryColor);
            lastLabelPercent = percent;
        }
    }
}

function getBatteryColor(level, outColor) {
    if (level <= BATTERY_CRITICAL_LEVEL) {
        return outColor.copy(BATTERY_COLOR_LOW);
    }
    if (level <= BATTERY_WARNING_LEVEL) {
        const zoneT =
            (level - BATTERY_CRITICAL_LEVEL) / (BATTERY_WARNING_LEVEL - BATTERY_CRITICAL_LEVEL);
        return outColor.copy(BATTERY_COLOR_LOW).lerp(BATTERY_COLOR_MID, zoneT);
    }
    const zoneT = (level - BATTERY_WARNING_LEVEL) / (1 - BATTERY_WARNING_LEVEL);
    return outColor.copy(BATTERY_COLOR_MID).lerp(BATTERY_COLOR_HIGH, zoneT);
}

function createBatteryLabelTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 220;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
}

function updateBatteryLabelTexture(texture, percent, color) {
    const canvas = texture.image;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "900 122px 'Trebuchet MS', 'Arial Black', sans-serif";

    const hex = `#${color.getHexString()}`;
    ctx.strokeStyle = 'rgba(7, 16, 28, 0.9)';
    ctx.lineWidth = 16;
    ctx.strokeText(`${percent}%`, canvas.width / 2, canvas.height / 2 + 5);
    ctx.shadowColor = hex;
    ctx.shadowBlur = 28;
    ctx.fillStyle = '#eaf7ff';
    ctx.fillText(`${percent}%`, canvas.width / 2, canvas.height / 2 + 5);
    ctx.shadowBlur = 0;
    texture.needsUpdate = true;
}

const playerCarRig = createCarRig({
    bodyColor: 0x2d67a6,
    displayName: 'MAREK',
    addLights: true,
    lightConfig: {
        enableNearFillProjectors: false,
        enableFacadeFillProjectors: false,
        enableTaillightPointLights: true,
        enableTaillightSignature: true,
        enableTaillightHalo: true,
        enableReverseLights: true,
        taillightIntensity: 1.35,
        taillightDistance: 9.2,
        taillightDecay: 3,
        taillightSegmentCount: 5,
        taillightHaloOpacity: 0.092,
        taillightSweepTravel: 0.5,
        reverseLightIntensity: 1.62,
        reverseLightDistance: 13.5,
        taillightPositions: [
            { position: [-0.52, 0.54, PLAYER_REAR_LIGHT_Z] },
            { position: [0.52, 0.54, PLAYER_REAR_LIGHT_Z] },
        ],
    },
    showBatteryIndicator: false,
});

const car = playerCarRig.car;
const updateCarVisuals = playerCarRig.updateVisuals;
const setPlayerBatteryLevel = playerCarRig.setBatteryLevel;
const setPlayerBatteryDepleted = playerCarRig.setBatteryDepleted;
const getPlayerCarCrashParts = playerCarRig.getCrashParts;
const adjustPlayerSuspensionHeight = playerCarRig.adjustSuspensionHeight;
const adjustPlayerSuspensionStiffness = playerCarRig.adjustSuspensionStiffness;
const getPlayerSuspensionTune = playerCarRig.getSuspensionTune;
const cyclePlayerRoofMenu = playerCarRig.cycleRoofMenu;
const setPlayerRoofMenuMode = playerCarRig.setRoofMenuMode;
const setPlayerRoofMenuModeFromUv = playerCarRig.setRoofMenuModeFromUv;
const getPlayerRoofMenuMode = playerCarRig.getRoofMenuMode;
const setPlayerCarBodyColor = playerCarRig.setBodyColor;
const getPlayerCarEditableParts = playerCarRig.getEditableParts;
const setPlayerCarPartVisibility = playerCarRig.setEditablePartVisibility;
const setAllPlayerCarPartsVisibility = playerCarRig.setAllEditablePartsVisibility;
const capturePlayerCarPartVisibility = playerCarRig.captureEditablePartVisibility;
const restorePlayerCarPartVisibility = playerCarRig.restoreEditablePartVisibility;

export {
    car,
    updateCarVisuals,
    setPlayerBatteryLevel,
    setPlayerBatteryDepleted,
    getPlayerCarCrashParts,
    adjustPlayerSuspensionHeight,
    adjustPlayerSuspensionStiffness,
    getPlayerSuspensionTune,
    cyclePlayerRoofMenu,
    setPlayerRoofMenuMode,
    setPlayerRoofMenuModeFromUv,
    getPlayerRoofMenuMode,
    setPlayerCarBodyColor,
    getPlayerCarEditableParts,
    setPlayerCarPartVisibility,
    setAllPlayerCarPartsVisibility,
    capturePlayerCarPartVisibility,
    restorePlayerCarPartVisibility,
};
