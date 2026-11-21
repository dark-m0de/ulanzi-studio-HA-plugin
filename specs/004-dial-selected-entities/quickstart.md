# Quickstart & Validation: Dynamic Dial for Selected Values

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Prerequisites, build and install are unchanged from
[feature 001's quickstart](../001-ha-deck-plugin/quickstart.md). For the device scenarios you need
a Deck with a dial and a Home Assistant with the following (HA's `demo` integration provides
most of them):
- a switch or an on/off-only light
- a lamp with brightness and colour temperature
- a second dimmable lamp
- a cover with position
- a media player

## 1. Automated checks

```bash
npm test
```

Tests to write first (red), per [contracts/edit-session-targets.md](contracts/edit-session-targets.md):

- **`parseSelectedValues`**: every row of contract §1.
- **`targetUsable`**: every row of contract §2.
- **Broker**:
  - every scenario of contract §3, with a manual clock for the timer re-arm
  - existing tests stay green after adding `targets: []` and `targetIndex: -1` to the classic
    session
- **Integration, Toggle key** (contract [toggle-selected-values-settings.md](contracts/toggle-selected-values-settings.md) §2):
  - A `switch.coffee` key with `edit_values` and `[desk/brightness]`: holding shows `EDIT` with
    the desk value and name; rotating sends `light.turn_on` to `light.desk` only.
  - Short press ends the session; the next short press toggles `switch.coffee`.
  - An empty or invalid `editValues`, or only unusable entries → alert, no `call_service`.
  - The classic `edit` mode and missing `longPress` behave as before.
  - Changing `editValues` or `longPress` while the key is the source ends the session; an
    identical re-send does not.
- **Integration, Dynamic Dial**:
  - With `[living_room/brightness, desk/brightness, desk/color_temp]`:
    - a press jumps to desk brightness, then to desk colour temperature, then wraps around;
    - after each jump, the dial title shows the entity name and the caption the value name, and
      rotating changes only the current value (colour temperature sends `color_temp_kelvin`);
    - a press while rotating does not jump.
  - With one target, the configured press action applies (default: end editing).
  - A jump restarts the timeout.
  - The current target's entity becomes unavailable → the session moves to the next usable
    entry; when none is left, edit mode ends.
- **PI bridge**: `entity.capabilities` returns `friendlyName` (known entity) and `null`
  (unknown entity).
- **Locales**: the new `pi.longPress.editValues*` keys exist in `en.json` and `de_DE.json`.

## 2. Device scenarios

- **V-01 Single value (US1)**: Toggle key on the switch, mode "Dynamic Dial for selected values",
  value: lamp · brightness.
  1. Hold the key, then turn the dial: the lamp dims and the switch does not change.
  2. The key shows `EDIT`, the lamp's name and the value.
  3. Short press ends edit mode; another short press toggles the switch.
- **V-02 Backwards compatibility (SC-005)**: existing Toggle keys behave as before in the
  modes `edit`, `disabled`, `entity` and `service`.
- **V-03 Jumping (US2)**: four values: lamp A · brightness, lamp A · colour temperature,
  cover · position, media player · volume.
  1. Hold the key: lamp A brightness.
  2. Press the dial three times: colour temperature → position → volume. Each step shows the
     right name and value immediately (SC-002), and turning changes only the shown value
     (SC-004).
  3. A fourth press goes back to lamp A brightness.
- **V-04 Restart (US2)**: end edit mode at "position", then hold the key again: editing starts
  at lamp A brightness.
- **V-05 One value (US2)**: with a single value, a dial press ends editing (default press action).
- **V-06 Unavailable entries**:
  - Unplug the cover: it is skipped when jumping.
  - Unplug the lamp while it is being edited: editing moves to the next value.
  - All entities unavailable at the long press: the key alerts and nothing is switched.
- **V-07 PI (US3)**:
  1. Set up the four values from V-03 without typing IDs, in under 2 minutes (SC-001).
  2. The chips read "<name> · <value>"; values already listed are not offered again.
  3. Remove one entry and reopen the PI: the list is persisted.
  4. Switch to "Call a service" and back: the list is still there.
- **V-08 Language**: in Ulanzi Studio set to German, the mode, hint, labels and remove button
  are in German.

Record the results (pass/fail per scenario, device, OS) in `validation.md` before the release.
