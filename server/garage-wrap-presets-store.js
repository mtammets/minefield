const fs = require('fs/promises');
const path = require('path');

const GARAGE_WRAP_PRESETS_MANIFEST_VERSION = 1;
const GARAGE_WRAP_PRESET_MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const GARAGE_WRAP_PRESET_ACCEPTED_UPLOAD_MIME_TYPES = Object.freeze({
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
});

const DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS = Object.freeze([
    Object.freeze({
        id: 'skin-1',
        label: 'Preset Skin 1',
        defaultUrl: '/assets/skins/skin1.png',
    }),
    Object.freeze({
        id: 'skin-2',
        label: 'Preset Skin 2',
        defaultUrl: '/assets/skins/skin2.png',
    }),
    Object.freeze({
        id: 'skin-3',
        label: 'Preset Skin 3',
        defaultUrl: '/assets/skins/skin3.png',
    }),
    Object.freeze({
        id: 'skin-4',
        label: 'Preset Skin 4',
        defaultUrl: '/assets/skins/skin4.png',
    }),
]);

function createGarageWrapPresetStore({
    manifestFilePath,
    uploadsDirectoryPath,
    uploadsPublicBasePath = '/uploads/garage-wrap-presets',
} = {}) {
    if (!manifestFilePath || !uploadsDirectoryPath) {
        throw new Error('Garage wrap preset store requires manifest and uploads directory paths.');
    }

    return {
        async readConfig() {
            const manifest = await readGarageWrapPresetManifest(manifestFilePath);
            return buildGarageWrapPresetClientConfig({
                manifest,
                uploadsPublicBasePath,
            });
        },
        async writePresetImage(presetId, payload = {}) {
            return writeGarageWrapPresetImage({
                manifestFilePath,
                uploadsDirectoryPath,
                uploadsPublicBasePath,
                presetId,
                payload,
            });
        },
        async createPresetImage(payload = {}) {
            return createGarageWrapPresetImage({
                manifestFilePath,
                uploadsDirectoryPath,
                uploadsPublicBasePath,
                payload,
            });
        },
        async removePreset(presetId) {
            return removeGarageWrapPreset({
                manifestFilePath,
                uploadsDirectoryPath,
                uploadsPublicBasePath,
                presetId,
            });
        },
    };
}

async function writeGarageWrapPresetImage({
    manifestFilePath,
    uploadsDirectoryPath,
    uploadsPublicBasePath,
    presetId,
    payload = {},
}) {
    const normalizedPresetId = sanitizeGarageWrapPresetId(presetId);
    if (!normalizedPresetId) {
        throw createGarageWrapPresetStoreError(400, 'Invalid garage wrap preset id.');
    }

    const upload = normalizeGarageWrapPresetUploadPayload(payload);
    const manifest = await readGarageWrapPresetManifest(manifestFilePath);
    const existingDefaultPreset = DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS.find(
        (preset) => preset.id === normalizedPresetId
    );
    const existingCustomPresetIndex = manifest.customPresets.findIndex(
        (preset) => preset.id === normalizedPresetId
    );
    if (!existingDefaultPreset && existingCustomPresetIndex < 0) {
        throw createGarageWrapPresetStoreError(404, 'Garage wrap preset not found.');
    }

    await fs.mkdir(uploadsDirectoryPath, { recursive: true });
    const updatedAt = new Date().toISOString();
    const extension = GARAGE_WRAP_PRESET_ACCEPTED_UPLOAD_MIME_TYPES[upload.mimeType] || '.webp';
    const fileName = `${normalizedPresetId}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}${extension}`;
    const filePath = path.join(uploadsDirectoryPath, fileName);
    await fs.writeFile(filePath, upload.buffer);

    if (existingDefaultPreset) {
        const previousOverride = manifest.overrides[normalizedPresetId] || null;
        manifest.overrides[normalizedPresetId] = {
            fileName,
            originalFileName: upload.originalFileName,
            mimeType: upload.mimeType,
            updatedAt,
        };
        manifest.updatedAt = updatedAt;
        await removeStoredGarageWrapPresetFile(
            uploadsDirectoryPath,
            previousOverride?.fileName,
            fileName
        );
    } else {
        const previousPreset = manifest.customPresets[existingCustomPresetIndex] || null;
        manifest.customPresets.splice(existingCustomPresetIndex, 1, {
            id: normalizedPresetId,
            label: previousPreset?.label || createGarageWrapPresetLabel(upload.originalFileName),
            fileName,
            originalFileName: upload.originalFileName,
            mimeType: upload.mimeType,
            createdAt: previousPreset?.createdAt || updatedAt,
            updatedAt,
        });
        manifest.updatedAt = updatedAt;
        await removeStoredGarageWrapPresetFile(
            uploadsDirectoryPath,
            previousPreset?.fileName,
            fileName
        );
    }

    await writeGarageWrapPresetManifest(manifestFilePath, manifest);
    return buildGarageWrapPresetClientConfig({
        manifest,
        uploadsPublicBasePath,
    });
}

