import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';

const ambientLight = new THREE.AmbientLight(0x111122, 0.5);
const sunLight = createLight('directional', {
    color: 0x6666ff,
    intensity: 0.8,
    position: [50, 100, 50],
    shadow: {
        mapSize: 2048,
        cameraBounds: [-300, 300],
    },
});

const ground = createGround({
    color: 0x228b22,
    size: [50, 50],
    positionY: -0.5,
});

export { ambientLight, sunLight, ground };

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

function createGround({ color, size, positionY }) {
    const material = new THREE.MeshPhysicalMaterial({ color });
    const geometry = new THREE.PlaneGeometry(...size);
    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = positionY;
    ground.receiveShadow = true;
    return ground;
}
