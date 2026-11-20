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

const decodeIcon = (call) => (call ? Buffer.from(call.args[1], 'base64').toString('utf8') : '');
const keyIcon = (ctx) => decodeIcon(h.ud.lastCall('setBaseDataIcon', ctx));
const dialSvgOf = (ctx) => {
  const fb = h.ud.lastCall('setFeedback', ctx)?.args[1];
  return fb ? { title: fb.title.text, svg: Buffer.from(fb.icon.value.split(',')[1], 'base64').toString('utf8') } : null;
};

function addKey(entityId, key = '0_0', extra = {}) {
  return h.ud.emitAction('add', 'toggle', { key, param: { entityId, ...extra } });
}
function addDynamic(key = '1_0', extra = {}) {
  return h.ud.emitAction('add', 'dynamicdial', { key, param: { ...extra } });
}
function holdKey(key = '0_0') {
  h.ud.emitAction('keydown', 'toggle', { key });
  h.clock.tick(500);
}
const releaseKey = (key = '0_0') => h.ud.emitAction('keyup', 'toggle', { key });
const rotateDynamic = (rotateEvent, key = '1_0') => h.ud.emitAction('dialrotate', 'dynamicdial', { key, rotateEvent });

test('holding a light key renders the edit style before keyup and sends no toggle call (FR-031, FR-033)', async () => {
  h = await createHarness();
  const key = addKey('light.living_room');
  addDynamic();
  holdKey();
  assert.match(keyIcon(key), />EDIT</, 'edit style while still held');
  assert.match(keyIcon(key), />40%</);
  releaseKey();
  await settle(30);
  assert.equal(h.server.messages('call_service').length, 0);
});

test('Dynamic Dials show name and brightness while editing; rotation changes it and both stay in sync (FR-032a)', async () => {
  h = await createHarness();
  const key = addKey('light.living_room');
  const d1 = addDynamic('1_0');
  const d2 = addDynamic('1_1');
  holdKey();
  releaseKey();
  assert.equal(dialSvgOf(d1).title, 'Living Room');
  assert.match(dialSvgOf(d1).svg, />40%</);
  rotateDynamic('right', '1_0');
  assert.match(dialSvgOf(d1).svg, />45%</);
  assert.match(dialSvgOf(d2).svg, />45%</, 'second dial in sync');
  await waitFor(() => h.server.messages('call_service').length === 1);
  const call = h.server.messages('call_service')[0];
  assert.deepEqual([call.service, call.target, call.service_data], ['turn_on', { entity_id: 'light.living_room' }, { brightness_pct: 45 }]);
  assert.match(keyIcon(key), />45%</, 'the edit-mode key shows the live value');
});

test('dial B continues from the value set with dial A (60 % → 65 %)', async () => {
  h = await createHarness();
  const key = addKey('light.living_room');
  const d1 = addDynamic('1_0');
  addDynamic('1_1');
  holdKey();
  releaseKey();
  rotateDynamic('hold-right', '1_0'); // 40 → 60
  rotateDynamic('right', '1_1'); // 60 → 65
  assert.match(dialSvgOf(d1).svg, />65%</);
  assert.match(keyIcon(key), />65%</);
  h.clock.tick(200);
  await waitFor(() => h.server.messages('call_service').length === 2);
  assert.deepEqual(h.server.messages('call_service').map((c) => c.service_data.brightness_pct), [60, 65]);
});

test('a fixed HA Dial on another attribute of the same light shares the entity throttle', async () => {
  h = await createHarness();
  addKey('light.desk');
  addDynamic('1_0');
  h.ud.emitAction('add', 'dial', { key: '2_0', param: { entityId: 'light.desk', attributeId: 'light.color_temp' } });
  holdKey();
  releaseKey();
  rotateDynamic('left'); // brightness 95 → sent
  h.ud.emitAction('dialrotate', 'dial', { key: '2_0', rotateEvent: 'right' }); // colour temp pending
  await waitFor(() => h.server.messages('call_service').length === 1);
  await settle(30);
  assert.equal(h.server.messages('call_service').length, 1, 'second call waits for the window');
  h.clock.tick(200);
  await waitFor(() => h.server.messages('call_service').length === 2);
  assert.deepEqual(h.server.messages('call_service')[1].service_data, { color_temp_kelvin: 4100 });
});

