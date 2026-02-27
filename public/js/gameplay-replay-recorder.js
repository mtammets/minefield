const DEFAULT_CAPTURE_FPS = 30;
const DEFAULT_CHUNK_TIMESLICE_MS = 1000;
const DEFAULT_BUFFER_DURATION_SEC = 24;
const DEFAULT_MIN_CLIP_DURATION_MS = 2200;
const DEFAULT_MAX_CLIP_DURATION_MS = 24000;
const MIME_TYPE_CANDIDATES = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
];

export function createGameplayReplayRecorder({
    canvas,
    captureFps = DEFAULT_CAPTURE_FPS,
    chunkTimesliceMs = DEFAULT_CHUNK_TIMESLICE_MS,
    bufferDurationSec = DEFAULT_BUFFER_DURATION_SEC,
    minClipDurationMs = DEFAULT_MIN_CLIP_DURATION_MS,
    maxClipDurationMs = DEFAULT_MAX_CLIP_DURATION_MS,
    getNowMs = () => performance.now(),
} = {}) {
    if (
        !canvas ||
        typeof canvas.captureStream !== 'function' ||
        typeof window.MediaRecorder !== 'function'
    ) {
        return createNoopReplayRecorder();
    }

    const mediaRecorderCtor = window.MediaRecorder;
    const normalizedCaptureFps = Math.max(
        12,
        Math.round(Number(captureFps) || DEFAULT_CAPTURE_FPS)
    );
    const normalizedChunkTimesliceMs = Math.max(
        200,
        Math.round(Number(chunkTimesliceMs) || DEFAULT_CHUNK_TIMESLICE_MS)
    );
    const normalizedBufferDurationMs = Math.max(
        6000,
        Math.round((Number(bufferDurationSec) || DEFAULT_BUFFER_DURATION_SEC) * 1000)
    );
    const normalizedMinClipDurationMs = Math.max(
        1200,
        Math.round(Number(minClipDurationMs) || DEFAULT_MIN_CLIP_DURATION_MS)
    );
    const normalizedMaxClipDurationMs = Math.max(
        normalizedMinClipDurationMs,
        Math.round(Number(maxClipDurationMs) || DEFAULT_MAX_CLIP_DURATION_MS)
    );

    let stream = null;
    try {
        stream = canvas.captureStream(normalizedCaptureFps);
    } catch {
        return createNoopReplayRecorder();
    }
    if (!stream) {
        return createNoopReplayRecorder();
    }

    const selectedMimeType = resolveSupportedMimeType(mediaRecorderCtor);
    const targetBitrate = estimateVideoBitrate(canvas, normalizedCaptureFps);
    const recorder = createMediaRecorder(mediaRecorderCtor, stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: targetBitrate,
    });
    if (!recorder) {
        stopMediaStreamTracks(stream);
        return createNoopReplayRecorder();
    }

    let disposed = false;
    let startRequested = false;
    let desiredCaptureEnabled = false;
    let bufferedDurationMs = 0;
    let lastDataTimestampMs = Number(getNowMs()) || 0;
    let lastDataTimecodeMs = Number.NaN;
    let rebasePending = false;
    let rebaseInFlight = false;
    let restartAfterRebase = false;
    let latestClipUrl = '';
    const bufferedChunks = [];

    recorder.addEventListener('start', () => {
        if (disposed) {
            return;
        }
        syncRecorderState();
    });
    recorder.addEventListener('stop', () => {
        const shouldRestart = !disposed && restartAfterRebase;
        startRequested = false;
        rebaseInFlight = false;
        restartAfterRebase = false;
        rebasePending = false;
        bufferedChunks.length = 0;
        bufferedDurationMs = 0;
        lastDataTimecodeMs = Number.NaN;
        lastDataTimestampMs = Number(getNowMs()) || lastDataTimestampMs;
        if (!shouldRestart) {
            return;
        }
        ensureRecorderStarted();
        syncRecorderState();
    });
    recorder.addEventListener('dataavailable', (event) => {
        if (disposed) {
            return;
        }
        const chunkBlob = event?.data;
        if (!chunkBlob || chunkBlob.size <= 0) {
            return;
        }

        const nowMs = Number(getNowMs()) || lastDataTimestampMs;
        const durationMs = resolveChunkDurationMs({
            event,
            nowMs,
            fallbackMs: normalizedChunkTimesliceMs,
            previousTimecodeMs: lastDataTimecodeMs,
            previousTimestampMs: lastDataTimestampMs,
        });
        const nextTimecode = Number(event?.timecode);
        if (Number.isFinite(nextTimecode)) {
            lastDataTimecodeMs = nextTimecode;
        }
        lastDataTimestampMs = nowMs;

        bufferedChunks.push({
            blob: chunkBlob,
            durationMs,
        });
        bufferedDurationMs += durationMs;
        trimBufferedChunks();
    });

    recorder.addEventListener('error', () => {
        desiredCaptureEnabled = false;
        syncRecorderState();
    });

    return {
        isAvailable() {
            return !disposed;
        },
        updateCaptureState(nextState = {}) {
            if (disposed) {
                return;
            }
            desiredCaptureEnabled = Boolean(nextState?.enabled);
            ensureRecorderStarted();
            syncRecorderState();
            if (desiredCaptureEnabled) {
                maybeRebaseRecorder();
            }
        },
        captureLatestClip(options = {}) {
            if (disposed || bufferedChunks.length === 0) {
                return null;
            }

            const minDurationMs = Math.max(
                normalizedMinClipDurationMs,
                Math.round(Number(options?.minDurationMs) || normalizedMinClipDurationMs)
            );
            const requestedMaxDurationMs = Number(options?.maxDurationMs);
            const maxDurationMs = Math.max(
                minDurationMs,
                Number.isFinite(requestedMaxDurationMs)
                    ? Math.round(requestedMaxDurationMs)
                    : normalizedMaxClipDurationMs
            );
            const chunksForClip = takeLatestChunks(maxDurationMs);
            if (chunksForClip.durationMs < minDurationMs || chunksForClip.items.length === 0) {
                return null;
            }

            const clipBlob = new Blob(
                chunksForClip.items.map((entry) => entry.blob),
                {
                    type: resolveBlobMimeType(recorder, selectedMimeType),
                }
            );
            if (clipBlob.size <= 0) {
                return null;
            }

            revokeLatestClipUrl();
            latestClipUrl = URL.createObjectURL(clipBlob);
            return {
                url: latestClipUrl,
                durationMs: chunksForClip.durationMs,
                mimeType: clipBlob.type || resolveBlobMimeType(recorder, selectedMimeType),
                byteSize: clipBlob.size,
            };
        },
        clearLatestClip() {
            revokeLatestClipUrl();
        },
        dispose() {
            if (disposed) {
                return;
            }
            disposed = true;
            desiredCaptureEnabled = false;
            revokeLatestClipUrl();
            bufferedChunks.length = 0;
            bufferedDurationMs = 0;
            try {
                if (recorder.state !== 'inactive') {
                    recorder.stop();
                }
            } catch {
                // Ignore teardown errors during recorder shutdown.
            }
            stopMediaStreamTracks(stream);
            stream = null;
        },
    };

    function ensureRecorderStarted() {
        if (startRequested || disposed) {
            return;
        }
        try {
            recorder.start(normalizedChunkTimesliceMs);
            startRequested = true;
        } catch {
            desiredCaptureEnabled = false;
        }
    }

    function syncRecorderState() {
        if (!startRequested || disposed || rebaseInFlight) {
            return;
        }
        if (desiredCaptureEnabled) {
            if (recorder.state === 'paused') {
                try {
                    recorder.resume();
                } catch {
                    desiredCaptureEnabled = false;
                }
            }
            return;
        }
        if (recorder.state === 'recording') {
            try {
                recorder.pause();
            } catch {
                // Ignore pause errors; next state transition will retry.
            }
        }
    }

    function trimBufferedChunks() {
        let trimmed = false;
        while (bufferedDurationMs > normalizedBufferDurationMs && bufferedChunks.length > 1) {
            const dropped = bufferedChunks.shift();
            bufferedDurationMs = Math.max(0, bufferedDurationMs - (dropped?.durationMs || 0));
            trimmed = true;
        }
        if (trimmed) {
            // Older chunks were evicted; rebase recorder to refresh stream headers for the new window.
            rebasePending = true;
        }
    }

    function takeLatestChunks(maxDurationMs) {
        const selected = [];
        let durationMs = 0;
        for (let index = bufferedChunks.length - 1; index >= 0; index -= 1) {
            const chunk = bufferedChunks[index];
            selected.unshift(chunk);
            durationMs += chunk?.durationMs || 0;
            if (durationMs >= maxDurationMs) {
                break;
            }
        }
        return {
            items: selected,
            durationMs,
        };
    }

    function maybeRebaseRecorder() {
        if (
            disposed ||
            !rebasePending ||
            rebaseInFlight ||
            !startRequested ||
            (recorder.state !== 'recording' && recorder.state !== 'paused')
        ) {
            return;
        }
        rebaseInFlight = true;
        restartAfterRebase = desiredCaptureEnabled;
        try {
            recorder.requestData?.();
        } catch {
            // Continue and try to stop recorder even if requestData is unsupported.
        }
        try {
            recorder.stop();
        } catch {
            rebaseInFlight = false;
            restartAfterRebase = false;
            rebasePending = false;
        }
    }

    function revokeLatestClipUrl() {
        if (!latestClipUrl) {
            return;
        }
        try {
            URL.revokeObjectURL(latestClipUrl);
        } catch {
            // Ignore URL revocation failures.
        }
        latestClipUrl = '';
    }
}

