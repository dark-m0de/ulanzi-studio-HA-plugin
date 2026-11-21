// Feature 002: configurable press action of the HA Dynamic Dial.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../../support/app-harness.js';
import { waitFor, settle } from '../../support/wait.js';

let h;
afterEach(async () => {
  await h?.close();
  h = null;
});

const keyIcon = (ctx) => Buffer.from(h.ud.lastCall('setBaseDataIcon', ctx)?.args[1] ?? '', 'base64').toString('utf8');
const dialTitle = (ctx) => h.ud.lastCall('setFeedback', ctx)?.args[1].title.text;
const calls = () => h.server.messages('call_service');

function setup({ entityId = 'light.living_room', dynamicSettings = {}, dials = ['1_0'] } = {}) {
  const key = h.ud.emitAction('add', 'toggle', { key: '0_0', param: { entityId } });
  const dynamics = dials.map((k) => h.ud.emitAction('add', 'dynamicdial', { key: k, param: { ...dynamicSettings } }));
  return { key, dynamics };
}
function startEdit() {
  h.ud.emitAction('keydown', 'toggle', { key: '0_0' });
  h.clock.tick(500);
  h.ud.emitAction('keyup', 'toggle', { key: '0_0' });
}
function pressDynamic(key = '1_0') {
  h.ud.emitAction('dialdown', 'dynamicdial', { key });
  h.ud.emitAction('dialup', 'dynamicdial', { key });
}

// --- US1 (T010) ----------------------------------------------------------------------------

test('default settings: a press during edit ends edit mode without any service call (FR-011, FR-012)', async () => {
  h = await createHarness();
  const { key, dynamics } = setup();
  startEdit();
  h.ud.emitAction('dialrotate', 'dynamicdial', { key: '1_0', rotateEvent: 'right' });
  await waitFor(() => calls().length === 1);
  pressDynamic();
  assert.equal(h.app.editSession.session, null);
  assert.doesNotMatch(keyIcon(key), />EDIT</);
  assert.equal(dialTitle(dynamics[0]), 'Hold a key');
  await settle(30);
  assert.equal(calls().length, 1, 'only the rotation was sent');
});

test('pressAction toggle: the edited entity is toggled and edit mode continues', async () => {
  h = await createHarness();
  setup({ dynamicSettings: { pressAction: 'toggle' } });
  startEdit();
  pressDynamic();
  await waitFor(() => calls().length === 1);
  assert.equal(`${calls()[0].domain}.${calls()[0].service}`, 'light.toggle');
  assert.notEqual(h.app.editSession.session, null);
});

test('pressAction none: nothing happens and edit mode continues', async () => {
  h = await createHarness();
  setup({ dynamicSettings: { pressAction: 'none' } });
  startEdit();
  pressDynamic();
  await settle(30);
  assert.equal(calls().length, 0);
  assert.notEqual(h.app.editSession.session, null);
  assert.equal(h.ud.callsOf('showAlert').length, 0);
});

test('without edit mode a press does nothing for every setting (FR-013)', async () => {
  h = await createHarness();
  for (const [i, pressAction] of ['end_edit', 'toggle', 'switch_value', 'none'].entries()) {
    h.ud.emitAction('add', 'dynamicdial', { key: `2_${i}`, param: { pressAction } });
    pressDynamic(`2_${i}`);
  }
  await settle(30);
  assert.equal(calls().length, 0);
  assert.equal(h.ud.callsOf('showAlert').length, 0);
  assert.equal(h.ud.callsOf('toast').length, 0);
});

test('a Dynamic Dial saved by 0.1.x (settings {}) ends editing on press (SC-004)', async () => {
  h = await createHarness();
  setup({ dynamicSettings: {} });
  startEdit();
  pressDynamic();
  assert.equal(h.app.editSession.session, null);
});

test('press after rotating while pressed: no press action', async () => {
  h = await createHarness();
  setup();
  startEdit();
  h.ud.emitAction('dialdown', 'dynamicdial', { key: '1_0' });
  h.ud.emitAction('dialrotate', 'dynamicdial', { key: '1_0', rotateEvent: 'hold-right' });
  h.ud.emitAction('dialup', 'dynamicdial', { key: '1_0' });
  assert.notEqual(h.app.editSession.session, null, 'edit mode continues');
});

// --- US3 (T027) ----------------------------------------------------------------------------

const dialCaption = (ctx) => {
  const fb = h.ud.lastCall('setFeedback', ctx)?.args[1];
  const svg = fb ? Buffer.from(fb.icon.value.split(',')[1], 'base64').toString('utf8') : '';
  return (svg.match(/class="caption"[^>]*>([^<]*)</) || [])[1] ?? null;
};

test('Dynamic Dials with switch_value switch the whole session; the key shows the active value (FR-022)', async () => {
  h = await createHarness();
  const { key, dynamics } = setup({ entityId: 'light.desk', dynamicSettings: { pressAction: 'switch_value' }, dials: ['1_0', '1_1'] });
  startEdit();
  assert.equal(dialCaption(dynamics[0]), 'Bright');
  pressDynamic('1_0');
  assert.equal(h.app.editSession.session.attributeId, 'light.color_temp');
  for (const d of dynamics) assert.equal(dialCaption(d), 'Colour');
  assert.match(keyIcon(key), />Colour</);
  assert.match(keyIcon(key), />4000K</);
});

test('a new session starts with brightness again (FR-023)', async () => {
  h = await createHarness();
  setup({ entityId: 'light.desk', dynamicSettings: { pressAction: 'switch_value' } });
  startEdit();
  pressDynamic();
  h.ud.emitAction('keydown', 'toggle', { key: '0_0' });
  h.ud.emitAction('keyup', 'toggle', { key: '0_0' });
  assert.equal(h.app.editSession.session, null);
  startEdit();
  assert.equal(h.app.editSession.session.attributeId, 'light.brightness');
});

test('switch_value with a single-value entity shows the hint, no alert, and keeps brightness', async () => {
  h = await createHarness();
  setup({ entityId: 'light.living_room', dynamicSettings: { pressAction: 'switch_value' } });
  startEdit();
  pressDynamic();
  assert.deepEqual(h.ud.callsOf('toast').map((c) => c.args[0]), ['hint.noOtherValue']);
  assert.equal(h.ud.callsOf('showAlert').length, 0);
  assert.equal(h.app.editSession.session.attributeId, 'light.brightness');
});
