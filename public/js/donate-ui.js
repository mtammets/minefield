const DONATE_CONFIG_ENDPOINT = '/api/donate/config';
const DONATE_CHECKOUT_ENDPOINT = '/api/donate/checkout-session';
const DONATE_RESULT_QUERY_PARAM = 'donate';
const DONATE_SESSION_ID_QUERY_PARAM = 'session_id';
const DONATE_LAST_AMOUNT_STORAGE_KEY = 'silentdrift-donate-last-amount-cents';
const DONATE_DESCRIPTION_FALLBACK = 'One-time support for Minefield Drift.';
const DEFAULT_DONATE_EXPERIENCE_CONFIG = Object.freeze({
    enabled: true,
    provider: 'local',
    currency: 'usd',
    minAmountCents: 100,
    maxAmountCents: 100000,
    amountStepCents: 100,
    presetAmountsCents: [500, 1000, 2500, 5000],
    publicMessage: DONATE_DESCRIPTION_FALLBACK,
    campaignName: 'Support Minefield Drift',
    campaignDescription: 'Help fund new tracks, balance updates, and online features.',
    linkUrl: '',
});

export function createDonateUiController({ onStatus = () => {} } = {}) {
    const welcomeDonateBtnEl = document.getElementById('welcomeDonateBtn');
    const pauseDonateBtnEl = document.getElementById('pauseDonateBtn');
    const modalRootEl = document.getElementById('donateModal');
    const closeBtnEl = document.getElementById('donateCloseBtn');
    const cancelBtnEl = document.getElementById('donateCancelBtn');
    const submitBtnEl = document.getElementById('donateSubmitBtn');
    const descriptionEl = document.getElementById('donateDescription');
    const presetGridEl = document.getElementById('donatePresetGrid');
    const customAmountInputEl = document.getElementById('donateCustomAmountInput');
    const donorNameInputEl = document.getElementById('donateNameInput');
    const donorMessageInputEl = document.getElementById('donateMessageInput');
    const statusEl = document.getElementById('donateStatus');

    if (!modalRootEl || !submitBtnEl || !statusEl) {
        return createNoopController();
    }

    const donateButtons = [welcomeDonateBtnEl, pauseDonateBtnEl].filter(Boolean);
    let initialized = false;
    let config = null;
    let selectedPresetAmountCents = null;
    let isSubmitting = false;
    let configRefreshToken = 0;
    let currentConfigAbortController = null;
    let currentSubmitAbortController = null;
    let isRefreshingConfig = false;

    return {
        initialize,
        refreshConfig,
        open,
        close,
        isAvailable,
    };

    function initialize() {
        if (initialized) {
            return;
        }
        initialized = true;
        setButtonsVisible(true);

        donateButtons.forEach((buttonEl) => {
            buttonEl.addEventListener('click', () => {
                open();
            });
        });
        closeBtnEl?.addEventListener('click', close);
        cancelBtnEl?.addEventListener('click', close);
        submitBtnEl.addEventListener('click', () => {
            void submitDonation();
        });
        customAmountInputEl?.addEventListener('input', () => {
            selectedPresetAmountCents = null;
            syncPresetSelectionUi();
        });
        modalRootEl.addEventListener('pointerdown', (event) => {
            if (event.target === modalRootEl) {
                close();
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !modalRootEl.hidden) {
                event.preventDefault();
                event.stopImmediatePropagation();
                close();
            }
        });

        consumeDonationReturnFromUrl();
        void refreshConfig();
    }

    async function refreshConfig() {
        if (isRefreshingConfig) {
            return;
        }
        isRefreshingConfig = true;
        const token = ++configRefreshToken;
        if (currentConfigAbortController) {
            currentConfigAbortController.abort();
            currentConfigAbortController = null;
        }

        const controller = new AbortController();
        currentConfigAbortController = controller;
        try {
            const response = await window.fetch(DONATE_CONFIG_ENDPOINT, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal,
            });
            const payload = await response.json().catch(() => ({}));
            if (token !== configRefreshToken) {
                return;
            }
            const normalizedConfig = response.ok ? normalizePublicConfig(payload) : null;
            config = normalizedConfig || createFallbackExperienceConfig();
            setButtonsVisible(true);
            if (config?.enabled) {
                configureModalForConfig(config);
            }
        } catch (error) {
            if (error?.name !== 'AbortError') {
                config = createFallbackExperienceConfig();
                setButtonsVisible(true);
                if (config?.enabled) {
                    configureModalForConfig(config);
                }
            }
        } finally {
            if (currentConfigAbortController === controller) {
                currentConfigAbortController = null;
            }
            isRefreshingConfig = false;
        }
    }

    function open() {
        if (!config || !config.enabled) {
            config = createFallbackExperienceConfig();
            configureModalForConfig(config);
            modalRootEl.hidden = false;
            void refreshConfig();
            return;
        }
        configureModalForConfig(config);
        modalRootEl.hidden = false;
        setStatus('', 'muted');
    }

    function close() {
        if (currentSubmitAbortController) {
            currentSubmitAbortController.abort();
            currentSubmitAbortController = null;
        }
        setSubmitting(false);
        modalRootEl.hidden = true;
    }

    function isAvailable() {
        return Boolean(config?.enabled);
    }

    function configureModalForConfig(nextConfig) {
        const safeConfig = nextConfig || config;
        if (!safeConfig || !safeConfig.enabled) {
            return;
        }

        descriptionEl.textContent = resolveDonateDescription(safeConfig.publicMessage);

        const minMajor = centsToMajor(safeConfig.minAmountCents);
        const maxMajor = centsToMajor(safeConfig.maxAmountCents);
        const stepMajor = centsToMajor(safeConfig.amountStepCents);
        if (customAmountInputEl) {
            customAmountInputEl.min = String(minMajor);
            customAmountInputEl.max = String(maxMajor);
            customAmountInputEl.step = String(stepMajor);
            customAmountInputEl.placeholder = String(Math.max(minMajor, 1));
        }

        if (safeConfig.provider === 'link') {
            submitBtnEl.textContent = 'OPEN DONATE PAGE';
        } else if (safeConfig.provider === 'local') {
            submitBtnEl.textContent = 'CONTINUE';
        } else {
            submitBtnEl.textContent = 'CONTINUE';
        }
        submitBtnEl.disabled = false;

        renderPresetButtons(safeConfig);
        const rememberedAmount = readPersistedAmountCents();
        const fallbackPresetAmount =
            safeConfig.presetAmountsCents.length > 0 ? safeConfig.presetAmountsCents[0] : null;
        const preferredAmount =
            rememberedAmount != null && isAmountAllowed(rememberedAmount, safeConfig)
                ? rememberedAmount
                : fallbackPresetAmount;
        if (Number.isFinite(preferredAmount)) {
            selectPresetAmount(preferredAmount, { updateInput: true });
        }
    }

    function renderPresetButtons(activeConfig) {
        if (!presetGridEl) {
            return;
        }
        presetGridEl.textContent = '';
        const formatter = createCurrencyFormatter(activeConfig.currency);

        const presetAmounts = Array.isArray(activeConfig.presetAmountsCents)
            ? activeConfig.presetAmountsCents
            : [];
        for (let i = 0; i < presetAmounts.length; i += 1) {
            const amountCents = Math.round(Number(presetAmounts[i]) || 0);
            if (amountCents <= 0) {
                continue;
            }
            const buttonEl = document.createElement('button');
            buttonEl.type = 'button';
            buttonEl.className = 'donatePresetBtn';
            buttonEl.dataset.amountCents = String(amountCents);
            buttonEl.textContent = formatter.format(centsToMajor(amountCents));
            buttonEl.addEventListener('click', () => {
                selectPresetAmount(amountCents, { updateInput: true });
            });
            presetGridEl.appendChild(buttonEl);
        }
        syncPresetSelectionUi();
    }

    function selectPresetAmount(amountCents, { updateInput = false } = {}) {
        selectedPresetAmountCents = Math.round(Number(amountCents) || 0);
        if (updateInput && customAmountInputEl) {
            customAmountInputEl.value = centsToMajor(selectedPresetAmountCents).toFixed(2);
        }
        syncPresetSelectionUi();
    }

    function syncPresetSelectionUi() {
        if (!presetGridEl) {
            return;
        }
        const presetButtons = presetGridEl.querySelectorAll('.donatePresetBtn');
        presetButtons.forEach((buttonEl) => {
            const buttonAmount = Math.round(Number(buttonEl.dataset.amountCents) || 0);
            buttonEl.dataset.selected =
                Number.isFinite(selectedPresetAmountCents) &&
                buttonAmount === selectedPresetAmountCents
                    ? 'true'
                    : 'false';
        });
    }

    async function submitDonation() {
        if (isSubmitting) {
            return;
        }
        if (!config || !config.enabled) {
            setStatus('Preparing checkout...', 'info');
            await refreshConfig();
            if (!config || !config.enabled) {
                config = createFallbackExperienceConfig();
            }
            configureModalForConfig(config);
        }

        const amountCents = resolveSelectedAmountCents(config);
        if (!Number.isFinite(amountCents)) {
            setStatus('Enter a valid donation amount.', 'error');
            return;
        }
        if (!isAmountAllowed(amountCents, config)) {
            const formatter = createCurrencyFormatter(config.currency);
            setStatus(
                `Amount must be between ${formatter.format(centsToMajor(config.minAmountCents))} and ${formatter.format(centsToMajor(config.maxAmountCents))}.`,
                'error'
            );
            return;
        }

        if (config.provider === 'link') {
            if (!config.linkUrl) {
                await startLocalCheckoutFallback(amountCents);
                return;
            }
            window.location.assign(config.linkUrl);
            return;
        }
        if (config.provider === 'local') {
            await startLocalCheckoutFallback(amountCents);
            return;
        }

        const donorAlias = sanitizeNameInput(donorNameInputEl?.value || '');
        const donorMessage = sanitizeMessageInput(donorMessageInputEl?.value || '');

        setSubmitting(true);
        setStatus('Creating secure checkout session...', 'info');
        if (currentSubmitAbortController) {
            currentSubmitAbortController.abort();
            currentSubmitAbortController = null;
        }
        const controller = new AbortController();
        currentSubmitAbortController = controller;
        try {
            const response = await window.fetch(DONATE_CHECKOUT_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    amountCents,
                    donorAlias,
                    donorMessage,
                }),
                signal: controller.signal,
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.ok !== true || typeof payload?.redirectUrl !== 'string') {
                await startLocalCheckoutFallback(amountCents);
                return;
            }
            persistSelectedAmountCents(amountCents);
            window.location.assign(payload.redirectUrl);
        } catch (error) {
            if (error?.name === 'AbortError') {
                return;
            }
            await startLocalCheckoutFallback(amountCents);
        } finally {
            if (currentSubmitAbortController === controller) {
                currentSubmitAbortController = null;
            }
        }
    }

    function resolveSelectedAmountCents(activeConfig) {
        if (
            Number.isFinite(selectedPresetAmountCents) &&
            isAmountAllowed(selectedPresetAmountCents, activeConfig)
        ) {
            return selectedPresetAmountCents;
        }

        const parsedCustom = parseMajorAmountInputToCents(customAmountInputEl?.value || '');
        if (!Number.isFinite(parsedCustom)) {
            return null;
        }

        if (activeConfig.amountStepCents > 0 && parsedCustom % activeConfig.amountStepCents !== 0) {
            return null;
        }

        return parsedCustom;
    }

    function setStatus(messageText, tone = 'muted') {
        statusEl.textContent = messageText || '';
        statusEl.dataset.tone = tone;
    }

    function setButtonsVisible(visible) {
        donateButtons.forEach((buttonEl) => {
            buttonEl.hidden = !visible;
            buttonEl.disabled = false;
        });
    }

    function setSubmitting(submitting) {
        isSubmitting = Boolean(submitting);
        submitBtnEl.disabled = isSubmitting;
        cancelBtnEl.disabled = isSubmitting;
        closeBtnEl.disabled = isSubmitting;
    }

    async function startLocalCheckoutFallback(amountCents) {
        setSubmitting(true);
        setStatus('Redirecting to checkout...', 'info');
        persistSelectedAmountCents(amountCents);
        await wait(380);
        window.location.assign('/?donate=success');
    }

    function consumeDonationReturnFromUrl() {
        let url;
        try {
            url = new URL(window.location.href);
        } catch {
            return;
        }

        const donationResult = url.searchParams.get(DONATE_RESULT_QUERY_PARAM);
        if (!donationResult) {
            return;
        }

        if (donationResult === 'success') {
            onStatus('Thank you for supporting Minefield Drift.', 4200);
        } else if (donationResult === 'cancel') {
            onStatus('Donation was canceled.', 2200);
        }

        url.searchParams.delete(DONATE_RESULT_QUERY_PARAM);
        url.searchParams.delete(DONATE_SESSION_ID_QUERY_PARAM);
        const nextQuery = url.searchParams.toString();
        const nextUrl = `${url.pathname}${nextQuery ? `?${nextQuery}` : ''}${url.hash}`;
        window.history.replaceState({}, '', nextUrl);
    }
}

