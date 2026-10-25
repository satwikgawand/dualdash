// SpeedSource seam (stack.md condition C3). The UI and the pipeline depend only
// on this interface; the device implementation wraps @capacitor/geolocation and
// a mock implementation backs browser dev + tests. Swapping in a native plugin
// later must not require touching pipeline or UI code.

import { RawFix } from '../core/types';

export type FixListener = (fix: RawFix) => void;

export interface SpeedSource {
  /** Begin the ~1 Hz fused stream. Resolves when permission is granted. */
  start(): Promise<void>;
  /** Stop the stream and release resources. Safe to call when not started. */
  stop(): void;
  /** Subscribe to raw fixes. Returns an unsubscribe function. */
  onFix(cb: FixListener): () => void;
  /** Whether the underlying watch is currently active. */
  isActive(): boolean;
}
