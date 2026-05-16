import { getSupabaseBrowserClient, getSupabaseBrowserConfig } from './supabase-browser.js';
import { clearAccountLocalData } from './account-local-data.js';
import {
    createDefaultPlayerEconomyState,
    formatPlayerCredits,
    mergePlayerEconomyStates,
    normalizePlayerEconomyState,
    resolvePlayerEconomyStateFromSource,
} from './player-economy.js';
import { resolvePlayerWheelPresetId, sanitizePlayerWheelPresetId } from './wheel-presets.js';

const MP_NAME_STORAGE_KEY = 'silentdrift-mp-player-name';
const DEFAULT_DRIVER_NAME = 'Driver';
const PLAYER_NAME_MAX_LENGTH = 18;
const AUTH_PASSWORD_MIN_LENGTH = 6;
const AUTH_DELETE_ACCOUNT_ENDPOINT_PATH = '/api/auth/account';
const PLAYER_ECONOMY_PROFILE_ENDPOINT_PATH = '/api/player-economy/profile';
const PLAYER_ECONOMY_SYNC_ENDPOINT_PATH = '/api/player-economy/sync';
const PLAYER_ECONOMY_CREDITS_CHECKOUT_ENDPOINT_PATH =
    '/api/player-economy/credits-checkout-session';
