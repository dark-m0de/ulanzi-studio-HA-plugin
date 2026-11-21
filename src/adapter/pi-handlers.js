// Registers the Property Inspector request handlers (contracts/pi-messages.md) on the bridge.
import { testConnection } from '../ha/client.js';
import { normalizeBaseUrl } from '../ha/messages.js';
import { PiError } from './pi-bridge.js';
import { supportedAttributes, editAttributeFor } from '../domain/attributes/index.js';
import { supportedPressActions } from '../domain/dial-press.js';
import { resolveKeyIcon } from '../domain/icons/resolve.js';

const tokenOrNull = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** @param {any} app */
export function registerPiHandlers(app) {
  const { piBridge, client } = app;

  // The token is never part of any reply (Principle V).
  const statusPayload = () => ({
    status: client.status,
    hasToken: Boolean(app.globalSettings.haToken),
    haUrl: app.globalSettings.haUrl ?? '',
    // Feature 003: false makes the degraded icon mode visible in the PI (Principle IV).
    iconsAvailable: app.iconData.available,
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

  piBridge.register('entities.list', ({ domains, query, limit, controllable } = {}) => {
    if (client.status !== 'connected') return { entities: [] };
    const domainSet = Array.isArray(domains) && domains.length ? new Set(domains) : null;
    const q = typeof query === 'string' && query.trim() ? query.trim().toLowerCase() : null;
    const max = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 50;
    const entities = app.store
      .all()
      .filter((e) => !domainSet || domainSet.has(e.domain))
      .filter((e) => !q || e.entityId.toLowerCase().includes(q) || e.friendlyName.toLowerCase().includes(q))
      // Feature 004: only entities the dial can control (selected-values search).
      .filter((e) => controllable !== true || supportedAttributes(e).length > 0)
      .sort((a, b) => a.friendlyName.localeCompare(b.friendlyName) || a.entityId.localeCompare(b.entityId))
      .slice(0, max)
      .map(({ entityId, friendlyName, domain, state }) => ({ entityId, friendlyName, domain, state }));
    return { entities };
  });

  piBridge.register('entity.capabilities', ({ entityId } = {}) => {
    const entity = typeof entityId === 'string' ? app.store.get(entityId) : null;
    if (!entity) return { friendlyName: null, attributes: [], longPressEligible: false, pressActions: {} };
    const attributes = supportedAttributes(entity).map((a) => {
      const { min, max } = a.bounds(entity);
      const { fine, coarse } = a.defaultSteps(entity);
      return { id: a.id, unit: a.unit(entity), min, max, defaultFine: fine, defaultCoarse: coarse };
    });
    const pressActions = Object.fromEntries(
      attributes.map((a) => [a.id, supportedPressActions(entity, { kind: 'fixed', attributeId: a.id })]),
    );
    // friendlyName: names in the selected-values list of the Toggle PI (feature 004).
    return { friendlyName: entity.friendlyName, attributes, longPressEligible: editAttributeFor(entity) !== null, pressActions };
  });

  // Feature 003: icon preview for the icon field (contracts/key-icon-settings.md §3).
  piBridge.register('icon.preview', ({ name, entityId } = {}) => {
    const notFound = { found: false, name: null, path: null, source: null };
    let icon = null;
    if (typeof name === 'string' && name.trim()) {
      icon = resolveKeyIcon(null, { icon: name }, app.iconData, { kind: 'service' });
    } else if (typeof entityId === 'string' && client.status === 'connected') {
      const entity = app.store.get(entityId.trim());
      icon = entity ? resolveKeyIcon(entity, {}, app.iconData, { kind: 'toggle' }) : null;
    }
    return icon ? { found: true, name: icon.name, path: icon.path, source: icon.source } : notFound;
  });

  app.onStatus(() => piBridge.push('connection.changed', statusPayload()));
  let lastIconsAvailable = app.iconData.available;
  app.iconData.subscribe(() => {
    if (app.iconData.available === lastIconsAvailable) return;
    lastIconsAvailable = app.iconData.available;
    piBridge.push('connection.changed', statusPayload());
  });
}
