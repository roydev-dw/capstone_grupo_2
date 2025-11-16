/**
 * IDs de roles soportados por Punto Sabor.
 *
 * @example
 * ```js
 * if (usuario.rol_id === ROLE.ADMIN) { ... }
 * ```
 * @remarks Mantener sincronizado con la tabla de roles del backend.
 */
export const ROLE = {
  ADMIN: 1,
  VENDOR: 2,
  SUPERVISOR: 3,
};

/**
 * Mapa de IDs de rol a etiqueta legible para UI.
 *
 * @example
 * ```js
 * ROLE_NAME[ROLE.VENDOR]; // 'Vendedor'
 * ```
 * @remarks Se usa para poblar selectores cuando la API no entrega catálogos.
 */
export const ROLE_NAME = {
  [ROLE.ADMIN]: 'Administrador',
  [ROLE.VENDOR]: 'Vendedor',
  [ROLE.SUPERVISOR]: 'Supervisor',
};

/**
 * Normaliza cualquier representacion textual de rol a una clave unificada.
 *
 * @param {string} name Texto ingresado por el backend o el usuario.
 * @returns {string} Nombre estandarizado (`administrador`, `supervisor`, `vendedor`).
 * @example
 * ```js
 * normalizeRoleName('Admin'); // administrador
 * ```
 * @remarks Ayuda a comparar roles sin depender de acentos o idioma.
 */
export function normalizeRoleName(name) {
  if (!name) return '';
  const n = String(name).trim().toLowerCase();
  if (['admin', 'administrator', 'administrador', 'adm'].includes(n)) return 'administrador';
  if (['supervisor', 'sup'].includes(n)) return 'supervisor';
  if (['vendedor', 'seller', 'ven'].includes(n)) return 'vendedor';
  return n;
}

/**
 * Repositorio liviano que entrega los roles disponibles sin llamar a la API.
 *
 * @remarks Útil para poblar selects incluso cuando no hay conexion.
 */
export const rolesRepo = {
  /**
   * Devuelve los roles conocidos con su identificador numerico.
   *
   * @returns {Promise<{id: number, nombre: string}[]>} Arreglo de roles legibles.
   * @example
   * ```js
   * const roles = await rolesRepo.list();
   * ```
   * @remarks Retorna un `Promise` para mantener la misma interfaz que otros repos.
   */
  async list() {
    return Object.entries(ROLE_NAME).map(([id, nombre]) => ({
      id: Number(id),
      nombre,
    }));
  },
};

