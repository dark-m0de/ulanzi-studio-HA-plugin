import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EntityStore } from '../../../src/domain/entity-store.js';
import { loadStates, rawState } from '../../support/fixtures/index.js';

test('load() mirrors all states as EntityState objects', () => {
  const store = new EntityStore();
  store.load(loadStates());
  const light = store.get('light.living_room');
  assert.equal(light.entityId, 'light.living_room');
  assert.equal(light.domain, 'light');
  assert.equal(light.state, 'on');
  assert.equal(light.friendlyName, 'Living Room');
  assert.equal(light.attributes.brightness, 102);
  assert.equal(store.all().length, 15);
});

test('friendly name falls back to the object id', () => {
  const store = new EntityStore();
  store.load([{ entity_id: 'switch.garden_pump', state: 'off', attributes: {} }]);
  assert.equal(store.get('switch.garden_pump').friendlyName, 'garden_pump');
});

test('subscribers of an entity are notified on state changes; others are not', () => {
  const store = new EntityStore();
  store.load(loadStates());
  const seen = [];
  const other = [];
  store.subscribe('switch.coffee', (e) => seen.push(e?.state));
  store.subscribe('light.desk', () => other.push(1));
  store.applyStateChanged('switch.coffee', { ...rawState('switch.coffee'), state: 'on' });
  assert.deepEqual(seen, ['on']);
  assert.deepEqual(other, []);
});

test('unsubscribe stops notifications', () => {
  const store = new EntityStore();
  store.load(loadStates());
  let calls = 0;
  const off = store.subscribe('switch.coffee', () => calls++);
  off();
  store.applyStateChanged('switch.coffee', rawState('switch.coffee'));
  assert.equal(calls, 0);
});

test('removal (new_state null) makes the entity not found and notifies with null', () => {
  const store = new EntityStore();
  store.load(loadStates());
  const seen = [];
  store.subscribe('light.hallway', (e) => seen.push(e));
  store.applyStateChanged('light.hallway', null);
  assert.equal(store.get('light.hallway'), null);
  assert.deepEqual(seen, [null]);
});

test('isUnavailable covers unavailable, unknown and missing entities', () => {
  const store = new EntityStore();
  store.load([
    { entity_id: 'light.a', state: 'unavailable', attributes: {} },
    { entity_id: 'light.b', state: 'unknown', attributes: {} },
    { entity_id: 'light.c', state: 'on', attributes: {} },
  ]);
  assert.equal(store.isUnavailable('light.a'), true);
  assert.equal(store.isUnavailable('light.b'), true);
  assert.equal(store.isUnavailable('light.c'), false);
  assert.equal(store.isUnavailable('light.missing'), true);
});

test('load() notifies refreshed listeners and every subscribed entity', () => {
  const store = new EntityStore();
  let refreshed = 0;
  const seen = [];
  store.onRefreshed(() => refreshed++);
  store.subscribe('switch.coffee', (e) => seen.push(e?.state));
  store.load(loadStates());
  assert.equal(refreshed, 1);
  assert.deepEqual(seen, ['off']);
});
