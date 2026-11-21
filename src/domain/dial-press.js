// Press action registry for HA Dial and HA Dynamic Dial (feature 002, data-model.md §2–§4,
// contracts/press-action-mapping.md). Pure: decides what a press does; the adapter executes it.
import { getAttribute, supportedAttributes } from './attributes/index.js';
import { pressActionFor } from './press-actions.js';
import { parseServiceCall } from './service-call.js';
import { call, hasFeature } from './attributes/common.js';

/**
 * @typedef {{ type: 'call', call: object }
 *   | { type: 'set_value', raw: number }
 *   | { type: 'end_edit' }
 *   | { type: 'switch_value' }
 *   | { type: 'none' }
 *   | { type: 'error', key: string }} PressOutcome
 * @typedef {{ kind: 'fixed' | 'dynamic', attributeId?: string }} PressContext
 */

const DEFAULT_BY_KIND = { fixed: 'default', dynamic: 'end_edit' };
const unsupported = () => ({ type: 'error', key: 'error.unsupportedPress' });

/** The attribute the dial currently controls, if the entity supports it. */
const activeAttribute = (entity, ctx) => {
  const attribute = getAttribute(ctx.attributeId);
  return attribute && attribute.domains.includes(entity.domain) && attribute.isSupported(entity) ? attribute : null;
};

// HA entity feature flags (contracts/press-action-mapping.md, research R-02).
const MEDIA_VOLUME_MUTE = 8;
const MEDIA_NEXT_TRACK = 32;
const CLIMATE_PRESET_MODE = 16;
const FAN_OSCILLATE = 2;
const FAN_PRESET_MODE = 8;
const COVER_OPEN = 1;
const COVER_CLOSE = 2;
const COVER_STOP = 8;

const list = (value) => (Array.isArray(value) ? value : []);
const presetFeature = { climate: CLIMATE_PRESET_MODE, fan: FAN_PRESET_MODE };

const toNumber = (value) => {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** The element after `current`; the first one if `current` is last or not in the list. */
export function cycleNext(list, current) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const index = list.indexOf(current);
  return index === -1 || index === list.length - 1 ? list[0] : list[index + 1];
}

/** The next supported controllable value after `currentId`, or null with fewer than two. */
export function nextAttribute(entity, currentId) {
  const ids = supportedAttributes(entity).map((a) => a.id);
  if (ids.length < 2) return null;
  return cycleNext(ids, currentId);
}

/**
 * @type {{
 *   id: string,
 *   dialKinds: ('fixed' | 'dynamic')[],
 *   isSupported: (entity: any, ctx: PressContext) => boolean,
 *   resolve: (entity: any, settings: Record<string, any>, ctx: PressContext) => PressOutcome,
 * }[]}
 */
