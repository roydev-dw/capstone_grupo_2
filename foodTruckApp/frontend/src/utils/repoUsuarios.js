// utils/repoUsuarios.js
import { apiFoodTrucks } from './api';

const ENDPOINT_BASE = 'v1/usuarios/';

const pickObject = (res) => res?.data ?? res?.result ?? res;

export const mapUsuarioFromApi = (u) => ({
  id: Number(u?.id ?? u?.usuario_id ?? 0),
  nombre_completo: u?.nombre_completo ?? '',
  email: u?.email ?? '',
  telefono: u?.telefono ?? '',
  empresa_id: u?.empresa_id ?? null,
  sucursal_id: u?.sucursal_id ?? null,
  rol_id: u?.rol_id ?? null,
  estado: u?.estado ?? true,
});

export const usuariosRepo = {
  async get(id) {
    const res = await apiFoodTrucks.get(`${ENDPOINT_BASE}${id}/`);
    return mapUsuarioFromApi(pickObject(res));
  },

  // opcional: listar (por si lo necesitas en otra vista)
  async list() {
    const res = await apiFoodTrucks.get(ENDPOINT_BASE);
    const arr = Array.isArray(res?.data?.results)
      ? res.data.results
      : Array.isArray(res?.results)
      ? res.results
      : Array.isArray(res)
      ? res
      : [];
    return arr.map(mapUsuarioFromApi);
  },
};
