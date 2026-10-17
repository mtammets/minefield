const GA_COOKIE_NAME_PATTERNS = [
    /^_ga($|_)/i,
    /^_gid$/i,
    /^_gat($|_)/i,
    /^_gac_/i,
    /^_gcl_/i,
    /^_dc_gtm_/i,
];

const COOKIE_DELETE_DATE = 'Thu, 01 Jan 1970 00:00:00 GMT';

export function clearAnalyticsCookies() {
    try {
        const cookieNames = getCookieNames();
        if (!cookieNames.length) {
            return false;
        }

        const analyticsCookieNames = cookieNames.filter(isAnalyticsCookieName);
        if (!analyticsCookieNames.length) {
            return false;
        }

        const domainCandidates = resolveDomainCandidates(window.location.hostname);
        const pathCandidates = resolvePathCandidates(window.location.pathname);
        const secureVariants = window.location.protocol === 'https:' ? ['', '; Secure'] : [''];

        for (const cookieName of analyticsCookieNames) {
            for (const pathValue of pathCandidates) {
                for (const domainValue of domainCandidates) {
                    for (const secureSuffix of secureVariants) {
                        const domainSuffix = domainValue ? `; Domain=${domainValue}` : '';
                        document.cookie =
                            `${cookieName}=; Expires=${COOKIE_DELETE_DATE}; Max-Age=0; Path=${pathValue}` +
                            `${domainSuffix}; SameSite=Lax${secureSuffix}`;
                    }
                }
            }
        }
        return true;
    } catch {
        return false;
    }
}

function getCookieNames() {
    const rawCookieString = typeof document.cookie === 'string' ? document.cookie : '';
    if (!rawCookieString.trim()) {
        return [];
    }
    const names = new Set();
    for (const cookieEntry of rawCookieString.split(';')) {
        const separatorIndex = cookieEntry.indexOf('=');
        const name =
            separatorIndex === -1
                ? cookieEntry.trim()
                : cookieEntry.slice(0, separatorIndex).trim();
        if (name) {
            names.add(name);
        }
    }
    return Array.from(names);
}

function isAnalyticsCookieName(cookieName) {
    return GA_COOKIE_NAME_PATTERNS.some((pattern) => pattern.test(cookieName));
}

function resolvePathCandidates(pathname) {
    const normalizedPath = sanitizePath(pathname);
    const candidates = new Set(['/']);
    candidates.add(normalizedPath);

    if (normalizedPath === '/') {
        return Array.from(candidates);
    }

    const segments = normalizedPath.split('/').filter(Boolean);
    for (let index = segments.length; index > 0; index -= 1) {
        candidates.add(`/${segments.slice(0, index).join('/')}`);
    }

    return Array.from(candidates);
}

function sanitizePath(pathname) {
    if (typeof pathname !== 'string' || !pathname.trim()) {
        return '/';
    }
    return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function resolveDomainCandidates(hostname) {
    const normalizedHost = String(hostname || '')
        .trim()
        .toLowerCase();
    const candidates = new Set(['']);
    if (!normalizedHost || normalizedHost === 'localhost' || isIpv4Like(normalizedHost)) {
        return Array.from(candidates);
    }

    const hostParts = normalizedHost.split('.').filter(Boolean);
    if (hostParts.length < 2) {
        return Array.from(candidates);
    }

    for (let index = 0; index <= hostParts.length - 2; index += 1) {
        const domainValue = hostParts.slice(index).join('.');
        if (!domainValue) {
            continue;
        }
        candidates.add(domainValue);
        candidates.add(`.${domainValue}`);
    }

    return Array.from(candidates);
}

function isIpv4Like(value) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(value);
}
