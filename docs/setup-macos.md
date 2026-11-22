# Setup on macOS (Chrome)

## Requirements

- macOS with Node.js 20+ (22 recommended)
- Google Chrome or Chromium-based Edge (Web MIDI)
- Optional: hardware listed in device-connection.md

## Install & run

```bash
cd /path/to/dawlessdaw   # Project store: …/github.com/severgrow/dawlessdaw
npm install
npm run dev
```

Open **http://localhost:5173**.

Default mode is **Simulation** (MockMidiTransport). No hardware required.

## Live Web MIDI

1. Status bar → **Switch to Live**
2. Chrome prompts for MIDI access — allow
3. Connect devices; ports appear in Patchbay / device strip

Use `localhost` or HTTPS. File origins will not get MIDI.

## Tests

```bash
npm test
```

Real-hardware tests are skipped (`describe.skip`) until run manually with gear attached.

## Build

```bash
npm run build
```
