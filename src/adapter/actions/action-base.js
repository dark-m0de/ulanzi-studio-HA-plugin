// Shared base for action instances: settings, entity subscription, render hook, dispose.

export class ActionBase {
  #unsubscribe = null;

  /**
   * @param {{ context: string, settings?: Record<string, any>, app: any }} ctx
   */
  constructor({ context, settings, app }) {
    this.context = context;
    this.app = app;
    this.settings = settings ?? {};
    this.#bindEntity();
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
    this.#bindEntity();
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

  dispose() {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  #bindEntity() {
    this.#unsubscribe?.();
    this.#unsubscribe = this.entityId ? this.app.store.subscribe(this.entityId, () => this.onEntityChanged()) : null;
  }
}
