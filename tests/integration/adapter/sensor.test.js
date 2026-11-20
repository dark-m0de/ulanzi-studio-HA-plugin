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

test('renders value and unit on add', async () => {
  h = await createHarness();
  const ctx = h.ud.emitAction('add', 'sensor', { param: { entityId: 'sensor.outdoor_temperature' } });
  assert.match(icon(ctx), />12\.3°C</);
  assert.match(icon(ctx), />Outdoor Tem…</);
  assert.match(icon(ctx), new RegExp(`fill="${STYLES.sensor.bg}"`));
});

test('re-renders on state_changed and switches to the warn style beyond the thresholds', async () => {
  h = await createHarness();
  const ctx = h.ud.emitAction('add', 'sensor', { param: { entityId: 'sensor.outdoor_temperature', warnAbove: '30' } });
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
