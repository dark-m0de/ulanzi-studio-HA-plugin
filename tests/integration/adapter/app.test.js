import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createApp } from '../../../src/adapter/app.js';
import { FakeUD } from '../../support/fake-ud.js';
import { startFakeHA } from '../../support/fake-ha-server.js';
import { createManualClock } from '../../support/manual-clock.js';
import { waitFor } from '../../support/wait.js';

const cleanups = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()();
});

async function setup({ actionTypes } = {}) {
  const server = await startFakeHA();
  const ud = new FakeUD();
  const clock = createManualClock();
  const app = createApp({
    ud,
    createSocket: (u) => new WebSocket(u),
    clock,
    locales: { en: {}, de_DE: {} },
    actionTypes,
    consoleTarget: null,
  });
  cleanups.push(() => server.close(), () => app.dispose());
  return { server, ud, clock, app };
}

test('connect uses the plugin UUID and onConnected requests global settings', async () => {
  const { ud } = await setup();
  assert.equal(ud.uuid, 'com.ulanzi.ulanzistudio.hadeck');
  ud.emit('connected', {});
  assert.equal(ud.callsOf('getGlobalSettings').length, 1);
});

test('global settings configure and connect the HA client', async () => {
  const { ud, server, app } = await setup();
  ud.emit('didReceiveGlobalSettings', { settings: { haUrl: server.url, haToken: 'valid-token' } });
  await waitFor(() => app.client.status === 'connected', { message: 'connected' });
  assert.equal(app.store.all().length, 15);
});

test('onAdd/onClear create and dispose action instances through the registry', async () => {
  const created = [];
  const disposed = [];
  const actionTypes = {
    probe: (ctx) => {
      created.push(ctx);
      return { dispose: () => disposed.push(ctx.context) };
    },
  };
  const { ud, app } = await setup({ actionTypes });
  const context = ud.emitAction('add', 'probe', { key: '1_0', param: { entityId: 'switch.coffee' } });
  assert.equal(created.length, 1);
  assert.equal(created[0].context, context);
  assert.deepEqual(created[0].settings, { entityId: 'switch.coffee' });
  assert.equal(app.registry.size, 1);
  ud.emitClear([{ action: 'probe', key: '1_0' }]);
  assert.deepEqual(disposed, [context]);
  assert.equal(app.registry.size, 0);
});

test('settings updates reach the instance via paramfromapp / paramfromplugin / didReceiveSettings', async () => {
  const updates = [];
  const actionTypes = { probe: () => ({ onSettings: (s) => updates.push(s) }) };
  const { ud } = await setup({ actionTypes });
  ud.emitAction('add', 'probe', { param: {} });
  ud.emitAction('paramfromapp', 'probe', { param: { a: 1 } });
  ud.emitAction('paramfromplugin', 'probe', { param: { a: 2 } });
  ud.emitAction('didReceiveSettings', 'probe', { settings: { a: 3 } });
  assert.deepEqual(updates, [{ a: 1 }, { a: 2 }, { a: 3 }]);
});

test('events are routed to the matching instance only', async () => {
  const hits = [];
  const actionTypes = {
    probe: ({ context }) => ({ onKeyDown: () => hits.push(context) }),
  };
  const { ud } = await setup({ actionTypes });
  const a = ud.emitAction('add', 'probe', { key: '0_0', param: {} });
  ud.emitAction('add', 'probe', { key: '0_1', param: {} });
  ud.emitAction('keydown', 'probe', { key: '0_0' });
  assert.deepEqual(hits, [a]);
});

test('an exception in one action is logged and does not affect other actions (Principle IV)', async () => {
  const ok = [];
  const actionTypes = {
    broken: () => ({
      onKeyDown: () => {
        throw new Error('boom');
      },
    }),
    probe: ({ context }) => ({ onKeyDown: () => ok.push(context) }),
  };
  const { ud } = await setup({ actionTypes });
  ud.emitAction('add', 'broken', { key: '0_0', param: {} });
  const good = ud.emitAction('add', 'probe', { key: '0_1', param: {} });
  assert.doesNotThrow(() => ud.emitAction('keydown', 'broken', { key: '0_0' }));
  ud.emitAction('keydown', 'probe', { key: '0_1' });
  assert.deepEqual(ok, [good]);
  const errors = ud.callsOf('logMessage').filter((c) => c.args[1] === 'error');
  assert.equal(errors.length, 1);
  assert.match(errors[0].args[0], /boom/);
});

test('logMessage at info/warn/error contains no entity IDs, states or token (Principle V)', async () => {
  const actionTypes = { probe: () => ({}) };
  const { ud, server, app } = await setup({ actionTypes });
  ud.emit('didReceiveGlobalSettings', { settings: { haUrl: server.url, haToken: 'valid-token' } });
  await waitFor(() => app.client.status === 'connected');
  ud.emitAction('add', 'probe', { param: { entityId: 'switch.coffee' } });
  server.emitStateChanged('switch.coffee', { entity_id: 'switch.coffee', state: 'on', attributes: {} });
  await server.restart();
  const text = ud
    .callsOf('logMessage')
    .filter((c) => c.args[1] !== 'debug')
    .map((c) => c.args[0])
    .join('\n');
  assert.doesNotMatch(text, /switch\.coffee|valid-token/);
});
