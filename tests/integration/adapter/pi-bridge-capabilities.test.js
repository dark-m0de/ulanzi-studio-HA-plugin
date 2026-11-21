import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../../support/app-harness.js';

let h;
afterEach(async () => {
  await h?.close();
  h = null;
});

const caps = async (entityId) => (await h.piRequest('entity.capabilities', { entityId })).payload;
// Feature-001 fields only; pressActions (feature 002) has its own test below.
const base = async (entityId) => {
  const { pressActions, ...rest } = await caps(entityId);
  return rest;
};

test('entity.capabilities lists only supported attributes with unit, bounds and default steps (FR-022)', async () => {
  h = await createHarness();
  assert.deepEqual(await base('light.desk'), {
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
  assert.deepEqual(await base('light.hallway'), { attributes: [], longPressEligible: false });
  assert.deepEqual((await caps('cover.garage')).attributes, []);
  assert.deepEqual((await caps('cover.blinds')).attributes.map((a) => a.id), ['cover.position']);
});

test('unknown entities have no capabilities', async () => {
  h = await createHarness();
  assert.deepEqual(await base('light.nope'), { attributes: [], longPressEligible: false });
  assert.deepEqual(await base(undefined), { attributes: [], longPressEligible: false });
});

test('entity.capabilities lists the supported HA Dial press actions per attribute (feature 002)', async () => {
  h = await createHarness();
  const desk = await caps('light.desk');
  assert.deepEqual(desk.pressActions, {
    'light.brightness': ['default', 'switch_value', 'favorite', 'service', 'none'],
    'light.color_temp': ['default', 'switch_value', 'favorite', 'service', 'none'],
  });
  assert.deepEqual((await caps('light.living_room')).pressActions, { 'light.brightness': ['default', 'favorite', 'service', 'none'] });
  assert.deepEqual((await caps('light.nope')).pressActions, {});
});
