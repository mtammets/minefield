const DEFAULT_DONATION_PRESET_AMOUNTS_CENTS = Object.freeze([500, 1000, 2500, 5000]);
const DEFAULT_DONATION_MIN_AMOUNT_CENTS = 100;
const DEFAULT_DONATION_MAX_AMOUNT_CENTS = 100_000;
const DEFAULT_DONATION_AMOUNT_STEP_CENTS = 100;
const DEFAULT_DONATION_CURRENCY = 'usd';
const DEFAULT_DONATION_CAMPAIGN_NAME = 'Support Minefield Drift';
const DEFAULT_DONATION_CAMPAIGN_DESCRIPTION =
    'Help fund new tracks, balancing updates, and long-term online support.';
const DEFAULT_DONATION_PUBLIC_MESSAGE =
    'Support development to help us ship new content and online features.';
const DONOR_ALIAS_MAX_LENGTH = 32;
const DONOR_MESSAGE_MAX_LENGTH = 180;
const SAFE_URL_PROTOCOLS = new Set(['https:', 'http:']);

function parseDonationConfig(env = process.env) {
    const hasEnv = env && typeof env === 'object' ? env : {};
    const explicitEnabled = parseOptionalBoolean(hasEnv.DONATE_ENABLED);
    const currency = sanitizeCurrencyCode(hasEnv.DONATE_CURRENCY, DEFAULT_DONATION_CURRENCY);

    const minAmountCents = parseAmountEnvToCents(
        hasEnv.DONATE_MIN_AMOUNT,
        DEFAULT_DONATION_MIN_AMOUNT_CENTS
    );
    const maxAmountCents = parseAmountEnvToCents(
        hasEnv.DONATE_MAX_AMOUNT,
        DEFAULT_DONATION_MAX_AMOUNT_CENTS
    );
    const boundedMinAmountCents = Math.max(
        1,
        Math.min(minAmountCents || DEFAULT_DONATION_MIN_AMOUNT_CENTS, maxAmountCents)
    );
    const boundedMaxAmountCents = Math.max(
        boundedMinAmountCents,
        maxAmountCents || DEFAULT_DONATION_MAX_AMOUNT_CENTS
    );

    const amountStepCents = normalizeAmountStepCents(
        parseAmountEnvToCents(hasEnv.DONATE_AMOUNT_STEP, DEFAULT_DONATION_AMOUNT_STEP_CENTS)
    );

    const configuredPresetAmounts = parsePresetAmountsToCents(
        hasEnv.DONATE_PRESET_AMOUNTS,
        DEFAULT_DONATION_PRESET_AMOUNTS_CENTS
    );
    const presetAmountsCents = normalizePresetAmountsCents(configuredPresetAmounts, {
        minAmountCents: boundedMinAmountCents,
        maxAmountCents: boundedMaxAmountCents,
        amountStepCents,
    });

    const campaignName = sanitizeSingleLineText(
        hasEnv.DONATE_CAMPAIGN_NAME,
        DEFAULT_DONATION_CAMPAIGN_NAME,
        72
    );
    const campaignDescription = sanitizeSingleLineText(
        hasEnv.DONATE_CAMPAIGN_DESCRIPTION,
        DEFAULT_DONATION_CAMPAIGN_DESCRIPTION,
        220
    );
    const publicMessage = sanitizeSingleLineText(
        hasEnv.DONATE_PUBLIC_MESSAGE,
        DEFAULT_DONATION_PUBLIC_MESSAGE,
        220
    );

    const stripeSecretKey = sanitizeSecretKey(hasEnv.DONATE_STRIPE_SECRET_KEY);
    const linkUrl = sanitizeExternalUrl(hasEnv.DONATE_LINK_URL);

    let provider = 'disabled';
    if (stripeSecretKey) {
        provider = 'stripe';
    } else if (linkUrl) {
        provider = 'link';
    }

    let enabled = provider !== 'disabled';
    if (explicitEnabled !== null) {
        enabled = explicitEnabled && provider !== 'disabled';
    }
    if (!enabled) {
        provider = 'disabled';
    }

    return {
        enabled,
        provider,
        currency,
        minAmountCents: boundedMinAmountCents,
        maxAmountCents: boundedMaxAmountCents,
        amountStepCents,
        presetAmountsCents,
        campaignName,
        campaignDescription,
        publicMessage,
        successPathOrUrl: sanitizePathOrUrl(hasEnv.DONATE_SUCCESS_URL, '/?donate=success'),
        cancelPathOrUrl: sanitizePathOrUrl(hasEnv.DONATE_CANCEL_URL, '/?donate=cancel'),
        allowPromotionCodes: parseOptionalBoolean(hasEnv.DONATE_ALLOW_PROMO_CODES) === true,
        stripe: {
            secretKey: stripeSecretKey,
        },
        linkUrl,
    };
}

