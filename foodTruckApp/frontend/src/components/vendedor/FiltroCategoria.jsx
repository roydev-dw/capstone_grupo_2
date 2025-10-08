const categories = ['Todos', 'Bebidas', 'Comida', 'Postres'];

export const FiltroCategoria = () => {
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
      {categories.map((cat, idx) => (
        <button
          key={idx}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
            idx === 0
              ? 'bg-primary text-black font-bold'
              : 'bg-black/10 text-black dark:bg-white/10 dark:text-white'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
};
