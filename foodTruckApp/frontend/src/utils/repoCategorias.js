// utils/repoCategorias.js
import { db } from './db';
import { apiFoodTrucks } from './api';

const ENDPOINT_BASE = 'v1/categorias/';

const pickList = (res) =>
  Array.isArray(res?.results)
    ? res.results
    : Array.isArray(res?.data?.results)
    ? res.data.results
    : Array.isArray(res)
    ? res
    : [];

const pickObject = (res) => res?.data ?? res?.result ?? res;

const mapCategoriaFromApi = (c) => ({
  categoria_id: String(c.categoria_id ?? c.id ?? ''),
  sucursal_id: c.sucursal_id != null ? Number(c.sucursal_id) : undefined,
  nombre: c.nombre ?? c.name ?? '',
  descripcion: c.descripcion ?? c.description ?? '',
  estado: c.estado ?? true, // true = activa
});

const mapCategoriaToApi = (form) => {
  const nombre = String(form?.nombre ?? '').trim();
  const descripcion = String(form?.descripcion ?? '').trim();
  const sucursal_id =
    form?.sucursal_id != null ? Number(form.sucursal_id) : undefined;

  const body = {};
  if (!Number.isNaN(sucursal_id) && sucursal_id != null)
    body.sucursal_id = sucursal_id;
  if (nombre) body.nombre = nombre;
  if (descripcion) body.descripcion = descripcion;
  if ('estado' in form) body.estado = !!form.estado;

  return body;
};

// Comparador por ID numérico ascendente
const byIdAsc = (a, b) => {
  const ai = Number(a.categoria_id);
  const bi = Number(b.categoria_id);
  if (Number.isNaN(ai) && Number.isNaN(bi)) return 0;
  if (Number.isNaN(ai)) return 1; // NaN al final
  if (Number.isNaN(bi)) return -1;
  return ai - bi; // cambia a (bi - ai) para descendente
};

export const categoriasRepo = {
  /** Trae TODAS (activas e inactivas), sincroniza cache y ordena por ID. */
  async listAll() {
    try {
      const res = await apiFoodTrucks.get(ENDPOINT_BASE);
      const items = pickList(res).map(mapCategoriaFromApi);

      await db.transaction('rw', db.categorias, async () => {
        await db.categorias.bulkPut(items);
      });

      const ordenadas = items.sort(byIdAsc);
      return { items: ordenadas, source: 'network' };
    } catch (err) {
      console.warn('[repoCategorias] listAll() desde cache:', err?.message);
      const cached = (await db.categorias.toArray()).sort(byIdAsc);
      return { items: cached, source: 'cache' };
    }
  },

  /** Solo activas (por compat). */
  async list() {
    const { items, source } = await this.listAll();
    return { items: items.filter((c) => c.estado !== false), source };
  },

  /** Crear (POST) – optimista. */
  async create(form) {
    const body = mapCategoriaToApi({ ...form });
    if (!('estado' in body)) body.estado = true;

    const tempId = `tmp_${Date.now()}`;
    const provisional = mapCategoriaFromApi({
      id: tempId,
      ...body,
      estado: body.estado ?? true,
    });
    await db.categorias.put(provisional);

    try {
      const createdRes = await apiFoodTrucks.post(ENDPOINT_BASE, body);
      const created = mapCategoriaFromApi(pickObject(createdRes));
      await db.transaction('rw', db.categorias, async () => {
        await db.categorias.delete(tempId);
        await db.categorias.put(created);
      });
      return created;
    } catch (e) {
      await db.categorias.delete(tempId);
      throw e;
    }
  },

  /** Actualizar (PUT) – optimista con reversión. */
  async update(categoria_id, form) {
    const id = String(categoria_id);
    const body = mapCategoriaToApi(form);

    const before = await db.categorias.get(id);
    const optimistic = {
      ...(before ?? { categoria_id: id }),
      ...mapCategoriaFromApi({ id, ...body }),
    };
    await db.categorias.put(optimistic);

    try {
      const updatedRes = await apiFoodTrucks.put(
        `${ENDPOINT_BASE}${id}/`,
        body
      );
      const updated = mapCategoriaFromApi(
        pickObject(updatedRes) || { id, ...body }
      );
      await db.categorias.put(updated);
      return updated;
    } catch (e) {
      if (before) await db.categorias.put(before);
      else await db.categorias.delete(id);
      throw e;
    }
  },

  /** Deshabilitar (DELETE soft). */
  async disable(categoria_id) {
    const id = String(categoria_id);
    const before = await db.categorias.get(id);
    if (before) await db.categorias.put({ ...before, estado: false });

    try {
      await apiFoodTrucks.delete(`${ENDPOINT_BASE}${id}/`);
    } catch (e) {
      if (before)
        await db.categorias.put({ ...before, estado: before.estado ?? true });
      throw e;
    }
  },

  /** Habilitar (PUT con objeto completo desde cache). */
  async enable(categoria_id) {
    const id = String(categoria_id);
    const before = await db.categorias.get(id);

    // Optimismo: marcar activa en cache
    if (before) await db.categorias.put({ ...before, estado: true });

    try {
      const body = before
        ? {
            sucursal_id: before.sucursal_id,
            nombre: before.nombre,
            descripcion: before.descripcion,
            estado: true,
          }
        : { estado: true };

      const updatedRes = await apiFoodTrucks.put(
        `${ENDPOINT_BASE}${id}/`,
        body
      );
      const updated = mapCategoriaFromApi(
        pickObject(updatedRes) || { id, ...body }
      );
      await db.categorias.put(updated);
      return updated;
    } catch (e) {
      if (before) await db.categorias.put(before);
      throw e;
    }
  },

  /** Eliminar (DELETE hard) – optimista con reversión. */
  /** Eliminar definitiva (DELETE hard) */
  async destroy(categoria_id) {
    const id = String(categoria_id);
    const before = await db.categorias.get(id);
    if (before) await db.categorias.delete(id); // optimismo

    try {
      // 🔍 Mostrar en consola la URL completa antes de ejecutar la petición
      const url = `${ENDPOINT_BASE}${id}/?hard=1`;
      console.log('[categoriasRepo.destroy] URL completa:', url);

      // Llamada real
      await apiFoodTrucks.delete(url);

      // Si todo sale bien, no hacemos nada más (listAll refresca)
      return;
    } catch (e) {
      // Si falla, revertimos el cache y propagamos el error
      if (before) await db.categorias.put(before);
      console.error('[categoriasRepo.destroy] Error al eliminar:', e);
      throw e;
    }
  },

  /** Alias soft delete. */
  async remove(categoria_id) {
    return this.disable(categoria_id);
  },
};
