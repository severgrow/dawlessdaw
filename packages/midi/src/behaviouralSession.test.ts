/**
 * Step 12 spike — Vitest is the behavioural runner (not hexatrack panelspec).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createBehaviouralSession, type BehaviouralSession } from './behaviouralSession';

describe('behaviouralSession (panelspec-eval: Vitest path)', () => {
  let session: BehaviouralSession;

  afterEach(async () => {
    await session?.stop();
  });

  it('starts mock ports and records outbound sends', async () => {
    session = await createBehaviouralSession();
    expect(session.transport.listPorts().some((p) => p.id === 'mock-circuit-in')).toBe(true);

    session.transport.send('mock-mpc-out', new Uint8Array([0x90, 60, 100]));
    const out = session.sent();
    expect(out).toHaveLength(1);
    expect(out[0]!.portId).toBe('mock-mpc-out');
    expect(out[0]!.data[0]).toBe(0x90);
    expect(session.sentHasSysex()).toBe(false);
  });

  it('inject delivers to listeners (inbound path)', async () => {
    session = await createBehaviouralSession();
    const seen: number[][] = [];
    session.transport.onMessage((msg) => {
      seen.push([...msg.data]);
    });
    session.inject('mock-circuit-in', [0x90, 48, 80]);
    expect(seen).toEqual([[0x90, 48, 80]]);
  });

  it('clearSent resets the outbound buffer', async () => {
    session = await createBehaviouralSession();
    session.transport.send('mock-mpc-out', new Uint8Array([0xb0, 123, 0]));
    session.clearSent();
    expect(session.sent()).toHaveLength(0);
  });
});
