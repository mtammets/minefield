const test = require('node:test');
const assert = require('node:assert/strict');

const { consumeRateLimit } = require('../server/rate-limit');
const { validateCollisionRelay } = require('../server/collision-guard');
const { resolveAuthoritativeMineDetonation } = require('../server/mine-guard');
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
