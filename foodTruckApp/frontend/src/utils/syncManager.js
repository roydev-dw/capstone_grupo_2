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

/**
 * Fuerza la ejecucion del pipeline de sincronizacion offline si hay sesion y red.
 *
 * @returns {Promise<void>} Resuelve cuando la cola termina o reintenta si estaba corriendo.
 * @throws {Error} Propaga errores de IndexedDB o del procesamiento de outbox.
 * @example
 * ```js
 * await syncNow();
 * ```
 * @remarks Evita solaparse con otras ejecuciones mediante la bandera `syncing`.
 */
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

/**
 * Reprograma una entrada de outbox cambiando su estado a `pending`.
 *
 * @param {number} key Clave primaria del registro en Dexie.
 * @returns {Promise<void>} Resuelve tras actualizar y llamar a `syncNow`.
 * @example
 * ```js
 * await retryOutboxEntry(entry.key);
 * ```
 * @remarks Ideal para botones "reintentar" en la UI de diagnostico.
 */
export async function retryOutboxEntry(key) {
  await db.outbox.update(key, {
    status: 'pending',
    error: null,
    ts: Date.now(),
  });
  await syncNow();
}

/**
 * Elimina una entrada de outbox definitivamente.
 *
 * @param {number} key Clave primaria del registro en Dexie.
 * @returns {Promise<void>} Resuelve tras borrar el registro.
 * @example
 * ```js
 * await removeOutboxEntry(entry.key);
 * ```
 * @remarks Útil cuando el usuario decide descartar una operacion fallida.
 */
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

/**
 * Inicializa listeners globales para disparar sincronizaciones automaticas.
 *
 * @returns {void}
 * @example
 * ```js
 * initSyncManager();
 * ```
 * @remarks Debe llamarse una sola vez tras montar la app o al autenticar al usuario.
 */
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

/**
 * Limpia listeners y banderas para reiniciar el sync manager.
 *
 * @returns {void}
 * @example
 * ```js
 * resetSyncManager();
 * ```
 * @remarks Se ejecuta al cerrar sesion para evitar fugas de memoria y eventos repetidos.
 */
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


