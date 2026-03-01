const DONATE_DESCRIPTION_TEXT = 'One-time support for Minefield Drift.';
const DONATE_CHECKOUT_ENDPOINT_PATH = '/api/donate/checkout-session';
const DONATE_SESSION_STATUS_ENDPOINT_PATH = '/api/donate/session-status';
const DONATE_CURRENCY = 'eur';
const DONATE_MIN_AMOUNT_CENTS = 100;
const DONATE_MAX_AMOUNT_CENTS = 100_000;
const DONATE_AMOUNT_STEP_CENTS = 100;
const DONATE_PRESET_AMOUNTS_CENTS = Object.freeze([500, 1000, 2500, 5000]);
const DONATE_CHECKOUT_REQUEST_TIMEOUT_MS = 15_000;
const DONATE_STATUS_REQUEST_TIMEOUT_MS = 12_000;
const DONATE_STATUS_POLL_ATTEMPTS = 4;
const DONATE_STATUS_POLL_INTERVAL_MS = 2200;
const DONATE_GLOBAL_NOTICE_HIDE_ANIMATION_MS = 180;
const DONATE_CHECKOUT_REDIRECT_STATUS = 'Opening checkout...';
const DONATE_CHECKOUT_FAILED_MESSAGE = 'Could not start secure checkout. Try again.';
const DONATE_CHECKOUT_TIMEOUT_MESSAGE = 'Secure checkout timed out. Try again.';
const DONATE_VERIFYING_STATUS = 'Verifying donation status...';
const DONATE_PENDING_STATUS = 'Payment is processing. We will confirm it shortly.';
const DONATE_VERIFICATION_FAILED_STATUS =
    'Could not verify donation status right now. Please try again shortly.';
const DONATE_VERIFICATION_TIMEOUT_STATUS =
    'Donation verification timed out. Please try again shortly.';
const DONATE_SUCCESS_STATUS = 'Donation confirmed. Thank you for backing Minefield Drift.';
const DONATE_SUCCESS_TITLE = 'Thank You, Driver';
const DONATE_SUCCESS_SUBTITLE =
    'Your support helps keep the servers running and funds new tracks, polish, and multiplayer upgrades.';
const DONATE_FAILED_STATUS = 'Donation payment was not completed.';
const DONATE_EXPIRED_STATUS = 'Donation checkout session expired. Please try again.';
const DONATE_CANCELED_STATUS = 'Donation checkout was canceled.';
const DONATE_SUBMIT_DEFAULT_LABEL = 'Donate';
const DONATE_SUBMIT_PENDING_LABEL = 'Opening checkout...';
const WELCOME_DONATE_OPEN_EVENT = 'silentdrift:welcome-donate-open';
const WELCOME_ONLINE_OPEN_EVENT = 'silentdrift:welcome-online-open';
const WELCOME_ONLINE_CLOSE_EVENT = 'silentdrift:welcome-online-close';

