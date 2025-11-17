import { apiFoodTrucks } from './api';

const ENDPOINT_BASE = 'v1/modificadores/';
const nowIso = () => new Date().toISOString();

async function unwrapResponse(resp) {
  if (resp && typeof resp === 'object' && typeof resp.json === 'function') {
    const clone = resp.clone?.() ?? resp;
    return clone.json();
  }
  return resp;
}

const pickList = (res) =>
  Array.isArray(res?.results)
    ? res.results
    : Array.isArray(res?.data?.results)
    ? res.data.results
    : Array.isArray(res)
    ? res
    : [];

const extractId = (obj) => {
  if (!obj || typeof obj !== 'object') return '';
  const direct = obj.modificador_id ?? obj.id ?? obj.pk ?? obj.uuid;
  if (direct != null) return String(direct);
  const nested = obj.modificador?.modificador_id ?? obj.modificador?.id ?? obj.modificador?.pk ?? obj.modificador?.uuid;
  return nested != null ? String(nested) : '';
};

const parsePrice = (value, fallback = 0) => {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
};

const sortByUpdatedDesc = (items) =>
  items.sort((a, b) => String(b?.updatedAt ?? '').localeCompare(String(a?.updatedAt ?? '')));

function mapModifierFromApi(mod = {}, extra = {}) {
  const modificador_id = extractId(mod) || extra.id || '';
  const updatedAt = mod?.updated_at ?? mod?.updatedAt ?? mod?.fecha_modificacion ?? extra.updatedAt ?? nowIso();

  const valorRaw =
    mod?.valor_adicional ?? extra.valor_adicional ?? mod?.precio_adicional ?? extra.precio_adicional ?? 0;
  const valor = parsePrice(valorRaw);

  return {
    id: modificador_id,
    modificador_id,
    empresa_id: mod?.empresa_id ?? extra.empresa_id ?? null,
    nombre: mod?.nombre ?? extra.nombre ?? '',
    tipo: mod?.tipo ?? extra.tipo ?? '',
    descripcion: mod?.descripcion ?? extra.descripcion ?? '',
    valor_adicional: valor,
    estado: mod?.estado !== undefined ? mod.estado !== false : extra.estado !== undefined ? extra.estado : true,
    updatedAt,
  };
}

function buildBody(form = {}) {
  const body = {};

  const empresa = form?.empresa_id ?? form?.empresaId;
  if (empresa != null && String(empresa).trim() !== '') {
    const num = Number(empresa);
    body.empresa_id = Number.isNaN(num) ? String(empresa).trim() : num;
  }

  const nombre = String(form?.nombre ?? '').trim();
  if (nombre) body.nombre = nombre;

  const tipo = String(form?.tipo ?? '').trim();
  if (tipo) body.tipo = tipo;

  const descripcion = String(form?.descripcion ?? '').trim();
  if (descripcion) body.descripcion = descripcion;

  if (form?.valor_adicional != null && form.valor_adicional !== '') {
    body.valor_adicional = parsePrice(form.valor_adicional);
  } else if (form?.precio_adicional != null && form.precio_adicional !== '') {
    body.valor_adicional = parsePrice(form.precio_adicional);
  }

  if ('estado' in (form || {})) body.estado = form.estado !== false;

  return body;
}

function buildQuery(options = {}) {
  const params = new URLSearchParams();

  const empresa = options.empresaId ?? options.empresa_id;
  if (empresa != null && String(empresa).trim() !== '') {
    params.set('empresa_id', String(empresa).trim());
  }

  return params.toString() ? `?${params.toString()}` : '';
}

const formatErrorMessage = (err, fallback) =>
  err?.response?.data?.detail || err?.response?.data?.message || err?.message || fallback;

export const modificadoresRepo = {
  async list(options = {}) {
    const query = buildQuery(options);
    try {
      const res = await apiFoodTrucks.get(`${ENDPOINT_BASE}${query}`);
      const data = await unwrapResponse(res);
      const all = pickList(data).map((item) => mapModifierFromApi(item.modificador ?? item));
      const filtered = options.includeDisabled ? all : all.filter((m) => m.estado !== false);
      return {
        items: sortByUpdatedDesc(filtered),
        source: 'network',
      };
    } catch (err) {
      const msg = formatErrorMessage(err, 'Error al listar modificadores');
      const error = new Error(msg);
      error.cause = err;
      throw error;
    }
  },

  async create(form = {}) {
    const body = buildBody(form);
    try {
      const res = await apiFoodTrucks.post(ENDPOINT_BASE, body);
      const data = await unwrapResponse(res);
      const obj = data?.modificador ?? data;
      return mapModifierFromApi(obj || body);
    } catch (err) {
      const msg = formatErrorMessage(err, 'No se pudo crear el modificador');
      const error = new Error(msg);
      error.cause = err;
      throw error;
    }
  },

  async update(modificador_id, form = {}) {
    const id = String(modificador_id ?? '').trim();
    if (!id) throw new Error('ID de modificador requerido');
    const body = buildBody(form);
    try {
      const res = await apiFoodTrucks.put(`${ENDPOINT_BASE}${id}/`, body);
      const data = await unwrapResponse(res);
      const obj = data?.modificador ?? data;
      return mapModifierFromApi(obj || { ...body, modificador_id: id });
    } catch (err) {
      const msg = formatErrorMessage(err, 'No se pudo actualizar el modificador');
      const error = new Error(msg);
      error.cause = err;
      throw error;
    }
  },

  async patchEstado(modificador_id, estado) {
    const id = String(modificador_id ?? '').trim();
    if (!id) throw new Error('ID de modificador requerido');
    const body = { estado: estado !== false };
    try {
      const res = await apiFoodTrucks.patch(`${ENDPOINT_BASE}${id}/`, body);
      const data = await unwrapResponse(res);
      const obj = data?.modificador ?? data ?? { modificador_id: id, estado: body.estado };
      return mapModifierFromApi(obj);
    } catch (err) {
      const msg = formatErrorMessage(err, 'No se pudo actualizar el estado');
      const error = new Error(msg);
      error.cause = err;
      throw error;
    }
  },

  async remove(modificador_id) {
    const id = String(modificador_id ?? '').trim();
    if (!id) throw new Error('ID de modificador requerido');
    try {
      await apiFoodTrucks.delete(`${ENDPOINT_BASE}${id}/`);
    } catch (err) {
      const msg = formatErrorMessage(err, 'No se pudo eliminar el modificador');
      const error = new Error(msg);
      error.cause = err;
      throw error;
    }
  },
};
