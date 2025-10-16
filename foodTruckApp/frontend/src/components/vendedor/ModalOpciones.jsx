import { useState, useEffect, useRef } from 'react';

export const OpcionesModal = ({ product, onCerrar, onAgregarAlCarrito }) => {
  const [selectedOptions, setSelectedOptions] = useState({});
  const [openMenus, setOpenMenus] = useState({});
  const modalRef = useRef(null);

  useEffect(() => {
    const defaultOptions = {};
    if (product?.options) {
      product.options.forEach((option) => {
        defaultOptions[option.name] = option.choices[0];
      });
    }
    setSelectedOptions(defaultOptions);
  }, [product]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setOpenMenus({});
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleMenu = (optionName) => {
    setOpenMenus((prev) => ({
      ...Object.keys(prev).reduce((acc, key) => ({ ...acc, [key]: false }), {}),
      [optionName]: !prev[optionName],
    }));
  };

  const handleSelectOption = (optionName, choice) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [optionName]: choice,
    }));
    setOpenMenus({});
  };

  const handleAgregarClick = () => {
    const productoConOpciones = {
      ...product,
      selectedOptions: selectedOptions,
    };
    onAgregarAlCarrito(productoConOpciones);
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(value);

  if (!product) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onCerrar}
    >
      <div
        ref={modalRef}
        className="bg-fondo p-6 md:p-8 rounded-xl shadow-2xl w-full max-w-lg animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-3xl font-bold mb-6 text-texto">{product.name}</h2>
        <div className="space-y-5">
          {product.options.map((option) => (
            <div key={option.name} className="relative">
              <label className="block text-md font-semibold mb-2 text-texto/80">
                {option.name}
              </label>
              <button
                type="button"
                onClick={() => toggleMenu(option.name)}
                className="w-full p-3 bg-white border-2 border-primario rounded-lg 
                           focus:outline-none focus:ring-2 focus:ring-primario focus:border-transparent 
                           transition-all text-left flex justify-between items-center"
              >
                <span>
                  {selectedOptions[option.name]?.name}
                  {selectedOptions[option.name]?.extraPrice > 0 &&
                    ` (+${formatCurrency(
                      selectedOptions[option.name]?.extraPrice
                    )})`}
                </span>
                <svg
                  className={`w-5 h-5 transition-transform ${
                    openMenus[option.name] ? 'transform rotate-180' : ''
                  }`}
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              {openMenus[option.name] && (
                <div
                  className="absolute z-10 mt-2 w-full bg-white border-2 border-primario rounded-lg 
                             shadow-lg max-h-60 overflow-auto"
                >
                  {option.choices.map((choice) => (
                    <div
                      key={choice.name}
                      onClick={() => handleSelectOption(option.name, choice)}
                      className="p-3 hover:bg-primario/10 cursor-pointer"
                    >
                      {choice.name}
                      {choice.extraPrice > 0 &&
                        ` (+${formatCurrency(choice.extraPrice)})`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col-reverse sm:flex-row justify-end gap-3">
          <button
            type="button"
            onClick={onCerrar}
            className="w-full sm:w-auto py-3 px-6 rounded-lg font-semibold bg-muted text-texto hover:bg-muted/80 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleAgregarClick}
            className="w-full sm:w-auto py-3 px-6 rounded-lg font-semibold bg-primario text-white shadow-md hover:brightness-105 transition-all"
          >
            Agregar al Pedido
          </button>
        </div>
      </div>
    </div>
  );
};
