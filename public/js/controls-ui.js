import { ACTION_IDS, resolveActionBindingLabels } from './input-bindings.js';

const CONTROL_LAYOUTS = Object.freeze({
    welcome: Object.freeze([
        {
            title: 'Core Driving',
            rows: Object.freeze([
                { label: 'Accelerate', actionId: ACTION_IDS.driveForward },
                { label: 'Brake / Reverse', actionId: ACTION_IDS.driveBackward },
                { label: 'Steer Left', actionId: ACTION_IDS.driveLeft },
                { label: 'Steer Right', actionId: ACTION_IDS.driveRight },
                { label: 'Handbrake Drift', actionId: ACTION_IDS.handbrake },
            ]),
        },
        {
            title: 'Session',
            rows: Object.freeze([
                {
                    label: 'Tactical Map',
                    actionId: ACTION_IDS.mapToggle,
                },
                { label: 'Pause / Resume', actionId: ACTION_IDS.pauseToggle },
                { label: 'Restart Round', actionId: ACTION_IDS.restartRound },
                { label: 'Fullscreen', actionId: ACTION_IDS.fullscreenToggle },
            ]),
        },
        {
            title: 'Mine Combat',
            rows: Object.freeze([
                {
                    label: 'Drop Mine',
                    actionId: ACTION_IDS.mineDrop,
                },
                {
                    label: 'Throw Mine',
                    actionId: ACTION_IDS.mineThrow,
                },
            ]),
        },
    ]),
    pause: Object.freeze([
        {
            title: 'Core Driving',
            rows: Object.freeze([
                { label: 'Accelerate', actionId: ACTION_IDS.driveForward },
                { label: 'Brake / Reverse', actionId: ACTION_IDS.driveBackward },
                { label: 'Steer Left', actionId: ACTION_IDS.driveLeft },
                { label: 'Steer Right', actionId: ACTION_IDS.driveRight },
                { label: 'Handbrake Drift', actionId: ACTION_IDS.handbrake },
            ]),
        },
        {
            title: 'Race Systems',
            rows: Object.freeze([
                {
                    label: 'Tactical Map',
                    actionId: ACTION_IDS.mapToggle,
                },
                { label: 'Pause / Resume', actionId: ACTION_IDS.pauseToggle },
                { label: 'Restart Round', actionId: ACTION_IDS.restartRound },
                { label: 'Fullscreen', actionId: ACTION_IDS.fullscreenToggle },
                { label: 'Graphics Quality', actionId: ACTION_IDS.graphicsCycle },
            ]),
        },
        {
            title: 'Roof Interface',
            rows: Object.freeze([
                { label: 'Next Roof Tab', actionId: ACTION_IDS.roofMenuNext },
                { label: 'Previous Roof Tab', actionId: ACTION_IDS.roofMenuPrevious },
                { label: 'Roof Direct Tabs', keyLabels: ['1', '2', '3', '4'] },
            ]),
        },
        {
            title: 'Camera',
            rows: Object.freeze([
                { label: 'View Presets', keyLabels: ['Alt+1…7'] },
                { label: 'Cinematic Camera', actionId: ACTION_IDS.cameraCinematicToggle },
            ]),
        },
        {
            title: 'Mine Combat',
            rows: Object.freeze([
                {
                    label: 'Drop Mine',
                    actionId: ACTION_IDS.mineDrop,
                },
                {
                    label: 'Throw Mine',
                    actionId: ACTION_IDS.mineThrow,
                },
            ]),
        },
        {
            title: 'Developer',
            rows: Object.freeze([
                {
                    label: 'Edit Mode',
                    actionId: ACTION_IDS.editModeToggle,
                    developerOnly: true,
                },
                {
                    label: 'Edit Camera Reset',
                    actionId: ACTION_IDS.editModeResetView,
                    developerOnly: true,
                },
            ]),
        },
    ]),
});

