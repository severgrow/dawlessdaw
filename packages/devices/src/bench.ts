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
      'On the Circuit, enable Note Tx, press Play on a pattern that uses several tracks. Watch detections for note-ons on channels 1–8.',
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
    title: 'e. SP-404 pattern via Program Change',
    instruction:
      'Tap Send test PC in the app. Confirm the SP-404MKII changes pattern. Mark Pass only if you see it on the unit.',
    listenHint: 'outbound PC to SP (you verify on hardware)',
    capabilityKey: 'sp-pattern-pc',
  },
  {
    id: 'mpc-sequence-pc',
    title: 'f. MPC sequence via Program Change',
    instruction:
      'Tap Send test PC in the app. Confirm the MPC changes sequence/program if your project is set up for it. Mark honestly.',
    listenHint: 'outbound PC to MPC (hardware verify)',
    capabilityKey: 'mpc-sequence-pc',
  },
  {
    id: 'mpc-mute-cc',
    title: 'g. MPC track mute via CC (MIDI Learn)',
    instruction:
      'On the MPC: Menu → MIDI/Sync → enable Control on the Dawlessdaw/Mac port. MIDI Learn → Mixer → Mute → learn CC 20 on channel 16. Then tap Send mute CC here.',
    listenHint: 'outbound CC 20 ch16',
    capabilityKey: 'mpc-mute-learn',
  },
  {
    id: 'timing-circuit-to-mpc',
    title: 'h. Timing Circuit → app → MPC',
    instruction:
      'Play a Circuit track routed to the MPC. The app measures note-in to note-out delay on the Mac. Read the verdict — be honest if it feels loose.',
    listenHint: 'latency/jitter stats',
    capabilityKey: 'app-midi-latency',
  },
  {
    id: 'reconnect',
    title: 'i. Unplug / replug devices',
    instruction:
      'Unplug one USB MIDI device, wait 3 s, plug it back. Confirm it shows connected again and routes re-attach.',
    listenHint: 'port connect events',
    capabilityKey: 'port-reconnect',
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
