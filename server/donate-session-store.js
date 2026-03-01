const DONATION_SESSION_STATUSES = Object.freeze({
    paid: 'paid',
    processing: 'processing',
    open: 'open',
    canceled: 'canceled',
    expired: 'expired',
    failed: 'failed',
    unknown: 'unknown',
});

const DEFAULT_RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_EVENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_SESSION_RECORDS = 4096;
const DEFAULT_MAX_PROCESSED_EVENTS = 8192;

const FINAL_DONATION_SESSION_STATUSES = new Set([
    DONATION_SESSION_STATUSES.paid,
    DONATION_SESSION_STATUSES.canceled,
    DONATION_SESSION_STATUSES.expired,
    DONATION_SESSION_STATUSES.failed,
]);

function createDonationSessionStore({
    recordTtlMs = DEFAULT_RECORD_TTL_MS,
    eventTtlMs = DEFAULT_EVENT_TTL_MS,
    maxSessionRecords = DEFAULT_MAX_SESSION_RECORDS,
    maxProcessedEvents = DEFAULT_MAX_PROCESSED_EVENTS,
} = {}) {
    const sessionRecords = new Map();
    const processedEventIds = new Map();

    return {
        upsertFromStripeSession,
        upsertSessionState,
        getSessionState,
        markEventProcessed,
        hasProcessedEvent,
        pruneExpired,
    };

    function upsertFromStripeSession(checkoutSession, options = {}) {
        const derivedState = deriveDonationSessionStateFromStripeSession(checkoutSession);
        if (!derivedState) {
            return null;
        }

        const statusOverride = sanitizeDonationSessionStatus(options.statusOverride, '');
        const nextStatus = statusOverride || derivedState.status;
        return upsertSessionState({
            ...derivedState,
            status: nextStatus,
            source: sanitizeSessionSource(options.source),
            updatedAtMs: resolveNowMs(options.nowMs),
        });
    }

    function upsertSessionState(rawState = {}) {
        const sessionId = normalizeStripeCheckoutSessionId(rawState.sessionId);
        if (!sessionId) {
            return null;
        }
        const nowMs = resolveNowMs(rawState.updatedAtMs);
        pruneExpired(nowMs);

        const existingRecord = sessionRecords.get(sessionId) || null;
        const incomingStatus = sanitizeDonationSessionStatus(
            rawState.status,
            DONATION_SESSION_STATUSES.unknown
        );
        const nextStatus = resolveSessionStatusTransition(existingRecord?.status, incomingStatus);
        const nextRecord = {
            sessionId,
            status: nextStatus,
            paymentStatus: sanitizeSessionEnum(
                rawState.paymentStatus,
                existingRecord?.paymentStatus
            ),
            checkoutStatus: sanitizeSessionEnum(
                rawState.checkoutStatus,
                existingRecord?.checkoutStatus
            ),
            amountCents: sanitizeAmountCents(rawState.amountCents, existingRecord?.amountCents),
            currency: sanitizeCurrencyCode(rawState.currency, existingRecord?.currency),
            source: sanitizeSessionSource(rawState.source || existingRecord?.source),
            updatedAtMs: nowMs,
            expiresAtMs: nowMs + sanitizePositiveInteger(recordTtlMs, DEFAULT_RECORD_TTL_MS),
        };

        sessionRecords.delete(sessionId);
        sessionRecords.set(sessionId, nextRecord);
        pruneToSize(
            sessionRecords,
            sanitizePositiveInteger(maxSessionRecords, DEFAULT_MAX_SESSION_RECORDS)
        );
        return { ...nextRecord };
    }

    function getSessionState(rawSessionId, options = {}) {
        const sessionId = normalizeStripeCheckoutSessionId(rawSessionId);
        if (!sessionId) {
            return null;
        }
        const nowMs = resolveNowMs(options.nowMs);
        pruneExpired(nowMs);
        const record = sessionRecords.get(sessionId);
        return record ? { ...record } : null;
    }

    function markEventProcessed(rawEventId, options = {}) {
        const eventId = normalizeStripeEventId(rawEventId);
        if (!eventId) {
            return false;
        }
        const nowMs = resolveNowMs(options.nowMs);
        pruneExpired(nowMs);
        processedEventIds.delete(eventId);
        processedEventIds.set(
            eventId,
            nowMs + sanitizePositiveInteger(eventTtlMs, DEFAULT_EVENT_TTL_MS)
        );
        pruneToSize(
            processedEventIds,
            sanitizePositiveInteger(maxProcessedEvents, DEFAULT_MAX_PROCESSED_EVENTS)
        );
        return true;
    }

    function hasProcessedEvent(rawEventId, options = {}) {
        const eventId = normalizeStripeEventId(rawEventId);
        if (!eventId) {
            return false;
        }
        const nowMs = resolveNowMs(options.nowMs);
        pruneExpired(nowMs);
        const expiresAtMs = processedEventIds.get(eventId);
        if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
            processedEventIds.delete(eventId);
            return false;
        }
        return true;
    }

    function pruneExpired(rawNowMs = Date.now()) {
        const nowMs = resolveNowMs(rawNowMs);
        for (const [sessionId, record] of sessionRecords.entries()) {
            if (!record || !Number.isFinite(record.expiresAtMs) || record.expiresAtMs <= nowMs) {
                sessionRecords.delete(sessionId);
            }
        }
        for (const [eventId, expiresAtMs] of processedEventIds.entries()) {
            if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
                processedEventIds.delete(eventId);
            }
        }
    }
}

