import { centralParkingLot } from './environment/layout.js';
import { getLorienVelmoreGallerySilenceFactorWorld } from './environment/lorien-gallery.js';
import {
    getUndergroundParkingSilenceFactorWorld,
    isUndergroundParkingSpaceIsolatedPosition,
} from './environment/underground-parking.js';
import {
    getUfoDiskoStoreAudioState,
    getLorienVelmoreGalleryVideoDisplayState,
    isInsideUfoDiskoStoreWorld,
    getUfoDiskoStoreSilenceFactorWorld,
} from './environment/buildings.js';

const AUDIO_PREFS_STORAGE_KEY = 'silentdrift-audio-prefs-v1';
const AUDIO_PREFS_DEFAULTS_API_PATH = '/api/audio-prefs/defaults';
const AUDIO_PREFS_DEFAULTS_SAVE_DEBOUNCE_MS = 500;
const WELCOME_MENU_MUSIC_SOUND_ID = 'welcomeMenuSnr2Loop01';
const MONUMENT_MUSIC_SOUND_ID = 'monumentHookusPookusInstrumentalLoop01';
const UFO_DISKO_STORE_MUSIC_SOUND_ID = 'ufoDiskoNebulaStore01';

export const DEFAULT_AUDIO_PREFS = Object.freeze({
    masterVolume: 1,
    vehiclesVolume: 0.18,
    botVehiclesVolume: 0.44,
    effectsVolume: 0.07,
    ambienceVolume: 0.22,
    menuMusicVolume: 0.44,
    gameMusicVolume: 0.02,
    uiVolume: 0.27,
    muted: false,
});

const SOUND_DEFINITIONS = Object.freeze({
    // UI
    uiClickSoft01: {
        src: '/audio/ui/ui_click_soft_01.mp3',
        bus: 'ui',
        gain: 0.4,
    },
    uiClickSoft02: {
        src: '/audio/ui/ui_click_soft_02.mp3',
        bus: 'ui',
        gain: 0.4,
    },
    uiToggleOn01: {
        src: '/audio/ui/ui_toggle_on_01.mp3',
        bus: 'ui',
        gain: 0.5,
    },
    uiToggleOff01: {
        src: '/audio/ui/ui_toggle_off_01.mp3',
        bus: 'ui',
        gain: 0.5,
    },
    uiConfirm01: {
        src: '/audio/ui/ui_confirm_01.mp3',
        bus: 'ui',
        gain: 0.56,
    },

    // Vehicle loops
    engineIdleLoop01: {
        src: '/audio/vehicles/player/engine_idle_loop_01.mp3',
        bus: 'vehicles',
        gain: 0.52,
        loop: true,
    },
    engineLowLoop01: {
        src: '/audio/vehicles/player/engine_low_loop_01.mp3',
        bus: 'vehicles',
        gain: 0.58,
        loop: true,
    },
    engineMidLoop01: {
        src: '/audio/vehicles/player/engine_mid_loop_01.mp3',
        bus: 'vehicles',
        gain: 0.6,
        loop: true,
    },
    engineHighLoop01: {
        src: '/audio/vehicles/player/engine_high_loop_01.mp3',
        bus: 'vehicles',
        gain: 0.58,
        loop: true,
    },
    engineRedlineLoop01: {
        src: '/audio/vehicles/player/engine_redline_loop_01.mp3',
        bus: 'vehicles',
        gain: 0.48,
        loop: true,
    },
    windSpeedLoop01: {
        src: '/audio/vehicles/player/wind_speed_loop_01.mp3',
        bus: 'vehicles',
        gain: 0.42,
        loop: true,
    },
    skidLoop01: {
        src: '/audio/vehicles/player/skid_loop_01.mp3',
        bus: 'vehicles',
        gain: 0.54,
        loop: true,
    },
    handbrakeScrapeLoop01: {
        src: '/audio/vehicles/player/handbrake_scrape_loop_01.mp3',
        bus: 'vehicles',
        gain: 0.48,
        loop: true,
    },
    suspensionRattleLoop01: {
        src: '/audio/vehicles/player/suspension_rattle_loop_01.mp3',
        bus: 'vehicles',
        gain: 0.34,
        loop: true,
    },

    // Gameplay
    countdownBeep01: {
        src: '/audio/gameplay/countdown_beep_01.mp3',
        bus: 'effects',
        gain: 0.62,
    },
    countdownGo01: {
        src: '/audio/gameplay/countdown_go_01.mp3',
        bus: 'effects',
        gain: 0.72,
    },
    pickupCollect01: {
        src: '/audio/gameplay/pickup_collect_01.mp3',
        bus: 'effects',
        gain: 0.64,
    },
    pickupCollect02: {
        src: '/audio/gameplay/pickup_collect_02.mp3',
        bus: 'effects',
        gain: 0.64,
    },
    chargingStart01: {
        src: '/audio/gameplay/charging_start_01.mp3',
        bus: 'effects',
        gain: 0.58,
    },
    chargingLoop01: {
        src: '/audio/gameplay/charging_loop_01.mp3',
        bus: 'effects',
        gain: 0.44,
        loop: true,
    },
    chargingStop01: {
        src: '/audio/gameplay/charging_stop_01.mp3',
        bus: 'effects',
        gain: 0.6,
    },
    batteryDepleted01: {
        src: '/audio/gameplay/battery_depleted_01.mp3',
        bus: 'effects',
        gain: 0.66,
    },
    batteryRestored01: {
        src: '/audio/gameplay/battery_restored_01.mp3',
        bus: 'effects',
        gain: 0.6,
    },
    roundFinished01: {
        src: '/audio/gameplay/round_finished_01.mp3',
        bus: 'effects',
        gain: 0.7,
    },
    respawn01: {
        src: '/audio/gameplay/respawn_01.mp3',
        bus: 'effects',
        gain: 0.58,
    },

    // Mines
    mineDeployDrop01: {
        src: '/audio/weapons/mines/mine_deploy_drop_01.mp3',
        bus: 'effects',
        gain: 0.64,
    },
    mineDeployThrow01: {
        src: '/audio/weapons/mines/mine_deploy_throw_01.mp3',
        bus: 'effects',
        gain: 0.66,
    },
    mineArm01: {
        src: '/audio/weapons/mines/mine_arm_01.mp3',
        bus: 'effects',
        gain: 0.52,
    },
    mineBeepLoop01: {
        src: '/audio/weapons/mines/mine_beep_loop_01.mp3',
        bus: 'effects',
        gain: 0.32,
        loop: true,
    },
    mineDetonateNear01: {
        src: '/audio/weapons/mines/mine_detonate_near_01.mp3',
        bus: 'effects',
        gain: 0.88,
    },
    mineDetonateFar01: {
        src: '/audio/weapons/mines/mine_detonate_far_01.mp3',
        bus: 'effects',
        gain: 0.62,
    },

    // Impacts
    collisionLight01: {
        src: '/audio/impacts/collision_light_01.mp3',
        bus: 'effects',
        gain: 0.56,
    },
    collisionLight02: {
        src: '/audio/impacts/collision_light_02.mp3',
        bus: 'effects',
        gain: 0.56,
    },
    collisionHeavy01: {
        src: '/audio/impacts/collision_heavy_01.mp3',
        bus: 'effects',
        gain: 0.72,
    },
    obstacleCrash01: {
        src: '/audio/impacts/obstacle_crash_01.mp3',
        bus: 'effects',
        gain: 0.78,
    },
    obstacleCrash02: {
        src: '/audio/impacts/obstacle_crash_02.mp3',
        bus: 'effects',
        gain: 0.78,
    },
    debrisScatter01: {
        src: '/audio/impacts/debris_scatter_01.mp3',
        bus: 'effects',
        gain: 0.54,
    },

    // Explosions
    vehicleExplosion01: {
        src: '/audio/explosions/vehicle_explosion_01.mp3',
        bus: 'effects',
        gain: 0.9,
    },
    vehicleExplosion02: {
        src: '/audio/explosions/vehicle_explosion_02.mp3',
        bus: 'effects',
        gain: 0.9,
    },
    fireballTail01: {
        src: '/audio/explosions/fireball_tail_01.mp3',
        bus: 'effects',
        gain: 0.7,
    },

    // Ambience
    cityAmbienceDayLoop01: {
        src: '/audio/ambience/city_ambience_day_loop_01.mp3',
        bus: 'ambience',
        gain: 0.45,
        loop: true,
        stream: true,
    },
    raceCrowdFarLoop01: {
        src: '/audio/ambience/race_crowd_far_loop_01.mp3',
        bus: 'ambience',
        gain: 0.32,
        loop: true,
    },
    welcomeMenuSnr2Loop01: {
        src: '/audio/music/welcome_menu_snr2_loop_01.mp3',
        bus: 'menuMusic',
        gain: 0.92,
        loop: true,
    },
    monumentHookusPookusInstrumentalLoop01: {
        src: '/audio/ambience/monument_hookus_pookus_instrumental_loop_01.mp3',
        bus: 'gameMusic',
        gain: 0.76,
        loop: true,
        stream: true,
    },
    ufoDiskoNebulaStore01: {
        src: '/audio/ufodisko/Nebula_pood.mp3',
        bus: 'ambience',
        gain: 0.42,
        stream: true,
    },
});
const SOUND_DEFINITION_IDS = Object.freeze(Object.keys(SOUND_DEFINITIONS));
const EXCLUDED_PRIMED_LOOP_SOUND_IDS = Object.freeze(
    new Set([WELCOME_MENU_MUSIC_SOUND_ID, MONUMENT_MUSIC_SOUND_ID])
);
const LOOP_SOUND_IDS = Object.freeze(
    SOUND_DEFINITION_IDS.filter(
        (soundId) =>
            Boolean(SOUND_DEFINITIONS[soundId]?.loop) &&
            !EXCLUDED_PRIMED_LOOP_SOUND_IDS.has(soundId)
    )
);
const EMPTY_ARRAY = Object.freeze([]);
const CORE_GAMEPLAY_SOUND_IDS = Object.freeze([
    'countdownBeep01',
    'countdownGo01',
    'engineIdleLoop01',
    'engineLowLoop01',
    'engineMidLoop01',
    'engineHighLoop01',
    'windSpeedLoop01',
    'skidLoop01',
    'handbrakeScrapeLoop01',
    'suspensionRattleLoop01',
    'chargingLoop01',
]);

const VARIANT_GROUPS = Object.freeze({
    uiClickSoft: ['uiClickSoft01', 'uiClickSoft02'],
    pickupCollect: ['pickupCollect01', 'pickupCollect02'],
    collisionLight: ['collisionLight01', 'collisionLight02'],
    obstacleCrash: ['obstacleCrash01', 'obstacleCrash02'],
    vehicleExplosion: ['vehicleExplosion01', 'vehicleExplosion02'],
});
const UI_SOUND_IDS = Object.freeze([
    'uiClickSoft01',
    'uiClickSoft02',
    'uiToggleOn01',
    'uiToggleOff01',
    'uiConfirm01',
]);
const UI_INTERACTION_SELECTOR =
    'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]';

const LOOP_RATE_DEFAULT = 1;
const BOT_TRAFFIC_LAYER_GAIN_SCALE = 0.68;

const MIXER_SLIDERS = Object.freeze([
    {
        key: 'masterVolume',
        label: 'Master',
    },
    {
        key: 'menuMusicVolume',
        label: 'Menu Music',
    },
    {
        key: 'gameMusicVolume',
        label: 'Game Music',
    },
    {
        key: 'effectsVolume',
        label: 'SFX',
    },
    {
        key: 'ambienceVolume',
        label: 'World',
    },
    {
        key: 'uiVolume',
        label: 'Interface',
    },
    {
        key: 'vehiclesVolume',
        label: 'Engine',
    },
    {
        key: 'botVehiclesVolume',
        label: 'Traffic',
    },
]);

const EVENT_COOLDOWNS = Object.freeze({
    collision: 0.12,
    obstacleCrash: 0.2,
    mineDetonation: 0.1,
    pickupCollect: 0.05,
    stealthPickup: 0.12,
    chargingStart: 0.18,
    chargingStop: 0.18,
});
const AUDIO_FETCH_CACHE_MODES = Object.freeze(['default', 'reload']);
const WELCOME_MENU_AMBIENCE_GAIN = 0;
const WELCOME_MENU_CROWD_GAIN = 0;
const WELCOME_MENU_MUSIC_GAIN = 0.01;
const AUDIO_MIXER_PREVIEW_FADE_IN_SEC = 0.04;
const AUDIO_MIXER_PREVIEW_FADE_OUT_SEC = 0.18;
const AUDIO_MIXER_PREVIEW_KEYBOARD_RELEASE_MS = 240;
const AUDIO_MIXER_PREVIEW_UI_REPEAT_MS = 680;
const AUDIO_MIXER_PREVIEW_SFX_REPEAT_MS = 960;
const AUDIO_MIXER_PREVIEW_MASTER_UI_REPEAT_MS = 1100;
const AUDIO_MIXER_PREVIEW_MASTER_SFX_REPEAT_MS = 1460;
const AUDIO_MIXER_PREVIEW_UI_THROTTLE_MS = 120;
const AUDIO_MIXER_PREVIEW_SFX_THROTTLE_MS = 180;
const AUDIO_MIXER_PREVIEW_MENU_DUCK = 0.18;
const AUDIO_PRELOAD_BATCH_SIZE = 2;
const MONUMENT_AUDIO_CONFIG = Object.freeze({
    x: centralParkingLot.centerX,
    y: 7.12,
    z: centralParkingLot.centerZ,
    refDistance: 18,
    maxDistance: 220,
    rolloffFactor: 1.34,
    fullPresenceDistance: 22,
    audibleDistance: 168,
    nearCutoffHz: 17200,
    farCutoffHz: 1450,
    nearWetLowpassHz: 5200,
    farWetLowpassHz: 1850,
    nearSourceGain: 1,
    farSourceGain: 0.18,
    nearDryGain: 0.94,
    farDryGain: 0.11,
    nearWetGain: 0.18,
    farWetGain: 0.42,
    nearDelaySec: 0.14,
    farDelaySec: 0.31,
    nearFeedback: 0.24,
    farFeedback: 0.46,
    delaySendNear: 0.1,
    delaySendFar: 0.32,
    reverbSendNear: 0.14,
    reverbSendFar: 0.42,
});
const LORIEN_GALLERY_VIDEO_BUS = 'ambience';
const LORIEN_GALLERY_AUDIO_CONFIG = Object.freeze({
    refDistance: 3.6,
    maxDistance: 34,
    rolloffFactor: 1.26,
    fullPresenceDistance: 5.5,
    audibleDistance: 24,
    nearCutoffHz: 13800,
    farCutoffHz: 2400,
    nearWetLowpassHz: 6200,
    farWetLowpassHz: 2100,
    nearSourceGain: 1,
    farSourceGain: 0.34,
    nearDryGain: 0.86,
    farDryGain: 0.22,
    nearWetGain: 0.34,
    farWetGain: 0.58,
    nearDelaySec: 0.082,
    farDelaySec: 0.118,
    nearFeedback: 0.24,
    farFeedback: 0.36,
    delaySendNear: 0.18,
    delaySendFar: 0.28,
    reverbSendNear: 0.34,
    reverbSendFar: 0.52,
});
const LORIEN_GALLERY_OCCLUSION_MIN_GAIN = 0.22;
const LORIEN_GALLERY_OCCLUSION_MIN_WET_GAIN = 0.54;
const LORIEN_GALLERY_OCCLUSION_MIN_CUTOFF_HZ = 1050;
const LORIEN_GALLERY_OCCLUSION_MIN_WET_CUTOFF_HZ = 920;
const UFO_DISKO_STORE_AUDIO_CONFIG = Object.freeze({
    refDistance: 3.8,
    maxDistance: 30,
    rolloffFactor: 1.22,
    fullPresenceDistance: 5.4,
    audibleDistance: 22,
    nearCutoffHz: 9800,
    farCutoffHz: 1550,
    nearWetLowpassHz: 4200,
    farWetLowpassHz: 1650,
    nearSourceGain: 1,
    farSourceGain: 0.22,
    nearDryGain: 0.84,
    farDryGain: 0.12,
    nearWetGain: 0.32,
    farWetGain: 0.56,
    nearDelaySec: 0.058,
    farDelaySec: 0.124,
    nearFeedback: 0.2,
    farFeedback: 0.34,
    delaySendNear: 0.12,
    delaySendFar: 0.24,
    reverbSendNear: 0.28,
    reverbSendFar: 0.5,
});
const MINE_DETONATION_OCCLUSION_MIN_GAIN = 0.38;
const MINE_DETONATION_OCCLUSION_MIN_RATE = 0.93;
const MINE_DETONATION_OCCLUSION_MAX_LOWPASS_HZ = 18000;
const MINE_DETONATION_OCCLUSION_MIN_LOWPASS_HZ = 950;
const VEHICLE_WEAPON_URBAN_SHOT_AUDIO_CONFIG = Object.freeze({
    refDistance: 7.5,
    maxDistance: 168,
    rolloffFactor: 1.28,
    directGain: 0.94,
    delaySendGain: 0.2,
    delayTimeSec: 0.094,
    delayFeedback: 0.3,
    reverbSendGain: 0.28,
    wetGain: 0.24,
    wetLowpassHz: 5400,
});
const VEHICLE_WEAPON_URBAN_IMPACT_AUDIO_CONFIG = Object.freeze({
    refDistance: 4.8,
    maxDistance: 116,
    rolloffFactor: 1.12,
    directGain: 0.82,
    delaySendGain: 0.24,
    delayTimeSec: 0.122,
    delayFeedback: 0.34,
    reverbSendGain: 0.32,
    wetGain: 0.3,
    wetLowpassHz: 4600,
});
const VEHICLE_WEAPON_INCOMING_CUE_AUDIO_CONFIG = Object.freeze({
    offsetDistance: 1.48,
    lateralOffset: 0.24,
    verticalOffset: 0.34,
    refDistance: 1.1,
    maxDistance: 8,
    rolloffFactor: 0.16,
    directGain: 1,
    delaySendGain: 0.08,
    delayTimeSec: 0.052,
    delayFeedback: 0.2,
    reverbSendGain: 0.1,
    wetGain: 0.08,
    wetLowpassHz: 7200,
});
const BOT_TRAFFIC_ENGINE_SOUND_IDS = Object.freeze([
    'engineIdleLoop01',
    'engineLowLoop01',
    'engineMidLoop01',
    'engineHighLoop01',
]);
const AUDIO_MIXER_PREVIEW_BUFFER_SOUND_IDS = Object.freeze([
    'chargingLoop01',
    'engineIdleLoop01',
    'engineLowLoop01',
    'engineMidLoop01',
    'pickupCollect01',
    'pickupCollect02',
    'raceCrowdFarLoop01',
]);
const AUDIO_MIXER_PREVIEW_STREAM_SOUND_IDS = Object.freeze([
    'cityAmbienceDayLoop01',
    MONUMENT_MUSIC_SOUND_ID,
]);
const BOT_TRAFFIC_AUDIO_CONFIG = Object.freeze({
    refDistance: 6.4,
    maxDistance: 138,
    rolloffFactor: 1.12,
    fullPresenceDistance: 14,
    audibleDistance: 92,
    cullDistance: 152,
    nearCutoffHz: 11200,
    farCutoffHz: 1280,
    nearWetLowpassHz: 5400,
    farWetLowpassHz: 1500,
    nearSourceGain: 0.92,
    farSourceGain: 0.24,
    nearDryGain: 0.82,
    farDryGain: 0.16,
    nearWetGain: 0.1,
    farWetGain: 0.28,
    nearDelaySec: 0.072,
    farDelaySec: 0.146,
    nearFeedback: 0.2,
    farFeedback: 0.36,
    delaySendNear: 0.05,
    delaySendFar: 0.18,
    reverbSendNear: 0.1,
    reverbSendFar: 0.28,
    verticalOffset: 0.72,
    speedFloorKph: 2,
    speedCeilingKph: 34,
    releaseAfterMs: 440,
});
const BOT_TRAFFIC_OCCLUSION_MIN_GAIN = 0.18;
const BOT_TRAFFIC_OCCLUSION_MIN_WET_GAIN = 0.56;
const BOT_TRAFFIC_OCCLUSION_MIN_CUTOFF_HZ = 840;
const BOT_TRAFFIC_OCCLUSION_MIN_WET_CUTOFF_HZ = 720;
const BOT_TRAFFIC_UNDERGROUND_MISMATCH_GAIN = 0.12;
const BOT_TRAFFIC_UNDERGROUND_MISMATCH_WET_GAIN = 0.42;
const BOT_TRAFFIC_APPROACH_RATE_RANGE = 0.035;

