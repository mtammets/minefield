import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

export function addStars(scene) {
    const starGeometry = new THREE.BufferGeometry();
    const starCount = window.innerWidth < 900 ? 12000 : 22000;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3); // Värvide lisamine

    for (let i = 0; i < starCount; i++) {
        const radius = Math.random() * 9000 + 900; // Stars in a spherical distribution
        const theta = Math.random() * 2 * Math.PI; // Random angle around Y-axis
        const phi = Math.acos((Math.random() * 2) - 1); // Random angle from the pole

        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta); // X position
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta); // Y position
        positions[i * 3 + 2] = radius * Math.cos(phi); // Z position

        // Juhuslikud värvid RGB formaadis
        colors[i * 3] = Math.random(); // R
        colors[i * 3 + 1] = Math.random(); // G
        colors[i * 3 + 2] = Math.random(); // B
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); // Lisa värvid

    const starMaterial = new THREE.PointsMaterial({
        size: 0.5,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.8,
        vertexColors: true // Luba individuaalsed värvid
    });

    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    return {
        update(deltaTime = 1 / 60) {
            const dt = Math.min(deltaTime, 0.05);
            stars.rotation.y += dt * 0.03;
        },
    };
}
