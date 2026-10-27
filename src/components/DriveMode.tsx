// Drive mode: the glanceable dashboard. Heading tape across the top, huge
// primary speed, session controls, chips. Realtime-only: no counters, no
// controls that persist anything (SPEC M1-O5). Mobile-first, >=44px targets,
// no horizontal scroll.
//
// Visual language (SPEC M2-O7): one dark surface system, one signal accent,
// a typographic hierarchy (readout > stats > micro-labels) and controls as
// designed components. The drive-test overlay (SPEC O4) is HIDDEN by default
// and opens on five taps on the status/chip row — the app ships looking like
// an instrument, not a debug screen. RAM-only, like everything else.

import { SpeedViewModel } from '../state/useSpeed';
import {
  AccuracyChip,
  FixBanner,
  SpeedReadout,
  StationaryChip,
} from './readout';
import { HeadingTape } from './HeadingTape';
import { SessionPanel } from './SessionPanel';
import { ThresholdBar } from './ThresholdBar';
import { ToggleBar } from './ToggleBar';
import { useDebugGate } from './debugGate';

interface Props {
  vm: SpeedViewModel;
}

export function DriveMode({ vm }: Props) {
  const session = vm.m2.session;
  const inSession = session.phase === 'running' || session.phase === 'paused';
  const { revealed, onGateTap, hide } = useDebugGate();

  return (
    <div
      className="flex min-h-dvh w-full flex-col gap-3 px-4 pb-4 text-[var(--dd-text-1)]"
      data-testid="drive-root"
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="dd-micro tracking-[0.22em]">DualDash</span>
          <ToggleBar vm={vm} variant="unit" />
        </div>
        <ToggleBar vm={vm} variant="mode" />
      </header>

      {/* Compass: a full-width tape under a fixed index (SPEC M2-O6).
          `dimmed` keeps a STALE/LOST hold from reading as live data. */}
      <HeadingTape
        headingDeg={vm.m2.headingDeg}
        suppressed={vm.m2.headingSuppressed}
        dimmed={vm.state.fixState !== 'LIVE'}
      />

      <div className="flex flex-col items-center gap-3 pt-1">
        <SpeedReadout state={vm.state} unit={vm.unit} />
        {/* The over-speed line sits under the readout, in-session only (M2-O3). */}
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

      {/* Status/chip row: also the hidden diagnostics gate (SPEC M2-O7).
          Five taps inside three seconds flip the drive-test overlay. */}
      <div
        className="mt-auto flex flex-wrap items-center justify-center gap-2 pt-1"
        onClick={onGateTap}
        data-testid="status-chips"
      >
        <AccuracyChip state={vm.state} />
        <StationaryChip state={vm.state} />
      </div>

      <FixBanner state={vm.state} chip={vm.chip} onAction={vm.allowLocation} />

      {revealed ? <DebugOverlay vm={vm} onHide={hide} /> : null}
    </div>
  );
}

/**
 * The drive-test overlay (SPEC O4 / M1-O7 diagnostics), restyled as a card
 * and hidden until the gate opens. Every field the device test reads is
 * still here; it just no longer ships on screen.
 */
function DebugOverlay({ vm, onHide }: { vm: SpeedViewModel; onHide: () => void }) {
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
      className="dd-rise dd-card mt-2 p-3 font-mono text-xs text-[var(--dd-text-2)]"
      data-testid="debug-overlay"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="dd-micro text-[var(--dd-text-2)]">Drive-test debug</span>
        <button
          type="button"
          onClick={onHide}
          className="dd-btn dd-btn-quiet px-3 text-xs"
          data-testid="debug-hide"
        >
          Hide
        </button>
      </div>
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
      {vm.error ? <div className="text-[var(--dd-accent)]">error: {vm.error}</div> : null}
    </div>
  );
}
