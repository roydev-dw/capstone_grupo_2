import { useNavigate } from 'react-router-dom';
import { clearSession } from '../../utils/session';
import { Logo } from '../logo/Logo';
import { Button } from '../ui/Button';

export const Header = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  return (
    <header className="fixed lg:relative top-0 left-0 right-0 z-10 bg-white/60 backdrop-blur-sm lg:bg-transparent flex items-center justify-between p-4 pb-2 shadow-xl shadow-black/50 lg:shadow-none rounded-bl-4xl rounded-br-4xl lg:rounded-none">
      <div className="flex flex-1 items-center justify-start pl-8">
        <Logo alineacion="justify-start" />
      </div>
      <Button type="button" onClick={handleLogout} color="secundario">
        Cerrar sesion
      </Button>
    </header>
  );
};
