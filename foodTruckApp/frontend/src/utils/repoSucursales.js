import { apiFoodTrucks } from './api';

const ENDPOINT = 'v1/sucursales/';

const pickArray = (res) => {
  if (Array.isArray(res?.data?.results)) return res.data.results;
  if (Array.isArray(res?.results)) return res.results;
  if (Array.isArray(res)) return res;
  return [];
};

export const mapSucursalFromApi = (s) => ({
  id: Number(s?.sucursal_id ?? s?.id ?? 0),
  empresa_id: Number(s?.empresa_id ?? 0),
  nombre: s?.nombre ?? '',
  telefono: s?.telefono ?? '',
  estado: s?.estado ?? true,
});

export const sucursalesRepo = {
  async list() {
    const res = await apiFoodTrucks.get(ENDPOINT);
    return pickArray(res).map(mapSucursalFromApi);
  },
};
