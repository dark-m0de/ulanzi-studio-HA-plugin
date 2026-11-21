# Data Model: Dynamic Dial for Selected Values

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

This document only describes changes to the data model of features 001–003.

## 1. Selected value

```text
SelectedValue {
  entityId:    string   // trimmed, non-empty Home Assistant entity ID
  attributeId: string   // id of a registered controllable value, e.g. 'light.color_temp'
}
```

- **Identity**: the pair `(entityId, attributeId)`. Two entries with the same pair are
  duplicates.
- **Valid**: the `attributeId` is in the attribute registry. Whether the entity actually
  supports the value is checked at runtime (§3), not when parsing.

## 2. Toggle key settings (extended)

| Field | Type (stored) | Default | Meaning |
|---|---|---|---|
| `longPress` | string | `edit` (when missing) | + new value `edit_values` ("Dynamic Dial for selected values") |
| `editValues` | string (JSON array of `SelectedValue`); a parsed array is also accepted | missing / `""` | Ordered list of selected values. Only used when `longPress === 'edit_values'`. Kept when another mode is selected. |

**Normalisation** (`parseSelectedValues`):
- Parse the JSON; on a parse error or a non-array result → `[]`.
- Keep only objects with a non-empty string `entityId` (trimmed) and a known `attributeId`.
- Drop duplicate pairs; the first occurrence wins and the order is kept.

## 3. Usability (runtime)

`targetUsable(target, entity)` is true if and only if all of the following hold:
- `entity` is not null and `!isUnavailableState(entity)`;
- `getAttribute(target.attributeId)` exists;
- `attribute.domains` includes `entity.domain`;
- `attribute.isSupported(entity)`.

## 4. Edit session (extended)

```text
EditSession {
  entityId:      string           // current target's entity (or the key's entity in the classic mode)
  attributeId:   string           // current target's value (may differ after switch_value with one target)
  sourceContext: string           // Toggle key that started the session
  targets:       SelectedValue[]  // NEW: [] in the classic mode
  targetIndex:   number           // NEW: index into targets; -1 in the classic mode
}
```

### State transitions (additions to feature 001 §6)

| From | Event | To | Result / reason |
|---|---|---|---|
| idle / active | `startTargets`, ≥1 usable entry, ≥1 dial | active at the first usable index | `started` / `switched` |
| idle / active | `startTargets`, empty list or no usable entry | unchanged | `ineligible` (key alert, no toggle) |
| idle | `startTargets`, usable entry, no dial | idle | `no_dial` (toast) |
| active (≥2 targets) | Dynamic Dial press → `nextTarget()`, another usable entry exists | active at the next usable index (wrap-around) | emit `switched_target`, timer re-armed |
| active (≥2 targets) | `nextTarget()`, no other usable entry | unchanged | returns `false` (toast `hint.noOtherValue`) |
| active (targets) | `targetUnusable` for the current target, another usable entry exists | active at the next usable index | emit `switched_target` |
| active (targets) | `targetUnusable` for the current target, none left | idle | `unavailable` |
| active (targets) | `targetUnusable` for a non-current target | unchanged | — |
| active | source key `entityId`, `longPress` or normalised `editValues` changes | idle | `settings` |
| active (1 target) | `switchAttribute` (feature 002) | active, new `attributeId` | `switched_value` |

All other transitions (timeout, source press, page, connection loss, `no_dials`) are unchanged.
A new session always starts at the first usable index, so the last position is not remembered
(FR-014).

## 5. PI capabilities response (extended)

`entity.capabilities` → `{ friendlyName: string | null, attributes, longPressEligible, pressActions }`.
`friendlyName` is new; all other fields are unchanged.

`entities.list` accepts the new optional parameter `controllable: true`, which keeps only
entities with at least one supported controllable value.
