import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../utils/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { OpcionesModal } from '../components/vendedor/ModalOpciones';
import { apiFoodTrucks } from '../utils/api';
import { Header } from '../components/vendedor/Header';
import { FiltroCategoria } from '../components/vendedor/FiltroCategoria';
import { TarjetaProducto } from '../components/vendedor/TarjetaProducto';
import { PedidoActual } from '../components/vendedor/PedidoActual';
import { BotonTarjeta } from '../components/vendedor/BotonTarjeta';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { categoriasRepo } from '../utils/repoCategorias';
import { productoModificadoresRepo } from '../utils/repoProductoModificador';
import { EMPRESA_PUNTO_SABOR_ID, perteneceAEmpresa } from '../utils/empresas';

// --- helpers de normalización de respuestas ---

// Desempaqueta una respuesta que puede ser:
// - Response de fetch (tiene .json())
// - Objeto ya parseado (sin .json())
const unwrapResponse = async (resp) => {
  if (resp && typeof resp === 'object' && typeof resp.json === 'function') {
    const clone = resp.clone?.() ?? resp;
    return clone.json();
  }
  return resp;
};

// Normaliza {results:[]}, {productos:[]}, {items:[]}, []...
const pickList = (res) => {
  if (!res) return [];
  const payload = res?.data ?? res;

  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.productos)) return payload.productos;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload)) return payload;

  return [];
};

// Resolver imagen absoluta si backend devuelve ruta relativa
const resolveImg = (u) => {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  const base = apiFoodTrucks?.defaults?.baseURL?.replace(/\/+$/, '') || '';
  const path = String(u).replace(/^\/+/, '');
  return base ? `${base}/${path}` : `/${path}`;
};

const DEFAULT_OPTION_GROUP = 'Agregados';

const buildOptionsFromModificadores = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) return [];

  const groups = new Map();
  items.forEach((rel) => {
    const source = rel?.modificador ?? rel ?? {};
    const rawGroup = source?.tipo ?? rel?.tipo ?? '';
    const groupName = String(rawGroup || DEFAULT_OPTION_GROUP).trim() || DEFAULT_OPTION_GROUP;
    const choiceId =
      String(source?.modificador_id ?? source?.id ?? rel?.modificador_id ?? rel?.id ?? source?.nombre ?? '').trim() ||
      source?.nombre ||
      '';
    const choiceName = source?.nombre ?? rel?.nombre ?? `Opción ${choiceId || ''}`.trim();
    const extraPriceRaw = source?.valor_adicional ?? rel?.valor_adicional ?? 0;
    const extraPrice = Number.isFinite(Number(extraPriceRaw)) ? Number(extraPriceRaw) : 0;

    if (!choiceName) return;
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName).push({
      id: choiceId || `${groupName}-${choiceName}`,
      name: choiceName,
      extraPrice,
    });
  });

  const options = [];
  for (const [groupName, choices] of groups.entries()) {
    if (!choices.length) continue;
    const normalizedGroup = groupName || DEFAULT_OPTION_GROUP;
    const sorted = choices.sort((a, b) => a.name.localeCompare(b.name));
    const defaultChoice = {
      id: `none-${normalizedGroup}`.toLowerCase(),
      name: `Sin ${normalizedGroup.toLowerCase()}`,
      extraPrice: 0,
    };
    const hasZeroChoice = sorted.some(
      (choice) => choice.extraPrice === 0 && choice.name.toLowerCase().startsWith('sin')
    );
    const finalChoices = hasZeroChoice ? sorted : [defaultChoice, ...sorted];
    options.push({
      name: normalizedGroup,
      choices: finalChoices,
    });
  }

  return options;
};

const normalizeSucursalId = (valor) => {
  if (valor == null || valor === '') return null;
  const num = Number(valor);
  return Number.isFinite(num) ? num : null;
};

