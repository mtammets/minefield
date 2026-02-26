const DEFAULT_STUTTER_THRESHOLD_MS = 22;
const DEFAULT_SEVERE_THRESHOLD_MS = 33;
const FRAME_SMOOTHING = 0.14;
const PANEL_REFRESH_INTERVAL_MS = 80;
const LAST_SPIKE_RETENTION_MS = 15_000;
const MAX_BREAKDOWN_ENTRIES = 3;
const DEFAULT_MAX_SPIKE_HISTORY = 320;
const DEFAULT_MAX_RECENT_FRAMES = 360;
const DEFAULT_MAX_EVENT_HISTORY = 1400;
const DEFAULT_EVENT_MATCH_WINDOW_MS = 500;
const DEFAULT_SPIKE_WINDOW_MS = 500;
const MAX_CONTEXT_KEYS = 56;
const MAX_STAGE_DURATION_KEYS = 24;
const MAX_EVENT_LINKS_PER_SPIKE = 24;
const MAX_SPIKE_WINDOW_FRAMES = 220;
const DOWNLOAD_FILENAME_PREFIX = 'auto-performance-log';

const STAGE_LABELS = Object.freeze({
    unknown: 'unknown',
    welcome: 'welcome',
    multiplayer: 'multiplayer',
    simulation: 'simulation',
    physics: 'physics',
    botTraffic: 'bot traffic',
    collectibles: 'collectibles',
    crashDebris: 'crash debris',
    mineSystem: 'mine system',
    mapUi: 'map ui',
    audio: 'audio',
    scorePopup: 'score popup',
    render: 'render',
    quality: 'quality',
});

