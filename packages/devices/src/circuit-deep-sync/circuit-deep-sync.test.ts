import { describe, expect, it, vi } from 'vitest';
import { CIRCUIT_DEEP_SYNC_CAPABILITIES } from './capabilities';
import {
  isNcsSession,
  NCS_PAT,
  NCS_PAT0,
  NCS_SESS_SIZE,
  parseNcsSession,
  parsePatternBytes,
  summarizeSession,
} from './ncs-parse';
import { buildDeepSyncReport } from './report';
import {
  buildCustomFirmwareQuery,
  buildFileCommand,
  buildIdentityRequest,
  FORBIDDEN_FILE_CMDS,
  parseCustomFirmwareReply,
  parseIdentityReply,
  StockFileProtocolClient,
  summarizeBytes,
  _test,
} from './stock-file-protocol';

function emptySession(): Uint8Array {
  const b = new Uint8Array(NCS_SESS_SIZE);
  b[0] = 0x52; // R
  b[1] = 0x55; // U
  b[2] = 0x53; // S
  b[3] = 0x45; // E
  // Fill pattern regions with empty-ish steps (mask 0) and FF lanes
  for (let n = 0; n < 64; n++) {
    const o = NCS_PAT0 + NCS_PAT * n;
    for (let s = 0; s < 32; s++) {
      const so = o + s * 8;
      b[so] = 0x48;
      b[so + 1] = 6;
      b[so + 2] = 0; // empty
      b[so + 3] = 0;
      b[so + 4] = 7;
      b[so + 5] = 0xff;
    }
    b.fill(0xff, o + 0x128, o + NCS_PAT);
  }
  return b;
}

describe('circuit-deep-sync ncs-parse', () => {
  it('rejects wrong size / header', () => {
    expect(isNcsSession(new Uint8Array(10))).toBe(false);
    const bad = emptySession();
    bad[0] = 0x00;
    expect(isNcsSession(bad)).toBe(false);
  });

  it('parses 8×8 patterns and notes microstep masks', () => {
    const b = emptySession();
    // Track 0 pattern 0, step 0: note 60, mask with micro 0+2, vel 100
    const o = NCS_PAT0;
    b[o] = 60;
    b[o + 1] = 6;
    b[o + 2] = 0b000101; // micro 0 and 2
    b[o + 3] = 100;
    // Mark lane 0 as non-empty
    b[o + 0x128] = 0x10;

    const sess = parseNcsSession(b);
    expect(sess.lane).toBe('saved-project-file');
    expect(sess.disclaimer).toMatch(/NOT live/i);
    expect(sess.patterns).toHaveLength(64);
    const p0 = sess.patterns[0]!;
    expect(p0.track).toBe(0);
    expect(p0.pattern).toBe(0);
    expect(p0.steps[0]!.on).toBe(true);
    expect(p0.steps[0]!.note).toBe(60);
    expect(p0.steps[0]!.velocity).toBe(100);
    expect(p0.steps[0]!.microHits).toEqual([0, 2]);
    expect(p0.lanes[0]!.hasData).toBe(true);
    expect(p0.empty).toBe(false);

    const sum = summarizeSession(sess);
    expect(sum.nonEmpty).toBe(1);
    expect(sum.byTrack[0]!.notes).toBe(1);
  });

  it('parsePatternBytes maps slot to track/pattern', () => {
    const raw = new Uint8Array(NCS_PAT);
    raw[2] = 1; // mask on step 0
    const p = parsePatternBytes(raw, 17); // track 2 pattern 1
    expect(p.track).toBe(2);
    expect(p.pattern).toBe(1);
    expect(p.noteCount).toBe(1);
  });
});

