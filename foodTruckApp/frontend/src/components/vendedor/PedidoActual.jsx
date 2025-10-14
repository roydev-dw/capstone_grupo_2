/**
 * Muestra el resumen del pedido actual en una barra lateral.
 * @param {object} props
 * @param {Array} props.cart - Array de productos en el carrito.
 * @param {Function} props.onClearCart - Función para vaciar el carrito.
 * ✨ CAMBIO: Actualizamos los nombres de las props y sus descripciones.
 * @param {Function} props.onAgregarAlCarrito - Función para aumentar cantidad (recibe el item completo).
 * @param {Function} props.onRemoverDelCarrito - Función para disminuir cantidad (recibe el idItemCarrito).
 */
export const PedidoActual = ({
  cart = [],
  onClearCart = () => {},
  onAgregarAlCarrito = () => {},
  onRemoverDelCarrito = () => {},
}) => {
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

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
        w-full lg:w-full
        p-4 lg:p-8 bg-primario/5 shadow-lg lg:shadow-none
        flex flex-col justify-between border-l-2 border-l-primario z-40
      "
      aria-label="Pedido actual"
    >
      <div className="flex-1 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4 lg:mb-6">Pedido Actual</h2>

        {cart.length === 0 ? (
          <p className="text-sm text-placeholder flex-1 min-h-[120px]">
            No hay productos en el pedido.
          </p>
        ) : (
          <ul className="flex-1 space-y-4 overflow-y-auto pr-2">
            {cart.map((item) => (
              <li
                key={item.idItemCarrito}
                className="flex justify-between items-center gap-4"
                aria-live="polite"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{item.name}</p>
                  {item.selectedOptions && (
                    <div className="pl-2">
                      {Object.entries(item.selectedOptions).map(
                        ([opcion, eleccion]) => (
                          <p key={opcion} className="text-sm text-placeholder">
                            - {opcion}: {eleccion}
                          </p>
                        )
                      )}
                    </div>
                  )}

                  <p className="text-md font-semibold text-texto/60">
                    {formatCurrency(item.price)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Disminuir cantidad de ${item.name}`}
                    onClick={() => onRemoverDelCarrito(item.idItemCarrito)}
                    className="w-8 h-8 rounded-md flex items-center justify-center border-2 border-primario transition-all hover:bg-fondo disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={item.quantity <= 0}
                  >
                    <span className="text-lg">−</span>
                  </button>

                  <span className="px-2 text-lg font-bold min-w-[28px] text-center">
                    {item.quantity}
                  </span>

                  <button
                    type="button"
                    aria-label={`Aumentar cantidad de ${item.name}`}
                    onClick={() => onAgregarAlCarrito(item)}
                    className="w-8 h-8 rounded-md flex items-center justify-center bg-primario hover:bg-primario/80 text-fondo shadow-sm transition duration-300"
                  >
                    <span>+</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 lg:mt-6 border-t-2 border-primario pt-4">
        <div className="flex justify-between items-center mb-4">
          <span className="font-bold text-lg">Total</span>
          <span className="font-bold text-lg">{formatCurrency(total)}</span>
        </div>
        <button
          type="button"
          onClick={() => {}}
          className={`w-full py-3 rounded-md font-semibold mb-2 transition-all disabled:opacity-60 ${
            confirmarEnabled
              ? 'bg-primario text-white shadow-md hover:brightness-105'
              : 'bg-muted text-placeholder cursor-not-allowed'
          }`}
          disabled={!confirmarEnabled}
        >
          Confirmar Venta
        </button>
        <button
          type="button"
          onClick={onClearCart}
          className="w-full py-3 rounded-md font-semibold bg-secundario hover:bg-secundario/80  border border-border text-fondo transition duration-300"
        >
          Cancelar
        </button>
      </div>
    </aside>
  );
};
