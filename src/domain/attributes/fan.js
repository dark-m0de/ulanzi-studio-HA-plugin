import { clamp, num, hasFeature, call, roundToStep } from './common.js';

const SET_SPEED = 1;
const step = (entity) => num(entity.attributes.percentage_step) ?? 5;

export const percentage = {
  id: 'fan.percentage',
  domains: ['fan'],
  isSupported: (entity) => hasFeature(entity, SET_SPEED),
  read: (entity) => num(entity.attributes.percentage),
  bounds: () => ({ min: 0, max: 100 }),
  defaultSteps: (entity) => ({ fine: step(entity), coarse: Math.min(100, step(entity) * 4) }),
  unit: () => '%',
  toServiceCall(entity, raw, { offAtMin = false } = {}) {
    if (raw <= 0 && offAtMin) return { value: null, call: call(entity, 'fan', 'turn_off') };
    const value = clamp(roundToStep(raw, 1), 0, 100);
    return { value, call: call(entity, 'fan', 'set_percentage', { percentage: value }) };
  },
};
