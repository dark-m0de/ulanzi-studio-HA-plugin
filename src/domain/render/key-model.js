// Builds KeyRender models (data-model.md §10) from entity state and key settings.
import { isUnavailableState } from '../entity-store.js';
import { getAttribute } from '../attributes/index.js';
import { iconColor, ensureContrast } from '../icons/icon-color.js';

const brightness = getAttribute('light.brightness');

/** @param {import('../entity-store.js').EntityState} entity */
export function isOnState(entity) {
  switch (entity.domain) {
    case 'climate':
      return entity.state !== 'off';
    case 'media_player':
      return entity.state === 'playing' || entity.state === 'on';
    case 'cover':
      return entity.state === 'open' || entity.state === 'opening';
    default:
      return entity.state === 'on';
  }
}

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '');
const objectId = (entityId) => (typeof entityId === 'string' && entityId.includes('.') ? entityId.split('.')[1] : '');

/**
 * Icon render data (feature 003, data-model §5/§6) for a resolved icon, or undefined.
 * @param {{ path: string } | null | undefined} icon resolved icon (resolveKeyIcon)
 * @param {Parameters<typeof iconColor>[0]} colorOptions
 */
function iconRender(icon, colorOptions) {
  if (!icon || typeof icon.path !== 'string') return undefined;
  return { path: icon.path, color: ensureContrast(iconColor(colorOptions)) };
}

/**
 * Model for an HA Toggle key (FR-011, FR-012; feature 003: optional icon).
 * @param {import('../entity-store.js').EntityState | null} entity
 * @param {{ entityId?: string, label?: string, onText?: string, offText?: string, onColor?: string, offColor?: string }} binding
 * @param {{ t: (key: string) => string, connected: boolean, icon?: { path: string } | null }} options
 * @returns {import('./key-svg.js').KeyRender}
 */
export function toggleModel(entity, binding, { t, connected, icon = null }) {
  const label = text(binding.label) || entity?.friendlyName || objectId(binding.entityId);
  if (!entity && !text(binding.entityId)) return { style: 'off', status: t('status.setup'), label: text(binding.label) };
  if (!connected) return { style: 'unavailable', status: t('status.disconnected'), label };
  if (!entity) return { style: 'unavailable', status: t('status.notFound'), label };
  if (isUnavailableState(entity)) return { style: 'unavailable', status: t('status.unavailable'), label };

  if (!isOnState(entity)) {
    const off = { style: 'off', status: text(binding.offText) || t('status.off'), label };
    const offIcon = iconRender(icon, { kind: 'toggle', isOn: false, entity, settings: binding });
    return offIcon ? { ...off, icon: offIcon } : off;
  }

  const model = { style: 'on', status: text(binding.onText) || t('status.on'), label };
  if (entity.domain === 'light' && brightness.isSupported(entity)) {
    const value = brightness.read(entity);
    if (value !== null) Object.assign(model, { value, unit: '%' });
  }
  const onIcon = iconRender(icon, { kind: 'toggle', isOn: true, entity, settings: binding });
  if (onIcon) model.icon = onIcon;
  return model;
}

/**
 * Model for a key in edit mode (FR-033): edit marker, live value of the edited attribute, label.
 * @param {import('../entity-store.js').EntityState | null} entity
 * @param {{ entityId?: string, label?: string }} binding
 * @param {{ t: (key: string) => string, value: number | null, unit: string, caption?: string }} options
 * @returns {import('./key-svg.js').KeyRender}
 */
export function editModel(entity, binding, { t, value, unit, caption }) {
  const label = text(binding.label) || entity?.friendlyName || objectId(binding.entityId);
  const hasValue = value !== null && value !== undefined;
  return {
    style: 'edit',
    badge: t('status.edit'),
    status: caption ?? '',
    label,
    value: hasValue ? value : t('status.off'),
    unit: hasValue ? unit : '',
  };
}

