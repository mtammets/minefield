export function createPauseMenuController({ onExit, onResume } = {}) {
    const rootEl = document.getElementById('pauseModal');
    const exitBtnEl = document.getElementById('pauseExitBtn');
    const resumeBtnEl = document.getElementById('pauseResumeBtn');
    if (!rootEl || !exitBtnEl || !resumeBtnEl) {
        return {
            show() {},
            hide() {},
            isVisible() {
                return false;
            },
        };
    }

    exitBtnEl.addEventListener('click', () => {
        onExit?.();
    });
    resumeBtnEl.addEventListener('click', () => {
        onResume?.();
    });

    return {
        show() {
            rootEl.hidden = false;
        },
        hide() {
            rootEl.hidden = true;
        },
        isVisible() {
            return !rootEl.hidden;
        },
    };
}
