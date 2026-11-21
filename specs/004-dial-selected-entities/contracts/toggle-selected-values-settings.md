# Contract: Toggle Key "Dynamic Dial for Selected Values"

**Feature**: [../spec.md](../spec.md) | Covers FR-001–FR-008, FR-016, FR-018

## 1. Settings

HA Toggle action (`com.ulanzi.ulanzistudio.hadeck.toggle`):

```json
{
  "entityId": "switch.living_room_light",
  "longPress": "edit_values",
  "editValues": "[{\"entityId\":\"light.desk\",\"attributeId\":\"light.brightness\"},{\"entityId\":\"light.desk\",\"attributeId\":\"light.color_temp\"},{\"entityId\":\"cover.blinds\",\"attributeId\":\"cover.position\"}]"
}
```

- `longPress` gets the new value `"edit_values"`. All other values (`edit` as the default,
  `disabled`, `entity`, `service`) are unchanged.
- `editValues` is optional. The PI writes it as compact JSON; the plugin also accepts an
  already-parsed array. Invalid content is treated as an empty list.
- `editValues` is only evaluated when `longPress === "edit_values"`. It is kept when another
  mode is selected.

## 2. Runtime behaviour of the key

| Situation (`longPress: edit_values`) | Long press result |
|---|---|
| not connected | key alert (unchanged) |
| list empty, invalid, or no usable entry | key alert; **no** service call |
| ≥1 usable entry, no Dynamic Dial | toast `hint.noDynamicDial` |
| ≥1 usable entry, ≥1 Dynamic Dial | edit mode for the first usable entry |

- The short press always toggles `entityId` (FR-001). While edit mode is active, the short press
  ends edit mode instead (unchanged FR-034 of feature 001).
- While the key is the edit source in `edit_values` mode, it shows:
  - the badge `EDIT`;
  - the edited entity's friendly name as the label (the key label is ignored);
  - the value's short name (`attr.short.<id>`) when the list has ≥ 2 entries, or when the entity
    has ≥ 2 values;
  - the live value.

## 3. Property Inspector (`toggle.html`)

Long-press select: a new option `<option value="edit_values" data-localize="pi.longPress.editValues">`,
placed directly after `edit`.

Section, shown only for `data-mode="edit_values"`:

```text
hadeck-hint   pi.longPress.editValues.hint
uspi-item     label pi.longPress.editValues.list
              chips: "<friendly name or entity ID> · <pi.attribute.<id>>"  [✕ aria-label pi.longPress.editValues.remove]
uspi-item     label pi.entity
              search input (no name), placeholder pi.entity.placeholder,
              picker domains [light, media_player, climate, cover, fan, input_number, number]
              with controllable: true (§4a), onChoose → load entity.capabilities
uspi-item     value row: one button "+ <pi.attribute.<id>>" per supported value not yet listed,
              or the hint pi.attribute.none
hidden        <input type="hidden" name="editValues">
```

| Action | Result |
|---|---|
| Choose an entity in the search | the search input is cleared; the value row shows that entity's values |
| Click "+ <value>" | the pair is appended (unless already listed); hidden input rewritten; `change` dispatched; the button disappears from the row |
| Click ✕ | the entry is removed; hidden input rewritten; `change` dispatched |
| Settings loaded (`hadeck:load`) | chips re-rendered from the hidden input (same normalisation as the plugin); names fetched via `entity.capabilities` once per distinct entity |
| Entity unknown | the chip shows the entity ID and stays removable |
| Mode ≠ `edit_values` | section hidden; value kept |

All chips and buttons are built with DOM APIs (`textContent`), never `innerHTML` with entity data.

### `shared.js` change

`mountEntityPicker(input, { domains, onChoose, clearOnChoose })`:
- `onChoose(entityId)`, when given, replaces "write the ID into the input + dispatch change";
- `clearOnChoose: true` empties the input afterwards.
- `controllable: true` is forwarded to `entities.list` (§4a).

Existing callers are unchanged.

## 4. PI request `entity.capabilities` (extended)

The response gets `friendlyName: string | null`:
- the entity's friendly name, or `null` when the entity is unknown;
- the response for an unknown entity is `{ friendlyName: null, attributes: [], longPressEligible: false, pressActions: {} }`.

All other fields are unchanged.

## 4a. PI request `entities.list` (extended)

It gets the new optional parameter `controllable: boolean`.

- `true`: only entities with at least one supported controllable value
  (`supportedAttributes(entity).length > 0`) are returned, after the domain and query filters.
- Missing or `false`: the behaviour is unchanged.

| Request | Contains | Does not contain |
|---|---|---|
| `{ controllable: true }` | `light.living_room`, `light.desk`, `cover.blinds`, `media_player.living_room`, `climate.office`, `fan.bedroom`, `input_number.volume_target` | `light.hallway`, `cover.garage` (no set-position support), `switch.coffee`, `sensor.outdoor_temperature`, `scene.evening` |
| `{}` | all entities (unchanged) | — |

## 5. Locale keys (new)

| Key | en | de_DE |
|---|---|---|
| `pi.longPress.editValues` | Dynamic Dial for selected values | Dynamischer Drehknopf für ausgewählte Werte |
| `pi.longPress.editValues.hint` | Hold the key, then turn the HA Dynamic Dial to adjust the first value. With several values, pressing the Dynamic Dial jumps to the next one. | Taste halten, dann den HA-Dynamischen-Drehknopf drehen, um den ersten Wert zu ändern. Bei mehreren Werten springt ein Druck auf den Drehknopf zum nächsten. |
| `pi.longPress.editValues.list` | Values | Werte |
| `pi.longPress.editValues.remove` | Remove | Entfernen |
| `pi.longPress.editValues.add` | Add value | Wert hinzufügen |
