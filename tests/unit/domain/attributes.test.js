import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAttribute, supportedAttributes } from '../../../src/domain/attributes/index.js';
import { EntityStore } from '../../../src/domain/entity-store.js';
import { loadStates } from '../../support/fixtures/index.js';

const store = new EntityStore();
store.load(loadStates());
const e = (id) => store.get(id);
const ids = (entity) => supportedAttributes(entity).map((a) => a.id);

test('supportedAttributes per fixture entity (FR-021, FR-022)', () => {
  assert.deepEqual(ids(e('light.living_room')), ['light.brightness']);
  assert.deepEqual(ids(e('light.hallway')), []);
  assert.deepEqual(ids(e('light.desk')), ['light.brightness', 'light.color_temp']);
  assert.deepEqual(ids(e('media_player.living_room')), ['media_player.volume']);
  assert.deepEqual(ids(e('climate.office')), ['climate.temperature']);
  assert.deepEqual(ids(e('cover.blinds')), ['cover.position']);
  assert.deepEqual(ids(e('cover.garage')), []);
  assert.deepEqual(ids(e('fan.bedroom')), ['fan.percentage']);
  assert.deepEqual(ids(e('input_number.volume_target')), ['number.value']);
  assert.deepEqual(ids(e('switch.coffee')), []);
  assert.deepEqual(ids(null), []);
});

test('light.brightness: read, bounds, steps, unit', () => {
  const a = getAttribute('light.brightness');
  assert.equal(a.read(e('light.living_room')), 40);
  assert.equal(a.read({ ...e('light.living_room'), state: 'off' }), null);
  assert.equal(a.read({ ...e('light.living_room'), attributes: { ...e('light.living_room').attributes, brightness: 1 } }), 1);
  assert.deepEqual(a.bounds(e('light.living_room')), { min: 1, max: 100 });
  assert.deepEqual(a.defaultSteps(e('light.living_room')), { fine: 5, coarse: 20 });
  assert.equal(a.unit(e('light.living_room')), '%');
});

test('light.brightness: toServiceCall clamps, rounds and handles offAtMin (FR-025, FR-028)', () => {
  const a = getAttribute('light.brightness');
  const ent = e('light.living_room');
  assert.deepEqual(a.toServiceCall(ent, 45.4), {
    value: 45,
    call: { domain: 'light', service: 'turn_on', target: { entity_id: 'light.living_room' }, data: { brightness_pct: 45 } },
  });
  assert.equal(a.toServiceCall(ent, 140).value, 100);
  assert.deepEqual(a.toServiceCall(ent, -4, { offAtMin: true }), {
    value: null,
    call: { domain: 'light', service: 'turn_off', target: { entity_id: 'light.living_room' }, data: {} },
  });
  assert.equal(a.toServiceCall(ent, -4, { offAtMin: false }).value, 1);
});

test('light.color_temp uses kelvin bounds and clamps', () => {
  const a = getAttribute('light.color_temp');
  const ent = e('light.desk');
  assert.equal(a.read(ent), 4000);
  assert.deepEqual(a.bounds(ent), { min: 2200, max: 6500 });
  assert.deepEqual(a.defaultSteps(ent), { fine: 100, coarse: 500 });
  assert.equal(a.unit(ent), 'K');
  assert.deepEqual(a.toServiceCall(ent, 9000, { offAtMin: true }).call.data, { color_temp_kelvin: 6500 });
  assert.equal(a.toServiceCall(ent, 100, { offAtMin: true }).value, 2200);
});

test('media_player.volume scales 0–100 to volume_level 0–1', () => {
  const a = getAttribute('media_player.volume');
  const ent = e('media_player.living_room');
  assert.equal(a.read(ent), 35);
  assert.deepEqual(a.bounds(ent), { min: 0, max: 100 });
  assert.deepEqual(a.toServiceCall(ent, 40).call, {
    domain: 'media_player',
    service: 'volume_set',
    target: { entity_id: 'media_player.living_room' },
    data: { volume_level: 0.4 },
  });
  assert.equal(a.toServiceCall(ent, -10, { offAtMin: true }).call.data.volume_level, 0);
});

