import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { INPUT_CONTEXTS } from './input-context.js';
import {
    ACTION_IDS,
    DEFAULT_KEY_BINDINGS,
    actionMatchesEvent,
    normalizeKeyboardKey,
} from './input-bindings.js';

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
        getIsWelcomeModalVisible = () => false,
        getIsGamePaused = () => false,
        getIsCarDestroyed = () => false,
        onSetPauseState = () => {},
        onDismissWelcomeModal = () => {},
        onRestartGameWithCountdown = () => {},
        onClearDriveKeys = () => {},
        onShowObjectiveInfo = () => {},
        onRegisterControlAction = () => {},
        onStartNewGame = () => {},
        onShowWelcomeModal = () => {},
        onDeployMine = () => null,
        toggleWorldMap = () => ({ open: false, message: null }),
        isWorldMapVisible = () => false,
        getInputContext = () => INPUT_CONTEXTS.gameplay,
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
        keyBindings = DEFAULT_KEY_BINDINGS,
        getMaxPixelRatio = () => renderSettings.maxPixelRatio,
        onCycleGraphicsQualityMode = () => null,
        escFullscreenFallbackWindowMs = 460,
    } = options;

    if (!renderer || !camera || !car || !keys || !carEditModeController || !raceIntroController) {
        return {
            initialize() {},
            dispose() {},
            returnToWelcomeFromPauseMenu() {},
        };
    }

    const roofMenuRaycaster = new THREE.Raycaster();
    const roofMenuPointerNdc = new THREE.Vector2();
    let lastEscapeKeyDownAtMs = -10_000;
    const editModeShortcutHostAllowed = isEditModeShortcutHostAllowed();
    const fullscreenCursorIdleHideMs = 1500;
    const fullscreenCursorMoveThresholdSq = 1;
    let fullscreenCursorHideTimeout = null;
    let lastFullscreenPointerX = null;
    let lastFullscreenPointerY = null;

    const onKeyDown = (event) => handleKey(event, true);
    const onKeyUp = (event) => handleKey(event, false);
    const onFullscreenPointerMove = (event) => handleFullscreenCursorPointerMove(event);
    const onFullscreenCursorActivity = (event) => handleFullscreenCursorActivity(event);

    return {
        initialize,
        dispose,
        returnToWelcomeFromPauseMenu,
    };

    function initialize() {
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('pointermove', onFullscreenPointerMove, { passive: true });
        document.addEventListener('pointerdown', onFullscreenCursorActivity, { passive: true });
        document.addEventListener('wheel', onFullscreenCursorActivity, { passive: true });
        document.addEventListener('keydown', onFullscreenCursorActivity);
        window.addEventListener('resize', onWindowResize);
        renderer.domElement.addEventListener('pointerdown', handleGameCanvasPointerDown);
        onFullscreenChange();
    }

    function dispose() {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('fullscreenchange', onFullscreenChange);
        document.removeEventListener('pointermove', onFullscreenPointerMove);
        document.removeEventListener('pointerdown', onFullscreenCursorActivity);
        document.removeEventListener('wheel', onFullscreenCursorActivity);
        document.removeEventListener('keydown', onFullscreenCursorActivity);
        window.removeEventListener('resize', onWindowResize);
        renderer.domElement.removeEventListener('pointerdown', handleGameCanvasPointerDown);
        clearFullscreenCursorHideTimeout();
        showFullscreenCursor();
    }

    function handleKey(event, isKeyDown) {
        const key = normalizeKeyboardKey(event?.key || '');
        const matchesAction = (actionId) => actionMatchesEvent(actionId, event, keyBindings, key);
        const reportAction = (actionId) => {
            if (!isKeyDown || event.repeat) {
                return;
            }
            onRegisterControlAction(actionId);
        };

        // While welcome modal is visible, disable gameplay/editor shortcuts so text inputs work naturally.
        if (getIsWelcomeModalVisible()) {
            return;
        }

        if (
            isKeyDown &&
            event.repeat &&
            (matchesAction(ACTION_IDS.fullscreenToggle) ||
                matchesAction(ACTION_IDS.editModeToggle) ||
                matchesAction(ACTION_IDS.restartRound) ||
                matchesAction(ACTION_IDS.restartFromScoreboard) ||
                matchesAction(ACTION_IDS.pauseToggle) ||
                matchesAction(ACTION_IDS.roofMenuNext) ||
                matchesAction(ACTION_IDS.roofMenuPrevious) ||
                matchesAction(ACTION_IDS.mapToggle) ||
                matchesAction(ACTION_IDS.roofModeDashboard) ||
                matchesAction(ACTION_IDS.roofModeBattery) ||
                matchesAction(ACTION_IDS.roofModeNavigation) ||
                matchesAction(ACTION_IDS.roofModeChassis) ||
                matchesAction(ACTION_IDS.mineDrop) ||
                matchesAction(ACTION_IDS.mineThrow) ||
                matchesAction(ACTION_IDS.graphicsCycle))
        ) {
            return;
        }

        const canEnterEditMode =
            editModeShortcutHostAllowed &&
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
        const inputContext = getInputContext();
        const worldMapVisible =
            inputContext === INPUT_CONTEXTS.fullMap || Boolean(isWorldMapVisible());

        if (matchesAction(ACTION_IDS.pauseToggle)) {
            event.preventDefault();
            if (isRaceIntroActive) {
                return;
            }
            if (isKeyDown && worldMapVisible) {
                const result = toggleWorldMap(false);
                if (result?.message) {
                    onShowObjectiveInfo(result.message, 1100);
                }
                return;
            }
            if (isKeyDown) {
                lastEscapeKeyDownAtMs = performance.now();
            }
            if (isKeyDown && !finalScoreboardUi.isVisible()) {
                const nextPausedState = !getIsGamePaused();
                onSetPauseState(nextPausedState);
                if (document.fullscreenElement) {
                    clearFullscreenCursorHideTimeout();
                    resetFullscreenCursorPointerSample();
                    hideFullscreenCursor();
                }
                void lockEscapeKeyInFullscreen();
            }
            return;
        }

        const allowMapToggleWhilePaused =
            inputContext === INPUT_CONTEXTS.fullMap && matchesAction(ACTION_IDS.mapToggle);
        if (getIsGamePaused() && !allowMapToggleWhilePaused) {
            return;
        }
        if (
            inputContext === INPUT_CONTEXTS.fullMap &&
            !matchesAction(ACTION_IDS.mapToggle) &&
            !matchesAction(ACTION_IDS.pauseToggle)
        ) {
            return;
        }

        if (matchesAction(ACTION_IDS.handbrake)) {
            event.preventDefault();
        }

        const setDriveInput = (driveKey) => {
            keys[driveKey] = isKeyDown;
        };

        if (matchesAction(ACTION_IDS.driveForward)) {
            setDriveInput('forward');
            reportAction(ACTION_IDS.driveForward);
            return;
        }
        if (matchesAction(ACTION_IDS.driveBackward)) {
            setDriveInput('backward');
            reportAction(ACTION_IDS.driveBackward);
            return;
        }
        if (matchesAction(ACTION_IDS.driveLeft)) {
            setDriveInput('left');
            reportAction(ACTION_IDS.driveLeft);
            return;
        }
        if (matchesAction(ACTION_IDS.driveRight)) {
            setDriveInput('right');
            reportAction(ACTION_IDS.driveRight);
            return;
        }
        if (matchesAction(ACTION_IDS.handbrake)) {
            setDriveInput('handbrake');
            reportAction(ACTION_IDS.handbrake);
            return;
        }

        if (matchesAction(ACTION_IDS.fullscreenToggle)) {
            if (isKeyDown) {
                toggleFullscreen();
                reportAction(ACTION_IDS.fullscreenToggle);
            }
            return;
        }

        if (matchesAction(ACTION_IDS.restartRound)) {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }
            onRestartGameWithCountdown();
            reportAction(ACTION_IDS.restartRound);
            return;
        }

        if (matchesAction(ACTION_IDS.mineDrop)) {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }
            const result = onDeployMine('drop');
            if (result?.message) {
                onShowObjectiveInfo(result.message, result.timeoutMs || 1800);
            }
            reportAction(ACTION_IDS.mineDrop);
            return;
        }

        if (matchesAction(ACTION_IDS.mineThrow)) {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }
            const result = onDeployMine('throw');
            if (result?.message) {
                onShowObjectiveInfo(result.message, result.timeoutMs || 1800);
            }
            reportAction(ACTION_IDS.mineThrow);
            return;
        }

        if (matchesAction(ACTION_IDS.restartFromScoreboard)) {
            if (!isKeyDown || !finalScoreboardUi.isVisible() || isRaceIntroDriveLocked) {
                return;
            }
            onRestartGameWithCountdown();
            return;
        }

        if (matchesAction(ACTION_IDS.roofMenuPrevious) || matchesAction(ACTION_IDS.roofMenuNext)) {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }
            event.preventDefault();
            const step = matchesAction(ACTION_IDS.roofMenuPrevious) ? -1 : 1;
            const modeKey = cyclePlayerRoofMenu(step);
            showRoofMenuStatus(modeKey);
            reportAction(step < 0 ? ACTION_IDS.roofMenuPrevious : ACTION_IDS.roofMenuNext);
            return;
        }

        if (matchesAction(ACTION_IDS.mapToggle)) {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }
            event.preventDefault();
            const result = toggleWorldMap();
            if (result?.open) {
                onClearDriveKeys();
            }
            if (result?.message) {
                onShowObjectiveInfo(result.message, 1300);
            }
            reportAction(ACTION_IDS.mapToggle);
            return;
        }

        if (matchesAction(ACTION_IDS.roofModeDashboard)) {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }
            const modeKey = setPlayerRoofMenuMode('dashboard');
            showRoofMenuStatus(modeKey);
            reportAction(ACTION_IDS.roofModeDashboard);
            return;
        }

        if (matchesAction(ACTION_IDS.roofModeBattery)) {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }
            const modeKey = setPlayerRoofMenuMode('battery');
            showRoofMenuStatus(modeKey);
            reportAction(ACTION_IDS.roofModeBattery);
            return;
        }

        if (matchesAction(ACTION_IDS.roofModeNavigation)) {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }
            const modeKey = setPlayerRoofMenuMode('navigation');
            showRoofMenuStatus(modeKey);
            reportAction(ACTION_IDS.roofModeNavigation);
            return;
        }

        if (matchesAction(ACTION_IDS.roofModeChassis)) {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }
            const modeKey = setPlayerRoofMenuMode('chassis');
            showRoofMenuStatus(modeKey);
            reportAction(ACTION_IDS.roofModeChassis);
            return;
        }

        if (matchesAction(ACTION_IDS.graphicsCycle)) {
            if (!isKeyDown || isRaceIntroDriveLocked) {
                return;
            }
            onCycleGraphicsQualityMode(1);
            reportAction(ACTION_IDS.graphicsCycle);
            return;
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
            getInputContext() === INPUT_CONTEXTS.fullMap ||
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

    function isEditModeShortcutHostAllowed() {
        if (typeof window === 'undefined') {
            return false;
        }
        return String(window.location?.hostname || '').toLowerCase() === 'localhost';
    }

    function onWindowResize() {
        const pixelRatioCap = Math.max(
            0.45,
            Number(getMaxPixelRatio()) || Number(renderSettings.maxPixelRatio) || 1
        );
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        welcomeModalUi.resize();
    }

    function toggleFullscreen() {
        const fullscreenRoot = document.documentElement;
        if (!document.fullscreenElement) {
            let requestPromise = null;
            try {
                requestPromise = fullscreenRoot.requestFullscreen({
                    navigationUI: 'hide',
                });
            } catch {
                requestPromise = fullscreenRoot.requestFullscreen();
            }
            Promise.resolve(requestPromise)
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
        onWindowResize();
        if (document.fullscreenElement) {
            clearFullscreenCursorHideTimeout();
            resetFullscreenCursorPointerSample();
            showFullscreenCursor();
            scheduleFullscreenCursorHide();
            void lockEscapeKeyInFullscreen();
            return;
        }

        clearFullscreenCursorHideTimeout();
        resetFullscreenCursorPointerSample();
        showFullscreenCursor();
        unlockKeyboardLock();
        const escapedRecently =
            performance.now() - lastEscapeKeyDownAtMs <= escFullscreenFallbackWindowMs;
        if (escapedRecently && !getIsGamePaused() && !finalScoreboardUi.isVisible()) {
            onSetPauseState(true);
        }
    }

    function handleFullscreenCursorPointerMove(event) {
        if (!document.fullscreenElement) {
            return;
        }

        const pointerX = Number(event?.clientX);
        const pointerY = Number(event?.clientY);
        if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
            handleFullscreenCursorActivity();
            return;
        }

        if (!Number.isFinite(lastFullscreenPointerX) || !Number.isFinite(lastFullscreenPointerY)) {
            lastFullscreenPointerX = pointerX;
            lastFullscreenPointerY = pointerY;
            handleFullscreenCursorActivity();
            return;
        }

        const dx = pointerX - lastFullscreenPointerX;
        const dy = pointerY - lastFullscreenPointerY;
        if (dx * dx + dy * dy < fullscreenCursorMoveThresholdSq) {
            return;
        }

        lastFullscreenPointerX = pointerX;
        lastFullscreenPointerY = pointerY;
        handleFullscreenCursorActivity();
    }

    function handleFullscreenCursorActivity(event) {
        if (!document.fullscreenElement) {
            return;
        }
        if (event?.type === 'keydown') {
            return;
        }
        showFullscreenCursor();
        scheduleFullscreenCursorHide();
    }

    function scheduleFullscreenCursorHide() {
        clearFullscreenCursorHideTimeout();
        if (!document.fullscreenElement) {
            return;
        }
        fullscreenCursorHideTimeout = window.setTimeout(() => {
            fullscreenCursorHideTimeout = null;
            if (!document.fullscreenElement) {
                return;
            }
            hideFullscreenCursor();
        }, fullscreenCursorIdleHideMs);
    }

    function clearFullscreenCursorHideTimeout() {
        if (fullscreenCursorHideTimeout == null) {
            return;
        }
        window.clearTimeout(fullscreenCursorHideTimeout);
        fullscreenCursorHideTimeout = null;
    }

    function resetFullscreenCursorPointerSample() {
        lastFullscreenPointerX = null;
        lastFullscreenPointerY = null;
    }

    function showFullscreenCursor() {
        document.documentElement.classList.remove('fullscreen-idle-cursor-hidden');
    }

    function hideFullscreenCursor() {
        document.documentElement.classList.add('fullscreen-idle-cursor-hidden');
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
