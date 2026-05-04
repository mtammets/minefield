export const GROUND_DEBUG_LAYER_META = Object.freeze([
    { id: 'terrain_base', label: 'Base terrain' },
    { id: 'terrain_upper_deck', label: 'Upper deck' },
    { id: 'charging_fx', label: 'Charging FX' },
]);

const groundDebugMetaById = new Map(
    GROUND_DEBUG_LAYER_META.map((entry, index) => [entry.id, { ...entry, order: index }])
);

export function getGroundDebugLayerLabel(layerId = '') {
    return groundDebugMetaById.get(layerId)?.label || String(layerId || 'Unnamed layer');
}

export function getGroundDebugLayerOrder(layerId = '') {
    return groundDebugMetaById.get(layerId)?.order ?? Number.MAX_SAFE_INTEGER;
}

export function markGroundDebugLayer(node, layerId = '') {
    if (!node || !layerId) {
        return node;
    }
    if (!node.userData) {
        node.userData = {};
    }
    node.userData.groundDebugLayerId = layerId;
    node.userData.groundDebugLayerLabel = getGroundDebugLayerLabel(layerId);
    return node;
}
