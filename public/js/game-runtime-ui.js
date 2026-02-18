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
        toCssHex,
        onColorChange(colorHex) {
            getGameSessionController()?.setSelectedPlayerCarColor(colorHex);
        },
        onStart(mode) {
            getGameSessionController()?.dismissWelcomeModal(mode);
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
