// Feature 003, research R-06: built-in icons when HA provides no icon definitions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fallbackIcon } from '../../../../src/domain/icons/fallback-icons.js';
import { iconPath } from '../../../../src/domain/icons/mdi-set.js';

const KEY_DOMAINS = {
  light: ['on', 'off'],
  switch: ['on', 'off'],
  fan: ['on', 'off'],
  cover: ['open', 'closed', 'opening', 'closing'],
  media_player: ['playing', 'paused', 'off'],
  climate: ['heat', 'off'],
  input_boolean: ['on', 'off'],
  scene: ['2026-11-19T20:00:00+00:00'],
  script: ['on', 'off'],
  automation: ['on', 'off'],
  sensor: ['12.3'],
};

test('every key domain has a resolvable fallback icon in every state', () => {
  for (const [domain, states] of Object.entries(KEY_DOMAINS)) {
    for (const state of states) {
      const name = fallbackIcon(domain, undefined, state);
      assert.ok(name, `${domain}/${state}`);
      assert.ok(iconPath(name), `${domain}/${state} → ${name}`);
    }
  }
});

test('the values follow Home Assistant (light, input_boolean)', () => {
  assert.equal(fallbackIcon('light', undefined, 'on'), 'mdi:lightbulb');
  assert.equal(fallbackIcon('light', undefined, 'off'), 'mdi:lightbulb-off');
  assert.equal(fallbackIcon('input_boolean', undefined, 'off'), 'mdi:close-circle-outline');
});

test('device classes win over the domain default', () => {
  assert.equal(fallbackIcon('cover', 'garage', 'closed'), 'mdi:garage');
  assert.equal(fallbackIcon('cover', 'shutter', 'open'), 'mdi:window-shutter-open');
  assert.equal(fallbackIcon('switch', 'outlet', 'off'), 'mdi:power-plug-off');
  assert.equal(fallbackIcon('sensor', 'temperature', '21'), 'mdi:thermometer');
  assert.equal(fallbackIcon('cover', 'unknown_class', 'closed'), 'mdi:card');
});

test('unknown domains have no fallback', () => {
  assert.equal(fallbackIcon('vacuum', undefined, 'docked'), null);
  assert.equal(fallbackIcon(undefined, undefined, 'on'), null);
});