export function createPerformanceDiagnosticsController(options = {}) {
    const stutterThresholdMs = clampNumber(
        options?.stutterThresholdMs,
        14,
        80,
        DEFAULT_STUTTER_THRESHOLD_MS
    );
    const severeThresholdMs = Math.max(
        stutterThresholdMs + 4,
        clampNumber(
            options?.severeThresholdMs,
            stutterThresholdMs + 4,
            120,
            DEFAULT_SEVERE_THRESHOLD_MS
        )
    );

    const root = ensurePanelElement();
    if (!root) {
        return createNoopController();
    }

    const frameValueEl = root.querySelector('[data-perf="frame"]');
    const thresholdValueEl = root.querySelector('[data-perf="threshold"]');
    const lastSpikeValueEl = root.querySelector('[data-perf="last-spike"]');
    const causeValueEl = root.querySelector('[data-perf="cause"]');
    const detailValueEl = root.querySelector('[data-perf="detail"]');
    const breakdownValueEl = root.querySelector('[data-perf="breakdown"]');
    if (
        !frameValueEl ||
        !thresholdValueEl ||
        !lastSpikeValueEl ||
        !causeValueEl ||
        !detailValueEl ||
        !breakdownValueEl
    ) {
        return createNoopController();
    }

    thresholdValueEl.textContent = `${Math.round(stutterThresholdMs)} ms`;

    const state = {
        smoothedFrameMs: 16.7,
        lastSpike: null,
        lastUiUpdateAt: 0,
        visible: true,
        lastSnapshot: null,
        frameCount: 0,
        totalFrameMs: 0,
        spikeCount: 0,
        severeCount: 0,
        peakFrameMs: 0,
        spikeHistory: [],
        recentFrames: [],
        eventHistory: [],
        spikeWindows: [],
        pendingSpikeWindows: [],
        nextEventId: 1,
        nextSpikeWindowId: 1,
        maxSpikeHistory: clampInteger(
            options?.maxSpikeHistory,
            16,
            10_000,
            DEFAULT_MAX_SPIKE_HISTORY
        ),
        maxRecentFrames: clampInteger(
            options?.maxRecentFrames,
            30,
            20_000,
            DEFAULT_MAX_RECENT_FRAMES
        ),
        maxEventHistory: clampInteger(
            options?.maxEventHistory,
            40,
            25_000,
            DEFAULT_MAX_EVENT_HISTORY
        ),
        eventMatchWindowMs: clampInteger(
            options?.eventMatchWindowMs,
            60,
            2_500,
            DEFAULT_EVENT_MATCH_WINDOW_MS
        ),
        spikeWindowMs: clampInteger(options?.spikeWindowMs, 120, 2_000, DEFAULT_SPIKE_WINDOW_MS),
        sessionStartPerfMs: performance.now(),
        sessionStartEpochMs: Date.now(),
    };

    return {
        update,
        clear,
        setVisible(nextVisible = true) {
            state.visible = Boolean(nextVisible);
            root.hidden = !state.visible;
        },
        getSnapshot() {
            return state.lastSnapshot;
        },
        recordEvent(type = '', payload = null, options = null) {
            return recordEvent(type, payload, options);
        },
        getLogSnapshot(extra = null) {
            return buildLogSnapshot(extra);
        },
        downloadLog(extra = null, options = null) {
            const snapshot = buildLogSnapshot(extra);
            const fallbackFilename = `${DOWNLOAD_FILENAME_PREFIX}-${formatFilenameTimestamp(new Date())}.json`;
            const filename = sanitizeFilename(options?.filename, fallbackFilename);
            try {
                const bytes = downloadJsonSnapshot(snapshot, filename);
                return {
                    ok: true,
                    filename,
                    bytes,
                    spikes: snapshot?.stats?.spikeFrames || 0,
                };
            } catch (error) {
                return {
                    ok: false,
                    filename,
                    error:
                        typeof error?.message === 'string' && error.message.trim()
                            ? error.message.trim()
                            : 'Log download failed.',
                };
            }
        },
    };

    function update(sample = {}) {
        const frameMsRaw = Number(sample?.frameMs);
        if (!Number.isFinite(frameMsRaw) || frameMsRaw <= 0) {
            return;
        }
        const frameMs = Math.max(0, frameMsRaw);
        const nowMs = performance.now();
        state.smoothedFrameMs += (frameMs - state.smoothedFrameMs) * FRAME_SMOOTHING;

        const context = sample?.context && typeof sample.context === 'object' ? sample.context : {};
        const stageDurations = sample?.stageDurations || {};
        const analysis = analyzeFrame({
            frameMs,
            stageDurations,
            context,
            stutterThresholdMs,
            severeThresholdMs,
        });
        state.frameCount += 1;
        state.totalFrameMs += frameMs;
        state.peakFrameMs = Math.max(state.peakFrameMs, frameMs);
        if (analysis.isSpike) {
            state.spikeCount += 1;
        }
        if (analysis.severity === 'severe') {
            state.severeCount += 1;
        }

        const frameSample = buildFrameSample({
            frameIndex: state.frameCount,
            frameMs,
            frameDeltaSec: Number(sample?.frameDeltaSec) || 0,
            nowPerfMs: nowMs,
            sessionStartPerfMs: state.sessionStartPerfMs,
            sessionStartEpochMs: state.sessionStartEpochMs,
            analysis,
            stageDurations,
            context,
        });
        pushBounded(state.recentFrames, frameSample, state.maxRecentFrames);
        capturePendingSpikeWindowPostFrames(frameSample);

        if (analysis.isSpike) {
            state.lastSpike = {
                ...frameSample,
                atMs: nowMs,
            };
            pushBounded(state.spikeHistory, state.lastSpike, state.maxSpikeHistory);
            openSpikeWindowForSample(frameSample);
        } else if (state.lastSpike && nowMs - state.lastSpike.atMs > LAST_SPIKE_RETENTION_MS) {
            state.lastSpike = null;
        }

        const hiddenByContext = Boolean(context?.welcomeVisible);
        root.hidden = !state.visible || hiddenByContext;
        root.dataset.tone = analysis.severity;

        const shouldRefresh =
            analysis.isSpike || nowMs - state.lastUiUpdateAt >= PANEL_REFRESH_INTERVAL_MS;
        if (!shouldRefresh) {
            state.lastSnapshot = frameSample;
            return;
        }
        state.lastUiUpdateAt = nowMs;
        state.lastSnapshot = frameSample;

        const fps = state.smoothedFrameMs > 0.001 ? 1000 / state.smoothedFrameMs : 0;
        frameValueEl.textContent = `${formatMs(frameMs)} | ${Math.round(fps)} FPS`;
        const displayedSpike = state.lastSpike;
        lastSpikeValueEl.textContent = displayedSpike
            ? `${formatMs(displayedSpike.frameMs)} | ${formatAge(nowMs - displayedSpike.atMs)}`
            : 'none';

        const displayedCause = displayedSpike || frameSample;
        causeValueEl.textContent = displayedCause.causeLabel;
        detailValueEl.textContent = displayedCause.causeDetail;
        breakdownValueEl.textContent = formatBreakdown(displayedCause.breakdownEntries);
    }

    function clear() {
        state.sessionStartPerfMs = performance.now();
        state.sessionStartEpochMs = Date.now();
        state.lastSpike = null;
        state.lastSnapshot = null;
        state.smoothedFrameMs = 16.7;
        state.lastUiUpdateAt = 0;
        state.frameCount = 0;
        state.totalFrameMs = 0;
        state.spikeCount = 0;
        state.severeCount = 0;
        state.peakFrameMs = 0;
        state.spikeHistory.length = 0;
        state.recentFrames.length = 0;
        state.eventHistory.length = 0;
        state.spikeWindows.length = 0;
        state.pendingSpikeWindows.length = 0;
        state.nextEventId = 1;
        state.nextSpikeWindowId = 1;
        root.dataset.tone = 'ok';
        frameValueEl.textContent = '-';
        lastSpikeValueEl.textContent = 'none';
        causeValueEl.textContent = 'No spikes detected yet.';
        detailValueEl.textContent = '';
        breakdownValueEl.textContent = '-';
    }

    function buildLogSnapshot(extra = null) {
        const nowPerfMs = performance.now();
        const uptimeMs = Math.max(0, nowPerfMs - state.sessionStartPerfMs);
        const averageFrameMs = state.frameCount > 0 ? state.totalFrameMs / state.frameCount : 0;
        const averageFps = averageFrameMs > 0.001 ? 1000 / averageFrameMs : 0;
        const smoothedFps = state.smoothedFrameMs > 0.001 ? 1000 / state.smoothedFrameMs : 0;
        const spikeSummary = buildSpikeSummary(state.spikeHistory);
        const spikeWindows = buildSpikeWindowsSnapshot();
        const eventHistory = serializeEventHistory(state.eventHistory);
        return {
            schemaVersion: 1,
            generatedAtIso: new Date().toISOString(),
            thresholdsMs: {
                stutter: roundNumber(stutterThresholdMs),
                severe: roundNumber(severeThresholdMs),
            },
            correlationConfig: {
                eventMatchWindowMs: state.eventMatchWindowMs,
                spikeWindowMs: state.spikeWindowMs,
            },
            session: {
                startedAtEpochMs: Math.round(state.sessionStartEpochMs),
                startedAtIso: toIsoTimestamp(state.sessionStartEpochMs),
                uptimeMs: roundNumber(uptimeMs),
            },
            stats: {
                totalFrames: state.frameCount,
                spikeFrames: state.spikeCount,
                severeFrames: state.severeCount,
                spikeRate:
                    state.frameCount > 0 ? roundNumber(state.spikeCount / state.frameCount, 6) : 0,
                severeRate:
                    state.frameCount > 0 ? roundNumber(state.severeCount / state.frameCount, 6) : 0,
                averageFrameMs: roundNumber(averageFrameMs),
                averageFps: roundNumber(averageFps),
                smoothedFrameMs: roundNumber(state.smoothedFrameMs),
                smoothedFps: roundNumber(smoothedFps),
                peakFrameMs: roundNumber(state.peakFrameMs),
            },
            latestFrame: serializeFrameSample(state.lastSnapshot),
            lastSpike: serializeSpikeSample(
                state.lastSpike,
                nowPerfMs,
                state.eventHistory,
                state.eventMatchWindowMs
            ),
            spikeSummary,
            spikeHistory: serializeSpikeHistory(
                state.spikeHistory,
                nowPerfMs,
                state.eventHistory,
                state.eventMatchWindowMs
            ),
            spikeWindows,
            eventHistory,
            recentFrames: serializeFrameHistory(state.recentFrames),
            extra: sanitizeExportPayload(extra),
        };
    }

    function recordEvent(type = '', payload = null, options = null) {
        const normalizedType = sanitizeEventType(type);
        if (!normalizedType) {
            return null;
        }
        const nowPerfMs = performance.now();
        const sinceSessionStartMs = Math.max(0, nowPerfMs - state.sessionStartPerfMs);
        const epochMs = state.sessionStartEpochMs + sinceSessionStartMs;
        const event = {
            id: state.nextEventId,
            type: normalizedType,
            label: resolveEventLabel(normalizedType, options?.label),
            severity: resolveEventSeverity(options?.severity),
            payload: sanitizeEventPayload(payload),
            timestamp: {
                perfMs: roundNumber(nowPerfMs),
                sinceSessionStartMs: roundNumber(sinceSessionStartMs),
                epochMs: Math.round(epochMs),
                iso: toIsoTimestamp(epochMs),
            },
        };
        state.nextEventId += 1;
        pushBounded(state.eventHistory, event, state.maxEventHistory);
        return event;
    }

    function openSpikeWindowForSample(spikeFrameSample) {
        const spikeSinceSessionMs = Number(spikeFrameSample?.timestamp?.sinceSessionStartMs);
        if (!Number.isFinite(spikeSinceSessionMs)) {
            return;
        }
        const preFrames = collectFramesAroundTimestamp({
            frames: state.recentFrames,
            targetSinceSessionMs: spikeSinceSessionMs,
            windowMs: state.spikeWindowMs,
            includeAfter: false,
        });
        const relatedEvents = findEventsNearTimestamp(
            state.eventHistory,
            spikeSinceSessionMs,
            state.eventMatchWindowMs
        );
        const spikeWindow = {
            id: state.nextSpikeWindowId,
            captureWindowMs: state.spikeWindowMs,
            spikeFrame: serializeFrameSample(spikeFrameSample),
            spikeSinceSessionStartMs: roundNumber(spikeSinceSessionMs),
            preFrames,
            postFrames: [],
            relatedEvents,
            finalized: false,
        };
        state.nextSpikeWindowId += 1;
        pushBounded(state.spikeWindows, spikeWindow, state.maxSpikeHistory);
        state.pendingSpikeWindows.push(spikeWindow);
    }

    function capturePendingSpikeWindowPostFrames(frameSample) {
        if (!Array.isArray(state.pendingSpikeWindows) || state.pendingSpikeWindows.length === 0) {
            return;
        }
        const frameSinceSessionMs = Number(frameSample?.timestamp?.sinceSessionStartMs);
        if (!Number.isFinite(frameSinceSessionMs)) {
            return;
        }

        const remaining = [];
        for (let i = 0; i < state.pendingSpikeWindows.length; i += 1) {
            const entry = state.pendingSpikeWindows[i];
            if (!entry || typeof entry !== 'object') {
                continue;
            }
            const spikeSinceSessionMs = Number(entry.spikeSinceSessionStartMs);
            if (!Number.isFinite(spikeSinceSessionMs)) {
                entry.finalized = true;
                continue;
            }
            const relativeMs = frameSinceSessionMs - spikeSinceSessionMs;
            if (relativeMs > 0 && relativeMs <= state.spikeWindowMs) {
                pushBounded(
                    entry.postFrames,
                    toSpikeWindowFrameSample(frameSample, relativeMs),
                    MAX_SPIKE_WINDOW_FRAMES
                );
            }
            if (relativeMs >= state.spikeWindowMs) {
                entry.finalized = true;
                continue;
            }
            remaining.push(entry);
        }
        state.pendingSpikeWindows = remaining;
    }

    function buildSpikeWindowsSnapshot() {
        if (!Array.isArray(state.spikeWindows) || state.spikeWindows.length === 0) {
            return [];
        }
        const snapshots = [];
        for (let i = 0; i < state.spikeWindows.length; i += 1) {
            const entry = state.spikeWindows[i];
            if (!entry || typeof entry !== 'object') {
                continue;
            }
            const spikeFrame = serializeFrameSample(entry.spikeFrame);
            if (!spikeFrame) {
                continue;
            }
            const spikeSinceSessionMs = Number(entry.spikeSinceSessionStartMs);
            const preFrames = Array.isArray(entry.preFrames) ? entry.preFrames : [];
            const postFrames = Array.isArray(entry.postFrames) ? entry.postFrames : [];
            const relatedEvents = findEventsNearTimestamp(
                state.eventHistory,
                spikeSinceSessionMs,
                state.eventMatchWindowMs
            );
            snapshots.push({
                id: Math.max(1, Math.round(Number(entry.id) || 0)),
                captureWindowMs: Math.max(
                    1,
                    Math.round(Number(entry.captureWindowMs) || state.spikeWindowMs)
                ),
                finalized: Boolean(entry.finalized),
                spikeFrame,
                preFrames: preFrames.slice(0, MAX_SPIKE_WINDOW_FRAMES),
                postFrames: postFrames.slice(0, MAX_SPIKE_WINDOW_FRAMES),
                relatedEvents,
            });
        }
        return snapshots;
    }
}

