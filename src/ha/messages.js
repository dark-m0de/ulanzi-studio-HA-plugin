// Builders and parsers for the Home Assistant WebSocket API
// (contract: specs/001-ha-deck-plugin/contracts/ha-websocket.md).

/**
 * @typedef {{ domain: string, service: string, target?: { entity_id: string | string[] }, data?: object }} ServiceCall
 */

/**
 * Normalises a user-entered HA base URL. Keeps a base path (reverse proxies), strips
 * whitespace and trailing slashes.
 * @param {unknown} input
 * @returns {string | null} normalised URL or null if invalid
 */
export function normalizeBaseUrl(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return null;
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${path}`;
}

/**
 * @param {string} baseUrl
 * @returns {string | null} ws(s)://…/api/websocket
 */
export function toWebSocketUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return null;
  return `${normalized.replace(/^http/, 'ws')}/api/websocket`;
}

export const authMessage = (token) => ({ type: 'auth', access_token: token });
export const getStatesMessage = (id) => ({ id, type: 'get_states' });
export const subscribeStateChangedMessage = (id) => ({ id, type: 'subscribe_events', event_type: 'state_changed' });
export const pingMessage = (id) => ({ id, type: 'ping' });

/**
 * Icon definitions (feature 003, contracts/ha-icon-messages.md).
 * @param {number} id
 * @param {'entity_component' | 'entity'} category
 * @param {string[]} [integrations] only for category `entity`
 */
export function getIconsMessage(id, category, integrations) {
  const msg = { id, type: 'frontend/get_icons', category };
  if (Array.isArray(integrations) && integrations.length) msg.integration = integrations;
  return msg;
}

/** Lightweight entity registry (translation keys and platforms) used for icons. */
export const entityRegistryDisplayMessage = (id) => ({ id, type: 'config/entity_registry/list_for_display' });

/**
 * @param {number} id
 * @param {ServiceCall} call
 */
export function callServiceMessage(id, { domain, service, target, data }) {
  const msg = { id, type: 'call_service', domain, service };
  if (target) msg.target = target;
  msg.service_data = data ?? {};
  return msg;
}

/**
 * @param {string | Buffer | ArrayBuffer} raw
 * @returns {object | null}
 */
export function parseMessage(raw) {
  try {
    const value = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
