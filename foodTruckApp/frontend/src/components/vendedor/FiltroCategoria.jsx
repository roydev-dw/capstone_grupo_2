import { useState } from 'react';

export const FiltroCategoria = ({
  categories = ['Todos', 'Bebidas', 'Comida', 'Postres'],
}) => {
  const [selected, setSelected] = useState(categories[0]);

  return (
    <div className="mb-4 flex justify-start gap-2 overflow-x-auto">
      {categories.map((cat) => {
        const isActive = cat === selected;
        return (
          <button
            key={cat}
            onClick={() => setSelected(cat)}
            className={`
              shrink-0 px-4 py-2
              ${
                isActive
                  ? 'bg-secundario/30 border-2 border-secundario text-secundario font-semibold rounded-full'
                  : 'bg-secundario/5 border-2 border-secundario text-placeholder font-semibold rounded-full'
              }
            `}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
};
