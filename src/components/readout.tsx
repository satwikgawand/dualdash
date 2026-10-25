// Shared presentational readout used by BOTH Drive and HUD mode. This is the
// "one data layer, two screens" contract: the same component tree renders from
// the same DisplayState; HUD mode only adds a CSS mirror transform + palette.

import { DisplayState } from '../core/types';
import { Unit, compassLabel, convert, unitLabel } from '../core/units';

interface Props {
  state: DisplayState;
  unit: Unit;
}

function formatSpeed(mps: number, unit: Unit): string {
  return Math.round(convert(mps, unit)).toString();
}

/** Fix-state colour token applied to the main readout. */
function speedTone(state: DisplayState): string {
  if (state.fixState === 'LIVE') return 'text-emerald-300';
  if (state.fixState === 'STALE') return 'text-amber-300';
  return 'text-neutral-500'; // LOST: greyed, value frozen (never 0.0)
}

export function SpeedReadout({ state, unit }: Props) {
  const frozen = state.confidence === 'frozen' && state.fixState !== 'LIVE';
  return (
    <div className="flex flex-col items-center" data-testid="speed-readout">
      <div
        className={`font-bold tabular-nums leading-none ${speedTone(state)}`}
        style={{ fontSize: 'clamp(5rem, 34vw, 14rem)' }}
        data-testid="speed-value"
      >
        {formatSpeed(state.displaySpeedMps, unit)}
      </div>
      <div className="mt-1 text-2xl text-neutral-400" data-testid="speed-unit">
        {unitLabel(unit)}
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
      <span className="rounded-full bg-neutral-800 px-3 py-1 text-sm text-neutral-400" data-testid="accuracy-chip">
        ±— m
      </span>
    );
  }
  const good = state.accuracyM <= 10;
  return (
    <span
      className={`rounded-full px-3 py-1 text-sm ${
        good ? 'bg-emerald-900 text-emerald-200' : 'bg-amber-900 text-amber-200'
      }`}
      data-testid="accuracy-chip"
    >
      ±{Math.round(state.accuracyM)} m
    </span>
  );
}

export function FixBanner({ state }: { state: DisplayState }) {
  if (!state.showNoFix) return null;
  return (
    <div
      className="rounded-md bg-amber-600 px-4 py-2 text-center font-semibold text-black"
      data-testid="fix-banner"
    >
      NO FIX {state.fixState === 'LOST' ? '— SIGNAL LOST' : ''}
    </div>
  );
}

export function HeadingReadout({ state }: { state: DisplayState }) {
  const deg = state.headingDeg;
  const dir = compassLabel(deg);
  return (
    <div className="text-lg text-neutral-300" data-testid="heading-readout">
      {dir ? `${dir} ${Math.round(deg ?? 0)}°` : '—'}
    </div>
  );
}

export function StationaryChip({ state }: { state: DisplayState }) {
  if (!state.isStationary) return null;
  return (
    <span className="rounded-full bg-neutral-700 px-3 py-1 text-sm text-neutral-200" data-testid="stationary-chip">
      PARKED
    </span>
  );
}
