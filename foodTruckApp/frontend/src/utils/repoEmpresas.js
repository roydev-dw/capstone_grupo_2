import { apiFoodTrucks } from './api';

const ENDPOINT = 'v1/empresas/';

const pickArray = (res) => {
  if (Array.isArray(res?.data?.results)) return res.data.results;
  if (Array.isArray(res?.results)) return res.results;
  if (Array.isArray(res)) return res;
  return [];
};

/**
 * Normaliza una empresa proveniente de la API de Punto Sabor.
 *
 * @param {any} e Registro crudo recibido del backend.
 * @returns {{id: number, nombre: string, rut: string, telefono: string, email: string, estado: boolean}}
 * Objeto listo para usarse en formularios y almacenamiento local.
 * @example
 * ```js
 * const empresa = mapEmpresaFromApi(apiResponse.data);
 * ```
 * @remarks Convierte identificadores a `number` y rellena strings faltantes.
 */
export const mapEmpresaFromApi = (e) => ({
  id: Number(e?.empresa_id ?? e?.id ?? 0),
  nombre: e?.nombre ?? '',
  rut: e?.rut ?? '',
  telefono: e?.telefono ?? '',
  email: e?.email ?? '',
  estado: e?.estado ?? true,
});

/**
 * Repositorio minimal para operaciones de empresas en Punto Sabor.
 *
 * @remarks Se apoya en `apiFoodTrucks` y normaliza resultados para mantener
 * consistencia entre distintas pantallas de la app.
 */
export const empresasRepo = {
  /**
   * Lista todas las empresas visibles para el usuario autenticado.
   *
   * @returns {Promise<ReturnType<typeof mapEmpresaFromApi>[]>} Coleccion de empresas normalizadas.
   * @throws {Error} Si la API responde con error HTTP.
   * @example
   * ```js
   * const empresas = await empresasRepo.list();
   * ```
   * @remarks Usa `GET v1/empresas/` y tolera las distintas envolturas (`results`, `data.results` o arreglo plano).
   */
  async list() {
    const res = await apiFoodTrucks.get(ENDPOINT);
    return pickArray(res).map(mapEmpresaFromApi);
  },
};