const PLAYER_ECONOMY_CREDITS_STATUS_ENDPOINT_PATH = '/api/player-economy/credits-session-status';
const PLAYER_ECONOMY_RECENT_TRANSACTION_LIMIT = 6;
const PLAYER_ECONOMY_CREDITS_QUERY_KEY = 'credits-purchase';
const PLAYER_ECONOMY_CREDITS_SESSION_QUERY_KEY = 'credits_session_id';
const USER_MEDIA_MAX_INPUT_BYTES = 10 * 1024 * 1024;
const PROFILE_IMAGE_OUTPUT_SIZE_PX = 512;
const CAR_WRAP_OUTPUT_WIDTH_PX = 2048;
const CAR_WRAP_OUTPUT_HEIGHT_PX = 1024;
const PROFILE_IMAGE_OUTPUT_QUALITY = 0.86;
const CAR_WRAP_OUTPUT_QUALITY = 0.9;
const USER_MEDIA_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CHASE_CAMERA_SETTING_MIN = -1;
const CHASE_CAMERA_SETTING_MAX = 1;
const DEFAULT_ACCOUNT_AUTO_FULLSCREEN_ON_START = true;
const DEFAULT_ACCOUNT_HIDE_GAMEPLAY_PANELS = false;
const DEFAULT_ACCOUNT_PROFILE_SCREENSAVER_ENABLED = true;
const DEFAULT_ACCOUNT_AUDIO_PREFS = Object.freeze({
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

export function createAuthController({ onStateChanged = null, onToast = null } = {}) {
    const listeners = new Set();
    let state = createInitialAuthState();
    let initializePromise = null;
    let supabaseClient = null;
    let authSubscription = null;
    let currentSession = null;
    let browserConfig = createInitialBrowserConfig();
    let creditsPurchaseReturnPromise = null;
    let userMetadataUpdateQueue = Promise.resolve();
    const pendingUserMetadataRequests = new Set();

    function resolveAuthUnavailableMessage() {
        const statusText =
            typeof browserConfig?.unavailableStatusText === 'string'
                ? browserConfig.unavailableStatusText.trim()
                : '';
        return statusText || 'Player account is unavailable on this server.';
    }

    function resolveAuthUnavailableTone() {
        return browserConfig?.unavailableReason === 'server-disabled' ? 'error' : 'muted';
    }

    return {
        async initialize() {
            if (!initializePromise) {
                initializePromise = initializeInternal();
            }

            try {
                return await initializePromise;
            } catch (error) {
                initializePromise = null;
                throw error;
            }
        },
        async signIn(credentials = {}) {
            await initializeInternalSafe();
            if (!supabaseClient || !state.enabled) {
                const errorMessage = resolveAuthUnavailableMessage();
                updateState({
                    loading: false,
                    pendingAction: '',
                    statusText: errorMessage,
                    statusTone: resolveAuthUnavailableTone(),
                });
                return {
                    ok: false,
                    error: errorMessage,
                };
            }

            const email = sanitizeEmail(credentials.email);
            const password = sanitizePassword(credentials.password);
            if (!email) {
                return updateValidationFailure('Enter a valid email address.');
            }
            if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
                return updateValidationFailure(
                    `Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters.`
                );
            }

            updateState({
                loading: true,
                pendingAction: 'sign-in',
                statusText: 'Signing in...',
                statusTone: 'info',
                requiresEmailConfirmation: false,
            });

            try {
                const { data, error } = await supabaseClient.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) {
                    throw error;
                }
                applySession(data?.session || null, {
                    statusText: 'Signed in. Online rooms and score sync are unlocked.',
                    statusTone: 'success',
                });
                notifyToast('Signed in. Online rooms and score sync are unlocked.', 'success');
                return {
                    ok: true,
                };
            } catch (error) {
                return updateRequestFailure(error);
            }
        },
        async signUp(credentials = {}) {
            await initializeInternalSafe();
            if (!supabaseClient || !state.enabled) {
                const errorMessage = resolveAuthUnavailableMessage();
                updateState({
                    loading: false,
                    pendingAction: '',
                    statusText: errorMessage,
                    statusTone: resolveAuthUnavailableTone(),
                });
                return {
                    ok: false,
                    error: errorMessage,
                };
            }

            const displayName = sanitizeDisplayName(credentials.displayName);
            const email = sanitizeEmail(credentials.email);
            const password = sanitizePassword(credentials.password);
            if (!displayName) {
                return updateValidationFailure('Choose a display name.');
            }
            if (!email) {
                return updateValidationFailure('Enter a valid email address.');
            }
            if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
                return updateValidationFailure(
                    `Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters.`
                );
            }

            updateState({
                loading: true,
                pendingAction: 'sign-up',
                statusText: 'Creating account...',
                statusTone: 'info',
                requiresEmailConfirmation: false,
            });

            try {
                const { data, error } = await supabaseClient.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: resolveEmailRedirectUrl(),
                        data: {
                            display_name: displayName,
                        },
                    },
                });
                if (error) {
                    throw error;
                }
                if (data?.session) {
                    applySession(data.session, {
                        statusText: 'Account created. You are now signed in.',
                        statusTone: 'success',
                    });
                    notifyToast('Account created. You are now signed in.', 'success');
                    return {
                        ok: true,
                        requiresEmailConfirmation: false,
                    };
                }

                currentSession = null;
                writeStoredPlayerName(displayName);
                updateState({
                    loading: false,
                    pendingAction: '',
                    authenticated: false,
                    userId: sanitizeUserId(data?.user?.id),
                    email,
                    displayName,
                    requiresEmailConfirmation: true,
                    statusText: 'Account created. Check your email and confirm before signing in.',
                    statusTone: 'info',
                });
                notifyToast(
                    'Account created. Check your email and confirm the account before signing in.',
                    'info',
                    5200
                );
                return {
                    ok: true,
                    requiresEmailConfirmation: true,
                };
            } catch (error) {
                return updateRequestFailure(error);
            }
        },
        async signOut() {
            await initializeInternalSafe();
            if (!supabaseClient) {
                applySignedOutState('Signed out.');
                notifyToast('Signed out.', 'info');
                return {
                    ok: true,
                };
            }

            await flushUserMetadataUpdateQueue();
            updateState({
                loading: true,
                pendingAction: 'sign-out',
                statusText: 'Signing out...',
                statusTone: 'info',
            });

            try {
                const { error } = await supabaseClient.auth.signOut();
                if (error) {
                    throw error;
                }
                applySignedOutState('Signed out. Sign in to create or join online rooms.');
                notifyToast('Signed out.', 'info');
                return {
                    ok: true,
                };
            } catch (error) {
                return updateRequestFailure(error);
            }
        },
        async changePassword(credentials = {}) {
            await initializeInternalSafe();
            if (!supabaseClient || !state.enabled) {
                const errorMessage = resolveAuthUnavailableMessage();
                updateState({
                    loading: false,
                    pendingAction: '',
                    statusText: errorMessage,
                    statusTone: resolveAuthUnavailableTone(),
                });
                return {
                    ok: false,
                    error: errorMessage,
                };
            }

            if (!state.authenticated || !currentSession?.access_token) {
                return updateValidationFailure('Sign in before changing the password.');
            }

            const password = sanitizePassword(credentials.password);
            if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
                return updateValidationFailure(
                    `Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters.`
                );
            }

            updateState({
                loading: true,
                pendingAction: 'change-password',
                statusText: 'Updating password...',
                statusTone: 'info',
                requiresEmailConfirmation: false,
            });

            try {
                const { data, error } = await supabaseClient.auth.updateUser({
                    password,
                });
                if (error) {
                    throw error;
                }
                const nextSession =
                    data?.session && typeof data.session === 'object'
                        ? data.session
                        : currentSession && typeof currentSession === 'object'
                          ? {
                                ...currentSession,
                                user:
                                    data?.user && typeof data.user === 'object'
                                        ? data.user
                                        : currentSession.user,
                            }
                          : currentSession;
                applySession(nextSession || currentSession, {
                    statusText: 'Password updated.',
                    statusTone: 'success',
                });
                return {
                    ok: true,
                };
            } catch (error) {
                return updateRequestFailure(error);
            }
        },
        async syncPlayerEconomy(nextEconomyState = null, options = {}) {
            await initializeInternalSafe();
            if (!supabaseClient || !state.enabled) {
                return {
                    ok: false,
                    error: resolveAuthUnavailableMessage(),
                };
            }

            if (!state.authenticated || !currentSession?.access_token) {
                return {
                    ok: false,
                    error: 'Sign in before syncing wallet progress.',
                };
            }

            const normalizedEconomyState = normalizePlayerEconomyState(nextEconomyState);
            try {
                const payload = await postPlayerEconomyProfile(
                    currentSession.access_token,
                    normalizedEconomyState,
                    options?.transaction || null
                );
                applyPlayerEconomyProfileState(payload?.profile, {
                    source: 'server',
                });
                return {
                    ok: true,
                    economy: normalizePlayerEconomyState(
                        payload?.profile || normalizedEconomyState
                    ),
                    profile: normalizePlayerEconomyProfileState(payload?.profile, {
                        fallbackEconomy: normalizedEconomyState,
                        source: 'server',
                    }),
                };
            } catch (error) {
                return {
                    ok: false,
                    error: normalizeSupabaseEconomyError(error),
                };
            }
        },
        async purchaseCreditsPack() {
            await initializeInternalSafe();
            if (!supabaseClient || !state.enabled) {
                const errorMessage = resolveAuthUnavailableMessage();
                updateState({
                    loading: false,
                    pendingAction: '',
                    statusText: errorMessage,
                    statusTone: resolveAuthUnavailableTone(),
                });
                return {
                    ok: false,
                    error: errorMessage,
                };
            }

            if (!state.authenticated || !currentSession?.access_token) {
                return updateValidationFailure('Sign in before buying credits.');
            }

            updateState({
                loading: true,
                pendingAction: 'buy-credits',
                statusText: 'Opening secure credits checkout...',
                statusTone: 'info',
                requiresEmailConfirmation: false,
            });

            try {
                const payload = await createCreditsPurchaseCheckoutSession(
                    currentSession.access_token
                );
                if (typeof payload?.checkoutUrl !== 'string' || !payload.checkoutUrl) {
                    throw new Error('Could not start secure credits checkout.');
                }
                updateState({
                    loading: false,
                    pendingAction: '',
                    statusText: 'Redirecting to secure €1 checkout...',
                    statusTone: 'info',
                });
                window.location.assign(payload.checkoutUrl);
                return {
                    ok: true,
                    redirecting: true,
                    checkoutUrl: payload.checkoutUrl,
                };
            } catch (error) {
                return updateRequestFailure(error);
            }
        },
        async deleteAccount() {
            await initializeInternalSafe();
            if (!supabaseClient || !state.enabled) {
                const errorMessage = resolveAuthUnavailableMessage();
                updateState({
                    loading: false,
                    pendingAction: '',
                    statusText: errorMessage,
                    statusTone: resolveAuthUnavailableTone(),
                });
                return {
                    ok: false,
                    error: errorMessage,
                };
            }

            if (!state.authenticated || !currentSession?.access_token || !state.userId) {
                return updateValidationFailure('Sign in before deleting the account.');
            }

            await flushUserMetadataUpdateQueue();
            updateState({
                loading: true,
                pendingAction: 'delete-account',
                statusText: 'Deleting account...',
                statusTone: 'info',
                requiresEmailConfirmation: false,
            });

            try {
                const response = await window.fetch(AUTH_DELETE_ACCOUNT_ENDPOINT_PATH, {
                    method: 'DELETE',
                    cache: 'no-store',
                    credentials: 'same-origin',
                    headers: {
                        Authorization: `Bearer ${currentSession.access_token}`,
                    },
                });
                const payload = await readJsonResponse(response);
                if (!response.ok || !payload?.ok) {
                    throw new Error(payload?.error || 'Could not delete account.');
                }
                const { error: signOutError } = await supabaseClient.auth.signOut({
                    scope: 'local',
                });
                if (signOutError) {
                    console.warn('Local sign-out after account deletion failed:', signOutError);
                }
                clearAccountLocalData({
                    projectRef: browserConfig.projectRef,
                });
                applySignedOutState('Account deleted. You can create a new account at any time.');
                return {
                    ok: true,
                };
            } catch (error) {
                return updateRequestFailure(error);
            }
        },
        async updateProfileImage(file) {
            await initializeInternalSafe();
            if (!supabaseClient || !state.enabled) {
                const errorMessage = resolveAuthUnavailableMessage();
                updateState({
                    loading: false,
                    pendingAction: '',
                    statusText: errorMessage,
                    statusTone: resolveAuthUnavailableTone(),
                });
                return {
                    ok: false,
                    error: errorMessage,
                };
            }

            if (!state.authenticated || !state.userId) {
                return updateValidationFailure('Sign in before changing the profile photo.');
            }

            if (!browserConfig.profileImagesEnabled || !browserConfig.profileImagesBucket) {
                return updateValidationFailure(
                    'Profile image storage is not configured on this server.'
                );
            }

            updateState({
                loading: true,
                pendingAction: 'update-avatar',
                statusText: 'Preparing profile photo...',
                statusTone: 'info',
                requiresEmailConfirmation: false,
            });

            let nextAvatarPath = '';
            try {
                const preparedImage = await prepareProfileImageUpload(file);
                const oldAvatarPath = resolveProfileImagePath(currentSession?.user);
                nextAvatarPath = buildProfileImageStoragePath(
                    state.userId,
                    preparedImage.extension
                );
                const uploadResult = await supabaseClient.storage
                    .from(browserConfig.profileImagesBucket)
                    .upload(nextAvatarPath, preparedImage.blob, {
                        cacheControl: '3600',
                        contentType: preparedImage.contentType,
                        upsert: false,
                    });
                if (uploadResult.error) {
                    throw uploadResult.error;
                }

                updateState({
                    statusText: 'Saving profile photo...',
                    statusTone: 'info',
                });

                await queueUserMetadataUpdate(
                    {
                        avatar_path: nextAvatarPath,
                    },
                    {
                        statusText: 'Profile photo updated.',
                        statusTone: 'success',
                    }
                );

                if (oldAvatarPath && oldAvatarPath !== nextAvatarPath) {
                    await removeStoredStorageObjects(
                        [oldAvatarPath],
                        browserConfig.profileImagesBucket
                    ).catch(() => {});
                }

                return {
                    ok: true,
                };
            } catch (error) {
                await removeStoredStorageObjects(
                    nextAvatarPath ? [nextAvatarPath] : [],
                    browserConfig.profileImagesBucket
                ).catch(() => {});
                return updateRequestFailure(error);
            }
        },
        async removeProfileImage() {
            await initializeInternalSafe();
            if (!supabaseClient || !state.enabled) {
                const errorMessage = resolveAuthUnavailableMessage();
                updateState({
                    loading: false,
                    pendingAction: '',
                    statusText: errorMessage,
                    statusTone: resolveAuthUnavailableTone(),
                });
                return {
                    ok: false,
                    error: errorMessage,
                };
            }

            if (!state.authenticated || !state.userId) {
                return updateValidationFailure('Sign in before removing the profile photo.');
            }

            const currentAvatarPath = resolveProfileImagePath(currentSession?.user);
            if (!currentAvatarPath) {
                return updateValidationFailure('No profile photo is set.');
            }

            updateState({
                loading: true,
                pendingAction: 'remove-avatar',
                statusText: 'Removing profile photo...',
                statusTone: 'info',
                requiresEmailConfirmation: false,
            });

            try {
                await queueUserMetadataUpdate(
                    {
                        avatar_path: '',
                    },
                    {
                        statusText: 'Profile photo removed.',
                        statusTone: 'success',
                    }
                );

                await removeStoredStorageObjects(
                    [currentAvatarPath],
                    browserConfig.profileImagesBucket
                ).catch(() => {});
                return {
                    ok: true,
                };
            } catch (error) {
                return updateRequestFailure(error);
            }
        },
        async updateCarWrap(file) {
            await initializeInternalSafe();
            if (!supabaseClient || !state.enabled) {
                const errorMessage = resolveAuthUnavailableMessage();
                updateState({
                    loading: false,
                    pendingAction: '',
                    statusText: errorMessage,
                    statusTone: resolveAuthUnavailableTone(),
                });
                return {
                    ok: false,
                    error: errorMessage,
                };
            }

            if (!state.authenticated || !state.userId) {
                return updateValidationFailure('Sign in before changing the car wrap.');
            }

            if (!browserConfig.carWrapsEnabled || !browserConfig.carWrapsBucket) {
                return updateValidationFailure(
                    'Car wrap storage is not configured on this server.'
                );
            }

            updateState({
                loading: true,
                pendingAction: 'update-car-wrap',
                statusText: 'Preparing car wrap...',
                statusTone: 'info',
                requiresEmailConfirmation: false,
            });

            let nextCarWrapPath = '';
            try {
                const preparedImage = await prepareCarWrapUpload(file);
                const oldCarWrapPath = resolveCarWrapPath(currentSession?.user);
                nextCarWrapPath = buildCarWrapStoragePath(state.userId, preparedImage.extension);
                const uploadResult = await supabaseClient.storage
                    .from(browserConfig.carWrapsBucket)
                    .upload(nextCarWrapPath, preparedImage.blob, {
                        cacheControl: '3600',
                        contentType: preparedImage.contentType,
                        upsert: false,
                    });
                if (uploadResult.error) {
                    throw uploadResult.error;
                }

                updateState({
                    statusText: 'Saving car wrap...',
                    statusTone: 'info',
                });

                await queueUserMetadataUpdate(
                    {
                        car_wrap_path: nextCarWrapPath,
                        garage_wrap_preset_id: '',
                    },
                    {
                        statusText: 'Car wrap updated.',
                        statusTone: 'success',
                    }
                );

                if (oldCarWrapPath && oldCarWrapPath !== nextCarWrapPath) {
                    await removeStoredStorageObjects(
                        [oldCarWrapPath],
                        browserConfig.carWrapsBucket
                    ).catch(() => {});
                }

                return {
                    ok: true,
                };
            } catch (error) {
                await removeStoredStorageObjects(
                    nextCarWrapPath ? [nextCarWrapPath] : [],
                    browserConfig.carWrapsBucket
                ).catch(() => {});
                return updateRequestFailure(error);
            }
        },
        async removeCarWrap() {
            await initializeInternalSafe();
            if (!supabaseClient || !state.enabled) {
                const errorMessage = resolveAuthUnavailableMessage();
                updateState({
                    loading: false,
                    pendingAction: '',
                    statusText: errorMessage,
                    statusTone: resolveAuthUnavailableTone(),
                });
                return {
                    ok: false,
                    error: errorMessage,
                };
            }

            if (!state.authenticated || !state.userId) {
                return updateValidationFailure('Sign in before removing the car wrap.');
            }

            const currentCarWrapPath = resolveCarWrapPath(currentSession?.user);
            if (!currentCarWrapPath) {
                return updateValidationFailure('No custom car wrap is set.');
            }

            updateState({
                loading: true,
                pendingAction: 'remove-car-wrap',
                statusText: 'Removing car wrap...',
                statusTone: 'info',
                requiresEmailConfirmation: false,
            });

            try {
                await queueUserMetadataUpdate(
                    {
                        car_wrap_path: '',
                    },
                    {
                        statusText: 'Car wrap removed.',
                        statusTone: 'success',
                    }
                );

                await removeStoredStorageObjects(
                    [currentCarWrapPath],
                    browserConfig.carWrapsBucket
                ).catch(() => {});
                return {
                    ok: true,
                };
            } catch (error) {
                return updateRequestFailure(error);
            }
        },
        async updateChaseCameraSettings(settings = null) {
            await initializeInternalSafe();
            if (!supabaseClient || !state.enabled) {
                return {
                    ok: false,
                    error: resolveAuthUnavailableMessage(),
                };
            }

            if (!state.authenticated || !state.userId) {
                return {
                    ok: false,
                    error: 'Sign in before saving chase camera settings.',
                };
            }

            const normalizedSettings = sanitizeChaseCameraSettings(settings);
            try {
                await queueUserMetadataUpdate(
                    {
                        chase_camera_settings: normalizedSettings,
                    },
                    {
                        preserveStatus: true,
                    }
                );
                return {
                    ok: true,
                    settings: normalizedSettings,
                };
            } catch (error) {
                return {
                    ok: false,
                    error: normalizeSupabaseAuthError(error),
                };
            }
        },
        async updateGaragePreferences(preferences = null) {
            await initializeInternalSafe();
            if (!supabaseClient || !state.enabled) {
                return {
                    ok: false,
                    error: resolveAuthUnavailableMessage(),
                };
            }

            if (!state.authenticated || !state.userId) {
                return {
                    ok: false,
                    error: 'Sign in before saving garage settings.',
                };
            }

            const source = preferences && typeof preferences === 'object' ? preferences : {};
            const hasGarageWrapPresetUpdate = Object.prototype.hasOwnProperty.call(
                source,
                'garageWrapPresetId'
            );
            const hasWheelPresetUpdate = Object.prototype.hasOwnProperty.call(
                source,
                'wheelPresetId'
            );
            if (!hasGarageWrapPresetUpdate && !hasWheelPresetUpdate) {
                return {
                    ok: true,
                    ignored: true,
                };
            }

            const metadataUpdates = {};
            if (hasGarageWrapPresetUpdate) {
                metadataUpdates.garage_wrap_preset_id = sanitizeGarageWrapPresetId(
                    source.garageWrapPresetId || ''
                );
            }
            if (hasWheelPresetUpdate) {
                metadataUpdates.wheel_preset_id = resolvePlayerWheelPresetId(
                    source.wheelPresetId || ''
                );
            }

            try {
                await queueUserMetadataUpdate(metadataUpdates, {
                    preserveStatus: true,
                });
                return {
                    ok: true,
                    garageWrapPresetId: hasGarageWrapPresetUpdate
                        ? metadataUpdates.garage_wrap_preset_id
                        : state.accountGarageWrapPresetId,
                    wheelPresetId: hasWheelPresetUpdate
                        ? metadataUpdates.wheel_preset_id
                        : state.accountWheelPresetId,
                };
            } catch (error) {
                return {
                    ok: false,
                    error: normalizeSupabaseAuthError(error),
                };
            }
        },
        async updateAccountSettings(settings = null) {
            return runTrackedUserMetadataRequest(async () => {
                await initializeInternalSafe();
                if (!supabaseClient || !state.enabled) {
                    return {
                        ok: false,
                        error: resolveAuthUnavailableMessage(),
                    };
                }

                if (!state.authenticated || !state.userId) {
                    return {
                        ok: false,
                        error: 'Sign in before saving account settings.',
                    };
                }

                const source = settings && typeof settings === 'object' ? settings : {};
                const hasAutoFullscreenUpdate = Object.prototype.hasOwnProperty.call(
                    source,
                    'autoFullscreenOnStart'
                );
                const hasHideGameplayPanelsUpdate = Object.prototype.hasOwnProperty.call(
                    source,
                    'hideGameplayPanels'
                );
                const hasProfileScreensaverUpdate = Object.prototype.hasOwnProperty.call(
                    source,
                    'profileScreensaverEnabled'
                );
                const hasAudioPrefsUpdate = Object.prototype.hasOwnProperty.call(
                    source,
                    'audioPrefs'
                );
                if (
                    !hasAutoFullscreenUpdate &&
                    !hasHideGameplayPanelsUpdate &&
                    !hasProfileScreensaverUpdate &&
                    !hasAudioPrefsUpdate
                ) {
                    return {
                        ok: true,
                        ignored: true,
                    };
                }

                const metadataUpdates = {};
                if (hasAutoFullscreenUpdate) {
                    metadataUpdates.auto_fullscreen_on_start = sanitizeAccountSettingBoolean(
                        source.autoFullscreenOnStart,
                        DEFAULT_ACCOUNT_AUTO_FULLSCREEN_ON_START
                    );
                }
                if (hasHideGameplayPanelsUpdate) {
                    metadataUpdates.hide_gameplay_panels = sanitizeAccountSettingBoolean(
                        source.hideGameplayPanels,
                        DEFAULT_ACCOUNT_HIDE_GAMEPLAY_PANELS
                    );
                }
                if (hasProfileScreensaverUpdate) {
                    metadataUpdates.profile_screensaver_enabled = sanitizeAccountSettingBoolean(
                        source.profileScreensaverEnabled,
                        DEFAULT_ACCOUNT_PROFILE_SCREENSAVER_ENABLED
                    );
                }
                if (hasAudioPrefsUpdate) {
                    metadataUpdates.audio_prefs = sanitizeAccountAudioPrefs(
                        source.audioPrefs,
                        DEFAULT_ACCOUNT_AUDIO_PREFS
                    );
                }

                try {
                    await queueUserMetadataUpdate(metadataUpdates, {
                        preserveStatus: true,
                    });
                    return {
                        ok: true,
                        autoFullscreenOnStart: hasAutoFullscreenUpdate
                            ? metadataUpdates.auto_fullscreen_on_start
                            : state.accountAutoFullscreenOnStart,
                        hideGameplayPanels: hasHideGameplayPanelsUpdate
                            ? metadataUpdates.hide_gameplay_panels
                            : state.accountHideGameplayPanels,
                        profileScreensaverEnabled: hasProfileScreensaverUpdate
                            ? metadataUpdates.profile_screensaver_enabled
                            : state.accountProfileScreensaverEnabled,
                        audioPrefs: hasAudioPrefsUpdate
                            ? { ...metadataUpdates.audio_prefs }
                            : state.accountAudioPrefs
                              ? {
                                    ...state.accountAudioPrefs,
                                }
                              : null,
                    };
                } catch (error) {
                    return {
                        ok: false,
                        error: normalizeSupabaseAuthError(error),
                    };
                }
            });
        },
        dispose() {
            if (authSubscription && typeof authSubscription.unsubscribe === 'function') {
                authSubscription.unsubscribe();
            }
            authSubscription = null;
        },
        getState() {
            return {
                ...state,
            };
        },
        getAccessToken() {
            return typeof currentSession?.access_token === 'string'
                ? currentSession.access_token
                : '';
        },
        isAuthenticated() {
            return Boolean(state.authenticated);
        },
        subscribe(listener) {
            if (typeof listener !== 'function') {
                return () => {};
            }
            listeners.add(listener);
            listener({
                ...state,
            });
            return () => {
                listeners.delete(listener);
            };
        },
    };

    async function initializeInternalSafe() {
        try {
            if (!initializePromise) {
                initializePromise = initializeInternal();
            }
            await initializePromise;
            if (!state.enabled && browserConfig?.unavailableReason === 'config-unreachable') {
                initializePromise = null;
            }
        } catch {
            initializePromise = null;
            // The state is already updated with the failure details.
        }
    }

    function runTrackedUserMetadataRequest(operation) {
        let requestPromise;
        try {
            requestPromise = Promise.resolve(operation());
        } catch (error) {
            requestPromise = Promise.reject(error);
        }
        pendingUserMetadataRequests.add(requestPromise);
        requestPromise.finally(() => {
            pendingUserMetadataRequests.delete(requestPromise);
        });
        return requestPromise;
    }

    function queueUserMetadataUpdate(metadataUpdates = {}, applySessionOptions = {}) {
        const runUpdate = async () => {
            const metadata = buildUpdatedUserMetadata(
                currentSession?.user,
                metadataUpdates,
                state.displayName
            );
            const { data, error } = await supabaseClient.auth.updateUser({
                data: metadata,
            });
            if (error) {
                throw error;
            }
            applySession(mergeCurrentSessionUser(data?.user), applySessionOptions);
            return data?.user || null;
        };

        const queuedUpdate = userMetadataUpdateQueue.then(runUpdate, runUpdate);
        userMetadataUpdateQueue = queuedUpdate.catch(() => {});
        return queuedUpdate;
    }

    async function flushUserMetadataUpdateQueue() {
        while (pendingUserMetadataRequests.size > 0) {
            const pendingRequests = Array.from(pendingUserMetadataRequests);
            await Promise.allSettled(pendingRequests);
        }
        try {
            await userMetadataUpdateQueue;
        } catch {
            // Metadata flush failures are handled by the originating request.
        }
    }

    async function initializeInternal() {
        let config = await getSupabaseBrowserConfig();
        if (!config?.enabled && config?.unavailableReason === 'config-unreachable') {
            config = await getSupabaseBrowserConfig({ force: true });
        }
        browserConfig =
            config && typeof config === 'object' ? config : createInitialBrowserConfig();
        if (!config.enabled) {
            updateState({
                enabled: false,
                profileImageEnabled: false,
                carWrapEnabled: false,
                ready: true,
                loading: false,
                pendingAction: '',
                authenticated: false,
                userId: '',
                email: '',
                displayName: '',
                avatarUrl: '',
                avatarStoragePath: '',
                carWrapUrl: '',
                carWrapStoragePath: '',
                credits: 0,
                unlockedVehicleIds: [...createDefaultPlayerEconomyState().unlockedVehicleIds],
                unlockedWheelPresetIds: [
                    ...createDefaultPlayerEconomyState().unlockedWheelPresetIds,
                ],
                economySyncSource: 'local',
                economyLastSyncedAt: '',
                economyLifetimeEarned: 0,
                economyLifetimeSpent: 0,
                economyTransactionCount: 0,
                economyRecentTransactions: [],
                statusText: resolveAuthUnavailableMessage(),
                statusTone: resolveAuthUnavailableTone(),
            });
            return getStateSnapshot();
        }

        updateState({
            enabled: true,
            profileImageEnabled: Boolean(config.profileImagesEnabled && config.profileImagesBucket),
            carWrapEnabled: Boolean(config.carWrapsEnabled && config.carWrapsBucket),
            ready: false,
            loading: true,
            pendingAction: '',
            statusText: 'Checking saved session...',
            statusTone: 'muted',
        });

        try {
            supabaseClient = await getSupabaseBrowserClient();
            if (!supabaseClient) {
                updateState({
                    enabled: false,
                    profileImageEnabled: false,
                    carWrapEnabled: false,
                    ready: true,
                    loading: false,
                    authenticated: false,
                    userId: '',
                    email: '',
                    displayName: '',
                    avatarUrl: '',
                    avatarStoragePath: '',
                    carWrapUrl: '',
                    carWrapStoragePath: '',
                    credits: 0,
                    unlockedVehicleIds: [...createDefaultPlayerEconomyState().unlockedVehicleIds],
                    unlockedWheelPresetIds: [
                        ...createDefaultPlayerEconomyState().unlockedWheelPresetIds,
                    ],
                    economySyncSource: 'local',
                    economyLastSyncedAt: '',
                    economyLifetimeEarned: 0,
                    economyLifetimeSpent: 0,
                    economyTransactionCount: 0,
                    economyRecentTransactions: [],
                    statusText: 'Supabase auth client failed to load.',
                    statusTone: 'error',
                });
                return getStateSnapshot();
            }

            if (!authSubscription) {
                const subscriptionResult = supabaseClient.auth.onAuthStateChange(
                    (event, session) => {
                        handleAuthStateChange(event, session);
                    }
                );
                authSubscription =
                    subscriptionResult?.data?.subscription ||
                    subscriptionResult?.subscription ||
                    null;
            }

            const { data, error } = await supabaseClient.auth.getSession();
            if (error) {
                throw error;
            }
            const hydratedSession = await refreshSessionUser(data?.session || null);
            applySession(hydratedSession, {
                preserveStatus: false,
            });
            return getStateSnapshot();
        } catch (error) {
            currentSession = null;
            updateState({
                enabled: true,
                profileImageEnabled: Boolean(
                    browserConfig.profileImagesEnabled && browserConfig.profileImagesBucket
                ),
                carWrapEnabled: Boolean(
                    browserConfig.carWrapsEnabled && browserConfig.carWrapsBucket
                ),
                ready: true,
                loading: false,
                pendingAction: '',
                authenticated: false,
                userId: '',
                email: '',
                displayName: '',
                avatarUrl: '',
                avatarStoragePath: '',
                carWrapUrl: '',
                carWrapStoragePath: '',
                credits: 0,
                unlockedVehicleIds: [...createDefaultPlayerEconomyState().unlockedVehicleIds],
                unlockedWheelPresetIds: [
                    ...createDefaultPlayerEconomyState().unlockedWheelPresetIds,
                ],
                economySyncSource: 'local',
                economyLastSyncedAt: '',
                economyLifetimeEarned: 0,
                economyLifetimeSpent: 0,
                economyTransactionCount: 0,
                economyRecentTransactions: [],
                statusText: normalizeSupabaseAuthError(error),
                statusTone: 'error',
            });
            throw error;
        }
    }

    function handleAuthStateChange(event, session) {
        if (event === 'SIGNED_OUT') {
            applySignedOutState('Signed out. Sign in to create or join online rooms.');
            return;
        }

        if (event === 'PASSWORD_RECOVERY') {
            applySession(session, {
                statusText: 'Password recovery session opened.',
                statusTone: 'info',
            });
            return;
        }

        if (event === 'USER_UPDATED') {
            applySession(session, {
                preserveStatus: true,
            });
            return;
        }

        if (event === 'SIGNED_IN') {
            applySession(session, {
                statusText: 'Signed in. Online rooms and score sync are unlocked.',
                statusTone: 'success',
            });
            return;
        }

        applySession(session, {
            preserveStatus: true,
        });
    }

    async function refreshPlayerEconomyProfile({ legacyFallback = null } = {}) {
        if (!state.authenticated || !currentSession?.access_token || !state.userId) {
            return {
                ok: false,
                error: 'Sign in before loading wallet progress.',
            };
        }

        const requestUserId = state.userId;
        try {
            const payload = await requestPlayerEconomyProfile(currentSession.access_token);
            const normalizedProfile = normalizePlayerEconomyProfileState(payload?.profile, {
                fallbackEconomy: legacyFallback,
                source: 'server',
            });
            if (!normalizedProfile.exists && shouldMigrateLegacyEconomyState(legacyFallback)) {
                const migrationPayload = await postPlayerEconomyProfile(
                    currentSession.access_token,
                    legacyFallback,
                    null
                );
                if (state.userId !== requestUserId) {
                    return {
                        ok: false,
                        ignored: true,
                    };
                }
                applyPlayerEconomyProfileState(migrationPayload?.profile, {
                    source: 'server',
                });
                return {
                    ok: true,
                    migrated: true,
                    economy: normalizePlayerEconomyState(
                        migrationPayload?.profile || legacyFallback
                    ),
                    profile: normalizePlayerEconomyProfileState(migrationPayload?.profile, {
                        fallbackEconomy: legacyFallback,
                        source: 'server',
                    }),
                };
            }
            if (state.userId !== requestUserId) {
                return {
                    ok: false,
                    ignored: true,
                };
            }
            applyPlayerEconomyProfileState(normalizedProfile, {
                source: 'server',
            });
            return {
                ok: true,
                economy: normalizePlayerEconomyState(normalizedProfile),
                profile: normalizedProfile,
            };
        } catch (error) {
            if (state.userId === requestUserId) {
                updateState({
                    economySyncSource: 'local',
                });
            }
            return {
                ok: false,
                error: normalizeSupabaseEconomyError(error),
            };
        }
    }

    function applyPlayerEconomyProfileState(profile = null, options = {}) {
        const normalizedProfile = normalizePlayerEconomyProfileState(profile, {
            fallbackEconomy: {
                credits: state.credits,
                unlockedVehicleIds: state.unlockedVehicleIds,
                unlockedWheelPresetIds: state.unlockedWheelPresetIds,
            },
            source: options?.source,
        });
        if (normalizedProfile.userId && state.userId && normalizedProfile.userId !== state.userId) {
            return false;
        }
        updateState({
            credits: normalizedProfile.credits,
            unlockedVehicleIds: [...normalizedProfile.unlockedVehicleIds],
            unlockedWheelPresetIds: [...normalizedProfile.unlockedWheelPresetIds],
            economySyncSource: normalizedProfile.syncSource,
            economyLastSyncedAt: normalizedProfile.lastSyncedAt,
            economyLifetimeEarned: normalizedProfile.lifetimeEarned,
            economyLifetimeSpent: normalizedProfile.lifetimeSpent,
            economyTransactionCount: normalizedProfile.transactionCount,
            economyRecentTransactions: normalizedProfile.recentTransactions.map((entry) => ({
                ...entry,
            })),
        });
        return true;
    }

    function applySession(session, options = {}) {
        currentSession = session && typeof session === 'object' ? session : null;
        const user = currentSession?.user || null;
        const authenticated = Boolean(currentSession?.access_token && user?.id);
        const resolvedUserId = authenticated ? sanitizeUserId(user?.id) : '';
        const email = sanitizeEmail(user?.email || '');
        const displayName = resolveDisplayName(user, email);
        const avatarStoragePath = authenticated ? resolveProfileImagePath(user) : '';
        const carWrapStoragePath = authenticated ? resolveCarWrapPath(user) : '';
        const accountGarageWrapPresetConfigured = authenticated
            ? hasUserMetadataField(user?.user_metadata, 'garage_wrap_preset_id')
            : false;
        const accountGarageWrapPresetId = authenticated ? resolveGarageWrapPresetId(user) : '';
        const accountWheelPresetConfigured = authenticated
            ? hasUserMetadataField(user?.user_metadata, 'wheel_preset_id')
            : false;
        const accountWheelPresetId = authenticated ? resolveWheelPresetId(user) : '';
        const accountAutoFullscreenConfigured = authenticated
            ? hasUserMetadataField(user?.user_metadata, 'auto_fullscreen_on_start')
            : false;
        const accountAutoFullscreenOnStart = authenticated
            ? resolveAccountAutoFullscreenOnStart(user)
            : DEFAULT_ACCOUNT_AUTO_FULLSCREEN_ON_START;
        const accountHideGameplayPanelsConfigured = authenticated
            ? hasUserMetadataField(user?.user_metadata, 'hide_gameplay_panels')
            : false;
        const accountHideGameplayPanels = authenticated
            ? resolveAccountHideGameplayPanels(user)
            : DEFAULT_ACCOUNT_HIDE_GAMEPLAY_PANELS;
        const accountProfileScreensaverConfigured = authenticated
            ? hasUserMetadataField(user?.user_metadata, 'profile_screensaver_enabled')
            : false;
        const accountProfileScreensaverEnabled = authenticated
            ? resolveAccountProfileScreensaverEnabled(user)
            : DEFAULT_ACCOUNT_PROFILE_SCREENSAVER_ENABLED;
        const accountAudioPrefsConfigured = authenticated
            ? hasUserMetadataField(user?.user_metadata, 'audio_prefs')
            : false;
        const accountAudioPrefs = authenticated ? resolveAccountAudioPrefs(user) : null;
        const playerEconomyState = authenticated
            ? mergePlayerEconomyStates(
                  state.userId && state.userId === resolvedUserId
                      ? {
                            credits: state.credits,
                            unlockedVehicleIds: state.unlockedVehicleIds,
                            unlockedWheelPresetIds: state.unlockedWheelPresetIds,
                        }
                      : null,
                  resolvePlayerEconomyStateFromSource(user)
              )
            : createDefaultPlayerEconomyState();
        const avatarUrl = authenticated
            ? resolveStorageObjectPublicUrl(
                  browserConfig.url,
                  browserConfig.profileImagesBucket,
                  avatarStoragePath
              )
            : '';
        const carWrapUrl = authenticated
            ? resolveStorageObjectPublicUrl(
                  browserConfig.url,
                  browserConfig.carWrapsBucket,
                  carWrapStoragePath
              )
            : '';
        const chaseCameraSettings = authenticated ? resolveChaseCameraSettings(user) : null;
        if (authenticated && displayName) {
            writeStoredPlayerName(displayName);
        }

        const shouldPreserveStatus = Boolean(options?.preserveStatus);
        const preserveServerEconomyProfile =
            authenticated &&
            state.userId === resolvedUserId &&
            state.economySyncSource === 'server';
        updateState({
            enabled: true,
            profileImageEnabled: Boolean(
                browserConfig.profileImagesEnabled && browserConfig.profileImagesBucket
            ),
            carWrapEnabled: Boolean(browserConfig.carWrapsEnabled && browserConfig.carWrapsBucket),
            ready: true,
            loading: false,
            pendingAction: '',
            authenticated,
            userId: resolvedUserId,
            email: authenticated ? email : '',
            displayName: authenticated ? displayName : '',
            avatarUrl,
            avatarStoragePath,
            carWrapUrl,
            carWrapStoragePath,
            accountGarageWrapPresetConfigured,
            accountGarageWrapPresetId,
            accountWheelPresetConfigured,
            accountWheelPresetId,
            accountAutoFullscreenConfigured,
            accountAutoFullscreenOnStart,
            accountHideGameplayPanelsConfigured,
            accountHideGameplayPanels,
            accountProfileScreensaverConfigured,
            accountProfileScreensaverEnabled,
            accountAudioPrefsConfigured,
            accountAudioPrefs: accountAudioPrefs ? { ...accountAudioPrefs } : null,
            credits: playerEconomyState.credits,
            unlockedVehicleIds: [...playerEconomyState.unlockedVehicleIds],
            unlockedWheelPresetIds: [...playerEconomyState.unlockedWheelPresetIds],
            economySyncSource: preserveServerEconomyProfile
                ? 'server'
                : authenticated
                  ? 'pending'
                  : 'local',
            economyLastSyncedAt: preserveServerEconomyProfile ? state.economyLastSyncedAt : '',
            economyLifetimeEarned: preserveServerEconomyProfile ? state.economyLifetimeEarned : 0,
            economyLifetimeSpent: preserveServerEconomyProfile ? state.economyLifetimeSpent : 0,
            economyTransactionCount: preserveServerEconomyProfile
                ? state.economyTransactionCount
                : 0,
            economyRecentTransactions: preserveServerEconomyProfile
                ? state.economyRecentTransactions.map((entry) => ({ ...entry }))
                : [],
            chaseCameraSettings,
            requiresEmailConfirmation: false,
            statusText:
                typeof options?.statusText === 'string'
                    ? options.statusText
                    : shouldPreserveStatus
                      ? state.statusText
                      : authenticated
                        ? 'Signed in. Online rooms and score sync are unlocked.'
                        : 'Create an account or sign in to unlock online rooms and score sync.',
            statusTone:
                typeof options?.statusTone === 'string'
                    ? options.statusTone
                    : shouldPreserveStatus
                      ? state.statusTone
                      : authenticated
                        ? 'success'
                        : 'muted',
        });
        void queueCreditsPurchaseReturnResolution();
        if (authenticated) {
            void refreshPlayerEconomyProfile({
                legacyFallback: playerEconomyState,
            }).catch(() => {});
        }
    }

    function applySignedOutState(statusText) {
        currentSession = null;
        updateState({
            enabled: state.enabled,
            profileImageEnabled: state.profileImageEnabled,
            carWrapEnabled: state.carWrapEnabled,
            ready: true,
            loading: false,
            pendingAction: '',
            authenticated: false,
            userId: '',
            email: '',
            displayName: '',
            avatarUrl: '',
            avatarStoragePath: '',
            carWrapUrl: '',
            carWrapStoragePath: '',
            accountGarageWrapPresetConfigured: false,
            accountGarageWrapPresetId: '',
            accountWheelPresetConfigured: false,
            accountWheelPresetId: '',
            accountAutoFullscreenConfigured: false,
            accountAutoFullscreenOnStart: DEFAULT_ACCOUNT_AUTO_FULLSCREEN_ON_START,
            accountHideGameplayPanelsConfigured: false,
            accountHideGameplayPanels: DEFAULT_ACCOUNT_HIDE_GAMEPLAY_PANELS,
            accountProfileScreensaverConfigured: false,
            accountProfileScreensaverEnabled: DEFAULT_ACCOUNT_PROFILE_SCREENSAVER_ENABLED,
            accountAudioPrefsConfigured: false,
            accountAudioPrefs: null,
            credits: 0,
            unlockedVehicleIds: createDefaultPlayerEconomyState().unlockedVehicleIds,
            unlockedWheelPresetIds: createDefaultPlayerEconomyState().unlockedWheelPresetIds,
            economySyncSource: 'local',
            economyLastSyncedAt: '',
            economyLifetimeEarned: 0,
            economyLifetimeSpent: 0,
            economyTransactionCount: 0,
            economyRecentTransactions: [],
            chaseCameraSettings: null,
            requiresEmailConfirmation: false,
            statusText,
            statusTone: 'info',
        });
    }

    function updateValidationFailure(message) {
        updateState({
            loading: false,
            pendingAction: '',
            statusText: message,
            statusTone: 'error',
        });
        return {
            ok: false,
            error: message,
        };
    }

    function updateRequestFailure(error) {
        const errorMessage = normalizeSupabaseAuthError(error);
        updateState({
            loading: false,
            pendingAction: '',
            statusText: errorMessage,
            statusTone: 'error',
        });
        return {
            ok: false,
            error: errorMessage,
        };
    }

    function updateState(nextState = {}) {
        state = {
            ...state,
            ...nextState,
        };
        const snapshot = getStateSnapshot();
        onStateChanged?.(snapshot);
        listeners.forEach((listener) => {
            listener(snapshot);
        });
    }

    function notifyToast(message, tone = 'info', durationMs = undefined) {
        const text = typeof message === 'string' ? message.trim() : '';
        if (!text || typeof onToast !== 'function') {
            return;
        }
        try {
            onToast({
                message: text,
                tone,
                durationMs,
            });
        } catch {
            // Toast callbacks must not interrupt auth state updates.
        }
    }

    function queueCreditsPurchaseReturnResolution() {
        const returnContext = readCreditsPurchaseReturnContext();
        if (!returnContext) {
            return null;
        }
        if (creditsPurchaseReturnPromise) {
            return creditsPurchaseReturnPromise;
        }
        creditsPurchaseReturnPromise = resolveCreditsPurchaseReturn(returnContext).finally(() => {
            creditsPurchaseReturnPromise = null;
        });
        return creditsPurchaseReturnPromise;
    }

    async function resolveCreditsPurchaseReturn(returnContext = null) {
        if (!returnContext) {
            return {
                ok: false,
                ignored: true,
            };
        }

        if (returnContext.state === 'cancel') {
            clearCreditsPurchaseReturnContext();
            updateState({
                loading: false,
                pendingAction: '',
                statusText: 'Credits checkout was canceled.',
                statusTone: 'info',
            });
            notifyToast('Credits checkout was canceled.', 'info');
            return {
                ok: false,
                canceled: true,
            };
        }

        if (!returnContext.sessionId) {
            clearCreditsPurchaseReturnContext();
            updateState({
                loading: false,
                pendingAction: '',
                statusText: 'Credits checkout could not be verified.',
                statusTone: 'error',
            });
            return {
                ok: false,
                error: 'Missing Stripe checkout session ID.',
            };
        }

        if (!currentSession?.access_token) {
            clearCreditsPurchaseReturnContext();
            updateState({
                loading: false,
                pendingAction: '',
                statusText: 'Credits purchase returned. Sign in to refresh the wallet.',
                statusTone: 'info',
            });
            notifyToast('Credits purchase returned. Sign in to refresh the wallet.', 'info');
            return {
                ok: false,
                requiresSignIn: true,
            };
        }

        updateState({
            loading: true,
            pendingAction: 'verify-credits',
            statusText: 'Verifying credits purchase...',
            statusTone: 'info',
        });

        try {
            const payload = await requestCreditsPurchaseSessionStatus(
                currentSession.access_token,
                returnContext.sessionId
            );
            clearCreditsPurchaseReturnContext();
            if (payload?.profile) {
                applyPlayerEconomyProfileState(payload.profile, {
                    source: 'server',
                });
            }
            const creditsGranted = clampEconomyInteger(payload?.creditsGranted);
            const purchaseStatus = sanitizeCreditsPurchaseStatus(payload?.status);
            if (purchaseStatus === 'paid') {
                const successMessage =
                    creditsGranted > 0
                        ? `${formatPlayerCredits(creditsGranted)} added to your wallet.`
                        : 'Credits purchase confirmed.';
                updateState({
                    loading: false,
                    pendingAction: '',
                    statusText: successMessage,
                    statusTone: 'success',
                });
                notifyToast(successMessage, 'success', 4200);
                return {
                    ok: true,
                    paid: true,
                    profile: payload?.profile || null,
                };
            }

            const statusMessage = resolveCreditsPurchaseStatusMessage(purchaseStatus);
            updateState({
                loading: false,
                pendingAction: '',
                statusText: statusMessage,
                statusTone: purchaseStatus === 'expired' ? 'error' : 'info',
            });
            notifyToast(statusMessage, purchaseStatus === 'expired' ? 'error' : 'info', 3600);
            return {
                ok: false,
                status: purchaseStatus,
            };
        } catch (error) {
            clearCreditsPurchaseReturnContext();
            const errorMessage = normalizeSupabaseEconomyError(error);
            updateState({
                loading: false,
                pendingAction: '',
                statusText: errorMessage,
                statusTone: 'error',
            });
            return {
                ok: false,
                error: errorMessage,
            };
        }
    }

    async function removeStoredStorageObjects(paths = [], bucketName = '') {
        const safePaths = Array.isArray(paths)
            ? paths.map((path) => sanitizeStorageObjectPath(path)).filter(Boolean)
            : [];
        const safeBucketName = sanitizeProfileImageBucketName(bucketName);
        if (!supabaseClient || !safeBucketName || safePaths.length === 0) {
            return;
        }
        const { error } = await supabaseClient.storage.from(safeBucketName).remove(safePaths);
        if (error) {
            throw error;
        }
    }

    async function refreshSessionUser(session = null) {
        if (!supabaseClient?.auth?.getUser || !session || typeof session !== 'object') {
            return session;
        }

        const accessToken =
            typeof session.access_token === 'string'
                ? session.access_token.trim().slice(0, 4096)
                : '';
        const sessionUserId = sanitizeUserId(session?.user?.id || '');
        if (!accessToken || !sessionUserId) {
            return session;
        }

        try {
            const { data, error } = await supabaseClient.auth.getUser(accessToken);
            if (error || sanitizeUserId(data?.user?.id || '') !== sessionUserId) {
                return session;
            }
            return mergeSessionUser(session, data.user);
        } catch {
            return session;
        }
    }

    function mergeCurrentSessionUser(nextUser = null) {
        return mergeSessionUser(currentSession, nextUser);
    }

    function mergeSessionUser(session = null, nextUser = null) {
        if (!session || typeof session !== 'object') {
            return session;
        }
        return {
            ...session,
            user:
                nextUser && typeof nextUser === 'object'
                    ? nextUser
                    : session.user && typeof session.user === 'object'
                      ? session.user
                      : null,
        };
    }

    function getStateSnapshot() {
        return {
            ...state,
        };
    }
}

