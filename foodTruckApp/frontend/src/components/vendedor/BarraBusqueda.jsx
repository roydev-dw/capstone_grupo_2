export const BarraBusqueda = () => {
  return (
    <div className="relative mb-4">
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-black/50 dark:text-white/50">
        search
      </span>
      <input
        type="text"
        placeholder="Buscar productos"
        className="w-full rounded-lg border-none bg-black/5 py-3 pl-10 pr-4 text-black placeholder:text-black/50 focus:ring-2 focus:ring-primary/50 dark:bg-white/5 dark:text-white dark:placeholder:text-white/50"
      />
    </div>
  );
};
