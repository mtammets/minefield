const PUBLIC_CONFIG_ENDPOINT_PATH = '/api/public-config';
const PUBLIC_CONFIG_REQUEST_TIMEOUT_MS = 3500;

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
            return null;
        }
        return await response.json();
    } catch {
        return null;
    } finally {
        window.clearTimeout(timeoutHandle);
    }
}
