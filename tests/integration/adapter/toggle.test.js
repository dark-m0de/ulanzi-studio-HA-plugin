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

/** Decodes the last icon sent for a context. */
function lastIcon(ud, context) {
  const call = ud.lastCall('setBaseDataIcon', context);
  return call ? Buffer.from(call.args[1], 'base64').toString('utf8') : '';
}

function addToggle(entityId, key = '0_0', extra = {}) {
  return h.ud.emitAction('add', 'toggle', { key, param: { entityId, ...extra } });
}

function press(context, { key = '0_0' } = {}) {
  h.ud.emitAction('keydown', 'toggle', { key });
  h.ud.emitAction('keyup', 'toggle', { key });
  return context;
}

test('onAdd renders the current state of the entity', async () => {
  h = await createHarness();
  const ctx = addToggle('light.living_room');
  const svg = lastIcon(h.ud, ctx);
  assert.match(svg, />On</);
  assert.match(svg, />Living Room</);
  assert.match(svg, />40%</);
  assert.equal(h.ud.lastCall('setBaseDataIcon', ctx).args[2], '');
});

test('a short press sends <domain>.toggle; onRun is ignored (no double toggle)', async () => {
  h = await createHarness();
  const ctx = addToggle('switch.coffee');
  press(ctx);
  h.ud.emitAction('run', 'toggle', {});
  await waitFor(() => h.server.messages('call_service').length >= 1);
  await settle(30);
  const calls = h.server.messages('call_service');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].domain, 'switch');
  assert.equal(calls[0].service, 'toggle');
  assert.deepEqual(calls[0].target, { entity_id: 'switch.coffee' });
});

test('a long press without edit support falls back to toggling (Story 4 scenario 5)', async () => {
  h = await createHarness();
  addToggle('switch.coffee');
  h.ud.emitAction('keydown', 'toggle', {});
  h.clock.tick(500);
  h.ud.emitAction('keyup', 'toggle', {});
  await waitFor(() => h.server.messages('call_service').length === 1);
});

test('state_changed re-renders the key', async () => {
  h = await createHarness();
  const ctx = addToggle('switch.coffee');
  assert.match(lastIcon(h.ud, ctx), />Off</);
  h.server.emitStateChanged('switch.coffee', { ...rawState('switch.coffee'), state: 'on' });
  await waitFor(() => />On</.test(lastIcon(h.ud, ctx)), { message: 'icon shows On' });
});

test('a failed call shows an alert and logs a warning without entity ids (FR-040)', async () => {
  h = await createHarness();
  const ctx = addToggle('switch.coffee');
  h.server.failNextCall('service_validation_error', 'nope');
  press(ctx);
  await waitFor(() => h.ud.callsOf('showAlert', ctx).length === 1, { message: 'alert' });
  const warns = h.ud.callsOf('logMessage').filter((c) => c.args[1] === 'warn');
  assert.equal(warns.length, 1);
  assert.doesNotMatch(warns[0].args[0], /switch\.coffee/);
});

test('pressing while disconnected or with a missing entity shows an alert and sends nothing', async () => {
  h = await createHarness();
  const missing = addToggle('light.deleted', '0_1');
  press(missing, { key: '0_1' });
  assert.equal(h.ud.callsOf('showAlert', missing).length, 1);
  const ctx = addToggle('switch.coffee');
  await h.server.stop();
  await waitFor(() => h.app.client.status === 'reconnecting');
  press(ctx);
  assert.equal(h.ud.callsOf('showAlert', ctx).length, 1);
  assert.equal(h.server.messages('call_service').length, 0);
});

test('two keys bound to the same entity both update', async () => {
  h = await createHarness();
  const a = addToggle('switch.coffee', '0_0');
  const b = addToggle('switch.coffee', '0_1');
  h.server.emitStateChanged('switch.coffee', { ...rawState('switch.coffee'), state: 'on' });
  await waitFor(() => />On</.test(lastIcon(h.ud, a)) && />On</.test(lastIcon(h.ud, b)), { message: 'both keys on' });
});

test('keys render the disconnected style while HA is unreachable and recover afterwards', async () => {
  h = await createHarness();
  const ctx = addToggle('switch.coffee');
  await h.server.restart();
  await waitFor(() => />Offline</.test(lastIcon(h.ud, ctx)), { message: 'offline icon' });
  h.clock.tick(1_000);
  await waitFor(() => />Off</.test(lastIcon(h.ud, ctx)) && !/>Offline</.test(lastIcon(h.ud, ctx)), { message: 'recovered icon' });
});

test('changed settings rebind the key to another entity', async () => {
  h = await createHarness();
  const ctx = addToggle('switch.coffee');
  h.ud.emitAction('paramfromplugin', 'toggle', { param: { entityId: 'light.living_room', label: 'Sofa' } });
  assert.match(lastIcon(h.ud, ctx), />Sofa</);
  h.server.emitStateChanged('switch.coffee', { ...rawState('switch.coffee'), state: 'on' });
  await settle(30);
  assert.match(lastIcon(h.ud, ctx), />Sofa</, 'old entity no longer drives this key');
});

test('identical renders are not re-sent, but setActive(true) forces a render', async () => {
  h = await createHarness();
  const ctx = addToggle('switch.coffee');
  const count = () => h.ud.callsOf('setBaseDataIcon', ctx).length;
  const before = count();
  h.server.emitStateChanged('light.desk', rawState('light.desk'));
  h.ud.emitAction('setactive', 'toggle', { active: false });
  await settle(30);
  assert.equal(count(), before);
  h.ud.emitAction('setactive', 'toggle', { active: true });
  assert.equal(count(), before + 1);
});
