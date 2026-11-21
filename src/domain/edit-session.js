// Single edit session broker for long-press editing (data-model.md §6, FR-030–FR-039).
import { editAttributeFor } from './attributes/index.js';
import { nextAttribute } from './dial-press.js';

const DEFAULT_TIMEOUT_S = 10;
const MIN_TIMEOUT_S = 3;
const MAX_TIMEOUT_S = 60;

const timeoutSeconds = (value) => {
  const n = typeof value === 'string' ? Number(value.trim() || NaN) : Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_S;
  return Math.min(MAX_TIMEOUT_S, Math.max(MIN_TIMEOUT_S, n));
};

/** @typedef {{ entityId: string, attributeId: string, sourceContext: string }} EditSession */

export class EditSessionBroker {
  /** @type {Map<string, number>} Dynamic Dial context → edit timeout in s */
  #dials = new Map();
  /** @type {EditSession | null} */
  #session = null;
  #timer = null;
  #listeners = new Set();
  #clock;

  /** @param {{ clock: { setTimeout: Function, clearTimeout: Function } }} options */
  constructor({ clock }) {
    this.#clock = clock;
  }

  /** @returns {EditSession | null} */
  get session() {
    return this.#session;
  }

  get dialContexts() {
    return [...this.#dials.keys()];
  }

  /** Largest timeout of all registered Dynamic Dials, so no dial cuts a session short. */
  get timeoutMs() {
    const values = [...this.#dials.values()];
    return (values.length ? Math.max(...values) : DEFAULT_TIMEOUT_S) * 1000;
  }

  registerDial(context, { timeoutS } = {}) {
    this.#dials.set(context, timeoutSeconds(timeoutS));
  }

  updateDial(context, { timeoutS } = {}) {
    if (this.#dials.has(context)) this.#dials.set(context, timeoutSeconds(timeoutS));
  }

  unregisterDial(context) {
    if (!this.#dials.delete(context)) return;
    if (this.#dials.size === 0) this.end('no_dials');
  }

  isSource(context) {
    return this.#session?.sourceContext === context;
  }

  /**
   * Starts (or switches) edit mode for the entity of a long-pressed key.
   * @returns {'started' | 'switched' | 'no_dial' | 'ineligible'}
   */
  start({ sourceContext, entity }) {
    const attribute = editAttributeFor(entity);
    if (!attribute) return 'ineligible';
    if (this.#dials.size === 0) return 'no_dial';
    const result = this.#session && this.#session.sourceContext !== sourceContext ? 'switched' : 'started';
    this.#session = { entityId: entity.entityId, attributeId: attribute.id, sourceContext };
    this.#armTimer();
    this.#emit({ session: this.#session, reason: result });
    return result;
  }

  /**
   * Switches the edited value to the entity's next controllable value (feature 002, FR-022).
   * @returns {boolean} false when idle or the entity has no other value
   */
  switchAttribute(entity) {
    if (!this.#session || entity?.entityId !== this.#session.entityId) return false;
    const next = nextAttribute(entity, this.#session.attributeId);
    if (!next) return false;
    this.#session = { ...this.#session, attributeId: next };
    this.#armTimer();
    this.#emit({ session: this.#session, reason: 'switched_value' });
    return true;
  }

  /** Any user input during edit mode extends the session. */
  input() {
    if (this.#session) this.#armTimer();
  }

  /** @param {string} reason */
  end(reason) {
    if (!this.#session) return;
    this.#clearTimer();
    this.#session = null;
    this.#emit({ session: null, reason });
  }

  pageInactive(context) {
    if (this.isSource(context)) this.end('page');
  }

  sourceCleared(context) {
    if (this.isSource(context)) this.end('cleared');
  }

  connectionLost() {
    this.end('disconnected');
  }

  entityUnavailable(entityId) {
    if (this.#session?.entityId === entityId) this.end('unavailable');
  }

  /** @param {(event: { session: EditSession | null, reason: string }) => void} fn */
  onChange(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #armTimer() {
    this.#clearTimer();
    this.#timer = this.#clock.setTimeout(() => {
      this.#timer = null;
      this.end('timeout');
    }, this.timeoutMs);
  }

  #clearTimer() {
    if (this.#timer !== null) this.#clock.clearTimeout(this.#timer);
    this.#timer = null;
  }

  #emit(event) {
    for (const fn of [...this.#listeners]) fn(event);
  }
}
