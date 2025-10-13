export const TarjetaProducto = ({ product }) => {
  return (
    <div className="group cursor-pointer flex flex-col items-center">
      <div className="w-full mb-2 overflow-hidden rounded-2xl p-2 shadow-lg transform transition-all duration-300 hover:scale-105 hover:shadow-lg bg-primario/5 border-2 border-primario">
        <img
          src={product.image}
          alt={product.name}
          className="w-full object-cover rounded-xl"
          loading="lazy"
        />
      </div>
      <p className="text-md text-center font-semibold">{product.name}</p>
      <p className="text-lg text-center text-placeholder font-bold">
        ${product.price.toFixed(2)}
      </p>
    </div>
  );
};
