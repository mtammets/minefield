const BILLBOARD_CONTENT_API_PATH = '/api/billboard-content';
const IMAGE_UPLOAD_MAX_EDGE = 2048;
const IMAGE_UPLOAD_QUALITY = 0.9;
const MAX_VIDEO_UPLOAD_BYTES = 180 * 1024 * 1024;

export const BILLBOARD_CONTENT_GROUP_IDS = Object.freeze({
    widePosters: 'wide-posters',
    tallPosters: 'tall-posters',
    kioskTotems: 'kiosk-totems',
    cityVideoWall: 'city-video-wall',
    monumentVideoRing: 'monument-video-ring',
});

const BILLBOARD_CONTENT_GROUPS = Object.freeze([
    Object.freeze({
        id: BILLBOARD_CONTENT_GROUP_IDS.widePosters,
        label: 'Wide Poster Screens',
        description: 'Shared playlist for the large citywide landscape billboards.',
        mediaKind: 'image',
        accept: 'image/jpeg,image/png,image/webp',
        maxItems: 8,
        defaultLabels: Object.freeze(['Poster', 'Summer', 'Portrait']),
    }),
    Object.freeze({
        id: BILLBOARD_CONTENT_GROUP_IDS.tallPosters,
        label: 'Tall Poster Screens',
        description: 'Shared playlist for the vertical billboards on walls and poles.',
        mediaKind: 'image',
        accept: 'image/jpeg,image/png,image/webp',
        maxItems: 8,
        defaultLabels: Object.freeze(['Portrait', 'Summer', 'Poster']),
    }),
    Object.freeze({
        id: BILLBOARD_CONTENT_GROUP_IDS.kioskTotems,
        label: 'Totem Kiosks',
        description: 'Shared poster loop for every street kiosk display in the city.',
        mediaKind: 'image',
        accept: 'image/jpeg,image/png,image/webp',
        maxItems: 8,
        defaultLabels: Object.freeze(['Wizard Portrait', 'Title', 'Red Portrait']),
    }),
    Object.freeze({
        id: BILLBOARD_CONTENT_GROUP_IDS.cityVideoWall,
        label: 'City Video Wall',
        description: 'Video playlist for the tall animated LED facade near the main avenue.',
        mediaKind: 'video',
        accept: 'video/mp4,video/webm',
        maxItems: 6,
        defaultLabels: Object.freeze(['Lisett wall loop', 'Model loop', 'Model loop 2']),
    }),
    Object.freeze({
        id: BILLBOARD_CONTENT_GROUP_IDS.monumentVideoRing,
        label: 'Monument LED Ring',
        description: 'Shared video loop for all four monument screens in the central plaza.',
        mediaKind: 'video',
        accept: 'video/mp4,video/webm',
        maxItems: 6,
        defaultLabels: Object.freeze(['Monument DJ loop', 'DJ loop 2']),
    }),
]);

const groupDefinitionsById = new Map(BILLBOARD_CONTENT_GROUPS.map((group) => [group.id, group]));
const registeredEntriesByGroup = new Map();
const runtimePlaybackStateByGroup = new Map();
let accessTokenProvider = null;
const contentState = {
    initialized: false,
    initializationPromise: null,
    manifest: createEmptyManifest(),
    canEdit: false,
    editorStatusText: '',
    storageMode: 'local',
};

export function configureBillboardContentManager({ getAccessToken = null } = {}) {
    accessTokenProvider = typeof getAccessToken === 'function' ? getAccessToken : null;
}

export function getBillboardContentGroups() {
    return BILLBOARD_CONTENT_GROUPS.map((definition) => buildBillboardGroupSummary(definition));
}

export function setBillboardGroupPlaybackEnabled(groupId, enabled) {
    const definition = getBillboardGroupDefinition(groupId);
    if (!definition || definition.mediaKind !== 'video') {
        return definition ? buildBillboardGroupSummary(definition) : null;
    }

    runtimePlaybackStateByGroup.set(definition.id, enabled !== false);
    applyGroupRuntimeStateToEntries(definition.id);
    return buildBillboardGroupSummary(definition);
}

export function registerBillboardContentEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return;
    }

    const groupId = normalizeBillboardGroupId(entry.contentGroupId);
    if (!groupId || !groupDefinitionsById.has(groupId)) {
        return;
    }

    if (!registeredEntriesByGroup.has(groupId)) {
        registeredEntriesByGroup.set(groupId, new Set());
    }
    registeredEntriesByGroup.get(groupId).add(entry);

    applyGroupManifestToEntry(groupId, entry);
}

