export type BenchVerdict = 'pass' | 'fail' | 'unsure' | 'pending';

export type BenchGroup = 'circuit' | 'mpc' | 'sp' | 'fm1' | 'audio' | 'general';

/** Display order and names for bench groups. */
export const BENCH_GROUPS: readonly { id: BenchGroup; label: string }[] = [
  { id: 'circuit', label: 'Circuit Rhythm' },
  { id: 'mpc', label: 'MPC One (via Scarlett)' },
  { id: 'sp', label: 'SP-404MKII' },
  { id: 'fm1', label: 'FM1 (Skiff)' },
  { id: 'audio', label: 'Session Recorder (audio)' },
  { id: 'general', label: 'Whole rig' },
];

export interface BenchTestDef {
  id: string;
  /** Which device the test is about (for grouping in the app). */
  group: BenchGroup;
  title: string;
  instruction: string;
  /** What the app listens for */
  listenHint: string;
  capabilityKey?: string;
}

export interface BenchTestResult {
  id: string;
  verdict: BenchVerdict;
  note: string;
  detections: string[];
  updatedAt: number;
}

export interface BenchExport {
  exportedAt: string;
  app: 'dawlessdaw';
  phase: 'phase-2-live-bench';
  results: BenchTestResult[];
  rawMidiLog: { at: number; portId: string; data: number[]; summary: string }[];
  disclaimer: string;
}

