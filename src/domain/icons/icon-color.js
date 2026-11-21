// Icon colour per key kind and state (feature 003, data-model §6, research R-07). Pure.

export const ICON_BG = '#1e293b';
export const COLORS = Object.freeze({
  on: '#f59e0b',
  off: '#94a3b8',
  trigger: '#a78bfa',
  sensor: '#5eead4',
  warn: '#fb923c',
});
const MIN_CONTRAST = 3;

/** @returns {string | null} `#rrggbb` (lower case) or null */
export function parseHexColor(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(trimmed) ? trimmed : null;
}

const hex = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
const toHex = ([r, g, b]) => `#${hex(r)}${hex(g)}${hex(b)}`;
const toRgb = (color) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));

function rgbColorOf(entity) {
  const rgb = entity?.attributes?.rgb_color;
  if (!Array.isArray(rgb) || rgb.length !== 3 || !rgb.every((n) => Number.isFinite(n))) return null;
  return toHex(rgb);
}

/**
 * @param {{
 *   kind: 'toggle' | 'trigger' | 'service' | 'sensor',
 *   isOn?: boolean,
 *   warn?: boolean,
 *   entity?: { domain?: string, attributes?: Record<string, any> } | null,
 *   settings?: { onColor?: unknown, offColor?: unknown } | null,
 * }} options
 * @returns {string} `#rrggbb` before contrast adjustment
 */
export function iconColor({ kind, isOn = true, warn = false, entity = null, settings = null }) {
  const onColor = parseHexColor(settings?.onColor);
  switch (kind) {
    case 'toggle':
      if (!isOn) return parseHexColor(settings?.offColor) ?? COLORS.off;
      return onColor ?? (entity?.domain === 'light' ? rgbColorOf(entity) : null) ?? COLORS.on;
    case 'sensor':
      return warn ? COLORS.warn : onColor ?? COLORS.sensor;
    default:
      return onColor ?? COLORS.trigger;
  }
}

function luminance(color) {
  const [r, g, b] = toRgb(color).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two `#rrggbb` colours. */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Mixes the colour towards white in 10 % steps until it reaches the minimum contrast (FR-009).
 * @param {string} color `#rrggbb`
 */
export function ensureContrast(color, background = ICON_BG, min = MIN_CONTRAST) {
  const base = parseHexColor(color) ?? COLORS.off;
  let out = base;
  const rgb = toRgb(base);
  for (let step = 1; step <= 10 && contrastRatio(out, background) < min; step++) {
    out = toHex(rgb.map((c) => c + (255 - c) * (step / 10)));
  }
  return out;
}
