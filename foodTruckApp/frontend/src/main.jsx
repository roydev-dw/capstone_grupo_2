import React from 'react';
import ReactDOM from 'react-dom/client';
import { Login } from './components/Login';
import { registerSW } from 'virtual:pwa-register';

import '@fontsource/poppins/400.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/900.css';

import './index.css';

const updateSW = registerSW({
  onNeedRefresh() {
    if (window.confirm('Nueva versión disponible. ¿Actualizar?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('La app está lista para usarse offline');
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Login />
  </React.StrictMode>
);
