import {
    DEFAULT_PLAYER_VEHICLE_ID,
    PLAYER_VEHICLE_PRESETS,
    resolvePlayerVehicleId,
} from './car-vehicles.js';
import {
    DEFAULT_PLAYER_WHEEL_PRESET_ID,
    PLAYER_WHEEL_PRESETS,
    getPlayerWheelPresetById,
    resolvePlayerWheelPresetId,
} from './wheel-presets.js';

export const PLAYER_ECONOMY_STORAGE_KEY = 'silentdrift-player-economy-v1';
export const PLAYER_ECONOMY_METADATA_CREDITS_KEY = 'economy_credits';
export const PLAYER_ECONOMY_METADATA_UNLOCKS_KEY = 'economy_unlocked_vehicle_ids';
export const PLAYER_ECONOMY_METADATA_WHEEL_UNLOCKS_KEY = 'economy_unlocked_wheel_preset_ids';
export const PLAYER_CREDITS_LABEL = 'Credits';
export const PLAYER_PICKUP_CREDIT_VALUE = 1;
export const PLAYER_MINE_KILL_CREDIT_VALUE = 3;

const PLAYER_ECONOMY_MAX_CREDITS = Number.MAX_SAFE_INTEGER;
const PLAYER_CREDITS_NUMBER_FORMATTER = new Intl.NumberFormat('en-US');
const PICKUP_CREDIT_VALUE = PLAYER_PICKUP_CREDIT_VALUE;
const MINE_KILL_CREDIT_VALUE = PLAYER_MINE_KILL_CREDIT_VALUE;
const ROUND_SETTLEMENT_CREDIT_BONUS = 2;
const ROUND_WIN_CREDIT_BONUS = 5;
const OPPONENT_SWEEP_CREDIT_BONUS = 4;
const ONLINE_FINISH_CREDIT_BONUS = 3;
const CAMPAIGN_COMPLETE_CREDIT_BONUS = 15;

const DEFAULT_UNLOCKED_VEHICLE_IDS = Object.freeze(resolveDefaultUnlockedVehicleIds());
const DEFAULT_UNLOCKED_WHEEL_PRESET_IDS = Object.freeze(resolveDefaultUnlockedWheelPresetIds());

export function formatPlayerCredits(value = 0, { formatter = null, includePlusSign = false } = {}) {
    const numericValue = Math.round(Number(value) || 0);
    const absoluteValue = Math.abs(numericValue);
    const resolvedFormatter =
        formatter && typeof formatter.format === 'function'
            ? formatter
            : PLAYER_CREDITS_NUMBER_FORMATTER;
    const prefix = numericValue < 0 ? '-' : includePlusSign && numericValue > 0 ? '+' : '';
    const unitLabel = absoluteValue === 1 ? 'Credit' : PLAYER_CREDITS_LABEL;
    return `${prefix}${resolvedFormatter.format(absoluteValue)} ${unitLabel}`;
}

export function createDefaultPlayerEconomyState() {
    return {
        credits: 0,
        unlockedVehicleIds: [...DEFAULT_UNLOCKED_VEHICLE_IDS],
        unlockedWheelPresetIds: [...DEFAULT_UNLOCKED_WHEEL_PRESET_IDS],
    };
}

export function normalizePlayerEconomyState(value = null) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        credits: clampCredits(source.credits),
        unlockedVehicleIds: normalizeUnlockedVehicleIds(source.unlockedVehicleIds),
        unlockedWheelPresetIds: normalizeUnlockedWheelPresetIds(source.unlockedWheelPresetIds),
    };
}

export function arePlayerEconomyStatesEqual(left = null, right = null) {
    const normalizedLeft = normalizePlayerEconomyState(left);
    const normalizedRight = normalizePlayerEconomyState(right);
    if (normalizedLeft.credits !== normalizedRight.credits) {
        return false;
    }
    if (normalizedLeft.unlockedVehicleIds.length !== normalizedRight.unlockedVehicleIds.length) {
        return false;
    }
    for (let i = 0; i < normalizedLeft.unlockedVehicleIds.length; i += 1) {
        if (normalizedLeft.unlockedVehicleIds[i] !== normalizedRight.unlockedVehicleIds[i]) {
            return false;
        }
    }
    if (
        normalizedLeft.unlockedWheelPresetIds.length !==
        normalizedRight.unlockedWheelPresetIds.length
    ) {
        return false;
    }
    for (let i = 0; i < normalizedLeft.unlockedWheelPresetIds.length; i += 1) {
        if (
            normalizedLeft.unlockedWheelPresetIds[i] !== normalizedRight.unlockedWheelPresetIds[i]
        ) {
            return false;
        }
    }
    return true;
}

