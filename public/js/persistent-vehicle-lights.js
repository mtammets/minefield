// Keep the renderer's light count stable when a vehicle is hidden or destroyed.
// Changing that count otherwise recompiles every lit material in the city.
export function installPersistentVehicleLights(scene, vehicle) {
    const entries = [];
    vehicle.traverse((source) => {
        if (!source.isPointLight && !source.isSpotLight) {
            return;
        }
        const light = source.clone(false);
        light.matrixAutoUpdate = false;
        light.matrixWorldAutoUpdate = false;
        light.visible = true;
        light.intensity = 0;
        source.layers.disableAll();
        scene.add(light);
        entries.push({ source, light });
    });

    const previousBeforeRender = scene.onBeforeRender;
    scene.onBeforeRender = function (...args) {
        previousBeforeRender.apply(this, args);
        // Three.js updates world matrices before invoking this hook.
        for (const { source, light } of entries) {
            let visible = true;
            let attached = false;
            for (let parent = source; parent; parent = parent.parent) {
                if (parent === scene) {
                    attached = true;
                    break;
                }
                if (!parent.visible) {
                    visible = false;
                    break;
                }
            }
            light.matrixWorld.copy(source.matrixWorld);
            light.color.copy(source.color);
            light.intensity = visible && attached ? source.intensity : 0;
            light.distance = source.distance;
            light.decay = source.decay;
            if (source.isSpotLight) {
                light.angle = source.angle;
                light.penumbra = source.penumbra;
                light.target.matrixWorld.copy(source.target.matrixWorld);
            }
        }
    };
}
