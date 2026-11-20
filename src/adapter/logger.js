// Logging with token redaction (constitution Principle V, research R-17/R-18).
import { inspect } from 'node:util';

const PATTERNS = [
  // JSON fields: "access_token":"…", "haToken":"…", "token":"…"
  [/("(?:access_token|haToken|token)"\s*:\s*")[^"]*(")/gi, '$1***$2'],
  // inspected objects: haToken: '…'
  [/((?:access_token|haToken|token)\s*:\s*')[^']*(')/gi, '$1***$2'],
  // query/form style: access_token=…
  [/((?:access_token|haToken)=)[^&\s"']+/gi, '$1***'],
  // Authorization headers
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1***'],
];

const LEVELS = ['debug', 'info', 'warn', 'error'];

/**
 * @param {{ sink: (message: string, level: string) => void, debug?: boolean }} options
 */
export function createLogger({ sink, debug = false }) {
  /** @type {Set<string>} */
  const secrets = new Set();

  function redact(text) {
    let out = String(text);
    for (const secret of secrets) out = out.split(secret).join('***');
    for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
    return out;
  }

  const format = (args) => args.map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 4, breakLength: Infinity }))).join(' ');

  const emit = (level) => (...args) => {
    if (level === 'debug' && !debug) return;
    try {
      sink(redact(format(args)), level);
    } catch {
      // logging must never break the plugin
    }
  };

  const logger = Object.fromEntries(LEVELS.map((l) => [l, emit(l)]));
  return {
    ...logger,
    redact,
    /** Registers the current token so it is replaced in every log line. */
    setSecret(value) {
      secrets.clear();
      if (typeof value === 'string' && value.length >= 4) secrets.add(value);
    },
  };
}

/**
 * Wraps console methods so every argument is redacted before printing. The SDK prints all
 * protocol traffic, including global settings with the token (research R-18).
 * @param {{ redact: (text: string) => string }} logger
 * @param {Console | Record<string, Function>} target
 * @returns {() => void} uninstall
 */
export function installConsoleRedaction(logger, target = console) {
  const methods = ['log', 'info', 'warn', 'error', 'debug'];
  const originals = {};
  for (const m of methods) {
    if (typeof target[m] !== 'function') continue;
    originals[m] = target[m];
    target[m] = (...args) => {
      const safe = args.map((a) => logger.redact(typeof a === 'string' ? a : inspect(a, { depth: 4, breakLength: Infinity })));
      originals[m].apply(target, safe);
    };
  }
  return () => {
    for (const [m, fn] of Object.entries(originals)) target[m] = fn;
  };
}
