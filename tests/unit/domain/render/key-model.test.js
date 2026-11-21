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

// --- Feature 003: icons in the toggle model (T021) ----------------------------------------------

import { resolveKeyIcon } from '../../../../src/domain/icons/resolve.js';
import { IconData } from '../../../../src/domain/icons/icon-data.js';

const noData = new IconData();
const iconOf = (entity) => resolveKeyIcon(entity, {}, noData, { kind: 'toggle' });

test('toggle with icon, entity on: icon + label + brightness, light colour', () => {
  const desk = e('light.desk');
  const m = toggleModel(desk, { entityId: 'light.desk' }, { ...opts, icon: iconOf(desk) });
  assert.equal(m.style, 'on');
  assert.equal(m.label, 'Desk Lamp');
  assert.equal(m.value, 100);
  assert.equal(m.unit, '%');
  assert.deepEqual(m.icon, { path: iconOf(desk).path, color: '#ffa757' });
  const living = e('light.living_room');
  assert.equal(toggleModel(living, { entityId: 'light.living_room' }, { ...opts, icon: iconOf(living) }).icon.color, '#f59e0b');
});

test('toggle with icon, entity off: off colour, no value', () => {
  const coffee = e('switch.coffee');
  const m = toggleModel(coffee, { entityId: 'switch.coffee' }, { ...opts, icon: iconOf(coffee) });
  assert.equal(m.icon.color, '#94a3b8');
  assert.equal(m.value, undefined);
});

test('toggle with icon: an opening cover counts as on', () => {
  const opening = { ...e('cover.blinds'), state: 'opening' };
  assert.equal(toggleModel(opening, { entityId: 'cover.blinds' }, { ...opts, icon: iconOf(opening) }).icon.color, '#f59e0b');
});

test('toggle with icon: null → exactly the 0.2.0 model', () => {
  assert.deepEqual(
    toggleModel(e('light.living_room'), { entityId: 'light.living_room' }, { ...opts, icon: null }),
    toggleModel(e('light.living_room'), { entityId: 'light.living_room' }, opts),
  );
});

test('error and setup states never carry an icon (FR-013)', () => {
  const icon = iconOf(e('light.living_room'));
  const cases = [
    toggleModel(null, {}, { ...opts, icon }),
    toggleModel(e('light.living_room'), { entityId: 'light.living_room' }, { t, connected: false, icon }),
    toggleModel(null, { entityId: 'light.gone' }, { ...opts, icon }),
    toggleModel({ ...e('light.living_room'), state: 'unavailable' }, { entityId: 'light.living_room' }, { ...opts, icon }),
    editModel(e('light.living_room'), { entityId: 'light.living_room' }, { t, value: 40, unit: '%', icon }),
  ];
  for (const m of cases) assert.equal(m.icon, undefined, JSON.stringify(m));
});

// --- Feature 003, US2: custom colours and text layout when the icon is off (T033) ---------------