export function createAudioSystem({ camera = null, onPrefsChanged = null } = {}) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
        return createNoopAudioSystem();
    }

    const persistedPrefsState = readAudioPrefsState(DEFAULT_AUDIO_PREFS);
    const prefs = persistedPrefsState.prefs;
    const buffers = new Map();
    const failedBuffers = new Set();
    const loopInstances = new Map();
    const botTrafficInstances = new Map();
    const pendingLoads = new Map();
    const readyStreamSounds = new Set();
    const failedStreamSounds = new Set();
    const streamMediaElements = new Map();
    const eventCooldowns = new Map();
    const unlockListeners = [];
    const uiInteractionListeners = [];
    const preloadProgressSubscribers = new Set();

    let context = null;
    let mixer = null;
    let ui = null;
    let unlocked = false;
    let runtimeDefaultPrefs = {
        ...DEFAULT_AUDIO_PREFS,
    };
    let preloadEnabled = false;
    let preloadPromise = null;
    let gameplayReady = false;
    let disposed = false;
    let canEditRuntimeDefaults = false;
    let runtimeDefaultsDirty = false;
    let runtimeDefaultsLoaded = false;
    let runtimeDefaultsLoadPromise = null;
    let runtimeDefaultsSaveTimer = 0;
    let runtimeDefaultsSaveSignature = '';
    let sliderPreviewState = {
        key: '',
        token: 0,
        instances: [],
        intervalIds: [],
        keyboardReleaseTimer: 0,
        lastUiAccentAtMs: -Number.POSITIVE_INFINITY,
        lastEffectsAccentAtMs: -Number.POSITIVE_INFINITY,
    };
    let monumentMusicInstance = null;
    let monumentImpulseBuffer = null;
    let lorienGalleryVideoInstance = null;
    let lorienGalleryImpulseBuffer = null;
    let ufoDiskoMusicInstance = null;
    let ufoDiskoMusicImpulseBuffer = null;
    let vehicleWeaponNoiseBuffer = null;
    let vehicleWeaponUrbanImpulseBuffer = null;
    const monumentRhythmState = {
        active: 0,
        bass: 0,
        mid: 0,
        treble: 0,
        energy: 0,
        beat: 0,
        pulse: 0,
        smoothedBass: 0,
        smoothedEnergy: 0,
        lastSampleTimeMs: -Number.POSITIVE_INFINITY,
    };

    const runtime = {
        paused: false,
        welcomeVisible: false,
        worldMapVisible: false,
        lastChargingActive: false,
        lastBatteryDepleted: false,
        playerPosition: null,
        lowerLevelSilenceFactor: 0,
        previewMenuMusicDuck: 1,
    };

    return {
        initialize,
        dispose,
        update,
        unlock: unlockAudio,
        getMixerSnapshot,
        getMixerPrefsSnapshot,
        setMixerVolume,
        applyMixerPrefs,
        toggleMute,
        resetMixerToDefaults,
        prepareForGameplay,
        getPreloadState,
        isGameplayReady() {
            return gameplayReady;
        },
        isUnlocked() {
            return unlocked;
        },
        getMonumentRhythmState,
        onVehicleCollisionContacts,
        onObstacleCrash,
        onPickupCollected,
        onStealthPickupCollected,
        onMineDeployed,
        onMineDetonated,
        onPlayerExplosion,
        onRoundFinished,
        onPlayerRespawn,
        onBatteryDepleted,
        onBatteryRestored,
        onPauseChanged,
        onWelcomeVisibilityChanged,
        onWorldMapVisibilityChanged,
        onRaceIntroStep,
        onRaceIntroGo,
        onVehicleCombatModeSwitch,
        onVehicleWeaponPickup,
        onVehicleWeaponShot,
        onVehicleWeaponImpact,
        playUiClick,
        playUiConfirm,
    };

    function initialize(options = {}) {
        if (disposed) {
            return;
        }
        const preloadOnInitialize = Boolean(options?.preloadOnInitialize);
        preloadEnabled = preloadEnabled || preloadOnInitialize;
        ensureAudioContext();
        void loadRuntimeAudioDefaults();
        void preloadBuffersByIds(UI_SOUND_IDS);
        void loadBuffer(WELCOME_MENU_MUSIC_SOUND_ID);
        void preloadBuffersByIds(AUDIO_MIXER_PREVIEW_BUFFER_SOUND_IDS);
        for (let index = 0; index < AUDIO_MIXER_PREVIEW_STREAM_SOUND_IDS.length; index += 1) {
            void preloadStreamingSound(AUDIO_MIXER_PREVIEW_STREAM_SOUND_IDS[index]);
        }
        if (preloadEnabled) {
            startPreload();
        }
        ui = createAudioUi(prefs, {
            onToggleMute() {
                toggleMute();
            },
            onResetMix() {
                resetMixerToDefaults({
                    playFeedback: true,
                });
            },
            onVolumeChanged(key, normalizedValue) {
                setMixerVolume(key, normalizedValue);
            },
            onPreviewStart(key, mode = 'pointer') {
                void unlockAudio().then((unlockedNow) => {
                    if (!unlockedNow) {
                        return;
                    }
                    beginSliderPreview(key, {
                        mode,
                    });
                });
            },
            onPreviewChange(key, mode = 'pointer') {
                void unlockAudio().then((unlockedNow) => {
                    if (!unlockedNow) {
                        return;
                    }
                    handleSliderPreviewInteraction(key, {
                        mode,
                    });
                });
            },
            onPreviewEnd(key) {
                endSliderPreview(key);
            },
            onUnlockAudio() {
                void unlockAudio();
            },
        });
        installUnlockListeners();
        installUiInteractionListeners();
        refreshUi();
    }

    function dispose() {
        if (disposed) {
            return;
        }
        disposed = true;
        if (runtimeDefaultsSaveTimer) {
            window.clearTimeout(runtimeDefaultsSaveTimer);
            runtimeDefaultsSaveTimer = 0;
        }
        gameplayReady = false;
        removeUnlockListeners();
        removeUiInteractionListeners();
        if (ui?.root?.parentElement) {
            ui.root.parentElement.removeChild(ui.root);
        }
        ui = null;
        endSliderPreview();

        for (const instance of loopInstances.values()) {
            disposeLoopInstance(instance);
        }
        loopInstances.clear();
        for (const instance of botTrafficInstances.values()) {
            disposeBotTrafficInstance(instance);
        }
        botTrafficInstances.clear();
        disposeLorienGalleryVideoInstance();
        disposeMonumentMusicInstance();
        disposeUfoDiskoMusicInstance();
        disposeStreamingMediaElements();

        if (context) {
            void context.close().catch(() => {});
            context = null;
            mixer = null;
        }
    }

    async function unlockAudio({ waitForPreload = false } = {}) {
        if (disposed) {
            return false;
        }
        const audioContext = ensureAudioContext();
        if (!audioContext) {
            return false;
        }
        if (audioContext.state !== 'running') {
            try {
                await audioContext.resume();
            } catch {
                refreshUi();
                return false;
            }
        }

        unlocked = audioContext.state === 'running';
        if (unlocked && preloadEnabled) {
            startPreload();
        }
        applyBusVolumes();
        updateWelcomeMenuMusic({
            welcomeVisible: runtime.welcomeVisible,
        });
        refreshUi();
        if (waitForPreload && preloadPromise) {
            await preloadPromise;
        }
        return unlocked;
    }

    async function prepareForGameplay(options = {}) {
        if (disposed) {
            return false;
        }
        const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
        const requireAllFiles = Boolean(options?.requireAllFiles);
        const lazyPreloadRemaining = options?.lazyPreloadRemaining !== false;
        const coreSoundIds = resolveSoundIdList(options?.coreSoundIds, CORE_GAMEPLAY_SOUND_IDS);
        preloadEnabled = true;
        const unsubscribeProgress = subscribePreloadProgress(onProgress);
        try {
            const unlockedNow = await unlockAudio({ waitForPreload: false });
            if (!unlockedNow) {
                gameplayReady = false;
                refreshUi();
                notifyPreloadProgress();
                return false;
            }

            if (requireAllFiles) {
                startPreload();
                if (preloadPromise) {
                    await preloadPromise;
                }
                const preloadState = getPreloadState();
                gameplayReady = unlockedNow && isPreloadStrictlyComplete(preloadState);
            } else {
                const corePreloadState = await preloadBuffersByIds(coreSoundIds);
                gameplayReady = unlockedNow && isPreloadStrictlyComplete(corePreloadState);
                if (lazyPreloadRemaining) {
                    startPreload();
                }
            }

            if (gameplayReady) {
                primeLoopInstances();
            }
            refreshUi();
            notifyPreloadProgress();
            return gameplayReady;
        } finally {
            unsubscribeProgress();
        }
    }

    function ensureAudioContext() {
        if (context) {
            return context;
        }

        context = new AudioContextCtor({
            latencyHint: 'interactive',
        });

        const masterGain = context.createGain();
        const vehiclesGain = context.createGain();
        const botVehiclesGain = context.createGain();
        const effectsGain = context.createGain();
        const ambienceGain = context.createGain();
        const musicGain = context.createGain();
        const menuMusicGain = context.createGain();
        const gameMusicGain = context.createGain();
        const uiGain = context.createGain();

        const glueCompressor = context.createDynamicsCompressor();
        glueCompressor.threshold.setValueAtTime(-18, context.currentTime);
        glueCompressor.knee.setValueAtTime(12, context.currentTime);
        glueCompressor.ratio.setValueAtTime(3, context.currentTime);
        glueCompressor.attack.setValueAtTime(0.003, context.currentTime);
        glueCompressor.release.setValueAtTime(0.2, context.currentTime);

        const limiter = context.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(-4, context.currentTime);
        limiter.knee.setValueAtTime(0, context.currentTime);
        limiter.ratio.setValueAtTime(20, context.currentTime);
        limiter.attack.setValueAtTime(0.001, context.currentTime);
        limiter.release.setValueAtTime(0.12, context.currentTime);

        botVehiclesGain.connect(vehiclesGain);
        vehiclesGain.connect(masterGain);
        effectsGain.connect(masterGain);
        ambienceGain.connect(masterGain);
        menuMusicGain.connect(musicGain);
        gameMusicGain.connect(musicGain);
        musicGain.connect(masterGain);
        uiGain.connect(masterGain);
        masterGain.connect(glueCompressor);
        glueCompressor.connect(limiter);
        limiter.connect(context.destination);

        mixer = {
            masterGain,
            buses: {
                vehicles: vehiclesGain,
                botVehicles: botVehiclesGain,
                effects: effectsGain,
                ambience: ambienceGain,
                music: musicGain,
                menuMusic: menuMusicGain,
                gameMusic: gameMusicGain,
                ui: uiGain,
            },
        };

        applyBusVolumes();
        return context;
    }

    function getPreloadState() {
        const totalState = createSoundSetState(SOUND_DEFINITION_IDS);
        const coreState = createSoundSetState(CORE_GAMEPLAY_SOUND_IDS);
        return {
            filesTotal: totalState.filesTotal,
            filesReady: totalState.filesReady,
            filesFailed: totalState.filesFailed,
            filesDone: totalState.filesDone,
            progress: totalState.progress,
            complete: totalState.complete,
            completeNoFailures: totalState.completeNoFailures,
            coreFilesTotal: coreState.filesTotal,
            coreFilesReady: coreState.filesReady,
            coreFilesFailed: coreState.filesFailed,
            coreFilesDone: coreState.filesDone,
            coreProgress: coreState.progress,
            coreComplete: coreState.complete,
            coreCompleteNoFailures: coreState.completeNoFailures,
        };
    }

    function isPreloadStrictlyComplete(preloadState = null) {
        const filesTotal = Math.max(0, Math.round(Number(preloadState?.filesTotal) || 0));
        const filesReady = Math.max(0, Math.round(Number(preloadState?.filesReady) || 0));
        const filesFailed = Math.max(0, Math.round(Number(preloadState?.filesFailed) || 0));
        if (filesTotal <= 0) {
            return false;
        }
        return filesReady >= filesTotal && filesFailed === 0;
    }

    function subscribePreloadProgress(listener) {
        if (typeof listener !== 'function') {
            return () => {};
        }
        preloadProgressSubscribers.add(listener);
        try {
            listener(getPreloadState());
        } catch {
            // Progress consumers must not break runtime.
        }
        return () => {
            preloadProgressSubscribers.delete(listener);
        };
    }

    function notifyPreloadProgress() {
        if (preloadProgressSubscribers.size === 0) {
            return;
        }
        const preloadState = getPreloadState();
        for (const listener of preloadProgressSubscribers) {
            try {
                listener(preloadState);
            } catch {
                // Progress consumers must not break runtime.
            }
        }
    }

    function startPreload() {
        if (preloadPromise) {
            notifyPreloadProgress();
            return preloadPromise;
        }
        preloadPromise = preloadAllBuffers();
        notifyPreloadProgress();
        return preloadPromise;
    }

    async function preloadAllBuffers() {
        await preloadBuffersByIds(SOUND_DEFINITION_IDS);
    }

    function resolveSoundIdList(soundIds, fallback = SOUND_DEFINITION_IDS) {
        const source = Array.isArray(soundIds) && soundIds.length > 0 ? soundIds : fallback;
        const resolved = [];
        const seen = new Set();
        for (let i = 0; i < source.length; i += 1) {
            const soundId = typeof source[i] === 'string' ? source[i] : '';
            if (!soundId || seen.has(soundId) || !SOUND_DEFINITIONS[soundId]) {
                continue;
            }
            seen.add(soundId);
            resolved.push(soundId);
        }
        return resolved;
    }

    function createSoundSetState(soundIds = SOUND_DEFINITION_IDS) {
        const ids = resolveSoundIdList(soundIds);
        let filesReady = 0;
        let filesFailed = 0;
        for (let i = 0; i < ids.length; i += 1) {
            const soundId = ids[i];
            if (isSoundReady(soundId)) {
                filesReady += 1;
            } else if (isSoundFailed(soundId)) {
                filesFailed += 1;
            }
        }

        const filesTotal = ids.length;
        const filesDone = Math.min(filesTotal, filesReady + filesFailed);
        const progress = filesTotal > 0 ? filesDone / filesTotal : 1;
        const complete = filesDone >= filesTotal;
        const completeNoFailures = complete && filesFailed === 0 && filesReady >= filesTotal;
        return {
            filesTotal,
            filesReady,
            filesFailed,
            filesDone,
            progress,
            complete,
            completeNoFailures,
        };
    }

    async function preloadBuffersByIds(soundIds = SOUND_DEFINITION_IDS) {
        const ids = resolveSoundIdList(soundIds);
        for (let i = 0; i < ids.length; i += 1) {
            await loadSoundAsset(ids[i]);
            notifyPreloadProgress();
            if ((i + 1) % AUDIO_PRELOAD_BATCH_SIZE === 0) {
                refreshUi();
                await waitForAnimationFrame();
            }
        }
        refreshUi();
        notifyPreloadProgress();
        return createSoundSetState(ids);
    }

    function isStreamingSound(soundId) {
        return Boolean(SOUND_DEFINITIONS[soundId]?.stream);
    }

    function isSoundReady(soundId) {
        if (isStreamingSound(soundId)) {
            const mediaElement = streamMediaElements.get(soundId);
            return (
                readyStreamSounds.has(soundId) ||
                mediaElement?.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
            );
        }
        return buffers.has(soundId);
    }

    function isSoundFailed(soundId) {
        return isStreamingSound(soundId)
            ? failedStreamSounds.has(soundId)
            : failedBuffers.has(soundId);
    }

    async function loadSoundAsset(soundId) {
        if (isStreamingSound(soundId)) {
            return preloadStreamingSound(soundId);
        }
        return loadBuffer(soundId);
    }

    async function loadBuffer(soundId) {
        if (buffers.has(soundId) || failedBuffers.has(soundId)) {
            return buffers.get(soundId) || null;
        }

        if (pendingLoads.has(soundId)) {
            return pendingLoads.get(soundId);
        }

        const definition = SOUND_DEFINITIONS[soundId];
        if (!definition) {
            failedBuffers.add(soundId);
            notifyPreloadProgress();
            return null;
        }

        const loadPromise = (async () => {
            const audioContext = ensureAudioContext();
            if (!audioContext) {
                failedBuffers.add(soundId);
                return null;
            }

            for (let i = 0; i < AUDIO_FETCH_CACHE_MODES.length; i += 1) {
                const cacheMode = AUDIO_FETCH_CACHE_MODES[i];
                try {
                    const response = await window.fetch(definition.src, {
                        method: 'GET',
                        cache: cacheMode,
                    });
                    if (!response.ok) {
                        continue;
                    }
                    const data = await response.arrayBuffer();
                    const decoded = await audioContext.decodeAudioData(data.slice(0));
                    buffers.set(soundId, decoded);
                    return decoded;
                } catch {
                    // Retry with stricter cache mode before marking this file failed.
                }
            }
            failedBuffers.add(soundId);
            notifyPreloadProgress();
            return null;
        })();

        pendingLoads.set(soundId, loadPromise);
        try {
            return await loadPromise;
        } finally {
            pendingLoads.delete(soundId);
        }
    }

    async function preloadStreamingSound(soundId) {
        if (isSoundReady(soundId) || isSoundFailed(soundId)) {
            return streamMediaElements.get(soundId) || null;
        }

        if (pendingLoads.has(soundId)) {
            return pendingLoads.get(soundId);
        }

        const definition = SOUND_DEFINITIONS[soundId];
        if (!definition?.src) {
            failedStreamSounds.add(soundId);
            notifyPreloadProgress();
            return null;
        }

        const loadPromise = new Promise((resolve) => {
            const mediaElement = getOrCreateStreamingMediaElement(soundId);
            if (!mediaElement) {
                failedStreamSounds.add(soundId);
                notifyPreloadProgress();
                resolve(null);
                return;
            }

            if (mediaElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                readyStreamSounds.add(soundId);
                failedStreamSounds.delete(soundId);
                notifyPreloadProgress();
                resolve(mediaElement);
                return;
            }

            let settled = false;
            let timeoutId = null;

            const cleanup = () => {
                if (timeoutId != null) {
                    window.clearTimeout(timeoutId);
                    timeoutId = null;
                }
                mediaElement.removeEventListener('loadeddata', handleReady);
                mediaElement.removeEventListener('canplay', handleReady);
                mediaElement.removeEventListener('error', handleFailure);
            };

            const settle = (loaded) => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                if (loaded) {
                    readyStreamSounds.add(soundId);
                    failedStreamSounds.delete(soundId);
                } else {
                    failedStreamSounds.add(soundId);
                }
                notifyPreloadProgress();
                resolve(loaded ? mediaElement : null);
            };

            const handleReady = () => {
                settle(true);
            };
            const handleFailure = () => {
                settle(false);
            };

            mediaElement.addEventListener('loadeddata', handleReady, { once: true });
            mediaElement.addEventListener('canplay', handleReady, { once: true });
            mediaElement.addEventListener('error', handleFailure, { once: true });
            timeoutId = window.setTimeout(() => {
                settle(mediaElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
            }, 15000);
        });

        pendingLoads.set(soundId, loadPromise);
        try {
            return await loadPromise;
        } finally {
            pendingLoads.delete(soundId);
        }
    }

    function getOrCreateStreamingMediaElement(soundId, options = {}) {
        const definition = SOUND_DEFINITIONS[soundId];
        if (!definition?.src) {
            return null;
        }

        const shouldLoop = options.loop ?? Boolean(definition.loop);
        let mediaElement = streamMediaElements.get(soundId);
        if (!mediaElement) {
            mediaElement = document.createElement('audio');
            mediaElement.preload = 'auto';
            mediaElement.crossOrigin = 'anonymous';
            mediaElement.playsInline = true;
            mediaElement.autoplay = false;
            mediaElement.setAttribute('playsinline', '');
            mediaElement.setAttribute('webkit-playsinline', '');
            mediaElement.src = definition.src;
            mediaElement.load();
            streamMediaElements.set(soundId, mediaElement);
        }

        mediaElement.loop = Boolean(shouldLoop);
        mediaElement.muted = false;
        mediaElement.defaultMuted = false;
        mediaElement.volume = 1;
        return mediaElement;
    }

    function ensureStreamingMediaPlayback(instance, nowMs = performance.now()) {
        const mediaElement = instance?.mediaElement;
        if (!mediaElement) {
            return;
        }
        if (!mediaElement.paused && !mediaElement.ended) {
            return;
        }
        if (nowMs - (instance.lastPlayAttemptTime || -Infinity) < 1200) {
            return;
        }
        instance.lastPlayAttemptTime = nowMs;
        const playPromise = mediaElement.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
        }
    }

    function disposeStreamingMediaElements() {
        for (const mediaElement of streamMediaElements.values()) {
            try {
                mediaElement.pause();
            } catch {
                // Ignore pause failures during teardown.
            }
            mediaElement.removeAttribute('src');
            try {
                mediaElement.load();
            } catch {
                // Ignore release failures during teardown.
            }
        }
        streamMediaElements.clear();
        readyStreamSounds.clear();
        failedStreamSounds.clear();
    }

    function applyBusVolumes() {
        if (!mixer || !context) {
            return;
        }

        const now = context.currentTime;
        const masterTarget = prefs.muted ? 0 : prefs.masterVolume;
        mixer.masterGain.gain.setTargetAtTime(masterTarget, now, 0.03);
        mixer.buses.vehicles.gain.setTargetAtTime(prefs.vehiclesVolume, now, 0.03);
        mixer.buses.botVehicles.gain.setTargetAtTime(prefs.botVehiclesVolume, now, 0.03);
        mixer.buses.effects.gain.setTargetAtTime(prefs.effectsVolume, now, 0.03);
        mixer.buses.ambience.gain.setTargetAtTime(prefs.ambienceVolume, now, 0.03);
        mixer.buses.music.gain.setTargetAtTime(1, now, 0.03);
        mixer.buses.menuMusic.gain.setTargetAtTime(prefs.menuMusicVolume, now, 0.03);
        mixer.buses.gameMusic.gain.setTargetAtTime(prefs.gameMusicVolume, now, 0.03);
        mixer.buses.ui.gain.setTargetAtTime(prefs.uiVolume, now, 0.03);
    }

    function getMixerSnapshot() {
        const uiState = resolveAudioUiState();
        return {
            available: Boolean(AudioContextCtor),
            unlocked,
            gameplayReady,
            muted: Boolean(prefs.muted),
            statusTone: uiState.statusTone,
            statusLabel: uiState.statusLabel,
            statusText: uiState.statusText,
            sliders: createMixerSliderSnapshot(),
        };
    }

    function getMixerPrefsSnapshot() {
        return sanitizeAudioPrefs(prefs, runtimeDefaultPrefs);
    }

    function setMixerVolume(key, normalizedValue) {
        if (!isMixerSliderKey(key)) {
            return getMixerSnapshot();
        }
        prefs[key] = clampNumber(normalizedValue, 0, 1, runtimeDefaultPrefs[key]);
        persistAudioPrefs(prefs, runtimeDefaultPrefs);
        markRuntimeDefaultsDirty();
        applyBusVolumes();
        refreshUi();
        emitPrefsChanged('volume');
        return getMixerSnapshot();
    }

    function applyMixerPrefs(nextPrefs = null, options = {}) {
        applyResolvedAudioPrefs(nextPrefs);
        if (options.persistLocal !== false) {
            persistAudioPrefs(prefs, runtimeDefaultPrefs);
        }
        if (options.markRuntimeDefaultsDirty === true) {
            markRuntimeDefaultsDirty();
        }
        applyBusVolumes();
        refreshUi();
        if (options.notify !== false) {
            emitPrefsChanged(options.reason || 'apply');
        }
        return getMixerSnapshot();
    }

    function toggleMute(options = {}) {
        const nextMuted = !prefs.muted;
        prefs.muted = nextMuted;
        persistAudioPrefs(prefs, runtimeDefaultPrefs);
        applyBusVolumes();
        refreshUi();
        emitPrefsChanged('mute');
        if (options?.playFeedback) {
            playVariant('uiClickSoft', { gain: 0.55 });
        }
        return getMixerSnapshot();
    }

    function resetMixerToDefaults(options = {}) {
        applyMixerPrefs(runtimeDefaultPrefs, {
            persistLocal: true,
            markRuntimeDefaultsDirty: true,
            notify: true,
            reason: 'reset',
        });
        if (options?.playFeedback) {
            void unlockAudio().then((unlockedNow) => {
                if (!unlockedNow) {
                    return;
                }
                playVariant('uiClickSoft', {
                    gain: 0.55,
                });
            });
        }
        return getMixerSnapshot();
    }

    function beginSliderPreview(key, options = {}) {
        if (!isMixerSliderKey(key) || !isAudioOutputReady()) {
            return false;
        }

        const mode = typeof options.mode === 'string' ? options.mode : 'pointer';
        if (sliderPreviewState.key !== key) {
            const nextToken = sliderPreviewState.token + 1;
            endSliderPreview();
            sliderPreviewState = {
                key,
                token: nextToken,
                instances: [],
                intervalIds: [],
                keyboardReleaseTimer: 0,
                lastUiAccentAtMs: -Number.POSITIVE_INFINITY,
                lastEffectsAccentAtMs: -Number.POSITIVE_INFINITY,
            };
            applySliderPreviewMixState();
            void startSliderPreviewScene(key, nextToken);
        }

        if (mode === 'keyboard') {
            scheduleSliderPreviewKeyboardRelease();
        } else {
            clearSliderPreviewKeyboardReleaseTimer();
        }
        return true;
    }

    function handleSliderPreviewInteraction(key, options = {}) {
        if (!isMixerSliderKey(key) || !isAudioOutputReady()) {
            return false;
        }

        const mode = typeof options.mode === 'string' ? options.mode : 'pointer';
        if (sliderPreviewState.key !== key) {
            beginSliderPreview(key, {
                mode,
            });
        }

        if (key === 'uiVolume' || key === 'masterVolume') {
            triggerSliderPreviewUiAccent();
        }
        if (key === 'effectsVolume' || key === 'masterVolume') {
            triggerSliderPreviewEffectsAccent();
        }

        if (mode === 'keyboard') {
            scheduleSliderPreviewKeyboardRelease();
        }
        return true;
    }

    function endSliderPreview(key = '') {
        if (key && sliderPreviewState.key && sliderPreviewState.key !== key) {
            return false;
        }

        clearSliderPreviewKeyboardReleaseTimer();
        while (sliderPreviewState.intervalIds.length > 0) {
            window.clearInterval(sliderPreviewState.intervalIds.pop());
        }

        const activeInstances = sliderPreviewState.instances.splice(0);
        const hadActivePreview = Boolean(sliderPreviewState.key) || activeInstances.length > 0;
        sliderPreviewState = {
            key: '',
            token: sliderPreviewState.token,
            instances: [],
            intervalIds: [],
            keyboardReleaseTimer: 0,
            lastUiAccentAtMs: -Number.POSITIVE_INFINITY,
            lastEffectsAccentAtMs: -Number.POSITIVE_INFINITY,
        };
        applySliderPreviewMixState();

        for (let index = 0; index < activeInstances.length; index += 1) {
            stopSliderPreviewInstance(activeInstances[index]);
        }

        return hadActivePreview;
    }

    function clearSliderPreviewKeyboardReleaseTimer() {
        if (!sliderPreviewState.keyboardReleaseTimer) {
            return;
        }
        window.clearTimeout(sliderPreviewState.keyboardReleaseTimer);
        sliderPreviewState.keyboardReleaseTimer = 0;
    }

    function scheduleSliderPreviewKeyboardRelease() {
        clearSliderPreviewKeyboardReleaseTimer();
        sliderPreviewState.keyboardReleaseTimer = window.setTimeout(() => {
            sliderPreviewState.keyboardReleaseTimer = 0;
            endSliderPreview();
        }, AUDIO_MIXER_PREVIEW_KEYBOARD_RELEASE_MS);
    }

    function applySliderPreviewMixState() {
        runtime.previewMenuMusicDuck = resolveSliderPreviewMenuDuck(sliderPreviewState.key);
        if (isAudioOutputReady()) {
            updateWelcomeMenuMusic({
                welcomeVisible: runtime.welcomeVisible,
            });
        }
    }

    function resolveSliderPreviewMenuDuck(key = '') {
        if (
            key === 'gameMusicVolume' ||
            key === 'ambienceVolume' ||
            key === 'effectsVolume' ||
            key === 'uiVolume' ||
            key === 'vehiclesVolume' ||
            key === 'botVehiclesVolume'
        ) {
            return AUDIO_MIXER_PREVIEW_MENU_DUCK;
        }
        return 1;
    }

    async function startSliderPreviewScene(key, token) {
        if (!isSliderPreviewTokenActive(token, key)) {
            return;
        }

        switch (key) {
            case 'masterVolume':
                void startSliderPreviewLoop('cityAmbienceDayLoop01', token, {
                    gain: 1,
                });
                void startSliderPreviewLoop('raceCrowdFarLoop01', token, {
                    gain: 0.44,
                    rate: 0.98,
                });
                void startSliderPreviewLoop('engineIdleLoop01', token, {
                    gain: 0.72,
                    rate: 0.92,
                });
                void startSliderPreviewLoop('engineLowLoop01', token, {
                    gain: 0.66,
                    rate: 1.02,
                });
                void startSliderPreviewLoop('chargingLoop01', token, {
                    gain: 0.72,
                    rate: 1.02,
                });
                triggerSliderPreviewUiAccent(true);
                triggerSliderPreviewEffectsAccent(true);
                registerSliderPreviewInterval(
                    token,
                    AUDIO_MIXER_PREVIEW_MASTER_UI_REPEAT_MS,
                    () => {
                        triggerSliderPreviewUiAccent(true);
                    }
                );
                registerSliderPreviewInterval(
                    token,
                    AUDIO_MIXER_PREVIEW_MASTER_SFX_REPEAT_MS,
                    () => {
                        triggerSliderPreviewEffectsAccent(true);
                    }
                );
                break;
            case 'menuMusicVolume':
                // The live welcome-menu loop is already active on this screen.
                break;
            case 'gameMusicVolume':
                void startSliderPreviewLoop(MONUMENT_MUSIC_SOUND_ID, token, {
                    gain: 1,
                });
                break;
            case 'effectsVolume':
                void startSliderPreviewLoop('chargingLoop01', token, {
                    gain: 0.8,
                    rate: 1.02,
                });
                triggerSliderPreviewEffectsAccent(true);
                registerSliderPreviewInterval(token, AUDIO_MIXER_PREVIEW_SFX_REPEAT_MS, () => {
                    triggerSliderPreviewEffectsAccent(true);
                });
                break;
            case 'ambienceVolume':
                void startSliderPreviewLoop('cityAmbienceDayLoop01', token, {
                    gain: 1,
                });
                void startSliderPreviewLoop('raceCrowdFarLoop01', token, {
                    gain: 0.48,
                    rate: 0.98,
                });
                break;
            case 'uiVolume':
                triggerSliderPreviewUiAccent(true);
                registerSliderPreviewInterval(token, AUDIO_MIXER_PREVIEW_UI_REPEAT_MS, () => {
                    triggerSliderPreviewUiAccent(true);
                });
                break;
            case 'vehiclesVolume':
                void startSliderPreviewLoop('engineIdleLoop01', token, {
                    gain: 0.78,
                    rate: 0.94,
                });
                void startSliderPreviewLoop('engineLowLoop01', token, {
                    gain: 0.84,
                    rate: 1.02,
                });
                break;
            case 'botVehiclesVolume':
                void startSliderPreviewLoop('engineLowLoop01', token, {
                    gain: 0.64,
                    rate: 0.98,
                    busKey: 'botVehicles',
                });
                void startSliderPreviewLoop('engineMidLoop01', token, {
                    gain: 0.48,
                    rate: 1.06,
                    busKey: 'botVehicles',
                });
                break;
            default:
                break;
        }
    }

    async function startSliderPreviewLoop(soundId, token, options = {}) {
        const instance = await createSliderPreviewLoopInstance(soundId, token, options);
        if (!instance) {
            return null;
        }
        if (!isSliderPreviewTokenActive(token)) {
            stopSliderPreviewInstance(instance, {
                immediate: true,
            });
            return null;
        }
        sliderPreviewState.instances.push(instance);
        return instance;
    }

    async function createSliderPreviewLoopInstance(soundId, token, options = {}) {
        if (!isSliderPreviewTokenActive(token)) {
            return null;
        }

        const definition = SOUND_DEFINITIONS[soundId];
        const audioContext = ensureAudioContext();
        const busKey =
            typeof options.busKey === 'string' && options.busKey.trim()
                ? options.busKey.trim()
                : definition?.bus;
        const busNode = busKey ? mixer?.buses?.[busKey] : null;
        if (!definition || !audioContext || !busNode) {
            return null;
        }

        const targetGain =
            clampNumber(options.gain, 0.05, 2, 1) * clampNumber(definition.gain, 0.05, 2, 1);
        const playbackRate = clampNumber(options.rate, 0.6, 1.6, 1);
        const now = audioContext.currentTime;

        if (definition.stream) {
            const mediaElement = document.createElement('audio');
            mediaElement.src = definition.src;
            mediaElement.preload = 'auto';
            mediaElement.loop = true;
            mediaElement.playsInline = true;
            mediaElement.crossOrigin = 'anonymous';
            mediaElement.playbackRate = playbackRate;
            mediaElement.volume = 1;

            const mediaSource = audioContext.createMediaElementSource(mediaElement);
            const gainNode = audioContext.createGain();
            gainNode.gain.setValueAtTime(0.0001, now);

            mediaSource.connect(gainNode);
            gainNode.connect(busNode);
            gainNode.gain.exponentialRampToValueAtTime(
                Math.max(0.0001, targetGain),
                now + AUDIO_MIXER_PREVIEW_FADE_IN_SEC
            );

            try {
                await mediaElement.play();
            } catch {
                safeDisconnect(mediaSource);
                safeDisconnect(gainNode);
                return null;
            }

            return {
                kind: 'stream-preview',
                mediaElement,
                mediaSource,
                gain: gainNode,
            };
        }

        const buffer = buffers.get(soundId) || (await loadBuffer(soundId));
        if (!buffer || !isSliderPreviewTokenActive(token)) {
            return null;
        }

        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.playbackRate.setValueAtTime(playbackRate, now);

        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(0.0001, now);

        source.connect(gainNode);
        gainNode.connect(busNode);
        gainNode.gain.exponentialRampToValueAtTime(
            Math.max(0.0001, targetGain),
            now + AUDIO_MIXER_PREVIEW_FADE_IN_SEC
        );

        const duration = Number(buffer.duration);
        const offset =
            Number.isFinite(duration) && duration > 0.36
                ? randomRange(0, Math.max(0.01, duration - 0.18))
                : 0;
        source.start(now, offset);

        return {
            kind: 'buffer-preview',
            source,
            gain: gainNode,
        };
    }

    function stopSliderPreviewInstance(instance, options = {}) {
        if (!instance || !context) {
            return;
        }
        const immediate = options.immediate === true;
        const now = context.currentTime;
        const releaseSec = immediate ? 0.01 : AUDIO_MIXER_PREVIEW_FADE_OUT_SEC;
        const targetNode = instance.gain?.gain;
        if (targetNode) {
            const currentValue = Math.max(0.0001, Number(targetNode.value) || 0.0001);
            try {
                targetNode.cancelScheduledValues(now);
                targetNode.setValueAtTime(currentValue, now);
                targetNode.exponentialRampToValueAtTime(0.0001, now + releaseSec);
            } catch {
                // Ignore nodes that are already being torn down.
            }
        }

        const cleanupDelayMs = immediate ? 0 : Math.round((releaseSec + 0.08) * 1000);
        window.setTimeout(() => {
            if (instance.kind === 'stream-preview') {
                try {
                    instance.mediaElement?.pause?.();
                } catch {
                    // Ignore pause failures during teardown.
                }
                safeDisconnect(instance.mediaSource);
                safeDisconnect(instance.gain);
                return;
            }
            safeStopSource(instance.source);
            safeDisconnect(instance.source);
            safeDisconnect(instance.gain);
        }, cleanupDelayMs);
    }

    function registerSliderPreviewInterval(token, intervalMs, callback) {
        if (!isSliderPreviewTokenActive(token) || typeof callback !== 'function') {
            return 0;
        }

        const intervalId = window.setInterval(() => {
            if (!isSliderPreviewTokenActive(token)) {
                window.clearInterval(intervalId);
                return;
            }
            callback();
        }, intervalMs);
        sliderPreviewState.intervalIds.push(intervalId);
        return intervalId;
    }

    function triggerSliderPreviewUiAccent(force = false) {
        if (!isAudioOutputReady()) {
            return false;
        }
        const nowMs = performance.now();
        if (
            !force &&
            nowMs - sliderPreviewState.lastUiAccentAtMs < AUDIO_MIXER_PREVIEW_UI_THROTTLE_MS
        ) {
            return false;
        }
        sliderPreviewState.lastUiAccentAtMs = nowMs;
        return playUiVariant('uiClickSoft', {
            gain: 0.64,
            rateScale: randomRange(0.98, 1.02),
        });
    }

    function triggerSliderPreviewEffectsAccent(force = false) {
        if (!isAudioOutputReady()) {
            return false;
        }
        const nowMs = performance.now();
        if (
            !force &&
            nowMs - sliderPreviewState.lastEffectsAccentAtMs < AUDIO_MIXER_PREVIEW_SFX_THROTTLE_MS
        ) {
            return false;
        }
        sliderPreviewState.lastEffectsAccentAtMs = nowMs;
        return playVariant('pickupCollect', {
            gain: 0.88,
            rateScale: randomRange(0.98, 1.05),
        });
    }

    function isSliderPreviewTokenActive(token, key = '') {
        return (
            Number.isFinite(token) &&
            token > 0 &&
            Boolean(sliderPreviewState.key) &&
            sliderPreviewState.token === token &&
            (!key || sliderPreviewState.key === key)
        );
    }

    function emitPrefsChanged(reason = 'update') {
        if (typeof onPrefsChanged !== 'function') {
            return;
        }
        try {
            onPrefsChanged(getMixerPrefsSnapshot(), {
                reason,
                unlocked,
                gameplayReady,
            });
        } catch {
            // Settings listeners must not interrupt audio updates.
        }
    }

    function refreshUi() {
        if (!ui) {
            return;
        }

        const uiState = resolveAudioUiState({
            embedded: Boolean(ui.embedded),
        });
        ui.root.dataset.tone = uiState.statusTone;
        ui.controlsRow.dataset.unlocked = unlocked ? 'true' : 'false';
        ui.unlockButton.hidden = unlocked;
        ui.muteBtn.textContent = prefs.muted ? 'UNMUTE ALL' : 'MUTE ALL';
        ui.status.textContent = uiState.statusText;

        for (let i = 0; i < MIXER_SLIDERS.length; i += 1) {
            const slider = MIXER_SLIDERS[i];
            const row = ui.sliderRows.get(slider.key);
            if (!row) {
                continue;
            }
            const value = clampNumber(prefs[slider.key], 0, 1, runtimeDefaultPrefs[slider.key]);
            const percent = Math.round(value * 100);
            row.input.value = String(percent);
            row.input.style.setProperty('--audio-slider-fill', `${percent}%`);
            row.value.textContent = formatAudioSliderPercentLabel(percent);
        }
    }

    function resolveAudioUiState(options = {}) {
        const embedded = Boolean(options?.embedded);
        const preloadState = getPreloadState();
        const filesTotal = preloadState.filesTotal;
        const filesReady = preloadState.filesReady;
        const filesFailed = preloadState.filesFailed;
        const canUseAudio = Boolean(context);

        let statusTone = 'offline';
        let statusLabel = 'Offline';
        let statusText = 'Audio unavailable in this browser';

        if (canUseAudio && !unlocked) {
            statusTone = context?.state === 'suspended' ? 'locked' : 'offline';
            statusLabel = 'Locked';
            statusText = embedded
                ? 'Click any control to activate sound. Your mix saves automatically.'
                : 'Tap/click to unlock audio';
        } else if (canUseAudio && preloadPromise && !preloadState.complete) {
            statusTone = 'priming';
            statusLabel = 'Loading';
            statusText = embedded
                ? `Live mix active. Loading remaining audio (${filesReady}/${filesTotal}).`
                : `Preparing gameplay audio (${filesReady}/${filesTotal})`;
        } else if (canUseAudio && gameplayReady) {
            statusTone = 'ready';
            statusLabel = 'Ready';
            statusText = embedded
                ? 'Live mix active. Changes save automatically.'
                : `Audio ready (${filesReady}/${filesTotal})`;
        } else if (canUseAudio) {
            statusTone = 'priming';
            statusLabel = 'Primed';
            statusText = embedded
                ? 'Audio active. Fine-tune the mix for menus and gameplay.'
                : `Audio primed (${filesReady}/${filesTotal})`;
        }

        if (filesFailed > 0) {
            statusText += embedded
                ? ` Missing files: ${filesFailed}.`
                : ` | Missing/invalid: ${filesFailed}`;
        }

        return {
            statusTone,
            statusLabel,
            statusText,
        };
    }

    function createMixerSliderSnapshot() {
        const sliders = [];
        for (let i = 0; i < MIXER_SLIDERS.length; i += 1) {
            const slider = MIXER_SLIDERS[i];
            sliders.push({
                key: slider.key,
                label: slider.label,
                value: clampNumber(prefs[slider.key], 0, 1, runtimeDefaultPrefs[slider.key]),
            });
        }
        return sliders;
    }

    function isMixerSliderKey(key) {
        return MIXER_SLIDERS.some((slider) => slider.key === key);
    }

    function markRuntimeDefaultsDirty() {
        runtimeDefaultsDirty = true;
        if (!runtimeDefaultsLoaded) {
            return;
        }
        scheduleRuntimeDefaultsSave();
    }

    function scheduleRuntimeDefaultsSave() {
        if (!canEditRuntimeDefaults || !runtimeDefaultsDirty || disposed) {
            return;
        }
        if (runtimeDefaultsSaveTimer) {
            window.clearTimeout(runtimeDefaultsSaveTimer);
        }
        runtimeDefaultsSaveTimer = window.setTimeout(() => {
            runtimeDefaultsSaveTimer = 0;
            void saveRuntimeDefaultsToServer();
        }, AUDIO_PREFS_DEFAULTS_SAVE_DEBOUNCE_MS);
    }

    async function loadRuntimeAudioDefaults() {
        if (runtimeDefaultsLoadPromise) {
            return runtimeDefaultsLoadPromise;
        }

        runtimeDefaultsLoadPromise = (async () => {
            try {
                const response = await window.fetch(AUDIO_PREFS_DEFAULTS_API_PATH, {
                    method: 'GET',
                    cache: 'no-store',
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                    },
                });
                if (!response.ok) {
                    runtimeDefaultsLoaded = true;
                    return false;
                }

                const payload = await response.json();
                const nextDefaults = sanitizeAudioPrefs(payload?.defaults, DEFAULT_AUDIO_PREFS);
                runtimeDefaultPrefs = nextDefaults;
                canEditRuntimeDefaults = Boolean(payload?.canEditDefaults);
                runtimeDefaultsSaveSignature = serializeAudioPrefs(nextDefaults);
                runtimeDefaultsLoaded = true;

                if (!persistedPrefsState.hasStoredPrefs && !runtimeDefaultsDirty) {
                    applyResolvedAudioPrefs(nextDefaults);
                    applyBusVolumes();
                    refreshUi();
                }
                if (runtimeDefaultsDirty) {
                    scheduleRuntimeDefaultsSave();
                }
                return true;
            } catch {
                runtimeDefaultsLoaded = true;
                return false;
            }
        })();

        return runtimeDefaultsLoadPromise;
    }

    function applyResolvedAudioPrefs(nextPrefs = {}) {
        const resolved = sanitizeAudioPrefs(nextPrefs, runtimeDefaultPrefs);
        for (let index = 0; index < MIXER_SLIDERS.length; index += 1) {
            const key = MIXER_SLIDERS[index].key;
            prefs[key] = resolved[key];
        }
        prefs.muted = Boolean(resolved.muted);
    }

    async function saveRuntimeDefaultsToServer() {
        if (!canEditRuntimeDefaults || !runtimeDefaultsDirty || disposed) {
            return false;
        }

        const safeDefaults = sanitizeAudioPrefs(
            {
                ...prefs,
                muted: false,
            },
            runtimeDefaultPrefs
        );
        const nextSignature = serializeAudioPrefs(safeDefaults);
        if (nextSignature === runtimeDefaultsSaveSignature) {
            runtimeDefaultsDirty = false;
            return true;
        }

        try {
            const response = await window.fetch(AUDIO_PREFS_DEFAULTS_API_PATH, {
                method: 'POST',
                cache: 'no-store',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(safeDefaults),
            });
            if (!response.ok) {
                return false;
            }

            const payload = await response.json();
            if (!payload?.ok) {
                return false;
            }

            runtimeDefaultPrefs = sanitizeAudioPrefs(payload.defaults, safeDefaults);
            runtimeDefaultsSaveSignature = serializeAudioPrefs(runtimeDefaultPrefs);
            runtimeDefaultsDirty = false;
            return true;
        } catch {
            return false;
        }
    }

    function installUnlockListeners() {
        const unlockHandler = () => {
            void unlockAudio();
        };
        const events = ['pointerdown', 'keydown', 'touchstart'];
        for (let i = 0; i < events.length; i += 1) {
            const eventName = events[i];
            window.addEventListener(eventName, unlockHandler, {
                capture: true,
                passive: true,
            });
            unlockListeners.push({
                eventName,
                handler: unlockHandler,
            });
        }
    }

    function removeUnlockListeners() {
        while (unlockListeners.length > 0) {
            const entry = unlockListeners.pop();
            window.removeEventListener(entry.eventName, entry.handler, {
                capture: true,
            });
        }
    }

    function installUiInteractionListeners() {
        if (uiInteractionListeners.length > 0) {
            return;
        }

        const handleButtonClick = (event) => {
            if (!isAudioOutputReady()) {
                return;
            }

            const target = resolveUiInteractionTarget(event.target);
            if (!target) {
                return;
            }

            playUiVariant('uiClickSoft', {
                gain: 0.55,
                rateScale: randomRange(0.98, 1.03),
            });
        };

        const listeners = [
            {
                eventName: 'click',
                handler: handleButtonClick,
            },
        ];

        for (let i = 0; i < listeners.length; i += 1) {
            const entry = listeners[i];
            document.addEventListener(entry.eventName, entry.handler, {
                capture: true,
                passive: true,
            });
            uiInteractionListeners.push(entry);
        }
    }

    function removeUiInteractionListeners() {
        while (uiInteractionListeners.length > 0) {
            const entry = uiInteractionListeners.pop();
            document.removeEventListener(entry.eventName, entry.handler, {
                capture: true,
            });
        }
    }

    function resolveUiInteractionTarget(target) {
        if (!(target instanceof Element)) {
            return null;
        }

        const candidate = target.closest(UI_INTERACTION_SELECTOR);
        if (!(candidate instanceof Element)) {
            return null;
        }
        if (candidate.getAttribute('data-ui-sound') === 'off') {
            return null;
        }
        if ('disabled' in candidate && candidate.disabled) {
            return null;
        }
        if (candidate.getAttribute('aria-disabled') === 'true') {
            return null;
        }
        return candidate;
    }

    function update(deltaTime = 1 / 60, frameState = {}) {
        if (disposed) {
            return;
        }

        const editModeActive = Boolean(frameState.editModeActive);
        if (ui?.root) {
            ui.root.hidden = ui.embedded ? false : !editModeActive;
        }

        const welcomeVisible = Boolean(frameState.welcomeVisible);
        runtime.welcomeVisible = welcomeVisible;

        if (isAudioOutputReady()) {
            updateWelcomeMenuMusic({
                welcomeVisible,
            });
        }

        const dt = Math.min(Math.max(deltaTime || 0, 0), 0.05);
        tickEventCooldowns(dt);

        if (!isRealtimeAudioReady()) {
            return;
        }

        const vehicleState = frameState.vehicleState || {};
        const speedAbs = Math.abs(Number(vehicleState.speed) || 0);
        const steerAbs = Math.abs(Number(vehicleState.steerInput) || 0);
        const throttle = clampNumber(vehicleState.throttle, 0, 1, 0);
        const brake = clampNumber(vehicleState.brake, 0, 1, 0);
        const burnout = clampNumber(vehicleState.burnout, 0, 1, 0);

        const isPaused = Boolean(frameState.isPaused);
        const isCarDestroyed = Boolean(frameState.isCarDestroyed);
        const pickupRoundFinished = Boolean(
            frameState.pickupRoundFinished ?? frameState.roundFinished
        );
        const batteryDepleted = Boolean(frameState.isBatteryDepleted);
        const isChargingActive = Boolean(frameState.isChargingActive);
        const chargingLevel = clampNumber(frameState.chargingLevel, 0, 1, 0);
        const trafficDescriptors = Array.isArray(frameState.trafficDescriptors)
            ? frameState.trafficDescriptors
            : Array.isArray(frameState.botDescriptors)
              ? frameState.botDescriptors
              : EMPTY_ARRAY;

        const driveAudioEnabled =
            !isPaused &&
            !welcomeVisible &&
            !editModeActive &&
            !isCarDestroyed &&
            !pickupRoundFinished;
        const speedNorm = clampNumber(speedAbs / 42, 0, 1, 0);
        const throttleNorm = clampNumber(throttle, 0, 1, 0);
        const brakeNorm = clampNumber(brake, 0, 1, 0);

        const batteryDriveScale = batteryDepleted ? 0.5 : 1;

        const idleGain = driveAudioEnabled
            ? clampNumber(1.03 - speedNorm * 1.8 + throttleNorm * 0.14, 0, 1, 0) * batteryDriveScale
            : 0;
        const lowGain = driveAudioEnabled
            ? bellCurve(speedNorm, 0.22, 0.26) * (0.7 + throttleNorm * 0.3) * batteryDriveScale
            : 0;
        const midGain = driveAudioEnabled
            ? bellCurve(speedNorm, 0.54, 0.27) * (0.65 + throttleNorm * 0.35) * batteryDriveScale
            : 0;
        const highGain = driveAudioEnabled
            ? bellCurve(speedNorm, 0.79, 0.22) * (0.6 + throttleNorm * 0.4) * batteryDriveScale
            : 0;
        const redlineGain = driveAudioEnabled
            ? clampNumber((speedNorm - 0.72) / 0.28, 0, 1, 0) *
              (0.5 + throttleNorm * 0.5) *
              batteryDriveScale
            : 0;

        const windGain = driveAudioEnabled ? Math.pow(speedNorm, 1.4) : 0;
        const skidIntent = driveAudioEnabled
            ? clampNumber(
                  burnout * 0.84 +
                      brakeNorm * steerAbs * clampNumber(speedNorm * 1.4, 0, 1, 0) * 0.92,
                  0,
                  1,
                  0
              )
            : 0;
        const handbrakeScrapeGain = driveAudioEnabled
            ? clampNumber(
                  brakeNorm * steerAbs * clampNumber((speedNorm - 0.1) / 0.35, 0, 1, 0),
                  0,
                  1,
                  0
              )
            : 0;
        const suspensionRattleGain = driveAudioEnabled
            ? clampNumber(
                  (Math.abs(vehicleState.acceleration || 0) / 38) * (0.25 + speedNorm * 0.75),
                  0,
                  1,
                  0
              )
            : 0;

        const playerPosition = frameState.playerPosition || null;
        const lowerLevelSilenceFactor = getWorldSilenceFactorAtPosition(playerPosition);
        const undergroundParkingIsolationActive = isUndergroundParkingSpaceIsolatedPosition(
            playerPosition,
            0.18
        );
        runtime.playerPosition = playerPosition;
        runtime.lowerLevelSilenceFactor = lowerLevelSilenceFactor;

        const ambienceBase = welcomeVisible ? WELCOME_MENU_AMBIENCE_GAIN : 0.38;
        const ambienceGameplayBoost = driveAudioEnabled ? 0.2 : 0;
        const crowdGain = welcomeVisible ? WELCOME_MENU_CROWD_GAIN : driveAudioEnabled ? 0.2 : 0.1;
        const ambienceOcclusion = undergroundParkingIsolationActive
            ? 0
            : Math.max(0.04, 1 - lowerLevelSilenceFactor * 0.96);
        const crowdOcclusion = undergroundParkingIsolationActive
            ? 0
            : Math.max(0.02, 1 - lowerLevelSilenceFactor * 0.995);

        updateLoopLayer(
            'engineIdleLoop01',
            idleGain,
            0.82 + throttleNorm * 0.28 + speedNorm * 0.12
        );
        updateLoopLayer('engineLowLoop01', lowGain, 0.88 + speedNorm * 0.46);
        updateLoopLayer('engineMidLoop01', midGain, 0.9 + speedNorm * 0.58);
        updateLoopLayer('engineHighLoop01', highGain, 0.94 + speedNorm * 0.72);
        updateLoopLayer('engineRedlineLoop01', redlineGain, 1.02 + speedNorm * 0.72);
        updateLoopLayer('windSpeedLoop01', windGain, 0.84 + speedNorm * 0.72);
        updateLoopLayer('skidLoop01', skidIntent, 0.86 + speedNorm * 0.26);
        updateLoopLayer('handbrakeScrapeLoop01', handbrakeScrapeGain, 0.92 + speedNorm * 0.22);
        updateLoopLayer('suspensionRattleLoop01', suspensionRattleGain, 0.88 + speedNorm * 0.18);

        updateLoopLayer(
            'chargingLoop01',
            isChargingActive ? 0.3 + chargingLevel * 0.5 : 0,
            0.92 + chargingLevel * 0.24
        );

        updateLoopLayer(
            'cityAmbienceDayLoop01',
            (ambienceBase + ambienceGameplayBoost) * ambienceOcclusion,
            1
        );
        updateLoopLayer('raceCrowdFarLoop01', crowdGain * crowdOcclusion, 0.96 + speedNorm * 0.06);

        // Reserved loop: prepared for future per-mine beeper routing.
        updateLoopLayer('mineBeepLoop01', 0, 1);

        updateAudioListenerFromCamera(context, camera);
        updateBotTrafficAudio({
            trafficDescriptors,
            driveAudioEnabled,
            gameMode: frameState.gameMode,
            undergroundParkingIsolationActive,
        });

        if (runtime.lastChargingActive !== isChargingActive) {
            runtime.lastChargingActive = isChargingActive;
            if (isChargingActive) {
                if (isEventReady('chargingStart', EVENT_COOLDOWNS.chargingStart)) {
                    playOneShot('chargingStart01', {
                        gain: 0.74,
                        rateScale: 1.02,
                    });
                }
            } else if (isEventReady('chargingStop', EVENT_COOLDOWNS.chargingStop)) {
                playOneShot('chargingStop01', {
                    gain: 0.72,
                });
            }
        }

        if (runtime.lastBatteryDepleted !== batteryDepleted) {
            runtime.lastBatteryDepleted = batteryDepleted;
            if (batteryDepleted) {
                onBatteryDepleted();
            } else {
                onBatteryRestored();
            }
        }
        updateLorienGalleryVideoAudio({
            isPaused,
            welcomeVisible,
            editModeActive,
            pickupRoundFinished,
        });
        updateUfoDiskoStoreMusic({
            isPaused,
            welcomeVisible,
            editModeActive,
            pickupRoundFinished,
        });
        updateMonumentMusic({
            isPaused,
            welcomeVisible,
            editModeActive,
            pickupRoundFinished,
            lowerLevelSilenceFactor,
            undergroundParkingIsolationActive,
        });
    }

    function updateWelcomeMenuMusic(frameState = {}) {
        const shouldBeAudible = Boolean(frameState.welcomeVisible);
        const instance =
            loopInstances.get(WELCOME_MENU_MUSIC_SOUND_ID) ||
            (shouldBeAudible ? ensureLoopInstance(WELCOME_MENU_MUSIC_SOUND_ID) : null);
        if (!instance || !context) {
            return;
        }
        const definitionGain = SOUND_DEFINITIONS[WELCOME_MENU_MUSIC_SOUND_ID]?.gain || 1;
        instance.gain.gain.setTargetAtTime(
            (shouldBeAudible ? WELCOME_MENU_MUSIC_GAIN * runtime.previewMenuMusicDuck : 0) *
                definitionGain,
            context.currentTime,
            shouldBeAudible ? 0.42 : 0.18
        );
    }

    function onVehicleCollisionContacts(contacts = []) {
        if (!isRealtimeAudioReady()) {
            return;
        }
        if (!Array.isArray(contacts) || contacts.length === 0) {
            return;
        }
        if (!isEventReady('collision', EVENT_COOLDOWNS.collision)) {
            return;
        }

        let strongest = 0;
        for (let i = 0; i < contacts.length; i += 1) {
            strongest = Math.max(strongest, Number(contacts[i]?.impactSpeed) || 0);
        }
        if (strongest <= 0.5) {
            return;
        }

        if (strongest >= 20) {
            playOneShot('collisionHeavy01', {
                gain: clampNumber(0.55 + strongest / 56, 0.45, 1.2, 0.8),
                rateScale: randomRange(0.94, 1.05),
            });
            playOneShot('debrisScatter01', {
                gain: clampNumber(strongest / 70, 0.2, 0.78, 0.32),
                rateScale: randomRange(0.92, 1.08),
            });
            return;
        }

        playVariant('collisionLight', {
            gain: clampNumber(0.34 + strongest / 40, 0.3, 0.86, 0.5),
            rateScale: randomRange(0.95, 1.07),
        });
    }

    function onObstacleCrash(collision = null) {
        if (!isRealtimeAudioReady()) {
            return;
        }
        if (!isEventReady('obstacleCrash', EVENT_COOLDOWNS.obstacleCrash)) {
            return;
        }

        const impactSpeed = Math.abs(Number(collision?.impactSpeed) || 0);
        playVariant('obstacleCrash', {
            gain: clampNumber(0.5 + impactSpeed / 56, 0.45, 1.2, 0.8),
            rateScale: randomRange(0.95, 1.04),
        });
    }

    function onPickupCollected() {
        if (!isRealtimeAudioReady()) {
            return;
        }
        if (!isEventReady('pickupCollect', EVENT_COOLDOWNS.pickupCollect)) {
            return;
        }
        playVariant('pickupCollect', {
            gain: 0.9,
            rateScale: randomRange(0.96, 1.06),
        });
    }

    function onStealthPickupCollected() {
        if (!isRealtimeAudioReady()) {
            return;
        }
        if (!isEventReady('stealthPickup', EVENT_COOLDOWNS.stealthPickup)) {
            return;
        }
        playStealthPickupSynth();
    }

    function onMineDeployed({ thrown = false } = {}) {
        if (!isRealtimeAudioReady()) {
            return;
        }
        playOneShot(thrown ? 'mineDeployThrow01' : 'mineDeployDrop01', {
            gain: thrown ? 0.92 : 0.82,
            rateScale: randomRange(0.95, 1.05),
        });
        playOneShot('mineArm01', {
            gain: 0.48,
            whenOffsetSec: 0.12,
            rateScale: randomRange(0.98, 1.02),
        });
    }

    function onMineDetonated({ localHit = false, distanceMeters = 0, position = null } = {}) {
        if (!isRealtimeAudioReady()) {
            return;
        }
        if (!isEventReady('mineDetonation', EVENT_COOLDOWNS.mineDetonation)) {
            return;
        }

        playMineDetonationBlast({
            localHit,
            distanceMeters,
            position,
        });
    }

    function playMineDetonationBlast({
        localHit = false,
        distanceMeters = 0,
        position = null,
    } = {}) {
        const isNear = localHit || distanceMeters <= 18;
        const normalizedDistance = clampNumber(distanceMeters, 0, 120, 18);
        const distanceFade = 1 - clampNumber(normalizedDistance / 120, 0, 1, 0);
        const occlusion = resolveWorldAudioOcclusion(position);
        const occlusionGain = lerpNumber(1, MINE_DETONATION_OCCLUSION_MIN_GAIN, occlusion);
        const occlusionRate = lerpNumber(1, MINE_DETONATION_OCCLUSION_MIN_RATE, occlusion);
        playOneShot(isNear ? 'mineDetonateNear01' : 'mineDetonateFar01', {
            gain:
                (isNear ? 0.96 : clampNumber(0.35 + distanceFade * 0.55, 0.24, 0.78, 0.42)) *
                occlusionGain,
            rateScale: randomRange(0.97, 1.04) * occlusionRate,
            lowpassHz: lerpNumber(
                MINE_DETONATION_OCCLUSION_MAX_LOWPASS_HZ,
                MINE_DETONATION_OCCLUSION_MIN_LOWPASS_HZ,
                occlusion
            ),
            lowpassQ: lerpNumber(0.12, 0.96, occlusion),
        });
    }

    function getWorldSilenceFactorAtPosition(position = null) {
        if (!position) {
            return 0;
        }
        const x = Number(position.x) || 0;
        const y = Number(position.y) || 0;
        const z = Number(position.z) || 0;
        return Math.max(
            getLorienVelmoreGallerySilenceFactorWorld(x, y, z),
            getUfoDiskoStoreSilenceFactorWorld(x, y, z),
            getUndergroundParkingSilenceFactorWorld(x, y, z)
        );
    }

    function resolveWorldAudioOcclusion(position) {
        const listenerPosition = runtime.playerPosition;
        if (!listenerPosition || !position) {
            return 0;
        }

        const listenerSilenceFactor = clampNumber(runtime.lowerLevelSilenceFactor, 0, 1, 0);
        const sourceSilenceFactor = getWorldSilenceFactorAtPosition(position);
        return smoothstep(
            clampNumber(Math.abs(listenerSilenceFactor - sourceSilenceFactor), 0, 1, 0)
        );
    }

    function onPlayerExplosion({ impactSpeed = 0 } = {}) {
        if (!isRealtimeAudioReady()) {
            return;
        }
        playVariant('vehicleExplosion', {
            gain: clampNumber(0.72 + Math.abs(impactSpeed) / 72, 0.62, 1.25, 0.9),
            rateScale: randomRange(0.95, 1.05),
        });
        playOneShot('fireballTail01', {
            gain: 0.72,
            whenOffsetSec: 0.02,
            rateScale: randomRange(0.96, 1.04),
        });
    }

    function onRoundFinished() {
        if (!isRealtimeAudioReady()) {
            return;
        }
        playOneShot('roundFinished01', {
            gain: 0.88,
            rateScale: randomRange(0.98, 1.03),
        });
    }

    function onPlayerRespawn() {
        if (!isRealtimeAudioReady()) {
            return;
        }
        playOneShot('respawn01', {
            gain: 0.74,
            rateScale: randomRange(0.98, 1.02),
        });
    }

    function onBatteryDepleted() {
        if (!isRealtimeAudioReady()) {
            return;
        }
        playOneShot('batteryDepleted01', {
            gain: 0.86,
            rateScale: randomRange(0.96, 1.03),
        });
    }

    function onBatteryRestored() {
        if (!isRealtimeAudioReady()) {
            return;
        }
        playOneShot('batteryRestored01', {
            gain: 0.78,
            rateScale: randomRange(0.98, 1.04),
        });
    }

    function onPauseChanged(paused) {
        runtime.paused = Boolean(paused);
        if (!isRealtimeAudioReady()) {
            return;
        }
        playOneShot(paused ? 'uiToggleOff01' : 'uiToggleOn01', {
            gain: 0.72,
        });
    }

    function onWelcomeVisibilityChanged(visible) {
        runtime.welcomeVisible = Boolean(visible);
        if (!runtime.welcomeVisible) {
            endSliderPreview();
        }
        if (!isRealtimeAudioReady()) {
            return;
        }
        if (!runtime.welcomeVisible) {
            playOneShot('uiConfirm01', {
                gain: 0.72,
            });
        }
    }

    function onWorldMapVisibilityChanged(visible) {
        runtime.worldMapVisible = Boolean(visible);
        if (!isRealtimeAudioReady()) {
            return;
        }
        playVariant('uiClickSoft', {
            gain: 0.62,
        });
    }

    function playUiClick(options = {}) {
        if (!isRealtimeAudioReady()) {
            return null;
        }
        return playUiVariant('uiClickSoft', options);
    }

    function playUiConfirm(options = {}) {
        if (!isRealtimeAudioReady()) {
            return null;
        }
        return playOneShot('uiConfirm01', options);
    }

    function onRaceIntroStep(step = null) {
        if (!isRealtimeAudioReady()) {
            return;
        }
        const label = typeof step?.label === 'string' ? step.label : '';
        if (label === '3' || label === '2' || label === '1') {
            playOneShot('countdownBeep01', {
                gain: 0.82,
                rateScale: 1,
            });
        }
    }

    function onRaceIntroGo() {
        if (!isRealtimeAudioReady()) {
            return;
        }
        playOneShot('countdownGo01', {
            gain: 0.94,
            rateScale: 1,
        });
    }

    function onVehicleCombatModeSwitch({ mode = 'mine' } = {}) {
        if (!isRealtimeAudioReady()) {
            return;
        }
        playVehicleCombatModeSwitchSynth({
            mode,
        });
        playOneShot(mode === 'weapon' ? 'uiToggleOn01' : 'uiToggleOff01', {
            gain: mode === 'weapon' ? 0.62 : 0.56,
            rateScale: mode === 'weapon' ? randomRange(0.98, 1.05) : randomRange(0.94, 1.01),
        });
        playOneShot('uiConfirm01', {
            gain: mode === 'weapon' ? 0.24 : 0.18,
            whenOffsetSec: mode === 'weapon' ? 0.028 : 0.018,
            rateScale: mode === 'weapon' ? randomRange(1.1, 1.2) : randomRange(0.88, 0.96),
        });
    }

    function onVehicleWeaponPickup() {
        if (!isRealtimeAudioReady()) {
            return;
        }
        playVehicleWeaponPickupSynth();
    }

    function playStealthPickupSynth() {
        const busNode = mixer?.buses?.effects;
        if (!context || !busNode) {
            return false;
        }

        const now = context.currentTime;
        const outputGain = context.createGain();
        outputGain.gain.setValueAtTime(0.0001, now);
        outputGain.gain.linearRampToValueAtTime(0.18, now + 0.018);
        outputGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
        outputGain.connect(busNode);

        const shimmerFilter = context.createBiquadFilter();
        shimmerFilter.type = 'bandpass';
        shimmerFilter.frequency.setValueAtTime(1680, now);
        shimmerFilter.frequency.exponentialRampToValueAtTime(3120, now + 0.22);
        shimmerFilter.Q.setValueAtTime(1.8, now);
        shimmerFilter.connect(outputGain);

        const bodyTone = context.createOscillator();
        const bodyGain = context.createGain();
        bodyTone.type = 'triangle';
        bodyTone.frequency.setValueAtTime(280, now);
        bodyTone.frequency.exponentialRampToValueAtTime(640, now + 0.19);
        bodyTone.frequency.exponentialRampToValueAtTime(520, now + 0.34);
        bodyGain.gain.setValueAtTime(0.0001, now);
        bodyGain.gain.linearRampToValueAtTime(0.16, now + 0.024);
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

        const shimmerTone = context.createOscillator();
        const shimmerGain = context.createGain();
        shimmerTone.type = 'sine';
        shimmerTone.frequency.setValueAtTime(1420, now + 0.02);
        shimmerTone.frequency.exponentialRampToValueAtTime(2780, now + 0.24);
        shimmerGain.gain.setValueAtTime(0.0001, now + 0.02);
        shimmerGain.gain.linearRampToValueAtTime(0.09, now + 0.06);
        shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

        const phaseTone = context.createOscillator();
        const phaseGain = context.createGain();
        phaseTone.type = 'sawtooth';
        phaseTone.frequency.setValueAtTime(96, now + 0.015);
        phaseTone.frequency.exponentialRampToValueAtTime(180, now + 0.16);
        phaseTone.frequency.exponentialRampToValueAtTime(132, now + 0.5);
        phaseGain.gain.setValueAtTime(0.0001, now + 0.015);
        phaseGain.gain.linearRampToValueAtTime(0.055, now + 0.05);
        phaseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);

        bodyTone.connect(bodyGain);
        bodyGain.connect(outputGain);

        shimmerTone.connect(shimmerGain);
        shimmerGain.connect(shimmerFilter);

        phaseTone.connect(phaseGain);
        phaseGain.connect(shimmerFilter);

        const cleanup = once(() => {
            safeDisconnect(bodyTone);
            safeDisconnect(bodyGain);
            safeDisconnect(shimmerTone);
            safeDisconnect(shimmerGain);
            safeDisconnect(phaseTone);
            safeDisconnect(phaseGain);
            safeDisconnect(shimmerFilter);
            safeDisconnect(outputGain);
        });

        bodyTone.onended = cleanup;
        shimmerTone.onended = cleanup;
        phaseTone.onended = cleanup;
        bodyTone.start(now);
        shimmerTone.start(now + 0.02);
        phaseTone.start(now + 0.015);
        safeStopSource(bodyTone, now + 0.38);
        safeStopSource(shimmerTone, now + 0.46);
        safeStopSource(phaseTone, now + 0.56);
        return true;
    }

    function onVehicleWeaponShot({
        locked = false,
        heat = 0,
        position = null,
        direction = null,
        hostile = false,
    } = {}) {
        if (!isRealtimeAudioReady()) {
            return;
        }
        playVehicleWeaponShotSynth({
            locked,
            heat,
            position,
            direction,
            hostile,
        });
    }

    function onVehicleWeaponImpact({
        hit = false,
        destroyed = false,
        position = null,
        distanceMeters = 0,
        playerHit = false,
        shotDirection = null,
    } = {}) {
        if (!isRealtimeAudioReady()) {
            return;
        }
        if (playerHit) {
            playVehicleWeaponIncomingCue({
                shotDirection,
                impactPosition: position,
                destroyed,
            });
        }
        playVehicleWeaponImpactSynth({
            hit,
            destroyed,
            position,
        });
        if (!destroyed) {
            return;
        }
        playMineDetonationBlast({
            localHit: Boolean(distanceMeters <= 18),
            distanceMeters,
            position,
        });
        playVariant('vehicleExplosion', {
            gain: clampNumber(0.58 + (distanceMeters <= 22 ? 0.24 : 0), 0.52, 1.08, 0.72),
            rateScale: randomRange(0.97, 1.03),
        });
        playOneShot('fireballTail01', {
            gain: distanceMeters <= 18 ? 0.68 : 0.52,
            whenOffsetSec: 0.018,
            rateScale: randomRange(0.97, 1.03),
        });
    }

    function playVehicleWeaponPickupSynth() {
        const busNode = mixer?.buses?.effects;
        if (!context || !busNode) {
            return false;
        }

        const now = context.currentTime;
        const outputGain = context.createGain();
        outputGain.gain.setValueAtTime(0.0001, now);
        outputGain.gain.linearRampToValueAtTime(0.22, now + 0.02);
        outputGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);
        outputGain.connect(busNode);

        const toneA = context.createOscillator();
        const toneAGain = context.createGain();
        toneA.type = 'triangle';
        toneA.frequency.setValueAtTime(460, now);
        toneA.frequency.exponentialRampToValueAtTime(920, now + 0.2);
        toneAGain.gain.setValueAtTime(0.0001, now);
        toneAGain.gain.linearRampToValueAtTime(0.16, now + 0.02);
        toneAGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

        const toneB = context.createOscillator();
        const toneBGain = context.createGain();
        toneB.type = 'sine';
        toneB.frequency.setValueAtTime(840, now + 0.04);
        toneB.frequency.exponentialRampToValueAtTime(1560, now + 0.22);
        toneBGain.gain.setValueAtTime(0.0001, now + 0.04);
        toneBGain.gain.linearRampToValueAtTime(0.12, now + 0.08);
        toneBGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

        toneA.connect(toneAGain);
        toneAGain.connect(outputGain);
        toneB.connect(toneBGain);
        toneBGain.connect(outputGain);

        const cleanup = once(() => {
            safeDisconnect(toneA);
            safeDisconnect(toneAGain);
            safeDisconnect(toneB);
            safeDisconnect(toneBGain);
            safeDisconnect(outputGain);
        });

        toneA.onended = cleanup;
        toneB.onended = cleanup;
        toneA.start(now);
        toneB.start(now + 0.04);
        safeStopSource(toneA, now + 0.28);
        safeStopSource(toneB, now + 0.34);
        return true;
    }

    function playVehicleCombatModeSwitchSynth({ mode = 'mine' } = {}) {
        const busNode = mixer?.buses?.effects;
        if (!context || !busNode) {
            return false;
        }

        const switchToWeapon = mode === 'weapon';
        const now = context.currentTime;
        const outputGain = context.createGain();
        outputGain.gain.setValueAtTime(0.0001, now);
        outputGain.gain.linearRampToValueAtTime(switchToWeapon ? 0.18 : 0.12, now + 0.012);
        outputGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        outputGain.connect(busNode);

        const toneA = context.createOscillator();
        const toneAGain = context.createGain();
        toneA.type = switchToWeapon ? 'triangle' : 'sine';
        toneA.frequency.setValueAtTime(switchToWeapon ? 540 : 880, now);
        toneA.frequency.exponentialRampToValueAtTime(switchToWeapon ? 1220 : 420, now + 0.14);
        toneAGain.gain.setValueAtTime(0.0001, now);
        toneAGain.gain.linearRampToValueAtTime(switchToWeapon ? 0.14 : 0.1, now + 0.016);
        toneAGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

        const toneB = context.createOscillator();
        const toneBGain = context.createGain();
        toneB.type = 'sine';
        toneB.frequency.setValueAtTime(switchToWeapon ? 920 : 510, now + 0.016);
        toneB.frequency.exponentialRampToValueAtTime(switchToWeapon ? 1680 : 280, now + 0.2);
        toneBGain.gain.setValueAtTime(0.0001, now + 0.01);
        toneBGain.gain.linearRampToValueAtTime(switchToWeapon ? 0.08 : 0.06, now + 0.04);
        toneBGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        toneA.connect(toneAGain);
        toneAGain.connect(outputGain);
        toneB.connect(toneBGain);
        toneBGain.connect(outputGain);

        const cleanup = once(() => {
            safeDisconnect(toneA);
            safeDisconnect(toneAGain);
            safeDisconnect(toneB);
            safeDisconnect(toneBGain);
            safeDisconnect(outputGain);
        });

        toneA.onended = cleanup;
        toneB.onended = cleanup;
        toneA.start(now);
        toneB.start(now + 0.012);
        safeStopSource(toneA, now + 0.18);
        safeStopSource(toneB, now + 0.24);
        return true;
    }

    function playVehicleWeaponShotSynth({
        locked = false,
        heat = 0,
        position = null,
        direction = null,
        hostile = false,
    } = {}) {
        const busNode = mixer?.buses?.effects;
        if (!context || !busNode) {
            return false;
        }

        const noiseBuffer = getVehicleWeaponNoiseBuffer();
        if (!noiseBuffer) {
            return false;
        }

        const now = context.currentTime;
        const outputGain = context.createGain();
        outputGain.gain.setValueAtTime(0.0001, now);
        outputGain.gain.linearRampToValueAtTime(
            0.34 + clampNumber(heat, 0, 1, 0) * 0.12 + (hostile ? 0.04 : 0),
            now + 0.002
        );
        outputGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

        const airFilter = context.createBiquadFilter();
        airFilter.type = 'highpass';
        airFilter.frequency.setValueAtTime(hostile ? 280 : 240, now);
        const spatialRoute = createVehicleWeaponUrbanRoute({
            busNode,
            position,
            direction,
            config: VEHICLE_WEAPON_URBAN_SHOT_AUDIO_CONFIG,
        });
        outputGain.connect(airFilter);
        airFilter.connect(spatialRoute.input);

        const subTone = context.createOscillator();
        const subToneGain = context.createGain();
        subTone.type = 'square';
        subTone.frequency.setValueAtTime(locked ? 128 : 116, now);
        subTone.frequency.exponentialRampToValueAtTime(locked ? 66 : 60, now + 0.11);
        subToneGain.gain.setValueAtTime(0.0001, now);
        subToneGain.gain.linearRampToValueAtTime(0.12, now + 0.002);
        subToneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

        const bodyTone = context.createOscillator();
        const bodyToneGain = context.createGain();
        bodyTone.type = 'sawtooth';
        bodyTone.frequency.setValueAtTime(locked ? 760 : 700, now);
        bodyTone.frequency.exponentialRampToValueAtTime(locked ? 150 : 132, now + 0.11);
        bodyToneGain.gain.setValueAtTime(0.0001, now);
        bodyToneGain.gain.linearRampToValueAtTime(0.14, now + 0.002);
        bodyToneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

        const snapTone = context.createOscillator();
        const snapToneGain = context.createGain();
        snapTone.type = 'triangle';
        snapTone.frequency.setValueAtTime(locked ? 1980 : 1820, now);
        snapTone.frequency.exponentialRampToValueAtTime(locked ? 540 : 460, now + 0.045);
        snapToneGain.gain.setValueAtTime(0.0001, now);
        snapToneGain.gain.linearRampToValueAtTime(0.11, now + 0.001);
        snapToneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

        const crackSource = context.createBufferSource();
        crackSource.buffer = noiseBuffer;
        const crackFilter = context.createBiquadFilter();
        crackFilter.type = 'bandpass';
        crackFilter.frequency.setValueAtTime(locked ? 2100 : 1880, now);
        crackFilter.Q.setValueAtTime(0.88, now);
        const crackGain = context.createGain();
        crackGain.gain.setValueAtTime(0.0001, now);
        crackGain.gain.linearRampToValueAtTime(
            0.26 + clampNumber(heat, 0, 1, 0) * 0.12,
            now + 0.001
        );
        crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

        subTone.connect(subToneGain);
        subToneGain.connect(outputGain);
        bodyTone.connect(bodyToneGain);
        bodyToneGain.connect(outputGain);
        snapTone.connect(snapToneGain);
        snapToneGain.connect(outputGain);
        crackSource.connect(crackFilter);
        crackFilter.connect(crackGain);
        crackGain.connect(outputGain);

        const cleanup = once(() => {
            safeDisconnect(subTone);
            safeDisconnect(subToneGain);
            safeDisconnect(bodyTone);
            safeDisconnect(bodyToneGain);
            safeDisconnect(snapTone);
            safeDisconnect(snapToneGain);
            safeDisconnect(crackSource);
            safeDisconnect(crackFilter);
            safeDisconnect(crackGain);
            safeDisconnect(airFilter);
            safeDisconnect(outputGain);
            spatialRoute.cleanup();
        });

        subTone.onended = cleanup;
        bodyTone.onended = cleanup;
        snapTone.onended = cleanup;
        crackSource.onended = cleanup;
        subTone.start(now);
        bodyTone.start(now);
        snapTone.start(now);
        crackSource.start(now);
        safeStopSource(subTone, now + 0.13);
        safeStopSource(bodyTone, now + 0.12);
        safeStopSource(snapTone, now + 0.07);
        safeStopSource(crackSource, now + 0.08);
        return true;
    }

    function playVehicleWeaponImpactSynth({
        hit = false,
        destroyed = false,
        position = null,
    } = {}) {
        const busNode = mixer?.buses?.effects;
        if (!context || !busNode) {
            return false;
        }

        const noiseBuffer = getVehicleWeaponNoiseBuffer();
        if (!noiseBuffer) {
            return false;
        }

        const now = context.currentTime;
        const outputGain = context.createGain();
        outputGain.gain.setValueAtTime(0.0001, now);
        outputGain.gain.linearRampToValueAtTime(destroyed ? 0.24 : hit ? 0.18 : 0.11, now + 0.002);
        outputGain.gain.exponentialRampToValueAtTime(0.0001, now + (destroyed ? 0.16 : 0.11));
        const spatialRoute = createVehicleWeaponUrbanRoute({
            busNode,
            position,
            config: VEHICLE_WEAPON_URBAN_IMPACT_AUDIO_CONFIG,
        });
        outputGain.connect(spatialRoute.input);

        const ping = context.createOscillator();
        const pingGain = context.createGain();
        ping.type = 'triangle';
        ping.frequency.setValueAtTime(destroyed ? 420 : hit ? 310 : 240, now);
        ping.frequency.exponentialRampToValueAtTime(destroyed ? 102 : hit ? 128 : 110, now + 0.08);
        pingGain.gain.setValueAtTime(0.0001, now);
        pingGain.gain.linearRampToValueAtTime(destroyed ? 0.12 : hit ? 0.08 : 0.05, now + 0.002);
        pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

        const debrisSource = context.createBufferSource();
        debrisSource.buffer = noiseBuffer;
        const debrisFilter = context.createBiquadFilter();
        debrisFilter.type = 'lowpass';
        debrisFilter.frequency.setValueAtTime(destroyed ? 2600 : hit ? 2200 : 1500, now);
        debrisFilter.Q.setValueAtTime(0.4, now);
        const debrisGain = context.createGain();
        debrisGain.gain.setValueAtTime(0.0001, now);
        debrisGain.gain.linearRampToValueAtTime(destroyed ? 0.18 : hit ? 0.12 : 0.08, now + 0.001);
        debrisGain.gain.exponentialRampToValueAtTime(0.0001, now + (destroyed ? 0.075 : 0.05));

        ping.connect(pingGain);
        pingGain.connect(outputGain);
        debrisSource.connect(debrisFilter);
        debrisFilter.connect(debrisGain);
        debrisGain.connect(outputGain);

        const cleanup = once(() => {
            safeDisconnect(ping);
            safeDisconnect(pingGain);
            safeDisconnect(debrisSource);
            safeDisconnect(debrisFilter);
            safeDisconnect(debrisGain);
            safeDisconnect(outputGain);
            spatialRoute.cleanup();
        });

        ping.onended = cleanup;
        debrisSource.onended = cleanup;
        ping.start(now);
        debrisSource.start(now);
        safeStopSource(ping, now + 0.1);
        safeStopSource(debrisSource, now + 0.06);
        return true;
    }

    function getVehicleWeaponNoiseBuffer() {
        if (!context) {
            return null;
        }
        if (
            !vehicleWeaponNoiseBuffer ||
            vehicleWeaponNoiseBuffer.sampleRate !== context.sampleRate
        ) {
            vehicleWeaponNoiseBuffer = createShortNoiseBuffer(context, 0.18);
        }
        return vehicleWeaponNoiseBuffer;
    }

    function getVehicleWeaponUrbanImpulseBuffer() {
        if (!context) {
            return null;
        }
        if (
            !vehicleWeaponUrbanImpulseBuffer ||
            vehicleWeaponUrbanImpulseBuffer.sampleRate !== context.sampleRate
        ) {
            vehicleWeaponUrbanImpulseBuffer = createUrbanPlazaImpulseBuffer(context, 2.2, 2.3);
        }
        return vehicleWeaponUrbanImpulseBuffer;
    }

    function createVehicleWeaponUrbanRoute({
        busNode = null,
        position = null,
        direction = null,
        config = VEHICLE_WEAPON_URBAN_SHOT_AUDIO_CONFIG,
    } = {}) {
        if (!context || !busNode) {
            return {
                input: null,
                cleanup() {},
            };
        }

        const now = context.currentTime;
        const input = context.createGain();
        input.gain.setValueAtTime(1, now);

        const occlusion = resolveWorldAudioOcclusion(position);
        const cleanupNodes = [input];
        let routeSource = input;

        if (isFiniteVector3Like(position)) {
            const panner = context.createPanner();
            panner.panningModel = 'HRTF';
            panner.distanceModel = 'inverse';
            panner.refDistance = clampNumber(config?.refDistance, 0.5, 32, 6);
            panner.maxDistance = clampNumber(config?.maxDistance, 4, 260, 120);
            panner.rolloffFactor = clampNumber(config?.rolloffFactor, 0, 4, 1.2);
            panner.coneInnerAngle = 360;
            panner.coneOuterAngle = 360;
            panner.coneOuterGain = 1;
            setPannerPosition(
                panner,
                Number(position.x) || 0,
                Number(position.y) || 0,
                Number(position.z) || 0,
                now
            );
            if (
                direction &&
                isFiniteVector3Like(direction) &&
                typeof panner.orientationX !== 'undefined'
            ) {
                setAudioParamValue(panner.orientationX, Number(direction.x) || 0, now);
                setAudioParamValue(panner.orientationY, Number(direction.y) || 0, now);
                setAudioParamValue(panner.orientationZ, Number(direction.z) || 0, now);
            }
            input.connect(panner);
            routeSource = panner;
            cleanupNodes.push(panner);
        }

        const dryGain = context.createGain();
        dryGain.gain.setValueAtTime(
            clampNumber(config?.directGain, 0, 2, 1) * lerpNumber(1, 0.44, occlusion),
            now
        );
        routeSource.connect(dryGain);
        dryGain.connect(busNode);
        cleanupNodes.push(dryGain);

        const delaySend = context.createGain();
        delaySend.gain.setValueAtTime(
            clampNumber(config?.delaySendGain, 0, 1.2, 0) * lerpNumber(1, 1.18, occlusion),
            now
        );
        const delay = context.createDelay(0.75);
        delay.delayTime.setValueAtTime(clampNumber(config?.delayTimeSec, 0.01, 0.5, 0.08), now);
        const delayFeedback = context.createGain();
        delayFeedback.gain.setValueAtTime(clampNumber(config?.delayFeedback, 0, 0.8, 0.28), now);
        routeSource.connect(delaySend);
        delaySend.connect(delay);
        delay.connect(delayFeedback);
        delayFeedback.connect(delay);
        delay.connect(busNode);
        cleanupNodes.push(delaySend, delay, delayFeedback);

        const reverbSend = context.createGain();
        reverbSend.gain.setValueAtTime(
            clampNumber(config?.reverbSendGain, 0, 1.4, 0) * lerpNumber(1, 1.1, occlusion),
            now
        );
        const convolver = context.createConvolver();
        convolver.buffer = getVehicleWeaponUrbanImpulseBuffer();
        const wetFilter = context.createBiquadFilter();
        wetFilter.type = 'lowpass';
        wetFilter.frequency.setValueAtTime(
            clampNumber(config?.wetLowpassHz, 500, 22000, 5200) * lerpNumber(1, 0.62, occlusion),
            now
        );
        const wetGain = context.createGain();
        wetGain.gain.setValueAtTime(
            clampNumber(config?.wetGain, 0, 1.4, 0) * lerpNumber(1, 0.88, occlusion),
            now
        );
        routeSource.connect(reverbSend);
        reverbSend.connect(convolver);
        convolver.connect(wetFilter);
        wetFilter.connect(wetGain);
        wetGain.connect(busNode);
        cleanupNodes.push(reverbSend, convolver, wetFilter, wetGain);

        return {
            input,
            cleanup: once(() => {
                for (let i = 0; i < cleanupNodes.length; i += 1) {
                    safeDisconnect(cleanupNodes[i]);
                }
            }),
        };
    }

    function playVehicleWeaponIncomingCue({
        shotDirection = null,
        impactPosition = null,
        destroyed = false,
    } = {}) {
        const busNode = mixer?.buses?.effects;
        if (!context || !busNode) {
            return false;
        }

        const cuePosition = resolveVehicleWeaponIncomingCuePosition(shotDirection, impactPosition);
        const spatialRoute = createVehicleWeaponUrbanRoute({
            busNode,
            position: cuePosition,
            config: VEHICLE_WEAPON_INCOMING_CUE_AUDIO_CONFIG,
        });
        if (!spatialRoute.input) {
            return false;
        }

        const noiseBuffer = getVehicleWeaponNoiseBuffer();
        if (!noiseBuffer) {
            spatialRoute.cleanup();
            return false;
        }

        const now = context.currentTime;
        const outputGain = context.createGain();
        outputGain.gain.setValueAtTime(0.0001, now);
        outputGain.gain.linearRampToValueAtTime(destroyed ? 0.18 : 0.145, now + 0.001);
        outputGain.gain.exponentialRampToValueAtTime(0.0001, now + (destroyed ? 0.12 : 0.09));

        const crackSource = context.createBufferSource();
        crackSource.buffer = noiseBuffer;
        const crackFilter = context.createBiquadFilter();
        crackFilter.type = 'bandpass';
        crackFilter.frequency.setValueAtTime(destroyed ? 2650 : 3080, now);
        crackFilter.Q.setValueAtTime(destroyed ? 1.1 : 1.28, now);
        const crackGain = context.createGain();
        crackGain.gain.setValueAtTime(0.0001, now);
        crackGain.gain.linearRampToValueAtTime(destroyed ? 0.32 : 0.26, now + 0.001);
        crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

        const lowThunk = context.createOscillator();
        const lowThunkGain = context.createGain();
        lowThunk.type = 'triangle';
        lowThunk.frequency.setValueAtTime(destroyed ? 188 : 214, now);
        lowThunk.frequency.exponentialRampToValueAtTime(destroyed ? 92 : 108, now + 0.07);
        lowThunkGain.gain.setValueAtTime(0.0001, now);
        lowThunkGain.gain.linearRampToValueAtTime(destroyed ? 0.07 : 0.05, now + 0.002);
        lowThunkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

        crackSource.connect(crackFilter);
        crackFilter.connect(crackGain);
        crackGain.connect(outputGain);
        lowThunk.connect(lowThunkGain);
        lowThunkGain.connect(outputGain);
        outputGain.connect(spatialRoute.input);

        const cleanup = once(() => {
            safeDisconnect(crackSource);
            safeDisconnect(crackFilter);
            safeDisconnect(crackGain);
            safeDisconnect(lowThunk);
            safeDisconnect(lowThunkGain);
            safeDisconnect(outputGain);
            spatialRoute.cleanup();
        });

        crackSource.onended = cleanup;
        lowThunk.onended = cleanup;
        crackSource.start(now);
        lowThunk.start(now);
        safeStopSource(crackSource, now + 0.06);
        safeStopSource(lowThunk, now + 0.085);
        return true;
    }

    function resolveVehicleWeaponIncomingCuePosition(shotDirection = null, impactPosition = null) {
        const listenerPosition =
            runtime.playerPosition || camera?.position || impactPosition || null;
        if (!listenerPosition) {
            return null;
        }

        let incomingX = 0;
        let incomingZ = -1;
        if (shotDirection && Number.isFinite(shotDirection.x) && Number.isFinite(shotDirection.z)) {
            incomingX = -(Number(shotDirection.x) || 0);
            incomingZ = -(Number(shotDirection.z) || 0);
            const incomingLength = Math.hypot(incomingX, incomingZ);
            if (incomingLength > 0.0001) {
                incomingX /= incomingLength;
                incomingZ /= incomingLength;
            } else {
                incomingX = 0;
                incomingZ = -1;
            }
        }

        const lateralX = -incomingZ;
        const lateralZ = incomingX;
        return {
            x:
                (Number(listenerPosition.x) || 0) +
                incomingX * VEHICLE_WEAPON_INCOMING_CUE_AUDIO_CONFIG.offsetDistance +
                lateralX * VEHICLE_WEAPON_INCOMING_CUE_AUDIO_CONFIG.lateralOffset,
            y:
                (Number(listenerPosition.y) || 0) +
                VEHICLE_WEAPON_INCOMING_CUE_AUDIO_CONFIG.verticalOffset,
            z:
                (Number(listenerPosition.z) || 0) +
                incomingZ * VEHICLE_WEAPON_INCOMING_CUE_AUDIO_CONFIG.offsetDistance +
                lateralZ * VEHICLE_WEAPON_INCOMING_CUE_AUDIO_CONFIG.lateralOffset,
        };
    }

    function updateLoopLayer(soundId, layerGain, layerRate = LOOP_RATE_DEFAULT) {
        const definition = SOUND_DEFINITIONS[soundId];
        if (!definition || !definition.loop) {
            return;
        }

        const safeGain = clampNumber(layerGain, 0, 1, 0);
        const safeRate = clampNumber(layerRate, 0.5, 2.2, LOOP_RATE_DEFAULT);

        if (safeGain <= 0 && !loopInstances.has(soundId)) {
            return;
        }

        const instance = ensureLoopInstance(soundId);
        if (!instance || !context) {
            return;
        }

        instance.gain.gain.setTargetAtTime(safeGain * definition.gain, context.currentTime, 0.07);
        if (instance.kind === 'stream') {
            instance.mediaElement.playbackRate = safeRate;
            ensureStreamingMediaPlayback(instance);
            return;
        }

        instance.source.playbackRate.setTargetAtTime(safeRate, context.currentTime, 0.08);
    }

    function ensureLoopInstance(soundId) {
        if (!isAudioOutputReady()) {
            return null;
        }

        if (loopInstances.has(soundId)) {
            return loopInstances.get(soundId);
        }

        const definition = SOUND_DEFINITIONS[soundId];
        if (!definition || !definition.loop) {
            return null;
        }
        if (definition.stream) {
            return ensureStreamingLoopInstance(soundId, definition);
        }

        const buffer = buffers.get(soundId);
        if (!buffer) {
            void loadBuffer(soundId);
            return null;
        }

        const busNode = mixer.buses[definition.bus];
        if (!busNode) {
            return null;
        }

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const gainNode = context.createGain();
        gainNode.gain.setValueAtTime(0, context.currentTime);

        source.connect(gainNode);
        gainNode.connect(busNode);
        source.start();

        const instance = {
            source,
            gain: gainNode,
        };
        loopInstances.set(soundId, instance);
        return instance;
    }

    function ensureStreamingLoopInstance(soundId, definition) {
        const busNode = mixer.buses[definition.bus];
        if (!busNode) {
            return null;
        }

        const mediaElement = getOrCreateStreamingMediaElement(soundId, { loop: true });
        if (!mediaElement) {
            return null;
        }

        const mediaSource = context.createMediaElementSource(mediaElement);
        const gainNode = context.createGain();
        gainNode.gain.setValueAtTime(0, context.currentTime);

        mediaSource.connect(gainNode);
        gainNode.connect(busNode);

        const instance = {
            kind: 'stream',
            mediaElement,
            mediaSource,
            gain: gainNode,
            lastPlayAttemptTime: -Infinity,
        };
        loopInstances.set(soundId, instance);
        ensureStreamingMediaPlayback(instance);
        return instance;
    }

    function primeLoopInstances() {
        if (!isRealtimeAudioReady() || !context) {
            return 0;
        }
        let primed = 0;
        for (let i = 0; i < LOOP_SOUND_IDS.length; i += 1) {
            const soundId = LOOP_SOUND_IDS[i];
            const instance = ensureLoopInstance(soundId);
            if (!instance) {
                continue;
            }
            instance.gain.gain.setValueAtTime(0, context.currentTime);
            primed += 1;
        }
        return primed;
    }

    function disposeLoopInstance(instance) {
        if (!instance) {
            return;
        }
        if (instance.kind === 'stream') {
            try {
                instance.mediaElement?.pause?.();
            } catch {
                // Ignore pause failures during teardown.
            }
            safeDisconnect(instance.mediaSource);
            safeDisconnect(instance.gain);
            return;
        }
        safeStopSource(instance.source);
        safeDisconnect(instance.source);
        safeDisconnect(instance.gain);
    }

    function updateBotTrafficAudio({
        trafficDescriptors = EMPTY_ARRAY,
        driveAudioEnabled = false,
        gameMode = 'bots',
        undergroundParkingIsolationActive = false,
    } = {}) {
        if (!context) {
            return;
        }

        const listenerPosition = camera?.position || runtime.playerPosition || null;
        const now = context.currentTime;
        const nowMs = performance.now();
        const activeBotIds = new Set();
        const shouldRenderBots =
            driveAudioEnabled &&
            (gameMode === 'bots' || gameMode === 'online') &&
            listenerPosition &&
            Array.isArray(trafficDescriptors) &&
            trafficDescriptors.length > 0;

        if (shouldRenderBots) {
            const { forwardX, forwardZ } = resolveCameraPlanarForward(camera);
            for (let i = 0; i < trafficDescriptors.length; i += 1) {
                const descriptor = trafficDescriptors[i];
                const trafficId = typeof descriptor?.id === 'string' ? descriptor.id : '';
                const position = isFiniteVector3Like(descriptor?.position)
                    ? descriptor.position
                    : Number.isFinite(descriptor?.x) &&
                        Number.isFinite(descriptor?.y) &&
                        Number.isFinite(descriptor?.z)
                      ? {
                            x: descriptor.x,
                            y: descriptor.y,
                            z: descriptor.z,
                        }
                      : null;
                if (!trafficId || !position) {
                    continue;
                }

                const x = Number(position.x) || 0;
                const y = (Number(position.y) || 0) + BOT_TRAFFIC_AUDIO_CONFIG.verticalOffset;
                const z = Number(position.z) || 0;
                const dx = x - (Number(listenerPosition.x) || 0);
                const dy = y - (Number(listenerPosition.y) || 0);
                const dz = z - (Number(listenerPosition.z) || 0);
                const distance = Math.hypot(dx, dz, dy * 0.72);
                if (
                    !Number.isFinite(distance) ||
                    distance > BOT_TRAFFIC_AUDIO_CONFIG.cullDistance
                ) {
                    continue;
                }

                const instance = ensureBotTrafficInstance(trafficId, { x, y, z });
                if (!instance) {
                    continue;
                }

                activeBotIds.add(trafficId);
                instance.missingSinceMs = null;
                updateBotTrafficInstance(instance, descriptor, {
                    x,
                    y,
                    z,
                    dx,
                    dy,
                    dz,
                    distance,
                    forwardX,
                    forwardZ,
                    undergroundParkingIsolationActive,
                    now,
                });
            }
        }

        for (const [botId, instance] of botTrafficInstances.entries()) {
            if (activeBotIds.has(botId)) {
                continue;
            }
            if (!Number.isFinite(instance.missingSinceMs)) {
                instance.missingSinceMs = nowMs;
            }
            fadeOutBotTrafficInstance(instance, now);
            if (nowMs - instance.missingSinceMs >= BOT_TRAFFIC_AUDIO_CONFIG.releaseAfterMs) {
                disposeBotTrafficInstance(instance);
                botTrafficInstances.delete(botId);
            }
        }
    }

    function ensureBotTrafficInstance(botId, initialPosition = null) {
        if (!isRealtimeAudioReady() || !context || !mixer?.buses?.botVehicles || !botId) {
            return null;
        }
        if (botTrafficInstances.has(botId)) {
            return botTrafficInstances.get(botId);
        }

        const layerBuffers = {};
        for (let i = 0; i < BOT_TRAFFIC_ENGINE_SOUND_IDS.length; i += 1) {
            const soundId = BOT_TRAFFIC_ENGINE_SOUND_IDS[i];
            const buffer = buffers.get(soundId);
            if (!buffer) {
                void loadBuffer(soundId);
                return null;
            }
            layerBuffers[soundId] = buffer;
        }

        const now = context.currentTime;
        const sourceGain = context.createGain();
        sourceGain.gain.setValueAtTime(0, now);

        const toneFilter = context.createBiquadFilter();
        toneFilter.type = 'lowpass';
        toneFilter.frequency.setValueAtTime(BOT_TRAFFIC_AUDIO_CONFIG.farCutoffHz, now);
        toneFilter.Q.setValueAtTime(0.72, now);

        const panner = context.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = BOT_TRAFFIC_AUDIO_CONFIG.refDistance;
        panner.maxDistance = BOT_TRAFFIC_AUDIO_CONFIG.maxDistance;
        panner.rolloffFactor = BOT_TRAFFIC_AUDIO_CONFIG.rolloffFactor;
        panner.coneInnerAngle = 360;
        panner.coneOuterAngle = 360;
        panner.coneOuterGain = 1;
        setPannerPosition(
            panner,
            Number(initialPosition?.x) || 0,
            Number(initialPosition?.y) || 0,
            Number(initialPosition?.z) || 0,
            now
        );

        const dryGain = context.createGain();
        dryGain.gain.setValueAtTime(0, now);

        const delaySend = context.createGain();
        delaySend.gain.setValueAtTime(0, now);
        const delay = context.createDelay(0.75);
        delay.delayTime.setValueAtTime(BOT_TRAFFIC_AUDIO_CONFIG.farDelaySec, now);
        const delayFeedback = context.createGain();
        delayFeedback.gain.setValueAtTime(BOT_TRAFFIC_AUDIO_CONFIG.farFeedback, now);

        const reverbSend = context.createGain();
        reverbSend.gain.setValueAtTime(0, now);
        const convolver = context.createConvolver();
        convolver.buffer = getVehicleWeaponUrbanImpulseBuffer();

        const wetFilter = context.createBiquadFilter();
        wetFilter.type = 'lowpass';
        wetFilter.frequency.setValueAtTime(BOT_TRAFFIC_AUDIO_CONFIG.farWetLowpassHz, now);

        const wetGain = context.createGain();
        wetGain.gain.setValueAtTime(0, now);

        sourceGain.connect(toneFilter);
        toneFilter.connect(panner);
        panner.connect(dryGain);
        dryGain.connect(mixer.buses.botVehicles);
        panner.connect(delaySend);
        delaySend.connect(delay);
        delay.connect(delayFeedback);
        delayFeedback.connect(delay);
        delay.connect(wetFilter);
        panner.connect(reverbSend);
        reverbSend.connect(convolver);
        convolver.connect(wetFilter);
        wetFilter.connect(wetGain);
        wetGain.connect(mixer.buses.botVehicles);

        const layers = {};
        for (let i = 0; i < BOT_TRAFFIC_ENGINE_SOUND_IDS.length; i += 1) {
            const soundId = BOT_TRAFFIC_ENGINE_SOUND_IDS[i];
            const buffer = layerBuffers[soundId];
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.loop = true;

            const gain = context.createGain();
            gain.gain.setValueAtTime(0, now);

            source.connect(gain);
            gain.connect(sourceGain);

            const duration = Number(buffer.duration);
            const startOffset =
                Number.isFinite(duration) && duration > 0.3
                    ? randomRange(0, Math.max(0.01, duration - 0.18))
                    : 0;
            source.start(now, startOffset);

            layers[soundId] = {
                source,
                gain,
                baseGain: SOUND_DEFINITIONS[soundId]?.gain || 1,
            };
        }

        const instance = {
            botId,
            sourceGain,
            toneFilter,
            panner,
            dryGain,
            delaySend,
            delay,
            delayFeedback,
            reverbSend,
            convolver,
            wetFilter,
            wetGain,
            layers,
            missingSinceMs: null,
        };
        botTrafficInstances.set(botId, instance);
        return instance;
    }

    function updateBotTrafficInstance(instance, descriptor, state = {}) {
        if (!context || !instance) {
            return;
        }

        const now = Number.isFinite(state.now) ? state.now : context.currentTime;
        const x = Number(state.x) || 0;
        const y = Number(state.y) || 0;
        const z = Number(state.z) || 0;
        const dx = Number(state.dx) || 0;
        const dy = Number(state.dy) || 0;
        const dz = Number(state.dz) || 0;
        const distance = Math.max(0, Number(state.distance) || 0);
        const forwardX = Number(state.forwardX) || 0;
        const forwardZ = Number(state.forwardZ) || -1;
        const speedKph = Math.abs(Number(descriptor?.speedKph) || 0);
        const speedNorm = clampNumber(
            (speedKph - BOT_TRAFFIC_AUDIO_CONFIG.speedFloorKph) /
                Math.max(
                    1,
                    BOT_TRAFFIC_AUDIO_CONFIG.speedCeilingKph -
                        BOT_TRAFFIC_AUDIO_CONFIG.speedFloorKph
                ),
            0,
            1,
            0
        );
        const nearMix =
            1 -
            clampNumber(
                (distance - BOT_TRAFFIC_AUDIO_CONFIG.fullPresenceDistance) /
                    Math.max(
                        1,
                        BOT_TRAFFIC_AUDIO_CONFIG.audibleDistance -
                            BOT_TRAFFIC_AUDIO_CONFIG.fullPresenceDistance
                    ),
                0,
                1,
                0
            );
        const distance2d = Math.hypot(dx, dz);
        const sourceDirX = distance2d > 0.0001 ? dx / distance2d : 0;
        const sourceDirZ = distance2d > 0.0001 ? dz / distance2d : -1;
        const sideMix = clampNumber(
            Math.abs(forwardX * sourceDirZ - forwardZ * sourceDirX),
            0,
            1,
            0
        );
        const echoMix = clampNumber(distance / BOT_TRAFFIC_AUDIO_CONFIG.audibleDistance, 0, 1, 0);

        let orientationX = Number(descriptor?.velocityX) || 0;
        let orientationZ = Number(descriptor?.velocityZ) || 0;
        let travelMagnitude = Math.hypot(orientationX, orientationZ);
        if (travelMagnitude <= 0.12) {
            orientationX = -Math.sin(Number(descriptor?.heading) || 0);
            orientationZ = -Math.cos(Number(descriptor?.heading) || 0);
            travelMagnitude = Math.hypot(orientationX, orientationZ);
        }
        if (travelMagnitude > 0.0001) {
            orientationX /= travelMagnitude;
            orientationZ /= travelMagnitude;
        } else {
            orientationX = 0;
            orientationZ = -1;
        }

        if (
            typeof instance.panner.orientationX !== 'undefined' &&
            typeof instance.panner.orientationY !== 'undefined' &&
            typeof instance.panner.orientationZ !== 'undefined'
        ) {
            setAudioParamValue(instance.panner.orientationX, orientationX, now);
            setAudioParamValue(instance.panner.orientationY, 0, now);
            setAudioParamValue(instance.panner.orientationZ, orientationZ, now);
        }

        setPannerPosition(instance.panner, x, y, z, now);

        const occlusion = resolveWorldAudioOcclusion({ x, y, z });
        const occlusionGain = lerpNumber(1, BOT_TRAFFIC_OCCLUSION_MIN_GAIN, occlusion);
        const occlusionWetGain = lerpNumber(1, BOT_TRAFFIC_OCCLUSION_MIN_WET_GAIN, occlusion);
        const undergroundMismatch =
            Boolean(descriptor?.undergroundParkingIsolated) !==
            Boolean(state.undergroundParkingIsolationActive);
        const isolationGain = undergroundMismatch ? BOT_TRAFFIC_UNDERGROUND_MISMATCH_GAIN : 1;
        const isolationWetGain = undergroundMismatch
            ? BOT_TRAFFIC_UNDERGROUND_MISMATCH_WET_GAIN
            : 1;
        const approachVelocityMs =
            distance2d > 0.0001
                ? -(
                      (Number(descriptor?.velocityX) || 0) * sourceDirX +
                      (Number(descriptor?.velocityZ) || 0) * sourceDirZ
                  )
                : 0;
        const approachRateOffset =
            clampNumber(approachVelocityMs / 18, -1, 1, 0) * BOT_TRAFFIC_APPROACH_RATE_RANGE;

        instance.sourceGain.gain.setTargetAtTime(
            lerpNumber(
                BOT_TRAFFIC_AUDIO_CONFIG.farSourceGain,
                BOT_TRAFFIC_AUDIO_CONFIG.nearSourceGain,
                nearMix
            ) *
                (0.56 + speedNorm * 0.44) *
                occlusionGain *
                isolationGain,
            now,
            0.16
        );
        instance.dryGain.gain.setTargetAtTime(
            lerpNumber(
                BOT_TRAFFIC_AUDIO_CONFIG.farDryGain,
                BOT_TRAFFIC_AUDIO_CONFIG.nearDryGain,
                nearMix
            ) *
                (1 + sideMix * nearMix * 0.16) *
                occlusionGain *
                isolationGain,
            now,
            0.16
        );
        instance.wetGain.gain.setTargetAtTime(
            lerpNumber(
                BOT_TRAFFIC_AUDIO_CONFIG.farWetGain,
                BOT_TRAFFIC_AUDIO_CONFIG.nearWetGain,
                nearMix
            ) *
                (0.84 + echoMix * 0.3) *
                occlusionWetGain *
                isolationWetGain,
            now,
            0.2
        );
        instance.delaySend.gain.setTargetAtTime(
            lerpNumber(
                BOT_TRAFFIC_AUDIO_CONFIG.delaySendFar,
                BOT_TRAFFIC_AUDIO_CONFIG.delaySendNear,
                nearMix
            ) *
                (0.88 + echoMix * 0.22) *
                occlusionWetGain *
                isolationWetGain,
            now,
            0.18
        );
        instance.reverbSend.gain.setTargetAtTime(
            lerpNumber(
                BOT_TRAFFIC_AUDIO_CONFIG.reverbSendFar,
                BOT_TRAFFIC_AUDIO_CONFIG.reverbSendNear,
                nearMix
            ) *
                (0.92 + echoMix * 0.18) *
                occlusionWetGain *
                isolationWetGain,
            now,
            0.22
        );
        instance.toneFilter.frequency.setTargetAtTime(
            lerpNumber(
                lerpNumber(
                    BOT_TRAFFIC_AUDIO_CONFIG.farCutoffHz,
                    BOT_TRAFFIC_AUDIO_CONFIG.nearCutoffHz + sideMix * 1200,
                    nearMix
                ),
                BOT_TRAFFIC_OCCLUSION_MIN_CUTOFF_HZ,
                occlusion
            ) * (undergroundMismatch ? 0.72 : 1),
            now,
            0.18
        );
        instance.toneFilter.Q.setTargetAtTime(lerpNumber(0.62, 1.12, nearMix), now, 0.16);
        instance.wetFilter.frequency.setTargetAtTime(
            lerpNumber(
                lerpNumber(
                    BOT_TRAFFIC_AUDIO_CONFIG.farWetLowpassHz,
                    BOT_TRAFFIC_AUDIO_CONFIG.nearWetLowpassHz,
                    nearMix
                ),
                BOT_TRAFFIC_OCCLUSION_MIN_WET_CUTOFF_HZ,
                occlusion
            ) * (undergroundMismatch ? 0.84 : 1),
            now,
            0.22
        );
        instance.delay.delayTime.setTargetAtTime(
            lerpNumber(
                BOT_TRAFFIC_AUDIO_CONFIG.farDelaySec,
                BOT_TRAFFIC_AUDIO_CONFIG.nearDelaySec,
                nearMix
            ),
            now,
            0.18
        );
        instance.delayFeedback.gain.setTargetAtTime(
            lerpNumber(
                BOT_TRAFFIC_AUDIO_CONFIG.farFeedback,
                BOT_TRAFFIC_AUDIO_CONFIG.nearFeedback,
                nearMix
            ),
            now,
            0.22
        );

        const idleLayerGain =
            clampNumber(1.04 - speedNorm * 1.74, 0, 1, 0) * (0.78 + nearMix * 0.22);
        const lowLayerGain = bellCurve(speedNorm, 0.26, 0.32) * 0.96;
        const midLayerGain = bellCurve(speedNorm, 0.58, 0.3) * 0.94;
        const highLayerGain =
            clampNumber((speedNorm - 0.36) / 0.64, 0, 1, 0) * (0.5 + speedNorm * 0.5);

        updateBotTrafficLayer(
            instance,
            'engineIdleLoop01',
            idleLayerGain,
            0.88 + speedNorm * 0.18 + approachRateOffset * 0.35,
            now
        );
        updateBotTrafficLayer(
            instance,
            'engineLowLoop01',
            lowLayerGain,
            0.92 + speedNorm * 0.28 + approachRateOffset * 0.72,
            now
        );
        updateBotTrafficLayer(
            instance,
            'engineMidLoop01',
            midLayerGain,
            0.98 + speedNorm * 0.36 + approachRateOffset,
            now
        );
        updateBotTrafficLayer(
            instance,
            'engineHighLoop01',
            highLayerGain,
            1.04 + speedNorm * 0.44 + approachRateOffset * 1.18,
            now
        );
    }

    function updateBotTrafficLayer(
        instance,
        soundId,
        layerGain,
        playbackRate,
        now = context?.currentTime || 0
    ) {
        const layer = instance?.layers?.[soundId];
        if (!layer || !context) {
            return;
        }
        layer.gain.gain.setTargetAtTime(
            clampNumber(layerGain, 0, 1, 0) * layer.baseGain * BOT_TRAFFIC_LAYER_GAIN_SCALE,
            now,
            0.12
        );
        layer.source.playbackRate.setTargetAtTime(
            clampNumber(playbackRate, 0.55, 2.2, 1),
            now,
            0.12
        );
    }

    function fadeOutBotTrafficInstance(instance, now = context?.currentTime || 0) {
        if (!instance || !context) {
            return;
        }
        instance.sourceGain.gain.setTargetAtTime(0, now, 0.12);
        instance.dryGain.gain.setTargetAtTime(0, now, 0.12);
        instance.wetGain.gain.setTargetAtTime(0, now, 0.16);
        instance.delaySend.gain.setTargetAtTime(0, now, 0.14);
        instance.reverbSend.gain.setTargetAtTime(0, now, 0.16);
        for (let i = 0; i < BOT_TRAFFIC_ENGINE_SOUND_IDS.length; i += 1) {
            const layer = instance.layers?.[BOT_TRAFFIC_ENGINE_SOUND_IDS[i]];
            if (!layer) {
                continue;
            }
            layer.gain.gain.setTargetAtTime(0, now, 0.1);
        }
    }

    function disposeBotTrafficInstance(instance) {
        if (!instance) {
            return;
        }
        for (let i = 0; i < BOT_TRAFFIC_ENGINE_SOUND_IDS.length; i += 1) {
            const layer = instance.layers?.[BOT_TRAFFIC_ENGINE_SOUND_IDS[i]];
            if (!layer) {
                continue;
            }
            safeStopSource(layer.source);
            safeDisconnect(layer.source);
            safeDisconnect(layer.gain);
        }
        safeDisconnect(instance.sourceGain);
        safeDisconnect(instance.toneFilter);
        safeDisconnect(instance.panner);
        safeDisconnect(instance.dryGain);
        safeDisconnect(instance.delaySend);
        safeDisconnect(instance.delay);
        safeDisconnect(instance.delayFeedback);
        safeDisconnect(instance.reverbSend);
        safeDisconnect(instance.convolver);
        safeDisconnect(instance.wetFilter);
        safeDisconnect(instance.wetGain);
    }

    function updateMonumentMusic(frameState = {}) {
        const shouldBeAudible =
            !Boolean(frameState.isPaused) &&
            !Boolean(frameState.welcomeVisible) &&
            !Boolean(frameState.editModeActive) &&
            !Boolean(frameState.pickupRoundFinished);

        if (!shouldBeAudible && !monumentMusicInstance) {
            return;
        }

        const instance = monumentMusicInstance || ensureMonumentMusicInstance();
        if (!instance || !context || !camera?.position) {
            return;
        }
        ensureStreamingMediaPlayback(instance);

        const now = context.currentTime;
        const dx = (Number(camera.position.x) || 0) - MONUMENT_AUDIO_CONFIG.x;
        const dy = (Number(camera.position.y) || 0) - MONUMENT_AUDIO_CONFIG.y;
        const dz = (Number(camera.position.z) || 0) - MONUMENT_AUDIO_CONFIG.z;
        const distance = Math.hypot(dx, dz, dy * 0.65);
        const nearMix =
            1 -
            clampNumber(
                (distance - MONUMENT_AUDIO_CONFIG.fullPresenceDistance) /
                    Math.max(
                        1,
                        MONUMENT_AUDIO_CONFIG.audibleDistance -
                            MONUMENT_AUDIO_CONFIG.fullPresenceDistance
                    ),
                0,
                1,
                0
            );
        const wideAreaMix = 1 - clampNumber(distance / MONUMENT_AUDIO_CONFIG.maxDistance, 0, 1, 0);
        const activeMix =
            shouldBeAudible && !Boolean(frameState.undergroundParkingIsolationActive) ? 1 : 0;
        const definitionGain = SOUND_DEFINITIONS[MONUMENT_MUSIC_SOUND_ID]?.gain || 1;
        const lowerLevelMix = clampNumber(frameState.lowerLevelSilenceFactor, 0, 1, 0);
        const sourceOcclusionMix = lerpNumber(1, 0.34, lowerLevelMix);
        const dryOcclusionMix = lerpNumber(1, 0.12, lowerLevelMix);
        const wetOcclusionMix = lerpNumber(1, 0.74, lowerLevelMix);
        const echoBoost = lerpNumber(1, 1.42, lowerLevelMix);
        const baseToneCutoffHz = lerpNumber(
            MONUMENT_AUDIO_CONFIG.farCutoffHz,
            MONUMENT_AUDIO_CONFIG.nearCutoffHz,
            nearMix
        );
        const baseWetCutoffHz = lerpNumber(
            MONUMENT_AUDIO_CONFIG.farWetLowpassHz,
            MONUMENT_AUDIO_CONFIG.nearWetLowpassHz,
            nearMix
        );
        const baseDelaySec = lerpNumber(
            MONUMENT_AUDIO_CONFIG.farDelaySec,
            MONUMENT_AUDIO_CONFIG.nearDelaySec,
            nearMix
        );
        const baseFeedback = lerpNumber(
            MONUMENT_AUDIO_CONFIG.farFeedback,
            MONUMENT_AUDIO_CONFIG.nearFeedback,
            nearMix
        );

        instance.sourceGain.gain.setTargetAtTime(
            activeMix *
                sourceOcclusionMix *
                definitionGain *
                lerpNumber(
                    MONUMENT_AUDIO_CONFIG.farSourceGain,
                    MONUMENT_AUDIO_CONFIG.nearSourceGain,
                    nearMix
                ) *
                (0.42 + wideAreaMix * 0.58),
            now,
            0.3
        );
        instance.dryGain.gain.setTargetAtTime(
            activeMix *
                dryOcclusionMix *
                lerpNumber(
                    MONUMENT_AUDIO_CONFIG.farDryGain,
                    MONUMENT_AUDIO_CONFIG.nearDryGain,
                    nearMix
                ),
            now,
            0.24
        );
        instance.wetGain.gain.setTargetAtTime(
            activeMix *
                wetOcclusionMix *
                lerpNumber(
                    MONUMENT_AUDIO_CONFIG.farWetGain,
                    MONUMENT_AUDIO_CONFIG.nearWetGain,
                    nearMix
                ) *
                echoBoost,
            now,
            0.28
        );
        instance.delaySend.gain.setTargetAtTime(
            activeMix *
                wetOcclusionMix *
                lerpNumber(
                    MONUMENT_AUDIO_CONFIG.delaySendFar,
                    MONUMENT_AUDIO_CONFIG.delaySendNear,
                    nearMix
                ) *
                (0.64 + wideAreaMix * 0.36) *
                echoBoost,
            now,
            0.26
        );
        instance.reverbSend.gain.setTargetAtTime(
            activeMix *
                wetOcclusionMix *
                lerpNumber(
                    MONUMENT_AUDIO_CONFIG.reverbSendFar,
                    MONUMENT_AUDIO_CONFIG.reverbSendNear,
                    nearMix
                ) *
                (0.72 + wideAreaMix * 0.28) *
                lerpNumber(1, 1.54, lowerLevelMix),
            now,
            0.3
        );
        instance.toneFilter.frequency.setTargetAtTime(
            baseToneCutoffHz * lerpNumber(1, 0.74, lowerLevelMix),
            now,
            0.24
        );
        instance.toneFilter.Q.setTargetAtTime(lerpNumber(0.24, 0.7, nearMix), now, 0.28);
        instance.wetFilter.frequency.setTargetAtTime(
            baseWetCutoffHz * lerpNumber(1, 0.86, lowerLevelMix),
            now,
            0.3
        );
        instance.delay.delayTime.setTargetAtTime(
            Math.min(0.42, baseDelaySec + lowerLevelMix * 0.05),
            now,
            0.22
        );
        instance.delayFeedback.gain.setTargetAtTime(
            Math.min(0.58, baseFeedback + lowerLevelMix * 0.08),
            now,
            0.28
        );
    }

    function updateLorienGalleryVideoAudio(frameState = {}) {
        const videoDisplayState = getLorienVelmoreGalleryVideoDisplayState();
        if (!videoDisplayState?.videoElement) {
            if (lorienGalleryVideoInstance) {
                disposeLorienGalleryVideoInstance();
            }
            return;
        }

        const instance = ensureLorienGalleryVideoInstance(videoDisplayState);
        if (!instance || !context || !camera?.position) {
            return;
        }

        const now = context.currentTime;
        const x = Number(videoDisplayState.worldX) || 0;
        const y = Number(videoDisplayState.worldY) || 0;
        const z = Number(videoDisplayState.worldZ) || 0;
        setPannerPosition(instance.panner, x, y, z, now);

        const dx = (Number(camera.position.x) || 0) - x;
        const dy = (Number(camera.position.y) || 0) - y;
        const dz = (Number(camera.position.z) || 0) - z;
        const distance = Math.hypot(dx, dz, dy * 0.72);
        const nearMix =
            1 -
            clampNumber(
                (distance - LORIEN_GALLERY_AUDIO_CONFIG.fullPresenceDistance) /
                    Math.max(
                        1,
                        LORIEN_GALLERY_AUDIO_CONFIG.audibleDistance -
                            LORIEN_GALLERY_AUDIO_CONFIG.fullPresenceDistance
                    ),
                0,
                1,
                0
            );
        const wideAreaMix =
            1 - clampNumber(distance / LORIEN_GALLERY_AUDIO_CONFIG.maxDistance, 0, 1, 0);
        const occlusion = resolveWorldAudioOcclusion({ x, y, z });
        const occlusionGain = lerpNumber(1, LORIEN_GALLERY_OCCLUSION_MIN_GAIN, occlusion);
        const occlusionWetGain = lerpNumber(1, LORIEN_GALLERY_OCCLUSION_MIN_WET_GAIN, occlusion);
        const activeMix =
            Boolean(videoDisplayState.isPlaybackActive) &&
            !Boolean(frameState.isPaused) &&
            !Boolean(frameState.welcomeVisible) &&
            !Boolean(frameState.editModeActive) &&
            !Boolean(frameState.pickupRoundFinished)
                ? 1
                : 0;

        instance.sourceGain.gain.setTargetAtTime(
            activeMix *
                occlusionGain *
                lerpNumber(
                    LORIEN_GALLERY_AUDIO_CONFIG.farSourceGain,
                    LORIEN_GALLERY_AUDIO_CONFIG.nearSourceGain,
                    nearMix
                ) *
                (0.58 + wideAreaMix * 0.42),
            now,
            0.24
        );
        instance.dryGain.gain.setTargetAtTime(
            activeMix *
                occlusionGain *
                lerpNumber(
                    LORIEN_GALLERY_AUDIO_CONFIG.farDryGain,
                    LORIEN_GALLERY_AUDIO_CONFIG.nearDryGain,
                    nearMix
                ),
            now,
            0.22
        );
        instance.wetGain.gain.setTargetAtTime(
            activeMix *
                occlusionWetGain *
                lerpNumber(
                    LORIEN_GALLERY_AUDIO_CONFIG.farWetGain,
                    LORIEN_GALLERY_AUDIO_CONFIG.nearWetGain,
                    nearMix
                ),
            now,
            0.28
        );
        instance.delaySend.gain.setTargetAtTime(
            activeMix *
                occlusionWetGain *
                lerpNumber(
                    LORIEN_GALLERY_AUDIO_CONFIG.delaySendFar,
                    LORIEN_GALLERY_AUDIO_CONFIG.delaySendNear,
                    nearMix
                ),
            now,
            0.26
        );
        instance.reverbSend.gain.setTargetAtTime(
            activeMix *
                occlusionWetGain *
                lerpNumber(
                    LORIEN_GALLERY_AUDIO_CONFIG.reverbSendFar,
                    LORIEN_GALLERY_AUDIO_CONFIG.reverbSendNear,
                    nearMix
                ),
            now,
            0.3
        );
        instance.toneFilter.frequency.setTargetAtTime(
            lerpNumber(
                LORIEN_GALLERY_AUDIO_CONFIG.farCutoffHz,
                lerpNumber(
                    LORIEN_GALLERY_AUDIO_CONFIG.nearCutoffHz,
                    LORIEN_GALLERY_OCCLUSION_MIN_CUTOFF_HZ,
                    occlusion
                ),
                nearMix
            ),
            now,
            0.24
        );
        instance.wetFilter.frequency.setTargetAtTime(
            lerpNumber(
                LORIEN_GALLERY_AUDIO_CONFIG.farWetLowpassHz,
                lerpNumber(
                    LORIEN_GALLERY_AUDIO_CONFIG.nearWetLowpassHz,
                    LORIEN_GALLERY_OCCLUSION_MIN_WET_CUTOFF_HZ,
                    occlusion
                ),
                nearMix
            ),
            now,
            0.28
        );
        instance.delay.delayTime.setTargetAtTime(
            lerpNumber(
                LORIEN_GALLERY_AUDIO_CONFIG.farDelaySec,
                LORIEN_GALLERY_AUDIO_CONFIG.nearDelaySec,
                nearMix
            ),
            now,
            0.24
        );
        instance.delayFeedback.gain.setTargetAtTime(
            lerpNumber(
                LORIEN_GALLERY_AUDIO_CONFIG.farFeedback,
                LORIEN_GALLERY_AUDIO_CONFIG.nearFeedback,
                nearMix
            ),
            now,
            0.28
        );
    }

    function updateUfoDiskoStoreMusic(frameState = {}) {
        const storeAudioState = getUfoDiskoStoreAudioState();
        if (!storeAudioState) {
            if (ufoDiskoMusicInstance && context) {
                const now = context.currentTime;
                ufoDiskoMusicInstance.sourceGain.gain.setTargetAtTime(0, now, 0.08);
                ufoDiskoMusicInstance.dryGain.gain.setTargetAtTime(0, now, 0.08);
                ufoDiskoMusicInstance.delaySend.gain.setTargetAtTime(0, now, 0.08);
                ufoDiskoMusicInstance.reverbSend.gain.setTargetAtTime(0, now, 0.08);
                ufoDiskoMusicInstance.wetGain.gain.setTargetAtTime(0, now, 0.08);
            }
            return;
        }

        const shouldBeAudible =
            !Boolean(frameState.isPaused) &&
            !Boolean(frameState.welcomeVisible) &&
            !Boolean(frameState.editModeActive) &&
            !Boolean(frameState.pickupRoundFinished);
        const doorOpenAmount = clampNumber(storeAudioState.doorOpenAmount, 0, 1, 0);
        const listenerPosition = runtime.playerPosition || camera?.position || null;
        const listenerInside = Boolean(listenerPosition)
            ? isInsideUfoDiskoStoreWorld(
                  Number(listenerPosition.x) || 0,
                  Number(listenerPosition.y) || 0,
                  Number(listenerPosition.z) || 0,
                  0.24
              )
            : false;
        const shouldStartPlayback = listenerInside || doorOpenAmount > 0.06;

        if (!shouldStartPlayback && !ufoDiskoMusicInstance) {
            return;
        }

        const instance = ufoDiskoMusicInstance || ensureUfoDiskoMusicInstance();
        if (!instance || !context || !camera?.position) {
            return;
        }
        ensureStreamingMediaPlayback(instance);

        const now = context.currentTime;
        const x = Number(storeAudioState.worldX) || 0;
        const y = Number(storeAudioState.worldY) || 0;
        const z = Number(storeAudioState.worldZ) || 0;
        setPannerPosition(instance.panner, x, y, z, now);

        const dx = (Number(camera.position.x) || 0) - x;
        const dy = (Number(camera.position.y) || 0) - y;
        const dz = (Number(camera.position.z) || 0) - z;
        const distance = Math.hypot(dx, dz, dy * 0.74);
        const nearMix =
            1 -
            clampNumber(
                (distance - UFO_DISKO_STORE_AUDIO_CONFIG.fullPresenceDistance) /
                    Math.max(
                        1,
                        UFO_DISKO_STORE_AUDIO_CONFIG.audibleDistance -
                            UFO_DISKO_STORE_AUDIO_CONFIG.fullPresenceDistance
                    ),
                0,
                1,
                0
            );
        const wideAreaMix =
            1 - clampNumber(distance / UFO_DISKO_STORE_AUDIO_CONFIG.maxDistance, 0, 1, 0);
        const doorLeakMix = smoothstep(doorOpenAmount);
        const audibleMix =
            shouldBeAudible && (listenerInside || doorLeakMix > 0.02)
                ? listenerInside
                    ? 1
                    : clampNumber(doorLeakMix * (0.36 + wideAreaMix * 0.44), 0, 0.72, 0)
                : 0;
        const definitionGain = SOUND_DEFINITIONS[UFO_DISKO_STORE_MUSIC_SOUND_ID]?.gain || 1;
        const filterNearMix = clampNumber(
            nearMix * 0.72 + (listenerInside ? 0.28 : doorLeakMix * 0.14),
            0,
            1,
            0
        );
        const dryOutsideScale = 0.28 + doorLeakMix * 0.24;
        const wetOutsideScale = 0.44 + doorLeakMix * 0.22;

        instance.sourceGain.gain.setTargetAtTime(
            audibleMix *
                definitionGain *
                lerpNumber(
                    UFO_DISKO_STORE_AUDIO_CONFIG.farSourceGain,
                    UFO_DISKO_STORE_AUDIO_CONFIG.nearSourceGain,
                    nearMix
                ) *
                (listenerInside ? 1 : 0.62 + wideAreaMix * 0.24),
            now,
            0.42
        );
        instance.dryGain.gain.setTargetAtTime(
            audibleMix *
                lerpNumber(
                    UFO_DISKO_STORE_AUDIO_CONFIG.farDryGain,
                    UFO_DISKO_STORE_AUDIO_CONFIG.nearDryGain,
                    nearMix
                ) *
                (listenerInside ? 1 : dryOutsideScale),
            now,
            0.36
        );
        instance.wetGain.gain.setTargetAtTime(
            audibleMix *
                lerpNumber(
                    UFO_DISKO_STORE_AUDIO_CONFIG.farWetGain,
                    UFO_DISKO_STORE_AUDIO_CONFIG.nearWetGain,
                    nearMix
                ) *
                (listenerInside ? 1 : wetOutsideScale),
            now,
            0.4
        );
        instance.delaySend.gain.setTargetAtTime(
            audibleMix *
                lerpNumber(
                    UFO_DISKO_STORE_AUDIO_CONFIG.delaySendFar,
                    UFO_DISKO_STORE_AUDIO_CONFIG.delaySendNear,
                    nearMix
                ) *
                (listenerInside ? 1 : 0.52 + doorLeakMix * 0.16),
            now,
            0.34
        );
        instance.reverbSend.gain.setTargetAtTime(
            audibleMix *
                lerpNumber(
                    UFO_DISKO_STORE_AUDIO_CONFIG.reverbSendFar,
                    UFO_DISKO_STORE_AUDIO_CONFIG.reverbSendNear,
                    nearMix
                ) *
                (listenerInside ? 1 : 0.62 + doorLeakMix * 0.12),
            now,
            0.38
        );
        instance.toneFilter.frequency.setTargetAtTime(
            lerpNumber(
                UFO_DISKO_STORE_AUDIO_CONFIG.farCutoffHz,
                UFO_DISKO_STORE_AUDIO_CONFIG.nearCutoffHz,
                filterNearMix
            ),
            now,
            0.32
        );
        instance.toneFilter.Q.setTargetAtTime(lerpNumber(0.72, 1.24, filterNearMix), now, 0.3);
        instance.wetFilter.frequency.setTargetAtTime(
            lerpNumber(
                UFO_DISKO_STORE_AUDIO_CONFIG.farWetLowpassHz,
                UFO_DISKO_STORE_AUDIO_CONFIG.nearWetLowpassHz,
                filterNearMix
            ),
            now,
            0.34
        );
        instance.delay.delayTime.setTargetAtTime(
            lerpNumber(
                UFO_DISKO_STORE_AUDIO_CONFIG.farDelaySec,
                UFO_DISKO_STORE_AUDIO_CONFIG.nearDelaySec,
                nearMix
            ),
            now,
            0.28
        );
        instance.delayFeedback.gain.setTargetAtTime(
            lerpNumber(
                UFO_DISKO_STORE_AUDIO_CONFIG.farFeedback,
                UFO_DISKO_STORE_AUDIO_CONFIG.nearFeedback,
                nearMix
            ),
            now,
            0.32
        );
    }

    function ensureLorienGalleryVideoInstance(videoDisplayState) {
        if (!isRealtimeAudioReady() || !context || !mixer) {
            return null;
        }

        const mediaElement = videoDisplayState?.videoElement;
        if (!mediaElement) {
            return null;
        }

        if (lorienGalleryVideoInstance?.mediaElement === mediaElement) {
            return lorienGalleryVideoInstance;
        }

        disposeLorienGalleryVideoInstance();

        const busNode = mixer.buses[LORIEN_GALLERY_VIDEO_BUS] || mixer.buses.ambience;
        if (!busNode) {
            return null;
        }

        const mediaSource = context.createMediaElementSource(mediaElement);
        mediaElement.muted = false;
        mediaElement.defaultMuted = false;
        mediaElement.removeAttribute('muted');
        mediaElement.volume = 1;

        const sourceGain = context.createGain();
        sourceGain.gain.setValueAtTime(0, context.currentTime);

        const toneFilter = context.createBiquadFilter();
        toneFilter.type = 'lowpass';
        toneFilter.frequency.setValueAtTime(
            LORIEN_GALLERY_AUDIO_CONFIG.farCutoffHz,
            context.currentTime
        );
        toneFilter.Q.setValueAtTime(0.84, context.currentTime);

        const panner = context.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = LORIEN_GALLERY_AUDIO_CONFIG.refDistance;
        panner.maxDistance = LORIEN_GALLERY_AUDIO_CONFIG.maxDistance;
        panner.rolloffFactor = LORIEN_GALLERY_AUDIO_CONFIG.rolloffFactor;
        panner.coneInnerAngle = 360;
        panner.coneOuterAngle = 360;
        panner.coneOuterGain = 1;
        setPannerPosition(
            panner,
            Number(videoDisplayState.worldX) || 0,
            Number(videoDisplayState.worldY) || 0,
            Number(videoDisplayState.worldZ) || 0,
            context.currentTime
        );

        const dryGain = context.createGain();
        dryGain.gain.setValueAtTime(0, context.currentTime);

        const delaySend = context.createGain();
        delaySend.gain.setValueAtTime(0, context.currentTime);
        const delay = context.createDelay(1);
        delay.delayTime.setValueAtTime(
            LORIEN_GALLERY_AUDIO_CONFIG.farDelaySec,
            context.currentTime
        );
        const delayFeedback = context.createGain();
        delayFeedback.gain.setValueAtTime(
            LORIEN_GALLERY_AUDIO_CONFIG.farFeedback,
            context.currentTime
        );

        const reverbSend = context.createGain();
        reverbSend.gain.setValueAtTime(0, context.currentTime);
        const convolver = context.createConvolver();
        lorienGalleryImpulseBuffer =
            lorienGalleryImpulseBuffer || createGalleryHallImpulseBuffer(context, 2.1, 2.2);
        convolver.buffer = lorienGalleryImpulseBuffer;

        const wetFilter = context.createBiquadFilter();
        wetFilter.type = 'lowpass';
        wetFilter.frequency.setValueAtTime(
            LORIEN_GALLERY_AUDIO_CONFIG.farWetLowpassHz,
            context.currentTime
        );

        const wetGain = context.createGain();
        wetGain.gain.setValueAtTime(0, context.currentTime);

        mediaSource.connect(sourceGain);
        sourceGain.connect(toneFilter);
        toneFilter.connect(panner);
        panner.connect(dryGain);
        dryGain.connect(busNode);
        panner.connect(delaySend);
        delaySend.connect(delay);
        delay.connect(delayFeedback);
        delayFeedback.connect(delay);
        delay.connect(wetFilter);
        panner.connect(reverbSend);
        reverbSend.connect(convolver);
        convolver.connect(wetFilter);
        wetFilter.connect(wetGain);
        wetGain.connect(busNode);

        lorienGalleryVideoInstance = {
            mediaElement,
            mediaSource,
            sourceGain,
            toneFilter,
            panner,
            dryGain,
            delaySend,
            delay,
            delayFeedback,
            reverbSend,
            convolver,
            wetFilter,
            wetGain,
        };

        return lorienGalleryVideoInstance;
    }

    function ensureUfoDiskoMusicInstance() {
        if (!isRealtimeAudioReady() || !context || !mixer) {
            return null;
        }
        if (ufoDiskoMusicInstance) {
            return ufoDiskoMusicInstance;
        }

        const definition = SOUND_DEFINITIONS[UFO_DISKO_STORE_MUSIC_SOUND_ID];
        const mediaElement = getOrCreateStreamingMediaElement(UFO_DISKO_STORE_MUSIC_SOUND_ID, {
            loop: true,
        });
        if (!definition || !mediaElement) {
            void preloadStreamingSound(UFO_DISKO_STORE_MUSIC_SOUND_ID);
            return null;
        }

        const busNode = mixer.buses[definition.bus] || mixer.buses.ambience;
        if (!busNode) {
            return null;
        }

        const storeAudioState = getUfoDiskoStoreAudioState();
        const mediaSource = context.createMediaElementSource(mediaElement);

        const sourceGain = context.createGain();
        sourceGain.gain.setValueAtTime(0, context.currentTime);

        const toneFilter = context.createBiquadFilter();
        toneFilter.type = 'lowpass';
        toneFilter.frequency.setValueAtTime(
            UFO_DISKO_STORE_AUDIO_CONFIG.farCutoffHz,
            context.currentTime
        );
        toneFilter.Q.setValueAtTime(0.92, context.currentTime);

        const panner = context.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = UFO_DISKO_STORE_AUDIO_CONFIG.refDistance;
        panner.maxDistance = UFO_DISKO_STORE_AUDIO_CONFIG.maxDistance;
        panner.rolloffFactor = UFO_DISKO_STORE_AUDIO_CONFIG.rolloffFactor;
        panner.coneInnerAngle = 360;
        panner.coneOuterAngle = 360;
        panner.coneOuterGain = 1;
        setPannerPosition(
            panner,
            Number(storeAudioState?.worldX) || 0,
            Number(storeAudioState?.worldY) || 0,
            Number(storeAudioState?.worldZ) || 0,
            context.currentTime
        );

        const dryGain = context.createGain();
        dryGain.gain.setValueAtTime(0, context.currentTime);

        const delaySend = context.createGain();
        delaySend.gain.setValueAtTime(0, context.currentTime);
        const delay = context.createDelay(0.5);
        delay.delayTime.setValueAtTime(
            UFO_DISKO_STORE_AUDIO_CONFIG.farDelaySec,
            context.currentTime
        );
        const delayFeedback = context.createGain();
        delayFeedback.gain.setValueAtTime(
            UFO_DISKO_STORE_AUDIO_CONFIG.farFeedback,
            context.currentTime
        );

        const reverbSend = context.createGain();
        reverbSend.gain.setValueAtTime(0, context.currentTime);
        const convolver = context.createConvolver();
        ufoDiskoMusicImpulseBuffer =
            ufoDiskoMusicImpulseBuffer || createGalleryHallImpulseBuffer(context, 1.35, 1.8);
        convolver.buffer = ufoDiskoMusicImpulseBuffer;

        const wetFilter = context.createBiquadFilter();
        wetFilter.type = 'lowpass';
        wetFilter.frequency.setValueAtTime(
            UFO_DISKO_STORE_AUDIO_CONFIG.farWetLowpassHz,
            context.currentTime
        );

        const wetGain = context.createGain();
        wetGain.gain.setValueAtTime(0, context.currentTime);

        mediaSource.connect(sourceGain);
        sourceGain.connect(toneFilter);
        toneFilter.connect(panner);
        panner.connect(dryGain);
        dryGain.connect(busNode);
        panner.connect(delaySend);
        delaySend.connect(delay);
        delay.connect(delayFeedback);
        delayFeedback.connect(delay);
        delay.connect(wetFilter);
        panner.connect(reverbSend);
        reverbSend.connect(convolver);
        convolver.connect(wetFilter);
        wetFilter.connect(wetGain);
        wetGain.connect(busNode);

        const applyRandomStartOffset = once(() => {
            const duration = Number(mediaElement.duration);
            if (!Number.isFinite(duration) || duration <= 1.25) {
                return;
            }
            try {
                mediaElement.currentTime = randomRange(0, Math.max(0.01, duration - 0.65));
            } catch {
                // Ignore seek failures until metadata becomes seekable.
            }
        });
        if (mediaElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
            applyRandomStartOffset();
        } else {
            mediaElement.addEventListener('loadedmetadata', applyRandomStartOffset, { once: true });
        }

        ufoDiskoMusicInstance = {
            kind: 'stream',
            mediaElement,
            mediaSource,
            sourceGain,
            toneFilter,
            panner,
            dryGain,
            delaySend,
            delay,
            delayFeedback,
            reverbSend,
            convolver,
            wetFilter,
            wetGain,
            lastPlayAttemptTime: -Infinity,
        };
        ensureStreamingMediaPlayback(ufoDiskoMusicInstance);

        return ufoDiskoMusicInstance;
    }

    function disposeLorienGalleryVideoInstance() {
        if (!lorienGalleryVideoInstance) {
            return;
        }
        if (lorienGalleryVideoInstance.mediaElement) {
            lorienGalleryVideoInstance.mediaElement.muted = true;
            lorienGalleryVideoInstance.mediaElement.defaultMuted = true;
            lorienGalleryVideoInstance.mediaElement.setAttribute('muted', '');
        }
        safeDisconnect(lorienGalleryVideoInstance.mediaSource);
        safeDisconnect(lorienGalleryVideoInstance.sourceGain);
        safeDisconnect(lorienGalleryVideoInstance.toneFilter);
        safeDisconnect(lorienGalleryVideoInstance.panner);
        safeDisconnect(lorienGalleryVideoInstance.dryGain);
        safeDisconnect(lorienGalleryVideoInstance.delaySend);
        safeDisconnect(lorienGalleryVideoInstance.delay);
        safeDisconnect(lorienGalleryVideoInstance.delayFeedback);
        safeDisconnect(lorienGalleryVideoInstance.reverbSend);
        safeDisconnect(lorienGalleryVideoInstance.convolver);
        safeDisconnect(lorienGalleryVideoInstance.wetFilter);
        safeDisconnect(lorienGalleryVideoInstance.wetGain);
        lorienGalleryVideoInstance = null;
    }

    function disposeUfoDiskoMusicInstance() {
        if (!ufoDiskoMusicInstance) {
            return;
        }
        try {
            ufoDiskoMusicInstance.mediaElement?.pause?.();
        } catch {
            // Ignore pause failures during teardown.
        }
        safeDisconnect(ufoDiskoMusicInstance.mediaSource);
        safeDisconnect(ufoDiskoMusicInstance.sourceGain);
        safeDisconnect(ufoDiskoMusicInstance.toneFilter);
        safeDisconnect(ufoDiskoMusicInstance.panner);
        safeDisconnect(ufoDiskoMusicInstance.dryGain);
        safeDisconnect(ufoDiskoMusicInstance.delaySend);
        safeDisconnect(ufoDiskoMusicInstance.delay);
        safeDisconnect(ufoDiskoMusicInstance.delayFeedback);
        safeDisconnect(ufoDiskoMusicInstance.reverbSend);
        safeDisconnect(ufoDiskoMusicInstance.convolver);
        safeDisconnect(ufoDiskoMusicInstance.wetFilter);
        safeDisconnect(ufoDiskoMusicInstance.wetGain);
        ufoDiskoMusicInstance = null;
    }

    function ensureMonumentMusicInstance() {
        if (!isRealtimeAudioReady() || !context || !mixer) {
            return null;
        }
        if (monumentMusicInstance) {
            return monumentMusicInstance;
        }

        const definition = SOUND_DEFINITIONS[MONUMENT_MUSIC_SOUND_ID];
        const mediaElement = getOrCreateStreamingMediaElement(MONUMENT_MUSIC_SOUND_ID, {
            loop: true,
        });
        if (!definition || !mediaElement) {
            void preloadStreamingSound(MONUMENT_MUSIC_SOUND_ID);
            return null;
        }

        const busNode = mixer.buses[definition.bus];
        if (!busNode) {
            return null;
        }

        const mediaSource = context.createMediaElementSource(mediaElement);

        const sourceGain = context.createGain();
        sourceGain.gain.setValueAtTime(0, context.currentTime);

        const toneFilter = context.createBiquadFilter();
        toneFilter.type = 'lowpass';
        toneFilter.frequency.setValueAtTime(MONUMENT_AUDIO_CONFIG.farCutoffHz, context.currentTime);
        toneFilter.Q.setValueAtTime(0.3, context.currentTime);

        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;
        const frequencyData = new Uint8Array(analyser.frequencyBinCount);

        const panner = context.createPanner();
        panner.panningModel = 'equalpower';
        panner.distanceModel = 'inverse';
        panner.refDistance = MONUMENT_AUDIO_CONFIG.refDistance;
        panner.maxDistance = MONUMENT_AUDIO_CONFIG.maxDistance;
        panner.rolloffFactor = MONUMENT_AUDIO_CONFIG.rolloffFactor;
        panner.coneInnerAngle = 360;
        panner.coneOuterAngle = 360;
        panner.coneOuterGain = 1;
        setPannerPosition(
            panner,
            MONUMENT_AUDIO_CONFIG.x,
            MONUMENT_AUDIO_CONFIG.y,
            MONUMENT_AUDIO_CONFIG.z,
            context.currentTime
        );

        const dryGain = context.createGain();
        dryGain.gain.setValueAtTime(0, context.currentTime);

        const delaySend = context.createGain();
        delaySend.gain.setValueAtTime(0, context.currentTime);
        const delay = context.createDelay(1);
        delay.delayTime.setValueAtTime(MONUMENT_AUDIO_CONFIG.farDelaySec, context.currentTime);
        const delayFeedback = context.createGain();
        delayFeedback.gain.setValueAtTime(MONUMENT_AUDIO_CONFIG.farFeedback, context.currentTime);

        const reverbSend = context.createGain();
        reverbSend.gain.setValueAtTime(0, context.currentTime);
        const convolver = context.createConvolver();
        monumentImpulseBuffer =
            monumentImpulseBuffer || createUrbanPlazaImpulseBuffer(context, 2.8, 2.6);
        convolver.buffer = monumentImpulseBuffer;

        const wetFilter = context.createBiquadFilter();
        wetFilter.type = 'lowpass';
        wetFilter.frequency.setValueAtTime(
            MONUMENT_AUDIO_CONFIG.farWetLowpassHz,
            context.currentTime
        );

        const wetGain = context.createGain();
        wetGain.gain.setValueAtTime(0, context.currentTime);

        mediaSource.connect(sourceGain);
        sourceGain.connect(analyser);
        analyser.connect(toneFilter);
        toneFilter.connect(panner);
        panner.connect(dryGain);
        dryGain.connect(busNode);
        panner.connect(delaySend);
        delaySend.connect(delay);
        delay.connect(delayFeedback);
        delayFeedback.connect(delay);
        delay.connect(wetFilter);
        panner.connect(reverbSend);
        reverbSend.connect(convolver);
        convolver.connect(wetFilter);
        wetFilter.connect(wetGain);
        wetGain.connect(busNode);

        monumentMusicInstance = {
            kind: 'stream',
            mediaElement,
            mediaSource,
            sourceGain,
            analyser,
            frequencyData,
            toneFilter,
            panner,
            dryGain,
            delaySend,
            delay,
            delayFeedback,
            reverbSend,
            convolver,
            wetFilter,
            wetGain,
            lastPlayAttemptTime: -Infinity,
        };
        ensureStreamingMediaPlayback(monumentMusicInstance);

        return monumentMusicInstance;
    }

    function disposeMonumentMusicInstance() {
        if (!monumentMusicInstance) {
            return;
        }
        try {
            monumentMusicInstance.mediaElement?.pause?.();
        } catch {
            // Ignore pause failures during teardown.
        }
        safeDisconnect(monumentMusicInstance.mediaSource);
        safeDisconnect(monumentMusicInstance.sourceGain);
        safeDisconnect(monumentMusicInstance.analyser);
        safeDisconnect(monumentMusicInstance.toneFilter);
        safeDisconnect(monumentMusicInstance.panner);
        safeDisconnect(monumentMusicInstance.dryGain);
        safeDisconnect(monumentMusicInstance.delaySend);
        safeDisconnect(monumentMusicInstance.delay);
        safeDisconnect(monumentMusicInstance.delayFeedback);
        safeDisconnect(monumentMusicInstance.reverbSend);
        safeDisconnect(monumentMusicInstance.convolver);
        safeDisconnect(monumentMusicInstance.wetFilter);
        safeDisconnect(monumentMusicInstance.wetGain);
        monumentMusicInstance = null;
    }

    function getMonumentRhythmState() {
        if (!isRealtimeAudioReady()) {
            return decayMonumentRhythmState(0.84);
        }

        const instance = monumentMusicInstance || ensureMonumentMusicInstance();
        if (!instance?.analyser || !instance.frequencyData) {
            return decayMonumentRhythmState(0.86);
        }

        const nowMs = performance.now();
        if (nowMs - monumentRhythmState.lastSampleTimeMs < 14) {
            return createMonumentRhythmSnapshot();
        }
        monumentRhythmState.lastSampleTimeMs = nowMs;

        instance.analyser.getByteFrequencyData(instance.frequencyData);

        const bass = averageAnalyserRange(instance.frequencyData, 1, 6);
        const mid = averageAnalyserRange(instance.frequencyData, 6, 20);
        const treble = averageAnalyserRange(instance.frequencyData, 20, 56);
        const energy = clampNumber(bass * 0.54 + mid * 0.31 + treble * 0.15, 0, 1, 0);
        const bassDelta = Math.max(0, bass - monumentRhythmState.smoothedBass);
        const energyDelta = Math.max(0, energy - monumentRhythmState.smoothedEnergy);

        monumentRhythmState.smoothedBass = lerpNumber(monumentRhythmState.smoothedBass, bass, 0.16);
        monumentRhythmState.smoothedEnergy = lerpNumber(
            monumentRhythmState.smoothedEnergy,
            energy,
            0.12
        );
        monumentRhythmState.active = 1;
        monumentRhythmState.bass = bass;
        monumentRhythmState.mid = mid;
        monumentRhythmState.treble = treble;
        monumentRhythmState.energy = energy;

        const beatTarget = clampNumber(
            energy * 0.56 + bassDelta * 2.8 + energyDelta * 1.4 + Math.max(0, bass - mid) * 0.62,
            0,
            1,
            0
        );
        monumentRhythmState.pulse = Math.max(beatTarget, monumentRhythmState.pulse * 0.84);
        monumentRhythmState.beat = clampNumber(
            monumentRhythmState.pulse * 0.72 + beatTarget * 0.28,
            0,
            1,
            0
        );

        return createMonumentRhythmSnapshot();
    }

    function createMonumentRhythmSnapshot() {
        return {
            active: monumentRhythmState.active,
            bass: monumentRhythmState.bass,
            mid: monumentRhythmState.mid,
            treble: monumentRhythmState.treble,
            energy: monumentRhythmState.energy,
            beat: monumentRhythmState.beat,
            pulse: monumentRhythmState.pulse,
        };
    }

    function decayMonumentRhythmState(decay = 0.86) {
        monumentRhythmState.active = 0;
        monumentRhythmState.bass *= decay;
        monumentRhythmState.mid *= decay;
        monumentRhythmState.treble *= decay;
        monumentRhythmState.energy *= decay;
        monumentRhythmState.beat *= decay;
        monumentRhythmState.pulse *= decay;
        monumentRhythmState.smoothedBass *= decay;
        monumentRhythmState.smoothedEnergy *= decay;
        return createMonumentRhythmSnapshot();
    }

    function playVariant(variantGroupKey, options = {}) {
        const variants = VARIANT_GROUPS[variantGroupKey];
        if (!Array.isArray(variants) || variants.length === 0) {
            return false;
        }
        const soundId = variants[Math.floor(Math.random() * variants.length)];
        return playOneShot(soundId, options);
    }

    function playUiVariant(variantGroupKey, options = {}) {
        if (!isAudioOutputReady()) {
            return false;
        }

        const variants = VARIANT_GROUPS[variantGroupKey];
        if (!Array.isArray(variants) || variants.length === 0) {
            return false;
        }

        const readyVariants = variants.filter((soundId) => buffers.has(soundId));
        const candidatePool = readyVariants.length > 0 ? readyVariants : variants;
        const soundId = candidatePool[Math.floor(Math.random() * candidatePool.length)];
        if (buffers.has(soundId)) {
            return playOneShot(soundId, options);
        }

        void loadBuffer(soundId).then((loadedBuffer) => {
            if (!loadedBuffer || !isAudioOutputReady()) {
                return;
            }
            playOneShot(soundId, options);
        });
        return false;
    }

    function playOneShot(soundId, options = {}) {
        if (!isAudioOutputReady()) {
            return false;
        }

        const definition = SOUND_DEFINITIONS[soundId];
        if (!definition) {
            return false;
        }

        const buffer = buffers.get(soundId);
        if (!buffer) {
            void loadBuffer(soundId);
            return false;
        }

        const busNode = mixer.buses[definition.bus];
        if (!busNode) {
            return false;
        }

        const source = context.createBufferSource();
        source.buffer = buffer;

        const oneShotGain = context.createGain();
        const targetGain = clampNumber(options.gain, 0, 2, 1) * definition.gain;
        const now = context.currentTime;
        const startAt = now + clampNumber(options.whenOffsetSec, 0, 1, 0);

        oneShotGain.gain.setValueAtTime(0.0001, now);
        oneShotGain.gain.linearRampToValueAtTime(Math.max(0.0001, targetGain), startAt + 0.01);

        const stopAt = startAt + Math.max(0.05, buffer.duration * 1.15);
        oneShotGain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

        const rateScale = clampNumber(options.rateScale, 0.6, 1.6, 1);
        source.playbackRate.setValueAtTime(rateScale, now);
        const lowpassHz = Number(options.lowpassHz);
        const shouldUseLowpass = Number.isFinite(lowpassHz) && lowpassHz > 20;
        let oneShotFilter = null;
        if (shouldUseLowpass) {
            oneShotFilter = context.createBiquadFilter();
            oneShotFilter.type = 'lowpass';
            oneShotFilter.frequency.setValueAtTime(clampNumber(lowpassHz, 80, 22000, 22000), now);
            oneShotFilter.Q.setValueAtTime(clampNumber(options.lowpassQ, 0.0001, 12, 0.24), now);
        }

        source.connect(oneShotGain);
        if (oneShotFilter) {
            oneShotGain.connect(oneShotFilter);
            oneShotFilter.connect(busNode);
        } else {
            oneShotGain.connect(busNode);
        }

        source.onended = () => {
            safeDisconnect(source);
            safeDisconnect(oneShotGain);
            safeDisconnect(oneShotFilter);
        };

        source.start(startAt);
        safeStopSource(source, stopAt + 0.02);
        return true;
    }

    function isRealtimeAudioReady() {
        return gameplayReady && isAudioOutputReady();
    }

    function isAudioOutputReady() {
        return unlocked && Boolean(context) && Boolean(mixer) && context.state === 'running';
    }

    function isEventReady(eventKey, cooldownSec = 0) {
        const cooldownLeft = eventCooldowns.get(eventKey) || 0;
        if (cooldownLeft > 0) {
            return false;
        }
        eventCooldowns.set(eventKey, Math.max(0, cooldownSec));
        return true;
    }

    function tickEventCooldowns(dt) {
        if (eventCooldowns.size === 0) {
            return;
        }
        for (const [eventKey, value] of eventCooldowns.entries()) {
            const next = Math.max(0, value - dt);
            if (next <= 0) {
                eventCooldowns.delete(eventKey);
            } else {
                eventCooldowns.set(eventKey, next);
            }
        }
    }

    function waitForAnimationFrame() {
        return new Promise((resolve) => {
            window.requestAnimationFrame(() => {
                resolve();
            });
        });
    }
}

