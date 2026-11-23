import { describe, expect, it } from 'vitest';
import {
  MIXER_SCHEMA_VERSION,
  clampLevel,
  clampPan,
  createDemoMixerGraph,
  createEmptyMixerGraph,
  findMixerBus,
  parseMixerGraph,
  resolveMixerAudibility,
  validateMixerGraph,
  type MixerGraph,
} from './mixer-model';

describe('mixer data model', () => {
  it('empty graph has Main + Cue only (no fake 16×8 claim)', () => {
    const g = createEmptyMixerGraph();
    expect(g.kind).toBe('splot-mixer');
    expect(g.schemaVersion).toBe(MIXER_SCHEMA_VERSION);
    expect(g.channels).toEqual([]);
    expect(g.buses.map((b) => b.id).sort()).toEqual(['cue', 'main']);
    expect(validateMixerGraph(g)).toEqual([]);
    expect(g.notes?.toLowerCase()).toMatch(/logical|not mixtee|not a multichannel/i);
  });

  it('demo graph validates and resolves all audible by default', () => {
    const g = createDemoMixerGraph();
    expect(validateMixerGraph(g)).toEqual([]);
    const resolved = resolveMixerAudibility(g);
    expect(resolved.every((r) => r.audible)).toBe(true);
    expect(resolved.find((r) => r.id === 'ch-sp404')?.effectiveLevel).toBeCloseTo(0.85);
  });

  it('mute silences a channel; exclusive solo silences others', () => {
    const g = createDemoMixerGraph();
    g.channels[0]!.mute = true;
    let r = resolveMixerAudibility(g);
    expect(r.find((x) => x.id === 'ch-circuit')).toMatchObject({
      audible: false,
      mutedByChannel: true,
      effectiveLevel: 0,
    });

    g.channels[0]!.mute = false;
    g.channels[1]!.solo = true;
    r = resolveMixerAudibility(g);
    expect(r.find((x) => x.id === 'ch-sp404')?.audible).toBe(true);
    expect(r.find((x) => x.id === 'ch-circuit')).toMatchObject({
      audible: false,
      mutedBySolo: true,
    });
    expect(r.find((x) => x.id === 'ch-mpc')?.mutedBySolo).toBe(true);
  });

  it('bus mute silences every strip on that bus', () => {
    const g = createDemoMixerGraph();
    const main = g.buses.find((b) => b.id === 'main')!;
    main.mute = true;
    const r = resolveMixerAudibility(g);
    expect(r.every((x) => x.mutedByBus && !x.audible)).toBe(true);
  });

  it('rejects unknown busId and duplicate ids', () => {
    const g: MixerGraph = {
      ...createEmptyMixerGraph(),
      channels: [
        {
          id: 'a',
          name: 'A',
          level: 1,
          pan: 0,
          mute: false,
          solo: false,
          busId: 'nope',
        },
      ],
    };
    expect(validateMixerGraph(g).some((e) => /busId/i.test(e))).toBe(true);

    const dup = createDemoMixerGraph();
    dup.channels.push({ ...dup.channels[0]!, id: dup.channels[0]!.id });
    expect(validateMixerGraph(dup).some((e) => /duplicate channel/i.test(e))).toBe(true);
  });

  it('parseMixerGraph round-trips demo JSON', () => {
    const demo = createDemoMixerGraph();
    const parsed = parseMixerGraph(JSON.parse(JSON.stringify(demo)));
    expect(parsed.ok).toBe(true);
    expect(parsed.graph?.channels).toHaveLength(demo.channels.length);
    expect(findMixerBus(parsed.graph!, 'main')?.kind).toBe('main');
  });

  it('clamp helpers bound level and pan', () => {
    expect(clampLevel(-1)).toBe(0);
    expect(clampLevel(99)).toBe(4);
    expect(clampPan(-2)).toBe(-1);
    expect(clampPan(2)).toBe(1);
  });
});
