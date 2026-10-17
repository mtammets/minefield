const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildLeaderboardRecord,
    normalizeLeaderboardEntry,
    sanitizeLeaderboardLimit,
    sanitizeLeaderboardWindowRadius,
    sanitizeRoundResultPayload,
} = require('../server/leaderboard-store');

test('sanitizeRoundResultPayload keeps valid leaderboard rows', () => {
    const payload = sanitizeRoundResultPayload({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        playerName: 'Driver One',
        avatarPath: '123e4567-e89b-12d3-a456-426614174000/profile.webp',
        score: 8420,
        collectedCount: 12,
        totalPickups: 30,
        totalScore: 19240,
        gameMode: 'online',
        finishReason: 'pickups-exhausted',
        winnerLabel: 'Driver One',
        didWin: false,
        vehicleId: '',
        carSkinId: 'midnight-comet',
    });

    assert.deepEqual(payload, {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        playerName: 'Driver One',
        avatarPath: '123e4567-e89b-12d3-a456-426614174000/profile.webp',
        score: 8420,
        collectedCount: 12,
        totalPickups: 30,
        totalScore: 19240,
        gameMode: 'online',
        finishReason: 'pickups-exhausted',
        winnerLabel: 'Driver One',
        didWin: false,
        vehicleId: '',
        carSkinId: 'midnight-comet',
    });
});

test('sanitizeRoundResultPayload rejects blank names and zero scores', () => {
    assert.equal(
        sanitizeRoundResultPayload({
            userId: '',
            playerName: '',
            score: 0,
            gameMode: 'bots',
        }),
        null
    );
});

test('buildLeaderboardRecord maps to database columns', () => {
    const record = buildLeaderboardRecord({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        playerName: 'Driver',
        avatarPath: '123e4567-e89b-12d3-a456-426614174000/profile.webp',
        score: 1100,
        collectedCount: 4,
        totalPickups: 30,
        totalScore: 4400,
        gameMode: 'bots',
        finishReason: 'opponents-eliminated',
        winnerLabel: 'Driver',
        didWin: true,
        carSkinId: 'midnight-comet',
    });

    assert.equal(typeof record.id, 'string');
    assert.equal(record.user_id, '123e4567-e89b-12d3-a456-426614174000');
    assert.equal(record.player_name, 'Driver');
    assert.equal(record.avatar_path, '123e4567-e89b-12d3-a456-426614174000/profile.webp');
    assert.equal(record.score, 1100);
    assert.equal(record.game_mode, 'bots');
    assert.equal(record.did_win, true);
});

test('normalizeLeaderboardEntry converts public rows to browser shape', () => {
    const entry = normalizeLeaderboardEntry({
        id: 'row-1',
        player_name: 'Driver',
        avatar_path: '123e4567-e89b-12d3-a456-426614174000/profile.webp',
        score: 5000,
        collected_count: 8,
        total_pickups: 30,
        total_score: 9000,
        game_mode: 'online',
        finish_reason: 'pickups-exhausted',
        winner_label: 'Driver',
        car_skin_id: 'midnight-comet',
        created_at: '2026-05-10T10:00:00.000Z',
    });

    assert.deepEqual(entry, {
        id: 'row-1',
        userId: '',
        playerName: 'Driver',
        avatarPath: '123e4567-e89b-12d3-a456-426614174000/profile.webp',
        score: 5000,
        collectedCount: 8,
        totalPickups: 30,
        totalScore: 9000,
        gameMode: 'online',
        finishReason: 'pickups-exhausted',
        winnerLabel: 'Driver',
        vehicleId: '',
        carSkinId: 'midnight-comet',
        createdAt: '2026-05-10T10:00:00.000Z',
    });
});

test('normalizeLeaderboardEntry preserves postgres Date timestamps', () => {
    const entry = normalizeLeaderboardEntry({
        id: 'row-2',
        user_id: '123e4567-e89b-12d3-a456-426614174000',
        player_name: 'Driver',
        score: 4200,
        created_at: new Date('2026-05-10T12:34:56.000Z'),
    });

    assert.equal(entry.createdAt, '2026-05-10T12:34:56.000Z');
});

test('sanitizeRoundResultPayload drops invalid avatar paths', () => {
    const payload = sanitizeRoundResultPayload({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        playerName: 'Driver One',
        avatarPath: '../bad-path.webp',
        score: 8420,
        collectedCount: 12,
        totalPickups: 30,
        totalScore: 19240,
        gameMode: 'online',
    });

    assert.equal(payload?.avatarPath, '');
});

test('sanitizeLeaderboardLimit clamps query sizes', () => {
    assert.equal(sanitizeLeaderboardLimit(0, 10), 10);
    assert.equal(sanitizeLeaderboardLimit(99, 10), 20);
    assert.equal(sanitizeLeaderboardLimit(5, 10), 5);
});

test('sanitizeLeaderboardWindowRadius clamps viewer context sizes', () => {
    assert.equal(sanitizeLeaderboardWindowRadius(0, 2), 2);
    assert.equal(sanitizeLeaderboardWindowRadius(8, 2), 4);
    assert.equal(sanitizeLeaderboardWindowRadius(3, 2), 3);
});
