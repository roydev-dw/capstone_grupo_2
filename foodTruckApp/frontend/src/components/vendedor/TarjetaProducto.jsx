export const TarjetaProducto = ({ product }) => {
  return (
    <div className="group cursor-pointer ">
      <div className="w-full relative mb-2 overflow-hidden bg-purple-200 rounded-xl">
        <div
          className=" bg-cover bg-center aspect-square"
          style={{ backgroundImage: `url(${product.image})` }}
        ></div>
        <div className="absolute inset-0  opacity-0 transition-opacity group-hover:opacity-100"></div>
      </div>
      <p className="text-sm">{product.name}</p>
      <p className="text-sm">${product.price.toFixed(2)}</p>
    </div>
  );
};
