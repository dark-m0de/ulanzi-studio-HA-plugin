# Research: Home Assistant Entity Icons on Keys

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-21

Sources were read on 2026-11-21 from the `dev` branches of `home-assistant/core` and
`home-assistant/frontend` (`frontend/__init__.py`, `helpers/icon.py`, `light|cover|sensor/icons.json`,
`src/data/icons.ts`, `src/common/entity/state_icon.ts`, `src/data/entity/entity_registry.ts`,
`config/entity_registry.py`) and from the npm package `@mdi/js@7.4.47`.

## R-01 Icon set: which package, how bundled

**Decision**: Add `@mdi/js` (pinned `7.4.47`) as a runtime dependency and bundle it into
`dist/app.js` with esbuild via a namespace import (`import * as mdi from '@mdi/js'`). Icon names
are resolved at runtime: `mdi:ceiling-light` → strip prefix → kebab-case to camel-case with an
`mdi` prefix (`mdiCeilingLight`) → look up the path string.

**Rationale**:
- `@mdi/js` is the set Home Assistant's frontend uses itself, so every icon name HA can return
  exists in it (same naming).
- It contains only SVG path strings (7,447 icons in one 24×24 grid): 2.83 MB raw, 0.80 MB
  gzipped. The plugin package (zip) grows by about 0.8 MB, the unpacked plugin by about 2.8 MB.
  Both are well within SC-006 (≤ 5 MB).
- No font, no rasterisation, no runtime file I/O: a path string drops straight into the SVG the
  plugin already renders per key (`key-svg.js`).
- Kebab → camel conversion is lossless for MDI names (`numeric-1-box` → `mdiNumeric1Box`), so no
  separate name index is needed.

**Alternatives considered**:
- *Curated subset* (only icons of the built-in fallback table): rejected, because user icons and
  HA icons can be any of the 7,447 names (spec FR-004).
- *Build-time JSON map loaded with `fs` at start*: same size, but adds a second dist file, file
  I/O and a loader. Rejected (Simplicity).
- *`@mdi/svg` (one SVG file per icon)*: 7,000+ files in the plugin folder and file I/O per
  lookup. Rejected.
- *MDI web font*: needs font rendering in Ulanzi Studio's SVG renderer, which is unverified.
  Rejected.

## R-02 License of the icon set

**Decision**: Allowed. List `@mdi/js` in `NOTICE` and add it to `BUNDLED` in `scripts/build.mjs`
so that its `LICENSE` lands in `dist/THIRD_PARTY_LICENSES.txt`.

**Rationale**: The package's `package.json` declares `Apache-2.0`. Its `LICENSE` file
("Pictogrammers Free License") states: icons are under Apache 2.0, or are redistributed under
their respective licenses; code is MIT. The constitution (*Licensing & Code Provenance*)
explicitly names Material Design Icons (Apache-2.0) as an allowed icon set, with attribution.
The package ships no `NOTICE` file. Brand/trademark icons in the set are only drawn if a user
or HA asks for them by name; the plugin does not ship or show HA's own logo.

## R-03 Where HA's default icons come from

**Decision**: Use the WebSocket command `frontend/get_icons`:

- `{ "type": "frontend/get_icons", "category": "entity_component" }` once per connection.
  Without `integration`, HA returns the icon definitions of all loaded top-level components.
  Shape: `result.resources[<domain>] = { "_": IconDef, "<device_class>": IconDef }`, with
  `IconDef = { default?, state?: { <state>: icon }, range?: { "<number>": icon }, state_attributes? }`.
- `{ "type": "frontend/get_icons", "category": "entity", "integration": [<platform>, …] }` for
  integration-specific icons (FR-003, SHOULD). Only requested for the platforms of bound entities
  that have a `translation_key`; cached per platform until the next reconnect.
  Shape: `result.resources[<platform>][<domain>][<translation_key>] = IconDef`.

