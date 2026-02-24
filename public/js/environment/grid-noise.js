export function randomFromGrid(gridX, gridZ, salt) {
    return hashToUnit(hashGrid(gridX, gridZ, salt));
}

export function hashToUnit(value) {
    return value / 4294967295;
}

export function hashGrid(gridX, gridZ, salt) {
    let hash = (gridX * 374761393 + gridZ * 668265263 + salt * 1442695041) | 0;
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    hash ^= hash >>> 16;
    return hash >>> 0;
}
