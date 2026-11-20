# HA Deck – Home Assistant for Ulanzi Deck

Control [Home Assistant](https://www.home-assistant.io/) from the keys **and the rotary dials** of
an Ulanzi Deck. Built on the official
[UlanziDeckPlugin-SDK](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK).

## Features

| Action | Hardware | What it does |
|---|---|---|
| **HA Toggle** | key | Toggles a light, switch, fan, cover, media player, thermostat or `input_boolean` and shows its live state (brightness in % for dimmable lights). A long press starts edit mode for the Dynamic Dial or runs a configurable alternative. |
| **HA Dial** | dial | Bound to one value of one entity: brightness, colour temperature, volume, target temperature, cover position, fan speed or an `input_number`/`number`. Turn = fine steps, turn while pressed = coarse steps, press = toggle (media players: play/pause). |
| **HA Dynamic Dial** | dial | Follows the entity of a long-pressed HA Toggle key: brightness, volume, temperature, position or fan speed – one dial for any number of entities. |
| **HA Trigger** | key | Activates a scene or script, or triggers an automation. |
| **HA Sensor** | key | Shows a sensor value with unit; turns orange outside optional limits. |
| **HA Service Call** | key | Calls any service with target entities and JSON data. |

The display reacts immediately to every dial detent; Home Assistant receives at most five calls
per second per entity, and the final value always arrives. The plugin reconnects automatically
after Home Assistant restarts. The UI is available in English and German.

### Supported devices

Key actions work on every Ulanzi Deck model. Dial actions need a device with dials (D200X).

### Requirements

- Ulanzi Studio 3.3.0 or newer on macOS or Windows
- Home Assistant 2024.1 or newer

## Installation

1. Download `com.ulanzi.hadeck.ulanziPlugin.zip` and unzip it.
2. Quit Ulanzi Studio and copy the folder `com.ulanzi.hadeck.ulanziPlugin` into the plugins directory:
   - macOS: `~/Library/Application Support/Ulanzi/UlanziDeck/Plugins`
   - Windows: `%APPDATA%\Ulanzi\UlanziDeck\Plugins`
3. Start Ulanzi Studio. The actions appear in the category **Home Assistant**.

### Connect to Home Assistant

1. In Home Assistant, open your **profile → Security → Long-lived access tokens** and create a token.
2. Drag any HA action onto a key, enter the Home Assistant URL (for example
   `http://homeassistant.local:8123`) and the token, then press **Test & save**.
3. The connection is stored once for all actions. No CORS settings are needed in Home Assistant.

The token is stored locally in Ulanzi Studio only, is never shown again in the settings page and is
removed from every log line.

### Use only one Dynamic Dial

Assign **HA Dynamic Dial** to one dial per device. Then hold any HA Toggle key (default 500 ms):
the key shows **EDIT** and the Dynamic Dial controls that entity until you press the key again,
after 10 s without input, or when you switch pages. If you assign the Dynamic Dial to several dials,
they all control the same value.

## Development

Requires Node.js ≥ 20.12.

```bash
npm install
npm test            # unit + integration tests with coverage, no device needed
npm run build       # bundles src/ into plugin/com.ulanzi.hadeck.ulanziPlugin/dist/app.js
npm run dev:link    # symlinks the plugin folder into the Ulanzi Studio plugins directory
npm run package     # builds com.ulanzi.hadeck.ulanziPlugin.zip (includes LICENSE and NOTICE)
```

- Set `HADECK_PLUGIN_DIR` to override the plugins directory used by `dev:link`.
- Debugging: start Ulanzi Studio with `--log --nodeRemoteDebug`; the main service listens on
  `127.0.0.1:9231`. Set `HADECK_DEBUG=1` for debug logging.
- The code is split into three layers: `src/ha` (Home Assistant client), `src/domain` (pure logic)
  and `src/adapter` (Ulanzi SDK binding). The first two never import the SDK.
- Specification, plan and tasks live in [`specs/001-ha-deck-plugin`](specs/001-ha-deck-plugin)
  ([spec-kit](https://github.com/github/spec-kit)); project principles in
  [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## License

Apache License 2.0 – see [LICENSE](LICENSE) and [NOTICE](NOTICE).

This project is not affiliated with, endorsed by, or sponsored by Ulanzi or the Home Assistant
project / Open Home Foundation. "Home Assistant" and "Ulanzi" are trademarks of their respective
owners.
