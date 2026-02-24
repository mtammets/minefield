export const MAX_PHYSICS_STEPS_PER_FRAME = 6;

export const COLOR_NAMES = {
    [0x7cf9ff]: 'Neo Turquoise',
    [0xff85f8]: 'Neon Pink',
    [0x8dff9a]: 'Light Green',
    [0xffd86b]: 'Amber',
};

export const CAR_COLOR_STORAGE_KEY = 'silentdrift-player-car-color-hex';
export const PLAYER_TOP_SPEED_STORAGE_KEY = 'silentdrift-player-top-speed-kph';
export const GRAPHICS_QUALITY_MODE_STORAGE_KEY = 'silentdrift-graphics-quality-mode';
export const PLAYER_TOP_SPEED_LIMIT_STEP_KPH = 5;
export const PLAYER_TOP_SPEED_LIMIT_MIN_KPH = 50;
export const PLAYER_TOP_SPEED_LIMIT_MAX_KPH = 100;
export const CAR_COLOR_PRESETS = [
    { hex: 0x2d67a6, name: 'Cobalt Blue' },
    { hex: 0xd34545, name: 'Racing Red' },
    { hex: 0xff9f3f, name: 'Sunset Orange' },
    { hex: 0x3ca86f, name: 'Neon Green' },
    { hex: 0x8c9bb0, name: 'Titanium Gray' },
    { hex: 0xe4edf6, name: 'Arctic White' },
];
export const DEFAULT_PLAYER_CAR_COLOR_HEX = CAR_COLOR_PRESETS[0].hex;

export const DEBRIS_GRAVITY = 26;
export const DEBRIS_DRAG = 2.2;
export const DEBRIS_BOUNCE_DAMPING = 0.32;
export const DEBRIS_GROUND_CLEARANCE = 0.028;
export const PLAYER_RIDE_HEIGHT = 0.088;
export const DEBRIS_BASE_VERTICAL_BOOST = 2.2;
export const DEBRIS_SETTLE_VERTICAL_SPEED = 0.45;
export const DEBRIS_SETTLE_HORIZONTAL_SPEED = 0.5;
export const DEBRIS_SETTLE_ANGULAR_SPEED = 0.85;
export const PART_BASE_LATERAL_BOOST = 2.6;
export const PART_BASE_BLAST_BOOST = 4.1;
export const PART_BASE_FORWARD_CARRY_BOOST = 8.4;
export const PART_BASE_IMPACT_INERTIA_SCALE = 0.16;
export const PART_BASE_ANGULAR_BOOST = 8.6;
export const WHEEL_ROLL_RANDOM_BOOST = 4.4;
export const WHEEL_ROLL_DRIVE_MIN = 4.2;
export const WHEEL_ROLL_DRIVE_MAX = 9.8;
export const WHEEL_ORIENTATION_ALIGN_RATE = 14;
export const BODY_PANEL_ORIENTATION_ALIGN_RATE = 9.5;

export const OBSTACLE_CRASH_MIN_SPEED = 26;
export const OBSTACLE_CRASH_MAX_SPEED = 84;
export const VEHICLE_DAMAGE_COLLISION_MIN = 8;
export const VEHICLE_DAMAGE_COLLISION_MED = 14;
export const VEHICLE_DAMAGE_COLLISION_HIGH = 22;
export const VEHICLE_WHEEL_DETACH_SPEED = 28;
export const VEHICLE_SECOND_WHEEL_DETACH_SPEED = 36;
export const VEHICLE_DENT_MAX = 1.7;

export const STATUS_DEFAULT_TEXT =
    'Rear-wheel drive and powerful: controllable both forward and reverse. Collect energy spheres.';
export const ROOF_MENU_MODE_LABELS = {
    dashboard: 'Dashboard',
    battery: 'Energy',
    navigation: 'Nav',
    chassis: 'Chassis',
};

export const SHARED_PICKUP_COLOR_INDEX = 0;
export const SHARED_PICKUP_COLOR_HEX = 0x7cf9ff;

export const BATTERY_MAX = 100;
export const BATTERY_IDLE_DRAIN_PER_SEC = 0;
export const BATTERY_SPEED_DRAIN_PER_SPEED = 0.055;
export const BATTERY_LOW_HUD_SHOW_THRESHOLD = 0.25;
export const BATTERY_LOW_HUD_HIDE_THRESHOLD = 0.3;
export const BATTERY_CRITICAL_HUD_SHOW_THRESHOLD = 0.1;
export const BATTERY_CRITICAL_HUD_HIDE_THRESHOLD = 0.12;
export const BATTERY_DEPLETED_TRIGGER_LEVEL = 0.001;
export const BATTERY_DEPLETED_RECOVER_LEVEL = 0.06;

export const CHARGING_ZONE_ACTIVATION_DELAY_SEC = 2;
export const CHARGING_BATTERY_GAIN_PER_SEC = 16;

export const ROUND_TOTAL_PICKUPS = 30;
export const PLAYER_CAR_POOL_SIZE = 3;
export const PLAYER_RESPAWN_DELAY_MS = 850;
export const MINE_DEPLOY_COOLDOWN_MS = 900;
export const MINE_ARM_DELAY_MS = 650;
export const MINE_TTL_MS = 45000;
export const MINE_TRIGGER_RADIUS = 1.5;
export const MINE_MAX_PER_OWNER = 10;
export const MINE_THROW_SPEED = 24;
export const MINE_THROW_VERTICAL_SPEED = 6.8;
export const MINE_THROW_GRAVITY = 18;

export const REPLAY_EVENT_PICKUP = 'pickup';
export const REPLAY_EVENT_CRASH = 'crash';

export const WELCOME_CAR_SPIN_SPEED = 0.62;
export const WELCOME_PREVIEW_STATE_SPEED = 17;
export const WELCOME_PREVIEW_REAR_LIGHT_Z = 2.045;

export const RACE_INTRO_DURATION_SEC = 4.2;

export const SKID_MARK_REAR_WHEEL_OFFSET_X = 1.28;
export const SKID_MARK_REAR_WHEEL_OFFSET_Z = 1.8;
export const SKID_MARK_MAX_SEGMENTS = 1900;
export const SKID_MARK_BASE_WIDTH = 0.34;
export const SKID_MARK_MIN_SEGMENT_LENGTH = 0.05;
export const SKID_MARK_MAX_SEGMENT_LENGTH = 0.68;
export const SKID_MARK_SURFACE_BASE_HEIGHT = 0.028;
export const SKID_MARK_SURFACE_OFFSET = 0.0046;
export const SKID_MARK_BASE_OPACITY = 0.4;
export const SKID_MARK_SMOKE_BLEND_STRENGTH = 0.62;

export const DRIFT_SMOKE_MAX_PARTICLES = 260;
export const DRIFT_SMOKE_SPAWN_RATE = 78;
export const DRIFT_SMOKE_LIFE_MIN = 0.7;
export const DRIFT_SMOKE_LIFE_MAX = 1.45;

export const ESC_FULLSCREEN_FALLBACK_WINDOW_MS = 460;