export async function initializeBillboardContentManager(options = {}) {
    const force = Boolean(options?.force);
    if (contentState.initializationPromise && !force) {
        return contentState.initializationPromise;
    }

    contentState.initializationPromise = (async () => {
        try {
            const response = await window.fetch(BILLBOARD_CONTENT_API_PATH, {
                method: 'GET',
                cache: 'no-store',
                credentials: 'same-origin',
                headers: buildBillboardRequestHeaders({
                    Accept: 'application/json',
                }),
            });
            if (!response.ok) {
                throw new Error(`Billboard content config request failed (${response.status}).`);
            }
            const payload = await response.json();
            contentState.manifest = normalizeBillboardManifest(payload?.manifest);
            contentState.canEdit = payload?.canEdit === true;
            contentState.editorStatusText =
                typeof payload?.editorStatusText === 'string'
                    ? payload.editorStatusText.trim()
                    : '';
            contentState.storageMode =
                typeof payload?.storageMode === 'string' && payload.storageMode.trim()
                    ? payload.storageMode.trim()
                    : 'local';
        } catch (error) {
            console.warn('Billboard content config could not be loaded. Using defaults.', error);
            if (!contentState.initialized || force) {
                contentState.manifest = createEmptyManifest();
            }
            contentState.canEdit = false;
            contentState.editorStatusText = '';
        }

        contentState.initialized = true;
        applyAllRegisteredGroupContent();
        return contentState.manifest;
    })();

    return contentState.initializationPromise;
}

export async function uploadBillboardGroupFiles(groupId, fileList) {
    const definition = getBillboardGroupDefinition(groupId);
    if (!definition) {
        throw new Error('Unknown billboard content group.');
    }

    const files = normalizeBillboardFileList(fileList);
    if (files.length === 0) {
        throw new Error('Select at least one file.');
    }
    if (files.length > definition.maxItems) {
        throw new Error(`This group accepts up to ${definition.maxItems} files.`);
    }

    const items = await Promise.all(
        files.map((file) => prepareBillboardUploadItem(file, definition))
    );

    const response = await window.fetch(
        `${BILLBOARD_CONTENT_API_PATH}/${encodeURIComponent(definition.id)}`,
        {
            method: 'POST',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: buildBillboardRequestHeaders({
                'Content-Type': 'application/json',
                Accept: 'application/json',
            }),
            body: JSON.stringify({
                mediaKind: definition.mediaKind,
                items,
            }),
        }
    );
    const payload = await safeReadJson(response);
    if (!response.ok || !payload?.ok) {
        throw new Error(resolveBillboardApiErrorMessage(response.status, payload?.error, 'upload'));
    }

    contentState.manifest = normalizeBillboardManifest(payload.manifest);
    if (payload?.canEdit === false) {
        contentState.canEdit = false;
    }
    applyAllRegisteredGroupContent();
    return buildBillboardGroupSummary(definition);
}

export async function resetBillboardGroupContent(groupId) {
    const definition = getBillboardGroupDefinition(groupId);
    if (!definition) {
        throw new Error('Unknown billboard content group.');
    }

    const response = await window.fetch(
        `${BILLBOARD_CONTENT_API_PATH}/${encodeURIComponent(definition.id)}`,
        {
            method: 'DELETE',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: buildBillboardRequestHeaders({
                Accept: 'application/json',
            }),
        }
    );
    const payload = await safeReadJson(response);
    if (!response.ok || !payload?.ok) {
        throw new Error(resolveBillboardApiErrorMessage(response.status, payload?.error, 'reset'));
    }

    contentState.manifest = normalizeBillboardManifest(payload.manifest);
    if (payload?.canEdit === false) {
        contentState.canEdit = false;
    }
    applyAllRegisteredGroupContent();
    return buildBillboardGroupSummary(definition);
}

export function getBillboardContentExtraImageUrls() {
    return collectBillboardContentUrls('image');
}

export function getBillboardContentExtraVideoUrls() {
    return collectBillboardContentUrls('video');
}

function applyAllRegisteredGroupContent() {
    for (const groupId of registeredEntriesByGroup.keys()) {
        applyGroupManifestToEntries(groupId);
    }
}

function applyGroupManifestToEntries(groupId) {
    const entries = registeredEntriesByGroup.get(groupId);
    if (!entries || entries.size === 0) {
        return;
    }
    entries.forEach((entry) => applyGroupManifestToEntry(groupId, entry));
}

function applyGroupRuntimeStateToEntries(groupId) {
    const entries = registeredEntriesByGroup.get(groupId);
    if (!entries || entries.size === 0) {
        return;
    }
    entries.forEach((entry) => applyGroupRuntimeStateToEntry(groupId, entry));
}

