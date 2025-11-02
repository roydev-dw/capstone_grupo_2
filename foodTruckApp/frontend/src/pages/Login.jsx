// pages/Login.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/logo/Logo';
import { apiFoodTrucks } from '../utils/api';
import { toast } from 'react-hot-toast'; // opcional si quieres mostrar mensajes

const normalizeUser = (rawUser) => {
  if (!rawUser) return null;

  const role =
    rawUser.rol || rawUser.role || rawUser.user_role || rawUser.userRol || null;

  const roleObj =
    role && typeof role === 'object' && !Array.isArray(role) ? role : null;

  const rolePrimitive =
    role && (typeof role === 'string' || typeof role === 'number')
      ? role
      : null;

  const roleIdCandidates = [
    rawUser.rol_id,
    rawUser.role_id,
    rawUser.rolId,
    rawUser.roleId,
    rawUser.rol_1d,
    rawUser.role_1d,
    rolePrimitive,
    roleObj?.id,
    roleObj?.rol_id,
    roleObj?.role_id,
    roleObj?.rolId,
    roleObj?.roleId,
    roleObj?.rol_1d,
    roleObj?.role_1d,
  ];

  const roleIdCandidate = roleIdCandidates.find(
    (value) => value !== undefined && value !== null && value !== ''
  );

  const roleId =
    roleIdCandidate !== undefined && roleIdCandidate !== null
      ? Number(roleIdCandidate)
      : null;

  const roleNameCandidates = [
    rawUser.rol_nombre,
    rawUser.role_name,
    rawUser.rolNombre,
    rawUser.roleName,
    rolePrimitive,
    roleObj?.nombre,
    roleObj?.rol_nombre,
    roleObj?.role_name,
    roleObj?.name,
    roleObj?.roleName,
    roleObj?.display_name,
  ];

  const roleName = (roleNameCandidates.find((value) => value) || '')
    .toString()
    .trim();

  return {
    id:
      rawUser.id ??
      rawUser.usuario_id ??
      rawUser.user_id ??
      rawUser.usuarioId ??
      rawUser.userId ??
      null,
    usuario_id:
      rawUser.usuario_id ??
      rawUser.id ??
      rawUser.user_id ??
      rawUser.usuarioId ??
      rawUser.userId ??
      null,
    nombre_completo:
      rawUser.nombre_completo ??
      rawUser.nombre ??
      rawUser.full_name ??
      rawUser.fullName ??
      '',
    email: (rawUser.email ?? rawUser.correo ?? '').toString().trim(),
    sucursal_id:
      rawUser.sucursal_id ??
      rawUser.branch_id ??
      rawUser.sucursalId ??
      rawUser.branchId ??
      null,
    sucursal_nombre:
      rawUser.sucursal_nombre ??
      rawUser.branch_name ??
      rawUser.sucursal ??
      rawUser.branch ??
      '',
    rol_id: Number.isNaN(roleId) ? null : roleId,
    rol_nombre: roleName,
    avatar: rawUser.avatar ?? rawUser.profile_image ?? rawUser.image ?? '',
  };
};

const pickUserResults = (res) => {
  if (!res) return [];
  if (Array.isArray(res?.data?.results)) return res.data.results;
  if (Array.isArray(res?.results)) return res.results;
  if (Array.isArray(res)) return res;
  return [];
};

const fetchUserFromApi = async ({ id, email }) => {
  try {
    const response = await apiFoodTrucks.get('v1/usuarios/');
    const list = pickUserResults(response);

    const normalizedId =
      id !== undefined && id !== null && id !== '' ? Number(id) : null;

    const matchById =
      normalizedId !== null
        ? list.find((item) => {
            const candidate =
              item.id ??
              item.usuario_id ??
              item.user_id ??
              item.usuarioId ??
              item.userId ??
              null;
            return (
              candidate !== null &&
              candidate !== undefined &&
              Number(candidate) === normalizedId
            );
          })
        : null;

    const normalizedEmail = email?.toString().trim().toLowerCase();
    const matchByEmail =
      !matchById && normalizedEmail
        ? list.find((item) => {
            const candidateEmail = (item.email ?? item.correo ?? '')
              .toString()
              .trim()
              .toLowerCase();
            return candidateEmail === normalizedEmail;
          })
        : null;

    const match = matchById || matchByEmail || null;
    return normalizeUser(match);
  } catch (error) {
    console.error('[Login.jsx] No se pudo refrescar el usuario:', error);
    return null;
  }
};

