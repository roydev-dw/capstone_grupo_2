// src/utils/repoPedidos.js
import { apiFoodTrucks } from './api';
import { isOnline } from './db';
import { enqueueOutbox } from './offlineQueue';

const ENDPOINT_BASE = 'v1/pedidos/';
const DETALLES_BASE = 'v1/pedidos/detalles/';
const OUTBOX_TYPE = 'pedido';
const OUTBOX_OP_CASH = 'cash';

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

function normalizeCartItems(cartItems = []) {
  return cartItems
    .map((item) => {
      const selected = item?.selectedOptions
        ? Object.entries(item.selectedOptions).reduce((acc, [key, opt]) => {
            acc[key] = {
              id: opt?.id ?? opt?.modificador_id ?? opt?.modificadorId ?? null,
              name: opt?.name ?? opt?.nombre ?? key,
              extraPrice: Number(opt?.extraPrice ?? opt?.valor_aplicado ?? opt?.valor ?? 0),
            };
            return acc;
          }, {})
        : undefined;

      return {
        id: item?.id ?? item?.producto_id ?? item?.productoId ?? item?.productId ?? null,
        quantity: Number(item?.quantity || 1),
        selectedOptions: selected,
        name: item?.name ?? item?.nombre ?? '',
        price: Number(item?.price ?? item?.precio ?? item?.precio_base ?? 0),
        precioFinalUnitario: Number(item?.precioFinalUnitario ?? item?.price ?? 0),
      };
    })
    .filter((item) => item.id != null);
}

function buildCabeceraPayload({
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
  return {
    sucursalId,
    usuarioId,
    subtotal,
    iva,
    total,
    tipoVenta,
    esOffline,
    descuentoTotal,
    numeroPedido,
  };
}

function shouldQueuePedidoError(err) {
  if (!err) return true;
  const status = err?.status ?? err?.response?.status;
  if (typeof status === 'number') {
    if (status >= 500 || status === 408 || status === 429 || status === 0) return true;
    return false;
  }
  return !isOnline();
}

async function createPedidoCompleto({ cabeceraPayload, cartItems }) {
  const pedidoCreado = await pedidosRepo.createCabecera(cabeceraPayload);
  const pedidoId = pedidoCreado?.pedido_id ?? pedidoCreado?.id;
  if (!pedidoId) {
    throw new Error('No se obtuvo pedido_id para crear los detalles');
  }
  const detalles = await pedidosRepo.createDetallesWithModificadores(pedidoId, cartItems);
  await pedidosRepo.updateEstado(pedidoId, 'Finalizado').catch(() => {});
  return { pedido: pedidoCreado, pedidoId, detalles };
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

    console.log('[PEDIDOS] createCabecera body enviado ->', body);
    const res = await apiFoodTrucks.post(ENDPOINT_BASE, body);
    const data = await unwrapResponse(res);
    return data?.pedido ?? data;
  },

  async registrarPagoEfectivo({
    sucursalId,
    usuarioId,
    subtotal,
    iva,
    total,
    cartItems = [],
    descuentoTotal = 0,
    numeroPedido,
    tipoVenta = 'Local',
  }) {
    if (!sucursalId) throw new Error('sucursalId es requerido para registrar pago en efectivo');
    if (!usuarioId) throw new Error('usuarioId es requerido para registrar pago en efectivo');

    const cartNormalized = normalizeCartItems(cartItems);
    if (!cartNormalized.length) {
      throw new Error('No hay productos en el carrito para generar el pedido');
    }

    const numero = numeroPedido || `PED-${Date.now()}`;
    const cabeceraBase = buildCabeceraPayload({
      sucursalId,
      usuarioId,
      subtotal,
      iva,
      total,
      tipoVenta,
      descuentoTotal,
      numeroPedido: numero,
      esOffline: false,
    });

    if (isOnline()) {
      try {
        const resultado = await createPedidoCompleto({
          cabeceraPayload: cabeceraBase,
          cartItems: cartNormalized,
        });
        return { status: 'online', ...resultado };
      } catch (err) {
        console.warn('[PEDIDOS] Pago en efectivo online fallo, se encola para sincronizar', err);
        if (!shouldQueuePedidoError(err)) {
          throw err;
        }
      }
    }

    const entry = await enqueueOutbox({
      type: OUTBOX_TYPE,
      op: OUTBOX_OP_CASH,
      payload: {
        cabecera: { ...cabeceraBase, esOffline: true },
        items: cartNormalized,
      },
    });

    return { status: 'queued', entry };
  },

  async updateEstado(pedidoId, nuevoEstado = 'Finalizado') {
    const id = Number(pedidoId);
    if (!id || Number.isNaN(id)) {
      throw new Error('pedidoId valido es requerido para actualizar el estado');
    }

    const body = { estado: nuevoEstado };

    const res = await apiFoodTrucks.patch(`${ENDPOINT_BASE}${id}/`, body);
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

async function processPedidoCashEntry(entry) {
  const payload = entry?.payload ?? {};
  const cabecera = payload?.cabecera;
  const items = normalizeCartItems(payload?.items || payload?.cartItems || []);
  if (!cabecera || !items.length) {
    throw new Error('Entrada de outbox de pedido incompleta: faltan cabecera o items');
  }

  const cabeceraPayload = {
    ...cabecera,
    esOffline: cabecera?.esOffline ?? true,
  };

  return createPedidoCompleto({ cabeceraPayload, cartItems: items });
}

export async function processPedidoOutboxEntry(entry) {
  if (!entry) return null;
  if (entry.op === OUTBOX_OP_CASH) return processPedidoCashEntry(entry);
  throw new Error(`Operacion de outbox pedidos desconocida: ${entry.op}`);
}
