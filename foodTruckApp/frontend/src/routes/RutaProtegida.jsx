// src/routes/ProtectedRoute.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getAccessToken } from '../utils/session';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { normalizeRoleName } from '../utils/roles';

/** Verifica si el usuario cumple con al menos uno de los roles requeridos. */
function hasRequiredRole(user, allow) {
  if (!allow) return true; // sin restricción
  const required = Array.isArray(allow) ? allow : [allow];

  const requiredNames = required
    .filter((r) => typeof r === 'string')
    .map((r) => normalizeRoleName(r));
  const requiredIds = required
    .filter((r) => typeof r === 'number')
    .map((n) => Number(n));

  const userRoleKey = normalizeRoleName(user?.rol_nombre);
  const userRoleId = user?.rol_id != null ? Number(user.rol_id) : null;

  const matchByName =
    requiredNames.length > 0 && requiredNames.includes(userRoleKey);
  const matchById =
    requiredIds.length > 0 &&
    userRoleId != null &&
    requiredIds.includes(userRoleId);

  if (requiredNames.length === 0 && requiredIds.length === 0) return true;
  return matchByName || matchById;
}

/**
 * Guard de ruta protegida.
 * - Si NO hay token/usuario → redirige a "/403"
 * - Si hay `allow`, exige rol (por nombre o id); si no cumple → "/403"
 */
export default function ProtectedRoute({
  children,
  allow,
  forbiddenTo = '/403',
}) {
  const location = useLocation();
  const token = getAccessToken();
  const { user, loadingUser, errorUser } = useCurrentUser({
    refreshFromApiIfIncomplete: true,
  });

  if (loadingUser) {
    return (
      <div className="min-h-[40vh] grid place-items-center text-sm text-gray-600">
        Cargando sesión…
      </div>
    );
  }

  // Sin token o sin usuario válido → 403
  if (!token || !user) {
    return <Navigate to={forbiddenTo} replace state={{ from: location }} />;
  }

  // Error cargando usuario → por seguridad, 403
  if (errorUser) {
    return <Navigate to={forbiddenTo} replace state={{ from: location }} />;
  }

  // Validación de roles (si aplica) → 403 si no cumple
  if (!hasRequiredRole(user, allow)) {
    return <Navigate to={forbiddenTo} replace />;
  }

  return <>{children}</>;
}
