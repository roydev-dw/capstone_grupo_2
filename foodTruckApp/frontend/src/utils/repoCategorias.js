import { db, generateTempId, isOnline } from './db';
import { apiFoodTrucks } from './api';
import { enqueueOutbox } from './offlineQueue';

const ENDPOINT_BASE = 'v1/categorias/';
const nowIso = () => new Date().toISOString();

const pickList = (res) => {
  if (!res) return [];
  const payload = res?.data ?? res;

  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.categorias)) return payload.categorias;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload)) return payload;

  return [];
};

const pickObject = (res) => res?.data ?? res?.result ?? res ?? null;
const normalizeSucursalId = (value) => {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
};
const filterBySucursal = (items, sucursalId) => {
  if (sucursalId == null) return items;
  return items.filter((item) => Number(item.sucursal_id ?? item.sucursalId) === sucursalId);
};

const byIdAsc = (a, b) => {
  const ai = Number(a.categoria_id);
  const bi = Number(b.categoria_id);
  if (Number.isNaN(ai) && Number.isNaN(bi)) return 0;
  if (Number.isNaN(ai)) return 1;
  if (Number.isNaN(bi)) return -1;
  return ai - bi;
};

function mapCategoriaFromApi(c, extra = {}) {
  const pending = extra.pending ?? false;
  const id = String(c?.categoria_id ?? c?.id ?? extra.id ?? '');
  return {
    id,
    categoria_id: id,
    sucursal_id: c?.sucursal_id != null ? Number(c.sucursal_id) : extra.sucursal_id,
    nombre: c?.nombre ?? c?.name ?? extra.nombre ?? '',
    descripcion: c?.descripcion ?? c?.description ?? extra.descripcion ?? '',
    estado: c?.estado != null ? !!c.estado : extra.estado != null ? !!extra.estado : true,
    updatedAt: extra.updatedAt ?? nowIso(),
    pending,
    pendingFlag: pending ? 1 : 0,
    tempId: extra.tempId ?? null,
    syncedAt: extra.syncedAt ?? nowIso(),
    lastError: extra.lastError ?? null,
    pendingOp: extra.pendingOp ?? null,
  };
}

function mapCategoriaToApi(form) {
  const nombre = String(form?.nombre ?? '').trim();
  const descripcion = String(form?.descripcion ?? '').trim();
  const sucursal_id = form?.sucursal_id != null ? Number(form.sucursal_id) : undefined;

  const body = {};
  if (!Number.isNaN(sucursal_id) && sucursal_id != null) body.sucursal_id = sucursal_id;
  if (nombre) body.nombre = nombre;
  if (descripcion) body.descripcion = descripcion;
  if ('estado' in (form || {})) body.estado = !!form.estado;

  return body;
}

function shouldQueueError(err) {
  if (!err) return true;
  const status = err?.status;
  if (typeof status === 'number') {
    if (status >= 500 || status === 408 || status === 429) return true;
    return false;
  }
  return true;
}

async function queueCategoryCreate(localCategory, body) {
  return enqueueOutbox({
    type: 'category',
    op: 'create',
    tempId: localCategory?.id,
    payload: { body },
  });
}

async function queueCategoryUpdate(id, body, { method = 'PUT' } = {}) {
  return enqueueOutbox({
    type: 'category',
    op: 'update',
    targetId: id,
    payload: { body, method },
  });
}

async function queueCategoryDelete(id, { hard = false } = {}) {
  return enqueueOutbox({
    type: 'category',
    op: 'delete',
    targetId: id,
    payload: { hard },
  });
}

async function processCategoryCreate(entry) {
  const { payload = {}, tempId } = entry;
  const body = payload.body ?? {};

  const res = await apiFoodTrucks.post(ENDPOINT_BASE, body);
  const created = mapCategoriaFromApi(pickObject(res) || body, {
    pending: false,
    tempId: null,
    pendingOp: null,
  });

  await db.transaction('rw', db.categories, async () => {
    if (tempId) await db.categories.delete(tempId);
    await db.categories.put(created);
  });

  return created;
}

