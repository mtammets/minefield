require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const http = require('http');
const os = require('os');
const path = require('path');
const Stripe = require('stripe');
const { Server } = require('socket.io');
const { createBillboardContentStore } = require('./billboard-content-store');
const {
    createLeaderboardStore,
    ensureLeaderboardSchema,
    sanitizeLeaderboardLimit,
} = require('./leaderboard-store');
const { consumeRateLimit } = require('./rate-limit');
const { validateCollisionRelay } = require('./collision-guard');
const {
    buildSupabasePublicConfig,
    createSupabaseServiceClient,
    resolveSupabaseConnectOrigin,
    resolveSupabaseRuntimeConfig,
} = require('./supabase-config');
const {
    isSocketCorsOriginAllowed,
    isSocketOriginAllowed,
    parseAllowedOriginList,
    resolveSocketRequestHost,
    sanitizeHttpHostHeader,
    sanitizeHttpOrigin,
} = require('./socket-origin');
const { resolveAuthoritativeMineDetonation } = require('./mine-guard');
const {
    DONATION_SESSION_STATUSES,
    createDonationSessionStore,
    isDonationSessionStatusFinal,
    normalizeStripeCheckoutSessionId,
} = require('./donate-session-store');
const {
    validatePickupCollection,
    markPickupCollected,
    pruneCollectedPickupHistory,
} = require('./pickup-guard');
const {
    ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT,
    createRoomRoundState,
    applyPlayerPickupScore,
    applyPlayerMineKillScore,
    recalculateRoomRoundStateFromPlayers,
    serializeRoomRoundState,
} = require('./room-round-state');

const PORT = process.env.PORT || 3000;
const ROOM_CODE_LENGTH = 6;
const MAX_PLAYERS_PER_ROOM = 8;
const MAX_ACTIVE_ROOMS = 500;
const PLAYER_NAME_MAX_LENGTH = 18;
const PLAYER_SKIN_ID_MAX_LENGTH = 32;
const DEFAULT_PLAYER_SKIN_ID = 'midnight-comet';
const STATE_UPDATE_MIN_INTERVAL_MS = 35;
const COLLISION_RELAY_MIN_INTERVAL_MS = 60;
const MAX_DETACHED_PART_IDS = 32;
const MAX_DEBRIS_PIECES = 64;
const MAX_ACTIVE_MINES_PER_ROOM = 220;
const MAX_ACTIVE_MINES_PER_PLAYER = 10;
const MINE_ID_MAX_LENGTH = 72;
const MINE_DEFAULT_TRIGGER_RADIUS = 1.5;
const MINE_DEFAULT_ARM_DELAY_MS = 650;
const MINE_DEFAULT_TTL_MS = 45_000;
const MINE_SERVER_PLACE_COOLDOWN_MS = 450;
const CRASH_REPLICATION_MIN_INTERVAL_MS = 180;
const VEHICLE_STATUS_MIN_INTERVAL_MS = 140;
const ENVIRONMENT_STATE_MIN_INTERVAL_MS = 45;
const WEAPON_SHOT_MAX_DISTANCE = 260;
const WEAPON_SHOT_MIN_DISTANCE = 0.5;
const WEAPON_SHOT_MAX_START_HORIZONTAL_OFFSET = 8;
const WEAPON_SHOT_MAX_START_VERTICAL_OFFSET = 6;
const WEAPON_PICKUP_RESPAWN_DELAY_MS = 900;
const ROOM_ROOF_LIFT_DEFAULT_SURFACE_Y = 0.16;
const PICKUP_STATE_MAX_DISTANCE = 4.6;
const PLAYER_STATE_MAX_HORIZONTAL_SPEED_UNITS_PER_SEC = 82;
const PLAYER_STATE_MAX_VERTICAL_SPEED_UNITS_PER_SEC = 145;
const PLAYER_STATE_HORIZONTAL_LEEWAY = 2.4;
const PLAYER_STATE_VERTICAL_LEEWAY = 3.5;
const PLAYER_STATE_MAX_INTERVAL_MS = 1400;
const PLAYER_RESPAWN_SNAP_MIN_DESTROYED_MS = 1300;
const PLAYER_RESPAWN_SNAP_WINDOW_MS = 1800;
const PLAYER_RESPAWN_MAX_SNAP_DISTANCE = 320;
const MINE_ID_RANDOM_BYTES = 4;

const GLOBAL_RATE_WINDOW_MS = 1000;
const GLOBAL_RATE_MAX_EVENTS = 150;
const IP_RATE_WINDOW_MS = 1000;
const IP_RATE_MAX_EVENTS = 300;
const IP_RATE_RULE_MULTIPLIER = 1.7;
const IP_RATE_STORE_TTL_MS = 10 * 60 * 1000;
const IP_RATE_STORE_PRUNE_INTERVAL_MS = 30_000;
const DONATE_MIN_AMOUNT_CENTS = 100;
const DONATE_MAX_AMOUNT_CENTS = 100_000;
const DONATE_AMOUNT_STEP_CENTS = 100;
const DONATE_CURRENCY = sanitizeCurrencyCode(process.env.STRIPE_DONATE_CURRENCY || 'eur', 'eur');
const DONATE_PRODUCT_NAME = sanitizeCheckoutText(
    process.env.STRIPE_DONATE_PRODUCT_NAME || 'Support Minefield Drift'
);
const DONATE_PUBLIC_BASE_URL = sanitizeHttpOrigin(process.env.STRIPE_DONATE_BASE_URL || '');
const STRIPE_SECRET_KEY = sanitizeStripeSecretKey(process.env.STRIPE_SECRET_KEY || '');
const STRIPE_WEBHOOK_SECRET = sanitizeStripeWebhookSecret(process.env.STRIPE_WEBHOOK_SECRET || '');
const stripeClient = createStripeClient(STRIPE_SECRET_KEY);
const donateSessionStore = createDonationSessionStore();
const BILLBOARD_CONTENT_ADMIN_TOKEN = sanitizeAdminToken(
    process.env.BILLBOARD_CONTENT_ADMIN_TOKEN || ''
);
const GA_MEASUREMENT_ID = sanitizeGaMeasurementId(
    process.env.GA_MEASUREMENT_ID || process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID || ''
);
const supabaseRuntimeConfig = resolveSupabaseRuntimeConfig(process.env);
const supabaseServiceClient = createSupabaseServiceClient(supabaseRuntimeConfig);
const leaderboardStore = createLeaderboardStore(supabaseRuntimeConfig);
const SUPABASE_PUBLIC_CONFIG = buildSupabasePublicConfig(supabaseRuntimeConfig, {
    leaderboardEnabled: leaderboardStore.isConfigured(),
});
const SUPABASE_CONNECT_ORIGIN = resolveSupabaseConnectOrigin(supabaseRuntimeConfig.url);

const SOCKET_ALLOWED_ORIGINS = parseAllowedOriginList(
    process.env.SOCKET_ALLOWED_ORIGINS || process.env.CORS_ALLOWED_ORIGINS || ''
);
const HTTP_CONNECT_SRC_VALUES = [
    "'self'",
    'ws:',
    'wss:',
    'https://www.google-analytics.com',
    'https://region1.google-analytics.com',
    'https://stats.g.doubleclick.net',
];
if (SUPABASE_CONNECT_ORIGIN) {
    HTTP_CONNECT_SRC_VALUES.push(SUPABASE_CONNECT_ORIGIN);
}
const HTTP_CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.google-analytics.com https://stats.g.doubleclick.net",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${Array.from(new Set(HTTP_CONNECT_SRC_VALUES)).join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
].join('; ');
const HTTP_PERMISSIONS_POLICY = [
    'accelerometer=()',
    'camera=()',
    'geolocation=()',
    'gyroscope=()',
    'magnetometer=()',
    'microphone=()',
    'payment=()',
    'usb=()',
].join(', ');
const HTTP_STRICT_TRANSPORT_SECURITY = 'max-age=31536000; includeSubDomains';
const HTTP_LEADERBOARD_READ_WINDOW_MS = 10_000;
const HTTP_LEADERBOARD_READ_MAX = 60;
const HTTP_LEADERBOARD_SUBMIT_WINDOW_MS = 60_000;
const HTTP_LEADERBOARD_SUBMIT_MAX = 12;
const ONLINE_AUTH_REQUIRED_ERROR = 'Sign in is required for online rooms.';
const ONLINE_AUTH_SERVER_ERROR = 'Online auth is not configured on this server.';

const EVENT_RATE_LIMITS = {
    'mp:createRoom': { windowMs: 10_000, max: 8 },
    'mp:joinRoom': { windowMs: 10_000, max: 10 },
    'mp:leaveRoom': { windowMs: 5_000, max: 10 },
    'mp:updateProfile': { windowMs: 10_000, max: 25 },
    'mp:state': { windowMs: 1000, max: 40 },
    'mp:collision': { windowMs: 1000, max: 18 },
    'mp:minePlaced': { windowMs: 1000, max: 8 },
    'mp:mineDetonated': { windowMs: 1000, max: 12 },
    'mp:pickupCollected': { windowMs: 1000, max: 10 },
    'mp:weaponPickupCollected': { windowMs: 1000, max: 10 },
    'mp:environmentState': { windowMs: 1000, max: 24 },
    'mp:crashReplication': { windowMs: 1000, max: 8 },
    'mp:vehicleStatus': { windowMs: 1000, max: 12 },
    'mp:weaponShot': { windowMs: 1000, max: 24 },
};

const app = express();
const server = http.createServer(app);
const billboardContentStore = createBillboardContentStore({
    manifestFilePath: path.join(__dirname, 'data/billboard-content.json'),
    uploadsDirectoryPath: path.join(__dirname, '../public/uploads/billboards'),
});
const io = new Server(server, {
    cors: {
        origin: resolveSocketCorsOrigin,
        methods: ['GET', 'POST'],
    },
    allowRequest: resolveSocketAllowRequest,
});

const rooms = new Map();
const ipRateLimitStore = new Map();
let lastIpRateStorePruneAt = 0;

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', HTTP_PERMISSIONS_POLICY);
    res.setHeader('Strict-Transport-Security', HTTP_STRICT_TRANSPORT_SECURITY);
    res.setHeader('Content-Security-Policy', HTTP_CONTENT_SECURITY_POLICY);
    next();
});
app.post('/api/donate/stripe-webhook', express.raw({ type: 'application/json' }), (req, res) => {
    handleStripeDonateWebhook(req, res);
});
app.get('/api/billboard-content', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const manifest = await billboardContentStore.readManifest();
        res.json({
            ok: true,
            manifest,
        });
    } catch (error) {
        console.error('Billboard content manifest read failed:', error);
        res.status(500).json({
            ok: false,
            error: 'Could not read billboard content manifest.',
        });
    }
});
app.post('/api/billboard-content/:groupId', express.json({ limit: '512mb' }), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!isBillboardContentAdminAuthorized(req)) {
        res.status(403).json({
            ok: false,
            error: 'Billboard content admin access denied.',
        });
        return;
    }

    try {
        const result = await billboardContentStore.writeGroupMedia(req.params?.groupId, req.body);
        res.json({
            ok: true,
            manifest: result.manifest,
            group: result.group,
        });
    } catch (error) {
        const statusCode = resolveHttpStatusCode(error?.statusCode);
        if (statusCode >= 500) {
            console.error('Billboard content upload failed:', error);
        }
        res.status(statusCode).json({
            ok: false,
            error: error?.message || 'Billboard content upload failed.',
        });
    }
});
app.delete('/api/billboard-content/:groupId', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!isBillboardContentAdminAuthorized(req)) {
        res.status(403).json({
            ok: false,
            error: 'Billboard content admin access denied.',
        });
        return;
    }

    try {
        const result = await billboardContentStore.resetGroup(req.params?.groupId);
        res.json({
            ok: true,
            removed: Boolean(result.removed),
            manifest: result.manifest,
        });
    } catch (error) {
        const statusCode = resolveHttpStatusCode(error?.statusCode);
        if (statusCode >= 500) {
            console.error('Billboard content reset failed:', error);
        }
        res.status(statusCode).json({
            ok: false,
            error: error?.message || 'Billboard content reset failed.',
        });
    }
});
app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/ping', (req, res) => {
    res.json({
        message: 'Server is running!',
        rooms: rooms.size,
    });
});

