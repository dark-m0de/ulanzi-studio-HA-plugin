// Dial display models and the $UA1 setFeedback payload (research R-10, data-model.md §10).
import { isUnavailableState } from '../entity-store.js';
import { themeFor } from './theme.js';
import { escapeXml, truncate } from './key-svg.js';

/** @typedef {{ title: string, valueText: string, style: string, progress: number | null }} DialRender */

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '');
const objectId = (entityId) => (typeof entityId === 'string' && entityId.includes('.') ? entityId.split('.')[1] : '');

export function formatValue(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

/**
 * @param {{
 *   entity: import('../entity-store.js').EntityState | null,
 *   entityId?: string,
 *   attribute: import('../attributes/index.js').ControllableAttribute | null,
 *   value: number | null,
 *   label?: string,
 *   t: (key: string) => string,
 *   connected: boolean,
 * }} params
 * @returns {DialRender}
 */
export function dialRender({ entity, entityId, attribute, value, label, t, connected }) {
  const id = entity?.entityId ?? entityId ?? '';
  const title = text(label) || entity?.friendlyName || objectId(id);
  const problem = (key) => ({ title, valueText: t(key), style: 'unavailable', progress: null });

  if (!entity && !text(id)) return { title: t('status.setup'), valueText: '', style: 'off', progress: null };
  if (!connected) return problem('status.disconnected');
  if (!entity) return problem('status.notFound');
  if (isUnavailableState(entity)) return problem('status.unavailable');
  if (!attribute || !attribute.domains.includes(entity.domain) || !attribute.isSupported(entity)) return problem('status.unsupported');
  if (value === null || value === undefined) return { title, valueText: t('status.off'), style: 'off', progress: 0 };

  const { min, max } = attribute.bounds(entity);
  const progress = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  return { title, valueText: `${formatValue(value)}${attribute.unit(entity)}`, style: 'on', progress };
}

const CX = 50;
const CY = 54;
const R = 38;
const START = 135;
const SWEEP = 270;

const point = (deg) => {
  const rad = (deg * Math.PI) / 180;
  return `${(CX + R * Math.cos(rad)).toFixed(2)} ${(CY + R * Math.sin(rad)).toFixed(2)}`;
};

const arc = (fromDeg, sweepDeg) => `M ${point(fromDeg)} A ${R} ${R} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${point(fromDeg + sweepDeg)}`;

/** @param {DialRender} render @returns {string} 100×100 SVG */
export function dialSvg(render) {
  const colors = themeFor(render.style);
  const parts = [
    `<rect width="100" height="100" rx="14" fill="${colors.bg}"/>`,
    `<path d="${arc(START, SWEEP)}" fill="none" stroke="${colors.accent}" stroke-opacity="0.35" stroke-width="8" stroke-linecap="round"/>`,
  ];
  if (typeof render.progress === 'number' && render.progress > 0) {
    parts.push(
      `<path class="progress" d="${arc(START, Math.min(SWEEP - 0.01, SWEEP * render.progress))}" fill="none" stroke="${colors.fg}" stroke-width="8" stroke-linecap="round"/>`,
    );
  }
  if (render.valueText) {
    parts.push(
      `<text x="50" y="56" font-family="sans-serif" font-size="22" font-weight="bold" fill="${colors.fg}" text-anchor="middle" dominant-baseline="middle">${escapeXml(truncate(render.valueText, 9))}</text>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${parts.join('')}</svg>`;
}

/** @param {DialRender} render @returns {{ title: { text: string }, icon: { value: string } }} */
export function feedbackPayload(render) {
  return {
    title: { text: render.title },
    icon: { value: `data:image/svg+xml;base64,${Buffer.from(dialSvg(render), 'utf8').toString('base64')}` },
  };
}