async function processCategoryUpdate(entry) {
  const { payload = {}, targetId } = entry;
  const id = String(targetId ?? payload.body?.categoria_id ?? '');
  if (!id) throw new Error('No hay categoria_id para actualizar');
  const method = (payload.method || 'PUT').toUpperCase();
  const body = payload.body ?? {};

  let updated = null;
  if (method === 'PUT') {
    const res = await apiFoodTrucks.put(`${ENDPOINT_BASE}${id}/`, body);
    updated = mapCategoriaFromApi(pickObject(res) || { id, ...body }, {
      pending: false,
      pendingOp: null,
      tempId: null,
    });
  } else if (method === 'PATCH') {
    const res = await apiFoodTrucks.patch(`${ENDPOINT_BASE}${id}/`, body);
    updated = mapCategoriaFromApi(pickObject(res) || { id, ...body }, {
      pending: false,
      pendingOp: null,
      tempId: null,
    });
  } else {
    throw new Error(`Metodo no soportado para categorias: ${method}`);
  }

  await db.categories.put(updated);
  return updated;
}

async function processCategoryDelete(entry) {
  const { payload = {}, targetId } = entry;
  const id = targetId != null ? String(targetId) : '';
  if (!id) return;
  const hard = !!payload.hard;
  const url = hard ? `${ENDPOINT_BASE}${id}/?hard=1` : `${ENDPOINT_BASE}${id}/`;
  await apiFoodTrucks.delete(url);
  await db.categories.delete(id);
}

/**
 * Procesa una entrada de outbox relacionada a categorias (create/update/delete).
 *
 * @param {{op: string, payload?: Record<string, any>, tempId?: string, targetId?: string}} entry Operacion pendiente.
 * @returns {Promise<any>} Resultado normalizado o `undefined` segun el tipo de operacion.
 * @throws {Error} Si la API de Punto Sabor rechaza la operacion.
 * @example
 * ```js
 * await processCategoryOutboxEntry({ op: 'create', payload: { body } });
 * ```
 * @remarks Se invoca desde el `syncManager` para reintentar acciones offline.
 */
export async function processCategoryOutboxEntry(entry) {
  if (!entry) return;
  if (entry.op === 'create') return processCategoryCreate(entry);
  if (entry.op === 'update') return processCategoryUpdate(entry);
  if (entry.op === 'delete') return processCategoryDelete(entry);
  throw new Error(`Operacion de outbox categorias desconocida: ${entry.op}`);
}

/**
 * Recorre la cola de outbox de categorias y ejecuta las operaciones pendientes.
 *
 * @returns {Promise<void>} Resuelve al sincronizar o propaga el primer error encontrado.
 * @throws {Error} Si alguna de las entradas falla al reenviarse.
 * @example
 * ```js
 * await processCategoryQueue();
 * ```
 * @remarks Cambia el estado de cada entrada a `sending`, `synced` o `error` segun resultado.
 */
export async function processCategoryQueue() {
  const entries = await db.outbox
    .where('type')
    .equals('category')
    .filter((item) => item.status === 'pending' || item.status === 'error')
    .sortBy('ts');

  for (const entry of entries) {
    const key = entry.key ?? entry.id;
    await db.outbox.update(key, { status: 'sending', error: null });
    try {
      await processCategoryOutboxEntry(entry);
      await db.outbox.update(key, {
        status: 'synced',
        error: null,
        syncedAt: nowIso(),
        ts: Date.now(),
      });
    } catch (err) {
      await db.outbox.update(key, {
        status: 'error',
        error: String(err?.message || err),
      });
      throw err;
    }
  }
}

