const test = require('node:test');
const assert = require('node:assert/strict');

const {
    isSocketCorsOriginAllowed,
    isSocketOriginAllowed,
    parseAllowedOriginList,
    resolveSocketRequestHost,
} = require('../server/socket-origin');

test('parseAllowedOriginList normalizes valid origins and skips invalid values', () => {
    const origins = parseAllowedOriginList(
        ' https://www.minefield.games/ , invalid-value, http://localhost:3000 '
    );

    assert.deepEqual(origins, ['https://www.minefield.games', 'http://localhost:3000']);
});

test('socket CORS origin check allows valid public origins when no explicit allowlist is set', () => {
    assert.equal(
        isSocketCorsOriginAllowed('https://www.minefield.games', {
            allowedOrigins: [],
        }),
        true
    );
    assert.equal(
        isSocketCorsOriginAllowed('chrome-extension://abc123', {
            allowedOrigins: [],
        }),
        false
    );
});

test('socket request host prefers x-forwarded-host and falls back to host', () => {
    const forwarded = resolveSocketRequestHost({
        headers: {
            'x-forwarded-host': 'www.minefield.games, edge-proxy.internal',
            host: 'internal-service:3000',
        },
    });
    assert.equal(forwarded, 'www.minefield.games');

    const direct = resolveSocketRequestHost({
        headers: {
            host: 'localhost:3000',
        },
    });
    assert.equal(direct, 'localhost:3000');
});

test('socket origin check allows same-host public requests without an explicit allowlist', () => {
    assert.equal(
        isSocketOriginAllowed('https://www.minefield.games', {
            allowedOrigins: [],
            requestHost: 'www.minefield.games',
        }),
        true
    );
});

test('socket origin check rejects unrelated public origins by default', () => {
    assert.equal(
        isSocketOriginAllowed('https://attacker.example', {
            allowedOrigins: [],
            requestHost: 'www.minefield.games',
        }),
        false
    );
});

test('socket origin check treats explicit allowlist as authoritative', () => {
    assert.equal(
        isSocketOriginAllowed('https://www.minefield.games', {
            allowedOrigins: ['https://app.minefield.games'],
            requestHost: 'www.minefield.games',
        }),
        false
    );
    assert.equal(
        isSocketOriginAllowed('https://app.minefield.games', {
            allowedOrigins: ['https://app.minefield.games'],
            requestHost: 'www.minefield.games',
        }),
        true
    );
});
