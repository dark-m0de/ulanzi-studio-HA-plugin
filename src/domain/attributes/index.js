// Registry of controllable attributes (data-model.md §3, contracts/ha-websocket.md).
import { brightness, colorTemp } from './light.js';
import { volume } from './media-player.js';
import { temperature } from './climate.js';
import { position } from './cover.js';
import { percentage } from './fan.js';
import { value } from './number.js';

/**
 * @typedef {{
 *   id: string,
 *   domains: string[],
 *   isSupported: (entity: any) => boolean,
 *   read: (entity: any) => number | null,
 *   bounds: (entity: any) => { min: number, max: number },
 *   defaultSteps: (entity: any) => { fine: number, coarse: number },
 *   unit: (entity: any) => string,
 *   toServiceCall: (entity: any, raw: number, options?: { offAtMin?: boolean }) => { value: number | null, call: object },
 * }} ControllableAttribute
 */

/** @type {ControllableAttribute[]} */
export const ATTRIBUTES = [brightness, colorTemp, volume, temperature, position, percentage, value];

const byId = new Map(ATTRIBUTES.map((a) => [a.id, a]));

/** @returns {ControllableAttribute | null} */
export function getAttribute(id) {
  return byId.get(id) ?? null;
}

/** @returns {ControllableAttribute[]} attributes the entity supports, in registry order */
export function supportedAttributes(entity) {
  if (!entity) return [];
  return ATTRIBUTES.filter((a) => a.domains.includes(entity.domain) && a.isSupported(entity));
}

const EDIT_ATTRIBUTE_BY_DOMAIN = { light: 'light.brightness' };

/**
 * The attribute a long press puts into edit mode for this entity, or null if the entity is not
 * eligible (FR-031/FR-032; extended to more domains in US5).
 * @returns {ControllableAttribute | null}
 */
export function editAttributeFor(entity) {
  const attribute = entity ? getAttribute(EDIT_ATTRIBUTE_BY_DOMAIN[entity.domain]) : null;
  return attribute && attribute.isSupported(entity) ? attribute : null;
}
