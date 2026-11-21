// Platform constraint / FR-041: every visible string exists in English and German.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const pluginDir = join(root, 'plugin', 'com.ulanzi.hadeck.ulanziPlugin');
const readJson = (file) => JSON.parse(readFileSync(join(pluginDir, file), 'utf8'));
const en = readJson('en.json');
const de = readJson('de_DE.json');
const manifest = readJson('manifest.json');

function filesIn(dir, ext) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? filesIn(join(dir, d.name), ext) : d.name.endsWith(ext) ? [join(dir, d.name)] : [],
  );
}

const KEY = /(?:pi|status|error|hint)\.[A-Za-z0-9_.]+[A-Za-z0-9_]/;
// Keys built at runtime from a prefix plus a known set of suffixes.
const DYNAMIC = {
  'status.connection.': ['unconfigured', 'connecting', 'connected', 'reconnecting', 'auth_failed'],
  'pi.attribute.': ['light.brightness', 'light.color_temp', 'media_player.volume', 'climate.temperature', 'cover.position', 'fan.percentage', 'number.value'],
  // Short value names on dial and edit key (feature 002, FR-021).
  'attr.short.': ['light.brightness', 'light.color_temp', 'media_player.volume', 'climate.temperature', 'cover.position', 'fan.percentage', 'number.value'],
  // Press action labels (feature 002); built from the registry ids in dial.html.
  'pi.press.': ['default', 'switch_value', 'favorite', 'mute', 'next_track', 'hvac_cycle', 'preset_cycle', 'cover_stop_toggle', 'oscillate', 'service', 'none', 'end_edit', 'toggle'],
};

test('en.json and de_DE.json have the same Localization keys', () => {
  const enKeys = Object.keys(en.Localization).sort();
  const deKeys = Object.keys(de.Localization).sort();
  assert.deepEqual(enKeys.filter((k) => !deKeys.includes(k)), [], 'missing in de_DE.json');
  assert.deepEqual(deKeys.filter((k) => !enKeys.includes(k)), [], 'missing in en.json');
});

test('no translation is empty', () => {
  for (const [name, file] of [['en', en], ['de_DE', de]]) {
    for (const [key, value] of Object.entries(file.Localization)) assert.ok(typeof value === 'string' && value.trim(), `${name}: ${key}`);
  }
});

test('Actions[] are index-aligned with the manifest and have name and tooltip', () => {
  for (const file of [en, de]) {
    assert.equal(file.Actions.length, manifest.Actions.length);
    for (const action of file.Actions) assert.ok(action.Name && action.Tooltip);
  }
});

test('every key used in Property Inspector pages exists', () => {
  const missing = new Set();
  for (const file of filesIn(join(pluginDir, 'property-inspector'), '')) {
    if (!/\.(html|js)$/.test(file)) continue;
    const content = readFileSync(file, 'utf8');
    const used = [
      ...[...content.matchAll(/data-localize="([^"]+)"/g)].map((m) => m[1]),
      ...[...content.matchAll(/data-localize>([^<]+)</g)].map((m) => m[1].trim()),
      ...[...content.matchAll(/\bt\('([^']+)'/g)].map((m) => m[1]),
      ...[...content.matchAll(/HADeck\.t\('([^']+)'/g)].map((m) => m[1]),
    ];
    // Prefixes ending in '.' are completed at runtime (checked in the DYNAMIC test).
    for (const key of used) if (!key.endsWith('.') && !(key in en.Localization)) missing.add(`${file.slice(pluginDir.length + 1)}: ${key}`);
  }
  assert.deepEqual([...missing], []);
});

test('every key passed to t() in src/ exists', () => {
  const missing = new Set();
  for (const file of filesIn(join(root, 'src'), '.js')) {
    const content = readFileSync(file, 'utf8');
    for (const m of content.matchAll(/\bt\('([^']+)'/g)) {
      if (KEY.test(m[1]) && !(m[1] in en.Localization)) missing.add(`${file.slice(root.length)}: ${m[1]}`);
    }
  }
  assert.deepEqual([...missing], []);
});

test('runtime-built keys exist for every suffix', () => {
  for (const [prefix, suffixes] of Object.entries(DYNAMIC)) {
    for (const suffix of suffixes) assert.ok(`${prefix}${suffix}` in en.Localization, `${prefix}${suffix}`);
  }
});
