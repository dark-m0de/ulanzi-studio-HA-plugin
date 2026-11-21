# Implementation Plan: Configurable Dial Press Actions

**Branch**: `002-dial-press-actions` | **Date**: 2026-11-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-dial-press-actions/spec.md`

## Summary

The press of an HA Dial or HA Dynamic Dial becomes configurable. Today both dial types run the
fixed domain action of feature 001 (FR-026). After this feature:

- An **HA Dial** offers a per-dial "action on press". The default stays the domain action.
  Alternatives: switch controlled value, set favourite value, mute, next track, cycle thermostat
  mode or preset, stop/toggle a cover, fan oscillation or preset, call a service, no action.
- An **HA Dynamic Dial** offers end editing (new default), toggle edited entity, switch
  controlled value, or no action.

Technical approach (see [research.md](research.md)):

- A new pure domain module `src/domain/dial-press.js` decides which press actions an entity
  supports and turns a press into an outcome: a service call, a value to set, a local effect
  (end edit, switch value) or an error.
- The adapter dial actions only execute that outcome.
- Values set by a press (favourite value) go through the existing shared `EntityControl`, so
  they get immediate display feedback and share the per-entity rate limit (feature 001, FR-024).
- The active controlled value is runtime state:
  - HA Dial: a field of the dial instance.
  - Dynamic Dial: part of the edit session (`EditSessionBroker.switchAttribute()`), so all
    Dynamic Dials and the edited key follow it.
- Displays name the active value whenever an entity has more than one controllable value.
- The PI gets the list of supported press actions from an extended `entity.capabilities`
  reply.
- No new dependencies.

## Technical Context

**Language/Version**: JavaScript (ES2022, ES modules), Node.js 20.12 runtime (unchanged from feature 001)

**Primary Dependencies**: unchanged: `ulanzideck-api`, `ws`, `common-html`; dev: `esbuild`. No new dependencies.

**Storage**: Ulanzi Studio per-action settings (new optional fields; see [contracts/dial-press-settings.md](contracts/dial-press-settings.md)). The active controlled value is not stored.

**Testing**: `node --test` with the existing harness (fake HA server, fake `$UD`, manual clock); fixtures extended with mute, next-track, HVAC modes, presets, oscillation and a moving cover.

**Target Platform**: Ulanzi Studio ≥ 3.3.0 on Windows/macOS; dial actions on encoder devices (D200X)

**Project Type**: Desktop application plugin (existing project, feature increment)

**Performance Goals**: The display reflects a press within 100 ms of release (SC-002). Value-setting presses share the ≤ 5 calls/s per-entity limit.

**Constraints**:
- Backwards compatible: existing HA Dial settings keep the domain action (FR-002).
- Existing Dynamic Dials switch to end editing (FR-011, intended).
- A press never fires after rotation while pressed (FR-030).
- Unsupported actions are never sent (FR-032).

**Scale/Scope**:
- 11 HA Dial press actions and 4 Dynamic Dial press actions.
- 1 new domain module; changes to `dial.js`, `dynamic-dial.js`, `toggle.js` (edit-mode label), `edit-session.js`, `dial-feedback.js`, `key-model.js`, `pi-handlers.js`, `dial.html`, `dynamic-dial.html` and the locale files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle / Section | Pre-research | Post-design |
|---|---|---|---|
| I | SDK Conformance | ✅ Uses only `onDialDown`/`onDialUp` (already validated on device), `setFeedback`, `setBaseDataIcon`, `toast`, `showAlert` | ✅ No new SDK APIs; manifest unchanged except version |
| II | Layer Separation | ✅ Press decisions are a pure domain module | ✅ `dial-press.js` imports only domain modules; adapter executes outcomes ([data-model.md](data-model.md) §3) |
| III | Test-First | ✅ Unit tests for `dial-press.js`, `edit-session` switch, render captions; integration tests for both dial actions | ✅ Test list in [quickstart.md](quickstart.md); fixtures extended |
| IV | Responsive & Robust | ✅ Favourite value via `EntityControl` (optimistic, throttled); errors visible via `showAlert` and logged | ✅ Disconnected: call outcomes alert, local outcomes still work (spec edge cases) |
| V | Security & Privacy | ✅ No new data leaves the device; service-call validation reuses `parseServiceCall` | ✅ No entity IDs in info/warn logs (same patterns as feature 001) |
| VI | Simplicity | ✅ One registry module, no new dependency, settings are flat PI fields like the long-press option | ✅ Long press on dials explicitly excluded |
| — | Platform Constraints | ✅ All new strings in `en.json`/`de_DE.json` | ✅ Locale test covers new keys automatically |
| — | Licensing | ✅ No new code sources | ✅ |
| — | Development Workflow | ✅ spec-kit flow on branch `002-dial-press-actions`, merged via PR with required checks | ✅ |

**Result**: PASS, no violations.

## Project Structure

### Documentation (this feature)

```text
specs/002-dial-press-actions/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── dial-press-settings.md     # settings fields, PI capabilities extension
│   └── press-action-mapping.md    # press action → capability check → HA service
├── checklists/requirements.md
└── tasks.md                       # /speckit-tasks
```

### Source Code (changes to the feature-001 layout)

```text
src/domain/
├── dial-press.js            # NEW: press action registry, supportedPressActions(), resolvePress(), nextAttribute(), cycleNext()
├── edit-session.js          # + switchAttribute(): next supported value for the session, emits change
├── render/dial-feedback.js  # + optional value caption (name of the controlled value) in DialRender/SVG
└── render/key-model.js      # editModel: status shows the active value name when the entity has ≥ 2 values

src/adapter/
├── actions/dial.js          # press → resolvePress() → execute outcome; runtime activeAttributeId; caption
├── actions/dynamic-dial.js  # pressAction setting (default end_edit), switch via broker
├── actions/toggle.js        # edit-mode key shows the active value name
└── pi-handlers.js           # entity.capabilities + pressActions

plugin/com.ulanzi.hadeck.ulanziPlugin/
├── property-inspector/dial.html          # "Action on press" select, favourite value, service fields
├── property-inspector/dynamic-dial.html  # "Action on press" select
├── en.json, de_DE.json                   # new keys (press actions, value short names, hints)
└── manifest.json                         # Version 0.2.0

tests/
├── support/fixtures/states.json          # extended capabilities (mute, next track, modes, presets, oscillation, moving cover)
├── unit/domain/dial-press.test.js        # NEW
├── unit/domain/edit-session.test.js      # + switchAttribute
├── unit/domain/render/*.test.js          # + captions
└── integration/adapter/dial-press.test.js, dynamic-dial-press.test.js   # NEW
```

**Structure Decision**: Extend the existing single project. The only new source module is
`src/domain/dial-press.js`; everything else changes existing files.

## Complexity Tracking

No constitution violations, so nothing to justify.
