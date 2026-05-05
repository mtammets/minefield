const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const EMPTY_MANIFEST_VERSION = 1;
const MAX_FILES_PER_GROUP = 12;
const MAX_TOTAL_UPLOAD_BYTES = 380 * 1024 * 1024;

const IMAGE_MIME_TYPES = Object.freeze({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
});
const VIDEO_MIME_TYPES = Object.freeze({
    'video/mp4': 'mp4',
    'video/webm': 'webm',
});
const ALLOWED_MIME_TYPES = Object.freeze({
    ...IMAGE_MIME_TYPES,
    ...VIDEO_MIME_TYPES,
});

function createBillboardContentStore({
    manifestFilePath,
    uploadsDirectoryPath,
    uploadsPublicBasePath = '/uploads/billboards',
} = {}) {
    if (!manifestFilePath || !uploadsDirectoryPath) {
        throw new Error('Billboard content store requires manifest and uploads paths.');
    }

    return {
        async readManifest() {
            return readBillboardContentManifest(manifestFilePath);
        },
        async writeGroupMedia(groupId, payload = {}) {
            return writeBillboardGroupMedia({
                manifestFilePath,
                uploadsDirectoryPath,
                uploadsPublicBasePath,
                groupId,
                payload,
            });
        },
        async resetGroup(groupId) {
            return resetBillboardGroupMedia({
                manifestFilePath,
                uploadsDirectoryPath,
                groupId,
            });
        },
    };
}

async function readBillboardContentManifest(manifestFilePath) {
    try {
        const raw = await fs.readFile(manifestFilePath, 'utf8');
        return normalizeBillboardContentManifest(JSON.parse(raw));
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return createEmptyManifest();
        }
        throw error;
    }
}

async function writeBillboardGroupMedia({
    manifestFilePath,
    uploadsDirectoryPath,
    uploadsPublicBasePath,
    groupId,
    payload = {},
}) {
    const normalizedGroupId = sanitizeBillboardContentGroupId(groupId);
    if (!normalizedGroupId) {
        throw createBillboardStoreError(400, 'Invalid billboard group id.');
    }

    const mediaKind = resolveBillboardMediaKind(payload.mediaKind);
    if (!mediaKind) {
        throw createBillboardStoreError(400, 'Billboard media kind must be image or video.');
    }

    const normalizedFiles = normalizeBillboardUploadFiles(payload.items, mediaKind);
    if (normalizedFiles.length === 0) {
        throw createBillboardStoreError(400, 'At least one media file is required.');
    }

    const updatedAt = new Date().toISOString();
    const groupDirectoryPath = path.join(uploadsDirectoryPath, normalizedGroupId);
    const manifest = await readBillboardContentManifest(manifestFilePath);
    const revision = createBillboardRevisionTag(updatedAt);

    await fs.rm(groupDirectoryPath, { recursive: true, force: true });
    await fs.mkdir(groupDirectoryPath, { recursive: true });

    const items = [];
    for (let index = 0; index < normalizedFiles.length; index += 1) {
        const file = normalizedFiles[index];
        const extension = ALLOWED_MIME_TYPES[file.mimeType];
        const safeBaseName = sanitizeBillboardUploadFileName(
            file.name,
            `${mediaKind}-${String(index + 1).padStart(2, '0')}`
        );
        const diskFileName = `${String(index + 1).padStart(2, '0')}-${safeBaseName}.${extension}`;
        const absoluteFilePath = path.join(groupDirectoryPath, diskFileName);
        await fs.writeFile(absoluteFilePath, file.buffer);

        items.push({
            id: crypto.randomBytes(6).toString('hex'),
            displayName: file.displayName,
            fileName: diskFileName,
            mimeType: file.mimeType,
            sizeBytes: file.buffer.length,
            url: createBillboardPublicUrl(
                uploadsPublicBasePath,
                normalizedGroupId,
                diskFileName,
                revision
            ),
        });
    }

    manifest.groups[normalizedGroupId] = {
        groupId: normalizedGroupId,
        mediaKind,
        updatedAt,
        items,
    };
    manifest.updatedAt = updatedAt;

    await writeBillboardContentManifest(manifestFilePath, manifest);

    return {
        manifest,
        group: manifest.groups[normalizedGroupId],
    };
}

async function resetBillboardGroupMedia({ manifestFilePath, uploadsDirectoryPath, groupId }) {
    const normalizedGroupId = sanitizeBillboardContentGroupId(groupId);
    if (!normalizedGroupId) {
        throw createBillboardStoreError(400, 'Invalid billboard group id.');
    }

    const manifest = await readBillboardContentManifest(manifestFilePath);
    if (!manifest.groups[normalizedGroupId]) {
        return {
            manifest,
            removed: false,
        };
    }

    delete manifest.groups[normalizedGroupId];
    manifest.updatedAt = new Date().toISOString();
    await fs.rm(path.join(uploadsDirectoryPath, normalizedGroupId), {
        recursive: true,
        force: true,
    });
    await writeBillboardContentManifest(manifestFilePath, manifest);

    return {
        manifest,
        removed: true,
    };
}

async function writeBillboardContentManifest(manifestFilePath, manifest) {
    const normalizedManifest = normalizeBillboardContentManifest(manifest);
    await fs.mkdir(path.dirname(manifestFilePath), { recursive: true });
    await fs.writeFile(
        manifestFilePath,
        `${JSON.stringify(normalizedManifest, null, 2)}\n`,
        'utf8'
    );
}

