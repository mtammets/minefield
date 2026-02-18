export function createBotStatusController({ toCssHex, colorNameFromHex } = {}) {
    const listEl = document.getElementById('botList');
    if (!listEl) {
        return {
            render() {},
        };
    }

    return {
        render(botStateList = []) {
            if (!botStateList.length) {
                listEl.textContent = 'No bots available';
                return;
            }

            listEl.innerHTML = botStateList
                .map((bot) => {
                    const targetHex = bot.targetColorHex ?? 0x6b84a5;
                    const targetName =
                        bot.targetColorHex == null ? '-' : colorNameFromHex(targetHex);
                    return (
                        `<div class="botRow">` +
                        `<span class="botName">${bot.name}</span>` +
                        `<span class="botTarget">` +
                        `<span class="botSwatch" style="background:${toCssHex(targetHex)}"></span>` +
                        `${targetName}` +
                        `</span>` +
                        `<span class="botScore">${bot.collectedCount}</span>` +
                        `</div>`
                    );
                })
                .join('');
        },
    };
}
