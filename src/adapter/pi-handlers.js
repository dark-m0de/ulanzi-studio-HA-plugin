// Registers the Property Inspector request handlers (contracts/pi-messages.md) on the bridge.
import { testConnection } from '../ha/client.js';
import { normalizeBaseUrl } from '../ha/messages.js';
import { PiError } from './pi-bridge.js';
import { supportedAttributes, editAttributeFor } from '../domain/attributes/index.js';

const tokenOrNull = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** @param {any} app */
export function registerPiHandlers(app) {
  const { piBridge, client } = app;

  // The token is never part of any reply (Principle V).
  const statusPayload = () => ({
    status: client.status,
    hasToken: Boolean(app.globalSettings.haToken),
    haUrl: app.globalSettings.haUrl ?? '',
  });

  piBridge.register('connection.status', () => statusPayload());

  piBridge.register('connection.test', async ({ haUrl, haToken }) => {
    const token = tokenOrNull(haToken) ?? tokenOrNull(app.globalSettings.haToken);
    if (!normalizeBaseUrl(haUrl)) throw new PiError('error.invalidUrl');
    if (!token) throw new PiError('error.auth');
    const result = await testConnection({ url: haUrl, token, createSocket: app.createSocket, clock: app.clock });
    if (!result.ok) throw new PiError(result.error);
    return { ok: true, entityCount: result.entityCount, haVersion: result.haVersion };
  });

  piBridge.register('connection.save', ({ haUrl, haToken }) => {
    const url = normalizeBaseUrl(haUrl);
    if (!url) throw new PiError('error.invalidUrl');
    const token = tokenOrNull(haToken) ?? tokenOrNull(app.globalSettings.haToken);
    if (!token) throw new PiError('error.auth');
    const settings = { haUrl: url, haToken: token };
    app.ud.setGlobalSettings(settings);
    app.applyGlobalSettings(settings);
    return { saved: true };
  });

  piBridge.register('entities.list', ({ domains, query, limit } = {}) => {
    if (client.status !== 'connected') return { entities: [] };
    const domainSet = Array.isArray(domains) && domains.length ? new Set(domains) : null;
    const q = typeof query === 'string' && query.trim() ? query.trim().toLowerCase() : null;
    const max = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 50;
    const entities = app.store
      .all()
      .filter((e) => !domainSet || domainSet.has(e.domain))
      .filter((e) => !q || e.entityId.toLowerCase().includes(q) || e.friendlyName.toLowerCase().includes(q))
      .sort((a, b) => a.friendlyName.localeCompare(b.friendlyName) || a.entityId.localeCompare(b.entityId))
      .slice(0, max)
      .map(({ entityId, friendlyName, domain, state }) => ({ entityId, friendlyName, domain, state }));
    return { entities };
  });

  piBridge.register('entity.capabilities', ({ entityId } = {}) => {
    const entity = typeof entityId === 'string' ? app.store.get(entityId) : null;
    if (!entity) return { attributes: [], longPressEligible: false };
    const attributes = supportedAttributes(entity).map((a) => {
      const { min, max } = a.bounds(entity);
      const { fine, coarse } = a.defaultSteps(entity);
      return { id: a.id, unit: a.unit(entity), min, max, defaultFine: fine, defaultCoarse: coarse };
    });
    return { attributes, longPressEligible: editAttributeFor(entity) !== null };
  });

  app.onStatus(() => piBridge.push('connection.changed', statusPayload()));
}
