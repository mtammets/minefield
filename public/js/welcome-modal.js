import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { createCarRig } from './car.js';
import { CAR_SKIN_PRESETS, DEFAULT_PLAYER_CAR_SKIN_ID, getCarSkinPresetById } from './car-skins.js';
import {
    WELCOME_CAR_SPIN_SPEED,
    WELCOME_PREVIEW_STATE_SPEED,
    WELCOME_PREVIEW_REAR_LIGHT_Z,
} from './constants.js';

const SWAP_TIMING = {
    exitSec: 0.62,
    gapSec: 0.02,
    enterSec: 0.66,
    settleSec: 0.22,
};
const WELCOME_TAGLINE_ROTATION_INTERVAL_SEC = 8.5;
const WELCOME_TAGLINE_TRANSITION_OUT_MS = 180;
const WELCOME_TAGLINE_TRANSITION_IN_MS = 280;
const ONLINE_ROOM_CODE_LENGTH = 6;
const ONLINE_CODE_LOOKUP_DEBOUNCE_MS = 260;
const ONLINE_PLAYER_NAME_MAX_LENGTH = 18;
const AUTH_PASSWORD_MIN_LENGTH = 6;
const DEFAULT_ONLINE_PLAYER_NAME = 'Driver';
const MP_NAME_STORAGE_KEY = 'silentdrift-mp-player-name';
const WELCOME_START_SEQUENCE_MIN_MS = 2600;
const WELCOME_START_SEQUENCE_COMPLETION_DELAY_MS = 260;
const WELCOME_START_SEQUENCE_PREP_CAP = 0.9;
const WELCOME_START_SEQUENCE_READY_CAP = 0.98;
const WELCOME_PREVIEW_LOADING_MIN_VISIBLE_MS = 700;
const WELCOME_PREVIEW_LOADING_FADE_MS = 420;
const WELCOME_PREVIEW_LOADING_SOFT_CAP = 0.94;
const WELCOME_DONATE_OPEN_EVENT = 'silentdrift:welcome-donate-open';
const WELCOME_DONATE_CLOSE_EVENT = 'silentdrift:welcome-donate-close';
const WELCOME_ONLINE_OPEN_EVENT = 'silentdrift:welcome-online-open';
const WELCOME_ONLINE_CLOSE_EVENT = 'silentdrift:welcome-online-close';
const WELCOME_TAGLINE_VARIANTS = [
    'Master precision driving across high-stakes circuits. Tune your car, out-drift rivals, and climb the online leaderboard.',
    'Own every corner with elite handling, strategic mine plays, and relentless multiplayer competition.',
    'Build race-winning momentum, control every drift angle, and push your best lap under pressure.',
    'Compete in fast tactical races where clean lines, timing, and control decide the podium.',
];

