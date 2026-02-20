const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const inputContextModulePromise = import(
    pathToFileURL(path.join(__dirname, '..', 'public/js/input-context.js')).href
);

test('resolveWorldMapDriveLockMode uses pause for bots and autobrake for active online rooms', async () => {
    const { resolveWorldMapDriveLockMode, WORLD_MAP_DRIVE_LOCK_MODES } =
        await inputContextModulePromise;

    assert.equal(
        resolveWorldMapDriveLockMode({ gameMode: 'bots', inOnlineRoom: false }),
        WORLD_MAP_DRIVE_LOCK_MODES.pause
    );
    assert.equal(
        resolveWorldMapDriveLockMode({ gameMode: 'online', inOnlineRoom: false }),
        WORLD_MAP_DRIVE_LOCK_MODES.pause
    );
    assert.equal(
        resolveWorldMapDriveLockMode({ gameMode: 'online', inOnlineRoom: true }),
        WORLD_MAP_DRIVE_LOCK_MODES.autobrake
    );
});

test('resolveGameplayInputContext keeps deterministic priority order', async () => {
    const { resolveGameplayInputContext, INPUT_CONTEXTS } = await inputContextModulePromise;

    assert.equal(
        resolveGameplayInputContext({
            welcomeVisible: true,
            mapOpen: true,
            paused: true,
        }),
        INPUT_CONTEXTS.welcomeModal
    );
    assert.equal(
        resolveGameplayInputContext({
            mapOpen: true,
            paused: true,
            editModeActive: true,
        }),
        INPUT_CONTEXTS.fullMap
    );
    assert.equal(
        resolveGameplayInputContext({
            paused: true,
            editModeActive: true,
            replayPlaybackActive: true,
        }),
        INPUT_CONTEXTS.paused
    );
    assert.equal(
        resolveGameplayInputContext({
            editModeActive: true,
            raceIntroDriveLocked: true,
        }),
        INPUT_CONTEXTS.editMode
    );
    assert.equal(
        resolveGameplayInputContext({
            raceIntroDriveLocked: true,
            replayPlaybackActive: true,
        }),
        INPUT_CONTEXTS.raceIntroLocked
    );
    assert.equal(
        resolveGameplayInputContext({
            replayPlaybackActive: true,
        }),
        INPUT_CONTEXTS.replayPlayback
    );
    assert.equal(resolveGameplayInputContext({}), INPUT_CONTEXTS.gameplay);
});

