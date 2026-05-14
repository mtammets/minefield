const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const SHOWROOM_INTRO_MANIFEST_VERSION = 1;
const SHOWROOM_INTRO_OUTPUT_FILE_NAME = 'Demo.mp4';
const SHOWROOM_INTRO_OUTPUT_MIME_TYPE = 'video/mp4';
const SHOWROOM_INTRO_TARGET_WIDTH = 1680;
const SHOWROOM_INTRO_TARGET_HEIGHT = 900;
const SHOWROOM_INTRO_TARGET_FRAME_RATE = 30;
const SHOWROOM_INTRO_MAX_UPLOAD_BYTES = 300 * 1024 * 1024;
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
} = {}) {
    if (!manifestFilePath || !uploadsDirectoryPath || !defaultVideoFilePath) {
        throw new Error(
            'Showroom intro video store requires manifest, uploads directory, and default video paths.'
        );
    }

    return {
        async readConfig() {
            return readShowroomIntroVideoConfig({
                manifestFilePath,
                uploadsDirectoryPath,
                uploadsPublicBasePath,
                defaultVideoFilePath,
                defaultVideoPublicPath,
            });
        },
        async writeUploadedVideo(payload = {}) {
            return writeUploadedShowroomIntroVideo({
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
            return resetShowroomIntroVideo({
                manifestFilePath,
                uploadsDirectoryPath,
                uploadsPublicBasePath,
                defaultVideoFilePath,
                defaultVideoPublicPath,
            });
        },
    };
}

async function readShowroomIntroVideoConfig({
    manifestFilePath,
    uploadsDirectoryPath,
    uploadsPublicBasePath,
    defaultVideoFilePath,
    defaultVideoPublicPath,
}) {
    const manifest = await readShowroomIntroVideoManifest(manifestFilePath);
    return buildShowroomIntroVideoClientConfig({
        manifest,
        uploadsDirectoryPath,
        uploadsPublicBasePath,
        defaultVideoFilePath,
        defaultVideoPublicPath,
    });
}

async function writeUploadedShowroomIntroVideo({
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

        return buildShowroomIntroVideoClientConfig({
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

async function resetShowroomIntroVideo({
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
        video: await buildShowroomIntroVideoClientConfig({
            manifest,
            uploadsDirectoryPath,
            uploadsPublicBasePath,
            defaultVideoFilePath,
            defaultVideoPublicPath,
        }),
    };
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
        typeof value.revision === 'string' && value.revision.trim()
            ? value.revision.trim()
            : createShowroomIntroRevisionTag(updatedAt);

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

async function buildShowroomIntroVideoClientConfig({
    manifest,
    uploadsDirectoryPath,
    uploadsPublicBasePath,
    defaultVideoFilePath,
    defaultVideoPublicPath,
}) {
    const normalizedManifest = normalizeShowroomIntroVideoManifest(manifest);
    const customVideo = normalizedManifest.customVideo;

    if (customVideo) {
        const customFilePath = path.join(uploadsDirectoryPath, customVideo.fileName);
        const customFileStats = await safeStat(customFilePath);
        if (customFileStats) {
            return {
                available: true,
                isCustom: true,
                canReset: true,
                sourceLabel: 'Custom upload',
                statusText: 'Custom showroom demo is active.',
                fileName: customVideo.fileName,
                originalFileName: customVideo.originalFileName,
                mimeType: SHOWROOM_INTRO_OUTPUT_MIME_TYPE,
                uploadedMimeType: customVideo.uploadedMimeType,
                width: SHOWROOM_INTRO_TARGET_WIDTH,
                height: SHOWROOM_INTRO_TARGET_HEIGHT,
                frameRate: SHOWROOM_INTRO_TARGET_FRAME_RATE,
                sizeBytes: Math.max(0, Number(customFileStats.size) || 0),
                updatedAt: customVideo.updatedAt,
                url: createVersionedPublicUrl(
                    joinPublicPathSegments(uploadsPublicBasePath, customVideo.fileName),
                    customVideo.revision
                ),
            };
        }
    }

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

function createVersionedPublicUrl(basePath, revision) {
    const normalizedBasePath =
        typeof basePath === 'string' && basePath.trim() ? basePath.trim() : '/assets/Demo/Demo.mp4';
    const version = typeof revision === 'string' && revision.trim() ? revision.trim() : 'default';
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

function createShowroomIntroVideoStoreError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
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

module.exports = {
    SHOWROOM_INTRO_ACCEPTED_UPLOAD_MIME_TYPES,
    SHOWROOM_INTRO_MAX_UPLOAD_BYTES,
    SHOWROOM_INTRO_OUTPUT_FILE_NAME,
    SHOWROOM_INTRO_TARGET_FRAME_RATE,
    SHOWROOM_INTRO_TARGET_HEIGHT,
    SHOWROOM_INTRO_TARGET_WIDTH,
    createShowroomIntroVideoStore,
    normalizeShowroomIntroVideoManifest,
    sanitizeShowroomIntroOriginalFileName,
    sanitizeShowroomIntroUploadMimeType,
};
