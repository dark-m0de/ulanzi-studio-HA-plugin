---
description: "Task list for the Home Assistant plugin for Ulanzi Deck with dial support"
---

# Tasks: Home Assistant Plugin for Ulanzi Deck with Dial Support

**Input**: Design documents from `/specs/001-ha-deck-plugin/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution Principle III (Test-First, NON-NEGOTIABLE) requires automated tests for the HA client, value calculation, long-press detection, throttling and edit mode. Write each test task first and confirm it **fails** before starting the matching implementation task.

**Organization**: Tasks are grouped by user story so that each story can be implemented and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: User story from spec.md (US1–US6)

## Path Conventions

- Sources: `src/ha/` (layer 1, HA client), `src/domain/` (layer 2, pure logic), `src/adapter/` (layer 3, SDK binding)
- Installable plugin folder: `plugin/com.ulanzi.hadeck.ulanziPlugin/` (abbreviated below as `plugin/…/`)
- Tests: `tests/unit/`, `tests/integration/`, `tests/support/`
- Layer rule (Principle II): nothing in `src/ha/` or `src/domain/` may import the SDK, `ws` or `src/adapter/`. Time, sockets and output are injected.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialisation, tooling and the plugin folder skeleton

- [X] T001 Create `package.json` at the repository root with `"type": "module"`, `"license": "Apache-2.0"`, `"engines": { "node": ">=20.12" }`, the dependency `"ulanzideck-api": "github:UlanziTechnology/plugin-common-node#<commit-sha>"` (pin the current main commit, research R-03), the explicit dependency `ws` (same major as required by `ulanzideck-api`, because `src/adapter` and the tests import it directly) and the devDependency `esbuild`. Add the scripts `test` (`node --test --experimental-test-coverage` without a glob argument: Node 20 does not expand globs for `--test` and instead discovers `**/*.test.js` itself, excluding `node_modules`), `build` (`node scripts/build.mjs`), `package` (`node scripts/package.mjs`) and `dev:link` (`node scripts/dev-link.mjs`). Then run `npm install` to create `package-lock.json`.
- [X] T002 [P] Create `.nvmrc` with `20` and `.editorconfig` (2-space indent, LF, UTF-8, final newline) in the repository root
- [X] T003 [P] Create `scripts/build.mjs`: esbuild bundles `src/adapter/app.js` → `plugin/com.ulanzi.hadeck.ulanziPlugin/dist/app.js` with `platform: 'node'`, `target: 'node20.12'`, `format: 'esm'`, `bundle: true`, `external: ['bufferutil', 'utf-8-validate']` (optional native add-ons of `ws`; without this esbuild fails with "Could not resolve") and a `createRequire` banner for CJS deps. It supports a `--watch` flag (research R-02).
- [X] T004 [P] Create `scripts/dev-link.mjs`: it symlinks (Windows: directory junction) `plugin/com.ulanzi.hadeck.ulanziPlugin` into the Ulanzi Studio plugins directory. Defaults: macOS `~/Library/Application Support/Ulanzi/UlanziDeck/Plugins`, Windows `%APPDATA%\Ulanzi\UlanziDeck\Plugins`; `HADECK_PLUGIN_DIR` overrides the target (research V-07). It prints the target and refuses to overwrite a non-symlink folder.
- [X] T005 [P] Create `scripts/package.mjs`: it runs the build, copies `LICENSE` and `NOTICE` into `plugin/com.ulanzi.hadeck.ulanziPlugin/` and zips the folder to `com.ulanzi.hadeck.ulanziPlugin.zip` (Node built-ins only; zip via the system `zip`/`tar -a` command with a clear error if it is missing)
- [X] T006 [P] Vendor UlanziTechnology/plugin-common-html into `plugin/com.ulanzi.hadeck.ulanziPlugin/libs/common-html/` (only the files the Property Inspector needs) and record the source commit and license in `plugin/com.ulanzi.hadeck.ulanziPlugin/libs/common-html/SOURCE.md`
- [X] T007 Create `plugin/com.ulanzi.hadeck.ulanziPlugin/manifest.json` exactly as in [contracts/plugin-actions.md](contracts/plugin-actions.md):
  - top-level fields `UUID com.ulanzi.ulanzistudio.hadeck`, `CodePath dist/app.js`, `Type JavaScript`, `Software.MinVersion 3.3.0`, `OS`, `Category`, `Inspect --inspect=127.0.0.1:9231`
  - all six actions with their UUIDs, `Controllers`, `"Devices": []`, `Encoder.layout "$UA1"` for `.dial`/`.dynamicdial`, `PropertyInspectorPath`, `SupportedInMultiActions: false`, `DisableAutomaticStates: true`, and a single default state image each
- [X] T008 [P] Create `plugin/com.ulanzi.hadeck.ulanziPlugin/en.json` and `plugin/com.ulanzi.hadeck.ulanziPlugin/de_DE.json` with `Name`, `Description`, an `Actions[]` array (index-aligned with the manifest: Name, Tooltip) and an empty `Localization` object (research R-15)
- [X] T009 [P] Design and add the plugin, category and per-action icons as own SVGs in `plugin/com.ulanzi.hadeck.ulanziPlugin/resources/` (`plugin.svg`, `category.svg`, `toggle.svg`, `dial.svg`, `dynamicdial.svg`, `scene.svg`, `sensor.svg`, `service.svg`). Do not reproduce the Home Assistant logo (constitution: Licensing & Code Provenance).
- [X] T010 [P] Update `NOTICE` in the repository root: list `ulanzideck-api` / plugin-common-node (Apache-2.0, UlanziTechnology), plugin-common-html (Apache-2.0, UlanziTechnology) and `ws` (MIT, Einar Otto Stangvik and contributors), with source URLs, and carry over any NOTICE content they ship
- [X] T011 [P] Create the CI workflow `.github/workflows/test.yml`: on push/PR, matrix `ubuntu-latest`, `macos-latest`, `windows-latest` with Node 20.12; it runs `npm ci`, `npm test` and `npm run build`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: HA client, entity store, attribute registry, i18n, logging, rendering, the adapter skeleton and the test harness. Every user story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Test harness

- [X] T012 [P] Create `tests/support/fake-ha-server.js`: a `ws` `WebSocketServer` on a random port that scripts the HA protocol from [contracts/ha-websocket.md](contracts/ha-websocket.md).
  - Protocol: `auth_required`, then accept/reject a configured token, reply to `get_states` from the fixtures, handle `subscribe_events`, `call_service`, `ping`/`pong`.
  - Helpers: `emitStateChanged(entityId, newState)`, `failNextCall(code)`, `stopResponding()` (for timeouts and dead sockets), `restart()`, `close()`, plus a record of all received messages for assertions.
- [X] T013 [P] Create `tests/support/fake-ud.js`: a fake of the `common-node` `$UD` API.
  - It records every emitted command (`setBaseDataIcon`, `setFeedbackLayout`, `setFeedback`, `showAlert`, `toast`, `sendToPropertyInspector`, `setGlobalSettings`, `logMessage`) and exposes `emit(eventName, message)` for every `on*` handler listed in [contracts/plugin-actions.md](contracts/plugin-actions.md).
  - It provides `encodeContext`/`decodeContext` with the `uuid___key___actionid` format.
- [X] T014 [P] Create the HA state fixtures `tests/support/fixtures/states.json`: dimmable light (on, brightness 102), on/off-only light, colour-temperature light (kelvin bounds), switch, fan (`percentage_step` 10), cover with SET_POSITION, cover without it, media player with VOLUME_SET (playing, volume 0.35), climate (min 7, max 30, step 0.5, heat), `input_number` (0–10 step 0.5), sensor with unit °C, scene, script, automation

### Tests first (must fail before the implementation below)

- [X] T015 [P] Write `tests/unit/ha/backoff.test.js`: delays 1 s, 2 s, 4 s, … capped at 30 s; `reset()` after success; `stop()` puts it into a no-retry state that only `reset()` leaves (FR-004, FR-005)
- [X] T016 [P] Write `tests/unit/ha/messages.test.js`: http→ws / https→wss URL building including base paths and trailing slashes; invalid URL detection; builders for `auth`, `get_states`, `subscribe_events`, `call_service`, `ping`; parsing of `result`/`event`/`pong`
- [X] T017 [P] Write `tests/integration/ha/client.test.js` against the fake HA server, with `mock.timers` where time matters:
  - connect → `connected` and states loaded
  - `auth_invalid` → `auth_failed` with no further connection attempts
  - changing credentials after `auth_failed` → reconnect
  - `state_changed` (including `new_state: null`) dispatched
  - `call_service` success and error result
  - 10 s request timeout → `error.timeout`
  - pending requests rejected on close
  - missing `pong` within 10 s → reconnect
  - server restart → reconnect, states reloaded, resubscribed
  - with a recording logger at `info` level, the whole run logs no entity IDs, no state values and no token; at `debug` level entity IDs may appear (Principle V)
- [X] T018 [P] Write `tests/unit/domain/entity-store.test.js`: full load, `changed(entityId)` notifications per subscriber, removal (`new_state: null` → not found), unavailable detection (`unavailable`/`unknown`/missing), friendly-name fallback to the object id
- [X] T019 [P] Write `tests/unit/domain/attributes.test.js` for every entry in the mapping table of [contracts/ha-websocket.md](contracts/ha-websocket.md), using the fixtures from T014: `isSupported`, `read` (brightness 102 → 40 %, off → `null`), `bounds`, `defaultSteps`, `unit`, clamping and step rounding, `toServiceCall` (including `volume_level` scaling and `offAtMin` turn-off calls), and `supportedAttributes(entity)` (FR-021, FR-022, FR-025)
- [X] T020 [P] Write `tests/unit/domain/i18n.test.js`: lookup by key from a locale `Localization` object, fallback to `en`, then to the key itself; `{placeholder}` interpolation; language selection from codes like `de`, `de_DE`, `en`
- [X] T021 [P] Write `tests/unit/adapter/logger.test.js`: the configured token, `access_token` values and `Authorization: Bearer …` never appear in output (they are replaced with `***`); `debug` messages are suppressed unless debug is enabled; log levels map to `$UD.logMessage` levels (Principle V); `installConsoleRedaction()` makes `console.log/info/warn/error` output redacted the same way, because the SDK logs every protocol message including global settings (research R-18)
- [X] T022 [P] Write `tests/unit/domain/render/key-svg.test.js`: the SVG output of a `KeyRender` model (data-model §10) has viewBox `0 0 144 144`, XML-escapes user labels, truncates long labels with an ellipsis, uses one colour set per style (`on`, `off`, `unavailable`, `edit`, `trigger`, `sensor`, `warn`), uses generic `sans-serif` only and references no external resources; base64 output is valid
- [X] T023 [P] Write `tests/integration/adapter/app.test.js` with the fake `$UD`:
  - `onConnected` requests global settings
  - global settings configure and connect the client
  - `onAdd`/`onClear` create and dispose action instances through the action registry
  - an exception thrown inside one action handler is logged and does not affect other actions (Principle IV failure isolation)
  - `logMessage` calls at `info`/`warn`/`error` level contain no entity IDs, state values or token (Principle V)

### Implementation

- [X] T024 [P] Implement `src/ha/backoff.js` so that T015 passes
- [X] T025 [P] Implement `src/ha/messages.js` so that T016 passes
- [X] T026 Implement `src/ha/client.js` (an `EventTarget`; constructor takes `{ createSocket, clock, logger }`) with the status state machine from [data-model.md](data-model.md) §1. It exposes `configure(url, token)`, `callService(call)`, `getStates()`, `status` and the events `status`, `state_changed`, `states_loaded`. Done when T017 passes. Depends on T024 and T025.
- [X] T027 [P] Implement `src/domain/entity-store.js` so that T018 passes
- [X] T028 [P] Implement the attribute registry `src/domain/attributes/index.js` and `src/domain/attributes/light.js`, `media-player.js`, `climate.js`, `cover.js`, `fan.js`, `number.js` as specified in data-model §3 and [contracts/ha-websocket.md](contracts/ha-websocket.md), so that T019 passes
- [X] T029 [P] Implement `src/domain/i18n.js` (it receives the parsed locale objects; no file I/O) so that T020 passes
- [X] T030 [P] Implement `src/adapter/logger.js` so that T021 passes
- [X] T031 [P] Implement `src/domain/render/theme.js` (colour sets per style) and `src/domain/render/key-svg.js` (`renderKeySvg(model) → base64`) so that T022 passes
- [X] T032 Implement the adapter skeleton `src/adapter/app.js` so that T023 passes.
  - Startup: `$UD.connect('com.ulanzi.ulanzistudio.hadeck')`; read the language from `process.argv[4]` and load the matching `en.json`/`de_DE.json` from the plugin root for i18n.
  - Wire the HA client (with a `ws`-based `createSocket`), entity store and logger.
  - Global settings → `client.configure`.
  - Provide an action registry keyed by action UUID suffix and context, where every handler call is wrapped in try/catch + log.
  - Add `src/adapter/actions/action-base.js`, a shared base class: binding settings, subscribe to its entity in the store, `render()` hook, dispose.
  - Depends on T026, T027, T029, T030.
- [X] T033 Create `src/adapter/pi-bridge.js` with the message envelope from [contracts/pi-messages.md](contracts/pi-messages.md) (`v`, `type`, `id`, reply with the same id, `error.key`, ignore unknown types) and register it in `src/adapter/app.js` via `onSendToPlugin`. No message types yet; they are added per story.
- [X] T034 Create `plugin/com.ulanzi.hadeck.ulanziPlugin/property-inspector/shared.js` and `shared.css`:
  - a request/reply helper over `$UD.sendToPlugin` / `onSendToPropertyInspector` with ids and a 10 s timeout
  - form helpers that populate from `onAdd`/`onParamFromApp` and save via debounced (300 ms) `setSettings`
  - `.uspi-wrapper` layout
  - `data-localize` usage

### Early device validation (manual, needs Ulanzi Studio + D200X)

- [X] T035 Build a temporary spike in `src/adapter/spike.js` (enabled only when the env var `HADECK_SPIKE=1` is set; delete it after recording results). With `npm run build && npm run dev:link`, run validations V-01 to V-06 from [quickstart.md](quickstart.md#early-device-validations-run-first). Record each result and the decision taken in the "Open validations" table of [research.md](research.md), and update `Software.MinVersion` in `plugin/…/manifest.json` per V-05. If V-02 or V-03 fail, update [research.md](research.md) R-09/R-10 to the documented fallback before starting US2/US3.

**Checkpoint**: The foundation is ready, all Phase 2 tests pass, and device behaviour is known. User story work can begin.

---

## Phase 3: User Story 1 – Set up the Home Assistant connection (Priority: P1) 🎯 MVP

**Goal**: Users enter the URL and token once, test the connection, and the plugin stays connected (reconnects automatically, stops on an invalid token).

**Independent Test**: Place an HA Toggle on a key. In the PI, enter URL and token and press *Test connection*. You should see "Connected – N entities", or "Authentication failed" / "Unreachable" / "Timeout". A second action is prefilled. After an HA restart, keys recover within 30 s ([quickstart.md](quickstart.md) scenario 1).

### Tests for User Story 1 ⚠️ write first, must fail

- [X] T036 [P] [US1] Write `tests/integration/adapter/pi-bridge-connection.test.js`:
  - `connection.test` returns `ok` + `entityCount` + `haVersion` for valid credentials
  - it returns `error.auth`, `error.unreachable`, `error.timeout` and `error.invalidUrl` in the matching cases, using a temporary connection that does not disturb the main one
  - `haToken: null` means "use the stored token"
  - `connection.status` reflects the client status and `hasToken`
  - `connection.changed` is pushed to open PIs on status change
  - **no reply ever contains the token** (FR-003, Principle V)
- [X] T037 [P] [US1] Write `tests/integration/adapter/connection-flow.test.js`:
  - an `auth_failed` status shows one `toast` (`error.auth`) and every bound key renders the unavailable/disconnected style
  - new global settings trigger a reconnect
  - after a fake server restart every action re-renders with current states within the backoff window (FR-004, FR-005, SC-006)

### Implementation for User Story 1

- [X] T038 [US1] Implement the message types `connection.test`, `connection.save`, `connection.status` and the `connection.changed` push in `src/adapter/pi-bridge.js` (temporary client instance for the test, using `src/ha/client.js`) so that T036 passes
- [X] T039 [US1] Implement the connection-status handling in `src/adapter/app.js` and `src/adapter/actions/action-base.js`: broadcast status changes to all actions, render the disconnected/auth-failed state and toast `error.auth` once per failure, so that T037 passes
- [X] T040 [US1] Add the connection block to `plugin/…/property-inspector/shared.js` and `shared.css` (FR-002, FR-003, research R-08):
  - fields: URL and token (masked placeholder once a token is stored; a new token is sent only if edited)
  - *Test connection* button showing the result message
  - status line driven by `connection.status`/`connection.changed`
  - on test success: send `connection.save` (the main service stores the credentials with `setGlobalSettings`)
  - on `error.unreachable` or `error.timeout` (HA may just be offline): show a *Save anyway* button that sends `connection.save`; the main service then connects in the background and the status line shows the result. Not offered for `error.auth` or `error.invalidUrl`.
- [X] T041 [US1] Create `plugin/…/property-inspector/toggle.html` containing the shared connection block (the entity fields follow in US2), loading `libs/common-html` and `shared.js`
- [X] T042 [P] [US1] Add the connection-related keys (`pi.connection.*`, `status.connected`, `status.disconnected`, `error.auth`, `error.unreachable`, `error.timeout`, `error.invalidUrl`) to `Localization` in `plugin/…/en.json` and `plugin/…/de_DE.json`

**Checkpoint**: The connection can be configured, tested and survives HA restarts. This is the MVP increment.

---

## Phase 4: User Story 2 – Toggle an entity with a key, with live state (Priority: P1)

**Goal**: An HA Toggle key toggles an entity on short press and always shows its live state (including brightness % for dimmable lights).

**Independent Test**: Bind a light. A short press toggles it. Toggling in the HA UI updates the key within 1 s. An unavailable entity shows the error style. The entity picker searches by ID and name ([quickstart.md](quickstart.md) scenario 2).

### Tests for User Story 2 ⚠️ write first, must fail

- [X] T043 [P] [US2] Write `tests/unit/domain/long-press.test.js` with `mock.timers`:
  - keyup before the threshold → short press
  - holding past the threshold fires the long-press callback **while still held**, and the subsequent keyup emits nothing
  - the threshold is configurable (300–2000 ms)
  - repeated keydown without keyup is ignored
  - 20 short + 20 long presses are classified correctly (SC-005)
- [X] T044 [P] [US2] Write `tests/unit/domain/press-actions.test.js` for the press-action table in [contracts/ha-websocket.md](contracts/ha-websocket.md): toggle domains, `media_player.media_play_pause`, climate on/off by state, scene/script `turn_on`, `automation.trigger`
- [X] T045 [P] [US2] Write `tests/unit/domain/render/key-model.test.js`:
  - the toggle render model shows on/off/unavailable/not-found styles
  - the label defaults to the friendly name
  - custom `onText`/`offText` are used, otherwise the localised `status.on`/`status.off`
  - a dimmable light that is on shows its brightness % (FR-011, FR-012)
- [X] T046 [P] [US2] Write `tests/integration/adapter/toggle.test.js` with the fake `$UD` and fake HA server:
  - `onAdd` renders the current state
  - keydown+keyup sends `<domain>.toggle`; `onRun` is ignored (no double toggle)
  - `state_changed` re-renders within the same tick
  - a failed call triggers `showAlert` and a `logMessage` at `warn` level (FR-040, Principle IV)
  - two keys on the same entity both update
- [X] T047 [P] [US2] Write `tests/integration/adapter/pi-bridge-entities.test.js`: `entities.list` filters by domain list and case-insensitive query on entity ID and friendly name, respects `limit`, and returns an empty list when disconnected (FR-013)

### Implementation for User Story 2

- [X] T048 [P] [US2] Implement `src/domain/long-press.js` (the `PressDetector` from data-model §7, with injected clock/timers) so that T043 passes
- [X] T049 [P] [US2] Implement `src/domain/press-actions.js` (`pressActionFor(entity) → ServiceCall`) so that T044 passes
- [X] T050 [P] [US2] Implement `src/domain/render/key-model.js` (`toggleModel(entity, binding, t)`) so that T045 passes
- [X] T051 [US2] Implement `src/adapter/actions/toggle.js` (`PressDetector` on `onKeyDown`/`onKeyUp`, `onRun` ignored, short press → `pressActionFor`, render via `key-model` + `key-svg` + `setBaseDataIcon`, `showAlert` on error) and register it in `src/adapter/app.js`, so that T046 passes. Depends on T048–T050.
- [X] T052 [US2] Implement `entities.list` in `src/adapter/pi-bridge.js` so that T047 passes
- [X] T053 [US2] Add the entity picker component (search input with a debounced `entities.list` request and a result list) to `plugin/…/property-inspector/shared.js`/`shared.css`, and add the fields entity, label, on text and off text to `plugin/…/property-inspector/toggle.html`
- [X] T054 [P] [US2] Add the toggle keys (`status.on`, `status.off`, `status.unavailable`, `status.notFound`, `pi.entity.*`, `pi.label`, `pi.onText`, `pi.offText`) to `plugin/…/en.json` and `plugin/…/de_DE.json`

**Checkpoint**: US1 + US2 make a usable key-only HA plugin.

---

## Phase 5: User Story 3 – Bind a dial directly to an entity attribute (Priority: P1)

**Goal**: An HA Dial controls a chosen attribute of a chosen entity. Rotation changes the value (fine/coarse), a press runs the domain default action, and the display shows name and value.

**Independent Test**: Bind a dial to a light's brightness. Each detent changes it by 5 % with an immediate display update. Holding while rotating gives 20 %. A fast spin sends at most 5 calls/s and ends on the displayed value. A press toggles the light, and for a media player toggles play/pause ([quickstart.md](quickstart.md) scenario 3).

### Tests for User Story 3 ⚠️ write first, must fail

- [X] T055 [P] [US3] Write `tests/unit/domain/throttle.test.js` with `mock.timers`:
  - the first value is sent immediately (leading)
  - at most one call per 200 ms window per key
  - the latest value is always sent at the end (trailing)
  - separate entities are throttled independently
  - 100 values in 2 s produce ≤ 11 calls, the last one carrying the final value (FR-024, SC-004)
- [X] T056 [P] [US3] Write `tests/unit/domain/dial-controller.test.js` and `tests/unit/domain/entity-control.test.js` with `mock.timers`.
  In `dial-controller.test.js`:
  - `left`/`right` → ±fine step and `hold-left`/`hold-right` → ±coarse step, with custom steps overriding the defaults
  - values are clamped to the bounds
  - rotating right with the light off starts at the minimum and sends `turn_on`
  - going below the minimum with `offAtMin` sends the turn-off call, without it the value clamps
  - the optimistic value is shown immediately and takes precedence over stale HA updates until 1.5 s after the last input or until HA reports the target value
  - HA rounding (e.g. 40 → 39 %) is adopted after the window (FR-023–FR-025, FR-028, edge cases)

  In `entity-control.test.js` (data-model §8):
  - two controllers on the same entity and attribute share one `EntityControl`: together they produce at most one call per 200 ms, the second controller continues from the first one's optimistic value (no jump), and both listeners are notified of every change
  - two controllers on the same entity but different attributes (brightness and colour temperature) share the entity's throttle: combined at most one call per 200 ms (≤ 5 calls/s), only the latest call per attribute is kept, pending attributes are sent in order of their first change, and the final value of **each** attribute is delivered
  - optimistic values are kept per attribute (a brightness change does not mask a colour-temperature update from HA)
  - `cancelPending()` on the registry drops pending calls and optimistic values for all entities
- [X] T057 [P] [US3] Write `tests/unit/domain/render/dial-feedback.test.js`: `DialRender` → the `setFeedback` payload `{ title: { text }, icon: { value } }` with a data-URL SVG (100×100) showing value + unit and a progress arc; unavailable style; the `$UA2` text-only variant if research R-10 switched to the fallback
- [X] T058 [P] [US3] Write `tests/integration/adapter/dial.test.js` with the fake `$UD` and fake HA server:
  - `onAdd` calls `setFeedbackLayout(context,'$UA1')` once and renders
  - `onDialRotate` sends throttled `light.turn_on {brightness_pct}`
  - the display updates on every detent: `setFeedback` is emitted synchronously within the `onDialRotate` handler, before any HA round trip (SC-003)
  - while disconnected, rotation sends no call, discards any pending throttled call and renders the disconnected style with an error indication; after reconnect, no stale value is sent (edge case "connection drops during a rotation")
  - `onDialDown`/`onDialUp` runs the press action (light toggle, media player `media_play_pause`, FR-026)
  - an external `state_changed` updates the display (FR-027)
  - a failed call triggers `showAlert` and a `logMessage` at `warn` level (Principle IV)
- [X] T059 [P] [US3] Write `tests/integration/adapter/pi-bridge-capabilities.test.js`: `entity.capabilities` returns only supported attributes with unit/min/max/default steps (no colour temperature for an on/off light, no position for a cover without SET_POSITION), plus `longPressEligible` (FR-022)

### Implementation for User Story 3

- [X] T060 [P] [US3] Implement `src/domain/throttle.js` so that T055 passes
- [X] T061 [US3] Implement `src/domain/entity-control.js` (the shared `EntityControl` and `EntityControlRegistry` from data-model §8: one throttle per entity, one optimistic value and the latest pending call per attribute, listeners, `cancelPending()` for the whole registry, which the adapter calls when the connection leaves `connected`) and `src/domain/dial-controller.js` (data-model §8a; uses the attribute registry and delegates state to `EntityControl`, with an injected clock), so that T056 and the disconnect case of T058 pass. Depends on T060.
- [X] T062 [P] [US3] Implement `src/domain/render/dial-feedback.js` so that T057 passes
- [X] T063 [US3] Implement `src/adapter/actions/dial.js` (fixed `DialBinding` from data-model §5; `onDialRotate`, `onDialDown`/`onDialUp`, `setFeedbackLayout` once, render via `dial-feedback` + `setFeedback`) and register it in `src/adapter/app.js`, so that T058 passes. Depends on T061, T062.
- [X] T064 [US3] Implement `entity.capabilities` in `src/adapter/pi-bridge.js` so that T059 passes
- [X] T065 [US3] Create `plugin/…/property-inspector/dial.html`:
  - fields: connection block, entity picker, attribute select filled from `entity.capabilities`, label, fine/coarse step (placeholders show the defaults), "turn off at minimum" checkbox
- [X] T066 [P] [US3] Add the dial keys (`pi.attribute.*` for each attribute id, `pi.stepFine`, `pi.stepCoarse`, `pi.offAtMin`, unit labels) to `plugin/…/en.json` and `plugin/…/de_DE.json`

**Checkpoint**: Dials work with fixed bindings. All P1 stories are complete.

---

## Phase 6: User Story 4 – Long-press a light key to change its brightness with a dial (Priority: P2)

**Goal**: A long press on a light's Toggle key starts edit mode. The HA Dynamic Dial then controls that light's brightness until a short press, a timeout, a page switch or a connection loss.

**Independent Test**: With one Dynamic Dial assigned, holding a light key for 500 ms or longer switches the key to the edit style without toggling. The Dynamic Dial shows the light's name and brightness, and rotation changes it. A short press or 10 s of inactivity ends the mode ([quickstart.md](quickstart.md) scenario 4).

### Tests for User Story 4 ⚠️ write first, must fail

- [X] T067 [P] [US4] Write `tests/unit/domain/edit-session.test.js` with `mock.timers` covering the state machine in data-model §6:
  - a long press on an eligible light with ≥ 1 Dynamic Dial registered → `editing`
  - no Dynamic Dial registered → stays idle and returns the `hint.noDynamicDial` result (FR-039)
  - an ineligible entity returns the fallback result
  - a long press on another key switches the entity (FR-035)
  - the timeout is the **largest** `editTimeoutS` among the registered Dynamic Dials (default 10 s), so a session is never cut short by another dial's setting
  - the session ends on: a short press on the source key, the timeout (reset by every input, FR-034), `pageInactive(sourceContext)`, connection loss, the source key being cleared, the entity becoming unavailable, the last Dynamic Dial being removed
  - every registered Dynamic Dial receives the same feedback model (FR-032a)
  - rotations from any registered dial apply to the same value in order of arrival
- [X] T068 [P] [US4] Extend `tests/unit/domain/render/key-model.test.js` with the edit style: edit marker, live value and label (FR-033)
- [X] T069 [P] [US4] Write `tests/integration/adapter/dynamic-dial.test.js` with the fake `$UD` and fake HA server:
  - holding a light Toggle key past the threshold renders the edit style before keyup and sends **no** toggle call
  - the Dynamic Dials show the name and brightness
  - rotating either of two Dynamic Dials changes the brightness, and both displays stay in sync
  - rotating Dynamic Dial A to 60 % and then Dynamic Dial B one detent right yields 65 % (B continues from the shared value), and the edit-mode key shows the same live value
  - a fixed HA Dial bound to the same light (also when it controls a different attribute, e.g. colour temperature) and a Dynamic Dial share the entity's throttle (≤ 5 calls/s combined)
  - a fixed HA Dial bound to a different entity is unaffected
  - a dial press during edit runs the press action on the edited entity
  - `onSetActive(false)` on the source key ends edit mode (V-06)
  - with no Dynamic Dial, a long press sends `toast(hint.noDynamicDial)`
  - idle Dynamic Dials show `hint.longPress` and ignore rotation (FR-036)
- [X] T070 [P] [US4] Extend `tests/integration/adapter/toggle.test.js` with the long-press options (FR-037):
  - `longPress: disabled` → a long press acts as a short press
  - `entity` → toggles `longPressEntityId`
  - `service` → calls `longPressService`
  - a switch entity with `longPress: edit` falls back to toggling (Story 4 scenario 5)
  - custom `longPressMs` is respected

### Implementation for User Story 4

- [X] T071 [US4] Implement `src/domain/edit-session.js` (a single-session broker: register/unregister Dynamic Dial contexts, `start`, `input`, `end(reason)`, change events; with an injected clock). It uses `editAttributeFor(entity)` in `src/domain/attributes/index.js`, which returns `light.brightness` for supported lights and `null` otherwise. Done when T067 passes.
- [X] T072 [US4] Add the edit style to `src/domain/render/key-model.js` and `src/domain/render/theme.js` so that T068 passes. The live value comes from the session's `EntityControl` (optimistic value if valid, else the HA value).
- [X] T073 [US4] Implement `src/adapter/actions/dynamic-dial.js`: it registers with the edit-session broker on add and unregisters on clear, shows `hint.longPress` when idle, and while editing routes rotation through its `DialController`, rebound to the session's `EntityControl` on every session start or switch, and renders on `EntityControl` change notifications so that all dials and the source key stay in sync. Register it in `src/adapter/app.js`.
- [X] T074 [US4] Integrate long press into `src/adapter/actions/toggle.js`:
  - the long-press callback starts or switches the edit session, runs the fallback per `longPress` setting, or toasts the hint
  - while the key is the edit source, a short press ends the session
  - the key renders the edit style
  - `onSetActive(false)` and `onClear` of the source key end the session
  - the connection-status broadcast ends the session on disconnect

  Done when T069 and T070 pass.
- [X] T075 [US4] Add the long-press fields to `plugin/…/property-inspector/toggle.html`: behaviour select (edit / disabled / other entity / service), second-entity picker, service fields, threshold in ms. Create `plugin/…/property-inspector/dynamic-dial.html`: connection block, step fields, "turn off at minimum", edit timeout in seconds, and the prominent hint "Use only one Dynamic Dial per device" (FR-032a).
- [X] T076 [P] [US4] Add the edit-mode keys (`status.edit`, `hint.longPress`, `hint.noDynamicDial`, `hint.oneDynamicDial`, `pi.longPress.*`, `pi.editTimeout`) to `plugin/…/en.json` and `plugin/…/de_DE.json`
- [X] T077 [US4] **Only if validation V-04 failed** (see [research.md](research.md) R-12): implement the right-most fallback in `src/domain/edit-session.js`. Only the registered context with the largest key column (from `decodeContext`) accepts input; the other Dynamic Dials show `hint.oneDynamicDial`. Add matching cases to `tests/unit/domain/edit-session.test.js` first. If V-04 passed, mark this task done with a note in research.md.

**Checkpoint**: Long-press editing works for lights. All required features from the original request are complete.

---

## Phase 7: User Story 5 – Long-press for other adjustable domains (Priority: P3)

**Goal**: Edit mode also works for media player volume, climate target temperature, cover position and fan speed.

**Independent Test**: Long-press a media player key → the Dynamic Dial controls its volume. Long-press a climate key → it controls the target temperature in entity steps ([quickstart.md](quickstart.md) scenario 5).

### Tests for User Story 5 ⚠️ write first, must fail

- [ ] T078 [P] [US5] Extend `tests/unit/domain/edit-session.test.js` and `tests/unit/domain/attributes.test.js` for `editAttributeFor`:
  - media_player → `media_player.volume`, climate → `climate.temperature`, cover with SET_POSITION → `cover.position`, fan with SET_SPEED → `fan.percentage`
  - a cover without SET_POSITION and a switch → `null` (not eligible)
- [ ] T079 [P] [US5] Extend `tests/integration/adapter/dynamic-dial.test.js`: a long-pressed media player key → rotation sends `media_player.volume_set` with a 0–1 `volume_level`; a climate key → `climate.set_temperature` in 0.5 steps clamped to 7–30

### Implementation for User Story 5

- [ ] T080 [US5] Extend `editAttributeFor` in `src/domain/attributes/index.js` to the domain mapping in [contracts/ha-websocket.md](contracts/ha-websocket.md) (edit-mode attribute per domain) so that T078 and T079 pass. Verify that `entity.capabilities.longPressEligible` in `src/adapter/pi-bridge.js` reflects the extension.

**Checkpoint**: Edit mode covers all adjustable domains.

---

## Phase 8: User Story 6 – Additional key actions (Priority: P3)

**Goal**: Keys can trigger scenes/scripts/automations, show sensor values, and run arbitrary service calls.

**Independent Test**: A scene key activates the scene with brief visual confirmation. A sensor key shows value and unit and updates within 1 s. A service key calls exactly the configured service and shows an alert on error ([quickstart.md](quickstart.md) scenario 6).

### Tests for User Story 6 ⚠️ write first, must fail

- [ ] T081 [P] [US6] Extend `tests/unit/domain/render/key-model.test.js` with `triggerModel` (label, `trigger` style, a confirmation flash state), `sensorModel` (value + unit, `warn` style when outside `warnAbove`/`warnBelow`, unavailable) and `serviceModel`
- [ ] T082 [P] [US6] Write `tests/integration/adapter/scene.test.js`: `onRun` sends `scene.turn_on` / `script.turn_on` / `automation.trigger` depending on the domain, the key shows confirmation for about 1 s, and an error triggers `showAlert` plus a `logMessage` at `warn` level
- [ ] T083 [P] [US6] Write `tests/integration/adapter/sensor.test.js`: renders value + unit on add, re-renders on `state_changed` with the warn style beyond the thresholds; `onRun` does nothing
- [ ] T084 [P] [US6] Write `tests/integration/adapter/service.test.js`: `onRun` sends `call_service` with exactly the configured domain/service/target/data; invalid JSON data in the settings renders the error style instead of calling; an error result triggers `showAlert` plus a `logMessage` at `warn` level

### Implementation for User Story 6

- [ ] T085 [US6] Add `triggerModel`, `sensorModel` and `serviceModel` to `src/domain/render/key-model.js` so that T081 passes
- [ ] T086 [P] [US6] Implement `src/adapter/actions/scene.js` and register it in `src/adapter/app.js` so that T082 passes
- [ ] T087 [P] [US6] Implement `src/adapter/actions/sensor.js` and register it in `src/adapter/app.js` so that T083 passes
- [ ] T088 [P] [US6] Implement `src/adapter/actions/service.js` and register it in `src/adapter/app.js` so that T084 passes
- [ ] T089 [P] [US6] Create the Property Inspector pages:
  - `plugin/…/property-inspector/scene.html`: entity picker restricted to scene/script/automation, label
  - `plugin/…/property-inspector/sensor.html`: entity picker restricted to the `sensor` domain, label, warn thresholds
  - `plugin/…/property-inspector/service.html`: label, domain, service, target entities, JSON data textarea with inline validation
- [ ] T090 [P] [US6] Add the keys for the scene, sensor and service actions (`pi.scene.*`, `pi.sensor.*`, `pi.service.*`, `error.invalidJson`) to `plugin/…/en.json` and `plugin/…/de_DE.json`

**Checkpoint**: All user stories are complete.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Constitution compliance checks, documentation, packaging and end-to-end validation

- [ ] T091 [P] Write `tests/unit/locales.test.js`:
  - every key in `en.json` `Localization` exists in `de_DE.json` and the reverse
  - `Actions[]` lengths match the manifest
  - every `data-localize` key used in `plugin/…/property-inspector/*.html` and every key passed to `t()` in `src/` exists (FR-041, Platform Constraints)
- [ ] T092 [P] Write `tests/unit/architecture.test.js`: no file in `src/ha/` or `src/domain/` imports `ulanzideck-api`, `ws` or anything from `src/adapter/` (Principle II), and no source file contains `http(s)://` URLs other than in tests and documentation (Principle V, single host)
- [ ] T093 [P] Write `README.md` in the repository root with these sections:
  - features and supported devices
  - installation
  - creating a long-lived token
  - the "one Dynamic Dial" recommendation
  - development (`npm test`, `npm run build`, `npm run dev:link`, debugging flags)
  - license (Apache-2.0) and trademark notice
- [ ] T094 Remove `src/adapter/spike.js` and any `HADECK_SPIKE` handling left over from T035, and make sure research.md holds the final V-01…V-07 results
- [ ] T095 Audit the licenses of all shipped dependencies (`npm ls --omit=dev --all` plus the vendored `libs/common-html`) against the allowlist in the constitution, and make sure `NOTICE` is complete
- [ ] T096 Run `npm test` and confirm that coverage of `src/ha/` and `src/domain/` is at least 90 % of lines. Add any missing tests for uncovered branches in those layers.
- [ ] T097 Run the full validation scenarios 1–8 from [quickstart.md](quickstart.md) on a D200X with Ulanzi Studio on macOS **and** Windows, and record the results (date, Studio version, HA version, pass/fail per scenario) in `specs/001-ha-deck-plugin/validation.md`. Include the SC-001 setup time from scenario 1 (fresh install → first light key working, target < 3 min), the SC-002 measurement from scenario 2 (20 state changes made in the HA UI, at least 19 visible on the key within 1 s), the SC-003 timing measurement from scenario 3 (detent → `setFeedback` < 100 ms, last detent → HA state with the final value ≤ 500 ms, taken from debug-log timestamps) and the persistence check from scenario 8 (FR-042).
- [ ] T098 Run the 24 h stability check (quickstart scenario 9, SC-007) with 30 bound actions. Record the RSS of the plugin process after 1 h and after 24 h in `specs/001-ha-deck-plugin/validation.md`; pass if there is no crash and the 24 h value is at most 20 % above the 1 h value.
- [ ] T099 Run `npm run package`, install the resulting `com.ulanzi.hadeck.ulanziPlugin.zip` on a clean Ulanzi Studio, and verify that `LICENSE` and `NOTICE` are inside the plugin folder

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup. It **blocks all user stories**. T035 (device validation) needs T032 and should finish before US2/US3 rendering work (T050, T062).
- **US1 (Phase 3)**: depends on Foundational
- **US2 (Phase 4)**: depends on Foundational. Its PI page builds on T040/T041 from US1 (the connection block), but the toggle logic is testable without US1.
- **US3 (Phase 5)**: depends on Foundational. It reuses `press-actions.js` (T049) from US2 for the dial press, so do T049 first or alongside.
- **US4 (Phase 6)**: depends on US2 (Toggle key + `PressDetector`) and US3 (`DialController`)
- **US5 (Phase 7)**: depends on US4
- **US6 (Phase 8)**: depends on Foundational and on `key-model.js` from US2 (T050)
- **Polish (Phase 9)**: depends on all desired stories

### Story completion order

```text
Setup → Foundational ─┬─► US1 ─────────────┐
                      ├─► US2 ──┬──────────┼─► US4 ─► US5 ─┐
                      │         │          │               ├─► Polish
                      ├─► US3 ──┘          │               │
                      └─► US6 (after T050) ┴───────────────┘
```

### Within each story

- Test tasks first; confirm they fail (Principle III)
- Domain (`src/domain`) before adapter (`src/adapter`) before Property Inspector
- Locale keys can be added in parallel with the implementation
- The story checkpoint passes before the next priority starts (when working sequentially)

## Parallel Opportunities

- **Setup**: T002–T006 and T008–T011 run in parallel after T001; T007 runs after T001.
- **Foundational**: all test-harness and test tasks T012–T023 are parallel. The implementations T024, T025 and T027–T031 are parallel; T026 waits for T024/T025, T032 for T026/T027/T029/T030.
- **US1**: T036 ∥ T037 ∥ T042
- **US2**: tests T043–T047 in parallel; implementations T048 ∥ T049 ∥ T050 ∥ T054, then T051
- **US3**: tests T055–T059 in parallel; T060 ∥ T062 ∥ T066, then T061 → T063
- **US4**: tests T067–T070 in parallel; then T071 → T073/T074 (different files, both need T071) ∥ T072 ∥ T076
- **US6**: T082–T084 in parallel; T086 ∥ T087 ∥ T088 ∥ T089 ∥ T090 after T085
- **Across stories**: once Foundational is done, US1, US2 (domain parts), US3 (domain parts) and US6 (tests) can be worked on in parallel.

## Parallel Example: User Story 3

```bash
# Write all US3 tests together (they must fail):
Task: "Write tests/unit/domain/throttle.test.js"
Task: "Write tests/unit/domain/dial-controller.test.js"
Task: "Write tests/unit/domain/render/dial-feedback.test.js"
Task: "Write tests/integration/adapter/dial.test.js"
Task: "Write tests/integration/adapter/pi-bridge-capabilities.test.js"

# Then the independent implementations:
Task: "Implement src/domain/throttle.js"
Task: "Implement src/domain/render/dial-feedback.js"
Task: "Add dial locale keys to en.json and de_DE.json"
```

## Implementation Strategy

### MVP first

1. Phase 1 Setup, then Phase 2 Foundational, including the device validation T035
2. Phase 3 (US1): connection setup. **Stop and validate** with quickstart scenario 1.
3. Phase 4 (US2): Toggle keys. Together with US1 this is the first useful release (key-only).

### Incremental delivery

1. MVP (US1 + US2): key control with live state
2. + US3: fixed dial bindings, the main improvement over the original plugin
3. + US4: long-press editing with the Dynamic Dial (completes the original request)
4. + US5, US6: feature parity extras
5. Polish: constitution audits, documentation, cross-platform validation, packaging

### Notes

- [P] tasks touch different files and have no dependency on incomplete tasks
- Commit after each task or logical group, using Conventional Commits (`test:`, `feat:`, …)
- Never adopt code from ha-hub-ulanzi or other copyleft projects. Use them as an idea source only.
