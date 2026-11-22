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
      'Circuit Setup: CC Tx on. Select track 5 and turn each macro knob. Expected on Skiff track 1: macro 1 brightness, 2 resonance, 3 attack, 4 decay, 5 release, 6 delay send, 7 reverb send, 8 level. Repeat on tracks 6–8. Note any knob that does nothing or moves the wrong thing.',
    listenHint: 'CC 21–28 in on ch5–8 → CC 74/71/73/75/72/94/91/7 out to FM1',
    capabilityKey: 'skiff-standard-cc',
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
    id: 'timing-circuit-to-mpc',
    title: 'i. Timing Circuit → app → MPC (optional)',
    instruction:
      'Skip if MPC is unplugged. Play a Circuit track routed to the MPC (USB remaps ch1–4 → ch9–12). The app measures note-in to note-out delay on the Mac. Read the verdict — be honest if it feels loose.',
    listenHint: 'latency/jitter stats',
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
      'Skip if no DIN thru / MPC/SP. Close the app, play the Circuit: MPC and SP should follow tempo but play no notes. (Proves DIN thru carries clock; musical notes only arrive via USB when the app is open — T5–T8 → FM1, T1–4 → MPC 9–12. In "MPC via MIDI cable only" mode the MPC plays tracks 1–4 straight from the cable instead.)',
    listenHint: 'hardware-only check — no app detections',
    capabilityKey: 'thru-clock-isolation',
  },
  {
    id: 'usb-app-clock',
    title: 'l. USB-only: Circuit clock through app → MPC/SP (optional)',
    instruction:
      'Settings → App clock forwarding ON. Circuit Setup (Shift+Save): Clock Tx pad 32 bright. Focus this test, press Play on Circuit. Patchbay should show IN FA/F8 and OUT FA/F8. If OUT rises but MPC stays silent: Akai USB-B typically does not take MIDI Clock — use DIN thru and turn app forwarding OFF. Optional: Send test Start/Clock → MPC (direct) to prove Mac→MPC out without Circuit.',
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