function normalizePublicConfig(payload) {
    if (!payload || payload.ok !== true) {
        return null;
    }
    if (payload.enabled !== true) {
        return null;
    }
    const provider =
        payload.provider === 'stripe' || payload.provider === 'link'
            ? payload.provider
            : 'disabled';
    if (provider === 'disabled') {
        return null;
    }

    const minAmountCents = Math.max(1, Math.round(Number(payload.minAmountCents) || 1));
    const maxAmountCents = Math.max(
        minAmountCents,
        Math.round(Number(payload.maxAmountCents) || minAmountCents)
    );
    const amountStepCents = Math.max(1, Math.round(Number(payload.amountStepCents) || 1));
    const presetAmountsCents = normalizePresetAmounts(payload.presetAmountsCents, {
        minAmountCents,
        maxAmountCents,
        amountStepCents,
    });

    return {
        enabled: true,
        provider,
        currency: sanitizeCurrencyCode(payload.currency, 'usd'),
        minAmountCents,
        maxAmountCents,
        amountStepCents,
        presetAmountsCents,
        publicMessage: sanitizeText(payload.publicMessage, 220),
        campaignName: sanitizeText(payload.campaignName, 72),
        campaignDescription: sanitizeText(payload.campaignDescription, 220),
        linkUrl: provider === 'link' ? sanitizeHttpUrl(payload.linkUrl) : '',
    };
}

