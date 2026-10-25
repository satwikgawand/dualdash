// TripStore seam (SPEC O2: M1 stores trips device-local behind a seam; Turso
// sync comes later and MUST NOT be wired in M1 — the owner's Turso auth is
// pending and no server calls are planned). One implementation now: IndexedDB.

import { TripSummary } from '../core/tripRecorder';

/** A persisted trip: summary plus a stable id. Times are epoch milliseconds. */
export interface StoredTrip extends TripSummary {
  id: string;
}

export interface TripStore {
  /** Persist a finished trip; resolves with the stored record (incl. id). */
  save(trip: TripSummary): Promise<StoredTrip>;
  /** Most-recent-first list of stored trips. */
  list(): Promise<StoredTrip[]>;
  /** Delete one trip by id. */
  remove(id: string): Promise<void>;
  /** Wipe all trips. */
  clear(): Promise<void>;
}
