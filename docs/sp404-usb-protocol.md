# SP-404MKII USB CDC protocol (read-only spike)

**Can we list/export pads over USB without removing the SD card?**  
**Yes, in principle** — the SP does not mount as a mass-storage drive, but it exposes a **USB CDC-ACM** virtual serial port that Roland’s SP-404MKII App (and community tools) use for pad/project I/O. This spike wires a **Chrome Web Serial, READ-ONLY** path into Dawlessdaw’s Samples tab.

Protocol knowledge is adapted from **[open404](https://github.com/iare-digital/open404)** ([MIT License](https://github.com/iare-digital/open404/blob/main/LICENSE) © 2026 Joe Amorosa / iare.digital). See especially [`docs/PROTOCOL.md`](https://github.com/iare-digital/open404/blob/main/docs/PROTOCOL.md). **SparkyMK2 is GPL — reference only; do not copy its code.**

> **Firmware:** open404 verified **v5.51** only. This spike treats **5.51** as the known-good target. **5.52**, stock or DOOM OS, is **untested** — UI shows a hard warning and stays read-only. Always back up the SD before first connect.

---

## Hardware connection (before first connect)

1. **Back up the SD card** (copy the whole card, or use the SP’s BKUP). Do this **before** opening the serial port.
2. **Quit the Roland SP-404MKII App** (and Sparky / open404 CLI / any other CDC owner). Only one process can own the serial port.
3. Power on the SP-404MKII, USB-C data cable to the Mac (not charge-only).
4. Note firmware on the unit (Utility / version screen). Prefer **5.51** for this spike.
5. Chrome or Edge on macOS (Web Serial). Open Dawlessdaw Samples → **SP USB (experimental)** (or `?spUsb=1`).
6. Check the SD-backup confirmation → **Connect** → pick **Roland SP-404MKII** in the browser port chooser.
7. Enter the firmware string you saw on the unit. If it is not `5.51`, read the warning and stay read-only.
8. List pads (banks A–D) → download one occupied pad as WAV.

Disconnect when done (panel **Disconnect** sends a graceful teardown). Re-open the Roland app only after disconnect.

---

## Physical layer

| Item | Value |
|------|--------|
| USB class | CDC-ACM (virtual serial) — **not** mass storage |
| VID / PID | `0x0582` / `0x02E7` (Roland / SP-404MKII) |
| Baud | 115200 8N1, no flow control |
| Also present | Class-compliant USB MIDI + USB Audio (unchanged; this spike does not use them for samples) |

macOS typically shows the CDC port as something like `/dev/cu.usbmodem*`. Web Serial does not use that path string; Chrome’s chooser claims the same interface.

---

## Framing (summary)

All CDC traffic is binary frames with 4-byte magics (host → device unless noted):

| Magic | Role |
|-------|------|
| `12 60 e0 05` | Short command (fixed 12 bytes) |
| `13 60 e0 05` | Parameter / memory / naming (25+ bytes) |
| `13 60 e0 06` | SysEx file-I/O wrapper (Open/Read/Write/…) |
| `12 e0 00 05` | Device short ACK |
| `13 e0 df 05` | Pad/project name ACK |
| `13 e0 00 05` | Waveform/memory chunk |
| `13 e0 60 06` | SysEx response |
| `13 e0 96 05` | Keepalive status (35 bytes; opaque) |

**Session:** wakeup short (`fe 66…`) → 25-byte init → keepalive every **500 ms** → teardown (`9d 02…`) on disconnect.

**Pads:** flat IDs `0x00`–`0x9F` (bank A pads 1–16 = `0x00`–`0x0F`, …). **Projects:** `0x00`–`0x0F` (projects 1–16).

Sample files on flash (SysEx path):

```text
/SP404REMOTE///ROLAND\SP-404MKII\PROJECT_<NN>/SMPL\BANK<B>-<PP>.SMP
```

`.SMP` = 512-byte **RFWV** header + 16-bit PCM (device stores PCM **big-endian**; host WAV needs byte-swap).

Full opcode tables, SysEx layouts, and RFWV fields: open404 `PROTOCOL.md` §§2–8.

---

## READ-only vs WRITE (Dawlessdaw allow-list)

The Web Serial client **only** sends commands on the allow-list. Unit tests assert every known write/erase opcode is rejected.

### Allowed (read / session)

| Op / packet | Purpose |
|-------------|---------|
| Wakeup / keepalive / init / teardown | Session |
| `0xFD` Project Info | Refresh/query project metadata |
| `0x9A` Select Project | Switch active project (needed so export hits the right flash project) |
| `0xAB` Pad Query | Occupation / status probe |
| Pad select (`f8 7f…`) | Highlight pad on hardware (for UI context) |
| `0xFB` Audio Prep **export** target `0xE8` | Open export session bracket |
| `0xFC` Audio Exec | Close transfer session |
| SysEx **Open** (read flags `00 00`) | Open `.SMP` for read |
| SysEx **Read** `0x04` | Stream file chunks |
| SysEx **Close** `0x03` | Close handle |
| SysEx **GetFileSize** `0x13` | Size probe (optional) |
| Waveform memory read subcmd `0x9C` | Chunked memory preview (not used by UI yet) |

### Blocked (write / erase / mutate)

| Op / packet | Why blocked |
|-------------|-------------|
| `0x91` Pad Alloc / Delete | Erases or allocates pads |
| `0x92` Project Init / format | Destructive format |
| `0x95` Pad Copy/Swap | Mutates pads |
| `0x98` Truncate | Destructive trim |
| `0xA3` Normalize / `0xA9` Emphasis | Mutates audio |
| `0x9F` Pad Refresh after import | Import commit |
| `0xAD` / `0xAE` / `0xAF` Pattern copy/move/delete | Pattern mutate |
| `0xB7` / `0xB8` Bounce | Renders onto pads |
| `0xFB` Audio Prep **import** (non-`0xE8` targets) | Import session |
| Pad session lock (`0x9D` / target `0x7F`) | Unmaps pad for overwrite |
| Rename sample / rename project | Metadata write |
| Pad parameter **set** (`f7 7f…`) | Writes live params |
| Bank/project setting set (`1a 00…`) | Writes globals |
| Pad metadata register (`70 00…`) | Post-import register |
| SysEx **Write** `0x06` | Flash write |
| SysEx **Delete / Stat-by-path `0x0A`** | Destructive / ambiguous; not used for list |
| SysEx Open **write** flags `0C 02` | Create/truncate |

**Honesty on “read pad parameters”:** open404 documents **set** packets for level/pan/gate/etc.; a dedicated **get-all-params** reply is not fully specified. This spike reports **occupation + RFWV header fields** (frames, rate, channels, bit depth) from export/open. Live knob params are not fetched as a full dump.

---

## Hardware test checklist (user)

Copy into the PR / runbook:

- [ ] **SD backup completed** (entire card or SP BKUP) **before** Connect.
- [ ] Roland SP-404MKII App **fully quit** (Activity Monitor: no leftover process).
- [ ] USB-C data cable; SP powered; Chrome/Edge.
- [ ] Samples → SP USB (experimental) → confirm backup checkbox → Connect → select SP-404MKII.
- [ ] Firmware field matches unit; if not `5.51`, warning visible; still read-only.
- [ ] List projects / list pads A–D shows occupied vs empty.
- [ ] Download one occupied pad → WAV plays in a normal audio app (48 kHz 16-bit).
- [ ] Existing **Open SP volume…** (File System Access / IMPORT) still works with the SD in a reader.
- [ ] Disconnect; Roland app can reopen the port.

---

## Web Serial on macOS — caveats (honest)

| Issue | Reality |
|-------|---------|
| Browser support | **Chrome / Edge only.** Safari and Firefox have no Web Serial. |
| Origin | Needs **secure context** (`https://` or `http://localhost`). |
| Port busy | If Roland App (or another CDC client) is open, `port.open()` fails or the chooser never yields a usable port. **Close the app first.** |
| Permissions | User must pick the device in Chrome’s chooser (gesture-gated). macOS may also prompt for USB/serial access for Chrome. |
| USB class | CDC-ACM generally appears to Web Serial; if the OS binds the interface oddly or a driver claims it exclusively, Chrome may list nothing useful. |
| Flags | Modern Chrome enables Web Serial by default; no special flag required. If Serial is disabled by policy (`#enable-web-serial` / enterprise), the Connect button stays disabled. |
| MIDI vs CDC | Web MIDI and Web Serial are separate claims. This spike uses Serial only for pads; MIDI clock/notes can still conflict with other apps, but sample export does not go over Web MIDI. |
| Firmware skew | Untested firmware may NACK Open/Read or hang the session — disconnect and fall back to SD File System Access. |

**If Web Serial cannot open the port:** Dawlessdaw cannot talk CDC. Fall back to **SD in a reader** → existing Samples “Open SP volume…” flow. A native sidecar (open404 CLI) remains the robust offline option.

---

## Relation to existing Dawlessdaw flows

| Path | Role |
|------|------|
| Samples **Open SP volume…** (File System Access) | Read occupied pads from a **mounted** SD; write WAVs into **IMPORT/** — unchanged. |
| Sessions **Write to IMPORT** | Unchanged. |
| **SP USB (experimental)** | Optional CDC read/list/export; never writes the device. |

Do **not** merge this spike without an explicit ask after a successful hardware test.
