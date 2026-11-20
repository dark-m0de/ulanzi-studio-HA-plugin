# Feature Specification: Home Assistant Plugin for Ulanzi Deck with Dial Support

**Feature Branch**: `001-ha-deck-plugin`

**Created**: 2026-11-20

**Status**: Draft

**Input**: User description (translated from German): "A plugin for the Ulanzi Deck based on the UlanziDeckPlugin-SDK that controls Home Assistant. Compared to the original plugin, the rotary dials should also be supported. They should either be bound directly to entities or their attributes (e.g. light.brightness), or – when a key bound to a light is long-pressed – change the brightness of that entity via the dials. Inspiration: weemaba999/ha-hub-ulanzi."

## Clarifications

### Session 2026-11-20

- Q: How are multiple Dynamic Dials used in edit mode? → A: Only one Dynamic Dial is intended. If several are configured anyway, all act equally on the same value; if that is technically not possible, only the right-most one is used.
- Q: What does a short press on a dial bound to a media player do? → A: Toggle between play and pause.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set up the Home Assistant connection (Priority: P1)

As a user, I enter the address of my Home Assistant instance and a long-lived access token once, test the connection with a button, and never have to enter these details again for any further key or dial.

**Why this priority**: Without a connection no other feature works. It is the foundation for all other stories.

**Independent Test**: Install the plugin, place any action on a key, enter URL and token, press "Test connection" – success including the number of entities found, or an understandable error message, is shown.

**Acceptance Scenarios**:

1. **Given** a reachable HA instance and a valid token, **When** I enter URL and token and choose "Test connection", **Then** "Connected" and the number of available entities are shown.
2. **Given** an invalid token, **When** I test the connection, **Then** I get the message "Authentication failed" and the plugin does not endlessly retry with the same invalid token.
3. **Given** an already configured connection, **When** I place another action on a key or dial, **Then** the connection details are already set and I only need to choose the entity.
4. **Given** an established connection, **When** Home Assistant restarts or the network drops briefly, **Then** the plugin reconnects automatically and all keys show the current state again afterwards.

---

### User Story 2 - Toggle an entity with a key, with live state (Priority: P1)

As a user, I place an entity (e.g. light, switch, plug, fan, cover, media player, input_boolean) on a key. A short press toggles it, and the key always shows the current state – even if the entity was changed outside the deck.

**Why this priority**: Core function of any HA deck plugin and prerequisite for the long-press feature in Story 4.

**Independent Test**: Place a light on a key, press the key → light toggles; toggle the light in the HA UI → key updates on its own.

**Acceptance Scenarios**:

1. **Given** a key with `light.living_room` (off), **When** I short-press the key, **Then** the light turns on and the key shows the "on" state.
2. **Given** a configured key, **When** the entity is changed in Home Assistant from elsewhere, **Then** the key display updates within 1 second.
3. **Given** a configured key, **When** the entity is `unavailable` or `unknown`, **Then** the key shows a clearly recognisable error/unknown state.
4. **Given** the configuration UI of a key, **When** I type in the entity field, **Then** I can search by entity ID and friendly name and select an entity.
5. **Given** a dimmable light that is on, **When** the key is displayed, **Then** the current brightness (in %) is visible in addition to the state.

---

### User Story 3 - Bind a dial directly to an entity attribute (Priority: P1)

As a user, I place an "HA Dial" action on a dial and bind it permanently to an entity and a controllable value (e.g. light brightness, colour temperature, media player volume, thermostat target temperature, cover position, fan speed, value of an `input_number`/`number`). Rotating changes the value, pressing toggles the entity, and the display next to the dial shows the name and current value.

**Why this priority**: This is the central improvement over the original plugin and the main reason for this project.

**Independent Test**: Bind a dial to `light.living_room` / brightness, rotate right → the light gets brighter and the display shows the new percentage; press the dial → the light toggles.

**Acceptance Scenarios**:

1. **Given** a dial bound to `light.living_room` / brightness at 40 %, **When** I rotate one detent to the right, **Then** the brightness increases by the configured step (default 5 %) and the display shows the new value immediately.
2. **Given** a dial bound to a brightness value, **When** I rotate several detents quickly, **Then** the display reacts to every detent immediately, but Home Assistant receives the changes batched, without intermediate steps making the light "flicker", and at the end the value matches the display.
3. **Given** a dial, **When** I hold it pressed while rotating, **Then** the value changes with a larger step (coarse mode).
4. **Given** a dial bound to a light that is off, **When** I rotate right, **Then** the light turns on at the smallest step.
5. **Given** a dial bound to a light at minimum brightness, **When** I keep rotating left, **Then** the dial behaves according to the "turn off at 0 %" setting (default: on), or stays at minimum brightness.
6. **Given** a dial bound to an entity, **When** I short-press the dial, **Then** the entity is toggled according to its domain (on/off, or play/pause for media players).
7. **Given** the configuration UI of a dial, **When** I select an entity, **Then** only the values actually supported by that entity are offered (e.g. no colour temperature for lamps without colour temperature support).
8. **Given** the value is changed outside the deck, **When** the entity changes in HA, **Then** the dial display shows the new value within 1 second.

