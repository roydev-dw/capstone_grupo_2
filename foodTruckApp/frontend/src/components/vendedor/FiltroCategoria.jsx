import { useState } from 'react';

export const FiltroCategoria = ({
  categories = ['Todos', 'Bebidas', 'Comida', 'Postres'],
}) => {
  const [selected, setSelected] = useState(categories[0]);

  return (
    <div className="mb-4 flex justify-start gap-2  ">
      {categories.map((cat) => {
        const isActive = cat === selected;
        return (
          <button
            key={cat}
            onClick={() => setSelected(cat)}
            className={`shrink-0 px-4 py-2 text-sm font-medium transition-colors ${
              isActive ? 'bg-surface text-primario font-semibold' : 'bg-focus'
            }`}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
};
