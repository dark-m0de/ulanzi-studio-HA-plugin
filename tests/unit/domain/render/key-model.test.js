import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleModel, editModel, triggerModel, sensorModel, serviceModel } from '../../../../src/domain/render/key-model.js';
import { EntityStore } from '../../../../src/domain/entity-store.js';
import { loadStates } from '../../../support/fixtures/index.js';

const store = new EntityStore();
store.load(loadStates());
const e = (id) => store.get(id);
const t = (key) => `[${key}]`;
const opts = { t, connected: true };

test('a dimmable light that is on shows the on style, its friendly name and brightness % (FR-011, FR-012)', () => {
  assert.deepEqual(toggleModel(e('light.living_room'), { entityId: 'light.living_room' }, opts), {
    style: 'on',
    status: '[status.on]',
    label: 'Living Room',
    value: 40,
    unit: '%',
  });
});

test('an entity that is off shows the off style without a value', () => {
  assert.deepEqual(toggleModel(e('switch.coffee'), { entityId: 'switch.coffee' }, opts), {
    style: 'off',
    status: '[status.off]',
    label: 'Coffee Machine',
  });
});

test('custom label and on/off texts override the defaults', () => {
  const binding = { entityId: 'switch.coffee', label: 'Kaffee', onText: 'AN', offText: 'AUS' };
  assert.equal(toggleModel(e('switch.coffee'), binding, opts).status, 'AUS');
  assert.equal(toggleModel(e('switch.coffee'), binding, opts).label, 'Kaffee');
  assert.equal(toggleModel({ ...e('switch.coffee'), state: 'on' }, binding, opts).status, 'AN');
});

test('blank custom texts fall back to the localised defaults', () => {
  const m = toggleModel(e('switch.coffee'), { entityId: 'switch.coffee', label: '  ', offText: '' }, opts);
  assert.equal(m.label, 'Coffee Machine');
  assert.equal(m.status, '[status.off]');
});

test('domain-specific on states: media playing, cover open, climate heating', () => {
  assert.equal(toggleModel(e('media_player.living_room'), {}, opts).style, 'on');
  assert.equal(toggleModel({ ...e('media_player.living_room'), state: 'paused' }, {}, opts).style, 'off');
  assert.equal(toggleModel(e('cover.blinds'), {}, opts).style, 'on');
  assert.equal(toggleModel(e('cover.garage'), {}, opts).style, 'off');
  assert.equal(toggleModel(e('climate.office'), {}, opts).style, 'on');
  assert.equal(toggleModel({ ...e('climate.office'), state: 'off' }, {}, opts).style, 'off');
});

test('unavailable/unknown entities show the unavailable style', () => {
  for (const state of ['unavailable', 'unknown']) {
    const m = toggleModel({ ...e('switch.coffee'), state }, { entityId: 'switch.coffee' }, opts);
    assert.equal(m.style, 'unavailable');
    assert.equal(m.status, '[status.unavailable]');
    assert.equal(m.label, 'Coffee Machine');
  }
});

test('a missing entity shows not found with the configured label or object id', () => {
  assert.deepEqual(toggleModel(null, { entityId: 'light.deleted_lamp' }, opts), {
    style: 'unavailable',
    status: '[status.notFound]',
    label: 'deleted_lamp',
  });
  assert.equal(toggleModel(null, { entityId: 'light.x', label: 'Lamp' }, opts).label, 'Lamp');
});

test('no entity configured shows a setup hint', () => {
  assert.deepEqual(toggleModel(null, {}, opts), { style: 'off', status: '[status.setup]', label: '' });
});

test('while disconnected the key shows the disconnected status', () => {
  const m = toggleModel(e('light.living_room'), { entityId: 'light.living_room' }, { t, connected: false });
  assert.deepEqual(m, { style: 'unavailable', status: '[status.disconnected]', label: 'Living Room' });
});

test('edit style shows the edit marker, live value and label (FR-033)', () => {
  assert.deepEqual(editModel(e('light.living_room'), { entityId: 'light.living_room' }, { t, value: 65, unit: '%' }), {
    style: 'edit',
    badge: '[status.edit]',
    status: '',
    label: 'Living Room',
    value: 65,
    unit: '%',
  });
});

