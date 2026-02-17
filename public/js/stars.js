import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

export function addStars(scene) {
    const starGeometry = new THREE.BufferGeometry();
    const starCount = window.innerWidth < 900 ? 420 : 900;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
        const radius = Math.random() * 9000 + 900;
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos((Math.random() * 2) - 1);

        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = radius * Math.cos(phi);

        const tint = Math.random();
        colors[i * 3] = 0.7 + tint * 0.2;
        colors[i * 3 + 1] = 0.76 + tint * 0.18;
        colors[i * 3 + 2] = 0.9 + tint * 0.1;
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starMaterial = new THREE.PointsMaterial({
        size: 0.45,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.58,
        vertexColors: true,
    });

    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    return {
        update(deltaTime = 1 / 60) {
            const dt = Math.min(deltaTime, 0.05);
            stars.rotation.y += dt * 0.014;
        },
    };
}
