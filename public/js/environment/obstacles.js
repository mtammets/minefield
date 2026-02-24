export const staticObstacles = [];

export function clearStaticObstacles() {
    staticObstacles.length = 0;
}

export function addObstacleCircle(x, z, radius, category = 'generic') {
    staticObstacles.push({
        type: 'circle',
        x,
        z,
        radius,
        category,
    });
}

export function addObstacleAabb(x, z, width, depth, padding = 0, category = 'generic') {
    const halfWidth = Math.max(0.25, width * 0.5 + padding);
    const halfDepth = Math.max(0.25, depth * 0.5 + padding);
    staticObstacles.push({
        type: 'aabb',
        minX: x - halfWidth,
        maxX: x + halfWidth,
        minZ: z - halfDepth,
        maxZ: z + halfDepth,
        category,
    });
}
