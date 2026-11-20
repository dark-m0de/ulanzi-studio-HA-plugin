// Distinguishes short and long key presses (data-model.md §7, research R-11).
// The long press fires while the key is still held; the following keyup then emits nothing.

export const MIN_THRESHOLD_MS = 300;
export const MAX_THRESHOLD_MS = 2000;
export const DEFAULT_THRESHOLD_MS = 500;

const clampThreshold = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n)) return DEFAULT_THRESHOLD_MS;
  return Math.min(MAX_THRESHOLD_MS, Math.max(MIN_THRESHOLD_MS, n));
};

/**
 * @param {{
 *   thresholdMs?: number,
 *   clock: { setTimeout: Function, clearTimeout: Function },
 *   onShortPress: () => void,
 *   onLongPress: () => void,
 * }} options
 */
export function createPressDetector({ thresholdMs = DEFAULT_THRESHOLD_MS, clock, onShortPress, onLongPress }) {
  let threshold = clampThreshold(thresholdMs);
  /** @type {'up' | 'down' | 'long_fired'} */
  let state = 'up';
  let timer = null;

  const cancel = () => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  };

  return {
    keyDown() {
      if (state !== 'up') return;
      state = 'down';
      timer = clock.setTimeout(() => {
        timer = null;
        state = 'long_fired';
        onLongPress();
      }, threshold);
    },
    keyUp() {
      if (state === 'down') {
        cancel();
        state = 'up';
        onShortPress();
      } else if (state === 'long_fired') {
        state = 'up';
      }
    },
    setThreshold(ms) {
      threshold = clampThreshold(ms);
    },
    get isDown() {
      return state !== 'up';
    },
    dispose() {
      cancel();
      state = 'up';
    },
  };
}
