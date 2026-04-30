import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import {
    SKID_MARK_REAR_WHEEL_OFFSET_X,
    SKID_MARK_REAR_WHEEL_OFFSET_Z,
    SKID_MARK_MAX_SEGMENTS,
    SKID_MARK_BASE_WIDTH,
    SKID_MARK_MIN_SEGMENT_LENGTH,
    SKID_MARK_MAX_SEGMENT_LENGTH,
    SKID_MARK_SURFACE_BASE_HEIGHT,
    SKID_MARK_SURFACE_OFFSET,
    SKID_MARK_BASE_OPACITY,
    SKID_MARK_SMOKE_BLEND_STRENGTH,
    DRIFT_SMOKE_MAX_PARTICLES,
    DRIFT_SMOKE_SPAWN_RATE,
    DRIFT_SMOKE_LIFE_MIN,
    DRIFT_SMOKE_LIFE_MAX,
} from './constants.js';
import { isInsideLorienVelmoreGalleryRoomWorld } from './environment/lorien-gallery.js';

const DEFAULT_SKID_QUALITY_PROFILE = Object.freeze({
    maxSmokeParticles: DRIFT_SMOKE_MAX_PARTICLES,
    smokeSpawnRateMultiplier: 1,
    maxEmissionPerFrame: 12,
});
const SKID_SMOKE_WARMUP_FRACTION = 0.6;

