import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { UserMenu } from '../components/sesion_usuario/UserMenu';
import { Logo } from '../components/logo/Logo';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { clearSession } from '../utils/session';
import { PanelProductos } from '../components/supervisor/PanelProductos';
import { EstadoEnLinea } from '../components/ui/EstadoEnLinea';
import { PanelCategorias } from '../components/supervisor/PanelCategorias';
import { PendingSyncTable } from '../components/sync/PendingSyncTable';

export const Supervisor = () => {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const [categoriasActivas, setCategoriasActivas] = useState([]);
  const sessionUser = useMemo(() => {
    if (user) return user;
    try {
      const raw = localStorage.getItem('currentUser');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [user]);
  const sucursalId =
    sessionUser?.sucursal_id ?? sessionUser?.sucursalId ?? undefined;
  const sucursalNombre =
    sessionUser?.sucursal_nombre ??
    sessionUser?.sucursalNombre ??
    'Sucursal sin asignar';

  const logout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" />
      <header className="bg-elemento shadow-md flex justify-center">
        <div className="max-w-6xl flex items-center px-4 py-2">
          <div className="w-6xl flex justify-end">
            <Logo className="w-10 h-10" />
            <UserMenu user={user} onLogout={logout} />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-10 space-y-10">
        <EstadoEnLinea />
        <PanelCategorias
          sucursalId={sucursalId}
          sucursalNombre={sucursalNombre}
          onAvailableChange={(activas) => setCategoriasActivas(activas)}
        />
        <PanelProductos categoriasActivas={categoriasActivas} />
        <PendingSyncTable />
      </div>
    </div>
  );
};
