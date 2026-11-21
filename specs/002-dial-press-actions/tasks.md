---
description: "Task list for configurable dial press actions"
---

# Tasks: Configurable Dial Press Actions

**Input**: Design documents from `/specs/002-dial-press-actions/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution Principle III (Test-First, NON-NEGOTIABLE) applies. Write each test task first and confirm it **fails** before the matching implementation task.

**Organization**: Tasks are grouped by user story (US1–US4 from spec.md) so each story can be implemented and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: User story from spec.md (US1–US4)

## Path Conventions

- Existing feature-001 layout: `src/ha/`, `src/domain/`, `src/adapter/`, `plugin/com.ulanzi.hadeck.ulanziPlugin/` (abbreviated `plugin/…/`), `tests/`
- Layer rule (Principle II): `src/domain/dial-press.js` imports only other `src/domain/` modules
- Existing test helpers: `tests/support/app-harness.js` (fake `$UD` + fake HA server + manual clock), `tests/support/fixtures/states.json`

---

## Phase 1: Setup

**Purpose**: Version bump and test fixtures for the new capabilities

- [X] T001 Bump the version to `0.2.0` with `npm version 0.2.0 --no-git-tag-version` (updates `package.json` and `package-lock.json`) and set `"Version": "0.2.0"` in `plugin/com.ulanzi.hadeck.ulanziPlugin/manifest.json` (research R-09)
- [X] T002 [P] Extend the HA state fixtures in `tests/support/fixtures/states.json` for [press-action-mapping.md](contracts/press-action-mapping.md). **Change attributes of existing entities only, do not add entities**: several feature-001 tests assert exactly 15 entities.
  - `media_player.living_room`: add the NEXT_TRACK bit (32) to `supported_features` (VOLUME_MUTE 8 is already set) and add `"is_volume_muted": false`
  - `climate.office`: add the PRESET_MODE bit (16) to `supported_features`, plus `"hvac_modes": ["off", "heat", "auto"]`, `"preset_modes": ["comfort", "eco", "away"]` and `"preset_mode": "comfort"`
  - `fan.bedroom`: set `supported_features` to `11` (SET_SPEED 1 + OSCILLATE 2 + PRESET_MODE 8), plus `"oscillating": false`, `"preset_modes": ["auto", "sleep"]` and `"preset_mode": "auto"`
  - `cover.blinds` (15 = OPEN, CLOSE, SET_POSITION, STOP): unchanged; tests simulate movement via `emitStateChanged` with state `opening`
  - Then run `npm test` and confirm every feature-001 test still passes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The press-action registry skeleton, `DialController.setValue`, and the outcome-executing press pipeline in the HA Dial. All stories depend on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests first (must fail before the implementation below)

- [X] T003 [P] Write `tests/unit/domain/dial-press.test.js` for the registry core in [data-model.md](data-model.md) §2–§4:
  - `cycleNext(list, current)`: next element, wrap-around after the last element, first element for an unknown or missing `current`
  - `nextAttribute(entity, currentId)`: for `light.desk` brightness → colour temperature → brightness; `null` for single-value entities (`light.living_room`, `climate.office`)
  - `resolvePress(entity, { pressAction: 'nope' }, { kind: 'fixed', attributeId })` → `{ type: 'error', key: 'error.unsupportedPress' }`
  - `supportedPressActions(entity, { kind, attributeId })` returns ids in registry order and only for the given kind
- [X] T004 [P] Extend `tests/unit/domain/dial-controller.test.js` with `setValue(raw)`:
  - it clamps and rounds like rotation (`light.desk` colour temperature 9000 → 6500; `input_number.volume_target` 4.2 → 4)
  - it switches a light that is off on (`turn_on` with `brightness_pct`)
  - it sets the optimistic value immediately (`displayValue()`)
  - it shares the per-entity throttle with rotation (rotate, then `setValue` in the same 200 ms window → second call only after the window)
  - an unsupported attribute or missing entity returns `null` and sends nothing
- [X] T005 [P] Write `tests/integration/adapter/dial-press.test.js` (fake `$UD` and fake HA server via `createHarness`), first cases only:
  - an HA Dial **without** `pressAction` keeps the feature-001 default on press: `light.toggle`, `media_player.media_play_pause` (FR-002)
  - a saved `pressAction` the entity does not support (`mute` on a light) → `showAlert` plus one `logMessage` at `warn` without entity IDs, and no service call (FR-032)
  - a press after rotating while pressed (`dialdown`, `dialrotate` with `hold-right`, `dialup`) triggers no press action (FR-030)
  - holding the dial pressed without rotating (`dialdown`, `clock.tick(2000)`, `dialup`) behaves like a normal press on release (FR-035)

### Implementation

- [X] T006 Implement the registry core in `src/domain/dial-press.js`:
  - exports `cycleNext`, `nextAttribute`, `supportedPressActions`, `resolvePress` and the `PRESS_ACTIONS` registry ([data-model.md](data-model.md) §4)
  - for now only the `default` (via `pressActionFor` from `src/domain/press-actions.js`) and `none` entries for kind `fixed`
  - unknown or unsupported actions resolve to `error.unsupportedPress` (the later `switch_value` entry is the one exception: it always resolves, see T024)
  - done when T003 passes
- [X] T007 [P] Add `setValue(raw)` to `DialController` in `src/domain/dial-controller.js`: same path as `rotate` (`attribute.toServiceCall` → `EntityControl.setTarget`), returns the new value or `null` (research R-03). Done when T004 passes.
- [X] T008 Refactor the press handling in `src/adapter/actions/dial.js` (depends on T006, T007):
  - `onDialUp` (unchanged press detection) calls `handlePress()`
  - `handlePress()` calls `resolvePress(entity, settings, { kind: this.dialKind, attributeId: this.activeAttributeId })` and `executeOutcome(outcome)`
  - `executeOutcome` per [data-model.md](data-model.md) §3:
    - `call` → `client.callService`, on error `showAlert` plus a warn log
    - `set_value` → `controller.setValue`
    - `error` → `showAlert` plus a warn log with the key only
    - `end_edit` / `switch_value` → overridable hooks that do nothing yet
    - `none` → nothing
  - `call` and `set_value` require a connection, otherwise `showAlert` (research R-08)
  - add getter `dialKind` (`'fixed'`) and runtime field `activeAttributeId` (initially `settings.attributeId`, reset in `onSettings`)
  - done when T005 and all existing `tests/integration/adapter/dial.test.js` cases pass

**Checkpoint**: Press handling runs through the registry with unchanged behaviour. Every feature-001 test is green.

---

## Phase 3: User Story 1 – Press the Dynamic Dial to finish editing (Priority: P1) 🎯 MVP

**Goal**: A Dynamic Dial press ends edit mode by default. "Toggle edited entity" and "No action" are selectable.

**Independent Test**: Long-press a light key, rotate the Dynamic Dial, press it. Edit mode ends, the light keeps its brightness and is not toggled ([quickstart.md](quickstart.md) scenario 1).

### Tests for User Story 1 ⚠️ write first, must fail

- [X] T009 [P] [US1] Extend `tests/unit/domain/dial-press.test.js` with the kind `dynamic` entries ([press-action-mapping.md](contracts/press-action-mapping.md), Dynamic Dial table):
  - a missing `pressAction` → `{ type: 'end_edit' }`
  - `toggle` → a `call` from `pressActionFor` (`error.unsupportedPress` if null)
  - `none` → `{ type: 'none' }`
  - `supportedPressActions(entity, { kind: 'dynamic' })` → `['end_edit', 'toggle', 'switch_value', 'none']` (`switch_value` is listed only when the entity has ≥ 2 values, so `light.living_room` yields `['end_edit', 'toggle', 'none']`; the list is informational, the Dynamic Dial PI always offers all four)
- [X] T010 [P] [US1] Write `tests/integration/adapter/dynamic-dial-press.test.js` (FR-010–FR-013, SC-004):
  - default settings: a press during edit ends edit mode, sends no service call, the key shows its normal style and the dial the idle hint
  - `pressAction: 'toggle'`: the edited light is toggled and edit mode continues
  - `pressAction: 'none'`: nothing happens and edit mode continues
  - without edit mode a press does nothing for every setting
  - a Dynamic Dial added with settings `{}` (as saved by 0.1.x) behaves like `end_edit`
  - press after hold-rotate: no action
- [X] T011 [US1] Update the existing case "a Dynamic Dial press during edit runs the press action on the edited entity" in `tests/integration/adapter/dynamic-dial.test.js` so that it adds the Dynamic Dial with `{ pressAction: 'toggle' }`, because the default changes (FR-011)

### Implementation for User Story 1

- [X] T012 [US1] Add the kind `dynamic` entries `end_edit`, `toggle` and `none` to `src/domain/dial-press.js` so that T009 passes (`switch_value` follows in US3)
- [X] T013 [US1] In `src/adapter/actions/dynamic-dial.js`:
  - override `dialKind` (`'dynamic'`) and `activeAttributeId` (= `session.attributeId`)
  - implement the `end_edit` hook as `this.app.editSession.end('dial_press')`
  - keep "idle dials ignore presses" (FR-013)
  - remove the old `press()` override
  - done when T010 and T011 pass
- [X] T014 [US1] Add an "Action on press" select (`name="pressAction"`; options `end_edit` (default, first), `toggle`, `switch_value`, `none`) to `plugin/…/property-inspector/dynamic-dial.html`, with `data-localize` labels
- [X] T015 [P] [US1] Add the keys `pi.press`, `pi.press.end_edit`, `pi.press.toggle`, `pi.press.switch_value`, `pi.press.none` and `error.unsupportedPress` to `plugin/…/en.json` and `plugin/…/de_DE.json`

**Checkpoint**: The Dynamic Dial press finishes editing by default. This MVP increment can ship on its own.

---

## Phase 4: User Story 2 – Choose what pressing an HA Dial does (Priority: P1)

**Goal**: Per-HA-Dial press action: default, set favourite value, call a service, no action.

**Independent Test**: A brightness dial with favourite value 100: a press sets 100 % and the display shows it immediately ([quickstart.md](quickstart.md) scenario 2).

### Tests for User Story 2 ⚠️ write first, must fail

- [X] T016 [P] [US2] Extend `tests/unit/domain/dial-press.test.js` with the kind `fixed` entries:
  - `favorite` → `{ type: 'set_value', raw: 100 }` for `favoriteValue: '100'`; an empty or non-numeric value → `error.invalidFavorite`; offered only when the active attribute is supported
  - `service` → a `call` from `pressDomain` / `pressServiceName` / `pressTarget` / `pressData` (same validation as `parseServiceCall`); invalid → `error.invalidService`
  - `default` is not offered when `pressActionFor` returns null (`input_number.volume_target`)
  - `none` is always offered
- [X] T017 [P] [US2] Extend `tests/integration/adapter/dial-press.test.js` (FR-003–FR-006, SC-002):
  - favourite 100 on `light.living_room` brightness: `light.turn_on {brightness_pct: 100}` and `setFeedback` with 100 % emitted synchronously in the `dialup` handler
  - with the light off, the same press turns it on
  - favourite 2700 on `light.desk` colour temperature → `color_temp_kelvin: 2700`; favourite 1000 → clamped to 2200
  - favourite 4 on `input_number.volume_target` → `input_number.set_value {value: 4}`
  - `service` with a valid configuration → exactly that call; with invalid JSON → `showAlert` and no call
  - `none` → no call
  - while disconnected, `favorite` and `service` → `showAlert` and no call
  - `service` with a valid configuration but an error answer from HA (`server.failNextCall()`) → `showAlert` and one `logMessage` at `warn` level without entity IDs (FR-033)
- [X] T018 [P] [US2] Extend `tests/integration/adapter/pi-bridge-capabilities.test.js`: `entity.capabilities` returns `pressActions` keyed by attribute id ([dial-press-settings.md](contracts/dial-press-settings.md)). For `light.desk` both attributes list `default`, `switch_value`, `favorite`, `service`, `none`; for `light.living_room` brightness lists `default`, `favorite`, `service`, `none`.

### Implementation for User Story 2

- [X] T019 [US2] Add the kind `fixed` entries `favorite` and `service` (reusing `parseServiceCall` from `src/domain/service-call.js`) to `src/domain/dial-press.js` so that T016 passes
- [X] T020 [US2] Make sure `src/adapter/actions/dial.js` executes `set_value` through `controller.setValue` (connection required) and renders immediately, so that T017 passes
- [X] T021 [US2] Add `pressActions` to the `entity.capabilities` handler in `src/adapter/pi-handlers.js` (via `supportedPressActions(entity, { kind: 'fixed', attributeId })` for each supported attribute) so that T018 passes
- [X] T022 [US2] Extend `plugin/…/property-inspector/dial.html`:
  - an "Action on press" select (`name="pressAction"`) filled from `capabilities.pressActions[attributeId]`; it refills when the entity or attribute changes and falls back to `default` (and saves) when the saved action is not offered (FR-031)
  - a favourite value number field (`name="favoriteValue"`, placeholder shows unit and range from `capabilities.attributes`), visible only for `favorite`
  - service fields `pressDomain`, `pressServiceName`, `pressTarget`, `pressData` with inline JSON validation, visible only for `service` (same pattern as the long-press fields in `toggle.html`)
- [X] T023 [P] [US2] Add the keys `pi.press.default`, `pi.press.favorite`, `pi.press.service`, `pi.favoriteValue`, `pi.favoriteRange` (with `{min}`, `{max}`, `{unit}`), `error.invalidFavorite` and `error.invalidService` to `plugin/…/en.json` and `plugin/…/de_DE.json`

**Checkpoint**: HA Dial presses are configurable. Existing dials behave as before.

---

## Phase 5: User Story 3 – Switch the controlled value by pressing (Priority: P2)

**Goal**: A press switches between the entity's controllable values (e.g. brightness ↔ colour temperature) for an HA Dial and, session-wide, for Dynamic Dials. Displays name the active value.

**Independent Test**: An HA Dial on `light.desk` with "Switch controlled value": a press shows the colour temperature caption and rotation changes colour temperature; another press switches back ([quickstart.md](quickstart.md) scenario 3).

### Tests for User Story 3 ⚠️ write first, must fail

- [X] T024 [P] [US3] Extend `tests/unit/domain/dial-press.test.js`: `switch_value` is **listed** by `supportedPressActions` for both kinds only when the entity has ≥ 2 controllable values, but `resolvePress` **always** returns `{ type: 'switch_value' }` for it, also for single-value entities (never `error.unsupportedPress`; FR-025, FR-032 exception)
- [X] T025 [P] [US3] Extend `tests/unit/domain/edit-session.test.js` with `switchAttribute(entity)` ([data-model.md](data-model.md) §6):
  - brightness → colour temperature → brightness for `light.desk`
  - emits a change with reason `switched_value`
  - returns `false` and changes nothing for single-value entities or when idle
  - a new `start()` uses `editAttributeFor()` again (FR-023)
- [X] T026 [P] [US3] Extend `tests/unit/domain/render/dial-feedback.test.js` and `tests/unit/domain/render/key-model.test.js` (FR-021, research R-05):
  - `dialRender` accepts an optional `caption`; `dialSvg` draws it as a small text line above the value and draws nothing extra when it is absent
  - `editModel` puts an optional `caption` into `status`
- [X] T027 [P] [US3] Extend `tests/integration/adapter/dial-press.test.js` and `tests/integration/adapter/dynamic-dial-press.test.js`:
  - HA Dial on `light.desk` with `switch_value`: the first press shows the colour-temperature caption, rotation sends `color_temp_kelvin`, the second press switches back to brightness
  - on `light.living_room` a press sends `toast(hint.noOtherValue)` and changes nothing
  - `paramfromplugin` with new settings resets to the configured attribute (FR-024)
  - entities with ≥ 2 values always show a caption; single-value entities show none
  - Dynamic Dial with `switch_value` in edit mode of `light.desk`: all Dynamic Dials and the source key switch together and show the caption (FR-022)
  - after the session ends and restarts, it starts with brightness
  - Dynamic Dial with `switch_value` in edit mode of `light.living_room` (single value): a press sends `toast(hint.noOtherValue)`, no `showAlert`, and the session keeps brightness
  - two HA Dials on `light.desk`, both with `switch_value`: pressing one switches only that dial; the other keeps controlling and showing brightness (spec edge case)
  - while disconnected, `switch_value` and `none` on an HA Dial still work locally (caption changes, no `showAlert`, no call) (spec edge case)

### Implementation for User Story 3

- [X] T028 [US3] Add `switch_value` for both kinds to `src/domain/dial-press.js` so that T024 passes
- [X] T029 [US3] Add `switchAttribute(entity)` to `EditSessionBroker` in `src/domain/edit-session.js` (uses `nextAttribute`) so that T025 passes
- [X] T030 [P] [US3] Add the optional `caption` to `src/domain/render/dial-feedback.js` (`dialRender` parameter and field, `dialSvg` small line above the value) and to `editModel` in `src/domain/render/key-model.js`, so that T026 passes
- [X] T031 [US3] In `src/adapter/actions/dial.js`:
  - implement the `switch_value` hook: `nextAttribute(entity, activeAttributeId)` → set `activeAttributeId` and call `bindControl()` and `render()`; with no other value, `toast(t('hint.noOtherValue'))`
  - `bindControl()` and `buildRender()` use `activeAttributeId`
  - pass `caption: t('attr.short.' + activeAttributeId)` when `supportedAttributes(entity).length >= 2`
- [X] T032 [US3] Implement the `switch_value` hook in `src/adapter/actions/dynamic-dial.js` as `editSession.switchAttribute(entity)` (toast `hint.noOtherValue` when it returns `false`). In `src/adapter/actions/toggle.js`, pass the same caption to `editModel` while the key is the edit source and the entity has ≥ 2 values. Done when T027 passes.
- [X] T033 [P] [US3] Add the keys `attr.short.<attributeId>` for all 7 attributes (e.g. "Bright." / "Hellig.", "Colour" / "Farbtemp.") and `hint.noOtherValue` to `plugin/…/en.json` and `plugin/…/de_DE.json`, and add `'attr.short.'` with the 7 attribute ids to the `DYNAMIC` map in `tests/unit/locales.test.js`

**Checkpoint**: One dial can control brightness and colour temperature.

---

## Phase 6: User Story 4 – Domain-specific press actions (Priority: P3)

**Goal**: Mute, next track, cycle thermostat mode or preset, stop/toggle a cover, fan oscillation or preset.

**Independent Test**: An HA Dial on the media player with "Mute on/off": a press mutes, another press unmutes ([quickstart.md](quickstart.md) scenario 4).

### Tests for User Story 4 ⚠️ write first, must fail

- [X] T034 [P] [US4] Extend `tests/unit/domain/dial-press.test.js` for every row of the HA Dial table in [press-action-mapping.md](contracts/press-action-mapping.md), using the fixtures from T002:
  - `mute` (inverts `is_volume_muted`)
  - `next_track`
  - `hvac_cycle` (`heat` → `auto`, wraps to `off`)
  - `preset_cycle` for climate (`comfort` → `eco`) and fan (`auto` → `sleep` → `auto`)
  - `cover_stop_toggle` (state `opening` → `stop_cover`, `open` → `toggle`)
  - `oscillate` (inverts `oscillating`)
  - each action is not offered for an entity without the capability (e.g. `mute` for `light.living_room`, `cover_stop_toggle` for `cover.garage`)
  - a saved but unsupported action → `error.unsupportedPress`
- [X] T035 [P] [US4] Extend `tests/integration/adapter/dial-press.test.js`:
  - one press per action sends exactly the expected service call and data
  - the cover case first emits `state_changed` with `opening` and expects `cover.stop_cover`

### Implementation for User Story 4

- [X] T036 [US4] Add the entries `mute`, `next_track`, `hvac_cycle`, `preset_cycle`, `cover_stop_toggle` and `oscillate` (kind `fixed`) to `src/domain/dial-press.js`, with the capability checks from research R-02, so that T034 and T035 pass
- [X] T037 [P] [US4] Add the keys `pi.press.mute`, `pi.press.next_track`, `pi.press.hvac_cycle`, `pi.press.preset_cycle`, `pi.press.cover_stop_toggle` and `pi.press.oscillate` to `plugin/…/en.json` and `plugin/…/de_DE.json`. Confirm that `dial.html` lists them through `capabilities.pressActions` without further changes.

**Checkpoint**: All press actions from the spec are available.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T038 [P] Update `README.md`:
  - in the features table, mention the configurable dial press for HA Dial and HA Dynamic Dial
  - in "Use only one Dynamic Dial", describe the new default "press = end editing"
- [X] T039 [P] Write `specs/002-dial-press-actions/release-notes.md` for 0.2.0: the new press actions, and the behaviour change that Dynamic Dial presses now end editing (toggle is selectable). Use it as the PR description and for the GitHub release notes.
- [X] T040 Run `npm test`. Confirm that all tests pass, that line coverage of `src/domain/dial-press.js` and the changed domain modules is ≥ 90 %, and that the locale and architecture tests cover the new keys and module.
- [X] T041 Run `npm run build` and the bundle test (`tests/integration/bundle.test.js`), then `npm run package`. Confirm that the zip still starts outside the repository.
- [ ] T042 Run device scenarios 1–5 from [quickstart.md](quickstart.md) on a D200X and record them in `specs/002-dial-press-actions/validation.md` (SC-001, SC-003, SC-005)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: none. T002 must leave the feature-001 tests green.
- **Foundational (Phase 2)**: depends on Setup and blocks all stories (registry, `setValue`, outcome pipeline).
- **US1 (Phase 3)**: depends on Foundational.
- **US2 (Phase 4)**: depends on Foundational; independent of US1 (different registry entries, `dial.html` vs `dynamic-dial.html`).
- **US3 (Phase 5)**: depends on Foundational. The Dynamic Dial part (T032) needs the `dynamic` kind from US1 (T012, T013). Both stories touch `dial-press.js` and the dial actions, so implement US3 after US1/US2 or merge carefully.
- **US4 (Phase 6)**: depends on Foundational and T002. The PI part relies on `pressActions` from US2 (T021, T022).
- **Polish (Phase 7)**: after the desired stories.

```text
Setup → Foundational ─┬─► US1 ───────┐
                      ├─► US2 ──┬────┼─► US3 ─┐
                      │         └────┼────────┼─► US4 ─► Polish
                      └──────────────┘        │