function analyzeFrame({
    frameMs = 0,
    stageDurations = {},
    context = {},
    stutterThresholdMs = DEFAULT_STUTTER_THRESHOLD_MS,
    severeThresholdMs = DEFAULT_SEVERE_THRESHOLD_MS,
} = {}) {
    const entries = normalizeStageEntries(stageDurations);
    const measuredMs = entries.reduce((sum, entry) => sum + entry.ms, 0);
    const unknownMs = Math.max(0, frameMs - measuredMs);
    if (unknownMs > 0.25) {
        entries.push({
            key: 'unknown',
            label: STAGE_LABELS.unknown,
            ms: unknownMs,
        });
    }
    entries.sort((a, b) => b.ms - a.ms);

    const dominant = entries[0] || {
        key: 'unknown',
        label: STAGE_LABELS.unknown,
        ms: frameMs,
    };
    const breakdownEntries = entries.slice(0, MAX_BREAKDOWN_ENTRIES);
    const cause = resolveCause(dominant, context);

    const isSpike = frameMs >= stutterThresholdMs;
    const severity = frameMs >= severeThresholdMs ? 'severe' : isSpike ? 'warn' : 'ok';

    return {
        frameMs,
        isSpike,
        severity,
        dominantStageKey: dominant.key,
        dominantStageMs: dominant.ms,
        causeLabel: cause.label,
        causeDetail: cause.detail,
        breakdownEntries,
    };
}

