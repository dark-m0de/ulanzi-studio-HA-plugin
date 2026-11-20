# Research: Home Assistant Plugin for Ulanzi Deck with Dial Support

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-20

Sources: UlanziDeckPlugin-SDK (README, `manifest.md`, demos), plugin-common-node (README,
`package.json`), plugin-common-html (README), UlanziDeckSimulator README, the Home Assistant
WebSocket API documentation, and ha-hub-ulanzi as a feature reference only (no code adopted).
Items that cannot be settled from documentation are listed under **Open validations**. Each
has a default decision, so planning is not blocked.

---

## R-01 Main service runtime: Node.js vs HTML

- **Decision**: Node.js main service (`"CodePath": "dist/app.js"`), ES modules, bundled with
  esbuild.
- **Rationale**:
  - `common-node` is the official, maintained SDK path. It is ESM (`"type": "module"`) and
    already depends on `ws`, which we reuse for the HA WebSocket.
  - The same ES modules run unchanged in `node --test`. This is key for Principle II/III.
  - The official Node demo ships a single bundled `dist/app.js`, so bundling follows the
    reference pattern and avoids shipping `node_modules`.
- **Alternatives considered**:
  - *HTML main service (QWebEngineView)*: it has native WebSocket and Canvas, but the demos
    use classic `<script>` globals, and ES modules over `file://` are unreliable in
    Chromium. That would force either globals (hard to test) or a bundler anyway.
    ha-hub-ulanzi uses this approach.
  - *Unbundled Node with shipped `node_modules`*: larger plugin folder, and dependency
    resolution inside the plugin directory is undocumented.

## R-02 Bundler

- **Decision**: `esbuild` (MIT) as the only dev dependency. Output: `platform: 'node'`,
  `target: 'node20.12'`, `format: 'esm'`, single file.
  The optional native add-ons of `ws` (`bufferutil`, `utf-8-validate`) are marked
  `external`; `ws` falls back to its pure-JS implementation, so nothing native is shipped.
- **Rationale**: One small binary, near-zero config, fast. Webpack (used by the demo) is heavier
  for no benefit here.
- **Alternatives considered**: webpack (heavier), rollup (needs plugins for CJS deps), no
  bundler (see R-01).

## R-03 Pulling in the SDK libraries

- **Decision**:
  - `common-node` is an npm dependency pinned to a commit
    (`"ulanzideck-api": "github:UlanziTechnology/plugin-common-node#<sha>"`) and bundled.
  - `common-html` is vendored into `plugin/…/libs/common-html/` at a recorded commit, because
    Property Inspectors load classic scripts directly.
  - Both are added to NOTICE (Apache-2.0).
- **Rationale**: Reproducible builds. The SDK has no npm releases.
- **Alternatives considered**: git submodules (extra friction for contributors).

## R-04 Language and type safety

- **Decision**: Plain JavaScript with JSDoc types; no TypeScript compiler in the toolchain for
  v1.
- **Rationale**: Principle VI (no extra toolchain). JSDoc still gives editor type hints.
  `common-node` ships `apiTypes.d.ts` for SDK typings.
- **Alternatives considered**: TypeScript. It can be introduced later if the codebase grows.

## R-05 Test tooling

- **Decision**:
  - `node --test` with `node:assert/strict`.
  - `mock.timers` from `node:test` for long-press, throttle, edit-session timeout and backoff.
  - A scripted fake HA server built on `ws` (`WebSocketServer`).
  - Coverage via `--experimental-test-coverage`.
- **Rationale**: Zero extra dependencies, and it runs on the same Node major as the runtime.
- **Alternatives considered**: Vitest/Jest (extra dependencies with no needed feature).

## R-06 HA connection protocol

