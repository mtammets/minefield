export const INPUT_CONTEXTS = Object.freeze({
    gameplay: 'gameplay',
    paused: 'paused',
    welcomeModal: 'welcome_modal',
    editMode: 'edit_mode',
    raceIntroLocked: 'race_intro_locked',
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
} = {}) {
    if (welcomeVisible) {
        return INPUT_CONTEXTS.welcomeModal;
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
    return INPUT_CONTEXTS.gameplay;
}

export function resolveWorldMapDriveLockMode({ gameMode = 'bots', inOnlineRoom = false } = {}) {
    void gameMode;
    void inOnlineRoom;
    return WORLD_MAP_DRIVE_LOCK_MODES.none;
}
