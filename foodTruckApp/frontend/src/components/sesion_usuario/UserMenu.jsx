import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { clearSession } from '../../utils/session';
import { Button } from '../ui/Button';

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
      <div className="flex flex-col items-center justify-center mr-6">
        <span className="text-md font-semibold text-primario">
          {displayRole}
        </span>
        <span className="text-md font-semibold text-secundario">
          {displayName}
        </span>
      </div>
      <div className="flex items-center justify-center">
        <Button color="secundario" onClick={handleLogout}>
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
};
