# Data Model: Home Assistant Plugin for Ulanzi Deck with Dial Support

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

All entities are in-memory runtime objects of the main service unless marked *persisted*.
Persisted data lives in Ulanzi Studio settings (global or per action). The field schemas of
the persisted settings are defined in [contracts/plugin-actions.md](contracts/plugin-actions.md).

---

## 1. HAConnection

Plugin-wide connection to Home Assistant. Exactly one instance exists.

| Field | Type | Persisted | Notes |
|---|---|---|---|
| `url` | string | global settings (`haUrl`) | `http(s)://host[:port]`, trailing slash stripped |
| `token` | string | global settings (`haToken`) | never logged, never sent back to the PI |
| `status` | enum | – | see state machine |
| `lastError` | message key \| null | – | e.g. `error.unreachable`, `error.auth`, `error.timeout` |
| `retryDelayMs` | number | – | 1000 → doubling → max 30000 |
| `entityCount` | number | – | after `get_states` |

**Validation**:
- `url` MUST parse as an absolute `http:`/`https:` URL. A path is allowed for reverse proxies
  (it is preserved).
- `token` MUST be non-empty.
- Changing `url` or `token` resets an `auth_failed` status and triggers a reconnect.

**State machine**:

```text
             configure(valid)
 unconfigured ───────────────► connecting ──auth_ok──► connected
      ▲                          │   ▲                    │
      │ clear credentials        │   │ timer              │ socket closed / pong timeout
      │                 socket   │   │                    ▼
      │                 error ───┘   └──────────────── reconnecting (backoff ≤ 30 s)
      │                          │
      │                 auth_invalid
      │                          ▼
      └──── credentials changed ◄── auth_failed   (no automatic retry, FR-005)
```

When the status enters `connected`, the client reloads all states (`get_states`) and
resubscribes, then notifies all actions (FR-004). When the status leaves `connected`, any edit
session ends (FR-034) and every action shows a disconnected state.

## 2. EntityState

A mirror of an HA entity, held in `EntityStore`.

| Field | Type | Notes |
|---|---|---|
| `entityId` | string | `<domain>.<object_id>` |
| `domain` | string | derived from `entityId` |
| `state` | string | `on`/`off`/`playing`/…/`unavailable`/`unknown` |
| `friendlyName` | string | `attributes.friendly_name`, falls back to `object_id` |
| `attributes` | object | raw HA attributes |
| `lastUpdated` | ISO string | from HA |

**Rules**:
- An entity is *unavailable* if `state ∈ {unavailable, unknown}` or it is missing from the
  store. Missing means "not found" (edge case "deleted/renamed").
- `EntityStore` emits `changed(entityId)` for every `state_changed` event and `refreshed`
  after a full reload. Subscribers are action contexts bound to that entity.

## 3. ControllableAttribute

A static registry entry describing one adjustable value of a domain (FR-021, FR-022).

| Field | Type | Notes |
|---|---|---|
| `id` | string | `light.brightness`, `light.color_temp`, `media_player.volume`, `climate.temperature`, `cover.position`, `fan.percentage`, `number.value` (covers `input_number` and `number`) |
| `domains` | string[] | domains the attribute applies to |
| `isSupported(entity)` | fn → bool | capability detection (research R-14) |
| `read(entity)` | fn → number \| null | current value in display units; `null` if off or unknown |
| `bounds(entity)` | fn → {min, max} | e.g. brightness 1–100, climate `min_temp`–`max_temp` |
| `defaultSteps(entity)` | fn → {fine, coarse} | brightness 5/20, temperature `target_temp_step` (or 0.5)/2, fan `percentage_step`/×4 |
| `unit` | string | `%`, `K`, `°C`/`°F` (from HA `unit_of_measurement` / system units) |
| `toServiceCall(entity, value)` | fn → ServiceCall | service mapping ([contracts/ha-websocket.md](contracts/ha-websocket.md)) |

**Validation**: values are clamped to `bounds` before sending (FR-025). Temperatures are
rounded to the step. Percentages are rounded to integers.

## 4. KeyBinding *(persisted, per action)*

An action placed on a key. The context identifies the key instance (SDK `context`).

| Field | Type | Applies to | Notes |
|---|---|---|---|
| `context` | string | all | SDK context (not persisted by us) |
| `action` | enum | all | `toggle`, `scene`, `sensor`, `service` |
| `entityId` | string | toggle, scene, sensor | required except for service |
| `label` | string | all | optional; default is the friendly name |
| `onText` / `offText` | string | toggle | optional; default is the localised `status.on`/`status.off` |
| `longPress` | enum | toggle | `edit` (default) \| `disabled` \| `entity` \| `service` (FR-037) |
| `longPressEntityId` | string | toggle | required if `longPress = entity` |
| `longPressService` | ServiceCall | toggle | required if `longPress = service` |
| `longPressMs` | number | toggle | default 500, range 300–2000 |
| `warnAbove` / `warnBelow` | number | sensor | optional threshold colouring |
| `service` | ServiceCall | service | domain, service, target, data (JSON) |

**Validation**:
- `entityId` must match `^[a-z_]+\.[a-z0-9_]+$`. The Toggle domain must be in FR-010's list.
- Service `data` must be a JSON object.

## 5. DialBinding *(persisted, per action)*

