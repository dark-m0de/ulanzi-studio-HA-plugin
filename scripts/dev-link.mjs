// Links the plugin folder into the Ulanzi Studio plugins directory for development.
// Override the target directory with HADECK_PLUGIN_DIR (research V-07).
import { lstat, mkdir, symlink, readlink } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_FOLDER = 'com.ulanzi.hadeck.ulanziPlugin';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'plugin', PLUGIN_FOLDER);

function defaultPluginsDir() {
  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Ulanzi', 'UlanziDeck', 'Plugins');
  }
  if (platform() === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
    return join(appData, 'Ulanzi', 'UlanziDeck', 'Plugins');
  }
  throw new Error('Unsupported platform. Set HADECK_PLUGIN_DIR to the Ulanzi Studio plugins directory.');
}

const pluginsDir = resolve(process.env.HADECK_PLUGIN_DIR ?? defaultPluginsDir());
const target = join(pluginsDir, PLUGIN_FOLDER);

await mkdir(pluginsDir, { recursive: true });

let existing = null;
try {
  existing = await lstat(target);
} catch {
  // target does not exist yet
}

if (existing) {
  if (!existing.isSymbolicLink()) {
    console.error(`Refusing to overwrite ${target}: it exists and is not a symlink.`);
    process.exit(1);
  }
  const current = await readlink(target);
  if (resolve(dirname(target), current) === source) {
    console.log(`Already linked: ${target} → ${source}`);
    process.exit(0);
  }
  console.error(`Refusing to replace existing symlink ${target} → ${current}. Remove it first.`);
  process.exit(1);
}

// 'junction' only matters on Windows (no admin rights needed); it is ignored elsewhere.
await symlink(source, target, 'junction');
console.log(`Linked ${target} → ${source}`);
console.log('Restart Ulanzi Studio to load the plugin.');
