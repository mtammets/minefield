const BOTS_MISSION_DEFINITIONS = Object.freeze([
    Object.freeze({
        id: 'street-sweep',
        title: 'Street Sweep',
        brief: 'Break the opening patrol and stay alive while the first reinforcements roll in.',
        botCount: 2,
        eliminationTarget: 4,
        pickupPool: 12,
        maxActivePickups: 4,
        reinforcementDelayMs: 1200,
    }),
    Object.freeze({
        id: 'cut-the-feed',
        title: 'Cut The Feed',
        brief: 'Hold the avenue and grind through a longer wave before the line stabilizes.',
        botCount: 2,
        eliminationTarget: 5,
        pickupPool: 16,
        maxActivePickups: 5,
        reinforcementDelayMs: 1250,
    }),
    Object.freeze({
        id: 'break-the-blockade',
        title: 'Break The Blockade',
        brief: 'The blockade thickens. Keep pressure on the sector until the whole rotation is down.',
        botCount: 2,
        eliminationTarget: 6,
        pickupPool: 20,
        maxActivePickups: 5,
        reinforcementDelayMs: 1300,
    }),
    Object.freeze({
        id: 'night-harvest',
        title: 'Night Harvest',
        brief: 'Night traffic closes in. Outlast a heavier reinforcement cycle without losing the car.',
        botCount: 2,
        eliminationTarget: 7,
        pickupPool: 24,
        maxActivePickups: 6,
        reinforcementDelayMs: 1350,
    }),
    Object.freeze({
        id: 'final-sweep',
        title: 'Final Sweep',
        brief: 'Final contract. Drain the last reinforcement pool and finish the sector cleanly.',
        botCount: 2,
        eliminationTarget: 8,
        pickupPool: 30,
        maxActivePickups: 6,
        reinforcementDelayMs: 1400,
    }),
]);

export function getBotsMissionMaxBotCount() {
    return BOTS_MISSION_DEFINITIONS.reduce(
        (maxBotCount, mission) => Math.max(maxBotCount, mission.botCount || 0),
        0
    );
}

