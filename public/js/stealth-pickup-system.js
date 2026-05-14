import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { centralParkingLot } from './environment/layout.js';

const PICKUP_ID = 'central-plaza-stealth';
const PICKUP_RADIUS = 4.2;
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS;
const PICKUP_HEIGHT_ABOVE_GROUND = 1.18;
const PICKUP_RESPAWN_FALLBACK_SEC = 12;
const COLLECTION_RETRY_COOLDOWN_SEC = 0.55;
const DEFAULT_PICKUP_X = centralParkingLot.centerX;
const DEFAULT_PICKUP_Z = centralParkingLot.maxZ - 7.5;
const LOCAL_STEALTH_FALLBACK_DURATION_MS = 9000;
const LOCAL_STEALTH_WARNING_RATIO = 0.24;
const STEALTH_AURA_SOURCE_GROUP_NAMES = Object.freeze([
    'body_shell_group',
    'roof_assembly_group',
    'nameplate_assembly_group',
    'front_axle_group',
    'rear_axle_group',
]);
const STEALTH_AURA_SKIP_GROUP_NAMES = new Set([
    'body_skin_overlay_group',
    'wireless_charge_marker_group',
    'wheel_well_light_group',
]);

const glowTexture = createGlowTexture();

export function createStealthPickupSystem({
    scene,
    car,
    getGroundHeightAt = () => 0,
    reportPickupCollected = () => false,
    onCollected = () => {},
    objectiveUi = null,
} = {}) {
    if (!scene || !car) {
        return createNoopStealthPickupSystem();
    }

    const root = new THREE.Group();
    root.name = 'centralPlazaStealthPickup';
    scene.add(root);
    const aura = createStealthAura(car, glowTexture);
    car.add(aura.root);

    const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.42, 4.8, 18, 1, true),
        new THREE.MeshBasicMaterial({
            color: 0x73f7ff,
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
        })
    );
    beam.position.y = 2.2;
    root.add(beam);

    const ringA = new THREE.Mesh(
        new THREE.TorusGeometry(0.96, 0.055, 16, 56),
        new THREE.MeshBasicMaterial({
            color: 0x8effff,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        })
    );
    ringA.rotation.x = Math.PI * 0.5;
    ringA.position.y = 0.94;
    root.add(ringA);

    const ringB = ringA.clone();
    ringB.rotation.x = Math.PI * 0.28;
    ringB.rotation.y = Math.PI * 0.15;
    ringB.material = ringA.material.clone();
    ringB.material.opacity = 0.42;
    root.add(ringB);

    const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.34, 1),
        new THREE.MeshStandardMaterial({
            color: 0xd9ffff,
            emissive: 0x74efff,
            emissiveIntensity: 1.2,
            metalness: 0.18,
            roughness: 0.24,
        })
    );
    core.position.y = 1.06;
    root.add(core);

    const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.64, 1),
        new THREE.MeshBasicMaterial({
            color: 0x76f5ff,
            transparent: true,
            opacity: 0.16,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            wireframe: true,
            toneMapped: false,
        })
    );
    shell.position.y = 1.06;
    root.add(shell);

    const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: glowTexture,
            color: 0x8fffff,
            transparent: true,
            opacity: 0.82,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        })
    );
    halo.position.y = 1.08;
    halo.scale.setScalar(2.4);
    root.add(halo);

    const floorHalo = new THREE.Mesh(
        new THREE.RingGeometry(1.2, 2.22, 42),
        new THREE.MeshBasicMaterial({
            color: 0x6ff3ff,
            map: glowTexture,
            alphaMap: glowTexture,
            transparent: true,
            opacity: 0.44,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        })
    );
    floorHalo.rotation.x = -Math.PI * 0.5;
    floorHalo.position.y = 0.08;
    root.add(floorHalo);

    const state = {
        available: false,
        pending: false,
        respawnTimer: 0,
        retryCooldownSec: 0,
        hoverPhase: Math.random() * Math.PI * 2,
        anchor: new THREE.Vector3(DEFAULT_PICKUP_X, 0, DEFAULT_PICKUP_Z),
        localStealthExpiresAtMs: 0,
        localStealthDurationMs: 0,
        localStealthPhase: Math.random() * Math.PI * 2,
    };

    updateAnchor(DEFAULT_PICKUP_X, DEFAULT_PICKUP_Z);
    root.visible = false;
    syncLocalStealthPresentation(0);

    return {
        update,
        applyPickupStateSnapshot,
        setLocalStealthState,
        clear,
        isLocalStealthActive() {
            return isLocalStealthActive();
        },
    };

    function update(
        dt = 1 / 60,
        { enabled = null, onlineActive = false, carDestroyed = false, gameplayBlocked = false } = {}
    ) {
        const deltaTime = Math.min(Math.max(Number(dt) || 0, 0), 0.1);
        const pickupEnabled = typeof enabled === 'boolean' ? enabled : Boolean(onlineActive);
        updateLocalStealthTimer();
        updateRespawnTimer(deltaTime);
        state.retryCooldownSec = Math.max(0, state.retryCooldownSec - deltaTime);
        syncLocalStealthPresentation(deltaTime);

        const canRender = Boolean(pickupEnabled && state.available);
        root.visible = canRender;
        if (!canRender) {
            return;
        }

        state.hoverPhase += deltaTime;
        const pulse = 0.5 + 0.5 * Math.sin(state.hoverPhase * 2.2);
        const pulseFast = 0.5 + 0.5 * Math.sin(state.hoverPhase * 4.4 + 0.65);
        root.position.set(
            state.anchor.x,
            state.anchor.y + Math.sin(state.hoverPhase * 1.6) * 0.08,
            state.anchor.z
        );
        core.rotation.y += deltaTime * 2.6;
        shell.rotation.y -= deltaTime * 1.4;
        shell.rotation.x += deltaTime * 0.9;
        ringA.rotation.z += deltaTime * 0.72;
        ringB.rotation.y -= deltaTime * 0.95;
        beam.material.opacity = 0.14 + pulse * 0.2;
        ringA.material.opacity = 0.52 + pulse * 0.24;
        ringB.material.opacity = 0.24 + pulseFast * 0.18;
        shell.material.opacity = 0.12 + pulse * 0.1;
        halo.material.opacity = 0.56 + pulse * 0.22;
        halo.scale.setScalar(2.2 + pulseFast * 0.36);
        floorHalo.material.opacity = 0.22 + pulse * 0.18;

        if (carDestroyed || gameplayBlocked || state.pending || state.retryCooldownSec > 0) {
            return;
        }
        if (isLocalStealthActive()) {
            return;
        }

        const deltaX = car.position.x - state.anchor.x;
        const deltaZ = car.position.z - state.anchor.z;
        const distanceSq = deltaX * deltaX + deltaZ * deltaZ;
        if (distanceSq > PICKUP_RADIUS_SQ) {
            return;
        }

        collectPickup();
    }

    function applyPickupStateSnapshot(snapshot = null) {
        if (!snapshot || typeof snapshot !== 'object') {
            state.available = false;
            state.pending = false;
            state.respawnTimer = 0;
            state.retryCooldownSec = 0;
            root.visible = false;
            return;
        }

        const x = Number(snapshot.x);
        const z = Number(snapshot.z);
        if (Number.isFinite(x) && Number.isFinite(z)) {
            updateAnchor(x, z);
        }

        const nowMs = Date.now();
        const available = Boolean(snapshot.available);
        const respawnAt = Math.max(0, Math.round(Number(snapshot.respawnAt) || 0));
        state.available = available;
        state.pending = false;
        state.retryCooldownSec = 0;
        state.respawnTimer = available ? 0 : Math.max(0, (respawnAt - nowMs) / 1000);
        if (!available && state.respawnTimer <= 0) {
            state.respawnTimer = PICKUP_RESPAWN_FALLBACK_SEC;
        }
    }

    function setLocalStealthState(nextState = null, { silent = false } = {}) {
        const nowMs = Date.now();
        const nextExpiresAtMs = Math.max(0, Math.round(Number(nextState?.expiresAt) || 0));
        const nextDurationMs = Math.max(0, Math.round(Number(nextState?.durationMs) || 0));
        const nextActive = Boolean(nextState?.active) && nextExpiresAtMs > nowMs;
        const previousActive = state.localStealthExpiresAtMs > nowMs;
        const previousExpiresAtMs = state.localStealthExpiresAtMs;

        if (nextActive) {
            const expirationChanged = nextExpiresAtMs !== previousExpiresAtMs;
            if (!previousActive || expirationChanged || state.localStealthDurationMs <= 0) {
                state.localStealthDurationMs =
                    nextDurationMs > 0
                        ? nextDurationMs
                        : previousActive && expirationChanged && state.localStealthDurationMs > 0
                          ? Math.max(state.localStealthDurationMs, nextExpiresAtMs - nowMs)
                          : Math.max(1, nextExpiresAtMs - nowMs);
            }
            state.localStealthExpiresAtMs = nextExpiresAtMs;
        } else {
            state.localStealthExpiresAtMs = 0;
            state.localStealthDurationMs = 0;
        }
        if (!nextActive && !previousActive) {
            syncLocalStealthPresentation(0);
            return;
        }
        syncLocalStealthPresentation(0);
    }

    function clear({ silent = true } = {}) {
        state.available = false;
        state.pending = false;
        state.respawnTimer = 0;
        state.retryCooldownSec = 0;
        root.visible = false;
        setLocalStealthState({ active: false, expiresAt: 0 }, { silent });
    }

    function updateAnchor(x = DEFAULT_PICKUP_X, z = DEFAULT_PICKUP_Z) {
        const resolvedX = Number.isFinite(Number(x)) ? Number(x) : DEFAULT_PICKUP_X;
        const resolvedZ = Number.isFinite(Number(z)) ? Number(z) : DEFAULT_PICKUP_Z;
        state.anchor.x = resolvedX;
        state.anchor.z = resolvedZ;
        state.anchor.y =
            (Number(getGroundHeightAt(resolvedX, resolvedZ)) || 0) + PICKUP_HEIGHT_ABOVE_GROUND;
        root.position.copy(state.anchor);
    }

    function updateRespawnTimer(dt) {
        if (state.respawnTimer <= 0) {
            return;
        }
        state.respawnTimer = Math.max(0, state.respawnTimer - dt);
        if (state.respawnTimer <= 0) {
            state.available = true;
        }
    }

    function updateLocalStealthTimer() {
        const expiresAtMs = Math.max(0, state.localStealthExpiresAtMs);
        if (expiresAtMs <= 0) {
            return;
        }
        if (Date.now() < expiresAtMs) {
            return;
        }
        setLocalStealthState({ active: false, expiresAt: 0 }, { silent: false });
    }

    function isLocalStealthActive() {
        return state.localStealthExpiresAtMs > Date.now();
    }

    function getLocalStealthRemainingRatio(nowMs = Date.now()) {
        if (!isLocalStealthActive()) {
            return 0;
        }
        const remainingMs = Math.max(0, state.localStealthExpiresAtMs - nowMs);
        const durationMs = Math.max(
            1,
            state.localStealthDurationMs || LOCAL_STEALTH_FALLBACK_DURATION_MS
        );
        return THREE.MathUtils.clamp(remainingMs / durationMs, 0, 1);
    }

    function syncLocalStealthPresentation(dt = 0) {
        const nowMs = Date.now();
        const active = state.localStealthExpiresAtMs > nowMs;
        const remainingRatio = active ? getLocalStealthRemainingRatio(nowMs) : 0;
        objectiveUi?.setStealthState?.({
            active,
            progress: remainingRatio,
        });
        if (!active) {
            aura.update(0, { active: false });
            return;
        }

        const deltaTime = Math.min(Math.max(Number(dt) || 0, 0), 0.1);
        state.localStealthPhase += deltaTime;
        const urgency = 1 - remainingRatio;
        const warningPulse =
            remainingRatio <= LOCAL_STEALTH_WARNING_RATIO
                ? 0.5 + 0.5 * Math.sin(state.localStealthPhase * 12.4)
                : 0;
        const shimmerPulse = 0.5 + 0.5 * Math.sin(state.localStealthPhase * 4.8);
        aura.update(deltaTime, {
            active,
            remainingRatio,
            urgency,
            warningPulse,
            shimmerPulse,
        });
    }

    function collectPickup() {
        state.available = false;
        state.pending = true;
        root.visible = false;
        const accepted = reportPickupCollected(
            {
                pickupId: PICKUP_ID,
            },
            (response) => {
                handlePickupCollectedResponse(response);
            }
        );
        if (accepted !== false) {
            return;
        }
        state.pending = false;
        state.available = true;
        root.visible = true;
        state.retryCooldownSec = COLLECTION_RETRY_COOLDOWN_SEC;
    }

    function handlePickupCollectedResponse(response = null) {
        state.pending = false;
        if (response?.pickup) {
            applyPickupStateSnapshot(response.pickup);
        } else {
            state.available = true;
        }

        const stealthExpiresAt = Math.max(0, Math.round(Number(response?.stealthExpiresAt) || 0));
        const stealthDurationMs = Math.max(0, Math.round(Number(response?.stealthDurationMs) || 0));
        if (stealthExpiresAt > 0) {
            setLocalStealthState(
                {
                    active: true,
                    expiresAt: stealthExpiresAt,
                    durationMs: stealthDurationMs,
                },
                { silent: false }
            );
        }

        if (response?.ok) {
            onCollected?.(response);
            return;
        }

        state.retryCooldownSec = COLLECTION_RETRY_COOLDOWN_SEC;
        if (!response?.pickup) {
            state.available = true;
            state.respawnTimer = 0;
        }
    }
}

