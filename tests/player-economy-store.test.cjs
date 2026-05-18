const test = require('node:test');
const assert = require('node:assert/strict');

const {
    PlayerEconomySyncError,
    applyAuthoritativeSyncTransactionToProfile,
} = require('../server/player-economy-store');

test('round reward credits are recalculated server-side from submitted stats', () => {
    const result = applyAuthoritativeSyncTransactionToProfile(
        createProfile({
            credits: 0,
        }),
        {
            kind: 'round-reward',
            creditsDelta: 10,
            metadata: {
                pickupCount: 8,
                mineKillCount: 0,
                selfScore: 300,
                runSettled: true,
                isWinner: false,
                gameMode: 'bots',
                finishReason: '',
                clientTransactionId: 'round-reward:abcd1234',
            },
        }
    );

    assert.equal(result.changed, true);
    assert.equal(result.nextEconomy.credits, 10);
    assert.equal(result.transaction.creditsDelta, 10);
    assert.deepEqual(
        result.transaction.metadata.breakdown.map((entry) => entry.id),
        ['pickup-run', 'settlement']
    );
});

test('round reward rejects client totals that do not match the server calculation', () => {
    assert.throws(
        () =>
            applyAuthoritativeSyncTransactionToProfile(createProfile(), {
                kind: 'round-reward',
                creditsDelta: 999,
                metadata: {
                    pickupCount: 2,
                    mineKillCount: 1,
                    selfScore: 200,
                    runSettled: true,
                    isWinner: false,
                    gameMode: 'bots',
                    finishReason: '',
                },
            }),
        (error) =>
            error instanceof PlayerEconomySyncError && error.reason === 'credits-mismatch'
    );
});

test('vehicle unlock uses the server price and unlocks the chassis', () => {
    const result = applyAuthoritativeSyncTransactionToProfile(
        createProfile({
            credits: 200,
        }),
        {
            kind: 'vehicle-unlock',
            creditsDelta: -180,
            metadata: {
                vehicleId: 'apex-formula',
            },
        }
    );

    assert.equal(result.changed, true);
    assert.equal(result.nextEconomy.credits, 20);
    assert.deepEqual(result.nextEconomy.unlockedVehicleIds, ['voltline-sled', 'apex-formula']);
    assert.equal(result.transaction.summary, 'Unlocked Apex Formula');
});

test('wheel unlock rejects when the wallet cannot afford the server price', () => {
    assert.throws(
        () =>
            applyAuthoritativeSyncTransactionToProfile(
                createProfile({
                    credits: 20,
                }),
                {
                    kind: 'wheel-unlock',
                    creditsDelta: -140,
                    metadata: {
                        wheelPresetId: 'leviathan-rift',
                    },
                }
            ),
        (error) =>
            error instanceof PlayerEconomySyncError && error.reason === 'not-enough-credits'
    );
});

test('purchase transaction is only accepted for trusted internal callers', () => {
    assert.throws(
        () =>
            applyAuthoritativeSyncTransactionToProfile(createProfile(), {
                kind: 'purchase',
                creditsDelta: 1500,
                metadata: {
                    checkoutSessionId: 'cs_test_checkout_12345678',
                },
            }),
        (error) =>
            error instanceof PlayerEconomySyncError &&
            error.reason === 'unsupported-transaction'
    );

    const trustedResult = applyAuthoritativeSyncTransactionToProfile(
        createProfile(),
        {
            kind: 'purchase',
            creditsDelta: 1500,
            summary: 'Purchased 1500 Credits',
            metadata: {
                checkoutSessionId: 'cs_test_checkout_12345678',
                purchasePackId: 'credits-pack-1500',
                amountCents: 100,
                currencyCode: 'eur',
            },
        },
        {
            allowPurchase: true,
        }
    );

    assert.equal(trustedResult.changed, true);
    assert.equal(trustedResult.nextEconomy.credits, 1500);
    assert.equal(trustedResult.transaction.kind, 'purchase');
});

function createProfile(overrides = {}) {
    return {
        userId: 'user-123456',
        exists: true,
        credits: 0,
        unlockedVehicleIds: ['voltline-sled'],
        unlockedWheelPresetIds: ['scarlet-switchblade', 'photon-turbine', 'obsidian-halo'],
        lifetimeEarned: 0,
        lifetimeSpent: 0,
        transactionCount: 0,
        lastTransactionKind: '',
        lastTransactionSummary: '',
        lastSyncedAt: '',
        createdAt: '',
        updatedAt: '',
        recentTransactions: [],
        ...overrides,
    };
}
