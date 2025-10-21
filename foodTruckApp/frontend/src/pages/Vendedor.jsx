import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [isMobileAbrirCarrito, setIsMobileAbrirCarrito] = useState(false);
  const [itemParaEditar, setItemParaEditar] = useState(null);

  const carrito = useLiveQuery(() => db.carrito.toArray(), []) || [];
  const productos = useLiveQuery(() => db.productos.toArray(), []) || [];

  const generarIdItemCarrito = useCallback((producto) => {
    const base = String(producto.id);
    if (!producto.selectedOptions) return base;

    const partes = Object.entries(producto.selectedOptions)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([grupo, opt]) => `${grupo}:${opt.name}`);

    return `${base}::${partes.join('|')}`;
  }, []);

  const calcularPrecioFinalUnitario = useCallback((producto) => {
    const extras = producto.selectedOptions
      ? Object.values(producto.selectedOptions).reduce(
          (t, o) => t + (o.extraPrice || 0),
          0
        )
      : 0;
    return (producto.price || 0) + extras;
  }, []);

  useEffect(() => {
    let once = false;

    const syncProductos = async () => {
      if (import.meta.env.DEV && once) return;
      once = true;

      const productosEnDB = await db.productos.count();
      if (productosEnDB === 0) {
        setLoading(true);
      } else {
        setLoading(false);
      }

      try {
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

        await db.transaction('rw', db.productos, async () => {
          const existentes = await db.productos.toCollection().primaryKeys();
          const mapaNuevos = new Map(
            productosNormalizados.map((p) => [String(p.id), p])
          );

          await db.productos.bulkPut(productosNormalizados);

          const idsEliminar = existentes.filter(
            (id) => !mapaNuevos.has(String(id))
          );
          if (idsEliminar.length) {
            await db.productos.bulkDelete(idsEliminar);
          }
        });
      } catch (error) {
        console.warn(
          'Error al sincronizar con la API (probablemente offline):',
          error?.message
        );
      } finally {
        setLoading(false);
      }
    };

    syncProductos();
  }, []);

  const handleProductClick = useCallback((producto) => {
    if (producto.options && producto.options.length > 0) {
      setProductoSeleccionado(producto);
    } else {
      handleAddCarrito({ ...producto, quantity: 1 });
    }
  }, []);

  const handleEditarItem = useCallback(
    (idItemCarrito) => {
      const item = carrito.find((i) => i.idItemCarrito === idItemCarrito);
      if (item) setItemParaEditar(item);
    },
    [carrito]
  );

  const handleAddCarrito = useCallback(
    async (productoAgregado) => {
      const idItemCarrito = generarIdItemCarrito(productoAgregado);
      const precioFinalUnitario = calcularPrecioFinalUnitario(productoAgregado);
      const cantidad = productoAgregado.quantity || 1;

      await db.transaction('rw', db.carrito, async () => {
        const existente = await db.carrito.get(idItemCarrito);
        if (existente) {
          await db.carrito.update(idItemCarrito, {
            quantity: existente.quantity + cantidad,
          });
        } else {
          const { id, name, price, selectedOptions } = productoAgregado;
          await db.carrito.add({
            idItemCarrito,
            id,
            name,
            price,
            selectedOptions: selectedOptions || null,
            quantity: cantidad,
            precioFinalUnitario,
          });
        }
      });

      setProductoSeleccionado(null);
    },
    [calcularPrecioFinalUnitario, generarIdItemCarrito]
  );

  const handleActualizarItemEnCarrito = useCallback(
    async (itemActualizado) => {
      const idItemAntiguo = itemParaEditar.idItemCarrito;
      const cantidadAntigua = itemParaEditar.quantity;

      const idItemNuevo = generarIdItemCarrito(itemActualizado);
      const precioFinalUnitario = calcularPrecioFinalUnitario(itemActualizado);

      await db.transaction('rw', db.carrito, async () => {
        await db.carrito.delete(idItemAntiguo);
        const existenteNuevo = await db.carrito.get(idItemNuevo);
        if (existenteNuevo) {
          await db.carrito.update(idItemNuevo, {
            quantity: existenteNuevo.quantity + cantidadAntigua,
          });
        } else {
          const { id, name, price, selectedOptions } = itemActualizado;
          await db.carrito.add({
            idItemCarrito: idItemNuevo,
            id,
            name,
            price,
            selectedOptions: selectedOptions || null,
            quantity: cantidadAntigua,
            precioFinalUnitario,
          });
        }
      });

      setItemParaEditar(null);
    },
    [itemParaEditar, calcularPrecioFinalUnitario, generarIdItemCarrito]
  );

  const handleRemoveCarrito = useCallback(async (idItemCarrito) => {
    await db.transaction('rw', db.carrito, async () => {
      const existente = await db.carrito.get(idItemCarrito);
      if (!existente) return;

      if (existente.quantity <= 1) {
        await db.carrito.delete(idItemCarrito);
      } else {
        await db.carrito.update(idItemCarrito, {
          quantity: existente.quantity - 1,
        });
      }
    });
  }, []);

  const handleEliminarItem = useCallback(async (idItemCarrito) => {
    await db.transaction('rw', db.carrito, async () => {
      await db.carrito.delete(idItemCarrito);
    });
  }, []);

  const handleClearCarrito = useCallback(async () => {
    await db.transaction('rw', db.carrito, async () => {
      await db.carrito.clear();
    });
  }, []);

  const onModalClose = useCallback(() => {
    setProductoSeleccionado(null);
    setItemParaEditar(null);
  }, []);

  const cartCount = useMemo(
    () => carrito.reduce((sum, item) => sum + item.quantity, 0),
    [carrito]
  );

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
              cartCount={cartCount}
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
