const test = require('node:test');
const assert = require('node:assert/strict');

const wheelPresetsModulePromise = import('../public/js/wheel-presets.js');

test('wheel presets expose both stock and premium showroom options', async () => {
    const { PLAYER_WHEEL_PRESETS, DEFAULT_PLAYER_WHEEL_PRESET_ID, getPlayerWheelPresetById } =
        await wheelPresetsModulePromise;

    assert.equal(PLAYER_WHEEL_PRESETS.length, 2);
    assert.equal(DEFAULT_PLAYER_WHEEL_PRESET_ID, PLAYER_WHEEL_PRESETS[0].id);
    assert.equal(getPlayerWheelPresetById('photon-turbine').name, 'Photon Turbine');
});

test('wheel preset resolution sanitizes invalid values back to the default preset', async () => {
    const {
        DEFAULT_PLAYER_WHEEL_PRESET_ID,
        getPlayerWheelPresetIndex,
        resolvePlayerWheelPresetId,
        sanitizePlayerWheelPresetId,
    } = await wheelPresetsModulePromise;

    assert.equal(sanitizePlayerWheelPresetId(' Photon_Turbine '), 'photonturbine');
    assert.equal(resolvePlayerWheelPresetId(' Photon_Turbine '), DEFAULT_PLAYER_WHEEL_PRESET_ID);
    assert.equal(resolvePlayerWheelPresetId('photon-turbine'), 'photon-turbine');
    assert.equal(getPlayerWheelPresetIndex('photon-turbine'), 1);
});
