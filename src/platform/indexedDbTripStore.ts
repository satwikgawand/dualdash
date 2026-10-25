// IndexedDB implementation of TripStore. Local-first only for M1; no network.

import { TripSummary } from '../core/tripRecorder';
import { StoredTrip, TripStore } from './TripStore';

const DB_NAME = 'dualdash';
const DB_VERSION = 1;
const STORE = 'trips';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('startedAtMs', 'startedAtMs');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (os: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IndexedDbTripStore implements TripStore {
  async save(trip: TripSummary): Promise<StoredTrip> {
    const db = await openDb();
    const record: StoredTrip = { ...trip, id: crypto.randomUUID() };
    await tx(db, 'readwrite', (os) => os.put(record));
    db.close();
    return record;
  }

  async list(): Promise<StoredTrip[]> {
    const db = await openDb();
    const all = await tx<StoredTrip[]>(db, 'readonly', (os) => os.getAll());
    db.close();
    return (all ?? []).sort((a, b) => (b.startedAtMs ?? 0) - (a.startedAtMs ?? 0));
  }

  async remove(id: string): Promise<void> {
    const db = await openDb();
    await tx(db, 'readwrite', (os) => os.delete(id));
    db.close();
  }

  async clear(): Promise<void> {
    const db = await openDb();
    await tx(db, 'readwrite', (os) => os.clear());
    db.close();
  }
}
