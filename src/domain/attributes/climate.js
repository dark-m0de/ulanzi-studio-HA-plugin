import { clamp, num, hasFeature, call, roundToStep } from './common.js';

const TARGET_TEMPERATURE = 1;
const step = (entity) => num(entity.attributes.target_temp_step) ?? 0.5;

export const temperature = {
  id: 'climate.temperature',
  domains: ['climate'],
  isSupported: (entity) => hasFeature(entity, TARGET_TEMPERATURE),
  read: (entity) => num(entity.attributes.temperature),
  bounds: (entity) => ({ min: num(entity.attributes.min_temp) ?? 7, max: num(entity.attributes.max_temp) ?? 35 }),
  defaultSteps: (entity) => ({ fine: step(entity), coarse: step(entity) * 4 }),
  unit: () => '°',
  toServiceCall(entity, raw) {
    const { min, max } = this.bounds(entity);
    const value = clamp(roundToStep(raw, step(entity)), min, max);
    return { value, call: call(entity, 'climate', 'set_temperature', { temperature: value }) };
  },
};
