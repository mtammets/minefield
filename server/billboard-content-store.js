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

const EMPTY_MANIFEST_VERSION = 1;
const MAX_FILES_PER_GROUP = 12;
const MAX_TOTAL_UPLOAD_BYTES = 380 * 1024 * 1024;
const DEFAULT_BILLBOARD_MEDIA_BUCKET = 'billboard-media';
const BILLBOARD_IMAGE_OUTPUT_MIME_TYPE = 'image/webp';
const BILLBOARD_IMAGE_OUTPUT_EXTENSION = 'webp';
const BILLBOARD_IMAGE_MAX_EDGE = 2048;
const BILLBOARD_VIDEO_OUTPUT_MIME_TYPE = 'video/mp4';
const BILLBOARD_VIDEO_OUTPUT_EXTENSION = 'mp4';
const BILLBOARD_VIDEO_MAX_EDGE = 1920;
const BILLBOARD_VIDEO_TARGET_FRAME_RATE = 30;
const BILLBOARD_CONTENT_GROUP_TABLE_NAME = 'billboard_content_groups';
const BILLBOARD_CONTENT_ASSET_TABLE_NAME = 'billboard_content_assets';
const BILLBOARD_GROUP_SELECT_COLUMNS = ['group_id', 'media_kind', 'revision', 'updated_at'].join(
    ','
);
const BILLBOARD_ASSET_SELECT_COLUMNS = [
    'id',
    'group_id',
    'revision',
    'display_name',
    'file_name',
    'uploaded_mime_type',
    'mime_type',
    'size_bytes',
    'width',
    'height',
    'duration_ms',
    'storage_path',
    'sort_order',
    'created_at',
].join(',');

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
    supabaseConfig = null,
    storageBucket = '',
    publicBaseUrl = '',
    transcodeImage = transcodeBillboardImage,
    transcodeVideo = transcodeBillboardVideo,
    probeMedia = probeBillboardMedia,
} = {}) {
    if (!manifestFilePath || !uploadsDirectoryPath) {
        throw new Error('Billboard content store requires manifest and uploads paths.');
    }

    const localStore = createLocalBillboardContentStore({
        manifestFilePath,
        uploadsDirectoryPath,
        uploadsPublicBasePath,
    });
    const resolvedSupabaseConfig =
        supabaseConfig && typeof supabaseConfig === 'object' ? supabaseConfig : {};
    const supabaseClient = createSupabaseServiceClient(resolvedSupabaseConfig);
    const resolvedStorageBucket = sanitizeSupabaseStorageBucketName(
        storageBucket ||
            resolvedSupabaseConfig.billboardMediaBucket ||
            DEFAULT_BILLBOARD_MEDIA_BUCKET
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
        async readManifest() {
            await ensureRemoteStoreMigrated();
            return readRemoteBillboardContentManifest({
                supabaseClient,
                storageBucket: resolvedStorageBucket,
                publicBaseUrl: resolvedPublicBaseUrl,
            });
        },
        async writeGroupMedia(groupId, payload = {}, options = {}) {
            await ensureRemoteStoreMigrated();
            return writeRemoteBillboardGroupMedia({
                supabaseClient,
                storageBucket: resolvedStorageBucket,
                publicBaseUrl: resolvedPublicBaseUrl,
                groupId,
                payload,
                userId: options?.userId || '',
                transcodeImage,
                transcodeVideo,
                probeMedia,
            });
        },
        async reprocessGroups(groupIds = [], options = {}) {
            await ensureRemoteStoreMigrated();
            return reprocessRemoteBillboardGroups({
                supabaseClient,
                storageBucket: resolvedStorageBucket,
                publicBaseUrl: resolvedPublicBaseUrl,
                groupIds,
                userId: options?.userId || '',
                transcodeImage,
                transcodeVideo,
                probeMedia,
            });
        },
        async resetGroup(groupId) {
            await ensureRemoteStoreMigrated();
            return resetRemoteBillboardGroupMedia({
                supabaseClient,
                storageBucket: resolvedStorageBucket,
                publicBaseUrl: resolvedPublicBaseUrl,
                groupId,
            });
        },
    };

    async function ensureRemoteStoreMigrated() {
        if (migrationPromise) {
            return migrationPromise;
        }

        migrationPromise = (async () => {
            const remoteManifest = await readRemoteBillboardContentManifest({
                supabaseClient,
                storageBucket: resolvedStorageBucket,
                publicBaseUrl: resolvedPublicBaseUrl,
            });
            if (Object.keys(remoteManifest.groups).length > 0) {
                return remoteManifest;
            }

            const localManifest = await localStore.readManifest();
            if (Object.keys(localManifest.groups).length === 0) {
                return remoteManifest;
            }

            await migrateLocalBillboardManifestToRemoteStore({
                manifest: localManifest,
                uploadsDirectoryPath,
                supabaseClient,
                storageBucket: resolvedStorageBucket,
            });

            return readRemoteBillboardContentManifest({
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

function createLocalBillboardContentStore({
    manifestFilePath,
    uploadsDirectoryPath,
    uploadsPublicBasePath = '/uploads/billboards',
} = {}) {
    return {
        async readManifest() {
            return readBillboardContentManifest(manifestFilePath);
        },
        async writeGroupMedia(groupId, payload = {}) {
            return writeLocalBillboardGroupMedia({
                manifestFilePath,
                uploadsDirectoryPath,
                uploadsPublicBasePath,
                groupId,
                payload,
            });
        },
        async resetGroup(groupId) {
            return resetLocalBillboardGroupMedia({
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

async function writeLocalBillboardGroupMedia({
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

async function resetLocalBillboardGroupMedia({ manifestFilePath, uploadsDirectoryPath, groupId }) {
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

async function readRemoteBillboardContentManifest({
    supabaseClient,
    storageBucket,
    publicBaseUrl,
}) {
    const [groupRows, assetRows] = await Promise.all([
        readBillboardGroupRows(supabaseClient),
        readBillboardAssetRows(supabaseClient),
    ]);
    const assetsByGroupRevision = new Map();
    let latestUpdatedAt = null;

    for (let index = 0; index < assetRows.length; index += 1) {
        const row = assetRows[index];
        const normalizedGroupId = sanitizeBillboardContentGroupId(row?.group_id || '');
        const normalizedRevision = sanitizeBillboardRevision(row?.revision || '');
        if (!normalizedGroupId || !normalizedRevision) {
            continue;
        }
        const mapKey = `${normalizedGroupId}:${normalizedRevision}`;
        if (!assetsByGroupRevision.has(mapKey)) {
            assetsByGroupRevision.set(mapKey, []);
        }
        assetsByGroupRevision.get(mapKey).push(row);
    }

    const groups = {};
    for (let index = 0; index < groupRows.length; index += 1) {
        const row = groupRows[index];
        const normalizedGroupId = sanitizeBillboardContentGroupId(row?.group_id || '');
        const mediaKind = resolveBillboardMediaKind(row?.media_kind);
        const revision = sanitizeBillboardRevision(row?.revision || '');
        if (!normalizedGroupId || !mediaKind || !revision) {
            continue;
        }

        const updatedAt = sanitizeBillboardManifestTimestamp(row?.updated_at);
        const items = (assetsByGroupRevision.get(`${normalizedGroupId}:${revision}`) || [])
            .sort(compareBillboardAssetRows)
            .map((assetRow) =>
                normalizeBillboardManifestItem({
                    id: assetRow.id,
                    displayName: assetRow.display_name,
                    fileName: assetRow.file_name,
                    mimeType: assetRow.mime_type,
                    sizeBytes: assetRow.size_bytes,
                    url: createSupabaseBillboardPublicUrl({
                        publicBaseUrl,
                        storageBucket,
                        storagePath: assetRow.storage_path,
                        revision,
                    }),
                })
            )
            .filter(Boolean);

        if (!items.length) {
            continue;
        }

        groups[normalizedGroupId] = {
            groupId: normalizedGroupId,
            mediaKind,
            updatedAt,
            items,
        };
        if (!latestUpdatedAt || Date.parse(updatedAt || '') > Date.parse(latestUpdatedAt || '')) {
            latestUpdatedAt = updatedAt;
        }
    }

    return normalizeBillboardContentManifest({
        version: EMPTY_MANIFEST_VERSION,
        updatedAt: latestUpdatedAt,
        groups,
    });
}

async function writeRemoteBillboardGroupMedia({
    supabaseClient,
    storageBucket,
    publicBaseUrl,
    groupId,
    payload = {},
    userId = '',
    transcodeImage,
    transcodeVideo,
    probeMedia,
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

    return replaceRemoteBillboardGroupMedia({
        supabaseClient,
        storageBucket,
        publicBaseUrl,
        groupId: normalizedGroupId,
        mediaKind,
        files: normalizedFiles,
        userId,
        transcodeImage,
        transcodeVideo,
        probeMedia,
    });
}

async function replaceRemoteBillboardGroupMedia({
    supabaseClient,
    storageBucket,
    publicBaseUrl,
    groupId,
    mediaKind,
    files = [],
    userId = '',
    transcodeImage,
    transcodeVideo,
    probeMedia,
    existingGroupRow = null,
    updatedAtOverride = '',
}) {
    const normalizedGroupId = sanitizeBillboardContentGroupId(groupId);
    if (!normalizedGroupId) {
        throw createBillboardStoreError(400, 'Invalid billboard group id.');
    }
    const normalizedMediaKind = resolveBillboardMediaKind(mediaKind);
    if (!normalizedMediaKind) {
        throw createBillboardStoreError(400, 'Billboard media kind must be image or video.');
    }
    const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    if (normalizedFiles.length === 0) {
        throw createBillboardStoreError(400, 'At least one media file is required.');
    }
    if (normalizedFiles.length > MAX_FILES_PER_GROUP) {
        throw createBillboardStoreError(
            400,
            `Billboard group accepts up to ${MAX_FILES_PER_GROUP} files at once.`
        );
    }

    const updatedAt =
        sanitizeBillboardManifestTimestamp(updatedAtOverride) || new Date().toISOString();
    const nextRevision = createBillboardStorageRevision(updatedAt);
    const safeUserId = sanitizeBillboardActorId(userId);
    const uploadedStoragePaths = [];
    const insertedAssetIds = [];
    const previousGroupRow =
        existingGroupRow && typeof existingGroupRow === 'object'
            ? existingGroupRow
            : await readBillboardGroupRowById(supabaseClient, normalizedGroupId);

    try {
        const assetRows = [];
        for (let index = 0; index < normalizedFiles.length; index += 1) {
            const file = normalizedFiles[index];
            const processedAsset = await processBillboardUploadFile({
                file,
                mediaKind: normalizedMediaKind,
                index,
                groupId: normalizedGroupId,
                revision: nextRevision,
                transcodeImage,
                transcodeVideo,
                probeMedia,
            });

            await uploadBillboardStorageObject({
                supabaseClient,
                storageBucket,
                storagePath: processedAsset.storagePath,
                buffer: processedAsset.buffer,
                contentType: processedAsset.mimeType,
            });
            uploadedStoragePaths.push(processedAsset.storagePath);
            insertedAssetIds.push(processedAsset.id);
            assetRows.push(
                createBillboardAssetRowRecord(processedAsset, {
                    groupId: normalizedGroupId,
                    revision: nextRevision,
                    userId: safeUserId,
                })
            );
        }

        await insertBillboardAssetRows(supabaseClient, assetRows);
        await upsertBillboardGroupRow(supabaseClient, {
            group_id: normalizedGroupId,
            media_kind: normalizedMediaKind,
            revision: nextRevision,
            updated_at: updatedAt,
        });

        if (previousGroupRow?.revision && previousGroupRow.revision !== nextRevision) {
            await deleteBillboardGroupRevisionAssets({
                supabaseClient,
                storageBucket,
                groupId: normalizedGroupId,
                revision: previousGroupRow.revision,
            }).catch(() => {});
        }

        const manifest = await readRemoteBillboardContentManifest({
            supabaseClient,
            storageBucket,
            publicBaseUrl,
        });
        return {
            manifest,
            group: manifest.groups[normalizedGroupId],
        };
    } catch (error) {
        await deleteBillboardAssetRowsByIds(supabaseClient, insertedAssetIds).catch(() => {});
        await deleteBillboardStorageObjects({
            supabaseClient,
            storageBucket,
            storagePaths: uploadedStoragePaths,
        }).catch(() => {});
        throw normalizeBillboardProcessingError(error);
    }
}

async function reprocessRemoteBillboardGroups({
    supabaseClient,
    storageBucket,
    publicBaseUrl,
    groupIds = [],
    userId = '',
    transcodeImage,
    transcodeVideo,
    probeMedia,
}) {
    const manifest = await readRemoteBillboardContentManifest({
        supabaseClient,
        storageBucket,
        publicBaseUrl,
    });
    const targetGroupIds = resolveBillboardReprocessGroupIds(manifest, groupIds);
    if (targetGroupIds.length === 0) {
        return {
            manifest,
            processedGroupIds: [],
            skippedGroupIds: [],
        };
    }

    const processedGroupIds = [];
    const skippedGroupIds = [];
    let latestManifest = manifest;
    for (let index = 0; index < targetGroupIds.length; index += 1) {
        const groupId = targetGroupIds[index];
        const groupSource = await readRemoteBillboardGroupSourceFiles({
            supabaseClient,
            storageBucket,
            groupId,
        });
        if (!groupSource || !groupSource.mediaKind || groupSource.files.length === 0) {
            skippedGroupIds.push(groupId);
            continue;
        }

        const result = await replaceRemoteBillboardGroupMedia({
            supabaseClient,
            storageBucket,
            publicBaseUrl,
            groupId,
            mediaKind: groupSource.mediaKind,
            files: groupSource.files,
            userId,
            transcodeImage,
            transcodeVideo,
            probeMedia,
            existingGroupRow: groupSource.groupRow,
        });
        latestManifest = result.manifest;
        processedGroupIds.push(groupId);
    }

    return {
        manifest: latestManifest,
        processedGroupIds,
        skippedGroupIds,
    };
}

async function resetRemoteBillboardGroupMedia({
    supabaseClient,
    storageBucket,
    publicBaseUrl,
    groupId,
}) {
    const normalizedGroupId = sanitizeBillboardContentGroupId(groupId);
    if (!normalizedGroupId) {
        throw createBillboardStoreError(400, 'Invalid billboard group id.');
    }

    const existingGroupRow = await readBillboardGroupRowById(supabaseClient, normalizedGroupId);
    if (!existingGroupRow?.revision) {
        const manifest = await readRemoteBillboardContentManifest({
            supabaseClient,
            storageBucket,
            publicBaseUrl,
        });
        return {
            manifest,
            removed: false,
        };
    }

    await deleteBillboardGroupRowsByIds(supabaseClient, [normalizedGroupId]);
    await deleteBillboardGroupRevisionAssets({
        supabaseClient,
        storageBucket,
        groupId: normalizedGroupId,
        revision: existingGroupRow.revision,
    }).catch(() => {});

    const manifest = await readRemoteBillboardContentManifest({
        supabaseClient,
        storageBucket,
        publicBaseUrl,
    });
    return {
        manifest,
        removed: true,
    };
}

async function processBillboardUploadFile({
    file,
    mediaKind,
    index,
    groupId,
    revision,
    transcodeImage,
    transcodeVideo,
    probeMedia,
}) {
    const tempDirectoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'billboard-media-'));
    const sourceExtension = ALLOWED_MIME_TYPES[file.mimeType] || 'bin';
    const tempInputFilePath = path.join(tempDirectoryPath, `input.${sourceExtension}`);
    const tempOutputFilePath = path.join(
        tempDirectoryPath,
        `runtime.${mediaKind === 'image' ? BILLBOARD_IMAGE_OUTPUT_EXTENSION : BILLBOARD_VIDEO_OUTPUT_EXTENSION}`
    );

    try {
        await fs.writeFile(tempInputFilePath, file.buffer);
        let mediaInfo = null;
        if (mediaKind === 'image') {
            mediaInfo = await Promise.resolve(probeMedia(tempInputFilePath, mediaKind)).catch(() => null);
            if (canUseBillboardImageSourceAsRuntimeAsset(file, mediaInfo, BILLBOARD_IMAGE_MAX_EDGE)) {
                await fs.copyFile(tempInputFilePath, tempOutputFilePath);
            } else {
                await Promise.resolve(
                    transcodeImage({
                        inputFilePath: tempInputFilePath,
                        outputFilePath: tempOutputFilePath,
                        targetMaxEdge: BILLBOARD_IMAGE_MAX_EDGE,
                    })
                );
                mediaInfo = null;
            }
        } else {
            await Promise.resolve(
                transcodeVideo({
                    inputFilePath: tempInputFilePath,
                    outputFilePath: tempOutputFilePath,
                    targetMaxEdge: BILLBOARD_VIDEO_MAX_EDGE,
                    targetFrameRate: BILLBOARD_VIDEO_TARGET_FRAME_RATE,
                })
            );
        }

        const outputBuffer = await fs.readFile(tempOutputFilePath);
        mediaInfo =
            mediaInfo ||
            (await Promise.resolve(probeMedia(tempOutputFilePath, mediaKind)).catch(() => null));
        const outputMimeType =
            mediaKind === 'image'
                ? BILLBOARD_IMAGE_OUTPUT_MIME_TYPE
                : BILLBOARD_VIDEO_OUTPUT_MIME_TYPE;
        const outputExtension =
            mediaKind === 'image'
                ? BILLBOARD_IMAGE_OUTPUT_EXTENSION
                : BILLBOARD_VIDEO_OUTPUT_EXTENSION;
        const safeBaseName = sanitizeBillboardUploadFileName(
            file.name,
            `${mediaKind}-${String(index + 1).padStart(2, '0')}`
        );
        const fileName = `${String(index + 1).padStart(2, '0')}-${safeBaseName}.${outputExtension}`;
        const assetId = crypto.randomUUID();
        return {
            id: assetId,
            displayName: file.displayName,
            fileName,
            uploadedMimeType: file.mimeType,
            mimeType: outputMimeType,
            sizeBytes: outputBuffer.length,
            width: Math.max(0, Number(mediaInfo?.width) || 0),
            height: Math.max(0, Number(mediaInfo?.height) || 0),
            durationMs: Math.max(0, Number(mediaInfo?.durationMs) || 0),
            buffer: outputBuffer,
            storagePath: buildBillboardStoragePath(groupId, revision, fileName, assetId),
        };
    } finally {
        await fs.rm(tempDirectoryPath, { recursive: true, force: true });
    }
}

function canUseBillboardImageSourceAsRuntimeAsset(file, mediaInfo, targetMaxEdge = 0) {
    const mimeType = typeof file?.mimeType === 'string' ? file.mimeType.trim().toLowerCase() : '';
    const width = Math.max(0, Number(mediaInfo?.width) || 0);
    const height = Math.max(0, Number(mediaInfo?.height) || 0);
    return Boolean(
        mimeType === BILLBOARD_IMAGE_OUTPUT_MIME_TYPE &&
            width > 0 &&
            height > 0 &&
            Math.max(width, height) <= Math.max(1, Number(targetMaxEdge) || 0)
    );
}

function createBillboardAssetRowRecord(asset, { groupId, revision, userId = '' } = {}) {
    return {
        id: asset.id,
        group_id: groupId,
        revision,
        display_name: asset.displayName,
        file_name: asset.fileName,
        uploaded_mime_type: asset.uploadedMimeType,
        mime_type: asset.mimeType,
        size_bytes: asset.sizeBytes,
        width: asset.width,
        height: asset.height,
        duration_ms: asset.durationMs,
        storage_path: asset.storagePath,
        sort_order: Math.max(0, Number(asset.sortOrder) || 0),
        created_by: userId,
    };
}

async function readBillboardGroupRows(supabaseClient) {
    const { data, error } = await supabaseClient
        .from(BILLBOARD_CONTENT_GROUP_TABLE_NAME)
        .select(BILLBOARD_GROUP_SELECT_COLUMNS)
        .order('group_id', { ascending: true });

    if (error) {
        throw error;
    }
    return Array.isArray(data) ? data : [];
}

async function readBillboardGroupRowById(supabaseClient, groupId) {
    const normalizedGroupId = sanitizeBillboardContentGroupId(groupId);
    if (!normalizedGroupId) {
        return null;
    }

    const { data, error } = await supabaseClient
        .from(BILLBOARD_CONTENT_GROUP_TABLE_NAME)
        .select(BILLBOARD_GROUP_SELECT_COLUMNS)
        .eq('group_id', normalizedGroupId)
        .maybeSingle();

    if (error) {
        throw error;
    }
    return data && typeof data === 'object' ? data : null;
}

async function upsertBillboardGroupRow(supabaseClient, row) {
    const { error } = await supabaseClient
        .from(BILLBOARD_CONTENT_GROUP_TABLE_NAME)
        .upsert(row, { onConflict: 'group_id' });

    if (error) {
        throw error;
    }
}

async function deleteBillboardGroupRowsByIds(supabaseClient, groupIds = []) {
    const safeGroupIds = Array.isArray(groupIds)
        ? groupIds.map((groupId) => sanitizeBillboardContentGroupId(groupId)).filter(Boolean)
        : [];
    if (safeGroupIds.length === 0) {
        return;
    }

    const { error } = await supabaseClient
        .from(BILLBOARD_CONTENT_GROUP_TABLE_NAME)
        .delete()
        .in('group_id', safeGroupIds);

    if (error) {
        throw error;
    }
}

async function readBillboardAssetRows(supabaseClient) {
    const { data, error } = await supabaseClient
        .from(BILLBOARD_CONTENT_ASSET_TABLE_NAME)
        .select(BILLBOARD_ASSET_SELECT_COLUMNS)
        .order('group_id', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) {
        throw error;
    }
    return Array.isArray(data) ? data : [];
}

async function readBillboardAssetRowsForGroupRevision(supabaseClient, groupId, revision) {
    const normalizedGroupId = sanitizeBillboardContentGroupId(groupId);
    const normalizedRevision = sanitizeBillboardRevision(revision);
    if (!normalizedGroupId || !normalizedRevision) {
        return [];
    }

    const { data, error } = await supabaseClient
        .from(BILLBOARD_CONTENT_ASSET_TABLE_NAME)
        .select(BILLBOARD_ASSET_SELECT_COLUMNS)
        .eq('group_id', normalizedGroupId)
        .eq('revision', normalizedRevision)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) {
        throw error;
    }
    return Array.isArray(data) ? data : [];
}

async function insertBillboardAssetRows(supabaseClient, rows = []) {
    const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
    if (safeRows.length === 0) {
        return;
    }

    const insertRows = safeRows.map((row, index) => ({
        ...row,
        sort_order: index,
    }));
    const { error } = await supabaseClient
        .from(BILLBOARD_CONTENT_ASSET_TABLE_NAME)
        .insert(insertRows);

    if (error) {
        throw error;
    }
}

async function deleteBillboardAssetRowsByIds(supabaseClient, assetIds = []) {
    const safeAssetIds = Array.isArray(assetIds)
        ? assetIds
              .map((assetId) => (typeof assetId === 'string' ? assetId.trim() : ''))
              .filter(Boolean)
        : [];
    if (safeAssetIds.length === 0) {
        return;
    }

    const { error } = await supabaseClient
        .from(BILLBOARD_CONTENT_ASSET_TABLE_NAME)
        .delete()
        .in('id', safeAssetIds);

    if (error) {
        throw error;
    }
}

async function deleteBillboardGroupRevisionAssets({
    supabaseClient,
    storageBucket,
    groupId,
    revision,
}) {
    const assetRows = await readBillboardAssetRowsForGroupRevision(
        supabaseClient,
        groupId,
        revision
    );
    if (assetRows.length === 0) {
        return;
    }

    await deleteBillboardAssetRowsByIds(
        supabaseClient,
        assetRows.map((row) => row.id)
    );
    await deleteBillboardStorageObjects({
        supabaseClient,
        storageBucket,
        storagePaths: assetRows.map((row) => row.storage_path),
    });
}

async function uploadBillboardStorageObject({
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

async function downloadBillboardStorageObject({ supabaseClient, storageBucket, storagePath }) {
    const safeStoragePath = sanitizeSupabaseStorageObjectPath(storagePath);
    if (!safeStoragePath) {
        throw createBillboardStoreError(400, 'Invalid billboard storage path.');
    }

    const { data, error } = await supabaseClient.storage.from(storageBucket).download(safeStoragePath);
    if (error) {
        throw error;
    }
    if (!data) {
        throw createBillboardStoreError(404, 'Billboard storage object is missing.');
    }
    if (Buffer.isBuffer(data)) {
        return data;
    }
    if (typeof data.arrayBuffer === 'function') {
        return Buffer.from(await data.arrayBuffer());
    }
    if (data instanceof ArrayBuffer) {
        return Buffer.from(data);
    }
    if (ArrayBuffer.isView(data)) {
        return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    }
    throw createBillboardStoreError(500, 'Billboard storage object could not be read.');
}

async function deleteBillboardStorageObjects({ supabaseClient, storageBucket, storagePaths = [] }) {
    const safeStoragePaths = Array.isArray(storagePaths)
        ? storagePaths
              .map((storagePath) => sanitizeSupabaseStorageObjectPath(storagePath))
              .filter(Boolean)
        : [];
    if (safeStoragePaths.length === 0) {
        return;
    }

    const { error } = await supabaseClient.storage.from(storageBucket).remove(safeStoragePaths);
    if (error) {
        throw error;
    }
}

async function migrateLocalBillboardManifestToRemoteStore({
    manifest,
    uploadsDirectoryPath,
    supabaseClient,
    storageBucket,
}) {
    const normalizedManifest = normalizeBillboardContentManifest(manifest);
    const groups = Object.values(normalizedManifest.groups);

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
        const group = groups[groupIndex];
        const normalizedGroupId = sanitizeBillboardContentGroupId(group?.groupId || '');
        const mediaKind = resolveBillboardMediaKind(group?.mediaKind);
        if (
            !normalizedGroupId ||
            !mediaKind ||
            !Array.isArray(group.items) ||
            !group.items.length
        ) {
            continue;
        }

        const updatedAt =
            sanitizeBillboardManifestTimestamp(group.updatedAt) || new Date().toISOString();
        const revision = createBillboardStorageRevision(updatedAt);
        const insertedAssetIds = [];
        const uploadedStoragePaths = [];

        try {
            const assetRows = [];
            for (let itemIndex = 0; itemIndex < group.items.length; itemIndex += 1) {
                const item = group.items[itemIndex];
                const fileName =
                    typeof item?.fileName === 'string' && item.fileName.trim()
                        ? item.fileName.trim()
                        : `${String(itemIndex + 1).padStart(2, '0')}-${mediaKind}.${
                              ALLOWED_MIME_TYPES[item?.mimeType] || 'bin'
                          }`;
                const diskFilePath = path.join(uploadsDirectoryPath, normalizedGroupId, fileName);
                let buffer = null;
                try {
                    buffer = await fs.readFile(diskFilePath);
                } catch (error) {
                    if (error?.code === 'ENOENT') {
                        continue;
                    }
                    throw error;
                }

                const assetId =
                    isUuidValue(item?.id) ? item.id.trim() : crypto.randomUUID();
                const storagePath = buildBillboardStoragePath(
                    normalizedGroupId,
                    revision,
                    fileName,
                    assetId
                );

                await uploadBillboardStorageObject({
                    supabaseClient,
                    storageBucket,
                    storagePath,
                    buffer,
                    contentType: item.mimeType,
                });
                uploadedStoragePaths.push(storagePath);
                insertedAssetIds.push(assetId);
                assetRows.push({
                    id: assetId,
                    group_id: normalizedGroupId,
                    revision,
                    display_name: item.displayName || fileName,
                    file_name: fileName,
                    uploaded_mime_type: item.mimeType,
                    mime_type: item.mimeType,
                    size_bytes: Math.max(0, Number(item.sizeBytes) || buffer.length),
                    width: 0,
                    height: 0,
                    duration_ms: 0,
                    storage_path: storagePath,
                    sort_order: itemIndex,
                    created_by: '',
                });
            }

            if (assetRows.length === 0) {
                continue;
            }

            await insertBillboardAssetRows(supabaseClient, assetRows);
            await upsertBillboardGroupRow(supabaseClient, {
                group_id: normalizedGroupId,
                media_kind: mediaKind,
                revision,
                updated_at: updatedAt,
            });
        } catch (error) {
            await deleteBillboardAssetRowsByIds(supabaseClient, insertedAssetIds).catch(() => {});
            await deleteBillboardStorageObjects({
                supabaseClient,
                storageBucket,
                storagePaths: uploadedStoragePaths,
            }).catch(() => {});
            throw error;
        }
    }
}

function compareBillboardAssetRows(a, b) {
    const sortOrderA = Math.max(0, Math.round(Number(a?.sort_order) || 0));
    const sortOrderB = Math.max(0, Math.round(Number(b?.sort_order) || 0));
    if (sortOrderA !== sortOrderB) {
        return sortOrderA - sortOrderB;
    }
    return String(a?.created_at || '').localeCompare(String(b?.created_at || ''));
}

function resolveBillboardReprocessGroupIds(manifest, groupIds = []) {
    const normalizedManifest = normalizeBillboardContentManifest(manifest);
    const manifestGroupIds = Object.keys(normalizedManifest.groups).filter((groupId) =>
        Array.isArray(normalizedManifest.groups[groupId]?.items)
            ? normalizedManifest.groups[groupId].items.length > 0
            : false
    );
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
        return manifestGroupIds;
    }

    const manifestGroupIdSet = new Set(manifestGroupIds);
    const requestedGroupIds = [];
    for (let index = 0; index < groupIds.length; index += 1) {
        const normalizedGroupId = sanitizeBillboardContentGroupId(groupIds[index]);
        if (
            normalizedGroupId &&
            manifestGroupIdSet.has(normalizedGroupId) &&
            !requestedGroupIds.includes(normalizedGroupId)
        ) {
            requestedGroupIds.push(normalizedGroupId);
        }
    }
    return requestedGroupIds;
}

function sanitizeBillboardRevision(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!normalized || normalized.length > 64) {
        return '';
    }
    return normalized.replace(/[^a-z0-9-]/g, '');
}

function sanitizeBillboardActorId(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized || normalized.length > 64) {
        return '';
    }
    return /^[a-z0-9-]+$/iu.test(normalized) ? normalized : '';
}

function isUuidValue(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        normalized
    );
}

async function readRemoteBillboardGroupSourceFiles({ supabaseClient, storageBucket, groupId }) {
    const normalizedGroupId = sanitizeBillboardContentGroupId(groupId);
    if (!normalizedGroupId) {
        return null;
    }

    const groupRow = await readBillboardGroupRowById(supabaseClient, normalizedGroupId);
    const revision = sanitizeBillboardRevision(groupRow?.revision || '');
    const mediaKind = resolveBillboardMediaKind(groupRow?.media_kind);
    if (!groupRow || !revision || !mediaKind) {
        return null;
    }

    const assetRows = (await readBillboardAssetRowsForGroupRevision(
        supabaseClient,
        normalizedGroupId,
        revision
    )).sort(compareBillboardAssetRows);
    const files = [];
    for (let index = 0; index < assetRows.length; index += 1) {
        const assetRow = assetRows[index];
        const buffer = await downloadBillboardStorageObject({
            supabaseClient,
            storageBucket,
            storagePath: assetRow.storage_path,
        });
        const sourceMimeType = resolveBillboardSourceMimeType({
            uploadedMimeType: assetRow.uploaded_mime_type,
            storedMimeType: assetRow.mime_type,
            fileName: assetRow.file_name,
            mediaKind,
        });
        files.push({
            name: assetRow.file_name || `${normalizedGroupId}-${index + 1}`,
            displayName: assetRow.display_name || assetRow.file_name || `Media ${index + 1}`,
            mimeType: sourceMimeType,
            buffer,
        });
    }

    return {
        groupRow,
        mediaKind,
        files,
    };
}

function buildBillboardStoragePath(groupId, revision, fileName, assetId = '') {
    const normalizedGroupId = sanitizeBillboardContentGroupId(groupId);
    const normalizedRevision = sanitizeBillboardRevision(revision);
    const normalizedAssetId = typeof assetId === 'string' && assetId.trim() ? assetId.trim() : '';
    const safeFileName = sanitizeStorageFileName(fileName);
    return ['billboards', normalizedGroupId, normalizedRevision, normalizedAssetId, safeFileName]
        .filter(Boolean)
        .join('/');
}

function resolveBillboardSourceMimeType({
    uploadedMimeType = '',
    storedMimeType = '',
    fileName = '',
    mediaKind = '',
} = {}) {
    const normalizedUploadedMimeType =
        typeof uploadedMimeType === 'string' ? uploadedMimeType.trim().toLowerCase() : '';
    if (ALLOWED_MIME_TYPES[normalizedUploadedMimeType]) {
        return normalizedUploadedMimeType;
    }

    const normalizedStoredMimeType =
        typeof storedMimeType === 'string' ? storedMimeType.trim().toLowerCase() : '';
    if (ALLOWED_MIME_TYPES[normalizedStoredMimeType]) {
        return normalizedStoredMimeType;
    }

    const mimeTypeFromFileName = resolveBillboardMimeTypeFromFileName(fileName);
    if (mimeTypeFromFileName) {
        return mimeTypeFromFileName;
    }

    return mediaKind === 'video' ? BILLBOARD_VIDEO_OUTPUT_MIME_TYPE : BILLBOARD_IMAGE_OUTPUT_MIME_TYPE;
}

function resolveBillboardMimeTypeFromFileName(fileName = '') {
    const normalizedExtension = path.extname(String(fileName || '')).trim().toLowerCase().replace(/^\./u, '');
    if (!normalizedExtension) {
        return '';
    }
    const matchingEntry = Object.entries(ALLOWED_MIME_TYPES).find(
        ([, extension]) => extension === normalizedExtension
    );
    return matchingEntry ? matchingEntry[0] : '';
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

function sanitizeSupabaseStorageObjectPath(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().replace(/^\/+|\/+$/g, '');
    if (!normalized || normalized.length > 512 || normalized.includes('..')) {
        return '';
    }
    const segments = normalized.split('/');
    if (segments.some((segment) => !/^[a-zA-Z0-9._-]{1,120}$/u.test(segment))) {
        return '';
    }
    return normalized;
}

function createSupabaseBillboardPublicUrl({ publicBaseUrl, storageBucket, storagePath, revision }) {
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
    const safeRevision = sanitizeBillboardRevision(revision);
    return safeRevision ? `${baseUrl}?v=${encodeURIComponent(safeRevision)}` : baseUrl;
}

function createBillboardStorageRevision(updatedAt) {
    const revisionBase = createBillboardRevisionTag(updatedAt);
    return `${revisionBase}-${crypto.randomBytes(3).toString('hex')}`;
}

async function transcodeBillboardImage({
    inputFilePath,
    outputFilePath,
    targetMaxEdge = BILLBOARD_IMAGE_MAX_EDGE,
}) {
    const args = [
        '-y',
        '-i',
        inputFilePath,
        '-vf',
        [
            `scale='if(gte(iw,ih),min(${targetMaxEdge},iw),-2)':'if(gte(ih,iw),min(${targetMaxEdge},ih),-2)':force_original_aspect_ratio=decrease:flags=lanczos`,
            'setsar=1',
        ].join(','),
        '-frames:v',
        '1',
        '-an',
        '-c:v',
        'libwebp',
        '-q:v',
        '75',
        '-compression_level',
        '6',
        outputFilePath,
    ];
    await runBillboardFfmpeg(args, 'Could not convert the uploaded image for billboard use.');
}

async function transcodeBillboardVideo({
    inputFilePath,
    outputFilePath,
    targetMaxEdge = BILLBOARD_VIDEO_MAX_EDGE,
    targetFrameRate = BILLBOARD_VIDEO_TARGET_FRAME_RATE,
}) {
    const args = [
        '-y',
        '-i',
        inputFilePath,
        '-vf',
        [
            `scale='if(gte(iw,ih),min(${targetMaxEdge},iw),-2)':'if(gte(ih,iw),min(${targetMaxEdge},ih),-2)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`,
            `fps=${targetFrameRate}`,
            'setsar=1',
        ].join(','),
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '22',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        outputFilePath,
    ];
    await runBillboardFfmpeg(args, 'Could not convert the uploaded video for billboard use.');
}

async function probeBillboardMedia(filePath, mediaKind = '') {
    const args = [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height,duration',
        '-show_entries',
        'format=duration',
        '-of',
        'json',
        filePath,
    ];
    const payload = await runBillboardProbe(args);
    const stream = Array.isArray(payload?.streams) ? payload.streams[0] || {} : {};
    const durationSeconds = Number(stream?.duration || payload?.format?.duration || 0);
    return {
        width: Math.max(0, Math.round(Number(stream?.width) || 0)),
        height: Math.max(0, Math.round(Number(stream?.height) || 0)),
        durationMs:
            mediaKind === 'video' && Number.isFinite(durationSeconds)
                ? Math.max(0, Math.round(durationSeconds * 1000))
                : 0,
    };
}

async function runBillboardFfmpeg(args, failureMessage) {
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
                reject(createBillboardStoreError(500, 'ffmpeg is not installed on this server.'));
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
                createBillboardStoreError(
                    400,
                    stderr.trim() ? failureMessage : 'Billboard media conversion failed.'
                )
            );
        });
    });
}

async function runBillboardProbe(args) {
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
            if (stderr.length > 4000) {
                stderr = stderr.slice(-4000);
            }
        });
        ffprobeProcess.on('error', (error) => {
            if (error?.code === 'ENOENT') {
                reject(createBillboardStoreError(500, 'ffprobe is not installed on this server.'));
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
                createBillboardStoreError(
                    400,
                    stderr.trim()
                        ? 'Could not inspect the processed billboard media.'
                        : 'Media inspection failed.'
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

function normalizeBillboardProcessingError(error) {
    if (error?.statusCode) {
        return error;
    }
    return createBillboardStoreError(500, error?.message || 'Billboard upload failed.');
}

async function ensureBillboardContentSchema({ connectionString } = {}) {
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
            create table if not exists public.${BILLBOARD_CONTENT_GROUP_TABLE_NAME} (
                group_id text primary key,
                media_kind text not null check (media_kind in ('image', 'video')),
                revision text not null default '',
                updated_at timestamptz not null default now(),
                created_at timestamptz not null default now()
            );

            create table if not exists public.${BILLBOARD_CONTENT_ASSET_TABLE_NAME} (
                id uuid primary key,
                group_id text not null,
                revision text not null default '',
                display_name text not null default '',
                file_name text not null default '',
                uploaded_mime_type text not null default '',
                mime_type text not null,
                size_bytes bigint not null default 0 check (size_bytes >= 0),
                width integer not null default 0 check (width >= 0),
                height integer not null default 0 check (height >= 0),
                duration_ms integer not null default 0 check (duration_ms >= 0),
                storage_path text not null,
                sort_order integer not null default 0 check (sort_order >= 0),
                created_by text not null default '',
                created_at timestamptz not null default now()
            );

            create index if not exists billboard_content_assets_group_revision_sort_idx
                on public.${BILLBOARD_CONTENT_ASSET_TABLE_NAME} (group_id, revision, sort_order, created_at);

            create index if not exists billboard_content_groups_updated_idx
                on public.${BILLBOARD_CONTENT_GROUP_TABLE_NAME} (updated_at desc);

            alter table public.${BILLBOARD_CONTENT_GROUP_TABLE_NAME} enable row level security;
            alter table public.${BILLBOARD_CONTENT_ASSET_TABLE_NAME} enable row level security;

            grant select on table public.${BILLBOARD_CONTENT_GROUP_TABLE_NAME} to anon, authenticated;
            grant select on table public.${BILLBOARD_CONTENT_ASSET_TABLE_NAME} to anon, authenticated;

            do $$
            begin
                if not exists (
                    select 1
                    from pg_policies
                    where schemaname = 'public'
                        and tablename = '${BILLBOARD_CONTENT_GROUP_TABLE_NAME}'
                        and policyname = 'billboard_content_groups_select_public'
                ) then
                    create policy billboard_content_groups_select_public
                        on public.${BILLBOARD_CONTENT_GROUP_TABLE_NAME}
                        for select
                        using (true);
                end if;
            end
            $$;

            do $$
            begin
                if not exists (
                    select 1
                    from pg_policies
                    where schemaname = 'public'
                        and tablename = '${BILLBOARD_CONTENT_ASSET_TABLE_NAME}'
                        and policyname = 'billboard_content_assets_select_public'
                ) then
                    create policy billboard_content_assets_select_public
                        on public.${BILLBOARD_CONTENT_ASSET_TABLE_NAME}
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
    ALLOWED_MIME_TYPES,
    BILLBOARD_CONTENT_ASSET_TABLE_NAME,
    BILLBOARD_CONTENT_GROUP_TABLE_NAME,
    BILLBOARD_IMAGE_MAX_EDGE,
    BILLBOARD_VIDEO_MAX_EDGE,
    createBillboardContentStore,
    createBillboardStoreError,
    ensureBillboardContentSchema,
    normalizeBillboardContentManifest,
    parseBillboardDataUrlPayload,
    sanitizeBillboardContentGroupId,
    sanitizeBillboardUploadFileName,
};
