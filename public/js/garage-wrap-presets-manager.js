const GARAGE_WRAP_PRESETS_API_PATH = '/api/garage-wrap-presets';
const GARAGE_WRAP_PRESET_UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
const GARAGE_WRAP_PRESET_MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const GARAGE_WRAP_PRESET_OUTPUT_WIDTH_PX = 2048;
const GARAGE_WRAP_PRESET_OUTPUT_HEIGHT_PX = 1024;
const GARAGE_WRAP_PRESET_OUTPUT_QUALITY = 0.9;

export const GARAGE_WRAP_PRESETS_UPDATED_EVENT = 'silentdrift:garage-wrap-presets-updated';

const DEFAULT_GARAGE_WRAP_PRESET_ENTRIES = Object.freeze([
    Object.freeze({
        id: 'skin-1',
        label: 'Preset Skin 1',
        url: '/assets/skins/skin1.png',
        source: 'default',
        hasCustomImage: false,
        canReset: false,
        canDelete: false,
        updatedAt: '',
    }),
    Object.freeze({
        id: 'skin-2',
        label: 'Preset Skin 2',
        url: '/assets/skins/skin2.png',
        source: 'default',
        hasCustomImage: false,
        canReset: false,
        canDelete: false,
        updatedAt: '',
    }),
    Object.freeze({
        id: 'skin-3',
        label: 'Preset Skin 3',
        url: '/assets/skins/skin3.png',
        source: 'default',
        hasCustomImage: false,
        canReset: false,
        canDelete: false,
        updatedAt: '',
    }),
    Object.freeze({
        id: 'skin-4',
        label: 'Preset Skin 4',
        url: '/assets/skins/skin4.png',
        source: 'default',
        hasCustomImage: false,
        canReset: false,
        canDelete: false,
        updatedAt: '',
    }),
]);

const garageWrapPresetState = {
    presets: DEFAULT_GARAGE_WRAP_PRESET_ENTRIES.slice(),
    updatedAt: '',
    initializationPromise: null,
};

export function getGarageWrapPresetEntries() {
    return garageWrapPresetState.presets.map((preset) => ({ ...preset }));
}

export function getGarageWrapPresetById(presetId = '') {
    const normalizedId = sanitizeGarageWrapPresetId(presetId);
    return garageWrapPresetState.presets.find((preset) => preset.id === normalizedId) || null;
}

export function getGarageWrapPresetByUrl(url = '') {
    const normalizedUrl = sanitizeGarageWrapPresetUrl(url);
    return (
        garageWrapPresetState.presets.find(
            (preset) => sanitizeGarageWrapPresetUrl(preset.url) === normalizedUrl
        ) || null
    );
}

export function initializeGarageWrapPresetManager() {
    if (garageWrapPresetState.initializationPromise) {
        return garageWrapPresetState.initializationPromise;
    }

    garageWrapPresetState.initializationPromise = refreshGarageWrapPresetConfig().finally(() => {
        garageWrapPresetState.initializationPromise = null;
    });
    return garageWrapPresetState.initializationPromise;
}

export async function refreshGarageWrapPresetConfig() {
    try {
        const response = await window.fetch(GARAGE_WRAP_PRESETS_API_PATH, {
            method: 'GET',
            cache: 'no-store',
            headers: {
                Accept: 'application/json',
            },
        });
        const payload = await safeReadJson(response);
        if (!response.ok || !payload?.ok) {
            throw new Error(
                resolveGarageWrapPresetApiErrorMessage(response.status, payload?.error, 'load')
            );
        }
        return setGarageWrapPresetConfig(payload);
    } catch (error) {
        console.warn('Garage wrap presets could not be loaded. Using fallback presets.', error);
        if (garageWrapPresetState.presets.length) {
            return getGarageWrapPresetEntries();
        }
        return setGarageWrapPresetConfig({
            presets: DEFAULT_GARAGE_WRAP_PRESET_ENTRIES,
            updatedAt: '',
        });
    }
}

