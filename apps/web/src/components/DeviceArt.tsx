/**
 * Flat drawings of the studio's hardware — layout and proportions follow the
 * real top-down product refs (Circuit Rhythm, MPC One, SP-404MKII, FM1, ZED-10FX).
 * Pads light up (ON colour) when the app sends that device notes; the whole
 * drawing dims when it isn't connected.
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
  circuit: [200, 150],
  mpc: [150, 140],
  sp: [120, 150],
  fm1: [190, 78],
  zed: [150, 130],
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
  className = 'art-pad',
  rowClass,
}: {
  x: number;
  y: number;
  cols: number;
  rows: number;
  size: number;
  gap: number;
  r?: number;
  className?: string;
  /** Optional per-row class (e.g. Circuit cyan / amber bands). */
  rowClass?: (row: number) => string;
}) {
  const out = [];
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < cols; c++) {
      const cls = rowClass ? rowClass(row) : className;
      out.push(
        <rect
          key={`${row}-${c}`}
          className={cls}
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

function Knob({
  x,
  y,
  r,
  tone = 'grey',
}: {
  x: number;
  y: number;
  r: number;
  tone?: 'on' | 'alert' | 'white' | 'grey' | 'blue' | 'yellow';
}) {
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

function KeyCol({
  x,
  y,
  n,
  h,
  gap = 2.5,
  w = 8,
}: {
  x: number;
  y: number;
  n: number;
  h: number;
  gap?: number;
  w?: number;
}) {
  const bh = (h - (n - 1) * gap) / n;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} className="art-key" x={x} y={y + i * (bh + gap)} width={w} height={bh} rx={2} />
      ))}
    </g>
  );
}

