import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { UserMenu } from '../components/sesion_usuario/UserMenu';
import { Logo } from '../components/logo/Logo';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { clearSession } from '../utils/session';
import { PanelProductos } from '../components/paneles/PanelProductos';
import { EstadoEnLinea } from '../components/ui/EstadoEnLinea';
import { PanelCategorias } from '../components/paneles/PanelCategorias';
import { PendingSyncTable } from '../components/sync/PendingSyncTable';
import { EMPRESA_PUNTO_SABOR_ID, perteneceAEmpresa } from '../utils/empresas';

export const Supervisor = () => {
  const navigate = useNavigate();
  const { user } = useCurrentUser();

  const [categoriasActivas, setCategoriasActivas] = useState([]);

  // Referencia local para poder hacer scroll al panel de productos
  const panelProdRef = useRef(null);

  const sessionUser = useMemo(() => {
    if (user) return user;
    try {
      const raw = localStorage.getItem('currentUser');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [user]);

  const sucursalId = sessionUser?.sucursal_id ?? sessionUser?.sucursalId ?? undefined;
  const sucursalNombre = sessionUser?.sucursal_nombre ?? sessionUser?.sucursalNombre ?? 'Sucursal sin asignar';

  useEffect(() => {
    if (!sessionUser) return;
    if (!perteneceAEmpresa(sessionUser, [EMPRESA_PUNTO_SABOR_ID])) {
      navigate('/403', { replace: true });
    }
  }, [sessionUser, navigate]);

  const logout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  return (
    <div className='min-h-screen'>
      <Toaster position='top-center' />
      <header className='bg-elemento shadow-md flex justify-center'>
        <div className='max-w-6xl w-full flex items-center justify-between px-4 py-3'>
          <Logo className='h-10 w-10' />
          <UserMenu user={user} onLogout={logout} />
        </div>
      </header>

      <div className='max-w-6xl mx-auto px-4 py-10 space-y-10'>
        <EstadoEnLinea className='py-4' />
        <PanelCategorias
          sucursalId={sucursalId}
          sucursalNombre={sucursalNombre}
          onAvailableChange={(activas) => setCategoriasActivas(activas)}
        />

        {/* Conectamos el ref para poder hacer scroll desde dentro del panel */}
        <PanelProductos
          ref={panelProdRef}
          categoriasActivas={categoriasActivas}
          sucursalId={sucursalId}
        />

        <PendingSyncTable />
      </div>
    </div>
  );
};