function createInitialAuthState() {
    return {
        enabled: false,
        profileImageEnabled: false,
        carWrapEnabled: false,
        ready: false,
        loading: false,
        pendingAction: '',
        authenticated: false,
        userId: '',
        email: '',
        displayName: '',
        avatarUrl: '',
        avatarStoragePath: '',
        carWrapUrl: '',
        carWrapStoragePath: '',
        accountGarageWrapPresetConfigured: false,
        accountGarageWrapPresetId: '',
        accountWheelPresetConfigured: false,
        accountWheelPresetId: '',
        accountAutoFullscreenConfigured: false,
        accountAutoFullscreenOnStart: DEFAULT_ACCOUNT_AUTO_FULLSCREEN_ON_START,
        accountHideGameplayPanelsConfigured: false,
        accountHideGameplayPanels: DEFAULT_ACCOUNT_HIDE_GAMEPLAY_PANELS,
        accountProfileScreensaverConfigured: false,
        accountProfileScreensaverEnabled: DEFAULT_ACCOUNT_PROFILE_SCREENSAVER_ENABLED,
        accountAudioPrefsConfigured: false,
        accountAudioPrefs: null,
        credits: 0,
        unlockedVehicleIds: [...createDefaultPlayerEconomyState().unlockedVehicleIds],
        unlockedWheelPresetIds: [...createDefaultPlayerEconomyState().unlockedWheelPresetIds],
        economySyncSource: 'local',
        economyLastSyncedAt: '',
        economyLifetimeEarned: 0,
        economyLifetimeSpent: 0,
        economyTransactionCount: 0,
        economyRecentTransactions: [],
        chaseCameraSettings: null,
        requiresEmailConfirmation: false,
        statusText: 'Create an account or sign in to unlock online rooms and score sync.',
        statusTone: 'muted',
    };
}

