# Contract: Plugin Manifest, Actions and Settings

The interface the plugin exposes to Ulanzi Studio and to users. Event and command names are
those documented in the UlanziDeckPlugin-SDK (`common-node` / `common-html`).

## Plugin identity

| Field | Value |
|---|---|
| Folder | `com.ulanzi.hadeck.ulanziPlugin` |
| `UUID` | `com.ulanzi.ulanzistudio.hadeck` |
| `Type` / `CodePath` | `JavaScript` / `dist/app.js` |
| `Software.MinVersion` | `3.3.0` (pending validation V-05) |
| `OS` | `[{ "Platform": "mac", "MinimumVersion": "10.15" }, { "Platform": "windows", "MinimumVersion": "10" }]` |
| `Category` | `Home Assistant` |
| Localisation files | `en.json`, `de_DE.json` |

## Actions

| Action | UUID suffix | `Controllers` | `Devices` | `Encoder.layout` | Property Inspector |
|---|---|---|---|---|---|
| HA Toggle | `.toggle` | `["Keypad"]` | `[]` | – | `property-inspector/toggle.html` |
| HA Dial | `.dial` | `["Encoder"]` | `[]` | `$UA1` | `property-inspector/dial.html` |
| HA Dynamic Dial | `.dynamicdial` | `["Encoder"]` | `[]` | `$UA1` | `property-inspector/dynamic-dial.html` |
| HA Trigger (scene / script / automation) | `.scene` | `["Keypad"]` | `[]` | – | `property-inspector/scene.html` |
| HA Sensor | `.sensor` | `["Keypad"]` | `[]` | – | `property-inspector/sensor.html` |
| HA Service Call | `.service` | `["Keypad"]` | `[]` | – | `property-inspector/service.html` |

`"Devices": []` means "all devices" (SDK default). Restricting the dial actions to encoder
hardware is done by `"Controllers": ["Encoder"]`: Ulanzi Studio only lets them be placed on
encoder slots, so key-only devices (e.g. D200) cannot receive them. No device list has to be
maintained when Ulanzi releases new models.

All actions: `SupportedInMultiActions: false` and `DisableAutomaticStates: true`. The plugin
renders every icon itself.

## Global settings (`setGlobalSettings`)

```json
{ "haUrl": "http://homeassistant.local:8123", "haToken": "<long-lived token>" }
```

## Per-action settings (`setSettings`)

Every field is optional unless marked *required*. Defaults are shown in parentheses.

**toggle**
```json
{
  "entityId": "light.kitchen",            // required
  "label": "",                             // (friendly name)
  "onText": "", "offText": "",             // (localised status.on / status.off)
  "longPress": "edit",                     // edit | disabled | entity | service
  "longPressEntityId": "",                 // required if longPress = entity
  "longPressService": null,                // ServiceCall, required if longPress = service
  "longPressMs": 500                       // 300–2000
}
```

**dial**
```json
{
  "entityId": "light.kitchen",             // required
  "attributeId": "light.brightness",       // required, must be supported by the entity
  "label": "",
  "stepFine": null, "stepCoarse": null,    // (attribute defaults)
  "offAtMin": true
}
```

**dynamicdial**
```json
{ "stepFine": null, "stepCoarse": null, "offAtMin": true, "editTimeoutS": 10 }
```

If several Dynamic Dials are configured, the edit session uses the largest `editTimeoutS`
among them.

**scene**: `{ "entityId": "scene.evening", "label": "" }`. Domains: `scene` → `turn_on`,
`script` → `turn_on`, `automation` → `trigger`.

**sensor**: `{ "entityId": "sensor.outdoor_temperature", "label": "", "warnAbove": null, "warnBelow": null }`

**service**
```json
{ "label": "All on", "domain": "light", "service": "turn_on",
  "target": { "entity_id": ["light.kitchen"] }, "data": { "brightness_pct": 100 } }
```

## SDK events consumed

| Event | Used by | Behaviour |
|---|---|---|
| `onConnected` | app | request global settings, connect to HA |
| `onDidReceiveGlobalSettings` | app | (re)configure HAConnection |
| `onAdd` | all | create the action instance from `message.param`; Encoder actions call `setFeedbackLayout(context,'$UA1')` |
| `onParamFromApp` / `onDidReceiveSettings` | all | update the binding, re-render |
| `onClear` | all | dispose instances (`message.param[].context`); end the edit session if the source key or the last Dynamic Dial is removed |
| `onSetActive` | all | `active:false` on the edit source key ends the edit session (V-06); `active:true` triggers a re-render |
| `onKeyDown` / `onKeyUp` | toggle | press detector (short/long) |
| `onRun` | scene, sensor, service | single press; **ignored** by toggle |
| `onDialRotate` | dial, dynamicdial | `rotateEvent`: `left`/`right` → fine step, `hold-left`/`hold-right` → coarse step |
| `onDialDown` / `onDialUp` | dial | short press → domain default action (FR-026). For dynamicdial, a press during edit runs the same default action on the edited entity |
| `onSendToPlugin` | app | Property Inspector requests ([pi-messages.md](pi-messages.md)) |

## SDK commands emitted

| Command | When |
|---|---|
| `setBaseDataIcon(context, base64Svg, '')` | key render (state change, edit mode, error) |
| `setFeedbackLayout(context, '$UA1')` | once per encoder context on add |
| `setFeedback(context, { title: { text }, icon: { value } })` | dial render |
| `showAlert(context)` | failed service call (FR-040) |
| `toast(message)` | hint "no Dynamic Dial configured" (FR-039), auth failure |
| `sendToPropertyInspector(payload, context)` | responses and status pushes ([pi-messages.md](pi-messages.md)) |
| `logMessage(msg, level)` | logging (token redacted) |
