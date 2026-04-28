function sanitizeHttpOrigin(rawValue) {
    if (typeof rawValue !== 'string') {
        return '';
    }
    const normalized = rawValue.trim();
    if (!normalized) {
        return '';
    }
    try {
        const parsed = new URL(normalized);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return '';
        }
        return parsed.origin;
    } catch {
        return '';
    }
}

function sanitizeHttpHostHeader(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized.includes('/') || normalized.includes('\\')) {
        return '';
    }
    const isHostname = /^[a-z0-9.-]+(?::\d{1,5})?$/.test(normalized);
    const isIpv6 = /^\[[a-f0-9:]+\](?::\d{1,5})?$/.test(normalized);
    return isHostname || isIpv6 ? normalized : '';
}

function parseAllowedOriginList(rawValue) {
    if (typeof rawValue !== 'string') {
        return [];
    }
    return rawValue
        .split(',')
        .map((item) => sanitizeHttpOrigin(item))
        .filter(Boolean);
}

function readFirstHeaderValue(value) {
    if (Array.isArray(value)) {
        return typeof value[0] === 'string' ? value[0] : '';
    }
    if (typeof value !== 'string') {
        return '';
    }
    return value.split(',')[0].trim();
}

function resolveSocketRequestHost(req) {
    const forwardedHost = sanitizeHttpHostHeader(
        readFirstHeaderValue(req?.headers?.['x-forwarded-host'])
    );
    if (forwardedHost) {
        return forwardedHost;
    }
    return sanitizeHttpHostHeader(readFirstHeaderValue(req?.headers?.host));
}

function isSocketCorsOriginAllowed(origin, options = {}) {
    if (!origin) {
        return true;
    }

    const normalizedOrigin = sanitizeHttpOrigin(origin);
    if (!normalizedOrigin) {
        return false;
    }

    const allowedOrigins = Array.isArray(options.allowedOrigins) ? options.allowedOrigins : [];
    if (allowedOrigins.length > 0) {
        return allowedOrigins.includes(normalizedOrigin);
    }

    return true;
}

function isSocketOriginAllowed(origin, options = {}) {
    if (!origin) {
        return true;
    }

    const normalizedOrigin = sanitizeHttpOrigin(origin);
    if (!normalizedOrigin) {
        return false;
    }

    const allowedOrigins = Array.isArray(options.allowedOrigins) ? options.allowedOrigins : [];
    if (allowedOrigins.length > 0) {
        return allowedOrigins.includes(normalizedOrigin);
    }

    const parsedOrigin = new URL(normalizedOrigin);
    const requestHost = sanitizeHttpHostHeader(options.requestHost || '');
    if (requestHost && parsedOrigin.host === requestHost) {
        return true;
    }

    const publicBaseUrl = sanitizeHttpOrigin(options.publicBaseUrl || '');
    if (publicBaseUrl && normalizedOrigin === publicBaseUrl) {
        return true;
    }

    const hostname = (parsedOrigin.hostname || '').toLowerCase();
    if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.endsWith('.local')
    ) {
        return true;
    }

    return isPrivateIpv4Address(hostname);
}

function isPrivateIpv4Address(hostname) {
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
        return false;
    }
    const parts = hostname.split('.').map((part) => Number(part));
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return false;
    }
    const [a, b] = parts;
    if (a === 10 || a === 127) {
        return true;
    }
    if (a === 192 && b === 168) {
        return true;
    }
    return a === 172 && b >= 16 && b <= 31;
}

module.exports = {
    isSocketCorsOriginAllowed,
    isSocketOriginAllowed,
    parseAllowedOriginList,
    resolveSocketRequestHost,
    sanitizeHttpHostHeader,
    sanitizeHttpOrigin,
};
