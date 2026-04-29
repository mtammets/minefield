export const ACTION_IDS = Object.freeze({
    driveForward: 'drive_forward',
    driveBackward: 'drive_backward',
    driveLeft: 'drive_left',
    driveRight: 'drive_right',
    handbrake: 'handbrake',
    pauseToggle: 'pause_toggle',
    mapToggle: 'map_toggle',
    fullscreenToggle: 'fullscreen_toggle',
    restartRound: 'restart_round',
    restartFromScoreboard: 'restart_from_scoreboard',
    mineDrop: 'mine_drop',
    mineThrow: 'mine_throw',
    roofMenuNext: 'roof_menu_next',
    roofMenuPrevious: 'roof_menu_previous',
    roofModeDashboard: 'roof_mode_dashboard',
    roofModeBattery: 'roof_mode_battery',
    roofModeNavigation: 'roof_mode_navigation',
    roofModeChassis: 'roof_mode_chassis',
    graphicsCycle: 'graphics_cycle',
    cameraView1: 'camera_view_1',
    cameraView2: 'camera_view_2',
    cameraView3: 'camera_view_3',
    cameraView4: 'camera_view_4',
    cameraView5: 'camera_view_5',
    cameraView6: 'camera_view_6',
    cameraView7: 'camera_view_7',
    cameraView8: 'camera_view_8',
    cameraCinematicToggle: 'camera_cinematic_toggle',
    editModeToggle: 'edit_mode_toggle',
    editModeResetView: 'edit_mode_reset_view',
});

export const DEFAULT_KEY_BINDINGS = Object.freeze({
    [ACTION_IDS.driveForward]: Object.freeze(['w', 'arrowup']),
    [ACTION_IDS.driveBackward]: Object.freeze(['s', 'arrowdown']),
    [ACTION_IDS.driveLeft]: Object.freeze(['a', 'arrowleft']),
    [ACTION_IDS.driveRight]: Object.freeze(['d', 'arrowright']),
    [ACTION_IDS.handbrake]: Object.freeze(['space']),
    [ACTION_IDS.pauseToggle]: Object.freeze(['escape']),
    [ACTION_IDS.mapToggle]: Object.freeze(['m']),
    [ACTION_IDS.fullscreenToggle]: Object.freeze(['f']),
    [ACTION_IDS.restartRound]: Object.freeze(['q']),
    [ACTION_IDS.restartFromScoreboard]: Object.freeze(['enter']),
    [ACTION_IDS.mineDrop]: Object.freeze(['g']),
    [ACTION_IDS.mineThrow]: Object.freeze(['t']),
    [ACTION_IDS.roofMenuNext]: Object.freeze(['tab']),
    [ACTION_IDS.roofMenuPrevious]: Object.freeze(['shift+tab']),
    [ACTION_IDS.roofModeDashboard]: Object.freeze(['1']),
    [ACTION_IDS.roofModeBattery]: Object.freeze(['2']),
    [ACTION_IDS.roofModeNavigation]: Object.freeze(['3']),
    [ACTION_IDS.roofModeChassis]: Object.freeze(['4']),
    [ACTION_IDS.graphicsCycle]: Object.freeze(['y']),
    [ACTION_IDS.cameraView1]: Object.freeze(['meta+1', 'alt+1']),
    [ACTION_IDS.cameraView2]: Object.freeze(['meta+2', 'alt+2']),
    [ACTION_IDS.cameraView3]: Object.freeze(['meta+3', 'alt+3']),
    [ACTION_IDS.cameraView4]: Object.freeze(['meta+4', 'alt+4']),
    [ACTION_IDS.cameraView5]: Object.freeze(['meta+5', 'alt+5']),
    [ACTION_IDS.cameraView6]: Object.freeze(['meta+6', 'alt+6']),
    [ACTION_IDS.cameraView7]: Object.freeze(['meta+7', 'alt+7']),
    [ACTION_IDS.cameraView8]: Object.freeze(['meta+8', 'alt+8']),
    [ACTION_IDS.cameraCinematicToggle]: Object.freeze(['meta+c', 'alt+c']),
    [ACTION_IDS.editModeToggle]: Object.freeze(['e']),
    [ACTION_IDS.editModeResetView]: Object.freeze(['r']),
});

