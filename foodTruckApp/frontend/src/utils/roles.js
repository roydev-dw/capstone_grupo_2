export const ROLE = {
  ADMIN: 1,
  VENDOR: 2,
  SUPERVISOR: 3,
};

export const ROLE_NAME = {
  [ROLE.ADMIN]: 'Administrador',
  [ROLE.VENDOR]: 'Vendedor',
  [ROLE.SUPERVISOR]: 'Supervisor',
};

export function normalizeRoleName(name) {
  if (!name) return '';
  const n = String(name).trim().toLowerCase();
  if (['admin', 'administrator', 'administrador', 'adm'].includes(n)) return 'administrador';
  if (['supervisor', 'sup'].includes(n)) return 'supervisor';
  if (['vendedor', 'seller', 'ven'].includes(n)) return 'vendedor';
  return n;
}

export const rolesRepo = {
  async list() {
    return Object.entries(ROLE_NAME).map(([id, nombre]) => ({
      id: Number(id),
      nombre,
    }));
  },
};
