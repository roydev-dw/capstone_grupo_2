import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearSession,
} from './session';

const BASE = (import.meta.env.VITE_API_BASE_URL_FOODTRUCKS || '').replace(
  /\/+$/,
  ''
); // sin slash final

// Endpoints que NO requieren Authorization (con y sin slash al final)
const AUTH_FREE_PREFIXES = [
  'v1/auth/login',
  'v1/auth/login/',
  'v1/auth/refresh',
  'v1/auth/refresh/',
];

/** Une base y endpoint sin duplicar ni perder slashes */
function joinUrl(base, endpoint) {
  const e = String(endpoint || '');
  const cleaned = e.startsWith('/') ? e.slice(1) : e;
  return `${base}/${cleaned}`;
}

function isAuthFree(endpoint) {
  const e = String(endpoint || '');
  const noSlash = e.replace(/^\/+/, ''); // quita slashes iniciales
  return AUTH_FREE_PREFIXES.some((p) => noSlash.startsWith(p));
}

/** Parsea respuesta a JSON si aplica; si no, { raw: string } */
async function parseResponse(res) {
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await res.json();
  return { raw: await res.text() };
}

/** Lanza error enriquecido */
function throwHttpError(res, data) {
  const msg =
    (data && (data.detail || data.error || data.message)) ||
    `${res.status} ${res.statusText}`;
  const err = new Error(msg);
  err.status = res.status;
  err.data = data;
  throw err;
}

/**
 * Hace una request "cruda" (sin refresh). Agrega el Bearer si corresponde.
 */
async function rawRequest(endpoint, { method = 'GET', body, headers } = {}) {
  const url = joinUrl(BASE, endpoint);
  const isFormData =
    typeof FormData !== 'undefined' && body instanceof FormData;

  const h = {
    ...(body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(headers || {}),
  };

  if (!isAuthFree(endpoint)) {
    const access = getAccessToken();
    if (!access) {
      const err = new Error('Falta token Bearer.');
      err.status = 401;
      throw err;
    }
    h.Authorization = `Bearer ${access}`;
  }

  const res = await fetch(url, {
    method,
    headers: h,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    // credentials: 'include', // <- descomenta si usas cookies en el backend
  });

  const data = await parseResponse(res);
  if (!res.ok) throwHttpError(res, data);
  return data;
}

/**
 * Request con manejo de refresh automatico.
 */
async function request(endpoint, opts = {}) {
  try {
    return await rawRequest(endpoint, opts);
  } catch (err) {
    // Si no es 401 o el endpoint es auth-free, no intentamos refresh
    if (err?.status !== 401 || isAuthFree(endpoint)) throw err;

    // Intentamos refresh
    const refresh = getRefreshToken();
    if (!refresh) {
      clearSession();
      throw new Error('No hay refresh token.');
    }

    try {
      const r = await rawRequest('v1/auth/refresh/', {
        method: 'POST',
        body: { refresh },
      });

      const newAccess = r?.access || r?.access_token;
      const newRefresh = r?.refresh || r?.refresh_token || refresh;
      if (!newAccess) throw new Error('No se recibio nuevo access token.');

      setTokens({ access: newAccess, refresh: newRefresh });

      // Reintentamos la original
      return await rawRequest(endpoint, opts);
    } catch (e) {
      // Refresh fallo -> limpiar y notificar
      clearSession();
      throw e;
    }
  }
}

/**
 * Cliente HTTP centralizado para la API de Punto Sabor.
 *
 * @remarks Adjunta automaticamente el token Bearer y reintenta peticiones 401
 * mediante refresh token para mantener la sesion consistente.
 */
export const apiFoodTrucks = {
  /**
   * Ejecuta un `GET` autenticado contra la API.
   *
   * @param {string} endpoint Ruta relativa como `v1/categorias/`.
   * @returns {Promise<any>} Respuesta ya parseada del backend.
   * @throws {Error} Si la API responde con un estado HTTP distinto de 2xx.
   * @example
   * ```js
   * const categorias = await apiFoodTrucks.get('v1/categorias/');
   * ```
   * @remarks Devuelve directamente el payload tras manejar tokens y refresh.
   */
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  /**
   * Ejecuta un `POST` autenticado.
   *
   * @param {string} endpoint Ruta relativa destino.
   * @param {unknown} body Payload serializable o `FormData`.
   * @returns {Promise<any>} JSON o texto segun `Content-Type`.
   * @throws {Error} Si el backend rechaza la operacion o caduca la sesion.
   * @example
   * ```js
   * await apiFoodTrucks.post('v1/categorias/', { nombre: 'Bebestibles' });
   * ```
   * @remarks Serializa objetos como JSON salvo que se entregue `FormData`.
   */
  post: (endpoint, body) => request(endpoint, { method: 'POST', body }),
  /**
   * Ejecuta un `PUT` autenticado.
   *
   * @param {string} endpoint Ruta relativa destino.
   * @param {unknown} body Payload con los campos a reemplazar.
   * @returns {Promise<any>} Respuesta parseada del backend.
   * @throws {Error} Si el backend responde con error HTTP.
   * @example
   * ```js
   * await apiFoodTrucks.put('v1/empresas/12/', { estado: true });
   * ```
   * @remarks Usa `JSON.stringify` antes de enviar si el cuerpo no es `FormData`.
   */
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body }),
  /**
   * Ejecuta un `PATCH` autenticado.
   *
   * @param {string} endpoint Ruta relativa destino.
   * @param {unknown} body Subconjunto de campos a actualizar.
   * @returns {Promise<any>} Respuesta parseada del backend.
   * @throws {Error} Si la operacion parcial falla en el backend.
   * @example
   * ```js
   * await apiFoodTrucks.patch('v1/usuarios/3/', { estado: false });
   * ```
   * @remarks Mantiene la semantica parcial esperada por la API de Punto Sabor.
   */
  patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body }),
  /**
   * Ejecuta un `DELETE` autenticado.
   *
   * @param {string} endpoint Ruta relativa destino.
   * @returns {Promise<any>} `null` en respuestas 204 o el cuerpo parseado.
   * @throws {Error} Si el backend rechaza la eliminacion.
   * @example
   * ```js
   * await apiFoodTrucks.delete('v1/productos/99/');
   * ```
   * @remarks Garantiza el manejo de tokens incluso para eliminaciones idempotentes.
   */
  delete: (endpoint, body) => request(endpoint, { method: 'DELETE', body }),
};
