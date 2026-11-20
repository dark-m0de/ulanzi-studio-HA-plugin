// A scripted Home Assistant WebSocket server for integration tests
// (contract: specs/001-ha-deck-plugin/contracts/ha-websocket.md).
import { WebSocketServer } from 'ws';
import { loadStates } from './fixtures/index.js';

export async function startFakeHA({ token = 'valid-token', states = loadStates(), haVersion = '2025.1.0' } = {}) {
  /** @type {any[]} */
  const received = [];
  const clients = new Set();
  let currentStates = states;
  let responding = true;
  let answerPings = true;
  /** @type {{ code: string, message: string } | null} */
  let nextCallError = null;
  let subscribeSuccess = true;
  let wss = null;
  let port = 0;

  function onConnection(socket, request) {
    if (!request.url?.startsWith('/api/websocket')) {
      socket.close(1008, 'wrong path');
      return;
    }
    clients.add(socket);
    socket.authed = false;
    socket.subscriptions = [];
    socket.on('close', () => clients.delete(socket));
    socket.send(JSON.stringify({ type: 'auth_required', ha_version: haVersion }));
    socket.on('message', (data) => {
      const msg = JSON.parse(String(data));
      received.push(msg);
      if (!responding) return;
      handle(socket, msg);
    });
  }

  function reply(socket, payload) {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
  }

  function handle(socket, msg) {
    if (msg.type === 'auth') {
      if (msg.access_token === token) {
        socket.authed = true;
        reply(socket, { type: 'auth_ok', ha_version: haVersion });
      } else {
        reply(socket, { type: 'auth_invalid', message: 'Invalid access token or password' });
        socket.close();
      }
      return;
    }
    if (!socket.authed) return;
    switch (msg.type) {
      case 'get_states':
        reply(socket, { id: msg.id, type: 'result', success: true, result: currentStates });
        break;
      case 'subscribe_events':
        if (subscribeSuccess) socket.subscriptions.push({ id: msg.id, eventType: msg.event_type });
        reply(socket, { id: msg.id, type: 'result', success: subscribeSuccess, result: null });
        break;
      case 'call_service':
        if (nextCallError) {
          reply(socket, { id: msg.id, type: 'result', success: false, error: nextCallError });
          nextCallError = null;
        } else {
          reply(socket, { id: msg.id, type: 'result', success: true, result: { context: { id: 'ctx' } } });
        }
        break;
      case 'ping':
        if (answerPings) reply(socket, { id: msg.id, type: 'pong' });
        break;
      default:
        reply(socket, { id: msg.id, type: 'result', success: false, error: { code: 'unknown_command', message: 'Unknown command' } });
    }
  }

  async function listen(atPort) {
    wss = new WebSocketServer({ host: '127.0.0.1', port: atPort });
    wss.on('connection', onConnection);
    await new Promise((resolve) => wss.once('listening', resolve));
    port = wss.address().port;
  }

  async function shutdown() {
    for (const c of clients) c.terminate();
    clients.clear();
    if (wss) await new Promise((resolve) => wss.close(resolve));
    wss = null;
  }

  await listen(0);

  return {
    get url() {
      return `http://127.0.0.1:${port}`;
    },
    get port() {
      return port;
    },
    received,
    get clientCount() {
      return clients.size;
    },
    /** Messages of a given type received so far. */
    messages(type) {
      return received.filter((m) => m.type === type);
    },
    emitStateChanged(entityId, newState) {
      const oldState = currentStates.find((s) => s.entity_id === entityId) ?? null;
      currentStates = currentStates.filter((s) => s.entity_id !== entityId);
      if (newState) currentStates.push(newState);
      for (const socket of clients) {
        for (const sub of socket.subscriptions) {
          if (sub.eventType !== 'state_changed') continue;
          reply(socket, {
            id: sub.id,
            type: 'event',
            event: { event_type: 'state_changed', data: { entity_id: entityId, old_state: oldState, new_state: newState } },
          });
        }
      }
    },
    failNextCall(code = 'service_validation_error', message = 'Service call failed') {
      nextCallError = { code, message };
    },
    /** When false, the server reads messages but never answers (timeouts, dead socket). */
    setResponding(value) {
      responding = value;
    },
    setAnswerPings(value) {
      answerPings = value;
    },
    setSubscribeSuccess(value) {
      subscribeSuccess = value;
    },
    /** Closes all sockets and reopens on the same port (simulates an HA restart). */
    async restart() {
      const samePort = port;
      await shutdown();
      await listen(samePort);
    },
    /** Stops the server without reopening. */
    stop: shutdown,
    async close() {
      await shutdown();
    },
  };
}