function deriveDonationSessionStateFromStripeSession(checkoutSession) {
    const sessionId = normalizeStripeCheckoutSessionId(checkoutSession?.id);
    if (!sessionId) {
        return null;
    }

    const paymentStatus = sanitizeSessionEnum(checkoutSession?.payment_status, '');
    const checkoutStatus = sanitizeSessionEnum(checkoutSession?.status, '');
    let status = DONATION_SESSION_STATUSES.unknown;
    if (paymentStatus === 'paid' || paymentStatus === 'no_payment_required') {
        status = DONATION_SESSION_STATUSES.paid;
    } else if (checkoutStatus === 'expired') {
        status = DONATION_SESSION_STATUSES.expired;
    } else if (checkoutStatus === 'open') {
        status = DONATION_SESSION_STATUSES.open;
    } else if (checkoutStatus === 'complete' && paymentStatus === 'unpaid') {
        status = DONATION_SESSION_STATUSES.processing;
    }

    return {
        sessionId,
        status,
        paymentStatus,
        checkoutStatus,
        amountCents: sanitizeAmountCents(checkoutSession?.amount_total, null),
        currency: sanitizeCurrencyCode(checkoutSession?.currency, ''),
    };
}

function normalizeStripeCheckoutSessionId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    if (!/^cs_[A-Za-z0-9_]{8,255}$/.test(normalized)) {
        return '';
    }
    return normalized;
}

function normalizeStripeEventId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    if (!/^evt_[A-Za-z0-9_]{8,255}$/.test(normalized)) {
        return '';
    }
    return normalized;
}

function isDonationSessionStatusFinal(rawStatus) {
    const normalized = sanitizeDonationSessionStatus(rawStatus, '');
    return FINAL_DONATION_SESSION_STATUSES.has(normalized);
}

function sanitizeDonationSessionStatus(rawStatus, fallback = DONATION_SESSION_STATUSES.unknown) {
    if (typeof rawStatus !== 'string') {
        return fallback;
    }
    const normalized = rawStatus.trim().toLowerCase();
    if (Object.values(DONATION_SESSION_STATUSES).includes(normalized)) {
        return normalized;
    }
    return fallback;
}

function sanitizeSessionSource(value) {
    if (typeof value !== 'string') {
        return 'unknown';
    }
    const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 40);
    return normalized || 'unknown';
}

function sanitizeSessionEnum(value, fallback = '') {
    if (typeof value !== 'string') {
        return fallback || '';
    }
    const normalized = value.trim().toLowerCase();
    return normalized || fallback || '';
}

function sanitizeCurrencyCode(value, fallback = '') {
    if (typeof value !== 'string') {
        return fallback || '';
    }
    const normalized = value.trim().toLowerCase();
    return /^[a-z]{3}$/.test(normalized) ? normalized : fallback || '';
}

function sanitizeAmountCents(value, fallback = null) {
    const numeric = Math.round(Number(value));
    if (!Number.isInteger(numeric) || numeric < 0) {
        return fallback;
    }
    return numeric;
}

function resolveSessionStatusTransition(previousStatus, incomingStatus) {
    const previous = sanitizeDonationSessionStatus(previousStatus, '');
    const incoming = sanitizeDonationSessionStatus(
        incomingStatus,
        DONATION_SESSION_STATUSES.unknown
    );
    if (!previous) {
        return incoming;
    }
    if (
        incoming === DONATION_SESSION_STATUSES.paid ||
        previous === DONATION_SESSION_STATUSES.paid
    ) {
        return DONATION_SESSION_STATUSES.paid;
    }
    if (isDonationSessionStatusFinal(previous) && !isDonationSessionStatusFinal(incoming)) {
        return previous;
    }
    if (
        previous === DONATION_SESSION_STATUSES.processing &&
        incoming === DONATION_SESSION_STATUSES.open
    ) {
        return previous;
    }
    return incoming;
}

function resolveNowMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return Date.now();
    }
    return Math.round(numeric);
}

function sanitizePositiveInteger(value, fallback) {
    const numeric = Math.round(Number(value));
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return fallback;
    }
    return numeric;
}

function pruneToSize(map, maxEntries) {
    while (map.size > maxEntries) {
        const oldestKey = map.keys().next().value;
        map.delete(oldestKey);
    }
}

module.exports = {
    DONATION_SESSION_STATUSES,
    createDonationSessionStore,
    deriveDonationSessionStateFromStripeSession,
    isDonationSessionStatusFinal,
    normalizeStripeCheckoutSessionId,
};