export function mergePlayerEconomyStates(...states) {
    let mergedCredits = 0;
    const unlockedVehicleIds = new Set(DEFAULT_UNLOCKED_VEHICLE_IDS);
    const unlockedWheelPresetIds = new Set(DEFAULT_UNLOCKED_WHEEL_PRESET_IDS);

    for (let i = 0; i < states.length; i += 1) {
        const normalizedState = normalizePlayerEconomyState(states[i]);
        mergedCredits = Math.max(mergedCredits, normalizedState.credits);
        for (let j = 0; j < normalizedState.unlockedVehicleIds.length; j += 1) {
            unlockedVehicleIds.add(normalizedState.unlockedVehicleIds[j]);
        }
        for (let j = 0; j < normalizedState.unlockedWheelPresetIds.length; j += 1) {
            unlockedWheelPresetIds.add(normalizedState.unlockedWheelPresetIds[j]);
        }
    }

    return normalizePlayerEconomyState({
        credits: mergedCredits,
        unlockedVehicleIds: [...unlockedVehicleIds],
        unlockedWheelPresetIds: [...unlockedWheelPresetIds],
    });
}

export function resolvePlayerEconomyStateFromSource(source = null) {
    if (!source || typeof source !== 'object') {
        return createDefaultPlayerEconomyState();
    }

    const metadata =
        source?.user_metadata && typeof source.user_metadata === 'object'
            ? source.user_metadata
            : source?.economy && typeof source.economy === 'object'
              ? source.economy
              : source;

    return normalizePlayerEconomyState({
        credits:
            metadata?.[PLAYER_ECONOMY_METADATA_CREDITS_KEY] ?? metadata?.credits ?? source?.credits,
        unlockedVehicleIds:
            metadata?.[PLAYER_ECONOMY_METADATA_UNLOCKS_KEY] ??
            metadata?.unlockedVehicleIds ??
            source?.unlockedVehicleIds,
        unlockedWheelPresetIds:
            metadata?.[PLAYER_ECONOMY_METADATA_WHEEL_UNLOCKS_KEY] ??
            metadata?.unlockedWheelPresetIds ??
            source?.unlockedWheelPresetIds,
    });
}

export function buildPlayerEconomyMetadataPatch(state = null) {
    const normalizedState = normalizePlayerEconomyState(state);
    return {
        [PLAYER_ECONOMY_METADATA_CREDITS_KEY]: normalizedState.credits,
        [PLAYER_ECONOMY_METADATA_UNLOCKS_KEY]: [...normalizedState.unlockedVehicleIds],
        [PLAYER_ECONOMY_METADATA_WHEEL_UNLOCKS_KEY]: [...normalizedState.unlockedWheelPresetIds],
    };
}

export function readPersistedPlayerEconomyState() {
    const fallback = createDefaultPlayerEconomyState();
    try {
        const storedValue = window.localStorage.getItem(PLAYER_ECONOMY_STORAGE_KEY);
        if (!storedValue) {
            return fallback;
        }
        return normalizePlayerEconomyState(JSON.parse(storedValue));
    } catch {
        return fallback;
    }
}

export function persistPlayerEconomyState(state = null) {
    const normalizedState = normalizePlayerEconomyState(state);
    try {
        window.localStorage.setItem(PLAYER_ECONOMY_STORAGE_KEY, JSON.stringify(normalizedState));
    } catch {
        // localStorage can fail in restricted browsing modes.
    }
}

export function getVehicleUnlockPriceCredits(vehicleId = DEFAULT_PLAYER_VEHICLE_ID) {
    const vehiclePreset = getPlayerVehicleEconomyPreset(vehicleId);
    return Math.max(0, Math.round(Number(vehiclePreset?.unlockPriceCredits) || 0));
}

