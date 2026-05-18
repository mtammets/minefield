const test = require('node:test');
const assert = require('node:assert/strict');

const playerEconomyModulePromise = import('../public/js/player-economy.js');

test('default economy keeps leviathan locked while the three standard wheel sets are owned', async () => {
    const {
        createDefaultPlayerEconomyState,
        isVehicleUnlockedForEconomy,
        getOwnedWheelPresetCountForEconomy,
        isWheelPresetUnlockedForEconomy,
    } = await playerEconomyModulePromise;

    const state = createDefaultPlayerEconomyState();

    assert.equal(isVehicleUnlockedForEconomy(state, 'voltline-sled'), true);
    assert.equal(isVehicleUnlockedForEconomy(state, 'apex-formula'), false);
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

test('garage wheel preset display order puts locked presets first and keeps the active preset last', async () => {
    const { createDefaultPlayerEconomyState, getGarageWheelPresetDisplayOrder } =
        await playerEconomyModulePromise;

    const state = createDefaultPlayerEconomyState();

    assert.deepEqual(getGarageWheelPresetDisplayOrder(state, 'obsidian-halo'), [
        'leviathan-rift',
        'scarlet-switchblade',
        'photon-turbine',
        'obsidian-halo',
    ]);
    assert.deepEqual(getGarageWheelPresetDisplayOrder(state, 'leviathan-rift'), [
        'scarlet-switchblade',
        'photon-turbine',
        'obsidian-halo',
        'leviathan-rift',
    ]);
});

test('authenticated wallet cache is restored only for the matching account', async () => {
    const { persistPlayerEconomyState, readPersistedPlayerEconomyState } =
        await playerEconomyModulePromise;
    const previousWindow = global.window;
    const storage = createMockStorage();
    global.window = {
        localStorage: storage,
    };

    try {
        persistPlayerEconomyState(
            {
                credits: 2088,
                unlockedVehicleIds: ['voltline-sled', 'apex-formula'],
            },
            {
                ownerUserId: 'user-123456',
            }
        );

        const sameAccount = readPersistedPlayerEconomyState({
            ownerUserId: 'user-123456',
        });
        assert.equal(sameAccount.credits, 2088);
        assert.deepEqual(sameAccount.unlockedVehicleIds, ['voltline-sled', 'apex-formula']);

        const otherAccount = readPersistedPlayerEconomyState({
            ownerUserId: 'user-654321',
        });
        assert.equal(otherAccount.credits, 0);
        assert.deepEqual(otherAccount.unlockedVehicleIds, ['voltline-sled']);
    } finally {
        global.window = previousWindow;
    }
});

test('legacy unscoped wallet cache is ignored after sign-in', async () => {
    const { PLAYER_ECONOMY_STORAGE_KEY, readPersistedPlayerEconomyState } =
        await playerEconomyModulePromise;
    const previousWindow = global.window;
    const storage = createMockStorage();
    global.window = {
        localStorage: storage,
    };

    try {
        storage.setItem(
            PLAYER_ECONOMY_STORAGE_KEY,
            JSON.stringify({
                credits: 2088,
                unlockedVehicleIds: ['voltline-sled', 'apex-formula'],
                unlockedWheelPresetIds: [
                    'scarlet-switchblade',
                    'photon-turbine',
                    'obsidian-halo',
                    'leviathan-rift',
                ],
            })
        );

        const authenticatedState = readPersistedPlayerEconomyState({
            ownerUserId: 'user-123456',
        });
        assert.equal(authenticatedState.credits, 0);
        assert.deepEqual(authenticatedState.unlockedVehicleIds, ['voltline-sled']);
        assert.deepEqual(authenticatedState.unlockedWheelPresetIds, [
            'scarlet-switchblade',
            'photon-turbine',
            'obsidian-halo',
        ]);
    } finally {
        global.window = previousWindow;
    }
});

function createMockStorage() {
    const values = new Map();
    return {
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            values.set(String(key), String(value));
        },
        removeItem(key) {
            values.delete(String(key));
        },
    };
}
