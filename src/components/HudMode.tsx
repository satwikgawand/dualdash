// HUD mode: mirrored night rendering for windshield reflection. Pure CSS
// transform mirror (stack.md R4). Black background (OLED power + legibility,
// gps-speed.md section 7.3). One dominant bright readout, monochrome like
// Drive mode (SPEC M2-O7) — the windshield stays about speed. Same data layer
// as Drive mode — only the wrapper differs.

import { SpeedViewModel } from '../state/useSpeed';
import { SpeedReadout, FixBanner, StationaryChip } from './readout';
import { ToggleBar } from './ToggleBar';

interface Props {
  vm: SpeedViewModel;
}

/**
 * Tiny heading arrow for HUD mode (SPEC M2-O4, taste call: yes, but only a
 * hint — the windshield stays about speed). It points toward NORTH relative
 * to travel, the same semantics as the N marker on the Drive-mode tape, and
 * sits INSIDE the mirror transform: the container's scaleX(-1) exactly
 * cancels the windshield's reflection flip, so the driver's eye sees this
 * element's own rotation — north must read at -heading (left when heading
 * east). "--" while the course is unreliable (low speed).
 */
function HudHeading({ headingDeg, suppressed }: { headingDeg: number | null; suppressed: boolean }) {
  const show = headingDeg !== null && !suppressed;
  return (
    <div
      className={`mt-6 flex flex-col items-center gap-0.5 ${show ? 'text-[var(--dd-text-2)]' : 'text-[var(--dd-text-3)]'}`}
      data-testid="hud-heading"
      data-suppressed={String(!show)}
    >
      <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true">
        <polygon
          points="9,2 13,15 9,11.5 5,15"
          fill="currentColor"
          style={{
            transform: `rotate(${show ? -(headingDeg ?? 0) : 0}deg)`,
            transformOrigin: 'center',
          }}
        />
      </svg>
      <span className="text-[11px] tabular-nums">{show ? `${Math.round(headingDeg ?? 0)}°` : '--'}</span>
    </div>
  );
}

export function HudMode({ vm }: Props) {
  return (
    <div
      className="dd-hud flex min-h-dvh w-full flex-col gap-3 bg-black px-4 pb-4"
      data-testid="hud-root"
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="dd-micro tracking-[0.22em]">DualDash</span>
          <ToggleBar vm={vm} variant="unit" />
        </div>
        <ToggleBar vm={vm} variant="mode" />
      </header>
      {/* Mirror flip: scaleX(-1). Kept as a transform so it is GPU-cheap. */}
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
