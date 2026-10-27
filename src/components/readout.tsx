// Shared presentational readout used by BOTH Drive and HUD mode. This is the
// "one data layer, two screens" contract: the same component tree renders from
// the same DisplayState; HUD mode only adds a CSS mirror transform + palette.
//
// Visual language (SPEC M2-O7): one dark surface system, one signal accent,
// monochrome readout. The big number is the dominant element and carries no
// hue — LIVE is full-strength text, STALE/LOST dim it (the location chips
// keep the colour, because they are the ones asking for attention).

import { useEffect, useRef, useState } from 'react';

import { DisplayState } from '../core/types';
import { Unit, unitLabel } from '../core/units';
import { ChipView } from '../state/locationChip';
import {
  ROLL_REST_BASE,
  RollDirection,
  digitTransition,
  recenterRollPosition,
  rollDirection,
  rollStripCells,
  rollTransform,
  roundSpeed,
  speedDigitSlots,
  stepRollPosition,
  ROLL_DURATION_MS,
  ROLL_STAGGER_MS,
  ROLL_RECENTRE_GRACE_MS,
} from './speedRoll';

interface Props {
  state: DisplayState;
  unit: Unit;
}

/** The 0-9 strip drawn three times (SPEC M2-O5); cell i shows digit i mod 10. */
const STRIP_CELLS = rollStripCells();

/**
 * `prefers-reduced-motion` as React state. Live: a change in the OS setting
 * applies without a reload. False until proven otherwise, so the first frame
 * is already correct on a system that asks for no motion.
 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * One odometer column: a digit-sized window over a vertical 0-9 strip. The
 * strip slides with a CSS transform (GPU-composited, no JS per frame) so the
 * digit rolls instead of swapping.
 *
 * Direction-aware roll (SPEC M2-O5): the strip travels in the travel
 * direction — accelerating climbs (9 wraps up through 0), decelerating
 * descends (0 wraps down through 9) — so the ones column no longer spins
 * backwards every time the middle digit ticks over. The strip carries three
 * copies of 0-9, so a roll can cross the seam in either direction; while at
 * rest the position is recentred onto the middle copy with the transition
 * off, which is an invisible +/−10-cell jump (same digits).
 */
