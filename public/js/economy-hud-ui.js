import { formatPlayerCredits } from './player-economy.js';

export function createEconomyHudController() {
    const rootEl = document.getElementById('economyHud');
    const syncBadgeEl = document.getElementById('economyHudSyncBadge');
    const balanceEl = document.getElementById('economyHudBalance');
    const runDeltaEl = document.getElementById('economyHudRunDelta');
    const targetLabelEl = document.getElementById('economyHudTargetLabel');
    const targetValueEl = document.getElementById('economyHudTargetValue');
    const progressFillEl = document.getElementById('economyHudProgressFill');
    const activityEl = document.getElementById('economyHudActivity');

    if (
        !rootEl ||
        !syncBadgeEl ||
        !balanceEl ||
        !runDeltaEl ||
        !targetLabelEl ||
        !targetValueEl ||
        !progressFillEl ||
        !activityEl
    ) {
        return createNoopEconomyHudController();
    }

    const numberFormatter = new Intl.NumberFormat('en-US');
    const state = {
        gameplayVisible: false,
        lastActivityId: '',
        activityHideTimeout: null,
        flashTimeout: null,
    };

    renderState();
    syncVisibility();

    return {
        setGameplayVisible(nextVisible) {
            state.gameplayVisible = Boolean(nextVisible);
            syncVisibility();
        },
        setState(nextState = null) {
            renderState(nextState);
        },
    };

    function renderState(nextState = null) {
        const normalized = normalizeEconomyHudState(nextState);
        balanceEl.textContent = formatPlayerCredits(normalized.walletCredits, {
            formatter: numberFormatter,
        });
        runDeltaEl.textContent = `RUN ${formatPlayerCredits(normalized.runCredits, {
            formatter: numberFormatter,
            includePlusSign: true,
        })}`;
        syncBadgeEl.textContent = normalized.syncLabel;
        syncBadgeEl.dataset.tone = normalized.syncTone;
        targetLabelEl.textContent = normalized.targetLabel;
        targetValueEl.textContent = normalized.targetValue;
        progressFillEl.style.transform = `scaleX(${normalized.progressRatio.toFixed(3)})`;

        const nextActivityId =
            normalized.activity && typeof normalized.activity.id === 'string'
                ? normalized.activity.id
                : '';
        if (nextActivityId && nextActivityId !== state.lastActivityId) {
            state.lastActivityId = nextActivityId;
            showActivity(normalized.activity.text);
            return;
        }
        if (!nextActivityId && !normalized.activity?.persistVisible) {
            hideActivity();
        }
    }

    function showActivity(messageText = '') {
        if (state.activityHideTimeout != null) {
            window.clearTimeout(state.activityHideTimeout);
            state.activityHideTimeout = null;
        }
        if (state.flashTimeout != null) {
            window.clearTimeout(state.flashTimeout);
            state.flashTimeout = null;
        }
        activityEl.textContent = messageText || 'Wallet updated';
        activityEl.hidden = false;
        rootEl.dataset.flash = 'true';
        state.flashTimeout = window.setTimeout(() => {
            state.flashTimeout = null;
            rootEl.dataset.flash = 'false';
        }, 320);
        state.activityHideTimeout = window.setTimeout(() => {
            state.activityHideTimeout = null;
            hideActivity();
        }, 1800);
    }

    function hideActivity() {
        activityEl.hidden = true;
        activityEl.textContent = '';
        rootEl.dataset.flash = 'false';
    }

    function syncVisibility() {
        rootEl.hidden = !state.gameplayVisible;
        if (!state.gameplayVisible) {
            hideActivity();
        }
    }
}

function createNoopEconomyHudController() {
    return {
        setGameplayVisible() {},
        setState() {},
    };
}

function normalizeEconomyHudState(value = null) {
    const source = value && typeof value === 'object' ? value : {};
    const walletCredits = clampInteger(source.walletCredits);
    const runCredits = clampInteger(source.runCredits);
    const progressRatio = clampRatio(source.progressRatio);
    const syncTone = normalizeTone(source.syncTone);
    const syncLabel =
        typeof source.syncLabel === 'string' && source.syncLabel.trim()
            ? source.syncLabel.trim()
            : 'LOCAL';
    const targetLabel =
        typeof source.targetLabel === 'string' && source.targetLabel.trim()
            ? source.targetLabel.trim()
            : 'Garage complete';
    const targetValue =
        typeof source.targetValue === 'string' && source.targetValue.trim()
            ? source.targetValue.trim()
            : 'All chassis online';
    const activity =
        source.activity && typeof source.activity === 'object'
            ? {
                  id:
                      typeof source.activity.id === 'string' && source.activity.id.trim()
                          ? source.activity.id.trim()
                          : '',
                  text:
                      typeof source.activity.text === 'string' && source.activity.text.trim()
                          ? source.activity.text.trim()
                          : '',
                  persistVisible: Boolean(source.activity.persistVisible),
              }
            : null;

    return {
        walletCredits,
        runCredits,
        progressRatio,
        syncTone,
        syncLabel,
        targetLabel,
        targetValue,
        activity,
    };
}

function clampInteger(value) {
    const numeric = Math.round(Number(value) || 0);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, numeric));
}

function clampRatio(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(1, numeric));
}

function normalizeTone(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'success' || normalized === 'info') {
        return normalized;
    }
    return 'muted';
}
