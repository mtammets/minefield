const BOTS_MISSION_DEFINITIONS = Object.freeze([
    Object.freeze({
        id: 'street-sweep',
        title: 'Street Sweep',
        brief: 'Map the district, keep the first hunter off your line, and build momentum before reinforcements arrive.',
        botCount: 1,
        pickupTarget: 8,
        eliminationTarget: 0,
        pickupPool: 12,
        maxActivePickups: 4,
    }),
    Object.freeze({
        id: 'cut-the-feed',
        title: 'Cut The Feed',
        brief: 'Two rival rigs flood the avenue. Secure the shard route and permanently disable one of them.',
        botCount: 2,
        pickupTarget: 10,
        eliminationTarget: 1,
        pickupPool: 16,
        maxActivePickups: 5,
    }),
    Object.freeze({
        id: 'break-the-blockade',
        title: 'Break The Blockade',
        brief: 'The convoy thickens. Stay on the objective line while removing the enforcers one by one.',
        botCount: 3,
        pickupTarget: 12,
        eliminationTarget: 2,
        pickupPool: 20,
        maxActivePickups: 5,
    }),
    Object.freeze({
        id: 'night-harvest',
        title: 'Night Harvest',
        brief: 'Four bots now own the sector. Keep the route alive and thin the pack before the city dries up.',
        botCount: 4,
        pickupTarget: 14,
        eliminationTarget: 3,
        pickupPool: 24,
        maxActivePickups: 6,
    }),
    Object.freeze({
        id: 'final-sweep',
        title: 'Final Sweep',
        brief: 'Full deployment. Five hunters, one contract, no safe lane. Clear the entire squad and close the run.',
        botCount: 5,
        pickupTarget: 16,
        eliminationTarget: 5,
        pickupPool: 30,
        maxActivePickups: 6,
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
    setMissionTransitionLocked = () => {},
    startMissionCountdown = () => {},
    finalizeCampaign = () => {},
    getPlayerCollectedCount = () => 0,
    getPlayerScore = () => 0,
    getTotalScore = () => 0,
} = {}) {
    const totalMissions = BOTS_MISSION_DEFINITIONS.length;
    const campaignPickupObjectiveTotal = BOTS_MISSION_DEFINITIONS.reduce(
        (sum, mission) => sum + Math.max(0, Math.round(Number(mission.pickupTarget) || 0)),
        0
    );
    let campaignActive = false;
    let missionResolved = false;
    let missionIndex = -1;
    let missionPlayerPickupStart = 0;
    let transitionTimeout = null;
    let missionEliminatedCollectorIds = new Set();

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
            missionEliminatedCollectorIds = new Set();
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
                refreshHud();
                return false;
            }
            refreshHud();
            if (isCurrentMissionComplete()) {
                queueMissionSuccess();
                return true;
            }
            return false;
        },
        handleBotDestroyed(botEvent = null) {
            if (!campaignActive || missionResolved || normalizeGameMode(getGameMode()) !== 'bots') {
                return false;
            }
            const collectorId = normalizeCollectorId(botEvent?.collectorId);
            const livesRemaining = Math.max(0, Math.round(Number(botEvent?.livesRemaining) || 0));
            if (!collectorId || livesRemaining > 0 || missionEliminatedCollectorIds.has(collectorId)) {
                return false;
            }
            missionEliminatedCollectorIds.add(collectorId);
            refreshHud();
            const mission = getCurrentMission();
            if (mission?.eliminationTarget > 0) {
                objectiveUi?.showInfo?.(
                    `${resolveEliminationProgressText(mission, missionEliminatedCollectorIds.size)} secured.`,
                    1200
                );
            }
            if (isCurrentMissionComplete()) {
                queueMissionSuccess();
                return true;
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
            const mission = getCurrentMission();
            if (!mission) {
                return false;
            }
            queueCampaignFailure(
                `Mission ${missionIndex + 1} failed: the pickup route went dry before the quota was cleared.`
            );
            return true;
        },
        handlePlayerOutOfCars() {
            if (!campaignActive || missionResolved || normalizeGameMode(getGameMode()) !== 'bots') {
                return false;
            }
            const mission = getCurrentMission();
            if (!mission) {
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
            const additionalPlayerPickups = Math.max(
                0,
                Math.round(Number(options?.additionalPlayerPickups) || 0)
            );
            const additionalEliminations = Math.max(
                0,
                Math.round(Number(options?.additionalEliminations) || 0)
            );
            return getCurrentMissionProgress(additionalPlayerPickups, additionalEliminations);
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
            missionEliminatedCollectorIds = new Set();
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
        missionEliminatedCollectorIds = new Set();
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
        const playerPickups = getMissionPlayerPickups();
        const eliminations = missionEliminatedCollectorIds.size;
        const progress = getCurrentMissionProgress();
        objectiveUi?.setMissionState?.({
            missionNumber: missionIndex + 1,
            totalMissions,
            title: mission.title,
            pickupCurrent: playerPickups,
            pickupTarget: mission.pickupTarget,
            botCount: mission.botCount,
            eliminationCurrent: eliminations,
            eliminationTarget: mission.eliminationTarget,
            progressValue: progress,
        });
    }

    function queueMissionSuccess() {
        if (missionResolved) {
            return;
        }
        const mission = getCurrentMission();
        if (!mission) {
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
                totalPickups: campaignPickupObjectiveTotal,
                totalCollected: Math.max(0, Math.round(Number(getPlayerCollectedCount()) || 0)),
                totalScore: Math.max(0, Math.round(Number(getTotalScore()) || 0)),
                summaryText:
                    'All contracts cleared. Rival waves escalated and the whole sector was swept clean.',
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
                totalPickups: campaignPickupObjectiveTotal,
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

    function getCurrentMissionProgress(additionalPlayerPickups = 0, additionalEliminations = 0) {
        const mission = getCurrentMission();
        if (!mission) {
            return 0;
        }
        const progressValues = [];
        const playerPickups = getMissionPlayerPickups() + Math.max(0, additionalPlayerPickups);
        const eliminationCount =
            missionEliminatedCollectorIds.size + Math.max(0, additionalEliminations);
        if (mission.pickupTarget > 0) {
            progressValues.push(clamp01(playerPickups / Math.max(1, mission.pickupTarget)));
        }
        if (mission.eliminationTarget > 0) {
            progressValues.push(clamp01(eliminationCount / Math.max(1, mission.eliminationTarget)));
        }
        if (progressValues.length === 0) {
            return 0;
        }
        const total = progressValues.reduce((sum, value) => sum + value, 0);
        return clamp01(total / progressValues.length);
    }

    function isCurrentMissionComplete() {
        const mission = getCurrentMission();
        if (!mission) {
            return false;
        }
        const pickupsMet =
            mission.pickupTarget <= 0 || getMissionPlayerPickups() >= mission.pickupTarget;
        const eliminationsMet =
            mission.eliminationTarget <= 0 ||
            missionEliminatedCollectorIds.size >= mission.eliminationTarget;
        return pickupsMet && eliminationsMet;
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

export { BOTS_MISSION_DEFINITIONS };
