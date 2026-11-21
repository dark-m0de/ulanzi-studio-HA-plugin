# Feature Specification: Configurable Dial Press Actions

**Feature Branch**: `002-dial-press-actions`

**Created**: 2026-11-21

**Status**: Draft

**Input**: User description (translated from German): "Configurable action when pressing the dials (extension of feature 001, HA Deck plugin for Ulanzi Deck). HA Dial (fixed binding): new setting 'Action on press' with the current domain-dependent behaviour as default (light/switch/fan: toggle, media player: play/pause, thermostat: on/off, cover: open/close). Selectable alternatives: switch the controlled value (e.g. brightness ↔ colour temperature for lamps, only supported values), mute on/off for media players, set a favourite value (fixed target, e.g. 100 % brightness, 2700 K or an input_number value), domain-specific extra actions (media: next track; thermostat: cycle operating mode or preset; cover: stop while moving; fan: oscillation on/off or cycle preset), call any service (like the long-press option of the Toggle key), no action. HA Dynamic Dial: new setting 'Action on press' with the new default 'End editing' (like 'Done'); alternatives: toggle the edited entity (previous behaviour), switch the controlled value (e.g. brightness ↔ colour temperature of the edited lamp; the dial display and the key show which value is currently controlled), no action. Pressing while rotating (hold-left/right) still triggers no action. A long press on the dial is explicitly not part of this feature (later). All texts in German and English, settings in the settings pages (Property Inspector) of HA Dial and HA Dynamic Dial."

**Builds on**: [Feature 001 – Home Assistant Plugin for Ulanzi Deck](../001-ha-deck-plugin/spec.md) (FR-026, Stories 3–5). This feature replaces the fixed press behaviour of FR-026 with a configurable one; everything else in feature 001 stays unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Press the Dynamic Dial to finish editing (Priority: P1)

As a user editing a light via long press, I press the Dynamic Dial when I am done. Edit mode ends immediately, exactly as if I had pressed the edited key again or waited for the timeout – without accidentally switching the light off because my finger was already on the dial.

**Why this priority**: The current behaviour (press = toggle the edited entity) is easy to trigger by accident while rotating, and "press = done" is the most intuitive gesture for an edit mode. It changes the default for every Dynamic Dial user.

**Independent Test**: Long-press a light key, rotate the Dynamic Dial, press it → the key returns to its normal style, the Dynamic Dial shows its idle hint, the light keeps its brightness and is not toggled.

**Acceptance Scenarios**:

1. **Given** a Dynamic Dial with default settings and edit mode active for `light.kitchen`, **When** I press and release the dial without rotating, **Then** edit mode ends, no service call is sent, the key shows its normal style and the dial shows the idle hint.
2. **Given** a Dynamic Dial set to "Toggle edited entity", **When** I press it during edit mode, **Then** the edited entity is toggled (previous behaviour) and edit mode continues.
3. **Given** a Dynamic Dial set to "No action", **When** I press it during edit mode, **Then** nothing happens and edit mode continues.
4. **Given** no edit mode is active, **When** I press a Dynamic Dial with any setting, **Then** nothing happens.
5. **Given** a Dynamic Dial that was configured before this feature (no press setting saved), **When** I press it during edit mode, **Then** it behaves like the new default "End editing".

---

### User Story 2 - Choose what pressing an HA Dial does (Priority: P1)

As a user, I open the settings of an HA Dial and choose its press action: keep the default domain behaviour, set a favourite value, call any service, or do nothing.

**Why this priority**: Makes the press useful for setups where toggling is unwanted (e.g. a thermostat that must never be switched off) and enables quick presets ("press = full brightness").

**Independent Test**: Bind an HA Dial to a light's brightness, choose "Set favourite value" with 100 %, press the dial → the light goes to 100 % and the display shows 100 %.

**Acceptance Scenarios**:

