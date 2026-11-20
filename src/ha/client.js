// Home Assistant WebSocket client (layer 1). No SDK imports; socket factory, clock and logger
// are injected (constitution Principle II). State machine: data-model.md §1.
import { createBackoff } from './backoff.js';
import {
  normalizeBaseUrl,
  toWebSocketUrl,
  authMessage,
  getStatesMessage,
  subscribeStateChangedMessage,
  callServiceMessage,
  pingMessage,
  parseMessage,
} from './messages.js';

/** @typedef {'unconfigured' | 'connecting' | 'connected' | 'reconnecting' | 'auth_failed'} ConnectionStatus */

export const defaultClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
};

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

/** Error with a localisable message key (`error.timeout`, `error.disconnected`, `error.service`). */
export class HAError extends Error {
  constructor(key, message = key, { haCode, haMessage } = {}) {
    super(message);
    this.name = 'HAError';
    this.key = key;
    this.haCode = haCode;
    this.haMessage = haMessage;
  }
}

function terminate(socket) {
  if (!socket) return;
  try {
    if (typeof socket.terminate === 'function') socket.terminate();
    else socket.close();
  } catch {
    // socket already gone
  }
}

function isOpen(socket) {
  return socket && (socket.readyState === undefined || socket.readyState === 1);
}

export class HAClient extends EventTarget {
  /** @type {ConnectionStatus} */
  status = 'unconfigured';
  /** @type {string | null} message key of the last connection error */
  lastError = null;
  /** @type {string | null} */
  haVersion = null;
  entityCount = 0;
  /** @type {object[]} raw states from the last get_states */
  states = [];
  /** @type {string | null} */
  url = null;
  /** @type {string} */
  token = '';

  #createSocket;
  #clock;
  #logger;
  #backoff;
  #requestTimeoutMs;
  #pingIntervalMs;
  #pongTimeoutMs;
  #socket = null;
  #generation = 0;
  #nextId = 1;
  #authed = false;
  #pending = new Map();
  #reconnectTimer = null;
  #pingTimer = null;
  #pongTimer = null;
  #disposed = false;

  /**
   * @param {{
   *   createSocket: (url: string) => any,
   *   clock?: typeof defaultClock,
   *   logger?: typeof silentLogger,
   *   backoff?: ReturnType<typeof createBackoff>,
   *   requestTimeoutMs?: number,
   *   pingIntervalMs?: number,
   *   pongTimeoutMs?: number,
   * }} options
   */
  constructor({
    createSocket,
    clock = defaultClock,
    logger = silentLogger,
    backoff = createBackoff(),
    requestTimeoutMs = 10_000,
    pingIntervalMs = 30_000,
    pongTimeoutMs = 10_000,
  }) {
    super();
    this.#createSocket = createSocket;
    this.#clock = clock;
    this.#logger = logger;
    this.#backoff = backoff;
    this.#requestTimeoutMs = requestTimeoutMs;
    this.#pingIntervalMs = pingIntervalMs;
    this.#pongTimeoutMs = pongTimeoutMs;
  }

  /**
   * Sets credentials. Reconnects only if URL or token changed (or the client was unconfigured).
   * @param {unknown} url
   * @param {unknown} token
   */
  configure(url, token) {
    const normalized = normalizeBaseUrl(url);
    const tok = typeof token === 'string' ? token.trim() : '';
    if (!normalized || !tok) {
      this.#teardown();
      this.url = normalized;
      this.token = tok;
      this.lastError = normalized ? null : url ? 'error.invalidUrl' : null;
      this.#setStatus('unconfigured');
      return;
    }
    if (normalized === this.url && tok === this.token && this.status !== 'unconfigured') return;
    this.url = normalized;
    this.token = tok;
    this.lastError = null;
    this.#backoff.reset();
    this.#teardown();
    this.#connect();
  }

  /**
   * @param {import('./messages.js').ServiceCall} call
   * @returns {Promise<unknown>}
   */
  callService(call) {
    return this.#request((id) => callServiceMessage(id, call));
  }

