// Per-connection store of Home Assistant icon definitions (feature 003, data-model §3). Pure.

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export class IconData {
  /** @type {Record<string, Record<string, any>>} */
  #components = {};
  /** @type {Map<string, Record<string, Record<string, any>> | null>} */
  #platforms = new Map();
  /** @type {Map<string, { platform: string, translationKey: string }>} */
  #registry = new Map();
  /** @type {Set<string>} */
  #requested = new Set();
  /** @type {Set<() => void>} */
  #subscribers = new Set();
  #loaded = false;
  /** @type {boolean | null} */
  #available = null;

  /** True once component icons were received on any connection. */
  get loaded() {
    return this.#loaded;
  }

  /** Result of the component request on the current connection: null (pending), true, false. */
  get available() {
    return this.#available;
  }

  /** @param {unknown} resources `result.resources` of `frontend/get_icons` (entity_component) */
  setComponents(resources) {
    if (!isObject(resources)) return;
    this.#components = resources;
    this.#loaded = true;
    this.#available = true;
    this.#notify();
  }

  setUnavailable() {
    if (this.#available === false) return;
    this.#available = false;
    this.#notify();
  }

  /** @param {unknown} entities `result.entities` of `config/entity_registry/list_for_display` */
  setRegistry(entities) {
    if (!Array.isArray(entities)) return;
    const next = new Map();
    for (const e of entities) {
      if (!isObject(e) || typeof e.ei !== 'string' || typeof e.pl !== 'string' || typeof e.tk !== 'string' || !e.tk) continue;
      next.set(e.ei, { platform: e.pl, translationKey: e.tk });
    }
    this.#registry = next;
    this.#notify();
  }

  /**
   * @param {string} platform
   * @param {unknown} defs `resources[platform]` of `frontend/get_icons` (entity), undefined = none
   */
  setPlatform(platform, defs) {
    this.#platforms.set(platform, isObject(defs) ? defs : null);
    this.#notify();
  }

  /** @returns {{ platform: string, translationKey: string } | null} */
  registryEntry(entityId) {
    return this.#registry.get(entityId) ?? null;
  }

  componentDefinition(domain, deviceClass) {
    const defs = typeof domain === 'string' && Object.hasOwn(this.#components, domain) ? this.#components[domain] : null;
    if (!isObject(defs)) return null;
    const byClass = typeof deviceClass === 'string' && Object.hasOwn(defs, deviceClass) ? defs[deviceClass] : null;
    return (isObject(byClass) && byClass) || (isObject(defs._) ? defs._ : null);
  }

  platformDefinition(platform, domain, translationKey) {
    const defs = this.#platforms.get(platform);
    const byDomain = isObject(defs) && Object.hasOwn(defs, domain) ? defs[domain] : null;
    const def = isObject(byDomain) && Object.hasOwn(byDomain, translationKey) ? byDomain[translationKey] : null;
    return isObject(def) ? def : null;
  }

  /** Platforms of the given entities that have a translation key and are neither loaded nor requested. */
  missingPlatforms(entityIds) {
    const missing = new Set();
    for (const id of entityIds ?? []) {
      const entry = this.#registry.get(id);
      if (entry && !this.#platforms.has(entry.platform) && !this.#requested.has(entry.platform)) missing.add(entry.platform);
    }
    return [...missing];
  }

  markRequested(platforms) {
    for (const p of platforms ?? []) this.#requested.add(p);
  }

  /** Connection lost: keep the data (no flicker), forget what was requested and the availability. */
  clear() {
    this.#requested.clear();
    this.#platforms = new Map([...this.#platforms].filter(([, defs]) => defs !== null));
    if (this.#available !== null) {
      this.#available = null;
      this.#notify();
    }
  }

  /** @param {() => void} fn */
  subscribe(fn) {
    this.#subscribers.add(fn);
    return () => this.#subscribers.delete(fn);
  }

  #notify() {
    for (const fn of [...this.#subscribers]) fn();
  }
}
