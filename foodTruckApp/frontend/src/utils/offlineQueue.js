import { db, isOnline } from './db';

export const SYNC_TAG = 'sync-offline-ops';
const STATUS_PENDING = 'pending';

export async function enqueueOutbox({
  type,
  op,
  payload = {},
  tempId = null,
  targetId = null,
}) {
  const ts = Date.now();
  const entry = {
    type,
    op,
    payload,
    tempId,
    targetId,
    ts,
    status: STATUS_PENDING,
    error: null,
  };
  const key = await db.outbox.add(entry);
  await requestBackgroundSync();
  return { ...entry, key };
}

export async function updateOutbox(key, changes) {
  await db.outbox.update(key, changes);
}

export async function getOutboxEntries() {
  return db.outbox.orderBy('ts').toArray();
}

export async function clearSyncedOutbox(thresholdMs = 5 * 60 * 1000) {
  const limit = Date.now() - thresholdMs;
  const synced = await db.outbox
    .where('status')
    .equals('synced')
    .and((item) => item.ts <= limit)
    .primaryKeys();
  if (synced.length) {
    await db.outbox.bulkDelete(synced);
  }
}

async function requestBackgroundSync() {
  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    typeof window === 'undefined' ||
    !('SyncManager' in window)
  ) {
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register(SYNC_TAG);
  } catch (err) {
    console.warn('[offlineQueue] No se pudo registrar background sync:', err);
  }
}

export const canSyncNow = () => isOnline();
