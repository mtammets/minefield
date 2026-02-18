import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

export function createRaceIntroController({ camera, vehicle, durationSec = 4.2 } = {}) {
    const rootEl = document.getElementById('raceIntroOverlay');
    const countEl = document.getElementById('raceIntroCount');
    const captionEl = document.getElementById('raceIntroCaption');
    if (!camera || !vehicle || !rootEl || !countEl || !captionEl) {
        return {
            start() {},
            stop() {},
            update() {
                return false;
            },
            isActive() {
                return false;
            },
            isDrivingUnlocked() {
                return false;
            },
        };
    }

    const timedSteps = [
        { at: 0, label: '3', caption: 'Prepare for launch', mode: 'pulse' },
        { at: 1, label: '2', caption: 'Aim for the ideal line', mode: 'pulse' },
        { at: 2, label: '1', caption: 'Full throttle now', mode: 'pulse' },
        { at: 3, label: 'GO!', caption: 'Let it rip!', mode: 'go' },
    ];
    const orbitTarget = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();
    const followTarget = new THREE.Vector3();
    const followLookTarget = new THREE.Vector3();
    const blendedTarget = new THREE.Vector3();
    const blendedLookTarget = new THREE.Vector3();
    const smoothedLookTarget = new THREE.Vector3();
    const state = {
        active: false,
        elapsed: 0,
        duration: Math.max(3.8, Number(durationSec) || 4.2),
        stepIndex: -1,
        startAngle: 0,
        cameraInitialized: false,
        drivingUnlocked: false,
    };
    let overlayHideTimer = null;

    hideOverlay();
    return {
        start,
        stop,
        update,
        isActive() {
            return state.active;
        },
        isDrivingUnlocked() {
            return state.drivingUnlocked;
        },
    };

    function start() {
        clearOverlayHideTimer();
        state.active = true;
        state.elapsed = 0;
        state.stepIndex = -1;
        state.startAngle = vehicle.rotation.y + Math.PI * 0.65;
        state.cameraInitialized = false;
        state.drivingUnlocked = false;
        rootEl.hidden = false;
        rootEl.classList.add('active');
        document.body.classList.add('race-intro-active');
        applyStep(0);
    }

    function stop() {
        if (!state.active && rootEl.hidden) {
            return;
        }
        state.active = false;
        state.elapsed = 0;
        state.stepIndex = -1;
        state.drivingUnlocked = false;
        hideOverlay();
    }

    function update(deltaTime = 1 / 60) {
        if (!state.active) {
            return false;
        }

        const dt = Math.min(Math.max(deltaTime || 0, 0), 0.05);
        state.elapsed += dt;
        const progress = THREE.MathUtils.clamp(state.elapsed / state.duration, 0, 1);
        updateCameraPath(progress, dt);

        const nextStepIndex = resolveStepIndex(state.elapsed);
        if (nextStepIndex !== state.stepIndex) {
            applyStep(nextStepIndex);
            if (nextStepIndex === timedSteps.length - 1) {
                finishAtGo();
                return true;
            }
        }

        if (progress >= 1) {
            snapToStartView();
            state.active = false;
            state.elapsed = 0;
            state.stepIndex = -1;
            hideOverlay();
            return true;
        }
        return false;
    }

    function resolveStepIndex(elapsedSec) {
        for (let i = timedSteps.length - 1; i >= 0; i -= 1) {
            if (elapsedSec >= timedSteps[i].at) {
                return i;
            }
        }
        return -1;
    }

    function applyStep(stepIndex) {
        state.stepIndex = stepIndex;
        if (stepIndex < 0 || stepIndex >= timedSteps.length) {
            return;
        }

        const step = timedSteps[stepIndex];
        countEl.textContent = step.label;
        captionEl.textContent = step.caption;
        rootEl.classList.remove('pulse', 'go');
        void rootEl.offsetWidth;
        rootEl.classList.add(step.mode === 'go' ? 'go' : 'pulse');
    }

    function hideOverlay() {
        clearOverlayHideTimer();
        rootEl.classList.remove('active', 'pulse', 'go');
        rootEl.hidden = true;
        countEl.textContent = '3';
        captionEl.textContent = 'Prepare for launch';
        document.body.classList.remove('race-intro-active');
    }

    function updateCameraPath(progress, dt) {
        const eased = 1 - Math.pow(1 - progress, 2.15);
        const cameraAngle =
            state.startAngle + eased * Math.PI * 1.74 + Math.sin(state.elapsed * 2.2) * 0.15;
        const orbitRadius = THREE.MathUtils.lerp(11.7, 6.4, eased);
        const orbitHeight =
            THREE.MathUtils.lerp(3.9, 2.35, eased) + Math.sin(state.elapsed * 3.25) * 0.3;

        orbitTarget.set(
            vehicle.position.x + Math.cos(cameraAngle) * orbitRadius,
            vehicle.position.y + orbitHeight,
            vehicle.position.z + Math.sin(cameraAngle) * orbitRadius
        );
        lookTarget.set(
            vehicle.position.x,
            vehicle.position.y + THREE.MathUtils.lerp(1.15, 0.92, eased),
            vehicle.position.z
        );
        computeStartViewPose();
        const handoffBlend = THREE.MathUtils.smoothstep(progress, 0.72, 1);
        blendedTarget.lerpVectors(orbitTarget, followTarget, handoffBlend);
        blendedLookTarget.lerpVectors(lookTarget, followLookTarget, handoffBlend);

        if (!state.cameraInitialized) {
            camera.position.copy(blendedTarget);
            smoothedLookTarget.copy(blendedLookTarget);
            state.cameraInitialized = true;
        }

        const positionBlend = 1 - Math.exp(-6.2 * dt);
        const lookBlend = 1 - Math.exp(-10.4 * dt);
        camera.position.lerp(blendedTarget, positionBlend);
        smoothedLookTarget.lerp(blendedLookTarget, lookBlend);
        camera.lookAt(smoothedLookTarget);

        const orbitFov = THREE.MathUtils.lerp(64, 78, eased) + Math.sin(state.elapsed * 4.4) * 0.45;
        const targetFov = THREE.MathUtils.lerp(orbitFov, 75, handoffBlend);
        const fovBlend = 1 - Math.exp(-6.6 * dt);
        const nextFov = THREE.MathUtils.lerp(camera.fov, targetFov, fovBlend);
        if (Math.abs(nextFov - camera.fov) <= 0.01) {
            return;
        }
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
    }

    function computeStartViewPose() {
        const heading = vehicle.rotation.y;
        followTarget.set(
            vehicle.position.x + Math.sin(heading) * 6,
            vehicle.position.y + 3,
            vehicle.position.z + Math.cos(heading) * 6
        );
        followLookTarget.set(vehicle.position.x, vehicle.position.y + 0.5, vehicle.position.z);
    }

    function snapToStartView() {
        computeStartViewPose();
        camera.position.copy(followTarget);
        smoothedLookTarget.copy(followLookTarget);
        camera.lookAt(smoothedLookTarget);
        if (Math.abs(camera.fov - 75) > 0.01) {
            camera.fov = 75;
            camera.updateProjectionMatrix();
        }
    }

    function finishAtGo() {
        snapToStartView();
        state.active = false;
        state.elapsed = 0;
        state.stepIndex = -1;
        state.drivingUnlocked = true;
        scheduleOverlayHide(520);
    }

    function scheduleOverlayHide(delayMs) {
        clearOverlayHideTimer();
        overlayHideTimer = window.setTimeout(
            () => {
                overlayHideTimer = null;
                hideOverlay();
            },
            Math.max(0, Number(delayMs) || 0)
        );
    }

    function clearOverlayHideTimer() {
        if (overlayHideTimer == null) {
            return;
        }
        clearTimeout(overlayHideTimer);
        overlayHideTimer = null;
    }
}