function createInitialBrowserConfig() {
    return {
        enabled: false,
        url: '',
        anonKey: '',
        projectRef: '',
        profileImagesBucket: '',
        profileImagesEnabled: false,
        carWrapsBucket: '',
        carWrapsEnabled: false,
        leaderboardEnabled: false,
        unavailableReason: '',
        unavailableStatusText: '',
    };
}

function sanitizeEmail(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase().slice(0, 320);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized) ? normalized : '';
}

function sanitizePassword(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.slice(0, 256);
}

function sanitizeDisplayName(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\p{L}\p{N} _.\-]/gu, '')
        .slice(0, PLAYER_NAME_MAX_LENGTH);
    return normalized || '';
}

function sanitizeUserId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().slice(0, 128);
    return /^[a-zA-Z0-9-]{6,128}$/u.test(normalized) ? normalized : '';
}

function sanitizeProfileImageBucketName(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase();
    if (normalized.length < 3 || normalized.length > 63) {
        return '';
    }
    if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u.test(normalized)) {
        return '';
    }
    return normalized;
}

function sanitizeProfileImagePath(value) {
    return sanitizeStorageObjectPath(value);
}

function sanitizeStorageObjectPath(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().replace(/^\/+|\/+$/g, '');
    if (!normalized || normalized.length > 512 || normalized.includes('..')) {
        return '';
    }
    const segments = normalized.split('/');
    if (segments.some((segment) => !/^[a-zA-Z0-9._-]{1,120}$/u.test(segment))) {
        return '';
    }
    return normalized;
}

