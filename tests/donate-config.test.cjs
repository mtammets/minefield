const test = require('node:test');
const assert = require('node:assert/strict');

const {
    parseDonationConfig,
    serializePublicDonationConfig,
    sanitizeDonationAmountCents,
    sanitizeDonorAlias,
    sanitizeDonorMessage,
    normalizePresetAmountsCents,
} = require('../server/donate-config');

test('parseDonationConfig enables stripe provider when key is configured', () => {
    const config = parseDonationConfig({
        DONATE_ENABLED: 'true',
        DONATE_STRIPE_SECRET_KEY: 'sk_test_123',
        DONATE_CURRENCY: 'eur',
        DONATE_MIN_AMOUNT: '2',
        DONATE_MAX_AMOUNT: '50',
        DONATE_AMOUNT_STEP: '1',
        DONATE_PRESET_AMOUNTS: '2,5,10',
    });

    assert.equal(config.enabled, true);
    assert.equal(config.provider, 'stripe');
    assert.equal(config.currency, 'eur');
    assert.deepEqual(config.presetAmountsCents, [200, 500, 1000]);
    assert.equal(config.minAmountCents, 200);
    assert.equal(config.maxAmountCents, 5000);
    assert.equal(config.amountStepCents, 100);
});

test('parseDonationConfig falls back to link provider when stripe key is missing', () => {
    const config = parseDonationConfig({
        DONATE_LINK_URL: 'https://example.org/donate',
    });

    assert.equal(config.enabled, true);
    assert.equal(config.provider, 'link');
    assert.equal(config.linkUrl, 'https://example.org/donate');
});

test('serializePublicDonationConfig strips disabled provider details', () => {
    const payload = serializePublicDonationConfig({
        enabled: false,
        provider: 'disabled',
        currency: 'usd',
        minAmountCents: 100,
        maxAmountCents: 10000,
        amountStepCents: 100,
        presetAmountsCents: [500, 1000],
        campaignName: 'Support',
        campaignDescription: 'Desc',
        publicMessage: 'Message',
        linkUrl: 'https://example.org/donate',
    });

    assert.equal(payload.ok, true);
    assert.equal(payload.enabled, false);
    assert.equal(payload.provider, 'disabled');
    assert.equal(payload.linkUrl, '');
});

test('sanitizeDonationAmountCents validates range and increment step', () => {
    const config = {
        minAmountCents: 300,
        maxAmountCents: 3000,
        amountStepCents: 100,
    };

    const accepted = sanitizeDonationAmountCents(1200, config);
    assert.equal(accepted.ok, true);
    assert.equal(accepted.amountCents, 1200);

    const belowRange = sanitizeDonationAmountCents(200, config);
    assert.equal(belowRange.ok, false);
    assert.equal(belowRange.reason, 'amount-out-of-range');

    const stepMismatch = sanitizeDonationAmountCents(1250, config);
    assert.equal(stepMismatch.ok, false);
    assert.equal(stepMismatch.reason, 'amount-step-mismatch');
});

test('sanitizeDonorAlias and sanitizeDonorMessage remove unsafe content', () => {
    const alias = sanitizeDonorAlias('  Jane 🚗 Doe<script>  ');
    assert.equal(alias, 'Jane Doe');

    const message = sanitizeDonorMessage(' Thanks\nfor\tthe game!\u0000 ');
    assert.equal(message, 'Thanks for the game!');
});

test('normalizePresetAmountsCents de-duplicates and sorts values', () => {
    const normalized = normalizePresetAmountsCents([500, 200, 500, 1200, 100], {
        minAmountCents: 200,
        maxAmountCents: 1200,
        amountStepCents: 100,
    });

    assert.deepEqual(normalized, [200, 500, 1200]);
});
