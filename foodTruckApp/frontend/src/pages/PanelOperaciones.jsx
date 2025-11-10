import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/logo/Logo';
import { UserMenu } from '../components/sesion_usuario/UserMenu';
import { Button } from '../components/ui/Button';
import { EstadoEnLinea } from '../components/ui/EstadoEnLinea';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { normalizeRoleName } from '../utils/roles';

const ACTIONS = [
  {
    id: 'vendedor',
    title: 'Modo vendedor',
    description: 'Toma pedidos, cobra y sincroniza las ventas del punto.',
    to: '/vendedor',
    accent: 'from-[#FDEFD5] to-[#F8DFB4]',
    roles: ['vendedor', 'supervisor', 'administrador'],
  },
  {
    id: 'supervisor',
    title: 'Panel supervisor',
    description: 'Gestiona catálogos, categorías y disponibilidad.',
    to: '/supervisor',
    accent: 'from-[#EEF3E0] to-[#DCE8C4]',
    roles: ['supervisor', 'administrador'],
  },
  {
    id: 'admin',
    title: 'Administración',
    description: 'Configura sucursales, accesos y parámetros avanzados.',
    to: '/admin',
    accent: 'from-[#E5E9F4] to-[#CED5EC]',
    roles: ['administrador'],
  },
];

const ActionCard = ({ action, onSelect }) => (
  <article className='group flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-md transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg'>
    <div className={`rounded-lg bg-gradient-to-br ${action.accent} p-4`}>
      <div className='mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700'>{action.title}</div>
      <p className='text-sm text-gray-600'>{action.description}</p>
    </div>
    <div className='mt-6'>
      <Button
        color='primario'
        size='md'
        className='w-full transition hover:brightness-105'
        onClick={() => onSelect(action.to)}>
        Ir a {action.title.toLowerCase()}
      </Button>
    </div>
  </article>
);

export const PanelOperaciones = () => {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const role = normalizeRoleName(user?.rol_nombre);
  const availableActions = useMemo(() => ACTIONS.filter((action) => action.roles.includes(role)), [role]);

  const subheading =
    role === 'administrador'
      ? 'Puedes saltar entre venta en terreno, supervisión o administración general.'
      : 'Organiza operaciones, revisa catálogos o entra al modo vendedor para apoyar al equipo.';

  return (
    <div className='min-h-screen bg-fondo'>
      <header className='bg-elemento shadow-md flex justify-center'>
        <div className='max-w-6xl w-full flex items-center justify-between px-4 py-3'>
          <Logo className='h-10 w-10' />
          <UserMenu user={user} />
        </div>
      </header>

      <div className='mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-12'>
        <EstadoEnLinea className='py-2' />

        <main className='flex flex-1 flex-col pt-10'>
          <div className='border-b border-gray-300 pb-2'>
            <h2 className='text-2xl font-black tracking-wide'>Centro de operaciones</h2>
            <p className='text-lg font-medium '>Accesos rápidos según tu perfil</p>
          </div>
          <div className='pt-2 mb-20'>
            <p className='text-gray-500'>{subheading}</p>
          </div>

          <div className='grid gap-6 md:grid-cols-2'>
            {' '}
            {availableActions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                onSelect={(path) => navigate(path)}
              />
            ))}{' '}
            {availableActions.length === 0 && (
              <div className='rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600'>
                {' '}
                Aún no tienes accesos configurados para este panel.{' '}
              </div>
            )}{' '}
          </div>
        </main>
      </div>
    </div>
  );
};
