// Feature 004 US1: HA Toggle long-press mode "Dynamic Dial for selected values"
// (contracts/toggle-selected-values-settings.md §2, contracts/edit-session-targets.md §4).
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

const V = (entityId, attributeId) => ({ entityId, attributeId });
const values = (...list) => JSON.stringify(list);
const deskBrightness = V('light.desk', 'light.brightness');

const decodeIcon = (call) => (call ? Buffer.from(call.args[1], 'base64').toString('utf8') : '');
const keyIcon = (ctx) => decodeIcon(h.ud.lastCall('setBaseDataIcon', ctx));
const dialTitle = (ctx) => h.ud.lastCall('setFeedback', ctx)?.args[1]?.title?.text;

function addKey(entityId, extra = {}, key = '0_0') {
  const param = { longPress: 'edit_values', ...extra };
  if (entityId) param.entityId = entityId;
  return h.ud.emitAction('add', 'toggle', { key, param });
}
const addDynamic = (key = '1_0', extra = {}) => h.ud.emitAction('add', 'dynamicdial', { key, param: { ...extra } });
function hold(key = '0_0') {
  h.ud.emitAction('keydown', 'toggle', { key });
  h.clock.tick(500);
  h.ud.emitAction('keyup', 'toggle', { key });
}
function shortPress(key = '0_0') {
  h.ud.emitAction('keydown', 'toggle', { key });
  h.ud.emitAction('keyup', 'toggle', { key });
}
const rotate = (rotateEvent, key = '1_0') => h.ud.emitAction('dialrotate', 'dynamicdial', { key, rotateEvent });
const settings = (settings, key = '0_0') => h.ud.emitAction('didReceiveSettings', 'toggle', { key, settings });

test('a long press edits the selected value, not the key entity (US1 scenarios 1–2)', async () => {
  h = await createHarness();
  const key = addKey('switch.coffee', { editValues: values(deskBrightness) });
  const dial = addDynamic();
  hold();
  assert.equal(h.app.editSession.session.entityId, 'light.desk');
  assert.equal(dialTitle(dial), 'Desk Lamp');
  assert.match(keyIcon(key), />EDIT</);
  assert.match(keyIcon(key), />Desk Lamp</);
  assert.match(keyIcon(key), />100%</);
  rotate('left');
  await waitFor(() => h.server.messages('call_service').length === 1);
  await settle(30);
  const calls = h.server.messages('call_service');
  assert.equal(calls.length, 1);
  assert.deepEqual([calls[0].domain, calls[0].service, calls[0].target], ['light', 'turn_on', { entity_id: 'light.desk' }]);
});

test('the key label is ignored while a selected value is edited (US1 scenario 3)', async () => {
  h = await createHarness();
  const key = addKey('switch.coffee', { label: 'Coffee', editValues: values(deskBrightness) });
  addDynamic();
  hold();
  assert.match(keyIcon(key), />Desk Lamp</);
  assert.doesNotMatch(keyIcon(key), />Coffee</);
});

test('a short press ends edit mode; the next short press toggles the key entity (US1 scenario 4)', async () => {
  h = await createHarness();
  addKey('switch.coffee', { editValues: values(deskBrightness) });
  const dial = addDynamic();
  hold();
  shortPress();
  assert.equal(h.app.editSession.session, null);
  assert.equal(dialTitle(dial), 'Hold a key');
  await settle(30);
  assert.equal(h.server.messages('call_service').length, 0);
  shortPress();
  await waitFor(() => h.server.messages('call_service').length === 1);
  const call = h.server.messages('call_service')[0];
  assert.deepEqual([call.domain, call.service, call.target], ['switch', 'toggle', { entity_id: 'switch.coffee' }]);
});

