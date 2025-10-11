/**
 * @fileoverview Archivo de entrada principal de la aplicación Food Truck.
 * Este archivo se encarga de:
 * 1. Renderizar el componente raíz de React en el DOM.
 * 2. Configurar el enrutador de la aplicación (`BrowserRouter`) con todas las rutas principales.
 * 3. Importar las fuentes y los estilos CSS globales.
 * @author roydev-dw
 * @version 1.0.0
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Vendedor } from './pages/Vendedor';
import { Administrador } from './pages/Administrador';
import { Supervisor } from './pages/Supervisor';

import '@fontsource/luckiest-guy';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/900.css';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/vendedor" element={<Vendedor />} />
        <Route path="/admin" element={<Administrador />} />
        <Route path="/supervisor" element={<Supervisor />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
