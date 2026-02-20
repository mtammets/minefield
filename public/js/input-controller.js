import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

export function createInputController(options = {}) {
    const {
        renderer,
        camera,
        car,
        keys,
        renderSettings,
        welcomeModalUi,
        finalScoreboardUi,
        carEditModeController,
        raceIntroController,
        replayController,
        getVehicleState,
        initializePlayerPhysics,
        setPhysicsAccumulator = () => {},
        getIsWelcomeModalVisible = () => false,
        getIsGamePaused = () => false,
        getIsCarDestroyed = () => false,
        getPlayerCarsRemaining = () => 0,
        onSetPauseState = () => {},
        onDismissWelcomeModal = () => {},
        onRestartGameWithCountdown = () => {},
        onClearPendingRespawn = () => {},
        onClearReplayEffects = () => {},
        onClearDebris = () => {},
        onResetPlayerDamageState = () => {},
        onResetRunStateForReplay = () => {},
        onClearDriveKeys = () => {},
        onShowObjectiveInfo = () => {},
        onStartNewGame = () => {},
        onShowWelcomeModal = () => {},
        onDeployMine = () => null,
        cyclePlayerRoofMenu,
        setPlayerRoofMenuMode,
        setPlayerRoofMenuModeFromUv,
        getPlayerRoofMenuMode,
        roofMenuModeLabels = {},
        adjustPlayerSuspensionHeight,
        adjustPlayerSuspensionStiffness,
        getPlayerSuspensionTune,
        adjustPlayerTopSpeedLimit,
        getPlayerTopSpeedLimit,
        persistPlayerTopSpeedKph,
        escFullscreenFallbackWindowMs = 460,
    } = options;

    if (
        !renderer ||
        !camera ||
        !car ||
        !keys ||
        !carEditModeController ||
        !raceIntroController ||
        !replayController
    ) {
        return {
            initialize() {},
            dispose() {},
            returnToWelcomeFromPauseMenu() {},
        };
    }

    const roofMenuRaycaster = new THREE.Raycaster();
    const roofMenuPointerNdc = new THREE.Vector2();
    let lastEscapeKeyDownAtMs = -10_000;

    const onKeyDown = (event) => handleKey(event, true);
    const onKeyUp = (event) => handleKey(event, false);

    return {
        initialize,
        dispose,
        returnToWelcomeFromPauseMenu,
    };

    function initialize() {
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        document.addEventListener('fullscreenchange', onFullscreenChange);
        window.addEventListener('resize', onWindowResize);
        renderer.domElement.addEventListener('pointerdown', handleGameCanvasPointerDown);
    }

    function dispose() {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('fullscreenchange', onFullscreenChange);
        window.removeEventListener('resize', onWindowResize);
        renderer.domElement.removeEventListener('pointerdown', handleGameCanvasPointerDown);
    }

    function handleKey(event, isKeyDown) {
        const rawKey = event.key.toLowerCase();
        const key = rawKey === ' ' || rawKey === 'spacebar' ? 'space' : rawKey;

        // While welcome modal is visible, disable gameplay/editor shortcuts so text inputs work naturally.
        if (getIsWelcomeModalVisible()) {
            return;
        }

        if (
            isKeyDown &&
            event.repeat &&
            (key === 'k' ||
                key === 'v' ||
                key === 'f' ||
                key === 'e' ||
                key === 'q' ||
                key === 'enter' ||
                key === 'escape' ||
                key === 'tab' ||
                key === 'm' ||
                key === '1' ||
                key === '2' ||
                key === '3' ||
                key === '4' ||
                key === 'g' ||
                key === 't' ||
                key === 'c')
        ) {
            return;
        }

        const canEnterEditMode =
            !getIsWelcomeModalVisible() &&
            !getIsGamePaused() &&
            !raceIntroController.isActive() &&
            !getIsCarDestroyed() &&
            !finalScoreboardUi.isVisible();
        const shouldRouteToEditMode = carEditModeController.isActive() || canEnterEditMode;
        if (shouldRouteToEditMode && carEditModeController.handleKey(event, isKeyDown)) {
            return;
        }

        const isRaceIntroActive = raceIntroController.isActive();
        const isRaceIntroDriveLocked =
            isRaceIntroActive && !raceIntroController.isDrivingUnlocked();

        if (key === 'escape') {
            event.preventDefault();
            if (isRaceIntroActive) {
                return;
            }
            if (isKeyDown) {
                lastEscapeKeyDownAtMs = performance.now();
            }
            if (isKeyDown && !finalScoreboardUi.isVisible()) {
                onSetPauseState(!getIsGamePaused());
                void lockEscapeKeyInFullscreen();
            }
            return;
        }

        if (getIsGamePaused()) {
            return;
        }

        if (key === 'space') {
            event.preventDefault();
        }

        const isDriveKey =
            key === 'arrowup' ||
            key === 'arrowdown' ||
            key === 'arrowleft' ||
            key === 'arrowright' ||
            key === 'w' ||
            key === 'a' ||
            key === 's' ||
            key === 'd' ||
            key === 'space';
        if (isDriveKey && replayController.isPlaybackActive()) {
            return;
        }
        const setDriveInput = (driveKey) => {
            keys[driveKey] = isKeyDown;
        };

        const actions = {
            arrowup: () => setDriveInput('forward'),
            arrowdown: () => setDriveInput('backward'),
            arrowleft: () => setDriveInput('left'),
            arrowright: () => setDriveInput('right'),
            w: () => setDriveInput('forward'),
            s: () => setDriveInput('backward'),
            a: () => setDriveInput('left'),
            d: () => setDriveInput('right'),
            space: () => setDriveInput('handbrake'),
            f: () => isKeyDown && toggleFullscreen(),
            q: () => {
                if (!isKeyDown || isRaceIntroDriveLocked) {
                    return;
                }
                onRestartGameWithCountdown();
            },
            g: () => {
                if (!isKeyDown || isRaceIntroDriveLocked) {
                    return;
                }
                const result = onDeployMine('drop');
                if (result?.message) {
                    onShowObjectiveInfo(result.message, result.timeoutMs || 1800);
                }
            },
            t: () => {
                if (!isKeyDown || isRaceIntroDriveLocked) {
                    return;
                }
                const result = onDeployMine('throw');
                if (result?.message) {
                    onShowObjectiveInfo(result.message, result.timeoutMs || 1800);
                }
            },
            enter: () => {
                if (!isKeyDown || !finalScoreboardUi.isVisible() || isRaceIntroDriveLocked) {
                    return;
                }
                onRestartGameWithCountdown();
            },
            k: () => {
                if (!isKeyDown || isRaceIntroDriveLocked) {
                    return;
                }

                if (replayController.isPlaybackActive()) {
                    replayController.stopPlayback();
                    onClearPendingRespawn();
                    onClearReplayEffects();
                    onClearDebris();
                    initializePlayerPhysics(car);
                    onResetPlayerDamageState();
                    setPhysicsAccumulator(0);
                    onShowObjectiveInfo('Playback stopped.');
                }

                if (getIsCarDestroyed()) {
                    onShowObjectiveInfo(
                        getPlayerCarsRemaining() > 0
                            ? 'A crash is in progress. Wait for the next car to spawn.'
                            : 'No cars left. Press Q to restart.'
                    );
                    return;
                }

                if (replayController.isRecording()) {
                    replayController.stopRecording();
                    const duration = replayController.getDuration();
                    if (duration > 0.2) {
                        onShowObjectiveInfo(
                            `Recording saved (${duration.toFixed(1)}s). Press V to play it back.`
                        );
                    } else {
                        onShowObjectiveInfo('Recording too short. Drive longer and try again.');
                    }
                    return;
                }

                replayController.startRecording(getVehicleState());
                onShowObjectiveInfo('Recording in progress. Press K to stop.');
            },
            v: () => {
                if (!isKeyDown || isRaceIntroDriveLocked) {
                    return;
                }

                if (replayController.isRecording()) {
                    replayController.stopRecording();
                }

                if (replayController.isPlaybackActive()) {
                    replayController.stopPlayback();
                    onClearPendingRespawn();
                    onClearReplayEffects();
                    onClearDebris();
                    initializePlayerPhysics(car);
                    onResetPlayerDamageState();
                    setPhysicsAccumulator(0);
                    onShowObjectiveInfo('Playback stopped.');
                    return;
                }

                if (!replayController.hasReplay()) {
                    onShowObjectiveInfo('No replay available. Press K to record a drive.');
                    return;
                }

                onResetRunStateForReplay();
                onClearDriveKeys();
                if (replayController.startPlayback()) {
                    onClearReplayEffects();
                    onShowObjectiveInfo('TV replay started. V stops it, K starts a new recording.');
                }
            },
            tab: () => {
                if (!isKeyDown || isRaceIntroDriveLocked) {
                    return;
                }
                event.preventDefault();
                const step = event.shiftKey ? -1 : 1;
                const modeKey = cyclePlayerRoofMenu(step);
                showRoofMenuStatus(modeKey);
            },
            m: () => {
                if (!isKeyDown || isRaceIntroDriveLocked) {
                    return;
                }
                const modeKey = cyclePlayerRoofMenu(1);
                showRoofMenuStatus(modeKey);
            },
            1: () => {
                if (!isKeyDown || isRaceIntroDriveLocked) {
                    return;
                }
                const modeKey = setPlayerRoofMenuMode('dashboard');
                showRoofMenuStatus(modeKey);
            },
            2: () => {
                if (!isKeyDown || isRaceIntroDriveLocked) {
                    return;
                }
                const modeKey = setPlayerRoofMenuMode('battery');
                showRoofMenuStatus(modeKey);
            },
            3: () => {
                if (!isKeyDown || isRaceIntroDriveLocked) {
                    return;
                }
                const modeKey = setPlayerRoofMenuMode('navigation');
                showRoofMenuStatus(modeKey);
            },
            4: () => {
                if (!isKeyDown || isRaceIntroDriveLocked) {
                    return;
                }
                const modeKey = setPlayerRoofMenuMode('chassis');
                showRoofMenuStatus(modeKey);
            },
        };
        if (actions[key]) {
            actions[key]();
        }
    }

    function showRoofMenuStatus(modeKey = getPlayerRoofMenuMode()) {
        if (!modeKey) {
            return;
        }
        const modeLabel = roofMenuModeLabels[modeKey] || String(modeKey);
        const chassisHint =
            modeKey === 'chassis'
                ? ' In Chassis view you can adjust suspension and top speed with +/- buttons.'
                : '';
        onShowObjectiveInfo(
            `Roof menu: ${modeLabel}. Tab next, Shift+Tab previous, 1-4 direct.${chassisHint}`
        );
    }

    function handleGameCanvasPointerDown(event) {
        if (event.button !== 0) {
            return;
        }
        if (
            getIsWelcomeModalVisible() ||
            getIsGamePaused() ||
            raceIntroController.isActive() ||
            getIsCarDestroyed() ||
            carEditModeController.isActive()
        ) {
            return;
        }

        const canvas = renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return;
        }

        roofMenuPointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        roofMenuPointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        roofMenuRaycaster.setFromCamera(roofMenuPointerNdc, camera);

        const intersections = roofMenuRaycaster.intersectObject(car, true);
        for (let i = 0; i < intersections.length; i += 1) {
            const hit = intersections[i];
            if (!hit?.uv || !hit.object?.userData?.roofMenuSurface) {
                continue;
            }
            const interaction = setPlayerRoofMenuModeFromUv(hit.uv);
            if (interaction?.type === 'mode' && interaction.modeKey) {
                showRoofMenuStatus(interaction.modeKey);
                event.preventDefault();
            } else if (interaction?.type === 'suspension_height') {
                const tune = adjustPlayerSuspensionHeight(interaction.delta);
                showSuspensionTuneStatus(tune);
                event.preventDefault();
            } else if (interaction?.type === 'suspension_stiffness') {
                const tune = adjustPlayerSuspensionStiffness(interaction.delta);
                showSuspensionTuneStatus(tune);
                event.preventDefault();
            } else if (interaction?.type === 'top_speed_limit') {
                const topSpeedTune = adjustPlayerTopSpeedLimit(interaction.delta);
                persistPlayerTopSpeedKph(topSpeedTune.topSpeedKph);
                showTopSpeedTuneStatus(topSpeedTune);
                event.preventDefault();
            }
            return;
        }
    }

    function showSuspensionTuneStatus(tune = getPlayerSuspensionTune()) {
        if (!tune) {
            return;
        }
        const heightMm = Math.round(tune.suspensionHeightMm || 0);
        const stiffnessPct = Math.round(tune.suspensionStiffnessPercent || 0);
        onShowObjectiveInfo(
            `Suspension: height ${heightMm >= 0 ? '+' : ''}${heightMm} mm, stiffness ${stiffnessPct}%.`
        );
    }

    function showTopSpeedTuneStatus(tune = getPlayerTopSpeedLimit()) {
        if (!tune) {
            return;
        }
        const speedKph = Math.round(tune.topSpeedKph || 0);
        onShowObjectiveInfo(`Top speed: ${speedKph} km/h.`);
    }

    function onWindowResize() {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, renderSettings.maxPixelRatio));
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        welcomeModalUi.resize();
    }

    function toggleFullscreen() {
        const fullscreenRoot = document.documentElement;
        if (!document.fullscreenElement) {
            fullscreenRoot
                .requestFullscreen()
                .then(() => lockEscapeKeyInFullscreen())
                .catch(console.error);
        } else {
            unlockKeyboardLock();
            document.exitFullscreen().catch(console.error);
        }
    }

    function returnToWelcomeFromPauseMenu() {
        onStartNewGame();
        onShowWelcomeModal();

        if (!document.fullscreenElement) {
            return;
        }

        unlockKeyboardLock();
        document.exitFullscreen().catch(() => {
            // Welcome view is already visible even if fullscreen exit fails.
        });
    }

    function onFullscreenChange() {
        if (document.fullscreenElement) {
            void lockEscapeKeyInFullscreen();
            return;
        }

        unlockKeyboardLock();
        const escapedRecently =
            performance.now() - lastEscapeKeyDownAtMs <= escFullscreenFallbackWindowMs;
        if (escapedRecently && !getIsGamePaused() && !finalScoreboardUi.isVisible()) {
            onSetPauseState(true);
        }
    }

    async function lockEscapeKeyInFullscreen() {
        if (!document.fullscreenElement) {
            return;
        }

        const keyboardApi = navigator.keyboard;
        if (!keyboardApi || typeof keyboardApi.lock !== 'function') {
            return;
        }

        try {
            await keyboardApi.lock(['Escape']);
        } catch {
            // Ignore unsupported/browser-denied keyboard lock requests.
        }
    }

    function unlockKeyboardLock() {
        const keyboardApi = navigator.keyboard;
        if (!keyboardApi || typeof keyboardApi.unlock !== 'function') {
            return;
        }

        try {
            keyboardApi.unlock();
        } catch {
            // Ignore unsupported/browser-denied keyboard unlock requests.
        }
    }
}
