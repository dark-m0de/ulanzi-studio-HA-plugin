---
description: "Task list for Home Assistant entity icons on keys"
---

# Tasks: Home Assistant Entity Icons on Keys

**Input**: Design documents from `/specs/003-ha-entity-icons/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution Principle III (Test-First, NON-NEGOTIABLE) applies. Write each test task first and confirm it **fails** before you start the matching implementation task.

**Organization**: Tasks are grouped by user story (US1–US4 from spec.md), so each story can be implemented and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: User story from spec.md (US1–US4)

## Path Conventions

- Existing layout: `src/ha/`, `src/domain/`, `src/adapter/`, `plugin/com.ulanzi.hadeck.ulanziPlugin/` (written as `plugin/…/` below), `tests/`
- Layer rule (Principle II): `src/domain/icons/*` may import only other `src/domain/` modules and `@mdi/js`. They must not import `src/ha/`, `src/adapter/`, `node:*` or the SDK. `tests/unit/architecture.test.js` enforces this.
- Naming: "HA Trigger" is the key action for scene/script/automation, implemented in `src/adapter/actions/scene.js` and `plugin/…/property-inspector/scene.html`
- Test helpers: `tests/support/app-harness.js` (`createHarness`, `piRequest`), `tests/support/fake-ha-server.js` (`startFakeHA`, `emitStateChanged`, `messages(type)`), `tests/support/fixtures/states.json` (15 entities; several feature-001 tests assert exactly 15, so **do not add entities**)

---

## Phase 1: Setup

**Purpose**: Dependency, licensing, version and fixtures

- [X] T001 Add the dependency with `npm install @mdi/js@7.4.47 --save-exact`, which updates `package.json` and `package-lock.json` (research R-01).
- [X] T002 Bump the version to `0.3.0` with `npm version 0.3.0 --no-git-tag-version` and set `"Version": "0.3.0"` in `plugin/…/manifest.json`.
- [X] T003 [P] Add `'@mdi/js'` to the `BUNDLED` array in `scripts/build.mjs`.
  - `writeThirdPartyLicenses` reads `node_modules/@mdi/js/LICENSE` and `package.json` (it exists, research R-02).
  - Add a "Material Design Icons (@mdi/js)" entry to `NOTICE`: copyright Pictogrammers (Austin Andrews and contributors); icons under Apache License 2.0, code under MIT; source https://github.com/Templarian/MaterialDesign-JS; "Bundled into dist/app.js"; no NOTICE file of its own.
- [X] T004 [P] Extend `tests/integration/bundle.test.js`:
  - after the build, `dist/THIRD_PARTY_LICENSES.txt` contains `@mdi/js@7.4.47`
  - `dist/app.js` contains the path of `mdiLightbulb`
  - the existing "installed bundle starts" test still passes
- [X] T005 [P] Extend `tests/support/fixtures/states.json`. **Change attributes only**:
  - `light.desk`: add `"rgb_color": [255, 167, 87]` (HA also sets `rgb_color` in colour-temperature mode, research R-07)
  - `cover.blinds`: add `"device_class": "shutter"`
  - `cover.garage`: add `"device_class": "garage"`
  - `sensor.outdoor_temperature`: add `"device_class": "temperature"` (keep `unit_of_measurement`)
  - `script.good_night`: add `"icon": "mdi:weather-night"` (HA custom icon)
  - Run `npm test` and confirm every existing test still passes.
- [X] T006 [P] Create `tests/support/fixtures/icons.json` per [contracts/ha-icon-messages.md](contracts/ha-icon-messages.md), with three top-level keys:
  - `entity_component`: `resources` for light, switch, fan, cover (`_`, shutter, garage), media_player, climate, input_boolean, sensor (`_`, temperature, battery with the full range 0–100), scene, script, automation. Copy the values from HA's `icons.json` (research R-03).
  - `entity`: `{ "resources": { "demo_platform": { "sensor": { "outdoor": { "default": "mdi:sun-thermometer" } } } } }`
  - `list_for_display`: `{ "entities": [ { "ei": "sensor.outdoor_temperature", "pl": "demo_platform", "tk": "outdoor" }, { "ei": "light.desk", "pl": "demo_platform" } ] }`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Icon set lookup, fallback table, colour, icon definition logic and the icon layout in `keySvg`. Every story needs these. There is no visible change yet: no model sets `icon`.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests first (must fail before the implementation below)

- [X] T007 [P] Write `tests/unit/domain/icons/mdi-set.test.js` ([data-model.md](data-model.md) §1):
  - `normaliseIconName`:
    - `'mdi:Lightbulb '` → `'mdi:lightbulb'`
    - `'hass:lightbulb'` → `'mdi:lightbulb'`
    - `'lightbulb'`, `'phu:foo'`, `''`, `null` and names over 64 characters → `null`
  - `iconPath`:
    - `'mdi:lightbulb'` returns a string starting with `M`
    - `'mdi:numeric-1-box'` and `'mdi:window-shutter-open'` resolve
    - `'mdi:does-not-exist'` → `null`
    - `'mdi:__proto__'` and `'mdi:constructor'` → `null` (only own string exports count)
- [X] T008 [P] Write `tests/unit/domain/icons/fallback-icons.test.js`:
  - `fallbackIcon(domain, deviceClass, state)` returns a name `iconPath` can resolve for every key domain (light, switch, fan, cover, media_player, climate, input_boolean, scene, script, automation, sensor) in both states
  - light: on `mdi:lightbulb`, off `mdi:lightbulb-off`
  - cover `garage` closed → `mdi:garage`
  - unknown domain → `null`
- [X] T009 [P] Write `tests/unit/domain/icons/resolve.test.js`, part 1: `iconFromDefinition(state, def)` ([data-model.md](data-model.md) §2):
  - exact state match wins over range and default
  - battery range: `'5'` → `mdi:battery-alert`, `'15'` → `mdi:battery-10`, `'100'` → `mdi:battery`, `'-3'` → default `mdi:battery-unknown`
  - a non-numeric state with a range → default
  - no default and no match → `null`
  - `def` undefined → `null`
- [X] T010 [P] Write `tests/unit/domain/icons/icon-color.test.js` ([data-model.md](data-model.md) §6, research R-07):
  - `parseHexColor('#AbC123')` → `'#abc123'`; `'red'`, `'#abc'` and `''` → `null`
  - `iconColor`:
    - toggle on, no `rgb_color` → `#f59e0b`
    - toggle on, `rgb_color [255,0,0]` → `#ff0000`
    - custom `onColor` wins over `rgb_color`
    - toggle off → `#94a3b8`; custom `offColor` wins
    - trigger → `#a78bfa`
    - sensor → `#5eead4`; sensor warn → `#fb923c`
    - an invalid custom colour is ignored
  - `ensureContrast`:
    - `#000000` and `#0a0a40` come back with a contrast ≥ 3:1 against `#1e293b`
    - `#ffffff` is unchanged
    - the result is always a `#rrggbb` string
- [X] T011 [P] Extend `tests/unit/domain/render/key-svg.test.js` ([data-model.md](data-model.md) §5):
  - a model with `icon: { path: 'M0 0H24V24H0Z', color: '#ff0000' }` and a label renders a background `#1e293b`, a `<path>` with that `d` and `fill`, `transform="translate(30 10) scale(3.5)"` and the label at y 118
  - `status` is not rendered in the icon layout
  - icon + value + label uses `translate(38 6)`, the value at y 92 and the label at y 124
  - icon only and icon + value without a label use the remaining two layouts
  - the path `d` is XML-escaped
  - **Regression**: models without `icon` produce byte-identical SVG to before. Snapshot the existing toggle, sensor, edit and unavailable models.

### Implementation

- [X] T012 [P] Implement `src/domain/icons/mdi-set.js`:
  - `import * as mdi from '@mdi/js'`
  - `normaliseIconName(name)`: trim, lower-case, accept the `mdi:`/`hass:` prefix, max. 64 characters, `[a-z0-9-]` only
  - `iconPath(name)`: kebab → `mdi` + PascalCase; return the value only if `Object.hasOwn(mdi, key)` and it is a string
  - Done when T007 passes.
- [X] T013 [P] Implement `src/domain/icons/fallback-icons.js`:
  - a frozen table in the same `IconDefinition` shape as HA (`{ [domain]: { _: def, [deviceClass]: def } }`) with the values from HA `icons.json` (research R-06)
  - `fallbackIcon(domain, deviceClass, state)` prefers the device-class entry over `_` and applies `iconFromDefinition`, so intermediate states (e.g. `opening`) and ranges work like with HA data *(implementation note: takes the state instead of `isOn`)*
  - Done when T008 passes.
- [X] T014 [P] Implement `iconFromDefinition(state, def)` in `src/domain/icons/resolve.js`: sort the range keys numerically and take the highest key ≤ value. Done when T009 passes.
- [X] T015 [P] Implement `src/domain/icons/icon-color.js`:
  - `parseHexColor`, `iconColor({ kind, isOn, warn, entity, settings })`, `ensureContrast(color, background = '#1e293b', min = 3)`
  - contrast uses WCAG relative luminance; mix towards white in 10 % steps, max. 10 steps
  - export the colour constants
  - Done when T010 passes.
- [X] T016 Implement the icon layout in `src/domain/render/key-svg.js`:
  - extend the `KeyRender` typedef with `icon?: { path, color }`
  - if `model.icon` is set, render the background `#1e293b`, the transformed `<path>`, the value and the label per the layout table in data-model §5 (text colours fg `#e2e8f0`, accent `#94a3b8`, value in `model.icon.valueColor ?? fg`)
  - without `icon`, the code path is unchanged
  - Done when T011 passes.

**Checkpoint**: `npm test` is green. The keys look exactly like in 0.2.0.

---

## Phase 3: User Story 1 - Toggle keys show the HA icon for the current state (Priority: P1) 🎯 MVP

**Goal**: Toggle keys show the HA icon for the entity's state (custom HA icon → HA component icon → fallback), coloured with the light colour or the state colour. Brightness is shown as the secondary value. Error and edit states are unchanged.

**Independent Test**: In the harness, a Toggle key on `light.desk` renders a `<path>` for `mdi:lightbulb` with fill `#ffa757`. After `emitStateChanged` to `off`, it renders `mdi:lightbulb-off` in `#94a3b8`. On the device: quickstart V-01–V-04.

### Tests first

- [X] T017 [P] [US1] Extend `tests/unit/ha/messages.test.js`:
  - `getIconsMessage(5, 'entity_component')` → `{ id: 5, type: 'frontend/get_icons', category: 'entity_component' }` (no `integration` key)
  - `getIconsMessage(6, 'entity', ['hue'])` adds `integration: ['hue']`
  - `entityRegistryDisplayMessage(7)` → `{ id: 7, type: 'config/entity_registry/list_for_display' }`
- [X] T018 [P] [US1] Extend `tests/support/fake-ha-server.js` and `tests/integration/ha/client.test.js`:
  - fake server:
    - answers `frontend/get_icons` (by `category`; for `entity`, only the requested `integration`s) and `config/entity_registry/list_for_display` from `fixtures/icons.json`
    - new `setIconsSupported(false)` → both reply `success: false` with code `unknown_command`
    - new `holdIcons()` / `releaseIcons()`: while held, `frontend/get_icons` requests are queued without a reply; `releaseIcons()` answers all queued requests (used by T022 to test the state before the icon data arrives)
  - client tests:
    - `client.getIcons('entity_component')` resolves `{ resources }`
    - `listEntityRegistryDisplay()` resolves `{ entities }`
    - with icons unsupported, both reject with an `HAError` (`error.service`)
    - while disconnected, both reject with `error.disconnected`
- [X] T019 [P] [US1] Write `tests/unit/domain/icons/icon-data.test.js` ([data-model.md](data-model.md) §3):
  - `setComponents` sets `loaded` and notifies subscribers once
  - `setRegistry` keeps only entries with `tk`
  - `missingPlatforms(['sensor.outdoor_temperature', 'light.desk'])` → `['demo_platform']` before `setPlatform` and `[]` after it
  - `setPlatform(p, undefined)` marks the platform as loaded-without-icons
  - `clear()` keeps the data (no flicker) but resets the "requested" markers and `available` to `null`
  - `available`: `null` initially, `true` after `setComponents`, `false` after `setUnavailable`; each change notifies subscribers
- [X] T020 [P] [US1] Extend `tests/unit/domain/icons/resolve.test.js`, part 2: `resolveKeyIcon(entity, settings, iconData, { kind: 'toggle' })` for steps 2, 4 and 5 of [data-model.md](data-model.md) §4:
  - `attributes.icon: 'mdi:ceiling-light'` wins over the component icon (`source: 'entity'`)
  - with component data loaded: `cover.blinds` closed → `mdi:window-shutter`; `cover.garage` closed → `mdi:garage`; `light.hallway` off → `mdi:lightbulb-off` (`source: 'component'`)
  - an unknown `attributes.icon` (`'phu:x'`) falls through to the component icon
  - `cover.blinds` with state `opening` → `mdi:arrow-up-box` (intermediate state from the `shutter` definition)
  - with empty `IconData`: fallback icons (`source: 'fallback'`)
  - unknown domain without data → `null`
  - the result contains `name`, `path` and `source`
  - `onSkipped` is called once with `'phu:x'` in the unknown-`attributes.icon` case and not at all when the first candidate resolves
- [X] T021 [P] [US1] Extend `tests/unit/domain/render/key-model.test.js` for `toggleModel(entity, binding, { t, connected, icon })`, where `icon` is the resolved icon or `null`:
  - with an icon and the entity on: `{ style: 'on', label, icon: { path, color } }`; brightness as `value`/`unit` for `light.living_room`; no on/off `status` is required
  - off: icon colour `#94a3b8`, no value
  - `cover.blinds` with state `opening` counts as on (`isOnState`) → icon colour `#f59e0b`
  - `icon: null` → exactly the 0.2.0 model
  - set up, disconnected, not found and unavailable never contain `icon`, even if an icon is passed
  - `editModel` never contains `icon`
- [X] T022 [US1] Write `tests/integration/adapter/key-icons.test.js` (harness with fake HA and fake `$UD`; **after T018**, because it needs `holdIcons()`/`releaseIcons()`):
  - **before icon data arrives** (`holdIcons()` before connecting): the Toggle key on `light.desk` already shows the fallback bulb path; `connection.status` (via `piRequest`) reports `iconsAvailable: null`
  - **after the data arrives** (`releaseIcons()`): the key is re-rendered with the component icon; `connection.status` reports `iconsAvailable: true`
  - `emitStateChanged('light.desk', off)` → bulb-off path in `#94a3b8`
  - two `emitStateChanged` calls in quick succession (off, then on) → the last rendered key shows the "on" icon (no stale icon)
  - an unknown `attributes.icon` (`'phu:x'`) produces exactly one `debug` log line `icon not found: phu:x` without the entity ID, even after several re-renders
  - `emitStateChanged` adding `attributes.icon: 'mdi:desk-lamp'` → the key shows the desk lamp path without reconfiguration
  - with `setIconsSupported(false)`: fallback icons, exactly one `warn` log line per connection mentioning icons and no entity IDs; the keys keep working; `connection.status` reports `iconsAvailable: false` and an open PI receives a `connection.changed` push with `iconsAvailable: false` (constitution Principle IV)
  - after a reconnect (`restart()`), icon data is requested again
  - toggle settings saved without icon fields (the 0.2.0 shape) → icon layout (SC-003)
  - disconnect → "disconnected" text layout without a `<path>`

### Implementation

- [X] T023 [P] [US1] Add `getIconsMessage(id, category, integrations)` and `entityRegistryDisplayMessage(id)` to `src/ha/messages.js`. Done when T017 passes.
- [X] T024 [US1] Add `getIcons(category, integrations)` and `listEntityRegistryDisplay()` to `src/ha/client.js`, built on `#request` like `callService`. Done when the client part of T018 passes.
- [X] T025 [P] [US1] Implement the `IconData` store in `src/domain/icons/icon-data.js`: `setComponents` (sets `available = true`), `setUnavailable` (`available = false`), `setPlatform`, `setRegistry`, `registryEntry`, `missingPlatforms`, `markRequested`, `clear` (resets `available` to `null`, keeps the data), `subscribe` (notified on data and on `available` changes). Ignore malformed input. Done when T019 passes.
- [X] T026 [US1] Implement `resolveKeyIcon(entity, settings, iconData, { kind, onSkipped })` in `src/domain/icons/resolve.js` for steps 2, 4, 5 and 6, calling `onSkipped(name)` for every non-empty unknown or invalid candidate (data-model §4). Leave step 1 (override, US2) and step 3 (platform, US3) as clearly marked no-ops. Uses `normaliseIconName`, `iconPath`, `fallbackIcon` and `isOnState` from `src/domain/render/key-model.js`. Done when T020 passes.
- [X] T027 [US1] Extend `toggleModel` in `src/domain/render/key-model.js`:
  - accepts `icon` (a `ResolvedIcon` or `null`) in the options
  - in a valid on/off state, sets `model.icon = { path, color: ensureContrast(iconColor({ kind: 'toggle', isOn, entity, settings: binding })) }`
  - keeps the brightness value
  - error and set-up branches unchanged
  - Done when T021 passes.
- [X] T028 [US1] Implement `src/adapter/icon-loader.js`:
  - `createIconLoader({ client, iconData, logger })`
  - `load()` (called after `states_loaded`): `getIcons('entity_component')` → `setComponents`, and `listEntityRegistryDisplay()` → `setRegistry`, independently
  - on failure of the component request: `iconData.setUnavailable()` and one `logger.warn('HA icons unavailable (…); using built-in icons')` per connection (error key/code only, no entity IDs), then keep going; a failing registry request only logs at debug level (step 3 is optional)
  - `clear()` on status ≠ connected
- [X] T029 [US1] Wire the icons in `src/adapter/app.js`:
  - create `iconData` and `iconLoader`, expose `app.iconData`
  - call `iconLoader.load()` on `states_loaded` and `iconData.clear()` when the connection drops
  - on `iconData.subscribe`, re-render every action instance: `for (const { instance } of registry.values()) safeCall(instance, 'render')`, the same pattern as the existing `onConnectionStatus` loop (`src/adapter/app.js` around line 217). Actions without `render` are skipped by `safeCall`.
- [X] T030 [US1] Update `src/adapter/actions/toggle.js` `render()`: for the non-edit branch, call `resolveKeyIcon(this.entity, this.settings, this.app.iconData, { kind: 'toggle', onSkipped })` and pass the result as `icon` into `toggleModel`. `onSkipped` logs `icon not found: <name>` at debug level once per instance and name (keep a `Set` on the instance). The edit branch is unchanged. Done when the key-rendering cases of T022 pass.
- [X] T031 [US1] Make the icon availability visible in the PI ([contracts/key-icon-settings.md](contracts/key-icon-settings.md) §5, constitution Principle IV):
  - `src/adapter/pi-handlers.js`: add `iconsAvailable: app.iconData.available` to `statusPayload()`, and push `connection.changed` whenever `iconData.available` changes (subscribe in `registerPiHandlers`, compare with the last pushed value)
  - `plugin/…/property-inspector/shared.js` (`renderStatus` in the connection block): if `iconsAvailable === false`, show the hint `pi.connection.iconsUnavailable` below the status line; otherwise hide it
  - add `pi.connection.iconsUnavailable` to `plugin/…/en.json` ("Home Assistant icons are not available (HA 2024.2 or newer required). Built-in icons are used.") and `plugin/…/de_DE.json` ("Home-Assistant-Icons nicht verfügbar (HA 2024.2 oder neuer nötig). Es werden eingebaute Icons verwendet.")
  - Done when the `iconsAvailable` cases of T022 and `tests/unit/locales.test.js` pass

**Checkpoint**: US1 works on its own. `npm test` is green. Device: quickstart V-01–V-04, V-09, V-10.

---

## Phase 4: User Story 2 - Customise or switch off the icon (Priority: P1)

**Goal**: Per key, users can set an icon override, on/off colours and "Show icon". The PI section has a live preview.

**Independent Test**: Through `piRequest`/settings in the harness: `icon: 'mdi:coffee-maker'` with `onColor: '#00ff00'` on `switch.coffee` (turned on) renders the coffee-maker path in `#00ff00`. `showIcon: false` renders the 0.2.0 text layout including `onText`. On the device: quickstart V-05 and V-06.

### Tests first

- [X] T032 [P] [US2] Extend `tests/unit/domain/icons/resolve.test.js`, part 3 (step 1):
  - `settings.icon: 'mdi:coffee-maker'` wins over everything (`source: 'override'`)
  - `'hass:coffee-maker'` works
  - an unknown override (`'mdi:does-not-exist'`) falls through to the HA icon
  - `settings.showIcon === false` → `null` (text layout)
  - `showIcon` missing or `true` → resolved as before
- [X] T033 [P] [US2] Extend `tests/unit/domain/render/key-model.test.js`:
  - `binding.onColor` and `binding.offColor` are used for the respective state (also for `light.desk` with `rgb_color`)
  - invalid colours fall back to the defaults
  - with `icon: null` (show icon off), `onText`/`offText` appear as `status` exactly as in 0.2.0
- [X] T034 [P] [US2] Write `tests/integration/adapter/pi-bridge-icons.test.js` for `icon.preview` ([contracts/key-icon-settings.md](contracts/key-icon-settings.md) §3):
  - `{ name: 'mdi:coffee-maker' }` → `found: true`, `source: 'override'` and a path
  - `{ name: 'mdi:nope' }` → `found: false`, `path: null`
  - `{ name: '', entityId: 'light.hallway' }` → the component icon `mdi:lightbulb-off`
  - `{ entityId: 'light.unknown' }` → `found: false`
  - while disconnected: a `name` still resolves, an `entityId` → `found: false`
- [X] T035 [P] [US2] Extend `tests/integration/adapter/toggle.test.js`: settings with `icon`, `onColor`, `offColor` and `showIcon: false` change the rendered key after `didReceiveSettings`, without a reconnect.

### Implementation

- [X] T036 [US2] Implement step 1 and the `showIcon` check in `resolveKeyIcon` in `src/domain/icons/resolve.js`. Done when T032 passes.
- [X] T037 [US2] Make sure `toggleModel` passes `binding` (with `onColor`/`offColor`) to `iconColor` in `src/domain/render/key-model.js`, and that the text layout with `onText`/`offText` is used when `icon` is `null`. The settings-change path in `src/adapter/actions/toggle.js` (`onSettings` → `render()`) should need no change; adjust it only if T035 shows otherwise. Done when T033 and T035 pass.
- [X] T038 [US2] Register `icon.preview` in `src/adapter/pi-handlers.js`: use `iconPath`/`normaliseIconName` for `name`, and `resolveKeyIcon(entity, {}, app.iconData, { kind: 'toggle' })` for `entityId`. The reply shape follows the contract. Done when T034 passes.
- [X] T039 [US2] Add PI helpers to `plugin/…/property-inspector/shared.js` and `shared.css`:
  - `bindForm` reads and writes `type="checkbox"` as a boolean
  - `mountColorField(input, resetButton)` stores `''` until a colour is picked, with a reset button that clears it
  - `mountIconField(input, previewEl, { entityInput })`: 200 ms debounced `icon.preview`, draws the preview `<svg viewBox="0 0 24 24"><path></svg>` via `document.createElementNS` (no `innerHTML`), sets the placeholder to the HA icon name of the bound entity and shows `pi.icon.notFound` for unknown names
  - export everything on `window.HADeck`
- [X] T040 [US2] Add the "Icon" section to `plugin/…/property-inspector/toggle.html` per contract §2:
  - "Show icon" checkbox (`showIcon`, checked when missing), icon field with preview, on colour and off colour with reset, hint
  - unchecking hides the icon fields
  - all strings via `data-localize`
- [X] T041 [P] [US2] Add the `pi.icon.*` keys from contract §4 to `plugin/…/en.json` and `plugin/…/de_DE.json`. German examples: "Icon anzeigen", "Icon (mdi:…)", "Icon nicht gefunden", "Farbe an", "Farbe aus", "Icon-Farbe", "Zurücksetzen", "Leer lassen für Icon und Farbe aus Home Assistant." `tests/unit/locales.test.js` must pass.

**Checkpoint**: US1 and US2 work. Device: quickstart V-05 and V-06 (SC-004).

---

## Phase 5: User Story 3 - Sensor and trigger keys show icons (Priority: P2)

**Goal**: Sensor keys show icon + value + label, including range icons, integration-specific icons and warning colour. Trigger keys (scene/script/automation) show their HA icon. The confirmation stays in the text layout.

**Independent Test**: In the harness, a Sensor key on `sensor.outdoor_temperature` renders the platform icon `mdi:sun-thermometer` (via `list_for_display` + `entity` icons) with the value `12.3°C`. With `warnAbove: 10`, the path and value are `#fb923c`. A Trigger key on `script.good_night` renders `mdi:weather-night`; after a press, the "done" text layout appears. On the device: quickstart V-07.

### Tests first

- [X] T042 [P] [US3] Extend `tests/unit/domain/icons/resolve.test.js`, part 4 (step 3, FR-003):
  - an entity with registry `{ platform, translationKey }` and a loaded platform definition → `source: 'platform'`, winning over the component icon
  - platform not loaded or without a matching key → component icon
  - a battery sensor uses the range icon from the component definition (`sensor` `battery`, state `'15'` → `mdi:battery-10`)
- [X] T043 [P] [US3] Extend `tests/unit/domain/render/key-model.test.js`:
  - `sensorModel(..., { icon })` → `icon` with colour `#5eead4`, plus `value` and `unit`; warning → icon colour `#fb923c` and `icon.valueColor` `#fb923c`
  - `triggerModel(..., { icon })` → icon colour `#a78bfa` or `onColor`
  - `confirming: true` → no `icon` (text "done")
  - error states without `icon`
- [X] T044 [P] [US3] Extend `tests/integration/adapter/sensor.test.js` and `tests/integration/adapter/scene.test.js` with the independent-test scenarios above, plus:
  - the fake server receives exactly one `frontend/get_icons` request with `category: 'entity'` and `integration: ['demo_platform']` per connection (lazy and de-duplicated, even with two keys bound to the same platform)
  - `showIcon: false` → text layout

### Implementation

- [X] T045 [US3] Implement step 3 in `resolveKeyIcon` in `src/domain/icons/resolve.js` (`iconData.registryEntry(entityId)` → `platforms`). Done when T042 passes.
- [X] T046 [US3] Add lazy platform loading to `src/adapter/icon-loader.js` and `src/adapter/app.js`:
  - `ensurePlatformsFor(entityIds)`: `iconData.missingPlatforms` → `markRequested` → one `getIcons('entity', platforms)` → `setPlatform` for each requested platform (`undefined` if it is missing from the result)
  - on failure: debug log and leave the platforms marked
  - called after `load()` resolved the registry and whenever an action binds an entity (`ActionBase.bindEntity` → `app.iconLoader.ensurePlatformsFor([entityId])`)
- [X] T047 [US3] Extend `sensorModel` and `triggerModel` in `src/domain/render/key-model.js` with the `icon` option and the colours per data-model §6 (warning colour for icon and value; no icon while `confirming`). Done when T043 passes.
- [X] T048 [US3] Add `iconFor(kind)` to `src/adapter/actions/key-action.js`, returning `resolveKeyIcon(this.entity, this.settings, this.app.iconData, { kind })`. It passes the same debug-once `onSkipped` logger as T030 (move that helper into `key-action.js`/`action-base.js` so Toggle and the key actions share it). Use it in `src/adapter/actions/sensor.js` (`kind: 'sensor'`) and `src/adapter/actions/scene.js` (`kind: 'trigger'`). Done when T044 passes. *(Implementation note: the helper lives in `ActionBase.resolveIcon(kind)` in `action-base.js`, shared by Toggle and all key actions.)*
- [X] T049 [P] [US3] Add the "Icon" section (show icon, icon field with preview, "Icon colour" via `onColor`, hint; no off colour) to `plugin/…/property-inspector/sensor.html` and `plugin/…/property-inspector/scene.html`.

**Checkpoint**: US1–US3 work. Device: quickstart V-07.

---

## Phase 6: User Story 4 - Service keys with a chosen icon (Priority: P3)

**Goal**: Service keys show an icon only when the user configured one.

**Independent Test**: In the harness, a Service key with `icon: 'mdi:lightbulb-group'` renders that path in `#a78bfa` with the label. Without `icon`, the SVG is byte-identical to 0.2.0. On the device: quickstart V-08.

### Tests first

- [X] T050 [P] [US4] Extend `tests/unit/domain/icons/resolve.test.js` and `tests/unit/domain/render/key-model.test.js`:
  - `resolveKeyIcon(null, { icon: 'mdi:lightbulb-group' }, data, { kind: 'service' })` → the override; without `icon` → `null`, even if `showIcon` is missing
  - `serviceModel(..., { icon })` → icon colour `#a78bfa` or `onColor`; invalid configuration, disconnected and confirming → no `icon`
- [X] T051 [P] [US4] Extend `tests/integration/adapter/service.test.js` with the independent-test scenarios above.

### Implementation

- [X] T052 [US4] Restrict `resolveKeyIcon` to step 1 for `kind: 'service'` in `src/domain/icons/resolve.js`, and add the `icon` option to `serviceModel` in `src/domain/render/key-model.js`. Done when T050 passes.
- [X] T053 [US4] Use `this.iconFor('service')` in `src/adapter/actions/service.js`. Done when T051 passes.
- [X] T054 [P] [US4] Add an icon field with preview and an "Icon colour" field (no "Show icon" checkbox) to `plugin/…/property-inspector/service.html`.

**Checkpoint**: All stories work.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T055 [P] Confirm that `tests/unit/architecture.test.js` passes with the new `src/domain/icons/` modules. If it needs it, add an explicit test that `src/domain/icons/*` imports nothing except `./`, `../` and `@mdi/js`.
- [X] T056 [P] Update `README.md`:
  - a feature bullet "Home Assistant icons on keys"
  - icon settings under the key actions
  - a note that HA ≥ 2024.2 is needed for HA icons (older versions use built-in icons)
  - a credits line for Material Design Icons
- [X] T057 [P] Write `specs/003-ha-entity-icons/release-notes.md` for v0.3.0 (German and English, in the same style as `specs/002-dial-press-actions/release-notes.md`). *(Written in English only, like the 0.2.0 release notes.)*
- [X] T058 Run `npm run build` and `npm run package`. Record the package size compared to 0.2.0 in `specs/003-ha-entity-icons/validation.md` (SC-006, ≤ 5 MB).
- [ ] T059 Run the device validation (quickstart V-01–V-13) on Windows and macOS and record the results in `specs/003-ha-entity-icons/validation.md`, including the per-domain icon comparison table for SC-001.
- [X] T060 Review against the constitution:
  - tests green
  - no tokens or entity IDs above debug level in the new log lines
  - all strings localised
  - `NOTICE` and `THIRD_PARTY_LICENSES.txt` contain `@mdi/js`

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies. T001 must finish before T003, T004 and T012.
- **Foundational (Phase 2)**: depends on Setup and blocks all stories.
- **US1 (Phase 3)**: depends on Foundational. It provides `IconData`, the loader, `resolveKeyIcon` and the app wiring that US2–US4 build on.
- **US2 (Phase 4)**: depends on US1 (it extends `resolveKeyIcon` and `toggleModel`).
- **US3 (Phase 5)**: depends on US1. The PI part reuses the `shared.js` helpers from US2 (T039), so do US2 first or implement T039 early.
- **US4 (Phase 6)**: depends on US2 (override step, PI helpers) and T048 (`iconFor`).
- **Polish (Phase 7)**: after the desired stories.

```text
Setup → Foundational → US1 ─┬─► US2 ─┬─► US4 ─► Polish
                            └─► US3 ◄┘
```

### Within each story

- Tests first; confirm they fail.
- Domain (`src/domain/icons/*`, `key-model.js`) → HA layer → adapter (`icon-loader.js`, `app.js`, actions) → PI and locales.
- `src/domain/icons/resolve.js` is edited by T014, T026, T036, T045 and T052, and `src/domain/render/key-model.js` by T027, T037, T047 and T052. `src/adapter/pi-handlers.js` is edited by T031 and T038, `plugin/…/property-inspector/shared.js` by T031 and T039. Do these sequentially.

## Parallel Opportunities

- **Setup**: T003 ∥ T004 ∥ T005 ∥ T006 after T001
- **Foundational**: tests T007 ∥ T008 ∥ T009 ∥ T010 ∥ T011; then T012 ∥ T013 ∥ T014 ∥ T015, then T016
- **US1**: tests T017 ∥ T019 ∥ T020 ∥ T021 ∥ T018, then T022 (needs T018); T023 ∥ T025, then T024, T026 → T027 → T028 → T029 → T030 → T031
- **US2**: T032 ∥ T033 ∥ T034 ∥ T035; T041 alongside T036–T040
- **US3**: T042 ∥ T043 ∥ T044; T049 alongside T045–T048
- **US4**: T050 ∥ T051; T054 alongside T052/T053
- **Polish**: T055 ∥ T056 ∥ T057

## Parallel Example: Foundational

```bash
# Tests together (they must fail first):
Task: "Write tests/unit/domain/icons/mdi-set.test.js"
Task: "Write tests/unit/domain/icons/fallback-icons.test.js"
Task: "Write iconFromDefinition tests in tests/unit/domain/icons/resolve.test.js"
Task: "Write tests/unit/domain/icons/icon-color.test.js"
Task: "Extend tests/unit/domain/render/key-svg.test.js with the icon layout"

# Independent implementations:
Task: "Implement src/domain/icons/mdi-set.js"
Task: "Implement src/domain/icons/fallback-icons.js"
Task: "Implement iconFromDefinition in src/domain/icons/resolve.js"
Task: "Implement src/domain/icons/icon-color.js"
```

## Implementation Strategy

### MVP first

1. Phase 1 and Phase 2: no visible change, everything still green.
2. Phase 3 (US1): Toggle keys with HA icons and colours. **Stop and validate** on the device: V-01 (does Ulanzi Studio render `<path>` correctly?), V-02, V-03.

### Incremental delivery

1. + US2: override, colours, show icon, PI preview
2. + US3: sensor (including range and integration icons) and trigger keys
3. + US4: service keys
4. Polish: README, release notes, size check, device validation, release 0.3.0

### Notes

- Commit per task or logical group with Conventional Commits (`test:`, `feat:`, `chore:`, `docs:`).
- Merge via a pull request into `main`; the required check "All tests passed" must be green.
