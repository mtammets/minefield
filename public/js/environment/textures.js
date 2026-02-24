import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { ROAD_SIDE_LINE_POSITIONS, ROAD_STYLE_CONFIGS } from './config.js';

export function createGroundTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    const verticalGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    verticalGradient.addColorStop(0, '#2a3f58');
    verticalGradient.addColorStop(0.45, '#24384e');
    verticalGradient.addColorStop(1, '#1f3248');
    ctx.fillStyle = verticalGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 6200; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const value = 46 + Math.random() * 40;
        ctx.fillStyle = `rgba(${value}, ${value + 8}, ${value + 18}, 0.1)`;
        ctx.fillRect(x, y, 2.3, 2.3);
    }

    for (let i = 0; i < 24; i += 1) {
        const radius = 86 + Math.random() * 184;
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, 'rgba(186, 215, 255, 0.07)');
        gradient.addColorStop(1, 'rgba(186, 215, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.strokeStyle = 'rgba(12, 20, 30, 0.08)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 120; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const length = 34 + Math.random() * 140;
        const heading = Math.random() * Math.PI * 2;
        ctx.lineWidth = 0.9 + Math.random() * 1.3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(heading) * length, y + Math.sin(heading) * length);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 10);
    texture.anisotropy = 2;
    return texture;
}

export function createRoadSurfaceTexture(styleTextureConfig = ROAD_STYLE_CONFIGS.avenue.texture) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const baseGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    baseGradient.addColorStop(0, styleTextureConfig.top);
    baseGradient.addColorStop(1, styleTextureConfig.bottom);
    ctx.fillStyle = baseGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 3000; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const value = styleTextureConfig.noiseBase + Math.random() * styleTextureConfig.noiseSpread;
        ctx.fillStyle = `rgba(${value}, ${value + 2}, ${value + 7}, 0.14)`;
        ctx.fillRect(x, y, 1.8, 1.8);
    }

    ctx.strokeStyle = styleTextureConfig.sideLineColor;
    ctx.lineWidth = styleTextureConfig.sideLineWidth;
    styleTextureConfig.sideLinePositions.forEach((positionRatio) => {
        const lineX = canvas.width * positionRatio;
        ctx.beginPath();
        ctx.moveTo(lineX, 0);
        ctx.lineTo(lineX, canvas.height);
        ctx.stroke();
    });

    const centerX = canvas.width * 0.5;
    if (styleTextureConfig.centerMode === 'dashed') {
        drawDashedVerticalLine(
            ctx,
            centerX,
            styleTextureConfig.centerColor,
            5,
            32,
            24,
            canvas.height
        );
    } else if (styleTextureConfig.centerMode === 'double-solid') {
        drawSolidVerticalLine(ctx, centerX - 6, styleTextureConfig.centerColor, 4, canvas.height);
        drawSolidVerticalLine(
            ctx,
            centerX + 6,
            styleTextureConfig.centerSecondaryColor || styleTextureConfig.centerColor,
            4,
            canvas.height
        );
    }

    ctx.strokeStyle = 'rgba(17, 28, 39, 0.22)';
    ctx.lineCap = 'round';
    for (let i = 0; i < styleTextureConfig.crackCount; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const length = 9 + Math.random() * 28;
        const heading = (Math.random() - 0.5) * Math.PI * 0.45;
        ctx.lineWidth = 0.8 + Math.random() * 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.sin(heading) * length, y + Math.cos(heading) * length);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, styleTextureConfig.repeatV);
    texture.anisotropy = 2;
    return texture;
}

