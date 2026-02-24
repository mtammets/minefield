import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { playerSpawnPoint } from './layout.js';
import { getGroundHeightAt } from './terrain.js';

let spawnPadTextureCache = null;
let startBannerTextureCache = null;

export function createSpawnMarkerLayer() {
    const layer = new THREE.Group();
    layer.name = 'spawnMarkerLayer';

    const baseY = getGroundHeightAt(playerSpawnPoint.x, playerSpawnPoint.z);
    const marker = new THREE.Group();
    marker.position.set(playerSpawnPoint.x, baseY + 0.14, playerSpawnPoint.z);
    marker.rotation.y = playerSpawnPoint.rotationY + Math.PI;

    const padTexture = getSpawnPadTexture();
    const bannerTexture = getStartBannerTexture();
    const padMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: padTexture,
    });
    const gateMaterial = new THREE.MeshLambertMaterial({
        color: 0xb8cde6,
    });
    const lampMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        toneMapped: false,
        vertexColors: true,
    });
    const bannerMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: bannerTexture,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
    });

    const pad = new THREE.Mesh(new THREE.PlaneGeometry(8, 14), padMaterial);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, 0, 0);
    marker.add(pad);

    addGateStructure(marker, gateMaterial);
    addStartLamps(marker, lampMaterial);

    const banner = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.52), bannerMaterial);
    banner.position.set(0, 3.24, 5.07);
    marker.add(banner);

    freezeStaticHierarchy(marker);
    layer.add(marker);
    return layer;
}

function addGateStructure(marker, gateMaterial) {
    const pylonGeometry = new THREE.BoxGeometry(0.34, 3.6, 0.34);
    const pylons = new THREE.InstancedMesh(pylonGeometry, gateMaterial, 2);
    const dummy = new THREE.Object3D();

    dummy.position.set(-3.4, 1.82, 5.26);
    dummy.updateMatrix();
    pylons.setMatrixAt(0, dummy.matrix);

    dummy.position.set(3.4, 1.82, 5.26);
    dummy.updateMatrix();
    pylons.setMatrixAt(1, dummy.matrix);
    pylons.instanceMatrix.needsUpdate = true;
    marker.add(pylons);

    const topBar = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.24, 0.24), gateMaterial);
    topBar.position.set(0, 3.56, 5.26);
    marker.add(topBar);

    const beam = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.58, 0.22), gateMaterial);
    beam.position.set(0, 3.24, 5.16);
    marker.add(beam);
}

function addStartLamps(marker, lampMaterial) {
    const lampGeometry = new THREE.SphereGeometry(0.2, 6, 5);
    const lamps = new THREE.InstancedMesh(lampGeometry, lampMaterial, 3);
    const colors = [
        new THREE.Color(0xff6f77),
        new THREE.Color(0xffc56a),
        new THREE.Color(0x8be8ff),
    ];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < 3; i += 1) {
        dummy.position.set((i - 1) * 0.94, 3.24, 5.05);
        dummy.updateMatrix();
        lamps.setMatrixAt(i, dummy.matrix);
        lamps.setColorAt(i, colors[i]);
    }

    lamps.instanceMatrix.needsUpdate = true;
    if (lamps.instanceColor) {
        lamps.instanceColor.needsUpdate = true;
    }
    marker.add(lamps);
}

function createSpawnPadTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 896;
    const ctx = canvas.getContext('2d');

    const baseGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    baseGradient.addColorStop(0, '#2a5076');
    baseGradient.addColorStop(0.44, '#1c3652');
    baseGradient.addColorStop(1, '#14263a');
    ctx.fillStyle = baseGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 1500; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const shade = 54 + Math.random() * 40;
        ctx.fillStyle = `rgba(${shade}, ${shade + 8}, ${shade + 16}, 0.1)`;
        ctx.fillRect(x, y, 2, 2);
    }

    ctx.strokeStyle = 'rgba(166, 216, 255, 0.74)';
    ctx.lineWidth = 8;
    ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

    ctx.strokeStyle = 'rgba(148, 206, 255, 0.7)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.18, 34);
    ctx.lineTo(canvas.width * 0.18, canvas.height - 34);
    ctx.moveTo(canvas.width * 0.82, 34);
    ctx.lineTo(canvas.width * 0.82, canvas.height - 34);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(192, 231, 255, 0.58)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.5, 44);
    ctx.lineTo(canvas.width * 0.5, canvas.height - 44);
    ctx.stroke();

    ctx.fillStyle = 'rgba(234, 245, 255, 0.9)';
    for (let i = 0; i < 9; i += 1) {
        ctx.fillRect(canvas.width * 0.5 - 18, 120 + i * 114, 36, 64);
    }

    const startBarY = canvas.height * 0.23;
    const cellW = 34;
    const cellH = 34;
    for (let row = 0; row < 2; row += 1) {
        for (let col = 0; col < 16; col += 1) {
            ctx.fillStyle =
                (row + col) % 2 === 0 ? 'rgba(233, 246, 255, 0.9)' : 'rgba(92, 133, 171, 0.86)';
            ctx.fillRect(
                canvas.width * 0.5 - cellW * 8 + col * cellW,
                startBarY + row * cellH,
                cellW,
                cellH
            );
        }
    }

    ctx.fillStyle = 'rgba(160, 214, 255, 0.66)';
    for (let i = 0; i < 8; i += 1) {
        const y = canvas.height * 0.36 + i * 88;
        const halfWidth = 104 - i * 8;
        ctx.beginPath();
        ctx.moveTo(canvas.width * 0.5 - halfWidth, y);
        ctx.lineTo(canvas.width * 0.5, y + 30);
        ctx.lineTo(canvas.width * 0.5 + halfWidth, y);
        ctx.lineTo(canvas.width * 0.5 + halfWidth - 20, y - 12);
        ctx.lineTo(canvas.width * 0.5, y + 16);
        ctx.lineTo(canvas.width * 0.5 - halfWidth + 20, y - 12);
        ctx.closePath();
        ctx.fill();
    }

    const ringCenterY = canvas.height * 0.9;
    const ringStroke = [
        'rgba(255, 118, 126, 0.76)',
        'rgba(255, 198, 102, 0.74)',
        'rgba(140, 230, 255, 0.74)',
    ];
    for (let i = 0; i < 3; i += 1) {
        ctx.strokeStyle = ringStroke[i];
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(canvas.width * 0.5 + (i - 1) * 72, ringCenterY, 34, 0, Math.PI * 2);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 1;
    return texture;
}

function createStartBannerTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, 'rgba(123, 186, 255, 0.2)');
    gradient.addColorStop(0.5, 'rgba(188, 225, 255, 0.9)');
    gradient.addColorStop(1, 'rgba(123, 186, 255, 0.2)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(224, 241, 255, 0.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

    ctx.fillStyle = 'rgba(24, 50, 78, 0.9)';
    ctx.font = '700 38px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('START', canvas.width * 0.5, canvas.height * 0.54);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 1;
    return texture;
}

function getSpawnPadTexture() {
    if (!spawnPadTextureCache) {
        spawnPadTextureCache = createSpawnPadTexture();
    }
    return spawnPadTextureCache;
}

function getStartBannerTexture() {
    if (!startBannerTextureCache) {
        startBannerTextureCache = createStartBannerTexture();
    }
    return startBannerTextureCache;
}

function freezeStaticHierarchy(root) {
    root.traverse((node) => {
        if (!node || !node.isObject3D) {
            return;
        }
        node.matrixAutoUpdate = false;
        node.updateMatrix();
    });
}