export function getWheelPresetUnlockPriceCredits(wheelPresetId = DEFAULT_PLAYER_WHEEL_PRESET_ID) {
    const wheelPreset = getPlayerWheelPresetById(wheelPresetId);
    return Math.max(0, Math.round(Number(wheelPreset?.unlockPriceCredits) || 0));
}

export function getOwnedVehicleCountForEconomy(economyState = null) {
    return normalizePlayerEconomyState(economyState).unlockedVehicleIds.length;
}

export function getOwnedWheelPresetCountForEconomy(economyState = null) {
    return normalizePlayerEconomyState(economyState).unlockedWheelPresetIds.length;
}

export function isVehicleUnlockedForEconomy(
    economyState = null,
    vehicleId = DEFAULT_PLAYER_VEHICLE_ID
) {
    const normalizedVehicleId = resolvePlayerVehicleId(vehicleId || DEFAULT_PLAYER_VEHICLE_ID);
    const normalizedState = normalizePlayerEconomyState(economyState);
    return normalizedState.unlockedVehicleIds.includes(normalizedVehicleId);
}

export function isWheelPresetUnlockedForEconomy(
    economyState = null,
    wheelPresetId = DEFAULT_PLAYER_WHEEL_PRESET_ID
) {
    const normalizedWheelPresetId = resolvePlayerWheelPresetId(
        wheelPresetId || DEFAULT_PLAYER_WHEEL_PRESET_ID
    );
    const normalizedState = normalizePlayerEconomyState(economyState);
    return normalizedState.unlockedWheelPresetIds.includes(normalizedWheelPresetId);
}

export function resolveOwnedVehicleIdForEconomy(
    vehicleId = DEFAULT_PLAYER_VEHICLE_ID,
    economyState = null
) {
    const normalizedVehicleId = resolvePlayerVehicleId(vehicleId || DEFAULT_PLAYER_VEHICLE_ID);
    if (isVehicleUnlockedForEconomy(economyState, normalizedVehicleId)) {
        return normalizedVehicleId;
    }
    return DEFAULT_UNLOCKED_VEHICLE_IDS[0] || DEFAULT_PLAYER_VEHICLE_ID;
}

export function resolveOwnedWheelPresetIdForEconomy(
    wheelPresetId = DEFAULT_PLAYER_WHEEL_PRESET_ID,
    economyState = null
) {
    const normalizedWheelPresetId = resolvePlayerWheelPresetId(
        wheelPresetId || DEFAULT_PLAYER_WHEEL_PRESET_ID
    );
    if (isWheelPresetUnlockedForEconomy(economyState, normalizedWheelPresetId)) {
        return normalizedWheelPresetId;
    }
    return DEFAULT_UNLOCKED_WHEEL_PRESET_IDS[0] || DEFAULT_PLAYER_WHEEL_PRESET_ID;
}

export function getVehiclePurchaseAvailability(
    economyState = null,
    vehicleId = DEFAULT_PLAYER_VEHICLE_ID
) {
    const normalizedState = normalizePlayerEconomyState(economyState);
    const normalizedVehicleId = resolvePlayerVehicleId(vehicleId || DEFAULT_PLAYER_VEHICLE_ID);
    const unlockPriceCredits = getVehicleUnlockPriceCredits(normalizedVehicleId);
    const unlocked = normalizedState.unlockedVehicleIds.includes(normalizedVehicleId);
    const canAfford = unlocked || normalizedState.credits >= unlockPriceCredits;
    return {
        vehicleId: normalizedVehicleId,
        unlocked,
        unlockPriceCredits,
        canAfford,
        creditsBalance: normalizedState.credits,
        creditsShort: unlocked ? 0 : Math.max(0, unlockPriceCredits - normalizedState.credits),
    };
}

