import { db, generateTempId, isOnline } from './db';
import { apiFoodTrucks } from './api';
import Resizer from 'react-image-file-resizer';
import { enqueueOutbox } from './offlineQueue';
import { categoriasRepo } from './repoCategorias';

const ENDPOINT_BASE = 'v1/productos/';
const productoImagenEndpoint = (id) => `v1/productos/${id}/imagen/`;

const nowIso = () => new Date().toISOString();

async function unwrapResponse(resp) {
  if (resp && typeof resp === 'object' && typeof resp.json === 'function') {
    const clone = resp.clone?.() ?? resp;
    return clone.json();
  }
  return resp;
}

function extractId(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const direct = obj.producto_id ?? obj.id ?? obj.pk ?? obj.uuid;
  if (direct != null) return String(direct);
  const nested =
    obj.producto?.producto_id ??
    obj.producto?.id ??
    obj.producto?.pk ??
    obj.producto?.uuid;
  return nested != null ? String(nested) : '';
}

function normalizeEstado(v) {
  if (
    v === true ||
    v === 1 ||
    v === '1' ||
    (typeof v === 'string' && v.toLowerCase() === 'true') ||
    v === 'Publicado'
  )
    return true;
  if (
    v === false ||
    v === 0 ||
    v === '0' ||
    (typeof v === 'string' && v.toLowerCase() === 'false') ||
    v === 'Borrador'
  )
    return false;
  return !!v;
}

function normalizeMoneyString(val) {
  if (val == null) return '';
  const s = String(val)
    .replace(/[^0-9.,]/g, '')
    .replace(',', '.');
  const n = Number(s);
  if (Number.isNaN(n)) return '';
  return n.toFixed(2);
}

function pickList(res) {
  if (Array.isArray(res?.results)) return res.results;
  if (Array.isArray(res?.data?.results)) return res.data.results;
  if (Array.isArray(res)) return res;
  return [];
}

function pickObject(res) {
  return res?.data ?? res?.result ?? res ?? null;
}
const normalizeSucursalId = (value) => {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
};
const filterBySucursal = (items, sucursalId) => {
  if (sucursalId == null) return items;
  return items.filter(
    (item) => Number(item.sucursal_id ?? item.sucursalId) === sucursalId
  );
};

function resolveUpdatedAt(p, fallback) {
  return (
    p?.updated_at ??
    p?.updatedAt ??
    p?.fecha_actualizacion ??
    p?.fechaActualizacion ??
    p?.fecha_modificacion ??
    p?.modified ??
    fallback ??
    nowIso()
  );
}

function mapProductFromApi(p, extra = {}) {
  const producto_id = extractId(p);
  const updatedAt = resolveUpdatedAt(p, extra.updatedAt);
  const fechaCreacion =
    p?.fecha_creacion ?? extra.fecha_creacion ?? nowIso();
  const pending = extra.pending ?? false;

  return {
    id: producto_id,
    producto_id,
    categoria_id: p?.categoria_id ?? '',
    categoria_nombre: p?.categoria_nombre ?? '',
    nombre: p?.nombre ?? '',
    descripcion: p?.descripcion ?? '',
    precio_base: Number(p?.precio_base ?? 0),
    tiempo_preparacion: Number(p?.tiempo_preparacion ?? 0),
    estado: normalizeEstado(p?.estado),
    fecha_creacion: fechaCreacion,
    imagen_url: p?.imagen_url ?? p?.imagen ?? '',
    updatedAt,
    pending,
    pendingFlag: pending ? 1 : 0,
    tempId: extra.tempId ?? null,
    syncedAt: extra.syncedAt ?? nowIso(),
    lastError: extra.lastError ?? null,
    pendingOp: extra.pendingOp ?? null,
    sucursal_id:
      p?.sucursal_id != null
        ? Number(p.sucursal_id)
        : extra.sucursal_id != null
        ? Number(extra.sucursal_id)
        : undefined,
  };
}

