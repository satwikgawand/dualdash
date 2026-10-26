// Drive mode: the glanceable dashboard. Huge primary speed, accuracy chip,
// unit + mode toggles. Realtime-only: no counters, no controls that persist
// anything (SPEC M1-O5). Mobile-first, >=44px targets, no horizontal scroll.
// The debug overlay (SPEC O4) carries the drive-test instrumentation:
// raw vs smoothed speed, fix state, fix interval.
//
// M2 surfaces (all in normal flow — a chip or a row, never a popup):
// the over-speed line + stepper under the readout (in-session only), the
// rotating compass (replaces the text heading), and the session panel
// (start/stop/pause/summary + the exactly-once suggestion chip).

import { SpeedViewModel } from '../state/useSpeed';
import {
  AccuracyChip,
  FixBanner,
  SpeedReadout,
  StationaryChip,
} from './readout';
import { CompassRing } from './CompassRing';
import { SessionPanel } from './SessionPanel';
import { ThresholdBar } from './ThresholdBar';
import { ToggleBar } from './ToggleBar';

interface Props {
  vm: SpeedViewModel;
}

export function DriveMode({ vm }: Props) {
  const session = vm.m2.session;
  const inSession = session.phase === 'running' || session.phase === 'paused';
  return (
    <div className="flex min-h-dvh w-full flex-col gap-4 bg-neutral-950 p-4 text-white">
      <ToggleBar vm={vm} />

      <div className="flex flex-col items-center gap-2 py-2">
        <SpeedReadout state={vm.state} unit={vm.unit} />
        {/* The over-speed line sits on the readout, in-session only (M2-O3). */}
        {inSession ? (
          <ThresholdBar
            limitKmh={vm.m2.alertLimitKmh}
            over={vm.m2.alertOver}
            speedMps={vm.state.displaySpeedMps}
            unit={vm.unit}
            onStep={vm.m2Actions.stepLimit}
            onClear={vm.m2Actions.clearLimit}
          />
        ) : null}
      </div>

      {/* Compass: the ring rotates under the fixed index mark (SPEC M2-O4). */}
      <div className="flex justify-center">
        <CompassRing
          headingDeg={vm.m2.headingDeg}
          suppressed={vm.m2.headingSuppressed}
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <AccuracyChip state={vm.state} />
        <StationaryChip state={vm.state} />
      </div>

      <SessionPanel
        unit={vm.unit}
        session={session}
        onStart={vm.m2Actions.startSession}
        onStop={vm.m2Actions.stopSession}
        onResume={vm.m2Actions.resumeSession}
        onDismiss={vm.m2Actions.dismissSummary}
        onAcceptSuggestion={vm.m2Actions.acceptSuggestion}
        onDismissSuggestion={vm.m2Actions.dismissSuggestion}
      />

      <FixBanner state={vm.state} chip={vm.chip} onAction={vm.allowLocation} />

      <DebugOverlay vm={vm} />
    </div>
  );
}

function DebugOverlay({ vm }: { vm: SpeedViewModel }) {
  const d = vm.debug;
  const l = vm.location;
  const s = vm.m2.session;
  const permission =
    l.permission === 'granted'
      ? l.precise
        ? 'granted (precise)'
        : 'granted (approximate)'
      : l.permission;
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
      {/* M2 state: the device test reads session + line + heading here. */}
      <div>
        session: {s.phase} dist {s.stats.distanceM.toFixed(0)} m time{' '}
        {Math.round(s.stats.elapsedMs / 1000)} s
      </div>
      <div>
        line: {vm.m2.alertLimitKmh === null ? 'off' : `${vm.m2.alertLimitKmh} km/h`}
        {vm.m2.alertOver ? ' (over)' : ''}
      </div>
      <div>
        heading:{' '}
        {vm.m2.headingSuppressed || vm.m2.headingDeg === null
          ? '--'
          : `${vm.m2.headingDeg.toFixed(0)} deg`}
      </div>
      {/* Location-chain health (SPEC M1-O7): the next device test self-diagnoses. */}
      <div>permission: {permission}</div>
      <div>
        provider:{' '}
        {l.providerEnabled === null ? 'unknown' : l.providerEnabled ? 'on' : 'off'}
      </div>
      <div>watch: {l.watchActive ? 'active' : 'inactive'}</div>
      <div>
        last error:{' '}
        {l.lastErrorCode === null
          ? 'none'
          : `${l.lastErrorCode}${l.lastErrorMessage ? ` — ${l.lastErrorMessage}` : ''}`}
      </div>
      {vm.error ? <div className="text-red-400">error: {vm.error}</div> : null}
    </div>
  );
}
