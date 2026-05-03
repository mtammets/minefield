export function createPauseMenuController({ onExit, onResume } = {}) {
    const rootEl = document.getElementById('pauseModal');
    const exitBtnEl = document.getElementById('pauseExitBtn');
    const resumeBtnEl = document.getElementById('pauseResumeBtn');
    const graphicsPanelEl = document.getElementById('pauseGraphicsPanel');
    const graphicsCycleBtnEl = document.getElementById('pauseGraphicsCycleBtn');
    const audioPanelEl = document.getElementById('pauseAudioPanel');
    const audioStatusEl = document.getElementById('pauseAudioStatus');
    const audioMetaEl = document.getElementById('pauseAudioMeta');
    const audioUnlockBtnEl = document.getElementById('pauseAudioUnlockBtn');
    const audioMuteBtnEl = document.getElementById('pauseAudioMuteBtn');
    const audioSlidersEl = document.getElementById('pauseAudioSliders');

    if (!rootEl || !exitBtnEl || !resumeBtnEl) {
        return createNoopController();
    }

    let getGraphicsQualitySnapshot = () => null;
    let onCycleGraphicsQualityMode = null;
    let lastGraphicsSignature = '';
    let getAudioMixerSnapshot = () => null;
    let onSetAudioMixerVolume = null;
    let onToggleAudioMute = null;
    let onUnlockAudio = null;
    let audioSliderRows = new Map();
    let lastAudioSliderSignature = '';

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
    audioUnlockBtnEl?.addEventListener('click', () => {
        void handleAudioUnlock();
    });
    audioMuteBtnEl?.addEventListener('click', () => {
        void handleAudioToggleMute();
    });

    return {
        show,
        hide,
        isVisible,
        configureGraphicsControls,
        configureAudioControls,
        refreshGraphicsStatus,
        refreshAudioStatus,
    };

    function show() {
        rootEl.hidden = false;
        refreshGraphicsStatus();
        refreshAudioStatus();
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

    function configureAudioControls({
        getSnapshot = null,
        onSetVolume = null,
        onToggleMute = null,
        onUnlock = null,
    } = {}) {
        getAudioMixerSnapshot = typeof getSnapshot === 'function' ? getSnapshot : () => null;
        onSetAudioMixerVolume = typeof onSetVolume === 'function' ? onSetVolume : null;
        onToggleAudioMute = typeof onToggleMute === 'function' ? onToggleMute : null;
        onUnlockAudio = typeof onUnlock === 'function' ? onUnlock : null;
        refreshAudioStatus();
    }

    function refreshAudioStatus() {
        if (!audioPanelEl) {
            return;
        }
        const snapshot = getAudioMixerSnapshot?.();
        applyAudioSnapshot(snapshot);
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

    async function handleAudioUnlock() {
        if (typeof onUnlockAudio !== 'function') {
            refreshAudioStatus();
            return;
        }
        const snapshot = await onUnlockAudio();
        if (snapshot && typeof snapshot === 'object') {
            applyAudioSnapshot(snapshot);
            return;
        }
        refreshAudioStatus();
    }

    async function handleAudioToggleMute() {
        void handleAudioUnlock();
        if (typeof onToggleAudioMute !== 'function') {
            refreshAudioStatus();
            return;
        }
        const snapshot = await onToggleAudioMute();
        if (snapshot && typeof snapshot === 'object') {
            applyAudioSnapshot(snapshot);
            return;
        }
        refreshAudioStatus();
    }

    function applyAudioSnapshot(snapshot = null) {
        if (
            !audioPanelEl ||
            !audioStatusEl ||
            !audioMetaEl ||
            !audioUnlockBtnEl ||
            !audioMuteBtnEl ||
            !audioSlidersEl
        ) {
            return;
        }

        if (!snapshot || typeof snapshot !== 'object') {
            audioPanelEl.hidden = true;
            audioSliderRows.clear();
            lastAudioSliderSignature = '';
            audioSlidersEl.replaceChildren();
            return;
        }

        audioPanelEl.hidden = false;
        audioPanelEl.dataset.tone = String(snapshot.statusTone || 'offline');
        audioPanelEl.dataset.muted = snapshot.muted ? 'true' : 'false';
        audioStatusEl.textContent = String(snapshot.statusLabel || 'OFFLINE').toUpperCase();
        audioMetaEl.textContent = String(snapshot.statusText || 'Audio unavailable');
        audioUnlockBtnEl.textContent = snapshot.unlocked ? 'READY' : 'UNLOCK';
        audioUnlockBtnEl.disabled =
            snapshot.available === false ||
            snapshot.unlocked ||
            typeof onUnlockAudio !== 'function';
        audioMuteBtnEl.textContent = snapshot.muted ? 'UNMUTE' : 'MUTE';
        audioMuteBtnEl.disabled =
            snapshot.available === false || typeof onToggleAudioMute !== 'function';

        syncAudioSliderRows(Array.isArray(snapshot.sliders) ? snapshot.sliders : []);
        const sliderList = Array.isArray(snapshot.sliders) ? snapshot.sliders : [];
        for (let i = 0; i < sliderList.length; i += 1) {
            const slider = sliderList[i];
            const row = audioSliderRows.get(slider.key);
            if (!row) {
                continue;
            }
            const percent = Math.max(
                0,
                Math.min(100, Math.round((Number(slider.value) || 0) * 100))
            );
            row.input.value = String(percent);
            row.input.style.setProperty('--level', `${percent}%`);
            row.input.disabled =
                snapshot.available === false || typeof onSetAudioMixerVolume !== 'function';
            row.value.textContent = `${percent}%`;
        }
    }

    function syncAudioSliderRows(sliders = []) {
        if (!audioSlidersEl) {
            return;
        }

        const signature = sliders
            .map((slider) => `${slider?.key || ''}:${slider?.label || ''}`)
            .join('|');
        if (signature === lastAudioSliderSignature) {
            return;
        }

        audioSliderRows = new Map();
        audioSlidersEl.replaceChildren();

        for (let i = 0; i < sliders.length; i += 1) {
            const slider = sliders[i];
            const key = typeof slider?.key === 'string' ? slider.key : '';
            if (!key) {
                continue;
            }

            const rowEl = document.createElement('label');
            rowEl.className = 'pauseAudioSliderRow';

            const titleEl = document.createElement('span');
            titleEl.className = 'pauseAudioSliderLabel';
            titleEl.textContent = String(slider?.label || key).toUpperCase();

            const inputEl = document.createElement('input');
            inputEl.className = 'pauseAudioSliderInput';
            inputEl.type = 'range';
            inputEl.min = '0';
            inputEl.max = '100';
            inputEl.step = '1';
            inputEl.setAttribute('aria-label', String(slider?.label || key));
            inputEl.addEventListener('input', () => {
                const normalized = Math.max(0, Math.min(1, Number(inputEl.value) / 100 || 0));
                inputEl.style.setProperty('--level', `${Math.round(normalized * 100)}%`);
                if (typeof onSetAudioMixerVolume === 'function') {
                    const nextSnapshot = onSetAudioMixerVolume(key, normalized);
                    if (nextSnapshot && typeof nextSnapshot === 'object') {
                        applyAudioSnapshot(nextSnapshot);
                    } else {
                        refreshAudioStatus();
                    }
                }
                if (typeof onUnlockAudio === 'function') {
                    void onUnlockAudio().then((unlockSnapshot) => {
                        if (unlockSnapshot && typeof unlockSnapshot === 'object') {
                            applyAudioSnapshot(unlockSnapshot);
                            return;
                        }
                        refreshAudioStatus();
                    });
                }
            });

            const valueEl = document.createElement('span');
            valueEl.className = 'pauseAudioSliderValue';

            rowEl.append(titleEl, inputEl, valueEl);
            audioSlidersEl.append(rowEl);
            audioSliderRows.set(key, {
                input: inputEl,
                value: valueEl,
            });
        }

        lastAudioSliderSignature = signature;
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
        configureAudioControls() {},
        refreshGraphicsStatus() {},
        refreshAudioStatus() {},
    };
}
