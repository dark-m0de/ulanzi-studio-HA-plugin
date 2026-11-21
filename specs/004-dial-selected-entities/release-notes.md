# HA Deck 0.4.0 – Dynamic Dial for selected values

## New

- **Long press: "Dynamic Dial for selected values".** An HA Toggle key can now let the Dynamic Dial
  control values you choose, instead of its own entity. Each entry is an entity plus one of its
  values, for example:
  - a light switch (on/off only) on the key, with the brightness of the ceiling lamp
  - the brightness and the colour temperature of one lamp
  - the positions of two shutters and the volume of the media player
- **Jump between values.** With several values, a press on the Dynamic Dial jumps to the next value
  and back to the first after the last. The dial and the key show the entity name, the value name and
  the current value. Each new long press starts again with the first value.
- **Selecting values in the settings.** Search for an entity, then add its values with one click.
  Only entities with a value the dial can control are suggested. Entries appear as
  "name · value" and can be removed individually; the order is the jump order.

## Unchanged

- The short press still toggles the key's own entity, in every mode.
- The standard long-press mode "Edit with Dynamic Dial" and all other modes behave as before.
  Existing keys need no changes.
- With a single selected value, the Dynamic Dial's configured press action applies (default: end
  editing).

## Notes

- With two or more selected values the dial press is reserved for jumping. End editing by pressing
  the key, by waiting (10 s by default) or by switching pages.
- Values that are unavailable (e.g. a device that is offline) are skipped. If the value you are
  editing becomes unavailable, editing moves to the next one, or ends when none is left.
- The selectable values are the ones the HA Dial already supports; no new values were added.
