// HA Dynamic Dial (feature 001 US4): follows the entity put into edit mode by a long-pressed HA
// Toggle key. All Dynamic Dials share the session's EntityControl, so they and the source key stay
// in sync. Press action: end editing (default), toggle, switch value or none (feature 002).
// Feature 004: with two or more selected values on the key, a press jumps to the next value.
import { DialAction } from './dial.js';
import { targetUsable } from '../../domain/selected-values.js';

export class DynamicDialAction extends DialAction {
  #unsubscribeSession = null;
  #unsubscribeInput = null;
  /**
   * True after edit mode timed out: the idle hint is held back until the next user input.
   * The D200X may already show its idle clock then, and Studio does not report that as inactive,
   * so an immediate feedback would briefly replace the clock (device report 2026-11-21).
   * A public field on purpose: render() already runs inside the base-class constructor, before
   * private fields of this class exist.
   */
  hintDeferred = false;

  constructor(ctx) {
    // The broker must know this dial before the base class renders.
    ctx.app.editSession.registerDial(ctx.context, { timeoutS: ctx.settings?.editTimeoutS });
    super(ctx);
    this.#unsubscribeSession = this.app.editSession.onChange(({ session, reason }) => {
      this.hintDeferred = !session && reason === 'timeout';
      this.bindEntity();
      this.bindControl();
      this.render();
    });
    this.#unsubscribeInput = this.app.onUserInput(() => this.#flush());
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

  get dialKind() {
    return 'dynamic';
  }

  /** Two or more selected values: presses jump between them (feature 004, FR-010). */
  get jumpsBetweenValues() {
    return (this.session?.targets.length ?? 0) >= 2;
  }

  /** With several selected values the value name is always shown (FR-012). */
  get valueCaption() {
    if (this.jumpsBetweenValues && this.attributeId) return this.app.t(`attr.short.${this.attributeId}`);
    return super.valueCaption;
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

  /** Idle dials ignore presses (FR-013). */
  handlePress() {
    if (!this.session) return undefined;
    if (this.jumpsBetweenValues) {
      if (!this.app.editSession.nextTarget()) this.app.ud.toast(this.app.t('hint.noOtherValue'));
      return undefined;
    }
    return super.handlePress();
  }

  /** A lost selected value moves the session on, or ends it (feature 004, FR-015). */
  onEntityChanged() {
    const session = this.session;
    if (session?.targets.length && !targetUsable({ entityId: session.entityId, attributeId: session.attributeId }, this.entity)) {
      this.app.editSession.targetUnusable(session.entityId, session.attributeId);
      return;
    }
    super.onEntityChanged();
  }

  /** Switches the edited value for the whole session; all Dynamic Dials and the key follow (FR-022). */
  onSwitchValue() {
    if (!this.app.editSession.switchAttribute(this.entity)) this.app.ud.toast(this.app.t('hint.noOtherValue'));
  }

  /** "Done": ends edit mode like a short press on the edited key (FR-012). */
  onEndEdit() {
    this.app.editSession.end('dial_press');
  }

  render() {
    if (this.hintDeferred) return;
    super.render();
  }

  onSetActive(active) {
    if (active) this.hintDeferred = false;
    super.onSetActive(active);
  }

  #flush() {
    if (!this.hintDeferred) return;
    this.hintDeferred = false;
    this.render();
  }

  buildRender() {
    if (!this.session) return { title: this.app.t('hint.longPress'), valueText: '', style: 'off', progress: null };
    return super.buildRender();
  }

  dispose() {
    this.#unsubscribeSession?.();
    this.#unsubscribeInput?.();
    super.dispose();
    this.app.editSession.unregisterDial(this.context);
  }
}

export const createDynamicDial = (ctx) => new DynamicDialAction(ctx);
