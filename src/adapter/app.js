// Wires the SDK ($UD) to the HA client, entity store and action instances (layer 3).
// createApp() takes all dependencies so it can run against a fake $UD in tests.
import { HAClient, defaultClock } from '../ha/client.js';
import { EntityStore } from '../domain/entity-store.js';
import { EntityControlRegistry } from '../domain/entity-control.js';
import { EditSessionBroker } from '../domain/edit-session.js';
import { createI18n } from '../domain/i18n.js';
import { createLogger, installConsoleRedaction } from './logger.js';
import { createPiBridge } from './pi-bridge.js';

export const PLUGIN_UUID = 'com.ulanzi.ulanzistudio.hadeck';

const ACTION_EVENTS = {
  keydown: 'onKeyDown',
  keyup: 'onKeyUp',
  run: 'onRun',
  dialrotate: 'onDialRotate',
  dialdown: 'onDialDown',
  dialup: 'onDialUp',
};

/** @param {string | undefined} uuid */
function actionSuffix(uuid) {
  const prefix = `${PLUGIN_UUID}.`;
  return typeof uuid === 'string' && uuid.startsWith(prefix) ? uuid.slice(prefix.length) : null;
}

/**
 * @param {{
 *   ud: any,
 *   createSocket: (url: string) => any,
 *   clock?: typeof defaultClock,
 *   locales: Record<string, Record<string, string>>,
 *   language?: string,
 *   actionTypes?: Record<string, (ctx: { context: string, settings: object, app: any }) => any>,
 *   debug?: boolean,
 *   consoleTarget?: any,
 *   setup?: (app: any) => void,
 * }} options
 */
