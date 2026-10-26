// ThresholdBar: the in-session over-speed line (SPEC M2-O3). Shows the
// limit on the readout and the quick stepper (+/-5, +/-10, clear) in the
// same quiet row as everything else in Drive mode — no dialogs, no modals.
// The line itself turns red while over; the buzz and the edge flash are
// owned by the data layer, not this component.

import { Unit, convert, unitLabel } from '../core/units';

interface Props {
  /** Limit in km/h (the stepper's grid), or null when no line is set. */
  limitKmh: number | null;
  /** True while the speed is above the line. */
  over: boolean;
  speedMps: number;
  unit: Unit;
  onStep: (deltaKmh: number) => void;
  onClear: () => void;
}

const STEP_BTN =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-neutral-800 px-2 text-sm font-bold tabular-nums text-neutral-200 active:bg-neutral-700';

export function ThresholdBar({ limitKmh, over, speedMps, unit, onStep, onClear }: Props) {
  const unitName = unitLabel(unit);
  const limitText =
    limitKmh === null ? null : `${Math.round(convert(limitKmh / 3.6, unit))} ${unitName}`;

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-1.5"
      data-testid="threshold-bar"
      data-over={String(over)}
    >
      <span
        className={`mr-1 text-sm font-bold tabular-nums ${
          over ? 'text-red-300' : limitText ? 'text-amber-300' : 'text-neutral-500'
        }`}
        data-testid="threshold-label"
      >
        {limitText === null
          ? `Line off — set from ${Math.round(convert(speedMps, unit))} ${unitName}`
          : over
            ? `Over ${limitText}`
            : `Line ${limitText}`}
      </span>
      <button type="button" aria-label="Lower the line by 10" onClick={() => onStep(-10)} className={STEP_BTN} data-testid="threshold-step-n10">
        &minus;10
      </button>
      <button type="button" aria-label="Lower the line by 5" onClick={() => onStep(-5)} className={STEP_BTN} data-testid="threshold-step-n5">
        &minus;5
      </button>
      <button type="button" aria-label="Raise the line by 5" onClick={() => onStep(5)} className={STEP_BTN} data-testid="threshold-step-p5">
        +5
      </button>
      <button type="button" aria-label="Raise the line by 10" onClick={() => onStep(10)} className={STEP_BTN} data-testid="threshold-step-p10">
        +10
      </button>
      <button
        type="button"
        aria-label="Clear the speed line"
        onClick={onClear}
        className={`${STEP_BTN} text-neutral-400`}
        data-testid="threshold-clear"
      >
        &times;
      </button>
    </div>
  );
}
