import { clamp, num, call } from './common.js';

const modes = (entity) => (Array.isArray(entity?.attributes?.supported_color_modes) ? entity.attributes.supported_color_modes : null);

export const brightness = {
  id: 'light.brightness',
  domains: ['light'],
  isSupported(entity) {
    const m = modes(entity);
    if (m) return m.some((mode) => mode !== 'onoff');
    return num(entity?.attributes?.brightness) !== null;
  },
  read(entity) {
    if (entity.state !== 'on') return null;
    const b = num(entity.attributes.brightness);
    return b === null ? null : Math.max(1, Math.round((b / 255) * 100));
  },
  bounds: () => ({ min: 1, max: 100 }),
  defaultSteps: () => ({ fine: 5, coarse: 20 }),
  unit: () => '%',
  toServiceCall(entity, raw, { offAtMin = false } = {}) {
    if (raw < 1 && offAtMin) return { value: null, call: call(entity, 'light', 'turn_off') };
    const value = clamp(Math.round(raw), 1, 100);
    return { value, call: call(entity, 'light', 'turn_on', { brightness_pct: value }) };
  },
};

export const colorTemp = {
  id: 'light.color_temp',
  domains: ['light'],
  isSupported: (entity) => Boolean(modes(entity)?.includes('color_temp')),
  read(entity) {
    if (entity.state !== 'on') return null;
    return num(entity.attributes.color_temp_kelvin);
  },
  bounds: (entity) => ({
    min: num(entity.attributes.min_color_temp_kelvin) ?? 2000,
    max: num(entity.attributes.max_color_temp_kelvin) ?? 6500,
  }),
  defaultSteps: () => ({ fine: 100, coarse: 500 }),
  unit: () => 'K',
  toServiceCall(entity, raw) {
    const { min, max } = this.bounds(entity);
    const value = clamp(Math.round(raw), min, max);
    return { value, call: call(entity, 'light', 'turn_on', { color_temp_kelvin: value }) };
  },
};