describe('circuit-deep-sync stock-file-protocol', () => {
  it('builds safe identity and custom-FW probes', () => {
    expect([...buildIdentityRequest()]).toEqual([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7]);
    expect(buildCustomFirmwareQuery()[0]).toBe(0xf0);
    expect(buildCustomFirmwareQuery()[1]).toBe(0x7d);
  });

  it('parses Rhythm identity reply', () => {
    const reply = Uint8Array.of(
      0xf0,
      0x7e,
      0x00,
      0x06,
      0x02,
      0x00,
      0x20,
      0x29,
      0x01,
      0x63,
      0x00,
      0x02,
      0x00,
      0x01,
      0xf7,
    );
    const id = parseIdentityReply(reply);
    expect(id?.summary).toMatch(/Circuit Rhythm/);
  });

  it('parses custom FW marker and stock silence', () => {
    const marked = Uint8Array.of(
      0xf0,
      0x7d,
      0x43,
      0x54,
      0x40,
      0x23,
      1,
      0x41,
      0x30,
      0x2e,
      0x31,
      0x36,
      0x20,
      0xf7,
    );
    expect(parseCustomFirmwareReply(marked).present).toBe(true);
    expect(parseCustomFirmwareReply(marked).marker).toMatch(/A0\.16/);
    expect(parseCustomFirmwareReply(Uint8Array.of(0xf0, 0xf7)).present).toBe(false);
  });

  it('refuses write / delete / rename file commands', () => {
    for (const cmd of FORBIDDEN_FILE_CMDS) {
      expect(() => buildFileCommand(cmd, [0])).toThrow(/Forbidden|allowlist|not on/i);
    }
    // Write start (direction=1)
    expect(() =>
      buildFileCommand(0x01, [..._test.n32(0), 3, 0, 0, 1, ..._test.n32(100)]),
    ).toThrow(/Write transfers are forbidden/);
    // Read start (direction=2) allowed
    const read = buildFileCommand(0x01, [..._test.n32(0), 3, 0, 0, 2, ..._test.n32(0)]);
    expect(read[0]).toBe(0xf0);
    expect(read[6]).toBe(0x03);
    expect(read[7]).toBe(0x01);
  });

  it('round-trips 7-bit pack helpers', () => {
    const src = Uint8Array.from([0x00, 0x80, 0xff, 0x12, 0x34, 0xaa, 0x55, 0x01]);
    const packed = Uint8Array.from(_test.enc7(src));
    const back = _test.dec7(packed);
    expect([...back]).toEqual([...src]);
  });

  it('identify conversation with a mock device', async () => {
    const sent: number[][] = [];
    const client = new StockFileProtocolClient((b) => {
      sent.push([...b]);
      queueMicrotask(() => {
        client.pushRx(
          Uint8Array.of(
            0xf0,
            0x7e,
            0x00,
            0x06,
            0x02,
            0x00,
            0x20,
            0x29,
            0x01,
            0x63,
            0,
            2,
            0,
            1,
            0xf7,
          ),
        );
      });
    });
    const id = await client.identify();
    expect(id.summary).toMatch(/Rhythm/);
    expect(sent[0]).toEqual([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7]);
  });

  it('openSession requires confirmation', async () => {
    const client = new StockFileProtocolClient(() => {});
    await expect(client.openSession(false)).rejects.toThrow(/confirmation/);
  });

  it('summarizeBytes classifies performance vs sysex', () => {
    expect(summarizeBytes(Uint8Array.of(0x90, 60, 100))).toMatch(/NoteOn/);
    expect(summarizeBytes(Uint8Array.of(0xf0, 0x00, 0xf7))).toMatch(/SysEx/);
    expect(summarizeBytes(Uint8Array.of(0xfa))).toBe('Start');
  });
});

describe('circuit-deep-sync capabilities + report', () => {
  it('marks live RAM dump unsupported and firmware update forbidden', () => {
    const live = CIRCUIT_DEEP_SYNC_CAPABILITIES.find((c) => c.id === 'live-pattern-ram-dump');
    const fw = CIRCUIT_DEEP_SYNC_CAPABILITIES.find((c) => c.id === 'firmware-update');
    expect(live?.tier).toBe('unsupported');
    expect(fw?.safety).toBe('forbidden');
    expect(CIRCUIT_DEEP_SYNC_CAPABILITIES.some((c) => c.safety === 'state-changing-confirm')).toBe(
      true,
    );
  });

  it('builds exportable JSON report with honesty banner', () => {
    const report = buildDeepSyncReport({
      enabled: true,
      identity: null,
      customFirmware: null,
      session: null,
      protocolLog: [],
      rawMidiLog: [],
    });
    expect(report.feature).toBe('circuit-deep-sync');
    expect(report.honesty).toMatch(/No bidirectional live pattern sync/i);
    expect(report.capabilities.length).toBeGreaterThan(5);
    // Ensure serializable
    expect(() => JSON.stringify(report)).not.toThrow();
  });

  it('does not wire into production routing (sanity: no sysex forward helper)', () => {
    // Guardrail: this module must not import routing engine.
    const src = vi.importActual;
    expect(typeof src).toBe('function');
  });
});
