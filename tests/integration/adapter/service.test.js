import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../../support/app-harness.js';
import { waitFor, settle } from '../../support/wait.js';

let h;
afterEach(async () => {
  await h?.close();
  h = null;
});

const icon = (ctx) => Buffer.from(h.ud.lastCall('setBaseDataIcon', ctx)?.args[1] ?? '', 'base64').toString('utf8');
const add = (param, key = '0_0') => h.ud.emitAction('add', 'service', { key, param });
const run = (key = '0_0') => h.ud.emitAction('run', 'service', { key });

test('onRun sends exactly the configured domain, service, target and data (flat PI fields)', async () => {
  h = await createHarness();
  const ctx = add({ label: 'All on', domain: 'light', service: 'turn_on', target: 'light.living_room, light.desk', data: '{"brightness_pct": 100}' });
  assert.match(icon(ctx), />All on</);
  run();
  await waitFor(() => h.server.messages('call_service').length === 1);
  const c = h.server.messages('call_service')[0];
  assert.deepEqual([c.domain, c.service, c.target, c.service_data], [
    'light',
    'turn_on',
    { entity_id: ['light.living_room', 'light.desk'] },
    { brightness_pct: 100 },
  ]);
});

test('the contract object form is accepted as well, and no target is sent when none is configured', async () => {
  h = await createHarness();
  add({ domain: 'homeassistant', service: 'reload_all', target: { entity_id: [] }, data: {} });
  run();
  await waitFor(() => h.server.messages('call_service').length === 1);
  const c = h.server.messages('call_service')[0];
  assert.equal(c.target, undefined);
  assert.deepEqual(c.service_data, {});
});

test('invalid JSON data renders the error style instead of calling', async () => {
  h = await createHarness();
  const ctx = add({ domain: 'light', service: 'turn_on', data: '{oops' });
  assert.match(icon(ctx), />Invalid</);
  run();
  await settle(30);
  assert.equal(h.server.messages('call_service').length, 0);
  assert.equal(h.ud.callsOf('showAlert', ctx).length, 1);
});

test('an error result shows an alert and logs a warning; success flashes OK', async () => {
  h = await createHarness();
  const ctx = add({ domain: 'light', service: 'turn_on', target: 'light.desk' });
  run();
  await waitFor(() => />OK</.test(icon(ctx)), { message: 'confirmation' });
  h.clock.tick(1000);
  h.server.failNextCall('not_found', 'Service not found');
  run();
  await waitFor(() => h.ud.callsOf('showAlert', ctx).length === 1, { message: 'alert' });
  const warn = h.ud.callsOf('logMessage').find((c) => c.args[1] === 'warn');
  assert.match(warn.args[0], /light\.turn_on/);
  assert.doesNotMatch(warn.args[0], /light\.desk/);
});

// --- Feature 003, US4: service keys with a chosen icon (T051) -----------------------------------

import { keySvg } from '../../../src/domain/render/key-svg.js';
import { mdiLightbulbGroup } from '@mdi/js';

test('a service key with an icon name shows it with the label in the trigger colour', async () => {
  h = await createHarness();
  const ctx = add({ label: 'All on', domain: 'light', service: 'turn_on', icon: 'mdi:lightbulb-group' });
  assert.ok(icon(ctx).includes(`d="${mdiLightbulbGroup}"`));
  assert.match(icon(ctx), /fill="#a78bfa"/);
  assert.match(icon(ctx), />All on</);
});

test('a service key without an icon name renders exactly as in 0.2.0', async () => {
  h = await createHarness();
  const ctx = add({ label: 'All on', domain: 'light', service: 'turn_on' });
  assert.equal(icon(ctx), keySvg({ style: 'trigger', status: 'Run', label: 'All on' }));
});
