import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keySvg, renderKeySvg } from '../../../../src/domain/render/key-svg.js';
import { STYLES } from '../../../../src/domain/render/theme.js';

test('SVG uses a 144×144 viewBox and generic sans-serif only', () => {
  const svg = keySvg({ style: 'on', status: 'On', label: 'Kitchen' });
  assert.match(svg, /^<svg [^>]*viewBox="0 0 144 144"/);
  assert.match(svg, /font-family="sans-serif"/);
  assert.doesNotMatch(svg, /font-family="(?!sans-serif)/);
});

test('user labels are XML-escaped', () => {
  const svg = keySvg({ style: 'off', status: 'Off', label: '<b>&"x"' });
  assert.match(svg, /&lt;b&gt;&amp;&quot;x&quot;/);
  assert.doesNotMatch(svg, /<b>/);
});

test('long labels are truncated with an ellipsis', () => {
  const svg = keySvg({ style: 'on', status: 'On', label: 'A very long living room label' });
  assert.match(svg, /A very long…/);
});

test('every style has its own colour set and renders', () => {
  const backgrounds = new Set();
  for (const style of ['on', 'off', 'unavailable', 'edit', 'trigger', 'sensor', 'warn']) {
    assert.ok(STYLES[style], style);
    backgrounds.add(STYLES[style].bg);
    assert.match(keySvg({ style, status: 'S', label: 'L' }), new RegExp(`fill="${STYLES[style].bg}"`));
  }
  assert.equal(backgrounds.size, 7);
});

test('value and unit are rendered when given', () => {
  const svg = keySvg({ style: 'on', status: 'On', label: 'Kitchen', value: '40', unit: '%' });
  assert.match(svg, />40%</);
});

test('no external resources are referenced', () => {
  const svg = keySvg({ style: 'edit', status: 'Edit', label: 'L', value: '1', unit: '%' });
  assert.doesNotMatch(svg, /href|url\(|https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
});

test('renderKeySvg returns valid base64 of the SVG', () => {
  const model = { style: 'on', status: 'On', label: 'Kitchen' };
  const b64 = renderKeySvg(model);
  assert.match(b64, /^[A-Za-z0-9+/]+=*$/);
  assert.equal(Buffer.from(b64, 'base64').toString('utf8'), keySvg(model));
});

// --- Feature 003: icon layout (data-model §5) ---------------------------------------------------

import { createHash } from 'node:crypto';

const PATH = 'M0 0H24V24H0Z';
const sha = (s) => createHash('sha256').update(s).digest('hex');

test('icon layout: icon + label', () => {
  const svg = keySvg({ style: 'on', status: 'On', label: 'Kitchen', icon: { path: PATH, color: '#ff0000' } });
  assert.match(svg, /<rect width="144" height="144" rx="20" fill="#1e293b"\/>/);
  assert.match(svg, /<path d="M0 0H24V24H0Z" fill="#ff0000" transform="translate\(30 10\) scale\(3\.5\)"\/>/);
  assert.match(svg, /y="118"[^>]*>Kitchen</);
  assert.doesNotMatch(svg, />On</, 'status is not rendered in the icon layout');
});

test('icon layout: icon + value + label', () => {
  const svg = keySvg({ style: 'on', status: 'On', label: 'Kitchen', value: 40, unit: '%', icon: { path: PATH, color: '#ff0000' } });
  assert.match(svg, /transform="translate\(38 6\) scale\(2\.8333\)"/);
  assert.match(svg, /y="92"[^>]*fill="#e2e8f0"[^>]*>40%</);
  assert.match(svg, /y="124"[^>]*>Kitchen</);
});

test('icon layout: value colour can be overridden (sensor warning)', () => {
  const svg = keySvg({ style: 'warn', label: 'Out', value: '35', unit: '°C', icon: { path: PATH, color: '#fb923c', valueColor: '#fb923c' } });
  assert.match(svg, /y="92"[^>]*fill="#fb923c"[^>]*>35°C</);
});

test('icon layout: icon only, and icon + value without label', () => {
  const only = keySvg({ style: 'trigger', status: 'Run', icon: { path: PATH, color: '#a78bfa' } });
  assert.match(only, /transform="translate\(24 24\) scale\(4\)"/);
  assert.doesNotMatch(only, /<text/);
  const valueOnly = keySvg({ style: 'sensor', value: '12.3', unit: '°C', icon: { path: PATH, color: '#5eead4' } });
  assert.match(valueOnly, /transform="translate\(38 10\) scale\(2\.8333\)"/);
  assert.match(valueOnly, /y="110"[^>]*>12\.3°C</);
});

test('icon layout: the path data is XML-escaped', () => {
  const svg = keySvg({ style: 'on', label: 'L', icon: { path: 'M0 0"/><script>', color: '#ffffff' } });
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /d="M0 0&quot;\/&gt;&lt;script&gt;"/);
});

test('regression: models without icon render byte-identical to 0.2.0', () => {
  const expected = {
    toggleOn: ['923bb20f1be60d1a538b52e898ba8310686a9b62c4681a94debbf386ee8fb759', { style: 'on', status: 'On', label: 'Kitchen', value: 40, unit: '%' }],
    toggleOff: ['e81bbc5688de5c99db6ef6afd00815ee0f18a26a8619496a9313999687e7006b', { style: 'off', status: 'Off', label: 'Hallway' }],
    sensor: ['9fbfdd594b3393ad8ee9784e64f4aa7fcb9fc2723f6f75b11c3ef5eba9b2ceca', { style: 'sensor', status: '', label: 'Outdoor', value: '12.3', unit: '°C' }],
    edit: ['32c7e8390a5238395c8506de8274de5461321fad62e712cfa6ba790cbb481653', { style: 'edit', badge: 'EDIT', status: 'Bright', label: 'Desk', value: 50, unit: '%' }],
    unavailable: ['42e0dff4206c4c3d6ec4130cd72f844f26229c1c0060bddac6520834454fc404', { style: 'unavailable', status: 'N/A', label: 'X' }],
    statusOnly: ['d2501dd7797be927a37b46b77027931fed8d248a63d7cefd8af0783652f0a791', { style: 'trigger', status: 'Run' }],
  };
  for (const [name, [hash, model]] of Object.entries(expected)) assert.equal(sha(keySvg(model)), hash, name);
});
