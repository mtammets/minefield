export function createPauseMenuController({ onExit, onResume } = {}) {
    const rootEl = document.getElementById('pauseModal');
    const exitBtnEl = document.getElementById('pauseExitBtn');
    const resumeBtnEl = document.getElementById('pauseResumeBtn');
    const graphicsPanelEl = document.getElementById('pauseGraphicsPanel');
    const graphicsCycleBtnEl = document.getElementById('pauseGraphicsCycleBtn');

    if (!rootEl || !exitBtnEl || !resumeBtnEl) {
        return createNoopController();
    }

    let getGraphicsQualitySnapshot = () => null;
    let onCycleGraphicsQualityMode = null;
    let lastGraphicsSignature = '';

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

    return {
        show,
        hide,
        isVisible,
        configureGraphicsControls,
        refreshGraphicsStatus,
    };

    function show() {
        rootEl.hidden = false;
        refreshGraphicsStatus();
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

    function refreshGraphicsStatus() {
        if (!graphicsPanelEl) {
            return;
        }
        const snapshot = getGraphicsQualitySnapshot?.();
        applyGraphicsSnapshot(snapshot);
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
}

function createNoopController() {
    return {
        show() {},
        hide() {},
        isVisible() {
            return false;
        },
        configureGraphicsControls() {},
        refreshGraphicsStatus() {},
    };
}
