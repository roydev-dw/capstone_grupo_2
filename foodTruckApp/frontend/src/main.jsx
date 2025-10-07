import React from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/poppins/400.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/900.css';
import '@fontsource/luckiest-guy';
import './index.css';
import { Login } from './pages/Login';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Login />
  </React.StrictMode>
);
