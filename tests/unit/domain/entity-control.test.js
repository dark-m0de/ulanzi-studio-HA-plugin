import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EntityControlRegistry } from '../../../src/domain/entity-control.js';
import { DialController } from '../../../src/domain/dial-controller.js';
import { EntityStore } from '../../../src/domain/entity-store.js';
import { createManualClock } from '../../support/manual-clock.js';
import { loadStates, rawState } from '../../support/fixtures/index.js';

function setup() {
  const clock = createManualClock();
  const calls = [];
  const registry = new EntityControlRegistry({ clock, send: (call) => calls.push({ ...call, at: clock.now() }) });
  const store = new EntityStore();
  store.load(loadStates());
  const controller = (entityId, attributeId, options = {}) =>
    new DialController({ registry, getEntity: () => store.get(entityId), entityId, attributeId, options });
  return { clock, calls, registry, store, controller };
}

test('two controllers on the same entity and attribute share one EntityControl (data-model §8)', () => {
  const { clock, calls, registry, controller } = setup();
  const a = controller('light.living_room', 'light.brightness');
  const b = controller('light.living_room', 'light.brightness');
  const seen = [];
  registry.get('light.living_room').subscribe((e) => seen.push(`A:${e.type}`));
  registry.get('light.living_room').subscribe((e) => seen.push(`B:${e.type}`));
  assert.equal(a.rotate('right'), 45);
  assert.equal(b.rotate('right'), 50, 'B continues from A’s optimistic value');
  assert.equal(a.displayValue(), 50);
  assert.equal(calls.length, 1, 'one call per 200 ms window across both controllers');
  clock.tick(200);
  assert.deepEqual(calls.map((c) => c.data.brightness_pct), [45, 50]);
  assert.deepEqual(seen.slice(0, 4), ['A:change', 'B:change', 'A:change', 'B:change']);
});

test('different attributes of one entity share the entity throttle and every final value is delivered', () => {
  const { clock, calls, controller } = setup();
  const bright = controller('light.desk', 'light.brightness');
  const temp = controller('light.desk', 'light.color_temp');
  bright.rotate('left'); // 95 → sent immediately
  temp.rotate('right'); // 4100 pending
  bright.rotate('left'); // 90 pending (brightness entry already pending? no: first pending is color)
  temp.rotate('right'); // 4200 replaces pending color
  bright.rotate('left'); // 85 replaces pending brightness
  assert.equal(calls.length, 1);
  clock.tick(200);
  clock.tick(200);
  clock.tick(1000);
  assert.deepEqual(
    calls.map((c) => c.data),
    [{ brightness_pct: 95 }, { color_temp_kelvin: 4200 }, { brightness_pct: 85 }],
  );
  for (let i = 1; i < calls.length; i++) assert.ok(calls[i].at - calls[i - 1].at >= 200, '≤ 5 calls/s combined');
});

test('optimistic values are kept per attribute', () => {
  const { store, controller } = setup();
  const bright = controller('light.desk', 'light.brightness');
  const temp = controller('light.desk', 'light.color_temp');
  bright.rotate('left'); // optimistic brightness 95
  store.applyStateChanged('light.desk', {
    ...rawState('light.desk'),
    attributes: { ...rawState('light.desk').attributes, color_temp_kelvin: 3000 },
  });
  temp.reconcile();
  assert.equal(temp.displayValue(), 3000, 'colour temperature from HA is shown');
  assert.equal(bright.displayValue(), 95, 'brightness keeps its optimistic value');
});

test('cancelPending() drops pending calls and optimistic values for all entities', () => {
  const { clock, calls, registry, controller } = setup();
  const light = controller('light.living_room', 'light.brightness');
  const fan = controller('fan.bedroom', 'fan.percentage');
  light.rotate('right');
  light.rotate('right');
  fan.rotate('right');
  fan.rotate('right');
  registry.cancelPending();
  clock.tick(1000);
  assert.equal(calls.length, 2, 'only the two leading calls were sent');
  assert.equal(light.displayValue(), 40, 'back to the HA value');
  assert.equal(fan.displayValue(), 40);
});

test('send errors are reported to listeners and to onError', async () => {
  const clock = createManualClock();
  const errors = [];
  const registry = new EntityControlRegistry({
    clock,
    send: () => Promise.reject(Object.assign(new Error('x'), { key: 'error.service' })),
    onError: (err, call) => errors.push(`${call.service}:${err.key}`),
  });
  const store = new EntityStore();
  store.load(loadStates());
  const events = [];
  registry.get('light.living_room').subscribe((e) => events.push(e.type));
  new DialController({ registry, getEntity: () => store.get('light.living_room'), entityId: 'light.living_room', attributeId: 'light.brightness' }).rotate('right');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(errors, ['turn_on:error.service']);
  assert.ok(events.includes('error'));
});

test('a control without listeners or pending calls is released', () => {
  const { registry } = setup();
  const control = registry.get('switch.coffee');
  const off = control.subscribe(() => {});
  assert.equal(registry.size, 1);
  off();
  assert.equal(registry.size, 0);
});
