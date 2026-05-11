import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const MAX_POPUPS = 40;
const MAX_QUEUED_SPAWNS = MAX_POPUPS * 4;
const MAX_SPAWNS_PER_FRAME = 3;
const POPUP_DURATION_SEC = 1.15;
const HERO_BANNER_DURATION_SEC = 1.2;
const POPUP_WORLD_HEIGHT = 2.05;
const POPUP_LANES = [-1, 0, 1];
const CHAIN_WINDOW_MS = 1800;
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
    const collectorChains = new Map();
    const reusableElements = [];
    const queuedSpawns = [];
    const heroBanner = createHeroBannerElement();
    const heroState = {
        active: false,
        ageSec: 0,
        durationSec: HERO_BANNER_DURATION_SEC,
        intensity: 1,
        variant: 'pickup',
    };
    let queuedSpawnReadIndex = 0;
    let prewarmed = false;
    let frameTick = 0;

    initializePopupPool();
    initializeHeroBanner();

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
            const sourceLabel = normalizeSourceLabel(payload?.sourceLabel);
            const variant = resolvePopupVariant(sourceLabel);
            const chain = recordCollectorChain(collectorId, pointsAwarded);
            const intensity = resolvePopupIntensity(pointsAwarded, variant, chain.count);
            const showHeroBanner = payload?.showHeroBanner !== false;
            const showWorldPopup = payload?.showWorldPopup === true;

            const entry = {
                collectorId,
                pointsAwarded,
                sourceLabel,
                variant,
                comboCount: chain.count,
                streakPoints: chain.totalPoints,
                intensity,
                durationSec: clampNumber(
                    payload?.durationSec,
                    0.55,
                    2.75,
                    resolvePopupDuration(pointsAwarded, variant, chain.count)
                ),
                heroDurationSec: resolveHeroDuration(pointsAwarded, variant, chain.count),
                baseHeight: clampNumber(
                    payload?.baseHeight,
                    1,
                    4.5,
                    variant === 'impact' ? POPUP_WORLD_HEIGHT + 0.16 : POPUP_WORLD_HEIGHT
                ),
                resolveWorldPosition:
                    typeof payload?.resolveWorldPosition === 'function'
                        ? payload.resolveWorldPosition
                        : null,
                worldPosition: cloneWorldPosition(payload?.worldPosition),
            };

            if (showHeroBanner) {
                activateHeroBanner(entry);
            }
            if (!showWorldPopup) {
                return showHeroBanner;
            }

            const activeQueuedCount = queuedSpawns.length - queuedSpawnReadIndex;
            if (activeQueuedCount >= MAX_QUEUED_SPAWNS) {
                queuedSpawnReadIndex += 1;
            }
            queuedSpawns.push({
                ...entry,
                dueFrame: frameTick + 1,
                showHeroBanner,
                showWorldPopup,
            });
            compactQueuedSpawns();
            return true;
        },
        update(camera, deltaTime = 1 / 60) {
            frameTick += 1;
            processQueuedSpawns();

            const dt = clampNumber(deltaTime, 0, 0.08, 1 / 60);
            updateHeroBanner(dt);

            if (!camera || popups.length === 0) {
                return;
            }

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
                const intro = easeOutBack(Math.min(1, progress / 0.24));
                const fadeStart = popup.variant === 'impact' ? 0.82 : 0.76;
                const fade =
                    progress < fadeStart
                        ? 1
                        : 1 -
                          easeInCubic(
                              clampNumber(
                                  (progress - fadeStart) / Math.max(0.001, 1 - fadeStart),
                                  0,
                                  1,
                                  0
                              )
                          );
                const lateralDrift =
                    popup.lane * (18 + popup.intensity * 8) +
                    popup.spinDirection * progressEase * (16 + popup.intensity * 8);
                const x = (popupProjectVector.x * 0.5 + 0.5) * window.innerWidth + lateralDrift;
                const y = (-popupProjectVector.y * 0.5 + 0.5) * window.innerHeight;
                const risePx = (86 + popup.intensity * 34) * progressEase;
                const scale = 0.76 + intro * (0.38 + popup.intensity * 0.14) - progress * 0.12;
                const rotationDeg =
                    popup.spinDirection *
                    Math.sin(progress * Math.PI) *
                    (4.5 + popup.intensity * 3.4) *
                    Math.pow(1 - progress, 1.15);

                popup.el.style.opacity = `${fade}`;
                popup.el.style.transform = `translate3d(${x}px, ${y - risePx}px, 0) scale(${scale}) rotate(${rotationDeg}deg)`;
            }
        },
        clear() {
            while (popups.length > 0) {
                removePopup(popups[popups.length - 1], popups.length - 1);
            }
            laneByCollector.clear();
            collectorChains.clear();
            queuedSpawns.length = 0;
            queuedSpawnReadIndex = 0;
            frameTick = 0;
            hideHeroBanner();
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

    function initializeHeroBanner() {
        layerEl.append(heroBanner.root);
        hideHeroBanner();
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
            applyPopupEntryToElement(probe, {
                pointsAwarded: 300,
                sourceLabel: 'MINE KILL',
                variant: 'impact',
                comboCount: 3,
                intensity: 1.36,
            });
            probe.root.hidden = false;
            void probe.root.offsetHeight;
            hidePopupElement(probe);
        }
        activateHeroBanner({
            pointsAwarded: 300,
            sourceLabel: 'MINE KILL',
            variant: 'impact',
            comboCount: 3,
            streakPoints: 700,
            intensity: 1.36,
            heroDurationSec: HERO_BANNER_DURATION_SEC,
        });
        void heroBanner.root.offsetHeight;
        hideHeroBanner();
        prewarmed = true;
        return true;
    }

    function processQueuedSpawns() {
        if (queuedSpawns.length - queuedSpawnReadIndex <= 0) {
            return;
        }
        let spawned = 0;
        while (spawned < MAX_SPAWNS_PER_FRAME && queuedSpawnReadIndex < queuedSpawns.length) {
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

        applyPopupEntryToElement(element, entry);
        element.root.hidden = false;
        element.root.style.opacity = '0';
        element.root.style.transform = 'translate3d(-10000px, -10000px, 0) scale(1)';

        const popup = {
            el: element.root,
            element,
            ageSec: 0,
            durationSec: clampNumber(entry.durationSec, 0.55, 2.75, POPUP_DURATION_SEC),
            lane: nextCollectorLane(entry.collectorId || 'collector'),
            baseHeight: clampNumber(entry.baseHeight, 1, 4.5, POPUP_WORLD_HEIGHT),
            intensity: clampNumber(entry.intensity, 0.9, 1.75, 1),
            variant: entry.variant === 'impact' ? 'impact' : 'pickup',
            spinDirection: Math.random() < 0.5 ? -1 : 1,
            resolveWorldPosition:
                typeof entry.resolveWorldPosition === 'function'
                    ? entry.resolveWorldPosition
                    : null,
            worldPosition: cloneWorldPosition(entry.worldPosition),
        };
        popups.push(popup);
        if (popups.length > MAX_POPUPS) {
            removePopup(popups[0], 0);
        }
    }

    function applyPopupEntryToElement(element, entry) {
        element.root.className = 'scorePopup';
        element.root.classList.add(
            entry.variant === 'impact' ? 'scorePopupImpact' : 'scorePopupPickup'
        );
        element.root.style.setProperty(
            '--score-popup-intensity',
            `${clampNumber(entry.intensity, 0.9, 1.75, 1)}`
        );

        element.primaryEl.textContent = `+${entry.pointsAwarded}`;

        if (entry.sourceLabel) {
            element.metaEl.textContent = entry.sourceLabel;
            element.metaEl.hidden = false;
        } else {
            element.metaEl.textContent = '';
            element.metaEl.hidden = true;
        }

        if ((Number(entry.comboCount) || 0) > 1) {
            element.chainEl.textContent = `CHAIN x${Math.max(2, Math.round(entry.comboCount))}`;
            element.chainEl.hidden = false;
        } else {
            element.chainEl.textContent = '';
            element.chainEl.hidden = true;
        }

        element.metaRowEl.hidden = element.metaEl.hidden && element.chainEl.hidden;
    }

    function createPopupElement() {
        const root = document.createElement('div');
        root.className = 'scorePopup';
        root.style.opacity = '0';
        root.style.transform = 'translate3d(-10000px, -10000px, 0) scale(1)';
        root.style.pointerEvents = 'none';

        const flareEl = document.createElement('div');
        flareEl.className = 'scorePopupFlare';
        root.append(flareEl);

        const ringEl = document.createElement('div');
        ringEl.className = 'scorePopupRing';
        root.append(ringEl);

        const plateEl = document.createElement('div');
        plateEl.className = 'scorePopupPlate';
        root.append(plateEl);

        const primaryEl = document.createElement('div');
        primaryEl.className = 'scorePopupPrimary';
        plateEl.append(primaryEl);

        const metaRowEl = document.createElement('div');
        metaRowEl.className = 'scorePopupMetaRow';
        plateEl.append(metaRowEl);

        const metaEl = document.createElement('div');
        metaEl.className = 'scorePopupMeta';
        metaRowEl.append(metaEl);

        const chainEl = document.createElement('div');
        chainEl.className = 'scorePopupChain';
        metaRowEl.append(chainEl);

        return {
            root,
            flareEl,
            ringEl,
            plateEl,
            primaryEl,
            metaRowEl,
            metaEl,
            chainEl,
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
        element.root.style.removeProperty('--score-popup-intensity');
        element.primaryEl.textContent = '';
        element.metaEl.textContent = '';
        element.metaEl.hidden = true;
        element.chainEl.textContent = '';
        element.chainEl.hidden = true;
        element.metaRowEl.hidden = true;
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

    function recordCollectorChain(collectorId, pointsAwarded) {
        const nowMs = performance.now();
        const current = collectorChains.get(collectorId);
        if (current && nowMs - current.lastAwardAtMs <= CHAIN_WINDOW_MS) {
            current.lastAwardAtMs = nowMs;
            current.count += 1;
            current.totalPoints += pointsAwarded;
            return current;
        }

        const next = {
            count: 1,
            totalPoints: pointsAwarded,
            lastAwardAtMs: nowMs,
        };
        collectorChains.set(collectorId, next);
        return next;
    }

    function activateHeroBanner(entry) {
        const variant = entry?.variant === 'impact' ? 'impact' : 'pickup';
        const intensity = clampNumber(entry?.intensity, 0.9, 1.75, 1);
        const comboCount = Math.max(1, Math.round(Number(entry?.comboCount) || 1));
        const streakPoints = Math.max(
            Math.round(Number(entry?.pointsAwarded) || 0),
            Math.round(Number(entry?.streakPoints) || 0)
        );

        heroBanner.root.className = 'scoreHeroBanner';
        heroBanner.root.classList.add(
            variant === 'impact' ? 'scoreHeroBannerImpact' : 'scoreHeroBannerPickup'
        );
        heroBanner.root.style.setProperty('--score-hero-intensity', `${intensity}`);
        heroBanner.labelEl.textContent = resolveHeroLabel(entry?.sourceLabel, variant);
        heroBanner.valueEl.textContent = `+${Math.max(0, Math.round(Number(entry?.pointsAwarded) || 0))}`;
        heroBanner.sublineEl.textContent = resolveHeroSubline(variant, comboCount, streakPoints);

        if (comboCount > 1) {
            heroBanner.chipEl.textContent = `CHAIN x${comboCount}`;
            heroBanner.chipEl.hidden = false;
        } else {
            heroBanner.chipEl.textContent = '';
            heroBanner.chipEl.hidden = true;
        }

        heroBanner.root.hidden = false;

        heroState.active = true;
        heroState.ageSec = 0;
        heroState.durationSec = clampNumber(
            entry?.heroDurationSec,
            0.9,
            1.8,
            HERO_BANNER_DURATION_SEC
        );
        heroState.intensity = intensity;
        heroState.variant = variant;

        updateHeroBanner(0);
    }

    function updateHeroBanner(deltaTime) {
        if (!heroState.active) {
            return;
        }

        heroState.ageSec += clampNumber(deltaTime, 0, 0.08, 0);
        const progress = heroState.ageSec / Math.max(0.001, heroState.durationSec);
        if (progress >= 1) {
            hideHeroBanner();
            return;
        }

        const intro = easeOutBack(Math.min(1, progress / 0.24));
        const outro = clampNumber((progress - 0.72) / 0.28, 0, 1, 0);
        const intensityBoost = heroState.intensity - 1;
        const liftPx =
            34 -
            intro * (34 + intensityBoost * 8) -
            easeInCubic(outro) * (14 + intensityBoost * 12);
        const scale =
            0.84 +
            intro * (0.18 + intensityBoost * 0.08) -
            easeInCubic(outro) * (0.08 + intensityBoost * 0.03);
        const opacity = progress < 0.72 ? 1 : 1 - easeInCubic(outro);
        const glowScale = 0.74 + intro * (0.54 + intensityBoost * 0.16);
        const burstScale = 0.86 + intro * (0.38 + intensityBoost * 0.18);

        heroBanner.root.style.opacity = `${opacity}`;
        heroBanner.root.style.transform = `translate3d(-50%, calc(-50% + ${liftPx}px), 0) scale(${scale})`;
        heroBanner.glowEl.style.opacity = `${0.6 * opacity}`;
        heroBanner.glowEl.style.transform = `translate(-50%, -50%) scale(${glowScale})`;
        heroBanner.burstEl.style.opacity = `${0.82 * opacity}`;
        heroBanner.burstEl.style.transform = `translate(-50%, -50%) scale(${burstScale})`;
    }

    function hideHeroBanner() {
        heroState.active = false;
        heroState.ageSec = 0;
        heroState.durationSec = HERO_BANNER_DURATION_SEC;
        heroState.intensity = 1;
        heroState.variant = 'pickup';

        heroBanner.root.hidden = true;
        heroBanner.root.className = 'scoreHeroBanner';
        heroBanner.root.style.opacity = '0';
        heroBanner.root.style.transform = 'translate3d(-50%, calc(-50% + 36px), 0) scale(0.82)';
        heroBanner.root.style.removeProperty('--score-hero-intensity');
        heroBanner.labelEl.textContent = '';
        heroBanner.valueEl.textContent = '';
        heroBanner.sublineEl.textContent = '';
        heroBanner.chipEl.textContent = '';
        heroBanner.chipEl.hidden = true;
        heroBanner.glowEl.style.opacity = '0';
        heroBanner.glowEl.style.transform = 'translate(-50%, -50%) scale(0.7)';
        heroBanner.burstEl.style.opacity = '0';
        heroBanner.burstEl.style.transform = 'translate(-50%, -50%) scale(0.82)';
    }
}

function createHeroBannerElement() {
    const root = document.createElement('div');
    root.className = 'scoreHeroBanner';
    root.hidden = true;

    const glowEl = document.createElement('div');
    glowEl.className = 'scoreHeroGlow';
    root.append(glowEl);

    const burstEl = document.createElement('div');
    burstEl.className = 'scoreHeroBurst';
    root.append(burstEl);

    const plateEl = document.createElement('div');
    plateEl.className = 'scoreHeroPlate';
    root.append(plateEl);

    const labelRowEl = document.createElement('div');
    labelRowEl.className = 'scoreHeroLabelRow';
    plateEl.append(labelRowEl);

    const labelEl = document.createElement('div');
    labelEl.className = 'scoreHeroLabel';
    labelRowEl.append(labelEl);

    const chipEl = document.createElement('div');
    chipEl.className = 'scoreHeroChip';
    labelRowEl.append(chipEl);

    const valueEl = document.createElement('div');
    valueEl.className = 'scoreHeroValue';
    plateEl.append(valueEl);

    const sublineEl = document.createElement('div');
    sublineEl.className = 'scoreHeroSubline';
    plateEl.append(sublineEl);

    return {
        root,
        glowEl,
        burstEl,
        plateEl,
        labelEl,
        chipEl,
        valueEl,
        sublineEl,
    };
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

function resolvePopupVariant(sourceLabel = '') {
    const normalized = typeof sourceLabel === 'string' ? sourceLabel.trim().toUpperCase() : '';
    if (!normalized) {
        return 'pickup';
    }
    if (normalized.includes('MINE') || normalized.includes('KO') || normalized.includes('KILL')) {
        return 'impact';
    }
    return 'pickup';
}

function resolvePopupIntensity(pointsAwarded = 0, variant = 'pickup', comboCount = 1) {
    const points = Math.max(0, Math.round(Number(pointsAwarded) || 0));
    const comboBoost = Math.min(0.3, Math.max(0, comboCount - 1) * 0.08);
    const variantBoost = variant === 'impact' ? 0.2 : 0;
    const pointsBoost = Math.min(0.26, points / 850);
    return clampNumber(1 + comboBoost + variantBoost + pointsBoost, 0.9, 1.75, 1);
}

function resolvePopupDuration(pointsAwarded = 0, variant = 'pickup', comboCount = 1) {
    const base = variant === 'impact' ? 1.34 : 1.12;
    const comboBoost = Math.min(0.22, Math.max(0, comboCount - 1) * 0.05);
    const pointsBoost = Math.min(0.12, Math.max(0, pointsAwarded - 80) / 1200);
    return base + comboBoost + pointsBoost;
}

function resolveHeroDuration(pointsAwarded = 0, variant = 'pickup', comboCount = 1) {
    const base = variant === 'impact' ? 1.28 : 1.14;
    const comboBoost = Math.min(0.26, Math.max(0, comboCount - 1) * 0.06);
    const pointsBoost = Math.min(0.12, Math.max(0, pointsAwarded - 80) / 1300);
    return base + comboBoost + pointsBoost;
}

function resolveHeroLabel(sourceLabel = '', variant = 'pickup') {
    const normalized = normalizeSourceLabel(sourceLabel);
    if (normalized) {
        return normalized;
    }
    return variant === 'impact' ? 'TARGET DOWN' : 'SCORE';
}

function resolveHeroSubline(variant = 'pickup', comboCount = 1, streakPoints = 0) {
    if (comboCount > 1) {
        return `RUN TOTAL +${Math.max(0, Math.round(Number(streakPoints) || 0))}`;
    }
    return variant === 'impact' ? 'TARGET ELIMINATED' : 'PICKUP SECURED';
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

function easeInCubic(value) {
    const t = clampNumber(value, 0, 1, 0);
    return t * t * t;
}

function easeOutBack(value) {
    const t = clampNumber(value, 0, 1, 0);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const shifted = t - 1;
    return 1 + c3 * shifted * shifted * shifted + c1 * shifted * shifted;
}