export function getWheelPresetPurchaseAvailability(
    economyState = null,
    wheelPresetId = DEFAULT_PLAYER_WHEEL_PRESET_ID
) {
    const normalizedState = normalizePlayerEconomyState(economyState);
    const normalizedWheelPresetId = resolvePlayerWheelPresetId(
        wheelPresetId || DEFAULT_PLAYER_WHEEL_PRESET_ID
    );
    const unlockPriceCredits = getWheelPresetUnlockPriceCredits(normalizedWheelPresetId);
    const unlocked = normalizedState.unlockedWheelPresetIds.includes(normalizedWheelPresetId);
    const canAfford = unlocked || normalizedState.credits >= unlockPriceCredits;
    return {
        wheelPresetId: normalizedWheelPresetId,
        unlocked,
        unlockPriceCredits,
        canAfford,
        creditsBalance: normalizedState.credits,
        creditsShort: unlocked ? 0 : Math.max(0, unlockPriceCredits - normalizedState.credits),
    };
}

export function getGarageWheelPresetDisplayOrder(
    economyState = null,
    pinnedWheelPresetId = ''
) {
    const normalizedState = normalizePlayerEconomyState(economyState);
    const normalizedPinnedWheelPresetId = pinnedWheelPresetId
        ? resolvePlayerWheelPresetId(pinnedWheelPresetId)
        : '';
    const unlockedWheelPresetIds = normalizedState.unlockedWheelPresetIds;
    const lockedWheelPresetIds = [];
    const unlockedDisplayWheelPresetIds = [];
    let hasPinnedWheelPreset = false;

    for (let i = 0; i < PLAYER_WHEEL_PRESETS.length; i += 1) {
        const preset = PLAYER_WHEEL_PRESETS[i];
        const wheelPresetId = resolvePlayerWheelPresetId(preset?.id || DEFAULT_PLAYER_WHEEL_PRESET_ID);
        if (!wheelPresetId) {
            continue;
        }
        if (wheelPresetId === normalizedPinnedWheelPresetId) {
            hasPinnedWheelPreset = true;
            continue;
        }
        if (unlockedWheelPresetIds.includes(wheelPresetId)) {
            unlockedDisplayWheelPresetIds.push(wheelPresetId);
            continue;
        }
        lockedWheelPresetIds.push(wheelPresetId);
    }

    const orderedWheelPresetIds = [...lockedWheelPresetIds, ...unlockedDisplayWheelPresetIds];
    if (hasPinnedWheelPreset) {
        orderedWheelPresetIds.push(normalizedPinnedWheelPresetId);
    }
    return orderedWheelPresetIds;
}

export function resolveNextVehicleUnlockTarget(economyState = null) {
    const normalizedState = normalizePlayerEconomyState(economyState);
    for (let i = 0; i < PLAYER_VEHICLE_PRESETS.length; i += 1) {
        const preset = PLAYER_VEHICLE_PRESETS[i];
        const vehicleId = resolvePlayerVehicleId(preset?.id || DEFAULT_PLAYER_VEHICLE_ID);
        const availability = getVehiclePurchaseAvailability(normalizedState, vehicleId);
        if (availability.unlocked) {
            continue;
        }
        const unlockPriceCredits = Math.max(1, availability.unlockPriceCredits);
        const currentCredits = Math.max(0, normalizedState.credits);
        return {
            vehicleId,
            vehicleName: preset?.name || 'Vehicle',
            unlockPriceCredits,
            creditsBalance: currentCredits,
            creditsShort: availability.creditsShort,
            canAfford: availability.canAfford,
            progressRatio: Math.min(1, currentCredits / unlockPriceCredits),
            unlocked: false,
        };
    }
    return {
        vehicleId: '',
        vehicleName: 'All chassis unlocked',
        unlockPriceCredits: 0,
        creditsBalance: Math.max(0, normalizedState.credits),
        creditsShort: 0,
        canAfford: true,
        progressRatio: 1,
        unlocked: true,
    };
}

export function resolveNextWheelPresetUnlockTarget(economyState = null) {
    const normalizedState = normalizePlayerEconomyState(economyState);
    for (let i = 0; i < PLAYER_WHEEL_PRESETS.length; i += 1) {
        const preset = PLAYER_WHEEL_PRESETS[i];
        const wheelPresetId = resolvePlayerWheelPresetId(
            preset?.id || DEFAULT_PLAYER_WHEEL_PRESET_ID
        );
        const availability = getWheelPresetPurchaseAvailability(normalizedState, wheelPresetId);
        if (availability.unlocked) {
            continue;
        }
        const unlockPriceCredits = Math.max(1, availability.unlockPriceCredits);
        const currentCredits = Math.max(0, normalizedState.credits);
        return {
            wheelPresetId,
            name: preset?.name || 'Wheel set',
            unlockPriceCredits,
            creditsBalance: currentCredits,
            creditsShort: availability.creditsShort,
            canAfford: availability.canAfford,
            progressRatio: Math.min(1, currentCredits / unlockPriceCredits),
            unlocked: false,
        };
    }
    return {
        wheelPresetId: '',
        name: 'All wheel sets unlocked',
        unlockPriceCredits: 0,
        creditsBalance: Math.max(0, normalizedState.credits),
        creditsShort: 0,
        canAfford: true,
        progressRatio: 1,
        unlocked: true,
    };
}

