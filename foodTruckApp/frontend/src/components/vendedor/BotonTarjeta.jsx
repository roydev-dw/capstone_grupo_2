import { HiMiniShoppingBag } from 'react-icons/hi2';
import PropTypes from 'prop-types';

export const BotonTarjeta = ({ cartCount = 0, onClick = () => {} }) => {
  return (
    <button
      onClick={onClick}
      type="button"
      className="fixed top-12 right-14 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-primario text-white  transition-transform hover:scale-110 active:scale-95 duration-300 border-1 ring-2 ring-secundario border-white shadow-md shadow-gray-500"
      aria-label={`Ver pedido actual con ${cartCount} productos`}
    >
      <HiMiniShoppingBag className="h-8 w-8" />
      {cartCount > 0 && (
        <span className="absolute -top-4 -right-4 flex h-8 w-8 items-center justify-center rounded-full bg-secundario text-md font-bold text-white border-1 border-fondo ring-2 ring-secundario">
          {cartCount}
        </span>
      )}
    </button>
  );
};

BotonTarjeta.propTypes = {
  cartCount: PropTypes.number.isRequired,
  onClick: PropTypes.func.isRequired,
};