export function createIntersectionTexture({ variant = 'standard' } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const baseGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    baseGradient.addColorStop(0, '#24374a');
    baseGradient.addColorStop(1, '#1b2a39');
    ctx.fillStyle = baseGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 2400; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const value = 60 + Math.random() * 30;
        ctx.fillStyle = `rgba(${value}, ${value + 4}, ${value + 8}, 0.12)`;
        ctx.fillRect(x, y, 2, 2);
    }

    const center = canvas.width * 0.5;
    const laneInset = canvas.width * ROAD_SIDE_LINE_POSITIONS[0];
    const laneOuter = canvas.width * ROAD_SIDE_LINE_POSITIONS[1];
    const cornerRadius = Math.round((laneOuter - laneInset) * 0.2);

    drawIntersectionCornerApron(ctx, {
        size: canvas.width,
        laneInset,
        laneOuter,
        cornerRadius,
    });
    drawRoundedRoadEdgeLoop(ctx, {
        laneInset,
        laneOuter,
        cornerRadius,
        color: 'rgba(226, 238, 251, 0.52)',
        lineWidth: 6,
    });

    if (variant === 'boulevard') {
        drawSolidVerticalLine(ctx, center - 6, 'rgba(255, 198, 112, 0.74)', 3.5, canvas.height);
        drawSolidVerticalLine(ctx, center + 6, 'rgba(255, 225, 168, 0.58)', 3.5, canvas.height);
        ctx.strokeStyle = 'rgba(255, 198, 112, 0.58)';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(0, center - 6);
        ctx.lineTo(canvas.width, center - 6);
        ctx.moveTo(0, center + 6);
        ctx.lineTo(canvas.width, center + 6);
        ctx.stroke();
    } else if (variant === 'charging') {
        drawDashedVerticalLine(ctx, center, 'rgba(179, 236, 255, 0.46)', 3, 24, 20, canvas.height);
        drawDashedHorizontalLine(ctx, center, 'rgba(179, 236, 255, 0.46)', 3, 24, 20, canvas.width);
        drawChargingIntersectionMarkings(ctx, canvas.width, center);
    } else if (variant === 'standard') {
        drawDashedVerticalLine(
            ctx,
            center,
            'rgba(230, 241, 252, 0.52)',
            3.2,
            26,
            20,
            canvas.height
        );
        drawDashedHorizontalLine(
            ctx,
            center,
            'rgba(230, 241, 252, 0.52)',
            3.2,
            26,
            20,
            canvas.width
        );
    } else {
        drawDashedVerticalLine(
            ctx,
            center,
            'rgba(207, 223, 241, 0.38)',
            2.6,
            20,
            24,
            canvas.height
        );
        drawDashedHorizontalLine(
            ctx,
            center,
            'rgba(207, 223, 241, 0.38)',
            2.6,
            20,
            24,
            canvas.width
        );
    }

    if (variant === 'boulevard' || variant === 'standard') {
        drawIntersectionTurnGuides(ctx, {
            laneInset,
            laneOuter,
            cornerRadius,
            color:
                variant === 'boulevard' ? 'rgba(255, 214, 136, 0.42)' : 'rgba(215, 232, 252, 0.32)',
        });
    }

    const shouldDrawCrosswalks = variant === 'boulevard' || variant === 'standard';
    const shouldDrawStopBars = shouldDrawCrosswalks;
    const crosswalkInset = 8;
    const crosswalkDepth = 34;
    const stopBarGap = 10;
    if (shouldDrawCrosswalks) {
        drawIntersectionCrosswalks(
            ctx,
            canvas.width,
            laneInset,
            laneOuter,
            crosswalkInset,
            crosswalkDepth,
            8,
            6
        );
    }
    if (shouldDrawStopBars) {
        drawIntersectionStopBars(
            ctx,
            canvas.width,
            laneInset,
            laneOuter,
            crosswalkInset + crosswalkDepth + stopBarGap
        );
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.anisotropy = 2;
    return texture;
}

