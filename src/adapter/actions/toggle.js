// HA Toggle key: short press toggles (US2); long press starts edit mode for the Dynamic Dial
// or runs the configured alternative (US4, FR-031–FR-037). Feature 004: the long-press mode
// "edit_values" edits the selected values configured on the key instead of its own entity.
import { ActionBase } from './action-base.js';
import { createPressDetector } from '../../domain/long-press.js';
import { pressActionFor } from '../../domain/press-actions.js';
import { parseServiceCall } from '../../domain/service-call.js';
import { isUnavailableState } from '../../domain/entity-store.js';
import { parseSelectedValues } from '../../domain/selected-values.js';
import { getAttribute, supportedAttributes } from '../../domain/attributes/index.js';
import { toggleModel, editModel } from '../../domain/render/key-model.js';
import { renderKeySvg } from '../../domain/render/key-svg.js';

const describe = (call, err) => `${call.domain}.${call.service} failed (${err?.key ?? 'error'}${err?.haCode ? `: ${err.haCode}` : ''})`;

export class ToggleAction extends ActionBase {
  #lastIcon = null;
  #unsubscribeSession = null;
  #unsubscribeControl = null;
  #unsubscribeEditEntity = null;

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

  /** The session's edited entity ID while this key is the edit source (feature 004: may differ from the key's). */
  get editEntityId() {
    return this.isEditSource ? this.app.editSession.session.entityId : this.entityId;
  }

  get editEntity() {
    return this.editEntityId ? this.app.store.get(this.editEntityId) : null;
  }

  /** True while this key edits its selected values (feature 004). */
  get editsSelectedValues() {
    return this.isEditSource && this.app.editSession.session.targets.length > 0;
  }

  onSettings(settings) {
    this.detector.setThreshold(settings?.longPressMs);
    // Ulanzi Studio re-sends unchanged settings when a key is selected or pressed while it is open.
    // Only a new entity binding invalidates the running edit session.
    // Feature 004: the long-press mode and the selected values are part of the binding (FR-016).
    const nextEntityId = typeof settings?.entityId === 'string' ? settings.entityId.trim() : '';
    const changed =
      nextEntityId !== this.entityId ||
      (settings?.longPress ?? '') !== (this.settings.longPress ?? '') ||
      JSON.stringify(parseSelectedValues(settings?.editValues)) !== JSON.stringify(parseSelectedValues(this.settings.editValues));
    if (this.isEditSource && changed) this.app.editSession.end('settings');
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
      case 'edit_values':
        return this.#startTargets();
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

  /** Feature 004: edit mode for the selected values; never falls back to toggling (FR-008). */
  #startTargets() {
    if (!this.connected) {
      this.app.ud.showAlert(this.context);
      return undefined;
    }
    const targets = parseSelectedValues(this.settings.editValues);
    const result = this.app.editSession.startTargets({ sourceContext: this.context, targets });
    if (result === 'ineligible') this.app.ud.showAlert(this.context);
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
    this.#unsubscribeEditEntity?.();
    this.#unsubscribeEditEntity = null;
    if (this.isEditSource) {
      const id = this.editEntityId;
      this.#unsubscribeControl = this.app.controls.get(id).subscribe((event) => {
        if (event.type === 'change') this.render();
      });
      // A selected value of another entity: follow its HA state for the live value (feature 004).
      if (id !== this.entityId) this.#unsubscribeEditEntity = this.app.store.subscribe(id, () => this.render());
    }
    this.render();
  }

  #editValue() {
    const { attributeId, targets } = this.app.editSession.session;
    const attribute = getAttribute(attributeId);
    const entity = this.editEntity;
    const optimistic = this.app.controls.get(this.editEntityId).getOptimistic(attributeId);
    const value = optimistic ? optimistic.value : entity && attribute ? attribute.read(entity) : null;
    // Name of the edited value when the entity has more than one (feature 002, FR-021) or when
    // several selected values exist (feature 004, FR-012).
    const named = targets.length >= 2 || (entity && supportedAttributes(entity).length >= 2);
    const caption = named ? this.app.t(`attr.short.${attributeId}`) : undefined;
    return { value, unit: entity && attribute ? attribute.unit(entity) : '', caption };
  }

  render({ force = false } = {}) {
    // Selected values show the edited entity's name instead of the key label (feature 004).
    const binding = this.editsSelectedValues ? { label: '', entityId: this.editEntityId } : this.settings;
    const model = this.isEditSource
      ? editModel(this.editEntity, binding, { t: this.app.t, ...this.#editValue() })
      : toggleModel(this.entity, this.settings, { t: this.app.t, connected: this.connected, icon: this.resolveIcon('toggle') });
    const icon = renderKeySvg(model);
    if (!force && icon === this.#lastIcon) return;
    this.#lastIcon = icon;
    this.app.ud.setBaseDataIcon(this.context, icon, '');
  }

  dispose() {
    this.detector.dispose();
    this.#unsubscribeSession?.();
    this.#unsubscribeControl?.();
    this.#unsubscribeEditEntity?.();
    this.app.editSession.sourceCleared(this.context);
    super.dispose();
  }
}

export const createToggle = (ctx) => new ToggleAction(ctx);