const SPECIAL_KEY_LABELS = Object.freeze({
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    space: 'Space',
    escape: 'Esc',
    enter: 'Enter',
    tab: 'Tab',
    shift: 'Shift',
    alt: 'Alt',
    ctrl: 'Ctrl',
    meta: 'Cmd',
});

export function normalizeKeyboardKey(rawKey = '') {
    const keyValue = String(rawKey || '').toLowerCase();
    if (keyValue === ' ' || keyValue === 'spacebar') {
        return 'space';
    }
    if (keyValue === 'esc') {
        return 'escape';
    }
    return keyValue;
}

export function getActionBindingTokens(actionId, keyBindings = DEFAULT_KEY_BINDINGS) {
    const bindings = keyBindings?.[actionId];
    if (!Array.isArray(bindings)) {
        return [];
    }
    return bindings
        .map((entry) =>
            String(entry || '')
                .trim()
                .toLowerCase()
        )
        .filter((entry) => entry.length > 0);
}

export function resolveActionBindingLabels(actionId, keyBindings = DEFAULT_KEY_BINDINGS) {
    const bindings = getActionBindingTokens(actionId, keyBindings);
    return bindings.map((binding) => bindingTokenToLabel(binding));
}

export function actionMatchesEvent(
    actionId,
    event,
    keyBindings = DEFAULT_KEY_BINDINGS,
    normalizedKey = normalizeKeyboardKey(event?.key || '')
) {
    const bindings = getActionBindingTokens(actionId, keyBindings);
    if (bindings.length <= 0) {
        return false;
    }
    const eventKey = normalizeKeyboardKey(normalizedKey || event?.key || '');
    for (let index = 0; index < bindings.length; index += 1) {
        const parsed = parseBindingToken(bindings[index]);
        if (!parsed) {
            continue;
        }
        if (parsed.key !== eventKey) {
            continue;
        }
        if (Boolean(parsed.shift) !== Boolean(event?.shiftKey)) {
            continue;
        }
        if (Boolean(parsed.alt) !== Boolean(event?.altKey)) {
            continue;
        }
        if (Boolean(parsed.ctrl) !== Boolean(event?.ctrlKey)) {
            continue;
        }
        if (Boolean(parsed.meta) !== Boolean(event?.metaKey)) {
            continue;
        }
        return true;
    }
    return false;
}

export function bindingTokenToLabel(bindingToken = '') {
    const parsed = parseBindingToken(bindingToken);
    if (!parsed) {
        return '';
    }
    const labelParts = [];
    if (parsed.ctrl) {
        labelParts.push('Ctrl');
    }
    if (parsed.alt) {
        labelParts.push('Alt');
    }
    if (parsed.shift) {
        labelParts.push('Shift');
    }
    if (parsed.meta) {
        labelParts.push('Cmd');
    }
    labelParts.push(formatKeyLabel(parsed.key));
    return labelParts.join('+');
}

function parseBindingToken(bindingToken = '') {
    const token = String(bindingToken || '')
        .trim()
        .toLowerCase();
    if (!token) {
        return null;
    }
    const parts = token.split('+').map((entry) => entry.trim());
    const result = {
        shift: false,
        alt: false,
        ctrl: false,
        meta: false,
        key: '',
    };
    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        if (!part) {
            continue;
        }
        if (part === 'shift' || part === 'alt' || part === 'ctrl' || part === 'meta') {
            result[part] = true;
            continue;
        }
        if (!result.key) {
            result.key = normalizeKeyboardKey(part);
        }
    }
    if (!result.key) {
        return null;
    }
    return result;
}

function formatKeyLabel(normalizedKey = '') {
    const key = normalizeKeyboardKey(normalizedKey);
    if (SPECIAL_KEY_LABELS[key]) {
        return SPECIAL_KEY_LABELS[key];
    }
    if (key.length === 1) {
        return key.toUpperCase();
    }
    return key.charAt(0).toUpperCase() + key.slice(1);
}
