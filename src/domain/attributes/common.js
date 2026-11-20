// Shared helpers for controllable attributes.

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Rounds to a multiple of step (relative to base) without floating-point noise. */
export function roundToStep(value, step, base = 0) {
  if (!step || step <= 0) return value;
  const decimals = (String(step).split('.')[1] ?? '').length;
  const rounded = Math.round((value - base) / step) * step + base;
  return Number(rounded.toFixed(decimals));
}

export const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export const hasFeature = (entity, bit) => ((entity?.attributes?.supported_features ?? 0) & bit) === bit;

export const target = (entity) => ({ entity_id: entity.entityId });

export const call = (entity, domain, service, data = {}) => ({ domain, service, target: target(entity), data });
