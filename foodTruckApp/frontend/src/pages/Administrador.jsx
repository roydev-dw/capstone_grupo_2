import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/logo/Logo';
import { UserMenu } from '../components/sesion_usuario/UserMenu';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { clearSession } from '../utils/session';
import { EstadoEnLinea } from '../components/ui/EstadoEnLinea';
import { PanelCategorias } from '../components/paneles/PanelCategorias';
import { PanelProductos } from '../components/paneles/PanelProductos';
import { PendingSyncTable } from '../components/sync/PendingSyncTable';
import { Button } from '../components/ui/Button';
import { PanelUsuarios } from '../components/paneles/PanelUsuarios';
import { PanelSucursales } from '../components/paneles/PanelSucursales';
import { PiUserCirclePlusFill } from 'react-icons/pi';
import { TbCategoryPlus } from 'react-icons/tb';
import { AiOutlineProduct } from 'react-icons/ai';
import { sucursalesRepo } from '../utils/repoSucursales';
import { FaCheckCircle } from 'react-icons/fa';
import { EMPRESA_PUNTO_SABOR_ID, perteneceAEmpresa, getEmpresaIdFromUser } from '../utils/empresas';
import { FoodtruckIcon } from '../components/ui/Iconos';

const quickActions = [
  {
    id: 'usuarios',
    title: 'Administrar usuarios',
    description: 'Da de alta supervisores, vendedores o nuevos administradores y define sus permisos.',
    cta: 'Gestionar usuarios',
    icon: PiUserCirclePlusFill,
    className: 'text-secundario',
    btnColor: 'secundario',
  },
  {
    id: 'categorias',
    title: 'Administrar categorías',
    description: 'Crea, edita, desactiva y elimina categorías de productos.',
    cta: 'Gestionar categorías',
    icon: TbCategoryPlus,
    className: 'text-info',
    btnColor: 'info',
  },
  {
    id: 'productos',
    title: 'Administrar productos',
    description: 'Crea, edita, sube imágenes y controla disponibilidad de productos.',
    cta: 'Gestionar productos',
    icon: AiOutlineProduct,
    className: 'text-primario',
    btnColor: 'primario',
  },
];

const metricHighlights = [
  {
    id: 'ventas',
    label: 'Ventas mes actual',
    value: '$12.4M',
    detail: '+8% vs mes anterior',
  },
  {
    id: 'ticket',
    label: 'Ticket promedio',
    value: '$8.460',
    detail: '+3% vs semana pasada',
  },
  {
    id: 'pedidos',
    label: 'Pedidos sincronizados',
    value: '986',
    detail: '4 pendientes por revisar',
  },
];

const QuickActionCard = ({ action, onClick }) => {
  const Icon = action?.icon;

  return (
    <article className='flex flex-col justify-between items-center rounded-2xl bg-elemento p-6 shadow-sm ring-1 ring-black/5'>
      <div className='flex flex-col items-center'>
        <Icon className={`h-30 w-30 mb-4 ${action.className ?? 'text-primario'}`} />
        <h3 className='text-lg font-semibold text-texto'>{action.title}</h3>
        <p className='mt-2 text-sm text-gray-600 text-pretty'>{action.description}</p>
      </div>
      <div className='mt-6'>
        <Button color={action.btnColor ?? 'primario'} onClick={() => onClick?.(action.id)}>
          {action.cta}
        </Button>
      </div>
    </article>
  );
};

const MetricCard = ({ metric }) => (
  <div className='rounded-2xl bg-elemento p-5 shadow-md ring-1 ring-placeholder'>
    <p className='text-xs uppercase tracking-wide'>{metric.label}</p>
    <p className='mt-2 text-2xl font-semibold'>{metric.value}</p>
    <p className='text-xs font-medium text-primario'>{metric.detail}</p>
  </div>
);

