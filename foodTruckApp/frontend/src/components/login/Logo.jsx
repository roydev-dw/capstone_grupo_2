export const Logo = ({ alineacion = 'justify-center' }) => {
  return (
    <div className={`flex ${alineacion} items-center w-full mb-2`}>
      <div className="relative flex flex-col items-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 200 100"
          width="200"
          height="100"
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
          className="absolute font-logo text-6xl tracking-wider"
          style={{
            top: '34%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'var(--color-elemento)',
            lineHeight: 1,
          }}
        >
          PS
        </div>
        <div className="flex flex-col items-center mt-2">
          <h1
            className="text-3xl font-black"
            style={{ color: 'var(--color-secundario)' }}
          >
            Punto Sabor
          </h1>
          <span
            style={{
              display: 'block',
              width: 48,
              height: 4,
              borderRadius: 9999,
              marginTop: 6,
              backgroundColor: 'var(--color-secundario)',
              opacity: 0.95,
            }}
          />
        </div>
      </div>
    </div>
  );
};