- **Decision**: HA WebSocket API at `<url>/api/websocket` (`http`→`ws`, `https`→`wss`).
  - Flow: `auth_required` → `auth` (access_token) → `auth_ok` → `get_states` →
    `subscribe_events` (`event_type: state_changed`).
  - Service calls go through `call_service` with an id-correlated `result`.
  - Heartbeat `ping`/`pong` every 30 s. A missing pong within 10 s means a dead socket, which
    leads to a reconnect.
  - Details: [contracts/ha-websocket.md](contracts/ha-websocket.md).
- **Rationale**: Push-based (FR-006), one connection for everything. Ping detects half-open
  sockets, a weakness observed in ha-hub-ulanzi (calls hung until a 10 s timeout).
- **Alternatives considered**:
  - `subscribe_entities` (compressed diffs): more efficient, but the diff format is more
    complex. Not needed at about 30 entities. Could be revisited later.
  - REST polling: violates FR-006.
- **Backoff**: 1 s, 2 s, 4 s … capped at 30 s, reset on `auth_ok`. On `auth_invalid` the client
  enters `auth_failed` and does **not** retry until credentials change (FR-005).

## R-07 Property Inspector ⇄ HA (connection test, entity list)

- **Decision**: Property Inspectors never connect to HA themselves. They send requests through
  `sendToPlugin`; the main service answers through `sendToPropertyInspector`.
  - Requests: test connection, list entities, entity capabilities.
  - Contract: [contracts/pi-messages.md](contracts/pi-messages.md).
- **Rationale**:
  - It removes the CORS requirement (`cors_allowed_origins`) that ha-hub-ulanzi documents. So
    the CORS assumption in the spec is satisfied by avoiding CORS entirely.
  - The token only flows PI → main service on save, never back (Principle V).
  - There is one HA connection (FR-006).
- **Alternatives considered**: a direct PI → HA WebSocket (CORS / origin issues, a second
  connection, the token held in more places).

## R-08 Connection settings storage

- **Decision**: `setGlobalSettings({ haUrl, haToken })` from the PI. The main service reads
  them with `getGlobalSettings` / `onDidReceiveGlobalSettings`. After saving, the PI shows the
  token field masked and only sends a new token if the user edits it.
- **Rationale**: FR-002 (enter once). The settings stay local in Ulanzi Studio (Principle V).

## R-09 Key rendering

- **Decision**: Render keys as **SVG strings** (viewBox 0 0 144 144), base64-encoded and sent
  with `setBaseDataIcon(context, data, '')`.
  - The render model (colours, status text, label, value, edit badge) is produced in
    `src/domain/render` and serialised to SVG there. It is pure and testable as string
    snapshots.
  - Fonts: generic `sans-serif` only.
- **Rationale**: The SDK documents SVG for `setBaseDataIcon`. No canvas or native module is
  needed in Node.
- **Alternatives considered**:
  - `node-canvas`: native binary per OS/arch, violates Principle VI.
  - Static state icons only: cannot show brightness or values (FR-012).
- **Risk**: SVG text rendering quality on the device is not documented, see V-02. Fallback:
  pre-rendered PNG backgrounds via `setPathIcon` plus the title text parameter for values.

## R-10 Dial display

- **Decision**:
  - The manifest uses `"Encoder": { "layout": "$UA1" }`.
  - At runtime: `setFeedbackLayout(context, '$UA1')` once per context, then
    `setFeedback(context, { title: { text }, icon: { value } })`.
  - `icon.value` is an SVG/PNG data URL, rendered like the key SVG at 100×100 and showing
    value and state.
  - `title.text` is the entity name, plus the value when the icon cannot render text.
- **Rationale**: Built-in layouts are the only ones supported in protocol V3.1.0. `$UA1` gives
  an icon area plus a title.
- **Risk**: whether `icon.value` accepts data URLs at runtime (manifest.md says pixmap values
  may be paths or data URLs), see V-03. Fallback: `$UA2` (two text lines: name / value).

## R-11 Long-press detection

