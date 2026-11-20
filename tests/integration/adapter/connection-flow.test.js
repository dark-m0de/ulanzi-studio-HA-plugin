import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, TOKEN } from '../../support/app-harness.js';
import { waitFor, settle } from '../../support/wait.js';

let h;
afterEach(async () => {
  await h?.close();
  h = null;
});

function probeTypes(log) {
  return {
    probe: ({ context, app }) => ({
      onConnectionStatus: (status) => log.push({ context, status, entities: app.store.all().length }),
    }),
  };
}

test('auth failure shows exactly one toast and is broadcast to every action (FR-005)', async () => {
  const log = [];
  h = await createHarness({ actionTypes: probeTypes(log), connect: false });
  const a = h.ud.emitAction('add', 'probe', { key: '0_0', param: {} });
  const b = h.ud.emitAction('add', 'probe', { key: '0_1', param: {} });
  h.ud.emit('didReceiveGlobalSettings', { settings: { haUrl: h.server.url, haToken: 'wrong' } });
  await waitFor(() => h.app.client.status === 'auth_failed', { message: 'auth_failed' });
  h.clock.tick(60_000);
  await settle(30);
  const toasts = h.ud.callsOf('toast');
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].args[0], 'Authentication failed');
  for (const ctx of [a, b]) assert.ok(log.some((l) => l.context === ctx && l.status === 'auth_failed'), ctx);
});

test('new credentials after auth failure reconnect, and a later failure toasts again', async () => {
  h = await createHarness({ actionTypes: {}, connect: false });
  h.ud.emit('didReceiveGlobalSettings', { settings: { haUrl: h.server.url, haToken: 'wrong' } });
  await waitFor(() => h.app.client.status === 'auth_failed');
  h.ud.emit('didReceiveGlobalSettings', { settings: { haUrl: h.server.url, haToken: TOKEN } });
  await waitFor(() => h.app.client.status === 'connected', { message: 'connected' });
  h.ud.emit('didReceiveGlobalSettings', { settings: { haUrl: h.server.url, haToken: 'wrong-again' } });
  await waitFor(() => h.app.client.status === 'auth_failed');
  assert.equal(h.ud.callsOf('toast').length, 2);
});

test('after an HA restart every action is notified with current states within the backoff window (FR-004, SC-006)', async () => {
  const log = [];
  h = await createHarness({ actionTypes: probeTypes(log) });
  const ctx = h.ud.emitAction('add', 'probe', { param: {} });
  log.length = 0;
  await h.server.restart();
  await waitFor(() => log.some((l) => l.status === 'reconnecting'), { message: 'reconnecting broadcast' });
  h.clock.tick(1_000);
  await waitFor(() => log.some((l) => l.status === 'connected'), { message: 'connected broadcast' });
  const connected = log.find((l) => l.status === 'connected');
  assert.equal(connected.context, ctx);
  assert.equal(connected.entities, 15, 'states are loaded before actions are told they are connected');
});
