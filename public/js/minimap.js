export function createMiniMapController(worldBounds) {
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

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(baseSize * dpr);
        canvas.height = Math.round(baseSize * dpr);
        canvas.style.width = `${baseSize}px`;
        canvas.style.height = `${baseSize}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function update(position, rotationY, pickups = []) {
        const width = baseSize;
        const height = baseSize;
        const padding = 16;
        const innerSize = width - padding * 2;
        const rangeX = worldBounds.maxX - worldBounds.minX;
        const rangeZ = worldBounds.maxZ - worldBounds.minZ;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(7, 12, 22, 0.84)';
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = 'rgba(132, 184, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(padding, padding, innerSize, innerSize);

        ctx.strokeStyle = 'rgba(132, 184, 255, 0.25)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i += 1) {
            const offset = (innerSize / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding + offset, padding);
            ctx.lineTo(padding + offset, padding + innerSize);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(padding, padding + offset);
            ctx.lineTo(padding + innerSize, padding + offset);
            ctx.stroke();
        }

        if (pickups.length > 0) {
            const maxDots = 72;
            const step = pickups.length > maxDots ? Math.ceil(pickups.length / maxDots) : 1;

            for (let i = 0; i < pickups.length; i += step) {
                const pickup = pickups[i];
                const normalizedPickupX = (pickup.x - worldBounds.minX) / rangeX;
                const normalizedPickupZ = (pickup.z - worldBounds.minZ) / rangeZ;
                const clampedPickupX = Math.max(0, Math.min(1, normalizedPickupX));
                const clampedPickupZ = Math.max(0, Math.min(1, normalizedPickupZ));
                const pickupPx = padding + clampedPickupX * innerSize;
                const pickupPy = padding + clampedPickupZ * innerSize;

                ctx.globalAlpha = pickup.isTarget ? 0.96 : 0.72;
                ctx.fillStyle = toCssHex(pickup.colorHex);
                ctx.beginPath();
                ctx.arc(pickupPx, pickupPy, pickup.isTarget ? 2.8 : 2.1, 0, Math.PI * 2);
                ctx.fill();

                if (pickup.isTarget) {
                    ctx.globalAlpha = 0.9;
                    ctx.strokeStyle = 'rgba(230, 242, 255, 0.92)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(pickupPx, pickupPy, 4.4, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = 1;
        }

        const normalizedX = (position.x - worldBounds.minX) / rangeX;
        const normalizedZ = (position.z - worldBounds.minZ) / rangeZ;
        const clampedX = Math.max(0, Math.min(1, normalizedX));
        const clampedZ = Math.max(0, Math.min(1, normalizedZ));
        const px = padding + clampedX * innerSize;
        const py = padding + clampedZ * innerSize;

        const forwardX = -Math.sin(rotationY);
        const forwardY = -Math.cos(rotationY);
        const sideX = -forwardY;
        const sideY = forwardX;

        const noseLength = 10;
        const wingLength = 5.8;
        const tailLength = 4.6;

        ctx.fillStyle = '#ff8e7c';
        ctx.beginPath();
        ctx.moveTo(px + forwardX * noseLength, py + forwardY * noseLength);
        ctx.lineTo(px - forwardX * tailLength + sideX * wingLength, py - forwardY * tailLength + sideY * wingLength);
        ctx.lineTo(px - forwardX * tailLength - sideX * wingLength, py - forwardY * tailLength - sideY * wingLength);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(124, 255, 237, 0.95)';
        ctx.beginPath();
        ctx.arc(px, py, 2.8, 0, Math.PI * 2);
        ctx.fill();

        info.textContent = `X ${position.x.toFixed(0)} | Z ${position.z.toFixed(0)} | OBJ ${pickups.length}`;
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