| Field | Type | Applies to | Notes |
|---|---|---|---|
| `context` | string | all | SDK context of the encoder slot |
| `kind` | enum | all | `fixed` (HA Dial) \| `dynamic` (HA Dynamic Dial) |
| `entityId` | string | fixed | required |
| `attributeId` | string | fixed | must be in `supportedAttributes(entity)` |
| `label` | string | fixed | optional |
| `stepFine` / `stepCoarse` | number | both | optional; default from `defaultSteps` |
| `offAtMin` | boolean | both | default `true` (FR-028) |
| `editTimeoutS` | number | dynamic | default 10, range 3–60 (FR-034). With several Dynamic Dials, the edit session uses the largest value among them |

**Runtime fields** (not persisted): `optimisticValue`, `optimisticUntil`, `pendingCall`.

## 6. EditSession (runtime)

At most one exists at a time (FR-035).

| Field | Type | Notes |
|---|---|---|
| `entityId` | string | the edited entity |
| `attributeId` | string | `light.brightness` for lights; for other domains see Story 5 |
| `sourceContext` | string | the key that started the session |
| `lastInputAt` | timestamp | updated on every detent or key action |
| `dynamicDials` | Set<context> | all registered Dynamic Dial contexts (R-12) |

**State machine**:

```text
           long-press on eligible key (and ≥1 Dynamic Dial registered)
   idle ─────────────────────────────────────────────────────────► editing(entity)
    ▲                                                                 │  │
    │  short press on source key / timeout / page switch /           │  │ long-press on other
    │  connection lost / source key cleared / entity unavailable     │  │ eligible key
    └─────────────────────────────────────────────────────────────────┘  └─► editing(other)

   long-press on eligible key with no Dynamic Dial registered → stay idle, show hint (FR-039)
   long-press on non-eligible key → KeyBinding.longPress fallback (Story 4, scenario 5)
```

**Effects**:
- On entering `editing`, the source key renders the edit style (FR-033) and every Dynamic Dial
  shows the entity name and value.
- On leaving it, the key shows its normal style and the Dynamic Dials show
  `hint.longPress` (FR-036).

## 7. PressDetector (runtime, per key context)

```text
 up ──keydown──► down(timer=longPressMs) ──timer fires──► long_fired ──keyup──► up
                     │                                                         (no short action)
                     └──keyup before timer──► up  (emit short press)
```

`onRun` is ignored for keys with a detector (R-11).

## 8. EntityControl (runtime, one per entity, shared)

Holds the state that must be shared by **every** control acting on the same entity: fixed HA
Dials (whatever attribute they control), all Dynamic Dials during edit mode, and the edit-mode
key display. Kept in an `EntityControlRegistry` keyed by `entityId`, created on first use and
dropped when no controller references it.

| Field | Type | Notes |
|---|---|---|
| `entityId` | string | registry key |
| `values` | Map<attributeId, { optimisticValue, optimisticUntil }> | optimistic state **per attribute**; `optimisticUntil = lastInput + 1500 ms` |
| `throttle` | Throttle | **one** 200 ms window for the whole entity |
| `pending` | Map<attributeId, ServiceCall> | latest not-yet-sent call per attribute |
| `listeners` | Set | controllers and key renderers to notify on change |

**Rules**:
- An attribute's optimistic value takes precedence over HA updates until its
  `optimisticUntil`, or until HA reports a value equal to it.
- All service calls for the entity go through its single throttle (FR-024): the first call is
  sent immediately, then at most one call per 200 ms window. Only the latest call per attribute
  is kept in `pending`. If several attributes are pending, they are sent one per window in the
  order of their first change. The latest value of every attribute is always delivered.
  Several dials on the same entity, even on different attributes (e.g. brightness and colour
  temperature), therefore never exceed 5 calls/s together.
- Every change notifies all listeners, so all dial displays and the edit-mode key show the same
  value (Story 4 scenario 2, FR-032a).
- When the connection leaves `connected`, `cancelPending()` on the registry discards all
  pending throttled calls and optimistic values. Rotations while disconnected send nothing and
  are not replayed after reconnect; the displays show the disconnected style.

## 8a. DialController (runtime, per dial context)

Converts detents into values and delegates state to the shared `EntityControl`:
- `rotateEvent` `left`/`right` → ±`stepFine`.
- `hold-left`/`hold-right` → ±`stepCoarse`.
- Starting point: the `EntityControl` optimistic value if it is still valid, else
  `attribute.read(entity)`. If the entity is off and the user turns right, the start value is
  `min` (FR-028).
- If the result is below `min` and `offAtMin` is set, a turn-off call is sent.
- A Dynamic Dial rebinds its controller to the session's `EntityControl` whenever the edit
  session starts or switches entity.

## 9. ServiceCall (value object)

| Field | Type | Notes |
|---|---|---|
| `domain` | string | e.g. `light` |
| `service` | string | e.g. `turn_on` |
| `target` | `{ entity_id: string \| string[] }` | optional for generic service keys |
| `data` | object | service data |

## 10. RenderModel (value object)

The output of the domain layer, consumed by the adapter.
- **KeyRender**: `{ style: on|off|unavailable|edit|trigger|sensor|warn, status, label, value?, unit? }`
- **DialRender**: `{ title, valueText, style, progress? (0–1) }`

These models are serialised to SVG by `render/key-svg.js` / `render/dial-feedback.js`. All
text arrives as message keys or user-provided labels and is localised by `i18n.js`.

## Relationships

```text
HAConnection 1 ──feeds──► 1 EntityStore 1 ──► * EntityState
EntityState  * ◄──bound── * KeyBinding / DialBinding(fixed)
DialBinding(dynamic) * ──registered in──► 1 EditSession broker ──(0..1 active)──► EntityState
ControllableAttribute (registry) ◄──uses── DialController, EditSession
DialController * ──shares──► 1 EntityControl (per entity) ◄──reads── edit-mode key
```
