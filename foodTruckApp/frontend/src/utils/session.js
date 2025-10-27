// utils/session.js
export function setSession({ access_token, refresh_token, user }) {
  if (access_token) localStorage.setItem('accessToken', access_token);
  if (refresh_token) localStorage.setItem('refreshToken', refresh_token);
  if (user) {
    localStorage.setItem('userData', JSON.stringify(user));
    // alias usados por otros módulos (si los necesitas)
    localStorage.setItem(
      'auth',
      JSON.stringify({ access_token, user_id: user?.id ?? user?.usuario_id })
    );
    localStorage.setItem(
      'currentUser',
      JSON.stringify({
        id: user?.id ?? user?.usuario_id,
        nombre_completo: user?.nombre_completo,
        email: user?.email,
        sucursal_id: user?.sucursal_id,
        sucursal_nombre: user?.sucursal_nombre,
        rol_id: user?.rol_id,
        rol_nombre: user?.rol_nombre,
        avatar: user?.avatar,
      })
    );
  }
}

export function getStoredUser() {
  const raw =
    localStorage.getItem('currentUser') || localStorage.getItem('userData');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userData');
  localStorage.removeItem('auth');
  localStorage.removeItem('currentUser');
}
