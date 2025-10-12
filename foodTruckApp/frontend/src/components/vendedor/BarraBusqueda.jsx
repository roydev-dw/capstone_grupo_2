import { RiSearchLine } from 'react-icons/ri';

export const BarraBusqueda = () => {
  return (
    <div className="relative mb-8">
      <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 text-fuente text-2xl" />
      <input
        type="text"
        placeholder="Buscar productos"
        className="w-full rounded-card py-3 pl-12 pr-4 bg-surface placeholder:text-fuente/40 focus:outline-none focus:ring-1 focus:ring-primary shadow-search"
      />
    </div>
  );
};
