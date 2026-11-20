import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackoff } from '../../../src/ha/backoff.js';

test('delays double from 1 s and are capped at 30 s (FR-004)', () => {
  const b = createBackoff();
  const delays = Array.from({ length: 8 }, () => b.next());
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
});

test('reset() starts again at the initial delay', () => {
  const b = createBackoff();
  b.next();
  b.next();
  b.reset();
  assert.equal(b.next(), 1000);
});

test('stop() prevents further retries until reset() (FR-005)', () => {
  const b = createBackoff();
  b.next();
  b.stop();
  assert.equal(b.stopped, true);
  assert.equal(b.next(), null);
  assert.equal(b.next(), null);
  b.reset();
  assert.equal(b.stopped, false);
  assert.equal(b.next(), 1000);
});

test('initial and maximum delays are configurable', () => {
  const b = createBackoff({ initialMs: 10, maxMs: 25 });
  assert.deepEqual([b.next(), b.next(), b.next()], [10, 20, 25]);
});
