// Constitution Principle II (layer separation) and Principle V (single host, bundled resources).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? jsFiles(join(dir, d.name)) : d.name.endsWith('.js') ? [join(dir, d.name)] : [],
  );
}

const imports = (file) => [...readFileSync(file, 'utf8').matchAll(/(?:^|\n)\s*import\b[^'"]*['"]([^'"]+)['"]/g)].map((m) => m[1]);

test('src/ha and src/domain import neither the SDK, ws, node built-ins nor the adapter layer', () => {
  const violations = [];
  for (const layer of ['src/ha', 'src/domain']) {
    for (const file of jsFiles(join(root, layer))) {
      for (const spec of imports(file)) {
        if (spec === 'ulanzideck-api' || spec === 'ws' || spec.startsWith('node:') || spec.includes('/adapter/')) {
          violations.push(`${relative(root, file)} → ${spec}`);
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('src/domain does not import src/ha either (pure logic)', () => {
  const violations = [];
  for (const file of jsFiles(join(root, 'src/domain'))) {
    for (const spec of imports(file)) if (spec.includes('/ha/') && !spec.endsWith('/ha/messages.js')) violations.push(`${relative(root, file)} → ${spec}`);
  }
  assert.deepEqual(violations, []);
});

test('src/domain/icons imports only domain modules and the @mdi/js icon data (feature 003)', () => {
  const violations = [];
  for (const file of jsFiles(join(root, 'src/domain/icons'))) {
    for (const spec of imports(file)) {
      const ok = spec === '@mdi/js' || ((spec.startsWith('./') || spec.startsWith('../')) && !spec.includes('/ha/') && !spec.includes('/adapter/'));
      if (!ok) violations.push(`${relative(root, file)} → ${spec}`);
    }
  }
  assert.deepEqual(violations, []);
});

test('no source file or Property Inspector page references an external URL', () => {
  const allowed = /^https?:\/\/www\.w3\.org\/2000\/svg/;
  const pages = join(root, 'plugin', 'com.ulanzi.hadeck.ulanziPlugin', 'property-inspector');
  const files = [...jsFiles(join(root, 'src')), ...readdirSync(pages).map((f) => join(pages, f))];
  const found = [];
  for (const file of files) {
    // Example values in placeholder attributes are text, not references.
    const content = readFileSync(file, 'utf8').replace(/placeholder="[^"]*"/g, '');
    for (const m of content.matchAll(/https?:\/\/[^\s'"`)<>]+/g)) {
      if (!allowed.test(m[0])) found.push(`${relative(root, file)}: ${m[0]}`);
    }
  }
  assert.deepEqual(found, []);
});
