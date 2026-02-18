import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

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
                    const position = new THREE.Vector3(
                        event.payload?.x || 0,
                        event.payload?.y || 1.2,
                        event.payload?.z || 0
                    );
                    spawnReplayPickupEffect(
                        position,
                        event.payload?.wrong ? 0xff556a : event.payload?.colorHex || 0x7cf9ff
                    );
                    continue;
                }

                if (event.type === replayEventCrash) {
                    const hitPosition = new THREE.Vector3(
                        event.payload?.x || car.position.x,
                        event.payload?.y || car.position.y,
                        event.payload?.z || car.position.z
                    );
                    const collisionPayload = event.payload?.collision || null;
                    const replayCollision = collisionPayload
                        ? {
                              obstacleCategory: collisionPayload.obstacleCategory || 'building',
                              impactSpeed: collisionPayload.impactSpeed || obstacleCrashMaxSpeed,
                              impactNormal: new THREE.Vector3(
                                  collisionPayload.impactNormalX || 0,
                                  0,
                                  collisionPayload.impactNormalZ || 0
                              ),
                          }
                        : null;
                    spawnDebris(hitPosition, replayCollision);
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
                    scene.remove(effect.mesh);
                    effect.mesh.traverse((node) => {
                        if (node.isMesh) {
                            node.geometry?.dispose?.();
                            node.material?.dispose?.();
                        }
                    });
                    replayEffects.splice(i, 1);
                }
            }
        },
        clearReplayEffects() {
            for (let i = replayEffects.length - 1; i >= 0; i -= 1) {
                const effect = replayEffects[i];
                scene.remove(effect.mesh);
                effect.mesh.traverse((node) => {
                    if (node.isMesh) {
                        node.geometry?.dispose?.();
                        node.material?.dispose?.();
                    }
                });
            }
            replayEffects.length = 0;
        },
    };

    function spawnReplayPickupEffect(position, colorHex) {
        const burstGroup = new THREE.Group();
        burstGroup.position.copy(position);
        burstGroup.position.y += 0.22;

        const coreMaterial = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), coreMaterial);
        burstGroup.add(core);

        const ringMaterial = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.68,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 30), ringMaterial);
        ring.rotation.x = -Math.PI * 0.5;
        burstGroup.add(ring);

        const light = new THREE.PointLight(colorHex, 1.8, 11, 2.1);
        light.position.set(0, 0.2, 0);
        burstGroup.add(light);

        scene.add(burstGroup);
        replayEffects.push({
            mesh: burstGroup,
            coreMaterial,
            ringMaterial,
            light,
            life: 0.54,
            maxLife: 0.54,
        });
    }
}
