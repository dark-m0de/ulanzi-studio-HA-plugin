// Builds a createApp() instance wired to a fake $UD and a fake HA server.
import WebSocket from 'ws';
import { createApp } from '../../src/adapter/app.js';
import { registerPiHandlers } from '../../src/adapter/pi-handlers.js';
import { ACTION_TYPES } from '../../src/adapter/actions/index.js';
import { FakeUD } from './fake-ud.js';
import { startFakeHA } from './fake-ha-server.js';
import { createManualClock } from './manual-clock.js';
import { waitFor } from './wait.js';

export const TOKEN = 'valid-token';

const en = {
  'status.on': 'On',
  'status.off': 'Off',
  'status.unavailable': 'N/A',
  'status.notFound': 'Missing',
  'status.disconnected': 'Offline',
  'error.auth': 'Authentication failed',
  'status.edit': 'EDIT',
  'hint.longPress': 'Hold a key',
  'hint.noDynamicDial': 'No Dynamic Dial',
};

/**
 * @param {{ actionTypes?: object, connect?: boolean, language?: string }} [options]
 */
export async function createHarness({ actionTypes = ACTION_TYPES, connect = true, language = 'en' } = {}) {
  const server = await startFakeHA({ token: TOKEN });
  const ud = new FakeUD({ language });
  const clock = createManualClock();
  const app = createApp({
    ud,
    createSocket: (u) => new WebSocket(u),
    clock,
    locales: { en, de_DE: {} },
    actionTypes,
    consoleTarget: null,
    setup: registerPiHandlers,
  });
  const harness = {
    server,
    ud,
    clock,
    app,
    async connect() {
      ud.emit('didReceiveGlobalSettings', { settings: { haUrl: server.url, haToken: TOKEN } });
      await waitFor(() => app.client.status === 'connected', { message: 'HA connected' });
    },
    /** Sends a PI request and resolves with the reply envelope. */
    async piRequest(type, payload, { context = ud.contextFor('toggle', '9_9'), timeoutMs = 3000 } = {}) {
      const id = `t${Math.random().toString(36).slice(2)}`;
      const before = ud.calls.length;
      ud.emit('sendToPlugin', { cmd: 'sendToPlugin', context, payload: { v: 1, type, id, payload } });
      const call = await waitFor(
        () => ud.calls.slice(before).find((c) => c.method === 'sendToPropertyInspector' && c.args[0]?.id === id),
        { timeoutMs, message: `reply to ${type}` },
      );
      return call.args[0];
    },
    async close() {
      app.dispose();
      await server.close();
    },
  };
  if (connect) await harness.connect();
  return harness;
}
