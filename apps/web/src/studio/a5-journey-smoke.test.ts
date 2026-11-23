/**
 * A5 journey smoke (plan step 6) — headless:
 * connect → route → play → capture → save → reopen
 *
 * Vitest + MockMidiTransport + StudioCommands + injected clock.
 * No real hardware. No clock-forward default change. No SysEx. No built-in mic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { buildPanicMessages } from '@dawlessdaw/devices';
import {
  MockMidiTransport,
  RollingMidiCapture,
  CAPTURE_CLOCKS_PER_BAR,
} from '@dawlessdaw/midi';
import { MidiRoutingEngine, type MidiRoute } from '@dawlessdaw/routing';
import {
  createInjectedClockService,
  captureHintFromClockService,
} from '@dawlessdaw/sequencer';
import {
  createEmptySession,
  exportSessionJson,
  importSessionJson,
} from '@dawlessdaw/sessions';
import { createStudioCommands } from './commands';
import { filterSelectableAudioInputs } from '../recorder/devices';
import { assembleRecoveredTake, type DraftState } from '../recorder/takeStore';
import type { TakeMeta } from '../recorder/types';

const notesRoute = (): MidiRoute => ({
  id: 'a5-notes',
  name: 'Circuit → MPC notes',
  enabled: true,
  sourcePortId: 'mock-circuit-in',
  destinations: [{ portId: 'mock-mpc-out' }],
  channel: { allow: [1], remap: { 1: 9 } },
  // A5: note routes must not enable app clock forward by default
  forwardClock: false,
});

describe('A5 journey smoke (headless)', () => {
  let transport: MockMidiTransport;
  let engine: MidiRoutingEngine;
  let routes: MidiRoute[];
  let roll: RollingMidiCapture;
  let clock: ReturnType<typeof createInjectedClockService>;

  beforeEach(async () => {
    transport = new MockMidiTransport();
    await transport.start();
    engine = new MidiRoutingEngine(transport);
    engine.start();
    routes = [];
    clock = createInjectedClockService({ nowMs: 10_000 });
    roll = new RollingMidiCapture({
      eventCapacity: 512,
      getPosition: () => clock.getMusicalTime(),
      now: () => clock.now(),
    });
    roll.start();
  });

  it('connect → route → play → capture → save → reopen', () => {
    // ── 1. Connect (mock ports) ──────────────────────────────────
    const ports = transport.listPorts();
    expect(ports.some((p) => p.id === 'mock-circuit-in')).toBe(true);
    expect(ports.some((p) => p.id === 'mock-mpc-out')).toBe(true);
    expect(transport.isAvailable()).toBe(true);

    // ── 2. Route via StudioCommands (forwardClock stays off) ─────
    const cmds = createStudioCommands({
      panic: () => {
        engine.allNotesOff();
        for (const msg of buildPanicMessages()) {
          transport.send('mock-mpc-out', new Uint8Array(msg.data));
        }
      },
      getRoutes: () => routes,
      setRoutes: (next) => {
        routes = next;
        engine.setRoutes(next);
      },
      captureRecentBars: (bars) => {
        const hint = captureHintFromClockService(clock);
        return roll.captureLastBars(bars, {
          confidence: hint.confidence,
          status: hint.status,
          bpm: hint.bpm,
          clockDetected: hint.clockDetected,
          position: hint.position,
        });
      },
    });

    expect(cmds.setRoute(notesRoute()).ok).toBe(true);
    expect(routes).toHaveLength(1);
    expect(routes[0]!.forwardClock).not.toBe(true);
    expect(engine.getRoutes().every((r) => r.forwardClock !== true)).toBe(true);

    // ── 3. Play — Start + notes route to MPC ─────────────────────
    transport.clearSent();
    clock.injectStableClock({ bpm: 120, tickCount: 0, bar: 1, beat: 1 });
    transport.inject('mock-circuit-in', [0xfa]); // Start
    transport.inject('mock-circuit-in', [0x90, 60, 100]); // note on
    const played = transport.getSent().filter((s) => s.portId === 'mock-mpc-out');
    expect(played.length).toBeGreaterThan(0);
    const noteOut = played.find((s) => (s.data[0]! & 0xf0) === 0x90);
    expect(noteOut).toBeTruthy();
    // Channel remap 1→9
    expect(noteOut!.data[0]! & 0x0f).toBe(8);

    // Feed rolling capture (incoming + outbound observation — separate edges)
    const noteIn = transport.inject('mock-circuit-in', [0x90, 62, 90], 10_100);
    roll.observeIncoming(noteIn);
    for (let i = 1; i <= 4; i++) {
      clock.injectStableClock({
        bpm: 120,
        tickCount: i * CAPTURE_CLOCKS_PER_BAR,
        bar: i + 1,
        beat: 1,
      });
      const m = transport.inject(
        'mock-circuit-in',
        [0x90, 36 + i, 80],
        10_100 + i * 50,
      );
      roll.observeIncoming(m);
    }

    // ── 4. Capture last N bars (observation only) ────────────────
    clock.injectStableClock({
      bpm: 120,
      tickCount: 4 * CAPTURE_CLOCKS_PER_BAR,
      bar: 5,
      beat: 1,
    });
    const cap = cmds.captureRecentBars(2);
    expect(cap.ok).toBe(true);
    if (cap.ok && cap.data) {
      expect(cap.data.honesty).toBe('experimental');
      expect(cap.data.requestedBars).toBe(2);
      expect(cap.data.events.length).toBeGreaterThan(0);
      // Did not enable app clock forward as a side effect
      expect(clock.appClockForwarding).toBe(false);
      expect(routes.every((r) => r.forwardClock !== true)).toBe(true);
    }

    // ── 5. Save session JSON (simulation) ────────────────────────
    const session = createEmptySession('A5 journey', true);
    session.notes = 'a5-smoke';
    session.routingPresets = [
      {
        id: 'a5-preset',
        name: 'A5 notes',
        routes: [...routes],
        clockAuthorityPortId: 'mock-circuit-in',
      },
    ];
    const json = exportSessionJson(session);
    expect(json).toContain('A5 journey');
    expect(json).toContain('a5-notes');

    // ── 6. Reopen ────────────────────────────────────────────────
    const reopened = importSessionJson(json);
    expect(reopened.ok).toBe(true);
    expect(reopened.session?.name).toBe('A5 journey');
    expect(reopened.session?.simulation).toBe(true);
    expect(reopened.session?.routingPresets[0]?.routes[0]?.forwardClock).not.toBe(true);
    expect(reopened.session?.arranger.hardwareSceneSync).toBe(false);

    // Restore routes after reopen
    const restored = reopened.session!.routingPresets[0]!.routes;
    expect(cmds.setRoutes(restored).ok).toBe(true);
    expect(routes[0]!.id).toBe('a5-notes');

    // ── Panic: no SysEx ──────────────────────────────────────────
    transport.clearSent();
    const panicResult = cmds.panic();
    expect(panicResult.ok).toBe(true);
    const panicBytes = transport.getSent().flatMap((s) => [...s.data]);
    expect(panicBytes.includes(0xf0)).toBe(false);
    for (const msg of buildPanicMessages()) {
      expect(msg.data[0]! & 0xf0).toBe(0xb0);
      expect([120, 123]).toContain(msg.data[1]);
    }
  });

  it('light interruption recovery + no built-in mic', () => {
    // Cheap A4-style recover stitch (no IndexedDB)
    const meta: TakeMeta = {
      id: 'a5-draft',
      name: 'a5 take',
      createdAt: 1,
      sampleRate: 48000,
      frameCount: 0,
      durationSec: 0,
      channels: 2,
      incomplete: true,
      markers: [],
      tags: {
        recordedAt: '2026-11-23T00:00:00.000Z',
        tempoBpm: 120,
        circuitProject: null,
        studioScene: null,
        inputDeviceName: 'Scarlett 2i2',
      },
    };
    const draft: DraftState = {
      id: 'active',
      takeId: meta.id,
      startedAt: 1,
      meta,
      nextChunkIndex: 1,
    };
    const recovered = assembleRecoveredTake(draft, [
      { index: 0, samples: new Float32Array([0.1, -0.1, 0.2, -0.2]) },
    ]);
    expect(recovered).not.toBeNull();
    expect(recovered!.meta.name).toContain('(recovered)');
    expect(recovered!.meta.incomplete).toBe(true);

    // Built-in mics never selectable
    const filtered = filterSelectableAudioInputs([
      { deviceId: 'mac', label: 'MacBook Pro Microphone' },
      { deviceId: 'iphone', label: 'iPhone Microphone (Continuity)' },
      { deviceId: 'scarlett', label: 'Scarlett 2i2 USB' },
    ]);
    expect(filtered.map((d) => d.deviceId)).toEqual(['scarlett']);
    expect(filterSelectableAudioInputs([{ deviceId: 'x', label: 'MacBook Air Mic' }])).toEqual(
      [],
    );
  });
});
