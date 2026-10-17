const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Client: PostgresClient } = require('pg');
const {
    createSupabaseServiceClient,
    sanitizeSupabaseStorageBucketName,
    sanitizeSupabaseUrl,
} = require('./supabase-config');

const SHOWROOM_INTRO_MANIFEST_VERSION = 1;
const SHOWROOM_INTRO_OUTPUT_FILE_NAME = 'Demo.mp4';
const SHOWROOM_INTRO_OUTPUT_MIME_TYPE = 'video/mp4';
const SHOWROOM_INTRO_TARGET_WIDTH = 1680;
const SHOWROOM_INTRO_TARGET_HEIGHT = 900;
const SHOWROOM_INTRO_TARGET_FRAME_RATE = 30;
const SHOWROOM_INTRO_MAX_UPLOAD_BYTES = 300 * 1024 * 1024;
const DEFAULT_SHOWROOM_INTRO_STORAGE_BUCKET = 'showroom-intro-media';
const SHOWROOM_INTRO_VIDEO_TABLE_NAME = 'showroom_intro_videos';
const SHOWROOM_INTRO_VIDEO_ROW_KEY = 'runtime';
const SHOWROOM_INTRO_VIDEO_SELECT_COLUMNS = [
    'slot_key',
    'file_name',
    'original_file_name',
    'uploaded_mime_type',
    'mime_type',
    'size_bytes',
    'width',
    'height',
    'frame_rate',
    'revision',
    'storage_path',
    'updated_at',
].join(',');
const SHOWROOM_INTRO_ACCEPTED_UPLOAD_MIME_TYPES = Object.freeze({
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'video/x-m4v': '.m4v',
    'video/mpeg': '.mpeg',
    'video/avi': '.avi',
    'video/x-msvideo': '.avi',
});