function formatAudioSliderPercentLabel(percentValue = 0) {
    const safePercent = Math.max(0, Math.min(100, Math.round(Number(percentValue) || 0)));
    return safePercent <= 0 ? 'OFF' : `${safePercent}%`;
}

function isAudioSliderPreviewKeyboardKey(key = '') {
    return (
        key === 'ArrowLeft' ||
        key === 'ArrowRight' ||
        key === 'ArrowUp' ||
        key === 'ArrowDown' ||
        key === 'Home' ||
        key === 'End' ||
        key === 'PageUp' ||
        key === 'PageDown'
    );
}

function createAudioUi(prefs, handlers) {
    const embeddedMount = document.getElementById('welcomeAudioSettingsMount');
    const embedded = embeddedMount instanceof Element;

    const root = document.createElement('section');
    root.className = 'audioControlPanel';
    if (embedded) {
        root.classList.add('audioControlPanel--embedded');
    }
    root.dataset.tone = 'locked';
    root.hidden = !embedded;

    const heading = document.createElement('div');
    heading.className = 'audioControlPanelHeading';
    heading.textContent = 'Audio Mixer';

    const status = document.createElement('div');
    status.className = 'audioControlPanelStatus';
    status.textContent = 'Tap/click to unlock audio';

    const controlsRow = document.createElement('div');
    controlsRow.className = 'audioControlPanelControls';

    const unlockButton = document.createElement('button');
    unlockButton.type = 'button';
    unlockButton.className = 'audioControlButton';
    unlockButton.textContent = 'ACTIVATE AUDIO';
    unlockButton.addEventListener('click', () => {
        handlers.onUnlockAudio();
    });

    const muteBtn = document.createElement('button');
    muteBtn.type = 'button';
    muteBtn.className = 'audioControlButton';
    muteBtn.textContent = prefs.muted ? 'UNMUTE ALL' : 'MUTE ALL';
    muteBtn.addEventListener('click', () => {
        handlers.onUnlockAudio();
        handlers.onToggleMute();
    });

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'audioControlButton audioControlButton--secondary';
    resetBtn.textContent = 'RESET MIX';
    resetBtn.addEventListener('click', () => {
        handlers.onUnlockAudio();
        handlers.onResetMix?.();
    });

    controlsRow.append(unlockButton, muteBtn, resetBtn);

    const slidersWrap = document.createElement('div');
    slidersWrap.className = 'audioControlPanelSliders';

    const sliderRows = new Map();

    for (let i = 0; i < MIXER_SLIDERS.length; i += 1) {
        const sliderDef = MIXER_SLIDERS[i];
        let interactionMode = 'pointer';
        const row = document.createElement('label');
        row.className = 'audioControlSliderRow';
        row.dataset.key = sliderDef.key;

        const title = document.createElement('span');
        title.className = 'audioControlSliderLabel';
        title.textContent = sliderDef.label;

        const input = document.createElement('input');
        input.className = 'audioControlSliderInput';
        input.type = 'range';
        input.min = '0';
        input.max = '100';
        input.step = '1';
        const initialPercent = Math.round((prefs[sliderDef.key] || 0) * 100);
        input.value = String(initialPercent);
        input.style.setProperty('--audio-slider-fill', `${initialPercent}%`);
        input.setAttribute('aria-label', `${sliderDef.label} volume`);
        input.addEventListener('pointerdown', () => {
            interactionMode = 'pointer';
            handlers.onPreviewStart?.(sliderDef.key, interactionMode);
        });
        input.addEventListener('input', () => {
            const normalized = clampNumber(Number(input.value) / 100, 0, 1, 1);
            handlers.onVolumeChanged(sliderDef.key, normalized);
            handlers.onPreviewChange?.(sliderDef.key, interactionMode);
        });
        input.addEventListener('pointerup', () => {
            interactionMode = 'pointer';
            handlers.onPreviewEnd?.(sliderDef.key);
        });
        input.addEventListener('pointercancel', () => {
            handlers.onPreviewEnd?.(sliderDef.key);
        });
        input.addEventListener('change', () => {
            handlers.onPreviewEnd?.(sliderDef.key);
        });
        input.addEventListener('blur', () => {
            handlers.onPreviewEnd?.(sliderDef.key);
        });
        input.addEventListener('keydown', (event) => {
            if (!isAudioSliderPreviewKeyboardKey(event.key)) {
                return;
            }
            interactionMode = 'keyboard';
            handlers.onPreviewStart?.(sliderDef.key, interactionMode);
        });
        input.addEventListener('keyup', (event) => {
            if (!isAudioSliderPreviewKeyboardKey(event.key)) {
                return;
            }
            handlers.onPreviewEnd?.(sliderDef.key);
        });

        const value = document.createElement('span');
        value.className = 'audioControlSliderValue';
        value.textContent = formatAudioSliderPercentLabel(initialPercent);

        row.append(title, input, value);
        slidersWrap.append(row);

        sliderRows.set(sliderDef.key, {
            row,
            input,
            value,
        });
    }

    root.append(heading, status, controlsRow, slidersWrap);
    if (embedded && embeddedMount instanceof Element) {
        embeddedMount.append(root);
    } else {
        document.body.append(root);
    }

    return {
        root,
        embedded,
        status,
        muteBtn,
        unlockButton,
        resetBtn,
        controlsRow,
        sliderRows,
    };
}

