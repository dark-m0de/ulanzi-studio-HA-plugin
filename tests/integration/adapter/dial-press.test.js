// Feature 002: configurable press action of the HA Dial.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../../support/app-harness.js';
import { waitFor, settle } from '../../support/wait.js';

let h;
afterEach(async () => {
  await h?.close();
  h = null;
});

function addDial(entityId, attributeId, extra = {}, key = '0_0') {
  return h.ud.emitAction('add', 'dial', { key, param: { entityId, attributeId, ...extra } });
}
function press(key = '0_0') {
  h.ud.emitAction('dialdown', 'dial', { key });
  h.ud.emitAction('dialup', 'dial', { key });
}
const calls = () => h.server.messages('call_service');
const warnLogs = () => h.ud.callsOf('logMessage').filter((c) => c.args[1] === 'warn');

// --- Foundational (T005) -------------------------------------------------------------------

test('an HA Dial without pressAction keeps the feature-001 default (FR-002)', async () => {
  h = await createHarness();
  addDial('light.living_room', 'light.brightness', {}, '0_0');
  addDial('media_player.living_room', 'media_player.volume', {}, '0_1');
  press('0_0');
  press('0_1');
  await waitFor(() => calls().length === 2);
  assert.deepEqual(calls().map((c) => `${c.domain}.${c.service}`), ['light.toggle', 'media_player.media_play_pause']);
});

test('a saved but unsupported press action alerts, logs a warning and sends nothing (FR-032)', async () => {
  h = await createHarness();
  const ctx = addDial('light.living_room', 'light.brightness', { pressAction: 'mute' });
  press();
  assert.equal(h.ud.callsOf('showAlert', ctx).length, 1);
  assert.equal(warnLogs().length, 1);
  assert.doesNotMatch(warnLogs()[0].args[0], /light\.living_room/);
  await settle(30);
  assert.equal(calls().length, 0);
});

test('a press after rotating while pressed triggers no press action (FR-030)', async () => {
  h = await createHarness();
  addDial('light.living_room', 'light.brightness');
  h.ud.emitAction('dialdown', 'dial', {});
  h.ud.emitAction('dialrotate', 'dial', { rotateEvent: 'hold-right' });
  h.ud.emitAction('dialup', 'dial', {});
  await waitFor(() => calls().length === 1);
  await settle(30);
  assert.equal(calls().length, 1);
  assert.equal(calls()[0].service, 'turn_on', 'only the rotation was sent');
});

test('holding the dial without rotating acts like a normal press on release (FR-035)', async () => {
  h = await createHarness();
  addDial('light.living_room', 'light.brightness');
  h.ud.emitAction('dialdown', 'dial', {});
  h.clock.tick(2000);
  h.ud.emitAction('dialup', 'dial', {});
  await waitFor(() => calls().length === 1);
  assert.equal(calls()[0].service, 'toggle');
});

// --- US2 (T017) ----------------------------------------------------------------------------

const lastSvg = (ctx) => {
  const fb = h.ud.lastCall('setFeedback', ctx)?.args[1];
  return fb ? Buffer.from(fb.icon.value.split(',')[1], 'base64').toString('utf8') : '';
};

test('favourite 100 % sets the brightness and the display shows it synchronously (FR-004, SC-002)', async () => {
  h = await createHarness();
  const ctx = addDial('light.living_room', 'light.brightness', { pressAction: 'favorite', favoriteValue: '100' });
  h.ud.emitAction('dialdown', 'dial', {});
  const before = h.ud.callsOf('setFeedback', ctx).length;
  h.ud.emitAction('dialup', 'dial', {});
  assert.ok(h.ud.callsOf('setFeedback', ctx).length > before, 'feedback emitted inside the handler');
  assert.match(lastSvg(ctx), />100%</);
  await waitFor(() => calls().length === 1);
  assert.deepEqual([calls()[0].service, calls()[0].service_data], ['turn_on', { brightness_pct: 100 }]);
});

test('favourite on a light that is off turns it on', async () => {
  h = await createHarness();
  h.server.emitStateChanged('light.living_room', { entity_id: 'light.living_room', state: 'off', attributes: { friendly_name: 'Living Room', supported_color_modes: ['brightness'] } });
  await waitFor(() => h.app.store.get('light.living_room')?.state === 'off');
  addDial('light.living_room', 'light.brightness', { pressAction: 'favorite', favoriteValue: '60' });
  press();
  await waitFor(() => calls().length === 1);
  assert.deepEqual([calls()[0].service, calls()[0].service_data], ['turn_on', { brightness_pct: 60 }]);
});

