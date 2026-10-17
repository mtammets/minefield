(function bootstrapRuntimeExperienceMode() {
    const MOBILE_LEADERBOARD_MODE = 'mobile-leaderboard';
    const GAME_MODE = 'game';

    function matchesMedia(query) {
        try {
            return Boolean(window.matchMedia && window.matchMedia(query).matches);
        } catch {
            return false;
        }
    }

    function isTruthyFlag(value) {
        if (typeof value !== 'string') {
            return false;
        }
        const normalized = value.trim().toLowerCase();
        return (
            normalized === '1' ||
            normalized === 'true' ||
            normalized === 'yes' ||
            normalized === 'on'
        );
    }

    function resolveForcedMode(searchParams) {
        const experienceParam = String(searchParams.get('experience') || '')
            .trim()
            .toLowerCase();
        if (
            experienceParam === 'mobile' ||
            experienceParam === 'leaderboard' ||
            experienceParam === MOBILE_LEADERBOARD_MODE
        ) {
            return MOBILE_LEADERBOARD_MODE;
        }
        if (experienceParam === GAME_MODE) {
            return GAME_MODE;
        }
        if (isTruthyFlag(searchParams.get('mobileLeaderboard'))) {
            return MOBILE_LEADERBOARD_MODE;
        }
        if (isTruthyFlag(searchParams.get('forceGame'))) {
            return GAME_MODE;
        }
        return '';
    }

    function resolveRuntimeExperienceMode() {
        const searchParams = new URLSearchParams(window.location.search || '');
        const forcedMode = resolveForcedMode(searchParams);
        if (forcedMode) {
            return forcedMode;
        }

        const userAgent = String(window.navigator?.userAgent || '');
        const platform = String(window.navigator?.platform || '');
        const maxTouchPoints = Math.max(
            0,
            Math.round(Number(window.navigator?.maxTouchPoints) || 0)
        );
        const userAgentDataMobile = Boolean(window.navigator?.userAgentData?.mobile);
        const shortEdge = Math.min(window.innerWidth || 0, window.innerHeight || 0);
        const longEdge = Math.max(window.innerWidth || 0, window.innerHeight || 0);
        const coarsePointer =
            matchesMedia('(pointer: coarse)') || matchesMedia('(any-pointer: coarse)');
        const noHover = matchesMedia('(hover: none)') || matchesMedia('(any-hover: none)');
        const isPhoneUserAgent =
            /Android.+Mobile|iPhone|iPod|Windows Phone|Mobile/iu.test(userAgent) ||
            userAgentDataMobile;
        const isTabletUserAgent =
            /iPad|Tablet|Silk|PlayBook|Kindle/iu.test(userAgent) ||
            (/Android/iu.test(userAgent) && !/Mobile/iu.test(userAgent)) ||
            (platform === 'MacIntel' && maxTouchPoints > 1);
        const looksLikePhoneOrTabletViewport =
            shortEdge > 0 && shortEdge <= 1024 && longEdge <= 1400;
        const touchFirstDevice = maxTouchPoints > 0 || coarsePointer;

        if (
            touchFirstDevice &&
            (isPhoneUserAgent || isTabletUserAgent || (noHover && looksLikePhoneOrTabletViewport))
        ) {
            return MOBILE_LEADERBOARD_MODE;
        }
        return GAME_MODE;
    }

    const resolvedMode = resolveRuntimeExperienceMode();
    window.__MINEFIELD_DRIFT_EXPERIENCE__ = resolvedMode;
    document.documentElement.dataset.experience = resolvedMode;
})();