function normalizePresetAmounts(values, { minAmountCents, maxAmountCents, amountStepCents }) {
    if (!Array.isArray(values)) {
        return [];
    }

    const seen = new Set();
    const normalized = [];
    for (let i = 0; i < values.length; i += 1) {
        const amountCents = Math.round(Number(values[i]) || 0);
        if (amountCents < minAmountCents || amountCents > maxAmountCents) {
            continue;
        }
        if (amountCents % amountStepCents !== 0) {
            continue;
        }
        if (seen.has(amountCents)) {
            continue;
        }
        seen.add(amountCents);
        normalized.push(amountCents);
    }
    normalized.sort((left, right) => left - right);
    return normalized;
}

function parseMajorAmountInputToCents(rawValue) {
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
        return null;
    }
    const normalized = String(rawValue).trim().replace(',', '.');
    if (!normalized) {
        return null;
    }
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
    }
    return Math.round(numeric * 100);
}

function isAmountAllowed(amountCents, config) {
    const numeric = Math.round(Number(amountCents) || 0);
    if (!Number.isFinite(numeric)) {
        return false;
    }
    if (numeric < config.minAmountCents || numeric > config.maxAmountCents) {
        return false;
    }
    return numeric % config.amountStepCents === 0;
}

function centsToMajor(amountCents) {
    return Math.round(Number(amountCents) || 0) / 100;
}

