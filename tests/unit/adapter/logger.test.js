import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, installConsoleRedaction } from '../../../src/adapter/logger.js';

function capture(opts = {}) {
  const out = [];
  const logger = createLogger({ sink: (message, level) => out.push({ message, level }), ...opts });
  return { logger, out };
}

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.secret-part.signature';

test('the configured token never appears in log output', () => {
  const { logger, out } = capture();
  logger.setSecret(TOKEN);
  logger.info(`connecting with ${TOKEN}`);
  logger.warn({ haToken: TOKEN, haUrl: 'http://ha:8123' });
  const text = out.map((o) => o.message).join('\n');
  assert.doesNotMatch(text, /secret-part/);
  assert.match(text, /\*\*\*/);
  assert.match(text, /http:\/\/ha:8123/);
});

test('access_token, haToken and Bearer values are redacted even without setSecret', () => {
  const { logger, out } = capture();
  logger.info('{"type":"auth","access_token":"abc.def.ghi"}');
  logger.info('settings {"haUrl":"x","haToken":"zzz-123"}');
  logger.info('Authorization: Bearer qwe.rty-uio');
  logger.info('access_token=plain123&x=1');
  const text = out.map((o) => o.message).join('\n');
  for (const secret of ['abc.def.ghi', 'zzz-123', 'qwe.rty-uio', 'plain123']) {
    assert.doesNotMatch(text, new RegExp(secret.replace(/\./g, '\\.')), secret);
  }
});

test('debug messages are suppressed unless debug is enabled', () => {
  const { logger, out } = capture();
  logger.debug('light.kitchen changed');
  assert.equal(out.length, 0);
  const enabled = capture({ debug: true });
  enabled.logger.debug('light.kitchen changed');
  assert.deepEqual(enabled.out, [{ message: 'light.kitchen changed', level: 'debug' }]);
});

test('levels map to $UD.logMessage levels', () => {
  const { logger, out } = capture({ debug: true });
  logger.debug('d');
  logger.info('i');
  logger.warn('w');
  logger.error('e');
  assert.deepEqual(out.map((o) => o.level), ['debug', 'info', 'warn', 'error']);
});

test('installConsoleRedaction redacts console output of the SDK (research R-18)', () => {
  const { logger } = capture();
  logger.setSecret(TOKEN);
  const written = [];
  const fakeConsole = {
    log: (...a) => written.push(a.join(' ')),
    info: (...a) => written.push(a.join(' ')),
    warn: (...a) => written.push(a.join(' ')),
    error: (...a) => written.push(a.join(' ')),
  };
  const uninstall = installConsoleRedaction(logger, fakeConsole);
  fakeConsole.warn('[ULANZIDECK] send:', JSON.stringify({ cmd: 'setGlobalSettings', settings: { haToken: TOKEN } }));
  fakeConsole.log('[ts]', { settings: { haToken: 'other-secret' } });
  fakeConsole.error(`Bearer ${TOKEN}`);
  assert.equal(written.length, 3);
  assert.doesNotMatch(written.join('\n'), /secret-part|other-secret/);
  uninstall();
  fakeConsole.log('after');
  assert.equal(written.at(-1), 'after');
});