app.get('/api/public-config', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
        ok: true,
        analytics: {
            gaMeasurementId: GA_MEASUREMENT_ID || null,
        },
        supabase: SUPABASE_PUBLIC_CONFIG,
    });
});

app.delete('/api/auth/account', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!supabaseServiceClient) {
        res.status(503).json({
            ok: false,
            error: 'Account deletion is not configured on this server.',
        });
        return;
    }

    try {
        const authIdentity = await resolveAuthenticatedRequestIdentity(req);
        if (!authIdentity?.userId) {
            res.status(401).json({
                ok: false,
                error: 'Sign in before deleting the account.',
            });
            return;
        }

        const { error } = await supabaseServiceClient.auth.admin.deleteUser(authIdentity.userId);
        if (error) {
            throw error;
        }

        let deletedLeaderboardEntries = 0;
        if (leaderboardStore.isConfigured()) {
            try {
                const cleanupResult = await leaderboardStore.deleteEntriesByUserId(
                    authIdentity.userId
                );
                deletedLeaderboardEntries = Math.max(
                    0,
                    Math.round(Number(cleanupResult?.deletedCount) || 0)
                );
            } catch (cleanupError) {
                console.warn('Leaderboard cleanup after account deletion failed:', cleanupError);
            }
        }

        res.json({
            ok: true,
            deletedLeaderboardEntries,
        });
    } catch (error) {
        console.error('Supabase account deletion failed:', error);
        res.status(502).json({
            ok: false,
            error: 'Could not delete account right now.',
        });
    }
});

app.get('/api/leaderboard/global', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!leaderboardStore.isConfigured()) {
        res.status(503).json({
            ok: false,
            error: 'Supabase leaderboard is not configured on this server.',
        });
        return;
    }
    if (
        !consumeHttpRequestQuota(
            req,
            'leaderboard-read',
            HTTP_LEADERBOARD_READ_WINDOW_MS,
            HTTP_LEADERBOARD_READ_MAX
        )
    ) {
        res.status(429).json({
            ok: false,
            error: 'Too many leaderboard requests. Try again shortly.',
        });
        return;
    }

    try {
        const authIdentity = await resolveAuthenticatedRequestIdentity(req);
        const leaderboardView = await leaderboardStore.readLeaderboardView({
            topLimit: sanitizeLeaderboardLimit(req.query?.limit, 5),
            viewerWindowRadius: sanitizeLeaderboardLimit(req.query?.window, 2),
            viewerUserId: authIdentity?.userId || '',
        });
        res.json({
            ok: true,
            ...leaderboardView,
        });
    } catch (error) {
        console.error('Supabase leaderboard read failed:', error);
        res.status(502).json({
            ok: false,
            error: 'Could not load leaderboard.',
        });
    }
});

app.post('/api/leaderboard/round-result', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!leaderboardStore.isConfigured()) {
        res.status(503).json({
            ok: false,
            error: 'Supabase leaderboard is not configured on this server.',
        });
        return;
    }
    if (
        !consumeHttpRequestQuota(
            req,
            'leaderboard-submit',
            HTTP_LEADERBOARD_SUBMIT_WINDOW_MS,
            HTTP_LEADERBOARD_SUBMIT_MAX
        )
    ) {
        res.status(429).json({
            ok: false,
            error: 'Too many score submissions. Try again later.',
        });
        return;
    }

    try {
        const authIdentity = await resolveAuthenticatedRequestIdentity(req);
        if (!authIdentity?.userId) {
            res.status(401).json({
                ok: false,
                error: 'Sign in to sync scores to the global leaderboard.',
            });
            return;
        }
        const result = await leaderboardStore.submitRoundResult({
            ...req.body,
            userId: authIdentity.userId,
        });
        if (!result?.ok) {
            res.status(400).json({
                ok: false,
                error: 'A valid round result is required.',
            });
            return;
        }
        res.status(201).json({
            ok: true,
            entry: result.entry,
        });
    } catch (error) {
        console.error('Supabase leaderboard write failed:', error);
        res.status(502).json({
            ok: false,
            error: 'Could not save round result.',
        });
    }
});

app.get('/api/room-code/:roomCode/availability', (req, res) => {
    const roomCode = sanitizeRoomCode(req.params?.roomCode);
    if (!roomCode) {
        res.status(400).json({
            ok: false,
            error: `Room code must be ${ROOM_CODE_LENGTH} letters or numbers.`,
        });
        return;
    }

    res.json({
        ok: true,
        roomCode,
        available: !rooms.has(roomCode),
    });
});

app.post('/api/donate/checkout-session', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!stripeClient) {
        res.status(503).json({
            ok: false,
            error: 'Donations are not configured on this server.',
        });
        return;
    }

    const amountCents = sanitizeDonationAmountCents(req.body?.amountCents);
    if (!Number.isFinite(amountCents)) {
        res.status(400).json({
            ok: false,
            error: `Amount must be between ${DONATE_MIN_AMOUNT_CENTS / 100} and ${DONATE_MAX_AMOUNT_CENTS / 100}.`,
        });
        return;
    }

    const checkoutBaseUrl = resolveDonateBaseUrl(req);
    const successUrl = createDonateReturnUrl(checkoutBaseUrl, 'success', {
        includeSessionId: true,
    });
    const cancelUrl = createDonateReturnUrl(checkoutBaseUrl, 'cancel');
    if (!successUrl || !cancelUrl) {
        res.status(500).json({
            ok: false,
            error: 'Could not determine checkout return URL.',
        });
        return;
    }

    try {
        const checkoutSession = await stripeClient.checkout.sessions.create({
            mode: 'payment',
            submit_type: 'donate',
            locale: 'en',
            payment_method_types: ['card'],
            line_items: [
                {
                    quantity: 1,
                    price_data: {
                        currency: DONATE_CURRENCY,
                        unit_amount: amountCents,
                        product_data: {
                            name: DONATE_PRODUCT_NAME,
                        },
                    },
                },
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
                integration: 'minefield-drift',
            },
        });
        if (typeof checkoutSession?.url !== 'string' || !checkoutSession.url) {
            throw new Error('Stripe did not return a checkout URL.');
        }

        donateSessionStore.upsertFromStripeSession(checkoutSession, {
            source: 'checkout-create',
        });

        res.status(201).json({
            ok: true,
            sessionId: checkoutSession.id,
            checkoutUrl: checkoutSession.url,
        });
    } catch (error) {
        console.error('Stripe checkout session creation failed:', error);
        res.status(502).json({
            ok: false,
            error: 'Could not start secure checkout. Try again.',
        });
    }
});

app.get('/api/donate/session-status', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!stripeClient) {
        res.status(503).json({
            ok: false,
            error: 'Donations are not configured on this server.',
        });
        return;
    }

    const checkoutSessionId = normalizeStripeCheckoutSessionId(
        typeof req.query?.session_id === 'string' ? req.query.session_id : req.query?.sessionId
    );
    if (!checkoutSessionId) {
        res.status(400).json({
            ok: false,
            error: 'A valid Stripe Checkout session ID is required.',
        });
        return;
    }

    const cachedSessionState = donateSessionStore.getSessionState(checkoutSessionId);
    if (cachedSessionState && isDonationSessionStatusFinal(cachedSessionState.status)) {
        res.json(buildDonateSessionStatusResponse(cachedSessionState, { fromCache: true }));
        return;
    }

    try {
        const checkoutSession = await stripeClient.checkout.sessions.retrieve(checkoutSessionId);
        const syncedSessionState = donateSessionStore.upsertFromStripeSession(checkoutSession, {
            source: 'api-verify',
        });
        if (!syncedSessionState) {
            throw new Error('Could not normalize Stripe checkout session.');
        }
        res.json(buildDonateSessionStatusResponse(syncedSessionState, { fromCache: false }));
    } catch (error) {
        const fallbackSessionState = donateSessionStore.getSessionState(checkoutSessionId);
        if (fallbackSessionState) {
            res.json(
                buildDonateSessionStatusResponse(fallbackSessionState, {
                    fromCache: true,
                    stale: true,
                })
            );
            return;
        }
        console.error('Stripe checkout session verification failed:', error);
        res.status(502).json({
            ok: false,
            error: 'Could not verify donation status. Try again shortly.',
        });
    }
});

