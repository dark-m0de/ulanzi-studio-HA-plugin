# Implementation Plan: Home Assistant Plugin for Ulanzi Deck with Dial Support

**Branch**: `001-ha-deck-plugin` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-ha-deck-plugin/spec.md`

## Summary

An Ulanzi Studio plugin that controls Home Assistant from Ulanzi Deck keys and – as the key
differentiator – from the D200X rotary dials. Dials can be bound permanently to an entity
attribute ("HA Dial") or follow whichever entity is put into *edit mode* by long-pressing its
key ("HA Dynamic Dial").

Technical approach (see [research.md](research.md)): a **Node.js main service** written as
plain ES modules, built on the official `common-node` SDK library and bundled with esbuild
into a single `dist/app.js`, as in the official Node demo. The code is split into three layers:
`src/ha` (HA WebSocket client), `src/domain` (pure logic: entity store, controllable
attributes, dial/long-press/throttle/edit-session logic, SVG render models, i18n) and
`src/adapter` (SDK events → domain → icons/feedback). Property Inspectors are HTML pages using
`common-html`. They never talk to Home Assistant directly; they ask the main service through
`sendToPlugin`, which avoids CORS. Keys are rendered as SVG strings sent with
`setBaseDataIcon`; dials use the built-in `$UA1` feedback layout. Tests use the Node built-in
test runner with a fake HA WebSocket server and mocked timers.

## Technical Context

**Language/Version**: JavaScript (ES2022, ES modules) with JSDoc type annotations. The plugin
runtime is the Node.js 20.12.2 bundled with Ulanzi Studio; local development needs Node.js
≥ 20.12 (pinned via `.nvmrc`).

**Primary Dependencies**:
- Runtime (bundled): `ulanzideck-api` (= UlanziTechnology/plugin-common-node, Apache-2.0,
  pinned to a commit) and `ws` (MIT). `ws` is already required by `ulanzideck-api`; it is
  declared as an explicit dependency (same major) because our code imports it directly for the
  HA connection, so it adds no new package to the bundle. Its optional native add-ons
  (`bufferutil`, `utf-8-validate`) are marked external and not shipped.
- Property Inspector: `common-html` (UlanziTechnology/plugin-common-html, Apache-2.0),
  vendored into the plugin folder.
- Dev only: `esbuild` (MIT) for bundling. Tests use only Node built-ins (`node:test`,
  `node:assert`, `mock.timers`) plus `ws` for the fake HA server.

**Storage**: Ulanzi Studio settings: global settings hold the HA URL and token, per-action
settings hold the binding configuration. There are no own files or databases.

**Testing**: `node --test` (unit and integration; no glob argument, Node 20 discovers
`*.test.js` files itself) with `mock.timers` for time-dependent logic
and a scripted fake HA WebSocket server (`tests/support/fake-ha-server.js`). A fake `$UD`
records adapter output. Device and simulator checks are manual, per [quickstart.md](quickstart.md).

**Target Platform**: Ulanzi Studio (minimum version to be confirmed by validation V-05;
default `3.3.0`) on Windows 10+ and macOS. Devices: all Ulanzi Deck models for key actions;
dial actions only on encoder devices (D200X).

**Project Type**: Desktop application plugin (Ulanzi Studio plugin: long-running Node main
service + HTML Property Inspectors).

**Performance Goals**: Display reacts to a dial detent in < 100 ms; the light reaches the final
value ≤ 500 ms after the last detent; HA state changes are visible in ≤ 1 s (p95) (SC-002, SC-003).

**Constraints**: ≤ 5 service calls/s per entity, and the last value is always sent (FR-024).
Reconnect backoff is capped at 30 s, with no retries on auth failure (FR-004, FR-005). The
token never appears in logs. No telemetry. The plugin talks only to the configured HA host.
Bundle size stays small, with no native modules.

**Scale/Scope**: About 30 bound keys/dials per installation, one HA instance, 24 h of
continuous operation with RSS after 24 h at most 20 % above the 1 h value (SC-007). 6 actions, 2 Property Inspector
languages (de, en).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle / Section | Gate | Pre-research | Post-design |
|---|---|---|---|---|
| I | SDK Conformance | Only documented SDK APIs; manifest/UUID conventions; min. Studio version stated | ✅ Uses `common-node`/`common-html` APIs only; UUID `com.ulanzi.ulanzistudio.hadeck[.<action>]`; folder `com.ulanzi.hadeck.ulanziPlugin` | ✅ [contracts/plugin-actions.md](contracts/plugin-actions.md) uses only documented events and commands; SDK gaps (no long-press event, no dial takeover) are handled inside the plugin and documented in the spec |
| II | Layer Separation | `src/ha` and `src/domain` do not import the SDK; time/socket/output are injected; runnable without a device | ✅ Three-layer structure planned | ✅ `src/domain` only gets plain inputs and returns render models; `src/ha` gets a socket factory and a clock |
| III | Test-First | Tests before implementation for HA client, value calc, long-press, throttle, edit mode; fake timers; fake HA server; one test command | ✅ `node --test`, `mock.timers`, fake HA server | ✅ Test layout in Project Structure; `npm test` is the single command |
| IV | Responsive & Robust | Optimistic display, batching, backoff ≤ 30 s, stop on auth error, visible errors, failure isolation | ✅ Covered by FR-004/005/024/040 | ✅ State machines in [data-model.md](data-model.md); each action's handlers are wrapped in an error boundary |
| V | Security & Privacy | Token local only, never logged; no telemetry; single host; bundled resources | ✅ Token in Studio global settings; logger redacts | ✅ PI never receives the token back after save (a masked placeholder is shown); no external URLs in the PI |
| VI | Simplicity | Only spec features; minimal dependencies with justification | ✅ 1 runtime dependency (the SDK, which brings `ws`), 1 dev dependency (`esbuild`) | ✅ No framework in the PI; SVG strings instead of a canvas library |
| — | Platform Constraints | Windows + macOS; DE/EN via SDK localisation; encoder actions restricted by manifest | ✅ | ✅ `Controllers`/`Devices` set per action; `de_DE.json`/`en.json` are the single source of strings |
| — | Licensing & Provenance | Apache-2.0; only permissive dependencies; NOTICE updated | ✅ Apache-2.0, MIT only | ✅ NOTICE must list common-node, common-html and ws when they are added (tracked as a task) |
| — | Development Workflow | spec-kit flow, Conventional Commits, review against constitution | ✅ | ✅ |

**Result**: PASS, no violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-ha-deck-plugin/
├── plan.md              # This file
├── research.md          # Phase 0: decisions and rationale
├── data-model.md        # Phase 1: entities, validation, state machines
├── quickstart.md        # Phase 1: build/run/validation guide
├── contracts/
│   ├── plugin-actions.md    # Actions, controllers, per-action settings, SDK events used
│   ├── pi-messages.md       # Property Inspector ⇄ main service message protocol
│   └── ha-websocket.md      # HA WebSocket subset and service calls per attribute
└── tasks.md             # Phase 2 output (/speckit-tasks – not created here)
```