const deriveSucursalIdFromUser = (usuario) => {
  if (!usuario) return null;
  const candidatos = [
    usuario.sucursal_id,
    usuario.sucursalId,
    ...(Array.isArray(usuario.sucursales_ids) ? usuario.sucursales_ids : []),
    ...(Array.isArray(usuario.sucursales) ? usuario.sucursales : []),
  ];
  for (const candidato of candidatos) {
    const id = normalizeSucursalId(candidato?.id ?? candidato?.sucursal_id ?? candidato);
    if (id != null) return id;
  }
  try {
    const persisted = localStorage.getItem('vendorSucursalId');
    const parsed = normalizeSucursalId(persisted);
    if (parsed != null) return parsed;
  } catch {}
  return null;
};

const normalizeCategoriaId = (valor) => {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim();
};

const getProductoCategoriaId = (producto) => {
  if (!producto || typeof producto !== 'object') return '';
  const categoria = producto.categoria ?? producto.category ?? {};
  const rawId =
    producto.categoria_id ??
    producto.categoriaId ??
    categoria.categoria_id ??
    categoria.id ??
    categoria.categoriaId ??
    null;
  return rawId == null ? '' : normalizeCategoriaId(rawId);
};

export const Vendedor = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [isMobileAbrirCarrito, setIsMobileAbrirCarrito] = useState(false);
  const [itemParaEditar, setItemParaEditar] = useState(null);
  const [fetchError, setFetchError] = useState('');
  const optionsCacheRef = useRef(new Map());

  const { user } = useCurrentUser();
  const sessionUser = useMemo(() => {
    if (user) return user;
    try {
      const raw = localStorage.getItem('currentUser');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [user]);

  const sucursalId = useMemo(() => {
    const derived = deriveSucursalIdFromUser(sessionUser);
    if (derived != null) {
      try {
        localStorage.setItem('vendorSucursalId', String(derived));
      } catch {}
    }
    return derived;
  }, [sessionUser]);

  useEffect(() => {
    if (!sessionUser) return;
    if (!perteneceAEmpresa(sessionUser, [EMPRESA_PUNTO_SABOR_ID])) {
      navigate('/403', { replace: true });
    }
  }, [sessionUser, navigate]);

  const carrito = useLiveQuery(() => db.carrito.toArray(), []) || [];

  const productosDB =
    useLiveQuery(() => {
      if (sucursalId == null) return [];
      return db.products.where('sucursal_id').equals(Number(sucursalId)).toArray();
    }, [sucursalId]) || [];

  useEffect(() => {
    optionsCacheRef.current.clear();
  }, [sucursalId]);

  useEffect(() => {
    const cache = optionsCacheRef.current;
    (productosDB || []).forEach((producto) => {
      const key = String(producto.producto_id ?? producto.id ?? '').trim();
      const opts = Array.isArray(producto.options) ? producto.options : [];
      if (!key || !opts.length || cache.has(key)) return;
      cache.set(key, opts);
    });
  }, [productosDB]);

  const productosUI = useMemo(() => {
    return (productosDB || [])
      .filter((p) => p.estado === true || p.estado === 'Publicado')
      .map((p) => ({
        id: p.producto_id,
        name: p.nombre,
        price: Number(p.precio_base || 0),
        image: resolveImg(p.imagen_url || ''),
        category: p.categoria_nombre?.trim() || 'Sin categoria',
        options: Array.isArray(p.options) ? p.options : [],
      }));
  }, [productosDB]);

  const categoriasDisponibles = useMemo(() => {
    const unique = new Set();
    productosUI.forEach((p) => {
      if (p.category) unique.add(p.category);
    });
    return ['Todos', ...Array.from(unique)];
  }, [productosUI]);

  const [categoriaActiva, setCategoriaActiva] = useState('Todos');

  useEffect(() => {
    setCategoriaActiva('Todos');
  }, [sucursalId]);

  useEffect(() => {
    if (!categoriasDisponibles.includes(categoriaActiva)) {
      setCategoriaActiva('Todos');
    }
  }, [categoriasDisponibles, categoriaActiva]);

  const productosFiltrados = useMemo(() => {
    if (categoriaActiva === 'Todos') return productosUI;
    return productosUI.filter((p) => p.category === categoriaActiva);
  }, [categoriaActiva, productosUI]);

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

  const ensureOptionsForProduct = useCallback(
    async (producto) => {
      if (!producto) return producto;

      const productoId = producto.producto_id ?? producto.id;
      const cacheKey = String(productoId ?? '').trim();
      if (!cacheKey) {
        return { ...producto, options: Array.isArray(producto.options) ? producto.options : [] };
      }

      // Si ya tiene options precargadas, las usamos y guardamos en cache para próximos clicks
      if (Array.isArray(producto.options) && producto.options.length > 0) {
        optionsCacheRef.current.set(cacheKey, producto.options);
        return { ...producto, options: producto.options };
      }

      if (optionsCacheRef.current.has(cacheKey)) {
        return { ...producto, options: optionsCacheRef.current.get(cacheKey) || [] };
      }

      try {
        const relaciones = await productoModificadoresRepo.list(productoId, {
          sucursalId,
        });

        const opciones = buildOptionsFromModificadores(relaciones);
        optionsCacheRef.current.set(cacheKey, opciones);

        if (opciones.length) {
          try {
            await db.products.update(cacheKey, { options: opciones });
          } catch (persistErr) {
            console.warn('[Vendedor] No se pudieron guardar los modificadores en cache local', persistErr);
          }
        }

        console.log('[Vendedor] Modificadores obtenidos desde endpoint de producto', {
          productoId: cacheKey,
          sucursalId,
          cantidad: opciones.length,
          opciones,
        });

        return { ...producto, options: opciones };
      } catch (err) {
        console.error('[Vendedor] No se pudieron cargar modificadores para el producto', {
          productoId: cacheKey,
          sucursalId,
          err,
        });
        optionsCacheRef.current.set(cacheKey, []);
        return { ...producto, options: [] };
      }
    },
    [sucursalId]
  );

  useEffect(() => {
    const syncProductos = async () => {
      try {
        setFetchError('');

        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
          setLoading(false);
          setFetchError('No se encontro una sesion activa. Inicia sesion nuevamente.');
          return;
        }

        if (sucursalId == null) {
          setLoading(false);
          setFetchError('Tu usuario no tiene una sucursal asignada.');
          return;
        }

        const { items: categoriasPermitidas } = await categoriasRepo.listAll({
          sucursalId,
        });
        const allowedCategoryIds = new Set(
          (categoriasPermitidas || [])
            .map((cat) => normalizeCategoriaId(cat.categoria_id ?? cat.id ?? ''))
            .filter((id) => !!id)
        );

        const countPrev = await db.products.where('sucursal_id').equals(Number(sucursalId)).count();
        setLoading(countPrev === 0);

        const endpoint = `v1/productos/?sucursal_id=${sucursalId}`;
        const res = await apiFoodTrucks.get(endpoint);
        const data = await unwrapResponse(res);
        const list = pickList(data);

        const filtradosPorCategoria =
          allowedCategoryIds.size === 0
            ? list
            : list.filter((item) => {
                const categoriaId = getProductoCategoriaId(item);
                return categoriaId && allowedCategoryIds.has(categoriaId);
              });

        console.log('[Vendedor] Productos recibidos', {
          sucursalId,
          total: filtradosPorCategoria.length,
          ids: filtradosPorCategoria.map((item) => item.producto_id ?? item.id),
        });

        const normalizados = filtradosPorCategoria.map((raw) => {
          const productoId = String(raw.producto_id ?? raw.id ?? '');
          const categoria = raw.categoria ?? {};
          const categoriaId = String(
            raw.categoria_id ?? raw.categoriaId ?? categoria.categoria_id ?? categoria.id ?? 'sin-categoria'
          );
          const updatedAt =
            raw.updated_at ??
            raw.updatedAt ??
            raw.fecha_actualizacion ??
            raw.fecha_creacion ??
            new Date().toISOString();
          const syncedAt = new Date().toISOString();
          const sucursalAsignada = raw.sucursal_id != null ? Number(raw.sucursal_id) : Number(sucursalId);
          const opcionesInline = Array.isArray(raw.modificadores)
            ? buildOptionsFromModificadores(raw.modificadores)
            : [];
          if (opcionesInline.length) {
            console.log('[Vendedor] Modificadores precargados para producto', {
              productoId,
              cantidad: opcionesInline.length,
              opciones: opcionesInline,
            });
          }
          return {
            id: productoId,
            producto_id: productoId,
            categoria_id: categoriaId,
            categoria_nombre: raw.categoria_nombre ?? categoria.nombre ?? categoria.categoria_nombre ?? 'Sin categoria',
            nombre: raw.nombre ?? '',
            descripcion: raw.descripcion ?? '',
            precio_base: Number(raw.precio_base ?? 0),
            tiempo_preparacion: Number(raw.tiempo_preparacion ?? 0),
            estado: raw.estado !== false,
            fecha_creacion: raw.fecha_creacion || updatedAt,
            imagen_url: raw.imagen_url ?? raw.imagen ?? '',
            updatedAt,
            pending: false,
            tempId: null,
            syncedAt,
            lastError: null,
            pendingOp: null,
            sucursal_id: sucursalAsignada,
            options: opcionesInline,
          };
        });

        await db.transaction('rw', db.products, async () => {
          await db.products.filter((item) => Number(item.sucursal_id ?? -1) === Number(sucursalId)).delete();
          await db.products.bulkPut(normalizados);
        });
      } catch (error) {
        console.error('[Vendedor] Error al sincronizar:', error);
        setFetchError(error?.message || 'No se pudieron cargar productos.');
      } finally {
        setLoading(false);
      }
    };

    syncProductos();
  }, [sucursalId]);

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

  const handleProductClick = useCallback(
    (producto) => {
      (async () => {
        const withOptions = await ensureOptionsForProduct(producto);
        if (withOptions.options && withOptions.options.length > 0) {
          setProductoSeleccionado(withOptions);
        } else {
          handleAddCarrito({ ...withOptions, quantity: 1 });
        }
      })();
    },
    [ensureOptionsForProduct, handleAddCarrito]
  );

  const handlePedidoConfirmado = useCallback((pedidoCreado) => {
    console.log('%c[VENDEDOR] Pedido confirmado desde PedidoActual →', 'color:#0f0;font-weight:bold', pedidoCreado);
    // más adelante acá puedes:
    // - refrescar panel de pedidos
    // - navegar a otra vista
  }, []);

  const handleEditarItem = useCallback(
    (idItemCarrito) => {
      (async () => {
        const item = carrito.find((i) => i.idItemCarrito === idItemCarrito);
        if (!item) return;
        const baseProducto = productosUI.find((p) => String(p.id) === String(item.id)) ??
          productosDB.find((p) => String(p.producto_id ?? p.id) === String(item.id)) ?? {
            id: item.id,
            producto_id: item.id,
            name: item.name,
            price: item.price,
            image: item.image ?? '',
            category: item.category ?? '',
            options: item.options ?? [],
          };
        const withOptions = await ensureOptionsForProduct(baseProducto);
        setItemParaEditar({
          ...withOptions,
          ...item,
        });
      })();
    },
    [carrito, productosUI, productosDB, ensureOptionsForProduct]
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
            <FiltroCategoria categories={categoriasDisponibles} value={categoriaActiva} onChange={setCategoriaActiva} />

            {productosFiltrados.length === 0 ? (
              <div className='mt-8 p-6 bg-white rounded-xl border text-gray-600'>
                <p className='font-semibold'>No hay productos para mostrar.</p>
              </div>
            ) : (
              <div className='grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 grid-cols-extra gap-8 mt-8'>
                {productosFiltrados.map((p) => (
                  <div key={p.id} className='cursor-pointer' onClick={() => handleProductClick(p)}>
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
            <BotonTarjeta cartCount={cartCount} onClick={() => setIsMobileAbrirCarrito(true)} />
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
            sucursalId={sucursalId}
            usuarioId={sessionUser?.id ?? sessionUser?.usuario_id ?? sessionUser?.user_id}
            onPedidoConfirmado={handlePedidoConfirmado}
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
              sucursalId={sucursalId}
              usuarioId={sessionUser?.id ?? sessionUser?.usuario_id ?? sessionUser?.user_id}
              onPedidoConfirmado={handlePedidoConfirmado}
            />
          </div>
        </div>
      )}
    </div>
  );
};
