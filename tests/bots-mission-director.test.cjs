const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const botsMissionDirectorModulePromise = import(
    pathToFileURL(path.join(__dirname, '..', 'public/js/bots-mission-director.js')).href
);

function createWindowStub() {
    let timeoutId = 0;
    const scheduledTimeouts = new Map();

    return {
        scheduledTimeouts,
        window: {
            setTimeout(callback, delayMs = 0) {
                timeoutId += 1;
                scheduledTimeouts.set(timeoutId, {
                    callback,
                    delayMs: Math.max(0, Math.round(Number(delayMs) || 0)),
                });
                return timeoutId;
            },
            clearTimeout(id) {
                scheduledTimeouts.delete(id);
            },
        },
    };
}

async function createHarness() {
    const { createBotsMissionDirector } = await botsMissionDirectorModulePromise;
    let playerCollectedCount = 0;
    let finalizeCampaignCalls = 0;
    let showResultCalls = 0;
    const reinforcementCalls = [];
    const missionStates = [];
    const infoMessages = [];
    const failureMessages = [];

    const director = createBotsMissionDirector({
        objectiveUi: {
            setMissionState(state) {
                missionStates.push(state);
            },
            showInfo(messageText) {
                infoMessages.push(String(messageText || ''));
            },
            showResult() {
                showResultCalls += 1;
            },
            showFailure(messageText) {
                failureMessages.push(String(messageText || ''));
            },
        },
        getGameMode: () => 'bots',
        prepareMission() {},
        scheduleMissionReinforcement(payload = null) {
            reinforcementCalls.push(payload);
            return true;
        },
        setMissionTransitionLocked() {},
        startMissionCountdown() {},
        finalizeCampaign() {
            finalizeCampaignCalls += 1;
        },
        getPlayerCollectedCount: () => playerCollectedCount,
        getTotalScore: () => 0,
    });

    return {
        director,
        missionStates,
        infoMessages,
        failureMessages,
        getFinalizeCampaignCalls: () => finalizeCampaignCalls,
        reinforcementCalls,
        getShowResultCalls: () => showResultCalls,
        setPlayerCollectedCount(value) {
            playerCollectedCount = Math.max(0, Math.round(Number(value) || 0));
        },
    };
}

test('bots missions ignore pickups for progress and completion', async () => {
    const previousWindow = global.window;
    const { window } = createWindowStub();
    global.window = window;

    try {
        const harness = await createHarness();
        const started = harness.director.startCampaign({ shouldStartCountdown: false });
        assert.equal(started, true);
        assert.equal(harness.missionStates.at(-1)?.pickupRequired, false);
        assert.equal(harness.missionStates.at(-1)?.pickupTarget, 0);
        assert.equal(harness.missionStates.at(-1)?.eliminationTarget, 4);
        assert.equal(harness.director.getScoreProgress({ additionalPlayerPickups: 8 }), 0);
        assert.equal(harness.director.getScoreProgress({ additionalEliminations: 1 }), 0.25);

        harness.setPlayerCollectedCount(3);
        const collected = harness.director.handlePickupCollected({ collectorId: 'player' });
        assert.equal(collected, false);
        assert.equal(harness.getFinalizeCampaignCalls(), 0);
        assert.equal(harness.director.getScoreProgress(), 0);
    } finally {
        global.window = previousWindow;
    }
});

test('pickup exhaustion no longer fails an active bots mission', async () => {
    const previousWindow = global.window;
    const { window } = createWindowStub();
    global.window = window;

    try {
        const harness = await createHarness();
        harness.director.startCampaign({ shouldStartCountdown: false });

        const exhausted = harness.director.handlePickupsExhausted();
        assert.equal(exhausted, false);
        assert.equal(harness.getFinalizeCampaignCalls(), 0);
        assert.equal(harness.failureMessages.length, 0);
        assert.match(harness.infoMessages.at(-1), /pickup bonus exhausted/i);
    } finally {
        global.window = previousWindow;
    }
});

test('bots campaign caps active bot pool to two simultaneous hunters', async () => {
    const { BOTS_MISSION_DEFINITIONS, getBotsMissionMaxBotCount } =
        await botsMissionDirectorModulePromise;

    assert.equal(getBotsMissionMaxBotCount(), 2);
    assert.equal(
        BOTS_MISSION_DEFINITIONS.every((mission) => mission.botCount <= 2),
        true
    );
    assert.equal(
        BOTS_MISSION_DEFINITIONS.every(
            (mission) => mission.eliminationTarget >= mission.botCount
        ),
        true
    );
});

test('mission completion requires total eliminations and schedules reinforcements', async () => {
    const previousWindow = global.window;
    const { window, scheduledTimeouts } = createWindowStub();
    global.window = window;

    try {
        const harness = await createHarness();
        harness.director.startCampaign({ shouldStartCountdown: false });

        const firstKill = harness.director.handleBotDestroyed({
            collectorId: 'bot-1',
        });
        assert.equal(firstKill, false);
        assert.equal(harness.reinforcementCalls.length, 1);
        assert.equal(harness.reinforcementCalls[0]?.collectorId, 'bot-1');
        assert.equal(harness.reinforcementCalls[0]?.delayMs, 1200);
        assert.equal(harness.director.handleBotDestroyed({ collectorId: 'bot-2' }), false);
        assert.equal(harness.reinforcementCalls.length, 2);
        assert.equal(harness.reinforcementCalls[1]?.collectorId, 'bot-2');
        assert.equal(harness.reinforcementCalls[1]?.delayMs, 1200);
        assert.equal(harness.director.handleBotDestroyed({ collectorId: 'bot-1' }), false);
        assert.equal(harness.reinforcementCalls.length, 2);
        const completed = harness.director.handleBotDestroyed({ collectorId: 'bot-2' });
        assert.equal(completed, true);
        assert.equal(harness.getShowResultCalls(), 1);
        assert.equal(harness.getFinalizeCampaignCalls(), 0);
        assert.equal(scheduledTimeouts.size, 1);
    } finally {
        global.window = previousWindow;
    }
});
