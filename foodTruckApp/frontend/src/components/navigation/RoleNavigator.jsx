import { useEffect, useMemo, useState } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { normalizeRoleName } from '../../utils/roles';
import { IoArrowUndo } from 'react-icons/io5';

const ADJACENCY_BY_ROLE = {
  vendedor: {
    '/vendedor': {},
  },
  supervisor: {
    '/vendedor': { prev: '/panel' },
    '/supervisor': { prev: '/panel' },
    '/panel': {},
  },
  administrador: {
    '/admin': { prev: '/panel' },
  },
};

const PATHS = ['/panel', '/vendedor', '/supervisor', '/admin'];

export const RoleNavigator = ({ className = '' }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const role = normalizeRoleName(user?.rol_nombre);

  const [isNavigating, setIsNavigating] = useState(false);
  useEffect(() => {
    setIsNavigating(false);
  }, [location.pathname]);

  const currentNode = useMemo(() => {
    for (const p of PATHS) {
      if (matchPath({ path: p + '/*', end: false }, location.pathname) || location.pathname === p) {
        return p;
      }
    }
    return null;
  }, [location.pathname]);

  const adjacency = useMemo(() => (role ? ADJACENCY_BY_ROLE[role] : {}), [role]);
  const { prev } = adjacency[currentNode] || {};

  const goBack = () => {
    if (!prev || isNavigating) return;
    setIsNavigating(true);
    navigate(prev);
  };

  if (!prev) return null;

  const buttonClass =
    'bg-primario text-white rounded-md px-4 py-2 hover:bg-primario/60 hover:scale-105 duration-200 ease-in-out flex items-center gap-2 mr-4 font-semibold';

  return (
    <button
      type='button'
      className={`${buttonClass} ${className}`}
      onClick={goBack}
      disabled={isNavigating}
      title='Volver atrás'
      aria-label='Volver atrás'>
      <IoArrowUndo />
      Volver
    </button>
  );
};