export const PRESS_ACTIONS = [
  {
    id: 'end_edit',
    dialKinds: ['dynamic'],
    isSupported: () => true,
    resolve: () => ({ type: 'end_edit' }),
  },
  {
    id: 'default',
    dialKinds: ['fixed'],
    isSupported: (entity) => pressActionFor(entity) !== null,
    resolve: (entity) => ({ type: 'call', call: pressActionFor(entity) }),
  },
  {
    id: 'toggle',
    dialKinds: ['dynamic'],
    isSupported: (entity) => pressActionFor(entity) !== null,
    resolve: (entity) => ({ type: 'call', call: pressActionFor(entity) }),
  },
  {
    // Offered only with two or more values, but a press always resolves (FR-025, FR-032 exception).
    id: 'switch_value',
    dialKinds: ['fixed', 'dynamic'],
    isSupported: (entity) => supportedAttributes(entity).length >= 2,
    resolve: () => ({ type: 'switch_value' }),
  },
  {
    id: 'favorite',
    dialKinds: ['fixed'],
    isSupported: (entity, ctx) => activeAttribute(entity, ctx) !== null,
    resolve: (entity, settings) => {
      const raw = toNumber(settings.favoriteValue);
      return raw === null ? { type: 'error', key: 'error.invalidFavorite' } : { type: 'set_value', raw };
    },
  },
  {
    id: 'mute',
    dialKinds: ['fixed'],
    isSupported: (entity) => entity.domain === 'media_player' && hasFeature(entity, MEDIA_VOLUME_MUTE),
    resolve: (entity) => ({
      type: 'call',
      call: call(entity, 'media_player', 'volume_mute', { is_volume_muted: !entity.attributes.is_volume_muted }),
    }),
  },
  {
    id: 'next_track',
    dialKinds: ['fixed'],
    isSupported: (entity) => entity.domain === 'media_player' && hasFeature(entity, MEDIA_NEXT_TRACK),
    resolve: (entity) => ({ type: 'call', call: call(entity, 'media_player', 'media_next_track') }),
  },
  {
    id: 'hvac_cycle',
    dialKinds: ['fixed'],
    isSupported: (entity) => entity.domain === 'climate' && list(entity.attributes.hvac_modes).length >= 2,
    resolve: (entity) => ({
      type: 'call',
      call: call(entity, 'climate', 'set_hvac_mode', { hvac_mode: cycleNext(entity.attributes.hvac_modes, entity.state) }),
    }),
  },
  {
    id: 'preset_cycle',
    dialKinds: ['fixed'],
    isSupported: (entity) =>
      entity.domain in presetFeature && hasFeature(entity, presetFeature[entity.domain]) && list(entity.attributes.preset_modes).length >= 2,
    resolve: (entity) => ({
      type: 'call',
      call: call(entity, entity.domain, 'set_preset_mode', {
        preset_mode: cycleNext(entity.attributes.preset_modes, entity.attributes.preset_mode),
      }),
    }),
  },
  {
    id: 'cover_stop_toggle',
    dialKinds: ['fixed'],
    isSupported: (entity) =>
      entity.domain === 'cover' && hasFeature(entity, COVER_STOP) && (hasFeature(entity, COVER_OPEN) || hasFeature(entity, COVER_CLOSE)),
    resolve: (entity) => ({
      type: 'call',
      call: call(entity, 'cover', entity.state === 'opening' || entity.state === 'closing' ? 'stop_cover' : 'toggle'),
    }),
  },
  {
    id: 'oscillate',
    dialKinds: ['fixed'],
    isSupported: (entity) => entity.domain === 'fan' && hasFeature(entity, FAN_OSCILLATE),
    resolve: (entity) => ({ type: 'call', call: call(entity, 'fan', 'oscillate', { oscillating: !entity.attributes.oscillating }) }),
  },
  {
    id: 'service',
    dialKinds: ['fixed'],
    isSupported: () => true,
    resolve: (entity, settings) => {
      const call = parseServiceCall({
        domain: settings.pressDomain,
        service: settings.pressServiceName,
        target: settings.pressTarget,
        data: settings.pressData,
      });
      return call ? { type: 'call', call } : { type: 'error', key: 'error.invalidService' };
    },
  },
  {
    id: 'none',
    dialKinds: ['fixed', 'dynamic'],
    isSupported: () => true,
    resolve: () => ({ type: 'none' }),
  },
];

const entryFor = (id, kind) => PRESS_ACTIONS.find((a) => a.id === id && a.dialKinds.includes(kind)) ?? null;

/**
 * Press actions to offer in the settings page, in registry order (FR-031).
 * @param {any} entity
 * @param {PressContext} ctx
 */
export function supportedPressActions(entity, ctx) {
  return PRESS_ACTIONS.filter((a) => a.dialKinds.includes(ctx.kind) && (a.id === 'none' || (entity && a.isSupported(entity, ctx)))).map(
    (a) => a.id,
  );
}

/**
 * Decides what a press does.
 * @param {any} entity
 * @param {Record<string, any>} settings dial settings (`pressAction` and its parameters)
 * @param {PressContext} ctx
 * @returns {PressOutcome}
 */
export function resolvePress(entity, settings, ctx) {
  const id = typeof settings?.pressAction === 'string' && settings.pressAction ? settings.pressAction : DEFAULT_BY_KIND[ctx.kind];
  const entry = entryFor(id, ctx.kind);
  if (!entry) return unsupported();
  if (entry.id === 'none' || entry.id === 'switch_value' || entry.id === 'end_edit') return entry.resolve(entity, settings ?? {}, ctx);
  if (!entity || !entry.isSupported(entity, ctx)) return unsupported();
  return entry.resolve(entity, settings ?? {}, ctx);
}
