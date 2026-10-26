// CompassRing: the rotating compass rose for Drive mode (SPEC M2-O4).
// The ring turns under a fixed emerald index mark at the top — the heading
// you are on always points at the index. Below the ring, the label reads
// "N 354°" or "--" when suppressed (low speed / no course), and the rose
// dims while held so a stale orientation never reads as live data.

import { compassLabel } from '../core/units';

interface Props {
  /** Smoothed heading in degrees (held while suppressed). */
  headingDeg: number | null;
  /** True when the course is unreliable (below the speed gate). */
  suppressed: boolean;
}

const SIZE = 96;
const C = SIZE / 2; // centre
const RING_R = 38;
const TICK_OUT = RING_R;
const TICK_IN = 33;
const MAJOR_TICK_IN = 28;
const LETTER_R = 20;

const CARDINALS: Array<{ deg: number; label: string }> = [
  { deg: 0, label: 'N' },
  { deg: 90, label: 'E' },
  { deg: 180, label: 'S' },
  { deg: 270, label: 'W' },
];

function pointOnCircle(deg: number, r: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: C + r * Math.sin(rad), y: C - r * Math.cos(rad) };
}

/** Minor ticks every 30°; the four cardinals get a longer, brighter tick. */
const MINOR_TICKS = [30, 60, 120, 150, 210, 240, 300, 330];

export function CompassRing({ headingDeg, suppressed }: Props) {
  const heading = headingDeg !== null && Number.isFinite(headingDeg) ? headingDeg : 0;
  const label = suppressed || headingDeg === null
    ? '--'
    : `${compassLabel(headingDeg)} ${Math.round(heading)}°`;

  return (
    <div className="flex flex-col items-center gap-1" data-testid="compass">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={
          headingDeg === null || suppressed
            ? 'Compass unavailable'
            : `Compass heading ${Math.round(headingDeg)} degrees`
        }
        className={suppressed ? 'opacity-40' : ''}
        data-testid="compass-ring"
        data-suppressed={String(suppressed)}
      >
        {/* The rose: rotates by -heading so the heading sits at the index. */}
        <g transform={`rotate(${-heading} ${C} ${C})`}>
          <circle
            cx={C}
            cy={C}
            r={RING_R}
            fill="none"
            stroke="currentColor"
            className="text-neutral-700"
            strokeWidth={1}
          />
          {MINOR_TICKS.map((deg) => {
            const a = pointOnCircle(deg, TICK_OUT);
            const b = pointOnCircle(deg, TICK_IN);
            return (
              <line
                key={deg}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="currentColor"
                className="text-neutral-600"
                strokeWidth={1}
              />
            );
          })}
          {CARDINALS.map(({ deg, label: text }) => {
            const a = pointOnCircle(deg, TICK_OUT);
            const b = pointOnCircle(deg, MAJOR_TICK_IN);
            const l = pointOnCircle(deg, LETTER_R);
            return (
              <g key={text}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="currentColor"
                  className={text === 'N' ? 'text-neutral-300' : 'text-neutral-500'}
                  strokeWidth={1.5}
                />
                <text
                  x={l.x}
                  y={l.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12}
                  fontWeight={700}
                  className={text === 'N' ? 'fill-neutral-100' : 'fill-neutral-500'}
                >
                  {text}
                </text>
              </g>
            );
          })}
        </g>
        {/* Fixed index mark: never rotates. */}
        <polygon points={`${C},3 ${C - 5},12 ${C + 5},12`} className="fill-emerald-400" />
      </svg>
      <div
        className={`text-sm font-semibold tabular-nums ${suppressed ? 'text-neutral-500' : 'text-neutral-300'}`}
        data-testid="compass-label"
      >
        {label}
      </div>
    </div>
  );
}
