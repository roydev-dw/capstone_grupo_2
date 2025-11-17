import { Navigate, useLocation } from 'react-router-dom';
import { getAccessToken } from '../utils/session';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { normalizeRoleName } from '../utils/roles';
import { getEmpresaIdFromUser } from '../utils/empresas';

const redirectToLogin = '/login';

function hasRequiredRole(user, allow) {
  if (!allow) return true; // sin restricción
  const required = Array.isArray(allow) ? allow : [allow];
  const requiredNames = required.filter((r) => typeof r === 'string').map((r) => normalizeRoleName(r));
  const requiredIds = required.filter((r) => typeof r === 'number').map((n) => Number(n));
  const userRoleKey = normalizeRoleName(user?.rol_nombre);
  const userRoleId = user?.rol_id != null ? Number(user.rol_id) : null;
  const matchByName = requiredNames.length > 0 && requiredNames.includes(userRoleKey);
  const matchById = requiredIds.length > 0 && userRoleId != null && requiredIds.includes(userRoleId);

  if (requiredNames.length === 0 && requiredIds.length === 0) return true;
  return matchByName || matchById;
}

function hasRequiredCompany(user, allowCompanies) {
  if (!allowCompanies) return true;
  const required = Array.isArray(allowCompanies) ? allowCompanies : [allowCompanies];
  const normalized = required
    .map((value) => {
      if (value == null || value === '') return null;
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    })
    .filter((value) => value != null);

  if (normalized.length === 0) return true;

  const userCompanyId = getEmpresaIdFromUser(user);

  if (userCompanyId == null) return false;
  return normalized.includes(Number(userCompanyId));
}

export default function ProtectedRoute({ children, allow, allowCompanies, forbiddenTo = '/403' }) {
  const location = useLocation();
  const token = getAccessToken();
  const { user, loadingUser, errorUser } = useCurrentUser({
    refreshFromApiIfIncomplete: true,
  });

  if (loadingUser) {
    return <div className='min-h-[40vh] grid place-items-center text-sm text-gray-600'>Cargando sesión…</div>;
  }

  if (!token) {
    return (
      <Navigate
        to={redirectToLogin}
        replace
        state={{ from: location }}
      />
    );
  }

  if (!user || errorUser) {
    return (
      <Navigate
        to={forbiddenTo}
        replace
        state={{ from: location }}
      />
    );
  }

  if (!hasRequiredRole(user, allow)) {
    return (
      <Navigate
        to={forbiddenTo}
        replace
      />
    );
  }

  if (!hasRequiredCompany(user, allowCompanies)) {
    return (
      <Navigate
        to={forbiddenTo}
        replace
      />
    );
  }

  return <>{children}</>;
}
