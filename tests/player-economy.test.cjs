const test = require('node:test');
const assert = require('node:assert/strict');

const playerEconomyModulePromise = import('../public/js/player-economy.js');

test('default economy keeps leviathan locked while the three standard wheel sets are owned', async () => {
    const {
        createDefaultPlayerEconomyState,
        getOwnedWheelPresetCountForEconomy,
        isWheelPresetUnlockedForEconomy,
    } = await playerEconomyModulePromise;

    const state = createDefaultPlayerEconomyState();

    assert.equal(getOwnedWheelPresetCountForEconomy(state), 3);
    assert.equal(isWheelPresetUnlockedForEconomy(state, 'scarlet-switchblade'), true);
    assert.equal(isWheelPresetUnlockedForEconomy(state, 'photon-turbine'), true);
    assert.equal(isWheelPresetUnlockedForEconomy(state, 'obsidian-halo'), true);
    assert.equal(isWheelPresetUnlockedForEconomy(state, 'leviathan-rift'), false);
});

test('purchasing leviathan unlocks and equips it through the economy helpers', async () => {
    const {
        createDefaultPlayerEconomyState,
        purchaseWheelPresetWithEconomy,
        resolveOwnedWheelPresetIdForEconomy,
    } = await playerEconomyModulePromise;

    const initialState = createDefaultPlayerEconomyState();
    const purchaseResult = purchaseWheelPresetWithEconomy(
        {
            ...initialState,
            credits: 200,
        },
        'leviathan-rift'
    );

    assert.equal(purchaseResult.ok, true);
    assert.equal(purchaseResult.costCredits, 140);
    assert.equal(purchaseResult.economy.credits, 60);
    assert.deepEqual(purchaseResult.economy.unlockedWheelPresetIds, [
        'scarlet-switchblade',
        'photon-turbine',
        'obsidian-halo',
        'leviathan-rift',
    ]);
    assert.equal(
        resolveOwnedWheelPresetIdForEconomy('leviathan-rift', purchaseResult.economy),
        'leviathan-rift'
    );
});
