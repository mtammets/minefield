export function createBotStatusController({ toCssHex, colorNameFromHex } = {}) {
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
                if (lastRenderSignature !== '__empty__') {
                    listEl.textContent = 'No bots available';
                    lastRenderSignature = '__empty__';
                }
                return;
            }

            const renderSignature = entries
                .map((entry) => {
                    const bot = entry || {};
                    return [
                        bot.id || bot.collectorId || bot.name || '-',
                        bot.targetColorHex ?? '-',
                        bot.targetLabel || '-',
                        bot.showSwatch === false ? 0 : 1,
                        bot.isPlayer ? 1 : 0,
                        bot.respawning ? 1 : 0,
                        Math.max(0, Math.floor(Number(bot.respawnMsRemaining) || 0)),
                        Math.max(0, Math.floor(Number(bot.livesRemaining) || 0)),
                        Math.max(1, Math.floor(Number(bot.maxLives) || 0)),
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
                    const targetName =
                        typeof bot.targetLabel === 'string'
                            ? bot.targetLabel
                            : bot.targetColorHex == null
                              ? '-'
                              : colorNameFromHex(targetHex);
                    const showSwatch = bot.showSwatch !== false && bot.targetColorHex != null;
                    const livesRemaining = Math.max(0, Math.floor(Number(bot.livesRemaining) || 0));
                    const maxLives = Math.max(
                        1,
                        Math.floor(Number(bot.maxLives) || livesRemaining || 1)
                    );
                    const clampedLives = Math.min(maxLives, livesRemaining);
                    const respawning = Boolean(bot.respawning);
                    const respawnMsRemaining = Math.max(0, Number(bot.respawnMsRemaining) || 0);
                    const respawnSeconds = Math.max(0, Math.ceil(respawnMsRemaining / 1000));
                    const statusLabel = respawning
                        ? respawnSeconds > 0
                            ? `RESPAWN ${respawnSeconds}s`
                            : 'RESPAWN'
                        : clampedLives > 0
                          ? `LIVES ${clampedLives}/${maxLives}`
                          : 'OUT';
                    const livesPips = Array.from({ length: maxLives }, (_, index) => {
                        const active = index < clampedLives;
                        return `<span class="botLifePip ${active ? 'active' : 'empty'}" aria-hidden="true"></span>`;
                    }).join('');
                    const rowClasses = `botRow${respawning ? ' botRespawning' : ''}${bot.isPlayer ? ' botRowPlayer' : ''}`;
                    const score = Math.max(0, Math.floor(Number(bot.score) || 0));
                    const collectedCount = Math.max(0, Math.floor(Number(bot.collectedCount) || 0));
                    const displayName = escapeHtml(bot.name || 'Bot');
                    const displayTargetName = escapeHtml(targetName);
                    const displayStatusLabel = escapeHtml(statusLabel);
                    const swatchColor = sanitizeCssColor(toCssHex(targetHex));
                    return (
                        `<div class="${rowClasses}">` +
                        `<span class="botName">${displayName}</span>` +
                        `<span class="botTarget">` +
                        `${
                            showSwatch
                                ? `<span class="botSwatch" style="background:${swatchColor}"></span>`
                                : ''
                        }` +
                        `<span class="botTargetLabel">${displayTargetName}</span>` +
                        `</span>` +
                        `<span class="botLivesWrap">` +
                        `<span class="botLivesPips">${livesPips}</span>` +
                        `<span class="botLivesLabel">${displayStatusLabel}</span>` +
                        `</span>` +
                        `<span class="botStats">` +
                        `<span class="botScore">${score}</span>` +
                        `<span class="botCollected">x${collectedCount}</span>` +
                        `</span>` +
                        `</div>`
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
