const CONSENT_STORAGE_KEY = 'minefield-cookie-consent-v1';
const CONSENT_STORAGE_VERSION = 1;
const CONSENT_STATUS_GRANTED = 'granted';
const CONSENT_STATUS_DENIED = 'denied';

const acceptOptionalCookiesBtn = document.getElementById('privacyAcceptOptionalCookiesBtn');
const onlyNecessaryCookiesBtn = document.getElementById('privacyOnlyNecessaryCookiesBtn');
const consentStatusEl = document.getElementById('privacyCookieConsentStatus');

if (acceptOptionalCookiesBtn && onlyNecessaryCookiesBtn && consentStatusEl) {
    acceptOptionalCookiesBtn.addEventListener('click', () => {
        writeStoredConsentStatus(CONSENT_STATUS_GRANTED);
        renderConsentStatus(CONSENT_STATUS_GRANTED);
    });

    onlyNecessaryCookiesBtn.addEventListener('click', () => {
        writeStoredConsentStatus(CONSENT_STATUS_DENIED);
        renderConsentStatus(CONSENT_STATUS_DENIED);
    });

    renderConsentStatus(readStoredConsentStatus());
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

function renderConsentStatus(status) {
    if (!consentStatusEl) {
        return;
    }
    if (status === CONSENT_STATUS_GRANTED) {
        consentStatusEl.textContent = 'Current preference: optional cookies accepted.';
        return;
    }
    if (status === CONSENT_STATUS_DENIED) {
        consentStatusEl.textContent = 'Current preference: only necessary cookies.';
        return;
    }
    consentStatusEl.textContent = 'Current preference: not selected.';
}
