const test = require('node:test');
const assert = require('node:assert/strict');

const bindingsModule = import('../public/js/input-bindings.js');

test('camera shortcuts work with the symbols produced by macOS Option keys', async () => {
    const { ACTION_IDS, actionMatchesEvent } = await bindingsModule;
    assert.equal(
        actionMatchesEvent(ACTION_IDS.cameraView1, {
            key: '¡',
            code: 'Digit1',
            altKey: true,
        }),
        true
    );
    assert.equal(
        actionMatchesEvent(ACTION_IDS.cameraCinematicToggle, {
            key: 'ç',
            code: 'KeyC',
            altKey: true,
        }),
        true
    );
    assert.equal(
        actionMatchesEvent(ACTION_IDS.cameraView1, {
            key: '¡',
            code: 'Digit1',
            altKey: true,
            shiftKey: true,
        }),
        false
    );
    assert.equal(
        actionMatchesEvent(ACTION_IDS.roofModeDashboard, {
            key: '¡',
            code: 'Digit1',
            altKey: true,
        }),
        false
    );
});

test('unmodified driving keys still respect the user keyboard layout', async () => {
    const { ACTION_IDS, actionMatchesEvent } = await bindingsModule;
    assert.equal(actionMatchesEvent(ACTION_IDS.driveForward, { key: 'z', code: 'KeyW' }), false);
    assert.equal(actionMatchesEvent(ACTION_IDS.driveForward, { key: 'w', code: 'KeyZ' }), true);
});
