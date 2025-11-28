// src/pages/WebpayResultado.jsx
import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { webpayRepo } from '../utils/repoWebpay';
import { pedidosRepo } from '../utils/repoPedidos';
import { boletasRepo } from '../utils/repoBoletas';

export function WebpayResultado() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [tx, setTx] = useState(null);
  const [error, setError] = useState('');

  const [boletaUrl, setBoletaUrl] = useState('');
  const [boletaError, setBoletaError] = useState('');
  const [boletaLoading, setBoletaLoading] = useState(false);
  const [boletaId, setBoletaId] = useState(null);

  // PedidoId derivado de la transacción
  const pedidoId = useMemo(() => {
    if (!tx) return null;
    return tx.pedido_id ?? tx.pedido ?? null;
  }, [tx]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError('');

        const tokenWs = searchParams.get('token_ws');
        console.log('[WEBPAY] Resultado - token_ws recibido', { tokenWs });

        // 1) COMMIT con el token (solo una vez)
        let commitDetalle = null;
        if (tokenWs) {
          const alreadyCommitted = sessionStorage.getItem(`webpay-committed-${tokenWs}`) === '1';
          if (!alreadyCommitted) {
            try {
              commitDetalle = await webpayRepo.commit(tokenWs);
              sessionStorage.setItem(`webpay-committed-${tokenWs}`, '1');
              console.log('[WEBPAY] Commit ejecutado', commitDetalle);
            } catch (e) {
              console.error('[WEBPAY] Error en commit', e);
            }
          } else {
            console.log('[WEBPAY] Commit ya ejecutado para este token_ws, se omite llamada duplicada');
          }
        }

        // 2) Info previa en localStorage
        let info = null;
        try {
          const raw = localStorage.getItem('lastWebpayTx');
          if (raw) info = JSON.parse(raw);
        } catch (storageErr) {
          console.warn('[WEBPAY] No se pudo leer lastWebpayTx', storageErr);
        }

        // 3) Info opcional por querystring
        const pedidoFromQuery = searchParams.get('pedido_id');
        const txFromQuery = searchParams.get('transaccion_id');

        const pedidoIdBase = Number(pedidoFromQuery || commitDetalle?.pedido_id || info?.pedido_id || 0) || null;
        const txId = txFromQuery || commitDetalle?.transaccion_id || info?.transaccion_id || null;

        console.log('[WEBPAY] Resultado - IDs detectados', {
          pedidoIdBase,
          txId,
          info,
          pedidoFromQuery,
          txFromQuery,
        });

        if (!pedidoIdBase && !txId) {
          setError('No se encontro informacion de la transaccion.');
          return;
        }

        let detalle = commitDetalle;

        // 4) Completar info de la transacción si falta
        try {
          if (!detalle && txId) {
            console.log('[WEBPAY] Resultado - usando getTransaccionById', { txId });
            detalle = await webpayRepo.getTransaccionById(txId);
          } else if (!detalle && pedidoIdBase) {
            console.log('[WEBPAY] Resultado - usando listTransacciones por pedido', { pedidoIdBase });
            const lista = await webpayRepo.listTransacciones({ pedidoId: pedidoIdBase });
            detalle = Array.isArray(lista) && lista.length ? lista[lista.length - 1] : null;
          }
        } catch (e) {
          console.error('[WEBPAY] Error al obtener transaccion', e);
          throw e;
        }

        console.log('[WEBPAY] Resultado - detalle obtenido', detalle);

        if (!detalle) {
          setError('No se encontraron datos de la transaccion.');
          return;
        }

        setTx(detalle);
      } catch (err) {
        console.error('[WEBPAY] Error cargando resultado', err);
        setError(err?.message || 'Error cargando resultado de Webpay.');
      } finally {
        setLoading(false);
      }
    })();
  }, [searchParams]);

  const handleVolver = () => {
    navigate('/vendedor');
  };

  const handleVerBoleta = async () => {
    if (!pedidoId) {
      setBoletaError('No se pudo determinar el pedido para emitir la boleta.');
      return;
    }

    try {
      setBoletaLoading(true);
      setBoletaError('');

      console.log('[WEBPAY_RESULTADO] Ver boleta → inicio', {
        pedidoId,
        boletaIdActual: boletaId,
        boletaUrlActual: boletaUrl,
      });

      // Si ya tenemos URL guardada, solo la abrimos
      if (boletaUrl) {
        window.open(boletaUrl, '_blank');
        return;
      }

      // 1) Aseguramos que el pedido esté Finalizado
      console.log('[WEBPAY_RESULTADO] Actualizando estado de pedido a Finalizado', { pedidoId });
      const pedidoActualizado = await pedidosRepo.updateEstado(pedidoId, 'Finalizado');
      console.log('[WEBPAY_RESULTADO] Pedido actualizado ←', pedidoActualizado);

      let urlFinal = '';
      let boletaIdUsar = boletaId;

      // 2) Si no tenemos boleta aún → emitir + generar pdf
      if (!boletaIdUsar) {
        console.log('[WEBPAY_RESULTADO] No hay boletaId, llamando a emitirYGenerarPdf');
        const {
          emitResp,
          pdfResp,
          boletaId: nuevoId,
        } = await boletasRepo.emitirYGenerarPdf({
          pedidoId,
        });

        console.log('[WEBPAY_RESULTADO] emitirYGenerarPdf ←', { emitResp, pdfResp, boletaId: nuevoId });

        boletaIdUsar = nuevoId;
        urlFinal = pdfResp?.urlPdf || '';
      } else {
        // 3) Ya hay boleta emitida → solo regeneramos/obtenemos el PDF
        console.log('[WEBPAY_RESULTADO] Ya existe boletaId, solo generamos PDF', { boletaIdUsar });
        const pdfResp = await boletasRepo.generarPdf(boletaIdUsar);
        console.log('[WEBPAY_RESULTADO] generarPdf ←', pdfResp);
        urlFinal = pdfResp?.urlPdf || '';
      }

      setBoletaId(boletaIdUsar);

      if (urlFinal) {
        console.log('[WEBPAY_RESULTADO] Boleta con urlPdf', urlFinal);
        setBoletaUrl(urlFinal);
        window.open(urlFinal, '_blank');
      } else {
        console.warn('[WEBPAY_RESULTADO] No se obtuvo urlPdf desde generar-pdf');
        setBoletaError('No se recibio la URL del PDF desde el servidor.');
      }
    } catch (err) {
      console.error('[WEBPAY_RESULTADO] Error al ver boleta/PDF', err);
      setBoletaError(err?.message || 'No se pudo obtener la boleta en PDF.');
    } finally {
      setBoletaLoading(false);
    }
  };

  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-fondo'>
        <div className='bg-white shadow rounded-xl px-6 py-4'>
          <p className='text-lg font-semibold'>Procesando pago...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-fondo'>
        <div className='bg-white shadow rounded-xl px-6 py-6 max-w-md w-full text-center'>
          <h1 className='text-xl font-bold mb-2 text-red-600'>Error al obtener el resultado</h1>
          <p className='text-gray-700 mb-4'>{error}</p>
          <button
            onClick={handleVolver}
            className='px-4 py-2 rounded-md bg-primario text-white font-semibold hover:brightness-105'>
            Volver a vender
          </button>
        </div>
      </div>
    );
  }

  const estado = tx?.estado ?? 'desconocido';
  const monto = tx?.monto ?? tx?.monto_total ?? tx?.total ?? null;
  const esAutorizado = String(estado).toLowerCase() === 'autorizado';

  return (
    <div className='min-h-screen flex items-center justify-center bg-fondo'>
      <div className='bg-white shadow-xl rounded-2xl px-8 py-8 max-w-lg w-full'>
        <h1 className='text-2xl font-bold mb-4 text-center'>
          {esAutorizado ? 'Pago realizado con exito' : 'Pago no autorizado'}
        </h1>

        <div className='space-y-2 text-sm text-gray-700 mb-4'>
          <p>
            <span className='font-semibold'>Estado:</span> {estado}
          </p>
          <p>
            <span className='font-semibold'>Pedido:</span> {pedidoId ?? '??'}
          </p>
          {monto != null && (
            <p>
              <span className='font-semibold'>Monto:</span> ${Number(monto).toLocaleString('es-CL')}
            </p>
          )}
          {tx?.transaccion_id && (
            <p>
              <span className='font-semibold'>Transaccion:</span> {tx.transaccion_id}
            </p>
          )}
        </div>

        {esAutorizado && (
          <div className='mb-4 text-sm text-center'>
            <p className='text-gray-700'>Tu pago fue autorizado. Puedes ver la boleta electronica cuando desees.</p>
            {boletaError && <p className='mt-2 text-amber-600'>{boletaError}</p>}
          </div>
        )}

        <div className='flex flex-col sm:flex-row justify-center gap-3'>
          {esAutorizado && (
            <button
              onClick={handleVerBoleta}
              disabled={boletaLoading}
              className='px-4 py-2 rounded-md bg-emerald-600 text-white font-semibold hover:brightness-105 disabled:opacity-60'>
              {boletaLoading ? 'Abriendo boleta...' : 'Ver boleta'}
            </button>
          )}

          <button
            onClick={handleVolver}
            className='px-4 py-2 rounded-md bg-primario text-white font-semibold hover:brightness-105'>
            Volver a vender
          </button>
        </div>
      </div>
    </div>
  );
}
