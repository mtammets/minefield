import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import {
    BATTERY_LOW_HUD_SHOW_THRESHOLD,
    BATTERY_LOW_HUD_HIDE_THRESHOLD,
    BATTERY_CRITICAL_HUD_SHOW_THRESHOLD,
    BATTERY_CRITICAL_HUD_HIDE_THRESHOLD,
    CHARGING_BATTERY_GAIN_PER_SEC,
} from './constants.js';

export function createChargingProgressHudController(scene, camera, options = {}) {
    const vehicle = options.vehicle || null;
    const getBatteryPercent =
        typeof options.getBatteryPercent === 'function' ? options.getBatteryPercent : () => 0;
    const getBatteryNormalized =
        typeof options.getBatteryNormalized === 'function' ? options.getBatteryNormalized : () => 0;
    const lowBatteryShowThreshold = THREE.MathUtils.clamp(
        Number(options.lowBatteryShowThreshold) || BATTERY_LOW_HUD_SHOW_THRESHOLD,
        0.02,
        0.95
    );
    const lowBatteryHideThreshold = THREE.MathUtils.clamp(
        Math.max(
            lowBatteryShowThreshold,
            Number(options.lowBatteryHideThreshold) || BATTERY_LOW_HUD_HIDE_THRESHOLD
        ),
        lowBatteryShowThreshold,
        0.98
    );
    const criticalBatteryShowThreshold = THREE.MathUtils.clamp(
        Number(options.criticalBatteryShowThreshold) || BATTERY_CRITICAL_HUD_SHOW_THRESHOLD,
        0.01,
        lowBatteryHideThreshold
    );
    const criticalBatteryHideThreshold = THREE.MathUtils.clamp(
        Math.max(
            criticalBatteryShowThreshold,
            Number(options.criticalBatteryHideThreshold) || BATTERY_CRITICAL_HUD_HIDE_THRESHOLD
        ),
        criticalBatteryShowThreshold,
        lowBatteryHideThreshold
    );
    const chargingBatteryGainPerSec = Number.isFinite(options.chargingBatteryGainPerSec)
        ? options.chargingBatteryGainPerSec
        : CHARGING_BATTERY_GAIN_PER_SEC;
    const fallback = {
        update() {},
        reset() {},
    };
    if (!scene || !camera || !vehicle) {
        return fallback;
    }

    const root = new THREE.Group();
    root.name = 'charging_progress_hud';
    root.visible = false;
    scene.add(root);

    const haloMaterial = new THREE.MeshBasicMaterial({
        map: createChargingProgressHaloTexture(),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
    });
    const haloMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.95, 2.95), haloMaterial);
    root.add(haloMesh);

    const panelCanvas = document.createElement('canvas');
    panelCanvas.width = 1024;
    panelCanvas.height = 512;
    const panelCtx = panelCanvas.getContext('2d');
    const panelTexture = new THREE.CanvasTexture(panelCanvas);
    panelTexture.colorSpace = THREE.SRGBColorSpace;
    panelTexture.anisotropy = 2;
    const panelMaterial = new THREE.MeshBasicMaterial({
        map: panelTexture,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
    });
    const panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.56, 1.28), panelMaterial);
    panelMesh.position.z = 0.01;
    root.add(panelMesh);

    const state = {
        visibleBlend: 0,
        displayPercent: THREE.MathUtils.clamp(getBatteryPercent(), 0, 100),
        time: Math.random() * 11.7,
        scanPhase: Math.random() * Math.PI * 2,
        lowBatteryReminderActive: false,
        criticalBatteryAlertActive: false,
    };

    drawPanel(state.displayPercent, 0, 0, false, false, false);
    return {
        update(
            deltaTime = 1 / 60,
            { enabled = true, isCharging = false, chargingLevel = 0, batteryDepleted = false } = {}
        ) {
            const dt = Math.min(Math.max(deltaTime || 0, 0), 0.05);
            const charging = THREE.MathUtils.clamp(chargingLevel || 0, 0, 1);
            if (batteryDepleted) {
                state.visibleBlend = 0;
                root.visible = false;
                return;
            }
            const batteryNormalized = THREE.MathUtils.clamp(getBatteryNormalized(), 0, 1);
            if (state.lowBatteryReminderActive) {
                state.lowBatteryReminderActive = batteryNormalized <= lowBatteryHideThreshold;
            } else if (batteryNormalized <= lowBatteryShowThreshold) {
                state.lowBatteryReminderActive = true;
            }
            if (state.criticalBatteryAlertActive) {
                state.criticalBatteryAlertActive =
                    batteryNormalized <= criticalBatteryHideThreshold;
            } else if (batteryNormalized <= criticalBatteryShowThreshold) {
                state.criticalBatteryAlertActive = true;
            }
            const showLowBatteryReminder = enabled && !isCharging && state.lowBatteryReminderActive;
            const targetVisible =
                enabled && !batteryDepleted && (isCharging || showLowBatteryReminder) ? 1 : 0;
            const visibleRate = targetVisible > state.visibleBlend ? 8.8 : 7.2;
            state.visibleBlend = THREE.MathUtils.lerp(
                state.visibleBlend,
                targetVisible,
                1 - Math.exp(-visibleRate * dt)
            );

            if (state.visibleBlend <= 0.002 && targetVisible <= 0) {
                root.visible = false;
                return;
            }

            root.visible = true;
            const targetPercent = THREE.MathUtils.clamp(getBatteryPercent(), 0, 100);
            const numberRate = isCharging ? 5.6 + charging * 9.2 : 4.2;
            state.displayPercent = THREE.MathUtils.lerp(
                state.displayPercent,
                targetPercent,
                1 - Math.exp(-numberRate * dt)
            );
            state.time += dt * (1.2 + charging * 2.6);
            state.scanPhase += dt * (1.6 + charging * 4.2);

            const hoverPulse = 0.5 + 0.5 * Math.sin(state.scanPhase * 1.7);
            const hudHeight = 1.56 + hoverPulse * (0.04 + charging * 0.08);
            root.position.set(
                vehicle.position.x,
                vehicle.position.y + hudHeight,
                vehicle.position.z
            );
            root.quaternion.copy(camera.quaternion);

            const scalePulse = 1 + (0.012 + charging * 0.035) * Math.sin(state.scanPhase * 2.9);
            const baseScale = 0.96 + state.visibleBlend * 0.2;
            root.scale.setScalar(baseScale * scalePulse);

            const haloPulse = 0.5 + 0.5 * Math.sin(state.scanPhase * 2.2);
            const isCriticalBattery = state.criticalBatteryAlertActive;
            haloMaterial.opacity =
                state.visibleBlend *
                (0.12 + charging * (0.28 + haloPulse * 0.24) + (isCriticalBattery ? 0.14 : 0));
            haloMaterial.color.setHex(isCriticalBattery ? 0xff4f5e : 0xffffff);
            haloMesh.rotation.z += dt * (0.08 + charging * 0.42);
            panelMaterial.opacity = state.visibleBlend * (0.52 + charging * 0.36);

            drawPanel(
                state.displayPercent,
                charging,
                state.time,
                isCharging,
                showLowBatteryReminder,
                isCriticalBattery
            );
            panelTexture.needsUpdate = true;
        },
        reset() {
            state.visibleBlend = 0;
            state.lowBatteryReminderActive = false;
            state.criticalBatteryAlertActive = false;
            root.visible = false;
        },
    };

    function drawPanel(
        displayPercent,
        charging,
        time,
        isCharging,
        showLowBatteryReminder,
        isCriticalBattery
    ) {
        const ctx = panelCtx;
        const w = panelCanvas.width;
        const h = panelCanvas.height;
        ctx.clearRect(0, 0, w, h);

        const px = 96;
        const py = 58;
        const pw = w - px * 2;
        const ph = h - py * 2;
        const accentStroke = isCriticalBattery
            ? 'rgba(255, 126, 138, 0.6)'
            : 'rgba(152, 230, 255, 0.45)';
        const scanMidColor = isCriticalBattery
            ? `rgba(255, 116, 130, ${0.16 + charging * 0.2})`
            : `rgba(146, 239, 255, ${0.08 + charging * 0.16})`;
        const bigTextColor = isCriticalBattery
            ? 'rgba(255, 219, 223, 0.99)'
            : 'rgba(224, 252, 255, 0.98)';
        const smallTextColor = isCriticalBattery
            ? 'rgba(255, 176, 186, 0.97)'
            : 'rgba(173, 239, 255, 0.95)';
        const textShadow = isCriticalBattery
            ? 'rgba(255, 92, 112, 0.88)'
            : 'rgba(132, 231, 255, 0.85)';
        const barBgColor = isCriticalBattery ? 'rgba(58, 10, 20, 0.94)' : 'rgba(8, 32, 58, 0.92)';
        const barStrokeColor = isCriticalBattery
            ? 'rgba(255, 136, 148, 0.76)'
            : 'rgba(155, 233, 255, 0.7)';
        const tickerTextColor = isCriticalBattery
            ? 'rgba(255, 182, 190, 0.94)'
            : 'rgba(172, 240, 255, 0.9)';
        drawRoundedRect(ctx, px, py, pw, ph, 42);

        const panelGradient = ctx.createLinearGradient(px, py, px + pw, py + ph);
        if (isCriticalBattery) {
            panelGradient.addColorStop(0, 'rgba(56, 10, 20, 0.86)');
            panelGradient.addColorStop(0.52, 'rgba(42, 8, 16, 0.8)');
            panelGradient.addColorStop(1, 'rgba(31, 6, 13, 0.86)');
        } else {
            panelGradient.addColorStop(0, 'rgba(7, 24, 46, 0.84)');
            panelGradient.addColorStop(0.52, 'rgba(4, 18, 36, 0.78)');
            panelGradient.addColorStop(1, 'rgba(3, 16, 30, 0.84)');
        }
        ctx.fillStyle = panelGradient;
        ctx.fill();

        ctx.lineWidth = 3;
        ctx.strokeStyle = accentStroke;
        ctx.stroke();

        const scanY = py + ((time * 120) % ph);
        const scanGradient = ctx.createLinearGradient(px, scanY - 24, px, scanY + 24);
        if (isCriticalBattery) {
            scanGradient.addColorStop(0, 'rgba(255, 121, 135, 0)');
            scanGradient.addColorStop(0.5, scanMidColor);
            scanGradient.addColorStop(1, 'rgba(255, 121, 135, 0)');
        } else {
            scanGradient.addColorStop(0, 'rgba(126, 231, 255, 0)');
            scanGradient.addColorStop(0.5, scanMidColor);
            scanGradient.addColorStop(1, 'rgba(126, 231, 255, 0)');
        }
        ctx.fillStyle = scanGradient;
        ctx.fillRect(px + 10, scanY - 24, pw - 20, 48);

        const batteryLevel = THREE.MathUtils.clamp(getBatteryNormalized(), 0, 1);
        const bigPercentText = `${Math.round(displayPercent)}%`;
        const subText = isCharging
            ? `LAADIMINE +${chargingBatteryGainPerSec.toFixed(1)}%/s`
            : isCriticalBattery
              ? 'CRITICAL BATTERY - CHARGE NOW'
              : showLowBatteryReminder
                ? 'LOW BATTERY - DRIVE TO CHARGER'
                : 'LAADIMISE OOTEL';

        ctx.textAlign = 'center';
        ctx.shadowColor = textShadow;
        ctx.shadowBlur = 28 + charging * 16 + (isCriticalBattery ? 10 : 0);
        ctx.fillStyle = bigTextColor;
        ctx.font = '800 122px "Orbitron", "Trebuchet MS", sans-serif';
        ctx.fillText(bigPercentText, w * 0.5, py + 168);

        ctx.shadowBlur = 10;
        ctx.fillStyle = smallTextColor;
        ctx.font = '700 32px "Orbitron", "Trebuchet MS", sans-serif';
        ctx.fillText(subText, w * 0.5, py + 216);

        const barX = px + 92;
        const barY = py + 250;
        const barW = pw - 184;
        const barH = 36;
        drawRoundedRect(ctx, barX, barY, barW, barH, 18);
        ctx.fillStyle = barBgColor;
        ctx.fill();

        const fillW = Math.max(0, Math.min(barW, barW * batteryLevel));
        if (fillW > 0) {
            drawRoundedRect(ctx, barX, barY, fillW, barH, 18);
            const fillGradient = ctx.createLinearGradient(barX, barY, barX + fillW, barY + barH);
            if (isCriticalBattery) {
                fillGradient.addColorStop(0, 'rgba(255, 94, 111, 0.86)');
                fillGradient.addColorStop(0.5, 'rgba(255, 170, 180, 0.98)');
                fillGradient.addColorStop(1, 'rgba(255, 106, 122, 0.9)');
            } else {
                fillGradient.addColorStop(0, 'rgba(112, 228, 255, 0.82)');
                fillGradient.addColorStop(0.5, 'rgba(186, 250, 255, 0.98)');
                fillGradient.addColorStop(1, 'rgba(120, 232, 255, 0.88)');
            }
            ctx.fillStyle = fillGradient;
            ctx.fill();
        }

        ctx.lineWidth = 2;
        ctx.strokeStyle = barStrokeColor;
        ctx.stroke();
        ctx.shadowBlur = 0;

        const tickerValues = [];
        for (let i = 0; i < 8; i += 1) {
            const v = THREE.MathUtils.clamp(
                displayPercent + (i - 3.5) * 0.9 + Math.sin(time * 2.6 + i * 0.86) * 1.35,
                0,
                100
            );
            tickerValues.push(`${v.toFixed(1)}%`);
        }
        const tickerText = tickerValues.join('    ');
        ctx.save();
        const tickerX = px + 92;
        const tickerY = py + 332;
        const tickerW = pw - 184;
        const tickerH = 44;
        drawRoundedRect(ctx, tickerX, tickerY - 30, tickerW, tickerH, 14);
        ctx.clip();
        ctx.font = '700 24px "Orbitron", "Trebuchet MS", sans-serif';
        ctx.fillStyle = tickerTextColor;
        const textW = ctx.measureText(tickerText).width + 80;
        const offset = (time * (130 + charging * 150)) % textW;
        const startX = tickerX + 14 - offset;
        ctx.fillText(tickerText, startX, tickerY);
        ctx.fillText(tickerText, startX + textW, tickerY);
        ctx.restore();
    }

    function drawRoundedRect(ctx, x, y, width, height, radius) {
        const r = Math.min(radius, width * 0.5, height * 0.5);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r);
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y, x + width, y, r);
        ctx.closePath();
    }
}

function createChargingProgressHaloTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const outer = ctx.createRadialGradient(cx, cy, 0, cx, cy, 340);
    outer.addColorStop(0, 'rgba(178, 244, 255, 0.36)');
    outer.addColorStop(0.56, 'rgba(118, 225, 255, 0.12)');
    outer.addColorStop(1, 'rgba(118, 225, 255, 0)');
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.arc(cx, cy, 340, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(200, 251, 255, 0.88)';
    ctx.shadowColor = 'rgba(103, 220, 255, 0.9)';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.arc(cx, cy, 248, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    return texture;
}

export function createChargingZoneController(scene, chargingZones = [], options = {}) {
    const activationDelaySec = Math.max(0.2, Number(options.activationDelaySec) || 2);
    const chargingSurfaceOffset = Math.max(0.02, Number(options.surfaceOffset) || 0.12);
    const sampleGroundHeight =
        typeof options.sampleGroundHeight === 'function' ? options.sampleGroundHeight : () => 0;
    const fallbackState = {
        startedThisFrame: false,
        isChargingActive: false,
        visualLevel: 0,
    };

    if (!scene || !Array.isArray(chargingZones) || chargingZones.length === 0) {
        return {
            update() {
                return fallbackState;
            },
            reset() {},
            getVisualLevel() {
                return 0;
            },
        };
    }

    const layer = new THREE.Group();
    layer.name = 'charging_zone_fx_layer';
    scene.add(layer);

    const padTexture = createChargingPadTexture();
    const sweepTexture = createChargingSweepTexture();
    const pulseTexture = createChargingPulseTexture();
    const sparkTexture = createChargingSparkTexture();
    const symbolTexture = createChargingZoneSymbolTexture();
    const zoneVisuals = chargingZones.map((zone, index) => {
        const radius = Math.max(1.2, Number(zone.radius) || 2.45);
        const coreRadius = radius * 0.86;
        const zoneBaseY = Number.isFinite(zone.y) ? zone.y : sampleGroundHeight(zone.x, zone.z);
        const anchorY = zoneBaseY + chargingSurfaceOffset;

        const zoneGroup = new THREE.Group();
        zoneGroup.position.set(zone.x, anchorY, zone.z);
        zoneGroup.visible = true;
        layer.add(zoneGroup);

        const padMaterial = new THREE.MeshBasicMaterial({
            map: padTexture,
            transparent: true,
            opacity: 0.05,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            toneMapped: false,
            fog: false,
        });
        const pad = new THREE.Mesh(
            new THREE.PlaneGeometry(radius * 2.74, radius * 2.74),
            padMaterial
        );
        pad.rotation.x = -Math.PI / 2;
        zoneGroup.add(pad);

        const innerMaterial = new THREE.MeshBasicMaterial({
            map: pulseTexture,
            transparent: true,
            opacity: 0.06,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            toneMapped: false,
            fog: false,
        });
        const inner = new THREE.Mesh(
            new THREE.PlaneGeometry(coreRadius * 2.12, coreRadius * 2.12),
            innerMaterial
        );
        inner.rotation.x = -Math.PI / 2;
        inner.position.y = 0.0035;
        zoneGroup.add(inner);

        const sweepMaterial = new THREE.MeshBasicMaterial({
            map: sweepTexture,
            transparent: true,
            opacity: 0.08,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            toneMapped: false,
            fog: false,
        });
        const sweep = new THREE.Mesh(
            new THREE.PlaneGeometry(radius * 2.7, radius * 2.7),
            sweepMaterial
        );
        sweep.rotation.x = -Math.PI / 2;
        sweep.position.y = 0.0062;
        zoneGroup.add(sweep);

        const counterSweepMaterial = new THREE.MeshBasicMaterial({
            map: sweepTexture,
            transparent: true,
            opacity: 0.04,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            toneMapped: false,
            fog: false,
        });
        const counterSweep = new THREE.Mesh(
            new THREE.PlaneGeometry(radius * 2.45, radius * 2.45),
            counterSweepMaterial
        );
        counterSweep.rotation.x = -Math.PI / 2;
        counterSweep.position.y = 0.0067;
        counterSweep.scale.set(0.98, 0.98, 1);
        zoneGroup.add(counterSweep);

        const pulseMaterial = new THREE.MeshBasicMaterial({
            map: pulseTexture,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            toneMapped: false,
            fog: false,
        });
        const pulse = new THREE.Mesh(
            new THREE.PlaneGeometry(coreRadius * 1.7, coreRadius * 1.7),
            pulseMaterial
        );
        pulse.rotation.x = -Math.PI / 2;
        pulse.position.y = 0.007;
        zoneGroup.add(pulse);

        const sparkMaterial = new THREE.MeshBasicMaterial({
            map: sparkTexture,
            transparent: true,
            opacity: 0.02,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            toneMapped: false,
            fog: false,
        });
        const spark = new THREE.Mesh(
            new THREE.PlaneGeometry(radius * 2.46, radius * 2.46),
            sparkMaterial
        );
        spark.rotation.x = -Math.PI / 2;
        spark.position.y = 0.0076;
        zoneGroup.add(spark);

        const symbolMaterial = new THREE.MeshBasicMaterial({
            map: symbolTexture,
            transparent: true,
            opacity: 0.12,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            toneMapped: false,
            fog: false,
        });
        const symbol = new THREE.Mesh(
            new THREE.PlaneGeometry(coreRadius * 1.26, coreRadius * 1.26),
            symbolMaterial
        );
        symbol.rotation.x = -Math.PI / 2;
        symbol.position.y = 0.008;
        zoneGroup.add(symbol);

        return {
            index,
            x: zone.x,
            z: zone.z,
            radius,
            pad,
            inner,
            sweep,
            counterSweep,
            pulse,
            spark,
            zoneGroup,
            symbol,
            symbolYaw: Math.random() * Math.PI * 2,
            sweepYaw: Math.random() * Math.PI * 2,
            counterSweepYaw: Math.random() * Math.PI * 2,
            sparkYaw: Math.random() * Math.PI * 2,
        };
    });

    const state = {
        insideZoneIndex: -1,
        insideTimer: 0,
        isCharging: false,
        visualLevel: 0,
        pulsePhase: Math.random() * Math.PI * 2,
    };
    const snapshot = {
        startedThisFrame: false,
        isChargingActive: false,
        visualLevel: 0,
    };

    applyVisuals(0, 0, -1, 0);

    return {
        update(playerPosition, deltaTime = 1 / 60, { enabled = true } = {}) {
            const dt = Math.min(Math.max(deltaTime || 0, 0), 0.05);
            snapshot.startedThisFrame = false;

            if (!enabled || !playerPosition) {
                state.insideZoneIndex = -1;
                state.insideTimer = 0;
                state.isCharging = false;
            } else {
                const insideZoneIndex = findInsideZoneIndex(playerPosition.x, playerPosition.z);
                if (insideZoneIndex >= 0) {
                    if (insideZoneIndex !== state.insideZoneIndex) {
                        state.insideZoneIndex = insideZoneIndex;
                        state.insideTimer = 0;
                        state.isCharging = false;
                    } else {
                        state.insideTimer += dt;
                    }
                    if (!state.isCharging && state.insideTimer >= activationDelaySec) {
                        state.isCharging = true;
                        snapshot.startedThisFrame = true;
                    }
                } else {
                    state.insideZoneIndex = -1;
                    state.insideTimer = 0;
                    state.isCharging = false;
                }
            }

            const targetVisual = state.isCharging ? 1 : 0;
            const visualRate = targetVisual > state.visualLevel ? 8.2 : 4.6;
            state.visualLevel = THREE.MathUtils.lerp(
                state.visualLevel,
                targetVisual,
                1 - Math.exp(-visualRate * dt)
            );
            state.pulsePhase += dt * (2 + state.visualLevel * 4.8);

            const activationProgress =
                state.insideZoneIndex >= 0
                    ? THREE.MathUtils.clamp(state.insideTimer / activationDelaySec, 0, 1)
                    : 0;
            applyVisuals(state.visualLevel, activationProgress, state.insideZoneIndex, dt);

            snapshot.isChargingActive = state.isCharging && state.insideZoneIndex >= 0;
            snapshot.visualLevel = state.visualLevel;
            return snapshot;
        },
        reset() {
            state.insideZoneIndex = -1;
            state.insideTimer = 0;
            state.isCharging = false;
            state.visualLevel = 0;
            applyVisuals(0, 0, -1, 0);
            snapshot.startedThisFrame = false;
            snapshot.isChargingActive = false;
            snapshot.visualLevel = 0;
        },
        getVisualLevel() {
            return state.visualLevel;
        },
    };

    function findInsideZoneIndex(x, z) {
        let insideIndex = -1;
        let nearestDistanceSq = Number.POSITIVE_INFINITY;
        for (let i = 0; i < zoneVisuals.length; i += 1) {
            const zone = zoneVisuals[i];
            const dx = x - zone.x;
            const dz = z - zone.z;
            const distanceSq = dx * dx + dz * dz;
            if (distanceSq > zone.radius * zone.radius) {
                continue;
            }
            if (distanceSq < nearestDistanceSq) {
                nearestDistanceSq = distanceSq;
                insideIndex = i;
            }
        }
        return insideIndex;
    }

    function applyVisuals(activeLevel, activationProgress, insideZoneIndex, dt) {
        for (let i = 0; i < zoneVisuals.length; i += 1) {
            const zone = zoneVisuals[i];
            if (!zone.zoneGroup.visible) {
                continue;
            }
            const isInside = i === insideZoneIndex;
            const prep = isInside ? activationProgress : 0;
            const pulse = 0.5 + 0.5 * Math.sin(state.pulsePhase + zone.index * 0.82);
            const fastPulse = 0.5 + 0.5 * Math.sin(state.pulsePhase * 1.72 + zone.index * 1.37);
            const prepEase = prep * prep * (3 - 2 * prep);
            const zoneActiveLevel = isInside ? activeLevel : 0;
            const idleLevel = 1;

            zone.pad.material.opacity =
                0.045 +
                idleLevel * 0.12 +
                prepEase * 0.14 +
                zoneActiveLevel * (0.18 + pulse * 0.24);
            zone.pad.scale.setScalar(
                1 + idleLevel * 0.016 + zoneActiveLevel * (0.02 + fastPulse * 0.04)
            );

            zone.inner.material.opacity =
                0.04 + idleLevel * 0.11 + prepEase * 0.2 + zoneActiveLevel * (0.2 + pulse * 0.3);
            zone.inner.scale.setScalar(
                1 + idleLevel * 0.015 + zoneActiveLevel * (0.04 + fastPulse * 0.07)
            );

            zone.sweep.material.opacity =
                0.03 + idleLevel * 0.1 + prepEase * 0.17 + zoneActiveLevel * (0.16 + pulse * 0.26);
            zone.counterSweep.material.opacity =
                0.015 +
                idleLevel * 0.07 +
                prepEase * 0.09 +
                zoneActiveLevel * (0.1 + fastPulse * 0.2);
            zone.spark.material.opacity =
                idleLevel * 0.035 + prepEase * 0.06 + zoneActiveLevel * (0.08 + fastPulse * 0.3);

            const rippleTravel =
                (state.pulsePhase * (0.11 + zoneActiveLevel * 0.16) + zone.index * 0.07) % 1;
            zone.pulse.material.opacity =
                idleLevel * (0.025 + pulse * 0.03) +
                zoneActiveLevel * (0.16 + (1 - rippleTravel) * 0.38 + pulse * 0.12);
            zone.pulse.scale.setScalar(
                0.84 + idleLevel * 0.07 + rippleTravel * (0.64 + zoneActiveLevel * 0.82)
            );

            zone.symbolYaw += (0.12 + zoneActiveLevel * 1.55) * dt;
            zone.sweepYaw += (0.26 + zoneActiveLevel * 2.5) * dt;
            zone.counterSweepYaw -= (0.14 + zoneActiveLevel * 1.6) * dt;
            zone.sparkYaw -= (0.22 + zoneActiveLevel * 3.2) * dt;
            zone.sweep.rotation.z = zone.sweepYaw;
            zone.counterSweep.rotation.z = zone.counterSweepYaw;
            zone.spark.rotation.z = zone.sparkYaw;
            zone.symbol.material.opacity =
                0.12 + idleLevel * 0.12 + prepEase * 0.26 + zoneActiveLevel * (0.26 + pulse * 0.26);
            zone.symbol.rotation.z = zone.symbolYaw;
        }
    }
}

function createChargingZoneSymbolTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    const haloGradient = ctx.createRadialGradient(cx, cy, 12, cx, cy, 190);
    haloGradient.addColorStop(0, 'rgba(201, 248, 255, 0.3)');
    haloGradient.addColorStop(0.6, 'rgba(133, 224, 250, 0.1)');
    haloGradient.addColorStop(1, 'rgba(133, 224, 250, 0)');
    ctx.fillStyle = haloGradient;
    ctx.beginPath();
    ctx.arc(cx, cy, 190, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(180, 246, 255, 0.95)';
    ctx.shadowColor = 'rgba(90, 220, 255, 0.9)';
    ctx.shadowBlur = 18;
    ctx.lineCap = 'round';
    ctx.lineWidth = 14;

    const arcs = [
        { radius: 74, start: Math.PI * 1.14, end: Math.PI * 1.86 },
        { radius: 116, start: Math.PI * 1.2, end: Math.PI * 1.8 },
    ];
    for (let i = 0; i < arcs.length; i += 1) {
        const arc = arcs[i];
        ctx.beginPath();
        ctx.arc(cx, cy, arc.radius, arc.start, arc.end);
        ctx.stroke();
    }

    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 88);
    ctx.lineTo(cx, cy + 6);
    ctx.stroke();

    ctx.fillStyle = 'rgba(217, 253, 255, 0.98)';
    ctx.beginPath();
    ctx.arc(cx, cy + 114, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function createChargingPadTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const softHalo = ctx.createRadialGradient(cx, cy, 0, cx, cy, 492);
    softHalo.addColorStop(0, 'rgba(188, 248, 255, 0.36)');
    softHalo.addColorStop(0.45, 'rgba(126, 226, 255, 0.15)');
    softHalo.addColorStop(0.78, 'rgba(126, 226, 255, 0.06)');
    softHalo.addColorStop(1, 'rgba(126, 226, 255, 0)');
    ctx.fillStyle = softHalo;
    ctx.beginPath();
    ctx.arc(cx, cy, 492, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(199, 251, 255, 0.9)';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(109, 228, 255, 0.9)';
    ctx.shadowBlur = 30;
    ctx.lineWidth = 28;
    ctx.beginPath();
    ctx.arc(cx, cy, 334, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(166, 236, 255, 0.78)';
    ctx.beginPath();
    ctx.arc(cx, cy, 252, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0;
    for (let i = 0; i < 52; i += 1) {
        const angle = (i / 52) * Math.PI * 2;
        const radius = 392;
        const dotX = cx + Math.cos(angle) * radius;
        const dotY = cy + Math.sin(angle) * radius;
        const alpha = 0.05 + (i % 4 === 0 ? 0.1 : 0.02);
        ctx.fillStyle = `rgba(173, 236, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(dotX, dotY, i % 4 === 0 ? 2.4 : 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    for (let i = 0; i < 34; i += 1) {
        const angle = (i / 34) * Math.PI * 2;
        const innerRadius = 280;
        const outerRadius = 310;
        const x1 = cx + Math.cos(angle) * innerRadius;
        const y1 = cy + Math.sin(angle) * innerRadius;
        const x2 = cx + Math.cos(angle) * outerRadius;
        const y2 = cy + Math.sin(angle) * outerRadius;
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(195, 250, 255, 0.12)' : 'rgba(168, 237, 255, 0.06)';
        ctx.lineWidth = i % 2 === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function createChargingSweepTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(194, 250, 255, 0.98)';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(111, 225, 255, 0.96)';
    ctx.shadowBlur = 24;
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.arc(cx, cy, 326, THREE.MathUtils.degToRad(-34), THREE.MathUtils.degToRad(38));
    ctx.stroke();

    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(160, 238, 255, 0.88)';
    ctx.beginPath();
    ctx.arc(cx, cy, 262, THREE.MathUtils.degToRad(-46), THREE.MathUtils.degToRad(52));
    ctx.stroke();

    ctx.shadowBlur = 0;
    const beamGradient = ctx.createLinearGradient(cx - 250, cy - 34, cx + 250, cy + 34);
    beamGradient.addColorStop(0, 'rgba(175, 246, 255, 0)');
    beamGradient.addColorStop(0.3, 'rgba(175, 246, 255, 0.24)');
    beamGradient.addColorStop(0.5, 'rgba(213, 253, 255, 0.88)');
    beamGradient.addColorStop(0.7, 'rgba(175, 246, 255, 0.24)');
    beamGradient.addColorStop(1, 'rgba(175, 246, 255, 0)');
    ctx.fillStyle = beamGradient;
    ctx.fillRect(cx - 250, cy - 28, 500, 56);

    for (let i = 0; i < 8; i += 1) {
        const t = i / 7;
        const angle = THREE.MathUtils.degToRad(-24 + t * 46);
        const x1 = cx + Math.cos(angle) * 242;
        const y1 = cy + Math.sin(angle) * 242;
        const x2 = cx + Math.cos(angle) * 350;
        const y2 = cy + Math.sin(angle) * 350;
        ctx.strokeStyle = `rgba(196, 251, 255, ${0.2 + (1 - Math.abs(t - 0.5) * 2) * 0.16})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function createChargingPulseTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const ringGlow = ctx.createRadialGradient(cx, cy, 96, cx, cy, 312);
    ringGlow.addColorStop(0, 'rgba(154, 234, 255, 0)');
    ringGlow.addColorStop(0.48, 'rgba(178, 245, 255, 0.28)');
    ringGlow.addColorStop(0.65, 'rgba(208, 252, 255, 0.58)');
    ringGlow.addColorStop(0.78, 'rgba(154, 234, 255, 0.2)');
    ringGlow.addColorStop(1, 'rgba(154, 234, 255, 0)');
    ctx.fillStyle = ringGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, 312, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function createChargingSparkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 74; i += 1) {
        const angle = (i / 74) * Math.PI * 2;
        const radius = 238 + ((i * 53) % 104);
        const sparkRadius = i % 6 === 0 ? 4.6 : 2.2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        const alpha = i % 6 === 0 ? 0.32 : 0.16;
        ctx.fillStyle = `rgba(201, 251, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, sparkRadius, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.strokeStyle = 'rgba(195, 250, 255, 0.34)';
    ctx.shadowColor = 'rgba(110, 229, 255, 0.6)';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 292, THREE.MathUtils.degToRad(-22), THREE.MathUtils.degToRad(36));
    ctx.stroke();
    ctx.shadowBlur = 0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}
