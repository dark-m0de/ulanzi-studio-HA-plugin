// Serialises a KeyRender model to a 144×144 SVG (research R-09). Pure string generation.
import { themeFor } from './theme.js';

/**
 * @typedef {{
 *   style: 'on' | 'off' | 'unavailable' | 'edit' | 'trigger' | 'sensor' | 'warn',
 *   status?: string,
 *   label?: string,
 *   value?: string | number | null,
 *   unit?: string,
 *   badge?: string,
 *   icon?: { path: string, color: string, valueColor?: string },
 * }} KeyRender
 */

const MAX_LABEL = 12;
const MAX_STATUS = 8;

export function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function truncate(text, max) {
  const chars = [...String(text)];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('');
}

const text = (content, { y, size, weight = 'normal', fill }) =>
  `<text x="72" y="${y}" font-family="sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle" dominant-baseline="middle">${escapeXml(content)}</text>`;

// Icon layout (feature 003, data-model §5).
const ICON_BG = '#1e293b';
const ICON_FG = '#e2e8f0';
const ICON_ACCENT = '#94a3b8';

const round = (n) => Math.round(n * 10_000) / 10_000;
const iconPathElement = ({ path, color }, x, y, size) =>
  `<path d="${escapeXml(path)}" fill="${escapeXml(color)}" transform="translate(${x} ${y}) scale(${round(size / 24)})"/>`;

/** @param {KeyRender} model */
function iconKeySvg(model) {
  const { icon } = model;
  const hasValue = model.value !== undefined && model.value !== null && model.value !== '';
  const label = model.label ? truncate(model.label, MAX_LABEL) : '';
  const valueText = hasValue ? `${model.value}${model.unit ?? ''}` : '';
  const valueFill = icon.valueColor ?? ICON_FG;
  const parts = [`<rect width="144" height="144" rx="20" fill="${ICON_BG}"/>`];

  if (hasValue && label) {
    parts.push(iconPathElement(icon, 38, 6, 68));
    parts.push(text(valueText, { y: 92, size: 26, weight: 'bold', fill: valueFill }));
    parts.push(text(label, { y: 124, size: 18, fill: ICON_ACCENT }));
  } else if (hasValue) {
    parts.push(iconPathElement(icon, 38, 10, 68));
    parts.push(text(valueText, { y: 110, size: 30, weight: 'bold', fill: valueFill }));
  } else if (label) {
    parts.push(iconPathElement(icon, 30, 10, 84));
    parts.push(text(label, { y: 118, size: 20, fill: ICON_ACCENT }));
  } else {
    parts.push(iconPathElement(icon, 24, 24, 96));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" width="144" height="144">${parts.join('')}</svg>`;
}

/**
 * @param {KeyRender} model
 * @returns {string} SVG markup
 */
export function keySvg(model) {
  if (model.icon && typeof model.icon.path === 'string') return iconKeySvg(model);
  const colors = themeFor(model.style);
  const parts = [`<rect width="144" height="144" rx="20" fill="${colors.bg}"/>`];
  const hasValue = model.value !== undefined && model.value !== null && model.value !== '';
  const label = model.label ? truncate(model.label, MAX_LABEL) : '';
  const status = model.status ? truncate(model.status, MAX_STATUS) : '';

  if (model.badge) parts.push(text(truncate(model.badge, MAX_LABEL), { y: 18, size: 16, weight: 'bold', fill: colors.accent }));

  if (hasValue) {
    parts.push(text(status, { y: model.badge ? 42 : 34, size: 22, weight: 'bold', fill: colors.fg }));
    parts.push(text(`${model.value}${model.unit ?? ''}`, { y: 76, size: 36, weight: 'bold', fill: colors.fg }));
    if (label) parts.push(text(label, { y: 118, size: 18, fill: colors.accent }));
  } else if (label) {
    parts.push(text(status, { y: 56, size: 36, weight: 'bold', fill: colors.fg }));
    parts.push(text(label, { y: 108, size: 20, fill: colors.accent }));
  } else {
    parts.push(text(status, { y: 72, size: 42, weight: 'bold', fill: colors.fg }));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" width="144" height="144">${parts.join('')}</svg>`;
}

/**
 * @param {KeyRender} model
 * @returns {string} base64-encoded SVG for $UD.setBaseDataIcon
 */
export function renderKeySvg(model) {
  return Buffer.from(keySvg(model), 'utf8').toString('base64');
}
