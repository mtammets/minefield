import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const ambientLight = new THREE.AmbientLight(0x44505f, 0.6);
const skyLight = new THREE.HemisphereLight(0xdde7ff, 0x1d242c, 0.9);
const sunLight = createLight('directional', {
    color: 0xffffff,
    intensity: 2.1,
    position: [80, 140, 60],
    shadow: {
        mapSize: 2048,
        cameraBounds: [-300, 300],
    },
});

const groundTexture = createGroundTexture();
const ground = createGround({
    texture: groundTexture,
    size: [2600, 2600],
    positionY: 0,
});

const SPEED_FADE_MAX = 24;

export { ambientLight, skyLight, sunLight, ground, updateGroundMotion };

function createLight(type, { color, intensity, position, shadow }) {
    let light;
    if (type === 'directional') {
        light = new THREE.DirectionalLight(color, intensity);
        if (shadow) {
            light.castShadow = true;
            light.shadow.mapSize.set(shadow.mapSize, shadow.mapSize);
            light.shadow.camera.left = shadow.cameraBounds[0];
            light.shadow.camera.right = shadow.cameraBounds[1];
            light.shadow.camera.top = shadow.cameraBounds[1];
            light.shadow.camera.bottom = shadow.cameraBounds[0];
        }
    }
    light.position.set(...position);
    return light;
}

function createGround({ texture, size, positionY }) {
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        color: 0xffffff,
        roughness: 0.95,
        metalness: 0.0,
    });
    material.userData.baseEmissive = 0.02;
    material.emissive = new THREE.Color(0x1a2a1d);
    material.emissiveIntensity = material.userData.baseEmissive;

    const geometry = new THREE.PlaneGeometry(...size);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = positionY;
    mesh.receiveShadow = true;
    return mesh;
}

function updateGroundMotion(_playerPosition, playerSpeed = 0) {
    const speedRatio = THREE.MathUtils.clamp(Math.abs(playerSpeed) / SPEED_FADE_MAX, 0, 1);
    const intensityBoost = speedRatio * 0.08;
    ground.material.emissiveIntensity = ground.material.userData.baseEmissive + intensityBoost;
}

function createGroundTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#215a25';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Longitudinal lines to communicate forward speed.
    for (let x = 0; x < canvas.width; x += 24) {
        const alpha = x % 96 === 0 ? 0.24 : 0.1;
        ctx.strokeStyle = `rgba(214, 255, 219, ${alpha})`;
        ctx.lineWidth = x % 96 === 0 ? 3 : 1;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, canvas.height);
        ctx.stroke();
    }

    // Cross lines give a better sense of acceleration and scale.
    for (let y = 0; y < canvas.height; y += 48) {
        const alpha = y % 192 === 0 ? 0.20 : 0.08;
        ctx.strokeStyle = `rgba(42, 66, 45, ${alpha})`;
        ctx.lineWidth = y % 192 === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(canvas.width, y + 0.5);
        ctx.stroke();
    }

    // Center lane style dashed marks for directional cue.
    ctx.strokeStyle = 'rgba(230, 245, 200, 0.38)';
    ctx.lineWidth = 6;
    ctx.setLineDash([36, 28]);
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.5, 0);
    ctx.lineTo(canvas.width * 0.5, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(18, 18);
    texture.anisotropy = 8;
    return texture;
}
