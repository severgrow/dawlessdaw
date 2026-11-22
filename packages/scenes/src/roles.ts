import type { DeviceId, MusicalRole, RoleBinding, RoleId } from '@dawlessdaw/core';

/**
 * Logical musical roles resolving Circuit tracks → roles → destinations.
 * This is Dawlessdaw-level routing semantics, not hardware Scene Sync.
 */
export class RoleResolver {
  private bindings = new Map<RoleId, RoleBinding>();

  setBindings(bindings: RoleBinding[]): void {
    this.bindings.clear();
    for (const b of bindings) this.bindings.set(b.roleId, { ...b });
  }

  getBindings(): RoleBinding[] {
    return [...this.bindings.values()].map((b) => ({
      ...b,
      destinationDeviceIds: [...b.destinationDeviceIds],
      destinationPortIds: [...b.destinationPortIds],
    }));
  }

  resolveByTrack(
    sourceDeviceId: DeviceId,
    track: number,
  ): RoleBinding | undefined {
    return [...this.bindings.values()].find(
      (b) => b.sourceDeviceId === sourceDeviceId && b.sourceTrack === track,
    );
  }

  resolveByRole(role: MusicalRole): RoleBinding[] {
    return this.getBindings().filter((b) => b.role === role);
  }

  /** Default Circuit Rhythm track → role map (logical, untested on hardware). */
  static defaultCircuitBindings(circuitId: DeviceId): RoleBinding[] {
    const tracks: { track: number; role: MusicalRole; label: string }[] = [
      { track: 1, role: 'drums', label: 'Track 1 Drums' },
      { track: 2, role: 'drums', label: 'Track 2 Drums' },
      { track: 3, role: 'sample', label: 'Track 3 Sample' },
      { track: 4, role: 'sample', label: 'Track 4 Sample' },
      { track: 5, role: 'bass', label: 'Track 5 Bass' },
      { track: 6, role: 'keys', label: 'Track 6 Keys' },
      { track: 7, role: 'lead', label: 'Track 7 Lead' },
      { track: 8, role: 'fx', label: 'Track 8 FX' },
    ];
    return tracks.map((t) => ({
      roleId: `circuit-t${t.track}`,
      role: t.role,
      label: t.label,
      sourceDeviceId: circuitId,
      sourceTrack: t.track,
      sourceChannel: t.track,
      destinationDeviceIds: [],
      destinationPortIds: [],
    }));
  }
}