function normalizeBillboardContentManifest(manifest) {
    const source = manifest && typeof manifest === 'object' ? manifest : {};
    const sourceGroups = source.groups && typeof source.groups === 'object' ? source.groups : {};
    const groups = {};

    for (const [rawGroupId, value] of Object.entries(sourceGroups)) {
        const groupId = sanitizeBillboardContentGroupId(rawGroupId || value?.groupId);
        if (!groupId || !value || typeof value !== 'object') {
            continue;
        }

        const mediaKind = resolveBillboardMediaKind(value.mediaKind);
        if (!mediaKind) {
            continue;
        }

        const items = Array.isArray(value.items)
            ? value.items.map((item) => normalizeBillboardManifestItem(item)).filter(Boolean)
            : [];

        groups[groupId] = {
            groupId,
            mediaKind,
            updatedAt: sanitizeBillboardManifestTimestamp(value.updatedAt),
            items,
        };
    }

    return {
        version: EMPTY_MANIFEST_VERSION,
        updatedAt: sanitizeBillboardManifestTimestamp(source.updatedAt),
        groups,
    };
}

function normalizeBillboardManifestItem(item) {
    if (!item || typeof item !== 'object') {
        return null;
    }

    const url = typeof item.url === 'string' ? item.url.trim() : '';
    const mimeType = typeof item.mimeType === 'string' ? item.mimeType.trim().toLowerCase() : '';
    if (!url || !ALLOWED_MIME_TYPES[mimeType]) {
        return null;
    }

    return {
        id:
            typeof item.id === 'string' && item.id.trim()
                ? item.id.trim()
                : crypto.randomBytes(6).toString('hex'),
        displayName:
            typeof item.displayName === 'string' && item.displayName.trim()
                ? item.displayName.trim()
                : 'Uploaded media',
        fileName:
            typeof item.fileName === 'string' && item.fileName.trim() ? item.fileName.trim() : '',
        mimeType,
        sizeBytes: Math.max(0, Math.round(Number(item.sizeBytes) || 0)),
        url,
    };
}

function normalizeBillboardUploadFiles(items, mediaKind) {
    if (!Array.isArray(items)) {
        throw createBillboardStoreError(400, 'Billboard media payload must be an array.');
    }
    if (items.length > MAX_FILES_PER_GROUP) {
        throw createBillboardStoreError(
            400,
            `Billboard group accepts up to ${MAX_FILES_PER_GROUP} files at once.`
        );
    }

    const allowedTypes = mediaKind === 'video' ? VIDEO_MIME_TYPES : IMAGE_MIME_TYPES;
    const files = [];
    let totalBytes = 0;

    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const parsed = parseBillboardDataUrlPayload(item?.dataUrl);
        if (!allowedTypes[parsed.mimeType]) {
            throw createBillboardStoreError(
                400,
                `Unsupported ${mediaKind} format: ${parsed.mimeType || 'unknown'}.`
            );
        }

        totalBytes += parsed.buffer.length;
        if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
            throw createBillboardStoreError(413, 'Billboard upload payload is too large.');
        }

        const originalName = typeof item?.name === 'string' ? item.name.trim() : '';
        files.push({
            name: originalName,
            displayName: originalName || `Media ${index + 1}`,
            mimeType: parsed.mimeType,
            buffer: parsed.buffer,
        });
    }

    return files;
}

function parseBillboardDataUrlPayload(dataUrl) {
    if (typeof dataUrl !== 'string' || dataUrl.trim().length === 0) {
        throw createBillboardStoreError(400, 'Billboard file payload is missing.');
    }

    const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/u.exec(dataUrl.trim());
    if (!match) {
        throw createBillboardStoreError(400, 'Billboard file payload must be a base64 data URL.');
    }

    const mimeType = match[1].trim().toLowerCase();
    if (!ALLOWED_MIME_TYPES[mimeType]) {
        throw createBillboardStoreError(400, `Unsupported billboard mime type: ${mimeType}.`);
    }

    let buffer = null;
    try {
        buffer = Buffer.from(match[2], 'base64');
    } catch {
        throw createBillboardStoreError(400, 'Billboard file payload is not valid base64.');
    }

    if (!buffer || buffer.length === 0) {
        throw createBillboardStoreError(400, 'Billboard file payload is empty.');
    }

    return {
        mimeType,
        buffer,
    };
}

function sanitizeBillboardContentGroupId(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!/^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/u.test(normalized)) {
        return '';
    }
    return normalized;
}

function sanitizeBillboardUploadFileName(value, fallback = 'media') {
    const candidate = typeof value === 'string' ? value.trim() : '';
    const basename = path.basename(candidate).replace(/\.[^.]+$/u, '');
    const ascii = basename.normalize('NFKD').replace(/[^\x00-\x7F]/g, '');
    const sanitized = ascii
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return sanitized || fallback;
}

function resolveBillboardMediaKind(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'image' || normalized === 'video') {
        return normalized;
    }
    return '';
}

function sanitizeBillboardManifestTimestamp(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        return null;
    }
    const timestamp = Date.parse(normalized);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function createBillboardPublicUrl(basePath, groupId, fileName, revision) {
    const safeBasePath = String(basePath || '/uploads/billboards').replace(/\/+$/u, '');
    const revisionQuery = revision ? `?v=${encodeURIComponent(revision)}` : '';
    return `${safeBasePath}/${groupId}/${fileName}${revisionQuery}`;
}

function createBillboardRevisionTag(updatedAt) {
    return updatedAt ? updatedAt.replace(/[^0-9]/g, '') : String(Date.now());
}

function createBillboardStoreError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function createEmptyManifest() {
    return {
        version: EMPTY_MANIFEST_VERSION,
        updatedAt: null,
        groups: {},
    };
}

module.exports = {
    createBillboardContentStore,
    createBillboardStoreError,
    normalizeBillboardContentManifest,
    parseBillboardDataUrlPayload,
    sanitizeBillboardContentGroupId,
    sanitizeBillboardUploadFileName,
};