export function createBotsMissionDirector({
    objectiveUi = null,
    getGameMode = () => 'bots',
    prepareMission = () => {},
    scheduleMissionReinforcement = () => false,
    setMissionTransitionLocked = () => {},
    startMissionCountdown = () => {},
    finalizeCampaign = () => {},
    getPlayerCollectedCount = () => 0,
    getTotalScore = () => 0,
} = {}) {
    const totalMissions = BOTS_MISSION_DEFINITIONS.length;
    const campaignPickupPoolTotal = BOTS_MISSION_DEFINITIONS.reduce(
        (sum, mission) => sum + Math.max(0, Math.round(Number(mission.pickupPool) || 0)),
        0
    );
    let campaignActive = false;
    let missionResolved = false;
    let missionIndex = -1;
    let missionPlayerPickupStart = 0;
    let missionEliminatedCount = 0;
    let missionSpawnedCount = 0;
    let transitionTimeout = null;

    return {
        startCampaign({ shouldStartCountdown = false } = {}) {
            clearPendingTransition();
            if (normalizeGameMode(getGameMode()) !== 'bots') {
                campaignActive = false;
                return false;
            }
            campaignActive = true;
            missionResolved = false;
            missionIndex = -1;
            missionPlayerPickupStart = 0;
            missionEliminatedCount = 0;
            missionSpawnedCount = 0;
            return beginMission(0, {
                shouldStartCountdown,
                isCampaignStart: true,
            });
        },
        handlePickupCollected({ collectorId = 'player' } = {}) {
            if (!campaignActive || missionResolved || normalizeGameMode(getGameMode()) !== 'bots') {
                return false;
            }
            if (normalizeCollectorId(collectorId) !== 'player') {
                return false;
            }
            refreshHud();
            return false;
        },
        handleBotDestroyed(botEvent = null) {
            if (!campaignActive || missionResolved || normalizeGameMode(getGameMode()) !== 'bots') {
                return false;
            }
            const collectorId = normalizeCollectorId(botEvent?.collectorId);
            if (!collectorId) {
                return false;
            }

            const mission = getCurrentMission();
            if (!mission) {
                return false;
            }

            const eliminationTarget = Math.max(
                0,
                Math.round(Number(mission.eliminationTarget) || 0)
            );
            missionEliminatedCount = Math.min(eliminationTarget, missionEliminatedCount + 1);
            refreshHud();
            if (eliminationTarget > 0) {
                objectiveUi?.showInfo?.(
                    `${resolveEliminationProgressText(mission, missionEliminatedCount)} secured.`,
                    1200
                );
            }
            if (isCurrentMissionComplete()) {
                queueMissionSuccess();
                return true;
            }

            if (missionSpawnedCount < eliminationTarget) {
                const scheduled = scheduleMissionReinforcement({
                    collectorId,
                    delayMs: Math.max(
                        0,
                        Math.round(Number(mission.reinforcementDelayMs) || 0)
                    ),
                });
                if (scheduled) {
                    missionSpawnedCount += 1;
                }
            }
            return false;
        },
        handlePickupsExhausted() {
            if (!campaignActive || missionResolved || normalizeGameMode(getGameMode()) !== 'bots') {
                return false;
            }
            if (isCurrentMissionComplete()) {
                queueMissionSuccess();
                return true;
            }
            objectiveUi?.showInfo?.('Pickup bonus exhausted. Mission continues.', 1500);
            refreshHud();
            return false;
        },
        handlePlayerOutOfCars() {
            if (!campaignActive || missionResolved || normalizeGameMode(getGameMode()) !== 'bots') {
                return false;
            }
            if (!getCurrentMission()) {
                return false;
            }
            queueCampaignFailure(
                `Mission ${missionIndex + 1} failed: the garage is empty and the sector stays hostile.`
            );
            return true;
        },
        getScoreProgress(options = null) {
            if (!campaignActive) {
                return 0;
            }
            const additionalEliminations = Math.max(
                0,
                Math.round(Number(options?.additionalEliminations) || 0)
            );
            return getCurrentMissionProgress(additionalEliminations);
        },
        refreshHud() {
            refreshHud();
        },
        isActive() {
            return campaignActive;
        },
        clear() {
            clearPendingTransition();
            campaignActive = false;
            missionResolved = false;
            missionIndex = -1;
            missionPlayerPickupStart = 0;
            missionEliminatedCount = 0;
            missionSpawnedCount = 0;
        },
    };

    function beginMission(nextMissionIndex, { shouldStartCountdown = true, isCampaignStart = false } = {}) {
        const mission = BOTS_MISSION_DEFINITIONS[nextMissionIndex];
        if (!mission) {
            return false;
        }
        clearPendingTransition();
        missionIndex = nextMissionIndex;
        missionResolved = false;
        missionEliminatedCount = 0;
        missionSpawnedCount = Math.min(
            Math.max(0, Math.round(Number(mission.botCount) || 0)),
            Math.max(0, Math.round(Number(mission.eliminationTarget) || 0))
        );
        setMissionTransitionLocked(false);
        prepareMission(mission, {
            missionNumber: missionIndex + 1,
            totalMissions,
            isCampaignStart,
        });
        missionPlayerPickupStart = Math.max(
            0,
            Math.round(Number(getPlayerCollectedCount()) || 0)
        );
        refreshHud();
        if (shouldStartCountdown) {
            startMissionCountdown();
        }
        return true;
    }

    function refreshHud() {
        const mission = getCurrentMission();
        if (!mission) {
            return;
        }
        objectiveUi?.setMissionState?.({
            missionNumber: missionIndex + 1,
            totalMissions,
            title: mission.title,
            pickupCurrent: getMissionPlayerPickups(),
            pickupTarget: 0,
            pickupRequired: false,
            botCount: mission.eliminationTarget,
            eliminationCurrent: missionEliminatedCount,
            eliminationTarget: mission.eliminationTarget,
            progressValue: getCurrentMissionProgress(),
        });
    }

    function queueMissionSuccess() {
        if (missionResolved) {
            return;
        }
        missionResolved = true;
        setMissionTransitionLocked(true);
        const isFinalMission = missionIndex >= totalMissions - 1;
        objectiveUi?.showResult?.(isFinalMission ? 'Cleared' : 'Next wave', 900);
        if (isFinalMission) {
            queueCampaignSuccess();
            return;
        }
        transitionTimeout = window.setTimeout(() => {
            transitionTimeout = null;
            beginMission(missionIndex + 1, {
                shouldStartCountdown: true,
                isCampaignStart: false,
            });
        }, 1400);
    }

    function queueCampaignSuccess() {
        if (!campaignActive) {
            return;
        }
        campaignActive = false;
        transitionTimeout = window.setTimeout(() => {
            transitionTimeout = null;
            finalizeCampaign({
                titleText: 'CAMPAIGN COMPLETE',
                finishLabel: 'All missions cleared',
                finishReason: 'campaign-complete',
                totalPickups: campaignPickupPoolTotal,
                totalCollected: Math.max(0, Math.round(Number(getPlayerCollectedCount()) || 0)),
                totalScore: Math.max(0, Math.round(Number(getTotalScore()) || 0)),
                summaryText:
                    'All contracts cleared. Reinforcements ran dry and the whole sector was swept clean.',
            });
        }, 150);
    }

    function queueCampaignFailure(messageText) {
        if (missionResolved) {
            return;
        }
        missionResolved = true;
        campaignActive = false;
        setMissionTransitionLocked(true);
        objectiveUi?.showFailure?.('Failed', 1200);
        const failedMissionIndex = missionIndex;
        transitionTimeout = window.setTimeout(() => {
            transitionTimeout = null;
            finalizeCampaign({
                titleText: 'MISSION FAILED',
                finishLabel: `Mission ${failedMissionIndex + 1} failed`,
                finishReason: 'mission-failed',
                totalPickups: campaignPickupPoolTotal,
                totalCollected: Math.max(0, Math.round(Number(getPlayerCollectedCount()) || 0)),
                totalScore: Math.max(0, Math.round(Number(getTotalScore()) || 0)),
                summaryText: messageText,
            });
        }, 150);
    }

    function getCurrentMission() {
        return BOTS_MISSION_DEFINITIONS[missionIndex] || null;
    }

    function getMissionPlayerPickups() {
        return Math.max(
            0,
            Math.round(Number(getPlayerCollectedCount()) || 0) - missionPlayerPickupStart
        );
    }

    function getCurrentMissionProgress(additionalEliminations = 0) {
        const mission = getCurrentMission();
        if (!mission) {
            return 0;
        }
        const eliminationTarget = Math.max(
            0,
            Math.round(Number(mission.eliminationTarget) || 0)
        );
        if (eliminationTarget <= 0) {
            return 0;
        }
        return clamp01(
            (missionEliminatedCount + Math.max(0, additionalEliminations)) /
                Math.max(1, eliminationTarget)
        );
    }

    function isCurrentMissionComplete() {
        const mission = getCurrentMission();
        if (!mission) {
            return false;
        }
        return missionEliminatedCount >= Math.max(0, Math.round(Number(mission.eliminationTarget) || 0));
    }

    function clearPendingTransition() {
        if (transitionTimeout != null) {
            window.clearTimeout(transitionTimeout);
            transitionTimeout = null;
        }
    }
}

function clamp01(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.min(1, Math.max(0, value));
}

function normalizeGameMode(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : 'bots';
}

function normalizeCollectorId(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function resolveEliminationProgressText(mission = null, eliminationCount = 0) {
    const eliminationTarget = Math.max(0, Math.round(Number(mission?.eliminationTarget) || 0));
    const resolvedEliminationCount = Math.max(0, Math.round(Number(eliminationCount) || 0));
    if (eliminationTarget <= 0) {
        return String(resolvedEliminationCount);
    }
    return `${Math.min(resolvedEliminationCount, eliminationTarget)}/${eliminationTarget}`;
}

export { BOTS_MISSION_DEFINITIONS };
