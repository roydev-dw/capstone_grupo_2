// src/pages/Supervisor.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { UserMenu } from '../components/sesion_usuario/UserMenu';
import { Logo } from '../components/logo/Logo';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { clearSession } from '../utils/session';
import { PanelCategorias } from '../components/supervisor/PanelCategorias';
import { PanelProductos } from '../components/supervisor/PanelProductos';
import { EstadoEnLinea } from '../components/ui/EstadoEnLinea';

const SUCURSAL_ID = 1;
const SUCURSAL_NOMBRE = 'Sucursal Centro';

export const Supervisor = () => {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const [categoriasActivas, setCategoriasActivas] = useState([]);

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
          sucursalId={SUCURSAL_ID}
          sucursalNombre={SUCURSAL_NOMBRE}
          onAvailableChange={(activas) => setCategoriasActivas(activas)}
        />
        <PanelProductos categoriasActivas={categoriasActivas} />
      </div>
    </div>
  );
};