function applyGroupManifestToEntry(groupId, entry) {
    if (!entry || typeof entry.applyManagedContent !== 'function') {
        return;
    }
    const manifestGroup = contentState.manifest.groups[groupId] || null;
    const hasCustomItems = Array.isArray(manifestGroup?.items) && manifestGroup.items.length > 0;
    entry.applyManagedContent(hasCustomItems ? manifestGroup : null);
    applyGroupRuntimeStateToEntry(groupId, entry);
}

function applyGroupRuntimeStateToEntry(groupId, entry) {
    if (!entry || typeof entry.setPlaybackEnabled !== 'function') {
        return;
    }
    entry.setPlaybackEnabled(isBillboardGroupPlaybackEnabled(groupId));
}

function isBillboardGroupPlaybackEnabled(groupId) {
    const definition = getBillboardGroupDefinition(groupId);
    if (!definition || definition.mediaKind !== 'video') {
        return true;
    }
    return runtimePlaybackStateByGroup.get(definition.id) !== false;
}

function buildBillboardGroupSummary(definition) {
    const manifestGroup = contentState.manifest.groups[definition.id] || null;
    const screenCount = registeredEntriesByGroup.get(definition.id)?.size || 0;
    const customItems = Array.isArray(manifestGroup?.items) ? manifestGroup.items : [];
    const isCustom = customItems.length > 0;
    const activeItems = isCustom
        ? customItems.map((item, index) => ({
              id: item.id || `${definition.id}:${index}`,
              label: item.displayName || `Media ${index + 1}`,
              url: item.url || '',
          }))
        : definition.defaultLabels.map((label, index) => ({
              id: `${definition.id}:default:${index}`,
              label,
              url: '',
          }));

    return {
        ...definition,
        screenCount,
        isCustom,
        canEdit: contentState.canEdit,
        editorStatusText: contentState.editorStatusText,
        storageMode: contentState.storageMode,
        playbackEnabled:
            definition.mediaKind === 'video'
                ? isBillboardGroupPlaybackEnabled(definition.id)
                : true,
        updatedAt: manifestGroup?.updatedAt || null,
        items: activeItems,
        statusText: isCustom
            ? `${customItems.length} custom ${definition.mediaKind === 'video' ? 'video' : 'image'} file${customItems.length === 1 ? '' : 's'} active`
            : contentState.canEdit
              ? 'Using built-in default playlist'
              : contentState.editorStatusText || 'Using built-in default playlist',
    };
}

function collectBillboardContentUrls(mediaKind) {
    const urls = [];
    for (const group of Object.values(contentState.manifest.groups)) {
        if (group?.mediaKind !== mediaKind || !Array.isArray(group.items)) {
            continue;
        }
        for (let index = 0; index < group.items.length; index += 1) {
            const url = typeof group.items[index]?.url === 'string' ? group.items[index].url : '';
            if (url) {
                urls.push(url);
            }
        }
    }
    return urls;
}

function normalizeBillboardManifest(manifest) {
    const source = manifest && typeof manifest === 'object' ? manifest : {};
    const groups = {};

    for (const definition of BILLBOARD_CONTENT_GROUPS) {
        const value = source.groups?.[definition.id];
        if (!value || typeof value !== 'object') {
            continue;
        }

        const items = Array.isArray(value.items)
            ? value.items
                  .map((item) => normalizeBillboardManifestItem(item, definition.mediaKind))
                  .filter(Boolean)
            : [];

        if (!items.length) {
            continue;
        }

        groups[definition.id] = {
            groupId: definition.id,
            mediaKind: definition.mediaKind,
            updatedAt: normalizeTimestamp(value.updatedAt),
            items,
        };
    }

    return {
        updatedAt: normalizeTimestamp(source.updatedAt),
        groups,
    };
}

function normalizeBillboardManifestItem(item, mediaKind) {
    if (!item || typeof item !== 'object') {
        return null;
    }

    const url = typeof item.url === 'string' ? item.url.trim() : '';
    const mimeType = typeof item.mimeType === 'string' ? item.mimeType.trim().toLowerCase() : '';
    if (!url || !mimeType || !mimeType.startsWith(`${mediaKind}/`)) {
        return null;
    }

    return {
        id:
            typeof item.id === 'string' && item.id.trim()
                ? item.id.trim()
                : `${mediaKind}-${Date.now()}`,
        displayName:
            typeof item.displayName === 'string' && item.displayName.trim()
                ? item.displayName.trim()
                : 'Uploaded media',
        mimeType,
        url,
    };
}

