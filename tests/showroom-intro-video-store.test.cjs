const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const {
    SHOWROOM_INTRO_OUTPUT_FILE_NAME,
    createShowroomIntroVideoStore,
    sanitizeShowroomIntroOriginalFileName,
    sanitizeShowroomIntroUploadMimeType,
} = require('../server/showroom-intro-video-store');

test('sanitizeShowroomIntroUploadMimeType accepts supported video mime types', () => {
    assert.equal(sanitizeShowroomIntroUploadMimeType(' video/quicktime '), 'video/quicktime');
    assert.equal(sanitizeShowroomIntroUploadMimeType('image/png'), '');
});

test('sanitizeShowroomIntroOriginalFileName strips unsafe path segments', () => {
    assert.equal(
        sanitizeShowroomIntroOriginalFileName('../clips/Showroom Demo.mov'),
        'Showroom Demo.mov'
    );
    assert.equal(sanitizeShowroomIntroOriginalFileName(''), 'showroom-demo-video');
});

test('showroom intro store writes custom video config and resets back to default', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'showroom-intro-store-'));
    const manifestFilePath = path.join(tempRoot, 'server', 'data', 'showroom-intro-video.json');
    const uploadsDirectoryPath = path.join(tempRoot, 'public', 'uploads', 'showroom-intro');
    const defaultVideoFilePath = path.join(tempRoot, 'public', 'assets', 'Demo', 'Demo.mp4');

    await fs.mkdir(path.dirname(defaultVideoFilePath), { recursive: true });
    await fs.writeFile(defaultVideoFilePath, 'default-video', 'utf8');

    const store = createShowroomIntroVideoStore({
        manifestFilePath,
        uploadsDirectoryPath,
        uploadsPublicBasePath: '/uploads/showroom-intro',
        defaultVideoFilePath,
        defaultVideoPublicPath: '/assets/Demo/Demo.mp4',
        async transcodeVideo({ outputFilePath }) {
            await fs.mkdir(path.dirname(outputFilePath), { recursive: true });
            await fs.writeFile(outputFilePath, 'converted-video', 'utf8');
        },
    });

    const defaultConfig = await store.readConfig();
    assert.equal(defaultConfig.isCustom, false);
    assert.match(defaultConfig.url, /^\/assets\/Demo\/Demo\.mp4\?v=/);

    const uploadedConfig = await store.writeUploadedVideo({
        buffer: Buffer.from('source-video'),
        mimeType: 'video/quicktime',
        originalFileName: 'My Demo.mov',
    });
    assert.equal(uploadedConfig.isCustom, true);
    assert.equal(uploadedConfig.fileName, SHOWROOM_INTRO_OUTPUT_FILE_NAME);
    assert.match(uploadedConfig.url, /^\/uploads\/showroom-intro\/Demo\.mp4\?v=/);

    const savedManifest = JSON.parse(await fs.readFile(manifestFilePath, 'utf8'));
    assert.equal(savedManifest.customVideo.originalFileName, 'My Demo.mov');

    const diskOutputFilePath = path.join(uploadsDirectoryPath, SHOWROOM_INTRO_OUTPUT_FILE_NAME);
    assert.equal(await fs.readFile(diskOutputFilePath, 'utf8'), 'converted-video');

    const resetResult = await store.resetVideo();
    assert.equal(resetResult.removed, true);
    assert.equal(resetResult.video.isCustom, false);

    const resetConfig = await store.readConfig();
    assert.equal(resetConfig.isCustom, false);
    await assert.rejects(fs.access(diskOutputFilePath));
});