- **Decision**:
  - The plugin handles `onKeyDown`/`onKeyUp` itself. A timer starts on key-down
    (default 500 ms). If it fires while the key is still held, the long-press action runs at
    once (edit mode starts while the key is held, as the spec assumes). On key-up the
    short-press action runs only if the timer did not fire.
  - `onRun` is **ignored** for Toggle keys to avoid a double toggle.
- **Rationale**: The SDK has no long-press event. Firing while held gives immediate feedback.
- **Risk**: whether `onRun` is emitted after a long hold, and its ordering relative to `keyup`,
  see V-01. Ignoring `onRun` makes this irrelevant, as long as `keydown`/`keyup` are delivered
  reliably.

## R-12 Multiple Dynamic Dials and the right-most fallback

- **Decision**:
  - Every context with the Dynamic Dial action registers with the `EditSession` broker.
  - Rotations from **any** registered Dynamic Dial apply to the same value, in order of
    arrival. All registered dials receive the same feedback.
  - Because the SDK delivers events per context, "all dials as input" is directly feasible.
    The right-most fallback (FR-032a) is therefore only implemented if V-04 shows it is
    needed.
  - If needed, "right-most" is the context with the largest column index in the `key`
    component of `decodeContext(context)`.
- **Rationale**: This matches the clarified primary behaviour and avoids speculative code
  (Principle VI).

## R-13 Throttling and optimistic display

- **Decision**:
  - A per-entity throttle with a 200 ms window sends the leading call immediately, then at
    most one call per window, and **always** a trailing call with the latest target value
    (FR-024, at most 5 calls/s).
  - The optimistic target is kept until 1.5 s after the last local input or until HA reports
    a value equal to the target, whichever comes first. During that window, incoming state
    updates do not overwrite the display (edge case "jump back").
- **Rationale**: Meets SC-003/SC-004 without flicker.
- **Alternatives considered**: a pure trailing debounce (the light only reacts after you stop
  turning, which feels laggy).

## R-14 Service mapping per controllable attribute

- **Decision**: See the table in [contracts/ha-websocket.md](contracts/ha-websocket.md).
  Highlights:
  - Brightness: `light.turn_on` with `brightness_pct`. Below 1 % → `light.turn_off` if
    "turn off at 0 %" is set.
  - Colour temperature: `color_temp_kelvin`, bounds `min/max_color_temp_kelvin`.
  - Media player: `media_player.volume_set` with `volume_level` 0–1; press →
    `media_player.media_play_pause`.
  - Climate: `climate.set_temperature`, bounds `min_temp`/`max_temp`, step
    `target_temp_step` (default 0.5). Press → `turn_on`/`turn_off` depending on the current
    state.
  - Cover: `cover.set_cover_position`, only if `supported_features & 4`.
  - Fan: `fan.set_percentage`, step `percentage_step`.
  - Numbers: `input_number.set_value` / `number.set_value`, using the entity's
    `min`/`max`/`step`.
- **Capability detection** (FR-022): brightness if `supported_color_modes` contains anything
  other than `onoff`; colour temperature if it contains `color_temp`; other domains via
  `supported_features` bits or the presence of attributes.
- **Minimum HA version**: 2024.1. Kelvin attributes and all services above are available there.

## R-15 Localisation

- **Decision**:
  - `en.json` and `de_DE.json` in the plugin root are the single source of strings. They hold
    `Name`, `Description`, `Actions[]`, and `Localization` (PI keys plus runtime keys such as
    `status.on`, `hint.longPress`, `error.auth`).
  - The main service loads the file matching `process.argv[4]` (language) and falls back to
    `en`.
  - The domain layer returns message keys only.
- **Rationale**: Platform constraint (no hard-coded strings), one source for PI and runtime.

## R-16 Plugin identity

- **Decision**:
  - Plugin name `hadeck`. Folder `com.ulanzi.hadeck.ulanziPlugin`. Main UUID
    `com.ulanzi.ulanzistudio.hadeck`.
  - Actions: `.toggle`, `.dial`, `.dynamicdial`, `.scene`, `.sensor`, `.service`.
