# Contract: Key Icon Settings and Property Inspector Messages

Extends [feature 001 pi-messages.md](../../001-ha-deck-plugin/contracts/pi-messages.md). The
envelope, error handling and save behaviour (`bindForm`, debounced `sendParamFromPlugin`) are
unchanged.

## 1. Per-action settings fields (new, all optional)

| Field | Type | Valid values | Missing / invalid means |
|---|---|---|---|
| `showIcon` | boolean | `true`, `false` | `true` (Toggle, Sensor, HA Trigger [`scene.js`]). Not shown for Service. |
| `icon` | string | `mdi:<name>` or `hass:<name>`, max. 64 characters | `''` = no override |
| `onColor` | string | `#rrggbb` | `''` = default colour (light colour / state colour) |
| `offColor` | string | `#rrggbb` (Toggle only) | `''` = default off colour |

Existing settings (feature 001/002) are not renamed or reinterpreted. Keys saved before this
feature have none of these fields and therefore get the icon layout (spec FR-015, SC-003).

## 2. PI form elements (Toggle, Sensor, HA Trigger, Service)

A new section "Icon" below the existing label field:

| Element | Name | Notes |
|---|---|---|
| Checkbox "Show icon" | `showIcon` | Not present on the Service PI. Unchecking hides the other icon fields and, on the Toggle PI, shows the on/off text fields more prominently. |
| Text "Icon (mdi:…)" + preview | `icon` | Placeholder: the icon HA would use (from `icon.preview` with `entityId`). Preview updates 200 ms after typing. Unknown names show the hint `pi.icon.notFound`. |
| Colour "On colour" + reset | `onColor` | The reset button stores `''`. On the Trigger/Service/Sensor PI the label is "Icon colour". |
| Colour "Off colour" + reset | `offColor` | Toggle PI only. |
| Hint | — | `pi.icon.hint`: "Leave empty to use the Home Assistant icon and colour." |

`bindForm` needs to support `type="checkbox"` (boolean) and `type="color"` with an "empty"
state, which `shared.js` adds as a small helper (`mountColorField`).

## 3. New PI request

| `type` | `payload` | Reply `payload` |
|---|---|---|
| `icon.preview` | `{ "name": string \| null, "entityId": string \| null }` | `{ "found": bool, "name": string \| null, "path": string \| null, "source": "override" \| "entity" \| "platform" \| "component" \| "fallback" \| null }` |

Rules:
- If `name` is non-empty: it is resolved alone. `found: false` if it is unknown or invalid
  (`source: null`).
- If `name` is empty and `entityId` is given: resolution as on the key without an override
  (data-model §4, steps 2–5). `found: false` if the entity is unknown or no icon was resolved.
- `path` is the 24×24 SVG path. The PI renders
  `<svg viewBox="0 0 24 24"><path d="…" fill="currentColor"/></svg>` with `textContent`/DOM APIs
  (no `innerHTML` with unescaped input).
- Works while disconnected for `name` (the icon set is local). The `entityId` form then returns
  `found: false`.

## 4. New localisation keys (en / de_DE)

`pi.icon.heading`, `pi.icon.show`, `pi.icon.name`, `pi.icon.name.placeholder`,
`pi.icon.notFound`, `pi.icon.onColor`, `pi.icon.offColor`, `pi.icon.color`, `pi.icon.reset`,
`pi.icon.hint`, `pi.connection.iconsUnavailable`.

## 5. Extended `connection.status` reply and `connection.changed` push

Both payloads get one more field (all other fields unchanged):

| Field | Type | Meaning |
|---|---|---|
| `iconsAvailable` | `true \| false \| null` | `null` while not connected or before the first icon request finished; `true` after the component icons were received; `false` after the request failed on the current connection |

When `iconsAvailable === false`, the shared connection block (`shared.js`) shows the hint
`pi.connection.iconsUnavailable` below the status line, for example "Home Assistant icons are
not available (HA 2024.2 or newer required). Built-in icons are used." / "Home-Assistant-Icons
nicht verfügbar (HA 2024.2 oder neuer nötig). Es werden eingebaute Icons verwendet." The main
service pushes `connection.changed` when the value changes. This makes the degraded mode
visible to the user (constitution Principle IV).
