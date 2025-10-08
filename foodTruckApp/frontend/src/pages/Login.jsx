import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/login/Logo';

export const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (email === 'ado.pezzini@gmail.com' && password === 'admin123') {
      navigate('/admin');
    } else {
      navigate('/vendedor');
    }
  };

  return (
    <>
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="w-full max-w-sm md:max-w-md lg:max-w-lg px-6">
          <div className="flex flex-col items-center mb-8">
            <div>
              <Logo />
            </div>
            <p className="text-center">
              La gestión de tu negocio, simplificada.
            </p>
          </div>

          <form
            onSubmit={handleLogin}
            className="space-y-4 bg-white px-8 py-12 rounded-xl shadow-xl"
          >
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 border bg-background border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <input
              type="password"
              name="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 border bg-background border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              className="w-full mt-10 py-3 rounded-lg text-white bg-primary font-bold shadow-lg transition-all duration-300 ease-in-out hover:bg-primary/90 hover:transform hover:scale-102"
            >
              Iniciar Sesión
            </button>
            <div className="flex justify-center pt-2">
              <a
                href="#"
                className="text-sm font-medium hover:underline text-primary"
              >
                ¿Olvidaste tu contraseña?
              </a>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};
