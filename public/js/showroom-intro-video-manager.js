const SHOWROOM_INTRO_VIDEO_API_PATH = '/api/showroom-intro-video';
const SHOWROOM_INTRO_VIDEO_DEFAULT_URL = '/assets/Demo/Demo.mp4';
const SHOWROOM_INTRO_VIDEO_DEFAULT_WIDTH = 1680;
const SHOWROOM_INTRO_VIDEO_DEFAULT_HEIGHT = 900;
const SHOWROOM_INTRO_VIDEO_DEFAULT_FRAME_RATE = 30;
const SHOWROOM_INTRO_VIDEO_UPLOAD_ACCEPT =
    'video/mp4,video/webm,video/quicktime,video/x-m4v,.mov,.mp4,.webm,.m4v';
const SHOWROOM_INTRO_VIDEO_MAX_UPLOAD_BYTES = 300 * 1024 * 1024;
const SHOWROOM_INTRO_VIDEO_CACHE_KEY = 'minefield-showroom-intro-video-config-v1';

export const SHOWROOM_INTRO_VIDEO_UPDATED_EVENT = 'silentdrift:showroom-intro-video-updated';

const showroomIntroVideoState = {
    config: createBootstrapShowroomIntroVideoConfig(),
    initializationPromise: null,
};

export function getShowroomIntroVideoConfig() {
    return { ...showroomIntroVideoState.config };
}

export function initializeShowroomIntroVideoManager() {
    if (showroomIntroVideoState.initializationPromise) {
        return showroomIntroVideoState.initializationPromise;
    }

    showroomIntroVideoState.initializationPromise = refreshShowroomIntroVideoConfig().finally(
        () => {
            showroomIntroVideoState.initializationPromise = null;
        }
    );
    return showroomIntroVideoState.initializationPromise;
}

export async function refreshShowroomIntroVideoConfig() {
    try {
        const response = await window.fetch(SHOWROOM_INTRO_VIDEO_API_PATH, {
            method: 'GET',
            cache: 'no-store',
            headers: {
                Accept: 'application/json',
            },
        });
        const payload = await safeReadJson(response);
        if (!response.ok || !payload?.ok) {
            throw new Error(
                resolveShowroomIntroVideoApiErrorMessage(response.status, payload?.error, 'load')
            );
        }

        return setShowroomIntroVideoConfig(payload.video);
    } catch (error) {
        console.warn('Showroom intro video config could not be loaded. Using fallback.', error);
        const currentConfig = showroomIntroVideoState.config;
        if (currentConfig.available && currentConfig.url) {
            return getShowroomIntroVideoConfig();
        }
        return setShowroomIntroVideoConfig(createDefaultShowroomIntroVideoConfig());
    }
}

export async function uploadShowroomIntroVideo(file) {
    validateShowroomIntroVideoFile(file);

    const response = await window.fetch(SHOWROOM_INTRO_VIDEO_API_PATH, {
        method: 'POST',
        cache: 'no-store',
        headers: {
            Accept: 'application/json',
            'Content-Type': file.type || 'application/octet-stream',
            'X-Upload-Filename': encodeURIComponent(file.name || 'showroom-demo-video'),
        },
        body: file,
    });
    const payload = await safeReadJson(response);
    if (!response.ok || !payload?.ok) {
        throw new Error(
            resolveShowroomIntroVideoApiErrorMessage(response.status, payload?.error, 'upload')
        );
    }

    return setShowroomIntroVideoConfig(payload.video);
}

export async function resetShowroomIntroVideo() {
    const response = await window.fetch(SHOWROOM_INTRO_VIDEO_API_PATH, {
        method: 'DELETE',
        cache: 'no-store',
        headers: {
            Accept: 'application/json',
        },
    });
    const payload = await safeReadJson(response);
    if (!response.ok || !payload?.ok) {
        throw new Error(
            resolveShowroomIntroVideoApiErrorMessage(response.status, payload?.error, 'reset')
        );
    }

    return setShowroomIntroVideoConfig(payload.video);
}

function setShowroomIntroVideoConfig(config) {
    showroomIntroVideoState.config = normalizeShowroomIntroVideoConfig(config);
    persistShowroomIntroVideoConfig(showroomIntroVideoState.config);
    dispatchShowroomIntroVideoUpdate(showroomIntroVideoState.config);
    return getShowroomIntroVideoConfig();
}

function dispatchShowroomIntroVideoUpdate(config) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
        return;
    }
    window.dispatchEvent(
        new CustomEvent(SHOWROOM_INTRO_VIDEO_UPDATED_EVENT, {
            detail: { ...config },
        })
    );
}

function createDefaultShowroomIntroVideoConfig() {
    return {
        available: true,
        isCustom: false,
        canReset: false,
        sourceLabel: 'Built-in default',
        statusText: 'Using built-in showroom demo.',
        fileName: 'Demo.mp4',
        originalFileName: '',
        mimeType: 'video/mp4',
        uploadedMimeType: '',
        width: SHOWROOM_INTRO_VIDEO_DEFAULT_WIDTH,
        height: SHOWROOM_INTRO_VIDEO_DEFAULT_HEIGHT,
        frameRate: SHOWROOM_INTRO_VIDEO_DEFAULT_FRAME_RATE,
        sizeBytes: 0,
        updatedAt: null,
        url: SHOWROOM_INTRO_VIDEO_DEFAULT_URL,
        accept: SHOWROOM_INTRO_VIDEO_UPLOAD_ACCEPT,
    };
}