```

### Within each story

- Tests first; confirm they fail.
- Domain (`dial-press.js`, `edit-session.js`, render) before adapter (`dial.js`, `dynamic-dial.js`, `toggle.js`) before PI and locales.
- `src/domain/dial-press.js` is edited by T006, T012, T019, T028 and T036. Do these sequentially.

## Parallel Opportunities

- **Setup**: T001 ∥ T002
- **Foundational**: tests T003 ∥ T004 ∥ T005; then T006 ∥ T007, then T008
- **US1**: T009 ∥ T010 ∥ T011; T015 alongside the implementation
- **US2**: T016 ∥ T017 ∥ T018; T021 ∥ T023 after T019
- **US3**: T024 ∥ T025 ∥ T026 ∥ T027; T029 ∥ T030 ∥ T033 after T028
- **US4**: T034 ∥ T035; T037 alongside T036
- **Polish**: T038 ∥ T039

## Parallel Example: User Story 3

```bash
# Tests together (they must fail first):
Task: "Extend tests/unit/domain/dial-press.test.js with switch_value"
Task: "Extend tests/unit/domain/edit-session.test.js with switchAttribute"
Task: "Extend render tests with caption"
Task: "Extend dial-press and dynamic-dial-press integration tests"

# Independent implementations after T028:
Task: "Add switchAttribute to src/domain/edit-session.js"
Task: "Add caption to src/domain/render/dial-feedback.js and key-model.js"
Task: "Add attr.short.* and hint.noOtherValue locale keys"
```

## Implementation Strategy

### MVP first

1. Phase 1 and Phase 2: no visible change, everything still green.
2. Phase 3 (US1): Dynamic Dial press = end editing. **Stop and validate** on the device (scenario 1, SC-001).

### Incremental delivery

1. + US2: favourite value, service and no action for HA Dials
2. + US3: switch the controlled value (light controller in one dial)
3. + US4: mute, next track, modes, presets, cover stop, oscillation
4. Polish: README, release notes, device validation, release 0.2.0

### Notes

- Commit per task or logical group with Conventional Commits (`test:`, `feat:`).
- Merge via a pull request into `main`; the required check "All tests passed" must be green.
