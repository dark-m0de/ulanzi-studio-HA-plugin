import { clamp, num, hasFeature, call } from './common.js';

const SET_POSITION = 4;

export const position = {
  id: 'cover.position',
  domains: ['cover'],
  isSupported: (entity) => hasFeature(entity, SET_POSITION),
  read: (entity) => num(entity.attributes.current_position),
  bounds: () => ({ min: 0, max: 100 }),
  defaultSteps: () => ({ fine: 5, coarse: 20 }),
  unit: () => '%',
  toServiceCall(entity, raw) {
    const value = clamp(Math.round(raw), 0, 100);
    return { value, call: call(entity, 'cover', 'set_cover_position', { position: value }) };
  },
};
