import { Logo } from '../components/login/Logo';
import { useState } from 'react';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Intentando iniciar sesión con:', { email, password });
  };

  return (
    <>
      <div className="min-h-screen flex flex-col items-center justify-center p-2">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div>
              <Logo />
            </div>
            <p className="text-center">
              La gestión de tu negocio, simplificada.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <input
              type="password"
              name="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <div className="flex justify-end pt-1 pb-4">
              <a
                href="#"
                className="text-sm font-medium hover:underline text-primary"
              >
                ¿Olvidaste tu contraseña?
              </a>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-lg text-white bg-primary font-semibold shadow-lg transition duration-150 ease-in-out hover:opacity-90"
            >
              Iniciar Sesión
            </button>
          </form>
        </div>
      </div>
    </>
  );
};
