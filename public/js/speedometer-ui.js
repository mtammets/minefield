export function createSpeedometerController() {
    if (typeof document === 'undefined' || !document.body) {
        return createNoopSpeedometerController();
    }

    const rootEl = document.createElement('aside');
    rootEl.id = 'speedometerHud';
    rootEl.setAttribute('aria-label', 'Speedometer');
    rootEl.setAttribute('aria-hidden', 'true');
    rootEl.hidden = true;
    rootEl.innerHTML = `
        <div class="speedometerShell">
            <svg class="speedometerDial" viewBox="0 0 320 220" aria-hidden="true">
                <defs>
                    <linearGradient id="speedometerArcGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="rgba(118, 196, 255, 0.72)" />
                        <stop offset="50%" stop-color="rgba(174, 231, 255, 0.98)" />
                        <stop offset="100%" stop-color="rgba(255, 159, 120, 0.9)" />
                    </linearGradient>
                    <linearGradient id="speedometerNeedleGradient" x1="0%" y1="100%" x2="0%" y2="0%">
                        <stop offset="0%" stop-color="#ff755f" />
                        <stop offset="100%" stop-color="#fff4ef" />
                    </linearGradient>
                </defs>
                <path
                    class="speedometerArcTrack"
                    d="M 58 176 A 102 102 0 0 1 262 176"
                    pathLength="100"
                />
                <path
                    class="speedometerArcGlow"
                    d="M 58 176 A 102 102 0 0 1 262 176"
                    pathLength="100"
                    data-speedometer-progress-glow
                />
                <path
                    class="speedometerArcProgress"
                    d="M 58 176 A 102 102 0 0 1 262 176"
                    pathLength="100"
                    data-speedometer-progress
                />
                <g class="speedometerTicks">
                    ${createTickMarkup()}
                </g>
                <g class="speedometerNeedleGroup" data-speedometer-needle>
                    <line class="speedometerNeedleShadow" x1="160" y1="176" x2="160" y2="90" />
                    <line class="speedometerNeedle" x1="160" y1="176" x2="160" y2="92" />
                </g>
                <circle class="speedometerNeedleCapRing" cx="160" cy="176" r="13" />
                <circle class="speedometerNeedleCap" cx="160" cy="176" r="7" />
                <text class="speedometerDialLabel speedometerDialLabel--left" x="58" y="196">0</text>
                <text class="speedometerDialLabel speedometerDialLabel--mid" x="160" y="56">
                    120
                </text>
                <text class="speedometerDialLabel speedometerDialLabel--right" x="262" y="196">
                    240
                </text>
            </svg>
            <div class="speedometerReadout">
                <div class="speedometerKicker">Velocity</div>
                <div class="speedometerValue" data-speedometer-speed>000</div>
                <div class="speedometerMetaRow">
                    <span class="speedometerUnit">KM/H</span>
                    <span class="speedometerGear" data-speedometer-gear>N</span>
                    <span class="speedometerDriveMode">AUTO</span>
                </div>
            </div>
        </div>
    `;
    document.body.append(rootEl);

    const progressEl = rootEl.querySelector('[data-speedometer-progress]');
    const progressGlowEl = rootEl.querySelector('[data-speedometer-progress-glow]');
    const needleEl = rootEl.querySelector('[data-speedometer-needle]');
    const speedValueEl = rootEl.querySelector('[data-speedometer-speed]');
    const gearValueEl = rootEl.querySelector('[data-speedometer-gear]');

    const state = {
        visible: false,
        displaySpeedKph: 0,
    };

    return {
        update(frameState = {}) {
            const shouldShow = Boolean(frameState.visible) && !frameState.paused;
            syncVisibility(shouldShow);

            const deltaTime = clampNumber(frameState.deltaTime, 0, 0.08, 1 / 60);
            const targetSpeedKph = clampNumber(frameState.speedKph, 0, 240, 0);
            const smoothing = shouldShow ? Math.min(1, deltaTime * 10) : 1;
            state.displaySpeedKph += (targetSpeedKph - state.displaySpeedKph) * smoothing;
            if (!shouldShow) {
                state.displaySpeedKph = 0;
            }

            const progress = clampNumber(state.displaySpeedKph / 240, 0, 1, 0);
            const angleDeg = -90 + progress * 180;
            const speedDisplay = String(Math.round(state.displaySpeedKph))
                .padStart(3, '0')
                .slice(-3);
            const gearLabel = resolveGearLabel(frameState);
            const tone = resolveTone(frameState, targetSpeedKph);
            const motion =
                frameState.rawSpeedMps < -0.6 ? 'reverse' : targetSpeedKph > 1 ? 'drive' : 'idle';

            rootEl.dataset.tone = tone;
            rootEl.dataset.motion = motion;
            if (progressEl) {
                progressEl.style.strokeDasharray = `${(progress * 100).toFixed(2)} 100`;
            }
            if (progressGlowEl) {
                progressGlowEl.style.strokeDasharray = `${(progress * 100).toFixed(2)} 100`;
            }
            if (needleEl) {
                needleEl.style.transform = `rotate(${angleDeg.toFixed(2)}deg)`;
            }
            if (speedValueEl) {
                speedValueEl.textContent = speedDisplay;
            }
            if (gearValueEl) {
                gearValueEl.textContent = gearLabel;
            }
        },
        dispose() {
            rootEl.remove();
        },
    };

    function syncVisibility(nextVisible) {
        if (nextVisible === state.visible) {
            return;
        }

        state.visible = nextVisible;
        if (nextVisible) {
            rootEl.hidden = false;
            rootEl.setAttribute('aria-hidden', 'false');
            requestAnimationFrame(() => {
                rootEl.classList.add('is-visible');
            });
            return;
        }

        rootEl.classList.remove('is-visible');
        rootEl.hidden = true;
        rootEl.setAttribute('aria-hidden', 'true');
    }
}

