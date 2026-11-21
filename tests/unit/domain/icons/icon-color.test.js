// Feature 003, data-model §6 / research R-07: icon colour and contrast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHexColor, iconColor, ensureContrast, contrastRatio, ICON_BG } from '../../../../src/domain/icons/icon-color.js';

const light = (attributes = {}, state = 'on') => ({ entityId: 'light.x', domain: 'light', state, friendlyName: 'X', attributes });

test('parseHexColor normalises #rrggbb and rejects everything else', () => {
  assert.equal(parseHexColor('#AbC123'), '#abc123');
  assert.equal(parseHexColor(' #00ff00 '), '#00ff00');
  for (const bad of ['red', '#abc', '', null, undefined, '#gggggg', 'abc123', 7]) assert.equal(parseHexColor(bad), null, String(bad));
});

test('toggle on: light rgb_color, else default amber; custom on colour wins', () => {
  assert.equal(iconColor({ kind: 'toggle', isOn: true, entity: light() }), '#f59e0b');
  assert.equal(iconColor({ kind: 'toggle', isOn: true, entity: light({ rgb_color: [255, 0, 0] }) }), '#ff0000');
  assert.equal(iconColor({ kind: 'toggle', isOn: true, entity: light({ rgb_color: [255, 0, 0] }), settings: { onColor: '#00FF00' } }), '#00ff00');
  const sw = { entityId: 'switch.x', domain: 'switch', state: 'on', attributes: { rgb_color: [1, 2, 3] } };
  assert.equal(iconColor({ kind: 'toggle', isOn: true, entity: sw }), '#f59e0b', 'rgb_color only counts for lights');
});

test('toggle off: slate, custom off colour wins; the light colour is ignored when off', () => {
  assert.equal(iconColor({ kind: 'toggle', isOn: false, entity: light({ rgb_color: [255, 0, 0] }, 'off') }), '#94a3b8');
  assert.equal(iconColor({ kind: 'toggle', isOn: false, entity: light({}, 'off'), settings: { offColor: '#0000ff' } }), '#0000ff');
});

test('trigger, service and sensor defaults; sensor warning colour', () => {
  assert.equal(iconColor({ kind: 'trigger' }), '#a78bfa');
  assert.equal(iconColor({ kind: 'service', settings: { onColor: '#123456' } }), '#123456');
  assert.equal(iconColor({ kind: 'sensor' }), '#5eead4');
  assert.equal(iconColor({ kind: 'sensor', warn: true, settings: { onColor: '#123456' } }), '#fb923c');
});

test('invalid custom colours are ignored', () => {
  assert.equal(iconColor({ kind: 'toggle', isOn: true, entity: light(), settings: { onColor: 'red' } }), '#f59e0b');
  assert.equal(iconColor({ kind: 'toggle', isOn: false, entity: light({}, 'off'), settings: { offColor: '#12' } }), '#94a3b8');
  assert.equal(iconColor({ kind: 'trigger', settings: { onColor: '' } }), '#a78bfa');
});

test('ensureContrast lifts dark colours to at least 3:1 against the icon background', () => {
  for (const dark of ['#000000', '#0a0a40', '#1e293b', '#330000']) {
    const out = ensureContrast(dark);
    assert.match(out, /^#[0-9a-f]{6}$/);
    assert.ok(contrastRatio(out, ICON_BG) >= 3, `${dark} → ${out}`);
  }
});

test('ensureContrast leaves readable colours unchanged', () => {
  assert.equal(ensureContrast('#ffffff'), '#ffffff');
  assert.equal(ensureContrast('#f59e0b'), '#f59e0b');
  assert.equal(ensureContrast('#ffa757'), '#ffa757');
});
