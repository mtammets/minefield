function clamp01(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.min(1, Math.max(0, value));
}

function formatPercent(value) {
    return `${Math.round(clamp01(value) * 100)}%`;
}

export function createObjectiveHudController({ statusDefaultText = '' } = {}) {
    const rootEl = document.getElementById('missionHud');
    const counterEl = document.getElementById('missionHudCounter');
    const timelineEl = document.getElementById('missionHudTimeline');
    const titleEl = document.getElementById('missionHudTitle');
    const primaryEl = document.getElementById('missionHudPrimary');
    const secondaryEl = document.getElementById('missionHudSecondary');
    const threatIconsEl = document.getElementById('missionHudThreatIcons');
    const progressEl = document.getElementById('missionHudProgress');
    const progressFillEl = document.getElementById('missionHudProgressFill');
    const statusEl = document.getElementById('missionHudStatus');
    const targetSwatchEl = document.getElementById('missionHudTargetSwatch');

    if (!rootEl) {
        return createNoopObjectiveHudController();
    }

    const defaultStatus =
        typeof statusDefaultText === 'string' ? statusDefaultText.trim() : '';
    let gameplayVisible = false;
    let statusResetTimeout = null;
    let persistentStatusText = defaultStatus;
    let persistentStatusTone = 'muted';

    applyMissionState({
        missionNumber: 1,
        totalMissions: 5,
        title: 'Street Sweep',
        pickupCurrent: 0,
        pickupTarget: 0,
        pickupRequired: false,
        botCount: 1,
        eliminationCurrent: 0,
        eliminationTarget: 0,
        progressValue: 0,
    });
    setStatus(defaultStatus, 'muted', 0, { persist: true });
    syncVisibility();

    return {
        setTargetColor(targetColorHex) {
            if (!targetSwatchEl) {
                return;
            }
            const resolvedHex = normalizeColorHex(targetColorHex);
            targetSwatchEl.style.setProperty('--mission-target-color', resolvedHex);
        },
        flashCorrect(_pickupColorHex, context = null) {
            const pointsText = Number.isFinite(context?.pointsAwarded)
                ? `+${Math.max(0, Math.round(context.pointsAwarded))}`
                : '';
            const sourceLabel =
                typeof context?.sourceLabel === 'string' && context.sourceLabel.trim()
                    ? context.sourceLabel.trim().toUpperCase()
                    : '';
            const scoreText = [pointsText, sourceLabel].filter(Boolean).join(' ');
            setStatus(scoreText, 'success', 1000);
        },
        showFailure(messageText, timeoutMs = 1800) {
            setStatus(messageText, 'warning', timeoutMs);
        },
        showCrash(messageText, timeoutMs = 2200) {
            setStatus(messageText, 'danger', timeoutMs);
        },
        showInfo(messageText, timeoutMs = 1400) {
            setStatus(messageText, 'info', timeoutMs);
        },
        showResult(messageText, timeoutMs = 1600) {
            setStatus(messageText, 'success', timeoutMs);
        },
        resetStatus() {
            setStatus(persistentStatusText, persistentStatusTone, 0);
        },
        setGameplayVisible(nextVisible) {
            gameplayVisible = Boolean(nextVisible);
            syncVisibility();
        },
        registerControlAction() {},
        setMissionState(nextMissionState = null) {
            if (!nextMissionState || typeof nextMissionState !== 'object') {
                return;
            }
            applyMissionState(nextMissionState);
        },
        clearMissionState() {
            applyMissionState({
                missionNumber: 1,
                totalMissions: 5,
                title: 'Street Sweep',
                pickupCurrent: 0,
                pickupTarget: 0,
                pickupRequired: false,
                botCount: 1,
                eliminationCurrent: 0,
                eliminationTarget: 0,
                progressValue: 0,
            });
            setStatus(defaultStatus, 'muted', 0, { persist: true });
        },
    };

    function applyMissionState(nextMissionState = {}) {
        const missionNumber = Math.max(
            1,
            Math.round(Number(nextMissionState.missionNumber) || 1)
        );
        const totalMissions = Math.max(
            missionNumber,
            Math.round(Number(nextMissionState.totalMissions) || missionNumber)
        );
        const pickupCurrent = Math.max(
            0,
            Math.round(Number(nextMissionState.pickupCurrent) || 0)
        );
        const pickupTarget = Math.max(0, Math.round(Number(nextMissionState.pickupTarget) || 0));
        const pickupRequired =
            nextMissionState.pickupRequired !== false && pickupTarget > 0;
        const botCount = Math.max(0, Math.round(Number(nextMissionState.botCount) || 0));
        const eliminationCurrent = Math.max(
            0,
            Math.round(Number(nextMissionState.eliminationCurrent) || 0)
        );
        const eliminationTarget = Math.max(
            0,
            Math.round(Number(nextMissionState.eliminationTarget) || 0)
        );
        const progressValue = clamp01(
            Number.isFinite(nextMissionState.progressValue)
                ? nextMissionState.progressValue
                : nextMissionState.progress
        );

        rootEl.dataset.eliminationMode = eliminationTarget > 0 ? 'true' : 'false';
        rootEl.dataset.pickupRequired = pickupRequired ? 'true' : 'false';

        if (counterEl) {
            counterEl.textContent = `M${missionNumber}`;
        }
        if (timelineEl) {
            timelineEl.innerHTML = buildTimelineDotsHtml(missionNumber, totalMissions);
        }
        if (titleEl) {
            titleEl.textContent = normalizeText(nextMissionState.title, 'Mission');
        }
        if (primaryEl) {
            primaryEl.textContent = pickupRequired
                ? `${Math.min(pickupCurrent, pickupTarget)}/${pickupTarget}`
                : `+${pickupCurrent}`;
        }
        if (secondaryEl) {
            secondaryEl.textContent =
                eliminationTarget > 0
                    ? `${Math.min(eliminationCurrent, eliminationTarget)}/${eliminationTarget}`
                    : String(botCount);
        }
        if (threatIconsEl) {
            threatIconsEl.innerHTML = buildThreatIconsHtml({
                botCount,
                eliminationCurrent,
                eliminationTarget,
            });
        }
        if (progressEl) {
            progressEl.textContent = formatPercent(progressValue);
        }
        if (progressFillEl) {
            progressFillEl.style.transform = `scaleX(${progressValue})`;
        }
    }

    function setStatus(messageText, tone = 'muted', timeoutMs = 0, options = {}) {
        if (!statusEl) {
            return;
        }
        if (statusResetTimeout != null) {
            window.clearTimeout(statusResetTimeout);
            statusResetTimeout = null;
        }
        const resolvedText = typeof messageText === 'string' ? messageText.trim() : '';
        const resolvedTone = normalizeTone(tone);
        if (options?.persist || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            persistentStatusText = resolvedText;
            persistentStatusTone = resolvedTone;
        }
        statusEl.textContent = resolvedText;
        statusEl.dataset.tone = resolvedTone;
        statusEl.hidden = !resolvedText;
        if (Number.isFinite(timeoutMs) && timeoutMs > 0 && resolvedText) {
            statusResetTimeout = window.setTimeout(() => {
                statusResetTimeout = null;
                setStatus(persistentStatusText, persistentStatusTone, 0);
            }, Math.max(0, Math.round(timeoutMs)));
        }
    }

    function syncVisibility() {
        rootEl.hidden = !gameplayVisible;
    }
}

