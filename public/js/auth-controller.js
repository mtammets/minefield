import { getSupabaseBrowserClient, getSupabaseBrowserConfig } from './supabase-browser.js';

const MP_NAME_STORAGE_KEY = 'silentdrift-mp-player-name';
const DEFAULT_DRIVER_NAME = 'Driver';
const PLAYER_NAME_MAX_LENGTH = 18;
const AUTH_PASSWORD_MIN_LENGTH = 6;
const AUTH_DELETE_ACCOUNT_ENDPOINT_PATH = '/api/auth/account';
const PROFILE_IMAGE_MAX_INPUT_BYTES = 10 * 1024 * 1024;
const PROFILE_IMAGE_OUTPUT_SIZE_PX = 512;
const PROFILE_IMAGE_OUTPUT_QUALITY = 0.86;
const PROFILE_IMAGE_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function createAuthController({ onStateChanged = null, onToast = null } = {}) {
    const listeners = new Set();
    let state = createInitialAuthState();
    let initializePromise = null;
    let supabaseClient = null;
    let authSubscription = null;
    let currentSession = null;
    let browserConfig = createInitialBrowserConfig();

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
                const errorMessage = 'Supabase auth is unavailable on this server.';
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
                const errorMessage = 'Supabase auth is unavailable on this server.';
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
                const errorMessage = 'Supabase auth is unavailable on this server.';
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
        async deleteAccount() {
            await initializeInternalSafe();
            if (!supabaseClient || !state.enabled) {
                const errorMessage = 'Supabase auth is unavailable on this server.';
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

            if (!state.authenticated || !currentSession?.access_token || !state.userId) {
                return updateValidationFailure('Sign in before deleting the account.');
            }

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
                    throw signOutError;
                }
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
                const errorMessage = 'Supabase auth is unavailable on this server.';
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

            try {
                const preparedImage = await prepareProfileImageUpload(file);
                const oldAvatarPath = resolveProfileImagePath(currentSession?.user);
                const nextAvatarPath = buildProfileImageStoragePath(
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

                const metadata = buildUpdatedUserMetadata(
                    currentSession?.user,
                    {
                        avatar_path: nextAvatarPath,
                    },
                    state.displayName
                );
                const { data, error } = await supabaseClient.auth.updateUser({
                    data: metadata,
                });
                if (error) {
                    await removeStoredProfileImages([nextAvatarPath]).catch(() => {});
                    throw error;
                }

                if (oldAvatarPath && oldAvatarPath !== nextAvatarPath) {
                    await removeStoredProfileImages([oldAvatarPath]).catch(() => {});
                }

                applySession(mergeCurrentSessionUser(data?.user), {
                    statusText: 'Profile photo updated.',
                    statusTone: 'success',
                });
                return {
                    ok: true,
                };
            } catch (error) {
                return updateRequestFailure(error);
            }
        },
        async removeProfileImage() {
            await initializeInternalSafe();
            if (!supabaseClient || !state.enabled) {
                const errorMessage = 'Supabase auth is unavailable on this server.';
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
                const metadata = buildUpdatedUserMetadata(
                    currentSession?.user,
                    {
                        avatar_path: '',
                    },
                    state.displayName
                );
                const { data, error } = await supabaseClient.auth.updateUser({
                    data: metadata,
                });
                if (error) {
                    throw error;
                }

                await removeStoredProfileImages([currentAvatarPath]).catch(() => {});
                applySession(mergeCurrentSessionUser(data?.user), {
                    statusText: 'Profile photo removed.',
                    statusTone: 'success',
                });
                return {
                    ok: true,
                };
            } catch (error) {
                return updateRequestFailure(error);
            }
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
        } catch {
            initializePromise = null;
            // The state is already updated with the failure details.
        }
    }

    async function initializeInternal() {
        const config = await getSupabaseBrowserConfig();
        browserConfig =
            config && typeof config === 'object' ? config : createInitialBrowserConfig();
        if (!config.enabled) {
            updateState({
                enabled: false,
                profileImageEnabled: false,
                ready: true,
                loading: false,
                pendingAction: '',
                authenticated: false,
                avatarUrl: '',
                avatarStoragePath: '',
                statusText: 'Supabase auth is unavailable on this server.',
                statusTone: 'error',
            });
            return getStateSnapshot();
        }

        updateState({
            enabled: true,
            profileImageEnabled: Boolean(config.profileImagesEnabled && config.profileImagesBucket),
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
                    ready: true,
                    loading: false,
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
            applySession(data?.session || null, {
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
                ready: true,
                loading: false,
                pendingAction: '',
                authenticated: false,
                avatarUrl: '',
                avatarStoragePath: '',
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

    function applySession(session, options = {}) {
        currentSession = session && typeof session === 'object' ? session : null;
        const user = currentSession?.user || null;
        const authenticated = Boolean(currentSession?.access_token && user?.id);
        const email = sanitizeEmail(user?.email || '');
        const displayName = resolveDisplayName(user, email);
        const avatarStoragePath = authenticated ? resolveProfileImagePath(user) : '';
        const avatarUrl = authenticated
            ? resolveProfileImagePublicUrl(
                  browserConfig.url,
                  browserConfig.profileImagesBucket,
                  avatarStoragePath
              )
            : '';
        if (authenticated && displayName) {
            writeStoredPlayerName(displayName);
        }

        const shouldPreserveStatus = Boolean(options?.preserveStatus);
        updateState({
            enabled: true,
            profileImageEnabled: Boolean(
                browserConfig.profileImagesEnabled && browserConfig.profileImagesBucket
            ),
            ready: true,
            loading: false,
            pendingAction: '',
            authenticated,
            userId: authenticated ? sanitizeUserId(user?.id) : '',
            email: authenticated ? email : '',
            displayName: authenticated ? displayName : '',
            avatarUrl,
            avatarStoragePath,
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
    }

    function applySignedOutState(statusText) {
        currentSession = null;
        updateState({
            enabled: state.enabled,
            profileImageEnabled: state.profileImageEnabled,
            ready: true,
            loading: false,
            pendingAction: '',
            authenticated: false,
            userId: '',
            email: '',
            displayName: '',
            avatarUrl: '',
            avatarStoragePath: '',
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

    async function removeStoredProfileImages(paths = []) {
        const safePaths = Array.isArray(paths)
            ? paths.map((path) => sanitizeProfileImagePath(path)).filter(Boolean)
            : [];
        if (!supabaseClient || !browserConfig.profileImagesBucket || safePaths.length === 0) {
            return;
        }
        const { error } = await supabaseClient.storage
            .from(browserConfig.profileImagesBucket)
            .remove(safePaths);
        if (error) {
            throw error;
        }
    }

    function mergeCurrentSessionUser(nextUser = null) {
        if (!currentSession || typeof currentSession !== 'object') {
            return currentSession;
        }
        return {
            ...currentSession,
            user:
                nextUser && typeof nextUser === 'object'
                    ? nextUser
                    : currentSession.user && typeof currentSession.user === 'object'
                      ? currentSession.user
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
        ready: false,
        loading: false,
        pendingAction: '',
        authenticated: false,
        userId: '',
        email: '',
        displayName: '',
        avatarUrl: '',
        avatarStoragePath: '',
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
        leaderboardEnabled: false,
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

function resolveProfileImagePath(user) {
    return sanitizeProfileImagePath(user?.user_metadata?.avatar_path || '');
}

function resolveProfileImagePublicUrl(baseUrl, bucketName, profileImagePath) {
    const safeBaseUrl =
        typeof baseUrl === 'string' && /^(https?:)?\/\//iu.test(baseUrl.trim())
            ? baseUrl.trim().replace(/\/+$/u, '')
            : '';
    const safeBucketName = sanitizeProfileImageBucketName(bucketName);
    const safeProfileImagePath = sanitizeProfileImagePath(profileImagePath);
    if (!safeBaseUrl || !safeBucketName || !safeProfileImagePath) {
        return '';
    }
    const encodedPath = safeProfileImagePath
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
    const nextAvatarPath = sanitizeProfileImagePath(updates.avatar_path || '');
    return {
        ...currentMetadata,
        display_name: displayName,
        avatar_path: nextAvatarPath,
    };
}

function buildProfileImageStoragePath(userId, extension = 'webp') {
    const safeUserId = sanitizeUserId(userId);
    const safeExtension = extension === 'jpg' ? 'jpg' : 'webp';
    const timestamp = Date.now().toString(36);
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    return sanitizeProfileImagePath(`${safeUserId}/${timestamp}-${randomSuffix}.${safeExtension}`);
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
    if (!(file instanceof File)) {
        throw new Error('Choose an image file first.');
    }
    if (!PROFILE_IMAGE_ALLOWED_TYPES.has(file.type)) {
        throw new Error('Only JPG, PNG, or WebP images are supported.');
    }
    if (!Number.isFinite(file.size) || file.size <= 0) {
        throw new Error('The selected image is empty.');
    }
    if (file.size > PROFILE_IMAGE_MAX_INPUT_BYTES) {
        throw new Error('Choose an image smaller than 10 MB.');
    }

    const image = await loadImageFromFile(file);
    const canvas = document.createElement('canvas');
    canvas.width = PROFILE_IMAGE_OUTPUT_SIZE_PX;
    canvas.height = PROFILE_IMAGE_OUTPUT_SIZE_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Could not prepare the selected image.');
    }

    const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1);
    const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1);
    const cropSize = Math.max(1, Math.min(sourceWidth, sourceHeight));
    const cropX = Math.max(0, (sourceWidth - cropSize) * 0.5);
    const cropY = Math.max(0, (sourceHeight - cropSize) * 0.5);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, cropX, cropY, cropSize, cropSize, 0, 0, canvas.width, canvas.height);

    const webpBlob = await canvasToBlob(canvas, 'image/webp', PROFILE_IMAGE_OUTPUT_QUALITY);
    const jpegBlob =
        webpBlob || (await canvasToBlob(canvas, 'image/jpeg', PROFILE_IMAGE_OUTPUT_QUALITY));
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
        return 'Profile image storage is not configured correctly on this server.';
    }
    return message;
}

async function readJsonResponse(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}