function normalizeStageEntries(stageDurations = {}) {
    if (!stageDurations || typeof stageDurations !== 'object') {
        return [];
    }
    const entries = [];
    const keys = Object.keys(stageDurations);
    for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        const value = Number(stageDurations[key]);
        if (!Number.isFinite(value) || value <= 0.02) {
            continue;
        }
        entries.push({
            key,
            label: STAGE_LABELS[key] || key,
            ms: value,
        });
    }
    return entries;
}

function resolveCause(dominantEntry, context = {}) {
    const stageKey = dominantEntry?.key || 'unknown';
    const stageMs = Number(dominantEntry?.ms) || 0;
    const physicsSteps = Math.max(0, Math.round(Number(context?.physicsSteps) || 0));
    const maxPhysicsSteps = Math.max(1, Math.round(Number(context?.maxPhysicsSteps) || 1));
    const vehicleContactsCount = Math.max(
        0,
        Math.round(Number(context?.vehicleContactsCount) || 0)
    );
    const drawCalls = Math.max(0, Math.round(Number(context?.drawCalls) || 0));
    const triangles = Math.max(0, Math.round(Number(context?.triangles) || 0));
    const pendingCrashDebrisSpawns = Math.max(
        0,
        Math.round(Number(context?.pendingCrashDebrisSpawns) || 0)
    );
    const activeCrashDebrisPieces = Math.max(
        0,
        Math.round(Number(context?.activeCrashDebrisPieces) || 0)
    );
    const visibleCrashDebrisPieces = Math.max(
        0,
        Math.round(Number(context?.visibleCrashDebrisPieces) || 0)
    );
    const droppedCrashDebrisPoolMisses = Math.max(
        0,
        Math.round(Number(context?.droppedCrashDebrisPoolMisses) || 0)
    );
    const pendingMineDetonationSpawns = Math.max(
        0,
        Math.round(Number(context?.pendingMineDetonationSpawns) || 0)
    );
    const activeMineDetonationEffects = Math.max(
        0,
        Math.round(Number(context?.activeMineDetonationEffects) || 0)
    );
    const activeMineDetonationLights = Math.max(
        0,
        Math.round(Number(context?.activeMineDetonationLights) || 0)
    );
    const mineDetonationBurstCount = Math.max(
        0,
        Math.round(Number(context?.mineDetonationBurstCount) || 0)
    );
    const pendingBotMineDebris = Math.max(
        0,
        Math.round(Number(context?.pendingBotMineDebris) || 0)
    );
    const activeBotDetachedDebris = Math.max(
        0,
        Math.round(Number(context?.activeBotDetachedDebris) || 0)
    );
    const visibleBotDetachedDebris = Math.max(
        0,
        Math.round(Number(context?.visibleBotDetachedDebris) || 0)
    );
    const droppedBotDebrisPoolMisses = Math.max(
        0,
        Math.round(Number(context?.droppedBotDebrisPoolMisses) || 0)
    );
    const pendingCollectEffects = Math.max(
        0,
        Math.round(Number(context?.pendingCollectEffects) || 0)
    );
    const activeCollectEffects = Math.max(
        0,
        Math.round(Number(context?.activeCollectEffects) || 0)
    );
    const skippedRemoteCollectEffects = Math.max(
        0,
        Math.round(Number(context?.skippedRemoteCollectEffects) || 0)
    );
    const graphicsRenderScalePercent = Math.max(
        0,
        Math.round(Number(context?.graphicsRenderScalePercent) || 0)
    );
    const graphicsStallGuardScalePercent = Math.max(
        0,
        Math.round(Number(context?.graphicsStallGuardScalePercent) || 0)
    );
    const graphicsStallGuardTriggerCount = Math.max(
        0,
        Math.round(Number(context?.graphicsStallGuardTriggerCount) || 0)
    );
    const graphicsPreRenderGuardTriggerCount = Math.max(
        0,
        Math.round(Number(context?.graphicsPreRenderGuardTriggerCount) || 0)
    );
    const graphicsStallGuardActive =
        Math.max(0, Math.round(Number(context?.graphicsStallGuardActive) || 0)) > 0;

    if (stageKey === 'unknown') {
        return {
            label: 'Browser / driver stall',
            detail: `Untracked ${formatMs(stageMs)} (possible GC, tab scheduling, or driver wait).`,
        };
    }

    if (stageKey === 'physics') {
        if (physicsSteps >= maxPhysicsSteps) {
            return {
                label: 'Physics saturation',
                detail: `${formatMs(stageMs)} | steps ${physicsSteps}/${maxPhysicsSteps}`,
            };
        }
        const contactNote = vehicleContactsCount > 0 ? ` | contacts ${vehicleContactsCount}` : '';
        return {
            label: 'Physics / collision solve',
            detail: `${formatMs(stageMs)}${contactNote}`,
        };
    }

    if (stageKey === 'render') {
        const drawNote = drawCalls > 0 ? ` | draw ${drawCalls}` : '';
        const triNote = triangles > 0 ? ` | tri ${triangles}` : '';
        const queueNotes = [];
        if (pendingMineDetonationSpawns > 0 || activeMineDetonationEffects > 0) {
            queueNotes.push(`mine q${pendingMineDetonationSpawns}/a${activeMineDetonationEffects}`);
        }
        if (pendingBotMineDebris > 0 || activeBotDetachedDebris > 0) {
            queueNotes.push(
                `bot q${pendingBotMineDebris}/a${activeBotDetachedDebris}/v${visibleBotDetachedDebris}`
            );
        }
        if (pendingCrashDebrisSpawns > 0 || activeCrashDebrisPieces > 0) {
            queueNotes.push(
                `crash q${pendingCrashDebrisSpawns}/a${activeCrashDebrisPieces}/v${visibleCrashDebrisPieces}`
            );
        }
        if (droppedBotDebrisPoolMisses > 0 || droppedCrashDebrisPoolMisses > 0) {
            queueNotes.push(
                `pool bot${droppedBotDebrisPoolMisses}/crash${droppedCrashDebrisPoolMisses}`
            );
        }
        if (pendingCollectEffects > 0 || activeCollectEffects > 0) {
            const skipNote =
                skippedRemoteCollectEffects > 0 ? `/skip${skippedRemoteCollectEffects}` : '';
            queueNotes.push(`pickup q${pendingCollectEffects}/a${activeCollectEffects}${skipNote}`);
        }
        if (
            graphicsStallGuardActive ||
            graphicsStallGuardTriggerCount > 0 ||
            graphicsPreRenderGuardTriggerCount > 0
        ) {
            const renderScaleText =
                graphicsRenderScalePercent > 0 ? `render${graphicsRenderScalePercent}%` : 'render?';
            const stallScaleText =
                graphicsStallGuardScalePercent > 0
                    ? `guard${graphicsStallGuardScalePercent}%`
                    : 'guard?';
            queueNotes.push(
                `${renderScaleText}/${stallScaleText}/t${graphicsStallGuardTriggerCount}/p${graphicsPreRenderGuardTriggerCount}`
            );
        }
        const queueNote = queueNotes.length > 0 ? ` | fx ${queueNotes.join(', ')}` : '';
        return {
            label: 'Render / GPU load',
            detail: `${formatMs(stageMs)}${drawNote}${triNote}${queueNote}`,
        };
    }

    if (stageKey === 'crashDebris') {
        const crashNote = context?.crashCollisionTriggered ? ' | crash event' : '';
        const queueNote =
            pendingCrashDebrisSpawns > 0 || activeCrashDebrisPieces > 0
                ? ` | q${pendingCrashDebrisSpawns}/a${activeCrashDebrisPieces}/v${visibleCrashDebrisPieces}`
                : '';
        return {
            label: 'Crash debris simulation',
            detail: `${formatMs(stageMs)}${crashNote}${queueNote}`,
        };
    }

    if (stageKey === 'mineSystem') {
        const queueNote =
            pendingMineDetonationSpawns > 0 ||
            activeMineDetonationEffects > 0 ||
            activeMineDetonationLights > 0
                ? ` | q${pendingMineDetonationSpawns}/a${activeMineDetonationEffects}/l${activeMineDetonationLights}`
                : '';
        const burstNote =
            mineDetonationBurstCount > 0 ? ` | burst ${mineDetonationBurstCount}` : '';
        return {
            label: 'Mine system update',
            detail: `${formatMs(stageMs)} | collision ${context?.mineCollisionEnabled ? 'on' : 'off'}${queueNote}${burstNote}`,
        };
    }

    if (stageKey === 'botTraffic') {
        const botCount = Math.max(0, Math.round(Number(context?.botCollectorCount) || 0));
        const queueNote =
            pendingBotMineDebris > 0 || activeBotDetachedDebris > 0
                ? ` | q${pendingBotMineDebris}/a${activeBotDetachedDebris}/v${visibleBotDetachedDebris}`
                : '';
        return {
            label: 'Bot traffic update',
            detail: `${formatMs(stageMs)} | bots ${botCount}${queueNote}`,
        };
    }

    if (stageKey === 'collectibles') {
        const queueNote =
            pendingCollectEffects > 0 || activeCollectEffects > 0
                ? ` | q${pendingCollectEffects}/a${activeCollectEffects}${
                      skippedRemoteCollectEffects > 0 ? `/skip${skippedRemoteCollectEffects}` : ''
                  }`
                : '';
        return {
            label: 'Collectible update',
            detail: `${formatMs(stageMs)}${queueNote}`,
        };
    }

    if (stageKey === 'multiplayer') {
        return {
            label: 'Multiplayer sync',
            detail: formatMs(stageMs),
        };
    }

    if (stageKey === 'mapUi') {
        return {
            label: 'Map UI draw/update',
            detail: formatMs(stageMs),
        };
    }

    if (stageKey === 'audio') {
        return {
            label: 'Audio update',
            detail: formatMs(stageMs),
        };
    }

    if (stageKey === 'quality') {
        return {
            label: 'Adaptive quality check',
            detail: formatMs(stageMs),
        };
    }

    if (stageKey === 'simulation') {
        return {
            label: 'Gameplay simulation',
            detail: formatMs(stageMs),
        };
    }

    if (stageKey === 'welcome') {
        return {
            label: 'Welcome/UI branch',
            detail: formatMs(stageMs),
        };
    }

    return {
        label: 'General frame load',
        detail: formatMs(stageMs),
    };
}