function readAudioPrefsState(fallbackPrefs = DEFAULT_AUDIO_PREFS) {
    const safeDefaults = {
        ...sanitizeAudioPrefs(fallbackPrefs, DEFAULT_AUDIO_PREFS),
    };

    try {
        const raw = window.localStorage.getItem(AUDIO_PREFS_STORAGE_KEY);
        if (!raw) {
            return {
                hasStoredPrefs: false,
                prefs: safeDefaults,
            };
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return {
                hasStoredPrefs: false,
                prefs: safeDefaults,
            };
        }

        return {
            hasStoredPrefs: true,
            prefs: sanitizeAudioPrefs(parsed, safeDefaults),
        };
    } catch {
        return {
            hasStoredPrefs: false,
            prefs: safeDefaults,
        };
    }
}

function persistAudioPrefs(prefs, fallbackPrefs = DEFAULT_AUDIO_PREFS) {
    const safePayload = sanitizeAudioPrefs(prefs, fallbackPrefs);

    try {
        window.localStorage.setItem(AUDIO_PREFS_STORAGE_KEY, JSON.stringify(safePayload));
    } catch {
        // localStorage can fail in restricted browsing contexts.
    }
}

function sanitizeAudioPrefs(prefs, fallbackPrefs = DEFAULT_AUDIO_PREFS) {
    const safeFallback =
        fallbackPrefs && typeof fallbackPrefs === 'object' ? fallbackPrefs : DEFAULT_AUDIO_PREFS;
    const legacyFallbackMusicVolume = clampNumber(
        safeFallback?.musicVolume,
        0,
        1,
        DEFAULT_AUDIO_PREFS.gameMusicVolume
    );
    const resolvedFallbacks = {
        ...DEFAULT_AUDIO_PREFS,
        ...safeFallback,
        menuMusicVolume: clampNumber(
            safeFallback?.menuMusicVolume,
            0,
            1,
            legacyFallbackMusicVolume
        ),
        gameMusicVolume: clampNumber(
            safeFallback?.gameMusicVolume,
            0,
            1,
            legacyFallbackMusicVolume
        ),
    };
    const source = prefs && typeof prefs === 'object' ? prefs : null;
    const legacySourceMusicVolume =
        source && Object.prototype.hasOwnProperty.call(source, 'musicVolume')
            ? source.musicVolume
            : undefined;
    const resolved = {
        muted: Boolean(source && 'muted' in source ? source.muted : resolvedFallbacks.muted),
    };

    for (let index = 0; index < MIXER_SLIDERS.length; index += 1) {
        const key = MIXER_SLIDERS[index].key;
        const rawValue =
            source &&
            (Object.prototype.hasOwnProperty.call(source, key) ||
                ((key === 'menuMusicVolume' || key === 'gameMusicVolume') &&
                    legacySourceMusicVolume !== undefined))
                ? Object.prototype.hasOwnProperty.call(source, key)
                    ? source[key]
                    : legacySourceMusicVolume
                : resolvedFallbacks[key];
        resolved[key] = clampNumber(
            rawValue,
            0,
            1,
            clampNumber(resolvedFallbacks[key], 0, 1, DEFAULT_AUDIO_PREFS[key])
        );
    }

    return resolved;
}

