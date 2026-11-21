import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditSessionBroker } from '../../../src/domain/edit-session.js';
import { EntityControlRegistry } from '../../../src/domain/entity-control.js';
import { DialController } from '../../../src/domain/dial-controller.js';
import { EntityStore } from '../../../src/domain/entity-store.js';
import { createManualClock } from '../../support/manual-clock.js';
import { loadStates } from '../../support/fixtures/index.js';

function setup() {
  const clock = createManualClock();
  const broker = new EditSessionBroker({ clock });
  const store = new EntityStore();
  store.load(loadStates());
  const changes = [];
  broker.onChange((e) => changes.push(e));
  return { clock, broker, store, changes, e: (id) => store.get(id) };
}

test('a long press on an eligible light with a Dynamic Dial starts editing its brightness', () => {
  const { broker, changes, e } = setup();
  broker.registerDial('dial-1');
  assert.equal(broker.start({ sourceContext: 'key-1', entity: e('light.living_room') }), 'started');
  assert.deepEqual(broker.session, { entityId: 'light.living_room', attributeId: 'light.brightness', sourceContext: 'key-1' });
  assert.equal(broker.isSource('key-1'), true);
  assert.equal(broker.isSource('key-2'), false);
  assert.equal(changes.at(-1).session.entityId, 'light.living_room');
});

test('without a registered Dynamic Dial the session stays idle and returns no_dial (FR-039)', () => {
  const { broker, e } = setup();
  assert.equal(broker.start({ sourceContext: 'key-1', entity: e('light.living_room') }), 'no_dial');
  assert.equal(broker.session, null);
});

test('ineligible entities return the fallback result, even without dials', () => {
  const { broker, e } = setup();
  assert.equal(broker.start({ sourceContext: 'k', entity: e('switch.coffee') }), 'ineligible');
  assert.equal(broker.start({ sourceContext: 'k', entity: e('light.hallway') }), 'ineligible');
  assert.equal(broker.start({ sourceContext: 'k', entity: null }), 'ineligible');
  broker.registerDial('d');
  assert.equal(broker.start({ sourceContext: 'k', entity: e('switch.coffee') }), 'ineligible');
  assert.equal(broker.session, null);
});

test('a long press on another key switches the entity (FR-035)', () => {
  const { broker, e } = setup();
  broker.registerDial('d');
  broker.start({ sourceContext: 'key-a', entity: e('light.living_room') });
  assert.equal(broker.start({ sourceContext: 'key-b', entity: e('light.desk') }), 'switched');
  assert.deepEqual(broker.session, { entityId: 'light.desk', attributeId: 'light.brightness', sourceContext: 'key-b' });
  assert.equal(broker.isSource('key-a'), false);
});

test('the timeout defaults to 10 s and every input resets it (FR-034)', () => {
  const { clock, broker, changes, e } = setup();
  broker.registerDial('d');
  broker.start({ sourceContext: 'k', entity: e('light.living_room') });
  clock.tick(9_000);
  broker.input();
  clock.tick(9_000);
  assert.notEqual(broker.session, null);
  clock.tick(1_000);
  assert.equal(broker.session, null);
  assert.equal(changes.at(-1).reason, 'timeout');
});

test('the timeout is the largest editTimeoutS among registered dials, clamped to 3–60 s', () => {
  const { clock, broker, e } = setup();
  broker.registerDial('d1', { timeoutS: 5 });
  broker.registerDial('d2', { timeoutS: '20' });
  broker.start({ sourceContext: 'k', entity: e('light.living_room') });
  clock.tick(19_999);
  assert.notEqual(broker.session, null);
  clock.tick(1);
  assert.equal(broker.session, null);
  broker.updateDial('d2', { timeoutS: 999 });
  assert.equal(broker.timeoutMs, 60_000);
  broker.unregisterDial('d2');
  broker.updateDial('d1', { timeoutS: 1 });
  assert.equal(broker.timeoutMs, 3_000);
  broker.updateDial('d1', { timeoutS: '' });
  assert.equal(broker.timeoutMs, 10_000);
});

