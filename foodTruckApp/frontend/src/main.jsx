// main.jsx
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { Login } from './pages/Login';
import { Vendedor } from './pages/Vendedor';
import { Supervisor } from './pages/Supervisor';
import { Administrador } from './pages/Administrador';
import { PanelOperaciones } from './pages/PanelOperaciones';
import RutaProtegida from './routes/RutaProtegida';
import RutaPublica from './routes/RutaPublica';
import AccesoProhibido from './pages/AccesoProhibido';
import { initSyncManager, resetSyncManager } from './utils/syncManager';
import { getAccessToken } from './utils/session';
import { EMPRESA_PUNTO_SABOR_ID } from './utils/empresas';
import { WebpayResultado } from './pages/webpayResultado';

import '@fontsource/luckiest-guy';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/900.css';
import './index.css';

const AppRouter = () => {
  useEffect(() => {
    const ensureSync = () => {
      try {
        if (getAccessToken()) {
          initSyncManager();
        }
      } catch {
        // ignore storage access errors (e.g. SSR)
      }
    };

    const onLogin = () => {
      ensureSync();
    };

    const onLogout = () => {
      resetSyncManager();
      localStorage.clear();
      window.location.replace('/login');
    };

    ensureSync();
    window.addEventListener('auth:login', onLogin);
    window.addEventListener('auth:logout', onLogout);
    return () => {
      window.removeEventListener('auth:login', onLogin);
      window.removeEventListener('auth:logout', onLogout);
    };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Publica para invitados */}
        <Route
          path='/'
          element={
            <RutaPublica>
              <Login />
            </RutaPublica>
          }
        />
        <Route
          path='/login'
          element={
            <RutaPublica>
              <Login />
            </RutaPublica>
          }
        />
        {/* RUTA 403 PUBLICA (sin guard) */}
        <Route path='/403' element={<AccesoProhibido />} />

        {/* Resultado Webpay (pública, sin guard) */}
        <Route path='/resultado' element={<WebpayResultado />} />

        {/* Protegidas por rol */}
        <Route
          path='/vendedor'
          element={
            <RutaProtegida
              allow={['vendedor', 'supervisor', 'administrador']}
              allowCompanies={[EMPRESA_PUNTO_SABOR_ID]}
              forbiddenTo='/403'>
              <Vendedor />
            </RutaProtegida>
          }
        />
        <Route
          path='/supervisor'
          element={
            <RutaProtegida
              allow={['supervisor', 'administrador']}
              allowCompanies={[EMPRESA_PUNTO_SABOR_ID]}
              forbiddenTo='/403'>
              <Supervisor />
            </RutaProtegida>
          }
        />
        <Route
          path='/panel'
          element={
            <RutaProtegida allow={['supervisor']} allowCompanies={[EMPRESA_PUNTO_SABOR_ID]} forbiddenTo='/403'>
              <PanelOperaciones />
            </RutaProtegida>
          }
        />
        <Route
          path='/admin'
          element={
            <RutaProtegida allow={['administrador']} allowCompanies={[EMPRESA_PUNTO_SABOR_ID]} forbiddenTo='/403'>
              <Administrador />
            </RutaProtegida>
          }
        />
        {/* Catch-all al final */}
        <Route path='*' element={<Navigate to='/403' replace />} />
      </Routes>
    </BrowserRouter>
  );
};

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);
