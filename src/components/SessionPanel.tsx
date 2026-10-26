// SessionPanel: the M2 session controls in Drive mode (SPEC M2-O1/O2).
// Everything sits in normal document flow — a chip, never an overlay — so
// one glance reads one meaning:
//   idle   -> quiet [Start session] (or the suggestion chip while the
//              nag guard allows it)
//   running -> live stats row + [Stop]
//   paused  -> PAUSED badge + [Resume] + [Stop]
//   summary -> the frozen card until [Done]
// State is RAM-only: it resets on reload (SPEC M1-O5).

import { Unit, convert, unitLabel } from '../core/units';
import { formatDistance, formatElapsed } from '../session/format';
import { SessionSnapshot, SessionStats } from '../session/sessionMachine';

interface Props {
  unit: Unit;
  session: SessionSnapshot;
  onStart: () => void;
  onStop: () => void;
  onResume: () => void;
  onDismiss: () => void;
  onAcceptSuggestion: () => void;
  onDismissSuggestion: () => void;
}

/** One stat cell: value over a quiet caption. Tabular figures keep width stable. */
function Stat({
  value,
  caption,
  big,
}: {
  value: string;
  caption: string;
  big?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <span
        className={`tabular-nums ${big ? 'text-2xl' : 'text-base'} font-semibold text-neutral-100`}
      >
        {value}
      </span>
      <span className="text-[11px] text-neutral-500">{caption}</span>
    </div>
  );
}

/** The four stats, shared by the live row and the summary card. */
function StatsGrid({ stats, unit, big }: { stats: SessionStats; unit: Unit; big?: boolean }) {
  const unitName = unitLabel(unit);
  return (
    <div
      className={`grid grid-cols-4 items-end gap-2 ${big ? 'gap-3' : ''}`}
      data-testid="session-stats"
    >
      <Stat value={formatDistance(stats.distanceM, unit)} caption="distance" big={big} />
      <Stat value={formatElapsed(stats.elapsedMs)} caption="time" big={big} />
      <Stat
        value={String(Math.round(convert(stats.avgSpeedMps, unit)))}
        caption={`avg ${unitName}`}
        big={big}
      />
      <Stat
        value={String(Math.round(convert(stats.maxSpeedMps, unit)))}
        caption={`top ${unitName}`}
        big={big}
      />
    </div>
  );
}

const BTN_BASE =
  'inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-bold';

export function SessionPanel({
  unit,
  session,
  onStart,
  onStop,
  onResume,
  onDismiss,
  onAcceptSuggestion,
  onDismissSuggestion,
}: Props) {
  // Suggestion chip (SPEC M2-O2): inline, non-blocking, exactly one meaning.
  if (session.phase === 'idle' && session.suggestVisible) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-full bg-neutral-800 py-1.5 pl-4 pr-1.5"
        data-testid="suggest-chip"
      >
        <span className="text-sm font-semibold text-neutral-100">Start session?</span>
        <button
          type="button"
          onClick={onAcceptSuggestion}
          className={`${BTN_BASE} bg-emerald-600 text-white active:bg-emerald-500`}
          data-testid="suggest-start"
        >
          Start
        </button>
        <button
          type="button"
          onClick={onDismissSuggestion}
          aria-label="Do not suggest a session again"
          className={`${BTN_BASE} min-w-11 bg-neutral-700 px-3 text-neutral-200 active:bg-neutral-600`}
          data-testid="suggest-dismiss"
        >
          &times;
        </button>
      </div>
    );
  }

  if (session.phase === 'idle') {
    return (
      <div className="flex justify-center" data-testid="session-idle">
        <button
          type="button"
          onClick={onStart}
          className={`${BTN_BASE} border border-neutral-700 font-semibold text-neutral-300 active:bg-neutral-900`}
          data-testid="session-start"
        >
          Start session
        </button>
      </div>
    );
  }

  if (session.phase === 'summary' && session.summary) {
    return (
      <div
        className="session-summary rounded-xl border border-neutral-800 bg-neutral-900 p-4"
        data-testid="session-summary"
      >
        <div className="mb-3 text-sm font-semibold text-neutral-300">Session summary</div>
        <StatsGrid stats={session.summary} unit={unit} big />
        <button
          type="button"
          onClick={onDismiss}
          className={`${BTN_BASE} mt-4 w-full bg-neutral-800 text-neutral-100 active:bg-neutral-700`}
          data-testid="session-done"
        >
          Done
        </button>
      </div>
    );
  }

  const paused = session.phase === 'paused';
  return (
    <div className="flex flex-col items-center gap-3" data-testid="session-live">
      <StatsGrid stats={session.stats} unit={unit} />
      <div className="flex flex-wrap items-center justify-center gap-2">
        {paused ? (
          <span
            className="inline-flex min-h-11 items-center rounded-full bg-amber-600 px-4 text-sm font-bold text-black"
            data-testid="session-paused-badge"
          >
            PAUSED
          </span>
        ) : null}
        {paused ? (
          <button
            type="button"
            onClick={onResume}
            className={`${BTN_BASE} bg-emerald-600 text-white active:bg-emerald-500`}
            data-testid="session-resume"
          >
            Resume
          </button>
        ) : null}
        <button
          type="button"
          onClick={onStop}
          className={`${BTN_BASE} border border-red-950 bg-red-950/60 text-red-300 active:bg-red-900/60`}
          data-testid="session-stop"
        >
          Stop
        </button>
      </div>
    </div>
  );
}