- **Rationale**: Must not collide with the existing official HA plugin or ha-hub-ulanzi
  (`…hahub`).

## R-17 Logging and token redaction

- **Decision**:
  - All logging goes through `src/adapter/logger.js`, which calls `$UD.logMessage(msg, level)`.
  - The logger replaces the current token and any `access_token` / `Authorization` values
    with `***`.
  - Entity IDs and states are logged only at `debug`.
- **Rationale**: Principle V. Unit-tested (log output must never contain the token).


## R-18 SDK console output and token leakage (found while reading `common-node` @ 9e478b2)

- **Finding**: `ulanzideck-api` writes every inbound and outbound protocol message to the
  console (`Utils.log` in `onmessage`, `console.warn` in `send`, `console.warn` in
  `setSettings`). This includes `didReceiveGlobalSettings` / `setGlobalSettings` payloads, i.e.
  the **HA token**, whenever Ulanzi Studio captures the plugin's stdout/stderr.
  `connect()` also consumes `process.argv` via `splice(2)`, so address, port and language must be
  read from `$UD.address` / `$UD.port` / `$UD.language` after `connect()`, not from `argv`.
- **Decision**: Before calling `$UD.connect()`, the adapter installs a console filter
  (`src/adapter/logger.js`, `installConsoleRedaction`) that runs every `console.log/info/warn/error`
  argument through the same redactor as `logMessage` (current token, `access_token`,
  `haToken`, `Authorization: Bearer …` → `***`). This wraps our own process's console and does
  not modify SDK code, so Principle I is respected; Principle V is enforced. Covered by T021.
- **Alternatives considered**: forking/patching the SDK (violates Principle I and complicates
  updates); not storing the token in global settings (would break FR-002).

---

## Open validations (device / Studio behaviour not covered by documentation)

Each item had a default decision so planning was not blocked. All items were validated on a D200X
by the project owner on 2026-11-20; every default decision holds, so no fallback is needed
(in particular the right-most Dynamic Dial fallback, T077, is not required). The checks are part of
[quickstart.md](quickstart.md) and should run early in implementation.

| ID | Question | Default decision | If the check fails | Result (2026-11-20) |
|---|---|---|---|---|
| V-01 | Are `keydown`/`keyup` delivered reliably for every press? Is `run` also emitted after a long hold? | Use `keydown`/`keyup`, ignore `run` | Derive long-press from `run` timing (degrades to fire-on-release) | ✅ Passed on device – default decision kept |
| V-02 | Does the device render SVG passed to `setBaseDataIcon`, including `<text>`? | SVG keys | PNG background via `setPathIcon` plus the title text parameter | ✅ Passed on device – default decision kept |
| V-03 | Does `setFeedback` accept a data URL in `icon.value`? | Data URL icon in `$UA1` | `$UA2` text-only layout | ✅ Passed on device – default decision kept |
| V-04 | Do multiple Dynamic Dial contexts all receive rotate events independently? | All dials act as input | Implement the right-most fallback (R-12) | ✅ Passed on device – default decision kept |
| V-05 | Lowest Ulanzi Studio version that supports `setFeedback`/`setFeedbackLayout` on the D200X | `"Software": { "MinVersion": "3.3.0" }` | Raise the version, or use `setBaseDataIcon` on encoder contexts if supported | ✅ Passed on device – default decision kept |
| V-06 | Is `onSetActive(false)` sent for contexts on a page that is switched away from? | End edit mode on `setactive:false` of the edited key | Also end it on `clear` and on any key-down on another page | ✅ Passed on device – default decision kept |
| V-07 | Plugin install directory on macOS/Windows for `dev-link` | macOS `~/Library/Application Support/Ulanzi/UlanziDeck/Plugins`, Windows `%APPDATA%\Ulanzi\UlanziDeck\Plugins` | Make it configurable through an env var | ✅ Passed on device – default decision kept |