export const Administrador = () => {
  const navigate = useNavigate();
  const { user, setUser } = useCurrentUser();

  const [categoriasActivas, setCategoriasActivas] = useState([]);
  const [openPanel, setOpenPanel] = useState(null);
  const [sucursalesDisponibles, setSucursalesDisponibles] = useState([]);
  const [loadingSucursales, setLoadingSucursales] = useState(true);
  const [errorSucursales, setErrorSucursales] = useState('');
  const [selectedSucursalId, setSelectedSucursalId] = useState('');

  const usuariosRef = useRef(null);
  const categoriasRef = useRef(null);
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

  const isAdmin = (sessionUser?.rol_id ?? sessionUser?.rolId) === 1;
  const empresaId = getEmpresaIdFromUser(sessionUser) ?? undefined;
  const sessionSucursalId = sessionUser?.sucursal_id ?? sessionUser?.sucursalId ?? '';
  const COLOR_CYCLE = ['text-secundario', 'text-primario', 'text-info'];

  const getFoodtruckColor = (index) => {
    return COLOR_CYCLE[index % COLOR_CYCLE.length];
  };

  useEffect(() => {
    if (!sessionUser) return;
    if (!perteneceAEmpresa(sessionUser, [EMPRESA_PUNTO_SABOR_ID])) {
      navigate('/403', { replace: true });
    }
  }, [sessionUser, navigate]);

  useEffect(() => {
    if (!isAdmin) {
      setSucursalesDisponibles([]);
      setSelectedSucursalId('');
      setErrorSucursales('');
      setLoadingSucursales(false);
      return;
    }

    let cancelled = false;
    setLoadingSucursales(true);
    setErrorSucursales('');

    (async () => {
      try {
        const list = await sucursalesRepo.list({ empresaId });
        if (!cancelled) {
          setSucursalesDisponibles(list);
        }
      } catch (err) {
        if (!cancelled) {
          setSucursalesDisponibles([]);
          setErrorSucursales(err?.message ?? 'No pudimos cargar los foodtrucks disponibles.');
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
  }, [empresaId, isAdmin]);

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

  const logout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    const map = {
      usuarios: usuariosRef,
      categorias: categoriasRef,
      productos: productosRef,
    };
    const r = openPanel ? map[openPanel]?.current : null;
    if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openPanel]);

  useEffect(() => {
    setCategoriasActivas([]);
    if (!sucursalId) {
      setOpenPanel(null);
    }
  }, [sucursalId]);

  const handleQuickAction = (id) => {
    setOpenPanel((curr) => (curr === id ? null : id));
  };

  return (
    <div className='min-h-screen bg-fondo'>
      <header className='bg-elemento shadow-md flex justify-center'>
        <div className='max-w-6xl w-full flex items-center justify-between px-4 py-3'>
          <Logo className='h-10 w-10' />
          <UserMenu user={user} onLogout={logout} />
        </div>
      </header>

      <main className='mx-auto max-w-6xl px-4 pt-10 space-y-12'>
        <EstadoEnLinea className='pt-4' />

        <div className='space-y-2'>
          <h1 className='text-2xl font-black tracking-wide'>Centro de administración</h1>
          <div className='border-b border-placeholder'></div>
          <p className='text-lg font-medium'>
            Observa las métricas generales y administra tus foodtrucks desde un mismo lugar.
          </p>
        </div>

        <section className='space-y-4'>
          <div>
            <h2 className='text-xl font-semibold text-texto'>Métricas generales</h2>
            <p className='text-gray-600'>Indicadores base para monitorear el desempeño tus foodtrucks.</p>
          </div>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {metricHighlights.map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </div>
        </section>

        <section className='space-y-6 mt-20'>
          <div>
            <h2 className='text-xl font-semibold'>Crea y selecciona tus sucursales</h2>
            <p className='text-sm text-texto-suave'>
              Primero define la sucursal a gestionar para habilitar los demás paneles.
            </p>
          </div>

          <div className='rounded-3xl bg-elemento p-6 shadow-md shadow-placeholder space-y-4'>
            <div className='flex flex-wrap items-start justify-between gap-4'>
              <div>
                <p className='text-xl font-semibold'>Selecciona el foodtruck que deseas administrar</p>
                <p className='text-sm text-texto-suave'>
                  Elige uno de tus foodtrucks para gestionar usuarios, categorías y productos.
                </p>
              </div>
            </div>

            <div className='grid gap-4 md:grid-cols-[2fr,1fr] '>
              <div>
                {loadingSucursales ? (
                  <p className='text-sm text-texto-suave'>Cargando foodtrucks disponibles...</p>
                ) : sucursalesDisponibles.length === 0 ? (
                  <p className='text-sm text-texto-suave'>Todavía no registras foodtrucks para esta empresa.</p>
                ) : (
                  <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
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
            </div>

            {errorSucursales && <p className='text-sm text-peligro'>{errorSucursales}</p>}
          </div>

          <PanelSucursales
            empresaId={empresaId}
            isAdmin={isAdmin}
            adminUser={sessionUser}
            onAdminUpdated={(updatedAdmin) => {
              if (!updatedAdmin || !setUser) return;
              setUser((prev) => {
                const next = {
                  ...(prev ?? {}),
                  ...updatedAdmin,
                  sucursales_ids: updatedAdmin.sucursales_ids ?? prev?.sucursales_ids ?? [],
                  _raw: {
                    ...(prev?._raw ?? {}),
                    ...updatedAdmin,
                  },
                };
                try {
                  localStorage.setItem('currentUser', JSON.stringify(next));
                } catch {}
                return next;
              });
            }}
            onSucursalesUpdated={async () => {
              try {
                const list = await sucursalesRepo.list({ empresaId });
                setSucursalesDisponibles(list);
              } catch (err) {
                setSucursalesDisponibles([]);
                setErrorSucursales(err?.message ?? 'No pudimos cargar los foodtrucks disponibles.');
              }
            }}
          />

          {!hasSucursalSeleccionada && (
            <div className='rounded-2xl border border-dashed border-info bg-drag/10 px-6 py-4 text-center text-sm text-texto-suave'>
              Crea o selecciona un foodtruck para obtener acceso a usuarios, categorías y productos.
            </div>
          )}
        </section>

        {hasSucursalSeleccionada && (
          <section className='space-y-12'>
            <div>
              <h2 className='text-xl font-semibold mb-4'>Acciones rápidas</h2>
              <div className='grid gap-6 md:grid-cols-3'>
                {quickActions.map((action) => (
                  <QuickActionCard key={action.id} action={action} onClick={handleQuickAction} />
                ))}
              </div>
            </div>

            <section ref={usuariosRef}>
              {openPanel === 'usuarios' && (
                <div className='mt-2'>
                  <PanelUsuarios
                    empresaId={empresaId}
                    sucursalId={sucursalId}
                    isAdmin={isAdmin}
                    onClose={() => setOpenPanel(null)}
                  />
                </div>
              )}
            </section>

            <section ref={categoriasRef}>
              {openPanel === 'categorias' && (
                <div className='mt-2'>
                  <PanelCategorias
                    sucursalId={sucursalId}
                    sucursalNombre={sucursalNombre}
                    onAvailableChange={(activas) => setCategoriasActivas(activas)}
                  />
                </div>
              )}
            </section>

            <section ref={productosRef}>
              {openPanel === 'productos' && (
                <div className='mt-2'>
                  <PanelProductos categoriasActivas={categoriasActivas} sucursalId={sucursalId} />
                </div>
              )}
            </section>
          </section>
        )}

        <PendingSyncTable />
      </main>
    </div>
  );
};
