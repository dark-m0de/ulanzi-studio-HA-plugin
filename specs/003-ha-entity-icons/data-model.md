# Data Model: Home Assistant Entity Icons on Keys

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

Extends the data model of [feature 001](../001-ha-deck-plugin/data-model.md) (§2 EntityState,
§10 KeyRender). All new modules are in `src/domain` (pure, no SDK, no I/O) unless noted
otherwise.

## 1. IconRef

A normalised icon name.

| Field | Type | Rule |
|---|---|---|
| `name` | string | `mdi:<kebab-name>`. Input prefixes `mdi:` and `hass:` are accepted and normalised to `mdi:`. Surrounding whitespace is trimmed and the name is lower-cased. Any other prefix, or no prefix, is invalid. |

`iconPath(name) → string | null` (`src/domain/icons/mdi-set.js`) returns the SVG path in the
24×24 grid, or `null` for unknown or invalid names.

## 2. IconDefinition (from HA)

The shape of one icon definition entry as HA returns it (research R-03):

```text
IconDefinition = {
  default?: IconRef,
  state?: { [state: string]: IconRef },
  range?: { [threshold: string]: IconRef },   // numeric thresholds as string keys
}
```

`iconFromDefinition(state, def) → IconRef | null`: first `state[state]`; else, for a numeric
state with a `range`, the highest threshold ≤ value (falling back to `default` if the state is
below every threshold); else `default`; else `null`.

## 3. IconData (store, per HA connection)

`src/domain/icons/icon-data.js`: holds what was loaded from HA and notifies subscribers on
change.

| Field | Type | Source |
|---|---|---|
| `components` | `{ [domain]: { _?: IconDefinition, [deviceClass]: IconDefinition } }` | `frontend/get_icons` category `entity_component` |
| `platforms` | `Map<platform, { [domain]: { [translationKey]: IconDefinition } }>` | `frontend/get_icons` category `entity`, loaded lazily per platform |
| `registry` | `Map<entityId, { platform, translationKey }>` | `config/entity_registry/list_for_display` (only entries with `tk`) |
| `loaded` | boolean | `true` after the component icons were received at least once |
| `available` | `true \| false \| null` | Result of the component icon request on the **current** connection: `null` = not requested yet / not connected, `true` = received, `false` = failed. Reported to the PI as `iconsAvailable` ([contracts/key-icon-settings.md](contracts/key-icon-settings.md) §5). |

Methods: `setComponents()`, `setUnavailable()`, `setPlatform(platform, defs)`, `setRegistry(entries)`,
`missingPlatforms(entityIds) → string[]` (platforms of bound entities with a translation key
that are not loaded yet), `subscribe(fn)`.

State transitions: empty → (connect, `get_icons` ok) → loaded → (reconnect) → stays loaded with
old data until the new data replaces it (`available` resets to `null`). If the component
request fails, the old or empty data stays, `available` becomes `false` and a warning is logged.

## 4. Icon resolution

`resolveKeyIcon(entity, settings, iconData, { kind, onSkipped? }) → ResolvedIcon | null`
(`src/domain/icons/resolve.js`):

```text
ResolvedIcon = {
  name: IconRef,
  path: string,
  source: 'override' | 'entity' | 'platform' | 'component' | 'fallback',
}
```

Unknown names (spec edge case "Unknown icon name"): the domain layer has no logger.
`resolveKeyIcon` therefore accepts an optional callback `onSkipped(name)` in its options and
calls it for every non-empty icon name it tried that was invalid or unknown, whether or not a
later step resolved. The adapter passes a callback that logs `icon not found: <name>` at
**debug** level, without the entity ID, at most once per key and name.

Order (spec FR-001, research R-04). The first step that yields a known `path` wins:

1. `settings.icon` (override). An unknown name falls through to step 2 (spec US2, scenario 5).
2. `entity.attributes.icon`
3. Platform definition via `registry[entityId]` → `platforms[platform][domain][translationKey]`
4. Component definition `components[domain][attributes.device_class] ?? components[domain]._`
5. Fallback table `fallbackIcon(domain, deviceClass, isOn)` (`src/domain/icons/fallback-icons.js`)
6. `null` → text layout

For Service keys (`kind: 'service'`) only step 1 applies.

## 5. KeyRender extension (data-model 001 §10)

New optional field on `KeyRender`:

```text
icon?: {
  path: string,          // 24×24 SVG path
  color: string,         // '#rrggbb', already contrast-adjusted
  valueColor?: string,   // '#rrggbb' for the value text; set only for the sensor warning case, otherwise fg
}
```

If `icon` is present, `keySvg()` uses the **icon layout** and ignores `status`. Otherwise the
existing text layout is unchanged.

Icon layout (144×144, background `#1e293b`, `rx` 20; the icon grid is 24 units):

| Case | Icon box (x, y, size) | Value line | Label line |
|---|---|---|---|
| icon + label | 30, 10, 84 | — | y 118, 20 px, accent |
| icon + value + label | 38, 6, 68 | y 92, 26 px bold, fg | y 124, 18 px, accent |
| icon only (no label) | 24, 24, 96 | — | — |
| icon + value, no label | 38, 10, 68 | y 110, 30 px bold | — |

`scale = size / 24`, `transform="translate(x y) scale(scale)"`. In the icon layout, text
colours are `fg #e2e8f0` and `accent #94a3b8`. The value text uses `icon.valueColor ?? fg`. The
sensor model sets `valueColor` to the warning colour while the value is outside the
thresholds. The label is truncated as before (12 characters).

## 6. Colour

`iconColor({ isOn, kind, warn, entity, settings }) → '#rrggbb'` (`src/domain/icons/icon-color.js`),
following research R-07:

| Kind / state | Colour |
|---|---|
| toggle, on | `settings.onColor` ‖ light `rgb_color` ‖ `#f59e0b` |
| toggle, off | `settings.offColor` ‖ `#94a3b8` |
| trigger, service | `settings.onColor` ‖ `#a78bfa` |
| sensor | warn: `#fb923c`; else `settings.onColor` ‖ `#5eead4` |

Then `ensureContrast(color, '#1e293b', 3)` mixes the colour towards white until the contrast is
at least 3:1. Invalid colour strings in the settings are ignored, and the default is used.

"On" is decided by `isOnState()` from `key-model.js` (unchanged).

## 7. Key settings (persisted per action)

See [contracts/key-icon-settings.md](contracts/key-icon-settings.md).

| Field | Type | Default | Actions |
|---|---|---|---|
| `showIcon` | boolean | `true` (Service: n/a) | toggle, sensor, scene |
| `icon` | string (`mdi:…`) | `''` | toggle, sensor, scene, service |
| `onColor` | string `#rrggbb` | `''` | toggle, sensor, scene, service |
| `offColor` | string `#rrggbb` | `''` | toggle |

## 8. When the icon layout is used

| Key state | Layout |
|---|---|
| set up / disconnected / not found / unavailable / invalid | text (001) |
| edit mode (Toggle) | text (001) |
| Trigger/Service "done" confirmation | text (001) |
| normal state, `showIcon` ≠ false, icon resolved | **icon** |
| normal state, `showIcon` = false, or no icon resolved | text (001), including on/off texts |
