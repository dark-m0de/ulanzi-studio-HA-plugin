// Loads Home Assistant icon definitions into IconData after each (re)connect (feature 003,
// research R-09, contracts/ha-icon-messages.md). Failures keep the built-in icons and are made
// visible via IconData.available (shown in the PI) and one warning per connection.

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const describe = (err) => `${err?.key ?? 'error'}${err?.haCode ? `: ${err.haCode}` : ''}`;

/**
 * @param {{
 *   client: { getIcons: Function, listEntityRegistryDisplay: Function },
 *   iconData: import('../domain/icons/icon-data.js').IconData,
 *   logger: { debug: Function, warn: Function },
 * }} deps
 */
export function createIconLoader({ client, iconData, logger }) {
  let generation = 0;
  /** @type {Promise<void>} */
  let registryReady = Promise.resolve();

  const current = (gen) => gen === generation;

  async function requestPlatforms(platforms, gen) {
    try {
      const result = await client.getIcons('entity', platforms);
      if (!current(gen)) return;
      const resources = isObject(result?.resources) ? result.resources : {};
      for (const platform of platforms) iconData.setPlatform(platform, resources[platform]);
    } catch (err) {
      if (current(gen)) logger.debug(`HA platform icons unavailable (${describe(err)})`);
    }
  }

  return {
    /** Called after the states were loaded on a new connection. */
    load() {
      const gen = ++generation;
      const components = client.getIcons('entity_component').then(
        (result) => {
          if (current(gen)) iconData.setComponents(isObject(result?.resources) ? result.resources : {});
        },
        (err) => {
          if (!current(gen)) return;
          iconData.setUnavailable();
          logger.warn(`HA icons unavailable (${describe(err)}); using built-in icons`);
        },
      );
      registryReady = client.listEntityRegistryDisplay().then(
        (result) => {
          if (current(gen)) iconData.setRegistry(result?.entities);
        },
        (err) => {
          if (current(gen)) logger.debug(`HA entity registry for icons unavailable (${describe(err)})`);
        },
      );
      return Promise.all([components, registryReady]).then(() => undefined);
    },

    /**
     * Requests the integration icons for the platforms of these entities (FR-003), once per
     * platform and connection. Waits for the registry of the current connection first.
     * @param {string[]} entityIds
     */
    async ensurePlatformsFor(entityIds) {
      const gen = generation;
      await registryReady;
      if (!current(gen)) return;
      const platforms = iconData.missingPlatforms(entityIds);
      if (!platforms.length) return;
      iconData.markRequested(platforms);
      await requestPlatforms(platforms, gen);
    },

    /** Connection lost: drop in-flight results, keep the data. */
    clear() {
      generation++;
      registryReady = Promise.resolve();
      iconData.clear();
    },
  };
}
