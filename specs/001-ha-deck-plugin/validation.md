# Validation: Home Assistant Plugin for Ulanzi Deck with Dial Support

**Feature**: [spec.md](spec.md) | **Guide**: [quickstart.md](quickstart.md) | **Tasks**: T095–T099

## Automated checks (2026-11-20)

| Check | Result |
|---|---|
| `npm test` | 224 tests, 224 passed |
| Line coverage `src/ha`, `src/domain` (T096, target ≥ 90 %) | lowest file 96.6 % (`src/ha/client.js`); all files 98.95 % |
| Layer rules, no external URLs (`tests/unit/architecture.test.js`) | passed |
| Locale parity en/de, all used keys exist (`tests/unit/locales.test.js`) | passed |
| `npm run build` / bundle smoke test against a fake Studio socket | starts, connects, requests global settings, token not visible in console output |
| `npm run package` (T099, first part) | `com.ulanzi.hadeck.ulanziPlugin.zip` contains `LICENSE`, `NOTICE`, `dist/THIRD_PARTY_LICENSES.txt`, `manifest.json`, all six PI pages |

## License audit (T095, 2026-11-20)

Shipped or vendored components, checked against the constitution allowlist
(Licensing & Code Provenance):

| Component | Version / commit | License | How shipped | Allowed | In NOTICE |
|---|---|---|---|---|---|
| ulanzideck-api (plugin-common-node) | 0.1.0 @ `9e478b2` | Apache-2.0 | bundled into `dist/app.js` | ✅ | ✅ |
| ws | 8.23.0 (no dependencies) | MIT | bundled into `dist/app.js` | ✅ | ✅ |
| plugin-common-html | `0aeb6a2` | Apache-2.0 | vendored in `libs/common-html/` | ✅ | ✅ |

`bufferutil` / `utf-8-validate` are optional native add-ons of `ws`; they are marked external and
not shipped. No code from ha-hub-ulanzi or any other copyleft project is included. Dev-only tools
(esbuild) are not shipped.

## Device validation

Early device checks V-01 to V-07: all passed on a D200X (2026-11-20), see
[research.md](research.md#open-validations-device--studio-behaviour-not-covered-by-documentation).
US1–US4 were additionally tested on the device by the project owner after implementation.

### Full scenarios (T097) – to be filled in

Run scenarios 1–8 from [quickstart.md](quickstart.md) on macOS **and** Windows.

| Field | macOS | Windows |
|---|---|---|
| Date | | |
| Ulanzi Studio version | | |
| Home Assistant version | | |
| Device / firmware | | |

| Scenario | macOS | Windows | Notes |
|---|---|---|---|
| 1 Connection (US1), setup time SC-001 (< 3 min) | | | |
| 2 Toggle key (US2), SC-002 (≥ 19/20 updates ≤ 1 s) | | | |
| 3 HA Dial (US3), SC-003 timing (< 100 ms / ≤ 500 ms) | | | |
| 4 Long-press edit (US4) | | | |
| 5 Other domains (US5) | | | |
| 6 Trigger / sensor / service keys (US6) | | | |
| 7 Localisation (de / en) | | | |
| 8 Persistence after restart (FR-042) | | | |

### Stability (T098) – to be filled in

| Field | Value |
|---|---|
| Bound actions | 30 |
| RSS after 1 h | |
| RSS after 24 h | |
| Crashes in log | |
| Pass (24 h ≤ 1.2 × 1 h, no crash) | |

### Clean install (T099, second part) – to be filled in

| Field | Value |
|---|---|
| Studio version | |
| Zip installed on a Studio without previous HA Deck install | |
| `LICENSE` and `NOTICE` present in the installed plugin folder | |