function serializeAudioPrefs(prefs) {
    return JSON.stringify(sanitizeAudioPrefs(prefs, DEFAULT_AUDIO_PREFS));
}

function resolveCameraPlanarForward(camera) {
    const matrix = camera?.matrixWorld?.elements;
    let forwardX = 0;
    let forwardZ = -1;
    if (Array.isArray(matrix) || ArrayBuffer.isView(matrix)) {
        if (matrix.length >= 16) {
            forwardX = -(Number(matrix[8]) || 0);
            forwardZ = -(Number(matrix[10]) || -1);
        }
    }
    const length = Math.hypot(forwardX, forwardZ);
    if (length <= 0.0001) {
        return {
            forwardX: 0,
            forwardZ: -1,
        };
    }
    return {
        forwardX: forwardX / length,
        forwardZ: forwardZ / length,
    };
}

function updateAudioListenerFromCamera(context, camera) {
    if (!context || !camera || !camera.position) {
        return;
    }

    const listener = context.listener;
    const now = context.currentTime;
    const px = Number(camera.position.x) || 0;
    const py = Number(camera.position.y) || 0;
    const pz = Number(camera.position.z) || 0;

    setAudioParamValue(listener.positionX, px, now);
    setAudioParamValue(listener.positionY, py, now);
    setAudioParamValue(listener.positionZ, pz, now);

    const matrix = camera.matrixWorld?.elements;
    let forwardX = 0;
    let forwardY = 0;
    let forwardZ = -1;
    let upX = 0;
    let upY = 1;
    let upZ = 0;
    if (Array.isArray(matrix) || ArrayBuffer.isView(matrix)) {
        if (matrix.length >= 16) {
            forwardX = -(Number(matrix[8]) || 0);
            forwardY = -(Number(matrix[9]) || 0);
            forwardZ = -(Number(matrix[10]) || -1);
            upX = Number(matrix[4]) || 0;
            upY = Number(matrix[5]) || 1;
            upZ = Number(matrix[6]) || 0;
        }
    }

    if (
        listener.forwardX &&
        listener.forwardY &&
        listener.forwardZ &&
        listener.upX &&
        listener.upY &&
        listener.upZ
    ) {
        setAudioParamValue(listener.forwardX, forwardX, now);
        setAudioParamValue(listener.forwardY, forwardY, now);
        setAudioParamValue(listener.forwardZ, forwardZ, now);
        setAudioParamValue(listener.upX, upX, now);
        setAudioParamValue(listener.upY, upY, now);
        setAudioParamValue(listener.upZ, upZ, now);
        return;
    }

    if (typeof listener.setOrientation === 'function') {
        listener.setOrientation(forwardX, forwardY, forwardZ, upX, upY, upZ);
    }
}

