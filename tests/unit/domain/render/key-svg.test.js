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