for (const [name, editValues] of [
  ['a missing list', undefined],
  ['an empty list', ''],
  ['invalid JSON', 'not json'],
  ['only unusable values', values(V('light.hallway', 'light.brightness'))],
]) {
  test(`${name} shows an alert and toggles nothing (FR-008)`, async () => {
    h = await createHarness();
    const key = addKey('switch.coffee', editValues === undefined ? {} : { editValues });
    addDynamic();
    hold();
    assert.equal(h.ud.callsOf('showAlert', key).length, 1);
    assert.equal(h.app.editSession.session, null);
    await settle(30);
    assert.equal(h.server.messages('call_service').length, 0);
  });
}

test('a value other than the default edit value can be selected (colour temperature)', async () => {
  h = await createHarness();
  addKey('switch.coffee', { editValues: values(V('light.desk', 'light.color_temp')) });
  addDynamic();
  hold();
  rotate('right');
  await waitFor(() => h.server.messages('call_service').length === 1);
  assert.ok('color_temp_kelvin' in h.server.messages('call_service')[0].service_data);
});

test('values of domains outside the classic edit mode work (input_number)', async () => {
  h = await createHarness();
  addKey('switch.coffee', { editValues: values(V('input_number.volume_target', 'number.value')) });
  addDynamic();
  hold();
  assert.equal(h.app.editSession.session.attributeId, 'number.value');
  rotate('right');
  await waitFor(() => h.server.messages('call_service').length === 1);
  assert.equal(h.server.messages('call_service')[0].domain, 'input_number');
});

test('identical settings keep the session; a changed list or mode ends it (FR-016)', async () => {
  h = await createHarness();
  const base = { entityId: 'switch.coffee', longPress: 'edit_values', editValues: values(deskBrightness) };
  addKey('switch.coffee', { editValues: base.editValues });
  addDynamic();
  hold();
  settings({ ...base, editValues: values(V(' light.desk', 'light.brightness')) });
  assert.notEqual(h.app.editSession.session, null, 'same list, written differently');
  settings({ ...base, editValues: values(V('light.living_room', 'light.brightness')) });
  assert.equal(h.app.editSession.session, null, 'changed list');
  hold();
  assert.equal(h.app.editSession.session.entityId, 'light.living_room');
  settings({ ...base, editValues: values(V('light.living_room', 'light.brightness')), longPress: 'edit' });
  assert.equal(h.app.editSession.session, null, 'changed mode');
});

test('the classic edit mode is unchanged (SC-005)', async () => {
  h = await createHarness();
  h.ud.emitAction('add', 'toggle', { key: '0_0', param: { entityId: 'light.living_room' } });
  h.ud.emitAction('add', 'toggle', { key: '0_1', param: { entityId: 'light.desk', longPress: 'edit', editValues: values(V('cover.blinds', 'cover.position')) } });
  addDynamic();
  hold('0_0');
  assert.deepEqual([h.app.editSession.session.entityId, h.app.editSession.session.targets], ['light.living_room', []]);
  hold('0_1');
  assert.equal(h.app.editSession.session.entityId, 'light.desk', 'editValues is ignored in the edit mode');
});

test('a selected value of the key entity moves on when that entity becomes unavailable', async () => {
  h = await createHarness();
  addKey('light.living_room', { editValues: values(V('light.living_room', 'light.brightness'), deskBrightness) });
  addDynamic();
  hold();
  assert.equal(h.app.editSession.session.entityId, 'light.living_room');
  h.server.emitStateChanged('light.living_room', { ...rawState('light.living_room'), state: 'unavailable' });
  await waitFor(() => h.app.editSession.session?.entityId === 'light.desk', { message: 'moved to the desk lamp' });
});

test('a key without its own entity can still start edit mode for selected values', async () => {
  h = await createHarness();
  const key = addKey(null, { editValues: values(deskBrightness) });
  addDynamic();
  hold();
  assert.equal(h.app.editSession.session.entityId, 'light.desk');
  shortPress();
  assert.equal(h.app.editSession.session, null);
  shortPress();
  assert.equal(h.ud.callsOf('showAlert', key).length, 1);
  await settle(30);
  assert.equal(h.server.messages('call_service').length, 0);
});
