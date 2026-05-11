export function createPauseMenuController({ onExit, onResume } = {}) {
    const rootEl = document.getElementById('pauseModal');
    const exitBtnEl = document.getElementById('pauseExitBtn');
    const resumeBtnEl = document.getElementById('pauseResumeBtn');
    const graphicsPanelEl = document.getElementById('pauseGraphicsPanel');
    const graphicsCycleBtnEl = document.getElementById('pauseGraphicsCycleBtn');
    const cameraTunePanelEl = document.getElementById('pauseCameraTunePanel');
    const cameraTuneScopeEl = document.getElementById('pauseCameraTuneScope');
    const cameraTuneDistanceToneEl = document.getElementById('pauseCameraTuneDistanceTone');
    const cameraTuneDistanceFillEl = document.getElementById('pauseCameraTuneDistanceFill');
    const cameraTuneHeightToneEl = document.getElementById('pauseCameraTuneHeightTone');
    const cameraTuneHeightFillEl = document.getElementById('pauseCameraTuneHeightFill');
    const cameraTuneResetBtnEl = document.getElementById('pauseCameraTuneResetBtn');

    if (!rootEl || !exitBtnEl || !resumeBtnEl) {
        return createNoopController();
    }

    let getGraphicsQualitySnapshot = () => null;
    let onCycleGraphicsQualityMode = null;
    let getCameraTuneSnapshot = () => null;
    let onResetCameraTune = null;
    let lastGraphicsSignature = '';
    let lastCameraTuneSignature = '';

    exitBtnEl.addEventListener('click', () => {
        onExit?.();
    });
    resumeBtnEl.addEventListener('click', () => {
        onResume?.();
    });
    graphicsCycleBtnEl?.addEventListener('click', () => {
        if (typeof onCycleGraphicsQualityMode !== 'function') {
            return;
        }
        const snapshot = onCycleGraphicsQualityMode(1);
        if (snapshot && typeof snapshot === 'object') {
            applyGraphicsSnapshot(snapshot);
            return;
        }
        refreshGraphicsStatus();
    });
    cameraTuneResetBtnEl?.addEventListener('click', () => {
        if (typeof onResetCameraTune !== 'function') {
            return;
        }
        const snapshot = onResetCameraTune();
        if (snapshot && typeof snapshot === 'object') {
            applyCameraTuneSnapshot(snapshot);
            return;
        }
        refreshCameraTuneStatus();
    });

    return {
        show,
        hide,
        isVisible,
        configureGraphicsControls,
        configureCameraTuneControls,
        refreshGraphicsStatus,
        refreshCameraTuneStatus,
    };

    function show() {
        rootEl.hidden = false;
        refreshGraphicsStatus();
        refreshCameraTuneStatus();
    }

    function hide() {
        rootEl.hidden = true;
    }

    function isVisible() {
        return !rootEl.hidden;
    }

    function configureGraphicsControls({ getSnapshot = null, onCycleMode = null } = {}) {
        getGraphicsQualitySnapshot = typeof getSnapshot === 'function' ? getSnapshot : () => null;
        onCycleGraphicsQualityMode = typeof onCycleMode === 'function' ? onCycleMode : null;
        if (graphicsCycleBtnEl) {
            graphicsCycleBtnEl.disabled = typeof onCycleGraphicsQualityMode !== 'function';
        }
        refreshGraphicsStatus();
    }

    function configureCameraTuneControls({ getSnapshot = null, onReset = null } = {}) {
        getCameraTuneSnapshot = typeof getSnapshot === 'function' ? getSnapshot : () => null;
        onResetCameraTune = typeof onReset === 'function' ? onReset : null;
        if (cameraTuneResetBtnEl) {
            cameraTuneResetBtnEl.disabled = typeof onResetCameraTune !== 'function';
        }
        refreshCameraTuneStatus();
    }

    function refreshGraphicsStatus() {
        if (!graphicsPanelEl) {
            return;
        }
        const snapshot = getGraphicsQualitySnapshot?.();
        applyGraphicsSnapshot(snapshot);
    }

    function refreshCameraTuneStatus() {
        if (!cameraTunePanelEl) {
            return;
        }
        const snapshot = getCameraTuneSnapshot?.();
        applyCameraTuneSnapshot(snapshot);
    }

    function applyGraphicsSnapshot(snapshot = null) {
        if (!graphicsPanelEl || !graphicsCycleBtnEl) {
            return;
        }

        if (!snapshot || typeof snapshot !== 'object') {
            const fallbackSignature = 'missing';
            if (lastGraphicsSignature === fallbackSignature) {
                return;
            }
            graphicsCycleBtnEl.textContent = 'MODE';
            graphicsCycleBtnEl.disabled = true;
            lastGraphicsSignature = fallbackSignature;
            return;
        }

        const compactLabel = String(
            snapshot.compactModeLabel || snapshot.modeLabel || snapshot.mode || 'Mode'
        ).toUpperCase();
        const cycleButtonText = `MODE: ${compactLabel}`;
        const signature = [
            cycleButtonText,
            typeof onCycleGraphicsQualityMode === 'function' ? 'enabled' : 'disabled',
        ].join('|');
        if (signature === lastGraphicsSignature) {
            return;
        }

        graphicsCycleBtnEl.textContent = cycleButtonText;
        graphicsCycleBtnEl.disabled = typeof onCycleGraphicsQualityMode !== 'function';
        lastGraphicsSignature = signature;
    }

    function applyCameraTuneSnapshot(snapshot = null) {
        if (!cameraTunePanelEl) {
            return;
        }

        if (!snapshot || typeof snapshot !== 'object' || snapshot.visible === false) {
            const hiddenSignature = 'hidden';
            if (lastCameraTuneSignature === hiddenSignature) {
                return;
            }
            cameraTunePanelEl.hidden = true;
            lastCameraTuneSignature = hiddenSignature;
            return;
        }

        const scopeLabel = String(snapshot.scopeLabel || 'LOCAL').trim().toUpperCase();
        const distanceTone = String(snapshot.distanceTone || 'BALANCED').trim().toUpperCase();
        const heightTone = String(snapshot.heightTone || 'NEUTRAL').trim().toUpperCase();
        const distancePercent = clampPercent(snapshot.distancePercent);
        const heightPercent = clampPercent(snapshot.heightPercent);
        const active = Boolean(snapshot.active);
        const signature = [
            scopeLabel,
            distanceTone,
            heightTone,
            distancePercent,
            heightPercent,
            active ? 'active' : 'idle',
            typeof onResetCameraTune === 'function' ? 'reset' : 'readonly',
        ].join('|');
        if (signature === lastCameraTuneSignature) {
            return;
        }

        cameraTunePanelEl.hidden = false;
        cameraTunePanelEl.dataset.active = active ? 'true' : 'false';
        if (cameraTuneScopeEl) {
            cameraTuneScopeEl.textContent = scopeLabel;
        }
        if (cameraTuneDistanceToneEl) {
            cameraTuneDistanceToneEl.textContent = distanceTone;
        }
        if (cameraTuneHeightToneEl) {
            cameraTuneHeightToneEl.textContent = heightTone;
        }
        if (cameraTuneDistanceFillEl) {
            cameraTuneDistanceFillEl.style.width = `${distancePercent}%`;
        }
        if (cameraTuneHeightFillEl) {
            cameraTuneHeightFillEl.style.width = `${heightPercent}%`;
        }
        if (cameraTuneResetBtnEl) {
            cameraTuneResetBtnEl.disabled =
                typeof onResetCameraTune !== 'function' || Boolean(snapshot.resetDisabled);
        }
        lastCameraTuneSignature = signature;
    }
}

function createNoopController() {
    return {
        show() {},
        hide() {},
        isVisible() {
            return false;
        },
        configureGraphicsControls() {},
        configureCameraTuneControls() {},
        refreshGraphicsStatus() {},
        refreshCameraTuneStatus() {},
    };
}

function clampPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 50;
    }
    return Math.min(100, Math.max(0, numeric));
}