export function createControlsHelpController({
    getIsInOnlineRoom = () => false,
    keyBindings = null,
} = {}) {
    const welcomeHostEl = document.getElementById('welcomeControlsPanel');
    const pauseHostEl = document.getElementById('pauseControlsPanel');
    if (!welcomeHostEl && !pauseHostEl) {
        return createNoopController();
    }

    const state = {
        onlineRoomActive: false,
        localhost: isLocalhost(),
    };
    const controllers = [];
    let welcomeController = null;

    if (welcomeHostEl) {
        welcomeController = mountWelcomeDisclosureHost(welcomeHostEl, keyBindings);
        controllers.push(welcomeController);
    }
    if (pauseHostEl) {
        controllers.push(mountControlsHost(pauseHostEl, 'pause', keyBindings));
    }

    const pollHandle = window.setInterval(refreshContext, 900);
    refreshContext();

    return {
        refreshContext,
        setGameplayVisible,
        toggleGameplayOverlay,
        setGameplayOverlayVisible,
        isGameplayOverlayVisible() {
            return false;
        },
        dispose,
    };

    function setGameplayVisible(nextVisible) {
        if (nextVisible) {
            welcomeController?.setOpen?.(false);
        }
    }

    function toggleGameplayOverlay() {
        return {
            open: false,
            message: null,
        };
    }

    function setGameplayOverlayVisible() {}

    function refreshContext() {
        const onlineRoomActive = Boolean(getIsInOnlineRoom());
        if (onlineRoomActive !== state.onlineRoomActive) {
            state.onlineRoomActive = onlineRoomActive;
        }
        for (let index = 0; index < controllers.length; index += 1) {
            controllers[index].applyAvailability({
                onlineRoomActive: state.onlineRoomActive,
                localhost: state.localhost,
            });
        }
    }

    function dispose() {
        window.clearInterval(pollHandle);
        for (let index = 0; index < controllers.length; index += 1) {
            controllers[index].dispose?.();
        }
    }
}

function mountWelcomeDisclosureHost(rootEl, keyBindings) {
    rootEl.classList.add('welcomeControlsDisclosure');
    rootEl.replaceChildren();
    rootEl.dataset.open = 'false';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'welcomeControlsToggleBtn';
    toggleButton.innerHTML = `
        <span class="welcomeControlsToggleTitle">Show controls</span>
        <span class="welcomeControlsToggleHint">Keyboard</span>
    `;
    rootEl.appendChild(toggleButton);

    const panelEl = document.createElement('section');
    panelEl.className = 'welcomeControlsDisclosurePanel';
    panelEl.hidden = true;
    rootEl.appendChild(panelEl);

    const panelController = mountControlsHost(panelEl, 'welcome', keyBindings);
    const titleEl = toggleButton.querySelector('.welcomeControlsToggleTitle');
    const onToggleClick = () => {
        setOpen(rootEl.dataset.open !== 'true');
    };
    toggleButton.addEventListener('click', onToggleClick);
    setOpen(false);

    return {
        root: rootEl,
        applyAvailability(context) {
            panelController.applyAvailability(context);
        },
        setOpen,
        dispose() {
            toggleButton.removeEventListener('click', onToggleClick);
            panelController.dispose?.();
        },
    };

    function setOpen(nextOpen) {
        const open = Boolean(nextOpen);
        rootEl.dataset.open = open ? 'true' : 'false';
        panelEl.hidden = !open;
        toggleButton.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggleButton.setAttribute(
            'aria-label',
            open ? 'Hide driving controls' : 'Show driving controls'
        );
        if (titleEl) {
            titleEl.textContent = open ? 'Hide controls' : 'Show controls';
        }
    }
}

