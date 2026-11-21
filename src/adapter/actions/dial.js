// HA Dial (feature 001 US3): a dial bound to one entity attribute. Also the base of HA Dynamic
// Dial (feature 001 US4). The press action is configurable (feature 002, contracts/press-action-mapping.md).
import { ActionBase } from './action-base.js';
import { DialController } from '../../domain/dial-controller.js';
import { getAttribute, supportedAttributes } from '../../domain/attributes/index.js';
import { resolvePress, nextAttribute } from '../../domain/dial-press.js';
import { dialRender, feedbackPayload } from '../../domain/render/dial-feedback.js';

export class DialAction extends ActionBase {
  #lastFeedback = null;
  #active = true;
  #unsubscribeControl = null;
  #pressed = false;
  #rotatedWhilePressed = false;
  /** Runtime value chosen by "switch controlled value"; null = the configured attribute (feature 002). */
  #switchedAttributeId = null;
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

  /** The value this dial currently controls (configured, or switched by a press). */
  get activeAttributeId() {
    return this.#switchedAttributeId ?? this.attributeId;
  }

  /** Changes the controlled value at runtime (null = back to the configured one). */
  setActiveAttribute(attributeId) {
    this.#switchedAttributeId = attributeId && attributeId !== this.attributeId ? attributeId : null;
    this.bindControl();
    this.render();
  }

  /** Press-action registry kind (feature 002). */
  get dialKind() {
    return 'fixed';
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
    this.#switchedAttributeId = null;
    this.bindEntity();
    this.bindControl();
    this.render();
  }

  /** (Re)creates the controller for the current entity/attribute and follows its EntityControl. */
  bindControl() {
    this.#unsubscribeControl?.();
    this.#unsubscribeControl = null;
    this.controller =
      this.entityId && this.activeAttributeId
        ? new DialController({
            registry: this.app.controls,
            getEntity: () => this.entity,
            entityId: this.entityId,
            attributeId: this.activeAttributeId,
            options: this.dialOptions,
          })
        : null;
    if (this.controller) this.#unsubscribeControl = this.controller.control.subscribe((event) => this.onControlEvent(event));
  }

  onControlEvent(event) {
    if (event.type === 'error') this.app.ud.showAlert(this.context);
    else if (!event.attributeId || event.attributeId === this.activeAttributeId) this.render();
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

  press() {
    return this.handlePress();
  }

  /** Resolves the configured press action and executes its outcome (feature 002). */
  handlePress() {
    const outcome = resolvePress(this.entity, this.settings, { kind: this.dialKind, attributeId: this.activeAttributeId });
    return this.executeOutcome(outcome);
  }

  /** @param {import('../../domain/dial-press.js').PressOutcome} outcome */
  async executeOutcome(outcome) {
    switch (outcome.type) {
      case 'call': {
        if (!this.connected) {
          this.app.ud.showAlert(this.context);
          return;
        }
        this.onInput();
        const { call } = outcome;
        try {
          await this.app.client.callService(call);
        } catch (err) {
          this.app.logger.warn(`dial: service call ${call.domain}.${call.service} failed (${err?.key ?? 'error'}${err?.haCode ? `: ${err.haCode}` : ''})`);
          this.app.ud.showAlert(this.context);
        }
        return;
      }
      case 'set_value':
        if (!this.connected || !this.controller || this.controller.setValue(outcome.raw) === null) {
          this.app.ud.showAlert(this.context);
          return;
        }
        this.onInput();
        this.render();
        return;
      case 'end_edit':
        this.onEndEdit();
        return;
      case 'switch_value':
        this.onSwitchValue();
        return;
      case 'none':
        return;
      default:
        this.app.logger.warn(`dial: press action not possible (${outcome.key ?? 'error.unsupportedPress'})`);
        this.app.ud.showAlert(this.context);
    }
  }

  /** Outcome hook: end edit mode (Dynamic Dial only). */
  onEndEdit() {}

  /** Outcome hook: switch to the entity's next controllable value (feature 002 US3, FR-020/FR-025). */
  onSwitchValue() {
    const next = nextAttribute(this.entity, this.activeAttributeId);
    if (!next) {
      this.app.ud.toast(this.app.t('hint.noOtherValue'));
      return;
    }
    this.setActiveAttribute(next);
  }

  /** Short name of the controlled value, shown when the entity has more than one (FR-021). */
  get valueCaption() {
    const entity = this.entity;
    if (!entity || !this.activeAttributeId || supportedAttributes(entity).length < 2) return undefined;
    return this.app.t(`attr.short.${this.activeAttributeId}`);
  }

  buildRender() {
    return dialRender({
      entity: this.entity,
      entityId: this.entityId,
      attribute: getAttribute(this.activeAttributeId),
      value: this.controller?.displayValue() ?? null,
      label: this.label,
      t: this.app.t,
      connected: this.connected,
      caption: this.valueCaption,
    });
  }

  render() {
    // While inactive (other page, or the D200X dial display shows its idle clock) any feedback
    // would briefly replace what the display shows; the latest state is sent on re-activation.
    if (!this.#active) return;
    const payload = feedbackPayload(this.buildRender());
    const key = JSON.stringify(payload);
    if (key === this.#lastFeedback) return;
    this.#lastFeedback = key;
    this.app.ud.setFeedback(this.context, payload);
  }

  onSetActive(active) {
    this.#active = Boolean(active);
    // Studio keeps the last feedback (icon/title are persisted), so only changed content is sent.
    if (this.#active) this.render();
  }

  dispose() {
    this.#unsubscribeControl?.();
    this.#unsubscribeControl = null;
    super.dispose();
  }
}

export const createDial = (ctx) => new DialAction(ctx);
