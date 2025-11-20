import { apiFoodTrucks } from './api';

const getErrorDetail = (err) => err?.response?.data?.detail || err?.response?.data?.message || err?.message || '';

const normalizeId = (value) => {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
};

const normalizeList = (productoId, res) => {
  const payload = res?.data ?? res;
  const raw = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload)
    ? payload
    : [];

  return raw.map((item) => {
    const modId =
      item.modificador_id ??
      item.modificadorId ??
      item.modificador?.id ??
      item.modificador?.modificador_id ??
      item.id ??
      null;

    const prodId =
      item.producto_id ?? item.productoId ?? item.producto?.id ?? item.producto?.producto_id ?? Number(productoId);

    const sucursal = item.sucursal_id ?? item.sucursalId ?? item.producto_sucursal_id ?? null;

    return {
      ...item,
      producto_id: prodId != null ? Number(prodId) : null,
      modificador_id: modId != null ? Number(modId) : null,
      sucursal_id: sucursal != null ? Number(sucursal) : null,
    };
  });
};

const mapOptions = (rawOptions) => {
  if (rawOptions && typeof rawOptions === 'object') {
    return {
      es_obligatorio: rawOptions.es_obligatorio ?? false,
      sucursal_id: normalizeId(rawOptions.sucursalId ?? rawOptions.sucursal_id),
    };
  }
  return {
    es_obligatorio: Boolean(rawOptions),
    sucursal_id: null,
  };
};

const buildQuery = (options = {}) => {
  const params = new URLSearchParams();
  const sucId = normalizeId(options.sucursalId ?? options.sucursal_id);
  if (sucId != null) params.set('sucursal_id', sucId);
  const q = params.toString();
  return q ? `?${q}` : '';
};

export const productoModificadoresRepo = {
  async list(productoId, options = {}) {
    const id = String(productoId ?? '').trim();
    if (!id) throw new Error('ID de producto requerido');

    const query = buildQuery(options);
    const res = await apiFoodTrucks.get(`v1/productos/${id}/modificadores/${query}`);
    return normalizeList(id, res);
  },

  async attach(productoId, modificadorId, options) {
    const pid = String(productoId).trim();
    const mid = String(modificadorId).trim();
    if (!pid || !mid) throw new Error('Producto o modificador inválido');

    const { es_obligatorio, sucursal_id } = mapOptions(options);
    const body = {
      modificador_id: Number(mid),
      es_obligatorio,
    };
    if (sucursal_id != null) body.sucursal_id = sucursal_id;

    try {
      const res = await apiFoodTrucks.post(`v1/productos/${pid}/modificadores/`, body);
      const list = normalizeList(pid, res);
      return list[0] ?? { producto_id: Number(pid), modificador_id: Number(mid) };
    } catch (err) {
      const detail = getErrorDetail(err);
      if (typeof detail === 'string' && detail.toLowerCase().includes('ya existe esta asociaci')) {
        console.warn('[productoModificadoresRepo.attach] Asociación ya existía, se ignora error', {
          productoId: pid,
          modificadorId: mid,
        });
        return { producto_id: Number(pid), modificador_id: Number(mid) };
      }
      throw err;
    }
  },

  async update(productoId, modificadorId, options) {
    const pid = String(productoId).trim();
    const mid = String(modificadorId).trim();
    if (!pid || !mid) throw new Error('Producto o modificador inválido');

    const { es_obligatorio, sucursal_id } = mapOptions(options);
    const body = {
      modificador_id: Number(mid),
      es_obligatorio,
    };
    if (sucursal_id != null) body.sucursal_id = sucursal_id;

    const res = await apiFoodTrucks.put(`v1/productos/${pid}/modificadores/`, body);
    const list = normalizeList(pid, res);
    return list[0] ?? { producto_id: Number(pid), modificador_id: Number(mid) };
  },

  async detach(productoId, modificadorId, options) {
    const pid = String(productoId).trim();
    const mid = String(modificadorId).trim();
    if (!pid || !mid) throw new Error('Producto o modificador inválido');

    const { sucursal_id } = mapOptions(options);
    const body = { modificador_id: Number(mid) };
    if (sucursal_id != null) body.sucursal_id = sucursal_id;

    const res = await apiFoodTrucks.delete(`v1/productos/${pid}/modificadores/`, body);
    return res ?? { producto_id: Number(pid), modificador_id: Number(mid) };
  },

  /**
   * Reemplaza TODAS las asociaciones de modificadores de un producto
   * por la lista que se pasa en `nuevosModificadores`.
   *
   * nuevosModificadores: array de IDs (number|string), ej: [1, 3, 5]
   */
  async replaceAll(productoId, nuevosModificadores, options = {}) {
    const pid = String(productoId ?? '').trim();
    if (!pid) throw new Error('ID de producto requerido');

    // 1) Obtener asociaciones actuales
    const actuales = await this.list(pid, options);

    const actualesIds = [...new Set(actuales.map((m) => Number(m.modificador_id)).filter((x) => !Number.isNaN(x)))];

    // 2) Hacer detach de TODOS los modificadores actuales
    for (const mid of actualesIds) {
      await this.detach(pid, mid, options);
    }

    // 3) Normalizar y dejar únicos los nuevos IDs
    const nuevosIds = [...new Set((nuevosModificadores || []).map((x) => Number(x)).filter((x) => !Number.isNaN(x)))];

    // 4) Hacer attach de TODOS los nuevos modificadores
    for (const mid of nuevosIds) {
      await this.attach(pid, mid, options);
    }

    // 5) Devolver el estado final
    return this.list(pid, options);
  },
};
