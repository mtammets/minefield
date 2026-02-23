export function createObjectiveUiController({
    toCssHex,
    colorNameFromHex,
    statusDefaultText,
    isCarDestroyed,
} = {}) {
    const swatchEl = document.getElementById('targetColorSwatch');
    const colorNameEl = document.getElementById('targetColorName');
    const statusEl = document.getElementById('objectiveStatus');
    let statusTimer = null;
    let statusLocked = false;

    if (!swatchEl || !colorNameEl || !statusEl) {
        return {
            setTargetColor() {},
            flashCorrect() {},
            showFailure() {},
            showCrash() {},
            showInfo() {},
            showResult() {},
            resetStatus() {},
        };
    }

    return {
        setTargetColor(colorHex) {
            swatchEl.style.background = toCssHex(colorHex);
            colorNameEl.textContent = colorNameFromHex(colorHex);
        },
        flashCorrect(colorHex, contextOrBattery = null) {
            const batteryPercent =
                typeof contextOrBattery === 'number'
                    ? contextOrBattery
                    : Number.isFinite(contextOrBattery?.batteryPercent)
                      ? contextOrBattery.batteryPercent
                      : null;
            const pointsAwarded =
                typeof contextOrBattery === 'object' && contextOrBattery
                    ? Math.max(0, Math.round(Number(contextOrBattery.pointsAwarded) || 0))
                    : 0;
            const comboMultiplier =
                typeof contextOrBattery === 'object' && contextOrBattery
                    ? Math.max(1, Number(contextOrBattery.comboMultiplier) || 1)
                    : 1;
            const comboCount =
                typeof contextOrBattery === 'object' && contextOrBattery
                    ? Math.max(0, Math.round(Number(contextOrBattery.comboCount) || 0))
                    : 0;
            const riskBonus =
                typeof contextOrBattery === 'object' && contextOrBattery
                    ? Math.max(0, Number(contextOrBattery.riskBonus) || 0)
                    : 0;
            const endgameBonus =
                typeof contextOrBattery === 'object' && contextOrBattery
                    ? Math.max(0, Number(contextOrBattery.endgameBonus) || 0)
                    : 0;

            const parts = [`Correct: ${colorNameFromHex(colorHex)}`];
            if (pointsAwarded > 0) {
                parts.push(`+${pointsAwarded} pts`);
            }
            if (comboCount > 1) {
                parts.push(`Combo x${comboMultiplier.toFixed(2)}`);
            }
            if (riskBonus > 0.08) {
                parts.push(`Risk +${Math.round(riskBonus * 100)}%`);
            }
            if (endgameBonus > 0.05) {
                parts.push(`End +${Math.round(endgameBonus * 100)}%`);
            }
            if (Number.isFinite(batteryPercent)) {
                parts.push(`Battery ${Math.round(batteryPercent)}%`);
            }
            setStatus(parts.join(' | '), '#8dff9a');
        },
        showFailure(wrongColorHex, targetColorHex) {
            const wrongName = colorNameFromHex(wrongColorHex);
            const targetName = colorNameFromHex(targetColorHex);
            setStatus(
                `Wrong (${wrongName})! Correct was ${targetName}. Press Q to restart.`,
                '#ff8e8e',
                5000
            );
        },
        showCrash(messageText) {
            setStatus(messageText, '#ff9c7f', 5000);
        },
        showInfo(messageText, timeoutMs = 2000) {
            setStatus(messageText, '#a7d5ff', timeoutMs);
        },
        showResult(messageText) {
            statusLocked = true;
            setStatus(messageText, '#ffe08f', 0, true);
        },
        resetStatus() {
            statusLocked = false;
            setStatus(statusDefaultText, 'rgba(195, 228, 255, 0.9)', 0, true);
        },
    };

    function setStatus(text, color, timeoutMs = 1400, force = false) {
        if (statusLocked && !force) {
            return;
        }

        statusEl.textContent = text;
        statusEl.style.color = color;
        if (statusTimer) {
            clearTimeout(statusTimer);
            statusTimer = null;
        }

        if (!isCarDestroyed?.() && timeoutMs > 0) {
            statusTimer = setTimeout(() => {
                statusEl.textContent = statusDefaultText;
                statusEl.style.color = 'rgba(195, 228, 255, 0.9)';
            }, timeoutMs);
        }
    }
}