function RollingDigit({
  digit,
  index,
  animate,
  reducedMotion,
  direction,
}: {
  digit: number;
  index: number;
  animate: boolean;
  reducedMotion: boolean;
  direction: RollDirection;
}) {
  // Position = which strip cell sits in the window. Starts at rest on the
  // middle copy: the first paint shows its digit with no spin-in (M1-O8).
  const posRef = useRef(ROLL_REST_BASE + digit);
  const [pos, setPos] = useState(posRef.current);
  const [instant, setInstant] = useState(true);

  useEffect(() => {
    const current = posRef.current;

    // Frozen hold (STALE/LOST) or reduced motion: swap in place, no roll.
    if (!animate || reducedMotion) {
      const rest = ROLL_REST_BASE + digit;
      posRef.current = rest;
      setInstant(true);
      setPos(rest);
      return;
    }

    const target = stepRollPosition(current, digit, direction);
    posRef.current = target;
    setInstant(false);
    setPos(target);

    // Recentre at rest: identical digits, transition off, invisible.
    const timer = setTimeout(() => {
      const next = recenterRollPosition(posRef.current);
      if (next === posRef.current) return;
      posRef.current = next;
      setInstant(true);
      setPos(next);
      requestAnimationFrame(() => setInstant(false));
    }, ROLL_DURATION_MS + index * ROLL_STAGGER_MS + ROLL_RECENTRE_GRACE_MS);

    return () => clearTimeout(timer);
  }, [digit, direction, animate, reducedMotion, index]);

  return (
    <span
      className="relative inline-block overflow-hidden"
      style={{ height: '1em' }}
      data-testid="speed-digit"
      data-digit={digit}
      aria-hidden="true"
    >
      <span
        className="flex flex-col"
        style={{
          transform: rollTransform(pos),
          transition: instant ? 'none' : digitTransition(index, { reducedMotion, animate }),
        }}
      >
        {STRIP_CELLS.map((cell, cellIndex) => (
          <span
            key={cellIndex}
            className="block"
            style={{ height: '1em', lineHeight: '1em' }}
          >
            {cell}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * The rolling speed readout. Renders the displayed speed digit-by-digit (SPEC
 * M1-O8): each digit is a window over a 0-9 strip that slides into place. It
 * animates only to the latest pipeline sample — nothing is invented between
 * fixes — and a frozen STALE/LOST hold passes `animate=false` so held digits
 * never roll. The plain number stays available to screen readers and to the
 * mirrored HUD, which composes this transform with its own scaleX(-1).
 */
function RollingSpeed({ mps, unit, animate }: { mps: number; unit: Unit; animate: boolean }) {
  const reducedMotion = useReducedMotion();
  const digits = speedDigitSlots(mps, unit);
  const text = roundSpeed(mps, unit).toString();

  // Travel direction (SPEC M2-O5): compare with the previous sample. A unit
  // toggle redraws the field with no speed change, so it lands neutral and
  // takes the shortest path — never a spurious full spin.
  const [prevMps, setPrevMps] = useState<number | null>(null);
  useEffect(() => {
    setPrevMps(mps);
  }, [mps]);
  const direction = rollDirection(prevMps, mps);
  // The debug attribute reports the last REAL roll: the transient above
  // settles back to 'neutral' as soon as the sample has been rendered.
  const [lastRoll, setLastRoll] = useState<RollDirection>('neutral');
  useEffect(() => {
    if (direction !== 'neutral') setLastRoll(direction);
  }, [direction]);

  return (
    <span
      className="inline-flex items-baseline"
      data-testid="speed-digits"
      data-value={text}
      data-direction={lastRoll}
    >
      <span className="sr-only">{text}</span>
      {digits.map((digit, index) => (
        <RollingDigit
          key={index}
          digit={digit}
          index={index}
          animate={animate}
          reducedMotion={reducedMotion}
          direction={direction}
        />
      ))}
    </span>
  );
}

/** Fix-state tone for the main readout: monochrome, dimmed as data ages. */
function speedTone(state: DisplayState): string {
  if (state.fixState === 'LIVE') return 'text-[var(--dd-text-1)]';
  if (state.fixState === 'STALE') return 'text-[var(--dd-text-2)]';
  return 'text-[var(--dd-text-3)]'; // LOST: held value, clearly not live
}

export function SpeedReadout({ state, unit }: Props) {
  const frozen = state.confidence === 'frozen' && state.fixState !== 'LIVE';
  return (
    <div className="flex flex-col items-center" data-testid="speed-readout">
      <div
        className={`dd-readout font-semibold tabular-nums leading-none tracking-tight ${speedTone(state)}`}
        data-testid="speed-value"
      >
        {/* Rolls only to the latest sample; a frozen STALE/LOST hold never rolls. */}
        <RollingSpeed mps={state.displaySpeedMps} unit={unit} animate={!frozen} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="dd-micro" data-testid="speed-unit">
          {unitLabel(unit)}
        </span>
        {frozen ? (
          <span className="dd-pill" data-testid="speed-hold">
            held
          </span>
        ) : null}
      </div>
      {frozen ? (
        <div className="sr-only" data-testid="speed-frozen-note">
          Held last known speed
        </div>
      ) : null}
    </div>
  );
}

export function AccuracyChip({ state }: { state: DisplayState }) {
  if (state.accuracyM === null) {
    return (
      <span className="dd-pill" data-testid="accuracy-chip">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--dd-text-3)]" aria-hidden="true" />
        &plusmn;&mdash; m
      </span>
    );
  }
  const good = state.accuracyM <= 10;
  return (
    <span className="dd-pill" data-testid="accuracy-chip" data-good={String(good)}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${good ? 'bg-[var(--dd-text-2)]' : 'bg-[var(--dd-accent)]'}`}
        aria-hidden="true"
      />
      &plusmn;{Math.round(state.accuracyM)} m
    </span>
  );
}

/** Status dot colours: only problems get the signal accent (SPEC M2-O7). */
const CHIP_DOT: Record<string, string> = {
  LOCATION_NEEDED: 'bg-[var(--dd-text-2)]',
  LOCATION_DENIED: 'bg-[var(--dd-accent)]',
  LOCATION_OFF: 'bg-[var(--dd-accent)]',
  SEARCHING: 'bg-[var(--dd-text-3)]',
  SIGNAL_LOST: 'bg-[var(--dd-accent)]',
  NONE: '',
};

const CHIP_ACCENT: Record<string, boolean> = {
  LOCATION_NEEDED: false,
  LOCATION_DENIED: true,
  LOCATION_OFF: true,
  SEARCHING: false,
  SIGNAL_LOST: true,
  NONE: false,
};

const ACTION_LABEL: Record<string, string> = {
  allow: 'Allow',
  retry: 'Retry',
  recheck: 'Re-check',
};

/**
 * The fix-area chip (SPEC M1-O7). One slot, four honest states — LOCATION
 * NEEDED / LOCATION DENIED / LOCATION OFF / SEARCHING / SIGNAL LOST — instead
 * of the old generic NO FIX. The never-fake-0.0 rule is unchanged: this chip
 * only describes the chain, the readout still freezes the last good speed.
 */
export function FixBanner({
  state,
  chip,
  onAction,
}: {
  state: DisplayState;
  chip: ChipView;
  onAction?: () => void;
}) {
  if (chip.state === 'NONE' || chip.label === null) return null;
  const accent = CHIP_ACCENT[chip.state] ?? true;
  return (
    <div
      className={`dd-rise flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl px-4 py-2.5 text-center ${
        accent ? 'dd-card border-[var(--dd-accent)]' : 'dd-card'
      }`}
      data-testid="fix-banner"
      data-chip={chip.state}
    >
      <span
        className={`flex min-w-0 items-center gap-2 text-sm font-bold ${
          accent ? 'text-[var(--dd-accent)]' : 'text-[var(--dd-text-1)]'
        }`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${CHIP_DOT[chip.state] ?? ''}`} aria-hidden="true" />
        <span className="min-w-0 break-words">{chip.label}</span>
      </span>
      {chip.hint ? (
        <span className="min-w-0 basis-full text-xs leading-snug text-[var(--dd-text-2)] sm:basis-auto">
          {chip.hint}
        </span>
      ) : null}
      {chip.action !== null && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="dd-btn dd-btn-primary shrink-0 px-4 text-sm"
          data-testid={`chip-action-${chip.action}`}
        >
          {ACTION_LABEL[chip.action]}
        </button>
      ) : null}
      {/* `state` keeps the banner part of the display-state contract (M1-O7). */}
      <span className="sr-only" data-testid="fix-state">
        {state.fixState}
      </span>
    </div>
  );
}

export function StationaryChip({ state }: { state: DisplayState }) {
  if (!state.isStationary) return null;
  return (
    <span className="dd-pill" data-testid="stationary-chip">
      <span className="dd-live-dot dd-live-dot-idle" aria-hidden="true" />
      parked
    </span>
  );
}
