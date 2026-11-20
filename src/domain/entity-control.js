// Shared per-entity control state (data-model.md §8): one throttle per entity, optimistic
// values per attribute, change/error notifications for every dial and the edit-mode key.
import { createThrottle } from './throttle.js';

const HOLD_MS = 1500;

export class EntityControl {
  /** @type {Map<string, { value: number | null, until: number, timer: any }>} */
  #optimistic = new Map();
  #listeners = new Set();
  #registry;

  constructor(entityId, registry) {
    this.entityId = entityId;
    this.#registry = registry;
  }

  /**
   * Records a locally set value and queues its service call.
   * @param {string} attributeId
   * @param {number | null} value null means "turned off"
   * @param {object} call ServiceCall
   */
  setTarget(attributeId, value, call) {
    const clock = this.#registry.clock;
    const previous = this.#optimistic.get(attributeId);
    if (previous?.timer != null) clock.clearTimeout(previous.timer);
    const timer = clock.setTimeout(() => {
      this.#optimistic.delete(attributeId);
      this.#notify({ type: 'change', attributeId });
      this.#registry.releaseIfIdle(this);
    }, this.#registry.holdMs);
    this.#optimistic.set(attributeId, { value, until: clock.now() + this.#registry.holdMs, timer });
    this.#registry.throttle.push(this.entityId, call, attributeId);
    this.#notify({ type: 'change', attributeId });
  }

  /** @returns {{ value: number | null } | null} the optimistic value while it is valid */
  getOptimistic(attributeId) {
    const entry = this.#optimistic.get(attributeId);
    if (!entry || this.#registry.clock.now() >= entry.until) return null;
    return { value: entry.value };
  }

  /** Drops the optimistic value once HA reports the target value. */
  reconcile(attributeId, haValue) {
    const entry = this.#optimistic.get(attributeId);
    if (entry && entry.value === haValue) this.#clear(attributeId);
  }

  /** @param {(event: { type: 'change' | 'error', attributeId?: string, error?: any }) => void} fn */
  subscribe(fn) {
    this.#listeners.add(fn);
    return () => {
      this.#listeners.delete(fn);
      this.#registry.releaseIfIdle(this);
    };
  }

  get idle() {
    return this.#listeners.size === 0 && this.#optimistic.size === 0 && !this.#registry.throttle.isActive(this.entityId);
  }

  /** @internal */
  clearAll() {
    for (const attributeId of [...this.#optimistic.keys()]) this.#clear(attributeId);
  }

  /** @internal */
  reportError(error, call) {
    this.#notify({ type: 'error', attributeId: undefined, error, call });
  }

  #clear(attributeId) {
    const entry = this.#optimistic.get(attributeId);
    if (!entry) return;
    if (entry.timer != null) this.#registry.clock.clearTimeout(entry.timer);
    this.#optimistic.delete(attributeId);
    this.#notify({ type: 'change', attributeId });
  }

  #notify(event) {
    for (const fn of [...this.#listeners]) fn(event);
  }
}

export class EntityControlRegistry {
  /** @type {Map<string, EntityControl>} */
  #controls = new Map();

  /**
   * @param {{
   *   clock: { now: () => number, setTimeout: Function, clearTimeout: Function },
   *   send: (call: object) => any,
   *   onError?: (error: any, call: object, entityId: string) => void,
   *   windowMs?: number,
   *   holdMs?: number,
   * }} options
   */
  constructor({ clock, send, onError, windowMs = 200, holdMs = HOLD_MS }) {
    this.clock = clock;
    this.holdMs = holdMs;
    this.throttle = createThrottle({
      windowMs,
      clock,
      send: (call, entityId) => {
        let result;
        try {
          result = send(call);
        } catch (err) {
          this.#fail(err, call, entityId);
          return;
        }
        if (result && typeof result.then === 'function') result.then(undefined, (err) => this.#fail(err, call, entityId));
      },
    });
    this.onError = onError;
  }

  /** @returns {EntityControl} */
  get(entityId) {
    let control = this.#controls.get(entityId);
    if (!control) {
      control = new EntityControl(entityId, this);
      this.#controls.set(entityId, control);
    }
    return control;
  }

  get size() {
    return this.#controls.size;
  }

  /** Drops pending calls and optimistic values for all entities (connection lost). */
  cancelPending() {
    this.throttle.cancelAll();
    for (const control of [...this.#controls.values()]) {
      control.clearAll();
      this.releaseIfIdle(control);
    }
  }

  /** @internal */
  releaseIfIdle(control) {
    if (control.idle && this.#controls.get(control.entityId) === control) this.#controls.delete(control.entityId);
  }

  #fail(err, call, entityId) {
    this.onError?.(err, call, entityId);
    this.#controls.get(entityId)?.reportError(err, call);
  }
}