  dispose() {
    this.#disposed = true;
    this.#teardown();
  }

  // --- internals -------------------------------------------------------------------------

  #setStatus(status) {
    if (status === this.status) return;
    this.status = status;
    this.#logger.info(`HA connection: ${status}${this.lastError ? ` (${this.lastError})` : ''}`);
    this.dispatchEvent(new CustomEvent('status', { detail: { status, error: this.lastError } }));
  }

  #connect() {
    if (this.#disposed) return;
    const generation = ++this.#generation;
    const wsUrl = toWebSocketUrl(this.url);
    this.#setStatus('connecting');
    let socket;
    try {
      socket = this.#createSocket(wsUrl);
    } catch (err) {
      this.#logger.warn(`HA socket could not be created: ${err.message}`);
      this.#handleClose(generation);
      return;
    }
    this.#socket = socket;
    socket.onmessage = (ev) => {
      if (generation === this.#generation) this.#handleMessage(parseMessage(ev.data));
    };
    socket.onclose = () => {
      if (generation === this.#generation) this.#handleClose(generation);
    };
    socket.onerror = () => {
      // close follows; the error itself carries no extra information we need
    };
  }

  #send(message) {
    if (!isOpen(this.#socket)) return false;
    this.#socket.send(JSON.stringify(message));
    return true;
  }

  #request(build) {
    if (!this.#authed || !isOpen(this.#socket)) {
      return Promise.reject(new HAError('error.disconnected'));
    }
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = this.#clock.setTimeout(() => {
        this.#pending.delete(id);
        reject(new HAError('error.timeout'));
      }, this.#requestTimeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      this.#send(build(id));
    });
  }

  #handleMessage(msg) {
    if (!msg) return;
    switch (msg.type) {
      case 'auth_required':
        this.#send(authMessage(this.token));
        break;
      case 'auth_ok':
        this.#onAuthOk(msg);
        break;
      case 'auth_invalid':
        this.#authed = false;
        this.lastError = 'error.auth';
        this.#backoff.stop();
        this.#setStatus('auth_failed');
        terminate(this.#socket);
        break;
      case 'result':
        this.#onResult(msg);
        break;
      case 'pong':
        if (this.#pongTimer !== null) {
          this.#clock.clearTimeout(this.#pongTimer);
          this.#pongTimer = null;
        }
        break;
      case 'event':
        if (msg.event?.event_type === 'state_changed') {
          const { entity_id: entityId, new_state: newState, old_state: oldState } = msg.event.data ?? {};
          this.#logger.debug(`state_changed ${entityId}`);
          this.dispatchEvent(new CustomEvent('state_changed', { detail: { entityId, newState, oldState } }));
        }
        break;
      default:
        break;
    }
  }

  #onAuthOk(msg) {
    this.#authed = true;
    this.haVersion = msg.ha_version ?? null;
    this.#backoff.reset();
    const generation = this.#generation;
    this.#request(getStatesMessage)
      .then((states) => {
        if (generation !== this.#generation) return;
        this.states = Array.isArray(states) ? states : [];
        this.entityCount = this.states.length;
        this.lastError = null;
        this.dispatchEvent(new CustomEvent('states_loaded', { detail: { states: this.states } }));
        this.#setStatus('connected');
        this.#startPing();
      })
      .catch((err) => this.#failAndReconnect(generation, `loading states failed: ${err.key ?? err.message}`));
    this.#request(subscribeStateChangedMessage).catch((err) =>
      this.#failAndReconnect(generation, `subscribing to state changes failed: ${err.key ?? err.message}`),
    );
  }

  #onResult(msg) {
    const entry = this.#pending.get(msg.id);
    if (!entry) return;
    this.#pending.delete(msg.id);
    this.#clock.clearTimeout(entry.timer);
    if (msg.success) {
      entry.resolve(msg.result);
    } else {
      const { code, message } = msg.error ?? {};
      entry.reject(new HAError('error.service', message ?? 'service error', { haCode: code, haMessage: message }));
    }
  }

  #failAndReconnect(generation, reason) {
    if (generation !== this.#generation || this.#disposed) return;
    this.#logger.warn(`HA connection: ${reason}; reconnecting`);
    terminate(this.#socket);
  }

  #startPing() {
    this.#stopPing();
    this.#pingTimer = this.#clock.setInterval(() => {
      if (this.#pongTimer !== null) return;
      this.#send(pingMessage(this.#nextId++));
      this.#pongTimer = this.#clock.setTimeout(() => {
        this.#pongTimer = null;
        this.#failAndReconnect(this.#generation, 'no pong received');
      }, this.#pongTimeoutMs);
    }, this.#pingIntervalMs);
  }

  #stopPing() {
    if (this.#pingTimer !== null) this.#clock.clearInterval(this.#pingTimer);
    if (this.#pongTimer !== null) this.#clock.clearTimeout(this.#pongTimer);
    this.#pingTimer = null;
    this.#pongTimer = null;
  }

  #rejectPending(key) {
    for (const { reject, timer } of this.#pending.values()) {
      this.#clock.clearTimeout(timer);
      reject(new HAError(key));
    }
    this.#pending.clear();
  }

  #handleClose(generation) {
    if (generation !== this.#generation) return;
    const wasAuthed = this.#authed;
    this.#socket = null;
    this.#authed = false;
    this.#stopPing();
    this.#rejectPending('error.disconnected');
    if (this.#disposed || this.status === 'auth_failed' || this.status === 'unconfigured') return;
    const delay = this.#backoff.next();
    if (delay === null) return;
    if (!wasAuthed) this.lastError = 'error.unreachable';
    this.#setStatus('reconnecting');
    this.#reconnectTimer = this.#clock.setTimeout(() => {
      this.#reconnectTimer = null;
      this.#connect();
    }, delay);
  }

  #teardown() {
    this.#generation++;
    if (this.#reconnectTimer !== null) this.#clock.clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    this.#stopPing();
    this.#rejectPending('error.disconnected');
    terminate(this.#socket);
    this.#socket = null;
    this.#authed = false;
  }
}

