// A controllable clock for time-dependent code (constitution Principle III).
// Timers only fire when tick() is called.

export function createManualClock(start = 0) {
  let now = start;
  let nextId = 1;
  /** @type {Map<number, { at: number, fn: Function, interval: number | null }>} */
  const timers = new Map();

  function setTimeout(fn, ms = 0) {
    const id = nextId++;
    timers.set(id, { at: now + Math.max(0, ms), fn, interval: null });
    return id;
  }

  function setInterval(fn, ms) {
    const id = nextId++;
    timers.set(id, { at: now + ms, fn, interval: ms });
    return id;
  }

  function clearTimeout(id) {
    timers.delete(id);
  }

  /** Advance time by ms, firing due timers in chronological order. */
  function tick(ms) {
    const target = now + ms;
    for (;;) {
      let dueId = null;
      let due = null;
      for (const [id, t] of timers) {
        if (t.at <= target && (due === null || t.at < due.at || (t.at === due.at && id < dueId))) {
          dueId = id;
          due = t;
        }
      }
      if (due === null) break;
      now = due.at;
      if (due.interval === null) timers.delete(dueId);
      else due.at += due.interval;
      due.fn();
    }
    now = target;
  }

  return {
    now: () => now,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval: clearTimeout,
    tick,
    pending: () => timers.size,
  };
}
