import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cycleNext, nextAttribute, supportedPressActions, resolvePress } from '../../../src/domain/dial-press.js';
import { EntityStore } from '../../../src/domain/entity-store.js';
import { loadStates } from '../../support/fixtures/index.js';

const store = new EntityStore();
store.load(loadStates());
const e = (id) => store.get(id);
const fixed = (attributeId) => ({ kind: 'fixed', attributeId });

// --- core (T003) ---------------------------------------------------------------------------

test('cycleNext returns the next element, wraps around and starts at the first for unknown values', () => {
  assert.equal(cycleNext(['a', 'b', 'c'], 'a'), 'b');
  assert.equal(cycleNext(['a', 'b', 'c'], 'c'), 'a');
  assert.equal(cycleNext(['a', 'b', 'c'], 'x'), 'a');
  assert.equal(cycleNext(['a', 'b', 'c'], undefined), 'a');
  assert.equal(cycleNext([], 'a'), null);
  assert.equal(cycleNext(undefined, 'a'), null);
});

test('nextAttribute cycles through the supported values, null for single-value entities', () => {
  assert.equal(nextAttribute(e('light.desk'), 'light.brightness'), 'light.color_temp');
  assert.equal(nextAttribute(e('light.desk'), 'light.color_temp'), 'light.brightness');
  assert.equal(nextAttribute(e('light.living_room'), 'light.brightness'), null);
  assert.equal(nextAttribute(e('climate.office'), 'climate.temperature'), null);
  assert.equal(nextAttribute(null, 'light.brightness'), null);
});

test('an unknown press action resolves to error.unsupportedPress', () => {
  assert.deepEqual(resolvePress(e('light.living_room'), { pressAction: 'nope' }, fixed('light.brightness')), {
    type: 'error',
    key: 'error.unsupportedPress',
  });
});

test('supportedPressActions only returns actions of the requested dial kind, in registry order', () => {
  const ids = supportedPressActions(e('light.living_room'), fixed('light.brightness'));
  assert.equal(ids[0], 'default');
  assert.equal(ids.at(-1), 'none');
  assert.ok(!ids.includes('end_edit'));
  assert.deepEqual(supportedPressActions(null, fixed('light.brightness')), ['none']);
});

test('fixed default: missing pressAction resolves to the feature-001 domain action', () => {
  assert.deepEqual(resolvePress(e('light.living_room'), {}, fixed('light.brightness')), {
    type: 'call',
    call: { domain: 'light', service: 'toggle', target: { entity_id: 'light.living_room' }, data: {} },
  });
  assert.equal(resolvePress(e('media_player.living_room'), {}, fixed('media_player.volume')).call.service, 'media_play_pause');
  assert.deepEqual(resolvePress(e('light.living_room'), { pressAction: 'none' }, fixed('light.brightness')), { type: 'none' });
});

// --- US1: Dynamic Dial (T009) --------------------------------------------------------------

const dynamic = { kind: 'dynamic', attributeId: 'light.brightness' };

test('dynamic: missing pressAction ends editing; toggle and none work as configured', () => {
  assert.deepEqual(resolvePress(e('light.living_room'), {}, dynamic), { type: 'end_edit' });
  assert.deepEqual(resolvePress(e('light.living_room'), { pressAction: 'end_edit' }, dynamic), { type: 'end_edit' });
  assert.deepEqual(resolvePress(e('light.living_room'), { pressAction: 'toggle' }, dynamic), {
    type: 'call',
    call: { domain: 'light', service: 'toggle', target: { entity_id: 'light.living_room' }, data: {} },
  });
  assert.deepEqual(resolvePress(e('light.living_room'), { pressAction: 'none' }, dynamic), { type: 'none' });
  assert.deepEqual(resolvePress(e('sensor.outdoor_temperature'), { pressAction: 'toggle' }, dynamic), {
    type: 'error',
    key: 'error.unsupportedPress',
  });
});

test('dynamic: supportedPressActions lists switch_value only for entities with two or more values', () => {
  assert.deepEqual(supportedPressActions(e('light.desk'), dynamic), ['end_edit', 'toggle', 'switch_value', 'none']);
  assert.deepEqual(supportedPressActions(e('light.living_room'), dynamic), ['end_edit', 'toggle', 'none']);
});