io.on('connection', (socket) => {
    socket.data.profile = createDefaultProfile(socket.id);
    socket.data.roomCode = null;
    socket.data.authIdentity = null;
    socket.data.lastCollisionRelays = new Map();
    socket.data.lastEnvironmentStateAt = 0;
    socket.data.rateLimitStore = new Map();

    socket.on('mp:createRoom', async (payload, ack) => {
        if (!consumeInboundEventQuota(socket, 'mp:createRoom')) {
            safeAck(ack, {
                ok: false,
                error: 'Too many requests. Slow down and try again.',
            });
            return;
        }
        try {
            const authIdentity = await requireAuthenticatedSocket(socket, ack);
            if (!authIdentity) {
                return;
            }
            const profile = resolveProfile(
                payload?.profile,
                createAuthenticatedProfile(authIdentity, socket.id),
                socket.id
            );
            socket.data.profile = profile;
            leaveCurrentRoom(socket);

            if (rooms.size >= MAX_ACTIVE_ROOMS) {
                safeAck(ack, {
                    ok: false,
                    error: 'Server room limit reached. Try again shortly.',
                });
                return;
            }

            const payloadRoomCodeRaw =
                typeof payload?.roomCode === 'string' ? payload.roomCode : undefined;
            const requestedRoomCode =
                payloadRoomCodeRaw == null ? '' : sanitizeRoomCode(payloadRoomCodeRaw);
            if (payloadRoomCodeRaw != null && !requestedRoomCode) {
                safeAck(ack, {
                    ok: false,
                    error: `Room code must be ${ROOM_CODE_LENGTH} letters or numbers.`,
                });
                return;
            }
            if (requestedRoomCode && rooms.has(requestedRoomCode)) {
                safeAck(ack, {
                    ok: false,
                    error: `Room ${requestedRoomCode} already exists.`,
                });
                return;
            }

            const roomCode = requestedRoomCode || generateRoomCode();
            if (!roomCode) {
                safeAck(ack, {
                    ok: false,
                    error: 'Could not allocate a room code. Try again.',
                });
                return;
            }

            const room = {
                code: roomCode,
                hostId: socket.id,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                players: new Map(),
                mines: new Map(),
                weaponPickups: createRoomWeaponPickupState(),
                environmentState: createRoomEnvironmentState(),
                collectedPickupIds: new Map(),
                roundState: createRoomRoundState(ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT),
            };
            room.players.set(socket.id, createRoomPlayer(socket.id, profile, authIdentity));
            recalculateRoomRoundStateFromPlayers(room.roundState, room.players);
            rooms.set(roomCode, room);

            socket.join(roomCode);
            socket.data.roomCode = roomCode;

            emitRoomState(room);
            safeAck(ack, {
                ok: true,
                room: serializeRoom(room),
                selfId: socket.id,
            });
        } catch {
            safeAck(ack, {
                ok: false,
                error: 'Room creation failed due to a server error.',
            });
        }
    });

    socket.on('mp:joinRoom', async (payload, ack) => {
        if (!consumeInboundEventQuota(socket, 'mp:joinRoom')) {
            safeAck(ack, {
                ok: false,
                error: 'Too many requests. Slow down and try again.',
            });
            return;
        }
        try {
            const authIdentity = await requireAuthenticatedSocket(socket, ack);
            if (!authIdentity) {
                return;
            }
            const roomCode = sanitizeRoomCode(payload?.roomCode);
            if (!roomCode) {
                safeAck(ack, {
                    ok: false,
                    error: 'Enter a valid room code.',
                });
                return;
            }

            const room = rooms.get(roomCode);
            if (!room) {
                safeAck(ack, {
                    ok: false,
                    error: `Room ${roomCode} does not exist.`,
                });
                return;
            }

            if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
                safeAck(ack, {
                    ok: false,
                    error: `Room ${roomCode} is full.`,
                });
                return;
            }

            const profile = resolveProfile(
                payload?.profile,
                createAuthenticatedProfile(authIdentity, socket.id),
                socket.id
            );
            socket.data.profile = profile;
            leaveCurrentRoom(socket);

            room.players.set(socket.id, createRoomPlayer(socket.id, profile, authIdentity));
            room.roundState =
                room.roundState && typeof room.roundState === 'object'
                    ? room.roundState
                    : createRoomRoundState(ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT);
            room.weaponPickups = syncRoomWeaponPickupState(room, Date.now());
            recalculateRoomRoundStateFromPlayers(room.roundState, room.players);
            room.updatedAt = Date.now();
            socket.join(roomCode);
            socket.data.roomCode = roomCode;

            emitRoomState(room);
            safeAck(ack, {
                ok: true,
                room: serializeRoom(room),
                selfId: socket.id,
            });
        } catch {
            safeAck(ack, {
                ok: false,
                error: 'Joining room failed due to a server error.',
            });
        }
    });

    socket.on('mp:leaveRoom', (payload, ack) => {
        if (!consumeInboundEventQuota(socket, 'mp:leaveRoom')) {
            safeAck(ack, {
                ok: false,
                error: 'Too many requests. Slow down and try again.',
            });
            return;
        }
        const roomCode = socket.data.roomCode;
        leaveCurrentRoom(socket);
        safeAck(ack, {
            ok: true,
            roomCode,
        });
    });

    socket.on('mp:updateProfile', (payload) => {
        if (!consumeInboundEventQuota(socket, 'mp:updateProfile')) {
            return;
        }
        const profile = resolveProfile(payload, socket.data.profile, socket.id);
        socket.data.profile = profile;

        const roomCode = socket.data.roomCode;
        if (!roomCode) {
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.data.roomCode = null;
            return;
        }

        const player = room.players.get(socket.id);
        if (!player) {
            return;
        }

        player.name = profile.name;
        player.colorHex = profile.colorHex;
        player.skinId = profile.skinId;
        room.updatedAt = Date.now();
        emitRoomState(room);
    });

    socket.on('mp:state', (payload) => {
        if (!consumeInboundEventQuota(socket, 'mp:state')) {
            return;
        }
        const roomCode = socket.data.roomCode;
        if (!roomCode) {
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.data.roomCode = null;
            return;
        }

        const player = room.players.get(socket.id);
        if (!player) {
            return;
        }

        const now = Date.now();
        pruneExpiredMines(room, now);
        if (now - player.lastInboundStateAt < STATE_UPDATE_MIN_INTERVAL_MS) {
            return;
        }

        const sanitizedState = sanitizePlayerState(payload, player.lastState);
        if (!sanitizedState) {
            return;
        }
        const transitionValidation = validateStateTransition({
            previousState: player.lastState,
            previousStateAt: player.lastStateAt,
            nextState: sanitizedState,
            nowMs: now,
            allowSnapUntil: player.allowStateSnapUntil,
        });
        if (!transitionValidation.ok) {
            return;
        }
        if (transitionValidation.usedSnap) {
            player.allowStateSnapUntil = 0;
        }
        sanitizedState.collectedCount = Math.max(0, Math.round(Number(player.collectedCount) || 0));
        sanitizedState.score = Math.max(0, Math.round(Number(player.score) || 0));
        sanitizedState.isDestroyed = Boolean(player.isDestroyed);

        player.previousState = player.lastState;
        player.previousStateAt = player.lastStateAt;
        player.lastState = sanitizedState;
        player.lastStateAt = now;
        player.lastInboundStateAt = now;
        room.updatedAt = now;

        socket.to(roomCode).emit('mp:playerState', {
            id: socket.id,
            state: sanitizedState,
            serverTime: now,
        });
    });

    socket.on('mp:environmentState', (payload) => {
        if (!consumeInboundEventQuota(socket, 'mp:environmentState')) {
            return;
        }
        const roomCode = socket.data.roomCode;
        if (!roomCode) {
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.data.roomCode = null;
            return;
        }
        if (room.hostId !== socket.id) {
            return;
        }

        const now = Date.now();
        if (now - (socket.data.lastEnvironmentStateAt || 0) < ENVIRONMENT_STATE_MIN_INTERVAL_MS) {
            return;
        }

        const nextState = sanitizeEnvironmentStateUpdate(payload, room.environmentState, now);
        if (!nextState) {
            return;
        }

        socket.data.lastEnvironmentStateAt = now;
        room.environmentState = nextState;
        room.updatedAt = now;
        socket.to(roomCode).emit('mp:environmentState', {
            state: serializeRoomEnvironmentState(nextState),
            serverTime: now,
        });
    });

    socket.on('mp:collision', (payload) => {
        if (!consumeInboundEventQuota(socket, 'mp:collision')) {
            return;
        }
        const roomCode = socket.data.roomCode;
        if (!roomCode) {
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.data.roomCode = null;
            return;
        }

        const sourcePlayer = room.players.get(socket.id);
        if (!sourcePlayer) {
            return;
        }

        const relay = sanitizeCollisionRelay(payload);
        if (!relay) {
            return;
        }
        if (relay.targetId === socket.id) {
            return;
        }
        const targetPlayer = room.players.get(relay.targetId);
        if (!targetPlayer) {
            return;
        }

        const now = Date.now();
        const key = relay.targetId;
        const lastByTarget = socket.data.lastCollisionRelays;
        const lastAt = lastByTarget.get(key) || 0;
        if (now - lastAt < COLLISION_RELAY_MIN_INTERVAL_MS) {
            return;
        }
        lastByTarget.set(key, now);

        const validatedRelay = validateCollisionRelay({
            relay,
            sourceState: sourcePlayer.lastState,
            sourceStateAt: sourcePlayer.lastStateAt,
            targetState: targetPlayer.lastState,
            targetStateAt: targetPlayer.lastStateAt,
            nowMs: now,
        });
        if (!validatedRelay.ok) {
            return;
        }

        const targetVelocityX = clampFinite(targetPlayer.lastState?.velocityX, -400, 400, 0);
        const targetVelocityZ = clampFinite(targetPlayer.lastState?.velocityZ, -400, 400, 0);

        io.to(relay.targetId).emit('mp:collision', {
            sourcePlayerId: socket.id,
            normalX: validatedRelay.relay.normalX,
            normalZ: validatedRelay.relay.normalZ,
            penetration: validatedRelay.relay.penetration,
            impactSpeed: validatedRelay.relay.impactSpeed,
            otherVelocityX: validatedRelay.relay.otherVelocityX,
            otherVelocityZ: validatedRelay.relay.otherVelocityZ,
            mass: validatedRelay.relay.mass,
            serverTime: now,
        });
        io.to(socket.id).emit('mp:collision', {
            sourcePlayerId: relay.targetId,
            normalX: -validatedRelay.relay.normalX,
            normalZ: -validatedRelay.relay.normalZ,
            penetration: validatedRelay.relay.penetration,
            impactSpeed: validatedRelay.relay.impactSpeed,
            otherVelocityX: targetVelocityX,
            otherVelocityZ: targetVelocityZ,
            mass: validatedRelay.relay.mass,
            serverTime: now,
        });
    });

    socket.on('mp:minePlaced', (payload) => {
        if (!consumeInboundEventQuota(socket, 'mp:minePlaced')) {
            return;
        }
        const roomCode = socket.data.roomCode;
        if (!roomCode) {
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.data.roomCode = null;
            return;
        }

        const player = room.players.get(socket.id);
        if (!player) {
            return;
        }

        const now = Date.now();
        if (now - (player.lastMinePlacedAt || 0) < MINE_SERVER_PLACE_COOLDOWN_MS) {
            return;
        }
        pruneExpiredMines(room, now);
        const mine = sanitizeMinePlacement(payload, {
            room,
            ownerId: socket.id,
            ownerName: player.name,
            now,
        });
        if (!mine) {
            return;
        }
        if (room.mines.has(mine.id)) {
            mine.id = generateServerMineId(mine.ownerId, now);
        }

        enforceMineLimits(room, mine.ownerId);
        room.mines.set(mine.id, mine);
        player.lastMinePlacedAt = now;
        room.updatedAt = now;
        io.to(roomCode).emit('mp:minePlaced', {
            ...serializeMine(mine),
            serverTime: now,
        });
    });

    socket.on('mp:mineDetonated', (payload) => {
        if (!consumeInboundEventQuota(socket, 'mp:mineDetonated')) {
            return;
        }
        const roomCode = socket.data.roomCode;
        if (!roomCode) {
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.data.roomCode = null;
            return;
        }

        const player = room.players.get(socket.id);
        if (!player) {
            return;
        }

        const now = Date.now();
        pruneExpiredMines(room, now);
        const detonation = sanitizeMineDetonation(payload, now);
        if (!detonation) {
            return;
        }

        const mine = room.mines.get(detonation.mineId);
        if (!mine) {
            return;
        }

        const resolvedDetonation = resolveAuthoritativeMineDetonation({
            room,
            mine,
            reportingPlayerId: socket.id,
            detonation,
            nowMs: now,
        });
        if (!resolvedDetonation.ok) {
            return;
        }

        const detonationOwnerId = sanitizeSocketLikeId(resolvedDetonation.detonation.ownerId);
        const detonationTargetPlayerId = sanitizeSocketLikeId(
            resolvedDetonation.detonation.targetPlayerId
        );
        const mineScoreApplied =
            detonationOwnerId &&
            detonationTargetPlayerId &&
            detonationOwnerId !== detonationTargetPlayerId
                ? applyPlayerMineKillScore({
                      room,
                      ownerPlayerId: detonationOwnerId,
                      targetPlayerId: detonationTargetPlayerId,
                      nowMs: now,
                  })
                : null;

        room.mines.delete(mine.id);
        room.updatedAt = now;
        io.to(roomCode).emit('mp:mineDetonated', {
            mineId: resolvedDetonation.detonation.mineId,
            ownerId: resolvedDetonation.detonation.ownerId,
            ownerName: resolvedDetonation.detonation.ownerName,
            x: roundTo(clampFinite(resolvedDetonation.detonation.x, -5000, 5000, mine.x), 4),
            y: roundTo(clampFinite(resolvedDetonation.detonation.y, -500, 2500, mine.y), 4),
            z: roundTo(clampFinite(resolvedDetonation.detonation.z, -5000, 5000, mine.z), 4),
            triggerPlayerId: resolvedDetonation.detonation.triggerPlayerId,
            targetPlayerId: resolvedDetonation.detonation.targetPlayerId,
            ownerPointsAwarded: mineScoreApplied?.ok
                ? Math.max(0, Math.round(Number(mineScoreApplied.pointsAwarded) || 0))
                : 0,
            ownerScore: mineScoreApplied?.ok
                ? Math.max(0, Math.round(Number(mineScoreApplied.ownerScore) || 0))
                : Math.max(0, Math.round(Number(room.players.get(detonationOwnerId)?.score) || 0)),
            ownerScoring:
                mineScoreApplied?.ok && mineScoreApplied.scoring
                    ? {
                          rule:
                              typeof mineScoreApplied.scoring.rule === 'string'
                                  ? mineScoreApplied.scoring.rule
                                  : 'mine-kill',
                          label:
                              typeof mineScoreApplied.scoring.label === 'string'
                                  ? mineScoreApplied.scoring.label
                                  : 'Mine kill',
                          basePoints: Math.max(
                              0,
                              Math.round(Number(mineScoreApplied.scoring.basePoints) || 0)
                          ),
                      }
                    : null,
            serverTime: now,
        });
        if (mineScoreApplied?.ok) {
            emitRoomState(room);
        }
    });

    socket.on('mp:pickupCollected', (payload, ack) => {
        if (!consumeInboundEventQuota(socket, 'mp:pickupCollected')) {
            safeAck(ack, {
                ok: false,
                error: 'Rate limited',
            });
            return;
        }

        const roomCode = socket.data.roomCode;
        if (!roomCode) {
            safeAck(ack, {
                ok: false,
                error: 'Not in room',
            });
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.data.roomCode = null;
            safeAck(ack, {
                ok: false,
                error: 'Room missing',
            });
            return;
        }

        const player = room.players.get(socket.id);
        if (!player) {
            safeAck(ack, {
                ok: false,
                error: 'Player missing',
            });
            return;
        }

        const now = Date.now();
        pruneCollectedPickupHistory(room, now);
        const pickupValidation = validatePickupCollection({
            room,
            playerId: socket.id,
            payload,
            nowMs: now,
            maxPlayerDistance: PICKUP_STATE_MAX_DISTANCE,
        });
        if (!pickupValidation.ok) {
            safeAck(ack, {
                ok: false,
                error: pickupValidation.reason,
                roundState: serializeRoomRoundState(room.roundState),
                playerCollectedCount: Math.max(0, Math.round(Number(player.collectedCount) || 0)),
                playerScore: Math.max(0, Math.round(Number(player.score) || 0)),
            });
            return;
        }
        const scoreApplied = applyPlayerPickupScore({
            room,
            playerId: socket.id,
            nowMs: now,
        });
        if (!scoreApplied.ok) {
            safeAck(ack, {
                ok: false,
                error: scoreApplied.reason,
                roundState: serializeRoomRoundState(room.roundState),
                playerCollectedCount: Math.max(0, Math.round(Number(player.collectedCount) || 0)),
                playerScore: Math.max(0, Math.round(Number(player.score) || 0)),
            });
            return;
        }

        markPickupCollected(room, pickupValidation.pickupId, now);
        room.updatedAt = now;
        emitRoomState(room);
        safeAck(ack, {
            ok: true,
            playerCollectedCount: Math.max(0, Math.round(Number(player.collectedCount) || 0)),
            playerScore: Math.max(0, Math.round(Number(player.score) || 0)),
            pointsAwarded: Math.max(0, Math.round(Number(scoreApplied.pointsAwarded) || 0)),
            scoring:
                scoreApplied.scoring && typeof scoreApplied.scoring === 'object'
                    ? {
                          rule:
                              typeof scoreApplied.scoring.rule === 'string'
                                  ? scoreApplied.scoring.rule
                                  : 'pickup',
                          label:
                              typeof scoreApplied.scoring.label === 'string'
                                  ? scoreApplied.scoring.label
                                  : 'Pickup',
                          basePoints: Math.max(
                              0,
                              Math.round(Number(scoreApplied.scoring.basePoints) || 0)
                          ),
                      }
                    : null,
            roundState: serializeRoomRoundState(room.roundState),
        });
    });

    socket.on('mp:weaponPickupCollected', (payload, ack) => {
        if (!consumeInboundEventQuota(socket, 'mp:weaponPickupCollected')) {
            safeAck(ack, {
                ok: false,
                error: 'Rate limited',
            });
            return;
        }

        const roomCode = socket.data.roomCode;
        if (!roomCode) {
            safeAck(ack, {
                ok: false,
                error: 'Not in room',
            });
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.data.roomCode = null;
            safeAck(ack, {
                ok: false,
                error: 'Room missing',
            });
            return;
        }

        const player = room.players.get(socket.id);
        if (!player) {
            safeAck(ack, {
                ok: false,
                error: 'Player missing',
            });
            return;
        }

        const now = Date.now();
        const pickupId = sanitizeWeaponPickupId(payload?.pickupId);
        if (!pickupId) {
            safeAck(ack, {
                ok: false,
                error: 'Invalid pickup',
            });
            return;
        }

        const weaponPickups = syncRoomWeaponPickupState(room, now);
        const pickupState = weaponPickups[pickupId];
        if (!pickupState) {
            safeAck(ack, {
                ok: false,
                error: 'Pickup missing',
            });
            return;
        }

        if (!pickupState.available) {
            safeAck(ack, {
                ok: false,
                error: 'Pickup unavailable',
                pickup: serializeRoomWeaponPickupState(pickupState),
            });
            return;
        }

        pickupState.available = false;
        pickupState.collectedAt = now;
        pickupState.collectedByPlayerId = socket.id;
        pickupState.respawnAt = now + WEAPON_PICKUP_RESPAWN_DELAY_MS;
        room.updatedAt = now;

        if (player.lastState && typeof player.lastState === 'object') {
            player.lastState.weaponHasWeapon = true;
            player.lastState.weaponTriggerHeld = false;
            player.lastState.weaponLocked = false;
            player.lastState.weaponHasTarget = false;
            player.lastState.weaponTargetX = 0;
            player.lastState.weaponTargetY = 0;
            player.lastState.weaponTargetZ = 0;
        }

        emitRoomState(room);
        safeAck(ack, {
            ok: true,
            pickup: serializeRoomWeaponPickupState(pickupState),
        });
    });

    socket.on('mp:crashReplication', (payload) => {
        if (!consumeInboundEventQuota(socket, 'mp:crashReplication')) {
            return;
        }

        const roomCode = socket.data.roomCode;
        if (!roomCode) {
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.data.roomCode = null;
            return;
        }

        const player = room.players.get(socket.id);
        if (!player) {
            return;
        }

        const now = Date.now();
        if (now - (player.lastCrashReplicationAt || 0) < CRASH_REPLICATION_MIN_INTERVAL_MS) {
            return;
        }

        const snapshot = sanitizeCrashReplication(payload, player.lastCrashReplication);
        player.lastCrashReplication = snapshot;
        player.lastCrashReplicationAt = now;
        room.updatedAt = now;
        socket.to(roomCode).emit('mp:crashReplication', {
            id: socket.id,
            crashReplication: snapshot,
            serverTime: now,
        });
    });

    socket.on('mp:vehicleStatus', (payload) => {
        if (!consumeInboundEventQuota(socket, 'mp:vehicleStatus')) {
            return;
        }

        const roomCode = socket.data.roomCode;
        if (!roomCode) {
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.data.roomCode = null;
            return;
        }

        const player = room.players.get(socket.id);
        if (!player) {
            return;
        }

        const now = Date.now();
        if (now - (player.lastVehicleStatusAt || 0) < VEHICLE_STATUS_MIN_INTERVAL_MS) {
            return;
        }
        player.lastVehicleStatusAt = now;

        const nextDestroyed = Boolean(payload?.isDestroyed);
        if (nextDestroyed === Boolean(player.isDestroyed)) {
            return;
        }
        if (nextDestroyed) {
            player.lastPickupPoints = 0;
            player.lastMineKillPoints = 0;
            player.destroyedAt = now;
            player.allowStateSnapUntil = 0;
        } else {
            const destroyedAt = Number(player.destroyedAt) || 0;
            if (destroyedAt > 0 && now - destroyedAt >= PLAYER_RESPAWN_SNAP_MIN_DESTROYED_MS) {
                player.allowStateSnapUntil = now + PLAYER_RESPAWN_SNAP_WINDOW_MS;
            } else {
                player.allowStateSnapUntil = 0;
            }
            player.destroyedAt = 0;
        }
        player.isDestroyed = nextDestroyed;
        if (player.lastState && typeof player.lastState === 'object') {
            player.lastState.isDestroyed = nextDestroyed;
        }
        room.updatedAt = now;
        emitRoomState(room);
    });

    socket.on('mp:weaponShot', (payload) => {
        if (!consumeInboundEventQuota(socket, 'mp:weaponShot')) {
            return;
        }

        const roomCode = socket.data.roomCode;
        if (!roomCode) {
            return;
        }

        const room = rooms.get(roomCode);
        if (!room) {
            socket.data.roomCode = null;
            return;
        }

        const player = room.players.get(socket.id);
        if (!player || !player.lastState || typeof player.lastState !== 'object') {
            return;
        }

        const shot = sanitizeWeaponShot(payload, player.lastState);
        if (!shot) {
            return;
        }

        socket.to(roomCode).emit('mp:weaponShot', {
            id: socket.id,
            shot,
            serverTime: Date.now(),
        });
    });

    socket.on('disconnect', () => {
        leaveCurrentRoom(socket);
    });
});

