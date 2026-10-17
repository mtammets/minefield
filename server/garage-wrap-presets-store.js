const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { Client: PostgresClient } = require('pg');
const {
    createSupabaseServiceClient,
    sanitizeSupabaseStorageBucketName,
    sanitizeSupabaseUrl,
} = require('./supabase-config');

const GARAGE_WRAP_PRESETS_MANIFEST_VERSION = 1;
const GARAGE_WRAP_PRESET_MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const GARAGE_WRAP_PRESET_OUTPUT_FILE_EXTENSION = '.jpg';
const GARAGE_WRAP_PRESET_OUTPUT_MIME_TYPE = 'image/jpeg';
const GARAGE_WRAP_PRESET_TARGET_WIDTH = 2048;
const GARAGE_WRAP_PRESET_TARGET_HEIGHT = 1024;
const DEFAULT_SUPABASE_GARAGE_WRAP_PRESETS_BUCKET = 'garage-wrap-presets';
const GARAGE_WRAP_PRESETS_TABLE_NAME = 'garage_wrap_presets';
const GARAGE_WRAP_PRESET_SELECT_COLUMNS = [
    'preset_id',
    'source',
    'label',
    'file_name',
    'original_file_name',
    'uploaded_mime_type',
    'mime_type',
    'size_bytes',
    'width',
    'height',
    'revision',
    'storage_path',
    'created_at',
    'updated_at',
].join(',');
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
    transcodeImage = transcodeGarageWrapPresetImage,
    supabaseConfig = null,
    storageBucket = '',
    publicBaseUrl = '',
    supabaseClient: supabaseClientOverride,
} = {}) {
    if (!manifestFilePath || !uploadsDirectoryPath) {
        throw new Error('Garage wrap preset store requires manifest and uploads directory paths.');
    }

    const localStore = createLocalGarageWrapPresetStore({
        manifestFilePath,
        uploadsDirectoryPath,
        uploadsPublicBasePath,
    });
    const resolvedSupabaseConfig =
        supabaseConfig && typeof supabaseConfig === 'object' ? supabaseConfig : {};
    const hasSupabaseClientOverride = Object.prototype.hasOwnProperty.call(
        arguments[0] || {},
        'supabaseClient'
    );
    const supabaseClient = hasSupabaseClientOverride
        ? supabaseClientOverride
        : createSupabaseServiceClient(resolvedSupabaseConfig);
    const resolvedStorageBucket = sanitizeSupabaseStorageBucketName(
        storageBucket ||
            resolvedSupabaseConfig.garageWrapPresetsBucket ||
            DEFAULT_SUPABASE_GARAGE_WRAP_PRESETS_BUCKET
    );
    const resolvedPublicBaseUrl = sanitizeSupabaseUrl(
        publicBaseUrl || resolvedSupabaseConfig.url || ''
    );

    if (!supabaseClient || !resolvedStorageBucket || !resolvedPublicBaseUrl) {
        return {
            ...localStore,
            isConfigured() {
                return false;
            },
            getStorageMode() {
                return 'local';
            },
        };
    }

    let migrationPromise = null;

    return {
        isConfigured() {
            return true;
        },
        getStorageMode() {
            return 'supabase';
        },
        async readConfig() {
            await ensureRemoteStoreMigrated();
            return readRemoteGarageWrapPresetConfig({
                supabaseClient,
                storageBucket: resolvedStorageBucket,
                publicBaseUrl: resolvedPublicBaseUrl,
            });
        },
        async writePresetImage(presetId, payload = {}) {
            await ensureRemoteStoreMigrated();
            return writeRemoteGarageWrapPresetImage({
                supabaseClient,
                storageBucket: resolvedStorageBucket,
                publicBaseUrl: resolvedPublicBaseUrl,
                presetId,
                payload,
                transcodeImage,
            });
        },
        async createPresetImage(payload = {}) {
            await ensureRemoteStoreMigrated();
            return createRemoteGarageWrapPresetImage({
                supabaseClient,
                storageBucket: resolvedStorageBucket,
                publicBaseUrl: resolvedPublicBaseUrl,
                payload,
                transcodeImage,
            });
        },
        async removePreset(presetId) {
            await ensureRemoteStoreMigrated();
            return removeRemoteGarageWrapPreset({
                supabaseClient,
                storageBucket: resolvedStorageBucket,
                publicBaseUrl: resolvedPublicBaseUrl,
                presetId,
            });
        },
    };

    async function ensureRemoteStoreMigrated() {
        if (migrationPromise) {
            return migrationPromise;
        }

        migrationPromise = (async () => {
            const remoteRows = await readRemoteGarageWrapPresetRows(supabaseClient);
            if (remoteRows.length > 0) {
                return buildRemoteGarageWrapPresetClientConfig({
                    rows: remoteRows,
                    storageBucket: resolvedStorageBucket,
                    publicBaseUrl: resolvedPublicBaseUrl,
                });
            }

            const localManifest = await readGarageWrapPresetManifest(manifestFilePath);
            if (!hasLocalGarageWrapPresetOverrides(localManifest)) {
                return buildRemoteGarageWrapPresetClientConfig({
                    rows: [],
                    storageBucket: resolvedStorageBucket,
                    publicBaseUrl: resolvedPublicBaseUrl,
                });
            }

            await migrateLocalGarageWrapPresetsToRemoteStore({
                manifest: localManifest,
                uploadsDirectoryPath,
                supabaseClient,
                storageBucket: resolvedStorageBucket,
                transcodeImage,
            });

            return readRemoteGarageWrapPresetConfig({
                supabaseClient,
                storageBucket: resolvedStorageBucket,
                publicBaseUrl: resolvedPublicBaseUrl,
            });
        })();

        try {
            return await migrationPromise;
        } catch (error) {
            migrationPromise = null;
            throw error;
        }
    }
}

