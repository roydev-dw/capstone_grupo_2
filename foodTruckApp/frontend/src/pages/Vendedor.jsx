import { useEffect, useState } from 'react';
import { BotonTarjeta } from '../components/vendedor/BotonTarjeta';
import { FiltroCategoria } from '../components/vendedor/FiltroCategoria';
import { Header } from '../components/vendedor/Header';
import { PedidoActual } from '../components/vendedor/PedidoActual';
import { TarjetaProducto } from '../components/vendedor/TarjetaProducto';
import { apiProductos } from '../utils/api';
import { OpcionesModal } from '../components/vendedor/ModalOpciones';

export const Vendedor = () => {
  const [productos, setProductos] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);

  useEffect(() => {
    const fetchProductos = async () => {
      try {
        setLoading(true);
        const data = await apiProductos.get('api-fast-food');

        const productosNormalizados = data.map((producto) => {
          const p = {
            id: producto.id,
            name: producto.name,
            price: producto.price,
            image: producto.image,
            category: producto.category,
          };
          if (producto.category === 'cafe') {
            p.options = [
              {
                name: 'Café',
                choices: [
                  { name: 'Cafeinado', extraPrice: 0 },
                  { name: 'Descafeinado', extraPrice: 200 },
                ],
              },
              {
                name: 'Leche',
                choices: [
                  { name: 'Entera', extraPrice: 0 },
                  { name: 'Descremada', extraPrice: 0 },
                  { name: 'Semidescremada', extraPrice: 0 },
                  { name: 'Sin Lactosa', extraPrice: 300 },
                  { name: 'Vegetal', extraPrice: 500 },
                ],
              },
            ];
          }
          return p;
        });

        setProductos(productosNormalizados);
      } catch (error) {
        console.error('Error al obtener productos:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProductos();
  }, []);

  const handleProductClick = (producto) => {
    if (producto.options && producto.options.length > 0) {
      setProductoSeleccionado(producto);
    } else {
      handleAddCarrito({ ...producto, precioFinalUnitario: producto.price });
    }
  };

  const generarIdItemCarrito = (producto) => {
    if (!producto.selectedOptions) {
      return producto.id;
    }
    const optionsString = Object.values(producto.selectedOptions)
      .map((option) => option.name)
      .join('-');
    return `${producto.id}-${optionsString}`;
  };

  const handleAddCarrito = (productoAgregado) => {
    const idItemCarrito = generarIdItemCarrito(productoAgregado);

    let precioFinalUnitario = productoAgregado.price;
    if (productoAgregado.selectedOptions) {
      const precioOpciones = Object.values(
        productoAgregado.selectedOptions
      ).reduce((total, option) => total + option.extraPrice, 0);
      precioFinalUnitario += precioOpciones;
    }

    setCarrito((prevCarrito) => {
      const productoExistente = prevCarrito.find(
        (item) => item.idItemCarrito === idItemCarrito
      );

      if (productoExistente) {
        return prevCarrito.map((item) =>
          item.idItemCarrito === idItemCarrito
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prevCarrito,
        {
          ...productoAgregado,
          idItemCarrito,
          quantity: 1,
          precioFinalUnitario,
        },
      ];
    });

    setProductoSeleccionado(null);
  };

  const handleRemoveCarrito = (idItemCarrito) => {
    setCarrito((prevCarrito) => {
      const productoExistente = prevCarrito.find(
        (item) => item.idItemCarrito === idItemCarrito
      );
      if (!productoExistente) return prevCarrito;

      if (productoExistente.quantity === 1) {
        return prevCarrito.filter(
          (item) => item.idItemCarrito !== idItemCarrito
        );
      }

      return prevCarrito.map((item) =>
        item.idItemCarrito === idItemCarrito
          ? { ...item, quantity: item.quantity - 1 }
          : item
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
    <div className="min-h-screen bg-fondo">
      <div className="lg:flex min-h-screen">
        <div className="flex flex-col min-h-screen flex-1 overflow-y-auto">
          <Header />
          <main className="flex-1 p-6 lg:p-12">
            <FiltroCategoria />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-8 mt-8">
              {productos.map((p) => (
                <div
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => handleProductClick(p)}
                >
                  <TarjetaProducto product={p} />
                </div>
              ))}
            </div>
            {productoSeleccionado && (
              <OpcionesModal
                product={productoSeleccionado}
                onCerrar={() => setProductoSeleccionado(null)}
                onAgregarAlCarrito={handleAddCarrito}
              />
            )}
          </main>
          <div className="lg:hidden">
            <BotonTarjeta
              cartCount={carrito.reduce((sum, item) => sum + item.quantity, 0)}
            />
          </div>
        </div>
        <div className="hidden lg:block lg:w-1/4 lg:min-w-[400px]">
          <PedidoActual
            cart={carrito}
            onClearCart={handleClearCarrito}
            onAgregarAlCarrito={handleAddCarrito}
            onRemoverDelCarrito={handleRemoveCarrito}
          />
        </div>
      </div>
    </div>
  );
};
