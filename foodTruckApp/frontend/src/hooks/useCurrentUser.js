import { useEffect, useState } from 'react';
import { apiFoodTrucks } from '../utils/api';
import { getCurrentUser } from '../utils/session';

// Normaliza campos desde distintas formas posibles.
function mapUser(u) {
  if (!u) return null;
  return {
    id: u.id ?? u.usuario_id ?? null,
    nombre_completo: u.nombre_completo ?? '',
    email: u.email ?? '',
    rol_id: u.rol_id ?? null,
    rol_nombre: u.rol_nombre ?? u.rol ?? u.role ?? '',
    sucursal_id: u.sucursal_id ?? null,
    sucursal_nombre: u.sucursal_nombre ?? '',
    avatar: u.avatar ?? '',
    empresa_id: u.empresa_id ?? u.company_id ?? null,
    empresa_nombre: u.empresa_nombre ?? u.company_name ?? '',
    sucursales_ids: Array.isArray(u.sucursales_ids ?? u.sucursales)
      ? (u.sucursales_ids ?? u.sucursales).map((value) => {
          if (typeof value === 'number') return value;
          if (typeof value === 'string') {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
          }
          if (typeof value === 'object') {
            const candidate = value?.id ?? value?.sucursal_id ?? value?.sucursalId ?? null;
            const parsed = Number(candidate);
            return Number.isFinite(parsed) ? parsed : null;
          }
          return null;
        }).filter((value) => value != null)
      : [],
    _raw: u, // conserva el payload original para depurar.
  };
}

/**
 * Obtiene y mantiene sincronizado el usuario autenticado desde storage y la API de Punto Sabor.
 *
 * @param {{refreshFromApiIfIncomplete?: boolean}} [options] Controla si se reconsulta
 * la API via `GET v1/usuarios/` cuando faltan datos criticos en cache.
 * @returns {{user: ReturnType<typeof mapUser>, loadingUser: boolean, errorUser: string, setUser: import('react').Dispatch<import('react').SetStateAction<ReturnType<typeof mapUser>>>}}
 * Estado y setters para consumir informacion del usuario actual en componentes React.
 * @example
 * ```jsx
 * const { user, loadingUser } = useCurrentUser();
 * if (loadingUser) return <Spinner />;
 * return <span>{user?.nombre_completo}</span>;
 * ```
 * @remarks Primero lee desde `localStorage` y, si faltan `rol_nombre` o `nombre_completo`,
 * sincroniza contra la API de Punto Sabor para mantener los datos consistentes.
 */
export function useCurrentUser({ refreshFromApiIfIncomplete = true } = {}) {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [errorUser, setErrorUser] = useState('');

  useEffect(() => {
    (async () => {
      setLoadingUser(true);
      setErrorUser('');
      try {
        const stored = mapUser(getCurrentUser());
        setUser(stored);

        const needsRefresh =
          refreshFromApiIfIncomplete &&
          (!stored?.rol_nombre || !stored?.nombre_completo);

        if (needsRefresh) {
          const res = await apiFoodTrucks.get('v1/usuarios/');
          const list = Array.isArray(res?.data?.results)
            ? res.data.results
            : Array.isArray(res?.results)
            ? res.results
            : Array.isArray(res)
            ? res
            : [];

          let match = null;
          if (stored?.id != null) {
            match = list.find((u) => {
              const uid = u.id ?? u.usuario_id;
              return uid != null && Number(uid) === Number(stored.id);
            });
          }
          if (!match && stored?.email) {
            const storedEmail = String(stored.email).trim().toLowerCase();
            match = list.find(
              (u) =>
                String(u.email ?? u.correo ?? '').trim().toLowerCase() ===
                storedEmail
            );
          }
          if (match) {
            const mapped = mapUser(match);
            setUser(mapped);
            localStorage.setItem('currentUser', JSON.stringify(match));
          }
        }
      } catch (e) {
        setErrorUser(e?.message || 'No se pudo obtener el usuario actual');
      } finally {
        setLoadingUser(false);
      }
    })();
  }, [refreshFromApiIfIncomplete]);

  return { user, loadingUser, errorUser, setUser };
}





