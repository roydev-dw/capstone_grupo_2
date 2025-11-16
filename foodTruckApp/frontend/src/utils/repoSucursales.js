import { apiFoodTrucks } from './api';

const ENDPOINT = 'v1/sucursales/';

const pickArray = (res) => {
  if (Array.isArray(res?.data?.results)) return res.data.results;
  if (Array.isArray(res?.results)) return res.results;
  if (Array.isArray(res)) return res;
  return [];
};

/**
 * Normaliza una sucursal tal como la expone la API de Punto Sabor.
 *
 * @param {any} s Registro crudo.
 * @returns {{id: number, empresa_id: number, nombre: string, telefono: string, estado: boolean}}
 * Objeto con tipos consistentes para la UI.
 * @example
 * ```js
 * const sucursal = mapSucursalFromApi(apiPayload);
 * ```
 * @remarks Convierte ids a `number` y aplica valores por defecto seguros.
 */
export const mapSucursalFromApi = (s) => ({
  id: Number(s?.sucursal_id ?? s?.id ?? 0),
  empresa_id: Number(s?.empresa_id ?? 0),
  nombre: s?.nombre ?? '',
  direccion: s?.direccion ?? '',
  telefono: s?.telefono ?? '',
  estado: s?.estado ?? true,
});

/**
 * Repositorio de sucursales basado en `apiFoodTrucks`.
 *
 * @remarks Envuelve el endpoint `GET v1/sucursales/` y devuelve datos normalizados.
 */
export const sucursalesRepo = {
  /**
   * Obtiene todas las sucursales disponibles para el usuario actual.
   *
   * @returns {Promise<ReturnType<typeof mapSucursalFromApi>[]>} Sucursales normalizadas.
   * @throws {Error} Si la API responde con error.
   * @example
   * ```js
   * const sucursales = await sucursalesRepo.list();
   * ```
   * @remarks La respuesta soporta tanto envoltura `{data.results}` como arreglos planos.
   */
  async list({ empresaId } = {}) {
    const params = new URLSearchParams();
    if (empresaId != null && empresaId !== '') {
      params.set('empresa_id', Number(empresaId));
    }
    const query = params.toString();
    const url = query ? `${ENDPOINT}?${query}` : ENDPOINT;
    const res = await apiFoodTrucks.get(url);
    return pickArray(res).map(mapSucursalFromApi);
  },

  /**
   * Crea una nueva sucursal.
   *
   * @param {{empresa_id:number|string,nombre:string,direccion?:string,telefono?:string,estado?:boolean}} payload
   * @returns {Promise<ReturnType<typeof mapSucursalFromApi>>}
   */
  async create(payload) {
    const empresaId = Number(payload?.empresa_id);
    if (!empresaId) {
      throw new Error('Debes seleccionar una empresa para la sucursal');
    }

    const body = {
      empresa_id: empresaId,
      nombre: payload?.nombre?.trim() ?? '',
      direccion: payload?.direccion ?? '',
      telefono: payload?.telefono ?? '',
      estado: payload?.estado !== false,
    };

    const res = await apiFoodTrucks.post(ENDPOINT, body);
    const data = res?.data ?? res;
    return mapSucursalFromApi(data);
  },
};
