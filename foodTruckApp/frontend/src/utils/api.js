// utils/api.js
const BASE = import.meta.env.VITE_API_BASE_URL_FOODTRUCKS;

const getTokens = () => ({
  access: localStorage.getItem('accessToken'),
  refresh: localStorage.getItem('refreshToken'),
});

const setTokens = ({ access, refresh }) => {
  if (access) localStorage.setItem('accessToken', access);
  if (refresh) localStorage.setItem('refreshToken', refresh);
};

const clearTokens = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userData');
};

const AUTH_FREE_PREFIXES = ['v1/auth/login', 'v1/auth/refresh'];
const isAuthFree = (endpoint) =>
  AUTH_FREE_PREFIXES.some((p) => endpoint.startsWith(p));

const rawRequest = async (endpoint, { method = 'GET', body, headers } = {}) => {
  const url = `${BASE}${endpoint}`;

  const isFormData =
    typeof FormData !== 'undefined' && body instanceof FormData;

  const h = {
    ...(body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(headers || {}),
  };

  if (!isAuthFree(endpoint)) {
    const { access } = getTokens();
    if (!access) throw new Error('Falta token Bearer.');
    h.Authorization = `Bearer ${access}`;
  }

  // (Opcional de debug) ver URL final:
  // console.log(`[apiFoodTrucks] ${method} ${url}`);

  const res = await fetch(url, {
    method,
    headers: h,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });

  if (res.status === 204) return null;

  const ct = res.headers.get('content-type') || '';
  let data = null;
  try {
    data = ct.includes('application/json')
      ? await res.json()
      : await res.text();
  } catch {}

  if (!res.ok) {
    const msg =
      (data && (data.detail || data.error || data.message)) ||
      `${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return ct.includes('application/json') ? data : { raw: data };
};

const request = async (endpoint, opts = {}) => {
  try {
    return await rawRequest(endpoint, opts);
  } catch (err) {
    if (err?.status !== 401 || isAuthFree(endpoint)) throw err;

    const { refresh } = getTokens();
    if (!refresh) {
      clearTokens();
      throw new Error('No hay refresh token.');
    }

    try {
      const r = await rawRequest('v1/auth/refresh', {
        method: 'POST',
        body: { refresh },
      });

      const newAccess = r?.access || r?.access_token;
      const newRefresh = r?.refresh || r?.refresh_token || refresh;
      if (!newAccess) throw new Error('No se recibió nuevo access token.');

      setTokens({ access: newAccess, refresh: newRefresh });
      return await rawRequest(endpoint, opts);
    } catch (e) {
      clearTokens();
      throw e;
    }
  }
};

export const apiFoodTrucks = {
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body }),
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body }),
  patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
};