function formatBreakdown(entries = []) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return '-';
    }
    const parts = [];
    for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        if (!entry) {
            continue;
        }
        parts.push(`${entry.label} ${formatMs(entry.ms)}`);
    }
    return parts.join(' | ') || '-';
}

function formatMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return '-';
    }
    return `${numeric.toFixed(1)} ms`;
}

function formatAge(ageMs) {
    const numeric = Number(ageMs);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return 'now';
    }
    if (numeric < 1000) {
        return `${Math.round(numeric)}ms ago`;
    }
    if (numeric < 60_000) {
        return `${(numeric / 1000).toFixed(1)}s ago`;
    }
    return `${Math.round(numeric / 1000)}s ago`;
}

function buildFrameSample({
    frameIndex = 0,
    frameMs = 0,
    frameDeltaSec = 0,
    nowPerfMs = 0,
    sessionStartPerfMs = 0,
    sessionStartEpochMs = 0,
    analysis = null,
    stageDurations = null,
    context = null,
} = {}) {
    const sinceSessionStartMs = Math.max(0, Number(nowPerfMs) - Number(sessionStartPerfMs));
    const epochMs = Number(sessionStartEpochMs) + sinceSessionStartMs;
    return {
        frameIndex: Math.max(0, Math.round(Number(frameIndex) || 0)),
        frameMs: roundNumber(frameMs),
        frameDeltaSec: roundNumber(frameDeltaSec, 5),
        isSpike: Boolean(analysis?.isSpike),
        severity: typeof analysis?.severity === 'string' ? analysis.severity : 'ok',
        dominantStageKey:
            typeof analysis?.dominantStageKey === 'string' ? analysis.dominantStageKey : 'unknown',
        dominantStageMs: roundNumber(Number(analysis?.dominantStageMs) || 0),
        causeLabel: typeof analysis?.causeLabel === 'string' ? analysis.causeLabel : '',
        causeDetail: typeof analysis?.causeDetail === 'string' ? analysis.causeDetail : '',
        breakdownEntries: sanitizeBreakdownEntries(analysis?.breakdownEntries),
        stageDurations: sanitizeStageDurationMap(stageDurations),
        context: sanitizeContext(context),
        timestamp: {
            perfMs: roundNumber(nowPerfMs),
            sinceSessionStartMs: roundNumber(sinceSessionStartMs),
            epochMs: Math.round(epochMs),
            iso: toIsoTimestamp(epochMs),
        },
    };
}

