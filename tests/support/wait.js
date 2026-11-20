// Polls a condition using real time; for waiting on socket I/O in integration tests.
export async function waitFor(predicate, { timeoutMs = 2000, intervalMs = 5, message = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${message}`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Lets pending socket messages and promise callbacks run. */
export function settle(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
