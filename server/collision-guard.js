function clampFinite(value, min, max, fallback = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
}

function validateCollisionRelay({
    relay,
    sourceState,
    sourceStateAt,
    targetState,
    targetStateAt,
    nowMs = Date.now(),
    maxStateAgeMs = 950,
    maxDistance = 8.8,
    maxImpactBonus = 10,
}) {
    if (!relay || typeof relay !== 'object') {
        return { ok: false, reason: 'invalid-relay' };
    }
    if (!sourceState || !targetState) {
        return { ok: false, reason: 'missing-state' };
    }

    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const sourceAge = now - (Number(sourceStateAt) || 0);
    const targetAge = now - (Number(targetStateAt) || 0);
    if (sourceAge > maxStateAgeMs || targetAge > maxStateAgeMs) {
        return { ok: false, reason: 'state-too-old' };
    }

    const sx = Number(sourceState.x);
    const sz = Number(sourceState.z);
    const tx = Number(targetState.x);
    const tz = Number(targetState.z);
    if (![sx, sz, tx, tz].every(Number.isFinite)) {
        return { ok: false, reason: 'invalid-position-state' };
    }

    const dx = tx - sx;
    const dz = tz - sz;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > maxDistance * maxDistance) {
        return { ok: false, reason: 'distance-too-large' };
    }

    const distance = Math.sqrt(distanceSq);
    const toTargetX = distance > 0.0001 ? dx / distance : relay.normalX;
    const toTargetZ = distance > 0.0001 ? dz / distance : relay.normalZ;
    const alignment = toTargetX * relay.normalX + toTargetZ * relay.normalZ;
    if (alignment < 0.06) {
        return { ok: false, reason: 'normal-misaligned' };
    }

    const sourceVx = clampFinite(sourceState.velocityX, -400, 400, 0);
    const sourceVz = clampFinite(sourceState.velocityZ, -400, 400, 0);
    const targetVx = clampFinite(targetState.velocityX, -400, 400, 0);
    const targetVz = clampFinite(targetState.velocityZ, -400, 400, 0);
    const relativeAlongNormal =
        (sourceVx - targetVx) * relay.normalX + (sourceVz - targetVz) * relay.normalZ;
    const expectedImpactSpeed = Math.max(0, relativeAlongNormal);
    const maxAllowedImpactSpeed = expectedImpactSpeed + Math.max(3, maxImpactBonus);
    const resolvedImpactSpeed = Math.min(relay.impactSpeed, maxAllowedImpactSpeed);
    if (resolvedImpactSpeed <= 0.08) {
        return { ok: false, reason: 'insufficient-impact' };
    }

    const resolvedPenetration = Math.min(relay.penetration, 0.08 + resolvedImpactSpeed * 0.045);
    if (resolvedPenetration <= 0.002) {
        return { ok: false, reason: 'insufficient-penetration' };
    }

    return {
        ok: true,
        relay: {
            targetId: relay.targetId,
            normalX: relay.normalX,
            normalZ: relay.normalZ,
            impactSpeed: resolvedImpactSpeed,
            penetration: resolvedPenetration,
            otherVelocityX: relay.otherVelocityX,
            otherVelocityZ: relay.otherVelocityZ,
            mass: relay.mass,
        },
    };
}

module.exports = {
    validateCollisionRelay,
    clampFinite,
};
