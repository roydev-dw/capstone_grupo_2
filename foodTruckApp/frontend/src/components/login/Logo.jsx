export const Logo = () => {
  return (
    <div className="flex justify-center items-center w-full mb-8">
      <div className="relative flex flex-col items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 200 100"
          width="200"
          height="100"
          role="img"
          aria-label="ovalo"
          overflow="visible"
        >
          <ellipse
            cx="100"
            cy="50"
            rx="70"
            ry="40"
            fill="currentColor"
            className="text-primary"
            style={{
              transform: 'rotate(-12deg)',
              transformBox: 'fill-box',
              transformOrigin: 'center',
            }}
          />
        </svg>

        <div
          className="absolute text-white font-logo text-6xl"
          style={{
            top: '37%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          PS
        </div>
        <h1 className="text-3xl font-black">Punto Sabor</h1>
      </div>
    </div>
  );
};
