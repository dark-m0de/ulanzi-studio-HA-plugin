import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../../support/app-harness.js';

let h;
afterEach(async () => {
  await h?.close();
  h = null;
});

const caps = async (entityId) => (await h.piRequest('entity.capabilities', { entityId })).payload;

test('entity.capabilities lists only supported attributes with unit, bounds and default steps (FR-022)', async () => {
  h = await createHarness();
  assert.deepEqual(await caps('light.desk'), {
    attributes: [
      { id: 'light.brightness', unit: '%', min: 1, max: 100, defaultFine: 5, defaultCoarse: 20 },
      { id: 'light.color_temp', unit: 'K', min: 2200, max: 6500, defaultFine: 100, defaultCoarse: 500 },
    ],
    longPressEligible: true,
  });
  assert.deepEqual((await caps('climate.office')).attributes, [
    { id: 'climate.temperature', unit: '°', min: 7, max: 30, defaultFine: 0.5, defaultCoarse: 2 },
  ]);
});

test('no colour temperature for an on/off light, no position for a cover without SET_POSITION', async () => {
  h = await createHarness();
  assert.deepEqual(await caps('light.hallway'), { attributes: [], longPressEligible: false });
  assert.deepEqual((await caps('cover.garage')).attributes, []);
  assert.deepEqual((await caps('cover.blinds')).attributes.map((a) => a.id), ['cover.position']);
});

test('unknown entities have no capabilities', async () => {
  h = await createHarness();
  assert.deepEqual(await caps('light.nope'), { attributes: [], longPressEligible: false });
  assert.deepEqual(await caps(undefined), { attributes: [], longPressEligible: false });
});
