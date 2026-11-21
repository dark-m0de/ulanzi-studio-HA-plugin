# Quickstart & Validation: Configurable Dial Press Actions

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Prerequisites, build and install are unchanged from
[feature 001's quickstart](../001-ha-deck-plugin/quickstart.md). For US4 you additionally need a
Home Assistant with:
- a media player that supports mute and next track
- a thermostat with at least two HVAC modes and presets
- a cover with stop support
- a fan with oscillation

HA's `demo` integration provides all of them.

## Automated checks

```bash
npm test
```

Covers ([data-model.md](data-model.md), [contracts](contracts/)):
- `dial-press` registry: supported actions per fixture entity, outcomes, `cycleNext`,
  `nextAttribute`
- edit session `switchAttribute`
- dial captions
- HA Dial and Dynamic Dial press handling end to end against the fake HA server
- backwards compatibility (settings without `pressAction`)

## Device scenarios (D200X)

1. **Dynamic Dial finishes editing (US1)**
   - Default settings. Long-press a light key, rotate the Dynamic Dial, press it.
   - Expected: edit mode ends (key normal, dial shows the hint), the light is unchanged and not
     toggled.
   - Repeat 20× including press-after-rotate: 0 toggles (SC-001).
   - Set "Toggle edited entity": the press toggles the light.
   - Set "No action": nothing happens.
   - Without edit mode, a press does nothing.
2. **HA Dial press options (US2)**
   - Brightness dial with "Set favourite value" 100: a press goes to 100 % and the display shows
     it immediately.
   - Colour temperature with 2700 K: a press sets 2700 K.
   - `input_number` with favourite 4: a press sets 4.
   - "Call a service" with valid data runs the service; with invalid JSON the settings page marks
     the field and a press shows an alert.
   - "No action": nothing.
   - A dial configured with version 0.1.x still toggles on press.
   - Hold the dial while rotating, then release: no press action.
3. **Switch controlled value (US3)**
   - HA Dial on a light with colour temperature: a press makes the caption change from
     brightness to colour temperature, and rotating changes the colour temperature. A second
     press switches back.
   - Dynamic Dial with "Switch controlled value" in edit mode: all Dynamic Dials and the key
     switch together.
   - On a light with brightness only: a press shows the hint "no other value".
   - Restart Ulanzi Studio: the HA Dial controls its configured value again.
4. **Domain actions (US4)**
   - Media player: mute toggles; next track skips.
   - Thermostat: mode and preset cycle through the device's lists and wrap around.
   - Cover: a press while it is moving stops it; when it is still, it toggles.
   - Fan: oscillation toggles; preset cycles.
   - The settings page only offers actions the selected entity supports.
5. **Localisation**: Every new option and hint appears in German and English.

Record the results in `specs/002-dial-press-actions/validation.md`.