/**
 * One-off credential check on a temporary connection (used by the PI connection test).
 * @param {{ url: unknown, token: string, createSocket: (url: string) => any, clock?: typeof defaultClock, timeoutMs?: number }} options
 * @returns {Promise<{ ok: true, entityCount: number, haVersion: string | null } | { ok: false, error: string }>}
 */
export function testConnection({ url, token, createSocket, clock = defaultClock, timeoutMs = 10_000 }) {
  const wsUrl = toWebSocketUrl(url);
  if (!wsUrl) return Promise.resolve({ ok: false, error: 'error.invalidUrl' });
  return new Promise((resolve) => {
    let done = false;
    let socket = null;
    let haVersion = null;
    const finish = (result) => {
      if (done) return;
      done = true;
      clock.clearTimeout(timer);
      terminate(socket);
      resolve(result);
    };
    const timer = clock.setTimeout(() => finish({ ok: false, error: 'error.timeout' }), timeoutMs);
    try {
      socket = createSocket(wsUrl);
    } catch {
      finish({ ok: false, error: 'error.unreachable' });
      return;
    }
    const send = (m) => isOpen(socket) && socket.send(JSON.stringify(m));
    socket.onerror = () => {};
    socket.onclose = () => finish({ ok: false, error: 'error.unreachable' });
    socket.onmessage = (ev) => {
      const msg = parseMessage(ev.data);
      if (!msg) return;
      if (msg.type === 'auth_required') send(authMessage(token));
      else if (msg.type === 'auth_invalid') finish({ ok: false, error: 'error.auth' });
      else if (msg.type === 'auth_ok') {
        haVersion = msg.ha_version ?? null;
        send(getStatesMessage(1));
      } else if (msg.type === 'result' && msg.id === 1) {
        if (msg.success && Array.isArray(msg.result)) finish({ ok: true, entityCount: msg.result.length, haVersion });
        else finish({ ok: false, error: 'error.unreachable' });
      }
    };
  });
}
