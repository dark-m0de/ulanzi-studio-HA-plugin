// HA Dynamic Dial (US4): follows the entity put into edit mode by a long-pressed HA Toggle key.
// All Dynamic Dials share the session's EntityControl, so they and the source key stay in sync.
import { DialAction } from './dial.js';

export class DynamicDialAction extends DialAction {
  #unsubscribeSession = null;

  constructor(ctx) {
    // The broker must know this dial before the base class renders.
    ctx.app.editSession.registerDial(ctx.context, { timeoutS: ctx.settings?.editTimeoutS });
    super(ctx);
    this.#unsubscribeSession = this.app.editSession.onChange(() => {
      this.bindEntity();
      this.bindControl();
      this.render();
    });
  }

  get session() {
    return this.app?.editSession.session ?? null;
  }

  get entityId() {
    return this.session?.entityId ?? '';
  }

  get attributeId() {
    return this.session?.attributeId ?? '';
  }

  get label() {
    return '';
  }

  onSettings(settings) {
    this.app.editSession.updateDial(this.context, { timeoutS: settings?.editTimeoutS });
    super.onSettings(settings);
  }

  onInput() {
    this.app.editSession.input();
  }

  /** Idle dials ignore rotation and presses (FR-036). */
  onDialRotate(message) {
    if (!this.session) {
      this.render();
      return;
    }
    super.onDialRotate(message);
  }

  press() {
    if (!this.session) return undefined;
    return super.press();
  }

  buildRender() {
    if (!this.session) return { title: this.app.t('hint.longPress'), valueText: '', style: 'off', progress: null };
    return super.buildRender();
  }

  dispose() {
    this.#unsubscribeSession?.();
    super.dispose();
    this.app.editSession.unregisterDial(this.context);
  }
}

export const createDynamicDial = (ctx) => new DynamicDialAction(ctx);