async function createGarageWrapPresetImage({
    manifestFilePath,
    uploadsDirectoryPath,
    uploadsPublicBasePath,
    payload = {},
}) {
    const upload = normalizeGarageWrapPresetUploadPayload(payload);
    const manifest = await readGarageWrapPresetManifest(manifestFilePath);
    const updatedAt = new Date().toISOString();
    const extension = GARAGE_WRAP_PRESET_ACCEPTED_UPLOAD_MIME_TYPES[upload.mimeType] || '.webp';
    const presetId = createGarageWrapPresetCustomId(manifest);
    const fileName = `${presetId}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}${extension}`;

    await fs.mkdir(uploadsDirectoryPath, { recursive: true });
    await fs.writeFile(path.join(uploadsDirectoryPath, fileName), upload.buffer);

    manifest.customPresets.push({
        id: presetId,
        label: createGarageWrapPresetLabel(upload.originalFileName),
        fileName,
        originalFileName: upload.originalFileName,
        mimeType: upload.mimeType,
        createdAt: updatedAt,
        updatedAt,
    });
    manifest.updatedAt = updatedAt;

    await writeGarageWrapPresetManifest(manifestFilePath, manifest);
    return buildGarageWrapPresetClientConfig({
        manifest,
        uploadsPublicBasePath,
    });
}

async function removeGarageWrapPreset({
    manifestFilePath,
    uploadsDirectoryPath,
    uploadsPublicBasePath,
    presetId,
}) {
    const normalizedPresetId = sanitizeGarageWrapPresetId(presetId);
    if (!normalizedPresetId) {
        throw createGarageWrapPresetStoreError(400, 'Invalid garage wrap preset id.');
    }

    const manifest = await readGarageWrapPresetManifest(manifestFilePath);
    const updatedAt = new Date().toISOString();
    const defaultPreset = DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS.find(
        (preset) => preset.id === normalizedPresetId
    );

    if (defaultPreset) {
        const previousOverride = manifest.overrides[normalizedPresetId] || null;
        if (!previousOverride) {
            return {
                removed: false,
                presets: buildGarageWrapPresetClientConfig({
                    manifest,
                    uploadsPublicBasePath,
                }).presets,
            };
        }
        delete manifest.overrides[normalizedPresetId];
        manifest.updatedAt = updatedAt;
        await removeStoredGarageWrapPresetFile(uploadsDirectoryPath, previousOverride.fileName);
        await writeGarageWrapPresetManifest(manifestFilePath, manifest);
        return {
            removed: true,
            presets: buildGarageWrapPresetClientConfig({
                manifest,
                uploadsPublicBasePath,
            }).presets,
        };
    }

    const presetIndex = manifest.customPresets.findIndex(
        (preset) => preset.id === normalizedPresetId
    );
    if (presetIndex < 0) {
        return {
            removed: false,
            presets: buildGarageWrapPresetClientConfig({
                manifest,
                uploadsPublicBasePath,
            }).presets,
        };
    }

    const [removedPreset] = manifest.customPresets.splice(presetIndex, 1);
    manifest.updatedAt = updatedAt;
    await removeStoredGarageWrapPresetFile(uploadsDirectoryPath, removedPreset?.fileName);
    await writeGarageWrapPresetManifest(manifestFilePath, manifest);
    return {
        removed: true,
        presets: buildGarageWrapPresetClientConfig({
            manifest,
            uploadsPublicBasePath,
        }).presets,
    };
}

async function readGarageWrapPresetManifest(manifestFilePath) {
    try {
        const raw = await fs.readFile(manifestFilePath, 'utf8');
        return normalizeGarageWrapPresetManifest(JSON.parse(raw));
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return createEmptyGarageWrapPresetManifest();
        }
        throw error;
    }
}

