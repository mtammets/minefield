const PUBLIC_CONFIG_ENDPOINT_PATH = '/api/public-config';
const PUBLIC_CONFIG_REQUEST_TIMEOUT_MS = 8000;
const PUBLIC_CONFIG_REQUEST_RETRY_COUNT = 2;
const PUBLIC_CONFIG_REQUEST_RETRY_DELAY_MS = 250;

let publicConfigPromise = null;

export async function fetchPublicConfig({ force = false } = {}) {
    if (!publicConfigPromise || force) {
        publicConfigPromise = fetchPublicConfigInternal();
    }

    const result = await publicConfigPromise;
    if (!result) {
        publicConfigPromise = null;
    }
    return result;
}

async function fetchPublicConfigInternal() {
    const maxAttempts = PUBLIC_CONFIG_REQUEST_RETRY_COUNT + 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const controller = new AbortController();
        const timeoutHandle = window.setTimeout(() => {
            controller.abort();
        }, PUBLIC_CONFIG_REQUEST_TIMEOUT_MS);

        try {
            const response = await window.fetch(PUBLIC_CONFIG_ENDPOINT_PATH, {
                method: 'GET',
                cache: 'no-store',
                credentials: 'same-origin',
                signal: controller.signal,
            });
            if (!response.ok) {
                continue;
            }
            return await response.json();
        } catch {
            // Retry below when attempts remain.
        } finally {
            window.clearTimeout(timeoutHandle);
        }

        if (attempt + 1 < maxAttempts) {
            await waitForPublicConfigRetry((attempt + 1) * PUBLIC_CONFIG_REQUEST_RETRY_DELAY_MS);
        }
    }
    return null;
}

function waitForPublicConfigRetry(timeoutMs) {
    const delayMs = Math.max(0, Math.round(Number(timeoutMs) || 0));
    return new Promise((resolve) => {
        window.setTimeout(resolve, delayMs);
    });
}