function sanitizeGarageWrapPresetId(value) {
    return typeof value === 'string'
        ? value
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, '')
              .slice(0, 48)
        : '';
}

function resolveProfileImagePath(user) {
    return sanitizeProfileImagePath(user?.user_metadata?.avatar_path || '');
}

function resolveCarWrapPath(user) {
    return sanitizeStorageObjectPath(user?.user_metadata?.car_wrap_path || '');
}

function resolveGarageWrapPresetId(user) {
    return sanitizeGarageWrapPresetId(user?.user_metadata?.garage_wrap_preset_id || '');
}

function resolveWheelPresetId(user) {
    return sanitizePlayerWheelPresetId(user?.user_metadata?.wheel_preset_id || '');
}

function resolveChaseCameraSettings(user) {
    return sanitizeChaseCameraSettings(user?.user_metadata?.chase_camera_settings);
}

function resolveAccountAutoFullscreenOnStart(user) {
    return sanitizeAccountSettingBoolean(
        user?.user_metadata?.auto_fullscreen_on_start,
        DEFAULT_ACCOUNT_AUTO_FULLSCREEN_ON_START
    );
}

function resolveAccountHideGameplayPanels(user) {
    return sanitizeAccountSettingBoolean(
        user?.user_metadata?.hide_gameplay_panels,
        DEFAULT_ACCOUNT_HIDE_GAMEPLAY_PANELS
    );
}

