// Feature 003, data-model §1: icon names and the bundled Material Design Icons set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mdiLightbulb } from '@mdi/js';
import { normaliseIconName, iconPath } from '../../../../src/domain/icons/mdi-set.js';

test('normaliseIconName accepts mdi: and hass: prefixes, trims and lower-cases', () => {
  assert.equal(normaliseIconName('mdi:Lightbulb '), 'mdi:lightbulb');
  assert.equal(normaliseIconName('  mdi:ceiling-light'), 'mdi:ceiling-light');
  assert.equal(normaliseIconName('hass:lightbulb'), 'mdi:lightbulb');
});

test('normaliseIconName rejects names without a known prefix, empty values and overlong names', () => {
  for (const bad of ['lightbulb', 'phu:foo', 'mdi:', '', '   ', null, undefined, 42, `mdi:${'a'.repeat(61)}`, 'mdi:light bulb', 'mdi:<x>']) {
    assert.equal(normaliseIconName(bad), null, String(bad));
  }
});

test('iconPath resolves known names to the SVG path of the 24×24 grid', () => {
  assert.equal(iconPath('mdi:lightbulb'), mdiLightbulb);
  assert.match(iconPath('mdi:lightbulb'), /^M/);
  assert.match(iconPath('mdi:numeric-1-box'), /^M/);
  assert.match(iconPath('mdi:window-shutter-open'), /^M/);
  assert.match(iconPath('hass:lightbulb-off'), /^M/);
});

test('iconPath returns null for unknown or invalid names', () => {
  assert.equal(iconPath('mdi:does-not-exist'), null);
  assert.equal(iconPath('lightbulb'), null);
  assert.equal(iconPath(null), null);
});

test('iconPath does not resolve inherited object properties', () => {
  assert.equal(iconPath('mdi:__proto__'), null);
  assert.equal(iconPath('mdi:constructor'), null);
  assert.equal(iconPath('mdi:to-string'), null);
});