export const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoadingSesion, setIsLoadingSesion] = useState(false);
  const [loginErrorMensaje, setLoginErrorMensaje] = useState('');

  const handleLogin = async (event) => {
    event.preventDefault();
    if (isLoadingSesion) return;
    setLoginErrorMensaje('');
    setIsLoadingSesion(true);

    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userData');
    localStorage.removeItem('auth');
    localStorage.removeItem('currentUser');

    try {
      const resp = await apiFoodTrucks.post('v1/auth/login/', {
        email,
        password,
      });

      // ✅ Normalizamos las respuestas
      const access = resp?.access || resp?.access_token || resp?.data?.access;
      const refresh =
        resp?.refresh || resp?.refresh_token || resp?.data?.refresh;
      const rawUser =
        resp?.user ||
        resp?.usuario ||
        resp?.data?.user ||
        resp?.data?.usuario ||
        null;

      if (!access || !refresh) {
        throw new Error(
          resp?.detail ||
            resp?.error ||
            'El servidor no devolvió tokens de sesión.'
        );
      }

      // 🧠 Normalización del usuario según tu estructura (usuario_id, rol_nombre, etc.)

      let user = normalizeUser(rawUser);

      if (!user || !user.rol_id || !user.rol_nombre) {
        localStorage.setItem('accessToken', access);
        localStorage.setItem('refreshToken', refresh);

        const refreshedUser = await fetchUserFromApi({
          id: user?.id ?? user?.usuario_id,
          email: user?.email || rawUser?.email || email,
        });

        if (refreshedUser) {
          const baseUser = user ?? {};
          user = {
            ...baseUser,
            ...refreshedUser,
            rol_id: refreshedUser.rol_id ?? baseUser.rol_id ?? null,
            rol_nombre: refreshedUser.rol_nombre ?? baseUser.rol_nombre ?? '',
            nombre_completo:
              refreshedUser.nombre_completo ?? baseUser.nombre_completo ?? '',
            email:
              refreshedUser.email ??
              baseUser.email ??
              (rawUser?.email || email || ''),
            sucursal_id:
              refreshedUser.sucursal_id ?? baseUser.sucursal_id ?? null,
            sucursal_nombre:
              refreshedUser.sucursal_nombre ?? baseUser.sucursal_nombre ?? '',
            avatar: refreshedUser.avatar ?? baseUser.avatar ?? '',
          };
        }
      }

      // 🔥 Guardamos todo en localStorage de forma estandarizada
      localStorage.setItem('accessToken', access);
      localStorage.setItem('refreshToken', refresh);
      if (user) {
        const userDataToStore =
          rawUser && Object.keys(rawUser || {}).length > 0 ? rawUser : user;
        localStorage.setItem('userData', JSON.stringify(userDataToStore));
        localStorage.setItem(
          'auth',
          JSON.stringify({
            access_token: access,
            user_id: user.id ?? user.usuario_id,
          })
        );
        localStorage.setItem('currentUser', JSON.stringify(user));
      }

      // Mensaje visual opcional
      toast.success(`Bienvenido ${user?.nombre_completo ?? 'usuario'} 👋`);

      // 🎯 Determinar rol para redirigir: prioriza rol_nombre; respaldo por rol_id
      const roleName = (user?.rol_nombre || '').toLowerCase();
      const roleId = Number(user?.rol_id);
      let target = '/vendedor'; // default

      if (roleName === 'administrador' || roleId === 1) {
        target = '/admin';
      } else if (roleName === 'supervisor' || roleId === 3) {
        target = '/supervisor';
      }

      navigate(target);
    } catch (error) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userData');
      localStorage.removeItem('auth');
      localStorage.removeItem('currentUser');

      console.error('[Login.jsx] Error capturado:', error?.message, error);

      const msg =
        error?.message ||
        error?.data?.detail ||
        error?.data?.error ||
        'No pudimos iniciar sesión, verifica tus datos por favor.';
      setLoginErrorMensaje(msg);
    } finally {
      setIsLoadingSesion(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-fondo px-4">
      <div className="w-full max-w-sm md:max-w-md lg:max-w-lg">
        <div className="flex flex-col items-center mb-8">
          <Logo />
          <p className="text-center text-texto mt-2">
            La gestión de tu negocio, simplificada.
          </p>
        </div>
        <form
          onSubmit={handleLogin}
          className="space-y-4 bg-elemento px-8 py-12 rounded-2xl shadow-lg"
        >
          {loginErrorMensaje && (
            <p className="text-sm text-red-600 text-center font-medium">
              {loginErrorMensaje}
            </p>
          )}
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            className="w-full px-4 py-3 border border-placeholder rounded-lg bg-fondo text-texto focus:outline-none focus:ring-2 focus:ring-primario focus:border-primario transition"
          />
          <input
            type="password"
            name="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full px-4 py-3 border border-placeholder rounded-lg bg-fondo text-texto focus:outline-none focus:ring-2 focus:ring-primario focus:border-primario transition"
          />
          <button
            type="submit"
            disabled={isLoadingSesion}
            className="w-full mt-6 py-3 rounded-lg text-white bg-primario font-bold shadow-md transition-all duration-300 hover:bg-[#aa7e3f] disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoadingSesion ? 'Iniciando...' : 'Iniciar Sesión'}
          </button>
          <div className="flex justify-center pt-2">
            <a
              href="#"
              className="text-sm font-medium text-primario hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </a>
          </div>
        </form>
      </div>
    </div>
  );
};
