# HA Deck 0.2.0 – Configurable dial press

## New

- **HA Dial: action on press.** Choose per dial what a press does:
  - **Default** – as before: toggle (lights, switches, fans, covers), play/pause (media players), on/off (thermostats)
  - **Switch controlled value** – e.g. brightness ↔ colour temperature on one dial; the dial shows which value is active
  - **Set favourite value** – e.g. 100 % brightness, 2700 K or a fixed `input_number` value
  - **Mute on/off** and **Next track** (media players)
  - **Cycle operating mode** and **Cycle preset** (thermostats), **Cycle preset** and **Oscillation on/off** (fans)
  - **Stop or open/close** (covers: stops while moving)
  - **Call a service** (domain, service, targets, JSON data)
  - **No action**

  The settings page only offers actions that the selected entity supports.
- **HA Dynamic Dial: action on press** – end editing, toggle the edited entity, switch the controlled
  value (all Dynamic Dials and the edited key follow), or no action.
- Entities with more than one controllable value show a short name of the active value on the dial
  and on the edited key.

## Changed behaviour

- **Pressing the HA Dynamic Dial now ends editing by default** (like "done") instead of toggling the
  edited entity. The old behaviour is available as "Toggle edited entity" in the Dynamic Dial
  settings. HA Dials keep their previous press behaviour unless you change it.

## Fixed

- A long press on an HA Toggle key no longer ends edit mode right away while Ulanzi Studio is open
  (Studio re-sends the key settings when the key is selected).
- The dial display no longer briefly replaces the D200X idle clock after editing: dials send nothing
  while inactive, and after an edit-mode timeout the Dynamic Dial shows its idle hint with the next
  input on the deck.

## Notes

- Pressing a dial while rotating it still triggers no press action.
- A long press on dials is not part of this release.
