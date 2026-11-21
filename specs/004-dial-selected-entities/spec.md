# Feature Specification: Dynamic Dial for Selected Values

**Feature Branch**: `004-dial-selected-entities`

**Created**: 2026-11-21

**Status**: Draft

**Input**: User description (translated from German): "Goal: a key (HA Toggle / HA Schalter) is assigned to a switch (entity) and toggles it when pressed. For the long press there is, in addition to the standard mode 'Dynamic Dial' (edits the key's entity), a new option 'Dynamic Dial for selected entities'. With it, one or more entities can be specified, which are then controlled with the Dynamic Dial. If several entities are specified, a press on the Dynamic Dial switches between the entities."

**Builds on**: [Feature 001 – Home Assistant Plugin for Ulanzi Deck](../001-ha-deck-plugin/spec.md) (Story 2 toggle key, Story 3 HA Dial, Story 4 edit mode, FR-030–FR-039) and [Feature 002 – Configurable Dial Press Actions](../002-dial-press-actions/spec.md) (Dynamic Dial press actions, controlled-value names). The short press of the key, the standard long-press mode and all other long-press modes stay unchanged. This feature adds one new long-press mode.

## Clarifications

### Session 2026-11-21

- Q: Does the user select entities or individual values for the new long-press mode? → A: Values. Each entry is an entity plus one of its controllable values (e.g. "Shutter living room · Position"). The Dynamic Dial jumps between the selected values. Example: a light switch (on/off only) on the key, with two shutters assigned, each with tilt angle and position. A press on the Dynamic Dial jumps between these four values.
- Q: Where should a new "cover tilt angle" value be usable? → A: Nowhere. The tilt angle was only an example. The available entities and controllable values stay as they are; the new mode offers exactly the values the plugin already supports.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Long press edits a selected value instead of the key's own entity (Priority: P1)

As a user, I have an HA Toggle key assigned to a light switch that can only switch on and off (e.g. `switch.living_room_light`). A short press toggles the switch, as before. For the long press I choose the new mode "Dynamic Dial for selected values" and select the value "Position" of the shutter `cover.living_room`. When I hold the key, the Dynamic Dial moves the shutter. The switch itself is not touched.

**Why this priority**: This decouples "what the key switches" from "what the dial adjusts". It makes the Dynamic Dial usable on keys whose own entity has no adjustable value (switches, on/off lights, input booleans). It is a complete, useful feature with a single selected value.

**Independent Test**: Configure a Toggle key on `switch.coffee` with the mode "Dynamic Dial for selected values" and the value "Brightness" of `light.desk`. Hold the key and turn the Dynamic Dial: the desk lamp's brightness changes and the coffee switch is not touched. Short-press the key: edit mode ends. Short-press again: the coffee switch toggles.

**Acceptance Scenarios**:

1. **Given** a Toggle key on `switch.coffee` with long-press mode "Dynamic Dial for selected values" and the selected value "Brightness" of `light.desk`, **When** I hold the key, **Then** edit mode starts for the brightness of `light.desk` and the Dynamic Dial shows it.
2. **Given** that edit mode, **When** I turn the Dynamic Dial, **Then** only the brightness of `light.desk` changes; `switch.coffee` is not changed.
3. **Given** that edit mode, **When** I look at the key, **Then** it shows the edit style with the live value, the name of `light.desk` and the name of the edited value.
4. **Given** that edit mode, **When** I short-press the key, **Then** edit mode ends (unchanged behaviour). A further short press toggles `switch.coffee`.
5. **Given** a key with the standard long-press mode "Edit with Dynamic Dial", **When** I hold it, **Then** the behaviour is exactly as before this feature: the key's own entity is edited, or toggled if it has no adjustable value.
6. **Given** a key configured before this feature, **When** I use it, **Then** its short and long press behave exactly as before.

---

### User Story 2 - Jump between several selected values by pressing the Dynamic Dial (Priority: P1)

As a user, I select several values for the long press, e.g. the brightness and the colour temperature of `light.living_room_ceiling`, the position of `cover.living_room` and the volume of `media_player.living_room`, four values in total. When I hold the key, edit mode starts with the first value. Each press on the Dynamic Dial jumps to the next value, and turning the dial then adjusts that value. The dial and the key always show which entity and which value I am controlling.

**Why this priority**: The user explicitly requested this. It turns one key and one dial into a compact controller for several devices and values in a room. It builds on Story 1.

**Independent Test**: Configure a key with the selected values "Brightness" of `light.living_room` and "Brightness" and "Colour temperature" of `light.desk`. Hold the key and turn: the living-room brightness changes. Press the Dynamic Dial: dial and key show the desk brightness. Press again: desk colour temperature. Press again: back to the living-room brightness.

**Acceptance Scenarios**:

