// HeadingTape: the full-width scrolling compass tape for Drive mode
// (SPEC M2-O6). The rose is drawn as a horizontal strip — a tick every 10°,
// a label every 45° across the full 8-point compass — and the strip slides
// under a fixed centre index, so the heading you are on is always in the
// middle and the horizon scrolls past as you turn.
//
// Scroll direction is the owner-corrected compass-card direction (SPEC
// M2-O10, amended): the rose reads E-N-W (degrees increase to the LEFT of
// the index), so a rising heading slides the strip RIGHT and a falling one
// slides it LEFT — the mark you turn toward walks in from the LEFT edge to
// the index. The follow stays continuous across the 0°/360° seam so a north
// crossing never lurches the tape a whole copy-width the wrong way.
//
// The strip is drawn three times (-360°, 0°, +360°), so the visible window
// never reaches the 0°/360° seam: the wrap is seamless by construction and
// there is no modulo reset to flicker (tapeMath.ts). Below the speed gate
// the tape follows the phone's own compass when there is one (SPEC M2-O9,
// dimmed — attitude, not direction of travel) and otherwise holds its last
// heading, dims, and reads "— heading —" instead of showing noise. HUD mode
// keeps the small arrow: the windshield stays about speed.

import { useEffect, useRef } from 'react';
import { HeadingSource } from '../session/heading';
import {
  TAPE_EASING,
  TAPE_FOLLOW_MS,
  TAPE_SAFE_BAND_PX,
  foldTranslateX,
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
  /**
   * Which source the heading came from (SPEC M2-O9). Rendered as a
   * data-attribute only — the drive test reads it to prove the parked
   * compass path and the driving course path without opening the overlay.
   */
  source?: HeadingSource;
}

/** Tape content is static (3 copies of the rose); build it once. */
const TAPE_CONTENT = tapeItems();

export function HeadingTape({
  headingDeg,
  suppressed,
  dimmed = false,
  source = null,
}: Props) {
  const hasCourse = headingDeg !== null && Number.isFinite(headingDeg);
  const heading = hasCourse ? (headingDeg ?? 0) : 0;
  const readout = tapeReadout(headingDeg);
  // Ticks, index and readout all quiet out while suppressed OR while the fix
  // is a STALE/LOST hold — a held heading must not read as a live one.
  const quiet = suppressed || dimmed;

  // Seam-safe follow (SPEC M2-O10). The pipeline heading wraps into [0, 360),
  // so a naive heading·px-per-deg transform jumps a whole copy-width at every
  // north crossing and the 250 ms CSS transition lurches the tape the wrong
  // way (owner report: "when I move left, it scrolls left"). Instead we keep
  // the RAW transform continuous by picking the tape copy nearest the previous
  // frame, so a turn always slides content the owner-corrected way — heading
  // up -> content right, heading down -> content left — including across the
  // seam. A rare whole-copy fold (visually identical) stops a long net turn from
  // walking the window off the drawn copies; it is applied with the follow
  // transition suppressed so it never shows as motion. The previous translate
  // is committed in an effect (not during render) so StrictMode's double
  // render stays stable.
  const prevTranslateRef = useRef(0);
  const rawTranslateX = tapeTranslateX(heading, prevTranslateRef.current);
  const translateX = foldTranslateX(rawTranslateX, TAPE_SAFE_BAND_PX);
  const folded = translateX !== rawTranslateX;
  useEffect(() => {
    prevTranslateRef.current = translateX;
  }, [translateX]);

  return (
    <div
      className="-mx-4 select-none"
      data-testid="heading-tape"
      data-suppressed={String(suppressed)}
      data-dimmed={String(dimmed)}
      data-source={source ?? 'none'}
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
            transform: `translateX(${translateX}px)`,
            transition: folded
              ? 'none'
              : `transform ${TAPE_FOLLOW_MS}ms ${TAPE_EASING}`,
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
