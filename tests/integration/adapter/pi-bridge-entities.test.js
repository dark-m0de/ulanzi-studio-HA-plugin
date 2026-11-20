import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../../support/app-harness.js';

let h;
afterEach(async () => {
  await h?.close();
  h = null;
});

const ids = (reply) => reply.payload.entities.map((e) => e.entityId);

test('entities.list returns id, name, domain and state, sorted by name (FR-013)', async () => {
  h = await createHarness();
  const reply = await h.piRequest('entities.list', { domains: ['switch'], query: null, limit: 10 });
  assert.deepEqual(reply.payload.entities, [{ entityId: 'switch.coffee', friendlyName: 'Coffee Machine', domain: 'switch', state: 'off' }]);
  const all = await h.piRequest('entities.list', { domains: null, query: null, limit: 100 });
  const names = all.payload.entities.map((e) => e.friendlyName);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  assert.equal(names.length, 15);
});

test('the query matches entity ids and friendly names case-insensitively', async () => {
  h = await createHarness();
  assert.deepEqual(ids(await h.piRequest('entities.list', { query: 'LIVING', limit: 10 })).sort(), [
    'light.living_room',
    'media_player.living_room',
  ]);
  assert.deepEqual(ids(await h.piRequest('entities.list', { query: 'coffee machine', limit: 10 })), ['switch.coffee']);
});

test('domain filter and limit are applied', async () => {
  h = await createHarness();
  const reply = await h.piRequest('entities.list', { domains: ['light', 'switch'], limit: 2 });
  assert.equal(reply.payload.entities.length, 2);
  assert.ok(reply.payload.entities.every((e) => ['light', 'switch'].includes(e.domain)));
});

test('returns an empty list when disconnected', async () => {
  h = await createHarness({ connect: false });
  assert.deepEqual((await h.piRequest('entities.list', { limit: 10 })).payload, { entities: [] });
});
