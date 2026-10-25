// Drive mode: the glanceable dashboard. Huge primary speed, trip counters,
// accuracy chip, unit + mode toggles, trip start/stop. Mobile-first, >=44px
// targets, no horizontal scroll. The debug overlay (SPEC O4) carries the
// drive-test instrumentation: raw vs smoothed speed, fix state, fix interval.

import { SpeedViewModel } from '../state/useSpeed';
import {
  AccuracyChip,
  FixBanner,
  HeadingReadout,
  SpeedReadout,
  StationaryChip,
} from './readout';
import { TripPanel } from './TripPanel';
import { ToggleBar } from './ToggleBar';

interface Props {
  vm: SpeedViewModel;
}

export function DriveMode({ vm }: Props) {
  return (
    <div className="flex min-h-dvh w-full flex-col gap-4 bg-neutral-950 p-4 text-white">
      <ToggleBar vm={vm} />

      <div className="flex flex-col items-center gap-2 py-4">
        <SpeedReadout state={vm.state} unit={vm.unit} />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <AccuracyChip state={vm.state} />
          <StationaryChip state={vm.state} />
          <HeadingReadout state={vm.state} />
        </div>
      </div>

      <FixBanner state={vm.state} />

      <TripPanel vm={vm} />

      <DebugOverlay vm={vm} />
    </div>
  );
}

function DebugOverlay({ vm }: { vm: SpeedViewModel }) {
  const d = vm.debug;
  return (
    <div
      className="mt-auto rounded-lg bg-neutral-900 p-3 font-mono text-xs text-neutral-400"
      data-testid="debug-overlay"
    >
      <div className="mb-1 font-semibold text-neutral-300">DRIVE-TEST DEBUG (SPEC O4)</div>
      <div>raw: {d.rawSpeedMps === null ? 'n/a' : `${d.rawSpeedMps.toFixed(2)} m/s`}</div>
      <div>smoothed: {vm.state.displaySpeedMps.toFixed(2)} m/s ({vm.state.confidence})</div>
      <div>
        fix state: {vm.state.fixState} age:{' '}
        {vm.state.fixAgeMs === null ? '∞' : `${Math.round(vm.state.fixAgeMs)} ms`}
      </div>
      <div>
        fixes: {d.fixCount} last interval:{' '}
        {d.lastIntervalMs === null ? 'n/a' : `${Math.round(d.lastIntervalMs)} ms`}
      </div>
      <div>stationary: {String(vm.state.isStationary)}</div>
      {vm.error ? <div className="text-red-400">error: {vm.error}</div> : null}
    </div>
  );
}