function createBootstrapShowroomIntroVideoConfig() {
    const windowBootstrapConfig = readWindowBootstrapShowroomIntroVideoConfig();
    if (windowBootstrapConfig?.available && windowBootstrapConfig.url) {
        persistShowroomIntroVideoConfig(windowBootstrapConfig);
        return windowBootstrapConfig;
    }
    const persistedConfig = readPersistedShowroomIntroVideoConfig();
    if (persistedConfig?.available && persistedConfig.url) {
        return persistedConfig;
    }
    return createDefaultShowroomIntroVideoConfig();
}

function createPendingShowroomIntroVideoConfig() {
    return {
        available: false,
        isCustom: false,
        canReset: false,
        sourceLabel: 'Loading',
        statusText: 'Loading showroom demo...',
        fileName: '',
        originalFileName: '',
        mimeType: 'video/mp4',
        uploadedMimeType: '',
        width: SHOWROOM_INTRO_VIDEO_DEFAULT_WIDTH,
        height: SHOWROOM_INTRO_VIDEO_DEFAULT_HEIGHT,
        frameRate: SHOWROOM_INTRO_VIDEO_DEFAULT_FRAME_RATE,
        sizeBytes: 0,
        updatedAt: null,
        url: '',
        accept: SHOWROOM_INTRO_VIDEO_UPLOAD_ACCEPT,
    };
}

function readPersistedShowroomIntroVideoConfig() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return null;
    }
    try {
        const rawValue = window.localStorage.getItem(SHOWROOM_INTRO_VIDEO_CACHE_KEY);
        if (!rawValue) {
            return null;
        }
        const parsed = JSON.parse(rawValue);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }
        return normalizeShowroomIntroVideoConfig(parsed);
    } catch {
        return null;
    }
}

function readWindowBootstrapShowroomIntroVideoConfig() {
    if (typeof window === 'undefined') {
        return null;
    }
    const bootstrapConfig = window.__MINEFIELD_SHOWROOM_INTRO_BOOTSTRAP__;
    if (!bootstrapConfig || typeof bootstrapConfig !== 'object') {
        return null;
    }
    return normalizeShowroomIntroVideoConfig(bootstrapConfig);
}

function persistShowroomIntroVideoConfig(config) {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }
    try {
        window.localStorage.setItem(
            SHOWROOM_INTRO_VIDEO_CACHE_KEY,
            JSON.stringify(normalizeShowroomIntroVideoConfig(config))
        );
    } catch {
        // Ignore storage write failures.
    }
}

function normalizeShowroomIntroVideoConfig(config) {
    const source = config && typeof config === 'object' ? config : {};
    const fallback = createDefaultShowroomIntroVideoConfig();
    const url =
        typeof source.url === 'string' && source.url.trim() ? source.url.trim() : fallback.url;
    const updatedAt = normalizeTimestamp(source.updatedAt);

    return {
        available: source.available !== false && Boolean(url),
        isCustom: Boolean(source.isCustom),
        canReset: Boolean(source.canReset ?? source.isCustom),
        sourceLabel:
            typeof source.sourceLabel === 'string' && source.sourceLabel.trim()
                ? source.sourceLabel.trim()
                : fallback.sourceLabel,
        statusText:
            typeof source.statusText === 'string' && source.statusText.trim()
                ? source.statusText.trim()
                : fallback.statusText,
        fileName:
            typeof source.fileName === 'string' && source.fileName.trim()
                ? source.fileName.trim()
                : fallback.fileName,
        originalFileName:
            typeof source.originalFileName === 'string' && source.originalFileName.trim()
                ? source.originalFileName.trim()
                : '',
        mimeType:
            typeof source.mimeType === 'string' && source.mimeType.trim()
                ? source.mimeType.trim().toLowerCase()
                : fallback.mimeType,
        uploadedMimeType:
            typeof source.uploadedMimeType === 'string' && source.uploadedMimeType.trim()
                ? source.uploadedMimeType.trim().toLowerCase()
                : '',
        width: Math.max(1, Math.round(Number(source.width) || fallback.width)),
        height: Math.max(1, Math.round(Number(source.height) || fallback.height)),
        frameRate: Math.max(1, Math.round(Number(source.frameRate) || fallback.frameRate)),
        sizeBytes: Math.max(0, Math.round(Number(source.sizeBytes) || 0)),
        updatedAt,
        url,
        accept: SHOWROOM_INTRO_VIDEO_UPLOAD_ACCEPT,
    };
}

function validateShowroomIntroVideoFile(file) {
    if (!(file instanceof File)) {
        throw new Error('Select a video file to upload.');
    }
    const mimeType = typeof file.type === 'string' ? file.type.trim().toLowerCase() : '';
    const name = typeof file.name === 'string' ? file.name.trim().toLowerCase() : '';
    const looksLikeVideo = mimeType.startsWith('video/') || /\.(mov|mp4|webm|m4v)$/u.test(name);
    if (!looksLikeVideo) {
        throw new Error('Only video files are supported here.');
    }
    if (Math.max(0, Number(file.size) || 0) > SHOWROOM_INTRO_VIDEO_MAX_UPLOAD_BYTES) {
        throw new Error('Video is too large for the showroom uploader. Keep it under 300 MB.');
    }
}

async function safeReadJson(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

function normalizeTimestamp(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        return null;
    }
    const timestamp = Date.parse(normalized);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function resolveShowroomIntroVideoApiErrorMessage(statusCode, serverMessage, action = 'load') {
    if (statusCode === 404) {
        return 'Showroom intro API is missing on the running server. Restart the local server and try again.';
    }
    if (statusCode === 403) {
        return 'Showroom intro admin access is denied for this server.';
    }
    if (statusCode === 413) {
        return action === 'upload'
            ? 'Selected video is too large. Keep it under 300 MB.'
            : 'Request payload is too large.';
    }
    if (statusCode === 415) {
        return 'Only video files are supported here.';
    }
    return serverMessage || `Showroom intro video ${action} failed.`;
}