test('a fixed HA Dial on a different entity is unaffected by edit mode', async () => {
  h = await createHarness();
  addKey('light.living_room');
  addDynamic('1_0');
  const fixed = h.ud.emitAction('add', 'dial', { key: '2_0', param: { entityId: 'fan.bedroom', attributeId: 'fan.percentage' } });
  holdKey();
  releaseKey();
  assert.equal(dialSvgOf(fixed).title, 'Bedroom Fan');
  h.ud.emitAction('dialrotate', 'dial', { key: '2_0', rotateEvent: 'right' });
  await waitFor(() => h.server.messages('call_service').length === 1);
  assert.equal(h.server.messages('call_service')[0].domain, 'fan');
});

test('a Dynamic Dial press during edit runs the press action on the edited entity', async () => {
  h = await createHarness();
  addKey('light.living_room');
  addDynamic('1_0');
  holdKey();
  releaseKey();
  h.ud.emitAction('dialdown', 'dynamicdial', { key: '1_0' });
  h.ud.emitAction('dialup', 'dynamicdial', { key: '1_0' });
  await waitFor(() => h.server.messages('call_service').length === 1);
  const call = h.server.messages('call_service')[0];
  assert.deepEqual([call.domain, call.service, call.target], ['light', 'toggle', { entity_id: 'light.living_room' }]);
});

test('a short press on the edit source key ends edit mode without toggling', async () => {
  h = await createHarness();
  const key = addKey('light.living_room');
  const dyn = addDynamic('1_0');
  holdKey();
  releaseKey();
  h.ud.emitAction('keydown', 'toggle', {});
  h.ud.emitAction('keyup', 'toggle', {});
  assert.doesNotMatch(keyIcon(key), />EDIT</);
  assert.equal(dialSvgOf(dyn).title, 'Hold a key');
  await settle(30);
  assert.equal(h.server.messages('call_service').length, 0);
});

test('10 s without input ends edit mode', async () => {
  h = await createHarness();
  const key = addKey('light.living_room');
  addDynamic('1_0');
  holdKey();
  releaseKey();
  h.clock.tick(9_000);
  rotateDynamic('right');
  h.clock.tick(9_000);
  assert.match(keyIcon(key), />EDIT</);
  h.clock.tick(1_000);
  assert.doesNotMatch(keyIcon(key), />EDIT</);
});

test('onSetActive(false) on the source key ends edit mode (V-06)', async () => {
  h = await createHarness();
  addKey('light.living_room');
  const dyn = addDynamic('1_0');
  holdKey();
  releaseKey();
  h.ud.emitAction('setactive', 'toggle', { active: false });
  assert.equal(h.app.editSession.session, null);
  assert.equal(dialSvgOf(dyn).title, 'Hold a key');
});

test('connection loss ends edit mode', async () => {
  h = await createHarness();
  addKey('light.living_room');
  addDynamic('1_0');
  holdKey();
  releaseKey();
  await h.server.restart();
  await waitFor(() => h.app.editSession.session === null, { message: 'session ended' });
});

test('the entity becoming unavailable ends edit mode', async () => {
  h = await createHarness();
  addKey('light.living_room');
  addDynamic('1_0');
  holdKey();
  releaseKey();
  h.server.emitStateChanged('light.living_room', { ...rawState('light.living_room'), state: 'unavailable' });
  await waitFor(() => h.app.editSession.session === null, { message: 'session ended' });
});