function resolveSupportedMimeType(mediaRecorderCtor) {
    if (!mediaRecorderCtor || typeof mediaRecorderCtor.isTypeSupported !== 'function') {
        return '';
    }
    for (let i = 0; i < MIME_TYPE_CANDIDATES.length; i += 1) {
        const candidate = MIME_TYPE_CANDIDATES[i];
        if (!candidate) {
            continue;
        }
        try {
            if (mediaRecorderCtor.isTypeSupported(candidate)) {
                return candidate;
            }
        } catch {
            // Continue to next candidate.
        }
    }
    return '';
}

function estimateVideoBitrate(canvas, captureFps) {
    const canvasWidth = Math.max(1, Math.round(Number(canvas?.width) || 0));
    const canvasHeight = Math.max(1, Math.round(Number(canvas?.height) || 0));
    const pixelsPerFrame = canvasWidth * canvasHeight;
    const bitsPerPixel = 0.19;
    const fps = Math.max(12, Math.round(Number(captureFps) || DEFAULT_CAPTURE_FPS));
    const estimated = Math.round(pixelsPerFrame * bitsPerPixel * fps);
    return clampNumber(estimated, 8_000_000, 26_000_000);
}

function createMediaRecorder(mediaRecorderCtor, stream, options = {}) {
    const baseOptions = {};
    if (typeof options?.mimeType === 'string' && options.mimeType.trim()) {
        baseOptions.mimeType = options.mimeType.trim();
    }
    if (Number.isFinite(options?.videoBitsPerSecond) && options.videoBitsPerSecond > 0) {
        baseOptions.videoBitsPerSecond = Math.round(options.videoBitsPerSecond);
    }

    try {
        return new mediaRecorderCtor(stream, baseOptions);
    } catch {
        try {
            return new mediaRecorderCtor(stream);
        } catch {
            return null;
        }
    }
}

