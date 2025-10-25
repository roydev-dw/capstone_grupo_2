// utils/repoProductos.js
import { db } from './db';
import { apiFoodTrucks } from './api';

const ENDPOINT_BASE = 'v1/productos/';

// ---------- helpers de respuesta ----------
const pickList = (res) =>
  Array.isArray(res?.results)
    ? res.results
    : Array.isArray(res?.data?.results)
    ? res.data.results
    : Array.isArray(res)
    ? res
    : [];

const pickObject = (res) => res?.data ?? res?.result ?? res ?? null;

// ---------- normalización de estado ----------
const normalizeEstado = (v) => {
  // true explícitos
  if (v === true || v === 1 || v === '1') return true;
  if (typeof v === 'string' && v.toLowerCase() === 'true') return true;
  if (v === 'Publicado') return true;

  // false explícitos
  if (v === false || v === 0 || v === '0') return false;
  if (typeof v === 'string' && v.toLowerCase() === 'false') return false;
  if (v === 'Borrador') return false;

  // fallback
  return !!v;
};

// ---------- mapeos API <-> local ----------
const mapProductFromApi = (p) => ({
  producto_id: String(p.producto_id),
  categoria_id: p.categoria_id ?? '',
  categoria_nombre: p.categoria_nombre ?? '',
  nombre: p.nombre ?? '',
  descripcion: p.descripcion ?? '',
  precio_base: Number(p.precio_base ?? 0),
  tiempo_preparacion: Number(p.tiempo_preparacion ?? 0),
  estado: normalizeEstado(p.estado),
  fecha_creacion: p.fecha_creacion ?? '',
});

const mapProductToApi = (form) => ({
  categoria_id: form.categoria_id || null,
  nombre: form.nombre?.trim() || '',
  descripcion: form.descripcion?.trim() || '',
  precio_base: Number(form.precio_base || 0),
  tiempo_preparacion: Number(form.tiempo_preparacion || 0),
  estado: normalizeEstado(form.estado),
});

const online = () =>
  typeof navigator !== 'undefined' ? navigator.onLine : true;

async function pushOutboxItem(item) {
  await db.outbox.add({ ...item, status: 'pending', ts: Date.now() });
}

async function processOutboxItem(item) {
  try {
    switch (item.method) {
      case 'POST': {
        const createdRes = await apiFoodTrucks.post(item.endpoint, item.body);
        const obj = pickObject(createdRes);

        // Si el server NO devolvió objeto creado (201 sin body), no intentes reconciliar.
        if (!obj || obj.producto_id == null) {
          console.warn(
            '[repoProductos] POST sin cuerpo; se mantiene tempId local y se esperará al próximo GET.'
          );
          break; // dejamos el temp local; el próximo list() desde red lo reemplazará
        }

        const prod = mapProductFromApi(obj);

        if (item.localTempId) {
          const old = await db.productos_v2.get(item.localTempId);
          if (old) {
            await db.productos_v2.delete(item.localTempId);
            await db.productos_v2.put({ ...old, ...prod });
          } else {
            await db.productos_v2.put(prod);
          }
        } else {
          await db.productos_v2.put(prod);
        }
        break;
      }

      case 'PUT': {
        const updatedRes = await apiFoodTrucks.put(item.endpoint, item.body);
        const endpointId = String(
          item.endpoint.split('/').filter(Boolean).pop()
        );
        const obj = pickObject(updatedRes);

        // Si vuelve vacío, persistimos optimista (body + id)
        const updated = mapProductFromApi(
          obj || { ...item.body, producto_id: endpointId }
        );
        await db.productos_v2.put(updated);
        break;
      }

      case 'PATCH': {
        const patchedRes = await apiFoodTrucks.patch(item.endpoint, item.body);
        const endpointId = String(
          item.endpoint.split('/').filter(Boolean).pop()
        );
        const current = await db.productos_v2.get(endpointId);
        const obj = pickObject(patchedRes);

        const merged = mapProductFromApi(
          obj || { ...current, ...item.body, producto_id: endpointId }
        );
        await db.productos_v2.put(merged);
        break;
      }

      case 'DELETE': {
        await apiFoodTrucks.delete(item.endpoint);
        break;
      }

      default:
        throw new Error(`Método no soportado: ${item.method}`);
    }

    await db.outbox.update(item.id, { status: 'done' });
  } catch (e) {
    console.error('[repoProductos] Error outbox', item, e);
    await db.outbox.update(item.id, {
      status: 'error',
      error: String(e.message || e),
    });
    throw e;
  }
}

