// Buzz seam: tactile feedback for the over-speed alert (SPEC M2-O3).
// Same seam pattern as SpeedSource / ScreenLock: one interface, one device
// implementation, chosen in main.tsx. The ONLY new npm dependency in M2 is
// the official @capacitor/haptics plugin (verified 2026-10-25: v8.0.2,
// published 2026-09-28, peer dep @capacitor/core >= 8.0.0 — Capacitor 8
// compatible; repo github.com/ionic-team/capacitor-haptics). Its web build
// maps the same calls to navigator.vibrate, so the PWA path works too.

import { Haptics, NotificationType } from '@capacitor/haptics';

export interface Buzz {
  /** One over-speed alert tick. Fire-and-forget; never throws. */
  alert(): void;
}

/** Device + PWA implementation via @capacitor/haptics. */
export class HapticsBuzz implements Buzz {
  alert(): void {
    // WARNING = a two-pulse "pay attention" pattern; the right weight for
    // an overspeed nudge (impact styles are single taps, too subtle).
    void Haptics.notification({ type: NotificationType.Warning }).catch(() => {
      // Some devices have no vibrator; the edge flash still carries the alert.
    });
  }
}

/** No-op for tests and environments with no haptics at all. */
export class NullBuzz implements Buzz {
  alert(): void {
    /* intentionally empty */
  }
}
