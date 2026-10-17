import { MINE_MAX_PER_OWNER } from './constants.js';
import { ACTION_IDS, resolveActionBindingLabels } from './input-bindings.js';

const CONTROL_GROUPS = Object.freeze([
    {
        title: 'Drive',
        rows: [
            { label: 'Accelerate', actionId: ACTION_IDS.driveForward },
            { label: 'Brake / reverse', actionId: ACTION_IDS.driveBackward },
            { label: 'Steer left', actionId: ACTION_IDS.driveLeft },
            { label: 'Steer right', actionId: ACTION_IDS.driveRight },
            { label: 'Handbrake / drift', actionId: ACTION_IDS.handbrake },
        ],
    },
    {
        title: 'Weapons & mines',
        rows: [
            { label: 'Fire VX-9', actionId: ACTION_IDS.mineThrow, hint: 'Hold in VX-9 mode' },
            {
                label: 'Swap mine / VX-9',
                actionId: ACTION_IDS.combatModeToggle,
                hint: 'Collect a VX-9 pickup to unlock',
            },
            {
                label: 'Aim zoom',
                actionId: ACTION_IDS.vehicleWeaponZoom,
                hint: 'Hold in VX-9 mode',
            },
            { label: 'Throw mine forward', actionId: ACTION_IDS.mineThrow, hint: 'In mine mode' },
            { label: 'Drop mine behind', actionId: ACTION_IDS.mineDrop },
        ],
    },
    {
        title: 'Camera',
        rows: [
            {
                label: 'Next camera view',
                actionId: ACTION_IDS.cameraViewNext,
                hint: 'Cycle through 8 views',
            },
            {
                label: 'Select a view',
                actionRange: [ACTION_IDS.cameraView1, ACTION_IDS.cameraView8],
                hint: 'Alt is Option (⌥) on Mac',
            },
            { label: 'Cinematic camera', actionId: ACTION_IDS.cameraCinematicToggle },
            {
                label: 'Adjust chase camera',
                actionId: ACTION_IDS.cameraTuneToggle,
                hint: 'Then use arrow keys; R resets, Esc returns',
            },
        ],
    },
    {
        title: 'Session',
        rows: [
            { label: 'Controls / resume', actionId: ACTION_IDS.controlsHelp },
            { label: 'Pause / resume', actionId: ACTION_IDS.pauseToggle },
            { label: 'Recover vehicle', actionId: ACTION_IDS.recoverVehicle, hint: 'At low speed' },
            { label: 'Restart round', actionId: ACTION_IDS.restartRound },
            { label: 'Fullscreen', actionId: ACTION_IDS.fullscreenToggle },
            { label: 'Graphics quality', actionId: ACTION_IDS.graphicsCycle },
        ],
    },
    {
        title: 'Car roof screen',
        rows: [
            { label: 'Next screen', actionId: ACTION_IDS.roofMenuNext },
            { label: 'Previous screen', actionId: ACTION_IDS.roofMenuPrevious },
            { label: 'Dashboard', actionId: ACTION_IDS.roofModeDashboard },
            { label: 'Battery', actionId: ACTION_IDS.roofModeBattery },
            { label: 'Navigation', actionId: ACTION_IDS.roofModeNavigation },
            { label: 'Chassis', actionId: ACTION_IDS.roofModeChassis },
        ],
    },
]);

const CONTROL_LAYOUTS = Object.freeze({ welcome: CONTROL_GROUPS, pause: CONTROL_GROUPS });

