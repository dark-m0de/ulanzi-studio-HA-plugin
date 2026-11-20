// Leading + trailing throttle with one window per key (FR-024, research R-13).
// Within a key, values are kept per sub-key (latest wins); pending sub-keys are sent one per
// window in the order of their first change, so every final value is delivered.

/**
 * @param {{
 *   windowMs?: number,
 *   clock: { setTimeout: Function, clearTimeout: Function },
 *   send: (value: any, key: string, subKey: string) => void,
 * }} options
 */
export function createThrottle({ windowMs = 200, clock, send }) {
  /** @type {Map<string, { timer: any, pending: Map<string, any> }>} */
  const keys = new Map();

  function openWindow(key, entry) {
    entry.timer = clock.setTimeout(() => {
      entry.timer = null;
      const next = entry.pending.entries().next();
      if (next.done) {
        keys.delete(key);
        return;
      }
      const [subKey, value] = next.value;
      entry.pending.delete(subKey);
      openWindow(key, entry);
      send(value, key, subKey);
    }, windowMs);
  }

  return {
    /** @param {string} key @param {any} value @param {string} [subKey] */
    push(key, value, subKey = '') {
      let entry = keys.get(key);
      if (!entry) {
        entry = { timer: null, pending: new Map() };
        keys.set(key, entry);
        openWindow(key, entry);
        send(value, key, subKey);
        return;
      }
      entry.pending.set(subKey, value);
    },
    /** True while a window is open or values are pending for the key. */
    isActive(key) {
      return keys.has(key);
    },
    cancel(key) {
      const entry = keys.get(key);
      if (!entry) return;
      if (entry.timer !== null) clock.clearTimeout(entry.timer);
      keys.delete(key);
    },
    cancelAll() {
      for (const key of [...keys.keys()]) this.cancel(key);
    },
  };
}
