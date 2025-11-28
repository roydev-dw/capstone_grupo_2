// src/utils/repoBoletas.js
import { apiFoodTrucks } from './api';

const EMITIR_BASE = 'v1/boletas/emitir/';
const BOLETAS_BASE = 'v1/boletas/';

const unwrapResponse = async (resp) => {
  if (resp && typeof resp === 'object' && typeof resp.json === 'function') {
    const clone = resp.clone?.() ?? resp;
    return clone.json();
  }
  return resp;
};

export const boletasRepo = {
  // 1) Emitir boleta para un pedido → devuelve boleta_id
  async emitirPorPedido(pedidoId) {
    const id = Number(pedidoId);
    if (!id || Number.isNaN(id)) {
      throw new Error('pedidoId valido es requerido para emitir boleta');
    }

    console.log('[BOLETAS] emitirPorPedido →', { pedidoId: id, url: `${EMITIR_BASE}${id}/` });

    const res = await apiFoodTrucks.post(`${EMITIR_BASE}${id}/`);
    const data = await unwrapResponse(res);

    console.log('[BOLETAS] emitirPorPedido ← respuesta cruda', data);

    // esperamos algo como:
    // { ok: true, boleta_id: 19, folio: 19, monto_total: "15456.00", ... }
    return data;
  },

  // 2) Generar PDF para una boleta ya emitida
  async generarPdf(boletaId) {
    const id = Number(boletaId);
    if (!id || Number.isNaN(id)) {
      throw new Error('boletaId valido es requerido para generar PDF');
    }

    const url = `${BOLETAS_BASE}${id}/generar-pdf/`;
    console.log('[BOLETAS] generarPdf →', { boletaId: id, url });

    const res = await apiFoodTrucks.post(url);
    const data = await unwrapResponse(res);

    console.log('[BOLETAS] generarPdf ← respuesta cruda', data);

    // tratamos de encontrar la URL del PDF de forma flexible
    const urlPdf = data?.url_pdf || data?.pdf_url || data?.url || data?.blob_url || data?.location || null;

    console.log('[BOLETAS] generarPdf ← urlPdf resuelta', urlPdf);

    return { raw: data, urlPdf };
  },

  // 3) Helper: emitir + generar PDF en una sola llamada
  async emitirYGenerarPdf({ pedidoId }) {
    console.log('[BOLETAS] emitirYGenerarPdf →', { pedidoId });

    const emitResp = await this.emitirPorPedido(pedidoId);
    const boletaId = emitResp?.boleta_id;

    if (!boletaId) {
      throw new Error('El backend no devolvio boleta_id al emitir la boleta');
    }

    const pdfResp = await this.generarPdf(boletaId);

    return {
      emitResp,
      pdfResp,
      boletaId,
    };
  },
};