function createLocalGarageWrapPresetStore({
    manifestFilePath,
    uploadsDirectoryPath,
    uploadsPublicBasePath = '/uploads/garage-wrap-presets',
} = {}) {
    return {
        async readConfig() {
            const manifest = await readGarageWrapPresetManifest(manifestFilePath);
            return buildGarageWrapPresetClientConfig({
                manifest,
                uploadsPublicBasePath,
            });
        },
        async writePresetImage(presetId, payload = {}) {
            return writeLocalGarageWrapPresetImage({
                manifestFilePath,
                uploadsDirectoryPath,
                uploadsPublicBasePath,
                presetId,
                payload,
            });
        },
        async createPresetImage(payload = {}) {
            return createLocalGarageWrapPresetImage({
                manifestFilePath,
                uploadsDirectoryPath,
                uploadsPublicBasePath,
                payload,
            });
        },
        async removePreset(presetId) {
            return removeLocalGarageWrapPreset({
                manifestFilePath,
                uploadsDirectoryPath,
                uploadsPublicBasePath,
                presetId,
            });
        },
    };
}

async function writeLocalGarageWrapPresetImage({
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

async function createLocalGarageWrapPresetImage({
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

async function removeLocalGarageWrapPreset({
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

async function readRemoteGarageWrapPresetConfig({
    supabaseClient,
    storageBucket,
    publicBaseUrl,
}) {
    const rows = await readRemoteGarageWrapPresetRows(supabaseClient);
    return buildRemoteGarageWrapPresetClientConfig({
        rows,
        storageBucket,
        publicBaseUrl,
    });
}

async function writeRemoteGarageWrapPresetImage({
    supabaseClient,
    storageBucket,
    publicBaseUrl,
    presetId,
    payload = {},
    transcodeImage,
}) {
    const normalizedPresetId = sanitizeGarageWrapPresetId(presetId);
    if (!normalizedPresetId) {
        throw createGarageWrapPresetStoreError(400, 'Invalid garage wrap preset id.');
    }

    const defaultDefinition = getGarageWrapPresetDefinitionById(normalizedPresetId);
    const remoteRows = await readRemoteGarageWrapPresetRows(supabaseClient);
    const existingRow = remoteRows.find((row) => row.presetId === normalizedPresetId) || null;
    if (!defaultDefinition && !existingRow) {
        throw createGarageWrapPresetStoreError(404, 'Garage wrap preset not found.');
    }

    const upload = normalizeGarageWrapPresetUploadPayload(payload);
    const processedUpload = await convertGarageWrapPresetUpload({
        buffer: upload.buffer,
        mimeType: upload.mimeType,
        originalFileName: upload.originalFileName,
        transcodeImage,
    });
    const updatedAt = new Date().toISOString();
    const revision = createGarageWrapPresetStorageRevision(updatedAt);
    const label =
        defaultDefinition?.label ||
        existingRow?.label ||
        createGarageWrapPresetLabel(upload.originalFileName);
    const row = {
        preset_id: normalizedPresetId,
        source: defaultDefinition ? 'default' : 'custom',
        label,
        file_name: processedUpload.fileName,
        original_file_name: upload.originalFileName,
        uploaded_mime_type: upload.mimeType,
        mime_type: GARAGE_WRAP_PRESET_OUTPUT_MIME_TYPE,
        size_bytes: processedUpload.sizeBytes,
        width: processedUpload.width,
        height: processedUpload.height,
        revision,
        storage_path: buildGarageWrapPresetStoragePath(revision, processedUpload.fileName),
        created_at: existingRow?.createdAt || updatedAt,
        updated_at: updatedAt,
    };

    let uploadedStoragePath = '';
    try {
        await uploadGarageWrapPresetStorageObject({
            supabaseClient,
            storageBucket,
            storagePath: row.storage_path,
            buffer: processedUpload.buffer,
            contentType: GARAGE_WRAP_PRESET_OUTPUT_MIME_TYPE,
        });
        uploadedStoragePath = row.storage_path;
        await upsertGarageWrapPresetRow(supabaseClient, row);
        await deleteGarageWrapPresetStorageObjects({
            supabaseClient,
            storageBucket,
            storagePaths: [existingRow?.storagePath],
        });
    } catch (error) {
        if (uploadedStoragePath) {
            await deleteGarageWrapPresetStorageObjects({
                supabaseClient,
                storageBucket,
                storagePaths: [uploadedStoragePath],
            }).catch(() => {});
        }
        throw error;
    }

    return readRemoteGarageWrapPresetConfig({
        supabaseClient,
        storageBucket,
        publicBaseUrl,
    });
}

async function createRemoteGarageWrapPresetImage({
    supabaseClient,
    storageBucket,
    publicBaseUrl,
    payload = {},
    transcodeImage,
}) {
    const upload = normalizeGarageWrapPresetUploadPayload(payload);
    const processedUpload = await convertGarageWrapPresetUpload({
        buffer: upload.buffer,
        mimeType: upload.mimeType,
        originalFileName: upload.originalFileName,
        transcodeImage,
    });
    const remoteRows = await readRemoteGarageWrapPresetRows(supabaseClient);
    const presetId = createGarageWrapPresetCustomId({
        customPresets: remoteRows
            .filter((row) => !getGarageWrapPresetDefinitionById(row.presetId))
            .map((row) => ({ id: row.presetId })),
    });
    const updatedAt = new Date().toISOString();
    const revision = createGarageWrapPresetStorageRevision(updatedAt);
    const row = {
        preset_id: presetId,
        source: 'custom',
        label: createGarageWrapPresetLabel(upload.originalFileName),
        file_name: processedUpload.fileName,
        original_file_name: upload.originalFileName,
        uploaded_mime_type: upload.mimeType,
        mime_type: GARAGE_WRAP_PRESET_OUTPUT_MIME_TYPE,
        size_bytes: processedUpload.sizeBytes,
        width: processedUpload.width,
        height: processedUpload.height,
        revision,
        storage_path: buildGarageWrapPresetStoragePath(revision, processedUpload.fileName),
        created_at: updatedAt,
        updated_at: updatedAt,
    };

    let uploadedStoragePath = '';
    try {
        await uploadGarageWrapPresetStorageObject({
            supabaseClient,
            storageBucket,
            storagePath: row.storage_path,
            buffer: processedUpload.buffer,
            contentType: GARAGE_WRAP_PRESET_OUTPUT_MIME_TYPE,
        });
        uploadedStoragePath = row.storage_path;
        await upsertGarageWrapPresetRow(supabaseClient, row);
    } catch (error) {
        if (uploadedStoragePath) {
            await deleteGarageWrapPresetStorageObjects({
                supabaseClient,
                storageBucket,
                storagePaths: [uploadedStoragePath],
            }).catch(() => {});
        }
        throw error;
    }

    return readRemoteGarageWrapPresetConfig({
        supabaseClient,
        storageBucket,
        publicBaseUrl,
    });
}

async function removeRemoteGarageWrapPreset({
    supabaseClient,
    storageBucket,
    publicBaseUrl,
    presetId,
}) {
    const normalizedPresetId = sanitizeGarageWrapPresetId(presetId);
    if (!normalizedPresetId) {
        throw createGarageWrapPresetStoreError(400, 'Invalid garage wrap preset id.');
    }

    const existingRow = await readRemoteGarageWrapPresetRow(supabaseClient, normalizedPresetId);
    if (!existingRow) {
        return {
            removed: false,
            presets: (
                await readRemoteGarageWrapPresetConfig({
                    supabaseClient,
                    storageBucket,
                    publicBaseUrl,
                })
            ).presets,
        };
    }

    await deleteGarageWrapPresetRow(supabaseClient, normalizedPresetId);
    await deleteGarageWrapPresetStorageObjects({
        supabaseClient,
        storageBucket,
        storagePaths: [existingRow.storagePath],
    });

    const config = await readRemoteGarageWrapPresetConfig({
        supabaseClient,
        storageBucket,
        publicBaseUrl,
    });
    return {
        removed: true,
        presets: config.presets,
    };
}

async function migrateLocalGarageWrapPresetsToRemoteStore({
    manifest,
    uploadsDirectoryPath,
    supabaseClient,
    storageBucket,
    transcodeImage,
}) {
    const normalizedManifest = normalizeGarageWrapPresetManifest(manifest);
    const existingRows = await readRemoteGarageWrapPresetRows(supabaseClient);
    if (existingRows.length > 0) {
        return;
    }

    for (let index = 0; index < DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS.length; index += 1) {
        const definition = DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS[index];
        const override = normalizedManifest.overrides[definition.id] || null;
        if (!override?.fileName) {
            continue;
        }

        const localFilePath = path.join(uploadsDirectoryPath, override.fileName);
        const uploadBuffer = await readOptionalFile(localFilePath);
        if (!uploadBuffer) {
            continue;
        }

        const processedUpload = await convertGarageWrapPresetUpload({
            buffer: uploadBuffer,
            mimeType:
                sanitizeGarageWrapPresetMimeType(override.mimeType) ||
                resolveGarageWrapPresetMimeTypeFromFileName(override.fileName),
            originalFileName: override.originalFileName || override.fileName || definition.id,
            transcodeImage,
        });
        const updatedAt = override.updatedAt || normalizedManifest.updatedAt || new Date().toISOString();
        const revision = createGarageWrapPresetStorageRevision(updatedAt);
        const row = {
            preset_id: definition.id,
            source: 'default',
            label: definition.label,
            file_name: processedUpload.fileName,
            original_file_name: override.originalFileName || override.fileName || definition.id,
            uploaded_mime_type:
                sanitizeGarageWrapPresetMimeType(override.mimeType) ||
                resolveGarageWrapPresetMimeTypeFromFileName(override.fileName),
            mime_type: GARAGE_WRAP_PRESET_OUTPUT_MIME_TYPE,
            size_bytes: processedUpload.sizeBytes,
            width: processedUpload.width,
            height: processedUpload.height,
            revision,
            storage_path: buildGarageWrapPresetStoragePath(revision, processedUpload.fileName),
            created_at: updatedAt,
            updated_at: updatedAt,
        };
        await uploadGarageWrapPresetStorageObject({
            supabaseClient,
            storageBucket,
            storagePath: row.storage_path,
            buffer: processedUpload.buffer,
            contentType: GARAGE_WRAP_PRESET_OUTPUT_MIME_TYPE,
        });
        await upsertGarageWrapPresetRow(supabaseClient, row);
    }

    for (let index = 0; index < normalizedManifest.customPresets.length; index += 1) {
        const preset = normalizedManifest.customPresets[index];
        const localFilePath = path.join(uploadsDirectoryPath, preset.fileName);
        const uploadBuffer = await readOptionalFile(localFilePath);
        if (!uploadBuffer) {
            continue;
        }

        const processedUpload = await convertGarageWrapPresetUpload({
            buffer: uploadBuffer,
            mimeType:
                sanitizeGarageWrapPresetMimeType(preset.mimeType) ||
                resolveGarageWrapPresetMimeTypeFromFileName(preset.fileName),
            originalFileName: preset.originalFileName || preset.fileName || preset.id,
            transcodeImage,
        });
        const updatedAt = preset.updatedAt || normalizedManifest.updatedAt || new Date().toISOString();
        const createdAt = preset.createdAt || updatedAt;
        const revision = createGarageWrapPresetStorageRevision(updatedAt);
        const row = {
            preset_id: preset.id,
            source: 'custom',
            label: preset.label,
            file_name: processedUpload.fileName,
            original_file_name: preset.originalFileName || preset.fileName || preset.id,
            uploaded_mime_type:
                sanitizeGarageWrapPresetMimeType(preset.mimeType) ||
                resolveGarageWrapPresetMimeTypeFromFileName(preset.fileName),
            mime_type: GARAGE_WRAP_PRESET_OUTPUT_MIME_TYPE,
            size_bytes: processedUpload.sizeBytes,
            width: processedUpload.width,
            height: processedUpload.height,
            revision,
            storage_path: buildGarageWrapPresetStoragePath(revision, processedUpload.fileName),
            created_at: createdAt,
            updated_at: updatedAt,
        };
        await uploadGarageWrapPresetStorageObject({
            supabaseClient,
            storageBucket,
            storagePath: row.storage_path,
            buffer: processedUpload.buffer,
            contentType: GARAGE_WRAP_PRESET_OUTPUT_MIME_TYPE,
        });
        await upsertGarageWrapPresetRow(supabaseClient, row);
    }
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

function buildRemoteGarageWrapPresetClientConfig({ rows, storageBucket, publicBaseUrl }) {
    const normalizedRows = Array.isArray(rows)
        ? rows.map((row) => normalizeRemoteGarageWrapPresetRow(row)).filter(Boolean)
        : [];
    const rowMap = new Map(normalizedRows.map((row) => [row.presetId, row]));
    const presets = [];
    let latestUpdatedAt = '';

    for (let i = 0; i < DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS.length; i += 1) {
        const definition = DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS[i];
        const override = rowMap.get(definition.id) || null;
        if (override?.updatedAt && override.updatedAt > latestUpdatedAt) {
            latestUpdatedAt = override.updatedAt;
        }
        presets.push({
            id: definition.id,
            label: definition.label,
            url: override
                ? createSupabaseGarageWrapPresetPublicUrl({
                      publicBaseUrl,
                      storageBucket,
                      storagePath: override.storagePath,
                      revision: override.revision,
                  })
                : definition.defaultUrl,
            source: 'default',
            hasCustomImage: Boolean(override),
            canReset: Boolean(override),
            canDelete: false,
            updatedAt: override?.updatedAt || '',
        });
    }

    const customRows = normalizedRows
        .filter((row) => !getGarageWrapPresetDefinitionById(row.presetId))
        .sort(compareGarageWrapPresetRowsForDisplay);
    for (let index = 0; index < customRows.length; index += 1) {
        const row = customRows[index];
        if (row.updatedAt && row.updatedAt > latestUpdatedAt) {
            latestUpdatedAt = row.updatedAt;
        }
        presets.push({
            id: row.presetId,
            label: row.label,
            url: createSupabaseGarageWrapPresetPublicUrl({
                publicBaseUrl,
                storageBucket,
                storagePath: row.storagePath,
                revision: row.revision,
            }),
            source: 'custom',
            hasCustomImage: true,
            canReset: false,
            canDelete: true,
            updatedAt: row.updatedAt,
        });
    }

    return {
        updatedAt: latestUpdatedAt || null,
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

function normalizeRemoteGarageWrapPresetRow(value = null) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const presetId = sanitizeGarageWrapPresetId(value.preset_id || value.presetId);
    const storagePath = sanitizeSupabaseStorageObjectPath(value.storage_path || value.storagePath);
    const fileName = sanitizeStorageFileName(value.file_name || value.fileName);
    if (!presetId || !storagePath || !fileName) {
        return null;
    }

    const fallbackUpdatedAt = new Date().toISOString();
    const updatedAt =
        sanitizeGarageWrapPresetTimestamp(value.updated_at || value.updatedAt) || fallbackUpdatedAt;
    const createdAt =
        sanitizeGarageWrapPresetTimestamp(value.created_at || value.createdAt) || updatedAt;
    return {
        presetId,
        source: sanitizeGarageWrapPresetSource(
            value.source,
            getGarageWrapPresetDefinitionById(presetId) ? 'default' : 'custom'
        ),
        label: createGarageWrapPresetLabel(
            value.label || value.original_file_name || value.originalFileName || presetId
        ),
        fileName,
        originalFileName: sanitizeGarageWrapPresetOriginalFileName(
            value.original_file_name || value.originalFileName
        ),
        uploadedMimeType:
            sanitizeGarageWrapPresetMimeType(
                value.uploaded_mime_type || value.uploadedMimeType
            ) || resolveGarageWrapPresetMimeTypeFromFileName(value.file_name || value.fileName),
        mimeType:
            sanitizeGarageWrapPresetMimeType(value.mime_type || value.mimeType) ||
            GARAGE_WRAP_PRESET_OUTPUT_MIME_TYPE,
        sizeBytes: sanitizeGarageWrapPresetSizeBytes(value.size_bytes || value.sizeBytes),
        width: sanitizeGarageWrapPresetImageDimension(value.width),
        height: sanitizeGarageWrapPresetImageDimension(value.height),
        revision:
            sanitizeGarageWrapPresetRevision(value.revision) ||
            createGarageWrapPresetRevisionTag(updatedAt),
        storagePath,
        createdAt,
        updatedAt,
    };
}

function hasLocalGarageWrapPresetOverrides(manifest) {
    const normalizedManifest = normalizeGarageWrapPresetManifest(manifest);
    return (
        Object.keys(normalizedManifest.overrides).length > 0 ||
        normalizedManifest.customPresets.length > 0
    );
}

function getGarageWrapPresetDefinitionById(presetId = '') {
    const normalizedPresetId = sanitizeGarageWrapPresetId(presetId);
    return (
        DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS.find((preset) => preset.id === normalizedPresetId) ||
        null
    );
}

function compareGarageWrapPresetRowsForDisplay(left, right) {
    const leftCreatedAt = Date.parse(left?.createdAt || '') || 0;
    const rightCreatedAt = Date.parse(right?.createdAt || '') || 0;
    if (leftCreatedAt !== rightCreatedAt) {
        return leftCreatedAt - rightCreatedAt;
    }

    const leftUpdatedAt = Date.parse(left?.updatedAt || '') || 0;
    const rightUpdatedAt = Date.parse(right?.updatedAt || '') || 0;
    if (leftUpdatedAt !== rightUpdatedAt) {
        return leftUpdatedAt - rightUpdatedAt;
    }

    return String(left?.presetId || '').localeCompare(String(right?.presetId || ''));
}

async function readRemoteGarageWrapPresetRows(supabaseClient) {
    const { data, error } = await supabaseClient
        .from(GARAGE_WRAP_PRESETS_TABLE_NAME)
        .select(GARAGE_WRAP_PRESET_SELECT_COLUMNS)
        .order('created_at', { ascending: true })
        .order('preset_id', { ascending: true });

    if (error) {
        throw error;
    }

    return Array.isArray(data) ? data : [];
}

async function readRemoteGarageWrapPresetRow(supabaseClient, presetId) {
    const normalizedPresetId = sanitizeGarageWrapPresetId(presetId);
    if (!normalizedPresetId) {
        return null;
    }

    const { data, error } = await supabaseClient
        .from(GARAGE_WRAP_PRESETS_TABLE_NAME)
        .select(GARAGE_WRAP_PRESET_SELECT_COLUMNS)
        .eq('preset_id', normalizedPresetId)
        .maybeSingle();
    if (error) {
        throw error;
    }

    return normalizeRemoteGarageWrapPresetRow(data);
}

async function upsertGarageWrapPresetRow(supabaseClient, row) {
    const { error } = await supabaseClient
        .from(GARAGE_WRAP_PRESETS_TABLE_NAME)
        .upsert(row, { onConflict: 'preset_id' });
    if (error) {
        throw error;
    }
}

async function deleteGarageWrapPresetRow(supabaseClient, presetId) {
    const normalizedPresetId = sanitizeGarageWrapPresetId(presetId);
    if (!normalizedPresetId) {
        return;
    }

    const { error } = await supabaseClient
        .from(GARAGE_WRAP_PRESETS_TABLE_NAME)
        .delete()
        .eq('preset_id', normalizedPresetId);
    if (error) {
        throw error;
    }
}

async function uploadGarageWrapPresetStorageObject({
    supabaseClient,
    storageBucket,
    storagePath,
    buffer,
    contentType,
}) {
    const { error } = await supabaseClient.storage.from(storageBucket).upload(storagePath, buffer, {
        upsert: false,
        contentType,
        cacheControl: '3600',
    });
    if (error) {
        throw error;
    }
}

async function deleteGarageWrapPresetStorageObjects({
    supabaseClient,
    storageBucket,
    storagePaths = [],
}) {
    const safeStoragePaths = Array.isArray(storagePaths)
        ? storagePaths.map((storagePath) => sanitizeSupabaseStorageObjectPath(storagePath)).filter(Boolean)
        : [];
    if (safeStoragePaths.length === 0) {
        return;
    }

    const { error } = await supabaseClient.storage.from(storageBucket).remove(safeStoragePaths);
    if (error) {
        throw error;
    }
}

async function convertGarageWrapPresetUpload({
    buffer,
    mimeType,
    originalFileName,
    transcodeImage = transcodeGarageWrapPresetImage,
}) {
    const safeMimeType = sanitizeGarageWrapPresetMimeType(mimeType);
    const safeOriginalFileName = sanitizeGarageWrapPresetOriginalFileName(originalFileName);
    const inputExtension =
        GARAGE_WRAP_PRESET_ACCEPTED_UPLOAD_MIME_TYPES[safeMimeType] ||
        path.extname(safeOriginalFileName) ||
        '.img';
    const outputFileName = replaceGarageWrapPresetFileExtension(
        safeOriginalFileName,
        GARAGE_WRAP_PRESET_OUTPUT_FILE_EXTENSION
    );
    const tempDirectoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'garage-wrap-preset-'));
    const inputFilePath = path.join(tempDirectoryPath, `input${inputExtension}`);
    const outputFilePath = path.join(tempDirectoryPath, outputFileName);

    try {
        await fs.writeFile(inputFilePath, buffer);
        await transcodeImage({
            inputFilePath,
            outputFilePath,
            targetWidth: GARAGE_WRAP_PRESET_TARGET_WIDTH,
            targetHeight: GARAGE_WRAP_PRESET_TARGET_HEIGHT,
        });
        const outputBuffer = await fs.readFile(outputFilePath);
        const metadata = await probeGarageWrapPresetImage(outputFilePath);
        return {
            buffer: outputBuffer,
            fileName: outputFileName,
            sizeBytes: outputBuffer.length,
            width: metadata.width,
            height: metadata.height,
        };
    } finally {
        await fs.rm(tempDirectoryPath, { recursive: true, force: true }).catch(() => {});
    }
}

async function transcodeGarageWrapPresetImage({
    inputFilePath,
    outputFilePath,
    targetWidth = GARAGE_WRAP_PRESET_TARGET_WIDTH,
    targetHeight = GARAGE_WRAP_PRESET_TARGET_HEIGHT,
}) {
    const args = [
        '-y',
        '-i',
        inputFilePath,
        '-vf',
        [
            `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease:flags=lanczos`,
            'setsar=1',
        ].join(','),
        '-frames:v',
        '1',
        '-an',
        '-c:v',
        'mjpeg',
        '-q:v',
        '2',
        '-update',
        '1',
        outputFilePath,
    ];
    await runGarageWrapPresetFfmpeg(
        args,
        'Could not convert the uploaded image for garage wrap preset use.'
    );
}

async function probeGarageWrapPresetImage(filePath) {
    const payload = await runGarageWrapPresetProbe([
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'json',
        filePath,
    ]);
    const stream = Array.isArray(payload?.streams) ? payload.streams[0] || {} : {};
    return {
        width: sanitizeGarageWrapPresetImageDimension(stream?.width),
        height: sanitizeGarageWrapPresetImageDimension(stream?.height),
    };
}

async function runGarageWrapPresetFfmpeg(args, failureMessage) {
    await new Promise((resolve, reject) => {
        const ffmpegProcess = spawn('ffmpeg', args, {
            stdio: ['ignore', 'ignore', 'pipe'],
        });
        let stderr = '';

        ffmpegProcess.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
            if (stderr.length > 8000) {
                stderr = stderr.slice(-8000);
            }
        });
        ffmpegProcess.on('error', (error) => {
            if (error?.code === 'ENOENT') {
                reject(createGarageWrapPresetStoreError(500, 'ffmpeg is not installed on this server.'));
                return;
            }
            reject(error);
        });
        ffmpegProcess.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(
                createGarageWrapPresetStoreError(
                    400,
                    stderr.trim() ? failureMessage : 'Garage wrap preset conversion failed.'
                )
            );
        });
    });
}

async function runGarageWrapPresetProbe(args) {
    const stdout = await new Promise((resolve, reject) => {
        const ffprobeProcess = spawn('ffprobe', args, {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdoutText = '';
        let stderr = '';

        ffprobeProcess.stdout.on('data', (chunk) => {
            stdoutText += chunk.toString();
        });
        ffprobeProcess.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
            if (stderr.length > 8000) {
                stderr = stderr.slice(-8000);
            }
        });
        ffprobeProcess.on('error', (error) => {
            if (error?.code === 'ENOENT') {
                reject(createGarageWrapPresetStoreError(500, 'ffprobe is not installed on this server.'));
                return;
            }
            reject(error);
        });
        ffprobeProcess.on('close', (code) => {
            if (code === 0) {
                resolve(stdoutText);
                return;
            }
            reject(
                createGarageWrapPresetStoreError(
                    400,
                    stderr.trim() ? 'Could not inspect the converted garage wrap preset.' : 'Garage wrap preset inspection failed.'
                )
            );
        });
    });

    try {
        return JSON.parse(stdout || '{}');
    } catch {
        return {};
    }
}

async function readOptionalFile(filePath) {
    try {
        return await fs.readFile(filePath);
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
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

function sanitizeGarageWrapPresetSource(value, fallback = 'custom') {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return normalized === 'default' || normalized === 'custom' ? normalized : fallback;
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

function sanitizeGarageWrapPresetRevision(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized || normalized.length > 64) {
        return '';
    }
    return normalized.replace(/[^a-zA-Z0-9-]/g, '');
}

function sanitizeGarageWrapPresetImageDimension(value) {
    const numericValue = Math.round(Number(value) || 0);
    return numericValue > 0 ? numericValue : 0;
}

function sanitizeGarageWrapPresetSizeBytes(value) {
    const numericValue = Math.round(Number(value) || 0);
    return numericValue > 0 ? numericValue : 0;
}

function resolveGarageWrapPresetMimeTypeFromFileName(fileName = '') {
    const extension = path.extname(String(fileName || '')).trim().toLowerCase();
    switch (extension) {
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.webp':
            return 'image/webp';
        default:
            return '';
    }
}

function buildGarageWrapPresetUploadUrl(uploadsPublicBasePath, fileName, updatedAt = '') {
    const revision = createGarageWrapPresetRevisionTag(updatedAt);
    return `${uploadsPublicBasePath.replace(/\/+$/u, '')}/${fileName}${revision ? `?v=${revision}` : ''}`;
}

function createSupabaseGarageWrapPresetPublicUrl({
    publicBaseUrl,
    storageBucket,
    storagePath,
    revision,
}) {
    const safeBaseUrl = sanitizeSupabaseUrl(publicBaseUrl || '');
    const safeBucketName = sanitizeSupabaseStorageBucketName(storageBucket);
    const safeStoragePath = sanitizeSupabaseStorageObjectPath(storagePath);
    if (!safeBaseUrl || !safeBucketName || !safeStoragePath) {
        return '';
    }

    const encodedPath = safeStoragePath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
    const baseUrl = `${safeBaseUrl}/storage/v1/object/public/${encodeURIComponent(
        safeBucketName
    )}/${encodedPath}`;
    const safeRevision = sanitizeGarageWrapPresetRevision(revision);
    return safeRevision ? `${baseUrl}?v=${encodeURIComponent(safeRevision)}` : baseUrl;
}

function sanitizeSupabaseStorageObjectPath(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().replace(/^\/+|\/+$/g, '');
    if (!normalized || normalized.length > 512) {
        return '';
    }

    const segments = normalized.split('/');
    if (
        segments.some((segment) => {
            if (typeof segment !== 'string') {
                return true;
            }
            if (!segment || segment.length > 120) {
                return true;
            }
            if (segment === '.' || segment === '..') {
                return true;
            }
            return /[\\\u0000-\u001f\u007f]/u.test(segment);
        })
    ) {
        return '';
    }
    return normalized;
}

function createGarageWrapPresetRevisionTag(updatedAt = '') {
    return updatedAt ? updatedAt.replace(/[^\d]/g, '') : '';
}

function createGarageWrapPresetStorageRevision(updatedAt = '') {
    const revisionBase = createGarageWrapPresetRevisionTag(updatedAt) || Date.now().toString();
    return `${revisionBase}-${crypto.randomBytes(3).toString('hex')}`;
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

function replaceGarageWrapPresetFileExtension(fileName, nextExtension) {
    const baseName =
        typeof fileName === 'string' && fileName.trim() ? fileName.trim() : 'garage-wrap-preset';
    return sanitizeStorageFileName(`${baseName.replace(/\.[^.]+$/u, '')}${nextExtension}`);
}

function buildGarageWrapPresetStoragePath(revision, fileName = 'garage-wrap-preset.webp') {
    const safeRevision = sanitizeGarageWrapPresetRevision(revision);
    const safeFileName = sanitizeStorageFileName(fileName);
    const assetId = crypto.randomUUID();
    return ['garage-wrap-presets', safeRevision, assetId, safeFileName].filter(Boolean).join('/');
}

function sanitizeStorageFileName(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        return 'media';
    }
    return (
        path
            .basename(normalized)
            .replace(/[\u0000-\u001f\u007f]+/gu, '')
            .trim() || 'media'
    );
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

async function ensureGarageWrapPresetSchema({ connectionString } = {}) {
    if (!connectionString) {
        return {
            ok: false,
            reason: 'missing-connection-string',
        };
    }

    const client = new PostgresClient(resolvePostgresClientOptions(connectionString));
    await client.connect();

    try {
        await client.query(`
            create table if not exists public.${GARAGE_WRAP_PRESETS_TABLE_NAME} (
                preset_id text primary key,
                source text not null default 'custom',
                label text not null default '',
                file_name text not null default '',
                original_file_name text not null default '',
                uploaded_mime_type text not null default '',
                mime_type text not null default '${GARAGE_WRAP_PRESET_OUTPUT_MIME_TYPE}',
                size_bytes bigint not null default 0 check (size_bytes >= 0),
                width integer not null default 0 check (width >= 0),
                height integer not null default 0 check (height >= 0),
                revision text not null default '',
                storage_path text not null default '',
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now(),
                constraint garage_wrap_presets_preset_id_check check (preset_id <> ''),
                constraint garage_wrap_presets_source_check check (source in ('default', 'custom'))
            );

            alter table public.${GARAGE_WRAP_PRESETS_TABLE_NAME} enable row level security;

            grant select on table public.${GARAGE_WRAP_PRESETS_TABLE_NAME} to anon, authenticated;

            do $$
            begin
                if not exists (
                    select 1
                    from pg_policies
                    where schemaname = 'public'
                        and tablename = '${GARAGE_WRAP_PRESETS_TABLE_NAME}'
                        and policyname = 'garage_wrap_presets_select_public'
                ) then
                    create policy garage_wrap_presets_select_public
                        on public.${GARAGE_WRAP_PRESETS_TABLE_NAME}
                        for select
                        using (true);
                end if;
            end
            $$;
        `);

        return {
            ok: true,
        };
    } finally {
        await client.end();
    }
}

function resolvePostgresClientOptions(connectionString) {
    return {
        connectionString,
        ssl: shouldUsePostgresSsl(connectionString)
            ? {
                  rejectUnauthorized: false,
              }
            : undefined,
    };
}

function shouldUsePostgresSsl(connectionString) {
    const normalized = typeof connectionString === 'string' ? connectionString.trim() : '';
    return /^postgres(?:ql)?:\/\//iu.test(normalized) && !/sslmode=disable/iu.test(normalized);
}

module.exports = {
    DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS,
    GARAGE_WRAP_PRESET_MAX_UPLOAD_BYTES,
    GARAGE_WRAP_PRESET_OUTPUT_MIME_TYPE,
    GARAGE_WRAP_PRESET_TARGET_HEIGHT,
    GARAGE_WRAP_PRESET_TARGET_WIDTH,
    createGarageWrapPresetStore,
    createGarageWrapPresetStoreError,
    ensureGarageWrapPresetSchema,
};