test('fixed-only actions are not available for the Dynamic Dial', () => {
  assert.equal(resolvePress(e('light.living_room'), { pressAction: 'default' }, dynamic).type, 'error');
});

// --- US2: favourite, service, default, none (T016) -----------------------------------------

test('favorite resolves to set_value with the numeric favourite value', () => {
  assert.deepEqual(resolvePress(e('light.living_room'), { pressAction: 'favorite', favoriteValue: '100' }, fixed('light.brightness')), {
    type: 'set_value',
    raw: 100,
  });
  assert.deepEqual(resolvePress(e('light.desk'), { pressAction: 'favorite', favoriteValue: 2700 }, fixed('light.color_temp')), {
    type: 'set_value',
    raw: 2700,
  });
});

test('favorite with an empty or non-numeric value resolves to error.invalidFavorite', () => {
  for (const favoriteValue of ['', '  ', 'abc', undefined, null]) {
    assert.deepEqual(resolvePress(e('light.living_room'), { pressAction: 'favorite', favoriteValue }, fixed('light.brightness')), {
      type: 'error',
      key: 'error.invalidFavorite',
    });
  }
});

test('favorite is offered only when the active attribute is supported', () => {
  assert.ok(supportedPressActions(e('light.living_room'), fixed('light.brightness')).includes('favorite'));
  assert.ok(!supportedPressActions(e('light.hallway'), fixed('light.brightness')).includes('favorite'));
});

test('service resolves to the parsed call, invalid configuration to error.invalidService', () => {
  const settings = { pressAction: 'service', pressDomain: 'light', pressServiceName: 'turn_on', pressTarget: 'light.desk', pressData: '{"brightness_pct": 100}' };
  assert.deepEqual(resolvePress(e('light.living_room'), settings, fixed('light.brightness')), {
    type: 'call',
    call: { domain: 'light', service: 'turn_on', target: { entity_id: 'light.desk' }, data: { brightness_pct: 100 } },
  });
  assert.deepEqual(resolvePress(e('light.living_room'), { ...settings, pressData: '{oops' }, fixed('light.brightness')), {
    type: 'error',
    key: 'error.invalidService',
  });
  assert.deepEqual(resolvePress(e('light.living_room'), { pressAction: 'service' }, fixed('light.brightness')), {
    type: 'error',
    key: 'error.invalidService',
  });
});

test('default is not offered when the entity has no domain action; service and none always are', () => {
  const ids = supportedPressActions(e('input_number.volume_target'), fixed('number.value'));
  assert.ok(!ids.includes('default'));
  assert.ok(ids.includes('service'));
  assert.ok(ids.includes('none'));
});

// --- US3: switch_value (T024) --------------------------------------------------------------

test('switch_value is listed only with two or more values but always resolves (FR-025, FR-032 exception)', () => {
  assert.ok(supportedPressActions(e('light.desk'), fixed('light.brightness')).includes('switch_value'));
  assert.ok(!supportedPressActions(e('light.living_room'), fixed('light.brightness')).includes('switch_value'));
  for (const kind of ['fixed', 'dynamic']) {
    assert.deepEqual(resolvePress(e('light.desk'), { pressAction: 'switch_value' }, { kind, attributeId: 'light.brightness' }), { type: 'switch_value' });
    assert.deepEqual(resolvePress(e('light.living_room'), { pressAction: 'switch_value' }, { kind, attributeId: 'light.brightness' }), { type: 'switch_value' });
  }
});

// --- US4: domain-specific actions (T034) ---------------------------------------------------

const callOf = (entityId, pressAction, attributeId, mutate) => {
  const entity = mutate ? mutate(structuredClone(e(entityId))) : e(entityId);
  return resolvePress(entity, { pressAction }, fixed(attributeId));
};
const svcData = (o) => o.type === 'call' && [`${o.call.domain}.${o.call.service}`, o.call.data];

