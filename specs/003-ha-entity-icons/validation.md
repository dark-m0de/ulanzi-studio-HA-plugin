# Validation: Home Assistant Entity Icons on Keys

**Feature**: [spec.md](spec.md) | **Quickstart**: [quickstart.md](quickstart.md) | **Date**: 2026-11-21

## Automated checks

`npm test`: **380 tests, 380 passed, 0 failed** (Node 24). The 0.2.0 baseline was 297 tests.

New or extended test files: `tests/unit/domain/icons/*` (mdi-set, fallback-icons, resolve,
icon-color, icon-data), `tests/unit/domain/render/key-svg.test.js` (icon layout plus a byte-identical
regression of the 0.2.0 text layout), `tests/unit/domain/render/key-model.test.js`,
`tests/unit/ha/messages.test.js`, `tests/integration/ha/client.test.js`,
`tests/integration/adapter/key-icons.test.js`, `tests/integration/adapter/pi-bridge-icons.test.js`,
toggle/sensor/scene/service/pi-bridge-connection integration tests, `tests/integration/bundle.test.js`,
`tests/unit/architecture.test.js`.

Feature-001 tests that asserted the text layout of Toggle, Sensor and HA Trigger keys (e.g. `>On<`)
were adapted to the new default (icon layout) or explicitly set `showIcon: false`. This is the
intended behaviour change (FR-015, release notes "Changed behaviour").

## Package size (SC-006, ≤ 5 MB)

| | 0.2.0 (`main`) | 0.3.0 | Growth |
|---|---|---|---|
| `com.ulanzi.hadeck.ulanziPlugin.zip` | 114,624 B | 955,802 B | **+0.84 MB** ✅ |
| Unpacked plugin folder | 524 KB | 3,524 KB | **+3.0 MB** ✅ |
| `dist/app.js` | 254,079 B | 3,319,039 B | +3.07 MB |

esbuild prints a size warning for `dist/app.js` (3.2 MB). The bundle test confirms that the
installed bundle still starts and connects in under 5 s.

## Rendering preview (desk check, not on the device)

The key SVGs for the main cases were rendered with macOS Quick Look:
- light on in its RGB colour, light off, dimmable light with %, dark blue light lifted for contrast
- shutter and garage closed, switch off, override with a custom colour
- sensor normal and warning, script with a custom HA icon, scene
- service key with an icon, show icon off, edit mode, offline

Icons, value and label do not overlap. Labels are truncated as before (SC-007, desk check).

## Device validation (quickstart V-01–V-13)

**Open, not done yet (T059).** It needs a D200X with Ulanzi Studio on Windows and macOS and a Home
Assistant ≥ 2024.2 (plus 2024.1 for V-12). The most important open point is V-01: does Ulanzi
Studio render `<path … transform>` in `setBaseDataIcon` SVGs correctly?

| Scenario | Windows | macOS | Notes |
|---|---|---|---|
| V-01 Rendering | ☐ | ☐ | |
| V-02 State and colour | ☐ | ☐ | |
| V-03 Toggle domains (SC-001 table) | ☐ | ☐ | repeat after US3 for integration icons |
| V-04 Custom HA icon | ☐ | ☐ | |
| V-05 Override and colours (SC-004) | ☐ | ☐ | includes PI layout check (colour picker, preview) |
| V-06 Show icon off | ☐ | ☐ | |
| V-07 Sensor and trigger | ☐ | ☐ | |
| V-08 Service key | ☐ | ☐ | |
| V-09 Errors and edit mode | ☐ | ☐ | |
| V-10 Upgrade from 0.2.0 (SC-003) | ☐ | ☐ | |
| V-11 Offline / privacy (SC-005) | ☐ | ☐ | |
| V-12 Old HA (hint in PI) | ☐ | ☐ | |
| V-13 Size | ✅ | ✅ | see above |

## Constitution review (T060)

- Tests green; new domain modules import only domain modules and `@mdi/js` (architecture test).
- New log lines:
  - `HA icons unavailable (<key>: <code>); using built-in icons` (warn, once per connection)
  - `HA platform icons unavailable (…)` and `HA entity registry for icons unavailable (…)` (debug)
  - `icon not found: <name>` (debug, once per key and name)
  - None contains tokens or entity IDs.
- All new PI strings are localised in `en.json` and `de_DE.json` (`pi.icon.*`,
  `pi.connection.iconsUnavailable`); the locale test passes.
- `NOTICE` lists Material Design Icons (`@mdi/js`); `dist/THIRD_PARTY_LICENSES.txt` contains
  `@mdi/js@7.4.47` (bundle test).
- The PI icon preview uses `createElementNS`/`setAttribute` only. The icon-section markup is
  static, and no user or HA data goes through `innerHTML`.