export function resolveNextGarageUnlockTarget(economyState = null) {
    const nextVehicleUnlock = resolveNextVehicleUnlockTarget(economyState);
    if (!nextVehicleUnlock.unlocked) {
        return {
            type: 'vehicle',
            id: nextVehicleUnlock.vehicleId,
            name: nextVehicleUnlock.vehicleName,
            unlockPriceCredits: nextVehicleUnlock.unlockPriceCredits,
            creditsBalance: nextVehicleUnlock.creditsBalance,
            creditsShort: nextVehicleUnlock.creditsShort,
            canAfford: nextVehicleUnlock.canAfford,
            progressRatio: nextVehicleUnlock.progressRatio,
            unlocked: false,
        };
    }

    const nextWheelUnlock = resolveNextWheelPresetUnlockTarget(economyState);
    if (!nextWheelUnlock.unlocked) {
        return {
            type: 'wheel',
            id: nextWheelUnlock.wheelPresetId,
            name: nextWheelUnlock.name,
            unlockPriceCredits: nextWheelUnlock.unlockPriceCredits,
            creditsBalance: nextWheelUnlock.creditsBalance,
            creditsShort: nextWheelUnlock.creditsShort,
            canAfford: nextWheelUnlock.canAfford,
            progressRatio: nextWheelUnlock.progressRatio,
            unlocked: false,
        };
    }

    const normalizedState = normalizePlayerEconomyState(economyState);
    return {
        type: 'complete',
        id: '',
        name: 'Garage complete',
        unlockPriceCredits: 0,
        creditsBalance: Math.max(0, normalizedState.credits),
        creditsShort: 0,
        canAfford: true,
        progressRatio: 1,
        unlocked: true,
    };
}

export function purchaseVehicleWithEconomy(
    economyState = null,
    vehicleId = DEFAULT_PLAYER_VEHICLE_ID
) {
    const normalizedState = normalizePlayerEconomyState(economyState);
    const availability = getVehiclePurchaseAvailability(normalizedState, vehicleId);
    if (availability.unlocked) {
        return {
            ok: true,
            alreadyUnlocked: true,
            vehicleId: availability.vehicleId,
            costCredits: 0,
            economy: normalizedState,
        };
    }
    if (!availability.canAfford) {
        return {
            ok: false,
            vehicleId: availability.vehicleId,
            costCredits: availability.unlockPriceCredits,
            creditsShort: availability.creditsShort,
            error: 'not-enough-credits',
        };
    }

    const nextState = normalizePlayerEconomyState({
        credits: normalizedState.credits - availability.unlockPriceCredits,
        unlockedVehicleIds: [...normalizedState.unlockedVehicleIds, availability.vehicleId],
        unlockedWheelPresetIds: normalizedState.unlockedWheelPresetIds,
    });

    return {
        ok: true,
        alreadyUnlocked: false,
        vehicleId: availability.vehicleId,
        costCredits: availability.unlockPriceCredits,
        economy: nextState,
    };
}

