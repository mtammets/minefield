export function createMiniMapController(worldBounds, options = {}) {
    const canvas = document.getElementById('minimapCanvas');
    const info = document.getElementById('minimapInfo');

    if (!canvas || !info) {
        return {
            update() {},
            resize() {},
        };
    }

    const ctx = canvas.getContext('2d');
    const baseSize = 190;
    const padding = 14;
    const innerSize = baseSize - padding * 2;
    const rangeX = worldBounds.maxX - worldBounds.minX;
    const rangeZ = worldBounds.maxZ - worldBounds.minZ;
    const staticObstacles = Array.isArray(options.staticObstacles) ? options.staticObstacles : [];
    const cityMapLayout = options.cityMapLayout || {};
    const gridSpacing = Number(cityMapLayout.gridSpacing) || 42;
    const gridRange = Number(cityMapLayout.gridRange) || 6;
    const roadWidth = Number(cityMapLayout.roadWidth) || 20;
    const sidewalkWidth = Number(cityMapLayout.sidewalkWidth) || 4.4;
    const baseLayerCanvas = document.createElement('canvas');
    baseLayerCanvas.width = baseSize;
    baseLayerCanvas.height = baseSize;
    const baseLayerCtx = baseLayerCanvas.getContext('2d');

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(baseSize * dpr);
        canvas.height = Math.round(baseSize * dpr);
        canvas.style.width = `${baseSize}px`;
        canvas.style.height = `${baseSize}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawStaticLayer();
    }

    function update(position, rotationY, pickups = [], botMarkers = [], options = {}) {
        const hidePlayer = Boolean(options?.hidePlayer);
        ctx.clearRect(0, 0, baseSize, baseSize);
        ctx.drawImage(baseLayerCanvas, 0, 0);

        renderPickups(pickups);
        renderBots(botMarkers);
        if (!hidePlayer) {
            renderPlayer(position, rotationY);
        }

        if (hidePlayer) {
            info.textContent = `X - | Z - | H - | OBJ ${pickups.length} | BOT ${botMarkers.length}`;
            return;
        }

        const headingDeg = normalizeHeadingDeg((-rotationY * 180) / Math.PI);
        info.textContent = `X ${position.x.toFixed(1)} | Z ${position.z.toFixed(1)} | H ${headingDeg.toFixed(0)}° | OBJ ${pickups.length} | BOT ${botMarkers.length}`;
    }

    function drawStaticLayer() {
        baseLayerCtx.clearRect(0, 0, baseSize, baseSize);
        const background = baseLayerCtx.createLinearGradient(0, 0, 0, baseSize);
        background.addColorStop(0, 'rgba(18, 31, 48, 0.98)');
        background.addColorStop(1, 'rgba(10, 20, 32, 0.98)');
        baseLayerCtx.fillStyle = background;
        baseLayerCtx.fillRect(0, 0, baseSize, baseSize);

        drawRoadBands();
        drawBuildingFootprints();
        drawLampPosts();

        baseLayerCtx.strokeStyle = 'rgba(150, 206, 255, 0.86)';
        baseLayerCtx.lineWidth = 2;
        baseLayerCtx.strokeRect(padding, padding, innerSize, innerSize);
    }

    function drawRoadBands() {
        for (let grid = -gridRange; grid <= gridRange; grid += 1) {
            if (Math.abs(grid) % 2 !== 0) {
                continue;
            }
            const lineCoord = grid * gridSpacing;
            drawVerticalBand(lineCoord, roadWidth + sidewalkWidth * 2, 'rgba(86, 116, 148, 0.88)');
            drawHorizontalBand(
                lineCoord,
                roadWidth + sidewalkWidth * 2,
                'rgba(86, 116, 148, 0.88)'
            );
            drawVerticalBand(lineCoord, roadWidth, 'rgba(47, 65, 88, 0.96)');
            drawHorizontalBand(lineCoord, roadWidth, 'rgba(47, 65, 88, 0.96)');
        }
    }

    function drawBuildingFootprints() {
        baseLayerCtx.fillStyle = 'rgba(29, 40, 58, 0.95)';
        baseLayerCtx.strokeStyle = 'rgba(132, 173, 214, 0.34)';
        baseLayerCtx.lineWidth = 0.8;
        for (let i = 0; i < staticObstacles.length; i += 1) {
            const obstacle = staticObstacles[i];
            if (!obstacle || obstacle.type !== 'aabb' || obstacle.category !== 'building') {
                continue;
            }
            const rect = worldRectToMinimap(
                obstacle.minX,
                obstacle.maxX,
                obstacle.minZ,
                obstacle.maxZ
            );
            if (!rect) {
                continue;
            }
            baseLayerCtx.fillRect(rect.x, rect.y, rect.w, rect.h);
            baseLayerCtx.strokeRect(rect.x + 0.4, rect.y + 0.4, rect.w - 0.8, rect.h - 0.8);
        }
    }

    function drawLampPosts() {
        baseLayerCtx.fillStyle = 'rgba(235, 205, 134, 0.6)';
        for (let i = 0; i < staticObstacles.length; i += 1) {
            const obstacle = staticObstacles[i];
            if (!obstacle || obstacle.type !== 'circle' || obstacle.category !== 'lamp_post') {
                continue;
            }
            const mapped = worldToMinimap(obstacle.x, obstacle.z);
            baseLayerCtx.beginPath();
            baseLayerCtx.arc(mapped.x, mapped.y, 0.9, 0, Math.PI * 2);
            baseLayerCtx.fill();
        }
    }

    function drawVerticalBand(centerX, width, color) {
        const halfWidth = width * 0.5;
        const start = worldToMinimap(centerX - halfWidth, worldBounds.minZ);
        const end = worldToMinimap(centerX + halfWidth, worldBounds.maxZ);
        const rectX = Math.min(start.x, end.x);
        const rectY = Math.min(start.y, end.y);
        const rectW = Math.max(0.8, Math.abs(end.x - start.x));
        const rectH = Math.max(0.8, Math.abs(end.y - start.y));
        baseLayerCtx.fillStyle = color;
        baseLayerCtx.fillRect(rectX, rectY, rectW, rectH);
    }

    function drawHorizontalBand(centerZ, width, color) {
        const halfWidth = width * 0.5;
        const start = worldToMinimap(worldBounds.minX, centerZ - halfWidth);
        const end = worldToMinimap(worldBounds.maxX, centerZ + halfWidth);
        const rectX = Math.min(start.x, end.x);
        const rectY = Math.min(start.y, end.y);
        const rectW = Math.max(0.8, Math.abs(end.x - start.x));
        const rectH = Math.max(0.8, Math.abs(end.y - start.y));
        baseLayerCtx.fillStyle = color;
        baseLayerCtx.fillRect(rectX, rectY, rectW, rectH);
    }

    function worldRectToMinimap(minX, maxX, minZ, maxZ) {
        const topLeft = worldToMinimap(minX, minZ);
        const bottomRight = worldToMinimap(maxX, maxZ);
        const x = Math.min(topLeft.x, bottomRight.x);
        const y = Math.min(topLeft.y, bottomRight.y);
        const w = Math.abs(bottomRight.x - topLeft.x);
        const h = Math.abs(bottomRight.y - topLeft.y);
        if (w <= 0.3 || h <= 0.3) {
            return null;
        }
        return { x, y, w, h };
    }

    function renderPickups(pickups) {
        if (!pickups.length) {
            return;
        }

        const maxDots = 72;
        const step = pickups.length > maxDots ? Math.ceil(pickups.length / maxDots) : 1;
        for (let i = 0; i < pickups.length; i += step) {
            const pickup = pickups[i];
            const mapped = worldToMinimap(pickup.x, pickup.z);
            const radius = pickup.isTarget ? 3 : 2.2;
            ctx.globalAlpha = pickup.isTarget ? 0.98 : 0.74;
            ctx.fillStyle = toCssHex(pickup.colorHex);
            ctx.beginPath();
            ctx.arc(mapped.x, mapped.y, radius, 0, Math.PI * 2);
            ctx.fill();

            if (pickup.isTarget) {
                ctx.globalAlpha = 0.76;
                ctx.strokeStyle = 'rgba(231, 245, 255, 0.88)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.arc(mapped.x, mapped.y, 4.7, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
    }

    function renderBots(botMarkers) {
        if (!botMarkers.length) {
            return;
        }

        for (let i = 0; i < botMarkers.length; i += 1) {
            const bot = botMarkers[i];
            const mapped = worldToMinimap(bot.x, bot.z);
            const forwardX = -Math.sin(bot.rotationY);
            const forwardY = -Math.cos(bot.rotationY);
            const sideX = -forwardY;
            const sideY = forwardX;

            ctx.fillStyle = toCssHex(bot.colorHex || 0x8fa0b8);
            ctx.globalAlpha = 0.95;
            ctx.beginPath();
            ctx.moveTo(mapped.x + forwardX * 6.2, mapped.y + forwardY * 6.2);
            ctx.lineTo(
                mapped.x - forwardX * 3.8 + sideX * 3.6,
                mapped.y - forwardY * 3.8 + sideY * 3.6
            );
            ctx.lineTo(
                mapped.x - forwardX * 3.8 - sideX * 3.6,
                mapped.y - forwardY * 3.8 - sideY * 3.6
            );
            ctx.closePath();
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function renderPlayer(position, rotationY) {
        const mapped = worldToMinimap(position.x, position.z);
        const forwardX = -Math.sin(rotationY);
        const forwardY = -Math.cos(rotationY);
        const sideX = -forwardY;
        const sideY = forwardX;

        const noseLength = 10.5;
        const wingLength = 6;
        const tailLength = 4.8;

        ctx.fillStyle = '#ff9872';
        ctx.globalAlpha = 0.98;
        ctx.beginPath();
        ctx.moveTo(mapped.x + forwardX * noseLength, mapped.y + forwardY * noseLength);
        ctx.lineTo(
            mapped.x - forwardX * tailLength + sideX * wingLength,
            mapped.y - forwardY * tailLength + sideY * wingLength
        );
        ctx.lineTo(
            mapped.x - forwardX * tailLength - sideX * wingLength,
            mapped.y - forwardY * tailLength - sideY * wingLength
        );
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(147, 255, 235, 0.95)';
        ctx.beginPath();
        ctx.arc(mapped.x, mapped.y, 2.9, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.24;
        ctx.strokeStyle = 'rgba(135, 248, 228, 0.95)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(mapped.x, mapped.y, 10.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function worldToMinimap(x, z) {
        const normalizedX = (x - worldBounds.minX) / rangeX;
        const normalizedZ = (z - worldBounds.minZ) / rangeZ;
        const clampedX = Math.max(0, Math.min(1, normalizedX));
        const clampedZ = Math.max(0, Math.min(1, normalizedZ));
        return {
            x: padding + clampedX * innerSize,
            y: padding + clampedZ * innerSize,
        };
    }

    resize();

    return {
        update,
        resize,
    };
}

function toCssHex(colorHex) {
    return `#${(colorHex >>> 0).toString(16).padStart(6, '0')}`;
}

function normalizeHeadingDeg(rawDeg) {
    return ((rawDeg % 360) + 360) % 360;
}
