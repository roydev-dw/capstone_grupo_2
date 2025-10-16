export const TarjetaProducto = ({ product }) => {
  return (
    <div className="group cursor-pointer flex flex-col items-start">
      <div className="w-full mb-2 overflow-hidden rounded-2xl shadow-lg transform transition-all duration-300 hover:scale-105 hover:shadow-lg bg-primario/5 border-4 border-secundario">
        <img
          src={product.image}
          alt={product.name}
          className="w-full aspect-square object-cover rounded-xl"
          loading="lazy"
        />
      </div>
      <p className="text-sm lg:text-md 2xl:text-lg">{product.name}</p>
      <p className="text-md font-semibold">${product.price.toFixed(2)}</p>
    </div>
  );
};
