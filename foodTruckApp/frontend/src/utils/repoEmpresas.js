import { apiFoodTrucks } from './api';

const ENDPOINT = 'v1/empresas/';

const pickArray = (res) => {
  if (Array.isArray(res?.data?.results)) return res.data.results;
  if (Array.isArray(res?.results)) return res.results;
  if (Array.isArray(res)) return res;
  return [];
};

export const mapEmpresaFromApi = (e) => ({
  id: Number(e?.empresa_id ?? e?.id ?? 0),
  nombre: e?.nombre ?? '',
  rut: e?.rut ?? '',
  telefono: e?.telefono ?? '',
  email: e?.email ?? '',
  estado: e?.estado ?? true,
});

export const empresasRepo = {
  async list() {
    const res = await apiFoodTrucks.get(ENDPOINT);
    return pickArray(res).map(mapEmpresaFromApi);
  },
};