/**
 * Repositorio de categorias con soporte offline y sincronizacion diferida.
 *
 * @remarks Combina llamadas HTTP con Dexie para mantener la UI del PDP de Punto Sabor reactiva sin conexion.
 */
export const categoriasRepo = {
  async listAll({ sucursalId } = {}) {
    const sucursalNumber = normalizeSucursalId(sucursalId);
    const query = sucursalNumber != null ? `?sucursal_id=${sucursalNumber}` : '';
    try {
      const res = await apiFoodTrucks.get(`${ENDPOINT_BASE}${query}`);
      const items = pickList(res).map((c) => mapCategoriaFromApi(c, { pending: false, pendingOp: null }));
      const filteredItems = filterBySucursal(items, sucursalNumber);

      await db.transaction('rw', db.categories, async () => {
        const pendingLocals = await db.categories.where('pendingFlag').equals(1).toArray();
        const pendingMap = new Map(
          pendingLocals
            .filter((item) => (sucursalNumber == null ? true : Number(item.sucursal_id) === sucursalNumber))
            .map((item) => [item.id, item])
        );
        const serverIds = new Set(filteredItems.map((item) => item.id));

        const toPersist = filteredItems.map((item) => {
          if (!item.id) return item;
          if (!pendingMap.has(item.id)) return item;
          const local = pendingMap.get(item.id);
          return {
            ...local,
            syncedAt: nowIso(),
            lastError: null,
          };
        });

        if (toPersist.length) await db.categories.bulkPut(toPersist);

        const scopedCollection =
          sucursalNumber != null ? db.categories.where('sucursal_id').equals(sucursalNumber) : db.categories;
        const staleKeys = await scopedCollection
          .filter((c) => !c.pending && !c.tempId && !!c.id && !serverIds.has(c.id))
          .primaryKeys();
        if (staleKeys.length) await db.categories.bulkDelete(staleKeys);
      });

      let ordered;
      if (sucursalNumber != null) {
        ordered = await db.categories.where('sucursal_id').equals(sucursalNumber).toArray();
      } else {
        ordered = await db.categories.orderBy('updatedAt').toArray();
      }
      ordered.sort(byIdAsc);
      return { items: ordered, source: 'network' };
    } catch (err) {
      let cached;
      if (sucursalNumber != null) {
        cached = await db.categories.where('sucursal_id').equals(sucursalNumber).toArray();
      } else {
        cached = await db.categories.toArray();
      }
      cached.sort(byIdAsc);
      return { items: cached, source: 'cache' };
    }
  },

  async list(options) {
    const { items, source } = await this.listAll(options);
    return { items: items.filter((c) => c.estado !== false), source };
  },

  async create(form) {
    const body = mapCategoriaToApi({ ...form });
    if (!('estado' in body)) body.estado = true;
    console.log('[categoriasRepo.create] body a enviar:', body);

    const tempId = generateTempId('category');
    const provisional = mapCategoriaFromApi(
      { id: tempId, ...body },
      {
        pending: true,
        tempId,
        pendingOp: 'create',
        syncedAt: null,
      }
    );
    await db.categories.put(provisional);

    if (!isOnline()) {
      await queueCategoryCreate(provisional, body);
      return provisional;
    }

    try {
      const createdRes = await apiFoodTrucks.post(ENDPOINT_BASE, body);
      const created = mapCategoriaFromApi(pickObject(createdRes) || body, {
        pending: false,
        tempId: null,
        pendingOp: null,
      });
      await db.transaction('rw', db.categories, async () => {
        await db.categories.delete(tempId);
        await db.categories.put(created);
      });
      return created;
    } catch (err) {
      if (shouldQueueError(err)) {
        await queueCategoryCreate(provisional, body);
        return provisional;
      }
      await db.categories.delete(tempId);
      throw err;
    }
  },

  async update(categoria_id, form) {
    const id = String(categoria_id);
    const body = mapCategoriaToApi(form);
    const before = await db.categories.get(id);

    const optimistic = mapCategoriaFromApi(
      { id, ...body },
      {
        pending: true,
        tempId: before?.tempId ?? null,
        pendingOp: 'update',
        lastError: null,
      }
    );
    await db.categories.put(optimistic);

    if (!isOnline()) {
      await queueCategoryUpdate(id, body);
      return optimistic;
    }

    try {
      const updatedRes = await apiFoodTrucks.put(`${ENDPOINT_BASE}${id}/`, body);
      const updated = mapCategoriaFromApi(pickObject(updatedRes) || { id, ...body }, {
        pending: false,
        tempId: null,
        pendingOp: null,
      });
      await db.categories.put(updated);
      return updated;
    } catch (err) {
      if (shouldQueueError(err)) {
        await queueCategoryUpdate(id, body);
        return optimistic;
      }
      if (before) await db.categories.put(before);
      else await db.categories.delete(id);
      throw err;
    }
  },

  async disable(categoria_id) {
    const id = String(categoria_id);
    const before = await db.categories.get(id);
    if (before) {
      await db.categories.put({
        ...before,
        estado: false,
        pending: true,
        pendingFlag: 1,
        pendingOp: 'delete',
        lastError: null,
        updatedAt: nowIso(),
      });
    }

    if (!isOnline()) {
      await queueCategoryDelete(id);
      return;
    }

    try {
      await apiFoodTrucks.delete(`${ENDPOINT_BASE}${id}/`);
      const current = await db.categories.get(id);
      if (current) {
        await db.categories.put({
          ...current,
          pending: false,
          pendingFlag: 0,
          pendingOp: null,
        });
      }
    } catch (err) {
      if (shouldQueueError(err)) {
        await queueCategoryDelete(id);
        return;
      }
      if (before) await db.categories.put(before);
      throw err;
    }
  },

  async enable(categoria_id) {
    const id = String(categoria_id);
    const before = await db.categories.get(id);
    const body = before
      ? {
          sucursal_id: before.sucursal_id,
          nombre: before.nombre,
          descripcion: before.descripcion,
          estado: true,
        }
      : { estado: true };

    await db.categories.put({
      ...(before ?? mapCategoriaFromApi({ id })),
      estado: true,
      pending: true,
      pendingFlag: 1,
      pendingOp: 'update',
      updatedAt: nowIso(),
      lastError: null,
    });

    if (!isOnline()) {
      await queueCategoryUpdate(id, body);
      return;
    }

    try {
      const updatedRes = await apiFoodTrucks.put(`${ENDPOINT_BASE}${id}/`, body);
      const updated = mapCategoriaFromApi(pickObject(updatedRes) || { id, ...body }, {
        pending: false,
        pendingOp: null,
        tempId: null,
      });
      await db.categories.put(updated);
      return updated;
    } catch (err) {
      if (shouldQueueError(err)) {
        await queueCategoryUpdate(id, body);
        return;
      }
      if (before) await db.categories.put(before);
      throw err;
    }
  },

  async destroy(categoria_id) {
    const id = String(categoria_id);
    const before = await db.categories.get(id);
    if (before) await db.categories.delete(id);

    if (!isOnline()) {
      await queueCategoryDelete(id, { hard: true });
      return;
    }

    try {
      const url = `${ENDPOINT_BASE}${id}/?hard=1`;
      await apiFoodTrucks.delete(url);
    } catch (err) {
      if (shouldQueueError(err)) {
        await queueCategoryDelete(id, { hard: true });
        return;
      }
      if (before) await db.categories.put(before);
      throw err;
    }
  },

  async remove(categoria_id) {
    return this.disable(categoria_id);
  },

  async syncPending() {
    if (!isOnline()) return;
    try {
      const { syncNow } = await import('./syncManager');
      await syncNow();
    } catch {
      await processCategoryQueue().catch(() => {});
    }
    try {
      await this.listAll();
    } catch {}
  },
};
