const DEFAULT_TOAST_DURATION_MS = 3600;
const MAX_VISIBLE_TOASTS = 3;
const EXIT_ANIMATION_MS = 220;

export function createToastController() {
    const layer = ensureToastLayer();
    const activeToasts = [];

    return {
        show(message, options = {}) {
            const text = typeof message === 'string' ? message.trim() : '';
            if (!text) {
                return '';
            }

            const toast = buildToastElement(text, {
                tone: sanitizeToastTone(options?.tone),
            });
            const id = createToastId();
            const durationMs = resolveToastDuration(options?.durationMs);
            const entry = {
                id,
                element: toast,
                hideTimeoutId: null,
                removeTimeoutId: null,
            };

            activeToasts.push(entry);
            layer.append(toast);

            while (activeToasts.length > MAX_VISIBLE_TOASTS) {
                dismissToast(activeToasts[0]?.id || '');
            }

            window.requestAnimationFrame(() => {
                toast.dataset.state = 'visible';
            });

            entry.hideTimeoutId = window.setTimeout(() => {
                dismissToast(id);
            }, durationMs);

            return id;
        },
        dismiss(id = '') {
            dismissToast(id);
        },
    };

    function dismissToast(id = '') {
        const toastIndex = activeToasts.findIndex((entry) => entry.id === id);
        if (toastIndex < 0) {
            return;
        }

        const [entry] = activeToasts.splice(toastIndex, 1);
        if (entry.hideTimeoutId != null) {
            window.clearTimeout(entry.hideTimeoutId);
        }
        if (entry.removeTimeoutId != null) {
            window.clearTimeout(entry.removeTimeoutId);
        }

        entry.element.dataset.state = 'hidden';
        entry.element.setAttribute('aria-hidden', 'true');
        entry.removeTimeoutId = window.setTimeout(() => {
            entry.element.remove();
        }, EXIT_ANIMATION_MS);
    }
}

function ensureToastLayer() {
    const existingLayer = document.getElementById('appToastLayer');
    if (existingLayer) {
        return existingLayer;
    }

    const layer = document.createElement('div');
    layer.id = 'appToastLayer';
    layer.className = 'appToastLayer';
    layer.setAttribute('aria-live', 'polite');
    layer.setAttribute('aria-atomic', 'false');
    document.body.append(layer);
    return layer;
}

function buildToastElement(message, { tone = 'info' } = {}) {
    const toast = document.createElement('section');
    toast.className = 'appToast';
    toast.dataset.tone = tone;
    toast.dataset.state = 'hidden';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-hidden', 'false');

    const badge = document.createElement('div');
    badge.className = 'appToastBadge';
    badge.textContent = resolveToastBadgeText(tone);

    const body = document.createElement('div');
    body.className = 'appToastMessage';
    body.textContent = message;

    toast.append(badge, body);
    return toast;
}

function resolveToastBadgeText(tone = 'info') {
    if (tone === 'success') {
        return 'Success';
    }
    if (tone === 'error') {
        return 'Error';
    }
    return 'Notice';
}

function sanitizeToastTone(value) {
    return value === 'success' || value === 'error' ? value : 'info';
}

function resolveToastDuration(value) {
    const durationMs = Number(value);
    if (!Number.isFinite(durationMs)) {
        return DEFAULT_TOAST_DURATION_MS;
    }
    return Math.min(8000, Math.max(1800, Math.round(durationMs)));
}

function createToastId() {
    return `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