function createNoopAudioSystem() {
    const getOfflineMixerSnapshot = () => ({
        available: false,
        unlocked: false,
        gameplayReady: false,
        muted: false,
        statusTone: 'offline',
        statusLabel: 'Offline',
        statusText: 'Audio unavailable in this browser',
        sliders: MIXER_SLIDERS.map((slider) => ({
            key: slider.key,
            label: slider.label,
            value: DEFAULT_AUDIO_PREFS[slider.key],
        })),
    });

    return {
        initialize() {},
        dispose() {},
        update() {},
        unlock() {
            return Promise.resolve(false);
        },
        getMixerSnapshot: getOfflineMixerSnapshot,
        getMixerPrefsSnapshot() {
            return sanitizeAudioPrefs(DEFAULT_AUDIO_PREFS, DEFAULT_AUDIO_PREFS);
        },
        setMixerVolume() {
            return getOfflineMixerSnapshot();
        },
        applyMixerPrefs() {
            return getOfflineMixerSnapshot();
        },
        toggleMute() {
            return getOfflineMixerSnapshot();
        },
        resetMixerToDefaults() {
            return getOfflineMixerSnapshot();
        },
        prepareForGameplay() {
            return Promise.resolve(false);
        },
        getPreloadState() {
            return {
                filesTotal: 0,
                filesReady: 0,
                filesFailed: 0,
                filesDone: 0,
                progress: 1,
                complete: true,
            };
        },
        isGameplayReady() {
            return false;
        },
        isUnlocked() {
            return false;
        },
        getMonumentRhythmState() {
            return {
                active: 0,
                bass: 0,
                mid: 0,
                treble: 0,
                energy: 0,
                beat: 0,
                pulse: 0,
            };
        },
        onVehicleCollisionContacts() {},
        onObstacleCrash() {},
        onPickupCollected() {},
        onStealthPickupCollected() {},
        onMineDeployed() {},
        onMineDetonated() {},
        onPlayerExplosion() {},
        onRoundFinished() {},
        onPlayerRespawn() {},
        onBatteryDepleted() {},
        onBatteryRestored() {},
        onPauseChanged() {},
        onWelcomeVisibilityChanged() {},
        onWorldMapVisibilityChanged() {},
        onRaceIntroStep() {},
        onRaceIntroGo() {},
        onVehicleCombatModeSwitch() {},
        onVehicleWeaponPickup() {},
        onVehicleWeaponShot() {},
        onVehicleWeaponImpact() {},
        playUiClick() {
            return null;
        },
        playUiConfirm() {
            return null;
        },
    };
}

