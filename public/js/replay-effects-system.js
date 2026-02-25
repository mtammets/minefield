import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const REPLAY_PICKUP_EFFECT_LIFE = 0.54;
const REPLAY_PICKUP_EFFECT_POOL_PREWARM = 6;
const REPLAY_PICKUP_EFFECT_POOL_MAX = 28;

const replayPickupCoreGeometry = new THREE.IcosahedronGeometry(0.42, 1);
const replayPickupRingGeometry = new THREE.RingGeometry(0.5, 0.72, 30);
const replayEventPosition = new THREE.Vector3();
const replayImpactNormal = new THREE.Vector3();

export function createReplayEffectsController({
    scene,
    car,
    spawnCarDebris,
    replayEventPickup,
    replayEventCrash,
    obstacleCrashMaxSpeed,
} = {}) {
    const spawnDebris = typeof spawnCarDebris === 'function' ? spawnCarDebris : () => {};
    const replayEffects = [];
    const replayEffectPool = [];

    prewarmReplayPickupEffects(replayEffectPool, REPLAY_PICKUP_EFFECT_POOL_PREWARM);

    return {
        processReplayEvents(events = []) {
            if (!events || events.length === 0) {
                return;
            }

            for (let i = 0; i < events.length; i += 1) {
                const event = events[i];
                if (!event) {
                    continue;
                }

                if (event.type === replayEventPickup) {
                    replayEventPosition.set(
                        event.payload?.x || 0,
                        event.payload?.y || 1.2,
                        event.payload?.z || 0
                    );
                    spawnReplayPickupEffect(
                        replayEventPosition,
                        event.payload?.wrong ? 0xff556a : event.payload?.colorHex || 0x7cf9ff
                    );
                    continue;
                }

                if (event.type === replayEventCrash) {
                    replayEventPosition.set(
                        event.payload?.x || car.position.x,
                        event.payload?.y || car.position.y,
                        event.payload?.z || car.position.z
                    );
                    const collisionPayload = event.payload?.collision || null;
                    let replayCollision = null;
                    if (collisionPayload) {
                        replayImpactNormal.set(
                            collisionPayload.impactNormalX || 0,
                            0,
                            collisionPayload.impactNormalZ || 0
                        );
                        replayCollision = {
                            obstacleCategory: collisionPayload.obstacleCategory || 'building',
                            impactSpeed: collisionPayload.impactSpeed || obstacleCrashMaxSpeed,
                            impactNormal: replayImpactNormal,
                        };
                    }
                    spawnDebris(replayEventPosition, replayCollision);
                }
            }
        },
        updateReplayEffects(dt) {
            for (let i = replayEffects.length - 1; i >= 0; i -= 1) {
                const effect = replayEffects[i];
                effect.life -= dt;

                const t = THREE.MathUtils.clamp(effect.life / effect.maxLife, 0, 1);
                const eased = 1 - t;
                const baseScale = 1 + eased * 2.6;

                effect.mesh.scale.setScalar(baseScale);
                effect.mesh.position.y += dt * (0.5 + eased * 1.7);
                effect.mesh.rotation.y += dt * 2.4;
                effect.coreMaterial.opacity = 0.18 + t * 0.72;
                effect.ringMaterial.opacity = 0.1 + t * 0.58;
                effect.light.intensity = 0.2 + t * 1.8;
                effect.light.distance = 5 + t * 8;

                if (effect.life <= 0) {
                    recycleReplayPickupEffect(scene, replayEffectPool, effect);
                    const lastIndex = replayEffects.length - 1;
                    if (i !== lastIndex) {
                        replayEffects[i] = replayEffects[lastIndex];
                    }
                    replayEffects.pop();
                }
            }
        },
        clearReplayEffects() {
            for (let i = replayEffects.length - 1; i >= 0; i -= 1) {
                recycleReplayPickupEffect(scene, replayEffectPool, replayEffects[i]);
            }
            replayEffects.length = 0;
        },
    };

    function spawnReplayPickupEffect(position, colorHex) {
        const effect = acquireReplayPickupEffect(replayEffectPool);
        activateReplayPickupEffect(scene, effect, position, colorHex);
        replayEffects.push(effect);
    }
}

function prewarmReplayPickupEffects(effectPool, targetCount = REPLAY_PICKUP_EFFECT_POOL_PREWARM) {
    const normalizedTarget = THREE.MathUtils.clamp(
        Math.floor(Number(targetCount) || REPLAY_PICKUP_EFFECT_POOL_PREWARM),
        0,
        REPLAY_PICKUP_EFFECT_POOL_MAX
    );
    for (let i = effectPool.length; i < normalizedTarget; i += 1) {
        effectPool.push(createReplayPickupEffectBundle());
    }
}

function acquireReplayPickupEffect(effectPool) {
    if (effectPool.length > 0) {
        return effectPool.pop();
    }
    return createReplayPickupEffectBundle();
}

function createReplayPickupEffectBundle() {
    const mesh = new THREE.Group();
    const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0x7cf9ff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const core = new THREE.Mesh(replayPickupCoreGeometry, coreMaterial);
    mesh.add(core);

    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x7cf9ff,
        transparent: true,
        opacity: 0.68,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(replayPickupRingGeometry, ringMaterial);
    ring.rotation.x = -Math.PI * 0.5;
    mesh.add(ring);

    const light = new THREE.PointLight(0x7cf9ff, 1.8, 11, 2.1);
    light.position.set(0, 0.2, 0);
    mesh.add(light);

    return {
        mesh,
        core,
        ring,
        coreMaterial,
        ringMaterial,
        light,
        life: REPLAY_PICKUP_EFFECT_LIFE,
        maxLife: REPLAY_PICKUP_EFFECT_LIFE,
    };
}

function activateReplayPickupEffect(scene, effect, position, colorHex) {
    resetReplayPickupEffectBundle(effect);
    effect.mesh.position.copy(position);
    effect.mesh.position.y += 0.22;
    effect.coreMaterial.color.setHex(colorHex >>> 0);
    effect.ringMaterial.color.setHex(colorHex >>> 0);
    effect.light.color.setHex(colorHex >>> 0);
    scene.add(effect.mesh);
}

function recycleReplayPickupEffect(scene, effectPool, effect) {
    if (!effect) {
        return;
    }
    scene.remove(effect.mesh);
    resetReplayPickupEffectBundle(effect);
    if (effectPool.length < REPLAY_PICKUP_EFFECT_POOL_MAX) {
        effectPool.push(effect);
        return;
    }
    disposeReplayPickupEffectBundle(effect);
}

function resetReplayPickupEffectBundle(effect) {
    if (!effect) {
        return;
    }
    effect.life = REPLAY_PICKUP_EFFECT_LIFE;
    effect.maxLife = REPLAY_PICKUP_EFFECT_LIFE;
    effect.mesh.position.set(0, -1000, 0);
    effect.mesh.rotation.set(0, 0, 0);
    effect.mesh.scale.setScalar(1);
    effect.core.scale.setScalar(1);
    effect.ring.scale.setScalar(1);
    effect.coreMaterial.opacity = 0.9;
    effect.ringMaterial.opacity = 0.68;
    effect.light.intensity = 1.8;
    effect.light.distance = 11;
}

function disposeReplayPickupEffectBundle(effect) {
    if (!effect) {
        return;
    }
    effect.coreMaterial.dispose();
    effect.ringMaterial.dispose();
}
