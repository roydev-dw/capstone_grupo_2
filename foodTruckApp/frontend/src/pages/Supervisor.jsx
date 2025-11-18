import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { UserMenu } from '../components/sesion_usuario/UserMenu';
import { Logo } from '../components/logo/Logo';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { clearSession } from '../utils/session';
import { PanelProductos } from '../components/paneles/PanelProductos';
import { EstadoEnLinea } from '../components/ui/EstadoEnLinea';
import { PanelCategorias } from '../components/paneles/PanelCategorias';
import { PendingSyncTable } from '../components/sync/PendingSyncTable';
import { FoodtruckIcon } from '../components/ui/Iconos';
import { sucursalesRepo } from '../utils/repoSucursales';
import { FaCheckCircle } from 'react-icons/fa';
import { EMPRESA_PUNTO_SABOR_ID, perteneceAEmpresa, getEmpresaIdFromUser } from '../utils/empresas';
import { PanelUsuarios } from '../components/paneles/PanelUsuarios';
import { PanelModificadores } from '../components/paneles/PanelModificadores';
import { PiUserCirclePlusFill } from 'react-icons/pi';
import { TbCategoryPlus, TbAdjustments } from 'react-icons/tb';
import { AiOutlineProduct } from 'react-icons/ai';
import { FiChevronDown } from 'react-icons/fi';
import { categoriasRepo } from '../utils/repoCategorias';