function mountControlsHost(rootEl, surface, keyBindings) {
    rootEl.classList.add('controlsPanelCard', `controlsPanelCard--${surface}`);
    rootEl.replaceChildren();
    const rowBindings = [];

    const headerEl = document.createElement('div');
    headerEl.className = 'controlsPanelHeader';
    headerEl.innerHTML = `
        <div class="controlsPanelTitle">Controls</div>
        <div class="controlsPanelKicker">Keyboard</div>
    `;
    rootEl.appendChild(headerEl);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'controlsPanelBody';
    rootEl.appendChild(bodyEl);

    const groups = CONTROL_LAYOUTS[surface] || [];
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
        const group = groups[groupIndex];
        const groupEl = document.createElement('section');
        groupEl.className = 'controlsPanelGroup';
        const titleEl = document.createElement('div');
        titleEl.className = 'controlsPanelGroupTitle';
        titleEl.textContent = group.title;
        groupEl.appendChild(titleEl);

        const rowsEl = document.createElement('div');
        rowsEl.className = 'controlsPanelRows';
        groupEl.appendChild(rowsEl);

        for (let rowIndex = 0; rowIndex < group.rows.length; rowIndex += 1) {
            const row = group.rows[rowIndex];
            const rowEl = document.createElement('div');
            rowEl.className = 'controlsPanelRow';
            rowEl.dataset.onlineOnly = row.onlineOnly ? 'true' : 'false';
            rowEl.dataset.developerOnly = row.developerOnly ? 'true' : 'false';

            const metaEl = document.createElement('div');
            metaEl.className = 'controlsPanelMeta';
            const actionEl = document.createElement('div');
            actionEl.className = 'controlsPanelAction';
            actionEl.textContent = row.label;
            metaEl.appendChild(actionEl);
            if (row.hint) {
                const hintEl = document.createElement('div');
                hintEl.className = 'controlsPanelHint';
                hintEl.textContent = row.hint;
                metaEl.appendChild(hintEl);
            }
            rowsEl.appendChild(rowEl);
            rowEl.appendChild(metaEl);

            const keysEl = document.createElement('div');
            keysEl.className = 'controlsPanelKeys';
            const keyLabels = resolveRowKeyLabels(row, keyBindings);
            for (let labelIndex = 0; labelIndex < keyLabels.length; labelIndex += 1) {
                const keyEl = document.createElement('span');
                keyEl.className = 'controlsPanelKey';
                keyEl.textContent = keyLabels[labelIndex];
                keysEl.appendChild(keyEl);
            }
            rowEl.appendChild(keysEl);

            const availabilityEl = document.createElement('div');
            availabilityEl.className = 'controlsPanelAvailability';
            rowEl.appendChild(availabilityEl);

            rowBindings.push({
                rowEl,
                availabilityEl,
                onlineOnly: Boolean(row.onlineOnly),
                developerOnly: Boolean(row.developerOnly),
            });
        }
        bodyEl.appendChild(groupEl);
    }

    return {
        root: rootEl,
        applyAvailability(context) {
            applyRowsAvailability(rowBindings, context);
        },
        dispose() {},
    };
}

function applyRowsAvailability(rowBindings, context) {
    for (let index = 0; index < rowBindings.length; index += 1) {
        const binding = rowBindings[index];
        const onlineLocked = binding.onlineOnly && !context.onlineRoomActive;
        const developerLocked = binding.developerOnly && !context.localhost;
        const unavailable = onlineLocked || developerLocked;
        binding.rowEl.dataset.available = unavailable ? 'false' : 'true';
        if (!unavailable) {
            binding.availabilityEl.textContent = '';
            binding.availabilityEl.hidden = true;
            continue;
        }
        binding.availabilityEl.hidden = false;
        binding.availabilityEl.textContent = onlineLocked ? 'ONLINE ROOM' : 'LOCALHOST ONLY';
    }
}

function resolveRowKeyLabels(row, keyBindings = null) {
    if (Array.isArray(row?.keyLabels) && row.keyLabels.length > 0) {
        return row.keyLabels.map((entry) => String(entry || '').trim()).filter(Boolean);
    }
    if (!row?.actionId) {
        return ['—'];
    }
    const labels = resolveActionBindingLabels(row.actionId, keyBindings || undefined);
    if (labels.length <= 0) {
        return ['—'];
    }
    return labels;
}

function isLocalhost() {
    if (typeof window === 'undefined') {
        return false;
    }
    return String(window.location?.hostname || '').toLowerCase() === 'localhost';
}

function createNoopController() {
    return {
        refreshContext() {},
        setGameplayVisible() {},
        toggleGameplayOverlay() {
            return {
                open: false,
                message: null,
            };
        },
        setGameplayOverlayVisible() {},
        isGameplayOverlayVisible() {
            return false;
        },
        dispose() {},
    };
}