function createNoopStealthPickupSystem() {
    return {
        update() {},
        applyPickupStateSnapshot() {},
        setLocalStealthState() {},
        clear() {},
        isLocalStealthActive() {
            return false;
        },
    };
}

function createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(96, 96, 0, 96, 96, 96);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.18, 'rgba(173,253,255,0.95)');
    gradient.addColorStop(0.4, 'rgba(80,228,255,0.46)');
    gradient.addColorStop(1, 'rgba(80,228,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

function createStealthAura(car, glowMap) {
    const root = new THREE.Group();
    root.name = 'playerStealthAura';
    root.visible = false;
    const shellMaterial = createStealthShellMaterial();
    const groundMaterial = createStealthGroundMaterial();
    const shellInstances = [];

    const groundPhase = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 5.8, 1, 1), groundMaterial);
    groundPhase.rotation.x = -Math.PI * 0.5;
    groundPhase.position.y = -0.22;
    groundPhase.scale.set(0.9, 1, 1.44);
    root.add(groundPhase);

    const underGlow = new THREE.Mesh(
        new THREE.CircleGeometry(1.42, 48),
        new THREE.MeshBasicMaterial({
            color: 0x79efff,
            map: glowMap,
            alphaMap: glowMap,
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        })
    );
    underGlow.rotation.x = -Math.PI * 0.5;
    underGlow.position.y = -0.215;
    underGlow.scale.set(1.05, 1, 1.72);
    root.add(underGlow);

    return {
        root,
        update,
    };

    function update(
        dt = 0,
        { active = false, remainingRatio = 0, urgency = 0, warningPulse = 0, shimmerPulse = 0 } = {}
    ) {
        root.visible = active;
        setShellVisibility(active);
        if (!active) {
            return;
        }

        ensureShells();
        const deltaTime = Math.min(Math.max(Number(dt) || 0, 0), 0.1);
        shellMaterial.uniforms.uTime.value += deltaTime;
        shellMaterial.uniforms.uIntensity.value = 0.42 + remainingRatio * 0.38;
        shellMaterial.uniforms.uUrgency.value = urgency;
        shellMaterial.uniforms.uPulse.value = 0.34 + warningPulse * 0.66;
        shellMaterial.uniforms.uShimmer.value = 0.28 + shimmerPulse * 0.72;

        groundMaterial.uniforms.uTime.value += deltaTime;
        groundMaterial.uniforms.uIntensity.value = 0.2 + remainingRatio * 0.44;
        groundMaterial.uniforms.uUrgency.value = urgency;
        groundMaterial.uniforms.uPulse.value = 0.26 + warningPulse * 0.74;
        groundMaterial.uniforms.uShimmer.value = 0.34 + shimmerPulse * 0.66;

        underGlow.material.opacity = 0.04 + remainingRatio * 0.08 + warningPulse * 0.08;
        underGlow.scale.set(
            0.96 + remainingRatio * 0.12,
            1,
            1.56 + remainingRatio * 0.22 + warningPulse * 0.06
        );
    }

    function ensureShells() {
        const needsRebuild =
            shellInstances.length === 0 ||
            shellInstances.some(
                (entry) =>
                    !entry?.source?.parent || !entry?.mesh || entry.mesh.parent !== entry.source
            );
        if (!needsRebuild) {
            return;
        }
        rebuildShells();
    }

    function rebuildShells() {
        for (let i = 0; i < shellInstances.length; i += 1) {
            const mesh = shellInstances[i]?.mesh;
            mesh?.parent?.remove?.(mesh);
        }
        shellInstances.length = 0;

        for (
            let rootIndex = 0;
            rootIndex < STEALTH_AURA_SOURCE_GROUP_NAMES.length;
            rootIndex += 1
        ) {
            const sourceRoot = car.getObjectByName(STEALTH_AURA_SOURCE_GROUP_NAMES[rootIndex]);
            if (!sourceRoot) {
                continue;
            }
            sourceRoot.traverse((node) => {
                if (!shouldCreateStealthShellForNode(node)) {
                    return;
                }
                const shellMesh = new THREE.Mesh(node.geometry, shellMaterial);
                shellMesh.name = 'stealth_shell_proxy';
                shellMesh.userData.isStealthAuraPart = true;
                shellMesh.position.set(0, 0, 0);
                shellMesh.rotation.set(0, 0, 0);
                shellMesh.scale.setScalar(1);
                shellMesh.renderOrder = 18;
                shellMesh.frustumCulled = node.frustumCulled;
                shellMesh.visible = root.visible;
                node.add(shellMesh);
                shellInstances.push({
                    source: node,
                    mesh: shellMesh,
                });
            });
        }
    }

    function setShellVisibility(visible) {
        for (let i = 0; i < shellInstances.length; i += 1) {
            const shellMesh = shellInstances[i]?.mesh;
            if (shellMesh) {
                shellMesh.visible = visible;
            }
        }
    }
}

