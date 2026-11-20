// In-memory mirror of HA entity states (data-model.md §2). Pure: no I/O, no SDK.

/**
 * @typedef {{
 *   entityId: string,
 *   domain: string,
 *   state: string,
 *   friendlyName: string,
 *   attributes: Record<string, any>,
 *   lastUpdated: string | null,
 * }} EntityState
 */

const UNAVAILABLE = new Set(['unavailable', 'unknown']);

/**
 * @param {any} raw HA state object
 * @returns {EntityState}
 */
export function toEntityState(raw) {
  const entityId = raw.entity_id;
  const [domain, objectId] = entityId.split('.');
  const attributes = raw.attributes ?? {};
  return {
    entityId,
    domain,
    state: String(raw.state),
    friendlyName: typeof attributes.friendly_name === 'string' && attributes.friendly_name ? attributes.friendly_name : objectId,
    attributes,
    lastUpdated: raw.last_updated ?? null,
  };
}

export function isUnavailableState(entity) {
  return !entity || UNAVAILABLE.has(entity.state);
}

export class EntityStore {
  /** @type {Map<string, EntityState>} */
  #entities = new Map();
  /** @type {Map<string, Set<(entity: EntityState | null) => void>>} */
  #subscribers = new Map();
  /** @type {Set<() => void>} */
  #refreshed = new Set();

  /** Replaces all states (after get_states) and notifies every subscriber. */
  load(rawStates) {
    this.#entities.clear();
    for (const raw of rawStates ?? []) {
      if (raw && typeof raw.entity_id === 'string') this.#entities.set(raw.entity_id, toEntityState(raw));
    }
    for (const fn of this.#refreshed) fn();
    for (const [entityId, fns] of this.#subscribers) {
      const entity = this.get(entityId);
      for (const fn of fns) fn(entity);
    }
  }

  /**
   * @param {string} entityId
   * @param {any | null} rawNewState null when the entity was removed
   */
  applyStateChanged(entityId, rawNewState) {
    if (rawNewState) this.#entities.set(entityId, toEntityState(rawNewState));
    else this.#entities.delete(entityId);
    const entity = this.get(entityId);
    for (const fn of this.#subscribers.get(entityId) ?? []) fn(entity);
  }

  /** @returns {EntityState | null} */
  get(entityId) {
    return this.#entities.get(entityId) ?? null;
  }

  /** @returns {EntityState[]} */
  all() {
    return [...this.#entities.values()];
  }

  isUnavailable(entityId) {
    return isUnavailableState(this.get(entityId));
  }

  /**
   * @param {string} entityId
   * @param {(entity: EntityState | null) => void} fn
   * @returns {() => void} unsubscribe
   */
  subscribe(entityId, fn) {
    let set = this.#subscribers.get(entityId);
    if (!set) {
      set = new Set();
      this.#subscribers.set(entityId, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.#subscribers.delete(entityId);
    };
  }

  /** @returns {() => void} unsubscribe */
  onRefreshed(fn) {
    this.#refreshed.add(fn);
    return () => this.#refreshed.delete(fn);
  }
}
