// src/utils/roles.js

export const ROLE = {
  ADMIN: 1, // Administrador
  VENDOR: 2, // Vendedor
  SUPERVISOR: 3, // Supervisor
};

export const ROLE_NAME = {
  [ROLE.ADMIN]: 'administrador',
  [ROLE.VENDOR]: 'vendedor',
  [ROLE.SUPERVISOR]: 'supervisor',
};

/**
 * Normaliza el nombre de rol que viene del backend (por ejemplo "Administrador")
 * a una clave en minúsculas (por ejemplo "administrador") para comparaciones.
 */
export function normalizeRoleName(name) {
  if (!name) return '';
  const n = String(name).trim().toLowerCase();
  // puedes agregar alias si algún día cambian etiquetas
  if (['admin', 'administrator', 'administrador', 'adm'].includes(n))
    return 'administrador';
  if (['supervisor', 'sup'].includes(n)) return 'supervisor';
  if (['vendedor', 'seller', 'ven'].includes(n)) return 'vendedor';
  return n;
}
