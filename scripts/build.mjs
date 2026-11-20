// Bundles the main service (src/adapter/main.js) into the installable plugin folder.
// Usage: node scripts/build.mjs [--watch]
import { context, build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [join(root, 'src/adapter/main.js')],
  outfile: join(root, 'plugin/com.ulanzi.hadeck.ulanziPlugin/dist/app.js'),
  bundle: true,
  platform: 'node',
  target: 'node20.12',
  format: 'esm',
  // Optional native add-ons of `ws`; it falls back to pure JS without them (research R-02).
  external: ['bufferutil', 'utf-8-validate'],
  // Allow bundled CommonJS dependencies to call require() inside the ESM output.
  banner: {
    js: "import { createRequire as __hadeckCreateRequire } from 'node:module'; const require = __hadeckCreateRequire(import.meta.url);",
  },
  legalComments: 'none',
  logLevel: 'info',
};

// License texts of bundled packages (MIT/Apache-2.0 require shipping them; see NOTICE).
const BUNDLED = ['ulanzideck-api', 'ws'];
async function writeThirdPartyLicenses() {
  const parts = [];
  for (const name of BUNDLED) {
    const dir = join(root, 'node_modules', name);
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    const license = await readFile(join(dir, 'LICENSE'), 'utf8');
    parts.push(`${'='.repeat(78)}\n${name}@${pkg.version} (${pkg.license})\n${'='.repeat(78)}\n\n${license.trim()}\n`);
  }
  const outDir = join(root, 'plugin/com.ulanzi.hadeck.ulanziPlugin/dist');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'THIRD_PARTY_LICENSES.txt'), parts.join('\n'));
}
await writeThirdPartyLicenses();

// dist/app.js is an ES module. Ulanzi Studio runs it with Node 20.12, which only treats a .js
// file as ESM when the nearest package.json says so. Without this file the installed plugin
// crashes with "Cannot use import statement outside a module" (it only worked in development
// because the dev-link symlink resolves to this repository's package.json).
await writeFile(
  join(root, 'plugin/com.ulanzi.hadeck.ulanziPlugin/dist/package.json'),
  `${JSON.stringify({ type: 'module', private: true }, null, 2)}\n`,
);

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('Watching for changes…');
} else {
  await build(options);
}
