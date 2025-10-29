// utils/repoProductos.js
import { db } from './db';
import { apiFoodTrucks } from './api';
import Resizer from 'react-image-file-resizer'; // 👈 convierte a WebP

const ENDPOINT_BASE = 'v1/productos/';
const productoImagenEndpoint = (id) => `v1/productos/${id}/imagen/`;

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
  return n.toFixed(2);
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
  imagen_url: p.imagen_url ?? p.imagen ?? '',
});

const mapProductToApi = (form) => ({
  categoria_id: form.categoria_id || null,
  nombre: form.nombre?.trim() || '',
  descripcion: form.descripcion?.trim() || '',
  precio_base: normalizeMoneyString(form.precio_base),
  tiempo_preparacion: Number(form.tiempo_preparacion || 0),
  estado: normalizeEstado(form.estado),
  imagen_url: (form.imagen_url ?? '').trim(),
});

// ---------- helper nuevo: buildUpdateJson ----------
function buildUpdateJson(form) {
  const body = {};

  if (form.categoria_id != null && String(form.categoria_id).trim() !== '') {
    body.categoria_id = Number(form.categoria_id);
  }
  if (form.nombre && String(form.nombre).trim() !== '') {
    body.nombre = String(form.nombre).trim();
  }
  if (form.descripcion && String(form.descripcion).trim() !== '') {
    body.descripcion = String(form.descripcion).trim();
  }

  const precio = normalizeMoneyString(form.precio_base);
  if (precio) {
    body.precio_base = precio;
  }

  if (
    form.tiempo_preparacion != null &&
    String(form.tiempo_preparacion).trim() !== ''
  ) {
    body.tiempo_preparacion = Number(form.tiempo_preparacion);
  }

  if ('estado' in form) {
    body.estado = normalizeEstado(form.estado);
  }

  if (form.imagen_url && String(form.imagen_url).trim() !== '') {
    body.imagen_url = String(form.imagen_url).trim();
  }

  return body;
}

// ---------- compresión y conversión a WebP ----------
function fileFromDataUrl(
  dataUrl,
  filename = 'image.webp',
  type = 'image/webp'
) {
  const arr = dataUrl.split(',');
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type });
}

function toWebpFile(
  file,
  { maxWidth = 1600, maxHeight = 1600, quality = 82 } = {}
) {
  return new Promise((resolve, reject) => {
    try {
      Resizer.imageFileResizer(
        file,
        maxWidth,
        maxHeight,
        'WEBP',
        quality,
        0,
        (uri) => {
          const base = (file.name || 'upload').replace(/\.[^.]+$/, '');
          resolve(fileFromDataUrl(uri, `${base}.webp`, 'image/webp'));
        },
        'base64'
      );
    } catch (err) {
      reject(err);
    }
  });
}

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
        const createdRes = await apiFoodTrucks.post(item.endpoint, item.body);
        const obj = pickObject(createdRes);
        if (!obj || obj.producto_id == null) break;
        const prod = mapProductFromApi(obj);
        await db.productos_v2.put(prod);
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
    } catch {}
  }
}

// ---------- actualizar imagen (usa POST + conversión a webp) ----------
async function uploadImagenProducto(productoId, file) {
  if (!file) return '';

  let toUpload = file;
  if (file.type !== 'image/webp') {
    try {
      toUpload = await toWebpFile(file, {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 82,
      });
    } catch (e) {
      console.warn(
        '[uploadImagenProducto] Falló conversión a WebP, usando original:',
        e?.message || e
      );
      toUpload = file;
    }
  }

  const fd = new FormData();
  const filename = toUpload.name || 'upload.webp';
  fd.append('imagen', toUpload, filename);

  const resp = await apiFoodTrucks.post(productoImagenEndpoint(productoId), fd);
  const obj = pickObject(resp);
  const imagen_url =
    obj?.imagen_url ?? obj?.producto?.imagen_url ?? obj?.data?.imagen_url ?? '';
  if (!imagen_url)
    throw new Error('El endpoint de imagen no retornó imagen_url');
  return imagen_url;
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
      console.warn('[repoProductos] list() desde cache:', err?.message);
      const cached = await db.productos_v2.toArray();
      cached.sort((a, b) =>
        (b.fecha_creacion || '').localeCompare(a.fecha_creacion || '')
      );
      return { items: cached, source: 'cache' };
    }
  },

  async create(form) {
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
      const body = buildUpdateJson(form);
      const createdRes = await apiFoodTrucks.post(ENDPOINT_BASE, body);
      const obj = pickObject(createdRes);
      if (!obj || obj.producto_id == null) {
        await this.syncPending();
        return;
      }
      let prod = mapProductFromApi(obj);

      if (form.imagen_file) {
        try {
          const imagen_url = await uploadImagenProducto(
            prod.producto_id,
            form.imagen_file
          );
          prod = { ...prod, imagen_url: imagen_url || prod.imagen_url || '' };
        } catch (err) {
          console.warn('[productosRepo.create] Falló upload de imagen:', err);
        }
      }

      await db.transaction('rw', db.productos_v2, async () => {
        await db.productos_v2.delete(tempId);
        await db.productos_v2.put(prod);
      });
      return prod;
    } catch (e) {
      await db.productos_v2.delete(tempId);
      throw e;
    }
  },

  async update(producto_id, form) {
    const id = String(producto_id);
    const hasNewImage = !!form?.imagen_file;

    if (hasNewImage) {
      const imagen_url = await uploadImagenProducto(id, form.imagen_file);
      const prev = await db.productos_v2.get(id);
      const nextLocal = {
        ...prev,
        ...form,
        producto_id: id,
        imagen_url,
        precio_base: Number(form.precio_base ?? prev?.precio_base ?? 0),
        tiempo_preparacion: Number(
          form.tiempo_preparacion ?? prev?.tiempo_preparacion ?? 0
        ),
        estado: normalizeEstado(form.estado),
      };
      await db.productos_v2.put(nextLocal);

      const body = buildUpdateJson({ ...form, imagen_url });
      const hasOtherFields = Object.keys(body).length > 0;
      if (hasOtherFields) {
        const updatedRes = await apiFoodTrucks.put(
          `${ENDPOINT_BASE}${id}/`,
          body
        );
        const obj = pickObject(updatedRes);
        const updated = mapProductFromApi(obj || { ...body, producto_id: id });
        await db.productos_v2.put(updated);
        return updated;
      }
      return nextLocal;
    }

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

  async destroy(producto_id) {
    const id = String(producto_id);
    const before = await db.productos_v2.get(id);
    if (before) await db.productos_v2.delete(id);
    try {
      const url = `${ENDPOINT_BASE}${id}/?hard=1`;
      await apiFoodTrucks.delete(url);
      return;
    } catch (e) {
      if (before) await db.productos_v2.put(before);
      throw e;
    }
  },

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
