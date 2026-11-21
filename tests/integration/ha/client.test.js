import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { HAClient, testConnection } from '../../../src/ha/client.js';
import { startFakeHA } from '../../support/fake-ha-server.js';
import { createManualClock } from '../../support/manual-clock.js';
import { waitFor, settle } from '../../support/wait.js';

const TOKEN = 'valid-token';
let server;
let clock;
let client;
let logs;

function makeLogger(level = 'info') {
  const order = ['debug', 'info', 'warn', 'error'];
  const min = order.indexOf(level);
  const log = (lvl) => (msg) => {
    if (order.indexOf(lvl) >= min) logs.push({ level: lvl, msg: String(msg) });
  };
  return { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') };
}

function newClient(opts = {}) {
  client = new HAClient({
    createSocket: (url) => new WebSocket(url),
    clock,
    logger: makeLogger(opts.logLevel),
    ...opts,
  });
  return client;
}

const statuses = (c) => {
  const seen = [];
  c.addEventListener('status', (e) => seen.push(e.detail.status));
  return seen;
};

beforeEach(async () => {
  server = await startFakeHA({ token: TOKEN });
  clock = createManualClock();
  logs = [];
});

afterEach(async () => {
  client?.dispose();
  client = null;
  await server.close();
});

test('connects, authenticates, loads states and subscribes', async () => {
  const c = newClient();
  const seen = statuses(c);
  let loaded = null;
  c.addEventListener('states_loaded', (e) => (loaded = e.detail.states));
  c.configure(server.url, TOKEN);
  await waitFor(() => c.status === 'connected', { message: 'connected' });
  assert.deepEqual(seen.slice(0, 2), ['connecting', 'connected']);
  assert.equal(loaded.length, 15);
  assert.equal(c.entityCount, 15);
  assert.equal(c.haVersion, '2025.1.0');
  assert.equal(server.messages('subscribe_events')[0].event_type, 'state_changed');
});

test('invalid URL leaves the client unconfigured with error.invalidUrl', () => {
  const c = newClient();
  c.configure('not a url', TOKEN);
  assert.equal(c.status, 'unconfigured');
  assert.equal(c.lastError, 'error.invalidUrl');
});

test('auth_invalid → auth_failed and no further connection attempts (FR-005)', async () => {
  const c = newClient();
  c.configure(server.url, 'wrong');
  await waitFor(() => c.status === 'auth_failed', { message: 'auth_failed' });
  assert.equal(c.lastError, 'error.auth');
  const authCount = server.messages('auth').length;
  clock.tick(120_000);
  await settle(50);
  assert.equal(server.messages('auth').length, authCount);
  assert.equal(c.status, 'auth_failed');
});

test('changing credentials after auth_failed reconnects', async () => {
  const c = newClient();
  c.configure(server.url, 'wrong');
  await waitFor(() => c.status === 'auth_failed');
  c.configure(server.url, TOKEN);
  await waitFor(() => c.status === 'connected', { message: 'connected after fix' });
});

test('configure() with unchanged credentials does not reconnect', async () => {
  const c = newClient();
  c.configure(server.url, TOKEN);
  await waitFor(() => c.status === 'connected');
  c.configure(`${server.url}/`, TOKEN);
  await settle(30);
  assert.equal(server.messages('auth').length, 1);
});

test('state_changed events are dispatched, including removals', async () => {
  const c = newClient();
  const events = [];
  c.addEventListener('state_changed', (e) => events.push(e.detail));
  c.configure(server.url, TOKEN);
  await waitFor(() => c.status === 'connected');
  server.emitStateChanged('switch.coffee', { entity_id: 'switch.coffee', state: 'on', attributes: {}, last_updated: 'x' });
  server.emitStateChanged('light.hallway', null);
  await waitFor(() => events.length === 2, { message: 'two events' });
  assert.equal(events[0].entityId, 'switch.coffee');
  assert.equal(events[0].newState.state, 'on');
  assert.equal(events[1].entityId, 'light.hallway');
  assert.equal(events[1].newState, null);
});

test('callService resolves on success and rejects with the HA error', async () => {
  const c = newClient();
  c.configure(server.url, TOKEN);
  await waitFor(() => c.status === 'connected');
  await c.callService({ domain: 'switch', service: 'toggle', target: { entity_id: 'switch.coffee' } });
  const sent = server.messages('call_service').at(-1);
  assert.equal(sent.domain, 'switch');
  assert.deepEqual(sent.target, { entity_id: 'switch.coffee' });

  server.failNextCall('not_found', 'Service not found');
  await assert.rejects(c.callService({ domain: 'light', service: 'nope' }), (err) => {
    assert.equal(err.key, 'error.service');
    assert.equal(err.haCode, 'not_found');
    return true;
  });
});

test('callService rejects with error.timeout after 10 s without answer', async () => {
  const c = newClient();
  c.configure(server.url, TOKEN);
  await waitFor(() => c.status === 'connected');
  server.setResponding(false);
  const p = c.callService({ domain: 'switch', service: 'toggle', target: { entity_id: 'switch.coffee' } });
  await waitFor(() => server.messages('call_service').length === 1);
  clock.tick(10_000);
  await assert.rejects(p, (err) => err.key === 'error.timeout');
});

test('callService while not connected rejects with error.disconnected', async () => {
  const c = newClient();
  await assert.rejects(c.callService({ domain: 'a', service: 'b' }), (err) => err.key === 'error.disconnected');
});

test('pending requests are rejected when the socket closes', async () => {
  const c = newClient();
  c.configure(server.url, TOKEN);
  await waitFor(() => c.status === 'connected');
  server.setResponding(false);
  const p = c.callService({ domain: 'switch', service: 'toggle' });
  await waitFor(() => server.messages('call_service').length === 1);
  await server.stop();
  await assert.rejects(p, (err) => err.key === 'error.disconnected');
});

test('missing pong within 10 s forces a reconnect', async () => {
  const c = newClient();
  c.configure(server.url, TOKEN);
  await waitFor(() => c.status === 'connected');
  server.setAnswerPings(false);
  clock.tick(30_000);
  await waitFor(() => server.messages('ping').length === 1, { message: 'ping sent' });
  clock.tick(10_000);
  await waitFor(() => c.status === 'reconnecting', { message: 'reconnecting' });
  server.setAnswerPings(true);
  clock.tick(1_000);
  await waitFor(() => c.status === 'connected', { message: 'reconnected' });
  assert.equal(server.messages('auth').length, 2);
});

test('answered pings keep the connection', async () => {
  const c = newClient();
  c.configure(server.url, TOKEN);
  await waitFor(() => c.status === 'connected');
  clock.tick(30_000);
  await waitFor(() => server.messages('ping').length === 1);
  await settle(20);
  clock.tick(10_000);
  await settle(20);
  assert.equal(c.status, 'connected');
});

test('server restart → reconnect with backoff, states reloaded and resubscribed (FR-004)', async () => {
  const c = newClient();
  let loads = 0;
  c.addEventListener('states_loaded', () => loads++);
  c.configure(server.url, TOKEN);
  await waitFor(() => c.status === 'connected');
  await server.restart();
  await waitFor(() => c.status === 'reconnecting', { message: 'reconnecting' });
  clock.tick(1_000);
  await waitFor(() => c.status === 'connected', { message: 'reconnected' });
  assert.equal(loads, 2);
  assert.equal(server.messages('subscribe_events').length, 2);
});

test('failed subscribe_events triggers a reconnect', async () => {
  server.setSubscribeSuccess(false);
  const c = newClient();
  c.configure(server.url, TOKEN);
  await waitFor(() => c.status === 'reconnecting', { message: 'reconnecting after failed subscribe' });
});

test('at info level nothing logged contains entity IDs, states or the token (Principle V)', async () => {
  const c = newClient({ logLevel: 'info' });
  c.configure(server.url, TOKEN);
  await waitFor(() => c.status === 'connected');
  server.emitStateChanged('switch.coffee', { entity_id: 'switch.coffee', state: 'on', attributes: {}, last_updated: 'x' });
  await c.callService({ domain: 'switch', service: 'toggle', target: { entity_id: 'switch.coffee' } });
  await server.restart();
  clock.tick(1_000);
  await waitFor(() => c.status === 'connected');
  const text = logs.map((l) => l.msg).join('\n');
  assert.ok(logs.length > 0, 'expected some info logs');
  assert.doesNotMatch(text, /switch\.coffee|light\.|valid-token/);
});

test('dispose() closes the socket and stops reconnecting', async () => {
  const c = newClient();
  c.configure(server.url, TOKEN);
  await waitFor(() => c.status === 'connected');
  c.dispose();
  await waitFor(() => server.clientCount === 0, { message: 'socket closed' });
  clock.tick(60_000);
  await settle(30);
  assert.equal(server.messages('auth').length, 1);
});

test('testConnection reports success with entity count and version', async () => {
  const result = await testConnection({ url: server.url, token: TOKEN, createSocket: (u) => new WebSocket(u), clock });
  assert.deepEqual(result, { ok: true, entityCount: 15, haVersion: '2025.1.0' });
  await waitFor(() => server.clientCount === 0, { message: 'temporary socket closed' });
});

test('testConnection maps failures to message keys', async () => {
  const mk = (u) => new WebSocket(u);
  assert.deepEqual(await testConnection({ url: server.url, token: 'bad', createSocket: mk, clock }), { ok: false, error: 'error.auth' });
  assert.deepEqual(await testConnection({ url: 'garbage', token: TOKEN, createSocket: mk, clock }), { ok: false, error: 'error.invalidUrl' });
  assert.deepEqual(await testConnection({ url: 'http://127.0.0.1:1', token: TOKEN, createSocket: mk, clock }), { ok: false, error: 'error.unreachable' });
  server.setResponding(false);
  const pending = testConnection({ url: server.url, token: TOKEN, createSocket: mk, clock });
  await waitFor(() => server.messages('auth').length >= 2, { message: 'auth sent' });
  clock.tick(10_000);
  assert.deepEqual(await pending, { ok: false, error: 'error.timeout' });
});

// --- Feature 003: icon requests (contracts/ha-icon-messages.md) ---------------------------------

test('getIcons and listEntityRegistryDisplay resolve with the HA results', async () => {
  const c = newClient();
  c.configure(server.url, TOKEN);
  await waitFor(() => c.status === 'connected', { message: 'connected' });
  const components = await c.getIcons('entity_component');
  assert.equal(components.resources.light._.default, 'mdi:lightbulb');
  const platforms = await c.getIcons('entity', ['demo_platform', 'missing']);
  assert.deepEqual(Object.keys(platforms.resources), ['demo_platform']);
  assert.deepEqual(server.messages('frontend/get_icons').at(-1).integration, ['demo_platform', 'missing']);
  const registry = await c.listEntityRegistryDisplay();
  assert.equal(registry.entities[0].ei, 'sensor.outdoor_temperature');
});

test('icon requests reject with error.service on HA without the icon API', async () => {
  server.setIconsSupported(false);
  const c = newClient();
  c.configure(server.url, TOKEN);
  await waitFor(() => c.status === 'connected', { message: 'connected' });
  await assert.rejects(c.getIcons('entity_component'), (err) => err.key === 'error.service' && err.haCode === 'unknown_command');
  await assert.rejects(c.listEntityRegistryDisplay(), (err) => err.key === 'error.service');
});

test('icon requests reject with error.disconnected while not connected', async () => {
  const c = newClient();
  await assert.rejects(c.getIcons('entity_component'), (err) => err.key === 'error.disconnected');
  await assert.rejects(c.listEntityRegistryDisplay(), (err) => err.key === 'error.disconnected');
});
