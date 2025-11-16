/**
 * Guarda tokens y usuario actual en storage de Punto Sabor.
 *
 * @param {{ access_token?: string, refresh_token?: string, user?: any }} params Payload recibido desde la API de autenticacion.
 * @returns {void}
 * @example
 * ```js
 * setSession({ access_token, refresh_token, user });
 * ```
 * @remarks Dispara el evento global `auth:login` para que el router y los hooks reaccionen.
 */
export function setSession({ access_token, refresh_token, user }) {
  if (access_token) localStorage.setItem('accessToken', access_token);
  if (refresh_token) localStorage.setItem('refreshToken', refresh_token);

  if (user) {
    const norm = normalizeUserForStore(user);
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

  try {
    window.dispatchEvent(new CustomEvent('auth:login'));
  } catch {}
}

/**
 * Actualiza los tokens persistidos sin modificar la informacion del usuario.
 *
 * @param {{access?: string, refresh?: string}} params Tokens emitidos por `/refresh`.
 * @returns {void}
 * @example
 * ```js
 * setTokens({ access, refresh });
 * ```
 * @remarks Solo sobreescribe los valores recibidos; deja intactos los demas.
 */
export function setTokens({ access, refresh }) {
  if (access) localStorage.setItem('accessToken', access);
  if (refresh) localStorage.setItem('refreshToken', refresh);
}

/**
 * Limpia por completo la sesion almacenada.
 *
 * @returns {void}
 * @example
 * ```js
 * clearSession();
 * ```
 * @remarks Elimina tokens y usuario, luego emite `auth:logout` para que la app redirija.
 */
export function clearSession() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userData');
  localStorage.removeItem('auth');
  localStorage.removeItem('currentUser');

  try {
    window.dispatchEvent(new CustomEvent('auth:logout'));
  } catch {}
}

/**
 * Obtiene el access token persistido.
 *
 * @returns {string|null} Cadena JWT o `null` si no existe.
 * @example
 * ```js
 * const token = getAccessToken();
 * ```
 * @remarks Se usa antes de llamar a la API para adjuntar el Bearer header.
 */
export function getAccessToken() {
  return localStorage.getItem('accessToken') || null;
}

/**
 * Obtiene el refresh token persistido.
 *
 * @returns {string|null} Cadena JWT o `null`.
 * @example
 * ```js
 * const refresh = getRefreshToken();
 * ```
 * @remarks Solo lo utilizan los flujos de refresh dentro del cliente HTTP.
 */
export function getRefreshToken() {
  return localStorage.getItem('refreshToken') || null;
}

/**
 * Devuelve el usuario normalizado desde storage.
 *
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
 *  avatar: string,
 *  empresa_id: number|null,
 *  empresa_nombre: string,
 *  sucursales_ids: number[]
 * } | null} Usuario listo para usar en la UI.
 * @example
 * ```js
 * const currentUser = getCurrentUser();
 * ```
 * @remarks Si encuentra un usuario no normalizado, lo transforma en caliente.
 */
export function getCurrentUser() {
  const raw =
    localStorage.getItem('currentUser') || localStorage.getItem('userData');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.rol_key) return normalizeUserForStore(parsed);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Alias de compatibilidad para codigo legado que leía `getStoredUser`.
 *
 * @example
 * ```js
 * const user = getStoredUser();
 * ```
 * @remarks Referencia directa a `getCurrentUser`.
 */
export const getStoredUser = getCurrentUser;

/* ===================== helpers internos ===================== */

/** Devuelve el primer valor definido y no vacio. */
function firstDefined(arr) {
  return arr?.find((v) => v !== undefined && v !== null && v !== '') ?? null;
}

/**
 * Normaliza el usuario para guardarlo en `currentUser`.
 *
 * @param {any} u Objeto de usuario tal como lo entrega la API.
 * @returns {any} Usuario consistente para la UI local.
 * @remarks Asegura `id/usuario_id` y crea `rol_key` (rol en lowercase) para comparar facil.
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

  const idCandidates = [u.id, u.usuario_id, u.user_id, u.usuarioId, u.userId];
  const id = firstDefined(idCandidates);

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
    empresa_id:
      firstDefined([
        u.empresa_id,
        u.company_id,
        u.empresa?.id,
        u.company?.id,
      ]) ?? null,
    empresa_nombre:
      firstDefined([
        u.empresa_nombre,
        u.company_name,
        u.empresa?.nombre,
        u.company?.nombre,
      ]) ?? '',
    sucursales_ids: (Array.isArray(u.sucursales ?? u.sucursales_ids)
      ? (u.sucursales ?? u.sucursales_ids)
      : []
    )
      .map((value) => {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : null;
        }
        if (typeof value === 'object') {
          const candidate = value?.id ?? value?.sucursal_id ?? value?.sucursalId ?? null;
          const parsed = Number(candidate);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      })
      .filter((value) => value != null),
  };
}
