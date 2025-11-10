import { apiFoodTrucks } from './api';

const ENDPOINT_BASE = 'v1/usuarios/';
const pickObject = (res) => res?.data ?? res?.result ?? res;

export const mapUsuarioFromApi = (u) => ({
  id: Number(u?.id ?? u?.usuario_id ?? 0),
  nombre_completo: u?.nombre_completo ?? '',
  email: u?.email ?? '',
  telefono: u?.telefono ?? '',
  empresa_id: u?.empresa_id ?? null,
  empresa_nombre: u?.empresa_nombre ?? '',
  sucursal_id: u?.sucursal_id ?? null,
  sucursal_nombre: u?.sucursal_nombre ?? '',
  rol_id: u?.rol_id ?? null,
  rol_nombre: u?.rol_nombre ?? '',
  estado: u?.estado ?? true,
});

export const usuariosRepo = {
  async get(id) {
    const res = await apiFoodTrucks.get(`${ENDPOINT_BASE}${id}/`);
    return mapUsuarioFromApi(pickObject(res));
  },

  // ✅ Extrae 'results' del objeto que retorna tu API (fetch)
  async list() {
    const res = await apiFoodTrucks.get(ENDPOINT_BASE);
    const arr = Array.isArray(res?.results)
      ? res.results
      : Array.isArray(res) // por si alguna vez devuelve array directo
      ? res
      : [];
    return arr.map(mapUsuarioFromApi);
  },

  async create(payload) {
    const res = await apiFoodTrucks.post(ENDPOINT_BASE, payload);
    return mapUsuarioFromApi(pickObject(res));
  },

  async update(id, payload) {
    const res = await apiFoodTrucks.put(`${ENDPOINT_BASE}${id}/`, payload);
    return mapUsuarioFromApi(pickObject(res));
  },

  async patch(id, payload) {
    const res = await apiFoodTrucks.patch(`${ENDPOINT_BASE}${id}/`, payload);
    return mapUsuarioFromApi(pickObject(res));
  },

  // soft delete
  async disable(id) {
    const res = await apiFoodTrucks.delete(`${ENDPOINT_BASE}${id}/`);
    return res?.data ?? res; // puede ser null si 204
  },

  // hard delete
  async destroy(id) {
    const res = await apiFoodTrucks.delete(`${ENDPOINT_BASE}${id}/?hard=1`);
    return res?.data ?? res; // puede ser null si 204
  },
};