export async function uploadGarageWrapPresetImage(presetId, file) {
    const normalizedPresetId = sanitizeGarageWrapPresetId(presetId);
    validateGarageWrapPresetFile(file);
    if (!normalizedPresetId) {
        throw new Error('Choose a valid preset slot first.');
    }
    const preparedUpload = await prepareGarageWrapPresetUpload(file);

    const response = await window.fetch(
        `${GARAGE_WRAP_PRESETS_API_PATH}/${encodeURIComponent(normalizedPresetId)}`,
        {
            method: 'POST',
            cache: 'no-store',
            headers: {
                Accept: 'application/json',
                'Content-Type': preparedUpload.contentType,
                'X-Upload-Filename': encodeURIComponent(
                    preparedUpload.fileName || file.name || normalizedPresetId
                ),
            },
            body: preparedUpload.blob,
        }
    );
    const payload = await safeReadJson(response);
    if (!response.ok || !payload?.ok) {
        throw new Error(
            resolveGarageWrapPresetApiErrorMessage(response.status, payload?.error, 'upload')
        );
    }
    return setGarageWrapPresetConfig(payload);
}

export async function createGarageWrapPresetImage(file) {
    validateGarageWrapPresetFile(file);
    const preparedUpload = await prepareGarageWrapPresetUpload(file);

    const response = await window.fetch(GARAGE_WRAP_PRESETS_API_PATH, {
        method: 'POST',
        cache: 'no-store',
        headers: {
            Accept: 'application/json',
            'Content-Type': preparedUpload.contentType,
            'X-Upload-Filename': encodeURIComponent(
                preparedUpload.fileName || file.name || 'garage-wrap-preset'
            ),
        },
        body: preparedUpload.blob,
    });
    const payload = await safeReadJson(response);
    if (!response.ok || !payload?.ok) {
        throw new Error(
            resolveGarageWrapPresetApiErrorMessage(response.status, payload?.error, 'create')
        );
    }
    return setGarageWrapPresetConfig(payload);
}

export async function removeGarageWrapPreset(presetId) {
    const normalizedPresetId = sanitizeGarageWrapPresetId(presetId);
    if (!normalizedPresetId) {
        throw new Error('Choose a valid preset slot first.');
    }

    const response = await window.fetch(
        `${GARAGE_WRAP_PRESETS_API_PATH}/${encodeURIComponent(normalizedPresetId)}`,
        {
            method: 'DELETE',
            cache: 'no-store',
            headers: {
                Accept: 'application/json',
            },
        }
    );
    const payload = await safeReadJson(response);
    if (!response.ok || !payload?.ok) {
        throw new Error(
            resolveGarageWrapPresetApiErrorMessage(response.status, payload?.error, 'remove')
        );
    }
    return setGarageWrapPresetConfig(payload);
}

function setGarageWrapPresetConfig(payload = null) {
    const normalizedConfig = normalizeGarageWrapPresetConfig(payload);
    garageWrapPresetState.updatedAt = normalizedConfig.updatedAt;
    garageWrapPresetState.presets = normalizedConfig.presets;
    dispatchGarageWrapPresetUpdate();
    return getGarageWrapPresetEntries();
}

function dispatchGarageWrapPresetUpdate() {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
        return;
    }
    window.dispatchEvent(
        new CustomEvent(GARAGE_WRAP_PRESETS_UPDATED_EVENT, {
            detail: {
                updatedAt: garageWrapPresetState.updatedAt,
                presets: getGarageWrapPresetEntries(),
            },
        })
    );
}

function normalizeGarageWrapPresetConfig(payload = null) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const presets = Array.isArray(source.presets) ? source.presets : [];
    const normalizedPresets = [];
    const usedIds = new Set();

    for (let i = 0; i < presets.length; i += 1) {
        const normalizedPreset = normalizeGarageWrapPresetEntry(presets[i], usedIds);
        if (!normalizedPreset) {
            continue;
        }
        usedIds.add(normalizedPreset.id);
        normalizedPresets.push(normalizedPreset);
    }

    return {
        updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : '',
        presets: normalizedPresets.length
            ? normalizedPresets
            : DEFAULT_GARAGE_WRAP_PRESET_ENTRIES.slice(),
    };
}

function normalizeGarageWrapPresetEntry(entry = null, usedIds = new Set()) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const id = sanitizeGarageWrapPresetId(entry.id);
    const url = sanitizeGarageWrapPresetUrl(entry.url);
    if (!id || usedIds.has(id) || !url) {
        return null;
    }
    return Object.freeze({
        id,
        label: sanitizeGarageWrapPresetLabel(entry.label || id),
        url,
        source: entry.source === 'custom' ? 'custom' : 'default',
        hasCustomImage: Boolean(entry.hasCustomImage),
        canReset: Boolean(entry.canReset),
        canDelete: Boolean(entry.canDelete),
        updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
    });
}

