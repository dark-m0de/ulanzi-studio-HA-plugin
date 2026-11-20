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

/**
 * @param {KeyRender} model
 * @returns {string} SVG markup
 */
export function keySvg(model) {
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