function bellCurve(value, center, width) {
    const safeWidth = Math.max(0.0001, Math.abs(width));
    const distance = Math.abs(value - center);
    if (distance >= safeWidth) {
        return 0;
    }
    const normalized = distance / safeWidth;
    return 1 - normalized * normalized * (3 - 2 * normalized);
}

function clampNumber(value, min, max, fallback = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
}

function isFiniteVector3Like(value) {
    return Boolean(
        value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)
    );
}

function randomRange(min, max) {
    const a = Number(min);
    const b = Number(max);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return 1;
    }
    if (a === b) {
        return a;
    }
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    return low + Math.random() * (high - low);
}

function averageAnalyserRange(data, startBin, endBinExclusive) {
    if (!data || data.length === 0) {
        return 0;
    }

    const start = Math.max(0, Math.min(data.length - 1, Math.floor(startBin)));
    const end = Math.max(start + 1, Math.min(data.length, Math.floor(endBinExclusive)));
    let total = 0;
    for (let i = start; i < end; i += 1) {
        total += (Number(data[i]) || 0) / 255;
    }
    return total / Math.max(1, end - start);
}

function lerpNumber(start, end, alpha) {
    const safeAlpha = clampNumber(alpha, 0, 1, 0);
    return start + (end - start) * safeAlpha;
}

