import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../../support/app-harness.js';
import { waitFor, settle } from '../../support/wait.js';
import { mdiPalette, mdiWeatherNight } from '@mdi/js';

let h;
afterEach(async () => {
  await h?.close();
  h = null;
});

const icon = (ctx) => Buffer.from(h.ud.lastCall('setBaseDataIcon', ctx)?.args[1] ?? '', 'base64').toString('utf8');
const add = (entityId, key = '0_0') => h.ud.emitAction('add', 'scene', { key, param: { entityId } });
const run = (key = '0_0') => h.ud.emitAction('run', 'scene', { key });

test('onRun activates scenes and scripts and triggers automations', async () => {
  h = await createHarness();
  add('scene.evening', '0_0');
  add('script.good_night', '0_1');
  add('automation.morning', '0_2');
  run('0_0');
  run('0_1');
  run('0_2');
  await waitFor(() => h.server.messages('call_service').length === 3);
  assert.deepEqual(
    h.server.messages('call_service').map((c) => `${c.domain}.${c.service}:${c.target.entity_id}`),
    ['scene.turn_on:scene.evening', 'script.turn_on:script.good_night', 'automation.trigger:automation.morning'],
  );
});

test('the key shows its icon and label and confirms a successful run for about 1 s', async () => {
  h = await createHarness();
  const ctx = add('scene.evening');
  assert.ok(icon(ctx).includes(`d="${mdiPalette}"`), 'HA scene icon (feature 003)');
  assert.match(icon(ctx), />Evening</);
  run();
  await waitFor(() => />OK</.test(icon(ctx)), { message: 'confirmation' });
  assert.doesNotMatch(icon(ctx), /<path/, 'confirmation keeps the text layout (FR-014)');
  h.clock.tick(1000);
  assert.ok(icon(ctx).includes(`d="${mdiPalette}"`));
});

test('a script with a custom HA icon shows it in the trigger colour; show icon off → text layout', async () => {
  h = await createHarness();
  const ctx = add('script.good_night');
  assert.ok(icon(ctx).includes(`d="${mdiWeatherNight}"`), 'custom HA icon');
  assert.match(icon(ctx), /fill="#a78bfa"/);
  h.ud.emitAction('didReceiveSettings', 'scene', { settings: { entityId: 'script.good_night', showIcon: false } });
  assert.match(icon(ctx), />Run</);
  assert.doesNotMatch(icon(ctx), /<path/);
});

test('an error shows an alert and logs a warning', async () => {
  h = await createHarness();
  const ctx = add('scene.evening');
  h.server.failNextCall();
  run();
  await waitFor(() => h.ud.callsOf('showAlert', ctx).length === 1, { message: 'alert' });
  assert.ok(h.ud.callsOf('logMessage').some((c) => c.args[1] === 'warn'));
  assert.doesNotMatch(icon(ctx), />OK</);
});

test('keydown/keyup do not trigger (only run does), and other domains are rejected', async () => {
  h = await createHarness();
  add('scene.evening', '0_0');
  const wrong = add('switch.coffee', '0_1');
  h.ud.emitAction('keydown', 'scene', { key: '0_0' });
  h.ud.emitAction('keyup', 'scene', { key: '0_0' });
  run('0_1');
  await settle(30);
  assert.equal(h.server.messages('call_service').length, 0);
  assert.equal(h.ud.callsOf('showAlert', wrong).length, 1);
});
