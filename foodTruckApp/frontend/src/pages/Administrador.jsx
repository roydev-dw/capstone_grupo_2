// src/pages/Administrador.jsx
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

const quickActions = [
  {
    id: 'usuarios',
    title: 'Creación de usuarios',
    description: 'Da de alta supervisores, vendedores o nuevos administradores y define sus permisos.',
    cta: 'Nuevo usuario',
  },
  {
    id: 'categorias',
    title: 'Administrar categorías',
    description: 'Crea, edita, desactiva y elimina categorías de productos.',
    cta: 'Gestionar categorías',
  },
  {
    id: 'productos',
    title: 'Administrar productos',
    description: 'Crea, edita, sube imágenes y controla disponibilidad de productos.',
    cta: 'Gestionar productos',
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

const truckPerformance = [
  {
    id: 'central',
    name: 'Foodtruck Central',
    ventas: '$3.2M',
    pedidos: 482,
    trend: '+5% semanal',
  },
  {
    id: 'costanera',
    name: 'Costanera Grill',
    ventas: '$2.6M',
    pedidos: 401,
    trend: '+2% semanal',
  },
  {
    id: 'nocturno',
    name: 'Nocturno Urbano',
    ventas: '$1.8M',
    pedidos: 310,
    trend: '-1% semanal',
  },
];

const teamAssignments = [
  {
    id: 'central-team',
    truck: 'Foodtruck Central',
    supervisor: 'Ana Torres',
    colaboradores: 6,
    vacantes: 1,
  },
  {
    id: 'costanera-team',
    truck: 'Costanera Grill',
    supervisor: 'Luis Pizarro',
    colaboradores: 5,
    vacantes: 0,
  },
  {
    id: 'nocturno-team',
    truck: 'Nocturno Urbano',
    supervisor: 'Marcela Rivas',
    colaboradores: 4,
    vacantes: 2,
  },
];

const QuickActionCard = ({ action, onClick }) => (
  <article className='flex flex-col justify-between rounded-2xl bg-elemento p-6 shadow-sm ring-1 ring-black/5'>
    <div>
      <h3 className='text-lg font-semibold text-texto'>{action.title}</h3>
      <p className='mt-2 text-sm text-gray-600'>{action.description}</p>
    </div>
    <div className='mt-6'>
      <Button
        color='primario'
        onClick={() => onClick?.(action.id)}>
        {action.cta}
      </Button>
    </div>
  </article>
);

const MetricCard = ({ metric }) => (
  <div className='rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5'>
    <p className='text-xs uppercase tracking-wide text-gray-500'>{metric.label}</p>
    <p className='mt-2 text-2xl font-semibold text-texto'>{metric.value}</p>
    <p className='text-xs font-medium text-primario'>{metric.detail}</p>
  </div>
);

const TruckSummary = ({ truck }) => (
  <div className='flex items-center justify-between rounded-xl border border-gray-200 bg-elemento px-4 py-3'>
    <div>
      <p className='text-sm font-semibold text-texto'>{truck.name}</p>
      <p className='text-xs text-gray-500'>{truck.pedidos} pedidos</p>
    </div>
    <div className='text-right'>
      <p className='text-lg font-semibold text-primario'>{truck.ventas}</p>
      <span className='text-xs text-gray-600'>{truck.trend}</span>
    </div>
  </div>
);

const TeamCard = ({ team }) => (
  <div className='rounded-2xl border border-dashed border-gray-300 bg-white p-4'>
    <div className='flex items-center justify-between'>
      <div>
        <p className='text-sm font-semibold text-texto'>{team.truck}</p>
        <p className='text-xs text-gray-500'>Supervisor: {team.supervisor}</p>
      </div>
      <Button
        color='info'
        size='sm'>
        Ver equipo
      </Button>
    </div>
    <div className='mt-3 flex gap-6 text-xs text-gray-600'>
      <span>{team.colaboradores} colaboradores</span>
      <span>{team.vacantes} vacantes</span>
    </div>
  </div>
);

export const Administrador = () => {
  const navigate = useNavigate();
  const { user } = useCurrentUser();

  const [categoriasActivas, setCategoriasActivas] = useState([]);
  const [openPanel, setOpenPanel] = useState(null); // 'usuarios' | 'categorias' | 'productos' | null

  // refs para hacer scroll suave al desplegar
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
  const empresaId = sessionUser?.empresa_id ?? sessionUser?.empresaId ?? undefined;
  const sucursalId = sessionUser?.sucursal_id ?? sessionUser?.sucursalId ?? undefined;
  const sucursalNombre = sessionUser?.sucursal_nombre ?? sessionUser?.sucursalNombre ?? 'Sucursal sin asignar';

  const logout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  // scroll al abrir un panel
  useEffect(() => {
    const map = {
      usuarios: usuariosRef,
      categorias: categoriasRef,
      productos: productosRef,
    };
    const r = map[openPanel]?.current;
    if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openPanel]);

  const handleQuickAction = (id) => {
    setOpenPanel((curr) => (curr === id ? null : id));
  };

  return (
    <div className='min-h-screen bg-fondo'>
      <header className='bg-elemento shadow-md flex justify-center'>
        <div className='max-w-6xl w-full flex items-center justify-between px-4 py-3'>
          <Logo className='h-10 w-10' />
          <UserMenu
            user={user}
            onLogout={logout}
          />
        </div>
      </header>

      <main className='mx-auto max-w-6xl px-4 pt-10 space-y-12'>
        <EstadoEnLinea className='pt-4' />

        <div className=''>
          <h1 className='text-2xl font-black text-texto tracking-wide'>Controla tu operación completa</h1>
          <p className='text-lg font-medium'>
            Configura accesos, administra foodtrucks y revisa la salud de ventas desde un mismo lugar.
          </p>
        </div>

        {/* Acciones rápidas */}
        <section>
          <h2 className='text-xl font-semibold text-texto mb-4'>Acciones rápidas</h2>
          <div className='grid gap-6 md:grid-cols-3'>
            {quickActions.map((action) => (
              <QuickActionCard
                key={action.id}
                action={action}
                onClick={handleQuickAction}
              />
            ))}
          </div>
        </section>

        {/* Panel: Usuarios (colapsable) */}
        <section ref={usuariosRef}>
          {openPanel === 'usuarios' && (
            <div className='mt-2'>
              <PanelUsuarios
                empresaId={empresaId}
                sucursalId={sucursalId}
                isAdmin={isAdmin}
              />
            </div>
          )}
        </section>

        {/* Panel: Categorías (colapsable, sin tocar el componente) */}
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

        {/* Panel: Productos (colapsable, sin tocar el componente) */}
        <section ref={productosRef}>
          {openPanel === 'productos' && (
            <div className='mt-2'>
              <PanelProductos categoriasActivas={categoriasActivas} />
            </div>
          )}
        </section>

        {/* Métricas / Rendimiento */}
        <section className='grid gap-8 lg:grid-cols-2'>
          <div className='space-y-4'>
            <h2 className='text-xl font-semibold text-texto'>Métricas de ventas</h2>
            <div className='grid gap-4 sm:grid-cols-2'>
              {metricHighlights.map((metric) => (
                <MetricCard
                  key={metric.id}
                  metric={metric}
                />
              ))}
            </div>
          </div>
          <div className='space-y-4'>
            <h2 className='text-xl font-semibold text-texto'>Rendimiento por foodtruck</h2>
            <div className='space-y-3'>
              {truckPerformance.map((truck) => (
                <TruckSummary
                  key={truck.id}
                  truck={truck}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Equipos (lo mantenemos igual) */}
        <section className='space-y-4'>
          <div className='flex items-center justify-between'>
            <div>
              <h2 className='text-xl font-semibold text-texto'>Equipos por foodtruck</h2>
              <p className='text-sm text-gray-600'>Controla colaboradores activos y vacantes abiertas.</p>
            </div>
            <Button color='primario'>Administrar trabajadores</Button>
          </div>
          <div className='grid gap-4 md:grid-cols-3'>
            {teamAssignments.map((team) => (
              <div key={team.id}>
                <TeamCard team={team} />
              </div>
            ))}
          </div>
        </section>

        <PendingSyncTable />
      </main>
    </div>
  );
};
