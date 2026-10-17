const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const {
    createBillboardContentStore,
    parseBillboardDataUrlPayload,
    sanitizeBillboardContentGroupId,
    sanitizeBillboardUploadFileName,
} = require('../server/billboard-content-store');

test('sanitizeBillboardContentGroupId normalizes safe ids and rejects invalid ones', () => {
    assert.equal(sanitizeBillboardContentGroupId(' Wide-Posters '), 'wide-posters');
    assert.equal(sanitizeBillboardContentGroupId('city_video-wall'), 'city_video-wall');
    assert.equal(sanitizeBillboardContentGroupId('../escape'), '');
    assert.equal(sanitizeBillboardContentGroupId(''), '');
});

test('sanitizeBillboardUploadFileName strips extensions and unsafe characters', () => {
    assert.equal(sanitizeBillboardUploadFileName('Suur Pilt!!.png'), 'suur-pilt');
    assert.equal(sanitizeBillboardUploadFileName('räme failinimi.mp4'), 'rame-failinimi');
    assert.equal(sanitizeBillboardUploadFileName('////'), 'media');
});

test('parseBillboardDataUrlPayload decodes allowed base64 payloads', () => {
    const payload = parseBillboardDataUrlPayload('data:image/png;base64,aGVsbG8=');

    assert.equal(payload.mimeType, 'image/png');
    assert.equal(payload.buffer.toString('utf8'), 'hello');
});

test('billboard content store writes grouped media, persists manifest, and resets cleanly', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'billboard-store-'));
    const manifestFilePath = path.join(tempRoot, 'data', 'billboard-content.json');
    const uploadsDirectoryPath = path.join(tempRoot, 'public', 'uploads', 'billboards');
    const store = createBillboardContentStore({
        manifestFilePath,
        uploadsDirectoryPath,
        uploadsPublicBasePath: '/uploads/billboards',
    });

    const imagePayload = {
        mediaKind: 'image',
        items: [
            {
                name: 'Hero Poster.png',
                dataUrl: 'data:image/png;base64,aGVsbG8=',
            },
            {
                name: 'Second Poster.webp',
                dataUrl: 'data:image/webp;base64,d29ybGQ=',
            },
        ],
    };

    const writeResult = await store.writeGroupMedia('wide-posters', imagePayload);
    assert.equal(writeResult.group.groupId, 'wide-posters');
    assert.equal(writeResult.group.mediaKind, 'image');
    assert.equal(writeResult.group.items.length, 2);
    assert.match(writeResult.group.items[0].url, /^\/uploads\/billboards\/wide-posters\//);
    assert.match(writeResult.group.items[0].url, /\?v=/);

    const savedManifest = JSON.parse(await fs.readFile(manifestFilePath, 'utf8'));
    assert.equal(savedManifest.groups['wide-posters'].items.length, 2);

    const firstDiskFile = path.join(
        uploadsDirectoryPath,
        'wide-posters',
        savedManifest.groups['wide-posters'].items[0].fileName
    );
    assert.equal(await fs.readFile(firstDiskFile, 'utf8'), 'hello');

    const readBack = await store.readManifest();
    assert.equal(readBack.groups['wide-posters'].items.length, 2);

    const resetResult = await store.resetGroup('wide-posters');
    assert.equal(resetResult.removed, true);
    assert.equal(resetResult.manifest.groups['wide-posters'], undefined);
    await assert.rejects(fs.access(path.join(uploadsDirectoryPath, 'wide-posters')));
});
