// Material Design Icons lookup (feature 003, data-model §1, research R-01). Pure data access over
// the bundled @mdi/js set: `mdi:ceiling-light` → `mdiCeilingLight` → SVG path (24×24 grid).
import * as mdi from '@mdi/js';

const MAX_LENGTH = 64;
const NAME = /^(?:mdi|hass):([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * @param {unknown} name e.g. `mdi:Lightbulb`, `hass:lightbulb`
 * @returns {string | null} `mdi:<kebab-name>` or null when invalid
 */
export function normaliseIconName(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().toLowerCase();
  if (!trimmed || trimmed.length > MAX_LENGTH) return null;
  const match = NAME.exec(trimmed);
  return match ? `mdi:${match[1]}` : null;
}

const exportName = (kebab) => `mdi${kebab.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('')}`;

/**
 * @param {unknown} name
 * @returns {string | null} the SVG path of the icon, or null for unknown/invalid names
 */
export function iconPath(name) {
  const normalised = normaliseIconName(name);
  if (!normalised) return null;
  const key = exportName(normalised.slice(4));
  if (!Object.hasOwn(mdi, key)) return null;
  const path = mdi[key];
  return typeof path === 'string' ? path : null;
}
