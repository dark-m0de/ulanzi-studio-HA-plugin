import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../../support/app-harness.js';
import { rawState } from '../../support/fixtures/index.js';
import { STYLES } from '../../../src/domain/render/theme.js';
import { waitFor, settle } from '../../support/wait.js';

let h;
afterEach(async () => {
  await h?.close();
  h = null;
});

const icon = (ctx) => Buffer.from(h.ud.lastCall('setBaseDataIcon', ctx)?.args[1] ?? '', 'base64').toString('utf8');

test('renders value and unit on add (text layout when the icon is off)', async () => {
  h = await createHarness();
  const ctx = h.ud.emitAction('add', 'sensor', { param: { entityId: 'sensor.outdoor_temperature', showIcon: false } });
  assert.match(icon(ctx), />12\.3°C</);
  assert.match(icon(ctx), />Outdoor Tem…</);
  assert.match(icon(ctx), new RegExp(`fill="${STYLES.sensor.bg}"`));
});

test('re-renders on state_changed and switches to the warn style beyond the thresholds', async () => {
  h = await createHarness();
  const ctx = h.ud.emitAction('add', 'sensor', { param: { entityId: 'sensor.outdoor_temperature', warnAbove: '30', showIcon: false } });
  h.server.emitStateChanged('sensor.outdoor_temperature', { ...rawState('sensor.outdoor_temperature'), state: '31.5' });
  await waitFor(() => />31\.5°C</.test(icon(ctx)), { message: 'new value' });
  assert.match(icon(ctx), new RegExp(`fill="${STYLES.warn.bg}"`));
});

test('onRun and key presses do nothing', async () => {
  h = await createHarness();
  h.ud.emitAction('add', 'sensor', { param: { entityId: 'sensor.outdoor_temperature' } });
  h.ud.emitAction('run', 'sensor', {});
  h.ud.emitAction('keydown', 'sensor', {});
  h.ud.emitAction('keyup', 'sensor', {});
  await settle(30);
  assert.equal(h.server.messages('call_service').length, 0);
  assert.equal(h.ud.callsOf('showAlert').length, 0);
});

// --- Feature 003, US3: sensor icons (T044) ------------------------------------------------------

import { mdiSunThermometer, mdiThermometer } from '@mdi/js';

test('sensor key shows the integration icon, value and label; warning colours icon and value', async () => {
  h = await createHarness();
  const ctx = h.ud.emitAction('add', 'sensor', { param: { entityId: 'sensor.outdoor_temperature', warnAbove: '10' } });
  await waitFor(() => icon(ctx).includes(`d="${mdiSunThermometer}"`), { message: 'platform icon' });
  assert.match(icon(ctx), /y="92"[^>]*fill="#fb923c"[^>]*>12\.3°C</);
  assert.match(icon(ctx), /<path d="[^"]+" fill="#fb923c"/);
  assert.match(icon(ctx), />Outdoor Tem…</);
});

test('platform icons are requested once per connection, even for several keys', async () => {
  h = await createHarness();
  const a = h.ud.emitAction('add', 'sensor', { key: '0_0', param: { entityId: 'sensor.outdoor_temperature' } });
  const b = h.ud.emitAction('add', 'sensor', { key: '0_1', param: { entityId: 'sensor.outdoor_temperature' } });
  await waitFor(() => icon(a).includes(mdiSunThermometer) && icon(b).includes(mdiSunThermometer), { message: 'both keys' });
  await settle(30);
  const requests = h.server.messages('frontend/get_icons').filter((m) => m.category === 'entity');
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].integration, ['demo_platform']);
});

test('sensor key without integration icon uses the component icon; show icon off → text layout', async () => {
  h = await createHarness();
  const ctx = h.ud.emitAction('add', 'sensor', { param: { entityId: 'sensor.outdoor_temperature', icon: 'mdi:thermometer' } });
  assert.ok(icon(ctx).includes(`d="${mdiThermometer}"`), 'override');
  h.ud.emitAction('didReceiveSettings', 'sensor', { settings: { entityId: 'sensor.outdoor_temperature', showIcon: false } });
  assert.doesNotMatch(icon(ctx), /<path/);
});