---

### User Story 4 - Long-press a light key to change its brightness with a dial (Priority: P2)

As a user, I long-press a key bound to a light. The key then switches into a clearly recognisable "edit" mode, and the Dynamic Dial now controls the brightness of exactly that light – without me having to assign a dedicated dial to every light.

**Why this priority**: Makes the limited number of dials usable for any number of lights. Builds on Stories 2 and 3.

**Independent Test**: Assign a light key and one dial with the "HA Dynamic Dial" action; long-press the key → the key shows edit mode, the dial display shows the light's name and brightness; rotating changes its brightness; after the timeout or a short key press the mode ends.

**Acceptance Scenarios**:

1. **Given** a key with a dimmable light and at least one dial with the "HA Dynamic Dial" action, **When** I hold the key longer than the long-press threshold (default 500 ms), **Then** the light is **not** toggled; instead the key enters edit mode and the Dynamic Dial(s) show the name and current brightness of this light.
2. **Given** edit mode is active for `light.kitchen`, **When** I rotate the Dynamic Dial, **Then** the brightness of `light.kitchen` changes, and both the key and the dial display show the new value.
3. **Given** edit mode is active, **When** I short-press the edited key again or there is no input for the configured time (default 10 s), **Then** edit mode ends and the Dynamic Dials return to their idle state.
4. **Given** edit mode is active for light A, **When** I long-press the key of light B, **Then** edit mode switches directly to light B.
5. **Given** a key with an entity without adjustable values (e.g. a switch), **When** I long-press it, **Then** the optionally configured long-press alternative is executed, or – without configuration – it toggles normally.
6. **Given** no dial is assigned the "HA Dynamic Dial" action, **When** I long-press a light key, **Then** I get a short hint that no Dynamic Dial is configured.
7. **Given** a dial is permanently bound to an entity (Story 3), **When** edit mode is active, **Then** that dial stays unchanged on its fixed entity.
8. **Given** the user has assigned "HA Dynamic Dial" to several dials (contrary to the recommendation of using only one), **When** edit mode is active, **Then** all Dynamic Dials act equally on the same value (brightness) of the edited entity, and all Dynamic Dial displays show the same value in sync.

---

### User Story 5 - Long-press for other adjustable domains (Priority: P3)

The edit mode from Story 4 works analogously for other domains with an adjustable value: media player (volume), thermostat (target temperature), cover (position), fan (speed).

**Why this priority**: Natural extension of Story 4 with little extra effort, but not the core of the request.

**Independent Test**: Long-press a media player key → the Dynamic Dial controls its volume.

**Acceptance Scenarios**:

1. **Given** a key with `media_player.living_room`, **When** I long-press it and rotate the Dynamic Dial, **Then** the volume changes.
2. **Given** a key with `climate.office`, **When** I long-press it and rotate the Dynamic Dial, **Then** the target temperature changes in the steps and within the bounds defined by the entity.

---

### User Story 6 - Additional key actions (Priority: P3)

As a user, I can additionally place on keys:
- **Trigger scene / script / automation** (one press = run, brief visual confirmation),
- **Show sensor** (display only: value + unit, optional warning colour at a threshold),
- **Arbitrary service call** (domain, service, target and data freely configurable).

**Why this priority**: Rounds off the feature set to the level of the original plugin and ha-hub-ulanzi, but is not needed for the core request (dials).

**Independent Test**: Place each of the three actions on a key individually and trigger it or check its display.

**Acceptance Scenarios**:

1. **Given** a key with `scene.evening`, **When** I press it, **Then** the scene is activated and the key briefly confirms this visually.
2. **Given** a key with `sensor.outdoor_temperature`, **When** the value changes, **Then** the key shows the new value including unit within 1 second.
3. **Given** a service key with `light.turn_on` and data `{"brightness_pct": 100}`, **When** I press it, **Then** the service is called with exactly this data; on error the key shows an error indication.

---

### Edge Cases