test('favourite colour temperature is set and clamped to the lamp range', async () => {
  h = await createHarness();
  addDial('light.desk', 'light.color_temp', { pressAction: 'favorite', favoriteValue: '2700' }, '0_0');
  addDial('light.living_room', 'light.brightness', {}, '0_9');
  press('0_0');
  await waitFor(() => calls().length === 1);
  assert.deepEqual(calls()[0].service_data, { color_temp_kelvin: 2700 });
  h.ud.emitAction('paramfromplugin', 'dial', { key: '0_0', param: { entityId: 'light.desk', attributeId: 'light.color_temp', pressAction: 'favorite', favoriteValue: '1000' } });
  h.clock.tick(200);
  press('0_0');
  h.clock.tick(200);
  await waitFor(() => calls().length === 2);
  assert.deepEqual(calls()[1].service_data, { color_temp_kelvin: 2200 });
});

test('favourite on an input_number sets the value', async () => {
  h = await createHarness();
  addDial('input_number.volume_target', 'number.value', { pressAction: 'favorite', favoriteValue: '4' });
  press();
  await waitFor(() => calls().length === 1);
  assert.deepEqual([calls()[0].domain, calls()[0].service, calls()[0].service_data], ['input_number', 'set_value', { value: 4 }]);
});

test('service sends exactly the configured call; invalid JSON alerts without a call', async () => {
  h = await createHarness();
  addDial('light.living_room', 'light.brightness', { pressAction: 'service', pressDomain: 'scene', pressServiceName: 'turn_on', pressTarget: 'scene.evening' }, '0_0');
  const bad = addDial('light.living_room', 'light.brightness', { pressAction: 'service', pressDomain: 'light', pressServiceName: 'turn_on', pressData: '{oops' }, '0_1');
  press('0_0');
  press('0_1');
  await waitFor(() => calls().length === 1);
  await settle(30);
  assert.equal(calls().length, 1);
  assert.deepEqual([calls()[0].domain, calls()[0].service, calls()[0].target], ['scene', 'turn_on', { entity_id: 'scene.evening' }]);
  assert.equal(h.ud.callsOf('showAlert', bad).length, 1);
});

test('a failing service press alerts and logs a warning without entity IDs (FR-033)', async () => {
  h = await createHarness();
  const ctx = addDial('light.living_room', 'light.brightness', { pressAction: 'service', pressDomain: 'light', pressServiceName: 'turn_on', pressTarget: 'light.desk' });
  h.server.failNextCall('service_validation_error', 'nope');
  press();
  await waitFor(() => h.ud.callsOf('showAlert', ctx).length === 1, { message: 'alert' });
  assert.equal(warnLogs().length, 1);
  assert.match(warnLogs()[0].args[0], /light\.turn_on/);
  assert.doesNotMatch(warnLogs()[0].args[0], /light\.desk|light\.living_room/);
});

test('none sends nothing', async () => {
  h = await createHarness();
  addDial('light.living_room', 'light.brightness', { pressAction: 'none' });
  press();
  await settle(30);
  assert.equal(calls().length, 0);
  assert.equal(h.ud.callsOf('showAlert').length, 0);
});

test('while disconnected, favourite and service alert and send nothing', async () => {
  h = await createHarness();
  const fav = addDial('light.living_room', 'light.brightness', { pressAction: 'favorite', favoriteValue: '100' }, '0_0');
  const svc = addDial('light.living_room', 'light.brightness', { pressAction: 'service', pressDomain: 'light', pressServiceName: 'turn_on' }, '0_1');
  await h.server.restart();
  await waitFor(() => h.app.client.status === 'reconnecting');
  press('0_0');
  press('0_1');
  assert.equal(h.ud.callsOf('showAlert', fav).length, 1);
  assert.equal(h.ud.callsOf('showAlert', svc).length, 1);
  assert.equal(calls().length, 0);
});

// --- US3 (T027) ----------------------------------------------------------------------------

const caption = (ctx) => (lastSvg(ctx).match(/class="caption"[^>]*>([^<]*)</) || [])[1] ?? null;

test('switch_value on light.desk switches to colour temperature and back; rotation follows (US3)', async () => {
  h = await createHarness();
  const ctx = addDial('light.desk', 'light.brightness', { pressAction: 'switch_value' });
  assert.equal(caption(ctx), 'Bright');
  press();
  assert.equal(caption(ctx), 'Colour');
  assert.match(lastSvg(ctx), />4000K</);
  h.ud.emitAction('dialrotate', 'dial', { rotateEvent: 'right' });
  await waitFor(() => calls().length === 1);
  assert.deepEqual(calls()[0].service_data, { color_temp_kelvin: 4100 });
  press();
  assert.equal(caption(ctx), 'Bright');
});

