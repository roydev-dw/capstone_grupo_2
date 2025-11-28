import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../utils/db';
import { retryOutboxEntry, removeOutboxEntry, syncNow } from '../utils/syncManager';
import { Button } from '../components/ui/Button';

const STATUS_LABELS = {
  pending: 'Pendiente',
  sending: 'Enviando',
  error: 'Error',
  synced: 'Sincronizado',
};

const STATUS_COLORS = {
  pending: 'text-amber-600',
  sending: 'text-sky-600',
  error: 'text-red-600',
  synced: 'text-emerald-600',
};

function formatTs(ts) {
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function formatMonto(entry) {
  const cab = entry?.payload?.cabecera || {};
  const monto = Number(cab.total ?? cab.total_neto ?? cab.total_bruto ?? 0);
  return Number.isFinite(monto) && monto > 0
    ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(monto)
    : '-';
}

function formatNumeroPedido(entry) {
  const cab = entry?.payload?.cabecera || {};
  return cab.numeroPedido || cab.numero_pedido || 'Pendiente';
}

export const VentasPendientes = () => {
  const navigate = useNavigate();
  const entries =
    useLiveQuery(
      () => db.outbox.where('type').equals('pedido').reverse().toArray(),
      []
    ) || [];

  const hasWork = useMemo(() => entries.some((e) => e.status !== 'synced'), [entries]);

  const handleSync = async () => {
    await syncNow();
  };

  const handleRetry = async (key) => {
    await retryOutboxEntry(key);
  };

  const handleRemove = async (key) => {
    await removeOutboxEntry(key);
  };

  return (
    <div className='min-h-screen bg-fondo'>
      <header className='bg-white border-b border-gray-200 shadow-sm'>
        <div className='max-w-6xl mx-auto px-4 py-3 flex items-center justify-between'>
          <div>
            <p className='text-sm text-gray-500'>Modo vendedor</p>
            <h1 className='text-xl font-bold text-gray-800'>Ventas pendientes de sincronizaci&oacute;n</h1>
          </div>
          <div className='flex gap-2'>
            <Button color='secundario' onClick={() => navigate('/vendedor')}>
              Volver
            </Button>
            <Button color='primario' disabled={!hasWork} onClick={handleSync}>
              Sincronizar ahora
            </Button>
          </div>
        </div>
      </header>

      <main className='max-w-6xl mx-auto px-4 py-6'>
        {entries.length === 0 ? (
          <div className='bg-white border border-gray-200 rounded-lg p-6 shadow-sm text-gray-600'>
            No hay ventas pendientes. Todo est&aacute; sincronizado.
          </div>
        ) : (
          <div className='bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden'>
            <div className='flex items-center justify-between px-4 py-3 border-b border-gray-200'>
              <div>
                <p className='text-sm text-gray-500'>Ventas en cola</p>
                <p className='text-lg font-semibold text-gray-800'>
                  {entries.length} registro{entries.length === 1 ? '' : 's'}
                </p>
              </div>
              <Button color='secundario' disabled={!hasWork} onClick={handleSync}>
                Procesar pendientes
              </Button>
            </div>

            <div className='overflow-x-auto'>
              <table className='min-w-full text-sm'>
                <thead className='bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500'>
                  <tr>
                    <th className='px-4 py-3'>Pedido</th>
                    <th className='px-4 py-3'>Monto</th>
                    <th className='px-4 py-3'>Estado</th>
                    <th className='px-4 py-3'>Creado</th>
                    <th className='px-4 py-3 text-right'>Acciones</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-slate-100'>
                  {entries.map((entry) => {
                    const key = entry.key ?? entry.id;
                    const estado = entry.status || 'pending';
                    const statusLabel = STATUS_LABELS[estado] || estado;
                    const statusColor = STATUS_COLORS[estado] || 'text-slate-600';
                    return (
                      <tr key={key}>
                        <td className='px-4 py-3 text-slate-800 font-medium'>{formatNumeroPedido(entry)}</td>
                        <td className='px-4 py-3 text-slate-700'>{formatMonto(entry)}</td>
                        <td className={`px-4 py-3 font-semibold ${statusColor}`}>{statusLabel}</td>
                        <td className='px-4 py-3 text-slate-500'>{formatTs(entry.ts)}</td>
                        <td className='px-4 py-3 text-right space-x-2'>
                          {(estado === 'pending' || estado === 'error') && (
                            <button
                              type='button'
                              className='text-sm font-semibold text-sky-600 hover:text-sky-500'
                              onClick={() => handleRetry(key)}>
                              Reintentar
                            </button>
                          )}
                          {estado === 'error' && (
                            <button
                              type='button'
                              className='text-sm font-semibold text-red-600 hover:text-red-500'
                              onClick={() => handleRemove(key)}>
                              Descartar
                            </button>
                          )}
                          {estado === 'synced' && (
                            <button
                              type='button'
                              className='text-sm text-slate-400 hover:text-slate-600'
                              onClick={() => handleRemove(key)}>
                              Limpiar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