function serializeFrameSample(sample = null) {
    if (!sample || typeof sample !== 'object') {
        return null;
    }
    return {
        frameIndex: Math.max(0, Math.round(Number(sample.frameIndex) || 0)),
        frameMs: roundNumber(sample.frameMs),
        frameDeltaSec: roundNumber(sample.frameDeltaSec, 5),
        isSpike: Boolean(sample.isSpike),
        severity: typeof sample.severity === 'string' ? sample.severity : 'ok',
        dominantStageKey:
            typeof sample.dominantStageKey === 'string' ? sample.dominantStageKey : 'unknown',
        dominantStageMs: roundNumber(sample.dominantStageMs),
        causeLabel: typeof sample.causeLabel === 'string' ? sample.causeLabel : '',
        causeDetail: typeof sample.causeDetail === 'string' ? sample.causeDetail : '',
        breakdownEntries: sanitizeBreakdownEntries(sample.breakdownEntries),
        stageDurations: sanitizeStageDurationMap(sample.stageDurations),
        context: sanitizeContext(sample.context),
        timestamp: sanitizeTimestamp(sample.timestamp),
    };
}

function serializeSpikeSample(
    sample = null,
    nowPerfMs = 0,
    eventHistory = [],
    eventMatchWindowMs = DEFAULT_EVENT_MATCH_WINDOW_MS
) {
    const base = serializeFrameSample(sample);
    if (!base) {
        return null;
    }
    const spikeSinceSessionMs = Number(base?.timestamp?.sinceSessionStartMs);
    const relatedEvents = findEventsNearTimestamp(
        eventHistory,
        spikeSinceSessionMs,
        eventMatchWindowMs
    );
    const atMs = Number(sample?.atMs);
    if (!Number.isFinite(atMs)) {
        return {
            ...base,
            ageMs: null,
            relatedEvents,
        };
    }
    return {
        ...base,
        ageMs: roundNumber(Math.max(0, Number(nowPerfMs) - atMs)),
        relatedEvents,
    };
}

function serializeFrameHistory(history = []) {
    if (!Array.isArray(history) || history.length === 0) {
        return [];
    }
    const snapshots = [];
    for (let i = 0; i < history.length; i += 1) {
        const sample = serializeFrameSample(history[i]);
        if (sample) {
            snapshots.push(sample);
        }
    }
    return snapshots;
}

function serializeSpikeHistory(
    history = [],
    nowPerfMs = 0,
    eventHistory = [],
    eventMatchWindowMs = DEFAULT_EVENT_MATCH_WINDOW_MS
) {
    if (!Array.isArray(history) || history.length === 0) {
        return [];
    }
    const snapshots = [];
    for (let i = 0; i < history.length; i += 1) {
        const sample = serializeSpikeSample(
            history[i],
            nowPerfMs,
            eventHistory,
            eventMatchWindowMs
        );
        if (sample) {
            snapshots.push(sample);
        }
    }
    return snapshots;
}

function serializeEventHistory(history = []) {
    if (!Array.isArray(history) || history.length === 0) {
        return [];
    }
    const events = [];
    for (let i = 0; i < history.length; i += 1) {
        const entry = history[i];
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const timestamp = sanitizeTimestamp(entry.timestamp);
        events.push({
            id: Math.max(1, Math.round(Number(entry.id) || 0)),
            type: sanitizeEventType(entry.type),
            label: resolveEventLabel(entry.type, entry.label),
            severity: resolveEventSeverity(entry.severity),
            payload: sanitizeEventPayload(entry.payload),
            timestamp,
        });
    }
    return events;
}

function findEventsNearTimestamp(eventHistory = [], targetSinceSessionMs = 0, windowMs = 500) {
    if (!Array.isArray(eventHistory) || eventHistory.length === 0) {
        return [];
    }
    const targetMs = Number(targetSinceSessionMs);
    if (!Number.isFinite(targetMs)) {
        return [];
    }
    const safeWindowMs = Math.max(0, Number(windowMs) || 0);
    const matches = [];
    for (let i = 0; i < eventHistory.length; i += 1) {
        const event = eventHistory[i];
        if (!event || typeof event !== 'object') {
            continue;
        }
        const eventSinceSessionMs = Number(event?.timestamp?.sinceSessionStartMs);
        if (!Number.isFinite(eventSinceSessionMs)) {
            continue;
        }
        const relativeMs = roundNumber(eventSinceSessionMs - targetMs);
        if (Math.abs(relativeMs) > safeWindowMs) {
            continue;
        }
        const direction = relativeMs < -0.001 ? 'before' : relativeMs > 0.001 ? 'after' : 'exact';
        matches.push({
            id: Math.max(1, Math.round(Number(event.id) || 0)),
            type: sanitizeEventType(event.type),
            label: resolveEventLabel(event.type, event.label),
            severity: resolveEventSeverity(event.severity),
            relativeMs,
            direction,
            payload: sanitizeEventPayload(event.payload),
            timestamp: sanitizeTimestamp(event.timestamp),
        });
    }
    matches.sort((left, right) => left.relativeMs - right.relativeMs);
    if (matches.length > MAX_EVENT_LINKS_PER_SPIKE) {
        return matches.slice(-MAX_EVENT_LINKS_PER_SPIKE);
    }
    return matches;
}

