# Contract: Press Action → Home Assistant

Capability checks and resulting service calls. `target` is always `{ entity_id: <bound entity> }`
unless stated otherwise. Feature bits per HA entity feature flags.

## HA Dial

| `pressAction` | Offered when | Outcome |
|---|---|---|
| `default` | `pressActionFor(entity)` is not null (feature 001) | `call`: light/switch/fan/input_boolean/cover `toggle`; media_player `media_play_pause`; climate `turn_on`/`turn_off` by state |
| `switch_value` | entity has ≥ 2 controllable values (PI offer only) | always `switch_value`, also for single-value entities; the adapter then shows `hint.noOtherValue` (FR-025) |
| `favorite` | the active attribute is supported | `set_value` with `raw = Number(favoriteValue)`; then `attribute.toServiceCall` (clamp, step, light `turn_on`); empty or non-numeric `favoriteValue` → `error` `error.invalidFavorite` |
| `mute` | media_player, `supported_features & 8` | `call` `media_player.volume_mute` `{ is_volume_muted: !attributes.is_volume_muted }` |
| `next_track` | media_player, `supported_features & 32` | `call` `media_player.media_next_track` |
| `hvac_cycle` | climate, `hvac_modes.length >= 2` | `call` `climate.set_hvac_mode` `{ hvac_mode: cycleNext(hvac_modes, state) }` |
| `preset_cycle` | climate with `supported_features & 16`, or fan with `supported_features & 8`; `preset_modes.length >= 2` | `call` `<domain>.set_preset_mode` `{ preset_mode: cycleNext(preset_modes, attributes.preset_mode) }` |
| `cover_stop_toggle` | cover, `supported_features & 8` and (`& 1` or `& 2`) | state `opening`/`closing` → `call` `cover.stop_cover`; otherwise `call` `cover.toggle` |
| `oscillate` | fan, `supported_features & 2` | `call` `fan.oscillate` `{ oscillating: !attributes.oscillating }` |
| `service` | always | `call` from `parseServiceCall({ domain: pressDomain, service: pressServiceName, target: pressTarget, data: pressData })`; invalid → `error` `error.invalidService` |
| `none` | always | `none` |

`cycleNext(list, current)`: the element after `current`; the first element if `current` is the
last one or not in the list.

A saved action whose "offered when" condition is false → `error` `error.unsupportedPress`, except `switch_value`, which always resolves to `switch_value` (FR-025, FR-032).

## HA Dynamic Dial (during an edit session)

| `pressAction` | Outcome |
|---|---|
| `end_edit` (default) | `end_edit` |
| `toggle` | `call` from `pressActionFor(edited entity)`; null → `error` `error.unsupportedPress` |
| `switch_value` | always `switch_value` (session-wide); with a single-value entity the adapter shows `hint.noOtherValue` |
| `none` | `none` |
