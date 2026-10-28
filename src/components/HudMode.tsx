// HUD mode: mirrored night rendering for windshield reflection. Pure CSS
// transform mirror (stack.md R4). Black background (OLED power + legibility,
// gps-speed.md section 7.3). SPEC M2-O13 turns the two readouts into the
// whole screen: speed as the hero (largest legible digits, HUD-only size
// override in index.css) and the heading as a matching giant compass letter
// + degrees — the phone lies flat on the dash and the driver reads the
// REFLECTION, so chrome stays near-zero (one toggle row + conditional
// chips) and nothing else renders here: no tape, no odometer, no session
// panels. Same data layer as Drive mode — only the wrapper differs; the
// heading is the app's single M2-O11-normalized source (360 − alpha at the
// platform layer), never re-mapped here.

import { SpeedViewModel } from '../state/useSpeed';
import { SpeedReadout, FixBanner, StationaryChip } from './readout';
import { ToggleBar } from './ToggleBar';

interface Props {
  vm: SpeedViewModel;
}

/** The 8-point rose the Drive-mode tape labels (N NE E SE S SW W NW). */
const ROSE = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/**
 * Compass letter for a heading in degrees (SPEC M2-O13). Presentation
 * mapping only: the heading arrives already normalized to the true azimuth
 * by the platform layer (M2-O11, heading = 360 − alpha) and is NEVER
 * re-oriented here — this just buckets it onto the rose, wrapping at 360°
 * (359° -> N, 45° -> NE).
 */
export function compassLetter(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  return ROSE[Math.round(norm / 45) % 8];
}

/**
 * Giant heading readout for HUD mode (SPEC M2-O13): compass letter as the
 * second hero + degrees under it. It sits INSIDE the mirror transform: the
 * container's scaleX(-1) exactly cancels the windshield's reflection flip,
 * so the driver's eye reads both heroes un-mirrored — letters and digits
 * alike. "—"/"--" while the course is unreliable (M2-O4 suppression, below
 * 3 m/s), dimmed so a suppressed value never reads as live.
 */
function HudHeading({ headingDeg, suppressed }: { headingDeg: number | null; suppressed: boolean }) {
  const show = headingDeg !== null && !suppressed;
  return (
    <div
      className={`mt-3 flex flex-col items-center ${show ? 'text-[var(--dd-text-1)]' : 'text-[var(--dd-text-3)]'}`}
      data-testid="hud-heading"
      data-suppressed={String(!show)}
    >
      <span
        className="dd-hud-heading-letter font-bold leading-none"
        data-testid="hud-heading-letter"
      >
        {show ? compassLetter(headingDeg) : '\u2014'}
      </span>
      <span
        className="dd-hud-heading-deg mt-2 font-semibold leading-none tabular-nums"
        data-testid="hud-heading-deg"
      >
        {show ? `${Math.round(headingDeg)}\u00b0` : '--'}
      </span>
    </div>
  );
}

export function HudMode({ vm }: Props) {
  return (
    <div
      className="dd-hud flex min-h-dvh w-full flex-col gap-3 bg-black px-4 pb-4"
      data-testid="hud-root"
    >
      {/* Chrome, near-zero: one compact row (brand + unit + mode). The
          mode switch is the way out of HUD, the unit switch follows the
          existing unit state — both are the shared ToggleBar, untouched. */}
      <header className="flex items-center gap-2">
        <div className="flex flex-1 items-center justify-between gap-2">
          <span className="dd-micro tracking-[0.22em]">DualDash</span>
          <ToggleBar vm={vm} variant="unit" />
        </div>
        <ToggleBar vm={vm} variant="mode" />
      </header>
      {/* Mirror flip: scaleX(-1). Kept as a transform so it is GPU-cheap.
          The windshield reflection reads both heroes correctly (M2-O13). */}
      <div
        className="flex flex-1 flex-col items-center justify-center"
        style={{ transform: 'scaleX(-1)' }}
        data-testid="hud-mirror"
      >
        <SpeedReadout state={vm.state} unit={vm.unit} />
        <HudHeading
          headingDeg={vm.m2.headingDeg}
          suppressed={vm.m2.headingSuppressed}
        />
      </div>
      <div className="flex flex-col items-center gap-2">
        <StationaryChip state={vm.state} />
        <FixBanner state={vm.state} chip={vm.chip} onAction={vm.allowLocation} />
      </div>
    </div>
  );
}
