require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const http = require('http');
const os = require('os');
const path = require('path');
const Stripe = require('stripe');
const { Server } = require('socket.io');
const { createAudioPrefsStore, ensureAudioPrefsSchema } = require('./audio-prefs-store');
const {
    createBillboardContentStore,
    ensureBillboardContentSchema,
} = require('./billboard-content-store');
const {
    createGarageWrapPresetStore,
    ensureGarageWrapPresetSchema,
} = require('./garage-wrap-presets-store');
const {
    createShowroomIntroVideoStore,
    ensureShowroomIntroVideoSchema,
} = require('./showroom-intro-video-store');
const {
    createLeaderboardStore,
    ensureLeaderboardSchema,
    sanitizeLeaderboardLimit,
} = require('./leaderboard-store');
const {
    PlayerEconomySyncError,
    createPlayerEconomyStore,
    ensurePlayerEconomySchema,
} = require('./player-economy-store');
const { consumeRateLimit } = require('./rate-limit');
const { validateCollisionRelay } = require('./collision-guard');
const {
    applySupabaseStorageAvailability,
    buildSupabasePublicConfig,
    createSupabaseServiceClient,
    listSupabasePublicAuthConfigGaps,
    resolveSupabaseConnectOrigin,
    resolveSupabaseRuntimeConfig,
    sanitizeSupabaseStorageBucketName,
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
const { AccountDeletionError, deleteAccount } = require('./account-deletion');
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
const PLAYER_VEHICLE_ID_MAX_LENGTH = 32;
const PLAYER_WHEEL_PRESET_ID_MAX_LENGTH = 32;
const DEFAULT_PLAYER_SKIN_ID = 'midnight-comet';
const DEFAULT_PLAYER_VEHICLE_ID = 'voltline-sled';
const DEFAULT_UNLOCKED_VEHICLE_IDS = Object.freeze([DEFAULT_PLAYER_VEHICLE_ID]);
const DEFAULT_PLAYER_WHEEL_PRESET_ID = 'scarlet-switchblade';
const DEFAULT_UNLOCKED_WHEEL_PRESET_IDS = Object.freeze([
    'scarlet-switchblade',
    'photon-turbine',
    'obsidian-halo',
]);
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
const STEALTH_PICKUP_ID = 'central-plaza-stealth';
const STEALTH_PICKUP_X = 0;
const STEALTH_PICKUP_Z = 16.5;
const STEALTH_PICKUP_COLLECT_RADIUS = 4.8;
const STEALTH_PICKUP_RESPAWN_DELAY_MS = 12_000;
const STEALTH_PICKUP_DURATION_MS = 9_000;
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
const PLAYER_CREDITS_PURCHASE_AMOUNT_CENTS = 100;
const PLAYER_CREDITS_PURCHASE_GRANT = 1500;
const PLAYER_CREDITS_PURCHASE_PACK_ID = 'credits-pack-1500';
const PLAYER_CREDITS_PURCHASE_PRODUCT_NAME = sanitizeCheckoutText(
    process.env.STRIPE_CREDITS_PRODUCT_NAME ||
        `${PLAYER_CREDITS_PURCHASE_GRANT} Minefield Drift Credits`
);
const STRIPE_SECRET_KEY = sanitizeStripeSecretKey(process.env.STRIPE_SECRET_KEY || '');
const STRIPE_WEBHOOK_SECRET = sanitizeStripeWebhookSecret(process.env.STRIPE_WEBHOOK_SECRET || '');
const stripeClient = createStripeClient(STRIPE_SECRET_KEY);
const donateSessionStore = createDonationSessionStore();
const BILLBOARD_CONTENT_ADMIN_TOKEN = sanitizeAdminToken(
    process.env.BILLBOARD_CONTENT_ADMIN_TOKEN || ''
);
const BILLBOARD_EDITOR_USER_IDS = parseSupabaseUserIdAllowlist(
    process.env.BILLBOARD_EDITOR_USER_IDS || ''
);
const GA_MEASUREMENT_ID = sanitizeGaMeasurementId(
    process.env.GA_MEASUREMENT_ID || process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID || ''
);
const supabaseRuntimeConfig = resolveSupabaseRuntimeConfig(process.env);
const supabaseServiceClient = createSupabaseServiceClient(supabaseRuntimeConfig);
const leaderboardStore = createLeaderboardStore(supabaseRuntimeConfig);
const playerEconomyStore = createPlayerEconomyStore(supabaseRuntimeConfig);
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
const HTTP_IMG_SRC_VALUES = [
    "'self'",
    'data:',
    'blob:',
    'https://www.google-analytics.com',
    'https://stats.g.doubleclick.net',
];
const HTTP_MEDIA_SRC_VALUES = ["'self'", 'data:', 'blob:'];
if (SUPABASE_CONNECT_ORIGIN) {
    HTTP_CONNECT_SRC_VALUES.push(SUPABASE_CONNECT_ORIGIN);
    HTTP_IMG_SRC_VALUES.push(SUPABASE_CONNECT_ORIGIN);
    HTTP_MEDIA_SRC_VALUES.push(SUPABASE_CONNECT_ORIGIN);
}
const HTTP_CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    `img-src ${Array.from(new Set(HTTP_IMG_SRC_VALUES)).join(' ')}`,
    `media-src ${Array.from(new Set(HTTP_MEDIA_SRC_VALUES)).join(' ')}`,
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
const HTTP_PLAYER_ECONOMY_READ_WINDOW_MS = 10_000;
const HTTP_PLAYER_ECONOMY_READ_MAX = 60;
const HTTP_PLAYER_ECONOMY_SYNC_WINDOW_MS = 60_000;
const HTTP_PLAYER_ECONOMY_SYNC_MAX = 30;
const HTTP_PLAYER_ECONOMY_PURCHASE_WINDOW_MS = 5 * 60_000;
const HTTP_PLAYER_ECONOMY_PURCHASE_MAX = 8;
const HTTP_PLAYER_ECONOMY_PURCHASE_VERIFY_WINDOW_MS = 60_000;
const HTTP_PLAYER_ECONOMY_PURCHASE_VERIFY_MAX = 20;
const LIVE_LEADERBOARD_BROADCAST_TOP_LIMIT = 10;
const LIVE_LEADERBOARD_BROADCAST_WINDOW_RADIUS = 2;
const LIVE_LEADERBOARD_BROADCAST_DEBOUNCE_MS = 180;
const ONLINE_AUTH_REQUIRED_ERROR = 'Sign in is required for online rooms.';
const ONLINE_AUTH_SERVER_ERROR = 'Online auth is not configured on this server.';
const USER_STORAGE_LIST_LIMIT = 100;
const SUPABASE_STORAGE_AVAILABILITY_CACHE_TTL_MS = 60_000;

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
    'mp:stealthPickupCollected': { windowMs: 1000, max: 8 },
    'mp:environmentState': { windowMs: 1000, max: 24 },
    'mp:crashReplication': { windowMs: 1000, max: 8 },
    'mp:vehicleStatus': { windowMs: 1000, max: 12 },
    'mp:weaponShot': { windowMs: 1000, max: 24 },
};

