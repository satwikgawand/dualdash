// ScreenLock seam. Drive mode and HUD mode keep the screen on during a trip.
// Device impl uses @capacitor-community/keep-awake; the web impl falls back to
// the Screen Wake Lock API (Baseline 2025) when running in a plain browser PWA.

import { KeepAwake } from '@capacitor-community/keep-awake';

export interface ScreenLock {
  request(): Promise<void>;
  release(): Promise<void>;
}

/**
 * Device implementation using @capacitor-community/keep-awake (stack.md R2).
 * Used under Capacitor; the web impl below backs browser/PWA use.
 */
export class CapacitorScreenLock implements ScreenLock {
  async request(): Promise<void> {
    try {
      await KeepAwake.keepAwake();
    } catch {
      // Non-fatal; the screen may simply time out.
    }
  }

  async release(): Promise<void> {
    try {
      await KeepAwake.allowSleep();
    } catch {
      // ignore
    }
  }
}

/** Web Wake Lock API fallback for browser/PWA use. Degrades silently if absent. */
export class WebScreenLock implements ScreenLock {
  private wakeLock: WakeLockSentinel | null = null;

  async request(): Promise<void> {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch {
      // Not fatal; the screen may simply time out in a browser.
    }
  }

  async release(): Promise<void> {
    try {
      await this.wakeLock?.release();
    } catch {
      // ignore
    }
    this.wakeLock = null;
  }
}
