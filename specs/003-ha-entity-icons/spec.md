# Feature Specification: Home Assistant Entity Icons on Keys

**Feature Branch**: `003-ha-entity-icons`

**Created**: 2026-11-21

**Status**: Draft

**Input**: User description (translated from German): "Show Home Assistant Material Design Icons (MDI) on the keys. Entity-bound keys (Toggle, Sensor, Trigger/Scene, optionally Service) show by default the icon Home Assistant uses for the entity: first an icon the user set in HA (e.g. mdi:ceiling-light), otherwise the HA default icon matching domain, device class and current state (e.g. light on/off → mdi:lightbulb / mdi:lightbulb-off, cover open/closed → window-shutter-open / window-shutter), obtained from Home Assistant's icon definitions. The icon is drawn in one colour: by default the state colour, or for lights the actual light colour as in the HA frontend; in the settings page (Property Inspector) the user can choose a custom colour per state (on/off), override the icon by its mdi: name, or switch the icon display off entirely (previous text layout). Key layout: the icon replaces the large status text, the label stays below, plus a value where applicable (e.g. brightness %). Error states (unavailable, disconnected, not found) and edit mode stay clearly recognisable. All MDI icons ship with the plugin (offline, approx. 7,000 icons), since user and HA icons can have any name; unknown icon names fall back to a domain default icon or the text layout. The icons' license must be covered in NOTICE/THIRD_PARTY_LICENSES. Dials are out of scope for now."

**Builds on**: [Feature 001 – Home Assistant Plugin for Ulanzi Deck](../001-ha-deck-plugin/spec.md) (FR-011, FR-012, FR-014, FR-033, Story 6). This feature adds an icon layout for keys; the text layout of feature 001 remains available unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Toggle keys show the Home Assistant icon for the current state (Priority: P1)

