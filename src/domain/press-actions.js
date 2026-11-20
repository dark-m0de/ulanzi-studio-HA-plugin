// Domain-dependent press action (contracts/ha-websocket.md "Press actions", FR-010, FR-026).
import { call } from './attributes/common.js';

const TOGGLE_DOMAINS = new Set(['light', 'switch', 'fan', 'input_boolean', 'cover']);

/**
 * @param {import('./entity-store.js').EntityState | null} entity
 * @returns {import('../ha/messages.js').ServiceCall | null}
 */
export function pressActionFor(entity) {
  if (!entity) return null;
  const { domain } = entity;
  if (TOGGLE_DOMAINS.has(domain)) return call(entity, domain, 'toggle');
  switch (domain) {
    case 'media_player':
      return call(entity, 'media_player', 'media_play_pause');
    case 'climate':
      return call(entity, 'climate', entity.state === 'off' ? 'turn_on' : 'turn_off');
    case 'scene':
    case 'script':
      return call(entity, domain, 'turn_on');
    case 'automation':
      return call(entity, 'automation', 'trigger');
    default:
      return null;
  }
}
