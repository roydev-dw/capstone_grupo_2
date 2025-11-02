// main.jsx
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { Login } from './pages/Login';
import { Vendedor } from './pages/Vendedor';
import { Supervisor } from './pages/Supervisor';
import { Administrador } from './pages/Administrador';
import RutaProtegida from './routes/RutaProtegida';
import RutaPublica from './routes/RutaPublica';
import AccesoProhibido from './pages/AccesoProhibido';

import '@fontsource/luckiest-guy';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/900.css';
import './index.css';

const AppRouter = () => {
  useEffect(() => {
    const onLogout = () => {
      console.log('[auth:logout] disparado → redirect /');
      localStorage.clear();
      window.location.replace('/');
    };
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Pública para invitados */}
        <Route
          path="/"
          element={
            <RutaPublica>
              <Login />
            </RutaPublica>
          }
        />
        {/* RUTA 403 PÚBLICA (sin guard) */}
        <Route path="/403" element={<AccesoProhibido />} />

        {/* Protegidas por rol */}
        <Route
          path="/vendedor"
          element={
            <RutaProtegida allow={['vendedor']} forbiddenTo="/403">
              <Vendedor />
            </RutaProtegida>
          }
        />
        <Route
          path="/supervisor"
          element={
            <RutaProtegida allow={['supervisor']} forbiddenTo="/403">
              <Supervisor />
            </RutaProtegida>
          }
        />
        <Route
          path="/admin"
          element={
            <RutaProtegida allow={['administrador']} forbiddenTo="/403">
              <Administrador />
            </RutaProtegida>
          }
        />
        {/* Catch-all al final */}
        <Route path="*" element={<Navigate to="/403" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);