function buildTimelineDotsHtml(missionNumber, totalMissions) {
    const parts = [];
    for (let index = 0; index < totalMissions; index += 1) {
        let tone = 'upcoming';
        if (index + 1 < missionNumber) {
            tone = 'complete';
        } else if (index + 1 === missionNumber) {
            tone = 'current';
        }
        parts.push(`<span class="missionHudTimelineDot" data-tone="${tone}"></span>`);
    }
    return parts.join('');
}

function buildThreatIconsHtml({ botCount = 0, eliminationCurrent = 0, eliminationTarget = 0 } = {}) {
    const totalIcons = Math.max(1, botCount);
    const clearedCount =
        eliminationTarget > 0 ? Math.min(totalIcons, Math.max(0, eliminationCurrent)) : 0;
    const parts = [];
    for (let index = 0; index < totalIcons; index += 1) {
        const tone = index < clearedCount ? 'cleared' : 'live';
        parts.push(`<span class="missionHudThreatIcon" data-tone="${tone}"></span>`);
    }
    return parts.join('');
}

function createNoopObjectiveHudController() {
    return {
        setTargetColor() {},
        flashCorrect() {},
        showFailure() {},
        showCrash() {},
        showInfo() {},
        showResult() {},
        resetStatus() {},
        setGameplayVisible() {},
        registerControlAction() {},
        setMissionState() {},
        clearMissionState() {},
    };
}

function normalizeText(value, fallback) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || fallback;
}

function normalizeTone(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (
        normalized === 'danger' ||
        normalized === 'warning' ||
        normalized === 'success' ||
        normalized === 'info'
    ) {
        return normalized;
    }
    return 'muted';
}

function normalizeColorHex(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return '#7cf9ff';
    }
    return `#${Math.max(0, Math.min(0xffffff, Math.round(numeric)))
        .toString(16)
        .padStart(6, '0')}`;
}