function serializePublicDonationConfig(config) {
    const source = config && typeof config === 'object' ? config : parseDonationConfig({});
    const enabled = Boolean(source.enabled && source.provider && source.provider !== 'disabled');

    return {
        ok: true,
        enabled,
        provider: enabled ? source.provider : 'disabled',
        currency: sanitizeCurrencyCode(source.currency, DEFAULT_DONATION_CURRENCY),
        minAmountCents: Math.max(1, Math.round(Number(source.minAmountCents) || 1)),
        maxAmountCents: Math.max(1, Math.round(Number(source.maxAmountCents) || 1)),
        amountStepCents: normalizeAmountStepCents(source.amountStepCents),
        presetAmountsCents: normalizePresetAmountsCents(source.presetAmountsCents, {
            minAmountCents: Math.max(1, Math.round(Number(source.minAmountCents) || 1)),
            maxAmountCents: Math.max(1, Math.round(Number(source.maxAmountCents) || 1)),
            amountStepCents: normalizeAmountStepCents(source.amountStepCents),
        }),
        campaignName: sanitizeSingleLineText(
            source.campaignName,
            DEFAULT_DONATION_CAMPAIGN_NAME,
            72
        ),
        campaignDescription: sanitizeSingleLineText(
            source.campaignDescription,
            DEFAULT_DONATION_CAMPAIGN_DESCRIPTION,
            220
        ),
        publicMessage: sanitizeSingleLineText(
            source.publicMessage,
            DEFAULT_DONATION_PUBLIC_MESSAGE,
            220
        ),
        linkUrl: enabled && source.provider === 'link' ? sanitizeExternalUrl(source.linkUrl) : '',
    };
}

function sanitizeDonationAmountCents(value, config) {
    const sourceConfig = config && typeof config === 'object' ? config : parseDonationConfig({});
    const minAmountCents = Math.max(1, Math.round(Number(sourceConfig.minAmountCents) || 1));
    const maxAmountCents = Math.max(
        minAmountCents,
        Math.round(Number(sourceConfig.maxAmountCents) || minAmountCents)
    );
    const amountStepCents = normalizeAmountStepCents(sourceConfig.amountStepCents);

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return {
            ok: false,
            reason: 'invalid-amount',
        };
    }

    const amountCents = Math.round(numeric);
    if (amountCents < minAmountCents || amountCents > maxAmountCents) {
        return {
            ok: false,
            reason: 'amount-out-of-range',
            minAmountCents,
            maxAmountCents,
        };
    }
    if (amountCents % amountStepCents !== 0) {
        return {
            ok: false,
            reason: 'amount-step-mismatch',
            amountStepCents,
        };
    }

    return {
        ok: true,
        amountCents,
    };
}

function sanitizeDonorAlias(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .replace(/<[^>]*>/g, ' ')
        .replace(/[^\p{L}\p{N} ._\-']/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, DONOR_ALIAS_MAX_LENGTH);
}

function sanitizeDonorMessage(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .replace(/<[^>]*>/g, ' ')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .trim()
        .slice(0, DONOR_MESSAGE_MAX_LENGTH);
}

function parseOptionalBoolean(value) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return null;
    }
    if (
        normalized === '1' ||
        normalized === 'true' ||
        normalized === 'yes' ||
        normalized === 'on'
    ) {
        return true;
    }
    if (
        normalized === '0' ||
        normalized === 'false' ||
        normalized === 'no' ||
        normalized === 'off'
    ) {
        return false;
    }
    return null;
}

function parseAmountEnvToCents(value, fallbackCents) {
    const fallback = Math.max(1, Math.round(Number(fallbackCents) || 1));
    if (value == null || value === '') {
        return fallback;
    }

    let normalized = value;
    if (typeof normalized === 'string') {
        normalized = normalized.trim().replace(',', '.');
    }

    const numeric = Number(normalized);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return fallback;
    }

    return Math.max(1, Math.round(numeric * 100));
}

