// Converts dial detents into values (data-model.md §8a); state lives in the shared EntityControl.
import { getAttribute } from './attributes/index.js';

const positive = (value) => {
  const n = typeof value === 'string' ? Number(value.trim() || NaN) : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** `offAtMin` defaults to true; form values arrive as strings (FR-028). */
export const offAtMinEnabled = (value) => !(value === false || value === 'false');

export class DialController {
  /**
   * @param {{
   *   registry: import('./entity-control.js').EntityControlRegistry,
   *   getEntity: () => import('./entity-store.js').EntityState | null,
   *   entityId: string,
   *   attributeId: string,
   *   options?: { stepFine?: any, stepCoarse?: any, offAtMin?: any },
   * }} params
   */
  constructor({ registry, getEntity, entityId, attributeId, options = {} }) {
    this.registry = registry;
    this.getEntity = getEntity;
    this.entityId = entityId;
    this.attributeId = attributeId;
    this.options = options;
  }

  get attribute() {
    return getAttribute(this.attributeId);
  }

  get control() {
    return this.registry.get(this.entityId);
  }

  /** The attribute if the current entity supports it, else null. */
  supported() {
    const entity = this.getEntity();
    const attribute = this.attribute;
    return entity && attribute && attribute.domains.includes(entity.domain) && attribute.isSupported(entity) ? { entity, attribute } : null;
  }

  /** @returns {number | null} optimistic value while valid, else the HA value (null = off/unknown) */
  displayValue() {
    const s = this.supported();
    if (!s) return null;
    const optimistic = this.control.getOptimistic(this.attributeId);
    return optimistic ? optimistic.value : s.attribute.read(s.entity);
  }

  hasOptimistic() {
    return this.control.getOptimistic(this.attributeId) !== null;
  }

  steps(entity, attribute) {
    const defaults = attribute.defaultSteps(entity);
    return {
      fine: positive(this.options.stepFine) ?? defaults.fine,
      coarse: positive(this.options.stepCoarse) ?? defaults.coarse,
    };
  }

  /**
   * @param {'left' | 'right' | 'hold-left' | 'hold-right'} rotateEvent
   * @returns {number | null} the new display value, or null if nothing changed / not possible
   */
  rotate(rotateEvent) {
    const s = this.supported();
    if (!s) return null;
    const { entity, attribute } = s;
    const { fine, coarse } = this.steps(entity, attribute);
    const delta = { left: -fine, right: fine, 'hold-left': -coarse, 'hold-right': coarse }[rotateEvent];
    if (!delta) return null;
    const current = this.displayValue();
    let raw;
    if (current === null) {
      if (delta < 0) return null;
      raw = attribute.bounds(entity).min;
    } else {
      raw = current + delta;
    }
    const { value, call } = attribute.toServiceCall(entity, raw, { offAtMin: offAtMinEnabled(this.options.offAtMin) });
    if (value === current) return current;
    this.control.setTarget(this.attributeId, value, call);
    return value;
  }

  /**
   * Sets an absolute value (favourite value, feature 002) through the same path as rotation:
   * clamp/round, light turn-on, optimistic display, shared per-entity throttle.
   * @param {number} raw
   * @returns {number | null} the new display value, or null if not possible
   */
  setValue(raw) {
    const s = this.supported();
    if (!s || !Number.isFinite(raw)) return null;
    const { value, call } = s.attribute.toServiceCall(s.entity, raw, { offAtMin: false });
    this.control.setTarget(this.attributeId, value, call);
    return value;
  }

  /** Call after an HA state change: drops the optimistic value once HA reports it. */
  reconcile() {
    const s = this.supported();
    if (s) this.control.reconcile(this.attributeId, s.attribute.read(s.entity));
  }
}