export function purchaseWheelPresetWithEconomy(
    economyState = null,
    wheelPresetId = DEFAULT_PLAYER_WHEEL_PRESET_ID
) {
    const normalizedState = normalizePlayerEconomyState(economyState);
    const availability = getWheelPresetPurchaseAvailability(normalizedState, wheelPresetId);
    if (availability.unlocked) {
        return {
            ok: true,
            alreadyUnlocked: true,
            wheelPresetId: availability.wheelPresetId,
            costCredits: 0,
            economy: normalizedState,
        };
    }
    if (!availability.canAfford) {
        return {
            ok: false,
            wheelPresetId: availability.wheelPresetId,
            costCredits: availability.unlockPriceCredits,
            creditsShort: availability.creditsShort,
            error: 'not-enough-credits',
        };
    }

    const nextState = normalizePlayerEconomyState({
        credits: normalizedState.credits - availability.unlockPriceCredits,
        unlockedVehicleIds: normalizedState.unlockedVehicleIds,
        unlockedWheelPresetIds: [
            ...normalizedState.unlockedWheelPresetIds,
            availability.wheelPresetId,
        ],
    });

    return {
        ok: true,
        alreadyUnlocked: false,
        wheelPresetId: availability.wheelPresetId,
        costCredits: availability.unlockPriceCredits,
        economy: nextState,
    };
}

export function awardCreditsToEconomy(economyState = null, credits = 0) {
    const normalizedState = normalizePlayerEconomyState(economyState);
    const creditsEarned = Math.max(0, Math.round(Number(credits) || 0));
    return normalizePlayerEconomyState({
        credits: normalizedState.credits + creditsEarned,
        unlockedVehicleIds: normalizedState.unlockedVehicleIds,
        unlockedWheelPresetIds: normalizedState.unlockedWheelPresetIds,
    });
}

export function resolveRoundEconomyReward({
    event = null,
    gameMode = 'bots',
    playerCollectorId = 'player',
} = {}) {
    const scoreEntries = Array.isArray(event?.scoreboard) ? event.scoreboard : [];
    const selfEntry = resolvePlayerScoreboardEntry(scoreEntries, playerCollectorId);
    const selfScore = Math.max(0, Math.round(Number(selfEntry?.score) || 0));
    const selfCollectedCount = Math.max(0, Math.round(Number(selfEntry?.collectedCount) || 0));
    const stats = selfEntry?.stats && typeof selfEntry.stats === 'object' ? selfEntry.stats : {};
    const pickupCount = Math.max(0, Math.round(Number(stats.pickupCount) || selfCollectedCount));
    const mineKillCount = Math.max(0, Math.round(Number(stats.mineKillCount) || 0));
    const finishReason =
        typeof event?.finishReason === 'string' ? event.finishReason.trim().toLowerCase() : '';
    const topScore = Math.max(0, Math.round(Number(event?.topScore) || 0));
    const isWinner = selfScore > 0 && topScore > 0 && selfScore === topScore;
    const runSettled =
        scoreEntries.length > 0 ||
        Boolean(finishReason) ||
        Number.isFinite(Number(event?.totalPickups)) ||
        Number.isFinite(Number(event?.totalCollected));
    const breakdown = [];

    addBreakdownLine(breakdown, 'pickup-run', 'Pickup run', pickupCount * PICKUP_CREDIT_VALUE);
    addBreakdownLine(breakdown, 'mine-kills', 'Mine kills', mineKillCount * MINE_KILL_CREDIT_VALUE);

    const earnedAnything = pickupCount > 0 || mineKillCount > 0 || selfScore > 0;
    if (runSettled) {
        addBreakdownLine(
            breakdown,
            'settlement',
            finishReason === 'mission-failed' ? 'Run settled' : 'Finished round',
            ROUND_SETTLEMENT_CREDIT_BONUS
        );
    }
    if (isWinner) {
        addBreakdownLine(breakdown, 'winner', 'Round winner', ROUND_WIN_CREDIT_BONUS);
    }
    if (gameMode === 'online' && earnedAnything) {
        addBreakdownLine(breakdown, 'online', 'Online room finish', ONLINE_FINISH_CREDIT_BONUS);
    }
    if (finishReason === 'opponents-eliminated') {
        addBreakdownLine(breakdown, 'sweep', 'Sector sweep', OPPONENT_SWEEP_CREDIT_BONUS);
    }
    if (finishReason === 'campaign-complete') {
        addBreakdownLine(breakdown, 'campaign', 'Campaign clear', CAMPAIGN_COMPLETE_CREDIT_BONUS);
    }

    const creditsEarned = breakdown.reduce((sum, line) => sum + line.credits, 0);
    return {
        creditsEarned,
        breakdown,
        isWinner,
        finishReason,
        pickupCount,
        mineKillCount,
        selfScore,
        selfCollectedCount,
    };
}