export function createParkingLotTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    const baseGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    baseGradient.addColorStop(0, '#23394c');
    baseGradient.addColorStop(1, '#172a3b');
    ctx.fillStyle = baseGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 5200; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const value = 62 + Math.random() * 34;
        ctx.fillStyle = `rgba(${value}, ${value + 3}, ${value + 8}, 0.13)`;
        ctx.fillRect(x, y, 2, 2);
    }

    for (let i = 0; i < 24; i += 1) {
        const radius = 64 + Math.random() * 124;
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const patch = ctx.createRadialGradient(x, y, 0, x, y, radius);
        patch.addColorStop(0, 'rgba(200, 224, 248, 0.06)');
        patch.addColorStop(1, 'rgba(200, 224, 248, 0)');
        ctx.fillStyle = patch;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.strokeStyle = 'rgba(236, 244, 255, 0.42)';
    ctx.lineWidth = 5;
    const perimeterInset = 42;
    ctx.strokeRect(
        perimeterInset,
        perimeterInset,
        canvas.width - perimeterInset * 2,
        canvas.height - perimeterInset * 2
    );

    drawParkingRowMarkings(ctx, {
        xStart: 122,
        xEnd: canvas.width - 122,
        yAnchor: 132,
        bayDepth: 68,
        baySpan: 44,
        gap: 9,
        direction: 'down',
    });
    drawParkingRowMarkings(ctx, {
        xStart: 122,
        xEnd: canvas.width - 122,
        yAnchor: canvas.height - 132,
        bayDepth: 68,
        baySpan: 44,
        gap: 9,
        direction: 'up',
    });
    drawParkingColumnMarkings(ctx, {
        zStart: 220,
        zEnd: canvas.height - 220,
        xAnchor: 122,
        bayDepth: 62,
        baySpan: 40,
        gap: 8,
        direction: 'right',
    });
    drawParkingColumnMarkings(ctx, {
        zStart: 220,
        zEnd: canvas.height - 220,
        xAnchor: canvas.width - 122,
        bayDepth: 62,
        baySpan: 40,
        gap: 8,
        direction: 'left',
    });

    const center = canvas.width * 0.5;
    ctx.strokeStyle = 'rgba(189, 214, 243, 0.26)';
    ctx.lineWidth = 3;
    ctx.setLineDash([24, 18]);
    ctx.beginPath();
    ctx.arc(center, center, 172, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(189, 214, 243, 0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center, center, 236, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(13, 21, 31, 0.33)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 90; i += 1) {
        const radius = 84 + Math.random() * 220;
        const start = Math.random() * Math.PI * 2;
        const sweep = (0.15 + Math.random() * 0.3) * Math.PI;
        ctx.lineWidth = 1.2 + Math.random() * 1.8;
        ctx.beginPath();
        ctx.arc(center, center, radius, start, start + sweep);
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(15, 24, 34, 0.24)';
    for (let i = 0; i < 120; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const length = 8 + Math.random() * 26;
        const heading = Math.random() * Math.PI * 2;
        ctx.lineWidth = 0.8 + Math.random() * 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(heading) * length, y + Math.sin(heading) * length);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1, 1);
    texture.anisotropy = 2;
    return texture;
}

export function createSidewalkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#4a5f78');
    gradient.addColorStop(1, '#41556d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tile = 32;
    ctx.strokeStyle = 'rgba(198, 220, 246, 0.2)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += tile) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += tile) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(canvas.width, y + 0.5);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 12);
    texture.anisotropy = 1;
    return texture;
}

export function createBoundaryTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#314256');
    gradient.addColorStop(1, '#253448');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255, 201, 94, 0.28)';
    const chevronWidth = 52;
    for (let x = -chevronWidth; x < canvas.width + chevronWidth; x += chevronWidth * 2) {
        ctx.beginPath();
        ctx.moveTo(x, canvas.height);
        ctx.lineTo(x + chevronWidth * 0.5, canvas.height * 0.56);
        ctx.lineTo(x + chevronWidth, canvas.height);
        ctx.closePath();
        ctx.fill();
    }

    ctx.strokeStyle = 'rgba(222, 239, 255, 0.23)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height * 0.18);
    ctx.lineTo(canvas.width, canvas.height * 0.18);
    ctx.moveTo(0, canvas.height * 0.82);
    ctx.lineTo(canvas.width, canvas.height * 0.82);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 1);
    texture.anisotropy = 1;
    return texture;
}

export function createBuildingWindowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');

    const facadeGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    facadeGradient.addColorStop(0, '#233046');
    facadeGradient.addColorStop(1, '#172235');
    ctx.fillStyle = facadeGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(122, 162, 210, 0.16)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= canvas.width; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, canvas.height);
        ctx.stroke();
    }

    const cols = 6;
    const rows = 12;
    const marginX = 14;
    const marginY = 12;
    const gapX = 8;
    const gapY = 10;
    const cellW = (canvas.width - marginX * 2 - gapX * (cols - 1)) / cols;
    const cellH = (canvas.height - marginY * 2 - gapY * (rows - 1)) / rows;

    for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
            const px = marginX + x * (cellW + gapX);
            const py = marginY + y * (cellH + gapY);
            const lit = Math.random() < 0.62;

            ctx.fillStyle = lit ? 'rgba(255, 222, 157, 0.92)' : 'rgba(83, 113, 162, 0.21)';
            ctx.fillRect(px, py, cellW, cellH);

            if (lit && Math.random() < 0.2) {
                ctx.fillStyle = 'rgba(176, 226, 255, 0.42)';
                ctx.fillRect(px + 1, py + 1, cellW - 2, Math.max(1, cellH * 0.22));
            }
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.anisotropy = 2;
    return texture;
}

