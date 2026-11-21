// Feature 003, data-model §2/§4: icon definitions and key icon resolution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iconFromDefinition } from '../../../../src/domain/icons/resolve.js';

// --- part 1: iconFromDefinition (T009) ----------------------------------------------------------

const battery = {
  default: 'mdi:battery-unknown',
  range: {
    0: 'mdi:battery-alert',
    10: 'mdi:battery-10',
    20: 'mdi:battery-20',
    90: 'mdi:battery-90',
    100: 'mdi:battery',
  },
};

test('iconFromDefinition: an exact state match wins over range and default', () => {
  const def = { ...battery, state: { 15: 'mdi:star' } };
  assert.equal(iconFromDefinition('15', def), 'mdi:star');
  assert.equal(iconFromDefinition('off', { default: 'mdi:lightbulb', state: { off: 'mdi:lightbulb-off' } }), 'mdi:lightbulb-off');
  assert.equal(iconFromDefinition('on', { default: 'mdi:lightbulb', state: { off: 'mdi:lightbulb-off' } }), 'mdi:lightbulb');
});

test('iconFromDefinition: numeric states use the highest range key ≤ value', () => {
  assert.equal(iconFromDefinition('5', battery), 'mdi:battery-alert');
  assert.equal(iconFromDefinition('15', battery), 'mdi:battery-10');
  assert.equal(iconFromDefinition('95.5', battery), 'mdi:battery-90');
  assert.equal(iconFromDefinition('100', battery), 'mdi:battery');
  assert.equal(iconFromDefinition('250', battery), 'mdi:battery');
});

test('iconFromDefinition: below the lowest range key, or non-numeric, falls back to default', () => {
  assert.equal(iconFromDefinition('-3', battery), 'mdi:battery-unknown');
  assert.equal(iconFromDefinition('unknown', battery), 'mdi:battery-unknown');
  assert.equal(iconFromDefinition('', battery), 'mdi:battery-unknown');
});

test('iconFromDefinition: nothing to return gives null', () => {
  assert.equal(iconFromDefinition('on', { state: { off: 'mdi:x' } }), null);
  assert.equal(iconFromDefinition('on', undefined), null);
  assert.equal(iconFromDefinition('on', null), null);
  assert.equal(iconFromDefinition('on', 'garbage'), null);
});

// --- part 2: resolveKeyIcon, steps 2/4/5/6 (T020) -----------------------------------------------

import { resolveKeyIcon } from '../../../../src/domain/icons/resolve.js';
import { IconData } from '../../../../src/domain/icons/icon-data.js';
import { iconPath } from '../../../../src/domain/icons/mdi-set.js';
import { EntityStore } from '../../../../src/domain/entity-store.js';
import { loadStates, loadIcons } from '../../../support/fixtures/index.js';

const store = new EntityStore();
store.load(loadStates());
const entity = (id, patch = {}) => {
  const base = store.get(id);
  return { ...base, ...patch, attributes: { ...base.attributes, ...(patch.attributes ?? {}) } };
};
const loaded = () => {
  const data = new IconData();
  data.setComponents(loadIcons().entity_component.resources);
  data.setRegistry(loadIcons().list_for_display.entities);
  return data;
};
const toggle = { kind: 'toggle' };

test('resolveKeyIcon: the HA custom icon (attributes.icon) wins over the component icon', () => {
  const r = resolveKeyIcon(entity('light.desk', { attributes: { icon: 'mdi:ceiling-light' } }), {}, loaded(), toggle);
  assert.deepEqual(r, { name: 'mdi:ceiling-light', path: iconPath('mdi:ceiling-light'), source: 'entity' });
});

test('resolveKeyIcon: component icons by device class and state', () => {
  const data = loaded();
  const closed = (id) => entity(id, { state: 'closed' });
  assert.equal(resolveKeyIcon(closed('cover.blinds'), {}, data, toggle).name, 'mdi:window-shutter');
  assert.equal(resolveKeyIcon(closed('cover.garage'), {}, data, toggle).name, 'mdi:garage');
  assert.equal(resolveKeyIcon(entity('cover.blinds', { state: 'opening' }), {}, data, toggle).name, 'mdi:arrow-up-box');
  const off = resolveKeyIcon(entity('light.hallway'), {}, data, toggle);
  assert.equal(off.name, 'mdi:lightbulb-off');
  assert.equal(off.source, 'component');
});

test('resolveKeyIcon: an unknown attributes.icon falls through and is reported via onSkipped', () => {
  const skipped = [];
  const r = resolveKeyIcon(entity('light.desk', { attributes: { icon: 'phu:x' } }), {}, loaded(), { kind: 'toggle', onSkipped: (n) => skipped.push(n) });
  assert.equal(r.name, 'mdi:lightbulb');
  assert.deepEqual(skipped, ['phu:x']);
  const none = [];
  resolveKeyIcon(entity('light.desk', { attributes: { icon: 'mdi:ceiling-light' } }), {}, loaded(), { kind: 'toggle', onSkipped: (n) => none.push(n) });
  assert.deepEqual(none, []);
});

