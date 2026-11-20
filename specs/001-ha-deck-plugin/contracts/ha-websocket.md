# Contract: Home Assistant WebSocket Usage

The subset of the Home Assistant WebSocket API (`/api/websocket`) the plugin relies on.
Minimum HA version: **2024.1**.

## Connection lifecycle

| Step | Direction | Message |
|---|---|---|
| 1 | HA → plugin | `{ "type": "auth_required", "ha_version": "…" }` |
| 2 | plugin → HA | `{ "type": "auth", "access_token": "<token>" }` |
| 3a | HA → plugin | `{ "type": "auth_ok", "ha_version": "…" }` → status `connected` |
| 3b | HA → plugin | `{ "type": "auth_invalid", "message": "…" }` → status `auth_failed`, close, **no retry** |
| 4 | plugin → HA | `{ "id": n, "type": "get_states" }` → `result` with an array of states |
| 5 | plugin → HA | `{ "id": n, "type": "subscribe_events", "event_type": "state_changed" }` → `result.success` must be `true`, otherwise reconnect |
| 6 | HA → plugin | `{ "id": n, "type": "event", "event": { "event_type": "state_changed", "data": { "entity_id", "new_state", "old_state" } } }`. `new_state: null` means the entity was removed |
| ♥ | plugin → HA | `{ "id": n, "type": "ping" }` every 30 s; expect `{ "id": n, "type": "pong" }` within 10 s, otherwise treat the socket as dead → reconnect |

Message ids increase monotonically per connection. Pending requests are rejected with
`error.disconnected` when the socket closes. A request timeout is 10 s (`error.timeout`).

## Service calls

```json
{ "id": n, "type": "call_service", "domain": "<d>", "service": "<s>",
  "target": { "entity_id": "<id>" }, "service_data": { } }
```

The reply `{ "id": n, "type": "result", "success": false, "error": { "code", "message" } }`
leads to `showAlert` on the originating context plus a log entry at `warn` (FR-040).

### Mapping per controllable attribute

| Attribute | Read | Bounds | Default steps (fine / coarse) | Set value | Below min with `offAtMin` |
|---|---|---|---|---|---|
| `light.brightness` | `round(brightness/255*100)`, `null` if off | 1–100 % | 5 / 20 | `light.turn_on` `{ brightness_pct }` | `light.turn_off` |
| `light.color_temp` | `color_temp_kelvin` | `min_color_temp_kelvin`–`max_color_temp_kelvin` | 100 K / 500 K | `light.turn_on` `{ color_temp_kelvin }` | – (clamp) |
| `media_player.volume` | `round(volume_level*100)` | 0–100 % | 5 / 20 | `media_player.volume_set` `{ volume_level: v/100 }` | – (clamp at 0) |
| `climate.temperature` | `temperature` | `min_temp`–`max_temp` | `target_temp_step` (0.5) / ×4 | `climate.set_temperature` `{ temperature }` | – (clamp) |
| `cover.position` | `current_position` | 0–100 % | 5 / 20 | `cover.set_cover_position` `{ position }` | – (0 = closed) |
| `fan.percentage` | `percentage` | 0–100 % | `percentage_step` (5) / ×4 | `fan.set_percentage` `{ percentage }` | `fan.turn_off` |
| `number.value` | `Number(state)` | `min`–`max` | `step` / ×10 | `input_number.set_value` or `number.set_value` `{ value }` | – (clamp) |

### Capability detection

| Attribute | Supported if |
|---|---|
| `light.brightness` | `supported_color_modes` contains anything other than `onoff` |
| `light.color_temp` | `supported_color_modes` contains `color_temp` |
| `media_player.volume` | `supported_features & 4` (VOLUME_SET) |
| `climate.temperature` | `supported_features & 1` (TARGET_TEMPERATURE) |
| `cover.position` | `supported_features & 4` (SET_POSITION) |
| `fan.percentage` | `supported_features & 1` (SET_SPEED) |
| `number.value` | domain is `input_number` or `number` |

The edit-mode attribute per domain (long-press eligibility): light → `light.brightness`,
media_player → `media_player.volume`, climate → `climate.temperature`, cover →
`cover.position`, fan → `fan.percentage`. An entity is eligible only if that attribute is
supported.

### Press actions

| Domain | Key short press (Toggle) / dial press |
|---|---|
| `light`, `switch`, `fan`, `input_boolean` | `<domain>.toggle` |
| `cover` | `cover.toggle` |
| `media_player` | `media_player.media_play_pause` |
| `climate` | `climate.turn_off` if `state != off`, else `climate.turn_on` |
| `scene` / `script` | `scene.turn_on` / `script.turn_on` |
| `automation` | `automation.trigger` |
