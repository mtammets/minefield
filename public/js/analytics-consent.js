import { clearAnalyticsCookies } from './analytics-cookie-cleanup.js';

const PUBLIC_CONFIG_ENDPOINT_PATH = '/api/public-config';
const GA_SCRIPT_SRC_BASE = 'https://www.googletagmanager.com/gtag/js';
const GA_SCRIPT_ELEMENT_ID = 'minefield-ga4-script';
const CONSENT_STORAGE_KEY = 'minefield-cookie-consent-v1';
const CONSENT_STORAGE_VERSION = 1;
const CONSENT_STATUS_GRANTED = 'granted';
const CONSENT_STATUS_DENIED = 'denied';
const CONSENT_CHANGED_EVENT_NAME = 'minefield:analytics-consent-changed';
const ANALYTICS_READY_EVENT_NAME = 'minefield:analytics-ready';

let gaMeasurementId = '';
let consentStatus = readStoredConsentStatus();
let gaScriptLoadPromise = null;
let gtagBootstrapInitialized = false;
let gaConfigured = false;

const consentUi = createConsentUi();
window.minefieldAnalytics = createAnalyticsApi();
void initializeAnalyticsConsent();

async function initializeAnalyticsConsent() {
    const publicConfig = await fetchPublicConfig();
    gaMeasurementId = sanitizeGaMeasurementId(publicConfig?.analytics?.gaMeasurementId);

    if (!gaMeasurementId) {
        hideConsentUi();
        return;
    }

    if (consentStatus === CONSENT_STATUS_GRANTED) {
        await applyConsentStatus(CONSENT_STATUS_GRANTED, { persist: false });
        hideConsentBanner();
        return;
    }

    if (consentStatus === CONSENT_STATUS_DENIED) {
        await applyConsentStatus(CONSENT_STATUS_DENIED, { persist: false });
        hideConsentBanner();
        return;
    }

    showConsentBanner();
}

function createConsentUi() {
    const bannerEl = document.createElement('section');
    bannerEl.id = 'cookieConsentBanner';
    bannerEl.className = 'cookieConsentBanner';
    bannerEl.hidden = true;
    bannerEl.setAttribute('aria-hidden', 'true');
    bannerEl.innerHTML = `
        <div class="cookieConsentCard" role="dialog" aria-labelledby="cookieConsentTitle" aria-live="polite">
            <h2 id="cookieConsentTitle" class="cookieConsentTitle">Cookie Preferences</h2>
            <p class="cookieConsentText">
                We use cookies to provide core functionality and improve service quality.
                Optional cookies are used only with your consent.
            </p>
            <div class="cookieConsentActions">
                <button id="cookieConsentAcceptBtn" class="cookieConsentBtn accept" type="button">
                    Accept optional cookies
                </button>
                <button id="cookieConsentDeclineBtn" class="cookieConsentBtn decline" type="button">
                    Only necessary cookies
                </button>
                <a class="cookieConsentLink" href="/privacy.html">Privacy policy</a>
            </div>
        </div>
    `;
    document.body.append(bannerEl);

    const acceptButtonEl = bannerEl.querySelector('#cookieConsentAcceptBtn');
    const declineButtonEl = bannerEl.querySelector('#cookieConsentDeclineBtn');

    acceptButtonEl?.addEventListener('click', async () => {
        setBannerBusyState(true);
        await applyConsentStatus(CONSENT_STATUS_GRANTED, { persist: true });
        setBannerBusyState(false);
        hideConsentBanner();
    });

    declineButtonEl?.addEventListener('click', async () => {
        setBannerBusyState(true);
        await applyConsentStatus(CONSENT_STATUS_DENIED, { persist: true });
        setBannerBusyState(false);
        hideConsentBanner();
    });

    return {
        bannerEl,
        acceptButtonEl,
        declineButtonEl,
    };
}

async function applyConsentStatus(nextStatus, { persist = true } = {}) {
    if (nextStatus !== CONSENT_STATUS_GRANTED && nextStatus !== CONSENT_STATUS_DENIED) {
        return false;
    }

    consentStatus = nextStatus;
    if (persist) {
        writeStoredConsentStatus(nextStatus);
    }

    if (nextStatus === CONSENT_STATUS_GRANTED) {
        await enableAnalyticsTracking();
    } else {
        disableAnalyticsTracking();
    }

    document.dispatchEvent(
        new CustomEvent(CONSENT_CHANGED_EVENT_NAME, {
            detail: {
                status: consentStatus,
                analyticsEnabled: isAnalyticsEnabled(),
                gaMeasurementId: gaMeasurementId || '',
            },
        })
    );
    return true;
}

function bootstrapGtagApi() {
    if (!Array.isArray(window.dataLayer)) {
        window.dataLayer = [];
    }
    if (typeof window.gtag !== 'function') {
        window.gtag = function gtag() {
            window.dataLayer.push(arguments);
        };
    }
    if (!gtagBootstrapInitialized) {
        window.gtag('consent', 'default', {
            ad_storage: 'denied',
            analytics_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            functionality_storage: 'granted',
            security_storage: 'granted',
        });
        gtagBootstrapInitialized = true;
    }
}

