// Selected values for the long-press mode "Dynamic Dial for selected values" (feature 004,
// data-model.md §1–§3): ordered pairs of entity + controllable value.
import { getAttribute } from './attributes/index.js';
import { isUnavailableState } from './entity-store.js';

/** @typedef {{ entityId: string, attributeId: string }} SelectedValue */

const toList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Normalises the `editValues` setting (a JSON string written by the PI, or an array): keeps pairs
 * with a non-empty entity ID and a known controllable value, without duplicates, in order.
 * @returns {SelectedValue[]}
 */
export function parseSelectedValues(value) {
  const result = [];
  const seen = new Set();
  for (const item of toList(value)) {
    if (!item || typeof item !== 'object') continue;
    const entityId = typeof item.entityId === 'string' ? item.entityId.trim() : '';
    const attributeId = typeof item.attributeId === 'string' ? item.attributeId : '';
    if (!entityId || !getAttribute(attributeId)) continue;
    const key = `${entityId}\n${attributeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ entityId, attributeId });
  }
  return result;
}

/** True if the entity is available and supports the selected value. */
export function targetUsable(target, entity) {
  if (!target || !entity || isUnavailableState(entity)) return false;
  const attribute = getAttribute(target.attributeId);
  return Boolean(attribute && attribute.domains.includes(entity.domain) && attribute.isSupported(entity));
}

export function sameTarget(a, b) {
  return Boolean(a && b && a.entityId === b.entityId && a.attributeId === b.attributeId);
}
