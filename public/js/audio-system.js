import { centralParkingLot } from './environment/layout.js';

const AUDIO_PREFS_STORAGE_KEY = 'silentdrift-audio-prefs-v1';
const MONUMENT_MUSIC_SOUND_ID = 'monumentHookusPookusInstrumentalLoop01';

const DEFAULT_AUDIO_PREFS = Object.freeze({
    masterVolume: 0.84,
    vehiclesVolume: 1,
    effectsVolume: 1,
    ambienceVolume: 0.72,
    uiVolume: 0.9,
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
    },
    raceCrowdFarLoop01: {
        src: '/audio/ambience/race_crowd_far_loop_01.mp3',
        bus: 'ambience',
        gain: 0.32,
        loop: true,
    },
    monumentHookusPookusInstrumentalLoop01: {
        src: '/audio/ambience/monument_hookus_pookus_instrumental_loop_01.mp3',
        bus: 'ambience',
        gain: 0.76,
        loop: true,
    },
});
const SOUND_DEFINITION_IDS = Object.freeze(Object.keys(SOUND_DEFINITIONS));
const LOOP_SOUND_IDS = Object.freeze(
    SOUND_DEFINITION_IDS.filter(
        (soundId) =>
            Boolean(SOUND_DEFINITIONS[soundId]?.loop) && soundId !== MONUMENT_MUSIC_SOUND_ID
    )
);
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

const LOOP_RATE_DEFAULT = 1;

const MIXER_SLIDERS = Object.freeze([
    {
        key: 'masterVolume',
        label: 'Master',
    },
    {
        key: 'vehiclesVolume',
        label: 'Vehicles',
    },
    {
        key: 'effectsVolume',
        label: 'Effects',
    },
    {
        key: 'ambienceVolume',
        label: 'Ambience',
    },
    {
        key: 'uiVolume',
        label: 'UI',
    },
]);

const EVENT_COOLDOWNS = Object.freeze({
    collision: 0.12,
    obstacleCrash: 0.2,
    mineDetonation: 0.1,
    pickupCollect: 0.05,
    chargingStart: 0.18,
    chargingStop: 0.18,
});
const AUDIO_FETCH_CACHE_MODES = Object.freeze(['default', 'reload']);
const WELCOME_MENU_AMBIENCE_GAIN = 0;
const WELCOME_MENU_CROWD_GAIN = 0;
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

