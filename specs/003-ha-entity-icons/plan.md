# Implementation Plan: Home Assistant Entity Icons on Keys

**Branch**: `003-ha-entity-icons` | **Date**: 2026-11-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-ha-entity-icons/spec.md`

## Summary

Entity-bound keys (Toggle, Sensor, HA Trigger) show the icon Home Assistant uses for the entity
in its current state, coloured by state or, for lights, by their actual colour. Service keys
show an icon when the user names one. Per key, users can override the icon, set on/off colours,
or switch back to the text layout of feature 001.

Technical approach (see [research.md](research.md)):

- **Icon set**: bundle `@mdi/js` (Apache-2.0, 7,447 icons, about 0.8 MB gzipped) into
  `dist/app.js`. A new domain module resolves `mdi:` names to SVG paths.
- **HA icons**:
  - The HA client gets two read-only requests: `frontend/get_icons` (`entity_component` per
    connection, `entity` lazily per platform) and `config/entity_registry/list_for_display`
    (translation keys).
  - A new `IconData` store holds the results.
  - A pure `resolveKeyIcon()` follows the HA frontend's order: override → `attributes.icon` →
    platform icon → component icon by device class/state/range → built-in fallback → text.
- **Rendering**:
  - `KeyRender` gets an optional `icon { path, color }`.
  - `keySvg()` draws a transformed `<path>` in a new icon layout on a neutral dark background.
  - `iconColor()` picks the state, light or custom colour and enforces 3:1 contrast.
  - Error, edit and confirmation states keep the text layout.
- **Configuration**:
  - New optional settings `showIcon`, `icon`, `onColor` and `offColor` (missing fields mean
    defaults, so no migration).
  - An "Icon" section in the four PIs, with a live preview via a new `icon.preview` PI request.

## Technical Context

**Language/Version**: JavaScript (ES2022, ES modules), Node.js 20.12 runtime (unchanged)

**Primary Dependencies**:
- Existing: `ulanzideck-api`, `ws`, `common-html`; dev: `esbuild`.
- **New runtime dependency `@mdi/js@7.4.47`**:
  - Purpose: icon path data.
  - Size: 2.83 MB raw, 0.80 MB gzipped.
  - License: Apache-2.0 for the icons, MIT for the code; no NOTICE file.
  - Maintenance: the actively maintained Pictogrammers project, also used by the HA frontend.
  - See research R-01 and R-02.

**Storage**: Ulanzi Studio per-action settings, with new optional fields
([contracts/key-icon-settings.md](contracts/key-icon-settings.md)). HA icon data is kept in
memory only and reloaded on every connection.

**Testing**: `node --test` with the existing harness (fake HA server, fake `$UD`, manual clock).
- New fixtures `tests/support/fixtures/icons.json` (component, platform and registry responses).
- The fake server gains a `success: false` mode.

**Target Platform**:
- Ulanzi Studio ≥ 3.3.0 on Windows/macOS; keys on all Deck models.
- Home Assistant ≥ 2024.1 (unchanged). HA icons are used from 2024.2 on, with fallback icons
  below that.

**Project Type**: Desktop application plugin (existing project, feature increment)

**Performance Goals**:
- Icon/colour update ≤ 1 s after a state change (SC-002). This is dominated by the existing
  state push; rendering is a string concatenation.
- Icon data loading does not delay the first render: fallback icons are shown first.

**Constraints**:
- Offline icon rendering; HA is the only host (Principle V).
- Backwards compatible settings (SC-003).
- Package growth ≤ 5 MB (SC-006); measured about 0.8 MB zipped.
- Ulanzi Studio's renderer must draw `<path>` with `transform` (validation V-01).

**Scale/Scope**:
- 4 key actions.
- 5 new domain modules: `icons/mdi-set.js`, `icons/icon-data.js`, `icons/resolve.js`,
  `icons/fallback-icons.js`, `icons/icon-color.js`.
- 1 new adapter module: `icon-loader.js`.
- Changes to:
  - HA client and messages; `key-svg.js`, `key-model.js`
  - the actions `toggle.js`, `key-action.js`, `sensor.js`, `scene.js`, `service.js`
  - `app.js`, `pi-handlers.js`
  - 4 PI pages, `shared.js`, `shared.css`, the locales
  - `build.mjs`, `NOTICE`, `package.json`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle / Section | Pre-research | Post-design |
|---|---|---|---|
| I | SDK Conformance | ✅ Uses only `setBaseDataIcon` with SVG data (already in use) and the existing PI messaging | ✅ No new SDK APIs; manifest unchanged except version 0.3.0 |
| II | Layer Separation | ✅ Icon resolution and colour are pure domain modules; HA requests live in `src/ha` | ✅ `src/domain/icons/*` import only domain modules and `@mdi/js` (data only). `icon-loader.js` in the adapter wires client → `IconData`. The architecture test still applies. |
| III | Test-First | ✅ Unit tests for resolution order, range logic, colour/contrast and SVG layout before implementation; fake-server tests for the new HA requests | ✅ Test list in [quickstart.md](quickstart.md) |
| IV | Responsive & Robust | ✅ Keys render immediately with fallback icons; icon data loads asynchronously | ✅ Failed icon requests are logged (warn, once per connection), keep the fallback and are shown to the user as a hint in the PI connection block (`iconsAvailable: false`, [contracts/key-icon-settings.md](contracts/key-icon-settings.md) §5); no crash path |
| V | Security & Privacy | ✅ Requests only to the configured HA instance; icon set bundled locally | ✅ No tokens or entity IDs above debug level; the PI preview uses DOM APIs, no `innerHTML` with user input |
| VI | Simplicity | ⚠️ One new runtime dependency (justified in Technical Context and R-01); no curated subset tooling | ✅ No icon gallery, no edit-mode icon, dials excluded (YAGNI); the dependency is justified, not a violation |
| — | Platform Constraints | ✅ All new strings in `en.json`/`de_DE.json` | ✅ The locale test covers the new keys |
| — | Licensing | ✅ `@mdi/js` Apache-2.0 / MIT, explicitly allowed for icon sets by the constitution | ✅ `NOTICE` entry and `BUNDLED` entry in `build.mjs` → `THIRD_PARTY_LICENSES.txt` |
| — | Development Workflow | ✅ spec-kit flow on branch `003-ha-entity-icons`, merged via PR | ✅ Version 0.3.0 (new feature, SemVer minor) |

**Result**: PASS. The new dependency is justified as Principle VI requires, so this is not a
violation.

## Project Structure

### Documentation (this feature)

```text
specs/003-ha-entity-icons/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── key-icon-settings.md   # settings fields, PI form, icon.preview request, locale keys
│   └── ha-icon-messages.md    # frontend/get_icons, list_for_display, error behaviour
├── checklists/requirements.md
└── tasks.md                   # /speckit-tasks
```

### Source Code (changes to the existing layout)

```text
src/ha/
├── messages.js              # + getIconsMessage(id, category, integrations?), entityRegistryDisplayMessage(id)
└── client.js                # + getIcons(category, integrations?), listEntityRegistryDisplay()

src/domain/icons/            # NEW
├── mdi-set.js               # normaliseIconName(), iconPath(name) over @mdi/js
├── fallback-icons.js        # fallbackIcon(domain, deviceClass, state)
├── icon-data.js             # IconData store (components, platforms, registry, subscribe)
├── resolve.js               # iconFromDefinition(), resolveKeyIcon()
└── icon-color.js            # iconColor(), ensureContrast(), parseHexColor()

src/domain/render/
├── key-svg.js               # + icon layout when model.icon is set
└── key-model.js             # toggle/sensor/trigger/service models accept a resolved icon + colour

src/adapter/
├── icon-loader.js           # NEW: loads icon data after states_loaded, lazy platform loading, warn-once
├── app.js                   # creates IconData + IconLoader, re-renders keys on icon data change
├── pi-handlers.js           # + icon.preview, iconsAvailable in connection.status / connection.changed
└── actions/
    ├── action-base.js       # bindEntity() asks the icon loader for missing platform icons (US3)
    ├── toggle.js            # passes resolved icon/colour into toggleModel
    ├── key-action.js        # shared icon resolution helper for trigger/sensor/service
    ├── sensor.js, scene.js, service.js

plugin/com.ulanzi.hadeck.ulanziPlugin/
├── property-inspector/toggle.html, sensor.html, scene.html, service.html   # "Icon" section
├── property-inspector/shared.js, shared.css   # checkbox/colour binding, icon preview helper
├── en.json, de_DE.json                        # pi.icon.* keys
└── manifest.json                              # Version 0.3.0

scripts/build.mjs            # BUNDLED += '@mdi/js'
NOTICE                       # + Material Design Icons (@mdi/js)
package.json                 # + "@mdi/js": "7.4.47"

tests/
├── support/fixtures/icons.json                       # NEW
├── support/fake-ha-server.js                         # + get_icons, list_for_display, failure mode
├── unit/domain/icons/*.test.js                       # NEW (mdi-set, resolve, icon-color, fallback, icon-data)
├── unit/domain/render/key-svg.test.js, key-model.test.js   # + icon layout cases
├── unit/ha/messages.test.js                          # + new message builders
├── integration/ha/client.test.js                     # + getIcons / listEntityRegistryDisplay incl. failure
├── integration/adapter/pi-bridge-icons.test.js       # NEW: icon.preview
├── integration/adapter/toggle.test.js, sensor.test.js, scene.test.js, service.test.js   # + icon cases
└── integration/adapter/key-icons.test.js             # NEW: fallback → HA icon, state change, settings compat
```

**Structure Decision**: Extend the existing single project. The new code goes into
`src/domain/icons/` (pure) and `src/adapter/icon-loader.js`. Everything else changes existing
files.

## Complexity Tracking

No constitution violations, so nothing to justify. The new runtime dependency is justified in
the Technical Context, as Principle VI requires.