1. **Given** a key with the selected values (in this order) ceiling light · brightness, ceiling light · colour temperature, shutter · position and media player · volume, **When** I hold the key, **Then** edit mode starts for the ceiling light's brightness.
2. **Given** that edit mode, **When** I press the Dynamic Dial (without turning), **Then** the ceiling light's colour temperature becomes the edited value. All Dynamic Dials and the key show the entity name, the value name and the current value, and turning changes only that value.
3. **Given** the last entry (media player · volume) is edited, **When** I press the Dynamic Dial, **Then** editing wraps around to the first entry.
4. **Given** the edited value changes from a shutter's position to a lamp's brightness, **When** I turn the dial, **Then** the steps and limits of the new value apply (as with the HA Dial for that value).
5. **Given** I jumped to the third value, **When** edit mode ends and I hold the key again, **Then** editing starts again with the first value.
6. **Given** a press on the Dynamic Dial while turning it (hold-rotate), **When** I release it, **Then** no jump happens (unchanged rule from feature 002).
7. **Given** only one selected value, **When** I press the Dynamic Dial, **Then** the Dynamic Dial's configured press action applies, as in feature 002 (default: end editing).
8. **Given** each jump, **When** it happens, **Then** it counts as input and restarts the edit-mode timeout.

---

### User Story 3 - Select values comfortably in the settings (Priority: P2)

As a user, I select the values for the new mode in the Toggle key's settings. I search for an entity with the existing entity search, then choose which of its values to add. I can add several values (of the same or of different entities) and remove individual ones. The order of the list is the order in which the Dynamic Dial jumps.

**Why this priority**: Makes the feature usable without knowing entity IDs or value names. Stories 1 and 2 can be tested with settings written directly, but without a comfortable picker the feature is hard to set up.

**Independent Test**:
1. Open the Toggle key settings and choose the long-press mode "Dynamic Dial for selected values".
2. Search for a lamp with brightness and colour temperature, choose it, and add "Brightness" and then "Colour temperature": both appear in the list as "<lamp name> · <value name>".
3. Remove the first entry: only "Colour temperature" remains, and it is still there after reopening the settings.

**Acceptance Scenarios**:

1. **Given** the long-press mode list, **When** I open it, **Then** it offers the new mode "Dynamic Dial for selected values" next to "Edit with Dynamic Dial", "Same as short press", "Toggle another entity" and "Call a service".
2. **Given** the new mode is selected, **When** I view the settings, **Then** a field "Values" is shown, with entity search and a hint that a press on the Dynamic Dial jumps between several values.
3. **Given** another mode is selected, **When** I view the settings, **Then** the field is hidden, and its value is kept for when I switch back.
4. **Given** I chose an entity in the search, **When** its values are offered, **Then** only the values this entity supports and the dial can control are listed, and I can add one or several of them.
5. **Given** the field, **When** I add a value, **Then** it is appended to the end of the list; a value that is already listed is not added twice.
6. **Given** the field, **When** I remove an entry, **Then** it disappears from the list and the change is saved.
7. **Given** the search, **When** suggestions are shown, **Then** only entities that have at least one value the dial can control are offered.

---

### Edge Cases

- **New mode with an empty list**: the long press shows an error indication on the key and does nothing else. It does not toggle the key's own entity.
- **None of the selected values is usable** at the time of the long press: edit mode does not start, the key shows an error indication, and no entity is toggled. A value is not usable when its entity is unknown or unavailable, or when the entity does not (or no longer) support that value, e.g. a lamp that no longer reports colour temperature.
- **The first entry is not usable, but a later one is**: editing starts with the first usable entry.
- **An entry is not usable when jumping**: it is skipped.
- **The currently edited value becomes unusable** (e.g. its entity becomes unavailable): editing moves to the next usable entry. If there is none, edit mode ends.
- **The key's own entity becomes unavailable during edit mode**: edit mode continues, because the selected values are edited, not the key's own entity.
- **The same value of the same entity is selected twice** (e.g. in settings written by hand): it appears once in the jump order.
- **Several values of the same entity are selected**: each is its own entry. Jumping between them works like jumping between values of different entities.
- **A value of the key's own entity is also selected**: it is treated like any other entry.
- **The selection is changed in the settings while edit mode from that key is active**: edit mode ends, as it does today when the key's entity changes.
- **A Toggle key without its own entity but with selected values**: the long press works; the short press shows the usual "not configured" indication.
- **Another key is held during edit mode**: edit mode switches to that key's entity or values (unchanged rule FR-035 of feature 001).
- **Jumping back to a value that was changed elsewhere in the meantime**: the dial shows the current value.

## Requirements *(mandatory)*

### Functional Requirements

**Short press (unchanged)**

- **FR-001**: A short press on an HA Toggle key MUST keep toggling the key's own entity, in every long-press mode, including the new one (feature 001, FR-010).

**Configuration**

