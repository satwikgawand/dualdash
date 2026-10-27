// HeadingTape: the full-width scrolling compass tape for Drive mode
// (SPEC M2-O6). The rose is drawn as a horizontal strip — a tick every 10°,
// a label every 45° across the full 8-point compass — and the strip slides
// under a fixed centre index, so the heading you are on is always in the
// middle and the horizon scrolls past as you turn.
//
// The strip is drawn three times (-360°, 0°, +360°), so the visible window
// never reaches the 0°/360° seam: the wrap is seamless by construction and
// there is no modulo reset to flicker (tapeMath.ts). Below the speed gate the
// tape holds its last heading, dims, and reads "— heading —" instead of
// showing noise (M2-O4 suppression unchanged). HUD mode keeps the small
// arrow: the windshield stays about speed.

import {
  TAPE_EASING,
  TAPE_FOLLOW_MS,
  tapeItems,
  tapeItemX,
  tapeReadout,
  tapeTranslateX,
} from './tapeMath';

interface Props {
  /** Smoothed heading in degrees (held while suppressed). */
  headingDeg: number | null;
  /** True when the course is unreliable (below the speed gate). */
  suppressed: boolean;
  /**
   * True when the data behind the heading is not live (STALE/LOST hold).
   * The held heading stays visible but dims, so a frozen value never reads
   * as a live measurement — the same honesty rule as the speed readout.
   */
  dimmed?: boolean;
}

/** Tape content is static (3 copies of the rose); build it once. */
const TAPE_CONTENT = tapeItems();

export function HeadingTape({ headingDeg, suppressed, dimmed = false }: Props) {
  const hasCourse = headingDeg !== null && Number.isFinite(headingDeg);
  const heading = hasCourse ? (headingDeg ?? 0) : 0;
  const readout = tapeReadout(headingDeg);
  // Ticks, index and readout all quiet out while suppressed OR while the fix
  // is a STALE/LOST hold — a held heading must not read as a live one.
  const quiet = suppressed || dimmed;

  return (
    <div
      className="-mx-4 select-none"
      data-testid="heading-tape"
      data-suppressed={String(suppressed)}
      data-dimmed={String(dimmed)}
    >
      <div
        className="dd-tape-fade relative h-16 overflow-hidden"
        role="img"
        aria-label={
          hasCourse && !suppressed ? `Heading ${readout}` : 'Heading unavailable'
        }
      >
        {/* The only moving part: the three-copy track. */}
        <div
          className="dd-tape-track absolute left-1/2 top-0 h-full"
          style={{
            transform: `translateX(${tapeTranslateX(heading)}px)`,
            transition: `transform ${TAPE_FOLLOW_MS}ms ${TAPE_EASING}`,
          }}
          data-testid="heading-tape-track"
        >
          {TAPE_CONTENT.map((item) => (
            <div
              key={item.id}
              className={`absolute top-3 flex flex-col items-center ${
                quiet ? 'opacity-40' : ''
              }`}
              style={{ left: tapeItemX(item.deg), transform: 'translateX(-50%)' }}
            >
              <span
                className={
                  item.label
                    ? 'block h-3.5 w-0.5 bg-[var(--dd-text-2)]'
                    : 'block h-2 w-px bg-[var(--dd-text-3)]'
                }
              />
              {item.label ? (
                <span className="dd-micro mt-1.5 text-[var(--dd-text-2)]">{item.label}</span>
              ) : null}
            </div>
          ))}
        </div>

        {/* Fixed centre index: never moves, never scrolls. */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-full -translate-x-1/2">
          <svg
            className={quiet ? 'opacity-50' : ''}
            width="14"
            height="8"
            viewBox="0 0 14 8"
            aria-hidden="true"
          >
            <path d="M0 0 H14 L7 8 Z" fill="var(--dd-accent)" />
          </svg>
          <div
            className={`ml-[6.5px] h-full w-[1.5px] ${quiet ? 'bg-[var(--dd-text-3)]' : 'bg-[var(--dd-accent)]'}`}
          />
        </div>
      </div>

      {/* Centre readout under the index: "N 354°", or the idle state. */}
      <div className="mt-1.5 flex justify-center">
        {hasCourse && !suppressed ? (
          <span
            className={`text-sm font-semibold tabular-nums tracking-wide ${
              quiet ? 'text-[var(--dd-text-3)]' : 'text-[var(--dd-text-1)]'
            }`}
            data-testid="heading-readout"
          >
            {readout}
          </span>
        ) : (
          <span className="dd-micro" data-testid="heading-idle">
            &mdash; heading &mdash;
          </span>
        )}
      </div>
    </div>
  );
}
