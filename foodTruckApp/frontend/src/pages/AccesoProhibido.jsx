import { useNavigate } from 'react-router-dom';
export default function ForbiddenAccessPage() {
  const navigate = useNavigate();

  const goLogin = () => {
    navigate('/login', { replace: true });
  };

  return (
    <div className="bg-[#1C2127] min-h-screen flex items-center justify-center p-8 overflow-hidden">
      <div className="flex flex-col lg:flex-row items-center justify-center w-full max-w-7xl">
        {/* Columna de texto */}
        <div className="flex-shrink-0 lg:w-1/2 order-2 lg:order-1 mt-12 lg:mt-0 text-center lg:text-left">
          <h1 className="font-poppins text-white text-4xl sm:text-5xl font-medium mb-3">
            Acceso no autorizado.
          </h1>
          <p className="font-poppins text-gray-300 text-lg font-light max-w-md mx-auto lg:mx-0">
            Intentaste acceder a una pagina para la cual no tienes la
            autorizacion necesaria.
          </p>
          <button
            className="mt-8 px-8 py-3 bg-[#5BE0B3] text-[#1C2127] font-semibold text-lg rounded-lg shadow-lg hover:bg-[#6EECC1] transition duration-300"
            onClick={goLogin}
          >
            Volver al login
          </button>
        </div>

        {/* Columna de la puerta */}
        <div className="relative order-1 lg:order-2">
          <div
            className="text-center w-72 mb-4 font-varela-round text-9xl font-bold tracking-wider"
            style={{
              color: '#5BE0B3',
              textShadow: '0 0 5px #6EECC1, 0 0 15px #6EECC1, 0 0 30px #6EECC1',
            }}
          >
            403
          </div>

          <div className="h-[495px] w-[295px] rounded-t-[90px] bg-[#8594A5] flex justify-center items-center">
            <div className="h-[450px] w-[250px] rounded-t-[70px] bg-[#A0AEC0] relative">
              <div className="h-10 w-32 bg-[#1C2127] rounded-sm mx-auto mt-20 relative overflow-hidden">
                <div className="absolute top-1/2 -translate-y-1/2 h-1.5 w-4 rounded-full bg-white left-6"></div>
                <div className="absolute top-1/2 -translate-y-1/2 h-1.5 w-4 rounded-full bg-white right-6"></div>
                <div className="h-full w-full bg-[#8594A5] rounded-sm absolute right-0 top-0"></div>
              </div>
              <div className="h-[70px] w-[25px] bg-[#CBD8E6] rounded-sm absolute top-[220px] left-5"></div>
              <div className="h-2 w-12 bg-[#EBF3FC] rounded absolute top-[250px] left-10"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