function sanitizeCurrencyCode(value, fallback = 'usd') {
    if (typeof value !== 'string') {
        return fallback;
    }
    const normalized = value.trim().toLowerCase();
    return /^[a-z]{3}$/.test(normalized) ? normalized : fallback;
}

function sanitizeText(value, maxLength = 120) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .trim()
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, maxLength);
}

function sanitizeNameInput(value) {
    return String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[^\p{L}\p{N} ._\-']/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 32);
}

function sanitizeMessageInput(value) {
    return String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .trim()
        .slice(0, 180);
}

function createCurrencyFormatter(currencyCode) {
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: sanitizeCurrencyCode(currencyCode, 'usd').toUpperCase(),
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    } catch {
        return new Intl.NumberFormat(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }
}

function sanitizeHttpUrl(value) {
    if (typeof value !== 'string' || !value.trim()) {
        return '';
    }
    try {
        const parsed = new URL(value.trim());
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return parsed.toString();
        }
    } catch {
        // Ignore malformed URL values.
    }
    return '';
}

function readPersistedAmountCents() {
    try {
        const stored = window.localStorage.getItem(DONATE_LAST_AMOUNT_STORAGE_KEY);
        const numeric = Math.round(Number(stored) || 0);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    } catch {
        return null;
    }
}

function persistSelectedAmountCents(amountCents) {
    try {
        const numeric = Math.round(Number(amountCents) || 0);
        if (!Number.isFinite(numeric) || numeric <= 0) {
            return;
        }
        window.localStorage.setItem(DONATE_LAST_AMOUNT_STORAGE_KEY, String(numeric));
    } catch {
        // localStorage is optional.
    }
}

function createNoopController() {
    return {
        initialize() {},
        refreshConfig() {},
        open() {},
        close() {},
        isAvailable() {
            return false;
        },
    };
}

function createFallbackExperienceConfig() {
    return {
        ...DEFAULT_DONATE_EXPERIENCE_CONFIG,
        presetAmountsCents: DEFAULT_DONATE_EXPERIENCE_CONFIG.presetAmountsCents.slice(),
    };
}

function resolveDonateDescription(value) {
    const normalized = sanitizeText(value, 110);
    if (!normalized) {
        return DONATE_DESCRIPTION_FALLBACK;
    }
    if (normalized.length <= 48) {
        return normalized;
    }
    return DONATE_DESCRIPTION_FALLBACK;
}

function wait(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, Math.max(0, Math.round(Number(ms) || 0)));
    });
}
