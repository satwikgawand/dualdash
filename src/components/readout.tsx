// Shared presentational readout used by BOTH Drive and HUD mode. This is the
// "one data layer, two screens" contract: the same component tree renders from
// the same DisplayState; HUD mode only adds a CSS mirror transform + palette.

import { DisplayState } from '../core/types';
import { Unit, compassLabel, convert, unitLabel } from '../core/units';
import { ChipView } from '../state/locationChip';

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

/**
 * The fix-area chip (SPEC M1-O7). One slot, four honest states — LOCATION
 * NEEDED / LOCATION DENIED / LOCATION OFF / SEARCHING / SIGNAL LOST — instead
 * of the old generic NO FIX. The never-fake-0.0 rule is unchanged: this chip
 * only describes the chain, the readout still freezes the last good speed.
 */
const CHIP_TONE: Record<string, string> = {
  LOCATION_NEEDED: 'bg-sky-700 text-white',
  LOCATION_DENIED: 'bg-red-700 text-white',
  LOCATION_OFF: 'bg-amber-600 text-black',
  SEARCHING: 'bg-neutral-800 text-sky-200',
  SIGNAL_LOST: 'bg-amber-600 text-black',
  NONE: '',
};

const ACTION_LABEL: Record<string, string> = {
  allow: 'Allow',
  retry: 'Retry',
  recheck: 'Re-check',
};

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
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-md px-4 py-2 text-center font-semibold ${CHIP_TONE[chip.state] ?? 'bg-amber-600 text-black'}`}
      data-testid="fix-banner"
      data-chip={chip.state}
    >
      <span className="min-w-0 break-words">{chip.label}</span>
      {chip.hint ? (
        <span className="min-w-0 basis-full text-xs font-normal opacity-90 sm:basis-auto">
          {chip.hint}
        </span>
      ) : null}
      {chip.action !== null && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="min-h-11 shrink-0 rounded-full bg-white/95 px-4 text-sm font-bold text-neutral-900 active:bg-white"
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
