export function createBotStatusController({ toCssHex, colorNameFromHex } = {}) {
    const listEl = document.getElementById('botList');
    if (!listEl) {
        return {
            render() {},
        };
    }

    return {
        render(botStateList = [], playerState = null) {
            const entries = Array.isArray(botStateList) ? botStateList.slice() : [];
            if (playerState && typeof playerState === 'object') {
                entries.unshift(playerState);
            }

            if (!entries.length) {
                listEl.textContent = 'No bots available';
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
                    const collectedCount = Math.max(0, Math.floor(Number(bot.collectedCount) || 0));
                    return (
                        `<div class="${rowClasses}">` +
                        `<span class="botName">${bot.name}</span>` +
                        `<span class="botTarget">` +
                        `${
                            showSwatch
                                ? `<span class="botSwatch" style="background:${toCssHex(targetHex)}"></span>`
                                : ''
                        }` +
                        `${targetName}` +
                        `</span>` +
                        `<span class="botLivesWrap">` +
                        `<span class="botLivesPips">${livesPips}</span>` +
                        `<span class="botLivesLabel">${statusLabel}</span>` +
                        `</span>` +
                        `<span class="botScore">${collectedCount}</span>` +
                        `</div>`
                    );
                })
                .join('');
        },
    };
}