test('long-pressing another light key switches edit mode to it (FR-035)', async () => {
  h = await createHarness();
  const a = addKey('light.living_room', '0_0');
  const b = addKey('light.desk', '0_1');
  const dyn = addDynamic('1_0');
  holdKey('0_0');
  releaseKey('0_0');
  holdKey('0_1');
  releaseKey('0_1');
  assert.doesNotMatch(keyIcon(a), />EDIT</);
  assert.match(keyIcon(b), />EDIT</);
  assert.equal(dialSvgOf(dyn).title, 'Desk Lamp');
});

test('without a Dynamic Dial a long press shows the hint toast and does not toggle (FR-039)', async () => {
  h = await createHarness();
  addKey('light.living_room');
  holdKey();
  releaseKey();
  assert.deepEqual(h.ud.callsOf('toast').map((c) => c.args[0]), ['No Dynamic Dial']);
  await settle(30);
  assert.equal(h.server.messages('call_service').length, 0);
});

test('idle Dynamic Dials show the long-press hint and ignore rotation (FR-036)', async () => {
  h = await createHarness();
  const dyn = addDynamic('1_0');
  assert.deepEqual(h.ud.callsOf('setFeedbackLayout', dyn).map((c) => c.args[1]), ['$UA1']);
  assert.equal(dialSvgOf(dyn).title, 'Hold a key');
  rotateDynamic('right');
  h.ud.emitAction('dialdown', 'dynamicdial', { key: '1_0' });
  h.ud.emitAction('dialup', 'dynamicdial', { key: '1_0' });
  await settle(30);
  assert.equal(h.server.messages('call_service').length, 0);
  assert.equal(h.ud.callsOf('showAlert').length, 0);
});

test('removing the last Dynamic Dial ends edit mode', async () => {
  h = await createHarness();
  const key = addKey('light.living_room');
  addDynamic('1_0');
  holdKey();
  releaseKey();
  h.ud.emitClear([{ action: 'dynamicdial', key: '1_0' }]);
  assert.equal(h.app.editSession.session, null);
  assert.doesNotMatch(keyIcon(key), />EDIT</);
});

test('a long-pressed media player key → the Dynamic Dial sets volume_level 0–1 (US5)', async () => {
  h = await createHarness();
  const key = addKey('media_player.living_room');
  const dyn = addDynamic('1_0');
  holdKey();
  releaseKey();
  assert.match(keyIcon(key), />35%</);
  rotateDynamic('right');
  assert.match(dialSvgOf(dyn).svg, />40%</);
  await waitFor(() => h.server.messages('call_service').length === 1);
  const call = h.server.messages('call_service')[0];
  assert.deepEqual([call.domain, call.service, call.service_data], ['media_player', 'volume_set', { volume_level: 0.4 }]);
});

test('a long-pressed climate key → set_temperature in 0.5 steps, clamped to 7–30 (US5)', async () => {
  h = await createHarness();
  addKey('climate.office');
  const dyn = addDynamic('1_0');
  holdKey();
  releaseKey();
  rotateDynamic('right');
  assert.match(dialSvgOf(dyn).svg, />21.5°</);
  for (let i = 0; i < 10; i++) rotateDynamic('hold-right');
  assert.match(dialSvgOf(dyn).svg, />30°</);
  await waitFor(() => h.server.messages('call_service').length === 1);
  assert.deepEqual(h.server.messages('call_service')[0].service_data, { temperature: 21.5 });
  h.clock.tick(200);
  await waitFor(() => h.server.messages('call_service').length === 2);
  assert.deepEqual(h.server.messages('call_service')[1].service_data, { temperature: 30 });
});

test('entity.capabilities reports long-press eligibility for the new domains', async () => {
  h = await createHarness();
  for (const [entityId, eligible] of [['media_player.living_room', true], ['climate.office', true], ['cover.blinds', true], ['fan.bedroom', true], ['cover.garage', false], ['switch.coffee', false]]) {
    assert.equal((await h.piRequest('entity.capabilities', { entityId })).payload.longPressEligible, eligible, entityId);
  }
});
