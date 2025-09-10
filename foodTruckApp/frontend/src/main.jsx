import React from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';

function App() {
  return <h1>Hello, Food Truck App!</h1>;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
