export const Logo = ({ alineacion = 'justify-center' }) => {
  return (
    <div className={`flex ${alineacion} items-center mb-2`}>
      <div className="relative flex flex-col items-center">
        <div className="relative w-32 lg:w-48">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 200 100"
            role="img"
            aria-label="ovalo"
            overflow="visible"
            style={{ color: 'var(--color-primario)' }}
          >
            <ellipse
              cx="100"
              cy="50"
              rx="70"
              ry="40"
              fill="var(--color-primario)"
              style={{
                transform: 'rotate(-12deg)',
                transformBox: 'fill-box',
                transformOrigin: 'center',
                filter: 'drop-shadow(4px 4px 6px rgba(0,0,0,0.12))',
              }}
            />
            <ellipse
              cx="100"
              cy="50"
              rx="72"
              ry="42"
              fill="none"
              stroke="var(--color-secundario)"
              strokeWidth="2"
              style={{
                transform: 'rotate(-12deg)',
                transformBox: 'fill-box',
                transformOrigin: 'center',
                opacity: 0.95,
              }}
            />
          </svg>
          <div
            className="absolute font-logo text-4xl lg:text-6xl tracking-wider"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'var(--color-elemento)',
              lineHeight: 1,
            }}
          >
            PS
          </div>
        </div>

        <div className="flex flex-col items-center mt-1 lg:mt-3">
          <h1
            className="text-xl lg:text-3xl font-black"
            style={{ color: 'var(--color-secundario)' }}
          >
            Punto Sabor
          </h1>
          <span
            className="w-8 lg:w-12 h-1 rounded-full mt-1.5 opacity-95 hidden lg:block"
            style={{ backgroundColor: 'var(--color-secundario)' }}
          />
        </div>
      </div>
    </div>
  );
};