test('switch_value on a single-value entity shows the hint and changes nothing (FR-025)', async () => {
  h = await createHarness();
  const ctx = addDial('light.living_room', 'light.brightness', { pressAction: 'switch_value' });
  press();
  assert.deepEqual(h.ud.callsOf('toast').map((c) => c.args[0]), ['hint.noOtherValue']);
  assert.equal(h.ud.callsOf('showAlert', ctx).length, 0);
  assert.equal(caption(ctx), null, 'single-value entities show no caption');
});

test('changed settings reset a switched dial to its configured value (FR-024)', async () => {
  h = await createHarness();
  const ctx = addDial('light.desk', 'light.brightness', { pressAction: 'switch_value' });
  press();
  assert.equal(caption(ctx), 'Colour');
  h.ud.emitAction('paramfromplugin', 'dial', { param: { entityId: 'light.desk', attributeId: 'light.brightness', pressAction: 'switch_value', label: 'Desk' } });
  assert.equal(caption(ctx), 'Bright');
});

test('two HA Dials on the same light switch independently (spec edge case)', async () => {
  h = await createHarness();
  const a = addDial('light.desk', 'light.brightness', { pressAction: 'switch_value' }, '0_0');
  const b = addDial('light.desk', 'light.brightness', { pressAction: 'switch_value' }, '0_1');
  press('0_0');
  assert.equal(caption(a), 'Colour');
  assert.equal(caption(b), 'Bright');
});

test('while disconnected, switch_value and none still work locally (spec edge case)', async () => {
  h = await createHarness();
  const sw = addDial('light.desk', 'light.brightness', { pressAction: 'switch_value' }, '0_0');
  const none = addDial('light.desk', 'light.brightness', { pressAction: 'none' }, '0_1');
  await h.server.restart();
  await waitFor(() => h.app.client.status === 'reconnecting');
  press('0_0');
  press('0_1');
  assert.equal(caption(sw), 'Colour');
  assert.equal(h.ud.callsOf('showAlert', sw).length + h.ud.callsOf('showAlert', none).length, 0);
  assert.equal(calls().length, 0);
});

// --- US4 (T035) ----------------------------------------------------------------------------

test('every domain action sends exactly the expected call', async () => {
  h = await createHarness();
  const cases = [
    ['media_player.living_room', 'media_player.volume', 'mute', 'media_player.volume_mute', { is_volume_muted: true }],
    ['media_player.living_room', 'media_player.volume', 'next_track', 'media_player.media_next_track', {}],
    ['climate.office', 'climate.temperature', 'hvac_cycle', 'climate.set_hvac_mode', { hvac_mode: 'auto' }],
    ['climate.office', 'climate.temperature', 'preset_cycle', 'climate.set_preset_mode', { preset_mode: 'eco' }],
    ['fan.bedroom', 'fan.percentage', 'preset_cycle', 'fan.set_preset_mode', { preset_mode: 'sleep' }],
    ['fan.bedroom', 'fan.percentage', 'oscillate', 'fan.oscillate', { oscillating: true }],
    ['cover.blinds', 'cover.position', 'cover_stop_toggle', 'cover.toggle', {}],
  ];
  cases.forEach(([entityId, attributeId, pressAction], i) => addDial(entityId, attributeId, { pressAction }, `3_${i}`));
  cases.forEach((_, i) => press(`3_${i}`));
  await waitFor(() => calls().length === cases.length, { message: 'all calls' });
  assert.deepEqual(
    calls().map((c) => [`${c.domain}.${c.service}`, c.service_data]),
    cases.map(([, , , svc, data]) => [svc, data]),
  );
});

test('a moving cover is stopped', async () => {
  h = await createHarness();
  h.server.emitStateChanged('cover.blinds', { entity_id: 'cover.blinds', state: 'opening', attributes: { friendly_name: 'Blinds', supported_features: 15, current_position: 40 } });
  await waitFor(() => h.app.store.get('cover.blinds')?.state === 'opening');
  addDial('cover.blinds', 'cover.position', { pressAction: 'cover_stop_toggle' });
  press();
  await waitFor(() => calls().length === 1);
  assert.equal(`${calls()[0].domain}.${calls()[0].service}`, 'cover.stop_cover');
});
