// Regressions found on the device (2026-11-21):
// 1. With Ulanzi Studio open, selecting/pressing a key makes Studio re-send its settings
//    (add / paramfromapp). That must not end edit mode started by a long press on that key.
// 2. When the D200X dial display falls back to its idle clock, the plugin must not push dial
//    feedback for inactive contexts or re-send unchanged feedback on re-activation, otherwise the
//    dial briefly replaces the clock.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../../support/app-harness.js';

let h;
afterEach(async () => {
  await h?.close();
  h = null;
});

function setupEdit(entityId = 'light.living_room') {
  const key = h.ud.emitAction('add', 'toggle', { key: '0_0', param: { entityId, label: 'Lamp' } });
  const dial = h.ud.emitAction('add', 'dynamicdial', { key: '1_0', param: {} });
  h.ud.emitAction('keydown', 'toggle', { key: '0_0' });
  h.clock.tick(500);
  return { key, dial };
}

// --- 1: settings re-sent by Studio ---------------------------------------------------------

for (const cmd of ['add', 'paramfromapp', 'paramfromplugin', 'didReceiveSettings']) {
  test(`edit mode survives unchanged settings re-sent via ${cmd} while the key is held`, async () => {
    h = await createHarness();
    setupEdit();
    const settings = { entityId: 'light.living_room', label: 'Lamp' };
    h.ud.emitAction(cmd, 'toggle', { key: '0_0', param: settings, settings });
    h.ud.emitAction('keyup', 'toggle', { key: '0_0' });
    assert.notEqual(h.app.editSession.session, null);
  });
}

test('edit mode survives a label-only change of the source key', async () => {
  h = await createHarness();
  setupEdit();
  h.ud.emitAction('paramfromplugin', 'toggle', { key: '0_0', param: { entityId: 'light.living_room', label: 'Sofa' } });
  assert.notEqual(h.app.editSession.session, null);
});

test('edit mode ends when the source key is bound to another entity', async () => {
  h = await createHarness();
  setupEdit();
  h.ud.emitAction('paramfromplugin', 'toggle', { key: '0_0', param: { entityId: 'light.desk' } });
  assert.equal(h.app.editSession.session, null);
});

test('edit-mode transitions are logged with their reason, without entity IDs', async () => {
  h = await createHarness();
  setupEdit();
  h.clock.tick(10_000);
  const info = h.ud.callsOf('logMessage').filter((c) => c.args[1] === 'info').map((c) => c.args[0]);
  assert.ok(info.some((m) => /edit mode started/.test(m)));
  assert.ok(info.some((m) => /edit mode ended \(timeout\)/.test(m)));
  assert.doesNotMatch(info.join('\n'), /light\.living_room/);
});

// --- 2: dial feedback while inactive -------------------------------------------------------

test('an inactive Dynamic Dial gets no feedback; on re-activation only changed content is sent', async () => {
  h = await createHarness();
  const { dial } = setupEdit();
  h.ud.emitAction('keyup', 'toggle', { key: '0_0' });
  const count = () => h.ud.callsOf('setFeedback', dial).length;

  h.ud.emitAction('setactive', 'dynamicdial', { key: '1_0', active: false });
  const before = count();
  h.clock.tick(10_000); // edit mode times out while the display shows the idle clock
  assert.equal(h.app.editSession.session, null);
  assert.equal(count(), before, 'no feedback while inactive');

  h.ud.emitAction('setactive', 'dynamicdial', { key: '1_0', active: true });
  assert.equal(count(), before + 1, 'changed content is sent once on re-activation');
  assert.equal(h.ud.lastCall('setFeedback', dial).args[1].title.text, 'Hold a key');

  h.ud.emitAction('setactive', 'dynamicdial', { key: '1_0', active: false });
  h.ud.emitAction('setactive', 'dynamicdial', { key: '1_0', active: true });
  assert.equal(count(), before + 1, 'unchanged content is not re-sent');
});

test('an HA Dial does not re-send unchanged feedback when it becomes active again', async () => {
  h = await createHarness();
  const dial = h.ud.emitAction('add', 'dial', { key: '1_1', param: { entityId: 'light.living_room', attributeId: 'light.brightness' } });
  const count = () => h.ud.callsOf('setFeedback', dial).length;
  const before = count();
  h.ud.emitAction('setactive', 'dial', { key: '1_1', active: false });
  h.ud.emitAction('setactive', 'dial', { key: '1_1', active: true });
  assert.equal(count(), before);
});

// --- 2b: edit-mode timeout while the dial display shows the idle clock ---------------------
// Studio does not report the idle clock as "inactive", so a feedback sent on timeout briefly
// replaces the clock. After a timeout the Dynamic Dial therefore keeps its display and shows the
// idle hint only with the next user input on the deck (which wakes the display anyway).

test('after an edit-mode timeout the Dynamic Dial sends nothing until the next input', async () => {
  h = await createHarness();
  const { dial } = setupEdit();
  h.ud.emitAction('keyup', 'toggle', { key: '0_0' });
  h.ud.emitAction('dialrotate', 'dynamicdial', { key: '1_0', rotateEvent: 'right' });
  const count = () => h.ud.callsOf('setFeedback', dial).length;
  h.clock.tick(5_000);
  const before = count();
  h.clock.tick(10_000);
  assert.equal(h.app.editSession.session, null);
  assert.equal(count(), before, 'no feedback on timeout');

  h.ud.emitAction('add', 'toggle', { key: '0_5', param: { entityId: 'switch.coffee' } });
  h.ud.emitAction('keydown', 'toggle', { key: '0_5' });
  assert.equal(count(), before + 1, 'the next input shows the idle hint');
  assert.equal(h.ud.lastCall('setFeedback', dial).args[1].title.text, 'Hold a key');
});

test('rotating the Dynamic Dial after a timeout shows the idle hint immediately', async () => {
  h = await createHarness();
  const { dial } = setupEdit();
  h.ud.emitAction('keyup', 'toggle', { key: '0_0' });
  h.clock.tick(10_000);
  h.ud.emitAction('dialrotate', 'dynamicdial', { key: '1_0', rotateEvent: 'right' });
  assert.equal(h.ud.lastCall('setFeedback', dial).args[1].title.text, 'Hold a key');
});

test('other ways of ending edit mode still update the Dynamic Dial at once', async () => {
  h = await createHarness();
  const { dial } = setupEdit();
  h.ud.emitAction('keyup', 'toggle', { key: '0_0' });
  h.ud.emitAction('keydown', 'toggle', { key: '0_0' });
  h.ud.emitAction('keyup', 'toggle', { key: '0_0' }); // short press on the source key
  assert.equal(h.app.editSession.session, null);
  assert.equal(h.ud.lastCall('setFeedback', dial).args[1].title.text, 'Hold a key');
});