export const BENCH_TESTS: BenchTestDef[] = [
  {
    id: 'circuit-notes-1-8',
    group: 'circuit',
    title: 'a. Circuit sequencer notes on channels 1–8',
    instruction:
      'On the Circuit, enable Note Tx, press Play on a pattern that uses several tracks. Watch detections for note-ons on channels 1–8 (USB into the app).',
    listenHint: 'note-on channels 1–8 from Circuit input',
    capabilityKey: 'circuit-note-tx',
  },
  {
    id: 'circuit-mute-stops-notes',
    group: 'circuit',
    title: 'b. Mute stops Circuit note TX',
    instruction:
      'With the sequencer playing, mute one track on the Circuit. Confirm that channel stops showing new note-ons.',
    listenHint: 'note activity gap on muted channel',
    capabilityKey: 'circuit-mute-tx',
  },
  {
    id: 'circuit-scene-any-midi',
    group: 'circuit',
    title: 'c. Circuit Scene change — any MIDI?',
    instruction:
      'Press Start Capture (10 s), then change Scenes on the Circuit. We log every message — Scene MIDI is unconfirmed in docs.',
    listenHint: '10-second raw capture around Scene change',
    capabilityKey: 'circuit-scene-midi',
  },
  {
    id: 'circuit-project-pgm',
    group: 'circuit',
    title: 'd. Circuit Project → Program Change ch16',
    instruction:
      'Change Project on the Circuit (instant or queued). Look for Program Change on MIDI channel 16.',
    listenHint: 'program-change channel 16',
    capabilityKey: 'circuit-project-pgm',
  },
  {
    id: 'sp-pattern-pc',
    group: 'sp',
    title: 'e. SP-404 pattern via Program Change (ch13)',
    instruction:
      'Tap Send test PC in the app (Program Change on channel 13). Confirm the SP-404MKII changes pattern. Mark Pass only if you see it on the unit.',
    listenHint: 'outbound PC ch13 to SP (you verify on hardware)',
    capabilityKey: 'sp-pattern-pc',
  },
  {
    id: 'mpc-sequence-pc',
    group: 'mpc',
    title: 'f. MPC sequence via Program Change (control ch15)',
    instruction:
      'Tap Send test PC in the app (Program Change on MPC control channel 15 — never 1–8 or 16). Confirm the MPC changes sequence/program if your project is set up for it. Mark honestly.',
    listenHint: 'outbound PC ch15 to MPC (hardware verify)',
    capabilityKey: 'mpc-sequence-pc',
  },
  {
    id: 'mpc-mute-cc',
    group: 'mpc',
    title: 'g. MPC track mute via CC (MIDI Learn)',
    instruction:
      'On the MPC: Menu → MIDI/Sync → enable Control on the Dawlessdaw/Mac port. MIDI Learn → Mixer → Mute → learn CC 20 on channel 15 (not 16). Then tap Send mute CC here.',
    listenHint: 'outbound CC 20 ch15',
    capabilityKey: 'mpc-mute-learn',
  },
  {
    id: 'mpc-scarlett-notes',
    group: 'mpc',
    title: 'g2. MPC via Scarlett: notes (Circuit T1–T4 → MPC ch9–12)',
    instruction:
      'Setup tab: MPC One → MIDI out = the Scarlett port (e.g. "Scarlett 2i4 USB"), MPC connection = "App sends notes (USB or Scarlett)". Controller tab: preset "My Studio · T1–4 → MPC" (T1–T4 → MPC tracks 1–4 / ch9–12). On the MPC, give each of tracks 1–4 its own MIDI input: the MIDI In port on channel 9, 10, 11, 12 (not "All"), and set each track\'s monitoring to always on (In) rather than Auto, so every track plays — not only the selected one. Program a few steps on Circuit tracks 1–4 and press Play. Pass only if each MPC track plays its Circuit track — and nothing plays twice.',
    listenHint: 'note-on ch1–4 Circuit in → ch9–12 out to the MPC Out (Scarlett) port',
    capabilityKey: 'din-notes-via-interface',
  },
  {
    id: 'mpc-scarlett-clock',
    group: 'mpc',
    title: 'g3. MPC follows Circuit Play — sequencer runs via Scarlett→DIN',
    instruction:
      'Setup › MPC follows Circuit Play = On (or Rig → Tempo → MPC on). MPC Out must be the Scarlett / MIDI interface — NOT the “MPC One” USB port. Cable: interface MIDI Out → MPC MIDI In. On the MPC: Preferences → MIDI/Sync: MIDI In row on, Receive = MIDI Clock, send clock off. Circuit: Clock Tx (pad 32) bright. Press Play on the Circuit — the MPC *sequence* should start (not just pad hits from note routes); change Circuit tempo — MPC follows; Stop — MPC stops. Note routes (T1–T4 → ch9–12) can stay on at the same time. “Send test Start/Clock/Stop → MPC” bursts from the app if Circuit is not ready. Mark Pass only when you see the sequencer run on your firmware — app-side forward is sim-verified; hardware still untested until you Pass.',
    listenHint: 'IN start/stop/clock (+ SPP if sent) from Circuit · OUT same → MPC Out (Scarlett DIN path)',
    capabilityKey: 'din-clock-via-interface',
  },
  {
    id: 'fm1-t5-t6-notes',
    group: 'fm1',
    title: 'h. Circuit T5–T8 → FM1 (Skiff) over USB',
    instruction:
      'Setup tab: FM1 firmware = Skiff. Controller tab: load preset "My Studio · T1–4 → SP" (or the MPC variant) — T5–T8 play Skiff tracks 1–4. On the FM1: MENU › MIDI › T1–T4 CHANNEL = 1, 2, 3, 4 (Skiff default; match the app). If you previously set them to 5–8, set them back, or open Advanced → Skiff track channels. Load empty samples on Circuit tracks 5–8 and program a few steps on each. Play: Circuit T5 should play Skiff track 1, T6 → track 2, T7 → track 3, T8 → track 4. Mark Pass only when you hear each one on the right Skiff track.',
    listenHint: 'note-on ch5–8 Circuit in → FM1 out on Skiff ch1–4 (hardware verify)',
    capabilityKey: 'fm1-usb-notes',
  },
  {
    id: 'fm1-skiff-knobs',
    group: 'fm1',
    title: 'h2. Circuit macro knobs → Skiff settings',
    instruction:
      'Circuit Setup: CC Tx on. Controller tab: My Studio (T5–T8 → Skiff). Select Circuit track 5 and turn each macro knob. Expected on Skiff track 1: macro 1 brightness, 2 resonance, 3 attack, 4 decay, 5 release, 6 delay send, 7 reverb send, 8 Level (CC7). "Sound (steps)" is optional — pick it on a knob if you want the old sound-step behaviour (see h4). Repeat on tracks 6–8. Note any knob that does nothing or moves the wrong thing.',
    listenHint: 'CC 21–28 in on ch5–8 → CC 74/71/73/75/72/94/91/7 out to FM1',
    capabilityKey: 'skiff-standard-cc',
  },
  {
    id: 'circuit-mixer-levels',
    group: 'fm1',
    title: 'h7. Circuit Mixer Level → destination Volume (CC7)',
    instruction:
      'Circuit Setup: CC Tx on. Press Mixer so ▼ is lit (macros = Level). Play a looped note on a track routed to FM1 (T5–T8) or MPC/SP (T1–T4). Turn that track’s Macro — Skiff should change LEVEL (CC7); for MPC/SP listen for volume or MIDI Learn CC7 on that channel. Mark Pass only when you hear the level change on the destination.',
    listenHint: 'CC29 in on track ch → CC7 Volume out on remapped dest channel (sim verified; hardware Pass pending)',
    capabilityKey: 'mixer-level-tx',
  },
  {
    id: 'fm1-skiff-sound-knob',
    group: 'fm1',
    title: 'h4. Optional: Sound (steps) on a Circuit macro',
    instruction:
      'Controller tab: on a Skiff track (e.g. T5), set one knob target to "Sound (steps through 8)" (Advanced shows the MIDI). Select that Circuit track and slowly turn that macro from fully left to fully right while a note plays. Skiff should change sound about 8 times, one sound per click zone, and the FM1 screen should show the new sound name. Then do the same on another Circuit→Skiff track: only that Skiff track should change. Note what happens at the far right (does it stop on a sound, or jump to another engine?). My Studio defaults macro 8 to Level, not Sound.',
    listenHint: 'mapped macro CC in → Program Change 0–7 out to FM1 on the Skiff track channel',
    capabilityKey: 'skiff-program-change',
  },
  {
    id: 'fm1-skiff-clock',
    group: 'fm1',
    title: 'h3. Skiff follows Circuit tempo over USB (optional)',
    instruction:
      'Skiff CLOCK = USB. Rig tab → Tempo: → FM1 on. Press Play on the Circuit, change its tempo, press Stop. Skiff should start, follow the tempo and stop with it.',
    listenHint: 'clock/start/stop Circuit in → FM1 out',
    capabilityKey: 'skiff-usb-clock',
  },
  {
    id: 'sp-banks-a-d',
    group: 'sp',
    title: 'h5. Circuit T1–T4 → SP banks A–D',
    instruction:
      'SP: MIDI settings → MIDI Mode A. App: Controller tab → preset "My Studio · T1–4 → SP" (T1–T4 → SP banks A–D). Press "Play the first note" on track 1 and play the lowest note on Circuit track 1. Play tracks 1–4: track 1 should play bank A, 2 → B, 3 → C, 4 → D, and higher notes should walk up the pads. If every hit plays twice, the thru cable is already playing the SP — choose MPC for those tracks or leave the app notes off.',
    listenHint: 'note-on ch1–4 Circuit in → SP out, notes 36–51 (hardware verify)',
    capabilityKey: 'sp-banks-mode-a',
  },
  {
    id: 'sp-effect-ctrl',
    group: 'sp',
    title: 'h6. SP effect knobs from Circuit macros',
    instruction:
      'SP: MIDI Mode A. Controller: map a Circuit macro on an SP track to "Effect control 1–8" (Roland chart CCs 16–19, 80–83). Turn the real Circuit knob and watch which on-screen effect CTRL moves on the SP, and confirm it listens on the bank channel (Mode A). Mark Pass only when you know which CC moves which knob. Effect on/off is not offered in the app yet.',
    listenHint: 'CC 16–19 / 80–83 out to SP (hardware: which CTRL knob moves — unverified)',
    capabilityKey: 'sp-effect-ctrl',
  },
  {
    id: 'mpc-learnable-knobs',
    group: 'mpc',
    title: 'g4. MPC Learnable knobs from Circuit macros',
    instruction:
      'Controller: load "My Studio · T1–4 → MPC". On the MPC open MIDI Learn, touch the control you want, then in the app press "test" on that Learnable knob (or turn the matching Circuit macro). Confirm the MPC control moves. Menu names on your firmware may differ — mark honestly.',
    listenHint: 'CC 21–28 out on MPC track channels 9–12 (hardware learn verify)',
    capabilityKey: 'mpc-learnable-cc',
  },
  {
    id: 'timing-circuit-to-mpc',
    group: 'mpc',
    title: 'i. Timing Circuit → app → Scarlett → MPC',
    instruction:
      'Play a busy pattern on Circuit tracks 1–4 for 30 seconds with the MPC set up as in g2 (Controller preset My Studio · T1–4 → MPC). The app measures how long each note takes from Circuit USB in to the moment it is sent to the MPC Out (Scarlett) port, and shows the average delay and jitter. Honest limits: this is the Mac side only — the Scarlett adds its USB → DIN hop (about 1 ms per note on the DIN cable; 4 notes on the same step go out one after another, so the last is about 4 ms late) and the MPC adds its own. Also listen: play the same pattern on Circuit tracks 1–4 to the SP or Circuit itself and compare by ear. Mark Pass only if it sounds tight to you.',
    listenHint: 'latency/jitter stats (Mac side: Circuit in → MPC Out send)',
    capabilityKey: 'app-midi-latency',
  },
  {
    id: 'reconnect',
    group: 'general',
    title: 'j. Unplug / replug devices',
    instruction:
      'Unplug one USB MIDI device (try FM1/Felucca), wait 3 s, plug it back. Confirm it shows connected again and routes re-attach. Re-apply My Studio if needed.',
    listenHint: 'port connect events',
    capabilityKey: 'port-reconnect',
  },
  {
    id: 'thru-box-clock-no-notes',
    group: 'general',
    title: 'k. Thru box: clock without app notes (optional)',
    instruction:
      'Close the app and play the Circuit: the SP should follow tempo from the thru box but play no notes (unless the SP is in MIDI Mode A with notes on channels 1–4). The MPC is no longer on the thru box, so with the app closed it should do nothing at all.',
    listenHint: 'hardware-only check — no app detections',
    capabilityKey: 'thru-clock-isolation',
  },
  {
    id: 'usb-app-clock',
    group: 'general',
    title: 'l. Clock monitor: Circuit clock in → app clock out (optional)',
    instruction:
      'Turn on one of the Tempo switches in the Rig tab. Circuit Setup (Shift+Save): Clock Tx pad 32 bright. Press Play on the Circuit. Setup → Troubleshooting → Clock monitor should show IN and OUT counts rising. This only proves the app forwards clock; g3 and h3 check that the MPC / FM1 actually follow.',
    listenHint: 'IN/OUT hex: FA start, F8 clock (sampled), FC stop',
    capabilityKey: 'usb-app-clock',
  },
  {
    id: 'session-recorder-interface',
    group: 'audio',
    title: 'm. Record 30 s from ZED / Scarlett / any interface, trim, export, listen back',
    instruction:
      'Sessions tab → pick your USB audio input (ZED-10FX, Scarlett, SP-404MKII, or any interface the Mac exposes). Record about 30 seconds of real audio, trim with the handles, export WAV and MP3, then listen back in another app. Mark Pass only if the take sounds right. This does not claim ZED/Scarlett verification by itself — you attest.',
    listenHint: 'local Session Recorder capture (no MIDI required)',
    capabilityKey: 'session-recorder-capture',
  },
];

