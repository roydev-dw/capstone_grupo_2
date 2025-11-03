import { db, isOnline } from './db';
import { clearSyncedOutbox } from './offlineQueue';
import { processProductOutboxEntry } from './repoProductos';
import { processCategoryOutboxEntry } from './repoCategorias';
import { getAccessToken } from './session';

const nowIso = () => new Date().toISOString();

const TYPE_HANDLERS = {
  product: processProductOutboxEntry,
  category: processCategoryOutboxEntry,
};

let syncing = false;
let listenersAttached = false;
let pendingScheduled = false;
const handleOnline = () => scheduleSync();
const handleVisibilityChange = () => {
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'visible') scheduleSync();
};

const hasSession = () => {
  try {
    return !!getAccessToken();
  } catch {
    return false;
  }
};

async function runEntry(entry) {
  const handler = TYPE_HANDLERS[entry.type];
  if (!handler) throw new Error(`Tipo de outbox no soportado: ${entry.type}`);
  return handler(entry);
}

async function processQueue() {
  const entries = await db.outbox.orderBy('ts').toArray();
  for (const entry of entries) {
    const key = entry.key ?? entry.id;
    if (!key) continue;

    if (entry.status === 'synced') continue;

    await db.outbox.update(key, { status: 'sending', error: null });
    try {
      await runEntry(entry);
      await db.outbox.update(key, {
        status: 'synced',
        error: null,
        syncedAt: nowIso(),
      });
    } catch (err) {
      await db.outbox.update(key, {
        status: 'error',
        error: String(err?.message || err),
      });
    }
  }

  await clearSyncedOutbox();
}

export async function syncNow() {
  if (!isOnline()) return;
  if (!hasSession()) return;
  if (syncing) {
    pendingScheduled = true;
    return;
  }
  syncing = true;
  try {
    await processQueue();
  } finally {
    syncing = false;
    if (pendingScheduled) {
      pendingScheduled = false;
      syncNow().catch(() => {});
    }
  }
}

export async function retryOutboxEntry(key) {
  await db.outbox.update(key, {
    status: 'pending',
    error: null,
    ts: Date.now(),
  });
  await syncNow();
}

export async function removeOutboxEntry(key) {
  await db.outbox.delete(key);
}

function scheduleSync() {
  if (!pendingScheduled) pendingScheduled = true;
  if (!syncing && hasSession()) {
    pendingScheduled = false;
    syncNow().catch(() => {});
  }
}

export function initSyncManager() {
  if (listenersAttached) return;
  listenersAttached = true;

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  if (hasSession()) {
    syncNow().catch(() => {});
  }
}

export function resetSyncManager() {
  if (!listenersAttached) return;
  listenersAttached = false;
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', handleOnline);
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }
  pendingScheduled = false;
  syncing = false;
}

