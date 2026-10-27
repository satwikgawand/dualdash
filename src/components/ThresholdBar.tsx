// ThresholdBar: the in-session over-speed line (SPEC M2-O3, restyled
// M2-O7). Shows the limit on the readout and the quick stepper (+/-5,
// +/-10, clear) as quiet 44 px pill controls in the same calm row as
// everything else in Drive mode — no dialogs, no modals. The label turns
// signal-accent while over; the buzz and the edge flash are owned by the
// data layer, not this component.

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

const STEP_BTN = 'dd-btn dd-btn-quiet px-2.5 text-xs tabular-nums';

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
        className={`dd-micro mr-1 tabular-nums ${
          over ? 'text-[var(--dd-accent)]' : 'text-[var(--dd-text-2)]'
        }`}
        data-testid="threshold-label"
      >
        {limitText === null ? (
          <>
            line off
            {/* Portrait keeps the "set from" hint; landscape (SPEC M2-O12)
                drops it so the stepper stays ONE 44 px row on a 360 px-tall
                screen — the line/over label itself is unchanged. */}
            <span className="landscape:hidden">
              {' '}
              &middot; set from {Math.round(convert(speedMps, unit))} {unitName}
            </span>
          </>
        ) : over ? (
          `over ${limitText}`
        ) : (
          `line ${limitText}`
        )}
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
        className="dd-btn dd-btn-quiet px-2.5 text-xs"
        data-testid="threshold-clear"
      >
        &times;
      </button>
    </div>
  );
}
