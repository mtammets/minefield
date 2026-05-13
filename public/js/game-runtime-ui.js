import { createWelcomeModalController } from './welcome-modal.js';
import { createBotStatusController } from './bot-status-ui.js';
import { createFinalScoreboardController } from './final-scoreboard-ui.js';
import { createPauseMenuController } from './pause-menu-ui.js';
import { createDonateUiController } from './donate-ui.js';
import { createControlsHelpController } from './controls-ui.js';
import { createSpeedometerController } from './speedometer-ui.js';
import { createObjectiveHudController } from './objective-hud-ui.js';
import { createToastController } from './toast-ui.js';

export function createRuntimeUiControllers({
    toCssHex,
    colorNameFromHex,
    statusDefaultText,
    resolvePlayerCarSkinId,
    getCarSkinPresetIndex,
    getIsCarDestroyed,
    getSelectedCarColorHex,
    getSelectedCarSkinId,
    getGameSessionController,
    getInputController,
    getGameMode = () => 'bots',
    getIsInOnlineRoom = () => false,
    getMineInventorySnapshot = () => null,
    getCombatLoadoutSnapshot = () => null,
    onPrepareStart,
    onAuthSubmit = null,
    onAuthSignOut = null,
    onAuthUpdateProfileImage = null,
    onAuthRemoveProfileImage = null,
    onAuthUpdateCarWrap = null,
    onAuthRemoveCarWrap = null,
    onAuthChangePassword = null,
    onAuthDeleteAccount = null,
    onRefreshGlobalLeaderboard = null,
    getAuthState = () => null,
    onDownloadPerformanceLog = null,
}) {
    const objectiveUi = createObjectiveHudController({
        statusDefaultText: '',
    });
    const controlsHelpUi = createControlsHelpController({
        getGameMode,
        getIsInOnlineRoom,
        getMineInventorySnapshot,
        getCombatLoadoutSnapshot,
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
        onRefreshGlobalLeaderboard() {
            onRefreshGlobalLeaderboard?.();
        },
        onExit() {
            getInputController()?.returnToWelcome?.();
        },
        getAuthState,
    });

    const pauseMenuUi = createPauseMenuController({
        onExit() {
            getInputController()?.returnToWelcome?.();
        },
        onResume() {
            getGameSessionController()?.setPauseState(false);
        },
    });

    const welcomeModalUi = createWelcomeModalController({
        initialSkinId: getSelectedCarSkinId(),
        getCurrentSkinId: getSelectedCarSkinId,
        resolvePlayerCarSkinId,
        getCarSkinPresetIndex,
        onPrepareStart,
        onAuthSubmit,
        onAuthSignOut,
        onAuthUpdateProfileImage,
        onAuthRemoveProfileImage,
        onAuthUpdateCarWrap,
        onAuthRemoveCarWrap,
        onAuthChangePassword,
        onAuthDeleteAccount,
        onRefreshGlobalLeaderboard,
        getAuthState,
        toCssHex,
        onStartRequested(mode) {
            if (mode !== 'bots') {
                return;
            }
            getGameSessionController()?.requestGameplayFullscreen?.();
        },
        onSkinChange(skinId) {
            getGameSessionController()?.setSelectedPlayerCarSkin(skinId);
        },
        onStart(mode, startContext = null) {
            getGameSessionController()?.dismissWelcomeModal(mode, startContext);
        },
    });

    const donateUi = createDonateUiController({
        onStatus(messageText, timeoutMs = 2800) {
            if (!messageText) {
                return;
            }
            objectiveUi.showInfo(messageText, timeoutMs);
        },
    });
    donateUi.initialize();
    const speedometerUi = createSpeedometerController();
    const toastUi = createToastController();

    return {
        objectiveUi,
        controlsHelpUi,
        botStatusUi,
        finalScoreboardUi,
        pauseMenuUi,
        welcomeModalUi,
        donateUi,
        speedometerUi,
        toastUi,
    };
}
