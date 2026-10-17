class AccountDeletionError extends Error {
    constructor(message, options = {}) {
        super(
            typeof message === 'string' && message.trim()
                ? message.trim()
                : 'Account deletion failed.'
        );
        this.name = 'AccountDeletionError';
        this.step = sanitizeAccountDeletionStep(options?.step);
        this.summary = normalizeAccountDeletionSummary(options?.summary);
        this.failures = Array.isArray(options?.failures)
            ? options.failures.map((failure) => normalizeAccountDeletionFailure(failure))
            : [];
        if (options?.cause) {
            this.cause = options.cause;
        }
    }
}

async function deleteAccount({
    userId,
    deleteAuthUser = null,
    deleteLeaderboardEntries = null,
    deleteProfileImages = null,
    deleteCarWraps = null,
    deleteEconomyProfile = null,
} = {}) {
    const normalizedUserId = sanitizeAccountDeletionUserId(userId);
    if (!normalizedUserId) {
        throw new AccountDeletionError('A valid user id is required for account deletion.', {
            step: 'validate-user-id',
        });
    }

    const summary = createAccountDeletionSummary();
    const failures = [];

    await runCleanupStep({
        userId: normalizedUserId,
        step: 'profile-images',
        operation: deleteProfileImages,
        applyResult: (result) => {
            summary.deletedProfileImages = sanitizeDeletedCount(result?.deletedCount);
        },
        failures,
    });

    await runCleanupStep({
        userId: normalizedUserId,
        step: 'car-wraps',
        operation: deleteCarWraps,
        applyResult: (result) => {
            summary.deletedCarWraps = sanitizeDeletedCount(result?.deletedCount);
        },
        failures,
    });

    await runCleanupStep({
        userId: normalizedUserId,
        step: 'leaderboard',
        operation: deleteLeaderboardEntries,
        applyResult: (result) => {
            summary.deletedLeaderboardEntries = sanitizeDeletedCount(result?.deletedCount);
        },
        failures,
    });

    await runCleanupStep({
        userId: normalizedUserId,
        step: 'player-economy',
        operation: deleteEconomyProfile,
        applyResult: (result) => {
            summary.deletedEconomyWallets = sanitizeDeletedCount(result?.deletedWallets);
            summary.deletedEconomyTransactions = sanitizeDeletedCount(result?.deletedTransactions);
        },
        failures,
    });

    if (failures.length > 0) {
        throw new AccountDeletionError(
            'One or more account cleanup steps failed before the auth user could be deleted.',
            {
                step: 'cleanup',
                summary,
                failures,
            }
        );
    }

    if (typeof deleteAuthUser !== 'function') {
        throw new AccountDeletionError('Auth user deletion is not configured.', {
            step: 'delete-auth-user',
            summary,
        });
    }

    try {
        await deleteAuthUser(normalizedUserId);
    } catch (error) {
        throw new AccountDeletionError('The auth user could not be deleted.', {
            step: 'delete-auth-user',
            summary,
            cause: error,
        });
    }

    return summary;
}

function createAccountDeletionSummary() {
    return {
        deletedLeaderboardEntries: 0,
        deletedProfileImages: 0,
        deletedCarWraps: 0,
        deletedEconomyWallets: 0,
        deletedEconomyTransactions: 0,
    };
}

async function runCleanupStep({ userId, step, operation, applyResult = null, failures = [] } = {}) {
    if (typeof operation !== 'function') {
        return;
    }

    try {
        const result = await operation(userId);
        if (typeof applyResult === 'function') {
            applyResult(result);
        }
    } catch (error) {
        failures.push({
            step,
            message: normalizeAccountDeletionErrorMessage(error),
            cause: error,
        });
    }
}

function sanitizeAccountDeletionUserId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().slice(0, 128);
    return /^[A-Za-z0-9-]{6,128}$/u.test(normalized) ? normalized : '';
}

function sanitizeAccountDeletionStep(value) {
    if (typeof value !== 'string') {
        return 'unknown';
    }
    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 48);
    return normalized || 'unknown';
}

function sanitizeDeletedCount(value) {
    const numeric = Math.round(Number(value) || 0);
    return numeric > 0 ? numeric : 0;
}

function normalizeAccountDeletionSummary(summary = null) {
    return {
        ...createAccountDeletionSummary(),
        ...(summary && typeof summary === 'object'
            ? {
                  deletedLeaderboardEntries: sanitizeDeletedCount(
                      summary.deletedLeaderboardEntries
                  ),
                  deletedProfileImages: sanitizeDeletedCount(summary.deletedProfileImages),
                  deletedCarWraps: sanitizeDeletedCount(summary.deletedCarWraps),
                  deletedEconomyWallets: sanitizeDeletedCount(summary.deletedEconomyWallets),
                  deletedEconomyTransactions: sanitizeDeletedCount(
                      summary.deletedEconomyTransactions
                  ),
              }
            : {}),
    };
}

function normalizeAccountDeletionFailure(failure = null) {
    const source = failure && typeof failure === 'object' ? failure : {};
    return {
        step: sanitizeAccountDeletionStep(source.step),
        message:
            typeof source.message === 'string' && source.message.trim()
                ? source.message.trim()
                : 'Unknown cleanup failure.',
        cause: source.cause || null,
    };
}

function normalizeAccountDeletionErrorMessage(error) {
    if (typeof error?.message === 'string' && error.message.trim()) {
        return error.message.trim();
    }
    return 'Unknown cleanup failure.';
}

module.exports = {
    AccountDeletionError,
    createAccountDeletionSummary,
    deleteAccount,
};
