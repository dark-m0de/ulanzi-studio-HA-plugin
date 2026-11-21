// Shared base for action instances: settings, entity subscription, render hook, dispose.
import { resolveKeyIcon } from '../../domain/icons/resolve.js';

export class ActionBase {
  #unsubscribe = null;

  /**
   * @param {{ context: string, settings?: Record<string, any>, app: any }} ctx
   */
  constructor({ context, settings, app }) {
    this.context = context;
    this.app = app;
    this.settings = settings ?? {};
    this.bindEntity();
  }

  get entityId() {
    return typeof this.settings.entityId === 'string' ? this.settings.entityId.trim() : '';
  }

  /** @returns {import('../../domain/entity-store.js').EntityState | null} */
  get entity() {
    return this.entityId ? this.app.store.get(this.entityId) : null;
  }

  get connected() {
    return this.app.client.status === 'connected';
  }

  onSettings(settings) {
    this.settings = settings ?? {};
    this.bindEntity();
    this.render();
  }

  onConnectionStatus() {
    this.render();
  }

  onSetActive(active) {
    if (active) this.render();
  }

  onEntityChanged() {
    this.render();
  }

  /** Override: push the current state to the device. */
  render() {}

  /** Icon names already reported as unknown by this key (debug log once per name). */
  #skippedIcons = new Set();

  /**
   * Resolves the key icon (feature 003, data-model §4) and logs unknown icon names once at debug
   * level, without the entity id.
   * @param {'toggle' | 'sensor' | 'trigger' | 'service'} kind
   */
  resolveIcon(kind) {
    return resolveKeyIcon(this.entity, this.settings, this.app.iconData, {
      kind,
      onSkipped: (name) => {
        if (this.#skippedIcons.has(name)) return;
        this.#skippedIcons.add(name);
        this.app.logger.debug(`icon not found: ${name}`);
      },
    });
  }

  dispose() {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  /** (Re)subscribes to the store for the current `entityId`. */
  bindEntity() {
    this.#unsubscribe?.();
    this.#unsubscribe = this.entityId ? this.app.store.subscribe(this.entityId, () => this.onEntityChanged()) : null;
    // Feature 003: integration icons for this entity's platform, loaded lazily (FR-003).
    if (this.entityId) this.app.iconLoader?.ensurePlatformsFor([this.entityId]).catch(() => {});
  }
}
