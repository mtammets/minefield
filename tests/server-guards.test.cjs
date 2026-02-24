const test = require('node:test');
const assert = require('node:assert/strict');

const { consumeRateLimit } = require('../server/rate-limit');
const { validateCollisionRelay } = require('../server/collision-guard');
const { resolveAuthoritativeMineDetonation } = require('../server/mine-guard');
const {
    parsePickupId,
    validatePickupCollection,
    markPickupCollected,
} = require('../server/pickup-guard');
const {
    createRoomRoundState,
    applyPlayerPickupScore,
    applyPlayerMineKillScore,
} = require('../server/room-round-state');

test('consumeRateLimit enforces per-window quota', () => {
    const store = new Map();
    const key = 'event:mp:state';

    assert.equal(consumeRateLimit(store, key, 1000, 1000, 2), true);
    assert.equal(consumeRateLimit(store, key, 1200, 1000, 2), true);
    assert.equal(consumeRateLimit(store, key, 1300, 1000, 2), false);
    assert.equal(consumeRateLimit(store, key, 2201, 1000, 2), true);
});

test('applyPlayerPickupScore respects cooldown and finishes round', () => {
    const room = {
        players: new Map([
            [
                'p1',
                {
                    collectedCount: 0,
                    lastPickupAt: 0,
                    pickupWindowStartedAt: 0,
                    pickupWindowCount: 0,
                },
            ],
        ]),
        roundState: createRoomRoundState(2),
    };

    const first = applyPlayerPickupScore({
        room,
        playerId: 'p1',
        nowMs: 1000,
    });
    assert.equal(first.ok, true);
    assert.equal(first.pointsAwarded > 0, true);
    assert.equal(room.players.get('p1').collectedCount, 1);
    assert.equal(room.players.get('p1').score, first.playerScore);
    assert.equal(room.roundState.totalScore, room.players.get('p1').score);
    assert.equal(room.roundState.finished, false);

    const cooldownBlocked = applyPlayerPickupScore({
        room,
        playerId: 'p1',
        nowMs: 1080,
    });
    assert.equal(cooldownBlocked.ok, false);
    assert.equal(cooldownBlocked.reason, 'pickup-cooldown');

    const second = applyPlayerPickupScore({
        room,
        playerId: 'p1',
        nowMs: 1285,
    });
    assert.equal(second.ok, true);
    assert.equal(second.pointsAwarded > 0, true);
    assert.equal(second.playerScore > first.playerScore, true);
    assert.equal(room.players.get('p1').collectedCount, 2);
    assert.equal(room.players.get('p1').score, second.playerScore);
    assert.equal(room.roundState.finished, true);
    assert.equal(room.roundState.totalCollected, 2);
    assert.equal(room.roundState.totalScore, second.playerScore);
});

test('applyPlayerMineKillScore applies chain and anti-farm penalties', () => {
    const room = {
        players: new Map([
            [
                'owner',
                {
                    score: 0,
                    mineKillChainCount: 0,
                    lastMineKillAt: 0,
                    mineKillByTarget: Object.create(null),
                },
            ],
            [
                'target-a',
                {
                    score: 0,
                },
            ],
            [
                'target-b',
                {
                    score: 0,
                },
            ],
        ]),
        roundState: createRoomRoundState(30),
    };

    const first = applyPlayerMineKillScore({
        room,
        ownerPlayerId: 'owner',
        targetPlayerId: 'target-a',
        nowMs: 1000,
    });
    assert.equal(first.ok, true);
    assert.equal(first.pointsAwarded > 0, true);
    assert.equal(first.scoring.chainCount, 1);

    const secondChain = applyPlayerMineKillScore({
        room,
        ownerPlayerId: 'owner',
        targetPlayerId: 'target-b',
        nowMs: 4500,
    });
    assert.equal(secondChain.ok, true);
    assert.equal(secondChain.scoring.chainCount, 2);
    assert.equal(secondChain.pointsAwarded > first.pointsAwarded, true);

    const antiFarm = applyPlayerMineKillScore({
        room,
        ownerPlayerId: 'owner',
        targetPlayerId: 'target-a',
        nowMs: 7000,
    });
    assert.equal(antiFarm.ok, true);
    assert.equal(antiFarm.scoring.repeatedTarget, true);
    assert.equal(antiFarm.pointsAwarded < secondChain.pointsAwarded, true);
});

