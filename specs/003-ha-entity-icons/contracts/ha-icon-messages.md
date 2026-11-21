# Contract: Home Assistant WebSocket Messages for Icons

Extends [feature 001 ha-websocket.md](../../001-ha-deck-plugin/contracts/ha-websocket.md). Same
request/response correlation, timeout (10 s) and error mapping (`HAError`) as the existing
commands. All requests go only to the configured HA instance.

## 1. Component icons

Request (once per connection, after `get_states` succeeded):

```json
{ "id": 7, "type": "frontend/get_icons", "category": "entity_component" }
```

Result:

```json
{ "resources": {
    "light": { "_": { "default": "mdi:lightbulb", "state": { "off": "mdi:lightbulb-off" } } },
    "cover": { "_": { "default": "mdi:dock-top", "state": { "closed": "mdi:card" } },
               "shutter": { "default": "mdi:window-shutter-open", "state": { "closed": "mdi:window-shutter" } } },
    "sensor": { "_": { "default": "mdi:eye" },
                "battery": { "default": "mdi:battery-unknown", "range": { "0": "mdi:battery-alert", "10": "mdi:battery-10", "100": "mdi:battery" } } }
} }
```

Fields other than `default`, `state` and `range` (e.g. `state_attributes`) are ignored.

## 2. Registry display entries

```json
{ "id": 8, "type": "config/entity_registry/list_for_display" }
```

Result (only these fields are read):

```json
{ "entities": [ { "ei": "sensor.phone_battery", "pl": "mobile_app", "tk": "battery_level" } ] }
```

Entries without `tk` are dropped. Nothing from this list is logged above debug level.

## 3. Platform (integration) icons

Requested lazily for platforms of bound entities that have a translation key and are not loaded
yet. One request may contain several platforms:

```json
{ "id": 9, "type": "frontend/get_icons", "category": "entity", "integration": ["hue", "mobile_app"] }
```

Result: `{ "resources": { "<platform>": { "<domain>": { "<translation_key>": IconDefinition } } } }`.
Requested platforms that are missing from the result are remembered as "no icons", so they are
not requested again on this connection.

## 4. Error behaviour

| Situation | Behaviour |
|---|---|
| `success: false` (e.g. unknown command on HA < 2024.2) | Log at warn level once per connection; keep the fallback icons; set `IconData.available = false`. This becomes visible to the user as a hint in the connection block of every Property Inspector (`connection.status.iconsAvailable = false`, see [key-icon-settings.md](key-icon-settings.md) §5), as constitution Principle IV requires. Keys are not marked as errors, because they still show valid (fallback) icons. |
| Timeout / disconnect | As above; retried on the next connection. |
| Component icons received | `IconData.available = true`; the PI hint disappears (`connection.changed` push). |
| Malformed result | Ignored (treated like an empty result), debug log. |

## 5. Fake HA server (tests)

`tests/support/fake-ha-server.js` answers `frontend/get_icons` (both categories) and
`config/entity_registry/list_for_display` from new fixtures in `tests/support/fixtures/icons.json`.
It can be switched to reply `success: false` to simulate old HA versions.