export function createAudioSystem({ camera = null } = {}) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
        return createNoopAudioSystem();
    }

    const prefs = readAudioPrefs();
    const buffers = new Map();
    const failedBuffers = new Set();
    const loopInstances = new Map();
    const pendingLoads = new Map();
    const eventCooldowns = new Map();
    const unlockListeners = [];
    const preloadProgressSubscribers = new Set();

    let context = null;
    let mixer = null;
    let ui = null;
    let unlocked = false;
    let preloadEnabled = false;
    let preloadPromise = null;
    let gameplayReady = false;
    let disposed = false;
    let monumentMusicInstance = null;
    let monumentImpulseBuffer = null;
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
    };

    return {
        initialize,
        dispose,
        update,
        unlock: unlockAudio,
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
    };

    function initialize(options = {}) {
        if (disposed) {
            return;
        }
        const preloadOnInitialize = Boolean(options?.preloadOnInitialize);
        preloadEnabled = preloadEnabled || preloadOnInitialize;
        ensureAudioContext();
        if (preloadEnabled) {
            startPreload();
        }
        ui = createAudioUi(prefs, {
            onToggleMute() {
                prefs.muted = !prefs.muted;
                persistAudioPrefs(prefs);
                applyBusVolumes();
                refreshUi();
                playVariant('uiClickSoft', { gain: 0.55 });
            },
            onVolumeChanged(key, normalizedValue) {
                prefs[key] = clampNumber(normalizedValue, 0, 1, DEFAULT_AUDIO_PREFS[key]);
                persistAudioPrefs(prefs);
                applyBusVolumes();
                refreshUi();
            },
            onUnlockAudio() {
                void unlockAudio();
            },
        });
        installUnlockListeners();
        refreshUi();
    }

    function dispose() {
        if (disposed) {
            return;
        }
        disposed = true;
        gameplayReady = false;
        removeUnlockListeners();
        if (ui?.root?.parentElement) {
            ui.root.parentElement.removeChild(ui.root);
        }
        ui = null;

        for (const instance of loopInstances.values()) {
            safeStopSource(instance.source);
            safeDisconnect(instance.source);
            safeDisconnect(instance.gain);
        }
        loopInstances.clear();
        disposeMonumentMusicInstance();

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
        const effectsGain = context.createGain();
        const ambienceGain = context.createGain();
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

        vehiclesGain.connect(masterGain);
        effectsGain.connect(masterGain);
        ambienceGain.connect(masterGain);
        uiGain.connect(masterGain);
        masterGain.connect(glueCompressor);
        glueCompressor.connect(limiter);
        limiter.connect(context.destination);

        mixer = {
            masterGain,
            buses: {
                vehicles: vehiclesGain,
                effects: effectsGain,
                ambience: ambienceGain,
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
            if (buffers.has(soundId)) {
                filesReady += 1;
            } else if (failedBuffers.has(soundId)) {
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
            await loadBuffer(ids[i]);
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

    function applyBusVolumes() {
        if (!mixer || !context) {
            return;
        }

        const now = context.currentTime;
        const masterTarget = prefs.muted ? 0 : prefs.masterVolume;
        mixer.masterGain.gain.setTargetAtTime(masterTarget, now, 0.03);
        mixer.buses.vehicles.gain.setTargetAtTime(prefs.vehiclesVolume, now, 0.03);
        mixer.buses.effects.gain.setTargetAtTime(prefs.effectsVolume, now, 0.03);
        mixer.buses.ambience.gain.setTargetAtTime(prefs.ambienceVolume, now, 0.03);
        mixer.buses.ui.gain.setTargetAtTime(prefs.uiVolume, now, 0.03);
    }

    function refreshUi() {
        if (!ui) {
            return;
        }

        const preloadState = getPreloadState();
        const filesTotal = preloadState.filesTotal;
        const filesReady = preloadState.filesReady;
        const filesFailed = preloadState.filesFailed;
        const canUseAudio = Boolean(context);
        const statusTone = !canUseAudio
            ? 'offline'
            : unlocked
              ? 'ready'
              : context?.state === 'suspended'
                ? 'locked'
                : 'offline';

        ui.root.dataset.tone = statusTone;
        ui.muteBtn.textContent = prefs.muted ? 'UNMUTE' : 'MUTE';
        if (!canUseAudio) {
            ui.status.textContent = 'Audio unavailable in this browser';
        } else if (!unlocked) {
            ui.status.textContent = 'Tap/click to unlock audio';
        } else if (preloadPromise && !preloadState.complete) {
            ui.status.textContent = `Preparing gameplay audio (${filesReady}/${filesTotal})`;
        } else if (gameplayReady) {
            ui.status.textContent = `Audio ready (${filesReady}/${filesTotal})`;
        } else {
            ui.status.textContent = `Audio primed (${filesReady}/${filesTotal})`;
        }
        if (filesFailed > 0) {
            ui.status.textContent += ` | Missing/invalid: ${filesFailed}`;
        }

        for (let i = 0; i < MIXER_SLIDERS.length; i += 1) {
            const slider = MIXER_SLIDERS[i];
            const row = ui.sliderRows.get(slider.key);
            if (!row) {
                continue;
            }
            const value = clampNumber(prefs[slider.key], 0, 1, DEFAULT_AUDIO_PREFS[slider.key]);
            row.input.value = String(Math.round(value * 100));
            row.value.textContent = `${Math.round(value * 100)}%`;
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

    function update(deltaTime = 1 / 60, frameState = {}) {
        if (disposed) {
            return;
        }

        const editModeActive = Boolean(frameState.editModeActive);
        if (ui?.root) {
            ui.root.hidden = !editModeActive;
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
        const welcomeVisible = Boolean(frameState.welcomeVisible);
        const isCarDestroyed = Boolean(frameState.isCarDestroyed);
        const pickupRoundFinished = Boolean(
            frameState.pickupRoundFinished ?? frameState.roundFinished
        );
        const batteryDepleted = Boolean(frameState.isBatteryDepleted);
        const isChargingActive = Boolean(frameState.isChargingActive);
        const chargingLevel = clampNumber(frameState.chargingLevel, 0, 1, 0);

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

        const ambienceBase = welcomeVisible ? WELCOME_MENU_AMBIENCE_GAIN : 0.38;
        const ambienceGameplayBoost = driveAudioEnabled ? 0.2 : 0;
        const crowdGain = welcomeVisible ? WELCOME_MENU_CROWD_GAIN : driveAudioEnabled ? 0.2 : 0.1;

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

        updateLoopLayer('cityAmbienceDayLoop01', ambienceBase + ambienceGameplayBoost, 1);
        updateLoopLayer('raceCrowdFarLoop01', crowdGain, 0.96 + speedNorm * 0.06);

        // Reserved loop: prepared for future per-mine beeper routing.
        updateLoopLayer('mineBeepLoop01', 0, 1);

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

        updateAudioListenerFromCamera(context, camera);
        updateMonumentMusic({
            isPaused,
            welcomeVisible,
            editModeActive,
            pickupRoundFinished,
        });
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

    function onMineDetonated({ localHit = false, distanceMeters = 0 } = {}) {
        if (!isRealtimeAudioReady()) {
            return;
        }
        if (!isEventReady('mineDetonation', EVENT_COOLDOWNS.mineDetonation)) {
            return;
        }

        const isNear = localHit || distanceMeters <= 18;
        const normalizedDistance = clampNumber(distanceMeters, 0, 120, 18);
        const distanceFade = 1 - clampNumber(normalizedDistance / 120, 0, 1, 0);
        playOneShot(isNear ? 'mineDetonateNear01' : 'mineDetonateFar01', {
            gain: isNear ? 0.96 : clampNumber(0.35 + distanceFade * 0.55, 0.24, 0.78, 0.42),
            rateScale: randomRange(0.97, 1.04),
        });
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
        instance.source.playbackRate.setTargetAtTime(safeRate, context.currentTime, 0.08);
    }

    function ensureLoopInstance(soundId) {
        if (!isRealtimeAudioReady()) {
            return null;
        }

        if (loopInstances.has(soundId)) {
            return loopInstances.get(soundId);
        }

        const definition = SOUND_DEFINITIONS[soundId];
        if (!definition || !definition.loop) {
            return null;
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
        const activeMix = shouldBeAudible ? 1 : 0;
        const definitionGain = SOUND_DEFINITIONS[MONUMENT_MUSIC_SOUND_ID]?.gain || 1;

        instance.sourceGain.gain.setTargetAtTime(
            activeMix *
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
                lerpNumber(
                    MONUMENT_AUDIO_CONFIG.farWetGain,
                    MONUMENT_AUDIO_CONFIG.nearWetGain,
                    nearMix
                ),
            now,
            0.28
        );
        instance.delaySend.gain.setTargetAtTime(
            activeMix *
                lerpNumber(
                    MONUMENT_AUDIO_CONFIG.delaySendFar,
                    MONUMENT_AUDIO_CONFIG.delaySendNear,
                    nearMix
                ) *
                (0.64 + wideAreaMix * 0.36),
            now,
            0.26
        );
        instance.reverbSend.gain.setTargetAtTime(
            activeMix *
                lerpNumber(
                    MONUMENT_AUDIO_CONFIG.reverbSendFar,
                    MONUMENT_AUDIO_CONFIG.reverbSendNear,
                    nearMix
                ) *
                (0.72 + wideAreaMix * 0.28),
            now,
            0.3
        );
        instance.toneFilter.frequency.setTargetAtTime(
            lerpNumber(
                MONUMENT_AUDIO_CONFIG.farCutoffHz,
                MONUMENT_AUDIO_CONFIG.nearCutoffHz,
                nearMix
            ),
            now,
            0.24
        );
        instance.toneFilter.Q.setTargetAtTime(lerpNumber(0.24, 0.7, nearMix), now, 0.28);
        instance.wetFilter.frequency.setTargetAtTime(
            lerpNumber(
                MONUMENT_AUDIO_CONFIG.farWetLowpassHz,
                MONUMENT_AUDIO_CONFIG.nearWetLowpassHz,
                nearMix
            ),
            now,
            0.3
        );
        instance.delay.delayTime.setTargetAtTime(
            lerpNumber(
                MONUMENT_AUDIO_CONFIG.farDelaySec,
                MONUMENT_AUDIO_CONFIG.nearDelaySec,
                nearMix
            ),
            now,
            0.22
        );
        instance.delayFeedback.gain.setTargetAtTime(
            lerpNumber(
                MONUMENT_AUDIO_CONFIG.farFeedback,
                MONUMENT_AUDIO_CONFIG.nearFeedback,
                nearMix
            ),
            now,
            0.28
        );
    }

    function ensureMonumentMusicInstance() {
        if (!isRealtimeAudioReady() || !context || !mixer) {
            return null;
        }
        if (monumentMusicInstance) {
            return monumentMusicInstance;
        }

        const definition = SOUND_DEFINITIONS[MONUMENT_MUSIC_SOUND_ID];
        const buffer = buffers.get(MONUMENT_MUSIC_SOUND_ID);
        if (!definition || !buffer) {
            void loadBuffer(MONUMENT_MUSIC_SOUND_ID);
            return null;
        }

        const busNode = mixer.buses[definition.bus];
        if (!busNode) {
            return null;
        }

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

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

        source.connect(sourceGain);
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

        source.start();

        monumentMusicInstance = {
            source,
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
        };

        return monumentMusicInstance;
    }

    function disposeMonumentMusicInstance() {
        if (!monumentMusicInstance) {
            return;
        }
        safeStopSource(monumentMusicInstance.source);
        safeDisconnect(monumentMusicInstance.source);
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

    function playOneShot(soundId, options = {}) {
        if (!isRealtimeAudioReady()) {
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

        source.connect(oneShotGain);
        oneShotGain.connect(busNode);

        source.onended = () => {
            safeDisconnect(source);
            safeDisconnect(oneShotGain);
        };

        source.start(startAt);
        safeStopSource(source, stopAt + 0.02);
        return true;
    }

    function isRealtimeAudioReady() {
        return (
            gameplayReady &&
            unlocked &&
            Boolean(context) &&
            Boolean(mixer) &&
            context.state === 'running'
        );
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

function createAudioUi(prefs, handlers) {
    const root = document.createElement('section');
    root.className = 'audioControlPanel';
    root.dataset.tone = 'locked';
    root.hidden = true;

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
    unlockButton.textContent = 'UNLOCK';
    unlockButton.addEventListener('click', () => {
        handlers.onUnlockAudio();
    });

    const muteBtn = document.createElement('button');
    muteBtn.type = 'button';
    muteBtn.className = 'audioControlButton';
    muteBtn.textContent = prefs.muted ? 'UNMUTE' : 'MUTE';
    muteBtn.addEventListener('click', () => {
        handlers.onUnlockAudio();
        handlers.onToggleMute();
    });

    controlsRow.append(unlockButton, muteBtn);

    const slidersWrap = document.createElement('div');
    slidersWrap.className = 'audioControlPanelSliders';

    const sliderRows = new Map();

    for (let i = 0; i < MIXER_SLIDERS.length; i += 1) {
        const sliderDef = MIXER_SLIDERS[i];
        const row = document.createElement('label');
        row.className = 'audioControlSliderRow';

        const title = document.createElement('span');
        title.className = 'audioControlSliderLabel';
        title.textContent = sliderDef.label;

        const input = document.createElement('input');
        input.className = 'audioControlSliderInput';
        input.type = 'range';
        input.min = '0';
        input.max = '100';
        input.step = '1';
        input.value = String(Math.round((prefs[sliderDef.key] || 0) * 100));
        input.addEventListener('input', () => {
            const normalized = clampNumber(Number(input.value) / 100, 0, 1, 1);
            handlers.onVolumeChanged(sliderDef.key, normalized);
            handlers.onUnlockAudio();
        });

        const value = document.createElement('span');
        value.className = 'audioControlSliderValue';
        value.textContent = `${Math.round((prefs[sliderDef.key] || 0) * 100)}%`;

        row.append(title, input, value);
        slidersWrap.append(row);

        sliderRows.set(sliderDef.key, {
            row,
            input,
            value,
        });
    }

    root.append(heading, status, controlsRow, slidersWrap);
    document.body.append(root);

    return {
        root,
        status,
        muteBtn,
        unlockButton,
        sliderRows,
    };
}

function readAudioPrefs() {
    const safeDefaults = {
        ...DEFAULT_AUDIO_PREFS,
    };

    try {
        const raw = window.localStorage.getItem(AUDIO_PREFS_STORAGE_KEY);
        if (!raw) {
            return safeDefaults;
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return safeDefaults;
        }

        const resolved = {
            ...safeDefaults,
        };
        for (let i = 0; i < MIXER_SLIDERS.length; i += 1) {
            const key = MIXER_SLIDERS[i].key;
            resolved[key] = clampNumber(parsed[key], 0, 1, safeDefaults[key]);
        }
        resolved.muted = Boolean(parsed.muted);
        return resolved;
    } catch {
        return safeDefaults;
    }
}

function persistAudioPrefs(prefs) {
    const safePayload = {
        muted: Boolean(prefs.muted),
    };
    for (let i = 0; i < MIXER_SLIDERS.length; i += 1) {
        const key = MIXER_SLIDERS[i].key;
        safePayload[key] = clampNumber(prefs[key], 0, 1, DEFAULT_AUDIO_PREFS[key]);
    }

    try {
        window.localStorage.setItem(AUDIO_PREFS_STORAGE_KEY, JSON.stringify(safePayload));
    } catch {
        // localStorage can fail in restricted browsing contexts.
    }
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
    return {
        initialize() {},
        dispose() {},
        update() {},
        unlock() {
            return Promise.resolve(false);
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