export function createWelcomeModalController({
    onStart,
    onStartRequested,
    onPrepareStart,
    onAuthSubmit,
    onAuthSignOut,
    onAuthUpdateProfileImage,
    onAuthRemoveProfileImage,
    onAuthChangePassword,
    onAuthDeleteAccount,
    onRefreshGlobalLeaderboard,
    onSkinChange,
    initialSkinId,
    getCurrentSkinId,
    getAuthState,
    resolvePlayerCarSkinId,
    getCarSkinPresetIndex,
} = {}) {
    const resolveSkinId =
        typeof resolvePlayerCarSkinId === 'function'
            ? resolvePlayerCarSkinId
            : (skinId) => getCarSkinPresetById(skinId || DEFAULT_PLAYER_CAR_SKIN_ID).id;
    const resolvePresetIndex =
        typeof getCarSkinPresetIndex === 'function' ? getCarSkinPresetIndex : () => 0;
    const currentSkinGetter =
        typeof getCurrentSkinId === 'function' ? getCurrentSkinId : () => initialSkinId;

    const rootEl = document.getElementById('welcomeModal');
    const startActionsEl = rootEl?.querySelector?.('.welcomeStartActions') || null;
    const startBtnEl = document.getElementById('welcomeStartBtn');
    const startOnlineBtnEl = document.getElementById('welcomeStartOnlineBtn');
    const authPanelEl = document.getElementById('welcomeAuthPanel');
    const authSignedOutViewEl = document.getElementById('welcomeAuthSignedOutView');
    const authSignedInViewEl = document.getElementById('welcomeAuthSignedInView');
    const authSignInTabEl = document.getElementById('welcomeAuthSignInTab');
    const authSignUpTabEl = document.getElementById('welcomeAuthSignUpTab');
    const authDisplayNameFieldEl = document.getElementById('welcomeAuthDisplayNameField');
    const authDisplayNameInputEl = document.getElementById('welcomeAuthDisplayNameInput');
    const authEmailInputEl = document.getElementById('welcomeAuthEmailInput');
    const authPasswordInputEl = document.getElementById('welcomeAuthPasswordInput');
    const authConfirmFieldEl = document.getElementById('welcomeAuthConfirmField');
    const authConfirmPasswordInputEl = document.getElementById('welcomeAuthConfirmPasswordInput');
    const authSubmitBtnEl = document.getElementById('welcomeAuthSubmitBtn');
    const authStatusEl = document.getElementById('welcomeAuthStatus');
    const authAvatarFrameEl = document.getElementById('welcomeAuthAvatarFrame');
    const authAvatarImageEl = document.getElementById('welcomeAuthAvatarImage');
    const authAvatarFallbackEl = document.getElementById('welcomeAuthAvatarFallback');
    const authAvatarInputEl = document.getElementById('welcomeAuthAvatarInput');
    const authAvatarUploadBtnEl = document.getElementById('welcomeAuthAvatarUploadBtn');
    const authAvatarRemoveBtnEl = document.getElementById('welcomeAuthAvatarRemoveBtn');
    const authSignedInNameEl = document.getElementById('welcomeAuthSignedInName');
    const authSignedInEmailEl = document.getElementById('welcomeAuthSignedInEmail');
    const authChangePasswordToggleBtnEl = document.getElementById(
        'welcomeAuthChangePasswordToggleBtn'
    );
    const authSignOutBtnEl = document.getElementById('welcomeAuthSignOutBtn');
    const authDeleteAccountBtnEl = document.getElementById('welcomeAuthDeleteAccountBtn');
    const authPasswordChangePanelEl = document.getElementById('welcomeAuthPasswordChangePanel');
    const authNewPasswordInputEl = document.getElementById('welcomeAuthNewPasswordInput');
    const authConfirmNewPasswordInputEl = document.getElementById(
        'welcomeAuthConfirmNewPasswordInput'
    );
    const authPasswordChangeSubmitBtnEl = document.getElementById(
        'welcomeAuthPasswordChangeSubmitBtn'
    );
    const authPasswordChangeCancelBtnEl = document.getElementById(
        'welcomeAuthPasswordChangeCancelBtn'
    );
    const onlineModeFlowEl = document.getElementById('welcomeOnlineModeFlow');
    const onlineNameInputEl = document.getElementById('welcomeOnlineNameInput');
    const onlineCreateChoiceBtnEl = document.getElementById('welcomeOnlineCreateChoiceBtn');
    const onlineJoinChoiceBtnEl = document.getElementById('welcomeOnlineJoinChoiceBtn');
    const onlineRoomCodeLabelEl = document.getElementById('welcomeOnlineRoomCodeLabel');
    const onlineRoomCodeInputEl = document.getElementById('welcomeOnlineRoomCodeInput');
    const onlineRoomCodeStatusEl = document.getElementById('welcomeOnlineRoomCodeStatus');
    const onlineContinueBtnEl = document.getElementById('welcomeOnlineContinueBtn');
    const launchOverlayEl = document.getElementById('welcomeLaunchOverlay');
    const launchTitleEl = document.getElementById('welcomeLaunchTitle');
    const launchStatusEl = document.getElementById('welcomeLaunchStatus');
    const launchProgressEl = document.getElementById('welcomeLaunchProgress');
    const launchProgressFillEl = document.getElementById('welcomeLaunchProgressFill');
    const launchPercentEl = document.getElementById('welcomeLaunchPercent');
    const leaderboardBtnEl = document.getElementById('welcomeLeaderboardBtn');
    const accountBtnEl = document.getElementById('welcomeAccountBtn');
    const donateBtnEl = document.getElementById('welcomeDonateBtn');
    const previewShellEl = document.getElementById('welcomePreviewShell');
    const previewCanvasEl = document.getElementById('welcomeCarCanvas');
    const previewLoadingEl = document.getElementById('welcomePreviewLoading');
    const previewLoadingStatusEl = document.getElementById('welcomePreviewLoadingStatus');
    const previewLoadingProgressEl = document.getElementById('welcomePreviewLoadingProgress');
    const previewLoadingFillEl = document.getElementById('welcomePreviewLoadingFill');
    const previewLoadingPercentEl = document.getElementById('welcomePreviewLoadingPercent');
    const previewLeaderboardOverlayEl = document.getElementById('welcomePreviewLeaderboardOverlay');
    const previewLeaderboardStatusEl = document.getElementById('welcomePreviewLeaderboardStatus');
    const previewLeaderboardListEl = document.getElementById('welcomePreviewLeaderboardList');
    const previewLeaderboardRefreshBtnEl = document.getElementById(
        'welcomePreviewLeaderboardRefreshBtn'
    );
    const previewLeaderboardCloseBtnEl = document.getElementById(
        'welcomePreviewLeaderboardCloseBtn'
    );
    const previewAccountOverlayEl = document.getElementById('welcomePreviewAccountOverlay');
    const previewAccountTitleEl = document.getElementById('welcomePreviewAccountTitle');
    const previewAccountBodyEl = document.getElementById('welcomePreviewAccountBody');
    const previewAccountCloseBtnEl = document.getElementById('welcomePreviewAccountCloseBtn');
    const previewDonateOverlayEl = document.getElementById('welcomePreviewDonateOverlay');
    const previewDonateCloseBtnEl = document.getElementById('welcomePreviewDonateCloseBtn');
    const previewOnlineOverlayEl = document.getElementById('welcomePreviewOnlineOverlay');
    const previewOnlineBodyEl = document.getElementById('welcomePreviewOnlineBody');
    const previewOnlineCloseBtnEl = document.getElementById('welcomePreviewOnlineCloseBtn');
    const prevVehicleBtnEl = document.getElementById('welcomeVehiclePrevBtn');
    const nextVehicleBtnEl = document.getElementById('welcomeVehicleNextBtn');
    const taglineEl = document.getElementById('welcomeTagline');

    if (!rootEl || !startBtnEl || !previewCanvasEl) {
        const fallbackSkinId = resolveSkinId(initialSkinId);
        return {
            show() {},
            hide() {},
            resize() {},
            update() {},
            isVisible() {
                return false;
            },
            isAvailable() {
                return false;
            },
            getSelectedSkinId() {
                return fallbackSkinId;
            },
            setSelectedSkinId() {},
            selectNeighborSkin() {},
            getPreferredStartMode() {
                return 'bots';
            },
            getPreferredStartContext() {
                return null;
            },
            setAuthState() {},
            setGlobalLeaderboard() {},
            focusAuthPanel() {},
        };
    }

    const previewScene = new THREE.Scene();
    const previewCamera = new THREE.PerspectiveCamera(31, 16 / 9, 0.1, 100);
    const previewRenderer = new THREE.WebGLRenderer({
        canvas: previewCanvasEl,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
    });
    previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
    previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    previewRenderer.toneMappingExposure = 1.2;
    previewScene.fog = new THREE.FogExp2(0x02070d, 0.068);

    const skyFillLight = new THREE.HemisphereLight(0xbad8ff, 0x090f18, 0.86);
    previewScene.add(skyFillLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.24);
    keyLight.position.set(4.8, 6.3, 4.6);
    previewScene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x9acbff, 0.96);
    rimLight.position.set(-6.1, 2.9, -5.8);
    previewScene.add(rimLight);

    const kickerLight = new THREE.PointLight(0xffb27f, 0.34, 11, 2);
    kickerLight.position.set(2.3, 1.3, -2.2);
    previewScene.add(kickerLight);

    const fillLight = new THREE.PointLight(0x8bbfff, 0.42, 14, 2.4);
    fillLight.position.set(0, 0.62, 2.2);
    previewScene.add(fillLight);

    const underGlow = new THREE.Mesh(
        new THREE.CircleGeometry(2.45, 48),
        new THREE.MeshBasicMaterial({
            color: 0xb4d9ff,
            transparent: true,
            opacity: 0.1,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        })
    );
    underGlow.rotation.x = -Math.PI * 0.5;
    underGlow.position.y = 0.02;
    previewScene.add(underGlow);

    const previewVehicles = [createPreviewVehicle(), createPreviewVehicle()];
    let activeVehicleIndex = 0;
    let previewSpinYaw = Math.PI * 0.32;
    let selectedSkinIndex = resolvePresetIndex(initialSkinId);
    let previewPulseTime = Math.random() * Math.PI * 2;
    let preferredStartMode = 'bots';
    let preferredOnlineRoomAction = '';
    let preferredOnlineRoomCode = '';
    let preferredOnlinePlayerName = DEFAULT_ONLINE_PLAYER_NAME;
    let authMode = 'sign-in';
    let authUiState = normalizeWelcomeAuthState(getAuthState?.());
    let authLocalStatusText = '';
    let authLocalStatusTone = 'muted';
    let authPasswordChangeOpen = false;
    let welcomeLeaderboardOpen = false;
    let welcomeAccountOpen = false;
    let welcomeDonateOpen = false;
    let welcomeGlobalLeaderboardState = createInitialWelcomeGlobalLeaderboardState();
    let onlineCodeLookupTimeout = null;
    let onlineCodeLookupAbortController = null;
    let onlineContinueGlintTimeout = null;
    let customCreateCodeStatus = 'idle';
    let customCreateCodeStatusCode = '';
    const leaderboardNumberFormatter = new Intl.NumberFormat('en-US');
    const launchSequenceState = {
        active: false,
        token: 0,
        progress: 0,
    };
    const previewLoadingState = {
        active: Boolean(previewLoadingEl && previewLoadingFillEl),
        ready: false,
        hidden: false,
        readyRafHandle: null,
        rafHandle: null,
        hideTimeoutHandle: null,
        startedAtMs: 0,
        lastFrameAtMs: 0,
        progress: 0,
        targetProgress: 0,
    };
    const hasOnlineStartFlow = Boolean(
        startActionsEl &&
        onlineModeFlowEl &&
        onlineCreateChoiceBtnEl &&
        onlineJoinChoiceBtnEl &&
        onlineRoomCodeStatusEl &&
        onlineRoomCodeInputEl &&
        onlineContinueBtnEl
    );
    const hasAuthPanel = Boolean(
        authPanelEl &&
        authSignedOutViewEl &&
        authSignedInViewEl &&
        authSignInTabEl &&
        authSignUpTabEl &&
        authEmailInputEl &&
        authPasswordInputEl &&
        authSubmitBtnEl &&
        authStatusEl &&
        authAvatarInputEl &&
        authSignOutBtnEl &&
        authDeleteAccountBtnEl
    );
    const taglineRotation = {
        activeIndex: 0,
        elapsedSec: 0,
        isTransitioning: false,
        transitionTimer: null,
        queuedIndex: null,
    };

    const previewState = {
        speed: WELCOME_PREVIEW_STATE_SPEED,
        acceleration: 0,
        steerInput: 0,
        throttle: 0.62,
        brake: 0.18,
        burnout: 0,
        launchSlip: 0.14,
        yawRate: 0.06,
        velocity: new THREE.Vector2(0, -WELCOME_PREVIEW_STATE_SPEED),
        terrainCompression: 0,
        terrainGrounded: 1,
        verticalSpeed: 0,
    };

    const previewBounds = new THREE.Box3().setFromObject(previewVehicles[0].car);
    const previewSize = previewBounds.getSize(new THREE.Vector3());
    const previewRadius = Math.max(previewSize.x, previewSize.y, previewSize.z);
    const previewLookAt = new THREE.Vector3(0, previewSize.y * 0.28, 0);
    const previewCameraBasePosition = new THREE.Vector3(
        previewRadius * 1.48,
        previewRadius * 0.76,
        previewRadius * 1.85
    );
    const swapOutgoingDistance = previewRadius * 3.6;
    const swapIncomingDistance = previewRadius * 3.8;
    const swapCurveOffset = 0;
    const swapTurnYaw = 0;
    const swapSettleDistance = 0;
    const swapSettleYawOffset = 0;
    const showroomAtmosphere = createShowroomAtmosphere(previewScene, previewRadius);

    const transition = {
        active: false,
        phase: 'idle',
        phaseTime: 0,
        direction: 1,
        targetIndex: selectedSkinIndex,
        emitChange: true,
        outgoingVehicleIndex: 0,
        incomingVehicleIndex: 1,
        glowBoost: 0,
        cameraKick: 0,
        baseYaw: previewSpinYaw,
        outgoingDistance: swapOutgoingDistance,
        incomingDistance: swapIncomingDistance,
        curveOffset: swapCurveOffset,
        turnYaw: swapTurnYaw,
        settleDistance: swapSettleDistance,
        settleYawOffset: swapSettleYawOffset,
        queue: null,
    };

    previewCamera.position.copy(previewCameraBasePosition);
    previewCamera.lookAt(previewLookAt);
    rootEl.dataset.onlineFlowOpen = 'false';
    if (previewShellEl) {
        previewShellEl.dataset.leaderboardOpen = 'false';
        previewShellEl.dataset.accountOpen = 'false';
        previewShellEl.dataset.donateOpen = 'false';
        previewShellEl.dataset.onlineOpen = 'false';
    }
    if (authPanelEl && previewAccountBodyEl) {
        previewAccountBodyEl.append(authPanelEl);
    }
    if (onlineModeFlowEl && previewOnlineBodyEl) {
        previewOnlineBodyEl.append(onlineModeFlowEl);
    }
    resetTransitionVisuals();
    setTaglineByIndex(0);
    applySelectedPreset(selectedSkinIndex, false);
    resetStartSequenceUi();
    syncAuthUi();
    syncWelcomeLeaderboardUi();
    syncWelcomeOnlineUi();
    bindVehicleButtons();
    initializePreviewLoadingUi();
    startPreviewLoadingAnimation();
    document.addEventListener(WELCOME_DONATE_OPEN_EVENT, () => {
        if (rootEl.hidden) {
            return;
        }
        if (hasOnlineStartFlow && !onlineModeFlowEl.hidden) {
            closeOnlineModeFlow({ clearSelection: true });
        }
        setWelcomeLeaderboardOpen(false);
        setWelcomeAccountOpen(false);
        setWelcomeDonateOpen(true);
    });
    document.addEventListener(WELCOME_DONATE_CLOSE_EVENT, () => {
        if (rootEl.hidden) {
            return;
        }
        setWelcomeDonateOpen(false);
    });
    document.addEventListener('keydown', handleWelcomeGlobalKeydown);
    if (hasAuthPanel) {
        authSignInTabEl.addEventListener('click', () => {
            setAuthMode('sign-in', { focusField: true });
        });
        authSignUpTabEl.addEventListener('click', () => {
            setAuthMode('sign-up', { focusField: true });
        });
        authEmailInputEl.addEventListener('input', () => {
            authEmailInputEl.value = sanitizeAuthEmailInput(authEmailInputEl.value);
            clearLocalAuthStatus();
            syncAuthUi();
        });
        authDisplayNameInputEl?.addEventListener('input', () => {
            authDisplayNameInputEl.value = sanitizeOnlinePlayerNameInput(
                authDisplayNameInputEl.value
            );
            clearLocalAuthStatus();
            syncAuthUi();
        });
        authPasswordInputEl.addEventListener('input', () => {
            clearLocalAuthStatus();
            syncAuthUi();
        });
        authConfirmPasswordInputEl?.addEventListener('input', () => {
            clearLocalAuthStatus();
            syncAuthUi();
        });
        authNewPasswordInputEl?.addEventListener('input', () => {
            clearLocalAuthStatus();
            syncAuthUi();
        });
        authConfirmNewPasswordInputEl?.addEventListener('input', () => {
            clearLocalAuthStatus();
            syncAuthUi();
        });
        authEmailInputEl.addEventListener('keydown', handleAuthFieldKeydown);
        authPasswordInputEl.addEventListener('keydown', handleAuthFieldKeydown);
        authDisplayNameInputEl?.addEventListener('keydown', handleAuthFieldKeydown);
        authConfirmPasswordInputEl?.addEventListener('keydown', handleAuthFieldKeydown);
        authNewPasswordInputEl?.addEventListener('keydown', handlePasswordChangeFieldKeydown);
        authConfirmNewPasswordInputEl?.addEventListener(
            'keydown',
            handlePasswordChangeFieldKeydown
        );
        authSubmitBtnEl.addEventListener('click', () => {
            void handleAuthSubmit();
        });
        authChangePasswordToggleBtnEl?.addEventListener('click', () => {
            handlePasswordChangeToggle();
        });
        authSignOutBtnEl.addEventListener('click', () => {
            void handleAuthSignOut();
        });
        authDeleteAccountBtnEl.addEventListener('click', () => {
            void handleDeleteAccount();
        });
        authPasswordChangeSubmitBtnEl?.addEventListener('click', () => {
            void handlePasswordChangeSubmit();
        });
        authPasswordChangeCancelBtnEl?.addEventListener('click', () => {
            handlePasswordChangeCancel();
        });
        authAvatarUploadBtnEl?.addEventListener('click', () => {
            if (authUiState.loading || !authUiState.authenticated) {
                return;
            }
            authAvatarInputEl.value = '';
            authAvatarInputEl.click();
        });
        authAvatarInputEl?.addEventListener('change', () => {
            void handleProfileImageSelection();
        });
        authAvatarRemoveBtnEl?.addEventListener('click', () => {
            void handleProfileImageRemoval();
        });
        authAvatarImageEl?.addEventListener('error', () => {
            if (authAvatarFrameEl) {
                authAvatarFrameEl.dataset.hasImage = 'false';
            }
            if (authAvatarImageEl) {
                authAvatarImageEl.hidden = true;
                authAvatarImageEl.removeAttribute('src');
            }
            if (authAvatarFallbackEl) {
                authAvatarFallbackEl.hidden = false;
            }
        });
    }

    startBtnEl.addEventListener('click', () => {
        setWelcomeLeaderboardOpen(false);
        setWelcomeAccountOpen(false);
        requestWelcomeDonateClose();
        closeOnlineModeFlow({ clearSelection: true });
        preferredStartMode = 'bots';
        beginStartSequence('bots', null);
    });
    leaderboardBtnEl?.addEventListener('click', () => {
        void handleWelcomeLeaderboardToggle();
    });
    accountBtnEl?.addEventListener('click', () => {
        handleWelcomeAccountToggle();
    });
    startOnlineBtnEl?.addEventListener('click', () => {
        if (launchSequenceState.active) {
            return;
        }
        setWelcomeLeaderboardOpen(false);
        setWelcomeAccountOpen(false);
        requestWelcomeDonateClose();
        if (hasOnlineStartFlow) {
            if (onlineModeFlowEl.hidden) {
                openOnlineModeFlow();
            } else {
                closeOnlineModeFlow({ clearSelection: true });
            }
            return;
        }
        preferredStartMode = 'online';
        beginStartSequence('online', null);
    });
    if (hasOnlineStartFlow) {
        syncOnlinePlayerNameFromStorage();
        onlineNameInputEl?.addEventListener('input', () => {
            const safeName = sanitizeOnlinePlayerNameInput(onlineNameInputEl.value);
            onlineNameInputEl.value = safeName;
            preferredOnlinePlayerName = safeName;
            writeStoredOnlinePlayerName(safeName);
        });
        onlineNameInputEl?.addEventListener('blur', () => {
            const safeName = sanitizeOnlinePlayerNameInput(onlineNameInputEl.value);
            onlineNameInputEl.value = safeName;
            preferredOnlinePlayerName = safeName;
            writeStoredOnlinePlayerName(safeName);
        });
        onlineCreateChoiceBtnEl.addEventListener('click', () => {
            setOnlineRoomAction('create');
        });
        onlineJoinChoiceBtnEl.addEventListener('click', () => {
            setOnlineRoomAction('join', { focusRoomInput: true });
        });
        onlineRoomCodeInputEl.addEventListener('input', () => {
            const normalizedCode = normalizeOnlineRoomCode(onlineRoomCodeInputEl.value);
            onlineRoomCodeInputEl.value = normalizedCode;
            preferredOnlineRoomCode = normalizedCode;
            queueCustomCreateCodeAvailabilityLookup();
            updateOnlineFlowState();
        });
        onlineRoomCodeInputEl.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') {
                return;
            }
            if (onlineContinueBtnEl.disabled) {
                return;
            }
            event.preventDefault();
            handleOnlineFlowContinue();
        });
        onlineContinueBtnEl.addEventListener('click', () => {
            handleOnlineFlowContinue();
        });
    }
    previewLeaderboardOverlayEl?.addEventListener('click', (event) => {
        if (event.target === previewLeaderboardOverlayEl) {
            setWelcomeLeaderboardOpen(false);
        }
    });
    previewLeaderboardRefreshBtnEl?.addEventListener('click', () => {
        void requestWelcomeLeaderboardRefresh();
    });
    previewLeaderboardCloseBtnEl?.addEventListener('click', () => {
        setWelcomeLeaderboardOpen(false);
    });
    previewAccountOverlayEl?.addEventListener('click', (event) => {
        if (event.target === previewAccountOverlayEl) {
            setWelcomeAccountOpen(false);
        }
    });
    previewAccountCloseBtnEl?.addEventListener('click', () => {
        setWelcomeAccountOpen(false);
    });
    previewDonateOverlayEl?.addEventListener('click', (event) => {
        if (event.target === previewDonateOverlayEl) {
            requestWelcomeDonateClose();
        }
    });
    previewDonateCloseBtnEl?.addEventListener('click', () => {
        requestWelcomeDonateClose();
    });
    previewOnlineOverlayEl?.addEventListener('click', (event) => {
        if (event.target === previewOnlineOverlayEl) {
            closeOnlineModeFlow({ clearSelection: true });
        }
    });
    previewOnlineCloseBtnEl?.addEventListener('click', () => {
        closeOnlineModeFlow({ clearSelection: true });
    });

    return {
        show() {
            cancelStartSequence();
            rootEl.hidden = false;
            resetStartSequenceUi();
            setAuthState(getAuthState?.());
            setWelcomeLeaderboardOpen(false, { skipSync: true });
            setWelcomeAccountOpen(false, { skipSync: true });
            setWelcomeDonateOpen(false, { skipSync: true });
            syncWelcomeLeaderboardUi();
            syncWelcomeAccountUi();
            syncWelcomeDonateUi();
            preferredStartMode = 'bots';
            if (hasOnlineStartFlow) {
                closeOnlineModeFlow({ clearSelection: true });
            }
            taglineRotation.activeIndex = 0;
            taglineRotation.elapsedSec = 0;
            resetTaglineTransition();
            setTaglineByIndex(taglineRotation.activeIndex);
            forceSelectPreset(resolvePresetIndex(currentSkinGetter()), false);
            syncPreviewSize();
            updatePreviewVisualState(1 / 60);
            updateShowroomAtmosphere(0);
            applyPreviewPose();
            renderPreview();
            schedulePreviewLoadingReady();
        },
        hide() {
            cancelStartSequence();
            resetTaglineTransition();
            setWelcomeLeaderboardOpen(false, { skipSync: true });
            setWelcomeAccountOpen(false, { skipSync: true });
            requestWelcomeDonateClose();
            setWelcomeDonateOpen(false, { skipSync: true });
            closeOnlineModeFlow({ clearSelection: true });
            rootEl.hidden = true;
        },
        resize() {
            syncPreviewSize();
            if (!rootEl.hidden) {
                renderPreview();
                schedulePreviewLoadingReady();
            }
        },
        update(dt) {
            if (rootEl.hidden) {
                return;
            }
            const frameDt = Math.min(Math.max(dt || 0, 0), 0.05);
            if (!transition.active) {
                previewSpinYaw += frameDt * WELCOME_CAR_SPIN_SPEED;
            }
            updateTransition(frameDt);
            updatePreviewVisualState(frameDt);
            updateShowroomAtmosphere(frameDt);
            updateTaglineRotation(frameDt);
            applyPreviewPose();
            renderPreview();
            schedulePreviewLoadingReady();
        },
        isVisible() {
            return !rootEl.hidden;
        },
        isAvailable() {
            return true;
        },
        getSelectedSkinId() {
            return CAR_SKIN_PRESETS[selectedSkinIndex]?.id ?? DEFAULT_PLAYER_CAR_SKIN_ID;
        },
        setSelectedSkinId(skinId, options = {}) {
            const { emitChange = true } = options;
            forceSelectPreset(resolvePresetIndex(skinId), emitChange);
        },
        selectNeighborSkin(step = 1) {
            const direction = Math.sign(step || 1) || 1;
            const baseIndex = transition.active ? transition.targetIndex : selectedSkinIndex;
            requestSwap(baseIndex + direction, direction, true);
        },
        getPreferredStartMode() {
            return preferredStartMode;
        },
        getPreferredStartContext() {
            if (!isOnlineStartAuthorized()) {
                return null;
            }
            if (preferredStartMode !== 'online') {
                return null;
            }
            if (preferredOnlineRoomAction === 'create') {
                const roomCode = normalizeOnlineRoomCode(preferredOnlineRoomCode);
                if (roomCode.length !== 0 && roomCode.length !== ONLINE_ROOM_CODE_LENGTH) {
                    return null;
                }
                if (
                    roomCode.length === ONLINE_ROOM_CODE_LENGTH &&
                    (customCreateCodeStatus !== 'available' ||
                        customCreateCodeStatusCode !== roomCode)
                ) {
                    return null;
                }
                return {
                    roomAction: 'create',
                    roomCode,
                    playerName: sanitizeOnlinePlayerNameSubmit(preferredOnlinePlayerName),
                };
            }
            if (preferredOnlineRoomAction === 'join') {
                const roomCode = normalizeOnlineRoomCode(preferredOnlineRoomCode);
                if (roomCode.length !== ONLINE_ROOM_CODE_LENGTH) {
                    return null;
                }
                if (
                    customCreateCodeStatus !== 'occupied' ||
                    customCreateCodeStatusCode !== roomCode
                ) {
                    return null;
                }
                return {
                    roomAction: 'join',
                    roomCode,
                    playerName: sanitizeOnlinePlayerNameSubmit(preferredOnlinePlayerName),
                };
            }
            return null;
        },
        setAuthState,
        setGlobalLeaderboard(nextState = {}) {
            welcomeGlobalLeaderboardState = normalizeWelcomeGlobalLeaderboardState(nextState);
            syncWelcomeLeaderboardUi();
        },
        focusAuthPanel(mode = 'sign-in', options = {}) {
            focusAuthPanel(mode, options);
        },
    };

    function initializePreviewLoadingUi() {
        if (previewShellEl) {
            previewShellEl.dataset.previewLoading = previewLoadingState.active ? 'true' : 'false';
        }
        if (!previewLoadingState.active) {
            return;
        }
        previewLoadingState.hidden = false;
        previewLoadingState.ready = false;
        previewLoadingEl.hidden = false;
        previewLoadingEl.classList.remove('is-hiding');
        previewLoadingEl.setAttribute('aria-hidden', 'false');
        setPreviewLoadingProgress(0);
    }

    function startPreviewLoadingAnimation() {
        if (!previewLoadingState.active || previewLoadingState.hidden) {
            return;
        }
        if (previewLoadingState.rafHandle != null) {
            return;
        }
        const nowMs = performance.now();
        previewLoadingState.startedAtMs = nowMs;
        previewLoadingState.lastFrameAtMs = nowMs;
        previewLoadingState.progress = 0;
        previewLoadingState.targetProgress = 0;
        previewLoadingState.rafHandle = window.requestAnimationFrame(updatePreviewLoadingFrame);
    }

    function schedulePreviewLoadingReady() {
        if (
            !previewLoadingState.active ||
            previewLoadingState.hidden ||
            previewLoadingState.ready
        ) {
            return;
        }
        if (previewLoadingState.readyRafHandle != null) {
            return;
        }
        previewLoadingState.readyRafHandle = window.requestAnimationFrame(() => {
            previewLoadingState.readyRafHandle = null;
            markPreviewLoadingReady();
        });
    }

    function markPreviewLoadingReady() {
        if (
            !previewLoadingState.active ||
            previewLoadingState.hidden ||
            previewLoadingState.ready
        ) {
            return;
        }
        previewLoadingState.ready = true;
        previewLoadingState.targetProgress = 1;
        if (previewLoadingState.rafHandle == null) {
            previewLoadingState.lastFrameAtMs = performance.now();
            previewLoadingState.rafHandle = window.requestAnimationFrame(updatePreviewLoadingFrame);
        }
    }

    function updatePreviewLoadingFrame(nowMs = performance.now()) {
        previewLoadingState.rafHandle = null;
        if (!previewLoadingState.active || previewLoadingState.hidden) {
            return;
        }

        const elapsedMs = Math.max(0, nowMs - previewLoadingState.startedAtMs);
        const dtSec = Math.max(
            1 / 240,
            Math.min(0.22, Math.max(0, nowMs - previewLoadingState.lastFrameAtMs) / 1000)
        );
        previewLoadingState.lastFrameAtMs = nowMs;

        if (previewLoadingState.ready) {
            previewLoadingState.targetProgress = 1;
        } else {
            const softProgress = resolvePreviewLoadingSoftProgress(elapsedMs);
            previewLoadingState.targetProgress = Math.min(
                WELCOME_PREVIEW_LOADING_SOFT_CAP,
                Math.max(previewLoadingState.targetProgress, softProgress)
            );
        }

        const catchupRate = previewLoadingState.ready ? 11 : 4.2;
        const smoothing = 1 - Math.exp(-catchupRate * dtSec);
        previewLoadingState.progress = clampNumber(
            previewLoadingState.progress +
                (previewLoadingState.targetProgress - previewLoadingState.progress) * smoothing,
            0,
            1
        );
        setPreviewLoadingProgress(previewLoadingState.progress);

        const minVisibleReached = elapsedMs >= WELCOME_PREVIEW_LOADING_MIN_VISIBLE_MS;
        if (
            previewLoadingState.ready &&
            minVisibleReached &&
            previewLoadingState.progress >= 0.995
        ) {
            hidePreviewLoadingUi();
            return;
        }

        previewLoadingState.rafHandle = window.requestAnimationFrame(updatePreviewLoadingFrame);
    }

    function resolvePreviewLoadingSoftProgress(elapsedMs) {
        const t = Math.max(0, elapsedMs);
        if (t <= 460) {
            return 0.1 + easeOutCubic(t / 460) * 0.34;
        }
        if (t <= 1320) {
            return 0.44 + easeOutCubic((t - 460) / 860) * 0.28;
        }
        if (t <= 2450) {
            return 0.72 + easeOutCubic((t - 1320) / 1130) * 0.16;
        }
        const tail = 1 - Math.exp(-(t - 2450) / 2800);
        return 0.88 + tail * 0.06;
    }

    function hidePreviewLoadingUi() {
        if (!previewLoadingState.active || previewLoadingState.hidden) {
            return;
        }
        previewLoadingState.hidden = true;
        previewLoadingState.progress = 1;
        previewLoadingState.targetProgress = 1;
        if (previewLoadingState.rafHandle != null) {
            window.cancelAnimationFrame(previewLoadingState.rafHandle);
        }
        previewLoadingState.rafHandle = null;
        if (previewLoadingState.readyRafHandle != null) {
            window.cancelAnimationFrame(previewLoadingState.readyRafHandle);
        }
        previewLoadingState.readyRafHandle = null;
        if (previewLoadingState.hideTimeoutHandle != null) {
            window.clearTimeout(previewLoadingState.hideTimeoutHandle);
        }
        if (previewShellEl) {
            previewShellEl.dataset.previewLoading = 'false';
        }
        previewLoadingEl.classList.add('is-hiding');
        previewLoadingEl.setAttribute('aria-hidden', 'true');
        previewLoadingState.hideTimeoutHandle = window.setTimeout(() => {
            previewLoadingState.hideTimeoutHandle = null;
            previewLoadingEl.hidden = true;
        }, WELCOME_PREVIEW_LOADING_FADE_MS);
    }

    function setPreviewLoadingProgress(nextProgress) {
        if (!previewLoadingState.active) {
            return;
        }
        const progress = clampNumber(nextProgress, 0, 1);
        const percent = Math.round(progress * 100);
        if (previewLoadingFillEl) {
            previewLoadingFillEl.style.width = `${percent}%`;
        }
        if (previewLoadingPercentEl) {
            previewLoadingPercentEl.textContent = `${percent}%`;
        }
        if (previewLoadingProgressEl) {
            previewLoadingProgressEl.setAttribute('aria-valuenow', String(percent));
        }
        if (previewLoadingStatusEl) {
            previewLoadingStatusEl.textContent = resolvePreviewLoadingStatus(progress);
        }
    }

    function resolvePreviewLoadingStatus(progress) {
        if (previewLoadingState.ready || progress >= 0.98) {
            return 'Showroom synchronized.';
        }
        if (progress >= 0.82) {
            return 'Calibrating camera and reflections...';
        }
        if (progress >= 0.58) {
            return 'Linking drivetrain and lighting stacks...';
        }
        if (progress >= 0.34) {
            return 'Assembling body shell and wheel rig...';
        }
        return 'Synchronizing vehicle systems...';
    }

    async function beginStartSequence(mode, startContext = null) {
        if (launchSequenceState.active) {
            return;
        }
        const normalizedMode = mode === 'online' ? 'online' : 'bots';
        const hasLaunchUi = Boolean(
            launchOverlayEl &&
            launchTitleEl &&
            launchStatusEl &&
            launchProgressEl &&
            launchProgressFillEl &&
            launchPercentEl
        );
        if (!hasLaunchUi) {
            onStart?.(normalizedMode, startContext);
            return;
        }
        const token = launchSequenceState.token + 1;
        launchSequenceState.token = token;
        launchSequenceState.active = true;
        launchSequenceState.progress = 0;
        setStartButtonsDisabled(true);
        setStartSequenceUiVisible(true);
        setLaunchCopy(normalizedMode, 0, null);
        setLaunchProgress(0);
        try {
            onStartRequested?.(normalizedMode, startContext);
        } catch {
            // Ignore pre-start hook failures so launch can continue.
        }
        let preparationDone = false;
        let preparationFailed = false;
        let preparationFailureMessage = '';
        let preparationProgress = 0;
        let hasPreparationProgress = false;
        let latestPreparationUpdate = null;
        resolveStartPreparation(normalizedMode, startContext, {
            onProgress(update) {
                latestPreparationUpdate = update;
                const normalizedProgress = resolvePreparationProgress(update);
                if (!Number.isFinite(normalizedProgress)) {
                    return;
                }
                hasPreparationProgress = true;
                preparationProgress = Math.max(preparationProgress, normalizedProgress);
            },
        })
            .then((result) => {
                if (!isPreparationFailureResult(result)) {
                    return;
                }
                preparationFailed = true;
                preparationFailureMessage = resolvePreparationFailureMessage(result);
                latestPreparationUpdate = {
                    stage: 'error',
                    message: preparationFailureMessage,
                    progress: launchSequenceState.progress,
                };
            })
            .catch((error) => {
                preparationFailed = true;
                preparationFailureMessage = resolvePreparationFailureMessage(error);
                latestPreparationUpdate = {
                    stage: 'error',
                    message: preparationFailureMessage,
                    progress: launchSequenceState.progress,
                };
            })
            .finally(() => {
                preparationDone = true;
            });

        await waitForNextFrame();
        if (launchSequenceState.token !== token) {
            return;
        }

        const startTime = performance.now();
        while (launchSequenceState.token === token) {
            const elapsedMs = performance.now() - startTime;
            const timeProgress = clampNumber(elapsedMs / WELCOME_START_SEQUENCE_MIN_MS, 0, 1);
            const rampedProgress = easeOutCubic(timeProgress);
            const cap = preparationDone
                ? WELCOME_START_SEQUENCE_READY_CAP
                : WELCOME_START_SEQUENCE_PREP_CAP;
            const fallbackProgress = rampedProgress * cap;
            const timedFloor = hasPreparationProgress ? rampedProgress * 0.18 : fallbackProgress;
            const sourceProgress = hasPreparationProgress
                ? Math.max(preparationProgress, timedFloor)
                : fallbackProgress;
            const nextProgress = Math.max(
                launchSequenceState.progress,
                clampNumber(sourceProgress, 0, cap)
            );
            setLaunchProgress(nextProgress);
            setLaunchCopy(normalizedMode, nextProgress, latestPreparationUpdate);
            if (
                preparationDone &&
                (preparationFailed || elapsedMs >= WELCOME_START_SEQUENCE_MIN_MS)
            ) {
                break;
            }
            await waitForNextFrame();
        }

        if (launchSequenceState.token !== token) {
            return;
        }

        if (preparationFailed) {
            const failureMessage =
                preparationFailureMessage || 'Session preparation failed. Please try again.';
            latestPreparationUpdate = {
                stage: 'error',
                message: failureMessage,
                progress: launchSequenceState.progress,
            };
            setLaunchCopy(normalizedMode, launchSequenceState.progress, latestPreparationUpdate);
            await sleep(900);
            if (launchSequenceState.token !== token) {
                return;
            }
            launchSequenceState.active = false;
            setStartButtonsDisabled(false);
            resetStartSequenceUi();
            return;
        }

        setLaunchProgress(1);
        setLaunchCopy(normalizedMode, 1, latestPreparationUpdate);
        await sleep(WELCOME_START_SEQUENCE_COMPLETION_DELAY_MS);

        if (launchSequenceState.token !== token) {
            return;
        }

        launchSequenceState.active = false;
        setStartButtonsDisabled(false);
        onStart?.(normalizedMode, startContext);
        if (!rootEl.hidden) {
            resetStartSequenceUi();
        }
    }

    function resolveStartPreparation(mode, startContext = null, options = null) {
        if (typeof onPrepareStart !== 'function') {
            return Promise.resolve();
        }
        try {
            return Promise.resolve(onPrepareStart(mode, startContext, options));
        } catch (error) {
            return Promise.reject(error);
        }
    }

    function cancelStartSequence() {
        launchSequenceState.token += 1;
        launchSequenceState.active = false;
        launchSequenceState.progress = 0;
        setStartButtonsDisabled(false);
        resetStartSequenceUi();
    }

    function resetStartSequenceUi() {
        rootEl.dataset.launching = 'false';
        rootEl.removeAttribute('aria-busy');
        if (launchOverlayEl) {
            launchOverlayEl.hidden = true;
        }
        if (launchTitleEl) {
            launchTitleEl.textContent = 'PREPARING SESSION';
        }
        if (launchStatusEl) {
            launchStatusEl.textContent = 'Initializing race systems...';
        }
        setLaunchProgress(0);
    }

    function setStartSequenceUiVisible(visible) {
        const showOverlay = Boolean(visible && launchOverlayEl);
        rootEl.dataset.launching = showOverlay ? 'true' : 'false';
        if (showOverlay) {
            rootEl.setAttribute('aria-busy', 'true');
            launchOverlayEl.hidden = false;
            return;
        }
        rootEl.removeAttribute('aria-busy');
        if (launchOverlayEl) {
            launchOverlayEl.hidden = true;
        }
    }

    function setStartButtonsDisabled(disabled) {
        const locked = Boolean(disabled);
        startBtnEl.disabled = locked;
        if (startOnlineBtnEl) {
            startOnlineBtnEl.disabled = locked;
        }
        if (hasOnlineStartFlow) {
            onlineContinueBtnEl.disabled = locked || onlineContinueBtnEl.disabled;
            if (!locked) {
                updateOnlineFlowState();
            }
        }
    }

    function setLaunchProgress(nextProgress) {
        const progress = clampNumber(nextProgress, 0, 1);
        launchSequenceState.progress = progress;
        const percent = Math.round(progress * 100);
        if (launchProgressFillEl) {
            launchProgressFillEl.style.width = `${percent}%`;
        }
        if (launchPercentEl) {
            launchPercentEl.textContent = `${percent}%`;
        }
        if (launchProgressEl) {
            launchProgressEl.setAttribute('aria-valuenow', String(percent));
        }
    }

    function setLaunchCopy(mode, progress, preparationUpdate = null) {
        const normalizedMode = mode === 'online' ? 'online' : 'bots';
        if (launchTitleEl) {
            launchTitleEl.textContent =
                normalizedMode === 'online' ? 'CONNECTING SESSION' : 'PREPARING SESSION';
        }
        if (!launchStatusEl) {
            return;
        }
        launchStatusEl.textContent = resolveLaunchStatus(
            normalizedMode,
            progress,
            preparationUpdate
        );
    }

    function resolveLaunchStatus(mode, progress, preparationUpdate = null) {
        const normalizedProgress = clampNumber(progress, 0, 1);
        const preparationStage =
            typeof preparationUpdate?.stage === 'string' ? preparationUpdate.stage : '';
        const preparationMessage =
            typeof preparationUpdate?.message === 'string' ? preparationUpdate.message.trim() : '';
        const audioFilesTotal = Math.max(0, Math.round(Number(preparationUpdate?.filesTotal) || 0));
        const audioFilesDone = Math.max(0, Math.round(Number(preparationUpdate?.filesDone) || 0));
        const audioFilesFailed = Math.max(
            0,
            Math.round(Number(preparationUpdate?.filesFailed) || 0)
        );
        if (preparationStage === 'error') {
            return preparationMessage || 'Session preparation failed. Please try again.';
        }
        if (preparationStage === 'world') {
            return mode === 'online'
                ? 'Building city world and online track state...'
                : 'Building city world and race track...';
        }
        if (preparationStage === 'media' && audioFilesFailed > 0) {
            return `Billboard media missing (${audioFilesFailed}/${audioFilesTotal}).`;
        }
        if (
            preparationStage === 'media' &&
            audioFilesTotal > 0 &&
            audioFilesDone < audioFilesTotal
        ) {
            return `Loading billboard media (${audioFilesDone}/${audioFilesTotal})...`;
        }
        if (preparationStage === 'audio' && audioFilesFailed > 0) {
            return `Gameplay audio missing (${audioFilesFailed}/${audioFilesTotal}).`;
        }
        if (
            preparationStage === 'audio' &&
            audioFilesTotal > 0 &&
            audioFilesDone < audioFilesTotal
        ) {
            return `Loading gameplay audio (${audioFilesDone}/${audioFilesTotal})...`;
        }
        if (normalizedProgress >= 1) {
            return mode === 'online'
                ? 'Room link confirmed. Starting now...'
                : 'Track ready. Launching race...';
        }
        if (normalizedProgress >= 0.88) {
            return mode === 'online'
                ? 'Syncing player state and room snapshot...'
                : 'Balancing bots and objective targets...';
        }
        if (normalizedProgress >= 0.58) {
            return mode === 'online'
                ? 'Checking room and network readiness...'
                : 'Streaming world and systems...';
        }
        return mode === 'online'
            ? 'Initializing online session...'
            : 'Initializing race systems...';
    }

    function resolvePreparationProgress(update) {
        if (Number.isFinite(update)) {
            return clampNumber(update, 0, 1);
        }
        if (!update || typeof update !== 'object') {
            return Number.NaN;
        }

        const progressValue = Number(update.progress);
        if (Number.isFinite(progressValue)) {
            return clampNumber(progressValue, 0, 1);
        }

        const fallbackValue = Number(update.value);
        if (Number.isFinite(fallbackValue)) {
            return clampNumber(fallbackValue, 0, 1);
        }

        return Number.NaN;
    }

    function isPreparationFailureResult(result) {
        if (result === false) {
            return true;
        }
        if (!result || typeof result !== 'object') {
            return false;
        }
        return result.ok === false;
    }

    function resolvePreparationFailureMessage(payload) {
        if (typeof payload === 'string' && payload.trim()) {
            return payload.trim();
        }
        if (payload && typeof payload === 'object') {
            if (typeof payload.message === 'string' && payload.message.trim()) {
                return payload.message.trim();
            }
            if (typeof payload.error === 'string' && payload.error.trim()) {
                return payload.error.trim();
            }
        }
        return 'Session preparation failed. Please try again.';
    }

    function clampNumber(value, min, max) {
        if (!Number.isFinite(value)) {
            return min;
        }
        return Math.min(max, Math.max(min, value));
    }

    function waitForNextFrame() {
        return new Promise((resolve) => {
            window.requestAnimationFrame(() => resolve());
        });
    }

    function sleep(timeoutMs = 0) {
        const ms = Math.max(0, Math.round(Number(timeoutMs) || 0));
        return new Promise((resolve) => {
            window.setTimeout(resolve, ms);
        });
    }

    function setAuthState(nextState = null) {
        authUiState = normalizeWelcomeAuthState(nextState);
        if (authUiState.authenticated && authUiState.displayName) {
            writeStoredOnlinePlayerName(authUiState.displayName);
        }
        if (!authUiState.authenticated) {
            setPasswordChangeOpen(false, {
                clearInputs: true,
                skipSync: true,
            });
        }
        if (!authUiState.authenticated && hasOnlineStartFlow && !onlineModeFlowEl.hidden) {
            closeOnlineModeFlow({ clearSelection: true });
        }
        if (authUiState.requiresEmailConfirmation) {
            authMode = 'sign-in';
        }
        clearLocalAuthStatus();
        syncAuthUi();
    }

    function syncAuthUi() {
        if (!hasAuthPanel) {
            return;
        }

        const authenticated = Boolean(authUiState.authenticated);
        const enabled = Boolean(authUiState.enabled);
        const busy = Boolean(authUiState.loading);
        const showSignUp = authMode === 'sign-up';
        const canChangePassword =
            authenticated &&
            enabled &&
            typeof onAuthChangePassword === 'function' &&
            Boolean(
                authChangePasswordToggleBtnEl &&
                authPasswordChangePanelEl &&
                authNewPasswordInputEl &&
                authConfirmNewPasswordInputEl &&
                authPasswordChangeSubmitBtnEl &&
                authPasswordChangeCancelBtnEl
            );
        const canManageProfileImage =
            authenticated &&
            enabled &&
            Boolean(authUiState.profileImageEnabled && authAvatarInputEl && authAvatarUploadBtnEl);
        const hasProfileImage = Boolean(authUiState.avatarUrl);
        const localStatus = authLocalStatusText.trim();
        const remoteStatus =
            typeof authUiState.statusText === 'string' ? authUiState.statusText.trim() : '';
        const statusText =
            localStatus ||
            remoteStatus ||
            (authenticated
                ? 'Signed in. Online rooms and score sync are unlocked.'
                : 'Create an account or sign in to unlock online rooms and score sync.');
        const statusTone =
            localStatus && authLocalStatusTone ? authLocalStatusTone : authUiState.statusTone;

        authPanelEl.dataset.authenticated = authenticated ? 'true' : 'false';
        authPanelEl.dataset.authMode = showSignUp ? 'sign-up' : 'sign-in';
        authSignInTabEl.dataset.selected = !showSignUp ? 'true' : 'false';
        authSignUpTabEl.dataset.selected = showSignUp ? 'true' : 'false';
        authSignInTabEl.setAttribute('aria-selected', !showSignUp ? 'true' : 'false');
        authSignUpTabEl.setAttribute('aria-selected', showSignUp ? 'true' : 'false');
        authSignInTabEl.disabled = busy || !enabled || authenticated;
        authSignUpTabEl.disabled = busy || !enabled || authenticated;
        authSignedOutViewEl.hidden = authenticated;
        authSignedInViewEl.hidden = !authenticated;
        if (authDisplayNameFieldEl) {
            authDisplayNameFieldEl.hidden = !showSignUp;
        }
        if (authConfirmFieldEl) {
            authConfirmFieldEl.hidden = !showSignUp;
        }
        if (authSignedInNameEl) {
            authSignedInNameEl.textContent = 'ONLINE';
        }
        if (authSignedInEmailEl) {
            authSignedInEmailEl.textContent = authUiState.email || 'Authenticated session';
        }
        if (authAvatarFrameEl) {
            authAvatarFrameEl.dataset.hasImage = hasProfileImage ? 'true' : 'false';
        }
        if (authAvatarFallbackEl) {
            authAvatarFallbackEl.textContent = resolveProfileImageFallbackLabel(authUiState);
            authAvatarFallbackEl.hidden = hasProfileImage;
        }
        if (authAvatarImageEl) {
            if (hasProfileImage) {
                if (authAvatarImageEl.getAttribute('src') !== authUiState.avatarUrl) {
                    authAvatarImageEl.src = authUiState.avatarUrl;
                }
                authAvatarImageEl.hidden = false;
            } else {
                authAvatarImageEl.hidden = true;
                authAvatarImageEl.removeAttribute('src');
            }
        }
        if (previewAccountTitleEl) {
            previewAccountTitleEl.textContent = authUiState.displayName || 'ACCOUNT';
        }
        if (authChangePasswordToggleBtnEl) {
            authChangePasswordToggleBtnEl.hidden = !canChangePassword;
            authChangePasswordToggleBtnEl.disabled = !canChangePassword || busy;
            authChangePasswordToggleBtnEl.dataset.open =
                canChangePassword && authPasswordChangeOpen ? 'true' : 'false';
            authChangePasswordToggleBtnEl.textContent = authPasswordChangeOpen
                ? 'HIDE PASSWORD FORM'
                : 'CHANGE PASSWORD';
        }
        if (authPasswordChangePanelEl) {
            authPasswordChangePanelEl.hidden = !canChangePassword || !authPasswordChangeOpen;
        }
        if (authAvatarInputEl) {
            authAvatarInputEl.disabled = !canManageProfileImage || busy;
        }
        if (authAvatarUploadBtnEl) {
            authAvatarUploadBtnEl.hidden = !authenticated || !authUiState.profileImageEnabled;
            authAvatarUploadBtnEl.disabled =
                !canManageProfileImage || busy || typeof onAuthUpdateProfileImage !== 'function';
            authAvatarUploadBtnEl.textContent =
                busy && authUiState.pendingAction === 'update-avatar'
                    ? 'UPLOADING PHOTO...'
                    : hasProfileImage
                      ? 'CHANGE PHOTO'
                      : 'ADD PHOTO';
        }
        if (authAvatarRemoveBtnEl) {
            authAvatarRemoveBtnEl.hidden = !authenticated || !authUiState.profileImageEnabled;
            authAvatarRemoveBtnEl.disabled =
                !canManageProfileImage ||
                busy ||
                !hasProfileImage ||
                typeof onAuthRemoveProfileImage !== 'function';
            authAvatarRemoveBtnEl.textContent =
                busy && authUiState.pendingAction === 'remove-avatar'
                    ? 'REMOVING PHOTO...'
                    : 'REMOVE PHOTO';
        }
        if (authDisplayNameInputEl && !authDisplayNameInputEl.value) {
            authDisplayNameInputEl.value = sanitizeOnlinePlayerNameInput(
                authUiState.displayName || readStoredOnlinePlayerName()
            );
        }
        if (authEmailInputEl && !authenticated && authUiState.email) {
            authEmailInputEl.value = sanitizeAuthEmailInput(authUiState.email);
        }
        if (authStatusEl) {
            authStatusEl.textContent = statusText;
            authStatusEl.dataset.tone = statusTone || 'muted';
        }
        if (authSubmitBtnEl) {
            authSubmitBtnEl.disabled = authenticated || busy || !enabled;
            authSubmitBtnEl.textContent = busy
                ? authMode === 'sign-up'
                    ? 'CREATING ACCOUNT...'
                    : 'SIGNING IN...'
                : authMode === 'sign-up'
                  ? 'CREATE ACCOUNT'
                  : 'SIGN IN';
        }
        if (authDisplayNameInputEl) {
            authDisplayNameInputEl.disabled = authenticated || busy || !enabled;
        }
        authEmailInputEl.disabled = authenticated || busy || !enabled;
        authPasswordInputEl.disabled = authenticated || busy || !enabled;
        if (authConfirmPasswordInputEl) {
            authConfirmPasswordInputEl.disabled = authenticated || busy || !enabled;
        }
        if (authNewPasswordInputEl) {
            authNewPasswordInputEl.disabled =
                !authenticated || !enabled || busy || !authPasswordChangeOpen;
        }
        if (authConfirmNewPasswordInputEl) {
            authConfirmNewPasswordInputEl.disabled =
                !authenticated || !enabled || busy || !authPasswordChangeOpen;
        }
        if (authPasswordChangeSubmitBtnEl) {
            authPasswordChangeSubmitBtnEl.disabled =
                !canChangePassword || busy || !authPasswordChangeOpen;
            authPasswordChangeSubmitBtnEl.textContent =
                busy && authUiState.pendingAction === 'change-password'
                    ? 'UPDATING PASSWORD...'
                    : 'UPDATE PASSWORD';
        }
        if (authPasswordChangeCancelBtnEl) {
            authPasswordChangeCancelBtnEl.disabled =
                !canChangePassword || busy || !authPasswordChangeOpen;
        }
        if (authSignOutBtnEl) {
            authSignOutBtnEl.disabled = !authenticated || busy;
        }
        if (authDeleteAccountBtnEl) {
            authDeleteAccountBtnEl.disabled = !authenticated || busy;
            authDeleteAccountBtnEl.textContent =
                busy && authUiState.pendingAction === 'delete-account'
                    ? 'DELETING ACCOUNT...'
                    : 'DELETE ACCOUNT';
        }
        if (startOnlineBtnEl) {
            startOnlineBtnEl.dataset.authRequired = authenticated ? 'false' : 'true';
        }
        if (hasOnlineStartFlow) {
            updateOnlineFlowState();
        }
    }

    function handleWelcomeGlobalKeydown(event) {
        if (event.key !== 'Escape' || rootEl.hidden) {
            return;
        }
        if (hasOnlineStartFlow && !onlineModeFlowEl.hidden) {
            closeOnlineModeFlow({ clearSelection: true });
            return;
        }
        if (welcomeDonateOpen) {
            requestWelcomeDonateClose();
            return;
        }
        if (welcomeAccountOpen) {
            setWelcomeAccountOpen(false);
            return;
        }
        if (welcomeLeaderboardOpen) {
            setWelcomeLeaderboardOpen(false);
        }
    }

    async function handleWelcomeLeaderboardToggle() {
        if (launchSequenceState.active) {
            return;
        }
        if (welcomeLeaderboardOpen) {
            setWelcomeLeaderboardOpen(false);
            return;
        }
        setWelcomeAccountOpen(false);
        requestWelcomeDonateClose();
        closeOnlineModeFlow({ clearSelection: true });
        setWelcomeLeaderboardOpen(true);
        await requestWelcomeLeaderboardRefresh();
    }

    function handleWelcomeAccountToggle() {
        if (launchSequenceState.active) {
            return;
        }
        if (welcomeAccountOpen) {
            setWelcomeAccountOpen(false);
            return;
        }
        setWelcomeLeaderboardOpen(false);
        requestWelcomeDonateClose();
        closeOnlineModeFlow({ clearSelection: true });
        setWelcomeAccountOpen(true);
        focusAuthPanel(authMode, {
            preserveStatus: true,
            openOverlay: false,
        });
    }

    function requestWelcomeDonateClose() {
        document.dispatchEvent(new CustomEvent(WELCOME_DONATE_CLOSE_EVENT));
    }

    async function requestWelcomeLeaderboardRefresh() {
        if (typeof onRefreshGlobalLeaderboard !== 'function') {
            return;
        }
        try {
            await Promise.resolve(onRefreshGlobalLeaderboard());
        } catch {
            // The shared leaderboard controller already owns status messaging.
        }
    }

    function setWelcomeLeaderboardOpen(nextOpen, options = {}) {
        welcomeLeaderboardOpen = Boolean(
            nextOpen &&
            leaderboardBtnEl &&
            previewShellEl &&
            previewLeaderboardOverlayEl &&
            previewLeaderboardStatusEl &&
            previewLeaderboardListEl
        );
        if (!options.skipSync) {
            syncWelcomeLeaderboardUi();
        }
    }

    function syncWelcomeLeaderboardUi() {
        const hasWelcomeLeaderboard = Boolean(
            leaderboardBtnEl &&
            previewShellEl &&
            previewLeaderboardOverlayEl &&
            previewLeaderboardStatusEl &&
            previewLeaderboardListEl
        );
        if (!hasWelcomeLeaderboard) {
            return;
        }

        previewShellEl.dataset.leaderboardOpen = welcomeLeaderboardOpen ? 'true' : 'false';
        leaderboardBtnEl.dataset.open = welcomeLeaderboardOpen ? 'true' : 'false';
        leaderboardBtnEl.setAttribute('aria-expanded', welcomeLeaderboardOpen ? 'true' : 'false');
        previewLeaderboardOverlayEl.hidden = !welcomeLeaderboardOpen;

        if (previewLeaderboardRefreshBtnEl) {
            previewLeaderboardRefreshBtnEl.disabled = Boolean(
                welcomeGlobalLeaderboardState.loading
            );
        }
        if (previewLeaderboardStatusEl) {
            const fallbackStatus = welcomeGlobalLeaderboardState.loading
                ? 'Refreshing global player leaderboard...'
                : welcomeGlobalLeaderboardState.entries.length > 0
                  ? ''
                  : 'Open the board and finish a round to seed the first player scores.';
            const statusText =
                typeof welcomeGlobalLeaderboardState.statusText === 'string' &&
                welcomeGlobalLeaderboardState.statusText.trim()
                    ? welcomeGlobalLeaderboardState.statusText.trim()
                    : fallbackStatus;
            previewLeaderboardStatusEl.textContent = statusText;
            previewLeaderboardStatusEl.hidden = !statusText;
            previewLeaderboardStatusEl.dataset.tone = resolveWelcomeLeaderboardTone(
                welcomeGlobalLeaderboardState
            );
        }
        if (previewLeaderboardListEl) {
            previewLeaderboardListEl.innerHTML = buildWelcomeLeaderboardListHtml(
                welcomeGlobalLeaderboardState,
                leaderboardNumberFormatter
            );
        }
    }

    function setWelcomeAccountOpen(nextOpen, options = {}) {
        welcomeAccountOpen = Boolean(
            nextOpen &&
            accountBtnEl &&
            previewShellEl &&
            previewAccountOverlayEl &&
            previewAccountBodyEl &&
            authPanelEl
        );
        if (!options.skipSync) {
            syncWelcomeAccountUi();
        }
    }

    function syncWelcomeAccountUi() {
        const hasWelcomeAccount = Boolean(
            accountBtnEl &&
            previewShellEl &&
            previewAccountOverlayEl &&
            previewAccountBodyEl &&
            authPanelEl
        );
        if (!hasWelcomeAccount) {
            return;
        }

        previewShellEl.dataset.accountOpen = welcomeAccountOpen ? 'true' : 'false';
        accountBtnEl.dataset.open = welcomeAccountOpen ? 'true' : 'false';
        accountBtnEl.setAttribute('aria-expanded', welcomeAccountOpen ? 'true' : 'false');
        previewAccountOverlayEl.hidden = !welcomeAccountOpen;
    }

    function setWelcomeDonateOpen(nextOpen, options = {}) {
        welcomeDonateOpen = Boolean(
            nextOpen && donateBtnEl && previewShellEl && previewDonateOverlayEl
        );
        if (!options.skipSync) {
            syncWelcomeDonateUi();
        }
    }

    function syncWelcomeDonateUi() {
        const hasWelcomeDonate = Boolean(donateBtnEl && previewShellEl && previewDonateOverlayEl);
        if (!hasWelcomeDonate) {
            return;
        }

        previewShellEl.dataset.donateOpen = welcomeDonateOpen ? 'true' : 'false';
        donateBtnEl.dataset.open = welcomeDonateOpen ? 'true' : 'false';
        donateBtnEl.setAttribute('aria-expanded', welcomeDonateOpen ? 'true' : 'false');
        previewDonateOverlayEl.hidden = !welcomeDonateOpen;
    }

    function syncWelcomeOnlineUi() {
        const hasWelcomeOnline = Boolean(
            hasOnlineStartFlow && startOnlineBtnEl && previewShellEl && previewOnlineOverlayEl
        );
        if (!hasWelcomeOnline) {
            return;
        }

        const isOpen = !onlineModeFlowEl.hidden;
        previewShellEl.dataset.onlineOpen = isOpen ? 'true' : 'false';
        startOnlineBtnEl.dataset.open = isOpen ? 'true' : 'false';
        startOnlineBtnEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        previewOnlineOverlayEl.hidden = !isOpen;
    }

    function setAuthMode(nextMode = 'sign-in', options = {}) {
        authMode = nextMode === 'sign-up' ? 'sign-up' : 'sign-in';
        if (!options.preserveStatus) {
            clearLocalAuthStatus();
        }
        syncAuthUi();
        if (options.focusField) {
            focusAuthPanel(authMode);
        }
    }

    function focusAuthPanel(mode = authMode, options = {}) {
        if (!hasAuthPanel) {
            return;
        }
        if (options.openOverlay !== false) {
            setWelcomeLeaderboardOpen(false);
            requestWelcomeDonateClose();
            closeOnlineModeFlow({ clearSelection: true });
            setWelcomeAccountOpen(true);
        }
        setAuthMode(mode, {
            focusField: false,
            preserveStatus: Boolean(options.preserveStatus),
        });
        if (authUiState.authenticated) {
            if (
                authPasswordChangeOpen &&
                authNewPasswordInputEl &&
                !authNewPasswordInputEl.disabled
            ) {
                authNewPasswordInputEl.focus();
                authNewPasswordInputEl.select?.();
                return;
            }
            authSignOutBtnEl?.focus();
            return;
        }
        const focusTarget =
            authMode === 'sign-up' ? authDisplayNameInputEl || authEmailInputEl : authEmailInputEl;
        focusTarget?.focus();
        focusTarget?.select?.();
    }

    async function handleAuthSubmit() {
        if (!hasAuthPanel || authUiState.loading) {
            return;
        }
        if (!authUiState.enabled) {
            setLocalAuthStatus('Supabase auth is unavailable on this server.', 'error');
            return;
        }

        const displayName = sanitizeOnlinePlayerNameInput(authDisplayNameInputEl?.value || '');
        const email = sanitizeAuthEmailInput(authEmailInputEl?.value || '');
        const password = String(authPasswordInputEl?.value || '');
        const confirmPassword = String(authConfirmPasswordInputEl?.value || '');
        if (authMode === 'sign-up' && !displayName) {
            setLocalAuthStatus('Choose a display name.', 'error');
            authDisplayNameInputEl?.focus();
            return;
        }
        if (!isValidAuthEmail(email)) {
            setLocalAuthStatus('Enter a valid email address.', 'error');
            authEmailInputEl?.focus();
            return;
        }
        if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
            setLocalAuthStatus(
                `Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters.`,
                'error'
            );
            authPasswordInputEl?.focus();
            return;
        }
        if (authMode === 'sign-up' && password !== confirmPassword) {
            setLocalAuthStatus('Passwords do not match.', 'error');
            authConfirmPasswordInputEl?.focus();
            return;
        }

        clearLocalAuthStatus();
        syncAuthUi();

        const response = await Promise.resolve(
            onAuthSubmit?.(authMode, {
                displayName: displayName || DEFAULT_ONLINE_PLAYER_NAME,
                email,
                password,
            })
        ).catch((error) => ({
            ok: false,
            error: error?.message || 'Authentication request failed.',
        }));

        authPasswordInputEl.value = '';
        if (authConfirmPasswordInputEl) {
            authConfirmPasswordInputEl.value = '';
        }

        if (!response?.ok && response?.error) {
            setLocalAuthStatus(String(response.error), 'error');
            syncAuthUi();
            return;
        }
        if (response?.requiresEmailConfirmation) {
            authMode = 'sign-in';
        }
        syncAuthUi();
    }

    async function handleAuthSignOut() {
        if (authUiState.loading) {
            return;
        }
        clearLocalAuthStatus();
        syncAuthUi();
        await Promise.resolve(onAuthSignOut?.()).catch(() => {
            setLocalAuthStatus('Could not sign out right now.', 'error');
        });
        syncAuthUi();
    }

    async function handleProfileImageSelection() {
        if (
            authUiState.loading ||
            !authUiState.authenticated ||
            !authUiState.profileImageEnabled ||
            typeof onAuthUpdateProfileImage !== 'function'
        ) {
            if (authAvatarInputEl) {
                authAvatarInputEl.value = '';
            }
            return;
        }

        const file = authAvatarInputEl?.files?.[0] || null;
        if (!file) {
            return;
        }

        clearLocalAuthStatus();
        syncAuthUi();

        const response = await Promise.resolve(onAuthUpdateProfileImage(file)).catch((error) => ({
            ok: false,
            error: error?.message || 'Could not update the profile photo.',
        }));

        if (authAvatarInputEl) {
            authAvatarInputEl.value = '';
        }
        if (!response?.ok && response?.error) {
            setLocalAuthStatus(String(response.error), 'error');
            syncAuthUi();
            return;
        }
        syncAuthUi();
    }

    async function handleProfileImageRemoval() {
        if (
            authUiState.loading ||
            !authUiState.authenticated ||
            !authUiState.avatarUrl ||
            typeof onAuthRemoveProfileImage !== 'function'
        ) {
            return;
        }

        clearLocalAuthStatus();
        syncAuthUi();

        const response = await Promise.resolve(onAuthRemoveProfileImage()).catch((error) => ({
            ok: false,
            error: error?.message || 'Could not remove the profile photo.',
        }));

        if (!response?.ok && response?.error) {
            setLocalAuthStatus(String(response.error), 'error');
            syncAuthUi();
            return;
        }
        syncAuthUi();
    }

    function handlePasswordChangeToggle() {
        if (!authUiState.authenticated || authUiState.loading || !authUiState.enabled) {
            return;
        }
        clearLocalAuthStatus();
        setPasswordChangeOpen(!authPasswordChangeOpen, {
            clearInputs: !authPasswordChangeOpen,
        });
        if (authPasswordChangeOpen) {
            authNewPasswordInputEl?.focus();
            authNewPasswordInputEl?.select?.();
        }
    }

    function handlePasswordChangeCancel() {
        if (authUiState.loading) {
            return;
        }
        clearLocalAuthStatus();
        setPasswordChangeOpen(false, {
            clearInputs: true,
        });
    }

    async function handlePasswordChangeSubmit() {
        if (
            !authUiState.authenticated ||
            authUiState.loading ||
            !authUiState.enabled ||
            typeof onAuthChangePassword !== 'function'
        ) {
            return;
        }

        const password = String(authNewPasswordInputEl?.value || '');
        const confirmPassword = String(authConfirmNewPasswordInputEl?.value || '');
        if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
            setLocalAuthStatus(
                `Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters.`,
                'error'
            );
            authNewPasswordInputEl?.focus();
            return;
        }
        if (password !== confirmPassword) {
            setLocalAuthStatus('Passwords do not match.', 'error');
            authConfirmNewPasswordInputEl?.focus();
            return;
        }

        clearLocalAuthStatus();
        syncAuthUi();

        const response = await Promise.resolve(
            onAuthChangePassword({
                password,
            })
        ).catch((error) => ({
            ok: false,
            error: error?.message || 'Could not update the password.',
        }));

        if (!response?.ok && response?.error) {
            setLocalAuthStatus(String(response.error), 'error');
            syncAuthUi();
            return;
        }

        clearLocalAuthStatus();
        setPasswordChangeOpen(false, {
            clearInputs: true,
        });
    }

    async function handleDeleteAccount() {
        if (!hasAuthPanel || authUiState.loading || !authUiState.authenticated) {
            return;
        }
        const confirmed = window.confirm(
            'Delete this account permanently? This also removes your saved leaderboard entries.'
        );
        if (!confirmed) {
            return;
        }
        const confirmationText = window.prompt('Type DELETE to confirm account deletion.', '');
        if (
            String(confirmationText || '')
                .trim()
                .toUpperCase() !== 'DELETE'
        ) {
            setLocalAuthStatus('Account deletion was cancelled.', 'info');
            syncAuthUi();
            return;
        }

        clearLocalAuthStatus();
        syncAuthUi();
        const response = await Promise.resolve(onAuthDeleteAccount?.()).catch((error) => ({
            ok: false,
            error: error?.message || 'Could not delete account.',
        }));
        if (!response?.ok && response?.error) {
            setLocalAuthStatus(String(response.error), 'error');
        }
        syncAuthUi();
    }

    function handleAuthFieldKeydown(event) {
        if (event.key !== 'Enter') {
            return;
        }
        event.preventDefault();
        void handleAuthSubmit();
    }

    function handlePasswordChangeFieldKeydown(event) {
        if (event.key !== 'Enter') {
            return;
        }
        event.preventDefault();
        void handlePasswordChangeSubmit();
    }

    function setPasswordChangeOpen(nextOpen, options = {}) {
        const canOpen =
            Boolean(nextOpen) &&
            authUiState.authenticated &&
            authUiState.enabled &&
            typeof onAuthChangePassword === 'function' &&
            Boolean(
                authPasswordChangePanelEl &&
                authNewPasswordInputEl &&
                authConfirmNewPasswordInputEl &&
                authPasswordChangeSubmitBtnEl &&
                authPasswordChangeCancelBtnEl
            );
        authPasswordChangeOpen = canOpen;
        if (!authPasswordChangeOpen || options.clearInputs) {
            resetPasswordChangeInputs();
        }
        if (!options.skipSync) {
            syncAuthUi();
        }
    }

    function resetPasswordChangeInputs() {
        if (authNewPasswordInputEl) {
            authNewPasswordInputEl.value = '';
        }
        if (authConfirmNewPasswordInputEl) {
            authConfirmNewPasswordInputEl.value = '';
        }
    }

    function setLocalAuthStatus(message, tone = 'info') {
        authLocalStatusText = typeof message === 'string' ? message.trim() : '';
        authLocalStatusTone = tone || 'info';
    }

    function clearLocalAuthStatus() {
        authLocalStatusText = '';
        authLocalStatusTone = 'muted';
    }

    function isOnlineStartAuthorized() {
        if (!hasAuthPanel) {
            return true;
        }
        return Boolean(authUiState.enabled && authUiState.authenticated);
    }

    function openOnlineModeFlow() {
        if (launchSequenceState.active) {
            return;
        }
        if (!isOnlineStartAuthorized()) {
            setLocalAuthStatus('Sign in to create or join an online room.', 'info');
            syncAuthUi();
            focusAuthPanel('sign-in', { preserveStatus: true });
            return;
        }
        setWelcomeLeaderboardOpen(false);
        setWelcomeAccountOpen(false);
        requestWelcomeDonateClose();
        preferredStartMode = 'online';
        if (!hasOnlineStartFlow) {
            return;
        }
        syncOnlinePlayerNameFromStorage();
        onlineModeFlowEl.hidden = false;
        rootEl.dataset.onlineFlowOpen = 'true';
        setOnlineRoomAction('create');
        syncWelcomeOnlineUi();
        document.dispatchEvent(new CustomEvent(WELCOME_ONLINE_OPEN_EVENT));
    }

    function closeOnlineModeFlow(options = {}) {
        if (launchSequenceState.active) {
            return;
        }
        if (!hasOnlineStartFlow) {
            return;
        }
        const { clearSelection = false } = options;
        onlineModeFlowEl.hidden = true;
        rootEl.dataset.onlineFlowOpen = 'false';
        if (clearSelection) {
            clearCustomCreateCodeLookup();
            clearContinueButtonGlint();
            preferredOnlineRoomAction = '';
            preferredOnlineRoomCode = '';
            syncOnlinePlayerNameFromStorage();
            onlineRoomCodeInputEl.value = '';
            onlineRoomCodeInputEl.disabled = true;
            onlineCreateChoiceBtnEl.dataset.selected = 'false';
            onlineJoinChoiceBtnEl.dataset.selected = 'false';
            onlineContinueBtnEl.disabled = true;
            setCustomCreateCodeStatus('idle', '');
            preferredStartMode = 'bots';
        }
        syncWelcomeOnlineUi();
        document.dispatchEvent(new CustomEvent(WELCOME_ONLINE_CLOSE_EVENT));
    }

    function setOnlineRoomAction(nextAction, options = {}) {
        if (launchSequenceState.active) {
            return;
        }
        if (!hasOnlineStartFlow) {
            return;
        }
        const { focusRoomInput = false } = options;
        preferredStartMode = 'online';
        preferredOnlineRoomAction = nextAction === 'join' ? 'join' : 'create';
        onlineCreateChoiceBtnEl.dataset.selected =
            preferredOnlineRoomAction === 'create' ? 'true' : 'false';
        onlineJoinChoiceBtnEl.dataset.selected =
            preferredOnlineRoomAction === 'join' ? 'true' : 'false';
        onlineRoomCodeInputEl.disabled = false;
        preferredOnlineRoomCode = normalizeOnlineRoomCode(onlineRoomCodeInputEl.value);
        onlineRoomCodeInputEl.value = preferredOnlineRoomCode;
        if (onlineRoomCodeLabelEl) {
            onlineRoomCodeLabelEl.textContent =
                preferredOnlineRoomAction === 'join'
                    ? 'ROOM CODE'
                    : 'ROOM CODE (OPTIONAL FOR CREATE)';
        }
        if (focusRoomInput) {
            onlineRoomCodeInputEl.focus();
            onlineRoomCodeInputEl.select();
        }
        queueCustomCreateCodeAvailabilityLookup();
        updateOnlineFlowState();
    }

    function updateOnlineFlowState() {
        if (!hasOnlineStartFlow) {
            return;
        }
        if (launchSequenceState.active || !isOnlineStartAuthorized()) {
            onlineContinueBtnEl.disabled = true;
            return;
        }
        const normalizedCode = normalizeOnlineRoomCode(preferredOnlineRoomCode);
        const isCustomCreateCodeAvailable =
            customCreateCodeStatus === 'available' &&
            customCreateCodeStatusCode === normalizedCode &&
            normalizedCode.length === ONLINE_ROOM_CODE_LENGTH;
        const isJoinRoomAvailable =
            customCreateCodeStatus === 'occupied' &&
            customCreateCodeStatusCode === normalizedCode &&
            normalizedCode.length === ONLINE_ROOM_CODE_LENGTH;
        const canContinue =
            (preferredOnlineRoomAction === 'create' &&
                (normalizedCode.length === 0 || isCustomCreateCodeAvailable)) ||
            (preferredOnlineRoomAction === 'join' &&
                normalizedCode.length === ONLINE_ROOM_CODE_LENGTH &&
                isJoinRoomAvailable);
        onlineContinueBtnEl.disabled = !canContinue;
    }

    function handleOnlineFlowContinue() {
        if (launchSequenceState.active) {
            return;
        }
        if (!hasOnlineStartFlow) {
            return;
        }
        const startContext =
            preferredOnlineRoomAction === 'create'
                ? {
                      roomAction: 'create',
                      roomCode: normalizeOnlineRoomCode(preferredOnlineRoomCode),
                      playerName: sanitizeOnlinePlayerNameSubmit(preferredOnlinePlayerName),
                  }
                : {
                      roomAction: 'join',
                      roomCode: normalizeOnlineRoomCode(preferredOnlineRoomCode),
                      playerName: sanitizeOnlinePlayerNameSubmit(preferredOnlinePlayerName),
                  };
        if (
            (startContext.roomAction === 'join' &&
                (startContext.roomCode.length !== ONLINE_ROOM_CODE_LENGTH ||
                    customCreateCodeStatus !== 'occupied' ||
                    customCreateCodeStatusCode !== startContext.roomCode)) ||
            (startContext.roomAction === 'create' &&
                startContext.roomCode.length > 0 &&
                (startContext.roomCode.length !== ONLINE_ROOM_CODE_LENGTH ||
                    customCreateCodeStatus !== 'available' ||
                    customCreateCodeStatusCode !== startContext.roomCode))
        ) {
            queueCustomCreateCodeAvailabilityLookup();
            updateOnlineFlowState();
            onlineRoomCodeInputEl.focus();
            return;
        }
        beginStartSequence('online', startContext);
    }

    function syncPreviewSize() {
        const width = Math.max(
            1,
            Math.round(previewCanvasEl.clientWidth || previewCanvasEl.width || 560)
        );
        const height = Math.max(
            1,
            Math.round(previewCanvasEl.clientHeight || previewCanvasEl.height || 300)
        );
        previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        previewRenderer.setSize(width, height, false);
        previewCamera.aspect = width / height;
        previewCamera.updateProjectionMatrix();
    }

    function renderPreview() {
        previewRenderer.render(previewScene, previewCamera);
    }

    function updatePreviewVisualState(dt) {
        previewPulseTime += Math.min(Math.max(dt || 0, 0), 0.05);
        const throttleWave = 0.5 + 0.5 * Math.sin(previewPulseTime * 1.2);
        const brakeWave = 0.5 + 0.5 * Math.sin(previewPulseTime * 2.6 + 0.4);
        const steerWave = Math.sin(previewPulseTime * 0.92);
        const launchWave = 0.5 + 0.5 * Math.sin(previewPulseTime * 1.8 + 0.9);
        const batteryWave = 0.5 + 0.5 * Math.sin(previewPulseTime * 0.22 + 0.7);

        previewState.throttle = 0.46 + throttleWave * 0.46;
        previewState.brake = 0.14 + brakeWave * 0.56;
        previewState.steerInput = steerWave * 0.38;
        previewState.launchSlip = 0.12 + launchWave * 0.26;
        previewState.burnout = launchWave * 0.12;
        previewState.speed = WELCOME_PREVIEW_STATE_SPEED + throttleWave * 6;
        previewState.velocity.set(0, -previewState.speed);
        previewState.acceleration = 3.4 * Math.sin(previewPulseTime * 1.42 + 0.15);
        previewState.yawRate = steerWave * 0.22;

        for (let i = 0; i < previewVehicles.length; i += 1) {
            previewVehicles[i].rig.setBatteryLevel(0.34 + batteryWave * 0.62);
            previewVehicles[i].rig.updateVisuals(previewState, dt || 1 / 60);
        }
    }

    function updateShowroomAtmosphere(dt) {
        const safeDt = Math.min(Math.max(dt || 0, 0), 0.05);
        showroomAtmosphere.timeSec += safeDt;
        const motionTime = showroomAtmosphere.timeSec;

        const backdropParallaxTarget = -transition.cameraKick * 0.2;
        showroomAtmosphere.backdropGroup.position.x = THREE.MathUtils.lerp(
            showroomAtmosphere.backdropGroup.position.x,
            backdropParallaxTarget,
            1 - Math.exp(-7 * safeDt)
        );
        showroomAtmosphere.backdropGroup.position.y = Math.sin(motionTime * 0.15 + 0.4) * 0.02;

        const breath = 0.5 + 0.5 * Math.sin(motionTime * 0.7);
        const shimmer = 0.5 + 0.5 * Math.sin(motionTime * 0.42 + 1.1);

        showroomAtmosphere.cycloramaMaterial.opacity = 0.94 + breath * 0.03;
        showroomAtmosphere.backdropSoftLightMaterial.opacity =
            0.14 + shimmer * 0.08 + transition.glowBoost * 0.04;
        showroomAtmosphere.floorSheenMaterial.opacity = 0.15 + breath * 0.05;
        showroomAtmosphere.accentHalo.material.opacity =
            0.08 + breath * 0.06 + transition.glowBoost * 0.05;
        showroomAtmosphere.accentHalo.scale.setScalar(1 + breath * 0.015);

        keyLight.intensity = 1.18 + breath * 0.08;
        rimLight.intensity = 0.9 + shimmer * 0.08;
        kickerLight.intensity = 0.26 + breath * 0.08;
        fillLight.intensity = 0.34 + shimmer * 0.06;

        showroomAtmosphere.particles.rotation.y += safeDt * 0.014;
        showroomAtmosphere.particles.rotation.x = Math.sin(motionTime * 0.12) * 0.01;
    }

    function updateTaglineRotation(dt) {
        if (!taglineEl || WELCOME_TAGLINE_VARIANTS.length <= 1) {
            return;
        }
        taglineRotation.elapsedSec += Math.max(dt || 0, 0);
        if (taglineRotation.elapsedSec < WELCOME_TAGLINE_ROTATION_INTERVAL_SEC) {
            return;
        }
        taglineRotation.elapsedSec = 0;
        taglineRotation.activeIndex =
            (taglineRotation.activeIndex + 1) % WELCOME_TAGLINE_VARIANTS.length;
        setTaglineByIndex(taglineRotation.activeIndex, { animate: true });
    }

    function resetTaglineTransition() {
        if (!taglineEl) {
            return;
        }
        if (taglineRotation.transitionTimer !== null) {
            window.clearTimeout(taglineRotation.transitionTimer);
            taglineRotation.transitionTimer = null;
        }
        taglineRotation.isTransitioning = false;
        taglineRotation.queuedIndex = null;
        taglineEl.classList.remove('tagline-transition-out', 'tagline-transition-in');
    }

    function setTaglineByIndex(index, options = {}) {
        if (!taglineEl || !WELCOME_TAGLINE_VARIANTS.length) {
            return;
        }
        const { animate = false } = options;
        const safeIndex =
            ((Math.floor(index) % WELCOME_TAGLINE_VARIANTS.length) +
                WELCOME_TAGLINE_VARIANTS.length) %
            WELCOME_TAGLINE_VARIANTS.length;
        const nextText = WELCOME_TAGLINE_VARIANTS[safeIndex];
        if (!animate) {
            taglineEl.textContent = nextText;
            return;
        }
        if (taglineRotation.isTransitioning) {
            taglineRotation.queuedIndex = safeIndex;
            return;
        }

        taglineRotation.isTransitioning = true;
        taglineEl.classList.remove('tagline-transition-in');
        void taglineEl.offsetWidth;
        taglineEl.classList.add('tagline-transition-out');

        taglineRotation.transitionTimer = window.setTimeout(() => {
            taglineEl.textContent = nextText;
            taglineEl.classList.remove('tagline-transition-out');
            taglineEl.classList.add('tagline-transition-in');

            taglineRotation.transitionTimer = window.setTimeout(() => {
                taglineEl.classList.remove('tagline-transition-in');
                taglineRotation.isTransitioning = false;
                taglineRotation.transitionTimer = null;

                if (Number.isInteger(taglineRotation.queuedIndex)) {
                    const queuedIndex = taglineRotation.queuedIndex;
                    taglineRotation.queuedIndex = null;
                    if (queuedIndex !== safeIndex) {
                        setTaglineByIndex(queuedIndex, { animate: true });
                    }
                }
            }, WELCOME_TAGLINE_TRANSITION_IN_MS);
        }, WELCOME_TAGLINE_TRANSITION_OUT_MS);
    }

    function bindVehicleButtons() {
        prevVehicleBtnEl?.addEventListener('click', () => {
            const baseIndex = transition.active ? transition.targetIndex : selectedSkinIndex;
            requestSwap(baseIndex - 1, -1, true);
        });
        nextVehicleBtnEl?.addEventListener('click', () => {
            const baseIndex = transition.active ? transition.targetIndex : selectedSkinIndex;
            requestSwap(baseIndex + 1, 1, true);
        });
    }

    function forceSelectPreset(nextIndex, emitChange = true) {
        const wrappedIndex = getWrappedIndex(nextIndex);
        transition.active = false;
        transition.phase = 'idle';
        transition.phaseTime = 0;
        transition.queue = null;
        transition.cameraKick = 0;
        transition.glowBoost = 0;
        resetTransitionVisuals();
        applySelectedPreset(wrappedIndex, emitChange);
    }

    function requestSwap(nextIndex, direction = 1, emitChange = true) {
        if (!CAR_SKIN_PRESETS.length) {
            return;
        }

        const targetIndex = getWrappedIndex(nextIndex);
        const directionalSign = direction < 0 ? -1 : 1;

        if (!transition.active && targetIndex === selectedSkinIndex) {
            return;
        }

        if (transition.active) {
            transition.queue = {
                index: targetIndex,
                direction: directionalSign,
                emitChange,
            };
            updateVehicleButtonLabels(targetIndex);
            return;
        }

        startSwap(targetIndex, directionalSign, emitChange);
    }

    function startSwap(targetIndex, direction = 1, emitChange = true) {
        const incomingVehicleIndex = activeVehicleIndex === 0 ? 1 : 0;
        const outgoingVehicleIndex = activeVehicleIndex;
        const incomingVehicle = previewVehicles[incomingVehicleIndex];
        const targetPreset = CAR_SKIN_PRESETS[targetIndex];

        incomingVehicle.rig.setSkin(targetPreset.id);
        incomingVehicle.car.visible = false;

        transition.active = true;
        transition.phase = 'exit';
        transition.phaseTime = 0;
        transition.direction = direction;
        transition.targetIndex = targetIndex;
        transition.emitChange = emitChange;
        transition.outgoingVehicleIndex = outgoingVehicleIndex;
        transition.incomingVehicleIndex = incomingVehicleIndex;
        transition.baseYaw = previewSpinYaw;
        transition.glowBoost = 0.24;
        transition.cameraKick = 0;
        transition.outgoingDistance = swapOutgoingDistance;
        transition.incomingDistance = swapIncomingDistance;
        transition.curveOffset = swapCurveOffset;
        transition.turnYaw = swapTurnYaw;
        transition.settleDistance = swapSettleDistance;
        transition.settleYawOffset = swapSettleYawOffset;

        updateVehicleButtonLabels(targetIndex);
    }

    function updateTransition(dt) {
        if (!transition.active) {
            transition.glowBoost = Math.max(transition.glowBoost - dt * 1.5, 0);
            transition.cameraKick = THREE.MathUtils.lerp(
                transition.cameraKick,
                0,
                1 - Math.exp(-10 * dt)
            );
            return;
        }

        transition.phaseTime += dt;

        if (transition.phase === 'exit') {
            const phaseProgress = THREE.MathUtils.clamp(
                transition.phaseTime / SWAP_TIMING.exitSec,
                0,
                1
            );
            const eased = easeOutCubic(phaseProgress);
            transition.glowBoost = THREE.MathUtils.lerp(0.24, 0.56, eased);
            transition.cameraKick =
                transition.direction * THREE.MathUtils.lerp(0, previewRadius * 0.06, eased);
            if (phaseProgress >= 1) {
                transition.phase = 'gap';
                transition.phaseTime = 0;
                previewVehicles[transition.outgoingVehicleIndex].car.visible = false;
            }
            return;
        }

        if (transition.phase === 'gap') {
            const phaseProgress = THREE.MathUtils.clamp(
                transition.phaseTime / SWAP_TIMING.gapSec,
                0,
                1
            );
            transition.glowBoost = THREE.MathUtils.lerp(0.56, 0.34, phaseProgress);
            transition.cameraKick =
                transition.direction *
                THREE.MathUtils.lerp(previewRadius * 0.06, previewRadius * 0.015, phaseProgress);
            if (phaseProgress >= 1) {
                transition.phase = 'enter';
                transition.phaseTime = 0;
                previewVehicles[transition.incomingVehicleIndex].car.visible = true;
            }
            return;
        }

        if (transition.phase === 'enter') {
            const phaseProgress = THREE.MathUtils.clamp(
                transition.phaseTime / SWAP_TIMING.enterSec,
                0,
                1
            );
            const eased = easeOutCubic(phaseProgress);
            transition.glowBoost = THREE.MathUtils.lerp(0.34, 0.16, eased);
            transition.cameraKick =
                transition.direction *
                THREE.MathUtils.lerp(previewRadius * 0.015, -previewRadius * 0.03, eased);
            if (phaseProgress >= 1) {
                transition.phase = 'settle';
                transition.phaseTime = 0;
            }
            return;
        }

        const settleProgress = THREE.MathUtils.clamp(
            transition.phaseTime / SWAP_TIMING.settleSec,
            0,
            1
        );
        transition.glowBoost = THREE.MathUtils.lerp(0.16, 0.07, settleProgress);
        transition.cameraKick =
            transition.direction * THREE.MathUtils.lerp(-previewRadius * 0.03, 0, settleProgress);

        if (settleProgress >= 1) {
            finishSwap();
        }
    }

    function finishSwap() {
        activeVehicleIndex = transition.incomingVehicleIndex;
        transition.active = false;
        transition.phase = 'idle';
        transition.phaseTime = 0;
        transition.cameraKick = 0;
        transition.glowBoost = 0.12;

        for (let i = 0; i < previewVehicles.length; i += 1) {
            const isActiveVehicle = i === activeVehicleIndex;
            previewVehicles[i].car.visible = isActiveVehicle;
        }

        applySelectedPreset(transition.targetIndex, transition.emitChange);

        if (transition.queue) {
            const queued = transition.queue;
            transition.queue = null;
            if (queued.index !== selectedSkinIndex) {
                startSwap(queued.index, queued.direction, queued.emitChange);
            }
        }
    }

    function applySelectedPreset(nextIndex, emitChange = true) {
        selectedSkinIndex = getWrappedIndex(nextIndex);
        const selectedPreset = CAR_SKIN_PRESETS[selectedSkinIndex];
        previewVehicles[activeVehicleIndex].rig.setSkin(selectedPreset.id);
        updateVehicleButtonLabels();
        if (emitChange) {
            onSkinChange?.(resolveSkinId(selectedPreset.id), selectedPreset);
        }
    }

    function applyPreviewPose() {
        const cameraOffsetX = transition.cameraKick;
        previewCamera.position.set(
            previewCameraBasePosition.x + cameraOffsetX,
            previewCameraBasePosition.y,
            previewCameraBasePosition.z
        );
        previewCamera.lookAt(
            previewLookAt.x + cameraOffsetX * 0.15,
            previewLookAt.y,
            previewLookAt.z
        );

        const outgoingVehicle =
            previewVehicles[transition.outgoingVehicleIndex] || previewVehicles[0];
        const incomingVehicle =
            previewVehicles[transition.incomingVehicleIndex] || previewVehicles[1];
        const transitionYaw = transition.active ? transition.baseYaw : previewSpinYaw;
        const forwardX = -Math.sin(transitionYaw);
        const forwardZ = -Math.cos(transitionYaw);
        const rightX = Math.cos(transitionYaw);
        const rightZ = -Math.sin(transitionYaw);

        for (let i = 0; i < previewVehicles.length; i += 1) {
            const previewVehicle = previewVehicles[i];
            previewVehicle.car.position.set(0, 0, 0);
            previewVehicle.car.rotation.y = previewSpinYaw;
            previewVehicle.car.scale.setScalar(1);
            if (!transition.active) {
                previewVehicle.car.visible = i === activeVehicleIndex;
            }
        }

        if (transition.active && transition.phase === 'exit') {
            const phaseProgress = THREE.MathUtils.clamp(
                transition.phaseTime / SWAP_TIMING.exitSec,
                0,
                1
            );
            const driveProgress = easeInCubic(phaseProgress);
            const curveProgress = easeInOutCubic(phaseProgress);
            const driveDistance = THREE.MathUtils.lerp(
                0,
                transition.outgoingDistance,
                driveProgress
            );
            const curveShift =
                transition.direction *
                THREE.MathUtils.lerp(0, transition.curveOffset, curveProgress);
            outgoingVehicle.car.visible = true;
            outgoingVehicle.car.position.set(
                forwardX * driveDistance + rightX * curveShift,
                0,
                forwardZ * driveDistance + rightZ * curveShift
            );
            outgoingVehicle.car.rotation.y =
                transitionYaw +
                THREE.MathUtils.lerp(0, transition.direction * transition.turnYaw, curveProgress);
            outgoingVehicle.car.scale.setScalar(1);
            incomingVehicle.car.visible = false;
        }

        if (transition.active && transition.phase === 'gap') {
            outgoingVehicle.car.visible = false;
            incomingVehicle.car.visible = false;
        }

        if (transition.active && transition.phase === 'enter') {
            const phaseProgress = THREE.MathUtils.clamp(
                transition.phaseTime / SWAP_TIMING.enterSec,
                0,
                1
            );
            const driveProgress = easeOutCubic(phaseProgress);
            const laneProgress = easeInOutCubic(phaseProgress);
            const incomingStartDistance = transition.incomingDistance;
            const settleStartDistance = transition.settleDistance;
            const settleStartYawOffset = transition.direction * transition.settleYawOffset;
            const driveDistance = THREE.MathUtils.lerp(
                -incomingStartDistance,
                settleStartDistance,
                driveProgress
            );
            const startLaneShift = transition.direction * transition.curveOffset;
            const laneShift = THREE.MathUtils.lerp(startLaneShift, 0, laneProgress);
            incomingVehicle.car.visible = true;
            incomingVehicle.car.position.set(
                forwardX * driveDistance + rightX * laneShift,
                0,
                forwardZ * driveDistance + rightZ * laneShift
            );
            incomingVehicle.car.rotation.y =
                transitionYaw +
                THREE.MathUtils.lerp(
                    transition.direction * transition.turnYaw,
                    settleStartYawOffset,
                    laneProgress
                );
            incomingVehicle.car.scale.setScalar(1);
            outgoingVehicle.car.visible = false;
        }

        if (transition.active && transition.phase === 'settle') {
            const phaseProgress = THREE.MathUtils.clamp(
                transition.phaseTime / SWAP_TIMING.settleSec,
                0,
                1
            );
            const eased = easeOutCubic(phaseProgress);
            const settleStartDistance = transition.settleDistance;
            const settleStartYawOffset = transition.direction * transition.settleYawOffset;
            const settleDistance = THREE.MathUtils.lerp(settleStartDistance, 0, eased);
            incomingVehicle.car.visible = true;
            incomingVehicle.car.position.set(
                forwardX * settleDistance,
                0,
                forwardZ * settleDistance
            );
            incomingVehicle.car.rotation.y =
                transitionYaw + THREE.MathUtils.lerp(settleStartYawOffset, 0, eased);
            incomingVehicle.car.scale.setScalar(1);
            outgoingVehicle.car.visible = false;
        }

        underGlow.scale.setScalar(1 + transition.glowBoost * 0.26);
        underGlow.material.opacity = 0.1 + transition.glowBoost * 0.12;

        showroomAtmosphere.contactShadow.scale.setScalar(1 + transition.glowBoost * 0.12);
        showroomAtmosphere.contactShadow.material.opacity =
            0.52 + Math.sin(previewPulseTime * 0.72 + 0.2) * 0.03 - transition.glowBoost * 0.04;
        showroomAtmosphere.stageFloor.material.opacity = 0.95 + transition.glowBoost * 0.03;
    }

    function resetTransitionVisuals() {
        transition.active = false;
        transition.phase = 'idle';
        transition.phaseTime = 0;
        transition.direction = 1;
        transition.outgoingVehicleIndex = activeVehicleIndex;
        transition.incomingVehicleIndex = activeVehicleIndex === 0 ? 1 : 0;
        transition.cameraKick = 0;
        transition.glowBoost = 0;
        transition.baseYaw = previewSpinYaw;
        transition.outgoingDistance = swapOutgoingDistance;
        transition.incomingDistance = swapIncomingDistance;
        transition.curveOffset = swapCurveOffset;
        transition.turnYaw = swapTurnYaw;
        transition.settleDistance = swapSettleDistance;
        transition.settleYawOffset = swapSettleYawOffset;
        transition.queue = null;

        for (let i = 0; i < previewVehicles.length; i += 1) {
            const previewVehicle = previewVehicles[i];
            previewVehicle.car.visible = i === activeVehicleIndex;
            previewVehicle.car.position.set(0, 0, 0);
            previewVehicle.car.rotation.y = previewSpinYaw;
            previewVehicle.car.scale.setScalar(1);
        }

        underGlow.scale.setScalar(1);
        underGlow.material.opacity = 0.1;
        showroomAtmosphere.contactShadow.scale.setScalar(1);
        showroomAtmosphere.contactShadow.material.opacity = 0.52;
        showroomAtmosphere.stageFloor.material.opacity = 0.95;
    }

    function updateVehicleButtonLabels(baseIndex = selectedSkinIndex) {
        if (!CAR_SKIN_PRESETS.length) {
            return;
        }
        const normalizedIndex = getWrappedIndex(baseIndex);
        const previousPreset = CAR_SKIN_PRESETS[getWrappedIndex(normalizedIndex - 1)];
        const nextPreset = CAR_SKIN_PRESETS[getWrappedIndex(normalizedIndex + 1)];
        prevVehicleBtnEl?.setAttribute('aria-label', `Previous skin: ${previousPreset.name}`);
        nextVehicleBtnEl?.setAttribute('aria-label', `Next skin: ${nextPreset.name}`);
    }

    function createShowroomAtmosphere(scene, previewRadius) {
        const stageRadius = previewRadius * 2.92;
        const backdropY = previewRadius * 0.94;
        const backdropZ = -previewRadius * 3.24;

        const backdropGroup = new THREE.Group();
        scene.add(backdropGroup);

        const cycloramaMaterial = new THREE.MeshBasicMaterial({
            map: createCycloramaTexture(),
            color: 0xadd5ff,
            transparent: true,
            opacity: 0.96,
            side: THREE.BackSide,
            depthWrite: false,
        });
        const cyclorama = new THREE.Mesh(
            new THREE.SphereGeometry(previewRadius * 9.2, 64, 40),
            cycloramaMaterial
        );
        cyclorama.position.set(0, previewRadius * 1.24, -previewRadius * 0.42);
        backdropGroup.add(cyclorama);

        const backdropSoftLightMaterial = new THREE.MeshBasicMaterial({
            map: createBackdropSoftLightTexture(),
            color: 0x8ed8ff,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const backdropSoftLight = new THREE.Mesh(
            new THREE.PlaneGeometry(previewRadius * 7.2, previewRadius * 3.05),
            backdropSoftLightMaterial
        );
        backdropSoftLight.position.set(0, backdropY, backdropZ);
        backdropGroup.add(backdropSoftLight);

        const particlesGeometry = new THREE.BufferGeometry();
        const particleCount = 56;
        const particlePositions = new Float32Array(particleCount * 3);
        const random = createSeededRandom(61);
        for (let i = 0; i < particleCount; i += 1) {
            const idx = i * 3;
            particlePositions[idx] = (random() - 0.5) * previewRadius * 7.0;
            particlePositions[idx + 1] = previewRadius * (0.2 + random() * 2.2);
            particlePositions[idx + 2] = backdropZ + random() * previewRadius * 1.6;
        }
        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
        const dustTexture = createDustParticleTexture();
        const particlesMaterial = new THREE.PointsMaterial({
            map: dustTexture,
            color: 0xb5dcff,
            transparent: true,
            opacity: 0.11,
            size: 0.055,
            sizeAttenuation: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            alphaTest: 0.05,
        });
        const particles = new THREE.Points(particlesGeometry, particlesMaterial);
        backdropGroup.add(particles);

        const stageFloor = new THREE.Mesh(
            new THREE.CircleGeometry(stageRadius, 108),
            new THREE.MeshPhysicalMaterial({
                color: 0x0a1119,
                metalness: 0.08,
                roughness: 0.34,
                clearcoat: 0.72,
                clearcoatRoughness: 0.46,
                transparent: true,
                opacity: 0.95,
            })
        );
        stageFloor.rotation.x = -Math.PI * 0.5;
        stageFloor.position.y = -0.018;
        scene.add(stageFloor);

        const floorSheenMaterial = new THREE.MeshBasicMaterial({
            map: createFloorSheenTexture(),
            color: 0x8ecfff,
            transparent: true,
            opacity: 0.2,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const floorSheen = new THREE.Mesh(
            new THREE.CircleGeometry(stageRadius * 0.94, 108),
            floorSheenMaterial
        );
        floorSheen.rotation.x = -Math.PI * 0.5;
        floorSheen.position.y = 0.002;
        scene.add(floorSheen);

        const accentHalo = new THREE.Mesh(
            new THREE.RingGeometry(previewRadius * 1.26, previewRadius * 1.86, 140),
            new THREE.MeshBasicMaterial({
                color: 0x89cbff,
                transparent: true,
                opacity: 0.1,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
            })
        );
        accentHalo.rotation.x = -Math.PI * 0.5;
        accentHalo.position.y = 0.01;
        scene.add(accentHalo);

        const contactShadow = new THREE.Mesh(
            new THREE.CircleGeometry(previewRadius * 1.56, 72),
            new THREE.MeshBasicMaterial({
                map: createContactShadowTexture(),
                transparent: true,
                opacity: 0.52,
                depthWrite: false,
            })
        );
        contactShadow.rotation.x = -Math.PI * 0.5;
        contactShadow.position.y = 0.015;
        scene.add(contactShadow);

        return {
            timeSec: Math.random() * 6,
            backdropGroup,
            cycloramaMaterial,
            backdropSoftLightMaterial,
            floorSheenMaterial,
            particles,
            stageFloor,
            accentHalo,
            contactShadow,
        };
    }

    function createCycloramaTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        const skyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        skyGradient.addColorStop(0, '#03070d');
        skyGradient.addColorStop(0.46, '#050a12');
        skyGradient.addColorStop(1, '#0b1521');
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const topBloom = ctx.createRadialGradient(
            canvas.width * 0.5,
            canvas.height * 0.25,
            24,
            canvas.width * 0.5,
            canvas.height * 0.25,
            canvas.width * 0.52
        );
        topBloom.addColorStop(0, 'rgba(112, 183, 235, 0.2)');
        topBloom.addColorStop(0.64, 'rgba(74, 132, 186, 0.08)');
        topBloom.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = topBloom;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const floorLift = ctx.createLinearGradient(0, canvas.height * 0.56, 0, canvas.height);
        floorLift.addColorStop(0, 'rgba(106, 171, 224, 0)');
        floorLift.addColorStop(1, 'rgba(106, 171, 224, 0.16)');
        ctx.fillStyle = floorLift;
        ctx.fillRect(0, canvas.height * 0.56, canvas.width, canvas.height * 0.44);

        const vignette = ctx.createRadialGradient(
            canvas.width * 0.5,
            canvas.height * 0.52,
            canvas.width * 0.24,
            canvas.width * 0.5,
            canvas.height * 0.52,
            canvas.width * 0.72
        );
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignette.addColorStop(1, 'rgba(0, 0, 0, 0.52)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        return texture;
    }

    function createBackdropSoftLightTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        const centerGlow = ctx.createRadialGradient(
            canvas.width * 0.5,
            canvas.height * 0.56,
            12,
            canvas.width * 0.5,
            canvas.height * 0.56,
            canvas.width * 0.42
        );
        centerGlow.addColorStop(0, 'rgba(151, 220, 255, 0.46)');
        centerGlow.addColorStop(0.44, 'rgba(114, 188, 238, 0.16)');
        centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = centerGlow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const horizonBand = ctx.createLinearGradient(
            0,
            canvas.height * 0.54,
            0,
            canvas.height * 0.82
        );
        horizonBand.addColorStop(0, 'rgba(154, 220, 255, 0)');
        horizonBand.addColorStop(0.5, 'rgba(154, 220, 255, 0.22)');
        horizonBand.addColorStop(1, 'rgba(154, 220, 255, 0)');
        ctx.fillStyle = horizonBand;
        ctx.fillRect(0, canvas.height * 0.5, canvas.width, canvas.height * 0.36);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        return texture;
    }

    function createFloorSheenTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        const centerX = canvas.width * 0.5;
        const centerY = canvas.height * 0.5;
        const maxRadius = canvas.width * 0.46;

        const glow = ctx.createRadialGradient(centerX, centerY, 26, centerX, centerY, maxRadius);
        glow.addColorStop(0, 'rgba(176, 230, 255, 0.42)');
        glow.addColorStop(0.38, 'rgba(126, 205, 245, 0.16)');
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.beginPath();
        ctx.strokeStyle = 'rgba(142, 213, 248, 0.16)';
        ctx.lineWidth = 2;
        ctx.arc(centerX, centerY, maxRadius * 0.8, 0, Math.PI * 2);
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        return texture;
    }

    function createDustParticleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.44, 'rgba(214, 236, 255, 0.48)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        return texture;
    }

    function createContactShadowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        const centerX = canvas.width * 0.5;
        const centerY = canvas.height * 0.5;

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(1, 0.62);
        const gradient = ctx.createRadialGradient(0, 0, 14, 0, 0, 232);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
        gradient.addColorStop(0.38, 'rgba(0, 0, 0, 0.36)');
        gradient.addColorStop(0.72, 'rgba(0, 0, 0, 0.14)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, 236, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    function createSeededRandom(seed = 1) {
        let state = (Math.floor(seed) || 1) >>> 0;
        return function nextRandom() {
            state += 0x6d2b79f5;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function createPreviewVehicle() {
        const rig = createCarRig({
            skinId: DEFAULT_PLAYER_CAR_SKIN_ID,
            bodyColor: getCarSkinPresetById(DEFAULT_PLAYER_CAR_SKIN_ID).bodyColor,
            displayName: 'MAREK',
            addLights: true,
            addWheelWellLights: false,
            lightConfig: {
                enablePrimaryHeadlightProjectors: false,
                enableNearFillProjectors: false,
                enableFacadeFillProjectors: false,
                taillightIntensity: 1.3,
                taillightDistance: 8.2,
                taillightDecay: 3,
                taillightPositions: [
                    { position: [-0.52, 0.54, WELCOME_PREVIEW_REAR_LIGHT_Z] },
                    { position: [0.52, 0.54, WELCOME_PREVIEW_REAR_LIGHT_Z] },
                ],
            },
        });
        rig.car.visible = false;
        previewScene.add(rig.car);
        return { rig, car: rig.car };
    }

    function getWrappedIndex(index) {
        const count = CAR_SKIN_PRESETS.length;
        return ((Math.round(index) % count) + count) % count;
    }

    function easeInOutCubic(value) {
        if (value < 0.5) {
            return 4 * value * value * value;
        }
        return 1 - Math.pow(-2 * value + 2, 3) / 2;
    }

    function easeInCubic(value) {
        return value * value * value;
    }

    function easeOutCubic(value) {
        const inverse = 1 - value;
        return 1 - inverse * inverse * inverse;
    }

    function normalizeWelcomeAuthState(state = null) {
        const source = state && typeof state === 'object' ? state : {};
        return {
            enabled: Boolean(source.enabled),
            profileImageEnabled: Boolean(source.profileImageEnabled),
            ready: Boolean(source.ready),
            loading: Boolean(source.loading),
            pendingAction: typeof source.pendingAction === 'string' ? source.pendingAction : '',
            authenticated: Boolean(source.authenticated),
            displayName: sanitizeOnlinePlayerNameInput(source.displayName || ''),
            email: sanitizeAuthEmailInput(source.email || ''),
            avatarUrl: sanitizeProfileImageUrl(source.avatarUrl || ''),
            statusText: typeof source.statusText === 'string' ? source.statusText : '',
            statusTone: sanitizeAuthTone(source.statusTone),
            requiresEmailConfirmation: Boolean(source.requiresEmailConfirmation),
        };
    }

    function sanitizeAuthEmailInput(value) {
        if (typeof value !== 'string') {
            return '';
        }
        const normalized = value.trim().toLowerCase().slice(0, 320);
        return normalized.replace(/\s+/g, '');
    }

    function isValidAuthEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(sanitizeAuthEmailInput(value));
    }

    function sanitizeAuthTone(value) {
        if (typeof value !== 'string') {
            return 'muted';
        }
        const normalized = value.trim().toLowerCase();
        return normalized === 'error' ||
            normalized === 'success' ||
            normalized === 'info' ||
            normalized === 'muted'
            ? normalized
            : 'muted';
    }

    function sanitizeProfileImageUrl(value) {
        if (typeof value !== 'string') {
            return '';
        }
        const normalized = value.trim();
        if (!normalized) {
            return '';
        }
        try {
            const parsed = new URL(
                normalized,
                typeof window?.location?.origin === 'string' ? window.location.origin : undefined
            );
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
                return '';
            }
            return parsed.toString();
        } catch {
            return '';
        }
    }

    function resolveProfileImageFallbackLabel(authState = authUiState) {
        const preferredSource =
            sanitizeOnlinePlayerNameInput(authState?.displayName || '') ||
            sanitizeAuthEmailInput(authState?.email || '') ||
            DEFAULT_ONLINE_PLAYER_NAME;
        const firstCharacter =
            Array.from(preferredSource.trim())[0] || Array.from(DEFAULT_ONLINE_PLAYER_NAME)[0];
        return firstCharacter.toUpperCase();
    }

    function normalizeOnlineRoomCode(value) {
        if (typeof value !== 'string') {
            return '';
        }
        return value
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, ONLINE_ROOM_CODE_LENGTH);
    }

    function sanitizeOnlinePlayerNameInput(value) {
        if (typeof value !== 'string') {
            return '';
        }
        const normalized = value
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
            .slice(0, ONLINE_PLAYER_NAME_MAX_LENGTH);
        return normalized;
    }

    function sanitizeOnlinePlayerNameSubmit(value) {
        const normalized = sanitizeOnlinePlayerNameInput(value);
        return normalized || DEFAULT_ONLINE_PLAYER_NAME;
    }

    function syncOnlinePlayerNameFromStorage() {
        if (!onlineNameInputEl) {
            return;
        }
        const safeName = sanitizeOnlinePlayerNameInput(readStoredOnlinePlayerName());
        onlineNameInputEl.value = safeName;
        preferredOnlinePlayerName = safeName;
        writeStoredOnlinePlayerName(safeName);
    }

    function readStoredOnlinePlayerName() {
        try {
            return window.localStorage.getItem(MP_NAME_STORAGE_KEY) || '';
        } catch {
            return '';
        }
    }

    function writeStoredOnlinePlayerName(value) {
        try {
            window.localStorage.setItem(MP_NAME_STORAGE_KEY, sanitizeOnlinePlayerNameInput(value));
        } catch {
            // localStorage is optional.
        }
    }

    function queueCustomCreateCodeAvailabilityLookup() {
        if (!hasOnlineStartFlow) {
            return;
        }
        clearCustomCreateCodeLookup();
        const normalizedCode = normalizeOnlineRoomCode(preferredOnlineRoomCode);
        if (preferredOnlineRoomAction !== 'create' && preferredOnlineRoomAction !== 'join') {
            setCustomCreateCodeStatus('hidden', '');
            return;
        }
        if (preferredOnlineRoomAction === 'create' && !normalizedCode) {
            setCustomCreateCodeStatus('idle', '');
            return;
        }
        if (normalizedCode.length !== ONLINE_ROOM_CODE_LENGTH) {
            setCustomCreateCodeStatus('incomplete', normalizedCode);
            return;
        }
        setCustomCreateCodeStatus('checking', normalizedCode);
        onlineCodeLookupTimeout = window.setTimeout(() => {
            checkCustomCreateCodeAvailability(normalizedCode);
        }, ONLINE_CODE_LOOKUP_DEBOUNCE_MS);
    }

    async function checkCustomCreateCodeAvailability(roomCode) {
        if (!roomCode || roomCode.length !== ONLINE_ROOM_CODE_LENGTH) {
            return;
        }
        const requestController = new AbortController();
        onlineCodeLookupAbortController = requestController;
        try {
            const response = await window.fetch(
                `/api/room-code/${encodeURIComponent(roomCode)}/availability`,
                {
                    method: 'GET',
                    cache: 'no-store',
                    signal: requestController.signal,
                }
            );
            const payload = await response.json().catch(() => ({}));
            if (
                (preferredOnlineRoomAction !== 'create' && preferredOnlineRoomAction !== 'join') ||
                normalizeOnlineRoomCode(preferredOnlineRoomCode) !== roomCode
            ) {
                return;
            }
            if (!response.ok || payload?.ok !== true) {
                setCustomCreateCodeStatus('error', roomCode);
                updateOnlineFlowState();
                return;
            }
            const isCreateAction = preferredOnlineRoomAction === 'create';
            const nextStatus = payload.available ? 'available' : 'occupied';
            const wasReadyForCode =
                customCreateCodeStatusCode === roomCode &&
                ((isCreateAction && customCreateCodeStatus === 'available') ||
                    (!isCreateAction && customCreateCodeStatus === 'occupied'));
            const isReadyForCode =
                (isCreateAction && nextStatus === 'available') ||
                (!isCreateAction && nextStatus === 'occupied');
            setCustomCreateCodeStatus(nextStatus, roomCode);
            updateOnlineFlowState();
            if (isReadyForCode && !wasReadyForCode) {
                triggerContinueButtonGlint();
            }
        } catch (error) {
            if (error?.name === 'AbortError') {
                return;
            }
            if (
                (preferredOnlineRoomAction === 'create' || preferredOnlineRoomAction === 'join') &&
                normalizeOnlineRoomCode(preferredOnlineRoomCode) === roomCode
            ) {
                setCustomCreateCodeStatus('error', roomCode);
                updateOnlineFlowState();
            }
        } finally {
            if (onlineCodeLookupAbortController === requestController) {
                onlineCodeLookupAbortController = null;
            }
        }
    }

    function clearCustomCreateCodeLookup() {
        if (onlineCodeLookupTimeout != null) {
            window.clearTimeout(onlineCodeLookupTimeout);
            onlineCodeLookupTimeout = null;
        }
        if (onlineCodeLookupAbortController) {
            onlineCodeLookupAbortController.abort();
            onlineCodeLookupAbortController = null;
        }
    }

    function clearContinueButtonGlint() {
        if (onlineContinueGlintTimeout != null) {
            window.clearTimeout(onlineContinueGlintTimeout);
            onlineContinueGlintTimeout = null;
        }
        onlineContinueBtnEl?.classList.remove('attention-glint');
    }

    function triggerContinueButtonGlint() {
        if (!onlineContinueBtnEl) {
            return;
        }
        clearContinueButtonGlint();
        onlineContinueBtnEl.classList.add('attention-glint');
        onlineContinueGlintTimeout = window.setTimeout(() => {
            onlineContinueBtnEl.classList.remove('attention-glint');
            onlineContinueGlintTimeout = null;
        }, 800);
    }

    function setCustomCreateCodeStatus(status, code = '') {
        customCreateCodeStatus = status || 'idle';
        customCreateCodeStatusCode = code || '';
        if (!onlineRoomCodeStatusEl) {
            return;
        }
        if (customCreateCodeStatus === 'hidden') {
            onlineRoomCodeStatusEl.textContent = '';
            onlineRoomCodeStatusEl.dataset.tone = 'muted';
            return;
        }
        if (customCreateCodeStatus === 'idle') {
            onlineRoomCodeStatusEl.textContent =
                preferredOnlineRoomAction === 'join'
                    ? `Enter ${ONLINE_ROOM_CODE_LENGTH} characters (A-Z, 0-9).`
                    : 'Leave empty to auto-generate a room code.';
            onlineRoomCodeStatusEl.dataset.tone = 'muted';
            return;
        }
        if (customCreateCodeStatus === 'incomplete') {
            onlineRoomCodeStatusEl.textContent = `Enter ${ONLINE_ROOM_CODE_LENGTH} characters (A-Z, 0-9).`;
            onlineRoomCodeStatusEl.dataset.tone = 'muted';
            return;
        }
        if (customCreateCodeStatus === 'checking') {
            onlineRoomCodeStatusEl.textContent =
                preferredOnlineRoomAction === 'join'
                    ? 'Checking room...'
                    : 'Checking code availability...';
            onlineRoomCodeStatusEl.dataset.tone = 'info';
            return;
        }
        if (customCreateCodeStatus === 'available') {
            onlineRoomCodeStatusEl.textContent =
                preferredOnlineRoomAction === 'join' ? 'Room does not exist.' : 'Code available';
            onlineRoomCodeStatusEl.dataset.tone =
                preferredOnlineRoomAction === 'join' ? 'error' : 'success';
            return;
        }
        if (customCreateCodeStatus === 'occupied') {
            onlineRoomCodeStatusEl.textContent =
                preferredOnlineRoomAction === 'join' ? 'Room found.' : 'Code already in use';
            onlineRoomCodeStatusEl.dataset.tone =
                preferredOnlineRoomAction === 'join' ? 'success' : 'error';
            return;
        }
        onlineRoomCodeStatusEl.textContent = 'Code check failed. Try again.';
        onlineRoomCodeStatusEl.dataset.tone = 'error';
    }
}

