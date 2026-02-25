import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const MAX_POPUPS = 40;
const MAX_QUEUED_SPAWNS = MAX_POPUPS * 4;
const MAX_SPAWNS_PER_FRAME = 3;
const POPUP_DURATION_SEC = 1.15;
const POPUP_WORLD_HEIGHT = 2.05;
const POPUP_LANES = [-1, 0, 1];
const popupProjectVector = new THREE.Vector3();

export function createScorePopupController() {
    const layerEl = document.getElementById('scorePopupLayer');
    if (!layerEl) {
        return {
            prewarm() {
                return false;
            },
            spawn() {
                return false;
            },
            update() {},
            clear() {},
        };
    }

    const popups = [];
    const laneByCollector = new Map();
    const reusableElements = [];
    const queuedSpawns = [];
    let queuedSpawnReadIndex = 0;
    let prewarmed = false;
    let frameTick = 0;

    initializePopupPool();

    return {
        prewarm() {
            return prewarmPopupLayer();
        },
        spawn(payload = {}) {
            prewarmPopupLayer();
            const pointsAwarded = Math.max(0, Math.round(Number(payload?.pointsAwarded) || 0));
            if (pointsAwarded <= 0) {
                return false;
            }

            const collectorId =
                typeof payload?.collectorId === 'string' && payload.collectorId.trim()
                    ? payload.collectorId.trim()
                    : 'collector';
            const comboCount = Math.max(0, Math.round(Number(payload?.comboCount) || 0));
            const comboMultiplier = clampNumber(payload?.comboMultiplier, 1, 9, 1);
            const riskBonus = clampNumber(payload?.riskBonus, 0, 1, 0);
            const endgameBonus = clampNumber(payload?.endgameBonus, 0, 1, 0);
            const sourceLabel = normalizeSourceLabel(payload?.sourceLabel);

            const activeQueuedCount = queuedSpawns.length - queuedSpawnReadIndex;
            if (activeQueuedCount >= MAX_QUEUED_SPAWNS) {
                queuedSpawnReadIndex += 1;
            }
            queuedSpawns.push({
                dueFrame: frameTick + 1,
                collectorId,
                pointsAwarded,
                comboCount,
                comboMultiplier,
                riskBonus,
                endgameBonus,
                sourceLabel,
                durationSec: clampNumber(payload?.durationSec, 0.4, 2.4, POPUP_DURATION_SEC),
                baseHeight: clampNumber(payload?.baseHeight, 1, 4.5, POPUP_WORLD_HEIGHT),
                resolveWorldPosition:
                    typeof payload?.resolveWorldPosition === 'function'
                        ? payload.resolveWorldPosition
                        : null,
                worldPosition: cloneWorldPosition(payload?.worldPosition),
            });
            compactQueuedSpawns();
            return true;
        },
        update(camera, deltaTime = 1 / 60) {
            frameTick += 1;
            processQueuedSpawns();
            if (!camera || popups.length === 0) {
                return;
            }
            const dt = clampNumber(deltaTime, 0, 0.08, 1 / 60);
            for (let i = popups.length - 1; i >= 0; i -= 1) {
                const popup = popups[i];
                popup.ageSec += dt;
                const progress = popup.ageSec / Math.max(0.001, popup.durationSec);
                if (progress >= 1) {
                    removePopup(popup, i);
                    continue;
                }

                const worldPos = resolvePopupWorldPosition(popup);
                if (!worldPos) {
                    popup.el.style.opacity = '0';
                    continue;
                }

                popupProjectVector.set(worldPos.x, worldPos.y + popup.baseHeight, worldPos.z);
                popupProjectVector.project(camera);
                if (popupProjectVector.z < -1 || popupProjectVector.z > 1) {
                    popup.el.style.opacity = '0';
                    continue;
                }

                const progressEase = easeOutCubic(progress);
                const x = (popupProjectVector.x * 0.5 + 0.5) * window.innerWidth + popup.lane * 18;
                const y = (-popupProjectVector.y * 0.5 + 0.5) * window.innerHeight;
                const risePx = 74 * progressEase;
                const scale = 1.08 - progress * 0.14;
                const fade =
                    progress < 0.72
                        ? 1
                        : clampNumber((1 - progress) / Math.max(0.001, 1 - 0.72), 0, 1, 0);

                popup.el.style.opacity = `${fade}`;
                popup.el.style.transform = `translate3d(${x}px, ${y - risePx}px, 0) scale(${scale})`;
            }
        },
        clear() {
            while (popups.length > 0) {
                removePopup(popups[popups.length - 1], popups.length - 1);
            }
            laneByCollector.clear();
            queuedSpawns.length = 0;
            queuedSpawnReadIndex = 0;
            frameTick = 0;
        },
    };

    function initializePopupPool() {
        if (!layerEl) {
            return;
        }
        for (let i = reusableElements.length; i < MAX_POPUPS; i += 1) {
            const element = createPopupElement();
            hidePopupElement(element);
            layerEl.append(element.root);
            reusableElements.push(element);
        }
    }

    function prewarmPopupLayer() {
        if (prewarmed) {
            return true;
        }
        if (!layerEl) {
            return false;
        }
        initializePopupPool();
        if (reusableElements.length > 0) {
            const probe = reusableElements[reusableElements.length - 1];
            probe.root.className = 'scorePopup scorePopupCombo scorePopupRisk scorePopupEndgame';
            probe.primaryEl.textContent = '+0';
            probe.metaEl.textContent = 'COMBO x1.00 | RISK +0% | END +0%';
            probe.metaEl.hidden = false;
            probe.root.hidden = false;
            // Force style/layout resolution once so the first real popup does less work.
            void probe.root.offsetHeight;
            hidePopupElement(probe);
        }
        prewarmed = true;
        return true;
    }

    function processQueuedSpawns() {
        if (queuedSpawns.length - queuedSpawnReadIndex <= 0) {
            return;
        }
        let spawned = 0;
        while (
            spawned < MAX_SPAWNS_PER_FRAME &&
            queuedSpawnReadIndex < queuedSpawns.length
        ) {
            const entry = queuedSpawns[queuedSpawnReadIndex];
            if (!entry) {
                queuedSpawnReadIndex += 1;
                continue;
            }
            if ((Number(entry.dueFrame) || 0) > frameTick) {
                break;
            }
            queuedSpawnReadIndex += 1;
            spawnPopupNow(entry);
            spawned += 1;
        }
        compactQueuedSpawns();
    }

    function compactQueuedSpawns() {
        if (queuedSpawnReadIndex === 0) {
            return;
        }
        if (queuedSpawnReadIndex >= queuedSpawns.length) {
            queuedSpawns.length = 0;
            queuedSpawnReadIndex = 0;
            return;
        }
        if (queuedSpawnReadIndex >= 16) {
            queuedSpawns.splice(0, queuedSpawnReadIndex);
            queuedSpawnReadIndex = 0;
        }
    }

    function spawnPopupNow(entry) {
        const element = acquirePopupElement();
        if (!element) {
            return;
        }

        element.root.className = 'scorePopup';
        if (entry.comboCount > 1) {
            element.root.classList.add('scorePopupCombo');
        }
        if (entry.riskBonus > 0.08) {
            element.root.classList.add('scorePopupRisk');
        }
        if (entry.endgameBonus > 0.05) {
            element.root.classList.add('scorePopupEndgame');
        }
        element.primaryEl.textContent = `+${entry.pointsAwarded}`;

        const metaParts = [];
        if (entry.comboCount > 1) {
            metaParts.push(`COMBO x${entry.comboMultiplier.toFixed(2)}`);
        }
        if (entry.riskBonus > 0.08) {
            metaParts.push(`RISK +${Math.round(entry.riskBonus * 100)}%`);
        }
        if (entry.endgameBonus > 0.05) {
            metaParts.push(`END +${Math.round(entry.endgameBonus * 100)}%`);
        }
        if (entry.sourceLabel) {
            metaParts.push(entry.sourceLabel);
        }
        if (metaParts.length > 0) {
            element.metaEl.textContent = metaParts.join(' | ');
            element.metaEl.hidden = false;
        } else {
            element.metaEl.textContent = '';
            element.metaEl.hidden = true;
        }

        element.root.hidden = false;
        element.root.style.opacity = '0';
        element.root.style.transform = 'translate3d(-10000px, -10000px, 0) scale(1)';

        const popup = {
            el: element.root,
            element,
            ageSec: 0,
            durationSec: clampNumber(entry.durationSec, 0.4, 2.4, POPUP_DURATION_SEC),
            lane: nextCollectorLane(entry.collectorId || 'collector'),
            baseHeight: clampNumber(entry.baseHeight, 1, 4.5, POPUP_WORLD_HEIGHT),
            resolveWorldPosition:
                typeof entry.resolveWorldPosition === 'function' ? entry.resolveWorldPosition : null,
            worldPosition: cloneWorldPosition(entry.worldPosition),
        };
        popups.push(popup);
        if (popups.length > MAX_POPUPS) {
            removePopup(popups[0], 0);
        }
    }

    function createPopupElement() {
        const root = document.createElement('div');
        root.className = 'scorePopup';
        root.style.opacity = '0';
        root.style.transform = 'translate3d(-10000px, -10000px, 0) scale(1)';
        root.style.pointerEvents = 'none';

        const primaryEl = document.createElement('div');
        primaryEl.className = 'scorePopupPrimary';
        root.append(primaryEl);

        const metaEl = document.createElement('div');
        metaEl.className = 'scorePopupMeta';
        root.append(metaEl);

        return {
            root,
            primaryEl,
            metaEl,
        };
    }

    function hidePopupElement(element) {
        if (!element?.root) {
            return;
        }
        element.root.hidden = true;
        element.root.className = 'scorePopup';
        element.root.style.opacity = '0';
        element.root.style.transform = 'translate3d(-10000px, -10000px, 0) scale(1)';
        element.primaryEl.textContent = '';
        element.metaEl.textContent = '';
        element.metaEl.hidden = true;
    }

    function acquirePopupElement() {
        if (reusableElements.length > 0) {
            return reusableElements.pop();
        }
        if (popups.length > 0) {
            removePopup(popups[0], 0);
        }
        return reusableElements.length > 0 ? reusableElements.pop() : null;
    }

    function nextCollectorLane(collectorId) {
        const current = laneByCollector.get(collectorId) || 0;
        const next = (current + 1) % POPUP_LANES.length;
        laneByCollector.set(collectorId, next);
        return POPUP_LANES[next];
    }

    function removePopup(popup, index) {
        if (popup?.element) {
            hidePopupElement(popup.element);
            reusableElements.push(popup.element);
        }
        if (index < 0 || index >= popups.length) {
            return;
        }
        const lastIndex = popups.length - 1;
        if (index !== lastIndex) {
            popups[index] = popups[lastIndex];
        }
        popups.pop();
    }
}

function resolvePopupWorldPosition(popup) {
    if (!popup || typeof popup !== 'object') {
        return null;
    }
    if (typeof popup.resolveWorldPosition === 'function') {
        const value = popup.resolveWorldPosition();
        if (isWorldPositionLike(value)) {
            return value;
        }
    }
    if (isWorldPositionLike(popup.worldPosition)) {
        return popup.worldPosition;
    }
    return null;
}

function cloneWorldPosition(value) {
    if (!isWorldPositionLike(value)) {
        return null;
    }
    return {
        x: Number(value.x) || 0,
        y: Number(value.y) || 0,
        z: Number(value.z) || 0,
    };
}

function isWorldPositionLike(value) {
    return (
        value &&
        typeof value === 'object' &&
        Number.isFinite(value.x) &&
        Number.isFinite(value.y) &&
        Number.isFinite(value.z)
    );
}

function normalizeSourceLabel(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toUpperCase();
    return normalized.slice(0, 14);
}

function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
}

function easeOutCubic(value) {
    const t = clampNumber(value, 0, 1, 0);
    const oneMinus = 1 - t;
    return 1 - oneMinus * oneMinus * oneMinus;
}
