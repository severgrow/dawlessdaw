/**
 * Flat, friendly drawings of the studio's hardware (not product photos — just
 * enough shape to recognise each box at a glance). Pads flash mint when the app
 * sends that device notes; the whole drawing dims when it isn't connected.
 */

export type DeviceKind = 'circuit' | 'mpc' | 'sp' | 'fm1' | 'zed' | 'mac' | 'scarlett' | 'thru';

interface Props {
  kind: DeviceKind;
  /** Device has a port and is reachable. */
  lit?: boolean;
  /** Timestamp of the last note — changing it replays the pad flash. */
  pulse?: number;
  className?: string;
  title?: string;
}

const VIEW: Record<DeviceKind, [number, number]> = {
  circuit: [200, 110],
  mpc: [150, 130],
  sp: [120, 140],
  fm1: [170, 70],
  zed: [140, 120],
  mac: [130, 90],
  scarlett: [110, 50],
  thru: [80, 44],
};

function Pads({
  x,
  y,
  cols,
  rows,
  size,
  gap,
  r = 3,
}: {
  x: number;
  y: number;
  cols: number;
  rows: number;
  size: number;
  gap: number;
  r?: number;
}) {
  const out = [];
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < cols; c++) {
      out.push(
        <rect
          key={`${row}-${c}`}
          className="art-pad"
          x={x + c * (size + gap)}
          y={y + row * (size + gap)}
          width={size}
          height={size}
          rx={r}
          style={{ animationDelay: `${((row * cols + c) % 7) * 18}ms` }}
        />,
      );
    }
  }
  return <g>{out}</g>;
}

function Knob({ x, y, r, tone = 'grey' }: { x: number; y: number; r: number; tone?: 'mint' | 'wine' | 'white' | 'grey' }) {
  return (
    <g className={`art-knob art-knob-${tone}`}>
      <circle cx={x} cy={y} r={r} />
      <line x1={x} y1={y} x2={x} y2={y - r * 0.7} />
    </g>
  );
}

function Body({ w, h, r = 10 }: { w: number; h: number; r?: number }) {
  return <rect className="art-body" x={2} y={2} width={w - 4} height={h - 4} rx={r} />;
}

