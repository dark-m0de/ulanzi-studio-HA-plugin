// Builds KeyRender models (data-model.md §10) from entity state and key settings.
import { isUnavailableState } from '../entity-store.js';
import { getAttribute } from '../attributes/index.js';

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
 * Model for an HA Toggle key (FR-011, FR-012).
 * @param {import('../entity-store.js').EntityState | null} entity
 * @param {{ entityId?: string, label?: string, onText?: string, offText?: string }} binding
 * @param {{ t: (key: string) => string, connected: boolean }} options
 * @returns {import('./key-svg.js').KeyRender}
 */
export function toggleModel(entity, binding, { t, connected }) {
  const label = text(binding.label) || entity?.friendlyName || objectId(binding.entityId);
  if (!entity && !text(binding.entityId)) return { style: 'off', status: t('status.setup'), label: text(binding.label) };
  if (!connected) return { style: 'unavailable', status: t('status.disconnected'), label };
  if (!entity) return { style: 'unavailable', status: t('status.notFound'), label };
  if (isUnavailableState(entity)) return { style: 'unavailable', status: t('status.unavailable'), label };

  if (!isOnState(entity)) return { style: 'off', status: text(binding.offText) || t('status.off'), label };

  const model = { style: 'on', status: text(binding.onText) || t('status.on'), label };
  if (entity.domain === 'light' && brightness.isSupported(entity)) {
    const value = brightness.read(entity);
    if (value !== null) Object.assign(model, { value, unit: '%' });
  }
  return model;
}