function getBillboardGroupDefinition(groupId) {
    const normalizedGroupId = normalizeBillboardGroupId(groupId);
    return normalizedGroupId ? groupDefinitionsById.get(normalizedGroupId) || null : null;
}

function normalizeBillboardFileList(fileList) {
    if (!fileList) {
        return [];
    }
    if (Array.isArray(fileList)) {
        return fileList.filter(Boolean);
    }
    return Array.from(fileList).filter(Boolean);
}

function validateBillboardFile(file, definition) {
    const type = typeof file?.type === 'string' ? file.type.trim().toLowerCase() : '';
    if (!type || !type.startsWith(`${definition.mediaKind}/`)) {
        throw new Error(
            definition.mediaKind === 'video'
                ? 'Only MP4 or WebM videos are supported here.'
                : 'Only JPG, PNG, or WebP images are supported here.'
        );
    }
    if (
        definition.mediaKind === 'video' &&
        Math.max(0, Number(file?.size) || 0) > MAX_VIDEO_UPLOAD_BYTES
    ) {
        throw new Error(
            'Video is too large for the built-in uploader. Keep each video under 180 MB.'
        );
    }
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(`Could not read ${file?.name || 'file'}.`));
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(file);
    });
}

async function safeReadJson(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

function buildBillboardRequestHeaders(headers = {}) {
    const nextHeaders = headers && typeof headers === 'object' ? { ...headers } : {};
    const accessToken = resolveBillboardAccessToken();
    if (accessToken) {
        nextHeaders.Authorization = `Bearer ${accessToken}`;
    }
    return nextHeaders;
}

function resolveBillboardAccessToken() {
    if (typeof accessTokenProvider !== 'function') {
        return '';
    }
    const token = accessTokenProvider();
    return typeof token === 'string' ? token.trim() : '';
}

function normalizeBillboardGroupId(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeTimestamp(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        return null;
    }
    const time = Date.parse(normalized);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function createEmptyManifest() {
    return {
        updatedAt: null,
        groups: {},
    };
}

async function prepareBillboardUploadItem(file, definition) {
    validateBillboardFile(file, definition);
    if (definition.mediaKind === 'image') {
        return prepareBillboardImageUploadItem(file);
    }
    return {
        name: file.name || 'media',
        dataUrl: await readFileAsDataUrl(file),
    };
}

async function prepareBillboardImageUploadItem(file) {
    const bitmap = await createImageBitmap(file);
    try {
        const targetSize = resolveContainedSize(bitmap.width, bitmap.height, IMAGE_UPLOAD_MAX_EDGE);
        const canvas = document.createElement('canvas');
        canvas.width = targetSize.width;
        canvas.height = targetSize.height;
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) {
            throw new Error('Image conversion canvas is not available.');
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        const blob =
            (await canvasToBlob(canvas, 'image/webp', IMAGE_UPLOAD_QUALITY)) ||
            (await canvasToBlob(canvas, 'image/jpeg', IMAGE_UPLOAD_QUALITY));
        if (!blob) {
            throw new Error(`Could not optimize ${file?.name || 'image'}.`);
        }

        return {
            name: replaceFileExtension(
                file?.name || 'image',
                blob.type === 'image/jpeg' ? '.jpg' : '.webp'
            ),
            dataUrl: await readBlobAsDataUrl(blob),
        };
    } finally {
        bitmap.close?.();
    }
}

function resolveContainedSize(sourceWidth, sourceHeight, maxEdge) {
    const width = Math.max(1, Math.round(Number(sourceWidth) || 1));
    const height = Math.max(1, Math.round(Number(sourceHeight) || 1));
    const longestEdge = Math.max(width, height);
    if (longestEdge <= maxEdge) {
        return { width, height };
    }

    const scale = maxEdge / longestEdge;
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob || null), type, quality);
    });
}

function readBlobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not encode upload payload.'));
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(blob);
    });
}

function replaceFileExtension(fileName, nextExtension) {
    const baseName = typeof fileName === 'string' && fileName.trim() ? fileName.trim() : 'media';
    return `${baseName.replace(/\.[^.]+$/u, '')}${nextExtension}`;
}

function resolveBillboardApiErrorMessage(statusCode, serverMessage, action = 'upload') {
    if (statusCode === 404) {
        return 'Billboard CMS API is missing on the running server. Restart the local server and try again.';
    }
    if (statusCode === 413) {
        return action === 'upload'
            ? 'Selected files are too large for one upload. Use smaller images or shorter/lighter videos.'
            : 'Request payload is too large.';
    }
    if (statusCode === 403) {
        return serverMessage || 'Billboard editor access is denied for this server.';
    }
    return serverMessage || `Billboard ${action} failed.`;
}
