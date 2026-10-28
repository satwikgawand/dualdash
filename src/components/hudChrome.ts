// HUD chrome auto-hide (SPEC M2-O14). HUD mode's chrome — the one header
// row (brand slot, unit switcher, Drive/HUD switch) and the bottom chip row
// (stationary chip, FixBanner) — hides itself 3 s after HUD entry or after
// the last tap, so the windshield shows the two heroes alone; any tap
// anywhere on the root brings everything back and starts a fresh 3 s. The
// controller only owns the boolean and the countdown: WHICH elements hide
// is HudMode's markup (the chrome wrappers) plus the .dd-hud CSS — the
// mirrored hero container carries no chrome hook, so the heroes can never
// be in the hidden set.
//
// Pure logic behind an injectable scheduler, so tests drive it with fake
// timers (tests/hudLayout.test.ts). No DOM access here: the component
// bridges `visibilitychange` and the tap.

/** Chrome shows for 3 s of inactivity, then fades (owner ask, 2026-10-28). */
export const CHROME_IDLE_MS = 3000;

type TimerId = ReturnType<typeof setTimeout>;

export interface ChromeScheduler {
  set(fn: () => void, ms: number): TimerId;
  clear(id: TimerId): void;
}

const defaultScheduler: ChromeScheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id),
};

export interface ChromeAutoHide {
  /** True once the countdown has fired — chrome is (fading) out. */
  hidden(): boolean;
  /** User activity (a tap anywhere): show chrome and restart the countdown. */
  poke(): void;
  /**
   * App/tab visibility. Hidden pauses the countdown — a backgrounded app
   * must never spend its return on a surprise hide. Visible counts as
   * re-entering HUD: chrome again with a fresh 3 s, same as mount.
   */
  setVisible(visible: boolean): void;
  /** Unmount: drop the pending timer so nothing fires into a dead tree. */
  dispose(): void;
}

/**
 * Create the countdown. Chrome starts visible and the first 3 s runs from
 * here (HUD entry), so the driver always gets a readable first glance.
 */
export function createChromeAutoHide(
  onChange: (hidden: boolean) => void,
  scheduler: ChromeScheduler = defaultScheduler,
  idleMs: number = CHROME_IDLE_MS,
): ChromeAutoHide {
  let timer: TimerId | null = null;
  let hidden = false;
  let disposed = false;

  function clear(): void {
    if (timer === null) return;
    scheduler.clear(timer);
    timer = null;
  }

  function arm(): void {
    clear();
    if (disposed) return;
    timer = scheduler.set(() => {
      timer = null;
      if (hidden) return;
      hidden = true;
      onChange(true);
    }, idleMs);
  }

  function show(): void {
    if (!hidden) return;
    hidden = false;
    onChange(false);
  }

  arm();

  return {
    hidden: () => hidden,
    poke() {
      if (disposed) return;
      show();
      arm();
    },
    setVisible(visible) {
      if (disposed) return;
      if (!visible) {
        clear();
        return;
      }
      show();
      arm();
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}
