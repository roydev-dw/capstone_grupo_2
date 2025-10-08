import { useState, useEffect } from 'react';
import { Header } from '../components/vendedor/Header';
import { BarraBusqueda } from '../components/vendedor/BarraBusqueda';
import { FiltroCategoria } from '../components/vendedor/FiltroCategoria';
import { TarjetaProducto } from '../components/vendedor/TarjetaProducto';
import { BotonTarjeta } from '../components/vendedor/BotonTarjeta';

export const Vendedor = () => {
  const [productos, setProductos] = useState([]);

  useEffect(() => {
    fetch('/productos.json')
      .then((res) => res.json())
      .then((data) => setProductos(data))
      .catch((err) => console.error('Error al cargar productos:', err));
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark font-display">
      <Header />
      <main className="flex-1 p-6 lg:p-12 max-w-screen-xl mx-auto w-full">
        <BarraBusqueda />
        <FiltroCategoria />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {' '}
          {productos.map((p) => (
            <TarjetaProducto key={p.id} product={p} />
          ))}
        </div>
      </main>
      <BotonTarjeta cartCount={3} />
    </div>
  );
};