function resolveChunkDurationMs({
    event,
    nowMs,
    fallbackMs,
    previousTimecodeMs,
    previousTimestampMs,
} = {}) {
    const timecodeMs = Number(event?.timecode);
    const deltaFromTimecode =
        Number.isFinite(timecodeMs) && Number.isFinite(previousTimecodeMs)
            ? timecodeMs - previousTimecodeMs
            : Number.NaN;
    if (Number.isFinite(deltaFromTimecode) && deltaFromTimecode >= 60) {
        return clampNumber(Math.round(deltaFromTimecode), 60, fallbackMs * 4);
    }

    const deltaFromTimestamp =
        Number.isFinite(nowMs) && Number.isFinite(previousTimestampMs)
            ? nowMs - previousTimestampMs
            : Number.NaN;
    if (Number.isFinite(deltaFromTimestamp) && deltaFromTimestamp >= 60) {
        return clampNumber(Math.round(deltaFromTimestamp), 60, fallbackMs * 4);
    }

    return Math.max(60, Math.round(Number(fallbackMs) || DEFAULT_CHUNK_TIMESLICE_MS));
}

function resolveBlobMimeType(recorder, fallbackMimeType = '') {
    if (typeof recorder?.mimeType === 'string' && recorder.mimeType.trim()) {
        return recorder.mimeType.trim();
    }
    if (typeof fallbackMimeType === 'string' && fallbackMimeType.trim()) {
        return fallbackMimeType.trim();
    }
    return 'video/webm';
}

function stopMediaStreamTracks(stream) {
    const tracks = typeof stream?.getTracks === 'function' ? stream.getTracks() : [];
    for (let index = 0; index < tracks.length; index += 1) {
        const track = tracks[index];
        try {
            track?.stop?.();
        } catch {
            // Ignore shutdown errors per individual track.
        }
    }
}

function clampNumber(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(max, Math.max(min, value));
}

function createNoopReplayRecorder() {
    return {
        isAvailable() {
            return false;
        },
        updateCaptureState() {},
        captureLatestClip() {
            return null;
        },
        clearLatestClip() {},
        dispose() {},
    };
}