async function writeGarageWrapPresetManifest(manifestFilePath, manifest) {
    const normalizedManifest = normalizeGarageWrapPresetManifest(manifest);
    await fs.mkdir(path.dirname(manifestFilePath), { recursive: true });
    await fs.writeFile(
        manifestFilePath,
        `${JSON.stringify(normalizedManifest, null, 2)}\n`,
        'utf8'
    );
}

function createEmptyGarageWrapPresetManifest() {
    return {
        version: GARAGE_WRAP_PRESETS_MANIFEST_VERSION,
        updatedAt: null,
        overrides: {},
        customPresets: [],
    };
}

function normalizeGarageWrapPresetManifest(manifest = null) {
    const source = manifest && typeof manifest === 'object' ? manifest : {};
    const normalizedOverrides = {};
    const rawOverrides =
        source.overrides && typeof source.overrides === 'object' ? source.overrides : {};
    for (const preset of DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS) {
        const normalizedOverride = normalizeGarageWrapPresetStoredImage(rawOverrides[preset.id]);
        if (normalizedOverride) {
            normalizedOverrides[preset.id] = normalizedOverride;
        }
    }
    const usedIds = new Set(DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS.map((preset) => preset.id));
    const normalizedCustomPresets = [];
    const sourceCustomPresets = Array.isArray(source.customPresets) ? source.customPresets : [];
    for (let i = 0; i < sourceCustomPresets.length; i += 1) {
        const normalizedPreset = normalizeGarageWrapPresetCustomEntry(
            sourceCustomPresets[i],
            usedIds
        );
        if (!normalizedPreset) {
            continue;
        }
        usedIds.add(normalizedPreset.id);
        normalizedCustomPresets.push(normalizedPreset);
    }
    return {
        version: GARAGE_WRAP_PRESETS_MANIFEST_VERSION,
        updatedAt: sanitizeGarageWrapPresetTimestamp(source.updatedAt),
        overrides: normalizedOverrides,
        customPresets: normalizedCustomPresets,
    };
}

function buildGarageWrapPresetClientConfig({ manifest, uploadsPublicBasePath }) {
    const normalizedManifest = normalizeGarageWrapPresetManifest(manifest);
    const presets = [];

    for (let i = 0; i < DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS.length; i += 1) {
        const definition = DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS[i];
        const override = normalizedManifest.overrides[definition.id] || null;
        presets.push({
            id: definition.id,
            label: definition.label,
            url: override
                ? buildGarageWrapPresetUploadUrl(
                      uploadsPublicBasePath,
                      override.fileName,
                      override.updatedAt
                  )
                : definition.defaultUrl,
            source: 'default',
            hasCustomImage: Boolean(override),
            canReset: Boolean(override),
            canDelete: false,
            updatedAt: override?.updatedAt || normalizedManifest.updatedAt || '',
        });
    }

    for (let i = 0; i < normalizedManifest.customPresets.length; i += 1) {
        const preset = normalizedManifest.customPresets[i];
        presets.push({
            id: preset.id,
            label: preset.label,
            url: buildGarageWrapPresetUploadUrl(
                uploadsPublicBasePath,
                preset.fileName,
                preset.updatedAt
            ),
            source: 'custom',
            hasCustomImage: true,
            canReset: false,
            canDelete: true,
            updatedAt: preset.updatedAt,
        });
    }

    return {
        updatedAt: normalizedManifest.updatedAt,
        presets,
    };
}

function normalizeGarageWrapPresetUploadPayload(payload = {}) {
    const buffer = Buffer.isBuffer(payload.buffer) ? payload.buffer : Buffer.alloc(0);
    const mimeType = sanitizeGarageWrapPresetMimeType(payload.mimeType);
    const originalFileName = sanitizeGarageWrapPresetOriginalFileName(payload.originalFileName);

    if (!mimeType) {
        throw createGarageWrapPresetStoreError(
            415,
            'Only JPG, PNG, and WebP images are supported.'
        );
    }
    if (buffer.length <= 0) {
        throw createGarageWrapPresetStoreError(400, 'Select an image file to upload.');
    }
    if (buffer.length > GARAGE_WRAP_PRESET_MAX_UPLOAD_BYTES) {
        throw createGarageWrapPresetStoreError(
            413,
            `Garage wrap preset uploads must be ${Math.round(
                GARAGE_WRAP_PRESET_MAX_UPLOAD_BYTES / (1024 * 1024)
            )}MB or smaller.`
        );
    }

    return {
        buffer,
        mimeType,
        originalFileName,
    };
}

