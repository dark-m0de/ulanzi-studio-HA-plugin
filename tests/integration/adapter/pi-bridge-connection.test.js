import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, TOKEN } from '../../support/app-harness.js';
import { waitFor } from '../../support/wait.js';

let h;
afterEach(async () => {
  await h?.close();
  h = null;
});

const allPiTraffic = (ud) => JSON.stringify(ud.callsOf('sendToPropertyInspector').map((c) => c.args));

test('connection.test returns ok, entityCount and haVersion for valid credentials (FR-003)', async () => {
  h = await createHarness({ connect: false });
  const reply = await h.piRequest('connection.test', { haUrl: h.server.url, haToken: TOKEN });
  assert.deepEqual(reply.payload, { ok: true, entityCount: 15, haVersion: '2025.1.0' });
  assert.equal(reply.v, 1);
  assert.equal(reply.type, 'connection.test');
});

test('connection.test maps failures to error keys', async () => {
  h = await createHarness({ connect: false });
  assert.equal((await h.piRequest('connection.test', { haUrl: h.server.url, haToken: 'bad' })).error.key, 'error.auth');
  assert.equal((await h.piRequest('connection.test', { haUrl: 'nope', haToken: TOKEN })).error.key, 'error.invalidUrl');
  assert.equal((await h.piRequest('connection.test', { haUrl: 'http://127.0.0.1:1', haToken: TOKEN })).error.key, 'error.unreachable');
  h.server.setResponding(false);
  const pending = h.piRequest('connection.test', { haUrl: h.server.url, haToken: TOKEN });
  await waitFor(() => h.server.messages('auth').length >= 2, { message: 'auth sent' });
  h.clock.tick(10_000);
  assert.equal((await pending).error.key, 'error.timeout');
});

test('connection.test with haToken null uses the stored token', async () => {
  h = await createHarness();
  const reply = await h.piRequest('connection.test', { haUrl: h.server.url, haToken: null });
  assert.equal(reply.payload.ok, true);
});

test('connection.test does not disturb the main connection', async () => {
  h = await createHarness();
  await h.piRequest('connection.test', { haUrl: h.server.url, haToken: 'bad' });
  assert.equal(h.app.client.status, 'connected');
});

test('connection.save stores credentials via setGlobalSettings and connects', async () => {
  h = await createHarness({ connect: false });
  const reply = await h.piRequest('connection.save', { haUrl: `${h.server.url}/`, haToken: TOKEN });
  assert.deepEqual(reply.payload, { saved: true });
  assert.deepEqual(h.ud.lastCall('setGlobalSettings').args[0], { haUrl: h.server.url, haToken: TOKEN });
  await waitFor(() => h.app.client.status === 'connected', { message: 'connected after save' });
});

test('connection.save with haToken null keeps the stored token; without any token it fails', async () => {
  h = await createHarness();
  await h.piRequest('connection.save', { haUrl: h.server.url, haToken: null });
  assert.equal(h.ud.lastCall('setGlobalSettings').args[0].haToken, TOKEN);
  const fresh = await createHarness({ connect: false });
  try {
    assert.equal((await fresh.piRequest('connection.save', { haUrl: fresh.server.url, haToken: null })).error.key, 'error.auth');
    assert.equal((await fresh.piRequest('connection.save', { haUrl: 'nope', haToken: TOKEN })).error.key, 'error.invalidUrl');
  } finally {
    await fresh.close();
  }
});

test('connection.status reflects client status, hasToken and haUrl', async () => {
  h = await createHarness({ connect: false });
  assert.deepEqual((await h.piRequest('connection.status', {})).payload, { status: 'unconfigured', hasToken: false, haUrl: '', iconsAvailable: null });
  await h.connect();
  await waitFor(() => h.app.iconData.available === true, { message: 'icons loaded' });
  assert.deepEqual((await h.piRequest('connection.status', {})).payload, {
    status: 'connected',
    hasToken: true,
    haUrl: h.server.url,
    iconsAvailable: true,
  });
});

test('connection.changed is pushed to open PIs on status changes', async () => {
  h = await createHarness({ connect: false });
  const context = h.ud.contextFor('toggle', '1_1');
  await h.piRequest('connection.status', {}, { context });
  await h.connect();
  const pushes = h.ud.callsOf('sendToPropertyInspector').filter((c) => c.args[0].type === 'connection.changed' && c.args[1] === context);
  assert.ok(pushes.some((c) => c.args[0].payload.status === 'connected'));
  assert.equal(pushes[0].args[0].id, undefined);
});

test('no PI reply or push ever contains the token (Principle V)', async () => {
  h = await createHarness({ connect: false });
  await h.piRequest('connection.test', { haUrl: h.server.url, haToken: TOKEN });
  await h.piRequest('connection.save', { haUrl: h.server.url, haToken: TOKEN });
  await waitFor(() => h.app.client.status === 'connected');
  await h.piRequest('connection.status', {});
  assert.doesNotMatch(allPiTraffic(h.ud), new RegExp(TOKEN));
});

test('unknown request types and malformed envelopes are ignored', async () => {
  h = await createHarness({ connect: false });
  const before = h.ud.calls.length;
  h.ud.emit('sendToPlugin', { context: h.ud.contextFor('toggle'), payload: { v: 1, type: 'nope', id: 'x' } });
  h.ud.emit('sendToPlugin', { context: h.ud.contextFor('toggle'), payload: { type: 'connection.status', id: 'y' } });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(h.ud.calls.slice(before).filter((c) => c.method === 'sendToPropertyInspector').length, 0);
});
