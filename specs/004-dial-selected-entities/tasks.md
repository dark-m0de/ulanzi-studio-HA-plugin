---
description: "Task list for Dynamic Dial for selected values"
---

# Tasks: Dynamic Dial for Selected Values

**Input**: Design documents from `/specs/004-dial-selected-entities/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution Principle III (Test-First, NON-NEGOTIABLE) applies. Write each test task first and confirm it **fails** before you start the matching implementation task.

**Organization**: Tasks are grouped by user story (US1–US3 from spec.md), so each story can be implemented and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: User story from spec.md (US1–US3)

## Path Conventions

- **Layout**: `src/domain/`, `src/adapter/`, `plugin/com.ulanzi.hadeck.ulanziPlugin/` (written
  as `plugin/…/` below), `tests/`.
- **Layer rule (Principle II)**: `src/domain/*` must not import `src/adapter/`, `src/ha/`,
  `node:*` or the SDK. `tests/unit/architecture.test.js` enforces this.
- **Test helpers**:
  - `tests/support/app-harness.js` (`createHarness`, `h.piRequest`; `h.ud.emitAction`,
    `h.ud.lastCall`, `h.ud.callsOf`; `h.server.messages('call_service')`,
    `h.server.emitStateChanged`; `h.clock.tick`)
  - `tests/support/manual-clock.js`
  - `tests/support/fixtures/index.js` (`loadStates`, `rawState`)
  - Key/dial helpers (`addKey`, `addDynamic`, `holdKey`, `releaseKey`, `rotateDynamic`,
    `keyIcon`, `dialSvgOf`) are defined locally in
    `tests/integration/adapter/dynamic-dial.test.js`; copy what a new test file needs.
  - The harness does **not** capture log output, so log lines are checked by review (T026).
- **Fixtures**: `tests/support/fixtures/states.json` has 15 entities, and several tests assert
  exactly 15, so **do not add entities**. Use:
  - `light.living_room`: brightness only, 40 %
  - `light.desk`: brightness + colour temperature
  - `light.hallway`: on/off only
  - `switch.coffee`, `cover.blinds` (position), `media_player.living_room` (volume),
    `input_number.volume_target`
- **JSON in settings**: `editValues` is a JSON **string**. In tests, build it with
  `JSON.stringify([...])`.

---

## Phase 1: Setup

**Purpose**: Branch and version.

- [X] T001 *(Implemented on the existing branch `004-dial-selected-values`, no new branch.)* Bump the version to `0.4.0` with `npm version 0.4.0 --no-git-tag-version` (updates `package.json` and `package-lock.json`) and set `"Version": "0.4.0"` in `plugin/…/manifest.json`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Selected-value parsing, the usability check and the target-aware edit session.
Every story needs them. There is no visible change yet: no key calls `startTargets`.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests first (must fail before the implementation below)

- [X] T002 [P] Create `tests/unit/domain/selected-values.test.js` covering every row of [contracts/edit-session-targets.md](contracts/edit-session-targets.md) §1 (`parseSelectedValues`) and §2 (`targetUsable`). Use `EntityStore` + `loadStates()` for entity states; for the unavailable case mutate `light.desk` to `state: 'unavailable'`.
- [X] T003 [P] Extend `tests/unit/domain/edit-session.test.js` (contract §3):
  - change `setup()` to `new EditSessionBroker({ clock, getEntity: (id) => store.get(id) })`
  - update the two existing `deepEqual(broker.session, …)` assertions to include `targets: []` and `targetIndex: -1`
  - add one test per scenario row of contract §3: `startTargets` (skip unusable first entry, `ineligible` for empty/unusable with and without dial, `no_dial`, `switched`), `nextTarget` (order, wrap-around, skip an unavailable entry via a mutated store state, `false` with no other usable entry, `false` in classic mode, timer re-arm checked with `clock.tick(9_000)` before and after), `targetUnusable` (current → moves on; current with none left → ends with `unavailable`; not current → no change), `entityUnavailable` delegating in target mode, a fresh `startTargets` starting again at the first usable index, and `switchAttribute` with exactly one target

### Implementation

- [X] T004 [P] Create `src/domain/selected-values.js` (research R-01/R-03, data-model §1–§3):
  - `parseSelectedValues(value)`: accepts a JSON string or an array; keeps objects with a trimmed non-empty `entityId` and a known `attributeId` (`getAttribute`); de-duplicates pairs in order; returns `[]` on any error
  - `targetUsable(target, entity)`: entity present, `!isUnavailableState(entity)` (from `./entity-store.js`), attribute known, domain matches, `isSupported(entity)`
  - `sameTarget(a, b)`
  - Done when T002 passes.
- [X] T005 Extend `src/domain/edit-session.js` (research R-02/R-03, data-model §4):
  - constructor `{ clock, getEntity = () => null }`
  - classic `start()` sets `targets: []` and `targetIndex: -1`
  - `startTargets({ sourceContext, targets })`: first usable index, otherwise `ineligible`; then the `no_dial` check; set `entityId`/`attributeId` from the target; arm the timer; emit `started`/`switched`
  - `nextTarget()`: forward search with wrap-around, excluding the current index; on success update the session, re-arm the timer, emit `switched_target`, return `true`; otherwise `false`
  - `targetUnusable(entityId, attributeId)`: act only on a matching current target; move on (emit `switched_target`) or `end('unavailable')`
  - `entityUnavailable(id)`: delegate to `targetUnusable(id)` when `targets.length > 0`
  - `switchAttribute` keeps `targets`/`targetIndex` (spread)
  - update the `EditSession` typedef
  - Done when T003 passes.
- [X] T006 In `src/adapter/app.js`:
  - construct the broker with `getEntity: (id) => store.get(id)`
  - extend the `editSession.onChange` info log: `switched_target` → `edit mode switched target (i/N)`; `started`/`switched` with targets → append ` (i/N)`; no IDs (research R-07)
  - Run `npm test`: everything green.

**Checkpoint**: `npm test` is green. Behaviour is identical to 0.3.0.

---

## Phase 3: User Story 1 - Long press edits a selected value instead of the key's own entity (Priority: P1) 🎯 MVP

**Goal**: The new long-press mode `edit_values` with a single selected value. A long press edits
that value with the Dynamic Dial, and the key shows the edited entity. The short press still
toggles the key's own entity. Existing modes are unchanged. The PI gets the mode option and a
first, plain version of the value field.

**Independent Test**:
1. In the harness, add a `switch.coffee` key with `longPress: 'edit_values'` and `editValues`
   = `[desk/brightness]`, then hold it for 500 ms.
2. Rotate the Dynamic Dial right: exactly one `light.turn_on` goes to `light.desk`, and there
   is no `switch.*` call.
3. The key SVG shows `EDIT`, `Desk` and the desk value.

On the device: quickstart V-01, V-02.

### Tests first

- [X] T007 [P] [US1] Create `tests/integration/adapter/toggle-selected-values.test.js` ([contract](contracts/toggle-selected-values-settings.md) §2, [contract](contracts/edit-session-targets.md) §4). Use the key `switch.coffee`, `longPress: 'edit_values'` and `addDynamic()`:
  - `[desk/brightness]`: holding shows `>EDIT<` with the desk friendly name and value; `rotateDynamic('left')` sends `light.turn_on` with target `light.desk`; no `switch.*` call
  - the key label is ignored in this mode: with `label: 'Coffee'` the edit SVG still shows the desk name
  - short press ends the session (the Dynamic Dial shows the idle hint); the next short press sends `switch.toggle` for `switch.coffee`
  - `editValues` missing, `''`, `'not json'` and `[hallway/brightness]` (unsupported) → `showAlert` on the key, no `call_service`, no session
  - a value that is not the entity's default: `[desk/color_temp]` → rotating sends `color_temp_kelvin`
  - `[input_number.volume_target/number.value]` works (a domain outside the classic edit mode)
  - settings change while the key is the source:
    - re-sending identical settings (same JSON, also with an extra space inside an `entityId`) keeps the session
    - changing `editValues` ends it
    - changing `longPress` to `edit` ends it
  - classic `longPress: 'edit'` and a missing `longPress` on `light.living_room` behave as before (it edits its own entity)
  - a value of the key's own entity is also selected: a `light.living_room` key with `[living_room/brightness, desk/brightness]` edits the living room first. When `light.living_room` becomes unavailable while it is the current target, the session moves to `light.desk` instead of ending (the key's `entityUnavailable` delegates to `targetUnusable`).
  - a key without its own `entityId` but with `[desk/brightness]`: the long press starts edit mode; after it ends, a short press shows the usual alert and sends no service call
- [X] T008 [P] [US1] Extend `tests/integration/adapter/pi-bridge-capabilities.test.js`: `entity.capabilities` returns `friendlyName` for `light.desk` and `friendlyName: null` for an unknown entity (contract §4).

### Implementation

- [X] T009 [US1] Extend `src/adapter/actions/toggle.js` (research R-05):
  - import `parseSelectedValues`
  - `longPress()`: new `case 'edit_values': return this.#startTargets();`
    - `#startTargets()`: not connected → `showAlert`; call `startTargets({ sourceContext, targets: parseSelectedValues(this.settings.editValues) })`; `ineligible` → `showAlert` (no service call); `no_dial` → existing toast
  - edit rendering uses the session entity: add a getter `editEntity` = `store.get(session.entityId)`
    - `#editValue()` reads the optimistic value from `controls.get(session.entityId)`
    - caption shown when `session.targets.length >= 2` or the entity has ≥ 2 values
    - in `edit_values` mode pass a binding without `label` to `editModel`, so the entity's friendly name is shown
  - `#followSession()`: subscribe to `controls.get(session.entityId)` instead of `this.entityId`
  - `onSettings()`: end the session (`'settings'`) when the key is the source and the trimmed `entityId`, `longPress`, or `JSON.stringify(parseSelectedValues(editValues))` changed
  - Done when T007 passes (except PI-related cases).
- [X] T010 [P] [US1] In `src/adapter/pi-handlers.js`, add `friendlyName: entity.friendlyName` to the `entity.capabilities` response, and `friendlyName: null` to the unknown-entity response. Done when T008 passes.
- [X] T011 [US1] Extend `plugin/…/property-inspector/toggle.html`:
  - add `<option value="edit_values" data-localize="pi.longPress.editValues">pi.longPress.editValues</option>` right after the `edit` option
  - add a `data-mode="edit_values"` hint `pi.longPress.editValues.hint`
  - add `<input type="hidden" name="editValues" id="editValues">` inside the form (the visible list follows in US3, Phase 4)
- [X] T012 [P] [US1] Add `pi.longPress.editValues` and `pi.longPress.editValues.hint` to `plugin/…/en.json` and `plugin/…/de_DE.json`, with the texts from contract §5. Confirm that `tests/unit/locales.test.js` passes.

**Checkpoint**: US1 works with a single selected value. `npm test` is green. The setting can
only be written by the harness until US3 adds the PI list, so device validation (V-01, V-02)
follows after Phase 4.

---

## Phase 4: User Story 3 - Select values comfortably in the settings (Priority: P2)

**Why before US2**: US3 has priority P2 in the spec, but without it the MVP cannot be set up on the device (the setting would only exist as a hidden field). It therefore comes right after US1 and is part of the MVP. US2 builds on the same settings.

**Goal**: In the `edit_values` mode, the Toggle PI shows the list of selected values as chips
"<name> · <value>" with ✕. An entity search lists the chosen entity's values with "+" buttons.
The list is stored in the hidden `editValues` input as JSON. The list UI is inline in
`toggle.html` (constitution VI); only the picker gets a new option.

**Independent Test**: In Ulanzi Studio or the simulator:
1. Choose the mode "Dynamic Dial for selected values" and search for a lamp with brightness and
   colour temperature.
2. Click "+ Brightness" and "+ Colour temperature": two chips appear and the settings contain
   both pairs.
3. Remove the first chip and reopen the PI: one chip remains, with the lamp's name.

On the device: quickstart V-07, V-08.

### Tests first

- [X] T013 [P] [US3] Extend `tests/integration/adapter/pi-bridge-entities.test.js` ([contract](contracts/toggle-selected-values-settings.md) §4a): `entities.list` with `{ controllable: true }` contains `light.living_room`, `light.desk`, `cover.blinds`, `media_player.living_room`, `climate.office`, `fan.bedroom` and `input_number.volume_target`, but not `light.hallway`, `cover.garage`, `switch.coffee`, `sensor.outdoor_temperature` or `scene.evening`. It combines with `domains` and `query`. Without the flag the result is unchanged (existing tests stay green).

### Implementation

(Apart from T013, the PI has no automated test harness. The locale test covers the new keys;
verify the rest manually per quickstart V-07.)

- [X] T014 [P] [US3] In `src/adapter/pi-handlers.js`, add the optional parameter `controllable` to `entities.list`: when it is `true`, keep only entities with `supportedAttributes(e).length > 0` (already imported), after the domain and query filters and before `slice`. Done when T013 passes.

- [X] T015 [US3] Extend `mountEntityPicker(input, options)` in `plugin/…/property-inspector/shared.js`:
  - option `onChoose(entityId)`: when set, `choose()` calls it instead of writing `input.value` and dispatching `change`
  - option `clearOnChoose`: after choosing, set `input.value = ''`
  - option `controllable`: forwarded as `controllable: true` in the `entities.list` request
  - existing callers are unchanged
- [X] T016 [P] [US3] Add chip and value-button styles to `plugin/…/property-inspector/shared.css`:
  - `.hadeck-chips` (flex-wrap, gap 4px)
  - `.hadeck-chip` and its ✕ button
  - `.hadeck-value-buttons button`
  - match the existing `.hadeck-picker` look
- [X] T017 [US3] Build the value list inline in `plugin/…/property-inspector/toggle.html`, inside the `data-mode="edit_values"` section (contract §3):
  - markup:
    - `uspi-item` "Values" (`pi.longPress.editValues.list`) with a `.hadeck-chips` container
    - `uspi-item` with the entity search input (no `name`, placeholder `pi.entity.placeholder`)
    - a `.hadeck-value-buttons` row
    - the hidden `editValues` input from T011
  - script:
    - `readList()` parses the hidden JSON with the same rules as `parseSelectedValues`; `writeList(list)` sets compact JSON and dispatches `change` (bubbles)
    - `renderChips()` uses DOM APIs only: the label `${friendlyName ?? entityId} · ${t('pi.attribute.' + attributeId)}` and a ✕ button with `aria-label`/`title` `t('pi.longPress.editValues.remove')`
    - names are fetched with `HADeck.request('entity.capabilities', { entityId })` once per distinct entity and cached
    - `HADeck.mountEntityPicker(searchInput, { domains: ['light', 'media_player', 'climate', 'cover', 'fan', 'input_number', 'number'], controllable: true, onChoose, clearOnChoose: true })`
    - `onChoose` loads `entity.capabilities` and renders one button per supported attribute not yet in the list, labelled `+ ${t('pi.attribute.' + id)}`; with no attributes it shows `t('pi.attribute.none')`
    - clicking a button appends the pair, rewrites, re-renders the chips and removes the button
    - re-render the chips on the form's `hadeck:load` event (register it before `HADeck.bindForm`)
  - `HADeck.request` and `HADeck.t` are already exported by `shared.js`.
- [X] T018 [P] [US3] Add `pi.longPress.editValues.list`, `pi.longPress.editValues.remove` and `pi.longPress.editValues.add` to `plugin/…/en.json` and `plugin/…/de_DE.json` (contract §5). Confirm that `tests/unit/locales.test.js` passes.

**Checkpoint**: The MVP (US1 + US3) is complete and can be set up on the device. `npm test` is green.

---

## Phase 5: User Story 2 - Jump between several selected values by pressing the Dynamic Dial (Priority: P1)

**Goal**: With two or more selected values, a Dynamic Dial press jumps to the next usable value
(wrap-around, skipping unusable entries). All Dynamic Dials and the key follow, and the value
name is always shown. A lost current target moves on or ends edit mode. With one value, the
configured press action still applies.

**Independent Test**:
1. In the harness, add a `switch.coffee` key with `editValues`
   = `[living_room/brightness, desk/brightness, desk/color_temp]`.
2. Hold the key: the dial title is the living-room name.
3. Press the Dynamic Dial: the title is the desk name and the caption is the brightness short
   name.
4. Press again: the caption is the colour temperature short name, and rotating sends
   `color_temp_kelvin` to `light.desk`.
5. Press again: back to the living room.

On the device: quickstart V-03–V-06.

### Tests first

- [X] T019 [P] [US2] Extend `tests/integration/adapter/dynamic-dial.test.js` with a "selected values" block (contract §4). Use the key `switch.coffee`, `longPress: 'edit_values'`:
  - jump order and wrap-around as in the Independent Test above, asserting `dialSvgOf(dial).title`, the caption text in the SVG, and the key icon (`keyIcon`) after each jump
  - rotating after each jump changes only the current target (inspect `h.server.messages('call_service')` after `h.clock.tick(200)`)
  - a press while rotating (`dialdown` → `dialrotate` → `dialup`) does not jump
  - with a single target `[desk/brightness]` and the default press action, a press ends edit mode; with `pressAction: 'switch_value'` it switches desk brightness ↔ colour temperature
  - a jump restarts the timeout: `h.clock.tick(9_000)`, press, `h.clock.tick(9_000)` → still in edit mode
  - lost target: during editing of `light.desk`, `emitStateChanged('light.desk', { state: 'unavailable' })` moves the session to the next usable entry; if every entry is unavailable, edit mode ends (the dial shows the idle hint)
  - an unavailable non-current entry is skipped by the next press
  - with two Dynamic Dials, both show the same target after a jump

### Implementation

- [X] T020 [US2] Extend `src/adapter/actions/dynamic-dial.js` (research R-04):
  - `handlePress()`: when the session exists and `session.targets.length >= 2`, call `this.app.editSession.nextTarget()`; on `false` show the toast `hint.noOtherValue`; return. Otherwise keep the existing path.
  - override `valueCaption`: when `session.targets.length >= 2` return `this.app.t('attr.short.' + this.attributeId)`, otherwise `super.valueCaption`
  - `onEntityChanged()`: when the session has targets and `!targetUsable({ entityId, attributeId }, this.entity)`, call `this.app.editSession.targetUnusable(this.entityId, this.attributeId)` and return (the `onChange` listener rebinds and renders); otherwise `super.onEntityChanged()`
  - update the header comment
  - Done when T019 passes.

**Checkpoint**: Jumping works end to end. `npm test` is green. On the device: V-03–V-06.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T021 [P] Confirm that `tests/unit/architecture.test.js` passes with the new `src/domain/selected-values.js`, which imports only domain modules.
- [X] T022 [P] Update `README.md`:
  - HA Toggle row (line ~13): mention the long-press mode "Dynamic Dial for selected values"
  - section "Use only one Dynamic Dial" (line ~80): a short paragraph with the shutter/lamp example; a dial press jumps between several values; editing ends via the key, timeout or page switch
- [X] T023 [P] Write `specs/004-dial-selected-entities/release-notes.md` for v0.4.0, in English, in the same style as `specs/003-ha-entity-icons/release-notes.md`.
- [X] T024 Run `npm test`, `npm run build` and `npm run package`. All must succeed.
- [ ] T025 Run the device validation (quickstart V-01–V-08) on Windows and macOS and record the results in `specs/004-dial-selected-entities/validation.md`.
- [X] T026 Review against the constitution:
  - tests green
  - the new log lines in `app.js` contain no entity IDs (log output is not captured by the harness)
  - all new strings in `en.json`/`de_DE.json`
  - PI chips and buttons built without `innerHTML`
  - no new dependency, no new shared PI abstraction

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: blocks all stories.
  - T002 ∥ T003 (different files), then T004 → T005 (T005 imports `targetUsable`) → T006.
- **US1 (Phase 3)**: depends on Foundational.
- **US3 (Phase 4)**: depends on US1 (`friendlyName`, hidden input and mode option, locales).
  It is independent of US2. It comes before US2 so that the MVP can be set up on the device.
- **US2 (Phase 5)**: depends on Foundational and on US1's `toggle.js` change, because sessions
  with targets are started from the key. It does not need US3; for tests the harness writes the
  settings directly.
- **Polish (Phase 6)**: after the desired stories.

```text
Setup → Foundational → US1 → US3 (MVP complete) → US2 → Polish
                         └──────── US2 may also start right after US1 ────────┘
```

### Within each story

- Tests first; confirm they fail.
- Domain → adapter → PI and locales.
- Do these edits sequentially, because they touch the same file:
  - `plugin/…/property-inspector/toggle.html`: T011, T017
  - `plugin/…/en.json` and `de_DE.json`: T012, T018
  - `src/adapter/pi-handlers.js`: T010, T014
  - `src/domain/edit-session.js` (T005) before `src/adapter/app.js` (T006)

## Parallel Opportunities

- **Foundational**: T002 ∥ T003; T004 alongside T003.
- **US1**: T007 ∥ T008; then T009 ∥ T010 ∥ T012, then T011.
- **US3**: T013, then T014; T016 ∥ T018 alongside T015 → T017.
- **US2**: T019, then T020. It can also run alongside US3.
- **Across stories**: once US1 is done, US2 (`dynamic-dial.js` and its test) and US3 (PI
  files) touch disjoint files.
- **Polish**: T021 ∥ T022 ∥ T023.

## Parallel Example: Foundational

```bash
# Tests together (they must fail first):
Task: "Create tests/unit/domain/selected-values.test.js"
Task: "Extend tests/unit/domain/edit-session.test.js with target scenarios"

# Then:
Task: "Create src/domain/selected-values.js"
```

## Implementation Strategy

### MVP first

1. Phase 1 and Phase 2: no visible change, everything still green.
2. Phase 3 (US1): a single selected value, validated in the harness.
3. Phase 4 (US3): selection in the PI. **Stop and validate** on the device: V-01, V-02, V-07,
   V-08.

### Incremental delivery

1. + US2: jumping between values → V-03–V-06
2. Polish: README, release notes, validation, version 0.4.0
