// Feature 003, US1: Toggle keys show the HA icon for the current state (T022).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mdiLightbulb, mdiLightbulbOff, mdiDeskLamp } from '@mdi/js';
import { createHarness } from '../../support/app-harness.js';
import { rawState } from '../../support/fixtures/index.js';
import { waitFor, settle } from '../../support/wait.js';

let h;
afterEach(async () => {
  await h?.close();
  h = null;
});

function lastIcon(ud, context) {
  const call = ud.lastCall('setBaseDataIcon', context);
  return call ? Buffer.from(call.args[1], 'base64').toString('utf8') : '';
}
const hasPath = (svg, path, color) => svg.includes(`<path d="${path}"`) && (!color || svg.includes(`fill="${color}"`));
const addToggle = (entityId, key = '0_0', extra = {}) => h.ud.emitAction('add', 'toggle', { key, param: { entityId, ...extra } });
const logs = (level) => h.ud.callsOf('logMessage').filter((c) => c.args[1] === level).map((c) => String(c.args[0]));
const status = async () => (await h.piRequest('connection.status', {})).payload;

test('fallback icon before HA icon data arrives, HA icon afterwards; iconsAvailable null → true', async () => {
  h = await createHarness({ connect: false });
  h.server.holdIcons();
  await h.connect();
  const ctx = addToggle('light.desk');
  assert.ok(hasPath(lastIcon(h.ud, ctx), mdiLightbulb, '#ffa757'), 'fallback bulb in the light colour');
  assert.equal((await status()).iconsAvailable, null);
  const rendersBefore = h.ud.callsOf('setBaseDataIcon', ctx).length;
  h.server.releaseIcons();
  await waitFor(() => h.app.iconData.loaded, { message: 'icon data loaded' });
  await waitFor(async () => (await status()).iconsAvailable === true, { message: 'iconsAvailable true' });
  assert.ok(hasPath(lastIcon(h.ud, ctx), mdiLightbulb, '#ffa757'));
  assert.ok(h.ud.callsOf('setBaseDataIcon', ctx).length >= rendersBefore);
});

test('state changes switch the icon; a new HA custom icon is followed without reconfiguration', async () => {
  h = await createHarness();
  const ctx = addToggle('light.desk');
  await waitFor(() => h.app.iconData.loaded, { message: 'icon data loaded' });
  h.server.emitStateChanged('light.desk', { ...rawState('light.desk'), state: 'off' });
  await waitFor(() => hasPath(lastIcon(h.ud, ctx), mdiLightbulbOff, '#94a3b8'), { message: 'bulb off' });
  const withIcon = rawState('light.desk');
  withIcon.attributes.icon = 'mdi:desk-lamp';
  h.server.emitStateChanged('light.desk', withIcon);
  await waitFor(() => hasPath(lastIcon(h.ud, ctx), mdiDeskLamp, '#ffa757'), { message: 'desk lamp' });
});

test('rapid state changes end with the icon of the last state', async () => {
  h = await createHarness();
  const ctx = addToggle('light.desk');
  await waitFor(() => h.app.iconData.loaded, { message: 'icon data loaded' });
  h.server.emitStateChanged('light.desk', { ...rawState('light.desk'), state: 'off' });
  h.server.emitStateChanged('light.desk', rawState('light.desk'));
  await settle(50);
  assert.ok(hasPath(lastIcon(h.ud, ctx), mdiLightbulb, '#ffa757'));
});

test('an unknown icon name is logged once at debug level without the entity id', async () => {
  h = await createHarness({ debug: true });
  const state = rawState('light.desk');
  state.attributes.icon = 'phu:x';
  h.server.emitStateChanged('light.desk', state);
  await waitFor(() => h.app.store.get('light.desk')?.attributes.icon === 'phu:x', { message: 'state applied' });
  const ctx = addToggle('light.desk');
  h.server.emitStateChanged('light.desk', { ...state, attributes: { ...state.attributes, brightness: 100 } });
  await settle(50);
  assert.ok(hasPath(lastIcon(h.ud, ctx), mdiLightbulb), 'falls back to the bulb');
  const lines = logs('debug').filter((l) => l.includes('icon not found'));
  assert.deepEqual(lines, ['icon not found: phu:x']);
});

test('HA without icon API: fallback icons, one warning, iconsAvailable false with a PI push', async () => {
  h = await createHarness({ connect: false });
  h.server.setIconsSupported(false);
  await status(); // opens the PI context so it receives pushes
  await h.connect();
  const ctx = addToggle('light.desk');
  await waitFor(() => h.app.iconData.available === false, { message: 'icons unavailable' });
  assert.ok(hasPath(lastIcon(h.ud, ctx), mdiLightbulb, '#ffa757'), 'fallback icon');
  const warnings = logs('warn').filter((l) => /icons/i.test(l));
  assert.equal(warnings.length, 1);
  assert.doesNotMatch(warnings[0], /light\.desk/);
  assert.equal((await status()).iconsAvailable, false);
  const pushes = h.ud
    .callsOf('sendToPropertyInspector')
    .map((c) => c.args[0])
    .filter((m) => m.type === 'connection.changed');
  assert.ok(pushes.some((m) => m.payload.iconsAvailable === false), 'connection.changed with iconsAvailable false');
});

test('icon data is requested again after a reconnect', async () => {
  h = await createHarness();
  await waitFor(() => h.app.iconData.loaded, { message: 'icon data loaded' });
  const before = h.server.messages('frontend/get_icons').filter((m) => m.category === 'entity_component').length;
  await h.server.restart();
  await waitFor(() => h.app.client.status === 'reconnecting', { message: 'reconnecting' });
  assert.equal(h.app.iconData.available, null, 'availability reset while disconnected');
  h.clock.tick(1000);
  await waitFor(() => h.app.client.status === 'connected', { timeoutMs: 4000, message: 'reconnected' });
  await waitFor(() => h.server.messages('frontend/get_icons').filter((m) => m.category === 'entity_component').length > before, {
    message: 'icons requested again',
  });
});

test('toggle settings saved by 0.2.0 (no icon fields) render the icon layout (SC-003)', async () => {
  h = await createHarness();
  const ctx = addToggle('switch.coffee', '0_1', { label: 'Kaffee', onText: 'AN', offText: 'AUS', longPress: 'edit' });
  const svg = lastIcon(h.ud, ctx);
  assert.match(svg, /<path d="/);
  assert.match(svg, />Kaffee</);
  assert.doesNotMatch(svg, />AUS</);
});

test('disconnected keys show the text layout without an icon', async () => {
  h = await createHarness();
  const ctx = addToggle('light.desk');
  await h.server.stop();
  await waitFor(() => /Offline/.test(lastIcon(h.ud, ctx)), { message: 'offline layout' });
  assert.doesNotMatch(lastIcon(h.ud, ctx), /<path/);
});
