# Implementation Plan: Dynamic Dial for Selected Values

**Branch**: `004-dial-selected-entities` | **Date**: 2026-11-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-dial-selected-entities/spec.md`

## Summary

The HA Toggle key gets a new long-press mode, "Dynamic Dial for selected values". The user picks
an ordered list of *selected values* (entity + controllable value). A long press starts edit
mode for the first usable entry. With two or more entries, a press on the Dynamic Dial jumps to
the next usable entry, wrapping around. The short press and all existing modes are unchanged.

Technical approach (see [research.md](research.md)):

- **Settings**:
  - New `longPress` value `edit_values` and a new field `editValues`.
  - `editValues` is stored as a JSON string `[{ "entityId", "attributeId" }, …]`, written by a
    hidden PI input (R-01).
  - A pure `parseSelectedValues()` validates, normalises and de-duplicates the list.
- **Edit session**:
  - The session gains `targets` (the parsed list) and `targetIndex`. `entityId`/`attributeId`
    always mirror the current target, so the Dynamic Dial, the key rendering and the existing
    controller binding work unchanged (R-02).
  - New broker methods: `startTargets()`, `nextTarget()` and `targetUnusable()`.
  - The broker gets an injected `getEntity` lookup (the entity store), so it can check
    usability (R-03).
- **Usability**: a pure `targetUsable(target, entity)`. The entity must exist and be
  available, the attribute must exist, its domain must match, and `isSupported` must hold.
- **Dynamic Dial**:
  - With two or more targets, a press calls `nextTarget()` instead of resolving the configured
    press action (FR-010). With one target, the existing press path applies (FR-011).
  - The dial shows the value name (caption) whenever there are several targets (FR-012).
  - When the edited entity becomes unusable, the dial reports `targetUnusable()` (FR-015, R-04).
- **Toggle key**:
  - `longPress: 'edit_values'` starts the session with `targets`. An empty list or no usable
    entry raises an alert and toggles nothing (FR-008).
  - In edit mode the key renders the *edited* entity: its name, the value caption and the live
    value from that entity's `EntityControl`.
  - The session ends when `entityId`, `longPress` or the normalised `editValues` change
    (FR-016, R-05).
- **PI**:
  - New mode option and a `data-mode="edit_values"` section, built inline in `toggle.html`:
    entry chips "<name> · <value>" with ✕, the existing entity picker (new `onChoose` option),
    and a value chooser fed by the existing `entity.capabilities` request.
  - `entity.capabilities` additionally returns `friendlyName`, so chips can show names (R-06).
  - `entities.list` gets an optional `controllable: true` filter, so the search only offers
    entities with at least one controllable value (FR-004, R-06).
  - No new shared abstraction: the list UI has one call site (constitution VI).

## Technical Context

**Language/Version**: JavaScript (ES2022, ES modules), Node.js 20.12 runtime (unchanged)

**Primary Dependencies**: no changes. Existing: `ulanzideck-api`, `ws`, `@mdi/js`, `common-html`;
dev: `esbuild`.

**Storage**: Ulanzi Studio per-action settings. The Toggle action gets one new `longPress` value
and one new optional field ([contracts/toggle-selected-values-settings.md](contracts/toggle-selected-values-settings.md)).
No migration.

**Testing**: `node --test` with the existing harness (fake HA server, fake `$UD`, manual clock).
- Unit tests for `parseSelectedValues`, `targetUsable` and the broker methods.
- Integration tests for the Toggle key and the Dynamic Dial.
- Fixtures stay at 15 entities (some tests assert the count). Existing ones suffice:
  - `light.living_room`: brightness
  - `light.desk`: brightness + colour temperature
  - `light.hallway`: on/off only
  - `cover.blinds`: position
  - `media_player.living_room`: volume
  - `input_number.volume_target`
  - `switch.coffee`

**Target Platform**: Ulanzi Studio ≥ 3.3.0 on Windows/macOS; Home Assistant ≥ 2024.1 (unchanged).

**Project Type**: Desktop application plugin (existing project, feature increment)

**Performance Goals**: a jump re-renders the dial and the key synchronously in the same event
turn, so there is no perceptible delay (SC-002). The jump itself sends no HA call.

**Constraints**:
- Backwards compatible: existing modes and settings behave identically (SC-005).
- No new controllable values or entity types (spec clarification).
- No entity IDs in logs above debug level (Principle V).

**Scale/Scope**:
- Domain: new `src/domain/selected-values.js`; changes to `edit-session.js`.
- Adapter: `actions/toggle.js`, `actions/dynamic-dial.js`, `app.js` (broker `getEntity`
  injection, log line), `pi-handlers.js` (`friendlyName`, `controllable` filter).
- PI: `toggle.html`, `shared.js` (picker option), `shared.css` (chips).
- Locales: `en.json`, `de_DE.json`.
- Manifest version 0.4.0.
- Typical list of up to 6 entries, with no hard limit.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle / Section | Pre-research | Post-design |
|---|---|---|---|
| I | SDK Conformance | ✅ Only existing SDK calls (`setBaseDataIcon`, `setFeedback`, `showAlert`, `toast`, PI settings and messaging) | ✅ No new SDK APIs or manifest entries; only the version changes |
| II | Layer Separation | ✅ Parsing, usability and target switching are pure domain logic | ✅ `selected-values.js` and `EditSessionBroker` live in `src/domain`. The broker receives `getEntity` as an injected function, not the store module. The architecture test still applies. |
| III | Test-First | ✅ Unit tests for the parser and the broker (manual clock for the timeout) come before the code | ✅ Test list in [quickstart.md](quickstart.md) §1 |
| IV | Responsive & Robust | ✅ A jump is local and immediate. Unusable targets are skipped, never crash. | ✅ Errors are visible: the key alerts on an empty or unusable list. A lost target moves on or ends edit mode with a logged reason. |
| V | Security & Privacy | ✅ No new hosts or data | ✅ Log lines contain only counts and reasons, no IDs. PI chips are built with `textContent`, never `innerHTML` with entity data. |
| VI | Simplicity | ✅ No new dependency, no new controllable values | ✅ The list UI is inline in `toggle.html` (one call site, no shared abstraction). The picker only gets an `onChoose` option. The broker is extended instead of adding a second session type. |
| — | Platform Constraints | ✅ New strings in `en.json`/`de_DE.json` | ✅ The locale test covers the new keys ([contract](contracts/toggle-selected-values-settings.md) §5) |
| — | Licensing | ✅ No third-party code | ✅ Unchanged |
| — | Development Workflow | ✅ spec-kit flow on branch `004-dial-selected-entities` (still to be created), merged via PR | ✅ Version 0.4.0 (SemVer minor), Conventional Commits |

**Result**: PASS, no violations.

## Project Structure

### Documentation (this feature)

```text
specs/004-dial-selected-entities/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── toggle-selected-values-settings.md   # setting, PI section, capabilities change, locale keys
│   └── edit-session-targets.md              # parser, usability, broker API, adapter obligations
├── checklists/requirements.md
└── tasks.md                                 # /speckit-tasks
```

### Source Code (changes to the existing layout)

```text
src/domain/
├── selected-values.js       # NEW: parseSelectedValues(), targetUsable(), sameTarget()
└── edit-session.js          # + getEntity option; startTargets(), nextTarget(), targetUnusable();
                             #   session.targets / targetIndex