1. **Given** an HA Dial without a press setting (existing configuration), **When** I press it, **Then** the domain default from feature 001 applies (light/switch/fan: toggle; media player: play/pause; thermostat: on/off; cover: open/close).
2. **Given** an HA Dial bound to brightness with "Set favourite value" = 100, **When** I press it, **Then** the light is set to 100 % brightness (and turned on if it was off) and the display shows 100 % immediately.
3. **Given** an HA Dial bound to colour temperature with favourite value 2700 K, **When** I press it, **Then** the colour temperature is set to 2700 K, clamped to the lamp's supported range.
4. **Given** an HA Dial bound to an `input_number` with favourite value 4, **When** I press it, **Then** the value is set to 4 (clamped to the entity's min/max and rounded to its step).
5. **Given** an HA Dial with "Call a service" configured (domain, service, optional targets and JSON data), **When** I press it, **Then** exactly that service is called; invalid configuration shows an error indication instead.
6. **Given** an HA Dial with "No action", **When** I press it, **Then** nothing is sent.
7. **Given** any press action, **When** I hold the dial pressed while rotating and then release it, **Then** no press action is triggered (unchanged from feature 001).

---

### User Story 3 - Switch the controlled value by pressing (Priority: P2)

As a user with a lamp that supports both brightness and colour temperature, I press the dial to switch between controlling brightness and colour temperature. The dial display (and, during edit mode, the key) shows which value I am currently controlling.

**Why this priority**: Turns one dial into a complete light controller without needing a second dial. Useful for both HA Dial and Dynamic Dial, but not required for the basic value of the feature.

**Independent Test**: Bind an HA Dial to `light.desk` (brightness + colour temperature) with "Switch controlled value"; press → display shows colour temperature, rotating changes colour temperature; press again → back to brightness.

**Acceptance Scenarios**:

1. **Given** an HA Dial set to "Switch controlled value" and bound to a lamp supporting brightness and colour temperature, **When** I press it, **Then** the dial controls the next supported value (brightness → colour temperature → brightness …) and the display shows the name of the active value together with its current value.
2. **Given** a Dynamic Dial set to "Switch controlled value" during edit mode of such a lamp, **When** I press it, **Then** all Dynamic Dials and the edited key switch to the next value together and show which value is active.
3. **Given** an entity that supports only one controllable value, **When** I press a dial set to "Switch controlled value", **Then** nothing changes and a brief hint shows that no other value is available.
4. **Given** a Dynamic Dial switched to colour temperature, **When** edit mode ends and later starts again (for any entity), **Then** it starts with the entity's default edit value (e.g. brightness for lights).
5. **Given** an HA Dial switched away from its configured value, **When** Ulanzi Studio restarts or the dial settings are changed, **Then** it controls its configured value again.

---

### User Story 4 - Domain-specific press actions (Priority: P3)

As a user, I can choose press actions that fit the bound entity: mute for media players, next track, cycling a thermostat's operating mode or preset, stopping a moving cover, or toggling a fan's oscillation or cycling its preset.

**Why this priority**: Nice-to-have refinements that cover common household devices; each is small and independent.

**Independent Test**: Bind an HA Dial to a media player's volume with "Mute on/off", press → the player is muted; press again → unmuted.

**Acceptance Scenarios**:

1. **Given** an HA Dial bound to a media player with "Mute on/off", **When** I press it, **Then** the player's mute state is inverted.
2. **Given** an HA Dial bound to a media player with "Next track", **When** I press it, **Then** the player skips to the next track.
3. **Given** an HA Dial bound to a thermostat with "Cycle operating mode", **When** I press it, **Then** the thermostat switches to the next mode in its own list of supported modes (wrapping around at the end).
4. **Given** an HA Dial bound to a thermostat with "Cycle preset", **When** I press it, **Then** the thermostat switches to the next preset in its own list of presets.
5. **Given** an HA Dial bound to a cover with "Stop or open/close", **When** I press it while the cover is moving, **Then** the cover stops; **When** it is not moving, **Then** it opens or closes (toggle).
6. **Given** an HA Dial bound to a fan with "Oscillation on/off", **When** I press it, **Then** oscillation is inverted; with "Cycle preset" the fan switches to its next preset.
7. **Given** a domain-specific action, **When** the entity does not support it (e.g. a media player without mute), **Then** that action is not offered in the settings, and an already saved but unsupported action shows an error indication on press instead of sending a call.

---

### Edge Cases

- What happens when the selected press action does not fit the entity after the binding was changed (e.g. "Mute" saved, entity changed to a light)? → The settings page resets the selection to the default; if the saved action is still unsupported, a press shows an error indication and sends nothing.
- What happens when a press occurs while Home Assistant is disconnected? → No call is sent and an error indication is shown (as for rotation, feature 001); "Switch controlled value" and "No action" of an HA Dial still work locally. Edit mode itself ends on connection loss (feature 001, FR-034), so a Dynamic Dial press cannot occur in edit mode while disconnected.
- What happens when a favourite value lies outside the entity's range? → It is clamped to the range (and rounded to the entity's step); the settings page shows the valid range.
- What happens when a favourite value is empty or not a number? → The settings page marks the field; a press shows an error indication and sends nothing.
- What happens when the favourite value is set on a light that is off? → The light is switched on with that value.
- What happens to the shared rate limit of feature 001 (≤ 5 calls per second per entity)? → Press actions that set a value count towards the same limit; the final value always arrives.
- What happens when "Switch controlled value" is used on a fixed HA Dial while another dial controls the same entity? → Each dial switches only its own controlled value; displays stay consistent through the shared entity state.
- What happens when a thermostat or fan reports no modes/presets? → The cycling actions are not offered; a saved one shows an error indication on press.
- What happens when a press of the Dynamic Dial set to "End editing" arrives together with a rotation (hold-left/right)? → No action (rotation while pressed never triggers the press action).

