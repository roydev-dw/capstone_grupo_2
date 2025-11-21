// src/pages/WebpayResultado.jsx
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { webpayRepo } from '../utils/repoWebpay';

export function WebpayResultado() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [tx, setTx] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError('');

        const tokenWs = searchParams.get('token_ws');
        console.log('[WEBPAY] Resultado - token_ws recibido', { tokenWs });

        // 1) Intentamos COMMIT con el token entregado por Webpay (solo una vez por token)
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

        // 2) Info previa en localStorage (guardada al iniciar Webpay)
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

        const pedidoId = Number(pedidoFromQuery || commitDetalle?.pedido_id || info?.pedido_id || 0) || null;
        const txId = txFromQuery || commitDetalle?.transaccion_id || info?.transaccion_id || null;

        console.log('[WEBPAY] Resultado - IDs detectados', {
          pedidoId,
          txId,
          info,
          pedidoFromQuery,
          txFromQuery,
        });

        if (!pedidoId && !txId) {
          setError('No se encontro informacion de la transaccion.');
          return;
        }

        let detalle = commitDetalle;

        // 4) Consultamos los datos reales de la transaccion si aun falta info
        try {
          if (!detalle && txId) {
            console.log('[WEBPAY] Resultado - usando getTransaccionById', { txId });
            detalle = await webpayRepo.getTransaccionById(txId);
          } else if (!detalle && pedidoId) {
            console.log('[WEBPAY] Resultado - usando listTransacciones por pedido', { pedidoId });
            const lista = await webpayRepo.listTransacciones({ pedidoId });
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
  const pedidoId = tx?.pedido_id ?? tx?.pedido ?? '??';
  const monto = tx?.monto ?? tx?.monto_total ?? tx?.total ?? null;
  const esAutorizado = String(estado).toLowerCase() === 'autorizado';

  return (
    <div className='min-h-screen flex items-center justify-center bg-fondo'>
      <div className='bg-white shadow-xl rounded-2xl px-8 py-8 max-w-lg w-full'>
        <h1 className='text-2xl font-bold mb-4 text-center'>
          {esAutorizado ? 'Pago realizado con exito' : 'Pago no autorizado'}
        </h1>

        <div className='space-y-2 text-sm text-gray-700 mb-6'>
          <p>
            <span className='font-semibold'>Estado:</span> {estado}
          </p>
          <p>
            <span className='font-semibold'>Pedido:</span> {pedidoId}
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

        <div className='flex justify-center'>
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