src/adapter/
├── app.js                   # EditSessionBroker({ clock, getEntity: store.get }); log "(n/N)" on target changes
├── pi-handlers.js           # entity.capabilities: + friendlyName; entities.list: + controllable filter
└── actions/
    ├── toggle.js            # longPress 'edit_values'; render edited target; settings-change rule
    └── dynamic-dial.js      # press → nextTarget() with ≥2 targets; caption with ≥2 targets;
                             #   targetUnusable() on lost entity

plugin/com.ulanzi.hadeck.ulanziPlugin/
├── property-inspector/toggle.html   # + mode option, edit_values section (inline list UI)
├── property-inspector/shared.js     # mountEntityPicker({ onChoose, clearOnChoose, controllable })
├── property-inspector/shared.css    # chip styles
├── en.json, de_DE.json              # new keys
└── manifest.json                    # Version 0.4.0

tests/
├── unit/domain/selected-values.test.js        # NEW
├── unit/domain/edit-session.test.js           # target methods
├── integration/adapter/toggle-selected-values.test.js   # NEW
├── integration/adapter/dynamic-dial.test.js   # jump, caption, lost target
├── integration/adapter/pi-bridge-capabilities.test.js   # friendlyName
└── integration/adapter/pi-bridge-entities.test.js       # controllable filter
```

**Structure Decision**: This is an increment on the existing three-layer structure
(`src/ha`, `src/domain`, `src/adapter`). There is one new domain module and no new adapter
modules.

## Complexity Tracking

No constitution violations to justify.
