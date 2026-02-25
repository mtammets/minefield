import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const MAX_POPUPS = 40;
const POPUP_DURATION_SEC = 1.15;
const POPUP_WORLD_HEIGHT = 2.05;
const POPUP_LANES = [-1, 0, 1];
const popupProjectVector = new THREE.Vector3();

export function createScorePopupController() {
    const layerEl = document.getElementById('scorePopupLayer');
    if (!layerEl) {
        return {
            spawn() {
                return false;
            },
            update() {},
            clear() {},
        };
    }

    const popups = [];
    const laneByCollector = new Map();

    return {
        spawn(payload = {}) {
            const pointsAwarded = Math.max(0, Math.round(Number(payload?.pointsAwarded) || 0));
            if (pointsAwarded <= 0) {
                return false;
            }

            const collectorId =
                typeof payload?.collectorId === 'string' && payload.collectorId.trim()
                    ? payload.collectorId.trim()
                    : 'collector';
            const lane = nextCollectorLane(collectorId);
            const element = document.createElement('div');
            element.className = 'scorePopup';

            const comboCount = Math.max(0, Math.round(Number(payload?.comboCount) || 0));
            const comboMultiplier = clampNumber(payload?.comboMultiplier, 1, 9, 1);
            const riskBonus = clampNumber(payload?.riskBonus, 0, 1, 0);
            const endgameBonus = clampNumber(payload?.endgameBonus, 0, 1, 0);
            const sourceLabel = normalizeSourceLabel(payload?.sourceLabel);

            if (comboCount > 1) {
                element.classList.add('scorePopupCombo');
            }
            if (riskBonus > 0.08) {
                element.classList.add('scorePopupRisk');
            }
            if (endgameBonus > 0.05) {
                element.classList.add('scorePopupEndgame');
            }

            const primaryEl = document.createElement('div');
            primaryEl.className = 'scorePopupPrimary';
            primaryEl.textContent = `+${pointsAwarded}`;
            element.append(primaryEl);

            const metaParts = [];
            if (comboCount > 1) {
                metaParts.push(`COMBO x${comboMultiplier.toFixed(2)}`);
            }
            if (riskBonus > 0.08) {
                metaParts.push(`RISK +${Math.round(riskBonus * 100)}%`);
            }
            if (endgameBonus > 0.05) {
                metaParts.push(`END +${Math.round(endgameBonus * 100)}%`);
            }
            if (sourceLabel) {
                metaParts.push(sourceLabel);
            }

            if (metaParts.length > 0) {
                const metaEl = document.createElement('div');
                metaEl.className = 'scorePopupMeta';
                metaEl.textContent = metaParts.join(' | ');
                element.append(metaEl);
            }

            layerEl.append(element);
            const popup = {
                el: element,
                ageSec: 0,
                durationSec: clampNumber(payload?.durationSec, 0.4, 2.4, POPUP_DURATION_SEC),
                lane,
                baseHeight: clampNumber(payload?.baseHeight, 1, 4.5, POPUP_WORLD_HEIGHT),
                resolveWorldPosition:
                    typeof payload?.resolveWorldPosition === 'function'
                        ? payload.resolveWorldPosition
                        : null,
                worldPosition: cloneWorldPosition(payload?.worldPosition),
            };
            popups.push(popup);
            if (popups.length > MAX_POPUPS) {
                removePopup(popups[0], 0);
            }
            return true;
        },
        update(camera, deltaTime = 1 / 60) {
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
        },
    };

    function nextCollectorLane(collectorId) {
        const current = laneByCollector.get(collectorId) || 0;
        const next = (current + 1) % POPUP_LANES.length;
        laneByCollector.set(collectorId, next);
        return POPUP_LANES[next];
    }

    function removePopup(popup, index) {
        if (popup?.el?.parentNode) {
            popup.el.parentNode.removeChild(popup.el);
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