test('custom on/off colours win, also over the light colour', () => {
  const desk = e('light.desk');
  const binding = { entityId: 'light.desk', onColor: '#00FF00', offColor: '#0000ff' };
  assert.equal(toggleModel(desk, binding, { ...opts, icon: iconOf(desk) }).icon.color, '#00ff00');
  const off = { ...desk, state: 'off' };
  // #0000ff is lifted to the minimum contrast against the dark background.
  const offColor = toggleModel(off, binding, { ...opts, icon: iconOf(off) }).icon.color;
  assert.notEqual(offColor, '#94a3b8');
  assert.match(offColor, /^#[0-9a-f]{6}$/);
});

test('invalid custom colours fall back to the defaults', () => {
  const desk = e('light.desk');
  assert.equal(toggleModel(desk, { entityId: 'light.desk', onColor: 'green' }, { ...opts, icon: iconOf(desk) }).icon.color, '#ffa757');
  const coffee = e('switch.coffee');
  assert.equal(toggleModel(coffee, { entityId: 'switch.coffee', offColor: '#12' }, { ...opts, icon: iconOf(coffee) }).icon.color, '#94a3b8');
});

test('show icon off: the on/off texts appear as status exactly as in 0.2.0', () => {
  const binding = { entityId: 'switch.coffee', onText: 'AN', offText: 'AUS', showIcon: false };
  const icon = resolveKeyIcon(e('switch.coffee'), binding, noData, { kind: 'toggle' });
  assert.equal(icon, null);
  assert.deepEqual(toggleModel(e('switch.coffee'), binding, { ...opts, icon }), { style: 'off', status: 'AUS', label: 'Coffee Machine' });
});

// --- Feature 003, US3: icons on sensor and trigger keys (T043) ----------------------------------

const sensorIcon = { path: 'M1 1', name: 'mdi:thermometer', source: 'component' };

test('sensorModel with icon: sensor colour, value and unit; warning colours icon and value', () => {
  const temp = e('sensor.outdoor_temperature');
  const m = sensorModel(temp, { entityId: 'sensor.outdoor_temperature' }, { ...opts, icon: sensorIcon });
  assert.deepEqual(m.icon, { path: 'M1 1', color: '#5eead4' });
  assert.equal(m.value, '12.3');
  assert.equal(m.unit, '°C');
  const warn = sensorModel(temp, { entityId: 'sensor.outdoor_temperature', warnAbove: '10' }, { ...opts, icon: sensorIcon });
  assert.equal(warn.style, 'warn');
  assert.deepEqual(warn.icon, { path: 'M1 1', color: '#fb923c', valueColor: '#fb923c' });
  const custom = sensorModel(temp, { entityId: 'sensor.outdoor_temperature', onColor: '#ffffff' }, { ...opts, icon: sensorIcon });
  assert.equal(custom.icon.color, '#ffffff');
});

test('triggerModel with icon: trigger colour or custom colour; no icon while confirming', () => {
  const evening = e('scene.evening');
  assert.deepEqual(triggerModel(evening, { entityId: 'scene.evening' }, { ...opts, icon: sensorIcon }).icon, { path: 'M1 1', color: '#a78bfa' });
  assert.equal(triggerModel(evening, { entityId: 'scene.evening', onColor: '#ffffff' }, { ...opts, icon: sensorIcon }).icon.color, '#ffffff');
  const confirming = triggerModel(evening, { entityId: 'scene.evening' }, { ...opts, icon: sensorIcon, confirming: true });
  assert.equal(confirming.icon, undefined);
  assert.equal(confirming.status, '[status.done]');
});

test('sensor and trigger error states never carry an icon', () => {
  const cases = [
    sensorModel(null, {}, { ...opts, icon: sensorIcon }),
    sensorModel(e('sensor.outdoor_temperature'), { entityId: 'sensor.outdoor_temperature' }, { t, connected: false, icon: sensorIcon }),
    triggerModel(null, { entityId: 'scene.gone' }, { ...opts, icon: sensorIcon }),
    triggerModel(e('switch.coffee'), { entityId: 'switch.coffee' }, { ...opts, icon: sensorIcon }),
  ];
  for (const m of cases) assert.equal(m.icon, undefined, JSON.stringify(m));
});

// --- Feature 003, US4: icons on service keys (T050) ---------------------------------------------

test('serviceModel with icon: trigger colour or custom colour; error and confirmation without icon', () => {
  const binding = { domain: 'light', service: 'turn_on', label: 'All' };
  const icon = { path: 'M2 2' };
  assert.deepEqual(serviceModel(binding, { ...opts, valid: true, icon }).icon, { path: 'M2 2', color: '#a78bfa' });
  assert.equal(serviceModel({ ...binding, onColor: '#ffffff' }, { ...opts, valid: true, icon }).icon.color, '#ffffff');
  assert.equal(serviceModel(binding, { ...opts, valid: false, icon }).icon, undefined);
  assert.equal(serviceModel(binding, { t, connected: false, valid: true, icon }).icon, undefined);
  assert.equal(serviceModel(binding, { ...opts, valid: true, confirming: true, icon }).icon, undefined);
  assert.deepEqual(serviceModel(binding, { ...opts, valid: true, icon: null }), serviceModel(binding, { ...opts, valid: true }));
});