- What happens if the connection drops during a rotation? → The display indicates "disconnected"; input is discarded (not sent later), and the user gets an error indication.
- How does the system behave if a light only supports on/off (no brightness)? → Direct binding does not offer a brightness attribute; long-press does not enter edit mode but behaves as in Story 4, scenario 5.
- What happens if several keys/dials show the same entity? → All update consistently.
- What happens at value bounds (0 %/100 %, min/max temperature)? → Values are clamped; nothing beyond the bounds is sent.
- What happens if HA rejects or adjusts a change (e.g. lamp rounds brightness)? → After confirmation the display adopts the actual value from HA.
- What happens if a state update from HA arrives during rotation that corresponds to an older intermediate value? → The local (optimistic) display takes precedence during active operation and shortly after, so the value does not "jump back".
- What happens if a configured entity is deleted/renamed in HA? → The key/dial shows "not found" instead of crashing.
- What happens if the deck profile/page is switched while edit mode is active? → Edit mode ends.
- What happens if several Dynamic Dials are rotated simultaneously? → All detents are applied to the same value in order of arrival (or, in the fallback, only those of the right-most Dynamic Dial).
- What happens on a device without dials (e.g. D200)? → Key actions work; long-press on light keys shows the hint from Story 4, scenario 6.
- How are Home Assistant URLs over HTTPS or with self-signed certificates handled? → See Assumptions.

## Requirements *(mandatory)*

### Functional Requirements

**Connection**

- **FR-001**: System MUST connect to Home Assistant via its real-time interface using a base URL and a long-lived access token.
- **FR-002**: System MUST store URL and token plugin-wide (globally), so that they apply to all actions and only need to be entered once.
- **FR-003**: Users MUST be able to test the connection in the configuration UI and receive an understandable success or error message (unreachable / authentication failed / timeout).
- **FR-004**: System MUST automatically reconnect after a connection loss with increasing intervals (max. 30 s) and reload all states afterwards.
- **FR-005**: System MUST stop automatic reconnect attempts on an invalid token and make the error visible until new credentials are entered.
- **FR-006**: System MUST receive all state changes of configured entities in real time (push, no polling) and use a single shared connection for all actions.

**Key actions**

- **FR-010**: System MUST provide a "Toggle" action that toggles an entity of the domains `light`, `switch`, `fan`, `cover`, `media_player`, `climate`, `input_boolean`.
- **FR-011**: System MUST display the entity's current state on keys (on/off/unknown), with a configurable label (default: friendly name from HA) and configurable on/off texts.
- **FR-012**: System MUST display the brightness in percent on the key for dimmable lights that are on.
- **FR-013**: Users MUST be able to select entities in the configuration UI via a search by entity ID and friendly name.
- **FR-014**: System SHOULD provide actions for scene/script/automation, sensor display and arbitrary service calls (Story 6).

**Dials – fixed binding**

- **FR-020**: System MUST provide a dial action "HA Dial" that is permanently bound to an entity and a controllable value.
- **FR-021**: System MUST support at least the following controllable values: light brightness, light colour temperature, media player volume, thermostat target temperature, cover position, fan speed, `input_number`/`number` value.
- **FR-022**: System MUST offer in the configuration only values that the selected entity actually supports according to HA.
- **FR-023**: Users MUST be able to configure per dial the step size (fine) and the step size when rotating while pressed (coarse); defaults 5 % (fine) and 20 % (coarse); for temperatures fine = the entity's step (0.5 ° if the entity defines none) and coarse = 4 × fine.
- **FR-024**: System MUST update the value in the dial display immediately while rotating (optimistic display) and send changes to HA batched (at most one call per 200 ms per entity, i.e. ≤ 5 calls per second; the last value is always sent).
- **FR-025**: System MUST clamp values to the entity's valid bounds.
- **FR-026**: System MUST execute a domain-dependent default action on a short dial press (light/switch/fan: toggle; media player: toggle between play and pause; thermostat: on/off).
- **FR-027**: System MUST show the entity name and current value (with unit) in the dial display and show an error state when unavailable.
- **FR-028**: System MUST turn on a light that is off when rotating up, and when rotating below minimum brightness turn it off according to the setting (default: turn off).

**Dials – dynamic via long-press (edit mode)**

- **FR-030**: System MUST provide a dial action "HA Dynamic Dial" that has no fixed entity but follows the entity currently in edit mode.
- **FR-031**: System MUST distinguish a long-press (default threshold 500 ms, configurable) on a Toggle key with an entity that has an adjustable value from a short press; a long-press MUST NOT toggle the entity.
- **FR-032**: System MUST activate edit mode for a light when its key is long-pressed, so that the Dynamic Dial controls its brightness.
- **FR-032a**: The intended usage model is exactly **one** Dynamic Dial per device; the documentation and the configuration UI MUST point this out. If several Dynamic Dials are configured anyway, System MUST treat all of them as equal inputs for the same value and keep their displays in sync. If this is technically not possible, only the right-most Dynamic Dial MUST serve as input; the others show a hint and ignore rotation.
- **FR-033**: System MUST display edit mode clearly on the key (e.g. different colour, "edit" marker, live value).
- **FR-034**: System MUST end edit mode on: another short press of the edited key, inactivity (default 10 s, configurable), page/profile switch, or connection loss.
- **FR-035**: System MUST have at most one entity in edit mode at any time; a long-press on another key switches the entity.
- **FR-036**: Dynamic Dials MUST show a hint in their idle state (no edit mode), e.g. "Long-press a key", and ignore rotation.
- **FR-037**: Users MUST be able to disable long-press per Toggle key, or alternatively define a second entity or action for the long-press.
- **FR-038**: System SHOULD support edit mode also for media players (volume), thermostats (temperature), covers (position) and fans (speed) (Story 5).
- **FR-039**: System MUST show a hint when edit mode is activated but no Dynamic Dial is configured.

