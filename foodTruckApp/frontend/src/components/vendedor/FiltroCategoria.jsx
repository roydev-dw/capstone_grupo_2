import { useState } from 'react';

export const FiltroCategoria = ({
  categories = ['Todos', 'Bebidas', 'Comida', 'Postres'],
}) => {
  const [selected, setSelected] = useState(categories[0]);

  return (
    <div className="mb-4 flex justify-between">
      {categories.map((cat) => {
        const isActive = cat === selected;
        return (
          <button
            key={cat}
            onClick={() => setSelected(cat)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary text-white'
                : 'bg-gray-200 dark:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
};