async function flushOutbox() {
  const pending = await db.outbox
    .where('status')
    .equals('pending')
    .sortBy('ts');
  for (const it of pending) {
    try {
      await processOutboxItem(it);
    } catch {
      // queda marcado en error
    }
  }
}

export const productosRepo = {
  async list() {
    try {
      const res = await apiFoodTrucks.get(ENDPOINT_BASE);
      const items = pickList(res).map(mapProductFromApi);

      await db.transaction('rw', db.productos_v2, async () => {
        await db.productos_v2.clear();
        await db.productos_v2.bulkPut(items);
      });

      if (online()) flushOutbox().catch(() => {});
      return { items, source: 'network' };
    } catch (err) {
      console.warn(
        '[repoProductos] list() desde cache por error:',
        err?.message
      );
      const cached = await db.productos_v2.toArray();
      cached.sort((a, b) =>
        (b.fecha_creacion || '').localeCompare(a.fecha_creacion || '')
      );
      return { items: cached, source: 'cache' };
    }
  },

  /** Crear producto (optimista + outbox). */
  async create(form) {
    const body = mapProductToApi(form);
    const tempId = `tmp-${Date.now()}`;

    // Escribir local optimista completo
    const local = {
      ...form,
      producto_id: tempId,
      estado: normalizeEstado(form.estado),
      fecha_creacion: new Date().toISOString(),
    };
    await db.productos_v2.put(local);

    // Encolar POST
    await pushOutboxItem({
      method: 'POST',
      endpoint: ENDPOINT_BASE, // e.g., 'v1/productos/'
      body,
      localTempId: tempId,
    });

    if (online()) {
      await flushOutbox();
      // Tip: si tu server es eventual-consistent y no devuelve el obj creado,
      // forzamos refresh desde red para capturar el nuevo ID real.
      try {
        await this.syncPending();
      } catch {}
    }
  },

  /** Actualizar producto (optimista + outbox). */
  async update(producto_id, form) {
    const desiredEstado = normalizeEstado(form.estado);
    const prev = await db.productos_v2.get(producto_id);

    // Optimista local: TODOS los campos
    await db.productos_v2.put({
      ...prev,
      ...form,
      producto_id,
      estado: desiredEstado,
    });

    // Encolar PUT (datos generales)
    await pushOutboxItem({
      method: 'PUT',
      endpoint: `${ENDPOINT_BASE}${producto_id}/`,
      body: mapProductToApi(form),
    });

    // Si el estado cambió, refuérzalo con PATCH explícito
    if (!prev || prev.estado !== desiredEstado) {
      await pushOutboxItem({
        method: 'PATCH',
        endpoint: `${ENDPOINT_BASE}${producto_id}/`,
        body: { estado: desiredEstado },
      });
    }

    if (online()) {
      await flushOutbox();
      try {
        await this.syncPending();
      } catch {}
    }
  },

  /** Patch de solo estado (optimista + outbox). */
  async patchEstado(producto_id, estado) {
    const val = normalizeEstado(estado);
    const p = await db.productos_v2.get(producto_id);
    if (p) await db.productos_v2.put({ ...p, estado: val });

    await pushOutboxItem({
      method: 'PATCH',
      endpoint: `${ENDPOINT_BASE}${producto_id}/`,
      body: { estado: val },
    });

    if (online()) {
      await flushOutbox();
      try {
        await this.syncPending();
      } catch {}
    }
  },

  /** Eliminar (lógico/físico según backend; aquí sólo outbox). */
  async remove(producto_id) {
    await db.productos_v2.delete(producto_id);

    await pushOutboxItem({
      method: 'DELETE',
      endpoint: `${ENDPOINT_BASE}${producto_id}/`,
    });

    if (online()) {
      await flushOutbox();
      try {
        await this.syncPending();
      } catch {}
    }
  },

  /** Sincronización al volver online. */
  async syncPending() {
    if (!online()) return;
    await flushOutbox();
    try {
      const res = await apiFoodTrucks.get(ENDPOINT_BASE);
      const items = pickList(res).map(mapProductFromApi);
      await db.transaction('rw', db.productos_v2, async () => {
        await db.productos_v2.clear();
        await db.productos_v2.bulkPut(items);
      });
    } catch (e) {
      console.warn('[repoProductos] syncPending() fallo GET:', e?.message);
    }
  },
};
