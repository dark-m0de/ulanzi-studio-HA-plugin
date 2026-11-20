// HA Toggle key: short press toggles (US2); long press starts edit mode for the Dynamic Dial
// or runs the configured alternative (US4, FR-031–FR-037).
import { ActionBase } from './action-base.js';
import { createPressDetector } from '../../domain/long-press.js';
import { pressActionFor } from '../../domain/press-actions.js';
import { parseServiceCall } from '../../domain/service-call.js';
import { isUnavailableState } from '../../domain/entity-store.js';
import { getAttribute } from '../../domain/attributes/index.js';
import { toggleModel, editModel } from '../../domain/render/key-model.js';
import { renderKeySvg } from '../../domain/render/key-svg.js';

const describe = (call, err) => `${call.domain}.${call.service} failed (${err?.key ?? 'error'}${err?.haCode ? `: ${err.haCode}` : ''})`;

export class ToggleAction extends ActionBase {
  #lastIcon = null;
  #unsubscribeSession = null;
  #unsubscribeControl = null;

  constructor(ctx) {
    super(ctx);
    this.detector = createPressDetector({
      thresholdMs: this.settings.longPressMs,
      clock: this.app.clock,
      onShortPress: () => this.press(),
      onLongPress: () => this.longPress(),
    });
    this.#unsubscribeSession = this.app.editSession.onChange(() => this.#followSession());
    this.render();
  }

  get isEditSource() {
    return this.app.editSession.isSource(this.context);
  }

  onSettings(settings) {
    this.detector.setThreshold(settings?.longPressMs);
    // The edited entity belongs to the old binding; do not keep editing it.
    if (this.isEditSource) this.app.editSession.end('settings');
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
    else this.app.editSession.pageInactive(this.context);
  }

  onEntityChanged() {
    if (this.isEditSource && isUnavailableState(this.entity)) this.app.editSession.entityUnavailable(this.entityId);
    this.render();
  }

  /** Short press: ends edit mode when this key is its source, otherwise toggles (FR-034). */
  press() {
    if (this.isEditSource) {
      this.app.editSession.end('source_press');
      return undefined;
    }
    return this.#callService(this.connected ? pressActionFor(this.entity) : null);
  }

  longPress() {
    switch (this.settings.longPress) {
      case 'disabled':
        return this.press();
      case 'entity': {
        const id = typeof this.settings.longPressEntityId === 'string' ? this.settings.longPressEntityId.trim() : '';
        return this.#callService(this.connected && id ? pressActionFor(this.app.store.get(id)) : null);
      }
      case 'service':
        return this.#callService(this.connected ? this.#configuredService() : null);
      default:
        return this.#startEdit();
    }
  }

  #startEdit() {
    if (!this.connected) {
      this.app.ud.showAlert(this.context);
      return undefined;
    }
    const result = this.app.editSession.start({ sourceContext: this.context, entity: this.entity });
    if (result === 'ineligible') return this.#callService(pressActionFor(this.entity));
    if (result === 'no_dial') this.app.ud.toast(this.app.t('hint.noDynamicDial'));
    return undefined;
  }

  #configuredService() {
    const s = this.settings;
    if (s.longPressService && typeof s.longPressService === 'object') return parseServiceCall(s.longPressService);
    return parseServiceCall({
      domain: s.longPressDomain,
      service: s.longPressServiceName,
      target: s.longPressTarget,
      data: s.longPressData,
    });
  }

  async #callService(call) {
    if (!call) {
      this.app.ud.showAlert(this.context);
      return;
    }
    try {
      await this.app.client.callService(call);
    } catch (err) {
      this.app.logger.warn(`toggle: service call ${describe(call, err)}`);
      this.app.ud.showAlert(this.context);
    }
  }

  /** Follows the edit session: live value from the shared EntityControl while this key is the source. */
  #followSession() {
    this.#unsubscribeControl?.();
    this.#unsubscribeControl = null;
    if (this.isEditSource) {
      this.#unsubscribeControl = this.app.controls.get(this.entityId).subscribe((event) => {
        if (event.type === 'change') this.render();
      });
    }
    this.render();
  }

  #editValue() {
    const { attributeId } = this.app.editSession.session;
    const attribute = getAttribute(attributeId);
    const entity = this.entity;
    const optimistic = this.app.controls.get(this.entityId).getOptimistic(attributeId);
    const value = optimistic ? optimistic.value : entity && attribute ? attribute.read(entity) : null;
    return { value, unit: entity && attribute ? attribute.unit(entity) : '' };
  }

  render({ force = false } = {}) {
    const model = this.isEditSource
      ? editModel(this.entity, this.settings, { t: this.app.t, ...this.#editValue() })
      : toggleModel(this.entity, this.settings, { t: this.app.t, connected: this.connected });
    const icon = renderKeySvg(model);
    if (!force && icon === this.#lastIcon) return;
    this.#lastIcon = icon;
    this.app.ud.setBaseDataIcon(this.context, icon, '');
  }

  dispose() {
    this.detector.dispose();
    this.#unsubscribeSession?.();
    this.#unsubscribeControl?.();
    this.app.editSession.sourceCleared(this.context);
    super.dispose();
  }
}

export const createToggle = (ctx) => new ToggleAction(ctx);
