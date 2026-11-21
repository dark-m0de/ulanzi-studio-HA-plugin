# Data Model: Configurable Dial Press Actions

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Extends [feature 001's data model](../001-ha-deck-plugin/data-model.md). Only new or changed
elements are listed.

## 1. DialBinding (persisted) – new fields

| Field | Type | Applies to | Default | Notes |
|---|---|---|---|---|
| `pressAction` | enum | fixed | `default` | `default`, `switch_value`, `favorite`, `mute`, `next_track`, `hvac_cycle`, `preset_cycle`, `cover_stop_toggle`, `oscillate`, `service`, `none` |
| `pressAction` | enum | dynamic | `end_edit` | `end_edit`, `toggle`, `switch_value`, `none` |
| `favoriteValue` | number (string from the form) | fixed, `favorite` | – | in display units of the dial's configured value; clamped and rounded on use |
| `pressDomain`, `pressServiceName` | string | fixed, `service` | – | validated like the long-press service (`parseServiceCall`) |
| `pressTarget` | string | fixed, `service` | – | comma-separated entity IDs (optional) |
| `pressData` | string (JSON object) | fixed, `service` | – | optional |

**Validation**:
- An unknown `pressAction` is treated as unsupported (error on press).
- `favoriteValue` must parse as a finite number, else error on press.
- The PI resets `pressAction` to the default when the bound entity changes and the saved
  action is no longer offered.

## 2. Active controlled value (runtime)

| Holder | Field | Initial value | Changes on | Reset on |
|---|---|---|---|---|
| HA Dial instance | `activeAttributeId` | `settings.attributeId` | press with `switch_value` → `nextAttribute(entity, active)` | settings change, restart |
| Edit session | `session.attributeId` | `editAttributeFor(entity)` | Dynamic Dial press with `switch_value` → `broker.switchAttribute(entity)` | new session (`start`) |

`nextAttribute(entity, currentId)`: the next entry after `currentId` in
`supportedAttributes(entity)`, wrapping around, or `null` if the entity supports fewer than two
values.

## 3. Press outcome (value object, domain → adapter)

| `type` | Payload | Executed by the adapter as |
|---|---|---|
| `call` | `call: ServiceCall` | `client.callService(call)`; error → `showAlert` + warn log |
| `set_value` | `raw: number` | `controller.setValue(raw)` → `EntityControl.setTarget` (optimistic, throttled) |
| `end_edit` | – | `editSession.end('dial_press')` |
| `switch_value` | – | HA Dial: rebind controller to `nextAttribute`; Dynamic Dial: `editSession.switchAttribute(entity)`; none available → `toast(hint.noOtherValue)` |
| `none` | – | nothing |
| `error` | `key` | `showAlert` + warn log (key only) |

Preconditions applied by the adapter before resolving:
- The press is only executed if the dial was not rotated while pressed (feature 001).
- Dynamic Dial: only while a session is active (FR-013).
- `call` and `set_value` require a connection; otherwise `showAlert`.

## 4. Press action registry entry (domain)

| Field | Type | Notes |
|---|---|---|
| `id` | string | see §1 |
| `dialKinds` | `('fixed' \| 'dynamic')[]` | where the action is offered |
| `isSupported(entity, ctx)` | fn → bool | ctx: `{ attributeId }` (the active attribute) |
| `resolve(entity, settings, ctx)` | fn → outcome | pure; reads only entity state and settings |

`supportedPressActions(entity, { kind, attributeId })` returns the ids in registry order for the
PI and is the single source for FR-031.

## 5. Render changes

- **DialRender** gains `caption?: string`: the short name of the controlled value, set only when
  the entity has ≥ 2 controllable values. It is drawn as a small line above the value in the
  100×100 icon.
- **KeyRender (edit model)**: `status` is set to the same short name when the entity has ≥ 2
  values (otherwise empty, as in feature 001).

## 6. Edit session – state transitions (addition)

```text
editing(entity, attr) ──switchAttribute()──► editing(entity, nextAttribute(entity, attr))   (emits change: switched_value)
editing ──Dynamic Dial press with end_edit──► idle                                          (emits change: dial_press)
```
