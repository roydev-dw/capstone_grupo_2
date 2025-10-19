import { HiXMark } from 'react-icons/hi2';
import { FaEdit } from 'react-icons/fa';
import { IoTrash } from 'react-icons/io5';

export const PedidoActual = ({
  cart = [],
  onClearCart = () => {},
  onAgregarAlCarrito = () => {},
  onRemoverDelCarrito = () => {},
  onEditarItem = () => {},
  onEliminarItem = () => {},
  onClose,
}) => {
  const subtotal = cart.reduce(
    (sum, item) => sum + item.precioFinalUnitario * item.quantity,
    0
  );

  let IVA = 0.19;
  const impuesto = subtotal * IVA;
  const totalPagar = subtotal + impuesto;

  const formatCurrency = (value) =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(value);

  const confirmarEnabled = cart.length > 0;

  return (
    <aside
      className="
        h-screen sticky top-0
        w-full 
        p-4 lg:p-8 bg-fondo lg:bg-primario/5 shadow-lg lg:shadow-none
        flex flex-col justify-between border-l-2 border-l-primario
      "
      aria-label="Pedido actual"
    >
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex justify-between items-center mb-4 lg:mb-6">
          <h2 className="text-lg font-bold">Pedido Actual</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-black/10 lg:hidden"
              aria-label="Cerrar pedido"
            >
              <HiXMark className="h-6 w-6" />
            </button>
          )}
        </div>

        {cart.length === 0 ? (
          <p className="text-placeholder flex-1 min-h-[120px]">
            No hay productos en el pedido.
          </p>
        ) : (
          <ul className="flex-1 space-y-2 overflow-y-auto pr-2">
            {cart.map((item) => {
              const extrasTotal = item.selectedOptions
                ? Object.values(item.selectedOptions).reduce(
                    (sum, eleccion) => sum + eleccion.extraPrice,
                    0
                  )
                : 0;

              const basePrice = item.precioFinalUnitario - extrasTotal;
              const itemSubtotal = item.precioFinalUnitario * item.quantity;

              return (
                <li
                  key={item.idItemCarrito}
                  className="flex justify-between items-center gap-3 py-3 border-b border-gray-200"
                  aria-live="polite"
                >
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    <p className="font-medium text-pretty truncate">
                      {item.name}
                    </p>

                    {item.selectedOptions && (
                      <div className="pl-2">
                        {Object.entries(item.selectedOptions).map(
                          ([opcion, eleccion]) => (
                            <p
                              key={opcion}
                              className="text-placeholder text-sm"
                            >
                              - {eleccion.name}{' '}
                              {typeof eleccion.extraPrice === 'number' && (
                                <span className="text-texto/50">
                                  (+{formatCurrency(eleccion.extraPrice)})
                                </span>
                              )}
                            </p>
                          )
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <div className="flex items-center gap-1 border border-gray-300 rounded-md">
                        <button
                          type="button"
                          aria-label={`Disminuir cantidad de ${item.name}`}
                          onClick={() =>
                            onRemoverDelCarrito(item.idItemCarrito)
                          }
                          className="px-2 py-0.5 rounded-l-md hover:bg-gray-100"
                          disabled={item.quantity <= 1}
                        >
                          <span className="text-lg">−</span>
                        </button>
                        <span className="px-2 text-sm font-bold min-w-[28px] text-center">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`Aumentar cantidad de ${item.name}`}
                          onClick={() =>
                            onAgregarAlCarrito({ ...item, quantity: 1 })
                          }
                          className="px-2 py-0.5 rounded-r-md hover:bg-gray-100"
                        >
                          <span className="text-lg">+</span>
                        </button>
                      </div>

                      {item.selectedOptions && (
                        <button
                          type="button"
                          onClick={() => onEditarItem(item.idItemCarrito)}
                          className="p-2 rounded-full text-primario hover:scale-150 transition duration-200 ease-in-out"
                          aria-label={`Editar opciones de ${item.name}`}
                        >
                          <FaEdit className="h-6 w-6" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onEliminarItem(item.idItemCarrito)}
                        className="p-2 rounded-full text-secundario hover:scale-150 transition duration-200 ease-in-out"
                        aria-label={`Eliminar ${item.name} del pedido`}
                      >
                        <IoTrash className="h-6 w-6" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col items-end text-right flex-shrink-0 w-[90px] lg:w-[100px]">
                    <p
                      className="text-sm text-texto/70"
                      title="Precio unitario"
                    >
                      {formatCurrency(basePrice)}
                    </p>

                    {item.selectedOptions &&
                      Object.entries(item.selectedOptions).map(
                        ([opcion, eleccion]) =>
                          typeof eleccion.extraPrice === 'number' && (
                            <p
                              key={opcion}
                              className="text-sm text-texto/70"
                              title={`Extra: ${eleccion.name}`}
                            >
                              + {formatCurrency(eleccion.extraPrice)}
                            </p>
                          )
                      )}

                    <p className="font-bold mt-1" title="Subtotal item">
                      {formatCurrency(itemSubtotal)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 lg:mt-6 border-t-2 border-primario pt-4">
        <div className="space-y-1 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-md">Subtotal</span>
            <span className="text-md">{formatCurrency(subtotal)}</span>
          </div>

          <div className="flex justify-between items-center text-placeholder">
            <span className="text-sm">IVA (19%)</span>
            <span className="text-sm">{formatCurrency(impuesto)}</span>
          </div>

          <div className="flex justify-between items-center mt-2 pt-2 border-t border-dashed">
            <span className="font-bold text-lg">Total a Pagar</span>
            <span className="font-bold text-lg">
              {formatCurrency(totalPagar)}
            </span>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            type="button"
            onClick={onClearCart}
            className="flex-1 py-3 rounded-md font-semibold bg-secundario hover:bg-secundario/80 border border-border text-fondo transition duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={!confirmarEnabled}
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={() => {}}
            className="flex-1 py-3 rounded-md font-semibold transition-all bg-primario text-white shadow-md hover:brightness-105 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={!confirmarEnabled}
          >
            Pagar
          </button>
        </div>
      </div>
    </aside>
  );
};
