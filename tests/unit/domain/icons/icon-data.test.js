// Feature 003, data-model §3: per-connection store of HA icon definitions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IconData } from '../../../../src/domain/icons/icon-data.js';
import { loadIcons } from '../../../support/fixtures/index.js';

const fx = loadIcons();

test('setComponents stores the definitions, sets loaded/available and notifies once', () => {
  const data = new IconData();
  let calls = 0;
  data.subscribe(() => calls++);
  assert.equal(data.loaded, false);
  assert.equal(data.available, null);
  data.setComponents(fx.entity_component.resources);
  assert.equal(data.loaded, true);
  assert.equal(data.available, true);
  assert.equal(calls, 1);
  assert.equal(data.componentDefinition('cover', 'shutter').default, 'mdi:window-shutter-open');
  assert.equal(data.componentDefinition('cover', 'nope').default, 'mdi:dock-top');
  assert.equal(data.componentDefinition('cover', undefined).default, 'mdi:dock-top');
  assert.equal(data.componentDefinition('vacuum', undefined), null);
});

test('setUnavailable sets available = false and notifies; data stays', () => {
  const data = new IconData();
  data.setComponents(fx.entity_component.resources);
  let calls = 0;
  data.subscribe(() => calls++);
  data.setUnavailable();
  assert.equal(data.available, false);
  assert.equal(data.loaded, true);
  assert.equal(calls, 1);
  data.setUnavailable();
  assert.equal(calls, 1, 'no notification without a change');
});

test('setRegistry keeps only entries with a translation key', () => {
  const data = new IconData();
  data.setRegistry(fx.list_for_display.entities);
  assert.deepEqual(data.registryEntry('sensor.outdoor_temperature'), { platform: 'demo_platform', translationKey: 'outdoor' });
  assert.equal(data.registryEntry('light.desk'), null);
  assert.equal(data.registryEntry('light.unknown'), null);
});

test('missingPlatforms lists platforms of bound entities that are neither loaded nor requested', () => {
  const data = new IconData();
  data.setRegistry(fx.list_for_display.entities);
  assert.deepEqual(data.missingPlatforms(['sensor.outdoor_temperature', 'light.desk']), ['demo_platform']);
  data.markRequested(['demo_platform']);
  assert.deepEqual(data.missingPlatforms(['sensor.outdoor_temperature']), []);
  data.setPlatform('demo_platform', fx.entity.resources.demo_platform);
  assert.deepEqual(data.missingPlatforms(['sensor.outdoor_temperature']), []);
  assert.equal(data.platformDefinition('demo_platform', 'sensor', 'outdoor').default, 'mdi:sun-thermometer');
  assert.equal(data.platformDefinition('demo_platform', 'sensor', 'nope'), null);
});

test('setPlatform(p, undefined) marks the platform as loaded without icons', () => {
  const data = new IconData();
  data.setRegistry([{ ei: 'light.x', pl: 'hue', tk: 'bulb' }]);
  data.setPlatform('hue', undefined);
  assert.deepEqual(data.missingPlatforms(['light.x']), []);
  assert.equal(data.platformDefinition('hue', 'light', 'bulb'), null);
});

test('clear keeps the data but resets requested markers and availability', () => {
  const data = new IconData();
  data.setComponents(fx.entity_component.resources);
  data.setRegistry(fx.list_for_display.entities);
  data.markRequested(['demo_platform']);
  let calls = 0;
  data.subscribe(() => calls++);
  data.clear();
  assert.equal(data.available, null);
  assert.equal(data.loaded, true);
  assert.equal(data.componentDefinition('light', undefined).default, 'mdi:lightbulb');
  assert.deepEqual(data.missingPlatforms(['sensor.outdoor_temperature']), ['demo_platform']);
  assert.equal(calls, 1, 'availability change notifies');
});

test('malformed input is ignored', () => {
  const data = new IconData();
  data.setComponents(null);
  data.setComponents('x');
  data.setRegistry(null);
  data.setRegistry([null, { ei: 1 }, { ei: 'a.b', pl: 'p' }]);
  assert.equal(data.loaded, false);
  assert.equal(data.registryEntry('a.b'), null);
});

test('subscribe returns an unsubscribe function', () => {
  const data = new IconData();
  let calls = 0;
  const off = data.subscribe(() => calls++);
  off();
  data.setComponents(fx.entity_component.resources);
  assert.equal(calls, 0);
});
