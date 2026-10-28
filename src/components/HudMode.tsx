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
//
// SPEC M2-O14 adds the windshield quiet pass on top: the chrome fades out
// after 3 s of inactivity (both heroes stay) and any tap brings it back
// with a fresh countdown — HudMode bridges the taps and the document
// visibility to the pure countdown in hudChrome.ts.

import { useEffect, useRef, useState } from 'react';

import { SpeedViewModel } from '../state/useSpeed';
import { SpeedReadout, FixBanner, StationaryChip } from './readout';
import { ToggleBar } from './ToggleBar';
import { createChromeAutoHide, type ChromeAutoHide } from './hudChrome';

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
 *
 * Colour: both direction elements take the app's MUTED token in index.css
 * (SPEC M2-O14 — `--dd-text-3`, the M2-O7 micro-label/tick grey), so the
 * wrapper carries no text colour of its own; suppression keeps its extra
 * dim as opacity on the wrapper.
 */
function HudHeading({ headingDeg, suppressed }: { headingDeg: number | null; suppressed: boolean }) {
  const show = headingDeg !== null && !suppressed;
  return (
    <div
      className={`mt-3 flex flex-col items-center${show ? '' : ' opacity-50'}`}
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
  // Chrome auto-hide state (M2-O14): visible for 3 s after HUD entry, then
  // faded out; a tap anywhere shows it again and restarts the countdown.
  const [chromeHidden, setChromeHidden] = useState(false);
  const autoHide = useRef<ChromeAutoHide | null>(null);
  useEffect(() => {
    const controller = createChromeAutoHide(setChromeHidden);
    autoHide.current = controller;
    // Backgrounding pauses the countdown; coming back counts as a fresh
    // entry (3 s of chrome first). Unmount disposes — no timer outlives
    // the component.
    const onVisibility = () => controller.setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      controller.dispose();
      autoHide.current = null;
    };
  }, []);

  return (
    <div
      className="dd-hud flex min-h-dvh w-full flex-col gap-3 bg-black px-4 pb-4"
      data-testid="hud-root"
      data-chrome={chromeHidden ? 'hidden' : 'visible'}
      // Tap anywhere = show chrome + restart the 3 s. It rides the root as
      // a bubbling pointerdown: no overlay element and no propagation cut,
      // so the tap still reaches whatever it landed on — the mirrored
      // heroes, a toggle, a chip action — and the control's own click
      // fires after the restore.
      onPointerDown={() => autoHide.current?.poke()}
    >
      {/* Chrome, near-zero: one compact row (brand + unit + mode). The
          mode switch is the way out of HUD, the unit switch follows the
          existing unit state — both are the shared ToggleBar, untouched.
          The bottom chip row carries `dd-hud-chrome`; the header is
          targeted by the existing `.dd-hud > header` hook, so neither the
          header's className nor the root's className change. The hero
          container carries neither hook, so it is never in the hidden
          set. */}
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
      <div className="dd-hud-chrome flex flex-col items-center gap-2">
        <StationaryChip state={vm.state} />
        <FixBanner state={vm.state} chip={vm.chip} onAction={vm.allowLocation} />
      </div>
    </div>
  );
}