function smoothstep(value) {
    const t = clampNumber(value, 0, 1, 0);
    return t * t * (3 - 2 * t);
}

function once(callback) {
    let called = false;
    return () => {
        if (called) {
            return;
        }
        called = true;
        callback?.();
    };
}

function createShortNoiseBuffer(audioContext, durationSec = 0.18) {
    if (!audioContext?.createBuffer) {
        return null;
    }
    const safeDuration = clampNumber(durationSec, 0.04, 0.5, 0.18);
    const sampleRate = Math.max(22050, Math.round(audioContext.sampleRate || 44100));
    const sampleCount = Math.max(1, Math.floor(sampleRate * safeDuration));
    const buffer = audioContext.createBuffer(1, sampleCount, sampleRate);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i += 1) {
        const t = i / Math.max(1, sampleCount - 1);
        const envelope = Math.pow(1 - t, 2.4);
        channelData[i] = (Math.random() * 2 - 1) * envelope * 0.7;
    }
    return buffer;
}

function createUrbanPlazaImpulseBuffer(audioContext, durationSec = 2.6, decay = 2.4) {
    const safeDuration = clampNumber(durationSec, 0.4, 5, 2.6);
    const safeDecay = clampNumber(decay, 0.5, 6, 2.4);
    const sampleRate = Math.max(22050, Math.round(audioContext?.sampleRate || 44100));
    const sampleCount = Math.max(1, Math.floor(sampleRate * safeDuration));
    const impulse = audioContext.createBuffer(2, sampleCount, sampleRate);
    const tapTimes = [0.034, 0.061, 0.094, 0.148, 0.212, 0.286, 0.412, 0.608, 0.91, 1.36];

    for (let channelIndex = 0; channelIndex < impulse.numberOfChannels; channelIndex += 1) {
        const channelData = impulse.getChannelData(channelIndex);
        for (let i = 0; i < sampleCount; i += 1) {
            const decayT = 1 - i / sampleCount;
            channelData[i] = (Math.random() * 2 - 1) * Math.pow(decayT, safeDecay) * 0.16;
        }

        for (let tapIndex = 0; tapIndex < tapTimes.length; tapIndex += 1) {
            const tapSample = Math.floor(tapTimes[tapIndex] * sampleRate);
            if (tapSample >= sampleCount) {
                break;
            }
            const tapStrength =
                (1 - tapIndex / tapTimes.length) * (channelIndex === 0 ? 0.34 : 0.28);
            channelData[tapSample] += tapStrength;
            if (tapSample + 1 < sampleCount) {
                channelData[tapSample + 1] += tapStrength * 0.52;
            }
            if (tapSample + 2 < sampleCount) {
                channelData[tapSample + 2] += tapStrength * 0.24;
            }
        }
    }

    return impulse;
}

function createGalleryHallImpulseBuffer(audioContext, durationSec = 1.9, decay = 2.1) {
    const safeDuration = clampNumber(durationSec, 0.35, 4.2, 1.9);
    const safeDecay = clampNumber(decay, 0.5, 5.2, 2.1);
    const sampleRate = Math.max(22050, Math.round(audioContext?.sampleRate || 44100));
    const sampleCount = Math.max(1, Math.floor(sampleRate * safeDuration));
    const impulse = audioContext.createBuffer(2, sampleCount, sampleRate);
    const tapTimes = [0.018, 0.037, 0.061, 0.094, 0.138, 0.196, 0.274, 0.386, 0.542, 0.761, 1.04];

    for (let channelIndex = 0; channelIndex < impulse.numberOfChannels; channelIndex += 1) {
        const channelData = impulse.getChannelData(channelIndex);
        for (let i = 0; i < sampleCount; i += 1) {
            const decayT = 1 - i / sampleCount;
            channelData[i] = (Math.random() * 2 - 1) * Math.pow(decayT, safeDecay) * 0.12;
        }

        for (let tapIndex = 0; tapIndex < tapTimes.length; tapIndex += 1) {
            const tapSample = Math.floor(tapTimes[tapIndex] * sampleRate);
            if (tapSample >= sampleCount) {
                break;
            }
            const tapStrength =
                (1 - tapIndex / tapTimes.length) * (channelIndex === 0 ? 0.22 : 0.18);
            channelData[tapSample] += tapStrength;
            if (tapSample + 1 < sampleCount) {
                channelData[tapSample + 1] += tapStrength * 0.58;
            }
            if (tapSample + 2 < sampleCount) {
                channelData[tapSample + 2] += tapStrength * 0.28;
            }
        }
    }

    return impulse;
}

function setAudioParamValue(param, value, when) {
    if (!param) {
        return;
    }
    if (typeof param.setValueAtTime === 'function') {
        param.setValueAtTime(value, when);
        return;
    }
    if ('value' in param) {
        param.value = value;
    }
}

function setPannerPosition(panner, x, y, z, when) {
    if (!panner) {
        return;
    }
    if (panner.positionX && panner.positionY && panner.positionZ) {
        setAudioParamValue(panner.positionX, x, when);
        setAudioParamValue(panner.positionY, y, when);
        setAudioParamValue(panner.positionZ, z, when);
        return;
    }
    if (typeof panner.setPosition === 'function') {
        panner.setPosition(x, y, z);
    }
}

function safeStopSource(source, when = null) {
    if (!source || typeof source.stop !== 'function') {
        return;
    }
    try {
        if (Number.isFinite(when)) {
            source.stop(when);
        } else {
            source.stop();
        }
    } catch {
        // Source might already be stopped.
    }
}

function safeDisconnect(node) {
    if (!node || typeof node.disconnect !== 'function') {
        return;
    }
    try {
        node.disconnect();
    } catch {
        // Node may already be disconnected.
    }
}
