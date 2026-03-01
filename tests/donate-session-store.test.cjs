const test = require('node:test');
const assert = require('node:assert/strict');

const {
    DONATION_SESSION_STATUSES,
    createDonationSessionStore,
    deriveDonationSessionStateFromStripeSession,
    isDonationSessionStatusFinal,
    normalizeStripeCheckoutSessionId,
} = require('../server/donate-session-store');

test('normalizeStripeCheckoutSessionId accepts valid ids and rejects invalid ids', () => {
    assert.equal(normalizeStripeCheckoutSessionId('cs_test_a1B2c3D4e5'), 'cs_test_a1B2c3D4e5');
    assert.equal(normalizeStripeCheckoutSessionId(' cs_live_12345678 '), 'cs_live_12345678');
    assert.equal(normalizeStripeCheckoutSessionId('cs_'), '');
    assert.equal(normalizeStripeCheckoutSessionId('pi_1234567890'), '');
    assert.equal(normalizeStripeCheckoutSessionId(''), '');
});

test('deriveDonationSessionStateFromStripeSession maps Stripe checkout states', () => {
    const paid = deriveDonationSessionStateFromStripeSession({
        id: 'cs_test_paid_12345678',
        payment_status: 'paid',
        status: 'complete',
        amount_total: 2500,
        currency: 'eur',
    });
    assert.equal(paid.status, DONATION_SESSION_STATUSES.paid);
    assert.equal(paid.amountCents, 2500);
    assert.equal(paid.currency, 'eur');

    const processing = deriveDonationSessionStateFromStripeSession({
        id: 'cs_test_processing_12345678',
        payment_status: 'unpaid',
        status: 'complete',
    });
    assert.equal(processing.status, DONATION_SESSION_STATUSES.processing);

    const expired = deriveDonationSessionStateFromStripeSession({
        id: 'cs_test_expired_12345678',
        payment_status: 'unpaid',
        status: 'expired',
    });
    assert.equal(expired.status, DONATION_SESSION_STATUSES.expired);
    assert.equal(isDonationSessionStatusFinal(expired.status), true);
});

test('createDonationSessionStore keeps paid status as terminal', () => {
    const store = createDonationSessionStore({
        recordTtlMs: 10_000,
        maxSessionRecords: 16,
    });

    const openRecord = store.upsertSessionState({
        sessionId: 'cs_test_transition_12345678',
        status: DONATION_SESSION_STATUSES.open,
        source: 'checkout-create',
        updatedAtMs: 1000,
    });
    assert.equal(openRecord.status, DONATION_SESSION_STATUSES.open);

    const paidRecord = store.upsertSessionState({
        sessionId: 'cs_test_transition_12345678',
        status: DONATION_SESSION_STATUSES.paid,
        source: 'webhook:checkout.session.completed',
        updatedAtMs: 2000,
    });
    assert.equal(paidRecord.status, DONATION_SESSION_STATUSES.paid);

    const regressedRecord = store.upsertSessionState({
        sessionId: 'cs_test_transition_12345678',
        status: DONATION_SESSION_STATUSES.open,
        source: 'api-verify',
        updatedAtMs: 3000,
    });
    assert.equal(regressedRecord.status, DONATION_SESSION_STATUSES.paid);
    assert.equal(isDonationSessionStatusFinal(regressedRecord.status), true);
});

test('createDonationSessionStore de-duplicates processed webhook events with TTL', () => {
    const store = createDonationSessionStore({
        eventTtlMs: 1000,
        maxProcessedEvents: 8,
    });

    assert.equal(store.hasProcessedEvent('evt_test_duplicate_12345678', { nowMs: 1000 }), false);
    assert.equal(store.markEventProcessed('evt_test_duplicate_12345678', { nowMs: 1000 }), true);
    assert.equal(store.hasProcessedEvent('evt_test_duplicate_12345678', { nowMs: 1500 }), true);
    assert.equal(store.hasProcessedEvent('evt_test_duplicate_12345678', { nowMs: 2501 }), false);
});
