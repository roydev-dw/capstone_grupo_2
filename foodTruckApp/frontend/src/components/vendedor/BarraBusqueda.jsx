import { RiSearchLine } from 'react-icons/ri';

export const BarraBusqueda = () => {
  return (
    <div className="relative mb-8">
      <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 text-fuente text-2xl" />
      <input
        type="text"
        placeholder="Buscar productos"
        className="w-full rounded-xl py-3 pl-12 pr-4 bg-white
           placeholder:text-fuente/40 focus:outline-none focus:ring-1 focus:ring-primary shadow-[0_0_20px_1px_rgba(0,0,0,0.3)]"
      />
    </div>
  );
};
