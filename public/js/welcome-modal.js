import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { createCarRig } from './car.js';
import {
    CAR_COLOR_PRESETS,
    DEFAULT_PLAYER_CAR_COLOR_HEX,
    WELCOME_CAR_SPIN_SPEED,
    WELCOME_PREVIEW_STATE_SPEED,
    WELCOME_PREVIEW_REAR_LIGHT_Z,
} from './constants.js';

export function createWelcomeModalController({
    onStart,
    onColorChange,
    initialColorHex,
    getCurrentColorHex,
    resolvePlayerCarColorHex,
    getCarColorPresetIndex,
    toCssHex,
} = {}) {
    const resolveColorHex =
        typeof resolvePlayerCarColorHex === 'function'
            ? resolvePlayerCarColorHex
            : (colorHex) =>
                  Number.isFinite(colorHex) ? colorHex >>> 0 : DEFAULT_PLAYER_CAR_COLOR_HEX >>> 0;
    const resolvePresetIndex =
        typeof getCarColorPresetIndex === 'function' ? getCarColorPresetIndex : () => 0;
    const toCssColor =
        typeof toCssHex === 'function'
            ? toCssHex
            : (colorHex) => `#${(colorHex >>> 0).toString(16).padStart(6, '0')}`;
    const currentColorGetter =
        typeof getCurrentColorHex === 'function' ? getCurrentColorHex : () => initialColorHex;

    const rootEl = document.getElementById('welcomeModal');
    const startBtnEl = document.getElementById('welcomeStartBtn');
    const previewCanvasEl = document.getElementById('welcomeCarCanvas');
    const selectedColorNameEl = document.getElementById('welcomeSelectedColorName');
    const colorOptionsEl = document.getElementById('welcomeColorOptions');
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

    const previewRig = createCarRig({
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
    const previewCar = previewRig.car;
    previewCar.rotation.y = Math.PI * 0.32;
    previewScene.add(previewCar);
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
    let previewPulseTime = Math.random() * Math.PI * 2;
    const colorButtons = [];
    let selectedColorIndex = resolvePresetIndex(initialColorHex);

    const previewBounds = new THREE.Box3().setFromObject(previewCar);
    const previewSize = previewBounds.getSize(new THREE.Vector3());
    const previewRadius = Math.max(previewSize.x, previewSize.y, previewSize.z);
    const previewLookAt = new THREE.Vector3(0, previewSize.y * 0.28, 0);
    previewCamera.position.set(previewRadius * 1.48, previewRadius * 0.76, previewRadius * 1.85);
    previewCamera.lookAt(previewLookAt);
    buildColorOptions();
    setSelectedColorByIndex(selectedColorIndex, false);

    startBtnEl.addEventListener('click', () => {
        onStart?.();
    });

    return {
        show() {
            rootEl.hidden = false;
            setSelectedColorByIndex(resolvePresetIndex(currentColorGetter()), false);
            syncPreviewSize();
            updatePreviewVisualState(1 / 60);
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
            previewCar.rotation.y += dt * WELCOME_CAR_SPIN_SPEED;
            updatePreviewVisualState(dt);
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
            const colorIndex = resolvePresetIndex(colorHex);
            setSelectedColorByIndex(colorIndex, emitChange);
        },
        selectNeighborColor(step = 1) {
            setSelectedColorByIndex(selectedColorIndex + Math.sign(step || 1), true);
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

        previewRig.setBatteryLevel(0.34 + batteryWave * 0.62);
        previewRig.updateVisuals(previewState, dt || 1 / 60);
    }

    function buildColorOptions() {
        if (!colorOptionsEl) {
            return;
        }

        colorOptionsEl.innerHTML = '';
        for (let i = 0; i < CAR_COLOR_PRESETS.length; i += 1) {
            const preset = CAR_COLOR_PRESETS[i];
            const buttonEl = document.createElement('button');
            buttonEl.type = 'button';
            buttonEl.className = 'welcomeColorBtn';
            buttonEl.setAttribute('role', 'radio');
            buttonEl.setAttribute('aria-checked', 'false');
            buttonEl.setAttribute(
                'aria-label',
                `${preset.name} (${toCssColor(preset.hex).toUpperCase()})`
            );

            const swatchEl = document.createElement('span');
            swatchEl.className = 'welcomeColorSwatch';
            swatchEl.style.background = toCssColor(preset.hex);

            const nameEl = document.createElement('span');
            nameEl.className = 'welcomeColorName';
            nameEl.textContent = preset.name;

            buttonEl.append(swatchEl, nameEl);
            buttonEl.addEventListener('click', () => {
                setSelectedColorByIndex(i, true);
            });

            colorOptionsEl.appendChild(buttonEl);
            colorButtons.push(buttonEl);
        }
    }

    function setSelectedColorByIndex(nextIndex, emitChange = true) {
        if (!CAR_COLOR_PRESETS.length) {
            return;
        }

        const colorCount = CAR_COLOR_PRESETS.length;
        const normalizedIndex = Number.isFinite(nextIndex) ? Math.round(nextIndex) : 0;
        selectedColorIndex = ((normalizedIndex % colorCount) + colorCount) % colorCount;

        const selectedPreset = CAR_COLOR_PRESETS[selectedColorIndex];
        previewRig.setBodyColor(selectedPreset.hex);
        if (selectedColorNameEl) {
            selectedColorNameEl.textContent = selectedPreset.name;
        }
        syncColorOptionUi();
        if (emitChange) {
            onColorChange?.(resolveColorHex(selectedPreset.hex), selectedPreset);
        }
    }

    function syncColorOptionUi() {
        if (!colorButtons.length) {
            return;
        }

        for (let i = 0; i < colorButtons.length; i += 1) {
            const buttonEl = colorButtons[i];
            const isActive = i === selectedColorIndex;
            buttonEl.classList.toggle('active', isActive);
            buttonEl.setAttribute('aria-checked', isActive ? 'true' : 'false');
        }
    }
}