function resolveAccountProfileScreensaverEnabled(user) {
    return sanitizeAccountSettingBoolean(
        user?.user_metadata?.profile_screensaver_enabled,
        DEFAULT_ACCOUNT_PROFILE_SCREENSAVER_ENABLED
    );
}

function resolveAccountAudioPrefs(user) {
    return sanitizeAccountAudioPrefs(user?.user_metadata?.audio_prefs, DEFAULT_ACCOUNT_AUDIO_PREFS);
}

function resolveStorageObjectPublicUrl(baseUrl, bucketName, objectPath) {
    const safeBaseUrl =
        typeof baseUrl === 'string' && /^(https?:)?\/\//iu.test(baseUrl.trim())
            ? baseUrl.trim().replace(/\/+$/u, '')
            : '';
    const safeBucketName = sanitizeProfileImageBucketName(bucketName);
    const safeObjectPath = sanitizeStorageObjectPath(objectPath);
    if (!safeBaseUrl || !safeBucketName || !safeObjectPath) {
        return '';
    }
    const encodedPath = safeObjectPath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
    return `${safeBaseUrl}/storage/v1/object/public/${encodeURIComponent(safeBucketName)}/${encodedPath}`;
}

function buildUpdatedUserMetadata(user, updates = {}, fallbackDisplayName = '') {
    const currentMetadata =
        user?.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {};
    const displayName =
        sanitizeDisplayName(currentMetadata.display_name || '') ||
        sanitizeDisplayName(fallbackDisplayName) ||
        DEFAULT_DRIVER_NAME;
    const nextAvatarPath = Object.prototype.hasOwnProperty.call(updates, 'avatar_path')
        ? sanitizeProfileImagePath(updates.avatar_path || '')
        : sanitizeProfileImagePath(currentMetadata.avatar_path || '');
    const nextCarWrapPath = Object.prototype.hasOwnProperty.call(updates, 'car_wrap_path')
        ? sanitizeStorageObjectPath(updates.car_wrap_path || '')
        : sanitizeStorageObjectPath(currentMetadata.car_wrap_path || '');
    const hasGarageWrapPresetUpdate = Object.prototype.hasOwnProperty.call(
        updates,
        'garage_wrap_preset_id'
    );
    const nextGarageWrapPresetId = hasGarageWrapPresetUpdate
        ? sanitizeGarageWrapPresetId(updates.garage_wrap_preset_id || '')
        : sanitizeGarageWrapPresetId(currentMetadata.garage_wrap_preset_id || '');
    const hasWheelPresetUpdate = Object.prototype.hasOwnProperty.call(updates, 'wheel_preset_id');
    const nextWheelPresetId = hasWheelPresetUpdate
        ? sanitizePlayerWheelPresetId(updates.wheel_preset_id || '')
        : sanitizePlayerWheelPresetId(currentMetadata.wheel_preset_id || '');
    const nextChaseCameraSettings = Object.prototype.hasOwnProperty.call(
        updates,
        'chase_camera_settings'
    )
        ? sanitizeChaseCameraSettings(updates.chase_camera_settings)
        : resolveChaseCameraSettings(user);
    const hasAutoFullscreenUpdate = Object.prototype.hasOwnProperty.call(
        updates,
        'auto_fullscreen_on_start'
    );
    const nextAutoFullscreenOnStart = hasAutoFullscreenUpdate
        ? sanitizeAccountSettingBoolean(
              updates.auto_fullscreen_on_start,
              DEFAULT_ACCOUNT_AUTO_FULLSCREEN_ON_START
          )
        : resolveAccountAutoFullscreenOnStart(user);
    const hasHideGameplayPanelsUpdate = Object.prototype.hasOwnProperty.call(
        updates,
        'hide_gameplay_panels'
    );
    const nextHideGameplayPanels = hasHideGameplayPanelsUpdate
        ? sanitizeAccountSettingBoolean(
              updates.hide_gameplay_panels,
              DEFAULT_ACCOUNT_HIDE_GAMEPLAY_PANELS
          )
        : resolveAccountHideGameplayPanels(user);
    const hasProfileScreensaverUpdate = Object.prototype.hasOwnProperty.call(
        updates,
        'profile_screensaver_enabled'
    );
    const nextProfileScreensaverEnabled = hasProfileScreensaverUpdate
        ? sanitizeAccountSettingBoolean(
              updates.profile_screensaver_enabled,
              DEFAULT_ACCOUNT_PROFILE_SCREENSAVER_ENABLED
          )
        : resolveAccountProfileScreensaverEnabled(user);
    const hasAudioPrefsUpdate = Object.prototype.hasOwnProperty.call(updates, 'audio_prefs');
    const nextAudioPrefs = hasAudioPrefsUpdate
        ? sanitizeAccountAudioPrefs(updates.audio_prefs, DEFAULT_ACCOUNT_AUDIO_PREFS)
        : resolveAccountAudioPrefs(user);
    const nextMetadata = {
        ...currentMetadata,
        display_name: displayName,
        avatar_path: nextAvatarPath,
        car_wrap_path: nextCarWrapPath,
    };
    if (
        hasGarageWrapPresetUpdate ||
        hasUserMetadataField(currentMetadata, 'garage_wrap_preset_id')
    ) {
        nextMetadata.garage_wrap_preset_id = nextGarageWrapPresetId;
    } else {
        delete nextMetadata.garage_wrap_preset_id;
    }
    if (hasWheelPresetUpdate || hasUserMetadataField(currentMetadata, 'wheel_preset_id')) {
        nextMetadata.wheel_preset_id = nextWheelPresetId;
    } else {
        delete nextMetadata.wheel_preset_id;
    }
    if (nextChaseCameraSettings) {
        nextMetadata.chase_camera_settings = nextChaseCameraSettings;
    } else {
        delete nextMetadata.chase_camera_settings;
    }
    if (
        hasAutoFullscreenUpdate ||
        hasUserMetadataField(currentMetadata, 'auto_fullscreen_on_start')
    ) {
        nextMetadata.auto_fullscreen_on_start = nextAutoFullscreenOnStart;
    } else {
        delete nextMetadata.auto_fullscreen_on_start;
    }
    if (
        hasHideGameplayPanelsUpdate ||
        hasUserMetadataField(currentMetadata, 'hide_gameplay_panels')
    ) {
        nextMetadata.hide_gameplay_panels = nextHideGameplayPanels;
    } else {
        delete nextMetadata.hide_gameplay_panels;
    }
    if (
        hasProfileScreensaverUpdate ||
        hasUserMetadataField(currentMetadata, 'profile_screensaver_enabled')
    ) {
        nextMetadata.profile_screensaver_enabled = nextProfileScreensaverEnabled;
    } else {
        delete nextMetadata.profile_screensaver_enabled;
    }
    if (hasAudioPrefsUpdate || hasUserMetadataField(currentMetadata, 'audio_prefs')) {
        nextMetadata.audio_prefs = nextAudioPrefs;
    } else {
        delete nextMetadata.audio_prefs;
    }
    return nextMetadata;
}

function hasUserMetadataField(metadata, key) {
    return Boolean(
        metadata &&
        typeof metadata === 'object' &&
        typeof key === 'string' &&
        Object.prototype.hasOwnProperty.call(metadata, key)
    );
}

function buildProfileImageStoragePath(userId, extension = 'webp') {
    return buildUserMediaStoragePath(userId, 'avatar', extension);
}

function buildCarWrapStoragePath(userId, extension = 'webp') {
    return buildUserMediaStoragePath(userId, 'wrap', extension);
}

