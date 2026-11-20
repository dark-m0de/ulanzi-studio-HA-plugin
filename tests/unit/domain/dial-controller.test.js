import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EntityControlRegistry } from '../../../src/domain/entity-control.js';
import { DialController } from '../../../src/domain/dial-controller.js';
import { EntityStore } from '../../../src/domain/entity-store.js';
import { createManualClock } from '../../support/manual-clock.js';
import { loadStates, rawState } from '../../support/fixtures/index.js';

function setup(entityId, attributeId, options = {}, mutate) {
  const clock = createManualClock();
  const calls = [];
  const registry = new EntityControlRegistry({ clock, send: (call) => calls.push(call) });
  const store = new EntityStore();
  const states = loadStates();
  if (mutate) mutate(states.find((s) => s.entity_id === entityId));
  store.load(states);
  const controller = new DialController({ registry, getEntity: () => store.get(entityId), entityId, attributeId, options });
  return { clock, calls, store, controller };
}

const brightnessOf = (call) => call.data.brightness_pct;

test('left/right use the fine step, hold-left/hold-right the coarse step (FR-023)', () => {
  const { controller } = setup('light.living_room', 'light.brightness');
  assert.equal(controller.rotate('right'), 45);
  assert.equal(controller.rotate('left'), 40);
  assert.equal(controller.rotate('hold-right'), 60);
  assert.equal(controller.rotate('hold-left'), 40);
});

test('custom steps override the defaults; invalid values fall back to them', () => {
  const { controller } = setup('light.living_room', 'light.brightness', { stepFine: '2', stepCoarse: 10 });
  assert.equal(controller.rotate('right'), 42);
  assert.equal(controller.rotate('hold-right'), 52);
  const fallback = setup('light.living_room', 'light.brightness', { stepFine: '', stepCoarse: 'abc' }).controller;
  assert.equal(fallback.rotate('right'), 45);
  assert.equal(fallback.rotate('hold-right'), 65);
});

test('climate uses the entity step and clamps to its bounds (FR-025)', () => {
  const { controller } = setup('climate.office', 'climate.temperature');
  assert.equal(controller.rotate('right'), 21.5);
  assert.equal(controller.rotate('hold-right'), 23.5);
  for (let i = 0; i < 20; i++) controller.rotate('hold-right');
  assert.equal(controller.displayValue(), 30);
});

test('values at the bound do not send further calls', () => {
  const { clock, calls, controller } = setup('light.living_room', 'light.brightness', {}, (s) => (s.attributes.brightness = 255));
  assert.equal(controller.displayValue(), 100);
  assert.equal(controller.rotate('right'), 100);
  clock.tick(500);
  assert.equal(calls.length, 0);
});

test('rotating right with the light off starts at the minimum and sends turn_on (FR-028)', () => {
  const { calls, controller } = setup('light.living_room', 'light.brightness', {}, (s) => (s.state = 'off'));
  assert.equal(controller.displayValue(), null);
  assert.equal(controller.rotate('right'), 1);
  assert.equal(calls[0].service, 'turn_on');
  assert.equal(brightnessOf(calls[0]), 1);
});

test('rotating left with the light off does nothing', () => {
  const { calls, controller } = setup('light.living_room', 'light.brightness', {}, (s) => (s.state = 'off'));
  assert.equal(controller.rotate('left'), null);
  assert.equal(calls.length, 0);
});

test('below the minimum: offAtMin turns the light off (default), otherwise the value clamps', () => {
  const low = (s) => (s.attributes.brightness = 3);
  const { calls, controller } = setup('light.living_room', 'light.brightness', {}, low);
  assert.equal(controller.displayValue(), 1);
  assert.equal(controller.rotate('left'), null);
  assert.equal(calls[0].service, 'turn_off');
  const clamped = setup('light.living_room', 'light.brightness', { offAtMin: false }, low);
  assert.equal(clamped.controller.rotate('left'), 1);
  assert.equal(clamped.calls.length, 0, 'already at the minimum, nothing to send');
  const stringFalse = setup('light.living_room', 'light.brightness', { offAtMin: 'false' }, low);
  assert.equal(stringFalse.controller.rotate('left'), 1);
});

test('the optimistic value wins over stale HA updates until 1.5 s after the last input', () => {
  const { clock, store, controller } = setup('light.living_room', 'light.brightness');
  controller.rotate('right'); // 45
  store.applyStateChanged('light.living_room', rawState('light.living_room')); // stale 40 %
  controller.reconcile();
  assert.equal(controller.displayValue(), 45);
  clock.tick(1499);
  assert.equal(controller.displayValue(), 45);
  clock.tick(1);
  assert.equal(controller.displayValue(), 40);
});

test('the optimistic value is dropped as soon as HA reports the target', () => {
  const { store, controller } = setup('light.living_room', 'light.brightness');
  controller.rotate('right'); // 45
  store.applyStateChanged('light.living_room', { ...rawState('light.living_room'), attributes: { ...rawState('light.living_room').attributes, brightness: 115 } });
  controller.reconcile();
  assert.equal(controller.hasOptimistic(), false);
  assert.equal(controller.displayValue(), 45);
});

test('HA rounding (e.g. 45 → 44 %) is adopted after the window', () => {
  const { clock, store, controller } = setup('light.living_room', 'light.brightness');
  controller.rotate('right'); // 45
  store.applyStateChanged('light.living_room', { ...rawState('light.living_room'), attributes: { ...rawState('light.living_room').attributes, brightness: 112 } }); // 43.9 → 44
  controller.reconcile();
  assert.equal(controller.displayValue(), 45);
  clock.tick(1500);
  assert.equal(controller.displayValue(), 44);
});

test('missing entities or unsupported attributes yield null and send nothing', () => {
  const { calls, controller } = setup('light.hallway', 'light.brightness');
  assert.equal(controller.rotate('right'), null);
  const missing = setup('light.nope', 'light.brightness');
  assert.equal(missing.controller.rotate('right'), null);
  assert.equal(calls.length + missing.calls.length, 0);
});