export function createDonateUiController({ onStatus = () => {} } = {}) {
    const welcomeDonateBtnEl = document.getElementById('welcomeDonateBtn');
    const pauseDonateBtnEl = document.getElementById('pauseDonateBtn');
    const welcomePanelHostEl = document.getElementById('welcomeDonatePanelHost');
    const pausePanelHostEl = document.getElementById('pauseDonatePanelHost');
    const panelRootEl = document.getElementById('donateInlinePanel');
    const submitBtnEl = document.getElementById('donateSubmitBtn');
    const descriptionEl = document.getElementById('donateDescription');
    const presetGridEl = document.getElementById('donatePresetGrid');
    const customAmountInputEl = document.getElementById('donateCustomAmountInput');
    const statusEl = document.getElementById('donateStatus');
    const globalNoticeUi = createDonateGlobalNoticeController();
    const gratitudeUi = createDonateGratitudeModalController();
    const submitBaseLabel =
        String(submitBtnEl?.textContent || '')
            .trim()
            .replace(/\s+/g, ' ') || DONATE_SUBMIT_DEFAULT_LABEL;
    const currencyFormatter = createCurrencyFormatter(DONATE_CURRENCY);
    const donateContexts = [
        {
            key: 'welcome',
            buttonEl: welcomeDonateBtnEl,
            hostEl: welcomePanelHostEl,
        },
        {
            key: 'pause',
            buttonEl: pauseDonateBtnEl,
            hostEl: pausePanelHostEl,
        },
    ].filter((entry) => entry.buttonEl && entry.hostEl);

    if (!panelRootEl || !submitBtnEl || !statusEl || donateContexts.length === 0) {
        return createNoopController();
    }

    let initialized = false;
    let selectedPresetAmountCents = DONATE_PRESET_AMOUNTS_CENTS[0] || null;
    let activeContextKey = '';
    let isWelcomeOnlineFlowOpen = false;
    let isSubmittingDonation = false;

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
        configurePanel();
        void applyReturnStatusFromLocation();
        setButtonsVisible(true);
        updateButtonExpandedState();
        initializeLocalhostPreviewHotkey();

        donateContexts.forEach((entry) => {
            entry.buttonEl.addEventListener('click', () => {
                toggle(entry.key);
            });
        });
        submitBtnEl.addEventListener('click', () => {
            void submitDonation();
        });
        customAmountInputEl?.addEventListener('input', () => {
            selectedPresetAmountCents = null;
            syncPresetSelectionUi();
            updateSubmitButtonLabel();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !panelRootEl.hidden) {
                event.preventDefault();
                event.stopImmediatePropagation();
                close();
            }
        });
        document.addEventListener(WELCOME_ONLINE_OPEN_EVENT, () => {
            isWelcomeOnlineFlowOpen = true;
            if (activeContextKey === 'welcome' && !panelRootEl.hidden) {
                close();
            }
            setButtonsVisible(true);
        });
        document.addEventListener(WELCOME_ONLINE_CLOSE_EVENT, () => {
            isWelcomeOnlineFlowOpen = false;
            setButtonsVisible(true);
        });
    }

    function initializeLocalhostPreviewHotkey() {
        if (!isLocalDevelopmentHost(window.location.hostname)) {
            return;
        }
        document.addEventListener('keydown', (event) => {
            if (
                event.defaultPrevented ||
                event.repeat ||
                event.ctrlKey ||
                event.metaKey ||
                event.altKey
            ) {
                return;
            }
            if (isFormFieldEventTarget(event.target)) {
                return;
            }
            const keyValue = String(event.key || '').toLowerCase();
            if (keyValue !== 'ä') {
                return;
            }
            event.preventDefault();
            gratitudeUi.show({
                titleText: DONATE_SUCCESS_TITLE,
                messageText: '',
                subtitleText: DONATE_SUCCESS_SUBTITLE,
                amountText: '€5.00',
                previewMode: true,
            });
        });
    }

    function refreshConfig() {
        configurePanel();
    }

    function open(contextKey = '', options = {}) {
        const activeContext = resolveContext(contextKey) || resolveDefaultContext();
        if (!activeContext) {
            return;
        }
        if (activeContext.key === 'welcome') {
            document.dispatchEvent(new CustomEvent(WELCOME_DONATE_OPEN_EVENT));
        }
        if (panelRootEl.parentElement !== activeContext.hostEl) {
            activeContext.hostEl.appendChild(panelRootEl);
        }
        activeContextKey = activeContext.key;
        panelRootEl.hidden = false;
        updateButtonExpandedState();
        if (!options?.preserveStatus) {
            setStatus('', 'muted');
        }
    }

    function close() {
        panelRootEl.hidden = true;
        activeContextKey = '';
        updateButtonExpandedState();
    }

    function isAvailable() {
        return true;
    }

    function configurePanel() {
        descriptionEl.textContent = DONATE_DESCRIPTION_TEXT;

        const minMajor = centsToMajor(DONATE_MIN_AMOUNT_CENTS);
        const maxMajor = centsToMajor(DONATE_MAX_AMOUNT_CENTS);
        const stepMajor = centsToMajor(DONATE_AMOUNT_STEP_CENTS);
        if (customAmountInputEl) {
            customAmountInputEl.min = String(minMajor);
            customAmountInputEl.max = String(maxMajor);
            customAmountInputEl.step = String(stepMajor);
            customAmountInputEl.placeholder = String(Math.max(minMajor, 1));
            if (!customAmountInputEl.value) {
                customAmountInputEl.value = centsToMajor(
                    DONATE_PRESET_AMOUNTS_CENTS[0] || 0
                ).toFixed(2);
            }
        }

        setSubmitPending(false);
        renderPresetButtons();
        if (Number.isFinite(selectedPresetAmountCents)) {
            selectPresetAmount(selectedPresetAmountCents, { updateInput: true });
        }
        updateSubmitButtonLabel();
    }

    function renderPresetButtons() {
        if (!presetGridEl) {
            return;
        }
        presetGridEl.textContent = '';
        const formatter = createCurrencyFormatter(DONATE_CURRENCY);

        for (let i = 0; i < DONATE_PRESET_AMOUNTS_CENTS.length; i += 1) {
            const amountCents = Math.round(Number(DONATE_PRESET_AMOUNTS_CENTS[i]) || 0);
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
        updateSubmitButtonLabel();
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
        if (isSubmittingDonation) {
            return;
        }

        const amountCents = resolveSelectedAmountCents();
        if (!Number.isFinite(amountCents)) {
            setStatus('Enter a valid donation amount.', 'error');
            return;
        }

        if (!isAmountAllowed(amountCents)) {
            const formatter = createCurrencyFormatter(DONATE_CURRENCY);
            setStatus(
                `Amount must be between ${formatter.format(centsToMajor(DONATE_MIN_AMOUNT_CENTS))} and ${formatter.format(centsToMajor(DONATE_MAX_AMOUNT_CENTS))}.`,
                'error'
            );
            return;
        }

        setSubmitPending(true);
        setStatus(DONATE_CHECKOUT_REDIRECT_STATUS, 'info');

        const requestController = new AbortController();
        const timeoutId = window.setTimeout(() => {
            requestController.abort();
        }, DONATE_CHECKOUT_REQUEST_TIMEOUT_MS);

        try {
            const response = await window.fetch(DONATE_CHECKOUT_ENDPOINT_PATH, {
                method: 'POST',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    amountCents,
                }),
                signal: requestController.signal,
            });
            const payload = await response.json().catch(() => ({}));
            const checkoutUrl =
                typeof payload?.checkoutUrl === 'string' ? payload.checkoutUrl.trim() : '';

            if (!response.ok || payload?.ok !== true || !checkoutUrl) {
                const errorMessage = resolveStatusMessageFromServerError(payload?.error);
                throw new Error(errorMessage);
            }

            window.location.assign(checkoutUrl);
        } catch (error) {
            const messageText =
                error?.name === 'AbortError'
                    ? DONATE_CHECKOUT_TIMEOUT_MESSAGE
                    : resolveStatusMessageFromServerError(error?.message);
            setStatus(messageText, 'error');
            globalNoticeUi.show(messageText, 'error', 3200);
            onStatus(messageText, 3200);
            setSubmitPending(false);
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    function resolveSelectedAmountCents() {
        if (
            Number.isFinite(selectedPresetAmountCents) &&
            isAmountAllowed(selectedPresetAmountCents)
        ) {
            return selectedPresetAmountCents;
        }

        const parsedCustom = parseMajorAmountInputToCents(customAmountInputEl?.value || '');
        if (!Number.isFinite(parsedCustom)) {
            return null;
        }
        if (parsedCustom % DONATE_AMOUNT_STEP_CENTS !== 0) {
            return null;
        }
        return parsedCustom;
    }

    function setStatus(messageText, tone = 'muted') {
        statusEl.textContent = messageText || '';
        statusEl.dataset.tone = tone;
    }

    function setSubmitPending(isPending) {
        isSubmittingDonation = Boolean(isPending);
        submitBtnEl.disabled = isSubmittingDonation;
        submitBtnEl.setAttribute('aria-busy', isSubmittingDonation ? 'true' : 'false');
        updateSubmitButtonLabel();
    }

    function updateSubmitButtonLabel() {
        if (isSubmittingDonation) {
            submitBtnEl.textContent = DONATE_SUBMIT_PENDING_LABEL;
            submitBtnEl.setAttribute('aria-label', DONATE_SUBMIT_PENDING_LABEL);
            return;
        }
        const amountCents = resolveSelectedAmountCents();
        if (Number.isFinite(amountCents) && isAmountAllowed(amountCents)) {
            const nextLabel = `Donate ${currencyFormatter.format(centsToMajor(amountCents))}`;
            submitBtnEl.textContent = nextLabel;
            submitBtnEl.setAttribute('aria-label', nextLabel);
            return;
        }
        submitBtnEl.textContent = submitBaseLabel;
        submitBtnEl.setAttribute('aria-label', submitBaseLabel);
    }

    async function applyReturnStatusFromLocation() {
        let pageUrl;
        try {
            pageUrl = new URL(window.location.href);
        } catch {
            return;
        }
        const removeReturnParamsFromLocation = () => {
            pageUrl.searchParams.delete('donate');
            pageUrl.searchParams.delete('session_id');
            const nextRelativeUrl = `${pageUrl.pathname}${pageUrl.search}${pageUrl.hash}`;
            try {
                window.history.replaceState(null, '', nextRelativeUrl);
            } catch {
                // History API might be unavailable in constrained environments.
            }
        };

        const donateState = sanitizeDonationReturnState(pageUrl.searchParams.get('donate'));
        if (!donateState) {
            return;
        }
        const checkoutSessionId = sanitizeStripeCheckoutSessionId(
            pageUrl.searchParams.get('session_id')
        );

        open(resolveDefaultContext()?.key || '', { preserveStatus: true });

        if (donateState === 'cancel') {
            setStatus(DONATE_CANCELED_STATUS, 'muted');
            globalNoticeUi.show(DONATE_CANCELED_STATUS, 'muted', 2800);
            onStatus(DONATE_CANCELED_STATUS, 2800);
            removeReturnParamsFromLocation();
            return;
        }

        if (!checkoutSessionId) {
            setStatus(DONATE_VERIFICATION_FAILED_STATUS, 'error');
            globalNoticeUi.show(DONATE_VERIFICATION_FAILED_STATUS, 'error', 3200);
            onStatus(DONATE_VERIFICATION_FAILED_STATUS, 3200);
            removeReturnParamsFromLocation();
            return;
        }

        setStatus(DONATE_VERIFYING_STATUS, 'info');
        try {
            const sessionStatusPayload =
                await verifyDonationSessionStatusWithRetry(checkoutSessionId);
            const finalMessage = resolveReturnStatusMessageFromSessionStatus(
                sessionStatusPayload?.status
            );
            setStatus(finalMessage.messageText, finalMessage.tone);
            if (normalizeDonationSessionStatus(sessionStatusPayload?.status) === 'paid') {
                gratitudeUi.show(resolveGratitudeContentFromSessionStatus(sessionStatusPayload));
            } else {
                globalNoticeUi.show(
                    finalMessage.messageText,
                    finalMessage.tone,
                    finalMessage.timeoutMs
                );
            }
            onStatus(finalMessage.messageText, finalMessage.timeoutMs);
            if (sessionStatusPayload?.final) {
                removeReturnParamsFromLocation();
            }
        } catch (error) {
            const messageText =
                error?.name === 'AbortError'
                    ? DONATE_VERIFICATION_TIMEOUT_STATUS
                    : resolveVerificationMessageFromServerError(error?.message);
            setStatus(messageText, 'error');
            globalNoticeUi.show(messageText, 'error', 3200);
            onStatus(messageText, 3200);
        }
    }

    async function verifyDonationSessionStatusWithRetry(checkoutSessionId) {
        let latestPayload = null;
        for (let attempt = 0; attempt < DONATE_STATUS_POLL_ATTEMPTS; attempt += 1) {
            latestPayload = await requestDonationSessionStatus(checkoutSessionId);
            const normalizedStatus = normalizeDonationSessionStatus(latestPayload?.status);
            const final =
                latestPayload?.final === true || isDonationSessionStatusFinal(normalizedStatus);
            latestPayload = {
                ...latestPayload,
                status: normalizedStatus,
                final,
            };
            if (final || !isDonationSessionStatusRetryable(normalizedStatus)) {
                return latestPayload;
            }
            if (attempt < DONATE_STATUS_POLL_ATTEMPTS - 1) {
                await waitForMs(DONATE_STATUS_POLL_INTERVAL_MS);
            }
        }
        return latestPayload || { status: 'unknown', final: false };
    }

    async function requestDonationSessionStatus(checkoutSessionId) {
        const requestController = new AbortController();
        const timeoutId = window.setTimeout(() => {
            requestController.abort();
        }, DONATE_STATUS_REQUEST_TIMEOUT_MS);

        try {
            const requestUrl = `${DONATE_SESSION_STATUS_ENDPOINT_PATH}?session_id=${encodeURIComponent(
                checkoutSessionId
            )}`;
            const response = await window.fetch(requestUrl, {
                method: 'GET',
                cache: 'no-store',
                headers: {
                    Accept: 'application/json',
                },
                signal: requestController.signal,
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.ok !== true) {
                const errorMessage = resolveVerificationMessageFromServerError(payload?.error);
                throw new Error(errorMessage);
            }
            return {
                status: normalizeDonationSessionStatus(payload?.status),
                paid: payload?.paid === true,
                final: payload?.final === true,
                amountCents: sanitizeAmountCents(payload?.amountCents),
                currency: sanitizeCurrencyCode(payload?.currency, DONATE_CURRENCY),
            };
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    function setButtonsVisible(visible) {
        donateContexts.forEach((entry) => {
            const shouldHideForWelcomeOnline = entry.key === 'welcome' && isWelcomeOnlineFlowOpen;
            entry.buttonEl.hidden = !visible || shouldHideForWelcomeOnline;
            entry.buttonEl.disabled = false;
        });
    }

    function toggle(contextKey) {
        if (!contextKey) {
            return;
        }
        if (!panelRootEl.hidden && activeContextKey === contextKey) {
            close();
            return;
        }
        open(contextKey);
    }

    function resolveContext(contextKey) {
        if (!contextKey) {
            return null;
        }
        return donateContexts.find((entry) => entry.key === contextKey) || null;
    }

    function resolveDefaultContext() {
        if (activeContextKey) {
            const activeContext = resolveContext(activeContextKey);
            if (activeContext) {
                return activeContext;
            }
        }
        const visibleContext = donateContexts.find((entry) => !entry.buttonEl.hidden);
        return visibleContext || donateContexts[0] || null;
    }

    function updateButtonExpandedState() {
        const isOpen = !panelRootEl.hidden;
        donateContexts.forEach((entry) => {
            const expanded = isOpen && activeContextKey === entry.key ? 'true' : 'false';
            entry.buttonEl.setAttribute('aria-expanded', expanded);
        });
    }
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

function isAmountAllowed(amountCents) {
    const numeric = Math.round(Number(amountCents) || 0);
    if (!Number.isFinite(numeric)) {
        return false;
    }
    if (numeric < DONATE_MIN_AMOUNT_CENTS || numeric > DONATE_MAX_AMOUNT_CENTS) {
        return false;
    }
    return numeric % DONATE_AMOUNT_STEP_CENTS === 0;
}

function centsToMajor(amountCents) {
    return Math.round(Number(amountCents) || 0) / 100;
}

function sanitizeCurrencyCode(value, fallback = 'eur') {
    if (typeof value !== 'string') {
        return fallback;
    }
    const normalized = value.trim().toLowerCase();
    return /^[a-z]{3}$/.test(normalized) ? normalized : fallback;
}

function createCurrencyFormatter(currencyCode) {
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: sanitizeCurrencyCode(currencyCode, 'eur').toUpperCase(),
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

function resolveStatusMessageFromServerError(rawValue) {
    if (typeof rawValue !== 'string') {
        return DONATE_CHECKOUT_FAILED_MESSAGE;
    }
    const normalized = rawValue.trim().replace(/\s+/g, ' ').slice(0, 180);
    return normalized || DONATE_CHECKOUT_FAILED_MESSAGE;
}

function resolveVerificationMessageFromServerError(rawValue) {
    if (typeof rawValue !== 'string') {
        return DONATE_VERIFICATION_FAILED_STATUS;
    }
    const normalized = rawValue.trim().replace(/\s+/g, ' ').slice(0, 180);
    return normalized || DONATE_VERIFICATION_FAILED_STATUS;
}

function sanitizeDonationReturnState(rawValue) {
    if (typeof rawValue !== 'string') {
        return '';
    }
    const normalized = rawValue.trim().toLowerCase();
    if (normalized === 'success' || normalized === 'cancel') {
        return normalized;
    }
    return '';
}

function sanitizeStripeCheckoutSessionId(rawValue) {
    if (typeof rawValue !== 'string') {
        return '';
    }
    const normalized = rawValue.trim();
    if (!/^cs_[A-Za-z0-9_]{8,255}$/.test(normalized)) {
        return '';
    }
    return normalized;
}

function normalizeDonationSessionStatus(rawValue) {
    if (typeof rawValue !== 'string') {
        return 'unknown';
    }
    const normalized = rawValue.trim().toLowerCase();
    if (
        normalized === 'paid' ||
        normalized === 'processing' ||
        normalized === 'open' ||
        normalized === 'canceled' ||
        normalized === 'expired' ||
        normalized === 'failed'
    ) {
        return normalized;
    }
    return 'unknown';
}

function isDonationSessionStatusFinal(status) {
    const normalized = normalizeDonationSessionStatus(status);
    return (
        normalized === 'paid' ||
        normalized === 'failed' ||
        normalized === 'expired' ||
        normalized === 'canceled'
    );
}

function isDonationSessionStatusRetryable(status) {
    const normalized = normalizeDonationSessionStatus(status);
    return normalized === 'processing' || normalized === 'open';
}

function waitForMs(durationMs) {
    const delayMs = Math.max(0, Math.round(Number(durationMs) || 0));
    return new Promise((resolve) => {
        window.setTimeout(resolve, delayMs);
    });
}

function resolveReturnStatusMessageFromSessionStatus(status) {
    const normalized = normalizeDonationSessionStatus(status);
    if (normalized === 'paid') {
        return {
            messageText: DONATE_SUCCESS_STATUS,
            tone: 'info',
            timeoutMs: 4200,
        };
    }
    if (normalized === 'processing' || normalized === 'open') {
        return {
            messageText: DONATE_PENDING_STATUS,
            tone: 'info',
            timeoutMs: 3600,
        };
    }
    if (normalized === 'expired') {
        return {
            messageText: DONATE_EXPIRED_STATUS,
            tone: 'muted',
            timeoutMs: 3200,
        };
    }
    if (normalized === 'failed' || normalized === 'canceled') {
        return {
            messageText: DONATE_FAILED_STATUS,
            tone: 'error',
            timeoutMs: 3200,
        };
    }
    return {
        messageText: DONATE_VERIFICATION_FAILED_STATUS,
        tone: 'error',
        timeoutMs: 3200,
    };
}

function createDonateGlobalNoticeController() {
    const rootEl = ensureDonateGlobalNoticeRoot();
    const noticeEl = ensureDonateGlobalNoticeElement(rootEl);
    let hideDelayTimer = 0;
    let autoHideTimer = 0;

    return {
        show,
        hide,
    };

    function show(messageText, tone = 'info', timeoutMs = 3200) {
        const normalizedMessage = sanitizeGlobalNoticeMessage(messageText);
        if (!normalizedMessage) {
            return;
        }
        clearHideTimers();
        noticeEl.textContent = normalizedMessage;
        noticeEl.dataset.tone = sanitizeGlobalNoticeTone(tone);
        rootEl.hidden = false;
        rootEl.setAttribute('aria-hidden', 'false');
        rootEl.classList.add('is-visible');

        const durationMs = sanitizeGlobalNoticeDuration(timeoutMs);
        if (durationMs <= 0) {
            return;
        }
        autoHideTimer = window.setTimeout(() => {
            hide();
        }, durationMs);
    }

    function hide() {
        clearHideTimers();
        rootEl.classList.remove('is-visible');
        hideDelayTimer = window.setTimeout(() => {
            rootEl.hidden = true;
            rootEl.setAttribute('aria-hidden', 'true');
        }, DONATE_GLOBAL_NOTICE_HIDE_ANIMATION_MS);
    }

    function clearHideTimers() {
        if (autoHideTimer > 0) {
            window.clearTimeout(autoHideTimer);
            autoHideTimer = 0;
        }
        if (hideDelayTimer > 0) {
            window.clearTimeout(hideDelayTimer);
            hideDelayTimer = 0;
        }
    }
}

function ensureDonateGlobalNoticeRoot() {
    const existingRootEl = document.getElementById('donateGlobalNoticeLayer');
    if (existingRootEl) {
        return existingRootEl;
    }
    const rootEl = document.createElement('div');
    rootEl.id = 'donateGlobalNoticeLayer';
    rootEl.className = 'donateGlobalNoticeLayer';
    rootEl.setAttribute('aria-hidden', 'true');
    rootEl.hidden = true;
    document.body.append(rootEl);
    return rootEl;
}

function ensureDonateGlobalNoticeElement(rootEl) {
    const existingNoticeEl = rootEl.querySelector('.donateGlobalNotice');
    if (existingNoticeEl) {
        return existingNoticeEl;
    }
    const noticeEl = document.createElement('div');
    noticeEl.className = 'donateGlobalNotice';
    noticeEl.setAttribute('role', 'status');
    noticeEl.setAttribute('aria-live', 'polite');
    noticeEl.dataset.tone = 'info';
    rootEl.append(noticeEl);
    return noticeEl;
}

function sanitizeGlobalNoticeMessage(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 220);
    return normalized;
}

function sanitizeGlobalNoticeTone(value) {
    if (typeof value !== 'string') {
        return 'info';
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'error' || normalized === 'muted' || normalized === 'info') {
        return normalized;
    }
    return 'info';
}

function sanitizeGlobalNoticeDuration(value) {
    const numeric = Math.round(Number(value));
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return 0;
    }
    return Math.min(12_000, Math.max(800, numeric));
}

function resolveGratitudeContentFromSessionStatus(sessionStatusPayload) {
    const amountText = formatDonationAmountForDisplay({
        amountCents: sessionStatusPayload?.amountCents,
        currencyCode: sessionStatusPayload?.currency,
    });
    return {
        titleText: DONATE_SUCCESS_TITLE,
        subtitleText: DONATE_SUCCESS_SUBTITLE,
        messageText: '',
        amountText,
        previewMode: false,
    };
}

function formatDonationAmountForDisplay({ amountCents, currencyCode } = {}) {
    const numericAmountCents = sanitizeAmountCents(amountCents);
    if (!Number.isInteger(numericAmountCents) || numericAmountCents <= 0) {
        return '';
    }
    const formatter = createCurrencyFormatter(sanitizeCurrencyCode(currencyCode, DONATE_CURRENCY));
    return formatter.format(centsToMajor(numericAmountCents));
}

function sanitizeAmountCents(value) {
    const numeric = Math.round(Number(value));
    if (!Number.isFinite(numeric) || numeric < 0) {
        return null;
    }
    return numeric;
}

function createDonateGratitudeModalController() {
    const overlayEl = ensureDonateGratitudeOverlayElement();
    const titleEl = overlayEl.querySelector('.donateGratitudeTitle');
    const subtitleEl = overlayEl.querySelector('.donateGratitudeSubtitle');
    const amountEl = overlayEl.querySelector('.donateGratitudeAmount');
    const messageEl = overlayEl.querySelector('.donateGratitudeMessage');
    const closeBtnEl = overlayEl.querySelector('.donateGratitudeCloseBtn');
    const continueBtnEl = overlayEl.querySelector('.donateGratitudeContinueBtn');
    const cardEl = overlayEl.querySelector('.donateGratitudeCard');

    const hide = () => {
        overlayEl.classList.remove('is-visible');
        window.setTimeout(() => {
            if (!overlayEl.classList.contains('is-visible')) {
                overlayEl.hidden = true;
                overlayEl.setAttribute('aria-hidden', 'true');
            }
        }, 200);
    };

    closeBtnEl?.addEventListener('click', hide);
    continueBtnEl?.addEventListener('click', hide);
    overlayEl.addEventListener('click', (event) => {
        if (event.target === overlayEl) {
            hide();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !overlayEl.hidden) {
            event.preventDefault();
            hide();
        }
    });

    return {
        show(payload = {}) {
            const titleText = sanitizeGratitudeText(payload.titleText, DONATE_SUCCESS_TITLE, 90);
            const subtitleText = sanitizeGratitudeText(
                payload.subtitleText,
                DONATE_SUCCESS_SUBTITLE,
                170
            );
            const messageText = sanitizeOptionalGratitudeText(payload.messageText, 220);
            const amountText = sanitizeGratitudeText(payload.amountText, '', 40);
            const previewMode = Boolean(payload.previewMode);

            titleEl.textContent = titleText;
            subtitleEl.textContent = subtitleText;
            messageEl.textContent = messageText;
            messageEl.hidden = !messageText;
            amountEl.textContent = amountText || '';
            amountEl.hidden = !amountText;
            cardEl.dataset.preview = previewMode ? 'true' : 'false';

            overlayEl.hidden = false;
            overlayEl.setAttribute('aria-hidden', 'false');
            requestAnimationFrame(() => {
                overlayEl.classList.add('is-visible');
            });
        },
        hide,
    };
}

function ensureDonateGratitudeOverlayElement() {
    const existingEl = document.getElementById('donateGratitudeOverlay');
    if (existingEl) {
        return existingEl;
    }

    const overlayEl = document.createElement('section');
    overlayEl.id = 'donateGratitudeOverlay';
    overlayEl.className = 'donateGratitudeOverlay';
    overlayEl.setAttribute('aria-hidden', 'true');
    overlayEl.hidden = true;
    overlayEl.innerHTML = `
        <div class="donateGratitudeCard" role="dialog" aria-modal="true" aria-labelledby="donateGratitudeTitle">
            <button class="donateGratitudeCloseBtn" type="button" aria-label="Close thank-you message">×</button>
            <div class="donateGratitudeKicker">Support Received</div>
            <h2 id="donateGratitudeTitle" class="donateGratitudeTitle">Thank You, Driver</h2>
            <p class="donateGratitudeSubtitle"></p>
            <div class="donateGratitudeAmount" hidden></div>
            <p class="donateGratitudeMessage"></p>
            <div class="donateGratitudeActions">
                <button class="donateGratitudeContinueBtn" type="button">Keep Drifting</button>
            </div>
            <div class="donateGratitudeGlow donateGratitudeGlowA" aria-hidden="true"></div>
            <div class="donateGratitudeGlow donateGratitudeGlowB" aria-hidden="true"></div>
        </div>
    `;
    document.body.append(overlayEl);
    return overlayEl;
}

function sanitizeGratitudeText(value, fallback = '', maxLength = 180) {
    if (typeof value !== 'string') {
        return fallback;
    }
    const normalized = value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
    return normalized || fallback;
}

function sanitizeOptionalGratitudeText(value, maxLength = 180) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function isLocalDevelopmentHost(hostnameValue) {
    const normalizedHostname = String(hostnameValue || '')
        .trim()
        .toLowerCase();
    return (
        normalizedHostname === 'localhost' ||
        normalizedHostname === '127.0.0.1' ||
        normalizedHostname === '::1'
    );
}

function isFormFieldEventTarget(target) {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    const tagName = target.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        return true;
    }
    return target.isContentEditable;
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
