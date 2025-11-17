// src/utils/repoProductoModificadores.js
import { apiFoodTrucks } from './api';

export const productoModificadoresRepo = {
  async list(productoId) {
    const id = String(productoId ?? '').trim();
    if (!id) throw new Error('ID de producto requerido');

    const res = await apiFoodTrucks.get(`v1/productos/${id}/modificadores/`);
    return res.data?.results ?? res.data ?? [];
  },

  async attach(productoId, modificadorId, es_obligatorio = false) {
    const pid = String(productoId).trim();
    const mid = String(modificadorId).trim();
    if (!pid || !mid) throw new Error('Producto o modificador inválido');

    const body = { modificador_id: mid, es_obligatorio };
    const res = await apiFoodTrucks.post(`v1/productos/${pid}/modificadores/`, body);
    return res.data ?? {};
  },

  async update(productoId, modificadorId, es_obligatorio = false) {
    const pid = String(productoId).trim();
    const mid = String(modificadorId).trim();
    if (!pid || !mid) throw new Error('Producto o modificador inválido');

    const body = { modificador_id: mid, es_obligatorio };
    const res = await apiFoodTrucks.put(`v1/productos/${pid}/modificadores/`, body);
    return res.data ?? {};
  },

  async detach(productoId, modificadorId) {
    const pid = String(productoId).trim();
    const mid = String(modificadorId).trim();
    if (!pid || !mid) throw new Error('Producto o modificador inválido');

    const body = { modificador_id: mid };
    const res = await apiFoodTrucks.delete(`v1/productos/${pid}/modificadores/`, {
      data: body,
    });
    return res.data ?? {};
  },
};
