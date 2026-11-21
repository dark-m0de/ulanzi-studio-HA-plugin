# Research: Configurable Dial Press Actions

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-21

There were no `NEEDS CLARIFICATION` items in the technical context. The decisions below settle
design questions, building on feature 001 ([research](../001-ha-deck-plugin/research.md)).

## R-01 Where press decisions live

- **Decision**: A pure domain module `src/domain/dial-press.js` with a registry of press actions.
  - Each entry has `id`, `dialKinds` (`fixed` / `dynamic`), `isSupported(entity, ctx)` and
    `resolve(entity, settings, ctx)`.
  - `resolve` returns an outcome: `{ type: 'call', call }`, `{ type: 'set_value', raw }`,
    `{ type: 'end_edit' }`, `{ type: 'switch_value' }`, `{ type: 'none' }` or
    `{ type: 'error', key }`.
  - The adapter only executes outcomes.
- **Rationale**: Principle II/III. All capability checks and state-dependent choices (next HVAC
  mode, stop vs. toggle) are unit-testable without SDK or sockets. The same registry produces
  the list offered in the PI (FR-031), so the PI and the device never disagree.
- **Alternatives considered**:
  - A switch statement inside `dial.js` (not testable without the adapter, duplicated in the
    PI handler).
  - Extending `press-actions.js` (that module stays the domain default action used by keys too).

## R-02 Capability detection

- **Decision**: Use HA `supported_features` bits and attribute lists, as in feature 001
  (contract table in [press-action-mapping.md](contracts/press-action-mapping.md)):
  - media_player: `VOLUME_MUTE` (8) for mute, `NEXT_TRACK` (32) for next track.
  - climate: `hvac_modes` with ≥ 2 entries for mode cycling; `PRESET_MODE` (16) plus
    `preset_modes` for presets.
  - fan: `OSCILLATE` (2) for oscillation; `PRESET_MODE` (8) plus `preset_modes` for presets.
  - cover: `STOP` (8) for stopping, plus `OPEN` (1) or `CLOSE` (2) for the toggle part.
  - "switch controlled value": at least two entries in `supportedAttributes(entity)`.
  - "favourite value": the active attribute is supported.
- **Rationale**: These are HA's documented entity feature flags. Feature 001 uses the same
  approach for `VOLUME_SET`, `SET_POSITION` and others.

## R-03 Favourite value goes through EntityControl

- **Decision**: `DialController.setValue(raw)` uses the same path as rotation:
  `attribute.toServiceCall` (clamp, step rounding, light turn-on), then
  `EntityControl.setTarget`.
- **Rationale**: Immediate display (SC-002), the shared per-entity throttle (spec edge case) and
  stale-update protection all come for free.
- **Alternative**: A direct service call. Rejected because there would be no optimistic display
  and the throttle would be bypassed.

## R-04 Active controlled value

- **Decision**:
  - **HA Dial**: runtime field `activeAttributeId`, initialised from settings, reset on
    settings change (FR-024) and lost on restart. Switching rebinds the dial's `DialController`
    to the next attribute (`nextAttribute(entity, current)`, registry order: brightness →
    colour temperature).
  - **Dynamic Dial**: `EditSessionBroker.switchAttribute(entity)` replaces `session.attributeId`
    and emits a change with reason `switched_value`. All Dynamic Dials and the source key
    already rebuild on broker changes (feature 001), so they follow automatically (FR-022).
    `start()` always uses `editAttributeFor()` (FR-023).
- **Rationale**: Minimal state, no persistence. It reuses the existing change propagation.

## R-05 Showing the active value

- **Decision**: When an entity has ≥ 2 controllable values, the dial icon shows a short caption
  above the number (e.g. "Hellig." / "Farbtemp."). During edit mode the key's status line shows
  the same caption. Short names come from new locale keys `attr.short.<attributeId>`.
- **Rationale**: FR-021. The `$UA1` layout has one icon and one title. The title keeps the
  entity name, and the icon has room for one small line. For single-value entities nothing
  changes visually.
- **Alternative**: Put the value name into the title. Rejected because the title is short and
  the entity name would be truncated.

## R-06 Hint "no other value"

- **Decision**: `toast(t('hint.noOtherValue'))` when "switch controlled value" is pressed on a
  single-value entity (FR-025).
- **Rationale**: Consistent with the existing hint `hint.noDynamicDial`. `showAlert` would
  signal an error, which this is not.

## R-07 Settings and defaults

- **Decision**: Flat PI fields, like the long-press option of feature 001:
  - `pressAction`, `favoriteValue`
  - `pressDomain`, `pressServiceName`, `pressTarget`, `pressData`

  A missing `pressAction` means `default` (HA Dial) or `end_edit` (Dynamic Dial). The service
  option reuses `parseServiceCall`.
- **Rationale**: Backwards compatibility (FR-002, FR-011) without migration code.
  `Utils.getFormValue` produces flat values.

## R-08 Disconnected and unsupported presses

- **Decision**:
  - Outcomes `call` and `set_value` require a connection; otherwise `showAlert` and nothing is
    sent.
  - `switch_value` and `none` work offline. (`end_edit` cannot occur offline: edit mode ends on connection loss, feature 001 FR-034.)
  - `resolve` returns `{ type: 'error', key: 'error.unsupportedPress' }` for a saved action the
    entity does not support; the adapter shows `showAlert` and logs at `warn` without entity IDs
    (FR-032, FR-033).

## R-09 Version

- **Decision**: Release as 0.2.0 (new feature, behaviour change of the Dynamic Dial default),
  mentioned in the release notes.

## R-10 Display behaviour around the D200X idle clock (device reports, 2026-11-21)

- **Findings**:
  - With Ulanzi Studio open, selecting or pressing a key makes Studio re-send its settings
    unchanged; the plugin treated that as a re-binding and ended edit mode right after a long press.
  - After editing, the dial display briefly replaced the D200X idle clock. Studio does not report the
    idle clock as "inactive", so feedback sent when edit mode timed out (10 s) woke the dial.
- **Decisions**:
  - Edit mode ends on a settings update of the source key only when its entity changes.
  - Dials send no feedback while inactive and do not re-send unchanged feedback on re-activation.
  - After an edit-mode **timeout**, the Dynamic Dial keeps its display and shows the idle hint with
    the next key/dial input on the deck or on re-activation; all other ways of ending edit mode
    update it at once.
  - Edit-mode transitions are logged at info level with their reason (no entity IDs).
- **Covered by**: `tests/integration/adapter/studio-events.test.js`.