function parsePresetAmountsToCents(
    rawValue,
    fallbackValues = DEFAULT_DONATION_PRESET_AMOUNTS_CENTS
) {
    if (typeof rawValue !== 'string' || !rawValue.trim()) {
        return Array.isArray(fallbackValues) ? fallbackValues.slice() : [];
    }

    const entries = rawValue
        .split(',')
        .map((entry) => parseAmountEnvToCents(entry, NaN))
        .filter((amountCents) => Number.isFinite(amountCents) && amountCents > 0);

    if (entries.length === 0) {
        return Array.isArray(fallbackValues) ? fallbackValues.slice() : [];
    }

    return entries;
}

function normalizePresetAmountsCents(
    amounts,
    {
        minAmountCents = DEFAULT_DONATION_MIN_AMOUNT_CENTS,
        maxAmountCents = DEFAULT_DONATION_MAX_AMOUNT_CENTS,
        amountStepCents = DEFAULT_DONATION_AMOUNT_STEP_CENTS,
    } = {}
) {
    const min = Math.max(
        1,
        Math.round(Number(minAmountCents) || DEFAULT_DONATION_MIN_AMOUNT_CENTS)
    );
    const max = Math.max(
        min,
        Math.round(Number(maxAmountCents) || DEFAULT_DONATION_MAX_AMOUNT_CENTS)
    );
    const step = normalizeAmountStepCents(amountStepCents);

    const source = Array.isArray(amounts) ? amounts : [];
    const normalized = [];
    const seen = new Set();
    for (let i = 0; i < source.length; i += 1) {
        const rawAmount = Math.round(Number(source[i]) || 0);
        if (rawAmount < min || rawAmount > max) {
            continue;
        }
        if (rawAmount % step !== 0) {
            continue;
        }
        if (seen.has(rawAmount)) {
            continue;
        }
        seen.add(rawAmount);
        normalized.push(rawAmount);
    }

    if (normalized.length === 0) {
        const fallbackAmount = Math.min(
            max,
            Math.max(min, Math.round(DEFAULT_DONATION_PRESET_AMOUNTS_CENTS[0] / step) * step)
        );
        return [fallbackAmount];
    }

    normalized.sort((left, right) => left - right);
    return normalized;
}

function normalizeAmountStepCents(value) {
    const numeric = Math.round(Number(value) || DEFAULT_DONATION_AMOUNT_STEP_CENTS);
    if (!Number.isFinite(numeric) || numeric < 1) {
        return DEFAULT_DONATION_AMOUNT_STEP_CENTS;
    }
    return numeric;
}

function sanitizeSecretKey(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
}

function sanitizeCurrencyCode(value, fallback = DEFAULT_DONATION_CURRENCY) {
    if (typeof value !== 'string') {
        return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (!/^[a-z]{3}$/.test(normalized)) {
        return fallback;
    }
    return normalized;
}

function sanitizeSingleLineText(value, fallback, maxLength = 128) {
    if (typeof value !== 'string') {
        return fallback;
    }
    const normalized = value
        .trim()
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, maxLength);
    return normalized || fallback;
}

function sanitizeExternalUrl(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    if (!normalized) {
        return '';
    }
    try {
        const parsed = new URL(normalized);
        if (!SAFE_URL_PROTOCOLS.has(parsed.protocol)) {
            return '';
        }
        return parsed.toString();
    } catch {
        return '';
    }
}

function sanitizePathOrUrl(value, fallback) {
    if (typeof value !== 'string' || !value.trim()) {
        return fallback;
    }
    const normalized = value.trim();
    if (normalized.startsWith('/')) {
        return normalized;
    }
    const absoluteUrl = sanitizeExternalUrl(normalized);
    return absoluteUrl || fallback;
}

module.exports = {
    DONOR_ALIAS_MAX_LENGTH,
    DONOR_MESSAGE_MAX_LENGTH,
    parseDonationConfig,
    serializePublicDonationConfig,
    sanitizeDonationAmountCents,
    sanitizeDonorAlias,
    sanitizeDonorMessage,
    normalizePresetAmountsCents,
};