function createTickMarkup() {
    const cx = 160;
    const cy = 176;
    const tickCount = 25;
    const lines = [];

    for (let index = 0; index < tickCount; index += 1) {
        const t = tickCount <= 1 ? 0 : index / (tickCount - 1);
        const angle = Math.PI - t * Math.PI;
        const major = index % 6 === 0;
        const outerRadius = 105;
        const innerRadius = major ? 77 : 86;
        const x1 = cx + Math.cos(angle) * innerRadius;
        const y1 = cy + Math.sin(angle) * innerRadius;
        const x2 = cx + Math.cos(angle) * outerRadius;
        const y2 = cy + Math.sin(angle) * outerRadius;
        lines.push(
            `<line class="speedometerTick${major ? ' speedometerTick--major' : ''}" x1="${x1.toFixed(
                1
            )}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" />`
        );
    }

    return lines.join('');
}

function resolveGearLabel(frameState = {}) {
    if (frameState.destroyed) {
        return 'X';
    }

    const rawSpeedMps = Number(frameState.rawSpeedMps) || 0;
    const throttle = Number(frameState.throttle) || 0;
    if (rawSpeedMps < -0.6 || throttle < -0.08) {
        return 'R';
    }
    if (Math.abs(rawSpeedMps) < 0.35 && Math.abs(throttle) < 0.06) {
        return 'N';
    }

    const gearIndex = Math.max(0, Math.floor(Number(frameState.gearIndex) || 0));
    return String(gearIndex + 1);
}

function resolveTone(frameState = {}, speedKph = 0) {
    if (frameState.destroyed) {
        return 'destroyed';
    }
    if (frameState.batteryDepleted) {
        return 'critical';
    }
    if (speedKph >= 160) {
        return 'attack';
    }
    if (speedKph >= 90) {
        return 'charged';
    }
    return 'ready';
}

function clampNumber(value, min, max, fallback = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
}

function createNoopSpeedometerController() {
    return {
        update() {},
        dispose() {},
    };
}
