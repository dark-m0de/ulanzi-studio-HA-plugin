# Contract: Edit Session with Selected Values (Targets)

**Feature**: [../spec.md](../spec.md) | Covers FR-007–FR-017 | Model: [../data-model.md](../data-model.md)

These are internal domain interfaces. They are written down because unit tests are written
against them first (Principle III).

## 1. `parseSelectedValues(value): SelectedValue[]` (`src/domain/selected-values.js`)

| Input | Output |
|---|---|
| `undefined`, `null`, `42`, `{}`, `""`, `"not json"`, `"{}"` | `[]` |
| `'[{"entityId":"light.desk","attributeId":"light.brightness"}]'` | `[{ entityId: 'light.desk', attributeId: 'light.brightness' }]` |
| `[{ entityId: ' light.desk ', attributeId: 'light.brightness' }]` (array) | trimmed entity ID |
| entries with an unknown `attributeId`, an empty or missing `entityId`, or of a non-object type | dropped |
| the same pair twice | kept once, at the first position |
| `light.desk` + brightness, then `light.desk` + colour temperature | both kept (different pairs) |

## 2. `targetUsable(target, entity): boolean`

| Target | Entity | Result |
|---|---|---|
| `light.desk` / `light.color_temp` | `light.desk` (supports colour temperature) | `true` |
| `light.living_room` / `light.color_temp` | brightness-only lamp | `false` |
| `light.desk` / `light.brightness` | state `unavailable` | `false` |
| `cover.blinds` / `light.brightness` | cover | `false` (domain mismatch) |
| any | `null` | `false` |
| `input_number.volume_target` / `number.value` | input_number | `true` |

## 3. `EditSessionBroker`

```text
new EditSessionBroker({ clock, getEntity = () => null })

startTargets({ sourceContext, targets }) → 'started' | 'switched' | 'no_dial' | 'ineligible'
nextTarget()                            → boolean
targetUnusable(entityId, attributeId?)  → void
entityUnavailable(entityId)             → void   // delegates to targetUnusable when the session has targets
```

| Scenario | Expected |
|---|---|
| `startTargets` with `[hallway/brightness (unsupported), living_room/brightness, desk/color_temp]` | `started`; `targetIndex` 1; `entityId` `light.living_room`; `attributeId` `light.brightness` |
| `startTargets` with `[]` or only unusable entries | `ineligible`, also without dials; session unchanged |
| `startTargets` with a usable entry, no dial registered | `no_dial` |
| `startTargets` while another key's session runs | `switched` |
| `nextTarget()` from the last usable entry | wraps to the first usable entry; emits `switched_target`; timer re-armed (a tick just below the old timeout no longer ends the session) |
| `nextTarget()` skips an entry whose entity became unavailable | next usable entry is selected |
| `nextTarget()` with 2 targets, the other one unusable | `false`, no emit, session unchanged |
| `nextTarget()` in the classic mode (`targets: []`) | `false` |
| `targetUnusable(current)`, another usable entry exists | moves on, emits `switched_target` |
| `targetUnusable(current)`, no other usable entry | session ends with `unavailable` |
| `targetUnusable(not current)` | nothing happens |
| new `startTargets` after a session ended at index 2 | starts at the first usable index again |
| `switchAttribute(entity)` with exactly one target | works as in feature 002; `targets` unchanged |

**Session shape**: in the classic mode (`start()`), `targets: []` and `targetIndex: -1`. Update
the existing `deepEqual` assertions accordingly.

## 4. Adapter obligations

### `DynamicDialAction`

- **`handlePress()`**:
  - If `session.targets.length >= 2`, it calls `nextTarget()`. A `false` result shows the toast
    `hint.noOtherValue`.
  - Otherwise it uses the existing behaviour.
- **`valueCaption`**: it returns `t('attr.short.<attributeId>')` when
  `session.targets.length >= 2`; otherwise it keeps the feature 002 rule.
- **`onEntityChanged()`**: when the session has targets and
  `!targetUsable({ entityId, attributeId }, entity)`, it calls
  `targetUnusable(entityId, attributeId)`. Then it runs the existing reconcile and render.

### `ToggleAction`

- **`longPress()`**: `case 'edit_values'` → `startTargets()`.
  - `ineligible` → `showAlert`, no service call.
  - `no_dial` → toast.
- **Edit rendering**: it uses `session.entityId` for the entity, the optimistic value and the
  caption. In `edit_values` mode the label is the entity's friendly name.
- **`#followSession()`**: subscribes to `controls.get(session.entityId)`.
- **`onSettings()`**: ends the session (`settings`) when the trimmed `entityId`, `longPress` or
  `JSON.stringify(parseSelectedValues(editValues))` changed.

### `app.js`

- **Broker**: `new EditSessionBroker({ clock, getEntity: (id) => store.get(id) })`.
- **Log line**:
  - `switched_target` → `edit mode switched target (i/N)`.
  - `started` / `switched` with targets → appends ` (i/N)`.
  - No IDs.
