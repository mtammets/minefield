import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { createCarRig } from './car.js';
import {
    CAR_COLOR_PRESETS,
    DEFAULT_PLAYER_CAR_COLOR_HEX,
    WELCOME_CAR_SPIN_SPEED,
    WELCOME_PREVIEW_STATE_SPEED,
    WELCOME_PREVIEW_REAR_LIGHT_Z,
} from './constants.js';

const SWAP_TIMING = {
    exitSec: 0.28,
    gapSec: 0.08,
    enterSec: 0.28,
    settleSec: 0.12,
};

export function createWelcomeModalController({
    onStart,
    onColorChange,
    initialColorHex,
    getCurrentColorHex,
    resolvePlayerCarColorHex,
    getCarColorPresetIndex,
} = {}) {
    const resolveColorHex =
        typeof resolvePlayerCarColorHex === 'function'
            ? resolvePlayerCarColorHex
            : (colorHex) =>
                  Number.isFinite(colorHex) ? colorHex >>> 0 : DEFAULT_PLAYER_CAR_COLOR_HEX >>> 0;
    const resolvePresetIndex =
        typeof getCarColorPresetIndex === 'function' ? getCarColorPresetIndex : () => 0;
    const currentColorGetter =
        typeof getCurrentColorHex === 'function' ? getCurrentColorHex : () => initialColorHex;

    const rootEl = document.getElementById('welcomeModal');
    const previewShellEl = document.getElementById('welcomePreviewShell');
    const startBtnEl = document.getElementById('welcomeStartBtn');
    const previewCanvasEl = document.getElementById('welcomeCarCanvas');
    const prevVehicleBtnEl = document.getElementById('welcomeVehiclePrevBtn');
    const nextVehicleBtnEl = document.getElementById('welcomeVehicleNextBtn');
    const selectedColorNameEl = document.getElementById('welcomeSelectedColorName');

    if (!rootEl || !startBtnEl || !previewCanvasEl) {
        const fallbackColorHex = resolveColorHex(initialColorHex);
        return {
            show() {},
            hide() {},
            resize() {},
            update() {},
            isVisible() {
                return false;
            },
            isAvailable() {
                return false;
            },
            getSelectedColorHex() {
                return fallbackColorHex;
            },
            setSelectedColorHex() {},
            selectNeighborColor() {},
        };
    }

    const previewScene = new THREE.Scene();
    const previewCamera = new THREE.PerspectiveCamera(31, 16 / 9, 0.1, 100);
    const previewRenderer = new THREE.WebGLRenderer({
        canvas: previewCanvasEl,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
    });
    previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
    previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    previewRenderer.toneMappingExposure = 1.18;

    const skyFillLight = new THREE.HemisphereLight(0xaed8ff, 0x0f1b2d, 1.04);
    previewScene.add(skyFillLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.92);
    keyLight.position.set(4.4, 5.8, 6.1);
    previewScene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x9cc5ff, 0.7);
    rimLight.position.set(-5.4, 3.2, -4.7);
    previewScene.add(rimLight);

    const underGlow = new THREE.Mesh(
        new THREE.CircleGeometry(2.45, 48),
        new THREE.MeshBasicMaterial({
            color: 0x7fc0ff,
            transparent: true,
            opacity: 0.16,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        })
    );
    underGlow.rotation.x = -Math.PI * 0.5;
    underGlow.position.y = 0.02;
    previewScene.add(underGlow);

    const previewVehicles = [createPreviewVehicle(), createPreviewVehicle()];
    let activeVehicleIndex = 0;
    let previewSpinYaw = Math.PI * 0.32;
    let selectedColorIndex = resolvePresetIndex(initialColorHex);
    let previewPulseTime = Math.random() * Math.PI * 2;

    const previewState = {
        speed: WELCOME_PREVIEW_STATE_SPEED,
        acceleration: 0,
        steerInput: 0,
        throttle: 0.62,
        brake: 0.18,
        burnout: 0,
        launchSlip: 0.14,
        yawRate: 0.06,
        velocity: new THREE.Vector2(0, -WELCOME_PREVIEW_STATE_SPEED),
        terrainCompression: 0,
        terrainGrounded: 1,
        verticalSpeed: 0,
    };

    const previewBounds = new THREE.Box3().setFromObject(previewVehicles[0].car);
    const previewSize = previewBounds.getSize(new THREE.Vector3());
    const previewRadius = Math.max(previewSize.x, previewSize.y, previewSize.z);
    const previewLookAt = new THREE.Vector3(0, previewSize.y * 0.28, 0);
    const previewCameraBasePosition = new THREE.Vector3(
        previewRadius * 1.48,
        previewRadius * 0.76,
        previewRadius * 1.85
    );

    const transition = {
        active: false,
        phase: 'idle',
        phaseTime: 0,
        direction: 1,
        targetIndex: selectedColorIndex,
        emitChange: true,
        outgoingVehicleIndex: 0,
        incomingVehicleIndex: 1,
        glowBoost: 0,
        cameraKick: 0,
        queue: null,
    };

    previewCamera.position.copy(previewCameraBasePosition);
    previewCamera.lookAt(previewLookAt);
    resetTransitionVisuals();
    applySelectedPreset(selectedColorIndex, false);
    bindVehicleButtons();

    startBtnEl.addEventListener('click', () => {
        onStart?.();
    });

    return {
        show() {
            rootEl.hidden = false;
            forceSelectPreset(resolvePresetIndex(currentColorGetter()), false);
            syncPreviewSize();
            updatePreviewVisualState(1 / 60);
            applyPreviewPose();
            renderPreview();
        },
        hide() {
            rootEl.hidden = true;
        },
        resize() {
            syncPreviewSize();
            if (!rootEl.hidden) {
                renderPreview();
            }
        },
        update(dt) {
            if (rootEl.hidden) {
                return;
            }
            const frameDt = Math.min(Math.max(dt || 0, 0), 0.05);
            previewSpinYaw += frameDt * WELCOME_CAR_SPIN_SPEED;
            updateTransition(frameDt);
            updatePreviewVisualState(frameDt);
            applyPreviewPose();
            renderPreview();
        },
        isVisible() {
            return !rootEl.hidden;
        },
        isAvailable() {
            return true;
        },
        getSelectedColorHex() {
            return CAR_COLOR_PRESETS[selectedColorIndex]?.hex ?? DEFAULT_PLAYER_CAR_COLOR_HEX;
        },
        setSelectedColorHex(colorHex, options = {}) {
            const { emitChange = true } = options;
            forceSelectPreset(resolvePresetIndex(colorHex), emitChange);
        },
        selectNeighborColor(step = 1) {
            const direction = Math.sign(step || 1) || 1;
            const baseIndex = transition.active ? transition.targetIndex : selectedColorIndex;
            requestSwap(baseIndex + direction, direction, true);
        },
    };

    function syncPreviewSize() {
        const width = Math.max(
            1,
            Math.round(previewCanvasEl.clientWidth || previewCanvasEl.width || 560)
        );
        const height = Math.max(
            1,
            Math.round(previewCanvasEl.clientHeight || previewCanvasEl.height || 300)
        );
        previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        previewRenderer.setSize(width, height, false);
        previewCamera.aspect = width / height;
        previewCamera.updateProjectionMatrix();
    }

    function renderPreview() {
        previewRenderer.render(previewScene, previewCamera);
    }

    function updatePreviewVisualState(dt) {
        previewPulseTime += Math.min(Math.max(dt || 0, 0), 0.05);
        const throttleWave = 0.5 + 0.5 * Math.sin(previewPulseTime * 1.2);
        const brakeWave = 0.5 + 0.5 * Math.sin(previewPulseTime * 2.6 + 0.4);
        const steerWave = Math.sin(previewPulseTime * 0.92);
        const launchWave = 0.5 + 0.5 * Math.sin(previewPulseTime * 1.8 + 0.9);
        const batteryWave = 0.5 + 0.5 * Math.sin(previewPulseTime * 0.22 + 0.7);

        previewState.throttle = 0.46 + throttleWave * 0.46;
        previewState.brake = 0.14 + brakeWave * 0.56;
        previewState.steerInput = steerWave * 0.38;
        previewState.launchSlip = 0.12 + launchWave * 0.26;
        previewState.burnout = launchWave * 0.12;
        previewState.speed = WELCOME_PREVIEW_STATE_SPEED + throttleWave * 6;
        previewState.velocity.set(0, -previewState.speed);
        previewState.acceleration = 3.4 * Math.sin(previewPulseTime * 1.42 + 0.15);
        previewState.yawRate = steerWave * 0.22;

        for (let i = 0; i < previewVehicles.length; i += 1) {
            previewVehicles[i].rig.setBatteryLevel(0.34 + batteryWave * 0.62);
            previewVehicles[i].rig.updateVisuals(previewState, dt || 1 / 60);
        }
    }

    function bindVehicleButtons() {
        prevVehicleBtnEl?.addEventListener('click', () => {
            const baseIndex = transition.active ? transition.targetIndex : selectedColorIndex;
            requestSwap(baseIndex - 1, -1, true);
        });
        nextVehicleBtnEl?.addEventListener('click', () => {
            const baseIndex = transition.active ? transition.targetIndex : selectedColorIndex;
            requestSwap(baseIndex + 1, 1, true);
        });
    }

    function forceSelectPreset(nextIndex, emitChange = true) {
        const wrappedIndex = getWrappedIndex(nextIndex);
        transition.active = false;
        transition.phase = 'idle';
        transition.phaseTime = 0;
        transition.queue = null;
        transition.cameraKick = 0;
        transition.glowBoost = 0;
        resetTransitionVisuals();
        applySelectedPreset(wrappedIndex, emitChange);
    }

    function requestSwap(nextIndex, direction = 1, emitChange = true) {
        if (!CAR_COLOR_PRESETS.length) {
            return;
        }

        const targetIndex = getWrappedIndex(nextIndex);
        const directionalSign = direction < 0 ? -1 : 1;

        if (!transition.active && targetIndex === selectedColorIndex) {
            return;
        }

        if (transition.active) {
            transition.queue = {
                index: targetIndex,
                direction: directionalSign,
                emitChange,
            };
            renderSelectedVehicleLabel(targetIndex);
            updateVehicleButtonLabels(targetIndex);
            return;
        }

        startSwap(targetIndex, directionalSign, emitChange);
    }

    function startSwap(targetIndex, direction = 1, emitChange = true) {
        const incomingVehicleIndex = activeVehicleIndex === 0 ? 1 : 0;
        const outgoingVehicleIndex = activeVehicleIndex;
        const incomingVehicle = previewVehicles[incomingVehicleIndex];
        const targetPreset = CAR_COLOR_PRESETS[targetIndex];

        incomingVehicle.rig.setBodyColor(targetPreset.hex);
        incomingVehicle.car.visible = false;

        transition.active = true;
        transition.phase = 'exit';
        transition.phaseTime = 0;
        transition.direction = direction;
        transition.targetIndex = targetIndex;
        transition.emitChange = emitChange;
        transition.outgoingVehicleIndex = outgoingVehicleIndex;
        transition.incomingVehicleIndex = incomingVehicleIndex;
        transition.glowBoost = 0.26;
        transition.cameraKick = 0;

        renderSelectedVehicleLabel(targetIndex);
        updateVehicleButtonLabels(targetIndex);

        previewShellEl?.classList.remove(
            'vehicle-swap-active',
            'vehicle-swap-left',
            'vehicle-swap-right'
        );
        void previewShellEl?.offsetWidth;
        previewShellEl?.classList.add('vehicle-swap-active');
        previewShellEl?.classList.add(direction < 0 ? 'vehicle-swap-left' : 'vehicle-swap-right');
    }

    function updateTransition(dt) {
        if (!transition.active) {
            transition.glowBoost = Math.max(transition.glowBoost - dt * 1.5, 0);
            transition.cameraKick = THREE.MathUtils.lerp(
                transition.cameraKick,
                0,
                1 - Math.exp(-10 * dt)
            );
            return;
        }

        transition.phaseTime += dt;

        if (transition.phase === 'exit') {
            const phaseProgress = THREE.MathUtils.clamp(
                transition.phaseTime / SWAP_TIMING.exitSec,
                0,
                1
            );
            transition.glowBoost = THREE.MathUtils.lerp(0.3, 1, easeInOutCubic(phaseProgress));
            transition.cameraKick =
                transition.direction * THREE.MathUtils.lerp(0, 0.4, phaseProgress);
            if (phaseProgress >= 1) {
                transition.phase = 'gap';
                transition.phaseTime = 0;
                previewVehicles[transition.outgoingVehicleIndex].car.visible = false;
            }
            return;
        }

        if (transition.phase === 'gap') {
            const phaseProgress = THREE.MathUtils.clamp(
                transition.phaseTime / SWAP_TIMING.gapSec,
                0,
                1
            );
            transition.glowBoost = THREE.MathUtils.lerp(1, 0.6, phaseProgress);
            transition.cameraKick =
                transition.direction * THREE.MathUtils.lerp(0.4, 0.06, phaseProgress);
            if (phaseProgress >= 1) {
                transition.phase = 'enter';
                transition.phaseTime = 0;
                previewVehicles[transition.incomingVehicleIndex].car.visible = true;
            }
            return;
        }

        if (transition.phase === 'enter') {
            const phaseProgress = THREE.MathUtils.clamp(
                transition.phaseTime / SWAP_TIMING.enterSec,
                0,
                1
            );
            transition.glowBoost = THREE.MathUtils.lerp(0.6, 0.26, easeOutCubic(phaseProgress));
            transition.cameraKick =
                transition.direction * THREE.MathUtils.lerp(0.06, -0.1, phaseProgress);
            if (phaseProgress >= 1) {
                transition.phase = 'settle';
                transition.phaseTime = 0;
            }
            return;
        }

        const settleProgress = THREE.MathUtils.clamp(
            transition.phaseTime / SWAP_TIMING.settleSec,
            0,
            1
        );
        transition.glowBoost = THREE.MathUtils.lerp(0.26, 0.1, settleProgress);
        transition.cameraKick =
            transition.direction * THREE.MathUtils.lerp(-0.1, 0, settleProgress);

        if (settleProgress >= 1) {
            finishSwap();
        }
    }

    function finishSwap() {
        activeVehicleIndex = transition.incomingVehicleIndex;
        transition.active = false;
        transition.phase = 'idle';
        transition.phaseTime = 0;
        transition.cameraKick = 0;
        transition.glowBoost = 0.14;

        for (let i = 0; i < previewVehicles.length; i += 1) {
            const isActiveVehicle = i === activeVehicleIndex;
            previewVehicles[i].car.visible = isActiveVehicle;
        }

        applySelectedPreset(transition.targetIndex, transition.emitChange);

        previewShellEl?.classList.remove(
            'vehicle-swap-active',
            'vehicle-swap-left',
            'vehicle-swap-right'
        );

        if (transition.queue) {
            const queued = transition.queue;
            transition.queue = null;
            if (queued.index !== selectedColorIndex) {
                startSwap(queued.index, queued.direction, queued.emitChange);
            }
        }
    }

    function applySelectedPreset(nextIndex, emitChange = true) {
        selectedColorIndex = getWrappedIndex(nextIndex);
        const selectedPreset = CAR_COLOR_PRESETS[selectedColorIndex];
        previewVehicles[activeVehicleIndex].rig.setBodyColor(selectedPreset.hex);
        renderSelectedVehicleLabel(selectedColorIndex);
        updateVehicleButtonLabels();
        if (emitChange) {
            onColorChange?.(resolveColorHex(selectedPreset.hex), selectedPreset);
        }
    }

    function applyPreviewPose() {
        const cameraOffsetX = transition.cameraKick;
        previewCamera.position.set(
            previewCameraBasePosition.x + cameraOffsetX,
            previewCameraBasePosition.y,
            previewCameraBasePosition.z
        );
        previewCamera.lookAt(
            previewLookAt.x + cameraOffsetX * 0.15,
            previewLookAt.y,
            previewLookAt.z
        );

        const outgoingVehicle =
            previewVehicles[transition.outgoingVehicleIndex] || previewVehicles[0];
        const incomingVehicle =
            previewVehicles[transition.incomingVehicleIndex] || previewVehicles[1];

        for (let i = 0; i < previewVehicles.length; i += 1) {
            const previewVehicle = previewVehicles[i];
            previewVehicle.car.position.set(0, 0, 0);
            previewVehicle.car.rotation.y = previewSpinYaw;
            previewVehicle.car.scale.setScalar(1);
            if (!transition.active) {
                previewVehicle.car.visible = i === activeVehicleIndex;
            }
        }

        if (transition.active && transition.phase === 'exit') {
            const phaseProgress = THREE.MathUtils.clamp(
                transition.phaseTime / SWAP_TIMING.exitSec,
                0,
                1
            );
            const eased = easeInOutCubic(phaseProgress);
            outgoingVehicle.car.visible = true;
            outgoingVehicle.car.position.set(
                THREE.MathUtils.lerp(0, -transition.direction * 2.56, eased),
                0,
                THREE.MathUtils.lerp(0, -0.24, eased)
            );
            outgoingVehicle.car.rotation.y =
                previewSpinYaw + THREE.MathUtils.lerp(0, transition.direction * 0.8, eased);
            outgoingVehicle.car.scale.setScalar(THREE.MathUtils.lerp(1, 0.8, eased));
            incomingVehicle.car.visible = false;
        }

        if (transition.active && transition.phase === 'gap') {
            outgoingVehicle.car.visible = false;
            incomingVehicle.car.visible = false;
        }

        if (transition.active && transition.phase === 'enter') {
            const phaseProgress = THREE.MathUtils.clamp(
                transition.phaseTime / SWAP_TIMING.enterSec,
                0,
                1
            );
            const eased = easeOutBack(phaseProgress);
            incomingVehicle.car.visible = true;
            incomingVehicle.car.position.set(
                THREE.MathUtils.lerp(transition.direction * 2.56, 0, eased),
                0,
                THREE.MathUtils.lerp(-0.24, 0, eased)
            );
            incomingVehicle.car.rotation.y =
                previewSpinYaw + THREE.MathUtils.lerp(-transition.direction * 0.82, 0, eased);
            incomingVehicle.car.scale.setScalar(THREE.MathUtils.lerp(0.8, 1, eased));
            outgoingVehicle.car.visible = false;
        }

        if (transition.active && transition.phase === 'settle') {
            const phaseProgress = THREE.MathUtils.clamp(
                transition.phaseTime / SWAP_TIMING.settleSec,
                0,
                1
            );
            const eased = easeOutCubic(phaseProgress);
            incomingVehicle.car.visible = true;
            incomingVehicle.car.position.set(0, 0, THREE.MathUtils.lerp(-0.04, 0, eased));
            incomingVehicle.car.rotation.y =
                previewSpinYaw + THREE.MathUtils.lerp(-transition.direction * 0.06, 0, eased);
            incomingVehicle.car.scale.setScalar(THREE.MathUtils.lerp(0.98, 1, eased));
            outgoingVehicle.car.visible = false;
        }

        underGlow.scale.setScalar(1 + transition.glowBoost * 0.34);
        underGlow.material.opacity = 0.16 + transition.glowBoost * 0.2;
    }

    function resetTransitionVisuals() {
        transition.active = false;
        transition.phase = 'idle';
        transition.phaseTime = 0;
        transition.direction = 1;
        transition.outgoingVehicleIndex = activeVehicleIndex;
        transition.incomingVehicleIndex = activeVehicleIndex === 0 ? 1 : 0;
        transition.cameraKick = 0;
        transition.glowBoost = 0;
        transition.queue = null;

        previewShellEl?.classList.remove(
            'vehicle-swap-active',
            'vehicle-swap-left',
            'vehicle-swap-right'
        );

        for (let i = 0; i < previewVehicles.length; i += 1) {
            const previewVehicle = previewVehicles[i];
            previewVehicle.car.visible = i === activeVehicleIndex;
            previewVehicle.car.position.set(0, 0, 0);
            previewVehicle.car.rotation.y = previewSpinYaw;
            previewVehicle.car.scale.setScalar(1);
        }

        underGlow.scale.setScalar(1);
        underGlow.material.opacity = 0.16;
    }

    function renderSelectedVehicleLabel(index) {
        if (!selectedColorNameEl) {
            return;
        }
        const normalizedIndex = getWrappedIndex(index);
        const preset = CAR_COLOR_PRESETS[normalizedIndex];
        selectedColorNameEl.textContent = `VEH ${normalizedIndex + 1} • ${preset.name}`;
    }

    function updateVehicleButtonLabels(baseIndex = selectedColorIndex) {
        if (!CAR_COLOR_PRESETS.length) {
            return;
        }
        const normalizedIndex = getWrappedIndex(baseIndex);
        const previousPreset = CAR_COLOR_PRESETS[getWrappedIndex(normalizedIndex - 1)];
        const nextPreset = CAR_COLOR_PRESETS[getWrappedIndex(normalizedIndex + 1)];
        prevVehicleBtnEl?.setAttribute('aria-label', `Previous vehicle: ${previousPreset.name}`);
        nextVehicleBtnEl?.setAttribute('aria-label', `Next vehicle: ${nextPreset.name}`);
    }

    function createPreviewVehicle() {
        const rig = createCarRig({
            bodyColor: 0x2d67a6,
            displayName: 'MAREK',
            addLights: true,
            addWheelWellLights: false,
            lightConfig: {
                enablePrimaryHeadlightProjectors: false,
                enableNearFillProjectors: false,
                enableFacadeFillProjectors: false,
                taillightIntensity: 1.3,
                taillightDistance: 8.2,
                taillightDecay: 3,
                taillightPositions: [
                    { position: [-0.52, 0.54, WELCOME_PREVIEW_REAR_LIGHT_Z] },
                    { position: [0.52, 0.54, WELCOME_PREVIEW_REAR_LIGHT_Z] },
                ],
            },
        });
        rig.car.visible = false;
        previewScene.add(rig.car);
        return { rig, car: rig.car };
    }

    function getWrappedIndex(index) {
        const count = CAR_COLOR_PRESETS.length;
        return ((Math.round(index) % count) + count) % count;
    }

    function easeInOutCubic(value) {
        if (value < 0.5) {
            return 4 * value * value * value;
        }
        return 1 - Math.pow(-2 * value + 2, 3) / 2;
    }

    function easeOutCubic(value) {
        const inverse = 1 - value;
        return 1 - inverse * inverse * inverse;
    }

    function easeOutBack(value) {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        const shifted = value - 1;
        return 1 + c3 * shifted * shifted * shifted + c1 * shifted * shifted;
    }
}