const app = express();
const server = http.createServer(app);
const audioPrefsStore = createAudioPrefsStore(supabaseRuntimeConfig);
const garageWrapPresetStore = createGarageWrapPresetStore({
    manifestFilePath: path.join(__dirname, 'data/garage-wrap-presets.json'),
    uploadsDirectoryPath: path.join(__dirname, '../public/uploads/garage-wrap-presets'),
    supabaseConfig: supabaseRuntimeConfig,
});
const billboardContentStore = createBillboardContentStore({
    manifestFilePath: path.join(__dirname, 'data/billboard-content.json'),
    uploadsDirectoryPath: path.join(__dirname, '../public/uploads/billboards'),
    supabaseConfig: supabaseRuntimeConfig,
});
const showroomIntroVideoStore = createShowroomIntroVideoStore({
    manifestFilePath: path.join(__dirname, 'data/showroom-intro-video.json'),
    uploadsDirectoryPath: path.join(__dirname, '../public/uploads/showroom-intro'),
    defaultVideoFilePath: path.join(__dirname, '../public/assets/Demo/Demo.mp4'),
    supabaseConfig: supabaseRuntimeConfig,
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
let supabaseStorageAvailabilityCache = null;
let supabaseStorageAvailabilityCacheExpiresAt = 0;
let supabaseStorageAvailabilityRefreshPromise = null;
let lastSupabaseStorageAvailabilityWarning = '';
let pendingGlobalLeaderboardBroadcastReason = 'update';
let globalLeaderboardBroadcastTimer = null;

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
app.post(
    '/api/donate/stripe-webhook',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
        await handleStripeDonateWebhook(req, res);
    }
);
app.get('/api/billboard-content', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const editorAccess = await resolveBillboardEditorAccess(req);
        const manifest = await billboardContentStore.readManifest();
        res.json({
            ok: true,
            manifest,
            canEdit: Boolean(editorAccess.canEdit),
            editorStatusText: editorAccess.statusText,
            storageMode:
                typeof billboardContentStore.getStorageMode === 'function'
                    ? billboardContentStore.getStorageMode()
                    : 'local',
        });
    } catch (error) {
        console.error('Billboard content manifest read failed:', error);
        res.status(500).json({
            ok: false,
            error: 'Could not read billboard content manifest.',
        });
    }
});
app.get('/api/audio-prefs/defaults', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const config = await audioPrefsStore.readConfig();
        res.json({
            ok: true,
            canEditDefaults:
                audioPrefsStore.isConfigured() &&
                Boolean(config?.canPersist) &&
                isAudioPrefsAdminAuthorized(req),
            defaults: config.prefs,
            updatedAt: config.updatedAt,
        });
    } catch (error) {
        console.error('Audio defaults read failed:', error);
        res.status(500).json({
            ok: false,
            error: 'Could not read audio defaults.',
        });
    }
});
app.post('/api/audio-prefs/defaults', express.json({ limit: '16kb' }), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!isAudioPrefsAdminAuthorized(req)) {
        res.status(403).json({
            ok: false,
            error: 'Audio defaults admin access denied.',
        });
        return;
    }
    if (!audioPrefsStore.isConfigured()) {
        res.status(503).json({
            ok: false,
            error: 'Audio defaults persistence is not configured on this server.',
        });
        return;
    }

    try {
        const config = await audioPrefsStore.writePrefs(req.body);
        res.json({
            ok: true,
            defaults: config.prefs,
            updatedAt: config.updatedAt,
        });
    } catch (error) {
        console.error('Audio defaults save failed:', error);
        res.status(500).json({
            ok: false,
            error: 'Could not save audio defaults.',
        });
    }
});
app.post('/api/billboard-content/:groupId', express.json({ limit: '512mb' }), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const editorAccess = await resolveBillboardEditorAccess(req);
    if (!editorAccess.canEdit) {
        res.status(403).json({
            ok: false,
            error: editorAccess.statusText || 'Billboard editor access denied.',
        });
        return;
    }

    try {
        const result = await billboardContentStore.writeGroupMedia(req.params?.groupId, req.body, {
            userId: editorAccess.authIdentity?.userId || '',
        });
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
app.get('/api/garage-wrap-presets', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    try {
        const config = await garageWrapPresetStore.readConfig();
        res.json({
            ok: true,
            ...config,
        });
    } catch (error) {
        console.error('Garage wrap preset config read failed:', error);
        res.status(500).json({
            ok: false,
            error: 'Could not read garage wrap presets.',
        });
    }
});
app.post(
    '/api/garage-wrap-presets',
    express.raw({ type: () => true, limit: '32mb' }),
    async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        if (!isBillboardContentAdminAuthorized(req)) {
            res.status(403).json({
                ok: false,
                error: 'Garage wrap preset admin access denied.',
            });
            return;
        }

        try {
            const rawNameHeader = Array.isArray(req.headers?.['x-upload-filename'])
                ? req.headers['x-upload-filename'][0]
                : req.headers?.['x-upload-filename'] || '';
            const config = await garageWrapPresetStore.createPresetImage({
                buffer: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
                mimeType: req.headers?.['content-type'] || '',
                originalFileName: safelyDecodeUploadFileName(rawNameHeader),
            });
            res.json({
                ok: true,
                ...config,
            });
        } catch (error) {
            const statusCode = resolveHttpStatusCode(error?.statusCode);
            if (statusCode >= 500) {
                console.error('Garage wrap preset creation failed:', error);
            }
            res.status(statusCode).json({
                ok: false,
                error: error?.message || 'Garage wrap preset creation failed.',
            });
        }
    }
);
app.post(
    '/api/garage-wrap-presets/:presetId',
    express.raw({ type: () => true, limit: '32mb' }),
    async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        if (!isBillboardContentAdminAuthorized(req)) {
            res.status(403).json({
                ok: false,
                error: 'Garage wrap preset admin access denied.',
            });
            return;
        }

        try {
            const rawNameHeader = Array.isArray(req.headers?.['x-upload-filename'])
                ? req.headers['x-upload-filename'][0]
                : req.headers?.['x-upload-filename'] || '';
            const config = await garageWrapPresetStore.writePresetImage(req.params?.presetId, {
                buffer: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
                mimeType: req.headers?.['content-type'] || '',
                originalFileName: safelyDecodeUploadFileName(rawNameHeader),
            });
            res.json({
                ok: true,
                ...config,
            });
        } catch (error) {
            const statusCode = resolveHttpStatusCode(error?.statusCode);
            if (statusCode >= 500) {
                console.error('Garage wrap preset upload failed:', error);
            }
            res.status(statusCode).json({
                ok: false,
                error: error?.message || 'Garage wrap preset upload failed.',
            });
        }
    }
);
app.get('/api/showroom-intro-video', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    try {
        const video = await showroomIntroVideoStore.readConfig();
        res.json({
            ok: true,
            video,
        });
    } catch (error) {
        console.error('Showroom intro video config read failed:', error);
        res.status(500).json({
            ok: false,
            error: 'Could not read showroom intro video config.',
        });
    }
});
app.post(
    '/api/showroom-intro-video',
    express.raw({ type: () => true, limit: '320mb' }),
    async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        if (!isBillboardContentAdminAuthorized(req)) {
            res.status(403).json({
                ok: false,
                error: 'Showroom intro admin access denied.',
            });
            return;
        }

        try {
            const rawNameHeader = Array.isArray(req.headers?.['x-upload-filename'])
                ? req.headers['x-upload-filename'][0]
                : req.headers?.['x-upload-filename'] || '';
            const video = await showroomIntroVideoStore.writeUploadedVideo({
                buffer: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
                mimeType: req.headers?.['content-type'] || '',
                originalFileName: safelyDecodeUploadFileName(rawNameHeader),
            });
            res.json({
                ok: true,
                video,
            });
        } catch (error) {
            const statusCode = resolveHttpStatusCode(error?.statusCode);
            if (statusCode >= 500) {
                console.error('Showroom intro video upload failed:', error);
            }
            res.status(statusCode).json({
                ok: false,
                error: error?.message || 'Showroom intro video upload failed.',
            });
        }
    }
);
app.delete('/api/showroom-intro-video', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!isBillboardContentAdminAuthorized(req)) {
        res.status(403).json({
            ok: false,
            error: 'Showroom intro admin access denied.',
        });
        return;
    }

    try {
        const result = await showroomIntroVideoStore.resetVideo();
        res.json({
            ok: true,
            removed: Boolean(result.removed),
            video: result.video,
        });
    } catch (error) {
        const statusCode = resolveHttpStatusCode(error?.statusCode);
        if (statusCode >= 500) {
            console.error('Showroom intro video reset failed:', error);
        }
        res.status(statusCode).json({
            ok: false,
            error: error?.message || 'Showroom intro video reset failed.',
        });
    }
});
app.delete('/api/billboard-content/:groupId', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const editorAccess = await resolveBillboardEditorAccess(req);
    if (!editorAccess.canEdit) {
        res.status(403).json({
            ok: false,
            error: editorAccess.statusText || 'Billboard editor access denied.',
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
app.delete('/api/garage-wrap-presets/:presetId', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!isBillboardContentAdminAuthorized(req)) {
        res.status(403).json({
            ok: false,
            error: 'Garage wrap preset admin access denied.',
        });
        return;
    }

    try {
        const result = await garageWrapPresetStore.removePreset(req.params?.presetId);
        res.json({
            ok: true,
            removed: Boolean(result.removed),
            presets: Array.isArray(result.presets) ? result.presets : [],
        });
    } catch (error) {
        const statusCode = resolveHttpStatusCode(error?.statusCode);
        if (statusCode >= 500) {
            console.error('Garage wrap preset removal failed:', error);
        }
        res.status(statusCode).json({
            ok: false,
            error: error?.message || 'Garage wrap preset removal failed.',
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

app.get('/api/public-config', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const storageAvailability = await resolveSupabaseStorageAvailability();
    res.json({
        ok: true,
        analytics: {
            gaMeasurementId: GA_MEASUREMENT_ID || null,
        },
        supabase: applySupabaseStorageAvailability(SUPABASE_PUBLIC_CONFIG, storageAvailability),
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

        const deletionSummary = await deleteAccount({
            userId: authIdentity.userId,
            deleteLeaderboardEntries: leaderboardStore.isConfigured()
                ? async (userId) => leaderboardStore.deleteEntriesByUserId(userId)
                : null,
            deleteEconomyProfile: playerEconomyStore.isConfigured()
                ? async (userId) => playerEconomyStore.deleteProfileByUserId(userId)
                : null,
            deleteProfileImages: async (userId) => deleteStoredProfileImagesForUser(userId),
            deleteCarWraps: async (userId) => deleteStoredCarWrapsForUser(userId),
            deleteAuthUser: async (userId) => {
                const { error } = await supabaseServiceClient.auth.admin.deleteUser(userId);
                if (error) {
                    throw error;
                }
            },
        });

        res.json({
            ok: true,
            ...deletionSummary,
        });
    } catch (error) {
        console.error('Supabase account deletion failed:', error);
        res.status(502).json({
            ok: false,
            error: resolveAccountDeletionFailureMessage(error),
        });
    }
});

app.get('/api/player-economy/profile', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!playerEconomyStore.isConfigured()) {
        res.status(503).json({
            ok: false,
            error: 'Player wallet sync is not configured on this server.',
        });
        return;
    }
    if (
        !consumeHttpRequestQuota(
            req,
            'player-economy-read',
            HTTP_PLAYER_ECONOMY_READ_WINDOW_MS,
            HTTP_PLAYER_ECONOMY_READ_MAX
        )
    ) {
        res.status(429).json({
            ok: false,
            error: 'Too many wallet requests. Try again shortly.',
        });
        return;
    }

    try {
        const authIdentity = await resolveAuthenticatedRequestIdentity(req);
        if (!authIdentity?.userId) {
            res.status(401).json({
                ok: false,
                error: 'Sign in before loading wallet progress.',
            });
            return;
        }

        const profile = await playerEconomyStore.readProfileByUserId(authIdentity.userId);
        res.json({
            ok: true,
            profile,
        });
    } catch (error) {
        console.error('Player economy profile read failed:', error);
        res.status(502).json({
            ok: false,
            error: 'Could not load wallet progress right now.',
        });
    }
});

app.post('/api/player-economy/sync', express.json({ limit: '64kb' }), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!playerEconomyStore.isConfigured()) {
        res.status(503).json({
            ok: false,
            error: 'Player wallet sync is not configured on this server.',
        });
        return;
    }
    if (
        !consumeHttpRequestQuota(
            req,
            'player-economy-sync',
            HTTP_PLAYER_ECONOMY_SYNC_WINDOW_MS,
            HTTP_PLAYER_ECONOMY_SYNC_MAX
        )
    ) {
        res.status(429).json({
            ok: false,
            error: 'Too many wallet sync attempts. Try again shortly.',
        });
        return;
    }

    try {
        const authIdentity = await resolveAuthenticatedRequestIdentity(req);
        if (!authIdentity?.userId) {
            res.status(401).json({
                ok: false,
                error: 'Sign in before syncing wallet progress.',
            });
            return;
        }

        const profile = await playerEconomyStore.syncProfileByUserId(authIdentity.userId, req.body);
        res.json({
            ok: true,
            profile,
        });
    } catch (error) {
        if (error instanceof PlayerEconomySyncError) {
            res.status(error.statusCode || 400).json({
                ok: false,
                error: error.message,
                reason: error.reason,
            });
            return;
        }
        console.error('Player economy sync failed:', error);
        res.status(502).json({
            ok: false,
            error: 'Could not sync wallet progress right now.',
        });
    }
});

app.post(
    '/api/player-economy/credits-checkout-session',
    express.json({ limit: '16kb' }),
    async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        if (!stripeClient) {
            res.status(503).json({
                ok: false,
                error: 'Credits checkout is not configured on this server.',
            });
            return;
        }
        if (!playerEconomyStore.isConfigured()) {
            res.status(503).json({
                ok: false,
                error: 'Player wallet sync is not configured on this server.',
            });
            return;
        }
        if (
            !consumeHttpRequestQuota(
                req,
                'player-economy-purchase',
                HTTP_PLAYER_ECONOMY_PURCHASE_WINDOW_MS,
                HTTP_PLAYER_ECONOMY_PURCHASE_MAX
            )
        ) {
            res.status(429).json({
                ok: false,
                error: 'Too many checkout attempts. Try again shortly.',
            });
            return;
        }

        try {
            const authIdentity = await resolveAuthenticatedRequestIdentity(req);
            if (!authIdentity?.userId) {
                res.status(401).json({
                    ok: false,
                    error: 'Sign in before buying credits.',
                });
                return;
            }

            const checkoutBaseUrl = resolveDonateBaseUrl(req);
            const successUrl = createCreditsPurchaseReturnUrl(checkoutBaseUrl, 'success', {
                includeSessionId: true,
            });
            const cancelUrl = createCreditsPurchaseReturnUrl(checkoutBaseUrl, 'cancel');
            if (!successUrl || !cancelUrl) {
                res.status(500).json({
                    ok: false,
                    error: 'Could not determine checkout return URL.',
                });
                return;
            }

            const checkoutSession = await stripeClient.checkout.sessions.create({
                mode: 'payment',
                locale: 'en',
                payment_method_types: ['card'],
                client_reference_id: authIdentity.userId,
                customer_email: authIdentity.email || undefined,
                line_items: [
                    {
                        quantity: 1,
                        price_data: {
                            currency: DONATE_CURRENCY,
                            unit_amount: PLAYER_CREDITS_PURCHASE_AMOUNT_CENTS,
                            product_data: {
                                name: PLAYER_CREDITS_PURCHASE_PRODUCT_NAME,
                            },
                        },
                    },
                ],
                success_url: successUrl,
                cancel_url: cancelUrl,
                metadata: {
                    integration: 'minefield-drift',
                    checkoutPurpose: 'credits-purchase',
                    purchasePackId: PLAYER_CREDITS_PURCHASE_PACK_ID,
                    userId: authIdentity.userId,
                    creditsAmount: String(PLAYER_CREDITS_PURCHASE_GRANT),
                    amountCents: String(PLAYER_CREDITS_PURCHASE_AMOUNT_CENTS),
                    currencyCode: DONATE_CURRENCY,
                },
            });
            if (typeof checkoutSession?.url !== 'string' || !checkoutSession.url) {
                throw new Error('Stripe did not return a checkout URL.');
            }

            res.status(201).json({
                ok: true,
                sessionId: checkoutSession.id,
                checkoutUrl: checkoutSession.url,
                pack: {
                    creditsGranted: PLAYER_CREDITS_PURCHASE_GRANT,
                    amountCents: PLAYER_CREDITS_PURCHASE_AMOUNT_CENTS,
                    currency: DONATE_CURRENCY,
                },
            });
        } catch (error) {
            console.error('Credits checkout session creation failed:', error);
            res.status(502).json({
                ok: false,
                error: 'Could not start secure credits checkout. Try again.',
            });
        }
    }
);

app.get('/api/player-economy/credits-session-status', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!stripeClient) {
        res.status(503).json({
            ok: false,
            error: 'Credits checkout is not configured on this server.',
        });
        return;
    }
    if (!playerEconomyStore.isConfigured()) {
        res.status(503).json({
            ok: false,
            error: 'Player wallet sync is not configured on this server.',
        });
        return;
    }
    if (
        !consumeHttpRequestQuota(
            req,
            'player-economy-purchase-verify',
            HTTP_PLAYER_ECONOMY_PURCHASE_VERIFY_WINDOW_MS,
            HTTP_PLAYER_ECONOMY_PURCHASE_VERIFY_MAX
        )
    ) {
        res.status(429).json({
            ok: false,
            error: 'Too many checkout verification requests. Try again shortly.',
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

    try {
        const authIdentity = await resolveAuthenticatedRequestIdentity(req);
        if (!authIdentity?.userId) {
            res.status(401).json({
                ok: false,
                error: 'Sign in before verifying a credits purchase.',
            });
            return;
        }

        const checkoutSession = await stripeClient.checkout.sessions.retrieve(checkoutSessionId);
        if (!isCreditsPurchaseCheckoutSession(checkoutSession)) {
            res.status(404).json({
                ok: false,
                error: 'Credits checkout session was not found.',
            });
            return;
        }

        const purchase = normalizeCreditsPurchaseFromCheckoutSession(checkoutSession);
        if (!purchase?.userId || purchase.userId !== authIdentity.userId) {
            res.status(403).json({
                ok: false,
                error: 'This credits checkout does not belong to the signed-in account.',
            });
            return;
        }

        const status = resolveCreditsPurchaseCheckoutStatus(checkoutSession);
        let purchaseResult = null;
        if (status === 'paid') {
            purchaseResult = await playerEconomyStore.applyCreditsPurchaseByUserId(
                authIdentity.userId,
                purchase
            );
        }

        res.json({
            ok: true,
            sessionId: checkoutSessionId,
            status,
            paid: status === 'paid',
            final: isCreditsPurchaseStatusFinal(status),
            applied: Boolean(purchaseResult?.applied),
            creditsGranted: purchase.creditsAmount,
            amountCents: purchase.amountCents,
            currency: purchase.currencyCode,
            profile: purchaseResult?.profile || null,
        });
    } catch (error) {
        console.error('Credits checkout session verification failed:', error);
        res.status(502).json({
            ok: false,
            error: 'Could not verify credits checkout. Try again shortly.',
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
            avatarPath: authIdentity.avatarPath || '',
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
        scheduleGlobalLeaderboardBroadcast('round-result');
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
            const { unlockedVehicleIds, unlockedWheelPresetIds } =
                await resolveUnlockedGarageIdsForAuthIdentity(authIdentity);
            const profile = resolveProfile(
                payload?.profile,
                createAuthenticatedProfile(authIdentity, socket.id),
                socket.id,
                authIdentity,
                unlockedVehicleIds,
                unlockedWheelPresetIds
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
                stealthPickup: createRoomStealthPickupState(),
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

            const { unlockedVehicleIds, unlockedWheelPresetIds } =
                await resolveUnlockedGarageIdsForAuthIdentity(authIdentity);
            const profile = resolveProfile(
                payload?.profile,
                createAuthenticatedProfile(authIdentity, socket.id),
                socket.id,
                authIdentity,
                unlockedVehicleIds,
                unlockedWheelPresetIds
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

    socket.on('mp:updateProfile', async (payload) => {
        if (!consumeInboundEventQuota(socket, 'mp:updateProfile')) {
            return;
        }
        const { unlockedVehicleIds, unlockedWheelPresetIds } =
            await resolveUnlockedGarageIdsForAuthIdentity(socket.data.authIdentity);
        const profile = resolveProfile(
            payload,
            socket.data.profile,
            socket.id,
            socket.data.authIdentity,
            unlockedVehicleIds,
            unlockedWheelPresetIds
        );
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
        player.vehicleId = profile.vehicleId;
        player.skinId = profile.skinId;
        player.wheelPresetId = profile.wheelPresetId;
        player.carWrapPath = profile.carWrapPath;
        player.carWrapUrl = profile.carWrapUrl;
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
        const stealthExpiresAt = getPlayerStealthExpiresAt(player, now);
        sanitizedState.stealthActive = stealthExpiresAt > now;
        sanitizedState.stealthExpiresAt = stealthExpiresAt;
        sanitizedState.stealthDurationMs = stealthExpiresAt > now ? STEALTH_PICKUP_DURATION_MS : 0;

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
            player.lastState.weaponMode = 'weapon';
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

    socket.on('mp:stealthPickupCollected', (payload, ack) => {
        if (!consumeInboundEventQuota(socket, 'mp:stealthPickupCollected')) {
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
        const pickupId = sanitizeStealthPickupId(payload?.pickupId);
        if (!pickupId) {
            safeAck(ack, {
                ok: false,
                error: 'Invalid pickup',
            });
            return;
        }

        const pickupState = syncRoomStealthPickupState(room, now);
        const activeStealthExpiresAt = getPlayerStealthExpiresAt(player, now);
        if (activeStealthExpiresAt > now) {
            safeAck(ack, {
                ok: false,
                error: 'Stealth active',
                pickup: serializeRoomStealthPickupState(pickupState),
                stealthExpiresAt: activeStealthExpiresAt,
                stealthDurationMs: STEALTH_PICKUP_DURATION_MS,
            });
            return;
        }

        if (!pickupState.available) {
            safeAck(ack, {
                ok: false,
                error: 'Pickup unavailable',
                pickup: serializeRoomStealthPickupState(pickupState),
            });
            return;
        }

        const playerX = Number(player.lastState?.x);
        const playerZ = Number(player.lastState?.z);
        if (!Number.isFinite(playerX) || !Number.isFinite(playerZ)) {
            safeAck(ack, {
                ok: false,
                error: 'Player state unavailable',
                pickup: serializeRoomStealthPickupState(pickupState),
            });
            return;
        }

        const distanceToPickup = Math.hypot(playerX - pickupState.x, playerZ - pickupState.z);
        if (distanceToPickup > STEALTH_PICKUP_COLLECT_RADIUS) {
            safeAck(ack, {
                ok: false,
                error: 'Pickup too far',
                pickup: serializeRoomStealthPickupState(pickupState),
            });
            return;
        }

        pickupState.available = false;
        pickupState.collectedAt = now;
        pickupState.collectedByPlayerId = socket.id;
        pickupState.respawnAt = now + STEALTH_PICKUP_RESPAWN_DELAY_MS;
        pickupState.updatedAt = now;
        player.stealthExpiresAt = now + STEALTH_PICKUP_DURATION_MS;
        if (player.lastState && typeof player.lastState === 'object') {
            player.lastState.stealthActive = true;
            player.lastState.stealthExpiresAt = player.stealthExpiresAt;
        }
        room.updatedAt = now;

        emitRoomState(room);
        safeAck(ack, {
            ok: true,
            pickup: serializeRoomStealthPickupState(pickupState),
            stealthExpiresAt: player.stealthExpiresAt,
            stealthDurationMs: STEALTH_PICKUP_DURATION_MS,
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
    await initializeSupabaseAudioPrefsSchema();
    await initializeSupabaseGarageWrapPresetSchema();
    await initializeSupabaseBillboardContentSchema();
    await initializeSupabaseShowroomIntroVideoSchema();
    await initializeSupabaseLeaderboardSchema();
    await initializeSupabasePlayerEconomySchema();
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
        if (audioPrefsStore.isConfigured()) {
            console.log('Supabase audio defaults API is enabled.');
        }
        if (garageWrapPresetStore.isConfigured?.()) {
            console.log('Supabase garage wrap presets API is enabled.');
        }
        if (billboardContentStore.isConfigured?.()) {
            console.log('Supabase billboard media API is enabled.');
        }
        if (showroomIntroVideoStore.isConfigured?.()) {
            console.log('Supabase showroom intro video API is enabled.');
        }
        if (playerEconomyStore.isConfigured()) {
            console.log('Supabase player economy API is enabled.');
        }
        if (!supabaseRuntimeConfig.publicEnabled) {
            const publicAuthConfigGaps = listSupabasePublicAuthConfigGaps(supabaseRuntimeConfig);
            const publicAuthGapSummary = publicAuthConfigGaps.length
                ? ` Missing or invalid env vars: ${publicAuthConfigGaps.join(', ')}.`
                : '';
            console.warn(
                `Supabase public auth is disabled. Browser sign-in and player account sync will be unavailable.${publicAuthGapSummary}`
            );
        } else if (!supabaseServiceClient) {
            console.warn(
                'Supabase public auth is enabled, but server-side token validation is not.'
            );
        }
    });
}

async function initializeSupabaseAudioPrefsSchema() {
    if (!audioPrefsStore.isConfigured()) {
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
            'Supabase audio defaults are enabled, but no DB connection string is available for automatic schema bootstrap.'
        );
        return;
    }

    let lastError = null;
    for (let index = 0; index < bootstrapConnectionStrings.length; index += 1) {
        try {
            await ensureAudioPrefsSchema({
                connectionString: bootstrapConnectionStrings[index],
            });
            return;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        console.error('Supabase audio defaults schema bootstrap failed:', lastError);
    }
}

async function initializeSupabaseBillboardContentSchema() {
    if (!billboardContentStore.isConfigured?.()) {
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
            'Supabase billboard media is enabled, but no DB connection string is available for automatic schema bootstrap.'
        );
        return;
    }

    let lastError = null;
    for (let index = 0; index < bootstrapConnectionStrings.length; index += 1) {
        try {
            await ensureBillboardContentSchema({
                connectionString: bootstrapConnectionStrings[index],
            });
            return;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        console.error('Supabase billboard media schema bootstrap failed:', lastError);
    }
}

async function initializeSupabaseGarageWrapPresetSchema() {
    if (!garageWrapPresetStore.isConfigured?.()) {
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
            'Supabase garage wrap presets are enabled, but no DB connection string is available for automatic schema bootstrap.'
        );
        return;
    }

    let lastError = null;
    for (let index = 0; index < bootstrapConnectionStrings.length; index += 1) {
        try {
            await ensureGarageWrapPresetSchema({
                connectionString: bootstrapConnectionStrings[index],
            });
            return;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        console.error('Supabase garage wrap presets schema bootstrap failed:', lastError);
    }
}

async function initializeSupabaseShowroomIntroVideoSchema() {
    if (!showroomIntroVideoStore.isConfigured?.()) {
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
            'Supabase showroom intro video is enabled, but no DB connection string is available for automatic schema bootstrap.'
        );
        return;
    }

    let lastError = null;
    for (let index = 0; index < bootstrapConnectionStrings.length; index += 1) {
        try {
            await ensureShowroomIntroVideoSchema({
                connectionString: bootstrapConnectionStrings[index],
            });
            return;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        console.error('Supabase showroom intro video schema bootstrap failed:', lastError);
    }
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

async function initializeSupabasePlayerEconomySchema() {
    if (!playerEconomyStore.isConfigured()) {
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
            'Supabase player economy is enabled, but no DB connection string is available for automatic schema bootstrap.'
        );
        return;
    }

    let lastError = null;
    for (let index = 0; index < bootstrapConnectionStrings.length; index += 1) {
        try {
            await ensurePlayerEconomySchema({
                connectionString: bootstrapConnectionStrings[index],
            });
            return;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        console.error('Supabase player economy schema bootstrap failed:', lastError);
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

function scheduleGlobalLeaderboardBroadcast(reason = 'update') {
    if (!leaderboardStore.isConfigured()) {
        return;
    }
    pendingGlobalLeaderboardBroadcastReason = sanitizeLeaderboardBroadcastReason(reason);
    if (globalLeaderboardBroadcastTimer) {
        return;
    }
    globalLeaderboardBroadcastTimer = setTimeout(() => {
        globalLeaderboardBroadcastTimer = null;
        const broadcastReason = pendingGlobalLeaderboardBroadcastReason;
        pendingGlobalLeaderboardBroadcastReason = 'update';
        void broadcastGlobalLeaderboardUpdate(broadcastReason);
    }, LIVE_LEADERBOARD_BROADCAST_DEBOUNCE_MS);
}

async function broadcastGlobalLeaderboardUpdate(reason = 'update') {
    if (!leaderboardStore.isConfigured()) {
        return;
    }
    try {
        const leaderboardView = await leaderboardStore.readLeaderboardView({
            topLimit: LIVE_LEADERBOARD_BROADCAST_TOP_LIMIT,
            viewerWindowRadius: LIVE_LEADERBOARD_BROADCAST_WINDOW_RADIUS,
            viewerUserId: '',
        });
        io.emit('leaderboard:update', {
            ok: true,
            reason: sanitizeLeaderboardBroadcastReason(reason),
            broadcastedAt: new Date().toISOString(),
            ...leaderboardView,
        });
    } catch (error) {
        console.error('Live leaderboard broadcast failed:', error);
    }
}

function sanitizeLeaderboardBroadcastReason(value) {
    if (typeof value !== 'string') {
        return 'update';
    }
    const normalized = value.trim().toLowerCase();
    if (
        normalized === 'round-result' ||
        normalized === 'update' ||
        normalized === 'manual' ||
        normalized === 'bootstrap'
    ) {
        return normalized;
    }
    return 'update';
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
    return isAdminTokenAuthorized(req, BILLBOARD_CONTENT_ADMIN_TOKEN);
}

async function resolveBillboardEditorAccess(req) {
    if (isBillboardContentAdminAuthorized(req)) {
        return {
            canEdit: true,
            authIdentity: null,
            statusText: '',
            source: 'admin-token',
        };
    }

    if (!supabaseRuntimeConfig.publicEnabled) {
        return {
            canEdit: false,
            authIdentity: null,
            statusText: 'Billboard editor sign-in is not configured on this server.',
            source: 'disabled',
        };
    }
    if (!supabaseServiceClient) {
        return {
            canEdit: false,
            authIdentity: null,
            statusText: 'Billboard editor auth is unavailable on this server.',
            source: 'disabled',
        };
    }

    const authIdentity = await resolveAuthenticatedRequestIdentity(req);
    if (!authIdentity?.userId) {
        return {
            canEdit: false,
            authIdentity: null,
            statusText: 'Sign in with an editor account to manage billboard media.',
            source: 'auth-required',
        };
    }
    if (!authIdentity.canManageBillboards) {
        return {
            canEdit: false,
            authIdentity,
            statusText: 'This account does not have billboard editor access.',
            source: 'forbidden',
        };
    }

    return {
        canEdit: true,
        authIdentity,
        statusText: '',
        source: 'auth',
    };
}

function isAudioPrefsAdminAuthorized(req) {
    return isAdminTokenAuthorized(req, BILLBOARD_CONTENT_ADMIN_TOKEN);
}

function isAdminTokenAuthorized(req, expectedToken = '') {
    if (isLoopbackRequest(req)) {
        return true;
    }
    if (!expectedToken) {
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
            Buffer.from(expectedToken, 'utf8')
        );
    } catch {
        return false;
    }
}

function safelyDecodeUploadFileName(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return '';
    }
    try {
        return decodeURIComponent(normalized);
    } catch {
        return normalized;
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

function createCreditsPurchaseReturnUrl(baseUrl, state, options = {}) {
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
        const queryParts = [`credits-purchase=${encodeURIComponent(normalizedState)}`];
        if (includeSessionId) {
            queryParts.push('credits_session_id={CHECKOUT_SESSION_ID}');
        }
        return `${origin}/?${queryParts.join('&')}`;
    } catch {
        return '';
    }
}

async function handleStripeDonateWebhook(req, res) {
    if (!stripeClient || !STRIPE_WEBHOOK_SECRET) {
        res.status(503).send('Stripe checkout is not configured on this server.');
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
        await processStripeDonateWebhookEvent(stripeEvent);
        donateSessionStore.markEventProcessed(stripeEvent.id);
        res.status(200).send('ok');
    } catch (error) {
        console.error('Stripe webhook processing failed:', error);
        res.status(500).send('Stripe webhook processing failed.');
    }
}

async function processStripeDonateWebhookEvent(stripeEvent) {
    const eventType = typeof stripeEvent?.type === 'string' ? stripeEvent.type : '';
    if (!eventType || !eventType.startsWith('checkout.session.')) {
        return;
    }
    const checkoutSession = stripeEvent?.data?.object;
    if (!checkoutSession || typeof checkoutSession !== 'object') {
        return;
    }
    if (isCreditsPurchaseCheckoutSession(checkoutSession)) {
        const status = resolveCreditsPurchaseCheckoutStatus(checkoutSession);
        if (status === 'paid') {
            const purchase = normalizeCreditsPurchaseFromCheckoutSession(checkoutSession);
            if (purchase?.userId) {
                await playerEconomyStore.applyCreditsPurchaseByUserId(purchase.userId, purchase);
            }
        }
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

function isCreditsPurchaseCheckoutSession(checkoutSession = null) {
    if (!checkoutSession || typeof checkoutSession !== 'object') {
        return false;
    }
    const metadata =
        checkoutSession?.metadata && typeof checkoutSession.metadata === 'object'
            ? checkoutSession.metadata
            : {};
    return (
        sanitizeCheckoutMetadataValue(metadata.integration) === 'minefield-drift' &&
        sanitizeCheckoutMetadataValue(metadata.checkoutPurpose) === 'credits-purchase'
    );
}

function normalizeCreditsPurchaseFromCheckoutSession(checkoutSession = null) {
    if (!isCreditsPurchaseCheckoutSession(checkoutSession)) {
        return null;
    }
    const metadata =
        checkoutSession?.metadata && typeof checkoutSession.metadata === 'object'
            ? checkoutSession.metadata
            : {};
    const checkoutSessionId = normalizeStripeCheckoutSessionId(checkoutSession?.id);
    const userId = sanitizeSupabaseUserId(
        metadata.userId || metadata.user_id || checkoutSession?.client_reference_id || ''
    );
    const creditsAmount = Math.max(
        0,
        Math.round(
            Number(metadata.creditsAmount || metadata.credits || PLAYER_CREDITS_PURCHASE_GRANT) || 0
        )
    );
    const amountCents = Math.max(
        0,
        Math.round(
            Number(
                metadata.amountCents ||
                    checkoutSession?.amount_total ||
                    PLAYER_CREDITS_PURCHASE_AMOUNT_CENTS
            ) || 0
        )
    );
    const currencyCode = sanitizeCurrencyCode(
        checkoutSession?.currency || metadata.currencyCode || DONATE_CURRENCY,
        DONATE_CURRENCY
    );
    const purchasePackId = sanitizeCheckoutMetadataValue(
        metadata.purchasePackId || PLAYER_CREDITS_PURCHASE_PACK_ID
    );
    return {
        userId,
        checkoutSessionId,
        creditsAmount,
        amountCents,
        currencyCode,
        purchasePackId,
        summary: `Purchased ${creditsAmount} ${creditsAmount === 1 ? 'Credit' : 'Credits'}`,
    };
}

function resolveCreditsPurchaseCheckoutStatus(checkoutSession = null) {
    const status = sanitizeCheckoutMetadataValue(checkoutSession?.status);
    const paymentStatus = sanitizeCheckoutMetadataValue(checkoutSession?.payment_status);
    if (status === 'expired') {
        return 'expired';
    }
    if (paymentStatus === 'paid' || paymentStatus === 'no_payment_required') {
        return 'paid';
    }
    if (status === 'complete') {
        return 'processing';
    }
    return 'open';
}

function isCreditsPurchaseStatusFinal(status = '') {
    return status === 'paid' || status === 'expired';
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

function sanitizeCheckoutMetadataValue(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().toLowerCase();
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
            avatarPath: sanitizeSupabaseStorageObjectPath(
                data.user?.user_metadata?.avatar_path || ''
            ),
            carWrapPath: sanitizeSupabaseStorageObjectPath(
                data.user?.user_metadata?.car_wrap_path || ''
            ),
            canManageBillboards: userCanManageBillboards(data.user),
        };
    } catch {
        return null;
    }
}

function userCanManageBillboards(user = null) {
    const safeUserId = sanitizeSupabaseUserId(user?.id);
    if (safeUserId && BILLBOARD_EDITOR_USER_IDS.has(safeUserId)) {
        return true;
    }

    const roleTokens = collectSupabaseUserRoleTokens(user);
    return (
        roleTokens.has('admin') ||
        roleTokens.has('editor') ||
        roleTokens.has('billboard-editor') ||
        roleTokens.has('billboard_admin') ||
        roleTokens.has('billboardadmin')
    );
}

function collectSupabaseUserRoleTokens(user = null) {
    const tokens = new Set();
    const sources = [user?.app_metadata, user?.user_metadata];

    for (let index = 0; index < sources.length; index += 1) {
        const source = sources[index];
        if (!source || typeof source !== 'object') {
            continue;
        }

        addSupabaseRoleToken(tokens, source.role);
        if (Array.isArray(source.roles)) {
            source.roles.forEach((value) => addSupabaseRoleToken(tokens, value));
        } else {
            addSupabaseRoleToken(tokens, source.roles);
        }

        if (source.admin === true || source.is_admin === true) {
            tokens.add('admin');
        }
        if (source.editor === true || source.is_editor === true) {
            tokens.add('editor');
        }
        if (
            source.billboard_editor === true ||
            source.billboard_admin === true ||
            source.can_manage_billboards === true
        ) {
            tokens.add('billboard-editor');
        }
    }

    return tokens;
}

function addSupabaseRoleToken(target, value) {
    if (typeof value === 'string') {
        const normalized = normalizeSupabaseRoleToken(value);
        if (normalized) {
            target.add(normalized);
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((entry) => addSupabaseRoleToken(target, entry));
        return;
    }
    if (value && typeof value === 'object') {
        Object.entries(value).forEach(([key, enabled]) => {
            if (enabled) {
                addSupabaseRoleToken(target, key);
            }
        });
    }
}

function normalizeSupabaseRoleToken(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase();
    if (!normalized) {
        return '';
    }
    return normalized.replace(/[^a-z0-9_-]+/g, '-');
}

function parseSupabaseUserIdAllowlist(value) {
    const entries = String(value || '')
        .split(',')
        .map((entry) => sanitizeSupabaseUserId(entry))
        .filter(Boolean);
    return new Set(entries);
}

async function resolveUnlockedGarageIdsForAuthIdentity(authIdentity = null) {
    const safeUserId = sanitizeSupabaseUserId(authIdentity?.userId);
    if (!safeUserId || !playerEconomyStore.isConfigured()) {
        return {
            unlockedVehicleIds: [...DEFAULT_UNLOCKED_VEHICLE_IDS],
            unlockedWheelPresetIds: [...DEFAULT_UNLOCKED_WHEEL_PRESET_IDS],
        };
    }
    try {
        const profile = await playerEconomyStore.readProfileByUserId(safeUserId);
        return {
            unlockedVehicleIds: normalizeUnlockedVehicleIds(profile?.unlockedVehicleIds),
            unlockedWheelPresetIds: normalizeUnlockedWheelPresetIds(
                profile?.unlockedWheelPresetIds
            ),
        };
    } catch {
        return {
            unlockedVehicleIds: [...DEFAULT_UNLOCKED_VEHICLE_IDS],
            unlockedWheelPresetIds: [...DEFAULT_UNLOCKED_WHEEL_PRESET_IDS],
        };
    }
}

function createAuthenticatedProfile(authIdentity = null, socketId = '') {
    const fallbackProfile = createDefaultProfile(socketId);
    if (!authIdentity || typeof authIdentity !== 'object') {
        return fallbackProfile;
    }
    const carWrapPath = resolvePlayerCarWrapPath(
        authIdentity.carWrapPath,
        authIdentity.userId,
        fallbackProfile.carWrapPath
    );
    return {
        ...fallbackProfile,
        name: sanitizePlayerName(
            authIdentity.displayName || resolveEmailName(authIdentity.email),
            fallbackProfile.name
        ),
        carWrapPath,
        carWrapUrl: resolvePlayerCarWrapPublicUrl(carWrapPath),
    };
}

function normalizeUnlockedVehicleIds(value) {
    const normalizedIds = new Set(DEFAULT_UNLOCKED_VEHICLE_IDS);
    const entries = Array.isArray(value) ? value : [];
    for (let i = 0; i < entries.length; i += 1) {
        const vehicleId = sanitizePlayerVehicleId(entries[i], '');
        if (vehicleId) {
            normalizedIds.add(vehicleId);
        }
    }
    return [...normalizedIds];
}

function normalizeUnlockedWheelPresetIds(value) {
    const normalizedIds = new Set(DEFAULT_UNLOCKED_WHEEL_PRESET_IDS);
    const entries = Array.isArray(value) ? value : [];
    for (let i = 0; i < entries.length; i += 1) {
        const wheelPresetId = sanitizeWheelPresetId(entries[i], '');
        if (wheelPresetId) {
            normalizedIds.add(wheelPresetId);
        }
    }
    return [...normalizedIds];
}

function resolveOwnedVehicleId(
    vehicleId,
    unlockedVehicleIds = DEFAULT_UNLOCKED_VEHICLE_IDS,
    fallbackVehicleId = DEFAULT_PLAYER_VEHICLE_ID
) {
    const ownedVehicleIds = normalizeUnlockedVehicleIds(unlockedVehicleIds);
    const normalizedVehicleId = sanitizePlayerVehicleId(vehicleId, '');
    if (normalizedVehicleId && ownedVehicleIds.includes(normalizedVehicleId)) {
        return normalizedVehicleId;
    }
    const normalizedFallbackVehicleId = sanitizePlayerVehicleId(
        fallbackVehicleId,
        DEFAULT_PLAYER_VEHICLE_ID
    );
    if (ownedVehicleIds.includes(normalizedFallbackVehicleId)) {
        return normalizedFallbackVehicleId;
    }
    return ownedVehicleIds[0] || DEFAULT_PLAYER_VEHICLE_ID;
}

function resolveOwnedWheelPresetId(
    wheelPresetId,
    unlockedWheelPresetIds = DEFAULT_UNLOCKED_WHEEL_PRESET_IDS,
    fallbackWheelPresetId = DEFAULT_PLAYER_WHEEL_PRESET_ID
) {
    const ownedWheelPresetIds = normalizeUnlockedWheelPresetIds(unlockedWheelPresetIds);
    const normalizedWheelPresetId = sanitizeWheelPresetId(wheelPresetId, '');
    if (normalizedWheelPresetId && ownedWheelPresetIds.includes(normalizedWheelPresetId)) {
        return normalizedWheelPresetId;
    }
    const normalizedFallbackWheelPresetId = sanitizeWheelPresetId(
        fallbackWheelPresetId,
        DEFAULT_PLAYER_WHEEL_PRESET_ID
    );
    if (ownedWheelPresetIds.includes(normalizedFallbackWheelPresetId)) {
        return normalizedFallbackWheelPresetId;
    }
    return ownedWheelPresetIds[0] || DEFAULT_PLAYER_WHEEL_PRESET_ID;
}

function createRoomPlayer(id, profile, authIdentity = null) {
    const safeUserId = sanitizeSupabaseUserId(authIdentity?.userId);
    const carWrapPath = resolvePlayerCarWrapPath(
        profile?.carWrapPath,
        safeUserId,
        authIdentity?.carWrapPath
    );
    return {
        id,
        userId: safeUserId,
        name: profile.name,
        colorHex: profile.colorHex,
        vehicleId: profile.vehicleId,
        skinId: profile.skinId,
        wheelPresetId: profile.wheelPresetId,
        carWrapPath,
        carWrapUrl: resolvePlayerCarWrapPublicUrl(carWrapPath),
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
        stealthExpiresAt: 0,
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

function createRoomStealthPickupState(nowMs = Date.now()) {
    const now = Math.max(0, Math.round(Number(nowMs) || Date.now()));
    return {
        id: STEALTH_PICKUP_ID,
        x: STEALTH_PICKUP_X,
        z: STEALTH_PICKUP_Z,
        available: true,
        respawnAt: 0,
        collectedAt: 0,
        collectedByPlayerId: '',
        updatedAt: now,
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

function syncRoomStealthPickupState(room, nowMs = Date.now()) {
    const now = Math.max(0, Math.round(Number(nowMs) || Date.now()));
    const baseState =
        room?.stealthPickup && typeof room.stealthPickup === 'object'
            ? room.stealthPickup
            : createRoomStealthPickupState(now);
    const nextState = normalizeRoomStealthPickupState(baseState, now);
    if (nextState.respawnAt > 0 && now >= nextState.respawnAt) {
        nextState.available = true;
        nextState.respawnAt = 0;
        nextState.collectedByPlayerId = '';
        nextState.updatedAt = now;
    }
    if (room && typeof room === 'object') {
        room.stealthPickup = nextState;
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

function normalizeRoomStealthPickupState(value, nowMs = Date.now()) {
    const now = Math.max(0, Math.round(Number(nowMs) || Date.now()));
    const respawnAt = Math.max(0, Math.round(Number(value?.respawnAt) || 0));
    const available = Boolean(value?.available) || respawnAt <= 0;
    return {
        id: sanitizeStealthPickupId(value?.id) || STEALTH_PICKUP_ID,
        x: clampFinite(value?.x, -5000, 5000, STEALTH_PICKUP_X),
        z: clampFinite(value?.z, -5000, 5000, STEALTH_PICKUP_Z),
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

function serializeRoomStealthPickupState(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return {
        id: sanitizeStealthPickupId(value.id),
        x: clampFinite(value.x, -5000, 5000, STEALTH_PICKUP_X),
        z: clampFinite(value.z, -5000, 5000, STEALTH_PICKUP_Z),
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

function getPlayerStealthExpiresAt(player, nowMs = Date.now()) {
    const now = Math.max(0, Math.round(Number(nowMs) || Date.now()));
    const expiresAt = Math.max(0, Math.round(Number(player?.stealthExpiresAt) || 0));
    if (expiresAt > 0 && now >= expiresAt) {
        if (player && typeof player === 'object') {
            player.stealthExpiresAt = 0;
            if (player.lastState && typeof player.lastState === 'object') {
                player.lastState.stealthActive = false;
                player.lastState.stealthExpiresAt = 0;
            }
        }
        return 0;
    }
    return expiresAt;
}

function serializeRoom(room) {
    const now = Date.now();
    pruneExpiredMines(room, now);
    pruneCollectedPickupHistory(room, now);
    room.roundState =
        room.roundState && typeof room.roundState === 'object'
            ? room.roundState
            : createRoomRoundState(ONLINE_ROUND_TOTAL_PICKUPS_DEFAULT);
    syncRoomStealthPickupState(room, now);
    syncRoomWeaponPickupState(room, now);
    syncRoomEnvironmentState(room, now);
    recalculateRoomRoundStateFromPlayers(room.roundState, room.players);
    const mineMap = room?.mines instanceof Map ? room.mines : new Map();
    const players = Array.from(room.players.values())
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((player) => {
            const collectedCount = Math.max(0, Math.round(Number(player.collectedCount) || 0));
            const score = Math.max(0, Math.round(Number(player.score) || 0));
            const isDestroyed = Boolean(player.isDestroyed);
            const stealthExpiresAt = getPlayerStealthExpiresAt(player, now);
            const baseState =
                player.lastState && typeof player.lastState === 'object'
                    ? {
                          ...player.lastState,
                          collectedCount,
                          score,
                          isDestroyed,
                          stealthActive: stealthExpiresAt > now,
                          stealthExpiresAt,
                          stealthDurationMs:
                              stealthExpiresAt > now ? STEALTH_PICKUP_DURATION_MS : 0,
                      }
                    : null;
            if (baseState && player.lastCrashReplication) {
                baseState.crashReplication = player.lastCrashReplication;
            }

            return {
                id: player.id,
                name: player.name,
                colorHex: player.colorHex,
                vehicleId: player.vehicleId,
                skinId: player.skinId,
                wheelPresetId: player.wheelPresetId,
                carWrapUrl: resolvePlayerCarWrapPublicUrl(player.carWrapPath || ''),
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
        stealthPickup: serializeRoomStealthPickupState(room.stealthPickup),
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
        vehicleId: DEFAULT_PLAYER_VEHICLE_ID,
        skinId: DEFAULT_PLAYER_SKIN_ID,
        wheelPresetId: DEFAULT_PLAYER_WHEEL_PRESET_ID,
        carWrapPath: '',
        carWrapUrl: '',
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

function sanitizeSupabaseStorageObjectPath(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().replace(/^\/+|\/+$/g, '');
    if (!normalized || normalized.length > 512 || normalized.includes('..')) {
        return '';
    }
    const segments = normalized.split('/');
    if (segments.some((segment) => !/^[a-zA-Z0-9._-]{1,120}$/u.test(segment))) {
        return '';
    }
    return normalized;
}

function resolveSupabaseStorageObjectPublicUrl(baseUrl, bucketName, objectPath) {
    const safeBaseUrl =
        typeof baseUrl === 'string' && /^(https?:)?\/\//iu.test(baseUrl.trim())
            ? baseUrl.trim().replace(/\/+$/u, '')
            : '';
    const safeBucketName = sanitizeSupabaseStorageBucketName(bucketName);
    const safeObjectPath = sanitizeSupabaseStorageObjectPath(objectPath);
    if (!safeBaseUrl || !safeBucketName || !safeObjectPath) {
        return '';
    }
    const encodedPath = safeObjectPath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
    return `${safeBaseUrl}/storage/v1/object/public/${encodeURIComponent(safeBucketName)}/${encodedPath}`;
}

async function resolveSupabaseStorageAvailability() {
    if (!supabaseServiceClient) {
        return null;
    }

    const now = Date.now();
    if (supabaseStorageAvailabilityCache && now < supabaseStorageAvailabilityCacheExpiresAt) {
        return supabaseStorageAvailabilityCache;
    }
    if (supabaseStorageAvailabilityRefreshPromise) {
        return supabaseStorageAvailabilityRefreshPromise;
    }

    supabaseStorageAvailabilityRefreshPromise = (async () => {
        try {
            const { data, error } = await supabaseServiceClient.storage.listBuckets();
            if (error) {
                throw error;
            }

            const bucketNames = new Set(
                (Array.isArray(data) ? data : [])
                    .map((bucket) =>
                        sanitizeSupabaseStorageBucketName(bucket?.name || bucket?.id || '')
                    )
                    .filter(Boolean)
            );

            const availability = {
                profileImagesBucketAvailable: Boolean(
                    !SUPABASE_PUBLIC_CONFIG.profileImagesBucket ||
                    bucketNames.has(SUPABASE_PUBLIC_CONFIG.profileImagesBucket)
                ),
                carWrapsBucketAvailable: Boolean(
                    !SUPABASE_PUBLIC_CONFIG.carWrapsBucket ||
                    bucketNames.has(SUPABASE_PUBLIC_CONFIG.carWrapsBucket)
                ),
                garageWrapPresetsBucketAvailable: Boolean(
                    !SUPABASE_PUBLIC_CONFIG.garageWrapPresetsBucket ||
                    bucketNames.has(SUPABASE_PUBLIC_CONFIG.garageWrapPresetsBucket)
                ),
                billboardMediaBucketAvailable: Boolean(
                    !SUPABASE_PUBLIC_CONFIG.billboardMediaBucket ||
                    bucketNames.has(SUPABASE_PUBLIC_CONFIG.billboardMediaBucket)
                ),
                showroomIntroBucketAvailable: Boolean(
                    !SUPABASE_PUBLIC_CONFIG.showroomIntroBucket ||
                    bucketNames.has(SUPABASE_PUBLIC_CONFIG.showroomIntroBucket)
                ),
            };

            logMissingSupabaseStorageBuckets(availability);
            supabaseStorageAvailabilityCache = availability;
            supabaseStorageAvailabilityCacheExpiresAt =
                Date.now() + SUPABASE_STORAGE_AVAILABILITY_CACHE_TTL_MS;
            return availability;
        } catch (error) {
            console.warn('Supabase storage capability check failed:', error);
            supabaseStorageAvailabilityCache = null;
            supabaseStorageAvailabilityCacheExpiresAt = 0;
            return null;
        } finally {
            supabaseStorageAvailabilityRefreshPromise = null;
        }
    })();

    return supabaseStorageAvailabilityRefreshPromise;
}

function logMissingSupabaseStorageBuckets(availability) {
    const missingBuckets = [];
    if (
        SUPABASE_PUBLIC_CONFIG.profileImagesBucket &&
        availability?.profileImagesBucketAvailable === false
    ) {
        missingBuckets.push(SUPABASE_PUBLIC_CONFIG.profileImagesBucket);
    }
    if (SUPABASE_PUBLIC_CONFIG.carWrapsBucket && availability?.carWrapsBucketAvailable === false) {
        missingBuckets.push(SUPABASE_PUBLIC_CONFIG.carWrapsBucket);
    }
    if (
        SUPABASE_PUBLIC_CONFIG.garageWrapPresetsBucket &&
        availability?.garageWrapPresetsBucketAvailable === false
    ) {
        missingBuckets.push(SUPABASE_PUBLIC_CONFIG.garageWrapPresetsBucket);
    }
    if (
        SUPABASE_PUBLIC_CONFIG.billboardMediaBucket &&
        availability?.billboardMediaBucketAvailable === false
    ) {
        missingBuckets.push(SUPABASE_PUBLIC_CONFIG.billboardMediaBucket);
    }
    if (
        SUPABASE_PUBLIC_CONFIG.showroomIntroBucket &&
        availability?.showroomIntroBucketAvailable === false
    ) {
        missingBuckets.push(SUPABASE_PUBLIC_CONFIG.showroomIntroBucket);
    }

    const nextWarning = missingBuckets.join(', ');
    if (!nextWarning) {
        lastSupabaseStorageAvailabilityWarning = '';
        return;
    }
    if (nextWarning === lastSupabaseStorageAvailabilityWarning) {
        return;
    }

    lastSupabaseStorageAvailabilityWarning = nextWarning;
    console.warn(
        `Supabase storage buckets are missing: ${nextWarning}. Run the matching SQL setup before enabling uploads.`
    );
}

function resolvePlayerCarWrapPath(value, userId, fallback = '') {
    const safeUserId = sanitizeSupabaseUserId(userId);
    const safeFallbackPath = sanitizeSupabaseStorageObjectPath(fallback);
    if (!safeUserId) {
        return safeFallbackPath;
    }

    const safePath = sanitizeSupabaseStorageObjectPath(value);
    const candidatePath = safePath || safeFallbackPath;
    if (!candidatePath) {
        return '';
    }

    const [ownerUserId = ''] = candidatePath.split('/');
    if (ownerUserId !== safeUserId) {
        return safeFallbackPath;
    }

    return candidatePath;
}

function resolvePlayerCarWrapPublicUrl(carWrapPath) {
    return resolveSupabaseStorageObjectPublicUrl(
        supabaseRuntimeConfig.url,
        supabaseRuntimeConfig.carWrapsBucket,
        carWrapPath
    );
}

function resolveAccountDeletionFailureMessage(error) {
    if (!(error instanceof AccountDeletionError)) {
        return 'Could not delete account right now.';
    }
    if (error.step === 'validate-user-id') {
        return 'Could not determine which account to delete.';
    }
    if (error.step === 'cleanup') {
        return 'Could not delete all account data right now. Please try again.';
    }
    if (error.step === 'delete-auth-user') {
        return 'Could not finish account deletion right now. Please try again.';
    }
    return 'Could not delete account right now.';
}

async function deleteStoredProfileImagesForUser(userId) {
    return deleteStoredStorageObjectsForUser({
        userId,
        bucketName: supabaseRuntimeConfig.profileImagesBucket,
    });
}

async function deleteStoredCarWrapsForUser(userId) {
    return deleteStoredStorageObjectsForUser({
        userId,
        bucketName: supabaseRuntimeConfig.carWrapsBucket,
    });
}

async function deleteStoredStorageObjectsForUser({ userId, bucketName } = {}) {
    const safeUserId = sanitizeSupabaseUserId(userId);
    const safeBucketName = sanitizeSupabaseStorageBucketName(bucketName);
    if (!supabaseServiceClient || !safeUserId || !safeBucketName) {
        return {
            deletedCount: 0,
        };
    }

    const storage = supabaseServiceClient.storage.from(safeBucketName);
    const paths = [];
    let offset = 0;

    while (true) {
        const { data, error } = await storage.list(safeUserId, {
            limit: USER_STORAGE_LIST_LIMIT,
            offset,
            sortBy: {
                column: 'name',
                order: 'asc',
            },
        });
        if (error) {
            if (/bucket.*not found|not found/iu.test(error.message || '')) {
                return {
                    deletedCount: 0,
                };
            }
            throw error;
        }

        const items = Array.isArray(data) ? data : [];
        paths.push(
            ...items
                .map((item) =>
                    sanitizeSupabaseStorageObjectPath(`${safeUserId}/${item?.name || ''}`)
                )
                .filter(Boolean)
        );
        if (items.length < USER_STORAGE_LIST_LIMIT) {
            break;
        }
        offset += items.length;
    }

    if (paths.length === 0) {
        return {
            deletedCount: 0,
        };
    }

    const { error } = await storage.remove(paths);
    if (error) {
        throw error;
    }

    return {
        deletedCount: paths.length,
    };
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

function resolveProfile(
    input,
    fallback,
    socketId,
    authIdentity = null,
    unlockedVehicleIds = DEFAULT_UNLOCKED_VEHICLE_IDS,
    unlockedWheelPresetIds = DEFAULT_UNLOCKED_WHEEL_PRESET_IDS
) {
    const defaultProfile = fallback || createDefaultProfile(socketId);
    const safeUserId = sanitizeSupabaseUserId(authIdentity?.userId);
    const carWrapPath = resolvePlayerCarWrapPath(
        input?.carWrapPath,
        safeUserId,
        defaultProfile.carWrapPath
    );
    return {
        name: sanitizePlayerName(input?.name, defaultProfile.name),
        colorHex: sanitizeColorHex(input?.colorHex, defaultProfile.colorHex),
        vehicleId: resolveOwnedVehicleId(
            input?.vehicleId,
            unlockedVehicleIds,
            defaultProfile.vehicleId
        ),
        skinId: sanitizePlayerSkinId(input?.skinId, defaultProfile.skinId),
        wheelPresetId: resolveOwnedWheelPresetId(
            input?.wheelPresetId,
            unlockedWheelPresetIds,
            defaultProfile.wheelPresetId
        ),
        carWrapPath,
        carWrapUrl: resolvePlayerCarWrapPublicUrl(carWrapPath),
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

function sanitizePlayerVehicleId(value, fallbackVehicleId) {
    if (typeof value !== 'string') {
        return fallbackVehicleId;
    }

    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, PLAYER_VEHICLE_ID_MAX_LENGTH);
    return normalized || fallbackVehicleId;
}

function sanitizeWheelPresetId(value, fallbackWheelPresetId) {
    if (typeof value !== 'string') {
        return fallbackWheelPresetId;
    }

    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, PLAYER_WHEEL_PRESET_ID_MAX_LENGTH);
    return normalized || fallbackWheelPresetId;
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
    const rawWeaponMode =
        typeof payload?.weaponMode === 'string' ? payload.weaponMode : fallback?.weaponMode;
    const weaponMode = weaponHasWeapon && rawWeaponMode === 'weapon' ? 'weapon' : 'mine';
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
        weaponMode,
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

function sanitizeStealthPickupId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase();
    return normalized === STEALTH_PICKUP_ID ? normalized : '';
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
