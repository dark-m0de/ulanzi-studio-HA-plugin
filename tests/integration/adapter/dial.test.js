import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../../support/app-harness.js';
import { rawState } from '../../support/fixtures/index.js';
import { waitFor, settle } from '../../support/wait.js';

let h;
afterEach(async () => {
  await h?.close();
  h = null;
});

function addDial(entityId, attributeId, key = '0_0', extra = {}) {
  return h.ud.emitAction('add', 'dial', { key, param: { entityId, attributeId, ...extra } });
}
const rotate = (rotateEvent, key = '0_0') => h.ud.emitAction('dialrotate', 'dial', { key, rotateEvent });
const lastFeedback = (ctx) => h.ud.lastCall('setFeedback', ctx)?.args[1];

test('onAdd sets the $UA1 layout once and renders name and value', async () => {
  h = await createHarness();
  const ctx = addDial('light.living_room', 'light.brightness');
  assert.deepEqual(h.ud.callsOf('setFeedbackLayout', ctx).map((c) => c.args[1]), ['$UA1']);
  assert.equal(lastFeedback(ctx).title.text, 'Living Room');
  assert.match(Buffer.from(lastFeedback(ctx).icon.value.split(',')[1], 'base64').toString(), />40%</);
  h.ud.emitAction('paramfromplugin', 'dial', { param: { entityId: 'light.desk', attributeId: 'light.brightness' } });
  assert.equal(h.ud.callsOf('setFeedbackLayout', ctx).length, 1, 'layout is not set again');
});

test('rotation updates the display synchronously and sends throttled light.turn_on (FR-024, SC-003)', async () => {
  h = await createHarness();
  const ctx = addDial('light.living_room', 'light.brightness');
  const before = h.ud.callsOf('setFeedback', ctx).length;
  rotate('right');
  assert.equal(h.ud.callsOf('setFeedback', ctx).length, before + 1, 'feedback emitted inside the handler');
  assert.equal(lastFeedback(ctx).title.text, 'Living Room');
  rotate('right');
  rotate('right');
  await waitFor(() => h.server.messages('call_service').length === 1);
  h.clock.tick(200);
  await waitFor(() => h.server.messages('call_service').length === 2, { message: 'trailing call' });
  const calls = h.server.messages('call_service');
  assert.deepEqual(calls.map((c) => c.service_data.brightness_pct), [45, 55]);
  assert.equal(calls[0].service, 'turn_on');
  assert.deepEqual(calls[0].target, { entity_id: 'light.living_room' });
});

test('while disconnected rotation sends nothing, alerts, drops pending calls and shows offline', async () => {
  h = await createHarness();
  const ctx = addDial('light.living_room', 'light.brightness');
  rotate('right');
  rotate('right'); // pending
  await waitFor(() => h.server.messages('call_service').length === 1);
  await h.server.restart();
  await waitFor(() => h.app.client.status === 'reconnecting');
  rotate('right');
  assert.equal(h.ud.callsOf('showAlert', ctx).length, 1);
  assert.match(Buffer.from(lastFeedback(ctx).icon.value.split(',')[1], 'base64').toString(), /Offline/);
  h.clock.tick(200);
  h.clock.tick(1000);
  await waitFor(() => h.app.client.status === 'connected');
  await settle(50);
  assert.equal(h.server.messages('call_service').length, 1, 'no stale value is sent after reconnect');
});

test('a dial press toggles the light; with a media player it toggles play/pause (FR-026)', async () => {
  h = await createHarness();
  addDial('light.living_room', 'light.brightness', '0_0');
  addDial('media_player.living_room', 'media_player.volume', '0_1');
  h.ud.emitAction('dialdown', 'dial', { key: '0_0' });
  h.ud.emitAction('dialup', 'dial', { key: '0_0' });
  h.ud.emitAction('dialdown', 'dial', { key: '0_1' });
  h.ud.emitAction('dialup', 'dial', { key: '0_1' });
  await waitFor(() => h.server.messages('call_service').length === 2);
  assert.deepEqual(h.server.messages('call_service').map((c) => `${c.domain}.${c.service}`), ['light.toggle', 'media_player.media_play_pause']);
});

test('rotating while pressed (hold-*) does not trigger the press action on release', async () => {
  h = await createHarness();
  addDial('light.living_room', 'light.brightness');
  h.ud.emitAction('dialdown', 'dial', {});
  rotate('hold-right');
  h.ud.emitAction('dialup', 'dial', {});
  await waitFor(() => h.server.messages('call_service').length === 1);
  await settle(30);
  const calls = h.server.messages('call_service');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].service_data.brightness_pct, 60);
});

test('an external state change updates the display (FR-027)', async () => {
  h = await createHarness();
  const ctx = addDial('light.living_room', 'light.brightness');
  h.server.emitStateChanged('light.living_room', { ...rawState('light.living_room'), attributes: { ...rawState('light.living_room').attributes, brightness: 255 } });
  await waitFor(() => /100%/.test(Buffer.from(lastFeedback(ctx).icon.value.split(',')[1], 'base64').toString()), { message: '100% shown' });
});

test('a failed call shows an alert and logs a warning (FR-040, Principle IV)', async () => {
  h = await createHarness();
  const ctx = addDial('light.living_room', 'light.brightness');
  h.server.failNextCall();
  rotate('right');
  await waitFor(() => h.ud.callsOf('showAlert', ctx).length === 1, { message: 'alert' });
  const warns = h.ud.callsOf('logMessage').filter((c) => c.args[1] === 'warn');
  assert.ok(warns.length >= 1);
  assert.doesNotMatch(warns.map((w) => w.args[0]).join('\n'), /light\.living_room/);
});

test('an unsupported attribute shows the unsupported state and ignores rotation', async () => {
  h = await createHarness();
  const ctx = addDial('light.hallway', 'light.brightness');
  rotate('right');
  await settle(30);
  assert.equal(h.server.messages('call_service').length, 0);
  assert.equal(lastFeedback(ctx).title.text, 'Hallway');
});
