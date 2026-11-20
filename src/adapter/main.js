// Production entry point (bundled to plugin/…/dist/app.js). Ulanzi Studio starts it as
// `node dist/app.js <address> <port> <language>`; the SDK reads those arguments in connect().
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import UlanziApi from 'ulanzideck-api';
import WebSocket from 'ws';
import { createApp } from './app.js';
import { ACTION_TYPES } from './actions/index.js';
import { registerPiHandlers } from './pi-handlers.js';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadLocalization(file) {
  try {
    return JSON.parse(readFileSync(join(pluginRoot, file), 'utf8')).Localization ?? {};
  } catch {
    return {};
  }
}

const app = createApp({
  ud: new UlanziApi(),
  createSocket: (url) => new WebSocket(url),
  locales: { en: loadLocalization('en.json'), de_DE: loadLocalization('de_DE.json') },
  actionTypes: ACTION_TYPES,
  debug: process.env.HADECK_DEBUG === '1',
  setup: registerPiHandlers,
});

// Failure isolation (Principle IV): log and keep the main service running.
process.on('uncaughtException', (err) => app.logger.error(`uncaught exception: ${err?.stack ?? err}`));
process.on('unhandledRejection', (err) => app.logger.error(`unhandled rejection: ${err?.stack ?? err}`));
