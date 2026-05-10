export function createBotStatusController({ toCssHex } = {}) {
    const listEl = document.getElementById('botList');
    if (!listEl) {
        return {
            render() {},
        };
    }
    let lastRenderSignature = '';

    return {
        render(botStateList = [], playerState = null) {
            const entries = Array.isArray(botStateList) ? botStateList.slice() : [];
            if (playerState && typeof playerState === 'object') {
                entries.unshift(playerState);
            }

            if (!entries.length) {
                listEl.innerHTML = '';
                lastRenderSignature = '__empty__';
                return;
            }

            const renderSignature = entries
                .map((entry) => {
                    const bot = entry || {};
                    return [
                        bot.id || bot.collectorId || bot.name || '-',
                        bot.targetColorHex ?? '-',
                        bot.showSwatch === false ? 0 : 1,
                        bot.isPlayer ? 1 : 0,
                        Math.max(0, Math.floor(Number(bot.score) || 0)),
                        Math.max(0, Math.floor(Number(bot.collectedCount) || 0)),
                    ].join(':');
                })
                .join('|');
            if (renderSignature === lastRenderSignature) {
                return;
            }

            listEl.innerHTML = entries
                .map((entry) => {
                    const bot = entry || {};
                    const targetHex = bot.targetColorHex ?? 0x6b84a5;
                    const showSwatch = bot.showSwatch !== false && bot.targetColorHex != null;
                    const rowClasses = `botRow${bot.isPlayer ? ' botRowPlayer' : ''}`;
                    const score = Math.max(0, Math.floor(Number(bot.score) || 0));
                    const collectedCount = Math.max(0, Math.floor(Number(bot.collectedCount) || 0));
                    const displayName = escapeHtml(bot.name || 'BOT');
                    const swatchColor = sanitizeCssColor(toCssHex?.(targetHex) || '');
                    return (
                        `<div class="${rowClasses}">` +
                        '<div class="botMain">' +
                        '<div class="botIdentity">' +
                        `${showSwatch ? `<span class="botSwatch" style="background:${swatchColor}"></span>` : ''}` +
                        `<span class="botName">${displayName}</span>` +
                        '</div>' +
                        `<span class="botScore">${score}</span>` +
                        '</div>' +
                        '<div class="botSubline">' +
                        `<span class="botCollected">x${collectedCount}</span>` +
                        '</div>' +
                        '</div>'
                    );
                })
                .join('');
            lastRenderSignature = renderSignature;
        },
    };
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function sanitizeCssColor(value) {
    const raw = String(value ?? '').trim();
    return /^#[a-fA-F0-9]{3,8}$/.test(raw) ? raw : '#6b84a5';
}
