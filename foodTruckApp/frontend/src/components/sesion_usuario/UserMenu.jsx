import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { clearSession } from '../../utils/session';
import { Button } from '../ui/Button';
import { RoleNavigator } from '../navigation/RoleNavigator';

export const UserMenu = ({ user: userProp, onLogout, className = '' }) => {
  const { user: hookUser } = useCurrentUser();
  const user = userProp || hookUser;
  const navigate = useNavigate();

  const displayName = user?.nombre_completo || user?.name || user?.email || 'Usuario';
  const displayRole = user?.rol_nombre || '';

  const handleLogout =
    onLogout ||
    (() => {
      clearSession();
      navigate('/login', { replace: true });
    });

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <div className='flex items-center gap-3'>
        <RoleNavigator />
        <div className='flex flex-col text-right'>
          <span className='text-xl font-black text-secundario hidden md:block'>{displayName}</span>
          <span className='text-sm font-semibold text-primario hidden md:block'>{displayRole}</span>
        </div>
      </div>
      <Button color='secundario' onClick={handleLogout} className='ml-2'>
        Cerrar sesion
      </Button>
    </div>
  );
};
