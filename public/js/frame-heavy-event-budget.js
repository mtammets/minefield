const DEFAULT_HEAVY_EVENT_TOKENS_PER_FRAME = 2;

let currentFrameStamp = -1;
let tokensPerFrame = DEFAULT_HEAVY_EVENT_TOKENS_PER_FRAME;
let tokensRemaining = DEFAULT_HEAVY_EVENT_TOKENS_PER_FRAME;
let consumedThisFrame = 0;
let deniedThisFrame = 0;
let totalConsumed = 0;
let totalDenied = 0;

export function beginHeavyEventFrame(frameStamp = 0, tokenBudget = DEFAULT_HEAVY_EVENT_TOKENS_PER_FRAME) {
    const nextStamp = Number.isFinite(frameStamp) ? Math.floor(frameStamp) : 0;
    const nextBudget = clampInteger(
        tokenBudget,
        0,
        6,
        DEFAULT_HEAVY_EVENT_TOKENS_PER_FRAME
    );

    if (nextStamp !== currentFrameStamp) {
        currentFrameStamp = nextStamp;
        tokensPerFrame = nextBudget;
        tokensRemaining = nextBudget;
        consumedThisFrame = 0;
        deniedThisFrame = 0;
        return;
    }

    if (nextBudget === tokensPerFrame) {
        return;
    }
    const budgetDelta = nextBudget - tokensPerFrame;
    tokensPerFrame = nextBudget;
    tokensRemaining = clampInteger(tokensRemaining + budgetDelta, 0, 12, nextBudget);
}

export function tryConsumeHeavyEventToken(cost = 1) {
    const resolvedCost = clampInteger(cost, 1, 4, 1);
    if (currentFrameStamp < 0) {
        beginHeavyEventFrame(0, DEFAULT_HEAVY_EVENT_TOKENS_PER_FRAME);
    }
    if (tokensRemaining >= resolvedCost) {
        tokensRemaining -= resolvedCost;
        consumedThisFrame += resolvedCost;
        totalConsumed += resolvedCost;
        return true;
    }
    deniedThisFrame += 1;
    totalDenied += 1;
    return false;
}

export function getHeavyEventBudgetSnapshot() {
    return {
        frameStamp: currentFrameStamp,
        tokensPerFrame,
        tokensRemaining,
        consumedThisFrame,
        deniedThisFrame,
        totalConsumed,
        totalDenied,
    };
}

function clampInteger(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, Math.round(numeric)));
}