As a user, I place a Toggle key for a light and see, without any extra configuration, the same icon Home Assistant shows for it: a lit bulb when the light is on (in the light's actual colour), a bulb-off icon in grey when it is off. When I switch the light – on the deck or in HA – the icon changes accordingly.

**Why this priority**: This is the core value of the feature: keys become recognisable at a glance and look consistent with the user's Home Assistant dashboards. It works for every existing and new Toggle key without setup.

**Independent Test**: Bind a Toggle key to `light.desk` (colour light), set the light to red in HA → the key shows a bulb icon in red with the label below; switch it off → the key shows the bulb-off icon in grey.

**Acceptance Scenarios**:

1. **Given** a Toggle key bound to a light that is on with colour red and 60 % brightness, **When** the key is displayed, **Then** it shows the HA "on" icon of the light in red, the label below and the brightness (60 %) as a secondary value.
2. **Given** the same light switched off, **When** the state change arrives, **Then** the key shows the HA "off" icon in the neutral off colour within the usual update time, without the brightness value.
3. **Given** a light the user gave a custom icon in HA (e.g. ceiling light), **When** the key is displayed, **Then** that custom icon is shown instead of the default bulb.
4. **Given** a Toggle key bound to a cover, **When** the cover is open respectively closed, **Then** the key shows the HA icon for "open" respectively "closed" for that cover's device class (e.g. shutter, garage door, blind).
5. **Given** a Toggle key bound to a switch, fan, media player, thermostat or input boolean, **When** the key is displayed, **Then** it shows the icon HA uses for that entity in its current state.
6. **Given** a light without colour support that is on, **When** the key is displayed, **Then** the icon is drawn in the default "on" colour.
7. **Given** a Toggle key that was configured before this feature, **When** the plugin is updated, **Then** the key shows the icon layout (default on) and keeps its label and all other settings.

---

### User Story 2 - Customise or switch off the icon (Priority: P1)

As a user, I open the settings of a key and can choose a custom colour for the "on" and "off" state, replace the icon with another icon by name, or switch the icon display off to get the previous text layout back.

**Why this priority**: Defaults never fit every setup (e.g. a switch that controls a coffee machine). Without an override and an off switch, the feature would force a look on users who prefer the text layout.

**Independent Test**: In a Toggle key's settings, enter the icon name `mdi:coffee-maker` and the "on" colour green → the key shows a coffee maker in green when on; switch "Show icon" off → the key shows the familiar on/off text layout.

**Acceptance Scenarios**:

1. **Given** a key with an icon override `mdi:coffee-maker`, **When** the entity is on or off, **Then** the coffee maker icon is shown in both states (in the respective state colour).
2. **Given** a key with a custom "on" colour, **When** the entity is on, **Then** the icon is drawn in that colour – also for colour lights (custom colour wins over the light colour).
3. **Given** a key with a custom "off" colour, **When** the entity is off, **Then** the icon is drawn in that colour.
4. **Given** a key with "Show icon" switched off, **When** the key is displayed, **Then** it uses the text layout of feature 001 including the configured on/off texts.
5. **Given** I type an icon name in the settings, **When** the name is known, **Then** a preview of the icon is shown next to the field; **When** it is unknown, **Then** the field shows a hint that the icon was not found and the key falls back to the HA icon.
6. **Given** I clear the icon override or the custom colours, **When** I save, **Then** the key returns to the HA icon and the default colours.

---

### User Story 3 - Sensor and trigger keys show icons (Priority: P2)

As a user, my Sensor keys show the HA icon of the sensor (e.g. thermometer, humidity drop, battery level) above the value, and my Scene/Script/Automation keys show the icon HA uses for them (e.g. the palette for a scene, or the custom icon of a script).

**Why this priority**: Extends the benefit to the other entity-bound key types. Toggle keys are the most common, so this is secondary.

**Independent Test**: Bind a Sensor key to a temperature sensor → thermometer icon above "21.5 °C" and the label; bind a Trigger key to a scene with a custom icon → that icon is shown.

**Acceptance Scenarios**:

1. **Given** a Sensor key bound to a numeric sensor with a device class (e.g. temperature), **When** the key is displayed, **Then** it shows the HA icon for that device class, the value with unit and the label.
2. **Given** a battery sensor, **When** its value changes from 80 % to 15 %, **Then** the icon follows the HA icon for the respective level where HA defines level-dependent icons.
3. **Given** a Sensor key whose value is outside the configured warning thresholds, **When** the key is displayed, **Then** the warning remains clearly recognisable (icon and value drawn in the warning colour).
4. **Given** a Trigger key bound to a scene, script or automation, **When** the key is displayed, **Then** it shows the entity's HA icon in the trigger colour; **When** it is pressed and the call succeeds, **Then** the existing short confirmation is shown.
5. **Given** a Sensor or Trigger key with "Show icon" off, **When** displayed, **Then** the text layout of feature 001 is used.

---

### User Story 4 - Service keys with a chosen icon (Priority: P3)

As a user, I can give a Service Call key an icon by name (and a colour), so it fits visually with my other keys.

**Why this priority**: Service keys have no entity, so there is no HA icon to take over; the value is purely cosmetic.

**Independent Test**: Configure a Service key `light.turn_on` with icon `mdi:lightbulb-group` → the key shows that icon with the label.

**Acceptance Scenarios**:

1. **Given** a Service key with an icon name configured, **When** displayed, **Then** it shows that icon in the trigger colour (or the custom colour) with the label below.
2. **Given** a Service key without an icon name, **When** displayed, **Then** it uses the text layout of feature 001 unchanged.

---

### Edge Cases

- **Error states**: Disconnected, entity not found, entity unavailable and invalid configuration keep a clearly distinguishable error appearance (error colour plus the error text from feature 001); no state icon is shown that could suggest a valid state.
- **Edit mode**: A key in edit mode keeps the edit appearance of feature 001 (edit marker, live value, label); the icon may be shown small but must not reduce the legibility of the live value.
- **"Set up" state**: A key without a bound entity shows the setup hint as before.
- **Unknown icon name** (from HA or the override, e.g. a custom icon pack prefix): fall back to the HA default icon for the domain/state; if none is known either, use the text layout. The fallback is logged at debug level.
- **HA does not provide icon definitions** (older HA version or the request fails): use a built-in default icon per domain and on/off state; user-set HA icons and overrides still work. The settings page shows a hint that Home Assistant icons are unavailable, so the degraded mode is visible.
- **Very dark or very bright light colours** (e.g. near-black RGB): the icon stays visible against the key background (colour is lightened/adjusted to a minimum contrast).
- **Lights in colour-temperature mode**: the icon uses the colour that corresponds to the current colour temperature, as HA does, or the default "on" colour if not available.
- **Unknown or intermediate states** (e.g. cover "opening", media player "paused", thermostat "heat"/"cool"): the icon HA defines for that state is used; states counted as "on" by feature 001 use the "on" colour.
- **Long labels and values**: icon, value and label share the key without overlapping; label truncation follows feature 001.
- **Icon changes in HA at runtime** (user changes the custom icon in HA): the key updates without reconfiguring.
- **Rapid state changes**: icon updates follow the same throttling/optimistic behaviour as the existing key display; no flicker between icons.

## Requirements *(mandatory)*

### Functional Requirements

**Icon source**

- **FR-001**: System MUST determine the icon of an entity-bound key in this order: (1) the icon override configured on the key, (2) the custom icon the user set for the entity in Home Assistant, (3) the icon Home Assistant defines for the entity's domain, device class and current state, (4) a built-in default icon per domain and on/off state, (5) the text layout.
- **FR-002**: System MUST obtain Home Assistant's icon definitions from the configured HA instance once per connection and reuse them until the next reconnect; no other host may be contacted.
- **FR-003**: System SHOULD honour integration-specific entity icons where Home Assistant defines them for the entity, and value-range-dependent icons (e.g. battery level) where HA defines them.
- **FR-004**: System MUST ship the complete Material Design Icons set with the plugin so that any icon name used by HA or entered by the user can be drawn offline.
- **FR-005**: System MUST accept icon names with the prefix `mdi:` (and the legacy alias `hass:`); names with other prefixes are treated as unknown (fallback per FR-001).
- **FR-006**: System MUST update the icon when the entity's state, its HA custom icon, or (for colour lights) its colour changes.

**Colour**

- **FR-007**: System MUST draw the icon in a single colour: by default the light's current colour for colour-capable lights that are on, otherwise a default "on" colour for on states and a neutral "off" colour for off states.
- **FR-008**: Users MUST be able to set a custom icon colour per key: for Toggle keys separately for the "on" and the "off" state, for Sensor, HA Trigger and Service keys one icon colour (these keys have no on/off state). A custom colour takes precedence over the light colour.
- **FR-009**: System MUST ensure the icon remains visible against the key background regardless of the light colour (minimum contrast).
- **FR-010**: Sensor keys MUST draw icon and value in the warning colour while the value is outside the warning thresholds; HA Trigger and Service keys MUST use the trigger colour by default.

**Layout and states**

- **FR-011**: In the icon layout, the key MUST show the icon as the main element, the label (feature 001 FR-011) below it, and – where applicable – a secondary value: brightness in % for lights that are on (feature 001 FR-012), value and unit for Sensor keys.
- **FR-012**: In the icon layout, the configured on/off texts of a Toggle key are not shown; they remain effective in the text layout.
- **FR-013**: Error states, the "set up" hint and edit mode MUST remain clearly distinguishable from normal states as in feature 001 (FR-033, FR-040); error states MUST NOT show a state icon.
- **FR-014**: HA Trigger and Service keys MUST keep the short success confirmation after a press.

**Configuration**

- **FR-015**: Users MUST be able to switch the icon display on or off per key ("Show icon"); default is on for Toggle, Sensor and HA Trigger (scene/script/automation) keys, including keys configured before this feature.
- **FR-016**: Users MUST be able to enter an icon override by name per key, with a live preview and a "not found" hint for unknown names.
- **FR-017**: Service Call keys MUST show an icon only when the user configured an icon name; otherwise they keep the text layout.
- **FR-018**: All new settings MUST be persisted per key (feature 001 FR-042) and all new texts MUST be available in German and English.

**Licensing**

- **FR-019**: The license of the bundled icon set MUST be listed in the plugin's third-party license file and in NOTICE.

### Key Entities

- **Icon reference**: The name of an icon (e.g. `mdi:lightbulb-off`); resolved to a drawable icon from the bundled icon set, or unknown.
- **HA icon definitions**: Home Assistant's mapping from domain, device class, state (and optionally integration, range) to an icon reference; loaded per connection.
- **Key icon settings**: Per key: "Show icon" (on/off), icon override (optional icon reference), custom "on" colour and custom "off" colour (optional).
- **Icon render data**: The resolved icon, its colour, label and optional secondary value that make up the key image in the icon layout.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For standard entities of the seven Toggle domains (light, switch, fan, cover, media player, thermostat, input boolean), the icon on the key matches the icon shown in the Home Assistant frontend for the same state in 100 % of the cases checked in the validation.
- **SC-002**: After a state or colour change in Home Assistant, the key shows the new icon/colour within 1 second (same as the existing state display).
- **SC-003**: Existing keys continue to work after the update without reconfiguration; 0 settings from feature 001/002 are lost.
- **SC-004**: A user can switch a key to a different icon and colour, or back to the text layout, in under 30 seconds in the settings page.
- **SC-005**: The plugin draws icons with no internet connection and contacts no host other than the configured Home Assistant instance.
- **SC-006**: The installable plugin package grows by at most 5 MB due to the bundled icons.
- **SC-007**: Every key remains legible from normal desk distance: icon, label and value do not overlap for labels up to the existing truncation length.

## Assumptions

- The icon layout becomes the default for Toggle, Sensor and HA Trigger keys, including existing keys; users who prefer the previous look switch it off per key. (Chosen because the user asked for icons "by default".)
- Home Assistant versions that provide icon definitions via their real-time interface are targeted; for older versions the built-in per-domain defaults (FR-001 step 4) are sufficient. The exact minimum HA version is fixed in the plan.
- The default "on" colour follows the existing "on" style of the plugin (amber, similar to HA's active-state colour); the default "off" colour is a neutral grey. The key background in the icon layout is neutral and dark so that coloured icons stand out; error and edit states keep their distinctive backgrounds.
- The bundled icon set is the community Material Design Icons set used by Home Assistant, under a permissive license compatible with Apache-2.0 (to be confirmed in the plan).
- Icon selection is by typed name with preview; a browsable/searchable icon gallery is out of scope.
- Icons on the dial displays (HA Dial, HA Dynamic Dial) and long-press-entity icons are out of scope for this feature.
- Animated icons, multi-colour icons and user-uploaded images are out of scope.
