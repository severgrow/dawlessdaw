import { describe, it, expect } from 'vitest';
import type { MidiPortInfo } from '@dawlessdaw/core';
import {
  assignPort,
  classifyMidiPort,
  formatMidiPortPickerLabel,
  isBareVirtualMidiPort,
  looksLikeAkaiMpcUsbPort,
  looksLikeIacPort,
  looksLikeMidiInterfaceOut,
  looksLikeNetworkMidiPort,
  lostAssignedOutputPortIds,
  matchPortsToRoles,
  mpcClockPortAdvice,
  unmatchedConnectedPorts,
} from './port-matcher';

const baseStudio: MidiPortInfo[] = [
  { id: 'c-in', name: 'Circuit Rhythm MIDI', type: 'input', state: 'connected' },
  { id: 'c-out', name: 'Circuit Rhythm MIDI', type: 'output', state: 'connected' },
  { id: 's-in', name: 'SP-404MKII', type: 'input', state: 'connected' },
  { id: 's-out', name: 'SP-404MKII', type: 'output', state: 'connected' },
  { id: 'f-in', name: 'Felucca', type: 'input', state: 'connected' },
  { id: 'f-out', name: 'Felucca', type: 'output', state: 'connected' },
];

describe('Phase B Network MIDI classification', () => {
  it('classifies Scarlett / Akai USB / Network / IAC', () => {
    expect(classifyMidiPort('Scarlett 2i4 USB')).toBe('interface-din');
    expect(classifyMidiPort('MPC One')).toBe('akai-usb');
    expect(classifyMidiPort('Akai Professional MPC One')).toBe('akai-usb');
    expect(classifyMidiPort('Network Session 1')).toBe('network');
    expect(classifyMidiPort('Akai Network MIDI')).toBe('network');
    expect(classifyMidiPort('IAC Driver Bus 1')).toBe('iac');
    expect(classifyMidiPort('Mystery Box')).toBe('unknown');
  });

  it('Network / IAC are not interface-din and not USB-B', () => {
    expect(looksLikeMidiInterfaceOut('Network Session 1')).toBe(false);
    expect(looksLikeMidiInterfaceOut('IAC Driver Bus 1')).toBe(false);
    expect(looksLikeAkaiMpcUsbPort('Network Session 1')).toBe(false);
    expect(looksLikeAkaiMpcUsbPort('Akai Network MIDI')).toBe(false);
    expect(looksLikeAkaiMpcUsbPort('IAC Driver Bus 1')).toBe(false);
    expect(looksLikeNetworkMidiPort('Akai Network MIDI')).toBe(true);
    expect(looksLikeIacPort('IAC Driver Bus 1')).toBe(true);
  });

  it('picker labels tag DIN vs USB-B vs Network/IAC', () => {
    expect(formatMidiPortPickerLabel('Scarlett 2i4 USB')).toContain('Scarlett DIN');
    expect(formatMidiPortPickerLabel('MPC One')).toContain('USB-B');
    expect(formatMidiPortPickerLabel('Network Session 1')).toContain('Network MIDI');
    expect(formatMidiPortPickerLabel('IAC Driver Bus 1')).toContain('IAC');
  });

  it('clock advice warns on Network / IAC without claiming DIN', () => {
    expect(mpcClockPortAdvice('Network Session 1').kind).toBe('warn-network');
    expect(mpcClockPortAdvice('IAC Driver Bus 1').kind).toBe('warn-iac');
    expect(mpcClockPortAdvice('Scarlett 2i4 USB').kind).toBe('ok-interface');
    expect(mpcClockPortAdvice('MPC One').kind).toBe('warn-akai-usb');
  });
});

describe('Phase B auto-assign guards', () => {
  it('never auto-assigns bare IAC / Network Session to any role', () => {
    const ports: MidiPortInfo[] = [
      ...baseStudio,
      { id: 'iac-in', name: 'IAC Driver Bus 1', type: 'input', state: 'connected' },
      { id: 'iac-out', name: 'IAC Driver Bus 1', type: 'output', state: 'connected' },
      { id: 'net-in', name: 'Network Session 1', type: 'input', state: 'connected' },
      { id: 'net-out', name: 'Network Session 1', type: 'output', state: 'connected' },
    ];
    expect(isBareVirtualMidiPort('IAC Driver Bus 1')).toBe(true);
    expect(isBareVirtualMidiPort('Network Session 1')).toBe(true);
    expect(isBareVirtualMidiPort('Akai Network MIDI')).toBe(false);

    const a = matchPortsToRoles(ports);
    expect(a.every((x) => x.inputPortId !== 'iac-in' && x.outputPortId !== 'iac-out')).toBe(true);
    expect(a.every((x) => x.inputPortId !== 'net-in' && x.outputPortId !== 'net-out')).toBe(true);
    const um = unmatchedConnectedPorts(ports, a).map((p) => p.id).sort();
    expect(um).toEqual(['iac-in', 'iac-out', 'net-in', 'net-out']);
  });

  it('Akai Network MIDI auto-binds to MPC only (not Circuit/SP/FM1)', () => {
    const ports: MidiPortInfo[] = [
      ...baseStudio,
      { id: 'an-in', name: 'Akai Network MIDI', type: 'input', state: 'connected' },
      { id: 'an-out', name: 'Akai Network MIDI', type: 'output', state: 'connected' },
    ];
    const a = matchPortsToRoles(ports);
    expect(a.find((x) => x.roleId === 'mpc')).toMatchObject({
      inputPortId: 'an-in',
      outputPortId: 'an-out',
    });
    expect(a.find((x) => x.roleId === 'circuit')?.inputPortId).toBe('c-in');
    expect(a.find((x) => x.roleId === 'sp404')?.outputPortId).toBe('s-out');
    expect(a.find((x) => x.roleId === 'fm1')?.outputPortId).toBe('f-out');
  });

  it('manual IAC assignment is preserved across rematch (disconnect remember)', () => {
    const ports: MidiPortInfo[] = [
      ...baseStudio,
      { id: 'iac-out', name: 'IAC Driver Bus 1', type: 'output', state: 'connected' },
    ];
    let a = matchPortsToRoles(ports);
    a = assignPort(a, 'mpc', 'output', 'iac-out', ports);
    expect(a.find((x) => x.roleId === 'mpc')?.outputManual).toBe(true);

    const unplugged = ports.filter((p) => p.id !== 'iac-out');
    const after = matchPortsToRoles(unplugged, a);
    const mpc = after.find((x) => x.roleId === 'mpc')!;
    expect(mpc.outputPortId).toBeNull();
    expect(mpc.outputManual).toBe(true);
    expect(mpc.outputPortName).toBe('IAC Driver Bus 1');

    const back = matchPortsToRoles(ports, after);
    expect(back.find((x) => x.roleId === 'mpc')?.outputPortId).toBe('iac-out');
  });

  it('lostAssignedOutputPortIds lists unplugged assigned outs for panic', () => {
    const prev = new Set(['c-out', 'iac-out', 's-out']);
    const now = new Set(['c-out', 's-out']);
    const lost = lostAssignedOutputPortIds(prev, now, [
      { outputPortId: 'iac-out' },
      { outputPortId: 's-out' },
      { outputPortId: null },
    ]);
    expect(lost).toEqual(['iac-out']);
  });
});