const TRIGGER_DOMAINS = new Set(['scene', 'script', 'automation']);

/** Shared error states for entity-bound keys; null when the entity is usable. */
function entityProblem(entity, binding, { t, connected }, label) {
  if (!entity && !text(binding.entityId)) return { style: 'off', status: t('status.setup'), label: text(binding.label) };
  if (!connected) return { style: 'unavailable', status: t('status.disconnected'), label };
  if (!entity) return { style: 'unavailable', status: t('status.notFound'), label };
  if (isUnavailableState(entity)) return { style: 'unavailable', status: t('status.unavailable'), label };
  return null;
}

/**
 * Model for an HA Trigger key (scene / script / automation, US6; feature 003: optional icon).
 * @param {{ t: Function, connected: boolean, confirming?: boolean, icon?: { path: string } | null }} options
 */
export function triggerModel(entity, binding, options) {
  const label = text(binding.label) || entity?.friendlyName || objectId(binding.entityId);
  const problem = entityProblem(entity, binding, options, label);
  if (problem) return problem;
  if (!TRIGGER_DOMAINS.has(entity.domain)) return { style: 'unavailable', status: options.t('status.invalid'), label };
  if (options.confirming) return { style: 'on', status: options.t('status.done'), label };
  const model = { style: 'trigger', status: options.t('status.run'), label };
  const icon = iconRender(options.icon, { kind: 'trigger', settings: binding });
  return icon ? { ...model, icon } : model;
}

const toNumber = (value) => {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Model for an HA Sensor key: value + unit, warn style outside the thresholds (US6; feature 003: optional icon).
 * @param {{ t: Function, connected: boolean, icon?: { path: string } | null }} options
 */
export function sensorModel(entity, binding, options) {
  const label = text(binding.label) || entity?.friendlyName || objectId(binding.entityId);
  const problem = entityProblem(entity, binding, options, label);
  if (problem) return problem;
  const numeric = toNumber(entity.state);
  const unit = typeof entity.attributes.unit_of_measurement === 'string' ? entity.attributes.unit_of_measurement : '';
  if (numeric === null) {
    const chars = [...entity.state];
    const value = chars.length > 8 ? `${chars.slice(0, 7).join('')}…` : entity.state;
    return withSensorIcon({ style: 'sensor', status: '', label, value, unit: '' }, options.icon, binding, false);
  }
  const above = toNumber(binding.warnAbove);
  const below = toNumber(binding.warnBelow);
  const warn = (above !== null && numeric > above) || (below !== null && numeric < below);
  const model = { style: warn ? 'warn' : 'sensor', status: '', label, value: entity.state.trim(), unit };
  return withSensorIcon(model, options.icon, binding, warn);
}

/** Adds the sensor icon (feature 003): warning colour for icon and value (FR-010). */
function withSensorIcon(model, icon, binding, warn) {
  const render = iconRender(icon, { kind: 'sensor', warn, settings: binding });
  if (!render) return model;
  return { ...model, icon: warn ? { ...render, valueColor: render.color } : render };
}

/**
 * Model for an HA Service Call key (US6).
 * @param {{ label?: string, domain?: string, service?: string }} binding
 * @param {{ t: Function, connected: boolean, valid: boolean, confirming?: boolean, icon?: { path: string } | null }} options
 */
export function serviceModel(binding, { t, connected, valid, confirming, icon = null }) {
  const name = [text(binding.domain), text(binding.service)].filter(Boolean).join('.');
  const label = text(binding.label) || name;
  if (!valid) return { style: 'unavailable', status: t('status.invalid'), label };
  if (!connected) return { style: 'unavailable', status: t('status.disconnected'), label };
  if (confirming) return { style: 'on', status: t('status.done'), label };
  const model = { style: 'trigger', status: t('status.run'), label };
  const render = iconRender(icon, { kind: 'service', settings: binding });
  return render ? { ...model, icon: render } : model;
}