void startServer();

async function startServer() {
    await initializeSupabaseLeaderboardSchema();
    server.listen(PORT, () => {
        const accessUrls = resolveServerAccessUrls(PORT);
        console.log('Server is running on:');
        accessUrls.forEach((url) => {
            console.log(`- ${url}`);
        });
        if (stripeClient && !STRIPE_WEBHOOK_SECRET) {
            console.warn(
                'Stripe webhook secret is not configured; donation verification falls back to polling.'
            );
        }
        if (leaderboardStore.isConfigured()) {
            console.log('Supabase leaderboard API is enabled.');
        }
        if (supabaseRuntimeConfig.publicEnabled && !supabaseServiceClient) {
            console.warn('Supabase public auth is enabled, but server-side token validation is not.');
        }
    });
}

async function initializeSupabaseLeaderboardSchema() {
    if (!leaderboardStore.isConfigured()) {
        return;
    }
    const bootstrapConnectionStrings = Array.from(
        new Set(
            [supabaseRuntimeConfig.dbUrl, supabaseRuntimeConfig.dbPoolerUrl].filter(
                (value) => typeof value === 'string' && value.trim()
            )
        )
    );
    if (bootstrapConnectionStrings.length === 0) {
        console.warn(
            'Supabase leaderboard is enabled, but no DB connection string is available for automatic schema bootstrap.'
        );
        return;
    }

    let lastError = null;
    for (let index = 0; index < bootstrapConnectionStrings.length; index += 1) {
        try {
            await ensureLeaderboardSchema({
                connectionString: bootstrapConnectionStrings[index],
            });
            return;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        console.error('Supabase leaderboard schema bootstrap failed:', lastError);
    }
}

function resolveServerAccessUrls(port) {
    const portText = String(port);
    const urls = [`http://localhost:${portText}`];
    const interfaces = os.networkInterfaces();
    const lanAddresses = new Set();

    Object.values(interfaces).forEach((entries) => {
        if (!Array.isArray(entries)) {
            return;
        }
        entries.forEach((entry) => {
            if (!entry || entry.internal || !isIpv4Family(entry.family)) {
                return;
            }
            const address = typeof entry.address === 'string' ? entry.address.trim() : '';
            if (!address || address.startsWith('169.254.')) {
                return;
            }
            lanAddresses.add(address);
        });
    });

    lanAddresses.forEach((address) => {
        urls.push(`http://${address}:${portText}`);
    });

    return urls;
}

function isIpv4Family(family) {
    return family === 'IPv4' || family === 4;
}

function sanitizeDonationAmountCents(value) {
    const numeric = Math.round(Number(value) || 0);
    if (!Number.isFinite(numeric)) {
        return null;
    }
    if (numeric < DONATE_MIN_AMOUNT_CENTS || numeric > DONATE_MAX_AMOUNT_CENTS) {
        return null;
    }
    if (numeric % DONATE_AMOUNT_STEP_CENTS !== 0) {
        return null;
    }
    return numeric;
}

function createStripeClient(secretKey) {
    if (!secretKey) {
        return null;
    }
    try {
        return new Stripe(secretKey);
    } catch (error) {
        console.error('Stripe client initialization failed:', error);
        return null;
    }
}

function sanitizeStripeWebhookSecret(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    if (!normalized || !normalized.startsWith('whsec_')) {
        return '';
    }
    return normalized;
}

function sanitizeStripeSecretKey(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    if (!normalized || !normalized.startsWith('sk_')) {
        return '';
    }
    return normalized;
}

function sanitizeGaMeasurementId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toUpperCase();
    return /^G-[A-Z0-9]{6,20}$/.test(normalized) ? normalized : '';
}

function sanitizeAdminToken(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().slice(0, 256);
}

function sanitizeCurrencyCode(value, fallback = 'eur') {
    if (typeof value !== 'string') {
        return fallback;
    }
    const normalized = value.trim().toLowerCase();
    return /^[a-z]{3}$/.test(normalized) ? normalized : fallback;
}