export const Supervisor = () => {
  const navigate = useNavigate();
  const { user } = useCurrentUser();

  const [categoriasActivas, setCategoriasActivas] = useState([]);
  const [sucursalesDisponibles, setSucursalesDisponibles] = useState([]);
  const [loadingSucursales, setLoadingSucursales] = useState(true);
  const [errorSucursales, setErrorSucursales] = useState('');
  const [selectedSucursalId, setSelectedSucursalId] = useState('');
  const [openPanel, setOpenPanel] = useState(null);

  const panelProdRef = useRef(null);
  const usuariosRef = useRef(null);
  const categoriasRef = useRef(null);
  const modificadoresRef = useRef(null);
  const productosRef = useRef(null);

  const sessionUser = useMemo(() => {
    if (user) return user;
    try {
      const raw = localStorage.getItem('currentUser');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [user]);

  const sessionSucursalId = sessionUser?.sucursal_id ?? sessionUser?.sucursalId ?? '';
  const empresaId = getEmpresaIdFromUser(sessionUser) ?? undefined;
  const COLOR_CYCLE = ['text-secundario', 'text-primario', 'text-info'];

  const supervisorSucursalIds = useMemo(() => {
    const ids = new Set();
    const list = Array.isArray(sessionUser?.sucursales_ids) ? sessionUser.sucursales_ids : [];
    list.forEach((value) => {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) ids.add(parsed);
    });
    const fallback = sessionUser?.sucursal_id ?? sessionUser?.sucursalId;
    const parsedFallback = Number(fallback);
    if (Number.isFinite(parsedFallback)) ids.add(parsedFallback);
    return Array.from(ids);
  }, [sessionUser]);

  const getFoodtruckColor = (index) => COLOR_CYCLE[index % COLOR_CYCLE.length];

  useEffect(() => {
    if (!sessionUser) return;
    if (!perteneceAEmpresa(sessionUser, [EMPRESA_PUNTO_SABOR_ID])) {
      navigate('/403', { replace: true });
    }
  }, [sessionUser, navigate]);

  useEffect(() => {
    if (!empresaId) {
      setSucursalesDisponibles([]);
      setErrorSucursales('No pudimos determinar la empresa asociada al supervisor.');
      setLoadingSucursales(false);
      return;
    }

    let cancelled = false;
    setLoadingSucursales(true);
    setErrorSucursales('');

    (async () => {
      try {
        const list = await sucursalesRepo.list({ empresaId });
        const filtradas =
          supervisorSucursalIds.length > 0
            ? list.filter((s) => supervisorSucursalIds.some((id) => Number(id) === Number(s.id)))
            : list;
        if (!cancelled) {
          setSucursalesDisponibles(filtradas);
        }
      } catch (err) {
        if (!cancelled) {
          setSucursalesDisponibles([]);
          setErrorSucursales(err?.message ?? 'No pudimos cargar los foodtrucks asignados.');
        }
      } finally {
        if (!cancelled) {
          setLoadingSucursales(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [empresaId, supervisorSucursalIds]);

  useEffect(() => {
    if (!sucursalesDisponibles.length) {
      if (selectedSucursalId) setSelectedSucursalId('');
      return;
    }

    if (selectedSucursalId && sucursalesDisponibles.some((s) => Number(s.id) === Number(selectedSucursalId))) {
      return;
    }

    if (sessionSucursalId && sucursalesDisponibles.some((s) => Number(s.id) === Number(sessionSucursalId))) {
      setSelectedSucursalId(String(sessionSucursalId));
      return;
    }

    if (sucursalesDisponibles.length === 1) {
      setSelectedSucursalId(String(sucursalesDisponibles[0].id));
    }
  }, [sucursalesDisponibles, sessionSucursalId, selectedSucursalId]);

  const selectedSucursal = useMemo(() => {
    if (!selectedSucursalId) return null;
    return sucursalesDisponibles.find((s) => Number(s.id) === Number(selectedSucursalId)) ?? null;
  }, [selectedSucursalId, sucursalesDisponibles]);

  const sucursalId = selectedSucursal ? Number(selectedSucursal.id) : undefined;
  const sucursalNombre = selectedSucursal?.nombre ?? 'Selecciona un foodtruck';
  const hasSucursalSeleccionada = Boolean(selectedSucursal);

  useEffect(() => {
    setCategoriasActivas([]);
    if (!sucursalId) setOpenPanel(null);
  }, [sucursalId]);

  useEffect(() => {
    let cancelled = false;
    setCategoriasActivas([]);
    if (!sucursalId) {
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const { items } = await categoriasRepo.list({ sucursalId });
        if (!cancelled) {
          setCategoriasActivas(items);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('No se pudieron cargar las categorías para la sucursal seleccionada.', err);
          setCategoriasActivas([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sucursalId]);

  const logout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    const refs = {
      usuarios: usuariosRef,
      categorias: categoriasRef,
      modificadores: modificadoresRef,
      productos: productosRef,
    };
    const target = openPanel ? refs[openPanel]?.current : null;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [openPanel]);

  const supervisorPanels = useMemo(
    () => [
      {
        id: 'usuarios',
        title: 'Gestionar usuarios',
        description: 'Crea cuentas para tus vendedores o asistentes asignados a esta sucursal.',
        icon: PiUserCirclePlusFill,
        className: 'text-secundario',
        ref: usuariosRef,
        render: () => (
          <PanelUsuarios
            empresaId={empresaId}
            sucursalId={sucursalId}
            // El supervisor puede hacer CRUD, pero solo en sus sucursales
            isAdmin={false}
            allowedSucursalIds={supervisorSucursalIds}
            onClose={() => setOpenPanel(null)}
          />
        ),
      },
      {
        id: 'categorias',
        title: 'Categorías de productos',
        description: 'Organiza y activa las categorías disponibles en tu foodtruck.',
        icon: TbCategoryPlus,
        className: 'text-info',
        ref: categoriasRef,
        render: () => (
          <PanelCategorias
            sucursalId={sucursalId}
            sucursalNombre={sucursalNombre}
            onAvailableChange={(activas) => setCategoriasActivas(activas)}
            onClose={() => setOpenPanel(null)}
          />
        ),
      },
      {
        id: 'modificadores',
        title: 'Modificadores',
        description: 'Administra agregados y extras disponibles para los productos.',
        icon: TbAdjustments,
        className: 'text-amber-500',
        ref: modificadoresRef,
        render: () => (
          <PanelModificadores empresaId={empresaId} sucursalId={sucursalId} onClose={() => setOpenPanel(null)} />
        ),
      },
      {
        id: 'productos',
        title: 'Productos',
        description: 'Crea o ajusta los productos ofrecidos en esta sucursal.',
        icon: AiOutlineProduct,
        className: 'text-primario',
        ref: productosRef,
        render: () => (
          <PanelProductos
            ref={panelProdRef}
            categoriasActivas={categoriasActivas}
            sucursalId={sucursalId}
            empresaId={empresaId}
            onClose={() => setOpenPanel(null)}
          />
        ),
      },
    ],
    [categoriasActivas, empresaId, sucursalId, sucursalNombre, supervisorSucursalIds]
  );

  const togglePanel = (id) => {
    setOpenPanel((curr) => (curr === id ? null : id));
  };

  return (
    <div className='min-h-screen bg-fondo'>
      <Toaster position='top-center' />
      <header className='bg-elemento shadow-md flex justify-center'>
        <div className='max-w-6xl w-full flex items-center justify-between px-4 py-3'>
          <Logo className='h-10 w-10' />
          <UserMenu user={user} onLogout={logout} />
        </div>
      </header>

      <main className='mx-auto max-w-6xl px-4 pt-10 space-y-12 pb-10'>
        <EstadoEnLinea className='pt-4' />

        <div className='space-y-2'>
          <h1 className='text-2xl font-black tracking-wide'>Centro del supervisor</h1>
          <div className='border-b border-placeholder'></div>
          <p className='text-lg font-medium'>
            Selecciona tu foodtruck para gestionar categorías y productos asociados.
          </p>
        </div>

        <section className='space-y-6'>
          <div>
            <h2 className='text-xl font-semibold'>Selecciona tu sucursal</h2>
            <p className='text-sm text-texto-suave'>
              Solo podrás operar en los foodtrucks que te asignó un administrador.
            </p>
          </div>

          <div className='rounded-3xl bg-elemento p-6 shadow-md shadow-placeholder space-y-4'>
            <div className='flex flex-wrap items-start justify-between gap-4'>
              <div>
                <p className='text-xl font-semibold'>Foodtrucks disponibles</p>
                <p className='text-sm text-texto-suave'>
                  Elige uno para habilitar la administración de categorías y productos.
                </p>
              </div>
            </div>

            <div className='mt-6'>
              {loadingSucursales ? (
                <p className='text-sm text-texto-suave'>Cargando foodtrucks asignados...</p>
              ) : sucursalesDisponibles.length === 0 ? (
                <p className='text-sm text-texto-suave'>
                  Aún no tienes foodtrucks asignados en esta empresa. Contacta a un administrador.
                </p>
              ) : (
                <div className='grid gap-6 sm:grid-cols-2 lg:grid-cols-3'>
                  {[...sucursalesDisponibles]
                    .filter((s) => s.id != null)
                    .sort((a, b) => Number(a.id) - Number(b.id))
                    .map((sucursal, index) => {
                      const isSelected = String(selectedSucursalId) === String(sucursal.id);
                      const color = getFoodtruckColor(index);

                      return (
                        <button
                          key={sucursal.id}
                          type='button'
                          disabled={loadingSucursales}
                          onClick={() => setSelectedSucursalId(String(sucursal.id))}
                          className={[
                            'relative group flex flex-col items-center text-center rounded-2xl border px-4 py-3 shadow-sm transition-all duration-200 cursor-pointer',
                            isSelected ? 'border-info bg-info/5' : 'border-placeholder bg-elemento',
                            loadingSucursales ? 'opacity-60 cursor-not-allowed' : '',
                          ].join(' ')}>
                          {isSelected && <FaCheckCircle className='absolute top-2 right-2 text-info h-5 w-5' />}

                          <div className='flex flex-col justify-center items-center gap-3'>
                            <FoodtruckIcon className={`h-20 w-20 ${color}`} />
                            <div className='border-b border-placeholder w-full' />
                            <p className='text-2xl font-semibold text-pretty mt-3'>{sucursal.nombre}</p>
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>

            {errorSucursales && <p className='text-sm text-peligro'>{errorSucursales}</p>}
          </div>
        </section>

        {!hasSucursalSeleccionada && (
          <div className='rounded-2xl border border-dashed border-info bg-drag/10 px-6 py-4 text-center text-sm text-texto-suave'>
            Selecciona un foodtruck para poder gestionar categorías y productos.
          </div>
        )}

        {hasSucursalSeleccionada && (
          <section className='space-y-6'>
            <div className='space-y-1'>
              <h2 className='text-xl font-semibold'>Paneles de gestión</h2>
              <p className='text-sm text-texto-suave'>
                Expande cada fila para administrar usuarios, categorías, modificadores o productos según necesites.
              </p>
            </div>
            <div className='space-y-4'>
              {supervisorPanels.map((panel) => (
                <AccordionRow
                  key={panel.id}
                  panel={panel}
                  isOpen={openPanel === panel.id}
                  onToggle={togglePanel}
                  isDisabled={!sucursalId}
                />
              ))}
            </div>
          </section>
        )}

        <PendingSyncTable />
      </main>
    </div>
  );
};

const AccordionRow = ({ panel, isOpen, onToggle, isDisabled }) => {
  const Icon = panel.icon;

  return (
    <article
      ref={panel.ref}
      className='rounded-2xl border border-placeholder bg-elemento shadow-sm ring-1 ring-black/5'>
      <button
        type='button'
        disabled={isDisabled}
        onClick={() => onToggle(panel.id)}
        className={[
          'w-full flex flex-wrap items-center justify-between gap-4 p-5 text-left transition-opacity',
          isDisabled ? 'opacity-60 cursor-not-allowed' : '',
        ].join(' ')}>
        <div className='flex items-center gap-4'>
          {Icon && (
            <div className={`rounded-full bg-white/80 p-3 ${panel.className ?? 'text-primario'}`}>
              <Icon className='h-7 w-7' />
            </div>
          )}
          <div>
            <p className='text-base font-semibold text-texto'>{panel.title}</p>
            <p className='text-sm text-texto-suave'>{panel.description}</p>
          </div>
        </div>
        <div className='flex items-center gap-2 text-sm font-semibold text-info'>
          <span>{isOpen ? 'Ocultar panel' : 'Ver detalle'}</span>
          <FiChevronDown className={`h-5 w-5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {isOpen && <div className='border-t border-placeholder bg-white px-5 py-6'>{panel.render()}</div>}
    </article>
  );
};