function buildUserMediaStoragePath(userId, kind, extension = 'webp') {
    const safeUserId = sanitizeUserId(userId);
    const safeKind = kind === 'wrap' ? 'wrap' : 'avatar';
    const safeExtension = extension === 'jpg' ? 'jpg' : 'webp';
    const timestamp = Date.now().toString(36);
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    return sanitizeStorageObjectPath(
        `${safeUserId}/${safeKind}-${timestamp}-${randomSuffix}.${safeExtension}`
    );
}

function resolveDisplayName(user, email = '') {
    const metadataName = sanitizeDisplayName(user?.user_metadata?.display_name || '');
    if (metadataName) {
        return metadataName;
    }
    const emailPrefix = sanitizeDisplayName(String(email || '').split('@')[0] || '');
    if (emailPrefix) {
        return emailPrefix;
    }
    const storedName = sanitizeDisplayName(readStoredPlayerName());
    return storedName || DEFAULT_DRIVER_NAME;
}

function sanitizeChaseCameraSettings(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const safeDistanceBias = clampChaseCameraSettingValue(value.distanceBias, 0);
    const safeHeightBias = clampChaseCameraSettingValue(value.heightBias, 0);
    return {
        distanceBias: safeDistanceBias,
        heightBias: safeHeightBias,
    };
}

function clampChaseCameraSettingValue(value, fallback = 0) {
    const numeric = Number.isFinite(value) ? Number(value) : Number(fallback) || 0;
    return Math.min(CHASE_CAMERA_SETTING_MAX, Math.max(CHASE_CAMERA_SETTING_MIN, numeric));
}

function sanitizeAccountSettingBoolean(value, fallback = false) {
    if (typeof value === 'boolean') {
        return value;
    }
    return fallback === true;
}

function sanitizeAccountAudioPrefs(value, fallbackPrefs = DEFAULT_ACCOUNT_AUDIO_PREFS) {
    const fallback =
        fallbackPrefs && typeof fallbackPrefs === 'object'
            ? fallbackPrefs
            : DEFAULT_ACCOUNT_AUDIO_PREFS;
    const source = value && typeof value === 'object' ? value : {};
    const legacyFallbackMusicVolume = clampAccountAudioPref(
        fallback.musicVolume,
        DEFAULT_ACCOUNT_AUDIO_PREFS.gameMusicVolume
    );
    return {
        masterVolume: clampAccountAudioPref(source.masterVolume, fallback.masterVolume),
        vehiclesVolume: clampAccountAudioPref(source.vehiclesVolume, fallback.vehiclesVolume),
        botVehiclesVolume: clampAccountAudioPref(
            source.botVehiclesVolume,
            fallback.botVehiclesVolume
        ),
        effectsVolume: clampAccountAudioPref(source.effectsVolume, fallback.effectsVolume),
        ambienceVolume: clampAccountAudioPref(source.ambienceVolume, fallback.ambienceVolume),
        menuMusicVolume: clampAccountAudioPref(
            Object.prototype.hasOwnProperty.call(source, 'menuMusicVolume')
                ? source.menuMusicVolume
                : source.musicVolume,
            clampAccountAudioPref(fallback.menuMusicVolume, legacyFallbackMusicVolume)
        ),
        gameMusicVolume: clampAccountAudioPref(
            Object.prototype.hasOwnProperty.call(source, 'gameMusicVolume')
                ? source.gameMusicVolume
                : source.musicVolume,
            clampAccountAudioPref(fallback.gameMusicVolume, legacyFallbackMusicVolume)
        ),
        uiVolume: clampAccountAudioPref(source.uiVolume, fallback.uiVolume),
        muted: Boolean('muted' in source ? source.muted : fallback.muted),
    };
}

function clampAccountAudioPref(value, fallback = 1) {
    const numeric = Number.isFinite(value) ? Number(value) : Number(fallback) || 0;
    return Math.min(1, Math.max(0, numeric));
}

function readStoredPlayerName() {
    try {
        return window.localStorage.getItem(MP_NAME_STORAGE_KEY) || '';
    } catch {
        return '';
    }
}

function writeStoredPlayerName(value) {
    const safeName = sanitizeDisplayName(value);
    if (!safeName) {
        return;
    }
    try {
        window.localStorage.setItem(MP_NAME_STORAGE_KEY, safeName);
    } catch {
        // localStorage is optional.
    }
}

function resolveEmailRedirectUrl() {
    const origin = typeof window?.location?.origin === 'string' ? window.location.origin : '';
    const pathname =
        typeof window?.location?.pathname === 'string' ? window.location.pathname : '/';
    return origin ? `${origin}${pathname}` : undefined;
}

async function prepareProfileImageUpload(file) {
    return prepareUserMediaUpload(file, {
        outputWidth: PROFILE_IMAGE_OUTPUT_SIZE_PX,
        outputHeight: PROFILE_IMAGE_OUTPUT_SIZE_PX,
        outputQuality: PROFILE_IMAGE_OUTPUT_QUALITY,
        emptyMessage: 'Could not prepare the selected image.',
    });
}

async function prepareCarWrapUpload(file) {
    return prepareUserMediaUpload(file, {
        outputWidth: CAR_WRAP_OUTPUT_WIDTH_PX,
        outputHeight: CAR_WRAP_OUTPUT_HEIGHT_PX,
        outputQuality: CAR_WRAP_OUTPUT_QUALITY,
        fitMode: 'scale-down',
        emptyMessage: 'Could not prepare the selected wrap.',
    });
}

async function prepareUserMediaUpload(
    file,
    {
        outputWidth = PROFILE_IMAGE_OUTPUT_SIZE_PX,
        outputHeight = PROFILE_IMAGE_OUTPUT_SIZE_PX,
        outputQuality = PROFILE_IMAGE_OUTPUT_QUALITY,
        fitMode = 'cover',
        emptyMessage = 'Could not prepare the selected image.',
    } = {}
) {
    if (!(file instanceof File)) {
        throw new Error('Choose an image file first.');
    }
    if (!USER_MEDIA_ALLOWED_TYPES.has(file.type)) {
        throw new Error('Only JPG, PNG, or WebP images are supported.');
    }
    if (!Number.isFinite(file.size) || file.size <= 0) {
        throw new Error('The selected image is empty.');
    }
    if (file.size > USER_MEDIA_MAX_INPUT_BYTES) {
        throw new Error('Choose an image smaller than 10 MB.');
    }

    const image = await loadImageFromFile(file);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(Number(outputWidth) || PROFILE_IMAGE_OUTPUT_SIZE_PX));
    canvas.height = Math.max(1, Math.round(Number(outputHeight) || PROFILE_IMAGE_OUTPUT_SIZE_PX));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error(emptyMessage);
    }

    const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1);
    const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (fitMode === 'scale-down') {
        const scale = Math.min(
            1,
            outputWidth / Math.max(1, sourceWidth),
            outputHeight / Math.max(1, sourceHeight)
        );
        const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
        const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
        if (canvas.width !== drawWidth || canvas.height !== drawHeight) {
            canvas.width = drawWidth;
            canvas.height = drawHeight;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
        }
        ctx.drawImage(image, 0, 0, drawWidth, drawHeight);
    } else if (fitMode === 'contain') {
        const containScale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
        const drawWidth = Math.max(1, sourceWidth * containScale);
        const drawHeight = Math.max(1, sourceHeight * containScale);
        const drawX = (canvas.width - drawWidth) * 0.5;
        const drawY = (canvas.height - drawHeight) * 0.5;
        ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    } else {
        const targetAspectRatio = canvas.width / Math.max(1, canvas.height);
        const sourceAspectRatio = sourceWidth / sourceHeight;
        let cropWidth = sourceWidth;
        let cropHeight = sourceHeight;
        if (sourceAspectRatio > targetAspectRatio) {
            cropWidth = Math.max(1, sourceHeight * targetAspectRatio);
        } else {
            cropHeight = Math.max(1, sourceWidth / targetAspectRatio);
        }
        const cropX = Math.max(0, (sourceWidth - cropWidth) * 0.5);
        const cropY = Math.max(0, (sourceHeight - cropHeight) * 0.5);
        ctx.drawImage(
            image,
            cropX,
            cropY,
            cropWidth,
            cropHeight,
            0,
            0,
            canvas.width,
            canvas.height
        );
    }

    const webpBlob = await canvasToBlob(canvas, 'image/webp', outputQuality);
    const jpegBlob = webpBlob || (await canvasToBlob(canvas, 'image/jpeg', outputQuality));
    if (!jpegBlob) {
        throw new Error('Could not encode the selected image.');
    }

    return {
        blob: jpegBlob,
        contentType: jpegBlob.type || 'image/jpeg',
        extension: jpegBlob.type === 'image/webp' ? 'webp' : 'jpg',
    };
}

function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('The selected file is not a valid image.'));
        };
        image.src = objectUrl;
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob || null), type, quality);
    });
}

function normalizeSupabaseAuthError(error) {
    const message =
        typeof error?.message === 'string' && error.message.trim()
            ? error.message.trim()
            : 'Authentication request failed. Try again.';
    if (/invalid login credentials/iu.test(message)) {
        return 'Email or password is incorrect.';
    }
    if (/email not confirmed/iu.test(message)) {
        return 'Check your email and confirm the account before signing in.';
    }
    if (/user already registered/iu.test(message)) {
        return 'An account with that email already exists.';
    }
    if (/password should be at least/iu.test(message)) {
        return `Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters.`;
    }
    if (/mime type|image format|not a valid image/iu.test(message)) {
        return 'Only JPG, PNG, or WebP images are supported.';
    }
    if (/larger than|too large|payload too large|entity too large/iu.test(message)) {
        return 'Choose a smaller image and try again.';
    }
    if (
        /bucket.*not found|storage.*not configured|row-level security|violates row-level security/iu.test(
            message
        )
    ) {
        return 'Image storage is not configured correctly on this server.';
    }
    return message;
}

function normalizeSupabaseEconomyError(error) {
    const message =
        typeof error?.message === 'string' && error.message.trim()
            ? error.message.trim()
            : 'Wallet sync failed. Try again.';
    if (/wallet sync is not configured|wallet progress|wallet sync failed/iu.test(message)) {
        return message;
    }
    if (/failed to fetch|networkerror|load failed/iu.test(message)) {
        return 'Wallet sync failed because the server could not be reached.';
    }
    return normalizeSupabaseAuthError(error);
}

