// hooks/useCurrentUser.js
import { useEffect, useState } from 'react';
import { apiFoodTrucks } from '../utils/api';
import { getStoredUser } from '../utils/session';

// normaliza campos desde distintas formas posibles
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
    // por si más adelante quieres todo el objeto crudo
    _raw: u,
  };
}

/**
 * Lee el usuario logueado desde localStorage.
 * Si faltan `rol_nombre` o `nombre_completo`, intenta refrescar desde la API:
 *   GET v1/usuarios/  (y matchea por id o email)
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
        // 1) desde storage
        const stored = mapUser(getStoredUser());
        setUser(stored);

        // 2) refresco opcional si faltan datos críticos
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
          if (stored?.id) {
            match = list.find((u) => (u.id ?? u.usuario_id) === stored.id);
          }
          if (!match && stored?.email) {
            match = list.find((u) => u.email === stored.email);
          }
          if (match) {
            const mapped = mapUser(match);
            setUser(mapped);
            // opcional: re-grabar currentUser completo
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