test('resolveKeyIcon: without HA data the built-in fallback is used', () => {
  const r = resolveKeyIcon(entity('light.hallway'), {}, new IconData(), toggle);
  assert.equal(r.name, 'mdi:lightbulb-off');
  assert.equal(r.source, 'fallback');
  assert.equal(resolveKeyIcon(entity('cover.garage'), {}, new IconData(), toggle).name, 'mdi:garage');
});

test('resolveKeyIcon: unknown domain without data → null; missing entity → null', () => {
  const vacuum = { entityId: 'vacuum.x', domain: 'vacuum', state: 'docked', friendlyName: 'V', attributes: {} };
  assert.equal(resolveKeyIcon(vacuum, {}, new IconData(), toggle), null);
  assert.equal(resolveKeyIcon(null, {}, loaded(), toggle), null);
});

// --- part 3: key override and "Show icon" (T032, US2) -------------------------------------------

test('resolveKeyIcon: the key override wins over everything', () => {
  const desk = entity('light.desk', { attributes: { icon: 'mdi:ceiling-light' } });
  const r = resolveKeyIcon(desk, { icon: 'mdi:coffee-maker' }, loaded(), toggle);
  assert.deepEqual(r, { name: 'mdi:coffee-maker', path: iconPath('mdi:coffee-maker'), source: 'override' });
  assert.equal(resolveKeyIcon(desk, { icon: ' hass:coffee-maker ' }, loaded(), toggle).name, 'mdi:coffee-maker');
});

test('resolveKeyIcon: an unknown override falls through to the HA icon and is reported', () => {
  const skipped = [];
  const r = resolveKeyIcon(entity('light.hallway'), { icon: 'mdi:does-not-exist' }, loaded(), { kind: 'toggle', onSkipped: (n) => skipped.push(n) });
  assert.equal(r.name, 'mdi:lightbulb-off');
  assert.equal(r.source, 'component');
  assert.deepEqual(skipped, ['mdi:does-not-exist']);
});

test('resolveKeyIcon: showIcon false → null (text layout); missing or true → resolved', () => {
  const hallway = entity('light.hallway');
  assert.equal(resolveKeyIcon(hallway, { showIcon: false }, loaded(), toggle), null);
  assert.equal(resolveKeyIcon(hallway, { showIcon: false, icon: 'mdi:coffee-maker' }, loaded(), toggle), null);
  assert.equal(resolveKeyIcon(hallway, { showIcon: true }, loaded(), toggle).name, 'mdi:lightbulb-off');
  assert.equal(resolveKeyIcon(hallway, {}, loaded(), toggle).name, 'mdi:lightbulb-off');
  assert.equal(resolveKeyIcon(hallway, undefined, loaded(), toggle).name, 'mdi:lightbulb-off');
});

// --- part 4: platform (integration) icons and ranges (T042, US3) --------------------------------

const withPlatform = () => {
  const data = loaded();
  data.setPlatform('demo_platform', loadIcons().entity.resources.demo_platform);
  return data;
};

test('resolveKeyIcon: a platform icon by translation key wins over the component icon', () => {
  const r = resolveKeyIcon(entity('sensor.outdoor_temperature'), {}, withPlatform(), { kind: 'sensor' });
  assert.equal(r.name, 'mdi:sun-thermometer');
  assert.equal(r.source, 'platform');
});

test('resolveKeyIcon: platform not loaded or without the key → component icon', () => {
  assert.equal(resolveKeyIcon(entity('sensor.outdoor_temperature'), {}, loaded(), { kind: 'sensor' }).name, 'mdi:thermometer');
  const data = loaded();
  data.setRegistry([{ ei: 'sensor.outdoor_temperature', pl: 'demo_platform', tk: 'other' }]);
  data.setPlatform('demo_platform', loadIcons().entity.resources.demo_platform);
  assert.equal(resolveKeyIcon(entity('sensor.outdoor_temperature'), {}, data, { kind: 'sensor' }).name, 'mdi:thermometer');
});

test('resolveKeyIcon: battery sensors follow the range icons', () => {
  const battery = (state) => ({ entityId: 'sensor.phone_battery', domain: 'sensor', state, friendlyName: 'Phone', attributes: { device_class: 'battery' } });
  assert.equal(resolveKeyIcon(battery('15'), {}, loaded(), { kind: 'sensor' }).name, 'mdi:battery-10');
  assert.equal(resolveKeyIcon(battery('100'), {}, loaded(), { kind: 'sensor' }).name, 'mdi:battery');
  assert.equal(resolveKeyIcon(battery('5'), {}, new IconData(), { kind: 'sensor' }).name, 'mdi:battery-alert', 'fallback table has the range too');
});

// --- part 5: service keys (T050, US4) -----------------------------------------------------------

test('resolveKeyIcon: service keys only use the configured icon', () => {
  const service = { kind: 'service' };
  assert.equal(resolveKeyIcon(null, { icon: 'mdi:lightbulb-group' }, loaded(), service).name, 'mdi:lightbulb-group');
  assert.equal(resolveKeyIcon(null, {}, loaded(), service), null);
  assert.equal(resolveKeyIcon(null, { icon: 'mdi:nope' }, loaded(), service), null);
  assert.equal(resolveKeyIcon(null, { icon: 'mdi:lightbulb-group', showIcon: false }, loaded(), service).name, 'mdi:lightbulb-group', 'no "Show icon" switch on service keys');
});