async function enableAnalyticsTracking() {
    if (!gaMeasurementId) {
        return false;
    }

    bootstrapGtagApi();
    const scriptLoaded = await ensureGoogleTagScriptLoaded();
    if (!scriptLoaded || typeof window.gtag !== 'function') {
        return false;
    }

    window.gtag('consent', 'update', {
        analytics_storage: 'granted',
    });

    if (!gaConfigured) {
        window.gtag('js', new Date());
        window.gtag('config', gaMeasurementId, {
            anonymize_ip: true,
            allow_google_signals: false,
            allow_ad_personalization_signals: false,
            transport_type: 'beacon',
        });
        gaConfigured = true;
        document.dispatchEvent(
            new CustomEvent(ANALYTICS_READY_EVENT_NAME, {
                detail: {
                    gaMeasurementId,
                },
            })
        );
    }
    return true;
}

function disableAnalyticsTracking() {
    clearAnalyticsCookies();
    bootstrapGtagApi();
    if (typeof window.gtag !== 'function') {
        return;
    }
    window.gtag('consent', 'update', {
        ad_storage: 'denied',
        analytics_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
    });
    clearAnalyticsCookies();
}

function ensureGoogleTagScriptLoaded() {
    if (gaScriptLoadPromise) {
        return gaScriptLoadPromise;
    }
    if (document.getElementById(GA_SCRIPT_ELEMENT_ID)) {
        gaScriptLoadPromise = Promise.resolve(true);
        return gaScriptLoadPromise;
    }

    gaScriptLoadPromise = new Promise((resolve) => {
        const scriptEl = document.createElement('script');
        scriptEl.id = GA_SCRIPT_ELEMENT_ID;
        scriptEl.async = true;
        scriptEl.src = `${GA_SCRIPT_SRC_BASE}?id=${encodeURIComponent(gaMeasurementId)}`;
        scriptEl.onload = () => resolve(true);
        scriptEl.onerror = () => resolve(false);
        document.head.append(scriptEl);
    });

    return gaScriptLoadPromise;
}

async function fetchPublicConfig() {
    const controller = new AbortController();
    const timeoutHandle = window.setTimeout(() => {
        controller.abort();
    }, 3500);

    try {
        const response = await window.fetch(PUBLIC_CONFIG_ENDPOINT_PATH, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
            signal: controller.signal,
        });
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch {
        return null;
    } finally {
        window.clearTimeout(timeoutHandle);
    }
}

function readStoredConsentStatus() {
    try {
        const rawValue = window.localStorage.getItem(CONSENT_STORAGE_KEY);
        if (!rawValue) {
            return '';
        }
        const parsedValue = JSON.parse(rawValue);
        if (parsedValue?.status === CONSENT_STATUS_GRANTED) {
            return CONSENT_STATUS_GRANTED;
        }
        if (parsedValue?.status === CONSENT_STATUS_DENIED) {
            return CONSENT_STATUS_DENIED;
        }
        return '';
    } catch {
        return '';
    }
}

function writeStoredConsentStatus(status) {
    try {
        const payload = {
            version: CONSENT_STORAGE_VERSION,
            status,
            updatedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
        // localStorage can fail in restricted browsing contexts.
    }
}

function showConsentBanner() {
    consentUi.bannerEl.hidden = false;
    consentUi.bannerEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cookie-consent-open');
}

function hideConsentBanner() {
    consentUi.bannerEl.hidden = true;
    consentUi.bannerEl.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cookie-consent-open');
}

function hideConsentUi() {
    hideConsentBanner();
}

function setBannerBusyState(isBusy) {
    const busy = Boolean(isBusy);
    if (consentUi.acceptButtonEl) {
        consentUi.acceptButtonEl.disabled = busy;
    }
    if (consentUi.declineButtonEl) {
        consentUi.declineButtonEl.disabled = busy;
    }
}

function isAnalyticsEnabled() {
    return (
        consentStatus === CONSENT_STATUS_GRANTED &&
        gaConfigured &&
        typeof window.gtag === 'function'
    );
}

function sanitizeGaMeasurementId(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toUpperCase();
    return /^G-[A-Z0-9]{6,20}$/.test(normalized) ? normalized : '';
}

function sanitizeEventName(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
}

function sanitizeEventParams(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return {};
    }

    const allowedParams = {};
    for (const [key, value] of Object.entries(input)) {
        const normalizedKey = String(key || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 40);
        if (!normalizedKey) {
            continue;
        }
        if (typeof value === 'string') {
            allowedParams[normalizedKey] = value.slice(0, 120);
            continue;
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
            allowedParams[normalizedKey] = value;
            continue;
        }
        if (typeof value === 'boolean') {
            allowedParams[normalizedKey] = value;
        }
    }

    return allowedParams;
}

function createAnalyticsApi() {
    return Object.freeze({
        isEnabled() {
            return isAnalyticsEnabled();
        },
        getConsentStatus() {
            if (
                consentStatus === CONSENT_STATUS_GRANTED ||
                consentStatus === CONSENT_STATUS_DENIED
            ) {
                return consentStatus;
            }
            return 'unset';
        },
        openConsentSettings() {
            if (!gaMeasurementId) {
                return false;
            }
            showConsentBanner();
            return true;
        },
        trackEvent(eventName, params = {}) {
            if (!isAnalyticsEnabled() || typeof window.gtag !== 'function') {
                return false;
            }

            const normalizedEventName = sanitizeEventName(eventName);
            if (!normalizedEventName) {
                return false;
            }

            window.gtag('event', normalizedEventName, sanitizeEventParams(params));
            return true;
        },
    });
}
