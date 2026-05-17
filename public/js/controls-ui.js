import { MINE_MAX_PER_OWNER } from './constants.js';
import { ACTION_IDS, actionMatchesEvent, resolveActionBindingLabels } from './input-bindings.js';

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
                {
                    label: 'Recover Vehicle',
                    actionId: ACTION_IDS.recoverVehicle,
                    hint: 'Low speed',
                },
                { label: 'Restart Round', actionId: ACTION_IDS.restartRound },
                { label: 'Fullscreen', actionId: ACTION_IDS.fullscreenToggle },
                { label: 'Camera Tune', actionId: ACTION_IDS.cameraTuneToggle },
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
                    label: 'Use Hood Tool',
                    actionId: ACTION_IDS.mineThrow,
                    hint: 'Throws mine by default',
                },
                {
                    label: 'Swap Hood Tool',
                    actionId: ACTION_IDS.combatModeToggle,
                    hint: 'Switch mine / VX-9 when online',
                },
            ]),
        },
        {
            title: 'Vehicle Weapon',
            rows: Object.freeze([
                {
                    label: 'Use Hood Tool',
                    actionId: ACTION_IDS.mineThrow,
                    hint: 'Fires VX-9 when weapon mode is active',
                },
                {
                    label: 'Swap Hood Tool',
                    actionId: ACTION_IDS.combatModeToggle,
                    hint: 'Mine and VX-9 share the hood mount',
                },
                {
                    label: 'Aim Zoom',
                    actionId: ACTION_IDS.vehicleWeaponZoom,
                    hint: 'Hold to tighten VX-9 aim',
                },
            ]),
        },
    ]),
    pause: Object.freeze([
        {
            title: 'Quick Keys',
            rows: Object.freeze([
                { label: 'Resume', actionId: ACTION_IDS.pauseToggle },
                { label: 'Restart Round', actionId: ACTION_IDS.restartRound },
                { label: 'Tactical Map', actionId: ACTION_IDS.mapToggle },
                { label: 'Recover Vehicle', actionId: ACTION_IDS.recoverVehicle },
                { label: 'Fullscreen', actionId: ACTION_IDS.fullscreenToggle },
            ]),
        },
    ]),
});

