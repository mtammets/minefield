function consumeRateLimit(store, key, nowMs, windowMs, maxCount) {
    if (!(store instanceof Map)) {
        return false;
    }
    if (!key || typeof key !== 'string') {
        return false;
    }

    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const windowDuration = Math.max(50, Math.round(Number(windowMs) || 1000));
    const max = Math.max(1, Math.round(Number(maxCount) || 1));

    const bucket = store.get(key);
    if (!bucket || now - bucket.windowStartAt >= windowDuration) {
        store.set(key, {
            windowStartAt: now,
            count: 1,
        });
        return true;
    }

    if (bucket.count >= max) {
        return false;
    }

    bucket.count += 1;
    return true;
}

module.exports = {
    consumeRateLimit,
};
