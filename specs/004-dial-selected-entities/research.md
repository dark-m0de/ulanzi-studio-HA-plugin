# Research: Dynamic Dial for Selected Values

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

The Technical Context has no open NEEDS CLARIFICATION items: the stack, harness and platforms
are unchanged. The decisions below settle the design questions that the spec leaves to the plan.

## R-01 Storage format of the selected values

- **Decision**:
  - New `longPress` value `edit_values`.
  - New field `editValues`, a JSON string of an array of `{ entityId, attributeId }`, written
    by a hidden form input.
  - The plugin-side pure `parseSelectedValues(value)`:
    - accepts the JSON string or an already parsed array;
    - keeps only objects whose `entityId` is a non-empty string (trimmed) and whose
      `attributeId` is a known controllable value (`getAttribute(id) !== null`);
    - removes duplicate pairs, keeping the first occurrence and the order;
    - returns `[]` for invalid JSON or any other type.
- **Rationale**:
  - `HADeck.bindForm` serialises with `FormData`, so every value is a string, and
    `Utils.setFormValue` restores strings. A JSON string survives that round trip unchanged.
  - Pairs need two fields per entry. Both entity IDs and attribute IDs contain dots, so a
    delimiter-based text format would need escaping rules.
- **Alternatives considered**:
  - `"light.desk|light.brightness,…"`: compact, but a home-made format with edge cases.
  - Native array settings: `setFormValue` cannot restore a variable number of fields.
  - Storing friendly names in the setting: they go stale when renamed in HA, so they are fetched
    instead (R-06).

## R-02 Session model: targets + index

- **Decision**: Extend the session to
  `{ entityId, attributeId, sourceContext, targets, targetIndex }`.
  - `targets` holds the parsed selected values (`[]` for the classic single-entity mode), and
    `targetIndex` points at the current one.
  - `entityId`/`attributeId` are always set from the current target, both at start and on every
    jump.
  - All existing consumers keep reading `entityId`/`attributeId`:
    - Dynamic Dial binding (`bindEntity`/`bindControl` on `onChange`)
    - key edit rendering
    - `switchAttribute`
  - With exactly one target, `switchAttribute` (feature 002) keeps working and changes only
    `attributeId` (FR-011); `targets` stays as configured.
- **Rationale**: This is additive. The classic mode is a session with `targets: []` and behaves
  exactly as before. No second session type is needed (Principle VI).
- **Alternatives considered**:
  - Holding the target list in the Dynamic Dial: there can be several dials, and the key also
    needs the current target, so the broker is the single source of truth (data-model §6 of
    feature 001).
  - Turning targets into a "virtual attribute list" of one entity: breaks for values that belong
    to different entities.

## R-03 Broker API and usability check

- **Decision**:
  - `new EditSessionBroker({ clock, getEntity })`. `getEntity` defaults to `() => null` for
    existing tests; `app.js` passes `(id) => store.get(id)`.
  - Pure `targetUsable(target, entity)` in `selected-values.js`: the entity exists, is not in an
    unavailable state (`isUnavailableState`), and the attribute is in the registry, includes the
    entity's domain and `isSupported(entity)`.
  - `startTargets({ sourceContext, targets })`:
    - empty list or no usable entry → `'ineligible'`;
    - no dial → `'no_dial'`, checked after usability, consistent with `start()`;
    - otherwise the session is set to the first usable index → `'started'` / `'switched'`.
  - `nextTarget()`: searches forward from `targetIndex + 1` with wrap-around for the next
    usable entry that is not the current one.
    - If found: update the session, re-arm the timer (FR-013), emit reason `'switched_target'`,
      return `true`.
    - Otherwise return `false`, with no emit.
  - `targetUnusable(entityId, attributeId?)`: only acts when the current target matches. It
    moves to the next usable entry (reason `'switched_target'`), or ends with `'unavailable'`.
  - `entityUnavailable(id)` delegates to `targetUnusable` when the session has targets, and
    keeps the old end-behaviour otherwise.
- **Rationale**: The broker stays pure and testable with fixtures. The injected lookup avoids
  importing the store instance into the domain (Principle II).
- **Alternatives considered**: The adapter computes the next usable target and calls a
  `setTarget(index)`. This would spread the skip and wrap logic over two actions.

## R-04 Dynamic Dial behaviour

