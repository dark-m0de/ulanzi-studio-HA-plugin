import { clamp, num, hasFeature, call } from './common.js';

const VOLUME_SET = 4;

export const volume = {
  id: 'media_player.volume',
  domains: ['media_player'],
  isSupported: (entity) => hasFeature(entity, VOLUME_SET),
  read(entity) {
    const v = num(entity.attributes.volume_level);
    return v === null ? null : Math.round(v * 100);
  },
  bounds: () => ({ min: 0, max: 100 }),
  defaultSteps: () => ({ fine: 5, coarse: 20 }),
  unit: () => '%',
  toServiceCall(entity, raw) {
    const value = clamp(Math.round(raw), 0, 100);
    return { value, call: call(entity, 'media_player', 'volume_set', { volume_level: Number((value / 100).toFixed(2)) }) };
  },
};
