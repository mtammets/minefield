import { createObjectiveUiController } from './objective-ui.js';
import { createWelcomeModalController } from './welcome-modal.js';
import { createBotStatusController } from './bot-status-ui.js';
import { createFinalScoreboardController } from './final-scoreboard-ui.js';
import { createPauseMenuController } from './pause-menu-ui.js';

export function createRuntimeUiControllers({
    toCssHex,
    colorNameFromHex,
    statusDefaultText,
    resolvePlayerCarColorHex,
    getCarColorPresetIndex,
    getIsCarDestroyed,
    getSelectedCarColorHex,
    getGameSessionController,
    getInputController,
    onPrepareStart,
    onDownloadPerformanceLog = null,
}) {
    const objectiveUi = createObjectiveUiController({
        toCssHex,
        colorNameFromHex,
        statusDefaultText,
        isCarDestroyed: getIsCarDestroyed,
    });

    const botStatusUi = createBotStatusController({
        toCssHex,
        colorNameFromHex,
    });

    const finalScoreboardUi = createFinalScoreboardController({
        onRestart() {
            getGameSessionController()?.restartGameWithCountdown();
        },
        onDownloadLog(roundSnapshot = null) {
            onDownloadPerformanceLog?.(roundSnapshot);
        },
        onExit() {
            getInputController()?.returnToWelcomeFromPauseMenu();
        },
    });

    const pauseMenuUi = createPauseMenuController({
        onExit() {
            getInputController()?.returnToWelcomeFromPauseMenu();
        },
        onResume() {
            getGameSessionController()?.setPauseState(false);
        },
    });

    const welcomeModalUi = createWelcomeModalController({
        initialColorHex: getSelectedCarColorHex(),
        getCurrentColorHex: getSelectedCarColorHex,
        resolvePlayerCarColorHex,
        getCarColorPresetIndex,
        onPrepareStart,
        toCssHex,
        onStartRequested(mode) {
            if (mode !== 'bots') {
                return;
            }
            getGameSessionController()?.requestGameplayFullscreen?.();
        },
        onColorChange(colorHex) {
            getGameSessionController()?.setSelectedPlayerCarColor(colorHex);
        },
        onStart(mode, startContext = null) {
            getGameSessionController()?.dismissWelcomeModal(mode, startContext);
        },
    });

    return {
        objectiveUi,
        botStatusUi,
        finalScoreboardUi,
        pauseMenuUi,
        welcomeModalUi,
    };
}
