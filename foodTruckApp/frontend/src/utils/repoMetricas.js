// src/utils/repoMetricas.js
import { apiFoodTrucks } from './api';

const ENDPOINT = 'v1/metricas/';

export const metricasRepo = {
  async getDashboard(params = {}) {
    const { empresaId, sucursalId } = params;

    const searchParams = new URLSearchParams();

    if (empresaId != null) searchParams.append('empresa_id', String(empresaId));
    if (sucursalId != null) searchParams.append('sucursal_id', String(sucursalId));

    const qs = searchParams.toString();
    const url = qs ? `${ENDPOINT}?${qs}` : ENDPOINT;

    const response = await apiFoodTrucks.get(url);

    return response;
  },
};