async function readJsonResponse(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

function readCreditsPurchaseReturnContext() {
    try {
        const pageUrl = new URL(window.location.href);
        const state = sanitizeCreditsPurchaseStatus(
            pageUrl.searchParams.get(PLAYER_ECONOMY_CREDITS_QUERY_KEY)
        );
        if (!state) {
            return null;
        }
        return {
            state,
            sessionId: sanitizeCreditsCheckoutSessionId(
                pageUrl.searchParams.get(PLAYER_ECONOMY_CREDITS_SESSION_QUERY_KEY)
            ),
        };
    } catch {
        return null;
    }
}

function clearCreditsPurchaseReturnContext() {
    try {
        const pageUrl = new URL(window.location.href);
        pageUrl.searchParams.delete(PLAYER_ECONOMY_CREDITS_QUERY_KEY);
        pageUrl.searchParams.delete(PLAYER_ECONOMY_CREDITS_SESSION_QUERY_KEY);
        const nextRelativeUrl = `${pageUrl.pathname}${pageUrl.search}${pageUrl.hash}`;
        if (
            nextRelativeUrl !==
            `${window.location.pathname}${window.location.search}${window.location.hash}`
        ) {
            window.history.replaceState(null, '', nextRelativeUrl);
        }
    } catch {
        // History cleanup is optional.
    }
}

async function requestPlayerEconomyProfile(accessToken = '') {
    const response = await window.fetch(PLAYER_ECONOMY_PROFILE_ENDPOINT_PATH, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: accessToken
            ? {
                  Authorization: `Bearer ${accessToken}`,
              }
            : {},
    });
    const payload = await readJsonResponse(response);
    if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Could not load wallet progress.');
    }
    return payload;
}

async function createCreditsPurchaseCheckoutSession(accessToken = '') {
    const response = await window.fetch(PLAYER_ECONOMY_CREDITS_CHECKOUT_ENDPOINT_PATH, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: accessToken
            ? {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
              }
            : {
                  'Content-Type': 'application/json',
              },
        body: JSON.stringify({}),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Could not start secure credits checkout.');
    }
    return payload;
}

async function requestCreditsPurchaseSessionStatus(accessToken = '', checkoutSessionId = '') {
    const safeSessionId = sanitizeCreditsCheckoutSessionId(checkoutSessionId);
    if (!safeSessionId) {
        throw new Error('A valid Stripe checkout session is required.');
    }

    const response = await window.fetch(
        `${PLAYER_ECONOMY_CREDITS_STATUS_ENDPOINT_PATH}?session_id=${encodeURIComponent(
            safeSessionId
        )}`,
        {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: accessToken
                ? {
                      Authorization: `Bearer ${accessToken}`,
                  }
                : {},
        }
    );
    const payload = await readJsonResponse(response);
    if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Could not verify credits checkout.');
    }
    return payload;
}

async function postPlayerEconomyProfile(
    accessToken = '',
    nextEconomyState = null,
    transaction = null
) {
    const normalizedEconomyState = normalizePlayerEconomyState(nextEconomyState);
    const response = await window.fetch(PLAYER_ECONOMY_SYNC_ENDPOINT_PATH, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            credits: normalizedEconomyState.credits,
            unlockedVehicleIds: normalizedEconomyState.unlockedVehicleIds,
            unlockedWheelPresetIds: normalizedEconomyState.unlockedWheelPresetIds,
            recentLimit: PLAYER_ECONOMY_RECENT_TRANSACTION_LIMIT,
            transaction: normalizePlayerEconomySyncTransaction(transaction),
        }),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Wallet sync failed.');
    }
    return payload;
}

function normalizePlayerEconomyProfileState(profile = null, options = {}) {
    const source = profile && typeof profile === 'object' ? profile : {};
    const fallbackEconomy = normalizePlayerEconomyState(options?.fallbackEconomy);
    const economy = normalizePlayerEconomyState({
        credits: source.credits,
        unlockedVehicleIds: source.unlockedVehicleIds,
        unlockedWheelPresetIds: source.unlockedWheelPresetIds,
    });
    const recentTransactions = Array.isArray(source.recentTransactions)
        ? source.recentTransactions
              .map((entry) => normalizePlayerEconomyRecentTransaction(entry))
              .filter(Boolean)
        : [];
    return {
        userId: sanitizeUserId(source.userId || source.user_id),
        exists: Boolean(source.exists),
        credits: Number.isFinite(Number(source.credits))
            ? economy.credits
            : fallbackEconomy.credits,
        unlockedVehicleIds:
            Array.isArray(source.unlockedVehicleIds) && source.unlockedVehicleIds.length > 0
                ? [...economy.unlockedVehicleIds]
                : [...fallbackEconomy.unlockedVehicleIds],
        unlockedWheelPresetIds:
            Array.isArray(source.unlockedWheelPresetIds) && source.unlockedWheelPresetIds.length > 0
                ? [...economy.unlockedWheelPresetIds]
                : [...fallbackEconomy.unlockedWheelPresetIds],
        syncSource:
            typeof options?.source === 'string' && options.source.trim()
                ? options.source.trim().toLowerCase()
                : 'local',
        lastSyncedAt: sanitizeIsoDateString(source.lastSyncedAt || source.last_synced_at),
        lifetimeEarned: clampEconomyInteger(source.lifetimeEarned || source.lifetime_earned),
        lifetimeSpent: clampEconomyInteger(source.lifetimeSpent || source.lifetime_spent),
        transactionCount: clampEconomyInteger(source.transactionCount || source.transaction_count),
        recentTransactions,
    };
}

function normalizePlayerEconomyRecentTransaction(value = null) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const kind = sanitizeEconomyTransactionKind(value.kind);
    const summary = sanitizeEconomyTransactionSummary(value.summary);
    const creditsDelta = clampSignedEconomyInteger(value.creditsDelta || value.credits_delta);
    const balanceAfter = clampEconomyInteger(value.balanceAfter || value.balance_after);
    if (!kind && !summary && creditsDelta === 0 && balanceAfter <= 0) {
        return null;
    }
    return {
        id: sanitizeUserId(value.id),
        kind: kind || (creditsDelta < 0 ? 'spend' : 'earn'),
        summary:
            summary ||
            (creditsDelta < 0
                ? `Spent ${formatPlayerCredits(Math.abs(creditsDelta))}`
                : `Earned ${formatPlayerCredits(Math.abs(creditsDelta))}`),
        creditsDelta,
        balanceAfter,
        createdAt: sanitizeIsoDateString(value.createdAt || value.created_at),
    };
}

function normalizePlayerEconomySyncTransaction(value = null) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const kind = sanitizeEconomyTransactionKind(value.kind);
    const summary = sanitizeEconomyTransactionSummary(
        value.summary || value.label || value.description
    );
    const creditsDelta = clampSignedEconomyInteger(value.creditsDelta);
    const metadata = normalizePlayerEconomyTransactionMetadata(value.metadata);
    if (!kind && !summary && creditsDelta === 0 && Object.keys(metadata).length === 0) {
        return null;
    }
    return {
        kind: kind || (creditsDelta < 0 ? 'spend' : 'earn'),
        summary,
        creditsDelta,
        metadata,
    };
}

function normalizePlayerEconomyTransactionMetadata(value = null) {
    const source = value && typeof value === 'object' ? value : {};
    const metadata = {};
    if (typeof source.vehicleId === 'string') {
        const vehicleId = sanitizeEconomyVehicleId(source.vehicleId);
        if (vehicleId) {
            metadata.vehicleId = vehicleId;
        }
    }
    if (typeof source.vehicleName === 'string') {
        const vehicleName = sanitizeEconomyTransactionSummary(source.vehicleName, 72);
        if (vehicleName) {
            metadata.vehicleName = vehicleName;
        }
    }
    if (typeof source.wheelPresetId === 'string') {
        const wheelPresetId = sanitizeEconomyVehicleId(source.wheelPresetId);
        if (wheelPresetId) {
            metadata.wheelPresetId = wheelPresetId;
        }
    }
    if (typeof source.wheelPresetName === 'string') {
        const wheelPresetName = sanitizeEconomyTransactionSummary(source.wheelPresetName, 72);
        if (wheelPresetName) {
            metadata.wheelPresetName = wheelPresetName;
        }
    }
    if (typeof source.gameMode === 'string') {
        const gameMode = sanitizeEconomyTransactionKind(source.gameMode);
        if (gameMode) {
            metadata.gameMode = gameMode;
        }
    }
    if (typeof source.finishReason === 'string') {
        const finishReason = sanitizeEconomyTransactionKind(source.finishReason);
        if (finishReason) {
            metadata.finishReason = finishReason;
        }
    }
    if (Array.isArray(source.breakdown)) {
        const breakdown = source.breakdown
            .map((entry) => {
                const label = sanitizeEconomyTransactionSummary(entry?.label, 48);
                const credits = clampEconomyInteger(entry?.credits);
                if (!label && credits <= 0) {
                    return null;
                }
                return {
                    id: sanitizeEconomyTransactionKind(entry?.id),
                    label: label || 'Reward',
                    credits,
                };
            })
            .filter(Boolean);
        if (breakdown.length > 0) {
            metadata.breakdown = breakdown;
        }
    }
    return metadata;
}

function shouldMigrateLegacyEconomyState(value = null) {
    const legacyState = normalizePlayerEconomyState(value);
    const defaultState = createDefaultPlayerEconomyState();
    if (legacyState.credits > 0) {
        return true;
    }
    if (legacyState.unlockedVehicleIds.length > defaultState.unlockedVehicleIds.length) {
        return true;
    }
    return legacyState.unlockedWheelPresetIds.length > defaultState.unlockedWheelPresetIds.length;
}

function sanitizeEconomyVehicleId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 32);
}

function sanitizeEconomyTransactionKind(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 32);
}

function sanitizeEconomyTransactionSummary(value, maxLength = 160) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function sanitizeIsoDateString(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    return normalized && !Number.isNaN(Date.parse(normalized)) ? normalized : '';
}

function clampEconomyInteger(value, maxValue = Number.MAX_SAFE_INTEGER) {
    const numeric = Math.round(Number(value) || 0);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(maxValue, numeric));
}

function clampSignedEconomyInteger(value, maxValue = Number.MAX_SAFE_INTEGER) {
    const numeric = Math.round(Number(value) || 0);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(-maxValue, Math.min(maxValue, numeric));
}

function sanitizeCreditsPurchaseStatus(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'success' ||
        normalized === 'cancel' ||
        normalized === 'paid' ||
        normalized === 'processing' ||
        normalized === 'expired' ||
        normalized === 'open'
        ? normalized
        : '';
}

function resolveCreditsPurchaseStatusMessage(status = '') {
    switch (sanitizeCreditsPurchaseStatus(status)) {
        case 'processing':
        case 'open':
            return 'Payment is processing. The wallet will refresh shortly.';
        case 'expired':
            return 'Credits checkout expired. Try again.';
        case 'cancel':
            return 'Credits checkout was canceled.';
        default:
            return 'Credits checkout could not be verified.';
    }
}

function sanitizeCreditsCheckoutSessionId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim();
    return /^cs_[a-z0-9_]{12,255}$/iu.test(normalized) ? normalized : '';
}