function createShowroomIntroVideoStore({
    manifestFilePath,
    uploadsDirectoryPath,
    uploadsPublicBasePath = '/uploads/showroom-intro',
    defaultVideoFilePath,
    defaultVideoPublicPath = '/assets/Demo/Demo.mp4',
    transcodeVideo = transcodeShowroomIntroVideo,
    supabaseConfig = null,
    storageBucket = '',
    publicBaseUrl = '',
    supabaseClient: supabaseClientOverride,
} = {}) {
    if (!manifestFilePath || !uploadsDirectoryPath || !defaultVideoFilePath) {
        throw new Error(
            'Showroom intro video store requires manifest, uploads directory, and default video paths.'
        );
    }

    const localStore = createLocalShowroomIntroVideoStore({
        manifestFilePath,
        uploadsDirectoryPath,
        uploadsPublicBasePath,
        defaultVideoFilePath,
        defaultVideoPublicPath,
        transcodeVideo,
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
            resolvedSupabaseConfig.showroomIntroBucket ||
            DEFAULT_SHOWROOM_INTRO_STORAGE_BUCKET
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
            return readRemoteShowroomIntroVideoConfig({
                supabaseClient,
                storageBucket: resolvedStorageBucket,
                publicBaseUrl: resolvedPublicBaseUrl,
                defaultVideoFilePath,
                defaultVideoPublicPath,
            });
        },
        async writeUploadedVideo(payload = {}) {
            await ensureRemoteStoreMigrated();
            return writeRemoteUploadedShowroomIntroVideo({
                supabaseClient,
                storageBucket: resolvedStorageBucket,
                publicBaseUrl: resolvedPublicBaseUrl,
                defaultVideoFilePath,
                defaultVideoPublicPath,
                payload,
                transcodeVideo,
            });
        },
        async resetVideo() {
            await ensureRemoteStoreMigrated();
            return resetRemoteShowroomIntroVideo({
                supabaseClient,
                storageBucket: resolvedStorageBucket,
                publicBaseUrl: resolvedPublicBaseUrl,
                defaultVideoFilePath,
                defaultVideoPublicPath,
            });
        },
    };

    async function ensureRemoteStoreMigrated() {
        if (migrationPromise) {
            return migrationPromise;
        }

        migrationPromise = (async () => {
            const remoteConfig = await readRemoteShowroomIntroVideoConfig({
                supabaseClient,
                storageBucket: resolvedStorageBucket,
                publicBaseUrl: resolvedPublicBaseUrl,
                defaultVideoFilePath,
                defaultVideoPublicPath,
            });
            if (remoteConfig.isCustom) {
                return remoteConfig;
            }

            const localManifest = await readShowroomIntroVideoManifest(manifestFilePath);
            if (!localManifest.customVideo) {
                return remoteConfig;
            }

            await migrateLocalShowroomIntroVideoToRemoteStore({
                manifest: localManifest,
                uploadsDirectoryPath,
                supabaseClient,
                storageBucket: resolvedStorageBucket,
            });

            return readRemoteShowroomIntroVideoConfig({
                supabaseClient,
                storageBucket: resolvedStorageBucket,
                publicBaseUrl: resolvedPublicBaseUrl,
                defaultVideoFilePath,
                defaultVideoPublicPath,
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

function createLocalShowroomIntroVideoStore({
    manifestFilePath,
    uploadsDirectoryPath,
    uploadsPublicBasePath = '/uploads/showroom-intro',
    defaultVideoFilePath,
    defaultVideoPublicPath = '/assets/Demo/Demo.mp4',
    transcodeVideo,
} = {}) {
    return {
        async readConfig() {
            return readLocalShowroomIntroVideoConfig({
                manifestFilePath,
                uploadsDirectoryPath,
                uploadsPublicBasePath,
                defaultVideoFilePath,
                defaultVideoPublicPath,
            });
        },
        async writeUploadedVideo(payload = {}) {
            return writeLocalUploadedShowroomIntroVideo({
                manifestFilePath,
                uploadsDirectoryPath,
                uploadsPublicBasePath,
                defaultVideoFilePath,
                defaultVideoPublicPath,
                payload,
                transcodeVideo,
            });
        },
        async resetVideo() {
            return resetLocalShowroomIntroVideo({
                manifestFilePath,
                uploadsDirectoryPath,
                uploadsPublicBasePath,
                defaultVideoFilePath,
                defaultVideoPublicPath,
            });
        },
    };
}

async function readLocalShowroomIntroVideoConfig({
    manifestFilePath,
    uploadsDirectoryPath,
    uploadsPublicBasePath,
    defaultVideoFilePath,
    defaultVideoPublicPath,
}) {
    const manifest = await readShowroomIntroVideoManifest(manifestFilePath);
    return buildLocalShowroomIntroVideoClientConfig({
        manifest,
        uploadsDirectoryPath,
        uploadsPublicBasePath,
        defaultVideoFilePath,
        defaultVideoPublicPath,
    });
}

async function writeLocalUploadedShowroomIntroVideo({
    manifestFilePath,
    uploadsDirectoryPath,
    uploadsPublicBasePath,
    defaultVideoFilePath,
    defaultVideoPublicPath,
    payload = {},
    transcodeVideo,
}) {
    const upload = normalizeUploadedShowroomIntroVideoPayload(payload);
    const updatedAt = new Date().toISOString();
    const revision = createShowroomIntroRevisionTag(updatedAt);
    const tempDirectoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'showroom-intro-'));
    const inputExtension = SHOWROOM_INTRO_ACCEPTED_UPLOAD_MIME_TYPES[upload.mimeType] || '.mp4';
    const tempInputFilePath = path.join(tempDirectoryPath, `input${inputExtension}`);
    const tempOutputFilePath = path.join(tempDirectoryPath, SHOWROOM_INTRO_OUTPUT_FILE_NAME);
    const finalOutputFilePath = path.join(uploadsDirectoryPath, SHOWROOM_INTRO_OUTPUT_FILE_NAME);

    try {
        await fs.writeFile(tempInputFilePath, upload.buffer);
        await Promise.resolve(
            transcodeVideo({
                inputFilePath: tempInputFilePath,
                outputFilePath: tempOutputFilePath,
                targetWidth: SHOWROOM_INTRO_TARGET_WIDTH,
                targetHeight: SHOWROOM_INTRO_TARGET_HEIGHT,
                targetFrameRate: SHOWROOM_INTRO_TARGET_FRAME_RATE,
            })
        );

        const outputStats = await fs.stat(tempOutputFilePath);
        await fs.rm(uploadsDirectoryPath, {
            recursive: true,
            force: true,
        });
        await fs.mkdir(uploadsDirectoryPath, { recursive: true });
        await fs.copyFile(tempOutputFilePath, finalOutputFilePath);

        const manifest = await readShowroomIntroVideoManifest(manifestFilePath);
        manifest.updatedAt = updatedAt;
        manifest.customVideo = {
            fileName: SHOWROOM_INTRO_OUTPUT_FILE_NAME,
            originalFileName: upload.originalFileName,
            uploadedMimeType: upload.mimeType,
            mimeType: SHOWROOM_INTRO_OUTPUT_MIME_TYPE,
            sizeBytes: Math.max(0, Number(outputStats.size) || 0),
            width: SHOWROOM_INTRO_TARGET_WIDTH,
            height: SHOWROOM_INTRO_TARGET_HEIGHT,
            frameRate: SHOWROOM_INTRO_TARGET_FRAME_RATE,
            updatedAt,
            revision,
        };
        await writeShowroomIntroVideoManifest(manifestFilePath, manifest);

        return buildLocalShowroomIntroVideoClientConfig({
            manifest,
            uploadsDirectoryPath,
            uploadsPublicBasePath,
            defaultVideoFilePath,
            defaultVideoPublicPath,
        });
    } finally {
        await fs.rm(tempDirectoryPath, { recursive: true, force: true });
    }
}

async function resetLocalShowroomIntroVideo({
    manifestFilePath,
    uploadsDirectoryPath,
    uploadsPublicBasePath,
    defaultVideoFilePath,
    defaultVideoPublicPath,
}) {
    const manifest = await readShowroomIntroVideoManifest(manifestFilePath);
    const hadCustomVideo = Boolean(manifest.customVideo);
    manifest.updatedAt = new Date().toISOString();
    manifest.customVideo = null;

    await fs.rm(uploadsDirectoryPath, {
        recursive: true,
        force: true,
    });
    await writeShowroomIntroVideoManifest(manifestFilePath, manifest);

    return {
        removed: hadCustomVideo,
        video: await buildLocalShowroomIntroVideoClientConfig({
            manifest,
            uploadsDirectoryPath,
            uploadsPublicBasePath,
            defaultVideoFilePath,
            defaultVideoPublicPath,
        }),
    };
}

async function readRemoteShowroomIntroVideoConfig({
    supabaseClient,
    storageBucket,
    publicBaseUrl,
    defaultVideoFilePath,
    defaultVideoPublicPath,
}) {
    const row = await readShowroomIntroVideoRow(supabaseClient);
    if (row?.storage_path) {
        return buildRemoteShowroomIntroVideoClientConfig({
            row,
            storageBucket,
            publicBaseUrl,
        });
    }
    return buildDefaultShowroomIntroVideoClientConfig({
        defaultVideoFilePath,
        defaultVideoPublicPath,
    });
}

async function writeRemoteUploadedShowroomIntroVideo({
    supabaseClient,
    storageBucket,
    publicBaseUrl,
    defaultVideoFilePath,
    defaultVideoPublicPath,
    payload = {},
    transcodeVideo,
}) {
    const upload = normalizeUploadedShowroomIntroVideoPayload(payload);
    const updatedAt = new Date().toISOString();
    const revision = createShowroomIntroRevisionTag(updatedAt);
    const tempDirectoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'showroom-intro-'));
    const inputExtension = SHOWROOM_INTRO_ACCEPTED_UPLOAD_MIME_TYPES[upload.mimeType] || '.mp4';
    const tempInputFilePath = path.join(tempDirectoryPath, `input${inputExtension}`);
    const tempOutputFilePath = path.join(tempDirectoryPath, SHOWROOM_INTRO_OUTPUT_FILE_NAME);
    const storagePath = buildShowroomIntroStoragePath(revision, SHOWROOM_INTRO_OUTPUT_FILE_NAME);
    const previousRow = await readShowroomIntroVideoRow(supabaseClient);
    let outputBuffer = null;

    try {
        await fs.writeFile(tempInputFilePath, upload.buffer);
        await Promise.resolve(
            transcodeVideo({
                inputFilePath: tempInputFilePath,
                outputFilePath: tempOutputFilePath,
                targetWidth: SHOWROOM_INTRO_TARGET_WIDTH,
                targetHeight: SHOWROOM_INTRO_TARGET_HEIGHT,
                targetFrameRate: SHOWROOM_INTRO_TARGET_FRAME_RATE,
            })
        );

        const outputStats = await fs.stat(tempOutputFilePath);
        outputBuffer = await fs.readFile(tempOutputFilePath);
        await uploadShowroomIntroStorageObject({
            supabaseClient,
            storageBucket,
            storagePath,
            buffer: outputBuffer,
            contentType: SHOWROOM_INTRO_OUTPUT_MIME_TYPE,
        });

        await upsertShowroomIntroVideoRow(supabaseClient, {
            slot_key: SHOWROOM_INTRO_VIDEO_ROW_KEY,
            file_name: SHOWROOM_INTRO_OUTPUT_FILE_NAME,
            original_file_name: upload.originalFileName,
            uploaded_mime_type: upload.mimeType,
            mime_type: SHOWROOM_INTRO_OUTPUT_MIME_TYPE,
            size_bytes: Math.max(0, Number(outputStats.size) || 0),
            width: SHOWROOM_INTRO_TARGET_WIDTH,
            height: SHOWROOM_INTRO_TARGET_HEIGHT,
            frame_rate: SHOWROOM_INTRO_TARGET_FRAME_RATE,
            revision,
            storage_path: storagePath,
            updated_at: updatedAt,
        });

        if (previousRow?.storage_path && previousRow.storage_path !== storagePath) {
            await deleteShowroomIntroStorageObjects({
                supabaseClient,
                storageBucket,
                storagePaths: [previousRow.storage_path],
            }).catch(() => {});
        }

        return readRemoteShowroomIntroVideoConfig({
            supabaseClient,
            storageBucket,
            publicBaseUrl,
            defaultVideoFilePath,
            defaultVideoPublicPath,
        });
    } catch (error) {
        if (outputBuffer) {
            await deleteShowroomIntroStorageObjects({
                supabaseClient,
                storageBucket,
                storagePaths: [storagePath],
            }).catch(() => {});
        }
        throw normalizeShowroomIntroVideoStoreError(error);
    } finally {
        await fs.rm(tempDirectoryPath, { recursive: true, force: true });
    }
}

async function resetRemoteShowroomIntroVideo({
    supabaseClient,
    storageBucket,
    publicBaseUrl,
    defaultVideoFilePath,
    defaultVideoPublicPath,
}) {
    const row = await readShowroomIntroVideoRow(supabaseClient);
    if (!row?.storage_path) {
        return {
            removed: false,
            video: await readRemoteShowroomIntroVideoConfig({
                supabaseClient,
                storageBucket,
                publicBaseUrl,
                defaultVideoFilePath,
                defaultVideoPublicPath,
            }),
        };
    }

    await deleteShowroomIntroVideoRow(supabaseClient);
    await deleteShowroomIntroStorageObjects({
        supabaseClient,
        storageBucket,
        storagePaths: [row.storage_path],
    }).catch(() => {});

    return {
        removed: true,
        video: await readRemoteShowroomIntroVideoConfig({
            supabaseClient,
            storageBucket,
            publicBaseUrl,
            defaultVideoFilePath,
            defaultVideoPublicPath,
        }),
    };
}

async function migrateLocalShowroomIntroVideoToRemoteStore({
    manifest,
    uploadsDirectoryPath,
    supabaseClient,
    storageBucket,
}) {
    const normalizedManifest = normalizeShowroomIntroVideoManifest(manifest);
    const customVideo = normalizedManifest.customVideo;
    if (!customVideo?.fileName) {
        return;
    }

    const filePath = path.join(uploadsDirectoryPath, customVideo.fileName);
    const buffer = await fs.readFile(filePath);
    const revision =
        sanitizeShowroomIntroRevision(customVideo.revision) ||
        createShowroomIntroRevisionTag(customVideo.updatedAt);
    const storagePath = buildShowroomIntroStoragePath(revision, customVideo.fileName);

    await uploadShowroomIntroStorageObject({
        supabaseClient,
        storageBucket,
        storagePath,
        buffer,
        contentType: customVideo.mimeType || SHOWROOM_INTRO_OUTPUT_MIME_TYPE,
    });

    try {
        await upsertShowroomIntroVideoRow(supabaseClient, {
            slot_key: SHOWROOM_INTRO_VIDEO_ROW_KEY,
            file_name: customVideo.fileName,
            original_file_name: customVideo.originalFileName,
            uploaded_mime_type: customVideo.uploadedMimeType,
            mime_type: customVideo.mimeType || SHOWROOM_INTRO_OUTPUT_MIME_TYPE,
            size_bytes: Math.max(0, Number(customVideo.sizeBytes) || buffer.length),
            width: Math.max(1, Number(customVideo.width) || SHOWROOM_INTRO_TARGET_WIDTH),
            height: Math.max(1, Number(customVideo.height) || SHOWROOM_INTRO_TARGET_HEIGHT),
            frame_rate: Math.max(1, Number(customVideo.frameRate) || SHOWROOM_INTRO_TARGET_FRAME_RATE),
            revision,
            storage_path: storagePath,
            updated_at: customVideo.updatedAt || new Date().toISOString(),
        });
    } catch (error) {
        await deleteShowroomIntroStorageObjects({
            supabaseClient,
            storageBucket,
            storagePaths: [storagePath],
        }).catch(() => {});
        throw error;
    }
}

async function readShowroomIntroVideoManifest(manifestFilePath) {
    try {
        const raw = await fs.readFile(manifestFilePath, 'utf8');
        return normalizeShowroomIntroVideoManifest(JSON.parse(raw));
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return createEmptyShowroomIntroVideoManifest();
        }
        throw error;
    }
}

async function writeShowroomIntroVideoManifest(manifestFilePath, manifest) {
    const normalizedManifest = normalizeShowroomIntroVideoManifest(manifest);
    await fs.mkdir(path.dirname(manifestFilePath), { recursive: true });
    await fs.writeFile(
        manifestFilePath,
        `${JSON.stringify(normalizedManifest, null, 2)}\n`,
        'utf8'
    );
}

function createEmptyShowroomIntroVideoManifest() {
    return {
        version: SHOWROOM_INTRO_MANIFEST_VERSION,
        updatedAt: null,
        customVideo: null,
    };
}

function normalizeShowroomIntroVideoManifest(manifest) {
    const source = manifest && typeof manifest === 'object' ? manifest : {};
    return {
        version: SHOWROOM_INTRO_MANIFEST_VERSION,
        updatedAt: sanitizeShowroomIntroTimestamp(source.updatedAt),
        customVideo: normalizeShowroomIntroCustomVideo(source.customVideo),
    };
}

function normalizeShowroomIntroCustomVideo(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const fileName =
        typeof value.fileName === 'string' && value.fileName.trim()
            ? value.fileName.trim()
            : SHOWROOM_INTRO_OUTPUT_FILE_NAME;
    const updatedAt = sanitizeShowroomIntroTimestamp(value.updatedAt);
    const revision =
        sanitizeShowroomIntroRevision(value.revision) || createShowroomIntroRevisionTag(updatedAt);

    return {
        fileName,
        originalFileName: sanitizeShowroomIntroOriginalFileName(value.originalFileName),
        uploadedMimeType: sanitizeShowroomIntroUploadMimeType(value.uploadedMimeType),
        mimeType: SHOWROOM_INTRO_OUTPUT_MIME_TYPE,
        sizeBytes: Math.max(0, Math.round(Number(value.sizeBytes) || 0)),
        width: SHOWROOM_INTRO_TARGET_WIDTH,
        height: SHOWROOM_INTRO_TARGET_HEIGHT,
        frameRate: SHOWROOM_INTRO_TARGET_FRAME_RATE,
        updatedAt,
        revision,
    };
}

function normalizeUploadedShowroomIntroVideoPayload(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const buffer = Buffer.isBuffer(source.buffer) ? source.buffer : Buffer.alloc(0);
    const mimeType = sanitizeShowroomIntroUploadMimeType(source.mimeType);
    if (!mimeType) {
        throw createShowroomIntroVideoStoreError(415, 'Only video uploads are supported here.');
    }
    if (!buffer.length) {
        throw createShowroomIntroVideoStoreError(400, 'Select a video file to upload.');
    }
    if (buffer.length > SHOWROOM_INTRO_MAX_UPLOAD_BYTES) {
        throw createShowroomIntroVideoStoreError(
            413,
            'Video is too large for the showroom uploader. Keep it under 300 MB.'
        );
    }

    return {
        buffer,
        mimeType,
        originalFileName: sanitizeShowroomIntroOriginalFileName(source.originalFileName),
    };
}

async function buildLocalShowroomIntroVideoClientConfig({
    manifest,
    uploadsDirectoryPath,
    uploadsPublicBasePath,
    defaultVideoFilePath,
    defaultVideoPublicPath,
}) {
    const normalizedManifest = normalizeShowroomIntroVideoManifest(manifest);
    const customVideo = normalizedManifest.customVideo;

    if (customVideo?.fileName) {
        const customFilePath = path.join(uploadsDirectoryPath, customVideo.fileName);
        const customFileStats = await safeStat(customFilePath);
        if (customFileStats) {
            return createCustomShowroomIntroVideoClientConfig({
                fileName: customVideo.fileName,
                originalFileName: customVideo.originalFileName,
                mimeType: SHOWROOM_INTRO_OUTPUT_MIME_TYPE,
                uploadedMimeType: customVideo.uploadedMimeType,
                width: SHOWROOM_INTRO_TARGET_WIDTH,
                height: SHOWROOM_INTRO_TARGET_HEIGHT,
                frameRate: SHOWROOM_INTRO_TARGET_FRAME_RATE,
                sizeBytes: Math.max(0, Number(customFileStats.size) || 0),
                updatedAt: customVideo.updatedAt,
                revision: customVideo.revision,
                url: createVersionedPublicUrl(
                    joinPublicPathSegments(uploadsPublicBasePath, customVideo.fileName),
                    customVideo.revision
                ),
            });
        }
    }

    return buildDefaultShowroomIntroVideoClientConfig({
        defaultVideoFilePath,
        defaultVideoPublicPath,
    });
}

function buildRemoteShowroomIntroVideoClientConfig({ row, storageBucket, publicBaseUrl }) {
    return createCustomShowroomIntroVideoClientConfig({
        fileName: row.file_name || SHOWROOM_INTRO_OUTPUT_FILE_NAME,
        originalFileName: row.original_file_name || 'showroom-demo-video',
        mimeType: row.mime_type || SHOWROOM_INTRO_OUTPUT_MIME_TYPE,
        uploadedMimeType: row.uploaded_mime_type || '',
        width: Math.max(1, Number(row.width) || SHOWROOM_INTRO_TARGET_WIDTH),
        height: Math.max(1, Number(row.height) || SHOWROOM_INTRO_TARGET_HEIGHT),
        frameRate: Math.max(1, Number(row.frame_rate) || SHOWROOM_INTRO_TARGET_FRAME_RATE),
        sizeBytes: Math.max(0, Number(row.size_bytes) || 0),
        updatedAt: sanitizeShowroomIntroTimestamp(row.updated_at),
        revision: sanitizeShowroomIntroRevision(row.revision),
        url: createSupabaseShowroomIntroVideoPublicUrl({
            publicBaseUrl,
            storageBucket,
            storagePath: row.storage_path,
            revision: row.revision,
        }),
    });
}

function createCustomShowroomIntroVideoClientConfig({
    fileName = SHOWROOM_INTRO_OUTPUT_FILE_NAME,
    originalFileName = 'showroom-demo-video',
    mimeType = SHOWROOM_INTRO_OUTPUT_MIME_TYPE,
    uploadedMimeType = '',
    width = SHOWROOM_INTRO_TARGET_WIDTH,
    height = SHOWROOM_INTRO_TARGET_HEIGHT,
    frameRate = SHOWROOM_INTRO_TARGET_FRAME_RATE,
    sizeBytes = 0,
    updatedAt = null,
    url = '',
}) {
    return {
        available: Boolean(url),
        isCustom: true,
        canReset: true,
        sourceLabel: 'Custom upload',
        statusText: 'Custom showroom demo is active.',
        fileName,
        originalFileName,
        mimeType,
        uploadedMimeType,
        width,
        height,
        frameRate,
        sizeBytes,
        updatedAt,
        url,
    };
}

async function buildDefaultShowroomIntroVideoClientConfig({
    defaultVideoFilePath,
    defaultVideoPublicPath,
}) {
    const defaultVideoStats = await safeStat(defaultVideoFilePath);
    const defaultUpdatedAt = defaultVideoStats?.mtime?.toISOString?.() || null;
    const defaultRevision = createShowroomIntroRevisionTag(defaultUpdatedAt);

    return {
        available: Boolean(defaultVideoStats),
        isCustom: false,
        canReset: false,
        sourceLabel: 'Built-in default',
        statusText: defaultVideoStats
            ? 'Using built-in showroom demo.'
            : 'Showroom demo video is missing on this server.',
        fileName: path.basename(defaultVideoFilePath),
        originalFileName: '',
        mimeType: SHOWROOM_INTRO_OUTPUT_MIME_TYPE,
        uploadedMimeType: '',
        width: SHOWROOM_INTRO_TARGET_WIDTH,
        height: SHOWROOM_INTRO_TARGET_HEIGHT,
        frameRate: SHOWROOM_INTRO_TARGET_FRAME_RATE,
        sizeBytes: Math.max(0, Number(defaultVideoStats?.size) || 0),
        updatedAt: defaultUpdatedAt,
        url: createVersionedPublicUrl(defaultVideoPublicPath, defaultRevision),
    };
}

async function safeStat(filePath) {
    try {
        return await fs.stat(filePath);
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

async function readShowroomIntroVideoRow(supabaseClient) {
    const { data, error } = await supabaseClient
        .from(SHOWROOM_INTRO_VIDEO_TABLE_NAME)
        .select(SHOWROOM_INTRO_VIDEO_SELECT_COLUMNS)
        .eq('slot_key', SHOWROOM_INTRO_VIDEO_ROW_KEY)
        .maybeSingle();

    if (error) {
        throw error;
    }
    return data && typeof data === 'object' ? data : null;
}

async function upsertShowroomIntroVideoRow(supabaseClient, row) {
    const { error } = await supabaseClient
        .from(SHOWROOM_INTRO_VIDEO_TABLE_NAME)
        .upsert(row, { onConflict: 'slot_key' });

    if (error) {
        throw error;
    }
}

async function deleteShowroomIntroVideoRow(supabaseClient) {
    const { error } = await supabaseClient
        .from(SHOWROOM_INTRO_VIDEO_TABLE_NAME)
        .delete()
        .eq('slot_key', SHOWROOM_INTRO_VIDEO_ROW_KEY);

    if (error) {
        throw error;
    }
}

async function uploadShowroomIntroStorageObject({
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

async function deleteShowroomIntroStorageObjects({
    supabaseClient,
    storageBucket,
    storagePaths = [],
}) {
    const safeStoragePaths = Array.isArray(storagePaths)
        ? storagePaths
              .map((storagePath) => sanitizeShowroomIntroStoragePath(storagePath))
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

function createVersionedPublicUrl(basePath, revision) {
    const normalizedBasePath =
        typeof basePath === 'string' && basePath.trim() ? basePath.trim() : '/assets/Demo/Demo.mp4';
    const version =
        typeof revision === 'string' && revision.trim() ? revision.trim() : 'default';
    return `${normalizedBasePath}?v=${encodeURIComponent(version)}`;
}

function joinPublicPathSegments(...segments) {
    const normalized = segments
        .map((segment) => String(segment || '').trim())
        .filter(Boolean)
        .map((segment, index) =>
            index === 0 ? segment.replace(/\/+$/u, '') : segment.replace(/^\/+/u, '')
        );

    if (!normalized.length) {
        return '/';
    }

    const [first, ...rest] = normalized;
    return [first, ...rest].join('/').replace(/\/{2,}/gu, '/');
}

function sanitizeShowroomIntroUploadMimeType(value) {
    const mimeType = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return SHOWROOM_INTRO_ACCEPTED_UPLOAD_MIME_TYPES[mimeType] ? mimeType : '';
}

function sanitizeShowroomIntroOriginalFileName(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        return 'showroom-demo-video';
    }
    return (
        path
            .basename(normalized)
            .replace(/[\u0000-\u001f\u007f]+/gu, '')
            .trim() || 'showroom-demo-video'
    );
}

function sanitizeShowroomIntroTimestamp(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        return null;
    }
    const time = Date.parse(normalized);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function createShowroomIntroRevisionTag(updatedAt) {
    const timestamp = Date.parse(updatedAt || '');
    if (!Number.isFinite(timestamp)) {
        return 'default';
    }
    const source = new Date(timestamp).toISOString();
    return source.replace(/[-:.TZ]/gu, '').slice(0, 17);
}

function sanitizeShowroomIntroRevision(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized || normalized.length > 64) {
        return '';
    }
    return normalized.replace(/[^a-zA-Z0-9-]/g, '');
}

function buildShowroomIntroStoragePath(revision, fileName = SHOWROOM_INTRO_OUTPUT_FILE_NAME) {
    const safeRevision = sanitizeShowroomIntroRevision(revision);
    const safeFileName = sanitizeStorageFileName(fileName);
    const assetId = crypto.randomUUID();
    return ['showroom-intro', safeRevision, assetId, safeFileName].filter(Boolean).join('/');
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

function sanitizeShowroomIntroStoragePath(value) {
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

function createSupabaseShowroomIntroVideoPublicUrl({
    publicBaseUrl,
    storageBucket,
    storagePath,
    revision,
}) {
    const safeBaseUrl = sanitizeSupabaseUrl(publicBaseUrl || '');
    const safeBucketName = sanitizeSupabaseStorageBucketName(storageBucket);
    const safeStoragePath = sanitizeShowroomIntroStoragePath(storagePath);
    if (!safeBaseUrl || !safeBucketName || !safeStoragePath) {
        return '';
    }

    return `${safeBaseUrl}/storage/v1/object/public/${encodeURIComponent(
        safeBucketName
    )}/${safeStoragePath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/')}?v=${encodeURIComponent(sanitizeShowroomIntroRevision(revision) || 'default')}`;
}

function createShowroomIntroVideoStoreError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeShowroomIntroVideoStoreError(error) {
    if (error?.statusCode) {
        return error;
    }
    return createShowroomIntroVideoStoreError(
        500,
        error?.message || 'Showroom intro video upload failed.'
    );
}

async function transcodeShowroomIntroVideo({
    inputFilePath,
    outputFilePath,
    targetWidth = SHOWROOM_INTRO_TARGET_WIDTH,
    targetHeight = SHOWROOM_INTRO_TARGET_HEIGHT,
    targetFrameRate = SHOWROOM_INTRO_TARGET_FRAME_RATE,
}) {
    const args = [
        '-y',
        '-i',
        inputFilePath,
        '-vf',
        [
            `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase:flags=lanczos`,
            `crop=${targetWidth}:${targetHeight}`,
            `fps=${targetFrameRate}`,
            'setsar=1',
        ].join(','),
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '18',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        outputFilePath,
    ];

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
                reject(
                    createShowroomIntroVideoStoreError(
                        500,
                        'ffmpeg is not installed on this server.'
                    )
                );
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
                createShowroomIntroVideoStoreError(
                    400,
                    stderr.trim()
                        ? 'Could not convert the uploaded video to showroom format.'
                        : 'Video conversion failed.'
                )
            );
        });
    });
}

async function ensureShowroomIntroVideoSchema({ connectionString } = {}) {
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
            create table if not exists public.${SHOWROOM_INTRO_VIDEO_TABLE_NAME} (
                slot_key text primary key,
                file_name text not null default '${SHOWROOM_INTRO_OUTPUT_FILE_NAME}',
                original_file_name text not null default '',
                uploaded_mime_type text not null default '',
                mime_type text not null default '${SHOWROOM_INTRO_OUTPUT_MIME_TYPE}',
                size_bytes bigint not null default 0 check (size_bytes >= 0),
                width integer not null default ${SHOWROOM_INTRO_TARGET_WIDTH} check (width > 0),
                height integer not null default ${SHOWROOM_INTRO_TARGET_HEIGHT} check (height > 0),
                frame_rate integer not null default ${SHOWROOM_INTRO_TARGET_FRAME_RATE} check (frame_rate > 0),
                revision text not null default '',
                storage_path text not null default '',
                updated_at timestamptz not null default now(),
                constraint showroom_intro_videos_slot_key_check check (slot_key <> '')
            );

            alter table public.${SHOWROOM_INTRO_VIDEO_TABLE_NAME} enable row level security;

            grant select on table public.${SHOWROOM_INTRO_VIDEO_TABLE_NAME} to anon, authenticated;

            do $$
            begin
                if not exists (
                    select 1
                    from pg_policies
                    where schemaname = 'public'
                        and tablename = '${SHOWROOM_INTRO_VIDEO_TABLE_NAME}'
                        and policyname = 'showroom_intro_videos_select_public'
                ) then
                    create policy showroom_intro_videos_select_public
                        on public.${SHOWROOM_INTRO_VIDEO_TABLE_NAME}
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
    SHOWROOM_INTRO_ACCEPTED_UPLOAD_MIME_TYPES,
    SHOWROOM_INTRO_MAX_UPLOAD_BYTES,
    SHOWROOM_INTRO_OUTPUT_FILE_NAME,
    SHOWROOM_INTRO_TARGET_FRAME_RATE,
    SHOWROOM_INTRO_TARGET_HEIGHT,
    SHOWROOM_INTRO_TARGET_WIDTH,
    createShowroomIntroVideoStore,
    ensureShowroomIntroVideoSchema,
    normalizeShowroomIntroVideoManifest,
    sanitizeShowroomIntroOriginalFileName,
    sanitizeShowroomIntroUploadMimeType,
};
