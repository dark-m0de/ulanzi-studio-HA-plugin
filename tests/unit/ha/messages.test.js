import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBaseUrl,
  toWebSocketUrl,
  authMessage,
  getStatesMessage,
  subscribeStateChangedMessage,
  callServiceMessage,
  pingMessage,
  parseMessage,
} from '../../../src/ha/messages.js';

test('normalizeBaseUrl strips whitespace and trailing slashes and keeps base paths', () => {
  assert.equal(normalizeBaseUrl(' http://homeassistant.local:8123/ '), 'http://homeassistant.local:8123');
  assert.equal(normalizeBaseUrl('https://example.org/ha///'), 'https://example.org/ha');
});

test('normalizeBaseUrl rejects invalid or non-http URLs', () => {
  for (const bad of ['', '   ', 'homeassistant.local', 'ftp://x', 'ws://host:8123', 'http://', null, undefined]) {
    assert.equal(normalizeBaseUrl(bad), null, String(bad));
  }
});

test('toWebSocketUrl maps http→ws and https→wss and appends /api/websocket', () => {
  assert.equal(toWebSocketUrl('http://10.0.0.2:8123'), 'ws://10.0.0.2:8123/api/websocket');
  assert.equal(toWebSocketUrl('https://ha.example.org/'), 'wss://ha.example.org/api/websocket');
  assert.equal(toWebSocketUrl('https://example.org/ha'), 'wss://example.org/ha/api/websocket');
  assert.equal(toWebSocketUrl('nope'), null);
});

test('message builders follow the HA WebSocket API', () => {
  assert.deepEqual(authMessage('tok'), { type: 'auth', access_token: 'tok' });
  assert.deepEqual(getStatesMessage(3), { id: 3, type: 'get_states' });
  assert.deepEqual(subscribeStateChangedMessage(4), { id: 4, type: 'subscribe_events', event_type: 'state_changed' });
  assert.deepEqual(pingMessage(5), { id: 5, type: 'ping' });
  assert.deepEqual(
    callServiceMessage(6, { domain: 'light', service: 'turn_on', target: { entity_id: 'light.a' }, data: { brightness_pct: 40 } }),
    { id: 6, type: 'call_service', domain: 'light', service: 'turn_on', target: { entity_id: 'light.a' }, service_data: { brightness_pct: 40 } },
  );
});

test('callServiceMessage omits target when not given and defaults service_data to {}', () => {
  assert.deepEqual(callServiceMessage(1, { domain: 'homeassistant', service: 'restart' }), {
    id: 1,
    type: 'call_service',
    domain: 'homeassistant',
    service: 'restart',
    service_data: {},
  });
});

test('parseMessage parses JSON objects and returns null for garbage', () => {
  assert.deepEqual(parseMessage('{"type":"pong","id":1}'), { type: 'pong', id: 1 });
  assert.deepEqual(parseMessage(Buffer.from('{"type":"auth_ok"}')), { type: 'auth_ok' });
  assert.equal(parseMessage('not json'), null);
  assert.equal(parseMessage('42'), null);
});
