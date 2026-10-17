import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { createSkyDomeTexture } from './environment/textures.js';
const SKY_LAYER_CONFIGS = Object.freeze([
    {
        countMobile: 720,
        countDesktop: 1360,
        radiusMin: 340,
        radiusMax: 420,
        minY: -0.08,
        size: 1.6,
        opacity: 0.62,
        twinkleAmplitude: 0.05,
        twinkleSpeed: 0.2,
        rotationSpeed: 0.0026,
        tiltAmplitude: 0.012,
        additive: false,
    },
    {
        countMobile: 220,
        countDesktop: 420,
        radiusMin: 360,
        radiusMax: 450,
        minY: 0.02,
        size: 2.8,
        opacity: 0.82,
        twinkleAmplitude: 0.08,
        twinkleSpeed: 0.32,
        rotationSpeed: 0.0044,
        tiltAmplitude: 0.016,
        additive: false,
    },
    {
        countMobile: 44,
        countDesktop: 88,
        radiusMin: 380,
        radiusMax: 490,
        minY: 0.12,
        size: 4.8,
        opacity: 0.96,
        twinkleAmplitude: 0.12,
        twinkleSpeed: 0.5,
        rotationSpeed: 0.0068,
        tiltAmplitude: 0.02,
        additive: true,
    },
    {
        countMobile: 16,
        countDesktop: 28,
        radiusMin: 400,
        radiusMax: 500,
        minY: 0.18,
        size: 6.4,
        opacity: 0.1,
        twinkleAmplitude: 0.04,
        twinkleSpeed: 0.18,
        rotationSpeed: 0.0018,
        tiltAmplitude: 0.008,
        additive: true,
        glowOnly: true,
    },
]);

export function addStars(scene, camera = null) {
    const isMobileViewport = window.innerWidth < 900;
    const skyRoot = new THREE.Group();
    skyRoot.name = 'nightSkyRoot';

    const skyTexture = createSkyDomeTexture();
    scene.background = skyTexture;

    const starSpriteTexture = createStarSpriteTexture();
    const starLayers = SKY_LAYER_CONFIGS.map((config, index) =>
        createStarLayer(config, index, starSpriteTexture, isMobileViewport)
    );
    starLayers.forEach((layer) => skyRoot.add(layer.points));

    if (camera?.position) {
        skyRoot.position.copy(camera.position);
    }
    scene.add(skyRoot);

    let elapsed = Math.random() * 100;
    return {
        update(deltaTime = 1 / 60) {
            const dt = Math.min(deltaTime, 0.05);
            elapsed += dt;

            if (camera?.position) {
                skyRoot.position.copy(camera.position);
            }

            starLayers.forEach((layer) => {
                layer.points.rotation.y += dt * layer.rotationSpeed;
                layer.points.rotation.x =
                    Math.sin(elapsed * layer.tiltSpeed + layer.twinklePhase) * layer.tiltAmplitude;
                layer.material.opacity =
                    layer.baseOpacity +
                    Math.sin(elapsed * layer.twinkleSpeed + layer.twinklePhase) *
                        layer.twinkleAmplitude;
            });
        },
    };
}

function createStarLayer(config, index, spriteTexture, isMobileViewport) {
    const count = isMobileViewport ? config.countMobile : config.countDesktop;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();

    for (let i = 0; i < count; i += 1) {
        const radius = THREE.MathUtils.lerp(
            config.radiusMin,
            config.radiusMax,
            Math.pow(Math.random(), 0.72)
        );
        const direction = sampleSkyDirection(config.minY ?? -0.1);
        positions[i * 3] = direction.x * radius;
        positions[i * 3 + 1] = direction.y * radius;
        positions[i * 3 + 2] = direction.z * radius;

        resolveStarColor(color, Math.random(), config.glowOnly ? 0.92 : Math.random());
        if (config.glowOnly) {
            color.multiplyScalar(1.08);
        }
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: config.size,
        sizeAttenuation: false,
        map: spriteTexture,
        alphaMap: spriteTexture,
        transparent: true,
        opacity: config.opacity,
        vertexColors: true,
        depthWrite: false,
        fog: false,
        blending: config.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    material.toneMapped = false;

    const points = new THREE.Points(geometry, material);
    points.renderOrder = -90 + index;
    points.frustumCulled = false;

    return {
        points,
        material,
        baseOpacity: config.opacity,
        twinkleAmplitude: config.twinkleAmplitude,
        twinkleSpeed: config.twinkleSpeed,
        twinklePhase: Math.random() * Math.PI * 2,
        rotationSpeed: config.rotationSpeed,
        tiltAmplitude: config.tiltAmplitude,
        tiltSpeed: config.twinkleSpeed * 0.4 + 0.04,
    };
}

function sampleSkyDirection(minY = -0.1) {
    const safeMinY = THREE.MathUtils.clamp(minY, -0.85, 0.92);
    const topBias = Math.pow(Math.random(), 0.62);
    const y = THREE.MathUtils.lerp(safeMinY, 1, topBias);
    const horizontalRadius = Math.sqrt(Math.max(0.0001, 1 - y * y));
    const theta = Math.random() * Math.PI * 2;
    return new THREE.Vector3(
        Math.cos(theta) * horizontalRadius,
        y,
        Math.sin(theta) * horizontalRadius
    );
}

function resolveStarColor(color, tintMix, brightnessMix) {
    if (tintMix < 0.16) {
        color.setRGB(1, 0.86, 0.72);
    } else if (tintMix < 0.52) {
        color.setRGB(1, 0.95, 0.9);
    } else if (tintMix < 0.82) {
        color.setRGB(0.84, 0.91, 1);
    } else {
        color.setRGB(0.71, 0.83, 1);
    }

    const brightness = THREE.MathUtils.lerp(0.78, 1.08, Math.pow(brightnessMix, 0.72));
    color.multiplyScalar(brightness);
}

function createStarSpriteTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    const center = canvas.width * 0.5;

    const glow = ctx.createRadialGradient(center, center, 0, center, center, center);
    glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
    glow.addColorStop(0.16, 'rgba(255, 255, 255, 0.98)');
    glow.addColorStop(0.34, 'rgba(198, 224, 255, 0.62)');
    glow.addColorStop(0.6, 'rgba(144, 190, 255, 0.18)');
    glow.addColorStop(1, 'rgba(144, 190, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
}
