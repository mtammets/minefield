const test = require('node:test');
const assert = require('node:assert/strict');

const accountLocalDataModulePromise = import('../public/js/account-local-data.js');

test('resolveAccountLocalStorageKeys appends the Supabase auth storage key', async () => {
    const { resolveAccountLocalStorageKeys } = await accountLocalDataModulePromise;

    const keys = resolveAccountLocalStorageKeys('abc123proj');
    assert.equal(keys.includes('silentdrift-player-economy-v1'), true);
    assert.equal(keys.includes('minefield-drift-auth-abc123proj'), true);
});

test('clearAccountLocalData removes known keys and tolerates storage failures', async () => {
    const { clearAccountLocalData, resolveAccountLocalStorageKeys } =
        await accountLocalDataModulePromise;
    const removed = [];
    const failingKey = 'silentdrift-player-car-skin-id';
    const expectedKeys = resolveAccountLocalStorageKeys('abc123proj');

    const result = clearAccountLocalData({
        projectRef: 'abc123proj',
        storage: {
            removeItem(key) {
                if (key === failingKey) {
                    throw new Error('storage blocked');
                }
                removed.push(key);
            },
        },
    });

    assert.equal(removed.includes('silentdrift-player-economy-v1'), true);
    assert.equal(removed.includes('minefield-drift-auth-abc123proj'), true);
    assert.equal(removed.includes(failingKey), false);
    assert.equal(result.includes(failingKey), false);
    assert.equal(result.length, expectedKeys.length - 1);
});