function createInitialWelcomeGlobalLeaderboardState() {
    return normalizeWelcomeGlobalLeaderboardState(null);
}

function normalizeWelcomeGlobalLeaderboardState(state) {
    const source = state && typeof state === 'object' ? state : {};
    const entries = Array.isArray(source.entries)
        ? source.entries
              .map((entry) => normalizeWelcomeGlobalLeaderboardEntry(entry))
              .filter(Boolean)
        : [];
    return {
        enabled: Boolean(source.enabled),
        loading: Boolean(source.loading),
        source: typeof source.source === 'string' ? source.source : '',
        statusText: typeof source.statusText === 'string' ? source.statusText.trim() : '',
        entries,
        totalEntries: Math.max(0, Math.round(Number(source.totalEntries) || 0)),
        viewerRank: Math.max(0, Math.round(Number(source.viewerRank) || 0)),
        viewerHasEntry: Boolean(source.viewerHasEntry),
    };
}

function normalizeWelcomeGlobalLeaderboardEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const playerName = sanitizeWelcomeLeaderboardName(entry.playerName || entry.player_name);
    const score = Math.max(0, Math.round(Number(entry.score) || 0));
    if (!playerName || score <= 0) {
        return null;
    }
    return {
        playerName,
        score,
        rank: Math.max(1, Math.round(Number(entry.rank) || 1)),
        segment: normalizeWelcomeLeaderboardSegment(entry.segment),
        isViewer: Boolean(entry.isViewer),
        collectedCount: Math.max(
            0,
            Math.round(Number(entry.collectedCount ?? entry.collected_count) || 0)
        ),
        gameMode:
            typeof (entry.gameMode || entry.game_mode) === 'string'
                ? String(entry.gameMode || entry.game_mode).trim()
                : '',
        createdAt: sanitizeWelcomeLeaderboardDate(entry.createdAt || entry.created_at),
    };
}