### Source Code (repository root)

```text
package.json                 # "type": "module"; scripts: test, build, package, dev:link
.nvmrc                       # 20
.editorconfig
.github/workflows/test.yml   # CI: npm test + build on macOS, Windows, Linux
scripts/
├── build.mjs                # esbuild: src/adapter/main.js → plugin/…/dist/app.js
├── package.mjs              # zip plugin folder → com.ulanzi.hadeck.ulanziPlugin.zip
└── dev-link.mjs             # symlink plugin folder into Ulanzi Studio plugins dir

src/
├── ha/                      # Layer 1 – Home Assistant client (no SDK imports)
│   ├── client.js            # connect/auth/get_states/subscribe/call_service/ping
│   ├── backoff.js           # reconnect delays, stop on auth_invalid
│   └── messages.js          # message builders and parsers
├── domain/                  # Layer 2 – pure logic (no SDK, no I/O)
│   ├── entity-store.js      # state mirror and change notifications
│   ├── attributes/          # controllable attributes: read/step/clamp/toServiceCall
│   │   ├── index.js         # registry + supportedAttributes(entity)
│   │   ├── light.js  media-player.js  climate.js  cover.js  fan.js  number.js
│   ├── entity-control.js    # shared per entity: one throttle, optimistic value per attribute
│   ├── dial-controller.js   # detent → value via shared EntityControl; stale-update guard
│   ├── throttle.js          # leading+trailing throttle (200 ms window)
│   ├── long-press.js        # press detector (threshold, fires while held)
│   ├── edit-session.js      # single edit session, timeout, switch, end reasons
│   ├── press-actions.js     # domain-dependent toggle/play-pause/on-off
│   ├── render/              # render models + SVG serialisation
│   │   ├── key-model.js     # KeyRender models per action (toggle, edit, trigger, sensor, service)
│   │   ├── key-svg.js  dial-feedback.js  theme.js
│   └── i18n.js              # message keys → strings from locale files
└── adapter/                 # Layer 3 – SDK binding
    ├── main.js              # bundle entry: real $UD, ws socket factory, locale files
    ├── app.js               # createApp(): $UD.connect, wiring, global settings (testable)
    ├── pi-handlers.js       # PI request handlers (connection.*, entities.list, …)
    ├── logger.js            # $UD.logMessage wrapper with token redaction
    ├── pi-bridge.js         # handles pi-messages contract
    └── actions/
        ├── action-base.js   # shared base: binding, entity subscription, render hook, dispose
        ├── toggle.js  dial.js  dynamic-dial.js  scene.js  sensor.js  service.js

plugin/com.ulanzi.hadeck.ulanziPlugin/      # the installable plugin folder
├── manifest.json
├── en.json  de_DE.json                   # names, tooltips, Localization strings
├── dist/app.js                           # build output (git-ignored)
├── resources/                            # action/category icons (SVG)
├── libs/common-html/                     # vendored SDK for Property Inspectors
└── property-inspector/
    ├── shared.css  shared.js             # connection block, entity picker, messaging
    ├── toggle.html  dial.html  dynamic-dial.html  scene.html  sensor.html  service.html

tests/
├── support/
│   ├── fake-ha-server.js    # scripted HA WebSocket server (ws)
│   ├── fake-ud.js           # records SDK commands, emits SDK events
│   └── fixtures/            # HA state JSON per domain
├── unit/                    # domain + ha/backoff + ha/messages
│   ├── locales.test.js      # en/de key parity, all used keys exist
│   └── architecture.test.js # layer import rules, no external URLs
└── integration/             # ha/client ⇄ fake server; adapter ⇄ fake $UD + fake server
```

The feature directory additionally receives `specs/001-ha-deck-plugin/validation.md` (device
and cross-platform validation results, created during implementation).

**Structure Decision**: A single project with one installable plugin folder. Sources live
outside the plugin folder (`src/`) and are bundled into `plugin/…/dist/app.js`. That keeps the
installable folder minimal and keeps layer 1 and 2 importable from tests without the SDK.
Property Inspector assets are plain files inside the plugin folder (no build step).

## Complexity Tracking

No constitution violations, so nothing to justify.
