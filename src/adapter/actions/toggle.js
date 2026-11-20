// HA Toggle key (US2): short press toggles, live state rendering.
// Long press falls back to toggling until edit mode (US4) is implemented.
import { ActionBase } from './action-base.js';
import { createPressDetector } from '../../domain/long-press.js';
import { pressActionFor } from '../../domain/press-actions.js';
import { toggleModel } from '../../domain/render/key-model.js';
import { renderKeySvg } from '../../domain/render/key-svg.js';

export class ToggleAction extends ActionBase {
  #lastIcon = null;

  constructor(ctx) {
    super(ctx);
    this.detector = createPressDetector({
      thresholdMs: this.settings.longPressMs,
      clock: this.app.clock,
      onShortPress: () => this.press(),
      onLongPress: () => this.longPress(),
    });
    this.render();
  }

  onSettings(settings) {
    this.detector.setThreshold(settings?.longPressMs);
    super.onSettings(settings);
  }

  onKeyDown() {
    this.detector.keyDown();
  }

  onKeyUp() {
    this.detector.keyUp();
  }

  /** Ignored: presses are derived from keydown/keyup to avoid a double toggle (research R-11). */
  onRun() {}

  onSetActive(active) {
    if (active) this.render({ force: true });
  }

  longPress() {
    return this.press();
  }

  async press() {
    const entity = this.entity;
    const call = this.connected ? pressActionFor(entity) : null;
    if (!call) {
      this.app.ud.showAlert(this.context);
      return;
    }
    try {
      await this.app.client.callService(call);
    } catch (err) {
      this.app.logger.warn(`toggle: service call ${call.domain}.${call.service} failed (${err?.key ?? 'error'}${err?.haCode ? `: ${err.haCode}` : ''})`);
      this.app.ud.showAlert(this.context);
    }
  }

  render({ force = false } = {}) {
    const model = toggleModel(this.entity, this.settings, { t: this.app.t, connected: this.connected });
    const icon = renderKeySvg(model);
    if (!force && icon === this.#lastIcon) return;
    this.#lastIcon = icon;
    this.app.ud.setBaseDataIcon(this.context, icon, '');
  }

  dispose() {
    this.detector.dispose();
    super.dispose();
  }
}

export const createToggle = (ctx) => new ToggleAction(ctx);
