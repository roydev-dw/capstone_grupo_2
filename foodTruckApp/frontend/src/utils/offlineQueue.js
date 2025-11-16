import { db, isOnline } from './db';

/**
 * Etiqueta utilizada para los registros de Background Sync del PWA.
 *
 * @example
 * ```js
 * navigator.serviceWorker.ready.then((reg) => reg.sync.register(SYNC_TAG));
 * ```
 * @remarks Debe mantenerse estable para que el SW reprograme correctamente los envios.
 */
export const SYNC_TAG = 'sync-offline-ops';
const STATUS_PENDING = 'pending';

/**
 * Inserta una operacion pendiente en la outbox local.
 *
 * @param {{type: string, op: string, payload?: Record<string, any>, tempId?: string|null, targetId?: string|null}} entry
 * Datos minimos para identificar la operacion.
 * @returns {Promise<{type: string, op: string, payload: Record<string, any>, tempId: string|null, targetId: string|null, ts: number, status: string, error: null, key: number}>}
 * Entrada persistida con su clave autoincremental.
 * @throws {Dexie.DexieError} Si Dexie no puede escribir en IndexedDB.
 * @example
 * ```js
 * await enqueueOutbox({ type: 'product', op: 'create', payload: { body } });
 * ```
 * @remarks Dispara un Background Sync para reintentar cuando vuelva la conectividad.
 */
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

/**
 * Actualiza campos de una entrada existente en la outbox.
 *
 * @param {number} key Clave primaria generada por Dexie.
 * @param {Record<string, any>} changes Campos a modificar.
 * @returns {Promise<void>} Se resuelve cuando la transaccion finaliza.
 * @throws {Dexie.DexieError} Si la actualizacion falla.
 * @example
 * ```js
 * await updateOutbox(entry.key, { status: 'error', error: message });
 * ```
 * @remarks No valida estructura; se asume que los campos existen en la tabla `outbox`.
 */
export async function updateOutbox(key, changes) {
  await db.outbox.update(key, changes);
}

/**
 * Obtiene las entradas de outbox ordenadas por timestamp ascendente.
 *
 * @returns {Promise<any[]>} Lista de entradas para sincronizacion.
 * @example
 * ```js
 * const pending = await getOutboxEntries();
 * ```
 * @remarks Se usa en herramientas como tablas de diagnostico para mostrar el estado.
 */
export async function getOutboxEntries() {
  return db.outbox.orderBy('ts').toArray();
}

/**
 * Limpia las entradas sincronizadas cuya marca de tiempo sea anterior al umbral.
 *
 * @param {number} [thresholdMs=5 * 60 * 1000] Tiempo minimo (ms) que deben conservarse.
 * @returns {Promise<void>} Se resuelve cuando termina el borrado.
 * @throws {Dexie.DexieError} Si Dexie no logra eliminar las claves.
 * @example
 * ```js
 * await clearSyncedOutbox(60 * 1000); // limpia entradas con mas de 1 minuto
 * ```
 * @remarks Ayuda a controlar el crecimiento de IndexedDB en dispositivos offline.
 */
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
    console.error('[offlineQueue] No se pudo registrar background sync:', err);
  }
}

/**
 * Indica si el runtime considera que hay conectividad disponible.
 *
 * @returns {boolean} `true` cuando el navegador reporta que esta online.
 * @example
 * ```js
 * if (canSyncNow()) await syncNow();
 * ```
 * @remarks Usa `navigator.onLine`; puede dar falsos positivos en conexiones cautivas.
 */
export const canSyncNow = () => isOnline();
