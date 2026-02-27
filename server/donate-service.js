const crypto = require('crypto');
const {
    sanitizeDonationAmountCents,
    sanitizeDonorAlias,
    sanitizeDonorMessage,
} = require('./donate-config');

let stripeClientCache = {
    secretKey: '',
    client: null,
};

async function createDonationCheckoutSession({
    donationConfig,
    payload,
    requestBaseUrl,
    clientIp = '',
} = {}) {
    if (!donationConfig || donationConfig.enabled !== true) {
        return {
            ok: false,
            statusCode: 503,
            error: 'Donations are currently unavailable.',
        };
    }

    const provider = donationConfig.provider;
    if (provider === 'link') {
        if (!donationConfig.linkUrl) {
            return {
                ok: false,
                statusCode: 503,
                error: 'Donate link is not configured.',
            };
        }
        return {
            ok: true,
            provider: 'link',
            redirectUrl: donationConfig.linkUrl,
            sessionId: null,
        };
    }

    if (provider !== 'stripe') {
        return {
            ok: false,
            statusCode: 503,
            error: 'Donation provider is unavailable.',
        };
    }

    const amountValidation = sanitizeDonationAmountCents(payload?.amountCents, donationConfig);
    if (!amountValidation.ok) {
        return {
            ok: false,
            statusCode: 400,
            error: describeAmountError(amountValidation),
        };
    }

    const donorAlias = sanitizeDonorAlias(payload?.donorAlias);
    const donorMessage = sanitizeDonorMessage(payload?.donorMessage);

    const stripeClient = getStripeClient(donationConfig?.stripe?.secretKey);
    if (!stripeClient) {
        return {
            ok: false,
            statusCode: 503,
            error: 'Stripe is not configured on the server.',
        };
    }

    const baseUrl = resolveBaseUrl(requestBaseUrl);
    const successUrl = resolvePathOrUrl(
        donationConfig.successPathOrUrl,
        baseUrl,
        '/?donate=success'
    );
    const cancelUrl = resolvePathOrUrl(donationConfig.cancelPathOrUrl, baseUrl, '/?donate=cancel');

    const amountCents = amountValidation.amountCents;
    const metadata = {
        amountCents: String(amountCents),
        donorAlias: donorAlias || 'anonymous',
        donorMessage: donorMessage || '',
        clientIp: String(clientIp || '').slice(0, 96),
    };

    const idempotencyKey = buildIdempotencyKey({
        amountCents,
        donorAlias,
        donorMessage,
        clientIp,
    });

    try {
        const session = await stripeClient.checkout.sessions.create(
            {
                mode: 'payment',
                submit_type: 'donate',
                line_items: [
                    {
                        quantity: 1,
                        price_data: {
                            currency: donationConfig.currency,
                            unit_amount: amountCents,
                            product_data: {
                                name: donationConfig.campaignName,
                                description: donationConfig.campaignDescription,
                            },
                        },
                    },
                ],
                success_url: successUrl,
                cancel_url: cancelUrl,
                allow_promotion_codes: Boolean(donationConfig.allowPromotionCodes),
                metadata,
                payment_intent_data: {
                    metadata,
                },
            },
            {
                idempotencyKey,
            }
        );

        if (!session || typeof session.url !== 'string' || !session.url) {
            return {
                ok: false,
                statusCode: 502,
                error: 'Could not create a donation checkout session.',
            };
        }

        return {
            ok: true,
            provider: 'stripe',
            redirectUrl: session.url,
            sessionId: typeof session.id === 'string' ? session.id : null,
        };
    } catch {
        return {
            ok: false,
            statusCode: 502,
            error: 'Payment provider error while creating checkout session.',
        };
    }
}

function getStripeClient(secretKey) {
    const normalizedKey = typeof secretKey === 'string' ? secretKey.trim() : '';
    if (!normalizedKey) {
        return null;
    }
    if (stripeClientCache.client && stripeClientCache.secretKey === normalizedKey) {
        return stripeClientCache.client;
    }

    let Stripe;
    try {
        Stripe = require('stripe');
    } catch {
        return null;
    }

    try {
        const client = new Stripe(normalizedKey);
        stripeClientCache = {
            secretKey: normalizedKey,
            client,
        };
        return client;
    } catch {
        return null;
    }
}

function describeAmountError(validationResult) {
    const reason = validationResult?.reason;
    if (reason === 'amount-out-of-range') {
        return 'Selected amount is outside the allowed range.';
    }
    if (reason === 'amount-step-mismatch') {
        return 'Selected amount does not match donation increment rules.';
    }
    return 'Invalid donation amount.';
}

function buildIdempotencyKey({ amountCents, donorAlias, donorMessage, clientIp }) {
    const minuteBucket = Math.floor(Date.now() / 60_000);
    const digest = crypto
        .createHash('sha256')
        .update(
            [
                String(amountCents || 0),
                String(donorAlias || ''),
                String(donorMessage || ''),
                String(clientIp || ''),
                String(minuteBucket),
            ].join('|')
        )
        .digest('hex');
    return digest.slice(0, 64);
}

function resolveBaseUrl(rawBaseUrl) {
    if (typeof rawBaseUrl === 'string' && rawBaseUrl.trim()) {
        try {
            const parsed = new URL(rawBaseUrl.trim());
            if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
                return `${parsed.protocol}//${parsed.host}`;
            }
        } catch {
            // Fall through to localhost fallback.
        }
    }
    return 'http://localhost:3000';
}

function resolvePathOrUrl(pathOrUrl, baseUrl, fallbackPath = '/') {
    const normalizedBaseUrl = resolveBaseUrl(baseUrl);
    if (typeof pathOrUrl !== 'string' || !pathOrUrl.trim()) {
        return new URL(fallbackPath, normalizedBaseUrl).toString();
    }
    const candidate = pathOrUrl.trim();
    if (candidate.startsWith('/')) {
        return new URL(candidate, normalizedBaseUrl).toString();
    }
    try {
        const parsed = new URL(candidate);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return parsed.toString();
        }
    } catch {
        // Ignore and fall back.
    }
    return new URL(fallbackPath, normalizedBaseUrl).toString();
}

module.exports = {
    createDonationCheckoutSession,
};