export function createApp({ ud, createSocket, clock = defaultClock, locales, language, actionTypes = {}, debug = false, consoleTarget = console, setup }) {
  const logger = createLogger({ sink: (message, level) => ud.logMessage(message, level), debug });
  const uninstallConsole = consoleTarget ? installConsoleRedaction(logger, consoleTarget) : () => {};

  ud.connect(PLUGIN_UUID);

  const i18n = createI18n({ locales, language: language ?? ud.language });
  const store = new EntityStore();
  const client = new HAClient({ createSocket, clock, logger });
  const piBridge = createPiBridge({ ud, logger });
  // Shared per-entity dial state: one throttle per entity, optimistic values (data-model §8).
  const controls = new EntityControlRegistry({
    clock,
    send: (call) => client.callService(call),
    onError: (err, call) =>
      logger.warn(`service call ${call.domain}.${call.service} failed (${err?.key ?? 'error'}${err?.haCode ? `: ${err.haCode}` : ''})`),
  });
  // Long-press edit mode: at most one session at a time (data-model §6).
  const editSession = new EditSessionBroker({ clock });
  // Edit-mode transitions with their reason (no entity IDs) help diagnose device reports.
  editSession.onChange(({ session, reason }) => {
    logger.info(session ? `edit mode ${reason === 'switched_value' ? 'switched value' : reason}` : `edit mode ended (${reason})`);
  });
  /** @type {Map<string, { type: string, instance: any }>} */
  const registry = new Map();
  const statusListeners = new Set();
  /** Called on every key/dial input, before the event is dispatched (wakes the device display). */
  const inputListeners = new Set();

  const app = {
    ud,
    client,
    store,
    logger,
    piBridge,
    registry,
    controls,
    editSession,
    clock,
    createSocket,
    t: i18n.t,
    language: i18n.language,
    /** @type {{ haUrl?: string, haToken?: string }} */
    globalSettings: {},
    /** Applies new connection settings (from Studio or a PI save). */
    applyGlobalSettings(settings) {
      app.globalSettings = { haUrl: settings?.haUrl ?? '', haToken: settings?.haToken ?? '' };
      logger.setSecret(app.globalSettings.haToken);
      client.configure(app.globalSettings.haUrl, app.globalSettings.haToken);
    },
    /** @param {(status: string) => void} fn */
    onStatus(fn) {
      statusListeners.add(fn);
      return () => statusListeners.delete(fn);
    },
    /** @param {() => void} fn */
    onUserInput(fn) {
      inputListeners.add(fn);
      return () => inputListeners.delete(fn);
    },
    dispose() {
      for (const { instance } of registry.values()) safeCall(instance, 'dispose');
      registry.clear();
      client.dispose();
      uninstallConsole();
    },
  };

  function safeCall(instance, method, ...args) {
    const fn = instance?.[method];
    if (typeof fn !== 'function') return;
    try {
      const result = fn.apply(instance, args);
      if (result && typeof result.catch === 'function') {
        result.catch((err) => logger.error(`action ${method} failed: ${err?.stack ?? err}`));
      }
    } catch (err) {
      logger.error(`action ${method} failed: ${err?.stack ?? err}`);
    }
  }

  function create(message, settings) {
    const type = actionSuffix(message.uuid);
    const factory = type ? actionTypes[type] : null;
    if (!factory) {
      logger.warn(`unknown action type: ${message.uuid}`);
      return null;
    }
    try {
      const instance = factory({ context: message.context, settings: settings ?? {}, app }) ?? {};
      registry.set(message.context, { type, instance });
      return instance;
    } catch (err) {
      logger.error(`creating action ${type} failed: ${err?.stack ?? err}`);
      return null;
    }
  }

  function updateSettings(message, settings) {
    const entry = registry.get(message.context);
    if (entry) safeCall(entry.instance, 'onSettings', settings ?? {});
    else create(message, settings);
  }

  // --- Studio events ---------------------------------------------------------------------

  ud.onConnected(() => {
    logger.info('connected to Ulanzi Studio');
    ud.getGlobalSettings();
  });
  ud.onDidReceiveGlobalSettings((message) => app.applyGlobalSettings(message?.settings ?? message?.param ?? {}));

  ud.onAdd((message) => {
    if (registry.has(message.context)) updateSettings(message, message.param);
    else create(message, message.param);
  });
  ud.onParamFromApp((message) => updateSettings(message, message.param));
  ud.onParamFromPlugin((message) => updateSettings(message, message.param));
  ud.onDidReceiveSettings((message) => updateSettings(message, message.settings ?? message.param));
  ud.onClear((message) => {
    for (const item of message?.param ?? []) {
      const entry = registry.get(item.context);
      if (entry) safeCall(entry.instance, 'dispose');
      registry.delete(item.context);
      piBridge.forget(item.context);
    }
  });
  ud.onSetActive((message) => {
    const entry = registry.get(message.context);
    if (entry) safeCall(entry.instance, 'onSetActive', Boolean(message.active));
  });

  // The SDK registration method has the same name as the instance handler (e.g. onKeyDown).
  for (const method of Object.values(ACTION_EVENTS)) {
    ud[method]((message) => {
      for (const fn of [...inputListeners]) {
        try {
          fn();
        } catch (err) {
          logger.error(`input listener failed: ${err?.stack ?? err}`);
        }
      }
      const entry = registry.get(message.context);
      if (entry) safeCall(entry.instance, method, message);
    });
  }

  ud.onSendToPlugin((message) => piBridge.handle(message));

  // --- HA client events ------------------------------------------------------------------

  client.addEventListener('states_loaded', (e) => store.load(e.detail.states));
  client.addEventListener('state_changed', (e) => store.applyStateChanged(e.detail.entityId, e.detail.newState));
  // One toast per authentication failure (FR-005); re-armed once the connection works again
  // or new credentials are tried.
  let authToastShown = false;
  client.addEventListener('status', (e) => {
    const { status } = e.detail;
    // Nothing queued while offline is replayed after reconnect (edge case in spec).
    if (status !== 'connected') {
      controls.cancelPending();
      editSession.connectionLost();
    }
    if (status === 'auth_failed' && !authToastShown) {
      authToastShown = true;
      ud.toast(i18n.t('error.auth'));
    } else if (status === 'connecting' || status === 'connected') {
      authToastShown = false;
    }
    for (const fn of statusListeners) {
      try {
        fn(status);
      } catch (err) {
        logger.error(`status listener failed: ${err?.stack ?? err}`);
      }
    }
    for (const { instance } of registry.values()) safeCall(instance, 'onConnectionStatus', status);
  });

  setup?.(app);
  logger.info('HA Deck main service started');
  return app;
}