function normalizeGarageWrapPresetStoredImage(value = null) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const fileName = sanitizeGarageWrapPresetStoredFileName(value.fileName);
    if (!fileName) {
        return null;
    }
    return {
        fileName,
        originalFileName: sanitizeGarageWrapPresetOriginalFileName(value.originalFileName),
        mimeType: sanitizeGarageWrapPresetMimeType(value.mimeType),
        updatedAt: sanitizeGarageWrapPresetTimestamp(value.updatedAt) || new Date().toISOString(),
    };
}

function normalizeGarageWrapPresetCustomEntry(value = null, usedIds = new Set()) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const id = sanitizeGarageWrapPresetId(value.id);
    const fileName = sanitizeGarageWrapPresetStoredFileName(value.fileName);
    if (!id || usedIds.has(id) || !fileName) {
        return null;
    }
    return {
        id,
        label: createGarageWrapPresetLabel(value.label || value.originalFileName || id),
        fileName,
        originalFileName: sanitizeGarageWrapPresetOriginalFileName(value.originalFileName),
        mimeType: sanitizeGarageWrapPresetMimeType(value.mimeType),
        createdAt: sanitizeGarageWrapPresetTimestamp(value.createdAt) || new Date().toISOString(),
        updatedAt: sanitizeGarageWrapPresetTimestamp(value.updatedAt) || new Date().toISOString(),
    };
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

function sanitizeGarageWrapPresetMimeType(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase();
    return GARAGE_WRAP_PRESET_ACCEPTED_UPLOAD_MIME_TYPES[normalized] ? normalized : '';
}

function sanitizeGarageWrapPresetOriginalFileName(value) {
    const baseName = path.basename(String(value || '').trim()) || 'garage-wrap-preset';
    return (
        baseName
            .replace(/[^\w.\- ]+/g, '')
            .trim()
            .slice(0, 120) || 'garage-wrap-preset'
    );
}

function sanitizeGarageWrapPresetStoredFileName(value) {
    return String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9._-]/g, '')
        .slice(0, 160);
}

function sanitizeGarageWrapPresetTimestamp(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    if (!normalized) {
        return '';
    }
    const timestamp = Date.parse(normalized);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function buildGarageWrapPresetUploadUrl(uploadsPublicBasePath, fileName, updatedAt = '') {
    const revision = createGarageWrapPresetRevisionTag(updatedAt);
    return `${uploadsPublicBasePath.replace(/\/+$/u, '')}/${fileName}${revision ? `?v=${revision}` : ''}`;
}

function createGarageWrapPresetRevisionTag(updatedAt = '') {
    return updatedAt ? updatedAt.replace(/[^\d]/g, '') : '';
}

function createGarageWrapPresetLabel(value = '') {
    const base = String(value || '')
        .replace(/\.[a-z0-9]+$/iu, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 48);
    return base || 'Custom Garage Wrap';
}

function createGarageWrapPresetCustomId(manifest) {
    const usedIds = new Set(DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS.map((preset) => preset.id));
    const customPresets = Array.isArray(manifest?.customPresets) ? manifest.customPresets : [];
    for (let i = 0; i < customPresets.length; i += 1) {
        usedIds.add(customPresets[i].id);
    }
    let suffix = customPresets.length + 1;
    let nextId = `custom-wrap-${suffix}`;
    while (usedIds.has(nextId)) {
        suffix += 1;
        nextId = `custom-wrap-${suffix}`;
    }
    return nextId;
}

async function removeStoredGarageWrapPresetFile(
    uploadsDirectoryPath,
    previousFileName = '',
    nextFileName = ''
) {
    const safePreviousFileName = sanitizeGarageWrapPresetStoredFileName(previousFileName);
    const safeNextFileName = sanitizeGarageWrapPresetStoredFileName(nextFileName);
    if (!safePreviousFileName || safePreviousFileName === safeNextFileName) {
        return;
    }
    await fs.rm(path.join(uploadsDirectoryPath, safePreviousFileName), {
        force: true,
    });
}

function createGarageWrapPresetStoreError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

module.exports = {
    DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS,
    GARAGE_WRAP_PRESET_MAX_UPLOAD_BYTES,
    createGarageWrapPresetStore,
    createGarageWrapPresetStoreError,
};