function resolveWelcomeLeaderboardTone(state) {
    if (!state || typeof state !== 'object') {
        return 'muted';
    }
    if (state.loading) {
        return 'info';
    }
    const statusText = typeof state.statusText === 'string' ? state.statusText : '';
    if (/unavailable|failed|disabled/iu.test(statusText)) {
        return 'error';
    }
    if (state.entries?.length > 0) {
        return 'success';
    }
    return 'muted';
}

function buildWelcomeLeaderboardListHtml(state, formatter) {
    const normalizedState = normalizeWelcomeGlobalLeaderboardState(state);
    if (!normalizedState.entries.length) {
        return '<div class="welcomePreviewLeaderboardEmpty">No saved player scores yet.</div>';
    }

    const parts = [];
    let previousSegment = '';
    normalizedState.entries.forEach((entry) => {
        if (entry.segment === 'viewer' && previousSegment !== 'viewer') {
            parts.push(
                buildWelcomeLeaderboardDividerHtml(
                    normalizedState.viewerRank,
                    normalizedState.totalEntries
                )
            );
        }
        parts.push(buildWelcomeLeaderboardRowHtml(entry, formatter));
        previousSegment = entry.segment;
    });
    return parts.join('');
}

function buildWelcomeLeaderboardRowHtml(entry, formatter) {
    const parts = [];
    if (entry.gameMode) {
        parts.push(String(entry.gameMode).toUpperCase());
    }
    if (entry.collectedCount > 0) {
        parts.push(`${formatter.format(entry.collectedCount)} pickups`);
    }
    const createdLabel = formatWelcomeLeaderboardDate(entry.createdAt);
    if (createdLabel) {
        parts.push(createdLabel);
    }
    return (
        `<div class="welcomePreviewLeaderboardRow${entry.rank === 1 ? ' is-first' : ''}${entry.isViewer ? ' is-viewer' : ''}">` +
        '<div class="welcomePreviewLeaderboardHead">' +
        `<span class="welcomePreviewLeaderboardRank">#${entry.rank}</span>` +
        `<span class="welcomePreviewLeaderboardName">${escapeWelcomeLeaderboardHtml(entry.playerName)}</span>` +
        `<span class="welcomePreviewLeaderboardScore">${formatter.format(entry.score)} pts</span>` +
        '</div>' +
        `<div class="welcomePreviewLeaderboardMeta">${escapeWelcomeLeaderboardHtml(parts.join(' | ') || 'Saved in Supabase')}</div>` +
        '</div>'
    );
}

function buildWelcomeLeaderboardDividerHtml(viewerRank, totalEntries) {
    const label =
        viewerRank > 0 && totalEntries > 0
            ? `Your position: #${viewerRank} of ${totalEntries}`
            : 'Your position';
    return `<div class="welcomePreviewLeaderboardDivider">${escapeWelcomeLeaderboardHtml(label)}</div>`;
}

function normalizeWelcomeLeaderboardSegment(value) {
    if (typeof value !== 'string') {
        return 'top';
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'viewer' ? 'viewer' : 'top';
}

function sanitizeWelcomeLeaderboardName(value) {
    return typeof value === 'string' ? value.trim().slice(0, 64) : '';
}

function sanitizeWelcomeLeaderboardDate(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    if (!normalized) {
        return '';
    }
    const timestamp = Date.parse(normalized);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function formatWelcomeLeaderboardDate(value) {
    if (!value) {
        return '';
    }
    try {
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
        }).format(new Date(value));
    } catch {
        return '';
    }
}

function escapeWelcomeLeaderboardHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
