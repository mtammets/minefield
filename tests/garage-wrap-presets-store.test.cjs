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
