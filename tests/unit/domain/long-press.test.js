import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPressDetector } from '../../../src/domain/long-press.js';
import { createManualClock } from '../../support/manual-clock.js';

function setup(thresholdMs) {
  const clock = createManualClock();
  const events = [];
  const detector = createPressDetector({
    thresholdMs,
    clock,
    onShortPress: () => events.push('short'),
    onLongPress: () => events.push('long'),
  });
  return { clock, events, detector };
}

test('keyup before the threshold is a short press', () => {
  const { clock, events, detector } = setup();
  detector.keyDown();
  clock.tick(499);
  detector.keyUp();
  assert.deepEqual(events, ['short']);
});

test('holding past the threshold fires the long press while still held; keyup emits nothing', () => {
  const { clock, events, detector } = setup();
  detector.keyDown();
  clock.tick(500);
  assert.deepEqual(events, ['long'], 'fires before keyup');
  detector.keyUp();
  assert.deepEqual(events, ['long']);
});

test('the threshold is configurable and clamped to 300–2000 ms', () => {
  const { clock, events, detector } = setup(1000);
  detector.keyDown();
  clock.tick(999);
  assert.deepEqual(events, []);
  clock.tick(1);
  assert.deepEqual(events, ['long']);
  detector.keyUp();

  detector.setThreshold(50);
  detector.keyDown();
  clock.tick(299);
  detector.keyUp();
  assert.deepEqual(events, ['long', 'short'], 'clamped up to 300 ms');

  detector.setThreshold(10_000);
  detector.keyDown();
  clock.tick(2000);
  assert.deepEqual(events, ['long', 'short', 'long'], 'clamped down to 2000 ms');
  detector.keyUp();
});

test('a repeated keydown without keyup is ignored; a stray keyup does nothing', () => {
  const { clock, events, detector } = setup();
  detector.keyUp();
  detector.keyDown();
  clock.tick(300);
  detector.keyDown();
  clock.tick(300);
  assert.deepEqual(events, ['long'], 'timer was not restarted by the second keydown');
  detector.keyUp();
});

test('20 short and 20 long presses are classified correctly (SC-005)', () => {
  const { clock, events, detector } = setup();
  for (let i = 0; i < 20; i++) {
    detector.keyDown();
    clock.tick(50 + (i % 5) * 80);
    detector.keyUp();
    clock.tick(100);
    detector.keyDown();
    clock.tick(500 + i * 25);
    detector.keyUp();
    clock.tick(100);
  }
  assert.equal(events.filter((e) => e === 'short').length, 20);
  assert.equal(events.filter((e) => e === 'long').length, 20);
});

test('dispose() cancels a pending long press', () => {
  const { clock, events, detector } = setup();
  detector.keyDown();
  detector.dispose();
  clock.tick(1000);
  assert.deepEqual(events, []);
});
