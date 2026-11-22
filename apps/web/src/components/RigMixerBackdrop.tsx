import { useEffect, useState, type CSSProperties } from 'react';
import { DeviceArt, type DeviceKind } from './DeviceArt';
import {
  getMixerOutLevels,
  subscribeMixerOutLevels,
  type MixerOutLevels,
} from './mixerOutBus';

/**
 * Decorative mixer-out motion behind the rig map — hardware silhouettes that
 * float and bounce with live levels (and a soft idle drift when silent).
 * pointer-events: none; MIDI/routing untouched.
 */

interface Ghost {
  kind: DeviceKind;
  /** CSS left % */
  x: number;
  /** CSS top % */
  y: number;
  /** Width as % of map */
  w: number;
  /** Stagger index for animation delay */
  i: number;
  tone: 'burgundy' | 'mint' | 'bone';
}

const GHOSTS: Ghost[] = [
  { kind: 'circuit', x: -2, y: 8, w: 34, i: 0, tone: 'burgundy' },
  { kind: 'mpc', x: 68, y: -6, w: 24, i: 1, tone: 'bone' },
  { kind: 'sp', x: 82, y: 42, w: 18, i: 2, tone: 'mint' },
  { kind: 'fm1', x: 48, y: 72, w: 32, i: 3, tone: 'burgundy' },
  { kind: 'zed', x: 28, y: 52, w: 22, i: 4, tone: 'mint' },
  { kind: 'scarlett', x: 42, y: 2, w: 18, i: 5, tone: 'bone' },
];

function useMixerLevels(): MixerOutLevels {
  const [levels, setLevels] = useState(getMixerOutLevels);
  useEffect(() => subscribeMixerOutLevels(setLevels), []);
  return levels;
}

export function RigMixerBackdrop({ active }: { active: boolean }) {
  const levels = useMixerLevels();
  if (!active) return null;

  const energy = levels.running ? Math.min(1, levels.energy * 1.35) : 0.22;
  const bounce = 0.92 + energy * 0.28;
  const punch = levels.running && levels.energy > 0.12;

  return (
    <div
      className={`rig-mixer-backdrop${punch ? ' hot' : ''}${levels.running ? ' live' : ''}`}
      style={
        {
          '--mix-l': String(levels.l),
          '--mix-r': String(levels.r),
          '--mix-e': String(energy),
          '--mix-bounce': String(bounce),
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <div className="rig-mixer-wash" />
      <div className="rig-mixer-bars" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => (
          <i
            key={i}
            style={{
              animationDelay: `${(i % 8) * 0.07}s`,
              ['--bar-n' as string]: String(i),
            }}
          />
        ))}
      </div>
      {GHOSTS.map((g) => (
        <div
          key={g.kind}
          className={`rig-ghost tone-${g.tone}`}
          style={{
            left: `${g.x}%`,
            top: `${g.y}%`,
            width: `${g.w}%`,
            animationDelay: `${g.i * 0.28}s`,
            ['--ghost-i' as string]: String(g.i),
          }}
        >
          <DeviceArt kind={g.kind} lit className="rig-ghost-art" />
        </div>
      ))}
    </div>
  );
}
