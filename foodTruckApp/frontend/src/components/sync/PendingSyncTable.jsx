import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../utils/db';
import {
  removeOutboxEntry,
  retryOutboxEntry,
  syncNow,
} from '../../utils/syncManager';

const STATUS_LABELS = {
  pending: 'Pendiente',
  sending: 'Enviando',
  error: 'Error',
  synced: 'Sincronizado',
};

const TYPE_LABELS = {
  product: 'Producto',
  category: 'Categoria',
};

const OP_LABELS = {
  create: 'Crear',
  update: 'Actualizar',
  delete: 'Eliminar',
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

export const PendingSyncTable = () => {
  const entries =
    useLiveQuery(
      () => db.outbox.orderBy('ts').reverse().toArray(),
      []
    ) || [];

  const hasEntries = entries.length > 0;

  const totals = useMemo(() => {
    const counters = { pending: 0, sending: 0, error: 0 };
    for (const entry of entries) {
      if (entry.status in counters) counters[entry.status] += 1;
    }
    return counters;
  }, [entries]);

  if (!hasEntries) {
    return (
      <section className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-700">
            Cola de sincronizacion
          </h2>
          <button
            type="button"
            className="text-sm px-3 py-1.5 rounded bg-slate-100 text-slate-500 cursor-not-allowed"
            disabled
          >
            Sincronizar ahora
          </button>
        </div>
        <p className="text-sm text-gray-500">
          No hay operaciones pendientes. Todo esta sincronizado.
        </p>
      </section>
    );
  }

  const handleSyncNow = async () => {
    await syncNow();
  };

  const handleRetry = async (key) => {
    await retryOutboxEntry(key);
  };

  const handleRemove = async (key) => {
    await removeOutboxEntry(key);
  };

  const handleDiscard = async (key) => {
    const shouldDiscard =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            'Esta operación no se pudo sincronizar. ¿Deseas descartarla?'
          );
    if (!shouldDiscard) return;
    await removeOutboxEntry(key);
  };

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-700">
            Cola de sincronizacion
          </h2>
          <p className="text-xs text-gray-500">
            Pendientes: {totals.pending} | Enviando: {totals.sending} | Errores:{' '}
            {totals.error}
          </p>
        </div>
          <button
          type="button"
          className="px-3 py-1.5 text-sm font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-500 transition"
          onClick={handleSyncNow}
        >
          Sincronizar ahora
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Operacion</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Ultimo intento</th>
              <th className="px-3 py-2">Detalle</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const key = entry.key ?? entry.id;
              const statusLabel = STATUS_LABELS[entry.status] || entry.status;
              const typeLabel = TYPE_LABELS[entry.type] || entry.type;
              const opLabel = OP_LABELS[entry.op] || entry.op;
              const statusColor =
                STATUS_COLORS[entry.status] || 'text-slate-600';
              return (
                <tr key={`${entry.type}-${entry.op}-${key}`}>
                  <td className="px-3 py-2 text-slate-700">{typeLabel}</td>
                  <td className="px-3 py-2 text-slate-600">{opLabel}</td>
                  <td className={`px-3 py-2 font-medium ${statusColor}`}>
                    {statusLabel}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {formatTs(entry.ts)}
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">
                    {entry.error ? entry.error : '-'}
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    {(entry.status === 'error' || entry.status === 'pending') && (
                      <button
                        type="button"
                        className="text-sm font-semibold text-sky-600 hover:text-sky-500"
                        onClick={() => handleRetry(key)}
                      >
                        Reintentar
                      </button>
                    )}
                    {entry.status === 'error' && (
                      <button
                        type="button"
                        className="text-sm font-semibold text-red-600 hover:text-red-500"
                        onClick={() => handleDiscard(key)}
                      >
                        Descartar
                      </button>
                    )}
                    {entry.status === 'synced' && (
                      <button
                        type="button"
                        className="text-sm text-slate-400 hover:text-slate-600"
                        onClick={() => handleRemove(key)}
                      >
                        Limpiar
                      </button>
                    )}
                    {entry.status === 'sending' && (
                      <span className="text-xs text-slate-400">
                        Procesando...
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
