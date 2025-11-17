import { useEffect, useMemo, useState } from 'react';

export const FiltroCategoria = ({ categories = ['Todos'], value, onChange }) => {
  const safeCategories = useMemo(() => (categories && categories.length ? categories : ['Todos']), [categories]);
  const defaultOption = safeCategories[0] || 'Todos';
  const [selected, setSelected] = useState(value ?? defaultOption);

  useEffect(() => {
    setSelected(value ?? defaultOption);
  }, [value, defaultOption]);

  const handleSelect = (cat) => {
    setSelected(cat);
    onChange?.(cat);
  };

  return (
    <div className='mb-4 flex justify-start gap-2 overflow-x-auto'>
      {safeCategories.map((cat) => {
        const isActive = cat === selected;
        return (
          <button
            key={cat}
            onClick={() => handleSelect(cat)}
            className={`shrink-0 rounded-full border-2 px-4 py-2 font-semibold transition ${
              isActive
                ? 'bg-secundario/30 border-secundario text-secundario'
                : 'bg-secundario/5 border-secundario text-placeholder'
            }`}>
            {cat}
          </button>
        );
      })}
    </div>
  );
};
