import {
    getGroundDebugLayerLabel,
    getGroundDebugLayerOrder,
} from './environment/ground-debug.js';

export function createGroundLayerDebugController({ scene } = {}) {
    if (!scene || typeof document === 'undefined' || !document.body) {
        return createNoopController();
    }

    const rootEl = document.createElement('aside');
    rootEl.id = 'groundLayerDebugPanel';
    rootEl.className = 'groundLayerDebugPanel';
    rootEl.dataset.open = 'true';
    rootEl.innerHTML = `
        <div class="groundLayerDebugHeader">
            <div class="groundLayerDebugHeading">
                <div class="groundLayerDebugKicker">Debug</div>
                <div class="groundLayerDebugTitle">Ground Layers</div>
            </div>
            <button
                type="button"
                class="groundLayerDebugCollapseBtn"
                aria-label="Collapse ground layer debug panel"
            >
                -
            </button>
        </div>
        <div class="groundLayerDebugToolbar">
            <button type="button" class="groundLayerDebugActionBtn" data-action="all-on">All on</button>
            <button type="button" class="groundLayerDebugActionBtn" data-action="all-off">All off</button>
            <button type="button" class="groundLayerDebugActionBtn" data-action="refresh">Refresh</button>
        </div>
        <div class="groundLayerDebugBody"></div>
    `;
    document.body.appendChild(rootEl);

    const collapseBtn = rootEl.querySelector('.groundLayerDebugCollapseBtn');
    const toolbarEl = rootEl.querySelector('.groundLayerDebugToolbar');
    const bodyEl = rootEl.querySelector('.groundLayerDebugBody');

    const state = {
        open: true,
        editModeActive: false,
        entries: [],
        explicitVisibility: new Map(),
        refreshTimeouts: [],
    };

    collapseBtn?.addEventListener('click', () => {
        setOpen(!state.open);
    });
    toolbarEl?.addEventListener('click', (event) => {
        const action = event.target?.dataset?.action || '';
        if (action === 'all-on') {
            setAllVisible(true);
            return;
        }
        if (action === 'all-off') {
            setAllVisible(false);
            return;
        }
        if (action === 'refresh') {
            refresh();
        }
    });

    const onKeyDown = (event) => {
        if (
            event.defaultPrevented ||
            !state.editModeActive ||
            !event.shiftKey ||
            event.key?.toLowerCase() !== 'g'
        ) {
            return;
        }
        event.preventDefault();
        setOpen(!state.open);
    };
    window.addEventListener('keydown', onKeyDown);

    window.__groundLayerDebug = {
        refresh,
        list,
        setVisible,
        setAllVisible,
        showOnly(layerIds = []) {
            const keepIds = new Set(
                (Array.isArray(layerIds) ? layerIds : [layerIds]).map((value) => String(value || ''))
            );
            state.entries.forEach((entry) => {
                setVisible(entry.id, keepIds.has(entry.id));
            });
        },
        panel: rootEl,
    };

    refresh();
    scheduleBootstrapRefreshes();
    syncRootVisibility();

    return {
        refresh,
        list,
        setVisible,
        setAllVisible,
        setOpen,
        setEditModeActive,
        dispose() {
            window.removeEventListener('keydown', onKeyDown);
            state.refreshTimeouts.forEach((handle) => window.clearTimeout(handle));
            state.refreshTimeouts.length = 0;
            if (window.__groundLayerDebug?.panel === rootEl) {
                delete window.__groundLayerDebug;
            }
            rootEl.remove();
        },
    };

    function scheduleBootstrapRefreshes() {
        const refreshDelaysMs = [120, 420, 1100, 2200, 4200];
        refreshDelaysMs.forEach((delayMs) => {
            const timeoutHandle = window.setTimeout(() => {
                refresh();
            }, delayMs);
            state.refreshTimeouts.push(timeoutHandle);
        });
    }

    function collectEntries() {
        const entriesById = new Map();
        scene.traverse((node) => {
            const layerId = node?.userData?.groundDebugLayerId;
            if (!layerId) {
                return;
            }
            let entry = entriesById.get(layerId);
            if (!entry) {
                entry = {
                    id: layerId,
                    label: node.userData.groundDebugLayerLabel || getGroundDebugLayerLabel(layerId),
                    nodes: [],
                };
                entriesById.set(layerId, entry);
            }
            entry.nodes.push(node);
        });

        return Array.from(entriesById.values()).sort((left, right) => {
            const orderDelta = getGroundDebugLayerOrder(left.id) - getGroundDebugLayerOrder(right.id);
            if (orderDelta !== 0) {
                return orderDelta;
            }
            return left.label.localeCompare(right.label);
        });
    }

    function refresh() {
        const nextEntries = collectEntries();
        nextEntries.forEach((entry) => {
            const explicit = state.explicitVisibility.get(entry.id);
            const visible = explicit ?? entry.nodes.some((node) => node.visible !== false);
            entry.visible = Boolean(visible);
            applyVisibility(entry.nodes, entry.visible);
        });
        state.entries = nextEntries;
        render();
    }

    function render() {
        if (!bodyEl) {
            return;
        }
        bodyEl.replaceChildren();
        if (state.entries.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'groundLayerDebugEmpty';
            emptyEl.textContent = 'No tagged ground layers found yet.';
            bodyEl.appendChild(emptyEl);
            return;
        }

        state.entries.forEach((entry) => {
            const rowEl = document.createElement('label');
            rowEl.className = 'groundLayerDebugRow';

            const checkboxEl = document.createElement('input');
            checkboxEl.className = 'groundLayerDebugCheckbox';
            checkboxEl.type = 'checkbox';
            checkboxEl.checked = entry.visible;
            checkboxEl.addEventListener('change', () => {
                setVisible(entry.id, checkboxEl.checked);
            });

            const labelEl = document.createElement('span');
            labelEl.className = 'groundLayerDebugRowLabel';
            labelEl.textContent = entry.label;

            const countEl = document.createElement('span');
            countEl.className = 'groundLayerDebugRowCount';
            countEl.textContent = `${entry.nodes.length}`;

            rowEl.append(checkboxEl, labelEl, countEl);
            bodyEl.appendChild(rowEl);
        });
    }

    function setVisible(layerId = '', nextVisible = true) {
        const resolvedId = String(layerId || '');
        const visible = Boolean(nextVisible);
        state.explicitVisibility.set(resolvedId, visible);
        const entry = state.entries.find((item) => item.id === resolvedId);
        if (entry) {
            entry.visible = visible;
            applyVisibility(entry.nodes, visible);
            render();
            return true;
        }
        refresh();
        return state.entries.some((item) => item.id === resolvedId);
    }

    function setAllVisible(nextVisible = true) {
        const visible = Boolean(nextVisible);
        state.entries.forEach((entry) => {
            state.explicitVisibility.set(entry.id, visible);
            entry.visible = visible;
            applyVisibility(entry.nodes, visible);
        });
        render();
    }

    function list() {
        return state.entries.map((entry) => ({
            id: entry.id,
            label: entry.label,
            visible: entry.visible,
            meshCount: entry.nodes.length,
        }));
    }

    function syncRootVisibility() {
        rootEl.hidden = !state.editModeActive;
    }

    function setOpen(nextOpen) {
        state.open = Boolean(nextOpen);
        rootEl.dataset.open = state.open ? 'true' : 'false';
        collapseBtn.textContent = state.open ? '-' : '+';
        collapseBtn.setAttribute(
            'aria-label',
            state.open ? 'Collapse ground layer debug panel' : 'Expand ground layer debug panel'
        );
    }

    function setEditModeActive(nextActive) {
        state.editModeActive = Boolean(nextActive);
        syncRootVisibility();
        if (state.editModeActive) {
            refresh();
        }
    }
}

function applyVisibility(nodes = [], visible = true) {
    for (let index = 0; index < nodes.length; index += 1) {
        if (nodes[index]) {
            nodes[index].visible = visible;
        }
    }
}

function createNoopController() {
    return {
        refresh() {},
        list() {
            return [];
        },
        setVisible() {
            return false;
        },
        setAllVisible() {},
        setOpen() {},
        setEditModeActive() {},
        dispose() {},
    };
}
