const DUMMY_API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const FOODTRUCKS_API_BASE_URL = import.meta.env.VITE_API_BASE_URL_FOODTRUCKS;

const createApiInstance = (baseURL) => {
  const request = async (endpoint, options = {}) => {
    const url = `${baseURL}${endpoint}`;
    const defaultHeaders = {
      'Content-Type': 'application/json',
    };

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || data.error || `Error: ${response.statusText}`
        );
      }
      return data;
    } catch (error) {
      console.error(`Fallo la petición a ${baseURL}:`, error);
      throw error;
    }
  };

  return {
    get: (endpoint) => request(endpoint),
    post: (endpoint, body) =>
      request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
    put: (endpoint, body) =>
      request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
  };
};

export const api = createApiInstance(DUMMY_API_BASE_URL);
export const apiFoodTrucks = createApiInstance(FOODTRUCKS_API_BASE_URL);