function validateGarageWrapPresetFile(file) {
    if (!(file instanceof File)) {
        throw new Error('Choose an image file.');
    }
    const normalizedType = String(file.type || '')
        .trim()
        .toLowerCase();
    if (!normalizedType || !GARAGE_WRAP_PRESET_UPLOAD_ACCEPT.includes(normalizedType)) {
        throw new Error('Only JPG, PNG, and WebP images are supported.');
    }
    if (file.size <= 0) {
        throw new Error('Choose an image file.');
    }
    if (file.size > GARAGE_WRAP_PRESET_MAX_UPLOAD_BYTES) {
        throw new Error(
            `Garage wrap preset uploads must be ${Math.round(
                GARAGE_WRAP_PRESET_MAX_UPLOAD_BYTES / (1024 * 1024)
            )}MB or smaller.`
        );
    }
}

async function prepareGarageWrapPresetUpload(file) {
    const image = await loadImageFromFile(file);
    const canvas = document.createElement('canvas');
    canvas.width = GARAGE_WRAP_PRESET_OUTPUT_WIDTH_PX;
    canvas.height = GARAGE_WRAP_PRESET_OUTPUT_HEIGHT_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Could not prepare the selected wrap preset.');
    }

    const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1);
    const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scale = Math.min(
        1,
        GARAGE_WRAP_PRESET_OUTPUT_WIDTH_PX / Math.max(1, sourceWidth),
        GARAGE_WRAP_PRESET_OUTPUT_HEIGHT_PX / Math.max(1, sourceHeight)
    );
    const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
    const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
    if (canvas.width !== drawWidth || canvas.height !== drawHeight) {
        canvas.width = drawWidth;
        canvas.height = drawHeight;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
    }
    ctx.drawImage(image, 0, 0, drawWidth, drawHeight);

    const webpBlob = await canvasToBlob(canvas, 'image/webp', GARAGE_WRAP_PRESET_OUTPUT_QUALITY);
    const jpegBlob =
        webpBlob || (await canvasToBlob(canvas, 'image/jpeg', GARAGE_WRAP_PRESET_OUTPUT_QUALITY));
    if (!jpegBlob) {
        throw new Error('Could not encode the selected wrap preset.');
    }
    if (jpegBlob.size > GARAGE_WRAP_PRESET_MAX_UPLOAD_BYTES) {
        throw new Error(
            `Garage wrap preset uploads must be ${Math.round(
                GARAGE_WRAP_PRESET_MAX_UPLOAD_BYTES / (1024 * 1024)
            )}MB or smaller.`
        );
    }

    return {
        blob: jpegBlob,
        contentType: jpegBlob.type || 'image/jpeg',
        fileName: replaceGarageWrapPresetFileExtension(
            file?.name || 'garage-wrap-preset',
            jpegBlob.type === 'image/webp' ? '.webp' : '.jpg'
        ),
    };
}

function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('The selected file is not a valid image.'));
        };
        image.src = objectUrl;
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob || null), type, quality);
    });
}

function replaceGarageWrapPresetFileExtension(fileName, nextExtension) {
    const baseName =
        typeof fileName === 'string' && fileName.trim() ? fileName.trim() : 'garage-wrap-preset';
    return `${baseName.replace(/\.[^.]+$/u, '')}${nextExtension}`;
}

function sanitizeGarageWrapPresetId(value) {
    return typeof value === 'string'
        ? value
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, '')
              .slice(0, 48)
        : '';
}

function sanitizeGarageWrapPresetLabel(value) {
    const normalized = String(value || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 48);
    return normalized || 'Garage Wrap';
}

function sanitizeGarageWrapPresetUrl(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    if (!normalized) {
        return '';
    }
    try {
        const parsed = new URL(
            normalized,
            typeof window?.location?.origin === 'string' ? window.location.origin : undefined
        );
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return parsed.toString();
        }
        return '';
    } catch {
        return '';
    }
}

async function safeReadJson(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

function resolveGarageWrapPresetApiErrorMessage(statusCode, errorMessage, action = 'load') {
    if (typeof errorMessage === 'string' && errorMessage.trim()) {
        return errorMessage.trim();
    }
    if (statusCode === 403) {
        return 'Garage wrap preset admin access denied.';
    }
    if (action === 'upload') {
        return 'Could not update the garage wrap preset.';
    }
    if (action === 'create') {
        return 'Could not add the garage wrap preset.';
    }
    if (action === 'remove') {
        return 'Could not remove the garage wrap preset.';
    }
    return 'Could not load garage wrap presets.';
}

export { GARAGE_WRAP_PRESET_UPLOAD_ACCEPT };
