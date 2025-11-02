// utils/session.js

/**
 * Guarda tokens y usuario en storage.
 * @param {{ access_token?: string, refresh_token?: string, user?: any }} param0
 */
export function setSession({ access_token, refresh_token, user }) {
  if (access_token) localStorage.setItem('accessToken', access_token);
  if (refresh_token) localStorage.setItem('refreshToken', refresh_token);

  if (user) {
    const norm = normalizeUserForStore(user);
    // Guardamos crudo por compatibilidad y normalizado para consumo interno
    localStorage.setItem('userData', JSON.stringify(user));
    localStorage.setItem('currentUser', JSON.stringify(norm));
    localStorage.setItem(
      'auth',
      JSON.stringify({
        access_token: access_token || getAccessToken() || '',
        user_id: norm.id ?? norm.usuario_id ?? null,
      })
    );
  }

  // opcional: notificar login
  try {
    window.dispatchEvent(new CustomEvent('auth:login'));
  } catch {}
}

/**
 * Actualiza tokens sin tocar el usuario (útil tras /refresh).
 * @param {{access?: string, refresh?: string}} param0
 */
export function setTokens({ access, refresh }) {
  if (access) localStorage.setItem('accessToken', access);
  if (refresh) localStorage.setItem('refreshToken', refresh);
}

/** Elimina toda la sesión y emite un evento global. */
export function clearSession() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userData');
  localStorage.removeItem('auth');
  localStorage.removeItem('currentUser');

  // Notifica a la app (router/context) que perdió sesión
  try {
    window.dispatchEvent(new CustomEvent('auth:logout'));
  } catch {}
}

/** Acceso directo al access token. */
export function getAccessToken() {
  return localStorage.getItem('accessToken') || null;
}

/** Acceso directo al refresh token. */
export function getRefreshToken() {
  return localStorage.getItem('refreshToken') || null;
}

/**
 * Devuelve el usuario normalizado desde storage.
 * @returns {{
 *  id: number|null,
 *  usuario_id: number|null,
 *  nombre_completo: string,
 *  email: string,
 *  sucursal_id: number|null,
 *  sucursal_nombre: string,
 *  rol_id: number|null,
 *  rol_nombre: string,
 *  rol_key: string,
 *  avatar: string
 * } | null}
 */
export function getCurrentUser() {
  const raw =
    localStorage.getItem('currentUser') || localStorage.getItem('userData');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    // Si viene de userData (no normalizado), lo normalizamos al vuelo
    if (!parsed?.rol_key) return normalizeUserForStore(parsed);
    return parsed;
  } catch {
    return null;
  }
}

/** Alias de compatibilidad con código antiguo. */
export const getStoredUser = getCurrentUser;

/* ===================== helpers internos ===================== */

/** Devuelve el primer valor definido y no vacío. */
function firstDefined(arr) {
  return arr?.find((v) => v !== undefined && v !== null && v !== '') ?? null;
}

/**
 * Normaliza el usuario para guardarlo en currentUser:
 * - asegura id/usuario_id
 * - crea rol_key (rol en lowercase) para comparar fácil
 */
function normalizeUserForStore(u) {
  const role =
    u.rol ??
    u.role ??
    u.user_role ??
    u.userRol ??
    u.rol_nombre ??
    u.role_name ??
    null;

  const roleObj =
    role && typeof role === 'object' && !Array.isArray(role) ? role : null;
  const rolePrimitive =
    role && (typeof role === 'string' || typeof role === 'number')
      ? role
      : null;

  // id unificado
  const idCandidates = [u.id, u.usuario_id, u.user_id, u.usuarioId, u.userId];
  const id = firstDefined(idCandidates);

  // rol_id: permite que el backend envíe 1/2/3 o un objeto
  const roleIdCandidates = [
    u.rol_id,
    u.role_id,
    u.rolId,
    u.roleId,
    typeof rolePrimitive === 'number' ? rolePrimitive : null,
    roleObj?.id,
  ];
  const roleIdRaw = firstDefined(roleIdCandidates);
  const rol_id = roleIdRaw != null ? Number(roleIdRaw) : null;

  // rol_nombre: SOLO strings; evitamos meter números como nombre
  const roleNameCandidates = [
    u.rol_nombre,
    u.role_name,
    u.rolNombre,
    u.roleName,
    typeof rolePrimitive === 'string' ? rolePrimitive : null,
    roleObj?.nombre,
    roleObj?.role_name,
    roleObj?.display_name,
  ];
  const rol_nombre = String(firstDefined(roleNameCandidates) || '').trim();

  // clave de rol para comparaciones rápidas (nombre en lowercase o id como string)
  const rol_key = rol_nombre
    ? String(rol_nombre).toLowerCase()
    : rol_id != null
    ? String(rol_id)
    : '';

  return {
    id: id ?? null,
    usuario_id: id ?? null,
    nombre_completo: u.nombre_completo ?? u.nombre ?? u.full_name ?? '',
    email: (u.email ?? u.correo ?? '').toString().trim(),
    sucursal_id: u.sucursal_id ?? u.branch_id ?? null,
    sucursal_nombre: u.sucursal_nombre ?? u.branch_name ?? '',
    rol_id: Number.isNaN(rol_id) ? null : rol_id,
    rol_nombre,
    rol_key,
    avatar: u.avatar ?? u.profile_image ?? u.image ?? '',
  };
}
