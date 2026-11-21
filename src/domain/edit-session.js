// Single edit session broker for long-press editing (data-model.md §6, FR-030–FR-039).
import { editAttributeFor } from './attributes/index.js';
import { nextAttribute } from './dial-press.js';
import { targetUsable } from './selected-values.js';

const DEFAULT_TIMEOUT_S = 10;
const MIN_TIMEOUT_S = 3;
const MAX_TIMEOUT_S = 60;

const timeoutSeconds = (value) => {
  const n = typeof value === 'string' ? Number(value.trim() || NaN) : Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_S;
  return Math.min(MAX_TIMEOUT_S, Math.max(MIN_TIMEOUT_S, n));
};

/**
 * `entityId`/`attributeId` are the value being edited. With selected values (feature 004) they
 * mirror `targets[targetIndex]`; in the classic mode `targets` is empty and `targetIndex` is -1.
 * @typedef {{
 *   entityId: string,
 *   attributeId: string,
 *   sourceContext: string,
 *   targets: import('./selected-values.js').SelectedValue[],
 *   targetIndex: number,
 * }} EditSession
 */

export class EditSessionBroker {
  /** @type {Map<string, number>} Dynamic Dial context → edit timeout in s */
  #dials = new Map();
  /** @type {EditSession | null} */
  #session = null;
  #timer = null;
  #listeners = new Set();
  #clock;
  #getEntity;

  /**
   * @param {{
   *   clock: { setTimeout: Function, clearTimeout: Function },
   *   getEntity?: (entityId: string) => import('./entity-store.js').EntityState | null,
   * }} options `getEntity` checks whether selected values are usable (feature 004).
   */
  constructor({ clock, getEntity = () => null }) {
    this.#clock = clock;
    this.#getEntity = getEntity;
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
    this.#session = { entityId: entity.entityId, attributeId: attribute.id, sourceContext, targets: [], targetIndex: -1 };
    this.#armTimer();
    this.#emit({ session: this.#session, reason: result });
    return result;
  }

  /**
   * Starts (or switches) edit mode for the selected values of a long-pressed key (feature 004),
   * beginning with the first usable entry.
   * @param {{ sourceContext: string, targets: import('./selected-values.js').SelectedValue[] }} params
   * @returns {'started' | 'switched' | 'no_dial' | 'ineligible'}
   */
  startTargets({ sourceContext, targets }) {
    const list = Array.isArray(targets) ? targets : [];
    const index = list.findIndex((t) => this.#usable(t));
    if (index === -1) return 'ineligible';
    if (this.#dials.size === 0) return 'no_dial';
    const result = this.#session && this.#session.sourceContext !== sourceContext ? 'switched' : 'started';
    this.#session = { ...list[index], sourceContext, targets: list, targetIndex: index };
    this.#armTimer();
    this.#emit({ session: this.#session, reason: result });
    return result;
  }

  /**
   * Jumps to the next usable selected value, wrapping around (feature 004, FR-010).
   * @returns {boolean} false when idle, in the classic mode, or without another usable entry
   */
  nextTarget() {
    const index = this.#nextUsableIndex();
    if (index === -1) return false;
    this.#moveTo(index);
    return true;
  }

  /** The current selected value can no longer be edited: move on, or end edit mode (FR-015). */
  targetUnusable(entityId, attributeId) {
    const session = this.#session;
    if (!session || session.targets.length === 0) return;
    const current = session.targets[session.targetIndex];
    if (current.entityId !== entityId || (attributeId !== undefined && current.attributeId !== attributeId)) return;
    const index = this.#nextUsableIndex();
    if (index === -1) this.end('unavailable');
    else this.#moveTo(index);
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
    if (this.#session?.targets.length) this.targetUnusable(entityId);
    else if (this.#session?.entityId === entityId) this.end('unavailable');
  }

  /** @param {(event: { session: EditSession | null, reason: string }) => void} fn */
  onChange(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #usable(target) {
    return targetUsable(target, this.#getEntity(target.entityId));
  }

  /** Index of the next usable target after the current one (excluding it), or -1. */
  #nextUsableIndex() {
    const session = this.#session;
    if (!session || session.targets.length < 2) return -1;
    const { targets, targetIndex } = session;
    for (let step = 1; step < targets.length; step++) {
      const index = (targetIndex + step) % targets.length;
      if (this.#usable(targets[index])) return index;
    }
    return -1;
  }

  #moveTo(index) {
    const session = this.#session;
    this.#session = { ...session, ...session.targets[index], targetIndex: index };
    this.#armTimer();
    this.#emit({ session: this.#session, reason: 'switched_target' });
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