export function createControlsHelpController({
    getIsInOnlineRoom = () => false,
    getGameMode = () => 'bots',
    getMineInventorySnapshot = () => null,
    getCombatLoadoutSnapshot = () => null,
    keyBindings = null,
    onOpenControls = () => {},
} = {}) {
    const welcomeHostEl = document.getElementById('welcomeControlsPanel');
    const pauseHostEl = document.getElementById('pauseControlsPanel');
    const gameplayStarterHud = mountGameplayStarterHud(keyBindings, onOpenControls);
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
        const snapshot = getCombatLoadoutSnapshot();
        gameplayStarterHud?.updateCombatLoadout?.(snapshot);
        gameplayMineHud?.updateCombatLoadout?.(snapshot);
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
            combatLoadout: getCombatLoadoutSnapshot(),
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
        <div class="controlsPanelKicker">${surface === 'pause' ? 'H / Esc to resume' : 'Keyboard'}</div>
    `;
    rootEl.appendChild(headerEl);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'controlsPanelBody';
    bodyEl.tabIndex = 0;
    bodyEl.setAttribute('aria-label', 'Keyboard control list');
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
    if (row?.actionRange) {
        return [
            row.actionRange
                .map((actionId) => resolvePrimaryKeyLabel(actionId, keyBindings))
                .join(' … '),
        ];
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

function mountGameplayStarterHud(keyBindings, onOpenControls) {
    if (typeof document === 'undefined' || !document.body) {
        return null;
    }
    const rootEl = document.createElement('aside');
    rootEl.id = 'gameplayControlsHud';
    rootEl.setAttribute('aria-label', 'Quick controls');
    rootEl.hidden = true;
    rootEl.innerHTML = `
        <div class="gameplayControlsHeader">
            <span>Controls</span>
            <button class="gameplayControlsCollapse" type="button"
                aria-controls="gameplayControlsKeys" aria-expanded="true"
                aria-label="Minimize quick controls">−</button>
        </div>
        <div id="gameplayControlsKeys" class="gameplayControlsKeys"></div>
        <p class="gameplayControlsHint" data-weapon-hint></p>
        <button class="gameplayControlsHelp" type="button" aria-controls="pauseModal">
            <span>All controls · pause</span><kbd></kbd>
        </button>
    `;
    const list = rootEl.querySelector('.gameplayControlsKeys');
    const hint = rootEl.querySelector('[data-weapon-hint]');
    const collapseButton = rootEl.querySelector('.gameplayControlsCollapse');
    const helpButton = rootEl.querySelector('.gameplayControlsHelp');
    helpButton.querySelector('kbd').textContent = resolvePrimaryKeyLabel(
        ACTION_IDS.controlsHelp,
        keyBindings
    );
    const rows = new Map();
    const definitions = [
        [
            'drive',
            'Drive',
            [
                ACTION_IDS.driveForward,
                ACTION_IDS.driveLeft,
                ACTION_IDS.driveBackward,
                ACTION_IDS.driveRight,
            ],
        ],
        ['fire', 'Throw mine', [ACTION_IDS.mineThrow]],
        ['swap', 'Swap mine / VX-9', [ACTION_IDS.combatModeToggle]],
        ['aim', 'Drop mine behind', [ACTION_IDS.mineDrop]],
        ['camera', 'Next camera view', [ACTION_IDS.cameraViewNext]],
        ['drift', 'Handbrake / drift', [ACTION_IDS.handbrake]],
    ];
    for (const [id, label, actions] of definitions) {
        const row = document.createElement('div');
        row.className = 'gameplayControlsRow';
        row.dataset.control = id;
        const text = document.createElement('span');
        text.textContent = label;
        const key = document.createElement('kbd');
        key.textContent = actions
            .map((action) => resolvePrimaryKeyLabel(action, keyBindings))
            .join(' ');
        row.append(text, key);
        list.append(row);
        rows.set(id, { row, text, key });
    }
    document.body.append(rootEl);
    let gameplayVisible = false;
    let collapsed = false;
    let lastLoadout = '';
    const onCollapse = () => setExpanded(collapsed);
    const onHelp = () => onOpenControls();
    collapseButton.addEventListener('click', onCollapse);
    helpButton.addEventListener('click', onHelp);

    return {
        applyState({ gameplayVisible: visible = false, combatLoadout = null } = {}) {
            gameplayVisible = Boolean(visible);
            rootEl.hidden = !gameplayVisible;
            updateCombatLoadout(combatLoadout);
        },
        notifyRoundStart() {},
        updateCombatLoadout,
        toggleVisible() {
            setExpanded(collapsed);
            return !collapsed;
        },
        setVisible(visible) {
            setExpanded(Boolean(visible));
        },
        isVisible() {
            return gameplayVisible && !collapsed;
        },
        dispose() {
            collapseButton.removeEventListener('click', onCollapse);
            helpButton.removeEventListener('click', onHelp);
            rootEl.remove();
        },
    };

    function setExpanded(expanded) {
        collapsed = !expanded;
        rootEl.dataset.collapsed = String(collapsed);
        list.hidden = collapsed;
        hint.hidden = collapsed;
        collapseButton.textContent = collapsed ? '+' : '−';
        collapseButton.setAttribute('aria-expanded', String(expanded));
        collapseButton.setAttribute(
            'aria-label',
            collapsed ? 'Expand quick controls' : 'Minimize quick controls'
        );
    }

    function updateCombatLoadout(snapshot) {
        const { hasWeapon, activeMode } = normalizeCombatLoadoutSnapshot(snapshot);
        const signature = `${hasWeapon}:${activeMode}`;
        if (signature === lastLoadout) return;
        lastLoadout = signature;
        const weaponActive = activeMode === 'weapon';
        rows.get('fire').text.textContent = weaponActive
            ? 'Fire VX-9 · hold'
            : 'Throw mine forward';
        rows.get('aim').text.textContent = weaponActive ? 'Aim zoom · hold' : 'Drop mine behind';
        rows.get('aim').key.textContent = resolvePrimaryKeyLabel(
            weaponActive ? ACTION_IDS.vehicleWeaponZoom : ACTION_IDS.mineDrop,
            keyBindings
        );
        rows.get('swap').row.dataset.available = String(hasWeapon);
        const fireKey = resolvePrimaryKeyLabel(ACTION_IDS.mineThrow, keyBindings);
        const swapKey = resolvePrimaryKeyLabel(ACTION_IDS.combatModeToggle, keyBindings);
        hint.textContent = hasWeapon
            ? weaponActive
                ? `VX-9 ready · release ${fireKey} to stop firing.`
                : `Mine mode · switch to VX-9 with ${swapKey}.`
            : 'Collect a VX-9 pickup to unlock firing.';
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
            combatModeHintEl.textContent = `${resolvePrimaryKeyLabel(ACTION_IDS.mineThrow, keyBindings)} ${snapshot.activeMode === 'weapon' ? 'fires VX-9 · hold' : 'throws mine'}`;
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
