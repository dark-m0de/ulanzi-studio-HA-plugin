// Reconnect delays for the HA connection: 1 s, doubling, capped at 30 s (FR-004).
// stop() enters a no-retry state, used after auth_invalid (FR-005).

/**
 * @param {{ initialMs?: number, maxMs?: number }} [options]
 */
export function createBackoff({ initialMs = 1000, maxMs = 30000 } = {}) {
  let current = initialMs;
  let stopped = false;

  return {
    /** @returns {number | null} next delay in ms, or null when stopped */
    next() {
      if (stopped) return null;
      const delay = Math.min(current, maxMs);
      current = Math.min(current * 2, maxMs);
      return delay;
    },
    reset() {
      current = initialMs;
      stopped = false;
    },
    stop() {
      stopped = true;
    },
    get stopped() {
      return stopped;
    },
  };
}
