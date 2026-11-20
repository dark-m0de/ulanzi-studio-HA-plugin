# Contract: Property Inspector ⇄ Main Service Messages

The Property Inspector (PI) never connects to Home Assistant. It uses `$UD.sendToPlugin(payload)`
for requests. The main service replies with `$UD.sendToPropertyInspector(payload, context)`.
These messages are pass-through and are not stored by Ulanzi Studio.

Envelope (both directions):

```json
{ "v": 1, "type": "<message type>", "id": "<request id, echoed in reply>", "payload": { } }
```

Unknown `type`s are ignored. Every request gets exactly one reply with the same `id`,
containing either `payload` or `error: { "key": "<message key>" }`.

## Requests (PI → main service)

| `type` | `payload` | Reply `payload` |
|---|---|---|
| `connection.test` | `{ "haUrl": string, "haToken": string \| null }`. `null` means "use the stored token" | `{ "ok": true, "entityCount": number, "haVersion": string }` or `error.key ∈ error.unreachable \| error.auth \| error.timeout \| error.invalidUrl` |
| `connection.status` | `{}` | `{ "status": "unconfigured\|connecting\|connected\|reconnecting\|auth_failed", "hasToken": bool, "haUrl": string }` |
| `entities.list` | `{ "domains": string[] \| null, "query": string \| null, "limit": number }` | `{ "entities": [{ "entityId", "friendlyName", "domain", "state" }] }`. Matches on entity ID and friendly name, case-insensitive (FR-013) |
| `entity.capabilities` | `{ "entityId": string }` | `{ "attributes": [{ "id", "unit", "min", "max", "defaultFine", "defaultCoarse" }], "longPressEligible": bool }` (FR-022) |

The test validates the URL and token on a temporary connection. Only after success does the PI
call `setGlobalSettings`. The token is **never** included in any reply.

## Pushes (main service → PI, unsolicited)

| `type` | `payload` | When |
|---|---|---|
| `connection.changed` | same as the `connection.status` reply | the connection status changes while a PI is open |
| `entity.changed` | `{ "entityId", "state", "friendlyName" }` | the bound entity of the open PI changes (live preview) |

## PI behaviour rules

- The connection block (URL, token, test button, status) is shared by all PIs
  (`shared.js`). After saving, the token field shows a masked placeholder. A new value is
  sent only if the user edits the field.
- The form populates from `onAdd`/`onParamFromApp` and saves via `setSettings` on change
  (debounced 300 ms).
- The Dynamic Dial PI shows the hint "Use only one Dynamic Dial per device" (FR-032a).
- All visible strings use `data-localize` keys from `en.json`/`de_DE.json`.
