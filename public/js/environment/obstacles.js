export const staticObstacles = [];

export function clearStaticObstacles() {
    staticObstacles.length = 0;
}

export function addObstacleCircle(x, z, radius, category = 'generic', verticalRange = null) {
    const obstacle = {
        type: 'circle',
        x,
        z,
        radius,
        category,
    };
    applyObstacleVerticalRange(obstacle, verticalRange);
    staticObstacles.push(obstacle);
    return obstacle;
}

export function addObstacleAabb(
    x,
    z,
    width,
    depth,
    padding = 0,
    category = 'generic',
    verticalRange = null
) {
    const halfWidth = Math.max(0.25, width * 0.5 + padding);
    const halfDepth = Math.max(0.25, depth * 0.5 + padding);
    const obstacle = {
        type: 'aabb',
        minX: x - halfWidth,
        maxX: x + halfWidth,
        minZ: z - halfDepth,
        maxZ: z + halfDepth,
        category,
    };
    applyObstacleVerticalRange(obstacle, verticalRange);
    staticObstacles.push(obstacle);
    return obstacle;
}

function applyObstacleVerticalRange(obstacle, verticalRange = null) {
    if (!obstacle || !verticalRange || typeof verticalRange !== 'object') {
        return;
    }

    const minY = Number(verticalRange.minY);
    const maxY = Number(verticalRange.maxY);
    if (Number.isFinite(minY)) {
        obstacle.minY = minY;
    }
    if (Number.isFinite(maxY)) {
        obstacle.maxY = maxY;
    }
}
