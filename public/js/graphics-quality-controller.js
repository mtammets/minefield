const GRAPHICS_QUALITY_MODE_ORDER = ['auto', 'quality', 'balanced', 'performance'];
const AUTO_BASE_PROFILE_KEY = 'balanced';
const AUTO_MIN_SCALE = 0.72;
const AUTO_MAX_SCALE = 1.22;
const AUTO_DEGRADE_STEP = 0.06;
const AUTO_UPGRADE_STEP = 0.035;
const AUTO_DEGRADE_THRESHOLD_MS = 18.8;
const AUTO_UPGRADE_THRESHOLD_MS = 15.4;
const AUTO_DEGRADE_HOLD_SEC = 0.36;
const AUTO_UPGRADE_HOLD_SEC = 1.18;
const FRAME_TIME_SMOOTHING = 0.12;

const QUALITY_PROFILES = {
    quality: {
        label: 'Quality',
        pixelRatioCap: 1,
        mapProfile: {
            minimapMaxDpr: 2,
            worldMapMaxDpr: 2,
            minimapDrawIntervalSec: 1 / 30,
            worldMapDrawIntervalSec: 1 / 24,
            labelUpdateIntervalSec: 1 / 10,
            entitySyncIntervalSec: 1 / 28,
            routeRebuildIntervalSec: 0.16,
            routeRebuildDistanceSq: 2.2 * 2.2,
        },
        skidProfile: {
            maxSmokeParticles: 220,
            smokeSpawnRateMultiplier: 0.86,
            maxEmissionPerFrame: 10,
        },
        modeDescription: 'Highest detail, strongest GPU load.',
    },
    balanced: {
        label: 'Balanced',
        pixelRatioCap: 0.82,
        mapProfile: {
            minimapMaxDpr: 1.6,
            worldMapMaxDpr: 1.6,
            minimapDrawIntervalSec: 1 / 24,
            worldMapDrawIntervalSec: 1 / 20,
            labelUpdateIntervalSec: 1 / 9,
            entitySyncIntervalSec: 1 / 22,
            routeRebuildIntervalSec: 0.2,
            routeRebuildDistanceSq: 2.8 * 2.8,
        },
        skidProfile: {
            maxSmokeParticles: 150,
            smokeSpawnRateMultiplier: 0.66,
            maxEmissionPerFrame: 8,
        },
        modeDescription: 'Balanced detail and performance.',
    },
    performance: {
        label: 'Performance',
        pixelRatioCap: 0.68,
        mapProfile: {
            minimapMaxDpr: 1.25,
            worldMapMaxDpr: 1.25,
            minimapDrawIntervalSec: 1 / 18,
            worldMapDrawIntervalSec: 1 / 14,
            labelUpdateIntervalSec: 1 / 7,
            entitySyncIntervalSec: 1 / 16,
            routeRebuildIntervalSec: 0.3,
            routeRebuildDistanceSq: 3.8 * 3.8,
        },
        skidProfile: {
            maxSmokeParticles: 96,
            smokeSpawnRateMultiplier: 0.46,
            maxEmissionPerFrame: 5,
        },
        modeDescription: 'Fastest response for weaker GPUs.',
    },
};

const COMPACT_MODE_LABELS = Object.freeze({
    auto: 'AUTO',
    quality: 'HIGH',
    balanced: 'MEDIUM',
    performance: 'LOW',
});

export const GRAPHICS_QUALITY_MODES = Object.freeze({
    auto: 'auto',
    quality: 'quality',
    balanced: 'balanced',
    performance: 'performance',
});

export const GRAPHICS_QUALITY_MODE_LABELS = Object.freeze({
    auto: 'Auto',
    quality: 'Quality',
    balanced: 'Balanced',
    performance: 'Performance',
});

