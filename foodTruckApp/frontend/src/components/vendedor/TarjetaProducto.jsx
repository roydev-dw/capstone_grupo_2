export const TarjetaProducto = ({ product }) => {
  return (
    <div className="group cursor-pointer">
      <div className="relative mb-2 overflow-hidden rounded-xl">
        <div
          className="w-full bg-cover bg-center pt-[100%]"
          style={{ backgroundImage: `url(${product.image})` }}
        ></div>
        <div className="absolute inset-0 bg-black/20 opacity-0 transition-opacity group-hover:opacity-100"></div>
      </div>
      <p className="font-bold text-black dark:text-white">{product.name}</p>
      <p className="text-sm text-black/60 dark:text-white/60">
        ${product.price.toFixed(2)}
      </p>
    </div>
  );
};