## Requirements *(mandatory)*

### Functional Requirements

**HA Dial**

- **FR-001**: Users MUST be able to choose a press action per HA Dial in its settings page.
- **FR-002**: The default press action MUST be the domain-dependent behaviour of feature 001 (FR-026, including cover open/close), and dials configured before this feature MUST keep that behaviour.
- **FR-003**: System MUST offer the following press actions for an HA Dial, each only when it is supported by the bound entity: default (domain behaviour), switch controlled value, set favourite value, mute on/off (media players), next track (media players), cycle operating mode (thermostats), cycle preset (thermostats, fans), stop or open/close (covers), oscillation on/off (fans), call a service, no action.
- **FR-004**: "Set favourite value" MUST set the configured value for the controlled value of the dial, clamped to the entity's range and rounded to its step, and MUST switch a light on if it is off.
- **FR-005**: The display MUST show the result of a value-setting press immediately (same immediate feedback as rotation in feature 001) and the press MUST share the per-entity rate limit of feature 001.
- **FR-006**: "Call a service" MUST accept domain, service, optional target entities and optional JSON data, validated like the long-press service option of the HA Toggle key (feature 001, FR-037); invalid data MUST be marked in the settings page.
- **FR-007**: The cycling actions MUST step through the entity's own list of supported modes or presets in order and wrap around after the last one.
- **FR-008**: "Stop or open/close" MUST stop a moving cover and otherwise toggle it.

**HA Dynamic Dial**

- **FR-010**: Users MUST be able to choose a press action per Dynamic Dial: end editing, toggle edited entity, switch controlled value, no action.
- **FR-011**: The default MUST be "End editing", also for Dynamic Dials configured before this feature.
- **FR-012**: "End editing" MUST end edit mode exactly like a short press on the edited key (feature 001, FR-034) and MUST NOT send any service call.
- **FR-013**: Press actions of a Dynamic Dial MUST have no effect while no edit mode is active.

