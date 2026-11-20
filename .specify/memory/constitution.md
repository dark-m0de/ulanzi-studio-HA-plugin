<!--
Sync Impact Report
- Version change: (template, unversioned) → 1.0.0 (initial ratification)
- Modified principles: template placeholders PRINCIPLE_1..5 replaced and extended to six:
  I. SDK Conformance, II. Clear Layer Separation, III. Test-First for Core Logic,
  IV. Responsive & Robust, V. Security & Privacy, VI. Simplicity (YAGNI)
- Added sections: Platform Constraints, Licensing & Code Provenance, Development Workflow
  (the template provides two additional sections; a third was added)
- Removed sections: none
- Templates: not modified (they read the constitution at runtime)
- Deferred TODOs: none (LICENSE and NOTICE files still need to be created in the
  repository; this is not constitution content)
-->

# Ulanzi Deck Home Assistant Plugin Constitution

## Core Principles

### I. SDK Conformance

- The plugin MUST use only the officially documented APIs and protocol of the
  UlanziDeckPlugin-SDK (including `common-html` / `common-node`).
- `manifest.json`, the folder name (`com.ulanzi.<name>.ulanziPlugin`) and UUIDs
  (`com.ulanzi.ulanzistudio.<name>[.<action>]`) MUST follow the SDK conventions.
- Undocumented hacks, monkey-patching the SDK, or directly manipulating internal Ulanzi Studio
  files are forbidden. Where the SDK does not offer a capability, the limitation is documented
  in the spec/plan instead of being worked around.
- The required minimum Ulanzi Studio version and the protocol version in use MUST be stated in
  the manifest or the documentation.

**Rationale**: The plugin must survive SDK and Studio updates and work for users without any
special installation steps.

### II. Clear Layer Separation

- The code MUST be separated into three layers: (1) Home Assistant client (connection, auth,
  states, service calls), (2) domain logic (entity model, value calculation, long-press
  detection, throttling, edit mode, render data), (3) SDK adapter (Ulanzi Studio events,
  icons/feedback, settings).
- Layers 1 and 2 MUST NOT import the SDK or depend on global SDK objects; time, WebSocket and
  output are injected as dependencies.
- Layers 1 and 2 MUST be runnable and testable without an Ulanzi device and without a running
  Ulanzi Studio.

**Rationale**: The real complexity (real-time state, dial logic) lives outside the SDK and must
be testable quickly and reproducibly.

### III. Test-First for Core Logic (NON-NEGOTIABLE)

- For the HA client, value calculation (steps, bounds, units), long-press detection,
  throttling/batching and edit mode, automated tests MUST be written before the implementation
  and MUST fail first (Red-Green-Refactor).
- Time-dependent logic MUST be tested with a controllable clock (fake timers).
- The HA client MUST be tested against a simulated HA WebSocket server (auth ok/invalid,
  connection loss, `state_changed` events, error responses).
- Tests MUST run locally and in CI with a single command; merging with failing tests is not
  permitted.
- The SDK adapter SHOULD additionally be verified manually with the UlanziDeckSimulator; the
  procedure is described in the feature's `quickstart.md`.

**Rationale**: Timing and state-synchronisation bugs are hard to reproduce on the device but
cheap to find in unit tests.

### IV. Responsive & Robust

- User input (key press, dial detent) MUST be reflected locally immediately (optimistic
  display); the actual HA state replaces it once confirmed.
- Repeated value changes MUST be batched/throttled before being sent to HA; the last value set
  MUST always be delivered.
- Connection losses MUST be recovered automatically with backoff (max. 30 s); on permanent
  errors (e.g. invalid token) the plugin MUST stop retrying.
- Errors MUST be visible to the user (key, dial display, toast or configuration UI) and MUST
  also be logged. Silently swallowing errors is forbidden.
- A failure in one action MUST NOT crash other actions or the main service.

**Rationale**: A hardware control that responds late or ambiguously will not be used.

### V. Security & Privacy

- The HA token MUST be stored only locally in the Ulanzi Studio settings and MUST NOT be
  logged, shown in error messages, or written to files outside those settings.
- The plugin MUST NOT send telemetry, analytics or crash reports and MUST NOT communicate with
  any host other than the configured HA instance.
