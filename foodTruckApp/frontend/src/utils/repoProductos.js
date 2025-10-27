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

// ---------- normalización ----------
const normalizeEstado = (v) => {
  if (v === true || v === 1 || v === '1') return true;
  if (typeof v === 'string' && v.toLowerCase() === 'true') return true;
  if (v === 'Publicado') return true;

  if (v === false || v === 0 || v === '0') return false;
  if (typeof v === 'string' && v.toLowerCase() === 'false') return false;
  if (v === 'Borrador') return false;

  return !!v;
};

const normalizeMoneyString = (val) => {
  if (val == null) return '';
  const s = String(val)
    .replace(/[^0-9.,]/g, '')
    .replace(',', '.');
  const n = Number(s);
  if (Number.isNaN(n)) return '';
  return n.toFixed(2); // "2900.00"
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
  imagen_url: p.imagen_url ?? '',
});

const mapProductToApi = (form) => ({
  categoria_id: form.categoria_id || null,
  nombre: form.nombre?.trim() || '',
  descripcion: form.descripcion?.trim() || '',
  precio_base: normalizeMoneyString(form.precio_base),
  tiempo_preparacion: Number(form.tiempo_preparacion || 0),
  estado: normalizeEstado(form.estado),
  imagen_url: (form.imagen_url ?? '').trim(), // por si haces PUT sin nueva imagen
});

// ---------- outbox infra ----------
const online = () =>
  typeof navigator !== 'undefined' ? navigator.onLine : true;

async function pushOutboxItem(item) {
  await db.outbox.add({ ...item, status: 'pending', ts: Date.now() });
}

async function processOutboxItem(item) {
  try {
    switch (item.method) {
      case 'POST': {
        // NOTA: dejamos de usar POST via outbox porque podría requerir FormData.
        // Si llega algo aquí como POST JSON, lo intentamos igual:
        const createdRes = await apiFoodTrucks.post(item.endpoint, item.body);
        const obj = pickObject(createdRes);

        if (!obj || obj.producto_id == null) {
          console.warn(
            '[repoProductos] POST sin cuerpo; se espera próximo GET.'
          );
          break;
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

// ---------- API principal ----------
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

  /** Crear producto – usa SIEMPRE FormData (el backend lo exige) */
  async create(form) {
    // Armamos FormData con todos los campos
    const fd = new FormData();
    if (form.categoria_id != null)
      fd.append('categoria_id', String(form.categoria_id));
    if (form.nombre) fd.append('nombre', String(form.nombre).trim());
    if (form.descripcion)
      fd.append('descripcion', String(form.descripcion).trim());
    if (form.precio_base != null)
      fd.append('precio_base', normalizeMoneyString(form.precio_base));
    if (form.tiempo_preparacion != null)
      fd.append(
        'tiempo_preparacion',
        String(Number(form.tiempo_preparacion || 0))
      );
    if ('estado' in form)
      fd.append('estado', normalizeEstado(form.estado) ? '1' : '0');
    // imagen si viene seleccionada:
    if (form.imagen_file instanceof File) {
      fd.append('imagen', form.imagen_file);
    }

    // Optimismo local simple (sin outbox para multipart)
    const tempId = `tmp-${Date.now()}`;
    await db.productos_v2.put({
      producto_id: tempId,
      categoria_id: form.categoria_id ?? '',
      categoria_nombre: form.categoria_nombre ?? '',
      nombre: form.nombre ?? '',
      descripcion: form.descripcion ?? '',
      precio_base: Number(form.precio_base ?? 0),
      tiempo_preparacion: Number(form.tiempo_preparacion ?? 0),
      estado: normalizeEstado(form.estado),
      fecha_creacion: new Date().toISOString(),
      imagen_url: form.imagen_url ?? '',
    });

    try {
      const createdRes = await apiFoodTrucks.post(ENDPOINT_BASE, fd);
      const obj = pickObject(createdRes);
      if (!obj || obj.producto_id == null) {
        // si el server no devuelve el objeto, forzamos refresh
        await this.syncPending();
        return;
      }
      const prod = mapProductFromApi(obj);

      await db.transaction('rw', db.productos_v2, async () => {
        await db.productos_v2.delete(tempId);
        await db.productos_v2.put(prod);
      });
      return prod;
    } catch (e) {
      // revertir optimismo si falla
      await db.productos_v2.delete(tempId);
      throw e;
    }
  },

  /** Actualizar – si trae imagen_file usa FormData, si no, va por outbox JSON */
  async update(producto_id, form) {
    const id = String(producto_id);
    const hasNewImage = form?.imagen_file instanceof File;

    if (hasNewImage) {
      const fd = new FormData();
      if (form.categoria_id != null)
        fd.append('categoria_id', String(form.categoria_id));
      if (form.nombre) fd.append('nombre', String(form.nombre).trim());
      if (form.descripcion)
        fd.append('descripcion', String(form.descripcion).trim());
      if (form.precio_base != null)
        fd.append('precio_base', normalizeMoneyString(form.precio_base));
      if (form.tiempo_preparacion != null)
        fd.append(
          'tiempo_preparacion',
          String(Number(form.tiempo_preparacion || 0))
        );
      if ('estado' in form)
        fd.append('estado', normalizeEstado(form.estado) ? '1' : '0');
      fd.append('imagen', form.imagen_file);

      const prev = await db.productos_v2.get(id);
      await db.productos_v2.put({
        ...prev,
        ...form,
        producto_id: id,
        precio_base: Number(form.precio_base ?? prev?.precio_base ?? 0),
        tiempo_preparacion: Number(
          form.tiempo_preparacion ?? prev?.tiempo_preparacion ?? 0
        ),
        estado: normalizeEstado(form.estado),
      });

      const updatedRes = await apiFoodTrucks.put(`${ENDPOINT_BASE}${id}/`, fd);
      const obj = pickObject(updatedRes);
      const updated = mapProductFromApi(obj || { ...form, producto_id: id });
      await db.productos_v2.put(updated);
      return updated;
    }

    // Sin nueva imagen: mantenemos tu flujo (optimista + outbox JSON)
    const desiredEstado = normalizeEstado(form.estado);
    const prev = await db.productos_v2.get(id);

    await db.productos_v2.put({
      ...prev,
      ...form,
      producto_id: id,
      estado: desiredEstado,
      precio_base: Number(form.precio_base ?? prev?.precio_base ?? 0),
      tiempo_preparacion: Number(
        form.tiempo_preparacion ?? prev?.tiempo_preparacion ?? 0
      ),
    });

    await pushOutboxItem({
      method: 'PUT',
      endpoint: `${ENDPOINT_BASE}${id}/`,
      body: mapProductToApi(form),
    });

    if (!prev || prev.estado !== desiredEstado) {
      await pushOutboxItem({
        method: 'PATCH',
        endpoint: `${ENDPOINT_BASE}${id}/`,
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

  /** Eliminar (soft) con outbox */
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

  /** Eliminar definitiva (hard) inmediata */
  async destroy(producto_id) {
    const id = String(producto_id);
    const before = await db.productos_v2.get(id);
    if (before) await db.productos_v2.delete(id);

    try {
      const url = `${ENDPOINT_BASE}${id}/?hard=1`;
      console.log('[repoProductos.destroy] URL completa:', url);
      await apiFoodTrucks.delete(url);
      return;
    } catch (e) {
      if (before) await db.productos_v2.put(before);
      throw e;
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