Verified examples (`icons.json`):
- light: `_ = { default: mdi:lightbulb, state: { off: mdi:lightbulb-off } }`
- cover: `_ = { default: mdi:dock-top, state: { closed: mdi:card, … } }`;
  `shutter = { default: mdi:window-shutter-open, state: { closed: mdi:window-shutter, closing: mdi:arrow-down-box, opening: mdi:arrow-up-box } }`;
  `garage = { default: mdi:garage-open, state: { closed: mdi:garage, … } }`
- sensor: `_ = { default: mdi:eye }`; `temperature = { default: mdi:thermometer }`;
  `battery = { default: mdi:battery-unknown, range: { "0": mdi:battery-alert, "10": mdi:battery-10, …, "100": mdi:battery } }`

**Rationale**: This is exactly what the HA frontend uses since the icon translations (frontend
code gates it on HA ≥ 2024.2), so SC-001 ("same icon as the HA frontend") is reachable without
copying HA's tables into the plugin. It goes only to the configured HA host (Principle V).

**Alternatives considered**: *Copy HA's tables into the plugin*: goes stale with every HA
release, and integration icons would be impossible. Rejected, except for the small fallback
table (R-06).

## R-04 Resolution order (mirrors `src/data/icons.ts`)

**Decision**: Pure function `resolveEntityIcon(entity, iconData)` in the domain layer:

1. Key override (plugin setting): spec FR-001 (1).
2. `entity.attributes.icon`. HA core writes the user's registry icon (or the integration's
   fixed icon) into this state attribute, and it updates via `state_changed` when the user
   changes it in HA (spec edge case "icon changes at runtime"). This replaces the frontend's
   `entry.icon` step without loading the full registry for it.
3. Platform icon: `entity[platform][domain][translation_key]` (from `list_for_display`
   `pl` + `tk`, R-05) → `iconFromDefinition(state, def)`.
4. Component icon: `entity_component[domain][device_class] ?? entity_component[domain]._` →
   `iconFromDefinition`.
5. Built-in fallback table (R-06).
6. None → text layout.

`iconFromDefinition(state, def)` (frontend `getIconFromTranslations`): `def.state[state]`; else,
if the state is numeric and `def.range` exists, use the highest range key ≤ value (below the
lowest key: no range result) and otherwise fall back to `def.default`; else `def.default`.
Battery 15 % gives `mdi:battery-10`, and 5 % gives `mdi:battery-alert`.

The frontend's hard-coded `stateIcon` cases (`update`, `device_tracker`, `sun`, `input_datetime`)
are not relevant for the key domains of this feature (toggle domains, sensor, scene, script,
automation) and are not reproduced.

## R-05 Translation keys and platforms

**Decision**: Load `{ "type": "config/entity_registry/list_for_display" }` once per connection.
Keep only `ei` (entity id), `pl` (platform) and `tk` (translation key) of entries that have a
`tk`. If the call fails (e.g. very old HA), skip step 3 silently (debug log).

**Rationale**: It is the lightweight registry endpoint the frontend itself uses, it does not need
an admin token, and it skips disabled entities. A new or renamed translation key only shows up
after a reconnect, which is acceptable because translation keys change only when integrations
are updated.

## R-06 Built-in fallback icons

**Decision**: A small table in `src/domain/icons/fallback-icons.js` keyed by `domain` (and
device class for cover/switch/media_player), with an `on`/`default` icon and an `off`/closed
icon. It covers the feature's key domains: light, switch (incl. outlet), fan, cover (incl.
common device classes), media_player (incl. tv/speaker), climate, input_boolean, scene,
script, automation, sensor. Values are copied from the corresponding HA `icons.json` files when
implementing (e.g. light `mdi:lightbulb` / `mdi:lightbulb-off`).

