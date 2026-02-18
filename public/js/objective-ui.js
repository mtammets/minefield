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
        flashCorrect(colorHex, batteryPercent = null) {
            const batteryLabel = Number.isFinite(batteryPercent)
                ? ` | Battery ${Math.round(batteryPercent)}%`
                : '';
            setStatus(`Correct: ${colorNameFromHex(colorHex)}${batteryLabel}`, '#8dff9a');
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