test('climate.temperature uses entity step, bounds and rounding (FR-023)', () => {
  const a = getAttribute('climate.temperature');
  const ent = e('climate.office');
  assert.equal(a.read(ent), 21);
  assert.deepEqual(a.bounds(ent), { min: 7, max: 30 });
  assert.deepEqual(a.defaultSteps(ent), { fine: 0.5, coarse: 2 });
  assert.equal(a.unit(ent), '°');
  assert.equal(a.toServiceCall(ent, 21.3).value, 21.5);
  assert.equal(a.toServiceCall(ent, 35).value, 30);
  assert.deepEqual(a.toServiceCall(ent, 22).call, {
    domain: 'climate',
    service: 'set_temperature',
    target: { entity_id: 'climate.office' },
    data: { temperature: 22 },
  });
});

test('climate.temperature defaults the step to 0.5 when the entity defines none', () => {
  const a = getAttribute('climate.temperature');
  const ent = { ...e('climate.office'), attributes: { ...e('climate.office').attributes, target_temp_step: undefined } };
  assert.deepEqual(a.defaultSteps(ent), { fine: 0.5, coarse: 2 });
});

test('cover.position', () => {
  const a = getAttribute('cover.position');
  const ent = e('cover.blinds');
  assert.equal(a.read(ent), 70);
  assert.deepEqual(a.toServiceCall(ent, 75).call, {
    domain: 'cover',
    service: 'set_cover_position',
    target: { entity_id: 'cover.blinds' },
    data: { position: 75 },
  });
});

test('fan.percentage uses percentage_step and turns off at 0 with offAtMin', () => {
  const a = getAttribute('fan.percentage');
  const ent = e('fan.bedroom');
  assert.equal(a.read(ent), 40);
  assert.deepEqual(a.defaultSteps(ent), { fine: 10, coarse: 40 });
  assert.deepEqual(a.toServiceCall(ent, 50).call.data, { percentage: 50 });
  assert.deepEqual(a.toServiceCall(ent, 0, { offAtMin: true }), {
    value: null,
    call: { domain: 'fan', service: 'turn_off', target: { entity_id: 'fan.bedroom' }, data: {} },
  });
  assert.equal(a.toServiceCall(ent, 0, { offAtMin: false }).call.data.percentage, 0);
});

test('number.value uses min/max/step and the entity domain for the service', () => {
  const a = getAttribute('number.value');
  const ent = e('input_number.volume_target');
  assert.equal(a.read(ent), 4.5);
  assert.deepEqual(a.bounds(ent), { min: 0, max: 10 });
  assert.deepEqual(a.defaultSteps(ent), { fine: 0.5, coarse: 5 });
  assert.equal(a.unit(ent), 'dB');
  assert.deepEqual(a.toServiceCall(ent, 5.2).call, {
    domain: 'input_number',
    service: 'set_value',
    target: { entity_id: 'input_number.volume_target' },
    data: { value: 5 },
  });
});

test('getAttribute returns null for unknown ids', () => {
  assert.equal(getAttribute('light.nope'), null);
});

test('editAttributeFor maps each adjustable domain to its edit-mode attribute (US5)', async () => {
  const { editAttributeFor } = await import('../../../src/domain/attributes/index.js');
  const id = (entityId) => editAttributeFor(e(entityId))?.id ?? null;
  assert.equal(id('light.living_room'), 'light.brightness');
  assert.equal(id('media_player.living_room'), 'media_player.volume');
  assert.equal(id('climate.office'), 'climate.temperature');
  assert.equal(id('cover.blinds'), 'cover.position');
  assert.equal(id('fan.bedroom'), 'fan.percentage');
});

test('editAttributeFor returns null for entities that are not eligible', async () => {
  const { editAttributeFor } = await import('../../../src/domain/attributes/index.js');
  for (const entityId of ['cover.garage', 'switch.coffee', 'light.hallway', 'input_number.volume_target', 'sensor.outdoor_temperature']) {
    assert.equal(editAttributeFor(e(entityId)), null, entityId);
  }
  assert.equal(editAttributeFor(null), null);
});