export function createControlsHelpController({
    getIsInOnlineRoom = () => false,
    getGameMode = () => 'bots',
    getMineInventorySnapshot = () => null,
    getCombatLoadoutSnapshot = () => null,
    keyBindings = null,
} = {}) {
    const welcomeHostEl = document.getElementById('welcomeControlsPanel');
    const pauseHostEl = document.getElementById('pauseControlsPanel');
    const gameplayStarterHud = null;
    const gameplayMineHud = mountGameplayMineHud(keyBindings);
    if (!welcomeHostEl && !pauseHostEl && !gameplayStarterHud && !gameplayMineHud) {
        return createNoopController();
    }

    const state = {
        gameplayVisible: false,
        onlineRoomActive: false,
        gameMode: 'bots',
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
        notifyGameplayRoundStart,
        toggleGameplayOverlay,
        setGameplayOverlayVisible,
        refreshMineInventory,
        refreshCombatLoadout,
        isGameplayOverlayVisible() {
            return Boolean(gameplayStarterHud?.isVisible?.());
        },
        dispose,
    };

    function setGameplayVisible(nextVisible) {
        state.gameplayVisible = Boolean(nextVisible);
        if (nextVisible) {
            welcomeController?.setOpen?.(false);
        }
        syncGameplayStarterHud();
    }

    function notifyGameplayRoundStart() {
        gameplayStarterHud?.notifyRoundStart?.();
        gameplayMineHud?.notifyRoundStart?.(getMineInventorySnapshot(), getCombatLoadoutSnapshot());
    }

    function toggleGameplayOverlay() {
        const open = gameplayStarterHud?.toggleVisible?.();
        return {
            open: Boolean(open),
            message: null,
        };
    }

    function setGameplayOverlayVisible(nextVisible) {
        gameplayStarterHud?.setVisible?.(nextVisible);
    }

    function refreshMineInventory() {
        gameplayMineHud?.updateInventory?.(getMineInventorySnapshot());
    }

    function refreshCombatLoadout() {
        gameplayMineHud?.updateCombatLoadout?.(getCombatLoadoutSnapshot());
    }

    function refreshContext() {
        const onlineRoomActive = Boolean(getIsInOnlineRoom());
        const gameMode = normalizeGameMode(getGameMode());
        if (onlineRoomActive !== state.onlineRoomActive) {
            state.onlineRoomActive = onlineRoomActive;
        }
        if (gameMode !== state.gameMode) {
            state.gameMode = gameMode;
        }
        for (let index = 0; index < controllers.length; index += 1) {
            controllers[index].applyAvailability({
                onlineRoomActive: state.onlineRoomActive,
                localhost: state.localhost,
            });
        }
        syncGameplayStarterHud();
    }

    function dispose() {
        window.clearInterval(pollHandle);
        for (let index = 0; index < controllers.length; index += 1) {
            controllers[index].dispose?.();
        }
        gameplayStarterHud?.dispose?.();
        gameplayMineHud?.dispose?.();
    }

    function syncGameplayStarterHud() {
        gameplayStarterHud?.applyState?.({
            gameplayVisible: state.gameplayVisible,
            gameMode: state.gameMode,
        });
        gameplayMineHud?.applyState?.({
            gameplayVisible: state.gameplayVisible,
            gameMode: state.gameMode,
            mineInventory: getMineInventorySnapshot(),
            combatLoadout: getCombatLoadoutSnapshot(),
        });
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

function mountGameplayStarterHud(keyBindings) {
    if (typeof document === 'undefined' || !document.body) {
        return null;
    }

    const actionGroups = Object.freeze([
        {
            name: 'drive',
            actionIds: Object.freeze([
                ACTION_IDS.driveForward,
                ACTION_IDS.driveBackward,
                ACTION_IDS.driveLeft,
                ACTION_IDS.driveRight,
            ]),
        },
        {
            name: 'mines',
            actionIds: Object.freeze([ACTION_IDS.mineDrop, ACTION_IDS.mineThrow]),
        },
        {
            name: 'camera',
            actionIds: Object.freeze([
                ACTION_IDS.cameraView1,
                ACTION_IDS.cameraView2,
                ACTION_IDS.cameraView3,
                ACTION_IDS.cameraView4,
                ACTION_IDS.cameraView5,
                ACTION_IDS.cameraView6,
                ACTION_IDS.cameraView7,
                ACTION_IDS.cameraView8,
                ACTION_IDS.cameraCinematicToggle,
            ]),
        },
    ]);
    const completeCollapseDelayMs = 900;
    const driveStartCollapseDelayMs = 520;
    const exitAnimationMs = 260;
    const pulseDurationMs = 220;
    const pulseTimers = new Map();

    const rootEl = document.createElement('aside');
    rootEl.id = 'starterControlsHud';
    rootEl.setAttribute('aria-label', 'Gameplay controls');
    rootEl.setAttribute('aria-hidden', 'true');
    rootEl.hidden = true;
    rootEl.innerHTML = `
        <button
            class="starterControlsHudToggle"
            type="button"
            aria-label="Minimize controls"
            title="Minimize controls"
        ></button>
        <div class="starterControlsHudHeader" aria-hidden="true">
            <span class="starterControlsHudEyebrow">Controls</span>
        </div>
        <div class="starterControlsHudGrid">
            <section
                class="starterControlCard starterControlCard--drive"
                data-control-group="drive"
                aria-label="Drive with keyboard"
            >
                <div class="starterControlHead">
                    <span class="starterControlLabel">Drive</span>
                    <span class="starterControlStateDot" aria-hidden="true"></span>
                </div>
                <div class="starterDriveCluster" aria-hidden="true">
                    <span class="starterKey starterKey--offset" data-drive-key="forward"></span>
                    <span class="starterKey" data-drive-key="left"></span>
                    <span class="starterKey" data-drive-key="backward"></span>
                    <span class="starterKey" data-drive-key="right"></span>
                </div>
            </section>
            <section
                class="starterControlCard starterControlCard--mines"
                data-control-group="mines"
                aria-label="Deploy mines"
            >
                <div class="starterControlHead">
                    <span class="starterControlLabel">Mines</span>
                    <span class="starterControlStateDot" aria-hidden="true"></span>
                </div>
                <div class="starterActionList" aria-hidden="true">
                    <div class="starterActionRow">
                        <span class="starterKey" data-mine-key="drop"></span>
                        <span class="starterActionText">Drop</span>
                    </div>
                    <div class="starterActionRow">
                        <span class="starterKey" data-mine-key="throw"></span>
                        <span class="starterActionText">Throw</span>
                    </div>
                </div>
            </section>
            <section
                class="starterControlCard starterControlCard--camera"
                data-control-group="camera"
                aria-label="Switch camera views"
            >
                <div class="starterControlHead">
                    <span class="starterControlLabel">Cam</span>
                    <span class="starterControlStateDot" aria-hidden="true"></span>
                </div>
                <div class="starterCameraLayout" aria-hidden="true">
                    <div class="starterCameraModifierRow">
                        <div class="starterActionRow">
                            <span
                                class="starterKey starterKey--wide"
                                data-camera-key="modifier"
                            >
                                +
                            </span>
                            <span
                                class="starterKey starterKey--range"
                                data-camera-key="views"
                            >
                                Next
                            </span>
                            <span class="starterActionText">Views</span>
                        </div>
                    </div>
                    <div class="starterActionList starterActionList--compact">
                        <div class="starterActionRow">
                            <span class="starterKey" data-camera-key="cine">C</span>
                            <span class="starterActionText">Cine</span>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    `;
    document.body.append(rootEl);

    const sectionEls = {
        drive: rootEl.querySelector('[data-control-group="drive"]'),
        mines: rootEl.querySelector('[data-control-group="mines"]'),
        camera: rootEl.querySelector('[data-control-group="camera"]'),
    };
    const collapseToggleEl = rootEl.querySelector('.starterControlsHudToggle');
    const state = {
        activeSession: false,
        available: false,
        collapseTimer: null,
        collapsed: false,
        gameplayVisible: false,
        visible: false,
        driveCollapseTriggered: false,
    };

    const keyElements = {
        driveForward: rootEl.querySelector('[data-drive-key="forward"]'),
        driveLeft: rootEl.querySelector('[data-drive-key="left"]'),
        driveBackward: rootEl.querySelector('[data-drive-key="backward"]'),
        driveRight: rootEl.querySelector('[data-drive-key="right"]'),
        mineDrop: rootEl.querySelector('[data-mine-key="drop"]'),
        mineThrow: rootEl.querySelector('[data-mine-key="throw"]'),
        cameraModifier: rootEl.querySelector('[data-camera-key="modifier"]'),
        cameraViews: rootEl.querySelector('[data-camera-key="views"]'),
        cameraCine: rootEl.querySelector('[data-camera-key="cine"]'),
    };
    const trackedKeys = [
        {
            id: 'driveForward',
            section: 'drive',
            element: keyElements.driveForward,
            actionIds: [ACTION_IDS.driveForward],
        },
        {
            id: 'driveLeft',
            section: 'drive',
            element: keyElements.driveLeft,
            actionIds: [ACTION_IDS.driveLeft],
        },
        {
            id: 'driveBackward',
            section: 'drive',
            element: keyElements.driveBackward,
            actionIds: [ACTION_IDS.driveBackward],
        },
        {
            id: 'driveRight',
            section: 'drive',
            element: keyElements.driveRight,
            actionIds: [ACTION_IDS.driveRight],
        },
        {
            id: 'mineDrop',
            section: 'mines',
            element: keyElements.mineDrop,
            actionIds: [ACTION_IDS.mineDrop],
        },
        {
            id: 'mineThrow',
            section: 'mines',
            element: keyElements.mineThrow,
            actionIds: [ACTION_IDS.mineThrow],
        },
        {
            id: 'cameraModifier',
            section: 'camera',
            element: keyElements.cameraModifier,
            actionIds: actionGroups[2].actionIds.slice(0, 8),
        },
        {
            id: 'cameraViews',
            section: 'camera',
            element: keyElements.cameraViews,
            actionIds: actionGroups[2].actionIds.slice(0, 8),
        },
        {
            id: 'cameraCine',
            section: 'camera',
            element: keyElements.cameraCine,
            actionIds: [ACTION_IDS.cameraCinematicToggle],
        },
    ];
    const learnedKeyIds = new Set();

    if (keyElements.driveForward) {
        keyElements.driveForward.textContent = resolvePreferredDriveKeyLabel(
            ACTION_IDS.driveForward,
            keyBindings
        );
    }
    if (keyElements.driveLeft) {
        keyElements.driveLeft.textContent = resolvePreferredDriveKeyLabel(
            ACTION_IDS.driveLeft,
            keyBindings
        );
    }
    if (keyElements.driveBackward) {
        keyElements.driveBackward.textContent = resolvePreferredDriveKeyLabel(
            ACTION_IDS.driveBackward,
            keyBindings
        );
    }
    if (keyElements.driveRight) {
        keyElements.driveRight.textContent = resolvePreferredDriveKeyLabel(
            ACTION_IDS.driveRight,
            keyBindings
        );
    }
    if (keyElements.mineDrop) {
        keyElements.mineDrop.textContent = resolvePrimaryKeyLabel(ACTION_IDS.mineDrop, keyBindings);
    }
    if (keyElements.mineThrow) {
        keyElements.mineThrow.textContent = resolvePrimaryKeyLabel(
            ACTION_IDS.mineThrow,
            keyBindings
        );
    }

    syncLearnedState();
    syncCollapsedState();

    const onCollapseToggleClick = () => {
        if (!state.visible || !state.available || !state.activeSession) {
            return;
        }
        setCollapsed(!state.collapsed);
    };

    const onKeydown = (event) => {
        if (!state.visible || !state.available || !state.activeSession || event?.repeat) {
            return;
        }
        const matchedKeyIds = resolveTrackedKeyIds(event);
        if (matchedKeyIds.length <= 0) {
            return;
        }
        const affectedSections = new Set();
        for (let index = 0; index < matchedKeyIds.length; index += 1) {
            const keyId = matchedKeyIds[index];
            pulseKey(keyId);
            const trackedKey = trackedKeys.find((entry) => entry.id === keyId);
            if (trackedKey?.section) {
                affectedSections.add(trackedKey.section);
            }
            learnedKeyIds.add(keyId);
        }
        for (const sectionName of affectedSections.values()) {
            pulseSection(sectionName);
        }
        syncLearnedState();
        if (!state.driveCollapseTriggered && affectedSections.has('drive') && !state.collapsed) {
            state.driveCollapseTriggered = true;
            scheduleCollapse(driveStartCollapseDelayMs);
        }
        if (learnedKeyIds.size >= trackedKeys.length && !state.collapsed) {
            scheduleCollapse(completeCollapseDelayMs);
        }
    };

    collapseToggleEl?.addEventListener('click', onCollapseToggleClick);
    window.addEventListener('keydown', onKeydown, { passive: true });

    return {
        applyState({ gameplayVisible = false, gameMode = 'bots' } = {}) {
            const normalizedMode = normalizeGameMode(gameMode);
            state.gameplayVisible = Boolean(gameplayVisible);
            state.available = normalizedMode === 'online' || normalizedMode === 'bots';
            rootEl.dataset.mode = normalizedMode;
            syncVisibility();
        },
        notifyRoundStart() {
            state.activeSession = true;
            state.collapsed = false;
            state.driveCollapseTriggered = false;
            learnedKeyIds.clear();
            syncLearnedState();
            syncCollapsedState();
            clearTimers();
            syncVisibility();
        },
        toggleVisible() {
            if (!state.available) {
                return false;
            }
            if (!state.visible) {
                state.activeSession = true;
                clearTimers();
            } else if (state.collapsed) {
                state.collapsed = false;
                syncCollapsedState();
            }
            applyVisibility(!state.visible);
            return state.visible;
        },
        setVisible(nextVisible) {
            if (!nextVisible) {
                state.activeSession = false;
                clearTimers();
            }
            applyVisibility(Boolean(nextVisible));
        },
        isVisible() {
            return state.visible;
        },
        dispose() {
            collapseToggleEl?.removeEventListener('click', onCollapseToggleClick);
            window.removeEventListener('keydown', onKeydown, { passive: true });
            clearTimers();
            for (const timer of pulseTimers.values()) {
                window.clearTimeout(timer);
            }
            rootEl.remove();
        },
    };

    function syncVisibility() {
        if (!state.gameplayVisible || !state.available || !state.activeSession) {
            applyVisibility(false, { immediate: true });
            return;
        }
        applyVisibility(true);
    }

    function syncCollapsedState() {
        rootEl.dataset.collapsed = state.collapsed ? 'true' : 'false';
        if (collapseToggleEl) {
            const actionLabel = state.collapsed ? 'Expand controls' : 'Minimize controls';
            collapseToggleEl.setAttribute('aria-label', actionLabel);
            collapseToggleEl.setAttribute('title', actionLabel);
        }
    }

    function applyVisibility(nextVisible, options = {}) {
        const shouldShow = Boolean(nextVisible);
        const immediate = Boolean(options.immediate);
        if (shouldShow) {
            rootEl.hidden = false;
            rootEl.setAttribute('aria-hidden', 'false');
            rootEl.classList.remove('is-exiting');
            requestAnimationFrame(() => {
                rootEl.classList.add('is-visible');
            });
            state.visible = true;
            return;
        }

        rootEl.classList.remove('is-visible');
        state.visible = false;
        if (immediate) {
            rootEl.classList.remove('is-exiting');
            rootEl.hidden = true;
            rootEl.setAttribute('aria-hidden', 'true');
            return;
        }
        rootEl.classList.add('is-exiting');
        window.setTimeout(() => {
            if (state.visible) {
                return;
            }
            rootEl.classList.remove('is-exiting');
            rootEl.hidden = true;
            rootEl.setAttribute('aria-hidden', 'true');
        }, exitAnimationMs);
    }

    function resolveTrackedKeyIds(event) {
        const matches = [];
        for (let index = 0; index < trackedKeys.length; index += 1) {
            const trackedKey = trackedKeys[index];
            for (let actionIndex = 0; actionIndex < trackedKey.actionIds.length; actionIndex += 1) {
                if (
                    actionMatchesEvent(
                        trackedKey.actionIds[actionIndex],
                        event,
                        keyBindings || undefined
                    )
                ) {
                    matches.push(trackedKey.id);
                    break;
                }
            }
        }
        return matches;
    }

    function syncLearnedState() {
        rootEl.dataset.progress = `${learnedKeyIds.size}/${trackedKeys.length}`;
        for (let index = 0; index < trackedKeys.length; index += 1) {
            const trackedKey = trackedKeys[index];
            if (!trackedKey.element) {
                continue;
            }
            trackedKey.element.dataset.learned = learnedKeyIds.has(trackedKey.id)
                ? 'true'
                : 'false';
        }
        for (let index = 0; index < actionGroups.length; index += 1) {
            const group = actionGroups[index];
            const sectionEl = sectionEls[group.name];
            if (!sectionEl) {
                continue;
            }
            const sectionCompleted = trackedKeys
                .filter((trackedKey) => trackedKey.section === group.name)
                .every((trackedKey) => learnedKeyIds.has(trackedKey.id));
            sectionEl.dataset.learned = sectionCompleted ? 'true' : 'false';
        }
    }

    function pulseKey(keyId) {
        const trackedKey = trackedKeys.find((entry) => entry.id === keyId);
        const keyEl = trackedKey?.element;
        if (!keyEl) {
            return;
        }
        keyEl.classList.remove('is-pulsing');
        void keyEl.offsetWidth;
        keyEl.classList.add('is-pulsing');
        window.setTimeout(() => {
            keyEl.classList.remove('is-pulsing');
        }, pulseDurationMs);
    }

    function pulseSection(groupName) {
        const sectionEl = sectionEls[groupName];
        if (!sectionEl) {
            return;
        }
        sectionEl.classList.remove('is-pulsing');
        void sectionEl.offsetWidth;
        sectionEl.classList.add('is-pulsing');
        window.clearTimeout(pulseTimers.get(groupName));
        const timer = window.setTimeout(() => {
            sectionEl.classList.remove('is-pulsing');
            pulseTimers.delete(groupName);
        }, pulseDurationMs);
        pulseTimers.set(groupName, timer);
    }

    function scheduleCollapse(delayMs) {
        window.clearTimeout(state.collapseTimer);
        state.collapseTimer = window.setTimeout(() => {
            setCollapsed(true);
            state.collapseTimer = null;
        }, delayMs);
    }

    function setCollapsed(nextCollapsed) {
        clearTimers();
        state.collapsed = Boolean(nextCollapsed);
        syncCollapsedState();
    }

    function clearTimers() {
        window.clearTimeout(state.collapseTimer);
        state.collapseTimer = null;
    }
}

function normalizeMineInventorySnapshot(snapshot = null) {
    const capacity = Math.max(1, Math.round(Number(snapshot?.capacity) || MINE_MAX_PER_OWNER));
    const remainingCount = clampCount(snapshot?.remainingCount, 0, capacity, capacity);
    const activeCount = clampCount(snapshot?.activeCount, 0, capacity, 0);
    return {
        capacity,
        remainingCount,
        activeCount,
        cooldownDurationMs: clampCooldown(snapshot?.cooldownDurationMs, 0),
        cooldownReadyAtMs: clampCooldown(snapshot?.cooldownReadyAtMs, 0),
        cooldownRemainingMs: clampCooldown(snapshot?.cooldownRemainingMs, 0),
    };
}

function normalizeCombatLoadoutSnapshot(snapshot = null) {
    const hasWeapon = Boolean(snapshot?.hasWeapon);
    const activeMode = hasWeapon && snapshot?.mode === 'weapon' ? 'weapon' : 'mine';
    return {
        hasWeapon,
        activeMode,
    };
}

function mountGameplayMineHud(keyBindings = null) {
    if (typeof document === 'undefined' || !document.body) {
        return null;
    }

    const rootEl = document.createElement('aside');
    rootEl.id = 'starterMineRackHud';
    rootEl.setAttribute('aria-label', 'Mine inventory');
    rootEl.setAttribute('aria-hidden', 'true');
    rootEl.hidden = true;
    rootEl.innerHTML = `
        <div class="starterMineRackShell">
            <div class="starterMineRackModeStrip" aria-hidden="true">
                <div class="starterMineRackModeMeta">
                    <span class="starterMineRackModeEyebrow">Hood tool</span>
                    <span class="starterMineRackModeValue" data-combat-mode-value>MINE</span>
                </div>
                <div class="starterMineRackModeAction">
                    <span class="starterMineRackModeActionLabel" data-combat-mode-switch-label>LOCKED</span>
                    <span class="starterMineRackModeKey" data-combat-mode-key>${resolvePrimaryKeyLabel(
                        ACTION_IDS.combatModeToggle
                    )}</span>
                </div>
            </div>
            <div class="starterMineRackModeHint" data-combat-mode-hint>T throws mine</div>
            <div class="starterMineRackHeader" aria-hidden="true">
                <div class="starterMineRackCountWrap">
                    <span class="starterMineRackCount" data-mine-rack-count>${MINE_MAX_PER_OWNER}</span>
                    <span class="starterMineRackCapacity">/${MINE_MAX_PER_OWNER}</span>
                </div>
                <div class="starterMineRackHeaderMeta">
                    <span class="starterMineRackCooldownText" data-mine-rack-cooldown-text>0.0s</span>
                    <span class="starterMineRackStatusDot"></span>
                </div>
            </div>
            <div class="starterMineRackCooldownTrack" aria-hidden="true">
                <span class="starterMineRackCooldownFill" data-mine-rack-cooldown-fill></span>
            </div>
            <div class="starterMineRackGrid" data-mine-rack-grid></div>
        </div>
    `;
    document.body.append(rootEl);

    const gridEl = rootEl.querySelector('[data-mine-rack-grid]');
    const countEl = rootEl.querySelector('[data-mine-rack-count]');
    const cooldownTextEl = rootEl.querySelector('[data-mine-rack-cooldown-text]');
    const cooldownFillEl = rootEl.querySelector('[data-mine-rack-cooldown-fill]');
    const combatModeValueEl = rootEl.querySelector('[data-combat-mode-value]');
    const combatModeHintEl = rootEl.querySelector('[data-combat-mode-hint]');
    const combatModeSwitchLabelEl = rootEl.querySelector('[data-combat-mode-switch-label]');
    const combatModeKeyEl = rootEl.querySelector('[data-combat-mode-key]');
    const chargeEls = [];
    const spentPulseTimers = new Map();
    let modePulseTimer = 0;
    const state = {
        activeSession: false,
        available: false,
        combatMode: 'mine',
        capacity: MINE_MAX_PER_OWNER,
        cooldownDurationMs: 0,
        cooldownReadyAtMs: 0,
        cooldownTickHandle: null,
        gameplayVisible: false,
        hasWeapon: false,
        remainingCount: MINE_MAX_PER_OWNER,
        visible: false,
    };

    if (gridEl) {
        for (let index = 0; index < MINE_MAX_PER_OWNER; index += 1) {
            const chargeEl = document.createElement('span');
            chargeEl.className = 'starterMineCharge';
            chargeEl.dataset.slotIndex = String(index);
            chargeEl.dataset.filled = 'true';
            chargeEl.innerHTML = `
                <span class="starterMineChargePins" aria-hidden="true"></span>
                <span class="starterMineChargeBase" aria-hidden="true"></span>
                <span class="starterMineChargeTop" aria-hidden="true"></span>
                <span class="starterMineChargeLed" aria-hidden="true"></span>
            `;
            gridEl.append(chargeEl);
            chargeEls.push(chargeEl);
        }
    }

    applyInventorySnapshot(normalizeMineInventorySnapshot(null));
    applyCombatLoadoutSnapshot(normalizeCombatLoadoutSnapshot(null), {
        animateSwitch: false,
    });

    return {
        applyState({
            gameplayVisible = false,
            gameMode = 'bots',
            mineInventory = null,
            combatLoadout = null,
        } = {}) {
            const normalizedMode = normalizeGameMode(gameMode);
            state.gameplayVisible = Boolean(gameplayVisible);
            state.available = normalizedMode === 'online' || normalizedMode === 'bots';
            rootEl.dataset.mode = normalizedMode;
            applyInventorySnapshot(normalizeMineInventorySnapshot(mineInventory));
            applyCombatLoadoutSnapshot(normalizeCombatLoadoutSnapshot(combatLoadout), {
                animateSwitch: false,
            });
            syncVisibility();
        },
        notifyRoundStart(mineInventory = null, combatLoadout = null) {
            state.activeSession = true;
            applyInventorySnapshot(normalizeMineInventorySnapshot(mineInventory), {
                animateSpent: false,
            });
            applyCombatLoadoutSnapshot(normalizeCombatLoadoutSnapshot(combatLoadout), {
                animateSwitch: false,
            });
            syncVisibility();
        },
        updateInventory(mineInventory = null) {
            applyInventorySnapshot(normalizeMineInventorySnapshot(mineInventory));
        },
        updateCombatLoadout(combatLoadout = null) {
            applyCombatLoadoutSnapshot(normalizeCombatLoadoutSnapshot(combatLoadout));
        },
        dispose() {
            stopCooldownTicker();
            for (const timer of spentPulseTimers.values()) {
                window.clearTimeout(timer);
            }
            if (modePulseTimer) {
                window.clearTimeout(modePulseTimer);
                modePulseTimer = 0;
            }
            rootEl.remove();
        },
    };

    function syncVisibility() {
        const shouldShow = state.gameplayVisible && state.available && state.activeSession;
        if (shouldShow) {
            rootEl.hidden = false;
            rootEl.setAttribute('aria-hidden', 'false');
            requestAnimationFrame(() => {
                rootEl.classList.add('is-visible');
            });
            state.visible = true;
            syncCooldownTicker();
            return;
        }
        rootEl.classList.remove('is-visible');
        rootEl.hidden = true;
        rootEl.setAttribute('aria-hidden', 'true');
        state.visible = false;
        stopCooldownTicker();
    }

    function applyInventorySnapshot(snapshot, options = {}) {
        const animateSpent = options.animateSpent !== false;
        const previousRemainingCount = state.remainingCount;
        state.capacity = snapshot.capacity;
        state.remainingCount = snapshot.remainingCount;
        state.cooldownDurationMs = snapshot.cooldownDurationMs;
        state.cooldownReadyAtMs = snapshot.cooldownReadyAtMs;
        const stockState =
            snapshot.remainingCount <= 0
                ? 'empty'
                : snapshot.remainingCount <= 2
                  ? 'low'
                  : snapshot.remainingCount <= Math.ceil(snapshot.capacity * 0.5)
                    ? 'mid'
                    : 'full';
        rootEl.dataset.stockState = stockState;
        rootEl.dataset.stockRemaining = String(snapshot.remainingCount);
        if (countEl) {
            countEl.textContent = String(snapshot.remainingCount);
        }
        updateCooldownPresentation(snapshot.cooldownRemainingMs, snapshot.cooldownDurationMs);
        for (let index = 0; index < chargeEls.length; index += 1) {
            chargeEls[index].dataset.filled = index < snapshot.remainingCount ? 'true' : 'false';
        }
        if (
            animateSpent &&
            state.visible &&
            Number.isFinite(previousRemainingCount) &&
            previousRemainingCount > snapshot.remainingCount
        ) {
            for (let index = snapshot.remainingCount; index < previousRemainingCount; index += 1) {
                pulseSpentCharge(index);
            }
        }
        syncCooldownTicker();
    }

    function applyCombatLoadoutSnapshot(snapshot, options = {}) {
        const animateSwitch = options.animateSwitch !== false;
        const previousMode = state.combatMode;
        state.combatMode = snapshot.activeMode;
        state.hasWeapon = snapshot.hasWeapon;
        rootEl.dataset.combatMode = snapshot.activeMode;
        rootEl.dataset.weaponOnline = snapshot.hasWeapon ? 'true' : 'false';
        if (combatModeValueEl) {
            combatModeValueEl.textContent = snapshot.activeMode === 'weapon' ? 'VX-9' : 'MINE';
        }
        if (combatModeHintEl) {
            combatModeHintEl.textContent =
                snapshot.activeMode === 'weapon' ? 'T fires VX-9' : 'T throws mine';
        }
        if (combatModeSwitchLabelEl) {
            combatModeSwitchLabelEl.textContent = snapshot.hasWeapon ? 'SWAP' : 'LOCKED';
        }
        if (combatModeKeyEl) {
            combatModeKeyEl.textContent = resolvePrimaryKeyLabel(
                ACTION_IDS.combatModeToggle,
                keyBindings
            );
        }
        if (
            animateSwitch &&
            state.visible &&
            state.activeSession &&
            previousMode !== snapshot.activeMode
        ) {
            pulseModeSwitch();
        }
    }

    function pulseSpentCharge(index) {
        const chargeEl = chargeEls[index];
        if (!chargeEl) {
            return;
        }
        chargeEl.classList.remove('is-spent-pulsing');
        void chargeEl.offsetWidth;
        chargeEl.classList.add('is-spent-pulsing');
        window.clearTimeout(spentPulseTimers.get(index));
        const timer = window.setTimeout(() => {
            chargeEl.classList.remove('is-spent-pulsing');
            spentPulseTimers.delete(index);
        }, 380);
        spentPulseTimers.set(index, timer);
    }

    function pulseModeSwitch() {
        rootEl.classList.remove('is-mode-switching');
        void rootEl.offsetWidth;
        rootEl.classList.add('is-mode-switching');
        if (modePulseTimer) {
            window.clearTimeout(modePulseTimer);
        }
        modePulseTimer = window.setTimeout(() => {
            rootEl.classList.remove('is-mode-switching');
            modePulseTimer = 0;
        }, 520);
    }

    function syncCooldownTicker() {
        if (!state.visible || state.cooldownReadyAtMs <= Date.now()) {
            stopCooldownTicker();
            if (state.visible) {
                updateCooldownPresentation(0, state.cooldownDurationMs);
            }
            return;
        }
        if (state.cooldownTickHandle != null) {
            return;
        }
        state.cooldownTickHandle = window.setInterval(() => {
            const remainingMs = Math.max(0, state.cooldownReadyAtMs - Date.now());
            updateCooldownPresentation(remainingMs, state.cooldownDurationMs);
            if (remainingMs <= 0) {
                state.cooldownReadyAtMs = 0;
                stopCooldownTicker();
                if (state.remainingCount <= 0) {
                    state.remainingCount = state.capacity;
                    rootEl.dataset.stockState = 'full';
                    rootEl.dataset.stockRemaining = String(state.capacity);
                    if (countEl) {
                        countEl.textContent = String(state.capacity);
                    }
                    for (let index = 0; index < chargeEls.length; index += 1) {
                        chargeEls[index].dataset.filled = index < state.capacity ? 'true' : 'false';
                    }
                }
                updateCooldownPresentation(0, state.cooldownDurationMs);
            }
        }, 80);
    }

    function stopCooldownTicker() {
        if (state.cooldownTickHandle == null) {
            return;
        }
        window.clearInterval(state.cooldownTickHandle);
        state.cooldownTickHandle = null;
    }

    function updateCooldownPresentation(remainingMs = 0, durationMs = 0) {
        const clampedRemainingMs = clampCooldown(remainingMs, 0);
        const clampedDurationMs = clampCooldown(durationMs, 0);
        const cooldownActive = clampedRemainingMs > 0 && clampedDurationMs > 0;
        rootEl.dataset.cooldownActive = cooldownActive ? 'true' : 'false';
        if (cooldownTextEl) {
            cooldownTextEl.textContent = cooldownActive
                ? formatCooldownLabel(clampedRemainingMs)
                : 'READY';
        }
        if (cooldownFillEl) {
            const progress =
                cooldownActive && clampedDurationMs > 0
                    ? 1 - Math.max(0, Math.min(1, clampedRemainingMs / clampedDurationMs))
                    : 1;
            cooldownFillEl.style.transform = `scaleX(${progress.toFixed(3)})`;
        }
    }
}

function clampCount(value, min, max, fallback) {
    const numeric = Math.round(Number(value));
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
}

function clampCooldown(value, fallback = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(0, numeric);
}

function formatCooldownLabel(remainingMs) {
    const seconds = Math.max(0, remainingMs) / 1000;
    if (seconds >= 10) {
        return `${seconds.toFixed(0)}s`;
    }
    return `${seconds.toFixed(1)}s`;
}

function resolvePrimaryKeyLabel(actionId, keyBindings = null) {
    const labels = resolveActionBindingLabels(actionId, keyBindings || undefined);
    return labels[0] || '—';
}

function resolvePreferredDriveKeyLabel(actionId, keyBindings = null) {
    const labels = resolveActionBindingLabels(actionId, keyBindings || undefined);
    for (let index = 0; index < labels.length; index += 1) {
        const label = labels[index];
        if (label === '↑' || label === '↓' || label === '←' || label === '→') {
            return label;
        }
    }
    return labels[0] || '—';
}

function normalizeGameMode(rawMode) {
    return rawMode === 'online' ? 'online' : 'bots';
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
        notifyGameplayRoundStart() {},
        toggleGameplayOverlay() {
            return {
                open: false,
                message: null,
            };
        },
        setGameplayOverlayVisible() {},
        refreshMineInventory() {},
        refreshCombatLoadout() {},
        isGameplayOverlayVisible() {
            return false;
        },
        dispose() {},
    };
}
