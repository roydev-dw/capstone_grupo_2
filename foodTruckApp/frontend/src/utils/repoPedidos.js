// src/utils/repoPedidos.js
import { apiFoodTrucks } from './api';

const ENDPOINT_BASE = 'v1/pedidos/';
const DETALLES_BASE = 'v1/pedidos/detalles/';

async function unwrapResponse(resp) {
  if (resp && typeof resp === 'object' && typeof resp.json === 'function') {
    const clone = resp.clone?.() ?? resp;
    return clone.json();
  }
  return resp;
}

// helper para armar notas desde los agregados del carrito
function buildNotasFromCartItem(item) {
  if (!item || !item.selectedOptions) return '';
  const parts = Object.values(item.selectedOptions)
    .map((opt) => opt?.name)
    .filter(Boolean);
  return parts.length ? `Extras: ${parts.join(', ')}` : '';
}

/**
 * Crea solo la CABECERA del pedido (sin detalles todavía).
 */
export const pedidosRepo = {
  async createCabecera({
    sucursalId,
    usuarioId,
    subtotal,
    iva,
    total,
    tipoVenta = 'Local',
    esOffline = false,
    descuentoTotal = 0,
    numeroPedido,
  }) {
    if (!sucursalId) throw new Error('sucursalId es requerido para crear el pedido');
    if (!usuarioId) throw new Error('usuarioId es requerido para crear el pedido');

    const body = {
      sucursal_id: Number(sucursalId),
      usuario_id: Number(usuarioId),
      numero_pedido: numeroPedido || `PED-${Date.now()}`,
      estado: 'Pendiente',
      tipo_venta: tipoVenta,
      es_offline: !!esOffline,
      total_bruto: Math.round(subtotal), // en CLP
      descuento_total: Math.round(descuentoTotal),
      iva: Math.round(iva),
      total_neto: Math.round(total),
    };

    const res = await apiFoodTrucks.post(ENDPOINT_BASE, body);
    const data = await unwrapResponse(res);
    return data?.pedido ?? data;
  },

  /**
   * Crea DETALLES + MODIFICADORES a partir del carrito.
   * Devuelve un array con { detalle, modificadores } por cada item del cart.
   */
  async createDetallesWithModificadores(pedidoId, cartItems = []) {
    const id = Number(pedidoId);
    if (!id || Number.isNaN(id)) {
      throw new Error('pedidoId válido es requerido para crear los detalles');
    }
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      console.log('[PEDIDOS] createDetallesWithModificadores: carrito vacío, no se crean detalles');
      return [];
    }

    const result = [];

    for (const item of cartItems) {
      const bodyDetalle = {
        producto_id: Number(item.id), // id del producto
        cantidad: Number(item.quantity || 1),
        descuento: 0,
        notas: buildNotasFromCartItem(item),
      };

      console.log('%c[PEDIDO] Creando DETALLE →', 'color:#f0f;font-weight:bold', {
        pedido_id: id,
        body: bodyDetalle,
      });

      const urlDetalle = `${ENDPOINT_BASE}${id}/detalles/`;
      const resDetalle = await apiFoodTrucks.post(urlDetalle, bodyDetalle);
      const dataDetalle = await unwrapResponse(resDetalle);
      const detalle = dataDetalle?.detalle ?? dataDetalle ?? null;

      console.log('%c[PEDIDO] Detalle creado ←', 'color:#f0f;font-weight:bold', detalle);

      const detalleId = detalle?.detalle_id ?? detalle?.id;
      const modsCreados = [];

      // Crear modificadores por detalle (si hay agregados en el item)
      if (detalleId && item.selectedOptions) {
        for (const opt of Object.values(item.selectedOptions)) {
          const rawId = opt?.id ?? opt?.modificador_id;
          const modificadorId = Number(rawId);
          if (!modificadorId || Number.isNaN(modificadorId)) continue;

          const extra = Number(opt.extraPrice || 0);
          const bodyMod = {
            modificador_id: modificadorId,
            valor_aplicado: extra,
            es_gratuito: extra === 0,
          };

          console.log('%c[PEDIDO] Creando MODIFICADOR DE DETALLE →', 'color:#0ff;font-weight:bold', {
            detalle_id: detalleId,
            body: bodyMod,
          });

          const urlMod = `${DETALLES_BASE}${detalleId}/modificadores/`;
          const resMod = await apiFoodTrucks.post(urlMod, bodyMod);
          const dataMod = await unwrapResponse(resMod);
          const mod = dataMod?.modificador ?? dataMod ?? null;

          console.log('%c[PEDIDO] Modificador de detalle creado ←', 'color:#0ff;font-weight:bold', mod);

          modsCreados.push(mod);
        }
      }

      result.push({ detalle, modificadores: modsCreados });
    }

    return result;
  },
};
