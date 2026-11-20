import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createThrottle } from '../../../src/domain/throttle.js';
import { createManualClock } from '../../support/manual-clock.js';

function setup(windowMs = 200) {
  const clock = createManualClock();
  const sent = [];
  const throttle = createThrottle({ windowMs, clock, send: (value, key, subKey) => sent.push({ value, key, subKey, at: clock.now() }) });
  return { clock, sent, throttle };
}

test('the first value is sent immediately (leading)', () => {
  const { sent, throttle } = setup();
  throttle.push('light.a', 1);
  assert.deepEqual(sent.map((s) => s.value), [1]);
});

test('at most one call per 200 ms window; the latest value is sent at the end (trailing)', () => {
  const { clock, sent, throttle } = setup();
  throttle.push('light.a', 1);
  clock.tick(50);
  throttle.push('light.a', 2);
  clock.tick(50);
  throttle.push('light.a', 3);
  assert.deepEqual(sent.map((s) => s.value), [1]);
  clock.tick(100);
  assert.deepEqual(sent.map((s) => s.value), [1, 3]);
  assert.equal(sent[1].at, 200);
  clock.tick(1000);
  assert.equal(sent.length, 2, 'nothing more without new values');
});

test('after an idle window the next value is sent immediately again', () => {
  const { clock, sent, throttle } = setup();
  throttle.push('light.a', 1);
  clock.tick(500);
  throttle.push('light.a', 2);
  assert.deepEqual(sent.map((s) => s.value), [1, 2]);
});

test('separate keys are throttled independently', () => {
  const { sent, throttle } = setup();
  throttle.push('light.a', 1);
  throttle.push('light.b', 1);
  assert.deepEqual(sent.map((s) => s.key), ['light.a', 'light.b']);
});

test('100 values in 2 s produce ≤ 11 calls and the last carries the final value (FR-024, SC-004)', () => {
  const { clock, sent, throttle } = setup();
  for (let i = 1; i <= 100; i++) {
    throttle.push('light.a', i);
    clock.tick(20);
  }
  clock.tick(500);
  assert.ok(sent.length <= 11, `sent ${sent.length}`);
  assert.equal(sent.at(-1).value, 100);
  for (let i = 1; i < sent.length; i++) assert.ok(sent[i].at - sent[i - 1].at >= 200, 'calls are ≥ 200 ms apart');
});

test('sub-keys keep only their latest value and are sent in order of first change', () => {
  const { clock, sent, throttle } = setup();
  throttle.push('light.a', 'b1', 'brightness');
  throttle.push('light.a', 'c1', 'color');
  throttle.push('light.a', 'b2', 'brightness');
  throttle.push('light.a', 'c2', 'color');
  assert.deepEqual(sent.map((s) => s.value), ['b1']);
  clock.tick(200);
  assert.deepEqual(sent.map((s) => s.value), ['b1', 'c2'], 'color was changed first among the pending ones');
  clock.tick(200);
  assert.deepEqual(sent.map((s) => s.value), ['b1', 'c2', 'b2']);
});

test('cancel(key) and cancelAll() drop pending values', () => {
  const { clock, sent, throttle } = setup();
  throttle.push('light.a', 1);
  throttle.push('light.a', 2);
  throttle.push('light.b', 1);
  throttle.push('light.b', 2);
  throttle.cancel('light.a');
  clock.tick(200);
  assert.deepEqual(sent.map((s) => `${s.key}=${s.value}`), ['light.a=1', 'light.b=1', 'light.b=2']);
  throttle.push('light.b', 3);
  throttle.cancelAll();
  clock.tick(500);
  assert.equal(sent.length, 3);
  throttle.push('light.b', 4);
  assert.equal(sent.at(-1).value, 4, 'sends immediately after cancelAll');
});