- **FR-002**: The HA Toggle key's long-press setting MUST offer a new mode "Dynamic Dial for selected values" in addition to the existing modes. The existing standard mode "Edit with Dynamic Dial" stays the default.
- **FR-003**: In the new mode, users MUST be able to specify an ordered list of one or more **selected values**. Each selected value is a pair of a Home Assistant entity and one of its controllable values. The settings UI MUST let users choose an entity via the existing entity search, then add one or more of that entity's supported values, and remove individual entries. New entries are appended, duplicate pairs are prevented, and the order defines the jump order.
- **FR-004**: The settings UI MUST only offer entities that support at least one controllable value, and for a chosen entity only the values it supports. The selectable values are exactly the values the HA Dial can already control (feature 001/002: brightness, colour temperature, volume, target temperature, cover position, fan speed, number value). This feature adds no new controllable values or entity types.
- **FR-005**: Each entry MUST be shown in the settings as "<entity name> · <value name>". Entries whose entity is currently unknown MUST still be shown (with their entity ID) and be removable.
- **FR-006**: The list MUST be persisted per key like all other key settings. It MUST survive restarts and MUST be kept when the user temporarily selects another long-press mode.

**Edit mode for selected values**

- **FR-007**: In the new mode, a long press MUST start edit mode for the first selected value that is usable (its entity is available and supports the value).
- **FR-008**: If the list is empty or no entry is usable, edit mode MUST NOT start, the key MUST show an error indication, and no entity is toggled.
- **FR-009**: At any time exactly one selected value is edited. Turning the Dynamic Dial MUST change only that value of that entity, with the value's own steps, limits and off-at-minimum behaviour (as with the HA Dial).
- **FR-010**: With two or more selected values, a press on the Dynamic Dial (press and release without turning) MUST jump to the next usable entry in the list, wrapping around after the last one. Unusable entries are skipped. This applies regardless of the Dynamic Dial's configured press action.
- **FR-011**: With exactly one selected value, a press on the Dynamic Dial MUST behave according to the Dynamic Dial's configured press action (feature 002). "Switch controlled value" then switches between the values of that entity, as in feature 002.
- **FR-012**: All Dynamic Dials and the edited key MUST follow a jump together. They MUST show the current value and the value's name. When the selected values belong to two or more entities, they MUST also show the entity's name, so the user can tell which entity and value are being controlled.
- **FR-013**: Every jump MUST count as user input and restart the edit-mode timeout.
- **FR-014**: When edit mode ends and starts again, it MUST start with the first usable entry. The last edited entry is not remembered.
- **FR-015**: When the currently edited value becomes unusable, editing MUST move to the next usable entry. If there is none, edit mode MUST end. Unusability of other entries or unavailability of the key's own entity MUST NOT end edit mode.
- **FR-016**: Changing the key's entity, its long-press mode or its list of selected values while that key is the edit source MUST end edit mode.
- **FR-017**: All other edit-mode rules of feature 001 MUST stay unchanged in the new mode: edit mode ends on a short press of the source key, on timeout, on a page switch and on connection loss; at most one edit session exists; a hint is shown when no Dynamic Dial exists; and the key shows the edit style while edit mode is active.

**Localisation**

- **FR-018**: All new texts (mode name, field label, hint, placeholder) MUST be available in German and English.

### Key Entities

- **Selected value** (formerly referred to as "selected entity"): a pair of an entity ID and a controllable value (e.g. `light.living_room_ceiling` + colour temperature).
- **Selected value list** (per HA Toggle key): an ordered list of selected values, used only in the new long-press mode. The order is the jump order.
- **Edit session** (extended): in addition to the edited entity, the edited value and the source key, it knows the source key's selected values and which of them is currently edited, so a dial press can jump to the next one.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can set up a key with four selected values (e.g. two lamps × brightness and colour temperature) in under 2 minutes using only the settings UI, without typing entity IDs.
- **SC-002**: After a press on the Dynamic Dial, the dial and the key show the next value's entity, name and current value immediately (no perceptible delay).
- **SC-003**: With up to 6 selected values, each value can be reached with at most 5 presses on the Dynamic Dial.
- **SC-004**: Turning the dial never changes a value other than the one shown on the dial display (0 wrong-value changes in validation).
- **SC-005**: 100 % of existing key configurations behave identically after the update.

## Assumptions

- The new option is only added to the **HA Toggle** key (German: "HA Schalter"), the only key type that starts edit mode. The HA Dynamic Dial's own settings do not change.
- With two or more selected values, the dial press is reserved for jumping between them. Ending edit mode in this case works by short-pressing the key, by timeout or by a page switch.
- Only one value is controlled at a time. Controlling several entities simultaneously (group control) is out of scope. A Home Assistant group entity can be selected like any other entity and is controlled as one entity.
- There is no fixed upper limit on the number of selected values. Usability targets typical lists of up to about 6 values.
- The key's icon and normal (non-edit) display stay bound to the key's own entity.
- The entity search reuses the existing search of the settings UI; no new connection or permission to Home Assistant is required.
- Reordering existing entries by drag & drop is out of scope. Users change the order by removing an entry and adding it again.
