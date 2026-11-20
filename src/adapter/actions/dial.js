// HA Dial (US3): a dial bound to one entity attribute. Also the base of HA Dynamic Dial (US4).
import { ActionBase } from './action-base.js';
import { DialController } from '../../domain/dial-controller.js';
import { getAttribute } from '../../domain/attributes/index.js';
import { pressActionFor } from '../../domain/press-actions.js';
import { dialRender, feedbackPayload } from '../../domain/render/dial-feedback.js';

export class DialAction extends ActionBase {
  #lastFeedback = null;
  #unsubscribeControl = null;
  #pressed = false;
  #rotatedWhilePressed = false;
  /** @type {DialController | null} */
  controller = null;

  constructor(ctx) {
    super(ctx);
    this.app.ud.setFeedbackLayout(this.context, '$UA1');
    this.bindControl();
    this.render();
  }

  get attributeId() {
    return typeof this.settings.attributeId === 'string' ? this.settings.attributeId : '';
  }

  get label() {
    return this.settings.label;
  }

  /** Step and off-at-minimum options for the controller. */
  get dialOptions() {
    return this.settings;
  }

  onSettings(settings) {
    this.settings = settings ?? {};
    this.bindEntity();
    this.bindControl();
    this.render();
  }

  /** (Re)creates the controller for the current entity/attribute and follows its EntityControl. */
  bindControl() {
    this.#unsubscribeControl?.();
    this.#unsubscribeControl = null;
    this.controller =
      this.entityId && this.attributeId
        ? new DialController({
            registry: this.app.controls,
            getEntity: () => this.entity,
            entityId: this.entityId,
            attributeId: this.attributeId,
            options: this.dialOptions,
          })
        : null;
    if (this.controller) this.#unsubscribeControl = this.controller.control.subscribe((event) => this.onControlEvent(event));
  }

  onControlEvent(event) {
    if (event.type === 'error') this.app.ud.showAlert(this.context);
    else if (!event.attributeId || event.attributeId === this.attributeId) this.render();
  }

  onEntityChanged() {
    this.controller?.reconcile();
    this.render();
  }

  /** Hook for every user input on this dial (used by the Dynamic Dial to extend edit mode). */
  onInput() {}

  onDialRotate(message) {
    if (this.#pressed) this.#rotatedWhilePressed = true;
    if (!this.connected) {
      this.app.ud.showAlert(this.context);
      this.render();
      return;
    }
    if (this.controller?.supported()) {
      this.controller.rotate(message?.rotateEvent);
      this.onInput();
    }
    this.render();
  }

  onDialDown() {
    this.#pressed = true;
    this.#rotatedWhilePressed = false;
  }

  onDialUp() {
    const isPress = this.#pressed && !this.#rotatedWhilePressed;
    this.#pressed = false;
    if (isPress) this.press();
  }

  /** Domain default action on a short dial press (FR-026). */
  async press() {
    const call = this.connected ? pressActionFor(this.entity) : null;
    if (!call) {
      this.app.ud.showAlert(this.context);
      return;
    }
    this.onInput();
    try {
      await this.app.client.callService(call);
    } catch (err) {
      this.app.logger.warn(`dial: service call ${call.domain}.${call.service} failed (${err?.key ?? 'error'}${err?.haCode ? `: ${err.haCode}` : ''})`);
      this.app.ud.showAlert(this.context);
    }
  }

  buildRender() {
    return dialRender({
      entity: this.entity,
      entityId: this.entityId,
      attribute: getAttribute(this.attributeId),
      value: this.controller?.displayValue() ?? null,
      label: this.label,
      t: this.app.t,
      connected: this.connected,
    });
  }

  render() {
    const payload = feedbackPayload(this.buildRender());
    const key = JSON.stringify(payload);
    if (key === this.#lastFeedback) return;
    this.#lastFeedback = key;
    this.app.ud.setFeedback(this.context, payload);
  }

  onSetActive(active) {
    if (!active) return;
    this.#lastFeedback = null;
    this.render();
  }

  dispose() {
    this.#unsubscribeControl?.();
    this.#unsubscribeControl = null;
    super.dispose();
  }
}

export const createDial = (ctx) => new DialAction(ctx);