function sanitizeCheckoutText(value, fallback = 'Support Minefield Drift') {
    if (typeof value !== 'string') {
        return fallback;
    }
    const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 80);
    return normalized || fallback;
}

function resolveDonateBaseUrl(req) {
    if (DONATE_PUBLIC_BASE_URL) {
        return DONATE_PUBLIC_BASE_URL;
    }

    const host = sanitizeHttpHostHeader(req?.headers?.host);
    if (!host) {
        return '';
    }
    const protocol = resolveRequestProtocol(req);
    return `${protocol}://${host}`;
}

function isBillboardContentAdminAuthorized(req) {
    if (isLoopbackRequest(req)) {
        return true;
    }
    if (!BILLBOARD_CONTENT_ADMIN_TOKEN) {
        return false;
    }

    const requestToken = sanitizeAdminToken(
        req?.headers?.['x-billboard-admin-token'] || req?.headers?.['x-admin-token'] || ''
    );
    if (!requestToken) {
        return false;
    }

    try {
        return crypto.timingSafeEqual(
            Buffer.from(requestToken, 'utf8'),
            Buffer.from(BILLBOARD_CONTENT_ADMIN_TOKEN, 'utf8')
        );
    } catch {
        return false;
    }
}

function isLoopbackRequest(req) {
    const remoteAddress = String(req?.socket?.remoteAddress || '')
        .trim()
        .toLowerCase();
    return (
        remoteAddress === '127.0.0.1' ||
        remoteAddress === '::1' ||
        remoteAddress === '::ffff:127.0.0.1'
    );
}

function resolveHttpStatusCode(value, fallback = 500) {
    const numeric = Math.round(Number(value) || 0);
    if (numeric >= 400 && numeric <= 599) {
        return numeric;
    }
    return fallback;
}

function createDonateReturnUrl(baseUrl, state, options = {}) {
    if (!baseUrl) {
        return '';
    }
    const normalizedState = typeof state === 'string' ? state.trim().toLowerCase() : '';
    if (normalizedState !== 'success' && normalizedState !== 'cancel') {
        return '';
    }
    try {
        const origin = new URL(baseUrl).origin;
        const includeSessionId =
            Boolean(options?.includeSessionId) && normalizedState === 'success';
        const queryParts = [`donate=${encodeURIComponent(normalizedState)}`];
        if (includeSessionId) {
            // Stripe requires the literal placeholder token for runtime replacement.
            queryParts.push('session_id={CHECKOUT_SESSION_ID}');
        }
        return `${origin}/?${queryParts.join('&')}`;
    } catch {
        return '';
    }
}

function handleStripeDonateWebhook(req, res) {
    if (!stripeClient || !STRIPE_WEBHOOK_SECRET) {
        res.status(503).send('Donations are not configured on this server.');
        return;
    }
    const signatureHeader = req?.headers?.['stripe-signature'];
    if (typeof signatureHeader !== 'string' || !signatureHeader.trim()) {
        res.status(400).send('Missing Stripe signature header.');
        return;
    }
    if (!Buffer.isBuffer(req.body)) {
        res.status(400).send('Expected raw request body.');
        return;
    }

    let stripeEvent;
    try {
        stripeEvent = stripeClient.webhooks.constructEvent(
            req.body,
            signatureHeader,
            STRIPE_WEBHOOK_SECRET
        );
    } catch (error) {
        console.error('Stripe webhook signature validation failed:', error?.message || error);
        res.status(400).send('Invalid Stripe webhook signature.');
        return;
    }

    if (donateSessionStore.hasProcessedEvent(stripeEvent.id)) {
        res.status(200).send('ok');
        return;
    }

    try {
        processStripeDonateWebhookEvent(stripeEvent);
        donateSessionStore.markEventProcessed(stripeEvent.id);
        res.status(200).send('ok');
    } catch (error) {
        console.error('Stripe webhook processing failed:', error);
        res.status(500).send('Stripe webhook processing failed.');
    }
}

function processStripeDonateWebhookEvent(stripeEvent) {
    const eventType = typeof stripeEvent?.type === 'string' ? stripeEvent.type : '';
    if (!eventType || !eventType.startsWith('checkout.session.')) {
        return;
    }
    const checkoutSession = stripeEvent?.data?.object;
    if (!checkoutSession || typeof checkoutSession !== 'object') {
        return;
    }
    const statusOverride = resolveDonationStatusFromStripeEventType(eventType);
    donateSessionStore.upsertFromStripeSession(checkoutSession, {
        statusOverride,
        source: `webhook:${eventType}`,
    });
}

function resolveDonationStatusFromStripeEventType(eventType) {
    const normalized = typeof eventType === 'string' ? eventType.trim().toLowerCase() : '';
    switch (normalized) {
        case 'checkout.session.async_payment_succeeded':
            return DONATION_SESSION_STATUSES.paid;
        case 'checkout.session.async_payment_failed':
            return DONATION_SESSION_STATUSES.failed;
        case 'checkout.session.expired':
            return DONATION_SESSION_STATUSES.expired;
        default:
            return '';
    }
}

function buildDonateSessionStatusResponse(sessionState, options = {}) {
    return {
        ok: true,
        sessionId: sessionState.sessionId,
        status: sessionState.status,
        paid: sessionState.status === DONATION_SESSION_STATUSES.paid,
        final: isDonationSessionStatusFinal(sessionState.status),
        amountCents:
            Number.isInteger(sessionState.amountCents) && sessionState.amountCents >= 0
                ? sessionState.amountCents
                : null,
        currency: sanitizeCurrencyCode(sessionState.currency, DONATE_CURRENCY),
        fromCache: Boolean(options?.fromCache),
        stale: Boolean(options?.stale),
        updatedAtMs: Number.isFinite(sessionState.updatedAtMs)
            ? Math.max(0, Math.round(sessionState.updatedAtMs))
            : Date.now(),
    };
}

function resolveRequestProtocol(req) {
    const forwardedProto = req?.headers?.['x-forwarded-proto'];
    if (typeof forwardedProto === 'string') {
        const normalized = forwardedProto.split(',')[0].trim().toLowerCase();
        if (normalized === 'http' || normalized === 'https') {
            return normalized;
        }
    }
    const protocol = typeof req?.protocol === 'string' ? req.protocol.toLowerCase() : '';
    return protocol === 'https' ? 'https' : 'http';
}

function resolveSocketCorsOrigin(origin, callback) {
    const allowed = isSocketCorsOriginAllowed(origin, {
        allowedOrigins: SOCKET_ALLOWED_ORIGINS,
    });
    if (allowed) {
        callback(null, true);
        return;
    }
    callback(new Error('Origin is not allowed by CORS'));
}

function resolveSocketAllowRequest(req, callback) {
    const allowed = isSocketOriginAllowed(req?.headers?.origin, {
        allowedOrigins: SOCKET_ALLOWED_ORIGINS,
        publicBaseUrl: DONATE_PUBLIC_BASE_URL,
        requestHost: resolveSocketRequestHost(req),
    });
    callback(null, allowed);
}

function safeAck(ack, payload) {
    if (typeof ack === 'function') {
        ack(payload);
    }
}

function consumeInboundEventQuota(socket, eventName) {
    const store = socket?.data?.rateLimitStore;
    if (!(store instanceof Map)) {
        return false;
    }

    const now = Date.now();
    const globalAllowed = consumeRateLimit(
        store,
        '__global__',
        now,
        GLOBAL_RATE_WINDOW_MS,
        GLOBAL_RATE_MAX_EVENTS
    );
    if (!globalAllowed) {
        return false;
    }

    const eventRule = EVENT_RATE_LIMITS[eventName] || { windowMs: 1000, max: 20 };
    const eventAllowed = consumeRateLimit(
        store,
        `event:${eventName}`,
        now,
        eventRule.windowMs,
        eventRule.max
    );
    if (!eventAllowed) {
        return false;
    }

    pruneIpRateLimitStore(now);
    const addressKey = resolveSocketAddressKey(socket);
    if (!addressKey) {
        return true;
    }

    const ipGlobalAllowed = consumeRateLimit(
        ipRateLimitStore,
        `ip:${addressKey}:__global__`,
        now,
        IP_RATE_WINDOW_MS,
        IP_RATE_MAX_EVENTS
    );
    if (!ipGlobalAllowed) {
        return false;
    }

    const ipEventMax = Math.max(10, Math.round(eventRule.max * IP_RATE_RULE_MULTIPLIER));
    return consumeRateLimit(
        ipRateLimitStore,
        `ip:${addressKey}:event:${eventName}`,
        now,
        eventRule.windowMs,
        ipEventMax
    );
}

function resolveSocketAddressKey(socket) {
    const rawAddress = String(
        socket?.handshake?.address ||
            socket?.conn?.remoteAddress ||
            socket?.request?.socket?.remoteAddress ||
            ''
    ).trim();
    if (!rawAddress) {
        return '';
    }
    return rawAddress
        .replace(/^::ffff:/, '')
        .replace(/[^\w\-.:]/g, '')
        .slice(0, 96);
}

function consumeHttpRequestQuota(req, ruleKey, windowMs, maxCount) {
    const now = Date.now();
    pruneIpRateLimitStore(now);
    const addressKey = resolveHttpRequestAddressKey(req);
    if (!addressKey) {
        return true;
    }
    return consumeRateLimit(
        ipRateLimitStore,
        `http:${ruleKey}:${addressKey}`,
        now,
        windowMs,
        maxCount
    );
}

function resolveHttpRequestAddressKey(req) {
    const forwardedForHeader = req?.headers?.['x-forwarded-for'];
    const forwardedFor =
        typeof forwardedForHeader === 'string'
            ? forwardedForHeader.split(',')[0]
            : Array.isArray(forwardedForHeader)
              ? forwardedForHeader[0]
              : '';
    const rawAddress = String(forwardedFor || req?.socket?.remoteAddress || '')
        .trim()
        .replace(/^::ffff:/, '');
    if (!rawAddress) {
        return '';
    }
    return rawAddress.replace(/[^\w\-.:]/g, '').slice(0, 96);
}

function pruneIpRateLimitStore(nowMs = Date.now()) {
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    if (now - lastIpRateStorePruneAt < IP_RATE_STORE_PRUNE_INTERVAL_MS) {
        return;
    }
    lastIpRateStorePruneAt = now;
    for (const [key, bucket] of ipRateLimitStore.entries()) {
        const windowStartAt = Number(bucket?.windowStartAt);
        if (!Number.isFinite(windowStartAt) || now - windowStartAt > IP_RATE_STORE_TTL_MS) {
            ipRateLimitStore.delete(key);
        }
    }
}

function validateStateTransition({
    previousState,
    previousStateAt,
    nextState,
    nowMs = Date.now(),
    allowSnapUntil = 0,
} = {}) {
    if (!nextState || typeof nextState !== 'object') {
        return { ok: false, reason: 'invalid-next-state' };
    }
    if (!previousState || typeof previousState !== 'object') {
        return { ok: true, usedSnap: false };
    }

    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const previousAt = Number(previousStateAt);
    if (!Number.isFinite(previousAt) || previousAt <= 0 || now <= previousAt) {
        return { ok: true, usedSnap: false };
    }

    const dtSec = Math.max(0.001, Math.min(PLAYER_STATE_MAX_INTERVAL_MS, now - previousAt) / 1000);
    const dx = (Number(nextState.x) || 0) - (Number(previousState.x) || 0);
    const dy = (Number(nextState.y) || 0) - (Number(previousState.y) || 0);
    const dz = (Number(nextState.z) || 0) - (Number(previousState.z) || 0);
    const horizontalDistance = Math.hypot(dx, dz);
    const verticalDistance = Math.abs(dy);

    const snapAllowed = now <= Math.max(0, Number(allowSnapUntil) || 0);
    if (snapAllowed && horizontalDistance <= PLAYER_RESPAWN_MAX_SNAP_DISTANCE) {
        return { ok: true, usedSnap: true };
    }

    const allowedHorizontalDistance =
        PLAYER_STATE_HORIZONTAL_LEEWAY + dtSec * PLAYER_STATE_MAX_HORIZONTAL_SPEED_UNITS_PER_SEC;
    if (horizontalDistance > allowedHorizontalDistance) {
        return { ok: false, reason: 'implausible-horizontal-movement' };
    }

    const allowedVerticalDistance =
        PLAYER_STATE_VERTICAL_LEEWAY + dtSec * PLAYER_STATE_MAX_VERTICAL_SPEED_UNITS_PER_SEC;
    if (verticalDistance > allowedVerticalDistance) {
        return { ok: false, reason: 'implausible-vertical-movement' };
    }

    return { ok: true, usedSnap: false };
}

