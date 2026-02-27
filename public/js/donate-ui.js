const DONATE_DESCRIPTION_TEXT = 'One-time support for Minefield Drift.';
const DONATE_DISABLED_MESSAGE = 'Donations are currently unavailable.';
const DONATE_CURRENCY = 'usd';
const DONATE_MIN_AMOUNT_CENTS = 100;
const DONATE_MAX_AMOUNT_CENTS = 100_000;
const DONATE_AMOUNT_STEP_CENTS = 100;
const DONATE_PRESET_AMOUNTS_CENTS = Object.freeze([500, 1000, 2500, 5000]);
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
        setButtonsVisible(true);
        updateButtonExpandedState();

        donateContexts.forEach((entry) => {
            entry.buttonEl.addEventListener('click', () => {
                toggle(entry.key);
            });
        });
        submitBtnEl.addEventListener('click', () => {
            submitDonation();
        });
        customAmountInputEl?.addEventListener('input', () => {
            selectedPresetAmountCents = null;
            syncPresetSelectionUi();
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

    function refreshConfig() {
        configurePanel();
    }

    function open(contextKey = '') {
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
        setStatus('', 'muted');
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

        submitBtnEl.disabled = false;
        renderPresetButtons();
        if (Number.isFinite(selectedPresetAmountCents)) {
            selectPresetAmount(selectedPresetAmountCents, { updateInput: true });
        }
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

    function submitDonation() {
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

        setStatus(DONATE_DISABLED_MESSAGE, 'info');
        onStatus(DONATE_DISABLED_MESSAGE, 3200);
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

function sanitizeCurrencyCode(value, fallback = 'usd') {
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
