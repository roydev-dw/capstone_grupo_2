import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Logo = () => (
  <svg
    className="h-12 w-auto text-indigo-600"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13 10V3L4 14h7v7l9-11h-7z"
    />
  </svg>
);

const apiFoodTrucks = {
  post: async (endpoint, { email, password }) => {
    console.log(`Simulando llamada a API: ${endpoint}`);
    await new Promise((res) => setTimeout(res, 1000));

    return Promise.reject(
      new Error('Credenciales inválidas desde API simulada.')
    );
  },
};

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

    // INICIO BY PASS LOCAL
    // SOLUCIÓN: Usamos .trim() para eliminar espacios accidentales
    if (email.trim() === 'admin@local.com' && password.trim() === 'admin') {
      console.log('Bypass de login activado para Administrador local.');

      const fakeAdminResponse = {
        access: 'local_admin_fake_access_token',
        refresh: 'local_admin_fake_refresh_token',
        user: {
          rol: 'Administrador',
          name: 'Admin Local (Bypass)',
          id: 999,
        },
      };

      localStorage.setItem('accessToken', fakeAdminResponse.access);
      localStorage.setItem('refreshToken', fakeAdminResponse.refresh);
      localStorage.setItem('userData', JSON.stringify(fakeAdminResponse.user));

      navigate('/admin');
      setIsLoadingSesion(false);
      return;
    }

    // FIN BY PASS LOCAL

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
        if (userRole === 'Administrador') {
          navigate('/admin');
          return;
        }
        if (userRole === 'Supervisor' || userRole === 'Encargado') {
          navigate('/supervisor');
          return;
        }
        navigate('/vendedor');
        return;
      }

      setLoginErrorMensaje('Credenciales invalidas, intenta nuevamente.');
    } catch (error) {
      setLoginErrorMensaje(
        error.message ||
          'No pudimos iniciar sesion, verifica tus datos por favor.'
      );
    } finally {
      setIsLoadingSesion(false);
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
              La gestion de tu negocio, simplificada.
            </p>
          </div>

          <form
            onSubmit={handleLogin}
            className="space-y-4 bg-white px-8 py-12 rounded-xl shadow-xl"
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
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full px-4 py-3 border bg-background border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <input
              type="password"
              name="password"
              placeholder="Contrasena"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full px-4 py-3 border bg-background border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={isLoadingSesion}
              className="w-full mt-10 py-3 rounded-lg text-white bg-primary font-bold shadow-lg transition-all duration-300 ease-in-out hover:bg-primary/90 hover:transform hover:scale-102 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoadingSesion ? 'Iniciando...' : 'Iniciar Sesion'}
            </button>
            <div className="flex justify-center pt-2">
              <a
                href="#"
                className="text-sm font-medium hover:underline text-primary"
              >
                Olvidaste tu contrasena?
              </a>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

// import { useState } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { Logo } from '../components/login/Logo';
// import { apiFoodTrucks } from '../utils/api';

// export const Login = () => {
//   const navigate = useNavigate();
//   const [email, setEmail] = useState('');
//   const [password, setPassword] = useState('');
//   const [isLoadingSesion, setIsLoadingSesion] = useState(false);
//   const [loginErrorMensaje, setLoginErrorMensaje] = useState('');

//   const handleLogin = async (event) => {
//     event.preventDefault();
//     setLoginErrorMensaje('');
//     setIsLoadingSesion(true);

//     try {
//       const loginResponse = await apiFoodTrucks.post('auth/login/', {
//         email,
//         password,
//       });

//       if (loginResponse?.access) {
//         localStorage.setItem('accessToken', loginResponse.access);
//         localStorage.setItem('refreshToken', loginResponse.refresh);
//         localStorage.setItem('userData', JSON.stringify(loginResponse.user));

//         const userRole = loginResponse.user?.rol;
//         if (userRole === 'Administrador') {
//           navigate('/admin');
//           return;
//         }
//         if (userRole === 'Supervisor' || userRole === 'Encargado') {
//           navigate('/supervisor');
//           return;
//         }
//         navigate('/vendedor');
//         return;
//       }

//       setLoginErrorMensaje('Credenciales invalidas, intenta nuevamente.');
//     } catch (error) {
//       setLoginErrorMensaje(
//         error.message ||
//           'No pudimos iniciar sesion, verifica tus datos por favor.'
//       );
//     } finally {
//       setIsLoadingSesion(false);
//     }
//   };

//   return (
//     <>
//       <div className="min-h-screen flex flex-col items-center justify-center">
//         <div className="w-full max-w-sm md:max-w-md lg:max-w-lg px-6">
//           <div className="flex flex-col items-center mb-8">
//             <div>
//               <Logo />
//             </div>
//             <p className="text-center">
//               La gestion de tu negocio, simplificada.
//             </p>
//           </div>

//           <form
//             onSubmit={handleLogin}
//             className="space-y-4 bg-white px-8 py-12 rounded-xl shadow-xl"
//           >
//             {loginErrorMensaje && (
//               <p className="text-sm text-red-600 text-center font-medium">
//                 {loginErrorMensaje}
//               </p>
//             )}

//             <input
//               type="email"
//               name="email"
//               placeholder="Email"
//               value={email}
//               onChange={(event) => setEmail(event.target.value)}
//               required
//               className="w-full px-4 py-3 border bg-background border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
//             />

//             <input
//               type="password"
//               name="password"
//               placeholder="Contrasena"
//               value={password}
//               onChange={(event) => setPassword(event.target.value)}
//               required
//               className="w-full px-4 py-3 border bg-background border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
//             />
//             <button
//               type="submit"
//               disabled={isLoadingSesion}
//               className="w-full mt-10 py-3 rounded-lg text-white bg-primary font-bold shadow-lg transition-all duration-300 ease-in-out hover:bg-primary/90 hover:transform hover:scale-102 disabled:opacity-70 disabled:cursor-not-allowed"
//             >
//               {isLoadingSesion ? 'Iniciando...' : 'Iniciar Sesion'}
//             </button>
//             <div className="flex justify-center pt-2">
//               <a
//                 href="#"
//                 className="text-sm font-medium hover:underline text-primary"
//               >
//                 Olvidaste tu contrasena?
//               </a>
//             </div>
//           </form>
//         </div>
//       </div>
//     </>
//   );
// };