export function createSkyDomeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#3567a6');
    gradient.addColorStop(0.34, '#1c3554');
    gradient.addColorStop(0.7, '#0b1524');
    gradient.addColorStop(1, '#060c17');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const horizonGlow = ctx.createRadialGradient(
        canvas.width * 0.5,
        canvas.height * 0.62,
        18,
        canvas.width * 0.5,
        canvas.height * 0.62,
        canvas.width * 0.68
    );
    horizonGlow.addColorStop(0, 'rgba(120, 186, 255, 0.25)');
    horizonGlow.addColorStop(1, 'rgba(120, 186, 255, 0)');
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 170; i += 1) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * (canvas.height * 0.48);
        const size = 0.7 + Math.random() * 1.6;
        const alpha = 0.18 + Math.random() * 0.35;
        ctx.fillStyle = `rgba(198, 225, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    return texture;
}

function drawSolidVerticalLine(ctx, x, color, lineWidth, height) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
}

function drawSolidHorizontalLine(ctx, y, color, lineWidth, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
}

function drawParkingRowMarkings(
    ctx,
    { xStart, xEnd, yAnchor, bayDepth, baySpan, gap, direction = 'down' }
) {
    ctx.strokeStyle = 'rgba(236, 244, 255, 0.44)';
    ctx.lineWidth = 3;
    const depthSign = direction === 'up' ? -1 : 1;
    const yBase = yAnchor + depthSign * bayDepth;
    ctx.beginPath();
    ctx.moveTo(xStart, yAnchor);
    ctx.lineTo(xEnd, yAnchor);
    ctx.moveTo(xStart, yBase);
    ctx.lineTo(xEnd, yBase);
    ctx.stroke();

    for (let x = xStart; x <= xEnd; x += baySpan + gap) {
        ctx.beginPath();
        ctx.moveTo(x, yAnchor);
        ctx.lineTo(x, yBase);
        ctx.stroke();
    }
}

function drawParkingColumnMarkings(
    ctx,
    { zStart, zEnd, xAnchor, bayDepth, baySpan, gap, direction = 'right' }
) {
    ctx.strokeStyle = 'rgba(236, 244, 255, 0.44)';
    ctx.lineWidth = 3;
    const depthSign = direction === 'left' ? -1 : 1;
    const xBase = xAnchor + depthSign * bayDepth;
    ctx.beginPath();
    ctx.moveTo(xAnchor, zStart);
    ctx.lineTo(xAnchor, zEnd);
    ctx.moveTo(xBase, zStart);
    ctx.lineTo(xBase, zEnd);
    ctx.stroke();

    for (let z = zStart; z <= zEnd; z += baySpan + gap) {
        ctx.beginPath();
        ctx.moveTo(xAnchor, z);
        ctx.lineTo(xBase, z);
        ctx.stroke();
    }
}

function drawDashedVerticalLine(ctx, x, color, lineWidth, dashHeight, dashGap, height) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    for (let y = -dashHeight; y < height + dashHeight; y += dashHeight + dashGap) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + dashHeight);
        ctx.stroke();
    }
}

function drawDashedHorizontalLine(ctx, y, color, lineWidth, dashWidth, dashGap, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    for (let x = -dashWidth; x < width + dashWidth; x += dashWidth + dashGap) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dashWidth, y);
        ctx.stroke();
    }
}

function drawIntersectionCrosswalks(
    ctx,
    size,
    laneInset,
    laneOuter,
    inset,
    stripeLength,
    stripeWidth,
    stripeGap
) {
    ctx.fillStyle = 'rgba(235, 245, 255, 0.62)';
    const stripeStart = laneInset + 4;
    const stripeEnd = laneOuter - 4;

    for (
        let axisOffset = stripeStart;
        axisOffset <= stripeEnd;
        axisOffset += stripeWidth + stripeGap
    ) {
        ctx.fillRect(axisOffset, inset, stripeWidth, stripeLength);
        ctx.fillRect(axisOffset, size - inset - stripeLength, stripeWidth, stripeLength);
        ctx.fillRect(inset, axisOffset, stripeLength, stripeWidth);
        ctx.fillRect(size - inset - stripeLength, axisOffset, stripeLength, stripeWidth);
    }
}

function drawIntersectionStopBars(ctx, size, laneInset, laneOuter, offset) {
    ctx.strokeStyle = 'rgba(230, 242, 255, 0.66)';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(laneInset, offset);
    ctx.lineTo(laneOuter, offset);
    ctx.moveTo(laneInset, size - offset);
    ctx.lineTo(laneOuter, size - offset);
    ctx.moveTo(offset, laneInset);
    ctx.lineTo(offset, laneOuter);
    ctx.moveTo(size - offset, laneInset);
    ctx.lineTo(size - offset, laneOuter);
    ctx.stroke();
}

function drawIntersectionCornerApron(ctx, { size, laneInset, laneOuter, cornerRadius }) {
    ctx.save();
    ctx.fillStyle = 'rgba(122, 142, 166, 0.2)';
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    traceRoundedRectPath(
        ctx,
        laneInset,
        laneInset,
        laneOuter - laneInset,
        laneOuter - laneInset,
        cornerRadius
    );
    ctx.fill('evenodd');
    ctx.restore();
}

function drawRoundedRoadEdgeLoop(
    ctx,
    { laneInset, laneOuter, cornerRadius, color = 'rgba(226, 238, 251, 0.52)', lineWidth = 6 }
) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    traceRoundedRectPath(
        ctx,
        laneInset,
        laneInset,
        laneOuter - laneInset,
        laneOuter - laneInset,
        cornerRadius
    );
    ctx.stroke();
    ctx.restore();
}

function drawIntersectionTurnGuides(
    ctx,
    { laneInset, laneOuter, cornerRadius, color = 'rgba(215, 232, 252, 0.32)' }
) {
    const cornerCenters = [
        { x: laneInset, y: laneInset, start: Math.PI, end: Math.PI * 1.5 },
        { x: laneOuter, y: laneInset, start: Math.PI * 1.5, end: Math.PI * 2 },
        { x: laneOuter, y: laneOuter, start: 0, end: Math.PI * 0.5 },
        { x: laneInset, y: laneOuter, start: Math.PI * 0.5, end: Math.PI },
    ];
    const baseRadius = Math.max(14, Math.round(cornerRadius * 0.75));
    const outerRadius = Math.max(baseRadius + 16, Math.round(cornerRadius * 1.08));

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.3;
    ctx.setLineDash([18, 12]);
    cornerCenters.forEach((corner) => {
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, baseRadius, corner.start, corner.end);
        ctx.stroke();
    });
    ctx.lineWidth = 1.6;
    ctx.setLineDash([10, 11]);
    cornerCenters.forEach((corner) => {
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, outerRadius, corner.start, corner.end);
        ctx.stroke();
    });
    ctx.restore();
}

function traceRoundedRectPath(ctx, x, y, width, height, radius) {
    const safeRadius = Math.max(0, Math.min(radius, width * 0.5, height * 0.5));
    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.arcTo(x + width, y, x + width, y + safeRadius, safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.arcTo(x + width, y + height, x + width - safeRadius, y + height, safeRadius);
    ctx.lineTo(x + safeRadius, y + height);
    ctx.arcTo(x, y + height, x, y + height - safeRadius, safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.arcTo(x, y, x + safeRadius, y, safeRadius);
}

function drawChargingIntersectionMarkings(ctx, size, center) {
    ctx.strokeStyle = 'rgba(160, 232, 255, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(center, center, size * 0.16, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(140, 222, 255, 0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center, center, size * 0.24, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(186, 240, 255, 0.8)';
    ctx.beginPath();
    ctx.moveTo(center - 12, center - 22);
    ctx.lineTo(center + 4, center - 22);
    ctx.lineTo(center - 5, center - 2);
    ctx.lineTo(center + 12, center - 2);
    ctx.lineTo(center - 6, center + 22);
    ctx.lineTo(center - 1, center + 4);
    ctx.lineTo(center - 15, center + 4);
    ctx.closePath();
    ctx.fill();
}
