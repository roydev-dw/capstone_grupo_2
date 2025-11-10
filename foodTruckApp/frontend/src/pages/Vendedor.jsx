import { useEffect, useState, useMemo, useCallback } from 'react';
import { db } from '../utils/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { OpcionesModal } from '../components/vendedor/ModalOpciones';
import { apiFoodTrucks } from '../utils/api';
import { Header } from '../components/vendedor/Header';
import { FiltroCategoria } from '../components/vendedor/FiltroCategoria';
import { TarjetaProducto } from '../components/vendedor/TarjetaProducto';
import { PedidoActual } from '../components/vendedor/PedidoActual';
import { BotonTarjeta } from '../components/vendedor/BotonTarjeta';

// --- helper para normalizar respuestas {results:[]}, {data:{results:[]}}, [] ---
const pickList = (res) =>
  Array.isArray(res?.results)
    ? res.results
    : Array.isArray(res?.data?.results)
    ? res.data.results
    : Array.isArray(res)
    ? res
    : [];

// Resolver imagen absoluta si backend devuelve ruta relativa
const resolveImg = (u) => {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  const base = apiFoodTrucks?.defaults?.baseURL?.replace(/\/+$/, '') || '';
  const path = String(u).replace(/^\/+/, '');
  return base ? `${base}/${path}` : `/${path}`;
};

export const Vendedor = () => {
  const [loading, setLoading] = useState(true);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [isMobileAbrirCarrito, setIsMobileAbrirCarrito] = useState(false);
  const [itemParaEditar, setItemParaEditar] = useState(null);
  const [fetchError, setFetchError] = useState('');

  const carrito = useLiveQuery(() => db.carrito.toArray(), []) || [];
  const productosDB = useLiveQuery(() => db.products.toArray(), []) || [];

  const productosUI = useMemo(() => {
    return (productosDB || [])
      .filter((p) => p.estado === true || p.estado === 'Publicado')
      .map((p) => ({
        id: p.producto_id,
        name: p.nombre,
        price: Number(p.precio_base || 0),
        image: resolveImg(p.imagen_url || ''),
        category: p.categoria_nombre || '',
      }));
  }, [productosDB]);

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
      ? Object.values(producto.selectedOptions).reduce((t, o) => t + (o.extraPrice || 0), 0)
      : 0;
    return (producto.price || 0) + extras;
  }, []);

  useEffect(() => {
    const syncProductos = async () => {
      try {
        setFetchError('');

        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
          console.warn('[Vendedor] No se encontró accessToken. No se sincronizarán productos.');
          setLoading(false);
          setFetchError('No se encontró una sesión activa. Inicia sesión nuevamente.');
          return;
        }

        const countPrev = await db.products.count();
        setLoading(countPrev === 0);

        const res = await apiFoodTrucks.get('v1/productos/');
        const list = pickList(res);

        const normalizados = list.map((r) => {
          const productoId = String(r.producto_id ?? r.id ?? '');
          const categoriaId = String(r.categoria_id ?? 'sin-categoria');
          const updatedAt =
            r.updated_at ?? r.updatedAt ?? r.fecha_actualizacion ?? r.fecha_creacion ?? new Date().toISOString();
          const syncedAt = new Date().toISOString();
          return {
            id: productoId,
            producto_id: productoId,
            categoria_id: categoriaId,
            categoria_nombre: r.categoria_nombre ?? 'Sin categoria',
            nombre: r.nombre ?? '',
            descripcion: r.descripcion ?? '',
            precio_base: Number(r.precio_base ?? 0),
            tiempo_preparacion: Number(r.tiempo_preparacion ?? 0),
            estado: r.estado !== false,
            fecha_creacion: r.fecha_creacion || updatedAt,
            imagen_url: r.imagen_url ?? r.imagen ?? '',
            updatedAt,
            pending: false,
            tempId: null,
            syncedAt,
            lastError: null,
            pendingOp: null,
          };
        });

        await db.transaction('rw', db.products, db.categories, async () => {
          await db.products.bulkPut(normalizados);

          const categoriasDerivadas = [
            ...new Map(
              normalizados.map((p) => [
                p.categoria_id,
                {
                  id: p.categoria_id,
                  categoria_id: p.categoria_id,
                  nombre: p.categoria_nombre,
                  descripcion: '',
                  estado: true,
                  updatedAt: new Date().toISOString(),
                  pending: false,
                  tempId: null,
                  syncedAt: new Date().toISOString(),
                  lastError: null,
                  pendingOp: null,
                },
              ])
            ).values(),
          ];
          if (categoriasDerivadas.length) {
            await db.categories.bulkPut(categoriasDerivadas);
          }
        });
      } catch (error) {
        console.error('[Vendedor] Error al sincronizar:', error);
        setFetchError(error?.message || 'No se pudieron cargar productos.');
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

  const cartCount = useMemo(() => carrito.reduce((sum, item) => sum + item.quantity, 0), [carrito]);

  if (loading) {
    return (
      <div className='flex h-screen w-full items-center justify-center'>
        <p className='text-xl'>Cargando productos...</p>
      </div>
    );
  }

  const isModalOpen = !!productoSeleccionado || !!itemParaEditar;
  const productoEnModal = itemParaEditar || productoSeleccionado;
  const onModalSubmit = itemParaEditar ? handleActualizarItemEnCarrito : handleAddCarrito;

  return (
    <div className='min-h-screen bg-elemento '>
      <div className='lg:flex min-h-screen'>
        <div className='flex flex-col min-h-screen flex-1 overflow-y-auto'>
          <Header />

          {fetchError && (
            <div className='mx-6 mt-24 lg:mt-6 bg-red-100 text-red-700 border border-red-300 rounded-lg px-4 py-3'>
              <p className='font-semibold'>No se pudieron cargar productos</p>
              <p className='text-sm'>{fetchError}</p>
            </div>
          )}

          <main className='flex-1 px-6 pb-6 pt-40 lg:p-12'>
            <FiltroCategoria />

            {productosUI.length === 0 ? (
              <div className='mt-8 p-6 bg-white rounded-xl border text-gray-600'>
                <p className='font-semibold'>No hay productos para mostrar.</p>
                <p className='text-sm mt-1'>
                  Verifica que tu endpoint <code>/v1/productos/</code> esté devolviendo productos con
                  <code className='mx-1'>estado: true</code> (se muestran como <em>Publicado</em>).
                </p>
              </div>
            ) : (
              <div className='grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 grid-cols-extra gap-8 mt-8'>
                {productosUI.map((p) => (
                  <div
                    key={p.id}
                    className='cursor-pointer'
                    onClick={() => handleProductClick(p)}>
                    <TarjetaProducto product={p} />
                  </div>
                ))}
              </div>
            )}

            {isModalOpen && (
              <OpcionesModal
                product={productoEnModal}
                isEditing={!!itemParaEditar}
                onCerrar={onModalClose}
                onAgregarAlCarrito={onModalSubmit}
              />
            )}
          </main>

          <div className='lg:hidden'>
            <BotonTarjeta
              cartCount={cartCount}
              onClick={() => setIsMobileAbrirCarrito(true)}
            />
          </div>
        </div>

        <div className='hidden lg:block lg:w-1/4 lg:min-w-[420px]'>
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
          className='fixed inset-0 bg-black/70 backdrop-blur-sm z-50 lg:hidden'
          onClick={() => setIsMobileAbrirCarrito(false)}
          aria-modal='true'
          role='dialog'>
          <div
            className='absolute right-0 top-0 h-full w-full max-w-sm bg-fondo shadow-xl'
            onClick={(e) => e.stopPropagation()}>
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