function mapProductToApi(form) {
  const obj = {
    categoria_id: form?.categoria_id || null,
    nombre: form?.nombre?.trim() || '',
    descripcion: form?.descripcion?.trim() || '',
    precio_base: normalizeMoneyString(form?.precio_base),
    tiempo_preparacion: Number(form?.tiempo_preparacion || 0),
    estado: normalizeEstado(form?.estado),
  };
  const sucursal = normalizeSucursalId(form?.sucursal_id);
  if (sucursal != null) obj.sucursal_id = sucursal;
  const img = (form?.imagen_url ?? '').trim();
  if (img) obj.imagen_url = img;
  return obj;
}

function buildUpdateJson(form) {
  const body = {};
  if (form?.categoria_id != null && String(form.categoria_id).trim() !== '')
    body.categoria_id = Number(form.categoria_id);
  if (form?.nombre && String(form.nombre).trim() !== '')
    body.nombre = String(form.nombre).trim();
  if (form?.descripcion && String(form.descripcion).trim() !== '')
    body.descripcion = String(form.descripcion).trim();
  const precio = normalizeMoneyString(form?.precio_base);
  if (precio) body.precio_base = precio;
  if (
    form?.tiempo_preparacion != null &&
    String(form.tiempo_preparacion).trim() !== ''
  )
    body.tiempo_preparacion = Number(form.tiempo_preparacion);
  if ('estado' in (form || {})) body.estado = normalizeEstado(form?.estado);
  const img = (form?.imagen_url ?? '').trim();
  if (img) body.imagen_url = img;
  const sucursal = normalizeSucursalId(form?.sucursal_id);
  if (sucursal != null) body.sucursal_id = sucursal;
  return body;
}

const sortByUpdatedDesc = (arr) =>
  arr.sort((a, b) =>
    String(b?.updatedAt ?? '').localeCompare(String(a?.updatedAt ?? ''))
  );

function readFileAsDataUrl(file) {
  if (!file) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(reader.error || new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

async function serializeFile(file) {
  if (!file) return null;
  const dataUrl = await readFileAsDataUrl(file);
  if (!dataUrl) return null;
  return {
    dataUrl: String(dataUrl),
    name: file.name || 'upload.webp',
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified || Date.now(),
    size: file.size ?? undefined,
  };
}

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
    } catch {
      toUpload = file;
    }
  }

  const fd = new FormData();
  const filename =
    toUpload.name ||
    (file.name ? file.name.replace(/\.[^.]+$/, '.webp') : 'upload.webp');
  fd.append('imagen', toUpload, filename);

  const resp = await apiFoodTrucks.post(productoImagenEndpoint(productoId), fd);
  const data = await unwrapResponse(resp);
  const obj = data?.producto ?? data;
  const imagen_url = obj?.imagen_url ?? '';
  return imagen_url;
}

async function fetchProducto(id) {
  const res = await apiFoodTrucks.get(`${ENDPOINT_BASE}${id}/`);
  const data = await unwrapResponse(res);
  return data?.producto ?? data ?? null;
}

