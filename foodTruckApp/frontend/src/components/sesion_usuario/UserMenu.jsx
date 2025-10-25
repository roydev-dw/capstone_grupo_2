// components/sesion_usuario/UserMenu.jsx
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { clearSession } from '../../utils/session';

export const UserMenu = ({ user: userProp, onLogout }) => {
  const { user: hookUser } = useCurrentUser();
  const user = userProp || hookUser;
  const navigate = useNavigate();

  const displayName =
    user?.nombre_completo || user?.name || user?.email || 'Usuario';
  const displayRole = user?.rol_nombre || '';

  const handleLogout =
    onLogout ||
    (() => {
      clearSession();
      navigate('/login', { replace: true });
    });

  return (
    <div className="w-full flex justify-end items-cente">
      <div className="flex flex-col shadow-md rounded-md px-4 mr-4">
        <span className="text-sm font-semibold">{displayName}</span>
        {displayRole && (
          <span className="text-xs text-placeholder">{displayRole}</span>
        )}
      </div>
      <div>
        <button
          type="button"
          onClick={handleLogout}
          className="px-4 py-2 text-xs font-semibold text-white bg-primario rounded-md shadow hover:bg-[#aa7e3f] transition"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
};