- **Decisions**:
  - **Press**: `handlePress()` first checks `session.targets.length >= 2`. If so, it calls
    `nextTarget()`. A `false` result (no other usable entry) shows the existing
    `hint.noOtherValue` toast. Otherwise it uses the existing path (configured press action;
    FR-011). The hold-rotate rule is unchanged, because `onDialUp` already filters it.
  - **Caption**: the dial's `valueCaption` returns the value's short name whenever
    `session.targets.length >= 2`, otherwise it keeps the feature 002 rule (entity has ≥ 2
    values).
  - **Title**: `dialRender` already uses the entity's friendly name when the label is empty (the
    Dynamic Dial's label is `''`), so the entity name is shown (FR-012).
  - **Lost target**: `onEntityChanged()` calls `editSession.targetUnusable(entityId,
    attributeId)` when the session has targets and `!targetUsable(current, entity)`. Several
    Dynamic Dials may report the same event. The broker only acts on the current target, so the
    call is idempotent.
- **Rationale**: Reuses the existing rebinding on `onChange`. A jump sends no HA call, so there
  is no throttle interaction.

## R-05 Toggle key behaviour

- **Decisions**:
  - **Long press**: `longPress()` gets a `case 'edit_values'` that calls `#startTargets()`:
    - not connected → alert (unchanged);
    - `startTargets({ sourceContext, targets: parseSelectedValues(settings.editValues) })`;
    - `ineligible` → `showAlert`, no service call (FR-008);
    - `no_dial` → existing toast.
  - **Rendering in edit mode**: the key uses the *session's* entity (`session.entityId`), not
    its own, in every mode. In the classic mode they are identical.
    - `#editValue()` reads the optimistic value from `controls.get(session.entityId)`.
    - The caption is shown when the session has ≥ 2 targets, or when the entity has ≥ 2 values.
    - In `edit_values` mode the label is the edited entity's friendly name. The key label is
      ignored here, so entries are distinguishable (spec US1, scenario 3). The classic mode
      keeps `binding.label`.
  - **Following the session**: `#followSession()` subscribes to the control of
    `session.entityId` (it already does so for its own entity). An extra store subscription is
    not needed, because the Dynamic Dial reports lost targets (R-04).
  - **Settings change** while the key is the source: the session ends (`'settings'`) if the
    trimmed `entityId`, the `longPress` mode or the normalised `editValues`
    (`JSON.stringify(parseSelectedValues(...))`) changed. Identical re-sends from Studio do not
    end the session (FR-016).
- **Rationale**: These are minimal changes. The classic mode's code path keeps its behaviour,
  and existing tests stay green.

## R-06 PI: value list without a new shared abstraction

- **Decisions**:
  - **Picker option**: `mountEntityPicker(input, { domains, onChoose, clearOnChoose })`. When
    `onChoose` is set, it receives the chosen entity ID instead of the input being written.
    Existing callers are unchanged.
  - **Section in `toggle.html`** (`data-mode="edit_values"`), built inline with DOM APIs:
    1. the chip list (`<name> · <value>` + ✕);
    2. the entity search (unnamed input; picker domains `light`, `media_player`, `climate`,
       `cover`, `fan`, `input_number`, `number`, i.e. every domain of the attribute registry);
    3. after choosing an entity: a value row from `entity.capabilities` (`attributes[]`,
       localised via `pi.attribute.<id>`), one "+" button per value that is not yet listed;
    4. the hidden input `editValues` holding the JSON.
  - **Only controllable entities**: `entities.list` gets an optional `controllable: true`
    parameter that keeps only entities with `supportedAttributes(e).length > 0`. The picker
    forwards it via a new `controllable` option. On/off-only lights, switches and sensors are
    therefore never suggested (FR-004, US3 scenario 7). If an entity loses its values between
    search and choice, the existing `pi.attribute.none` hint is shown.
  - **Names**: `entity.capabilities` additionally returns `friendlyName` (`null` if unknown).
    Chips load names once per distinct entity after `hadeck:load`. Unknown entities show their
    ID and stay removable (FR-005).
  - **Saving**: every change rewrites the hidden input and dispatches `change`, which saves
    through the existing `bindForm` debounce.
- **Rationale**:
  - Constitution VI: the list UI has one call site, so it stays in `toggle.html`. The picker
    option is a small extension of an existing helper, not a new abstraction.
  - Reusing `entity.capabilities` gives the correct per-entity value list, with the same rules as
    the HA Dial PI.
- **Alternatives considered**:
  - A new shared `mountValueList` helper: rejected because it has a single call site.
  - A new PI request `entities.values`: duplicates `entity.capabilities`.
  - Filtering only by domain: on/off-only lights would be suggested and then offer no value,
    which contradicts FR-004.
  - Offering only edit-mode domains: would hide `input_number`/`number`, which the HA Dial
    already controls (spec FR-004).

## R-07 Diagnostics

- **Decision**: The `editSession.onChange` info line in `app.js`:
  - logs `edit mode switched target (2/4)` for `switched_target`;
  - appends ` (1/4)` to `edit mode started` when the session has targets.
  - It never logs entity IDs.
- **Rationale**: Helps with device reports while respecting Principle V.