**Switch controlled value (both dial types)**

- **FR-020**: "Switch controlled value" MUST cycle through the controllable values the entity supports, in a fixed order (for lights: brightness → colour temperature).
- **FR-021**: When the entity has more than one controllable value, the dial display MUST show which value is currently controlled (its name) together with its current value, and during edit mode the edited key MUST show the name of the active value as well. For entities with a single controllable value the displays stay as in feature 001.
- **FR-022**: For a Dynamic Dial, switching MUST apply to the whole edit session, so all Dynamic Dials and the edited key show and control the same value.
- **FR-023**: A new edit session MUST start with the entity's default edit value (feature 001, FR-032/FR-038).
- **FR-024**: A switched HA Dial MUST return to its configured value after a restart of Ulanzi Studio or a change of its settings.
- **FR-025**: When the entity supports only one controllable value, a press MUST change nothing and show a brief hint.

**General**

- **FR-030**: A press MUST trigger its action only on release and only if the dial was not rotated while pressed (unchanged from feature 001).
- **FR-031**: The settings pages MUST offer only press actions that the selected entity supports and MUST show the fields needed for the chosen action only (favourite value, service fields).
- **FR-032**: A saved press action that the entity does not support (any more) MUST show an error indication on press and send nothing. Exception: "Switch controlled value" on an entity with only one controllable value is not an error; it shows the hint of FR-025.
- **FR-033**: Failed service calls of press actions MUST show an error indication on the dial and be logged (feature 001, FR-040).
- **FR-034**: All new texts MUST be available in German and English.
- **FR-035**: A long press on a dial is out of scope; pressing and holding a dial without rotating MUST behave like a normal press on release.

### Key Entities

- **Dial Press Action**: The configured action of one dial – type (one of the options in FR-003 / FR-010) plus its parameters (favourite value; service domain, service, targets, data). Stored with the dial's settings.
- **Controlled Value (active)**: The value a dial currently controls. For an HA Dial: the configured value, temporarily replaced by "Switch controlled value" until restart or settings change. For Dynamic Dials: part of the edit session, shared by all Dynamic Dials and the edited key.
- **Supported Press Actions**: Derived from the bound entity's capabilities (controllable values, mute support, modes, presets, oscillation, cover movement); determines what the settings page offers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With default settings, pressing the Dynamic Dial after editing never changes the state of the edited entity (0 unintended toggles in 20 press-after-rotate attempts on the device).
- **SC-002**: The dial display reflects every press action that changes a value or the controlled value within 100 ms of release.
- **SC-003**: A user can configure a favourite-value press for an HA Dial in under 1 minute without documentation.
- **SC-004**: Existing feature-001 setups behave unchanged after the update for HA Dials, and Dynamic Dials only change from "toggle" to "end editing" on press (verified with a configuration saved by version 0.1.x).
- **SC-005**: For every press action offered in the settings page, a press on the device produces the described result in 100 % of the scenarios in this specification.

## Assumptions

- The dial press is delivered by Ulanzi Studio as press/release events, as already used by feature 001 (confirmed on the device by the project owner).
- "Switch controlled value" covers the values already supported by feature 001 (brightness, colour temperature, volume, temperature, position, fan speed, number value); for most domains only one value exists, so the action mainly matters for lights with colour temperature.
- The active controlled value of an HA Dial is runtime state and is not saved; the configured value stays the saved setting.
- Changing the Dynamic Dial default from "toggle" to "end editing" is intended and accepted as a behaviour change for existing users; it is mentioned in the release notes.
- Mute, next track, mode/preset cycling, cover stop and fan oscillation use the standard Home Assistant capabilities of the respective entities; entities that do not report a capability do not get the action offered.
- The favourite value is entered in the units shown on the display (%, K, °, or the entity's unit).
- A long press on dials, double press and multi-step gestures are out of scope and may become a later feature.