export function createGraphicsQualityController({
    renderer,
    renderSettings,
    initialMode = GRAPHICS_QUALITY_MODES.auto,
    mapUiController = null,
    skidMarkController = null,
} = {}) {
    if (!renderer || !renderSettings) {
        return createNoopController();
    }

    const state = {
        mode: resolveMode(initialMode),
        autoScale: 1,
        highLoadTimeSec: 0,
        lowLoadTimeSec: 0,
        smoothedFrameMs: 16.7,
        fpsEstimate: 60,
        activeProfileKey: AUTO_BASE_PROFILE_KEY,
        activePixelRatioCap: Number.NaN,
        appliedPixelRatio: Number.NaN,
        mapUiController,
        skidMarkController,
    };

    applyCurrentQuality();

    return {
        sampleFrame,
        setMode,
        cycleMode,
        attachMapUiController,
        attachSkidMarkController,
        getMode() {
            return state.mode;
        },
        getMaxPixelRatioCap() {
            return state.activePixelRatioCap;
        },
        getSnapshot,
    };

    function sampleFrame(deltaTime = 1 / 60, { allowAdaptive = true } = {}) {
        const dt = clamp(Number(deltaTime) || 0, 0, 0.2);
        if (dt <= 0) {
            return getSnapshot();
        }

        const frameMs = dt * 1000;
        state.smoothedFrameMs += (frameMs - state.smoothedFrameMs) * FRAME_TIME_SMOOTHING;
        state.fpsEstimate = state.smoothedFrameMs > 0.001 ? 1000 / state.smoothedFrameMs : 0;

        let shouldApply = false;
        if (state.mode === GRAPHICS_QUALITY_MODES.auto) {
            if (allowAdaptive) {
                if (state.smoothedFrameMs > AUTO_DEGRADE_THRESHOLD_MS) {
                    state.highLoadTimeSec += dt;
                    state.lowLoadTimeSec = Math.max(0, state.lowLoadTimeSec - dt * 1.4);
                } else if (state.smoothedFrameMs < AUTO_UPGRADE_THRESHOLD_MS) {
                    state.lowLoadTimeSec += dt;
                    state.highLoadTimeSec = Math.max(0, state.highLoadTimeSec - dt * 1.2);
                } else {
                    state.highLoadTimeSec = Math.max(0, state.highLoadTimeSec - dt);
                    state.lowLoadTimeSec = Math.max(0, state.lowLoadTimeSec - dt);
                }

                if (state.highLoadTimeSec >= AUTO_DEGRADE_HOLD_SEC) {
                    state.highLoadTimeSec = 0;
                    const nextScale = clamp(
                        state.autoScale - AUTO_DEGRADE_STEP,
                        AUTO_MIN_SCALE,
                        AUTO_MAX_SCALE
                    );
                    if (Math.abs(nextScale - state.autoScale) > 1e-6) {
                        state.autoScale = nextScale;
                        shouldApply = true;
                    }
                } else if (state.lowLoadTimeSec >= AUTO_UPGRADE_HOLD_SEC) {
                    state.lowLoadTimeSec = 0;
                    const nextScale = clamp(
                        state.autoScale + AUTO_UPGRADE_STEP,
                        AUTO_MIN_SCALE,
                        AUTO_MAX_SCALE
                    );
                    if (Math.abs(nextScale - state.autoScale) > 1e-6) {
                        state.autoScale = nextScale;
                        shouldApply = true;
                    }
                }
            } else {
                state.highLoadTimeSec = Math.max(0, state.highLoadTimeSec - dt * 2);
                state.lowLoadTimeSec = Math.max(0, state.lowLoadTimeSec - dt * 2);
            }
        }

        if (shouldApply) {
            applyCurrentQuality();
        } else {
            applyPixelRatioCap(computePixelRatioCap());
        }
        return getSnapshot();
    }

    function setMode(nextMode) {
        const resolvedMode = resolveMode(nextMode, state.mode);
        if (resolvedMode === state.mode) {
            return getSnapshot();
        }
        state.mode = resolvedMode;
        state.highLoadTimeSec = 0;
        state.lowLoadTimeSec = 0;
        if (resolvedMode === GRAPHICS_QUALITY_MODES.auto) {
            state.autoScale = 1;
        }
        applyCurrentQuality();
        return getSnapshot();
    }

    function cycleMode(step = 1) {
        const direction = step < 0 ? -1 : 1;
        const currentIndex = GRAPHICS_QUALITY_MODE_ORDER.indexOf(state.mode);
        const baseIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex =
            (baseIndex + direction + GRAPHICS_QUALITY_MODE_ORDER.length) %
            GRAPHICS_QUALITY_MODE_ORDER.length;
        return setMode(GRAPHICS_QUALITY_MODE_ORDER[nextIndex]);
    }

    function attachMapUiController(controller) {
        state.mapUiController = controller && typeof controller === 'object' ? controller : null;
        applyProfileToSystems(state.activeProfileKey);
    }

    function attachSkidMarkController(controller) {
        state.skidMarkController = controller && typeof controller === 'object' ? controller : null;
        applyProfileToSystems(state.activeProfileKey);
    }

    function applyCurrentQuality() {
        const nextProfileKey =
            state.mode === GRAPHICS_QUALITY_MODES.auto ? resolveAutoProfileKey() : state.mode;
        if (nextProfileKey !== state.activeProfileKey) {
            state.activeProfileKey = nextProfileKey;
            applyProfileToSystems(nextProfileKey);
        }
        applyPixelRatioCap(computePixelRatioCap());
    }

    function resolveAutoProfileKey() {
        if (state.autoScale <= 0.84) {
            return GRAPHICS_QUALITY_MODES.performance;
        }
        if (state.autoScale >= 1.08) {
            return GRAPHICS_QUALITY_MODES.quality;
        }
        return GRAPHICS_QUALITY_MODES.balanced;
    }

    function applyProfileToSystems(profileKey) {
        const profile = QUALITY_PROFILES[profileKey] || QUALITY_PROFILES[AUTO_BASE_PROFILE_KEY];
        state.mapUiController?.setQualityProfile?.(profile.mapProfile);
        state.skidMarkController?.setQualityProfile?.(profile.skidProfile);
    }

    function computePixelRatioCap() {
        if (state.mode !== GRAPHICS_QUALITY_MODES.auto) {
            return QUALITY_PROFILES[state.mode].pixelRatioCap;
        }
        const baseCap = QUALITY_PROFILES[AUTO_BASE_PROFILE_KEY].pixelRatioCap;
        const maxCap = QUALITY_PROFILES.quality.pixelRatioCap;
        return clamp(baseCap * state.autoScale, 0.45, maxCap);
    }

    function applyPixelRatioCap(pixelRatioCap) {
        const clampedCap = clamp(Number(pixelRatioCap) || 0.5, 0.45, 2.2);
        renderSettings.maxPixelRatio = clampedCap;
        const devicePixelRatio = resolveDevicePixelRatio();
        const appliedPixelRatio = Math.min(devicePixelRatio, clampedCap);

        if (
            !Number.isFinite(state.activePixelRatioCap) ||
            Math.abs(state.activePixelRatioCap - clampedCap) >= 0.01 ||
            !Number.isFinite(state.appliedPixelRatio) ||
            Math.abs(state.appliedPixelRatio - appliedPixelRatio) >= 0.01
        ) {
            renderer.setPixelRatio(appliedPixelRatio);
            state.activePixelRatioCap = clampedCap;
            state.appliedPixelRatio = appliedPixelRatio;
        }
    }

    function getSnapshot() {
        const mode = state.mode;
        const modeLabel = GRAPHICS_QUALITY_MODE_LABELS[mode] || mode;
        const profile = QUALITY_PROFILES[state.activeProfileKey] || QUALITY_PROFILES.balanced;
        const fps = Math.max(0, Math.round(state.fpsEstimate || 0));
        const frameMs = Math.max(0, state.smoothedFrameMs || 0);
        const renderScalePercent = Math.max(10, Math.round((state.activePixelRatioCap || 0) * 100));
        const autoProfileHint = mode === GRAPHICS_QUALITY_MODES.auto ? ` (${profile.label})` : '';
        const compactModeLabel = COMPACT_MODE_LABELS[mode] || modeLabel.toUpperCase();

        return {
            mode,
            modeLabel,
            compactModeLabel,
            profileKey: state.activeProfileKey,
            profileLabel: profile.label,
            modeDescription: profile.modeDescription,
            isAuto: mode === GRAPHICS_QUALITY_MODES.auto,
            fps,
            frameMs,
            autoScale: state.autoScale,
            pixelRatioCap: state.activePixelRatioCap,
            renderScalePercent,
            titleText: `Graphics: ${modeLabel}${autoProfileHint}`,
            detailText:
                mode === GRAPHICS_QUALITY_MODES.auto
                    ? `Adaptive target using ${profile.label.toLowerCase()} profile.`
                    : profile.modeDescription,
            telemetryText: `Render ${renderScalePercent}% | ${fps} FPS`,
            compactStatusMessage: `Graphics: ${compactModeLabel}`,
            statusMessage: `Graphics ${modeLabel}${autoProfileHint} | render ${renderScalePercent}% | ${fps} FPS`,
        };
    }
}

function resolveMode(value, fallback = GRAPHICS_QUALITY_MODES.auto) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (GRAPHICS_QUALITY_MODE_ORDER.includes(normalized)) {
        return normalized;
    }
    return fallback;
}

function resolveDevicePixelRatio() {
    const dpr = Number(window.devicePixelRatio) || 1;
    return clamp(dpr, 1, 3);
}

function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}

function createNoopController() {
    return {
        sampleFrame() {
            return null;
        },
        setMode() {
            return null;
        },
        cycleMode() {
            return null;
        },
        attachMapUiController() {},
        attachSkidMarkController() {},
        getMode() {
            return GRAPHICS_QUALITY_MODES.auto;
        },
        getMaxPixelRatioCap() {
            return 1;
        },
        getSnapshot() {
            return null;
        },
    };
}
