import { clamp, num, call, roundToStep } from './common.js';

const step = (entity) => num(entity.attributes.step) ?? 1;

export const value = {
  id: 'number.value',
  domains: ['input_number', 'number'],
  isSupported: (entity) => entity?.domain === 'input_number' || entity?.domain === 'number',
  read(entity) {
    const v = Number(entity.state);
    return Number.isFinite(v) ? v : null;
  },
  bounds: (entity) => ({ min: num(entity.attributes.min) ?? 0, max: num(entity.attributes.max) ?? 100 }),
  defaultSteps: (entity) => ({ fine: step(entity), coarse: step(entity) * 10 }),
  unit: (entity) => (typeof entity.attributes.unit_of_measurement === 'string' ? entity.attributes.unit_of_measurement : ''),
  toServiceCall(entity, raw) {
    const { min, max } = this.bounds(entity);
    const v = clamp(roundToStep(raw, step(entity), min), min, max);
    return { value: v, call: call(entity, entity.domain, 'set_value', { value: v }) };
  },
};