test('edit style with the light off shows the off text instead of a value', () => {
  const m = editModel(e('light.living_room'), { entityId: 'light.living_room', label: 'Sofa' }, { t, value: null, unit: '%' });
  assert.equal(m.value, '[status.off]');
  assert.equal(m.unit, '');
  assert.equal(m.label, 'Sofa');
});

test('triggerModel: label, trigger style, and a confirmation state (US6)', () => {
  assert.deepEqual(triggerModel(e('scene.evening'), { entityId: 'scene.evening' }, opts), { style: 'trigger', status: '[status.run]', label: 'Evening' });
  assert.deepEqual(triggerModel(e('scene.evening'), { entityId: 'scene.evening', label: 'Abend' }, { ...opts, confirming: true }), {
    style: 'on',
    status: '[status.done]',
    label: 'Abend',
  });
  assert.equal(triggerModel(null, { entityId: 'scene.gone' }, opts).status, '[status.notFound]');
  assert.equal(triggerModel(e('scene.evening'), { entityId: 'scene.evening' }, { t, connected: false }).status, '[status.disconnected]');
  assert.equal(triggerModel(null, {}, opts).status, '[status.setup]');
});

test('sensorModel: value with unit, warn style outside the thresholds', () => {
  assert.deepEqual(sensorModel(e('sensor.outdoor_temperature'), { entityId: 'sensor.outdoor_temperature' }, opts), {
    style: 'sensor',
    status: '',
    label: 'Outdoor Temperature',
    value: '12.3',
    unit: '°C',
  });
  const s = (binding) => sensorModel(e('sensor.outdoor_temperature'), { entityId: 'sensor.outdoor_temperature', ...binding }, opts).style;
  assert.equal(s({ warnAbove: 10 }), 'warn');
  assert.equal(s({ warnAbove: '20', warnBelow: '5' }), 'sensor');
  assert.equal(s({ warnBelow: '15' }), 'warn');
  assert.equal(s({ warnAbove: '', warnBelow: '' }), 'sensor');
});

test('sensorModel: non-numeric states are shown truncated without unit; unavailable shows the error style', () => {
  const m = sensorModel({ ...e('sensor.outdoor_temperature'), state: 'partly_cloudy_night' }, { warnAbove: 1 }, opts);
  assert.equal(m.style, 'sensor', 'thresholds only apply to numbers');
  assert.equal(m.value, 'partly_…');
  assert.equal(m.unit, '');
  assert.equal(sensorModel({ ...e('sensor.outdoor_temperature'), state: 'unavailable' }, {}, opts).style, 'unavailable');
});

test('serviceModel: label defaults to domain.service, invalid config shows the error style', () => {
  assert.deepEqual(serviceModel({ domain: 'light', service: 'turn_on' }, { ...opts, valid: true }), {
    style: 'trigger',
    status: '[status.run]',
    label: 'light.turn_on',
  });
  assert.equal(serviceModel({ label: 'All on', domain: 'light', service: 'turn_on' }, { ...opts, valid: true }).label, 'All on');
  assert.deepEqual(serviceModel({ domain: 'light' }, { ...opts, valid: false }), { style: 'unavailable', status: '[status.invalid]', label: 'light' });
  assert.equal(serviceModel({ domain: 'light', service: 'turn_on' }, { ...opts, valid: true, confirming: true }).status, '[status.done]');
  assert.equal(serviceModel({ domain: 'light', service: 'turn_on' }, { t, connected: false, valid: true }).status, '[status.disconnected]');
});

test('edit style puts an optional caption (active value name) into the status line (feature 002)', () => {
  const m = editModel(e('light.desk'), { entityId: 'light.desk' }, { t, value: 4000, unit: 'K', caption: 'Colour' });
  assert.equal(m.status, 'Colour');
  assert.equal(editModel(e('light.desk'), {}, { t, value: 50, unit: '%' }).status, '');
});