for (const [name, act, reason] of [
  ['a short press on the source key', (b) => b.end('source_press'), 'source_press'],
  ['the source page becoming inactive', (b) => b.pageInactive('key-1'), 'page'],
  ['connection loss', (b) => b.connectionLost(), 'disconnected'],
  ['the source key being cleared', (b) => b.sourceCleared('key-1'), 'cleared'],
  ['the entity becoming unavailable', (b) => b.entityUnavailable('light.living_room'), 'unavailable'],
  ['the last Dynamic Dial being removed', (b) => b.unregisterDial('dial-1'), 'no_dials'],
]) {
  test(`the session ends on ${name}`, () => {
    const { broker, changes, e } = setup();
    broker.registerDial('dial-1');
    broker.start({ sourceContext: 'key-1', entity: e('light.living_room') });
    act(broker);
    assert.equal(broker.session, null);
    assert.deepEqual(changes.at(-1), { session: null, reason });
  });
}

test('events for other keys or entities do not end the session', () => {
  const { broker, e } = setup();
  broker.registerDial('d1');
  broker.registerDial('d2');
  broker.start({ sourceContext: 'key-1', entity: e('light.living_room') });
  broker.pageInactive('key-2');
  broker.sourceCleared('key-2');
  broker.entityUnavailable('light.desk');
  broker.unregisterDial('d2');
  assert.notEqual(broker.session, null);
});

test('rotations from any registered dial apply to the same value in order of arrival (FR-032a)', () => {
  const { clock, broker, store, e } = setup();
  const registry = new EntityControlRegistry({ clock, send: () => {} });
  broker.registerDial('d1');
  broker.registerDial('d2');
  assert.deepEqual(broker.dialContexts, ['d1', 'd2']);
  broker.start({ sourceContext: 'k', entity: e('light.living_room') });
  const { entityId, attributeId } = broker.session;
  const forDial = () => new DialController({ registry, getEntity: () => store.get(entityId), entityId, attributeId });
  const d1 = forDial();
  const d2 = forDial();
  assert.deepEqual([d1.rotate('right'), d2.rotate('right'), d1.rotate('right'), d2.rotate('left')], [45, 50, 55, 50]);
  assert.equal(d1.displayValue(), d2.displayValue(), 'both dials show the same value');
});

test('media players, climates, covers and fans can be edited too (US5)', () => {
  const { broker, e } = setup();
  broker.registerDial('d');
  for (const [entityId, attributeId] of [
    ['media_player.living_room', 'media_player.volume'],
    ['climate.office', 'climate.temperature'],
    ['cover.blinds', 'cover.position'],
    ['fan.bedroom', 'fan.percentage'],
  ]) {
    broker.start({ sourceContext: 'k', entity: e(entityId) });
    assert.equal(broker.session.attributeId, attributeId, entityId);
  }
  assert.equal(broker.start({ sourceContext: 'k', entity: e('cover.garage') }), 'ineligible');
});

// --- feature 002: switchAttribute (T025) ---------------------------------------------------

test('switchAttribute cycles the edited value and emits switched_value', () => {
  const { broker, changes, e } = setup();
  broker.registerDial('d');
  broker.start({ sourceContext: 'k', entity: e('light.desk') });
  assert.equal(broker.switchAttribute(e('light.desk')), true);
  assert.equal(broker.session.attributeId, 'light.color_temp');
  assert.deepEqual(changes.at(-1), { session: broker.session, reason: 'switched_value' });
  broker.switchAttribute(e('light.desk'));
  assert.equal(broker.session.attributeId, 'light.brightness');
});

test('switchAttribute changes nothing for single-value entities or when idle', () => {
  const { broker, e } = setup();
  broker.registerDial('d');
  assert.equal(broker.switchAttribute(e('light.desk')), false, 'idle');
  broker.start({ sourceContext: 'k', entity: e('light.living_room') });
  assert.equal(broker.switchAttribute(e('light.living_room')), false);
  assert.equal(broker.session.attributeId, 'light.brightness');
});

test('a new session starts with the default edit value again (FR-023)', () => {
  const { broker, e } = setup();
  broker.registerDial('d');
  broker.start({ sourceContext: 'k', entity: e('light.desk') });
  broker.switchAttribute(e('light.desk'));
  broker.end('source_press');
  broker.start({ sourceContext: 'k', entity: e('light.desk') });
  assert.equal(broker.session.attributeId, 'light.brightness');
});
