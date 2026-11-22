export type BenchVerdict = 'pass' | 'fail' | 'unsure' | 'pending';

export interface BenchTestDef {
  id: string;
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
    title: 'a. Circuit sequencer notes on channels 1–8',
    instruction:
      'On the Circuit, enable Note Tx, press Play on a pattern that uses several tracks. Watch detections for note-ons on channels 1–8 (USB into the app).',
    listenHint: 'note-on channels 1–8 from Circuit input',
    capabilityKey: 'circuit-note-tx',
  },
  {
    id: 'circuit-mute-stops-notes',
    title: 'b. Mute stops Circuit note TX',
    instruction:
      'With the sequencer playing, mute one track on the Circuit. Confirm that channel stops showing new note-ons.',
    listenHint: 'note activity gap on muted channel',
    capabilityKey: 'circuit-mute-tx',
  },
  {
    id: 'circuit-scene-any-midi',
    title: 'c. Circuit Scene change — any MIDI?',
    instruction:
      'Press Start Capture (10 s), then change Scenes on the Circuit. We log every message — Scene MIDI is unconfirmed in docs.',
    listenHint: '10-second raw capture around Scene change',
    capabilityKey: 'circuit-scene-midi',
  },
  {
    id: 'circuit-project-pgm',
    title: 'd. Circuit Project → Program Change ch16',
    instruction:
      'Change Project on the Circuit (instant or queued). Look for Program Change on MIDI channel 16.',
    listenHint: 'program-change channel 16',
    capabilityKey: 'circuit-project-pgm',
  },
  {
    id: 'sp-pattern-pc',
    title: 'e. SP-404 pattern via Program Change (ch13)',
    instruction:
      'Tap Send test PC in the app (Program Change on channel 13). Confirm the SP-404MKII changes pattern. Mark Pass only if you see it on the unit.',
    listenHint: 'outbound PC ch13 to SP (you verify on hardware)',
    capabilityKey: 'sp-pattern-pc',
  },
  {
    id: 'mpc-sequence-pc',
    title: 'f. MPC sequence via Program Change (control ch15)',
    instruction:
      'Tap Send test PC in the app (Program Change on MPC control channel 15 — never 1–8 or 16). Confirm the MPC changes sequence/program if your project is set up for it. Mark honestly.',
    listenHint: 'outbound PC ch15 to MPC (hardware verify)',
    capabilityKey: 'mpc-sequence-pc',
  },
  {
    id: 'mpc-mute-cc',
    title: 'g. MPC track mute via CC (MIDI Learn)',
    instruction:
      'On the MPC: Menu → MIDI/Sync → enable Control on the Dawlessdaw/Mac port. MIDI Learn → Mixer → Mute → learn CC 20 on channel 15 (not 16). Then tap Send mute CC here.',
    listenHint: 'outbound CC 20 ch15',
    capabilityKey: 'mpc-mute-learn',
  },
  {
    id: 'mpc-scarlett-notes',
    title: 'g2. MPC via Scarlett: notes (Circuit T1–T4 → MPC ch9–12)',
    instruction:
      'Settings → MPC Out = the Scarlett port (e.g. "Scarlett 2i4 USB"), MPC connection = "App sends notes (USB or Scarlett)", Circuit tracks 1–4 = MPC. On the MPC, set tracks 1–4 to MIDI input = the MIDI In port, channels 9, 10, 11, 12. Program a few steps on Circuit tracks 1–4 and press Play. Pass only if each MPC track plays its Circuit track — and nothing plays twice.',
    listenHint: 'note-on ch1–4 Circuit in → ch9–12 out to the MPC Out (Scarlett) port',
    capabilityKey: 'din-notes-via-interface',
  },
  {
    id: 'mpc-scarlett-clock',
    title: 'g3. MPC follows Circuit tempo / start / stop via Scarlett',
    instruction:
      'Settings → App clock forwarding → Circuit clock → MPC = ON. On the MPC: Menu → Preferences → MIDI/Sync: MIDI In row on, Receive = MIDI Clock, MIDI clock send off. Circuit: Clock Tx (pad 32) bright. Press Play on the Circuit — the MPC should start; change the Circuit tempo — the MPC should follow; press Stop — the MPC should stop. "Send test Start/Clock/Stop → MPC" sends a short burst straight from the app if the Circuit is not ready.',
    listenHint: 'IN start/stop from Circuit · OUT start/clock/stop → MPC Out (Scarlett)',
    capabilityKey: 'din-clock-via-interface',
  },
  {
    id: 'fm1-t5-t6-notes',
    title: 'h. Circuit T5–T8 → FM1 (Skiff) over USB',
    instruction:
      'Settings → FM1 firmware = Skiff. On the FM1: MENU › MIDI › T1–T4 CHANNEL = 5, 6, 7, 8. Load empty samples on Circuit tracks 5–8 and program a few steps on each. Play: Circuit T5 should play Skiff track 1, T6 → track 2, T7 → track 3, T8 → track 4. Mark Pass only when you hear each one on the right Skiff track.',
    listenHint: 'note-on ch5–8 Circuit in → FM1 out (hardware verify)',
    capabilityKey: 'fm1-usb-notes',
  },
  {
    id: 'fm1-skiff-knobs',
    title: 'h2. Circuit macro knobs → Skiff settings',
    instruction:
      'Circuit Setup: CC Tx on. Select track 5 and turn each macro knob. Expected on Skiff track 1: macro 1 brightness, 2 resonance, 3 attack, 4 decay, 5 release, 6 delay send, 7 reverb send (macro 8 is the sound knob — see h4). Repeat on tracks 6–8. Note any knob that does nothing or moves the wrong thing.',
    listenHint: 'CC 21–27 in on ch5–8 → CC 74/71/73/75/72/94/91 out to FM1',
    capabilityKey: 'skiff-standard-cc',
  },
  {
    id: 'fm1-skiff-sound-knob',
    title: 'h4. Circuit macro 8 steps Skiff sounds',
    instruction:
      'Select Circuit track 5 and slowly turn macro 8 from fully left to fully right while a note plays. Skiff track 1 should change sound about 8 times, one sound per click zone, and the FM1 screen should show the new sound name. Then select track 6 and do the same: only Skiff track 2 should change. Note what happens at the far right (does it stop on a sound, or jump to another engine?).',
    listenHint: 'CC28 in on ch5–8 → Program Change 0–7 out to FM1 on the same channel',
    capabilityKey: 'skiff-program-change',
  },
  {
    id: 'fm1-skiff-clock',
    title: 'h3. Skiff follows Circuit tempo over USB (optional)',
    instruction:
      'Skiff CLOCK = USB. Settings → Circuit clock → FM1 over USB ON. Press Play on the Circuit, change its tempo, press Stop. Skiff should start, follow the tempo and stop with it.',
    listenHint: 'clock/start/stop Circuit in → FM1 out',
    capabilityKey: 'skiff-usb-clock',
  },
  {
    id: 'sp-banks-a-d',
    title: 'h4. Circuit T1–T4 → SP banks A–D',
    instruction:
      'SP: MIDI settings → MIDI Mode A. App: Settings → Circuit tracks 1–4 = SP banks A–D, then Learn pad 1 and play the lowest note on Circuit track 1. Play tracks 1–4: track 1 should play bank A, 2 → B, 3 → C, 4 → D, and higher notes should walk up the pads. If every hit plays twice, the thru cable is already playing the SP — tell the app (offset 0 warning).',
    listenHint: 'note-on ch1–4 Circuit in → SP out, notes 36–51 (hardware verify)',
    capabilityKey: 'sp-banks-mode-a',
  },
  {
    id: 'timing-circuit-to-mpc',
    title: 'i. Timing Circuit → app → Scarlett → MPC',
    instruction:
      'Play a busy pattern on Circuit tracks 1–4 for 30 seconds with the MPC set up as in g2. The app measures how long each note takes from Circuit USB in to the moment it is sent to the MPC Out (Scarlett) port, and shows the average delay and jitter. Honest limits: this is the Mac side only — the Scarlett adds its USB → DIN hop (about 1 ms per note on the DIN cable; 4 notes on the same step go out one after another, so the last is about 4 ms late) and the MPC adds its own. Also listen: play the same pattern on Circuit tracks 1–4 to the SP or Circuit itself and compare by ear. Mark Pass only if it sounds tight to you.',
    listenHint: 'latency/jitter stats (Mac side: Circuit in → MPC Out send)',
    capabilityKey: 'app-midi-latency',
  },
  {
    id: 'reconnect',
    title: 'j. Unplug / replug devices',
    instruction:
      'Unplug one USB MIDI device (try FM1/Felucca), wait 3 s, plug it back. Confirm it shows connected again and routes re-attach. Re-apply My Studio if needed.',
    listenHint: 'port connect events',
    capabilityKey: 'port-reconnect',
  },
  {
    id: 'thru-box-clock-no-notes',
    title: 'k. Thru box: clock without app notes (optional)',
    instruction:
      'Close the app and play the Circuit: the SP should follow tempo from the thru box but play no notes (unless the SP is in MIDI Mode A with notes on channels 1–4). The MPC is no longer on the thru box, so with the app closed it should do nothing at all.',
    listenHint: 'hardware-only check — no app detections',
    capabilityKey: 'thru-clock-isolation',
  },
  {
    id: 'usb-app-clock',
    title: 'l. Clock monitor: Circuit clock in → app clock out (optional)',
    instruction:
      'Turn on one of the App clock forwarding switches in Settings. Circuit Setup (Shift+Save): Clock Tx pad 32 bright. Press Play on the Circuit. Patchbay should show IN FA/F8 and OUT FA/F8 counts rising. This only proves the app forwards clock; g3 and h3 check that the MPC / FM1 actually follow.',
    listenHint: 'IN/OUT hex: FA start, F8 clock (sampled), FC stop',
    capabilityKey: 'usb-app-clock',
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
