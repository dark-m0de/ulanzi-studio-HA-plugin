// Feature 003, US2: icon.preview PI request (contracts/key-icon-settings.md §3, T034).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mdiCoffeeMaker, mdiLightbulbOff } from '@mdi/js';
import { createHarness } from '../../support/app-harness.js';
import { waitFor } from '../../support/wait.js';

let h;
afterEach(async () => {
  await h?.close();
  h = null;
});

const preview = async (payload) => (await h.piRequest('icon.preview', payload)).payload;

test('a known icon name resolves as override with its path', async () => {
  h = await createHarness();
  assert.deepEqual(await preview({ name: 'mdi:coffee-maker' }), { found: true, name: 'mdi:coffee-maker', path: mdiCoffeeMaker, source: 'override' });
});

test('an unknown or invalid name is not found', async () => {
  h = await createHarness();
  assert.deepEqual(await preview({ name: 'mdi:nope' }), { found: false, name: null, path: null, source: null });
  assert.deepEqual(await preview({ name: '<svg>' }), { found: false, name: null, path: null, source: null });
});

test('without a name, the icon the bound entity would get is returned', async () => {
  h = await createHarness();
  await waitFor(() => h.app.iconData.loaded, { message: 'icon data' });
  assert.deepEqual(await preview({ name: '', entityId: 'light.hallway' }), {
    found: true,
    name: 'mdi:lightbulb-off',
    path: mdiLightbulbOff,
    source: 'component',
  });
  assert.equal((await preview({ entityId: 'light.unknown' })).found, false);
  assert.equal((await preview({})).found, false);
});

test('while disconnected a name still resolves, an entity does not', async () => {
  h = await createHarness({ connect: false });
  assert.equal((await preview({ name: 'mdi:coffee-maker' })).found, true);
  assert.equal((await preview({ entityId: 'light.hallway' })).found, false);
});
