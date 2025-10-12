export const TarjetaProducto = ({ product }) => {
  return (
    <div className="group cursor-pointer flex flex-col items-center ">
      <div
        className="w-full mb-2 overflow-hidden rounded-2xl p-2 transform transition-all duration-300 hover:scale-105 hover:shadow-lg"
        style={{
          backgroundColor: 'rgba(123, 140, 91, 0.15)',
          border: '2px solid var(--color-primario)',
        }}
      >
        <div
          className="w-full aspect-square bg-cover bg-center rounded-xl"
          style={{ backgroundImage: `url(${product.image})` }}
        ></div>
      </div>

      <p className="text-sm mb-1 text-center text-secundario">{product.name}</p>
      <p className="text-sm text-center text-primario">
        ${product.price.toFixed(2)}
      </p>
    </div>
  );
};