function shouldCreateStealthShellForNode(node) {
    if (!node?.isMesh || !node.geometry || node.userData?.isStealthAuraPart) {
        return false;
    }
    let ancestor = node;
    while (ancestor) {
        if (STEALTH_AURA_SKIP_GROUP_NAMES.has(ancestor.name)) {
            return false;
        }
        ancestor = ancestor.parent;
    }
    if (node.geometry.type === 'PlaneGeometry') {
        return false;
    }
    if (!node.geometry.boundingSphere) {
        node.geometry.computeBoundingSphere();
    }
    return (Number(node.geometry.boundingSphere?.radius) || 0) >= 0.08;
}

function createStealthShellMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0.6 },
            uUrgency: { value: 0 },
            uPulse: { value: 0.5 },
            uShimmer: { value: 0.5 },
        },
        vertexShader: `
            uniform float uTime;
            varying vec3 vViewNormal;
            varying vec3 vViewPosition;
            varying vec3 vLocalPosition;

            void main() {
                float wobble =
                    sin(position.y * 9.0 + uTime * 4.8) * 0.004 +
                    sin(position.z * 6.0 - uTime * 3.6) * 0.003;
                vec3 displaced = position + normal * (0.012 + wobble);
                vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
                vViewPosition = -mvPosition.xyz;
                vViewNormal = normalize(normalMatrix * normal);
                vLocalPosition = displaced;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform float uIntensity;
            uniform float uUrgency;
            uniform float uPulse;
            uniform float uShimmer;
            varying vec3 vViewNormal;
            varying vec3 vViewPosition;
            varying vec3 vLocalPosition;

            float hash(vec3 p) {
                return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
            }

            void main() {
                vec3 normal = normalize(vViewNormal);
                vec3 viewDir = normalize(vViewPosition);
                float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 2.8);
                float scanlines = 0.5 + 0.5 * sin(vLocalPosition.y * 16.0 - uTime * 6.8);
                float longitudinal = 0.5 + 0.5 * sin(vLocalPosition.z * 8.0 + uTime * 4.2);
                float breakup = hash(floor(vLocalPosition * 8.0 + uTime * 2.4));
                float shimmer = mix(scanlines, longitudinal, 0.38) * 0.72 + breakup * 0.28;
                float edge = smoothstep(0.18, 1.0, fresnel);
                float alpha = edge * (0.08 + shimmer * 0.3) * uIntensity;
                alpha += smoothstep(0.52, 1.0, fresnel) * uUrgency * uPulse * 0.18;
                alpha = clamp(alpha, 0.0, 0.52);

                vec3 baseColor = mix(
                    vec3(0.20, 0.56, 0.70),
                    vec3(0.82, 0.98, 1.00),
                    shimmer * 0.7 + fresnel * 0.3
                );
                baseColor += vec3(0.08, 0.22, 0.28) * breakup * 0.22;
                baseColor += vec3(0.10, 0.28, 0.35) * uShimmer * 0.16;
                baseColor += vec3(0.18, 0.52, 0.64) * uUrgency * uPulse * 0.2;

                gl_FragColor = vec4(baseColor, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
    });
}

function createStealthGroundMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0.5 },
            uUrgency: { value: 0 },
            uPulse: { value: 0.5 },
            uShimmer: { value: 0.5 },
        },
        vertexShader: `
            varying vec2 vUv;

            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform float uIntensity;
            uniform float uUrgency;
            uniform float uPulse;
            uniform float uShimmer;
            varying vec2 vUv;

            void main() {
                vec2 p = vUv * 2.0 - 1.0;
                p.x *= 0.82;
                p.y *= 1.24;
                float radius = length(p);
                float bodyField = smoothstep(1.0, 0.16, radius);
                float outerRing = smoothstep(0.16, 0.0, abs(radius - 0.82));
                float innerRing = smoothstep(0.14, 0.0, abs(radius - 0.46));
                float scan = 0.5 + 0.5 * sin(p.y * 18.0 - uTime * 5.4 + p.x * 5.2);
                float shards = 0.5 + 0.5 * sin(p.x * 13.0 + uTime * 4.1);
                float ripple = outerRing * (0.26 + scan * 0.36) + innerRing * (0.12 + shards * 0.18);
                float alpha = bodyField * 0.025 + ripple * uIntensity;
                alpha += outerRing * uUrgency * uPulse * 0.12;
                alpha = clamp(alpha, 0.0, 0.36);

                vec3 color = mix(
                    vec3(0.09, 0.32, 0.40),
                    vec3(0.60, 0.94, 1.00),
                    scan * 0.62 + shards * 0.24 + uShimmer * 0.14
                );
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
    });
}
