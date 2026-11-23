import { describe, expect, it } from 'vitest';
import { MockMidiTransport, FIXTURE_CIRCUIT_GROOVE } from './mock-midi-transport';

/**
 * MMT-8 Step 2 — MockMidiTransport behavioural helpers.
 * Deterministic inject / replay only; no Web MIDI, no firmware fixtures from MMT-8.
 */
describe('MockMidiTransport behavioural', () => {
  it('records outbound sends for assert harnesses', async () => {
    const t = new MockMidiTransport();
    await t.start();
    t.send('mock-mpc-out', new Uint8Array([0x90, 60, 100]));
    t.send('mock-mpc-out', new Uint8Array([0x80, 60, 0]));
    expect(t.getSent()).toHaveLength(2);
    t.clearSent();
    expect(t.getSent()).toHaveLength(0);
  });

  it('replaySync is order-deterministic (elapsed offsets ignored for sync path)', async () => {
    const t = new MockMidiTransport();
    await t.start();
    const kinds: string[] = [];
    t.onMessage((m) => kinds.push(m.kind));
    t.replaySync(FIXTURE_CIRCUIT_GROOVE);
    expect(kinds[0]).toBe('start');
    expect(kinds).toContain('clock');
    expect(kinds).toContain('note-on');
    expect(kinds).toContain('note-off');
  });

  it('setPortConnected marks disconnect without inventing MIDI', async () => {
    const t = new MockMidiTransport();
    await t.start();
    let last = t.listPorts();
    t.onPortsChanged((ports) => {
      last = ports;
    });
    t.setPortConnected('mock-circuit-in', false);
    expect(last.find((p) => p.id === 'mock-circuit-in')?.state).toBe('disconnected');
    expect(t.getSent()).toHaveLength(0);
  });
});
