// Trip panel: start/stop controls plus live counters (distance, elapsed, avg,
// max) and the list of stored trips. >=44px touch targets.

import { SpeedViewModel } from '../state/useSpeed';
import { Unit, convert, unitLabel } from '../core/units';

function fmtDistance(m: number, unit: Unit): string {
  if (unit === 'mph') return `${(m / 1609.344).toFixed(2)} mi`;
  return `${(m / 1000).toFixed(2)} km`;
}

function fmtSpeed(mps: number, unit: Unit): string {
  return `${Math.round(convert(mps, unit))} ${unitLabel(unit)}`;
}

function fmtElapsed(ms: number): string {
  const totalS = Math.floor(ms / 1000);
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function TripPanel({ vm }: { vm: SpeedViewModel }) {
  const t = vm.tripSummary;
  return (
    <div className="flex flex-col gap-3" data-testid="trip-panel">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Counter label="Distance" value={fmtDistance(t.distanceM, vm.unit)} />
        <Counter label="Elapsed" value={fmtElapsed(t.elapsedMs)} />
        <Counter label="Avg" value={fmtSpeed(t.avgSpeedMps, vm.unit)} />
        <Counter label="Max" value={fmtSpeed(t.maxSpeedMps, vm.unit)} />
      </div>

      <button
        type="button"
        onClick={vm.tripRunning ? vm.stopTrip : vm.startTrip}
        className={`min-h-11 w-full rounded-xl text-lg font-semibold ${
          vm.tripRunning
            ? 'bg-red-600 text-white'
            : 'bg-emerald-600 text-white'
        }`}
        data-testid="trip-toggle"
      >
        {vm.tripRunning ? 'Stop trip' : 'Start trip'}
      </button>

      {vm.trips.length > 0 ? (
        <div className="flex flex-col gap-1" data-testid="trip-history">
          <div className="text-sm text-neutral-400">Saved trips</div>
          {vm.trips.slice(0, 5).map((tr) => (
            <div
              key={tr.id}
              className="flex justify-between rounded-md bg-neutral-900 px-3 py-2 text-sm text-neutral-300"
            >
              <span>{fmtDistance(tr.distanceM, vm.unit)}</span>
              <span>{fmtElapsed(tr.elapsedMs)}</span>
              <span>{fmtSpeed(tr.avgSpeedMps, vm.unit)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Counter({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-lg bg-neutral-900 p-3">
      <span className="text-xs uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="text-xl font-semibold tabular-nums text-neutral-100">{value}</span>
    </div>
  );
}
