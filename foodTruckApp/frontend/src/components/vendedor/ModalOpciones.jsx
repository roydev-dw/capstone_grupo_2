import { useState } from 'react';

export const OpcionesModal = ({ product, onCerrar, onAgregarAlCarrito }) => {
  const [selectedOptions, setSelectedOptions] = useState(() => {
    const initialState = {};
    if (product.options) {
      product.options.forEach((opt) => {
        initialState[opt.name] = opt.choices[0];
      });
    }
    return initialState;
  });

  const handleOptionChange = (optionName, value) => {
    setSelectedOptions((prev) => ({ ...prev, [optionName]: value }));
  };

  const handleAgregarClick = () => {
    const productWithOptions = {
      ...product,
      selectedOptions,
    };
    onAgregarAlCarrito(productWithOptions);
    onCerrar();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-fondo p-6 rounded-2xl shadow-xl w-full max-w-md border-4 border-primario">
        <h2 className="text-2xl font-bold mb-6 pb-4 border-b-2 border-primario">
          {product.name}
        </h2>

        <div className="space-y-4">
          {product.options?.map((option) => (
            <div key={option.name}>
              <label className="block text-md font-semibold text-texto-principal mb-2">
                {option.name}
              </label>
              <select
                className="
                  appearance-none 
                  w-full py-2 px-3 
                  bg-white 
                  border-2 border-primario 
                  rounded-lg 
                  shadow-sm 
                  focus:outline-none focus:ring-2 focus:ring-primario/50
                  text-md
                  bg-[url('data:image/svg+xml;charset=UTF-8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22></polyline></svg>')] 
                  bg-no-repeat bg-right
                "
                value={selectedOptions[option.name] || ''}
                onChange={(e) =>
                  handleOptionChange(option.name, e.target.value)
                }
              >
                {option.choices.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="mt-8 pt-4 border-t-2 border-primario/20 flex justify-end space-x-4">
          <button
            onClick={onCerrar}
            className="px-6 py-2 rounded-md font-semibold bg-secundario hover:bg-secundario/80 border border-border text-fondo transition-all duration-300"
          >
            Cancelar
          </button>
          <button
            onClick={handleAgregarClick}
            className="px-6 py-2 rounded-md font-semibold bg-primario text-white shadow-md hover:brightness-105 transition-all duration-300"
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
};