export function emptyBenchResults(): BenchTestResult[] {
  return BENCH_TESTS.map((t) => ({
    id: t.id,
    verdict: 'pending',
    note: '',
    detections: [],
    updatedAt: 0,
  }));
}

export function buildBenchExport(
  results: BenchTestResult[],
  rawMidiLog: BenchExport['rawMidiLog'],
): BenchExport {
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    exportedAt: new Date().toISOString(),
    app: 'dawlessdaw',
    phase: 'phase-2-live-bench',
    results,
    rawMidiLog,
    disclaimer:
      `File dawlessdaw-bench-${stamp}.json — simulated or live detections do not by themselves prove musical reliability. Hardware Pass marks are user-attested.`,
  };
}

/** Rough playability band for measured one-way app hop (ms). */
export function latencyVerdict(
  meanMs: number,
  jitterMs: number,
): { band: 'tight' | 'ok' | 'loose' | 'unusable'; message: string } {
  if (meanMs < 8 && jitterMs < 4)
    return { band: 'tight', message: 'Looks tight for live use on this Mac hop.' };
  if (meanMs < 15 && jitterMs < 8)
    return { band: 'ok', message: 'Probably usable; trust your ears on groove.' };
  if (meanMs < 30)
    return {
      band: 'loose',
      message: 'Loose for tight percussion — prefer hardware MIDI thru for clocked hits.',
    };
  return {
    band: 'unusable',
    message: 'Too loose for live sequencing through the app — keep notes on hardware paths.',
  };
}