test('validateCollisionRelay accepts plausible contacts and rejects stale state', () => {
    const now = 10_000;
    const relay = {
        targetId: 'target',
        normalX: 1,
        normalZ: 0,
        impactSpeed: 8,
        penetration: 0.2,
        otherVelocityX: 0,
        otherVelocityZ: 0,
        mass: 1.6,
    };
    const sourceState = { x: 0, z: 0, velocityX: 12, velocityZ: 0 };
    const targetState = { x: 1, z: 0, velocityX: 0, velocityZ: 0 };

    const accepted = validateCollisionRelay({
        relay,
        sourceState,
        sourceStateAt: now - 40,
        targetState,
        targetStateAt: now - 60,
        nowMs: now,
    });
    assert.equal(accepted.ok, true);
    assert.ok(accepted.relay.impactSpeed > 0);

    const stale = validateCollisionRelay({
        relay,
        sourceState,
        sourceStateAt: now - 2500,
        targetState,
        targetStateAt: now - 60,
        nowMs: now,
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.reason, 'state-too-old');
});

test('resolveAuthoritativeMineDetonation validates context and armed status', () => {
    const room = {
        players: new Map([
            ['owner', { lastState: { x: -5, z: 0 } }],
            ['victim', { lastState: { x: 0.4, z: 0.2 } }],
        ]),
    };
    const mine = {
        id: 'mine-1',
        ownerId: 'owner',
        ownerName: 'Owner',
        x: 0,
        y: 0,
        z: 0,
        triggerRadius: 1.5,
        armedAt: 1500,
        expiresAt: 9000,
    };

    const accepted = resolveAuthoritativeMineDetonation({
        room,
        mine,
        reportingPlayerId: 'victim',
        detonation: {
            triggerPlayerId: 'victim',
            targetPlayerId: 'victim',
        },
        nowMs: 3000,
    });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.detonation.targetPlayerId, 'victim');

    const notArmed = resolveAuthoritativeMineDetonation({
        room,
        mine: {
            ...mine,
            armedAt: 5000,
        },
        reportingPlayerId: 'victim',
        detonation: {
            triggerPlayerId: 'victim',
            targetPlayerId: 'victim',
        },
        nowMs: 3000,
    });
    assert.equal(notArmed.ok, false);
    assert.equal(notArmed.reason, 'mine-not-armed');
});

test('resolveAuthoritativeMineDetonation accepts segment intersection against recent state history', () => {
    const room = {
        players: new Map([
            ['owner', { lastState: { x: -5, z: 0 } }],
            [
                'victim',
                {
                    previousState: { x: -0.2, z: 0 },
                    previousStateAt: 2900,
                    lastState: { x: 3.4, z: 0 },
                    lastStateAt: 2960,
                },
            ],
        ]),
    };
    const mine = {
        id: 'mine-2',
        ownerId: 'owner',
        ownerName: 'Owner',
        x: 0,
        y: 0,
        z: 0,
        triggerRadius: 1.5,
        armedAt: 1000,
        expiresAt: 9000,
    };

    const accepted = resolveAuthoritativeMineDetonation({
        room,
        mine,
        reportingPlayerId: 'victim',
        detonation: {
            triggerPlayerId: 'victim',
            targetPlayerId: 'victim',
        },
        nowMs: 3000,
    });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.detonation.targetPlayerId, 'victim');
});

test('parsePickupId validates fixed and grid pickup IDs', () => {
    const validFixed = parsePickupId('pickup:fixed:3', 10);
    assert.equal(validFixed.ok, true);
    assert.equal(validFixed.type, 'fixed');
    assert.equal(validFixed.serial, 3);

    const validCell = parsePickupId('pickup:12:-4', 30);
    assert.equal(validCell.ok, true);
    assert.equal(validCell.type, 'cell');
    assert.equal(validCell.cellX, 12);
    assert.equal(validCell.cellZ, -4);

    const badPrefix = parsePickupId('coin:fixed:3', 10);
    assert.equal(badPrefix.ok, false);

    const outOfRound = parsePickupId('pickup:fixed:30', 30);
    assert.equal(outOfRound.ok, false);
    assert.equal(outOfRound.reason, 'pickup-id-out-of-range');
});

test('validatePickupCollection blocks duplicates and accepts nearby fixed pickup IDs', () => {
    const room = {
        players: new Map([
            [
                'p1',
                {
                    lastState: {
                        x: 100,
                        y: 1.3,
                        z: 200,
                    },
                    lastStateAt: 10_000,
                },
            ],
        ]),
        collectedPickupIds: new Map(),
        roundState: createRoomRoundState(30),
    };

    const first = validatePickupCollection({
        room,
        playerId: 'p1',
        nowMs: 10_120,
        payload: {
            pickupId: 'pickup:fixed:4',
            x: 102.5,
            y: 1.35,
            z: 199.3,
        },
    });
    assert.equal(first.ok, true);
    assert.equal(first.pickupId, 'pickup:fixed:4');

    assert.equal(markPickupCollected(room, first.pickupId, 10_120), true);

    const duplicate = validatePickupCollection({
        room,
        playerId: 'p1',
        nowMs: 10_240,
        payload: {
            pickupId: 'pickup:fixed:4',
            x: 101.9,
            y: 1.32,
            z: 199.8,
        },
    });
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.reason, 'pickup-duplicate');

    const tooFar = validatePickupCollection({
        room,
        playerId: 'p1',
        nowMs: 10_260,
        payload: {
            pickupId: 'pickup:fixed:5',
            x: 120,
            y: 1.35,
            z: 200,
        },
    });
    assert.equal(tooFar.ok, false);
    assert.equal(tooFar.reason, 'pickup-too-far');
});
