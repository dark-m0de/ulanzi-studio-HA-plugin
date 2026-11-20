// Base for simple key actions (trigger, sensor, service): icon rendering with change detection,
// service invocation with alert/log on failure and a short confirmation flash.
import { ActionBase } from './action-base.js';
import { renderKeySvg } from '../../domain/render/key-svg.js';

const CONFIRM_MS = 1000;

export class KeyAction extends ActionBase {
  #lastIcon = null;
  #confirmTimer = null;
  confirming = false;

  constructor(ctx) {
    super(ctx);
    this.render();
  }

  /** @returns {import('../../domain/render/key-svg.js').KeyRender} */
  model() {
    return { style: 'off', status: '', label: '' };
  }

  render({ force = false } = {}) {
    const icon = renderKeySvg(this.model());
    if (!force && icon === this.#lastIcon) return;
    this.#lastIcon = icon;
    this.app.ud.setBaseDataIcon(this.context, icon, '');
  }

  onSetActive(active) {
    if (active) this.render({ force: true });
  }

  /**
   * @param {import('../../ha/messages.js').ServiceCall | null} call
   * @param {string} what action name for the log
   */
  async invoke(call, what) {
    if (!call || !this.connected) {
      this.app.ud.showAlert(this.context);
      return false;
    }
    try {
      await this.app.client.callService(call);
      this.#confirm();
      return true;
    } catch (err) {
      this.app.logger.warn(`${what}: service call ${call.domain}.${call.service} failed (${err?.key ?? 'error'}${err?.haCode ? `: ${err.haCode}` : ''})`);
      this.app.ud.showAlert(this.context);
      return false;
    }
  }

  #confirm() {
    if (this.#confirmTimer !== null) this.app.clock.clearTimeout(this.#confirmTimer);
    this.confirming = true;
    this.render();
    this.#confirmTimer = this.app.clock.setTimeout(() => {
      this.#confirmTimer = null;
      this.confirming = false;
      this.render();
    }, CONFIRM_MS);
  }

  dispose() {
    if (this.#confirmTimer !== null) this.app.clock.clearTimeout(this.#confirmTimer);
    this.#confirmTimer = null;
    super.dispose();
  }
}
