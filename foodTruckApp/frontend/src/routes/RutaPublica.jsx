import { Navigate, useLocation } from 'react-router-dom';
import { getAccessToken, getCurrentUser } from '../utils/session';
import { normalizeRoleName } from '../utils/roles';

/**
 * Envuelve rutas públicas (como el Login).
 * Si el usuario YA está autenticado, lo redirige a su dashboard según su rol.
 */
export default function PublicRoute({ children }) {
  const location = useLocation();
  const token = getAccessToken();
  const user = getCurrentUser();

  // Si hay sesión, lo enviamos a su área correspondiente
  if (token && user) {
    const role = normalizeRoleName(user.rol_nombre);
    let target = '/vendedor';

    if (role === 'administrador' || role === 'supervisor') {
      target = '/panel';
    } else if (role === 'vendedor') {
      target = '/vendedor';
    }

    return (
      <Navigate
        to={target}
        replace
        state={{ from: location }}
      />
    );
  }
  return <>{children}</>;
}