export function createSkidMarkController(scene, options = {}) {
    const sampleGroundHeight =
        typeof options.sampleGroundHeight === 'function' ? options.sampleGroundHeight : () => 0;
    const keyState = options.keys || {};
    if (!scene) {
        return {
            update() {},
            reset() {},
            setQualityProfile() {
                return false;
            },
            prewarmParticles() {
                return 0;
            },
            warmupGraphics() {
                return false;
            },
        };
    }

    const layer = new THREE.Group();
    layer.name = 'skid_mark_layer';
    scene.add(layer);

    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        alphaMap: createSkidMarkAlphaTexture(),
        transparent: true,
        opacity: SKID_MARK_BASE_OPACITY,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexColors: true,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        toneMapped: false,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, SKID_MARK_MAX_SEGMENTS);
    mesh.name = 'skid_mark_instances';
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    layer.add(mesh);
    const smokeTexture = createDriftSmokeTexture();

    const state = {
        nextIndex: 0,
        activeCount: 0,
        hasPreviousWheelSample: false,
        smokeSpawnCarry: 0,
        qualityProfile: { ...DEFAULT_SKID_QUALITY_PROFILE },
        previousLeftWheel: new THREE.Vector3(),
        previousRightWheel: new THREE.Vector3(),
    };
    const smokeParticles = [];
    const smokeParticlePool = [];
    const localRearLeft = new THREE.Vector3(
        -SKID_MARK_REAR_WHEEL_OFFSET_X,
        0,
        SKID_MARK_REAR_WHEEL_OFFSET_Z
    );
    const localRearRight = new THREE.Vector3(
        SKID_MARK_REAR_WHEEL_OFFSET_X,
        0,
        SKID_MARK_REAR_WHEEL_OFFSET_Z
    );
    const worldRearLeft = new THREE.Vector3();
    const worldRearRight = new THREE.Vector3();
    const segmentStart = new THREE.Vector3();
    const segmentEnd = new THREE.Vector3();
    const segmentMidpoint = new THREE.Vector3();
    const segmentDirection = new THREE.Vector3();
    const wheelDelta = new THREE.Vector3();
    const instanceColor = new THREE.Color();
    const instanceDummy = new THREE.Object3D();
    const smokeSpawnPosition = new THREE.Vector3();

    return {
        update(
            deltaTime = 1 / 60,
            { enabled = true, vehicle = null, vehicleState = null, inputState = null } = {}
        ) {
            const dt = Math.min(Math.max(deltaTime || 0, 0), 0.05);
            updateSmokeParticles(dt);
            if (!enabled || !vehicle || !vehicleState) {
                resetWheelSamples();
                return;
            }

            const speedAbs = Math.abs(vehicleState.speed || 0);
            const steerAbs = Math.abs(vehicleState.steerInput || 0);
            const throttle = THREE.MathUtils.clamp(vehicleState.throttle || 0, 0, 1);
            const brake = THREE.MathUtils.clamp(vehicleState.brake || 0, 0, 1);
            const burnout = THREE.MathUtils.clamp(vehicleState.burnout || 0, 0, 1);
            const yawRateAbs = Math.abs(vehicleState.yawRate || 0);
            const lateralAbs = Math.abs(getLateralSpeed(vehicleState, vehicle.rotation.y));

            const controls = inputState && typeof inputState === 'object' ? inputState : keyState;
            const handbrakePressed = Boolean(controls?.handbrake);
            const forwardPressed = Boolean(controls?.forward);
            const steeringPressed = Boolean(controls?.left) || Boolean(controls?.right);
            const burnoutDrivenByState = burnout > 0.2;
            const burnoutSmokeActive =
                (handbrakePressed && (forwardPressed || throttle > 0.14)) ||
                (burnoutDrivenByState && throttle > 0.08);
            if (!burnoutSmokeActive) {
                resetWheelSamples();
                return;
            }
            const steeringActive =
                (steeringPressed && steerAbs > 0.14) ||
                (steerAbs > 0.2 && Math.abs(yawRateAbs) > 0.6);
            const handbrakeDrift = handbrakePressed && steeringActive && speedAbs >= 2.1;
            const burnoutSmokeSignal = THREE.MathUtils.clamp(
                throttle * 0.44 +
                    brake * 0.22 +
                    burnout * 0.42 +
                    THREE.MathUtils.clamp(1 - speedAbs / 16, 0, 1) * 0.24 +
                    THREE.MathUtils.clamp((yawRateAbs - 0.2) / 3.5, 0, 1) * 0.18,
                0,
                1.9
            );
            let smokeIntensity = THREE.MathUtils.clamp(0.32 + burnoutSmokeSignal * 0.52, 0, 1);
            const driftSignal = THREE.MathUtils.clamp(
                (lateralAbs - 1.2) / 5.6 +
                    Math.max(0, yawRateAbs - 0.3) * 0.18 +
                    Math.max(0, steerAbs - 0.08) * 0.6 +
                    brake * 0.28 +
                    burnout * 0.4 +
                    throttle * 0.16,
                0,
                1.8
            );
            const driftIntensity = handbrakeDrift
                ? THREE.MathUtils.clamp(0.56 + driftSignal * 0.38, 0, 1)
                : 0;
            smokeIntensity = Math.max(smokeIntensity, driftIntensity);
            const burnoutMarkIntensity = THREE.MathUtils.clamp(
                0.24 +
                    burnoutSmokeSignal * 0.46 +
                    THREE.MathUtils.clamp(speedAbs / 14, 0, 1) * 0.22,
                0,
                1
            );
            const markIntensity = handbrakeDrift
                ? Math.max(driftIntensity, burnoutMarkIntensity * 0.88)
                : burnoutMarkIntensity * 0.82;

            vehicle.updateMatrixWorld(true);
            worldRearLeft.copy(localRearLeft);
            worldRearRight.copy(localRearRight);
            vehicle.localToWorld(worldRearLeft);
            vehicle.localToWorld(worldRearRight);
            worldRearLeft.y = sampleSurfaceY(worldRearLeft.x, worldRearLeft.z);
            worldRearRight.y = sampleSurfaceY(worldRearRight.x, worldRearRight.z);

            if (
                isInsideLorienVelmoreGalleryRoomWorld(
                    worldRearLeft.x,
                    worldRearLeft.y,
                    worldRearLeft.z,
                    null,
                    0.18
                ) ||
                isInsideLorienVelmoreGalleryRoomWorld(
                    worldRearRight.x,
                    worldRearRight.y,
                    worldRearRight.z,
                    null,
                    0.18
                )
            ) {
                resetWheelSamples();
                return;
            }

            spawnDriftSmoke(
                worldRearLeft,
                worldRearRight,
                smokeIntensity,
                speedAbs,
                vehicleState,
                dt
            );

            if (markIntensity <= 0.08 || speedAbs < 0.45) {
                resetWheelSamples();
                return;
            }

            if (!state.hasPreviousWheelSample) {
                state.previousLeftWheel.copy(worldRearLeft);
                state.previousRightWheel.copy(worldRearRight);
                state.hasPreviousWheelSample = true;
                return;
            }

            const smokeDensity = THREE.MathUtils.clamp(
                smokeParticles.length / DRIFT_SMOKE_MAX_PARTICLES,
                0,
                1
            );
            const wroteLeft = addWheelTrail(
                state.previousLeftWheel,
                worldRearLeft,
                markIntensity,
                smokeDensity
            );
            const wroteRight = addWheelTrail(
                state.previousRightWheel,
                worldRearRight,
                markIntensity,
                smokeDensity
            );
            if (wroteLeft || wroteRight) {
                mesh.instanceMatrix.needsUpdate = true;
                if (mesh.instanceColor) {
                    mesh.instanceColor.needsUpdate = true;
                }
            }

            state.previousLeftWheel.copy(worldRearLeft);
            state.previousRightWheel.copy(worldRearRight);
        },
        reset() {
            resetWheelSamples();
            state.nextIndex = 0;
            state.activeCount = 0;
            state.smokeSpawnCarry = 0;
            mesh.count = 0;
            clearSmokeParticles();
        },
        setQualityProfile(profile = {}) {
            const nextProfile = normalizeSkidQualityProfile(profile, state.qualityProfile);
            state.qualityProfile = nextProfile;
            const activeLimit = Math.max(1, state.qualityProfile.maxSmokeParticles);
            while (smokeParticles.length > activeLimit) {
                removeSmokeParticle(0);
            }
            return true;
        },
        prewarmParticles(targetCount = 0) {
            const requested = Math.floor(Number(targetCount) || 0);
            const boundedTarget = clamp(
                requested > 0 ? requested : Math.round(state.qualityProfile.maxSmokeParticles),
                8,
                DRIFT_SMOKE_MAX_PARTICLES
            );
            while (smokeParticlePool.length < boundedTarget) {
                smokeParticlePool.push(createSmokeParticle());
            }
            return smokeParticlePool.length;
        },
        warmupGraphics(renderer, camera = null) {
            if (!renderer || typeof renderer.compile !== 'function') {
                return false;
            }

            const warmupTarget = Math.round(
                state.qualityProfile.maxSmokeParticles * SKID_SMOKE_WARMUP_FRACTION
            );
            this.prewarmParticles(warmupTarget);

            const probe = acquireSmokeParticle();
            probe.mesh.position.set(0, sampleSurfaceY(0, 0) + 0.18, -2.4);
            probe.mesh.scale.setScalar(0.78);
            probe.mesh.material.opacity = 0.44;
            layer.add(probe.mesh);

            const compileCamera = camera?.isCamera
                ? camera
                : new THREE.PerspectiveCamera(55, 1, 0.1, 120);
            if (!camera?.isCamera) {
                compileCamera.position.set(4.6, 2.4, 6.2);
                compileCamera.lookAt(0, sampleSurfaceY(0, 0) + 0.12, 0);
                compileCamera.updateProjectionMatrix();
            }

            let warmedUp = false;
            try {
                scene.updateMatrixWorld(true);
                compileCamera.updateMatrixWorld(true);
                renderer.compile(scene, compileCamera);
                warmedUp = true;
            } catch {
                warmedUp = false;
            }

            if (probe.mesh?.parent) {
                probe.mesh.parent.remove(probe.mesh);
            }
            recycleSmokeParticle(probe);
            return warmedUp;
        },
    };

    function resetWheelSamples() {
        state.hasPreviousWheelSample = false;
    }

    function sampleSurfaceY(x, z) {
        const height = sampleGroundHeight(x, z);
        const resolvedHeight = Number.isFinite(height) ? height : 0;
        return Math.max(resolvedHeight, SKID_MARK_SURFACE_BASE_HEIGHT) + SKID_MARK_SURFACE_OFFSET;
    }

    function clearSmokeParticles() {
        for (let i = smokeParticles.length - 1; i >= 0; i -= 1) {
            const particle = smokeParticles[i];
            if (particle?.mesh?.parent) {
                particle.mesh.parent.remove(particle.mesh);
            }
            recycleSmokeParticle(particle);
        }
        smokeParticles.length = 0;
    }

    function spawnDriftSmoke(
        leftWheelPosition,
        rightWheelPosition,
        intensity,
        speedAbs,
        vehicleStateSnapshot,
        dt
    ) {
        if (dt <= 0) {
            return;
        }

        const speedFactor = THREE.MathUtils.clamp(speedAbs / 16, 0.35, 1);
        const targetSpawnRate =
            DRIFT_SMOKE_SPAWN_RATE *
            state.qualityProfile.smokeSpawnRateMultiplier *
            (0.48 + intensity * 1.02) *
            speedFactor;
        state.smokeSpawnCarry += targetSpawnRate * dt;
        const particleBudget = Math.floor(state.smokeSpawnCarry);
        if (particleBudget <= 0) {
            return;
        }
        state.smokeSpawnCarry -= particleBudget;

        const velocityX = Number.isFinite(vehicleStateSnapshot?.velocity?.x)
            ? vehicleStateSnapshot.velocity.x
            : 0;
        const velocityZ = Number.isFinite(vehicleStateSnapshot?.velocity?.y)
            ? vehicleStateSnapshot.velocity.y
            : 0;
        const emissionCount = Math.min(state.qualityProfile.maxEmissionPerFrame, particleBudget);
        for (let i = 0; i < emissionCount; i += 1) {
            const spawnFromLeftWheel = Math.random() < 0.5;
            smokeSpawnPosition.copy(spawnFromLeftWheel ? leftWheelPosition : rightWheelPosition);
            smokeSpawnPosition.y += 0.03 + Math.random() * 0.04;
            spawnSmokeParticle(smokeSpawnPosition, intensity, velocityX, velocityZ);
        }
    }

    function spawnSmokeParticle(position, intensity, velocityX, velocityZ) {
        if (smokeParticles.length >= state.qualityProfile.maxSmokeParticles) {
            removeSmokeParticle(0);
        }

        const particle = acquireSmokeParticle();
        const sprite = particle.mesh;
        sprite.material.color.setScalar(THREE.MathUtils.lerp(0.28, 0.16, intensity));
        sprite.material.opacity = 0;
        const startScale =
            THREE.MathUtils.lerp(0.42, 0.82, intensity) * (0.86 + Math.random() * 0.7);
        sprite.position.copy(position);
        sprite.scale.setScalar(startScale);
        layer.add(sprite);

        particle.velocity.set(
            (Math.random() - 0.5) * 1.05 + velocityX * 0.03,
            0.65 + Math.random() * 0.92 + intensity * 0.4,
            (Math.random() - 0.5) * 1.05 + velocityZ * 0.03
        );
        particle.life =
            THREE.MathUtils.lerp(DRIFT_SMOKE_LIFE_MIN, DRIFT_SMOKE_LIFE_MAX, Math.random()) *
            (0.9 + intensity * 0.48);
        particle.maxLife = particle.life;
        particle.growthRate = 0.74 + Math.random() * 0.76 + intensity * 0.4;
        particle.baseOpacity = THREE.MathUtils.lerp(0.38, 0.82, intensity);
        smokeParticles.push(particle);
    }

    function updateSmokeParticles(dt) {
        if (smokeParticles.length === 0 || dt <= 0) {
            return;
        }

        const drag = Math.exp(-1.7 * dt);
        for (let i = smokeParticles.length - 1; i >= 0; i -= 1) {
            const particle = smokeParticles[i];
            particle.life -= dt;
            if (particle.life <= 0) {
                removeSmokeParticle(i);
                continue;
            }

            particle.velocity.x *= drag;
            particle.velocity.z *= drag;
            particle.velocity.y += 0.45 * dt;
            particle.mesh.position.addScaledVector(particle.velocity, dt);
            const lifeRatio = THREE.MathUtils.clamp(particle.life / particle.maxLife, 0, 1);
            const fadeIn = THREE.MathUtils.clamp((1 - lifeRatio) * 9.2, 0, 1);
            particle.mesh.material.opacity =
                particle.baseOpacity * fadeIn * Math.pow(lifeRatio, 0.54);
            const scaleGrowth = 1 + particle.growthRate * dt;
            particle.mesh.scale.multiplyScalar(scaleGrowth);
        }
    }

    function removeSmokeParticle(index) {
        const lastIndex = smokeParticles.length - 1;
        if (index < 0 || index > lastIndex) {
            return;
        }
        const particle = smokeParticles[index];
        if (!particle?.mesh) {
            return;
        }
        if (particle.mesh?.parent) {
            particle.mesh.parent.remove(particle.mesh);
        }
        if (index !== lastIndex) {
            smokeParticles[index] = smokeParticles[lastIndex];
        }
        smokeParticles.pop();
        recycleSmokeParticle(particle);
    }

    function acquireSmokeParticle() {
        if (smokeParticlePool.length > 0) {
            return smokeParticlePool.pop();
        }
        return createSmokeParticle();
    }

    function recycleSmokeParticle(particle) {
        if (!particle || !particle.mesh) {
            return;
        }
        particle.life = 0;
        particle.maxLife = 1;
        particle.growthRate = 0;
        particle.baseOpacity = 0;
        particle.velocity.set(0, 0, 0);
        particle.mesh.position.set(0, -1000, 0);
        particle.mesh.scale.setScalar(0.0001);
        particle.mesh.material.opacity = 0;
        if (smokeParticlePool.length < DRIFT_SMOKE_MAX_PARTICLES) {
            smokeParticlePool.push(particle);
        } else {
            particle.mesh.material.dispose();
        }
    }

    function createSmokeParticle() {
        const material = new THREE.SpriteMaterial({
            map: smokeTexture,
            color: new THREE.Color().setScalar(0.22),
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: true,
            toneMapped: false,
        });
        const sprite = new THREE.Sprite(material);
        return {
            mesh: sprite,
            velocity: new THREE.Vector3(),
            life: 0,
            maxLife: 1,
            growthRate: 0,
            baseOpacity: 0,
        };
    }

    function getLateralSpeed(vehicleStateSnapshot, headingYaw) {
        const velocity = vehicleStateSnapshot?.velocity;
        if (!velocity || !Number.isFinite(velocity.x) || !Number.isFinite(velocity.y)) {
            return 0;
        }
        const rightX = Math.cos(headingYaw);
        const rightZ = -Math.sin(headingYaw);
        return velocity.x * rightX + velocity.y * rightZ;
    }

    function addWheelTrail(from, to, intensity, smokeDensity = 0) {
        wheelDelta.subVectors(to, from);
        const distance = wheelDelta.length();
        if (distance < SKID_MARK_MIN_SEGMENT_LENGTH) {
            return false;
        }

        const splitCount = Math.max(1, Math.ceil(distance / SKID_MARK_MAX_SEGMENT_LENGTH));
        let wroteAny = false;
        for (let i = 0; i < splitCount; i += 1) {
            const t0 = i / splitCount;
            const t1 = (i + 1) / splitCount;
            segmentStart.lerpVectors(from, to, t0);
            segmentEnd.lerpVectors(from, to, t1);
            if (writeSegment(segmentStart, segmentEnd, intensity, smokeDensity)) {
                wroteAny = true;
            }
        }
        return wroteAny;
    }

    function writeSegment(from, to, intensity, smokeDensity = 0) {
        segmentDirection.subVectors(to, from);
        const length = segmentDirection.length();
        if (length < 0.0001) {
            return false;
        }

        segmentDirection.multiplyScalar(1 / length);
        segmentMidpoint.copy(from).add(to).multiplyScalar(0.5);

        const width = SKID_MARK_BASE_WIDTH * THREE.MathUtils.lerp(0.84, 1.26, intensity);
        const stretchedLength = THREE.MathUtils.clamp(
            length * (1.02 + intensity * 0.1),
            SKID_MARK_MIN_SEGMENT_LENGTH,
            SKID_MARK_MAX_SEGMENT_LENGTH * 1.2
        );
        const baseGray = THREE.MathUtils.lerp(0.32, 0.16, intensity);
        const smokeSoftenedGray = THREE.MathUtils.lerp(
            baseGray,
            0.42,
            smokeDensity * SKID_MARK_SMOKE_BLEND_STRENGTH
        );
        const grayscale = THREE.MathUtils.clamp(smokeSoftenedGray, 0, 1);
        instanceColor.setScalar(grayscale);

        instanceDummy.position.copy(segmentMidpoint);
        instanceDummy.position.y += 0.0008;
        instanceDummy.rotation.set(0, Math.atan2(segmentDirection.x, segmentDirection.z), 0);
        instanceDummy.scale.set(width, stretchedLength, 1);
        instanceDummy.updateMatrix();

        mesh.setMatrixAt(state.nextIndex, instanceDummy.matrix);
        mesh.setColorAt(state.nextIndex, instanceColor);
        state.nextIndex = (state.nextIndex + 1) % SKID_MARK_MAX_SEGMENTS;
        state.activeCount = Math.min(SKID_MARK_MAX_SEGMENTS, state.activeCount + 1);
        mesh.count = state.activeCount;
        return true;
    }
}

