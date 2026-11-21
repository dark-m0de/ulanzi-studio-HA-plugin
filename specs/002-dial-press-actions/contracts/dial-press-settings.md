# Contract: Dial Press Settings and PI Capabilities

Extends [feature 001 – plugin-actions.md](../../001-ha-deck-plugin/contracts/plugin-actions.md)
and [pi-messages.md](../../001-ha-deck-plugin/contracts/pi-messages.md).

## Per-action settings

**dial** (new optional fields; existing fields unchanged)

```json
{
  "entityId": "light.desk",
  "attributeId": "light.brightness",
  "pressAction": "default",        // see the list below; missing = "default"
  "favoriteValue": "100",          // pressAction = favorite
  "pressDomain": "",               // pressAction = service
  "pressServiceName": "",
  "pressTarget": "",               // comma-separated entity ids, optional
  "pressData": ""                  // JSON object as text, optional
}
```

`pressAction` for **dial**: `default` | `switch_value` | `favorite` | `mute` | `next_track` |
`hvac_cycle` | `preset_cycle` | `cover_stop_toggle` | `oscillate` | `service` | `none`

**dynamicdial** (new optional field)

```json
{ "pressAction": "end_edit" }      // end_edit | toggle | switch_value | none; missing = "end_edit"
```

## PI message extension

`entity.capabilities` reply gets one additional field:

```json
{
  "attributes": [ ... ],                     // unchanged
  "longPressEligible": true,                 // unchanged
  "pressActions": {                          // NEW: supported HA Dial press actions per attribute
    "light.brightness": ["default", "switch_value", "favorite", "service", "none"],
    "light.color_temp": ["default", "switch_value", "favorite", "service", "none"]
  }
}
```

- Keys are the attribute ids from `attributes`; values are press action ids in display order.
- The PI shows the list for the selected attribute. If the saved `pressAction` is not in the
  list, it selects `default` and saves.
- The Dynamic Dial PI uses the fixed list `end_edit`, `toggle`, `switch_value`, `none` (the
  entity is only known at runtime).

## Display contract

| Situation | Dial icon | Dial title | Edited key |
|---|---|---|---|
| Entity with 1 controllable value | value (unchanged) | entity name | `EDIT`, value, label (unchanged) |
| Entity with ≥ 2 values | small caption with the value short name above the value | entity name | `EDIT`, status line = value short name, value, label |
| Press `switch_value`, no other value | unchanged | unchanged | unchanged; `toast(hint.noOtherValue)` |
| Press with unsupported saved action | unchanged | unchanged | `showAlert` on the dial |