async function waitForImagenUrl(id, maxTries = 3, delayMs = 400) {
  for (let i = 0; i < maxTries; i++) {
    const obj = await fetchProducto(id);
    const mapped = obj ? mapProductFromApi(obj) : null;
    if (mapped?.imagen_url) return mapped;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
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

async function queueProductCreate(localProduct, form) {
  const payload = {
    body: mapProductToApi(form),
    categoria_nombre: form?.categoria_nombre ?? '',
    fecha_creacion: localProduct?.fecha_creacion ?? nowIso(),
  };
  const image = await serializeFile(form?.imagen_file ?? null);
  if (image) payload.image = image;
  else if (form?.imagen_url) payload.imageUrl = form.imagen_url;
  const entry = await enqueueOutbox({
    type: 'product',
    op: 'create',
    tempId: localProduct?.id,
    payload,
  });
  return { entry, image };
}

async function queueProductUpdate(id, changes, { method = 'PUT', body } = {}) {
  const payloadBody =
    body ??
    (method === 'PATCH'
      ? { ...changes }
      : buildUpdateJson(changes));

  if (payloadBody && typeof payloadBody === 'object') {
    delete payloadBody.imagen_file;
  }

  const payload = {
    method,
    body: payloadBody,
  };

  if (changes?.categoria_nombre)
    payload.categoria_nombre = changes.categoria_nombre;
  if (changes?.imagen_url) payload.imageUrl = changes.imagen_url;

  const image = await serializeFile(changes?.imagen_file ?? null);
  if (image) payload.image = image;

  const entry = await enqueueOutbox({
    type: 'product',
    op: 'update',
    targetId: id,
    payload,
  });
  return { entry, image };
}

async function queueProductDelete(id, { hard = false } = {}) {
  return enqueueOutbox({
    type: 'product',
    op: 'delete',
    targetId: id,
    payload: { hard },
  });
}

async function processProductCreate(entry) {
  const { payload = {}, tempId } = entry;
  const body = payload.body ?? {};

  const res = await apiFoodTrucks.post(ENDPOINT_BASE, body);
  const data = await unwrapResponse(res);
  const obj = data?.producto ?? data;
  const newId = extractId(obj);
  if (!newId) {
    throw new Error('No se obtuvo producto_id tras crear el producto');
  }

  let product = mapProductFromApi(
    { ...obj, producto_id: newId },
    {
      pending: false,
      tempId: null,
      pendingOp: null,
      sucursal_id: body?.sucursal_id,
    }
  );

  if (payload.image) {
    const file = fileFromDataUrl(
      payload.image.dataUrl,
      payload.image.name,
      payload.image.type
    );
    const uploaded = await uploadImagenProducto(newId, file);
    if (uploaded) {
      product = { ...product, imagen_url: uploaded };
    } else if (payload.image.dataUrl) {
      product = { ...product, imagen_url: payload.image.dataUrl };
    }
  } else if (payload.imageUrl) {
    product = { ...product, imagen_url: payload.imageUrl };
  }

  await db.transaction('rw', db.products, async () => {
    if (tempId) await db.products.delete(tempId);
    await db.products.put(product);
  });

  return product;
}

async function processProductUpdate(entry) {
  const { payload = {}, targetId } = entry;
  const id = String(targetId || extractId(payload.body || {}));
  if (!id) throw new Error('No hay id para actualizar el producto');
  const method = (payload.method || 'PUT').toUpperCase();
  const body = payload.body ?? {};

  let responseData = null;
  if (method === 'PUT') {
    if (Object.keys(body).length) {
      const res = await apiFoodTrucks.put(`${ENDPOINT_BASE}${id}/`, body);
      responseData = await unwrapResponse(res);
    }
  } else if (method === 'PATCH') {
    const res = await apiFoodTrucks.patch(`${ENDPOINT_BASE}${id}/`, body);
    responseData = await unwrapResponse(res);
  } else {
    throw new Error(`Metodo no soportado en outbox productos: ${method}`);
  }

  let productData = responseData?.producto ?? responseData;
  if (!productData || !productData.producto_id) {
    const fetched = await fetchProducto(id);
    productData = fetched ?? { ...body, producto_id: id };
  }

  let product = mapProductFromApi(productData, {
    pending: false,
    pendingOp: null,
    tempId: null,
    lastError: null,
  });

  if (payload.image) {
    const file = fileFromDataUrl(
      payload.image.dataUrl,
      payload.image.name,
      payload.image.type
    );
    const uploaded = await uploadImagenProducto(id, file);
    if (uploaded) {
      product = { ...product, imagen_url: uploaded };
    } else if (payload.image.dataUrl) {
      product = { ...product, imagen_url: payload.image.dataUrl };
    }
  } else if (payload.imageUrl) {
    product = { ...product, imagen_url: payload.imageUrl };
  }

  await db.products.put(product);
  return product;
}

async function processProductDelete(entry) {
  const { payload = {}, targetId } = entry;
  const id = targetId != null ? String(targetId) : '';
  if (!id) return;

  const hard = !!payload.hard;
  const url = hard
    ? `${ENDPOINT_BASE}${id}/?hard=1`
    : `${ENDPOINT_BASE}${id}/`;
  await apiFoodTrucks.delete(url);
  await db.products.delete(id);
}

/**
 * Ejecuta la operacion asociada a una entrada de outbox de productos.
 *
 * @param {{op: string, payload?: Record<string, any>, tempId?: string, targetId?: string}} entry Entrada pendiente.
 * @returns {Promise<void>} Resuelve al completar la operacion o propaga el error HTTP.
 * @throws {Error} Si la API de Punto Sabor rechaza la operacion.
 * @example
 * ```js
 * await processProductOutboxEntry({ op: 'delete', targetId: productoId });
 * ```
 * @remarks Se usa desde `syncManager` para reintentar creaciones, actualizaciones o eliminaciones offline.
 */
export async function processProductOutboxEntry(entry) {
  if (!entry) return;
  if (entry.op === 'create') return processProductCreate(entry);
  if (entry.op === 'update') return processProductUpdate(entry);
  if (entry.op === 'delete') return processProductDelete(entry);
  throw new Error(`Operacion de outbox productos desconocida: ${entry.op}`);
}

/**
 * Recorre la outbox de productos y procesa cada entrada pendiente.
 *
 * @returns {Promise<void>} Resuelve cuando todas las entradas se sincronizan.
 * @throws {Error} Si alguna entrada falla y se debe avisar a la UI.
 * @example
 * ```js
 * await processProductQueue();
 * ```
 * @remarks Marca cada registro con `status` correspondiente (`sending`, `synced`, `error`).
 */
export async function processProductQueue() {
  const entries = await db.outbox
    .where('type')
    .equals('product')
    .filter((item) => item.status === 'pending' || item.status === 'error')
    .sortBy('ts');

  for (const entry of entries) {
    const key = entry.key ?? entry.id;
    await db.outbox.update(key, { status: 'sending', error: null });
    try {
      await processProductOutboxEntry(entry);
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
 * Repositorio de productos que combina cache Dexie y API Punto Sabor.
 *
 * @remarks Centraliza las operaciones `list`, `create`, `update`, `delete` con soporte offline-first.
 */
export const productosRepo = {
  async list(options = {}) {
    const sucursalNumber = normalizeSucursalId(options.sucursalId);

    let allowedCategoryIds = null;
    if (
      Array.isArray(options.allowedCategoryIds) &&
      options.allowedCategoryIds.length
    ) {
      allowedCategoryIds = new Set(
        options.allowedCategoryIds
          .map((value) => {
            if (
              value &&
              typeof value === 'object' &&
              (value.categoria_id != null || value.id != null)
            ) {
              return String(value.categoria_id ?? value.id ?? '');
            }
            return String(value ?? '');
          })
          .map((value) => value.trim())
          .filter((value) => value !== '')
      );
    } else if (sucursalNumber != null) {
      const { items: categoriasPermitidas = [] } = await categoriasRepo.listAll(
        { sucursalId: sucursalNumber }
      );
      allowedCategoryIds = new Set(
        categoriasPermitidas
          .map((cat) => String(cat.categoria_id ?? cat.id ?? '').trim())
          .filter((value) => value !== '')
      );
    }
    const query = sucursalNumber != null ? `?sucursal_id=${sucursalNumber}` : '';
    try {
      const res = await apiFoodTrucks.get(`${ENDPOINT_BASE}${query}`);
      const data = await unwrapResponse(res);
      const fetchedItems = pickList(data).map((x) =>
        mapProductFromApi(x.producto ?? x, {
          pending: false,
          pendingOp: null,
          sucursal_id:
            sucursalNumber != null
              ? sucursalNumber
              : x?.sucursal_id ?? x?.producto?.sucursal_id,
        })
      );
      const filteredFromBackend = filterBySucursal(
        fetchedItems,
        sucursalNumber
      ).filter((item) => {
        if (!allowedCategoryIds) return true;
        const catId = String(item.categoria_id ?? '').trim();
        if (!catId) return false;
        return allowedCategoryIds.has(catId);
      });

      await db.transaction('rw', db.products, async () => {
        const pendingLocals = await db.products
          .where('pendingFlag')
          .equals(1)
          .toArray();
        const pendingMap = new Map(
          pendingLocals
            .filter((item) =>
              sucursalNumber == null
                ? true
                : Number(item.sucursal_id) === sucursalNumber
            )
            .map((item) => [item.id, item])
        );
        const serverIds = new Set(filteredFromBackend.map((item) => item.id));

        const toPersist = filteredFromBackend.map((item) => {
          if (!item.id) return item;
          if (!pendingMap.has(item.id)) return item;
          const local = pendingMap.get(item.id);
          return {
            ...local,
            syncedAt: nowIso(),
            lastError: null,
          };
        });

        if (toPersist.length) await db.products.bulkPut(toPersist);

        const scopedCollection =
          sucursalNumber != null
            ? db.products.where('sucursal_id').equals(sucursalNumber)
            : db.products;
        const staleKeys = await scopedCollection
          .filter(
            (p) =>
              !p.pending && !p.tempId && !!p.id && !serverIds.has(p.id)
          )
          .primaryKeys();
        if (staleKeys.length) await db.products.bulkDelete(staleKeys);
      });

      let ordered;
      if (sucursalNumber != null) {
        let scoped = await db.products
          .where('sucursal_id')
          .equals(sucursalNumber)
          .toArray();
        if (allowedCategoryIds) {
          scoped = scoped.filter((item) => {
            const catId = String(item.categoria_id ?? '').trim();
            if (!catId) return false;
            return allowedCategoryIds.has(catId);
          });
        }
        ordered = sortByUpdatedDesc(scoped);
      } else {
        ordered = await db.products.orderBy('updatedAt').reverse().toArray();
      }
      return { items: ordered, source: 'network' };
    } catch (err) {
      let cached;
      if (sucursalNumber != null) {
        let scoped = await db.products
          .where('sucursal_id')
          .equals(sucursalNumber)
          .toArray();
        if (allowedCategoryIds) {
          scoped = scoped.filter((item) => {
            const catId = String(item.categoria_id ?? '').trim();
            if (!catId) return false;
            return allowedCategoryIds.has(catId);
          });
        }
        cached = sortByUpdatedDesc(scoped);
      } else {
        cached = await db.products
          .orderBy('updatedAt')
          .reverse()
          .toArray();
      }
      return { items: cached, source: 'cache' };
    }
  },

  async create(form) {
    const tempId = generateTempId('product');
    const now = nowIso();

    const provisional = mapProductFromApi(
      {
        producto_id: tempId,
        categoria_id: form?.categoria_id ?? '',
        categoria_nombre: form?.categoria_nombre ?? '',
        nombre: form?.nombre ?? '',
        descripcion: form?.descripcion ?? '',
        precio_base: form?.precio_base ?? 0,
        tiempo_preparacion: form?.tiempo_preparacion ?? 0,
        estado: form?.estado,
        fecha_creacion: now,
        imagen_url: form?.imagen_url ?? '',
        sucursal_id: form?.sucursal_id,
      },
      {
        updatedAt: now,
        pending: true,
        tempId,
        pendingOp: 'create',
        syncedAt: null,
        sucursal_id: form?.sucursal_id,
      }
    );

    await db.products.put(provisional);

    if (!isOnline()) {
      const { image } = await queueProductCreate(provisional, form);
      if (image?.dataUrl) {
        provisional.imagen_url = image.dataUrl;
        await db.products.update(tempId, { imagen_url: image.dataUrl, pendingFlag: 1 });
      }
      return provisional;
    }

    try {
      const body = buildUpdateJson(form);
      const createdRes = await apiFoodTrucks.post(ENDPOINT_BASE, body);
      const unwrapped = await unwrapResponse(createdRes);
      const data = unwrapped?.producto ?? unwrapped;
      const newId = extractId(data);
      if (!newId) {
        throw new Error('No se obtuvo producto_id tras crear el producto');
      }

      let product = mapProductFromApi(
        { ...data, producto_id: newId },
        {
          pending: false,
          tempId: null,
          pendingOp: null,
          sucursal_id: form?.sucursal_id,
        }
      );

      if (form?.imagen_file) {
        const uploadedUrl = await uploadImagenProducto(newId, form.imagen_file);
        if (uploadedUrl) {
          product = { ...product, imagen_url: uploadedUrl };
        } else {
          const refreshed = await waitForImagenUrl(newId, 3, 400);
          if (refreshed) product = refreshed;
        }
      }

      await db.transaction('rw', db.products, async () => {
        await db.products.delete(tempId);
        await db.products.put(product);
      });

      return product;
    } catch (err) {
      if (shouldQueueError(err)) {
        const { image } = await queueProductCreate(provisional, form);
        const updates = {
          pending: true,
          pendingFlag: 1,
          pendingOp: 'create',
          lastError: null,
          syncedAt: null,
        };
        if (image?.dataUrl) updates.imagen_url = image.dataUrl;
        await db.products.update(tempId, updates);
        return { ...provisional, ...updates };
      }

      await db.products.delete(tempId);
      throw err;
    }
  },

  async update(producto_id, form = {}) {
    const id = String(producto_id);
    const now = nowIso();
    const prev = await db.products.get(id);

    const desiredEstado = normalizeEstado(
      form?.estado !== undefined ? form.estado : prev?.estado
    );

    const base =
      prev ??
      mapProductFromApi(
        { producto_id: id },
        { sucursal_id: form?.sucursal_id }
      );
    const localNext = {
      ...base,
      id,
      producto_id: id,
      categoria_id: form?.categoria_id ?? base.categoria_id ?? '',
      categoria_nombre: form?.categoria_nombre ?? base.categoria_nombre ?? '',
      nombre: form?.nombre ?? base.nombre ?? '',
      descripcion: form?.descripcion ?? base.descripcion ?? '',
      precio_base: Number(form?.precio_base ?? base.precio_base ?? 0),
      tiempo_preparacion: Number(
        form?.tiempo_preparacion ?? base.tiempo_preparacion ?? 0
      ),
      estado: desiredEstado,
      imagen_url: form?.imagen_url ?? base.imagen_url ?? '',
      updatedAt: now,
      pending: true,
      pendingFlag: 1,
      pendingOp: 'update',
      lastError: null,
      sucursal_id:
        form?.sucursal_id != null
          ? Number(form.sucursal_id)
          : base?.sucursal_id,
    };

    await db.products.put(localNext);

    if (!isOnline()) {
      const { image } = await queueProductUpdate(id, form);
      if (image?.dataUrl) {
        await db.products.update(id, { imagen_url: image.dataUrl, pendingFlag: 1 });
        localNext.imagen_url = image.dataUrl;
      }
      return localNext;
    }

    try {
      const hasNewImage = !!form?.imagen_file;
      if (hasNewImage) {
        const uploadedUrl = await uploadImagenProducto(id, form.imagen_file);
        if (uploadedUrl) {
          localNext.imagen_url = uploadedUrl;
          await db.products.update(id, { imagen_url: uploadedUrl, pendingFlag: 1 });
        }
      }

      const body = buildUpdateJson(form);
      let product = localNext;
      if (Object.keys(body).length) {
        const updatedRes = await apiFoodTrucks.put(
          `${ENDPOINT_BASE}${id}/`,
          body
        );
        const data = await unwrapResponse(updatedRes);
        const obj = data?.producto ?? data;
        product = mapProductFromApi(
          obj || { ...body, producto_id: id },
          { pending: false, pendingOp: null, tempId: null }
        );
      } else {
        product = {
          ...localNext,
          pending: false,
          pendingFlag: 0,
          pendingOp: null,
        };
      }

      await db.products.put({
        ...product,
        pending: false,
        pendingFlag: 0,
      });
      return product;
    } catch (err) {
      if (shouldQueueError(err)) {
        const { image } = await queueProductUpdate(id, form);
        const updates = {
          pending: true,
          pendingFlag: 1,
          pendingOp: 'update',
          lastError: null,
        };
        if (image?.dataUrl) updates.imagen_url = image.dataUrl;
        await db.products.update(id, updates);
        const current = await db.products.get(id);
        return { ...(current ?? {}), ...updates };
      }

      if (prev) await db.products.put(prev);
      else await db.products.delete(id);
      throw err;
    }
  },

  async patchEstado(producto_id, estado) {
    const id = String(producto_id);
    const val = normalizeEstado(estado);
    const now = nowIso();
    const prev = await db.products.get(id);

    if (prev) {
      await db.products.put({
        ...prev,
        estado: val,
        updatedAt: now,
        pending: true,
        pendingFlag: 1,
        pendingOp: 'update',
        lastError: null,
      });
    } else {
      await db.products.put(
        mapProductFromApi(
          { producto_id: id, estado: val },
          { updatedAt: now, pending: true, pendingOp: 'update' }
        )
      );
    }

    const body = { estado: val };

    if (!isOnline()) {
      await queueProductUpdate(id, body, { method: 'PATCH', body });
      return;
    }

    try {
      const res = await apiFoodTrucks.patch(`${ENDPOINT_BASE}${id}/`, body);
      const data = await unwrapResponse(res);
      const obj = data?.producto ?? data ?? { producto_id: id, estado: val };
      const product = mapProductFromApi(obj, {
        pending: false,
        pendingOp: null,
        tempId: null,
      });
      await db.products.put(product);
    } catch (err) {
      if (shouldQueueError(err)) {
        await queueProductUpdate(id, body, { method: 'PATCH', body });
        return;
      }
      if (prev) await db.products.put(prev);
      else await db.products.delete(id);
      throw err;
    }
  },

  async remove(producto_id) {
    const id = String(producto_id);
    const before = await db.products.get(id);
    if (before) await db.products.delete(id);

    if (!isOnline()) {
      await queueProductDelete(id);
      return;
    }

    try {
      await apiFoodTrucks.delete(`${ENDPOINT_BASE}${id}/`);
    } catch (err) {
      if (shouldQueueError(err)) {
        await queueProductDelete(id);
        return;
      }
      if (before) await db.products.put(before);
      throw err;
    }
  },

  async destroy(producto_id) {
    const id = String(producto_id);
    const before = await db.products.get(id);
    if (before) await db.products.delete(id);

    if (!isOnline()) {
      await queueProductDelete(id, { hard: true });
      return;
    }

    try {
      const url = `${ENDPOINT_BASE}${id}/?hard=1`;
      await apiFoodTrucks.delete(url);
    } catch (err) {
      if (shouldQueueError(err)) {
        await queueProductDelete(id, { hard: true });
        return;
      }
      if (before) await db.products.put(before);
      throw err;
    }
  },

  async syncPending() {
    if (!isOnline()) return;
    try {
      const { syncNow } = await import('./syncManager');
      await syncNow();
    } catch {
      await processProductQueue().catch(() => {});
    }
    try {
      await this.list();
    } catch {}
  },
};