function collectFramesAroundTimestamp({
    frames = [],
    targetSinceSessionMs = 0,
    windowMs = DEFAULT_SPIKE_WINDOW_MS,
    includeAfter = false,
} = {}) {
    if (!Array.isArray(frames) || frames.length === 0) {
        return [];
    }
    const targetMs = Number(targetSinceSessionMs);
    if (!Number.isFinite(targetMs)) {
        return [];
    }
    const safeWindowMs = Math.max(0, Number(windowMs) || 0);
    const collected = [];
    for (let i = 0; i < frames.length; i += 1) {
        const frame = frames[i];
        const frameSinceSessionMs = Number(frame?.timestamp?.sinceSessionStartMs);
        if (!Number.isFinite(frameSinceSessionMs)) {
            continue;
        }
        const relativeMs = frameSinceSessionMs - targetMs;
        if (relativeMs < -safeWindowMs || relativeMs > safeWindowMs) {
            continue;
        }
        if (!includeAfter && relativeMs >= 0) {
            continue;
        }
        const windowFrameSample = toSpikeWindowFrameSample(frame, relativeMs);
        if (windowFrameSample) {
            collected.push(windowFrameSample);
        }
    }
    if (collected.length > MAX_SPIKE_WINDOW_FRAMES) {
        return collected.slice(collected.length - MAX_SPIKE_WINDOW_FRAMES);
    }
    return collected;
}

function toSpikeWindowFrameSample(frame = null, relativeMs = 0) {
    const sample = serializeFrameSample(frame);
    if (!sample) {
        return null;
    }
    return {
        relativeMs: roundNumber(relativeMs),
        frameIndex: sample.frameIndex,
        frameMs: sample.frameMs,
        severity: sample.severity,
        dominantStageKey: sample.dominantStageKey,
        dominantStageMs: sample.dominantStageMs,
        causeLabel: sample.causeLabel,
        causeDetail: sample.causeDetail,
        breakdownEntries: sample.breakdownEntries,
        timestamp: sample.timestamp,
    };
}

function sanitizeEventType(value = '') {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!normalized) {
        return '';
    }
    return normalized.replace(/[^a-z0-9:_-]+/g, '-');
}

function resolveEventLabel(type = '', fallback = '') {
    const fallbackText = typeof fallback === 'string' ? fallback.trim() : '';
    if (fallbackText) {
        return fallbackText;
    }
    const normalizedType = sanitizeEventType(type);
    if (!normalizedType) {
        return 'event';
    }
    return normalizedType.replace(/[_:-]+/g, ' ');
}

function resolveEventSeverity(value = '') {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'error' || normalized === 'severe') {
        return 'severe';
    }
    if (normalized === 'warn' || normalized === 'warning') {
        return 'warn';
    }
    return 'info';
}

function sanitizeEventPayload(payload = null) {
    if (payload === undefined) {
        return null;
    }
    if (payload === null) {
        return null;
    }
    try {
        return JSON.parse(JSON.stringify(payload));
    } catch {
        return sanitizeShallowPayload(payload);
    }
}

function sanitizeShallowPayload(payload = null) {
    if (!payload || typeof payload !== 'object') {
        if (
            typeof payload === 'string' ||
            typeof payload === 'number' ||
            typeof payload === 'boolean'
        ) {
            return payload;
        }
        return null;
    }
    const keys = Object.keys(payload).slice(0, MAX_CONTEXT_KEYS);
    const safe = {};
    for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        const value = payload[key];
        if (value == null) {
            safe[key] = null;
            continue;
        }
        if (typeof value === 'string' || typeof value === 'boolean') {
            safe[key] = value;
            continue;
        }
        if (typeof value === 'number') {
            safe[key] = Number.isFinite(value) ? roundNumber(value, 6) : null;
        }
    }
    return safe;
}

function sanitizeBreakdownEntries(entries = []) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return [];
    }
    const normalized = [];
    for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        if (!entry) {
            continue;
        }
        const label =
            typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : 'unknown';
        const key = typeof entry.key === 'string' && entry.key.trim() ? entry.key.trim() : label;
        const ms = roundNumber(Number(entry.ms) || 0);
        if (!Number.isFinite(ms) || ms <= 0) {
            continue;
        }
        normalized.push({
            key,
            label,
            ms,
        });
    }
    return normalized;
}

function sanitizeStageDurationMap(source = null) {
    if (!source || typeof source !== 'object') {
        return {};
    }
    const keys = Object.keys(source).slice(0, MAX_STAGE_DURATION_KEYS);
    const safe = {};
    for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        if (typeof key !== 'string' || !key.trim()) {
            continue;
        }
        const value = roundNumber(Number(source[key]) || 0);
        if (!Number.isFinite(value) || value < 0) {
            continue;
        }
        safe[key] = value;
    }
    return safe;
}

function sanitizeContext(source = null) {
    if (!source || typeof source !== 'object') {
        return {};
    }
    const keys = Object.keys(source).slice(0, MAX_CONTEXT_KEYS);
    const safe = {};
    for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        if (typeof key !== 'string' || !key.trim()) {
            continue;
        }
        const value = source[key];
        if (typeof value === 'boolean') {
            safe[key] = value;
            continue;
        }
        if (typeof value === 'number') {
            safe[key] = Number.isFinite(value) ? roundNumber(value, 6) : null;
            continue;
        }
        if (typeof value === 'string') {
            safe[key] = value;
            continue;
        }
        if (value == null) {
            safe[key] = null;
        }
    }
    return safe;
}

function sanitizeTimestamp(timestamp = null) {
    if (!timestamp || typeof timestamp !== 'object') {
        return null;
    }
    const perfMs = roundNumber(Number(timestamp.perfMs) || 0);
    const sinceSessionStartMs = roundNumber(Number(timestamp.sinceSessionStartMs) || 0);
    const epochMs = Math.round(Number(timestamp.epochMs) || 0);
    return {
        perfMs: Number.isFinite(perfMs) ? perfMs : 0,
        sinceSessionStartMs: Number.isFinite(sinceSessionStartMs) ? sinceSessionStartMs : 0,
        epochMs,
        iso: toIsoTimestamp(epochMs),
    };
}

