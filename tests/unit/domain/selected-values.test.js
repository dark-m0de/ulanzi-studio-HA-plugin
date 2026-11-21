// Feature 004: selected values for "Dynamic Dial for selected values" (contracts/edit-session-targets.md §1–§2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSelectedValues, targetUsable, sameTarget } from '../../../src/domain/selected-values.js';
import { EntityStore } from '../../../src/domain/entity-store.js';
import { loadStates, rawState } from '../../support/fixtures/index.js';

const desk = { entityId: 'light.desk', attributeId: 'light.brightness' };
const deskCt = { entityId: 'light.desk', attributeId: 'light.color_temp' };

function store() {
  const s = new EntityStore();
  s.load(loadStates());
  return s;
}

test('parseSelectedValues returns [] for anything that is not a list of pairs', () => {
  for (const value of [undefined, null, 42, {}, '', 'not json', '{}', '"x"', true]) {
    assert.deepEqual(parseSelectedValues(value), [], String(value));
  }
});

test('parseSelectedValues reads the JSON string written by the PI', () => {
  assert.deepEqual(parseSelectedValues(JSON.stringify([desk])), [desk]);
});

test('parseSelectedValues accepts an already parsed array and trims entity IDs', () => {
  assert.deepEqual(parseSelectedValues([{ entityId: ' light.desk ', attributeId: 'light.brightness' }]), [desk]);
});

test('parseSelectedValues drops unknown values, missing entity IDs and non-objects', () => {
  const list = [
    { entityId: 'light.desk', attributeId: 'light.unknown' },
    { entityId: '', attributeId: 'light.brightness' },
    { entityId: '   ', attributeId: 'light.brightness' },
    { attributeId: 'light.brightness' },
    { entityId: 42, attributeId: 'light.brightness' },
    'light.desk',
    null,
    desk,
  ];
  assert.deepEqual(parseSelectedValues(list), [desk]);
});

test('parseSelectedValues keeps the first of duplicate pairs and the order', () => {
  assert.deepEqual(parseSelectedValues([deskCt, desk, { ...deskCt, entityId: ' light.desk' }]), [deskCt, desk]);
});

test('different values of the same entity are different entries', () => {
  assert.deepEqual(parseSelectedValues(JSON.stringify([desk, deskCt])), [desk, deskCt]);
});

test('targetUsable checks availability, domain and value support', () => {
  const s = store();
  assert.equal(targetUsable(deskCt, s.get('light.desk')), true);
  assert.equal(targetUsable({ entityId: 'light.living_room', attributeId: 'light.color_temp' }, s.get('light.living_room')), false);
  assert.equal(targetUsable({ entityId: 'cover.blinds', attributeId: 'light.brightness' }, s.get('cover.blinds')), false);
  assert.equal(targetUsable(desk, null), false);
  assert.equal(targetUsable({ entityId: 'input_number.volume_target', attributeId: 'number.value' }, s.get('input_number.volume_target')), true);
  assert.equal(targetUsable({ entityId: 'light.desk', attributeId: 'light.unknown' }, s.get('light.desk')), false);
  s.applyStateChanged('light.desk', { ...rawState('light.desk'), state: 'unavailable' });
  assert.equal(targetUsable(desk, s.get('light.desk')), false);
});

test('sameTarget compares entity and value', () => {
  assert.equal(sameTarget(desk, { ...desk }), true);
  assert.equal(sameTarget(desk, deskCt), false);
  assert.equal(sameTarget(desk, null), false);
});
