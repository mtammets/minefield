export const INPUT_CONTEXTS = Object.freeze({
    gameplay: 'gameplay',
    fullMap: 'full_map',
    paused: 'paused',
    welcomeModal: 'welcome_modal',
    editMode: 'edit_mode',
    raceIntroLocked: 'race_intro_locked',
    replayPlayback: 'replay_playback',
});

export const WORLD_MAP_DRIVE_LOCK_MODES = Object.freeze({
    none: 'none',
    pause: 'pause',
    autobrake: 'autobrake',
});

export function resolveGameplayInputContext({
    welcomeVisible = false,
    mapOpen = false,
    paused = false,
    editModeActive = false,
    raceIntroDriveLocked = false,
    replayPlaybackActive = false,
} = {}) {
    if (welcomeVisible) {
        return INPUT_CONTEXTS.welcomeModal;
    }
    if (mapOpen) {
        return INPUT_CONTEXTS.fullMap;
    }
    if (paused) {
        return INPUT_CONTEXTS.paused;
    }
    if (editModeActive) {
        return INPUT_CONTEXTS.editMode;
    }
    if (raceIntroDriveLocked) {
        return INPUT_CONTEXTS.raceIntroLocked;
    }
    if (replayPlaybackActive) {
        return INPUT_CONTEXTS.replayPlayback;
    }
    return INPUT_CONTEXTS.gameplay;
}

export function resolveWorldMapDriveLockMode({ gameMode = 'bots', inOnlineRoom = false } = {}) {
    const mode = gameMode === 'online' ? 'online' : 'bots';
    if (mode === 'online' && inOnlineRoom) {
        return WORLD_MAP_DRIVE_LOCK_MODES.autobrake;
    }
    return WORLD_MAP_DRIVE_LOCK_MODES.pause;
}