function buildSpikeSummary(spikeHistory = []) {
    if (!Array.isArray(spikeHistory) || spikeHistory.length === 0) {
        return {
            totalSpikes: 0,
            severeSpikes: 0,
            topStages: [],
            topCauses: [],
        };
    }
    const stageStats = new Map();
    const causeStats = new Map();
    let severeSpikes = 0;

    for (let i = 0; i < spikeHistory.length; i += 1) {
        const spike = spikeHistory[i];
        if (!spike || typeof spike !== 'object') {
            continue;
        }
        if (spike.severity === 'severe') {
            severeSpikes += 1;
        }
        const stageKey =
            typeof spike.dominantStageKey === 'string' && spike.dominantStageKey
                ? spike.dominantStageKey
                : 'unknown';
        const causeLabel =
            typeof spike.causeLabel === 'string' && spike.causeLabel ? spike.causeLabel : 'unknown';
        const frameMs = Math.max(0, Number(spike.frameMs) || 0);

        const stageEntry = stageStats.get(stageKey) || {
            stageKey,
            count: 0,
            totalFrameMs: 0,
            maxFrameMs: 0,
        };
        stageEntry.count += 1;
        stageEntry.totalFrameMs += frameMs;
        stageEntry.maxFrameMs = Math.max(stageEntry.maxFrameMs, frameMs);
        stageStats.set(stageKey, stageEntry);

        const causeEntry = causeStats.get(causeLabel) || {
            causeLabel,
            count: 0,
            totalFrameMs: 0,
            maxFrameMs: 0,
        };
        causeEntry.count += 1;
        causeEntry.totalFrameMs += frameMs;
        causeEntry.maxFrameMs = Math.max(causeEntry.maxFrameMs, frameMs);
        causeStats.set(causeLabel, causeEntry);
    }

    const topStages = Array.from(stageStats.values())
        .sort((left, right) => right.count - left.count || right.maxFrameMs - left.maxFrameMs)
        .slice(0, 6)
        .map((entry) => ({
            stageKey: entry.stageKey,
            count: entry.count,
            averageFrameMs: entry.count > 0 ? roundNumber(entry.totalFrameMs / entry.count) : 0,
            maxFrameMs: roundNumber(entry.maxFrameMs),
        }));

    const topCauses = Array.from(causeStats.values())
        .sort((left, right) => right.count - left.count || right.maxFrameMs - left.maxFrameMs)
        .slice(0, 6)
        .map((entry) => ({
            causeLabel: entry.causeLabel,
            count: entry.count,
            averageFrameMs: entry.count > 0 ? roundNumber(entry.totalFrameMs / entry.count) : 0,
            maxFrameMs: roundNumber(entry.maxFrameMs),
        }));

    return {
        totalSpikes: spikeHistory.length,
        severeSpikes,
        topStages,
        topCauses,
    };
}

function sanitizeExportPayload(payload) {
    if (payload === undefined) {
        return null;
    }
    try {
        return JSON.parse(JSON.stringify(payload));
    } catch {
        return {
            warning: 'extra payload could not be serialized',
        };
    }
}

function sanitizeFilename(filename, fallbackFilename) {
    const fallback =
        typeof fallbackFilename === 'string' && fallbackFilename.trim()
            ? fallbackFilename.trim()
            : `${DOWNLOAD_FILENAME_PREFIX}.json`;
    const raw = typeof filename === 'string' ? filename.trim() : '';
    const withExt = raw ? (raw.toLowerCase().endsWith('.json') ? raw : `${raw}.json`) : fallback;
    const cleaned = withExt
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return cleaned || fallback;
}

function formatFilenameTimestamp(date = new Date()) {
    const iso = date instanceof Date ? date.toISOString() : new Date().toISOString();
    return iso
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z')
        .replace('T', '-');
}

function downloadJsonSnapshot(payload, filename) {
    const serialized = JSON.stringify(payload, null, 2);
    const blob = new Blob([serialized], {
        type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener';
        anchor.style.display = 'none';
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
    } finally {
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 0);
    }
    return blob.size;
}

function pushBounded(list, value, limit) {
    if (!Array.isArray(list)) {
        return;
    }
    list.push(value);
    if (list.length <= limit) {
        return;
    }
    list.splice(0, list.length - limit);
}

function roundNumber(value, digits = 3) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    const factor = 10 ** digits;
    return Math.round(numeric * factor) / factor;
}

function toIsoTimestamp(epochMs = 0) {
    const numeric = Number(epochMs);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return '';
    }
    try {
        return new Date(numeric).toISOString();
    } catch {
        return '';
    }
}

function ensurePanelElement() {
    const existing = document.getElementById('performancePanel');
    if (existing) {
        return existing;
    }

    const root = document.createElement('aside');
    root.id = 'performancePanel';
    root.setAttribute('aria-label', 'Frame diagnostics');
    root.dataset.tone = 'ok';
    root.innerHTML = `
        <div class="perfPanelTitle">FRAME DIAGNOSTICS</div>
        <div class="perfPanelRow"><span>FRAME</span><strong data-perf="frame">-</strong></div>
        <div class="perfPanelRow"><span>SPIKE THRESHOLD</span><strong data-perf="threshold">-</strong></div>
        <div class="perfPanelRow"><span>LAST SPIKE</span><strong data-perf="last-spike">none</strong></div>
        <div class="perfPanelCause" data-perf="cause">No spikes detected yet.</div>
        <div class="perfPanelDetail" data-perf="detail"></div>
        <div class="perfPanelBreakdown" data-perf="breakdown">-</div>
    `;
    document.body.append(root);
    return root;
}

function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
}

function clampInteger(value, min, max, fallback) {
    const numeric = Math.round(Number(value));
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
}

function createNoopController() {
    return {
        update() {},
        clear() {},
        setVisible() {},
        getSnapshot() {
            return null;
        },
        recordEvent() {
            return null;
        },
        getLogSnapshot() {
            return null;
        },
        downloadLog() {
            return {
                ok: false,
                filename: '',
                error: 'Diagnostics panel unavailable.',
            };
        },
    };
}
