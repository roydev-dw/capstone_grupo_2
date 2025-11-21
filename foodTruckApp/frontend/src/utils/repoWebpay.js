// src/utils/repoWebpay.js
import { apiFoodTrucks } from './api';

const BASE = 'v1/webpay/';
const STORAGE_KEY = 'lastWebpayTx';

const unwrapResponse = async (resp) => {
  if (resp && typeof resp === 'object' && typeof resp.json === 'function') {
    const clone = resp.clone?.() ?? resp;
    return clone.json();
  }
  return resp;
};

const persistLastTx = (data) => {
  if (typeof localStorage === 'undefined') return;
  if (!data) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('[WEBPAY] No se pudo guardar lastWebpayTx', err);
  }
};

const getLastTx = () => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[WEBPAY] No se pudo leer lastWebpayTx', err);
    return null;
  }
};

/**
 * buy_order esperado: "order_<pedidoId>_<transaccionId>"
 * Ej: "order_38_1763697514"
 */
const parseIdsFromBuyOrder = (buyOrder) => {
  const result = { pedido_id: null, transaccion_id: null };
  if (!buyOrder || typeof buyOrder !== 'string') return result;

  const partes = buyOrder.split('_');
  // ["order", "38", "1763697514"]
  if (partes.length >= 3) {
    const pedido = Number(partes[1]);
    const tx = Number(partes[2]);

    result.pedido_id = Number.isFinite(pedido) ? pedido : null;
    result.transaccion_id = Number.isFinite(tx) ? tx : null;
  }

  return result;
};

export const webpayRepo = {
  async init({ pedidoId, monto, returnUrl }) {
    const body = {
      pedido_id: Number(pedidoId),
      monto: Math.round(monto),
      return_url: returnUrl,
    };

    console.log('[WEBPAY] init - body', body);

    const res = await apiFoodTrucks.post(`${BASE}init/`, body);
    const data = await unwrapResponse(res);

    console.log('[WEBPAY] init - resp', data);

    persistLastTx({
      pedido_id: Number(pedidoId),
      transaccion_id: data?.transaccion_id ?? null,
      token_ws: data?.token ?? null,
      monto: Math.round(monto),
      estado: data?.estado ?? null,
      buy_order: data?.buy_order ?? null,
      createdAt: new Date().toISOString(),
    });

    return data;
  },

  async commit(tokenWs) {
    const body = { token_ws: tokenWs };
    console.log('[WEBPAY] commit - body', body);

    const res = await apiFoodTrucks.post(`${BASE}commit/`, body);
    const data = await unwrapResponse(res);

    console.log('[WEBPAY] commit - resp (raw)', data);

    // Lo que devuelve el backend (puede ser { transaccion: {...} } o el objeto plano)
    const txRaw = data?.transaccion ?? data;

    const lastTx = getLastTx();

    // Intentamos obtener los IDs desde la propia respuesta o desde el último registro
    let pedido_id = txRaw?.pedido_id ?? lastTx?.pedido_id ?? null;
    let transaccion_id = txRaw?.transaccion_id ?? lastTx?.transaccion_id ?? null;

    // Si siguen faltando, los parseamos desde buy_order
    const buyOrder = txRaw?.buy_order ?? data?.buy_order ?? lastTx?.buy_order ?? null;
    if (!pedido_id || !transaccion_id) {
      const parsed = parseIdsFromBuyOrder(buyOrder);
      if (!pedido_id && parsed.pedido_id) pedido_id = parsed.pedido_id;
      if (!transaccion_id && parsed.transaccion_id) transaccion_id = parsed.transaccion_id;
    }

    // Normalizamos la transacción que devolvemos al front
    const tx = {
      ...txRaw,
      pedido_id,
      transaccion_id,
      buy_order: buyOrder,
    };

    console.log('[WEBPAY] commit - transaccion normalizada', {
      estado: tx?.estado,
      pedido_id: tx?.pedido_id,
      transaccion_id: tx?.transaccion_id,
    });

    persistLastTx({
      pedido_id: tx?.pedido_id ?? null,
      transaccion_id: tx?.transaccion_id ?? null,
      token_ws: tokenWs,
      monto: tx?.monto ?? tx?.total ?? tx?.monto_total ?? tx?.webpay_response?.amount ?? null,
      estado: tx?.estado ?? data?.estado ?? null,
      buy_order: tx?.buy_order ?? buyOrder ?? null,
      updatedAt: new Date().toISOString(),
    });

    return tx;
  },

  async getTransaccionById(transaccionId) {
    if (!transaccionId) return null;
    const url = `${BASE}transacciones/${transaccionId}/`;

    console.log('[WEBPAY] getTransaccionById', { url });

    const res = await apiFoodTrucks.get(url);
    const data = await unwrapResponse(res);

    console.log('[WEBPAY] getTransaccionById - resp', data);

    return data?.transaccion ?? data;
  },

  async listTransacciones({ pedidoId, estado } = {}) {
    const params = new URLSearchParams();
    if (pedidoId) params.append('pedido_id', pedidoId);
    if (estado) params.append('estado', estado);

    const query = params.toString() ? `?${params.toString()}` : '';
    const url = `${BASE}transacciones/${query}`;

    console.log('[WEBPAY] listTransacciones', { url });

    const res = await apiFoodTrucks.get(url);
    const data = await unwrapResponse(res);

    console.log('[WEBPAY] listTransacciones - resp', data);

    const payload = data?.results ?? data?.items ?? data?.transacciones ?? data;

    return Array.isArray(payload) ? payload : [];
  },

  redirectToWebpay({ token, url }) {
    if (!token || !url) {
      console.error('[WEBPAY] redirectToWebpay: faltan token o url', { token, url });
      return;
    }

    console.log('[WEBPAY] Redirigiendo a Webpay', { url, token_ws: token });

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'token_ws';
    input.value = token;
    form.appendChild(input);

    document.body.appendChild(form);
    form.submit();
  },
};
