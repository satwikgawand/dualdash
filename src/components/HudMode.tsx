// HUD mode: mirrored night rendering for windshield reflection. Pure CSS
// transform mirror (stack.md R4). Black background (OLED power + legibility,
// gps-speed.md section 7.3). One dominant bright readout. Same data layer as
// Drive mode — only the wrapper differs.

import { SpeedViewModel } from '../state/useSpeed';
import { SpeedReadout, FixBanner, StationaryChip } from './readout';
import { ToggleBar } from './ToggleBar';

interface Props {
  vm: SpeedViewModel;
}

export function HudMode({ vm }: Props) {
  return (
    <div className="flex min-h-dvh w-full flex-col gap-4 bg-black p-4" data-testid="hud-root">
      <ToggleBar vm={vm} />
      {/* Mirror flip: scaleX(-1). Kept as a transform so it is GPU-cheap. */}
      <div
        className="flex flex-1 flex-col items-center justify-center"
        style={{ transform: 'scaleX(-1)' }}
        data-testid="hud-mirror"
      >
        <SpeedReadout state={vm.state} unit={vm.unit} />
      </div>
      <div className="flex flex-col items-center gap-2">
        <StationaryChip state={vm.state} />
        <FixBanner state={vm.state} chip={vm.chip} onAction={vm.allowLocation} />
      </div>
    </div>
  );
}
