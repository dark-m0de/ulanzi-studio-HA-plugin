// Built-in icons for the key domains (feature 003, research R-06). Used when HA provides no icon
// definitions (HA < 2024.2, failed request, or before they arrive). The definitions are copied
// from Home Assistant's `icons.json` (entity_component sections) and use the same shape, so the
// same resolution logic (iconFromDefinition) applies.
import { iconFromDefinition } from './resolve.js';

const UP_DOWN = { closing: 'mdi:arrow-down-box', opening: 'mdi:arrow-up-box' };

/** @type {Readonly<Record<string, Record<string, import('./resolve.js').IconDefinition>>>} */
export const FALLBACK_ICONS = Object.freeze({
  light: { _: { default: 'mdi:lightbulb', state: { off: 'mdi:lightbulb-off' } } },
  switch: {
    _: { default: 'mdi:toggle-switch-variant', state: { off: 'mdi:toggle-switch-variant-off' } },
    outlet: { default: 'mdi:power-plug', state: { off: 'mdi:power-plug-off' } },
  },
  fan: { _: { default: 'mdi:fan', state: { off: 'mdi:fan-off' } } },
  cover: {
    _: { default: 'mdi:dock-top', state: { closed: 'mdi:card', ...UP_DOWN } },
    blind: { default: 'mdi:blinds-horizontal', state: { closed: 'mdi:blinds-horizontal-closed', ...UP_DOWN } },
    curtain: {
      default: 'mdi:curtains',
      state: { closed: 'mdi:curtains-closed', closing: 'mdi:arrow-collapse-horizontal', opening: 'mdi:arrow-split-vertical' },
    },
    door: { default: 'mdi:door-open', state: { closed: 'mdi:door-closed' } },
    garage: { default: 'mdi:garage-open', state: { closed: 'mdi:garage', ...UP_DOWN } },
    gate: {
      default: 'mdi:gate-open',
      state: { closed: 'mdi:gate', closing: 'mdi:arrow-collapse-horizontal', opening: 'mdi:arrow-split-vertical' },
    },
    shade: { default: 'mdi:roller-shade', state: { closed: 'mdi:roller-shade-closed', ...UP_DOWN } },
    shutter: { default: 'mdi:window-shutter-open', state: { closed: 'mdi:window-shutter', ...UP_DOWN } },
    window: { default: 'mdi:window-open-variant', state: { closed: 'mdi:window-closed-variant', ...UP_DOWN } },
  },
  media_player: {
    _: { default: 'mdi:cast', state: { off: 'mdi:cast-off', paused: 'mdi:cast-connected', playing: 'mdi:cast-connected' } },
    speaker: { default: 'mdi:speaker', state: { off: 'mdi:speaker-off', paused: 'mdi:speaker-pause', playing: 'mdi:speaker-play' } },
    tv: { default: 'mdi:television', state: { off: 'mdi:television-off', paused: 'mdi:television-pause', playing: 'mdi:television-play' } },
  },
  climate: { _: { default: 'mdi:thermostat' } },
  input_boolean: { _: { default: 'mdi:check-circle-outline', state: { off: 'mdi:close-circle-outline' } } },
  scene: { _: { default: 'mdi:palette' } },
  script: { _: { default: 'mdi:script-text', state: { on: 'mdi:script-text-play' } } },
  automation: { _: { default: 'mdi:robot', state: { off: 'mdi:robot-off' } } },
  sensor: {
    _: { default: 'mdi:eye' },
    temperature: { default: 'mdi:thermometer' },
    humidity: { default: 'mdi:water-percent' },
    battery: {
      default: 'mdi:battery-unknown',
      range: {
        0: 'mdi:battery-alert',
        10: 'mdi:battery-10',
        20: 'mdi:battery-20',
        30: 'mdi:battery-30',
        40: 'mdi:battery-40',
        50: 'mdi:battery-50',
        60: 'mdi:battery-60',
        70: 'mdi:battery-70',
        80: 'mdi:battery-80',
        90: 'mdi:battery-90',
        100: 'mdi:battery',
      },
    },
  },
});

/**
 * @param {string | undefined} domain
 * @param {string | undefined} deviceClass
 * @param {string} state
 * @returns {string | null} icon name
 */
export function fallbackIcon(domain, deviceClass, state) {
  const defs = typeof domain === 'string' && Object.hasOwn(FALLBACK_ICONS, domain) ? FALLBACK_ICONS[domain] : null;
  if (!defs) return null;
  const def = (typeof deviceClass === 'string' && Object.hasOwn(defs, deviceClass) && defs[deviceClass]) || defs._;
  return iconFromDefinition(state, def);
}
