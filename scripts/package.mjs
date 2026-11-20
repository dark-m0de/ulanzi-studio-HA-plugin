// Builds the plugin and packages the plugin folder as a zip archive for distribution.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, rm } from 'node:fs/promises';
import { platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_FOLDER = 'com.ulanzi.hadeck.ulanziPlugin';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = join(root, 'plugin', PLUGIN_FOLDER);
const zipPath = join(root, `${PLUGIN_FOLDER}.zip`);

execFileSync(process.execPath, [join(root, 'scripts', 'build.mjs')], { stdio: 'inherit' });

await copyFile(join(root, 'LICENSE'), join(pluginDir, 'LICENSE'));
await copyFile(join(root, 'NOTICE'), join(pluginDir, 'NOTICE'));
await rm(zipPath, { force: true });

const cwd = join(root, 'plugin');
const result =
  platform() === 'win32'
    ? spawnSync('tar', ['-a', '-c', '-f', zipPath, PLUGIN_FOLDER], { cwd, stdio: 'inherit' })
    : spawnSync('zip', ['-r', '-q', '-X', zipPath, PLUGIN_FOLDER, '-x', '*.DS_Store'], { cwd, stdio: 'inherit' });

if (result.error || result.status !== 0) {
  const tool = platform() === 'win32' ? 'tar' : 'zip';
  console.error(`Packaging failed: the "${tool}" command is missing or returned an error.`);
  process.exit(1);
}
console.log(`Created ${zipPath}`);
