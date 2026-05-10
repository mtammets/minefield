import { getSupabaseBrowserClient, getSupabaseBrowserConfig } from './supabase-browser.js';

const MP_NAME_STORAGE_KEY = 'silentdrift-mp-player-name';
const DEFAULT_DRIVER_NAME = 'Driver';
const PLAYER_NAME_MAX_LENGTH = 18;
const AUTH_PASSWORD_MIN_LENGTH = 6;
const AUTH_DELETE_ACCOUNT_ENDPOINT_PATH = '/api/auth/account';

export function createAuthController({ onStateChanged = null } = {}) {
    const listeners = new Set();
    let state = createInitialAuthState();
    let initializePromise = null;
    let supabaseClient = null;
    let authSubscription = null;
    let currentSession = null;

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
                    statusText:
                        'Account created. Check your email and confirm before signing in.',
                    statusTone: 'info',
                });
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
            return typeof currentSession?.access_token === 'string' ? currentSession.access_token : '';
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
        if (!config.enabled) {
            updateState({
                enabled: false,
                ready: true,
                loading: false,
                pendingAction: '',
                authenticated: false,
                statusText: 'Supabase auth is unavailable on this server.',
                statusTone: 'error',
            });
            return getStateSnapshot();
        }

        updateState({
            enabled: true,
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
                    ready: true,
                    loading: false,
                    statusText: 'Supabase auth client failed to load.',
                    statusTone: 'error',
                });
                return getStateSnapshot();
            }

            if (!authSubscription) {
                const subscriptionResult = supabaseClient.auth.onAuthStateChange((event, session) => {
                    handleAuthStateChange(event, session);
                });
                authSubscription =
                    subscriptionResult?.data?.subscription || subscriptionResult?.subscription || null;
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
                ready: true,
                loading: false,
                pendingAction: '',
                authenticated: false,
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
                statusText: 'Account updated.',
                statusTone: 'success',
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
        if (authenticated && displayName) {
            writeStoredPlayerName(displayName);
        }

        const shouldPreserveStatus = Boolean(options?.preserveStatus);
        updateState({
            enabled: true,
            ready: true,
            loading: false,
            pendingAction: '',
            authenticated,
            userId: authenticated ? sanitizeUserId(user?.id) : '',
            email: authenticated ? email : '',
            displayName: authenticated ? displayName : '',
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
            ready: true,
            loading: false,
            pendingAction: '',
            authenticated: false,
            userId: '',
            email: '',
            displayName: '',
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

    function getStateSnapshot() {
        return {
            ...state,
        };
    }
}

function createInitialAuthState() {
    return {
        enabled: false,
        ready: false,
        loading: false,
        pendingAction: '',
        authenticated: false,
        userId: '',
        email: '',
        displayName: '',
        requiresEmailConfirmation: false,
        statusText: 'Create an account or sign in to unlock online rooms and score sync.',
        statusTone: 'muted',
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
    return message;
}

async function readJsonResponse(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}
