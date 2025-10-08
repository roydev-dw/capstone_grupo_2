import React from 'react';
import PropTypes from 'prop-types';

export const BotonTarjeta = React.memo(function BotonTarjeta({
  cartCount = 0,
  onClick = () => {},
  colorClass = 'bg-primary hover:bg-blue-700',
}) {
  const disabled = !cartCount;

  return (
    <div className="sticky bottom-0 p-4">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={`Ver pedido, ${cartCount} ${
          cartCount === 1 ? 'artículo' : 'artículos'
        }`}
        className={[
          'flex w-full items-center justify-center gap-3 rounded-xl py-4 text-lg font-bold text-white ',
          colorClass,
          disabled ? 'opacity-60 pointer-events-none' : '',
        ].join(' ')}
      >
        <svg
          className="w-8 h-8"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
          />
        </svg>

        <span className="relative">
          Ver Pedido
          <span
            aria-hidden="true"
            className="ml-2 inline-flex items-center justify-center rounded-full bg-white/20 px-2 py-0.5 text-sm font-bold"
          >
            {cartCount}
          </span>
        </span>
      </button>
    </div>
  );
});

BotonTarjeta.propTypes = {
  cartCount: PropTypes.number.isRequired,
  onClick: PropTypes.func,
  colorClass: PropTypes.string,
};
