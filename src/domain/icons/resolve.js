// Icon resolution for keys (feature 003, data-model §2/§4, research R-04). Mirrors the order of
// the Home Assistant frontend (src/data/icons.ts). Pure: no I/O, no logging.
import { iconPath, normaliseIconName } from './mdi-set.js';
import { fallbackIcon } from './fallback-icons.js';

/**
 * @typedef {{
 *   default?: string,
 *   state?: Record<string, string>,
 *   range?: Record<string, string>,
 * }} IconDefinition
 */

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Highest range threshold ≤ value, or null below the lowest threshold. */
function iconFromRange(value, range) {
  let best = null;
  let bestKey = -Infinity;
  for (const [key, icon] of Object.entries(range)) {
    const threshold = Number(key);
    if (!Number.isFinite(threshold) || typeof icon !== 'string') continue;
    if (threshold <= value && threshold > bestKey) {
      best = icon;
      bestKey = threshold;
    }
  }
  return best;
}

/**
 * Same rules as the frontend's getIconFromTranslations.
 * @param {string} state
 * @param {IconDefinition | null | undefined} def
 * @returns {string | null}
 */
export function iconFromDefinition(state, def) {
  if (!isObject(def)) return null;
  if (isObject(def.state) && typeof def.state[state] === 'string' && Object.hasOwn(def.state, state)) return def.state[state];
  if (isObject(def.range) && typeof state === 'string' && state.trim() !== '') {
    const value = Number(state);
    if (Number.isFinite(value)) {
      const fromRange = iconFromRange(value, def.range);
      if (fromRange) return fromRange;
    }
  }
  return typeof def.default === 'string' ? def.default : null;
}

/**
 * @typedef {{ name: string, path: string, source: 'override' | 'entity' | 'platform' | 'component' | 'fallback' }} ResolvedIcon
 */

/**
 * Icon for a key (data-model §4). The first candidate with a known path wins:
 * (1) key override → (2) attributes.icon → (3) platform icon → (4) component icon →
 * (5) built-in fallback → null (text layout).
 * @param {import('../entity-store.js').EntityState | null} entity
 * @param {Record<string, any> | null | undefined} settings key settings
 * @param {import('./icon-data.js').IconData} iconData
 * @param {{ kind: 'toggle' | 'sensor' | 'trigger' | 'service', onSkipped?: (name: string) => void }} options
 * @returns {ResolvedIcon | null}
 */
export function resolveKeyIcon(entity, settings, iconData, { kind, onSkipped } = /** @type {any} */ ({})) {
  /** @returns {ResolvedIcon | null} */
  const attempt = (name, source) => {
    if (typeof name !== 'string' || !name.trim()) return null;
    const path = iconPath(name);
    if (!path) {
      onSkipped?.(name.trim());
      return null;
    }
    return { name: normaliseIconName(name), path, source };
  };

  // "Show icon" switched off → text layout (FR-015). Service keys have no such switch (FR-017).
  if (kind !== 'service' && (settings?.showIcon === false || settings?.showIcon === 'false')) return null;

  // (1) key override
  const override = attempt(settings?.icon, 'override');
  if (override) return override;

  if (kind === 'service' || !entity) return null;
  const { domain, state } = entity;
  const deviceClass = entity.attributes?.device_class;

  // (2) custom icon set in HA (registry override or the integration's own icon)
  const fromEntity = attempt(entity.attributes?.icon, 'entity');
  if (fromEntity) return fromEntity;

  // (3) platform (integration) icon by translation key (FR-003)
  const registryEntry = iconData?.registryEntry(entity.entityId);
  if (registryEntry) {
    const def = iconData.platformDefinition(registryEntry.platform, domain, registryEntry.translationKey);
    const fromPlatform = attempt(iconFromDefinition(state, def), 'platform');
    if (fromPlatform) return fromPlatform;
  }

  // (4) component icon by device class / state / range
  const fromComponent = attempt(iconFromDefinition(state, iconData?.componentDefinition(domain, deviceClass)), 'component');
  if (fromComponent) return fromComponent;

  // (5) built-in fallback
  return attempt(fallbackIcon(domain, deviceClass, state), 'fallback');
}
