const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const {
    createGarageWrapPresetStore,
    DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS,
} = require('../server/garage-wrap-presets-store');

test('garage wrap preset store exposes built-in preset slots by default', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'garage-wrap-presets-store-'));
    const manifestFilePath = path.join(tempRoot, 'server', 'data', 'garage-wrap-presets.json');
    const uploadsDirectoryPath = path.join(tempRoot, 'public', 'uploads', 'garage-wrap-presets');
    const store = createGarageWrapPresetStore({
        manifestFilePath,
        uploadsDirectoryPath,
        uploadsPublicBasePath: '/uploads/garage-wrap-presets',
    });

    const config = await store.readConfig();
    assert.equal(config.presets.length, DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS.length);
    assert.equal(config.presets[0].id, DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS[0].id);
    assert.equal(config.presets[0].url, DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS[0].defaultUrl);
    assert.equal(config.presets[0].canDelete, false);
});

test('garage wrap preset store can override built-ins, create custom slots, and remove them', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'garage-wrap-presets-store-'));
    const manifestFilePath = path.join(tempRoot, 'server', 'data', 'garage-wrap-presets.json');
    const uploadsDirectoryPath = path.join(tempRoot, 'public', 'uploads', 'garage-wrap-presets');
    const store = createGarageWrapPresetStore({
        manifestFilePath,
        uploadsDirectoryPath,
        uploadsPublicBasePath: '/uploads/garage-wrap-presets',
    });

    const overriddenConfig = await store.writePresetImage('skin-1', {
        buffer: Buffer.from('default-override'),
        mimeType: 'image/png',
        originalFileName: 'override.png',
    });
    const overriddenPreset = overriddenConfig.presets.find((preset) => preset.id === 'skin-1');
    assert.equal(overriddenPreset.canReset, true);
    assert.match(overriddenPreset.url, /^\/uploads\/garage-wrap-presets\/skin-1-/);

    const createdConfig = await store.createPresetImage({
        buffer: Buffer.from('custom-slot'),
        mimeType: 'image/webp',
        originalFileName: 'night-run.webp',
    });
    const customPreset = createdConfig.presets.find((preset) => preset.source === 'custom');
    assert.ok(customPreset);
    assert.match(customPreset.url, /^\/uploads\/garage-wrap-presets\/custom-wrap-/);
    assert.equal(customPreset.canDelete, true);

    const uploads = await fs.readdir(uploadsDirectoryPath);
    assert.equal(uploads.length, 2);

    const resetResult = await store.removePreset('skin-1');
    assert.equal(resetResult.removed, true);
    const resetPreset = resetResult.presets.find((preset) => preset.id === 'skin-1');
    assert.equal(resetPreset.canReset, false);
    assert.equal(resetPreset.url, DEFAULT_GARAGE_WRAP_PRESET_DEFINITIONS[0].defaultUrl);

    const deleteResult = await store.removePreset(customPreset.id);
    assert.equal(deleteResult.removed, true);
    assert.equal(
        deleteResult.presets.some((preset) => preset.id === customPreset.id),
        false
    );
});

test('garage wrap preset store keeps remote presets whose storage paths contain spaces', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'garage-wrap-presets-store-'));
    const manifestFilePath = path.join(tempRoot, 'server', 'data', 'garage-wrap-presets.json');
    const uploadsDirectoryPath = path.join(tempRoot, 'public', 'uploads', 'garage-wrap-presets');
    const remoteRows = [
        {
            preset_id: 'skin-1',
            source: 'default',
            label: 'Preset Skin 1',
            file_name: 'Screenshot 2026-05-16 at 00.38.58.jpg',
            original_file_name: 'Screenshot 2026-05-16 at 00.38.58.webp',
            uploaded_mime_type: 'image/webp',
            mime_type: 'image/jpeg',
            size_bytes: 1024,
            width: 2048,
            height: 1024,
            revision: '20260515213906921-e5d234',
            storage_path:
                'garage-wrap-presets/20260515213906921-e5d234/850881d4-5f16-4706-80e1-e2ede8be1db4/Screenshot 2026-05-16 at 00.38.58.jpg',
            created_at: '2026-05-15T21:39:06.921+00:00',
            updated_at: '2026-05-15T21:39:06.921+00:00',
        },
        {
            preset_id: 'skin-3',
            source: 'default',
            label: 'Preset Skin 3',
            file_name: 'Screenshot 2026-05-15 at 15.06.05.jpg',
            original_file_name: 'Screenshot 2026-05-15 at 15.06.05.png',
            uploaded_mime_type: 'image/png',
            mime_type: 'image/jpeg',
            size_bytes: 1024,
            width: 2048,
            height: 1024,
            revision: '20260515120636272-133def',
            storage_path:
                'garage-wrap-presets/20260515120636272-133def/c1a10161-531b-40d3-80e7-51ee4a92d041/Screenshot 2026-05-15 at 15.06.05.jpg',
            created_at: '2026-05-15T12:06:36.272+00:00',
            updated_at: '2026-05-15T12:06:36.272+00:00',
        },
    ];
    const supabaseClient = {
        from(tableName) {
            assert.equal(tableName, 'garage_wrap_presets');
            const result = {
                select() {
                    return result;
                },
                order() {
                    return result;
                },
                then(resolve, reject) {
                    return Promise.resolve({
                        data: remoteRows,
                        error: null,
                    }).then(resolve, reject);
                },
            };
            return result;
        },
    };
    const store = createGarageWrapPresetStore({
        manifestFilePath,
        uploadsDirectoryPath,
        supabaseClient,
        storageBucket: 'garage-wrap-presets',
        publicBaseUrl: 'https://example.supabase.co',
    });

    const config = await store.readConfig();
    const skin1 = config.presets.find((preset) => preset.id === 'skin-1');
    const skin3 = config.presets.find((preset) => preset.id === 'skin-3');

    assert.ok(skin1);
    assert.ok(skin3);
    assert.match(
        skin1.url,
        /Screenshot%202026-05-16%20at%2000\.38\.58\.jpg\?v=20260515213906921-e5d234$/
    );
    assert.match(
        skin3.url,
        /Screenshot%202026-05-15%20at%2015\.06\.05\.jpg\?v=20260515120636272-133def$/
    );
    assert.equal(skin1.hasCustomImage, true);
    assert.equal(skin3.hasCustomImage, true);
});
