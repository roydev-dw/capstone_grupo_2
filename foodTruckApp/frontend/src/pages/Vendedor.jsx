import { useEffect, useState } from 'react';
import { db } from '../utils/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { OpcionesModal } from '../components/vendedor/ModalOpciones';
import { apiProductos } from '../utils/api';
import { Header } from '../components/vendedor/Header';
import { FiltroCategoria } from '../components/vendedor/FiltroCategoria';
import { TarjetaProducto } from '../components/vendedor/TarjetaProducto';
import { PedidoActual } from '../components/vendedor/PedidoActual';
import { BotonTarjeta } from '../components/vendedor/BotonTarjeta';

export const Vendedor = () => {
  const [loading, setLoading] = useState(true);
  const carrito = useLiveQuery(() => db.carrito.toArray(), []) || [];
  const productos = useLiveQuery(() => db.productos.toArray(), []) || [];
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [isMobileAbrirCarrito, setIsMobileAbrirCarrito] = useState(false);
  const [itemParaEditar, setItemParaEditar] = useState(null);

  useEffect(() => {
    const fetchProductos = async () => {
      setLoading(true);
      try {
        const productosEnDB = await db.productos.count();

        if (productosEnDB === 0) {
          console.log('No hay productos en caché, buscando en API...');
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

          await db.productos.bulkAdd(productosNormalizados);
          console.log('Productos guardados en caché.');
        } else {
          console.log('Productos cargados desde la caché de IndexedDB.');
        }
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

  const handleEditarItem = (idItemCarrito) => {
    const item = carrito.find((i) => i.idItemCarrito === idItemCarrito);
    if (item) {
      setItemParaEditar(item);
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

  const handleAddCarrito = async (productoAgregado) => {
    const idItemCarrito = generarIdItemCarrito(productoAgregado);

    let precioFinalUnitario = productoAgregado.price;
    if (productoAgregado.selectedOptions) {
      const precioOpciones = Object.values(
        productoAgregado.selectedOptions
      ).reduce((total, option) => total + option.extraPrice, 0);
      precioFinalUnitario += precioOpciones;
    }

    const productoExistente = await db.carrito.get(idItemCarrito);

    if (productoExistente) {
      await db.carrito.update(idItemCarrito, {
        quantity: productoExistente.quantity + (productoAgregado.quantity || 1),
      });
    } else {
      await db.carrito.add({
        ...productoAgregado,
        idItemCarrito,
        quantity: productoAgregado.quantity || 1,
        precioFinalUnitario,
      });
    }

    setProductoSeleccionado(null);
  };

  const handleActualizarItemEnCarrito = async (itemActualizado) => {
    const idItemAntiguo = itemParaEditar.idItemCarrito;
    const cantidadAntigua = itemParaEditar.quantity;

    const idItemNuevo = generarIdItemCarrito(itemActualizado);
    let precioFinalUnitario = itemActualizado.price;
    if (itemActualizado.selectedOptions) {
      const precioOpciones = Object.values(
        itemActualizado.selectedOptions
      ).reduce((total, option) => total + option.extraPrice, 0);
      precioFinalUnitario += precioOpciones;
    }

    await db.transaction('rw', db.carrito, async () => {
      await db.carrito.delete(idItemAntiguo);
      const itemExistenteConNuevasOpciones = await db.carrito.get(idItemNuevo);

      if (itemExistenteConNuevasOpciones) {
        await db.carrito.update(idItemNuevo, {
          quantity: itemExistenteConNuevasOpciones.quantity + cantidadAntigua,
        });
      } else {
        await db.carrito.add({
          ...itemActualizado,
          idItemCarrito: idItemNuevo,
          precioFinalUnitario: precioFinalUnitario,
          quantity: cantidadAntigua,
        });
      }
    });

    setItemParaEditar(null);
  };

  const handleRemoveCarrito = async (idItemCarrito) => {
    const productoExistente = await db.carrito.get(idItemCarrito);
    if (!productoExistente) return;

    if (productoExistente.quantity === 1) {
      await db.carrito.delete(idItemCarrito);
    } else {
      await db.carrito.update(idItemCarrito, {
        quantity: productoExistente.quantity - 1,
      });
    }
  };

  const handleEliminarItem = async (idItemCarrito) => {
    await db.carrito.delete(idItemCarrito);
  };

  const handleClearCarrito = async () => {
    await db.carrito.clear();
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p className="text-xl">Cargando productos...</p>
      </div>
    );
  }

  const isModalOpen = !!productoSeleccionado || !!itemParaEditar;
  const productoEnModal = itemParaEditar || productoSeleccionado;
  const onModalSubmit = itemParaEditar
    ? handleActualizarItemEnCarrito
    : handleAddCarrito;

  const onModalClose = () => {
    setProductoSeleccionado(null);
    setItemParaEditar(null);
  };

  return (
    <div className="min-h-screen bg-elemento ">
      <div className="lg:flex min-h-screen">
        <div className="flex flex-col min-h-screen flex-1 overflow-y-auto">
          <Header />
          <main className="flex-1 px-6 pb-6 pt-40 lg:p-12">
            <FiltroCategoria />
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 grid-cols-extra gap-8 mt-8">
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

            {isModalOpen && (
              <OpcionesModal
                product={productoEnModal}
                isEditing={!!itemParaEditar}
                onCerrar={onModalClose}
                onAgregarAlCarrito={onModalSubmit}
              />
            )}
          </main>
          <div className="lg:hidden">
            <BotonTarjeta
              cartCount={carrito.reduce((sum, item) => sum + item.quantity, 0)}
              onClick={() => setIsMobileAbrirCarrito(true)}
            />
          </div>
        </div>

        <div className="hidden lg:block lg:w-1/4 lg:min-w-[420px]">
          <PedidoActual
            cart={carrito}
            onEditarItem={handleEditarItem}
            onClearCart={handleClearCarrito}
            onAgregarAlCarrito={handleAddCarrito}
            onRemoverDelCarrito={handleRemoveCarrito}
            onEliminarItem={handleEliminarItem}
          />
        </div>
      </div>

      {isMobileAbrirCarrito && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 lg:hidden"
          onClick={() => setIsMobileAbrirCarrito(false)}
          aria-modal="true"
          role="dialog"
        >
          <div
            className="absolute right-0 top-0 h-full w-full max-w-sm bg-fondo shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <PedidoActual
              cart={carrito}
              onClearCart={handleClearCarrito}
              onAgregarAlCarrito={handleAddCarrito}
              onRemoverDelCarrito={handleRemoveCarrito}
              onEditarItem={handleEditarItem}
              onClose={() => setIsMobileAbrirCarrito(false)}
              onEliminarItem={handleEliminarItem}
            />
          </div>
        </div>
      )}
    </div>
  );
};