function Drawing({ kind }: { kind: DeviceKind }) {
  const [w, h] = VIEW[kind];
  switch (kind) {
    case 'circuit':
      // Circuit Rhythm: 8 knobs on top, 8×4 pad grid, side buttons.
      return (
        <>
          <Body w={w} h={h} />
          {Array.from({ length: 8 }, (_, i) => (
            <Knob key={i} x={34 + i * 18} y={20} r={6} tone={i < 4 ? 'mint' : 'white'} />
          ))}
          <Pads x={25} y={36} cols={8} rows={4} size={14} gap={4} />
          <rect className="art-key" x={10} y={36} width={8} height={68} rx={3} />
          <rect className="art-key" x={182} y={36} width={8} height={68} rx={3} />
        </>
      );
    case 'mpc':
      // MPC One: screen top-left, 4×4 pads right, knobs.
      return (
        <>
          <Body w={w} h={h} />
          <rect className="art-screen" x={12} y={12} width={58} height={40} rx={4} />
          <Knob x={24} y={72} r={8} tone="white" />
          <Knob x={52} y={72} r={8} tone="grey" />
          <rect className="art-key" x={14} y={92} width={22} height={8} rx={3} />
          <rect className="art-key wine" x={42} y={92} width={22} height={8} rx={3} />
          <rect className="art-key" x={14} y={106} width={50} height={10} rx={3} />
          <Pads x={78} y={12} cols={4} rows={4} size={13} gap={3.5} />
          <rect className="art-key" x={78} y={84} width={60} height={8} rx={3} />
          <rect className="art-key" x={78} y={98} width={60} height={20} rx={4} />
        </>
      );
    case 'sp':
      // SP-404MKII: effect knobs top, small screen, 4×4 pads.
      return (
        <>
          <Body w={w} h={h} />
          <Knob x={24} y={20} r={7} tone="wine" />
          <Knob x={48} y={20} r={7} tone="wine" />
          <Knob x={72} y={20} r={7} tone="wine" />
          <Knob x={96} y={20} r={7} tone="white" />
          <rect className="art-screen" x={14} y={34} width={58} height={16} rx={3} />
          <rect className="art-key" x={78} y={36} width={28} height={12} rx={3} />
          <Pads x={18} y={58} cols={4} rows={4} size={18} gap={3.5} r={4} />
        </>
      );
    case 'fm1':
      // FM1: four knobs and a small keyboard.
      return (
        <>
          <Body w={w} h={h} r={8} />
          <Knob x={20} y={18} r={6} tone="mint" />
          <Knob x={38} y={18} r={6} tone="mint" />
          <Knob x={56} y={18} r={6} tone="white" />
          <Knob x={74} y={18} r={6} tone="white" />
          <rect className="art-screen" x={92} y={10} width={64} height={16} rx={3} />
          {Array.from({ length: 13 }, (_, i) => (
            <rect key={i} className="art-pad art-white-key" x={10 + i * 11.5} y={34} width={10} height={28} rx={2} />
          ))}
          {[0, 1, 3, 4, 5, 7, 8, 10, 11].map((i) => (
            <rect key={`b${i}`} className="art-black-key" x={17 + i * 11.5} y={34} width={7} height={16} rx={1.5} />
          ))}
        </>
      );
    case 'zed':
      // ZED-10FX: channel strips with knobs and faders.
      return (
        <>
          <Body w={w} h={h} r={8} />
          {Array.from({ length: 6 }, (_, i) => (
            <g key={i}>
              <Knob x={20 + i * 20} y={18} r={5} tone={i === 5 ? 'wine' : 'grey'} />
              <Knob x={20 + i * 20} y={36} r={5} tone="grey" />
              <rect className="art-key" x={18 + i * 20} y={52} width={4} height={54} rx={2} />
              <rect className="art-fader" x={13 + i * 20} y={70 - (i % 3) * 8} width={14} height={8} rx={2} />
            </g>
          ))}
        </>
      );
    case 'mac':
      return (
        <>
          <rect className="art-body" x={14} y={4} width={102} height={66} rx={7} />
          <rect className="art-screen" x={20} y={10} width={90} height={54} rx={3} />
          <text className="art-label" x={65} y={41} textAnchor="middle">
            dawless/daw
          </text>
          <path className="art-body" d="M2 74 h126 l-8 12 h-110 z" />
        </>
      );
    case 'scarlett':
      return (
        <>
          <Body w={w} h={h} r={8} />
          <circle className="art-jack" cx={22} cy={25} r={9} />
          <circle className="art-jack" cx={46} cy={25} r={9} />
          <Knob x={72} y={25} r={8} tone="wine" />
          <Knob x={94} y={25} r={6} tone="grey" />
        </>
      );
    case 'thru':
      return (
        <>
          <Body w={w} h={h} r={6} />
          {[0, 1, 2].map((i) => (
            <circle key={i} className="art-jack" cx={18 + i * 22} cy={22} r={7} />
          ))}
        </>
      );
  }
}

export function DeviceArt({ kind, lit = true, pulse = 0, className = '', title }: Props) {
  const [w, h] = VIEW[kind];
  return (
    <svg
      className={`device-art ${lit ? 'lit' : 'unlit'} ${className}`}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={title ?? kind}
    >
      {title ? <title>{title}</title> : null}
      {/* key change remounts the group so the pad flash replays */}
      <g key={pulse} className={pulse ? 'art-hit' : ''}>
        <Drawing kind={kind} />
      </g>
    </svg>
  );
}

export const DEVICE_ART_SIZE = VIEW;
