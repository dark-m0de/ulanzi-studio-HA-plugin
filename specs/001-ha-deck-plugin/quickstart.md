# Quickstart & Validation Guide

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

This guide shows how to build, run and validate the plugin end to end. Contracts are described
in [contracts/](contracts/), entities and state machines in [data-model.md](data-model.md).

## Prerequisites

- Node.js ≥ 20.12 (`nvm use` picks it up from `.nvmrc`)
- Ulanzi Studio (version per V-05) on macOS or Windows. A D200X is needed for the dial
  scenarios.
- A Home Assistant instance (≥ 2024.1) with a long-lived access token (Profile → Security).
  It needs at least one dimmable light, one switch, one media player and one sensor. HA's
  `demo` integration provides all of them.
- Optional: UlanziDeckSimulator (from the SDK repository) for key/dial events without
  hardware. It does not render dial feedback, and you start the main service yourself.

## Build and test

```bash
npm install
```

```bash
npm test
```

```bash
npm run build
```

```bash
npm run dev:link
```

- `npm test` runs all unit and integration tests (fake HA server, fake `$UD`) and must pass
  with no device.
- `npm run build` writes `plugin/com.ulanzi.hadeck.ulanziPlugin/dist/app.js`.
- `npm run dev:link` symlinks the plugin folder into the Ulanzi Studio plugin directory (V-07).
  Restart Ulanzi Studio afterwards.

Debugging: start Ulanzi Studio with `--log --nodeRemoteDebug`. The manifest `Inspect` port is
`127.0.0.1:9231`.

## Simulator check (no hardware)

Use this to check the SDK adapter (constitution Principle III, SHOULD) whenever adapter code
changes. The simulator does not render dial feedback and does not start the main service.

1. In a clone of the UlanziDeckPlugin-SDK, run `npm install` and `npm start` inside
   `UlanziDeckSimulator/`, then open `http://127.0.0.1:39069`.
2. Copy or symlink `plugin/com.ulanzi.hadeck.ulanziPlugin` into `UlanziDeckSimulator/plugins`
   and click *Refresh Plugin List*.
3. Start the main service yourself:
   `node plugin/com.ulanzi.hadeck.ulanziPlugin/dist/app.js 127.0.0.1 <simulator port> en`.
   Confirm in the simulator that the main service is connected.
4. Drag HA Toggle, HA Dial and HA Dynamic Dial onto slots and configure them through the PI.
5. Expected:
   - Toggle key: a short press toggles the HA entity; holding for 500 ms or longer starts edit
     mode without toggling (key icon changes).
   - Dial: `dialrotate` events change the HA value (check in the HA UI); `dialdown` runs the
     press action.
   - The simulator log shows no errors and no token.

## Early device validations (run first)

These resolve the open questions in [research.md](research.md#open-validations-device--studio-behaviour-not-covered-by-documentation).
Record the result of each item in research.md.

| ID | Procedure | Pass if |
|---|---|---|
| V-01 | Toggle key: short press 20×, hold 1 s 20× (debug log on) | each press logs exactly one `keydown` and one `keyup`; no double toggle |
| V-02 | Toggle key bound to a light that is on | the key shows the SVG with status, label and brightness text legibly |
| V-03 | HA Dial bound to brightness | the dial area shows the icon (data URL) and the title |
| V-04 | Assign Dynamic Dial to two encoder slots and long-press a light key | rotating either dial changes the brightness; both displays stay in sync |
| V-05 | Install on the lowest Studio version you want to support | dial feedback appears; otherwise raise `MinVersion` |
| V-06 | Start edit mode, then switch the deck page | edit mode ends (the key shows its normal style when you return) |

## Validation scenarios (map to spec user stories)

1. **Connection (US1)**: Start a stopwatch on a fresh install. Add an HA Toggle. In the PI,
   enter the URL and token, then press *Test connection*.
   - Expected: "Connected – N entities".
   - Change the token to an invalid value and test again → "Authentication failed". The log
     shows no reconnect loop and no token.
   - Add a second action: the connection fields are prefilled.
   - Restart HA: the keys show "disconnected", then recover within 30 s (SC-006).
   - Stop the stopwatch once the first light key toggles the light (scenario 2): target
     < 3 min (SC-001).
2. **Toggle key (US2)**: Bind `light.<x>`.
   - A short press toggles it, and the key shows the state and brightness %.
   - Toggle it in the HA UI → the key updates in ≤ 1 s.
   - Disable the entity in HA → the key shows unavailable.
3. **HA Dial (US3)**: Bind a dial to `light.<x>` / brightness.
   - Each detent changes the value by 5 %, and the display updates immediately.
   - Hold the dial while rotating → 20 % steps.
   - A fast spin from 0 to 100 % sends ≤ 5 calls/s. Check in the HA logbook or with debug
     logging. The final value equals the display (SC-004).
   - Timing (SC-003), from debug-log timestamps: detent → `setFeedback` < 100 ms; last
     detent → HA `state_changed` with the final value ≤ 500 ms.
   - Disconnect HA (stop it) and rotate: the display shows disconnected, nothing is sent after
     HA comes back.
   - Rotating right with the light off turns it on.
   - At minimum brightness, rotating left turns it off.
   - A dial press toggles the light.
   - Bind a media player: a press toggles play/pause; rotation changes the volume.
   - The PI offers only supported attributes, e.g. no colour temperature for a
     brightness-only lamp.
4. **Long-press edit (US4)**: Assign one Dynamic Dial. Hold a light key for 500 ms or longer.
   - The key shows the edit style while still held, and the light is **not** toggled.
   - The Dynamic Dial shows the light's name and brightness, and rotating changes it.
   - A short press on the key, 10 s of inactivity, or a page switch ends edit mode.
   - Long-press a different light key → edit switches to it.
   - Long-press a switch key → it toggles, or the configured long-press alternative runs.
   - Remove the Dynamic Dial and long-press a light key → hint "no Dynamic Dial configured".
5. **Other domains (US5)**: Long-press a media player key → the Dynamic Dial controls the
   volume. Long-press a climate key → it controls the temperature in entity steps.
6. **Other key actions (US6)**:
   - The scene key activates the scene and gives brief visual confirmation.
   - The sensor key shows value and unit and updates in ≤ 1 s.
   - A service key with `light.turn_on` `{"brightness_pct":100}` works. A deliberately wrong
     service name shows an alert.
7. **Localisation**: Switch Ulanzi Studio to German → the PI and key texts are German. English
   works as well.
8. **Persistence (FR-042)**: With keys and dials configured, quit and restart Ulanzi Studio,
   then reboot the computer. All bindings, settings and the connection are still there, and
   the keys show live state again without re-entering anything.
9. **Stability (SC-007)**: 30 bound actions, 24 h run. Note the RSS of the plugin process
   (Activity Monitor / Task Manager) after 1 h and after 24 h. Pass if there is no crash in the
   log and the 24 h value is at most 20 % above the 1 h value.

## Packaging

```bash
npm run package
```

This produces `com.ulanzi.hadeck.ulanziPlugin.zip` for distribution. LICENSE and NOTICE are
included in the plugin folder.
