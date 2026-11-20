import { readFileSync } from 'node:fs';

const raw = readFileSync(new URL('./states.json', import.meta.url), 'utf8');

/** Returns a fresh deep copy of the HA state fixtures. */
export function loadStates() {
  return JSON.parse(raw);
}

/** Returns a fresh copy of one raw HA state by entity id. */
export function rawState(entityId) {
  const found = loadStates().find((s) => s.entity_id === entityId);
  if (!found) throw new Error(`No fixture for ${entityId}`);
  return found;
}