async function requireAuthenticatedSocket(socket, ack) {
    const authIdentity = await resolveSocketAuthIdentity(socket);
    if (authIdentity?.userId) {
        return authIdentity;
    }
    safeAck(ack, {
        ok: false,
        error: supabaseServiceClient ? ONLINE_AUTH_REQUIRED_ERROR : ONLINE_AUTH_SERVER_ERROR,
    });
    return null;
}

async function resolveSocketAuthIdentity(socket) {
    if (socket?.data?.authIdentity?.userId) {
        return socket.data.authIdentity;
    }
    const accessToken = sanitizeSupabaseAccessToken(socket?.handshake?.auth?.accessToken);
    if (!accessToken) {
        return null;
    }
    const authIdentity = await resolveSupabaseIdentityFromAccessToken(accessToken);
    if (authIdentity?.userId && socket?.data) {
        socket.data.authIdentity = authIdentity;
    }
    return authIdentity;
}

async function resolveAuthenticatedRequestIdentity(req) {
    const accessToken = extractBearerToken(req?.headers?.authorization);
    if (!accessToken) {
        return null;
    }
    return resolveSupabaseIdentityFromAccessToken(accessToken);
}

async function resolveSupabaseIdentityFromAccessToken(accessToken) {
    const safeAccessToken = sanitizeSupabaseAccessToken(accessToken);
    if (!supabaseServiceClient || !safeAccessToken) {
        return null;
    }

    try {
        const { data, error } = await supabaseServiceClient.auth.getUser(safeAccessToken);
        if (error || !data?.user?.id) {
            return null;
        }
        const email = sanitizeAuthEmail(data.user.email);
        return {
            userId: sanitizeSupabaseUserId(data.user.id),
            email,
            displayName: resolveAuthenticatedDisplayName(data.user, email),
        };
    } catch {
        return null;
    }
}

function createAuthenticatedProfile(authIdentity = null, socketId = '') {
    const fallbackProfile = createDefaultProfile(socketId);
    if (!authIdentity || typeof authIdentity !== 'object') {
        return fallbackProfile;
    }
    return {
        ...fallbackProfile,
        name: sanitizePlayerName(
            authIdentity.displayName || resolveEmailName(authIdentity.email),
            fallbackProfile.name
        ),
    };
}

function createRoomPlayer(id, profile, authIdentity = null) {
    return {
        id,
        userId: sanitizeSupabaseUserId(authIdentity?.userId),
        name: profile.name,
        colorHex: profile.colorHex,
        skinId: profile.skinId,
        collectedCount: 0,
        score: 0,
        lastPickupPoints: 0,
        lastMineKillPoints: 0,
        isDestroyed: false,
        joinedAt: Date.now(),
        previousState: null,
        previousStateAt: 0,
        lastState: null,
        lastStateAt: 0,
        lastInboundStateAt: 0,
        lastMinePlacedAt: 0,
        lastPickupAt: 0,
        pickupWindowStartedAt: 0,
        pickupWindowCount: 0,
        lastCrashReplication: {
            detachedPartIds: [],
            debrisPieces: [],
            explosion: null,
        },
        lastCrashReplicationAt: 0,
        lastVehicleStatusAt: 0,
        destroyedAt: 0,
        allowStateSnapUntil: 0,
    };
}

function createRoomWeaponPickupState(nowMs = Date.now()) {
    const now = Math.max(0, Math.round(Number(nowMs) || Date.now()));
    return {
        roof: {
            id: 'roof',
            available: true,
            respawnAt: 0,
            collectedAt: 0,
            collectedByPlayerId: '',
            updatedAt: now,
        },
        parking: {
            id: 'parking',
            available: true,
            respawnAt: 0,
            collectedAt: 0,
            collectedByPlayerId: '',
            updatedAt: now,
        },
    };
}

function createRoomEnvironmentState(nowMs = Date.now()) {
    return {
        roofLift: createRoomRoofLiftEnvironmentState(nowMs),
    };
}

function createRoomRoofLiftEnvironmentState(nowMs = Date.now()) {
    const now = Math.max(0, Math.round(Number(nowMs) || Date.now()));
    return {
        currentSurfaceY: ROOM_ROOF_LIFT_DEFAULT_SURFACE_Y,
        targetSurfaceY: ROOM_ROOF_LIFT_DEFAULT_SURFACE_Y,
        normalizedTravel: 0,
        isMoving: false,
        updatedAt: now,
    };
}

function syncRoomWeaponPickupState(room, nowMs = Date.now()) {
    const now = Math.max(0, Math.round(Number(nowMs) || Date.now()));
    const baseState =
        room?.weaponPickups && typeof room.weaponPickups === 'object'
            ? room.weaponPickups
            : createRoomWeaponPickupState(now);
    const nextState = {
        roof: normalizeRoomWeaponPickupState(baseState.roof, 'roof', now),
        parking: normalizeRoomWeaponPickupState(baseState.parking, 'parking', now),
    };
    if (nextState.roof.respawnAt > 0 && now >= nextState.roof.respawnAt) {
        nextState.roof.available = true;
        nextState.roof.respawnAt = 0;
        nextState.roof.collectedByPlayerId = '';
        nextState.roof.updatedAt = now;
    }
    if (nextState.parking.respawnAt > 0 && now >= nextState.parking.respawnAt) {
        nextState.parking.available = true;
        nextState.parking.respawnAt = 0;
        nextState.parking.collectedByPlayerId = '';
        nextState.parking.updatedAt = now;
    }
    if (room && typeof room === 'object') {
        room.weaponPickups = nextState;
    }
    return nextState;
}

function syncRoomEnvironmentState(room, nowMs = Date.now()) {
    const now = Math.max(0, Math.round(Number(nowMs) || Date.now()));
    const baseState =
        room?.environmentState && typeof room.environmentState === 'object'
            ? room.environmentState
            : createRoomEnvironmentState(now);
    const nextState = {
        roofLift: normalizeRoomRoofLiftEnvironmentState(baseState.roofLift, now),
    };
    if (room && typeof room === 'object') {
        room.environmentState = nextState;
    }
    return nextState;
}

function sanitizeEnvironmentStateUpdate(payload, fallbackState, nowMs = Date.now()) {
    const now = Math.max(0, Math.round(Number(nowMs) || Date.now()));
    const baseState =
        fallbackState && typeof fallbackState === 'object'
            ? fallbackState
            : createRoomEnvironmentState(now);

    return {
        roofLift: normalizeRoomRoofLiftEnvironmentState(payload?.roofLift, now, baseState.roofLift),
    };
}

function normalizeRoomRoofLiftEnvironmentState(value, nowMs = Date.now(), fallback = null) {
    const now = Math.max(0, Math.round(Number(nowMs) || Date.now()));
    const baseState =
        fallback && typeof fallback === 'object'
            ? fallback
            : createRoomRoofLiftEnvironmentState(now);
    const currentSurfaceY = clampFinite(
        value?.currentSurfaceY,
        -32,
        320,
        baseState.currentSurfaceY
    );
    const targetSurfaceY = clampFinite(value?.targetSurfaceY, -32, 320, baseState.targetSurfaceY);
    const normalizedTravel = clampFinite(value?.normalizedTravel, 0, 1, baseState.normalizedTravel);
    const diff = Math.abs(targetSurfaceY - currentSurfaceY);
    return {
        currentSurfaceY,
        targetSurfaceY,
        normalizedTravel,
        isMoving: diff > 0.01 && Boolean(value?.isMoving),
        updatedAt: now,
    };
}

function normalizeRoomWeaponPickupState(value, fallbackId, nowMs = Date.now()) {
    const now = Math.max(0, Math.round(Number(nowMs) || Date.now()));
    const pickupId = sanitizeWeaponPickupId(value?.id) || fallbackId;
    const respawnAt = Math.max(0, Math.round(Number(value?.respawnAt) || 0));
    const available = Boolean(value?.available) || respawnAt <= 0;
    return {
        id: pickupId,
        available,
        respawnAt: available ? 0 : respawnAt,
        collectedAt: Math.max(0, Math.round(Number(value?.collectedAt) || 0)),
        collectedByPlayerId: sanitizeSocketLikeId(value?.collectedByPlayerId),
        updatedAt: Math.max(0, Math.round(Number(value?.updatedAt) || now)),
    };
}

function serializeRoomWeaponPickupState(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return {
        id: sanitizeWeaponPickupId(value.id),
        available: Boolean(value.available),
        respawnAt: Math.max(0, Math.round(Number(value.respawnAt) || 0)),
        collectedAt: Math.max(0, Math.round(Number(value.collectedAt) || 0)),
        collectedByPlayerId: sanitizeSocketLikeId(value.collectedByPlayerId),
    };
}

function serializeRoomEnvironmentState(value) {
    if (!value || typeof value !== 'object') {
        return {
            roofLift: serializeRoomRoofLiftEnvironmentState(createRoomRoofLiftEnvironmentState()),
        };
    }
    return {
        roofLift: serializeRoomRoofLiftEnvironmentState(value.roofLift),
    };
}

function serializeRoomRoofLiftEnvironmentState(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return {
        currentSurfaceY: clampFinite(
            value.currentSurfaceY,
            -32,
            320,
            ROOM_ROOF_LIFT_DEFAULT_SURFACE_Y
        ),
        targetSurfaceY: clampFinite(
            value.targetSurfaceY,
            -32,
            320,
            ROOM_ROOF_LIFT_DEFAULT_SURFACE_Y
        ),
        normalizedTravel: clampFinite(value.normalizedTravel, 0, 1, 0),
        isMoving: Boolean(value.isMoving),
    };
}

function serializeRoomWeaponPickupStates(value) {
    const state = value && typeof value === 'object' ? value : createRoomWeaponPickupState();
    return ['roof', 'parking']
        .map((pickupId) => serializeRoomWeaponPickupState(state[pickupId]))
        .filter(Boolean);
}

function serializeRoom(room) {
    pruneExpiredMines(room, Date.now());
    pruneCollectedPickupHistory(room, Date.now());
    room.roundState =
        room.roundState && typeof room.roundState === 'object'
            ? room.roundState
            : createRoomRoundState(ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT);
    syncRoomWeaponPickupState(room, Date.now());
    syncRoomEnvironmentState(room, Date.now());
    recalculateRoomRoundStateFromPlayers(room.roundState, room.players);
    const mineMap = room?.mines instanceof Map ? room.mines : new Map();
    const players = Array.from(room.players.values())
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((player) => {
            const collectedCount = Math.max(0, Math.round(Number(player.collectedCount) || 0));
            const score = Math.max(0, Math.round(Number(player.score) || 0));
            const isDestroyed = Boolean(player.isDestroyed);
            const baseState =
                player.lastState && typeof player.lastState === 'object'
                    ? {
                          ...player.lastState,
                          collectedCount,
                          score,
                          isDestroyed,
                      }
                    : null;
            if (baseState && player.lastCrashReplication) {
                baseState.crashReplication = player.lastCrashReplication;
            }

            return {
                id: player.id,
                name: player.name,
                colorHex: player.colorHex,
                skinId: player.skinId,
                collectedCount,
                score,
                isDestroyed,
                isHost: player.id === room.hostId,
                state: baseState,
                stateUpdatedAt: player.lastStateAt,
            };
        });

    return {
        roomCode: room.code,
        hostId: room.hostId,
        playerCount: players.length,
        maxPlayers: MAX_PLAYERS_PER_ROOM,
        roundState: serializeRoomRoundState(room.roundState),
        collectedPickupIds: serializeCollectedPickupIds(room),
        weaponPickups: serializeRoomWeaponPickupStates(room.weaponPickups),
        environmentState: serializeRoomEnvironmentState(room.environmentState),
        players,
        mines: Array.from(mineMap.values())
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((mine) => serializeMine(mine))
            .filter(Boolean),
    };
}

