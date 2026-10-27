// SessionPanel: the M2 session controls in Drive mode (SPEC M2-O1/O2,
// restyled M2-O7). Everything sits in normal document flow — a chip, never
// an overlay — so one glance reads one meaning:
//   idle   -> one clear [Start session] (or the suggestion chip while the
//              nag guard allows it: a calm invite, not a prompt)
//   running -> live stats row + the pulsing live dot + [Stop]
//   paused  -> PAUSED badge + [Resume] + [Stop]
//   summary -> the summary card until [Done] or the ✕
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
    <div className="flex min-w-0 flex-col items-center gap-1">
      <span
        className={`tabular-nums font-semibold text-[var(--dd-text-1)] ${
          big ? 'text-3xl' : 'text-xl'
        }`}
      >
        {value}
      </span>
      <span className="dd-micro">{caption}</span>
    </div>
  );
}

/** The four stats, shared by the live row and the summary card. */
function StatsGrid({ stats, unit, big }: { stats: SessionStats; unit: Unit; big?: boolean }) {
  const unitName = unitLabel(unit);
  return (
    <div
      className={`grid grid-cols-4 items-end ${big ? 'gap-3' : 'gap-2'}`}
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
  // Suggestion chip (SPEC M2-O2): inline, non-blocking, a calm invite.
  if (session.phase === 'idle' && session.suggestVisible) {
    return (
      <div
        className="dd-rise flex items-center justify-center gap-2 self-center rounded-full border border-[var(--dd-border)] bg-[var(--dd-surface)] py-1.5 pl-4 pr-1.5"
        data-testid="suggest-chip"
      >
        <span className="text-sm text-[var(--dd-text-2)]">Start a session?</span>
        <button
          type="button"
          onClick={onAcceptSuggestion}
          className="dd-btn dd-btn-primary px-4 text-sm"
          data-testid="suggest-start"
        >
          Start
        </button>
        <button
          type="button"
          onClick={onDismissSuggestion}
          aria-label="Do not suggest a session again"
          className="dd-btn dd-btn-quiet px-3"
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
          className="dd-btn dd-btn-primary"
          data-testid="session-start"
        >
          Start session
        </button>
      </div>
    );
  }

  if (session.phase === 'summary' && session.summary) {
    return (
      <div className="dd-rise dd-card p-4" data-testid="session-summary">
        <div className="mb-3 flex items-center justify-between">
          <span className="dd-micro">Session summary</span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss the session summary"
            className="dd-btn dd-btn-quiet -mr-2 px-3"
            data-testid="session-summary-close"
          >
            &times;
          </button>
        </div>
        <StatsGrid stats={session.summary} unit={unit} big />
        <button
          type="button"
          onClick={onDismiss}
          className="dd-btn dd-btn-quiet mt-4 w-full"
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
          <span className="dd-pill" data-testid="session-paused-badge">
            <span className="h-2 w-2 rounded-full border border-[var(--dd-text-2)]" aria-hidden="true" />
            paused
          </span>
        ) : (
          <span className="dd-pill" data-testid="session-live-badge">
            <span className="dd-live-dot" aria-hidden="true" />
            live
          </span>
        )}
        {paused ? (
          <button
            type="button"
            onClick={onResume}
            className="dd-btn dd-btn-primary"
            data-testid="session-resume"
          >
            Resume
          </button>
        ) : null}
        <button
          type="button"
          onClick={onStop}
          className="dd-btn dd-btn-signal"
          data-testid="session-stop"
        >
          Stop
        </button>
      </div>
    </div>
  );
}