**Rationale**: Covers HA 2024.1 (the README's minimum, before icon translations), a failed
`get_icons`, and the time before icon data has loaded after a connect, so keys never flash
between text layout and icon layout on every reconnect. The minimum HA version stays 2024.1.

## R-07 Icon colour

**Decision**:
- **On**: the custom `onColor` if set; else, for lights that are on with an `rgb_color`
  attribute, that colour (HA also sets `rgb_color` in colour-temperature mode, which covers the
  colour-temperature edge case); else the default on colour `#f59e0b` (the plugin's existing
  "on" amber).
- **Off**: `offColor` if set, else `#94a3b8` (slate).
- **Trigger/Service**: `onColor` if set, else `#a78bfa` (lighter variant of the trigger purple).
- **Sensor**: `onColor` if set, else `#5eead4` (teal); warning: `#fb923c` (orange).
- **Contrast** (FR-009): compute the WCAG contrast ratio against the icon-layout background
  `#1e293b`. If it is below 3:1, mix the colour towards white in 10 % steps until ≥ 3:1. A
  near-black RGB light still shows as a visible dark grey.

**Rationale**: Matches the HA frontend (state colour from `rgb_color`), stays readable, and is
deterministic and unit-testable. Brightness-dependent dimming (which the frontend does with a
CSS filter) is left out because the brightness is already shown as a number.

## R-08 Drawing the icon into the key SVG

**Decision**: Insert `<path d="…" fill="#rrggbb" transform="translate(x y) scale(s)"/>` into the
existing 144×144 SVG (no nested `<svg>`, no `viewBox` on inner elements). Layout constants are in
[data-model.md](data-model.md) §5.

**Rationale**: A transformed `<path>` is the most basic SVG feature and the most likely to be
supported by Ulanzi Studio's renderer, which already renders `<rect>`/`<text>` keys sent via
`setBaseDataIcon`. Rendering on the device is still checked in validation (quickstart V-01).

## R-09 Loading icon data and re-rendering

**Decision**: The HA client gets `getIcons(category, integrations?)` and
`listEntityRegistryDisplay()`. After `states_loaded`, the app starts an `IconLoader` that
requests both. When they are done it fills the `IconData` store, which notifies listeners, and
the app re-renders all key actions. Platform icons for newly bound entities are requested lazily
(one request per unknown platform, de-duplicated). On reconnect the data is reloaded. The
previous data is kept until new data arrives, so there is no flicker.

**Rationale**: Icon data is not on the critical path: keys render immediately with fallback
icons and are refined when the data arrives. Failures are logged (warn) and keep the fallback.
They are also made visible to the user: `IconData.available = false` is reported as
`iconsAvailable` in `connection.status`/`connection.changed`, and every PI's connection block
shows a hint (Principle IV: errors visible to the user and logged, never silently swallowed).
The keys themselves are not marked as errors, because they still show valid icons.

## R-10 Property Inspector preview

**Decision**: New PI request `icon.preview` `{ name?: string, entityId?: string }` → reply
`{ found, name, path, source }`. The PI draws the preview itself as a small inline SVG from
`path`. When the override field is empty, it shows the icon that would be used for the bound
entity as a placeholder, with source `ha` or `fallback`.

**Rationale**: Keeps the 2.8 MB icon set out of the PI (the PI is a separate webview page per
open inspector); the main service already holds it.

## R-11 Settings defaults and backwards compatibility

**Decision**: New optional settings fields `showIcon`, `icon`, `onColor` and `offColor`
([contracts/key-icon-settings.md](contracts/key-icon-settings.md)). A missing `showIcon` means
`true` for Toggle, Sensor and Trigger keys and `false` for Service keys. Service keys show an
icon only if `icon` is set (FR-017). No settings migration is needed.

## R-12 Edit mode, errors, confirmation

**Decision**: These keep the text layout of feature 001 unchanged: edit mode, all error states
(disconnected, not found, unavailable, invalid), the "set up" state and the Trigger/Service
"done" confirmation. The icon layout is used only for valid normal states.

**Rationale**: The spec allows a small icon in edit mode but does not require it. Keeping these
states in their distinct text layout is simplest and guarantees FR-013 and FR-014 (YAGNI).
