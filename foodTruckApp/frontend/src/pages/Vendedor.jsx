import { useEffect, useState } from 'react';
import { BotonTarjeta } from '../components/vendedor/BotonTarjeta';
import { FiltroCategoria } from '../components/vendedor/FiltroCategoria';
import { Header } from '../components/vendedor/Header';
import { PedidoActual } from '../components/vendedor/PedidoActual';
import { TarjetaProducto } from '../components/vendedor/TarjetaProducto';
import { api } from '../utils/api';

export const Vendedor = () => {
  const [productos, setProductos] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProductos = async () => {
      try {
        setLoading(true);
        const data = await api.get('products/category/groceries');

        const productosNormalizados = data.products.map((producto) => ({
          id: producto.id,
          name: producto.title,
          price: producto.price,
          image: producto.thumbnail,
        }));

        setProductos(productosNormalizados);
      } catch (error) {
        console.error('Error al obtener productos:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProductos();
  }, []);

  const handleAddCarrito = (productoAgregado) => {
    setCarrito((prevCarrito) => {
      const productoExistente = prevCarrito.find(
        (item) => item.id === productoAgregado.id
      );
      if (productoExistente) {
        return prevCarrito.map((item) =>
          item.id === productoAgregado.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prevCarrito, { ...productoAgregado, quantity: 1 }];
    });
  };

  const handleRemoveCarrito = (productoId) => {
    setCarrito((prevCarrito) => {
      const productoExistente = prevCarrito.find(
        (item) => item.id === productoId
      );
      if (productoExistente.quantity === 1) {
        return prevCarrito.filter((item) => item.id !== productoId);
      }
      return prevCarrito.map((item) =>
        item.id === productoId ? { ...item, quantity: item.quantity - 1 } : item
      );
    });
  };

  const handleClearCarrito = () => {
    setCarrito([]);
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p className="text-xl">Cargando productos...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="lg:grid lg:grid-cols-3 h-screen">
        <div className="lg:col-span-2 flex flex-col h-screen overflow-y-auto">
          <Header />
          <main className="flex-1 p-6 lg:p-12">
            <FiltroCategoria />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-10 gap-4 mt-8 bg-white p-8 rounded-xl">
              {productos.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleAddCarrito(p)}
                  className="cursor-pointer"
                >
                  <TarjetaProducto product={p} />
                </div>
              ))}
            </div>
          </main>
          <div className="lg:hidden">
            <BotonTarjeta
              cartCount={carrito.reduce((sum, item) => sum + item.quantity, 0)}
            />
          </div>
        </div>
        <div className="hidden lg:block">
          <PedidoActual
            cart={carrito}
            onClearCart={handleClearCarrito}
            onAddToCart={handleAddCarrito}
            onRemoveFromCart={handleRemoveCarrito}
          />
        </div>
      </div>
    </div>
  );
};
