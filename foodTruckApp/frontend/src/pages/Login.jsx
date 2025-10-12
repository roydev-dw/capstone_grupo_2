import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/login/Logo';
import { apiFoodTrucks } from '../utils/api';

export const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoadingSesion, setIsLoadingSesion] = useState(false);
  const [loginErrorMensaje, setLoginErrorMensaje] = useState('');

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginErrorMensaje('');
    setIsLoadingSesion(true);

    try {
      const loginResponse = await apiFoodTrucks.post('auth/login/', {
        email,
        password,
      });

      if (loginResponse?.access) {
        localStorage.setItem('accessToken', loginResponse.access);
        localStorage.setItem('refreshToken', loginResponse.refresh);
        localStorage.setItem('userData', JSON.stringify(loginResponse.user));

        const userRole = loginResponse.user?.rol;
        if (userRole === 'Administrador') navigate('/admin');
        else navigate('/vendedor');
        return;
      }

      setLoginErrorMensaje('Credenciales inválidas, intenta nuevamente.');
    } catch (error) {
      setLoginErrorMensaje(
        error.message ||
          'No pudimos iniciar sesión, verifica tus datos por favor.'
      );
    } finally {
      setIsLoadingSesion(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-fondo px-4">
      <div className="w-full max-w-sm md:max-w-md lg:max-w-lg">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Logo />
          <p className="text-center text-texto mt-2">
            La gestión de tu negocio, simplificada.
          </p>
        </div>

        {/* Formulario */}
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
            className="w-full px-4 py-3 border border-placeholder rounded-lg bg-fondo text-texto focus:outline-none focus:ring-2 focus:ring-primario focus:border-primario transition"
          />

          <input
            type="password"
            name="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
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