**General**

- **FR-040**: System MUST make service call errors (rejection, timeout) visible on the affected key or dial.
- **FR-041**: System MUST offer the user interface in at least German and English.
- **FR-042**: System MUST persist the configuration per key/dial so that it survives restarts of Ulanzi Studio and the computer.
- **FR-043**: System MUST run on Windows and macOS.
- **FR-044**: System MUST store the token only locally and never write it to logs.

### Key Entities

- **HA Connection**: Plugin-wide configuration – base URL, token, connection status (disconnected / connecting / connected / auth error). Exactly one per plugin installation.
- **Entity State**: Mirror of an HA entity state – entity ID, domain, state, friendly name, attributes (e.g. brightness, supported colour modes, min/max, step). Shared by all actions.
- **Key Binding**: An action placed on a key – action type (Toggle, Scene, Sensor, Service), entity, display options, long-press behaviour.
- **Dial Binding**: An action placed on a dial – type (fixed / dynamic); for fixed: entity + controllable value; step sizes; behaviour at bounds.
- **Controllable Attribute**: Combination of domain and value (e.g. light/brightness) with unit, bounds, step, and how a new value is submitted to HA.
- **Edit Session**: Runtime state – edited entity, triggering key, start time/last input for the timeout. At most one at a time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: New users can set up the connection and assign their first light key in under 3 minutes.
- **SC-002**: State changes in HA are visible on the key or dial display within 1 second in 95 % of cases (local network).
- **SC-003**: The display reacts to every dial detent in under 100 ms; the light reaches the displayed value no later than 500 ms after the last detent.
- **SC-004**: A rotation from 0 % to 100 % brightness produces at most as many HA calls as defined in FR-024, and the final value in HA matches the displayed value in 100 % of cases.
- **SC-005**: Short and long presses are distinguished correctly in 100 % of cases in tests with 20 attempts per variant (no unintended toggle on long-press).
- **SC-006**: After an HA restart, all keys/dials are up to date again without user intervention within 30 seconds of HA becoming reachable.
- **SC-007**: With 30 assigned keys/dials, the plugin remains stable over 24 hours of continuous operation: no crash, and the memory usage (RSS) of the plugin process after 24 h is at most 20 % above the value measured after 1 h.
- **SC-008**: For every light key, brightness can be changed via long-press + rotation without additional configuration (apart from a Dynamic Dial assigned once).

## Assumptions

- The plugin is built with the official UlanziDeckPlugin-SDK for Ulanzi Studio; the SDK events for keys (press/release) and dials (rotate left/right, rotate while pressed, press/release) as well as the dial display are available.
- Target hardware with dials is the Ulanzi D200X (or other devices with encoder support); on devices without dials only key actions are usable.
- The minimum Ulanzi Studio version is the one from which the encoder features required by the SDK are available (defined during planning).
- Long-press is detected by the plugin from the time between press and release, because the SDK provides no dedicated long-press event. Edit mode is therefore activated as soon as the threshold is reached (while still pressed).
- The SDK does not allow an action to take over arbitrary dials; therefore one dial must be assigned the "HA Dynamic Dial" action once for the long-press edit mode to work.
- Home Assistant is reachable on the local network; remote access via HTTPS (e.g. Nabu Casa) is supported as long as the certificate is valid. Self-signed certificates are out of scope for v1.
- No CORS allowance in HA is required: the configuration UI does not connect to HA itself but performs the connection test and entity search through the plugin's main service.
- "Configuration UI" refers to the per-action settings page that Ulanzi Studio shows for a key or dial (called *Property Inspector* in the Ulanzi SDK and in the plan).
- Folder navigation, multi-actions (double tap etc.), macros, HA templates and camera/image display are out of scope for v1.
- "Original plugin" refers to the existing Home Assistant plugin without dial support; ha-hub-ulanzi serves only as a source of ideas, and no code is adopted from it (license AGPL-3.0).
- Like the SDK, the project is licensed under Apache-2.0; no code is adopted from projects with stricter licenses (see constitution, section "Licensing & Code Provenance").
