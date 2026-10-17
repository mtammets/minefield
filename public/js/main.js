import './analytics-consent.js';

const experienceMode =
    typeof window !== 'undefined' &&
    typeof window.__MINEFIELD_DRIFT_EXPERIENCE__ === 'string' &&
    window.__MINEFIELD_DRIFT_EXPERIENCE__.trim()
        ? window.__MINEFIELD_DRIFT_EXPERIENCE__.trim()
        : 'game';

if (document?.body) {
    document.body.dataset.experience = experienceMode;
}

const runtimePromise =
    experienceMode === 'mobile-leaderboard'
        ? import('./mobile-live-leaderboard.js').then((module) => {
              module.startMobileLiveLeaderboardExperience?.();
          })
        : import('./game-runtime.js').then(() => {
              if (document?.body) {
                  document.body.dataset.experienceReady = 'true';
              }
          });

runtimePromise.catch((error) => {
    console.error('Runtime bootstrap failed:', error);
});
