export function createBotStatusController() {
    const listEl = document.getElementById('botList');
    if (!listEl) {
        return {
            render() {},
        };
    }

    let lastRenderSignature = '';
    let lastPlayerScore = null;
    const numberFormatter = new Intl.NumberFormat(undefined, {
        useGrouping: false,
    });

    return {
        render(botStateList = [], playerState = null) {
            const player =
                playerState && typeof playerState === 'object'
                    ? normalizePlayerState(playerState)
                    : null;
            if (!player) {
                listEl.innerHTML = '';
                lastRenderSignature = '__empty__';
                lastPlayerScore = null;
                return;
            }

            const renderSignature = [
                player.name,
                player.score,
                player.collectedCount,
                player.livesRemaining,
                player.maxLives,
                player.respawning ? 1 : 0,
            ].join(':');
            if (renderSignature === lastRenderSignature) {
                return;
            }

            const pickupLabel = player.collectedCount === 1 ? 'PICKUP' : 'PICKUPS';
            const livesMarkup = renderLivesMarkup(player.livesRemaining, player.maxLives);
            const scoreGain =
                Number.isFinite(lastPlayerScore) && player.score > lastPlayerScore
                    ? player.score - lastPlayerScore
                    : 0;
            listEl.innerHTML =
                `<section class="playerHudScoreDock${scoreGain > 0 ? ' is-scoring' : ''}" aria-label="Player score">` +
                '<span class="playerHudDockLabel">SCORE</span>' +
                '<div class="playerHudScoreStack">' +
                `<strong class="playerHudScoreValue">${numberFormatter.format(player.score)}</strong>` +
                `${scoreGain > 0 ? `<span class="playerHudScoreGain">+${numberFormatter.format(scoreGain)}</span>` : ''}` +
                '</div>' +
                `<span class="playerHudPickupValue">${numberFormatter.format(player.collectedCount)} ${pickupLabel}</span>` +
                '</section>' +
                `<section class="playerHudLivesDock${player.respawning ? ' is-respawning' : ''}" aria-label="Player lives">` +
                '<span class="playerHudDockLabel">LIVES</span>' +
                `<div class="playerHudLivesTrack">${livesMarkup}</div>` +
                `<div class="playerHudLivesFooter">${numberFormatter.format(player.livesRemaining)} / ${numberFormatter.format(player.maxLives)}</div>` +
                `${player.respawning ? '<span class="playerHudRespawnLabel">RESPAWNING</span>' : ''}` +
                '</section>';

            lastRenderSignature = renderSignature;
            lastPlayerScore = player.score;
        },
    };
}

function normalizePlayerState(playerState = null) {
    if (!playerState || typeof playerState !== 'object') {
        return null;
    }
    return {
        name: String(playerState.name || 'YOU'),
        score: Math.max(0, Math.floor(Number(playerState.score) || 0)),
        collectedCount: Math.max(0, Math.floor(Number(playerState.collectedCount) || 0)),
        livesRemaining: Math.max(0, Math.floor(Number(playerState.livesRemaining) || 0)),
        maxLives: Math.max(1, Math.floor(Number(playerState.maxLives) || 1)),
        respawning: Boolean(playerState.respawning),
    };
}

function renderLivesMarkup(livesRemaining = 0, maxLives = 1) {
    const totalLives = Math.max(1, Math.floor(Number(maxLives) || 1));
    const activeLives = Math.max(0, Math.min(totalLives, Math.floor(Number(livesRemaining) || 0)));
    let markup = '';
    for (let index = 0; index < totalLives; index += 1) {
        markup += `<span class="playerHudLife${index < activeLives ? ' is-active' : ' is-empty'}"></span>`;
    }
    return markup;
}