function normalizeSkidQualityProfile(profile = {}, fallback = DEFAULT_SKID_QUALITY_PROFILE) {
    const safeFallback = {
        ...DEFAULT_SKID_QUALITY_PROFILE,
        ...(fallback || {}),
    };
    return {
        maxSmokeParticles: clamp(
            Number(profile.maxSmokeParticles) || safeFallback.maxSmokeParticles,
            24,
            DRIFT_SMOKE_MAX_PARTICLES
        ),
        smokeSpawnRateMultiplier: clamp(
            Number(profile.smokeSpawnRateMultiplier) || safeFallback.smokeSpawnRateMultiplier,
            0.1,
            1.2
        ),
        maxEmissionPerFrame: clamp(
            Number(profile.maxEmissionPerFrame) || safeFallback.maxEmissionPerFrame,
            2,
            14
        ),
    };
}

function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}

function createSkidMarkAlphaTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const edgeGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    edgeGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    edgeGradient.addColorStop(0.28, 'rgba(255, 255, 255, 0.76)');
    edgeGradient.addColorStop(0.72, 'rgba(255, 255, 255, 0.76)');
    edgeGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = edgeGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'destination-in';
    const lengthFade = ctx.createLinearGradient(0, 0, 0, canvas.height);
    lengthFade.addColorStop(0, 'rgba(255, 255, 255, 0)');
    lengthFade.addColorStop(0.22, 'rgba(255, 255, 255, 0.8)');
    lengthFade.addColorStop(0.78, 'rgba(255, 255, 255, 0.8)');
    lengthFade.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = lengthFade;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    for (let i = 0; i < 26; i += 1) {
        const x = 10 + Math.random() * (canvas.width - 20);
        const width = 1 + Math.random() * 2;
        const alpha = 0.02 + Math.random() * 0.05;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fillRect(x, 0, width, canvas.height);
    }

    const texture = new THREE.CanvasTexture(canvas);
    if (THREE.NoColorSpace) {
        texture.colorSpace = THREE.NoColorSpace;
    }
    texture.anisotropy = 2;
    return texture;
}

function createDriftSmokeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const center = canvas.width * 0.5;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const coreGradient = ctx.createRadialGradient(center, center, 10, center, center, center);
    coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.88)');
    coreGradient.addColorStop(0.44, 'rgba(255, 255, 255, 0.52)');
    coreGradient.addColorStop(0.78, 'rgba(255, 255, 255, 0.12)');
    coreGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(center, center, center, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 28; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 24 + Math.random() * 92;
        const x = center + Math.cos(angle) * radius;
        const y = center + Math.sin(angle) * radius;
        const size = 8 + Math.random() * 22;
        const alpha = 0.02 + Math.random() * 0.07;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    if (THREE.NoColorSpace) {
        texture.colorSpace = THREE.NoColorSpace;
    }
    texture.anisotropy = 2;
    return texture;
}