- Logs MUST be free of tokens; entity IDs and states may only be logged at debug level.
- External resources (fonts, images, scripts) MUST be bundled locally with the plugin.

**Rationale**: An HA token grants far-reaching control over the user's home.

### VI. Simplicity (YAGNI)

- Only features contained in an approved spec are implemented.
- Runtime dependencies MUST be minimal; every new dependency MUST be justified in the plan
  (purpose, size, license, maintenance status). Anything reasonably solvable with standard
  Node.js or browser APIs is solved without a library.
- Abstractions are introduced only once at least two concrete call sites need them.

**Rationale**: A small plugin stays maintainable and easy to review.

## Platform Constraints

- Target platforms: Windows 10+ and macOS (versions supported by Ulanzi Studio). Both MUST be
  verified before every release.
- The runtime is the one provided by Ulanzi Studio (Node.js version per SDK or embedded
  WebView); no additional installations are required from users.
- Devices: key actions MUST work on all Ulanzi Deck models; dial actions are restricted to
  devices with encoders via `Controllers`/`Devices` in the manifest.
- Internationalisation: all user-visible text (manifest, configuration UI, displays, error
  messages) MUST be available in German (`de_DE.json`) and English (`en.json`) via the SDK
  localisation mechanism. Hard-coded display strings are forbidden.
- Home Assistant is supported from a minimum version defined in the plan, via the official
  WebSocket and REST APIs.

## Licensing & Code Provenance

- Like the UlanziDeckPlugin-SDK, the project is licensed under the **Apache License 2.0**.
  The repository MUST contain a `LICENSE` file with the license text; a `NOTICE` file lists
  the authors and bundled third-party components.
- Code, assets or text from third-party projects may only be adopted if their license is
  permissive and compatible with Apache-2.0 (e.g. Apache-2.0, MIT, BSD-2/3-Clause, ISC, 0BSD,
  CC0, Unlicense).
- Code, assets or text from projects under stricter licenses MUST NOT be adopted. This
  includes in particular strong and weak copyleft licenses (GPL, AGPL, LGPL, MPL, EPL, EUPL,
  CC-BY-SA), non-commercial or otherwise restrictive licenses (e.g. CC-BY-NC, SSPL, BSL), and
  code without any license. Such projects (in particular ha-hub-ulanzi, AGPL-3.0) may serve
  only as a source of feature ideas.
- The same rule applies to runtime and build dependencies shipped with the plugin. Licenses of
  new dependencies are checked and documented in the plan.
- Adopted third-party code MUST retain its original copyright and license notices; Apache-2.0
  components with their own `NOTICE` MUST be carried over into the project `NOTICE`.
- Contributions are accepted under Apache-2.0 (inbound = outbound, per Section 5 of the
  license).
- Home Assistant logos and trademarks are not reproduced; use own icons or freely licensed icon
  sets (e.g. Material Design Icons, Apache-2.0) with attribution.

## Development Workflow

- Every feature goes through spec-kit: `/speckit-specify` → `/speckit-clarify` →
  `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. No feature is implemented without
  an approved spec.
- The plan MUST contain a "Constitution Check"; deviations are recorded there with a
  justification and the simpler alternative that was rejected.
- Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`,
  `chore:`); releases follow Semantic Versioning, and the plugin version in the manifest is
  maintained accordingly.
- Every change is reviewed against this constitution before merge (tests green, layer
  separation respected, no tokens in logs, text localised, licenses checked).

## Governance

- This constitution supersedes all other project conventions.
- Amendments are made via `/speckit-constitution` with an updated Sync Impact Report and are
  recorded as a dedicated commit (`docs: amend constitution to vX.Y.Z`).
- Versioning: MAJOR for removing or fundamentally redefining a principle, MINOR for new
  principles/sections or materially expanded guidance, PATCH for clarifications and wording.
- `/speckit-plan` and `/speckit-analyze` check plans and tasks against these principles;
  violations of a MUST block implementation until they are fixed or legitimised by amending
  the constitution.

**Version**: 1.0.0 | **Ratified**: 2026-11-20 | **Last Amended**: 2026-11-20