function emitRoomState(room) {
    io.to(room.code).emit('mp:roomState', serializeRoom(room));
}

function serializeCollectedPickupIds(room) {
    if (!room || !(room.collectedPickupIds instanceof Map) || room.collectedPickupIds.size === 0) {
        return [];
    }

    return Array.from(room.collectedPickupIds.keys())
        .map((pickupId) => (typeof pickupId === 'string' ? pickupId.trim() : ''))
        .filter(Boolean)
        .sort();
}

function leaveCurrentRoom(socket) {
    const roomCode = socket.data.roomCode;
    if (!roomCode) {
        return;
    }

    socket.data.roomCode = null;
    socket.leave(roomCode);

    const room = rooms.get(roomCode);
    if (!room) {
        return;
    }

    room.players.delete(socket.id);
    if (room.mines?.size) {
        for (const [mineId, mine] of room.mines.entries()) {
            if (mine?.ownerId === socket.id) {
                room.mines.delete(mineId);
            }
        }
    }
    room.updatedAt = Date.now();
    room.roundState =
        room.roundState && typeof room.roundState === 'object'
            ? room.roundState
            : createRoomRoundState(ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT);
    recalculateRoomRoundStateFromPlayers(room.roundState, room.players);

    if (room.players.size === 0) {
        rooms.delete(roomCode);
        return;
    }

    if (room.hostId === socket.id) {
        room.hostId = room.players.keys().next().value;
    }

    emitRoomState(room);
}

function generateRoomCode() {
    const maxValue = 36 ** ROOM_CODE_LENGTH;
    for (let i = 0; i < 64; i += 1) {
        const value = crypto
            .randomInt(0, maxValue)
            .toString(36)
            .toUpperCase()
            .padStart(ROOM_CODE_LENGTH, '0');
        if (!rooms.has(value)) {
            return value;
        }
    }
    return null;
}

function generateServerMineId(ownerId, nowMs = Date.now()) {
    const owner = sanitizeSocketLikeId(ownerId) || 'player';
    const now = Math.max(0, Math.round(Number(nowMs) || Date.now()));
    const nonce = crypto.randomBytes(MINE_ID_RANDOM_BYTES).toString('hex');
    return `${owner}-${now.toString(36)}-${nonce}`;
}

function createDefaultProfile(socketId) {
    const shortId = String(socketId || '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(-4)
        .toUpperCase()
        .padStart(4, '0');

    return {
        name: `Player-${shortId}`,
        colorHex: 0x2d67a6,
        skinId: DEFAULT_PLAYER_SKIN_ID,
    };
}

function extractBearerToken(headerValue) {
    if (typeof headerValue !== 'string') {
        return '';
    }
    const match = headerValue.trim().match(/^Bearer\s+(.+)$/iu);
    return match?.[1] ? sanitizeSupabaseAccessToken(match[1]) : '';
}

function sanitizeSupabaseAccessToken(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    return normalized.length >= 32 ? normalized.slice(0, 8192) : '';
}

function sanitizeSupabaseUserId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().slice(0, 128);
    return /^[a-zA-Z0-9-]{6,128}$/u.test(normalized) ? normalized : '';
}

function sanitizeAuthEmail(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase().slice(0, 320);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized) ? normalized : '';
}

function resolveEmailName(email) {
    if (typeof email !== 'string' || !email.includes('@')) {
        return '';
    }
    return email.split('@')[0] || '';
}

function resolveAuthenticatedDisplayName(user, email = '') {
    const metadataName = sanitizePlayerName(user?.user_metadata?.display_name, '');
    if (metadataName) {
        return metadataName;
    }
    return sanitizePlayerName(resolveEmailName(email), '');
}

function resolveProfile(input, fallback, socketId) {
    const defaultProfile = fallback || createDefaultProfile(socketId);
    return {
        name: sanitizePlayerName(input?.name, defaultProfile.name),
        colorHex: sanitizeColorHex(input?.colorHex, defaultProfile.colorHex),
        skinId: sanitizePlayerSkinId(input?.skinId, defaultProfile.skinId),
    };
}

function sanitizePlayerName(value, fallbackName) {
    if (typeof value !== 'string') {
        return fallbackName;
    }

    const normalized = value
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
        .slice(0, PLAYER_NAME_MAX_LENGTH);

    return normalized || fallbackName;
}

function sanitizeColorHex(value, fallbackColor) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallbackColor >>> 0;
    }

    return Math.max(0, Math.min(0xffffff, Math.round(numeric))) >>> 0;
}

function sanitizePlayerSkinId(value, fallbackSkinId) {
    if (typeof value !== 'string') {
        return fallbackSkinId;
    }

    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, PLAYER_SKIN_ID_MAX_LENGTH);
    return normalized || fallbackSkinId;
}

function sanitizeRoomCode(value) {
    if (typeof value !== 'string') {
        return '';
    }

    const normalized = value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
    if (normalized.length !== ROOM_CODE_LENGTH) {
        return '';
    }
    return normalized;
}

function sanitizePlayerState(payload, fallback) {
    const x = clampFinite(payload?.x, -5000, 5000, fallback?.x ?? 0);
    const y = clampFinite(payload?.y, -200, 1200, fallback?.y ?? 0);
    const z = clampFinite(payload?.z, -5000, 5000, fallback?.z ?? 0);
    const fallbackRotationY = Number.isFinite(fallback?.rotationY) ? fallback.rotationY : 0;
    const rotationY = normalizeAngle(
        clampFinite(payload?.rotationY, -Math.PI * 64, Math.PI * 64, fallbackRotationY)
    );
    const speed = clampFinite(payload?.speed, -320, 320, 0);
    const steerInput = clampFinite(payload?.steerInput, -1, 1, fallback?.steerInput ?? 0);
    const throttle = clampFinite(payload?.throttle, 0, 1, fallback?.throttle ?? 0);
    const brake = clampFinite(payload?.brake, 0, 1, fallback?.brake ?? 0);
    const burnout = clampFinite(payload?.burnout, 0, 1, fallback?.burnout ?? 0);
    const yawRate = clampFinite(payload?.yawRate, -24, 24, fallback?.yawRate ?? 0);
    const velocityX = clampFinite(payload?.velocityX, -400, 400, fallback?.velocityX ?? 0);
    const velocityZ = clampFinite(payload?.velocityZ, -400, 400, fallback?.velocityZ ?? 0);
    const batteryDepleted = Boolean(payload?.batteryDepleted);
    const chargingLevelNormalized = clampFinite(
        payload?.chargingLevelNormalized,
        0,
        1,
        fallback?.chargingLevelNormalized ?? 0
    );
    const inputForward = Boolean(payload?.inputForward);
    const inputBackward = Boolean(payload?.inputBackward);
    const inputLeft = Boolean(payload?.inputLeft);
    const inputRight = Boolean(payload?.inputRight);
    const inputHandbrake = Boolean(payload?.inputHandbrake);
    const weaponHasWeapon = Boolean(payload?.weaponHasWeapon);
    const weaponTriggerHeld = weaponHasWeapon && Boolean(payload?.weaponTriggerHeld);
    const weaponHeat = clampFinite(payload?.weaponHeat, 0, 1, fallback?.weaponHeat ?? 0);
    const weaponLocked = weaponHasWeapon && Boolean(payload?.weaponLocked);
    const weaponHasTarget = weaponHasWeapon && Boolean(payload?.weaponHasTarget);
    const weaponTargetX = weaponHasTarget
        ? clampFinite(payload?.weaponTargetX, -5000, 5000, fallback?.weaponTargetX ?? 0)
        : 0;
    const weaponTargetY = weaponHasTarget
        ? clampFinite(payload?.weaponTargetY, -200, 2500, fallback?.weaponTargetY ?? 0)
        : 0;
    const weaponTargetZ = weaponHasTarget
        ? clampFinite(payload?.weaponTargetZ, -5000, 5000, fallback?.weaponTargetZ ?? 0)
        : 0;

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return null;
    }

    return {
        x: roundTo(x, 4),
        y: roundTo(y, 4),
        z: roundTo(z, 4),
        rotationY: roundTo(rotationY, 4),
        speed: roundTo(speed, 3),
        steerInput: roundTo(steerInput, 4),
        throttle: roundTo(throttle, 4),
        brake: roundTo(brake, 4),
        burnout: roundTo(burnout, 4),
        yawRate: roundTo(yawRate, 4),
        velocityX: roundTo(velocityX, 4),
        velocityZ: roundTo(velocityZ, 4),
        batteryDepleted,
        chargingLevelNormalized: roundTo(chargingLevelNormalized, 4),
        inputForward,
        inputBackward,
        inputLeft,
        inputRight,
        inputHandbrake,
        weaponHasWeapon,
        weaponTriggerHeld,
        weaponHeat: roundTo(weaponHeat, 4),
        weaponLocked,
        weaponHasTarget,
        weaponTargetX: roundTo(weaponTargetX, 4),
        weaponTargetY: roundTo(weaponTargetY, 4),
        weaponTargetZ: roundTo(weaponTargetZ, 4),
    };
}

function sanitizeWeaponShot(payload, playerState) {
    if (
        !payload ||
        typeof payload !== 'object' ||
        !playerState ||
        typeof playerState !== 'object'
    ) {
        return null;
    }

    const startX = clampFinite(payload.startX, -5000, 5000, Number.NaN);
    const startY = clampFinite(payload.startY, -200, 2500, Number.NaN);
    const startZ = clampFinite(payload.startZ, -5000, 5000, Number.NaN);
    const endX = clampFinite(payload.endX, -5000, 5000, Number.NaN);
    const endY = clampFinite(payload.endY, -200, 2500, Number.NaN);
    const endZ = clampFinite(payload.endZ, -5000, 5000, Number.NaN);
    let directionX = Number(payload.directionX);
    let directionY = Number(payload.directionY);
    let directionZ = Number(payload.directionZ);

    if (![startX, startY, startZ, endX, endY, endZ].every(Number.isFinite)) {
        return null;
    }

    const startOffsetX = startX - (Number(playerState.x) || 0);
    const startOffsetZ = startZ - (Number(playerState.z) || 0);
    const startHorizontalDistance = Math.hypot(startOffsetX, startOffsetZ);
    if (startHorizontalDistance > WEAPON_SHOT_MAX_START_HORIZONTAL_OFFSET) {
        return null;
    }
    if (Math.abs(startY - (Number(playerState.y) || 0)) > WEAPON_SHOT_MAX_START_VERTICAL_OFFSET) {
        return null;
    }

    if (![directionX, directionY, directionZ].every(Number.isFinite)) {
        directionX = endX - startX;
        directionY = endY - startY;
        directionZ = endZ - startZ;
    }
    const directionLength = Math.hypot(directionX, directionY, directionZ);
    if (!Number.isFinite(directionLength) || directionLength <= 0.0001) {
        return null;
    }
    directionX /= directionLength;
    directionY /= directionLength;
    directionZ /= directionLength;

    const shotDistance = Math.hypot(endX - startX, endY - startY, endZ - startZ);
    if (
        !Number.isFinite(shotDistance) ||
        shotDistance < WEAPON_SHOT_MIN_DISTANCE ||
        shotDistance > WEAPON_SHOT_MAX_DISTANCE
    ) {
        return null;
    }

    return {
        startX: roundTo(startX, 4),
        startY: roundTo(startY, 4),
        startZ: roundTo(startZ, 4),
        endX: roundTo(endX, 4),
        endY: roundTo(endY, 4),
        endZ: roundTo(endZ, 4),
        directionX: roundTo(directionX, 5),
        directionY: roundTo(directionY, 5),
        directionZ: roundTo(directionZ, 5),
        speed: roundTo(clampFinite(payload.speed, 1, 1200, 182), 3),
        heat: roundTo(clampFinite(payload.heat, 0, 1, 0), 4),
        locked: Boolean(payload.locked),
    };
}

