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

// Feature 004: the selected-values search only offers entities with a controllable value
// (contracts/toggle-selected-values-settings.md §4a).
test('controllable: true keeps only entities with at least one controllable value', async () => {
  h = await createHarness();
  const found = ids(await h.piRequest('entities.list', { controllable: true, limit: 100 }));
  for (const id of ['light.living_room', 'light.desk', 'cover.blinds', 'media_player.living_room', 'climate.office', 'fan.bedroom', 'input_number.volume_target']) {
    assert.ok(found.includes(id), id);
  }
  for (const id of ['light.hallway', 'cover.garage', 'switch.coffee', 'sensor.outdoor_temperature', 'scene.evening']) {
    assert.ok(!found.includes(id), id);
  }
});

test('controllable combines with domains and query; without it the result is unchanged', async () => {
  h = await createHarness();
  assert.deepEqual(ids(await h.piRequest('entities.list', { controllable: true, domains: ['light'], limit: 100 })).sort(), ['light.desk', 'light.living_room']);
  assert.deepEqual(ids(await h.piRequest('entities.list', { controllable: true, query: 'living', limit: 100 })).sort(), ['light.living_room', 'media_player.living_room']);
  assert.equal(ids(await h.piRequest('entities.list', { controllable: false, limit: 100 })).length, 15);
});
