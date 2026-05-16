const test = require('node:test');
const assert = require('node:assert/strict');

const { AccountDeletionError, deleteAccount } = require('../server/account-deletion');

test('deleteAccount removes cleanup data before deleting the auth user', async () => {
    const calls = [];

    const summary = await deleteAccount({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        deleteProfileImages: async () => {
            calls.push('profile-images');
            return { deletedCount: 1 };
        },
        deleteCarWraps: async () => {
            calls.push('car-wraps');
            return { deletedCount: 3 };
        },
        deleteLeaderboardEntries: async () => {
            calls.push('leaderboard');
            return { deletedCount: 2 };
        },
        deleteEconomyProfile: async () => {
            calls.push('player-economy');
            return {
                deletedWallets: 1,
                deletedTransactions: 4,
            };
        },
        deleteAuthUser: async () => {
            calls.push('auth-user');
        },
    });

    assert.deepEqual(calls, [
        'profile-images',
        'car-wraps',
        'leaderboard',
        'player-economy',
        'auth-user',
    ]);
    assert.deepEqual(summary, {
        deletedLeaderboardEntries: 2,
        deletedProfileImages: 1,
        deletedCarWraps: 3,
        deletedEconomyWallets: 1,
        deletedEconomyTransactions: 4,
    });
});

test('deleteAccount skips auth deletion when any cleanup step fails', async () => {
    const calls = [];

    await assert.rejects(
        deleteAccount({
            userId: '123e4567-e89b-12d3-a456-426614174000',
            deleteProfileImages: async () => {
                calls.push('profile-images');
                return { deletedCount: 2 };
            },
            deleteCarWraps: async () => {
                calls.push('car-wraps');
                return { deletedCount: 0 };
            },
            deleteLeaderboardEntries: async () => {
                calls.push('leaderboard');
                return { deletedCount: 1 };
            },
            deleteEconomyProfile: async () => {
                calls.push('player-economy');
                throw new Error('economy cleanup failed');
            },
            deleteAuthUser: async () => {
                calls.push('auth-user');
            },
        }),
        (error) => {
            assert.equal(error instanceof AccountDeletionError, true);
            assert.equal(error.step, 'cleanup');
            assert.deepEqual(error.summary, {
                deletedLeaderboardEntries: 1,
                deletedProfileImages: 2,
                deletedCarWraps: 0,
                deletedEconomyWallets: 0,
                deletedEconomyTransactions: 0,
            });
            assert.equal(error.failures.length, 1);
            assert.equal(error.failures[0].step, 'player-economy');
            assert.match(error.failures[0].message, /economy cleanup failed/iu);
            return true;
        }
    );

    assert.deepEqual(calls, ['profile-images', 'car-wraps', 'leaderboard', 'player-economy']);
});

test('deleteAccount reports auth deletion failures after successful cleanup', async () => {
    await assert.rejects(
        deleteAccount({
            userId: '123e4567-e89b-12d3-a456-426614174000',
            deleteLeaderboardEntries: async () => ({ deletedCount: 1 }),
            deleteEconomyProfile: async () => ({
                deletedWallets: 1,
                deletedTransactions: 2,
            }),
            deleteProfileImages: async () => ({ deletedCount: 1 }),
            deleteCarWraps: async () => ({ deletedCount: 1 }),
            deleteAuthUser: async () => {
                throw new Error('auth delete failed');
            },
        }),
        (error) => {
            assert.equal(error instanceof AccountDeletionError, true);
            assert.equal(error.step, 'delete-auth-user');
            assert.equal(error.failures.length, 0);
            assert.deepEqual(error.summary, {
                deletedLeaderboardEntries: 1,
                deletedProfileImages: 1,
                deletedCarWraps: 1,
                deletedEconomyWallets: 1,
                deletedEconomyTransactions: 2,
            });
            assert.match(error.cause?.message || '', /auth delete failed/iu);
            return true;
        }
    );
});
