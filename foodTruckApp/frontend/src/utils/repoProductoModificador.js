// src/utils/repoProductoModificadores.js
import { apiFoodTrucks } from './api';

const getErrorDetail = (err) => err?.response?.data?.detail || err?.response?.data?.message || err?.message || '';

const normalizeId = (value) => {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
};

const normalizeList = (productoId, res) => {
  const data = res?.data;
  const raw = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];

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
  // AHORA acepta un segundo parámetro options (por ejemplo { sucursalId })
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
      modificador_id: mid,
      es_obligatorio,
    };
    if (sucursal_id != null) body.sucursal_id = sucursal_id;

    try {
      // Usamos PUT porque tu backend lo está aceptando así
      const res = await apiFoodTrucks.put(`v1/productos/${pid}/modificadores/`, body);
      const list = normalizeList(pid, { data: res.data });
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
      modificador_id: mid,
      es_obligatorio,
    };
    if (sucursal_id != null) body.sucursal_id = sucursal_id;

    const res = await apiFoodTrucks.put(`v1/productos/${pid}/modificadores/`, body);
    const list = normalizeList(pid, { data: res.data });
    return list[0] ?? { producto_id: Number(pid), modificador_id: Number(mid) };
  },

  async detach(productoId, modificadorId, options) {
    const pid = String(productoId).trim();
    const mid = String(modificadorId).trim();
    if (!pid || !mid) throw new Error('Producto o modificador inválido');

    const { sucursal_id } = mapOptions(options);
    const body = { modificador_id: mid };
    if (sucursal_id != null) body.sucursal_id = sucursal_id;

    const res = await apiFoodTrucks.delete(`v1/productos/${pid}/modificadores/`, { data: body });
    return res.data ?? { producto_id: Number(pid), modificador_id: Number(mid) };
  },
};