function Drawing({ kind }: { kind: DeviceKind }) {
  const [w, h] = VIEW[kind];
  switch (kind) {
    case 'circuit': {
      // Circuit Rhythm: master L/R, 8 staggered macros, 8×4 pads, side columns.
      const padX = 28;
      const padY = 62;
      const padSize = 14;
      const padGap = 3.5;
      return (
        <>
          <Body w={w} h={h} r={12} />
          {/* Master Volume / Master Filter */}
          <Knob x={18} y={22} r={9} tone="white" />
          <Knob x={182} y={22} r={9} tone="on" />
          {/* Staggered macros: bottom row Tune Length Distortion LP; top Start Slope HP Res */}
          {[0, 1, 2, 3].map((i) => (
            <Knob key={`b${i}`} x={48 + i * 28} y={30} r={5.5} tone="grey" />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <Knob key={`t${i}`} x={62 + i * 28} y={14} r={5.5} tone="white" />
          ))}
          {/* Function strip */}
          {Array.from({ length: 10 }, (_, i) => (
            <rect key={`f${i}`} className="art-key" x={18 + i * 16.5} y={44} width={14} height={7} rx={2} />
          ))}
          {/* Track 1–8 headers */}
          {Array.from({ length: 8 }, (_, i) => (
            <rect
              key={`n${i}`}
              className="art-key"
              x={padX + i * (padSize + padGap)}
              y={54}
              width={padSize}
              height={6}
              rx={1.5}
            />
          ))}
          <Pads
            x={padX}
            y={padY}
            cols={8}
            rows={4}
            size={padSize}
            gap={padGap}
            r={3}
            rowClass={(row) => (row < 2 ? 'art-pad art-pad-lo' : 'art-pad art-pad-hi')}
          />
          <KeyCol x={10} y={padY} n={5} h={4 * padSize + 3 * padGap} w={12} />
          <KeyCol x={178} y={padY} n={5} h={4 * padSize + 3 * padGap} w={12} />
        </>
      );
    }
    case 'mpc': {
      // MPC One: screen + 4×4 pads left; Q-Links, buttons, data dial, transport right.
      return (
        <>
          <Body w={w} h={h} r={8} />
          <rect className="art-screen" x={10} y={10} width={62} height={42} rx={3} />
          <Pads x={12} y={58} cols={4} rows={4} size={13} gap={3} r={2.5} />
          {/* Left utility column */}
          <KeyCol x={3} y={58} n={5} h={61} w={7} gap={2} />
          {/* Q-Link knobs */}
          {[0, 1, 2, 3].map((i) => (
            <Knob key={`q${i}`} x={92} y={16 + i * 16} r={6} tone={i === 0 ? 'on' : 'grey'} />
          ))}
          <rect className="art-key" x={104} y={14} width={18} height={8} rx={2} />
          {/* Mode / menu columns */}
          {[0, 1, 2].map((col) =>
            Array.from({ length: 5 }, (_, row) => (
              <rect
                key={`m${col}-${row}`}
                className={`art-key${col === 0 && row === 0 ? ' alert' : ''}`}
                x={112 + col * 12}
                y={28 + row * 11}
                width={10}
                height={8}
                rx={2}
              />
            )),
          )}
          {/* Data dial */}
          <Knob x={128} y={96} r={14} tone="white" />
          <rect className="art-key" x={112} y={112} width={10} height={7} rx={2} />
          <rect className="art-key" x={134} y={112} width={10} height={7} rx={2} />
          {/* Transport */}
          <rect className="art-key alert" x={86} y={124} width={12} height={8} rx={2} />
          <rect className="art-key alert" x={100} y={124} width={12} height={8} rx={2} />
          <rect className="art-key" x={114} y={124} width={10} height={8} rx={2} />
          <rect className="art-key" x={126} y={124} width={10} height={8} rx={2} />
          <rect className="art-key" x={138} y={124} width={10} height={8} rx={2} />
        </>
      );
    }
    case 'sp': {
      // SP-404MKII: 4 knobs, circular OLED + FX ring, function rows, 4×4 pads + side pads.
      return (
        <>
          <Body w={w} h={h} r={8} />
          {[0, 1, 2, 3].map((i) => (
            <Knob key={i} x={18 + i * 28} y={18} r={8} tone={i === 0 ? 'white' : 'alert'} />
          ))}
          {/* Circular OLED */}
          <circle className="art-screen" cx={48} cy={48} r={14} />
          {/* FX buttons around screen */}
          <rect className="art-key" x={8} y={36} width={18} height={7} rx={2} />
          <rect className="art-key" x={8} y={46} width={18} height={7} rx={2} />
          <rect className="art-key" x={8} y={56} width={18} height={7} rx={2} />
          <rect className="art-key" x={70} y={36} width={18} height={7} rx={2} />
          <rect className="art-key" x={70} y={46} width={18} height={7} rx={2} />
          <rect className="art-key" x={70} y={56} width={18} height={7} rx={2} />
          <Knob x={102} y={48} r={5} tone="grey" />
          {/* Function rows */}
          {Array.from({ length: 6 }, (_, i) => (
            <rect key={`r1${i}`} className="art-key" x={8 + i * 17} y={70} width={15} height={6} rx={1.5} />
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <rect
              key={`r2${i}`}
              className={`art-key${i < 3 ? ' alert' : ''}`}
              x={8 + i * 13}
              y={79}
              width={11}
              height={6}
              rx={1.5}
            />
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={`r3${i}`} className="art-key" x={8 + i * 11.5} y={88} width={10} height={6} rx={1.5} />
          ))}
          <Pads x={10} y={98} cols={4} rows={4} size={16} gap={3} r={3} />
          {/* Side performance pads */}
          {[0, 1, 2, 3].map((i) => (
            <rect key={`s${i}`} className="art-key" x={90} y={98 + i * 12} width={22} height={10} rx={2} />
          ))}
        </>
      );
    }
    case 'fm1': {
      // FM1: left 2×2 + OCT, center screen, right macros + 6×2 keys, pill keyboard.
      return (
        <>
          <Body w={w} h={h} r={10} />
          <Knob x={16} y={14} r={5.5} tone="on" />
          <Knob x={32} y={14} r={5.5} tone="on" />
          <Knob x={16} y={30} r={5.5} tone="white" />
          <Knob x={32} y={30} r={5.5} tone="white" />
          <rect className="art-key" x={10} y={40} width={14} height={6} rx={2} />
          <rect className="art-key" x={26} y={40} width={14} height={6} rx={2} />
          <rect className="art-screen" x={52} y={10} width={48} height={36} rx={3} />
          {[0, 1, 2, 3].map((i) => (
            <Knob key={`k${i}`} x={118 + i * 16} y={14} r={5} tone="grey" />
          ))}
          {Array.from({ length: 12 }, (_, i) => {
            const col = i % 6;
            const row = Math.floor(i / 6);
            return (
              <rect
                key={`b${i}`}
                className="art-key"
                x={110 + col * 12}
                y={26 + row * 11}
                width={10}
                height={9}
                rx={2}
              />
            );
          })}
          {/* White pill keys */}
          {Array.from({ length: 14 }, (_, i) => (
            <rect
              key={`w${i}`}
              className="art-pad art-white-key"
              x={10 + i * 12.5}
              y={52}
              width={10}
              height={20}
              rx={4}
            />
          ))}
          {/* Black-key pills in 3-2-3-2 piano grouping */}
          {[0, 1, 2, 3.5, 4.5, 6, 7, 8, 9.5, 10.5].map((i, idx) => (
            <rect
              key={`bk${idx}`}
              className="art-black-key"
              x={16 + i * 12.5}
              y={50}
              width={8}
              height={12}
              rx={3}
            />
          ))}
        </>
      );
    }
    case 'zed': {
      // ZED-10FX: maroon side cheeks, mono/stereo strips, colour-coded knobs, white label bar.
      const strips = 6;
      const sx = 18;
      const sw = 16;
      return (
        <>
          <rect className="art-side" x={2} y={6} width={12} height={h - 20} rx={6} />
          <rect className="art-side" x={w - 14} y={6} width={12} height={h - 20} rx={6} />
          <rect className="art-body" x={12} y={4} width={w - 24} height={h - 18} rx={4} />
          <rect className="art-label-bar" x={12} y={h - 16} width={w - 24} height={12} rx={2} />
          {Array.from({ length: strips }, (_, i) => {
            const x = sx + i * sw;
            const isStereo = i >= 4;
            return (
              <g key={i}>
                <circle className="art-jack" cx={x + 6} cy={12} r={3.5} />
                {!isStereo ? <circle className="art-jack" cx={x + 6} cy={20} r={2.5} /> : null}
                <Knob x={x + 6} y={30} r={3.5} tone="on" />
                <Knob x={x + 6} y={42} r={3.2} tone="blue" />
                {!isStereo ? <Knob x={x + 6} y={52} r={3.2} tone="blue" /> : null}
                <Knob x={x + 6} y={isStereo ? 52 : 62} r={3.2} tone="blue" />
                <Knob x={x + 6} y={72} r={3.2} tone="yellow" />
                <Knob x={x + 6} y={82} r={3} tone="grey" />
                <Knob x={x + 6} y={92} r={3} tone="grey" />
                <Knob x={x + 6} y={104} r={4.5} tone="on" />
              </g>
            );
          })}
          {/* Master / FX column hint */}
          <rect className="art-key" x={118} y={28} width={16} height={48} rx={2} />
          <Knob x={126} y={92} r={5} tone="white" />
          <Knob x={126} y={108} r={6} tone="on" />
        </>
      );
    }
    case 'mac':
      return (
        <>
          <rect className="art-body" x={14} y={4} width={102} height={66} rx={7} />
          <rect className="art-screen" x={20} y={10} width={90} height={54} rx={3} />
          <text className="art-label" x={65} y={36} textAnchor="middle">
            splot /
          </text>
          <text className="art-label" x={65} y={48} textAnchor="middle">
            midi brain
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
          <Knob x={72} y={25} r={8} tone="alert" />
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
