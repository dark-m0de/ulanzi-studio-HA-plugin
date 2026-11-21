# Quickstart & Validation: Home Assistant Entity Icons on Keys

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Prerequisites, build and install are unchanged from
[feature 001's quickstart](../001-ha-deck-plugin/quickstart.md). For the device scenarios you need
a Home Assistant (≥ 2024.2 for HA icons) with:
- a colour light (e.g. Hue or `demo`)
- a cover with device class `shutter` or `garage`
- a switch, a fan and a media player
- a temperature sensor and a battery sensor
- a scene and a script, one of them with a custom icon set in HA

HA's `demo` integration provides most of them. Set custom icons in HA under
*Settings → Entities → (entity) → Icon*.

## Automated checks

```bash
npm test
```

Covers ([data-model.md](data-model.md), [contracts](contracts/)):
- `mdi-set`: prefix normalisation (`mdi:`, `hass:`, invalid), kebab → camel lookup, unknown names
- `iconFromDefinition`: state match, range thresholds (battery 5/15/100), default, below the
  lowest threshold
- `resolveKeyIcon`: every step of the order, including override not found → HA icon, service
  keys override-only
- `iconColor` / `ensureContrast`: light `rgb_color`, custom colours, near-black and white
  lights, invalid colour strings
- `keySvg` icon layout: the four layout cases; text layout unchanged when `icon` is absent
  (snapshot of existing keys)
- key models: error, edit and confirmation states never carry `icon`
- HA client: `getIcons`, `listEntityRegistryDisplay` against the fake server, including
  `success: false`
- App integration: keys render with fallback icons before icon data arrives and are re-rendered
  with HA icons after it does; state change light on → off changes the icon; settings without
  icon fields → icon layout (backwards compatibility)
- PI handler `icon.preview` (name, entity, unknown, disconnected)
- `connection.status` / `connection.changed` carry `iconsAvailable` (`null` → `true`, or `false` when HA has no icon API)
- Unknown icon names are logged once at debug level, without entity IDs
- Locales: new keys in `en.json` and `de_DE.json`
- Bundle: the installed bundle still starts; `THIRD_PARTY_LICENSES.txt` contains `@mdi/js`

## Device scenarios

- **V-01 Rendering**: A Toggle key on a light shows a sharp bulb icon (no clipping, centred).
  Check this on both Windows and macOS.
- **V-02 State and colour (US1)**:
  - Set the light to red in HA: the bulb turns red and the brightness % is shown.
  - Switch it off: the bulb-off icon turns grey and no value is shown.
  - Set a very dark blue: the icon stays visible.
  - Time from the HA change to the key update must be ≤ 1 s (SC-002).
- **V-03 Other toggle domains (US1)**:
  - Cover (shutter/garage), switch, fan, media player, thermostat, input boolean: each shows
    the same icon as the HA dashboard tile in both states.
  - Record the result per domain in a table; 100 % must match (SC-001).
  - Integration-specific icons (e.g. Hue lights with a translation key) only arrive with US3.
    If V-03 runs after the MVP (US1), repeat it after US3 for the final SC-001 result.
- **V-04 Custom HA icon (US1)**:
  - Set a custom icon on the light in HA: the key follows without reconfiguration.
  - Remove it again: the key goes back to the bulb.
- **V-05 Override and colours (US2)**:
  - Enter `mdi:coffee-maker` in the PI: the preview appears and the key shows it.
  - Enter `mdi:does-not-exist`: the PI shows "not found" and the key shows the HA icon.
  - Set the on colour to green and the off colour to blue: they apply in both states, also
    for the colour light.
  - Reset: back to the defaults.
  - All of this in under 30 s (SC-004).
- **V-06 Switch off (US2)**: Uncheck "Show icon": the key shows the 001 text layout with the
  configured on/off texts.
- **V-07 Sensor and trigger (US3)**:
  - Temperature sensor: thermometer, value, label.
  - Battery sensor: the icon changes with the level (e.g. set the demo battery to 15 %
    → `battery-10`).
  - Warning threshold exceeded: icon and value turn orange.
  - Scene and script keys show their HA icons; a press shows the "done" confirmation.
- **V-08 Service key (US4)**:
  - Without an icon name: the text layout is unchanged.
  - With `mdi:lightbulb-group`: icon and label are shown.
- **V-09 Errors and edit mode**:
  - Disconnect HA: all keys show the "disconnected" text layout without an icon.
  - Use an unavailable entity: "unavailable" text layout.
  - Long-press a light key: the edit layout is unchanged.
- **V-10 Upgrade (SC-003)**:
  - Install over 0.2.0 with existing keys: all keys keep their settings and show icons.
  - Dials are unchanged.
- **V-11 Offline and privacy (SC-005)**:
  - With the internet blocked (HA reachable on the LAN), icons still render.
  - A network capture shows connections only to the HA host.
- **V-12 Old HA**: Against HA 2024.1 (or with the fake server set to `success: false`): keys show
  fallback icons, the log contains one warning per connection, and every PI's connection block
  shows the hint "Home Assistant icons are not available" (constitution Principle IV).
- **V-13 Size (SC-006)**: The packaged plugin grows by ≤ 5 MB compared to 0.2.0.