function addBreakdownLine(breakdown, id, label, credits) {
    const normalizedCredits = Math.max(0, Math.round(Number(credits) || 0));
    if (!normalizedCredits) {
        return;
    }
    breakdown.push({
        id,
        label,
        credits: normalizedCredits,
    });
}

function resolvePlayerScoreboardEntry(scoreboard = [], playerCollectorId = 'player') {
    const normalizedCollectorId =
        typeof playerCollectorId === 'string' && playerCollectorId.trim()
            ? playerCollectorId.trim()
            : 'player';

    for (let i = 0; i < scoreboard.length; i += 1) {
        const entry = scoreboard[i];
        if (entry?.isSelf === true) {
            return entry;
        }
        const entryCollectorId =
            typeof entry?.collectorId === 'string' ? entry.collectorId.trim() : '';
        if (entryCollectorId && entryCollectorId === normalizedCollectorId) {
            return entry;
        }
    }

    for (let i = 0; i < scoreboard.length; i += 1) {
        const entry = scoreboard[i];
        const entryName = typeof entry?.name === 'string' ? entry.name.trim().toLowerCase() : '';
        if (entryName === 'you' || entryName === 'player') {
            return entry;
        }
    }

    return null;
}

function clampCredits(value) {
    return Math.max(0, Math.min(PLAYER_ECONOMY_MAX_CREDITS, Math.round(Number(value) || 0)));
}

function normalizeUnlockedVehicleIds(value) {
    const unlockedVehicleIds = new Set(DEFAULT_UNLOCKED_VEHICLE_IDS);
    const entries = Array.isArray(value) ? value : [];
    for (let i = 0; i < entries.length; i += 1) {
        const resolvedVehicleId = resolvePlayerVehicleId(entries[i] || DEFAULT_PLAYER_VEHICLE_ID);
        if (resolvedVehicleId) {
            unlockedVehicleIds.add(resolvedVehicleId);
        }
    }
    return [...unlockedVehicleIds];
}

function normalizeUnlockedWheelPresetIds(value) {
    const unlockedWheelPresetIds = new Set(DEFAULT_UNLOCKED_WHEEL_PRESET_IDS);
    const entries = Array.isArray(value) ? value : [];
    for (let i = 0; i < entries.length; i += 1) {
        const resolvedWheelPresetId = resolvePlayerWheelPresetId(
            entries[i] || DEFAULT_PLAYER_WHEEL_PRESET_ID
        );
        if (resolvedWheelPresetId) {
            unlockedWheelPresetIds.add(resolvedWheelPresetId);
        }
    }
    return [...unlockedWheelPresetIds];
}

function resolveDefaultUnlockedVehicleIds() {
    const resolvedVehicleIds = PLAYER_VEHICLE_PRESETS.filter(
        (preset) => preset?.defaultUnlocked !== false
    ).map((preset) => resolvePlayerVehicleId(preset.id));
    if (resolvedVehicleIds.length > 0) {
        return resolvedVehicleIds;
    }
    return [DEFAULT_PLAYER_VEHICLE_ID];
}

function resolveDefaultUnlockedWheelPresetIds() {
    const resolvedWheelPresetIds = PLAYER_WHEEL_PRESETS.filter(
        (preset) => preset?.defaultUnlocked !== false
    ).map((preset) => resolvePlayerWheelPresetId(preset.id));
    if (resolvedWheelPresetIds.length > 0) {
        return resolvedWheelPresetIds;
    }
    return [DEFAULT_PLAYER_WHEEL_PRESET_ID];
}

function getPlayerVehicleEconomyPreset(vehicleId = DEFAULT_PLAYER_VEHICLE_ID) {
    const normalizedVehicleId = resolvePlayerVehicleId(vehicleId || DEFAULT_PLAYER_VEHICLE_ID);
    for (let i = 0; i < PLAYER_VEHICLE_PRESETS.length; i += 1) {
        if (PLAYER_VEHICLE_PRESETS[i].id === normalizedVehicleId) {
            return PLAYER_VEHICLE_PRESETS[i];
        }
    }
    return PLAYER_VEHICLE_PRESETS[0] || null;
}
