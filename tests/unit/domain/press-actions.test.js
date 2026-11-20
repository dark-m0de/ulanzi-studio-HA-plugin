import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pressActionFor } from '../../../src/domain/press-actions.js';
import { EntityStore } from '../../../src/domain/entity-store.js';
import { loadStates } from '../../support/fixtures/index.js';

const store = new EntityStore();
store.load(loadStates());
const e = (id) => store.get(id);
const svc = (call) => call && `${call.domain}.${call.service}`;

test('toggle domains use <domain>.toggle with the entity as target', () => {
  for (const id of ['light.living_room', 'switch.coffee', 'fan.bedroom', 'input_boolean.guest_mode', 'cover.blinds']) {
    const call = pressActionFor(e(id));
    assert.equal(svc(call), `${id.split('.')[0]}.toggle`, id);
    assert.deepEqual(call.target, { entity_id: id });
    assert.deepEqual(call.data, {});
  }
});

test('media players toggle play/pause (FR-026)', () => {
  assert.equal(svc(pressActionFor(e('media_player.living_room'))), 'media_player.media_play_pause');
});

test('climate turns off when on and on when off', () => {
  assert.equal(svc(pressActionFor(e('climate.office'))), 'climate.turn_off');
  assert.equal(svc(pressActionFor({ ...e('climate.office'), state: 'off' })), 'climate.turn_on');
});

test('scenes and scripts turn on, automations trigger', () => {
  assert.equal(svc(pressActionFor(e('scene.evening'))), 'scene.turn_on');
  assert.equal(svc(pressActionFor(e('script.good_night'))), 'script.turn_on');
  assert.equal(svc(pressActionFor(e('automation.morning'))), 'automation.trigger');
});

test('read-only domains and missing entities have no press action', () => {
  assert.equal(pressActionFor(e('sensor.outdoor_temperature')), null);
  assert.equal(pressActionFor(null), null);
});
