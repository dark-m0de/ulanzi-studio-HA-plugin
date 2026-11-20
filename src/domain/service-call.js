// Validates user-configured service calls (long-press "service" option, HA Service Call key).

const NAME = /^[a-z_][a-z0-9_]*$/;
const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;

/** @returns {string[] | null} */
function parseTarget(value) {
  if (value === undefined || value === null || value === '') return null;
  const list = Array.isArray(value) ? value : String(value).split(',');
  const ids = list.map((v) => String(v).trim()).filter(Boolean);
  if (!ids.length) return null;
  if (!ids.every((id) => ENTITY_ID.test(id))) throw new Error('invalid target');
  return ids;
}

function parseData(value) {
  if (value === undefined || value === null || value === '') return {};
  const data = typeof value === 'string' ? JSON.parse(value) : value;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('data must be an object');
  return data;
}

/**
 * Accepts a ServiceCall object `{ domain, service, target?, data? }` (target may also be a
 * comma-separated string or array of entity ids; data may be a JSON string).
 * @returns {import('../ha/messages.js').ServiceCall | null} null when invalid
 */
export function parseServiceCall(input) {
  if (!input || typeof input !== 'object') return null;
  const domain = typeof input.domain === 'string' ? input.domain.trim() : '';
  const service = typeof input.service === 'string' ? input.service.trim() : '';
  if (!NAME.test(domain) || !NAME.test(service)) return null;
  try {
    const targetIds = parseTarget(input.target?.entity_id ?? input.target);
    const data = parseData(input.data);
    const call = { domain, service, data };
    if (targetIds) call.target = { entity_id: targetIds.length === 1 ? targetIds[0] : targetIds };
    return call;
  } catch {
    return null;
  }
}
