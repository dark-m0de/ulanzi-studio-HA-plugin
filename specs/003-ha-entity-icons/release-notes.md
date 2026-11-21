# HA Deck 0.3.0 – Home Assistant icons on keys

## New

- **Keys show Home Assistant's icons.** HA Toggle, HA Trigger and HA Sensor keys show the
  [Material Design icon](https://pictogrammers.com/library/mdi/) that Home Assistant uses for the
  entity in its current state, for example:
  - bulb / bulb off for lights, fan / fan off, switch / switch off, plug for outlets
  - open / closed shutter, garage or blind for covers, arrows while they move
  - thermometer for temperature sensors, battery level icons for battery sensors
  - a custom icon you set for the entity in Home Assistant (it updates as soon as you change it there)
  - integration-specific icons where the integration defines them
- **Icon colour.** Lights that are on show the icon in their actual colour. Off states are grey,
  triggers violet, sensors teal, and sensors beyond their limits orange. Dark light colours are
  lightened so the icon stays visible.
- **Layout.** The icon replaces the large status text. The label stays below it, plus the brightness
  (lights) or the value with unit (sensors).
- **Settings per key** (new section "Icon"):
  - **Show icon**: switch off to get the previous text layout, including your on/off texts
  - **Icon (mdi:…)**: use any other icon by name, with live preview and a hint for unknown names
  - **Colours**: on and off colour for HA Toggle keys, one icon colour for the other keys; "Reset"
    returns to the Home Assistant colour
- **HA Service Call keys** can show an icon you enter by name; without one they look as before.

## Changed behaviour

- Keys configured with 0.2.x show icons after the update. Your settings are kept. To get the
  previous look, switch off **Show icon** in the key's settings.
- Error states (offline, not found, unavailable), edit mode and the short "OK" confirmation keep
  their familiar text layout.

## Notes

- Home Assistant's icon definitions need Home Assistant 2024.2 or newer. With older versions the
  plugin uses built-in icons for all supported domains, and the settings page shows a hint.
- All icons ship with the plugin and work offline. The plugin still talks only to your Home
  Assistant instance.
- Dial displays do not show icons yet.
- Icons: Material Design Icons by Pictogrammers (Apache License 2.0).
