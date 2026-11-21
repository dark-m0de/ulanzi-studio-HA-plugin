// The installed plugin must start on its own, outside this repository: Ulanzi Studio runs
// dist/app.js with its bundled Node 20.12, which has no ES-module syntax detection, and there is
// no package.json of this repository above the plugin folder.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { mdiLightbulb } from '@mdi/js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const PLUGIN = 'com.ulanzi.hadeck.ulanziPlugin';
let installDir;

before(() => {
  execFileSync(process.execPath, [join(root, 'scripts', 'build.mjs')], { stdio: 'ignore' });
  installDir = mkdtempSync(join(tmpdir(), 'hadeck-install-'));
  cpSync(join(root, 'plugin', PLUGIN), join(installDir, PLUGIN), { recursive: true });
});

after(() => {
  if (installDir) rmSync(installDir, { recursive: true, force: true });
});

test('the build output declares itself as an ES module', () => {
  assert.ok(existsSync(join(installDir, PLUGIN, 'dist', 'package.json')), 'dist/package.json is shipped');
});

test('the bundle ships the Material Design Icons and their license (feature 003, FR-004/FR-019)', () => {
  const dist = join(installDir, PLUGIN, 'dist');
  assert.match(readFileSync(join(dist, 'THIRD_PARTY_LICENSES.txt'), 'utf8'), /@mdi\/js@7\.4\.47/);
  assert.ok(readFileSync(join(dist, 'app.js'), 'utf8').includes(mdiLightbulb), 'dist/app.js contains the mdiLightbulb path');
});

test('the installed bundle starts outside the repository and connects to Ulanzi Studio', async () => {
  const studio = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise((resolve) => studio.once('listening', resolve));
  const commands = [];
  const connected = new Promise((resolve) => {
    studio.on('connection', (socket) => {
      socket.on('message', (data) => {
        const msg = JSON.parse(String(data));
        commands.push(msg.cmd);
        if (msg.cmd === 'getGlobalSettings') resolve();
      });
    });
  });

  const child = spawn(
    process.execPath,
    // Disable syntax detection so newer Node versions behave like Ulanzi Studio's Node 20.12.
    ['--no-experimental-detect-module', join(installDir, PLUGIN, 'dist', 'app.js'), '127.0.0.1', String(studio.address().port), 'en'],
    { cwd: installDir, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));

  try {
    const result = await Promise.race([
      connected.then(() => 'connected'),
      exited.then((code) => `exited with code ${code}`),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 5000)),
    ]);
    assert.equal(result, 'connected', `plugin did not connect:\n${output}`);
    assert.deepEqual(commands.slice(0, 1), ['connected']);
    assert.doesNotMatch(output, /SyntaxError|ERR_/);
  } finally {
    child.kill();
    await new Promise((resolve) => studio.close(resolve));
  }
});