test('mute inverts is_volume_muted; next_track skips', () => {
  assert.deepEqual(svcData(callOf('media_player.living_room', 'mute', 'media_player.volume')), ['media_player.volume_mute', { is_volume_muted: true }]);
  assert.deepEqual(
    svcData(callOf('media_player.living_room', 'mute', 'media_player.volume', (x) => ((x.attributes.is_volume_muted = true), x))),
    ['media_player.volume_mute', { is_volume_muted: false }],
  );
  assert.deepEqual(svcData(callOf('media_player.living_room', 'next_track', 'media_player.volume')), ['media_player.media_next_track', {}]);
});

test('hvac_cycle steps through the entity modes and wraps around (FR-007)', () => {
  assert.deepEqual(svcData(callOf('climate.office', 'hvac_cycle', 'climate.temperature')), ['climate.set_hvac_mode', { hvac_mode: 'auto' }]);
  assert.deepEqual(
    svcData(callOf('climate.office', 'hvac_cycle', 'climate.temperature', (x) => ((x.state = 'auto'), x))),
    ['climate.set_hvac_mode', { hvac_mode: 'off' }],
  );
});

test('preset_cycle works for thermostats and fans', () => {
  assert.deepEqual(svcData(callOf('climate.office', 'preset_cycle', 'climate.temperature')), ['climate.set_preset_mode', { preset_mode: 'eco' }]);
  assert.deepEqual(svcData(callOf('fan.bedroom', 'preset_cycle', 'fan.percentage')), ['fan.set_preset_mode', { preset_mode: 'sleep' }]);
  assert.deepEqual(
    svcData(callOf('fan.bedroom', 'preset_cycle', 'fan.percentage', (x) => ((x.attributes.preset_mode = 'sleep'), x))),
    ['fan.set_preset_mode', { preset_mode: 'auto' }],
  );
});

test('cover_stop_toggle stops a moving cover and toggles a still one (FR-008)', () => {
  assert.deepEqual(svcData(callOf('cover.blinds', 'cover_stop_toggle', 'cover.position')), ['cover.toggle', {}]);
  for (const state of ['opening', 'closing']) {
    assert.deepEqual(svcData(callOf('cover.blinds', 'cover_stop_toggle', 'cover.position', (x) => ((x.state = state), x))), ['cover.stop_cover', {}]);
  }
});

test('oscillate inverts the fan oscillation', () => {
  assert.deepEqual(svcData(callOf('fan.bedroom', 'oscillate', 'fan.percentage')), ['fan.oscillate', { oscillating: true }]);
});

test('domain actions are offered only with the capability; saved unsupported ones are errors', () => {
  const media = supportedPressActions(e('media_player.living_room'), fixed('media_player.volume'));
  assert.ok(media.includes('mute') && media.includes('next_track'));
  const climate = supportedPressActions(e('climate.office'), fixed('climate.temperature'));
  assert.ok(climate.includes('hvac_cycle') && climate.includes('preset_cycle'));
  const fan = supportedPressActions(e('fan.bedroom'), fixed('fan.percentage'));
  assert.ok(fan.includes('oscillate') && fan.includes('preset_cycle'));
  assert.ok(supportedPressActions(e('cover.blinds'), fixed('cover.position')).includes('cover_stop_toggle'));
  assert.ok(!supportedPressActions(e('light.living_room'), fixed('light.brightness')).some((id) => ['mute', 'next_track', 'hvac_cycle', 'preset_cycle', 'cover_stop_toggle', 'oscillate'].includes(id)));
  assert.ok(!supportedPressActions(e('cover.garage'), fixed('cover.position')).includes('cover_stop_toggle'));
  assert.deepEqual(callOf('light.living_room', 'mute', 'light.brightness'), { type: 'error', key: 'error.unsupportedPress' });
  assert.deepEqual(callOf('cover.garage', 'cover_stop_toggle', 'cover.position'), { type: 'error', key: 'error.unsupportedPress' });
});

test('the full HA Dial registry order (fixed kind)', () => {
  assert.deepEqual(supportedPressActions(e('media_player.living_room'), fixed('media_player.volume')), [
    'default',
    'favorite',
    'mute',
    'next_track',
    'service',
    'none',
  ]);
});
