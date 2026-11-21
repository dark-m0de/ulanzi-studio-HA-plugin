import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dialRender, feedbackPayload, dialSvg } from '../../../../src/domain/render/dial-feedback.js';
import { getAttribute } from '../../../../src/domain/attributes/index.js';
import { EntityStore } from '../../../../src/domain/entity-store.js';
import { loadStates } from '../../../support/fixtures/index.js';

const store = new EntityStore();
store.load(loadStates());
const e = (id) => store.get(id);
const t = (key) => `[${key}]`;
const brightness = getAttribute('light.brightness');
const temperature = getAttribute('climate.temperature');

test('a light with brightness renders title, value with unit, on style and progress', () => {
  const r = dialRender({ entity: e('light.living_room'), attribute: brightness, value: 40, label: '', t, connected: true });
  assert.equal(r.title, 'Living Room');
  assert.equal(r.valueText, '40%');
  assert.equal(r.style, 'on');
  assert.ok(Math.abs(r.progress - 39 / 99) < 1e-9);
});

test('decimals are kept for temperatures; custom label wins', () => {
  const r = dialRender({ entity: e('climate.office'), attribute: temperature, value: 21.5, label: 'Büro', t, connected: true });
  assert.equal(r.title, 'Büro');
  assert.equal(r.valueText, '21.5°');
});

test('value null (off) shows the off text with progress 0', () => {
  const r = dialRender({ entity: { ...e('light.living_room'), state: 'off' }, attribute: brightness, value: null, label: '', t, connected: true });
  assert.deepEqual({ style: r.style, valueText: r.valueText, progress: r.progress }, { style: 'off', valueText: '[status.off]', progress: 0 });
});

test('error states: disconnected, not found, unavailable, unsupported, not configured (FR-027)', () => {
  const base = { attribute: brightness, value: 40, label: '', t, connected: true };
  assert.equal(dialRender({ ...base, entity: e('light.living_room'), connected: false }).valueText, '[status.disconnected]');
  assert.equal(dialRender({ ...base, entity: null, entityId: 'light.gone' }).valueText, '[status.notFound]');
  assert.equal(dialRender({ ...base, entity: null, entityId: 'light.gone' }).title, 'gone');
  assert.equal(dialRender({ ...base, entity: { ...e('light.living_room'), state: 'unavailable' } }).valueText, '[status.unavailable]');
  assert.equal(dialRender({ ...base, entity: e('light.hallway') }).valueText, '[status.unsupported]');
  assert.equal(dialRender({ ...base, attribute: null, entity: e('light.living_room') }).valueText, '[status.unsupported]');
  const setupHint = dialRender({ ...base, entity: null, entityId: '' });
  assert.equal(setupHint.title, '[status.setup]');
  for (const r of [dialRender({ ...base, entity: e('light.living_room'), connected: false }), dialRender({ ...base, entity: e('light.hallway') })]) {
    assert.equal(r.style, 'unavailable');
    assert.equal(r.progress, null);
  }
});

test('feedbackPayload builds the $UA1 setFeedback payload with a data-URL SVG', () => {
  const r = dialRender({ entity: e('light.living_room'), attribute: brightness, value: 40, label: '', t, connected: true });
  const payload = feedbackPayload(r);
  assert.deepEqual(Object.keys(payload).sort(), ['icon', 'title']);
  assert.equal(payload.title.text, 'Living Room');
  assert.match(payload.icon.value, /^data:image\/svg\+xml;base64,/);
  const svg = Buffer.from(payload.icon.value.split(',')[1], 'base64').toString('utf8');
  assert.equal(svg, dialSvg(r));
});

test('the dial SVG is 100×100 with value text, a progress arc and no external resources', () => {
  const r = dialRender({ entity: e('light.living_room'), attribute: brightness, value: 40, label: '', t, connected: true });
  const svg = dialSvg(r);
  assert.match(svg, /viewBox="0 0 100 100"/);
  assert.match(svg, />40%</);
  assert.match(svg, /<path [^>]*class="progress"/);
  assert.doesNotMatch(svg, /href|url\(/);
  const off = dialSvg(dialRender({ entity: e('light.hallway'), attribute: brightness, value: null, label: '', t, connected: true }));
  assert.doesNotMatch(off, /class="progress"/);
});

test('hint renders (idle Dynamic Dial) carry only text', () => {
  const r = { style: 'off', title: 'Hint', valueText: '', progress: null };
  assert.equal(feedbackPayload(r).title.text, 'Hint');
  assert.match(dialSvg(r), /viewBox="0 0 100 100"/);
});

// --- feature 002: caption (T026) -----------------------------------------------------------

test('an optional caption is carried in DialRender and drawn above the value', () => {
  const r = dialRender({ entity: e('light.living_room'), attribute: brightness, value: 40, label: '', t, connected: true, caption: 'Bright.' });
  assert.equal(r.caption, 'Bright.');
  const svg = dialSvg(r);
  assert.match(svg, /class="caption"[^>]*>Bright\.</);
  const plain = dialSvg(dialRender({ entity: e('light.living_room'), attribute: brightness, value: 40, label: '', t, connected: true }));
  assert.doesNotMatch(plain, /class="caption"/);
});
