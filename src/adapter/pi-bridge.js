// Property Inspector ⇄ main service message protocol (contracts/pi-messages.md).

/**
 * @param {{ ud: any, logger: any }} deps
 */
export function createPiBridge({ ud, logger }) {
  /** @type {Map<string, (payload: any, meta: { context: string }) => any>} */
  const handlers = new Map();
  /** Contexts whose PI has talked to us (open PIs receive pushes). */
  const openContexts = new Set();

  function reply(context, envelope) {
    ud.sendToPropertyInspector({ v: 1, ...envelope }, context);
  }

  return {
    /**
     * @param {string} type
     * @param {(payload: any, meta: { context: string }) => any} handler returns the reply payload; throw an error with `.key` for error replies
     */
    register(type, handler) {
      handlers.set(type, handler);
    },

    /** Handles an `onSendToPlugin` message. */
    async handle(message) {
      const context = message?.context;
      const env = message?.payload;
      if (!context || !env || env.v !== 1 || typeof env.type !== 'string') return;
      openContexts.add(context);
      const handler = handlers.get(env.type);
      if (!handler) return;
      try {
        const payload = await handler(env.payload ?? {}, { context });
        reply(context, { type: env.type, id: env.id, payload: payload ?? {} });
      } catch (err) {
        if (!err?.key) logger.error(`PI request ${env.type} failed: ${err?.stack ?? err}`);
        reply(context, { type: env.type, id: env.id, error: { key: err?.key ?? 'error.internal' } });
      }
    },

    /** Sends an unsolicited message to every open PI. */
    push(type, payload) {
      for (const context of openContexts) ud.sendToPropertyInspector({ v: 1, type, payload }, context);
    },

    forget(context) {
      openContexts.delete(context);
    },
  };
}

/** Error with a message key, returned to the PI as `error.key`. */
export class PiError extends Error {
  constructor(key) {
    super(key);
    this.key = key;
  }
}