function sanitizeCollisionRelay(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const targetId =
        typeof payload.targetId === 'string'
            ? payload.targetId
                  .trim()
                  .replace(/[^\w\-]/g, '')
                  .slice(0, 128)
            : '';
    if (!targetId) {
        return null;
    }

    let normalX = Number(payload.normalX);
    let normalZ = Number(payload.normalZ);
    if (!Number.isFinite(normalX) || !Number.isFinite(normalZ)) {
        return null;
    }
    const normalLength = Math.hypot(normalX, normalZ);
    if (normalLength < 0.0001) {
        return null;
    }
    normalX /= normalLength;
    normalZ /= normalLength;

    const impactSpeed = clampFinite(payload.impactSpeed, 0, 90, 0);
    if (impactSpeed <= 0.01) {
        return null;
    }

    return {
        targetId,
        normalX: roundTo(normalX, 5),
        normalZ: roundTo(normalZ, 5),
        penetration: roundTo(clampFinite(payload.penetration, 0, 1.8, 0.04), 4),
        impactSpeed: roundTo(impactSpeed, 4),
        otherVelocityX: roundTo(clampFinite(payload.otherVelocityX, -400, 400, 0), 4),
        otherVelocityZ: roundTo(clampFinite(payload.otherVelocityZ, -400, 400, 0), 4),
        mass: roundTo(clampFinite(payload.mass, 0.4, 4, 1.6), 4),
    };
}

function sanitizeMinePlacement(payload, context) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const ownerId = sanitizeSocketLikeId(context?.ownerId);
    if (!ownerId) {
        return null;
    }

    const now = clampFinite(context?.now, 0, Number.MAX_SAFE_INTEGER, Date.now());
    const room = context?.room;
    const candidateMineId = sanitizeMineId(payload.mineId);
    const ownerScopedCandidateMineId =
        candidateMineId && candidateMineId.startsWith(`${ownerId}-`) ? candidateMineId : '';
    const hasCollisionWithExistingMineId =
        ownerScopedCandidateMineId && room?.mines?.has?.(ownerScopedCandidateMineId);
    const mineId =
        ownerScopedCandidateMineId && !hasCollisionWithExistingMineId
            ? ownerScopedCandidateMineId
            : generateServerMineId(ownerId, now);
    const triggerRadius = clampFinite(payload.triggerRadius, 0.8, 4, MINE_DEFAULT_TRIGGER_RADIUS);
    const armDelayMs = Math.round(
        clampFinite(payload.armDelayMs, 0, 4000, MINE_DEFAULT_ARM_DELAY_MS)
    );
    const ttlMs = Math.round(clampFinite(payload.ttlMs, 4000, 120000, MINE_DEFAULT_TTL_MS));

    return {
        id: mineId,
        ownerId,
        ownerName: sanitizePlayerName(context?.ownerName, 'Driver'),
        x: roundTo(clampFinite(payload.x, -5000, 5000, 0), 4),
        y: roundTo(clampFinite(payload.y, -500, 2500, 0), 4),
        z: roundTo(clampFinite(payload.z, -5000, 5000, 0), 4),
        velocityX: roundTo(clampFinite(payload.velocityX, -140, 140, 0), 4),
        velocityY: roundTo(clampFinite(payload.velocityY, -140, 140, 0), 4),
        velocityZ: roundTo(clampFinite(payload.velocityZ, -140, 140, 0), 4),
        triggerRadius: roundTo(triggerRadius, 4),
        armDelayMs,
        ttlMs,
        thrown: Boolean(payload.thrown),
        createdAt: now,
        armedAt: now + armDelayMs,
        expiresAt: now + ttlMs,
    };
}

function sanitizeMineDetonation(payload, now = Date.now()) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const mineId = sanitizeMineId(payload.mineId);
    if (!mineId) {
        return null;
    }

    return {
        mineId,
        x: clampFinite(payload.x, -5000, 5000, 0),
        y: clampFinite(payload.y, -500, 2500, 0),
        z: clampFinite(payload.z, -5000, 5000, 0),
        triggerPlayerId: sanitizeSocketLikeId(payload.triggerPlayerId),
        targetPlayerId: sanitizeSocketLikeId(payload.targetPlayerId),
        detonationType: sanitizeMineDetonationType(payload.detonationType),
        landedAt: Math.round(clampFinite(payload.landedAt, 0, Number.MAX_SAFE_INTEGER, 0)),
        serverTime: now,
    };
}

function sanitizeMineDetonationType(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'timed_throw' || normalized === 'impact_throw' ? normalized : '';
}

function sanitizeWeaponPickupId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'roof' || normalized === 'parking' ? normalized : '';
}

function sanitizeMineId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .trim()
        .replace(/[^\w\-]/g, '')
        .slice(0, MINE_ID_MAX_LENGTH);
}

function sanitizeSocketLikeId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .trim()
        .replace(/[^\w\-]/g, '')
        .slice(0, 128);
}

function serializeMine(mine) {
    if (!mine || typeof mine !== 'object') {
        return null;
    }
    return {
        mineId: mine.id,
        ownerId: mine.ownerId,
        ownerName: mine.ownerName,
        x: mine.x,
        y: mine.y,
        z: mine.z,
        velocityX: mine.velocityX,
        velocityY: mine.velocityY,
        velocityZ: mine.velocityZ,
        triggerRadius: mine.triggerRadius,
        armDelayMs: mine.armDelayMs,
        ttlMs: mine.ttlMs,
        thrown: Boolean(mine.thrown),
        createdAt: mine.createdAt,
        armedAt: mine.armedAt,
        expiresAt: mine.expiresAt,
    };
}

function pruneExpiredMines(room, now = Date.now()) {
    if (!room?.mines?.size) {
        return;
    }
    for (const [mineId, mine] of room.mines.entries()) {
        if (!mine || mine.expiresAt <= now) {
            room.mines.delete(mineId);
        }
    }
}

function enforceMineLimits(room, ownerId) {
    if (!room?.mines) {
        return;
    }

    pruneExpiredMines(room, Date.now());

    const ownerMines = Array.from(room.mines.values())
        .filter((mine) => mine.ownerId === ownerId)
        .sort((a, b) => a.createdAt - b.createdAt);
    while (ownerMines.length >= MAX_ACTIVE_MINES_PER_PLAYER) {
        const oldest = ownerMines.shift();
        if (!oldest) {
            break;
        }
        room.mines.delete(oldest.id);
    }

    const allMines = Array.from(room.mines.values()).sort((a, b) => a.createdAt - b.createdAt);
    while (allMines.length >= MAX_ACTIVE_MINES_PER_ROOM) {
        const oldest = allMines.shift();
        if (!oldest) {
            break;
        }
        room.mines.delete(oldest.id);
    }
}

function sanitizeCrashReplication(value, fallback) {
    const source = value && typeof value === 'object' ? value : fallback;
    if (!source || typeof source !== 'object') {
        return {
            detachedPartIds: [],
            debrisPieces: [],
            explosion: null,
        };
    }

    const detachedRaw = Array.isArray(source.detachedPartIds) ? source.detachedPartIds : [];
    const detachedPartIds = detachedRaw
        .slice(0, MAX_DETACHED_PART_IDS)
        .map((partId) =>
            String(partId || '')
                .trim()
                .slice(0, 64)
        )
        .filter(Boolean);

    const debrisRaw = Array.isArray(source.debrisPieces) ? source.debrisPieces : [];
    const debrisPieces = [];
    for (let i = 0; i < debrisRaw.length && debrisPieces.length < MAX_DEBRIS_PIECES; i += 1) {
        const piece = sanitizeDebrisPiece(debrisRaw[i]);
        if (piece) {
            debrisPieces.push(piece);
        }
    }

    return {
        detachedPartIds,
        debrisPieces,
        explosion: sanitizeExplosionState(source.explosion),
    };
}

function sanitizeDebrisPiece(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const id = Math.max(1, Math.round(clampFinite(value.id, 1, 10_000_000, 0)));
    const partId = String(value.partId || '')
        .trim()
        .slice(0, 64);
    if (!id || !partId) {
        return null;
    }

    return {
        id,
        partId,
        x: roundTo(clampFinite(value.x, -5000, 5000, 0), 4),
        y: roundTo(clampFinite(value.y, -500, 2500, 0), 4),
        z: roundTo(clampFinite(value.z, -5000, 5000, 0), 4),
        rotationX: roundTo(clampFinite(value.rotationX, -Math.PI * 8, Math.PI * 8, 0), 4),
        rotationY: roundTo(clampFinite(value.rotationY, -Math.PI * 8, Math.PI * 8, 0), 4),
        rotationZ: roundTo(clampFinite(value.rotationZ, -Math.PI * 8, Math.PI * 8, 0), 4),
        velocityX: roundTo(clampFinite(value.velocityX, -600, 600, 0), 4),
        velocityY: roundTo(clampFinite(value.velocityY, -600, 600, 0), 4),
        velocityZ: roundTo(clampFinite(value.velocityZ, -600, 600, 0), 4),
        angularVelocityX: roundTo(clampFinite(value.angularVelocityX, -80, 80, 0), 4),
        angularVelocityY: roundTo(clampFinite(value.angularVelocityY, -80, 80, 0), 4),
        angularVelocityZ: roundTo(clampFinite(value.angularVelocityZ, -80, 80, 0), 4),
        groundOffset: roundTo(clampFinite(value.groundOffset, 0.01, 4, 0.1), 4),
        drag: roundTo(clampFinite(value.drag, 0, 50, 0), 4),
        bounce: roundTo(clampFinite(value.bounce, 0, 4, 0.3), 4),
        settled: Boolean(value.settled),
        life: Number.isFinite(value.life) ? roundTo(clampFinite(value.life, 0, 120, 0), 4) : null,
        wheelRoll: sanitizeWheelRollState(value.wheelRoll),
        bodyRest: sanitizeBodyRestState(value.bodyRest),
    };
}

function sanitizeWheelRollState(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return {
        drive: roundTo(clampFinite(value.drive, 0, 20, 0), 4),
        heading: roundTo(clampFinite(value.heading, -Math.PI * 16, Math.PI * 16, 0), 4),
        turnRate: roundTo(clampFinite(value.turnRate, -40, 40, 0), 4),
        wobblePhase: roundTo(clampFinite(value.wobblePhase, -Math.PI * 16, Math.PI * 16, 0), 4),
        wobbleRate: roundTo(clampFinite(value.wobbleRate, 0, 80, 0), 4),
        decel: roundTo(clampFinite(value.decel, 0, 40, 0), 4),
        spin: roundTo(clampFinite(value.spin, 0, 120, 0), 4),
        restPose: value.restPose === 'flat' ? 'flat' : 'upright',
        restYaw: roundTo(clampFinite(value.restYaw, -Math.PI * 16, Math.PI * 16, 0), 4),
    };
}

function sanitizeBodyRestState(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return {
        yaw: roundTo(clampFinite(value.yaw, -Math.PI * 16, Math.PI * 16, 0), 4),
    };
}

function sanitizeExplosionState(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return {
        x: roundTo(clampFinite(value.x, -5000, 5000, 0), 4),
        y: roundTo(clampFinite(value.y, -500, 2500, 0), 4),
        z: roundTo(clampFinite(value.z, -5000, 5000, 0), 4),
        life: roundTo(clampFinite(value.life, 0, 2, 0), 4),
    };
}

function clampFinite(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, numeric));
}

function roundTo(value, decimals) {
    const power = 10 ** decimals;
    return Math.round(value * power) / power;
}

function normalizeAngle(value) {
    const fullTurn = Math.PI * 2;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return ((((numeric + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
}
