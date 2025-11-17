import { apiFoodTrucks } from './api';

const ENDPOINT_BASE = 'v1/usuarios/';
const pickObject = (res) => res?.data ?? res?.result ?? res;

function normalizeSucursalesIds(u) {
  const raw =
    Array.isArray(u?.sucursales)
      ? u.sucursales
      : Array.isArray(u?.sucursales_ids)
      ? u.sucursales_ids
      : Array.isArray(u?.sucursalesId)
      ? u.sucursalesId
      : Array.isArray(u?.sucursales_detalle)
      ? u.sucursales_detalle
      : null;

  if (!raw) {
    const single = u?.sucursal_id ?? u?.branch_id ?? null;
    return single != null ? [Number(single)] : [];
  }

  return raw
    .map((item) => {
      if (item == null) return null;
      if (typeof item === 'number' || typeof item === 'string') {
        const parsed = Number(item);
        return Number.isFinite(parsed) ? parsed : null;
      }
      if (typeof item === 'object') {
        const idCandidate =
          item.id ?? item.sucursal_id ?? item.sucursalId ?? item.branch_id ?? null;
        const parsed = Number(idCandidate);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    })
    .filter((value) => value != null);
}

/**
 * Normaliza un usuario proveniente de la API de Punto Sabor.
 *
 * @param {any} u Registro crudo del backend.
 * @returns {{id: number, nombre_completo: string, email: string, telefono: string, empresa_id: number|null, empresa_nombre: string, sucursal_id: number|null, sucursal_nombre: string, rol_id: number|null, rol_nombre: string, estado: boolean, sucursales_ids: number[]}}
 * Objeto listo para mostrarse o persistirse localmente.
 * @example
 * ```js
 * const usuario = mapUsuarioFromApi(apiPayload);
 * ```
 * @remarks Tolera variantes de nombres como `usuario_id` o `rol_nombre`.
 */
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
  sucursales_ids: normalizeSucursalesIds(u),
});

/**
 * Repositorio para operaciones CRUD de usuarios contra la API de Punto Sabor.
 *
 * @remarks Devuelve registros normalizados y encapsula los detalles de transporte HTTP.
 */
export const usuariosRepo = {
  /**
   * Obtiene un usuario por su identificador.
   *
   * @param {number|string} id Identificador externo (`usuario_id`).
   * @returns {Promise<ReturnType<typeof mapUsuarioFromApi>>} Usuario normalizado.
   * @throws {Error} Si la solicitud `GET v1/usuarios/:id/` falla.
   * @example
   * ```js
   * const usuario = await usuariosRepo.get(5);
   * ```
   * @remarks Mapea cualquier estructura envolvente (`data`, `result` o payload plano).
   */
  async get(id) {
    const res = await apiFoodTrucks.get(`${ENDPOINT_BASE}${id}/`);
    return mapUsuarioFromApi(pickObject(res));
  },

  /**
   * Lista los usuarios visibles segun permisos del usuario autenticado.
   *
   * @returns {Promise<ReturnType<typeof mapUsuarioFromApi>[]>} Arreglo de usuarios.
   * @throws {Error} Si `GET v1/usuarios/` responde con error HTTP.
   * @example
   * ```js
   * const usuarios = await usuariosRepo.list();
   * ```
   * @remarks Tolera respuestas envolviendo resultados bajo `results` o arreglos planos.
   */
  async list(filters = {}) {
    const params = new URLSearchParams();
    if (filters?.empresaId != null && filters.empresaId !== '') {
      params.set('empresa_id', Number(filters.empresaId));
    }
    if (filters?.sucursalId != null && filters.sucursalId !== '') {
      params.set('sucursal_id', Number(filters.sucursalId));
    }
    const query = params.toString();
    const url = query ? `${ENDPOINT_BASE}?${query}` : ENDPOINT_BASE;
    const res = await apiFoodTrucks.get(url);
    const arr = Array.isArray(res?.data?.results)
      ? res.data.results
      : Array.isArray(res?.results)
      ? res.results
      : Array.isArray(res)
      ? res
      : [];
    return arr.map(mapUsuarioFromApi);
  },

  /**
   * Crea un usuario remoto y devuelve su representacion normalizada.
   *
   * @param {Record<string, any>} payload Cuerpo esperado por `POST v1/usuarios/`.
   * @returns {Promise<ReturnType<typeof mapUsuarioFromApi>>} Usuario recien creado.
   * @throws {Error} Si la API rechaza la creacion.
   * @example
   * ```js
   * const nuevo = await usuariosRepo.create({ email, nombre_completo, rol_id: 2 });
   * ```
   * @remarks Propaga cualquier error HTTP del backend.
   */
  async create(payload) {
    const res = await apiFoodTrucks.post(ENDPOINT_BASE, payload);
    return mapUsuarioFromApi(pickObject(res));
  },

  /**
   * Reemplaza un usuario existente mediante `PUT`.
   *
   * @param {number|string} id Identificador del usuario.
   * @param {Record<string, any>} payload Datos completos a persistir.
   * @returns {Promise<ReturnType<typeof mapUsuarioFromApi>>} Usuario actualizado.
   * @throws {Error} Si la API rechaza la operacion.
   * @example
   * ```js
   * await usuariosRepo.update(usuario.id, { ...usuario, estado: false });
   * ```
   * @remarks Usa `PUT v1/usuarios/:id/`.
   */
  async update(id, payload) {
    const res = await apiFoodTrucks.put(`${ENDPOINT_BASE}${id}/`, payload);
    return mapUsuarioFromApi(pickObject(res));
  },

  /**
   * Actualiza parcialmente los campos de un usuario.
   *
   * @param {number|string} id Identificador del usuario.
   * @param {Record<string, any>} payload Subconjunto de campos.
   * @returns {Promise<ReturnType<typeof mapUsuarioFromApi>>} Usuario actualizado.
   * @throws {Error} Si la API rechaza el `PATCH`.
   * @example
   * ```js
   * await usuariosRepo.patch(usuario.id, { telefono: '+569...' });
   * ```
   * @remarks Usa `PATCH v1/usuarios/:id/`.
   */
  async patch(id, payload) {
    const res = await apiFoodTrucks.patch(`${ENDPOINT_BASE}${id}/`, payload);
    return mapUsuarioFromApi(pickObject(res));
  },

  /**
   * Deshabilita logicamente a un usuario (soft delete).
   *
   * @param {number|string} id Identificador del usuario.
   * @returns {Promise<any>} Respuesta cruda del backend (puede ser `null`).
   * @throws {Error} Si la API rechaza la eliminacion logica.
   * @example
   * ```js
   * await usuariosRepo.disable(usuario.id);
   * ```
   * @remarks Marca al usuario como inactivo mediante `DELETE v1/usuarios/:id/`.
   */
  async disable(id) {
    const res = await apiFoodTrucks.delete(`${ENDPOINT_BASE}${id}/`);
    return res?.data ?? res;
  },

  /**
   * Elimina definitivamente al usuario (hard delete).
   *
   * @param {number|string} id Identificador del usuario.
   * @returns {Promise<any>} Respuesta cruda del backend (puede ser `null`).
   * @throws {Error} Si la API rechaza la eliminacion permanente.
   * @example
   * ```js
   * await usuariosRepo.destroy(usuario.id);
   * ```
   * @remarks Agrega `?hard=1` al endpoint para gatillar la eliminacion permanente.
   */
  async destroy(id) {
    const res = await apiFoodTrucks.delete(`${ENDPOINT_BASE}${id}/?hard=1`);
    return res?.data ?? res;
  },
};
