import PropTypes from 'prop-types';

export const BotonTarjeta = ({ cartCount, onClick }) => {
  return (
    <div className="sticky bottom-0 bg-white/80 p-4 backdrop-blur-sm dark:bg-gray-900/80">
      <button
        onClick={onClick}
        className="flex w-full items-center justify-center gap-3 rounded-xl bg-blue-600 py-4 text-lg font-bold text-white hover:bg-blue-700 transition-colors"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
          />
        </svg>
        <span>Ver Pedido ({cartCount})</span>
      </button>
    </div>
  );
};

BotonTarjeta.propTypes = {
  cartCount: PropTypes.number.isRequired,
  onClick: PropTypes.func,
};
